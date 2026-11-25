// Pipeline SCL → IR → SoftPlc cho std block (P1.5, STATE §20, test P-S1…P-S8).
// expectedFrom: 'spec' (OQ-174). Mỗi test compile SCL thật rồi chạy SoftPlc.

import { SoftPlc } from '@vcs/runtime-iec';
import { describe, expect, it } from 'vitest';
import { compileSclProgram } from './compile.js';

function compileOk(src: string, period: number): SoftPlc {
  const { program, diagnostics } = compileSclProgram(src, 'T.scl');
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const plc = new SoftPlc(program, new Map(), { id: 'PLC1', scanPeriodMs: period });
  plc.start();
  return plc;
}

/** Một scan: đặt input rồi step; `now` lấy từ scanCount (mẫu softplc.test.ts). */
function scan(plc: SoftPlc, period: number, setInputs: () => void): void {
  setInputs();
  plc.step(plc.getDiagnostics().scanCount * period, period);
}

describe('pipeline std — timer qua SCL (P-S1…P-S3)', () => {
  it('P-S1 TON qua "T1"(...) + %Q0.0 := "T1".Q — expectedFrom: spec', () => {
    const plc = compileOk(
      `DATA_BLOCK "T1" "TON"
BEGIN
END_DATA_BLOCK
ORGANIZATION_BLOCK "Main"
BEGIN
  "T1"(IN := %I0.0, PT := T#1s);
  %Q0.0 := "T1".Q;
END_ORGANIZATION_BLOCK`,
      100,
    );
    for (let i = 0; i < 12; i++) {
      scan(plc, 100, () => { plc.write('%I0.0', i >= 1); });
      if (i === 10) {
        expect(plc.read('%Q0.0')).toBe(false);
        expect(plc.read('"T1".ET')).toBe(900);
      }
      if (i === 11) {
        expect(plc.read('%Q0.0')).toBe(true);
        expect(plc.read('"T1".ET')).toBe(1000);
      }
    }
  });

  it('P-S2 TOF qua "T1"(...) — expectedFrom: spec', () => {
    const plc = compileOk(
      `DATA_BLOCK "T1" "TOF"
BEGIN
END_DATA_BLOCK
ORGANIZATION_BLOCK "Main"
BEGIN
  "T1"(IN := %I0.0, PT := T#2s);
  %Q0.0 := "T1".Q;
END_ORGANIZATION_BLOCK`,
      100,
    );
    for (let i = 0; i < 26; i++) {
      scan(plc, 100, () => { plc.write('%I0.0', i <= 3); });
      if (i === 23) {
        expect(plc.read('%Q0.0')).toBe(true);
        expect(plc.read('"T1".ET')).toBe(1900);
      }
      if (i === 24) {
        expect(plc.read('%Q0.0')).toBe(false);
        expect(plc.read('"T1".ET')).toBe(2000);
      }
    }
  });

  it('P-S3 TP qua "T1"(...) — expectedFrom: spec', () => {
    const plc = compileOk(
      `DATA_BLOCK "T1" "TP"
BEGIN
END_DATA_BLOCK
ORGANIZATION_BLOCK "Main"
BEGIN
  "T1"(IN := %I0.0, PT := T#1s);
  %Q0.0 := "T1".Q;
END_ORGANIZATION_BLOCK`,
      100,
    );
    for (let i = 0; i < 12; i++) {
      scan(plc, 100, () => { plc.write('%I0.0', i === 1 || i === 2); });
      if (i === 10) {
        expect(plc.read('%Q0.0')).toBe(true);
        expect(plc.read('"T1".ET')).toBe(900);
      }
      if (i === 11) {
        expect(plc.read('%Q0.0')).toBe(false);
        expect(plc.read('"T1".ET')).toBe(0);
      }
    }
  });
});

describe('pipeline std — counter / edge / bistable qua SCL (P-S4…P-S6)', () => {
  it('P-S4 CTU qua "C1"(...) + QU ra %Q0.0 — expectedFrom: spec', () => {
    const plc = compileOk(
      `DATA_BLOCK "C1" "CTU"
BEGIN
END_DATA_BLOCK
ORGANIZATION_BLOCK "Main"
BEGIN
  "C1"(CU := %I0.0, R := %I0.1, PV := 3);
  %Q0.0 := "C1".QU;
END_ORGANIZATION_BLOCK`,
      10,
    );
    const cu = [false, true, false, true, true, false, true, false];
    for (let i = 0; i < cu.length; i++) {
      scan(plc, 10, () => {
        plc.write('%I0.0', cu[i] ?? false);
        plc.write('%I0.1', i === 7);
      });
      if (i === 6) {
        expect(plc.read('"C1".CV')).toBe(3);
        expect(plc.read('%Q0.0')).toBe(true);
      }
      if (i === 7) {
        expect(plc.read('"C1".CV')).toBe(0);
        expect(plc.read('%Q0.0')).toBe(false);
      }
    }
  });

  it('P-S5 R_TRIG + SR: "E1".Q làm input cho "S1" — expectedFrom: spec', () => {
    const plc = compileOk(
      `DATA_BLOCK "E1" "R_TRIG"
BEGIN
END_DATA_BLOCK
DATA_BLOCK "S1" "SR"
BEGIN
END_DATA_BLOCK
ORGANIZATION_BLOCK "Main"
BEGIN
  "E1"(CLK := %I0.0);
  "S1"(S1 := "E1".Q, R := %I0.1);
  %Q0.0 := "S1".Q1;
END_ORGANIZATION_BLOCK`,
      10,
    );
    const rows: [boolean, boolean, boolean][] = [
      [false, false, false],
      [true, false, true],
      [true, false, true],
      [false, true, false],
    ];
    rows.forEach(([clk, rst, expected], i) => {
      scan(plc, 10, () => {
        plc.write('%I0.0', clk);
        plc.write('%I0.1', rst);
      });
      expect(plc.read('%Q0.0'), `scan ${String(i)}`).toBe(expected);
    });
  });

  it('P-S6 TONR + CTD: "T1".Q làm CD, LD preset, Q giữ khi IN xuống — expectedFrom: spec', () => {
    // M1 §9.3 TONR: IN false → ET=_accum, Q = ET ≥ PT (giữ — retentive,
    // khác TON). Sau khi Q đã lên (ET=1000), IN xuống Q vẫn true; chỉ R
    // mới hạ Q. CD đếm lại chỉ sau khi R reset rồi chạy đủ PT lần nữa.
    const plc = compileOk(
      `DATA_BLOCK "T1" "TONR"
BEGIN
END_DATA_BLOCK
DATA_BLOCK "C1" "CTD"
BEGIN
END_DATA_BLOCK
ORGANIZATION_BLOCK "Main"
BEGIN
  "T1"(IN := %I0.0, R := %I0.1, PT := T#1s);
  "C1"(CD := "T1".Q, LD := %I0.2, PV := 2);
  %Q0.0 := "C1".QD;
END_ORGANIZATION_BLOCK`,
      100,
    );
    for (let i = 0; i < 26; i++) {
      scan(plc, 100, () => {
        plc.write('%I0.0', i >= 1 && i !== 13 && i !== 14);
        plc.write('%I0.1', i === 14);
        plc.write('%I0.2', i === 0);
      });
      if (i === 0) {
        expect(plc.read('"C1".CV')).toBe(2);
        expect(plc.read('%Q0.0')).toBe(false);
      }
      if (i === 11) {
        expect(plc.read('"C1".CV')).toBe(1);
        expect(plc.read('%Q0.0')).toBe(false);
      }
      if (i === 13) {
        expect(plc.read('"C1".CV')).toBe(1);
        expect(plc.read('"T1".Q')).toBe(true);
        // ET không kẹp PT (công thức §9.3 ET=_accum+(now−_start)):
        // IN chạy t=200..1400 → _accum=1200.
        expect(plc.read('"T1".ET')).toBe(1200);
      }
      if (i === 14) {
        expect(plc.read('"T1".Q')).toBe(false);
        expect(plc.read('"T1".ET')).toBe(0);
        expect(plc.read('"C1".CV')).toBe(1);
      }
      if (i === 25) {
        expect(plc.read('"C1".CV')).toBe(0);
        expect(plc.read('%Q0.0')).toBe(true);
      }
    }
  });
});

describe('pipeline std — multi-instance + out-arg (P-S7…P-S8)', () => {
  it('P-S7 FB_Motor đa instance (bảng P): DB 38 byte, chạy thật — expectedFrom: spec', () => {
    const src = `FUNCTION_BLOCK "FB_Sub"
VAR_INPUT
  a : Int;
END_VAR
VAR_OUTPUT
  q : Bool;
END_VAR
VAR_IN_OUT
  io : Int;
END_VAR
VAR
  s : Bool;
END_VAR
BEGIN
  #q := #a >= 1;
  #s := #q;
END_FUNCTION_BLOCK

FUNCTION_BLOCK "FB_Motor"
VAR_INPUT
  iStart : Bool;
END_VAR
VAR_OUTPUT
  qRun : Bool;
END_VAR
VAR
  tOn : TON;
  cCount : CTU;
  sub : FB_Sub;
END_VAR
BEGIN
  #tOn(IN := #iStart, PT := T#500ms);
  #cCount(CU := #tOn.Q, PV := 2);
  #sub(a := #cCount.CV, io := #cCount.CV, q => #qRun);
END_FUNCTION_BLOCK

DATA_BLOCK "DB_Motor" "FB_Motor"
BEGIN
END_DATA_BLOCK

ORGANIZATION_BLOCK "Main"
BEGIN
  "DB_Motor"(iStart := %I0.0);
  %Q0.0 := "DB_Motor".qRun;
END_ORGANIZATION_BLOCK`;
    const { program, diagnostics } = compileSclProgram(src, 'Motor.scl');
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    // Bảng P (OQ-161 ghim hành vi hiện tại): iStart 0.0, qRun 0.1,
    // tOn 2..19, cCount 20..29, sub 30..37 — tổng 38 byte.
    const db = program.dbs.find((d) => d.name === 'DB_Motor');
    expect(db?.size).toBe(38);
    expect(db?.fields.map((f) => [f.name, f.byteOffset])).toEqual([
      ['iStart', 0],
      ['qRun', 0],
      ['tOn', 2],
      ['cCount', 20],
      ['sub', 30],
    ]);
    const plc = new SoftPlc(program, new Map(), { id: 'PLC1', scanPeriodMs: 100 });
    plc.start();
    for (let i = 0; i < 6; i++) {
      scan(plc, 100, () => { plc.write('%I0.0', true); });
      if (i === 4) expect(plc.read('%Q0.0')).toBe(false);
      if (i === 5) {
        expect(plc.read('%Q0.0')).toBe(true);
        expect(plc.read('"DB_Motor".cCount.CV')).toBe(1);
      }
    }
  });

  it('P-S8 out-arg => : Q và ET ra cả DB lẫn Ref (OQ-175) — expectedFrom: spec', () => {
    const plc = compileOk(
      `DATA_BLOCK "T1" "TON"
BEGIN
END_DATA_BLOCK
DATA_BLOCK "DB_Out"
STRUCT
  q : Bool;
  et : Time;
END_STRUCT;
BEGIN
END_DATA_BLOCK
ORGANIZATION_BLOCK "Main"
BEGIN
  "T1"(IN := %I0.0, PT := T#1s, Q => "DB_Out".q, ET => "DB_Out".et);
  %Q0.0 := "T1".Q;
  %Q0.1 := "DB_Out".q;
END_ORGANIZATION_BLOCK`,
      100,
    );
    for (let i = 0; i < 12; i++) {
      scan(plc, 100, () => { plc.write('%I0.0', i >= 1); });
      if (i === 10) {
        expect(plc.read('"DB_Out".q')).toBe(false);
        expect(plc.read('"DB_Out".et')).toBe(900);
        expect(plc.read('"T1".ET')).toBe(900);
      }
      if (i === 11) {
        expect(plc.read('"DB_Out".q')).toBe(true);
        expect(plc.read('"DB_Out".et')).toBe(1000);
        expect(plc.read('"T1".ET')).toBe(1000);
        expect(plc.read('%Q0.0')).toBe(true);
        expect(plc.read('%Q0.1')).toBe(true);
      }
    }
  });
});
