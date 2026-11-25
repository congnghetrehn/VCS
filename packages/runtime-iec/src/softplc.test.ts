// Test API SoftPlc: load/start/stop/reset/init/read/write/force/diagnostics/onScan
// + scheduler (dt, T ngược, faultPolicy, maxScansPerStep, thiếu OB1).
// expectedFrom: 'spec'.

import { ManualClock, TagDB, TagDbIoBus } from '@vcs/kernel';
import type { TagHandle } from '@vcs/kernel';
import type { ControllerDef, TagDef } from '@vcs/schemas';
import { describe, expect, it } from 'vitest';
import type { IrBlock } from './ir.js';
import {
  abs,
  absDb,
  assign,
  bin,
  bool,
  callFcStmt,
  callSysStmt,
  dbField,
  dbForFb,
  dbFromDecls,
  fbBlock,
  fcBlock,
  iface,
  index,
  load,
  local,
  makePlc,
  member,
  num,
  obBlock,
  prog,
  runSteps,
  structType,
  v,
} from './ir-testkit.js';
import type { SoftPlc } from './softplc.js';

function counterProgram(): { ob: IrBlock } {
  const ob = obBlock('Main', 1, [
    assign(abs('M', 0, 'Int'), bin('add', load(abs('M', 0, 'Int'), 'Int'), num(1), 'Int')),
  ]);
  return { ob };
}

function divZeroProgram(): IrBlock {
  return obBlock('Main', 1, [assign(abs('M', 0, 'Int'), bin('div', num(7), num(0), 'Int'))]);
}

function ioDefs(): TagDef[] {
  return [
    { name: 'IN_A', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'OUT_A', type: 'Bool', area: 'Q', address: '%Q0.0', controller: 'PLC1', signal: { kind: 'DO' } },
  ];
}

async function plcWithIo(program: IrBlock[], outputsOnStop?: 'zero' | 'hold'): Promise<{
  plc: SoftPlc;
  tags: TagDB;
}> {
  const clock = new ManualClock();
  const tags = new TagDB(ioDefs(), clock);
  const io = new TagDbIoBus(tags);
  const def: ControllerDef = { id: 'PLC1', mode: 'builtin', vendor: 'siemens', config: {} };
  const plc = makePlc(
    prog(program, [], [{ ob: 1, block: 'Main' }]),
    outputsOnStop !== undefined ? { outputsOnStop } : {},
  );
  await plc.init({ id: 'PLC1', def, stepMs: 10, scanPeriodMs: 10, tags: ioDefs() }, io);
  return { plc, tags };
}

describe('load/start/stop/reset', () => {
  it('load khi RUN → throw', () => {
    const { ob } = counterProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    plc.start();
    expect(() => { plc.load(prog([ob], [], [{ ob: 1, block: 'Main' }])); }).toThrow(/yêu cầu STOP/);
  });

  it('load DB ref không tồn tại → throw (absDb 99, dbField lạ)', () => {
    const { ob } = counterProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    const badAbs = obBlock('Main', 1, [assign(abs('M', 0, 'Int'), load(absDb(99, 0, 'Int'), 'Int'))]);
    expect(() => { plc.load(prog([badAbs], [], [{ ob: 1, block: 'Main' }])); }).toThrow(/DB số 99/);
    const badField = obBlock('Main', 1, [
      assign(abs('M', 0, 'Int'), load(dbField('NOPE', ['x']), 'Int')),
    ]);
    expect(() => { plc.load(prog([badField], [], [{ ob: 1, block: 'Main' }])); }).toThrow(/DB 'NOPE'/);
  });

  it('load xong scanCount/acc/faults/forces reset', () => {
    const ob = divZeroProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    plc.start();
    runSteps(plc, 3);
    plc.force('%I0.0', true);
    expect(plc.getDiagnostics().scanCount).toBe(3);
    expect(plc.getDiagnostics().faults.length).toBe(1);
    expect(plc.listForces()).toHaveLength(1);
    plc.stop();
    plc.load(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    expect(plc.getDiagnostics().scanCount).toBe(0);
    expect(plc.getDiagnostics().faults).toHaveLength(0);
    expect(plc.listForces()).toHaveLength(0);
  });

  it('start/stop idempotent', () => {
    const { ob } = counterProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    plc.start();
    plc.start();
    expect(plc.getDiagnostics().state).toBe('RUN');
    plc.stop();
    plc.stop();
    expect(plc.getDiagnostics().state).toBe('STOP');
  });

  it("stop đẩy Q=0 ra IoBus ngay (outputsOnStop 'zero')", async () => {
    const ob = obBlock('Main', 1, [assign(abs('Q', 0, 'Bool', 0), bool(true))]);
    const { plc, tags } = await plcWithIo([ob], 'zero');
    plc.start();
    runSteps(plc, 1);
    expect(tags.get(1 as TagHandle)).toBe(true);
    plc.stop();
    expect(tags.get(1 as TagHandle)).toBe(false);
  });

  it("stop giữ Q (outputsOnStop 'hold')", async () => {
    const ob = obBlock('Main', 1, [assign(abs('Q', 0, 'Bool', 0), bool(true))]);
    const { plc, tags } = await plcWithIo([ob], 'hold');
    plc.start();
    runSteps(plc, 1);
    expect(tags.get(1 as TagHandle)).toBe(true);
    plc.stop();
    expect(tags.get(1 as TagHandle)).toBe(true);
  });

  it('reset cold: forces/faults/memory/scanCount về init, state STOP', () => {
    const ob = divZeroProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    plc.start();
    runSteps(plc, 2);
    plc.force('%I0.0', true);
    plc.write('%MW0', 99);
    plc.reset();
    expect(plc.getDiagnostics().state).toBe('STOP');
    expect(plc.getDiagnostics().scanCount).toBe(0);
    expect(plc.getDiagnostics().faults).toHaveLength(0);
    expect(plc.listForces()).toHaveLength(0);
    expect(plc.read('%MW0')).toBe(0);
  });

  it('init 2 lần → throw', async () => {
    const { ob } = counterProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    const clock = new ManualClock();
    const tags = new TagDB(ioDefs(), clock);
    const io = new TagDbIoBus(tags);
    const def: ControllerDef = { id: 'PLC1', mode: 'builtin', vendor: 'siemens', config: {} };
    await plc.init({ id: 'PLC1', def, stepMs: 10, scanPeriodMs: 10, tags: ioDefs() }, io);
    expect(() =>
      plc.init({ id: 'PLC1', def, stepMs: 10, scanPeriodMs: 10, tags: ioDefs() }, io),
    ).toThrow(/init gọi 2 lần/);
  });
});

describe('read/write', () => {
  it('read/write ref không tìm thấy → throw RangeError nêu ref', () => {
    const { ob } = counterProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    expect(() => plc.read('%I9.9')).toThrow(RangeError);
    expect(() => { plc.write('%I9.9', true); }).toThrow(RangeError);
    expect(() => plc.read('NOPE')).toThrow(RangeError);
  });

  it('write sai kiểu → TagError TAG-E001', () => {
    const { ob } = counterProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    expect(() => { plc.write('%MW0', 3.5); }).toThrow(/TAG-E001/);
    expect(() => { plc.write('%I0.0', 5); }).toThrow(/TAG-E001/);
    expect(() => { plc.write('%I0.0', 'x'); }).toThrow(/TAG-E001/);
  });

  it('write %I thấy ngay trước scan; latch ghi đè từ TagDB ở scan kế; TagDB mới là nguồn input', async () => {
    const ob = obBlock('Main', 1, [
      assign(abs('Q', 0, 'Bool', 0), load(abs('I', 0, 'Bool', 0), 'Bool')),
    ]);
    const { plc, tags } = await plcWithIo([ob]);
    // write API thấy ngay (chưa scan).
    plc.write('%I0.0', true);
    expect(plc.read('%I0.0')).toBe(true);
    plc.start();
    // Scan 1: latch ghi đè PII từ TagDB (IN_A=false) → Q=false.
    runSteps(plc, 1);
    expect(plc.read('%I0.0')).toBe(false);
    expect(plc.read('%Q0.0')).toBe(false);
    // Nguồn input thật là TagDB: set IN_A=true → scan kế Q=true.
    tags.write('IN_A', true, 'test');
    runSteps(plc, 1, 10, 10);
    expect(plc.read('%Q0.0')).toBe(true);
  });
});

describe('diagnostics/onScan', () => {
  it('getDiagnostics: state/scanCount/lastScanSimMs/faults gom count', () => {
    const ob = divZeroProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    plc.start();
    runSteps(plc, 3);
    const d = plc.getDiagnostics();
    expect(d.state).toBe('RUN');
    expect(d.scanCount).toBe(3);
    expect(d.lastScanSimMs).toBe(30);
    expect(d.faults).toHaveLength(1);
    expect(d.faults[0]).toMatchObject({ code: 'DIV_ZERO', count: 3 });
  });

  it('onScan gọi đúng số lần + unsub', () => {
    const { ob } = counterProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    const seen: { scanTimeMs: number; scanCount: number }[] = [];
    const unsub = plc.onScan((info) => seen.push(info));
    plc.start();
    runSteps(plc, 3);
    expect(seen).toEqual([
      { scanTimeMs: 10, scanCount: 1 },
      { scanTimeMs: 20, scanCount: 2 },
      { scanTimeMs: 30, scanCount: 3 },
    ]);
    unsub();
    runSteps(plc, 2, 10, 30);
    expect(seen).toHaveLength(3);
  });
});

describe('scheduler', () => {
  it('step dt=0 → no-op', () => {
    const { ob } = counterProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    plc.start();
    plc.step(0, 0);
    expect(plc.getDiagnostics().scanCount).toBe(0);
    plc.step(0, 10);
    expect(plc.getDiagnostics().scanCount).toBe(1);
  });

  it('dt<0 → RangeError; T đi ngược → RangeError', () => {
    const { ob } = counterProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    plc.start();
    expect(() => { plc.step(0, -1); }).toThrow(RangeError);
    runSteps(plc, 1);
    expect(() => { plc.step(5, 10); }).toThrow(RangeError);
  });

  it('STOP → step no-op', () => {
    const { ob } = counterProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    plc.step(0, 10);
    expect(plc.getDiagnostics().scanCount).toBe(0);
  });

  it("faultPolicy 'stop' → STOP sau scan có fault đầu tiên", () => {
    const ob = divZeroProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]), { faultPolicy: 'stop' });
    plc.start();
    runSteps(plc, 3);
    expect(plc.getDiagnostics().state).toBe('STOP');
    expect(plc.getDiagnostics().scanCount).toBe(1);
  });

  it('maxScansPerStep custom cap đúng (2): dt=100 period 10 → 2 scan + SCAN_OVERRUN 8', () => {
    const { ob } = counterProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]), { maxScansPerStep: 2 });
    plc.start();
    plc.step(0, 100);
    expect(plc.getDiagnostics().scanCount).toBe(2);
    expect(
      plc
        .getDiagnostics()
        .faults.find((f) => f.code === 'SCAN_OVERRUN')?.count,
    ).toBe(8); // OQ-131: count = số scan bị cắt (10 − 2), không phải số lần overrun
    expect(plc.read('%MW0')).toBe(2);
  });

  it('scan không có OB1 → scanCount vẫn tăng (OB100 chạy 1 lần)', () => {
    const ob100 = obBlock('Init', 100, [assign(abs('M', 0, 'Int'), num(1))]);
    const plc = makePlc(prog([ob100], [], [{ ob: 100, block: 'Init' }]));
    plc.start();
    runSteps(plc, 2);
    expect(plc.getDiagnostics().scanCount).toBe(2);
    expect(plc.read('%MW0')).toBe(1);
  });

  it('program rỗng (không OB nào) → scan vẫn đếm', () => {
    const plc = makePlc(prog([], [], []));
    plc.start();
    runSteps(plc, 2);
    expect(plc.getDiagnostics().scanCount).toBe(2);
  });
});

describe('load/init/force — đường biên', () => {
  it('measureProgram: OB dùng index/member mảng/struct + callFc có ret + callSys có instance', async () => {
    const motor = structType('Motor', [
      { name: 'speed', type: 'Int' },
      { name: 'run', type: 'Bool' },
    ]);
    const fc = fcBlock(
      'FC_Add',
      iface([v('a', 'Int'), v('b', 'Int')], [], [], [], [v('FC_Add', 'Int')]),
      [assign(local('FC_Add'), bin('add', load(local('a'), 'Int'), load(local('b'), 'Int'), 'Int'))],
      'Int',
    );
    const dbSys = dbFromDecls('DB_SYS', [{ name: 'q', type: 'Bool' }], 'TON');
    const ob = obBlock(
      'Main',
      1,
      [
        assign(index(local('arr'), num(0)), num(7)),
        assign(member(local('u'), 'speed'), num(3)),
        callFcStmt(
          'FC_Add',
          [
            ['a', load(index(local('arr'), num(0)), 'Int')],
            ['b', load(member(local('u'), 'speed'), 'Int')],
          ],
          abs('M', 0, 'Int'),
        ),
        callSysStmt('MY_SYS', [], [], dbField('DB_SYS', [])),
      ],
      [
        v('arr', { kind: 'array', elem: 'Int', lo: 0, hi: 2 }),
        v('u', motor),
      ],
    );
    const { plc } = await (async () => {
      const clock = new ManualClock();
      const tags = new TagDB(ioDefs(), clock);
      const io = new TagDbIoBus(tags);
      const def: ControllerDef = { id: 'PLC1', mode: 'builtin', vendor: 'siemens', config: {} };
      const p = makePlc(prog([ob, fc], [dbSys], [{ ob: 1, block: 'Main' }]));
      await p.init({ id: 'PLC1', def, stepMs: 10, scanPeriodMs: 10, tags: ioDefs() }, io);
      return { plc: p };
    })();
    plc.start();
    runSteps(plc, 1);
    // 7 + 3 = 10; callSys không handler → SYS_UNSUPPORTED nhưng scan vẫn chạy.
    expect(plc.read('%MW0')).toBe(10);
    expect(plc.getDiagnostics().faults.some((f) => f.code === 'SYS_UNSUPPORTED')).toBe(true);
  });

  it('init với tag kiểu String → throw (không xác định được kích thước)', () => {
    const { ob } = counterProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    const clock = new ManualClock();
    const tags = new TagDB(
      [
        ...ioDefs(),
        { name: 'S1', type: 'String', area: 'I', address: '%IB10', controller: 'PLC1' },
      ],
      clock,
    );
    const io = new TagDbIoBus(tags);
    const def: ControllerDef = { id: 'PLC1', mode: 'builtin', vendor: 'siemens', config: {} };
    // init throw đồng bộ (trả Promise.resolve(), không async) nên dùng expect sync.
    expect(() =>
      plc.init(
        {
          id: 'PLC1',
          def,
          stepMs: 10,
          scanPeriodMs: 10,
          tags: [
            ...ioDefs(),
            { name: 'S1', type: 'String', area: 'I', address: '%IB10', controller: 'PLC1' },
          ],
        },
        io,
      ),
    ).toThrow(/không xác định được kích thước/);
  });

  it('load với organization trỏ block không tồn tại → throw', () => {
    const { ob } = counterProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    expect(() => { plc.load(prog([ob], [], [{ ob: 1, block: 'Nope' }])); }).toThrow(
      /organization trỏ tới block không tồn tại/,
    );
  });

  it('write vào ref đang force → bỏ qua, read vẫn ra giá trị force', async () => {
    const { ob } = counterProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    const clock = new ManualClock();
    const tags = new TagDB(ioDefs(), clock);
    const io = new TagDbIoBus(tags);
    const def: ControllerDef = { id: 'PLC1', mode: 'builtin', vendor: 'siemens', config: {} };
    await plc.init({ id: 'PLC1', def, stepMs: 10, scanPeriodMs: 10, tags: ioDefs() }, io);
    plc.force('%MW0', 5);
    plc.write('%MW0', 10);
    expect(plc.read('%MW0')).toBe(5);
  });

  it('read DB số chưa nạp (DB1.DBW4) → RangeError', () => {
    const { ob } = counterProgram();
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    expect(() => plc.read('DB1.DBW4')).toThrow(RangeError);
  });

  it('force DB bit bằng số → TAG-E001', async () => {
    const fbX = fbBlock('FB_X', iface([], [v('run', 'Bool')], [], [], []), []);
    const db = dbForFb('FB_X', 'DB_X', fbX.interface);
    const ob = obBlock('Main', 1, []);
    const plc = makePlc(prog([ob, fbX], [db], [{ ob: 1, block: 'Main' }]));
    const clock = new ManualClock();
    const tags = new TagDB(ioDefs(), clock);
    const io = new TagDbIoBus(tags);
    const def: ControllerDef = { id: 'PLC1', mode: 'builtin', vendor: 'siemens', config: {} };
    await plc.init({ id: 'PLC1', def, stepMs: 10, scanPeriodMs: 10, tags: ioDefs() }, io);
    expect(() => { plc.force('"DB_X".run', 5); }).toThrow(/TAG-E001/);
  });
});
