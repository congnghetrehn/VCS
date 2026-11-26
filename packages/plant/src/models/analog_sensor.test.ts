// Unit test analog_sensor (M2 §7.5, P2.3 — OQ-284/285/286, STATE §26).
// Bảng D + noise + signal fault kiểm qua golden; ở đây kiểm validation,
// khởi tạo, snapshot/restore, registry và raw int.

import { describe, expect, it } from 'vitest';

import type { TagHandle } from '@vcs/kernel';
import { analogSensorModel } from './analog_sensor.js';
import { makeAnalogSensorSetup, makeModelSetup } from '../test-helpers.js';

describe('analog_sensor model', () => {
  it('đăng ký trong registry mặc định, 1 role raw AI Int, có source', () => {
    const setup = makeAnalogSensorSetup({ source: { kind: 'const', value: 50 } });
    expect(setup.engine.getState('CR01_TT01')).toMatchObject({ pv: 0, engMin: 0, engMax: 100 });
    expect(analogSensorModel.roles).toHaveLength(1);
    expect(analogSensorModel.roles[0]).toMatchObject({ role: 'raw', kind: 'AI', dataType: 'Int' });
    expect(analogSensorModel.hasSource).toBe(true);
    expect(analogSensorModel.faults).toHaveLength(0);
    expect(Object.keys(analogSensorModel.presets ?? {}).sort()).toEqual([
      'drift',
      'noisy',
      'stuck',
      'wireBreak',
    ]);
  });

  it('thiếu engMin/engMax/unit → lỗi PL-E001 (OQ-284)', () => {
    // Params thiếu trường bắt buộc → validatePlantConfig báo PL-E001.
    expect(() =>
      makeModelSetup('analog_sensor', {
        params: { engMin: undefined, engMax: undefined, unit: undefined, tauMs: 0, noiseStd: 0 },
      }),
    ).toThrow(/PL-E001/);
    expect(() =>
      makeModelSetup('analog_sensor', {
        params: { engMin: 0, engMax: 100, unit: '°C', tauMs: 0, noiseStd: 0 },
      }),
    ).not.toThrow();
  });

  it('engMin >= engMax → lỗi PL-E001 (OQ-284)', () => {
    expect(() =>
      makeModelSetup('analog_sensor', {
        params: { engMin: 100, engMax: 100, unit: '°C', tauMs: 0, noiseStd: 0 },
      }),
    ).toThrow(/PL-E001/);
    expect(() =>
      makeModelSetup('analog_sensor', {
        params: { engMin: 100, engMax: 0, unit: '°C', tauMs: 0, noiseStd: 0 },
      }),
    ).toThrow(/PL-E001/);
  });

  it('pv khởi tạo = initialValue ?? 0 (OQ-286)', () => {
    const s1 = makeAnalogSensorSetup({
      source: { kind: 'const', value: 50 },
      params: { tauMs: 0, noiseStd: 0, initialValue: 20 },
    });
    s1.engine.step(0, 10);
    s1.tags.flush();
    // tau 0 → pv = source ngay bước đầu; initialValue chỉ là điểm xuất phát.
    expect(s1.engine.getObservable('CR01_TT01', 'pv')).toBeCloseTo(50, 9);
    const s2 = makeAnalogSensorSetup({
      source: { kind: 'const', value: 50 },
      params: { tauMs: 100000, noiseStd: 0, initialValue: 20 },
    });
    s2.engine.step(0, 10);
    s2.tags.flush();
    // tau rất lớn → pv gần như giữ initialValue sau 1 bước.
    expect(s2.engine.getObservable('CR01_TT01', 'pv')).toBeCloseTo(20.002, 2);
  });

  it('bảng D: raw int theo pv (T=10 → 2506, T=100 → 9222)', () => {
    const s = makeAnalogSensorSetup({
      source: { kind: 'const', value: 50 },
      params: { tauMs: 100, noiseStd: 0 },
    });
    for (let t = 0; t <= 100; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
    }
    expect(s.engine.getObservable('CR01_TT01', 'pv')).toBeCloseTo(33.3564, 3);
    expect(s.tags.get(s.handles['raw'] as TagHandle)).toBe(9222);
    expect(s.engine.getObservable('CR01_TT01', 'raw')).toBe(9222);
  });

  it('noiseStd==0 không tiêu rand — 2 engine cùng seed cho cùng pv (OQ-285)', () => {
    const a = makeAnalogSensorSetup({
      source: { kind: 'const', value: 50 },
      params: { tauMs: 0, noiseStd: 0 },
    });
    const b = makeAnalogSensorSetup({
      source: { kind: 'const', value: 50 },
      params: { tauMs: 0, noiseStd: 0 },
    });
    for (let t = 0; t <= 100; t += 10) {
      a.engine.step(t, 10);
      b.engine.step(t, 10);
    }
    a.tags.flush();
    b.tags.flush();
    expect(a.tags.get(a.handles['raw'] as TagHandle)).toBe(b.tags.get(b.handles['raw'] as TagHandle));
  });

  it('noiseStd>0 tất định theo seed — 2 engine cùng seed cho cùng tag (OQ-285)', () => {
    const a = makeAnalogSensorSetup({
      source: { kind: 'const', value: 50 },
      params: { tauMs: 0, noiseStd: 1 },
    });
    const b = makeAnalogSensorSetup({
      source: { kind: 'const', value: 50 },
      params: { tauMs: 0, noiseStd: 1 },
    });
    for (let t = 0; t <= 50; t += 10) {
      a.engine.step(t, 10);
      b.engine.step(t, 10);
    }
    a.tags.flush();
    b.tags.flush();
    expect(a.tags.get(a.handles['raw'] as TagHandle)).toBe(b.tags.get(b.handles['raw'] as TagHandle));
    // Giá trị bước đầu khớp script tham chiếu: noise 0.2963 → raw 13906.
    expect(a.tags.get(a.handles['raw'] as TagHandle)).toBe(13404);
  });

  it('snapshot/restore khôi phục pv', () => {
    const s = makeAnalogSensorSetup({
      source: { kind: 'const', value: 50 },
      params: { tauMs: 100, noiseStd: 0 },
    });
    for (let t = 0; t <= 100; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
    }
    const snap = s.engine.snapshot();
    for (let t = 110; t <= 500; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
    }
    expect(s.engine.getObservable('CR01_TT01', 'pv')).toBeCloseTo(49.6952, 3);
    s.engine.restore(snap);
    expect(s.engine.getObservable('CR01_TT01', 'pv')).toBeCloseTo(33.3564, 3);
  });

  it('preset wireBreak → tag raw 32767', () => {
    const s = makeAnalogSensorSetup({
      source: { kind: 'const', value: 50 },
      params: { tauMs: 0, noiseStd: 0 },
    });
    s.engine.step(0, 10);
    s.tags.flush();
    expect(s.tags.get(s.handles['raw'] as TagHandle)).toBe(13824);
    s.engine.applyPreset('CR01_TT01', 'wireBreak');
    s.engine.step(10, 10);
    s.tags.flush();
    expect(s.tags.get(s.handles['raw'] as TagHandle)).toBe(32767);
  });

  it('source mặc định khi hasSource mà không cấu hình → const 0', () => {
    // makeModelSetup không truyền source → engine mặc định const 0.
    const s = makeModelSetup('analog_sensor', {});
    s.engine.step(0, 10);
    s.tags.flush();
    expect(s.engine.getObservable('CR01_TT01', 'pv')).toBe(0);
  });
});
