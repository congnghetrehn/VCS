// Test Pacer (M0 §6.4, §12.1: ≥ 10).
// Golden T7 theo STATE.md §11 (công thức OQ-022), đồng hồ giả.
import { describe, expect, it } from 'vitest';
import { Pacer } from './index.js';

function fakeNow(): { now: () => number; set: (ms: number) => void } {
  let wall = 0;
  return {
    now: () => wall,
    set: (ms: number) => {
      wall = ms;
    },
  };
}

describe('Pacer — công thức plan() (OQ-022, T7)', () => {
  it('1×: start rồi plan ngay → 0 bước; @wall 100 → 10 bước', () => {
    const clock = fakeNow();
    const pacer = new Pacer(clock.now, { timeScale: 1 });
    pacer.start(0);
    expect(pacer.plan(0, 10)).toEqual({ steps: 0, lagging: false, achievedScale: 0 });
    clock.set(100);
    expect(pacer.plan(0, 10)).toEqual({ steps: 10, lagging: false, achievedScale: 0 });
  });

  it('1×: đã chạy 10 bước, plan(100) @wall 100 → 0 bước, achievedScale 1', () => {
    const clock = fakeNow();
    const pacer = new Pacer(clock.now, { timeScale: 1 });
    pacer.start(0);
    clock.set(100);
    expect(pacer.plan(100, 10)).toEqual({ steps: 0, lagging: false, achievedScale: 1 });
  });

  it('10×: plan(0) @wall 100 → 100 bước (due 1000 = maxLagMs, chưa lag)', () => {
    const clock = fakeNow();
    const pacer = new Pacer(clock.now, { timeScale: 10 });
    pacer.start(0);
    clock.set(100);
    expect(pacer.plan(0, 10)).toEqual({ steps: 100, lagging: false, achievedScale: 0 });
  });

  it('10×: đã chạy 100 bước, plan(1000) @wall 150 → 50 bước, achievedScale ≈ 6.67', () => {
    const clock = fakeNow();
    const pacer = new Pacer(clock.now, { timeScale: 10 });
    pacer.start(0);
    clock.set(150);
    const r = pacer.plan(1000, 10);
    expect(r.steps).toBe(50);
    expect(r.lagging).toBe(false);
    expect(r.achievedScale).toBeCloseTo(1000 / 150, 10);
  });

  it('tụt quá maxLagMs → lagging, đặt lại mốc; sau đó plan lại đúng', () => {
    const clock = fakeNow();
    const pacer = new Pacer(clock.now, { timeScale: 1 });
    pacer.start(0);
    clock.set(2000);
    expect(pacer.plan(0, 10)).toEqual({ steps: 0, lagging: true, achievedScale: 0 });
    clock.set(2100);
    expect(pacer.plan(0, 10)).toEqual({ steps: 10, lagging: false, achievedScale: 0 });
  });

  it("timeScale 'max' → steps vô cực, service tự cắt theo sliceBudgetMs", () => {
    const clock = fakeNow();
    const pacer = new Pacer(clock.now, { timeScale: 'max' });
    pacer.start(0);
    clock.set(50);
    const r = pacer.plan(0, 10);
    expect(r.steps).toBe(Number.POSITIVE_INFINITY);
    expect(r.lagging).toBe(false);
    expect(pacer.sliceBudgetMs).toBe(8);
  });

  it('pause → plan 0 bước; start lại đặt mốc mới', () => {
    const clock = fakeNow();
    const pacer = new Pacer(clock.now, { timeScale: 1 });
    pacer.start(0);
    pacer.pause();
    clock.set(500);
    expect(pacer.plan(0, 10)).toEqual({ steps: 0, lagging: false, achievedScale: 0 });
    clock.set(600);
    pacer.start(100); // T7: đặt lại mốc (wall 600, sim 100)
    clock.set(700);
    expect(pacer.plan(100, 10)).toEqual({ steps: 10, lagging: false, achievedScale: 0 });
  });

  it('chưa start → plan 0 bước', () => {
    const clock = fakeNow();
    const pacer = new Pacer(clock.now, { timeScale: 1 });
    clock.set(500);
    expect(pacer.plan(0, 10)).toEqual({ steps: 0, lagging: false, achievedScale: 0 });
  });

  it('setTimeScale đổi tốc độ; timeScale getter phản ánh', () => {
    const clock = fakeNow();
    const pacer = new Pacer(clock.now, { timeScale: 1 });
    pacer.start(0);
    pacer.setTimeScale(2);
    expect(pacer.timeScale).toBe(2);
    clock.set(100);
    expect(pacer.plan(0, 10).steps).toBe(20);
    pacer.setTimeScale('max');
    expect(pacer.plan(0, 10).steps).toBe(Number.POSITIVE_INFINITY);
  });

  it('tham số sai → RangeError (timeScale, stepMs)', () => {
    const clock = fakeNow();
    expect(() => {
      new Pacer(clock.now, { timeScale: 0 });
    }).toThrow(RangeError);
    expect(() => {
      new Pacer(clock.now, { timeScale: -2 });
    }).toThrow(RangeError);
    const pacer = new Pacer(clock.now, { timeScale: 1 });
    pacer.start(0);
    expect(() => {
      pacer.plan(0, 0);
    }).toThrow(RangeError);
    expect(() => {
      pacer.plan(0, 2.5);
    }).toThrow(RangeError);
    expect(() => {
      pacer.setTimeScale(0);
    }).toThrow(RangeError);
  });

  it('maxLagMs tùy chỉnh: tụt 600 với maxLagMs 500 → lagging', () => {
    const clock = fakeNow();
    const pacer = new Pacer(clock.now, { timeScale: 1, maxLagMs: 500 });
    pacer.start(0);
    clock.set(600);
    expect(pacer.plan(0, 10).lagging).toBe(true);
  });

  it('elapsed âm (wall đi ngược) được kẹp về 0', () => {
    const clock = fakeNow();
    const pacer = new Pacer(clock.now, { timeScale: 1 });
    clock.set(100);
    pacer.start(0);
    clock.set(50);
    expect(pacer.plan(0, 10)).toEqual({ steps: 0, lagging: false, achievedScale: 0 });
  });
});
