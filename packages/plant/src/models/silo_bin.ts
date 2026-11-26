// Model silo_bin (M2 §7.7, P2.3 — bảng F, STATE §26).
// Silo/bin mức vật liệu: named sources inflow/outflow (t/h) → mass →
// levelPct (lag) → switch high/low/highHigh có hysteresis.

import { z } from 'zod';

import { lagStep } from '../delay.js';
import type { EquipmentModel, StepCtx } from '../registry.js';

export const siloBinParamsSchema = z.object({
  capacityT: z.number().positive(),
  initialLevelPct: z.number().min(0).max(100),
  highPct: z.number().min(0).max(100),
  lowPct: z.number().min(0).max(100),
  highHighPct: z.number().min(0).max(100),
  hystPct: z.number().min(0),
  engMin: z.number(),
  engMax: z.number(),
  levelLagMs: z.number().min(0),
});

export type SiloBinParams = z.infer<typeof siloBinParamsSchema>;

export interface SiloBinState {
  massT: number;
  levelPct: number;
  high: boolean;
  low: boolean;
  highHigh: boolean;
}

const DEFAULT_PARAMS: SiloBinParams = {
  capacityT: 100,
  initialLevelPct: 30,
  highPct: 90,
  lowPct: 10,
  highHighPct: 97,
  hystPct: 2,
  engMin: 0,
  engMax: 100,
  levelLagMs: 0,
};

function asNumber(v: number | boolean): number {
  return typeof v === 'number' ? v : 0;
}

/**
 * Hysteresis hai ngưỡng theo đúng §7.7: bật khi x ≥ onAt, tắt khi x < offAt
 * (nghiêm ngặt — khác `hysteresisStep` vốn tắt tại ≤; plan ghi "tắt khi <").
 */
function highHysteresis(current: boolean, x: number, onAt: number, offAt: number): boolean {
  if (!current && x >= onAt) return true;
  if (current && x < offAt) return false;
  return current;
}

export const siloBinModel: EquipmentModel<SiloBinParams, SiloBinState> = {
  type: 'silo_bin',
  version: '1.0.0',
  description: 'Silo/bin mức vật liệu (M2 §7.7).',
  roles: [
    {
      role: 'levelRaw',
      kind: 'AI',
      dataType: 'Int',
      description: 'Mức vật liệu (%, đã lag)',
      synonyms: ['LEVEL_RAW', 'LEVEL', 'LT'],
      descKeywords: ['level', 'silo', 'bin', 'mass'],
      optional: true,
    },
    {
      role: 'levelHigh',
      kind: 'DI',
      dataType: 'Bool',
      description: 'Mức cao (≥ highPct)',
      synonyms: ['LEVEL_HIGH', 'LSH', 'HIGH'],
      descKeywords: ['level', 'high'],
      optional: true,
    },
    {
      role: 'levelLow',
      kind: 'DI',
      dataType: 'Bool',
      description: 'Mức thấp (≤ lowPct)',
      synonyms: ['LEVEL_LOW', 'LSL', 'LOW'],
      descKeywords: ['level', 'low'],
      optional: true,
    },
    {
      role: 'levelHighHigh',
      kind: 'DI',
      dataType: 'Bool',
      description: 'Mức rất cao (≥ highHighPct)',
      synonyms: ['LEVEL_HIGH_HIGH', 'LSHH'],
      descKeywords: ['level', 'high'],
      optional: true,
    },
  ],
  paramsSchema: siloBinParamsSchema,
  defaultParams: DEFAULT_PARAMS,
  observables: [
    { key: 'levelPct', description: 'Mức vật liệu % (đã lag theo levelLagMs)' },
    { key: 'massT', description: 'Khối lượng trong silo (tấn, không lag)' },
    { key: 'inflowTph', description: 'Lưu lượng vào (t/h, named source inflow)' },
    { key: 'outflowTph', description: 'Lưu lượng ra (t/h, named source outflow)' },
  ],
  // Không có equipment fault riêng — chỉ signal fault trên levelRaw.
  faults: [],
  // hasSource=true vì model đọc source (named inflow/outflow); source chính
  // không dùng (mặc định const 0).
  hasSource: true,
  docs: {
    transitions: [
      'mass += (inflow − outflow) × dt/3 600 000 (t/h × ms), clamp [0, capacityT]; levelPct = lag(mass/capacityT×100, levelLagMs).',
      'levelHigh: bật khi levelPct ≥ highPct, tắt khi < highPct − hystPct; levelLow: bật khi ≤ lowPct, tắt khi > lowPct + hystPct; levelHighHigh mirror levelHigh với highHighPct (OQ-291). Ngưỡng tắt nghiêm ngặt (< / >), khác hysteresisStep (≤).',
      'emit levelRaw = levelPct (đã lag); massT không lag (OQ-291).',
    ],
    notes: [
      'inflow/outflow là named sources (OQ-290), mặc định const 0 khi không cấu hình.',
      'Không có equipment fault (spec §7.7 không liệt kê) — chỉ signal fault trên levelRaw.',
    ],
  },
  init: (params: SiloBinParams): SiloBinState => {
    const mass = (params.capacityT * params.initialLevelPct) / 100;
    return {
      massT: mass,
      levelPct: params.initialLevelPct,
      high: params.initialLevelPct >= params.highPct,
      low: params.initialLevelPct <= params.lowPct,
      highHigh: params.initialLevelPct >= params.highHighPct,
    };
  },
  step(ctx: StepCtx<SiloBinParams, SiloBinState>): void {
    const p = ctx.params;
    const s = ctx.state;
    const inflow = asNumber(ctx.source('inflow'));
    const outflow = asNumber(ctx.source('outflow'));
    s.massT = Math.min(p.capacityT, Math.max(0, s.massT + ((inflow - outflow) * ctx.dtMs) / 3600000));
    const rawPct = (s.massT / p.capacityT) * 100;
    s.levelPct = lagStep(s.levelPct, rawPct, ctx.dtMs, p.levelLagMs);
    s.high = highHysteresis(s.high, s.levelPct, p.highPct, p.highPct - p.hystPct);
    s.low = highHysteresis(s.low, -s.levelPct, -p.lowPct, -(p.lowPct + p.hystPct));
    s.highHigh = highHysteresis(s.highHigh, s.levelPct, p.highHighPct, p.highHighPct - p.hystPct);
    ctx.emit('levelRaw', s.levelPct);
    ctx.emit('levelHigh', s.high);
    ctx.emit('levelLow', s.low);
    ctx.emit('levelHighHigh', s.highHigh);
    ctx.setObs('levelPct', s.levelPct);
    ctx.setObs('massT', s.massT);
    ctx.setObs('inflowTph', inflow);
    ctx.setObs('outflowTph', outflow);
  },
};
