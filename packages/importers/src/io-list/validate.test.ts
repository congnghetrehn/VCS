// Test validate mã IO-* (M2 §8.7, P2.6 commit 4).
// Fixture 300 tín hiệu là ground truth: số đếm trong test này đã đo
// bằng script độc lập trước commit 4 (IO-E001 ×6, IO-E011 ×12,
// IO-E003 ×0, IO-W030 ×23, còn lại ×0) — không đoán số.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildProfile } from './profile.js';
import { detectHeader } from './header-detect.js';
import { suggestMapping } from './mapping.js';
import { readCsvFile } from './read-csv.js';
import type { CellValue } from './read-csv.js';
import { applyTransforms, gridToRecords } from './transform.js';
import type { IoRecord } from './transform.js';
import { isEmptyRow, recordRowNumbers, validateImport } from './validate.js';
import type { ValidateOptions, ValidateResult } from './validate.js';
import { importProfileSchema, type CanonicalField, type ImportProfile } from '@vcs/schemas';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const FIXTURE_CSV = join(ROOT, 'fixtures', 'io-list-300.csv');
const ORIGIN = { file: 'io-list-300.csv' };

function rec(partial: Record<string, CellValue>): IoRecord {
  const out: IoRecord = {};
  for (const [k, v] of Object.entries(partial)) out[k] = v;
  return out;
}

function validate(
  records: IoRecord[],
  opts: Omit<ValidateOptions, 'origin'> & { rowNumbers?: number[] } = {},
): ValidateResult {
  const { rowNumbers, ...rest } = opts;
  return validateImport({
    records,
    rowNumbers: rowNumbers ?? records.map((_, i) => i + 7),
    origin: ORIGIN,
    ...rest,
  });
}

function codesOf(result: ReturnType<typeof validateImport>, code: string): { row: number; severity: string }[] {
  return result.diagnostics
    .filter((d) => d.code === code)
    .map((d) => ({ row: d.line ?? -1, severity: d.severity }));
}

describe('validateImport — từng mã (§8.7)', () => {
  it('IO-E001: trùng tag (case-insensitive) — chỉ báo dòng sau', () => {
    const r = validate([
      rec({ tag: 'PUMP1', address: '%I0.0', signalType: 'DI' }),
      rec({ tag: 'pump1', address: '%I0.1', signalType: 'DI' }),
      rec({ tag: 'PUMP2', address: '%I0.2', signalType: 'DI' }),
    ]);
    expect(codesOf(r, 'IO-E001')).toEqual([{ row: 8, severity: 'error' }]);
  });

  it('IO-E002: tag trống; tag > 128 ký tự', () => {
    const r = validate([
      rec({ tag: '', address: '%I0.0', signalType: 'DI' }),
      rec({ tag: 'A'.repeat(129), address: '%I0.1', signalType: 'DI' }),
      rec({ tag: 'OK', address: '%I0.2', signalType: 'DI' }),
    ]);
    expect(codesOf(r, 'IO-E002')).toEqual([
      { row: 7, severity: 'error' },
      { row: 8, severity: 'error' },
    ]);
  });

  it('IO-E003: thiếu signalType, không suy được kind (%M / DB / byte)', () => {
    const r = validate([
      rec({ tag: 'A', address: '%M0.0' }),
      rec({ tag: 'B', address: 'DB1.DBX0.0' }),
      rec({ tag: 'C', address: '%IB0' }),
      rec({ tag: 'D', address: '%I0.0' }),
    ]);
    expect(codesOf(r, 'IO-E003')).toEqual([
      { row: 7, severity: 'error' },
      { row: 8, severity: 'error' },
      { row: 9, severity: 'error' },
    ]);
    // D suy kind DI từ %I0.0 → không lỗi, inferredKinds = 1.
    expect(r.stats.inferredKinds).toBe(1);
  });

  it('IO-E010: địa chỉ không hợp lệ (và không kèm IO-E003)', () => {
    const r = validate([rec({ tag: 'A', address: 'XYZ', signalType: 'DI' })]);
    expect(codesOf(r, 'IO-E010')).toHaveLength(1);
    expect(codesOf(r, 'IO-E003')).toHaveLength(0);
    expect(r.diagnostics[0]?.message).toContain('XYZ');
  });

  it('IO-E012: hướng sai — DI/AI ở Q, DO/AO ở I, kind ở M/DB', () => {
    const r = validate([
      rec({ tag: 'A', address: '%Q0.0', signalType: 'DI' }),
      rec({ tag: 'B', address: '%I0.0', signalType: 'DO' }),
      rec({ tag: 'C', address: '%M0.0', signalType: 'DI' }),
      rec({ tag: 'D', address: '%QW64', signalType: 'AI' }),
      rec({ tag: 'E', address: '%IW64', signalType: 'AO' }),
    ]);
    expect(codesOf(r, 'IO-E012').map((d) => d.row)).toEqual([7, 8, 9, 10, 11]);
  });

  it('IO-E013: kind không khớp width — DI ở Word, AI ở bit/byte, AO ở byte', () => {
    const r = validate([
      rec({ tag: 'A', address: '%IW64', signalType: 'DI' }),
      rec({ tag: 'B', address: '%I0.0', signalType: 'AI' }),
      rec({ tag: 'C', address: '%IB0', signalType: 'AO' }),
      rec({ tag: 'D', address: '%Q0.0', signalType: 'DO' }),
    ]);
    expect(codesOf(r, 'IO-E013').map((d) => d.row)).toEqual([7, 8, 9]);
    // A: DI ở I nên không IO-E012; C: AO ở I nên kèm IO-E012.
    expect(codesOf(r, 'IO-E012').map((d) => d.row)).toEqual([9]);
  });

  it('IO-W001: AI/AO thiếu engMin/engMax; DI không cần', () => {
    const r = validate([
      rec({ tag: 'A', address: '%IW64', signalType: 'AI' }),
      rec({ tag: 'B', address: '%IW66', signalType: 'AO', engMin: 0, engMax: 100 }),
      rec({ tag: 'C', address: '%I0.0', signalType: 'DI' }),
    ]);
    expect(codesOf(r, 'IO-W001')).toEqual([{ row: 7, severity: 'warning' }]);
  });

  it('IO-W002: tên tag có ký tự không chuẩn → dùng tên đã làm sạch (bảng 3: space → _ KHÔNG báo)', () => {
    const r = validate([rec({ tag: 'PUMP!1', address: '%I0.0', signalType: 'DI' })]);
    const w = codesOf(r, 'IO-W002');
    expect(w).toEqual([{ row: 7, severity: 'warning' }]);
    expect(r.diagnostics.find((d) => d.code === 'IO-W002')?.message).toContain('PUMP_1');
    expect(r.signals[0]?.tag).toBe('PUMP_1');
    // Space chỉ thay bằng _ (bảng 3) — không IO-W002.
    const r2 = validate([rec({ tag: 'PUMP 1', address: '%I0.0', signalType: 'DI' })]);
    expect(codesOf(r2, 'IO-W002')).toHaveLength(0);
    expect(r2.signals[0]?.tag).toBe('PUMP_1');
  });

  it('IO-W003: Word byte lẻ, DWord byte không chia hết cho 4 (kể cả DB)', () => {
    const r = validate([
      rec({ tag: 'A', address: '%IW65', signalType: 'AI', engMin: 0, engMax: 100 }),
      rec({ tag: 'B', address: '%ID66', signalType: 'AI', engMin: 0, engMax: 100 }),
      rec({ tag: 'C', address: 'DB1.DBW5', signalType: 'AI', engMin: 0, engMax: 100 }),
      rec({ tag: 'D', address: '%IW64', signalType: 'AI', engMin: 0, engMax: 100 }),
      rec({ tag: 'E', address: '%ID68', signalType: 'AI', engMin: 0, engMax: 100 }),
    ]);
    expect(codesOf(r, 'IO-W003').map((d) => d.row)).toEqual([7, 8, 9]);
  });

  it('IO-W010: I/Q/M vượt 1024 byte; DB không giới hạn', () => {
    const r = validate([
      rec({ tag: 'A', address: '%IW1024', signalType: 'AI', engMin: 0, engMax: 100 }),
      rec({ tag: 'B', address: '%I1023.7', signalType: 'DI' }),
      rec({ tag: 'C', address: 'DB1.DBW2000', signalType: 'AI', engMin: 0, engMax: 100 }),
    ]);
    expect(codesOf(r, 'IO-W010')).toEqual([{ row: 7, severity: 'warning' }]);
  });

  it('IO-W020: controller chưa khai báo; không có danh sách khai báo thì không kiểm', () => {
    const r1 = validate([rec({ tag: 'A', address: '%I0.0', signalType: 'DI', controller: 'PLC2' })], {
      declaredControllers: ['PLC1'],
    });
    expect(codesOf(r1, 'IO-W020')).toEqual([{ row: 7, severity: 'warning' }]);
    const r2 = validate([rec({ tag: 'A', address: '%I0.0', signalType: 'DI', controller: 'PLC2' })]);
    expect(codesOf(r2, 'IO-W020')).toHaveLength(0);
  });

  it('IO-W030: tiền tố peripheral P/:P — strip về chuẩn', () => {
    const r = validate([
      rec({ tag: 'A', address: 'PEW64', signalType: 'AI', engMin: 0, engMax: 100 }),
      rec({ tag: 'B', address: '%I0.0:P', signalType: 'DI' }),
    ]);
    expect(codesOf(r, 'IO-W030').map((d) => d.row)).toEqual([7, 8]);
    expect(r.signals[0]?.address?.canonical).toBe('%IW64');
  });

  it('IO-W040: engMin ≥ engMax; non-number → IO-W040 + IO-W001', () => {
    const r = validate([
      rec({ tag: 'A', address: '%IW64', signalType: 'AI', engMin: 100, engMax: 0 }),
      rec({ tag: 'B', address: '%IW66', signalType: 'AI', engMin: 'abc', engMax: 100 }),
      rec({ tag: 'C', address: '%IW68', signalType: 'AI', engMin: 0, engMax: 100 }),
    ]);
    expect(codesOf(r, 'IO-W040').map((d) => d.row)).toEqual([7, 8]);
    expect(codesOf(r, 'IO-W001').map((d) => d.row)).toEqual([8]);
  });

  it('IO-I001: dòng trống bị bỏ qua, chỉ báo IO-I001', () => {
    const r = validate([
      rec({ tag: '', address: '', signalType: '', description: '', equipment: '' }),
      rec({ tag: '   ', address: null, signalType: null }),
      rec({ tag: 'A', address: '%I0.0', signalType: 'DI' }),
    ]);
    expect(codesOf(r, 'IO-I001').map((d) => d.row)).toEqual([7, 8]);
    expect(r.stats.skippedRows).toBe(2);
    expect(r.stats.records).toBe(1);
    expect(r.diagnostics).toHaveLength(2);
  });

  it('IO-E011: chồng địa chỉ — báo CẢ HAI dòng; không chồng thì không báo', () => {
    const r = validate([
      rec({ tag: 'A', address: '%IW64', signalType: 'AI', engMin: 0, engMax: 100 }),
      rec({ tag: 'B', address: '%I64.0', signalType: 'DI' }),
      rec({ tag: 'C', address: '%I66.0', signalType: 'DI' }),
      rec({ tag: 'D', address: 'DB1.DBW0', signalType: 'AI', engMin: 0, engMax: 100 }),
      rec({ tag: 'E', address: 'DB1.DBX0.0', signalType: 'DI' }),
      rec({ tag: 'F', address: '%IW64', signalType: 'AI', engMin: 0, engMax: 100, controller: 'PLC2' }),
    ]);
    expect(codesOf(r, 'IO-E011').map((d) => d.row).sort((a, b) => a - b)).toEqual([7, 8, 10, 11]);
    // F cùng địa chỉ nhưng khác controller → không chồng.
  });

  it('PL-W010: tag đã gán thiết bị không còn trong file import', () => {
    const assigned = [{ tag: 'RUN_CMD', equipment: 'M01', role: 'runCmd' }];
    const r1 = validate([rec({ tag: 'RUN_FB', address: '%I0.0', signalType: 'DI' })], { assignedTags: assigned });
    expect(codesOf(r1, 'PL-W010')).toEqual([{ row: -1, severity: 'warning' }]);
    expect(r1.diagnostics.find((d) => d.code === 'PL-W010')?.message).toContain('M01.runCmd');
    const r2 = validate([rec({ tag: 'run_cmd', address: '%Q0.0', signalType: 'DO' })], { assignedTags: assigned });
    expect(codesOf(r2, 'PL-W010')).toHaveLength(0);
  });

  it('sym: có kind → không IO-E012/E013 (không có area/width để kiểm)', () => {
    const r = validate([rec({ tag: 'A', address: 'sym:Speed', signalType: 'AI', engMin: 0, engMax: 100 })]);
    expect(r.diagnostics).toHaveLength(0);
    expect(r.signals[0]?.tagDef?.type).toBe('Int');
  });
});

describe('validateImport — mức độ (OQ-348)', () => {
  function profileWith(rules: ImportProfile['rules']): ImportProfile {
    const base = importProfileSchema.parse({ name: 'test' });
    return { ...base, rules: { ...base.rules, ...rules } };
  }

  it('overrides theo mã thắng khóa nhóm; khóa nhóm thắng catalog', () => {
    const ai = rec({ tag: 'A', address: '%IW64', signalType: 'AI' });
    const groupError = validate([ai], { profile: profileWith({ missingRange: 'error' }) });
    expect(codesOf(groupError, 'IO-W001')).toEqual([{ row: 7, severity: 'error' }]);
    const overrideWins = validate([ai], {
      profile: profileWith({ missingRange: 'error', overrides: { 'IO-W001': 'warn' } }),
    });
    expect(codesOf(overrideWins, 'IO-W001')).toEqual([{ row: 7, severity: 'warning' }]);
    const overrideError = validate([ai], { profile: profileWith({ overrides: { 'IO-W001': 'error' } }) });
    expect(codesOf(overrideError, 'IO-W001')).toEqual([{ row: 7, severity: 'error' }]);
  });

  it("overrides 'ignore' → không emit diagnostic đó", () => {
    const r = validate([rec({ tag: 'A', address: 'PEW64', signalType: 'AI', engMin: 0, engMax: 100 })], {
      profile: profileWith({ overrides: { 'IO-W030': 'ignore' } }),
    });
    expect(r.diagnostics).toHaveLength(0);
  });

  it('IO-E001 hạ xuống warning qua overrides vẫn emit (dạng warning)', () => {
    const r = validate(
      [
        rec({ tag: 'A', address: '%I0.0', signalType: 'DI' }),
        rec({ tag: 'a', address: '%I0.1', signalType: 'DI' }),
      ],
      { profile: profileWith({ overrides: { 'IO-E001': 'warn' } }) },
    );
    expect(codesOf(r, 'IO-E001')).toEqual([{ row: 8, severity: 'warning' }]);
  });
});

describe('validateImport — thứ tự + thống kê', () => {
  it('diagnostics sort theo (row, code); stats đếm theo mức độ hiệu dụng', () => {
    const r = validate([
      rec({ tag: 'B', address: '%IW65', signalType: 'AI', engMin: 0, engMax: 100 }),
      rec({ tag: 'b', address: '%I0.0', signalType: 'DI' }),
    ]);
    const rows = r.diagnostics.map((d) => d.line ?? -1);
    expect([...rows].sort((a, b) => a - b)).toEqual(rows);
    expect(r.stats.errors).toBe(1);
    expect(r.stats.warnings).toBe(1);
    expect(r.stats.diagnosticsByCode).toEqual({ 'IO-E001': 1, 'IO-W003': 1 });
  });

  it('recordRowNumbers căn đúng với gridToRecords (header 6, data từ 7)', async () => {
    const grid = await readCsvFile(FIXTURE_CSV);
    const rows = recordRowNumbers(grid, 7);
    expect(rows).toHaveLength(300);
    expect(rows[0]).toBe(7);
    expect(rows[299]).toBe(306);
  });

  it('isEmptyRow: chỉ trống khi cả 5 trường đều trống', () => {
    expect(isEmptyRow(rec({ tag: '', address: '', signalType: '' }))).toBe(true);
    expect(isEmptyRow(rec({ tag: '', address: '', signalType: '', equipment: 'X' }))).toBe(false);
    expect(isEmptyRow(rec({ tag: 0, address: '' }))).toBe(false);
  });
});

describe('validateImport — fixture 300 tín hiệu (ground truth, đã đếm trước commit 4)', () => {
  it('số đếm theo mã khớp script đếm độc lập', async () => {
    const grid = await readCsvFile(FIXTURE_CSV);
    const header = detectHeader(grid);
    const headerRow = header?.headerRow ?? 6;
    const firstDataRow = header?.firstDataRow ?? 7;
    expect(headerRow).toBe(6);
    expect(firstDataRow).toBe(7);
    const suggestions = suggestMapping(grid, headerRow);
    const profile = buildProfile(grid, headerRow, firstDataRow, suggestions, { name: 'io-list-300' });
    const mapping: Partial<Record<CanonicalField, string>> = {};
    for (const s of suggestions) mapping[s.field] = s.column;
    const records = gridToRecords(grid, headerRow, firstDataRow, mapping);
    const transformed = applyTransforms(records, profile.transforms);
    const rowNumbers = recordRowNumbers(grid, firstDataRow);
    const r = validateImport({
      records: transformed.rows,
      rowNumbers,
      origin: ORIGIN,
      profile,
      declaredControllers: ['PLC1'],
    });
    expect(r.stats.records).toBe(300);
    expect(r.stats.skippedRows).toBe(0);
    expect(r.stats.inferredKinds).toBe(15);
    expect(r.stats.errors).toBe(18);
    expect(r.stats.warnings).toBe(23);
    expect(r.stats.infos).toBe(0);
    expect(r.stats.diagnosticsByCode).toEqual({
      'IO-E001': 6,
      'IO-E011': 12,
      'IO-W030': 23,
    });
    expect(r.diagnostics).toHaveLength(41);
    expect(codesOf(r, 'IO-E011').map((d) => d.row).sort((a, b) => a - b)).toEqual([
      23, 31, 50, 78, 116, 131, 137, 158, 163, 223, 255, 289,
    ]);
    expect(codesOf(r, 'IO-E003')).toHaveLength(0);
    expect(codesOf(r, 'IO-W001')).toHaveLength(0);
    expect(codesOf(r, 'IO-W002')).toHaveLength(0);
    expect(codesOf(r, 'IO-W003')).toHaveLength(0);
    expect(codesOf(r, 'IO-W010')).toHaveLength(0);
    expect(codesOf(r, 'IO-W020')).toHaveLength(0);
    expect(codesOf(r, 'IO-W040')).toHaveLength(0);
  }, 60_000);
});
