// Test header-detect (M2 §8.3, P2.5 commit 4).

import { describe, expect, it } from 'vitest';
import { detectHeader } from './header-detect.js';
import { readCsvFile } from './read-csv.js';
import { readXlsxFile } from './read-xlsx.js';
import type { RawGrid } from './read-csv.js';

function grid(rows: (string | null)[][], rowNumbers?: number[]): RawGrid {
  const g: RawGrid = { headers: [], rows, origin: { file: '<test>' } };
  if (rowNumbers !== undefined) g.rowNumbers = rowNumbers;
  return g;
}

describe('detectHeader', () => {
  it('dòng header là dòng khớp synonym nhiều nhất (≥ 3), hòa → dòng đầu', () => {
    const g = grid([
      ['IO List - Crushing Line'],
      ['Project: VCS Demo Plant'],
      ['Tag Name', 'Description', 'Type', 'Address', 'PLC'],
      ['M01', 'Motor run', 'DI', 'I0.0', 'PLC1'],
    ]);
    expect(detectHeader(g)).toEqual({ headerRow: 3, firstDataRow: 4, matches: 5 });
  });

  it('không dòng nào đạt 3 khớp → null', () => {
    const g = grid([
      ['Foo', 'Bar'],
      ['M01', 'x'],
    ]);
    expect(detectHeader(g)).toBeNull();
  });

  it('dòng trống sau header bị bỏ qua khi tính firstDataRow (OQ-337)', () => {
    const g = grid([
      ['Tag', 'Type', 'Address'],
      [null, null, null],
      ['   ', '', null],
      ['M01', 'DI', 'I0.0'],
    ]);
    expect(detectHeader(g)).toEqual({ headerRow: 1, firstDataRow: 4, matches: 3 });
  });

  it('rowNumbers thật được dùng cho headerRow/firstDataRow', () => {
    const g = grid(
      [
        ['Tag', 'Type', 'Address'],
        ['M01', 'DI', 'I0.0'],
      ],
      [6, 8],
    );
    expect(detectHeader(g)).toEqual({ headerRow: 6, firstDataRow: 8, matches: 3 });
  });

  it('chỉ quét 30 dòng đầu', () => {
    const rows: (string | null)[][] = Array.from({ length: 31 }, () => ['x']);
    rows[30] = ['Tag', 'Type', 'Address'];
    expect(detectHeader(grid(rows))).toBeNull();
  });

  it('fixture XLSX: header dòng 6, 10 khớp (Station cũng khớp controller), firstDataRow 7', async () => {
    const g = await readXlsxFile('fixtures/io-list-300.xlsx');
    expect(detectHeader(g)).toEqual({ headerRow: 6, firstDataRow: 7, matches: 10 });
  });

  it('fixture CSV: header dòng 6, firstDataRow 7', async () => {
    const g = await readCsvFile('fixtures/io-list-300.csv');
    expect(detectHeader(g)).toEqual({ headerRow: 6, firstDataRow: 7, matches: 10 });
  });
});
