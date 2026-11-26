// Model damper (M2 §7.4, P2.3 — OQ-298).
// Derive identity + tốc độ ramp chậm hơn valve_ctrl + snapshot/restore.

import { describe, expect, it } from 'vitest';

import { TraceHasher, type TagDBSnapshot, type TagHandle } from '@vcs/kernel';
import { defaultRegistry } from '../index.js';
import { damperTagDefs, makeDamperSetup } from '../test-helpers.js';
import { damperModel } from './damper.js';
import { valveCtrlModel } from './valve_ctrl.js';

describe('damper — derive (M2 §7.4, OQ-298)', () => {
  it('defaultParams.strokeTimeS=30 (valve_ctrl là 20)', () => {
    expect(damperModel.defaultParams.strokeTimeS).toBe(30);
    expect(valveCtrlModel.defaultParams.strokeTimeS).toBe(20);
  });

  it('cùng paramsSchema/roles/faults với valve_ctrl (deriveModel không override)', () => {
    expect(damperModel.paramsSchema).toBe(valveCtrlModel.paramsSchema);
    expect(damperModel.roles).toBe(valveCtrlModel.roles);
    expect(damperModel.faults).toBe(valveCtrlModel.faults);
    expect(damperModel.type).toBe('damper');
    // step/init: deriveModel spread giữ nguyên tham chiếu (đã test ở registry.test.ts);
    // hành vi dùng step của valve_ctrl được chứng minh bằng test ramp bên dưới.
  });

  it('đăng ký trong defaultRegistry, version string 1.0.0', () => {
    expect(defaultRegistry.has('damper')).toBe(true);
    expect(defaultRegistry.get('damper')).toBe(damperModel);
    expect(damperModel.version).toBe('1.0.0');
  });

  it('ramp chậm hơn valve_ctrl: 300 bước → pos 10 (valve_ctrl 15)', () => {
    const setup = makeDamperSetup();
    const { engine, tags } = setup;
    const refH = setup.handles['posRef'] as TagHandle;
    for (let t = 0; t <= 3100; t += 10) {
      engine.step(t, 10);
      tags.flush();
      if (t === 100) tags.set(refH, Math.round(0.8 * 27648), 'plc');
    }
    const st = engine.getState('CR01_D01') as { posPct: number };
    expect(st.posPct).toBeCloseTo(10, 2);
  });

  it('tag defs đủ 5 role, scaling posRef/posFb 0..100% ↔ 0..27648', () => {
    const defs = damperTagDefs();
    expect(defs.map((d) => d.name)).toEqual([
      'CR01_D01_POS_REF',
      'CR01_D01_POS_FB',
      'CR01_D01_FAULT',
      'CR01_D01_CLOSED_LS',
      'CR01_D01_OPEN_LS',
    ]);
    const ref = defs[0]?.signal?.scaling;
    expect(ref).toEqual({ rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: '%' });
  });
});

describe('damper — snapshot/restore (M2 §11.2)', () => {
  it('snapshot giữa hành trình, chạy tiếp, restore, chạy lại → trace giống hệt', () => {
    const setup = makeDamperSetup();
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
    const rewound = engine.getState('CR01_D01') as { posPct: number };
    // T=1000: 90 bước × 0.0333 = 3.0.
    expect(Math.abs(rewound.posPct - 3)).toBeLessThanOrEqual(0.01);
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
