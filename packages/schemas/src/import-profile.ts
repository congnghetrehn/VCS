// Profile import I/O list — @vcs/schemas (M2 §4.4, P2.5 commit 4).
// Mô tả cách đọc một file CSV/XLSX thành tag: mapping canonical field →
// cột, transforms, quy tắc, vị trí header/dữ liệu, fill-down, encoding/
// delimiter, defaults, addressDerive.
// OQ-332: hình cũ (P2.1, `columns`/`strip`) được THAY bằng hình §4.4 —
// `columns`/`strip` chỉ dùng trong test schemas, không consumer khác;
// §4.4 là nguồn sự thật, không phải sửa test để xanh.

import { z } from 'zod';

import { IO_CODES } from './diagnostics-catalog.js';
import { namingConfigSchema } from './naming.js';

/** Mã chẩn đoán IO-* (§8.7) — dùng cho `rules.overrides` (OQ-348). */
export const ioCodeSchema = z.enum(IO_CODES);

/** Canonical field trong mapping §4.4 + §8.3 (rack/slot/channel/module
 *  phục vụ addressDerive §8.5). */
export const canonicalFieldSchema = z.enum([
  'tag',
  'description',
  'signalType',
  'address',
  'controller',
  'engMin',
  'engMax',
  'unit',
  'equipment',
  'polarity',
  'rack',
  'slot',
  'channel',
  'module',
]);
export type CanonicalField = z.infer<typeof canonicalFieldSchema>;

/** Một bước transform §8.4. `concat`: nối các field trong `from` bằng
 *  `separator` (mặc định '') — §8.4 chỉ liệt kê tên op, tham số là mặc
 *  định tier B của P2.5 (ghi ở STATE commit 4). */
export const transformStepSchema = z.discriminatedUnion('op', [
  z.object({ field: z.string().min(1), op: z.literal('replace'), pattern: z.string(), with: z.string() }),
  z.object({ field: z.string().min(1), op: z.literal('upper') }),
  z.object({ field: z.string().min(1), op: z.literal('lower') }),
  z.object({ field: z.string().min(1), op: z.literal('trim') }),
  z.object({ field: z.string().min(1), op: z.literal('prefix'), with: z.string() }),
  z.object({ field: z.string().min(1), op: z.literal('suffix'), with: z.string() }),
  z.object({ field: z.string().min(1), op: z.literal('map'), table: z.record(z.string(), z.string()) }),
  z.object({
    field: z.string().min(1),
    op: z.literal('split'),
    pattern: z.string(),
    into: z.array(z.string().min(1)).min(2),
  }),
  z.object({
    field: z.string().min(1),
    op: z.literal('concat'),
    from: z.array(z.string().min(1)).min(1),
    separator: z.string().default(''),
  }),
  z.object({
    field: z.string().min(1),
    op: z.literal('default'),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
]);
export type TransformStep = z.infer<typeof transformStepSchema>;

/** Mức độ cho từng quy tắc kiểm tra (§8.7, dùng ở P2.6). */
export const ruleSeveritySchema = z.enum(['error', 'warn', 'ignore']);
export type RuleSeverity = z.infer<typeof ruleSeveritySchema>;

export const importProfileSchema = z.object({
  name: z.string().min(1),
  /** Định dạng file; không bắt buộc (suy ra từ đuôi file khi đọc). */
  format: z.enum(['csv', 'xlsx']).optional(),
  file: z.string().min(1).optional(),
  sheet: z.string().min(1).optional(),
  headerRow: z.number().int().positive().optional(),
  firstDataRow: z.number().int().positive().optional(),
  /** null = tới hết file. */
  lastDataRow: z.number().int().positive().nullable().optional(),
  skipRowsWhen: z
    .array(z.object({ column: z.string().min(1), empty: z.boolean() }))
    .default([]),
  /** Tên cột (chuẩn hóa, vd 'station') bị merge dọc cần điền xuống. */
  fillDownColumns: z.array(z.string().min(1)).default([]),
  encoding: z.enum(['auto', 'utf-8', 'utf-16le', 'utf-16be', 'windows-1252']).default('auto'),
  delimiter: z.enum(['auto', ',', ';', '\t', '|']).default('auto'),
  /** Canonical field → tên cột hoặc chỉ số A,B... (key lạ → lỗi).
   *  partialRecord: mọi field đều tùy chọn (zod v4 record với enum key
   *  bắt buộc ĐỦ key — không dùng được ở đây). */
  mapping: z.partialRecord(canonicalFieldSchema, z.string().min(1)).default({}),
  transforms: z.array(transformStepSchema).default([]),
  rules: z
    .object({
      duplicateTag: ruleSeveritySchema.optional(),
      duplicateAddress: ruleSeveritySchema.optional(),
      missingType: ruleSeveritySchema.optional(),
      missingRange: ruleSeveritySchema.optional(),
      /** Ghi đè mức độ theo từng mã (OQ-348): ưu tiên cao nhất,
       *  'ignore' = không emit diagnostic đó. */
      overrides: z.partialRecord(ioCodeSchema, ruleSeveritySchema).optional(),
    })
    .default({}),
  defaults: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  addressDerive: z
    .object({
      moduleStartColumn: z.string().min(1),
      channelColumn: z.string().min(1),
      moduleTypeColumn: z.string().min(1).optional(),
      channelBase: z.number().int().min(0).default(0),
    })
    .optional(),
  /** Bộ header lúc lưu profile — để khớp profile theo OQ-333 (tên sheet +
   *  bộ header bằng nhau không kể thứ tự). */
  headers: z.array(z.string()).optional(),
  /** Quy tắc đặt tên tag (§4.3); không bắt buộc — profile §4.4 mẫu
   *  không có naming vẫn parse được. */
  naming: namingConfigSchema.optional(),
});

export type ImportProfile = z.infer<typeof importProfileSchema>;
