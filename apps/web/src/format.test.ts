// Test formatSimTime — các ca trong plan STATE §13 (OQ-069).
import { describe, expect, it } from 'vitest';
import { formatSimTime } from './format.js';

describe('formatSimTime', () => {
  it.each([
    [0, '00:00.000'],
    [10, '00:00.010'],
    [1500, '00:01.500'],
    [60000, '01:00.000'],
    [61500, '01:01.500'],
    [3600000, '60:00.000'],
  ])('%d ms → %s', (ms, expected) => {
    expect(formatSimTime(ms)).toBe(expected);
  });
});
