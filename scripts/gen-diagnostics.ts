// Sinh docs/diagnostics.md từ DiagnosticCatalog + quét mã chưa đăng ký
// (M0 §4.1, §13, §15 mục 9; OQ-008 giao cho P0.2).
// Chạy: `pnpm docs:diagnostics` (ghi file) hoặc
// `pnpm docs:diagnostics --check` (fail nếu file lệch hoặc có mã chưa đăng ký).
// Quét mã trong source (packages/*/src, apps/*/src, scripts/, tests/ gốc),
// TRỪ file *.test.ts: test được phép nhắc mã chưa đăng ký (ví dụ khẳng định
// get() trả undefined cho mã chưa đăng ký) mà không làm hỏng check.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIAGNOSTIC_CODE_RE, PRJ_CATALOG, SCL_CATALOG } from '@vcs/schemas';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'diagnostics.md');

/** Toàn bộ catalog (M0 + SCL) — gộp để sinh và kiểm mã chưa đăng ký. */
const CATALOGS = [PRJ_CATALOG, SCL_CATALOG];

function hasCode(code: string): boolean {
  return CATALOGS.some((c) => c.has(code));
}

function allEntries(): [string, { severity: string; title: string; hint?: string }][] {
  return CATALOGS.flatMap((c) => c.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export function generateDiagnosticsMarkdown(): string {
  const lines: string[] = [
    '# diagnostics — Danh mục mã chẩn đoán',
    '',
    '> File sinh tự động bởi `pnpm docs:diagnostics` (`scripts/gen-diagnostics.ts`). Không sửa tay.',
    '',
    '| Mã | Mức | Tiêu đề | Gợi ý |',
    '| --- | --- | --- | --- |',
  ];
  for (const [code, info] of allEntries()) {
    lines.push(`| \`${code}\` | ${info.severity} | ${info.title} | ${info.hint ?? ''} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Quét mã chẩn đoán trong một văn bản, trả về tập mã tìm thấy. */
export function scanCodes(text: string): Set<string> {
  const found = new Set<string>();
  for (const m of text.matchAll(new RegExp(DIAGNOSTIC_CODE_RE.source, 'g'))) {
    found.add(m[0]);
  }
  return found;
}

async function collectSourceFiles(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // thư mục chưa tồn tại (ví dụ apps/* ở M0) thì bỏ qua
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) await collectSourceFiles(abs, out);
    else if (e.isFile() && /\.(ts|mts|mjs|js)$/.test(e.name) && !e.name.endsWith('.test.ts')) {
      out.push(abs);
    }
  }
}

/** Quét toàn bộ source, trả về danh sách mã chưa đăng ký (đã sắp xếp). */
export async function findUnregisteredCodes(): Promise<string[]> {
  const files: string[] = [];
  for (const sub of ['packages', 'apps', 'scripts', 'tests']) {
    await collectSourceFiles(join(ROOT, sub), files);
  }
  const found = new Set<string>();
  for (const f of files) {
    const text = await readFile(f, 'utf8');
    for (const code of scanCodes(text)) found.add(code);
  }
  return [...found].filter((c) => !hasCode(c)).sort();
}

async function main(): Promise<number> {
  const check = process.argv.includes('--check');
  const unregistered = await findUnregisteredCodes();
  if (unregistered.length > 0) {
    process.stderr.write(
      `Mã chẩn đoán chưa đăng ký trong DiagnosticCatalog: ${unregistered.join(', ')}\n`,
    );
    return 1;
  }
  const generated = generateDiagnosticsMarkdown();
  let existing: string | null = null;
  try {
    existing = (await readFile(OUT, 'utf8')).replace(/\r\n/g, '\n');
  } catch {
    existing = null;
  }
  if (check) {
    if (existing !== generated) {
      process.stderr.write(
        'docs/diagnostics.md lệch với DiagnosticCatalog. Chạy `pnpm docs:diagnostics` để sinh lại.\n',
      );
      return 1;
    }
    process.stdout.write('docs:diagnostics --check: khớp.\n');
    return 0;
  }
  await writeFile(OUT, generated, 'utf8');
  const rel = OUT.split(sep).slice(-2).join('/');
  process.stdout.write(
    `Đã sinh ${rel} (${String(CATALOGS.reduce((n, c) => n + c.codes().length, 0))} mã).\n`,
  );
  return 0;
}

process.exitCode = await main();
