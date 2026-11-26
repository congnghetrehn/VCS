// Test diff tags cũ/mới (M2 §8.8, P2.6 commit 5).
// Ví dụ tính tay từ plan (STATE §30 bảng 4).

import { describe, expect, it } from 'vitest';
import type { TagDef } from '@vcs/schemas';
import { diffTags } from './diff.js';
import { normalizeImport } from './normalize.js';
import type { NormalizedSignal } from './normalize.js';
import type { IoRecord } from './transform.js';

function tag(partial: TagDef): TagDef {
  return partial;
}

function signals(records: IoRecord[]): NormalizedSignal[] {
  return normalizeImport(records, {
    origin: { file: 'new.csv' },
    rowNumbers: records.map((_, i) => i + 7),
  });
}

const OLD_A = tag({
  name: 'A',
  type: 'Bool',
  area: 'I',
  address: '%I0.0',
  controller: 'PLC1',
  signal: { kind: 'DI' },
  origin: { file: 'old.csv', row: 7 },
  provenance: 'import',
});
const OLD_B = tag({
  name: 'B',
  type: 'Bool',
  area: 'I',
  address: '%I0.1',
  controller: 'PLC1',
  description: 'cũ',
  signal: { kind: 'DI' },
  provenance: 'manual',
});
const OLD_C = tag({
  name: 'C',
  type: 'Bool',
  area: 'Q',
  address: '%Q0.0',
  controller: 'PLC1',
  signal: { kind: 'DO' },
  provenance: 'import',
});

describe('diffTags — bảng 4 (STATE §30)', () => {
  it('A unchanged, B manual-skipped (description đổi), C removed, D added', () => {
    const d = diffTags(
      [OLD_A, OLD_B, OLD_C],
      signals([
        { tag: 'A', address: '%I0.0', signalType: 'DI' },
        { tag: 'B', address: '%I0.1', signalType: 'DI', description: 'mới' },
        { tag: 'D', address: '%I0.2', signalType: 'DI' },
      ]),
    );
    expect(d.added).toEqual(['D']);
    expect(d.removed).toEqual(['C']);
    expect(d.changed).toEqual([]);
    expect(d.unchanged).toEqual(['A']);
    expect(d.skippedManual).toEqual([{ tag: 'B', fields: ['description'], reason: 'changed' }]);
    expect(d.renamedCandidates).toEqual([]);
  });

  it('rename: E removed + F added cùng địa chỉ → candidate (removed/added vẫn giữ)', () => {
    const d = diffTags(
      [
        tag({ name: 'E', type: 'Bool', area: 'I', address: '%I1.0', controller: 'PLC1', signal: { kind: 'DI' } }),
      ],
      signals([{ tag: 'F', address: '%I1.0', signalType: 'DI' }]),
    );
    expect(d.added).toEqual(['F']);
    expect(d.removed).toEqual(['E']);
    expect(d.renamedCandidates).toEqual([{ from: 'E', to: 'F', address: '%I1.0' }]);
  });

  it('changed: G range engMax 100 → 27648 (chỉ 1 field scaling.engMax)', () => {
    const d = diffTags(
      [
        tag({
          name: 'G',
          type: 'Int',
          area: 'I',
          address: '%IW64',
          controller: 'PLC1',
          signal: {
            kind: 'AI',
            scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100 },
          },
        }),
      ],
      signals([{ tag: 'G', address: '%IW64', signalType: 'AI', engMin: 0, engMax: 27648 }]),
    );
    expect(d.changed).toEqual([
      { tag: 'G', field: 'signal.scaling.engMax', old: 100, next: 27648 },
    ]);
    expect(d.unchanged).toEqual([]);
  });

  it('so khớp không phân biệt hoa/thường (old "a" vs new "A" → unchanged)', () => {
    const d = diffTags(
      [tag({ ...OLD_A, name: 'a' })],
      signals([{ tag: 'A', address: '%I0.0', signalType: 'DI' }]),
    );
    expect(d.unchanged).toEqual(['A']);
    expect(d.added).toEqual([]);
  });

  it('scope: tag controller khác (PLC2) không vào bucket nào', () => {
    const d = diffTags(
      [
        OLD_A,
        tag({ name: 'H', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC2', signal: { kind: 'DI' } }),
      ],
      signals([{ tag: 'A', address: '%I0.0', signalType: 'DI' }]),
    );
    expect(d.removed).toEqual([]);
    expect(d.unchanged).toEqual(['A']);
    expect(d.added).toEqual([]);
  });

  it('--overwrite-manual: tag manual đổi → changed; manual vắng → removed', () => {
    const d = diffTags(
      [OLD_A, OLD_B, OLD_C],
      signals([
        { tag: 'A', address: '%I0.0', signalType: 'DI' },
        { tag: 'B', address: '%I0.1', signalType: 'DI', description: 'mới' },
      ]),
      { overwriteManual: true },
    );
    expect(d.changed).toEqual([
      { tag: 'B', field: 'description', old: 'cũ', next: 'mới' },
    ]);
    expect(d.removed).toEqual(['C']);
    expect(d.skippedManual).toEqual([]);
    // B manual vắng khỏi import + overwrite → removed (test riêng).
    const d2 = diffTags(
      [tag({ ...OLD_B, provenance: 'manual' })],
      signals([{ tag: 'A', address: '%I0.0', signalType: 'DI' }]),
      { overwriteManual: true },
    );
    expect(d2.removed).toEqual(['B']);
    const d3 = diffTags(
      [tag({ ...OLD_B, provenance: 'manual' })],
      signals([{ tag: 'A', address: '%I0.0', signalType: 'DI' }]),
    );
    expect(d3.removed).toEqual([]);
    expect(d3.skippedManual).toEqual([{ tag: 'B', fields: [], reason: 'removed' }]);
  });

  it('signal thêm/bớt → 1 change field "signal"; scaling thêm/bớt → "signal.scaling"', () => {
    const d = diffTags(
      [
        tag({ name: 'A', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1' }),
        tag({
          name: 'G',
          type: 'Int',
          area: 'I',
          address: '%IW64',
          controller: 'PLC1',
          signal: { kind: 'AI', scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100 } },
        }),
      ],
      signals([
        { tag: 'A', address: '%I0.0', signalType: 'DI' },
        { tag: 'G', address: '%IW64', signalType: 'AI' },
      ]),
    );
    expect(d.changed).toEqual([
      { tag: 'A', field: 'signal', old: null, next: { kind: 'DI' } },
      { tag: 'G', field: 'signal.scaling', old: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100 }, next: null },
    ]);
  });
});
