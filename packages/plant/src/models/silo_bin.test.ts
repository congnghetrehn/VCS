// Unit test silo_bin + named sources (M2 §7.7, P2.3 — OQ-290/291, STATE §26).
// Bảng F kiểm qua golden; ở đây kiểm init, clamp, lag, hysteresis biên,
// named sources (const/ramp/link/topo/snapshot/restore/validate).

import type { TagHandle } from '@vcs/kernel';
import { ManualClock, TagDB } from '@vcs/kernel';
import { describe, expect, it } from 'vitest';

import { PlantEngine, validatePlantConfig } from '../engine.js';
import type { PlantConfig } from '../engine.js';
import { createModelRegistry } from '../registry.js';
import {
  analogSensorTagDefs,
  makeModelSetup,
  makeSiloBinSetup,
  siloBinTagDefs,
} from '../test-helpers.js';
import { analogSensorModel } from './analog_sensor.js';
import { siloBinModel } from './silo_bin.js';

describe('silo_bin model', () => {
  it('đăng ký trong registry, 4 role đều tùy chọn, không equipment fault', () => {
    const setup = makeSiloBinSetup({});
    expect(setup.engine.getState('CR01_SIL01')).toMatchObject({ massT: 30, levelPct: 30 });
    expect(siloBinModel.roles).toHaveLength(4);
    expect(siloBinModel.roles.every((r) => r.optional === true)).toBe(true);
    expect(siloBinModel.faults).toHaveLength(0);
    expect(siloBinModel.hasSource).toBe(true);
  });

  it('không cấu hình named source → mass đứng yên (mặc định const 0)', () => {
    const s = makeSiloBinSetup({});
    for (let t = 0; t <= 1000; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
    }
    expect(s.engine.getObservable('CR01_SIL01', 'massT')).toBe(30);
    expect(s.engine.getObservable('CR01_SIL01', 'inflowTph')).toBe(0);
    expect(s.engine.getObservable('CR01_SIL01', 'outflowTph')).toBe(0);
  });

  it('mass kẹp [0, capacityT], levelPct theo mass', () => {
    const s = makeSiloBinSetup({
      sources: {
        inflow: { kind: 'const', value: 36000 },
        outflow: { kind: 'const', value: 0 },
      },
    });
    for (let t = 0; t <= 1000; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
    }
    // 0.1 t/bước × 101 bước = 10.1 → 40.1.
    expect(s.engine.getObservable('CR01_SIL01', 'massT')).toBeCloseTo(40.1, 9);
    for (let t = 1010; t <= 10000; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
    }
    expect(s.engine.getObservable('CR01_SIL01', 'massT')).toBe(100);
    expect(s.engine.getObservable('CR01_SIL01', 'levelPct')).toBe(100);
  });

  it('levelLow hysteresis: bật ≤ 10, tắt khi > 12', () => {
    const s = makeSiloBinSetup({
      params: { initialLevelPct: 10 },
      sources: { outflow: { kind: 'const', value: 3600 } },
    });
    s.engine.step(0, 10);
    s.tags.flush();
    expect(s.tags.get(s.handles['levelLow'] as TagHandle)).toBe(true);
    // Đổi chiều: inflow 3600 → mass tăng; 12.01 tại T=2010 → low tắt.
    s.engine.setSource('CR01_SIL01', { kind: 'const', value: 3600 }, 'inflow');
    s.engine.setSource('CR01_SIL01', { kind: 'const', value: 0 }, 'outflow');
    for (let t = 10; t <= 2000; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
    }
    // mass(2000) = 9.99 + 0.01×200 = 11.99 → low vẫn true (> 12 mới tắt).
    expect(s.engine.getObservable('CR01_SIL01', 'massT')).toBeCloseTo(11.99, 9);
    expect(s.tags.get(s.handles['levelLow'] as TagHandle)).toBe(true);
    s.engine.step(2010, 10);
    s.tags.flush();
    expect(s.engine.getObservable('CR01_SIL01', 'massT')).toBeCloseTo(12, 9);
    expect(s.tags.get(s.handles['levelLow'] as TagHandle)).toBe(true);
    s.engine.step(2020, 10);
    s.tags.flush();
    expect(s.engine.getObservable('CR01_SIL01', 'massT')).toBeCloseTo(12.01, 9);
    expect(s.tags.get(s.handles['levelLow'] as TagHandle)).toBe(false);
  });

  it('role tùy chọn chưa gán tag → engine vẫn chạy, emit bỏ qua', () => {
    const s = makeSiloBinSetup({
      omitRoles: ['levelHigh', 'levelLow', 'levelHighHigh'],
      sources: { inflow: { kind: 'const', value: 3600 } },
    });
    s.engine.step(0, 10);
    s.tags.flush();
    expect(s.engine.getObservable('CR01_SIL01', 'massT')).toBeCloseTo(30.01, 9);
    expect(s.engine.getObservable('CR01_SIL01', 'levelPct')).toBeCloseTo(30.01, 9);
  });

  it('snapshot/restore khôi phục mass + named source', () => {
    const s = makeSiloBinSetup({
      sources: { inflow: { kind: 'const', value: 3600 } },
    });
    for (let t = 0; t <= 1000; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
    }
    const snap = s.engine.snapshot();
    expect(s.engine.getObservable('CR01_SIL01', 'massT')).toBeCloseTo(31.01, 9);
    s.engine.setSource('CR01_SIL01', { kind: 'const', value: 36000 }, 'inflow');
    for (let t = 1010; t <= 2000; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
    }
    expect(s.engine.getObservable('CR01_SIL01', 'massT')).toBeGreaterThan(40);
    s.engine.restore(snap);
    expect(s.engine.getObservable('CR01_SIL01', 'massT')).toBeCloseTo(31.01, 9);
    expect(s.engine.getObservable('CR01_SIL01', 'inflowTph')).toBe(3600);
  });
});

describe('named sources (OQ-290)', () => {
  it('const + ramp: inflow ramp 0→3600/10s cho inflowTph = 360 tại T=1000', () => {
    const s = makeSiloBinSetup({
      sources: { inflow: { kind: 'ramp', from: 0, to: 3600, durationMs: 10000 } },
    });
    for (let t = 0; t <= 1000; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
    }
    expect(s.engine.getObservable('CR01_SIL01', 'inflowTph')).toBe(360);
    // mass = 30 + Σ ramp(T)×10/3.6M ≈ 30.05 (tăng chậm đầu ramp).
    expect(s.engine.getObservable('CR01_SIL01', 'massT')).toBeGreaterThan(30);
    expect(s.engine.getObservable('CR01_SIL01', 'massT')).toBeLessThan(31);
  });

  it('link + scale: inflow = pv(sensor) × 72', () => {
    const defs = [...analogSensorTagDefs(), ...siloBinTagDefs()];
    const clock = new ManualClock();
    const tags = new TagDB(defs, clock);
    const models = createModelRegistry();
    models.register(analogSensorModel);
    models.register(siloBinModel);
    const cfg: PlantConfig = {
      stepMs: 10,
      seed: 42,
      equipment: [
        {
          id: 'CR01_TT01',
          model: 'analog_sensor',
          params: { engMin: 0, engMax: 100, unit: '°C', tauMs: 0, noiseStd: 0 },
          signals: { raw: 'CR01_TT01' },
          source: { kind: 'const', value: 50 },
        },
        {
          id: 'CR01_SIL01',
          model: 'silo_bin',
          params: {},
          signals: {
            levelRaw: 'CR01_SIL01_LEVEL',
            levelHigh: 'CR01_SIL01_HIGH',
            levelLow: 'CR01_SIL01_LOW',
            levelHighHigh: 'CR01_SIL01_HH',
          },
          sources: { inflow: { kind: 'link', equipment: 'CR01_TT01', observable: 'pv', scale: 72 } },
        },
      ],
      tags: new Map(defs.map((d) => [d.name, d])),
    };
    const engine = new PlantEngine(cfg, tags, models);
    for (let t = 0; t <= 1000; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    // inflow = 50×72 = 3600 → mass 31.01 như bảng F.
    expect(engine.getObservable('CR01_SIL01', 'inflowTph')).toBe(3600);
    expect(engine.getObservable('CR01_SIL01', 'massT')).toBeCloseTo(31.01, 9);
  });

  it('link treo (thiết bị không tồn tại) → PL-E001', () => {
    const defs = siloBinTagDefs();
    const tags = new TagDB(defs, new ManualClock());
    const models = createModelRegistry();
    models.register(siloBinModel);
    const cfg: PlantConfig = {
      stepMs: 10,
      seed: 42,
      equipment: [
        {
          id: 'CR01_SIL01',
          model: 'silo_bin',
          params: {},
          signals: { levelRaw: 'CR01_SIL01_LEVEL' },
          sources: { inflow: { kind: 'link', equipment: 'CR01_NOPE', observable: 'pv' } },
        },
      ],
      tags: new Map(defs.map((d) => [d.name, d])),
    };
    expect(validatePlantConfig(cfg, cfg.tags, models).some((d) => d.code === 'PL-E001')).toBe(true);
    expect(() => new PlantEngine(cfg, tags, models)).toThrow(/PL-E001/);
  });

  it('chu trình link qua named sources → PL-E020', () => {
    const defs = siloBinTagDefs();
    const tags = new TagDB(defs, new ManualClock());
    const models = createModelRegistry();
    models.register(siloBinModel);
    const cfg: PlantConfig = {
      stepMs: 10,
      seed: 42,
      equipment: [
        {
          id: 'CR01_SIL01',
          model: 'silo_bin',
          params: {},
          signals: { levelRaw: 'CR01_SIL01_LEVEL' },
          sources: { inflow: { kind: 'link', equipment: 'CR01_SIL02', observable: 'levelPct' } },
        },
        {
          id: 'CR01_SIL02',
          model: 'silo_bin',
          params: {},
          signals: {},
          sources: { inflow: { kind: 'link', equipment: 'CR01_SIL01', observable: 'levelPct' } },
        },
      ],
      tags: new Map(defs.map((d) => [d.name, d])),
    };
    expect(validatePlantConfig(cfg, cfg.tags, models).some((d) => d.code === 'PL-E020')).toBe(true);
    expect(() => new PlantEngine(cfg, tags, models)).toThrow(/PL-E020/);
  });

  it('setSource/setManual với name tạo/cập nhật named source', () => {
    const s = makeSiloBinSetup({});
    s.engine.setSource('CR01_SIL01', { kind: 'const', value: 7200 }, 'inflow');
    s.engine.step(0, 10);
    s.tags.flush();
    expect(s.engine.getObservable('CR01_SIL01', 'inflowTph')).toBe(7200);
    s.engine.setManual('CR01_SIL01', 1800, 'outflow');
    s.engine.step(10, 10);
    s.tags.flush();
    expect(s.engine.getObservable('CR01_SIL01', 'outflowTph')).toBe(1800);
  });

  it('ctx.source() không đối số vẫn là source chính (không đổi hành vi)', () => {
    const s = makeModelSetup('analog_sensor', { source: { kind: 'const', value: 50 } });
    s.engine.step(0, 10);
    s.tags.flush();
    expect(s.engine.getObservable('CR01_TT01', 'pv')).toBe(50);
  });
});
