// Model damper (M2 §7.4, P2.3 — OQ-298).
// Damper = valve_ctrl với strokeTimeS mặc định 30s (chậm hơn van).
// Derive bằng deriveModel — cùng paramsSchema, roles, faults, step.

import { deriveModel } from '../registry.js';
import { valveCtrlModel, type ValveCtrlParams, type ValveCtrlState } from './valve_ctrl.js';

export const damperModel = deriveModel<ValveCtrlParams, ValveCtrlState>(valveCtrlModel, {
  type: 'damper',
  description: 'Damper điều khiển vị trí theo posRef — derive từ valve_ctrl (M2 §7.4).',
  defaultParams: { strokeTimeS: 30 },
  docs: {
    transitions: [
      'Giống valve_ctrl, strokeTimeS mặc định 30s (0.033%/bước, chậm hơn van 20s).',
      'target = |posRef − pos| > deadband ? clamp(posRef, 0, 100) : pos (dừng trong deadband).',
      'signalLoss: posRef hiệu dụng = failPosition (hold → pos hiện tại, close → 0, open → 100) — OQ-283.',
    ],
    notes: ['Derive từ valve_ctrl bằng deriveModel — cùng paramsSchema, roles, faults, step (OQ-298).'],
  },
});

export type DamperParams = ValveCtrlParams;
export type DamperState = ValveCtrlState;
