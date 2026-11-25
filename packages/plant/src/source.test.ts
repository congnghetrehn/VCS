// Source resolve + topo sort (M2 §4.2, §6.3).

import { describe, expect, it } from 'vitest';

import type { SourceSpec } from '@vcs/schemas';

import { evalSource, topoSort } from './source.js';

const noObs = (): undefined => undefined;

describe('evalSource', () => {
  it('manual trả manualValue', () => {
    const spec: SourceSpec = { kind: 'manual' };
    expect(evalSource(spec, 100, 0, 42, noObs)).toBe(42);
    expect(evalSource(spec, 100, 0, true, noObs)).toBe(true);
  });

  it('const trả value (mặc định 0)', () => {
    expect(evalSource({ kind: 'const', value: 7 }, 0, 0, 0, noObs)).toBe(7);
    expect(evalSource({ kind: 'const' }, 0, 0, 0, noObs)).toBe(0);
  });

  it('ramp: tiến tuyến tính từ setAtMs, kẹp ở to', () => {
    const spec: SourceSpec = { kind: 'ramp', from: 0, to: 100, durationMs: 1000 };
    expect(evalSource(spec, 0, 0, 0, noObs)).toBe(0);
    expect(evalSource(spec, 500, 0, 0, noObs)).toBe(50);
    expect(evalSource(spec, 1000, 0, 0, noObs)).toBe(100);
    expect(evalSource(spec, 2000, 0, 0, noObs)).toBe(100);
  });

  it('ramp đo từ setAtMs (origin), không phải từ 0', () => {
    const spec: SourceSpec = { kind: 'ramp', from: 10, to: 20, durationMs: 100 };
    expect(evalSource(spec, 250, 200, 0, noObs)).toBe(15);
  });

  it('sine: offset + amplitude·sin(2π·(T−origin)/period)', () => {
    const spec: SourceSpec = { kind: 'sine', periodMs: 1000, amplitude: 10, offset: 50 };
    expect(evalSource(spec, 0, 0, 0, noObs)).toBe(50);
    expect(evalSource(spec, 250, 0, 0, noObs)).toBeCloseTo(60, 10);
    expect(evalSource(spec, 500, 0, 0, noObs)).toBeCloseTo(50, 10);
    expect(evalSource(spec, 750, 0, 0, noObs)).toBeCloseTo(40, 10);
    expect(evalSource(spec, 1000, 0, 0, noObs)).toBeCloseTo(50, 10);
  });

  it('link đọc observable của thiết bị khác', () => {
    const spec: SourceSpec = { kind: 'link', equipment: 'CR01_M01', observable: 'current' };
    const getObs = (eq: string, key: string): number | boolean | string | undefined =>
      eq === 'CR01_M01' && key === 'current' ? 42 : undefined;
    expect(evalSource(spec, 0, 0, 0, getObs)).toBe(42);
  });

  it('link scale/offset: eng = obs × scale + offset (OQ-249)', () => {
    const spec: SourceSpec = { kind: 'link', equipment: 'E', observable: 'x', scale: 2, offset: 10 };
    expect(evalSource(spec, 0, 0, 0, () => 5)).toBe(20);
    expect(evalSource({ kind: 'link', equipment: 'E', observable: 'x' }, 0, 0, 0, () => 5)).toBe(5);
    expect(evalSource({ kind: 'link', equipment: 'E', observable: 'x', scale: 2 }, 0, 0, 0, () => 5)).toBe(10);
  });

  it('link tới observable chưa có giá trị → 0', () => {
    const spec: SourceSpec = { kind: 'link', equipment: 'CR01_M01', observable: 'current' };
    expect(evalSource(spec, 0, 0, 0, noObs)).toBe(0);
  });

  it('link bool: trả bool nguyên', () => {
    const spec: SourceSpec = { kind: 'link', equipment: 'CR01_M01', observable: 'running' };
    expect(evalSource(spec, 0, 0, 0, () => true)).toBe(true);
  });
});

describe('topoSort', () => {
  it('không phụ thuộc: id tăng dần', () => {
    expect(topoSort(['B', 'A', 'C'], () => [])).toEqual({ order: ['A', 'B', 'C'] });
  });

  it('phụ thuộc đơn: B link A → A trước B', () => {
    const deps = (id: string): readonly string[] => (id === 'B' ? ['A'] : []);
    expect(topoSort(['B', 'A'], deps)).toEqual({ order: ['A', 'B'] });
  });

  it('chuỗi dài: C→B→A', () => {
    const deps = (id: string): readonly string[] =>
      id === 'C' ? ['B'] : id === 'B' ? ['A'] : [];
    expect(topoSort(['C', 'B', 'A'], deps)).toEqual({ order: ['A', 'B', 'C'] });
  });

  it('chu trình: trả cycle (các id còn lại, đã sắp xếp)', () => {
    const deps = (id: string): readonly string[] => (id === 'A' ? ['B'] : ['A']);
    const r = topoSort(['A', 'B'], deps);
    expect(r.order).toEqual([]);
    expect(r.cycle).toEqual(['A', 'B']);
  });

  it('chu trình một phần: nút độc lập vẫn ra trước', () => {
    const deps = (id: string): readonly string[] =>
      id === 'A' ? ['B'] : id === 'B' ? ['A'] : [];
    const r = topoSort(['A', 'B', 'Z'], deps);
    expect(r.order).toEqual(['Z']);
    expect(r.cycle).toEqual(['A', 'B']);
  });

  it('phụ thuộc treo (ngoài tập id) → coi như chu trình', () => {
    const r = topoSort(['A'], () => ['MISSING']);
    expect(r.order).toEqual([]);
    expect(r.cycle).toEqual(['A']);
  });
});
