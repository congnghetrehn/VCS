// Profile import I/O list — @vcs/schemas (M2 §4.3).
// Mô tả cách đọc một file CSV/XLSX thành tag: cột nào chứa tên/địa chỉ,
// chuỗi nào được strip khỏi tên, và quy tắc đặt tên sinh ra.

import { z } from 'zod';

import { namingConfigSchema } from './naming.js';

export const importProfileSchema = z
  .object({
    name: z.string().min(1),
    format: z.enum(['csv', 'xlsx']),
    columns: z
      .object({
        tagName: z.string().min(1),
        address: z.string().min(1),
        type: z.string().min(1).optional(),
        comment: z.string().min(1).optional(),
        unit: z.string().min(1).optional(),
      }),
    strip: z.array(z.string()).default([]),
    naming: namingConfigSchema,
  });

export type ImportProfile = z.infer<typeof importProfileSchema>;
