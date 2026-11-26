// Bench PlantEngine — M2 §12 (P2.3, OQ-296). Chạy: `pnpm bench` (bước thứ 4,
// sau softplc). Ngưỡng (không hạ): 500 thiết bị hỗn hợp (mix ×10 fixture
// §11.3), bước 10 ms, ≥ 5000 bước/s; heap tăng < 1 MB sau 100 000 bước.
// Đo có warm-up, lấy trung vị. Kết quả hợp nhất vào `bench/results.json`
// (file sinh tự động, không commit — baseline ở P0.7). Exit ≠ 0 khi FAIL
// (CI bench job chạy script này).
// Engine-alone: chỉ `engine.step`, không `tags.flush()` (flush là việc của
// TagDB, đo riêng ở tagdb.bench.ts; dirty list của TagDB chặn trùng theo
// handle nên không tăng bộ nhớ khi không flush).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ManualClock, TagDB, type TagHandle } from '@vcs/kernel';
import {
  PlantEngine,
  analogSensorModel,
  conveyorSimpleModel,
  engToRaw,
  motorDolModel,
  motorVfdModel,
  siloBinModel,
  switchDiModel,
  valveCtrlModel,
  valveOnoffModel,
  type EquipmentModel,
  type PlantConfig,
} from '@vcs/plant';
import type { SourceSpec, TagDef } from '@vcs/schemas';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'bench', 'results.json');

const STEP_MS = 10;
const THRESHOLD_STEPS_PER_SEC = 5000;
const HEAP_LIMIT_MB = 1;
const HEAP_STEPS = 100000;
const SAMPLE_STEPS = 2000;
const SAMPLES = 5;
const WARMUP_STEPS = 200;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

function gcOrThrow(): () => void {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc === undefined) {
    throw new Error('bench cần --expose-gc (script "bench" đã đặt NODE_OPTIONS).');
  }
  return gc;
}

interface MixEntry {
  model: EquipmentModel;
  prefix: string;
  count: number;
  /** Params theo thiết bị (nhận index) — mặc định model khi không cho. */
  params?: (i: number) => Record<string, unknown>;
  source?: SourceSpec;
  sources?: Record<string, SourceSpec>;
  /** Lệnh PLC ban đầu: DO → true, AO → giá trị eng (đổi sang raw theo scaling). */
  cmds?: Record<string, boolean | number>;
}

const SWITCH_KINDS = ['level_high', 'level_low', 'zero_speed', 'pull_cord', 'limit', 'generic'] as const;

/** Mix ×10 fixture §11.3 (50 → 500 thiết bị). */
const MIX: MixEntry[] = [
  { model: motorDolModel, prefix: 'M', count: 80, cmds: { runCmd: true } },
  { model: motorVfdModel, prefix: 'VFD', count: 40, cmds: { runCmd: true, speedRef: 50 } },
  { model: valveOnoffModel, prefix: 'V', count: 60, cmds: { openCmd: true } },
  { model: valveCtrlModel, prefix: 'VC', count: 30, cmds: { posRef: 50 } },
  {
    model: analogSensorModel,
    prefix: 'TT',
    count: 140,
    params: () => ({ engMin: 0, engMax: 100, unit: '%' }),
    source: { kind: 'const', value: 50 },
  },
  {
    model: switchDiModel,
    prefix: 'LS',
    count: 100,
    params: (i) => ({ kind: SWITCH_KINDS[i % SWITCH_KINDS.length] }),
    source: { kind: 'const', value: true },
  },
  {
    model: siloBinModel,
    prefix: 'SIL',
    count: 30,
    sources: {
      inflow: { kind: 'const', value: 3600 },
      outflow: { kind: 'const', value: 1800 },
    },
  },
  {
    model: conveyorSimpleModel,
    prefix: 'CV',
    count: 20,
    params: () => ({ loadTph: 100 }),
    cmds: { runCmd: true },
  },
];

/** Bộ đếm địa chỉ: Bool theo bit, Int theo word (riêng từng area). */
interface AddrCounters {
  iBit: number;
  qBit: number;
  iWord: number;
  qWord: number;
}

function nextAddress(roleKind: string, dataType: string, c: AddrCounters): string {
  if (dataType === 'Bool') {
    if (roleKind === 'DI') {
      const n = c.iBit;
      c.iBit += 1;
      return `%I${String(Math.floor(n / 8))}.${String(n % 8)}`;
    }
    const n = c.qBit;
    c.qBit += 1;
    return `%Q${String(Math.floor(n / 8))}.${String(n % 8)}`;
  }
  if (roleKind === 'AI') {
    const n = c.iWord;
    c.iWord += 2;
    return `%IW${String(n)}`;
  }
  const n = c.qWord;
  c.qWord += 2;
  return `%QW${String(n)}`;
}

interface BuiltPlant {
  engine: PlantEngine;
  tags: TagDB;
  /** Ghi lệnh PLC ban đầu sau khi dựng engine: {handle, giá trị raw/bool}. */
  cmdWrites: Array<{ h: TagHandle; v: boolean | number }>;
}

function buildPlant(): BuiltPlant {
  const defs: TagDef[] = [];
  const equipment: PlantConfig['equipment'] = [];
  const cmdWrites: Array<{ h: TagHandle; v: boolean | number }> = [];
  const counters: AddrCounters = { iBit: 0, qBit: 0, iWord: 0, qWord: 0 };
  for (const entry of MIX) {
    for (let i = 0; i < entry.count; i++) {
      const id = `${entry.prefix}${String(i + 1).padStart(2, '0')}`;
      const signals: Record<string, string> = {};
      for (const role of entry.model.roles) {
        const tagName = `${id}_${role.role.toUpperCase()}`;
        const area = role.kind === 'DI' || role.kind === 'AI' ? 'I' : 'Q';
        const def: TagDef = {
          name: tagName,
          type: role.dataType,
          area,
          address: nextAddress(role.kind, role.dataType, counters),
          controller: 'PLC1',
          signal: {
            kind: role.kind,
            ...(role.dataType === 'Int' && (role.kind === 'AI' || role.kind === 'AO')
              ? {
                  scaling: {
                    rawMin: 0,
                    rawMax: 27648,
                    engMin: 0,
                    engMax: 100,
                    unit: role.unit ?? '%',
                  },
                }
              : {}),
          },
        };
        defs.push(def);
        signals[role.role] = tagName;
      }
      equipment.push({
        id,
        model: entry.model.type,
        ...(entry.params !== undefined ? { params: entry.params(i) } : {}),
        signals,
        ...(entry.source !== undefined ? { source: entry.source } : {}),
        ...(entry.sources !== undefined ? { sources: entry.sources } : {}),
      });
    }
  }
  const clock = new ManualClock();
  const tags = new TagDB(defs, clock);
  const defMap = new Map(defs.map((d) => [d.name, d]));
  for (const entry of MIX) {
    for (let i = 0; i < entry.count; i++) {
      const id = `${entry.prefix}${String(i + 1).padStart(2, '0')}`;
      for (const [role, v] of Object.entries(entry.cmds ?? {})) {
        const tagName = `${id}_${role.toUpperCase()}`;
        const h = tags.handle(tagName);
        if (h === undefined) throw new Error(`bench plant: tag ${tagName} không tồn tại.`);
        if (typeof v === 'boolean') {
          cmdWrites.push({ h, v });
        } else {
          const scaling = defMap.get(tagName)?.signal?.scaling;
          if (scaling === undefined) throw new Error(`bench plant: tag ${tagName} thiếu scaling.`);
          cmdWrites.push({
            h,
            v: engToRaw(v, {
              rawMin: scaling.rawMin,
              rawMax: scaling.rawMax,
              engMin: scaling.engMin,
              engMax: scaling.engMax,
            }),
          });
        }
      }
    }
  }
  const cfg: PlantConfig = {
    stepMs: STEP_MS,
    seed: 42,
    equipment,
    tags: defMap,
  };
  const engine = new PlantEngine(cfg, tags);
  return { engine, tags, cmdWrites };
}

function main(): void {
  const { engine, tags, cmdWrites } = buildPlant();
  for (const { h, v } of cmdWrites) tags.set(h, v, 'plc');
  let t = 0;
  // Warm-up: 200 bước (JIT + khởi tạo delay line conveyor, lag...).
  for (let i = 0; i < WARMUP_STEPS; i++) {
    t += STEP_MS;
    engine.step(t, STEP_MS);
  }
  const samples: number[] = [];
  for (let r = 0; r < SAMPLES; r++) {
    const t0 = performance.now();
    for (let i = 0; i < SAMPLE_STEPS; i++) {
      t += STEP_MS;
      engine.step(t, STEP_MS);
    }
    samples.push(SAMPLE_STEPS / ((performance.now() - t0) / 1000));
  }
  const stepsPerSec = median(samples);
  const pass = stepsPerSec >= THRESHOLD_STEPS_PER_SEC;

  // Heap: 100 000 bước sau gc, tăng < 1 MB.
  const gc = gcOrThrow();
  gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < HEAP_STEPS; i++) {
    t += STEP_MS;
    engine.step(t, STEP_MS);
  }
  gc();
  const heapMB = (process.memoryUsage().heapUsed - before) / (1024 * 1024);
  const heapPass = heapMB < HEAP_LIMIT_MB;

  console.log('bench plant (M2 §12) — 500 thiết bị hỗn hợp (mix ×10 fixture §11.3), bước 10 ms, trung vị:');
  console.log(
    `  steps: ${Math.round(stepsPerSec).toLocaleString('en-US')} bước/s ` +
      `(ngưỡng ≥ ${THRESHOLD_STEPS_PER_SEC.toLocaleString('en-US')}) ${pass ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `  heap: +${heapMB.toFixed(2)} MB / ${HEAP_STEPS.toLocaleString('en-US')} bước ` +
      `(ngưỡng < ${String(HEAP_LIMIT_MB)} MB) ${heapPass ? 'PASS' : 'FAIL'}`,
  );

  let prev: Record<string, unknown> = {};
  if (existsSync(OUT)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(OUT, 'utf8'));
      if (typeof parsed === 'object' && parsed !== null) prev = parsed as Record<string, unknown>;
    } catch {
      prev = {};
    }
  }
  const merged = {
    ...prev,
    thresholds: {
      ...((prev['thresholds'] as Record<string, unknown> | undefined) ?? {}),
      plantStepsPerSec: THRESHOLD_STEPS_PER_SEC,
      plantHeapMB: HEAP_LIMIT_MB,
    },
    results: {
      ...((prev['results'] as Record<string, unknown> | undefined) ?? {}),
      plantStepsPerSec: Math.round(stepsPerSec),
      plantHeapIncreaseMB: Number(heapMB.toFixed(3)),
    },
    pass: {
      ...((prev['pass'] as Record<string, unknown> | undefined) ?? {}),
      plant: pass && heapPass,
    },
  };
  writeFileSync(OUT, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  if (!pass || !heapPass) {
    process.exitCode = 1;
  }
}

main();
