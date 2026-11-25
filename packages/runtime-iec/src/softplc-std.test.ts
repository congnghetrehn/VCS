// Golden scan std block qua SoftPlc + IR tay (bảng A–P, STATE §20).
// expectedFrom: 'spec' (OQ-174) — mọi kỳ vọng tính tay từ bảng, không sao
// chép từ implementation. Quy ước: scan tại t = period, 2·period, … (OQ-130);
// input đặt qua TagDB/`write` trước step tạo ra scan đó; output đọc sau scan.
// Lệch bảng N (ghi ở STATE §20): giữa hàng t=50 và t=60 cần một scan trung
// gian CD=false để CD có cạnh lên ở "cả hai cùng cạnh" — test N1 chèn scan
// trung gian đó (hàng "cả hai cùng cạnh" thành t=70); logic ghim không đổi.

import * as fc from 'fast-check';
import type { TagValue } from '@vcs/schemas';
import { describe, expect, it } from 'vitest';
import type { IrDb, IrStmt } from './ir.js';
import {
  abs,
  assign,
  callSysStmt,
  dbField,
  ifStmt,
  load,
  makePlc,
  num,
  obBlock,
  prog,
  stdDb,
} from './ir-testkit.js';
import { createStdSysCalls } from './std/handlers.js';
import { getStdBlockDef } from './std/defs.js';
import { DbStore } from './memory.js';
import { readMemValue, type DbView } from './interpreter.js';
import type { SoftPlc } from './softplc.js';

function mkPlc(stmts: IrStmt[], dbs: IrDb[], period: number): SoftPlc {
  const plc = makePlc(
    prog([obBlock('Main', 1, stmts)], dbs, [{ ob: 1, block: 'Main' }]),
    { scanPeriodMs: period },
  );
  plc.start();
  return plc;
}

/** Chạy n scan; mỗi scan đặt input trước rồi step; trả trace đọc sau scan. */
function runProg(
  stmts: IrStmt[],
  dbs: IrDb[],
  period: number,
  n: number,
  setInputs: (plc: SoftPlc, i: number, t: number) => void,
  readOuts: (plc: SoftPlc) => TagValue[],
): TagValue[][] {
  const plc = mkPlc(stmts, dbs, period);
  const trace: TagValue[][] = [];
  for (let i = 0; i < n; i++) {
    setInputs(plc, i, (i + 1) * period);
    plc.step(i * period, period);
    trace.push(readOuts(plc));
  }
  return trace;
}

function mBit(byte: number, bit: number): Parameters<typeof load>[0] {
  return abs('M', byte, 'Bool', bit);
}

function timerCall(timer: string, ptMs: number, extra: [string, ReturnType<typeof load>][] = []): IrStmt {
  return callSysStmt(
    timer,
    [
      ['IN', load(mBit(0, 0), 'Bool')],
      ...extra,
      ['PT', num(ptMs, 'Time')],
    ],
    [],
    dbField('T1', []),
  );
}

function timerOuts(plc: SoftPlc): [number, boolean] {
  return [plc.read('"T1".ET') as number, plc.read('"T1".Q') as boolean];
}

function edgeCall(block: string, clkRef: ReturnType<typeof abs>): IrStmt {
  return callSysStmt(block, [['CLK', load(clkRef, 'Bool')]], [], dbField('T1', []));
}

// ---------------------------------------------------------- edge / bistable

describe('golden scan — R_TRIG / F_TRIG (bảng J)', () => {
  it('J1 R_TRIG pattern — expectedFrom: spec', () => {
    const trace = runProg(
      [edgeCall('R_TRIG', mBit(0, 0))],
      [stdDb('T1', 'R_TRIG')],
      10,
      7,
      (plc, i) => { plc.write('%M0.0', [false, false, true, true, false, true, false][i] as boolean); },
      (plc) => [plc.read('"T1".Q')],
    );
    expect(trace).toEqual([[false], [false], [true], [false], [false], [true], [false]]);
  });

  it('J2 F_TRIG pattern — expectedFrom: spec', () => {
    const trace = runProg(
      [edgeCall('F_TRIG', mBit(0, 0))],
      [stdDb('T1', 'F_TRIG')],
      10,
      7,
      (plc, i) => { plc.write('%M0.0', [false, false, true, true, false, true, false][i] as boolean); },
      (plc) => [plc.read('"T1".Q')],
    );
    expect(trace).toEqual([[false], [false], [false], [false], [true], [false], [true]]);
  });

  it('J3 R_TRIG scan đầu sau load, CLK=true → Q=true — expectedFrom: spec', () => {
    const plc = mkPlc([edgeCall('R_TRIG', mBit(0, 0))], [stdDb('T1', 'R_TRIG')], 10);
    plc.write('%M0.0', true);
    plc.step(0, 10);
    expect(plc.read('"T1".Q')).toBe(true);
  });

  it('J4 F_TRIG scan đầu sau load, CLK=true → Q=false — expectedFrom: spec', () => {
    const plc = mkPlc([edgeCall('F_TRIG', mBit(0, 0))], [stdDb('T1', 'F_TRIG')], 10);
    plc.write('%M0.0', true);
    plc.step(0, 10);
    expect(plc.read('"T1".Q')).toBe(false);
  });

  it('J5 R_TRIG STOP→RUN giữ _m: CLK=true → Q=false (OQ-164) — expectedFrom: spec', () => {
    const plc = mkPlc([edgeCall('R_TRIG', mBit(0, 0))], [stdDb('T1', 'R_TRIG')], 10);
    plc.write('%M0.0', true);
    plc.step(0, 10);
    expect(plc.read('"T1".Q')).toBe(true);
    plc.stop();
    plc.start();
    plc.write('%M0.0', true);
    plc.step(0, 10);
    expect(plc.read('"T1".Q')).toBe(false);
  });
});

describe('golden scan — SR / RS (bảng K)', () => {
  it('K1 SR — expectedFrom: spec', () => {
    const rows: [boolean, boolean, boolean][] = [
      [false, false, false],
      [true, false, true],
      [false, false, true],
      [false, true, false],
      [true, true, true],
      [false, true, false],
    ];
    const trace = runProg(
      [
        callSysStmt(
          'SR',
          [
            ['S1', load(mBit(0, 0), 'Bool')],
            ['R', load(mBit(0, 1), 'Bool')],
          ],
          [],
          dbField('T1', []),
        ),
      ],
      [stdDb('T1', 'SR')],
      10,
      rows.length,
      (plc, i) => {
        plc.write('%M0.0', (rows[i] as [boolean, boolean, boolean])[0]);
        plc.write('%M0.1', (rows[i] as [boolean, boolean, boolean])[1]);
      },
      (plc) => [plc.read('"T1".Q1')],
    );
    expect(trace).toEqual(rows.map((r) => [r[2]]));
  });

  it('K2 RS — expectedFrom: spec', () => {
    const rows: [boolean, boolean, boolean][] = [
      [false, false, false],
      [true, false, true],
      [false, false, true],
      [false, true, false],
      [true, true, false],
      [true, false, true],
    ];
    const trace = runProg(
      [
        callSysStmt(
          'RS',
          [
            ['S', load(mBit(0, 0), 'Bool')],
            ['R1', load(mBit(0, 1), 'Bool')],
          ],
          [],
          dbField('T1', []),
        ),
      ],
      [stdDb('T1', 'RS')],
      10,
      rows.length,
      (plc, i) => {
        plc.write('%M0.0', (rows[i] as [boolean, boolean, boolean])[0]);
        plc.write('%M0.1', (rows[i] as [boolean, boolean, boolean])[1]);
      },
      (plc) => [plc.read('"T1".Q1')],
    );
    expect(trace).toEqual(rows.map((r) => [r[2]]));
  });

  it('K3 SR + RS cùng scan, (S=1,R=1) → SR Q1=1, RS Q1=0 — expectedFrom: spec', () => {
    const plc = mkPlc(
      [
        callSysStmt(
          'SR',
          [
            ['S1', load(mBit(0, 0), 'Bool')],
            ['R', load(mBit(0, 1), 'Bool')],
          ],
          [],
          dbField('S1', []),
        ),
        callSysStmt(
          'RS',
          [
            ['S', load(mBit(0, 0), 'Bool')],
            ['R1', load(mBit(0, 1), 'Bool')],
          ],
          [],
          dbField('R1', []),
        ),
      ],
      [stdDb('S1', 'SR'), stdDb('R1', 'RS')],
      10,
    );
    plc.write('%M0.0', true);
    plc.write('%M0.1', true);
    plc.step(0, 10);
    expect(plc.read('"S1".Q1')).toBe(true);
    expect(plc.read('"R1".Q1')).toBe(false);
  });
});

// ---------------------------------------------------------- timer

describe('golden scan — TON (bảng A–D)', () => {
  it('A1 TON 3s — expectedFrom: spec', () => {
    const trace = runProg(
      [timerCall('TON', 3000)],
      [stdDb('T1', 'TON')],
      100,
      34,
      (plc, i) => { plc.write('%M0.0', i >= 1 && i <= 32); },
      timerOuts,
    );
    expect(trace[0]).toEqual([0, false]);
    expect(trace[1]).toEqual([0, false]);
    expect(trace[2]).toEqual([100, false]);
    expect(trace[10]).toEqual([900, false]);
    expect(trace[30]).toEqual([2900, false]);
    expect(trace[31]).toEqual([3000, true]);
    expect(trace[32]).toEqual([3000, true]);
    expect(trace[33]).toEqual([0, false]);
  });

  it('B1 TON PT=0: Q=IN ngay, ET=0 — expectedFrom: spec', () => {
    const trace = runProg(
      [timerCall('TON', 0)],
      [stdDb('T1', 'TON')],
      100,
      4,
      (plc, i) => { plc.write('%M0.0', i === 1 || i === 2); },
      timerOuts,
    );
    expect(trace).toEqual([
      [0, false],
      [0, true],
      [0, true],
      [0, false],
    ]);
  });

  it('B2 TON PT=50: Q lật ở scan đầu elapsed ≥ PT, ET kẹp 50 — expectedFrom: spec', () => {
    const trace = runProg(
      [timerCall('TON', 50)],
      [stdDb('T1', 'TON')],
      100,
      3,
      (plc, i) => { plc.write('%M0.0', i >= 1); },
      timerOuts,
    );
    expect(trace).toEqual([
      [0, false],
      [0, false],
      [50, true],
    ]);
  });

  it('B3 TON PT=250: ET 0→100→200→250, Q lên ở elapsed=300 — expectedFrom: spec', () => {
    const trace = runProg(
      [timerCall('TON', 250)],
      [stdDb('T1', 'TON')],
      100,
      5,
      (plc, i) => { plc.write('%M0.0', i >= 1); },
      timerOuts,
    );
    expect(trace).toEqual([
      [0, false],
      [0, false],
      [100, false],
      [200, false],
      [250, true],
    ]);
  });

  it('C1 TON IN dao động PT=1000: xuống → reset, đếm lại — expectedFrom: spec', () => {
    const trace = runProg(
      [timerCall('TON', 1000)],
      [stdDb('T1', 'TON')],
      100,
      17,
      (plc, i) => { plc.write('%M0.0', (i >= 1 && i <= 3) || i >= 6); },
      timerOuts,
    );
    expect(trace[1]).toEqual([0, false]);
    expect(trace[3]).toEqual([200, false]);
    expect(trace[4]).toEqual([0, false]);
    expect(trace[6]).toEqual([0, false]);
    expect(trace[15]).toEqual([900, false]);
    expect(trace[16]).toEqual([1000, true]);
  });

  it('D1 TON không được gọi vài scan: ET "nhảy" theo timestamp (OQ-169) — expectedFrom: spec', () => {
    const call = timerCall('TON', 2000);
    const stmts: IrStmt[] = [
      ifStmt(load(mBit(0, 1), 'Bool'), [call]),
      assign(mBit(1, 0), load(dbField('T1', ['Q']), 'Bool')),
    ];
    const trace = runProg(
      stmts,
      [stdDb('T1', 'TON')],
      100,
      22,
      (plc, i) => {
        plc.write('%M0.0', i >= 1);
        plc.write('%M0.1', i <= 1 || i >= 15);
      },
      timerOuts,
    );
    expect(trace[1]).toEqual([0, false]);
    for (let i = 2; i <= 14; i++) expect(trace[i]).toEqual([0, false]);
    expect(trace[15]).toEqual([1400, false]);
    expect(trace[21]).toEqual([2000, true]);
  });
});

describe('golden scan — TOF (bảng E–F)', () => {
  it('E1 TOF cơ bản PT=2000 — expectedFrom: spec', () => {
    const trace = runProg(
      [timerCall('TOF', 2000)],
      [stdDb('T1', 'TOF')],
      100,
      30,
      (plc, i) => { plc.write('%M0.0', i <= 3 || i === 29); },
      timerOuts,
    );
    expect(trace[0]).toEqual([0, true]);
    expect(trace[4]).toEqual([0, true]);
    expect(trace[14]).toEqual([1000, true]);
    expect(trace[23]).toEqual([1900, true]);
    expect(trace[24]).toEqual([2000, false]);
    expect(trace[25]).toEqual([2000, false]);
    expect(trace[29]).toEqual([0, true]);
  });

  it('E2 TOF PT=0: cạnh xuống → Q=false ngay — expectedFrom: spec', () => {
    const trace = runProg(
      [timerCall('TOF', 0)],
      [stdDb('T1', 'TOF')],
      100,
      2,
      (plc, i) => { plc.write('%M0.0', i === 0); },
      timerOuts,
    );
    expect(trace).toEqual([
      [0, true],
      [0, false],
    ]);
  });

  it('F1 TOF retrigger: IN lên giữa chừng hủy đếm — expectedFrom: spec', () => {
    const trace = runProg(
      [timerCall('TOF', 2000)],
      [stdDb('T1', 'TOF')],
      100,
      40,
      (plc, i) => { plc.write('%M0.0', i <= 3 || (i >= 14 && i <= 18)); },
      timerOuts,
    );
    expect(trace[4]).toEqual([0, true]);
    expect(trace[13]).toEqual([900, true]);
    expect(trace[14]).toEqual([0, true]);
    expect(trace[19]).toEqual([0, true]);
    expect(trace[39]).toEqual([2000, false]);
  });
});

describe('golden scan — TP (bảng G–H)', () => {
  it('G1 TP cơ bản PT=1000: xung hết + IN true → ET giữ PT, không kích lại — expectedFrom: spec', () => {
    const trace = runProg(
      [timerCall('TP', 1000)],
      [stdDb('T1', 'TP')],
      100,
      26,
      (plc, i) => { plc.write('%M0.0', (i >= 1 && i <= 13) || i >= 15); },
      timerOuts,
    );
    expect(trace[1]).toEqual([0, true]);
    expect(trace[10]).toEqual([900, true]);
    expect(trace[11]).toEqual([1000, false]);
    expect(trace[12]).toEqual([1000, false]);
    expect(trace[14]).toEqual([0, false]);
    expect(trace[15]).toEqual([0, true]);
    expect(trace[25]).toEqual([1000, false]);
  });

  it('G2 TP PT=0: xung độ dài 0, Q không bao giờ lên — expectedFrom: spec', () => {
    const trace = runProg(
      [timerCall('TP', 0)],
      [stdDb('T1', 'TP')],
      100,
      4,
      (plc, i) => { plc.write('%M0.0', i === 1 || i === 3); },
      timerOuts,
    );
    expect(trace).toEqual([
      [0, false],
      [0, false],
      [0, false],
      [0, false],
    ]);
  });

  it('H1 TP cạnh lên trong xung bị bỏ qua, xung kết thúc đúng t=1200 — expectedFrom: spec', () => {
    const trace = runProg(
      [timerCall('TP', 1000)],
      [stdDb('T1', 'TP')],
      100,
      12,
      (plc, i) => { plc.write('%M0.0', i === 1 || i === 2 || i >= 5); },
      timerOuts,
    );
    expect(trace[1]).toEqual([0, true]);
    expect(trace[3]).toEqual([200, true]);
    expect(trace[5]).toEqual([400, true]);
    expect(trace[11]).toEqual([1000, false]);
  });

  it('H2 TP xung kết thúc + IN false → ET=0 ngay — expectedFrom: spec', () => {
    const trace = runProg(
      [timerCall('TP', 1000)],
      [stdDb('T1', 'TP')],
      100,
      12,
      (plc, i) => { plc.write('%M0.0', i === 1 || i === 2); },
      timerOuts,
    );
    expect(trace[1]).toEqual([0, true]);
    expect(trace[3]).toEqual([200, true]);
    expect(trace[11]).toEqual([0, false]);
  });
});

describe('golden scan — TONR (bảng I)', () => {
  function tonrCall(): IrStmt {
    return callSysStmt(
      'TONR',
      [
        ['IN', load(mBit(0, 0), 'Bool')],
        ['R', load(mBit(0, 1), 'Bool')],
        ['PT', num(1000, 'Time')],
      ],
      [],
      dbField('T1', []),
    );
  }

  it('I1 TONR tích lũy qua IN xuống/lên, R thắng IN — expectedFrom: spec', () => {
    const trace = runProg(
      [tonrCall()],
      [stdDb('T1', 'TONR')],
      100,
      21,
      (plc, i) => {
        plc.write('%M0.0', (i >= 1 && i <= 5) || i >= 11);
        plc.write('%M0.1', i === 19);
      },
      timerOuts,
    );
    expect(trace[1]).toEqual([0, false]);
    expect(trace[5]).toEqual([400, false]);
    expect(trace[6]).toEqual([500, false]);
    expect(trace[11]).toEqual([500, false]);
    expect(trace[16]).toEqual([1000, true]);
    expect(trace[19]).toEqual([0, false]);
    expect(trace[20]).toEqual([0, false]);
  });

  it('I2 TONR R reset: R+T cùng scan → 0; chạy lại từ 0 — expectedFrom: spec', () => {
    const trace = runProg(
      [tonrCall()],
      [stdDb('T1', 'TONR')],
      100,
      7,
      (plc, i) => {
        plc.write('%M0.0', true);
        plc.write('%M0.1', i === 0 || i === 6);
      },
      timerOuts,
    );
    expect(trace[0]).toEqual([0, false]);
    expect(trace[1]).toEqual([0, false]);
    expect(trace[5]).toEqual([400, false]);
    expect(trace[6]).toEqual([0, false]);
  });

  it('I3 TONR PT=0: Q=IN, ET=0 — expectedFrom: spec', () => {
    const trace = runProg(
      [
        callSysStmt(
          'TONR',
          [
            ['IN', load(mBit(0, 0), 'Bool')],
            ['PT', num(0, 'Time')],
          ],
          [],
          dbField('T1', []),
        ),
      ],
      [stdDb('T1', 'TONR')],
      100,
      3,
      (plc, i) => { plc.write('%M0.0', i !== 1); },
      timerOuts,
    );
    expect(trace).toEqual([
      [0, true],
      [0, false],
      [0, true],
    ]);
  });
});

// ---------------------------------------------------------- counter

describe('golden scan — CTU (bảng L)', () => {
  function ctuCall(pv: number): IrStmt {
    return callSysStmt(
      'CTU',
      [
        ['CU', load(mBit(0, 0), 'Bool')],
        ['R', load(mBit(0, 1), 'Bool')],
        ['PV', num(pv, 'Int')],
      ],
      [],
      dbField('C1', []),
    );
  }

  function ctuOuts(plc: SoftPlc): [number, boolean] {
    return [plc.read('"C1".CV') as number, plc.read('"C1".QU') as boolean];
  }

  it('L1 CTU đếm + QU, CU giữ không đếm, R thắng đếm — expectedFrom: spec', () => {
    const cu = [false, true, false, true, true, false, true, false, true, true, false, true];
    const trace = runProg(
      [ctuCall(3)],
      [stdDb('C1', 'CTU')],
      10,
      12,
      (plc, i) => {
        plc.write('%M0.0', cu[i] ?? false);
        plc.write('%M0.1', i === 8);
      },
      ctuOuts,
    );
    expect(trace[0]).toEqual([0, false]);
    expect(trace[1]).toEqual([1, false]);
    expect(trace[3]).toEqual([2, false]);
    expect(trace[4]).toEqual([2, false]);
    expect(trace[6]).toEqual([3, true]);
    expect(trace[8]).toEqual([0, false]);
    expect(trace[9]).toEqual([0, false]);
    expect(trace[11]).toEqual([1, false]);
  });

  it('L2 CTU R thắng đếm cùng scan, đếm lại sau khi CU xuống/lên — expectedFrom: spec', () => {
    const plc = mkPlc([ctuCall(3)], [stdDb('C1', 'CTU')], 10);
    plc.write('"C1".CV', 2);
    plc.write('%M0.0', true);
    plc.write('%M0.1', true);
    plc.step(0, 10);
    expect(ctuOuts(plc)).toEqual([0, false]);
    plc.write('%M0.1', false);
    plc.step(10, 10);
    expect(ctuOuts(plc)).toEqual([0, false]);
    plc.write('%M0.0', false);
    plc.step(20, 10);
    expect(ctuOuts(plc)).toEqual([0, false]);
    plc.write('%M0.0', true);
    plc.step(30, 10);
    expect(ctuOuts(plc)).toEqual([1, false]);
  });

  it('L3 CTU kẹp max: CV=32767 + cạnh lên → giữ 32767 — expectedFrom: spec', () => {
    const plc = mkPlc([ctuCall(3)], [stdDb('C1', 'CTU')], 10);
    plc.write('"C1".CV', 32767);
    plc.write('%M0.0', true);
    plc.step(0, 10);
    expect(ctuOuts(plc)).toEqual([32767, true]);
    plc.write('%M0.1', true);
    plc.step(10, 10);
    expect(ctuOuts(plc)).toEqual([0, false]);
  });
});

describe('golden scan — CTD (bảng M)', () => {
  function ctdCall(pv: number): IrStmt {
    return callSysStmt(
      'CTD',
      [
        ['CD', load(mBit(0, 0), 'Bool')],
        ['LD', load(mBit(0, 1), 'Bool')],
        ['PV', num(pv, 'Int')],
      ],
      [],
      dbField('C1', []),
    );
  }

  function ctdOuts(plc: SoftPlc): [number, boolean] {
    return [plc.read('"C1".CV') as number, plc.read('"C1".QD') as boolean];
  }

  it('M1 CTD LD + đếm xuống + QD, LD thắng đếm — expectedFrom: spec', () => {
    const cd = [false, false, false, true, false, false, true, false, true, false, true];
    const ld = [false, true, false, false, false, false, false, false, false, true, true];
    const trace = runProg(
      [ctdCall(3)],
      [stdDb('C1', 'CTD')],
      10,
      11,
      (plc, i) => {
        plc.write('%M0.0', cd[i] ?? false);
        plc.write('%M0.1', ld[i] ?? false);
      },
      ctdOuts,
    );
    expect(trace[0]).toEqual([0, true]);
    expect(trace[1]).toEqual([3, false]);
    expect(trace[3]).toEqual([2, false]);
    expect(trace[6]).toEqual([1, false]);
    expect(trace[8]).toEqual([0, true]);
    expect(trace[9]).toEqual([3, false]);
    expect(trace[10]).toEqual([3, false]);
  });

  it('M2 CTD LD thắng đếm cùng scan — expectedFrom: spec', () => {
    const plc = mkPlc([ctdCall(3)], [stdDb('C1', 'CTD')], 10);
    plc.write('%M0.1', true);
    plc.step(0, 10);
    expect(ctdOuts(plc)).toEqual([3, false]);
    plc.write('%M0.1', false);
    plc.write('%M0.0', true);
    plc.step(10, 10);
    expect(ctdOuts(plc)).toEqual([2, false]);
    plc.write('%M0.0', false);
    plc.step(20, 10);
    plc.write('%M0.0', true);
    plc.write('%M0.1', true);
    plc.step(30, 10);
    expect(ctdOuts(plc)).toEqual([3, false]);
  });

  it('M3 CTD kẹp min: CV=−32768 + cạnh lên → giữ −32768 — expectedFrom: spec', () => {
    const plc = mkPlc([ctdCall(3)], [stdDb('C1', 'CTD')], 10);
    plc.write('"C1".CV', -32768);
    plc.write('%M0.0', true);
    plc.step(0, 10);
    expect(ctdOuts(plc)).toEqual([-32768, true]);
  });
});

describe('golden scan — CTUD (bảng N)', () => {
  function ctudCall(pv: number): IrStmt {
    return callSysStmt(
      'CTUD',
      [
        ['CU', load(mBit(0, 0), 'Bool')],
        ['CD', load(mBit(0, 1), 'Bool')],
        ['R', load(mBit(0, 2), 'Bool')],
        ['LD', load(mBit(0, 3), 'Bool')],
        ['PV', num(pv, 'Int')],
      ],
      [],
      dbField('C1', []),
    );
  }

  function ctudOuts(plc: SoftPlc): [number, boolean, boolean] {
    return [
      plc.read('"C1".CV') as number,
      plc.read('"C1".QU') as boolean,
      plc.read('"C1".QD') as boolean,
    ];
  }

  it('N1 CTUD đếm lên/xuống, hai cạnh cùng lúc → giữ, R > LD — expectedFrom: spec', () => {
    // Mỗi hàng = [CU, CD, R, LD]; hàng "cả hai cùng cạnh" ở index 6 (t=70)
    // sau một scan trung gian index 5 (CD xuống) — xem ghi chú đầu file.
    const rows: [boolean, boolean, boolean, boolean][] = [
      [false, false, false, false],
      [false, false, false, true],
      [true, false, false, false],
      [false, false, false, false],
      [false, true, false, false],
      [false, false, false, false],
      [true, true, false, false],
      [false, false, false, false],
      [true, false, true, false],
      [false, false, true, true],
      [false, false, false, true],
      [true, false, false, false],
    ];
    const expected: [number, boolean, boolean][] = [
      [0, false, true],
      [5, true, false],
      [6, true, false],
      [6, true, false],
      [5, true, false],
      [5, true, false],
      [5, true, false],
      [5, true, false],
      [0, false, true],
      [0, false, true],
      [5, true, false],
      [6, true, false],
    ];
    const trace = runProg(
      [ctudCall(5)],
      [stdDb('C1', 'CTUD')],
      10,
      rows.length,
      (plc, i) => {
        const r = rows[i] as [boolean, boolean, boolean, boolean];
        plc.write('%M0.0', r[0]);
        plc.write('%M0.1', r[1]);
        plc.write('%M0.2', r[2]);
        plc.write('%M0.3', r[3]);
      },
      ctudOuts,
    );
    expect(trace).toEqual(expected);
  });

  it('N2 CTUD hai cạnh cùng lúc → giữ nguyên (tách riêng) — expectedFrom: spec', () => {
    const plc = mkPlc([ctudCall(5)], [stdDb('C1', 'CTUD')], 10);
    plc.write('"C1".CV', 5);
    plc.write('%M0.0', true);
    plc.write('%M0.1', true);
    plc.step(0, 10);
    expect(ctudOuts(plc)).toEqual([5, true, false]);
    plc.write('%M0.0', false);
    plc.write('%M0.1', false);
    plc.step(10, 10);
    plc.write('%M0.0', true);
    plc.step(20, 10);
    expect(ctudOuts(plc)).toEqual([6, true, false]);
    plc.write('%M0.0', false);
    plc.step(30, 10);
    plc.write('%M0.1', true);
    plc.step(40, 10);
    expect(ctudOuts(plc)).toEqual([5, true, false]);
  });

  it('N3 CTUD R > LD — expectedFrom: spec', () => {
    const plc = mkPlc([ctudCall(5)], [stdDb('C1', 'CTUD')], 10);
    plc.write('"C1".CV', 3);
    plc.write('%M0.2', true);
    plc.write('%M0.3', true);
    plc.step(0, 10);
    expect(ctudOuts(plc)).toEqual([0, false, true]);
    plc.write('%M0.2', false);
    plc.step(10, 10);
    expect(ctudOuts(plc)).toEqual([5, true, false]);
  });

  it('N4 CTUD PV=0: CV=0 → QU và QD cùng true — expectedFrom: spec', () => {
    const plc = mkPlc([ctudCall(0)], [stdDb('C1', 'CTUD')], 10);
    plc.step(0, 10);
    expect(ctudOuts(plc)).toEqual([0, true, true]);
    plc.write('%M0.0', true);
    plc.step(10, 10);
    expect(ctudOuts(plc)).toEqual([1, true, false]);
  });
});

// ---------------------------------------------------------- property

describe('std property (fast-check, seed cố định)', () => {
  const SYS = createStdSysCalls();

  function handlerView(block: string): { view: DbView; store: DbStore } {
    const def = getStdBlockDef(block);
    if (def === undefined) throw new Error(`thiếu def '${block}'`);
    const store = new DbStore(1, def.size);
    return { view: { store, fields: def.layout, base: 0 }, store };
  }

  it('TON ⇔ IN liên tục ≥ PT (M1 §12.3) — expectedFrom: spec', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ dt: fc.constantFrom(10, 50, 100), inVal: fc.boolean() }),
          { minLength: 5, maxLength: 40 },
        ),
        fc.constantFrom(0, 50, 250, 1000),
        (steps, pt) => {
          const h = SYS.get('TON');
          if (h === undefined) throw new Error('thiếu handler TON');
          const { view, store } = handlerView('TON');
          const fET = getStdBlockDef('TON')?.layout.find((f) => f.name === 'ET');
          const fQ = getStdBlockDef('TON')?.layout.find((f) => f.name === 'Q');
          if (fET === undefined || fQ === undefined) throw new Error('thiếu field TON');
          let now = 0;
          let start: number | null = null;
          for (const s of steps) {
            now += s.dt;
            h(view, new Map<string, TagValue>([['IN', s.inVal], ['PT', pt]]), new Map(), now);
            if (!s.inVal) {
              start = null;
              expect(readMemValue(store, fET.byteOffset, fET)).toBe(0);
              expect(readMemValue(store, fQ.byteOffset, fQ)).toBe(false);
            } else {
              if (start === null) start = now;
              const elapsed = now - start;
              expect(readMemValue(store, fET.byteOffset, fET)).toBe(
                pt <= 0 ? 0 : Math.min(elapsed, pt),
              );
              expect(readMemValue(store, fQ.byteOffset, fQ)).toBe(
                pt <= 0 ? true : elapsed >= pt,
              );
            }
          }
        },
      ),
      { seed: 20261125, numRuns: 100 },
    );
  });

  it('counter: CV luôn trong [min,max] + QU/QD đúng công thức (M1 §12.3) — expectedFrom: spec', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            cu: fc.boolean(),
            cd: fc.boolean(),
            r: fc.boolean(),
            ld: fc.boolean(),
          }),
          { minLength: 5, maxLength: 40 },
        ),
        fc.integer({ min: -5, max: 10 }),
        (steps, pv) => {
          const h = SYS.get('CTUD');
          if (h === undefined) throw new Error('thiếu handler CTUD');
          const { view, store } = handlerView('CTUD');
          const layout = getStdBlockDef('CTUD')?.layout;
          const fCV = layout?.find((f) => f.name === 'CV');
          const fQU = layout?.find((f) => f.name === 'QU');
          const fQD = layout?.find((f) => f.name === 'QD');
          if (fCV === undefined || fQU === undefined || fQD === undefined) {
            throw new Error('thiếu field CTUD');
          }
          let now = 0;
          for (const s of steps) {
            now += 10;
            h(
              view,
              new Map<string, TagValue>([
                ['CU', s.cu],
                ['CD', s.cd],
                ['R', s.r],
                ['LD', s.ld],
                ['PV', pv],
              ]),
              new Map(),
              now,
            );
            const cv = readMemValue(store, fCV.byteOffset, fCV) as number;
            expect(cv).toBeGreaterThanOrEqual(-32768);
            expect(cv).toBeLessThanOrEqual(32767);
            expect(readMemValue(store, fQU.byteOffset, fQU)).toBe(cv >= pv);
            expect(readMemValue(store, fQD.byteOffset, fQD)).toBe(cv <= 0);
          }
        },
      ),
      { seed: 20261125, numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------- snapshot

describe('std snapshot (OQ-180)', () => {
  it('snapshot giữa TON đang chạy: restore → trace giống hệt — expectedFrom: spec', () => {
    const plc = mkPlc([timerCall('TON', 3000)], [stdDb('T1', 'TON')], 100);
    // Chạy tới t=1700 (ET=1500) rồi snapshot.
    for (let i = 0; i < 17; i++) {
      plc.write('%M0.0', i >= 1);
      plc.step(i * 100, 100);
    }
    expect(timerOuts(plc)).toEqual([1500, false]);
    const snap = plc.snapshot();
    const run3 = (): [number, boolean, number][] => {
      const out: [number, boolean, number][] = [];
      for (let k = 0; k < 3; k++) {
        const idx = 17 + k;
        plc.write('%M0.0', true);
        plc.step(idx * 100, 100);
        out.push([...timerOuts(plc), plc.getDiagnostics().scanCount]);
      }
      return out;
    };
    const traceA = run3();
    expect(traceA).toEqual([
      [1600, false, 18],
      [1700, false, 19],
      [1800, false, 20],
    ]);
    plc.restore(snap);
    const traceB = run3();
    expect(traceB).toEqual(traceA);
  });
});
