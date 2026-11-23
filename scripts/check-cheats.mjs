#!/usr/bin/env node
/**
 * check-cheats: phát hiện "mùi lách luật" trong mã nguồn (KHÔNG thay thế review của người).
 *
 * Chạy:  node scripts/check-cheats.mjs [--json] [--strict]
 *   --json    in kết quả dạng JSON
 *   --strict  cảnh báo (warn) cũng làm lệnh thất bại
 *
 * Allow-list: scripts/check-cheats.allow.json
 *   { "<rule-id>": [ { "file": "đường/dẫn/posix", "max": 2, "reason": "bắt buộc, giải thích rõ" } ] }
 * Mục allow-list không có `reason` là lỗi. Vượt `max` thì toàn bộ phát hiện của file đó bị tính lại.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');
const strict = args.has('--strict');

const SCAN_DIRS = ['apps', 'packages', 'scripts', 'tools'];
const EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.cs']);
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.turbo', 'coverage', 'bin', 'obj', '.vcs', 'fixtures-real', '.git', '.next',
]);
const SKIP_FILES = new Set(['scripts/check-cheats.mjs']);

const toPosix = (p) => p.split('\\').join('/');

const CORE_SRC = [
  /^packages\/(schemas|kernel|project|runtime-iec|vendor-siemens|plant|expr|hmi)\/src\//,
  /^packages\/testing\/src\/(dsl|expr|exec|ce)\//,
];
const TIME_ALLOW = [/^packages\/kernel\/src\/pacer\.ts$/];

const isTestFile = (f) => /\.(test|spec)\.[cm]?[tj]sx?$/.test(f) || /\/(test|tests|__tests__)\//.test(f);
const isTs = (f) => /\.[cm]?tsx?$/.test(f);
const isCore = (f) => CORE_SRC.some((re) => re.test(f)) && !TIME_ALLOW.some((re) => re.test(f)) && !isTestFile(f);
const isPackageSrc = (f) => /^packages\/[^/]+\/src\//.test(f) && !isTestFile(f);
const isCommentLine = (line) => /^\s*(?:\/\/|\/\*|\*)/.test(line);

const RULES = [
  { id: 'test-only', sev: 'error', re: /\b(?:it|test|describe)\.only\s*\(/, when: () => true,
    hint: 'Bỏ .only — nó làm các test khác bị bỏ qua im lặng.' },
  { id: 'test-skip', sev: 'error', re: /\b(?:it|test|describe)\.(?:skip|todo)\s*\(|\bx(?:it|describe)\s*\(/, when: () => true,
    hint: 'Không skip/todo test; nếu bắt buộc, đưa vào allow-list kèm lý do.' },
  { id: 'ts-suppress', sev: 'error', re: /@ts-(?:ignore|nocheck|expect-error)/, when: isTs,
    hint: 'Sửa kiểu cho đúng thay vì tắt kiểm tra.' },
  { id: 'eslint-disable', sev: 'error', re: /eslint-disable/, when: () => true,
    hint: 'Không tắt lint; nếu bắt buộc: ADR + allow-list.' },
  { id: 'explicit-any', sev: 'error', re: /:\s*any\b|\bas\s+any\b|<any>/, when: isTs, skipComments: true,
    hint: 'Chỉ cho phép ở ranh giới I/O đã validate (ghi `// boundary:`) và phải có trong allow-list.' },
  { id: 'time-random', sev: 'error', re: /\bDate\.now\s*\(|\bperformance\.now\s*\(|\bMath\.random\s*\(|\bnew\s+Date\s*\(\s*\)/,
    when: isCore, skipComments: true,
    hint: 'Package lõi phải tất định: dùng SimClock / PRNG có seed.' },
  { id: 'console', sev: 'warn', re: /\bconsole\.(?:log|debug)\s*\(/, when: isPackageSrc, skipComments: true,
    hint: 'Dùng logger/diagnostic, không console trong package.' },
  { id: 'todo-no-ref', sev: 'warn', re: /\b(?:TODO|FIXME|HACK|XXX)\b(?!\s*\((?:#\d+|OQ-\d+)\))/, when: () => true,
    hint: 'Gắn tham chiếu: TODO(OQ-12) hoặc TODO(#34).' },
  { id: 'empty-catch', sev: 'error', re: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/, when: () => true,
    hint: 'Không nuốt lỗi: xử lý, ghi diagnostic hoặc ném lại.' },
  { id: 'trivial-assert', sev: 'error', re: /expect\(\s*true\s*\)\.toBe\(\s*true\s*\)|expect\(\s*(\d+)\s*\)\.toBe\(\s*\1\s*\)/,
    when: isTestFile, hint: 'Assert tầm thường không chứng minh gì.' },
];

function walk(dir, out) {
  let names;
  try { names = readdirSync(dir); } catch { return; }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.has(extname(name))) out.push(p);
  }
}

const files = [];
for (const d of SCAN_DIRS) {
  const abs = join(ROOT, d);
  if (existsSync(abs)) walk(abs, files);
}

const findings = [];
for (const abs of files) {
  const rel = toPosix(relative(ROOT, abs));
  if (SKIP_FILES.has(rel)) continue;
  let text;
  try { text = readFileSync(abs, 'utf8'); } catch { continue; }
  const lines = text.split(/\r?\n/);
  for (const rule of RULES) {
    if (!rule.when(rel)) continue;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (rule.skipComments && isCommentLine(line)) continue;
      if (rule.re.test(line)) {
        findings.push({ rule: rule.id, sev: rule.sev, file: rel, line: i + 1, text: line.trim().slice(0, 160), hint: rule.hint });
      }
    }
  }
}

// Allow-list
const ALLOW_FILE = join(ROOT, 'scripts', 'check-cheats.allow.json');
let allow = {};
const allowProblems = [];
if (existsSync(ALLOW_FILE)) {
  try { allow = JSON.parse(readFileSync(ALLOW_FILE, 'utf8')); } catch (e) {
    allowProblems.push(`check-cheats.allow.json không phải JSON hợp lệ: ${e instanceof Error ? e.message : String(e)}`);
  }
}
for (const [rule, entries] of Object.entries(allow)) {
  if (!Array.isArray(entries)) continue;
  for (const e of entries) {
    if (!e || typeof e.file !== 'string' || typeof e.reason !== 'string' || e.reason.trim().length < 10) {
      allowProblems.push(`allow-list "${rule}": mục thiếu file hoặc reason (≥ 10 ký tự): ${JSON.stringify(e)}`);
    }
  }
}

const counts = new Map();
for (const f of findings) counts.set(`${f.rule}|${f.file}`, (counts.get(`${f.rule}|${f.file}`) ?? 0) + 1);

const remaining = findings.filter((f) => {
  const entries = allow[f.rule];
  if (!Array.isArray(entries)) return true;
  const entry = entries.find((e) => e && e.file === f.file && typeof e.reason === 'string' && e.reason.trim().length >= 10);
  if (!entry) return true;
  const max = Number.isInteger(entry.max) ? entry.max : 1;
  return (counts.get(`${f.rule}|${f.file}`) ?? 0) > max;
});

const errors = remaining.filter((f) => f.sev === 'error');
const warns = remaining.filter((f) => f.sev === 'warn');
const failed = errors.length > 0 || allowProblems.length > 0 || (strict && warns.length > 0);

if (asJson) {
  process.stdout.write(`${JSON.stringify({ scannedFiles: files.length, errors, warns, allowProblems, failed }, null, 2)}\n`);
} else {
  const show = (list, label) => {
    if (list.length === 0) return;
    process.stdout.write(`\n${label} (${list.length})\n`);
    for (const f of list.slice(0, 60)) {
      process.stdout.write(`  [${f.rule}] ${f.file}:${f.line}  ${f.text}\n      → ${f.hint}\n`);
    }
    if (list.length > 60) process.stdout.write(`  … và ${list.length - 60} mục nữa\n`);
  };
  process.stdout.write(`check-cheats: quét ${files.length} file\n`);
  for (const p of allowProblems) process.stdout.write(`  [allow-list] ${p}\n`);
  show(errors, 'LỖI');
  show(warns, 'CẢNH BÁO');
  process.stdout.write(failed ? '\nKẾT QUẢ: KHÔNG ĐẠT\n' : '\nKẾT QUẢ: SẠCH\n');
}
process.exit(failed ? 1 : 0);
