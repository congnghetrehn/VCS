// Adapter raw↔eng (M2 §3.2, bảng A — tính tay độc lập).
// Lưu ý: plan ghi read-back raw=32511 → "≈ 117.58" là sai làm tròn;
// giá trị đúng là 117.58897569... (≈ 117.589), test ghim giá trị đúng.

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { clampRaw, engToRaw, rawToEng, resolveRange, type Range } from './adapter.js';

const PCT: Range = { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: '%' };

describe('engToRaw (bảng A)', () => {
  it('0 → 0, 50 → 13824, 100 → 27648', () => {
    expect(engToRaw(0, PCT)).toBe(0);
    expect(engToRaw(50, PCT)).toBe(13824);
    expect(engToRaw(100, PCT)).toBe(27648);
  });

  it('110 → 30413 (vượt 100% nhưng trong clamp)', () => {
    expect(engToRaw(110, PCT)).toBe(30413);
  });

  it('125 → 32511 (clamp trên)', () => {
    expect(engToRaw(125, PCT)).toBe(32511);
  });

  it('−10 → −2765, −20 → −4864 (clamp dưới)', () => {
    expect(engToRaw(-10, PCT)).toBe(-2765);
    expect(engToRaw(-20, PCT)).toBe(-4864);
  });

  it('dải đảo (engMin > engMax): 0 → 27648, 100 → 0', () => {
    const rev: Range = { rawMin: 0, rawMax: 27648, engMin: 100, engMax: 0 };
    expect(engToRaw(0, rev)).toBe(27648);
    expect(engToRaw(100, rev)).toBe(0);
    expect(engToRaw(50, rev)).toBe(13824);
  });
});

describe('rawToEng (bảng A)', () => {
  it('0 → 0, 13824 → 50, 27648 → 100', () => {
    expect(rawToEng(0, PCT)).toBe(0);
    expect(rawToEng(13824, PCT)).toBe(50);
    expect(rawToEng(27648, PCT)).toBe(100);
  });

  it('32511 → 117.58897569... (plan ghi 117.58 là sai làm tròn)', () => {
    expect(rawToEng(32511, PCT).toFixed(4)).toBe('117.5890');
    expect(rawToEng(32511, PCT)).toBeCloseTo(117.58897569444444, 10);
  });

  it('không clamp: raw ngoài dải cho eng ngoài dải', () => {
    expect(rawToEng(30413, PCT)).toBeCloseTo(110.00072337962963, 10);
    expect(rawToEng(-2765, PCT)).toBeCloseTo(-10.001, 3);
  });
});

describe('clampRaw', () => {
  it('giới hạn [−4864, 32511]', () => {
    expect(clampRaw(40000)).toBe(32511);
    expect(clampRaw(-10000)).toBe(-4864);
    expect(clampRaw(100)).toBe(100);
  });
});

describe('resolveRange (OQ-242)', () => {
  it('params.engMin/engMax thắng scaling của tag', () => {
    const r = resolveRange({ engMin: 0, engMax: 50 }, { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100 }, '%');
    expect(r).toEqual({ rawMin: 0, rawMax: 27648, engMin: 0, engMax: 50, unit: '%' });
  });

  it('params chỉ có engMin (thiếu engMax) → rơi xuống scaling', () => {
    const r = resolveRange({ engMin: 0 }, { rawMin: 0, rawMax: 27648, engMin: -20, engMax: 80 }, 'bar');
    expect(r?.engMin).toBe(-20);
    expect(r?.engMax).toBe(80);
  });

  it('không params, có scaling → dùng scaling', () => {
    const r = resolveRange(undefined, { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 10 }, 'bar');
    expect(r).toEqual({ rawMin: 0, rawMax: 27648, engMin: 0, engMax: 10, unit: 'bar' });
  });

  it('không params/scaling, unit % → mặc định 0..100', () => {
    expect(resolveRange(undefined, undefined, '%')).toEqual({
      rawMin: 0,
      rawMax: 27648,
      engMin: 0,
      engMax: 100,
      unit: '%',
    });
  });

  it('không params/scaling, unit khác % → undefined (PL-E012)', () => {
    expect(resolveRange(undefined, undefined, 'bar')).toBeUndefined();
    expect(resolveRange(undefined, undefined, undefined)).toBeUndefined();
  });
});

describe('adapter — property (fast-check, seed cố định)', () => {
  it('round-trip eng→raw→eng trong [0,100] sai số < 0.01 (1 bước raw ≈ 0.0036 eng)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 100, noNaN: true }), (eng) => {
        const back = rawToEng(engToRaw(eng, PCT), PCT);
        expect(Math.abs(back - eng)).toBeLessThan(0.01);
      }),
      { seed: 20261126, numRuns: 100 },
    );
  });

  it('round-trip raw→eng→raw trong [0,27648] chính xác', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 27648 }), (raw) => {
        expect(engToRaw(rawToEng(raw, PCT), PCT)).toBe(raw);
      }),
      { seed: 20261126, numRuns: 100 },
    );
  });
});
