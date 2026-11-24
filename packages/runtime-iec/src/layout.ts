// Layout DB/Struct/Array — @vcs/runtime-iec (M1 §3.4).
// Hàm thuần: input là khai báo trung lập (AST map sang ở P1.3).
// Thuật toán = đúng 6 quy tắc §3.4. `byteOffset`/`bitOffset` trong FieldInfo
// là TUYỆT ĐỐI trong struct gốc (dùng trực tiếp cho `memory.ts`).

import type { DataType } from '@vcs/schemas';
import { sizeOf } from './types.js';

export type FieldType =
  | { kind: 'elem'; type: DataType }
  | { kind: 'array'; elem: FieldType; lo: number; hi: number }
  | { kind: 'struct'; name?: string; fields: FieldDecl[] };

export interface FieldDecl {
  name: string;
  type: FieldType;
}

export interface FieldInfo {
  name: string;
  byteOffset: number;
  bitOffset?: number;
  /**
   * Kích thước vùng field chiếm: byte với mọi kiểu, riêng Bool = 1 (bit).
   * Với array Bool, `elem.size` = 1 (bit): phần tử i ở bit i của mảng
   * (byte `byteOffset + (i >> 3)`, bit `i & 7`); với array khác,
   * phần tử i ở `byteOffset + i * elem.size`.
   */
  size: number;
  type: FieldType;
  fields?: FieldInfo[];
  elem?: FieldInfo;
  count?: number;
}

export interface StructLayout {
  /** Tổng kích thước (byte), luôn chẵn trừ struct rỗng (size 0). */
  size: number;
  fields: FieldInfo[];
}

const roundUpEven = (n: number): number => (n % 2 === 1 ? n + 1 : n);

/**
 * Tính layout một struct/DB theo đúng 6 quy tắc M1 §3.4:
 * (1) Bool gói bit trong byte, chuỗi Bool liên tiếp dùng chung byte, gặp
 * phần tử không-Bool thì đóng byte hiện tại; (2) Byte/SInt/USInt 1 byte,
 * không căn; (3) kiểu ≥ 2 byte bắt đầu chẵn; (4) LReal bắt đầu chẵn
 * (không căn 8 — VERIFY, OQ-084); (5) Struct/UDT/Array bắt đầu chẵn,
 * kết thúc chẵn; (6) tổng kích thước làm tròn chẵn.
 * DB dùng thẳng hàm này (DB = struct; không có `layoutDb` riêng).
 * Lỗi → ném `Error` nêu tên field + lý do.
 */
export function layoutStruct(fields: readonly FieldDecl[]): StructLayout {
  const { size, infos } = layoutFields(fields, 0);
  return { size, fields: infos };
}

function layoutFields(
  fields: readonly FieldDecl[],
  base: number,
): { size: number; infos: FieldInfo[] } {
  let cursor = base;
  // Byte đang gói bit (undefined = không có byte Bool đang mở).
  let bitByte: number | undefined;
  let bitPos = 0;
  const infos: FieldInfo[] = [];
  const names = new Set<string>();

  const closeBits = (): void => {
    if (bitByte !== undefined) {
      cursor = bitByte + 1;
      bitByte = undefined;
      bitPos = 0;
    }
  };
  const alignEven = (): void => {
    if (cursor % 2 === 1) cursor += 1;
  };

  for (const field of fields) {
    if (names.has(field.name)) {
      throw new Error(`layoutStruct: trùng tên field '${field.name}' trong cùng struct`);
    }
    names.add(field.name);
    const t = field.type;
    if (t.kind === 'elem') {
      if (t.type === 'String') {
        throw new Error(`layoutStruct: field '${field.name}' kiểu String chưa hỗ trợ ở M1`);
      }
      if (t.type === 'Bool') {
        if (bitByte === undefined) {
          bitByte = cursor;
          bitPos = 0;
        }
        infos.push({
          name: field.name,
          byteOffset: bitByte,
          bitOffset: bitPos,
          size: 1,
          type: t,
        });
        bitPos += 1;
        if (bitPos === 8) {
          cursor = bitByte + 1;
          bitByte = undefined;
          bitPos = 0;
        }
      } else {
        closeBits();
        const size = sizeOf(t.type) as number;
        if (size >= 2) alignEven();
        infos.push({ name: field.name, byteOffset: cursor, size, type: t });
        cursor += size;
      }
    } else if (t.kind === 'array') {
      closeBits();
      alignEven();
      const start = cursor;
      const { size, elemInfo, count } = layoutArrayElem(field.name, t);
      infos.push({
        name: field.name,
        byteOffset: start,
        size,
        type: t,
        elem: elemInfo,
        count,
      });
      cursor = start + size;
    } else {
      // struct lồng
      closeBits();
      alignEven();
      const start = cursor;
      const nested = layoutFields(t.fields, start);
      infos.push({
        name: field.name,
        byteOffset: start,
        size: nested.size,
        type: t,
        fields: nested.infos,
      });
      cursor = start + nested.size;
    }
  }
  closeBits();
  return { size: roundUpEven(cursor - base), infos };
}

/** Layout của mảng: trả về tổng size (đã làm tròn chẵn), layout 1 phần tử
 * (`byteOffset` = 0, tương đối với đầu mảng) và số phần tử. */
function layoutArrayElem(
  fieldName: string,
  t: Extract<FieldType, { kind: 'array' }>,
): { size: number; elemInfo: FieldInfo; count: number } {
  const { elem, lo, hi } = t;
  if (lo > hi) {
    throw new Error(
      `layoutStruct: array '${fieldName}' có lo (${String(lo)}) > hi (${String(hi)})`,
    );
  }
  if (elem.kind === 'array') {
    throw new Error(`layoutStruct: array '${fieldName}' lồng array (M1 chỉ hỗ trợ 1 chiều)`);
  }
  const count = hi - lo + 1;
  if (elem.kind === 'struct') {
    const nested = layoutFields(elem.fields, 0);
    return {
      // nested.size đã chẵn nên count * nested.size cũng chẵn.
      size: count * nested.size,
      elemInfo: {
        name: '',
        byteOffset: 0,
        size: nested.size,
        type: elem,
        fields: nested.infos,
      },
      count,
    };
  }
  if (elem.type === 'String') {
    throw new Error(`layoutStruct: array '${fieldName}' chứa String chưa hỗ trợ ở M1`);
  }
  if (elem.type === 'Bool') {
    // Gói bit (VERIFY, OQ-083): 10 Bool = 2 byte; kết thúc chẵn (pad).
    const contentBytes = Math.ceil(count / 8);
    return {
      size: roundUpEven(contentBytes),
      elemInfo: { name: '', byteOffset: 0, bitOffset: 0, size: 1, type: elem },
      count,
    };
  }
  const elemSize = sizeOf(elem.type) as number;
  return {
    size: roundUpEven(count * elemSize),
    elemInfo: { name: '', byteOffset: 0, size: elemSize, type: elem },
    count,
  };
}
