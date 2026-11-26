// Serialize paramsSchema (zod) của model plant thành mô tả field cho form
// Designer (P2.8, OQ-386) — `GET /api/plant/models`. Web không import
// `@vcs/plant` (đồ thị phụ thuộc cấm) nên server serialize trước.
// Dùng API công khai `z.toJSONSchema` (zod v4): type/minimum/maximum/enum/
// description/required. Không đào `_zod` internals.
// - `maximum`/`minimum` = ±MAX_SAFE_INTEGER là artifact của `.int()` (zod
//   v4 phát maximum 2^53−1 cho safeint) — bỏ, form không hiện giới hạn ảo.
// - `default` lấy từ `defaultParams` của model (không có trong JSON Schema
//   vì schema không mang default); field không có default = bắt buộc điền
//   tay khi tạo instance mới (vd engMin/engMax/unit của analog_sensor).

import { z } from 'zod';
import type { ZodType } from 'zod';

/** Một field tham số cho form Designer. */
export interface ParamField {
  name: string;
  type: 'integer' | 'number' | 'boolean' | 'string';
  enum?: string[];
  minimum?: number;
  maximum?: number;
  description?: string;
  /** true khi field nằm trong `required` của schema (không `.optional()`). */
  required: boolean;
  /** Giá trị mặc định từ `defaultParams` (vắng mặt = không có mặc định). */
  default?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  if (v.every((x) => typeof x === 'string')) return [...v];
  return undefined;
}

/**
 * Serialize một paramsSchema (ZodObject) thành danh sách field. Schema
 * không phải object / không có properties → [] (không bịa field).
 */
export function describeParams(
  paramsSchema: ZodType,
  defaults: Record<string, unknown>,
): ParamField[] {
  const js = z.toJSONSchema(paramsSchema) as unknown;
  if (!isRecord(js)) return [];
  const properties = js['properties'];
  if (!isRecord(properties)) return [];
  const requiredRaw = js['required'];
  const required = new Set(Array.isArray(requiredRaw) ? requiredRaw.filter((x) => typeof x === 'string') : []);
  const out: ParamField[] = [];
  for (const [name, raw] of Object.entries(properties)) {
    if (!isRecord(raw)) continue;
    const typeRaw = raw['type'];
    if (
      typeRaw !== 'integer' &&
      typeRaw !== 'number' &&
      typeRaw !== 'boolean' &&
      typeRaw !== 'string'
    ) {
      continue;
    }
    const field: ParamField = { name, type: typeRaw, required: required.has(name) };
    const enumValues = asStringArray(raw['enum']);
    if (enumValues !== undefined) field.enum = enumValues;
    const minimum = raw['minimum'];
    if (typeof minimum === 'number' && minimum !== -Number.MAX_SAFE_INTEGER) {
      field.minimum = minimum;
    }
    const maximum = raw['maximum'];
    if (typeof maximum === 'number' && maximum !== Number.MAX_SAFE_INTEGER) {
      field.maximum = maximum;
    }
    const description = raw['description'];
    if (typeof description === 'string' && description !== '') field.description = description;
    if (name in defaults) field.default = defaults[name];
    out.push(field);
  }
  return out;
}
