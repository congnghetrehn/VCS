// @vcs/plant — Plant model tất định (M2).
// Engine + registry model + adapter + source + lỗi + sự kiện.
// Import models/index.js để đăng ký model thật vào defaultRegistry (P2.2).

import './models/index.js';

export { RAW_CLAMP_MIN, RAW_CLAMP_MAX, engToRaw, rawToEng, resolveRange } from './adapter.js';
export type { Range } from './adapter.js';
export { DelayLine, lagStep, rateLimitStep, hysteresisStep, onDelayStep, offDelayStep } from './delay.js';
export type { DelayTimerState } from './delay.js';
export { generateEquipmentMarkdown } from './docgen.js';
export { PlantEngine, validatePlantConfig } from './engine.js';
export type { PlantConfig, PlantSnapshot } from './engine.js';
export { EventLog, EVENT_LOG_MAX } from './events.js';
export type { PlantEvent, PlantEventType } from './events.js';
export { FaultManager, SIGNAL_FAULT_ORDER } from './faults.js';
export type { FaultManagerOptions, FaultManagerSnapshot, FaultRecord, FaultRecordSnapshot, FaultState } from './faults.js';
export { GoldenError, parseGoldenYaml, runPlantGoldenCase } from './golden/runner.js';
export type { GoldenRunContext } from './golden/runner.js';
export type { PlantGoldenCase, PlantGoldenFile, PlantGoldenStep } from './golden/schema.js';
export { motorDolModel } from './models/motor_dol.js';
export type { MotorDolParams, MotorDolState } from './models/motor_dol.js';
export { motorVfdModel } from './models/motor_vfd.js';
export type { MotorVfdParams, MotorVfdState } from './models/motor_vfd.js';
export { valveOnoffModel } from './models/valve_onoff.js';
export type { ValveOnoffParams, ValveOnoffState } from './models/valve_onoff.js';
export { valveCtrlModel } from './models/valve_ctrl.js';
export type { ValveCtrlParams, ValveCtrlState } from './models/valve_ctrl.js';
export { damperModel } from './models/damper.js';
export type { DamperParams, DamperState } from './models/damper.js';
export { analogSensorModel } from './models/analog_sensor.js';
export type { AnalogSensorParams, AnalogSensorState } from './models/analog_sensor.js';
export { switchDiModel } from './models/switch_di.js';
export type { SwitchDiParams, SwitchDiState } from './models/switch_di.js';
export { siloBinModel } from './models/silo_bin.js';
export type { SiloBinParams, SiloBinState } from './models/silo_bin.js';
export { conveyorSimpleModel, conveyorSimpleParamsSchema } from './models/conveyor_simple.js';
export type { ConveyorSimpleParams, ConveyorSimpleState } from './models/conveyor_simple.js';
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
  ModelDocs,
  ObsDef,
  RoleDef,
  StepCtx,
} from './registry.js';
export { rngState, rngNext, rngGaussian, hash32, hashSeed } from './rng.js';
export type { RngState } from './rng.js';
export { evalSource, topoSort } from './source.js';
export type { SourceRuntime, TopoResult } from './source.js';
