// Model analog_sensor (M2 §7.5, P2.3 — bảng D/J, STATE §26).
// Cảm biến tương tự: source → lag → + noise Gaussian → emit AI.

import { z } from 'zod';

import { engToRaw } from '../adapter.js';
import { lagStep } from '../delay.js';
import type { EquipmentModel, ModelSlots, StepCtx } from '../registry.js';

// engMin/engMax/unit bắt buộc (OQ-284): zod optional + refine bắt buộc có mặt
// (defaultParams không thể chứa giá trị mặc định cho trường "không default").
export const analogSensorParamsSchema = z
  .object({
    engMin: z.number().optional(),
    engMax: z.number().optional(),
    unit: z.string().min(1).optional(),
    tauMs: z.number().min(0),
    noiseStd: z.number().min(0),
    initialValue: z.number().optional(),
  })
  .refine((p) => p.engMin !== undefined && p.engMax !== undefined && p.unit !== undefined, {
    message: 'analog_sensor: engMin, engMax, unit bắt buộc (OQ-284).',
  })
  .refine(
    (p) => p.engMin === undefined || p.engMax === undefined || p.engMin < p.engMax,
    { message: 'analog_sensor: engMin phải < engMax (OQ-284).' },
  );

export type AnalogSensorParams = z.infer<typeof analogSensorParamsSchema>;

export interface AnalogSensorState {
  pv: number;
  engMin: number;
  engMax: number;
}

const DEFAULT_PARAMS: AnalogSensorParams = {
  tauMs: 0,
  noiseStd: 0,
};

export const analogSensorModel: EquipmentModel<AnalogSensorParams, AnalogSensorState> = {
  type: 'analog_sensor',
  version: '1.0.0',
  description: 'Cảm biến tương tự (M2 §7.5).',
  roles: [
    {
      role: 'raw',
      kind: 'AI',
      dataType: 'Int',
      description: 'Giá trị đo (đơn vị theo param unit)',
      synonyms: ['RAW', 'PV', 'VALUE', 'MEAS'],
      descKeywords: ['measure', 'sensor', 'value'],
    },
  ],
  paramsSchema: analogSensorParamsSchema,
  defaultParams: DEFAULT_PARAMS,
  observables: [
    { key: 'pv', description: 'Giá trị đo đã lọc (eng, chưa cộng noise)' },
    { key: 'raw', description: 'Giá trị raw int (eng→raw theo engMin/engMax, chưa qua signal fault)' },
  ],
  // Không có equipment fault riêng — dùng signal fault (OQ-285).
  faults: [],
  presets: {
    wireBreak: {
      description: 'Đứt dây — raw=32767 (wireBreakRaw mặc định).',
      signalFault: { role: 'raw', type: 'wireBreak' },
    },
    drift: {
      description: 'Trôi — signal fault drift trên role raw (rate theo params, mặc định 0).',
      signalFault: { role: 'raw', type: 'drift' },
    },
    stuck: {
      description: 'Kẹt — signal fault stuck trên role raw (cần params.value để có hiệu lực).',
      signalFault: { role: 'raw', type: 'stuck' },
    },
    noisy: {
      description: 'Nhiễu — signal fault noise trên role raw (std theo params, mặc định 0).',
      signalFault: { role: 'raw', type: 'noise' },
    },
  },
  hasSource: true,
  docs: {
    transitions: [
      'pv_target = source(); pv = lag(pv, pv_target, tauMs); eng_out = pv + noise; emit(raw, eng_out).',
      'noise Gaussian Box–Muller, 2 rand()/bước, σ=noiseStd; noiseStd==0 → không gọi rand() (OQ-285).',
      'Không có equipment fault — signal fault drift/stuck/freeze/noise/spike/wireBreak/offset/gain trên role raw.',
    ],
    notes: [
      'engMin/engMax/unit bắt buộc, engMin < engMax (vi phạm → PL-E001) — OQ-284.',
      'pv khởi tạo = initialValue ?? 0 (mọi loại source) — OQ-286.',
      'Observable raw = eng→raw của eng_out (chưa qua signal fault); tag raw chịu signal fault.',
      'Công thức noise + preset vẫn UNVERIFIED chờ S1 (OQ-285).',
    ],
  },
  init: (params: AnalogSensorParams): AnalogSensorState => {
    // Đã validate ở engine (refine OQ-284) — throw phòng vệ nếu tới được đây.
    if (params.engMin === undefined || params.engMax === undefined) {
      throw new Error('analog_sensor: engMin/engMax bắt buộc (OQ-284).');
    }
    return { pv: params.initialValue ?? 0, engMin: params.engMin, engMax: params.engMax };
  },
  step(ctx: StepCtx<AnalogSensorParams, AnalogSensorState>, slots: ModelSlots): void {
    const p = ctx.params;
    const s = ctx.state;
    const rawSlot = slots.role.raw;
    const pvSlot = slots.obs.pv;
    const rawObsSlot = slots.obs.raw;
    const src = ctx.source();
    const target = typeof src === 'number' ? src : 0;
    s.pv = lagStep(s.pv, target, ctx.dtMs, p.tauMs);
    let engOut = s.pv;
    // noiseStd==0 → không gọi rand() để khỏi trôi PRNG stream (OQ-285).
    // Noise Gaussian Box–Muller, 2 rand()/bước; u1' = 1−u1 tránh log 0.
    if (p.noiseStd > 0) {
      const u1 = 1 - ctx.rand();
      const u2 = ctx.rand();
      engOut += Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * p.noiseStd;
    }
    ctx.emit(rawSlot, engOut);
    ctx.setObs(pvSlot, s.pv);
    ctx.setObs(rawObsSlot, engToRaw(engOut, { rawMin: 0, rawMax: 27648, engMin: s.engMin, engMax: s.engMax }));
  },
};
