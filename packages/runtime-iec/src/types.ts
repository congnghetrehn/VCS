// Kiểu dữ liệu IEC — @vcs/runtime-iec (M1 §3.1).
// Bảng kích thước + phân loại kiểu, không chứa logic số học
// (quy tắc §7.2 là việc của interpreter, P1.4).

import type { DataType } from '@vcs/schemas';

export interface TypeInfo {
  readonly name: DataType;
  /** Kích thước (byte) của một giá trị; riêng Bool = 1 (1 bit trong 1 byte). */
  readonly sizeBytes: number;
  readonly kind: 'bool' | 'signed' | 'unsigned' | 'float' | 'time';
}

/** Bảng kích thước theo M1 §3.1. String không có trong bảng (M1 không hỗ
 * trợ STRING — xem `sizeOf`, OQ-087). */
export const TYPE_INFO: Readonly<Record<Exclude<DataType, 'String'>, TypeInfo>> = {
  Bool: { name: 'Bool', sizeBytes: 1, kind: 'bool' },
  Byte: { name: 'Byte', sizeBytes: 1, kind: 'unsigned' },
  Word: { name: 'Word', sizeBytes: 2, kind: 'unsigned' },
  DWord: { name: 'DWord', sizeBytes: 4, kind: 'unsigned' },
  SInt: { name: 'SInt', sizeBytes: 1, kind: 'signed' },
  USInt: { name: 'USInt', sizeBytes: 1, kind: 'unsigned' },
  UInt: { name: 'UInt', sizeBytes: 2, kind: 'unsigned' },
  UDInt: { name: 'UDInt', sizeBytes: 4, kind: 'unsigned' },
  Int: { name: 'Int', sizeBytes: 2, kind: 'signed' },
  DInt: { name: 'DInt', sizeBytes: 4, kind: 'signed' },
  Real: { name: 'Real', sizeBytes: 4, kind: 'float' },
  LReal: { name: 'LReal', sizeBytes: 8, kind: 'float' },
  Time: { name: 'Time', sizeBytes: 4, kind: 'time' },
};

/**
 * Kích thước (byte) của kiểu; `undefined` cho `'String'` (độ dài biến đổi,
 * M1 không hỗ trợ STRING — OQ-087). Bool trả 1 (1 bit trong 1 byte chứa).
 */
export function sizeOf(type: DataType): number | undefined {
  if (type === 'String') return undefined;
  return TYPE_INFO[type].sizeBytes;
}

/** Kiểu nguyên có dấu/không dấu: SInt/USInt/UInt/UDInt/Int/DInt + Time
 * (Time lưu như DInt ms, §3.1). */
export function isIntegerType(type: DataType): boolean {
  return (
    type === 'SInt' ||
    type === 'USInt' ||
    type === 'UInt' ||
    type === 'UDInt' ||
    type === 'Int' ||
    type === 'DInt' ||
    type === 'Time'
  );
}

/** Kiểu số thực: Real/LReal. */
export function isFloatType(type: DataType): boolean {
  return type === 'Real' || type === 'LReal';
}

/** Kiểu chuỗi bit: Byte/Word/DWord. */
export function isBitStringType(type: DataType): boolean {
  return type === 'Byte' || type === 'Word' || type === 'DWord';
}
