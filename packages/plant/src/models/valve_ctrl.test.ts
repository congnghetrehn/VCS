// Model valve_ctrl (M2 §7.4, P2.3 — bảng C, STATE §26).
// Edge case ngoài golden + snapshot/restore (§11.2) + params/registry.

import { describe, expect, it } from 'vitest';

import { TraceHasher, type TagDBSnapshot, type TagHandle } from '@vcs/kernel';
import { validatePlantConfig, type PlantConfig, type PlantEngine } from '../engine.js';
import { defaultRegistry } from '../index.js';
import { makeValveCtrlSetup, valveCtrlTagDefs } from '../test-helpers.js';
import { valveCtrlModel, type ValveCtrlParams, type ValveCtrlState } from './valve_ctrl.js';

function valveCfg(params: Partial<ValveCtrlParams>): PlantConfig {
  const defs = valveCtrlTagDefs();
  return {
    stepMs: 10,
    seed: 42,
    equipment: [
      {
        id: 'CR01_VC01',
        model: 'valve_ctrl',
        params: { ...params },
        signals: {
          posRef: 'CR01_VC01_POS_REF',
          posFb: 'CR01_VC01_POS_FB',
          fault: 'CR01_VC01_FAULT',
          closedLs: 'CR01_VC01_CLOSED_LS',
          openLs: 'CR01_VC01_OPEN_LS',
        },
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
}

function stateOf(engine: PlantEngine): ValveCtrlState {
  return engine.getState('CR01_VC01') as ValveCtrlState;
}

function obsOf(engine: PlantEngine, key: string): number | boolean | string | undefined {
  return engine.getObservable('CR01_VC01', key);
}

/** Chạy setup với posRef eng cho trước từ sau step(100) (ngữ nghĩa OQ-254). */
function runWithRef(
  setup: ReturnType<typeof makeValveCtrlSetup>,
  refEng: number,
  toMs: number,
): void {
  const { engine, tags } = setup;
  const refH = setup.handles['posRef'] as TagHandle;
  for (let t = 0; t <= toMs; t += 10) {
    engine.step(t, 10);
    tags.flush();
    if (t === 100) tags.set(refH, Math.round((refEng / 100) * 27648), 'plc');
  }
}

describe('valve_ctrl — params (M2 §7.4, OQ-275/280)', () => {
  it('defaultParams đủ 7 tham số (faultNC=false thêm theo OQ-275)', () => {
    expect(valveCtrlModel.defaultParams).toEqual({
      strokeTimeS: 20,
      lagMs: 0,
      deadbandPct: 0.5,
      failPosition: 'hold',
      initialPosPct: 0,
      posFbRange: { engMin: 0, engMax: 100 },
      faultNC: false,
    });
  });

  it('strokeTimeS ≤ 0 → validate báo PL-E001', () => {
    const diags = validatePlantConfig(
      valveCfg({ strokeTimeS: 0 }),
      new Map(valveCtrlTagDefs().map((d) => [d.name, d])),
    );
    expect(diags.some((d) => d.code === 'PL-E001')).toBe(true);
  });

  it("failPosition chỉ nhận 'hold'|'close'|'open'", () => {
    const parsed = valveCtrlModel.paramsSchema.safeParse({
      ...valveCtrlModel.defaultParams,
      failPosition: 'mid',
    });
    expect(parsed.success).toBe(false);
  });

  it('đăng ký trong defaultRegistry, version string 1.0.0', () => {
    expect(defaultRegistry.has('valve_ctrl')).toBe(true);
    expect(defaultRegistry.get('valve_ctrl')).toBe(valveCtrlModel);
    expect(valveCtrlModel.version).toBe('1.0.0');
  });
});

describe('valve_ctrl — hành vi (M2 §7.4, OQ-280…283)', () => {
  it('posFb lag theo pos khi lagMs=200 (tính độc lập bằng lagStep)', () => {
    const setup = makeValveCtrlSetup({ params: { lagMs: 200 } });
    runWithRef(setup, 80, 110);
    expect(stateOf(setup.engine).posPct).toBeCloseTo(0.05, 4);
    expect(stateOf(setup.engine).posFb).toBeCloseTo(0.00244, 4);
    runWithRefContinue(setup, 200);
    expect(stateOf(setup.engine).posPct).toBeCloseTo(0.5, 2);
    expect(stateOf(setup.engine).posFb).toBeCloseTo(0.1163, 3);
    function runWithRefContinue(s: ReturnType<typeof makeValveCtrlSetup>, toMs: number): void {
      for (let t = 120; t <= toMs; t += 10) {
        s.engine.step(t, 10);
        s.tags.flush();
      }
    }
  });

  it('LS ngưỡng cố định 1% (OQ-280): closedLs khi pos ≤ 1, openLs khi pos ≥ 99', () => {
    const setup = makeValveCtrlSetup();
    const { engine, tags } = setup;
    const refH = setup.handles['posRef'] as TagHandle;
    const closedH = setup.handles['closedLs'] as TagHandle;
    const openH = setup.handles['openLs'] as TagHandle;
    for (let t = 0; t <= 16100; t += 10) {
      engine.step(t, 10);
      tags.flush();
      if (t === 0) {
        expect(tags.get(closedH)).toBe(true);
        expect(tags.get(openH)).toBe(false);
      }
      if (t === 100) tags.set(refH, Math.round(0.8 * 27648), 'plc');
      if (t === 110) {
        // pos 0.05 ≤ 1 → closedLs vẫn true.
        expect(tags.get(closedH)).toBe(true);
      }
      if (t === 200) {
        // pos 0.5 ≤ 1 → closedLs true.
        expect(stateOf(engine).posPct).toBeCloseTo(0.5, 2);
        expect(tags.get(closedH)).toBe(true);
      }
      if (t === 300) {
        // pos 1.0000000000000002 > 1 (float) → closedLs false.
        expect(tags.get(closedH)).toBe(false);
      }
    }
    expect(stateOf(engine).posPct).toBeCloseTo(79.5, 2);
    expect(tags.get(closedH)).toBe(false);
    expect(tags.get(openH)).toBe(false);
  });

  it('drift âm: pos trôi xuống dù target=80 (OQ-281)', () => {
    const setup = makeValveCtrlSetup();
    runWithRef(setup, 80, 1000);
    expect(stateOf(setup.engine).posPct).toBeCloseTo(4.5, 2);
    setup.engine.injectFault({
      target: { equipment: 'CR01_VC01', fault: 'drift' },
      when: { at: 'now' },
      params: { pctPerHour: -3600 },
    });
    const { engine, tags } = setup;
    for (let t = 1010; t <= 2000; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    // Mỗi bước +0.05 (rate-limit) − 0.01 (drift) = +0.04 → 4.5 + 100×0.04 = 8.5.
    expect(stateOf(engine).posPct).toBeCloseTo(8.5, 2);
  });

  it("signalLoss failPosition='hold': target = pos hiện tại, pos đứng yên (OQ-283)", () => {
    const setup = makeValveCtrlSetup({ params: { failPosition: 'hold' } });
    runWithRef(setup, 80, 1000);
    setup.engine.injectFault({ target: { equipment: 'CR01_VC01', fault: 'signalLoss' }, when: { at: 'now' } });
    const { engine, tags } = setup;
    for (let t = 1010; t <= 2000; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    expect(stateOf(engine).posPct).toBeCloseTo(4.5, 2);
    expect(obsOf(engine, 'targetPct')).toBeCloseTo(4.5, 2);
    expect(setup.tags.get(setup.handles['fault'] as TagHandle)).toBe(true);
  });

  it("signalLoss failPosition='open': target 100 (OQ-283)", () => {
    const setup = makeValveCtrlSetup({ params: { failPosition: 'open' } });
    runWithRef(setup, 80, 1000);
    setup.engine.injectFault({ target: { equipment: 'CR01_VC01', fault: 'signalLoss' }, when: { at: 'now' } });
    setup.engine.step(1010, 10);
    setup.tags.flush();
    expect(obsOf(setup.engine, 'targetPct')).toBe(100);
  });

  it('faultNC=true: fault=true khi khỏe, false khi có lỗi (OQ-275)', () => {
    const setup = makeValveCtrlSetup({ params: { faultNC: true } });
    runWithRef(setup, 80, 1000);
    expect(setup.tags.get(setup.handles['fault'] as TagHandle)).toBe(true);
    setup.engine.injectFault({ target: { equipment: 'CR01_VC01', fault: 'stuck' }, when: { at: 'now' } });
    setup.engine.step(1010, 10);
    setup.tags.flush();
    expect(setup.tags.get(setup.handles['fault'] as TagHandle)).toBe(false);
  });
});

describe('valve_ctrl — snapshot/restore (M2 §11.2)', () => {
  it('snapshot giữa hành trình, chạy tiếp, restore, chạy lại → trace giống hệt', () => {
    const setup = makeValveCtrlSetup();
    const { engine, tags } = setup;
    const refH = setup.handles['posRef'] as TagHandle;
    let snapPlant: unknown;
    let snapTags: TagDBSnapshot | undefined;
    let hasher1: TraceHasher | undefined;
    for (let t = 0; t <= 2000; t += 10) {
      engine.step(t, 10);
      tags.flush();
      if (t === 100) tags.set(refH, Math.round(0.8 * 27648), 'plc');
      if (t === 1000) {
        snapPlant = engine.snapshot();
        snapTags = tags.snapshot();
        hasher1 = new TraceHasher(tags);
      }
    }
    const hash1 = (hasher1 as TraceHasher).hash();
    expect(hash1).toHaveLength(64);
    (hasher1 as TraceHasher).dispose();
    engine.restore(snapPlant);
    const rewound = engine.getState('CR01_VC01') as ValveCtrlState;
    // T=1000: 90 bước × 0.05 = 4.5.
    expect(Math.abs(rewound.posPct - 4.5)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(rewound.targetPct - 80)).toBeLessThanOrEqual(0.01);
    tags.restore(snapTags as TagDBSnapshot);
    tags.flush();
    const hasher2 = new TraceHasher(tags);
    for (let t = 1010; t <= 2000; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    expect(hasher2.hash()).toBe(hash1);
    hasher2.dispose();
  });
});
