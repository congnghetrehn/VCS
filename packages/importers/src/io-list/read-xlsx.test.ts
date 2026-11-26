// Test read-xlsx (M2 §8.2, P2.5 commit 3). Workbook dùng trong test được
// build trong bộ nhớ bằng exceljs rồi đọc lại qua buffer — không phụ thuộc
// file thật ngoài fixture io-list-300.xlsx.

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  applyFillDown,
  listSheets,
  readXlsxBuffer,
  readXlsxFile,
} from './read-xlsx.js';
import { ImportReadError, type RawGrid } from './read-csv.js';

const FIXTURE_XLSX = 'fixtures/io-list-300.xlsx';

async function toBuffer(build: (wb: ExcelJS.Workbook) => void) {
  const wb = new ExcelJS.Workbook();
  build(wb);
  // writeBuffer() trả về kiểu `Buffer` riêng của exceljs d.ts (thực chất
  // là ArrayBuffer); đổi sang Uint8Array thật cho readXlsxBuffer.
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('listSheets', () => {
  it('liệt kê sheet của fixture kèm row/columnCount', async () => {
    const sheets = await listSheets(FIXTURE_XLSX);
    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toEqual({ name: 'IO List', rowCount: 306, columnCount: 10 });
    expect(sheets[1]?.name).toBe('Cover');
  });

  it('file không tồn tại → ImportReadError', async () => {
    await expect(listSheets('/không/tồn/tại.xlsx')).rejects.toThrow(ImportReadError);
  });
});

describe('readXlsxFile — fixture', () => {
  it('đọc fixture: 306 dòng, header ở chỉ số 5, tag đầu đúng', async () => {
    const grid = await readXlsxFile(FIXTURE_XLSX);
    expect(grid.rows).toHaveLength(306);
    expect(grid.rows[5]).toEqual([
      'Station',
      'Tag Name',
      'Description',
      'Type',
      'Address',
      'PLC',
      'Range Lo',
      'Range Hi',
      'Unit',
      'Equipment',
    ]);
    expect(grid.rows[6]?.[1]).toBe('CR01_M01_RUN_CMD');
    expect(grid.origin).toEqual({ file: FIXTURE_XLSX, sheet: 'IO List' });
    expect(grid.sheets).toHaveLength(2);
    expect(grid.rowNumbers?.[6]).toBe(7);
    expect(grid.meta?.merges).toEqual(['A7:A163', 'A164:A306']);
  });

  it('mặc định: ô slave của merge → null (không bịa dữ liệu, OQ-335)', async () => {
    const grid = await readXlsxFile(FIXTURE_XLSX);
    expect(grid.rows[6]?.[0]).toBe('CR01');
    expect(grid.rows[7]?.[0]).toBeNull();
    expect(grid.rows[162]?.[0]).toBeNull();
  });

  it("fillDownColumns ['A']: station điền xuống hết merge, đổi trạm đúng chỗ", async () => {
    const grid = await readXlsxFile(FIXTURE_XLSX, { fillDownColumns: ['A'] });
    expect(grid.rows[6]?.[0]).toBe('CR01');
    expect(grid.rows[7]?.[0]).toBe('CR01');
    expect(grid.rows[162]?.[0]).toBe('CR01');
    expect(grid.rows[163]?.[0]).toBe('CR02');
    expect(grid.rows[305]?.[0]).toBe('CR02');
  });

  it('đọc sheet theo tên; tên sai → ImportReadError', async () => {
    const grid = await readXlsxFile(FIXTURE_XLSX, { sheet: 'Cover' });
    expect(grid.origin.sheet).toBe('Cover');
    expect(grid.rows).toHaveLength(3);
    await expect(readXlsxFile(FIXTURE_XLSX, { sheet: 'Không có' })).rejects.toThrow(ImportReadError);
  });

  it('file không tồn tại → ImportReadError', async () => {
    await expect(readXlsxFile('/không/tồn/tại.xlsx')).rejects.toThrow(ImportReadError);
  });

  it('đọc từ buffer cho cùng kết quả như đọc file', async () => {
    const { readFile } = await import('node:fs/promises');
    const bytes = await readFile(FIXTURE_XLSX);
    const grid = await readXlsxBuffer(bytes, { file: FIXTURE_XLSX, fillDownColumns: ['A'] });
    expect(grid.rows).toHaveLength(306);
    expect(grid.rows[305]?.[0]).toBe('CR02');
  });
});

describe('readXlsxBuffer — giá trị ô', () => {
  it('formula lấy giá trị cache; không có cache → null', async () => {
    const bytes = await toBuffer((wb) => {
      const ws = wb.addWorksheet('S');
      ws.addRow(['a', { formula: '1+2', result: 3 }]);
      ws.addRow(['b', { formula: '9*9' }]);
    });
    const grid = await readXlsxBuffer(bytes);
    expect(grid.rows[0]?.[1]).toBe(3);
    expect(grid.rows[1]?.[1]).toBeNull();
  });

  it('rich text nối run; Date → ISO; error giữ chuỗi; hyperlink → text', async () => {
    const bytes = await toBuffer((wb) => {
      const ws = wb.addWorksheet('S');
      ws.addRow(['x']);
      ws.getCell('A1').value = { richText: [{ text: 'a' }, { text: 'b' }] };
      ws.addRow(['x']);
      ws.getCell('A2').value = new Date('2026-11-26T00:00:00.000Z');
      ws.addRow(['x']);
      ws.getCell('A3').value = { error: '#DIV/0!' };
      ws.addRow(['x']);
      ws.getCell('A4').value = { text: 'click', hyperlink: 'https://example.com' };
    });
    const grid = await readXlsxBuffer(bytes);
    expect(grid.rows[0]?.[0]).toBe('ab');
    expect(grid.rows[1]?.[0]).toBe('2026-11-26T00:00:00.000Z');
    expect(grid.rows[2]?.[0]).toBe('#DIV/0!');
    expect(grid.rows[3]?.[0]).toBe('click');
  });

  it('merge ở cột khác fill-down → slave null; cột fill-down → điền xuống', async () => {
    const bytes = await toBuffer((wb) => {
      const ws = wb.addWorksheet('S');
      ws.addRow(['CR01', 'M01']);
      ws.addRow(['CR01', 'M02']);
      ws.addRow(['CR01', 'M03']);
      ws.mergeCells('A1:A3');
      ws.mergeCells('B1:B3');
    });
    const grid = await readXlsxBuffer(bytes, { fillDownColumns: ['A'] });
    expect(grid.rows[0]).toEqual(['CR01', 'M01']);
    expect(grid.rows[1]).toEqual(['CR01', null]);
    expect(grid.rows[2]).toEqual(['CR01', null]);
  });

  it('dòng ẩn bỏ qua mặc định; skipHiddenRows false giữ lại; rowNumbers là số dòng Excel', async () => {
    const bytes = await toBuffer((wb) => {
      const ws = wb.addWorksheet('S');
      ws.addRow(['r1']);
      ws.addRow(['r2']);
      ws.addRow(['r3']);
      ws.getRow(2).hidden = true;
    });
    const skipped = await readXlsxBuffer(bytes);
    expect(skipped.rows.map((r) => r[0])).toEqual(['r1', 'r3']);
    expect(skipped.rowNumbers).toEqual([1, 3]);
    const kept = await readXlsxBuffer(bytes, { skipHiddenRows: false });
    expect(kept.rows.map((r) => r[0])).toEqual(['r1', 'r2', 'r3']);
    expect(kept.rowNumbers).toEqual([1, 2, 3]);
  });

  it('cột ẩn vẫn giữ (OQ-336)', async () => {
    const bytes = await toBuffer((wb) => {
      const ws = wb.addWorksheet('S');
      ws.addRow(['a', 'b']);
      ws.getColumn(2).hidden = true;
    });
    const grid = await readXlsxBuffer(bytes);
    expect(grid.rows[0]).toEqual(['a', 'b']);
  });

  it('sheet trống → 0 dòng; file không phải XLSX → ImportReadError', async () => {
    const empty = await toBuffer((wb) => {
      wb.addWorksheet('Empty');
    });
    const grid = await readXlsxBuffer(empty);
    expect(grid.rows).toHaveLength(0);
    await expect(readXlsxBuffer(new Uint8Array([1, 2, 3]))).rejects.toThrow(ImportReadError);
  });

  it('workbook không có sheet nào → ImportReadError', async () => {
    const noSheets = await toBuffer(() => {});
    await expect(readXlsxBuffer(noSheets)).rejects.toThrow(ImportReadError);
  });
});

describe('applyFillDown', () => {
  it('trả lưới mới, chỉ điền cột được liệt kê; không có merges → trả nguyên lưới', () => {
    const grid: RawGrid = {
      headers: [],
      rows: [
        ['CR01', 'M01'],
        ['CR01', 'M02'],
        ['CR02', 'M03'],
      ],
      rowNumbers: [1, 2, 3],
      origin: { file: '<test>' },
      meta: { merges: ['A1:A2'] },
    };
    const filled = applyFillDown(grid, ['A']);
    expect(filled.rows[1]?.[0]).toBe('CR01');
    expect(filled.rows[1]?.[1]).toBe('M02');
    expect(applyFillDown(grid, []).rows[1]?.[0]).toBeNull();
    expect(grid.rows[1]?.[0]).toBe('CR01');
    const noMerges: RawGrid = { headers: [], rows: [['a']], origin: { file: '<test>' } };
    expect(applyFillDown(noMerges, ['A'])).toBe(noMerges);
  });
});
