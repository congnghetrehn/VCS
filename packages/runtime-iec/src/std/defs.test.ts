// Test defs std block — bảng O (STATE §20), tính tay từ M1 §3.4.
// expectedFrom: 'spec' (OQ-174).

import { describe, expect, it } from 'vitest';
import type { IrField } from '../ir.js';
import { getStdBlockDef, stdBlockInterface, STD_BLOCKS } from './defs.js';

/** Dạng gọn để deep-equal layout: [tên, kiểu, byteOffset, bitOffset|null, size, hidden?]. */
function compact(fields: IrField[]): [string, string, number, number | null, number, boolean][] {
  return fields.map((f) => [
    f.name,
    f.type as string,
    f.byteOffset,
    f.bitOffset ?? null,
    f.size,
    f.hidden ?? false,
  ]);
}

describe('std defs — layout bảng O (M1 §3.4)', () => {
  it('đủ 11 block', () => {
    expect([...STD_BLOCKS.keys()].sort()).toEqual([
      'CTD',
      'CTU',
      'CTUD',
      'F_TRIG',
      'RS',
      'R_TRIG',
      'SR',
      'TOF',
      'TON',
      'TONR',
      'TP',
    ]);
  });

  it('R_TRIG: CLK@0.0, Q@0.1, _m@0.2 (ẩn), size 2', () => {
    const def = getStdBlockDef('R_TRIG');
    expect(def).toBeDefined();
    expect(compact(def?.layout ?? [])).toEqual([
      ['CLK', 'Bool', 0, 0, 1, false],
      ['Q', 'Bool', 0, 1, 1, false],
      ['_m', 'Bool', 0, 2, 1, true],
    ]);
    expect(def?.size).toBe(2);
  });

  it('F_TRIG: CLK@0.0, Q@0.1, _m@0.2 (ẩn), size 2', () => {
    const def = getStdBlockDef('F_TRIG');
    expect(def).toBeDefined();
    expect(compact(def?.layout ?? [])).toEqual([
      ['CLK', 'Bool', 0, 0, 1, false],
      ['Q', 'Bool', 0, 1, 1, false],
      ['_m', 'Bool', 0, 2, 1, true],
    ]);
    expect(def?.size).toBe(2);
  });

  it('SR: S1@0.0, R@0.1, Q1@0.2, size 2 (không hidden)', () => {
    const def = getStdBlockDef('SR');
    expect(def).toBeDefined();
    expect(compact(def?.layout ?? [])).toEqual([
      ['S1', 'Bool', 0, 0, 1, false],
      ['R', 'Bool', 0, 1, 1, false],
      ['Q1', 'Bool', 0, 2, 1, false],
    ]);
    expect(def?.size).toBe(2);
    expect(def?.hidden).toEqual([]);
  });

  it('RS: S@0.0, R1@0.1, Q1@0.2, size 2 (không hidden)', () => {
    const def = getStdBlockDef('RS');
    expect(def).toBeDefined();
    expect(compact(def?.layout ?? [])).toEqual([
      ['S', 'Bool', 0, 0, 1, false],
      ['R1', 'Bool', 0, 1, 1, false],
      ['Q1', 'Bool', 0, 2, 1, false],
    ]);
    expect(def?.size).toBe(2);
    expect(def?.hidden).toEqual([]);
  });

  it('TON: IN@0.0, PT@2, Q@6.0, ET@8, _start@12, _running@16.0, _prevIn@16.1, size 18', () => {
    const def = getStdBlockDef('TON');
    expect(def).toBeDefined();
    expect(compact(def?.layout ?? [])).toEqual([
      ['IN', 'Bool', 0, 0, 1, false],
      ['PT', 'Time', 2, null, 4, false],
      ['Q', 'Bool', 6, 0, 1, false],
      ['ET', 'Time', 8, null, 4, false],
      ['_start', 'DInt', 12, null, 4, true],
      ['_running', 'Bool', 16, 0, 1, true],
      ['_prevIn', 'Bool', 16, 1, 1, true],
    ]);
    expect(def?.size).toBe(18);
  });

  it('TOF: layout như TON, size 18', () => {
    const def = getStdBlockDef('TOF');
    expect(def).toBeDefined();
    expect(compact(def?.layout ?? [])).toEqual(compact(getStdBlockDef('TON')?.layout ?? []));
    expect(def?.size).toBe(18);
  });

  it('TP: layout như TON, size 18', () => {
    const def = getStdBlockDef('TP');
    expect(def).toBeDefined();
    expect(compact(def?.layout ?? [])).toEqual(compact(getStdBlockDef('TON')?.layout ?? []));
    expect(def?.size).toBe(18);
  });

  it('TONR: thêm R@0.1 và _accum@18, size 22', () => {
    const def = getStdBlockDef('TONR');
    expect(def).toBeDefined();
    expect(compact(def?.layout ?? [])).toEqual([
      ['IN', 'Bool', 0, 0, 1, false],
      ['R', 'Bool', 0, 1, 1, false],
      ['PT', 'Time', 2, null, 4, false],
      ['Q', 'Bool', 6, 0, 1, false],
      ['ET', 'Time', 8, null, 4, false],
      ['_start', 'DInt', 12, null, 4, true],
      ['_running', 'Bool', 16, 0, 1, true],
      ['_prevIn', 'Bool', 16, 1, 1, true],
      ['_accum', 'DInt', 18, null, 4, true],
    ]);
    expect(def?.size).toBe(22);
  });

  it('CTU: CU@0.0, R@0.1, PV@2, QU@4.0, CV@6, _prevCU@8.0, size 10', () => {
    const def = getStdBlockDef('CTU');
    expect(def).toBeDefined();
    expect(compact(def?.layout ?? [])).toEqual([
      ['CU', 'Bool', 0, 0, 1, false],
      ['R', 'Bool', 0, 1, 1, false],
      ['PV', 'Int', 2, null, 2, false],
      ['QU', 'Bool', 4, 0, 1, false],
      ['CV', 'Int', 6, null, 2, false],
      ['_prevCU', 'Bool', 8, 0, 1, true],
    ]);
    expect(def?.size).toBe(10);
  });

  it('CTD: CD@0.0, LD@0.1, PV@2, QD@4.0, CV@6, _prevCD@8.0, size 10', () => {
    const def = getStdBlockDef('CTD');
    expect(def).toBeDefined();
    expect(compact(def?.layout ?? [])).toEqual([
      ['CD', 'Bool', 0, 0, 1, false],
      ['LD', 'Bool', 0, 1, 1, false],
      ['PV', 'Int', 2, null, 2, false],
      ['QD', 'Bool', 4, 0, 1, false],
      ['CV', 'Int', 6, null, 2, false],
      ['_prevCD', 'Bool', 8, 0, 1, true],
    ]);
    expect(def?.size).toBe(10);
  });

  it('CTUD: CU@0.0, CD@0.1, R@0.2, LD@0.3, PV@2, QU@4.0, QD@4.1, CV@6, _prevCU@8.0, _prevCD@8.1, size 10', () => {
    const def = getStdBlockDef('CTUD');
    expect(def).toBeDefined();
    expect(compact(def?.layout ?? [])).toEqual([
      ['CU', 'Bool', 0, 0, 1, false],
      ['CD', 'Bool', 0, 1, 1, false],
      ['R', 'Bool', 0, 2, 1, false],
      ['LD', 'Bool', 0, 3, 1, false],
      ['PV', 'Int', 2, null, 2, false],
      ['QU', 'Bool', 4, 0, 1, false],
      ['QD', 'Bool', 4, 1, 1, false],
      ['CV', 'Int', 6, null, 2, false],
      ['_prevCU', 'Bool', 8, 0, 1, true],
      ['_prevCD', 'Bool', 8, 1, 1, true],
    ]);
    expect(def?.size).toBe(10);
  });

  it("stdBlockInterface('TON'): input/output đúng, không IN_OUT/temp", () => {
    const iface = stdBlockInterface('TON');
    expect(iface).toEqual({
      input: [
        { name: 'IN', type: 'Bool' },
        { name: 'PT', type: 'Time' },
      ],
      output: [
        { name: 'Q', type: 'Bool' },
        { name: 'ET', type: 'Time' },
      ],
      inout: [],
      static: [],
      temp: [],
    });
  });

  it("R/LD mang init: false (tùy chọn, OQ-181) ở TONR/CTU/CTD/CTUD", () => {
    expect(stdBlockInterface('TONR')?.input).toEqual([
      { name: 'IN', type: 'Bool' },
      { name: 'R', type: 'Bool', init: false },
      { name: 'PT', type: 'Time' },
    ]);
    expect(stdBlockInterface('CTU')?.input).toEqual([
      { name: 'CU', type: 'Bool' },
      { name: 'R', type: 'Bool', init: false },
      { name: 'PV', type: 'Int' },
    ]);
    expect(stdBlockInterface('CTD')?.input).toEqual([
      { name: 'CD', type: 'Bool' },
      { name: 'LD', type: 'Bool', init: false },
      { name: 'PV', type: 'Int' },
    ]);
    expect(stdBlockInterface('CTUD')?.input).toEqual([
      { name: 'CU', type: 'Bool' },
      { name: 'CD', type: 'Bool' },
      { name: 'R', type: 'Bool', init: false },
      { name: 'LD', type: 'Bool', init: false },
      { name: 'PV', type: 'Int' },
    ]);
  });

  it("getStdBlockDef('nope') → undefined; tra cứu không phân biệt hoa/thường", () => {
    expect(getStdBlockDef('nope')).toBeUndefined();
    expect(getStdBlockDef('ton')?.name).toBe('TON');
    expect(getStdBlockDef('CtUd')?.name).toBe('CTUD');
    expect(stdBlockInterface('nope')).toBeUndefined();
  });
});
