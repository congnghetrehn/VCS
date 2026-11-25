// Bench SoftPlc — M1 §12.4 (P1.7). Chạy: `pnpm bench` (chạy sau bench
// orchestrator). Ngưỡng (không hạ): FB_Motor §13 × 200, ≥ 1000 scan/s;
// heap tăng < 1 MB sau 2000 scan. Đo có warm-up, lấy trung vị. Kết quả hợp
// nhất vào `bench/results.json` (file sinh tự động, không commit — baseline
// ở P0.7). Exit ≠ 0 khi FAIL (CI bench job chạy script này).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SoftPlc } from '@vcs/runtime-iec';
import { compileProject } from '@vcs/vendor-siemens';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'bench', 'results.json');
const FB_MOTOR_SCL = join(ROOT, 'examples', 'motor-interlock', 'plc', 'FB_Motor.scl');

const N_MOTORS = 200;
const THRESHOLD_SCANS_PER_SEC = 1000;
const HEAP_LIMIT_MB = 1;
const HEAP_SCANS = 2000;

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

/** Program bench: FB_Motor §13 + 200 DB + OB1 gọi cả 200 (đầu vào chung). */
function buildBenchProgram(): { program: ReturnType<typeof compileProject>['program'] } {
  const fbMotor = readFileSync(FB_MOTOR_SCL, 'utf8');
  const dbs: string[] = [];
  const calls: string[] = [];
  for (let i = 0; i < N_MOTORS; i++) {
    dbs.push(`DATA_BLOCK "DB_Motor_${String(i)}" "FB_Motor"\nBEGIN\nEND_DATA_BLOCK\n`);
    // qRun → %M bit i (byte i/8, bit i%8); qFault → %M bit 200+i.
    const runByte = Math.floor(i / 8);
    const runBit = i % 8;
    const faultByte = Math.floor((200 + i) / 8);
    const faultBit = (200 + i) % 8;
    calls.push(
      `  "DB_Motor_${String(i)}"(iStart := %I0.0, iStopOk := %I0.1, iOverloadOk := %I0.2, iPermissive := %I0.3, iRunFb := %I0.4, iReset := %I0.5);`,
      `  %M${String(runByte)}.${String(runBit)} := "DB_Motor_${String(i)}".qRun;`,
      `  %M${String(faultByte)}.${String(faultBit)} := "DB_Motor_${String(i)}".qFault;`,
    );
  }
  const ob1 = [
    'ORGANIZATION_BLOCK "Main"',
    'BEGIN',
    ...calls,
    'END_ORGANIZATION_BLOCK',
    '',
  ].join('\n');
  const { program, diagnostics } = compileProject(
    [
      // Thứ tự tên file quyết định thứ tự biên dịch (OQ-202): FB trước,
      // DB sau, OB cuối — DBs.scl sort trước FB_Motor.scl sẽ T001.
      { path: '00_FB_Motor.scl', text: fbMotor },
      { path: '01_DBs.scl', text: dbs.join('\n') },
      { path: '02_OB1.scl', text: ob1 },
    ],
    { tags: [] },
  );
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    throw new Error(
      `bench softplc: program bench biên dịch lỗi: ${errors.map((d) => `${d.code} ${d.message}`).join('; ')}`,
    );
  }
  return { program };
}

function main(): void {
  const { program } = buildBenchProgram();
  const plc = new SoftPlc(program, new Map(), { id: 'bench', scanPeriodMs: 10 });
  plc.start();
  // Warm-up: 200 scan (cả JIT + rebase lưới).
  let t = 0;
  for (let i = 0; i < 200; i++) {
    t += 10;
    plc.step(t - 10, 10);
  }
  const samples: number[] = [];
  for (let r = 0; r < 5; r++) {
    const scans = 2000;
    const t0 = performance.now();
    for (let i = 0; i < scans; i++) {
      t += 10;
      plc.step(t - 10, 10);
    }
    samples.push(scans / ((performance.now() - t0) / 1000));
  }
  const scansPerSec = median(samples);
  const pass = scansPerSec >= THRESHOLD_SCANS_PER_SEC;

  // Heap: 2000 scan sau gc, tăng < 1 MB.
  const gc = gcOrThrow();
  gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < HEAP_SCANS; i++) {
    t += 10;
    plc.step(t - 10, 10);
  }
  gc();
  const heapMB = (process.memoryUsage().heapUsed - before) / (1024 * 1024);
  const heapPass = heapMB < HEAP_LIMIT_MB;

  console.log(`bench softplc (M1 §12.4) — FB_Motor §13 × ${String(N_MOTORS)}, trung vị, có warm-up:`);
  console.log(
    `  scans: ${Math.round(scansPerSec).toLocaleString('en-US')} scan/s ` +
      `(ngưỡng ≥ ${THRESHOLD_SCANS_PER_SEC.toLocaleString('en-US')}) ${pass ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `  heap: +${heapMB.toFixed(2)} MB / ${String(HEAP_SCANS)} scan ` +
      `(ngưỡng < ${String(HEAP_LIMIT_MB)} MB) ${heapPass ? 'PASS' : 'FAIL'}`,
  );
  console.log(`  scanCount: ${String(plc.getDiagnostics().scanCount)}`);

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
      softplcScansPerSec: THRESHOLD_SCANS_PER_SEC,
      softplcHeapMB: HEAP_LIMIT_MB,
    },
    results: {
      ...((prev['results'] as Record<string, unknown> | undefined) ?? {}),
      softplcScansPerSec: Math.round(scansPerSec),
      softplcHeapMB: Number(heapMB.toFixed(3)),
    },
    pass: {
      ...((prev['pass'] as Record<string, unknown> | undefined) ?? {}),
      softplc: pass && heapPass,
    },
  };
  writeFileSync(OUT, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  if (!pass || !heapPass) {
    process.exitCode = 1;
  }
}

main();
