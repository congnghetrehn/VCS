// Tích hợp SCL→IR→SoftPlc (P1.4): compileSclProgram rồi chạy SoftPlc trực tiếp.
// + cross-test parsePlcRef (runtime-iec) vs parseAddress (P1.1) trên ~20 địa chỉ.
// expectedFrom: 'spec' (OQ-151).

import { buildTagAddressMap, parsePlcRef, SoftPlc } from '@vcs/runtime-iec';
import { describe, expect, it } from 'vitest';
import { parseAddress } from '../address.js';
import { compileSclProgram } from './compile.js';

const MOTOR_SCL = `FUNCTION_BLOCK "FB_Motor"
VAR_INPUT
  iStart : Bool;
  iStop : Bool;
END_VAR
VAR_OUTPUT
  qRun : Bool;
END_VAR
VAR
  latched : Bool;
END_VAR
BEGIN
  IF #iStart THEN
    #latched := TRUE;
  END_IF;
  IF #iStop THEN
    #latched := FALSE;
  END_IF;
  #qRun := #latched;
END_FUNCTION_BLOCK

DATA_BLOCK "DB_Motor" "FB_Motor"
BEGIN
END_DATA_BLOCK

ORGANIZATION_BLOCK "Main"
BEGIN
  "DB_Motor"(iStart := %I0.0, iStop := %I0.1);
  %Q0.0 := "DB_Motor".qRun;
END_ORGANIZATION_BLOCK`;

describe('SCL → IR → SoftPlc (FB_Motor latch)', () => {
  it('compile không lỗi; latch chốt/xả qua 4 scan', () => {
    const { program, diagnostics } = compileSclProgram(MOTOR_SCL, 'Motor.scl');
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(program.blocks.map((b) => b.name)).toContain('FB_Motor');
    expect(program.dbs.map((d) => d.name)).toContain('DB_Motor');
    const plc = new SoftPlc(program, new Map(), { id: 'PLC1', scanPeriodMs: 10 });
    plc.start();
    const scan = (i0: boolean, i1: boolean): boolean => {
      plc.write('%I0.0', i0);
      plc.write('%I0.1', i1);
      plc.step(plc.getDiagnostics().scanCount * 10, 10);
      return plc.read('%Q0.0') as boolean;
    };
    expect(scan(false, false)).toBe(false);
    expect(scan(true, false)).toBe(true);
    expect(scan(false, false)).toBe(true);
    expect(scan(false, true)).toBe(false);
  });
});

describe('cross-test parsePlcRef vs parseAddress (P1.1)', () => {
  const map = buildTagAddressMap([]);
  const cases: string[] = [
    '%I0.0',
    '%I0.1',
    '%I1.7',
    '%Q0.0',
    '%Q0.1',
    '%QB0',
    '%QW0',
    '%QW2',
    '%IW0',
    '%ID4',
    '%MB10',
    '%MW10',
    '%MD10',
    '%M0.0',
    '%M0.1',
    'DB1.DBX0.0',
    'DB1.DBW4',
    'DB2.DBD8',
    '%I0.0',
    '%i0.0',
    '%mw10',
  ];
  it.each(cases)('%s → cùng area/byte/bit/type', (ref) => {
    const a = parseAddress(ref);
    const b = parsePlcRef(ref, map);
    if (a.kind === 'area') {
      expect(b.k).toBe('abs');
      if (b.k === 'abs') {
        expect(b.area).toBe(a.area);
        expect(b.byte).toBe(a.byte);
        expect(b.bit).toBe(a.bit);
        // width: parseAddress bit → 1; parsePlcRef bit → 8 (quy ước lower, OQ-110).
        expect(b.width).toBe(a.width === 1 ? 8 : a.width);
        expect(b.type).toBe(
          a.width === 1 ? 'Bool' : a.width === 8 ? 'Byte' : a.width === 16 ? 'Int' : 'DInt',
        );
      }
    } else {
      expect(b.k).toBe('absDb');
      if (b.k === 'absDb') {
        expect(b.db).toBe(a.db);
        expect(b.byte).toBe(a.byte);
        expect(b.bit).toBe(a.bit);
        expect(b.width).toBe(a.width === 1 ? 8 : a.width);
        expect(b.type).toBe(
          a.width === 1 ? 'Bool' : a.width === 8 ? 'Byte' : a.width === 16 ? 'Int' : 'DInt',
        );
      }
    }
  });
});
