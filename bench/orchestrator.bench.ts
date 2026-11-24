// Bench orchestrator — M0 §12.4. Chạy: `pnpm bench` (chạy sau bench TagDB).
// Ngưỡng (không hạ): orchestrator "rỗng" ≥ 100 000 bước/giây. Project bench
// theo AMENDMENTS A17: 5 000 tag trong TagDB, 4 controller demo, mỗi
// controller 2 rule loopback (tổng 8) + 1 counter + 1 blink; các tag còn
// lại không có rule. Đo có warm-up, lấy trung vị. Kết quả hợp nhất vào
// `bench/results.json` (file sinh tự động, không commit — baseline ở P0.7).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSimulation } from '@vcs/kernel';
import { demoExtension } from '@vcs/kernel/demo';
import { loadProject, nodeFS } from '@vcs/project';
import { generateBenchProject } from '../scripts/gen-bench-project.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'bench', 'results.json');
const PROJECT_DIR = join(ROOT, 'bench', 'project-5000');

const THRESHOLD_STEPS_PER_SEC = 100_000;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

async function main(): Promise<void> {
  if (!existsSync(join(PROJECT_DIR, 'vcs.project.yaml'))) {
    generateBenchProject(PROJECT_DIR);
  }
  const project = await loadProject(nodeFS(PROJECT_DIR));
  if (!project.valid) {
    throw new Error(
      `bench orchestrator: project bench không hợp lệ: ${project.diagnostics.map((d) => d.message).join('; ')}`,
    );
  }
  const bundle = await createSimulation(project, { extensions: [demoExtension] });
  // Warm-up.
  bundle.sim.runSteps(2000);
  const samples: number[] = [];
  for (let r = 0; r < 5; r++) {
    const steps = 20_000;
    const t0 = performance.now();
    bundle.sim.runSteps(steps);
    samples.push(steps / ((performance.now() - t0) / 1000));
  }
  const stepsPerSec = median(samples);
  const pass = stepsPerSec >= THRESHOLD_STEPS_PER_SEC;
  console.log('bench orchestrator (M0 §12.4) — trung vị, có warm-up:');
  console.log(
    `  steps: ${Math.round(stepsPerSec).toLocaleString('en-US')} bước/s ` +
      `(ngưỡng ≥ ${THRESHOLD_STEPS_PER_SEC.toLocaleString('en-US')}) ${pass ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `  simTime sau bench: ${String(bundle.sim.simTimeMs)} ms, stepCount ${String(bundle.sim.stepCount)}`,
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
      orchestratorStepsPerSec: THRESHOLD_STEPS_PER_SEC,
    },
    results: {
      ...((prev['results'] as Record<string, unknown> | undefined) ?? {}),
      orchestratorStepsPerSec: Math.round(stepsPerSec),
    },
    pass: {
      ...((prev['pass'] as Record<string, unknown> | undefined) ?? {}),
      orchestrator: pass,
    },
  };
  mkdirSync(join(ROOT, 'bench'), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  console.log(`  kết quả: ${OUT}`);
  process.exitCode = pass ? 0 : 1;
}

await main();
