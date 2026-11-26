// Test SimulationService — @vcs/server (M0 §8.2; S1 §12).
// Đồng hồ wall giả cho Pacer; chạy lát bằng runSlice() đồng bộ.

import { appendFile, cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSimulation, type SimulationBundle, type SimulationExtension } from '@vcs/kernel';
import { demoExtension } from '@vcs/kernel/demo';
import { plantExtension } from '@vcs/plant';
import { loadProject, nodeFS } from '@vcs/project';
import type { Diagnostic } from '@vcs/schemas';
import { SimulationService } from './sim-service.js';

const DIR = join(fileURLToPath(new URL('../../..', import.meta.url)), 'examples', 'hello-tags');
const MOTOR = join(fileURLToPath(new URL('../../..', import.meta.url)), 'examples', 'motor-interlock');

async function makeBundle(extensions?: SimulationExtension[]): Promise<SimulationBundle> {
  const model = await loadProject(nodeFS(DIR));
  return createSimulation(model, {
    extensions: extensions ?? [demoExtension],
    errorPolicy: 'isolate',
  });
}

/** Bundle chỉ với plant (không PLC) từ một thư mục project bất kỳ. */
async function makeBundleFrom(dir: string): Promise<SimulationBundle> {
  const model = await loadProject(nodeFS(dir));
  return createSimulation(model, {
    extensions: [plantExtension()],
    errorPolicy: 'isolate',
  });
}

/** Bundle motor-interlock chỉ với plant (không PLC) cho test plant/hash. */
async function makeMotorBundle(): Promise<SimulationBundle> {
  return makeBundleFrom(MOTOR);
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

/** sha256 hex của chuỗi rỗng — hash khi chưa có thay đổi tag nào. */
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('SimulationService — plant + hash (P2.4, OQ-318)', () => {
  it('hello-tags: plant() undefined, plantSnapshot() undefined, hash rỗng', async () => {
    const bundle = await makeBundle();
    const service = new SimulationService(bundle, { now: () => 0 });
    try {
      expect(service.plant()).toBeUndefined();
      expect(service.plantSnapshot()).toBeUndefined();
      expect(service.simHash()).toBe(EMPTY_SHA256);
    } finally {
      service.stop();
    }
  });

  it('motor-interlock: plantSnapshot() M01 motor_dol + faultDefs/presets/observables', async () => {
    const bundle = await makeMotorBundle();
    const service = new SimulationService(bundle, { now: () => 0 });
    try {
      expect(service.plant()).toBeDefined();
      const snap = service.plantSnapshot();
      expect(snap?.equipment).toHaveLength(1);
      const m01 = snap?.equipment[0];
      expect(m01?.id).toBe('M01');
      expect(m01?.model).toBe('motor_dol');
      expect(m01?.controller).toBe('PLC1');
      expect(m01?.faultDefs.map((f) => f.id)).toEqual([
        'overload',
        'failToStart',
        'contactorStuck',
        'notReady',
        'localMode',
      ]);
      expect(m01?.presets.map((p) => p.name)).toEqual([
        'noRunFeedback',
        'feedbackStuckOn',
        'overloadTrip',
        'commandLost',
      ]);
      // Obs chỉ có giá trị sau bước đầu (engine khởi tạo undefined).
      expect(m01?.observables).toEqual({});
      expect(m01?.faults).toEqual([]);
      // P2.8 (OQ-387): signals + roleValues raw (Bool → không eng).
      expect(m01?.signals).toEqual({ runCmd: 'RUN_CMD', runFb: 'RUN_FB', overloadOk: 'OVL_OK' });
      expect(m01?.roleValues['runCmd']).toEqual({ tag: 'RUN_CMD', raw: false });
      expect(m01?.roleValues['runFb']).toEqual({ tag: 'RUN_FB', raw: false });
      expect(m01?.roleValues['overloadOk']).toEqual({ tag: 'OVL_OK', raw: false });
      // P2.8 (OQ-389): events là mảng, ≤ 100 (chưa step → có thể rỗng).
      expect(Array.isArray(snap?.events)).toBe(true);
      expect((snap?.events ?? []).length).toBeLessThanOrEqual(100);
      expect(service.step(1).ok).toBe(true);
      expect(service.plantSnapshot()?.equipment[0]?.observables['state']).toBe('STOPPED');
    } finally {
      service.stop();
    }
  });

  it('plantSnapshot() roleValues eng (P2.8, OQ-387, Bảng 1): raw 13824 → eng 50.0; over-range 32511 → 117.6', async () => {
    // Project tạm: motor-interlock + 2 analog_sensor (AI có scaling, initial
    // 13824 và 32511). Chưa step — TagDB giữ initial từ tags.yaml.
    // (Trường hợp "không scaling → chỉ raw" không dựng được thành config
    // hợp lệ: engine validate PL-E012 và từ chối load khi role analog
    // không resolve được range — hành vi "chỉ raw" chỉ áp cho role Bool,
    // đã ghim ở test snapshot motor-interlock trên.)
    const dir = await mkdtemp(join(tmpdir(), 'vcs-p28-rolevalues-'));
    await cp(MOTOR, dir, { recursive: true });
    await appendFile(
      join(dir, 'tags', 'tags.yaml'),
      [
        '  - name: AI1',
        '    type: Int',
        '    area: I',
        '    address: "%IW10"',
        '    controller: PLC1',
        '    initial: 13824',
        '    signal:',
        '      kind: AI',
        '      scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: "%" }',
        '  - name: AI2',
        '    type: Int',
        '    area: I',
        '    address: "%IW12"',
        '    controller: PLC1',
        '    initial: 32511',
        '    signal:',
        '      kind: AI',
        '      scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: "%" }',
        '',
      ].join('\n'),
    );
    await appendFile(
      join(dir, 'plant', 'equipment.yaml'),
      [
        '- id: AI1_EQ',
        '  model: analog_sensor',
        '  signals:',
        '    raw: AI1',
        '  params:',
        '    engMin: 0',
        '    engMax: 100',
        "    unit: '%'",
        '- id: AI2_EQ',
        '  model: analog_sensor',
        '  signals:',
        '    raw: AI2',
        '  params:',
        '    engMin: 0',
        '    engMax: 100',
        "    unit: '%'",
        '',
      ].join('\n'),
    );
    const bundle = await makeBundleFrom(dir);
    const service = new SimulationService(bundle, { now: () => 0 });
    try {
      const snap = service.plantSnapshot();
      expect(snap?.equipment).toHaveLength(3);
      const byId = new Map((snap?.equipment ?? []).map((e) => [e.id, e]));
      // Bảng 1: raw 13824 (0..27648 → 0..100%) → eng 50.0.
      expect(byId.get('AI1_EQ')?.roleValues['raw']).toEqual({
        tag: 'AI1',
        raw: 13824,
        eng: 50,
        unit: '%',
      });
      // Over-range: raw 32511 → eng = 32511/27648×100 ≈ 117.589 (Bảng 1
      // ghi 117.6 là làm tròn 1 chữ số), không kẹp, kèm overRange.
      const ai2 = byId.get('AI2_EQ')?.roleValues['raw'];
      expect(ai2?.tag).toBe('AI2');
      expect(ai2?.raw).toBe(32511);
      expect(ai2?.eng).toBeCloseTo((32511 / 27648) * 100, 9);
      expect(ai2?.unit).toBe('%');
      expect(ai2?.overRange).toBe(true);
    } finally {
      service.stop();
    }
  });

  it('plantFaultInject overload → active; lỗi lạ → PL-E001', async () => {
    const bundle = await makeMotorBundle();
    const service = new SimulationService(bundle, { now: () => 0 });
    try {
      const ok = service.plantFaultInject({
        target: { equipment: 'M01', fault: 'overload' },
        when: { at: 'now' },
      });
      expect(ok).toEqual({ ok: true });
      // Inject xong chưa step → pending; step 1 lần → advance(0) kích hoạt.
      expect(service.plantSnapshot()?.equipment[0]?.faults[0]).toMatchObject({
        target: { equipment: 'M01', fault: 'overload' },
        state: 'pending',
        sinceMs: 0,
      });
      expect(service.step(1).ok).toBe(true);
      const faults = service.plantSnapshot()?.equipment[0]?.faults ?? [];
      expect(faults).toHaveLength(1);
      expect(faults[0]).toMatchObject({
        target: { equipment: 'M01', fault: 'overload' },
        state: 'active',
        sinceMs: 0,
      });
      expect(
        service.plantFaultInject({
          target: { equipment: 'M01', fault: 'khongCo' },
          when: { at: 'now' },
        }),
      ).toMatchObject({ ok: false, code: 'PL-E001' });
      expect(
        service.plantFaultInject({
          target: { equipment: 'M99', fault: 'overload' },
          when: { at: 'now' },
        }),
      ).toMatchObject({ ok: false, code: 'PL-E001' });
    } finally {
      service.stop();
    }
  });

  it('plantFaultClear: clear được → cleared; clear lại/id lạ → PL-E001', async () => {
    const bundle = await makeMotorBundle();
    const service = new SimulationService(bundle, { now: () => 0 });
    try {
      service.plantFaultInject({
        target: { equipment: 'M01', fault: 'overload' },
        when: { at: 'now' },
      });
      const id = service.plantSnapshot()?.equipment[0]?.faults[0]?.id as string;
      // Clear sau 1 bước (simTime 100): clearedAtMs phải là 100 (simTime
      // orchestrator) — clearFault không atMs lấy #simTimeMs engine (= 0 sau
      // bước đầu) → lệch 1 bước so với runner (e2e A, OVL_OK T=2990).
      expect(service.step(1).ok).toBe(true);
      expect(service.plantFaultClear(id)).toEqual({ ok: true });
      expect(service.plantSnapshot()?.equipment[0]?.faults[0]).toMatchObject({
        state: 'cleared',
        clearedAtMs: 100,
      });
      expect(service.plantFaultClear(id)).toMatchObject({ ok: false, code: 'PL-E001' });
      expect(service.plantFaultClear('khong-co')).toMatchObject({ ok: false, code: 'PL-E001' });
    } finally {
      service.stop();
    }
  });

  it('plantFaultPreset noRunFeedback → lỗi tín hiệu runFb stuck', async () => {
    const bundle = await makeMotorBundle();
    const service = new SimulationService(bundle, { now: () => 0 });
    try {
      expect(service.plantFaultPreset('M01', 'noRunFeedback')).toEqual({ ok: true });
      expect(service.plantSnapshot()?.equipment[0]?.faults[0]).toMatchObject({
        target: { equipment: 'M01', signal: 'runFb', type: 'stuck' },
        state: 'pending',
      });
      expect(service.step(1).ok).toBe(true);
      const faults = service.plantSnapshot()?.equipment[0]?.faults ?? [];
      expect(faults).toHaveLength(1);
      expect(faults[0]).toMatchObject({
        target: { equipment: 'M01', signal: 'runFb', type: 'stuck' },
        state: 'active',
        sinceMs: 0,
      });
      expect(service.plantFaultPreset('M01', 'khongCo')).toMatchObject({
        ok: false,
        code: 'PL-E001',
      });
    } finally {
      service.stop();
    }
  });

  it('simHash tất định: reset + chạy lại giống hệt → cùng hash (OQ-318)', async () => {
    const bundle = await makeMotorBundle();
    const service = new SimulationService(bundle, { now: () => 0 });
    try {
      expect(service.tagWrite('START_PB', true).ok).toBe(true);
      expect(service.step(5).ok).toBe(true);
      const h1 = service.simHash();
      expect(h1).not.toBe(EMPTY_SHA256);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
      service.reset();
      expect(service.simHash()).toBe(EMPTY_SHA256);
      expect(service.tagWrite('START_PB', true).ok).toBe(true);
      expect(service.step(5).ok).toBe(true);
      expect(service.simHash()).toBe(h1);
    } finally {
      service.stop();
    }
  });
});
