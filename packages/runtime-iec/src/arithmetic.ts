// Quy tắc số học M1 §7.2 — @vcs/runtime-iec (P1.4).
// Hàm thuần, không trạng thái; test trực tiếp không cần SoftPlc.
// Mọi quy tắc có dòng tương ứng trong `docs/semantics.md` §15.

import type { PrimitiveType } from './ir.js';

/** Wrap hai-bù 16-bit: 32767 + 1 → −32768. */
export function wrapInt16(x: number): number {
  return ((x + 32768) & 0xffff) - 32768;
}

/** Wrap hai-bù 32-bit. */
export function wrapInt32(x: number): number {
  return x | 0;
}

/** Wrap không dấu: 8/16-bit bằng mask, 32-bit bằng `>>> 0`. */
export function wrapUnsigned(bits: 8 | 16 | 32, x: number): number {
  if (bits === 32) return x >>> 0;
  return x & ((1 << bits) - 1);
}

/** Làm tròn về số chẵn gần nhất (banker's): 2.5→2, 3.5→4, −2.5→−2, −3.5→−4. */
export function roundHalfEven(x: number): number {
  if (!Number.isFinite(x)) return x;
  const r = Math.round(x);
  if (Math.abs(x - Math.trunc(x)) !== 0.5) return r;
  // .5: Math.round đã làm tròn về phía +∞ (r = n+1 với x = n+0.5); nếu r
  // lẻ thì số chẵn gần nhất là r−1 (vd 2.5→2, −3.5→−4).
  return r % 2 === 0 ? r : r - 1;
}

/** Khoảng giá trị của kiểu đích (OQ-150 — kiểm theo kiểu đích). */
const INT_RANGES: Readonly<Record<string, { min: number; max: number }>> = {
  SInt: { min: -128, max: 127 },
  USInt: { min: 0, max: 255 },
  Byte: { min: 0, max: 255 },
  Int: { min: -32768, max: 32767 },
  UInt: { min: 0, max: 65535 },
  Word: { min: 0, max: 65535 },
  DInt: { min: -2147483648, max: 2147483647 },
  UDInt: { min: 0, max: 4294967295 },
  DWord: { min: 0, max: 4294967295 },
  Time: { min: 0, max: Number.POSITIVE_INFINITY },
};

function isIntTarget(type: PrimitiveType): boolean {
  return INT_RANGES[type] !== undefined;
}

/** Khoảng giá trị của kiểu nguyên (undefined với Bool/Real/LReal). */
export function intRange(type: PrimitiveType): { min: number; max: number } | undefined {
  return INT_RANGES[type];
}

/**
 * Chuyển kiểu có kiểm khoảng (OQ-150): ngoài khoảng hoặc NaN → 0 +
 * `CONV_RANGE`. Real→Int dùng `mode` (`round` = banker's, `trunc` = cắt về
 * 0); Int→Int hẹp cũng kiểm khoảng (không wrap im lặng — khác với tràn
 * trong phép tính, xem `intBinary`); Bool↔số: true→1, khác 0→true.
 */
export function convertChecked(
  from: PrimitiveType,
  to: PrimitiveType,
  value: number | boolean,
  mode: 'round' | 'trunc' = 'round',
): { value: number | boolean; fault?: 'CONV_RANGE' } {
  if (to === 'Bool') {
    if (typeof value === 'boolean') return { value };
    return { value: value !== 0 && !Number.isNaN(value) };
  }
  const n = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  if (to === 'Real') return { value: Math.fround(n) };
  if (to === 'LReal') return { value: n };
  if (!isIntTarget(to)) {
    throw new Error(`convertChecked: kiểu đích '${to}' không phải số`);
  }
  const range = INT_RANGES[to] as { min: number; max: number };
  const fromFloat = from === 'Real' || from === 'LReal';
  const m = fromFloat ? (mode === 'trunc' ? Math.trunc(n) : roundHalfEven(n)) : n;
  if (!Number.isFinite(m) || m < range.min || m > range.max) {
    return { value: 0, fault: 'CONV_RANGE' };
  }
  return { value: wrapToInt(to, m) };
}

/** Ép một số về đúng khoảng/kiểu đích (không fault — chỉ dùng khi giá trị
 * đã biết vừa khoảng, vd kết quả phép tính nguyên). */
export function wrapToInt(type: PrimitiveType, x: number): number {
  switch (type) {
    case 'SInt':
      return ((x + 128) & 0xff) - 128;
    case 'USInt':
    case 'Byte':
      return x & 0xff;
    case 'Int':
      return wrapInt16(x);
    case 'UInt':
    case 'Word':
      return x & 0xffff;
    case 'DInt':
    case 'Time':
      return x | 0;
    case 'UDInt':
    case 'DWord':
      return x >>> 0;
    default:
      throw new Error(`wrapToInt: kiểu '${type}' không phải số nguyên`);
  }
}

/** Chuẩn hóa một giá trị scalar về kiểu khai báo (dùng trước khi ghi vào
 * frame/bộ nhớ): số nguyên wrap theo kiểu, Real fround, Bool ép boolean. */
export function normalizeScalar(type: PrimitiveType, value: number | boolean): number | boolean {
  if (type === 'Bool') {
    if (typeof value === 'boolean') return value;
    return value !== 0 && !Number.isNaN(value);
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (type === 'Real') return Math.fround(value);
  if (type === 'LReal') return value;
  return wrapToInt(type, value);
}

function wrapIntResult(
  type: PrimitiveType,
  r: number,
): { value: number; ov?: boolean } {
  if (type === 'Int') {
    const v = wrapInt16(r);
    return v === r ? { value: v } : { value: v, ov: true };
  }
  return { value: wrapToInt(type, r) };
}

/**
 * Phép tính nguyên (M1 §7.2): cộng/trừ/nhân tràn → wrap (chỉ `Int` đặt cờ
 * `ov`); chia/mod cho 0 → 0 + `DIV_ZERO` (OQ-133 — MOD cũng vậy); chia cắt
 * về 0, MOD mang dấu số bị chia. Real không qua đây (interpreter tính
 * float riêng, chia 0 → IEEE).
 */
export function intBinary(
  fn: 'add' | 'sub' | 'mul' | 'div' | 'mod',
  type: PrimitiveType,
  a: number,
  b: number,
): { value: number; ov?: boolean; fault?: 'DIV_ZERO' } {
  if (!isIntTarget(type)) {
    throw new Error(`intBinary: kiểu '${type}' không phải số nguyên`);
  }
  if (fn === 'div' || fn === 'mod') {
    if (b === 0) return { value: 0, fault: 'DIV_ZERO' };
    const q = fn === 'div' ? Math.trunc(a / b) : a % b;
    return wrapIntResult(type, q);
  }
  const r = fn === 'add' ? a + b : fn === 'sub' ? a - b : a * b;
  return wrapIntResult(type, r);
}

/** Độ rộng shift theo kiểu (OQ-134). */
function shiftWidth(type: PrimitiveType): number {
  switch (type) {
    case 'Byte':
    case 'USInt':
    case 'SInt':
      return 8;
    case 'Word':
    case 'UInt':
    case 'Int':
      return 16;
    case 'DWord':
    case 'UDInt':
    case 'DInt':
    case 'Time':
      return 32;
    default:
      throw new Error(`shiftOp: kiểu '${type}' không shift được`);
  }
}

function isSigned(type: PrimitiveType): boolean {
  return type === 'SInt' || type === 'Int' || type === 'DInt' || type === 'Time';
}

/**
 * SHL/SHR/ROL/ROR (M1 §7.2 + OQ-134): count < 0 hoặc ≥ độ rộng → 0; SHR số
 * có dấu mở rộng dấu (`>>`), không dấu dùng `>>>`; ROL/ROR xoay trong độ rộng.
 */
export function shiftOp(
  fn: 'SHL' | 'SHR' | 'ROL' | 'ROR',
  type: PrimitiveType,
  value: number,
  count: number,
): number {
  const width = shiftWidth(type);
  if (count < 0 || count >= width) return 0;
  if (count === 0) return wrapToInt(type, value);
  const signed = isSigned(type);
  switch (fn) {
    case 'SHL':
      return wrapToInt(type, value << count);
    case 'SHR':
      return signed ? wrapToInt(type, value >> count) : wrapToInt(type, value >>> count);
    case 'ROL': {
      const m = wrapUnsigned(width === 32 ? 32 : width === 16 ? 16 : 8, value);
      const r = (m << count) | (m >>> (width - count));
      return wrapToInt(type, r);
    }
    case 'ROR': {
      const m = wrapUnsigned(width === 32 ? 32 : width === 16 ? 16 : 8, value);
      const r = (m >>> count) | (m << (width - count));
      return wrapToInt(type, r);
    }
  }
}
