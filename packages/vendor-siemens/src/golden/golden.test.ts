// Harness chạy golden YAML (M1 §12.1–12.2, P1.7).
// Mỗi file YAML = 1 test case: parse (runtime-iec) → compileProject
// (vendor-siemens, sources + tags inline) → runGolden (runtime-iec).
// File nằm ở packages/runtime-iec/golden/ (nhóm chung) và
// examples/motor-interlock/golden/ (4 kịch bản demo §13).

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseGoldenYaml, runGolden } from '@vcs/runtime-iec';
import { compileProject } from '../scl/compile-project.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const GOLDEN_DIRS = [
  `${ROOT}packages/runtime-iec/golden`,
  `${ROOT}examples/motor-interlock/golden`,
];

/** Số golden tối thiểu theo nhóm, M1 §12.2 bảng (OQ-211). */
const GROUP_MIN: Record<string, number> = {
  bitlogic: 8,
  edge: 8,
  timer: 14,
  counter: 10,
  arith: 14,
  flow: 8,
  call: 8,
  memory: 8,
  scan: 6,
  force: 4,
  lad: 8,
  demo: 4,
};

interface GoldenFile {
  file: string;
  name: string;
  group: string;
}

function listGoldens(): GoldenFile[] {
  const out: GoldenFile[] = [];
  for (const dir of GOLDEN_DIRS) {
    for (const name of readdirSync(dir)
      .filter((n) => n.endsWith('.golden.yaml'))
      .sort()) {
      out.push({ file: `${dir}/${name}`, name, group: name.split('-')[0] as string });
    }
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const FILES = listGoldens();

describe('golden inventory (M1 §12.2, OQ-211)', () => {
  it('đủ 100 file, đúng nhóm tối thiểu, id trùng tên file, id duy nhất', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(100);
    const byGroup = new Map<string, number>();
    const ids = new Set<string>();
    for (const f of FILES) {
      byGroup.set(f.group, (byGroup.get(f.group) ?? 0) + 1);
      const c = parseGoldenYaml(readFileSync(f.file, 'utf8'), f.name);
      expect(c.id).toBe(f.name.replace(/\.golden\.yaml$/, ''));
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
    for (const [g, min] of Object.entries(GROUP_MIN)) {
      expect(byGroup.get(g) ?? 0).toBeGreaterThanOrEqual(min);
    }
  });

  it('golden demo dùng đúng nguồn demo (không lệch bản sao inline)', () => {
    for (const f of FILES.filter((x) => x.group === 'demo')) {
      const c = parseGoldenYaml(readFileSync(f.file, 'utf8'), f.name);
      for (const src of c.sources) {
        const disk = readFileSync(`${ROOT}examples/motor-interlock/plc/${src.file}`, 'utf8');
        expect(src.text.trimEnd()).toBe(disk.trimEnd());
      }
    }
  });
});

describe.each(FILES)('golden $name', ({ file, name }) => {
  it('chạy đúng kỳ vọng', () => {
    const text = readFileSync(file, 'utf8');
    const golden = parseGoldenYaml(text, name);
    const { program, diagnostics } = compileProject(
      golden.sources.map((s) => ({ path: s.file, text: s.text })),
      { tags: golden.tags ?? [] },
    );
    expect(diagnostics).toEqual([]);
    const result = runGolden(golden, program);
    expect(result.steps).toBe(golden.steps.length);
  });
});
