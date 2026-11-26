// Model `motor_vfd` — động cơ biến tần (M2 §7.2, P2.3).
// Tốc độ đuổi target bằng rate limiter; speedFb lag theo speed;
// state suy từ speed/target SAU cập nhật tốc độ (OQ-273, eps 1e-9).
// Synonyms: spec §7.2–7.8 không liệt kê bảng synonym (chỉ §7.1 có) —
// dùng quy ước hậu tố mirror §7.1 (OQ-301, xem lại ở P2.7 với I/O list thật).

import { z } from 'zod';

import { lagStep, rateLimitStep } from '../delay.js';
import type { EquipmentModel } from '../registry.js';

/**
 * Tham số motor_vfd (M2 §7.2 — 9 tham số + `faultNC` thêm theo OQ-269).
 * Không `.strict()` — theo quy ước P2.1: unknown key bị zod strip.
 */
export const motorVfdParamsSchema = z.object({
  accelTimeS: z.number().min(0).describe('Thời gian tăng tốc 0→100% (s).'),
  decelTimeS: z.number().min(0).describe('Thời gian giảm tốc 100→0% (s).'),
  minSpeedPct: z.number().min(0).max(100).describe('Tốc độ nhỏ nhất cho phép (%).'),
  maxSpeedPct: z.number().min(0).max(100).describe('Tốc độ lớn nhất cho phép (%).'),
  runThresholdPct: z.number().min(0).max(100).describe('Ngưỡng tốc độ để runFb = true (%).'),
  speedFbLagMs: z.number().min(0).describe('Hằng số thời gian lag của speedFb (ms).'),
  coastTimeS: z.number().min(0).describe('Thời gian quán tính khi trip/ngắt (s).'),
  ratedCurrentA: z.number().min(0).describe('Dòng định mức (A); 0 = không mô phỏng dòng.'),
  loadFraction: z.number().min(0).max(1).describe('Tỷ lệ tải (0..1).'),
  faultNC: z.boolean().describe('vfdFaultOk = true khi bình thường (tiếp điểm NC) — OQ-269.'),
});

export type MotorVfdParams = z.infer<typeof motorVfdParamsSchema>;

/** Trạng thái motor_vfd (JSON-serializable). */
export interface MotorVfdState {
  state: 'STOPPED' | 'RAMP_UP' | 'AT_SPEED' | 'RAMP_DOWN' | 'TRIPPED';
  speedPct: number;
  speedFb: number;
  /** Lệnh latch khi commLoss bật (OQ-271); undefined khi không latch. */
  latched: { runCmd: boolean; speedRef: number } | undefined;
  /** speedFb đóng băng khi commLoss bật (OQ-271); undefined khi không đóng băng. */
  frozenFb: number | undefined;
}

/** Sai số so sánh float tốc độ/target (OQ-273). */
const VFD_EPS = 1e-9;

function clampPct(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export const motorVfdModel: EquipmentModel<MotorVfdParams, MotorVfdState> = {
  type: 'motor_vfd',
  version: '1.0.0',
  description: 'Động cơ biến tần (VFD) — M2 §7.2.',
  roles: [
    {
      role: 'runCmd',
      kind: 'DO',
      dataType: 'Bool',
      description: 'Lệnh chạy từ PLC',
      synonyms: ['RUN_CMD', 'START_CMD', 'RUN', 'START', 'CMD'],
      descKeywords: ['run', 'start'],
    },
    {
      role: 'speedRef',
      kind: 'AO',
      dataType: 'Int',
      unit: '%',
      description: 'Tốc độ đặt (%)',
      synonyms: ['SPEED_REF', 'SPEED_SP', 'SPEED_SET', 'SOLLWERT'],
      descKeywords: ['speed', 'setpoint', 'reference'],
    },
    {
      role: 'runFb',
      kind: 'DI',
      dataType: 'Bool',
      description: 'Phản hồi đang chạy',
      synonyms: ['RUN_FB', 'RUNNING', 'RUN_ST', 'AUX', 'RUN_FBK'],
      descKeywords: ['run', 'feedback'],
    },
    {
      role: 'speedFb',
      kind: 'AI',
      dataType: 'Int',
      unit: '%',
      description: 'Tốc độ thực (%)',
      synonyms: ['SPEED_FB', 'SPEED', 'SPEED_ACT', 'SPEED_FBK', 'ISTWERT'],
      descKeywords: ['speed', 'feedback'],
    },
    {
      role: 'ready',
      kind: 'DI',
      dataType: 'Bool',
      optional: true,
      description: 'Sẵn sàng (không lỗi, không mất truyền thông)',
      synonyms: ['READY', 'RDY', 'MCB_OK', 'BREAKER_ON'],
      descKeywords: ['ready', 'breaker'],
    },
    {
      role: 'vfdFaultOk',
      kind: 'DI',
      dataType: 'Bool',
      optional: true,
      description: 'Không lỗi biến tần (đảo theo faultNC)',
      synonyms: ['VFD_OK', 'VFD_FAULT_OK', 'DRIVE_OK', 'FAULT_OK'],
      descKeywords: ['vfd', 'fault', 'drive'],
    },
    {
      role: 'remote',
      kind: 'DI',
      dataType: 'Bool',
      optional: true,
      description: 'Chế độ điều khiển từ xa',
      synonyms: ['REMOTE', 'REM', 'AUTO_SEL'],
      descKeywords: ['remote', 'auto'],
    },
    {
      role: 'currentFb',
      kind: 'AI',
      dataType: 'Int',
      unit: 'A',
      optional: true,
      description: 'Dòng điện (A)',
      synonyms: ['CUR', 'CURRENT', 'AMP', 'I_ACT'],
      descKeywords: ['current', 'amp'],
    },
  ],
  paramsSchema: motorVfdParamsSchema,
  defaultParams: {
    accelTimeS: 10,
    decelTimeS: 10,
    minSpeedPct: 0,
    maxSpeedPct: 100,
    runThresholdPct: 2,
    speedFbLagMs: 200,
    coastTimeS: 20,
    ratedCurrentA: 0,
    loadFraction: 0.7,
    faultNC: true,
  },
  observables: [
    { key: 'speedPct', description: 'Tốc độ % (0..100)' },
    { key: 'targetPct', description: 'Tốc độ đích hiệu dụng % (sau clamp/lệch lỗi)' },
    { key: 'currentA', description: 'Dòng điện (A)' },
    { key: 'running', description: 'Đang chạy (speedPct > runThresholdPct)' },
    { key: 'state', description: 'Trạng thái máy (STOPPED/RAMP_UP/AT_SPEED/RAMP_DOWN/TRIPPED)' },
  ],
  faults: [
    { id: 'vfdTrip', description: 'Biến tần trip — target về 0, giảm tốc theo coastTimeS.' },
    { id: 'rampFail', description: 'Lỗi ramp — tốc độ đứng yên giá trị hiện tại.' },
    {
      id: 'speedDeviation',
      description: 'Lệch tốc độ — target lệch ±pct (OQ-270).',
      paramsSchema: z.object({ pct: z.number().describe('Độ lệch target (%, có dấu).') }),
    },
    { id: 'commLoss', description: 'Mất truyền thông — latch lệnh, speedFb đóng băng, ready=false (OQ-271).' },
    { id: 'notReady', description: 'Không sẵn sàng — không cho chạy.' },
    { id: 'localMode', description: 'Chế độ local — PLC không điều khiển được.' },
  ],
  docs: {
    states: [
      { state: 'STOPPED', description: 'Dừng — tốc độ ≈ 0, target = 0.' },
      { state: 'RAMP_UP', description: 'Đang tăng tốc về phía target.' },
      { state: 'AT_SPEED', description: 'Đã đạt target (|speed − target| ≤ 1e-9).' },
      { state: 'RAMP_DOWN', description: 'Đang giảm tốc về phía target (hoặc về 0).' },
      { state: 'TRIPPED', description: 'Đã trip — giảm tốc theo coastTimeS, ready/vfdFaultOk = false.' },
    ],
    transitions: [
      'vfdTrip active → TRIPPED (bất kỳ state nào).',
      'TRIPPED: trip clear → RAMP_DOWN (speed > 0) hoặc STOPPED (speed ≈ 0).',
      'target > 0: |speed − target| ≤ 1e-9 → AT_SPEED; speed < target → RAMP_UP; speed > target → RAMP_DOWN.',
      'target = 0: speed ≈ 0 → STOPPED, còn lại RAMP_DOWN.',
      'So sánh tốc độ bằng eps 1e-9 (float tích lũy 0.1/bước không ra đúng 50.0) — OQ-273.',
    ],
    notes: [
      'speedFb = lag(speed, speedFbLagMs), offset(fault) = 0 (OQ-268); speedDeviation lệch target, không cộng offset riêng.',
      'currentA = ratedCurrentA × loadFraction × speedPct/100 khi speed > 0, ngược lại 0 (OQ-274, UNVERIFIED chờ S1).',
      'commLoss latch lệnh lúc fault bật, speedFb đóng băng tại giá trị lúc fault bật (OQ-271).',
      'running = speedPct > runThresholdPct (cùng ngưỡng với runFb).',
      'T=300 bảng A: speed tích lũy float 2.0000000000000004 > 2 → runFb = true (bẫy float, không sửa theo toán exact).',
    ],
  },
  init: () => ({ state: 'STOPPED', speedPct: 0, speedFb: 0, latched: undefined, frozenFb: undefined }),
  step: (ctx, slots) => {
    const p = ctx.params;
    const s = ctx.state;
    const runCmdSlot = slots.role.runCmd;
    const speedRefSlot = slots.role.speedRef;
    const runFbSlot = slots.role.runFb;
    const speedFbSlot = slots.role.speedFb;
    const readySlot = slots.role.ready;
    const vfdFaultOkSlot = slots.role.vfdFaultOk;
    const remoteSlot = slots.role.remote;
    const currentFbSlot = slots.role.currentFb;
    const speedPctSlot = slots.obs.speedPct;
    const targetPctSlot = slots.obs.targetPct;
    const currentASlot = slots.obs.currentA;
    const runningSlot = slots.obs.running;
    const stateSlot = slots.obs.state;
    const vfdTripSlot = slots.fault.vfdTrip;
    const rampFailSlot = slots.fault.rampFail;
    const speedDeviationSlot = slots.fault.speedDeviation;
    const commLossSlot = slots.fault.commLoss;
    const notReadySlot = slots.fault.notReady;
    const localModeSlot = slots.fault.localMode;
    const vfdTrip = ctx.fault(vfdTripSlot);
    const rampFail = ctx.fault(rampFailSlot);
    const speedDeviation = ctx.fault(speedDeviationSlot);
    const commLoss = ctx.fault(commLossSlot);
    const notReady = ctx.fault(notReadySlot);
    const localMode = ctx.fault(localModeSlot);
    const cmdRun = ctx.cmd(runCmdSlot) === true;
    const cmdRefRaw = ctx.cmd(speedRefSlot);
    const cmdRef = typeof cmdRefRaw === 'number' ? cmdRefRaw : 0;
    // commLoss (OQ-271): latch lệnh + đóng băng speedFb tại giá trị lúc fault bật.
    if (commLoss.active) {
      if (s.latched === undefined) {
        s.latched = { runCmd: cmdRun, speedRef: cmdRef };
        s.frozenFb = s.speedFb;
      }
    } else {
      s.latched = undefined;
      s.frozenFb = undefined;
    }
    const runCmd = s.latched !== undefined ? s.latched.runCmd : cmdRun;
    const speedRef = s.latched !== undefined ? s.latched.speedRef : cmdRef;
    const canRun = !notReady.active && !localMode.active;
    let target = runCmd && canRun ? clampPct(speedRef, p.minSpeedPct, p.maxSpeedPct) : 0;
    // speedDeviation (OQ-270): lệch target (pct có dấu), clamp 0..100.
    if (speedDeviation.active) {
      const pct = speedDeviation.params['pct'];
      target = clampPct(target + (typeof pct === 'number' ? pct : 0), 0, 100);
    }
    // Tốc độ đuổi target bằng rate limiter; vfdTrip → giảm theo coast;
    // rampFail → đóng băng tốc độ (OQ-272).
    const upRate = 100 / (p.accelTimeS * 1000);
    const downRate = vfdTrip.active
      ? 100 / (p.coastTimeS * 1000)
      : 100 / (p.decelTimeS * 1000);
    if (vfdTrip.active) target = 0;
    if (!rampFail.active) {
      s.speedPct = rateLimitStep(s.speedPct, target, ctx.dtMs, upRate, downRate);
    }
    // speedFb (OQ-268): lag theo speed; commLoss đóng băng.
    if (commLoss.active && s.frozenFb !== undefined) {
      s.speedFb = s.frozenFb;
    } else {
      s.speedFb = lagStep(s.speedFb, s.speedPct, ctx.dtMs, p.speedFbLagMs);
    }
    // State suy từ speed/target SAU cập nhật tốc độ (OQ-273).
    if (vfdTrip.active) {
      s.state = 'TRIPPED';
    } else if (s.state === 'TRIPPED') {
      s.state = s.speedPct > VFD_EPS ? 'RAMP_DOWN' : 'STOPPED';
    } else if (target > 0) {
      if (Math.abs(s.speedPct - target) <= VFD_EPS) s.state = 'AT_SPEED';
      else if (s.speedPct < target) s.state = 'RAMP_UP';
      else s.state = 'RAMP_DOWN';
    } else {
      s.state = s.speedPct <= VFD_EPS ? 'STOPPED' : 'RAMP_DOWN';
    }
    const currentA =
      s.speedPct > 0 ? p.ratedCurrentA * p.loadFraction * (s.speedPct / 100) : 0;
    const runFb = s.speedPct > p.runThresholdPct;
    const ready = !notReady.active && !vfdTrip.active && !commLoss.active;
    const remote = !localMode.active;
    const tripped = s.state === 'TRIPPED';
    ctx.setObs(speedPctSlot, s.speedPct);
    ctx.setObs(targetPctSlot, target);
    ctx.setObs(currentASlot, currentA);
    ctx.setObs(runningSlot, runFb);
    ctx.setObs(stateSlot, s.state);
    ctx.emit(runFbSlot, runFb);
    ctx.emit(speedFbSlot, s.speedFb);
    ctx.emit(readySlot, ready);
    ctx.emit(remoteSlot, remote);
    ctx.emit(vfdFaultOkSlot, p.faultNC ? !tripped : tripped);
    ctx.emit(currentFbSlot, currentA);
  },
};
