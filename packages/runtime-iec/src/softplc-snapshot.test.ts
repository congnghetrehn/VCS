// Force + snapshot/restore P1.4: bảng F (F1–F8) + restore sai hình → throw.
// F8 qua createSimulation trực tiếp (không phải makeSim — test-utils không
// import được từ runtime-iec theo rule runtime-iec-deps; createSimulation là
// cùng đường code trừ demoExtension). expectedFrom: 'spec' (OQ-151).

import { createSimulation, ManualClock, TagDB, TagDbIoBus } from '@vcs/kernel';
import type { SimulationProject, TagHandle } from '@vcs/kernel';
import { createTagCatalog } from '@vcs/schemas';
import type { ControllerDef, ProjectConfig, TagDef } from '@vcs/schemas';
import { describe, expect, it } from 'vitest';
import type { IrProgram } from './ir.js';
import {
  abs,
  assign,
  bin,
  bool,
  dbField,
  dbForFb,
  fbBlock,
  iface,
  load,
  makePlc,
  num,
  obBlock,
  prog,
  runSteps,
  v,
} from './ir-testkit.js';
import { softPlcExtension } from './extension.js';
import type { SoftPlc, SoftPlcSnapshot } from './softplc.js';

function counterProgram(): IrProgram {
  const ob = obBlock('Main', 1, [
    assign(abs('M', 0, 'Int'), bin('add', load(abs('M', 0, 'Int'), 'Int'), num(1), 'Int')),
    assign(abs('Q', 0, 'Bool', 0), bin('ge', load(abs('M', 0, 'Int'), 'Int'), num(3), 'Bool')),
  ]);
  return prog([ob], [], [{ ob: 1, block: 'Main' }]);
}

function ioDefs(): TagDef[] {
  return [
    { name: 'START_PB', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'IN1', type: 'Bool', area: 'I', address: '%I0.1', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'Q_OUT', type: 'Bool', area: 'Q', address: '%Q0.0', controller: 'PLC1', signal: { kind: 'DO' } },
  ];
}

async function plcWithIo(program: IrProgram): Promise<{ plc: SoftPlc; tags: TagDB }> {
  const clock = new ManualClock();
  const tags = new TagDB(ioDefs(), clock);
  const io = new TagDbIoBus(tags);
  const def: ControllerDef = { id: 'PLC1', mode: 'builtin', vendor: 'siemens', config: {} };
  const plc = makePlc(program);
  await plc.init({ id: 'PLC1', def, stepMs: 10, scanPeriodMs: 10, tags: ioDefs() }, io);
  return { plc, tags };
}

describe('bảng F — force', () => {
  it('F1: force %I0.0=TRUE (IoBus FALSE) → chương trình thấy TRUE; unforce → FALSE', async () => {
    const ob = obBlock('Main', 1, [
      assign(abs('Q', 0, 'Bool', 0), load(abs('I', 0, 'Bool', 0), 'Bool')),
    ]);
    const { plc, tags } = await plcWithIo(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    plc.force('%I0.0', true);
    plc.start();
    runSteps(plc, 1);
    expect(plc.read('%Q0.0')).toBe(true);
    expect(tags.get(2 as TagHandle)).toBe(true);
    plc.unforce('%I0.0');
    runSteps(plc, 1, 10, 10);
    expect(plc.read('%Q0.0')).toBe(false);
  });

  it('F2: force %Q0.0=TRUE thắng chương trình ghi FALSE; listForces chuẩn; unforce → chảy lại', async () => {
    const ob = obBlock('Main', 1, [assign(abs('Q', 0, 'Bool', 0), bool(false))]);
    const { plc, tags } = await plcWithIo(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    plc.force('%Q0.0', true);
    plc.start();
    runSteps(plc, 1);
    expect(tags.get(2 as TagHandle)).toBe(true);
    expect(plc.listForces()).toEqual([{ ref: '%Q0.0', value: true }]);
    plc.unforce('%Q0.0');
    runSteps(plc, 1, 10, 10);
    expect(tags.get(2 as TagHandle)).toBe(false);
  });

  it('F3: force %M0.0=TRUE; chương trình ghi FALSE; read=TRUE nhưng bộ nhớ FALSE', async () => {
    const ob = obBlock('Main', 1, [assign(abs('M', 0, 'Bool', 0), bool(false))]);
    const { plc } = await plcWithIo(prog([ob], [], [{ ob: 1, block: 'Main' }]));
    plc.force('%M0.0', true);
    plc.start();
    runSteps(plc, 1);
    expect(plc.read('%M0.0')).toBe(true);
    expect((plc.snapshot().memM[0] ?? 0) & 1).toBe(0);
    plc.unforce('%M0.0');
    expect(plc.read('%M0.0')).toBe(false);
  });

  it('F4: force "DB_X".run=TRUE; chương trình ghi FALSE; read=TRUE', async () => {
    const fbX = fbBlock('FB_X', iface([], [v('run', 'Bool')], [], [], []), []);
    const db = dbForFb('FB_X', 'DB_X', fbX.interface);
    const ob = obBlock('Main', 1, [assign(dbField('DB_X', ['run']), bool(false))]);
    const { plc } = await plcWithIo(prog([ob, fbX], [db], [{ ob: 1, block: 'Main' }]));
    plc.force('"DB_X".run', true);
    plc.start();
    runSteps(plc, 1);
    expect(plc.read('"DB_X".run')).toBe(true);
    expect((plc.snapshot().dbs[0]?.bytes[0] ?? 0) & 1).toBe(0);
    plc.unforce('"DB_X".run');
    expect(plc.read('"DB_X".run')).toBe(false);
  });

  it('F5: force bằng tên tag START_PB → listForces dạng chuẩn %I0.0; force lại bằng %I0.0 ghi đè', async () => {
    const { plc } = await plcWithIo(counterProgram());
    plc.force('START_PB', true);
    expect(plc.listForces()).toEqual([{ ref: '%I0.0', value: true }]);
    plc.force('%I0.0', false);
    expect(plc.listForces()).toEqual([{ ref: '%I0.0', value: false }]);
  });
});

describe('bảng F — snapshot/restore', () => {
  function faultProgram(): IrProgram {
    const ob = obBlock('Main', 1, [
      assign(abs('M', 0, 'Int'), bin('add', load(abs('M', 0, 'Int'), 'Int'), num(1), 'Int')),
      assign(abs('M', 2, 'Int'), bin('div', num(7), num(0), 'Int')),
      assign(abs('Q', 0, 'Bool', 0), bin('ge', load(abs('M', 0, 'Int'), 'Int'), num(3), 'Bool')),
    ]);
    return prog([ob], [], [{ ob: 1, block: 'Main' }]);
  }

  it('F6: snapshot → 3 scan → restore → 3 scan: trace Q + scanCount + faults giống hệt', async () => {
    const { plc, tags } = await plcWithIo(faultProgram());
    plc.start();
    runSteps(plc, 5);
    expect(plc.read('%MW0')).toBe(5);
    expect(plc.getDiagnostics().scanCount).toBe(5);
    expect(plc.read('%Q0.0')).toBe(true);
    const snap = plc.snapshot();
    const trace1: boolean[] = [];
    for (let k = 0; k < 3; k++) {
      plc.step(50 + k * 10, 10);
      trace1.push(tags.get(2 as TagHandle) as boolean);
    }
    expect(plc.read('%MW0')).toBe(8);
    expect(plc.getDiagnostics().scanCount).toBe(8);
    const faultsAfterFirst3 = plc.getDiagnostics().faults;
    plc.restore(snap);
    expect(plc.read('%MW0')).toBe(5);
    expect(plc.getDiagnostics().scanCount).toBe(5);
    const trace2: boolean[] = [];
    for (let k = 0; k < 3; k++) {
      plc.step(50 + k * 10, 10);
      trace2.push(tags.get(2 as TagHandle) as boolean);
    }
    expect(plc.read('%MW0')).toBe(8);
    expect(plc.getDiagnostics().scanCount).toBe(8);
    expect(trace2).toEqual([true, true, true]);
    expect(trace1).toEqual(trace2);
    // Faults sau 2 lần chạy 3 scan giống hệt nhau (kể cả count).
    expect(plc.getDiagnostics().faults).toEqual(faultsAfterFirst3);
  });

  it('F7: force trong snapshot: unforce rồi restore → force hiện lại', async () => {
    const { plc } = await plcWithIo(counterProgram());
    plc.force('%I0.0', true);
    const snap = plc.snapshot();
    plc.unforce('%I0.0');
    expect(plc.listForces()).toHaveLength(0);
    plc.restore(snap);
    expect(plc.listForces()).toEqual([{ ref: '%I0.0', value: true }]);
  });

  it('F8: tích hợp orchestrator — snapshotAll/restoreAll: TagDB Q + scanCount + simTime giống hệt', async () => {
    const program = counterProgram();
    const tags = ioDefs();
    const config: ProjectConfig = {
      schemaVersion: 1,
      name: 'F8',
      language: 'vi',
      seed: 1,
      simulation: { stepMs: 10, plcScanMs: 10, timeScale: 1 },
      files: { tags: 'tags/tags.yaml', comms: 'comms/comms.yaml', hmi: 'hmi/', plant: 'plant/equipment.yaml' },
      controllers: [{ id: 'PLC1', mode: 'builtin', vendor: 'siemens', config: {} }],
    };
    const project: SimulationProject = {
      config,
      tags,
      catalog: createTagCatalog(tags),
      diagnostics: [],
    };
    const bundle = await createSimulation(project, {
      extensions: [softPlcExtension(program)],
    });
    const plc = bundle.controllers[0] as SoftPlc;
    plc.start();
    bundle.sim.runSteps(5);
    expect(bundle.tags.read('Q_OUT').value).toBe(true);
    expect(plc.getDiagnostics().scanCount).toBe(5);
    expect(bundle.sim.simTimeMs).toBe(50);
    const snap = bundle.sim.snapshotAll();
    const trace1: boolean[] = [];
    for (let k = 0; k < 3; k++) {
      bundle.sim.runSteps(1);
      trace1.push(bundle.tags.read('Q_OUT').value as boolean);
    }
    expect(trace1).toEqual([true, true, true]);
    expect(plc.getDiagnostics().scanCount).toBe(8);
    bundle.sim.restoreAll(snap);
    expect(plc.getDiagnostics().scanCount).toBe(5);
    expect(bundle.sim.simTimeMs).toBe(50);
    const trace2: boolean[] = [];
    for (let k = 0; k < 3; k++) {
      bundle.sim.runSteps(1);
      trace2.push(bundle.tags.read('Q_OUT').value as boolean);
    }
    expect(trace2).toEqual([true, true, true]);
    expect(plc.getDiagnostics().scanCount).toBe(8);
    expect(bundle.sim.simTimeMs).toBe(80);
  });
});

describe('restore sai hình → throw ồn ào', () => {
  it('version sai → throw', async () => {
    const { plc } = await plcWithIo(counterProgram());
    const snap = plc.snapshot();
    const bad = { ...snap, version: 99 } as unknown as SoftPlcSnapshot;
    expect(() => {
      plc.restore(bad);
    }).toThrow(/version/);
  });

  it('thiếu trường → throw', async () => {
    const { plc } = await plcWithIo(counterProgram());
    const snap = plc.snapshot() as unknown as Record<string, unknown>;
    delete snap.memQ;
    expect(() => {
      plc.restore(snap);
    }).toThrow(/memQ/);
  });

  it('độ dài byte sai → throw', async () => {
    const { plc } = await plcWithIo(counterProgram());
    const snap = plc.snapshot();
    const bad = { ...snap, memM: [0] } as SoftPlcSnapshot;
    expect(() => {
      plc.restore(bad);
    }).toThrow(/memM/);
  });
});

describe('restore sai hình — ma trận', () => {
  function dbProgram(): IrProgram {
    const fbX = fbBlock('FB_X', iface([], [v('run', 'Bool')], [], [], []), []);
    const db = dbForFb('FB_X', 'DB_X', fbX.interface);
    const ob = obBlock('Main', 1, [assign(dbField('DB_X', ['run']), bool(false))]);
    return prog([ob, fbX], [db], [{ ob: 1, block: 'Main' }]);
  }

  function cyclicProgram(): IrProgram {
    const ob = obBlock('Main', 1, [
      assign(abs('M', 0, 'Int'), bin('add', load(abs('M', 0, 'Int'), 'Int'), num(1), 'Int')),
    ]);
    const cyc = obBlock('Cyc', 30, [
      assign(abs('M', 2, 'Int'), bin('add', load(abs('M', 2, 'Int'), 'Int'), num(1), 'Int')),
    ]);
    return prog(
      [ob, cyc],
      [],
      [
        { ob: 1, block: 'Main' },
        { ob: 30, block: 'Cyc', cycleMs: 100 },
      ],
    );
  }

  it('restore(null/42/[]) → throw "không phải object"', async () => {
    const { plc } = await plcWithIo(counterProgram());
    expect(() => { plc.restore(null); }).toThrow(/không phải object/);
    expect(() => { plc.restore(42); }).toThrow(/không phải object/);
    expect(() => { plc.restore([]); }).toThrow(/không phải object/);
  });

  it('state không hợp lệ → throw; thiếu trường số → throw', async () => {
    const { plc } = await plcWithIo(counterProgram());
    const snap = plc.snapshot();
    expect(() => { plc.restore({ ...snap, state: 'FAULT' }); }).toThrow(/state không hợp lệ/);
    const missing = plc.snapshot() as unknown as Record<string, unknown>;
    delete missing.scanCount;
    expect(() => { plc.restore(missing); }).toThrow(/thiếu trường/);
  });

  it('memI/memQ sai độ dài → throw', async () => {
    const { plc } = await plcWithIo(counterProgram());
    const snapI = plc.snapshot();
    expect(() => { plc.restore({ ...snapI, memI: [] }); }).toThrow(/memI sai độ dài/);
    const snapQ = plc.snapshot();
    expect(() => { plc.restore({ ...snapQ, memQ: [] }); }).toThrow(/memQ sai độ dài/);
  });

  it('dbs: sai số lượng / tên không tồn tại / bytes sai độ dài → throw', async () => {
    const { plc } = await plcWithIo(dbProgram());
    const snap = plc.snapshot();
    expect(snap.dbs).toHaveLength(1);
    expect(() => { plc.restore({ ...snap, dbs: [] }); }).toThrow(/dbs/);
    expect(() => { plc.restore({ ...snap, dbs: [{ name: 'NOPE', bytes: [] }] }); }).toThrow(
      /không tồn tại/,
    );
    const dbName = snap.dbs[0]?.name as string;
    expect(() => { plc.restore({ ...snap, dbs: [{ name: dbName, bytes: [0] }] }); }).toThrow(
      /sai độ dài/,
    );
  });

  it('cyclic: sai số lượng / OB không tồn tại → throw', async () => {
    const { plc } = await plcWithIo(cyclicProgram());
    const snap = plc.snapshot();
    expect(snap.cyclic).toHaveLength(1);
    expect(() => { plc.restore({ ...snap, cyclic: [] }); }).toThrow(/cyclic/);
    expect(() => { plc.restore({ ...snap, cyclic: [{ ob: 99, lastIdx: 0 }] }); }).toThrow(
      /không tồn tại/,
    );
  });

  it('forces: không phải mảng / thiếu ref / giá trị sai kiểu → throw', async () => {
    const { plc } = await plcWithIo(counterProgram());
    const snap = plc.snapshot();
    expect(() => { plc.restore({ ...snap, forces: 'x' }); }).toThrow(/forces phải là mảng/);
    expect(() => { plc.restore({ ...snap, forces: [{ value: true }] }); }).toThrow(/thiếu ref/);
    expect(() => { plc.restore({ ...snap, forces: [{ ref: '%MW0', value: 'x' }] }); },
    ).toThrow(/TAG-E001/);
  });

  it('faults: không phải mảng / fault sai hình → throw', async () => {
    const { plc } = await plcWithIo(counterProgram());
    const snap = plc.snapshot();
    expect(() => { plc.restore({ ...snap, faults: 'x' }); }).toThrow(/faults phải là mảng/);
    expect(() => { plc.restore({
        ...snap,
        faults: [{ code: 'NOPE', message: 'x', count: 1, simTimeMs: 0 }],
      }); },
    ).toThrow(/sai hình/);
  });

  it('restore snapshot có cyclic: lastIdx cyclic được khôi phục', async () => {
    const { plc } = await plcWithIo(cyclicProgram());
    plc.start();
    runSteps(plc, 12); // T=10..120: cyclic (100 ms) chạy 1 lần tại T=100.
    expect(plc.read('%MW2')).toBe(1);
    expect(plc.read('%MW0')).toBe(12);
    const snap = plc.snapshot();
    expect(snap.cyclic).toEqual([{ ob: 30, lastIdx: 1 }]);
    runSteps(plc, 3, 10, 120); // T=130..150, chưa tới kỳ cyclic tiếp (T=200).
    expect(plc.read('%MW0')).toBe(15);
    plc.restore(snap);
    expect(plc.read('%MW0')).toBe(12);
    expect(plc.read('%MW2')).toBe(1);
    expect(plc.snapshot().cyclic).toEqual([{ ob: 30, lastIdx: 1 }]);
    runSteps(plc, 3, 10, 120);
    expect(plc.read('%MW0')).toBe(15);
    expect(plc.read('%MW2')).toBe(1);
  });
});
