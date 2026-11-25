// Ánh xạ tag ↔ địa chỉ — @vcs/runtime-iec (M1 §10, A12, P1.4).
// Parser địa chỉ ở đây là bản sao nhỏ của `vendor-siemens` `parseAddress`
// (P1.1) — runtime-iec không import được vendor-siemens (dep-cruiser
// `runtime-iec-deps`), nên giữ hai bản + cross-test bắt lệch (OQ-137,
// tiền lệ P0.8 TYPE_RANGES cross-test). Khác biệt có chủ ý so với P1.1:
// bit → width 8 (quy ước IR, P1.3 lệch #4 — P1.1 dùng width 1); sai cú
// pháp/không tìm thấy → throw `RangeError` nêu ref (không phải Error chung);
// kiểu mặc định cho địa chỉ trần theo OQ-110 (bit→Bool, 8→Byte, 16→Int,
// 32→DInt); thêm chữ `L` cho LReal 64-bit (`%ML10`, `DB1.DBL4`) vì
// canonical cần phân biệt `%MD10` (DInt) với LReal cùng byte — dạng này
// KHÔNG có trong `parseAddress` nên cross-test loại trừ nó.

import type { TagDef, TagValue } from '@vcs/schemas';
import type { PrimitiveType } from './ir.js';

/** Một tag đã phân giải thành vị trí trong bộ nhớ PLC. */
export interface TagAddr {
  area: 'I' | 'Q' | 'M' | 'DB';
  byte: number;
  bit?: number;
  db?: number;
  type: PrimitiveType;
}

/** Ánh xạ tên tag → địa chỉ; key = tên tag giữ nguyên case. */
export type TagAddressMap = ReadonlyMap<string, TagAddr>;

export type ParsedRef =
  | { k: 'abs'; area: 'I' | 'Q' | 'M'; byte: number; bit?: number; width: 8 | 16 | 32 | 64; type: PrimitiveType }
  | { k: 'absDb'; db: number; byte: number; bit?: number; width: 8 | 16 | 32 | 64; type: PrimitiveType }
  | { k: 'dbField'; db: string; path: string[] }
  | { k: 'tag'; name: string };

const LETTER_WIDTH: Record<string, 8 | 16 | 32 | 64> = { B: 8, W: 16, D: 32, L: 64 };

function typeForWidth(width: 8 | 16 | 32 | 64, bit: boolean): PrimitiveType {
  if (bit) return 'Bool';
  switch (width) {
    case 8:
      return 'Byte';
    case 16:
      return 'Int';
    case 32:
      return 'DInt';
    case 64:
      return 'LReal';
  }
}

function failRange(ref: string, reason: string): never {
  throw new RangeError(`parsePlcRef: ref '${ref}' không hợp lệ (${reason})`);
}

interface AbsParts {
  area: 'I' | 'Q' | 'M';
  byte: number;
  bit?: number;
  width: 8 | 16 | 32 | 64;
}

/** Parse `%I0.0` / `%IB10` / `%IW64` / `%ID20` / `%ML10` (có/không có `%`,
 * chữ thường chuẩn hóa hoa, trim — cùng quy ước P1.1 OQ-085). */
function parseAreaRef(ref: string): AbsParts {
  const upper = ref.trim().toUpperCase();
  const m = /^%?(I|Q|M)([BWDL])?(\d+)(?:\.(\d+))?$/.exec(upper);
  if (m === null) failRange(ref, 'dạng phải là %I/%Q/%M<b>.<bit> / %IB/%IW/%ID/%ML<b>');
  const area = m[1] as 'I' | 'Q' | 'M';
  const letter = m[2];
  const byte = Number(m[3]);
  const bitText = m[4];
  if (letter === undefined) {
    if (bitText === undefined) failRange(ref, 'thiếu số bit (dạng %I<b>.<bit>)');
    const bit = Number(bitText);
    if (bit < 0 || bit > 7) failRange(ref, 'bit phải 0..7');
    return { area, byte, bit, width: 8 };
  }
  if (bitText !== undefined) {
    failRange(ref, `dạng %${letter} không có phần bit (chỉ dạng bit mới có .<bit>)`);
  }
  return { area, byte, width: LETTER_WIDTH[letter] as 8 | 16 | 32 | 64 };
}

interface DbParts {
  db: number;
  byte: number;
  bit?: number;
  width: 8 | 16 | 32 | 64;
}

/** Parse `DB<n>.DBX<b>.<bit>` / `DBB` / `DBW` / `DBD` / `DBL` (P1.1). */
function parseDbRef(ref: string): DbParts {
  const upper = ref.trim().toUpperCase();
  if (upper.startsWith('%DB')) failRange(ref, 'địa chỉ DB không có tiền tố %');
  const m = /^DB(\d+)\.DB([XBWDL])(\d+)(?:\.(\d+))?$/.exec(upper);
  if (m === null) {
    failRange(ref, 'dạng DB phải là DB<n>.DBX<b>.<bit> / DBB<b> / DBW<b> / DBD<b> / DBL<b>');
  }
  const db = Number(m[1]);
  if (db === 0) failRange(ref, 'DB0 không phải DB người dùng');
  const letter = m[2] as string;
  const byte = Number(m[3]);
  const bitText = m[4];
  if (letter === 'X') {
    if (bitText === undefined) failRange(ref, 'DBX thiếu số bit (dạng DB<n>.DBX<b>.<bit>)');
    const bit = Number(bitText);
    if (bit < 0 || bit > 7) failRange(ref, 'bit phải 0..7');
    return { db, byte, bit, width: 8 };
  }
  if (bitText !== undefined) {
    failRange(ref, `DB${letter} không có phần bit (chỉ DBX mới có bit)`);
  }
  return { db, byte, width: LETTER_WIDTH[letter] as 8 | 16 | 32 | 64 };
}

/** Parse một địa chỉ TagDef (`%I0.0`, `%MW10`, `DB1.DBW4`, ...) thành
 * TagAddr; `sym:` → throw chưa hỗ trợ (P5.7, OQ-137). */
function parseTagAddress(address: string, type: PrimitiveType): TagAddr {
  const trimmed = address.trim();
  if (/^sym:/i.test(trimmed)) {
    throw new Error(`TagAddressMap: địa chỉ sym: '${address}' chưa hỗ trợ (P5.7)`);
  }
  const upper = trimmed.toUpperCase();
  if (upper.startsWith('DB') || upper.startsWith('%DB')) {
    const parts = parseDbRef(address);
    return {
      area: 'DB',
      byte: parts.byte,
      ...(parts.bit !== undefined ? { bit: parts.bit } : {}),
      db: parts.db,
      type,
    };
  }
  const parts = parseAreaRef(address);
  return {
    area: parts.area,
    byte: parts.byte,
    ...(parts.bit !== undefined ? { bit: parts.bit } : {}),
    type,
  };
}

/**
 * Dựng map từ TagDef: dùng `address` + `type` đã khai báo (không diễn giải
 * lại kiểu theo OQ-110 — tag khai báo kiểu tường minh). Tên tag trùng
 * (đúng case) → throw ồn ào.
 */
export function buildTagAddressMap(tags: readonly TagDef[]): TagAddressMap {
  const map = new Map<string, TagAddr>();
  for (const tag of tags) {
    if (map.has(tag.name)) {
      throw new Error(`TagAddressMap: trùng tên tag '${tag.name}'`);
    }
    map.set(tag.name, parseTagAddress(tag.address, tag.type as PrimitiveType));
  }
  return map;
}

/**
 * Parse một ref: `%I0.0`, `%MW10`, `%MD0`, `%Q0.0`, `%M0.0`, `DB1.DBW4`,
 * `DB1.DBX0.0`, `"DB_Name".field[.sub]`, tên tag symbolic (tra map).
 * `#name`/`sym:` → throw; sai cú pháp/không tìm thấy → `RangeError` nêu ref.
 */
export function parsePlcRef(ref: string, tagMap: TagAddressMap): ParsedRef {
  const trimmed = ref.trim();
  if (trimmed === '') failRange(ref, 'chuỗi rỗng');
  if (trimmed.startsWith('#')) {
    throw new RangeError(`parsePlcRef: ref '${ref}' dùng #name — dùng tên tag hoặc địa chỉ tuyệt đối`);
  }
  if (/^sym:/i.test(trimmed)) {
    throw new RangeError(`parsePlcRef: ref '${ref}' dạng sym: chưa hỗ trợ (P5.7)`);
  }
  if (trimmed.startsWith('"')) {
    const close = trimmed.indexOf('"', 1);
    if (close < 0) failRange(ref, 'thiếu dấu " đóng tên DB');
    const db = trimmed.slice(1, close);
    const rest = trimmed.slice(close + 1);
    if (!rest.startsWith('.') || rest.length < 2) {
      failRange(ref, 'dạng phải là "DB".field[.sub]');
    }
    const path = rest.slice(1).split('.');
    if (path.some((p) => p === '')) failRange(ref, 'tên field rỗng');
    return { k: 'dbField', db, path };
  }
  const upper = trimmed.toUpperCase();
  // Tên tag symbolic tra TRƯỚC khi parse địa chỉ: tên như 'DB1_VAL' bắt
  // đầu bằng 'DB' nhưng là tag, không phải ref DB ('DB1.DBW4' vẫn về
  // nhánh DB vì chứa '.' nên không phải tên tag).
  if (tagMap.has(trimmed)) {
    return { k: 'tag', name: trimmed };
  }
  if (upper.startsWith('DB') || upper.startsWith('%DB')) {
    const parts = parseDbRef(trimmed);
    return {
      k: 'absDb',
      db: parts.db,
      byte: parts.byte,
      ...(parts.bit !== undefined ? { bit: parts.bit } : {}),
      width: parts.width,
      type: typeForWidth(parts.width, parts.bit !== undefined),
    };
  }
  if (/^%?([IQM])/i.test(trimmed)) {
    const parts = parseAreaRef(trimmed);
    return {
      k: 'abs',
      area: parts.area,
      byte: parts.byte,
      ...(parts.bit !== undefined ? { bit: parts.bit } : {}),
      width: parts.width,
      type: typeForWidth(parts.width, parts.bit !== undefined),
    };
  }
  // Tên tag symbolic — tra map (giữ nguyên case).
  if (!tagMap.has(trimmed)) {
    throw new RangeError(`parsePlcRef: không tìm thấy tag hoặc địa chỉ '${ref}'`);
  }
  return { k: 'tag', name: trimmed };
}

function letterForWidth(width: 8 | 16 | 32 | 64): 'B' | 'W' | 'D' | 'L' {
  switch (width) {
    case 8:
      return 'B';
    case 16:
      return 'W';
    case 32:
      return 'D';
    case 64:
      return 'L';
  }
}

function absString(area: 'I' | 'Q' | 'M', byte: number, bit: number | undefined, width: 8 | 16 | 32 | 64): string {
  if (bit !== undefined) return `%${area}${String(byte)}.${String(bit)}`;
  return `%${area}${letterForWidth(width)}${String(byte)}`;
}

function absDbString(db: number, byte: number, bit: number | undefined, width: 8 | 16 | 32 | 64): string {
  if (bit !== undefined) return `DB${String(db)}.DBX${String(byte)}.${String(bit)}`;
  return `DB${String(db)}.DB${letterForWidth(width)}${String(byte)}`;
}

function widthForType(type: PrimitiveType): 8 | 16 | 32 | 64 {
  switch (type) {
    case 'Bool':
      return 8;
    case 'Byte':
    case 'SInt':
    case 'USInt':
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
    case 'Real':
      return 32;
    case 'LReal':
      return 64;
  }
}

/**
 * Chuẩn hóa mọi dạng ref về một key (OQ-142 — force bằng tên tag và bằng
 * địa chỉ là cùng một force; `%MB10` ≠ `%MW10` vì khác width). Dạng chuẩn:
 * abs → `%I0.0`/`%MW10`, absDb → `DB1.DBW4`, dbField → `"DB".field`,
 * tag → dạng abs tương ứng (tra map; không có trong map → throw).
 */
export function canonicalRef(parsed: ParsedRef, tagMap: TagAddressMap): string {
  switch (parsed.k) {
    case 'abs':
      return absString(parsed.area, parsed.byte, parsed.bit, parsed.width);
    case 'absDb':
      return absDbString(parsed.db, parsed.byte, parsed.bit, parsed.width);
    case 'dbField':
      return `"${parsed.db}".${parsed.path.join('.')}`;
    case 'tag': {
      const addr = tagMap.get(parsed.name);
      if (addr === undefined) {
        throw new RangeError(`canonicalRef: không tìm thấy tag '${parsed.name}'`);
      }
      if (addr.area === 'DB') {
        return absDbString(addr.db as number, addr.byte, addr.bit, widthForType(addr.type));
      }
      return absString(addr.area, addr.byte, addr.bit, widthForType(addr.type));
    }
  }
}

/** Giá trị mặc định của một tag theo kiểu (dùng khi latch/output thiếu). */
export function defaultTagValue(type: PrimitiveType): TagValue {
  return type === 'Bool' ? false : 0;
}
