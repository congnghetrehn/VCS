// Chuẩn hóa địa chỉ IEC (M2 §8.5, P2.6 commit 1).
// Hàm thuần: chuỗi hiển thị trong file → dạng chuẩn %I0.0 / %IW64 /
// DB1.DBX0.0; E→I, A/O→Q, strip P-prefix và hậu tố :P (peripheral),
// sym: passthrough nguyên văn. Không hợp lệ → { ok: false, reason }
// (validate dịch thành IO-E010). Mọi whitespace bị bỏ (kể cả trong
// sym: — đường dẫn symbolic không chứa khoảng trắng).
//
// Lưu ý: 'M01' trơ (không size, không .bit) là KHÔNG hợp lệ — địa chỉ
// bit luôn cần phần .bit; 'IB0' (size B) thì hợp lệ.

import type { DataType, SignalKind } from '@vcs/schemas';
import type { CellValue } from './read-csv.js';

export type AddressArea = 'I' | 'Q' | 'M' | 'DB';
export type AddressSize = 'bit' | 'B' | 'W' | 'D';

export interface ParsedAddress {
  /** Dạng chuẩn: %I0.0 / %IW64 / DB1.DBX0.0 (DB không có %). sym: giữ nguyên. */
  canonical: string;
  /** null khi sym: (không suy được vùng — xem normalize.ts). */
  area: AddressArea | null;
  /** null khi sym:. */
  size: AddressSize | null;
  /** Byte bắt đầu (DB: byte trong DB; bit: byte chứa bit). null khi sym:. */
  byte: number | null;
  /** Chỉ khi size === 'bit'. */
  bit: number | null;
  /** Số DB, chỉ khi area === 'DB'. */
  db: number | null;
  /** true khi địa chỉ gốc có P-prefix (PIW/PEW/PQW/PAW...) hoặc hậu tố :P. */
  peripheral: boolean;
  /** true khi là sym: (passthrough, không parse thêm). */
  symbolic: boolean;
}

export type NormalizeAddressResult =
  | { ok: true; address: ParsedAddress }
  | { ok: false; reason: string };

const NON_DB_RE = /^([EOAQIM])([BWD])?(\d+)(\.(\d+))?$/;
const DB_RE = /^DB(\d+)\.DB([XBWD])(\d+)(\.(\d+))?$/;

function areaLetter(letter: string): AddressArea {
  if (letter === 'E') return 'I';
  if (letter === 'A' || letter === 'O') return 'Q';
  return letter as AddressArea; // I | Q | M
}

/** Chuẩn hóa một địa chỉ (bảng STATE §30 bảng 1 — 55 case). */
export function normalizeAddress(raw: string): NormalizeAddressResult {
  const trimmed = raw.replace(/\s+/g, '');
  if (trimmed.startsWith('sym:')) {
    if (trimmed.length <= 4) return { ok: false, reason: "địa chỉ sym: trống" };
    return {
      ok: true,
      address: {
        canonical: trimmed,
        area: null,
        size: null,
        byte: null,
        bit: null,
        db: null,
        peripheral: false,
        symbolic: true,
      },
    };
  }
  let s = trimmed.toUpperCase();
  let peripheral = false;
  if (s.endsWith(':P')) {
    peripheral = true;
    s = s.slice(0, -2);
  }
  if (s.startsWith('%')) s = s.slice(1);
  // P-prefix: PIW/PEW/PQW/PAW (+ dạng byte PIB/PEB/PQB/PAB).
  const p = /^P([EAQI][BWD]\d+(\.\d+)?)$/.exec(s);
  if (p !== null) {
    peripheral = true;
    s = p[1] as string;
  }
  const db = DB_RE.exec(s);
  if (db !== null) {
    const dbNo = Number(db[1]);
    const sizeLetter = db[2] as string;
    const byte = Number(db[3]);
    const bitPart = db[5];
    if (sizeLetter === 'X') {
      if (bitPart === undefined) return { ok: false, reason: `DBX thiếu số bit: '${raw}'` };
      const bit = Number(bitPart);
      if (bit > 7) return { ok: false, reason: `số bit ${String(bit)} > 7: '${raw}'` };
      return {
        ok: true,
        address: {
          canonical: `DB${String(dbNo)}.DBX${String(byte)}.${String(bit)}`,
          area: 'DB',
          size: 'bit',
          byte,
          bit,
          db: dbNo,
          peripheral,
          symbolic: false,
        },
      };
    }
    if (bitPart !== undefined) return { ok: false, reason: `DB${sizeLetter} không lấy phần bit: '${raw}'` };
    const size = sizeLetter as 'B' | 'W' | 'D';
    return {
      ok: true,
      address: {
        canonical: `DB${String(dbNo)}.DB${sizeLetter}${String(byte)}`,
        area: 'DB',
        size,
        byte,
        bit: null,
        db: dbNo,
        peripheral,
        symbolic: false,
      },
    };
  }
  const m = NON_DB_RE.exec(s);
  if (m === null) return { ok: false, reason: `địa chỉ không hợp lệ: '${raw}'` };
  const letter = m[1];
  if (letter === undefined) return { ok: false, reason: `địa chỉ không hợp lệ: '${raw}'` };
  const area = areaLetter(letter);
  const sizeLetter = m[2];
  const byte = Number(m[3]);
  const bitPart = m[5];
  if (sizeLetter === undefined) {
    if (bitPart === undefined) return { ok: false, reason: `địa chỉ bit thiếu số bit: '${raw}'` };
    const bit = Number(bitPart);
    if (bit > 7) return { ok: false, reason: `số bit ${String(bit)} > 7: '${raw}'` };
    return {
      ok: true,
      address: {
        canonical: `%${area}${String(byte)}.${String(bit)}`,
        area,
        size: 'bit',
        byte,
        bit,
        db: null,
        peripheral,
        symbolic: false,
      },
    };
  }
  if (bitPart !== undefined) return { ok: false, reason: `${sizeLetter} không lấy phần bit: '${raw}'` };
  const size = sizeLetter as 'B' | 'W' | 'D';
  return {
    ok: true,
    address: {
      canonical: `%${area}${sizeLetter}${String(byte)}`,
      area,
      size,
      byte,
      bit: null,
      db: null,
      peripheral,
      symbolic: false,
    },
  };
}

/** Suy kind từ địa chỉ (§8.5): I+bit→DI, I+W/D→AI, Q+bit→DO, Q+W/D→AO.
// B-width không suy được kind; M/DB/sym: không suy được → null
// (validate báo IO-E003 khi signalType cũng thiếu). */
export function deriveKindFromAddress(address: ParsedAddress): SignalKind | null {
  if (address.symbolic || address.area === null || address.size === null) return null;
  if (address.area === 'M' || address.area === 'DB') return null;
  if (address.size === 'bit') return address.area === 'I' ? 'DI' : 'DO';
  if (address.size === 'B') return null;
  return address.area === 'I' ? 'AI' : 'AO';
}

/** Suy kiểu dữ liệu từ địa chỉ + kind (§8.5): bit→Bool; B→Byte;
// W→Int nếu AI/AO, còn lại Word; D→DInt (Real không có nguồn ở P2.6,
// xem OQ-342). */
export function deriveType(address: ParsedAddress, kind: SignalKind | null): DataType | null {
  if (address.symbolic) {
    // sym: không có width — type suy từ kind (DI/DO→Bool, AI/AO→Int);
    // thiếu kind → null (validate báo IO-E003).
    if (kind === 'DI' || kind === 'DO') return 'Bool';
    if (kind === 'AI' || kind === 'AO') return 'Int';
    return null;
  }
  if (address.size === null) return null;
  switch (address.size) {
    case 'bit':
      return 'Bool';
    case 'B':
      return 'Byte';
    case 'W':
      return kind === 'AI' || kind === 'AO' ? 'Int' : 'Word';
    case 'D':
      return 'DInt';
  }
}

export interface AddressBitRange {
  /** Khóa chồng lấn: controller + vùng (DB tách theo số DB). */
  key: string;
  /** Bit bắt đầu (bao gồm), theo (controller, area). */
  start: number;
  /** Bit kết thúc (không bao gồm). */
  end: number;
}

/** Khoảng bit của một địa chỉ (bảng STATE §30 bảng 2): bit→1 bit,
// B→8, W→16, D→32. sym: không có khoảng → null (bỏ qua IO-E011). */
export function addressBitRange(address: ParsedAddress, controller: string): AddressBitRange | null {
  if (address.symbolic || address.size === null || address.byte === null) return null;
  const area = address.area;
  if (area === null) return null; // chỉ sym: mới có area null (đã loại ở trên)
  const key = area === 'DB' ? `${controller}|DB${String(address.db)}` : `${controller}|${area}`;
  const start = address.size === 'bit' ? address.byte * 8 + (address.bit ?? 0) : address.byte * 8;
  const len = address.size === 'bit' ? 1 : address.size === 'B' ? 8 : address.size === 'W' ? 16 : 32;
  return { key, start, end: start + len };
}

/** Hai khoảng chồng lấn khi cùng khóa và giao nhau. */
export function rangesOverlap(a: AddressBitRange, b: AddressBitRange): boolean {
  return a.key === b.key && a.start < b.end && b.start < a.end;
}

/** Loại module cho addressDerive (§8.5). */
const MODULE_TYPES: Readonly<Record<string, { area: 'I' | 'Q'; size: 'bit' | 'W' }>> = {
  DI8: { area: 'I', size: 'bit' },
  DI16: { area: 'I', size: 'bit' },
  DI32: { area: 'I', size: 'bit' },
  DQ8: { area: 'Q', size: 'bit' },
  DQ16: { area: 'Q', size: 'bit' },
  DQ32: { area: 'Q', size: 'bit' },
  AI2: { area: 'I', size: 'W' },
  AI4: { area: 'I', size: 'W' },
  AI8: { area: 'I', size: 'W' },
  AQ2: { area: 'Q', size: 'W' },
  AQ4: { area: 'Q', size: 'W' },
};

/** Parse moduleStart (OQ-347): số byte nguyên, hoặc địa chỉ (%IB8 → 8).
// Không parse được → null (validate báo IO-E010 dòng đó). */
export function parseModuleStart(value: CellValue): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (/^\d+$/.test(t)) return Number(t);
    const parsed = normalizeAddress(t);
    if (parsed.ok && parsed.address.byte !== null) return parsed.address.byte;
    return null;
  }
  return null;
}

/** Sinh địa chỉ từ module + channel (§8.5, OQ-347): DI/DQ:
// byte = moduleStart + floor(ch/8), bit = ch % 8; AI/AQ:
// byte = moduleStart + ch×2 (word). channel đã trừ channelBase
// (mặc định 0). Loại module lạ / channel < channelBase → null. */
export function deriveFromModule(
  moduleType: string,
  channel: number,
  moduleStartByte: number,
  channelBase = 0,
): ParsedAddress | null {
  const def = MODULE_TYPES[moduleType.trim().toUpperCase()];
  if (def === undefined) return null;
  if (!Number.isInteger(channel) || channel < channelBase) return null;
  if (!Number.isInteger(moduleStartByte) || moduleStartByte < 0) return null;
  const ch = channel - channelBase;
  if (def.size === 'bit') {
    const byte = moduleStartByte + Math.floor(ch / 8);
    const bit = ch % 8;
    return {
      canonical: `%${def.area}${String(byte)}.${String(bit)}`,
      area: def.area,
      size: 'bit',
      byte,
      bit,
      db: null,
      peripheral: false,
      symbolic: false,
    };
  }
  const byte = moduleStartByte + ch * 2;
  return {
    canonical: `%${def.area}W${String(byte)}`,
    area: def.area,
    size: 'W',
    byte,
    bit: null,
    db: null,
    peripheral: false,
    symbolic: false,
  };
}
