// Hàm intrinsic M1 §7.3 — @vcs/runtime-iec (P1.4, OQ-144).
// Registry mặc định chứa đúng 14 hàm. `callSys` (system FB, P1.5) dùng
// registry riêng — không chung với registry này (plan §19 mục 3).
// Quy tắc: ABS/SQRT/MIN/MAX theo kiểu `type` (nguyên wrap, Real fround);
// CEIL/FLOOR trả số thô (Math.ceil/floor) — interpreter chuẩn hóa về DInt
// qua `convertChecked` để ghi fault CONV_RANGE khi ngoài khoảng;
// NORM_X/SCALE_X tính double rồi fround kết quả một lần (OQ-159);
// SCALE_X kiểu ra nguyên thì làm tròn như ROUND (OQ-150 kiểm khoảng ở
// interpreter, không fault trong registry).

import type { TagValue } from '@vcs/schemas';
import { roundHalfEven, shiftOp, wrapToInt } from './arithmetic.js';
import type { PrimitiveType } from './ir.js';

export type IntrinsicFn = (args: TagValue[], type: PrimitiveType) => TagValue;

export interface IntrinsicRegistry {
  get(name: string): IntrinsicFn | undefined;
}

function asNum(v: TagValue): number {
  if (typeof v !== 'number') throw new Error(`intrinsic: đối số phải là số, nhận ${typeof v}`);
  return v;
}

function wrapResult(type: PrimitiveType, v: number): number {
  if (type === 'Real') return Math.fround(v);
  if (type === 'LReal') return v;
  if (type === 'Bool') return v !== 0 && !Number.isNaN(v) ? 1 : 0;
  return wrapToInt(type, v);
}

export function createIntrinsicRegistry(): IntrinsicRegistry {
  const fns = new Map<string, IntrinsicFn>([
    [
      'POWER',
      (args, type) => wrapResult(type, Math.pow(asNum(args[0] as TagValue), asNum(args[1] as TagValue))),
    ],
    [
      'ABS',
      (args, type) => {
        const v = asNum(args[0] as TagValue);
        // ABS(số nguyên nhỏ nhất) wrap về chính nó (OQ-134): Math.abs(-32768)
        // = 32768 → wrapInt16 → -32768.
        return wrapResult(type, Math.abs(v));
      },
    ],
    ['SQRT', (args, type) => wrapResult(type, Math.sqrt(asNum(args[0] as TagValue)))],
    [
      'MIN',
      (args, type) => wrapResult(type, Math.min(...args.map(asNum))),
    ],
    [
      'MAX',
      (args, type) => wrapResult(type, Math.max(...args.map(asNum))),
    ],
    [
      'LIMIT',
      (args, type) => {
        const [mn, input, mx] = args.map(asNum);
        return wrapResult(type, Math.min(Math.max(input as number, mn as number), mx as number));
      },
    ],
    ['SHL', (args, type) => shiftOp('SHL', type, asNum(args[0] as TagValue), asNum(args[1] as TagValue))],
    ['SHR', (args, type) => shiftOp('SHR', type, asNum(args[0] as TagValue), asNum(args[1] as TagValue))],
    ['ROL', (args, type) => shiftOp('ROL', type, asNum(args[0] as TagValue), asNum(args[1] as TagValue))],
    ['ROR', (args, type) => shiftOp('ROR', type, asNum(args[0] as TagValue), asNum(args[1] as TagValue))],
    // CEIL/FLOOR: trả số thô — interpreter chuẩn hóa về DInt (kiểm khoảng,
    // CONV_RANGE nếu ngoài) vì registry không có đường báo fault.
    ['CEIL', (args) => Math.ceil(asNum(args[0] as TagValue))],
    ['FLOOR', (args) => Math.floor(asNum(args[0] as TagValue))],
    [
      'NORM_X',
      (args, type) => {
        const [mn, value, mx] = args.map(asNum);
        const r = ((value as number) - (mn as number)) / ((mx as number) - (mn as number));
        return type === 'Real' ? Math.fround(r) : r;
      },
    ],
    [
      'SCALE_X',
      (args, type) => {
        const [mn, value, mx] = args.map(asNum);
        const r = (value as number) * ((mx as number) - (mn as number)) + (mn as number);
        if (type === 'Real') return Math.fround(r);
        if (type === 'LReal') return r;
        // Kiểu ra nguyên: làm tròn như ROUND, kiểm khoảng ở interpreter.
        return roundHalfEven(r);
      },
    ],
  ]);
  return {
    get(name: string): IntrinsicFn | undefined {
      return fns.get(name);
    },
  };
}
