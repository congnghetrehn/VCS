// Test read-csv.ts (M2 §8.1–8.2, P2.5 commit 2).
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ImportReadError, readCsvFile, readCsvText } from './read-csv.js';

describe('readCsvText', () => {
  it('parse cơ bản: header + dòng, ô trống → null', () => {
    const grid = readCsvText('Tag;Type;Address\nM01_RUN;DI;I0.0\nM01_STOP;;I0.1\n');
    expect(grid.rows).toEqual([
      ['Tag', 'Type', 'Address'],
      ['M01_RUN', 'DI', 'I0.0'],
      ['M01_STOP', null, 'I0.1'],
    ]);
    expect(grid.headers).toEqual([]);
    expect(grid.origin.file).toBe('<text>');
  });

  it('dấu nháy kép: delimiter và xuống dòng trong ô được giữ nguyên', () => {
    const grid = readCsvText('Tag;Description\nM01;"Chạy; dừng"\nM02;"Dòng 1\nDòng 2"\n');
    expect(grid.rows[1]?.[1]).toBe('Chạy; dừng');
    expect(grid.rows[2]?.[1]).toBe('Dòng 1\nDòng 2');
  });

  it('delimiter tự sniff (;) khi không cho trước', () => {
    const grid = readCsvText('a;b;c\n1;2;3\n4;5;6');
    expect(grid.rows[0]).toEqual(['a', 'b', 'c']);
  });

  it('delimiter cho trước thắng sniff', () => {
    const grid = readCsvText('a,b;c\n1,2;3\n4,5;6', { delimiter: ',' });
    expect(grid.rows[0]).toEqual(['a', 'b;c']);
  });

  it('CRLF và LF (mỗi file một kiểu) đều parse được, giữ vị trí dòng', () => {
    const crlf = readCsvText('a;b\r\n1;2\r\n3;4\r\n');
    expect(crlf.rows).toHaveLength(3);
    expect(crlf.rows[2]).toEqual(['3', '4']);
    const lf = readCsvText('a;b\n1;2\n3;4\n');
    expect(lf.rows).toHaveLength(3);
    expect(lf.rows[2]).toEqual(['3', '4']);
  });

  it('dòng trống được giữ (vị trí dòng không lệch)', () => {
    const grid = readCsvText('a;b\n\n1;2\n');
    expect(grid.rows).toHaveLength(3);
    expect(grid.rows[1]).toEqual([null]);
  });

  it('không xác định được delimiter → ImportReadError', () => {
    expect(() => readCsvText('Tag\nM01_RUN\nM01_STOP')).toThrow(ImportReadError);
    expect(() => readCsvText('')).toThrow(ImportReadError);
  });

  it('dấu nháy không đóng → ImportReadError', () => {
    expect(() => readCsvText('a;b\n"chưa đóng;c\n1;2\n')).toThrow(ImportReadError);
  });

  it('lỗi parse sau 20 dòng đầu (vượt preview của sniff) → ImportReadError', () => {
    const head = Array.from({ length: 21 }, (_, i) => `a${String(i)};b${String(i)};c${String(i)}`).join('\n');
    expect(() => readCsvText(`${head}\n"x;chưa đóng\n`)).toThrow(ImportReadError);
  });
});

describe('readCsvFile', () => {
  it('đọc file: BOM UTF-8 bị bỏ, Windows-1252 giải mã đúng', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-csv-'));
    try {
      const bomPath = join(dir, 'bom.csv');
      await writeFile(bomPath, Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from('a;b\n1;2\n', 'utf8')]));
      const bomGrid = await readCsvFile(bomPath);
      expect(bomGrid.rows[0]).toEqual(['a', 'b']);
      expect(bomGrid.meta?.encoding).toBe('utf-8');

      const latinPath = join(dir, 'latin.csv');
      await writeFile(latinPath, Buffer.from('Tag;Mô tả\nM01;Rückmeldung\n', 'latin1'));
      const latinGrid = await readCsvFile(latinPath);
      expect(latinGrid.rows[1]?.[1]).toBe('Rückmeldung');
      expect(latinGrid.meta?.encoding).toBe('windows-1252');
      expect(latinGrid.meta?.delimiter).toBe(';');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('file không tồn tại → ImportReadError', async () => {
    await expect(readCsvFile('/không/tồn/tại.csv')).rejects.toThrow(ImportReadError);
  });

  it('đọc fixture CSV: 306 dòng, header ở chỉ số 5, tag đầu đúng', async () => {
    const grid = await readCsvFile('fixtures/io-list-300.csv');
    expect(grid.rows).toHaveLength(306);
    expect(grid.rows[5]).toEqual(['Station', 'Tag Name', 'Description', 'Type', 'Address', 'PLC', 'Range Lo', 'Range Hi', 'Unit', 'Equipment']);
    expect(grid.rows[6]?.[1]).toBe('CR01_M01_RUN_CMD');
    expect(grid.rowNumbers).toHaveLength(306);
    expect(grid.rowNumbers?.[6]).toBe(7);
    expect(grid.meta?.delimiter).toBe(';');
    expect(grid.meta?.encoding).toBe('windows-1252');
  });
});
