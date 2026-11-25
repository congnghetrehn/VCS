// Trễ và bộ lọc tín hiệu (M2 §4.2, §6.2, bảng B).

import { describe, expect, it } from 'vitest';

import {
  DelayLine,
  hysteresisStep,
  lagStep,
  offDelayStep,
  onDelayStep,
  rateLimitStep,
  type DelayTimerState,
} from './delay.js';

describe('DelayLine', () => {
  it('n=0: passthrough', () => {
    const dl = new DelayLine<number>(0, 0);
    expect(dl.push(5)).toBe(5);
    expect(dl.push(7)).toBe(7);
  });

  it('n=3: giá trị đổi ở T=0 xuất hiện ở T=30 (bảng B, dt=10)', () => {
    const dl = new DelayLine<number>(3, 0);
    // Bốn bước T=0,10,20,30 sau khi đổi 0 → 67.
    expect(dl.push(67)).toBe(0);
    expect(dl.push(67)).toBe(0);
    expect(dl.push(67)).toBe(0);
    expect(dl.push(67)).toBe(67);
    expect(dl.push(67)).toBe(67);
  });

  it('bool: trễ 2 bước', () => {
    const dl = new DelayLine<boolean>(2, false);
    expect(dl.push(true)).toBe(false);
    expect(dl.push(true)).toBe(false);
    expect(dl.push(true)).toBe(true);
  });

  it('snapshot/restore tiếp tục đúng vị trí', () => {
    const dl = new DelayLine<number>(3, 0);
    dl.push(10);
    dl.push(20);
    const snap = dl.snapshot();
    expect(dl.push(30)).toBe(0);
    dl.restore(snap);
    expect(dl.push(30)).toBe(0);
    expect(dl.push(40)).toBe(10);
  });
});

describe('lagStep', () => {
  it('τ=500, dt=10: y=0, target=100 → 100·(1−e^(−0.02)) ≈ 1.9801327', () => {
    expect(lagStep(0, 100, 10, 500)).toBeCloseTo(1.9801326693244747, 10);
  });

  it('τ=0: bám ngay', () => {
    expect(lagStep(5, 100, 10, 0)).toBe(100);
  });

  it('hội tụ về target sau nhiều bước', () => {
    let y = 0;
    for (let i = 0; i < 500; i++) y = lagStep(y, 100, 10, 500);
    expect(y).toBeGreaterThan(99.9);
    expect(y).toBeLessThanOrEqual(100);
  });
});

describe('rateLimitStep', () => {
  it('tăng: giới hạn 1/ms, dt=10 → +10', () => {
    expect(rateLimitStep(0, 100, 10, 1, 1)).toBe(10);
  });

  it('giảm: giới hạn 2/ms, dt=10 → −20', () => {
    expect(rateLimitStep(50, 0, 10, 1, 2)).toBe(30);
  });

  it('trong giới hạn: tới target luôn', () => {
    expect(rateLimitStep(0, 5, 10, 1, 1)).toBe(5);
  });

  it('tốc độ 0 một chiều = không giới hạn chiều đó', () => {
    expect(rateLimitStep(0, 100, 10, 0, 1)).toBe(100);
    expect(rateLimitStep(50, 0, 10, 1, 0)).toBe(0);
  });
});

describe('hysteresisStep', () => {
  it('bật ở onAt, tắt ở offAt, giữa giữ nguyên', () => {
    expect(hysteresisStep(false, 5, 10, 2)).toBe(false);
    expect(hysteresisStep(false, 10, 10, 2)).toBe(true);
    expect(hysteresisStep(true, 5, 10, 2)).toBe(true);
    expect(hysteresisStep(true, 2, 10, 2)).toBe(false);
    expect(hysteresisStep(false, 5, 10, 2)).toBe(false);
  });
});

describe('onDelayStep / offDelayStep', () => {
  it('on-delay 25ms, dt=10: true ở bước thứ 3', () => {
    const s: DelayTimerState = { elapsedMs: 0 };
    expect(onDelayStep(s, true, 10, 25)).toBe(false);
    expect(onDelayStep(s, true, 10, 25)).toBe(false);
    expect(onDelayStep(s, true, 10, 25)).toBe(true);
    expect(onDelayStep(s, true, 10, 25)).toBe(true);
  });

  it('on-delay reset khi input false', () => {
    const s: DelayTimerState = { elapsedMs: 0 };
    onDelayStep(s, true, 10, 25);
    onDelayStep(s, true, 10, 25);
    expect(onDelayStep(s, false, 10, 25)).toBe(false);
    expect(onDelayStep(s, true, 10, 25)).toBe(false);
  });

  it('off-delay 25ms, dt=10: vẫn true 2 bước sau khi input false', () => {
    const s: DelayTimerState = { elapsedMs: 0 };
    expect(offDelayStep(s, true, 10, 25)).toBe(true);
    expect(offDelayStep(s, false, 10, 25)).toBe(true);
    expect(offDelayStep(s, false, 10, 25)).toBe(true);
    expect(offDelayStep(s, false, 10, 25)).toBe(false);
  });

  it('delay 0: bám input ngay', () => {
    const s: DelayTimerState = { elapsedMs: 0 };
    expect(onDelayStep(s, true, 10, 0)).toBe(true);
    expect(offDelayStep(s, false, 10, 0)).toBe(false);
  });
});
