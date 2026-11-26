// Test transform §8.4 (P2.5 commit 5): mỗi op + thứ tự + change tracking.

import { describe, expect, it } from 'vitest';
import { applyTransforms, gridToRecords, type IoRecord } from './transform.js';
import type { TransformStep } from '@vcs/schemas';
import { detectHeader } from './header-detect.js';
import { suggestMapping } from './mapping.js';
import { readXlsxFile } from './read-xlsx.js';

describe('applyTransforms — ví dụ tính tay 3 của plan', () => {
  it('replace → upper (không đổi) → map: changed có 2 mục', () => {
    const steps: TransformStep[] = [
      { field: 'tag', op: 'replace', pattern: '\\s+', with: '_' },
      { field: 'tag', op: 'upper' },
      { field: 'signalType', op: 'map', table: { DE: 'DI', DA: 'DO', AE: 'AI', AA: 'AO' } },
    ];
    const { rows, changed } = applyTransforms(
      [{ tag: 'M01 RUN FB', signalType: 'DE' }],
      steps,
    );
    expect(rows[0]).toEqual({ tag: 'M01_RUN_FB', signalType: 'DI' });
    expect(changed).toEqual([
      { row: 0, field: 'tag', op: 'replace', from: 'M01 RUN FB', to: 'M01_RUN_FB' },
      { row: 0, field: 'signalType', op: 'map', from: 'DE', to: 'DI' },
    ]);
  });

  it('input không bị sửa (trả bản sao)', () => {
    const input: IoRecord[] = [{ tag: 'a b' }];
    const { rows } = applyTransforms(input, [{ field: 'tag', op: 'upper' }]);
    expect(input[0]?.tag).toBe('a b');
    expect(rows[0]?.tag).toBe('A B');
  });
});

describe('applyTransforms — từng op', () => {
  it.each([
    ['upper', { field: 'tag', op: 'upper' }, 'm01', 'M01'],
    ['lower', { field: 'tag', op: 'lower' }, 'M01', 'm01'],
    ['trim', { field: 'tag', op: 'trim' }, '  M01  ', 'M01'],
    ['prefix', { field: 'tag', op: 'prefix', with: 'CR01_' }, 'M01', 'CR01_M01'],
    ['suffix', { field: 'tag', op: 'suffix', with: '_FB' }, 'M01', 'M01_FB'],
    ['replace (global)', { field: 'tag', op: 'replace', pattern: '\\s+', with: '_' }, 'A B  C', 'A_B_C'],
  ])('%s', (_name, step, from, to) => {
    const { rows, changed } = applyTransforms([{ tag: from }], [step as TransformStep]);
    expect(rows[0]?.tag).toBe(to);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.from).toBe(from);
    expect(changed[0]?.to).toBe(to);
  });

  it('map trượt → giữ nguyên, không ghi changed; map tra String(cell) cho số', () => {
    const { rows, changed } = applyTransforms(
      [
        { signalType: 'XX' },
        { code: 1 },
      ],
      [
        { field: 'signalType', op: 'map', table: { DE: 'DI' } },
        { field: 'code', op: 'map', table: { '1': 'one' } },
      ],
    );
    expect(rows[0]?.signalType).toBe('XX');
    expect(rows[1]?.code).toBe('one');
    expect(changed).toHaveLength(1);
    expect(changed[0]?.field).toBe('code');
  });

  it('split: đủ phần, thiếu phần → null, thừa phần → bỏ; nguồn giữ nguyên', () => {
    const { rows, changed } = applyTransforms(
      [{ ref: 'A/B/C' }, { ref: 'X' }, { ref: null }],
      [{ field: 'ref', op: 'split', pattern: '/', into: ['a', 'b'] }],
    );
    expect(rows[0]).toEqual({ ref: 'A/B/C', a: 'A', b: 'B' });
    expect(rows[1]).toEqual({ ref: 'X', a: 'X', b: null });
    expect(rows[2]).toEqual({ ref: null, a: null, b: null });
    expect(changed.filter((c) => c.row === 0)).toHaveLength(2);
    expect(changed.filter((c) => c.row === 1)).toHaveLength(1);
    expect(changed.filter((c) => c.row === 2)).toHaveLength(0);
  });

  it('concat: nối bằng separator; tất cả nguồn null → null; tạo field đích', () => {
    const { rows, changed } = applyTransforms(
      [{ a: 'CR01', b: 'M01' }, { a: null, b: null }],
      [{ field: 'tag', op: 'concat', from: ['a', 'b'], separator: '_' }],
    );
    expect(rows[0]?.tag).toBe('CR01_M01');
    expect(rows[1]?.tag).toBeNull();
    expect(changed).toHaveLength(1);
  });

  it('default: null/chuỗi rỗng → value; có giá trị → giữ; field vắng → tạo', () => {
    const { rows, changed } = applyTransforms(
      [{ controller: null }, { controller: '' }, { controller: 'PLC2' }, {}],
      [{ field: 'controller', op: 'default', value: 'PLC1' }],
    );
    expect(rows.map((r) => r.controller)).toEqual(['PLC1', 'PLC1', 'PLC2', 'PLC1']);
    expect(changed).toHaveLength(3);
  });

  it('op chuỗi bỏ qua ô không phải chuỗi và field vắng mặt', () => {
    const { rows, changed } = applyTransforms(
      [{ n: 42, s: 'a' }],
      [
        { field: 'n', op: 'upper' },
        { field: 'vắng', op: 'trim' },
        { field: 's', op: 'upper' },
      ],
    );
    expect(rows[0]).toEqual({ n: 42, s: 'A' });
    expect(changed).toHaveLength(1);
  });

  it('pattern regex không hợp lệ → Error nêu field + op', () => {
    expect(() =>
      applyTransforms([{ tag: 'x' }], [{ field: 'tag', op: 'replace', pattern: '([', with: '_' }]),
    ).toThrow(/Transform "replace" trên field "tag"/);
    expect(() =>
      applyTransforms([{ tag: 'x' }], [{ field: 'tag', op: 'split', pattern: '([', into: ['a', 'b'] }]),
    ).toThrow(/Transform "split" trên field "tag"/);
  });

  it('thứ tự: bước sau thấy kết quả bước trước; changed theo thứ tự áp', () => {
    const { rows, changed } = applyTransforms(
      [{ tag: 'a b' }],
      [
        { field: 'tag', op: 'replace', pattern: '\\s+', with: '-' },
        { field: 'tag', op: 'upper' },
        { field: 'tag', op: 'suffix', with: '!' },
      ],
    );
    expect(rows[0]?.tag).toBe('A-B!');
    expect(changed.map((c) => c.op)).toEqual(['replace', 'upper', 'suffix']);
  });

  it('changed[].row là chỉ số 0-based của record', () => {
    const { changed } = applyTransforms(
      [{ tag: 'a' }, { tag: 'b' }, { tag: 'C' }],
      [{ field: 'tag', op: 'upper' }],
    );
    expect(changed.map((c) => c.row)).toEqual([0, 1]);
  });
});

describe('gridToRecords', () => {
  it('fixture: 300 records, đúng field, lastDataRow giới hạn', async () => {
    const grid = await readXlsxFile('fixtures/io-list-300.xlsx');
    const guess = detectHeader(grid);
    const suggestions = suggestMapping(grid, guess?.headerRow ?? 6);
    const mapping: Record<string, string> = {};
    for (const s of suggestions) mapping[s.field] = s.column;
    const records = gridToRecords(grid, 6, 7, mapping);
    expect(records).toHaveLength(300);
    expect(records[0]?.tag).toBe('CR01_M01_RUN_CMD');
    expect(records[0]?.controller).toBe('PLC1');
    // File ghi dạng hiển thị 'A0.0' (biến thể Đức của %Q0.0, theo seed);
    // expected.yaml giữ địa chỉ chuẩn '%Q0.0' — transform KHÔNG chuẩn
    // hóa địa chỉ (việc P2.6).
    expect(records[0]?.address).toBe('A0.0');
    expect(records[0]?.engMin).toBeNull();
    expect(records.some((r) => typeof r.engMin === 'number')).toBe(true);
    const limited = gridToRecords(grid, 6, 7, mapping, 9);
    expect(limited).toHaveLength(3);
  });

  it('tên header không tìm thấy cột → field vắng mặt ở mọi record', async () => {
    const grid = await readXlsxFile('fixtures/io-list-300.xlsx');
    const records = gridToRecords(grid, 6, 7, { tag: 'Tag Name', polarity: 'Không có' });
    expect(records[0]?.tag).toBe('CR01_M01_RUN_CMD');
    expect('polarity' in (records[0] ?? {})).toBe(false);
  });
});
