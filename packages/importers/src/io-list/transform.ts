// Transform theo profile §8.4 (P2.5 commit 5).
// Chạy SAU mapping, TRƯỚC normalize (normalize là P2.6 — transform chỉ
// đổi chuỗi theo profile, không tự chuẩn hóa địa chỉ/tag). Áp theo thứ tự
// khai báo; mỗi lần đổi giá trị ghi vào `changed[]` để xem trước.

import type { CanonicalField, TransformStep } from '@vcs/schemas';
import type { CellValue, RawGrid } from './read-csv.js';
import { headerRowIndex } from './mapping.js';

export type IoRecord = Record<string, CellValue>;

export interface TransformChange {
  /** Chỉ số 0-based của record trong mảng đưa vào applyTransforms. */
  row: number;
  field: string;
  op: string;
  from: CellValue;
  to: CellValue;
}

export interface TransformResult {
  rows: IoRecord[];
  changed: TransformChange[];
}

function compilePattern(step: TransformStep, pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'g');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Transform "${step.op}" trên field "${step.field}": pattern regex không hợp lệ: ${pattern} (${detail})`,
    );
  }
}

function compileSplitPattern(step: TransformStep, pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Transform "${step.op}" trên field "${step.field}": pattern regex không hợp lệ: ${pattern} (${detail})`,
    );
  }
}

/** Áp một bước transform lên một record; ghi thay đổi vào `changed`.
 *  Quy tắc theo op (xem STATE commit 5):
 *  - replace/upper/lower/trim/prefix/suffix: chỉ chuỗi; ô không phải
 *    chuỗi hoặc field vắng mặt → bỏ qua.
 *  - map: tra String(cell) trong table (chuỗi/số/boolean; null → bỏ qua);
 *    trúng → giá trị trong table (chuỗi), trượt → giữ nguyên.
 *  - split: tách chuỗi nguồn theo pattern, gán từng phần cho into[];
 *    thiếu phần → null, thừa phần → bỏ; field nguồn GIỮ NGUYÊN;
 *    nguồn không phải chuỗi → các into-field thành null.
 *  - concat: nối String() các field `from` (null → '') bằng separator;
 *    tất cả nguồn null → null; field đích vắng mặt vẫn được tạo.
 *  - default: field vắng mặt/null/chuỗi rỗng → value; còn lại giữ nguyên.
 *  Chỉ ghi `changed` khi giá trị THỰC SỰ đổi (from !== to). */
function applyStep(
  record: IoRecord,
  rowIndex: number,
  step: TransformStep,
  changed: TransformChange[],
): void {
  const set = (field: string, to: CellValue): void => {
    const has = Object.prototype.hasOwnProperty.call(record, field);
    if (!has) {
      // Field vắng mặt: tạo field (kể cả khi to là null — vd split thiếu
      // phần); chỉ ghi changed khi to khác null (tạo field null không
      // phải là đổi giá trị).
      record[field] = to;
      if (to !== null) changed.push({ row: rowIndex, field, op: step.op, from: null, to });
      return;
    }
    const from = record[field] as CellValue;
    if (from !== to) {
      record[field] = to;
      changed.push({ row: rowIndex, field, op: step.op, from, to });
    }
  };
  switch (step.op) {
    case 'replace': {
      const value = record[step.field];
      if (typeof value !== 'string') return;
      set(step.field, value.replace(compilePattern(step, step.pattern), step.with));
      return;
    }
    case 'upper': {
      const value = record[step.field];
      if (typeof value !== 'string') return;
      set(step.field, value.toUpperCase());
      return;
    }
    case 'lower': {
      const value = record[step.field];
      if (typeof value !== 'string') return;
      set(step.field, value.toLowerCase());
      return;
    }
    case 'trim': {
      const value = record[step.field];
      if (typeof value !== 'string') return;
      set(step.field, value.trim());
      return;
    }
    case 'prefix': {
      const value = record[step.field];
      if (typeof value !== 'string') return;
      set(step.field, `${step.with}${value}`);
      return;
    }
    case 'suffix': {
      const value = record[step.field];
      if (typeof value !== 'string') return;
      set(step.field, `${value}${step.with}`);
      return;
    }
    case 'map': {
      const value = record[step.field];
      if (value === null || value === undefined) return;
      const mapped = step.table[String(value)];
      if (mapped !== undefined) set(step.field, mapped);
      return;
    }
    case 'split': {
      const value = record[step.field];
      const parts =
        typeof value === 'string' ? value.split(compileSplitPattern(step, step.pattern)) : [];
      step.into.forEach((target, i) => {
        set(target, parts[i] ?? null);
      });
      return;
    }
    case 'concat': {
      const parts = step.from.map((f) => record[f]);
      if (parts.every((p) => p === null || p === undefined)) {
        set(step.field, null);
        return;
      }
      set(
        step.field,
        parts.map((p) => (p === null || p === undefined ? '' : String(p))).join(step.separator),
      );
      return;
    }
    case 'default': {
      const value = record[step.field];
      if (value === null || value === undefined || value === '') set(step.field, step.value);
      return;
    }
  }
}

/** Áp các bước transform theo thứ tự khai báo lên từng record (mỗi bước
 *  thấy kết quả của bước trước). Trả về bản sao records + danh sách đổi.
 *  Input không bị sửa (records được copy nông từng dòng). */
export function applyTransforms(rows: IoRecord[], transforms: TransformStep[]): TransformResult {
  const copies = rows.map((r) => ({ ...r }));
  const changed: TransformChange[] = [];
  copies.forEach((record, rowIndex) => {
    for (const step of transforms) applyStep(record, rowIndex, step, changed);
  });
  return { rows: copies, changed };
}

/** Dựng records từ lưới theo mapping (field → tên header): mỗi dòng dữ
 *  liệu trong [firstDataRow, lastDataRow ?? hết] thành một record
 *  {field: giá trị ô}. Tên header không tìm thấy cột → field vắng mặt ở
 *  mọi record. Dòng trống vẫn giữ (record toàn null) — việc bỏ dòng do
 *  skipRowsWhen ở P2.6. */
export function gridToRecords(
  grid: RawGrid,
  headerRow: number,
  firstDataRow: number,
  mapping: Partial<Record<CanonicalField, string>>,
  lastDataRow?: number | null,
): IoRecord[] {
  const headerIndex = headerRowIndex(grid, headerRow);
  const headerCells = grid.rows[headerIndex] ?? [];
  const columnOfField = new Map<string, number>();
  for (const [field, columnName] of Object.entries(mapping)) {
    const col = headerCells.findIndex((c) => (c === null ? '' : String(c)) === columnName);
    if (col >= 0) columnOfField.set(field, col);
  }
  const records: IoRecord[] = [];
  grid.rows.forEach((row, i) => {
    const rowNumber = grid.rowNumbers?.[i] ?? i + 1;
    if (rowNumber < firstDataRow) return;
    if (lastDataRow !== undefined && lastDataRow !== null && rowNumber > lastDataRow) return;
    const record: IoRecord = {};
    for (const [field, col] of columnOfField) {
      record[field] = row[col] ?? null;
    }
    records.push(record);
  });
  return records;
}
