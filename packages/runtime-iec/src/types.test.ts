// Test types — @vcs/runtime-iec (M1 §3.1).
import { describe, expect, it } from 'vitest';
import type { DataType } from '@vcs/schemas';
import { TYPE_INFO, isBitStringType, isFloatType, isIntegerType, sizeOf } from './types.js';

describe('types — sizeOf (M1 §3.1)', () => {
  it.each([
    ['Bool', 1],
    ['Byte', 1],
    ['SInt', 1],
    ['USInt', 1],
    ['Word', 2],
    ['Int', 2],
    ['UInt', 2],
    ['DWord', 4],
    ['DInt', 4],
    ['UDInt', 4],
    ['Real', 4],
    ['Time', 4],
    ['LReal', 8],
  ] satisfies [DataType, number][])('sizeOf(%s) = %i', (type, size) => {
    expect(sizeOf(type)).toBe(size);
  });

  it("sizeOf('String') = undefined (M1 không hỗ trợ STRING, OQ-087)", () => {
    expect(sizeOf('String')).toBeUndefined();
  });

  it('TYPE_INFO khớp sizeOf cho mọi kiểu M1', () => {
    const types = Object.keys(TYPE_INFO) as Exclude<DataType, 'String'>[];
    expect(types).toHaveLength(13);
    for (const type of types) {
      expect(TYPE_INFO[type].sizeBytes).toBe(sizeOf(type));
      expect(TYPE_INFO[type].name).toBe(type);
    }
  });

  it('TYPE_INFO kind đúng (bool/signed/unsigned/float/time)', () => {
    expect(TYPE_INFO.Bool.kind).toBe('bool');
    expect(TYPE_INFO.SInt.kind).toBe('signed');
    expect(TYPE_INFO.Int.kind).toBe('signed');
    expect(TYPE_INFO.DInt.kind).toBe('signed');
    expect(TYPE_INFO.Byte.kind).toBe('unsigned');
    expect(TYPE_INFO.Word.kind).toBe('unsigned');
    expect(TYPE_INFO.DWord.kind).toBe('unsigned');
    expect(TYPE_INFO.USInt.kind).toBe('unsigned');
    expect(TYPE_INFO.UInt.kind).toBe('unsigned');
    expect(TYPE_INFO.UDInt.kind).toBe('unsigned');
    expect(TYPE_INFO.Real.kind).toBe('float');
    expect(TYPE_INFO.LReal.kind).toBe('float');
    expect(TYPE_INFO.Time.kind).toBe('time');
  });
});

describe('types — phân loại kiểu (M1 §3.1)', () => {
  it.each(['SInt', 'USInt', 'UInt', 'UDInt', 'Int', 'DInt', 'Time'] satisfies DataType[])(
    'isIntegerType(%s) = true',
    (type) => {
      expect(isIntegerType(type)).toBe(true);
    },
  );

  it.each(['Bool', 'Byte', 'Word', 'DWord', 'Real', 'LReal', 'String'] satisfies DataType[])(
    'isIntegerType(%s) = false',
    (type) => {
      expect(isIntegerType(type)).toBe(false);
    },
  );

  it.each(['Real', 'LReal'] satisfies DataType[])('isFloatType(%s) = true', (type) => {
    expect(isFloatType(type)).toBe(true);
  });

  it.each(['Bool', 'Int', 'DInt', 'Time', 'Word', 'String'] satisfies DataType[])(
    'isFloatType(%s) = false',
    (type) => {
      expect(isFloatType(type)).toBe(false);
    },
  );

  it.each(['Byte', 'Word', 'DWord'] satisfies DataType[])('isBitStringType(%s) = true', (type) => {
    expect(isBitStringType(type)).toBe(true);
  });

  it.each(['Bool', 'SInt', 'Int', 'Real', 'LReal', 'Time', 'String'] satisfies DataType[])(
    'isBitStringType(%s) = false',
    (type) => {
      expect(isBitStringType(type)).toBe(false);
    },
  );
});
