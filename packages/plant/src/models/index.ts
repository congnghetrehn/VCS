// Model thiết bị — @vcs/plant (M2 §4.5).
// P2.1 chưa có model thật (OQ-246): file này chỉ re-export registry để
// model thật (P2.2 motor_dol, P2.3, ...) đăng ký vào defaultRegistry.

export { defaultRegistry, createModelRegistry, deriveModel, ModelRegistry } from '../registry.js';
export type {
  EquipmentModel,
  FaultDef,
  FaultPreset,
  ObsDef,
  RoleDef,
  StepCtx,
} from '../registry.js';
