// Model valve_onoff (M2 §7.3, P2.3 — bảng B/I, STATE §26).
// Van đóng/mở kèm limit switch. Vị trí tính bằng % (0..100).

import { z } from 'zod';

import type { EquipmentModel, StepCtx } from '../registry.js';

export const valveOnoffParamsSchema = z.object({
  travelTimeMs: z.number().positive(),
  singleSolenoid: z.boolean(),
  lsThresholdPct: z.number().min(0).max(50),
  initialPosPct: z.number().min(0).max(100),
  bothCmdPolicy: z.enum(['hold']),
  faultNC: z.boolean(),
});

export type ValveOnoffParams = z.infer<typeof valveOnoffParamsSchema>;

export type ValveOnoffStateName = 'CLOSED' | 'OPENING' | 'OPEN' | 'CLOSING' | 'INTERMEDIATE';

export interface ValveOnoffState {
  posPct: number;
  dir: number;
  warnedBothCmd: boolean;
  frozenPos: number | null;
}

const DEFAULT_PARAMS: ValveOnoffParams = {
  travelTimeMs: 5000,
  singleSolenoid: false,
  lsThresholdPct: 1,
  initialPosPct: 0,
  bothCmdPolicy: 'hold',
  faultNC: false,
};

/** Suy state từ pos + dir. So bằng eps 1e-9 (OQ-302): 0.1 cộng 1000 lần
 *  = 99.9999999999986, không ra đúng 100 — `pos == 100` exact sẽ kẹt
 *  OPENING mãi (cùng họ bẫy float với OQ-273 của vfd). */
const POS_EPS = 1e-9;

function deriveState(pos: number, dir: number): ValveOnoffStateName {
  if (pos <= POS_EPS) return 'CLOSED';
  if (pos >= 100 - POS_EPS) return 'OPEN';
  if (dir > 0) return 'OPENING';
  if (dir < 0) return 'CLOSING';
  return 'INTERMEDIATE';
}

export const valveOnoffModel: EquipmentModel<ValveOnoffParams, ValveOnoffState> = {
  type: 'valve_onoff',
  version: '1.0.0',
  description: 'Van đóng/mở kèm limit switch (M2 §7.3).',
  roles: [
    {
      role: 'openCmd',
      kind: 'DO',
      dataType: 'Bool',
      description: 'Lệnh mở van từ PLC',
      synonyms: ['OPEN_CMD', 'OPEN', 'START_OPEN'],
      descKeywords: ['open', 'valve'],
    },
    {
      role: 'closeCmd',
      kind: 'DO',
      dataType: 'Bool',
      optional: true,
      description: 'Lệnh đóng van từ PLC',
      synonyms: ['CLOSE_CMD', 'CLOSE'],
      descKeywords: ['close', 'valve'],
    },
    {
      role: 'openLs',
      kind: 'DI',
      dataType: 'Bool',
      description: 'Limit switch van mở',
      synonyms: ['OPEN_LS', 'OPEN_LIMIT', 'LS_OPEN'],
      descKeywords: ['open', 'limit'],
    },
    {
      role: 'closedLs',
      kind: 'DI',
      dataType: 'Bool',
      description: 'Limit switch van đóng',
      synonyms: ['CLOSED_LS', 'CLOSE_LS', 'CLOSED_LIMIT', 'LS_CLOSED'],
      descKeywords: ['closed', 'limit'],
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
  ],
  paramsSchema: valveOnoffParamsSchema,
  defaultParams: DEFAULT_PARAMS,
  observables: [
    { key: 'posPct', description: 'Vị trí van % (0..100)' },
    { key: 'moving', description: 'Van đang chuyển động (dir != 0)' },
    { key: 'state', description: 'Trạng thái van (CLOSED/OPENING/OPEN/CLOSING/INTERMEDIATE)' },
  ],
  faults: [
    { id: 'stuckOpen', description: 'Kẹt mở — ép pos=100 (OQ-278).' },
    { id: 'stuckClosed', description: 'Kẹt đóng — ép pos=0 (OQ-278).' },
    {
      id: 'stuckAtPos',
      description: 'Đóng băng pos tại giá trị lúc fault bật (OQ-278).',
      paramsSchema: z.object({ pct: z.number().min(0).max(100) }),
    },
    {
      id: 'slowTravel',
      description: 'Chạy chậm — travelTime hiệu dụng × factor (OQ-279).',
      paramsSchema: z.object({ factor: z.number().positive() }),
    },
    { id: 'travelTimeout', description: 'Không đạt vị trí cuối — pos đóng băng + fault=true (OQ-276).' },
    { id: 'lsOpenFail', description: 'Limit switch mở luôn false.' },
    { id: 'lsClosedFail', description: 'Limit switch đóng luôn false.' },
  ],
  docs: {
    states: [
      { state: 'CLOSED', description: 'Đóng — pos ≈ 0.' },
      { state: 'OPENING', description: 'Đang mở (dir +1, pos ở giữa).' },
      { state: 'OPEN', description: 'Mở — pos ≈ 100.' },
      { state: 'CLOSING', description: 'Đang đóng (dir −1, pos ở giữa).' },
      { state: 'INTERMEDIATE', description: 'Ở giữa, không lệnh (dir = 0).' },
    ],
    transitions: [
      'pos == 0 → CLOSED; pos == 100 → OPEN; dir +1 → OPENING; dir −1 → CLOSING; còn lại INTERMEDIATE.',
      'Cả hai lệnh cùng true (double solenoid) → hold + warn 1 lần (OQ-277).',
      'stuckOpen → pos=100; stuckClosed → pos=0; stuckAtPos → đóng băng tại pos lúc fault bật (OQ-278).',
    ],
    notes: [
      'fault DI = OR mọi equipment fault đang active, polarity theo faultNC (default false) — OQ-275.',
      'travelTimeout: fault inject, pos đóng băng + fault=true, không có watchdog tự động (OQ-276).',
      'slowTravel: travelTime hiệu dụng = travelTimeMs × factor (OQ-279).',
    ],
  },
  init: (params: ValveOnoffParams): ValveOnoffState => ({
    posPct: params.initialPosPct,
    dir: 0,
    warnedBothCmd: false,
    frozenPos: null,
  }),
  step(ctx: StepCtx<ValveOnoffParams, ValveOnoffState>): void {
    const p = ctx.params;
    const s = ctx.state;
    const openCmd = ctx.cmd('openCmd') === true;
    const closeCmd = ctx.cmd('closeCmd') === true;

    // Hướng chạy (OQ-277: cả hai lệnh true ở chế độ double → hold + warn 1 lần).
    let dir = 0;
    if (p.singleSolenoid) {
      dir = openCmd ? 1 : -1;
    } else if (openCmd && closeCmd) {
      dir = 0;
      if (!s.warnedBothCmd) {
        s.warnedBothCmd = true;
        ctx.log('warn', 'openCmd và closeCmd cùng true — giữ nguyên (bothCmdPolicy=hold).');
      }
    } else if (openCmd) {
      dir = 1;
    } else if (closeCmd) {
      dir = -1;
    }
    s.dir = dir;

    const stuckOpen = ctx.fault('stuckOpen').active;
    const stuckClosed = ctx.fault('stuckClosed').active;
    const stuckAtPos = ctx.fault('stuckAtPos');
    const travelTimeout = ctx.fault('travelTimeout').active;
    const slowTravel = ctx.fault('slowTravel');
    const anyFault =
      stuckOpen ||
      stuckClosed ||
      stuckAtPos.active ||
      slowTravel.active ||
      travelTimeout ||
      ctx.fault('lsOpenFail').active ||
      ctx.fault('lsClosedFail').active;

    if (stuckOpen) {
      s.posPct = 100;
    } else if (stuckClosed) {
      s.posPct = 0;
    } else if (stuckAtPos.active) {
      // Đóng băng tại pos lúc fault bật (lưu lần đầu thấy active).
      if (s.frozenPos === null) s.frozenPos = s.posPct;
      s.posPct = s.frozenPos;
    } else {
      s.frozenPos = null;
      if (!travelTimeout && dir !== 0) {
        const factor = slowTravel.active ? (slowTravel.params['factor'] as number | undefined) ?? 1 : 1;
        const rate = 100 / (p.travelTimeMs * factor);
        s.posPct = Math.min(100, Math.max(0, s.posPct + dir * rate * ctx.dtMs));
      }
    }

    const thr = p.lsThresholdPct;
    const openLs = !ctx.fault('lsOpenFail').active && s.posPct >= 100 - thr;
    const closedLs = !ctx.fault('lsClosedFail').active && s.posPct <= thr;
    const fault = p.faultNC ? !anyFault : anyFault;

    ctx.emit('openLs', openLs);
    ctx.emit('closedLs', closedLs);
    ctx.emit('fault', fault);

    ctx.setObs('posPct', s.posPct);
    ctx.setObs('moving', dir !== 0);
    ctx.setObs('state', deriveState(s.posPct, dir));
  },
};
