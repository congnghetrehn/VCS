// Sniff encoding/delimiter cho file CSV (M2 §8.2, P2.5 commit 2).
// Hàm thuần: bytes/text → kết quả + lý do. Không đoán im lặng: khi không
// xác định được delimiter thì trả `delimiter: null` kèm confidence thấp.
// Delimiter được sniff bằng cách parse thử từng ứng viên với papaparse
// (preview 20 dòng) — papaparse xử lý đúng dấu nháy kép + xuống dòng
// trong ô, thứ mà đếm cột theo dòng vật lý làm sai.

import Papa from 'papaparse';

/** Encoding mà sniff nhận diện được (M2 §8.2). */
export type SniffEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';

export interface EncodingSniff {
  encoding: SniffEncoding;
  /** Số byte BOM đã bỏ qua ở đầu file. */
  bomLength: number;
}

/** Nhận diện encoding: BOM trước (UTF-8/UTF-16 LE/BE), không BOM thì thử
 *  UTF-8 strict, lỗi → Windows-1252. UTF-16 không BOM không nhận diện được
 *  (theo spec §8.2: chỉ thử UTF-16 khi có BOM). */
export function sniffEncoding(bytes: Uint8Array): EncodingSniff {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'utf-8', bomLength: 3 };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'utf-16le', bomLength: 2 };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: 'utf-16be', bomLength: 2 };
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { encoding: 'utf-8', bomLength: 0 };
  } catch {
    return { encoding: 'windows-1252', bomLength: 0 };
  }
}

/** Giải mã bytes thành text theo encoding đã sniff (bỏ BOM). */
export function decodeText(bytes: Uint8Array): { text: string; encoding: SniffEncoding } {
  const { encoding, bomLength } = sniffEncoding(bytes);
  const text = new TextDecoder(encoding).decode(bytes.subarray(bomLength));
  return { text, encoding };
}

/** Các delimiter ứng viên theo M2 §8.2, theo thứ tự ưu tiên khi hòa. */
export const DELIMITER_CANDIDATES = [',', ';', '\t', '|'] as const;

export interface DelimiterSniff {
  /** null = không xác định được (người dùng phải chọn, không đoán im lặng). */
  delimiter: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/** Nhận diện delimiter: parse thử từng ứng viên bằng papaparse (preview
 *  20 dòng logic — papaparse xử lý đúng dấu nháy kép + xuống dòng trong ô);
 *  chọn ứng viên có phương sai số cột nhỏ nhất trong số ứng viên tách được
 *  > 1 cột ở mọi dòng không trống. Hòa phương sai → ứng viên đứng trước
 *  trong DELIMITER_CANDIDATES. */
export function sniffDelimiter(text: string, maxLines = 20): DelimiterSniff {
  let best: { delimiter: string; variance: number; columns: number } | null = null;
  for (const delimiter of DELIMITER_CANDIDATES) {
    const result = Papa.parse<string[]>(text, { delimiter, preview: maxLines, skipEmptyLines: false });
    if (result.errors.length > 0) continue;
    const counts = result.data
      .filter((row) => !(row.length === 1 && row[0] === ''))
      .map((row) => row.length);
    if (counts.length < 2) continue;
    const minColumns = Math.min(...counts);
    if (minColumns <= 1) continue;
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((a, c) => a + (c - mean) ** 2, 0) / counts.length;
    if (best === null || variance < best.variance) {
      best = { delimiter, variance, columns: Math.round(mean) };
    }
  }
  if (best === null) {
    return {
      delimiter: null,
      confidence: 'low',
      reason: 'không ứng viên nào tách được hơn 1 cột ở mọi dòng — file có thể chỉ có 1 cột, cần người dùng chọn delimiter',
    };
  }
  return {
    delimiter: best.delimiter,
    confidence: best.variance === 0 ? 'high' : 'medium',
    reason:
      best.variance === 0
        ? `delimiter '${best.delimiter}' cho ${String(best.columns)} cột ở mọi dòng trong ${String(maxLines)} dòng đầu`
        : `delimiter '${best.delimiter}' cho trung bình ${String(best.columns)} cột, phương sai ${best.variance.toFixed(2)} (thấp nhất trong các ứng viên)`,
  };
}
