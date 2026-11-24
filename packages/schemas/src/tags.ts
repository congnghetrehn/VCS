// Schema `tags.yaml` — dạng cuối, khớp M2 §4.1 (M0 §4.5, AMENDMENTS A9, C2).
// Kiểm tra chéo bằng superRefine, mỗi lỗi mang mã PRJ-E004/E010–E014.

import { z } from 'zod';
import { dataTypeSchema, tagValueSchema, type DataType, type TagValue } from './common.js';
import type { YamlShape } from './yaml.js';

/** Kiểu suy ra từ zod schema (khớp chính xác với output của zod v4 dưới
 * `exactOptionalPropertyTypes`; không viết tay để khỏi lệch). */
export type TagDef = z.output<typeof tagSchema>;
export type TagSignal = NonNullable<TagDef['signal']>;
export type Scaling = NonNullable<TagSignal['scaling']>;

export const TAG_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;

/** Kiểm tra nhẹ địa chỉ (M1 parse đầy đủ sau). Chấp nhận dạng Siemens
 * `%I0.0`, `%IW64`, `%M0.0`, `DB1.DBW0`, và `sym:<đường dẫn>` (C2).
 * Dấu `%` đầu được phép vắng (một số importer không ghi `%`). */
export function isValidAddressLight(address: string): boolean {
  if (address.startsWith('sym:')) return address.length > 4;
  return /^(%?[IQM][BWD]?\d+(\.\d+)?|DB\d+\.DB[XBWD]\d+(\.\d+)?)$/.test(address);
}

const scalingSchema = z.object({
  rawMin: z.number(),
  rawMax: z.number(),
  engMin: z.number(),
  engMax: z.number(),
  unit: z.string().optional(),
});

const signalSchema = z.object({
  kind: z.enum(['DI', 'DO', 'AI', 'AO']).nullable(),
  scaling: scalingSchema.optional(),
  polarity: z.enum(['NO', 'NC']).optional(),
});

const NUMERIC_TYPES: readonly DataType[] = [
  'Byte',
  'Word',
  'DWord',
  'SInt',
  'USInt',
  'UInt',
  'UDInt',
  'Int',
  'DInt',
  'Real',
  'LReal',
];

/** Khoảng hợp lệ của giá trị khởi tạo theo kiểu ([min, max], số nguyên?). */
const TYPE_RANGES: Record<string, { min: number; max: number; int: boolean }> = {
  Byte: { min: 0, max: 255, int: true },
  USInt: { min: 0, max: 255, int: true },
  Word: { min: 0, max: 65535, int: true },
  UInt: { min: 0, max: 65535, int: true },
  DWord: { min: 0, max: 4294967295, int: true },
  UDInt: { min: 0, max: 4294967295, int: true },
  SInt: { min: -128, max: 127, int: true },
  Int: { min: -32768, max: 32767, int: true },
  DInt: { min: -2147483648, max: 2147483647, int: true },
  Real: { min: -Infinity, max: Infinity, int: false },
  LReal: { min: -Infinity, max: Infinity, int: false },
  Time: { min: 0, max: Infinity, int: true },
};

function initialMatchesType(type: DataType, value: TagValue): boolean {
  if (type === 'Bool') return typeof value === 'boolean';
  if (type === 'String') return typeof value === 'string';
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  const range = TYPE_RANGES[type];
  if (range === undefined) return false;
  if (range.int && !Number.isInteger(value)) return false;
  return value >= range.min && value <= range.max;
}

export const tagSchema = z
  .object({
    name: z.string().regex(TAG_NAME_RE, 'tên tag không hợp lệ'),
    type: dataTypeSchema,
    area: z.enum(['I', 'Q', 'M', 'DB']),
    address: z.string().refine(isValidAddressLight, { message: 'địa chỉ không hợp lệ' }),
    controller: z.string().min(1),
    description: z.string().optional(),
    initial: tagValueSchema.optional(),
    signal: signalSchema.optional(),
    origin: z
      .object({
        file: z.string(),
        sheet: z.string().optional(),
        row: z.number().int().optional(),
      })
      .optional(),
    provenance: z.enum(['import', 'manual']).optional(),
    equipment: z.string().optional(),
    role: z.string().optional(),
  })
  .superRefine((tag, ctx) => {
    const kind = tag.signal?.kind ?? null;
    if (kind === 'DI' || kind === 'AI') {
      if (tag.area !== 'I') {
        ctx.addIssue({
          code: 'custom',
          path: ['signal', 'kind'],
          message: `signal.kind '${kind}' phải ở area I, đang là '${tag.area}'`,
          params: { diagnosticCode: 'PRJ-E010' },
        });
      }
    } else if (kind === 'DO' || kind === 'AO') {
      if (tag.area !== 'Q') {
        ctx.addIssue({
          code: 'custom',
          path: ['signal', 'kind'],
          message: `signal.kind '${kind}' phải ở area Q, đang là '${tag.area}'`,
          params: { diagnosticCode: 'PRJ-E010' },
        });
      }
    }
    if (tag.signal?.scaling !== undefined && kind !== 'AI' && kind !== 'AO') {
      ctx.addIssue({
        code: 'custom',
        path: ['signal', 'scaling'],
        message: 'scaling chỉ hợp lệ khi signal.kind là AI/AO',
        params: { diagnosticCode: 'PRJ-E011' },
      });
    }
    const s = tag.signal?.scaling;
    if (s !== undefined) {
      if (s.rawMin === s.rawMax || s.engMin === s.engMax) {
        ctx.addIssue({
          code: 'custom',
          path: ['signal', 'scaling'],
          message: 'rawMin phải khác rawMax và engMin phải khác engMax',
          params: { diagnosticCode: 'PRJ-E012' },
        });
      }
    }
    if (kind === 'DI' || kind === 'DO') {
      if (tag.type !== 'Bool') {
        ctx.addIssue({
          code: 'custom',
          path: ['signal', 'kind'],
          message: `signal.kind '${kind}' phải đi với kiểu Bool, đang là '${tag.type}'`,
          params: { diagnosticCode: 'PRJ-E013' },
        });
      }
    } else if (kind === 'AI' || kind === 'AO') {
      if (!NUMERIC_TYPES.includes(tag.type)) {
        ctx.addIssue({
          code: 'custom',
          path: ['signal', 'kind'],
          message: `signal.kind '${kind}' phải đi với kiểu số, đang là '${tag.type}'`,
          params: { diagnosticCode: 'PRJ-E013' },
        });
      }
    }
    if (tag.initial !== undefined && !initialMatchesType(tag.type, tag.initial)) {
      ctx.addIssue({
        code: 'custom',
        path: ['initial'],
        message: `giá trị khởi tạo không đúng kiểu/khoảng của '${tag.type}'`,
        params: { diagnosticCode: 'PRJ-E014' },
      });
    }
  });

export const tagsFileSchema = z
  .object({ tags: z.array(tagSchema).default([]) })
  .superRefine((doc, ctx) => {
    // Tên trùng không phân biệt hoa/thường (PRJ-E004), báo cả hai vị trí.
    const seen = new Map<string, number>();
    doc.tags.forEach((tag, i) => {
      const key = tag.name.toLowerCase();
      const prev = seen.get(key);
      if (prev !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['tags', i, 'name'],
          message: `tag '${tag.name}' trùng với tags[${String(prev)}].name (không phân biệt hoa/thường)`,
          params: { diagnosticCode: 'PRJ-E004', relatedPath: ['tags', prev, 'name'] },
        });
      } else {
        seen.set(key, i);
      }
    });
  });

export type TagsFile = z.output<typeof tagsFileSchema>;

/** Hình dạng schema để phát hiện khóa lạ trong YAML (xem yaml.ts). */
export const TAGS_SHAPE: YamlShape = {
  keys: ['tags'],
  items: {
    keys: [
      'name',
      'type',
      'area',
      'address',
      'controller',
      'description',
      'initial',
      'signal',
      'origin',
      'provenance',
      'equipment',
      'role',
    ],
    children: {
      signal: {
        keys: ['kind', 'scaling', 'polarity'],
        children: { scaling: { keys: ['rawMin', 'rawMax', 'engMin', 'engMax', 'unit'] } },
      },
      origin: { keys: ['file', 'sheet', 'row'] },
    },
  },
};

/** Map tĩnh tên → TagDef cho mọi tag (I/Q/M/DB) — M0 §6.5.
 * Nằm ở @vcs/schemas để @vcs/project dùng được trong loadProject
 * (project không được import kernel theo đồ thị M0 §3.5); kernel
 * dùng lại chính type/factory này ở P0.3. Không giữ giá trị. */
export interface TagCatalog {
  get(name: string): TagDef | undefined;
  has(name: string): boolean;
  byController(id: string): TagDef[];
  all(): TagDef[];
}

export function createTagCatalog(defs: readonly TagDef[]): TagCatalog {
  const byName = new Map<string, TagDef>();
  for (const d of defs) byName.set(d.name, d);
  return {
    get: (name) => byName.get(name),
    has: (name) => byName.has(name),
    byController: (id) => defs.filter((d) => d.controller === id),
    all: () => [...defs],
  };
}
