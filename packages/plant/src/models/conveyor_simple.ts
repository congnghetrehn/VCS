// Model conveyor_simple (M2 §7.8, P2.3 — bảng G, STATE §26).
// Băng tải đơn giản = motor_dol + vật liệu trễ vận chuyển.
// Derive từ motor_dol bằng deriveModel + step wrapper (OQ-292):
// proxy ctx ép cmd('runCmd') = false khi pullCordTrip hardwired
// (1 object/bước/conveyor — ngoại lệ không-cấp-phát duy nhất, bench đo).

import { z } from 'zod';

import { deriveModel, type EquipmentModel, type ModelSlots, type StepCtx } from '../registry.js';
import {
  motorDolModel,
  motorDolParamsSchema,
  type MotorDolParams,
  type MotorDolState,
} from './motor_dol.js';

/** Tham số thêm của conveyor_simple (M2 §7.8 — 4 param trên 15 của motor_dol). */
export const conveyorSimpleParamsSchema = motorDolParamsSchema.extend({
  zeroSpeedThresholdPct: z
    .number()
    .min(0)
    .max(100)
    .describe('Ngưỡng beltSpeed (%) dưới đó zeroSpeed = true.'),
  transportDelayMs: z.number().int().min(0).describe('Trễ vận chuyển vật liệu (ms).'),
  loadTph: z
    .number()
    .min(0)
    .describe('Lưu lượng tải mặc định (t/h) khi không cấu hình named source load.'),
  pullCordHardwired: z
    .boolean()
    .describe('Pull-cord đấu cứng: trip thì contactor rơi như notReady.'),
});

export type ConveyorSimpleParams = z.infer<typeof conveyorSimpleParamsSchema>;

/**
 * Trạng thái conveyor (JSON-serializable): state motor_dol + ring buffer
 * delay line inline {buf, idx} (OQ-292 — KHÔNG dùng class DelayLine vì
 * instance class không JSON-serializable cho snapshot/restore).
 */
export interface ConveyorSimpleState extends MotorDolState {
  buf: number[];
  idx: number;
}

function asNumber(v: number | boolean): number {
  return typeof v === 'number' ? v : 0;
}

export const conveyorSimpleModel: EquipmentModel<ConveyorSimpleParams, ConveyorSimpleState> =
  deriveModel<ConveyorSimpleParams, ConveyorSimpleState>(
    // Cast: params của conveyor mở rộng params motor (15 → 19 trường) và
    // state mở rộng thêm buf/idx; deriveModel yêu cầu base cùng P/S nên ép
    // kiểu tại đây (xem OQ-292). An toàn: patch thay cả init lẫn step nên
    // init/step của base không bao giờ chạy trên model dẫn xuất.
    motorDolModel as unknown as EquipmentModel<ConveyorSimpleParams, ConveyorSimpleState>,
    {
      type: 'conveyor_simple',
      description: 'Băng tải đơn giản — motor_dol + vật liệu trễ vận chuyển (M2 §7.8).',
      paramsSchema: conveyorSimpleParamsSchema,
      roles: [
        ...motorDolModel.roles,
        {
          role: 'zeroSpeed',
          kind: 'DI',
          dataType: 'Bool',
          optional: true,
          description: 'Băng đứng yên (beltSpeed < ngưỡng)',
          synonyms: ['ZERO_SPEED', 'ZERO_SPD', 'ZS', 'NO_SPEED', 'BELT_STOP'],
          descKeywords: ['zero', 'speed', 'belt'],
        },
        {
          role: 'pullCord',
          kind: 'DI',
          dataType: 'Bool',
          optional: true,
          description: 'Dây kéo khẩn cấp (NC: true = bình thường)',
          synonyms: ['PULL_CORD', 'PULLCORD', 'CORD_SWITCH', 'EMERGENCY_PULL'],
          descKeywords: ['pull', 'cord'],
        },
      ],
      defaultParams: {
        zeroSpeedThresholdPct: 5,
        transportDelayMs: 20000,
        loadTph: 0,
        pullCordHardwired: true,
      },
      observables: [
        ...motorDolModel.observables,
        { key: 'beltSpeedPct', description: 'Tốc độ băng % (0 khi beltSlip)' },
        { key: 'deliveredTph', description: 'Lưu lượng ra khỏi băng (t/h, sau trễ vận chuyển)' },
      ],
      faults: [
        ...motorDolModel.faults,
        { id: 'beltSlip', description: 'Trượt băng — beltSpeed = 0, zeroSpeed = true.' },
        {
          id: 'pullCordTrip',
          description:
            'Giật dây kéo khẩn cấp — pullCord = false; nếu pullCordHardwired thì contactor rơi như notReady.',
        },
        {
          id: 'beltBlocked',
          description: 'Băng kẹt — deliveredTph = 0, delay line đóng băng (OQ-293).',
        },
      ],
      // hasSource=true: model đọc named source 'load' (OQ-294);
      // source chính không dùng (mặc định const 0).
      hasSource: true,
      docs: {
        // states kế thừa nguyên văn motor_dol (exactOptionalPropertyTypes:
        // không gán undefined tường minh cho field optional).
        ...(motorDolModel.docs?.states !== undefined ? { states: motorDolModel.docs.states } : {}),
        transitions: [
          ...(motorDolModel.docs?.transitions ?? []),
          'pullCordTrip active && pullCordHardwired: cmd runCmd bị ép false (như notReady) — motor STOPPING → STOPPED (OQ-292).',
          'beltSpeed = fault(beltSlip) ? 0 : speedPct (sau step motor); zeroSpeed = beltSpeed < zeroSpeedThresholdPct (so sánh nghiêm ngặt <).',
          'load = named source load nếu đã cấu hình, ngược lại params.loadTph (OQ-294); input = load × beltSpeed/100; deliveredTph = delay(input, transportDelayMs) qua ring buffer inline {buf, idx}, n = round(transportDelayMs/dtMs) bước, khởi tạo 0.',
          'beltBlocked active: deliveredTph = 0 và delay line đóng băng (không dịch, không nhận input mới); hết fault thì chạy tiếp từ trạng thái đã đóng băng (OQ-293).',
          'transportDelayMs = 0 → không trễ: deliveredTph = input ngay trong bước.',
        ],
        notes: [
          'Derive từ motor_dol bằng deriveModel — kế thừa 6 role, 15 param, 5 state, 6 luật, 5 fault, 4 preset (OQ-292).',
          'Step wrapper cấp phát 1 proxy ctx mỗi bước/conveyor — ngoại lệ không-cấp-phát duy nhất, bench đo (OQ-292).',
          'Ring buffer inline trong state (buf/idx) — DelayLine là class nên không ở được trong state model (không JSON-serializable).',
          'Synonym zeroSpeed/pullCord theo quy ước hậu tố mirror §7.1 (OQ-301: spec §7.2–7.8 không có bảng synonym).',
        ],
      },
      init: (params, rng) => ({
        ...motorDolModel.init(params, rng),
        buf: [],
        idx: 0,
      }),
      step: (ctx: StepCtx<ConveyorSimpleParams, ConveyorSimpleState>, slots: ModelSlots): void => {
        const p = ctx.params;
        const s = ctx.state;
        const runCmdSlot = slots.role.runCmd;
        const zeroSpeedSlot = slots.role.zeroSpeed;
        const pullCordSlot = slots.role.pullCord;
        const beltSpeedPctSlot = slots.obs.beltSpeedPct;
        const deliveredTphSlot = slots.obs.deliveredTph;
        const beltSlipSlot = slots.fault.beltSlip;
        const pullCordTripSlot = slots.fault.pullCordTrip;
        const beltBlockedSlot = slots.fault.beltBlocked;
        const pullCordTrip = ctx.fault(pullCordTripSlot);
        const inhibited = pullCordTrip.active && p.pullCordHardwired;
        // Proxy ctx: chỉ ép cmd(runCmd slot) khi inhibited; mọi thứ khác
        // (params/state/fault/emit/setObs/...) là cùng object của engine.
        // Slots của conveyor liệt kê role/obs/fault của motor_dol trước
        // (derive spread base) nên cùng chỉ số — motorDolModel.step đọc
        // đúng slot của nó khi nhận cùng object slots.
        const proxyCtx: StepCtx<MotorDolParams, MotorDolState> = {
          ...ctx,
          cmd: (slot) => (slot === runCmdSlot && inhibited ? false : ctx.cmd(slot)),
        };
        motorDolModel.step(proxyCtx, slots);
        const beltSpeed = ctx.fault(beltSlipSlot).active ? 0 : s.speedPct;
        const zeroSpeed = beltSpeed < p.zeroSpeedThresholdPct;
        const loadSlot = slots.source.load;
        const load =
          loadSlot !== undefined ? asNumber(ctx.source(loadSlot)) : p.loadTph;
        const input = (load * beltSpeed) / 100;
        let deliveredTph: number;
        const n = Math.max(0, Math.round(p.transportDelayMs / ctx.dtMs));
        if (ctx.fault(beltBlockedSlot).active) {
          // OQ-293: đóng băng — không dịch, không nhận input mới.
          deliveredTph = 0;
        } else if (n === 0) {
          deliveredTph = input;
        } else {
          if (s.buf.length !== n) s.buf = new Array<number>(n).fill(0);
          deliveredTph = s.buf[s.idx] ?? 0;
          s.buf[s.idx] = input;
          s.idx = (s.idx + 1) % n;
        }
        ctx.setObs(beltSpeedPctSlot, beltSpeed);
        ctx.setObs(deliveredTphSlot, deliveredTph);
        ctx.emit(zeroSpeedSlot, zeroSpeed);
        ctx.emit(pullCordSlot, !pullCordTrip.active);
      },
    },
  );
