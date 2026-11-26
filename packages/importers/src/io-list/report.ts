// Báo cáo import (M2 §8.8, OQ-356, P2.6 commit 5).
// JSON `{generatedAt, file, sheet, profile?, stats, diagnostics, diff,
// filesWritten?}` + HTML cùng dữ liệu (template chuỗi, escape HTML,
// không dep). `generatedAt` inject từ ngoài (CLI dùng wall time;
// test truyền cố định để tất định).

import type { Diagnostic } from '@vcs/schemas';
import type { DiffResult } from './diff.js';
import type { ValidateResult } from './validate.js';

export interface ImportReportStats {
  records: number;
  errors: number;
  warnings: number;
  infos: number;
  inferredKinds: number;
  skippedRows: number;
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  skippedManual: number;
  renamedCandidates: number;
  diagnosticsByCode: Record<string, number>;
}

export interface ImportReport {
  generatedAt: string;
  file: string;
  sheet?: string;
  profile?: string;
  stats: ImportReportStats;
  diagnostics: Diagnostic[];
  diff: DiffResult;
  filesWritten?: string[];
}

export function buildReport(input: {
  generatedAt: string;
  file: string;
  sheet?: string;
  profile?: string;
  validateResult: ValidateResult;
  diff: DiffResult;
  filesWritten?: string[];
}): ImportReport {
  const { validateResult, diff } = input;
  const report: ImportReport = {
    generatedAt: input.generatedAt,
    file: input.file,
    stats: {
      records: validateResult.stats.records,
      errors: validateResult.stats.errors,
      warnings: validateResult.stats.warnings,
      infos: validateResult.stats.infos,
      inferredKinds: validateResult.stats.inferredKinds,
      skippedRows: validateResult.stats.skippedRows,
      added: diff.added.length,
      removed: diff.removed.length,
      changed: new Set(diff.changed.map((c) => c.tag.toLowerCase())).size,
      unchanged: diff.unchanged.length,
      skippedManual: diff.skippedManual.length,
      renamedCandidates: diff.renamedCandidates.length,
      diagnosticsByCode: validateResult.stats.diagnosticsByCode,
    },
    diagnostics: validateResult.diagnostics,
    diff,
  };
  if (input.sheet !== undefined) report.sheet = input.sheet;
  if (input.profile !== undefined) report.profile = input.profile;
  if (input.filesWritten !== undefined) report.filesWritten = input.filesWritten;
  return report;
}

export function reportToJson(report: ImportReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'string') return escapeHtml(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return escapeHtml(JSON.stringify(value));
}

function section(title: string, rows: string): string {
  if (rows === '') return `<h2>${escapeHtml(title)}</h2><p>Không có.</p>`;
  return `<h2>${escapeHtml(title)}</h2>${rows}`;
}

function listSection(title: string, items: string[]): string {
  if (items.length === 0) return section(title, '');
  return section(
    title,
    `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`,
  );
}

/** HTML tất định từ cùng dữ liệu JSON (không dep, không script). */
export function reportToHtml(report: ImportReport): string {
  const s = report.stats;
  const statRows: [string, number][] = [
    ['Bản ghi', s.records],
    ['Lỗi', s.errors],
    ['Cảnh báo', s.warnings],
    ['Info', s.infos],
    ['Kind suy ra', s.inferredKinds],
    ['Dòng bỏ qua', s.skippedRows],
    ['Thêm', s.added],
    ['Xóa', s.removed],
    ['Đổi', s.changed],
    ['Không đổi', s.unchanged],
    ['Bỏ qua (manual)', s.skippedManual],
    ['Đề xuất đổi tên', s.renamedCandidates],
  ];
  const diagRows = report.diagnostics
    .map(
      (d) =>
        `<tr><td>${escapeHtml(d.code)}</td><td>${escapeHtml(d.severity)}</td>` +
        `<td>${d.line === undefined ? '—' : String(d.line)}</td><td>${escapeHtml(d.message)}</td></tr>`,
    )
    .join('');
  const changedRows = report.diff.changed
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.tag)}</td><td>${escapeHtml(c.field)}</td>` +
        `<td>${fmt(c.old)}</td><td>${fmt(c.next)}</td></tr>`,
    )
    .join('');
  const renamedRows = report.diff.renamedCandidates
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.from)}</td><td>${escapeHtml(r.to)}</td>` +
        `<td>${escapeHtml(r.address)}</td></tr>`,
    )
    .join('');
  const skippedRows = report.diff.skippedManual
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.tag)}</td><td>${escapeHtml(m.reason)}</td>` +
        `<td>${escapeHtml(m.fields.join(', ') || '—')}</td></tr>`,
    )
    .join('');
  return [
    '<!DOCTYPE html>',
    '<html lang="vi"><head><meta charset="utf-8">',
    `<title>Báo cáo import — ${escapeHtml(report.file)}</title>`,
    '<style>body{font-family:system-ui,sans-serif;margin:2em}table{border-collapse:collapse}td,th{border:1px solid #999;padding:.3em .6em;text-align:left}</style>',
    '</head><body>',
    `<h1>Báo cáo import — ${escapeHtml(report.file)}</h1>`,
    `<p>Tạo lúc: ${escapeHtml(report.generatedAt)}${report.sheet !== undefined ? ` · Sheet: ${escapeHtml(report.sheet)}` : ''}${report.profile !== undefined ? ` · Profile: ${escapeHtml(report.profile)}` : ''}</p>`,
    '<h2>Thống kê</h2>',
    `<table>${statRows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${String(v)}</td></tr>`).join('')}</table>`,
    section(
      'Diagnostics',
      diagRows === ''
        ? ''
        : `<table><tr><th>Mã</th><th>Mức</th><th>Dòng</th><th>Thông báo</th></tr>${diagRows}</table>`,
    ),
    listSection('Thêm', report.diff.added),
    listSection('Xóa', report.diff.removed),
    section(
      'Đổi',
      changedRows === ''
        ? ''
        : `<table><tr><th>Tag</th><th>Trường</th><th>Cũ</th><th>Mới</th></tr>${changedRows}</table>`,
    ),
    listSection('Không đổi', report.diff.unchanged),
    section(
      'Bỏ qua (manual)',
      skippedRows === ''
        ? ''
        : `<table><tr><th>Tag</th><th>Lý do</th><th>Trường</th></tr>${skippedRows}</table>`,
    ),
    section(
      'Đề xuất đổi tên',
      renamedRows === ''
        ? ''
        : `<table><tr><th>Từ</th><th>Thành</th><th>Địa chỉ</th></tr>${renamedRows}</table>`,
    ),
    report.filesWritten === undefined
      ? ''
      : listSection('File đã ghi', report.filesWritten),
    '</body></html>',
    '',
  ].join('\n');
}
