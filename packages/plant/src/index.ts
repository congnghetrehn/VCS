// @vcs/plant — Plant model tất định (M2).
// Engine + registry model + adapter + source + lỗi + sự kiện.

export { RAW_CLAMP_MIN, RAW_CLAMP_MAX, engToRaw, rawToEng, resolveRange } from './adapter.js';
export type { Range } from './adapter.js';
export { DelayLine, lagStep, rateLimitStep, hysteresisStep, onDelayStep, offDelayStep } from './delay.js';
export type { DelayTimerState } from './delay.js';
export { PlantEngine, validatePlantConfig } from './engine.js';
export type { PlantConfig, PlantSnapshot } from './engine.js';
export { EventLog, EVENT_LOG_MAX } from './events.js';
export type { PlantEvent, PlantEventType } from './events.js';
export { FaultManager, SIGNAL_FAULT_ORDER } from './faults.js';
export type { FaultManagerOptions, FaultManagerSnapshot, FaultRecord, FaultRecordSnapshot, FaultState } from './faults.js';
export {
  defaultRegistry,
  createModelRegistry,
  deriveModel,
  ModelRegistry,
} from './registry.js';
export type {
  EquipmentModel,
  FaultDef,
  FaultPreset,
  ObsDef,
  RoleDef,
  StepCtx,
} from './registry.js';
export { rngState, rngNext, rngGaussian, hash32, hashSeed } from './rng.js';
export type { RngState } from './rng.js';
export { evalSource, topoSort } from './source.js';
export type { SourceRuntime, TopoResult } from './source.js';
