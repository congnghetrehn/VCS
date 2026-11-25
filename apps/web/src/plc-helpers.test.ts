// Test plc-helpers — parse giá trị Watch + validate tên (P1.7).
import { describe, expect, it } from 'vitest';
import { isValidPlcFileName, isValidWatchRef, parseWatchValue } from './plc-helpers.js';

describe('parseWatchValue', () => {
  it('boolean: true/false/1/0 (không phân biệt hoa thường)', () => {
    expect(parseWatchValue(false, 'true')).toBe(true);
    expect(parseWatchValue(true, 'FALSE')).toBe(false);
    expect(parseWatchValue(false, '1')).toBe(true);
    expect(parseWatchValue(true, '0')).toBe(false);
    expect(() => parseWatchValue(false, 'yes')).toThrow(/boolean/);
  });

  it('number: số nguyên/thực/NaN; sai → throw', () => {
    expect(parseWatchValue(0, '42')).toBe(42);
    expect(parseWatchValue(0, '3.5')).toBe(3.5);
    expect(parseWatchValue(0, 'NaN')).toBeNaN();
    expect(() => parseWatchValue(0, 'abc')).toThrow();
    expect(() => parseWatchValue(0, '')).toThrow();
  });

  it('string: giữ nguyên (kể cả khoảng trắng)', () => {
    expect(parseWatchValue('x', '  hello  ')).toBe('  hello  ');
  });
});

describe('validate', () => {
  it('isValidWatchRef: rỗng/khoảng trắng → false', () => {
    expect(isValidWatchRef('RUN_CMD')).toBe(true);
    expect(isValidWatchRef('%Q0.0')).toBe(true);
    expect(isValidWatchRef('')).toBe(false);
    expect(isValidWatchRef('A B')).toBe(false);
  });

  it('isValidPlcFileName: chỉ .scl/.lad.json, chặn .. và / đầu', () => {
    expect(isValidPlcFileName('FB_New.scl')).toBe(true);
    expect(isValidPlcFileName('a.lad.json')).toBe(true);
    expect(isValidPlcFileName('x.txt')).toBe(false);
    expect(isValidPlcFileName('../x.scl')).toBe(false);
    expect(isValidPlcFileName('/x.scl')).toBe(false);
    expect(isValidPlcFileName('')).toBe(false);
  });
});
