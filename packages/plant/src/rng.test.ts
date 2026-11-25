// PRNG tất định mulberry32 + FNV-1a (M2 §4.2, bảng C — tính tay độc lập).

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { hash32, hashSeed, rngGaussian, rngNext, rngState } from './rng.js';

describe('mulberry32 (bảng C)', () => {
  it('seed 0: 3 giá trị đầu', () => {
    const s = rngState(0);
    expect(rngNext(s).toFixed(10)).toBe('0.2664292087');
    expect(rngNext(s).toFixed(10)).toBe('0.0003297457');
    expect(rngNext(s).toFixed(10)).toBe('0.2232720274');
  });

  it('seed 1: 3 giá trị đầu', () => {
    const s = rngState(1);
    expect(rngNext(s).toFixed(10)).toBe('0.6270739406');
    expect(rngNext(s).toFixed(10)).toBe('0.0027357212');
    expect(rngNext(s).toFixed(10)).toBe('0.5274470400');
  });

  it('seed 42: 3 giá trị đầu', () => {
    const s = rngState(42);
    expect(rngNext(s).toFixed(10)).toBe('0.6011037519');
    expect(rngNext(s).toFixed(10)).toBe('0.4482905590');
    expect(rngNext(s).toFixed(10)).toBe('0.8524657935');
  });

  it('cùng seed → cùng dãy; khác seed → khác giá trị đầu; mọi giá trị trong [0,1)', () => {
    const a = rngState(7);
    const b = rngState(7);
    const c = rngState(8);
    for (let i = 0; i < 100; i++) {
      const v = rngNext(a);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(rngNext(b)).toBe(v);
    }
    expect(rngNext(c)).not.toBe(rngNext(rngState(7)));
  });

  it('snapshot trạng thái: copy state → tiếp tục giống hệt', () => {
    const s = rngState(42);
    rngNext(s);
    rngNext(s);
    const copy = { ...s };
    expect(rngNext(s)).toBe(rngNext(copy));
    expect(rngNext(s)).toBe(rngNext(copy));
  });
});

describe('hash32 / hashSeed (bảng C)', () => {
  it('FNV-1a golden vector', () => {
    expect(hash32('42:CR01_M01')).toBe(1296374874);
    expect(hash32('42:CR01_M02')).toBe(1279597255);
    expect(hash32('7:CR01_M01')).toBe(1292621609);
  });

  it('hashSeed(seed, id) = hash32(`${seed}:${id}`)', () => {
    expect(hashSeed(42, 'CR01_M01')).toBe(hash32('42:CR01_M01'));
    expect(hashSeed(42, 'CR01_M01')).not.toBe(hashSeed(42, 'CR01_M02'));
    expect(hashSeed(42, 'CR01_M01')).not.toBe(hashSeed(7, 'CR01_M01'));
  });
});

describe('rngGaussian (Box–Muller)', () => {
  it('cùng seed → cùng dãy Gauss (kể cả spare)', () => {
    const a = rngState(3);
    const b = rngState(3);
    for (let i = 0; i < 20; i++) expect(rngGaussian(a)).toBe(rngGaussian(b));
  });

  it('giá trị hữu hạn, trung bình ~0 trên mẫu lớn', () => {
    const s = rngState(99);
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const v = rngGaussian(s);
      expect(Number.isFinite(v)).toBe(true);
      sum += v;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.05);
  });

  it('spare serialize được: snapshot giữa chừng → dãy tiếp tục giống hệt (OQ-243)', () => {
    const s = rngState(5);
    rngGaussian(s); // tiêu 2 uniform, cache spare
    const snap = { ...s };
    const g2 = rngGaussian(s); // dùng spare
    const s2 = { ...snap };
    expect(rngGaussian(s2)).toBe(g2);
    expect(rngGaussian(s)).toBe(rngGaussian(s2));
  });
});

describe('mulberry32 — property (fast-check, seed cố định)', () => {
  it('mọi seed cho giá trị đầu trong [0,1)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2147483648, max: 2147483647 }), (seed) => {
        const v = rngNext(rngState(seed));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }),
      { seed: 20261126, numRuns: 100 },
    );
  });
});
