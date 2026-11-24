// Sinh project 20 000 tag cho kiểm cuộn §12.4 (OQ-067).
// Tất định, seed 1: 10 000 DI + 10 000 DO Bool trên 1 controller demo,
// KHÔNG rule loopback (controller 0 rule — chỉ đo tốc độ render/cuộn).
// Chạy: pnpm exec tsx apps/web/e2e/fixtures/gen-big-project.ts
// Output gitignored: apps/web/e2e/fixtures/big-project/ (không commit).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'big-project');
const N = 10_000;

function address(prefix: string, i: number): string {
  return `${prefix}${String(Math.floor(i / 8))}.${String(i % 8)}`;
}

const projectYaml = `schemaVersion: 1
name: Big Project
language: vi
seed: 1
simulation: { stepMs: 10, plcScanMs: 10 }
controllers:
  - id: PLC1
    mode: builtin
    vendor: demo
    model: loopback
`;

const lines: string[] = ['tags:'];
for (let i = 0; i < N; i += 1) {
  const n = String(i).padStart(5, '0');
  lines.push(`  - name: IN_${n}`);
  lines.push('    type: Bool');
  lines.push('    area: I');
  lines.push(`    address: "${address('%I', i)}"`);
  lines.push('    controller: PLC1');
  lines.push('    signal: { kind: DI }');
}
for (let i = 0; i < N; i += 1) {
  const n = String(i).padStart(5, '0');
  lines.push(`  - name: OUT_${n}`);
  lines.push('    type: Bool');
  lines.push('    area: Q');
  lines.push(`    address: "${address('%Q', i)}"`);
  lines.push('    controller: PLC1');
  lines.push('    signal: { kind: DO }');
}

await mkdir(join(OUT, 'tags'), { recursive: true });
await writeFile(join(OUT, 'vcs.project.yaml'), projectYaml, 'utf8');
await writeFile(join(OUT, 'tags', 'tags.yaml'), `${lines.join('\n')}\n`, 'utf8');
process.stdout.write(`gen-big-project: đã sinh ${String(2 * N)} tag vào ${OUT}\n`);
