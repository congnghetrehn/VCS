// Model switch_di (M2 §7.6, P2.3 — bảng E/K, STATE §26).
// Công tắc/limit/level/zero-speed/pull-cord: source → hysteresis →
// on/off-delay → active → stuck/chatter → invert → di.

import { z } from 'zod';

import { hysteresisStep, offDelayStep, onDelayStep, type DelayTimerState } from '../delay.js';
import type { EquipmentModel, ModelSlots, StepCtx } from '../registry.js';

// kind bắt buộc (OQ-287): zod optional + refine bắt buộc có mặt
// (defaultParams không thể chứa giá trị mặc định cho trường "không default").
export const switchDiParamsSchema = z
  .object({
    kind: z
      .enum(['level_high', 'level_low', 'zero_speed', 'pull_cord', 'limit', 'generic'])
      .optional(),
    invert: z.boolean(),
    onDelayMs: z.number().min(0),
    offDelayMs: z.number().min(0),
    threshold: z.number(),
    hysteresis: z.number().min(0),
    condition: z.enum(['gt', 'ge', 'lt', 'le']),
    initialActive: z.boolean(),
  })
  .refine((p) => p.kind !== undefined, {
    message: 'switch_di: kind bắt buộc (OQ-287).',
  });

export type SwitchDiParams = z.infer<typeof switchDiParamsSchema>;

export interface SwitchDiState {
  cond: boolean;
  onTimer: DelayTimerState;
  offTimer: DelayTimerState;
  active: boolean;
}

const DEFAULT_PARAMS: SwitchDiParams = {
  invert: false,
  onDelayMs: 0,
  offDelayMs: 0,
  threshold: 0,
  hysteresis: 0,
  condition: 'gt',
  initialActive: false,
};

export const switchDiModel: EquipmentModel<SwitchDiParams, SwitchDiState> = {
  type: 'switch_di',
  version: '1.0.0',
  description: 'Công tắc/limit/level/zero-speed/pull-cord (M2 §7.6).',
  roles: [
    {
      role: 'di',
      kind: 'DI',
      dataType: 'Bool',
      description: 'Trạng thái công tắc (sau invert)',
      synonyms: ['DI', 'SWITCH', 'LS'],
      descKeywords: ['switch', 'limit', 'level', 'contact', 'công tắc', 'tiếp điểm', 'schalter', 'kontakt'],
    },
  ],
  paramsSchema: switchDiParamsSchema,
  defaultParams: DEFAULT_PARAMS,
  observables: [
    { key: 'active', description: 'Trạng thái active sau delay + stuck/chatter, trước invert' },
    { key: 'di', description: 'Giá trị DI emit (sau invert)' },
  ],
  faults: [
    {
      id: 'stuckActive',
      description: 'Kẹt ở active — di giữ mức active (sau invert) (OQ-289).',
    },
    {
      id: 'stuckInactive',
      description: 'Kẹt ở inactive — di giữ mức inactive (sau invert) (OQ-289).',
    },
    {
      id: 'chatter',
      description: 'Rung tiếp điểm — lật active mỗi periodMs (OQ-288).',
      paramsSchema: z.object({
        periodMs: z.number().int().positive().optional().describe('Chu kỳ lật (ms); mặc định 100.'),
      }),
    },
  ],
  hasSource: true,
  docs: {
    transitions: [
      'cond: source bool → cond = value; source số → hysteresis (gt/ge: bật khi x ≥ threshold, tắt khi x ≤ threshold − hysteresis; lt/le: bật khi x ≤ threshold, tắt khi x ≥ threshold + hysteresis).',
      'cond → onDelayStep → offDelayStep → active → stuckActive/stuckInactive → chatter → di = invert ? !active : active.',
      'off-delay chỉ giữ khi active trước đó đã true (tránh true giả lúc khởi động khi offDelayMs>0 — bảng E).',
      'chatter: active XOR (floor((T−sinceMs)/periodMs) % 2 === 1), áp sau delay, trước invert (OQ-288).',
    ],
    notes: [
      'kind bắt buộc, không default (vi phạm → PL-E001) — OQ-287.',
      'pull_cord ép invert=true (params.invert bị bỏ qua); zero_speed ép condition=lt (OQ-287).',
      'gt/ge dùng hysteresisStep trực tiếp (bật tại x == threshold); lt/le qua -x (bật tại x == threshold).',
      'Observable active = sau stuck/chatter, trước invert; di = sau invert.',
    ],
  },
  init: (params: SwitchDiParams): SwitchDiState => {
    // Đã validate ở engine (refine OQ-287) — throw phòng vệ nếu tới được đây.
    if (params.kind === undefined) {
      throw new Error('switch_di: kind bắt buộc (OQ-287).');
    }
    return {
      cond: false,
      onTimer: { elapsedMs: 0 },
      offTimer: { elapsedMs: 0 },
      active: params.initialActive,
    };
  },
  step(ctx: StepCtx<SwitchDiParams, SwitchDiState>, slots: ModelSlots): void {
    const p = ctx.params;
    const s = ctx.state;
    const kind = p.kind;
    const effInvert = kind === 'pull_cord' ? true : p.invert;
    const effCondition = kind === 'zero_speed' ? 'lt' : p.condition;
    const diSlot = slots.role.di;
    const activeSlot = slots.obs.active;
    const diObsSlot = slots.obs.di;
    const stuckActiveSlot = slots.fault.stuckActive;
    const stuckInactiveSlot = slots.fault.stuckInactive;
    const chatterSlot = slots.fault.chatter;

    // 1. cond (có hysteresis).
    const src = ctx.source();
    if (typeof src === 'boolean') {
      s.cond = src;
    } else if (effCondition === 'gt' || effCondition === 'ge') {
      s.cond = hysteresisStep(s.cond, src, p.threshold, p.threshold - p.hysteresis);
    } else {
      // lt/le: đảo dấu để dùng lại hysteresisStep (onAt > offAt).
      s.cond = hysteresisStep(s.cond, -src, -p.threshold, -(p.threshold + p.hysteresis));
    }

    // 2. on/off-delay (nối tiếp) → active.
    // off-delay chỉ giữ khi active trước đó đã true — nếu không, lúc khởi
    // động (cond=false, offDelayMs>0) offDelayStep sẽ giữ true giả delayMs
    // đầu, trái bảng E (T=0..110 active=false).
    const onDelayed = onDelayStep(s.onTimer, s.cond, ctx.dtMs, p.onDelayMs);
    const delayed =
      s.active || onDelayed
        ? offDelayStep(s.offTimer, onDelayed, ctx.dtMs, p.offDelayMs)
        : false;
    s.active = delayed;

    // 3. stuck ở mức active (OQ-289), rồi chatter (OQ-288), rồi invert.
    let effActive = s.active;
    if (ctx.fault(stuckActiveSlot).active) effActive = true;
    if (ctx.fault(stuckInactiveSlot).active) effActive = false;
    const chatter = ctx.fault(chatterSlot);
    if (chatter.active) {
      const rawPeriod = chatter.params['periodMs'];
      const period = typeof rawPeriod === 'number' && rawPeriod > 0 ? rawPeriod : 100;
      if (Math.floor((ctx.simTimeMs - chatter.sinceMs) / period) % 2 === 1) {
        effActive = !effActive;
      }
    }
    const di = effInvert ? !effActive : effActive;
    ctx.emit(diSlot, di);
    ctx.setObs(activeSlot, effActive);
    ctx.setObs(diObsSlot, di);
  },
};
