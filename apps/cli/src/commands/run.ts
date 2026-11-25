// Lệnh `vcs run <dir>` — @vcs/cli (M0 §8.1).
// Headless bằng `orchestrator.runSteps/runUntil`; in giá trị cuối các tag,
// `--csv` ghi chuỗi thay đổi theo bước (qua subscriber), `--hash` in
// `TraceHasher.hash()`. Không có controller đăng ký → cảnh báo `SIM-W001`
// nhưng vẫn chạy (đồng hồ tăng). Exit: 0 ok, 2 project không hợp lệ,
// 3 sai tham số/thiếu thư mục (OQ-027).

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { TraceHasher, createSimulation, isIntrospectable } from '@vcs/kernel';
import type { TagChange } from '@vcs/kernel';
import { loadProject, nodeFS } from '@vcs/project';
import { formatDiagnostic, hasErrors, parseDuration, type TagValue } from '@vcs/schemas';
import { loadPlcProgram, plcExtension, startPlcControllers } from '@vcs/server';
import { CLI_EXTENSIONS } from '../extensions.js';

export interface RunOptions {
  steps?: string;
  until?: string;
  stepMs?: string;
  watch?: string;
  csv?: string;
  hash?: boolean;
  json?: boolean;
  /** P1.7 (OQ-203): chạy tới khi SoftPlc đủ N scan (đếm scanCount). */
  scans?: string;
}

export async function runCommand(dir: string | undefined, opts?: RunOptions): Promise<number> {
  if (dir === undefined || dir === '') {
    console.error('vcs run: thiếu <dir> — dùng: vcs run <dir> [--steps N | --until 5s] [...]');
    return 3;
  }
  if (!(await isDirectory(dir))) {
    console.error(`vcs run: không tìm thấy thư mục '${dir}'`);
    return 3;
  }
  const parsed = parseRunOptions(opts);
  if (parsed === undefined) return 3;
  const model = await loadProject(nodeFS(dir));
  if (hasErrors(model.diagnostics)) {
    for (const d of model.diagnostics) console.log(formatDiagnostic(d));
    return 2;
  }
  // `--step-ms` ghi đè stepMs của project đã nạp (createSimulation không có
  // tham số stepMs riêng; plcScanMs giữ nguyên).
  if (parsed.stepMs !== undefined) {
    model.config.simulation.stepMs = parsed.stepMs;
  }
  // P1.7: project có plc/ → nạp SoftPlc (OQ-217: lỗi biên dịch → exit 2).
  const plc = await loadPlcProgram(dir, model.catalog.all());
  if (plc !== null && hasErrors(plc.diagnostics)) {
    for (const d of plc.diagnostics) console.log(formatDiagnostic(d));
    return 2;
  }
  const bundle = await createSimulation(model, {
    extensions:
      plc !== null ? [...CLI_EXTENSIONS, plcExtension(plc.program)] : [...CLI_EXTENSIONS],
  });
  for (const d of bundle.diagnostics) console.log(formatDiagnostic(d));
  // P1.7: PLC nạp ở STOP — start trước khi chạy (no-op nếu không có PLC).
  startPlcControllers(bundle);
  const hasher = new TraceHasher(bundle.sim.tags);
  const csvRows: TagChange[] = [];
  if (parsed.csv !== undefined) {
    bundle.sim.tags.subscribe('*', (batch) => {
      csvRows.push(...batch);
    });
  }
  let scanCount: number | undefined;
  if (parsed.scans !== undefined) {
    const r = runUntilScans(bundle, parsed.scans);
    if (r.error !== undefined) return r.error === 'no-plc' ? 3 : 2;
    scanCount = r.scans;
  } else if (parsed.steps !== undefined) {
    bundle.sim.runSteps(parsed.steps);
  } else {
    bundle.sim.runUntil(parsed.until as number);
  }
  const hash = hasher.hash();
  if (parsed.csv !== undefined) {
    await writeCsv(parsed.csv, csvRows);
  }
  const selected = selectTags(bundle, parsed.watch);
  if (selected === undefined) return 3;
  if (opts?.json === true) {
    const tags: Record<string, TagValue> = {};
    for (const name of selected) tags[name] = bundle.sim.tags.read(name).value;
    console.log(
      JSON.stringify(
        {
          name: model.config.name,
          simTimeMs: bundle.sim.simTimeMs,
          stepCount: bundle.sim.stepCount,
          ...(scanCount !== undefined ? { scans: scanCount } : {}),
          ...(parsed.hash === true ? { hash } : {}),
          tags,
        },
        null,
        2,
      ),
    );
  } else {
    if (selected.length <= 50) {
      for (const name of selected) {
        console.log(`${name} = ${formatTagValue(bundle.sim.tags.read(name).value)}`);
      }
    } else {
      console.log(
        `${String(selected.length)} tags — dùng --watch TAG,... để xem giá trị (mặc định chỉ in khi ≤ 50 tag).`,
      );
    }
    if (parsed.hash === true) console.log(`hash: ${hash}`);
    if (scanCount !== undefined) console.log(`scans: ${String(scanCount)}`);
  }
  return 0;
}

interface ParsedRunOptions {
  steps?: number;
  until?: number;
  stepMs?: number;
  watch?: string;
  csv?: string;
  hash?: boolean;
  scans?: number;
}

/** Sai tham số → in lỗi + trả `undefined` (caller exit 3). */
function parseRunOptions(opts?: RunOptions): ParsedRunOptions | undefined {
  const o: RunOptions = opts ?? {};
  const out: ParsedRunOptions = {};
  if (o.steps !== undefined && o.until !== undefined) {
    console.error('vcs run: chỉ cho một trong --steps và --until');
    return undefined;
  }
  if (o.scans !== undefined && (o.steps !== undefined || o.until !== undefined)) {
    console.error('vcs run: --scans không dùng cùng --steps/--until');
    return undefined;
  }
  if (o.steps === undefined && o.until === undefined && o.scans === undefined) {
    // OQ-027: không có --steps/--until → exit 3, không mặc định ngầm.
    console.error('vcs run: thiếu --steps N hoặc --until <duration> (vd --until 5s)');
    return undefined;
  }
  if (o.scans !== undefined) {
    if (!/^\d+$/.test(o.scans) || Number.parseInt(o.scans, 10) < 1) {
      console.error(`vcs run: --scans phải là số nguyên ≥ 1, nhận '${o.scans}'`);
      return undefined;
    }
    out.scans = Number.parseInt(o.scans, 10);
  }
  if (o.steps !== undefined) {
    if (!/^\d+$/.test(o.steps)) {
      console.error(`vcs run: --steps phải là số nguyên ≥ 0, nhận '${o.steps}'`);
      return undefined;
    }
    out.steps = Number.parseInt(o.steps, 10);
  }
  if (o.until !== undefined) {
    try {
      out.until = parseDuration(o.until);
    } catch {
      console.error(`vcs run: --until không hợp lệ: '${o.until}' (vd 5s, 1m30s)`);
      return undefined;
    }
  }
  if (o.stepMs !== undefined) {
    if (!/^\d+$/.test(o.stepMs) || Number.parseInt(o.stepMs, 10) < 1) {
      console.error(`vcs run: --step-ms phải là số nguyên ≥ 1, nhận '${o.stepMs}'`);
      return undefined;
    }
    out.stepMs = Number.parseInt(o.stepMs, 10);
  }
  if (o.watch !== undefined) out.watch = o.watch;
  if (o.csv !== undefined) out.csv = o.csv;
  if (o.hash === true) out.hash = true;
  return out;
}

/** P1.7 (OQ-203): chạy từng bước cho tới khi SoftPlc đủ N scan.
 * `no-plc` → caller exit 3; `cap` → caller exit 2 (không bao giờ treo). */
function runUntilScans(
  bundle: Awaited<ReturnType<typeof createSimulation>>,
  target: number,
): { scans: number; error?: undefined } | { scans?: undefined; error: 'no-plc' | 'cap' } {
  const plc = bundle.controllers.find((c) => isIntrospectable(c));
  if (plc === undefined) {
    console.error('vcs run: --scans cần project có plc/ (không tìm thấy PLC)');
    return { error: 'no-plc' };
  }
  const maxSteps = target * 1000 + 1000;
  let steps = 0;
  while (plc.getDiagnostics().scanCount < target) {
    if (steps >= maxSteps) {
      console.error(
        `vcs run: --scans ${String(target)} không đạt sau ${String(maxSteps)} bước (scanPeriodMs lớn hơn stepMs quá nhiều?)`,
      );
      return { error: 'cap' };
    }
    bundle.sim.runSteps(1);
    steps++;
  }
  return { scans: plc.getDiagnostics().scanCount };
}

/** Tag cần in: `--watch` (tên phải tồn tại) hoặc toàn bộ tag I/Q. */
function selectTags(
  bundle: Awaited<ReturnType<typeof createSimulation>>,
  watch: string | undefined,
): string[] | undefined {
  if (watch === undefined) return [...bundle.sim.tags.names()];
  const names = watch
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n !== '');
  for (const name of names) {
    if (!bundle.sim.tags.has(name)) {
      console.error(`vcs run: --watch: tag '${name}' không tồn tại trong dự án`);
      return undefined;
    }
  }
  return names;
}

function formatTagValue(v: TagValue): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number' && Number.isNaN(v)) return 'NaN';
  return String(v);
}

function csvValue(v: TagValue): string {
  const text = formatTagValue(v);
  return text.includes(',') || text.includes('"') || text.includes('\n')
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

/** Header `T,name,oldValue,newValue,source,writes`, một dòng mỗi TagChange (OQ-027). */
async function writeCsv(path: string, rows: readonly TagChange[]): Promise<void> {
  const lines = ['T,name,oldValue,newValue,source,writes'];
  for (const c of rows) {
    lines.push(
      [
        String(c.ts),
        c.name,
        csvValue(c.oldValue),
        csvValue(c.newValue),
        c.source,
        String(c.writes),
      ].join(','),
    );
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${lines.join('\n')}\n`, 'utf8');
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
