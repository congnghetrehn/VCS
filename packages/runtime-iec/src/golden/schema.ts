// Schema golden YAML — M1 §12.1 + mở rộng OQ-200 (P1.7).
// Format gốc của spec: id/description/expectedFrom/config/sources/
// organization/steps. Mở rộng: step có force/unforce/snapshot/restore,
// expect có {approx, eps}, tags inline (để compileProject giải tên tag,
// OQ-198), organization chỉ cần ob (+cycleMs/phaseMs) — tên block lấy
// từ program theo số OB.

import { z } from 'zod';
import { tagSchema } from '@vcs/schemas';

/** Giá trị set/expect: Bool | số (Int/DInt/Real/Time-ms) | chuỗi. */
export const goldenValueSchema = z.union([z.boolean(), z.number(), z.string()]);
export type GoldenValue = z.output<typeof goldenValueSchema>;

/** Kỳ vọng: giá trị chính xác, hoặc xấp xỉ cho Real ({approx, eps}). */
export const goldenExpectSchema = z.union([
  goldenValueSchema,
  z.strictObject({
    approx: z.number(),
    eps: z.number().positive().optional(),
  }),
]);
export type GoldenExpect = z.output<typeof goldenExpectSchema>;

export const goldenStepSchema = z.strictObject({
  /** Thời điểm tuyệt đối (ms sim). Mỗi step = 1 lần gọi step() của runner;
   * khoảng giữa 2 step phải chia hết cho scanPeriodMs (OQ-199). */
  t: z.number().int().min(0),
  /** Ghi giá trị vào ref TRƯỚC scan của step (qua plc.write). */
  set: z.record(z.string(), goldenValueSchema).optional(),
  /** Force ref (giữ tới khi unforce). Áp trước scan, cùng lúc với set. */
  force: z.record(z.string(), goldenValueSchema).optional(),
  unforce: z.array(z.string().min(1)).optional(),
  /** Chụp snapshot SAU khi kiểm expect của step này. */
  snapshot: z.boolean().optional(),
  /** Khôi phục snapshot gần nhất TRƯỚC khi áp set/scan của step này. */
  restore: z.boolean().optional(),
  /** Kỳ vọng sau scan (hoặc sau trạng thái đầu nếu là step đầu tiên). */
  expect: z.record(z.string(), goldenExpectSchema).optional(),
  /** Mã RuntimeFault phải xuất hiện TRONG step này (so delta với step
   * trước; vắng mặt = không fault nào được phép — không im lặng). */
  faults: z.array(z.string().min(1)).optional(),
});
export type GoldenStep = z.output<typeof goldenStepSchema>;

export const goldenYamlSchema = z.strictObject({
  id: z.string().min(1),
  description: z.string().optional(),
  /** Nguồn của kỳ vọng (§12.1): mặc định 'spec'; 'plcsim' là chuẩn vàng. */
  expectedFrom: z.enum(['spec', 'siemens-docs', 'plcsim']).optional(),
  config: z
    .strictObject({ scanPeriodMs: z.number().int().positive().optional() })
    .optional(),
  /** Ghi đè organization của program (mặc định lấy của program, OQ-200):
   * chỉ cần số OB (+cycleMs/phaseMs); tên block tra từ program theo ob. */
  organization: z
    .array(
      z.strictObject({
        ob: z.number().int().positive(),
        cycleMs: z.number().int().positive().optional(),
        phaseMs: z.number().int().min(0).optional(),
      }),
    )
    .optional(),
  /** Nguồn SCL/LAD inline (định dạng §12.1): file .scl → SCL,
   * file .lad.json → LAD JSON. Biên dịch bằng compileProject. */
  sources: z
    .array(z.strictObject({ file: z.string().min(1), text: z.string().min(1) }))
    .min(1),
  /** Bảng tag inline (đầy đủ TagDef) — compileProject dùng để giải tên
   * tag trong SCL (OQ-198). Không có → chỉ giải DB/block. */
  tags: z.array(tagSchema).optional(),
  steps: z.array(goldenStepSchema).min(1),
});
export type GoldenCase = z.output<typeof goldenYamlSchema>;
