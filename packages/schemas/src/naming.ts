// Quy tắc đặt tên tag khi import I/O list — @vcs/schemas (M2 §4.3).
// Template dùng `{n}` làm placeholder cho số thứ tự (`{n:02}` = 2 chữ số,
// `{n:3}` = 3 chữ số). Số bắt đầu từ `start`, tăng theo `step`.

import { z } from 'zod';

export const namingConfigSchema = z
  .object({
    template: z.string().min(1),
    start: z.number().int().min(0).default(1),
    step: z.number().int().min(1).default(1),
    minDigits: z.number().int().min(1).max(6).default(2),
  });

export type NamingConfig = z.infer<typeof namingConfigSchema>;
