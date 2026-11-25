// Model thiết bị — @vcs/plant (M2 §4.5).
// P2.2: model thật đầu tiên `motor_dol` đăng ký vào defaultRegistry.
// Import file này có side effect đăng ký (module chỉ evaluate 1 lần/process).

import { defaultRegistry, createModelRegistry, deriveModel, ModelRegistry } from '../registry.js';
import { motorDolModel } from './motor_dol.js';

export { motorDolModel } from './motor_dol.js';
export type { MotorDolParams, MotorDolState } from './motor_dol.js';

defaultRegistry.register(motorDolModel);

export { defaultRegistry, createModelRegistry, deriveModel, ModelRegistry };
export type {
  EquipmentModel,
  FaultDef,
  FaultPreset,
  ModelDocs,
  ObsDef,
  RoleDef,
  StepCtx,
} from '../registry.js';
