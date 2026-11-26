// Test chuẩn hóa tên tag + dựng normalized record (M2 §8.6, P2.6 commit 2).
// Bảng 3 tính tay ở STATE §30 (11 case) + normalizeImport + addressDerive
// (OQ-347) bằng grid tổng hợp.

import { describe, expect, it } from 'vitest';
import { TAG_NAME_RE } from '@vcs/schemas';
import {
  extractDeriveColumns,
  normalizeImport,
  normalizeTagName,
  parsePolarity,
  parseSignalType,
} from './normalize.js';
import type { IoRecord } from './transform.js';
import type { RawGrid } from './read-csv.js';

/** STATE §30 bảng 3 — normalize tên tag (§8.6). */
const TAG_CASES: { input: string; output: string; cleaned: boolean }[] = [
  { input: ' RUN_CMD ', output: 'RUN_CMD', cleaned: false },
  { input: 'M01 RUN FB', output: 'M01_RUN_FB', cleaned: false },
  { input: 'M01  RUN   FB', output: 'M01_RUN_FB', cleaned: false },
  { input: 'RUN-CMD', output: 'RUN-CMD', cleaned: false },
  { input: 'RUN.CMD', output: 'RUN.CMD', cleaned: false },
  { input: 'RUN!CMD', output: 'RUN_CMD', cleaned: true },
  { input: '1RUN_CMD', output: '_1RUN_CMD', cleaned: true },
  { input: 'RUN@CMD#1', output: 'RUN_CMD_1', cleaned: true },
  { input: '', output: '', cleaned: false },
  { input: 'A'.repeat(129), output: 'A'.repeat(129), cleaned: false },
  { input: '.FOO', output: '_.FOO', cleaned: true },
];

describe('normalizeTagName — bảng 3 (STATE §30)', () => {
  it.each(TAG_CASES)('$input → $output (cleaned=$cleaned)', (c) => {
    expect(normalizeTagName(c.input)).toEqual({ tag: c.output, cleaned: c.cleaned });
  });

  it('đủ 11 case', () => {
    expect(TAG_CASES).toHaveLength(11);
  });

  it('property: tên đã làm sạch (không rỗng, ≤128) luôn khớp TAG_NAME_RE', () => {
    const inputs = [
      'RUN CMD', 'a b c', 'x!y@z#', '9lives', '-dash', '.dot', 'a/b\\c',
      '  spaced  out  ', 'Ünïcode', 'tag_with_underscores', 'a'.repeat(128),
    ];
    for (const input of inputs) {
      const { tag } = normalizeTagName(input);
      if (tag !== '' && tag.length <= 128) {
        expect(TAG_NAME_RE.test(tag), input).toBe(true);
      }
    }
  });
});

describe('parseSignalType / parsePolarity', () => {
  it.each([
    ['DI', 'DI'],
    ['DO', 'DO'],
    ['AI', 'AI'],
    ['AO', 'AO'],
    ['DE', 'DI'],
    ['DA', 'DO'],
    ['AE', 'AI'],
    ['AA', 'AO'],
    ['di', 'DI'],
    ['xx', null],
    ['', null],
  ])('%s → %s', (input, kind) => {
    expect(parseSignalType(input)).toBe(kind);
  });

  it('parsePolarity: NO/NC (không phân biệt hoa/thường), khác → null', () => {
    expect(parsePolarity('NO')).toBe('NO');
    expect(parsePolarity('nc')).toBe('NC');
    expect(parsePolarity('')).toBeNull();
    expect(parsePolarity('X')).toBeNull();
    expect(parsePolarity(null)).toBeNull();
  });
});

function record(partial: IoRecord): IoRecord {
  return partial;
}

describe('normalizeImport — dựng TagDef', () => {
  it('record đầy đủ → TagDef sẵn sàng ghi tags.yaml', () => {
    const [s] = normalizeImport(
      [
        record({
          tag: 'CR01_M01_RUN_CMD',
          description: 'Laufbefehl',
          signalType: 'DO',
          address: 'A0.0',
          controller: 'PLC1',
          equipment: 'CR01_M01',
        }),
      ],
      { origin: { file: 'io-list.csv' }, rowNumbers: [7] },
    );
    expect(s).toBeDefined();
    if (s === undefined) return;
    expect(s.tag).toBe('CR01_M01_RUN_CMD');
    expect(s.originalTag).toBe('CR01_M01_RUN_CMD');
    expect(s.row).toBe(7);
    expect(s.kind).toBe('DO');
    expect(s.givenKind).toBe('DO');
    expect(s.derivedKind).toBe(false);
    expect(s.cleanedTag).toBe(false);
    expect(s.peripheral).toBe(false);
    expect(s.tagDef).toEqual({
      name: 'CR01_M01_RUN_CMD',
      type: 'Bool',
      area: 'Q',
      address: '%Q0.0',
      controller: 'PLC1',
      description: 'Laufbefehl',
      signal: { kind: 'DO' },
      origin: { file: 'io-list.csv', row: 7 },
      provenance: 'import',
      equipment: 'CR01_M01',
    });
  });

  it('thiếu signalType → suy kind từ địa chỉ + derivedKind, W + AI → Int + scaling', () => {
    const [s] = normalizeImport([
      record({
        tag: 'PT01',
        signalType: null,
        address: 'PEW64',
        controller: 'PLC1',
        engMin: '0',
        engMax: '150',
        unit: 'bar',
      }),
    ]);
    expect(s).toBeDefined();
    if (s === undefined) return;
    expect(s.kind).toBe('AI');
    expect(s.derivedKind).toBe(true);
    expect(s.peripheral).toBe(true);
    expect(s.tagDef?.type).toBe('Int');
    expect(s.tagDef?.address).toBe('%IW64');
    expect(s.tagDef?.signal?.scaling).toEqual({
      rawMin: 0,
      rawMax: 27648,
      engMin: 0,
      engMax: 150,
      unit: 'bar',
    });
  });

  it('địa chỉ M + thiếu kind → kind null, TagDef vẫn dựng (validate báo IO-E003)', () => {
    const [s] = normalizeImport([
      record({ tag: 'M_FLAG', signalType: null, address: '%MW10', controller: 'PLC1' }),
    ]);
    expect(s).toBeDefined();
    if (s === undefined) return;
    expect(s.kind).toBeNull();
    expect(s.tagDef?.type).toBe('Word');
    expect(s.tagDef?.area).toBe('M');
    expect(s.tagDef?.signal).toBeUndefined();
  });

  it('sym: + kind → area suy từ kind; sym: + thiếu kind → tagDef null', () => {
    const [withKind, withoutKind] = normalizeImport([
      record({ tag: 'SYM_A', signalType: 'DI', address: 'sym:DB1.MyTag', controller: 'PLC1' }),
      record({ tag: 'SYM_B', signalType: null, address: 'sym:DB1.Other', controller: 'PLC1' }),
    ]);
    expect(withKind?.tagDef?.area).toBe('I');
    expect(withKind?.tagDef?.address).toBe('sym:DB1.MyTag');
    expect(withKind?.tagDef?.type).toBe('Bool');
    expect(withoutKind?.tagDef).toBeNull();
    expect(withoutKind?.kind).toBeNull();
  });

  it('địa chỉ lỗi / tên rỗng / tên > 128 → tagDef null + addressError', () => {
    const [badAddr, emptyTag, longTag] = normalizeImport([
      record({ tag: 'A', signalType: 'DI', address: 'I0.8', controller: 'PLC1' }),
      record({ tag: '', signalType: 'DI', address: '%I0.0', controller: 'PLC1' }),
      record({ tag: 'A'.repeat(129), signalType: 'DI', address: '%I0.0', controller: 'PLC1' }),
    ]);
    expect(badAddr?.tagDef).toBeNull();
    expect(badAddr?.addressError).toContain('số bit');
    expect(emptyTag?.tagDef).toBeNull();
    expect(longTag?.tagDef).toBeNull();
  });

  it('controller: record > profile.defaults > opts.defaultController > PLC1', () => {
    const signals = normalizeImport(
      [
        record({ tag: 'A', signalType: 'DI', address: '%I0.0', controller: 'PLC9' }),
        record({ tag: 'B', signalType: 'DI', address: '%I0.1' }),
        record({ tag: 'C', signalType: 'DI', address: '%I0.2' }),
      ],
      { defaultController: 'PLC9' },
    );
    expect(signals[0]?.controller).toBe('PLC9');
    expect(signals[0]?.tagDef?.controller).toBe('PLC9');
    expect(signals[1]?.controller).toBe('PLC9');
    const withDefaults = normalizeImport(
      [record({ tag: 'D', signalType: 'DI', address: '%I0.3' })],
      {
        defaultController: 'PLC9',
        profile: {
          name: 'p',
          mapping: {},
          transforms: [],
          rules: {},
          defaults: { controller: 'PLC2' },
          skipRowsWhen: [],
          fillDownColumns: [],
          encoding: 'auto',
          delimiter: 'auto',
        },
      },
    );
    expect(withDefaults[0]?.controller).toBe('PLC2');
    const bare = normalizeImport([record({ tag: 'E', signalType: 'DI', address: '%I0.4' })]);
    expect(bare[0]?.controller).toBe('PLC1');
  });

  it('rowNumbers: có → dùng số dòng file; không có → index+1', () => {
    const withRows = normalizeImport(
      [record({ tag: 'A', address: '%I0.0' }), record({ tag: 'B', address: '%I0.1' })],
      { rowNumbers: [7, 8] },
    );
    expect(withRows.map((s) => s.row)).toEqual([7, 8]);
    const withoutRows = normalizeImport([
      record({ tag: 'A', address: '%I0.0' }),
      record({ tag: 'B', address: '%I0.1' }),
    ]);
    expect(withoutRows.map((s) => s.row)).toEqual([1, 2]);
  });

  it('engMin/engMax non-number → null + rangeNonNumeric; engMin === engMax vẫn dựng scaling', () => {
    const [nonNum, equal] = normalizeImport([
      record({ tag: 'A', signalType: 'AI', address: '%IW64', engMin: 'abc', engMax: '100' }),
      record({ tag: 'B', signalType: 'AI', address: '%IW66', engMin: '50', engMax: '50' }),
    ]);
    expect(nonNum?.engMin).toBeNull();
    expect(nonNum?.rangeNonNumeric).toBe(true);
    expect(nonNum?.tagDef?.signal?.scaling).toBeUndefined();
    expect(equal?.tagDef?.signal?.scaling?.engMin).toBe(50);
    expect(equal?.tagDef?.signal?.scaling?.engMax).toBe(50);
  });
});

describe('addressDerive (OQ-347) — grid tổng hợp', () => {
  function grid(rows: (string | number | null)[][], rowNumbers?: number[]): RawGrid {
    const g: RawGrid = { headers: [], rows, origin: { file: '<test>' } };
    if (rowNumbers !== undefined) g.rowNumbers = rowNumbers;
    return g;
  }

  const PROFILE = {
    name: 'p',
    mapping: { tag: 'Tag Name', module: 'Module', channel: 'Channel' },
    transforms: [],
    rules: {},
    defaults: {},
    skipRowsWhen: [],
    fillDownColumns: [],
    encoding: 'auto' as const,
    delimiter: 'auto' as const,
    addressDerive: {
      moduleStartColumn: 'Module Start',
      channelColumn: 'Channel',
      moduleTypeColumn: 'Module',
      channelBase: 0,
    },
  };

  it('extractDeriveColumns căn hàng với gridToRecords (bỏ dòng trước firstDataRow)', () => {
    const g = grid([
      ['Tag Name', 'Module Start', 'Channel', 'Module'],
      ['A', 8, 0, 'DI16'],
      ['B', 8, 9, 'DI16'],
      ['C', 16, 1, 'AI4'],
    ]);
    const cols = extractDeriveColumns(g, 1, 2, null, PROFILE.addressDerive);
    expect(cols.moduleStart).toEqual([8, 8, 16]);
    expect(cols.channel).toEqual([0, 9, 1]);
    expect(cols.moduleType).toEqual(['DI16', 'DI16', 'AI4']);
  });

  it('derive từ module + channel: DI16 ch 0/9, AI4 ch 1', () => {
    const g = grid([
      ['Tag Name', 'Module Start', 'Channel', 'Module'],
      ['A', 8, 0, 'DI16'],
      ['B', 8, 9, 'DI16'],
      ['C', 16, 1, 'AI4'],
    ]);
    const cols = extractDeriveColumns(g, 1, 2, null, PROFILE.addressDerive);
    const signals = normalizeImport(
      [
        { tag: 'A', signalType: null, address: null },
        { tag: 'B', signalType: null, address: null },
        { tag: 'C', signalType: null, address: null },
      ],
      { profile: PROFILE, deriveColumns: cols, rowNumbers: [2, 3, 4] },
    );
    expect(signals[0]?.tagDef?.address).toBe('%I8.0');
    expect(signals[0]?.kind).toBe('DI');
    expect(signals[0]?.derivedKind).toBe(true);
    expect(signals[1]?.tagDef?.address).toBe('%I9.1');
    expect(signals[2]?.tagDef?.address).toBe('%IW18');
    expect(signals[2]?.kind).toBe('AI');
  });

  it('moduleStart là địa chỉ (%IB8 → 8); thiếu moduleType → suy từ kind', () => {
    const signals = normalizeImport(
      [
        { tag: 'A', signalType: 'DI', address: null },
        { tag: 'B', signalType: 'AI', address: null },
        { tag: 'C', signalType: null, address: null },
      ],
      {
        profile: {
          ...PROFILE,
          addressDerive: { moduleStartColumn: 'Module Start', channelColumn: 'Channel', channelBase: 0 },
        },
        deriveColumns: {
          moduleStart: ['%IB8', 16, 16],
          channel: [3, 2, 0],
          moduleType: [null, null, null],
        },
      },
    );
    expect(signals[0]?.tagDef?.address).toBe('%I8.3');
    expect(signals[1]?.tagDef?.address).toBe('%IW20');
    expect(signals[2]?.tagDef).toBeNull();
    expect(signals[2]?.addressError).toContain('thiếu loại module');
  });

  it('moduleStart/channel không parse được → tagDef null + addressError (IO-E010 ở validate)', () => {
    const signals = normalizeImport(
      [
        { tag: 'A', signalType: 'DI', address: null },
        { tag: 'B', signalType: 'DI', address: null },
      ],
      {
        profile: PROFILE,
        deriveColumns: {
          moduleStart: ['xx', 8],
          channel: [0, 'yy'],
          moduleType: ['DI16', 'DI16'],
        },
      },
    );
    expect(signals[0]?.tagDef).toBeNull();
    expect(signals[0]?.addressError).toContain('moduleStart');
    expect(signals[1]?.tagDef).toBeNull();
    expect(signals[1]?.addressError).toContain('channel');
  });

  it('record có cột addressDerive theo tên header (không qua deriveColumns) vẫn derive được', () => {
    const signals = normalizeImport(
      [{ tag: 'A', signalType: null, address: null, 'Module Start': 8, Channel: 5, Module: 'DI16' }],
      { profile: PROFILE },
    );
    expect(signals[0]?.tagDef?.address).toBe('%I8.5');
  });

  it('channelBase 1: channel 1 → kênh 0', () => {
    const signals = normalizeImport([{ tag: 'A', signalType: 'DI', address: null }], {
      profile: {
        ...PROFILE,
        addressDerive: { moduleStartColumn: 'Module Start', channelColumn: 'Channel', channelBase: 1 },
      },
      deriveColumns: { moduleStart: [8], channel: [1], moduleType: ['DI16'] },
    });
    expect(signals[0]?.tagDef?.address).toBe('%I8.0');
  });
});
