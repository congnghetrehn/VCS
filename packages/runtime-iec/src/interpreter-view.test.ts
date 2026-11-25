// Test Interpreter: FB static mảng/struct qua viewFieldRef, đường lỗi
// compileLValue/lvalueType/resolveInstance, ngắt luồng (RETURN/EXIT/
// CONTINUE) trong if/case/for/while/repeat, biên compileExpr.
// expectedFrom: 'spec'.

import { describe, expect, it } from 'vitest';
import type { IrDb, IrStmt, IrType } from './ir.js';
import {
  abs,
  absDb,
  assign,
  bin,
  bool,
  callFbStmt,
  caseStmt,
  convert,
  dbField,
  dbFromDecls,
  exitStmt,
  fbBlock,
  forStmt,
  iface,
  ifStmt,
  index,
  intrinsic,
  load,
  local,
  makeInterpreter,
  makeMem,
  member,
  num,
  obBlock,
  prog,
  repeatStmt,
  returnStmt,
  staticPath,
  structType,
  unary,
  v,
  whileStmt,
  continueStmt,
} from './ir-testkit.js';
import { TagError } from '@vcs/kernel';
import { FaultCollector } from './faults.js';
import { Interpreter } from './interpreter.js';

const INT_ARR_0_2: IrType = { kind: 'array', elem: 'Int', lo: 0, hi: 2 };
const MOTOR: IrType = structType('Motor', [
  { name: 'speed', type: 'Int' },
  { name: 'run', type: 'Bool' },
]);
const MOTOR_ARR_0_1: IrType = { kind: 'array', elem: MOTOR, lo: 0, hi: 1 };

function runOb(
  body: IrStmt[],
  temp: ReturnType<typeof v>[] = [],
  dbs: IrDb[] = [],
): ReturnType<typeof makeInterpreter> {
  const ob = obBlock('Main', 1, body, temp);
  const program = prog([ob], dbs, [{ ob: 1, block: 'Main' }]);
  const ctx = makeInterpreter(program, dbs);
  ctx.interp.runBlock(ob);
  return ctx;
}

describe('FB static mảng/struct (viewFieldRef)', () => {
  it('static mảng: #arr[0] := 5; #arr[2] := #arr[0] + 1 → MW0 = 6', () => {
    const fb = fbBlock(
      'FB_Arr',
      iface([], [], [], [v('arr', INT_ARR_0_2)], []),
      [
        assign(index(staticPath(['arr']), num(0)), num(5)),
        assign(
          index(staticPath(['arr']), num(2)),
          bin('add', load(index(staticPath(['arr']), num(0)), 'Int'), num(1), 'Int'),
        ),
        assign(abs('M', 0, 'Int'), load(index(staticPath(['arr']), num(2)), 'Int')),
      ],
    );
    const db = dbFromDecls('DB_Arr', [{ name: 'arr', type: INT_ARR_0_2 }], 'FB_Arr');
    const ob = obBlock('Main', 1, [callFbStmt('FB_Arr', dbField('DB_Arr', []), [], [], [])]);
    const program = prog([ob, fb], [db], [{ ob: 1, block: 'Main' }]);
    const { interp, mem } = makeInterpreter(program, [db]);
    interp.runBlock(ob);
    expect(mem.m.read('Int', 0)).toBe(6);
  });

  it('static mảng OOB: ghi #arr[9] → ARRAY_RANGE, đọc #arr[9] → 0 + fault', () => {
    const fb = fbBlock(
      'FB_Arr',
      iface([], [], [], [v('arr', INT_ARR_0_2)], []),
      [
        assign(index(staticPath(['arr']), num(0)), num(5)),
        assign(index(staticPath(['arr']), num(9)), num(99)),
        assign(abs('M', 0, 'Int'), load(index(staticPath(['arr']), num(9)), 'Int')),
        assign(abs('M', 2, 'Int'), load(index(staticPath(['arr']), num(0)), 'Int')),
      ],
    );
    const db = dbFromDecls('DB_Arr', [{ name: 'arr', type: INT_ARR_0_2 }], 'FB_Arr');
    const ob = obBlock('Main', 1, [callFbStmt('FB_Arr', dbField('DB_Arr', []), [], [], [])]);
    const program = prog([ob, fb], [db], [{ ob: 1, block: 'Main' }]);
    const { interp, mem, faults } = makeInterpreter(program, [db]);
    interp.runBlock(ob);
    // FaultCollector gom theo code+block+src nên 2 lần OOB → 1 entry, count 2.
    const rangeFaults = faults.faults().filter((f) => f.code === 'ARRAY_RANGE');
    expect(rangeFaults).toHaveLength(1);
    expect(rangeFaults[0]?.count).toBe(2);
    expect(mem.m.read('Int', 0)).toBe(0);
    expect(mem.m.read('Int', 2)).toBe(5);
  });

  it('static struct: #cfg.speed := 1500 → MW0 = 1500', () => {
    const fb = fbBlock(
      'FB_Cfg',
      iface([], [], [], [v('cfg', MOTOR)], []),
      [
        assign(staticPath(['cfg', 'speed']), num(1500)),
        assign(staticPath(['cfg', 'run']), bool(true)),
        assign(abs('M', 0, 'Int'), load(staticPath(['cfg', 'speed']), 'Int')),
        assign(abs('M', 2, 'Bool', 0), load(staticPath(['cfg', 'run']), 'Bool')),
      ],
    );
    const db = dbFromDecls('DB_Cfg', [{ name: 'cfg', type: MOTOR }], 'FB_Cfg');
    const ob = obBlock('Main', 1, [callFbStmt('FB_Cfg', dbField('DB_Cfg', []), [], [], [])]);
    const program = prog([ob, fb], [db], [{ ob: 1, block: 'Main' }]);
    const { interp, mem } = makeInterpreter(program, [db]);
    interp.runBlock(ob);
    expect(mem.m.read('Int', 0)).toBe(1500);
    expect(mem.m.getBit(2, 0)).toBe(true);
  });

  it('static mảng struct: #motors[1].speed := 100 → MW0 = 100', () => {
    const fb = fbBlock(
      'FB_Motors',
      iface([], [], [], [v('motors', MOTOR_ARR_0_1)], []),
      [
        assign(member(index(staticPath(['motors']), num(1)), 'speed'), num(100)),
        assign(abs('M', 0, 'Int'), load(member(index(staticPath(['motors']), num(1)), 'speed'), 'Int')),
      ],
    );
    const db = dbFromDecls('DB_Motors', [{ name: 'motors', type: MOTOR_ARR_0_1 }], 'FB_Motors');
    const ob = obBlock('Main', 1, [callFbStmt('FB_Motors', dbField('DB_Motors', []), [], [], [])]);
    const program = prog([ob, fb], [db], [{ ob: 1, block: 'Main' }]);
    const { interp, mem } = makeInterpreter(program, [db]);
    interp.runBlock(ob);
    expect(mem.m.read('Int', 0)).toBe(100);
  });

  it('TEMP struct qua staticPath: #u.speed := 1500 → MW0 = 1500', () => {
    const { mem } = runOb(
      [
        assign(staticPath(['u', 'speed']), num(1500)),
        assign(abs('M', 0, 'Int'), load(staticPath(['u', 'speed']), 'Int')),
      ],
      [v('u', MOTOR)],
    );
    expect(mem.m.read('Int', 0)).toBe(1500);
  });
});

describe('đường lỗi compileLValue/lvalueType', () => {
  it('static path rỗng → throw; biến không tồn tại → throw', () => {
    expect(() => runOb([assign(staticPath([]), num(1))])).toThrow(/path rỗng/);
    expect(() => runOb([assign(staticPath(['nope']), num(1))])).toThrow(/không tìm thấy biến/);
  });

  it('FB: staticPath qua field không phải struct → throw; field không tồn tại → throw', () => {
    const fb = fbBlock(
      'FB_X',
      iface([], [], [], [v('x', 'Int'), v('cfg', MOTOR)], []),
      [assign(staticPath(['x', 'y']), num(1))],
    );
    const db = dbFromDecls('DB_X', [
      { name: 'x', type: 'Int' },
      { name: 'cfg', type: MOTOR },
    ], 'FB_X');
    const ob = obBlock('Main', 1, [callFbStmt('FB_X', dbField('DB_X', []), [], [], [])]);
    const program = prog([ob, fb], [db], [{ ob: 1, block: 'Main' }]);
    expect(() => makeInterpreter(program, [db])).toThrow(/không phải struct/);
    const fb2 = fbBlock(
      'FB_X',
      iface([], [], [], [v('x', 'Int'), v('cfg', MOTOR)], []),
      [assign(staticPath(['cfg', 'nope']), num(1))],
    );
    const program2 = prog(
      [obBlock('Main', 1, [callFbStmt('FB_X', dbField('DB_X', []), [], [], [])]), fb2],
      [db],
      [{ ob: 1, block: 'Main' }],
    );
    expect(() => makeInterpreter(program2, [db])).toThrow(/không tìm thấy field/);
  });

  it('runBlock FB trực tiếp (không instance) → throw "không có instance DB"', () => {
    const fb = fbBlock(
      'FB_Add',
      iface([v('x', 'Int')], [v('y', 'Int')], [], [], []),
      [assign(local('y'), bin('add', load(local('x'), 'Int'), num(1), 'Int'))],
    );
    const program = prog([fb], [], []);
    const { interp } = makeInterpreter(program);
    expect(() => interp.runBlock(fb)).toThrow(/không có instance DB/);
  });

  it('dbField: DB không tồn tại / field sai / path rỗng / DB chưa nạp → throw', () => {
    expect(() =>
      runOb([assign(dbField('DB_NOPE', ['x']), num(1))]),
    ).toThrow(/không tìm thấy DB/);
    const db = dbFromDecls('DB_M', [{ name: 'sp', type: 'Int' }]);
    expect(() =>
      runOb([assign(dbField('DB_M', ['nope']), num(1))], [], [db]),
    ).toThrow(/không tìm thấy field/);
    expect(() => runOb([assign(dbField('DB_M', []), num(1))], [], [db])).toThrow(/không có path/);
    // DB có trong program nhưng không có trong bộ nhớ (makeInterpreter không nạp).
    const ob = obBlock('Main', 1, [assign(dbField('DB_M', ['sp']), num(1))]);
    const program = prog([ob], [db], [{ ob: 1, block: 'Main' }]);
    const mem = makeMem([]);
    expect(() => new Interpreter(program, mem, new FaultCollector())).toThrow(
      /chưa được nạp vào bộ nhớ/,
    );
  });

  it('absDb số DB không tồn tại → throw; ghi bit bằng số → TAG-E001', () => {
    expect(() => runOb([assign(absDb(99, 0, 'Int'), num(1))])).toThrow(/không tìm thấy DB số 99/);
    expect(() => runOb([assign(abs('M', 0, 'Bool', 0), num(5))])).toThrow(TagError);
    expect(() => runOb([assign(absDb(1, 0, 'Bool', 0), num(5))], [], [dbFromDecls('DB_1', [{ name: 'x', type: 'Int' }])])).toThrow(
      TagError,
    );
  });

  it('index trên scalar → throw; member sau index sai field → throw', () => {
    expect(() =>
      runOb([assign(index(local('x'), num(0)), num(1))], [v('x', 'Int')]),
    ).toThrow(/không xác định được kiểu phần tử/);
    expect(() =>
      runOb(
        [assign(member(index(local('motors'), num(0)), 'nope'), num(1))],
        [v('motors', MOTOR_ARR_0_1)],
      ),
    ).toThrow(/không tìm thấy field/);
  });

  it('đọc phần tử struct như scalar → throw; mảng trong mảng chưa hỗ trợ → throw', () => {
    expect(() =>
      runOb(
        [assign(abs('M', 0, 'Int'), load(index(local('motors'), num(0)), 'Int'))],
        [v('motors', MOTOR_ARR_0_1)],
      ),
    ).toThrow(/đọc phần tử struct như scalar/);
    const nested: IrType = { kind: 'array', elem: { kind: 'array', elem: 'Int', lo: 0, hi: 1 }, lo: 0, hi: 1 };
    expect(() =>
      runOb(
        [assign(abs('M', 0, 'Int'), load(index(index(local('a'), num(0)), num(1)), 'Int'))],
        [v('a', nested)],
      ),
    ).toThrow(/không phải mảng/);
  });

  it('IN_OUT: member trên kiểu scalar → throw; field không tồn tại → throw', () => {
    const fb = fbBlock(
      'FB_S',
      iface([], [], [v('x', 'Int')], [], []),
      [assign(member(local('x'), 'y'), num(1))],
    );
    const db = dbFromDecls('DB_S', [], 'FB_S');
    const ob = obBlock('Main', 1, [callFbStmt('FB_S', dbField('DB_S', []), [], [], [['x', local('t')]])]);
    const program = prog([ob, fb], [db], [{ ob: 1, block: 'Main' }]);
    // Lỗi ném lúc compile (trong makeInterpreter) vì member trên scalar.
    expect(() => makeInterpreter(program, [db])).toThrow();
    const fb2 = fbBlock(
      'FB_S2',
      iface([], [], [v('m', MOTOR)], [], []),
      [assign(member(local('m'), 'nope'), num(1))],
    );
    const db2 = dbFromDecls('DB_S2', [], 'FB_S2');
    const ob2 = obBlock(
      'Main',
      1,
      [callFbStmt('FB_S2', dbField('DB_S2', []), [], [], [['m', local('u')]])],
      [v('u', MOTOR)],
    );
    const program2 = prog([ob2, fb2], [db2], [{ ob: 1, block: 'Main' }]);
    expect(() => makeInterpreter(program2, [db2])).toThrow(/không tìm thấy field/);
  });
});

describe('ngắt luồng trong if/case/for/while/repeat', () => {
  it('RETURN trong IF-then / ELSIF / ELSE dừng sequence', () => {
    const run = (body: IrStmt[]): number => {
      const { mem } = runOb(body);
      return mem.m.read('Int', 0) as number;
    };
    expect(
      run([
        ifStmt(bool(true), [returnStmt()], [], [assign(abs('M', 0, 'Int'), num(9))]),
        assign(abs('M', 0, 'Int'), num(1)),
      ]),
    ).toBe(0);
    expect(
      run([
        ifStmt(
          bool(false),
          [assign(abs('M', 0, 'Int'), num(9))],
          [{ cond: bool(true), body: [returnStmt()] }],
          [assign(abs('M', 0, 'Int'), num(8))],
        ),
        assign(abs('M', 0, 'Int'), num(1)),
      ]),
    ).toBe(0);
    expect(
      run([
        ifStmt(
          bool(false),
          [assign(abs('M', 0, 'Int'), num(9))],
          [],
          [returnStmt(), assign(abs('M', 0, 'Int'), num(8))],
        ),
        assign(abs('M', 0, 'Int'), num(1)),
      ]),
    ).toBe(0);
  });

  it('RETURN trong CASE arm / CASE else dừng sequence', () => {
    const run = (body: IrStmt[]): number => {
      const { mem } = runOb(body);
      return mem.m.read('Int', 0) as number;
    };
    expect(
      run([
        caseStmt(
          num(2),
          [{ labels: [[1, 3]], body: [returnStmt()] }],
          [assign(abs('M', 0, 'Int'), num(9))],
        ),
        assign(abs('M', 0, 'Int'), num(1)),
      ]),
    ).toBe(0);
    expect(
      run([
        caseStmt(num(9), [{ labels: [[1, 3]], body: [assign(abs('M', 0, 'Int'), num(8)) ] }], [
          returnStmt(),
        ]),
        assign(abs('M', 0, 'Int'), num(1)),
      ]),
    ).toBe(0);
  });

  it('CASE selector không phải số → throw; FOR var không khai báo → throw', () => {
    expect(() =>
      runOb([caseStmt(bool(true), [{ labels: [1], body: [] }], [])]),
    ).toThrow(/phải là số/);
    expect(() => runOb([forStmt('nope', num(0), num(2), [])])).toThrow();
  });

  it('FOR EXIT tại i=2 → sum = 0+1 = 1; FOR CONTINUE bỏ i=1 → sum = 0+2+3 = 5', () => {
    const { mem } = runOb(
      [
        assign(local('sum'), num(0)),
        forStmt('i', num(0), num(5), [
          ifStmt(
            bin('eq', load(local('i'), 'Int'), num(2), 'Bool'),
            [exitStmt()],
            [],
            [],
          ),
          assign(local('sum'), bin('add', load(local('sum'), 'Int'), load(local('i'), 'Int'), 'Int')),
        ]),
        assign(abs('M', 0, 'Int'), load(local('sum'), 'Int')),
      ],
      [v('sum', 'Int'), v('i', 'Int')],
    );
    expect(mem.m.read('Int', 0)).toBe(1);
    const ctx2 = runOb(
      [
        assign(local('sum'), num(0)),
        forStmt('i', num(0), num(3), [
          ifStmt(
            bin('eq', load(local('i'), 'Int'), num(1), 'Bool'),
            [continueStmt()],
            [],
            [],
          ),
          assign(local('sum'), bin('add', load(local('sum'), 'Int'), load(local('i'), 'Int'), 'Int')),
        ]),
        assign(abs('M', 0, 'Int'), load(local('sum'), 'Int')),
      ],
      [v('sum', 'Int'), v('i', 'Int')],
    );
    expect(ctx2.mem.m.read('Int', 0)).toBe(5);
  });

  it('FOR BY 0 → LOOP_LIMIT, sum = 10000; FOR TO 32767 dừng đúng, sum = 2, không fault', () => {
    const ctx = runOb(
      [
        assign(local('sum'), num(0)),
        forStmt('i', num(0), num(10), [
          assign(local('sum'), bin('add', load(local('sum'), 'Int'), num(1), 'Int')),
        ], num(0)),
        assign(abs('M', 0, 'Int'), load(local('sum'), 'Int')),
      ],
      [v('sum', 'Int'), v('i', 'Int')],
    );
    expect(ctx.mem.m.read('Int', 0)).toBe(10000);
    expect(ctx.faults.faults().filter((f) => f.code === 'LOOP_LIMIT')).toHaveLength(1);
    const ctx2 = runOb(
      [
        assign(local('sum'), num(0)),
        forStmt('i', num(32766), num(32767), [
          assign(local('sum'), bin('add', load(local('sum'), 'Int'), num(1), 'Int')),
        ]),
        assign(abs('M', 0, 'Int'), load(local('sum'), 'Int')),
      ],
      [v('sum', 'Int'), v('i', 'Int')],
    );
    expect(ctx2.mem.m.read('Int', 0)).toBe(2);
    expect(ctx2.faults.faults()).toHaveLength(0);
  });

  it('WHILE EXIT tại i=3 → i=3; WHILE CONTINUE bỏ i=2 → sum = 1+3+4+5 = 13', () => {
    const ctx = runOb(
      [
        assign(local('i'), num(0)),
        whileStmt(bool(true), [
          assign(local('i'), bin('add', load(local('i'), 'Int'), num(1), 'Int')),
          ifStmt(
            bin('eq', load(local('i'), 'Int'), num(3), 'Bool'),
            [exitStmt()],
            [],
            [],
          ),
        ]),
        assign(abs('M', 0, 'Int'), load(local('i'), 'Int')),
      ],
      [v('i', 'Int')],
    );
    expect(ctx.mem.m.read('Int', 0)).toBe(3);
    const ctx2 = runOb(
      [
        assign(local('i'), num(0)),
        assign(local('sum'), num(0)),
        whileStmt(bin('lt', load(local('i'), 'Int'), num(5), 'Bool'), [
          assign(local('i'), bin('add', load(local('i'), 'Int'), num(1), 'Int')),
          ifStmt(
            bin('eq', load(local('i'), 'Int'), num(2), 'Bool'),
            [continueStmt()],
            [],
            [],
          ),
          assign(local('sum'), bin('add', load(local('sum'), 'Int'), load(local('i'), 'Int'), 'Int')),
        ]),
        assign(abs('M', 0, 'Int'), load(local('sum'), 'Int')),
      ],
      [v('i', 'Int'), v('sum', 'Int')],
    );
    expect(ctx2.mem.m.read('Int', 0)).toBe(13);
  });

  it('REPEAT EXIT tại i=3 → i=3; REPEAT UNTIL FALSE mãi → LOOP_LIMIT, i=10000', () => {
    const ctx = runOb(
      [
        assign(local('i'), num(0)),
        repeatStmt(bool(false), [
          assign(local('i'), bin('add', load(local('i'), 'Int'), num(1), 'Int')),
          ifStmt(
            bin('eq', load(local('i'), 'Int'), num(3), 'Bool'),
            [exitStmt()],
            [],
            [],
          ),
        ]),
        assign(abs('M', 0, 'Int'), load(local('i'), 'Int')),
      ],
      [v('i', 'Int')],
    );
    expect(ctx.mem.m.read('Int', 0)).toBe(3);
    const ctx2 = runOb(
      [
        assign(local('i'), num(0)),
        repeatStmt(bool(false), [
          assign(local('i'), bin('add', load(local('i'), 'Int'), num(1), 'Int')),
        ]),
        assign(abs('M', 0, 'Int'), load(local('i'), 'Int')),
      ],
      [v('i', 'Int')],
    );
    expect(ctx2.mem.m.read('Int', 0)).toBe(10000);
    expect(ctx2.faults.faults().filter((f) => f.code === 'LOOP_LIMIT')).toHaveLength(1);
  });
});

describe('biên compileExpr', () => {
  it('load mảng với kiểu scalar → throw; bnot/neg/số học/convert/intrinsic trên struct → throw', () => {
    expect(() =>
      runOb([assign(abs('M', 0, 'Int'), load(local('arr'), 'Int'))], [v('arr', INT_ARR_0_2)]),
    ).toThrow(/đọc mảng như scalar/);
    // Kiểu khai báo của node là composite → throw ngay lúc compile, kể cả
    // khi operand là scalar hợp lệ (operand load struct đã throw trước ở
    // nhánh load-as-scalar nên không dùng được ở đây).
    expect(() =>
      runOb([assign(abs('M', 0, 'Int'), unary('bnot', num(1), MOTOR))]),
    ).toThrow(/bnot/);
    expect(() =>
      runOb([assign(abs('M', 0, 'Int'), unary('neg', num(1), MOTOR))]),
    ).toThrow(/neg/);
    expect(() =>
      runOb([assign(abs('M', 0, 'Int'), bin('add', num(1), num(2), MOTOR))]),
    ).toThrow(/số học/);
    expect(() =>
      runOb([assign(abs('M', 0, 'Int'), convert(num(1), 'Int', MOTOR))]),
    ).toThrow(/convert/);
    expect(() =>
      runOb(
        [assign(abs('M', 0, 'Int'), intrinsic('ABS', [num(1)], MOTOR))],
        [v('u', MOTOR)],
      ),
    ).toThrow(/intrinsic trả/);
    expect(() => runOb([assign(abs('M', 0, 'Int'), intrinsic('NOPE', [], 'Int'))])).toThrow(
      /không có trong registry/,
    );
    expect(() =>
      runOb([assign(abs('M', 0, 'Int'), bin('and', bool(true), bool(false), MOTOR))]),
    ).toThrow(/and\/or\/xor/);
  });

  it('CEIL(1e20) → DInt: CONV_RANGE fault; neg Int -32768 wrap về -32768', () => {
    const ctx = runOb([
      assign(abs('M', 0, 'DInt'), intrinsic('CEIL', [num(1e20, 'Real')], 'DInt')),
    ]);
    expect(ctx.faults.faults().filter((f) => f.code === 'CONV_RANGE')).toHaveLength(1);
    const ctx2 = runOb([
      assign(abs('M', 0, 'Int'), unary('neg', num(-32768), 'Int')),
    ]);
    expect(ctx2.mem.m.read('Int', 0)).toBe(-32768);
  });

  it('neg Real fround (-1.5); neg LReal (-2.5)', () => {
    const ctx = runOb([
      assign(abs('M', 0, 'Real'), unary('neg', num(1.5, 'Real'), 'Real')),
      assign(abs('M', 4, 'LReal'), unary('neg', num(2.5, 'LReal'), 'LReal')),
    ]);
    expect(ctx.mem.m.read('Real', 0)).toBe(-1.5);
    expect(ctx.mem.m.read('LReal', 4)).toBe(-2.5);
  });
});

describe('resolveInstance lỗi', () => {
  it('gọi FB con qua local khi frame không có instance → throw', () => {
    const child = fbBlock(
      'FB_Child',
      iface([v('x', 'Int')], [v('y', 'Int')], [], [], []),
      [assign(local('y'), load(local('x'), 'Int'))],
    );
    const parent = fbBlock(
      'FB_Parent',
      iface([], [], [], [v('child', structType('FB_Child', [{ name: 'x', type: 'Int' }, { name: 'y', type: 'Int' }]))], []),
      [callFbStmt('FB_Child', local('child'), [['x', num(1)]], [], [])],
    );
    const program = prog([parent, child], [], []);
    const { interp } = makeInterpreter(program);
    expect(() => interp.runBlock(parent)).toThrow(/không có instance DB/);
  });

  it('instance field không có trong DB / không phải struct → throw', () => {
    const child = fbBlock(
      'FB_Child',
      iface([v('x', 'Int')], [v('y', 'Int')], [], [], []),
      [assign(local('y'), load(local('x'), 'Int'))],
    );
    const parent = fbBlock(
      'FB_Parent',
      iface([], [], [], [v('child', structType('FB_Child', [{ name: 'x', type: 'Int' }, { name: 'y', type: 'Int' }]))], []),
      [callFbStmt('FB_Child', local('child'), [['x', num(1)]], [], [])],
    );
    // DB của cha KHÔNG có field 'child'.
    const dbNoChild = dbFromDecls('DB_Parent', [], 'FB_Parent');
    const ob = obBlock('Main', 1, [callFbStmt('FB_Parent', dbField('DB_Parent', []), [], [], [])]);
    const program = prog([ob, parent, child], [dbNoChild], [{ ob: 1, block: 'Main' }]);
    const ctx = makeInterpreter(program, [dbNoChild]);
    expect(() => ctx.interp.runBlock(ob)).toThrow(/không tìm thấy instance/);
    // DB của cha có 'child' nhưng là Int, không phải struct.
    const dbIntChild = dbFromDecls('DB_Parent', [{ name: 'child', type: 'Int' }], 'FB_Parent');
    const program2 = prog([ob, parent, child], [dbIntChild], [{ ob: 1, block: 'Main' }]);
    const ctx2 = makeInterpreter(program2, [dbIntChild]);
    expect(() => ctx2.interp.runBlock(ob)).toThrow(/không phải instance FB/);
  });

  it('instance qua dbField: DB không tồn tại / chưa nạp → throw', () => {
    const child = fbBlock(
      'FB_Child',
      iface([v('x', 'Int')], [v('y', 'Int')], [], [], []),
      [assign(local('y'), load(local('x'), 'Int'))],
    );
    const ob = obBlock('Main', 1, [callFbStmt('FB_Child', dbField('DB_NOPE', []), [], [], [])]);
    const program = prog([ob, child], [], [{ ob: 1, block: 'Main' }]);
    const ctx = makeInterpreter(program);
    expect(() => ctx.interp.runBlock(ob)).toThrow(/không tìm thấy DB/);
    const db = dbFromDecls('DB_C', [
      { name: 'x', type: 'Int' },
      { name: 'y', type: 'Int' },
    ], 'FB_Child');
    const ob2 = obBlock('Main', 1, [callFbStmt('FB_Child', dbField('DB_C', []), [], [], [])]);
    const program2 = prog([ob2, child], [db], [{ ob: 1, block: 'Main' }]);
    const mem2 = makeMem([]);
    const interp2 = new Interpreter(program2, mem2, new FaultCollector());
    // resolveInstance chạy lúc gọi FB, không phải lúc dựng Interpreter.
    expect(() => interp2.runBlock(ob2)).toThrow(/chưa được nạp vào bộ nhớ/);
  });
});

describe('gán cả mảng struct là deep copy', () => {
  it('#b := #a rồi #b[0].speed := 1 → #a[0].speed vẫn 0', () => {
    const { mem } = runOb(
      [
        assign(local('b'), load(local('a'), MOTOR_ARR_0_1)),
        assign(member(index(local('b'), num(0)), 'speed'), num(1)),
        assign(abs('M', 0, 'Int'), load(member(index(local('a'), num(0)), 'speed'), 'Int')),
        assign(abs('M', 2, 'Int'), load(member(index(local('b'), num(0)), 'speed'), 'Int')),
      ],
      [v('a', MOTOR_ARR_0_1), v('b', MOTOR_ARR_0_1)],
    );
    expect(mem.m.read('Int', 0)).toBe(0);
    expect(mem.m.read('Int', 2)).toBe(1);
  });
});
