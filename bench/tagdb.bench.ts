// Bench TagDB — M0 §12.4. Chạy: `pnpm bench` (có warm-up, lấy trung vị).
// Ghi `bench/results.json` (file sinh tự động, không commit — baseline ở P0.7).
// Ngưỡng (không hạ): set/get ≥ 10M ops/s; flush 5000 tag/0 đổi ≤ 50 µs;
// flush 1000 đổi + 1 subscriber ≤ 1 ms; heap tăng < 1 MB sau 10M thao tác.

import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ManualClock, TagDB } from '@vcs/kernel';
import type { TagHandle } from '@vcs/kernel';
import type { TagDef } from '@vcs/schemas';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'bench', 'results.json');

const THRESHOLDS = {
  setGetOpsPerSec: 10_000_000,
  flushNoChangeUs: 50,
  flushChangesMs: 1,
  heapIncreaseMB: 1,
} as const;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

function makeDefs(n: number): TagDef[] {
  const defs: TagDef[] = [];
  for (let i = 0; i < n; i++) {
    defs.push({
      name: `T${String(i).padStart(4, '0')}`,
      type: 'Int',
      area: 'Q',
      address: `%QW${String(i * 2)}`,
      controller: 'PLC1',
      signal: { kind: 'AO' },
    });
  }
  return defs;
}

function gcOrThrow(): () => void {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc === undefined) {
    throw new Error('bench cần --expose-gc (script "bench" đã đặt NODE_OPTIONS).');
  }
  return gc;
}

function benchSetGet(): number {
  const clock = new ManualClock();
  const tags = new TagDB(makeDefs(100), clock);
  const handles = Array.from({ length: 100 }, (_, i) => i as TagHandle);
  // Warm-up.
  for (let i = 0; i < 1_000_000; i++) {
    const h = handles[i % 100] as TagHandle;
    tags.set(h, i % 1000);
    tags.get(h);
  }
  const ops = 20_000_000;
  const t0 = performance.now();
  for (let i = 0; i < ops / 2; i++) {
    const h = handles[i % 100] as TagHandle;
    tags.set(h, i % 1000);
    tags.get(h);
  }
  const elapsedSec = (performance.now() - t0) / 1000;
  return ops / elapsedSec;
}

function benchFlushNoChange(): number {
  const clock = new ManualClock();
  const tags = new TagDB(makeDefs(5000), clock);
  const samples: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const t0 = performance.now();
    tags.flush();
    samples.push(performance.now() - t0);
  }
  return median(samples) * 1000; // µs
}

function benchFlushChanges(): number {
  const clock = new ManualClock();
  const tags = new TagDB(makeDefs(5000), clock);
  let received = 0;
  tags.subscribe('*', (batch) => {
    received += batch.length;
  });
  const samples: number[] = [];
  let toggle = 0;
  for (let i = 0; i < 200; i++) {
    toggle = 1 - toggle;
    for (let h = 0; h < 1000; h++) {
      tags.set(h as TagHandle, toggle, 'plc');
    }
    const t0 = performance.now();
    tags.flush();
    samples.push(performance.now() - t0);
  }
  if (received !== 200 * 1000) {
    throw new Error(`bench flush: subscriber nhận ${String(received)} change, kỳ vọng 200000.`);
  }
  return median(samples); // ms
}

function benchHeap(): number {
  const gc = gcOrThrow();
  const clock = new ManualClock();
  const tags = new TagDB(makeDefs(100), clock);
  const handles = Array.from({ length: 100 }, (_, i) => i as TagHandle);
  for (let i = 0; i < 100_000; i++) {
    const h = handles[i % 100] as TagHandle;
    tags.set(h, i % 1000);
    tags.get(h);
  }
  gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 10_000_000; i++) {
    const h = handles[i % 100] as TagHandle;
    tags.set(h, i % 1000);
    tags.get(h);
  }
  gc();
  const after = process.memoryUsage().heapUsed;
  return (after - before) / (1024 * 1024); // MB
}

function main(): void {
  const setGetOpsPerSec = benchSetGet();
  const flushNoChangeUs = benchFlushNoChange();
  const flushChangesMs = benchFlushChanges();
  const heapIncreaseMB = benchHeap();
  const results = {
    thresholds: THRESHOLDS,
    results: {
      setGetOpsPerSec: Math.round(setGetOpsPerSec),
      flushNoChangeUs: Math.round(flushNoChangeUs * 100) / 100,
      flushChangesMs: Math.round(flushChangesMs * 1000) / 1000,
      heapIncreaseMB: Math.round(heapIncreaseMB * 100) / 100,
    },
    pass: {
      setGet: setGetOpsPerSec >= THRESHOLDS.setGetOpsPerSec,
      flushNoChange: flushNoChangeUs <= THRESHOLDS.flushNoChangeUs,
      flushChanges: flushChangesMs <= THRESHOLDS.flushChangesMs,
      heap: heapIncreaseMB < THRESHOLDS.heapIncreaseMB,
    },
  };
  mkdirSync(join(ROOT, 'bench'), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  console.log('bench TagDB (M0 §12.4) — trung vị, có warm-up:');
  console.log(
    `  set/get:            ${results.results.setGetOpsPerSec.toLocaleString('en-US')} ops/s (ngưỡng ≥ ${THRESHOLDS.setGetOpsPerSec.toLocaleString('en-US')}) ${results.pass.setGet ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `  flush 5000 tag/0 đổi: ${String(results.results.flushNoChangeUs)} µs (ngưỡng ≤ ${String(THRESHOLDS.flushNoChangeUs)}) ${results.pass.flushNoChange ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `  flush 1000 đổi + 1 sub: ${String(results.results.flushChangesMs)} ms (ngưỡng ≤ ${String(THRESHOLDS.flushChangesMs)}) ${results.pass.flushChanges ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `  heap +10M thao tác: ${String(results.results.heapIncreaseMB)} MB (ngưỡng < ${String(THRESHOLDS.heapIncreaseMB)}) ${results.pass.heap ? 'PASS' : 'FAIL'}`,
  );
  console.log(`  kết quả: ${OUT}`);
  const allPass = Object.values(results.pass).every(Boolean);
  process.exitCode = allPass ? 0 : 1;
}

main();
