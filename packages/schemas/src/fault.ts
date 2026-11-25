// Schema lỗi (fault) của plant — @vcs/schemas (M2 §6).
// Hai họ lỗi: lỗi thiết bị (fault id do model khai báo) và lỗi tín hiệu
// (14 loại, áp dụng lên giá trị emit/cmd theo thứ tự §6.2).

import { z } from 'zod';

export const signalFaultTypeSchema = z.enum([
  'offset',
  'gain',
  'drift',
  'noise',
  'spike',
  'stuck',
  'freeze',
  'invert',
  'delay',
  'wireBreak',
  'outOfRange',
  'chatter',
  'lost',
  'stuckCmd',
]);

export type SignalFaultType = z.infer<typeof signalFaultTypeSchema>;

const faultTargetSchema = z.union([
  z.object({ equipment: z.string().min(1), fault: z.string().min(1) }),
  z.object({
    equipment: z.string().min(1),
    signal: z.string().min(1),
    type: signalFaultTypeSchema,
  }),
]);

export type FaultTarget = z.infer<typeof faultTargetSchema>;

export const faultTimingSchema = z.union([
  z.object({ at: z.literal('now') }),
  z.object({ at: z.literal('time'), timeMs: z.number().int().min(0) }),
  z.object({ at: z.literal('after'), afterMs: z.number().int().min(0) }),
]);

export type FaultTiming = z.infer<typeof faultTimingSchema>;

/**
 * Yêu cầu chèn lỗi (P2.1: không có `repeat`/`random` — P1, hoãn theo plan).
 * `durationMs` = tự clear sau chừng ấy ms kể từ khi kích hoạt.
 */
export const faultRequestSchema = z
  .object({
    target: faultTargetSchema,
    when: faultTimingSchema.default({ at: 'now' }),
    durationMs: z.number().int().positive().optional(),
    params: z.record(z.string(), z.unknown()).optional(),
  });

export type FaultRequest = z.infer<typeof faultRequestSchema>;

export const faultInfoSchema = z
  .object({
    id: z.string().min(1),
    target: faultTargetSchema,
    state: z.enum(['pending', 'active', 'cleared']),
    sinceMs: z.number().int().min(0),
    clearedAtMs: z.number().int().min(0).optional(),
    params: z.record(z.string(), z.unknown()),
  });

export type FaultInfo = z.infer<typeof faultInfoSchema>;
