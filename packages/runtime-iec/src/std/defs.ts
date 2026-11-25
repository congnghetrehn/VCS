// Định nghĩa system block — @vcs/runtime-iec (M1 §9, P1.5).
// MỘT NGUỒN SỰ THẬT duy nhất cho cả hai phía (OQ-162): typecheck/lower
// lấy interface (tên + kiểu + tham số bắt buộc) và layout instance DB;
// handler lấy offsets các field (cả ẩn). Layout tính bằng `layoutStruct`
// (§3.4) MỘT LẦN lúc nạp module, không tính lại lúc chạy scan.
// Thứ tự field = input + output + hidden (theo M1 §9); `_prevIn` có mặt
// ở cả 4 timer dù TON/TONR không đọc nó — thống nhất một bộ hidden theo
// dòng "Nội bộ: `_start`, `_running`, `_prevIn`" ở M1 §9.3, và nhờ Bool
// packing nó không tốn thêm byte nào (chung byte 16 với `_running`).
// Counter chỉ biến thể Int ở P1.5 (OQ-168 — không có cú pháp chọn DInt).

import type { IrField, IrInterface, IrVar, PrimitiveType } from '../ir.js';
import { layoutStruct, type FieldDecl } from '../layout.js';

export type StdBlockName =
  | 'TON'
  | 'TOF'
  | 'TP'
  | 'TONR'
  | 'CTU'
  | 'CTD'
  | 'CTUD'
  | 'SR'
  | 'RS'
  | 'R_TRIG'
  | 'F_TRIG';

export type StdBlockKind = 'edge' | 'bistable' | 'timer' | 'counter';

export interface StdFieldDecl {
  name: string;
  type: PrimitiveType;
  /** Field nội bộ: có trong layout, không truy cập được từ SCL (OQ-163). */
  hidden?: boolean;
  /** `init: false` = tham số tùy chọn theo luật `hasInit` của `checkCallArgs`
   * (OQ-181 — chỉ R/LD mang init này). */
  init?: number | boolean;
}

export interface StdBlockDef {
  name: StdBlockName;
  kind: StdBlockKind;
  input: StdFieldDecl[];
  output: StdFieldDecl[];
  hidden: StdFieldDecl[];
  /** Toàn bộ field (input + output + hidden) kèm offset đã tính — bảng O
   * (STATE §20). Field ẩn mang `hidden: true`. */
  layout: IrField[];
  size: number;
}

/** Định nghĩa thô (chưa layout) — thứ tự field = thứ tự trong bảng O. */
const DEFS: readonly {
  name: StdBlockName;
  kind: StdBlockKind;
  input: StdFieldDecl[];
  output: StdFieldDecl[];
  hidden: StdFieldDecl[];
}[] = [
  {
    name: 'R_TRIG',
    kind: 'edge',
    input: [{ name: 'CLK', type: 'Bool' }],
    output: [{ name: 'Q', type: 'Bool' }],
    hidden: [{ name: '_m', type: 'Bool', hidden: true }],
  },
  {
    name: 'F_TRIG',
    kind: 'edge',
    input: [{ name: 'CLK', type: 'Bool' }],
    output: [{ name: 'Q', type: 'Bool' }],
    hidden: [{ name: '_m', type: 'Bool', hidden: true }],
  },
  {
    name: 'SR',
    kind: 'bistable',
    input: [
      { name: 'S1', type: 'Bool' },
      { name: 'R', type: 'Bool' },
    ],
    output: [{ name: 'Q1', type: 'Bool' }],
    hidden: [],
  },
  {
    name: 'RS',
    kind: 'bistable',
    input: [
      { name: 'S', type: 'Bool' },
      { name: 'R1', type: 'Bool' },
    ],
    output: [{ name: 'Q1', type: 'Bool' }],
    hidden: [],
  },
  {
    name: 'TON',
    kind: 'timer',
    input: [
      { name: 'IN', type: 'Bool' },
      { name: 'PT', type: 'Time' },
    ],
    output: [
      { name: 'Q', type: 'Bool' },
      { name: 'ET', type: 'Time' },
    ],
    hidden: [
      { name: '_start', type: 'DInt', hidden: true },
      { name: '_running', type: 'Bool', hidden: true },
      { name: '_prevIn', type: 'Bool', hidden: true },
    ],
  },
  {
    name: 'TOF',
    kind: 'timer',
    input: [
      { name: 'IN', type: 'Bool' },
      { name: 'PT', type: 'Time' },
    ],
    output: [
      { name: 'Q', type: 'Bool' },
      { name: 'ET', type: 'Time' },
    ],
    hidden: [
      { name: '_start', type: 'DInt', hidden: true },
      { name: '_running', type: 'Bool', hidden: true },
      { name: '_prevIn', type: 'Bool', hidden: true },
    ],
  },
  {
    name: 'TP',
    kind: 'timer',
    input: [
      { name: 'IN', type: 'Bool' },
      { name: 'PT', type: 'Time' },
    ],
    output: [
      { name: 'Q', type: 'Bool' },
      { name: 'ET', type: 'Time' },
    ],
    hidden: [
      { name: '_start', type: 'DInt', hidden: true },
      { name: '_running', type: 'Bool', hidden: true },
      { name: '_prevIn', type: 'Bool', hidden: true },
    ],
  },
  {
    name: 'TONR',
    kind: 'timer',
    input: [
      { name: 'IN', type: 'Bool' },
      { name: 'R', type: 'Bool', init: false },
      { name: 'PT', type: 'Time' },
    ],
    output: [
      { name: 'Q', type: 'Bool' },
      { name: 'ET', type: 'Time' },
    ],
    hidden: [
      { name: '_start', type: 'DInt', hidden: true },
      { name: '_running', type: 'Bool', hidden: true },
      { name: '_prevIn', type: 'Bool', hidden: true },
      { name: '_accum', type: 'DInt', hidden: true },
    ],
  },
  {
    name: 'CTU',
    kind: 'counter',
    input: [
      { name: 'CU', type: 'Bool' },
      { name: 'R', type: 'Bool', init: false },
      { name: 'PV', type: 'Int' },
    ],
    output: [
      { name: 'QU', type: 'Bool' },
      { name: 'CV', type: 'Int' },
    ],
    hidden: [{ name: '_prevCU', type: 'Bool', hidden: true }],
  },
  {
    name: 'CTD',
    kind: 'counter',
    input: [
      { name: 'CD', type: 'Bool' },
      { name: 'LD', type: 'Bool', init: false },
      { name: 'PV', type: 'Int' },
    ],
    output: [
      { name: 'QD', type: 'Bool' },
      { name: 'CV', type: 'Int' },
    ],
    hidden: [{ name: '_prevCD', type: 'Bool', hidden: true }],
  },
  {
    name: 'CTUD',
    kind: 'counter',
    input: [
      { name: 'CU', type: 'Bool' },
      { name: 'CD', type: 'Bool' },
      { name: 'R', type: 'Bool', init: false },
      { name: 'LD', type: 'Bool', init: false },
      { name: 'PV', type: 'Int' },
    ],
    output: [
      { name: 'QU', type: 'Bool' },
      { name: 'QD', type: 'Bool' },
      { name: 'CV', type: 'Int' },
    ],
    hidden: [
      { name: '_prevCU', type: 'Bool', hidden: true },
      { name: '_prevCD', type: 'Bool', hidden: true },
    ],
  },
];

function buildDef(raw: (typeof DEFS)[number]): StdBlockDef {
  const all: StdFieldDecl[] = [...raw.input, ...raw.output, ...raw.hidden];
  const fieldDecls: FieldDecl[] = all.map((f) => ({ name: f.name, type: { kind: 'elem', type: f.type } }));
  const laid = layoutStruct(fieldDecls);
  const byName = new Map(all.map((f) => [f.name.toLowerCase(), f]));
  const layout: IrField[] = laid.fields.map((info) => {
    const decl = byName.get(info.name.toLowerCase());
    if (decl === undefined) throw new Error(`std defs: thiếu decl cho field '${info.name}'`);
    const field: IrField = {
      name: decl.name,
      type: decl.type,
      byteOffset: info.byteOffset,
      size: info.size,
    };
    if (info.bitOffset !== undefined) field.bitOffset = info.bitOffset;
    if (decl.hidden === true) field.hidden = true;
    return field;
  });
  return {
    name: raw.name,
    kind: raw.kind,
    input: raw.input,
    output: raw.output,
    hidden: raw.hidden,
    layout,
    size: laid.size,
  };
}

const BY_NAME = new Map<string, StdBlockDef>();
for (const raw of DEFS) {
  BY_NAME.set(raw.name, buildDef(raw));
}

/** Đủ 11 block, key hoa ('TON', …). */
export const STD_BLOCKS: ReadonlyMap<string, StdBlockDef> = BY_NAME;

/** Tra cứu không phân biệt hoa/thường; không có → `undefined`. */
export function getStdBlockDef(name: string): StdBlockDef | undefined {
  return BY_NAME.get(name.toUpperCase());
}

/**
 * Interface dùng cho typecheck/lower: input/output theo def (R/LD mang
 * `init: false` → tùy chọn theo luật `hasInit` của `checkCallArgs`,
 * OQ-181); không IN_OUT, temp rỗng. Không có → `undefined`.
 */
export function stdBlockInterface(name: string): IrInterface | undefined {
  const def = getStdBlockDef(name);
  if (def === undefined) return undefined;
  const toVar = (f: StdFieldDecl): IrVar => ({
    name: f.name,
    type: f.type,
    ...(f.init !== undefined ? { init: f.init } : {}),
  });
  return {
    input: def.input.map(toVar),
    output: def.output.map(toVar),
    inout: [],
    static: [],
    temp: [],
  };
}
