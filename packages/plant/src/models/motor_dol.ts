// Model `motor_dol` — động cơ khởi động trực tiếp (M2 §7.1, P2.2).
// Model thật đầu tiên trên nền P2.1 (OQ-246). Máy trạng thái 5 trạng thái,
// 6 luật theo thứ tự 1–6, một chuyển đổi duy nhất mỗi bước (OQ-255).
// speed/current tính theo state SAU chuyển đổi (OQ-256).
// `defaultRemote`/`defaultReady` được chấp nhận nhưng KHÔNG ảnh hưởng hành vi
// P2.2 — luật §7.1 chỉ tính canRun từ fault (OQ-259, UNVERIFIED chờ S1).

import { z } from 'zod';

import { rateLimitStep } from '../delay.js';
import type { EquipmentModel } from '../registry.js';

/**
 * Tham số motor_dol (M2 §7.1 — 15 tham số; plan §25 ghi 14 là đếm thiếu).
 * Không `.strict()` — theo quy ước P2.1: unknown key bị zod strip.
 */
export const motorDolParamsSchema = z.object({
  startDelayMs: z.number().int().min(0).describe('Thời gian từ lệnh chạy đến khi runFb lên (ms).'),
  stopDelayMs: z.number().int().min(0).describe('Thời gian từ khi hết lệnh đến khi runFb về false (ms).'),
  accelTimeMs: z.number().int().min(0).describe('Thời gian tăng tốc 0→100% (ms).'),
  coastTimeMs: z.number().int().min(0).describe('Thời gian quán tính giảm tốc 100→0% (ms).'),
  tripDelayMs: z.number().int().min(0).describe('Trễ từ khi lỗi overload bật đến khi trip (ms).'),
  overloadResetMs: z.number().int().min(0).describe('Thời gian chờ sau khi clear overload trước khi reset (ms).'),
  resetRequiresCmdOff: z.boolean().describe('Reset sau trip có yêu cầu runCmd = false không.'),
  overloadNC: z.boolean().describe('overloadOk = true khi bình thường (tiếp điểm NC).'),
  ratedCurrentA: z.number().min(0).describe('Dòng định mức (A); 0 = không mô phỏng dòng.'),
  noLoadCurrentFrac: z.number().min(0).max(1).describe('Tỷ lệ dòng không tải so với dòng định mức (0..1).'),
  loadFraction: z.number().min(0).max(1).describe('Tỷ lệ tải (0..1).'),
  inrushMult: z.number().min(1).describe('Hệ số dòng khởi động (≥ 1).'),
  inrushMs: z.number().min(0).describe('Thời gian dòng khởi động giảm về 0 (ms).'),
  defaultRemote: z.boolean().describe('Giá trị remote mặc định (P2.2: chưa dùng — xem OQ-259).'),
  defaultReady: z.boolean().describe('Giá trị ready mặc định (P2.2: chưa dùng — xem OQ-259).'),
});

export type MotorDolParams = z.infer<typeof motorDolParamsSchema>;

/** Trạng thái motor_dol (JSON-serializable; `tripClearedAt` mirror FaultManager — OQ-263). */
export interface MotorDolState {
  state: 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'TRIPPED';
  t0: number;
  t1: number;
  speedPct: number;
  tripClearedAt: number | undefined;
}

export const motorDolModel: EquipmentModel<MotorDolParams, MotorDolState> = {
  type: 'motor_dol',
  version: '1.0.0',
  description: 'Động cơ khởi động trực tiếp (DOL) — M2 §7.1.',
  roles: [
    {
      role: 'runCmd',
      kind: 'DO',
      dataType: 'Bool',
      description: 'Lệnh chạy từ PLC',
      synonyms: ['RUN_CMD', 'START_CMD', 'RUN', 'START', 'CMD', 'BETRIEB_BEFEHL'],
      descKeywords: ['run', 'start', 'chạy', 'khởi động', 'lauf', 'einschalten'],
    },
    {
      role: 'runFb',
      kind: 'DI',
      dataType: 'Bool',
      description: 'Phản hồi đang chạy',
      synonyms: ['RUN_FB', 'RUNNING', 'RUN_ST', 'AUX', 'RUN_FBK', 'RUECKMELDUNG'],
      descKeywords: ['run', 'feedback', 'phản hồi chạy', 'đang chạy', 'rückmeldung', 'läuft'],
    },
    {
      role: 'ready',
      kind: 'DI',
      dataType: 'Bool',
      optional: true,
      description: 'Sẵn sàng (MCB đóng, không lỗi)',
      synonyms: ['READY', 'RDY', 'MCB_OK', 'BREAKER_ON'],
      descKeywords: ['ready', 'breaker', 'sẵn sàng', 'bereit', 'betriebsbereit'],
    },
    {
      role: 'remote',
      kind: 'DI',
      dataType: 'Bool',
      optional: true,
      description: 'Chế độ điều khiển từ xa',
      synonyms: ['REMOTE', 'REM', 'AUTO_SEL'],
      descKeywords: ['remote', 'auto', 'từ xa', 'điều khiển xa', 'fern'],
    },
    {
      role: 'overloadOk',
      kind: 'DI',
      dataType: 'Bool',
      optional: true,
      description: 'Không quá tải (đảo theo overloadNC)',
      synonyms: ['OVL_OK', 'OL_OK', 'THERMAL_OK', 'OVERLOAD_OK', 'OVL'],
      descKeywords: ['overload', 'thermal', 'quá tải', 'überlast'],
    },
    {
      role: 'currentFb',
      kind: 'AI',
      dataType: 'Int',
      unit: 'A',
      optional: true,
      description: 'Dòng điện (A)',
      synonyms: ['CUR', 'CURRENT', 'AMP', 'I_ACT'],
      descKeywords: ['current', 'amp', 'dòng', 'dòng điện', 'strom'],
    },
  ],
  paramsSchema: motorDolParamsSchema,
  defaultParams: {
    startDelayMs: 500,
    stopDelayMs: 800,
    accelTimeMs: 1500,
    coastTimeMs: 3000,
    tripDelayMs: 0,
    overloadResetMs: 1000,
    resetRequiresCmdOff: true,
    overloadNC: true,
    ratedCurrentA: 0,
    noLoadCurrentFrac: 0.35,
    loadFraction: 0.8,
    inrushMult: 6,
    inrushMs: 1000,
    defaultRemote: true,
    defaultReady: true,
  },
  observables: [
    { key: 'state', description: 'Trạng thái máy (STOPPED/STARTING/RUNNING/STOPPING/TRIPPED)' },
    { key: 'speedPct', description: 'Tốc độ % (0..100)' },
    { key: 'currentA', description: 'Dòng điện (A)' },
    { key: 'running', description: 'Đang chạy (speedPct > 5)' },
    { key: 'energized', description: 'Contactor đang hút (STARTING/RUNNING)' },
  ],
  faults: [
    { id: 'overload', description: 'Quá tải — trip sau tripDelayMs kể từ khi lỗi bật.' },
    { id: 'failToStart', description: 'Không khởi động được — lệnh bị bỏ qua, không dòng.' },
    { id: 'contactorStuck', description: 'Contactor dính — giữ RUNNING dù hết lệnh.' },
    { id: 'notReady', description: 'Không sẵn sàng — không cho chạy.' },
    { id: 'localMode', description: 'Chế độ local — PLC không điều khiển được.' },
  ],
  presets: {
    noRunFeedback: {
      description: 'Mất phản hồi chạy',
      signalFault: { role: 'runFb', type: 'stuck', params: { value: false } },
    },
    feedbackStuckOn: {
      description: 'Phản hồi kẹt ở mức chạy',
      signalFault: { role: 'runFb', type: 'stuck', params: { value: true } },
    },
    overloadTrip: {
      description: 'Quá tải',
      equipmentFault: { fault: 'overload' },
    },
    commandLost: {
      description: 'Mất lệnh chạy',
      signalFault: { role: 'runCmd', type: 'lost' },
    },
  },
  docs: {
    states: [
      { state: 'STOPPED', description: 'Dừng — contactor nhả, runFb = false.' },
      { state: 'STARTING', description: 'Đang khởi động — contactor đã hút, chờ đủ startDelayMs.' },
      { state: 'RUNNING', description: 'Đang chạy — runFb = true.' },
      { state: 'STOPPING', description: 'Đang dừng — chờ đủ stopDelayMs, runFb vẫn true.' },
      { state: 'TRIPPED', description: 'Đã trip do quá tải — runFb = false, overloadOk báo lỗi.' },
    ],
    transitions: [
      '1. overload active và state ∈ {STARTING, RUNNING}: sau tripDelayMs kể từ lúc lỗi bật → TRIPPED.',
      '2. STOPPED: runCmd && canRun && !failToStart → STARTING (t0 = T).',
      '3. STARTING: !runCmd → STOPPED; T − t0 ≥ startDelayMs → RUNNING.',
      '4. RUNNING: !runCmd && !contactorStuck → STOPPING (t1 = T).',
      '5. STOPPING: T − t1 ≥ stopDelayMs → STOPPED; runCmd trong lúc STOPPING bị bỏ qua.',
      '6. TRIPPED: !overload active && T − clearedAt ≥ overloadResetMs && (!resetRequiresCmdOff || !runCmd) → STOPPED.',
    ],
    notes: [
      'canRun chỉ tính từ fault (localMode/notReady); ready/remote là đầu ra emit, không đọc tag (OQ-259).',
      'defaultRemote/defaultReady được chấp nhận trong params nhưng không ảnh hưởng hành vi ở P2.2 — chờ dữ liệu motor thật xác minh (S1).',
      'Một chuyển đổi duy nhất mỗi bước (OQ-255); speed/current tính theo state sau chuyển đổi (OQ-256).',
    ],
  },
  init: () => ({ state: 'STOPPED', t0: 0, t1: 0, speedPct: 0, tripClearedAt: undefined }),
  step: (ctx, slots) => {
    const p = ctx.params;
    const s = ctx.state;
    const T = ctx.simTimeMs;
    // Slot local (A21): destructure một lần ở đầu step, dùng số sau đó.
    const runCmdSlot = slots.role.runCmd;
    const runFbSlot = slots.role.runFb;
    const overloadOkSlot = slots.role.overloadOk;
    const readySlot = slots.role.ready;
    const remoteSlot = slots.role.remote;
    const currentFbSlot = slots.role.currentFb;
    const stateSlot = slots.obs.state;
    const speedPctSlot = slots.obs.speedPct;
    const currentASlot = slots.obs.currentA;
    const runningSlot = slots.obs.running;
    const energizedSlot = slots.obs.energized;
    const overloadSlot = slots.fault.overload;
    const failToStartSlot = slots.fault.failToStart;
    const contactorStuckSlot = slots.fault.contactorStuck;
    const notReadySlot = slots.fault.notReady;
    const localModeSlot = slots.fault.localMode;
    const runCmd = ctx.cmd(runCmdSlot) === true;
    const overload = ctx.fault(overloadSlot);
    const failToStart = ctx.fault(failToStartSlot);
    const stuck = ctx.fault(contactorStuckSlot);
    const notReady = ctx.fault(notReadySlot);
    const localMode = ctx.fault(localModeSlot);
    const remoteOk = !localMode.active;
    const readyOk = !notReady.active;
    const clearedAt = overload.clearedAtMs;
    s.tripClearedAt = clearedAt;
    // 6 luật theo thứ tự 1–6, một chuyển đổi duy nhất mỗi bước (OQ-255).
    if (
      overload.active &&
      (s.state === 'STARTING' || s.state === 'RUNNING') &&
      T - overload.sinceMs >= p.tripDelayMs
    ) {
      s.state = 'TRIPPED';
    } else if (s.state === 'STOPPED') {
      if (runCmd && remoteOk && readyOk && !failToStart.active) {
        s.state = 'STARTING';
        s.t0 = T;
      }
    } else if (s.state === 'STARTING') {
      if (!runCmd) {
        s.state = 'STOPPED';
      } else if (T - s.t0 >= p.startDelayMs) {
        s.state = 'RUNNING';
      }
    } else if (s.state === 'RUNNING') {
      if (!runCmd && !stuck.active) {
        s.state = 'STOPPING';
        s.t1 = T;
      }
    } else if (s.state === 'STOPPING') {
      if (T - s.t1 >= p.stopDelayMs) {
        s.state = 'STOPPED';
      }
    } else {
      // Tới đây state chỉ còn TRIPPED (đã loại 4 state trên).
      if (
        !overload.active &&
        clearedAt !== undefined &&
        T - clearedAt >= p.overloadResetMs &&
        (!p.resetRequiresCmdOff || !runCmd)
      ) {
        s.state = 'STOPPED';
      }
    }
    // speed/current theo state SAU chuyển đổi (OQ-256).
    const target = s.state === 'STARTING' || s.state === 'RUNNING' ? 100 : 0;
    s.speedPct = rateLimitStep(s.speedPct, target, ctx.dtMs, 100 / p.accelTimeMs, 100 / p.coastTimeMs);
    let currentA = 0;
    if ((s.state === 'STARTING' || s.state === 'RUNNING') && p.ratedCurrentA > 0) {
      const base =
        p.ratedCurrentA * (p.noLoadCurrentFrac + (1 - p.noLoadCurrentFrac) * p.loadFraction * (s.speedPct / 100));
      const inrush =
        T - s.t0 < p.inrushMs
          ? p.ratedCurrentA * (p.inrushMult - 1) * (1 - (T - s.t0) / p.inrushMs)
          : 0;
      currentA = base + inrush;
    }
    ctx.setObs(stateSlot, s.state);
    ctx.setObs(speedPctSlot, s.speedPct);
    ctx.setObs(currentASlot, currentA);
    ctx.setObs(runningSlot, s.speedPct > 5);
    ctx.setObs(energizedSlot, s.state === 'STARTING' || s.state === 'RUNNING');
    ctx.emit(runFbSlot, s.state === 'RUNNING' || s.state === 'STOPPING');
    ctx.emit(overloadOkSlot, p.overloadNC ? s.state !== 'TRIPPED' : s.state === 'TRIPPED');
    ctx.emit(readySlot, readyOk && s.state !== 'TRIPPED');
    ctx.emit(remoteSlot, remoteOk);
    ctx.emit(currentFbSlot, currentA);
  },
};
