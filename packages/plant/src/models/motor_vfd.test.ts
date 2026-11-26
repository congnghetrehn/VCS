// Model motor_vfd (M2 §7.2, P2.3 — bảng A/H, STATE §26).
// Edge case ngoài golden + snapshot/restore (§11.2) + params/registry.
// Lưu ý: tag AI đọc về là raw — assert eng qua observable/state, raw qua số nguyên.

import { describe, expect, it } from 'vitest';

import { TraceHasher, type TagDBSnapshot, type TagHandle } from '@vcs/kernel';
import { validatePlantConfig, type PlantConfig, type PlantEngine } from '../engine.js';
import { defaultRegistry } from '../index.js';
import { makeMotorVfdSetup, motorVfdTagDefs } from '../test-helpers.js';
import { motorVfdModel, type MotorVfdParams, type MotorVfdState } from './motor_vfd.js';

function vfdCfg(params: Partial<MotorVfdParams>): PlantConfig {
  const defs = motorVfdTagDefs();
  return {
    stepMs: 10,
    seed: 42,
    equipment: [
      {
        id: 'CR01_VFD01',
        model: 'motor_vfd',
        params: { ...params },
        signals: {
          runCmd: 'CR01_VFD01_RUN_CMD',
          speedRef: 'CR01_VFD01_SPEED_REF',
          runFb: 'CR01_VFD01_RUN_FB',
          speedFb: 'CR01_VFD01_SPEED_FB',
          ready: 'CR01_VFD01_READY',
          vfdFaultOk: 'CR01_VFD01_VFD_OK',
          remote: 'CR01_VFD01_REMOTE',
          currentFb: 'CR01_VFD01_CUR',
        },
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
}

function stateOf(engine: PlantEngine): MotorVfdState {
  return engine.getState('CR01_VFD01') as MotorVfdState;
}

function obsOf(engine: PlantEngine, key: string): number | boolean | string | undefined {
  return engine.getObservable('CR01_VFD01', key);
}

/** Chạy setup với runCmd=true + speedRef cho trước từ T=100 (raw theo scaling 0..100%). */
function runWithCmd(
  setup: ReturnType<typeof makeMotorVfdSetup>,
  speedRefEng: number,
  toMs: number,
): void {
  const { engine, tags } = setup;
  const cmdH = setup.handles['runCmd'] as TagHandle;
  const refH = setup.handles['speedRef'] as TagHandle;
  for (let t = 0; t <= toMs; t += 10) {
    engine.step(t, 10);
    tags.flush();
    // Cmd áp SAU step(t) — đúng ngữ nghĩa golden runner (OQ-254).
    if (t === 100) {
      tags.set(cmdH, true, 'plc');
      tags.set(refH, Math.round((speedRefEng / 100) * 27648), 'plc');
    }
  }
}

describe('motor_vfd — params (M2 §7.2, OQ-269)', () => {
  it('defaultParams đủ 10 tham số, faultNC mặc định true', () => {
    expect(motorVfdModel.defaultParams).toEqual({
      accelTimeS: 10,
      decelTimeS: 10,
      minSpeedPct: 0,
      maxSpeedPct: 100,
      runThresholdPct: 2,
      speedFbLagMs: 200,
      coastTimeS: 20,
      ratedCurrentA: 0,
      loadFraction: 0.7,
      faultNC: true,
    });
  });

  it('accelTimeS âm → validate báo PL-E001', () => {
    const diags = validatePlantConfig(
      vfdCfg({ accelTimeS: -1 }),
      new Map(motorVfdTagDefs().map((d) => [d.name, d])),
    );
    expect(diags.some((d) => d.code === 'PL-E001')).toBe(true);
  });

  it('unknown key trong params bị strip (không .strict() — quy ước P2.1)', () => {
    const parsed = motorVfdModel.paramsSchema.parse({ ...motorVfdModel.defaultParams, bogus: 1 });
    expect('bogus' in (parsed as Record<string, unknown>)).toBe(false);
  });

  it('đăng ký trong defaultRegistry, version string 1.0.0', () => {
    expect(defaultRegistry.has('motor_vfd')).toBe(true);
    expect(defaultRegistry.get('motor_vfd')).toBe(motorVfdModel);
    expect(motorVfdModel.version).toBe('1.0.0');
  });
});

describe('motor_vfd — state machine (OQ-273)', () => {
  it('STOPPED → RAMP_UP → AT_SPEED → RAMP_DOWN → STOPPED', () => {
    const setup = makeMotorVfdSetup();
    runWithCmd(setup, 50, 5100);
    expect(stateOf(setup.engine).state).toBe('AT_SPEED');
    const { engine, tags } = setup;
    const cmdH = setup.handles['runCmd'] as TagHandle;
    for (let t = 5110; t <= 6000; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    expect(stateOf(engine).state).toBe('AT_SPEED');
    // runCmd=false áp SAU step(6000) — plant thấy ở bước 6010.
    tags.set(cmdH, false, 'plc');
    engine.step(6010, 10);
    tags.flush();
    expect(stateOf(engine).state).toBe('RAMP_DOWN');
    for (let t = 6020; t <= 11000; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    expect(stateOf(engine).state).toBe('STOPPED');
    expect(stateOf(engine).speedPct).toBe(0);
  });

  it('runFb theo ngưỡng runThresholdPct; T=300 bẫy float (2.0000000000000004 > 2)', () => {
    const setup = makeMotorVfdSetup();
    runWithCmd(setup, 50, 300);
    expect(obsOf(setup.engine, 'speedPct')).toBeCloseTo(2, 2);
    expect(obsOf(setup.engine, 'running')).toBe(true);
    const fbH = setup.handles['runFb'] as TagHandle;
    expect(setup.tags.get(fbH)).toBe(true);
  });

  it('speedFb lag theo speed (T=110: 0.0049)', () => {
    const setup = makeMotorVfdSetup();
    runWithCmd(setup, 50, 110);
    expect(stateOf(setup.engine).speedPct).toBeCloseTo(0.1, 4);
    expect(stateOf(setup.engine).speedFb).toBeCloseTo(0.0049, 4);
  });

  it('currentA = rated × load × speed/100 (OQ-274)', () => {
    const setup = makeMotorVfdSetup({ params: { ratedCurrentA: 10, loadFraction: 0.7 } });
    runWithCmd(setup, 50, 5100);
    expect(obsOf(setup.engine, 'currentA')).toBeCloseTo(3.5, 2);
    // Tag currentFb scaling 0..100 A: 3.5 A → raw 968.
    expect(setup.tags.get(setup.handles['currentFb'] as TagHandle)).toBe(968);
  });
});

describe('motor_vfd — faults (M2 §7.2, OQ-269…272)', () => {
  it('vfdTrip: coast 0.05/bước, TRIPPED; clear ở tốc độ 0 → STOPPED', () => {
    const setup = makeMotorVfdSetup();
    runWithCmd(setup, 50, 5100);
    const id = setup.engine.injectFault({
      target: { equipment: 'CR01_VFD01', fault: 'vfdTrip' },
      when: { at: 'now' },
    });
    const { engine, tags } = setup;
    for (let t = 5110; t <= 6010; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    expect(stateOf(engine).state).toBe('TRIPPED');
    // 91 bước coast × 0.05 = 4.55 → 50 − 4.55 = 45.45.
    expect(stateOf(engine).speedPct).toBeCloseTo(45.45, 2);
    expect(setup.tags.get(setup.handles['ready'] as TagHandle)).toBe(false);
    expect(setup.tags.get(setup.handles['vfdFaultOk'] as TagHandle)).toBe(false);
    for (let t = 6020; t <= 16010; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    expect(stateOf(engine).speedPct).toBe(0);
    // runCmd=false trước khi clear — nếu không drive ramp lại (target 50).
    const cmdH = setup.handles['runCmd'] as TagHandle;
    tags.set(cmdH, false, 'plc');
    expect(setup.engine.clearFault(id)).toBe(true);
    engine.step(16020, 10);
    tags.flush();
    expect(stateOf(engine).state).toBe('STOPPED');
    expect(setup.tags.get(setup.handles['ready'] as TagHandle)).toBe(true);
  });

  it('rampFail: tốc độ đóng băng, state machine vẫn tính', () => {
    const setup = makeMotorVfdSetup();
    runWithCmd(setup, 50, 1100);
    expect(stateOf(setup.engine).speedPct).toBeCloseTo(10, 2);
    setup.engine.injectFault({ target: { equipment: 'CR01_VFD01', fault: 'rampFail' }, when: { at: 'now' } });
    const { engine, tags } = setup;
    for (let t = 1110; t <= 3000; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    expect(stateOf(engine).speedPct).toBeCloseTo(10, 2);
    expect(stateOf(engine).state).toBe('RAMP_UP');
  });

  it('speedDeviation pct âm: target lệch 50→40 (OQ-270)', () => {
    const setup = makeMotorVfdSetup();
    runWithCmd(setup, 50, 200);
    setup.engine.injectFault({
      target: { equipment: 'CR01_VFD01', fault: 'speedDeviation' },
      when: { at: 'now' },
      params: { pct: -10 },
    });
    const { engine, tags } = setup;
    for (let t = 210; t <= 4100; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    expect(obsOf(engine, 'targetPct')).toBe(40);
    expect(stateOf(engine).state).toBe('AT_SPEED');
    expect(stateOf(engine).speedPct).toBeCloseTo(40, 2);
  });

  it('commLoss: latch lệnh — đổi speedRef khi lỗi vẫn giữ target cũ (OQ-271)', () => {
    const setup = makeMotorVfdSetup();
    runWithCmd(setup, 50, 5100);
    setup.engine.injectFault({ target: { equipment: 'CR01_VFD01', fault: 'commLoss' }, when: { at: 'now' } });
    const { engine, tags } = setup;
    const refH = setup.handles['speedRef'] as TagHandle;
    for (let t = 5110; t <= 6000; t += 10) {
      if (t === 5500) tags.set(refH, 0, 'plc');
      engine.step(t, 10);
      tags.flush();
    }
    expect(obsOf(engine, 'targetPct')).toBe(50);
    expect(stateOf(engine).speedPct).toBe(50);
  });

  it('notReady/localMode: không chạy; ready/remote=false', () => {
    const setup = makeMotorVfdSetup();
    setup.engine.injectFault({ target: { equipment: 'CR01_VFD01', fault: 'notReady' }, when: { at: 'now' } });
    setup.engine.injectFault({ target: { equipment: 'CR01_VFD01', fault: 'localMode' }, when: { at: 'now' } });
    runWithCmd(setup, 50, 2000);
    expect(stateOf(setup.engine).state).toBe('STOPPED');
    expect(stateOf(setup.engine).speedPct).toBe(0);
    expect(setup.tags.get(setup.handles['ready'] as TagHandle)).toBe(false);
    expect(setup.tags.get(setup.handles['remote'] as TagHandle)).toBe(false);
  });

  it('faultNC=false: vfdFaultOk đảo cực (khỏe=false, trip=true) — OQ-269', () => {
    const setup = makeMotorVfdSetup({ params: { faultNC: false } });
    runWithCmd(setup, 50, 5100);
    expect(setup.tags.get(setup.handles['vfdFaultOk'] as TagHandle)).toBe(false);
    setup.engine.injectFault({ target: { equipment: 'CR01_VFD01', fault: 'vfdTrip' }, when: { at: 'now' } });
    setup.engine.step(5110, 10);
    setup.tags.flush();
    expect(stateOf(setup.engine).state).toBe('TRIPPED');
    expect(setup.tags.get(setup.handles['vfdFaultOk'] as TagHandle)).toBe(true);
  });
});

describe('motor_vfd — snapshot/restore (M2 §11.2)', () => {
  it('snapshot giữa RAMP_UP, chạy tiếp, restore, chạy lại → trace giống hệt', () => {
    const setup = makeMotorVfdSetup();
    const { engine, tags } = setup;
    const cmdH = setup.handles['runCmd'] as TagHandle;
    const refH = setup.handles['speedRef'] as TagHandle;
    let snapPlant: unknown;
    let snapTags: TagDBSnapshot | undefined;
    let hasher1: TraceHasher | undefined;
    for (let t = 0; t <= 1000; t += 10) {
      engine.step(t, 10);
      tags.flush();
      // Cmd áp SAU step(t) — đúng ngữ nghĩa golden runner (OQ-254).
      if (t === 100) {
        tags.set(cmdH, true, 'plc');
        tags.set(refH, Math.round(0.5 * 27648), 'plc');
      }
      if (t === 500) {
        snapPlant = engine.snapshot();
        snapTags = tags.snapshot();
        hasher1 = new TraceHasher(tags);
      }
    }
    const hash1 = (hasher1 as TraceHasher).hash();
    expect(hash1).toHaveLength(64);
    (hasher1 as TraceHasher).dispose();
    engine.restore(snapPlant);
    const rewound = engine.getState('CR01_VFD01') as MotorVfdState;
    expect(rewound.state).toBe('RAMP_UP');
    // T=500: 40 bước × 0.1 = 4.0.
    expect(Math.abs(rewound.speedPct - 4)).toBeLessThanOrEqual(0.01);
    tags.restore(snapTags as TagDBSnapshot);
    tags.flush();
    const hasher2 = new TraceHasher(tags);
    for (let t = 510; t <= 1000; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    expect(hasher2.hash()).toBe(hash1);
    hasher2.dispose();
  });
});
