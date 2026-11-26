// Hỗ trợ test cho @vcs/plant — CHỈ dùng trong file *.test.ts.
// Model giả (fake_motor/fake_sensor) để kiểm engine; không phải model thật
// (OQ-246: model thật đầu tiên là motor_dol ở P2.2).

import { z } from 'zod';

import { ManualClock, TagDB, type TagHandle } from '@vcs/kernel';
import type { SourceSpec, TagDef } from '@vcs/schemas';

import { PlantEngine, type PlantConfig } from './engine.js';
import { lagStep } from './delay.js';
import { motorDolModel, type MotorDolParams } from './models/motor_dol.js';
import { motorVfdModel } from './models/motor_vfd.js';
import { conveyorSimpleModel } from './models/conveyor_simple.js';
import { analogSensorModel } from './models/analog_sensor.js';
import { siloBinModel } from './models/silo_bin.js';
import { switchDiModel } from './models/switch_di.js';
import { damperModel } from './models/damper.js';
import { valveCtrlModel } from './models/valve_ctrl.js';
import { valveOnoffModel } from './models/valve_onoff.js';
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
  step: (ctx, slots) => {
    const runCmdSlot = slots.role.runCmd;
    const runFbSlot = slots.role.runFb;
    const currentFbSlot = slots.role.currentFb;
    const runningSlot = slots.obs.running;
    const currentSlot = slots.obs.current;
    const noStartSlot = slots.fault.noStart;
    const cmd = ctx.cmd(runCmdSlot);
    const s = ctx.state;
    if (cmd === true && s.t0 === null) s.t0 = ctx.simTimeMs;
    if (cmd !== true) s.t0 = null;
    const noStart = ctx.fault(noStartSlot);
    const running =
      s.t0 !== null && ctx.simTimeMs - s.t0 >= ctx.params.startDelayMs && !noStart.active;
    ctx.setObs(runningSlot, running);
    ctx.setObs(currentSlot, running ? 42 : 0);
    ctx.emit(runFbSlot, running);
    ctx.emit(currentFbSlot, running ? 42 : 0);
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
  step: (ctx, slots) => {
    const valueSlot = slots.role.value;
    const rawSlot = slots.obs.raw;
    const src = ctx.source();
    const target = typeof src === 'number' ? src : 0;
    const y = lagStep(ctx.state.y, target, ctx.dtMs, ctx.params.tauMs);
    ctx.state.y = y;
    ctx.setObs(rawSlot, y);
    ctx.emit(valueSlot, y);
  },
};

export function motorTagDefs(): TagDef[] {
  return [
    {
      name: 'CR01_M01_RUN_CMD',
      type: 'Bool',
      area: 'Q',
      address: '%Q0.0',
      controller: 'PLC1',
      signal: { kind: 'DO' },
    },
    {
      name: 'CR01_M01_RUN_FB',
      type: 'Bool',
      area: 'I',
      address: '%I0.0',
      controller: 'PLC1',
      signal: { kind: 'DI' },
    },
    {
      name: 'CR01_M01_CUR',
      type: 'Int',
      area: 'I',
      address: '%IW64',
      controller: 'PLC1',
      signal: { kind: 'AI' },
    },
  ];
}

export function sensorTagDefs(): TagDef[] {
  return [
    {
      name: 'CR01_TT01',
      type: 'Int',
      area: 'I',
      address: '%IW66',
      controller: 'PLC1',
      signal: { kind: 'AI' },
    },
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
export function runSteps(
  engine: PlantEngine,
  tags: TagDB,
  fromMs: number,
  toMs: number,
  dtMs = 10,
): void {
  for (let t = fromMs; t <= toMs; t += dtMs) {
    engine.step(t, dtMs);
    tags.flush();
  }
}

/** Tag cho motor_dol CR01_M01 — đủ 6 role (OQ-258); currentFb scaling 0..100 A explicit. */
export function motorDolTagDefs(): TagDef[] {
  return [
    {
      name: 'CR01_M01_RUN_CMD',
      type: 'Bool',
      area: 'Q',
      address: '%Q0.0',
      controller: 'PLC1',
      signal: { kind: 'DO' },
    },
    {
      name: 'CR01_M01_RUN_FB',
      type: 'Bool',
      area: 'I',
      address: '%I0.0',
      controller: 'PLC1',
      signal: { kind: 'DI' },
    },
    {
      name: 'CR01_M01_READY',
      type: 'Bool',
      area: 'I',
      address: '%I0.1',
      controller: 'PLC1',
      signal: { kind: 'DI' },
    },
    {
      name: 'CR01_M01_REMOTE',
      type: 'Bool',
      area: 'I',
      address: '%I0.2',
      controller: 'PLC1',
      signal: { kind: 'DI' },
    },
    {
      name: 'CR01_M01_OVL_OK',
      type: 'Bool',
      area: 'I',
      address: '%I0.3',
      controller: 'PLC1',
      signal: { kind: 'DI' },
    },
    {
      name: 'CR01_M01_CUR',
      type: 'Int',
      area: 'I',
      address: '%IW64',
      controller: 'PLC1',
      signal: {
        kind: 'AI',
        scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: 'A' },
      },
    },
  ];
}

export interface MotorDolSetup {
  engine: PlantEngine;
  tags: TagDB;
  clock: ManualClock;
  defs: TagDef[];
  defMap: Map<string, TagDef>;
  /** role → tag (đủ 6 role, trừ role trong omitRoles). */
  signals: Record<string, string>;
  handles: Record<string, TagHandle>;
}

/** Dựng PlantEngine với một motor_dol CR01_M01 (stepMs 10, seed 42). */
export function makeMotorDolSetup(overrides?: {
  stepMs?: number;
  seed?: number;
  params?: Partial<MotorDolParams>;
  signals?: Record<string, string>;
  omitRoles?: string[];
}): MotorDolSetup {
  const defs = motorDolTagDefs();
  const clock = new ManualClock();
  const tags = new TagDB(defs, clock);
  const models = createModelRegistry();
  models.register(motorDolModel);
  const defaultSignals: Record<string, string> = {
    runCmd: 'CR01_M01_RUN_CMD',
    runFb: 'CR01_M01_RUN_FB',
    ready: 'CR01_M01_READY',
    remote: 'CR01_M01_REMOTE',
    overloadOk: 'CR01_M01_OVL_OK',
    currentFb: 'CR01_M01_CUR',
  };
  const mergedSignals = { ...defaultSignals, ...(overrides?.signals ?? {}) };
  const omit = new Set(overrides?.omitRoles ?? []);
  const signals: Record<string, string> = {};
  for (const [role, name] of Object.entries(mergedSignals)) {
    if (!omit.has(role)) signals[role] = name;
  }
  const cfg: PlantConfig = {
    stepMs: overrides?.stepMs ?? 10,
    seed: overrides?.seed ?? 42,
    equipment: [
      {
        id: 'CR01_M01',
        model: 'motor_dol',
        params: { ...(overrides?.params ?? {}) },
        signals,
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
  const engine = new PlantEngine(cfg, tags, models);
  const handles: Record<string, TagHandle> = {};
  for (const [role, name] of Object.entries(signals)) {
    handles[role] = mustHandle(tags, name);
  }
  return {
    engine,
    tags,
    clock,
    defs,
    defMap: new Map(defs.map((d) => [d.name, d])),
    signals,
    handles,
  };
}

/** Tag defs cho valve_ctrl CR01_VC01 (M2 §7.4): 1 AO + 1 AI + 3 DI. */
export function valveCtrlTagDefs(): TagDef[] {
  return [
    {
      name: 'CR01_VC01_POS_REF',
      type: 'Int',
      area: 'Q',
      address: '%QW64',
      controller: 'PLC1',
      signal: {
        kind: 'AO',
        scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: '%' },
      },
    },
    {
      name: 'CR01_VC01_POS_FB',
      type: 'Int',
      area: 'I',
      address: '%IW64',
      controller: 'PLC1',
      signal: {
        kind: 'AI',
        scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: '%' },
      },
    },
    { name: 'CR01_VC01_FAULT', type: 'Bool', area: 'I', address: '%I0.3', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'CR01_VC01_CLOSED_LS', type: 'Bool', area: 'I', address: '%I0.4', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'CR01_VC01_OPEN_LS', type: 'Bool', area: 'I', address: '%I0.5', controller: 'PLC1', signal: { kind: 'DI' } },
  ];
}

/** Dựng PlantEngine với một valve_ctrl CR01_VC01 (stepMs 10, seed 42). */
export function makeValveCtrlSetup(overrides?: ModelSetupOverrides): ModelSetup {
  const defs = valveCtrlTagDefs();
  const clock = new ManualClock();
  const tags = new TagDB(defs, clock);
  const models = createModelRegistry();
  models.register(valveCtrlModel);
  const mergedSignals: Record<string, string> = {
    posRef: 'CR01_VC01_POS_REF',
    posFb: 'CR01_VC01_POS_FB',
    fault: 'CR01_VC01_FAULT',
    closedLs: 'CR01_VC01_CLOSED_LS',
    openLs: 'CR01_VC01_OPEN_LS',
    ...(overrides?.signals ?? {}),
  };
  const omit = new Set(overrides?.omitRoles ?? []);
  const signals: Record<string, string> = {};
  for (const [role, name] of Object.entries(mergedSignals)) {
    if (!omit.has(role)) signals[role] = name;
  }
  const cfg: PlantConfig = {
    stepMs: overrides?.stepMs ?? 10,
    seed: overrides?.seed ?? 42,
    equipment: [
      {
        id: 'CR01_VC01',
        model: 'valve_ctrl',
        params: { ...(overrides?.params ?? {}) },
        signals,
        ...(overrides?.source !== undefined ? { source: overrides.source } : {}),
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
  const engine = new PlantEngine(cfg, tags, models);
  const handles: Record<string, TagHandle> = {};
  for (const [role, name] of Object.entries(signals)) {
    handles[role] = mustHandle(tags, name);
  }
  return {
    engine,
    tags,
    clock,
    defs,
    defMap: new Map(defs.map((d) => [d.name, d])),
    signals,
    handles,
  };
}

/** Hình dạng setup chung cho mọi model (harness golden dùng qua dispatcher). */
export interface ModelSetup {
  engine: PlantEngine;
  tags: TagDB;
  clock: ManualClock;
  defs: TagDef[];
  defMap: Map<string, TagDef>;
  signals: Record<string, string>;
  handles: Record<string, TagHandle>;
}

/** Tag cho motor_vfd CR01_VFD01 — đủ 8 role (OQ-258/299); AO/AI scaling 0..100. */
export function motorVfdTagDefs(): TagDef[] {
  const ao = (name: string, address: string): TagDef => ({
    name,
    type: 'Int',
    area: 'Q',
    address,
    controller: 'PLC1',
    signal: {
      kind: 'AO',
      scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: '%' },
    },
  });
  const aiPct = (name: string, address: string): TagDef => ({
    name,
    type: 'Int',
    area: 'I',
    address,
    controller: 'PLC1',
    signal: {
      kind: 'AI',
      scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: '%' },
    },
  });
  return [
    {
      name: 'CR01_VFD01_RUN_CMD',
      type: 'Bool',
      area: 'Q',
      address: '%Q0.0',
      controller: 'PLC1',
      signal: { kind: 'DO' },
    },
    ao('CR01_VFD01_SPEED_REF', '%QW64'),
    {
      name: 'CR01_VFD01_RUN_FB',
      type: 'Bool',
      area: 'I',
      address: '%I0.0',
      controller: 'PLC1',
      signal: { kind: 'DI' },
    },
    aiPct('CR01_VFD01_SPEED_FB', '%IW66'),
    {
      name: 'CR01_VFD01_READY',
      type: 'Bool',
      area: 'I',
      address: '%I0.1',
      controller: 'PLC1',
      signal: { kind: 'DI' },
    },
    {
      name: 'CR01_VFD01_VFD_OK',
      type: 'Bool',
      area: 'I',
      address: '%I0.2',
      controller: 'PLC1',
      signal: { kind: 'DI' },
    },
    {
      name: 'CR01_VFD01_REMOTE',
      type: 'Bool',
      area: 'I',
      address: '%I0.3',
      controller: 'PLC1',
      signal: { kind: 'DI' },
    },
    {
      name: 'CR01_VFD01_CUR',
      type: 'Int',
      area: 'I',
      address: '%IW68',
      controller: 'PLC1',
      signal: {
        kind: 'AI',
        scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: 'A' },
      },
    },
  ];
}

export interface ModelSetupOverrides {
  stepMs?: number;
  seed?: number;
  params?: Record<string, unknown>;
  signals?: Record<string, string>;
  omitRoles?: string[];
  source?: SourceSpec;
  /** Named sources (OQ-290): tên → SourceSpec. */
  sources?: Record<string, SourceSpec>;
}

/** Dựng PlantEngine với một motor_vfd CR01_VFD01 (stepMs 10, seed 42). */
export function makeMotorVfdSetup(overrides?: ModelSetupOverrides): ModelSetup {
  const defs = motorVfdTagDefs();
  const clock = new ManualClock();
  const tags = new TagDB(defs, clock);
  const models = createModelRegistry();
  models.register(motorVfdModel);
  const defaultSignals: Record<string, string> = {
    runCmd: 'CR01_VFD01_RUN_CMD',
    speedRef: 'CR01_VFD01_SPEED_REF',
    runFb: 'CR01_VFD01_RUN_FB',
    speedFb: 'CR01_VFD01_SPEED_FB',
    ready: 'CR01_VFD01_READY',
    vfdFaultOk: 'CR01_VFD01_VFD_OK',
    remote: 'CR01_VFD01_REMOTE',
    currentFb: 'CR01_VFD01_CUR',
  };
  const mergedSignals = { ...defaultSignals, ...(overrides?.signals ?? {}) };
  const omit = new Set(overrides?.omitRoles ?? []);
  const signals: Record<string, string> = {};
  for (const [role, name] of Object.entries(mergedSignals)) {
    if (!omit.has(role)) signals[role] = name;
  }
  const cfg: PlantConfig = {
    stepMs: overrides?.stepMs ?? 10,
    seed: overrides?.seed ?? 42,
    equipment: [
      {
        id: 'CR01_VFD01',
        model: 'motor_vfd',
        params: { ...(overrides?.params ?? {}) },
        signals,
        ...(overrides?.source !== undefined ? { source: overrides.source } : {}),
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
  const engine = new PlantEngine(cfg, tags, models);
  const handles: Record<string, TagHandle> = {};
  for (const [role, name] of Object.entries(signals)) {
    handles[role] = mustHandle(tags, name);
  }
  return {
    engine,
    tags,
    clock,
    defs,
    defMap: new Map(defs.map((d) => [d.name, d])),
    signals,
    handles,
  };
}

/**
 * Dispatcher setup theo model (OQ-295): harness golden gọi 1 hàm cho mọi model.
 * Mỗi model có `make<Model>Setup` riêng; model chưa có setup → throw rõ ràng.
 */
export function makeModelSetup(model: string, overrides?: ModelSetupOverrides): ModelSetup {
  switch (model) {
    case 'motor_dol':
      return makeMotorDolSetup(overrides);
    case 'motor_vfd':
      return makeMotorVfdSetup(overrides);
    case 'valve_onoff':
      return makeValveOnoffSetup(overrides);
    case 'valve_ctrl':
      return makeValveCtrlSetup(overrides);
    case 'damper':
      return makeDamperSetup(overrides);
    case 'analog_sensor':
      return makeAnalogSensorSetup(overrides);
    case 'switch_di':
      return makeSwitchDiSetup(overrides);
    case 'silo_bin':
      return makeSiloBinSetup(overrides);
    case 'conveyor_simple':
      return makeConveyorSimpleSetup(overrides);
    default:
      throw new Error(`makeModelSetup: model ${model} chưa có setup trong test-helpers.`);
  }
}

/** Equipment id mặc định của harness theo model (OQ-295). */
export function modelEquipmentId(model: string): string {
  switch (model) {
    case 'motor_dol':
      return 'CR01_M01';
    case 'motor_vfd':
      return 'CR01_VFD01';
    case 'valve_onoff':
      return 'CR01_V01';
    case 'valve_ctrl':
      return 'CR01_VC01';
    case 'damper':
      return 'CR01_D01';
    case 'analog_sensor':
      return 'CR01_TT01';
    case 'switch_di':
      return 'CR01_LS01';
    case 'silo_bin':
      return 'CR01_SIL01';
    case 'conveyor_simple':
      return 'CR01_CV01';
    default:
      throw new Error(`modelEquipmentId: model ${model} chưa có equipment id trong test-helpers.`);
  }
}

/** Tag defs cho valve_onoff CR01_V01 (M2 §7.3): 2 DO + 3 DI. */
export function valveOnoffTagDefs(): TagDef[] {
  return [
    { name: 'CR01_V01_OPEN_CMD', type: 'Bool', area: 'Q', address: '%Q0.0', controller: 'PLC1', signal: { kind: 'DO' } },
    { name: 'CR01_V01_CLOSE_CMD', type: 'Bool', area: 'Q', address: '%Q0.1', controller: 'PLC1', signal: { kind: 'DO' } },
    { name: 'CR01_V01_OPEN_LS', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'CR01_V01_CLOSED_LS', type: 'Bool', area: 'I', address: '%I0.1', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'CR01_V01_FAULT', type: 'Bool', area: 'I', address: '%I0.2', controller: 'PLC1', signal: { kind: 'DI' } },
  ];
}

/** Dựng PlantEngine với một valve_onoff CR01_V01 (stepMs 10, seed 42). */
export function makeValveOnoffSetup(overrides?: ModelSetupOverrides): ModelSetup {
  const defs = valveOnoffTagDefs();
  const clock = new ManualClock();
  const tags = new TagDB(defs, clock);
  const models = createModelRegistry();
  models.register(valveOnoffModel);
  const mergedSignals: Record<string, string> = {
    openCmd: 'CR01_V01_OPEN_CMD',
    closeCmd: 'CR01_V01_CLOSE_CMD',
    openLs: 'CR01_V01_OPEN_LS',
    closedLs: 'CR01_V01_CLOSED_LS',
    fault: 'CR01_V01_FAULT',
    ...(overrides?.signals ?? {}),
  };
  const omit = new Set(overrides?.omitRoles ?? []);
  const signals: Record<string, string> = {};
  for (const [role, name] of Object.entries(mergedSignals)) {
    if (!omit.has(role)) signals[role] = name;
  }
  const cfg: PlantConfig = {
    stepMs: overrides?.stepMs ?? 10,
    seed: overrides?.seed ?? 42,
    equipment: [
      {
        id: 'CR01_V01',
        model: 'valve_onoff',
        params: { ...(overrides?.params ?? {}) },
        signals,
        ...(overrides?.source !== undefined ? { source: overrides.source } : {}),
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
  const engine = new PlantEngine(cfg, tags, models);
  const handles: Record<string, TagHandle> = {};
  for (const [role, name] of Object.entries(signals)) {
    handles[role] = mustHandle(tags, name);
  }
  return {
    engine,
    tags,
    clock,
    defs,
    defMap: new Map(defs.map((d) => [d.name, d])),
    signals,
    handles,
  };
}

/** Tag defs cho damper CR01_D01 (M2 §7.4, derive valve_ctrl): 1 AO + 1 AI + 3 DI. */
export function damperTagDefs(): TagDef[] {
  return [
    {
      name: 'CR01_D01_POS_REF',
      type: 'Int',
      area: 'Q',
      address: '%QW66',
      controller: 'PLC1',
      signal: {
        kind: 'AO',
        scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: '%' },
      },
    },
    {
      name: 'CR01_D01_POS_FB',
      type: 'Int',
      area: 'I',
      address: '%IW66',
      controller: 'PLC1',
      signal: {
        kind: 'AI',
        scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: '%' },
      },
    },
    { name: 'CR01_D01_FAULT', type: 'Bool', area: 'I', address: '%I0.6', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'CR01_D01_CLOSED_LS', type: 'Bool', area: 'I', address: '%I0.7', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'CR01_D01_OPEN_LS', type: 'Bool', area: 'I', address: '%I1.0', controller: 'PLC1', signal: { kind: 'DI' } },
  ];
}

/** Dựng PlantEngine với một damper CR01_D01 (stepMs 10, seed 42). */
export function makeDamperSetup(overrides?: ModelSetupOverrides): ModelSetup {
  const defs = damperTagDefs();
  const clock = new ManualClock();
  const tags = new TagDB(defs, clock);
  const models = createModelRegistry();
  models.register(damperModel);
  const mergedSignals: Record<string, string> = {
    posRef: 'CR01_D01_POS_REF',
    posFb: 'CR01_D01_POS_FB',
    fault: 'CR01_D01_FAULT',
    closedLs: 'CR01_D01_CLOSED_LS',
    openLs: 'CR01_D01_OPEN_LS',
    ...(overrides?.signals ?? {}),
  };
  const omit = new Set(overrides?.omitRoles ?? []);
  const signals: Record<string, string> = {};
  for (const [role, name] of Object.entries(mergedSignals)) {
    if (!omit.has(role)) signals[role] = name;
  }
  const cfg: PlantConfig = {
    stepMs: overrides?.stepMs ?? 10,
    seed: overrides?.seed ?? 42,
    equipment: [
      {
        id: 'CR01_D01',
        model: 'damper',
        params: { ...(overrides?.params ?? {}) },
        signals,
        ...(overrides?.source !== undefined ? { source: overrides.source } : {}),
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
  const engine = new PlantEngine(cfg, tags, models);
  const handles: Record<string, TagHandle> = {};
  for (const [role, name] of Object.entries(signals)) {
    handles[role] = mustHandle(tags, name);
  }
  return {
    engine,
    tags,
    clock,
    defs,
    defMap: new Map(defs.map((d) => [d.name, d])),
    signals,
    handles,
  };
}

/** Tag defs cho analog_sensor CR01_TT01 (M2 §7.5): 1 AI, scaling 0..100 eng. */
export function analogSensorTagDefs(): TagDef[] {
  return [
    {
      name: 'CR01_TT01',
      type: 'Int',
      area: 'I',
      address: '%IW66',
      controller: 'PLC1',
      signal: {
        kind: 'AI',
        scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: '°C' },
      },
    },
  ];
}

/** Dựng PlantEngine với một analog_sensor CR01_TT01 (stepMs 10, seed 42). */
export function makeAnalogSensorSetup(overrides?: ModelSetupOverrides): ModelSetup {
  const defs = analogSensorTagDefs();
  const clock = new ManualClock();
  const tags = new TagDB(defs, clock);
  const models = createModelRegistry();
  models.register(analogSensorModel);
  const mergedSignals: Record<string, string> = {
    raw: 'CR01_TT01',
    ...(overrides?.signals ?? {}),
  };
  const omit = new Set(overrides?.omitRoles ?? []);
  const signals: Record<string, string> = {};
  for (const [role, name] of Object.entries(mergedSignals)) {
    if (!omit.has(role)) signals[role] = name;
  }
  const cfg: PlantConfig = {
    stepMs: overrides?.stepMs ?? 10,
    seed: overrides?.seed ?? 42,
    equipment: [
      {
        id: 'CR01_TT01',
        model: 'analog_sensor',
        params: {
          engMin: 0,
          engMax: 100,
          unit: '°C',
          ...(overrides?.params ?? {}),
        },
        signals,
        ...(overrides?.source !== undefined ? { source: overrides.source } : {}),
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
  const engine = new PlantEngine(cfg, tags, models);
  const handles: Record<string, TagHandle> = {};
  for (const [role, name] of Object.entries(signals)) {
    handles[role] = mustHandle(tags, name);
  }
  return {
    engine,
    tags,
    clock,
    defs,
    defMap: new Map(defs.map((d) => [d.name, d])),
    signals,
    handles,
  };
}

/** Tag defs cho switch_di CR01_LS01 (M2 §7.6): 1 DI. */
export function switchDiTagDefs(): TagDef[] {
  return [
    {
      name: 'CR01_LS01',
      type: 'Bool',
      area: 'I',
      address: '%I0.0',
      controller: 'PLC1',
      signal: { kind: 'DI' },
    },
  ];
}

/** Dựng PlantEngine với một switch_di CR01_LS01 (stepMs 10, seed 42). */
export function makeSwitchDiSetup(overrides?: ModelSetupOverrides): ModelSetup {
  const defs = switchDiTagDefs();
  const clock = new ManualClock();
  const tags = new TagDB(defs, clock);
  const models = createModelRegistry();
  models.register(switchDiModel);
  const mergedSignals: Record<string, string> = {
    di: 'CR01_LS01',
    ...(overrides?.signals ?? {}),
  };
  const omit = new Set(overrides?.omitRoles ?? []);
  const signals: Record<string, string> = {};
  for (const [role, name] of Object.entries(mergedSignals)) {
    if (!omit.has(role)) signals[role] = name;
  }
  const cfg: PlantConfig = {
    stepMs: overrides?.stepMs ?? 10,
    seed: overrides?.seed ?? 42,
    equipment: [
      {
        id: 'CR01_LS01',
        model: 'switch_di',
        params: {
          kind: 'generic',
          ...(overrides?.params ?? {}),
        },
        signals,
        ...(overrides?.source !== undefined ? { source: overrides.source } : {}),
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
  const engine = new PlantEngine(cfg, tags, models);
  const handles: Record<string, TagHandle> = {};
  for (const [role, name] of Object.entries(signals)) {
    handles[role] = mustHandle(tags, name);
  }
  return {
    engine,
    tags,
    clock,
    defs,
    defMap: new Map(defs.map((d) => [d.name, d])),
    signals,
    handles,
  };
}

/** Tag defs cho silo_bin CR01_SIL01 (M2 §7.7): 1 AI + 3 DI. */
export function siloBinTagDefs(): TagDef[] {
  return [
    {
      name: 'CR01_SIL01_LEVEL',
      type: 'Int',
      area: 'I',
      address: '%IW70',
      controller: 'PLC1',
      signal: {
        kind: 'AI',
        scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: '%' },
      },
    },
    {
      name: 'CR01_SIL01_HIGH',
      type: 'Bool',
      area: 'I',
      address: '%I0.6',
      controller: 'PLC1',
      signal: { kind: 'DI' },
    },
    {
      name: 'CR01_SIL01_LOW',
      type: 'Bool',
      area: 'I',
      address: '%I0.7',
      controller: 'PLC1',
      signal: { kind: 'DI' },
    },
    {
      name: 'CR01_SIL01_HH',
      type: 'Bool',
      area: 'I',
      address: '%I1.0',
      controller: 'PLC1',
      signal: { kind: 'DI' },
    },
  ];
}

/** Dựng PlantEngine với một silo_bin CR01_SIL01 (stepMs 10, seed 42). */
export function makeSiloBinSetup(overrides?: ModelSetupOverrides): ModelSetup {
  const defs = siloBinTagDefs();
  const clock = new ManualClock();
  const tags = new TagDB(defs, clock);
  const models = createModelRegistry();
  models.register(siloBinModel);
  const mergedSignals: Record<string, string> = {
    levelRaw: 'CR01_SIL01_LEVEL',
    levelHigh: 'CR01_SIL01_HIGH',
    levelLow: 'CR01_SIL01_LOW',
    levelHighHigh: 'CR01_SIL01_HH',
    ...(overrides?.signals ?? {}),
  };
  const omit = new Set(overrides?.omitRoles ?? []);
  const signals: Record<string, string> = {};
  for (const [role, name] of Object.entries(mergedSignals)) {
    if (!omit.has(role)) signals[role] = name;
  }
  const cfg: PlantConfig = {
    stepMs: overrides?.stepMs ?? 10,
    seed: overrides?.seed ?? 42,
    equipment: [
      {
        id: 'CR01_SIL01',
        model: 'silo_bin',
        params: { ...(overrides?.params ?? {}) },
        signals,
        ...(overrides?.source !== undefined ? { source: overrides.source } : {}),
        ...(overrides?.sources !== undefined ? { sources: overrides.sources } : {}),
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
  const engine = new PlantEngine(cfg, tags, models);
  const handles: Record<string, TagHandle> = {};
  for (const [role, name] of Object.entries(signals)) {
    handles[role] = mustHandle(tags, name);
  }
  return {
    engine,
    tags,
    clock,
    defs,
    defMap: new Map(defs.map((d) => [d.name, d])),
    signals,
    handles,
  };
}

/** Tag defs cho conveyor_simple CR01_CV01 (M2 §7.8): 6 tag motor_dol + 2 DI. */
export function conveyorSimpleTagDefs(): TagDef[] {
  return [
    { name: 'CR01_CV01_RUN_CMD', type: 'Bool', area: 'Q', address: '%Q0.0', controller: 'PLC1', signal: { kind: 'DO' } },
    { name: 'CR01_CV01_RUN_FB', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'CR01_CV01_READY', type: 'Bool', area: 'I', address: '%I0.1', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'CR01_CV01_REMOTE', type: 'Bool', area: 'I', address: '%I0.2', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'CR01_CV01_OVL_OK', type: 'Bool', area: 'I', address: '%I0.3', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'CR01_CV01_ZERO_SPEED', type: 'Bool', area: 'I', address: '%I0.4', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'CR01_CV01_PULL_CORD', type: 'Bool', area: 'I', address: '%I0.5', controller: 'PLC1', signal: { kind: 'DI' } },
    {
      name: 'CR01_CV01_CUR',
      type: 'Int',
      area: 'I',
      address: '%IW64',
      controller: 'PLC1',
      signal: {
        kind: 'AI',
        scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: 'A' },
      },
    },
  ];
}

/** Dựng PlantEngine với một conveyor_simple CR01_CV01 (stepMs 10, seed 42). */
export function makeConveyorSimpleSetup(overrides?: ModelSetupOverrides): ModelSetup {
  const defs = conveyorSimpleTagDefs();
  const clock = new ManualClock();
  const tags = new TagDB(defs, clock);
  const models = createModelRegistry();
  models.register(conveyorSimpleModel);
  const mergedSignals: Record<string, string> = {
    runCmd: 'CR01_CV01_RUN_CMD',
    runFb: 'CR01_CV01_RUN_FB',
    ready: 'CR01_CV01_READY',
    remote: 'CR01_CV01_REMOTE',
    overloadOk: 'CR01_CV01_OVL_OK',
    currentFb: 'CR01_CV01_CUR',
    zeroSpeed: 'CR01_CV01_ZERO_SPEED',
    pullCord: 'CR01_CV01_PULL_CORD',
    ...(overrides?.signals ?? {}),
  };
  const omit = new Set(overrides?.omitRoles ?? []);
  const signals: Record<string, string> = {};
  for (const [role, name] of Object.entries(mergedSignals)) {
    if (!omit.has(role)) signals[role] = name;
  }
  const cfg: PlantConfig = {
    stepMs: overrides?.stepMs ?? 10,
    seed: overrides?.seed ?? 42,
    equipment: [
      {
        id: 'CR01_CV01',
        model: 'conveyor_simple',
        params: { ...(overrides?.params ?? {}) },
        signals,
        ...(overrides?.source !== undefined ? { source: overrides.source } : {}),
        ...(overrides?.sources !== undefined ? { sources: overrides.sources } : {}),
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
  const engine = new PlantEngine(cfg, tags, models);
  const handles: Record<string, TagHandle> = {};
  for (const [role, name] of Object.entries(signals)) {
    handles[role] = mustHandle(tags, name);
  }
  return {
    engine,
    tags,
    clock,
    defs,
    defMap: new Map(defs.map((d) => [d.name, d])),
    signals,
    handles,
  };
}
