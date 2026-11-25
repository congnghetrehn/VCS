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

describe('store PLC (P1.7)', () => {
  beforeEach(() => {
    const s = useSimStore.getState();
    s.setPlcFiles([]);
    s.setPlcWatch([]);
    s.setPlcDiagnostics([]);
  });

  it('setPlcFiles + openPlcFile: danh sách + file hiện tại, dirty false', () => {
    const s = useSimStore.getState();
    s.setPlcFiles(['FB_Motor.scl', 'OB1.scl']);
    expect(useSimStore.getState().plcFiles).toEqual(['FB_Motor.scl', 'OB1.scl']);
    s.openPlcFile('OB1.scl', 'BEGIN\nEND_ORGANIZATION_BLOCK\n');
    const s2 = useSimStore.getState();
    expect(s2.plcCurrentPath).toBe('OB1.scl');
    expect(s2.plcCurrentContent).toContain('BEGIN');
    expect(s2.plcDirty).toBe(false);
  });

  it('setPlcContent: sửa → dirty true; gõ lại đúng nội dung đã lưu → dirty false', () => {
    const s = useSimStore.getState();
    s.openPlcFile('OB1.scl', 'A');
    s.setPlcContent('AB');
    expect(useSimStore.getState().plcDirty).toBe(true);
    s.setPlcContent('A');
    expect(useSimStore.getState().plcDirty).toBe(false);
  });

  it('markPlcSaved: dirty false, nội dung đã lưu cập nhật', () => {
    const s = useSimStore.getState();
    s.openPlcFile('OB1.scl', 'A');
    s.setPlcContent('AB');
    s.markPlcSaved();
    const s2 = useSimStore.getState();
    expect(s2.plcDirty).toBe(false);
    s2.setPlcContent('AB');
    expect(useSimStore.getState().plcDirty).toBe(false);
  });

  it('setPlcWatch reset values; applyPlcValues merge theo chỉ số', () => {
    const s = useSimStore.getState();
    s.setPlcWatch(['RUN_CMD', 'FAULT_LAMP']);
    s.applyPlcValues({ type: 'plc.values', simTimeMs: 100, values: [[0, true]] });
    expect(useSimStore.getState().plcWatchValues.get(0)).toBe(true);
    expect(useSimStore.getState().plcWatchValues.get(1)).toBeUndefined();
    s.applyPlcValues({ type: 'plc.values', simTimeMs: 200, values: [[1, true]] });
    expect(useSimStore.getState().plcWatchValues.get(0)).toBe(true);
    expect(useSimStore.getState().plcWatchValues.get(1)).toBe(true);
    // Đổi danh sách watch → values reset.
    s.setPlcWatch(['RUN_CMD']);
    expect(useSimStore.getState().plcWatchValues.size).toBe(0);
  });

  it('markPlcForced thêm/xóa ref', () => {
    const s = useSimStore.getState();
    s.markPlcForced('RUN_CMD', true);
    expect(useSimStore.getState().plcForced.has('RUN_CMD')).toBe(true);
    s.markPlcForced('RUN_CMD', false);
    expect(useSimStore.getState().plcForced.has('RUN_CMD')).toBe(false);
  });

  it('setPlcDiagnostics lưu danh sách build', () => {
    const s = useSimStore.getState();
    s.setPlcDiagnostics([{ code: 'SCL-T001', severity: 'error', message: 'x' }]);
    expect(useSimStore.getState().plcDiagnostics).toHaveLength(1);
    expect(useSimStore.getState().plcDiagnostics[0]?.code).toBe('SCL-T001');
  });
});
