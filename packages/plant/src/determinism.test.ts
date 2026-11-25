// Determinism (M2 §5.1, bảng D) — 2 run độc lập, đảo thứ tự khai báo, seed.
// TraceHasher phải giống hệt khi cùng seed/config; khác seed (+noise) → khác hash.

import { describe, expect, it } from 'vitest';

import { ManualClock, TagDB, TraceHasher, type TagHandle } from '@vcs/kernel';
import type { EquipmentInstance, TagDef } from '@vcs/schemas';

import { PlantEngine, type PlantConfig } from './engine.js';
import { createModelRegistry } from './registry.js';
import {
  fakeMotorModel,
  fakeSensorModel,
  makeMotorSetup,
  motorTagDefs,
  mustHandle,
  sensorTagDefs,
} from './test-helpers.js';

/** Chạy kịch bản motor chuẩn (runCmd=1 tại T=100, tới T=600) với hasher từ T=0. */
function runMotorScenario(seed: number, noiseStd?: number): string {
  const { engine, tags, cmdH } = makeMotorSetup({ seed });
  const hasher = new TraceHasher(tags);
  if (noiseStd !== undefined) {
    engine.injectFault({
      target: { equipment: 'CR01_M01', signal: 'currentFb', type: 'noise' },
      when: { at: 'now' },
      params: { std: noiseStd },
    });
  }
  for (let t = 0; t <= 600; t += 10) {
    if (t === 100) tags.set(cmdH, true, 'plc');
    engine.step(t, 10);
    tags.flush();
  }
  return hasher.hash();
}

describe('determinism (bảng D)', () => {
  it('2 run độc lập cùng seed/config → hash giống hệt', () => {
    expect(runMotorScenario(42)).toBe(runMotorScenario(42));
  });

  it('đảo thứ tự khai báo equipment (motor+sensor link) → hash giống hệt', () => {
    const build = (order: 'motor-first' | 'sensor-first'): string => {
      const defs = [...motorTagDefs(), ...sensorTagDefs()];
      const tags = new TagDB(defs, new ManualClock());
      const models = createModelRegistry();
      models.register(fakeMotorModel);
      models.register(fakeSensorModel);
      const motor: EquipmentInstance = {
        id: 'CR01_M01',
        model: 'fake_motor',
        params: { startDelayMs: 500 },
        signals: { runCmd: 'CR01_M01_RUN_CMD', runFb: 'CR01_M01_RUN_FB', currentFb: 'CR01_M01_CUR' },
      };
      const sensor: EquipmentInstance = {
        id: 'CR01_TT01',
        model: 'fake_sensor',
        signals: { value: 'CR01_TT01' },
        source: { kind: 'link', equipment: 'CR01_M01', observable: 'current' },
      };
      const cfg: PlantConfig = {
        stepMs: 10,
        seed: 42,
        equipment: order === 'motor-first' ? [motor, sensor] : [sensor, motor],
        tags: new Map<string, TagDef>(defs.map((d) => [d.name, d])),
      };
      const engine = new PlantEngine(cfg, tags, models);
      const hasher = new TraceHasher(tags);
      const cmdH: TagHandle = mustHandle(tags, 'CR01_M01_RUN_CMD');
      for (let t = 0; t <= 600; t += 10) {
        if (t === 100) tags.set(cmdH, true, 'plc');
        engine.step(t, 10);
        tags.flush();
      }
      return hasher.hash();
    };
    expect(build('sensor-first')).toBe(build('motor-first'));
  });

  it('cùng seed + noise → hash giống hệt; seed khác + noise → hash khác', () => {
    expect(runMotorScenario(42, 2)).toBe(runMotorScenario(42, 2));
    expect(runMotorScenario(43, 2)).not.toBe(runMotorScenario(42, 2));
  });
});
