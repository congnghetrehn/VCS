// YAML có vị trí — @vcs/schemas (M0 §4.3).
// Phân tích YAML, validate bằng zod, mọi lỗi đều mang dòng/cột chính xác.
// Khóa lạ → cảnh báo PRJ-W001 (không phải lỗi) kèm gợi ý sửa chính tả.

import { parseDocument, isMap, isSeq, isScalar, type Document, type Node } from 'yaml';
import type { ZodType } from 'zod';
import { diag, sortDiagnostics, type Diagnostic, type SrcRef } from './common.js';
import { PRJ_CATALOG } from './diagnostics-catalog.js';

/** Mô tả hình dạng schema để phát hiện khóa lạ (song song với zod schema).
 * `freeForm` = mọi khóa đều được phép (ví dụ `config: {}`). */
export interface YamlShape {
  keys?: string[];
  children?: Record<string, YamlShape>;
  items?: YamlShape;
  freeForm?: boolean;
}

export interface ParseYamlResult<T> {
  value?: T;
  diagnostics: Diagnostic[];
  /** Định vị một đường dẫn zod (`['tags', 3, 'name']`) trong tài liệu YAML. */
  locate: (path: readonly (string | number)[]) => SrcRef | undefined;
}

const MAX_DIAGNOSTICS = 100;

function normalizeText(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function lineStartsOf(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function offsetToLineCol(starts: readonly number[], offset: number): { line: number; col: number } {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: offset - (starts[lo] ?? 0) + 1 };
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  let cur: number[] = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n] ?? 0;
}

function suggest(key: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDist = 3; // chỉ gợi ý khi Levenshtein ≤ 2
  for (const c of candidates) {
    const d = levenshtein(key, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/** Đọc `params` của một zod issue (zod v4 không khai báo `params` trong
 * type `$ZodIssue`; các superRefine của VCS đặt `diagnosticCode` /
 * `relatedPath` ở đó). */
export function zodIssueParams(issue: unknown): {
  diagnosticCode?: string;
  relatedPath?: (string | number)[];
} {
  if (typeof issue !== 'object' || issue === null) return {};
  const params = (issue as { params?: unknown }).params;
  if (typeof params !== 'object' || params === null) return {};
  const rec = params as Record<string, unknown>;
  const out: { diagnosticCode?: string; relatedPath?: (string | number)[] } = {};
  if (typeof rec.diagnosticCode === 'string') out.diagnosticCode = rec.diagnosticCode;
  if (Array.isArray(rec.relatedPath)) {
    out.relatedPath = rec.relatedPath as (string | number)[];
  }
  return out;
}

function makeLocator(
  file: string,
  text: string,
  doc: Document.Parsed,
): {
  locate: (path: readonly (string | number)[]) => SrcRef | undefined;
} {
  const starts = lineStartsOf(text);
  const toRef = (node: Node | null | undefined): SrcRef | undefined => {
    if (node === null || node === undefined) return undefined;
    const range = node.range;
    if (range === null || range === undefined) return { file, line: 1, col: 1 };
    const start = offsetToLineCol(starts, range[0]);
    const end = offsetToLineCol(starts, range[1]);
    return { file, line: start.line, col: start.col, endLine: end.line, endCol: end.col };
  };
  const locate = (path: readonly (string | number)[]): SrcRef | undefined => {
    let node: unknown = doc.contents;
    let last: unknown = node;
    for (const seg of path) {
      if (isMap(node)) {
        const pair = node.items.find((p) => isScalar(p.key) && p.key.value === seg);
        if (pair === undefined) break; // khóa thiếu: dùng vị trí của map cha
        last = pair.value;
        node = pair.value;
      } else if (isSeq(node)) {
        if (typeof seg !== 'number' || seg < 0 || seg >= node.items.length) break;
        last = node.items[seg] ?? null;
        node = node.items[seg] ?? null;
      } else {
        break;
      }
    }
    return toRef(last as Node | null | undefined);
  };
  return { locate };
}

function formatPath(path: readonly (string | number)[]): string {
  let out = '';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${String(seg)}]`;
    else out += out === '' ? seg : `.${seg}`;
  }
  return out;
}

interface ZodIssueLike {
  code: string;
  path: (string | number)[];
  message: string;
  expected?: unknown;
  values?: unknown[];
  minimum?: unknown;
  maximum?: unknown;
  input?: unknown;
}

/** Định dạng một giá trị unknown thành chuỗi an toàn (tránh [object Object]). */
function fmtUnknown(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v);
  if (v === undefined) return '?';
  return JSON.stringify(v);
}

function friendlyMessage(issue: ZodIssueLike, received: unknown): string {
  const p = formatPath(issue.path);
  const prefix = p === '' ? '' : `${p}: `;
  switch (issue.code) {
    case 'invalid_value': {
      const allowed = Array.isArray(issue.values) ? issue.values.map(String).join(', ') : '';
      const shown = typeof received === 'string' ? `'${received}'` : String(received);
      return `${prefix}giá trị ${shown} không hợp lệ (cho phép: ${allowed})`;
    }
    case 'invalid_type': {
      const got = received === undefined ? '' : `, nhận ${typeof received}`;
      return `${prefix}kiểu không hợp lệ (cần ${fmtUnknown(issue.expected)}${got})`;
    }
    case 'too_small':
      return `${prefix}giá trị quá nhỏ (tối thiểu ${fmtUnknown(issue.minimum)})`;
    case 'too_big':
      return `${prefix}giá trị quá lớn (tối đa ${fmtUnknown(issue.maximum)})`;
    case 'invalid_string':
      return `${prefix}không khớp định dạng yêu cầu`;
    case 'custom':
      return `${prefix}${issue.message}`;
    default:
      return `${prefix}${issue.message}`;
  }
}

function collectUnknownKeys(
  node: unknown,
  shape: YamlShape | undefined,
  file: string,
  text: string,
  out: Diagnostic[],
): void {
  if (node === null || node === undefined || shape === undefined || shape.freeForm === true) {
    return;
  }
  const starts = lineStartsOf(text);
  if (isMap(node) && shape.keys !== undefined) {
    for (const pair of node.items) {
      const keyNode = pair.key;
      if (!isScalar(keyNode)) continue;
      const key = String(keyNode.value);
      const range = keyNode.range;
      const pos =
        range !== null && range !== undefined
          ? offsetToLineCol(starts, range[0])
          : { line: 1, col: 1 };
      if (!shape.keys.includes(key)) {
        const hint = suggest(key, shape.keys);
        out.push(
          diag(
            'PRJ-W001',
            'warning',
            `khóa lạ '${key}'${hint !== undefined ? ` (ý bạn là '${hint}'?)` : ''}`,
            { file, line: pos.line, col: pos.col },
            PRJ_CATALOG.get('PRJ-W001')?.hint,
          ),
        );
        continue;
      }
      const childShape = shape.children?.[key];
      if (childShape !== undefined) {
        collectUnknownKeys(pair.value, childShape, file, text, out);
      }
    }
    return;
  }
  if (isSeq(node) && shape.items !== undefined) {
    for (const item of node.items) {
      collectUnknownKeys(item, shape.items, file, text, out);
    }
  }
}

/** Lấy giá trị tại một đường dẫn trong object đã parse (zod v4 không đưa
 * giá trị nhận được vào issue, nên cần tra lại để viết thông điệp). */
function valueAtPath(root: unknown, path: readonly (string | number)[]): unknown {
  let cur: unknown = root;
  for (const seg of path) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return cur;
}

export function parseYamlWithSchema<T>(
  file: string,
  text: string,
  schema: ZodType<T>,
  opts?: { shape?: YamlShape },
): ParseYamlResult<T> {
  const normalized = normalizeText(text);
  const diagnostics: Diagnostic[] = [];

  // Tab trong thụt đầu dòng → lỗi cú pháp rõ ràng (M0 §4.3).
  const lines = normalized.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const leading = /^[\t ]*/.exec(line)?.[0] ?? '';
    if (leading.includes('\t')) {
      diagnostics.push(
        diag(
          'PRJ-E002',
          'error',
          'tab không được dùng để thụt đầu dòng trong YAML',
          { file, line: i + 1, col: leading.indexOf('\t') + 1 },
          PRJ_CATALOG.get('PRJ-E002')?.hint,
        ),
      );
    }
  }
  if (diagnostics.length > 0) {
    return { diagnostics: sortDiagnostics(diagnostics), locate: () => undefined };
  }

  const doc = parseDocument(normalized, { strict: true, uniqueKeys: true });
  const { locate } = makeLocator(file, normalized, doc);

  if (doc.errors.length > 0) {
    for (const err of doc.errors) {
      const pos = err.linePos?.[0];
      diagnostics.push(
        diag(
          'PRJ-E002',
          'error',
          err.message,
          { file, line: pos?.line ?? 1, col: pos?.col ?? 1 },
          PRJ_CATALOG.get('PRJ-E002')?.hint,
        ),
      );
    }
    return { diagnostics: sortDiagnostics(diagnostics).slice(0, MAX_DIAGNOSTICS), locate };
  }

  let plain: unknown;
  try {
    plain = doc.toJS();
  } catch (err) {
    diagnostics.push(
      diag(
        'PRJ-E002',
        'error',
        err instanceof Error ? err.message : 'không thể phân tích YAML',
        { file, line: 1, col: 1 },
        PRJ_CATALOG.get('PRJ-E002')?.hint,
      ),
    );
    return { diagnostics: sortDiagnostics(diagnostics), locate };
  }

  const result = schema.safeParse(plain);
  if (!result.success) {
    for (const raw of result.error.issues) {
      const issue = raw as unknown as ZodIssueLike;
      const params = zodIssueParams(raw);
      const code = params.diagnosticCode ?? 'PRJ-E003';
      const pos = locate(issue.path);
      const related = params.relatedPath !== undefined ? locate(params.relatedPath) : undefined;
      const d = diag(
        code,
        PRJ_CATALOG.get(code)?.severity ?? 'error',
        friendlyMessage(issue, valueAtPath(plain, issue.path)),
        pos,
        PRJ_CATALOG.get(code)?.hint,
      );
      if (related !== undefined) d.related = [related];
      diagnostics.push(d);
    }
  }

  if (opts?.shape !== undefined && doc.contents !== null) {
    collectUnknownKeys(doc.contents, opts.shape, file, normalized, diagnostics);
  }

  const out: ParseYamlResult<T> = {
    diagnostics: sortDiagnostics(diagnostics).slice(0, MAX_DIAGNOSTICS),
    locate,
  };
  if (result.success) out.value = result.data;
  return out;
}
