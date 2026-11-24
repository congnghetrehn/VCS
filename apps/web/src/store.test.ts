// Test store — snapshot, delta LWW, lọc, flash (plan STATE §13, OQ-070).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FLASH_MS,
  selectFilteredIndices,
  useSimStore,
  type DeltaMessage,
  type SnapshotMessage,
} from './store.js';

function snapshotMsg(): SnapshotMessage {
  const def = (
    name: string,
    type: 'Bool' | 'Int',
    area: 'I' | 'Q' | 'M' | 'DB',
    address: string,
    owner: 'free' | 'controller',
  ) => ({
    name,
    type,
    area,
    address,
    controller: 'PLC1',
    owner,
    writable: owner === 'free',
  });
  return {
    type: 'tags.snapshot',
    defs: [
      def('BTN_START', 'Bool', 'I', '%I0.0', 'free'),
      def('SW_AUTO', 'Bool', 'I', '%I0.1', 'free'),
      def('PT01', 'Int', 'I', '%IW64', 'free'),
      def('LAMP_RUN', 'Bool', 'Q', '%Q0.0', 'controller'),
      def('LAMP_AUTO', 'Bool', 'Q', '%Q0.1', 'controller'),
      def('LAMP_HEARTBEAT', 'Bool', 'Q', '%Q0.2', 'controller'),
      def('SCAN_CNT', 'Int', 'Q', '%QW64', 'controller'),
      def('M_FLAG', 'Bool', 'M', '%M0.0', 'controller'),
      def('M_CNT', 'Int', 'M', '%MW2', 'controller'),
      def('M_ALARM', 'Bool', 'M', '%M0.1', 'controller'),
      def('DB1_VAL', 'Int', 'DB', 'DB1.DBW0', 'controller'),
      def('DB1_FLAG', 'Bool', 'DB', 'DB1.DBX0.0', 'controller'),
    ],
    values: [false, false, 0, false, false, false, 0, false, 0, false, 0, false],
    simTimeMs: 0,
  };
}

beforeEach(() => {
  useSimStore.getState().applySnapshot(snapshotMsg());
  useSimStore.getState().setFilter({ query: '', controller: 'all', area: 'all' });
});

describe('store', () => {
  it('applySnapshot: 12 defs + giá trị ban đầu', () => {
    const s = useSimStore.getState();
    expect(s.defs).toHaveLength(12);
    expect(s.defs[0]?.name).toBe('BTN_START');
    expect(s.values.get(0)).toBe(false);
    expect(s.values.get(6)).toBe(0);
  });

  it('applyDelta LWW: SCAN_CNT 1..10 → 10, changed ghi lại', () => {
    const s = useSimStore.getState();
    for (let v = 1; v <= 10; v += 1) {
      const delta: DeltaMessage = { type: 'tags.delta', simTimeMs: v * 10, changes: [[6, v]] };
      s.applyDelta(delta);
    }
    expect(useSimStore.getState().values.get(6)).toBe(10);
    expect(useSimStore.getState().changed.has(6)).toBe(true);
  });

  it('lọc tên substring không phân biệt hoa/thường', () => {
    const s = useSimStore.getState();
    s.setFilter({ query: 'lamp' });
    const idx = selectFilteredIndices(useSimStore.getState());
    expect(idx.map((i) => useSimStore.getState().defs[i]?.name)).toEqual([
      'LAMP_RUN',
      'LAMP_AUTO',
      'LAMP_HEARTBEAT',
    ]);
  });

  it('lọc controller + vùng kết hợp AND', () => {
    const s = useSimStore.getState();
    s.setFilter({ controller: 'PLC1', area: 'Q' });
    const idx = selectFilteredIndices(useSimStore.getState());
    expect(idx.map((i) => useSimStore.getState().defs[i]?.name)).toEqual([
      'LAMP_RUN',
      'LAMP_AUTO',
      'LAMP_HEARTBEAT',
      'SCAN_CNT',
    ]);
    s.setFilter({ area: 'I' });
    const idxI = selectFilteredIndices(useSimStore.getState());
    expect(idxI.map((i) => useSimStore.getState().defs[i]?.name)).toEqual([
      'BTN_START',
      'SW_AUTO',
      'PT01',
    ]);
  });

  it('changed tự xóa sau FLASH_MS', () => {
    vi.useFakeTimers();
    try {
      const s = useSimStore.getState();
      s.applyDelta({ type: 'tags.delta', simTimeMs: 10, changes: [[0, true]] });
      expect(useSimStore.getState().changed.has(0)).toBe(true);
      vi.advanceTimersByTime(FLASH_MS - 1);
      expect(useSimStore.getState().changed.has(0)).toBe(true);
      vi.advanceTimersByTime(1);
      expect(useSimStore.getState().changed.has(0)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
