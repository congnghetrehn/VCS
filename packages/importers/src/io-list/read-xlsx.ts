// Đọc XLSX thành lưới thô (M2 §8.2, P2.5 commit 3).
// Spike-check TC-1 ĐÃ CHẠY (2026-11-26, /tmp/spike-exceljs.mjs): exceljs
// đọc được sheets, row/columnCount, formula cache {formula, result},
// merges, hidden row/column, rich text, Date, error, hyperlink — TC-1
// không nổ. Lỗi tầng đọc là ImportReadError (OQ-331) — KHÔNG Diagnostic mới.

import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { ImportReadError, type CellValue, type RawGrid, type SheetInfo } from './read-csv.js';

export interface ReadXlsxOptions {
  /** Tên sheet cần đọc; mặc định sheet đầu tiên. */
  sheet?: string;
  /** Bỏ qua dòng ẩn (mặc định true — OQ-336). Cột ẩn vẫn giữ. */
  skipHiddenRows?: boolean;
  /** Chữ cột điền xuống khi merge dọc (vd ['A']) — xem applyFillDown.
   *  Mặc định rỗng: ô slave của merge → null (không bịa dữ liệu, OQ-335). */
  fillDownColumns?: string[];
  /** Tên file hiển thị trong lỗi/origin (mặc định '<buffer>'). */
  file?: string;
}

/** Chuẩn hóa một ô exceljs về CellValue.
 *  - formula/sharedFormula → giá trị cache `result`; không có cache → null
 *    (Excel khi lưu luôn ghi cache; file không có cache là dữ liệu thiếu —
 *    null hiển thị được ở tầng mapping, không im lặng thành 0).
 *  - rich text → nối các run; hyperlink → text; Date → ISO string;
 *    error (#DIV/0!...) → giữ nguyên chuỗi lỗi để nhìn thấy. */
function normalizeCellValue(value: ExcelJS.CellValue | undefined): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if ('formula' in value || 'sharedFormula' in value) {
    return value.result === undefined ? null : normalizeCellValue(value.result);
  }
  if ('richText' in value) return value.richText.map((run) => run.text).join('');
  if ('text' in value) return value.text;
  if ('error' in value) return value.error;
  return null;
}

/** 'A' → 0, 'Z' → 25, 'AA' → 26. */
export function columnLetterToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

export interface MergeRange {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
}

function parseCellRef(ref: string): { col: number; row: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (m === null) return null;
  const letters = m[1];
  const rowText = m[2];
  if (letters === undefined || rowText === undefined) return null;
  return { col: columnLetterToIndex(letters), row: Number.parseInt(rowText, 10) };
}

export function parseMergeRange(range: string): MergeRange | null {
  const parts = range.split(':');
  if (parts.length !== 2) return null;
  const start = parseCellRef(parts[0] as string);
  const end = parseCellRef(parts[1] as string);
  if (start === null || end === null) return null;
  return { startCol: start.col, startRow: start.row, endCol: end.col, endRow: end.row };
}

/** Áp dụng fill-down cho lưới đã đọc (hàm thuần, trả lưới mới).
 *  ExcelJS khi đọc tự gán giá trị master cho ô slave của merge — hàm này
 *  ghi đè lại theo đúng quy tắc OQ-335 để không phụ thuộc hành vi đó:
 *  - ô slave ở cột thuộc `columnLetters` (chữ cột, vd ['A']) và merge kéo
 *    dọc nhiều dòng → nhận giá trị của ô master (góc trên-trái của range);
 *  - mọi ô slave còn lại → null (merge ngang, merge ở cột khác, master bị
 *    ẩn nên không có trong lưới).
 *  Không có `meta.merges` hoặc `rowNumbers` → trả nguyên lưới. */
export function applyFillDown(grid: RawGrid, columnLetters: string[]): RawGrid {
  const merges = grid.meta?.merges;
  const rowNumbers = grid.rowNumbers;
  if (merges === undefined || merges.length === 0 || rowNumbers === undefined) return grid;
  const fillCols = new Set(columnLetters.map((l) => columnLetterToIndex(l)));
  const rows = grid.rows.map((r) => [...r]);
  const rowIndexByNumber = new Map(rowNumbers.map((n, i) => [n, i]));
  for (const range of merges) {
    const parsed = parseMergeRange(range);
    if (parsed === null) continue;
    const masterRowIdx = rowIndexByNumber.get(parsed.startRow);
    const masterRow = masterRowIdx === undefined ? undefined : rows[masterRowIdx];
    const masterValue = masterRow === undefined ? undefined : masterRow[parsed.startCol];
    for (let r = parsed.startRow; r <= parsed.endRow; r += 1) {
      for (let c = parsed.startCol; c <= parsed.endCol; c += 1) {
        if (r === parsed.startRow && c === parsed.startCol) continue;
        const rowIdx = rowIndexByNumber.get(r);
        if (rowIdx === undefined) continue;
        const row = rows[rowIdx];
        if (row === undefined || c >= row.length) continue;
        row[c] =
          masterValue !== undefined && fillCols.has(c) && parsed.endRow > parsed.startRow ? masterValue : null;
      }
    }
  }
  return { ...grid, rows };
}

async function loadWorkbook(bytes: Uint8Array, file: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  try {
    // boundary: exceljs d.ts khai báo `Buffer` riêng (interface Buffer
    // extends ArrayBuffer) nên load() nhận ArrayBuffer; runtime (JSZip)
    // chấp nhận mọi dạng bytes — copy sang ArrayBuffer mới để đúng cả hai.
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    await wb.xlsx.load(copy.buffer);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ImportReadError(`Không đọc được file XLSX ${file}: ${detail}`, file);
  }
  return wb;
}

function sheetInfos(wb: ExcelJS.Workbook): SheetInfo[] {
  return wb.worksheets.map((s) => ({ name: s.name, rowCount: s.rowCount, columnCount: s.columnCount }));
}

/** Liệt kê sheet của file XLSX (tên + số dòng/cột). */
export async function listSheets(path: string): Promise<SheetInfo[]> {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ImportReadError(`Không đọc được file ${path}: ${detail}`, path);
  }
  const wb = await loadWorkbook(bytes, path);
  return sheetInfos(wb);
}

/** Đọc XLSX từ bytes thành RawGrid. `rows` giữ nguyên vị trí dòng Excel
 *  (dòng trống vẫn có mặt, ô trống → null); `rowNumbers` là số dòng Excel
 *  thật (lệch khi có dòng ẩn bị bỏ qua). */
export async function readXlsxBuffer(bytes: Uint8Array, options: ReadXlsxOptions = {}): Promise<RawGrid> {
  const file = options.file ?? '<buffer>';
  const wb = await loadWorkbook(bytes, file);
  const ws =
    options.sheet !== undefined ? wb.getWorksheet(options.sheet) : wb.worksheets[0];
  if (ws === undefined) {
    throw new ImportReadError(
      options.sheet !== undefined
        ? `Không tìm thấy sheet '${options.sheet}' trong file ${file}`
        : `File ${file} không có sheet nào`,
      file,
    );
  }
  const skipHiddenRows = options.skipHiddenRows ?? true;
  const rows: CellValue[][] = [];
  const rowNumbers: number[] = [];
  const width = ws.columnCount;
  // KHÔNG dùng ws.getRow(r).getCell(c) trong vòng lặp lồng: exceljs trả
  // getCell chậm theo kiểu O(n²) trên file lớn (đo 2026-11-26: 20 006 dòng
  // × 10 cột — getRow/getCell 161 s, trong khi eachRow+eachCell 17 ms;
  // wb.xlsx.load chỉ 952 ms). eachRow/eachCell cho cùng đầu ra, nhanh hơn
  // ~4 bậc. Giữ hợp đồng cũ: mọi dòng pad null tới ws.columnCount.
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (skipHiddenRows && row.hidden) return;
    const cells: CellValue[] = new Array<CellValue>(width).fill(null);
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber >= 1 && colNumber <= width) {
        cells[colNumber - 1] = normalizeCellValue(cell.value);
      }
    });
    rows.push(cells);
    rowNumbers.push(rowNumber);
  });
  const grid: RawGrid = {
    sheets: sheetInfos(wb),
    headers: [],
    rows,
    rowNumbers,
    origin: { file, sheet: ws.name },
    meta: { merges: [...ws.model.merges] },
  };
  return applyFillDown(grid, options.fillDownColumns ?? []);
}

/** Đọc file XLSX từ đĩa. */
export async function readXlsxFile(path: string, options: Omit<ReadXlsxOptions, 'file'> = {}): Promise<RawGrid> {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ImportReadError(`Không đọc được file ${path}: ${detail}`, path);
  }
  return readXlsxBuffer(bytes, { ...options, file: path });
}
