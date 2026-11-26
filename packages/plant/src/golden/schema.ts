// Schema file golden plant (M2 §11.1, P2.2 — OQ-253/254/257/264).
// 1 file/model: `packages/plant/golden/<model>.golden.yaml`, chứa `cases: [...]`.
// Quy ước bước (OQ-254): `cmd`/`fault`/`clear` áp SAU `engine.step(t)`;
// `expect` kiểm sau step(t), trước khi áp cmd/fault của entry đó.

import { z } from 'zod';

import { signalFaultTypeSchema, sourceSpecSchema } from '@vcs/schemas';

/** Giá trị expect: Bool/string chính xác; số |a−b| ≤ 0.01 mặc định (OQ-257). */
export const goldenExpectValueSchema = z.union([
  z.boolean(),
  z.number(),
  z.string(),
  z.object({ approx: z.number(), eps: z.number().positive().optional() }),
]);

export type GoldenExpectValue = z.infer<typeof goldenExpectValueSchema>;

/** Lỗi trong 1 step golden (OQ-264): equipment | preset | signal | clear.
 * Fault equipment có thể kèm `params` (vd `speedDeviation{pct}` — P2.3). */
export const goldenFaultSchema = z.union([
  z.object({ id: z.string().min(1), params: z.record(z.string(), z.unknown()).optional() }),
  z.object({ preset: z.string().min(1) }),
  z.object({
    signal: z.object({
      role: z.string().min(1),
      type: signalFaultTypeSchema,
      params: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  z.object({ clear: z.string().min(1) }),
]);

export type GoldenFault = z.infer<typeof goldenFaultSchema>;

export const goldenStepSchema = z.object({
  t: z.number().int().min(0),
  cmd: z.record(z.string(), z.union([z.boolean(), z.number()])).optional(),
  fault: goldenFaultSchema.optional(),
  /** Chỉ dùng với inject ({id} / {signal}) — tự clear sau chừng ấy ms. */
  durationMs: z.number().int().positive().optional(),
  /** Đổi source của thiết bị sau step(t) (switch_di bảng E; manual → setManual). */
  source: sourceSpecSchema.optional(),
  expect: z.record(z.string(), goldenExpectValueSchema).optional(),
});

export type PlantGoldenStep = z.infer<typeof goldenStepSchema>;

export const goldenCaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  /** Ghi đè defaultParams của model (tùy chọn). */
  params: z.record(z.string(), z.unknown()).optional(),
  /** Source của thiết bị cho case này (tùy chọn; model có hasSource). */
  source: sourceSpecSchema.optional(),
  /** Named sources của thiết bị cho case này (OQ-290; vd silo inflow/outflow). */
  sources: z.record(z.string(), sourceSpecSchema).optional(),
  steps: z.array(goldenStepSchema).min(1),
});

export type PlantGoldenCase = z.infer<typeof goldenCaseSchema>;

export const goldenFileSchema = z.object({
  model: z.string().min(1),
  stepMs: z.number().int().positive(),
  seed: z.number().int(),
  cases: z.array(goldenCaseSchema).min(1),
});

export type PlantGoldenFile = z.infer<typeof goldenFileSchema>;
