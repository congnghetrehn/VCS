// Golden scan P1.4: bảng A (scan timing), B (process image), C (OB100/cyclic),
// D (gọi block), E (số học §7.2), G (điều khiển luồng) + 7 chương trình bit logic.
// expectedFrom: 'spec' (OQ-151) — mọi kỳ vọng tính tay từ docs/STATE.md §19.

import { ManualClock, TagDB, TagDbIoBus } from '@vcs/kernel';
import type { TagHandle } from '@vcs/kernel';
import type { ControllerDef, TagDef } from '@vcs/schemas';
import { describe, expect, it } from 'vitest';
import type { IrBlock, IrDb, IrProgram, IrStmt } from './ir.js';
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
import type { SoftPlc } from './softplc.js';

/** Chạy chương trình OB 1 scan, trả plc (đã start). */
function scanOnce(program: IrProgram, opts: Parameters<typeof makePlc>[1] = {}): SoftPlc {
  const plc = makePlc(program, opts);
  plc.start();
  runSteps(plc, 1);
  return plc;
}

/** Đếm fault theo mã trong diagnostics. */
function faultCount(plc: SoftPlc, code: string): number {
  return plc
    .getDiagnostics()
    .faults.filter((f) => f.code === code)
    .reduce((acc, f) => acc + f.count, 0);
}

function ioDefs(): TagDef[] {
  return [
    { name: 'IN0', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'IN1', type: 'Bool', area: 'I', address: '%I0.1', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'OUT0', type: 'Bool', area: 'Q', address: '%Q0.0', controller: 'PLC1', signal: { kind: 'DO' } },
    { name: 'OUT1', type: 'Bool', area: 'Q', address: '%Q0.1', controller: 'PLC1', signal: { kind: 'DO' } },
  ];
}

/** SoftPlc + TagDB + IoBus (để test process image / force qua TagDB). */
async function plcWithIo(
  program: IrProgram,
  defs: TagDef[] = ioDefs(),
  scanPeriodMs = 10,
): Promise<{ plc: SoftPlc; tags: TagDB }> {
  const clock = new ManualClock();
  const tags = new TagDB(defs, clock);
  const io = new TagDbIoBus(tags);
  const def: ControllerDef = { id: 'PLC1', mode: 'builtin', vendor: 'siemens', config: {} };
  const plc = makePlc(program, { scanPeriodMs });
  await plc.init({ id: 'PLC1', def, stepMs: 10, scanPeriodMs, tags: defs }, io);
  return { plc, tags };
}

function counterOb(): IrBlock {
  return obBlock('Main', 1, [
    assign(abs('M', 0, 'Int'), bin('add', load(abs('M', 0, 'Int'), 'Int'), num(1), 'Int')),
  ]);
}

describe('bảng A — scan timing (lưới đều, OQ-130)', () => {
  it('A1: period 20, 10 bước → scan tại 20,40,60,80,100; scanCount=5, last=100, acc=0', () => {
    const plc = makePlc(prog([counterOb()], [], [{ ob: 1, block: 'Main' }]), { scanPeriodMs: 20 });
    plc.start();
    runSteps(plc, 10);
    expect(plc.getDiagnostics().scanCount).toBe(5);
    expect(plc.getDiagnostics().lastScanSimMs).toBe(100);
    expect(plc.snapshot().accMs).toBe(0);
    expect(plc.read('%MW0')).toBe(5);
  });

  it('A2: period 20, dt=50 → scan tại 20,40,60,80,100 (lưới đều, không trôi)', () => {
    const plc = makePlc(prog([counterOb()], [], [{ ob: 1, block: 'Main' }]), { scanPeriodMs: 20 });
    plc.start();
    plc.step(0, 50);
    expect(plc.getDiagnostics().scanCount).toBe(2);
    expect(plc.snapshot().accMs).toBe(10);
    plc.step(50, 50);
    expect(plc.getDiagnostics().scanCount).toBe(5);
    expect(plc.getDiagnostics().lastScanSimMs).toBe(100);
    expect(plc.snapshot().accMs).toBe(0);
  });

  it('A3: period 20, dt=1200, maxScans=50 → cap 50, SCAN_OVERRUN=10, acc giữ 200', () => {
    const plc = makePlc(prog([counterOb()], [], [{ ob: 1, block: 'Main' }]), { scanPeriodMs: 20 });
    plc.start();
    plc.step(0, 1200);
    expect(plc.getDiagnostics().scanCount).toBe(50);
    expect(plc.getDiagnostics().lastScanSimMs).toBe(1000);
    expect(faultCount(plc, 'SCAN_OVERRUN')).toBe(10);
    expect(plc.snapshot().accMs).toBe(200);
    plc.step(1200, 10);
    expect(plc.getDiagnostics().scanCount).toBe(60);
    expect(plc.getDiagnostics().lastScanSimMs).toBe(1200);
    expect(plc.snapshot().accMs).toBe(10);
  });

  it("A4: period 20, stop giữa chừng → scanCount giữ 3, Q về 0 ngay ('zero')", async () => {
    const ob = obBlock('Main', 1, [assign(abs('Q', 0, 'Bool', 0), bool(true))]);
    const { plc, tags } = await plcWithIo(prog([ob], [], [{ ob: 1, block: 'Main' }]), ioDefs(), 20);
    plc.start();
    runSteps(plc, 6);
    expect(plc.getDiagnostics().scanCount).toBe(3);
    expect(tags.get(2 as TagHandle)).toBe(true);
    plc.stop();
    expect(tags.get(2 as TagHandle)).toBe(false);
    expect(plc.read('%Q0.0')).toBe(false);
    runSteps(plc, 5, 10, 60);
    expect(plc.getDiagnostics().scanCount).toBe(3);
  });

  it('A5: restart → rebase lưới, scan đầu tại 130 (không phải 120); OB100 chạy lại', () => {
    const ob100 = obBlock('Init', 100, [
      assign(abs('M', 2, 'Int'), bin('add', load(abs('M', 2, 'Int'), 'Int'), num(1), 'Int')),
    ]);
    const program = prog([counterOb(), ob100], [], [
      { ob: 100, block: 'Init' },
      { ob: 1, block: 'Main' },
    ]);
    const plc = makePlc(program, { scanPeriodMs: 20 });
    plc.start();
    runSteps(plc, 6); // scan tại 20,40,60
    expect(plc.read('%MW2')).toBe(1);
    plc.stop();
    plc.start();
    plc.step(110, 10); // rebase, acc=10, chưa scan
    expect(plc.getDiagnostics().scanCount).toBe(3);
    plc.step(120, 10); // acc=20 → scan tại 130
    expect(plc.getDiagnostics().scanCount).toBe(4);
    expect(plc.getDiagnostics().lastScanSimMs).toBe(130);
    expect(plc.read('%MW2')).toBe(2); // OB100 chạy lại
  });

  it('A6: period 10 = stepMs → scan tại 10,20,30… (không có scan tại 0)', () => {
    const plc = makePlc(prog([counterOb()], [], [{ ob: 1, block: 'Main' }]));
    plc.start();
    runSteps(plc, 3);
    expect(plc.getDiagnostics().scanCount).toBe(3);
    expect(plc.getDiagnostics().lastScanSimMs).toBe(30);
  });
});

describe('bảng B — process image (§8.4)', () => {
  it('B1: Q0.1 thấy giá trị vừa ghi cùng scan; ghi %I vào PII; latch ghi đè scan sau', async () => {
    const ob = obBlock(
      'Main',
      1,
      [
        assign(local('t'), load(abs('I', 0, 'Bool', 0), 'Bool')),
        assign(abs('Q', 0, 'Bool', 0), load(local('t'), 'Bool')),
        assign(abs('Q', 0, 'Bool', 1), load(abs('Q', 0, 'Bool', 0), 'Bool')),
        assign(abs('I', 0, 'Bool', 1), load(abs('I', 0, 'Bool', 0), 'Bool')),
        assign(local('t'), load(abs('I', 0, 'Bool', 1), 'Bool')),
        assign(abs('M', 0, 'Bool', 0), load(local('t'), 'Bool')),
      ],
      [v('t', 'Bool')],
    );
    const { plc, tags } = await plcWithIo(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    tags.write('IN0', true, 'test');
    plc.start();
    runSteps(plc, 1); // scan t=10
    expect(plc.read('%Q0.0')).toBe(true);
    expect(plc.read('%Q0.1')).toBe(true);
    expect(plc.read('%M0.0')).toBe(true);
    expect(tags.get(2 as TagHandle)).toBe(true);
    expect(tags.get(3 as TagHandle)).toBe(true);
    tags.write('IN0', false, 'test');
    runSteps(plc, 1, 10, 10); // scan t=20, latch ghi đè
    expect(plc.read('%Q0.0')).toBe(false);
    expect(plc.read('%Q0.1')).toBe(false);
    expect(plc.read('%M0.0')).toBe(false);
  });

  it('B2: IF %I0.0 THEN %M0.0 := TRUE — M giữ khi input về FALSE', async () => {
    const ob = obBlock('Main', 1, [
      ifStmt(load(abs('I', 0, 'Bool', 0), 'Bool'), [
        assign(abs('M', 0, 'Bool', 0), bool(true)),
      ]),
    ]);
    const { plc, tags } = await plcWithIo(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    tags.write('IN0', true, 'test');
    plc.start();
    runSteps(plc, 1);
    expect(plc.read('%M0.0')).toBe(true);
    tags.write('IN0', false, 'test');
    runSteps(plc, 1, 10, 10);
    expect(plc.read('%M0.0')).toBe(true);
  });
});

function cyclicProgram(phaseMs?: number): IrProgram {
  const ob100 = obBlock('Init', 100, [assign(abs('M', 2, 'Int'), num(1))]);
  const ob35 = obBlock('Cyclic', 35, [
    assign(abs('M', 4, 'Int'), bin('add', load(abs('M', 4, 'Int'), 'Int'), num(1), 'Int')),
  ]);
  const ob1 = obBlock('Main', 1, [
    assign(abs('M', 0, 'Int'), bin('add', load(abs('M', 0, 'Int'), 'Int'), num(1), 'Int')),
  ]);
  return prog([ob100, ob35, ob1], [], [
    { ob: 100, block: 'Init' },
    { ob: 35, block: 'Cyclic', cycleMs: 100, ...(phaseMs !== undefined ? { phaseMs } : {}) },
    { ob: 1, block: 'Main' },
  ]);
}

describe('bảng C — OB100 một lần + cyclic OB (§8.3)', () => {
  it('C t=20: MW0=1, MW2=1, MW4=0 (OB100 ở scan đầu, OB35 chưa đến hạn)', () => {
    const plc = makePlc(cyclicProgram(), { scanPeriodMs: 20 });
    plc.start();
    runSteps(plc, 2); // scan tại 20
    expect(plc.read('%MW0')).toBe(1);
    expect(plc.read('%MW2')).toBe(1);
    expect(plc.read('%MW4')).toBe(0);
  });

  it('C t=40: MW0=2, MW4=0 (chỉ OB1)', () => {
    const plc = makePlc(cyclicProgram(), { scanPeriodMs: 20 });
    plc.start();
    runSteps(plc, 4);
    expect(plc.read('%MW0')).toBe(2);
    expect(plc.read('%MW2')).toBe(1);
    expect(plc.read('%MW4')).toBe(0);
  });

  it('C t=100: MW0=5, MW4=1 (OB35 chạy TRƯỚC OB1)', () => {
    const plc = makePlc(cyclicProgram(), { scanPeriodMs: 20 });
    plc.start();
    runSteps(plc, 10);
    expect(plc.read('%MW0')).toBe(5);
    expect(plc.read('%MW4')).toBe(1);
  });

  it('C t=200: MW0=10, MW4=2', () => {
    const plc = makePlc(cyclicProgram(), { scanPeriodMs: 20 });
    plc.start();
    runSteps(plc, 20);
    expect(plc.read('%MW0')).toBe(10);
    expect(plc.read('%MW4')).toBe(2);
  });

  it('C-overrun: OB1 period 200, OB35 period 100 → trễ 1 kỳ/scan, CYCLE_OVERRUN tăng', () => {
    const plc = makePlc(cyclicProgram(), { scanPeriodMs: 200 });
    plc.start();
    runSteps(plc, 1, 200);
    expect(plc.read('%MW4')).toBe(1);
    expect(faultCount(plc, 'CYCLE_OVERRUN')).toBe(1);
    runSteps(plc, 1, 200, 200);
    expect(plc.read('%MW4')).toBe(2);
    expect(faultCount(plc, 'CYCLE_OVERRUN')).toBe(2);
    runSteps(plc, 1, 200, 400);
    expect(plc.read('%MW4')).toBe(3);
    expect(faultCount(plc, 'CYCLE_OVERRUN')).toBe(3);
  });

  it('C-phase: OB35 period 100 phase 30 → đến hạn ở scan t=40, t=140; MW4=2 sau t=140', () => {
    const plc = makePlc(cyclicProgram(30), { scanPeriodMs: 20 });
    plc.start();
    runSteps(plc, 14); // clock 0→140: scan tại 20,40,60,80,100,120,140
    expect(plc.read('%MW4')).toBe(2);
    expect(faultCount(plc, 'CYCLE_OVERRUN')).toBe(0);
  });
});

function fbLatchBlock(): { fb: IrBlock; db: IrDb } {
  const fb = fbBlock(
    'FB_Latch',
    iface(
      [v('iSet', 'Bool'), v('iReset', 'Bool')],
      [v('qOut', 'Bool')],
      [v('ioCount', 'Int')],
      [v('sLatched', 'Bool')],
      [],
    ),
    [
      ifStmt(load(local('iSet'), 'Bool'), [assign(local('sLatched'), bool(true))]),
      ifStmt(load(local('iReset'), 'Bool'), [assign(local('sLatched'), bool(false))]),
      assign(local('qOut'), load(local('sLatched'), 'Bool')),
      assign(local('ioCount'), bin('add', load(local('ioCount'), 'Int'), num(1), 'Int')),
    ],
  );
  return { fb, db: dbForFb('FB_Latch', 'FB_Latch_DB', fb.interface) };
}

describe('bảng D — gọi block (FB + IN_OUT + TEMP + độ sâu + giới hạn)', () => {
  it('D FB 4-scan: latch giữ, IN_OUT tăng mỗi scan (MW10 = 1,2,3,4)', async () => {
    const { fb, db } = fbLatchBlock();
    const ob = obBlock('Main', 1, [
      callFbStmt(
        'FB_Latch',
        dbField('FB_Latch_DB', []),
        [
          ['iSet', load(abs('I', 0, 'Bool', 0), 'Bool')],
          ['iReset', load(abs('I', 0, 'Bool', 1), 'Bool')],
        ],
        [],
        [['ioCount', abs('M', 10, 'Int')]],
      ),
      assign(abs('Q', 0, 'Bool', 0), load(dbField('FB_Latch_DB', ['qOut']), 'Bool')),
    ]);
    const { plc, tags } = await plcWithIo(prog([ob, fb], [db], [{ ob: 1, block: 'Main' }]));
    plc.start();
    // scan t=10: 0/0 → FALSE, MW10=1
    runSteps(plc, 1);
    expect(tags.get(2 as TagHandle)).toBe(false);
    expect(plc.read('%MW10')).toBe(1);
    // scan t=20: 1/0 → TRUE, MW10=2
    tags.write('IN0', true, 'test');
    runSteps(plc, 1, 10, 10);
    expect(tags.get(2 as TagHandle)).toBe(true);
    expect(plc.read('%MW10')).toBe(2);
    // scan t=30: 0/0 → giữ TRUE, MW10=3
    tags.write('IN0', false, 'test');
    runSteps(plc, 1, 10, 20);
    expect(tags.get(2 as TagHandle)).toBe(true);
    expect(plc.read('%MW10')).toBe(3);
    // scan t=40: 0/1 → FALSE, MW10=4
    tags.write('IN1', true, 'test');
    runSteps(plc, 1, 10, 30);
    expect(tags.get(2 as TagHandle)).toBe(false);
    expect(plc.read('%MW10')).toBe(4);
  });

  it('D TEMP: FC_Temp qua 2 scan → MW12=5 cả hai lần', () => {
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
    const plc = makePlc(prog([ob, fcTemp], [], [{ ob: 1, block: 'Main' }]));
    plc.start();
    runSteps(plc, 1);
    expect(plc.read('%MW12')).toBe(5);
    runSteps(plc, 1, 10, 10);
    expect(plc.read('%MW12')).toBe(5);
  });

  it('D FC return: FC_Add(20, 22) → MW0=42', () => {
    const fcAdd = fcBlock(
      'FC_Add',
      iface([v('a', 'Int'), v('b', 'Int')], [], [], [], [v('FC_Add', 'Int')]),
      [assign(local('FC_Add'), bin('add', load(local('a'), 'Int'), load(local('b'), 'Int'), 'Int'))],
      'Int',
    );
    const ob = obBlock('Main', 1, [
      callFcStmt('FC_Add', [['a', num(20)], ['b', num(22)]], abs('M', 0, 'Int')),
    ]);
    const plc = scanOnce(prog([ob, fcAdd], [], [{ ob: 1, block: 'Main' }]));
    expect(plc.read('%MW0')).toBe(42);
  });

  it('D depth: chuỗi 25 FC, maxCallDepth=24 → FC_1=24, CALL_DEPTH=1', () => {
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
            [assign(local(name), bin('add', callFcExpr(next, [], 'Int'), num(1), 'Int'))],
            'Int',
          ),
        );
      }
    }
    const ob = obBlock('Main', 1, [assign(abs('M', 0, 'Int'), callFcExpr('FC_1', [], 'Int'))]);
    const plc = scanOnce(prog([ob, ...blocks], [], [{ ob: 1, block: 'Main' }]));
    expect(plc.read('%MW0')).toBe(24);
    expect(faultCount(plc, 'CALL_DEPTH')).toBe(1);
  });

  it('D loop: WHILE TRUE → LOOP_LIMIT=1, MW0=10000, chạy tiếp', () => {
    const ob = obBlock(
      'Main',
      1,
      [
        assign(local('i'), num(0)),
        whileStmt(bool(true), [
          assign(local('i'), bin('add', load(local('i'), 'Int'), num(1), 'Int')),
        ]),
        assign(abs('M', 0, 'Int'), load(local('i'), 'Int')),
      ],
      [v('i', 'Int')],
    );
    const plc = scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    expect(plc.read('%MW0')).toBe(10000);
    expect(faultCount(plc, 'LOOP_LIMIT')).toBe(1);
  });

  it('D multi-instance: 2 DB của FB_Latch độc lập', async () => {
    const { fb } = fbLatchBlock();
    const db1 = dbForFb('FB_Latch', 'DB_Latch1', fb.interface);
    const db2 = dbForFb('FB_Latch', 'DB_Latch2', fb.interface);
    const ob = obBlock('Main', 1, [
      callFbStmt(
        'FB_Latch',
        dbField('DB_Latch1', []),
        [['iSet', load(abs('I', 0, 'Bool', 0), 'Bool')]],
        [],
        [['ioCount', abs('M', 10, 'Int')]],
      ),
      assign(abs('Q', 0, 'Bool', 0), load(dbField('DB_Latch1', ['qOut']), 'Bool')),
      callFbStmt(
        'FB_Latch',
        dbField('DB_Latch2', []),
        [['iSet', load(abs('I', 0, 'Bool', 1), 'Bool')]],
        [],
        [['ioCount', abs('M', 12, 'Int')]],
      ),
      assign(abs('Q', 0, 'Bool', 1), load(dbField('DB_Latch2', ['qOut']), 'Bool')),
    ]);
    const { plc, tags } = await plcWithIo(
      prog([ob, fb], [db1, db2], [{ ob: 1, block: 'Main' }]),
    );
    plc.start();
    tags.write('IN0', true, 'test');
    runSteps(plc, 1);
    expect(tags.get(2 as TagHandle)).toBe(true); // DB1 chốt
    expect(tags.get(3 as TagHandle)).toBe(false); // DB2 chưa
    tags.write('IN0', false, 'test');
    tags.write('IN1', true, 'test');
    runSteps(plc, 1, 10, 10);
    expect(tags.get(2 as TagHandle)).toBe(true); // DB1 giữ
    expect(tags.get(3 as TagHandle)).toBe(true); // DB2 chốt
    expect(plc.read('%MW10')).toBe(2);
    expect(plc.read('%MW12')).toBe(2);
  });

  it('D callSys: TON không handler → SYS_UNSUPPORTED=1, chạy tiếp', () => {
    const ob = obBlock('Main', 1, [
      assign(abs('M', 0, 'Int'), num(1)),
      callSysStmt('TON', [['IN', bool(true)], ['PT', num(1000, 'Time')]], []),
      assign(abs('M', 2, 'Int'), num(2)),
    ]);
    const plc = scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    expect(plc.read('%MW0')).toBe(1);
    expect(plc.read('%MW2')).toBe(2);
    expect(faultCount(plc, 'SYS_UNSUPPORTED')).toBe(1);
  });

  it('D IN_OUT: FB_Inc ghi thẳng %MW0 của caller (2 scan → 2)', () => {
    const fbInc = fbBlock(
      'FB_Inc',
      iface([], [], [v('cnt', 'Int')], [], []),
      [assign(local('cnt'), bin('add', load(local('cnt'), 'Int'), num(1), 'Int'))],
    );
    const db = dbForFb('FB_Inc', 'FB_Inc_DB', fbInc.interface);
    const ob = obBlock('Main', 1, [
      callFbStmt('FB_Inc', dbField('FB_Inc_DB', []), [], [], [['cnt', abs('M', 0, 'Int')]]),
    ]);
    const plc = makePlc(prog([ob, fbInc], [db], [{ ob: 1, block: 'Main' }]));
    plc.start();
    runSteps(plc, 2);
    expect(plc.read('%MW0')).toBe(2);
  });
});

describe('bảng G — điều khiển luồng (qua scan)', () => {
  it('G1: CASE range/đơn/ELSE → 1/2/3', () => {
    const runCase = (n: number): number => {
      const ob = obBlock('Main', 1, [
        assign(abs('M', 0, 'Int'), num(n)),
        caseStmt(load(abs('M', 0, 'Int'), 'Int'), [
          { labels: [[1, 3]], body: [assign(abs('M', 2, 'Int'), num(1))] },
          { labels: [5], body: [assign(abs('M', 2, 'Int'), num(2))] },
        ], [assign(abs('M', 2, 'Int'), num(3))]),
      ]);
      return scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }])).read('%MW2') as number;
    };
    expect(runCase(2)).toBe(1);
    expect(runCase(5)).toBe(2);
    expect(runCase(9)).toBe(3);
  });

  it('G2: WHILE + EXIT → i=3', () => {
    const ob = obBlock(
      'Main',
      1,
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
    expect(scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }])).read('%MW0')).toBe(3);
  });

  it('G3: FOR + CONTINUE → s=9 (1+3+5)', () => {
    const ob = obBlock(
      'Main',
      1,
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
    expect(scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }])).read('%MW0')).toBe(9);
  });

  it('G4: RETURN dừng block → r=1', () => {
    const ob = obBlock('Main', 1, [
      assign(abs('M', 0, 'Int'), num(1)),
      returnStmt(),
      assign(abs('M', 0, 'Int'), num(2)),
    ]);
    expect(scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }])).read('%MW0')).toBe(1);
  });

  it('G5: REPEAT chạy ít nhất 1 lần → i=1', () => {
    const ob = obBlock(
      'Main',
      1,
      [
        assign(local('i'), num(0)),
        repeatStmt(bool(true), [
          assign(local('i'), bin('add', load(local('i'), 'Int'), num(1), 'Int')),
        ]),
        assign(abs('M', 0, 'Int'), load(local('i'), 'Int')),
      ],
      [v('i', 'Int')],
    );
    expect(scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }])).read('%MW0')).toBe(1);
  });

  it('G6: IF/ELSIF/ELSE → 2/3/1', () => {
    const runIf = (a: boolean, b: boolean): number => {
      const ob = obBlock('Main', 1, [
        ifStmt(bool(a), [assign(abs('M', 0, 'Int'), num(1))], [
          { cond: bool(b), body: [assign(abs('M', 0, 'Int'), num(2))] },
        ], [assign(abs('M', 0, 'Int'), num(3))]),
      ]);
      return scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }])).read('%MW0') as number;
    };
    expect(runIf(false, true)).toBe(2);
    expect(runIf(false, false)).toBe(3);
    expect(runIf(true, false)).toBe(1);
  });

  it('G7: WHILE trong IF FALSE → i=0', () => {
    const ob = obBlock(
      'Main',
      1,
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
    expect(scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }])).read('%MW0')).toBe(0);
  });

  it('G8: bit logic AND/OR/NOT/XOR với 3 bộ input', () => {
    const runBits = (i0: boolean, i1: boolean): [boolean, boolean, boolean, boolean] => {
      const ob = obBlock('Main', 1, [
        assign(abs('M', 0, 'Bool', 0), bin('and', load(abs('I', 0, 'Bool', 0), 'Bool'), load(abs('I', 0, 'Bool', 1), 'Bool'), 'Bool')),
        assign(abs('M', 0, 'Bool', 1), bin('or', load(abs('I', 0, 'Bool', 0), 'Bool'), load(abs('I', 0, 'Bool', 1), 'Bool'), 'Bool')),
        assign(abs('M', 0, 'Bool', 2), unary('not', load(abs('I', 0, 'Bool', 0), 'Bool'), 'Bool')),
        assign(abs('M', 0, 'Bool', 3), bin('xor', load(abs('I', 0, 'Bool', 0), 'Bool'), load(abs('I', 0, 'Bool', 1), 'Bool'), 'Bool')),
      ]);
      const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
      plc.write('%I0.0', i0);
      plc.write('%I0.1', i1);
      plc.start();
      runSteps(plc, 1);
      return [
        plc.read('%M0.0') as boolean,
        plc.read('%M0.1') as boolean,
        plc.read('%M0.2') as boolean,
        plc.read('%M0.3') as boolean,
      ];
    };
    expect(runBits(true, false)).toEqual([false, true, false, true]);
    expect(runBits(true, true)).toEqual([true, true, false, false]);
    expect(runBits(false, false)).toEqual([false, false, true, false]);
  });
});

describe('bit logic — 7 chương trình (truth table tính tay)', () => {
  function runBitProgram(
    body: IrStmt[],
    setInputs: (plc: SoftPlc) => void,
  ): SoftPlc {
    const ob = obBlock('Main', 1, body);
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    setInputs(plc);
    plc.start();
    runSteps(plc, 1);
    return plc;
  }

  it('AND: 4 combo → 1,0,0,0', () => {
    const run = (a: boolean, b: boolean): boolean => {
      const plc = runBitProgram(
        [assign(abs('M', 0, 'Bool', 0), bin('and', load(abs('I', 0, 'Bool', 0), 'Bool'), load(abs('I', 0, 'Bool', 1), 'Bool'), 'Bool'))],
        (p) => {
          p.write('%I0.0', a);
          p.write('%I0.1', b);
        },
      );
      return plc.read('%M0.0') as boolean;
    };
    expect(run(true, true)).toBe(true);
    expect(run(true, false)).toBe(false);
    expect(run(false, true)).toBe(false);
    expect(run(false, false)).toBe(false);
  });

  it('OR: 4 combo → 1,1,1,0', () => {
    const run = (a: boolean, b: boolean): boolean => {
      const plc = runBitProgram(
        [assign(abs('M', 0, 'Bool', 0), bin('or', load(abs('I', 0, 'Bool', 0), 'Bool'), load(abs('I', 0, 'Bool', 1), 'Bool'), 'Bool'))],
        (p) => {
          p.write('%I0.0', a);
          p.write('%I0.1', b);
        },
      );
      return plc.read('%M0.0') as boolean;
    };
    expect(run(true, true)).toBe(true);
    expect(run(true, false)).toBe(true);
    expect(run(false, true)).toBe(true);
    expect(run(false, false)).toBe(false);
  });

  it('NOT: 2 combo → 0,1', () => {
    const run = (a: boolean): boolean => {
      const plc = runBitProgram(
        [assign(abs('M', 0, 'Bool', 0), unary('not', load(abs('I', 0, 'Bool', 0), 'Bool'), 'Bool'))],
        (p) => { p.write('%I0.0', a); },
      );
      return plc.read('%M0.0') as boolean;
    };
    expect(run(true)).toBe(false);
    expect(run(false)).toBe(true);
  });

  it('SET-RST latch: set → giữ → reset → 0', () => {
    const ob = obBlock('Main', 1, [
      assign(
        abs('M', 0, 'Bool', 0),
        bin(
          'and',
          bin('or', load(abs('I', 0, 'Bool', 0), 'Bool'), load(abs('M', 0, 'Bool', 0), 'Bool'), 'Bool'),
          unary('not', load(abs('I', 0, 'Bool', 1), 'Bool'), 'Bool'),
          'Bool',
        ),
      ),
    ]);
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    plc.start();
    plc.write('%I0.0', true);
    runSteps(plc, 1);
    expect(plc.read('%M0.0')).toBe(true);
    plc.write('%I0.0', false);
    runSteps(plc, 1, 10, 10);
    expect(plc.read('%M0.0')).toBe(true);
    plc.write('%I0.1', true);
    runSteps(plc, 1, 10, 20);
    expect(plc.read('%M0.0')).toBe(false);
  });

  it('seal-in (contact-coil): start → giữ → stop → 0', async () => {
    const ob = obBlock('Main', 1, [
      assign(
        abs('Q', 0, 'Bool', 0),
        bin(
          'and',
          bin('or', load(abs('I', 0, 'Bool', 0), 'Bool'), load(abs('Q', 0, 'Bool', 0), 'Bool'), 'Bool'),
          unary('not', load(abs('I', 0, 'Bool', 1), 'Bool'), 'Bool'),
          'Bool',
        ),
      ),
    ]);
    const { plc, tags } = await plcWithIo(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    plc.start();
    tags.write('IN0', true, 'test');
    runSteps(plc, 1);
    expect(tags.get(2 as TagHandle)).toBe(true);
    tags.write('IN0', false, 'test');
    runSteps(plc, 1, 10, 10);
    expect(tags.get(2 as TagHandle)).toBe(true);
    tags.write('IN1', true, 'test');
    runSteps(plc, 1, 10, 20);
    expect(tags.get(2 as TagHandle)).toBe(false);
  });

  it('rising edge: 1,0,0,1 qua 4 scan', () => {
    const ob = obBlock('Main', 1, [
      assign(
        abs('M', 0, 'Bool', 0),
        bin('and', load(abs('I', 0, 'Bool', 0), 'Bool'), unary('not', load(abs('M', 0, 'Bool', 1), 'Bool'), 'Bool'), 'Bool'),
      ),
      assign(abs('M', 0, 'Bool', 1), load(abs('I', 0, 'Bool', 0), 'Bool')),
    ]);
    const plc = makePlc(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    plc.start();
    const scan = (i: boolean): boolean => {
      plc.write('%I0.0', i);
      runSteps(plc, 1, 10, plc.getDiagnostics().scanCount * 10);
      return plc.read('%M0.0') as boolean;
    };
    expect(scan(true)).toBe(true);
    expect(scan(true)).toBe(false);
    expect(scan(false)).toBe(false);
    expect(scan(true)).toBe(true);
  });

  it('NAND: 4 combo → 0,1,1,1', () => {
    const run = (a: boolean, b: boolean): boolean => {
      const plc = runBitProgram(
        [
          assign(
            abs('M', 0, 'Bool', 0),
            unary(
              'not',
              bin('and', load(abs('I', 0, 'Bool', 0), 'Bool'), load(abs('I', 0, 'Bool', 1), 'Bool'), 'Bool'),
              'Bool',
            ),
          ),
        ],
        (p) => {
          p.write('%I0.0', a);
          p.write('%I0.1', b);
        },
      );
      return plc.read('%M0.0') as boolean;
    };
    expect(run(true, true)).toBe(false);
    expect(run(true, false)).toBe(true);
    expect(run(false, true)).toBe(true);
    expect(run(false, false)).toBe(true);
  });
});

const realDefs: TagDef[] = [
  { name: 'R0', type: 'Real', area: 'Q', address: '%QD0', controller: 'PLC1', signal: { kind: 'AO' } },
  { name: 'R1', type: 'Real', area: 'Q', address: '%QD4', controller: 'PLC1', signal: { kind: 'AO' } },
  { name: 'R2', type: 'Real', area: 'Q', address: '%QD8', controller: 'PLC1', signal: { kind: 'AO' } },
  { name: 'R3', type: 'Real', area: 'Q', address: '%QD12', controller: 'PLC1', signal: { kind: 'AO' } },
];

describe('bảng E — số học §7.2 (qua chương trình OB thật)', () => {
  it('E1: 32767 + 1 (Int) → −32768', () => {
    const ob = obBlock('Main', 1, [
      assign(abs('M', 0, 'Int'), bin('add', num(32767), num(1), 'Int')),
    ]);
    expect(scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }])).read('%MW0')).toBe(-32768);
  });

  it('E2: −32768 − 1 (Int) → 32767', () => {
    const ob = obBlock('Main', 1, [
      assign(abs('M', 0, 'Int'), bin('sub', num(-32768), num(1), 'Int')),
    ]);
    expect(scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }])).read('%MW0')).toBe(32767);
  });

  it('E3: 32767 * 2 (Int) → −2', () => {
    const ob = obBlock('Main', 1, [
      assign(abs('M', 0, 'Int'), bin('mul', num(32767), num(2), 'Int')),
    ]);
    expect(scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }])).read('%MW0')).toBe(-2);
  });

  it('E4: 2147483647 + 1 (DInt) → −2147483648', () => {
    const ob = obBlock('Main', 1, [
      assign(abs('M', 0, 'DInt'), bin('add', num(2147483647, 'DInt'), num(1, 'DInt'), 'DInt')),
    ]);
    expect(scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }])).read('%MD0')).toBe(-2147483648);
  });

  it('E5: div/mod cắt về 0, MOD dấu theo số bị chia → 3, −3, 1, −1', () => {
    const ob = obBlock('Main', 1, [
      assign(abs('M', 0, 'Int'), bin('div', num(7), num(2), 'Int')),
      assign(abs('M', 2, 'Int'), bin('div', num(-7), num(2), 'Int')),
      assign(abs('M', 4, 'Int'), bin('mod', num(7), num(2), 'Int')),
      assign(abs('M', 6, 'Int'), bin('mod', num(-7), num(2), 'Int')),
    ]);
    const plc = scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    expect(plc.read('%MW0')).toBe(3);
    expect(plc.read('%MW2')).toBe(-3);
    expect(plc.read('%MW4')).toBe(1);
    expect(plc.read('%MW6')).toBe(-1);
  });

  it('E6: 7 / 0 và 7 MOD 0 → 0, 0; DIV_ZERO ×2', () => {
    const ob = obBlock('Main', 1, [
      assign(abs('M', 0, 'Int'), bin('div', num(7), num(0), 'Int')),
      assign(abs('M', 2, 'Int'), bin('mod', num(7), num(0), 'Int')),
    ]);
    const plc = scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    expect(plc.read('%MW0')).toBe(0);
    expect(plc.read('%MW2')).toBe(0);
    expect(faultCount(plc, 'DIV_ZERO')).toBe(2);
  });

  it('E7: chia Real cho 0 → +Inf, −Inf, NaN (IEEE, không fault)', async () => {
    const ob = obBlock('Main', 1, [
      assign(abs('Q', 0, 'Real'), bin('div', num(1.0, 'Real'), num(0.0, 'Real'), 'Real')),
      assign(abs('Q', 4, 'Real'), bin('div', num(-1.0, 'Real'), num(0.0, 'Real'), 'Real')),
      assign(abs('Q', 8, 'Real'), bin('div', num(0.0, 'Real'), num(0.0, 'Real'), 'Real')),
    ]);
    const { plc } = await plcWithIo(prog([ob], [], [{ ob: 1, block: 'Main' }]), realDefs);
    plc.start();
    runSteps(plc, 1);
    expect(plc.read('R0')).toBe(Number.POSITIVE_INFINITY);
    expect(plc.read('R1')).toBe(Number.NEGATIVE_INFINITY);
    expect(Number.isNaN(plc.read('R2') as number)).toBe(true);
    expect(faultCount(plc, 'DIV_ZERO')).toBe(0);
  });

  it('E8: SQRT(−1) → NaN, SQRT(4) → 2.0', async () => {
    const ob = obBlock('Main', 1, [
      assign(abs('Q', 0, 'Real'), intrinsic('SQRT', [num(-1.0, 'Real')], 'Real')),
      assign(abs('Q', 4, 'Real'), intrinsic('SQRT', [num(4.0, 'Real')], 'Real')),
    ]);
    const { plc } = await plcWithIo(prog([ob], [], [{ ob: 1, block: 'Main' }]), realDefs);
    plc.start();
    runSteps(plc, 1);
    expect(Number.isNaN(plc.read('R0') as number)).toBe(true);
    expect(plc.read('R1')).toBe(2.0);
  });

  it('E9: REAL_TO_INT bankers → 2, 4, −2, −4, 0, 2', () => {
    const vals: [number, number][] = [
      [2.5, 2],
      [3.5, 4],
      [-2.5, -2],
      [-3.5, -4],
      [0.5, 0],
      [1.5, 2],
    ];
    const body = vals.map(([x], i) =>
      assign(abs('M', i * 2, 'Int'), convert(num(x, 'Real'), 'Real', 'Int')),
    );
    const ob = obBlock('Main', 1, body);
    const plc = scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    vals.forEach(([, expected], i) => {
      expect(plc.read(`%MW${String(i * 2)}`)).toBe(expected);
    });
  });

  it('E9b: TRUNC/CEIL/FLOOR → 2, −2, 3, −2, 2, −3', () => {
    const ob = obBlock('Main', 1, [
      assign(abs('M', 0, 'Int'), convert(num(2.9, 'Real'), 'Real', 'Int', 'trunc')),
      assign(abs('M', 2, 'Int'), convert(num(-2.9, 'Real'), 'Real', 'Int', 'trunc')),
      assign(abs('M', 4, 'Int'), intrinsic('CEIL', [num(2.1, 'Real')], 'Int')),
      assign(abs('M', 6, 'Int'), intrinsic('CEIL', [num(-2.1, 'Real')], 'Int')),
      assign(abs('M', 8, 'Int'), intrinsic('FLOOR', [num(2.9, 'Real')], 'Int')),
      assign(abs('M', 10, 'Int'), intrinsic('FLOOR', [num(-2.9, 'Real')], 'Int')),
    ]);
    const plc = scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    expect([0, 2, 4, 6, 8, 10].map((b) => plc.read(`%MW${String(b)}`))).toEqual([2, -2, 3, -2, 2, -3]);
  });

  it('E10: REAL_TO_INT(40000) và (NaN) → 0, 0; CONV_RANGE ×2', () => {
    const ob = obBlock('Main', 1, [
      assign(abs('M', 0, 'Int'), convert(num(40000.0, 'Real'), 'Real', 'Int')),
      assign(abs('M', 2, 'Int'), convert(num(Number.NaN, 'Real'), 'Real', 'Int')),
    ]);
    const plc = scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    expect(plc.read('%MW0')).toBe(0);
    expect(plc.read('%MW2')).toBe(0);
    expect(faultCount(plc, 'CONV_RANGE')).toBe(2);
  });

  it('E10b: INT_TO_REAL(16777217) → 16777216.0 (fround)', async () => {
    const ob = obBlock('Main', 1, [
      assign(abs('Q', 0, 'Real'), convert(num(16777217, 'Int'), 'Int', 'Real')),
    ]);
    const { plc } = await plcWithIo(prog([ob], [], [{ ob: 1, block: 'Main' }]), realDefs);
    plc.start();
    runSteps(plc, 1);
    expect(plc.read('R0')).toBe(16777216.0);
  });

  it('E11: 0.1 + 0.2 = 0.3 TRUE (cả hai vế fround)', async () => {
    const ob = obBlock(
      'Main',
      1,
      [
        assign(local('r'), bin('add', num(0.1, 'Real'), num(0.2, 'Real'), 'Real')),
        assign(local('b'), bin('eq', load(local('r'), 'Real'), num(0.3, 'Real'), 'Bool')),
        assign(abs('Q', 0, 'Real'), load(local('r'), 'Real')),
        assign(abs('M', 0, 'Bool', 0), load(local('b'), 'Bool')),
      ],
      [v('r', 'Real'), v('b', 'Bool')],
    );
    const { plc } = await plcWithIo(prog([ob], [], [{ ob: 1, block: 'Main' }]), realDefs);
    plc.start();
    runSteps(plc, 1);
    expect(plc.read('R0')).toBe(0.30000001192092896);
    expect(plc.read('%M0.0')).toBe(true);
  });

  it('E12: shift → 8, 0, −1, 16#4000, 16#03, 16#C0, 0', () => {
    const ob = obBlock('Main', 1, [
      assign(abs('M', 0, 'Word'), intrinsic('SHL', [num(1, 'Word'), num(3)], 'Word')),
      assign(abs('M', 2, 'Word'), intrinsic('SHL', [num(1, 'Word'), num(16)], 'Word')),
      assign(abs('M', 4, 'Int'), intrinsic('SHR', [num(-1, 'Int'), num(1)], 'Int')),
      assign(abs('M', 6, 'Word'), intrinsic('SHR', [num(0x8000, 'Word'), num(1)], 'Word')),
      assign(abs('M', 8, 'Byte'), intrinsic('ROL', [num(0x81, 'Byte'), num(1)], 'Byte')),
      assign(abs('M', 9, 'Byte'), intrinsic('ROR', [num(0x81, 'Byte'), num(1)], 'Byte')),
      assign(abs('M', 10, 'Word'), intrinsic('SHL', [num(1, 'Word'), num(-1)], 'Word')),
    ]);
    const plc = scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    expect(plc.read('%MW0')).toBe(8);
    expect(plc.read('%MW2')).toBe(0);
    expect(plc.read('%MW4')).toBe(-1);
    expect(plc.read('%MW6')).toBe(0x4000);
    expect(plc.read('%MB8')).toBe(0x03);
    expect(plc.read('%MB9')).toBe(0xc0);
    expect(plc.read('%MW10')).toBe(0);
  });

  it('E13: đọc/ghi mảng ngoài khoảng → 0, bỏ qua; ARRAY_RANGE ×2', () => {
    const ob = obBlock(
      'Main',
      1,
      [
        assign(abs('M', 0, 'Int'), load({ k: 'index', base: local('a'), index: num(5) }, 'Int')),
        assign({ k: 'index', base: local('a'), index: num(5) }, num(7)),
        assign(abs('M', 2, 'Int'), load({ k: 'index', base: local('a'), index: num(0) }, 'Int')),
      ],
      [v('a', { kind: 'array', elem: 'Int', lo: 0, hi: 3 })],
    );
    const plc = scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    expect(plc.read('%MW0')).toBe(0);
    expect(plc.read('%MW2')).toBe(0);
    expect(faultCount(plc, 'ARRAY_RANGE')).toBe(2);
  });

  it('E14: FOR bao hàm 2 đầu — 1..3 → 3 lần, 3..1 BY −1 → 3, 5..1 BY 1 → 0, 32766..32767 → 2', () => {
    const runFor = (from: number, to: number, by?: number): number => {
      const inc: IrStmt = assign(
        abs('M', 0, 'Int'),
        bin('add', load(abs('M', 0, 'Int'), 'Int'), num(1), 'Int'),
      );
      const ob = obBlock(
        'Main',
        1,
        [forStmt('i', num(from), num(to), [inc], by !== undefined ? num(by) : undefined)],
        [v('i', 'Int')],
      );
      return scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }])).read('%MW0') as number;
    };
    expect(runFor(1, 3)).toBe(3);
    expect(runFor(3, 1, -1)).toBe(3);
    expect(runFor(5, 1, 1)).toBe(0);
    expect(runFor(32766, 32767)).toBe(2);
  });

  it('E15: NORM_X/SCALE_X → 0.5, 5.0, 1.5, 20.0 (ngoài khoảng không kẹp)', async () => {
    const ob = obBlock('Main', 1, [
      assign(abs('Q', 0, 'Real'), intrinsic('NORM_X', [num(0), num(5), num(10)], 'Real')),
      assign(abs('Q', 4, 'Real'), intrinsic('SCALE_X', [num(0), num(0.5, 'Real'), num(10)], 'Real')),
      assign(abs('Q', 8, 'Real'), intrinsic('NORM_X', [num(0), num(15), num(10)], 'Real')),
      assign(abs('Q', 12, 'Real'), intrinsic('SCALE_X', [num(0), num(2.0, 'Real'), num(10)], 'Real')),
    ]);
    const { plc } = await plcWithIo(prog([ob], [], [{ ob: 1, block: 'Main' }]), realDefs);
    plc.start();
    runSteps(plc, 1);
    expect(plc.read('R0')).toBe(0.5);
    expect(plc.read('R1')).toBe(5.0);
    expect(plc.read('R2')).toBe(1.5);
    expect(plc.read('R3')).toBe(20.0);
  });

  it('E16: MIN/MAX/LIMIT → 3, 7, 0, 10, 5', () => {
    const ob = obBlock('Main', 1, [
      assign(abs('M', 0, 'Int'), intrinsic('MIN', [num(3), num(7)], 'Int')),
      assign(abs('M', 2, 'Int'), intrinsic('MAX', [num(3), num(7)], 'Int')),
      assign(abs('M', 4, 'Int'), intrinsic('LIMIT', [num(0), num(-5), num(10)], 'Int')),
      assign(abs('M', 6, 'Int'), intrinsic('LIMIT', [num(0), num(15), num(10)], 'Int')),
      assign(abs('M', 8, 'Int'), intrinsic('LIMIT', [num(0), num(5), num(10)], 'Int')),
    ]);
    const plc = scanOnce(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    expect([0, 2, 4, 6, 8].map((b) => plc.read(`%MW${String(b)}`))).toEqual([3, 7, 0, 10, 5]);
  });

  it('E17: widening Int→Real → 7.0', async () => {
    const ob = obBlock('Main', 1, [
      assign(abs('Q', 0, 'Real'), convert(num(7, 'Int'), 'Int', 'Real')),
    ]);
    const { plc } = await plcWithIo(prog([ob], [], [{ ob: 1, block: 'Main' }]), realDefs);
    plc.start();
    runSteps(plc, 1);
    expect(plc.read('R0')).toBe(7.0);
  });
});
