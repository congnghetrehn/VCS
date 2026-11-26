// Dò dòng header trong lưới thô (M2 §8.3, P2.5 commit 4).
// Quét 30 dòng đầu; chuẩn hóa tên ô (xem normalizeColumnName trong
// mapping.ts); đếm ô khớp từ điển synonym §8.3; chọn dòng có số khớp cao
// nhất, yêu cầu ≥ 3 khớp, hòa → dòng đầu tiên.

import type { CellValue, RawGrid } from './read-csv.js';
import { FIELD_SYNONYMS, normalizeColumnName } from './mapping.js';

export interface HeaderGuess {
  /** Số dòng header (1-based, theo rowNumbers của lưới). */
  headerRow: number;
  /** Dòng dữ liệu đầu tiên: dòng không trống đầu tiên sau header (OQ-337). */
  firstDataRow: number;
  /** Số ô khớp synonym ở dòng header. */
  matches: number;
}

/** Tất cả synonym §8.3 đã chuẩn hóa — dùng để đếm khớp ở mỗi dòng. */
const ALL_SYNONYMS: ReadonlySet<string> = new Set(
  Object.values(FIELD_SYNONYMS).flat().map(normalizeColumnName),
);

function isEmptyRow(row: CellValue[]): boolean {
  return row.every((c) => c === null || (typeof c === 'string' && c.trim() === ''));
}

/** Dò header; không dòng nào đạt ≥ 3 khớp → null (người dùng chỉnh tay
 *  headerRow qua profile — không đoán im lặng). */
export function detectHeader(grid: RawGrid): HeaderGuess | null {
  const scan = grid.rows.slice(0, 30);
  let bestRowIndex = -1;
  let bestMatches = 0;
  for (let i = 0; i < scan.length; i += 1) {
    const row = scan[i];
    if (row === undefined) continue;
    let matches = 0;
    for (const cell of row) {
      if (typeof cell === 'string' && cell.trim() !== '' && ALL_SYNONYMS.has(normalizeColumnName(cell))) {
        matches += 1;
      }
    }
    if (matches > bestMatches) {
      bestRowIndex = i;
      bestMatches = matches;
    }
  }
  if (bestRowIndex < 0 || bestMatches < 3) return null;
  const headerRow = grid.rowNumbers?.[bestRowIndex] ?? bestRowIndex + 1;
  let firstDataRow = headerRow + 1;
  for (let i = bestRowIndex + 1; i < grid.rows.length; i += 1) {
    const row = grid.rows[i];
    if (row !== undefined && !isEmptyRow(row)) {
      firstDataRow = grid.rowNumbers?.[i] ?? i + 1;
      break;
    }
  }
  return { headerRow, firstDataRow, matches: bestMatches };
}
