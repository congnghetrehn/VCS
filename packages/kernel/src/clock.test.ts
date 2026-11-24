// Test ManualClock (M0 §6.1, §12.1: ≥ 6).
import { describe, expect, it } from 'vitest';
import { ManualClock } from './index.js';

describe('ManualClock — bắt đầu ở 0', () => {
  it('nowMs() ban đầu là 0', () => {
    expect(new ManualClock().nowMs()).toBe(0);
  });

  it('advance cộng dồn thời gian', () => {
    const clock = new ManualClock();
    clock.advance(10);
    clock.advance(5);
    expect(clock.nowMs()).toBe(15);
  });

  it.each([
    ['0', 0],
    ['âm', -1],
    ['không nguyên', 1.5],
    ['NaN', Number.NaN],
  ])('advance(%s) ném RangeError', (_label, dt) => {
    expect(() => {
      new ManualClock().advance(dt);
    }).toThrow(RangeError);
  });

  it('reset() về 0, reset(ms) đặt thời gian mới', () => {
    const clock = new ManualClock();
    clock.advance(40);
    clock.reset();
    expect(clock.nowMs()).toBe(0);
    clock.reset(100);
    expect(clock.nowMs()).toBe(100);
  });

  it.each([
    ['âm', -1],
    ['không nguyên', 2.5],
  ])('reset(%s) ném RangeError', (_label, ms) => {
    expect(() => {
      new ManualClock().reset(ms);
    }).toThrow(RangeError);
  });

  it('snapshot/restore là vòng tròn, restore kiểm tra giá trị', () => {
    const clock = new ManualClock();
    clock.advance(40);
    const snap = clock.snapshot();
    clock.advance(20);
    expect(clock.nowMs()).toBe(60);
    clock.restore(snap);
    expect(clock.nowMs()).toBe(40);
  });

  it.each([
    ['âm', -1],
    ['không nguyên', 0.5],
  ])('restore(%s) ném RangeError', (_label, ms) => {
    expect(() => {
      new ManualClock().restore(ms);
    }).toThrow(RangeError);
  });

  it('snapshot trả số nguyên, không phụ thuộc clock sau đó', () => {
    const clock = new ManualClock();
    clock.advance(7);
    const snap = clock.snapshot();
    clock.advance(3);
    expect(snap).toBe(7);
    expect(clock.nowMs()).toBe(10);
  });
});
