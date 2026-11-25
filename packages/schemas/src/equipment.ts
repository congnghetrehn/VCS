// Schema thiết bị + source của plant — @vcs/schemas (M2 §4.3).
// SourceSpec: nguồn dữ liệu cho một thiết bị có hasSource (sensor/analog).
// `kind: 'link'` đọc observable của thiết bị khác (định nghĩa ở §6.3).

import { z } from 'zod';

export const sourceSpecSchema = z
  .object({
    kind: z.enum(['manual', 'const', 'ramp', 'sine', 'link']),
    value: z.union([z.number(), z.boolean()]).optional(),
    periodMs: z.number().int().positive().optional(),
    amplitude: z.number().optional(),
    offset: z.number().optional(),
    /** Hệ số nhân cho `kind: 'link'` (eng = obs × scale + offset). */
    scale: z.number().optional(),
    from: z.number().optional(),
    to: z.number().optional(),
    durationMs: z.number().int().positive().optional(),
    /** Thiết bị đích cho `kind: 'link'` (địa chỉ thiết bị, không phải tag). */
    equipment: z.string().min(1).optional(),
    /** Observable đích cho `kind: 'link'` (ví dụ `currentA`). */
    observable: z.string().min(1).optional(),
  })
  .superRefine((s, ctx) => {
    const need = (cond: boolean, field: string, msg: string) => {
      if (!cond) ctx.addIssue({ code: 'custom', path: [field], message: msg });
    };
    if (s.kind === 'ramp') {
      need(s.from !== undefined, 'from', 'SourceSpec ramp cần trường from.');
      need(s.to !== undefined, 'to', 'SourceSpec ramp cần trường to.');
      need(s.durationMs !== undefined, 'durationMs', 'SourceSpec ramp cần trường durationMs.');
    }
    if (s.kind === 'sine') {
      need(s.periodMs !== undefined, 'periodMs', 'SourceSpec sine cần trường periodMs.');
      need(s.amplitude !== undefined, 'amplitude', 'SourceSpec sine cần trường amplitude.');
    }
    if (s.kind === 'link') {
      need(s.equipment !== undefined, 'equipment', 'SourceSpec link cần trường equipment.');
      need(s.observable !== undefined, 'observable', 'SourceSpec link cần trường observable.');
    }
  });

export type SourceSpec = z.infer<typeof sourceSpecSchema>;

/**
 * Một thiết bị trong cấu hình plant (M2 §4.3).
 * `signals` gán role → tag (tag phải tồn tại trong PlantConfig.tags).
 * Role không có trong `signals` là chưa gán (input tự do / output tùy chọn).
 */
export const equipmentInstanceSchema = z
  .object({
    id: z.string().min(1),
    model: z.string().min(1),
    params: z.record(z.string(), z.unknown()).optional(),
    signals: z.record(z.string(), z.string()).optional(),
    source: sourceSpecSchema.optional(),
  });

export type EquipmentInstance = z.infer<typeof equipmentInstanceSchema>;
