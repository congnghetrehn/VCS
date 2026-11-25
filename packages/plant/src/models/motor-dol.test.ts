// Model motor_dol (M2 §7.1, P2.2 — bảng A–K, STATE §25).
// Edge case ngoài golden + snapshot/restore (§11.2).

import { describe, expect, it } from 'vitest';

import { TraceHasher, type TagDBSnapshot, type TagHandle } from '@vcs/kernel';
import { rawToEng } from '../adapter.js';
import type { PlantConfig, PlantEngine } from '../engine.js';
import { validatePlantConfig } from '../engine.js';
import { defaultRegistry } from '../index.js';
import { makeMotorDolSetup, motorDolTagDefs } from '../test-helpers.js';
import { motorDolModel, type MotorDolParams, type MotorDolState } from './motor_dol.js';
import { createModelRegistry } from '../registry.js';

function dolCfg(params: Partial<MotorDolParams>): PlantConfig {
  const defs = motorDolTagDefs();
  return {
    stepMs: 10,
    seed: 42,
    equipment: [
      {
        id: 'CR01_M01',
        model: 'motor_dol',
        params: { ...params },
        signals: {
          runCmd: 'CR01_M01_RUN_CMD',
          runFb: 'CR01_M01_RUN_FB',
          ready: 'CR01_M01_READY',
          remote: 'CR01_M01_REMOTE',
          overloadOk: 'CR01_M01_OVL_OK',
          currentFb: 'CR01_M01_CUR',
        },
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
}

function stateOf(engine: PlantEngine): MotorDolState {
  return engine.getState('CR01_M01') as MotorDolState;
}

function runCmdAt(setup: ReturnType<typeof makeMotorDolSetup>, atMs: number, toMs: number): void {
  const cmdH = setup.handles['runCmd'] as TagHandle;
  for (let t = 0; t <= toMs; t += 10) {
    if (t === atMs) setup.tags.set(cmdH, true, 'plc');
    setup.engine.step(t, 10);
    setup.tags.flush();
  }
}

describe('motor_dol — định nghĩa (M2 §7.1)', () => {
  it('6 role, synonyms nguyên văn §7.1, 15 tham số mặc định đúng spec', () => {
    expect(motorDolModel.type).toBe('motor_dol');
    expect(motorDolModel.version).toBe('1.0.0');
    expect(motorDolModel.roles.map((r) => r.role)).toEqual([
      'runCmd',
      'runFb',
      'ready',
      'remote',
      'overloadOk',
      'currentFb',
    ]);
    const byRole = new Map(motorDolModel.roles.map((r) => [r.role, r]));
    expect(byRole.get('runCmd')?.synonyms).toEqual(['RUN_CMD', 'START_CMD', 'RUN', 'START', 'CMD', 'BETRIEB_BEFEHL']);
    expect(byRole.get('runFb')?.synonyms).toEqual(['RUN_FB', 'RUNNING', 'RUN_ST', 'AUX', 'RUN_FBK', 'RUECKMELDUNG']);
    expect(byRole.get('ready')?.synonyms).toEqual(['READY', 'RDY', 'MCB_OK', 'BREAKER_ON']);
    expect(byRole.get('remote')?.synonyms).toEqual(['REMOTE', 'REM', 'AUTO_SEL']);
    expect(byRole.get('overloadOk')?.synonyms).toEqual(['OVL_OK', 'OL_OK', 'THERMAL_OK', 'OVERLOAD_OK', 'OVL']);
    expect(byRole.get('currentFb')?.synonyms).toEqual(['CUR', 'CURRENT', 'AMP', 'I_ACT']);
    expect(byRole.get('runCmd')?.optional).toBeUndefined();
    expect(byRole.get('runFb')?.optional).toBeUndefined();
    expect(byRole.get('ready')?.optional).toBe(true);
    expect(byRole.get('currentFb')?.unit).toBe('A');
    expect(motorDolModel.defaultParams).toEqual({
      startDelayMs: 500,
      stopDelayMs: 800,
      accelTimeMs: 1500,
      coastTimeMs: 3000,
      tripDelayMs: 0,
      overloadResetMs: 1000,
      resetRequiresCmdOff: true,
      overloadNC: true,
      ratedCurrentA: 0,
      noLoadCurrentFrac: 0.35,
      loadFraction: 0.8,
      inrushMult: 6,
      inrushMs: 1000,
      defaultRemote: true,
      defaultReady: true,
    });
    expect(motorDolModel.faults.map((f) => f.id)).toEqual([
      'overload',
      'failToStart',
      'contactorStuck',
      'notReady',
      'localMode',
    ]);
    expect(Object.keys(motorDolModel.presets ?? {}).sort()).toEqual([
      'commandLost',
      'feedbackStuckOn',
      'noRunFeedback',
      'overloadTrip',
    ]);
    expect(motorDolModel.observables.map((o) => o.key)).toEqual([
      'state',
      'speedPct',
      'currentA',
      'running',
      'energized',
    ]);
  });

  it('params sai → PL-E001 (validate) và constructor throw', () => {
    const models = createModelRegistry();
    models.register(motorDolModel);
    const defs = motorDolTagDefs();
    const tagMap = new Map(defs.map((d) => [d.name, d]));
    const bad: Array<Partial<MotorDolParams>> = [
      { startDelayMs: -1 },
      { ratedCurrentA: -1 },
      { loadFraction: 1.5 },
      { noLoadCurrentFrac: -0.1 },
      { inrushMult: 0.5 },
    ];
    for (const params of bad) {
      const diags = validatePlantConfig(dolCfg(params), tagMap, models);
      expect(diags.some((d) => d.code === 'PL-E001' && d.severity === 'error')).toBe(true);
      expect(() => makeMotorDolSetup({ params })).toThrow(/PL-E001/);
    }
  });

  it('cấu hình đủ 6 role → validate không lỗi (OQ-258)', () => {
    const models = createModelRegistry();
    models.register(motorDolModel);
    const defs = motorDolTagDefs();
    const diags = validatePlantConfig(dolCfg({}), new Map(defs.map((d) => [d.name, d])), models);
    expect(diags.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('import package root (@vcs/plant) đăng ký motor_dol vào defaultRegistry', () => {
    expect(defaultRegistry.has('motor_dol')).toBe(true);
    expect(defaultRegistry.get('motor_dol')).toBe(motorDolModel);
  });
});

describe('motor_dol — máy trạng thái (M2 §7.1, luật 1–6)', () => {
  it('overload khi STOPPED không trip ngay — luật 1 chỉ xét STARTING/RUNNING', () => {
    const setup = makeMotorDolSetup();
    const cmdH = setup.handles['runCmd'] as TagHandle;
    // cmd + fault áp SAU step(100) (quy ước OQ-254) → t0 = 110, activateAtMs = 100.
    for (let t = 0; t <= 120; t += 10) {
      setup.engine.step(t, 10);
      setup.tags.flush();
      if (t === 100) {
        setup.tags.set(cmdH, true, 'plc');
        setup.engine.injectFault({ target: { equipment: 'CR01_M01', fault: 'overload' }, when: { at: 'now' } });
      }
      if (t === 110) expect(stateOf(setup.engine).state).toBe('STARTING');
    }
    expect(stateOf(setup.engine).state).toBe('TRIPPED');
  });

  it('overload clear trước khi hết tripDelayMs → không trip', () => {
    const setup = makeMotorDolSetup({ params: { tripDelayMs: 200 } });
    const cmdH = setup.handles['runCmd'] as TagHandle;
    let fid = '';
    for (let t = 0; t <= 700; t += 10) {
      if (t === 100) setup.tags.set(cmdH, true, 'plc');
      setup.engine.step(t, 10);
      setup.tags.flush();
      if (t === 200) {
        fid = setup.engine.injectFault({
          target: { equipment: 'CR01_M01', fault: 'overload' },
          when: { at: 'now' },
        });
      }
      if (t === 300) expect(setup.engine.clearFault(fid)).toBe(true);
      if (t === 400) expect(stateOf(setup.engine).state).toBe('STARTING');
    }
    expect(stateOf(setup.engine).state).toBe('RUNNING');
  });

  it('resetRequiresCmdOff=false → reset khi runCmd còn 1 (sau overloadResetMs)', () => {
    const setup = makeMotorDolSetup({ params: { resetRequiresCmdOff: false } });
    const cmdH = setup.handles['runCmd'] as TagHandle;
    let fid = '';
    for (let t = 0; t <= 2010; t += 10) {
      if (t === 100) setup.tags.set(cmdH, true, 'plc');
      setup.engine.step(t, 10);
      setup.tags.flush();
      if (t === 700) {
        fid = setup.engine.injectFault({
          target: { equipment: 'CR01_M01', fault: 'overload' },
          when: { at: 'now' },
        });
      }
      if (t === 1000) expect(setup.engine.clearFault(fid)).toBe(true);
      if (t === 2000) expect(stateOf(setup.engine).state).toBe('STOPPED');
    }
    expect(stateOf(setup.engine).state).toBe('STARTING');
  });

  it('overloadNC=false → overloadOk đảo (bình thường false, TRIPPED true)', () => {
    const setup = makeMotorDolSetup({ params: { overloadNC: false } });
    const cmdH = setup.handles['runCmd'] as TagHandle;
    const ovlH = setup.handles['overloadOk'] as TagHandle;
    for (let t = 0; t <= 710; t += 10) {
      if (t === 100) setup.tags.set(cmdH, true, 'plc');
      setup.engine.step(t, 10);
      setup.tags.flush();
      if (t === 0) expect(setup.tags.get(ovlH)).toBe(false);
      if (t === 700) {
        setup.engine.injectFault({ target: { equipment: 'CR01_M01', fault: 'overload' }, when: { at: 'now' } });
      }
    }
    expect(stateOf(setup.engine).state).toBe('TRIPPED');
    expect(setup.tags.get(ovlH)).toBe(true);
  });

  it('role ready/remote không gán → emit bỏ qua, canRun chỉ theo fault (OQ-259)', () => {
    const setup = makeMotorDolSetup({ omitRoles: ['ready', 'remote'] });
    runCmdAt(setup, 100, 610);
    expect(stateOf(setup.engine).state).toBe('RUNNING');
  });

  it('notReady chặn chạy ngay cả khi role ready không gán (OQ-259)', () => {
    const setup = makeMotorDolSetup({ omitRoles: ['ready', 'remote'] });
    setup.engine.injectFault({ target: { equipment: 'CR01_M01', fault: 'notReady' }, when: { at: 'now' } });
    runCmdAt(setup, 100, 600);
    expect(stateOf(setup.engine).state).toBe('STOPPED');
  });

  it('defaultRemote/defaultReady=false không ảnh hưởng hành vi; remote/ready emit theo fault (OQ-259)', () => {
    const setup = makeMotorDolSetup({ params: { defaultRemote: false, defaultReady: false } });
    const remH = setup.handles['remote'] as TagHandle;
    const rdyH = setup.handles['ready'] as TagHandle;
    runCmdAt(setup, 100, 610);
    expect(stateOf(setup.engine).state).toBe('RUNNING');
    expect(setup.tags.get(remH)).toBe(true);
    expect(setup.tags.get(rdyH)).toBe(true);
  });

  it('speedPct kẹp 100 khi chạy dài; về 0 sau khi dừng đủ lâu', () => {
    const setup = makeMotorDolSetup();
    const cmdH = setup.handles['runCmd'] as TagHandle;
    // Pha 1: chạy dài, không dừng — speed kẹp 100 (đạt ở bước 1590 với t0=100).
    for (let t = 0; t <= 2000; t += 10) {
      if (t === 100) setup.tags.set(cmdH, true, 'plc');
      setup.engine.step(t, 10);
      setup.tags.flush();
    }
    expect(stateOf(setup.engine).state).toBe('RUNNING');
    expect(stateOf(setup.engine).speedPct).toBe(100);
    // Pha 2: hết lệnh ở 2010, quán tính về 0 (300 bước giảm × 1/3).
    for (let t = 2010; t <= 5100; t += 10) {
      if (t === 2010) setup.tags.set(cmdH, false, 'plc');
      setup.engine.step(t, 10);
      setup.tags.flush();
    }
    expect(stateOf(setup.engine).state).toBe('STOPPED');
    expect(stateOf(setup.engine).speedPct).toBe(0);
  });

  it('currentFb = 0 khi STOPPING; runFb vẫn true khi STOPPING', () => {
    const setup = makeMotorDolSetup({ params: { ratedCurrentA: 10 } });
    const cmdH = setup.handles['runCmd'] as TagHandle;
    const fbH = setup.handles['runFb'] as TagHandle;
    for (let t = 0; t <= 2010; t += 10) {
      if (t === 100) setup.tags.set(cmdH, true, 'plc');
      if (t === 2000) setup.tags.set(cmdH, false, 'plc');
      setup.engine.step(t, 10);
      setup.tags.flush();
    }
    expect(stateOf(setup.engine).state).toBe('STOPPING');
    expect(setup.engine.getObservable('CR01_M01', 'currentA')).toBe(0);
    expect(setup.tags.get(fbH)).toBe(true);
  });

  it('inrush hết đúng tại T−t0 = inrushMs (bảng B: currentA 7.00 ở T=1110)', () => {
    const setup = makeMotorDolSetup({ params: { ratedCurrentA: 10 } });
    const cmdH = setup.handles['runCmd'] as TagHandle;
    let at110 = -1;
    let at1110 = -1;
    // cmd áp SAU step(100) (quy ước OQ-254) → t0 = 110.
    for (let t = 0; t <= 1110; t += 10) {
      setup.engine.step(t, 10);
      setup.tags.flush();
      if (t === 100) setup.tags.set(cmdH, true, 'plc');
      if (t === 110) at110 = setup.engine.getObservable('CR01_M01', 'currentA') as number;
      if (t === 1110) at1110 = setup.engine.getObservable('CR01_M01', 'currentA') as number;
    }
    expect(Math.abs(at110 - 53.53)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(at1110 - 7.0)).toBeLessThanOrEqual(0.01);
  });

  it('tripClearedAt mirror FaultManager.clearedAtMs (OQ-263)', () => {
    const setup = makeMotorDolSetup();
    const cmdH = setup.handles['runCmd'] as TagHandle;
    let fid = '';
    for (let t = 0; t <= 1010; t += 10) {
      if (t === 100) setup.tags.set(cmdH, true, 'plc');
      setup.engine.step(t, 10);
      setup.tags.flush();
      if (t === 700) {
        fid = setup.engine.injectFault({
          target: { equipment: 'CR01_M01', fault: 'overload' },
          when: { at: 'now' },
        });
      }
      if (t === 710) expect(stateOf(setup.engine).tripClearedAt).toBeUndefined();
      if (t === 1000) expect(setup.engine.clearFault(fid)).toBe(true);
    }
    expect(stateOf(setup.engine).tripClearedAt).toBe(1000);
  });

  it('currentFb tag round-trip qua adapter, scaling 0..100 A (OQ-258)', () => {
    const setup = makeMotorDolSetup({ params: { ratedCurrentA: 10 } });
    const cmdH = setup.handles['runCmd'] as TagHandle;
    const curH = setup.handles['currentFb'] as TagHandle;
    // cmd áp SAU step(100) (quy ước OQ-254) → t0 = 110.
    for (let t = 0; t <= 110; t += 10) {
      setup.engine.step(t, 10);
      setup.tags.flush();
      if (t === 100) setup.tags.set(cmdH, true, 'plc');
    }
    const raw = setup.tags.get(curH) as number;
    const eng = rawToEng(raw, { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100 });
    expect(Math.abs(eng - 53.53)).toBeLessThanOrEqual(0.01);
  });
});

describe('motor_dol — snapshot/restore (M2 §11.2)', () => {
  it('snapshot giữa STARTING, chạy tiếp, restore, chạy lại → trace giống hệt', () => {
    const setup = makeMotorDolSetup();
    const { engine, tags } = setup;
    const cmdH = setup.handles['runCmd'] as TagHandle;
    let snapPlant: unknown;
    let snapTags: TagDBSnapshot | undefined;
    let hasher1: TraceHasher | undefined;
    for (let t = 0; t <= 600; t += 10) {
      if (t === 100) tags.set(cmdH, true, 'plc');
      engine.step(t, 10);
      tags.flush();
      if (t === 300) {
        snapPlant = engine.snapshot();
        snapTags = tags.snapshot();
        hasher1 = new TraceHasher(tags);
      }
    }
    const hash1 = (hasher1 as TraceHasher).hash();
    expect(hash1).toHaveLength(64);
    (hasher1 as TraceHasher).dispose();
    engine.restore(snapPlant);
    // P2.2: restore phải tua state về đúng thời điểm snapshot (STARTING,
    // speedPct ≈ 14 với t0=100) — snapshot giữ reference sẽ trả về RUNNING/34
    // của T=600 (lỗi nền P2.1, đã sửa bằng structuredClone ở snapshot()).
    const rewound = engine.getState('CR01_M01') as MotorDolState;
    expect(rewound.state).toBe('STARTING');
    expect(Math.abs(rewound.speedPct - 14)).toBeLessThanOrEqual(0.01);
    tags.restore(snapTags as TagDBSnapshot);
    tags.flush();
    const hasher2 = new TraceHasher(tags);
    for (let t = 310; t <= 600; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    expect(hasher2.hash()).toBe(hash1);
    hasher2.dispose();
  });
});
