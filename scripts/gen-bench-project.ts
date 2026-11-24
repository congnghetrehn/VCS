// Sinh `bench/project-5000` (5 000 tag, 4 controller demo) phục vụ benchmark
// (M0 §10, §12.4). Kết quả sinh KHÔNG commit (`.gitignore`).
// Chạy: `tsx scripts/gen-bench-project.ts [outDir]`.
// Tất định: mọi tên/địa chỉ suy từ chỉ số, không random, không wall time.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BENCH_CONTROLLERS = 4;
export const BENCH_TAGS_PER_CONTROLLER = 1250;

/** Sinh project bench vào `outDir` (ghi đè nếu đã có). */
export function generateBenchProject(outDir: string): void {
  const tagsYaml: string[] = ['tags:'];
  const controllersYaml: string[] = ['controllers:'];
  for (let c = 1; c <= BENCH_CONTROLLERS; c++) {
    const id = `PLC${String(c)}`;
    const loopback: string[] = [];
    // 600 Bool in → 600 Bool out (loopback), 24 Int in, 24 Int out, 1 counter, 1 blink.
    for (let i = 0; i < 600; i++) {
      const inName = `IN${String(c)}_${String(i).padStart(4, '0')}`;
      const outName = `OUT${String(c)}_${String(i).padStart(4, '0')}`;
      tagsYaml.push(
        `  - name: ${inName}`,
        '    type: Bool',
        '    area: I',
        `    address: "%I${String(Math.floor(i / 8))}.${String(i % 8)}"`,
        `    controller: ${id}`,
        '    signal:',
        '      kind: DI',
        `  - name: ${outName}`,
        '    type: Bool',
        '    area: Q',
        `    address: "%Q${String(Math.floor(i / 8))}.${String(i % 8)}"`,
        `    controller: ${id}`,
        '    signal:',
        '      kind: DO',
      );
      loopback.push(`{ in: ${inName}, out: ${outName} }`);
    }
    for (let i = 0; i < 24; i++) {
      tagsYaml.push(
        `  - name: AI${String(c)}_${String(i).padStart(2, '0')}`,
        '    type: Int',
        '    area: I',
        `    address: "%IW${String(2000 + i * 2)}"`,
        `    controller: ${id}`,
        '    signal:',
        '      kind: AI',
        `  - name: AO${String(c)}_${String(i).padStart(2, '0')}`,
        '    type: Int',
        '    area: Q',
        `    address: "%QW${String(2000 + i * 2)}"`,
        `    controller: ${id}`,
        '    signal:',
        '      kind: AO',
      );
    }
    tagsYaml.push(
      `  - name: CNT${String(c)}`,
      '    type: Int',
      '    area: Q',
      `    address: "%QW${String(3000 + c * 2)}"`,
      `    controller: ${id}`,
      '    signal:',
      '      kind: AO',
      `  - name: HB${String(c)}`,
      '    type: Bool',
      '    area: Q',
      `    address: "%Q${String(400 + c)}.0"`,
      `    controller: ${id}`,
      '    signal:',
      '      kind: DO',
    );
    controllersYaml.push(
      `  - id: ${id}`,
      '    mode: builtin',
      '    vendor: demo',
      '    model: loopback',
      '    config:',
      `      loopback: [ ${loopback.join(', ')} ]`,
      `      blink: [ { out: HB${String(c)}, periodMs: 500 } ]`,
      `      counter: [ { out: CNT${String(c)}, step: 1 } ]`,
    );
  }
  const projectYaml = [
    'schemaVersion: 1',
    'name: Bench 5000',
    'language: vi',
    'seed: 1',
    'simulation: { stepMs: 10, plcScanMs: 10 }',
    ...controllersYaml,
  ].join('\n');
  mkdirSync(join(outDir, 'tags'), { recursive: true });
  writeFileSync(join(outDir, 'vcs.project.yaml'), `${projectYaml}\n`, 'utf8');
  writeFileSync(join(outDir, 'tags', 'tags.yaml'), `${tagsYaml.join('\n')}\n`, 'utf8');
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const outDir = process.argv[2] ?? join(root, 'bench', 'project-5000');
  generateBenchProject(outDir);
  process.stdout.write(`đã sinh ${outDir} (5000 tag, 4 controller demo)\n`);
}
