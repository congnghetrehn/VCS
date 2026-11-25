// Test Interpreter: giá trị composite (mảng/struct), DB lồng, multi-instance,
// callSys có handler, FB outArgs, IN_OUT composite.
// expectedFrom: 'spec'.

import { describe, expect, it } from 'vitest';
import type { IrBlock, IrStmt, IrType } from './ir.js';
import {
  abs,
  assign,
  bin,
  bool,
  callFbStmt,
  callFcExpr,
  callSysStmt,
  dbField,
  dbForFb,
  dbFromDecls,
  fbBlock,
  fcBlock,
  forStmt,
  iface,
  index,
  load,
  local,
  makeInterpreter,
  makeMem,
  member,
  num,
  obBlock,
  prog,
  structType,
  v,
  whileStmt,
} from './ir-testkit.js';
import { FaultCollector } from './faults.js';
import {
  Interpreter,
  defaultLocalValue,
  defaultValue,
  findField,
  initDbStore,
  irTypeSize,
  readMemValue,
  writeMemValue,
} from './interpreter.js';
import { TagError } from '@vcs/kernel';

const INT_ARR_0_3: IrType = { kind: 'array', elem: 'Int', lo: 0, hi: 3 };
const INT_ARR_0_2: IrType = { kind: 'array', elem: 'Int', lo: 0, hi: 2 };
const BOOL_ARR_0_9: IrType = { kind: 'array', elem: 'Bool', lo: 0, hi: 9 };
const MOTOR: IrType = structType('Motor', [
  { name: 'speed', type: 'Int' },
  { name: 'run', type: 'Bool' },
]);

/** Chạy OB một lần qua Interpreter trực tiếp, trả mem + faults. */
function runOb(
  body: IrStmt[],
  temp: ReturnType<typeof v>[] = [],
  dbs: Parameters<typeof makeInterpreter>[1] = [],
): ReturnType<typeof makeInterpreter> {
  const ob = obBlock('Main', 1, body, temp);
  const program = prog([ob], dbs, [{ ob: 1, block: 'Main' }]);
  const ctx = makeInterpreter(program, dbs);
  ctx.interp.runBlock(ob);
  return ctx;
}

describe('mảng (TEMP)', () => {
  it('ghi/đọc phần tử: a[0]=11, a[3]=44', () => {
    const { mem } = runOb(
      [
        assign(index(local('a'), num(0)), num(11)),
        assign(index(local('a'), num(3)), num(44)),
        assign(abs('M', 0, 'Int'), load(index(local('a'), num(0)), 'Int')),
        assign(abs('M', 2, 'Int'), load(index(local('a'), num(3)), 'Int')),
      ],
      [v('a', INT_ARR_0_3)],
    );
    expect(mem.m.read('Int', 0)).toBe(11);
    expect(mem.m.read('Int', 2)).toBe(44);
  });

  it('gán cả mảng là deep copy: b := a rồi b[0] := 99 → a[0] vẫn 11', () => {
    const { mem } = runOb(
      [
        assign(index(local('a'), num(0)), num(11)),
        assign(local('b'), load(local('a'), INT_ARR_0_3)),
        assign(index(local('b'), num(0)), num(99)),
        assign(abs('M', 0, 'Int'), load(index(local('a'), num(0)), 'Int')),
        assign(abs('M', 2, 'Int'), load(index(local('b'), num(0)), 'Int')),
      ],
      [v('a', INT_ARR_0_3), v('b', INT_ARR_0_3)],
    );
    expect(mem.m.read('Int', 0)).toBe(11);
    expect(mem.m.read('Int', 2)).toBe(99);
  });

  it('mảng Bool gói bit: flags[0] và flags[9]', () => {
    const { mem } = runOb(
      [
        assign(index(local('flags'), num(0)), bool(true)),
        assign(index(local('flags'), num(9)), bool(true)),
        assign(abs('M', 0, 'Bool', 0), load(index(local('flags'), num(0)), 'Bool')),
        assign(abs('M', 0, 'Bool', 1), load(index(local('flags'), num(9)), 'Bool')),
        assign(abs('M', 0, 'Bool', 2), load(index(local('flags'), num(1)), 'Bool')),
      ],
      [v('flags', BOOL_ARR_0_9)],
    );
    expect(mem.m.getBit(0, 0)).toBe(true);
    expect(mem.m.getBit(0, 1)).toBe(true);
    expect(mem.m.getBit(0, 2)).toBe(false);
  });

  it('mảng làm tham số FC: copy theo giá trị — FC sửa a[0] không đổi caller', () => {
    const fcSum = fcBlock(
      'FC_Sum',
      iface([v('a', INT_ARR_0_2)], [], [], [], [v('FC_Sum', 'Int'), v('s', 'Int'), v('i', 'Int')]),
      [
        assign(index(local('a'), num(0)), num(99)),
        assign(local('s'), num(0)),
        forStmt('i', num(0), num(2), [
          assign(local('s'), bin('add', load(local('s'), 'Int'), load(index(local('a'), load(local('i'), 'Int')), 'Int'), 'Int')),
        ]),
        assign(local('FC_Sum'), load(local('s'), 'Int')),
      ],
      'Int',
    );
    const ob = obBlock(
      'Main',
      1,
      [
        assign(index(local('a'), num(0)), num(1)),
        assign(index(local('a'), num(1)), num(2)),
        assign(index(local('a'), num(2)), num(3)),
        assign(abs('M', 0, 'Int'), callFcExpr('FC_Sum', [['a', load(local('a'), INT_ARR_0_2)]], 'Int')),
        assign(abs('M', 2, 'Int'), load(index(local('a'), num(0)), 'Int')),
      ],
      [v('a', INT_ARR_0_2)],
    );
    const program = prog([ob, fcSum], [], [{ ob: 1, block: 'Main' }]);
    const { interp, mem } = makeInterpreter(program);
    interp.runBlock(ob);
    // FC thấy a[0]=99 → tổng 99+2+3=104; caller a[0] vẫn 1.
    expect(mem.m.read('Int', 0)).toBe(104);
    expect(mem.m.read('Int', 2)).toBe(1);
  });

  it('mảng làm IN_OUT FB: sửa phần tử trong FB → caller thấy ngay', () => {
    const fbSet = fbBlock(
      'FB_Set',
      iface([], [], [v('arr', INT_ARR_0_2)], [], []),
      [assign(index(local('arr'), num(1)), num(7))],
    );
    const db = dbFromDecls('FB_Set_DB', [], 'FB_Set'); // FB không có static → DB rỗng
    const ob = obBlock(
      'Main',
      1,
      [
        callFbStmt('FB_Set', dbField('FB_Set_DB', []), [], [], [['arr', local('a')]]),
        assign(abs('M', 0, 'Int'), load(index(local('a'), num(1)), 'Int')),
      ],
      [v('a', INT_ARR_0_2)],
    );
    const program = prog([ob, fbSet], [db], [{ ob: 1, block: 'Main' }]);
    const { interp, mem } = makeInterpreter(program, [db]);
    interp.runBlock(ob);
    expect(mem.m.read('Int', 0)).toBe(7);
  });

  it('chỉ số không nguyên → throw ồn ào', () => {
    expect(() =>
      runOb(
        [assign(abs('M', 0, 'Int'), load(index(local('a'), num(1.5, 'Real')), 'Int'))],
        [v('a', INT_ARR_0_3)],
      ),
    ).toThrow(/chỉ số/);
  });
});

describe('struct (TEMP)', () => {
  it('member ghi/đọc: u.speed=1500, u.run=TRUE', () => {
    const { mem } = runOb(
      [
        assign(member(local('u'), 'speed'), num(1500)),
        assign(member(local('u'), 'run'), bool(true)),
        assign(abs('M', 0, 'Int'), load(member(local('u'), 'speed'), 'Int')),
        assign(abs('M', 2, 'Bool', 0), load(member(local('u'), 'run'), 'Bool')),
      ],
      [v('u', MOTOR)],
    );
    expect(mem.m.read('Int', 0)).toBe(1500);
    expect(mem.m.getBit(2, 0)).toBe(true);
  });

  it('struct lồng: o.inner.x := 5', () => {
    const inner = structType('Inner', [{ name: 'x', type: 'Int' }]);
    const outer = structType('Outer', [
      { name: 'inner', type: inner },
      { name: 'y', type: 'Int' },
    ]);
    const { mem } = runOb(
      [
        assign(member(member(local('o'), 'inner'), 'x'), num(5)),
        assign(abs('M', 0, 'Int'), load(member(member(local('o'), 'inner'), 'x'), 'Int')),
      ],
      [v('o', outer)],
    );
    expect(mem.m.read('Int', 0)).toBe(5);
  });

  it('gán cả struct là deep copy: v := u rồi v.speed := 1 → u.speed vẫn 1500', () => {
    const { mem } = runOb(
      [
        assign(member(local('u'), 'speed'), num(1500)),
        assign(local('w'), load(local('u'), MOTOR)),
        assign(member(local('w'), 'speed'), num(1)),
        assign(abs('M', 0, 'Int'), load(member(local('u'), 'speed'), 'Int')),
      ],
      [v('u', MOTOR), v('w', MOTOR)],
    );
    expect(mem.m.read('Int', 0)).toBe(1500);
  });

  it('struct làm tham số FC: copy — FC sửa không đổi caller', () => {
    const fcGet = fcBlock(
      'FC_Get',
      iface([v('m', MOTOR)], [], [], [], [v('FC_Get', 'Int')]),
      [
        assign(member(local('m'), 'speed'), num(1)),
        assign(local('FC_Get'), load(member(local('m'), 'speed'), 'Int')),
      ],
      'Int',
    );
    const ob = obBlock(
      'Main',
      1,
      [
        assign(member(local('u'), 'speed'), num(1500)),
        assign(abs('M', 0, 'Int'), callFcExpr('FC_Get', [['m', load(local('u'), MOTOR)]], 'Int')),
        assign(abs('M', 2, 'Int'), load(member(local('u'), 'speed'), 'Int')),
      ],
      [v('u', MOTOR)],
    );
    const program = prog([ob, fcGet], [], [{ ob: 1, block: 'Main' }]);
    const { interp, mem } = makeInterpreter(program);
    interp.runBlock(ob);
    expect(mem.m.read('Int', 0)).toBe(1);
    expect(mem.m.read('Int', 2)).toBe(1500);
  });

  it('struct làm IN_OUT FB: sửa member trong FB → caller thấy ngay', () => {
    const fbSet = fbBlock(
      'FB_SetS',
      iface([], [], [v('m', MOTOR)], [], []),
      [assign(member(local('m'), 'speed'), num(7))],
    );
    const db = dbFromDecls('FB_SetS_DB', [], 'FB_SetS'); // FB không có static → DB rỗng
    const ob = obBlock(
      'Main',
      1,
      [
        callFbStmt('FB_SetS', dbField('FB_SetS_DB', []), [], [], [['m', local('u')]]),
        assign(abs('M', 0, 'Int'), load(member(local('u'), 'speed'), 'Int')),
      ],
      [v('u', MOTOR)],
    );
    const program = prog([ob, fbSet], [db], [{ ob: 1, block: 'Main' }]);
    const { interp, mem } = makeInterpreter(program, [db]);
    interp.runBlock(ob);
    expect(mem.m.read('Int', 0)).toBe(7);
  });
});

describe('mảng struct + member sau index', () => {
  it('#motors[0].speed := 100; #motors[1].run := TRUE', () => {
    const arrType: IrType = { kind: 'array', elem: MOTOR, lo: 0, hi: 1 };
    const { mem } = runOb(
      [
        assign(member(index(local('motors'), num(0)), 'speed'), num(100)),
        assign(member(index(local('motors'), num(1)), 'run'), bool(true)),
        assign(abs('M', 0, 'Int'), load(member(index(local('motors'), num(0)), 'speed'), 'Int')),
        assign(abs('M', 2, 'Bool', 0), load(member(index(local('motors'), num(1)), 'run'), 'Bool')),
      ],
      [v('motors', arrType)],
    );
    expect(mem.m.read('Int', 0)).toBe(100);
    expect(mem.m.getBit(2, 0)).toBe(true);
  });
});

describe('DB lồng struct + init', () => {
  it('"DB_M".motor.speed := 1500; "DB_M".sp := 3', () => {
    const db = dbFromDecls('DB_M', [
      { name: 'motor', type: MOTOR },
      { name: 'sp', type: 'Int' },
    ]);
    const { mem } = runOb(
      [
        assign(dbField('DB_M', ['motor', 'speed']), num(1500)),
        assign(dbField('DB_M', ['sp']), num(3)),
        assign(abs('M', 0, 'Int'), load(dbField('DB_M', ['motor', 'speed']), 'Int')),
        assign(abs('M', 2, 'Int'), load(dbField('DB_M', ['sp']), 'Int')),
      ],
      [],
      [db],
    );
    expect(mem.m.read('Int', 0)).toBe(1500);
    expect(mem.m.read('Int', 2)).toBe(3);
  });

  it('init DB: sp init 1500, motor.speed init 100 → đọc được ngay không cần ghi', () => {
    const motorLocal = structType('Motor', [
      { name: 'speed', type: 'Int' },
      { name: 'run', type: 'Bool' },
    ]);
    const db = dbFromDecls('DB_M', [
      { name: 'motor', type: motorLocal },
      { name: 'sp', type: 'Int', init: 1500 },
    ]);
    // init cho field lồng motor.speed: đặt trực tiếp trên IrField của struct.
    const motorField = db.fields.find((f) => f.name === 'motor');
    if (
      motorField !== undefined &&
      typeof motorField.type !== 'string' &&
      motorField.type.kind === 'struct'
    ) {
      const speedField = motorField.type.fields.find((f) => f.name === 'speed');
      if (speedField !== undefined) speedField.init = 100;
    }
    const { mem } = runOb(
      [
        assign(abs('M', 0, 'Int'), load(dbField('DB_M', ['motor', 'speed']), 'Int')),
        assign(abs('M', 2, 'Int'), load(dbField('DB_M', ['sp']), 'Int')),
      ],
      [],
      [db],
    );
    expect(mem.m.read('Int', 0)).toBe(100);
    expect(mem.m.read('Int', 2)).toBe(1500);
  });
});

describe('multi-instance (FB con trong static của FB cha)', () => {
  function buildParent(): { program: ReturnType<typeof prog>; db: ReturnType<typeof dbFromDecls> } {
    const child = fbBlock(
      'FB_Child',
      iface([v('x', 'Int')], [v('y', 'Int')], [], [v('s', 'Int')], []),
      [
        assign(local('s'), bin('add', load(local('s'), 'Int'), num(1), 'Int')),
        assign(local('y'), bin('add', load(local('x'), 'Int'), load(local('s'), 'Int'), 'Int')),
      ],
    );
    const childStruct = structType('FB_Child', [
      { name: 'x', type: 'Int' },
      { name: 'y', type: 'Int' },
      { name: 's', type: 'Int' },
    ]);
    const parent = fbBlock(
      'FB_Parent',
      iface([], [], [], [v('child', childStruct)], []),
      [
        callFbStmt('FB_Child', local('child'), [['x', num(10)]], [['y', abs('M', 0, 'Int')]]),
      ],
    );
    const db = dbFromDecls('DB_Parent', [{ name: 'child', type: childStruct }], 'FB_Parent');
    const ob = obBlock('Main', 1, [callFbStmt('FB_Parent', dbField('DB_Parent', []), [], [], [])]);
    return { program: prog([ob, parent, child], [db], [{ ob: 1, block: 'Main' }]), db };
  }

  it('gọi cha 2 lần: static của con giữ (s=1 rồi 2) → MW0 = 11 rồi 12', () => {
    const { program, db } = buildParent();
    const ob = program.blocks[0] as IrBlock;
    const { interp, mem } = makeInterpreter(program, [db]);
    interp.runBlock(ob);
    expect(mem.m.read('Int', 0)).toBe(11);
    interp.runBlock(ob);
    expect(mem.m.read('Int', 0)).toBe(12);
  });
});

describe('callSys có handler', () => {
  it('handler MY_TON: Q := IN', () => {
    const ob = obBlock('Main', 1, [
      callSysStmt('MY_TON', [['IN', bool(true)]], [['Q', abs('M', 0, 'Bool', 0)]]),
    ]);
    const program = prog([ob], [], [{ ob: 1, block: 'Main' }]);
    const mem = makeMem();
    const faults = new FaultCollector();
    const interp = new Interpreter(program, mem, faults, {
      sysCalls: new Map([
        [
          'MY_TON',
          (_instance, inArgs, outArgs) => {
            const q = outArgs.get('Q');
            if (q !== undefined) q.set(inArgs.get('IN') ?? false);
          },
        ],
      ]),
    });
    interp.runBlock(ob);
    expect(mem.m.getBit(0, 0)).toBe(true);
    expect(faults.faults()).toHaveLength(0);
  });

  it('handler có instance: ghi field q trong instance DB', () => {
    const db = dbFromDecls('DB_TON', [{ name: 'q', type: 'Bool' }], 'TON');
    const ob = obBlock('Main', 1, [
      callSysStmt('MY_TON2', [['IN', bool(true)]], [], dbField('DB_TON', [])),
    ]);
    const program = prog([ob], [db], [{ ob: 1, block: 'Main' }]);
    const mem = makeMem([db]);
    const faults = new FaultCollector();
    const interp = new Interpreter(program, mem, faults, {
      sysCalls: new Map([
        [
          'MY_TON2',
          (instance, inArgs) => {
            if (instance === undefined) throw new Error('thiếu instance');
            const f = findField(instance.fields, 'q');
            if (f === undefined) throw new Error('thiếu field q');
            writeMemValue(instance.store, instance.base + f.byteOffset, f, inArgs.get('IN') ?? false);
          },
        ],
      ]),
    });
    interp.runBlock(ob);
    expect(mem.dbs.get('db_ton')?.getBit(0, 0)).toBe(true);
  });
});

describe('FB outArgs (Q => đích)', () => {
  it('callFb với outArgs: qOut copy ra %MW0', () => {
    const fb = fbBlock(
      'FB_Out',
      iface([v('x', 'Int')], [v('q', 'Int')], [], [], []),
      [assign(local('q'), bin('add', load(local('x'), 'Int'), num(1), 'Int'))],
    );
    const db = dbForFb('FB_Out', 'FB_Out_DB', fb.interface);
    const ob = obBlock('Main', 1, [
      callFbStmt('FB_Out', dbField('FB_Out_DB', []), [['x', num(41)]], [['q', abs('M', 0, 'Int')]], []),
    ]);
    const program = prog([ob, fb], [db], [{ ob: 1, block: 'Main' }]);
    const { interp, mem } = makeInterpreter(program, [db]);
    interp.runBlock(ob);
    expect(mem.m.read('Int', 0)).toBe(42);
  });
});

describe('helper thuần + đường lỗi (throw ồn ào)', () => {
  it('defaultValue/defaultLocalValue/irTypeSize/findField', () => {
    expect(defaultValue('Int')).toBe(0);
    expect(defaultValue('Bool')).toBe(false);
    expect(() => defaultValue(INT_ARR_0_2)).toThrow(/chỉ dùng cho kiểu nguyên thủy/);
    expect(defaultLocalValue(INT_ARR_0_2)).toEqual([0, 0, 0]);
    expect(defaultLocalValue(MOTOR)).toBeInstanceOf(Map);
    expect(irTypeSize(BOOL_ARR_0_9)).toBe(2);
    expect(irTypeSize(INT_ARR_0_3)).toBe(8);
    expect(irTypeSize(MOTOR)).toBe(4); // §3.4 rule 6: size struct chẵn (2 + 1 → 4)
    expect(findField([{ name: 'Speed', type: 'Int', byteOffset: 0, size: 2 }], 'speed')?.name).toBe('Speed');
    expect(findField([], 'x')).toBeUndefined();
  });

  it('readMemValue/writeMemValue Bool/Int/Real; ghi Bool bằng số → TAG-E001', () => {
    const mem = makeMem();
    writeMemValue(mem.m, 0, { name: 'x', type: 'Int', byteOffset: 0, size: 2 }, 42);
    expect(readMemValue(mem.m, 0, { name: 'x', type: 'Int', byteOffset: 0, size: 2 })).toBe(42);
    writeMemValue(mem.m, 2, { name: 'b', type: 'Bool', byteOffset: 2, bitOffset: 3, size: 1 }, true);
    expect(readMemValue(mem.m, 2, { name: 'b', type: 'Bool', byteOffset: 2, bitOffset: 3, size: 1 })).toBe(true);
    expect(() => {
      writeMemValue(mem.m, 2, { name: 'b', type: 'Bool', byteOffset: 2, bitOffset: 0, size: 1 }, 5);
    }).toThrow(TagError);
  });

  it('initDbStore: field có init → ghi; struct lồng đệ quy', () => {
    const motorLocal = structType('Motor', [
      { name: 'speed', type: 'Int' },
      { name: 'run', type: 'Bool' },
    ]);
    const db = dbFromDecls('DB_I', [
      { name: 'sp', type: 'Int', init: 1500 },
      { name: 'motor', type: motorLocal },
    ]);
    const motorField = db.fields.find((f) => f.name === 'motor');
    if (
      motorField !== undefined &&
      typeof motorField.type !== 'string' &&
      motorField.type.kind === 'struct'
    ) {
      const speedField = motorField.type.fields.find((f) => f.name === 'speed');
      if (speedField !== undefined) speedField.init = 100;
    }
    const mem = makeMem([db]);
    const store = mem.dbs.get('db_i');
    expect(store).toBeDefined();
    if (store !== undefined) {
      initDbStore(store, db.fields, 0);
      expect(store.read('Int', 0)).toBe(1500);
    }
  });

  it('runBlock block không tồn tại → throw; compile gọi FC không tồn tại → throw', () => {
    const ob = obBlock('Main', 1, []);
    const program = prog([ob], [], [{ ob: 1, block: 'Main' }]);
    const { interp } = makeInterpreter(program);
    expect(() => interp.runBlock({ ...ob, name: 'Nope', id: 'Nope' })).toThrow(/chưa được biên dịch/);
    const bad = prog(
      [obBlock('Main', 1, [assign(abs('M', 0, 'Int'), callFcExpr('FC_No', [], 'Int'))])],
      [],
      [{ ob: 1, block: 'Main' }],
    );
    expect(() => makeInterpreter(bad)).toThrow(/không tìm thấy FC/);
  });

  it('load local không khai báo → throw', () => {
    expect(() =>
      runOb([assign(abs('M', 0, 'Int'), load(local('nope'), 'Int'))]),
    ).toThrow(/không tìm thấy/);
  });

  it('WHILE với điều kiện không Bool: `=== true` nên body bị bỏ qua, không throw', () => {
    const { mem } = runOb([
      assign(abs('M', 0, 'Int'), num(5)),
      whileStmt(num(1), [assign(abs('M', 0, 'Int'), num(1))]),
    ]);
    expect(mem.m.read('Int', 0)).toBe(5);
  });
});

describe('FaultCollector.restore — validate', () => {
  it('không phải mảng → throw; phần tử không phải object / sai hình → throw', () => {
    const c = new FaultCollector();
    expect(() => { c.restore('x' as unknown as never); }).toThrow(/phải là mảng/);
    expect(() => { c.restore([42] as unknown as never); }).toThrow(/sai hình/);
    expect(() => { c.restore([null] as unknown as never); }).toThrow(/sai hình/);
    expect(() => { c.restore([{ code: 'DIV_ZERO', message: 'x', count: 'a', simTimeMs: 0 }] as unknown as never); },
    ).toThrow(/sai hình/);
  });

  it('fault hợp lệ → khôi phục được, sửa bản sao không đổi collector', () => {
    const c = new FaultCollector();
    c.restore([
      { code: 'DIV_ZERO', message: 'chia 0', count: 2, simTimeMs: 10, blockName: 'Main' },
    ]);
    expect(c.faults()).toHaveLength(1);
    expect(c.faults()[0]?.count).toBe(2);
    expect(c.faults()[0]?.blockName).toBe('Main');
  });
});
