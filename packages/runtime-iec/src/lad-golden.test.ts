// Golden LAD A–L + property — P1.6 (STATE §21).
// IR dựng tay qua ir-testkit + SoftPlc (tiền lệ P1.4/P1.5); mọi số trong
// bảng tính tay từ spec, không sao chép từ implementation (AGENTS §6).
// Quy ước lưới scan: scan index i chạy ở T = i*period; scan 0 (T=0) là
// warm-up với input mặc định, các hàng trong bảng ứng với i ≥ 1.
// expectedFrom: 'spec' (OQ-174).

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { getStdBlockDef, type IrBlock, type IrDb, type IrExpr, type IrLValue, type IrProgram, type IrStmt, type IrType, type SoftPlc } from './index.js';
import {
  abs,
  assign,
  bin,
  bool,
  callFbStmt,
  callSysStmt,
  dbField,
  dbFromDecls,
  fbBlock,
  iface,
  ifStmt,
  load,
  local,
  makePlc,
  num,
  obBlock,
  prog,
  staticPath,
  stdDb,
  unary,
  v,
} from './ir-testkit.js';

const I00 = abs('I', 0, 'Bool', 0);
const I01 = abs('I', 0, 'Bool', 1);
const I02 = abs('I', 0, 'Bool', 2);
const I03 = abs('I', 0, 'Bool', 3);
const I04 = abs('I', 0, 'Bool', 4);
const Q00 = abs('Q', 0, 'Bool', 0);
const Q01 = abs('Q', 0, 'Bool', 1);
const M00 = abs('M', 0, 'Bool', 0);
const M01 = abs('M', 0, 'Bool', 1);

function rlo(name: string): ReturnType<typeof load> {
  return load(local(name), 'Bool');
}

function rloInit(name: string): IrStmt {
  return assign(local(name), bool(true));
}

function contactNO(rloName: string, ref: IrLValue): IrStmt {
  return assign(local(rloName), bin('and', rlo(rloName), load(ref, 'Bool'), 'Bool'));
}

function contactNC(rloName: string, ref: IrLValue): IrStmt {
  return assign(
    local(rloName),
    bin('and', rlo(rloName), unary('not', load(ref, 'Bool'), 'Bool'), 'Bool'),
  );
}

function coil(ref: IrLValue, rloName: string, negated = false): IrStmt {
  return assign(ref, negated ? unary('not', rlo(rloName), 'Bool') : rlo(rloName));
}

/** Một scan: step(T, dt) với T = scanCount * period (mẫu softplc.test.ts). */
function scanAt(plc: SoftPlc, period: number): void {
  plc.step(plc.getDiagnostics().scanCount * period, period);
}

/** Program với OB Main chạy mỗi scan (SoftPlc chỉ chạy block có trong
 * organization — prog() tay phải khai rõ, khác programFromCtx). */
function mainProg(blocks: IrBlock[], dbs: IrDb[] = []): IrProgram {
  return prog(blocks, dbs, [{ ob: 1, block: 'Main' }]);
}

function ladOb(body: IrStmt[], temps: string[], period = 10): SoftPlc {
  const plc = makePlc(mainProg([obBlock('Main', 1, body, temps.map((t) => v(t, 'Bool')))]), {
    scanPeriodMs: period,
  });
  plc.start();
  return plc;
}

describe('golden LAD — bảng A: series NO+NC+coil — expectedFrom: spec', () => {
  it('A: I0.0 NO, I0.1 NC, Q0.0 = I0.0 AND NOT I0.1', () => {
    const plc = ladOb(
      [
        rloInit('__lad_N1_rlo'),
        contactNO('__lad_N1_rlo', I00),
        contactNC('__lad_N1_rlo', I01),
        coil(Q00, '__lad_N1_rlo'),
      ],
      ['__lad_N1_rlo'],
    );
    // scan: 10 | 20 | 30 | 40 (index 1..4; index 0 warm-up)
    const i00 = [false, false, true, true, false];
    const i01 = [false, true, false, true, false];
    const expected = [false, false, true, false, false];
    for (let i = 0; i < 5; i++) {
      plc.write('%I0.0', i00[i] as boolean);
      plc.write('%I0.1', i01[i] as boolean);
      scanAt(plc, 10);
      expect(plc.read('%Q0.0')).toBe(expected[i]);
    }
  });
});

describe('golden LAD — bảng B: parallel (OR) — expectedFrom: spec', () => {
  it('B: Q0.0 = I0.0 OR (I0.1 AND I0.2)', () => {
    const plc = ladOb(
      [
        rloInit('__lad_N1_rlo'),
        assign(local('__lad_N1_b0'), rlo('__lad_N1_rlo')),
        contactNO('__lad_N1_b0', I00),
        assign(local('__lad_N1_b1'), rlo('__lad_N1_rlo')),
        contactNO('__lad_N1_b1', I01),
        contactNO('__lad_N1_b1', I02),
        assign(
          local('__lad_N1_rlo'),
          bin('or', rlo('__lad_N1_b0'), rlo('__lad_N1_b1'), 'Bool'),
        ),
        coil(Q00, '__lad_N1_rlo'),
      ],
      ['__lad_N1_rlo', '__lad_N1_b0', '__lad_N1_b1'],
    );
    const i00 = [false, false, false, true, false];
    const i01 = [false, true, true, false, false];
    const i02 = [false, true, false, false, true];
    const expected = [false, true, false, true, false];
    for (let i = 0; i < 5; i++) {
      plc.write('%I0.0', i00[i] as boolean);
      plc.write('%I0.1', i01[i] as boolean);
      plc.write('%I0.2', i02[i] as boolean);
      scanAt(plc, 10);
      expect(plc.read('%Q0.0')).toBe(expected[i]);
    }
  });
});

describe('golden LAD — bảng C: not + coil phủ định — expectedFrom: spec', () => {
  it('C: phủ định kép — Q0.0 = NOT (NOT I0.0) = I0.0', () => {
    const plc = ladOb(
      [
        rloInit('__lad_N1_rlo'),
        contactNO('__lad_N1_rlo', I00),
        assign(local('__lad_N1_rlo'), unary('not', rlo('__lad_N1_rlo'), 'Bool')),
        coil(Q00, '__lad_N1_rlo', true),
        rloInit('__lad_N2_rlo'),
        contactNO('__lad_N2_rlo', I00),
        coil(Q01, '__lad_N2_rlo'),
      ],
      ['__lad_N1_rlo', '__lad_N2_rlo'],
    );
    const i00 = [false, false, true];
    for (let i = 0; i < 3; i++) {
      plc.write('%I0.0', i00[i] as boolean);
      scanAt(plc, 10);
      expect(plc.read('%Q0.0')).toBe(i00[i]);
      expect(plc.read('%Q0.1')).toBe(i00[i]);
    }
  });
});

describe('golden LAD — bảng D: edge pos/neg — expectedFrom: spec', () => {
  it('D: pos/neg đối chiếu R_TRIG/F_TRIG', () => {
    const plc = ladOb(
      [
        // N1: pos %I0.0 mem %M0.0 → %Q0.0
        rloInit('__lad_N1_rlo'),
        assign(
          local('__lad_N1_rlo'),
          bin(
            'and',
            rlo('__lad_N1_rlo'),
            bin('and', load(I00, 'Bool'), unary('not', load(M00, 'Bool'), 'Bool'), 'Bool'),
            'Bool',
          ),
        ),
        assign(M00, load(I00, 'Bool')),
        coil(Q00, '__lad_N1_rlo'),
        // N2: neg %I0.0 mem %M0.1 → %Q0.1
        rloInit('__lad_N2_rlo'),
        assign(
          local('__lad_N2_rlo'),
          bin(
            'and',
            rlo('__lad_N2_rlo'),
            bin('and', unary('not', load(I00, 'Bool'), 'Bool'), load(M01, 'Bool'), 'Bool'),
            'Bool',
          ),
        ),
        assign(M01, load(I00, 'Bool')),
        coil(Q01, '__lad_N2_rlo'),
      ],
      ['__lad_N1_rlo', '__lad_N2_rlo'],
    );
    const i00 = [false, false, false, true, true, false, true, false];
    const qPos = [false, false, false, true, false, false, true, false];
    const qNeg = [false, false, false, false, false, true, false, true];
    for (let i = 0; i < 8; i++) {
      plc.write('%I0.0', i00[i] as boolean);
      scanAt(plc, 10);
      expect(plc.read('%Q0.0')).toBe(qPos[i]);
      expect(plc.read('%Q0.1')).toBe(qNeg[i]);
      expect(plc.read('%M0.0')).toBe(i00[i]);
      expect(plc.read('%M0.1')).toBe(i00[i]);
    }
  });
});

describe('golden LAD — bảng E: set/reset — expectedFrom: spec', () => {
  it('E: SR latch — set rồi reset cùng scan → reset thắng', () => {
    const plc = ladOb(
      [
        rloInit('__lad_N1_rlo'),
        contactNO('__lad_N1_rlo', I00),
        ifStmt(rlo('__lad_N1_rlo'), [assign(M00, bool(true))]),
        rloInit('__lad_N2_rlo'),
        contactNO('__lad_N2_rlo', I01),
        ifStmt(rlo('__lad_N2_rlo'), [assign(M00, bool(false))]),
        rloInit('__lad_N3_rlo'),
        contactNO('__lad_N3_rlo', M00),
        coil(Q00, '__lad_N3_rlo'),
      ],
      ['__lad_N1_rlo', '__lad_N2_rlo', '__lad_N3_rlo'],
    );
    const i00 = [false, false, true, false, false, true, true];
    const i01 = [false, false, false, false, true, true, false];
    const m00 = [false, false, true, true, false, false, true];
    for (let i = 0; i < 7; i++) {
      plc.write('%I0.0', i00[i] as boolean);
      plc.write('%I0.1', i01[i] as boolean);
      scanAt(plc, 10);
      expect(plc.read('%M0.0')).toBe(m00[i]);
      expect(plc.read('%Q0.0')).toBe(m00[i]);
    }
  });
});

describe('golden LAD — bảng F: TON box + rlo sau = Q — expectedFrom: spec', () => {
  it('F: TON PT 3s, chu kỳ 100ms — Q lên ở scan 3200', () => {
    const body: IrStmt[] = [
      rloInit('__lad_N1_rlo'),
      contactNO('__lad_N1_rlo', I00),
      callSysStmt(
        'TON',
        [
          ['IN', load(I00, 'Bool')],
          ['PT', num(3000, 'Time')],
        ],
        [['Q', abs('M', 1, 'Bool', 0)]],
        dbField('T1', []),
      ),
      assign(local('__lad_N1_rlo'), load(dbField('T1', ['Q']), 'Bool')),
      coil(Q00, '__lad_N1_rlo'),
    ];
    const plc = makePlc(
      mainProg([obBlock('Main', 1, body, [v('__lad_N1_rlo', 'Bool')])], [stdDb('T1', 'TON')]),
      { scanPeriodMs: 100 },
    );
    plc.start();
    // index: 0 warm-up; 1: F@100; 2..33: T@200..3300; 34: F@3400
    const expected: Record<number, { et: number; q: boolean }> = {
      1: { et: 0, q: false },
      2: { et: 0, q: false },
      3: { et: 100, q: false },
      11: { et: 900, q: false },
      31: { et: 2900, q: false },
      32: { et: 3000, q: true },
      33: { et: 3000, q: true },
      34: { et: 0, q: false },
    };
    for (let i = 0; i <= 34; i++) {
      plc.write('%I0.0', i >= 2 && i <= 33);
      scanAt(plc, 100);
      const e = expected[i];
      if (e !== undefined) {
        expect(plc.read('"T1".ET')).toBe(e.et);
        expect(plc.read('"T1".Q')).toBe(e.q);
        expect(plc.read('%Q0.0')).toBe(e.q);
      }
    }
  });
});

describe('golden LAD — bảng G: CTU + compare EQ — expectedFrom: spec', () => {
  it('G: CTU PV=3, EQ(CV==3) — Q lên ở scan 70, xuống ở scan 90', () => {
    const mw10 = abs('M', 10, 'Int');
    const body: IrStmt[] = [
      rloInit('__lad_N1_rlo'),
      callSysStmt(
        'CTU',
        [
          ['CU', load(I00, 'Bool')],
          ['R', load(I01, 'Bool')],
          ['PV', num(3, 'Int')],
        ],
        [['CV', mw10]],
        dbField('C1', []),
      ),
      assign(local('__lad_N1_rlo'), load(dbField('C1', ['QU']), 'Bool')),
      assign(
        local('__lad_N1_rlo'),
        bin(
          'and',
          rlo('__lad_N1_rlo'),
          bin('eq', load(mw10, 'Int'), num(3, 'Int'), 'Bool'),
          'Bool',
        ),
      ),
      coil(Q00, '__lad_N1_rlo'),
    ];
    const plc = makePlc(
      mainProg([obBlock('Main', 1, body, [v('__lad_N1_rlo', 'Bool')])], [stdDb('C1', 'CTU')]),
      { scanPeriodMs: 10 },
    );
    plc.start();
    const cu = [false, false, true, false, true, false, false, true, false, true];
    const cv = [0, 0, 1, 1, 2, 2, 2, 3, 3, 4];
    const qu = [false, false, false, false, false, false, false, true, true, true];
    const q = [false, false, false, false, false, false, false, true, true, false];
    for (let i = 0; i < 10; i++) {
      plc.write('%I0.0', cu[i] as boolean);
      plc.write('%I0.1', false);
      scanAt(plc, 10);
      expect(plc.read('"C1".CV')).toBe(cv[i]);
      expect(plc.read('"C1".QU')).toBe(qu[i]);
      expect(plc.read('%MW10')).toBe(cv[i]);
      expect(plc.read('%Q0.0')).toBe(q[i]);
    }
  });
});

describe('golden LAD — bảng H: math + MOVE, EN gating — expectedFrom: spec', () => {
  it('H: ADD không chạy khi EN=false; MOVE khi EN', () => {
    const mw10 = abs('M', 10, 'Int');
    const mw12 = abs('M', 12, 'Int');
    const mw14 = abs('M', 14, 'Int');
    const body: IrStmt[] = [
      // N1: ADD %MW10 + 5 → %MW12 (EN = I0.0)
      rloInit('__lad_N1_rlo'),
      contactNO('__lad_N1_rlo', I00),
      ifStmt(rlo('__lad_N1_rlo'), [
        assign(mw12, bin('add', load(mw10, 'Int'), num(5, 'Int'), 'Int')),
      ]),
      coil(Q00, '__lad_N1_rlo'),
      // N2: MOVE %MW12 → %MW14 (EN = I0.1)
      rloInit('__lad_N2_rlo'),
      contactNO('__lad_N2_rlo', I01),
      ifStmt(rlo('__lad_N2_rlo'), [assign(mw14, load(mw12, 'Int'))]),
    ];
    const plc = makePlc(
      mainProg([obBlock('Main', 1, body, [v('__lad_N1_rlo', 'Bool'), v('__lad_N2_rlo', 'Bool')])]),
      { scanPeriodMs: 10 },
    );
    plc.start();
    plc.write('%MW10', 10);
    const i00 = [false, false, true, true, false, false, false];
    const i01 = [false, false, false, false, false, true, false];
    const mw12Exp = [0, 0, 15, 15, 15, 15, 15];
    const qExp = [false, false, true, true, false, false, false];
    const mw14Exp = [0, 0, 0, 0, 0, 15, 15];
    for (let i = 0; i < 7; i++) {
      plc.write('%I0.0', i00[i] as boolean);
      plc.write('%I0.1', i01[i] as boolean);
      scanAt(plc, 10);
      expect(plc.read('%MW12')).toBe(mw12Exp[i]);
      expect(plc.read('%Q0.0')).toBe(qExp[i]);
      expect(plc.read('%MW14')).toBe(mw14Exp[i]);
    }
  });
});

describe('golden LAD — bảng I: multi-network cùng scan — expectedFrom: spec', () => {
  it('I: network sau đọc giá trị network trước ghi cùng scan', () => {
    const plc = ladOb(
      [
        rloInit('__lad_N1_rlo'),
        contactNO('__lad_N1_rlo', I00),
        coil(M00, '__lad_N1_rlo'),
        rloInit('__lad_N2_rlo'),
        contactNO('__lad_N2_rlo', M00),
        coil(Q00, '__lad_N2_rlo'),
      ],
      ['__lad_N1_rlo', '__lad_N2_rlo'],
    );
    const i00 = [false, false, true, false];
    for (let i = 0; i < 4; i++) {
      plc.write('%I0.0', i00[i] as boolean);
      scanAt(plc, 10);
      expect(plc.read('%M0.0')).toBe(i00[i]);
      expect(plc.read('%Q0.0')).toBe(i00[i]);
    }
  });
});

describe('golden LAD — bảng J: FB LAD multi-instance — expectedFrom: spec', () => {
  it('J: FB_Lad với static TON — Q lên ở scan 500', () => {
    const tonDef = getStdBlockDef('TON');
    if (tonDef === undefined) throw new Error('không có TON');
    const tonStruct: IrType = { kind: 'struct', fields: tonDef.layout };
    const fbIface = iface(
      [v('iStart', 'Bool')],
      [v('qRun', 'Bool')],
      [],
      [v('sT', tonStruct)],
      [v('__lad_N1_rlo', 'Bool')],
    );
    const fbBody: IrStmt[] = [
      rloInit('__lad_N1_rlo'),
      contactNO('__lad_N1_rlo', local('iStart')),
      callSysStmt(
        'TON',
        [
          ['IN', load(local('iStart'), 'Bool')],
          ['PT', num(300, 'Time')],
        ],
        [],
        // Instance là {k:'local'} (như SCL lower #sT(...)) — KHÔNG phải
        // {k:'static'}: interpreter resolveInstance chỉ nhận local/dbField.
        // (Lệch so với ghi chú IR bảng J trong plan §21 — xem STATE §21.)
        local('sT'),
      ),
      assign(local('__lad_N1_rlo'), load(staticPath(['sT', 'Q']), 'Bool')),
      assign(local('qRun'), rlo('__lad_N1_rlo')),
    ];
    const fb: IrBlock = fbBlock('FB_Lad', fbIface, fbBody);
    const db = dbFromDecls(
      'FB_Lad_DB',
      [
        { name: 'iStart', type: 'Bool' },
        { name: 'qRun', type: 'Bool' },
        { name: 'sT', type: tonStruct },
      ],
      'FB_Lad',
    );
    const ob: IrBlock = obBlock(
      'Main',
      1,
      [
        callFbStmt(
          'FB_Lad',
          dbField('FB_Lad_DB', []),
          [['iStart', load(I00, 'Bool')]],
          [['qRun', Q00]],
        ),
      ],
      [],
    );
    const plc = makePlc(mainProg([ob, fb], [db]), { scanPeriodMs: 100 });
    plc.start();
    // index: 0 warm-up; 1: F@100; 2..5: T@200..500; 6: F@600
    const iStart = [false, false, true, true, true, true, false];
    const et = [0, 0, 0, 100, 200, 300, 0];
    const q = [false, false, false, false, false, true, false];
    for (let i = 0; i < 7; i++) {
      plc.write('%I0.0', iStart[i] as boolean);
      scanAt(plc, 100);
      expect(plc.read('"FB_Lad_DB".sT.ET')).toBe(et[i]);
      expect(plc.read('"FB_Lad_DB".sT.Q')).toBe(q[i]);
      expect(plc.read('"FB_Lad_DB".qRun')).toBe(q[i]);
      expect(plc.read('%Q0.0')).toBe(q[i]);
    }
  });
});

describe('golden LAD — bảng K: parallel lồng nhau — expectedFrom: spec', () => {
  it('K: Q0.0 = (I0.0 AND I0.1) OR (I0.2 OR (I0.3 AND I0.4))', () => {
    const plc = ladOb(
      [
        rloInit('__lad_N1_rlo'),
        // nhánh ngoài 1: I0.0 AND I0.1
        assign(local('__lad_N1_b0'), rlo('__lad_N1_rlo')),
        contactNO('__lad_N1_b0', I00),
        contactNO('__lad_N1_b0', I01),
        // nhánh ngoài 2 = parallel lồng: I0.2 OR (I0.3 AND I0.4)
        assign(local('__lad_N1_b1'), rlo('__lad_N1_rlo')),
        assign(local('__lad_N1_b2'), rlo('__lad_N1_b1')),
        contactNO('__lad_N1_b2', I02),
        assign(local('__lad_N1_b3'), rlo('__lad_N1_b1')),
        contactNO('__lad_N1_b3', I03),
        contactNO('__lad_N1_b3', I04),
        assign(
          local('__lad_N1_b1'),
          bin('or', rlo('__lad_N1_b2'), rlo('__lad_N1_b3'), 'Bool'),
        ),
        assign(
          local('__lad_N1_rlo'),
          bin('or', rlo('__lad_N1_b0'), rlo('__lad_N1_b1'), 'Bool'),
        ),
        coil(Q00, '__lad_N1_rlo'),
      ],
      ['__lad_N1_rlo', '__lad_N1_b0', '__lad_N1_b1', '__lad_N1_b2', '__lad_N1_b3'],
    );
    const rows: [boolean, boolean, boolean, boolean, boolean, boolean][] = [
      // I0.0, I0.1, I0.2, I0.3, I0.4, Q0.0
      [false, false, false, false, false, false], // warm-up
      [true, true, false, false, false, true],
      [true, false, false, false, false, false],
      [false, false, true, false, false, true],
      [false, false, false, true, true, true],
      [false, false, false, true, false, false],
    ];
    for (const [a, b, c, d, e, q] of rows) {
      plc.write('%I0.0', a);
      plc.write('%I0.1', b);
      plc.write('%I0.2', c);
      plc.write('%I0.3', d);
      plc.write('%I0.4', e);
      scanAt(plc, 10);
      expect(plc.read('%Q0.0')).toBe(q);
    }
  });
});

describe('golden LAD — bảng L: EN=false, timer vẫn chạy — expectedFrom: spec', () => {
  it('L: TON chạy dù EN=false; ADD không chạy; coil sau TON lên dù contact mở (OQ-185)', () => {
    const mw20 = abs('M', 20, 'Int');
    const body: IrStmt[] = [
      // N1: EN=%I0.0 (F suốt), TON IN=%I0.1 PT=200ms → coil %Q0.0
      rloInit('__lad_N1_rlo'),
      contactNO('__lad_N1_rlo', I00),
      callSysStmt(
        'TON',
        [
          ['IN', load(I01, 'Bool')],
          ['PT', num(200, 'Time')],
        ],
        [],
        dbField('T1', []),
      ),
      assign(local('__lad_N1_rlo'), load(dbField('T1', ['Q']), 'Bool')),
      coil(Q00, '__lad_N1_rlo'),
      // N2: ADD 1+2 → %MW20 (EN = I0.0 = F suốt)
      rloInit('__lad_N2_rlo'),
      contactNO('__lad_N2_rlo', I00),
      ifStmt(rlo('__lad_N2_rlo'), [
        assign(mw20, bin('add', num(1, 'Int'), num(2, 'Int'), 'Int')),
      ]),
    ];
    const plc = makePlc(
      mainProg(
        [obBlock('Main', 1, body, [v('__lad_N1_rlo', 'Bool'), v('__lad_N2_rlo', 'Bool')])],
        [stdDb('T1', 'TON')],
      ),
      { scanPeriodMs: 100 },
    );
    plc.start();
    // index: 0 warm-up; 1: F@100; 2..5: T@200..500
    const i01 = [false, false, true, true, true, true];
    const et = [0, 0, 0, 100, 200, 200];
    const q = [false, false, false, false, true, true];
    for (let i = 0; i < 6; i++) {
      plc.write('%I0.0', false);
      plc.write('%I0.1', i01[i] as boolean);
      scanAt(plc, 100);
      expect(plc.read('"T1".ET')).toBe(et[i]);
      expect(plc.read('"T1".Q')).toBe(q[i]);
      expect(plc.read('%Q0.0')).toBe(q[i]);
      expect(plc.read('%MW20')).toBe(0);
    }
  });
});

// ---------------------------------------------------------- property

type BoolTree =
  | { t: 'leaf'; bit: number; neg: boolean }
  | { t: 'and'; children: BoolTree[] }
  | { t: 'or'; children: BoolTree[] };

const leafArb = fc.record({
  t: fc.constant('leaf' as const),
  bit: fc.integer({ min: 0, max: 2 }),
  neg: fc.boolean(),
});
const treeArb: fc.Arbitrary<BoolTree> = fc.letrec((tie) => ({
  tree: fc.oneof(
    { depthSize: 'small', maxDepth: 3 },
    tie('leaf'),
    fc.record({ t: fc.constant('and' as const), children: fc.array(tie('tree'), { minLength: 2, maxLength: 3 }) }),
    fc.record({ t: fc.constant('or' as const), children: fc.array(tie('tree'), { minLength: 2, maxLength: 3 }) }),
  ),
  leaf: leafArb,
})).tree as fc.Arbitrary<BoolTree>;

function evalTree(tree: BoolTree, bits: readonly boolean[]): boolean {
  if (tree.t === 'leaf') {
    const v = bits[tree.bit] as boolean;
    return tree.neg ? !v : v;
  }
  if (tree.t === 'and') return tree.children.every((c) => evalTree(c, bits));
  return tree.children.some((c) => evalTree(c, bits));
}

/** Hạ cây Bool thành rung LAD (series = AND, parallel = OR, NC = NOT lá). */
function lowerTree(
  tree: BoolTree,
  rloName: string,
  allocTemp: () => string,
  out: IrStmt[],
): void {
  if (tree.t === 'leaf') {
    const ref = [I00, I01, I02][tree.bit] as IrLValue;
    out.push(tree.neg ? contactNC(rloName, ref) : contactNO(rloName, ref));
    return;
  }
  if (tree.t === 'and') {
    for (const child of tree.children) lowerTree(child, rloName, allocTemp, out);
    return;
  }
  const temps = tree.children.map(() => allocTemp());
  tree.children.forEach((child, i) => {
    const temp = temps[i] as string;
    out.push(assign(local(temp), rlo(rloName)));
    lowerTree(child, temp, allocTemp, out);
  });
  let acc = rlo(temps[0] as string);
  for (let i = 1; i < temps.length; i++) {
    acc = bin('or', acc, rlo(temps[i] as string), 'Bool');
  }
  out.push(assign(local(rloName), acc));
}

/** Cây Bool thành biểu thức IR trực tiếp (binary/unary). */
function exprTree(tree: BoolTree): IrExpr {
  if (tree.t === 'leaf') {
    const ref = [I00, I01, I02][tree.bit] as IrLValue;
    const v = load(ref, 'Bool');
    return tree.neg ? unary('not', v, 'Bool') : v;
  }
  const parts = tree.children.map((c) => exprTree(c));
  let acc = parts[0] as IrExpr;
  for (let i = 1; i < parts.length; i++) {
    acc = bin(tree.t === 'and' ? 'and' : 'or', acc, parts[i] as IrExpr, 'Bool');
  }
  return acc;
}

describe('property LAD — rung series/parallel ≡ biểu thức Bool — expectedFrom: spec', () => {
  it('rung LAD ngẫu nhiên ≡ biểu thức Bool trực tiếp ≡ tính tay (seed cố định)', () => {
    fc.assert(
      fc.property(treeArb, fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }), (tree, bits) => {
        let counter = 0;
        const allocTemp = (): string => `__lad_N1_b${String(counter++)}`;
        const rung: IrStmt[] = [rloInit('__lad_N1_rlo')];
        lowerTree(tree, '__lad_N1_rlo', allocTemp, rung);
        rung.push(coil(Q00, '__lad_N1_rlo'));
        const temps = ['__lad_N1_rlo'];
        for (let i = 0; i < counter; i++) temps.push(`__lad_N1_b${String(i)}`);
        const ladPlc = makePlc(mainProg([obBlock('Main', 1, rung, temps.map((t) => v(t, 'Bool')))]));
        const exprPlc = makePlc(
          mainProg([
            obBlock('Main', 1, [assign(Q00, exprTree(tree))], []),
          ]),
        );
        ladPlc.start();
        exprPlc.start();
        for (const plc of [ladPlc, exprPlc]) {
          plc.write('%I0.0', bits[0] as boolean);
          plc.write('%I0.1', bits[1] as boolean);
          plc.write('%I0.2', bits[2] as boolean);
          scanAt(plc, 10);
        }
        const expected = evalTree(tree, bits);
        expect(ladPlc.read('%Q0.0')).toBe(expected);
        expect(exprPlc.read('%Q0.0')).toBe(expected);
      }),
      { seed: 20261125, numRuns: 100 },
    );
  });
});

describe('property LAD — pos/neg ≡ R_TRIG/F_TRIG — expectedFrom: spec', () => {
  it('pos ≡ R_TRIG và neg ≡ F_TRIG trên chuỗi I0.0 ngẫu nhiên (seed cố định)', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 5, maxLength: 12 }), (seq) => {
        // LAD pos: [pos %I0.0 mem %M0.0] → %Q0.0
        const ladPos = makePlc(
          mainProg([
            obBlock('Main', 1, [
              rloInit('__lad_N1_rlo'),
              assign(
                local('__lad_N1_rlo'),
                bin(
                  'and',
                  rlo('__lad_N1_rlo'),
                  bin('and', load(I00, 'Bool'), unary('not', load(M00, 'Bool'), 'Bool'), 'Bool'),
                  'Bool',
                ),
              ),
              assign(M00, load(I00, 'Bool')),
              coil(Q00, '__lad_N1_rlo'),
            ], [v('__lad_N1_rlo', 'Bool')]),
          ]),
        );
        // R_TRIG qua callSys, instance DB R1
        const trigPos = makePlc(
          mainProg(
            [obBlock('Main', 1, [
              callSysStmt('R_TRIG', [['CLK', load(I00, 'Bool')]], [['Q', Q00]], dbField('R1', [])),
            ])],
            [stdDb('R1', 'R_TRIG')],
          ),
        );
        // LAD neg: [neg %I0.0 mem %M0.1] → %Q0.1
        const ladNeg = makePlc(
          mainProg([
            obBlock('Main', 1, [
              rloInit('__lad_N1_rlo'),
              assign(
                local('__lad_N1_rlo'),
                bin(
                  'and',
                  rlo('__lad_N1_rlo'),
                  bin('and', unary('not', load(I00, 'Bool'), 'Bool'), load(M01, 'Bool'), 'Bool'),
                  'Bool',
                ),
              ),
              assign(M01, load(I00, 'Bool')),
              coil(Q01, '__lad_N1_rlo'),
            ], [v('__lad_N1_rlo', 'Bool')]),
          ]),
        );
        const trigNeg = makePlc(
          mainProg(
            [obBlock('Main', 1, [
              callSysStmt('F_TRIG', [['CLK', load(I00, 'Bool')]], [['Q', Q01]], dbField('F1', [])),
            ])],
            [stdDb('F1', 'F_TRIG')],
          ),
        );
        for (const plc of [ladPos, trigPos, ladNeg, trigNeg]) plc.start();
        for (const bit of seq) {
          for (const plc of [ladPos, trigPos, ladNeg, trigNeg]) {
            plc.write('%I0.0', bit);
            scanAt(plc, 10);
          }
          expect(ladPos.read('%Q0.0')).toBe(trigPos.read('%Q0.0'));
          expect(ladNeg.read('%Q0.1')).toBe(trigNeg.read('%Q0.1'));
        }
      }),
      { seed: 20261125, numRuns: 100 },
    );
  });
});
