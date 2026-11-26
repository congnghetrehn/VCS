// Lệnh `vcs import-io <file>` — @vcs/cli (M2 §8, P2.5 commit 6, OQ-339).
// Đọc I/O list CSV/XLSX → dò header → gợi ý mapping → transform → in
// preview 50 dòng + mapping JSON. Chưa --commit/--report (P2.6).
// Exit: 0 ok, 2 lỗi đọc/header/profile, 3 sai tham số (mirror run/plant).

import { readFile } from 'node:fs/promises';
import {
  applyFillDown,
  applyTransforms,
  columnIndexToLetter,
  detectFillDownColumns,
  detectHeader,
  gridToRecords,
  ImportReadError,
  loadProfile,
  matchesProfile,
  normalizeColumnName,
  readCsvFile,
  readXlsxFile,
  suggestMapping,
  type CanonicalField,
  type ImportProfile,
  type MappingSuggestion,
  type RawGrid,
} from '@vcs/importers';

export interface ImportIoOptions {
  sheet?: string;
  profile?: string;
  json?: boolean;
}

interface MappingDisplay {
  field: string;
  column: string;
  source: 'profile' | 'suggest';
  confidence: 'high' | 'medium';
  reason: string;
}

function headerCells(grid: RawGrid, headerRow: number): string[] {
  const idx = grid.rowNumbers?.indexOf(headerRow) ?? headerRow - 1;
  const row = grid.rows[idx] ?? [];
  return row.map((c) => (typeof c === 'string' ? c : c === null ? '' : String(c)));
}

function formatValue(v: string | number | boolean | null): string {
  if (v === null) return '(trống)';
  if (typeof v === 'string') {
    const s = v.length > 24 ? `${v.slice(0, 24)}…` : v;
    return `"${s}"`;
  }
  return String(v);
}

function previewValue(v: string | number | boolean | null): string {
  if (v === null) return '(trống)';
  const s = String(v);
  return s.length > 24 ? `${s.slice(0, 24)}…` : s;
}

export async function importIoCommand(file: string | undefined, opts?: ImportIoOptions): Promise<number> {
  const o: ImportIoOptions = opts ?? {};
  if (file === undefined || file === '') {
    console.error('vcs import-io: thiếu <file> — dùng: vcs import-io <file> [--sheet X] [--profile <yaml>] [--json]');
    return 3;
  }
  const lower = file.toLowerCase();
  const isCsv = lower.endsWith('.csv');
  const isXlsx = lower.endsWith('.xlsx');
  if (!isCsv && !isXlsx) {
    if (lower.endsWith('.xls')) {
      console.error('vcs import-io: chỉ hỗ trợ .xlsx (không đọc được .xls cũ) và .csv');
    } else {
      console.error('vcs import-io: chỉ hỗ trợ file .csv/.xlsx');
    }
    return 3;
  }
  if (isCsv && o.sheet !== undefined) {
    console.error('vcs import-io: cảnh báo: --sheet chỉ dùng cho XLSX, bỏ qua với CSV');
  }

  let profile: ImportProfile | undefined;
  if (o.profile !== undefined) {
    try {
      const text = await readFile(o.profile, 'utf-8');
      profile = loadProfile(text);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`vcs import-io: không đọc được profile ${o.profile}: ${detail}`);
      return 2;
    }
  }

  let grid: RawGrid;
  try {
    if (isCsv) {
      grid = await readCsvFile(
        file,
        profile?.delimiter !== undefined && profile.delimiter !== 'auto'
          ? { delimiter: profile.delimiter }
          : {},
      );
    } else {
      grid = await readXlsxFile(file, o.sheet !== undefined ? { sheet: o.sheet } : {});
    }
  } catch (err) {
    if (err instanceof ImportReadError) {
      console.error(`vcs import-io: ${err.message}`);
      return 2;
    }
    throw err;
  }

  // Header: tự dò; profile (nếu khớp) có thể ghi đè headerRow/firstDataRow.
  const guess = detectHeader(grid);
  if (profile !== undefined) {
    const matchHeaders =
      guess !== null
        ? headerCells(grid, guess.headerRow)
        : profile.headerRow !== undefined
          ? headerCells(grid, profile.headerRow)
          : null;
    if (matchHeaders === null) {
      console.error(
        'vcs import-io: không tìm thấy dòng header (cần ≥ 3 khớp synonym) và profile không có headerRow — chỉnh headerRow trong profile',
      );
      return 2;
    }
    if (!matchesProfile(profile, grid.origin.sheet, matchHeaders)) {
      if (guess === null) {
        console.error('vcs import-io: profile không khớp file và không dò được header tự động — chỉnh profile (sheet/header) rồi chạy lại');
        return 2;
      }
      console.error(
        'vcs import-io: cảnh báo: profile không khớp file (sheet/header) — bỏ qua profile, dùng gợi ý tự động',
      );
      profile = undefined;
    }
  }
  const headerRow = profile?.headerRow ?? guess?.headerRow;
  const firstDataRow = profile?.firstDataRow ?? guess?.firstDataRow;
  if (headerRow === undefined || firstDataRow === undefined) {
    console.error(
      'vcs import-io: không tìm thấy dòng header (cần ≥ 3 khớp synonym) — chỉnh headerRow trong profile (--profile) rồi chạy lại',
    );
    return 2;
  }

  // Fill-down: profile (theo tên) ưu tiên, không thì tự phát hiện merge dọc
  // ở cột station/area.
  const headers = headerCells(grid, headerRow);
  let fillDownLetters: string[];
  if (profile !== undefined && profile.fillDownColumns.length > 0) {
    fillDownLetters = [];
    for (const name of profile.fillDownColumns) {
      const col = headers.findIndex((h) => normalizeColumnName(h) === normalizeColumnName(name));
      if (col < 0) {
        console.error(`vcs import-io: cảnh báo: fillDownColumns '${name}' không khớp cột nào — bỏ qua`);
        continue;
      }
      fillDownLetters.push(columnIndexToLetter(col));
    }
  } else {
    fillDownLetters = detectFillDownColumns(grid, headerRow);
  }
  if (fillDownLetters.length > 0) grid = applyFillDown(grid, fillDownLetters);

  // Mapping: profile (nếu có) ưu tiên, không thì gợi ý tự động.
  let mappingDisplay: MappingDisplay[];
  let mappingRecord: Partial<Record<CanonicalField, string>>;
  if (profile !== undefined && Object.keys(profile.mapping).length > 0) {
    mappingRecord = profile.mapping;
    mappingDisplay = Object.entries(profile.mapping).map(([field, column]) => ({
      field,
      column,
      source: 'profile' as const,
      confidence: 'high' as const,
      reason: `theo profile ${profile.name}`,
    }));
  } else {
    const suggestions: MappingSuggestion[] = suggestMapping(grid, headerRow);
    mappingRecord = {};
    mappingDisplay = suggestions.map((s) => {
      mappingRecord[s.field] = s.column;
      return { field: s.field, column: s.column, source: 'suggest' as const, confidence: s.confidence, reason: s.reason };
    });
  }
  if (mappingDisplay.length === 0) {
    console.error('vcs import-io: cảnh báo: không gợi ý được mapping cho field nào — kiểm tra dòng header');
  }

  const records = gridToRecords(grid, headerRow, firstDataRow, mappingRecord, profile?.lastDataRow ?? null);
  const { rows: transformed, changed } = applyTransforms(records, profile?.transforms ?? []);
  const preview = transformed.slice(0, 50);

  if (o.json === true) {
    console.log(
      JSON.stringify(
        {
          file,
          sheet: grid.origin.sheet ?? null,
          format: isCsv ? 'csv' : 'xlsx',
          encoding: grid.meta?.encoding ?? 'auto',
          delimiter: grid.meta?.delimiter ?? 'auto',
          headerRow,
          firstDataRow,
          lastDataRow: profile?.lastDataRow ?? null,
          gridRows: grid.rows.length,
          totalRows: records.length,
          mapping: mappingDisplay,
          preview,
          changed,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const formatLine = isCsv
    ? `File: ${file} (CSV, encoding ${grid.meta?.encoding ?? 'auto'}, delimiter '${grid.meta?.delimiter ?? 'auto'}')`
    : `File: ${file} (XLSX, sheet "${grid.origin.sheet ?? ''}", ${String(grid.sheets?.length ?? 0)} sheet)`;
  console.log(formatLine);
  console.log(`Lưới: ${String(grid.rows.length)} dòng · Header: dòng ${String(headerRow)} · Dữ liệu từ dòng ${String(firstDataRow)} · Bản ghi: ${String(records.length)}`);
  console.log(`Mapping (${String(mappingDisplay.length)} field):`);
  const fieldWidth = Math.max(0, ...mappingDisplay.map((m) => m.field.length));
  for (const m of mappingDisplay) {
    console.log(`  ${m.field.padEnd(fieldWidth)} <- ${m.column} [${m.confidence}, ${m.source}] ${m.reason}`);
  }
  console.log(`Preview (${String(preview.length)}/${String(records.length)} bản ghi):`);
  const fields = mappingDisplay.map((m) => m.field);
  preview.forEach((record, i) => {
    const parts = fields.map((f) => `${f}=${previewValue(record[f] ?? null)}`);
    console.log(`  #${String(i + 1)} ${parts.join(' ')}`);
  });
  console.log(`Thay đổi do transform (${String(changed.length)}):`);
  const shown = changed.slice(0, 20);
  for (const c of shown) {
    console.log(`  #${String(c.row + 1)} ${c.field}: ${formatValue(c.from)} → ${formatValue(c.to)} (${c.op})`);
  }
  if (changed.length > shown.length) {
    console.log(`  … và ${String(changed.length - shown.length)} thay đổi nữa`);
  }
  return 0;
}
