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

// Quy ước đặt tên cho auto-suggest (M2 §4.3, P2.7 commit 1, OQ-375).
// Schema này KHÁC `namingConfigSchema` ở trên: đây là quy ước đặt tên
// thiết bị cho suggest — tagPattern / equipmentIdTemplate /
// equipmentCodeToModel / roleOverrides, đọc từ `plant/naming.yaml`.

/** Mẫu tag mặc định (§4.3): area 2 chữ + 2 số, eqcode 1–4 chữ + 2–3 số,
 *  role là hậu tố. Nhóm đặt tên `area`/`eqcode`/`role` là bắt buộc để
 *  suggest tách được thiết bị (OQ-375). */
export const DEFAULT_TAG_PATTERN =
  '^(?<area>[A-Z]{2}\\d{2})[_-](?<eqcode>[A-Z]{1,4}\\d{2,3})[_-](?<role>[A-Z0-9_]+)$';

/** Ánh xạ tiền tố chữ của eqcode → model (§4.3, khớp dài nhất trước). */
export const DEFAULT_EQUIPMENT_CODE_TO_MODEL: Record<string, string> = {
  MV: 'motor_vfd',
  M: 'motor_dol',
  XV: 'valve_onoff',
  FCV: 'valve_ctrl',
  CV: 'valve_ctrl',
  DMP: 'damper',
  PT: 'analog_sensor',
  TT: 'analog_sensor',
  LT: 'analog_sensor',
  FT: 'analog_sensor',
  WT: 'analog_sensor',
  ST: 'analog_sensor',
  LSH: 'switch_di',
  LSL: 'switch_di',
  ZS: 'switch_di',
  SS: 'switch_di',
  PC: 'switch_di',
  BIN: 'silo_bin',
  SILO: 'silo_bin',
  BC: 'conveyor_simple',
};

function isValidTagPattern(pattern: string): boolean {
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    return false;
  }
  // Phải có đủ 3 nhóm đặt tên để suggest tách area/eqcode/role.
  return (
    re.source.includes('?<area>') &&
    re.source.includes('?<eqcode>') &&
    re.source.includes('?<role>')
  );
}

export const namingConventionSchema = z.object({
  convention: z.string().min(1).default('cement-default'),
  tagPattern: z
    .string()
    .min(1)
    .default(DEFAULT_TAG_PATTERN)
    .refine(isValidTagPattern, {
      message:
        'tagPattern phải là RegExp hợp lệ có đủ 3 nhóm đặt tên (?<area>...), (?<eqcode>...), (?<role>...)',
    }),
  equipmentIdTemplate: z
    .string()
    .min(1)
    .default('{area}_{eqcode}')
    .refine((t) => t.includes('{area}') && t.includes('{eqcode}'), {
      message: 'equipmentIdTemplate phải chứa cả {area} và {eqcode}',
    }),
  equipmentCodeToModel: z
    .record(z.string(), z.string().min(1))
    .default(DEFAULT_EQUIPMENT_CODE_TO_MODEL)
    .refine((m) => Object.keys(m).every((k) => /^[A-Z]{1,4}$/.test(k)), {
      message: 'equipmentCodeToModel: key phải là tiền tố chữ hoa 1–4 ký tự (vd MV, FCV)',
    }),
  /** Bổ sung synonym theo dự án (suffix -> role), mở rộng bộ synonym
   *  của model (chỉ ĐỌC ở P2.7; học ở P2.8 UI — OQ-370/379). */
  roleOverrides: z.record(z.string().min(1), z.string().min(1)).default({ RUN_ST: 'runFb' }),
});

export type NamingConvention = z.infer<typeof namingConventionSchema>;

/** Quy ước mặc định cement-default (đúng ví dụ M2 §4.3) — dùng khi thiếu
 *  `plant/naming.yaml` (OQ-375). Parse từ schema để luôn khớp schema. */
export const DEFAULT_NAMING_CONVENTION: NamingConvention = namingConventionSchema.parse({});
