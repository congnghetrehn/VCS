// Test handler std block trực tiếp với DbStore tay + nowMs cho trước
// (không qua SoftPlc). Kỳ vọng tính tay từ M1 §9 + bảng A–N (STATE §20).
// expectedFrom: 'spec' (OQ-174).

import type { TagValue } from '@vcs/schemas';
import { describe, expect, it } from 'vitest';
import type { IrField } from '../ir.js';
import {
  readMemValue,
  writeMemValue,
  type DbView,
  type Ref,
  type SysCallHandler,
} from '../interpreter.js';
import { DbStore } from '../memory.js';
import { getStdBlockDef } from './defs.js';
import { createStdSysCalls } from './handlers.js';

const SYS = createStdSysCalls();

function handler(name: string): SysCallHandler {
  const h = SYS.get(name);
  if (h === undefined) throw new Error(`thiếu handler '${name}'`);
  return h;
}

/** View vào DB tay cho một std block (store trống = mọi field 0/false). */
function viewFor(block: string): { view: DbView; store: DbStore } {
  const def = getStdBlockDef(block);
  if (def === undefined) throw new Error(`thiếu def '${block}'`);
  const store = new DbStore(1, def.size);
  return { view: { store, fields: def.layout, base: 0 }, store };
}

function fieldOf(block: string, name: string): IrField {
  const def = getStdBlockDef(block);
  const f = def?.layout.find((x) => x.name === name);
  if (f === undefined) throw new Error(`thiếu field '${name}' của '${block}'`);
  return f;
}

function readOut(store: DbStore, block: string, name: string): TagValue {
  return readMemValue(store, fieldOf(block, name).byteOffset, fieldOf(block, name));
}

function writeField(store: DbStore, block: string, name: string, value: TagValue): void {
  const f = fieldOf(block, name);
  writeMemValue(store, f.byteOffset, f, value);
}

function args(entries: [string, TagValue][]): Map<string, TagValue> {
  return new Map(entries);
}

function noOut(): Map<string, Ref> {
  return new Map();
}

describe('std handlers — TON (M1 §9.3)', () => {
  it('cơ bản PT=3000: Q lên ở elapsed=3000, ET kẹp ở PT (bảng A thu gọn)', () => {
    const h = handler('TON');
    const { view, store } = viewFor('TON');
    const call = (nowMs: number, inVal: boolean): [number, boolean] => {
      h(view, args([['IN', inVal], ['PT', 3000]]), noOut(), nowMs);
      return [readOut(store, 'TON', 'ET') as number, readOut(store, 'TON', 'Q') as boolean];
    };
    expect(call(100, false)).toEqual([0, false]);
    expect(call(200, true)).toEqual([0, false]);
    expect(call(300, true)).toEqual([100, false]);
    expect(call(3100, true)).toEqual([2900, false]);
    expect(call(3200, true)).toEqual([3000, true]);
    expect(call(3300, true)).toEqual([3000, true]);
    expect(call(3400, false)).toEqual([0, false]);
  });

  it('PT=0: Q=IN ngay, ET=0 (bảng B1)', () => {
    const h = handler('TON');
    const { view, store } = viewFor('TON');
    const call = (nowMs: number, inVal: boolean): [number, boolean] => {
      h(view, args([['IN', inVal], ['PT', 0]]), noOut(), nowMs);
      return [readOut(store, 'TON', 'ET') as number, readOut(store, 'TON', 'Q') as boolean];
    };
    expect(call(100, false)).toEqual([0, false]);
    expect(call(200, true)).toEqual([0, true]);
    expect(call(300, true)).toEqual([0, true]);
    expect(call(400, false)).toEqual([0, false]);
  });

  it('PT=50 (không chia hết chu kỳ): Q lật ở scan đầu elapsed ≥ PT, ET kẹp 50 (bảng B2)', () => {
    const h = handler('TON');
    const { view, store } = viewFor('TON');
    const call = (nowMs: number, inVal: boolean): [number, boolean] => {
      h(view, args([['IN', inVal], ['PT', 50]]), noOut(), nowMs);
      return [readOut(store, 'TON', 'ET') as number, readOut(store, 'TON', 'Q') as boolean];
    };
    expect(call(100, false)).toEqual([0, false]);
    expect(call(200, true)).toEqual([0, false]);
    expect(call(300, true)).toEqual([50, true]);
  });

  it('IN xuống → reset, đếm lại từ đầu (bảng C thu gọn)', () => {
    const h = handler('TON');
    const { view, store } = viewFor('TON');
    const call = (nowMs: number, inVal: boolean): [number, boolean] => {
      h(view, args([['IN', inVal], ['PT', 1000]]), noOut(), nowMs);
      return [readOut(store, 'TON', 'ET') as number, readOut(store, 'TON', 'Q') as boolean];
    };
    expect(call(200, true)).toEqual([0, false]);
    expect(call(400, true)).toEqual([200, false]);
    expect(call(500, false)).toEqual([0, false]);
    expect(call(700, true)).toEqual([0, false]);
    expect(call(1700, true)).toEqual([1000, true]);
  });
});

describe('std handlers — TOF (M1 §9.3)', () => {
  it('cơ bản PT=2000: cạnh xuống đếm, Q=false ở elapsed=2000, ET giữ PT (bảng E thu gọn)', () => {
    const h = handler('TOF');
    const { view, store } = viewFor('TOF');
    const call = (nowMs: number, inVal: boolean): [number, boolean] => {
      h(view, args([['IN', inVal], ['PT', 2000]]), noOut(), nowMs);
      return [readOut(store, 'TOF', 'ET') as number, readOut(store, 'TOF', 'Q') as boolean];
    };
    expect(call(100, true)).toEqual([0, true]);
    expect(call(500, false)).toEqual([0, true]);
    expect(call(1500, false)).toEqual([1000, true]);
    expect(call(2500, false)).toEqual([2000, false]);
    expect(call(2600, false)).toEqual([2000, false]);
    expect(call(3000, true)).toEqual([0, true]);
  });

  it('retrigger: IN lên giữa chừng hủy đếm, cạnh xuống mới đếm lại (bảng F thu gọn)', () => {
    const h = handler('TOF');
    const { view, store } = viewFor('TOF');
    const call = (nowMs: number, inVal: boolean): [number, boolean] => {
      h(view, args([['IN', inVal], ['PT', 2000]]), noOut(), nowMs);
      return [readOut(store, 'TOF', 'ET') as number, readOut(store, 'TOF', 'Q') as boolean];
    };
    expect(call(100, true)).toEqual([0, true]);
    expect(call(500, false)).toEqual([0, true]);
    expect(call(1400, false)).toEqual([900, true]);
    expect(call(1500, true)).toEqual([0, true]);
    expect(call(2000, false)).toEqual([0, true]);
    expect(call(4000, false)).toEqual([2000, false]);
  });

  it('PT=0: cạnh xuống → Q=false ngay trong scan đó, ET=0', () => {
    const h = handler('TOF');
    const { view, store } = viewFor('TOF');
    const call = (nowMs: number, inVal: boolean): [number, boolean] => {
      h(view, args([['IN', inVal], ['PT', 0]]), noOut(), nowMs);
      return [readOut(store, 'TOF', 'ET') as number, readOut(store, 'TOF', 'Q') as boolean];
    };
    expect(call(100, true)).toEqual([0, true]);
    expect(call(200, false)).toEqual([0, false]);
  });
});

describe('std handlers — TP (M1 §9.3)', () => {
  it('cơ bản PT=1000: xung hết + IN vẫn true → ET giữ PT, không kích lại (bảng G thu gọn)', () => {
    const h = handler('TP');
    const { view, store } = viewFor('TP');
    const call = (nowMs: number, inVal: boolean): [number, boolean] => {
      h(view, args([['IN', inVal], ['PT', 1000]]), noOut(), nowMs);
      return [readOut(store, 'TP', 'ET') as number, readOut(store, 'TP', 'Q') as boolean];
    };
    expect(call(200, true)).toEqual([0, true]);
    expect(call(1100, true)).toEqual([900, true]);
    expect(call(1200, true)).toEqual([1000, false]);
    expect(call(1300, true)).toEqual([1000, false]);
    expect(call(1500, false)).toEqual([0, false]);
    expect(call(1600, true)).toEqual([0, true]);
  });

  it('cạnh lên trong lúc phát xung bị bỏ qua, xung kết thúc đúng t=1200 (bảng H)', () => {
    const h = handler('TP');
    const { view, store } = viewFor('TP');
    const call = (nowMs: number, inVal: boolean): [number, boolean] => {
      h(view, args([['IN', inVal], ['PT', 1000]]), noOut(), nowMs);
      return [readOut(store, 'TP', 'ET') as number, readOut(store, 'TP', 'Q') as boolean];
    };
    expect(call(200, true)).toEqual([0, true]);
    expect(call(400, false)).toEqual([200, true]);
    expect(call(600, true)).toEqual([400, true]);
    expect(call(1200, true)).toEqual([1000, false]);
  });

  it('xung kết thúc + IN false → ET=0 ngay trong scan đó (bảng H2)', () => {
    const h = handler('TP');
    const { view, store } = viewFor('TP');
    const call = (nowMs: number, inVal: boolean): [number, boolean] => {
      h(view, args([['IN', inVal], ['PT', 1000]]), noOut(), nowMs);
      return [readOut(store, 'TP', 'ET') as number, readOut(store, 'TP', 'Q') as boolean];
    };
    expect(call(200, true)).toEqual([0, true]);
    expect(call(400, false)).toEqual([200, true]);
    expect(call(1200, false)).toEqual([0, false]);
  });
});

describe('std handlers — TONR (M1 §9.3)', () => {
  it('tích lũy qua IN xuống/lên, R thắng IN cùng scan (bảng I thu gọn)', () => {
    const h = handler('TONR');
    const { view, store } = viewFor('TONR');
    const call = (nowMs: number, inVal: boolean, r = false): [number, boolean] => {
      h(view, args([['IN', inVal], ['R', r], ['PT', 1000]]), noOut(), nowMs);
      return [readOut(store, 'TONR', 'ET') as number, readOut(store, 'TONR', 'Q') as boolean];
    };
    expect(call(200, true)).toEqual([0, false]);
    expect(call(600, true)).toEqual([400, false]);
    expect(call(700, false)).toEqual([500, false]);
    expect(call(1200, true)).toEqual([500, false]);
    expect(call(1700, true)).toEqual([1000, true]);
    expect(call(2000, true, true)).toEqual([0, false]);
    expect(call(2100, true)).toEqual([0, false]);
  });

  it('PT=0: Q=IN, ET=0, _accum giữ 0 (bảng I3)', () => {
    const h = handler('TONR');
    const { view, store } = viewFor('TONR');
    const call = (nowMs: number, inVal: boolean): [number, boolean, number] => {
      h(view, args([['IN', inVal], ['PT', 0]]), noOut(), nowMs);
      return [
        readOut(store, 'TONR', 'ET') as number,
        readOut(store, 'TONR', 'Q') as boolean,
        readOut(store, 'TONR', '_accum') as number,
      ];
    };
    expect(call(100, true)).toEqual([0, true, 0]);
    expect(call(200, false)).toEqual([0, false, 0]);
  });
});

describe('std handlers — R_TRIG / F_TRIG (M1 §9.1)', () => {
  it('R_TRIG pattern 7 scan (bảng J)', () => {
    const h = handler('R_TRIG');
    const { view, store } = viewFor('R_TRIG');
    const clks = [false, false, true, true, false, true, false];
    const expected = [false, false, true, false, false, true, false];
    clks.forEach((clk, i) => {
      h(view, args([['CLK', clk]]), noOut(), (i + 1) * 10);
      expect(readOut(store, 'R_TRIG', 'Q')).toBe(expected[i]);
    });
  });

  it('F_TRIG pattern 7 scan (bảng J)', () => {
    const h = handler('F_TRIG');
    const { view, store } = viewFor('F_TRIG');
    const clks = [false, false, true, true, false, true, false];
    const expected = [false, false, false, false, true, false, true];
    clks.forEach((clk, i) => {
      h(view, args([['CLK', clk]]), noOut(), (i + 1) * 10);
      expect(readOut(store, 'F_TRIG', 'Q')).toBe(expected[i]);
    });
  });
});

describe('std handlers — SR / RS (M1 §9.2)', () => {
  it('SR: set-giữ-reset; cả hai true → Q1=true (bảng K)', () => {
    const h = handler('SR');
    const { view, store } = viewFor('SR');
    const rows: [boolean, boolean, boolean][] = [
      [false, false, false],
      [true, false, true],
      [false, false, true],
      [false, true, false],
      [true, true, true],
      [false, true, false],
    ];
    rows.forEach(([s1, r, q1], i) => {
      h(view, args([['S1', s1], ['R', r]]), noOut(), (i + 1) * 10);
      expect(readOut(store, 'SR', 'Q1')).toBe(q1);
    });
  });

  it('RS: set-giữ-reset; cả hai true → Q1=false (bảng K)', () => {
    const h = handler('RS');
    const { view, store } = viewFor('RS');
    const rows: [boolean, boolean, boolean][] = [
      [false, false, false],
      [true, false, true],
      [false, false, true],
      [false, true, false],
      [true, true, false],
      [true, false, true],
    ];
    rows.forEach(([s, r1, q1], i) => {
      h(view, args([['S', s], ['R1', r1]]), noOut(), (i + 1) * 10);
      expect(readOut(store, 'RS', 'Q1')).toBe(q1);
    });
  });
});

describe('std handlers — CTU (M1 §9.4)', () => {
  it('đếm theo cạnh lên, QU khi CV ≥ PV, CU giữ không đếm (bảng L thu gọn)', () => {
    const h = handler('CTU');
    const { view, store } = viewFor('CTU');
    const call = (nowMs: number, cu: boolean, r = false): [number, boolean] => {
      h(view, args([['CU', cu], ['R', r], ['PV', 3]]), noOut(), nowMs);
      return [readOut(store, 'CTU', 'CV') as number, readOut(store, 'CTU', 'QU') as boolean];
    };
    expect(call(10, false)).toEqual([0, false]);
    expect(call(20, true)).toEqual([1, false]);
    expect(call(30, false)).toEqual([1, false]);
    expect(call(40, true)).toEqual([2, false]);
    expect(call(50, true)).toEqual([2, false]);
    expect(call(60, false)).toEqual([2, false]);
    expect(call(70, true)).toEqual([3, true]);
    expect(call(90, true, true)).toEqual([0, false]);
    expect(call(100, true)).toEqual([0, false]);
  });

  it('R thắng đếm cùng scan (bảng L t=90 tách riêng)', () => {
    const h = handler('CTU');
    const { view, store } = viewFor('CTU');
    writeField(store, 'CTU', 'CV', 2);
    h(view, args([['CU', true], ['R', true], ['PV', 3]]), noOut(), 10);
    expect(readOut(store, 'CTU', 'CV')).toBe(0);
    expect(readOut(store, 'CTU', 'QU')).toBe(false);
  });

  it('kẹp max: CV=32767 + cạnh lên → giữ 32767, QU=true (bảng L3)', () => {
    const h = handler('CTU');
    const { view, store } = viewFor('CTU');
    writeField(store, 'CTU', 'CV', 32767);
    h(view, args([['CU', true], ['PV', 3]]), noOut(), 10);
    expect(readOut(store, 'CTU', 'CV')).toBe(32767);
    expect(readOut(store, 'CTU', 'QU')).toBe(true);
  });
});

describe('std handlers — CTD (M1 §9.4)', () => {
  it('LD nạp PV, đếm xuống theo cạnh lên, QD khi CV ≤ 0; LD thắng đếm (bảng M thu gọn)', () => {
    const h = handler('CTD');
    const { view, store } = viewFor('CTD');
    const call = (nowMs: number, cd: boolean, ld = false): [number, boolean] => {
      h(view, args([['CD', cd], ['LD', ld], ['PV', 3]]), noOut(), nowMs);
      return [readOut(store, 'CTD', 'CV') as number, readOut(store, 'CTD', 'QD') as boolean];
    };
    expect(call(10, false)).toEqual([0, true]);
    expect(call(20, false, true)).toEqual([3, false]);
    expect(call(30, false)).toEqual([3, false]);
    expect(call(40, true)).toEqual([2, false]);
    expect(call(50, false)).toEqual([2, false]);
    expect(call(70, true)).toEqual([1, false]);
    expect(call(80, false)).toEqual([1, false]);
    expect(call(90, true)).toEqual([0, true]);
    expect(call(100, false, true)).toEqual([3, false]);
    expect(call(110, true, true)).toEqual([3, false]);
  });

  it('kẹp min: CV=−32768 + cạnh lên → giữ −32768, QD=true (bảng M3)', () => {
    const h = handler('CTD');
    const { view, store } = viewFor('CTD');
    writeField(store, 'CTD', 'CV', -32768);
    h(view, args([['CD', true], ['PV', 3]]), noOut(), 10);
    expect(readOut(store, 'CTD', 'CV')).toBe(-32768);
    expect(readOut(store, 'CTD', 'QD')).toBe(true);
  });
});

describe('std handlers — CTUD (M1 §9.4)', () => {
  it('đếm lên/xuống, cả hai cạnh cùng lúc → giữ nguyên; R > LD (bảng N thu gọn)', () => {
    const h = handler('CTUD');
    const { view, store } = viewFor('CTUD');
    const call = (
      nowMs: number,
      cu: boolean,
      cd: boolean,
      r = false,
      ld = false,
    ): [number, boolean, boolean] => {
      h(
        view,
        args([['CU', cu], ['CD', cd], ['R', r], ['LD', ld], ['PV', 5]]),
        noOut(),
        nowMs,
      );
      return [
        readOut(store, 'CTUD', 'CV') as number,
        readOut(store, 'CTUD', 'QU') as boolean,
        readOut(store, 'CTUD', 'QD') as boolean,
      ];
    };
    expect(call(10, false, false)).toEqual([0, false, true]);
    expect(call(20, false, false, false, true)).toEqual([5, true, false]);
    expect(call(30, true, false)).toEqual([6, true, false]);
    expect(call(40, false, false)).toEqual([6, true, false]);
    expect(call(50, false, true)).toEqual([5, true, false]);
    expect(call(55, false, false)).toEqual([5, true, false]);
    expect(call(60, true, true)).toEqual([5, true, false]);
    expect(call(70, false, false)).toEqual([5, true, false]);
    expect(call(80, true, false, true)).toEqual([0, false, true]);
    expect(call(90, false, false, true, true)).toEqual([0, false, true]);
    expect(call(100, false, false, false, true)).toEqual([5, true, false]);
    expect(call(110, true, false)).toEqual([6, true, false]);
  });

  it('PV=0: CV=0 → QU và QD cùng true (bảng N4)', () => {
    const h = handler('CTUD');
    const { view, store } = viewFor('CTUD');
    h(view, args([['CU', false], ['CD', false], ['PV', 0]]), noOut(), 10);
    expect(readOut(store, 'CTUD', 'CV')).toBe(0);
    expect(readOut(store, 'CTUD', 'QU')).toBe(true);
    expect(readOut(store, 'CTUD', 'QD')).toBe(true);
    h(view, args([['CU', true], ['CD', false], ['PV', 0]]), noOut(), 20);
    expect(readOut(store, 'CTUD', 'CV')).toBe(1);
    expect(readOut(store, 'CTUD', 'QU')).toBe(true);
    expect(readOut(store, 'CTUD', 'QD')).toBe(false);
  });

  it('out-arg: handler ghi DB trước rồi ghi Ref cùng giá trị (OQ-175)', () => {
    const h = handler('CTU');
    const { view, store } = viewFor('CTU');
    let outCv: TagValue | undefined;
    let outQu: TagValue | undefined;
    const outArgs = new Map<string, Ref>([
      ['CV', { get: () => outCv as TagValue, set: (v) => { outCv = v; } }],
      ['QU', { get: () => outQu as TagValue, set: (v) => { outQu = v; } }],
    ]);
    h(view, args([['CU', true], ['PV', 1]]), outArgs, 10);
    expect(readOut(store, 'CTU', 'CV')).toBe(1);
    expect(outCv).toBe(1);
    expect(readOut(store, 'CTU', 'QU')).toBe(true);
    expect(outQu).toBe(true);
  });
});

describe('std handlers — lỗi nội bộ', () => {
  it('handler với instance undefined → throw ồn ào', () => {
    const h = handler('TON');
    expect(() => { h(undefined, args([['IN', true], ['PT', 1000]]), noOut(), 100); }).toThrow(
      /thiếu instance/,
    );
  });

  it('createStdSysCalls đủ 11 tên, key hoa', () => {
    expect([...SYS.keys()].sort()).toEqual([
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
});
