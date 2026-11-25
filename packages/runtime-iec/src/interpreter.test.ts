// Test Interpreter: closures/frame, eval, flow, TEMP reset, IN_OUT, giới hạn.
// Chương trình IR dựng bằng tay (ir-testkit); pipeline SCL→IR ở vendor-siemens.
// expectedFrom: 'spec'.

import { describe, expect, it } from 'vitest';
import type { IrBlock, IrStmt } from './ir.js';
import {
  abs,
  assign,
  bin,
  bool,
  callFbStmt,
  callFcExpr,
  callFcStmt,
  callSysStmt,
  caseStmt,
  convert,
  dbField,
  dbForFb,
  exitStmt,
  continueStmt,
  returnStmt,
  forStmt,
  fcBlock,
  fbBlock,
  iface,
  ifStmt,
  intrinsic,
  load,
  local,
  makeInterpreter,
  makePlc,
  num,
  obBlock,
  prog,
  repeatStmt,
  runSteps,
  unary,
  v,
  whileStmt,
} from './ir-testkit.js';

/** Chạy một OB một lần, trả bộ nhớ + faults. */
function runOnce(body: IrStmt[], temp: ReturnType<typeof v>[] = []): ReturnType<typeof makeInterpreter> & { faultsOf: (code: string) => number } {
  const ob = obBlock('Main', 1, body, temp);
  const program = prog([ob], [], [{ ob: 1, block: 'Main' }]);
  const ctx = makeInterpreter(program);
  ctx.interp.runBlock(ob);
  const faultsOf = (code: string): number =>
    ctx.faults.faults().filter((f) => f.code === code).reduce((acc, f) => acc + f.count, 0);
  return { ...ctx, faultsOf };
}

describe('eval expr', () => {
  it('const/load/unary/binary/convert/intrinsic', () => {
    const { mem } = runOnce([
      assign(abs('M', 0, 'Int'), num(7)),
      assign(abs('M', 2, 'Int'), bin('add', load(abs('M', 0, 'Int'), 'Int'), num(1), 'Int')),
      assign(abs('M', 4, 'Int'), unary('neg', num(5), 'Int')),
      assign(abs('M', 6, 'Bool', 0), unary('not', bool(false), 'Bool')),
      assign(abs('M', 8, 'Int'), convert(num(2.5, 'Real'), 'Real', 'Int')),
      assign(abs('M', 10, 'Int'), intrinsic('ABS', [num(-3)], 'Int')),
    ]);
    expect(mem.m.read('Int', 0)).toBe(7);
    expect(mem.m.read('Int', 2)).toBe(8);
    expect(mem.m.read('Int', 4)).toBe(-5);
    expect(mem.m.getBit(6, 0)).toBe(true);
    expect(mem.m.read('Int', 8)).toBe(2);
    expect(mem.m.read('Int', 10)).toBe(3);
  });
});

describe('flow (bảng G, mức interpreter)', () => {
  it('G1: CASE với range + ELSE', () => {
    const runCase = (n: number): number => {
      const { mem } = runOnce(
        [
          assign(abs('M', 0, 'Int'), num(n)),
          caseStmt(load(abs('M', 0, 'Int'), 'Int'), [
            { labels: [[1, 3]], body: [assign(abs('M', 2, 'Int'), num(1))] },
            { labels: [5], body: [assign(abs('M', 2, 'Int'), num(2))] },
          ], [assign(abs('M', 2, 'Int'), num(3))]),
        ],
      );
      return mem.m.read('Int', 2) as number;
    };
    expect(runCase(2)).toBe(1);
    expect(runCase(5)).toBe(2);
    expect(runCase(9)).toBe(3);
  });

  it('G2: WHILE + EXIT', () => {
    const { mem } = runOnce(
      [
        assign(local('i'), num(0)),
        whileStmt(bin('lt', load(local('i'), 'Int'), num(10), 'Bool'), [
          assign(local('i'), bin('add', load(local('i'), 'Int'), num(1), 'Int')),
          ifStmt(bin('eq', load(local('i'), 'Int'), num(3), 'Bool'), [exitStmt()]),
        ]),
        assign(abs('M', 0, 'Int'), load(local('i'), 'Int')),
      ],
      [v('i', 'Int')],
    );
    expect(mem.m.read('Int', 0)).toBe(3);
  });

  it('G3: FOR + CONTINUE (1+3+5=9)', () => {
    const { mem } = runOnce(
      [
        assign(local('s'), num(0)),
        forStmt('i', num(1), num(5), [
          ifStmt(bin('eq', bin('mod', load(local('i'), 'Int'), num(2), 'Int'), num(0), 'Bool'), [
            continueStmt(),
          ]),
          assign(local('s'), bin('add', load(local('s'), 'Int'), load(local('i'), 'Int'), 'Int')),
        ]),
        assign(abs('M', 0, 'Int'), load(local('s'), 'Int')),
      ],
      [v('s', 'Int'), v('i', 'Int')],
    );
    expect(mem.m.read('Int', 0)).toBe(9);
  });

  it('G4: RETURN dừng block', () => {
    const { mem } = runOnce([
      assign(abs('M', 0, 'Int'), num(1)),
      returnStmt(),
      assign(abs('M', 0, 'Int'), num(2)),
    ]);
    expect(mem.m.read('Int', 0)).toBe(1);
  });

  it('G5: REPEAT chạy ít nhất 1 lần', () => {
    const { mem } = runOnce(
      [
        assign(local('i'), num(0)),
        repeatStmt(bool(true), [
          assign(local('i'), bin('add', load(local('i'), 'Int'), num(1), 'Int')),
        ]),
        assign(abs('M', 0, 'Int'), load(local('i'), 'Int')),
      ],
      [v('i', 'Int')],
    );
    expect(mem.m.read('Int', 0)).toBe(1);
  });

  it('G6: IF/ELSIF/ELSE', () => {
    const runIf = (a: boolean, b: boolean): number => {
      const { mem } = runOnce([
        ifStmt(bool(a), [assign(abs('M', 0, 'Int'), num(1))], [
          { cond: bool(b), body: [assign(abs('M', 0, 'Int'), num(2))] },
        ], [assign(abs('M', 0, 'Int'), num(3))]),
      ]);
      return mem.m.read('Int', 0) as number;
    };
    expect(runIf(false, true)).toBe(2);
    expect(runIf(false, false)).toBe(3);
    expect(runIf(true, false)).toBe(1);
  });

  it('G7: nhánh IF FALSE không chạy', () => {
    const { mem } = runOnce(
      [
        assign(local('i'), num(0)),
        ifStmt(bool(false), [
          whileStmt(bin('lt', load(local('i'), 'Int'), num(3), 'Bool'), [
            assign(local('i'), bin('add', load(local('i'), 'Int'), num(1), 'Int')),
          ]),
        ]),
        assign(abs('M', 0, 'Int'), load(local('i'), 'Int')),
      ],
      [v('i', 'Int')],
    );
    expect(mem.m.read('Int', 0)).toBe(0);
  });
});

describe('TEMP reset + FC return (bảng D)', () => {
  it('TEMP không giữ giữa các lần gọi FC: MW12=5 cả hai lần', () => {
    const fcTemp = fcBlock(
      'FC_Temp',
      iface([v('x', 'Int')], [], [], [], [v('t', 'Int'), v('FC_Temp', 'Int')]),
      [
        assign(local('t'), bin('add', load(local('t'), 'Int'), load(local('x'), 'Int'), 'Int')),
        assign(local('FC_Temp'), load(local('t'), 'Int')),
      ],
      'Int',
    );
    const ob = obBlock('Main', 1, [
      assign(abs('M', 12, 'Int'), callFcExpr('FC_Temp', [['x', num(5)]], 'Int')),
    ]);
    const program = prog([ob, fcTemp], [], [{ ob: 1, block: 'Main' }]);
    const { interp, mem } = makeInterpreter(program);
    interp.runBlock(ob);
    expect(mem.m.read('Int', 12)).toBe(5);
    interp.runBlock(ob);
    expect(mem.m.read('Int', 12)).toBe(5);
  });

  it('callFc dạng statement + ret', () => {
    const fcAdd = fcBlock(
      'FC_Add',
      iface([v('a', 'Int'), v('b', 'Int')], [], [], [], [v('FC_Add', 'Int')]),
      [assign(local('FC_Add'), bin('add', load(local('a'), 'Int'), load(local('b'), 'Int'), 'Int'))],
      'Int',
    );
    const ob = obBlock('Main', 1, [
      callFcStmt('FC_Add', [['a', num(20)], ['b', num(22)]], abs('M', 0, 'Int')),
    ]);
    const program = prog([ob, fcAdd], [], [{ ob: 1, block: 'Main' }]);
    const { interp, mem } = makeInterpreter(program);
    interp.runBlock(ob);
    expect(mem.m.read('Int', 0)).toBe(42);
  });
});

describe('IN_OUT alias trực tiếp (OQ-148)', () => {
  it('FB ghi IN_OUT → caller thấy ngay (MW0 tăng mỗi lần gọi)', () => {
    const fbInc = fbBlock(
      'FB_Inc',
      iface([], [], [v('cnt', 'Int')], [], []),
      [assign(local('cnt'), bin('add', load(local('cnt'), 'Int'), num(1), 'Int'))],
    );
    const db = dbForFb('FB_Inc', 'FB_Inc_DB', fbInc.interface);
    const ob = obBlock('Main', 1, [
      callFbStmt('FB_Inc', dbField('FB_Inc_DB', []), [], [], [['cnt', abs('M', 0, 'Int')]]),
    ]);
    const program = prog([ob, fbInc], [db], [{ ob: 1, block: 'Main' }]);
    const { interp, mem } = makeInterpreter(program, [db]);
    interp.runBlock(ob);
    expect(mem.m.read('Int', 0)).toBe(1);
    interp.runBlock(ob);
    expect(mem.m.read('Int', 0)).toBe(2);
  });
});

describe('giới hạn (bảng D)', () => {
  it('call depth: chuỗi 25 FC, maxCallDepth=24 → CALL_DEPTH ×1, FC_1=24', () => {
    const blocks: IrBlock[] = [];
    for (let k = 25; k >= 1; k--) {
      const name = `FC_${String(k)}`;
      if (k === 25) {
        blocks.push(
          fcBlock(name, iface([], [], [], [], [v(name, 'Int')]), [assign(local(name), num(0))], 'Int'),
        );
      } else {
        const next = `FC_${String(k + 1)}`;
        blocks.push(
          fcBlock(
            name,
            iface([], [], [], [], [v(name, 'Int')]),
            [
              assign(
                local(name),
                bin('add', callFcExpr(next, [], 'Int'), num(1), 'Int'),
              ),
            ],
            'Int',
          ),
        );
      }
    }
    const ob = obBlock('Main', 1, [assign(abs('M', 0, 'Int'), callFcExpr('FC_1', [], 'Int'))]);
    const program = prog([ob, ...blocks], [], [{ ob: 1, block: 'Main' }]);
    const { interp, mem, faults } = makeInterpreter(program);
    interp.runBlock(ob);
    expect(mem.m.read('Int', 0)).toBe(24);
    expect(faults.faults().filter((f) => f.code === 'CALL_DEPTH').reduce((a, f) => a + f.count, 0)).toBe(1);
  });

  it('loop limit: WHILE TRUE → LOOP_LIMIT ×1, i=10000, chạy tiếp sau vòng lặp', () => {
    const { mem, faultsOf } = runOnce(
      [
        assign(local('i'), num(0)),
        whileStmt(bool(true), [
          assign(local('i'), bin('add', load(local('i'), 'Int'), num(1), 'Int')),
        ]),
        assign(abs('M', 0, 'Int'), load(local('i'), 'Int')),
      ],
      [v('i', 'Int')],
    );
    expect(mem.m.read('Int', 0)).toBe(10000);
    expect(faultsOf('LOOP_LIMIT')).toBe(1);
  });

  it('callSys không handler → SYS_UNSUPPORTED, chạy tiếp', () => {
    const { mem, faultsOf } = runOnce([
      assign(abs('M', 0, 'Int'), num(1)),
      callSysStmt('TON', [['IN', bool(true)], ['PT', num(1000, 'Time')]], []),
      assign(abs('M', 2, 'Int'), num(2)),
    ]);
    expect(mem.m.read('Int', 0)).toBe(1);
    expect(mem.m.read('Int', 2)).toBe(2);
    expect(faultsOf('SYS_UNSUPPORTED')).toBe(1);
  });
});

describe('số học qua interpreter (bảng E, mức IR)', () => {
  it('E1–E4: tràn Int/DInt + ov (ov chỉ là cờ frame, không phải fault)', () => {
    const { mem } = runOnce([
      assign(abs('M', 0, 'Int'), bin('add', num(32767), num(1), 'Int')),
      assign(abs('M', 2, 'Int'), bin('sub', num(-32768), num(1), 'Int')),
      assign(abs('M', 4, 'DInt'), bin('add', num(2147483647, 'DInt'), num(1, 'DInt'), 'DInt')),
    ]);
    expect(mem.m.read('Int', 0)).toBe(-32768);
    expect(mem.m.read('Int', 2)).toBe(32767);
    expect(mem.m.read('DInt', 4)).toBe(-2147483648);
  });

  it('E6: chia/mod 0 → 0 + DIV_ZERO', () => {
    const { mem, faultsOf } = runOnce([
      assign(abs('M', 0, 'Int'), bin('div', num(7), num(0), 'Int')),
      assign(abs('M', 2, 'Int'), bin('mod', num(7), num(0), 'Int')),
    ]);
    expect(mem.m.read('Int', 0)).toBe(0);
    expect(mem.m.read('Int', 2)).toBe(0);
    expect(faultsOf('DIV_ZERO')).toBe(2);
  });

  it('E10: convert ngoài khoảng → 0 + CONV_RANGE', () => {
    const { faultsOf } = runOnce([
      assign(abs('M', 0, 'Int'), convert(num(40000, 'Real'), 'Real', 'Int')),
    ]);
    expect(faultsOf('CONV_RANGE')).toBe(1);
  });

  it('E11: 0.1+0.2 fround = 0.3 TRUE', () => {
    const { mem } = runOnce(
      [
        assign(local('r'), bin('add', num(0.1, 'Real'), num(0.2, 'Real'), 'Real')),
        assign(
          abs('M', 0, 'Bool', 0),
          bin('eq', load(local('r'), 'Real'), num(0.3, 'Real'), 'Bool'),
        ),
      ],
      [v('r', 'Real')],
    );
    expect(mem.m.getBit(0, 0)).toBe(true);
  });

  it('E13: đọc/ghi mảng ngoài khoảng → ARRAY_RANGE, đọc 0, ghi bỏ qua', () => {
    const { mem, faultsOf } = runOnce(
      [
        assign(abs('M', 0, 'Int'), load({ k: 'index', base: local('a'), index: num(5) }, 'Int')),
        assign({ k: 'index', base: local('a'), index: num(5) }, num(7)),
        assign(abs('M', 2, 'Int'), load({ k: 'index', base: local('a'), index: num(0) }, 'Int')),
      ],
      [v('a', { kind: 'array', elem: 'Int', lo: 0, hi: 3 })],
    );
    expect(mem.m.read('Int', 0)).toBe(0);
    expect(mem.m.read('Int', 2)).toBe(0);
    expect(faultsOf('ARRAY_RANGE')).toBe(2);
  });
});

describe('SoftPlc qua makePlc (smoke)', () => {
  it('chạy 1 scan qua step: MW0 tăng', () => {
    const ob = obBlock('Main', 1, [
      assign(abs('M', 0, 'Int'), bin('add', load(abs('M', 0, 'Int'), 'Int'), num(1), 'Int')),
    ]);
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    plc.start();
    runSteps(plc, 3);
    expect(plc.read('%MW0')).toBe(3);
  });
});
