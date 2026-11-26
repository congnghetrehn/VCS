// Test báo cáo import JSON + HTML (M2 §8.8, OQ-356, P2.6 commit 5).

import { describe, expect, it } from 'vitest';
import type { TagDef } from '@vcs/schemas';
import { buildReport, escapeHtml, reportToHtml, reportToJson } from './report.js';
import { diffTags } from './diff.js';
import { normalizeImport } from './normalize.js';
import { validateImport } from './validate.js';
import type { IoRecord } from './transform.js';

const GENERATED_AT = '2026-11-26T12:00:00.000Z';

function scenario(): ReturnType<typeof buildReport> {
  const old: TagDef[] = [
    { name: 'A', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1', signal: { kind: 'DI' } },
    {
      name: 'B',
      type: 'Bool',
      area: 'I',
      address: '%I0.1',
      controller: 'PLC1',
      description: 'a<b',
      signal: { kind: 'DI' },
      provenance: 'manual',
    },
    { name: 'C', type: 'Bool', area: 'Q', address: '%Q0.0', controller: 'PLC1', signal: { kind: 'DO' } },
    // E không manual — description đổi vào bucket changed (để HTML render old/next).
    { name: 'E', type: 'Bool', area: 'I', address: '%I0.3', controller: 'PLC1', description: 'a<b', signal: { kind: 'DI' } },
  ];
  const records: IoRecord[] = [
    { tag: 'A', address: '%I0.0', signalType: 'DI' },
    { tag: 'B', address: '%I0.1', signalType: 'DI', description: 'c&d' },
    { tag: 'D', address: '%I0.2', signalType: 'DI' },
    { tag: 'E', address: '%I0.3', signalType: 'DI', description: 'c&d' },
  ];
  const signals = normalizeImport(records, {
    origin: { file: 'new.csv' },
    rowNumbers: [7, 8, 9, 10],
  });
  const validated = validateImport({
    records,
    rowNumbers: [7, 8, 9, 10],
    origin: { file: 'new.csv' },
    declaredControllers: ['PLC1'],
  });
  const diff = diffTags(old, signals);
  return buildReport({
    generatedAt: GENERATED_AT,
    file: 'new.csv',
    validateResult: validated,
    diff,
    filesWritten: ['tags/tags.yaml', 'reports/import-20261126-120000.json'],
  });
}

describe('buildReport + reportToJson (OQ-356)', () => {
  it('JSON có đủ khóa + stats đếm đúng diff', () => {
    const report = scenario();
    expect(report.generatedAt).toBe(GENERATED_AT);
    expect(report.file).toBe('new.csv');
    expect(report.sheet).toBeUndefined();
    expect(report.profile).toBeUndefined();
    expect(report.stats.records).toBe(4);
    expect(report.stats.errors).toBe(0);
    expect(report.stats.added).toBe(1);
    expect(report.stats.removed).toBe(1);
    expect(report.stats.changed).toBe(1);
    expect(report.stats.unchanged).toBe(1);
    expect(report.stats.skippedManual).toBe(1);
    expect(report.stats.renamedCandidates).toBe(0);
    expect(report.filesWritten).toEqual(['tags/tags.yaml', 'reports/import-20261126-120000.json']);
  });

  it('reportToJson parse lại được, bằng report gốc', () => {
    const report = scenario();
    const parsed = JSON.parse(reportToJson(report)) as unknown;
    expect(parsed).toEqual(report);
    expect(reportToJson(report).endsWith('\n')).toBe(true);
  });

  it('sheet/profile/filesWritten chỉ xuất hiện khi có giá trị', () => {
    const base = scenario();
    const withOptionals = buildReport({
      generatedAt: GENERATED_AT,
      file: 'new.xlsx',
      sheet: 'Cover',
      profile: 'io/import-profile.yaml',
      validateResult: validateImport({
        records: [{ tag: 'A', address: '%I0.0', signalType: 'DI' }],
        rowNumbers: [7],
        origin: { file: 'new.xlsx', sheet: 'Cover' },
      }),
      diff: diffTags([], normalizeImport([{ tag: 'A', address: '%I0.0', signalType: 'DI' }], {})),
    });
    expect(withOptionals.sheet).toBe('Cover');
    expect(withOptionals.profile).toBe('io/import-profile.yaml');
    expect(withOptionals.filesWritten).toBeUndefined();
    expect(base.sheet).toBeUndefined();
    expect('filesWritten' in base).toBe(true);
  });
});

describe('reportToHtml (OQ-356)', () => {
  it('chứa tên file, thống kê, tag các bucket; tất định', () => {
    const report = scenario();
    const html1 = reportToHtml(report);
    const html2 = reportToHtml(report);
    expect(html1).toBe(html2);
    expect(html1).toContain('new.csv');
    expect(html1).toContain(GENERATED_AT);
    expect(html1).toContain('<li>D</li>');
    expect(html1).toContain('<li>C</li>');
    expect(html1).toContain('<li>A</li>');
    expect(html1).toContain('Bỏ qua (manual)');
  });

  it('escape HTML: description "a<b" / "c&d" không lọt thẻ thô', () => {
    const html = reportToHtml(scenario());
    expect(html).toContain('a&lt;b');
    expect(html).toContain('c&amp;d');
    expect(html).not.toContain('a<b');
    expect(html).not.toContain('c&d');
  });

  it('escapeHtml: đủ 5 ký tự đặc biệt', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
});
