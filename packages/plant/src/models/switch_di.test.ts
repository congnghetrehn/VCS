// Unit test switch_di (M2 §7.6, P2.3 — OQ-287/288/289, STATE §26).
// Bảng E/K kiểm qua golden; ở đây kiểm validation, kind defaults,
// hysteresis biên, delay, snapshot/restore, link source.

import type { TagHandle } from '@vcs/kernel';
import { ManualClock, TagDB } from '@vcs/kernel';
import { describe, expect, it } from 'vitest';

import { PlantEngine } from '../engine.js';
import type { PlantConfig } from '../engine.js';
import { createModelRegistry } from '../registry.js';
import { analogSensorTagDefs, makeModelSetup, makeSwitchDiSetup, switchDiTagDefs } from '../test-helpers.js';
import { analogSensorModel } from './analog_sensor.js';
import { switchDiModel } from './switch_di.js';

describe('switch_di model', () => {
  it('đăng ký trong registry, 1 role di DI Bool, có source', () => {
    const setup = makeSwitchDiSetup({ source: { kind: 'const', value: 60 } });
    expect(setup.engine.getState('CR01_LS01')).toMatchObject({ active: false, cond: false });
    expect(switchDiModel.roles).toHaveLength(1);
    expect(switchDiModel.roles[0]).toMatchObject({ role: 'di', kind: 'DI', dataType: 'Bool' });
    expect(switchDiModel.hasSource).toBe(true);
    expect(switchDiModel.faults.map((f) => f.id)).toEqual(['stuckActive', 'stuckInactive', 'chatter']);
  });

  it('thiếu kind → lỗi PL-E001 (OQ-287)', () => {
    expect(() =>
      makeModelSetup('switch_di', {
        params: { kind: undefined },
      }),
    ).toThrow(/PL-E001/);
    expect(() =>
      makeModelSetup('switch_di', { params: { kind: 'generic' } }),
    ).not.toThrow();
  });

  it('kind sai enum → lỗi PL-E001', () => {
    expect(() =>
      makeModelSetup('switch_di', { params: { kind: 'nope' } }),
    ).toThrow(/PL-E001/);
  });

  it('pull_cord ép invert=true, params.invert bị bỏ qua (OQ-287)', () => {
    const s = makeSwitchDiSetup({
      source: { kind: 'manual' },
      params: { kind: 'pull_cord', invert: false },
    });
    // manualValue mặc định của engine là số 0 — đặt false tường minh.
    s.engine.setManual('CR01_LS01', false);
    s.engine.step(0, 10);
    s.tags.flush();
    // manual=false → cond=false → active=false → di=true (invert ép).
    expect(s.tags.get(s.handles['di'] as TagHandle)).toBe(true);
    s.engine.setManual('CR01_LS01', true);
    s.engine.step(10, 10);
    s.tags.flush();
    expect(s.tags.get(s.handles['di'] as TagHandle)).toBe(false);
  });

  it('zero_speed ép condition=lt (OQ-287)', () => {
    const s = makeSwitchDiSetup({
      source: { kind: 'const', value: 10 },
      params: { kind: 'zero_speed', threshold: 5, condition: 'gt' },
    });
    s.engine.step(0, 10);
    s.tags.flush();
    // lt: 10 > 5 → cond=false → di=false (nếu dùng gt thì 10>=5 → true).
    expect(s.tags.get(s.handles['di'] as TagHandle)).toBe(false);
    s.engine.setSource('CR01_LS01', { kind: 'const', value: 3 });
    s.engine.step(10, 10);
    s.tags.flush();
    expect(s.tags.get(s.handles['di'] as TagHandle)).toBe(true);
  });

  it('threshold default 0 — source số 0 với gt → cond true tại biên', () => {
    const s = makeSwitchDiSetup({
      source: { kind: 'const', value: 0 },
      params: { kind: 'generic' },
    });
    s.engine.step(0, 10);
    s.tags.flush();
    // gt dùng hysteresisStep (>=): 0 >= 0 → cond=true.
    expect(s.engine.getObservable('CR01_LS01', 'active')).toBe(true);
  });

  it('hysteresis gt: bật tại threshold, tắt khi ≤ threshold − hyst', () => {
    const s = makeSwitchDiSetup({
      source: { kind: 'const', value: 50 },
      params: { kind: 'generic', threshold: 50, hysteresis: 5 },
    });
    s.engine.step(0, 10);
    s.tags.flush();
    expect(s.engine.getObservable('CR01_LS01', 'active')).toBe(true);
    s.engine.setSource('CR01_LS01', { kind: 'const', value: 46 });
    s.engine.step(10, 10);
    s.tags.flush();
    // 46 > 45 → vẫn true.
    expect(s.engine.getObservable('CR01_LS01', 'active')).toBe(true);
    s.engine.setSource('CR01_LS01', { kind: 'const', value: 45 });
    s.engine.step(20, 10);
    s.tags.flush();
    expect(s.engine.getObservable('CR01_LS01', 'active')).toBe(false);
  });

  it('initialActive=true — active ban đầu true, off-delay giữ rồi tắt', () => {
    const s = makeSwitchDiSetup({
      source: { kind: 'const', value: 0 },
      params: { kind: 'generic', threshold: 50, initialActive: true, offDelayMs: 200 },
    });
    s.engine.step(0, 10);
    s.tags.flush();
    // cond=false ngay từ đầu; off-delay giữ active — bước false đầu tiên
    // (T=0) đã tính 10 ms nên hết hạn tại T=190 (quy ước offDelayStep).
    expect(s.engine.getObservable('CR01_LS01', 'active')).toBe(true);
    for (let t = 10; t <= 180; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
    }
    expect(s.engine.getObservable('CR01_LS01', 'active')).toBe(true);
    s.engine.step(190, 10);
    s.tags.flush();
    expect(s.engine.getObservable('CR01_LS01', 'active')).toBe(false);
  });

  it('snapshot/restore khôi phục active + timer', () => {
    const s = makeSwitchDiSetup({
      source: { kind: 'const', value: 60 },
      params: { kind: 'generic', threshold: 50, onDelayMs: 100 },
    });
    for (let t = 0; t <= 50; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
    }
    const snap = s.engine.snapshot();
    for (let t = 60; t <= 200; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
    }
    expect(s.engine.getObservable('CR01_LS01', 'active')).toBe(true);
    s.engine.restore(snap);
    expect(s.engine.getObservable('CR01_LS01', 'active')).toBe(false);
  });

  it('source link tới observable số của thiết bị khác (analog_sensor pv)', () => {
    const defs = [...analogSensorTagDefs(), ...switchDiTagDefs()];
    const clock = new ManualClock();
    const tags = new TagDB(defs, clock);
    const models = createModelRegistry();
    models.register(analogSensorModel);
    models.register(switchDiModel);
    const cfg: PlantConfig = {
      stepMs: 10,
      seed: 42,
      equipment: [
        {
          id: 'CR01_TT01',
          model: 'analog_sensor',
          params: { engMin: 0, engMax: 100, unit: '°C', tauMs: 0, noiseStd: 0 },
          signals: { raw: 'CR01_TT01' },
          source: { kind: 'const', value: 60 },
        },
        {
          id: 'CR01_LS01',
          model: 'switch_di',
          params: { kind: 'generic', threshold: 50 },
          signals: { di: 'CR01_LS01' },
          source: { kind: 'link', equipment: 'CR01_TT01', observable: 'pv' },
        },
      ],
      tags: new Map(defs.map((d) => [d.name, d])),
    };
    const engine = new PlantEngine(cfg, tags, models);
    const diH = tags.handle('CR01_LS01') as TagHandle;
    engine.step(0, 10);
    tags.flush();
    // pv=60 > 50 → cond=true → di=true.
    expect(tags.get(diH)).toBe(true);
    engine.setSource('CR01_TT01', { kind: 'const', value: 40 });
    engine.step(10, 10);
    tags.flush();
    expect(tags.get(diH)).toBe(false);
  });

  it('source link bool — cond = value trực tiếp', () => {
    const s = makeSwitchDiSetup({
      source: { kind: 'manual' },
      params: { kind: 'generic' },
    });
    s.engine.setManual('CR01_LS01', true);
    s.engine.step(0, 10);
    s.tags.flush();
    expect(s.tags.get(s.handles['di'] as TagHandle)).toBe(true);
  });

  it('chatter không periodMs → mặc định 100 ms', () => {
    const s = makeSwitchDiSetup({
      source: { kind: 'const', value: 60 },
      params: { kind: 'generic' },
    });
    s.engine.step(0, 10);
    s.tags.flush();
    expect(s.tags.get(s.handles['di'] as TagHandle)).toBe(true);
    s.engine.injectFault({
      target: { equipment: 'CR01_LS01', fault: 'chatter' },
      when: { at: 'now' },
    });
    s.engine.step(10, 10);
    s.tags.flush();
    // sinceMs=0; T=10: floor(10/100)=0 → không lật.
    expect(s.tags.get(s.handles['di'] as TagHandle)).toBe(true);
    for (let t = 20; t <= 100; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
    }
    // T=100: floor(100/100)=1 → lật → false.
    expect(s.tags.get(s.handles['di'] as TagHandle)).toBe(false);
  });
});
