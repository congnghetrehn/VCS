// Model thiết bị — @vcs/plant (M2 §4.5).
// P2.2: model thật đầu tiên `motor_dol` đăng ký vào defaultRegistry.
// Import file này có side effect đăng ký (module chỉ evaluate 1 lần/process).

import { defaultRegistry, createModelRegistry, deriveModel, ModelRegistry } from '../registry.js';
import { motorDolModel } from './motor_dol.js';
import { motorVfdModel } from './motor_vfd.js';
import { valveCtrlModel } from './valve_ctrl.js';
import { valveOnoffModel } from './valve_onoff.js';
import { analogSensorModel } from './analog_sensor.js';
import { damperModel } from './damper.js';
import { siloBinModel } from './silo_bin.js';
import { switchDiModel } from './switch_di.js';
import { conveyorSimpleModel } from './conveyor_simple.js';

export { motorDolModel } from './motor_dol.js';
export type { MotorDolParams, MotorDolState } from './motor_dol.js';
export { motorVfdModel } from './motor_vfd.js';
export type { MotorVfdParams, MotorVfdState } from './motor_vfd.js';
export { valveOnoffModel } from './valve_onoff.js';
export type { ValveOnoffParams, ValveOnoffState } from './valve_onoff.js';
export { valveCtrlModel } from './valve_ctrl.js';
export type { ValveCtrlParams, ValveCtrlState } from './valve_ctrl.js';
export { damperModel } from './damper.js';
export type { DamperParams, DamperState } from './damper.js';
export { analogSensorModel } from './analog_sensor.js';
export type { AnalogSensorParams, AnalogSensorState } from './analog_sensor.js';
export { switchDiModel } from './switch_di.js';
export type { SwitchDiParams, SwitchDiState } from './switch_di.js';
export { siloBinModel } from './silo_bin.js';
export type { SiloBinParams, SiloBinState } from './silo_bin.js';
export { conveyorSimpleModel, conveyorSimpleParamsSchema } from './conveyor_simple.js';
export type { ConveyorSimpleParams, ConveyorSimpleState } from './conveyor_simple.js';

defaultRegistry.register(motorDolModel);
defaultRegistry.register(motorVfdModel);
defaultRegistry.register(valveOnoffModel);
defaultRegistry.register(valveCtrlModel);
defaultRegistry.register(damperModel);
defaultRegistry.register(analogSensorModel);
defaultRegistry.register(switchDiModel);
defaultRegistry.register(siloBinModel);
defaultRegistry.register(conveyorSimpleModel);

export { defaultRegistry, createModelRegistry, deriveModel, ModelRegistry };
export type {
  EquipmentModel,
  FaultDef,
  FaultPreset,
  FaultSlot,
  ModelDocs,
  ModelSlots,
  ObsDef,
  ObsSlot,
  RoleDef,
  RoleSlot,
  SourceSlot,
  StepCtx,
} from '../registry.js';
