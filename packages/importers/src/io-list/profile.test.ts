// Test profile save/load/match/build (M2 §4.4 + §8.3, P2.5 commit 4).

import { describe, expect, it } from 'vitest';
import { importProfileSchema, type ImportProfile } from '@vcs/schemas';
import { buildProfile, loadProfile, matchesProfile, saveProfile } from './profile.js';
import { detectHeader } from './header-detect.js';
import { suggestMapping } from './mapping.js';
import { readCsvFile } from './read-csv.js';
import { readXlsxFile } from './read-xlsx.js';

const HEADERS = ['Station', 'Tag Name', 'Description', 'Type', 'Address', 'PLC', 'Range Lo', 'Range Hi', 'Unit', 'Equipment'];

describe('saveProfile/loadProfile', () => {
  it('round-trip: YAML chứa mapping + headerRow + fillDownColumns', () => {
    const profile: ImportProfile = {
      name: 'Project X IO list',
      file: 'io/IO_list_rev3.xlsx',
      sheet: 'IO List',
      headerRow: 6,
      firstDataRow: 7,
      lastDataRow: null,
      skipRowsWhen: [{ column: 'tag', empty: true }],
      fillDownColumns: ['station'],
      encoding: 'auto',
      delimiter: 'auto',
      mapping: { tag: 'Tag Name', address: 'Address', signalType: 'Type' },
      transforms: [{ field: 'tag', op: 'replace', pattern: '\\s+', with: '_' }],
      rules: { duplicateTag: 'error' },
      defaults: { controller: 'PLC1' },
      headers: HEADERS,
    };
    const yaml = saveProfile(profile);
    expect(yaml).toContain('Tag Name');
    const loaded = loadProfile(yaml);
    expect(loaded).toEqual(profile);
  });

  it('profile §4.4 mẫu trong spec parse được (không naming, không format)', () => {
    const yaml = `
name: Project X IO list
file: io/IO_list_rev3.xlsx
sheet: "IO List"
headerRow: 6
firstDataRow: 7
lastDataRow: null
skipRowsWhen: [{ column: tag, empty: true }]
fillDownColumns: [station]
encoding: auto
delimiter: auto
mapping:
  tag: "Tag Name"
  description: "Description"
  signalType: "Type"
  address: "Address"
  controller: "PLC"
  engMin: "Range Lo"
  engMax: "Range Hi"
  unit: "Unit"
  equipment: "Equipment"
transforms:
  - { field: tag, op: replace, pattern: "\\\\s+", with: "_" }
  - { field: tag, op: upper }
  - { field: signalType, op: map, table: { "DE": DI, "DA": DO, "AE": AI, "AA": AO } }
defaults: { controller: PLC1 }
rules: { duplicateTag: error, duplicateAddress: error, missingType: error, missingRange: warn }
`;
    const loaded = loadProfile(yaml);
    expect(loaded.name).toBe('Project X IO list');
    expect(loaded.mapping.tag).toBe('Tag Name');
    expect(loaded.transforms).toHaveLength(3);
    expect(loaded.rules.missingRange).toBe('warn');
  });

  it('YAML hỏng → Error thường; profile sai schema → Error thường', () => {
    expect(() => loadProfile('name: [không đóng')).toThrow(/không parse được/);
    expect(() => loadProfile('name: 123\nmapping: { tga: Tag }')).toThrow(/không hợp lệ/);
  });
});

describe('matchesProfile (OQ-333)', () => {
  const base = importProfileSchema.parse({
    name: 'P',
    sheet: 'IO List',
    mapping: { tag: 'Tag Name', address: 'Address' },
    headers: HEADERS,
  });

  it('sheet + bộ header khớp (không kể thứ tự, không phân biệt hoa/thường) → true', () => {
    expect(matchesProfile(base, 'IO List', [...HEADERS].reverse())).toBe(true);
    expect(matchesProfile(base, 'IO List', HEADERS.map((h) => h.toUpperCase()))).toBe(true);
  });

  it('sai tên sheet → false', () => {
    expect(matchesProfile(base, 'Cover', HEADERS)).toBe(false);
  });

  it('thiếu/đổi một header → false', () => {
    expect(matchesProfile(base, 'IO List', HEADERS.slice(1))).toBe(false);
    expect(matchesProfile(base, 'IO List', [...HEADERS.slice(0, 9), 'Ghi chú'])).toBe(false);
  });

  it('profile không có headers → fallback: mọi tên cột mapping phải có mặt', () => {
    const noHeaders = importProfileSchema.parse({
      name: 'P',
      sheet: 'IO List',
      mapping: { tag: 'Tag Name', address: 'Address' },
    });
    expect(matchesProfile(noHeaders, 'IO List', HEADERS)).toBe(true);
    expect(matchesProfile(noHeaders, 'IO List', HEADERS.filter((h) => h !== 'Address'))).toBe(false);
    // mapping bằng chữ cột (A, B) không tham gia so khớp header
    const letters = importProfileSchema.parse({
      name: 'P',
      sheet: 'IO List',
      mapping: { tag: 'B', address: 'E' },
    });
    expect(matchesProfile(letters, 'IO List', ['X', 'Y'])).toBe(true);
  });

  it('profile không có sheet → chỉ so header', () => {
    const noSheet = importProfileSchema.parse({
      name: 'P',
      mapping: { tag: 'Tag Name', address: 'Address' },
      headers: HEADERS,
    });
    expect(matchesProfile(noSheet, 'Bất kỳ', HEADERS)).toBe(true);
  });
});

describe('buildProfile', () => {
  it('fixture XLSX: profile đầy đủ, fillDownColumns [station], encoding/delimiter auto', async () => {
    const g = await readXlsxFile('fixtures/io-list-300.xlsx');
    const guess = detectHeader(g);
    expect(guess).not.toBeNull();
    const suggestions = suggestMapping(g, guess?.headerRow ?? 6);
    const profile = buildProfile(g, guess?.headerRow ?? 6, guess?.firstDataRow ?? 7, suggestions, {
      name: 'Fixture IO list',
    });
    expect(profile.name).toBe('Fixture IO list');
    expect(profile.file).toBe('fixtures/io-list-300.xlsx');
    expect(profile.sheet).toBe('IO List');
    expect(profile.headerRow).toBe(6);
    expect(profile.firstDataRow).toBe(7);
    expect(profile.lastDataRow).toBeNull();
    expect(profile.fillDownColumns).toEqual(['station']);
    expect(profile.encoding).toBe('auto');
    expect(profile.delimiter).toBe('auto');
    expect(profile.mapping.tag).toBe('Tag Name');
    expect(profile.mapping.controller).toBe('PLC');
    expect(profile.headers).toEqual(HEADERS);
  });

  it('fixture CSV: encoding/delimiter lấy từ meta lưới đã sniff', async () => {
    const g = await readCsvFile('fixtures/io-list-300.csv');
    const guess = detectHeader(g);
    const suggestions = suggestMapping(g, guess?.headerRow ?? 6);
    const profile = buildProfile(g, guess?.headerRow ?? 6, guess?.firstDataRow ?? 7, suggestions, {
      name: 'Fixture CSV',
    });
    expect(profile.encoding).toBe('windows-1252');
    expect(profile.delimiter).toBe(';');
  });

  it('profile dựng từ fixture khớp lại chính fixture (OQ-333)', async () => {
    const g = await readXlsxFile('fixtures/io-list-300.xlsx');
    const guess = detectHeader(g);
    const suggestions = suggestMapping(g, guess?.headerRow ?? 6);
    const profile = buildProfile(g, guess?.headerRow ?? 6, guess?.firstDataRow ?? 7, suggestions, {
      name: 'Fixture',
    });
    expect(matchesProfile(profile, 'IO List', HEADERS)).toBe(true);
    expect(matchesProfile(profile, 'Cover', HEADERS)).toBe(false);
  });
});
