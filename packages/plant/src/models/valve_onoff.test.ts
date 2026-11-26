// Model valve_onoff (M2 §7.3, P2.3 — bảng B/I, STATE §26).
// Edge case ngoài golden + snapshot/restore (§11.2) + params/registry.

import { describe, expect, it } from 'vitest';

import { TraceHasher, type TagDBSnapshot, type TagHandle } from '@vcs/kernel';
import { validatePlantConfig, type PlantConfig, type PlantEngine } from '../engine.js';
import { defaultRegistry } from '../index.js';
import { makeValveOnoffSetup, valveOnoffTagDefs } from '../test-helpers.js';
import { valveOnoffModel, type ValveOnoffParams, type ValveOnoffState } from './valve_onoff.js';

function valveCfg(params: Partial<ValveOnoffParams>): PlantConfig {
  const defs = valveOnoffTagDefs();
  return {
    stepMs: 10,
    seed: 42,
    equipment: [
      {
        id: 'CR01_V01',
        model: 'valve_onoff',
        params: { ...params },
        signals: {
          openCmd: 'CR01_V01_OPEN_CMD',
          closeCmd: 'CR01_V01_CLOSE_CMD',
          openLs: 'CR01_V01_OPEN_LS',
          closedLs: 'CR01_V01_CLOSED_LS',
          fault: 'CR01_V01_FAULT',
        },
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
}

function stateOf(engine: PlantEngine): ValveOnoffState {
  return engine.getState('CR01_V01') as ValveOnoffState;
}

function obsOf(engine: PlantEngine, key: string): number | boolean | string | undefined {
  return engine.getObservable('CR01_V01', key);
}

/** Chạy setup với openCmd=true từ sau step(100) (ngữ nghĩa OQ-254). */
function runOpen(setup: ReturnType<typeof makeValveOnoffSetup>, toMs: number): void {
  const { engine, tags } = setup;
  const cmdH = setup.handles['openCmd'] as TagHandle;
  for (let t = 0; t <= toMs; t += 10) {
    engine.step(t, 10);
    tags.flush();
    if (t === 100) tags.set(cmdH, true, 'plc');
  }
}

describe('valve_onoff — params (M2 §7.3, OQ-275/277)', () => {
  it('defaultParams đủ 6 tham số (faultNC=false thêm theo OQ-275)', () => {
    expect(valveOnoffModel.defaultParams).toEqual({
      travelTimeMs: 5000,
      singleSolenoid: false,
      lsThresholdPct: 1,
      initialPosPct: 0,
      bothCmdPolicy: 'hold',
      faultNC: false,
    });
  });

  it('travelTimeMs ≤ 0 → validate báo PL-E001', () => {
    const diags = validatePlantConfig(
      valveCfg({ travelTimeMs: 0 }),
      new Map(valveOnoffTagDefs().map((d) => [d.name, d])),
    );
    expect(diags.some((d) => d.code === 'PL-E001')).toBe(true);
  });

  it("bothCmdPolicy chỉ nhận 'hold' (OQ-277)", () => {
    const parsed = valveOnoffModel.paramsSchema.safeParse({
      ...valveOnoffModel.defaultParams,
      bothCmdPolicy: 'open',
    });
    expect(parsed.success).toBe(false);
  });

  it('đăng ký trong defaultRegistry, version string 1.0.0', () => {
    expect(defaultRegistry.has('valve_onoff')).toBe(true);
    expect(defaultRegistry.get('valve_onoff')).toBe(valveOnoffModel);
    expect(valveOnoffModel.version).toBe('1.0.0');
  });
});

describe('valve_onoff — state machine (M2 §7.3)', () => {
  it('CLOSED → OPENING → OPEN → CLOSING → CLOSED (bảng B)', () => {
    const setup = makeValveOnoffSetup();
    runOpen(setup, 5100);
    expect(obsOf(setup.engine, 'state')).toBe('OPEN');
    const { engine, tags } = setup;
    const closeH = setup.handles['closeCmd'] as TagHandle;
    const openH = setup.handles['openCmd'] as TagHandle;
    for (let t = 5110; t <= 6000; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    tags.set(openH, false, 'plc');
    tags.set(closeH, true, 'plc');
    engine.step(6010, 10);
    tags.flush();
    expect(obsOf(engine, 'state')).toBe('CLOSING');
    for (let t = 6020; t <= 11000; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    expect(obsOf(engine, 'state')).toBe('CLOSED');
    expect(stateOf(engine).posPct).toBe(0);
  });

  it('dừng giữa hành trình, không lệnh → INTERMEDIATE, moving=false', () => {
    const setup = makeValveOnoffSetup();
    runOpen(setup, 1000);
    expect(stateOf(setup.engine).posPct).toBeCloseTo(18, 2);
    const { engine, tags } = setup;
    const openH = setup.handles['openCmd'] as TagHandle;
    tags.set(openH, false, 'plc');
    engine.step(1010, 10);
    tags.flush();
    expect(obsOf(engine, 'state')).toBe('INTERMEDIATE');
    expect(obsOf(engine, 'moving')).toBe(false);
    expect(stateOf(engine).posPct).toBeCloseTo(18, 2);
  });

  it('singleSolenoid: openCmd=false → tự đóng (dir −1)', () => {
    const setup = makeValveOnoffSetup({ params: { singleSolenoid: true } });
    runOpen(setup, 5100);
    expect(obsOf(setup.engine, 'state')).toBe('OPEN');
    const { engine, tags } = setup;
    const openH = setup.handles['openCmd'] as TagHandle;
    tags.set(openH, false, 'plc');
    engine.step(5110, 10);
    tags.flush();
    expect(obsOf(engine, 'state')).toBe('CLOSING');
    for (let t = 5120; t <= 10100; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    expect(obsOf(engine, 'state')).toBe('CLOSED');
  });

  it('bothCmd: warn đúng 1 lần/đời thiết bị (OQ-277)', () => {
    const setup = makeValveOnoffSetup();
    const { engine, tags } = setup;
    const openH = setup.handles['openCmd'] as TagHandle;
    const closeH = setup.handles['closeCmd'] as TagHandle;
    for (let t = 0; t <= 2000; t += 10) {
      engine.step(t, 10);
      tags.flush();
      if (t === 100) {
        tags.set(openH, true, 'plc');
        tags.set(closeH, true, 'plc');
      }
      // Nhả rồi bấm lại cả hai lệnh ở T=1000 — warn không lặp.
      if (t === 1000) {
        tags.set(openH, false, 'plc');
        tags.set(closeH, false, 'plc');
      }
      if (t === 1100) {
        tags.set(openH, true, 'plc');
        tags.set(closeH, true, 'plc');
      }
    }
    const warns = engine.events().filter((e) => e.type === 'warn');
    expect(warns).toHaveLength(1);
    expect(warns[0]?.equipment).toBe('CR01_V01');
    expect(stateOf(engine).posPct).toBe(0);
  });
});

describe('valve_onoff — faults (M2 §7.3, OQ-275/276/278/279)', () => {
  it('faultNC=true: fault=true khi khỏe, false khi có lỗi (OQ-275)', () => {
    const setup = makeValveOnoffSetup({ params: { faultNC: true } });
    runOpen(setup, 1000);
    expect(setup.tags.get(setup.handles['fault'] as TagHandle)).toBe(true);
    setup.engine.injectFault({ target: { equipment: 'CR01_V01', fault: 'travelTimeout' }, when: { at: 'now' } });
    setup.engine.step(1010, 10);
    setup.tags.flush();
    expect(setup.tags.get(setup.handles['fault'] as TagHandle)).toBe(false);
  });

  it('stuckOpen ép pos=100 ngay cả khi không có lệnh mở', () => {
    const setup = makeValveOnoffSetup();
    setup.engine.injectFault({ target: { equipment: 'CR01_V01', fault: 'stuckOpen' }, when: { at: 'now' } });
    setup.engine.step(0, 10);
    setup.tags.flush();
    expect(stateOf(setup.engine).posPct).toBe(100);
    expect(obsOf(setup.engine, 'state')).toBe('OPEN');
    expect(setup.tags.get(setup.handles['openLs'] as TagHandle)).toBe(true);
  });

  it('slowTravel không params → factor mặc định 1, không crash', () => {
    const setup = makeValveOnoffSetup();
    runOpen(setup, 1000);
    setup.engine.injectFault({ target: { equipment: 'CR01_V01', fault: 'slowTravel' }, when: { at: 'now' } });
    const { engine, tags } = setup;
    for (let t = 1010; t <= 2000; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    // 90 bước × 0.2 + 100 bước × 0.2 = 38 (factor 1).
    expect(stateOf(engine).posPct).toBeCloseTo(38, 2);
  });

  it('travelTimeout đóng băng pos, clear xong chạy tiếp (OQ-276)', () => {
    const setup = makeValveOnoffSetup();
    runOpen(setup, 1000);
    const id = setup.engine.injectFault({
      target: { equipment: 'CR01_V01', fault: 'travelTimeout' },
      when: { at: 'now' },
    });
    const { engine, tags } = setup;
    for (let t = 1010; t <= 2000; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    expect(stateOf(engine).posPct).toBeCloseTo(18, 2);
    expect(setup.tags.get(setup.handles['fault'] as TagHandle)).toBe(true);
    expect(setup.engine.clearFault(id)).toBe(true);
    engine.step(2010, 10);
    tags.flush();
    expect(stateOf(engine).posPct).toBeCloseTo(18.2, 2);
    expect(setup.tags.get(setup.handles['fault'] as TagHandle)).toBe(false);
  });
});

describe('valve_onoff — snapshot/restore (M2 §11.2)', () => {
  it('snapshot giữa OPENING, chạy tiếp, restore, chạy lại → trace giống hệt', () => {
    const setup = makeValveOnoffSetup();
    const { engine, tags } = setup;
    const cmdH = setup.handles['openCmd'] as TagHandle;
    let snapPlant: unknown;
    let snapTags: TagDBSnapshot | undefined;
    let hasher1: TraceHasher | undefined;
    for (let t = 0; t <= 2000; t += 10) {
      engine.step(t, 10);
      tags.flush();
      if (t === 100) tags.set(cmdH, true, 'plc');
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
    const rewound = engine.getState('CR01_V01') as ValveOnoffState;
    expect(obsOf(engine, 'state')).toBe('OPENING');
    // T=1000: 90 bước × 0.2 = 18.
    expect(Math.abs(rewound.posPct - 18)).toBeLessThanOrEqual(0.01);
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
