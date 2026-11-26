// Bảng slot số (A21, STATE §28 commit 6): đủ key cho mọi model, slot sai →
// lỗi nêu tên model/thiết bị, FaultManager by-slot + restore.
// Proxy conveyor (slots forward) đã có cover hành vi trong golden
// conveyor_simple (pullCordTrip) — xem packages/plant/golden/.

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ManualClock, TagDB } from '@vcs/kernel';
import { PlantEngine, type PlantConfig } from './engine.js';
import { FaultManager } from './faults.js';
// Import qua package entry để side-effect đăng ký 9 model thật vào
// defaultRegistry chạy (models/index.ts) — như engine.test.ts.
import './index.js';
import {
  createModelRegistry,
  defaultRegistry,
  type EquipmentModel,
  type FaultSlot,
  type ObsSlot,
  type RoleSlot,
} from './registry.js';
import { makeModelSetup, modelEquipmentId, runSteps } from './test-helpers.js';

/** 9 model đã đăng ký (P2.2 + P2.3). */
const MODELS = [
  'motor_dol',
  'motor_vfd',
  'valve_onoff',
  'valve_ctrl',
  'damper',
  'analog_sensor',
  'switch_di',
  'silo_bin',
  'conveyor_simple',
] as const;

describe('bảng slot (A21)', () => {
  it.each(MODELS)('model %s: mọi observable có giá trị sau 200 bước (slot đủ key)', (model) => {
    const { engine, tags } = makeModelSetup(model);
    runSteps(engine, tags, 0, 200);
    const def = defaultRegistry.get(model);
    expect(def).toBeDefined();
    if (def === undefined) throw new Error(`test: model ${model} chưa đăng ký trong defaultRegistry.`);
    for (const ob of def.observables) {
      expect(engine.getObservable(modelEquipmentId(model), ob.key)).not.toBeUndefined();
    }
  });

  it.each(MODELS)('model %s: bảng slot tất định — hai engine fresh cho cùng obs + events', (model) => {
    const a = makeModelSetup(model);
    const b = makeModelSetup(model);
    runSteps(a.engine, a.tags, 0, 500);
    runSteps(b.engine, b.tags, 0, 500);
    const def = defaultRegistry.get(model);
    if (def === undefined) throw new Error(`test: model ${model} chưa đăng ký trong defaultRegistry.`);
    for (const ob of def.observables) {
      expect(a.engine.getObservable(modelEquipmentId(model), ob.key)).toEqual(
        b.engine.getObservable(modelEquipmentId(model), ob.key),
      );
    }
    expect(a.engine.events()).toEqual(b.engine.events());
  });
});

/** Model cố tình dùng slot ngoài bảng (99) — theo param `which`.
 *  roles: [] — slot sai là số ngoài bảng, không cần role thật. */
const badSlotModel: EquipmentModel<{ which: string }, { n: number }> = {
  type: 'bad_slot',
  version: '1',
  description: 'Model probe — slot sai (chỉ dùng trong slots.test.ts).',
  roles: [
    {
      role: 'runCmd',
      kind: 'DO',
      dataType: 'Bool',
      description: 'Lệnh chạy (probe — không dùng, chỉ để registry chấp nhận model)',
      synonyms: [],
      descKeywords: [],
      optional: true,
    },
  ],
  observables: [{ key: 'n', description: 'Số đếm probe' }],
  faults: [],
  paramsSchema: z.object({ which: z.string() }),
  defaultParams: { which: 'cmd' },
  init: () => ({ n: 0 }),
  step: (ctx, slots) => {
    const which = ctx.params.which;
    if (which === 'cmd') {
      ctx.cmd(99 as RoleSlot);
    } else if (which === 'emit') {
      ctx.emit(99 as RoleSlot, true);
    } else if (which === 'setObs') {
      ctx.setObs(99 as ObsSlot, 1);
    } else {
      ctx.fault(99 as FaultSlot);
    }
    ctx.setObs(slots.obs.n, 0);
  },
};

function badSlotEngine(which: string): PlantEngine {
  const models = createModelRegistry();
  models.register(badSlotModel);
  const cfg: PlantConfig = {
    stepMs: 10,
    seed: 42,
    equipment: [{ id: 'BAD01', model: 'bad_slot', params: { which } }],
    tags: new Map(),
  };
  return new PlantEngine(cfg, new TagDB([], new ManualClock()), models);
}

describe('slot sai → lỗi nêu tên', () => {
  it.each(['cmd', 'emit', 'setObs', 'fault'] as const)(
    'ctx.%s với slot 99 → lỗi nêu tên model + thiết bị',
    (which) => {
      const engine = badSlotEngine(which);
      expect(() => {
        engine.step(0, 10);
      }).toThrow(/bad_slot/);
      expect(() => {
        engine.step(0, 10);
      }).toThrow(/BAD01/);
    },
  );
});

describe('FaultManager by-slot', () => {
  it('by-slot khớp by-name; slot sai/thiết bị chưa đăng ký → lỗi; restore giữ by-slot', () => {
    const m = new FaultManager();
    m.registerEquipment('E1', ['a', 'b']);
    m.inject({ target: { equipment: 'E1', fault: 'a' }, when: { at: 'now' } }, 100);
    m.advance(100);
    expect(m.equipmentFaultBySlot('E1', 0).active).toBe(true);
    expect(m.equipmentFault('E1', 'a').active).toBe(true);
    expect(m.equipmentFaultBySlot('E1', 1).active).toBe(false);
    expect(() => m.equipmentFaultBySlot('E1', 2)).toThrow(/E1/);
    expect(() => m.equipmentFaultBySlot('E2', 0)).toThrow(/E2/);

    const m2 = new FaultManager();
    m2.registerEquipment('E1', ['a', 'b']);
    m2.restore(m.snapshot());
    expect(m2.equipmentFaultBySlot('E1', 0).active).toBe(true);
    expect(m2.equipmentFaultBySlot('E1', 1).active).toBe(false);
  });
});
