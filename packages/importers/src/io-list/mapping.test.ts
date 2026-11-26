// Test mapping (M2 §8.3, P2.5 commit 4): synonym theo tên + content
// sniffing + fill-down theo tên cột station/area.

import { describe, expect, it } from 'vitest';
import {
  detectFillDownColumns,
  FIELD_SYNONYMS,
  findStationAreaColumns,
  normalizeColumnName,
  suggestMapping,
} from './mapping.js';
import { detectHeader } from './header-detect.js';
import { readCsvFile } from './read-csv.js';
import { applyFillDown, readXlsxFile } from './read-xlsx.js';
import type { RawGrid } from './read-csv.js';

function grid(rows: (string | number | null)[][], rowNumbers?: number[]): RawGrid {
  const g: RawGrid = { headers: [], rows, origin: { file: '<test>' } };
  if (rowNumbers !== undefined) g.rowNumbers = rowNumbers;
  return g;
}

describe('normalizeColumnName', () => {
  it.each([
    ['Tag Name', 'tagname'],
    ['Tên thiết bị', 'tenthietbi'],
    ['Mã tín hiệu', 'matinhieu'],
    ['NO/NC', 'nonc'],
    ['Range Lo', 'rangelo'],
    ['Địa chỉ', 'diachi'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeColumnName(raw)).toBe(expected);
  });
});

describe('FIELD_SYNONYMS', () => {
  it('không synonym nào sau chuẩn hóa trỏ tới 2 field', () => {
    const seen = new Map<string, string>();
    for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
      for (const syn of synonyms) {
        const key = normalizeColumnName(syn);
        const prev = seen.get(key);
        expect(prev === undefined || prev === field, `${key} ở cả ${String(prev)} và ${field}`).toBe(true);
        seen.set(key, field);
      }
    }
  });
});

describe('suggestMapping — theo tên', () => {
  it('fixture: đủ 10 field, controller là PLC (không phải Station)', async () => {
    const g = await readXlsxFile('fixtures/io-list-300.xlsx');
    const suggestions = suggestMapping(g, 6);
    const byField = new Map(suggestions.map((s) => [s.field, s]));
    expect(byField.get('tag')?.column).toBe('Tag Name');
    expect(byField.get('description')?.column).toBe('Description');
    expect(byField.get('signalType')?.column).toBe('Type');
    expect(byField.get('address')?.column).toBe('Address');
    expect(byField.get('controller')?.column).toBe('PLC');
    expect(byField.get('engMin')?.column).toBe('Range Lo');
    expect(byField.get('engMax')?.column).toBe('Range Hi');
    expect(byField.get('unit')?.column).toBe('Unit');
    expect(byField.get('equipment')?.column).toBe('Equipment');
    expect(byField.get('station' as never)).toBeUndefined();
    for (const s of suggestions) expect(s.confidence).toBe('high');
  });

  it("synonym đứng trước thắng: 'PLC' thắng 'Station' cho controller", () => {
    const g = grid([
      ['Station', 'PLC', 'Tag'],
      ['CR01', 'PLC1', 'M01'],
    ]);
    const suggestions = suggestMapping(g, 1);
    expect(suggestions.find((s) => s.field === 'controller')?.column).toBe('PLC');
    expect(suggestions.find((s) => s.field === 'controller')?.reason).toContain('"plc"');
  });

  it('tên cột tiếng Việt/Đức khớp synonym', () => {
    const g = grid([
      ['Tên thiết bị', 'Mô tả', 'Loại tín hiệu', 'Địa chỉ'],
      ['M01', 'Chạy', 'DI', 'I0.0'],
    ]);
    const byField = new Map(suggestMapping(g, 1).map((s) => [s.field, s.column]));
    expect(byField.get('tag')).toBe('Tên thiết bị');
    expect(byField.get('description')).toBe('Mô tả');
    expect(byField.get('signalType')).toBe('Loại tín hiệu');
    expect(byField.get('address')).toBe('Địa chỉ');
  });

  it('headerRow ngoài lưới → []', () => {
    expect(suggestMapping(grid([['Tag']]), 99)).toEqual([]);
  });
});

describe('suggestMapping — content sniffing', () => {
  it("cột 'Kanal' không có trong từ điển nhưng chứa địa chỉ → address (ví dụ 4 của plan)", () => {
    const g = grid([
      ['Kanal', 'Wert'],
      ['I0.0', '10'],
      ['I 0.1', '20'],
      ['Q0.0', '30'],
      ['%I0.2', '40'],
      ['E0.3:P', '50'],
    ]);
    const suggestions = suggestMapping(g, 1);
    const address = suggestions.find((s) => s.field === 'address');
    expect(address?.column).toBe('Kanal');
    expect(address?.confidence).toBe('medium');
    expect(address?.reason).toContain('5/5');
  });

  it("cột chứa 'O0.0' (biến thể Đức của Q, §8.5) → address (OQ-341)", () => {
    const g = grid([
      ['Kanal', 'Wert'],
      ['O0.0', '10'],
      ['O0.1', '20'],
      ['O1.0', '30'],
      ['%Q0.2', '40'],
    ]);
    const suggestions = suggestMapping(g, 1);
    const address = suggestions.find((s) => s.field === 'address');
    expect(address?.column).toBe('Kanal');
    expect(address?.confidence).toBe('medium');
    expect(address?.reason).toContain('4/4');
  });

  it('cột chứa DI/DO/AI/AO > 70% → signalType khi tên không khớp', () => {
    const g = grid([
      ['K1', 'K2'],
      ['DI', 'x'],
      ['DO', 'y'],
      ['AI', 'z'],
      ['DI', 'w'],
    ]);
    const suggestions = suggestMapping(g, 1);
    expect(suggestions.find((s) => s.field === 'signalType')?.column).toBe('K1');
  });

  it('cột số ≥ 70% trong [0,100] → engMin rồi engMax (trái→phải)', () => {
    const g = grid([
      ['Lo', 'Hi'],
      [0, 90],
      [10, 95],
      [20, 100],
      [5, 80],
    ]);
    const byField = new Map(suggestMapping(g, 1).map((s) => [s.field, s]));
    expect(byField.get('engMin')?.column).toBe('Lo');
    expect(byField.get('engMax')?.column).toBe('Hi');
    expect(byField.get('engMin')?.reason).toContain('không phân biệt được min/max');
  });

  it('cột ID 1..300 (chỉ 33% trong [0,100]) → không gợi ý range (OQ-334)', () => {
    const rows: (string | number | null)[][] = [['ID']];
    for (let i = 1; i <= 300; i += 1) rows.push([i]);
    const suggestions = suggestMapping(grid(rows), 1);
    expect(suggestions.find((s) => s.field === 'engMin')).toBeUndefined();
    expect(suggestions.find((s) => s.field === 'engMax')).toBeUndefined();
  });

  it("'M01' trơ không tính là địa chỉ; địa chỉ có khoảng trắng/hậu tố :P vẫn khớp", () => {
    const g = grid([
      ['Kanal'],
      ['M01'],
      ['M02'],
      ['I 0.0'],
      ['%I0.1:P'],
    ]);
    const suggestions = suggestMapping(g, 1);
    // 2/4 khớp (I 0.0, %I0.1:P) = 50% ≤ 70% → không gợi ý
    expect(suggestions.find((s) => s.field === 'address')).toBeUndefined();
  });

  it('content sniff không đảo gợi ý theo tên', () => {
    const g = grid([
      ['Type', 'Tag'],
      ['I0.0', 'M01'],
      ['I0.1', 'M02'],
      ['Q0.0', 'M03'],
    ]);
    const byField = new Map(suggestMapping(g, 1).map((s) => [s.field, s.column]));
    expect(byField.get('signalType')).toBe('Type');
    expect(byField.get('address')).toBeUndefined();
  });
});

describe('fill-down theo tên cột', () => {
  it("fixture: detectFillDownColumns → ['A']; applyFillDown điền station", async () => {
    const g = await readXlsxFile('fixtures/io-list-300.xlsx');
    expect(detectFillDownColumns(g, 6)).toEqual(['A']);
    expect(findStationAreaColumns(g, 6)).toEqual([{ letter: 'A', name: 'Station' }]);
    const filled = applyFillDown(g, detectFillDownColumns(g, 6));
    expect(filled.rows[7]?.[0]).toBe('CR01');
    expect(filled.rows[305]?.[0]).toBe('CR02');
  });

  it('cột station không merge → []', () => {
    const g = grid([
      ['Station', 'Tag'],
      ['CR01', 'M01'],
      ['CR02', 'M02'],
    ]);
    expect(detectFillDownColumns(g, 1)).toEqual([]);
  });

  it('chuỗi đầy đủ trên fixture CSV: detectHeader → suggestMapping → build mapping', async () => {
    const g = await readCsvFile('fixtures/io-list-300.csv');
    const guess = detectHeader(g);
    expect(guess?.headerRow).toBe(6);
    const suggestions = suggestMapping(g, guess?.headerRow ?? 6);
    // 10 cột nhưng chỉ 9 field: Station và PLC cùng khớp controller,
    // PLC thắng (synonym 'plc' đứng trước 'station') nên Station không
    // có gợi ý — đúng theo §4.4 (station không phải field mapping).
    expect(suggestions).toHaveLength(9);
    expect(suggestions.every((s) => s.confidence === 'high')).toBe(true);
  });
});
