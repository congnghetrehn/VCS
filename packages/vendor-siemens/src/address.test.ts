// Test address — @vcs/vendor-siemens (M1 §3.3; bảng tính tay D trong STATE §16).
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { AbsAddress } from './address.js';
import { formatAddress, parseAddress } from './address.js';

describe('address — bảng tính tay D: parse hợp lệ (M1 §3.3)', () => {
  it.each([
    ['%I0.0', { kind: 'area', area: 'I', byte: 0, bit: 0, width: 1 }],
    ['%I0.7', { kind: 'area', area: 'I', byte: 0, bit: 7, width: 1 }],
    ['%I1023.7', { kind: 'area', area: 'I', byte: 1023, bit: 7, width: 1 }],
    ['%IB10', { kind: 'area', area: 'I', byte: 10, width: 8 }],
    ['%IW64', { kind: 'area', area: 'I', byte: 64, width: 16 }],
    ['%ID20', { kind: 'area', area: 'I', byte: 20, width: 32 }],
    ['%Q0.0', { kind: 'area', area: 'Q', byte: 0, bit: 0, width: 1 }],
    ['%QB0', { kind: 'area', area: 'Q', byte: 0, width: 8 }],
    ['%QW0', { kind: 'area', area: 'Q', byte: 0, width: 16 }],
    ['%QD0', { kind: 'area', area: 'Q', byte: 0, width: 32 }],
    ['%MB10', { kind: 'area', area: 'M', byte: 10, width: 8 }],
    ['%MW0', { kind: 'area', area: 'M', byte: 0, width: 16 }],
    ['%MD20', { kind: 'area', area: 'M', byte: 20, width: 32 }],
    ['DB1.DBX0.0', { kind: 'db', db: 1, byte: 0, bit: 0, width: 1 }],
    ['DB1.DBB0', { kind: 'db', db: 1, byte: 0, width: 8 }],
    ['DB1.DBW4', { kind: 'db', db: 1, byte: 4, width: 16 }],
    ['DB1.DBD8', { kind: 'db', db: 1, byte: 8, width: 32 }],
  ] as [string, AbsAddress][])('parseAddress(%s)', (text, expected) => {
    expect(parseAddress(text)).toEqual(expected);
  });

  it.each([
    ['I0.0', { kind: 'area', area: 'I', byte: 0, bit: 0, width: 1 }],
    ['IW64', { kind: 'area', area: 'I', byte: 64, width: 16 }],
    ['MB10', { kind: 'area', area: 'M', byte: 10, width: 8 }],
  ] as [string, AbsAddress][])('không có %% cũng parse được: %s', (text, expected) => {
    expect(parseAddress(text)).toEqual(expected);
  });

  it('%IW65 (word ở byte lẻ) vẫn parse — §3.4 không ràng buộc địa chỉ tuyệt đối', () => {
    expect(parseAddress('%IW65')).toEqual({ kind: 'area', area: 'I', byte: 65, width: 16 });
  });

  it.each([
    ['%i0.0', { kind: 'area', area: 'I', byte: 0, bit: 0, width: 1 }],
    ['%mw0', { kind: 'area', area: 'M', byte: 0, width: 16 }],
    ['db1.dbw4', { kind: 'db', db: 1, byte: 4, width: 16 }],
  ] as [string, AbsAddress][])(
    'chữ thường chấp nhận + chuẩn hóa hoa: %s (OQ-085)',
    (text, expected) => {
      expect(parseAddress(text)).toEqual(expected);
    },
  );

  it('trim khoảng trắng đầu/cuối (OQ-085)', () => {
    expect(parseAddress('  %IW64  ')).toEqual({ kind: 'area', area: 'I', byte: 64, width: 16 });
  });
});

describe('address — bảng tính tay D: parse không hợp lệ → throw', () => {
  it.each([
    '',
    '%X0.0',
    '%I0.8',
    '%I',
    '%IW',
    '%M0.0.0',
    'DB0.DBW0',
    'DB1.DBZ0',
    'DB1.DBW',
    '%DB1.DBW0',
    'sym:Motor.Start',
    'DB1.DBW4.0',
    '%IB10.0',
    'DB1.DBX0',
    '%I0.-1',
  ])('parseAddress(%s) → throw Error nêu text gốc', (text) => {
    expect(() => parseAddress(text)).toThrow(Error);
    try {
      parseAddress(text);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain('địa chỉ không hợp lệ');
      expect((e as Error).message).toContain(text);
    }
  });
});

describe('address — formatAddress', () => {
  it.each([
    ['%I0.0', '%I0.0'],
    ['%I1023.7', '%I1023.7'],
    ['%IB10', '%IB10'],
    ['%IW64', '%IW64'],
    ['%ID20', '%ID20'],
    ['%QW0', '%QW0'],
    ['%MD20', '%MD20'],
    ['DB1.DBX0.0', 'DB1.DBX0.0'],
    ['DB1.DBB0', 'DB1.DBB0'],
    ['DB1.DBW4', 'DB1.DBW4'],
    ['DB1.DBD8', 'DB1.DBD8'],
  ])('formatAddress(parseAddress(%s)) = %s', (text, canonical) => {
    expect(formatAddress(parseAddress(text))).toBe(canonical);
  });

  it('formatAddress chuẩn hóa dạng không-% và chữ thường', () => {
    expect(formatAddress(parseAddress('I0.0'))).toBe('%I0.0');
    expect(formatAddress(parseAddress('%mw0'))).toBe('%MW0');
    expect(formatAddress(parseAddress('db1.dbw4'))).toBe('DB1.DBW4');
  });

  it('formatAddress địa chỉ bit thiếu bit → throw', () => {
    expect(() => formatAddress({ kind: 'area', area: 'I', byte: 0, width: 1 })).toThrow(
      /thiếu bit/,
    );
  });
});

describe('address — property (fast-check, seed cố định)', () => {
  const areaArb = fc
    .record({
      area: fc.constantFrom('I', 'Q', 'M'),
      byte: fc.integer({ min: 0, max: 1023 }),
      shape: fc.oneof(
        fc.record({ bit: fc.integer({ min: 0, max: 7 }) }),
        fc.constant({ width: 8 as const }),
        fc.constant({ width: 16 as const }),
        fc.constant({ width: 32 as const }),
      ),
    })
    .map(({ area, byte, shape }): AbsAddress => {
      if ('bit' in shape) return { kind: 'area', area, byte, bit: shape.bit, width: 1 };
      return { kind: 'area', area, byte, width: shape.width };
    });
  const dbArb = fc
    .record({
      db: fc.integer({ min: 1, max: 100 }),
      byte: fc.integer({ min: 0, max: 1023 }),
      shape: fc.oneof(
        fc.record({ bit: fc.integer({ min: 0, max: 7 }) }),
        fc.constant({ width: 8 as const }),
        fc.constant({ width: 16 as const }),
        fc.constant({ width: 32 as const }),
      ),
    })
    .map(({ db, byte, shape }): AbsAddress => {
      if ('bit' in shape) return { kind: 'db', db, byte, bit: shape.bit, width: 1 };
      return { kind: 'db', db, byte, width: shape.width };
    });

  it('format → parse → deep-equal dạng chuẩn hóa', () => {
    fc.assert(
      fc.property(fc.oneof(areaArb, dbArb), (addr) => {
        expect(parseAddress(formatAddress(addr))).toEqual(addr);
      }),
      { seed: 20261124, numRuns: 100 },
    );
  });
});
