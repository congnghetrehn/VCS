// Typecheck SCL — @vcs/vendor-siemens (M1 §4.4, P1.3).
// Kiểm tra, KHÔNG sửa AST: kết quả suy luận kiểu để trong side-table `Map`
// keyed by node (không mutate AST P1.2 — phá tính thuần/serializable và vỡ
// test deep-equal). `lower` dùng lại bảng này, không suy luận lại kiểu.
// Mọi lỗi → Diagnostic (mã SCL-T001…T011, SCL-S020, SCL-W001 — OQ-107);
// strict là mặc định của spec (§4.4): widening ngầm định, thu hẹp phải
// tường minh (SCL-T010), không tự nới lỏng khi chưa có mã thật/PLCSIM (OQ-121).

import type { Diagnostic } from '@vcs/schemas';
import { diag, SCL_CATALOG, sortDiagnostics } from '@vcs/schemas';
import type { IrBlock, IrDb, IrExpr, IrField, IrInterface, IrLValue, IrStmt, IrType, IrUdt, IrVar, PrimitiveType, SrcRef } from '@vcs/runtime-iec';
import { isBitStringType, isFloatType, isIntegerType, layoutStruct, stdBlockInterface, getStdBlockDef } from '@vcs/runtime-iec';
import type { FieldDecl, FieldType } from '@vcs/runtime-iec';
import type {
  CallExpr,
  CallStmt,
  DbBlock,
  FbBlock,
  FcBlock,
  ObBlock,
  SclBlock,
  SclCallArg,
  SclExpr,
  SclFile,
  SclLValue,
  SclLiteral,
  SclStmt,
  SclType,
  SrcLoc,
  UdtBlock,
  VarDecl,
} from './ast.js';

export type Section = 'input' | 'output' | 'inout' | 'static' | 'temp' | 'const';

export interface SymbolInfo {
  name: string;
  section: Section;
  type: IrType;
  init?: number | boolean;
  fbType?: string;
}

export interface BlockSymbols {
  blockId: string;
  vars: Map<string, SymbolInfo>;
}

/** Kết quả phân giải một lvalue: kiểu + symbol gốc (nếu là local). */
interface LValueInfo {
  type: IrType;
  symbol?: SymbolInfo;
  isConst?: boolean;
  constValue?: number | boolean;
  /** Đọc tên FC = giá trị trả (OQ-112). */
  isFcReturn?: boolean;
}

export interface TypecheckResult {
  diagnostics: Diagnostic[];
  types: Map<SclExpr | SclLValue, IrType>;
  blocks: Map<string, BlockSymbols>;
  udts: Map<string, IrUdt>;
  dbs: Map<string, IrDb>;
  /** Kiểu trả của các FC trong file (key = tên FC lowercase). */
  returnTypes: Map<string, IrType>;
}

/** Bảng tra cứu tích lũy qua các lần compile cùng ctx (cùng hình với
 * `CompileContext` ở compile.ts — tách type để tránh import vòng
 * typecheck ↔ compile; xem STATE §18 "Lệch so với plan"). */
export interface CrossFileTables {
  udts: Map<string, IrUdt>;
  dbs: Map<string, IrDb>;
  blocks: Map<string, IrBlock>;
}

/** Tên kiểu elementary chuẩn hóa (case-insensitive) → DataType. */
const CANONICAL_ELEM: Record<string, PrimitiveType> = {
  bool: 'Bool',
  byte: 'Byte',
  word: 'Word',
  dword: 'DWord',
  sint: 'SInt',
  usint: 'USInt',
  uint: 'UInt',
  udint: 'UDInt',
  int: 'Int',
  dint: 'DInt',
  real: 'Real',
  lreal: 'LReal',
  time: 'Time',
};

/** System FB (M1 §9, P1.5) — layout + handler std ở `runtime-iec/std`
 * (OQ-111 đã áp dụng ở P1.5; OQ-162 một nguồn sự thật ở runtime-iec). */
export const SYSTEM_FB_NAMES: ReadonlySet<string> = new Set([
  'TON',
  'TOF',
  'TP',
  'TONR',
  'CTU',
  'CTD',
  'CTUD',
  'SR',
  'RS',
  'R_TRIG',
  'F_TRIG',
]);

/** Cạnh widening trực tiếp (§4.4 — chỉ đúng các cạnh liệt kê, không thêm). */
const WIDEN_EDGES: Record<PrimitiveType, readonly PrimitiveType[]> = {
  SInt: ['Int'],
  Int: ['DInt'],
  DInt: ['Real'],
  Real: ['LReal'],
  LReal: [],
  USInt: ['UInt'],
  UInt: ['UDInt'],
  UDInt: [],
  Byte: ['Word'],
  Word: ['DWord'],
  DWord: [],
  Bool: [],
  Time: [],
};

/** Số nguyên có dấu/không dấu, KHÔNG gồm Time (Time không widening, OQ-124). */
export function isStrictInteger(t: PrimitiveType): boolean {
  return isIntegerType(t) && t !== 'Time';
}

/** Kiểu số (nguyên + thực), không gồm Time/Bool/bit-string. */
function isNumeric(t: PrimitiveType): boolean {
  return isStrictInteger(t) || isFloatType(t);
}

/** Tập kiểu "chuyển đổi được" cho T010: số nguyên/thực + bit-string.
 * Bool và Time không thuộc tập này (Bool↔Int, Time↔Int → T002, bảng A31/A32). */
const CONVERTIBLE: ReadonlySet<PrimitiveType> = new Set([
  'SInt',
  'USInt',
  'UInt',
  'UDInt',
  'Int',
  'DInt',
  'Real',
  'LReal',
  'Byte',
  'Word',
  'DWord',
]);

/** Tất cả kiểu supertype của `t` (kể cả chính nó), theo thứ tự BFS. */
function supertypes(t: PrimitiveType): PrimitiveType[] {
  const out: PrimitiveType[] = [t];
  const seen = new Set<PrimitiveType>([t]);
  for (let i = 0; i < out.length; i++) {
    const cur = out[i];
    if (cur === undefined) continue;
    for (const next of WIDEN_EDGES[cur]) {
      if (!seen.has(next)) {
        seen.add(next);
        out.push(next);
      }
    }
  }
  return out;
}

/** Có cạnh widening (trực tiếp/gián tiếp) từ `from` tới `to` không?
 * Bằng nhau cũng trả true (không cần convert). */
/** IrType là kiểu nguyên thủy (chuỗi) — ngược lại là array/struct. */
export function isPrimitive(t: IrType): t is PrimitiveType {
  return typeof t === 'string';
}

export function widen(from: PrimitiveType, to: PrimitiveType): boolean {
  return supertypes(from).includes(to);
}

/** So sánh sâu hai IrType (tên struct bỏ qua — chỉ so field). */
export function irTypeEquals(a: IrType, b: IrType): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'array' && b.kind === 'array') {
    return a.lo === b.lo && a.hi === b.hi && irTypeEquals(a.elem, b.elem);
  }
  if (a.kind === 'struct' && b.kind === 'struct') {
    if (a.fields.length !== b.fields.length) return false;
    return a.fields.every(
      (f, i) => {
        const g = b.fields[i];
        return g !== undefined && f.name === g.name && irTypeEquals(f.type, g.type);
      },
    );
  }
  return false;
}

/** LUB trong lattice: kiểu chung nhỏ nhất; undefined = không có (khác họ). */
export function commonType(a: IrType, b: IrType): IrType | undefined {
  if (irTypeEquals(a, b)) return a;
  if (typeof a !== 'string' || typeof b !== 'string') return undefined;
  const supA = new Set(supertypes(a));
  for (const up of supertypes(b)) {
    if (supA.has(up)) return up;
  }
  return undefined;
}

type BinCheck = { type: IrType } | { code: 'SCL-T002' | 'SCL-T003' };

/** Kiểu kết quả nhị phân + lý do lỗi (nội bộ; bản export chỉ trả type). */
/** Một vế số (int/real) + một vế bit-string → T002 (khác họ, không có LUB —
 * bảng A, A8: `Int + Word`). Cả hai vế bit-string → T003 (xem dưới). */
function numericBitMismatch(lt: IrType, rt: IrType): boolean {
  return (
    typeof lt === 'string' &&
    typeof rt === 'string' &&
    ((isNumeric(lt) && isBitStringType(rt)) || (isBitStringType(lt) && isNumeric(rt)))
  );
}

function binaryResult(op: string, lt: IrType, rt: IrType): BinCheck {
  const structOrArray =
    typeof lt !== 'string' || typeof rt !== 'string';
  if (op === '=' || op === '<>') {
    if (irTypeEquals(lt, rt)) return { type: 'Bool' };
    const common = commonType(lt, rt);
    if (common !== undefined) return { type: 'Bool' };
    return { code: 'SCL-T002' };
  }
  if (op === '<' || op === '<=' || op === '>' || op === '>=') {
    if (typeof lt === 'string' && (lt === 'Bool' || isBitStringType(lt))) {
      return { code: 'SCL-T003' };
    }
    if (typeof rt === 'string' && (rt === 'Bool' || isBitStringType(rt))) {
      return { code: 'SCL-T003' };
    }
    if (structOrArray) return { code: 'SCL-T002' };
    const common = commonType(lt, rt);
    if (common !== undefined) return { type: 'Bool' };
    return { code: 'SCL-T002' };
  }
  if (op === 'AND' || op === 'OR' || op === 'XOR') {
    if (lt === 'Bool' && rt === 'Bool') return { type: 'Bool' };
    if (typeof lt === 'string' && typeof rt === 'string' && isBitStringType(lt) && isBitStringType(rt)) {
      const common = commonType(lt, rt);
      if (common !== undefined) return { type: common };
      return { code: 'SCL-T002' };
    }
    if (
      (lt === 'Bool' && typeof rt === 'string' && isBitStringType(rt)) ||
      (rt === 'Bool' && typeof lt === 'string' && isBitStringType(lt))
    ) {
      return { code: 'SCL-T002' };
    }
    return { code: 'SCL-T003' };
  }
  if (op === '**') {
    if (!structOrArray && typeof lt === 'string' && typeof rt === 'string' && isNumeric(lt) && isNumeric(rt)) {
      return { type: lt === 'LReal' || rt === 'LReal' ? 'LReal' : 'Real' };
    }
    if (numericBitMismatch(lt, rt)) return { code: 'SCL-T002' };
    return { code: 'SCL-T003' };
  }
  if (op === 'MOD') {
    if (
      !structOrArray &&
      typeof lt === 'string' &&
      typeof rt === 'string' &&
      isStrictInteger(lt) &&
      isStrictInteger(rt)
    ) {
      const common = commonType(lt, rt);
      if (common !== undefined) return { type: common };
      return { code: 'SCL-T002' };
    }
    if (numericBitMismatch(lt, rt)) return { code: 'SCL-T002' };
    return { code: 'SCL-T003' };
  }
  // '+', '-', '*', '/', 'DIV': số học.
  if (typeof lt === 'string' && lt === 'Time' && typeof rt === 'string' && rt === 'Time') {
    if (op === '+' || op === '-') return { type: 'Time' };
    return { code: 'SCL-T003' };
  }
  if ((typeof lt === 'string' && lt === 'Time') || (typeof rt === 'string' && rt === 'Time')) {
    return { code: 'SCL-T003' };
  }
  if (structOrArray) return { code: 'SCL-T003' };
  if (typeof lt === 'string' && typeof rt === 'string' && isNumeric(lt) && isNumeric(rt)) {
    const common = commonType(lt, rt);
    if (common !== undefined) return { type: common };
    return { code: 'SCL-T002' };
  }
  if (numericBitMismatch(lt, rt)) return { code: 'SCL-T002' };
  return { code: 'SCL-T003' };
}

/** Kiểu kết quả nhị phân — dạng đầy đủ (T002/T003) cho callers cần
 * phân biệt mã lỗi (LAD ánh xạ sang LAD-T002/LAD-T003). */
export function binaryResultDetail(
  op: string,
  lt: IrType,
  rt: IrType,
): { type: IrType } | { code: 'SCL-T002' | 'SCL-T003' } {
  return binaryResult(op, lt, rt);
}

/** Kiểu kết quả nhị phân (bản export theo plan §18); undefined = lỗi
 * (xem `binaryResult` nội bộ để biết mã T002/T003). */
export function binaryResultType(op: string, lt: IrType, rt: IrType): IrType | undefined {
  const r = binaryResult(op, lt, rt);
  return 'type' in r ? r.type : undefined;
}

type UnCheck = { type: IrType } | { code: 'SCL-T003' };

function unaryResult(op: '+' | '-' | 'NOT', t: IrType): UnCheck {
  if (typeof t !== 'string') return { code: 'SCL-T003' };
  if (op === 'NOT') {
    if (t === 'Bool') return { type: 'Bool' };
    if (isBitStringType(t)) return { type: t };
    return { code: 'SCL-T003' };
  }
  if (isNumeric(t) || t === 'Time') return { type: t };
  return { code: 'SCL-T003' };
}

/** Kiểu kết quả unary (bản export theo plan §18); undefined = lỗi T003. */
export function unaryResultType(op: '+' | '-' | 'NOT', t: IrType): IrType | undefined {
  const r = unaryResult(op, t);
  return 'type' in r ? r.type : undefined;
}

/** Khoảng giá trị của kiểu nguyên/bit-string (M1 §3.1) — dùng kiểm literal
 * hằng ngoài khoảng (D-c: `speed := 40000` → T002). */
const INT_RANGES: Record<string, readonly [number, number]> = {
  SInt: [-128, 127],
  Int: [-32768, 32767],
  DInt: [-2147483648, 2147483647],
  USInt: [0, 255],
  UInt: [0, 65535],
  UDInt: [0, 4294967295],
  Byte: [0, 255],
  Word: [0, 65535],
  DWord: [0, 4294967295],
};

/** `value` hằng có vừa khoảng kiểu đích (nguyên/bit-string) không? */
export function constFitsRange(value: number, target: PrimitiveType): boolean {
  const range = INT_RANGES[target];
  if (range === undefined) return true;
  return value >= range[0] && value <= range[1];
}

/**
 * Tính giá trị hằng: chỉ literal + unary/binary trên hằng + ref tới
 * VAR_CONSTANT (đã tính trước). Ref khác, call, abs → lỗi T008.
 * `/`/`DIV` trên hai số nguyên cắt về 0 (như §4.4); `MOD` dấu theo số bị
 * chia (như JS `%`).
 */
export function evalConst(
  expr: SclExpr,
  scope: BlockSymbols,
): { value: number | boolean } | { error: string } {
  switch (expr.kind) {
    case 'literal': {
      const lit = expr.literal;
      if (lit.type === 'String') return { error: 'String không hỗ trợ ở M1' };
      return { value: lit.value };
    }
    case 'ref': {
      const lv = expr.ref;
      if (lv.base.kind !== 'local' || lv.path.length > 0) {
        return { error: 'chỉ VAR_CONSTANT mới dùng được trong biểu thức hằng' };
      }
      const sym = scope.vars.get(lv.base.name.toLowerCase());
      if (sym === undefined || sym.section !== 'const' || sym.init === undefined) {
        return { error: `#${lv.base.name} không phải hằng (VAR_CONSTANT)` };
      }
      return { value: sym.init };
    }
    case 'unary': {
      const inner = evalConst(expr.operand, scope);
      if ('error' in inner) return inner;
      const v = inner.value;
      if (expr.op === '+') {
        if (typeof v !== 'number') return { error: 'unary + chỉ dùng cho số' };
        return { value: v };
      }
      if (expr.op === '-') {
        if (typeof v !== 'number') return { error: 'unary - chỉ dùng cho số' };
        return { value: -v };
      }
      if (typeof v === 'boolean') return { value: !v };
      if (typeof v === 'number') return { value: ~v };
      return { error: 'NOT chỉ dùng cho Bool hoặc Byte/Word/DWord' };
    }
    case 'binary': {
      const l = evalConst(expr.left, scope);
      if ('error' in l) return l;
      const r = evalConst(expr.right, scope);
      if ('error' in r) return r;
      const a = l.value;
      const b = r.value;
      const op = expr.op;
      if (op === '=' ) return { value: a === b };
      if (op === '<>') return { value: a !== b };
      if (op === 'AND') {
        if (typeof a === 'boolean' && typeof b === 'boolean') return { value: a && b };
        if (typeof a === 'number' && typeof b === 'number') return { value: a & b };
        return { error: 'AND cần hai Bool hoặc hai số nguyên' };
      }
      if (op === 'OR') {
        if (typeof a === 'boolean' && typeof b === 'boolean') return { value: a || b };
        if (typeof a === 'number' && typeof b === 'number') return { value: a | b };
        return { error: 'OR cần hai Bool hoặc hai số nguyên' };
      }
      if (op === 'XOR') {
        if (typeof a === 'boolean' && typeof b === 'boolean') return { value: a !== b };
        if (typeof a === 'number' && typeof b === 'number') return { value: a ^ b };
        return { error: 'XOR cần hai Bool hoặc hai số nguyên' };
      }
      if (op === '<') return { value: (a as number) < (b as number) };
      if (op === '<=') return { value: (a as number) <= (b as number) };
      if (op === '>') return { value: (a as number) > (b as number) };
      if (op === '>=') return { value: (a as number) >= (b as number) };
      if (typeof a !== 'number' || typeof b !== 'number') {
        return { error: `phép ${op} cần hai số` };
      }
      if (op === '+') return { value: a + b };
      if (op === '-') return { value: a - b };
      if (op === '*') return { value: a * b };
      if (op === '/' || op === 'DIV') {
        if (b === 0) return { error: 'chia cho 0' };
        return { value: Number.isInteger(a) && Number.isInteger(b) ? Math.trunc(a / b) : a / b };
      }
      if (op === 'MOD') {
        if (b === 0) return { error: 'chia cho 0' };
        return { value: a % b };
      }
      if (op === '**') return { value: Math.pow(a, b) };
      return { error: `toán tử không hỗ trợ trong biểu thức hằng: ${op}` };
    }
    case 'call':
      return { error: 'gọi hàm không phải biểu thức hằng' };
  }
}

// ---------------------------------------------------------------- intrinsic

export type IntrinsicInfo =
  | { kind: 'convert'; from: PrimitiveType; to: PrimitiveType; mode?: 'round' | 'trunc' }
  | { kind: 'roundConvert'; mode: 'round' | 'trunc' }
  | { kind: 'intrinsic'; fn: string };

/** Tên kiểu được phép trong X_TO_Y (chữ HOA — so sánh với tên đã upper-case
 * từ regex; SInt/USInt/UInt/UDInt/Time không có trong tập này — xem STATE
 * §18 "Lệch so với plan"). */
const CONVERTIBLE_TYPES: ReadonlySet<string> = new Set([
  'BOOL',
  'BYTE',
  'WORD',
  'DWORD',
  'INT',
  'DINT',
  'REAL',
  'LREAL',
]);

/** `BOOL_TO_*` chỉ chấp nhận INT/DINT/BYTE/WORD/DWORD (OQ-115 — "bảng VERIFY"
 * §7.3 không tồn tại trong spec, mặc định hẹp). */
const BOOL_TO_TARGETS: ReadonlySet<string> = new Set(['INT', 'DINT', 'BYTE', 'WORD', 'DWORD']);

const NAMED_INTRINSICS: ReadonlySet<string> = new Set([
  'ABS',
  'SQRT',
  'MIN',
  'MAX',
  'LIMIT',
  'SHL',
  'SHR',
  'ROL',
  'ROR',
  'TRUNC',
  'ROUND',
  'CEIL',
  'FLOOR',
  'NORM_X',
  'SCALE_X',
]);

/**
 * Phân loại tên gọi intrinsic (§7.3 + OQ-115): X_TO_Y → convert,
 * ROUND/TRUNC → roundConvert (from = kiểu đối số, to = DInt — xem typecheck),
 * còn lại → intrinsic. undefined = không phải intrinsic đã biết
 * (caller quyết: block hay T001/T004).
 */
export function classifyIntrinsic(name: string): IntrinsicInfo | undefined {
  const upper = name.toUpperCase();
  if (upper === 'ROUND') return { kind: 'roundConvert', mode: 'round' };
  if (upper === 'TRUNC') return { kind: 'roundConvert', mode: 'trunc' };
  if (NAMED_INTRINSICS.has(upper)) return { kind: 'intrinsic', fn: upper };
  const m = /^([A-Z]+)_TO_([A-Z]+)$/.exec(upper);
  if (m === null) return undefined;
  const fromName = m[1] as string;
  const toName = m[2] as string;
  if (fromName === 'BOOL') {
    if (!BOOL_TO_TARGETS.has(toName)) return undefined;
    const to = CANONICAL_ELEM[toName.toLowerCase()];
    if (to === undefined) return undefined;
    return { kind: 'convert', from: 'Bool', to };
  }
  if (!CONVERTIBLE_TYPES.has(fromName) || !CONVERTIBLE_TYPES.has(toName)) return undefined;
  const from = CANONICAL_ELEM[fromName.toLowerCase()];
  const to = CANONICAL_ELEM[toName.toLowerCase()];
  if (from === undefined || to === undefined) return undefined;
  const mode = convertModeFor(from, to);
  const info: IntrinsicInfo =
    mode === undefined
      ? { kind: 'convert', from, to }
      : { kind: 'convert', from, to, mode };
  return info;
}

/** `REAL_TO_INT`/`ROUND` làm tròn về số chẵn gần nhất; `TRUNC` cắt về 0.
 * Tên hàm convert thực→nguyên → mode 'round' (trừ TRUNC → 'trunc'). */
export function convertModeFor(from: PrimitiveType, to: PrimitiveType): 'round' | 'trunc' | undefined {
  if ((from === 'Real' || from === 'LReal') && isStrictInteger(to)) return 'round';
  return undefined;
}

// ---------------------------------------------------------------- helpers

/** Vị trí tên khai báo (token tên bắt đầu decl.loc, dài bằng tên). */
function nameLoc(decl: VarDecl): SrcLoc {
  return {
    line: decl.loc.line,
    col: decl.loc.col,
    endLine: decl.loc.line,
    endCol: decl.loc.col + decl.name.length,
    offset: decl.loc.offset,
    length: decl.name.length,
  };
}

/** IrType → FieldType (cho layoutStruct). */
export function irTypeToFieldType(t: IrType): FieldType {
  if (typeof t === 'string') return { kind: 'elem', type: t };
  if (t.kind === 'array') return { kind: 'array', elem: irTypeToFieldType(t.elem), lo: t.lo, hi: t.hi };
  return {
    kind: 'struct',
    ...(t.name !== undefined ? { name: t.name } : {}),
    fields: t.fields.map((f) => ({ name: f.name, type: irTypeToFieldType(f.type) })),
  };
}

export interface LayoutFieldDecl {
  name: string;
  type: IrType;
  init?: number | boolean;
  /** Field nội bộ của system block (OQ-163): có trong layout, không truy
   * cập được từ SCL — `layoutIrFields` chép sang IrField. */
  hidden?: boolean;
}

/**
 * Tính layout cho một danh sách field (dùng layoutStruct P1.1) và trả
 * IrField[] + tổng size. Offsets trong IrField của struct lồng là TƯƠNG ĐỐI
 * với đầu struct chứa nó (base 0) — interpreter cộng dồn khi duyệt xuống.
 * Ném Error khi layout không tính được (mảng lồng, lo > hi...) — caller
 * chuyển thành T005 (đã kiểm trước ở resolveTypeNode nên thực tế không tới).
 */
export function layoutIrFields(decls: readonly LayoutFieldDecl[]): { fields: IrField[]; size: number } {
  const fieldDecls: FieldDecl[] = decls.map((d) => ({ name: d.name, type: irTypeToFieldType(d.type) }));
  const layout = layoutStruct(fieldDecls);
  const fields = layout.fields.map((info, i) => {
    const decl = decls[i];
    if (decl === undefined) throw new Error('layoutIrFields: thiếu decl');
    const f: IrField = {
      name: decl.name,
      type: decl.type,
      byteOffset: info.byteOffset,
      size: info.size,
    };
    if (info.bitOffset !== undefined) f.bitOffset = info.bitOffset;
    if (decl.init !== undefined) f.init = decl.init;
    if (decl.hidden === true) f.hidden = true;
    return f;
  });
  return { fields, size: layout.size };
}

/** Struct type của interface một FB (input+output+inout+static, theo §3.5).
 * Được xuất cho LAD (OQ-190). */
export function fbInterfaceStruct(iface: IrInterface): IrType {
  const decls: LayoutFieldDecl[] = [
    ...iface.input,
    ...iface.output,
    ...iface.inout,
    ...iface.static,
  ].map((v) => ({ name: v.name, type: v.type, ...(v.init !== undefined ? { init: v.init } : {}) }));
  const { fields } = layoutIrFields(decls);
  return { kind: 'struct', fields };
}

/** BlockSymbols từ IrBlock đã biên dịch (ctx) — dùng tra cứu call chéo file.
 * `fbType` của static kiểu FB-instance không khôi phục được từ IrType
 * (chỉ có struct) — không ảnh hưởng vì instance luôn là local của block
 * đang biên dịch, không lấy từ block khác. */
function blockSymbolsFromIr(ir: IrBlock): BlockSymbols {
  const vars = new Map<string, SymbolInfo>();
  const add = (section: Section, v: IrVar): void => {
    const sym: SymbolInfo = { name: v.name, section, type: v.type };
    if (v.init !== undefined) sym.init = v.init;
    vars.set(v.name.toLowerCase(), sym);
  };
  ir.interface.input.forEach((v) => {
    add('input', v);
  });
  ir.interface.output.forEach((v) => {
    add('output', v);
  });
  ir.interface.inout.forEach((v) => {
    add('inout', v);
  });
  ir.interface.static.forEach((v) => {
    add('static', v);
  });
  ir.interface.temp.forEach((v) => {
    add('temp', v);
  });
  return { blockId: ir.id, vars };
}

function sectionOf(kind: string): Section {
  switch (kind) {
    case 'VAR_INPUT':
      return 'input';
    case 'VAR_OUTPUT':
      return 'output';
    case 'VAR_IN_OUT':
      return 'inout';
    case 'VAR':
      return 'static';
    case 'VAR_TEMP':
      return 'temp';
    case 'VAR_CONSTANT':
      return 'const';
    default:
      return 'static';
  }
}

const EMPTY_SYMBOLS: BlockSymbols = { blockId: '', vars: new Map() };

interface CallTargetInfo {
  kind: 'FC' | 'FB';
  name: string;
  iface: IrInterface;
  returnType?: IrType;
}

// ---------------------------------------------------------------- checker

interface PendingStructInit {
  fieldName: string;
  init: SclExpr;
  scope: BlockSymbols;
  fields?: IrField[];
}

interface CallEdge {
  from: string;
  to: string;
  loc: SrcLoc;
  /** File chứa call site — undefined = file đang kiểm (cạnh từ ctx có file riêng). */
  file?: string | undefined;
}

class Typechecker {
  private readonly file: SclFile;
  private readonly fileName: string;
  private readonly ctx: CrossFileTables;
  private readonly diags: Diagnostic[] = [];
  /** true khi đang kiểm init của khai báo — không cảnh báo TEMP (W001). */
  private suppressW001 = false;
  readonly types = new Map<SclExpr | SclLValue, IrType>();
  readonly blocks = new Map<string, BlockSymbols>();
  readonly udts = new Map<string, IrUdt>();
  readonly dbs = new Map<string, IrDb>();
  private readonly blockByName = new Map<string, SclBlock>();
  private readonly udtBlockByName = new Map<string, UdtBlock>();
  private readonly resolvingUdt: string[] = [];
  private readonly resolvingBlock: string[] = [];
  private readonly fcReturnTypes = new Map<string, IrType>();
  private readonly broken = new Set<string>();
  private readonly pendingStructInits: PendingStructInit[] = [];
  private readonly callEdges: CallEdge[] = [];
  private currentBlock: ObBlock | FcBlock | FbBlock | undefined;
  private currentSymbols: BlockSymbols | undefined;

  constructor(file: SclFile, fileName: string, ctx: CrossFileTables) {
    this.file = file;
    this.fileName = fileName;
    this.ctx = ctx;
    for (const b of file.blocks) {
      this.blockByName.set(b.name.toLowerCase(), b);
      if (b.kind === 'UDT') this.udtBlockByName.set(b.name.toLowerCase(), b);
    }
  }

  private err(code: string, loc: SrcLoc, message: string, file?: string): void {
    this.diags.push(
      diag(
        code,
        SCL_CATALOG.get(code)?.severity ?? 'error',
        message,
        { file: file ?? this.fileName, line: loc.line, col: loc.col, endLine: loc.endLine, endCol: loc.endCol },
        SCL_CATALOG.get(code)?.hint,
      ),
    );
  }

  // ---------------------------------------------------------- tra cứu block

  private findBlock(name: string, ident: boolean): SclBlock | IrBlock | undefined {
    const local = ident
      ? this.blockByName.get(name.toLowerCase())
      : [...this.blockByName.values()].find((b) => b.name === name);
    if (local !== undefined) return local;
    if (ident) return this.ctx.blocks.get(name.toLowerCase());
    return [...this.ctx.blocks.values()].find((b) => b.name === name);
  }

  private findDb(name: string, ident: boolean): IrDb | undefined {
    if (ident) {
      const local = this.dbs.get(name.toLowerCase());
      if (local !== undefined) return local;
      return this.ctx.dbs.get(name.toLowerCase());
    }
    return (
      [...this.dbs.values()].find((d) => d.name === name) ??
      [...this.ctx.dbs.values()].find((d) => d.name === name)
    );
  }

  private findUdtBlock(name: string): UdtBlock | undefined {
    return this.udtBlockByName.get(name.toLowerCase());
  }

  /** BlockSymbols của block trong file (build + cache) hoặc từ ctx. */
  lookupBlockSymbols(lowerId: string): BlockSymbols | undefined {
    const cached = this.blocks.get(lowerId);
    if (cached !== undefined) return cached;
    const local = this.blockByName.get(lowerId);
    if (local !== undefined && (local.kind === 'OB' || local.kind === 'FC' || local.kind === 'FB')) {
      return this.getBlockSymbols(local);
    }
    const ctxBlock = this.ctx.blocks.get(lowerId);
    if (ctxBlock !== undefined) {
      const syms = blockSymbolsFromIr(ctxBlock);
      this.blocks.set(lowerId, syms);
      return syms;
    }
    return undefined;
  }

  /** Interface IrInterface của một block (file hoặc ctx), theo tên.
   * Tên std → interface từ `runtime-iec/std` (OQ-162 — không duplicate
   * bảng interface ở vendor-siemens). */
  private lookupInterface(name: string, ident: boolean): IrInterface | undefined {
    const std = stdBlockInterface(name);
    if (std !== undefined) return std;
    const block = this.findBlock(name, ident);
    if (block === undefined) return undefined;
    if ('interface' in block) {
      // FC từ ctx: ghi nhớ kiểu trả để lower dùng (TypecheckResult.returnTypes)
      // + ghi entry tổng hợp vào this.blocks để lower tra cứu callee chéo
      // file (lower chỉ có TypecheckResult, không có ctx).
      if (block.kind === 'FC' && block.interface.returnType !== undefined) {
        this.fcReturnTypes.set(block.name.toLowerCase(), block.interface.returnType);
      }
      this.lookupBlockSymbols(block.name.toLowerCase());
      return block.interface;
    }
    const syms = this.lookupBlockSymbols(block.name.toLowerCase());
    if (syms === undefined) return undefined;
    return interfaceFromSymbols(syms);
  }

  // ---------------------------------------------------------- phân giải kiểu

  /**
   * Phân giải SclType → IrType (+ fbType nếu là instance FB).
   * `placement`: kiểu std chỉ chấp nhận ở VAR (static) của block hoặc
   * DATA_BLOCK (OQ-171) — ở vị trí khác (VAR_TEMP, VAR_INPUT/OUTPUT/
   * IN_OUT, kiểu trả FC, phần tử mảng, field struct/UDT/DB) → SCL-T004.
   * Đệ quy vào struct/mảng luôn dùng 'other' (struct/mảng không chứa
   * được instance — quy tắc T005 cũ vẫn giữ cho FB người dùng).
   */
  private resolveTypeNode(
    type: SclType,
    scope: BlockSymbols,
    placement: 'static' | 'other' = 'other',
  ): { type: IrType; fbType?: string } | undefined {
    switch (type.kind) {
      case 'elementary': {
        const canon = CANONICAL_ELEM[type.name.toLowerCase()];
        if (canon === undefined) return undefined; // không tới được (parser chỉ cho kiểu biết)
        return { type: canon };
      }
      case 'array': {
        if (type.lo > type.hi) {
          this.err('SCL-T005', type.loc, `mảng [${String(type.lo)}..${String(type.hi)}]: lo > hi`);
          return undefined;
        }
        const elem = this.resolveTypeNode(type.elem, scope, 'other');
        if (elem === undefined) return undefined;
        if (elem.fbType !== undefined) {
          this.err('SCL-T005', type.loc, 'mảng không chứa được instance FB');
          return undefined;
        }
        if (typeof elem.type !== 'string' && elem.type.kind === 'array') {
          this.err('SCL-T005', type.loc, 'mảng lồng mảng không hỗ trợ ở M1 (chỉ 1 chiều)');
          return undefined;
        }
        return { type: { kind: 'array', elem: elem.type, lo: type.lo, hi: type.hi } };
      }
      case 'struct': {
        const decls: LayoutFieldDecl[] = [];
        const seen = new Set<string>();
        for (const field of type.fields) {
          const lower = field.name.toLowerCase();
          if (seen.has(lower)) {
            this.err('SCL-T009', nameLoc(field), `tên đã khai báo: ${field.name}`);
            continue;
          }
          seen.add(lower);
          const resolved = this.resolveTypeNode(field.type, scope, 'other');
          if (resolved === undefined) continue;
          if (resolved.fbType !== undefined) {
            this.err('SCL-T005', field.type.loc, `struct không chứa được instance FB '${field.name}'`);
            continue;
          }
          decls.push({ name: field.name, type: resolved.type });
          if (field.init !== undefined) {
            // Init của field struct nội tuyến đánh giá SAU khi const của block
            // đã tính xong (xem getBlockSymbols) — lưu lại để gắn vào IrField.
            this.pendingStructInits.push({ fieldName: field.name, init: field.init, scope });
          }
        }
        let laid: { fields: IrField[]; size: number };
        try {
          laid = layoutIrFields(decls);
        } catch (e) {
          this.err(
            'SCL-T005',
            type.loc,
            `không tính được layout struct: ${e instanceof Error ? e.message : 'lỗi layout'}`,
          );
          return undefined;
        }
        // Ghi nhớ mảng fields vừa layout để gắn init đang chờ (theo tên).
        for (const p of this.pendingStructInits) {
          if (p.fields === undefined) p.fields = laid.fields;
        }
        return { type: { kind: 'struct', fields: laid.fields } };
      }
      case 'named': {
        const lower = type.name.toLowerCase();
        if (lower === 'string' || lower === 'wstring') return undefined; // parser đã báo SCL-U001
        if (SYSTEM_FB_NAMES.has(type.name.toUpperCase())) {
          if (placement === 'static') {
            const def = getStdBlockDef(type.name);
            if (def === undefined) return undefined; // không tới được (tên đã trong SYSTEM_FB_NAMES)
            // Struct layout ĐẦY ĐỦ gồm hidden (dùng cho layout lồng — mục 6
            // thiết kế §20); member ẩn bị chặn ở resolveLValue (OQ-163).
            return { type: { kind: 'struct', fields: def.layout }, fbType: def.name };
          }
          this.err(
            'SCL-T004',
            type.loc,
            `kiểu '${type.name}' là system block, chỉ dùng ở VAR (static) hoặc DATA_BLOCK`,
          );
          return undefined;
        }
        const udt = this.getUdt(lower, type.loc);
        if (udt !== undefined) {
          return { type: { kind: 'struct', name: udt.name, fields: udt.fields } };
        }
        if (this.findUdtBlock(lower) !== undefined || this.ctx.udts.has(lower)) {
          return undefined; // là UDT nhưng phân giải lỗi (đệ quy) — đã báo T011
        }
        const fb = this.findBlock(type.name, true);
        if (fb !== undefined && fb.kind === 'FB') {
          const iface = this.lookupInterface(type.name, true);
          if (iface === undefined) return undefined;
          return { type: fbInterfaceStruct(iface), fbType: fb.name };
        }
        this.err('SCL-T001', type.loc, `kiểu chưa biết: ${type.name}`);
        return undefined;
      }
    }
  }

  /** UDT đã phân giải (file hoặc ctx), có phát hiện đệ quy (T011). */
  private getUdt(lower: string, referrerLoc: SrcLoc): IrUdt | undefined {
    const done = this.udts.get(lower) ?? this.ctx.udts.get(lower);
    if (done !== undefined) return done;
    const block = this.findUdtBlock(lower);
    if (block === undefined) return undefined;
    if (this.resolvingUdt.includes(lower)) {
      this.err('SCL-T011', referrerLoc, `định nghĩa kiểu đệ quy: ${block.name} chứa chính nó`);
      return undefined;
    }
    this.resolvingUdt.push(lower);
    try {
      const decls: LayoutFieldDecl[] = [];
      const seen = new Set<string>();
      for (const field of block.fields) {
        const fl = field.name.toLowerCase();
        if (seen.has(fl)) {
          this.err('SCL-T009', nameLoc(field), `tên đã khai báo: ${field.name}`);
          continue;
        }
        seen.add(fl);
        const resolved = this.resolveTypeNode(field.type, EMPTY_SYMBOLS);
        if (resolved === undefined) continue;
        if (resolved.fbType !== undefined) {
          this.err('SCL-T001', field.type.loc, `kiểu '${resolved.fbType}' là FB, không dùng được trong UDT`);
          continue;
        }
        const decl: LayoutFieldDecl = { name: field.name, type: resolved.type };
        decls.push(decl);
        if (field.init !== undefined) {
          const r = evalConst(field.init, EMPTY_SYMBOLS);
          if ('error' in r) {
            this.err('SCL-T008', field.init.loc, `giá trị khởi tạo không hằng: ${r.error}`);
          } else {
            decl.init = r.value;
          }
        }
      }
      let laid: { fields: IrField[]; size: number };
      try {
        laid = layoutIrFields(decls);
      } catch (e) {
        this.err(
          'SCL-T005',
          block.loc,
          `không tính được layout UDT '${block.name}': ${e instanceof Error ? e.message : 'lỗi layout'}`,
        );
        return undefined;
      }
      const udt: IrUdt = { id: block.name, name: block.name, fields: laid.fields, size: laid.size };
      this.udts.set(lower, udt);
      return udt;
    } finally {
      this.resolvingUdt.pop();
    }
  }

  // ---------------------------------------------------------- block symbols

  /** BlockSymbols của một block trong file (build + cache). */
  private getBlockSymbols(block: ObBlock | FcBlock | FbBlock): BlockSymbols {
    const key = block.name.toLowerCase();
    const cached = this.blocks.get(key);
    if (cached !== undefined) return cached;
    if (this.resolvingBlock.includes(key)) {
      // Instance FB đệ quy (A chứa B chứa A) — không có layout hữu hạn.
      this.err('SCL-T011', block.loc, `instance FB đệ quy: ${block.name}`);
      const empty: BlockSymbols = { blockId: block.name, vars: new Map() };
      this.blocks.set(key, empty);
      return empty;
    }
    this.resolvingBlock.push(key);
    try {
      const syms: BlockSymbols = { blockId: block.name, vars: new Map() };
      this.blocks.set(key, syms);
      // Lượt 1: phân giải kiểu mọi khai báo (kèm T009 trùng tên, T001...).
      for (const section of block.varSections) {
        const sec = sectionOf(section.kind);
        for (const decl of section.decls) {
          const lower = decl.name.toLowerCase();
          if (syms.vars.has(lower)) {
            this.err('SCL-T009', nameLoc(decl), `tên đã khai báo: ${decl.name}`);
            continue;
          }
          if (block.kind === 'FC' && lower === key) {
            this.err('SCL-T009', nameLoc(decl), `tên đã khai báo: ${decl.name} (trùng tên FC)`);
            continue;
          }
          const resolved = this.resolveTypeNode(
            decl.type,
            syms,
            sec === 'static' ? 'static' : 'other',
          );
          if (resolved === undefined) {
            // Kiểu lỗi đã báo — đăng ký dummy để tránh lỗi dây chuyền.
            syms.vars.set(lower, { name: decl.name, section: sec, type: 'Int' });
            this.broken.add(`${key}::${lower}`);
            continue;
          }
          const sym: SymbolInfo = { name: decl.name, section: sec, type: resolved.type };
          if (resolved.fbType !== undefined) sym.fbType = resolved.fbType;
          syms.vars.set(lower, sym);
        }
      }
      // Lượt 2: tính giá trị khởi tạo (const_expr) theo thứ tự khai báo.
      // Cần currentBlock/currentSymbols vì checkExpr → resolveLValue dùng
      // chúng cho tên FC và cảnh báo TEMP; lưu/khôi phục để gọi đệ quy
      // (getBlockSymbols của FB lồng nhau) không làm lệch ngữ cảnh.
      const prevBlock = this.currentBlock;
      const prevSyms = this.currentSymbols;
      this.currentBlock = block;
      this.currentSymbols = syms;
      try {
        // Lượt 2a (fixpoint, im lặng): VAR_CONSTANT có thể tham chiếu hằng
        // khai báo sau nó — lặp cho tới khi không còn const nào mới được tính.
        const constDecls = block.varSections.flatMap((s) =>
          s.kind === 'VAR_CONSTANT' ? s.decls : [],
        );
        let changed = true;
        for (let pass = 0; changed && pass <= constDecls.length; pass++) {
          changed = false;
          for (const decl of constDecls) {
            const sym = syms.vars.get(decl.name.toLowerCase());
            if (sym === undefined || sym.init !== undefined || decl.init === undefined) continue;
            const r = evalConst(decl.init, syms);
            if (!('error' in r)) {
              sym.init = r.value;
              changed = true;
            }
          }
        }
        flushPendingStructInits(this.pendingStructInits, syms, (c, l, m) => {
          this.err(c, l, m);
        });
        // Lượt 2b (có chẩn đoán): kiểm kiểu + tính init cho mọi khai báo.
        for (const section of block.varSections) {
          for (const decl of section.decls) {
            const sym = syms.vars.get(decl.name.toLowerCase());
            if (sym === undefined) continue;
            if (section.kind === 'VAR_CONSTANT' && decl.init === undefined) {
              this.err('SCL-T008', decl.loc, `VAR_CONSTANT '${decl.name}' phải có giá trị khởi tạo`);
              continue;
            }
            if (decl.init === undefined) continue;
            const before = this.diags.length;
            this.suppressW001 = true;
            let initType: IrType | undefined;
            try {
              initType = this.checkExpr(decl.init, syms, new Set<string>());
            } finally {
              this.suppressW001 = false;
            }
            const hadError = this.diags.length > before;
            if (initType !== undefined) {
              const problem = this.assignProblem(sym.type, initType);
              if (problem !== undefined) {
                this.err(problem.code, decl.init.loc, problem.message);
              }
            }
            const r = evalConst(decl.init, syms);
            if ('error' in r) {
              if (section.kind === 'VAR_CONSTANT' && !hadError) {
                this.err('SCL-T008', decl.init.loc, `giá trị khởi tạo không hằng: ${r.error}`);
              }
            } else {
              sym.init = r.value;
              if (typeof r.value === 'number' && typeof sym.type === 'string') {
                if (!constFitsRange(r.value, sym.type)) {
                  this.err('SCL-T002', decl.init.loc, `giá trị ${String(r.value)} ngoài khoảng kiểu ${sym.type}`);
                }
              }
            }
          }
        }
      } finally {
        this.currentBlock = prevBlock;
        this.currentSymbols = prevSyms;
      }
      // Kiểu trả của FC (để lower + kiểm tra call dùng).
      if (block.kind === 'FC' && block.returnType !== undefined) {
        const rt = this.resolveTypeNode(block.returnType, syms, 'other');
        if (rt !== undefined) {
          if (rt.fbType !== undefined) {
            this.err('SCL-T001', block.returnType.loc, 'FC không trả về instance FB');
          } else {
            this.fcReturnTypes.set(key, rt.type);
          }
        }
      }
      return syms;
    } finally {
      this.resolvingBlock.pop();
    }
  }

  // ---------------------------------------------------------- DB

  /** Phân giải một DB block → IrDb (kèm kiểm tra init). */
  private resolveDb(block: DbBlock): IrDb | undefined {
    const key = block.name.toLowerCase();
    const done = this.dbs.get(key) ?? this.ctx.dbs.get(key);
    if (done !== undefined) return done;
    if (block.fbName !== undefined) {
      const stdDef = getStdBlockDef(block.fbName);
      if (stdDef !== undefined) {
        // Instance DB của system block (OQ-163): layout trên toàn bộ field
        // (public + hidden) qua layoutIrFields; `fields` chỉ public (lọc
        // hidden như tiền lệ lọc IN_OUT ở OQ-125); `size` gồm hidden;
        // `fbName` giữ tên std (lower phân biệt bằng SYSTEM_FB_NAMES).
        const decls: LayoutFieldDecl[] = [...stdDef.input, ...stdDef.output, ...stdDef.hidden].map(
          (f): LayoutFieldDecl => ({
            name: f.name,
            type: f.type,
            ...(f.hidden === true ? { hidden: true } : {}),
          }),
        );
        let laid: { fields: IrField[]; size: number };
        try {
          laid = layoutIrFields(decls);
        } catch (e) {
          this.err(
            'SCL-T005',
            block.loc,
            `không tính được layout DB '${block.name}': ${e instanceof Error ? e.message : 'lỗi layout'}`,
          );
          return undefined;
        }
        const fields = laid.fields.filter((f) => f.hidden !== true);
        const db: IrDb = { id: block.name, name: block.name, fbName: stdDef.name, fields, size: laid.size };
        this.dbs.set(key, db);
        return db;
      }
      const fb = this.findBlock(block.fbName, false);
      if (fb === undefined || fb.kind !== 'FB') {
        this.err('SCL-T001', block.loc, `FB chưa biết: ${block.fbName}`);
        return undefined;
      }
      const iface = this.lookupInterface(block.fbName, false);
      if (iface === undefined) return undefined;
      // Layout instance DB (§3.5, OQ-125): VAR_INPUT + VAR_OUTPUT +
      // VAR_IN_OUT (tham chiếu — 4 byte nội bộ, không lộ) + VAR(static),
      // theo thứ tự khai báo. IN_OUT chiếm chỗ bằng DInt rồi loại khỏi
      // fields (không lộ ra ngoài: truy cập field IN_OUT → T005).
      const toDecl = (v: IrVar): LayoutFieldDecl => ({
        name: v.name,
        type: v.type,
        ...(v.init !== undefined ? { init: v.init } : {}),
      });
      const decls: LayoutFieldDecl[] = [
        ...iface.input.map(toDecl),
        ...iface.output.map(toDecl),
        ...iface.inout.map((v): LayoutFieldDecl => ({ name: v.name, type: 'DInt' })),
        ...iface.static.map(toDecl),
      ];
      let laid: { fields: IrField[]; size: number };
      try {
        laid = layoutIrFields(decls);
      } catch (e) {
        this.err(
          'SCL-T005',
          block.loc,
          `không tính được layout DB '${block.name}': ${e instanceof Error ? e.message : 'lỗi layout'}`,
        );
        return undefined;
      }
      const inoutNames = new Set(iface.inout.map((v) => v.name.toLowerCase()));
      const fields = laid.fields.filter((f) => !inoutNames.has(f.name.toLowerCase()));
      const db: IrDb = { id: block.name, name: block.name, fbName: fb.name, fields, size: laid.size };
      this.dbs.set(key, db);
      return db;
    }
    const fields = block.fields ?? [];
    const decls: LayoutFieldDecl[] = [];
    const seen = new Set<string>();
    for (const field of fields) {
      const lower = field.name.toLowerCase();
      if (seen.has(lower)) {
        this.err('SCL-T009', nameLoc(field), `tên đã khai báo: ${field.name}`);
        continue;
      }
      seen.add(lower);
      const resolved = this.resolveTypeNode(field.type, EMPTY_SYMBOLS);
      if (resolved === undefined) continue;
      if (resolved.fbType !== undefined) {
        this.err('SCL-T001', field.type.loc, 'DB STRUCT không chứa được instance FB');
        continue;
      }
      const decl: LayoutFieldDecl = { name: field.name, type: resolved.type };
      decls.push(decl);
      if (field.init !== undefined) {
        const r = evalConst(field.init, EMPTY_SYMBOLS);
        if ('error' in r) {
          this.err('SCL-T008', field.init.loc, `giá trị khởi tạo không hằng: ${r.error}`);
        } else {
          decl.init = r.value;
        }
      }
    }
    let laid: { fields: IrField[]; size: number };
    try {
      laid = layoutIrFields(decls);
    } catch (e) {
      this.err(
        'SCL-T005',
        block.loc,
        `không tính được layout DB '${block.name}': ${e instanceof Error ? e.message : 'lỗi layout'}`,
      );
      return undefined;
    }
    const db: IrDb = { id: block.name, name: block.name, fields: laid.fields, size: laid.size };
    this.dbs.set(key, db);
    this.checkDbInit(block, db);
    return db;
  }

  /** Kiểm tra các gán khởi tạo trong DB (OQ-125): base phải là chính DB,
   * field tồn tại, giá trị hằng + khớp kiểu; trùng field → T009.
   * Giá trị hợp lệ ghi vào IrField.init (lower chỉ copy lại). */
  private checkDbInit(block: DbBlock, db: IrDb): void {
    if (block.init === undefined) return;
    const fieldByName = new Map(db.fields.map((f) => [f.name.toLowerCase(), f]));
    const initialized = new Set<string>();
    for (const assign of block.init) {
      const lv = assign.target;
      if (lv.base.kind !== 'global' || lv.base.name !== block.name) {
        this.err('SCL-T005', lv.loc, `init DB phải gán vào chính "${block.name}"`);
        continue;
      }
      if (lv.path.length === 0) {
        this.err('SCL-T005', lv.loc, `init DB phải gán vào một field của "${block.name}"`);
        continue;
      }
      const first = lv.path[0];
      if (first === undefined || first.kind !== 'member') {
        this.err('SCL-T005', lv.loc, `init DB phải gán vào một field của "${block.name}"`);
        continue;
      }
      const field = fieldByName.get(first.name.toLowerCase());
      if (field === undefined) {
        this.err('SCL-T005', first.loc, `field không tồn tại: ${first.name}`);
        continue;
      }
      if (lv.path.length > 1) {
        this.err('SCL-T005', lv.loc, 'init DB chỉ gán cả field, không gán phần tử/member lồng');
        continue;
      }
      const key = field.name.toLowerCase();
      if (initialized.has(key)) {
        this.err('SCL-T009', first.loc, `field đã khởi tạo: ${field.name}`);
        continue;
      }
      initialized.add(key);
      const value = evalConst(assign.value, EMPTY_SYMBOLS);
      if ('error' in value) {
        this.err('SCL-T008', assign.value.loc, `giá trị init DB không hằng: ${value.error}`);
        continue;
      }
      const vt = this.inferConstType(assign.value);
      if (vt !== undefined) {
        const problem = this.assignProblem(field.type, vt);
        if (problem !== undefined) {
          this.err(problem.code, assign.value.loc, problem.message);
          continue;
        }
        if (typeof value.value === 'number' && typeof field.type === 'string') {
          if (!constFitsRange(value.value, field.type)) {
            this.err(
              'SCL-T002',
              assign.value.loc,
              `giá trị ${String(value.value)} ngoài khoảng kiểu ${field.type}`,
            );
            continue;
          }
        }
      }
      field.init = value.value;
    }
  }

  /** Kiểu của một biểu thức hằng (để kiểm gán init DB): literal + phép
   * tính trên hằng. undefined = không suy được (lỗi đã báo ở evalConst). */
  private inferConstType(expr: SclExpr): IrType | undefined {
    switch (expr.kind) {
      case 'literal': {
        const lit = expr.literal;
        if (lit.type !== undefined) {
          const canon = CANONICAL_ELEM[lit.type.toLowerCase()];
          if (canon !== undefined) return canon;
        }
        if (lit.kind === 'int') return 'Int';
        if (lit.kind === 'real') return 'Real';
        if (lit.kind === 'bool') return 'Bool';
        return 'Time';
      }
      case 'unary': {
        const inner = this.inferConstType(expr.operand);
        if (inner === undefined) return undefined;
        return unaryResultType(expr.op, inner);
      }
      case 'binary': {
        const lt = this.inferConstType(expr.left);
        const rt = this.inferConstType(expr.right);
        if (lt === undefined || rt === undefined) return undefined;
        return binaryResultType(expr.op, lt, rt);
      }
      default:
        return undefined;
    }
  }

  /**
   * Vấn đề khi gán giá trị kiểu `from` vào đích kiểu `to`:
   * undefined = OK (bằng nhau hoặc widening); ngược lại mã + thông điệp.
   * T010 = thu hẹp trong họ hoặc chéo họ số/bit-string (có hàm X_TO_Y);
   * T002 = không liên quan (Bool↔Int, Time↔Int, struct/array sai).
   */
  private assignProblem(to: IrType, from: IrType): { code: 'SCL-T002' | 'SCL-T010'; message: string } | undefined {
    if (irTypeEquals(to, from)) return undefined;
    if (typeof to === 'string' && typeof from === 'string' && widen(from, to)) return undefined;
    if (
      typeof to === 'string' &&
      typeof from === 'string' &&
      CONVERTIBLE.has(to) &&
      CONVERTIBLE.has(from)
    ) {
      return {
        code: 'SCL-T010',
        message: `thu hẹp ngầm định: ${from} → ${to} (dùng ${from.toUpperCase()}_TO_${to.toUpperCase()}(...))`,
      };
    }
    return {
      code: 'SCL-T002',
      message: `kiểu không khớp: ${irTypeName(from)} không gán được cho ${irTypeName(to)}`,
    };
  }

  // ---------------------------------------------------------- lvalue / expr

  private absType(width: 1 | 8 | 16 | 32): PrimitiveType {
    switch (width) {
      case 1:
        return 'Bool';
      case 8:
        return 'Byte';
      case 16:
        return 'Int';
      case 32:
        return 'DInt';
    }
  }

  /** Phân giải một lvalue → kiểu + thông tin symbol (để kiểm tra gán).
   * `isRead` = false khi là đích gán (không cảnh báo W001, không đọc). */
  private resolveLValue(
    lv: SclLValue,
    scope: BlockSymbols,
    assigned: Set<string>,
    isRead: boolean,
  ): LValueInfo | undefined {
    let info: LValueInfo | undefined;
    const base = lv.base;
    const blockKey = this.currentBlock?.name.toLowerCase();
    if (base.kind === 'local') {
      const lower = base.name.toLowerCase();
      // Gán/đọc local tổng hợp = tên FC (OQ-112: giá trị trả của FC).
      if (
        this.currentBlock !== undefined &&
        this.currentBlock.kind === 'FC' &&
        lower === blockKey
      ) {
        const rt = this.fcReturnTypes.get(blockKey);
        if (rt === undefined) {
          this.err('SCL-T001', base.loc, `FC '${base.name}' không có giá trị trả`);
          return undefined;
        }
        if (isRead && !this.suppressW001 && !assigned.has(lower)) {
          this.err('SCL-W001', base.loc, `đọc TEMP '${base.name}' trước khi ghi`);
        }
        info = { type: rt, isFcReturn: true };
      } else {
        const sym = scope.vars.get(lower);
        if (sym === undefined) {
          this.err('SCL-T001', base.loc, `tên chưa khai báo: #${base.name}`);
          return undefined;
        }
        if (this.broken.has(`${blockKey ?? ''}::${lower}`)) return undefined;
        if (isRead && !this.suppressW001 && sym.section === 'temp' && !assigned.has(lower)) {
          this.err('SCL-W001', base.loc, `đọc TEMP '${base.name}' trước khi ghi`);
        }
        const result: LValueInfo = { type: sym.type, symbol: sym };
        if (sym.section === 'const') {
          result.isConst = true;
          if (sym.init !== undefined) result.constValue = sym.init;
        }
        info = result;
      }
    } else if (base.kind === 'global') {
      if (
        this.currentBlock !== undefined &&
        this.currentBlock.kind === 'FC' &&
        base.name.toLowerCase() === blockKey
      ) {
        const rt = this.fcReturnTypes.get(blockKey);
        if (rt === undefined) {
          this.err('SCL-T001', base.loc, `FC '${base.name}' không có giá trị trả`);
          return undefined;
        }
        if (isRead && !this.suppressW001 && !assigned.has(base.name.toLowerCase())) {
          this.err('SCL-W001', base.loc, `đọc TEMP '${base.name}' trước khi ghi`);
        }
        info = { type: rt, isFcReturn: true };
      } else {
        const db = this.findDb(base.name, false);
        if (db !== undefined) {
          info = { type: { kind: 'struct', name: db.name, fields: db.fields } };
        } else {
          const block = this.findBlock(base.name, false);
          if (block !== undefined && block.kind === 'FB') {
            this.err('SCL-T004', base.loc, `FB '${base.name}' chỉ dùng làm instance (#fb hoặc "DB"), không phải giá trị`);
            return undefined;
          }
          if (block !== undefined && (block.kind === 'FC' || block.kind === 'OB')) {
            this.err('SCL-T004', base.loc, `'${base.name}' phải gọi dạng "${base.name}"(...)`);
            return undefined;
          }
          this.err('SCL-T001', base.loc, `tên chưa khai báo: "${base.name}"`);
          return undefined;
        }
      }
    } else {
      info = { type: this.absType(base.address.width) };
    }
    let current = info.type;
    for (const elem of lv.path) {
      if (elem.kind === 'member') {
        if (typeof current !== 'string' && current.kind === 'struct') {
          const field = current.fields.find((f) => f.name.toLowerCase() === elem.name.toLowerCase());
          if (field === undefined) {
            this.err('SCL-T005', elem.loc, `không có field '${elem.name}'`);
            return undefined;
          }
          if (field.hidden === true) {
            // Field nội bộ của system block (OQ-163): có trong layout
            // nhưng không truy cập được từ SCL, ở mọi cấp (kể cả lồng).
            this.err(
              'SCL-T005',
              elem.loc,
              `field '${elem.name}' là trường nội bộ của system block, không truy cập được từ SCL`,
            );
            return undefined;
          }
          current = field.type;
        } else if (typeof current !== 'string') {
          this.err('SCL-T005', elem.loc, `mảng không có member '${elem.name}'`);
          return undefined;
        } else {
          this.err('SCL-T005', elem.loc, `${irTypeName(current)} không có field '${elem.name}'`);
          return undefined;
        }
      } else {
        if (typeof current !== 'string' && current.kind === 'array') {
          const idxType = this.checkExpr(elem.index, scope, assigned);
          if (idxType === undefined) return undefined;
          if (typeof idxType !== 'string' || !isStrictInteger(idxType)) {
            this.err('SCL-T005', elem.index.loc, 'chỉ số mảng phải là số nguyên');
            return undefined;
          }
          const idx = evalConst(elem.index, scope);
          if (!('error' in idx) && typeof idx.value === 'number') {
            if (idx.value < current.lo || idx.value > current.hi) {
              this.err(
                'SCL-T005',
                elem.index.loc,
                `chỉ số ${String(idx.value)} ngoài [${String(current.lo)}..${String(current.hi)}]`,
              );
              return undefined;
            }
          }
          current = current.elem;
        } else {
          this.err('SCL-T005', elem.index.loc, `${irTypeName(current)} không phải mảng`);
          return undefined;
        }
      }
    }
    const out: LValueInfo = { ...info, type: current };
    this.types.set(lv, current);
    return out;
  }

  /** Kiểu của literal (typed literal lấy kiểu đã ghi; int mặc định Int). */
  private literalType(lit: SclLiteral): IrType | undefined {
    if (lit.type !== undefined) {
      const canon = CANONICAL_ELEM[lit.type.toLowerCase()];
      if (canon === undefined) {
        this.err('SCL-T002', lit.loc, 'kiểu String không hỗ trợ ở M1');
        return undefined;
      }
      return canon;
    }
    switch (lit.kind) {
      case 'int':
        return 'Int';
      case 'real':
        return 'Real';
      case 'bool':
        return 'Bool';
      case 'time':
        return 'Time';
    }
  }

  private checkExpr(expr: SclExpr, scope: BlockSymbols, assigned: Set<string>): IrType | undefined {
    switch (expr.kind) {
      case 'literal': {
        const t = this.literalType(expr.literal);
        if (t === undefined) return undefined;
        this.types.set(expr, t);
        return t;
      }
      case 'ref': {
        const info = this.resolveLValue(expr.ref, scope, assigned, true);
        if (info === undefined) return undefined;
        this.types.set(expr, info.type);
        return info.type;
      }
      case 'unary': {
        const t = this.checkExpr(expr.operand, scope, assigned);
        if (t === undefined) return undefined;
        const r = unaryResult(expr.op, t);
        if ('code' in r) {
          this.err(r.code, expr.loc, `${expr.op} không áp dụng cho ${irTypeName(t)}`);
          return undefined;
        }
        this.types.set(expr, r.type);
        return r.type;
      }
      case 'binary': {
        const lt = this.checkExpr(expr.left, scope, assigned);
        const rt = this.checkExpr(expr.right, scope, assigned);
        if (lt === undefined || rt === undefined) return undefined;
        const r = binaryResult(expr.op, lt, rt);
        if ('code' in r) {
          this.err(
            r.code,
            expr.loc,
            r.code === 'SCL-T002'
              ? `kiểu không khớp: ${irTypeName(lt)} ${expr.op} ${irTypeName(rt)}`
              : `'${expr.op}' không áp dụng cho ${irTypeName(lt)} và ${irTypeName(rt)}`,
          );
          return undefined;
        }
        this.types.set(expr, r.type);
        return r.type;
      }
      case 'call':
        return this.checkCallExpr(expr, scope, assigned);
    }
  }

  // ---------------------------------------------------------- call

  /** Ghi cạnh call graph — tới block trong file này hoặc trong ctx (OQ-122:
   * call graph gồm call trong unit biên dịch + ctx.blocks). */
  private recordEdge(to: string, loc: SrcLoc): void {
    const from = this.currentBlock?.name.toLowerCase();
    if (from === undefined) return;
    if (this.blockByName.has(to) || this.ctx.blocks.has(to)) {
      this.callEdges.push({ from, to, loc });
    }
  }

  private checkCallExpr(expr: CallExpr, scope: BlockSymbols, assigned: Set<string>): IrType | undefined {
    const callee = expr.callee;
    if (callee.kind === 'abs') {
      this.err('SCL-T004', callee.loc, 'không gọi được địa chỉ tuyệt đối trong biểu thức');
      return undefined;
    }
    const name = callee.name;
    const isIdent = callee.kind === 'ident';
    const intrinsic = classifyIntrinsic(name);
    if (intrinsic !== undefined) {
      const t = this.checkIntrinsicCall(name, intrinsic, expr.args, expr.loc, scope, assigned);
      // Ghi types map như nhánh FC dưới đây — lower tra cứu kiểu của chính
      // call expr (lowerIntrinsicCall gọi typeOf(expr)); thiếu là lỗi nội bộ.
      if (t !== undefined) this.types.set(expr, t);
      return t;
    }
    const block = this.findBlock(name, isIdent);
    if (block === undefined) {
      if (SYSTEM_FB_NAMES.has(name.toUpperCase())) {
        // System block trong biểu thức → T004 (statement-only, OQ-175).
        this.err(
          'SCL-T004',
          callee.loc,
          `system block '${name}' chỉ gọi được dạng statement với instance (#tOn hoặc "DB")`,
        );
      } else {
        this.err('SCL-T001', callee.loc, `tên chưa khai báo: ${isIdent ? name : `"${name}"`}`);
      }
      return undefined;
    }
    if (block.kind === 'FC') {
      const iface = this.lookupInterface(name, isIdent);
      if (iface === undefined) return undefined;
      const rt = 'returnType' in block ? this.fcReturnTypes.get(block.name.toLowerCase()) : undefined;
      const ctxRt = 'interface' in block ? block.interface.returnType : undefined;
      const returnType = rt ?? ctxRt;
      if (returnType === undefined) {
        this.err('SCL-T004', callee.loc, `FC '${block.name}' không trả giá trị`);
        return undefined;
      }
      this.checkCallArgs(
        { kind: 'FC', name: block.name, iface, returnType },
        expr.args,
        { isExpr: true, calleeLoc: callee.loc },
        scope,
        assigned,
      );
      this.recordEdge(block.name.toLowerCase(), callee.loc);
      this.types.set(expr, returnType);
      return returnType;
    }
    if (block.kind === 'FB') {
      this.err('SCL-T004', callee.loc, `FB '${block.name}' cần instance — không dùng trong biểu thức`);
      return undefined;
    }
    if (block.kind === 'OB') {
      this.err('SCL-T004', callee.loc, `OB '${block.name}' không gọi được trong biểu thức`);
      return undefined;
    }
    this.err('SCL-T004', callee.loc, `'${block.name}' không phải hàm`);
    return undefined;
  }

  /** Kiểm tra gọi intrinsic trong biểu thức; trả kiểu kết quả. */
  private checkIntrinsicCall(
    name: string,
    info: IntrinsicInfo,
    args: SclCallArg[],
    callLoc: SrcLoc,
    scope: BlockSymbols,
    assigned: Set<string>,
  ): IrType | undefined {
    if (info.kind === 'convert') {
      if (args.length !== 1 || args[0] === undefined || args[0].kind !== 'positional') {
        this.err('SCL-T004', callLoc, `hàm '${name}' nhận đúng 1 tham số vị trí`);
        return undefined;
      }
      const arg = args[0];
      const at = this.checkExpr(arg.value, scope, assigned);
      if (at === undefined) return undefined;
      if (typeof at !== 'string' || at !== info.from) {
        this.err('SCL-T002', arg.value.loc, `hàm '${name}' cần ${info.from}, nhận ${irTypeName(at)}`);
        return undefined;
      }
      return info.to;
    }
    if (info.kind === 'roundConvert') {
      if (args.length !== 1 || args[0] === undefined || args[0].kind !== 'positional') {
        this.err('SCL-T004', callLoc, `hàm '${name}' nhận đúng 1 tham số vị trí`);
        return undefined;
      }
      const arg = args[0];
      const at = this.checkExpr(arg.value, scope, assigned);
      if (at === undefined) return undefined;
      if (at !== 'Real' && at !== 'LReal') {
        this.err('SCL-T003', arg.value.loc, `hàm '${name}' chỉ dùng cho Real/LReal`);
        return undefined;
      }
      return 'DInt';
    }
    const fn = info.fn;
    const positional = args.filter((a) => a.kind === 'positional');
    if (positional.length !== args.length) {
      this.err('SCL-T004', callLoc, `intrinsic '${fn}' chỉ nhận tham số vị trí`);
      return undefined;
    }
    const argTypes: (IrType | undefined)[] = positional.map((a) =>
      this.checkExpr(a.value, scope, assigned),
    );
    if (argTypes.some((t) => t === undefined)) return undefined;
    const typed = argTypes as IrType[];
    const need = (n: number): boolean => {
      if (typed.length !== n) {
        this.err('SCL-T004', callLoc, `hàm '${fn}' nhận đúng ${String(n)} tham số, nhận ${String(typed.length)}`);
        return false;
      }
      return true;
    };
    switch (fn) {
      case 'ABS': {
        if (!need(1)) return undefined;
        const t = typed[0];
        if (t === undefined || typeof t !== 'string' || !isNumeric(t)) {
          this.err('SCL-T003', callLoc, `ABS chỉ dùng cho số nguyên/số thực`);
          return undefined;
        }
        return t;
      }
      case 'SQRT': {
        if (!need(1)) return undefined;
        const t = typed[0];
        if (t === undefined || typeof t !== 'string' || !isNumeric(t)) {
          this.err('SCL-T003', callLoc, 'SQRT chỉ dùng cho số nguyên/số thực');
          return undefined;
        }
        return t === 'LReal' ? 'LReal' : 'Real';
      }
      case 'CEIL':
      case 'FLOOR': {
        if (!need(1)) return undefined;
        const t = typed[0];
        if (t !== 'Real' && t !== 'LReal') {
          this.err('SCL-T003', callLoc, `hàm '${fn}' chỉ dùng cho Real/LReal`);
          return undefined;
        }
        return 'DInt';
      }
      case 'MIN':
      case 'MAX': {
        if (typed.length < 2) {
          this.err('SCL-T004', callLoc, `hàm '${fn}' nhận ít nhất 2 tham số`);
          return undefined;
        }
        return this.commonNumeric(typed, fn, callLoc);
      }
      case 'LIMIT': {
        if (!need(3)) return undefined;
        return this.commonNumeric(typed, fn, callLoc);
      }
      case 'SHL':
      case 'SHR':
      case 'ROL':
      case 'ROR': {
        if (!need(2)) return undefined;
        const v = typed[0];
        const n = typed[1];
        if (
          v === undefined ||
          typeof v !== 'string' ||
          (!isStrictInteger(v) && !isBitStringType(v)) ||
          n === undefined ||
          typeof n !== 'string' ||
          !isStrictInteger(n)
        ) {
          this.err('SCL-T003', callLoc, `hàm '${fn}' cần (số nguyên/bit-string, số nguyên)`);
          return undefined;
        }
        return v;
      }
      case 'NORM_X':
      case 'SCALE_X': {
        if (!need(3)) return undefined;
        for (const t of typed) {
          if (typeof t !== 'string' || !isNumeric(t)) {
            this.err('SCL-T003', callLoc, `hàm '${fn}' chỉ dùng cho số`);
            return undefined;
          }
        }
        return typed.includes('LReal') ? 'LReal' : 'Real';
      }
      default:
        return undefined;
    }
  }

  /** Kiểu chung của các đối số số (MIN/MAX/LIMIT); lỗi → T002/T003. */
  private commonNumeric(types: IrType[], fn: string, loc: SrcLoc): IrType | undefined {
    let acc: IrType | undefined;
    for (const t of types) {
      if (typeof t !== 'string' || (!isNumeric(t) && t !== 'Time')) {
        this.err('SCL-T003', loc, `hàm '${fn}' chỉ dùng cho số`);
        return undefined;
      }
      if (acc === undefined) {
        acc = t;
      } else {
        const common = commonType(acc, t);
        if (common === undefined) {
          this.err('SCL-T002', loc, `hàm '${fn}': ${irTypeName(acc)} và ${irTypeName(t)} không cùng họ`);
          return undefined;
        }
        acc = common;
      }
    }
    return acc;
  }

  /** Kiểm tra tham số của một call FC/FB (cả dạng biểu thức lẫn statement).
   * `opts.isExpr` = true khi gọi trong biểu thức (FC: namedOut → T004). */
  private checkCallArgs(
    target: CallTargetInfo,
    args: SclCallArg[],
    opts: { isExpr: boolean; calleeLoc: SrcLoc },
    scope: BlockSymbols,
    assigned: Set<string>,
  ): void {
    const params = new Map<string, { section: Section; type: IrType; hasInit: boolean; order: number }>();
    const ordered: { name: string; section: Section; type: IrType; hasInit: boolean }[] = [];
    const collect = (section: Section, vars: IrVar[]): void => {
      for (const v of vars) {
        params.set(v.name.toLowerCase(), { section, type: v.type, hasInit: v.init !== undefined, order: ordered.length });
        ordered.push({ name: v.name, section, type: v.type, hasInit: v.init !== undefined });
      }
    };
    collect('input', target.iface.input);
    collect('inout', target.iface.inout);
    collect('output', target.iface.output);
    const provided = new Set<string>();
    const positionalParams = ordered.filter((p) => p.section === 'input' || p.section === 'inout');
    let positionalIdx = 0;
    for (const arg of args) {
      if (arg.kind === 'positional') {
        if (target.kind === 'FB') {
          this.err('SCL-T004', arg.loc, 'FB phải dùng tham số đặt tên');
          // Đã cung cấp giá trị (sai hình thức, không phải thiếu) — đánh dấu
          // để kiểm "thiếu tham số bắt buộc" sau vòng lặp không báo thêm lỗi giả.
          const paramForMissing = positionalParams[positionalIdx];
          positionalIdx += 1;
          if (paramForMissing !== undefined) provided.add(paramForMissing.name.toLowerCase());
          continue;
        }
        const param = positionalParams[positionalIdx];
        positionalIdx += 1;
        if (param === undefined) {
          this.err('SCL-T004', arg.loc, 'tham số thừa');
          continue;
        }
        // FC IN_OUT chưa hỗ trợ ở P1.3: IR callFc/callFcExpr không có slot
        // inout (OQ-128) — hạ thành load sẽ mất ghi lại, nên từ chối ồn ào.
        // (Tới đây target.kind đã là 'FC' — FB positional bị chặn ở trên.)
        if (param.section === 'inout') {
          this.err('SCL-T004', arg.loc, `tham số IN_OUT '${param.name}' của FC chưa hỗ trợ ở P1.3 (OQ-128)`);
          provided.add(param.name.toLowerCase());
          continue;
        }
        provided.add(param.name.toLowerCase());
        this.checkCallValueArg(param, arg.value, scope, assigned);
        continue;
      }
      if (arg.kind === 'named') {
        const param = params.get(arg.name.toLowerCase());
        if (param === undefined) {
          this.err('SCL-T004', arg.loc, `tham số không tồn tại: ${arg.name}`);
          continue;
        }
        if (provided.has(arg.name.toLowerCase())) {
          this.err('SCL-T004', arg.loc, `tham số trùng: ${arg.name}`);
          continue;
        }
        // FC IN_OUT chưa hỗ trợ ở P1.3 (OQ-128 — xem nhánh positional).
        if (target.kind === 'FC' && param.section === 'inout') {
          this.err('SCL-T004', arg.loc, `tham số IN_OUT '${arg.name}' của FC chưa hỗ trợ ở P1.3 (OQ-128)`);
          provided.add(arg.name.toLowerCase());
          continue;
        }
        provided.add(arg.name.toLowerCase());
        if (param.section === 'output') {
          this.err('SCL-T004', arg.loc, `tham số OUT '${arg.name}' dùng '=>' (Q => #var)`);
          continue;
        }
        this.checkCallValueArg(param, arg.value, scope, assigned);
        continue;
      }
      // namedOut (Q => #var)
      if (target.kind === 'FC' && arg.name.toLowerCase() === 'q' && !opts.isExpr) {
        if (target.returnType === undefined) {
          this.err('SCL-T004', arg.loc, `FC '${target.name}' không trả giá trị`);
          continue;
        }
        provided.add('__ret__');
        this.checkCallOutArg(target.returnType, arg.target, scope, assigned);
        continue;
      }
      if (opts.isExpr) {
        this.err('SCL-T004', arg.loc, 'FC trong biểu thức không nhận tham số OUT');
        continue;
      }
      const param = params.get(arg.name.toLowerCase());
      if (param === undefined) {
        this.err('SCL-T004', arg.loc, `tham số không tồn tại: ${arg.name}`);
        continue;
      }
      if (provided.has(arg.name.toLowerCase())) {
        this.err('SCL-T004', arg.loc, `tham số trùng: ${arg.name}`);
        continue;
      }
      provided.add(arg.name.toLowerCase());
      if (param.section === 'input') {
        this.err('SCL-T004', arg.loc, `tham số IN '${arg.name}' dùng ':='`);
        continue;
      }
      if (param.section === 'inout') {
        this.err('SCL-T004', arg.loc, `tham số IN_OUT '${arg.name}' dùng ':='`);
        continue;
      }
      // FC: OUT không có slot trong IR callFc (OQ-127) → từ chối ồn ào.
      if (target.kind === 'FC') {
        this.err('SCL-T004', arg.loc, `tham số OUT '${arg.name}' của FC chưa hỗ trợ ở P1.3 (OQ-127)`);
        continue;
      }
      this.checkCallOutArg(param.type, arg.target, scope, assigned);
    }
    const missing = ordered.filter(
      (p) =>
        (p.section === 'input' && !p.hasInit) || p.section === 'inout',
    ).filter((p) => !provided.has(p.name.toLowerCase()));
    if (missing.length > 0) {
      this.err(
        'SCL-T004',
        opts.calleeLoc,
        `thiếu tham số bắt buộc: ${missing.map((p) => p.name).join(', ')}`,
      );
    }
  }

  /** Kiểm tra giá trị truyền vào tham số IN/IN_OUT (`:=`). */
  private checkCallValueArg(
    param: { section: Section; type: IrType },
    value: SclExpr,
    scope: BlockSymbols,
    assigned: Set<string>,
  ): void {
    if (param.section === 'inout') {
      if (value.kind !== 'ref') {
        this.err('SCL-T004', value.loc, 'tham số IN_OUT phải là biến (lvalue)');
        return;
      }
      const info = this.resolveLValue(value.ref, scope, assigned, true);
      if (info === undefined) return;
      this.types.set(value, info.type);
      const vt = info.type;
      const pt = param.type;
      if (irTypeEquals(vt, pt)) return;
      if (isPrimitive(vt) && isPrimitive(pt) && widen(vt, pt)) {
        this.err('SCL-T010', value.loc, `thu hẹp ngầm định khi ghi lại: ${pt} → ${vt} (dùng ${pt.toUpperCase()}_TO_${vt.toUpperCase()}(...))`);
        return;
      }
      if (isPrimitive(vt) && isPrimitive(pt) && widen(pt, vt)) {
        this.err('SCL-T010', value.loc, `thu hẹp ngầm định khi đọc: ${vt} → ${pt} (dùng ${vt.toUpperCase()}_TO_${pt.toUpperCase()}(...))`);
        return;
      }
      this.err('SCL-T002', value.loc, `kiểu không khớp: ${irTypeName(vt)} không truyền được cho IN_OUT ${irTypeName(pt)}`);
      return;
    }
    const vt = this.checkExpr(value, scope, assigned);
    if (vt === undefined) return;
    const problem = this.assignProblem(param.type, vt);
    if (problem !== undefined) {
      this.err(problem.code, value.loc, problem.message);
      return;
    }
    const c = evalConst(value, scope);
    if (!('error' in c) && typeof c.value === 'number' && typeof param.type === 'string') {
      if (!constFitsRange(c.value, param.type)) {
        this.err('SCL-T002', value.loc, `giá trị ${String(c.value)} ngoài khoảng kiểu ${param.type}`);
      }
    }
  }

  /** Kiểm tra đích của tham số OUT (`=>`): phải gán được + gán được thì
   * đánh dấu đã gán (TEMP tracking). */
  private checkCallOutArg(
    paramType: IrType,
    target: SclLValue,
    scope: BlockSymbols,
    assigned: Set<string>,
  ): void {
    const info = this.resolveLValue(target, scope, assigned, false);
    if (info === undefined) return;
    if (info.symbol !== undefined && (info.symbol.section === 'input' || info.symbol.section === 'const')) {
      this.err('SCL-T006', target.loc, `không được gán vào ${info.symbol.section === 'input' ? 'VAR_INPUT' : 'VAR_CONSTANT'} '${info.symbol.name}'`);
      return;
    }
    const problem = this.assignProblem(info.type, paramType);
    if (problem !== undefined) {
      this.err(problem.code, target.loc, problem.message);
      return;
    }
    if (info.symbol !== undefined && info.symbol.section === 'temp') {
      assigned.add(info.symbol.name.toLowerCase());
    }
    if (info.isFcReturn && this.currentBlock !== undefined) {
      assigned.add(this.currentBlock.name.toLowerCase());
    }
  }

  // ---------------------------------------------------------- statement

  private checkStmts(stmts: SclStmt[], scope: BlockSymbols, assigned: Set<string>, loopDepth: number): void {
    for (const s of stmts) this.checkStmt(s, scope, assigned, loopDepth);
  }

  /** Giao của các tập "đã gán" sau mỗi nhánh (chỉ biến gán ở MỌI nhánh mới
   * chắc chắn đã gán sau IF/CASE). */
  private intersectAssigned(sets: readonly Set<string>[]): Set<string> {
    const out = new Set<string>();
    const first = sets[0];
    if (first === undefined) return out;
    for (const v of first) {
      if (sets.every((s) => s.has(v))) out.add(v);
    }
    return out;
  }

  private markAssigned(lv: SclLValue, info: LValueInfo, assigned: Set<string>): void {
    if (lv.base.kind !== 'local') return;
    if (info.symbol !== undefined && info.symbol.section === 'temp') {
      assigned.add(info.symbol.name.toLowerCase());
    }
    if (info.isFcReturn && this.currentBlock !== undefined) {
      assigned.add(this.currentBlock.name.toLowerCase());
    }
  }

  private checkStmt(stmt: SclStmt, scope: BlockSymbols, assigned: Set<string>, loopDepth: number): void {
    switch (stmt.kind) {
      case 'assign': {
        const target = this.resolveLValue(stmt.target, scope, assigned, false);
        const valueType = this.checkExpr(stmt.value, scope, assigned);
        if (target !== undefined) {
          if (
            target.symbol !== undefined &&
            (target.symbol.section === 'input' || target.symbol.section === 'const')
          ) {
            this.err(
              'SCL-T006',
              stmt.target.loc,
              `không được gán vào ${target.symbol.section === 'input' ? 'VAR_INPUT' : 'VAR_CONSTANT'} '${target.symbol.name}'`,
            );
          } else if (valueType !== undefined) {
            const problem = this.assignProblem(target.type, valueType);
            if (problem !== undefined) {
              this.err(problem.code, stmt.value.loc, problem.message);
            } else {
              const c = evalConst(stmt.value, scope);
              if (!('error' in c) && typeof c.value === 'number' && typeof target.type === 'string') {
                if (!constFitsRange(c.value, target.type)) {
                  this.err(
                    'SCL-T002',
                    stmt.value.loc,
                    `giá trị ${String(c.value)} ngoài khoảng kiểu ${target.type}`,
                  );
                }
              }
            }
          }
          this.markAssigned(stmt.target, target, assigned);
        }
        return;
      }
      case 'if': {
        const condType = this.checkExpr(stmt.cond, scope, assigned);
        if (condType !== undefined && condType !== 'Bool') {
          this.err('SCL-T002', stmt.cond.loc, 'điều kiện IF phải là Bool');
        }
        const branchAfters: Set<string>[] = [];
        const thenAfter = new Set(assigned);
        this.checkStmts(stmt.then, scope, thenAfter, loopDepth);
        branchAfters.push(thenAfter);
        for (const branch of stmt.elsif) {
          const b = new Set(assigned);
          const ct = this.checkExpr(branch.cond, scope, b);
          if (ct !== undefined && ct !== 'Bool') {
            this.err('SCL-T002', branch.cond.loc, 'điều kiện ELSIF phải là Bool');
          }
          this.checkStmts(branch.body, scope, b, loopDepth);
          branchAfters.push(b);
        }
        const elseAfter = new Set(assigned);
        if (stmt.else !== undefined) this.checkStmts(stmt.else, scope, elseAfter, loopDepth);
        branchAfters.push(elseAfter);
        for (const v of this.intersectAssigned(branchAfters)) assigned.add(v);
        return;
      }
      case 'case': {
        const selType = this.checkExpr(stmt.sel, scope, assigned);
        if (selType !== undefined && (typeof selType !== 'string' || !isStrictInteger(selType))) {
          this.err('SCL-T002', stmt.sel.loc, 'selector CASE phải là số nguyên');
        }
        // Label: hằng nguyên, không trùng (kể cả trùng trong khoảng).
        const taken: [number, number][] = [];
        for (const arm of stmt.arms) {
          for (const label of arm.labels) {
            if (label.kind === 'range') {
              const lo = evalConst(label.lo, scope);
              const hi = evalConst(label.hi, scope);
              if ('error' in lo) {
                this.err('SCL-T008', label.lo.loc, `label CASE không hằng: ${lo.error}`);
                continue;
              }
              if ('error' in hi) {
                this.err('SCL-T008', label.hi.loc, `label CASE không hằng: ${hi.error}`);
                continue;
              }
              if (typeof lo.value !== 'number' || !Number.isInteger(lo.value) || typeof hi.value !== 'number' || !Number.isInteger(hi.value)) {
                this.err('SCL-T002', label.loc, 'label CASE phải là số nguyên');
                continue;
              }
              const loV = lo.value;
              const hiV = hi.value;
              if (loV > hiV) {
                this.err('SCL-T005', label.loc, `khoảng label [${String(loV)}..${String(hiV)}]: lo > hi`);
                continue;
              }
              if (taken.some(([a, b]) => loV <= b && a <= hiV)) {
                this.err('SCL-T005', label.loc, `label CASE trùng: [${String(loV)}..${String(hiV)}]`);
                continue;
              }
              taken.push([loV, hiV]);
            } else {
              const v = evalConst(label, scope);
              if ('error' in v) {
                this.err('SCL-T008', label.loc, `label CASE không hằng: ${v.error}`);
                continue;
              }
              if (typeof v.value !== 'number' || !Number.isInteger(v.value)) {
                this.err('SCL-T002', label.loc, 'label CASE phải là số nguyên');
                continue;
              }
              const vV = v.value;
              if (taken.some(([a, b]) => vV >= a && vV <= b)) {
                this.err('SCL-T005', label.loc, `label CASE trùng: ${String(vV)}`);
                continue;
              }
              taken.push([vV, vV]);
            }
          }
        }
        const branchAfters: Set<string>[] = [];
        for (const arm of stmt.arms) {
          const b = new Set(assigned);
          this.checkStmts(arm.body, scope, b, loopDepth);
          branchAfters.push(b);
        }
        const elseAfter = new Set(assigned);
        if (stmt.else !== undefined) this.checkStmts(stmt.else, scope, elseAfter, loopDepth);
        branchAfters.push(elseAfter);
        for (const v of this.intersectAssigned(branchAfters)) assigned.add(v);
        return;
      }
      case 'for': {
        const loopVar = stmt.var;
        let varType: IrType | undefined;
        if (loopVar.base.kind !== 'local' || loopVar.path.length > 0) {
          this.err('SCL-T003', loopVar.loc, 'biến vòng lặp FOR phải là local integer đã khai báo');
        } else {
          const info = this.resolveLValue(loopVar, scope, assigned, false);
          if (info !== undefined) {
            varType = info.type;
            if (info.symbol !== undefined && (info.symbol.section === 'input' || info.symbol.section === 'const')) {
              this.err('SCL-T006', loopVar.loc, `không được gán vào ${info.symbol.section === 'input' ? 'VAR_INPUT' : 'VAR_CONSTANT'} '${info.symbol.name}'`);
            } else if (typeof info.type !== 'string' || !isStrictInteger(info.type)) {
              this.err('SCL-T003', loopVar.loc, 'biến vòng lặp FOR phải là số nguyên (SInt/Int/DInt/USInt/UInt/UDInt)');
              varType = undefined;
            }
          }
        }
        const checkBound = (e: SclExpr): void => {
          const t = this.checkExpr(e, scope, assigned);
          if (t === undefined || varType === undefined) return;
          const problem = this.assignProblem(varType, t);
          if (problem !== undefined) this.err(problem.code, e.loc, problem.message);
        };
        checkBound(stmt.from);
        checkBound(stmt.to);
        if (stmt.by !== undefined) checkBound(stmt.by);
        const bodyAssigned = new Set(assigned);
        if (loopVar.base.kind === 'local') bodyAssigned.add(loopVar.base.name.toLowerCase());
        this.checkStmts(stmt.body, scope, bodyAssigned, loopDepth + 1);
        return;
      }
      case 'while': {
        const condType = this.checkExpr(stmt.cond, scope, assigned);
        if (condType !== undefined && condType !== 'Bool') {
          this.err('SCL-T002', stmt.cond.loc, 'điều kiện WHILE phải là Bool');
        }
        const bodyAssigned = new Set(assigned);
        this.checkStmts(stmt.body, scope, bodyAssigned, loopDepth + 1);
        return;
      }
      case 'repeat': {
        const bodyAssigned = new Set(assigned);
        this.checkStmts(stmt.body, scope, bodyAssigned, loopDepth + 1);
        const untilType = this.checkExpr(stmt.until, scope, bodyAssigned);
        if (untilType !== undefined && untilType !== 'Bool') {
          this.err('SCL-T002', stmt.until.loc, 'điều kiện UNTIL phải là Bool');
        }
        return;
      }
      case 'exit': {
        if (loopDepth === 0) this.err('SCL-T007', stmt.loc, 'EXIT chỉ dùng trong vòng lặp');
        return;
      }
      case 'continue': {
        if (loopDepth === 0) this.err('SCL-T007', stmt.loc, 'CONTINUE chỉ dùng trong vòng lặp');
        return;
      }
      case 'return':
        return;
      case 'call': {
        this.checkCallStmt(stmt, scope, assigned);
        return;
      }
      case 'empty':
        return;
    }
  }

  private checkCallStmt(stmt: CallStmt, scope: BlockSymbols, assigned: Set<string>): void {
    const callee = stmt.callee;
    const blockKey = this.currentBlock?.name.toLowerCase();
    if (callee.kind === 'ident') {
      if (
        this.currentBlock !== undefined &&
        this.currentBlock.kind === 'FC' &&
        callee.name.toLowerCase() === blockKey
      ) {
        this.err('SCL-T004', callee.loc, 'không gọi FC bằng tên không có ngoặc kép');
        return;
      }
      this.checkCallStmtIdent(callee.name, callee.loc, stmt.args, scope, assigned);
      return;
    }
    if (callee.kind === 'local') {
      if (
        this.currentBlock !== undefined &&
        this.currentBlock.kind === 'FC' &&
        callee.name.toLowerCase() === blockKey
      ) {
        this.err('SCL-T004', callee.loc, 'không gọi FC bằng #tên');
        return;
      }
      const sym = scope.vars.get(callee.name.toLowerCase());
      if (sym === undefined) {
        this.err('SCL-T001', callee.loc, `tên chưa khai báo: #${callee.name}`);
        return;
      }
      if (this.broken.has(`${blockKey ?? ''}::${callee.name.toLowerCase()}`)) return;
      if (sym.fbType === undefined) {
        this.err('SCL-T004', callee.loc, `#${callee.name} không phải instance FB`);
        return;
      }
      const iface = this.lookupInterface(sym.fbType, true);
      if (iface === undefined) return;
      this.checkCallArgs(
        { kind: 'FB', name: sym.fbType, iface },
        stmt.args,
        { isExpr: false, calleeLoc: callee.loc },
        scope,
        assigned,
      );
      // System block là lá, không đệ quy — `callSys` không có trong call
      // graph (không sinh cạnh S020).
      if (!SYSTEM_FB_NAMES.has(sym.fbType.toUpperCase())) {
        this.recordEdge(sym.fbType.toLowerCase(), callee.loc);
      }
      return;
    }
    if (callee.kind === 'global') {
      if (
        this.currentBlock !== undefined &&
        this.currentBlock.kind === 'FC' &&
        callee.name.toLowerCase() === blockKey
      ) {
        // Gọi chính FC mình dạng statement → cạnh đệ quy.
        const iface = this.lookupInterface(callee.name, false);
        const rt = this.fcReturnTypes.get(blockKey);
        if (iface !== undefined) {
          const target: CallTargetInfo = { kind: 'FC', name: callee.name, iface };
          if (rt !== undefined) target.returnType = rt;
          this.checkCallArgs(target, stmt.args, { isExpr: false, calleeLoc: callee.loc }, scope, assigned);
        }
        this.recordEdge(callee.name.toLowerCase(), callee.loc);
        return;
      }
      const db = this.findDb(callee.name, false);
      if (db !== undefined) {
        if (db.fbName === undefined) {
          this.err('SCL-T004', callee.loc, `DB '${callee.name}' không phải instance FB`);
          return;
        }
        const iface = this.lookupInterface(db.fbName, false);
        if (iface === undefined) return;
        this.checkCallArgs(
          { kind: 'FB', name: db.fbName, iface },
          stmt.args,
          { isExpr: false, calleeLoc: callee.loc },
          scope,
          assigned,
        );
        // System block là lá — `callSys` không có trong call graph.
        if (!SYSTEM_FB_NAMES.has(db.fbName.toUpperCase())) {
          this.recordEdge(db.fbName.toLowerCase(), callee.loc);
        }
        return;
      }
      const block = this.findBlock(callee.name, false);
      if (block === undefined) {
        // Tên std nhưng không có DB cùng tên: lỗi "chưa khai báo" (không
        // phải "chưa hỗ trợ" — std đã hỗ trợ từ P1.5, chỉ thiếu instance DB).
        this.err('SCL-T001', callee.loc, `tên chưa khai báo: "${callee.name}"`);
        return;
      }
      if (block.kind === 'FB') {
        this.err('SCL-T004', callee.loc, `gọi FB cần instance (#fb hoặc "DB")`);
        return;
      }
      if (block.kind === 'FC') {
        const iface = this.lookupInterface(callee.name, false);
        if (iface === undefined) return;
        const rt =
          'interface' in block ? block.interface.returnType : this.fcReturnTypes.get(block.name.toLowerCase());
        const target: CallTargetInfo = { kind: 'FC', name: block.name, iface };
        if (rt !== undefined) target.returnType = rt;
        this.checkCallArgs(target, stmt.args, { isExpr: false, calleeLoc: callee.loc }, scope, assigned);
        this.recordEdge(block.name.toLowerCase(), callee.loc);
        return;
      }
      if (block.kind === 'OB') {
        this.err('SCL-T004', callee.loc, `OB '${block.name}' không gọi được`);
        return;
      }
      this.err('SCL-T004', callee.loc, `'${block.name}' không gọi được dạng statement`);
      return;
    }
    // callee là địa chỉ tuyệt đối → không gọi được.
    this.err('SCL-T004', callee.loc, 'không gọi được địa chỉ tuyệt đối');
  }

  private checkCallStmtIdent(
    name: string,
    loc: SrcLoc,
    args: SclCallArg[],
    scope: BlockSymbols,
    assigned: Set<string>,
  ): void {
    const intrinsic = classifyIntrinsic(name);
    if (intrinsic !== undefined) {
      this.err('SCL-T004', loc, `hàm '${name}' trả giá trị — dùng trong biểu thức, không gọi dạng statement`);
      return;
    }
    if (SYSTEM_FB_NAMES.has(name.toUpperCase())) {
      // Gọi system block không có instance (ident trần) → T004: đây là lỗi
      // dùng sai, không phải "chưa hỗ trợ" (cùng thông điệp như FB thường).
      this.err('SCL-T004', loc, `gọi system block '${name}' cần instance (#tOn hoặc "DB")`);
      return;
    }
    const block = this.findBlock(name, true);
    if (block === undefined) {
      this.err('SCL-T001', loc, `tên chưa khai báo: ${name}`);
      return;
    }
    if (block.kind === 'FC') {
      const iface = this.lookupInterface(name, true);
      if (iface === undefined) return;
      const rt =
        'interface' in block ? block.interface.returnType : this.fcReturnTypes.get(block.name.toLowerCase());
      const target: CallTargetInfo = { kind: 'FC', name: block.name, iface };
      if (rt !== undefined) target.returnType = rt;
      this.checkCallArgs(target, args, { isExpr: false, calleeLoc: loc }, scope, assigned);
      this.recordEdge(block.name.toLowerCase(), loc);
      return;
    }
    if (block.kind === 'FB') {
      this.err('SCL-T004', loc, `gọi FB cần instance (#fb hoặc "DB")`);
      return;
    }
    if (block.kind === 'OB') {
      this.err('SCL-T004', loc, `OB '${block.name}' không gọi được`);
      return;
    }
    this.err('SCL-T004', loc, `'${block.name}' không gọi được dạng statement`);
  }

  // ---------------------------------------------------------- block + đệ quy

  private checkBlockBody(block: ObBlock | FcBlock | FbBlock): void {
    const syms = this.lookupBlockSymbols(block.name.toLowerCase());
    if (syms === undefined) return;
    this.currentBlock = block;
    this.currentSymbols = syms;
    const assigned = new Set<string>();
    this.checkStmts(block.body, syms, assigned, 0);
    this.currentBlock = undefined;
    this.currentSymbols = undefined;
  }

  /** Cạnh call trích từ IR của các block đã biên dịch trước trong ctx.
   * Bỏ qua block cũng có trong file hiện tại — bản trong file mới hơn nên
   * cạnh từ ctx của chính block đó đã cũ (re-compile bỏ call → cạnh cũ phải
   * mất, nếu không sẽ báo đệ quy giả). `callSys` không có trong graph
   * (system block là lá, typecheck không ghi cạnh — xem checkCallStmt). */
  private ctxCallEdges(): CallEdge[] {
    const out: CallEdge[] = [];
    const toLoc = (src: SrcRef | undefined): SrcLoc =>
      src === undefined
        ? { line: 1, col: 1, endLine: 1, endCol: 1, offset: 0, length: 0 }
        : { line: src.line, col: src.col, endLine: src.endLine, endCol: src.endCol, offset: 0, length: 0 };
    const walkLValue = (lv: IrLValue, from: string, loc: SrcLoc, file: string | undefined): void => {
      if (lv.k === 'index') {
        walkLValue(lv.base, from, loc, file);
        walkExpr(lv.index, from, loc, file);
      } else if (lv.k === 'member') {
        walkLValue(lv.base, from, loc, file);
      }
    };
    const walkExpr = (e: IrExpr, from: string, loc: SrcLoc, file: string | undefined): void => {
      switch (e.op) {
        case 'callFcExpr':
          out.push({ from, to: e.block.toLowerCase(), loc, file });
          for (const [, arg] of e.args) walkExpr(arg, from, loc, file);
          return;
        case 'unary':
          walkExpr(e.a, from, loc, file);
          return;
        case 'binary':
          walkExpr(e.a, from, loc, file);
          walkExpr(e.b, from, loc, file);
          return;
        case 'convert':
          walkExpr(e.a, from, loc, file);
          return;
        case 'intrinsic':
          for (const a of e.args) walkExpr(a, from, loc, file);
          return;
        default:
          return;
      }
    };
    const walkStmt = (s: IrStmt, from: string): void => {
      const loc = toLoc(s.src);
      const file = s.src?.file;
      switch (s.op) {
        case 'callFc':
          out.push({ from, to: s.block.toLowerCase(), loc, file });
          for (const [, a] of s.args) walkExpr(a, from, loc, file);
          if (s.ret !== undefined) walkLValue(s.ret, from, loc, file);
          return;
        case 'callFb':
          out.push({ from, to: s.block.toLowerCase(), loc, file });
          for (const [, a] of s.inArgs) walkExpr(a, from, loc, file);
          for (const [, t] of s.outArgs) walkLValue(t, from, loc, file);
          for (const [, t] of s.inoutArgs) walkLValue(t, from, loc, file);
          return;
        case 'assign':
          walkExpr(s.value, from, loc, file);
          walkLValue(s.target, from, loc, file);
          return;
        case 'if':
          walkExpr(s.cond, from, loc, file);
          for (const b of s.then) walkStmt(b, from);
          for (const br of s.elsif) {
            walkExpr(br.cond, from, loc, file);
            for (const b of br.body) walkStmt(b, from);
          }
          for (const b of s.else) walkStmt(b, from);
          return;
        case 'case':
          walkExpr(s.sel, from, loc, file);
          for (const arm of s.arms) for (const b of arm.body) walkStmt(b, from);
          for (const b of s.else) walkStmt(b, from);
          return;
        case 'for':
          walkExpr(s.from, from, loc, file);
          walkExpr(s.to, from, loc, file);
          if (s.by !== undefined) walkExpr(s.by, from, loc, file);
          for (const b of s.body) walkStmt(b, from);
          return;
        case 'while':
          walkExpr(s.cond, from, loc, file);
          for (const b of s.body) walkStmt(b, from);
          return;
        case 'repeat':
          for (const b of s.body) walkStmt(b, from);
          walkExpr(s.until, from, loc, file);
          return;
        default:
          return;
      }
    };
    for (const b of this.ctx.blocks.values()) {
      if (this.blockByName.has(b.name.toLowerCase())) continue;
      const from = b.name.toLowerCase();
      for (const s of b.body) walkStmt(s, from);
    }
    return out;
  }

  /** Phát hiện đệ quy trực tiếp + gián tiếp (SCL-S020) trên call graph
   * unit đang biên dịch + ctx.blocks (OQ-122). Thông điệp dùng tên block gốc
   * (không lowercase): tự gọi → "đệ quy: X gọi chính nó" (bảng C13);
   * chu trình dài → "đệ quy gọi block: A → B → A". */
  private checkRecursion(): void {
    const display = (key: string): string =>
      this.blockByName.get(key)?.name ?? this.ctx.blocks.get(key)?.name ?? key;
    const adj = new Map<string, CallEdge[]>();
    // Cạnh trong unit hiện tại + cạnh từ IR của các block đã nạp trong ctx
    // (OQ-122) — không có hai nửa này thì đệ quy chéo file lọt im lặng.
    for (const e of [...this.callEdges, ...this.ctxCallEdges()]) {
      const list = adj.get(e.from) ?? [];
      list.push(e);
      adj.set(e.from, list);
    }
    const state = new Map<string, 'gray' | 'black'>();
    const stack: string[] = [];
    const emitted = new Set<string>();
    const visit = (node: string): void => {
      state.set(node, 'gray');
      stack.push(node);
      for (const edge of adj.get(node) ?? []) {
        const key = `${edge.from}->${edge.to}`;
        if (state.get(edge.to) === 'gray') {
          if (emitted.has(key)) continue;
          emitted.add(key);
          const idx = stack.indexOf(edge.to);
          const cycleKeys = [...stack.slice(idx), edge.to];
          const message =
            cycleKeys.length === 2 && cycleKeys[0] === cycleKeys[1]
              ? `đệ quy: ${display(edge.to)} gọi chính nó`
              : `đệ quy gọi block: ${cycleKeys.map(display).join(' → ')}`;
          this.err('SCL-S020', edge.loc, message, edge.file);
          continue;
        }
        if (!state.has(edge.to)) visit(edge.to);
      }
      stack.pop();
      state.set(node, 'black');
    };
    for (const node of adj.keys()) {
      if (!state.has(node)) visit(node);
    }
  }

  /** Chạy toàn bộ typecheck theo 5 giai đoạn (UDT → DB → symbols → thân →
   * đệ quy) và trả kết quả + diagnostics đã sắp xếp. */
  run(): TypecheckResult {
    for (const b of this.file.blocks) {
      if (b.kind === 'UDT') this.getUdt(b.name.toLowerCase(), b.loc);
    }
    for (const b of this.file.blocks) {
      if (b.kind === 'DB') this.resolveDb(b);
    }
    for (const b of this.file.blocks) {
      if (b.kind === 'OB' || b.kind === 'FC' || b.kind === 'FB') this.getBlockSymbols(b);
    }
    for (const b of this.file.blocks) {
      if (b.kind === 'OB' || b.kind === 'FC' || b.kind === 'FB') this.checkBlockBody(b);
    }
    this.checkRecursion();
    return {
      diagnostics: sortDiagnostics(this.diags),
      types: this.types,
      blocks: this.blocks,
      udts: this.udts,
      dbs: this.dbs,
      returnTypes: this.fcReturnTypes,
    };
  }
}

/** Chạy typecheck cho một file SCL. `ctx` là bảng tích lũy qua các lần
 * compile cùng chương trình (UDT/DB/block đã biên dịch trước). */
export function typecheckFile(
  file: SclFile,
  fileName: string,
  ctx: CrossFileTables = emptyCrossFileTables(),
): TypecheckResult {
  return new Typechecker(file, fileName, ctx).run();
}

/** Bảng cross-file rỗng (một file độc lập). */
export function emptyCrossFileTables(): CrossFileTables {
  return { udts: new Map(), dbs: new Map(), blocks: new Map() };
}

/** Chuyển SclType → IrType khi không cần tra cứu tên (elementary/array/
 * struct nội tuyến). Kiểu đặt tên (UDT/FB) trả undefined — cần ngữ cảnh
 * typecheck (xem Typechecker.resolveTypeNode). */
export function sclTypeToIrType(type: SclType): IrType | undefined {
  switch (type.kind) {
    case 'elementary': {
      return CANONICAL_ELEM[type.name.toLowerCase()];
    }
    case 'array': {
      const elem = sclTypeToIrType(type.elem);
      if (elem === undefined) return undefined;
      return { kind: 'array', elem, lo: type.lo, hi: type.hi };
    }
    case 'struct': {
      const decls: LayoutFieldDecl[] = [];
      for (const f of type.fields) {
        const ft = sclTypeToIrType(f.type);
        if (ft === undefined) return undefined;
        decls.push({ name: f.name, type: ft });
      }
      try {
        const laid = layoutIrFields(decls);
        return { kind: 'struct', fields: laid.fields };
      } catch {
        return undefined;
      }
    }
    case 'named':
      return undefined;
  }
}

/** Kiểu đích mà lower nên convert tham số vị trí `argIndex` của intrinsic
 * `name` về trước khi gọi (undefined = không cần convert; kiểu đã đúng
 * hoặc intrinsic chấp nhận nhiều kiểu và tự xử lý ở runtime).
 * NORM_X/SCALE_X: đích cơ sở 'Real' — lower nâng lên 'LReal' nếu có đối
 * số nào là LReal (kết quả intrinsic cũng vậy, xem checkIntrinsicCall). */
export function intrinsicArgTarget(name: string, argIndex: number): IrType | undefined {
  const info = classifyIntrinsic(name);
  if (info === undefined) return undefined;
  if (info.kind === 'intrinsic' && (info.fn === 'NORM_X' || info.fn === 'SCALE_X')) {
    if (argIndex >= 0 && argIndex <= 2) return 'Real';
  }
  return undefined;
}

/** Tên hiển thị ngắn của IrType (cho thông điệp lỗi). */
function irTypeName(t: IrType): string {
  if (typeof t === 'string') return t;
  if (t.kind === 'array') return `Array[${String(t.lo)}..${String(t.hi)}] of ${irTypeName(t.elem)}`;
  return t.name ?? 'Struct';
}


/** Đánh giá các init của field struct nội tuyến đang chờ (sau khi const của
 * block đã tính xong) và gắn vào IrField tương ứng (theo tên). */
function flushPendingStructInits(
  pending: PendingStructInit[],
  scope: BlockSymbols,
  err: (code: string, loc: SrcLoc, message: string) => void,
): void {
  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i];
    if (p === undefined || p.scope !== scope) continue;
    pending.splice(i, 1);
    const r = evalConst(p.init, scope);
    if ('error' in r) {
      err('SCL-T008', p.init.loc, `giá trị khởi tạo không hằng: ${r.error}`);
      continue;
    }
    const field = p.fields?.find((f) => f.name.toLowerCase() === p.fieldName.toLowerCase());
    if (field !== undefined) field.init = r.value;
  }
}

/** IrInterface từ BlockSymbols (dùng cho lookup chéo file). */
export function interfaceFromSymbols(syms: BlockSymbols): IrInterface {
  const pick = (section: Section): IrVar[] => {
    const out: IrVar[] = [];
    for (const sym of syms.vars.values()) {
      if (sym.section !== section) continue;
      const v: IrVar = { name: sym.name, type: sym.type };
      if (sym.init !== undefined) v.init = sym.init;
      out.push(v);
    }
    return out;
  };
  return {
    input: pick('input'),
    output: pick('output'),
    inout: pick('inout'),
    static: pick('static'),
    temp: pick('temp'),
  };
}
