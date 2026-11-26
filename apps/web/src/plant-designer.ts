// Logic thuần cho Plant Designer (P2.8 commit 8, M2 §10.3) — không DOM,
// không fetch: token học role, parse giá trị param từ form theo ParamField,
// lọc gợi ý, format dòng Event log + giá trị role (raw/eng).

import type {
  ParamField,
  PlantEvent,
  RoleValue,
  Suggestion,
} from './api/import.js';

/** Token cuối của tên tag (phần sau `_` cuối) — token học roleOverrides
 *  (OQ-397): CR01_BC01_SPEED → 'SPEED'; tag không có `_` → chính nó. */
export function lastToken(tag: string): string {
  const idx = tag.lastIndexOf('_');
  return idx < 0 ? tag : tag.slice(idx + 1);
}

export type ParamParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/** Parse chuỗi nhập ở form params theo ParamField (zod-describe): kiểm tra
 *  enum trước, rồi kiểu + minimum/maximum. Trả lỗi tiếng Việt nêu tên field. */
export function parseParamValue(field: ParamField, raw: string): ParamParseResult {
  const value = raw.trim();
  if (field.enum !== undefined) {
    if (!field.enum.includes(value)) {
      return {
        ok: false,
        error: `${field.name}: phải là một trong ${field.enum.join(', ')}`,
      };
    }
    return { ok: true, value };
  }
  switch (field.type) {
    case 'boolean': {
      if (value === 'true') return { ok: true, value: true };
      if (value === 'false') return { ok: true, value: false };
      return { ok: false, error: `${field.name}: phải là true hoặc false` };
    }
    case 'integer': {
      if (!/^-?\d+$/.test(value)) {
        return { ok: false, error: `${field.name}: phải là số nguyên` };
      }
      const n = Number(value);
      if (!Number.isSafeInteger(n)) {
        return { ok: false, error: `${field.name}: ngoài dải số nguyên an toàn` };
      }
      return checkRange(field, n);
    }
    case 'number': {
      if (value === '') return { ok: false, error: `${field.name}: phải là số` };
      const n = Number(value);
      if (!Number.isFinite(n)) {
        return { ok: false, error: `${field.name}: phải là số` };
      }
      return checkRange(field, n);
    }
    case 'string': {
      return { ok: true, value };
    }
  }
}

function checkRange(field: ParamField, n: number): ParamParseResult {
  if (field.minimum !== undefined && n < field.minimum) {
    return { ok: false, error: `${field.name}: phải ≥ ${String(field.minimum)}` };
  }
  if (field.maximum !== undefined && n > field.maximum) {
    return { ok: false, error: `${field.name}: phải ≤ ${String(field.maximum)}` };
  }
  return { ok: true, value: n };
}

/** Giá trị param hiển thị trong ô nhập: scalar → chuỗi; object/mảng →
 *  JSON (form chỉ sửa scalar — xem isScalarParam). */
export function formatParamValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

/** Field form sửa được trực tiếp: scalar (integer/number/boolean/string).
 *  Object lồng (vd posFbRange của valve_ctrl) chỉ hiện read-only. */
export function isScalarParam(field: ParamField): boolean {
  return (['integer', 'number', 'boolean', 'string'] as const).includes(field.type);
}

/** Thiết bị bị chặn trong diagnostics apply (OQ-392): message PL-E001 có
 *  dạng "Params của thiết bị <ID> (model …) không hợp lệ…" — lấy ID để UI
 *  áp dụng các nhóm còn lại. Không parse được → [] (nút apply-rest ẩn). */
export function blockedEquipmentIds(diagnostics: Array<{ message: string }>): string[] {
  const out: string[] = [];
  for (const d of diagnostics) {
    const m = /thiết bị ([A-Za-z0-9_]+)/.exec(d.message);
    if (m !== null && m[1] !== undefined && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** Lọc gợi ý theo status ('' = tất cả); kết quả giữ thứ tự equipmentId. */
export function filterSuggestions(
  suggestions: Suggestion[],
  status: '' | Suggestion['status'],
): Suggestion[] {
  if (status === '') return [...suggestions];
  return suggestions.filter((s) => s.status === status);
}

/** Một dòng Event log (OQ-389): `[tms] type equipment key: msg (from → to)`.
 *  Chỉ gồm field có mặt — không bịa field trống. */
export function formatEventLine(event: PlantEvent): string {
  let line = `[${String(event.t)}ms] ${event.type}`;
  if (event.equipment !== undefined) line += ` ${event.equipment}`;
  if (event.key !== undefined) line += ` ${event.key}`;
  if (event.msg !== undefined) line += `: ${event.msg}`;
  if (event.from !== undefined || event.to !== undefined) {
    line += ` (${formatUnknown(event.from)} → ${formatUnknown(event.to)})`;
  }
  return line;
}

/** Giá trị from/to của event (unknown) → chuỗi hiển thị an toàn. */
function formatUnknown(value: unknown): string {
  if (value === undefined || value === null) return '?';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '?';
  }
}

/** Giá trị role hiển thị ở inspector (OQ-387): raw, kèm eng + unit khi có;
 *  overRange → cờ cảnh báo. */
export function formatRoleValue(rv: RoleValue): { text: string; overRange: boolean } {
  const raw = String(rv.raw);
  if (rv.eng === undefined) return { text: raw, overRange: false };
  const eng = `${String(rv.eng)}${rv.unit !== undefined ? ` ${rv.unit}` : ''}`;
  return { text: `${raw} (${eng})`, overRange: rv.overRange === true };
}
