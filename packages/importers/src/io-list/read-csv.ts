// Đọc CSV thành lưới thô (M2 §8.1–8.2, P2.5 commit 2).
// Hàm thuần: text/bytes → RawGrid. Lỗi tầng đọc là ImportReadError + CLI
// exit 2 (OQ-331, mirror OQ-319 ScenarioError) — KHÔNG mã Diagnostic mới.

import { readFile } from 'node:fs/promises';
import Papa from 'papaparse';
import { decodeText, sniffDelimiter } from './sniff.js';
import type { SniffEncoding } from './sniff.js';

/** Một ô trong lưới thô: CSV chỉ cho string (ô trống → null); XLSX có thể
 *  cho number/boolean (xem read-xlsx, commit 3). */
export type CellValue = string | number | boolean | null;

/** Lưới thô sau bước đọc (chưa dò header/mapping — xem commit 4).
 *  `rows` giữ NGUYÊN vị trí dòng (kể cả dòng trống/tiêu đề phụ) để `origin`
 *  truy vết được; `headers` rỗng cho tới khi header-detect chạy. */
export interface RawGrid {
  /** Sheet có trong file (chỉ XLSX; CSV để undefined). */
  sheets?: SheetInfo[];
  headers: string[];
  rows: CellValue[][];
  /** Số dòng gốc (1-based) của mỗi dòng trong `rows` — CSV: 1..N; XLSX:
   *  số dòng Excel thật (lệch khi có dòng ẩn bị bỏ qua). */
  rowNumbers?: number[];
  origin: { file: string; sheet?: string };
  /** CSV: encoding + delimiter đã sniff; XLSX: merges. */
  meta?: { encoding?: SniffEncoding; delimiter?: string | null; merges?: string[] };
}

export interface SheetInfo {
  name: string;
  rowCount: number;
  columnCount: number;
}

/** Lỗi tầng đọc (file không có, không parse được, không tìm delimiter). */
export class ImportReadError extends Error {
  readonly file?: string;

  constructor(message: string, file?: string) {
    super(message);
    this.name = 'ImportReadError';
    if (file !== undefined) this.file = file;
  }
}

export interface ReadCsvOptions {
  /** Bỏ qua sniff delimiter, dùng delimiter cho trước. */
  delimiter?: string;
  /** Tên file hiển thị trong lỗi (mặc định '<text>'). */
  file?: string;
}

/** Parse text CSV thành RawGrid. Không sniff được delimiter và không có
 *  delimiter cho trước → ImportReadError (không đoán im lặng). */
export function readCsvText(text: string, options: ReadCsvOptions = {}): RawGrid {
  const file = options.file ?? '<text>';
  let delimiter = options.delimiter;
  if (delimiter === undefined) {
    const sniffed = sniffDelimiter(text);
    if (sniffed.delimiter === null) {
      throw new ImportReadError(`Không xác định được delimiter: ${sniffed.reason}`, file);
    }
    delimiter = sniffed.delimiter;
  }
  const result = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: false });
  if (result.errors.length > 0) {
    const first = result.errors[0] as Papa.ParseError;
    throw new ImportReadError(`Lỗi parse CSV (dòng ${String(first.row ?? '?')}): ${first.message}`, file);
  }
  const rows: CellValue[][] = result.data.map((row) => row.map((cell) => (cell === '' ? null : cell)));
  // Papaparse (skipEmptyLines: false) sinh thêm một dòng rỗng cuối khi text
  // kết thúc bằng newline — đó là dấu kết thúc dòng, không phải một dòng
  // dữ liệu. Bỏ đúng một dòng [null] cuối trong trường hợp đó; dòng trống
  // GIỮA file vẫn được giữ để vị trí dòng không lệch.
  const last = rows[rows.length - 1];
  if (last !== undefined && last.length === 1 && last[0] === null && /(\r\n|\r|\n)$/.test(text)) {
    rows.pop();
  }
  const rowNumbers = rows.map((_, i) => i + 1);
  return { headers: [], rows, rowNumbers, origin: { file } };
}

/** Đọc file CSV từ đĩa: sniff encoding → giải mã → sniff delimiter → parse.
 *  File không đọc được → ImportReadError. */
export async function readCsvFile(path: string, options: Omit<ReadCsvOptions, 'file'> = {}): Promise<RawGrid> {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ImportReadError(`Không đọc được file ${path}: ${detail}`, path);
  }
  const { text, encoding } = decodeText(bytes);
  const grid = readCsvText(text, { ...options, file: path });
  const delimiter = options.delimiter ?? sniffDelimiter(text).delimiter ?? ',';
  return { ...grid, meta: { encoding, delimiter } };
}
