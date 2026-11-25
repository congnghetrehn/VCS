// Test intrinsic §7.3 (OQ-144; expectedFrom: 'spec').

import { describe, expect, it } from 'vitest';
import { createIntrinsicRegistry, type IntrinsicFn } from './intrinsics.js';

const reg = createIntrinsicRegistry();

function fn(name: string): IntrinsicFn {
  const f = reg.get(name);
  if (f === undefined) throw new Error(`thiếu intrinsic ${name}`);
  return f;
}

describe('registry', () => {
  it('chứa đúng 14 hàm §7.3', () => {
    for (const name of [
      'POWER',
      'ABS',
      'SQRT',
      'MIN',
      'MAX',
      'LIMIT',
      'SHL',
      'SHR',
      'ROL',
      'ROR',
      'CEIL',
      'FLOOR',
      'NORM_X',
      'SCALE_X',
    ]) {
      expect(reg.get(name)).toBeDefined();
    }
    expect(reg.get('ROUND')).toBeUndefined();
    expect(reg.get('TON')).toBeUndefined();
  });
});

describe('POWER/ABS/SQRT', () => {
  it('POWER: 2**3=8, 9**0.5=3, 2**-1=0.5', () => {
    const power = fn('POWER');
    expect(power([2, 3], 'Int')).toBe(8);
    expect(power([9, 0.5], 'Real')).toBe(3);
    expect(power([2, -1], 'Real')).toBe(0.5);
  });

  it('ABS: âm → dương; ABS(-32768: Int) wrap về -32768 (OQ-134)', () => {
    const abs = fn('ABS');
    expect(abs([-5], 'Int')).toBe(5);
    expect(abs([-32768], 'Int')).toBe(-32768);
    expect(abs([-2.5], 'Real')).toBe(2.5);
  });

  it('E8: SQRT(-1)=NaN, SQRT(4)=2, không fault', () => {
    const sqrt = fn('SQRT');
    expect(sqrt([-1], 'Real')).toBeNaN();
    expect(sqrt([4], 'Real')).toBe(2);
    expect(sqrt([2], 'Real')).toBe(Math.fround(Math.SQRT2));
  });
});

describe('MIN/MAX/LIMIT (E16)', () => {
  it('E16: MIN/MAX/LIMIT đủ 5 case', () => {
    const min = fn('MIN');
    const max = fn('MAX');
    const limit = fn('LIMIT');
    expect(min([3, 7], 'Int')).toBe(3);
    expect(max([3, 7], 'Int')).toBe(7);
    expect(limit([0, -5, 10], 'Int')).toBe(0);
    expect(limit([0, 15, 10], 'Int')).toBe(10);
    expect(limit([0, 5, 10], 'Int')).toBe(5);
  });

  it('MIN/MAX nhiều đối số, Real fround', () => {
    const min = fn('MIN');
    expect(min([5, 2, 8, 1], 'Int')).toBe(1);
    expect(min([0.1, 0.2], 'Real')).toBe(Math.fround(0.1));
  });
});

describe('SHL/SHR/ROL/ROR qua registry (E12)', () => {
  it('E12 qua registry', () => {
    const shl = fn('SHL');
    const shr = fn('SHR');
    const rol = fn('ROL');
    const ror = fn('ROR');
    expect(shl([0x0001, 3], 'Word')).toBe(0x0008);
    expect(shr([-1, 1], 'Int')).toBe(-1);
    expect(rol([0x81, 1], 'Byte')).toBe(0x03);
    expect(ror([0x81, 1], 'Byte')).toBe(0xc0);
  });
});

describe('CEIL/FLOOR (E9b)', () => {
  it('E9b: trả số thô, interpreter chuẩn hóa về DInt', () => {
    const ceil = fn('CEIL');
    const floor = fn('FLOOR');
    expect(ceil([2.1], 'DInt')).toBe(3);
    expect(ceil([-2.1], 'DInt')).toBe(-2);
    expect(floor([2.9], 'DInt')).toBe(2);
    expect(floor([-2.9], 'DInt')).toBe(-3);
  });
});

describe('NORM_X/SCALE_X (E15)', () => {
  it('E15: trong khoảng + ngoài khoảng KHÔNG kẹp (UNVERIFIED §14.4)', () => {
    const norm = fn('NORM_X');
    const scale = fn('SCALE_X');
    expect(norm([0, 5, 10], 'Real')).toBe(0.5);
    expect(scale([0, 0.5, 10], 'Real')).toBe(5);
    expect(norm([0, 15, 10], 'Real')).toBe(1.5);
    expect(scale([0, 2.0, 10], 'Real')).toBe(20);
  });

  it('SCALE_X kiểu ra nguyên làm tròn như ROUND', () => {
    const scale = fn('SCALE_X');
    expect(scale([0, 0.5, 7], 'Int')).toBe(4); // 3.5 → 4 (banker's)
    expect(scale([0, 0.25, 10], 'Int')).toBe(2); // 2.5 → 2 (banker's)
  });
});

describe('biên registry', () => {
  it('đối số không phải số → throw', () => {
    const abs = fn('ABS');
    expect(() => abs([true], 'Int')).toThrow(/đối số phải là số/);
  });

  it('SCALE_X kiểu LReal → trả số thô, không fround', () => {
    const scale = fn('SCALE_X');
    expect(scale([0, 0.5, 10], 'LReal')).toBe(5);
    expect(scale([0, 1 / 3, 10], 'LReal')).toBe((1 / 3) * 10);
  });
});
