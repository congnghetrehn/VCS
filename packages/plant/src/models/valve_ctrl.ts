// Model valve_ctrl (M2 §7.4, P2.3 — bảng C, STATE §26).
// Van/damper điều khiển vị trí theo posRef (%) qua rate limiter + deadband.

import { z } from 'zod';

import { lagStep, rateLimitStep } from '../delay.js';
import type { EquipmentModel, StepCtx } from '../registry.js';

export const valveCtrlParamsSchema = z.object({
  strokeTimeS: z.number().positive(),
  lagMs: z.number().min(0),
  deadbandPct: z.number().min(0).max(100),
  failPosition: z.enum(['hold', 'close', 'open']),
  initialPosPct: z.number().min(0).max(100),
  posFbRange: z.object({ engMin: z.number(), engMax: z.number() }),
  faultNC: z.boolean(),
});

export type ValveCtrlParams = z.infer<typeof valveCtrlParamsSchema>;

export interface ValveCtrlState {
  posPct: number;
  posFb: number;
  targetPct: number;
  latchedTarget: number | null;
  frozenFb: number | null;
}

const DEFAULT_PARAMS: ValveCtrlParams = {
  strokeTimeS: 20,
  lagMs: 0,
  deadbandPct: 0.5,
  failPosition: 'hold',
  initialPosPct: 0,
  posFbRange: { engMin: 0, engMax: 100 },
  faultNC: false,
};

export const valveCtrlModel: EquipmentModel<ValveCtrlParams, ValveCtrlState> = {
  type: 'valve_ctrl',
  version: '1.0.0',
  description: 'Van điều khiển vị trí theo posRef (M2 §7.4).',
  roles: [
    {
      role: 'posRef',
      kind: 'AO',
      dataType: 'Int',
      unit: '%',
      description: 'Vị trí đặt (%)',
      synonyms: ['POS_REF', 'POS_SP', 'POS_SET', 'SOLLWERT'],
      descKeywords: ['pos', 'setpoint', 'reference'],
    },
    {
      role: 'posFb',
      kind: 'AI',
      dataType: 'Int',
      unit: '%',
      description: 'Vị trí thực (%)',
      synonyms: ['POS_FB', 'POS', 'POS_ACT', 'POS_FBK', 'ISTWERT'],
      descKeywords: ['pos', 'feedback'],
    },
    {
      role: 'fault',
      kind: 'DI',
      dataType: 'Bool',
      optional: true,
      description: 'Lỗi van (đảo theo faultNC)',
      synonyms: ['FAULT', 'FAULT_DI', 'ALARM'],
      descKeywords: ['fault', 'alarm'],
    },
    {
      role: 'closedLs',
      kind: 'DI',
      dataType: 'Bool',
      optional: true,
      description: 'Limit switch van đóng (pos ≤ 1%)',
      synonyms: ['CLOSED_LS', 'CLOSE_LS', 'CLOSED_LIMIT', 'LS_CLOSED'],
      descKeywords: ['closed', 'limit'],
    },
    {
      role: 'openLs',
      kind: 'DI',
      dataType: 'Bool',
      optional: true,
      description: 'Limit switch van mở (pos ≥ 99%)',
      synonyms: ['OPEN_LS', 'OPEN_LIMIT', 'LS_OPEN'],
      descKeywords: ['open', 'limit'],
    },
  ],
  paramsSchema: valveCtrlParamsSchema,
  defaultParams: DEFAULT_PARAMS,
  observables: [
    { key: 'posPct', description: 'Vị trí van % (0..100)' },
    { key: 'targetPct', description: 'Vị trí đích hiệu dụng % (sau deadband/lỗi)' },
  ],
  faults: [
    { id: 'stuck', description: 'Kẹt — pos đóng băng tại giá trị hiện tại.' },
    {
      id: 'drift',
      description: 'Trôi vị trí sau bước rate-limit (OQ-281).',
      paramsSchema: z.object({ pctPerHour: z.number() }),
    },
    { id: 'positionerFail', description: 'Hỏng positioner — posFb đóng băng + target latch (OQ-282).' },
    { id: 'signalLoss', description: 'Mất tín hiệu posRef — về failPosition (OQ-283).' },
  ],
  docs: {
    transitions: [
      'target = |posRef − pos| > deadband ? clamp(posRef, 0, 100) : pos (dừng trong deadband — bảng C: 79.55, không đạt 80).',
      'pos đuổi target bằng rate limiter 100/(strokeTimeS×1000); posFb = lag(pos, lagMs).',
      'positionerFail: posFb đóng băng + target latch tại giá trị lúc fault bật (OQ-282).',
      'signalLoss: posRef hiệu dụng = failPosition (hold → pos hiện tại, close → 0, open → 100) — OQ-283.',
      'drift: sau bước rate-limit, pos += pctPerHour/3600000 × dtMs (OQ-281).',
    ],
    notes: [
      'closedLs/openLs ngưỡng cố định 1% (OQ-280): closedLs = pos ≤ 1, openLs = pos ≥ 99.',
      'fault DI = OR mọi equipment fault đang active, polarity theo faultNC (default false) — OQ-275.',
    ],
  },
  init: (params: ValveCtrlParams): ValveCtrlState => ({
    posPct: params.initialPosPct,
    posFb: params.initialPosPct,
    targetPct: params.initialPosPct,
    latchedTarget: null,
    frozenFb: null,
  }),
  step(ctx: StepCtx<ValveCtrlParams, ValveCtrlState>): void {
    const p = ctx.params;
    const s = ctx.state;

    const signalLoss = ctx.fault('signalLoss').active;
    const positionerFail = ctx.fault('positionerFail');
    const stuck = ctx.fault('stuck').active;
    const drift = ctx.fault('drift');

    // posRef hiệu dụng (OQ-283): mất tín hiệu → failPosition.
    let ref: number;
    if (signalLoss) {
      ref = p.failPosition === 'close' ? 0 : p.failPosition === 'open' ? 100 : s.posPct;
    } else {
      const cmdRef = ctx.cmd('posRef');
      ref = typeof cmdRef === 'number' ? cmdRef : s.posPct;
    }

    // Target qua deadband; positionerFail latch target lúc fault bật (OQ-282).
    let target = Math.abs(ref - s.posPct) > p.deadbandPct ? Math.min(100, Math.max(0, ref)) : s.posPct;
    if (positionerFail.active) {
      if (s.latchedTarget === null) s.latchedTarget = target;
      target = s.latchedTarget;
    } else {
      s.latchedTarget = null;
    }
    s.targetPct = target;

    // Pos đuổi target; stuck đóng băng; drift trôi sau rate-limit (OQ-281).
    if (!stuck) {
      const rate = 100 / (p.strokeTimeS * 1000);
      s.posPct = rateLimitStep(s.posPct, target, ctx.dtMs, rate, rate);
      if (drift.active) {
        const pctPerHour = (drift.params['pctPerHour'] as number | undefined) ?? 0;
        s.posPct = Math.min(100, Math.max(0, s.posPct + (pctPerHour / 3600000) * ctx.dtMs));
      }
    }

    // posFb: lag theo pos, hoặc đóng băng khi positionerFail (OQ-282).
    if (positionerFail.active) {
      if (s.frozenFb === null) s.frozenFb = s.posFb;
      s.posFb = s.frozenFb;
    } else {
      s.frozenFb = null;
      s.posFb = lagStep(s.posFb, s.posPct, ctx.dtMs, p.lagMs);
    }

    const anyFault = stuck || drift.active || positionerFail.active || signalLoss;
    const fault = p.faultNC ? !anyFault : anyFault;

    ctx.emit('posFb', s.posFb);
    ctx.emit('fault', fault);
    ctx.emit('closedLs', s.posPct <= 1);
    ctx.emit('openLs', s.posPct >= 99);

    ctx.setObs('posPct', s.posPct);
    ctx.setObs('targetPct', s.targetPct);
  },
};
