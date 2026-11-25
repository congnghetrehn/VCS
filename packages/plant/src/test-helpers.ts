// Hỗ trợ test cho @vcs/plant — CHỈ dùng trong file *.test.ts.
// Model giả (fake_motor/fake_sensor) để kiểm engine; không phải model thật
// (OQ-246: model thật đầu tiên là motor_dol ở P2.2).

import { z } from 'zod';

import { ManualClock, TagDB, type TagHandle } from '@vcs/kernel';
import type { TagDef } from '@vcs/schemas';

import { PlantEngine, type PlantConfig } from './engine.js';
import { lagStep } from './delay.js';
import { createModelRegistry, type EquipmentModel } from './registry.js';

/** Params/state của fake_motor (bảng D, STATE §24). */
export interface FakeMotorParams {
  startDelayMs: number;
}
export interface FakeMotorState {
  t0: number | null;
}

/**
 * Motor giả: runCmd=1 → sau startDelayMs thì runFb=1, currentFb=42%.
 * Lỗi thiết bị `noStart` chặn khởi động; preset `stuckOn` kẹt runFb=1.
 */
export const fakeMotorModel: EquipmentModel<FakeMotorParams, FakeMotorState> = {
  type: 'fake_motor',
  version: '0.1.0',
  description: 'Motor giả cho test engine (không phải model thật).',
  roles: [
    {
      role: 'runCmd',
      kind: 'DO',
      dataType: 'Bool',
      description: 'Lệnh chạy từ PLC',
      synonyms: ['run', 'start'],
      descKeywords: ['run', 'start'],
    },
    {
      role: 'runFb',
      kind: 'DI',
      dataType: 'Bool',
      description: 'Phản hồi đang chạy',
      synonyms: ['running'],
      descKeywords: ['run', 'feedback'],
    },
    {
      role: 'currentFb',
      kind: 'AI',
      dataType: 'Int',
      unit: '%',
      optional: true,
      description: 'Dòng điện %',
      synonyms: ['current'],
      descKeywords: ['current'],
    },
  ],
  paramsSchema: z.object({ startDelayMs: z.number().int().min(0) }),
  defaultParams: { startDelayMs: 500 },
  observables: [
    { key: 'running', description: 'Trạng thái đang chạy' },
    { key: 'current', description: 'Dòng điện %' },
  ],
  faults: [
    { id: 'noStart', description: 'Không khởi động được' },
    {
      id: 'overload',
      description: 'Quá tải',
      paramsSchema: z.object({ limit: z.number() }),
    },
  ],
  presets: {
    stuckOn: {
      description: 'Kẹt ở trạng thái chạy',
      signalFault: { role: 'runFb', type: 'stuck', params: { value: true } },
    },
    noRunFeedback: {
      description: 'Không có phản hồi chạy',
      signalFault: { role: 'runFb', type: 'stuck', params: { value: false } },
    },
  },
  init: () => ({ t0: null }),
  step: (ctx) => {
    const cmd = ctx.cmd('runCmd');
    const s = ctx.state;
    if (cmd === true && s.t0 === null) s.t0 = ctx.simTimeMs;
    if (cmd !== true) s.t0 = null;
    const noStart = ctx.fault('noStart');
    const running = s.t0 !== null && ctx.simTimeMs - s.t0 >= ctx.params.startDelayMs && !noStart.active;
    ctx.setObs('running', running);
    ctx.setObs('current', running ? 42 : 0);
    ctx.emit('runFb', running);
    ctx.emit('currentFb', running ? 42 : 0);
  },
};

/** Params/state của fake_sensor (có source, lọc lag). */
export interface FakeSensorParams {
  tauMs: number;
}
export interface FakeSensorState {
  y: number;
}

/** Sensor giả: đọc source (manual/const/ramp/sine/link), lọc lag, emit AI %. */
export const fakeSensorModel: EquipmentModel<FakeSensorParams, FakeSensorState> = {
  type: 'fake_sensor',
  version: '0.1.0',
  description: 'Sensor giả cho test source/link (không phải model thật).',
  roles: [
    {
      role: 'value',
      kind: 'AI',
      dataType: 'Int',
      unit: '%',
      description: 'Giá trị đo %',
      synonyms: [],
      descKeywords: [],
    },
  ],
  paramsSchema: z.object({ tauMs: z.number().min(0) }),
  defaultParams: { tauMs: 0 },
  observables: [{ key: 'raw', description: 'Giá trị nguồn đã lọc' }],
  faults: [],
  hasSource: true,
  init: () => ({ y: 0 }),
  step: (ctx) => {
    const src = ctx.source();
    const target = typeof src === 'number' ? src : 0;
    const y = lagStep(ctx.state.y, target, ctx.dtMs, ctx.params.tauMs);
    ctx.state.y = y;
    ctx.setObs('raw', y);
    ctx.emit('value', y);
  },
};

export function motorTagDefs(): TagDef[] {
  return [
    { name: 'CR01_M01_RUN_CMD', type: 'Bool', area: 'Q', address: '%Q0.0', controller: 'PLC1', signal: { kind: 'DO' } },
    { name: 'CR01_M01_RUN_FB', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'CR01_M01_CUR', type: 'Int', area: 'I', address: '%IW64', controller: 'PLC1', signal: { kind: 'AI' } },
  ];
}

export function sensorTagDefs(): TagDef[] {
  return [
    { name: 'CR01_TT01', type: 'Int', area: 'I', address: '%IW66', controller: 'PLC1', signal: { kind: 'AI' } },
  ];
}

export interface MotorSetup {
  engine: PlantEngine;
  tags: TagDB;
  clock: ManualClock;
  cmdH: TagHandle;
  fbH: TagHandle;
  curH: TagHandle;
}

export function mustHandle(tags: TagDB, name: string): TagHandle {
  const h = tags.handle(name);
  if (h === undefined) throw new Error(`test-helpers: tag ${name} không tồn tại.`);
  return h;
}

/** Dựng PlantEngine với một fake_motor CR01_M01 (stepMs 10, seed 42). */
export function makeMotorSetup(overrides?: {
  stepMs?: number;
  seed?: number;
  params?: Partial<FakeMotorParams>;
  signals?: Record<string, string>;
}): MotorSetup {
  const defs = motorTagDefs();
  const clock = new ManualClock();
  const tags = new TagDB(defs, clock);
  const models = createModelRegistry();
  models.register(fakeMotorModel);
  const cfg: PlantConfig = {
    stepMs: overrides?.stepMs ?? 10,
    seed: overrides?.seed ?? 42,
    equipment: [
      {
        id: 'CR01_M01',
        model: 'fake_motor',
        params: { startDelayMs: 500, ...(overrides?.params ?? {}) },
        signals: {
          runCmd: 'CR01_M01_RUN_CMD',
          runFb: 'CR01_M01_RUN_FB',
          currentFb: 'CR01_M01_CUR',
          ...(overrides?.signals ?? {}),
        },
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
  const engine = new PlantEngine(cfg, tags, models);
  return {
    engine,
    tags,
    clock,
    cmdH: mustHandle(tags, 'CR01_M01_RUN_CMD'),
    fbH: mustHandle(tags, 'CR01_M01_RUN_FB'),
    curH: mustHandle(tags, 'CR01_M01_CUR'),
  };
}

/** Chạy các bước T=from..to (bao gồm cả hai đầu), flush TagDB sau mỗi bước. */
export function runSteps(engine: PlantEngine, tags: TagDB, fromMs: number, toMs: number, dtMs = 10): void {
  for (let t = fromMs; t <= toMs; t += dtMs) {
    engine.step(t, dtMs);
    tags.flush();
  }
}
