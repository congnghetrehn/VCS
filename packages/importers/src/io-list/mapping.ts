// Gợi ý mapping cột → canonical field (M2 §8.3, P2.5 commit 4).
// Từ điển synonym vi/en/de lấy NGUYÊN VĂN từ bảng §8.3 (không bịa thêm);
// chuẩn hóa tên cột: NFD → bỏ dấu vi, lowercase, bỏ ký tự không chữ/số.
// Content sniffing: ĐIỀN field chưa có gợi ý theo tên, và ĐẢO gợi ý theo
// tên CHỈ khi tên đó thuộc nhóm cấu trúc (rack/slot/channel/module) mà nội
// dung khớp rõ address/signalType (> 70%) — vd 'Kanal' chứa địa chỉ thì
// gợi ý address (ví dụ 4 của plan; 'kanal' đúng là synonym của channel
// trong bảng §8.3 nên cần luật đảo này, xem STATE commit 4). Gợi ý theo
// tên của field lõi (tag/address/type/...) không bao giờ bị đảo; range
// (số) không đảo vì cột channel vốn là số.

import type { CanonicalField } from '@vcs/schemas';
import type { RawGrid } from './read-csv.js';
import { parseMergeRange } from './read-xlsx.js';

/** Chuẩn hóa tên cột để khớp synonym (§8.3): NFD → bỏ dấu, đ→d,
 *  lowercase, bỏ ký tự không chữ/số ('Tag Name' → 'tagname',
 *  'Tên thiết bị' → 'tenthietbi', 'NO/NC' → 'nonc'). */
export function normalizeColumnName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Từ điển synonym §8.3 — NGUYÊN VĂN từ spec (thứ tự trong mỗi field là
 *  thứ tự ưu tiên khi nhiều cột khớp cùng field: synonym đứng trước thắng,
 *  vd 'plc' thắng 'station' cho controller). */
export const FIELD_SYNONYMS: Record<CanonicalField, readonly string[]> = {
  tag: ['tag', 'tagname', 'tagno', 'signal', 'signalname', 'kks', 'kennzeichen', 'bezeichnung', 'tenthietbi', 'matinhieu', 'tentinhieu'],
  description: ['description', 'desc', 'service', 'beschreibung', 'mota', 'noidung'],
  signalType: ['type', 'signaltype', 'iotype', 'io', 'signalart', 'loaitinhieu', 'loai'],
  address: ['address', 'addr', 'plcaddress', 'adresse', 'diachi', 'absoluteaddress'],
  controller: ['plc', 'cpu', 'controller', 'station', 'steuerung', 'trambien'],
  engMin: ['rangelo', 'min', 'lrv', 'spanlow', 'messbereichvon'],
  engMax: ['rangehi', 'max', 'urv', 'spanhigh', 'messbereichbis'],
  unit: ['unit', 'eu', 'einheit', 'donvi'],
  equipment: ['equipment', 'device', 'parent', 'owner', 'anlage', 'thietbi'],
  polarity: ['no/nc', 'polarity', 'contact', 'ruhearbeit'],
  rack: ['rack'],
  slot: ['slot'],
  channel: ['channel', 'ch', 'kanal'],
  module: ['module', 'baugruppe'],
};

interface SynonymEntry {
  field: CanonicalField;
  /** Vị trí synonym trong danh sách của field (nhỏ = ưu tiên cao). */
  priority: number;
  raw: string;
}

/** Tra cứu synonym đã chuẩn hóa → field. Synonym trùng sau chuẩn hóa ở
 *  hai field (không có trong bảng §8.3) → field đứng trước thắng. */
const SYNONYM_LOOKUP: ReadonlyMap<string, SynonymEntry> = (() => {
  const map = new Map<string, SynonymEntry>();
  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS) as [CanonicalField, readonly string[]][]) {
    synonyms.forEach((raw, priority) => {
      const key = normalizeColumnName(raw);
      if (!map.has(key)) map.set(key, { field, priority, raw });
    });
  }
  return map;
})();

export type MappingConfidence = 'high' | 'medium';

export interface MappingSuggestion {
  field: CanonicalField;
  /** Tên header (như trong file) của cột được gợi ý. */
  column: string;
  confidence: MappingConfidence;
  reason: string;
}

/** Địa chỉ IEC (§8.5): I0.0/E0.0/%I0.0/PEW64/IW64/DB1.DBX0.0...;
 *  bỏ khoảng trắng + hậu tố ':P' trước khi khớp. 'M01' trơ (không bit,
 *  không cỡ B/W/D, không %) KHÔNG tính là địa chỉ. */
const ADDRESS_RE = /^%?(P?[IQEMABO][BWD]\d+(\.\d+)?|P?[IQEMABO]\d+\.\d+|DB\d+\.DB[WDXB]\d+(\.\d+)?)$/i;

function looksLikeAddress(value: string): boolean {
  const v = value.replace(/\s+/g, '').replace(/:P$/i, '');
  return v !== '' && ADDRESS_RE.test(v);
}

/** Tập signalType §8.3 + dạng Đức DE/DA/AE/AA (xuất hiện trong ví dụ
 *  transform §8.4). */
const SIGNAL_TYPE_VALUES = new Set(['DI', 'DO', 'AI', 'AO', 'DE', 'DA', 'AE', 'AA']);

function looksLikeSignalType(value: string): boolean {
  return SIGNAL_TYPE_VALUES.has(value.trim().toUpperCase());
}

function toNumber(cell: string | number | boolean | null): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  if (typeof cell === 'string') {
    const trimmed = cell.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Giá trị không trống của một cột trong tối đa 500 dòng dữ liệu sau
 *  header (bỏ null, chuỗi rỗng, boolean — boolean không phải địa chỉ/
 *  type/range). 500 đủ lớn để cột ID 1..300 không bị gợi ý range nhầm
 *  (100 giá trị đầu đều ≤ 100), vẫn rẻ trên file 20 000 dòng. */
function sampleColumnValues(grid: RawGrid, headerIndex: number, columnIndex: number): (string | number)[] {
  const values: (string | number)[] = [];
  for (let i = headerIndex + 1; i < grid.rows.length && values.length < 500; i += 1) {
    const row = grid.rows[i];
    if (row === undefined) continue;
    const cell = row[columnIndex];
    if (cell === null || cell === undefined) continue;
    if (typeof cell === 'string') {
      if (cell.trim() !== '') values.push(cell);
    } else if (typeof cell === 'number') {
      values.push(cell);
    }
  }
  return values;
}

export function headerRowIndex(grid: RawGrid, headerRow: number): number {
  const idx = grid.rowNumbers?.indexOf(headerRow);
  return idx !== undefined && idx >= 0 ? idx : headerRow - 1;
}

function headerCellText(grid: RawGrid, headerIndex: number, columnIndex: number): string {
  const row = grid.rows[headerIndex];
  if (row === undefined) return '';
  const cell = row[columnIndex];
  if (cell === null || cell === undefined) return '';
  return typeof cell === 'string' ? cell : String(cell);
}

/** Gợi ý mapping cho một lưới đã biết headerRow (1-based).
 *  1. Theo tên cột (confidence cao): mỗi field lấy cột khớp tốt nhất —
 *     synonym đứng trước trong danh sách §8.3 thắng, hòa → cột trái nhất.
 *  2. Content sniffing (confidence trung bình): cột > 70% giá trị khớp
 *     regex địa chỉ → address; tập {DI,DO,AI,AO,DE,DA,AE,AA} > 70% →
 *     signalType; cột số ≥ 70% giá trị trong [0,100] → range, cột
 *     range-like đầu tiên (trái→phải) → engMin, cột tiếp theo → engMax
 *     (OQ-334; [4,20] ⊂ [0,100] nên hợp là [0,100]). Content ĐIỀN field
 *     chưa có gợi ý theo tên, và ĐẢO gợi ý theo tên chỉ khi tên đó thuộc
 *     nhóm cấu trúc (rack/slot/channel/module) — gợi ý field lõi không bị
 *     đảo, range không đảo.
 *  Trả về theo thứ tự cột (trái→phải); field không gợi ý được thì vắng
 *  mặt — UI/CLI báo rõ, không đoán im lặng. */
export function suggestMapping(grid: RawGrid, headerRow: number): MappingSuggestion[] {
  const headerIndex = headerRowIndex(grid, headerRow);
  const headerRowCells = grid.rows[headerIndex];
  if (headerRowCells === undefined) return [];
  const columnCount = headerRowCells.length;

  const byField = new Map<CanonicalField, MappingSuggestion>();
  const columnOfField = new Map<CanonicalField, number>();
  const suggestedColumns = new Set<number>();
  /** Field mà mỗi cột được gợi ý theo tên (để luật đảo biết cột nào
   *  đang giữ gợi ý cấu trúc). */
  const fieldOfColumn = new Map<number, CanonicalField>();

  // Theo tên cột: mỗi field lấy cột khớp tốt nhất — synonym đứng trước
  // trong danh sách §8.3 thắng, hòa → cột trái nhất.
  const bestByField = new Map<CanonicalField, { columnIndex: number; priority: number; raw: string; synonym: string }>();
  for (let c = 0; c < columnCount; c += 1) {
    const raw = headerCellText(grid, headerIndex, c);
    if (raw.trim() === '') continue;
    const entry = SYNONYM_LOOKUP.get(normalizeColumnName(raw));
    if (entry === undefined) continue;
    const current = bestByField.get(entry.field);
    if (
      current === undefined ||
      entry.priority < current.priority ||
      (entry.priority === current.priority && c < current.columnIndex)
    ) {
      bestByField.set(entry.field, { columnIndex: c, priority: entry.priority, raw, synonym: entry.raw });
    }
  }
  for (const [field, best] of bestByField) {
    byField.set(field, {
      field,
      column: best.raw,
      confidence: 'high',
      reason: `tên cột "${best.raw}" khớp synonym "${best.synonym}" của ${field}`,
    });
    suggestedColumns.add(best.columnIndex);
    columnOfField.set(field, best.columnIndex);
  }

  for (const [field, best] of bestByField) {
    byField.set(field, {
      field,
      column: best.raw,
      confidence: 'high',
      reason: `tên cột "${best.raw}" khớp synonym "${best.synonym}" của ${field}`,
    });
    suggestedColumns.add(best.columnIndex);
    columnOfField.set(field, best.columnIndex);
    fieldOfColumn.set(best.columnIndex, field);
  }

  const ratio = (values: (string | number)[], test: (v: string | number) => boolean): number => {
    if (values.length === 0) return 0;
    return values.filter(test).length / values.length;
  };
  const samples = new Map<number, (string | number)[]>();
  const sampleOf = (c: number): (string | number)[] => {
    const cached = samples.get(c);
    if (cached !== undefined) return cached;
    const values = sampleColumnValues(grid, headerIndex, c);
    samples.set(c, values);
    return values;
  };

  /** Field cấu trúc (rack/slot/channel/module): gợi ý theo tên của chúng
   *  có thể bị content sniffing đảo khi nội dung khớp rõ address/
   *  signalType — các synonym này (kanal, baugruppe, ch...) là từ chung
   *  hay đặt tên cột dữ liệu. */
  const STRUCTURAL_FIELDS: ReadonlySet<CanonicalField> = new Set(['rack', 'slot', 'channel', 'module']);

  /** Gợi ý một field bằng nội dung: cột ứng viên là cột chưa gợi ý, hoặc
   *  cột đang giữ gợi ý cấu trúc (→ đảo, reason nêu rõ). Field lõi đã có
   *  gợi ý theo tên thì không xét. Trả về true nếu đã gợi ý. */
  const suggestByContent = (
    field: 'address' | 'signalType',
    test: (v: string | number) => boolean,
    evidence: (matched: number, total: number) => string,
  ): boolean => {
    if (byField.has(field)) return false;
    let bestCol: number | null = null;
    let bestRatio = 0.7;
    for (let c = 0; c < columnCount; c += 1) {
      const current = fieldOfColumn.get(c);
      if (current !== undefined && !STRUCTURAL_FIELDS.has(current)) continue;
      const r = ratio(sampleOf(c), test);
      if (r > bestRatio) {
        bestRatio = r;
        bestCol = c;
      }
    }
    if (bestCol === null) return false;
    const values = sampleOf(bestCol);
    const matched = values.filter(test).length;
    const overturned = fieldOfColumn.get(bestCol);
    if (overturned !== undefined) {
      const prev = bestByField.get(overturned);
      byField.delete(overturned);
      columnOfField.delete(overturned);
      suggestedColumns.delete(bestCol);
      fieldOfColumn.delete(bestCol);
      byField.set(field, {
        field,
        column: headerCellText(grid, headerIndex, bestCol),
        confidence: 'medium',
        reason: `tên cột "${headerCellText(grid, headerIndex, bestCol)}" khớp synonym "${prev?.synonym ?? ''}" của ${overturned}, nhưng ${evidence(matched, values.length)} nên gợi ý ${field}`,
      });
    } else {
      byField.set(field, {
        field,
        column: headerCellText(grid, headerIndex, bestCol),
        confidence: 'medium',
        reason: evidence(matched, values.length),
      });
    }
    suggestedColumns.add(bestCol);
    columnOfField.set(field, bestCol);
    fieldOfColumn.set(bestCol, field);
    return true;
  };

  // Address: cột có tỷ lệ khớp regex địa chỉ cao nhất (> 70%).
  suggestByContent(
    'address',
    (v) => typeof v === 'string' && looksLikeAddress(v),
    (matched, total) => `${String(matched)}/${String(total)} giá trị khớp mẫu địa chỉ`,
  );

  // SignalType: cột có tỷ lệ giá trị trong tập DI/DO/AI/AO/... cao nhất (> 70%).
  suggestByContent(
    'signalType',
    (v) => typeof v === 'string' && looksLikeSignalType(v),
    (matched, total) => `${String(matched)}/${String(total)} giá trị thuộc tập {DI, DO, AI, AO, ...}`,
  );

  const unsuggestedColumns: number[] = [];
  for (let c = 0; c < columnCount; c += 1) {
    if (!suggestedColumns.has(c)) unsuggestedColumns.push(c);
  }

  // Range: cột số có ≥ 70% giá trị trong [0,100] → engMin rồi engMax
  // (trái→phải). Không phân biệt được min/max từ nội dung — reason nêu rõ.
  // Range KHÔNG đảo gợi ý theo tên (cột channel vốn là số).
  for (const field of ['engMin', 'engMax'] as const) {
    if (byField.has(field)) continue;
    for (const c of unsuggestedColumns) {
      if (suggestedColumns.has(c)) continue;
      const values = sampleOf(c);
      const inRange = values.filter((v) => {
        const n = toNumber(v);
        return n !== null && n >= 0 && n <= 100;
      }).length;
      if (values.length > 0 && inRange / values.length >= 0.7) {
        byField.set(field, {
          field,
          column: headerCellText(grid, headerIndex, c),
          confidence: 'medium',
          reason: `${String(inRange)}/${String(values.length)} giá trị số trong [0,100]; không phân biệt được min/max từ nội dung — kiểm tra lại`,
        });
        suggestedColumns.add(c);
        columnOfField.set(field, c);
        break;
      }
    }
  }

  return [...byField.values()].sort(
    (a, b) => (columnOfField.get(a.field) ?? 0) - (columnOfField.get(b.field) ?? 0),
  );
}

export function columnIndexToLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Cột station/area (theo tên header) có merge dọc — trả về chữ cột +
 *  tên header gốc. Dùng để điền fillDownColumns của profile (tên) và để
 *  gọi applyFillDown (chữ cột). */
export function findStationAreaColumns(grid: RawGrid, headerRow: number): { letter: string; name: string }[] {
  const headerIndex = headerRowIndex(grid, headerRow);
  const headerRowCells = grid.rows[headerIndex];
  if (headerRowCells === undefined) return [];
  const merges = grid.meta?.merges ?? [];
  const mergedCols = new Set<number>();
  for (const range of merges) {
    const parsed = parseMergeRange(range);
    if (parsed !== null && parsed.startCol === parsed.endCol && parsed.endRow > parsed.startRow) {
      mergedCols.add(parsed.startCol);
    }
  }
  const found: { letter: string; name: string }[] = [];
  for (let c = 0; c < headerRowCells.length; c += 1) {
    const raw = headerCellText(grid, headerIndex, c);
    if (raw.trim() === '') continue;
    const normalized = normalizeColumnName(raw);
    if ((normalized === 'station' || normalized === 'area') && mergedCols.has(c)) {
      found.push({ letter: columnIndexToLetter(c), name: raw });
    }
  }
  return found;
}

/** Chữ cột của các cột station/area có merge dọc (để gọi applyFillDown). */
export function detectFillDownColumns(grid: RawGrid, headerRow: number): string[] {
  return findStationAreaColumns(grid, headerRow).map((f) => f.letter);
}
