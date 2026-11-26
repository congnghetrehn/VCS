// Test logic thuần Tag Manager (lọc/nhóm/CSV) — P2.8 commit 7.
import { describe, expect, it } from 'vitest';
import type { SnapshotDef } from './store.js';
import {
  ALL,
  buildTagCsv,
  buildTagMetaMap,
  distinctEquipment,
  distinctRoles,
  filterTagRows,
  groupTagRows,
  type TagFilters,
} from './tag-manager.js';

function def(
  name: string,
  extra: Partial<SnapshotDef> = {},
): SnapshotDef {
  return {
    name,
    type: 'Bool',
    area: 'I',
    address: '%I0.0',
    controller: 'PLC1',
    owner: 'controller',
    writable: false,
    ...extra,
  };
}

const FILTERS: TagFilters = {
  query: '',
  controller: ALL,
  area: ALL,
  type: ALL,
  equipment: ALL,
};

describe('filterTagRows', () => {
  const defs = [
    def('RUN_CMD', { area: 'Q', address: '%Q0.0' }),
    def('RUN_FB', { address: '%I0.4' }),
    def('PT01_PV', { type: 'Real', address: '%IW4' }),
  ];
  const meta = buildTagMetaMap([
    { name: 'RUN_CMD', equipment: 'M01', role: 'runCmd' },
    { name: 'RUN_FB', equipment: 'M01', role: 'runFb' },
    { name: 'PT01_PV', equipment: 'PT01', role: 'pv' },
  ]);

  it('không lọc → đủ hàng, join equipment/role + value theo defIndex', () => {
    const rows = filterTagRows(defs, meta, new Map([[2, 12.5]]), FILTERS);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.equipment).toBe('M01');
    expect(rows[0]?.role).toBe('runCmd');
    expect(rows[0]?.value).toBeUndefined();
    expect(rows[2]?.value).toBe(12.5);
  });

  it('lọc equipment: chỉ M01 (2 hàng); chưa gán = rỗng', () => {
    const rows = filterTagRows(defs, meta, new Map(), { ...FILTERS, equipment: 'M01' });
    expect(rows.map((r) => r.def.name)).toEqual(['RUN_CMD', 'RUN_FB']);
    const unassigned = filterTagRows(defs, buildTagMetaMap([]), new Map(), {
      ...FILTERS,
      equipment: '',
    });
    expect(unassigned).toHaveLength(3);
  });

  it('lọc type + query (tên/mô tả, không phân biệt hoa/thường) + AND', () => {
    const rows = filterTagRows(defs, meta, new Map(), { ...FILTERS, type: 'Real' });
    expect(rows.map((r) => r.def.name)).toEqual(['PT01_PV']);
    const q = filterTagRows(defs, meta, new Map(), { ...FILTERS, query: 'run' });
    expect(q.map((r) => r.def.name)).toEqual(['RUN_CMD', 'RUN_FB']);
    const both = filterTagRows(defs, meta, new Map(), {
      ...FILTERS,
      query: 'run',
      equipment: 'PT01',
    });
    expect(both).toHaveLength(0);
  });

  it('tag không có trong file → equipment/role rỗng', () => {
    const rows = filterTagRows(defs, buildTagMetaMap([]), new Map(), FILTERS);
    expect(rows[0]?.equipment).toBe('');
    expect(rows[0]?.role).toBe('');
  });
});

describe('groupTagRows', () => {
  const defs = [def('A'), def('B'), def('C')];
  const meta = buildTagMetaMap([
    { name: 'A', equipment: 'M02' },
    { name: 'B', equipment: 'M01' },
  ]);

  it('không nhóm → chỉ item row', () => {
    const items = groupTagRows(filterTagRows(defs, meta, new Map(), FILTERS), false);
    expect(items.map((i) => i.kind)).toEqual(['row', 'row', 'row']);
  });

  it('nhóm: M01 trước M02, chưa gán cuối; header đếm đúng', () => {
    const items = groupTagRows(filterTagRows(defs, meta, new Map(), FILTERS), true);
    expect(items.map((i) => (i.kind === 'group' ? `g:${i.equipment}:${String(i.count)}` : i.row.def.name))).toEqual([
      'g:M01:1',
      'B',
      'g:M02:1',
      'A',
      'g::1',
      'C',
    ]);
  });
});

describe('distinctEquipment/distinctRoles + buildTagCsv', () => {
  it('distinct sort A→Z, bỏ rỗng', () => {
    const meta = buildTagMetaMap([
      { name: 'A', equipment: 'M02', role: 'runFb' },
      { name: 'B', equipment: 'M01', role: 'runCmd' },
      { name: 'C' },
    ]);
    expect(distinctEquipment(meta)).toEqual(['M01', 'M02']);
    expect(distinctRoles(meta)).toEqual(['runCmd', 'runFb']);
  });

  it('CSV: header + quote khi chứa dấu phẩy/dấu ngoặc', () => {
    const defs = [def('A', { description: 'van, "chính"' })];
    const rows = filterTagRows(defs, buildTagMetaMap([{ name: 'A', equipment: 'M01' }]), new Map([[0, true]]), FILTERS);
    expect(buildTagCsv(rows)).toBe(
      'name,type,area,address,controller,description,equipment,role,value\n' +
        'A,Bool,I,%I0.0,PLC1,"van, ""chính""",M01,,TRUE\n',
    );
  });
});
