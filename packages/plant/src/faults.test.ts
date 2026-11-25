// FaultManager (M2 §6, bảng B) — vòng đời lỗi + áp lỗi tín hiệu.

import { describe, expect, it } from 'vitest';

import type { FaultRequest } from '@vcs/schemas';

import { FaultManager, SIGNAL_FAULT_ORDER, type FaultManagerOptions } from './faults.js';
import { hashSeed, rngState } from './rng.js';

function makeManager(opts?: FaultManagerOptions): FaultManager {
  return new FaultManager({ stepMs: 10, initialValue: () => 42, ...opts });
}

/** Chèn lỗi signal 'now' tại T=0 rồi advance(0) → active ngay. */
function injectActive(
  m: FaultManager,
  target: FaultRequest['target'],
  params?: Record<string, unknown>,
  durationMs?: number,
): string {
  const req: FaultRequest = { target, when: { at: 'now' } };
  if (params !== undefined) req.params = params;
  if (durationMs !== undefined) req.durationMs = durationMs;
  const id = m.inject(req, 0);
  m.advance(0);
  return id;
}

const AI = { equipment: 'CR01_M01', signal: 'currentFb', type: 'offset' as const };

describe('inject / advance / clear', () => {
  it('id tăng F-0001, F-0002; ban đầu pending, sinceMs=0', () => {
    const m = makeManager();
    const id1 = m.inject({ target: { equipment: 'E1', fault: 'noStart' }, when: { at: 'now' } }, 100);
    const id2 = m.inject({ target: { equipment: 'E1', fault: 'noStart' }, when: { at: 'now' } }, 100);
    expect(id1).toBe('F-0001');
    expect(id2).toBe('F-0002');
    expect(m.list()[0]?.state).toBe('pending');
    expect(m.list()[0]?.sinceMs).toBe(0);
  });

  it("when 'now' → nowMs; 'after' → nowMs + afterMs; 'time' → tuyệt đối", () => {
    const m = makeManager();
    m.inject({ target: { equipment: 'E1', fault: 'a' }, when: { at: 'now' } }, 100);
    m.inject({ target: { equipment: 'E1', fault: 'b' }, when: { at: 'after', afterMs: 50 } }, 100);
    m.inject({ target: { equipment: 'E1', fault: 'c' }, when: { at: 'time', timeMs: 500 } }, 100);
    m.advance(149);
    expect(m.list().map((f) => f.state)).toEqual(['active', 'pending', 'pending']);
    m.advance(150);
    expect(m.list().map((f) => f.state)).toEqual(['active', 'active', 'pending']);
    m.advance(500);
    expect(m.list().map((f) => f.state)).toEqual(['active', 'active', 'active']);
  });

  it('hết duration → cleared, clearedAtMs = sinceMs + durationMs', () => {
    const m = makeManager();
    injectActive(m, { equipment: 'E1', fault: 'a' }, undefined, 100);
    m.advance(99);
    expect(m.list()[0]?.state).toBe('active');
    m.advance(100);
    expect(m.list()[0]?.state).toBe('cleared');
    expect(m.list()[0]?.clearedAtMs).toBe(100);
  });

  it('clear tay: active → cleared, trả true; lạ/trùng → false', () => {
    const m = makeManager();
    const id = injectActive(m, { equipment: 'E1', fault: 'a' });
    expect(m.clear('F-9999', 50)).toBe(false);
    expect(m.clear(id, 50)).toBe(true);
    expect(m.list()[0]?.clearedAtMs).toBe(50);
    expect(m.clear(id, 60)).toBe(false);
  });

  it('equipmentFault: chưa có → inactive; active → params + sinceMs; hết hạn → clearedAtMs', () => {
    const m = makeManager();
    expect(m.equipmentFault('E1', 'noStart')).toEqual({ active: false, params: {}, sinceMs: 0 });
    m.inject(
      { target: { equipment: 'E1', fault: 'noStart' }, when: { at: 'now' }, params: { x: 1 } },
      200,
    );
    m.advance(200);
    const f = m.equipmentFault('E1', 'noStart');
    expect(f.active).toBe(true);
    expect(f.sinceMs).toBe(200);
    expect(f.params).toEqual({ x: 1 });
    expect(f.clearedAtMs).toBeUndefined();
  });
});

describe('applyEmit — từng loại (bảng B)', () => {
  const rng = () => rngState(hashSeed(42, 'CR01_M01'));

  it('gain: 21 × 2 = 42', () => {
    const m = makeManager();
    injectActive(m, { ...AI, type: 'gain' }, { factor: 2 });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 21, 0, 10, rng())).toEqual({ value: 42 });
  });

  it('offset: 37 + 5 = 42', () => {
    const m = makeManager();
    injectActive(m, { ...AI, type: 'offset' }, { offset: 5 });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 37, 0, 10, rng())).toEqual({ value: 42 });
  });

  it('drift: 7200 eng/h × 1 s = +2.0 (bảng B)', () => {
    const m = makeManager();
    injectActive(m, { ...AI, type: 'drift' }, { ratePerHour: 7200 });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 40, 1000, 10, rng())).toEqual({ value: 42 });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 40, 500, 10, rng())).toEqual({ value: 41 });
  });

  it('noise: std=0 không đổi; std>0 tất định theo seed', () => {
    const m = makeManager();
    injectActive(m, { ...AI, type: 'noise' }, { std: 0 });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 40, 0, 10, rng())).toEqual({ value: 40 });
    const m2 = makeManager();
    injectActive(m2, { ...AI, type: 'noise' }, { std: 2 });
    const r1 = m2.applyEmit('CR01_M01', 'currentFb', 'AI', 40, 0, 10, rngState(123));
    const m3 = makeManager();
    injectActive(m3, { ...AI, type: 'noise' }, { std: 2 });
    const r2 = m3.applyEmit('CR01_M01', 'currentFb', 'AI', 40, 0, 10, rngState(123));
    expect(r1).toEqual(r2);
    expect(r1).not.toEqual({ value: 40 });
  });

  it('spike: cộng magnitude trong durationMs, mặc định 1 bước', () => {
    const m = makeManager();
    injectActive(m, { ...AI, type: 'spike' }, { magnitude: 10 });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 40, 0, 10, rng())).toEqual({ value: 50 });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 40, 10, 10, rng())).toEqual({ value: 40 });
    const m2 = makeManager();
    injectActive(m2, { ...AI, type: 'spike' }, { magnitude: 10, durationMs: 25 });
    expect(m2.applyEmit('CR01_M01', 'currentFb', 'AI', 40, 20, 10, rng())).toEqual({ value: 50 });
    expect(m2.applyEmit('CR01_M01', 'currentFb', 'AI', 40, 30, 10, rng())).toEqual({ value: 40 });
  });

  it('stuck: giữ params.value bất kể input', () => {
    const m = makeManager();
    injectActive(m, { ...AI, type: 'stuck' }, { value: 99 });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 40, 0, 10, rng())).toEqual({ value: 99 });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 0, 0, 10, rng())).toEqual({ value: 99 });
  });

  it('freeze: giữ giá trị tại lúc bật (từ initialValue)', () => {
    const m = makeManager();
    injectActive(m, { ...AI, type: 'freeze' });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 100, 0, 10, rng())).toEqual({ value: 42 });
  });

  it('invert: bool đảo', () => {
    const m = makeManager();
    injectActive(m, { equipment: 'CR01_M01', signal: 'runFb', type: 'invert' });
    expect(m.applyEmit('CR01_M01', 'runFb', 'DI', true, 0, 10, rng())).toEqual({ value: false });
    expect(m.applyEmit('CR01_M01', 'runFb', 'DI', false, 0, 10, rng())).toEqual({ value: true });
  });

  it('chatter: đảo theo chu kỳ periodMs (lẻ đảo, chẵn giữ)', () => {
    const m = makeManager();
    injectActive(m, { equipment: 'CR01_M01', signal: 'runFb', type: 'chatter' }, { periodMs: 100 });
    const r = rng();
    expect(m.applyEmit('CR01_M01', 'runFb', 'DI', true, 0, 10, r)).toEqual({ value: true });
    expect(m.applyEmit('CR01_M01', 'runFb', 'DI', true, 150, 10, r)).toEqual({ value: false });
    expect(m.applyEmit('CR01_M01', 'runFb', 'DI', true, 250, 10, r)).toEqual({ value: true });
  });

  it('delay: n=round(25/10)=3 — đổi ở T=0, thấy ở T=30 (bảng B)', () => {
    const m = new FaultManager({ stepMs: 10, initialValue: () => 0 });
    injectActive(m, { ...AI, type: 'delay' }, { delayMs: 25 });
    const r = rng();
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 67, 0, 10, r)).toEqual({ value: 0 });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 67, 10, 10, r)).toEqual({ value: 0 });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 67, 20, 10, r)).toEqual({ value: 0 });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 67, 30, 10, r)).toEqual({ value: 67 });
  });

  it('outOfRange: rawOverride = params.raw', () => {
    const m = makeManager();
    injectActive(m, { ...AI, type: 'outOfRange' }, { raw: 30000 });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 40, 0, 10, rng())).toEqual({ rawOverride: 30000 });
  });

  it('wireBreak: AI → rawOverride 32767 (mặc định); DI → false', () => {
    const m = makeManager();
    injectActive(m, { ...AI, type: 'wireBreak' });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 40, 0, 10, rng())).toEqual({ rawOverride: 32767 });
    injectActive(m, { equipment: 'CR01_M01', signal: 'runFb', type: 'wireBreak' });
    expect(m.applyEmit('CR01_M01', 'runFb', 'DI', true, 0, 10, rng())).toEqual({ value: false });
  });

  it('wireBreakRaw tùy chỉnh', () => {
    const m = makeManager({ wireBreakRaw: 32000 });
    injectActive(m, { ...AI, type: 'wireBreak' });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 40, 0, 10, rng())).toEqual({ rawOverride: 32000 });
  });

  it('lost/stuckCmd phía emit bị bỏ qua', () => {
    const m = makeManager();
    injectActive(m, { equipment: 'CR01_M01', signal: 'runFb', type: 'lost' });
    expect(m.applyEmit('CR01_M01', 'runFb', 'DI', true, 0, 10, rng())).toEqual({ value: true });
  });

  it('thứ tự §6.2: delay(0) → gain(1) → offset(2): (10×2)+5=25', () => {
    const m = new FaultManager({ stepMs: 10, initialValue: () => 0 });
    // Chèn offset trước, gain sau, delay sau cùng — thứ tự áp dụng vẫn theo bảng.
    injectActive(m, { ...AI, type: 'offset' }, { offset: 5 });
    injectActive(m, { ...AI, type: 'gain' }, { factor: 2 });
    injectActive(m, { ...AI, type: 'delay' }, { delayMs: 0 });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 10, 0, 10, rng())).toEqual({ value: 25 });
  });

  it('terminal thắng: wireBreak thắng stuck; outOfRange thắng stuck (OQ-241)', () => {
    const m = makeManager();
    injectActive(m, { ...AI, type: 'stuck' }, { value: 99 });
    injectActive(m, { ...AI, type: 'wireBreak' });
    expect(m.applyEmit('CR01_M01', 'currentFb', 'AI', 40, 0, 10, rng())).toEqual({ rawOverride: 32767 });
    const m2 = makeManager();
    injectActive(m2, { ...AI, type: 'stuck' }, { value: 99 });
    injectActive(m2, { ...AI, type: 'outOfRange' }, { raw: 30000 });
    expect(m2.applyEmit('CR01_M01', 'currentFb', 'AI', 40, 0, 10, rng())).toEqual({ rawOverride: 30000 });
  });
});

describe('applyCmd', () => {
  it('lost → 0 (số) / false (bool)', () => {
    const m = makeManager();
    injectActive(m, { equipment: 'CR01_M01', signal: 'ao', type: 'lost' });
    expect(m.applyCmd('CR01_M01', 'ao', 'AO', 42)).toBe(0);
    injectActive(m, { equipment: 'CR01_M01', signal: 'do', type: 'lost' });
    expect(m.applyCmd('CR01_M01', 'do', 'DO', true)).toBe(false);
  });

  it('stuckCmd giữ params.value; lost thắng cuối', () => {
    const m = makeManager();
    injectActive(m, { equipment: 'CR01_M01', signal: 'ao', type: 'stuckCmd' }, { value: 7 });
    expect(m.applyCmd('CR01_M01', 'ao', 'AO', 42)).toBe(7);
    injectActive(m, { equipment: 'CR01_M01', signal: 'ao', type: 'lost' });
    expect(m.applyCmd('CR01_M01', 'ao', 'AO', 42)).toBe(0);
  });

  it('invert trên DO đảo; trên AO không đổi', () => {
    const m = makeManager();
    injectActive(m, { equipment: 'CR01_M01', signal: 'do', type: 'invert' });
    expect(m.applyCmd('CR01_M01', 'do', 'DO', true)).toBe(false);
    injectActive(m, { equipment: 'CR01_M01', signal: 'ao', type: 'invert' });
    expect(m.applyCmd('CR01_M01', 'ao', 'AO', 42)).toBe(42);
  });
});

describe('snapshot/restore', () => {
  it('khôi phục đúng trạng thái + tiếp tục id', () => {
    const m = makeManager();
    injectActive(m, { equipment: 'E1', fault: 'a' }, undefined, 1000);
    const snap = m.snapshot();
    m.advance(1000);
    expect(m.list()[0]?.state).toBe('cleared');
    m.restore(snap);
    expect(m.list()[0]?.state).toBe('active');
    expect(m.inject({ target: { equipment: 'E1', fault: 'b' }, when: { at: 'now' } }, 0)).toBe('F-0002');
  });

  it('snapshot không tương thích → throw SIM-E003', () => {
    const m = makeManager();
    expect(() => { m.restore({ version: 2, nextSeq: 1, records: [] }); }).toThrow('SIM-E003');
    expect(() => { m.restore(null); }).toThrow('SIM-E003');
    expect(() => { m.restore({}); }).toThrow('SIM-E003');
  });
});

describe('SIGNAL_FAULT_ORDER', () => {
  it('đủ 12 loại phía emit, delay đầu — wireBreak cuối', () => {
    expect(Object.keys(SIGNAL_FAULT_ORDER)).toHaveLength(12);
    expect(SIGNAL_FAULT_ORDER['delay']).toBe(0);
    expect(SIGNAL_FAULT_ORDER['wireBreak']).toBe(11);
  });
});
