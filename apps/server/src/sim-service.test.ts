// Test SimulationService — @vcs/server (M0 §8.2; S1 §12).
// Đồng hồ wall giả cho Pacer; chạy lát bằng runSlice() đồng bộ.

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSimulation, type SimulationBundle, type SimulationExtension } from '@vcs/kernel';
import { demoExtension } from '@vcs/kernel/demo';
import { loadProject, nodeFS } from '@vcs/project';
import type { Diagnostic } from '@vcs/schemas';
import { SimulationService } from './sim-service.js';

const DIR = join(fileURLToPath(new URL('../../..', import.meta.url)), 'examples', 'hello-tags');

async function makeBundle(extensions?: SimulationExtension[]): Promise<SimulationBundle> {
  const model = await loadProject(nodeFS(DIR));
  return createSimulation(model, {
    extensions: extensions ?? [demoExtension],
    errorPolicy: 'isolate',
  });
}

/** Controller trả Promise trong step() đồng bộ → SIM-E002 (OQ-052). */
const asyncControllerExt: SimulationExtension = {
  id: 'test-async',
  apply(ctx) {
    ctx.registerController('builtin:demo', () => ({
      kind: 'builtin' as const,
      id: 'PLC1',
      init: () => Promise.resolve(),
      step: () => Promise.resolve(),
      reset: () => undefined,
      snapshot: () => ({}),
      restore: () => undefined,
      getDiagnostics: () => ({ state: 'RUN', scanCount: 0, lastScanSimMs: 0, faults: [] }),
    }));
  },
};

describe('SimulationService — trạng thái và snapshot', () => {
  it('ban đầu IDLE, snapshot 12 defs đúng thứ tự khai báo (OQ-033/034)', async () => {
    const bundle = await makeBundle();
    const service = new SimulationService(bundle, { now: () => 0 });
    try {
      expect(service.simState()).toEqual({
        state: 'IDLE',
        simTimeMs: 0,
        stepCount: 0,
        timeScale: 1,
        lagging: false,
        achievedScale: 0,
      });
      expect(service.snapshotProject()).toEqual({
        name: 'Hello Tags',
        language: 'vi',
        stepMs: 10,
      });
      const snap = service.snapshot();
      expect(snap.defs.map((d) => d.name)).toEqual([
        'BTN_START',
        'SW_AUTO',
        'PT01',
        'LAMP_RUN',
        'LAMP_AUTO',
        'LAMP_HEARTBEAT',
        'SCAN_CNT',
        'M_FLAG',
        'M_CNT',
        'M_ALARM',
        'DB1_VAL',
        'DB1_FLAG',
      ]);
      expect(snap.values).toEqual([false, false, 0, false, false, false, 0, false, 0, false, 0, false]);
      expect(snap.simTimeMs).toBe(0);
      // M/DB: owner 'controller', không ghi được (OQ-033).
      expect(snap.defs[7]).toMatchObject({ owner: 'controller', writable: false });
      // DI free: ghi được; DO controller: không.
      expect(snap.defs[0]).toMatchObject({ owner: 'free', writable: true });
      expect(snap.defs[3]).toMatchObject({ owner: 'controller', writable: false });
    } finally {
      service.stop();
    }
  });

  it('run/pause + lát theo Pacer (S1 dòng 3–4): 100 ms wall → 10 bước, achievedScale 1', async () => {
    const bundle = await makeBundle();
    let nowMs = 0;
    const service = new SimulationService(bundle, { now: () => nowMs });
    try {
      service.run();
      expect(service.state).toBe('RUNNING');
      nowMs = 100;
      service.runSlice();
      expect(service.simTimeMs).toBe(100);
      expect(service.stepCount).toBe(10);
      expect(service.simState()).toMatchObject({
        state: 'RUNNING',
        simTimeMs: 100,
        stepCount: 10,
        timeScale: 1,
        lagging: false,
        achievedScale: 1,
      });
      // Delta gom LWW: LAMP_AUTO F→T (idx 4), SCAN_CNT 0→10 (idx 6).
      expect(service.drainDelta()).toEqual([
        [4, true],
        [6, 10],
      ]);
      expect(service.drainDelta()).toEqual([]);
      service.pause();
      expect(service.state).toBe('PAUSED');
      nowMs = 500;
      service.runSlice();
      expect(service.stepCount).toBe(10);
    } finally {
      service.stop();
    }
  });

  it('step(n) khi PAUSED chạy ngay; khi RUNNING → WS-E002 (OQ-040)', async () => {
    const bundle = await makeBundle();
    const service = new SimulationService(bundle, { now: () => 0 });
    try {
      expect(service.step(3)).toEqual({ ok: true });
      expect(service.stepCount).toBe(3);
      expect(service.simTimeMs).toBe(30);
      service.run();
      expect(service.step(1)).toMatchObject({ ok: false, code: 'WS-E002' });
      expect(service.state).toBe('RUNNING');
      service.pause();
      expect(service.step(2).ok).toBe(true);
      expect(service.stepCount).toBe(5);
    } finally {
      service.stop();
    }
  });

  it('reset về IDLE/0 + xóa delta (OQ-035)', async () => {
    const bundle = await makeBundle();
    const service = new SimulationService(bundle, { now: () => 0 });
    try {
      service.step(5);
      expect(service.drainDelta().length).toBeGreaterThan(0);
      service.reset();
      expect(service.simState()).toEqual({
        state: 'IDLE',
        simTimeMs: 0,
        stepCount: 0,
        timeScale: 1,
        lagging: false,
        achievedScale: 0,
      });
      expect(service.snapshot().values).toEqual([
        false, false, 0, false, false, false, 0, false, 0, false, 0, false,
      ]);
      expect(service.drainDelta()).toEqual([]);
    } finally {
      service.stop();
    }
  });

  it('setTimeScale: số hợp lệ / max ok; 0/âm/NaN → WS-E003, giữ giá trị cũ', async () => {
    const bundle = await makeBundle();
    const service = new SimulationService(bundle, { now: () => 0 });
    try {
      expect(service.setTimeScale(2)).toEqual({ ok: true });
      expect(service.timeScale).toBe(2);
      expect(service.setTimeScale(0)).toMatchObject({ ok: false, code: 'WS-E003' });
      expect(service.timeScale).toBe(2);
      expect(service.setTimeScale(-1)).toMatchObject({ ok: false, code: 'WS-E003' });
      expect(service.setTimeScale(Number.NaN)).toMatchObject({ ok: false, code: 'WS-E003' });
      expect(service.setTimeScale('max')).toEqual({ ok: true });
      expect(service.timeScale).toBe('max');
    } finally {
      service.stop();
    }
  });

  it("timeScale 'max': lát chạy tới hết ngân sách 8 ms (không lặp vô hạn)", async () => {
    const bundle = await makeBundle();
    const nowMs = 0;
    const service = new SimulationService(bundle, { now: () => nowMs });
    try {
      service.run();
      service.setTimeScale('max');
      service.runSlice();
      expect(service.stepCount).toBeGreaterThan(100);
      expect(service.state).toBe('RUNNING');
    } finally {
      service.stop();
    }
  });

  it('lagging khi Pacer tụt quá maxLagMs (fake clock nhảy 2000 ms)', async () => {
    const bundle = await makeBundle();
    let nowMs = 0;
    const service = new SimulationService(bundle, { now: () => nowMs });
    try {
      service.run();
      nowMs = 2000;
      service.runSlice();
      expect(service.lagging).toBe(true);
      expect(service.stepCount).toBe(0);
      // Lát sau: mốc đã đặt lại, không còn lagging, vẫn chưa chạy (chưa đủ giờ).
      service.runSlice();
      expect(service.lagging).toBe(false);
    } finally {
      service.stop();
    }
  });
});

describe('SimulationService — tag.write', () => {
  it('ghi tag free khi dừng: hiệu lực ngay + delta (D4)', async () => {
    const bundle = await makeBundle();
    const service = new SimulationService(bundle, { now: () => 0 });
    try {
      expect(service.tagWrite('BTN_START', true)).toEqual({ ok: true });
      expect(bundle.tags.read('BTN_START').value).toBe(true);
      expect(service.drainDelta()).toEqual([[0, true]]);
      expect(service.tagWrite('PT01', 5)).toEqual({ ok: true });
      expect(service.drainDelta()).toEqual([[2, 5]]);
    } finally {
      service.stop();
    }
  });

  it('ghi khi RUNNING: post, hiệu lực ở drain bước kế (S1 dòng 5)', async () => {
    const bundle = await makeBundle();
    let nowMs = 0;
    const service = new SimulationService(bundle, { now: () => nowMs });
    try {
      service.run();
      expect(service.tagWrite('BTN_START', true)).toEqual({ ok: true });
      expect(bundle.tags.read('BTN_START').value).toBe(false);
      nowMs = 100;
      service.runSlice();
      expect(bundle.tags.read('BTN_START').value).toBe(true);
      // Loopback cùng bước: LAMP_RUN F→T.
      expect(bundle.tags.read('LAMP_RUN').value).toBe(true);
    } finally {
      service.stop();
    }
  });

  it('ghi tag controller → TAG-E002; tên lạ/M/DB → TAG-E003', async () => {
    const bundle = await makeBundle();
    const service = new SimulationService(bundle, { now: () => 0 });
    try {
      expect(service.tagWrite('LAMP_RUN', false)).toMatchObject({ ok: false, code: 'TAG-E002' });
      expect(service.tagWrite('SCAN_CNT', 1)).toMatchObject({ ok: false, code: 'TAG-E002' });
      expect(service.tagWrite('NOPE', true)).toMatchObject({ ok: false, code: 'TAG-E003' });
      expect(service.tagWrite('M_FLAG', true)).toMatchObject({ ok: false, code: 'TAG-E003' });
      expect(service.tagWrite('DB1_VAL', 1)).toMatchObject({ ok: false, code: 'TAG-E003' });
    } finally {
      service.stop();
    }
  });
});

describe('SimulationService — lỗi trong lát (OQ-052)', () => {
  it('stepOnce ném SIM-E002 → pause + diagnostics, server vẫn chạy', async () => {
    const bundle = await makeBundle([demoExtension, asyncControllerExt]);
    const diagnostics: Diagnostic[] = [];
    const states: string[] = [];
    let nowMs = 0;
    const service = new SimulationService(bundle, {
      now: () => nowMs,
      onDiagnostic: (d) => {
        diagnostics.push(d);
      },
      onState: (s) => {
        states.push(s.state);
      },
    });
    try {
      service.run();
      // Đồng hồ giả phải tiến thì plan() mới cho bước chạy (plan ở 0 → 0 bước).
      nowMs = 100;
      service.runSlice();
      expect(service.state).toBe('PAUSED');
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0]?.code).toBe('SIM-E002');
      expect(states).toContain('PAUSED');
      // Sau lỗi vẫn reset/run lại được.
      service.reset();
      expect(service.state).toBe('IDLE');
    } finally {
      service.stop();
    }
  });
});

describe('SimulationService — sim.state.locked? (P0.8, B4)', () => {
  it('simState() không chứa key locked (P0.8 không phát; P4.1 sẽ sửa test này)', async () => {
    const bundle = await makeBundle();
    const service = new SimulationService(bundle, { now: () => 0 });
    try {
      expect('locked' in service.simState()).toBe(false);
    } finally {
      service.stop();
    }
  });
});
