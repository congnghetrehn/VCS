// Test commit + safety net + PL-W010 motor-interlock (M2 §8.8/§9.4, P2.6 commit 5).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { equipmentFileSchema, tagsFileSchema, type TagDef } from '@vcs/schemas';
import { applyCommit, safetyNetCheck, serializeTags } from './commit.js';
import { diffTags } from './diff.js';
import { normalizeImport } from './normalize.js';
import type { NormalizedSignal } from './normalize.js';
import type { IoRecord } from './transform.js';
import { validateImport, type AssignedTag } from './validate.js';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const MOTOR_DIR = join(ROOT, 'examples', 'motor-interlock');

function signals(records: IoRecord[]): NormalizedSignal[] {
  return normalizeImport(records, {
    origin: { file: 'new.csv' },
    rowNumbers: records.map((_, i) => i + 7),
  });
}

const OLD_A: TagDef = {
  name: 'A',
  type: 'Bool',
  area: 'I',
  address: '%I0.0',
  controller: 'PLC1',
  signal: { kind: 'DI' },
  origin: { file: 'old.csv', row: 7 },
  provenance: 'import',
};
const OLD_B: TagDef = {
  name: 'B',
  type: 'Bool',
  area: 'I',
  address: '%I0.1',
  controller: 'PLC1',
  description: 'cũ',
  signal: { kind: 'DI' },
  provenance: 'manual',
};
const OLD_C: TagDef = {
  name: 'C',
  type: 'Bool',
  area: 'Q',
  address: '%Q0.0',
  controller: 'PLC1',
  signal: { kind: 'DO' },
  provenance: 'import',
};
const OLD_G: TagDef = {
  name: 'G',
  type: 'Int',
  area: 'I',
  address: '%IW64',
  controller: 'PLC1',
  initial: 5,
  equipment: 'EQ1',
  role: 'speedFb',
  signal: { kind: 'AI', scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100 } },
};

describe('applyCommit — bảng 4', () => {
  it('A giữ nguyên TagDef cũ (kể cả origin), B manual giữ, C xóa, D thêm', () => {
    const sig = signals([
      { tag: 'A', address: '%I0.0', signalType: 'DI' },
      { tag: 'B', address: '%I0.1', signalType: 'DI', description: 'mới' },
      { tag: 'D', address: '%I0.2', signalType: 'DI' },
    ]);
    const d = diffTags([OLD_A, OLD_B, OLD_C], sig);
    const out = applyCommit([OLD_A, OLD_B, OLD_C], d, sig);
    expect(out.map((t) => t.name)).toEqual(['A', 'B', 'D']);
    const a = out.find((t) => t.name === 'A') as TagDef;
    expect(a.origin).toEqual({ file: 'old.csv', row: 7 });
    const b = out.find((t) => t.name === 'B') as TagDef;
    expect(b.description).toBe('cũ');
    const added = out.find((t) => t.name === 'D') as TagDef;
    expect(added.provenance).toBe('import');
    expect(added.origin).toEqual({ file: 'new.csv', row: 9 });
  });

  it('tag changed giữ initial/equipment/role cũ, lấy giá trị mới + provenance import', () => {
    const sig = signals([{ tag: 'G', address: '%IW64', signalType: 'AI', engMin: 0, engMax: 27648 }]);
    const d = diffTags([OLD_G], sig);
    const out = applyCommit([OLD_G], d, sig);
    expect(out).toHaveLength(1);
    const g = out[0] as TagDef;
    expect(g.signal?.scaling?.engMax).toBe(27648);
    expect(g.initial).toBe(5);
    expect(g.equipment).toBe('EQ1');
    expect(g.role).toBe('speedFb');
    expect(g.provenance).toBe('import');
  });

  it('sắp xếp ổn định: controller → area (I/Q/M/DB) → địa chỉ', () => {
    const old: TagDef[] = [
      { name: 'ZQ', type: 'Bool', area: 'Q', address: '%Q0.1', controller: 'PLC1', signal: { kind: 'DO' } },
      { name: 'ZI', type: 'Bool', area: 'I', address: '%I0.1', controller: 'PLC1', signal: { kind: 'DI' } },
      { name: 'ZDB', type: 'Int', area: 'DB', address: 'DB1.DBW0', controller: 'PLC1', signal: { kind: 'AI' } },
      { name: 'ZM', type: 'Bool', area: 'M', address: '%M0.0', controller: 'PLC1', signal: { kind: 'DI' } },
      { name: 'ZP2', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC2', signal: { kind: 'DI' } },
      { name: 'ZI0', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1', signal: { kind: 'DI' } },
    ];
    const d = diffTags(old, signals([]));
    // Import rỗng → không controller trong scope → diff rỗng, giữ nguyên thứ tự sắp xếp.
    expect(d.added).toEqual([]);
    const out = applyCommit(old, d, []);
    expect(out.map((t) => t.name)).toEqual(['ZI0', 'ZI', 'ZQ', 'ZM', 'ZDB', 'ZP2']);
  });
});

describe('serializeTags + safetyNetCheck', () => {
  it('serialize → parse lại qua tagsFileSchema → bằng danh sách gốc', () => {
    const sig = signals([
      { tag: 'A', address: '%I0.0', signalType: 'DI' },
      { tag: 'G', address: '%IW64', signalType: 'AI', engMin: 0, engMax: 100 },
    ]);
    const d = diffTags([], sig);
    const out = applyCommit([], d, sig);
    const text = serializeTags(out);
    const parsed = tagsFileSchema.parse(parseYaml(text) as unknown);
    expect(parsed.tags).toEqual(out);
  });

  it('safety net: danh sách hợp lệ → []', () => {
    expect(safetyNetCheck([OLD_A, OLD_B, OLD_C])).toEqual([]);
  });

  it('safety net: trùng tên → PRJ-E004; kind/area sai → PRJ-E010; scaling trên DI → PRJ-E011; engMin==engMax → PRJ-E012', () => {
    const dup = safetyNetCheck([OLD_A, { ...OLD_A, address: '%I0.1' }]);
    expect(dup.map((d) => d.code)).toContain('PRJ-E004');
    const dir = safetyNetCheck([
      { name: 'X', type: 'Bool', area: 'Q', address: '%Q0.0', controller: 'PLC1', signal: { kind: 'DI' } },
    ]);
    expect(dir.map((d) => d.code)).toContain('PRJ-E010');
    const scaling = safetyNetCheck([
      {
        name: 'Y',
        type: 'Bool',
        area: 'I',
        address: '%I0.0',
        controller: 'PLC1',
        signal: { kind: 'DI', scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100 } },
      },
    ]);
    expect(scaling.map((d) => d.code)).toContain('PRJ-E011');
    // engMin==engMax: validate chỉ warn IO-W040, safety net chặn bằng PRJ-E012 (OQ-352).
    const flat = safetyNetCheck([
      {
        name: 'Z',
        type: 'Int',
        area: 'I',
        address: '%IW64',
        controller: 'PLC1',
        signal: { kind: 'AI', scaling: { rawMin: 0, rawMax: 27648, engMin: 50, engMax: 50 } },
      },
    ]);
    expect(flat.map((d) => d.code)).toContain('PRJ-E012');
    for (const list of [dup, dir, scaling, flat]) {
      expect(list.every((d) => d.severity === 'error')).toBe(true);
    }
  });
});

describe('idempotence (§8.8)', () => {
  it('commit 2 lần cùng file → diff rỗng + tags.yaml byte-identical', () => {
    const sig = signals([
      { tag: 'A', address: '%I0.0', signalType: 'DI' },
      { tag: 'B', address: '%I0.1', signalType: 'DI', description: 'mới' },
      { tag: 'D', address: '%I0.2', signalType: 'DI' },
      { tag: 'G', address: '%IW64', signalType: 'AI', engMin: 0, engMax: 27648 },
    ]);
    const old = [OLD_A, OLD_B, OLD_C, OLD_G];
    const d1 = diffTags(old, sig);
    const tags1 = applyCommit(old, d1, sig);
    const yaml1 = serializeTags(tags1);
    const d2 = diffTags(tags1, sig);
    expect(d2.added).toEqual([]);
    expect(d2.removed).toEqual([]);
    expect(d2.changed).toEqual([]);
    expect(d2.skippedManual).toHaveLength(1);
    expect(d2.unchanged).toEqual(['A', 'D', 'G']);
    const tags2 = applyCommit(tags1, d2, sig);
    expect(serializeTags(tags2)).toBe(yaml1);
  });
});

describe('PL-W010 — examples/motor-interlock (§9.4)', () => {
  async function loadMotorInterlock(): Promise<{ tags: TagDef[]; assigned: AssignedTag[] }> {
    const tagsText = await readFile(join(MOTOR_DIR, 'tags', 'tags.yaml'), 'utf8');
    const tags = tagsFileSchema.parse(parseYaml(tagsText) as unknown).tags;
    const plantText = await readFile(join(MOTOR_DIR, 'plant', 'equipment.yaml'), 'utf8');
    const plant = equipmentFileSchema.parse(parseYaml(plantText) as unknown);
    const assigned: AssignedTag[] = [];
    for (const eq of plant) {
      for (const [role, tag] of Object.entries(eq.signals ?? {})) {
        assigned.push({ tag, equipment: eq.id, role });
      }
    }
    return { tags, assigned };
  }

  it('import thiếu RUN_CMD/RUN_FB/OVL_OK → PL-W010 ×3 (ghi equipment.role)', async () => {
    const { assigned } = await loadMotorInterlock();
    expect(assigned.map((a) => a.tag).sort()).toEqual(['OVL_OK', 'RUN_CMD', 'RUN_FB']);
    const r = validateImport({
      records: [{ tag: 'START_PB', address: '%I0.0', signalType: 'DI' }],
      rowNumbers: [7],
      origin: { file: 'new.csv' },
      declaredControllers: ['PLC1'],
      assignedTags: assigned,
    });
    const warns = r.diagnostics.filter((d) => d.code === 'PL-W010');
    expect(warns).toHaveLength(3);
    expect(warns.map((d) => d.message).join('\n')).toContain('M01.runCmd');
    expect(warns.map((d) => d.message).join('\n')).toContain('M01.runFb');
    expect(warns.map((d) => d.message).join('\n')).toContain('M01.overloadOk');
  });

  it('import có đủ 3 tag đã gán → không PL-W010', async () => {
    const { assigned } = await loadMotorInterlock();
    const r = validateImport({
      records: [
        { tag: 'RUN_CMD', address: '%Q0.0', signalType: 'DO' },
        { tag: 'RUN_FB', address: '%I0.4', signalType: 'DI' },
        { tag: 'OVL_OK', address: '%I0.2', signalType: 'DI' },
      ],
      rowNumbers: [7, 8, 9],
      origin: { file: 'new.csv' },
      declaredControllers: ['PLC1'],
      assignedTags: assigned,
    });
    expect(r.diagnostics.filter((d) => d.code === 'PL-W010')).toHaveLength(0);
  });
});
