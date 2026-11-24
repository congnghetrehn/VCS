// Test duration (M0 §4.2, §12.1: ≥ 15).
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DurationError,
  durationSchema,
  formatDuration,
  parseDuration,
  tryParseDuration,
} from './duration.js';

describe('parseDuration', () => {
  it.each([
    ['500ms', 500],
    ['3s', 3000],
    ['1m30s', 90000],
    ['2h', 7200000],
    ['-2s', -2000],
    ['1.5s', 1500],
    ['1H', 3600000],
    ['1m 30s', 90000],
    ['0ms', 0],
    ['90s', 90000],
  ])('%s → %i ms', (text, expected) => {
    expect(parseDuration(text)).toBe(expected);
  });

  it.each(['', 'abc', '10', '1x', 'ms', '1.5.2s', '--2s'])('"%s" → DurationError', (text) => {
    expect(() => parseDuration(text)).toThrow(DurationError);
  });

  it("'0.5ms' → DurationError (kết quả không nguyên)", () => {
    const r = tryParseDuration('0.5ms');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(DurationError);
  });

  it("'10x' báo vị trí lỗi 0", () => {
    const r = tryParseDuration('10x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.position).toBe(0);
  });

  it('tryParseDuration trả {ok, value} thay vì ném', () => {
    expect(tryParseDuration('2m')).toEqual({ ok: true, value: 120000 });
    expect(tryParseDuration('nope').ok).toBe(false);
  });
});

describe('formatDuration', () => {
  it.each([
    [90000, '1m30s'],
    [0, '0ms'],
    [1500, '1s500ms'],
    [-2000, '-2s'],
    [3661001, '1h1m1s1ms'],
    [500, '500ms'],
    [3600000, '1h'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it('số không nguyên → DurationError', () => {
    expect(() => formatDuration(1.5)).toThrow(DurationError);
  });
});

describe('parse∘format (property, M0 §12.2)', () => {
  it('parseDuration(formatDuration(x)) === x', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10_000_000, max: 10_000_000 }), (x) => {
        expect(parseDuration(formatDuration(x))).toBe(x);
      }),
      { numRuns: 200 },
    );
  });

  it('formatDuration(parseDuration(s)) rồi parse lại cho cùng giá trị', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 59 }), (s, m) => {
        const text = `${String(m)}m${String(s)}s`;
        expect(parseDuration(formatDuration(parseDuration(text)))).toBe(parseDuration(text));
      }),
      { numRuns: 100 },
    );
  });
});

describe('durationSchema', () => {
  it("chấp nhận chuỗi '1m30s' → 90000", () => {
    expect(durationSchema.safeParse('1m30s')).toEqual({ success: true, data: 90000 });
  });

  it('chấp nhận số (ms) 500 → 500', () => {
    expect(durationSchema.safeParse(500)).toEqual({ success: true, data: 500 });
  });

  it("từ chối '0.5ms' và 1.5", () => {
    expect(durationSchema.safeParse('0.5ms').success).toBe(false);
    expect(durationSchema.safeParse(1.5).success).toBe(false);
  });
});
