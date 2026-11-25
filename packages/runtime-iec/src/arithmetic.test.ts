// Test hàm thuần §7.2 (bảng E ở mức hàm; expectedFrom: 'spec').

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  convertChecked,
  intBinary,
  normalizeScalar,
  roundHalfEven,
  shiftOp,
  wrapInt16,
  wrapInt32,
  wrapToInt,
  wrapUnsigned,
} from './arithmetic.js';
import type { PrimitiveType } from './ir.js';

describe('wrap (E1–E4)', () => {
  it('wrapInt16: 32767 + 1 → −32768', () => {
    expect(wrapInt16(32768)).toBe(-32768);
    expect(wrapInt16(-32769)).toBe(32767);
    expect(wrapInt16(32767)).toBe(32767);
  });

  it('wrapInt32: 2147483647 + 1 → −2147483648', () => {
    expect(wrapInt32(2147483648)).toBe(-2147483648);
    expect(wrapInt32(-2147483649)).toBe(2147483647);
  });

  it('wrapUnsigned: mask theo độ rộng', () => {
    expect(wrapUnsigned(8, 256)).toBe(0);
    expect(wrapUnsigned(8, -1)).toBe(255);
    expect(wrapUnsigned(16, 65536)).toBe(0);
    expect(wrapUnsigned(32, -1)).toBe(4294967295);
    expect(wrapUnsigned(32, 4294967296)).toBe(0);
  });
});

describe('intBinary (E1–E6)', () => {
  it('E1: 32767 + 1 (Int) = −32768, ov=true', () => {
    expect(intBinary('add', 'Int', 32767, 1)).toEqual({ value: -32768, ov: true });
  });

  it('E2: −32768 − 1 (Int) = 32767, ov=true', () => {
    expect(intBinary('sub', 'Int', -32768, 1)).toEqual({ value: 32767, ov: true });
  });

  it('E3: 32767 * 2 (Int) = −2, ov=true', () => {
    expect(intBinary('mul', 'Int', 32767, 2)).toEqual({ value: -2, ov: true });
  });

  it('E4: 2147483647 + 1 (DInt) = −2147483648, không đặt ov', () => {
    expect(intBinary('add', 'DInt', 2147483647, 1)).toEqual({ value: -2147483648 });
  });

  it('E5: chia/mod cắt về 0, MOD mang dấu số bị chia', () => {
    expect(intBinary('div', 'Int', 7, 2)).toEqual({ value: 3 });
    expect(intBinary('div', 'Int', -7, 2)).toEqual({ value: -3 });
    expect(intBinary('mod', 'Int', 7, 2)).toEqual({ value: 1 });
    expect(intBinary('mod', 'Int', -7, 2)).toEqual({ value: -1 });
    expect(intBinary('mod', 'Int', 7, -2)).toEqual({ value: 1 });
  });

  it('E6: chia/mod cho 0 → 0 + DIV_ZERO', () => {
    expect(intBinary('div', 'Int', 7, 0)).toEqual({ value: 0, fault: 'DIV_ZERO' });
    expect(intBinary('mod', 'Int', 7, 0)).toEqual({ value: 0, fault: 'DIV_ZERO' });
  });

  it('không tràn thì không đặt ov', () => {
    expect(intBinary('add', 'Int', 100, 23)).toEqual({ value: 123 });
    expect(intBinary('mul', 'Int', 100, 2)).toEqual({ value: 200 });
  });

  it('Byte/Word wrap không đặt ov', () => {
    expect(intBinary('add', 'Byte', 255, 1)).toEqual({ value: 0 });
    expect(intBinary('add', 'Word', 65535, 1)).toEqual({ value: 0 });
  });
});

describe('roundHalfEven (E9)', () => {
  it('E9: .5 về số chẵn gần nhất', () => {
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(3.5)).toBe(4);
    expect(roundHalfEven(-2.5)).toBe(-2);
    expect(roundHalfEven(-3.5)).toBe(-4);
    expect(roundHalfEven(0.5)).toBe(0);
    expect(roundHalfEven(1.5)).toBe(2);
  });

  it('không phải .5 thì như Math.round', () => {
    expect(roundHalfEven(2.4)).toBe(2);
    expect(roundHalfEven(2.6)).toBe(3);
    expect(roundHalfEven(-2.6)).toBe(-3);
  });

  it('property: kết quả .5 luôn chẵn; không .5 thì bằng Math.round (seed cố định)', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, min: -1e6, max: 1e6 }), (x) => {
        const r = roundHalfEven(x);
        if (Math.abs(x - Math.trunc(x)) === 0.5) {
          expect(r % 2).toBe(0);
        } else {
          expect(r).toBe(Math.round(x));
        }
      }),
      { seed: 20261125, numRuns: 100 },
    );
  });
});

describe('convertChecked (E9–E10, E17)', () => {
  it('E9: REAL_TO_INT bankers rounding', () => {
    expect(convertChecked('Real', 'Int', 2.5)).toEqual({ value: 2 });
    expect(convertChecked('Real', 'Int', 3.5)).toEqual({ value: 4 });
    expect(convertChecked('Real', 'Int', -3.5)).toEqual({ value: -4 });
  });

  it('E9b: TRUNC cắt về 0; CEIL/FLOOR qua convertChecked', () => {
    expect(convertChecked('Real', 'Int', 2.9, 'trunc')).toEqual({ value: 2 });
    expect(convertChecked('Real', 'Int', -2.9, 'trunc')).toEqual({ value: -2 });
    expect(convertChecked('Real', 'Int', Math.ceil(2.1))).toEqual({ value: 3 });
    expect(convertChecked('Real', 'Int', Math.floor(-2.1))).toEqual({ value: -3 });
  });

  it('E10: ngoài khoảng / NaN → 0 + CONV_RANGE', () => {
    expect(convertChecked('Real', 'Int', 40000)).toEqual({ value: 0, fault: 'CONV_RANGE' });
    expect(convertChecked('Real', 'Int', Number.NaN)).toEqual({ value: 0, fault: 'CONV_RANGE' });
    expect(convertChecked('Real', 'Int', -40000)).toEqual({ value: 0, fault: 'CONV_RANGE' });
  });

  it('E10b: INT_TO_REAL(16777217) fround → 16777216', () => {
    expect(convertChecked('Int', 'Real', 16777217)).toEqual({ value: 16777216 });
  });

  it('E17: Int→Real widening', () => {
    expect(convertChecked('Int', 'Real', 7)).toEqual({ value: 7 });
    expect(convertChecked('Int', 'LReal', 7)).toEqual({ value: 7 });
  });

  it('Int→Int hẹp kiểm khoảng, không wrap', () => {
    expect(convertChecked('Int', 'SInt', 127)).toEqual({ value: 127 });
    expect(convertChecked('Int', 'SInt', 128)).toEqual({ value: 0, fault: 'CONV_RANGE' });
    expect(convertChecked('DInt', 'Int', 32768)).toEqual({ value: 0, fault: 'CONV_RANGE' });
  });

  it('Bool↔số: true→1, khác 0→true', () => {
    expect(convertChecked('Bool', 'Int', true)).toEqual({ value: 1 });
    expect(convertChecked('Bool', 'Int', false)).toEqual({ value: 0 });
    expect(convertChecked('Int', 'Bool', 0)).toEqual({ value: false });
    expect(convertChecked('Int', 'Bool', 5)).toEqual({ value: true });
    expect(convertChecked('Int', 'Bool', Number.NaN)).toEqual({ value: false });
  });
});

describe('shiftOp (E12)', () => {
  it('E12: đủ 7 case', () => {
    expect(shiftOp('SHL', 'Word', 0x0001, 3)).toBe(0x0008);
    expect(shiftOp('SHL', 'Word', 0x0001, 16)).toBe(0);
    expect(shiftOp('SHR', 'Int', -1, 1)).toBe(-1);
    expect(shiftOp('SHR', 'Word', 0x8000, 1)).toBe(0x4000);
    expect(shiftOp('ROL', 'Byte', 0x81, 1)).toBe(0x03);
    expect(shiftOp('ROR', 'Byte', 0x81, 1)).toBe(0xc0);
    expect(shiftOp('SHL', 'Word', 0x0001, -1)).toBe(0);
  });

  it('SHR không dấu dùng >>>; ROL/ROR xoay trong độ rộng', () => {
    expect(shiftOp('SHR', 'DWord', -1, 1)).toBe(0x7fffffff);
    expect(shiftOp('ROL', 'Word', 0x8001, 1)).toBe(0x0003);
    expect(shiftOp('ROR', 'Word', 0x8001, 1)).toBe(0xc000);
    expect(shiftOp('SHL', 'Byte', 0x81, 0)).toBe(0x81);
  });
});

describe('convertChecked/normalizeScalar — biên', () => {
  it('Bool → số: true → 1, false → 0; số → Bool giữ nguyên/khác 0', () => {
    expect(convertChecked('Bool', 'Int', true)).toEqual({ value: 1 });
    expect(convertChecked('Bool', 'Int', false)).toEqual({ value: 0 });
    expect(convertChecked('Int', 'Bool', true)).toEqual({ value: true });
    expect(convertChecked('Int', 'Bool', 5)).toEqual({ value: true });
    expect(convertChecked('Int', 'Bool', 0)).toEqual({ value: false });
  });

  it('kiểu đích không phải số → throw', () => {
    expect(() => convertChecked('Int', 'String' as PrimitiveType, 5)).toThrow(/không phải số/);
    expect(() => wrapToInt('Real', 1.5)).toThrow(/không phải số nguyên/);
    expect(() => intBinary('add', 'Real', 1, 2)).toThrow(/không phải số nguyên/);
    expect(() => shiftOp('SHL', 'Real', 1, 1)).toThrow(/không shift được/);
  });

  it('normalizeScalar Bool: 0/NaN → false, số khác 0 → true; Int với Bool → 1/0', () => {
    expect(normalizeScalar('Bool', 0)).toBe(false);
    expect(normalizeScalar('Bool', Number.NaN)).toBe(false);
    expect(normalizeScalar('Bool', 5)).toBe(true);
    expect(normalizeScalar('Int', true)).toBe(1);
    expect(normalizeScalar('Int', false)).toBe(0);
  });
});
