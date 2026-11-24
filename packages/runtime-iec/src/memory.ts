// Bộ nhớ Siemens — @vcs/runtime-iec (M1 §3.2).
// Một vùng byte + DataView big-endian. Tầng byte thô: không biết tag, không
// biết tên symbolic, không tự chuẩn hóa giá trị (wrap/fround là việc của
// interpreter trước khi ghi, §7.2 — OQ-091).

import { TagError, validateTagValue } from '@vcs/kernel';
import type { DataType, TagValue } from '@vcs/schemas';
import { sizeOf } from './types.js';

/** Kiểu đọc/ghi được qua `MemoryArea.read/write` — mọi kiểu số, trừ Bool
 * (đọc/ghi bằng `getBit`/`setBit`) và String (M1 không hỗ trợ). */
export type MemoryScalarType = Exclude<DataType, 'Bool' | 'String'>;

export class MemoryArea {
  readonly #bytes: Uint8Array;
  readonly #view: DataView;

  constructor(readonly sizeBytes: number) {
    if (!Number.isInteger(sizeBytes) || sizeBytes < 0) {
      throw new RangeError(
        `kích thước vùng nhớ phải là số nguyên ≥ 0, nhận được ${String(sizeBytes)}`,
      );
    }
    this.#bytes = new Uint8Array(sizeBytes);
    this.#view = new DataView(this.#bytes.buffer);
  }

  /** Đọc 1 bit; bit 0 = LSB (M1 §3.2). */
  getBit(byte: number, bit: number): boolean {
    this.#checkByte(byte, 'getBit');
    this.#checkBit(bit, 'getBit');
    return ((this.#bytes[byte] as number) & (1 << bit)) !== 0;
  }

  /** Ghi 1 bit; bit 0 = LSB (M1 §3.2). */
  setBit(byte: number, bit: number, value: boolean): void {
    this.#checkByte(byte, 'setBit');
    this.#checkBit(bit, 'setBit');
    const cur = this.#bytes[byte] as number;
    this.#bytes[byte] = value ? cur | (1 << bit) : cur & ~(1 << bit);
  }

  /**
   * Đọc một giá trị số tại offset (byte). Big-endian mọi độ rộng (M1 §3.2).
   * `Time` đọc như DInt ms (cùng encoding, khác kiểu khai báo).
   * Bool phải đọc bằng `getBit` (bit nào của byte là mơ hồ nếu đọc cả byte).
   */
  read(type: MemoryScalarType, byteOffset: number): TagValue {
    const size = this.#sizeOf(type, 'read', byteOffset);
    this.#checkRange(byteOffset, size, 'read');
    switch (type) {
      case 'Byte':
      case 'USInt':
        return this.#view.getUint8(byteOffset);
      case 'Word':
      case 'UInt':
        return this.#view.getUint16(byteOffset, false);
      case 'DWord':
      case 'UDInt':
        return this.#view.getUint32(byteOffset, false);
      case 'SInt':
        return this.#view.getInt8(byteOffset);
      case 'Int':
        return this.#view.getInt16(byteOffset, false);
      case 'DInt':
      case 'Time':
        return this.#view.getInt32(byteOffset, false);
      case 'Real':
        return this.#view.getFloat32(byteOffset, false);
      case 'LReal':
        return this.#view.getFloat64(byteOffset, false);
    }
  }

  /**
   * Ghi một giá trị số tại offset (byte). Big-endian mọi độ rộng (M1 §3.2).
   * Giá trị sai khoảng/kiểu → ném `TagError('TAG-E001')` (OQ-091 — bộ nhớ
   * không tự wrap/kẹp; interpreter chuẩn hóa trước khi ghi, §7.2).
   * Real ép `Math.fround`, DWord/UDInt ép `>>> 0` (AGENTS §4).
   * Bool phải ghi bằng `setBit`.
   */
  write(type: MemoryScalarType, byteOffset: number, value: TagValue): void {
    const size = this.#sizeOf(type, 'write', byteOffset);
    this.#checkRange(byteOffset, size, 'write');
    const err = validateTagValue(type, value);
    if (err !== undefined) {
      throw new TagError(
        'TAG-E001',
        `ghi '${type}' tại offset ${String(byteOffset)}: ${err.message}`,
      );
    }
    const v = value as number;
    switch (type) {
      case 'Byte':
      case 'USInt':
        this.#view.setUint8(byteOffset, v);
        return;
      case 'Word':
      case 'UInt':
        this.#view.setUint16(byteOffset, v, false);
        return;
      case 'DWord':
      case 'UDInt':
        this.#view.setUint32(byteOffset, v >>> 0, false);
        return;
      case 'SInt':
        this.#view.setInt8(byteOffset, v);
        return;
      case 'Int':
        this.#view.setInt16(byteOffset, v, false);
        return;
      case 'DInt':
      case 'Time':
        this.#view.setInt32(byteOffset, v, false);
        return;
      case 'Real':
        this.#view.setFloat32(byteOffset, Math.fround(v), false);
        return;
      case 'LReal':
        this.#view.setFloat64(byteOffset, v, false);
        return;
    }
  }

  /** Bản sao nội dung vùng nhớ (sửa bản sao không đổi vùng nhớ). */
  snapshot(): Uint8Array {
    return new Uint8Array(this.#bytes);
  }

  /** Khôi phục nội dung từ snapshot; sai độ dài → `RangeError`. */
  restore(data: Uint8Array): void {
    if (data.length !== this.sizeBytes) {
      throw new RangeError(
        `restore: độ dài snapshot ${String(data.length)} khác kích thước vùng ${String(this.sizeBytes)} byte`,
      );
    }
    this.#bytes.set(data);
  }

  #sizeOf(type: MemoryScalarType, where: string, byteOffset: number): number {
    // Phòng thủ runtime (caller JS có thể truyền 'Bool'/'String' dù kiểu TS
    // đã loại chúng): kiểm qua DataType để TS không báo so sánh vô nghĩa.
    const t = type as DataType;
    if (t === 'Bool' || t === 'String') {
      throw new Error(
        `${where}: dùng getBit/setBit cho Bool (không dùng read/write) — ` +
          `kiểu '${t}' tại offset ${String(byteOffset)}`,
      );
    }
    const size = sizeOf(type);
    if (size === undefined) {
      throw new Error(`${where}: kiểu '${type}' không có kích thước cố định`);
    }
    return size;
  }

  #checkByte(byte: number, where: string): void {
    if (!Number.isInteger(byte) || byte < 0 || byte >= this.sizeBytes) {
      throw new RangeError(
        `${where}: byte ${String(byte)} ngoài vùng nhớ 0..${String(this.sizeBytes - 1)} ` +
          `(vùng ${String(this.sizeBytes)} byte)`,
      );
    }
  }

  #checkBit(bit: number, where: string): void {
    if (!Number.isInteger(bit) || bit < 0 || bit > 7) {
      throw new RangeError(`${where}: bit ${String(bit)} ngoài 0..7`);
    }
  }

  #checkRange(byteOffset: number, size: number, where: string): void {
    if (!Number.isInteger(byteOffset) || byteOffset < 0 || byteOffset + size > this.sizeBytes) {
      throw new RangeError(
        `${where}: offset ${String(byteOffset)} + ${String(size)} byte vượt vùng nhớ ` +
          `0..${String(this.sizeBytes - 1)} (vùng ${String(this.sizeBytes)} byte)`,
      );
    }
  }
}

/**
 * Một DB: `MemoryArea` + số DB (dùng cho diagnostic/lỗi sau này).
 * Layout DB dùng thẳng `layoutStruct` (DB = struct, M1 §3.4).
 */
export class DbStore extends MemoryArea {
  constructor(
    readonly dbNumber: number,
    sizeBytes: number,
  ) {
    super(sizeBytes);
  }
}
