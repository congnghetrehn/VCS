// Lưu/đọc import-profile.yaml + khớp profile (M2 §4.4 + §8.3, P2.5
// commit 4). Profile parse bằng zod ở biên; lỗi → Error thường có thông
// điệp rõ (không mã Diagnostic mới — OQ-331).

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { importProfileSchema, type ImportProfile } from '@vcs/schemas';
import type { RawGrid } from './read-csv.js';
import { findStationAreaColumns, normalizeColumnName, type MappingSuggestion } from './mapping.js';

/** Lưu profile thành YAML (để ghi import-profile.yaml). */
export function saveProfile(profile: ImportProfile): string {
  return stringifyYaml(profile);
}

/** Đọc profile từ YAML; lỗi parse YAML hoặc zod → Error thường. */
export function loadProfile(text: string): ImportProfile {
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Profile YAML không parse được: ${detail}`);
  }
  const result = importProfileSchema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Profile không hợp lệ: ${details}`);
  }
  return result.data;
}

/** Khớp profile đã lưu với file hiện tại (OQ-333): tên sheet khớp chính
 *  xác (nếu profile có sheet) + bộ header bằng nhau không kể thứ tự
 *  (chuẩn hóa tên, so sánh tập hợp). Profile cũ không có `headers` thì
 *  fallback: mọi tên cột trong mapping phải có mặt trong headers hiện tại.
 *  Sai khớp → gợi ý mapping lại, KHÔNG dùng lén profile cũ. */
export function matchesProfile(
  profile: ImportProfile,
  sheetName: string | undefined,
  headers: string[],
): boolean {
  if (profile.sheet !== undefined && profile.sheet !== sheetName) return false;
  const saved = profile.headers;
  if (saved !== undefined && saved.length > 0) {
    const a = new Set(saved.map(normalizeColumnName));
    const b = new Set(headers.map(normalizeColumnName));
    if (a.size !== b.size) return false;
    for (const h of a) if (!b.has(h)) return false;
    return true;
  }
  const names = Object.values(profile.mapping).filter((v) => !/^[A-Za-z]{1,2}$/.test(v));
  return names.every((n) => headers.some((h) => normalizeColumnName(h) === normalizeColumnName(n)));
}

/** Dựng profile từ lưới đã dò header + gợi ý mapping (để lưu lại dùng
 *  cho lần sau). fillDownColumns suy từ merge dọc ở cột station/area
 *  (tên chuẩn hóa, vd 'station'); encoding/delimiter lấy từ meta của lưới
 *  CSV, XLSX thì 'auto'. */
export function buildProfile(
  grid: RawGrid,
  headerRow: number,
  firstDataRow: number,
  suggestions: MappingSuggestion[],
  meta: { name: string; file?: string },
): ImportProfile {
  const headerIndex = grid.rowNumbers?.indexOf(headerRow) ?? headerRow - 1;
  const headerCells = grid.rows[headerIndex] ?? [];
  const headers = headerCells.map((c) => (typeof c === 'string' ? c : c === null ? '' : String(c)));
  const mapping: Record<string, string> = {};
  for (const s of suggestions) mapping[s.field] = s.column;
  const fillDownColumns = findStationAreaColumns(grid, headerRow).map((f) => normalizeColumnName(f.name));
  return importProfileSchema.parse({
    name: meta.name,
    file: meta.file ?? grid.origin.file,
    sheet: grid.origin.sheet,
    headerRow,
    firstDataRow,
    lastDataRow: null,
    fillDownColumns,
    encoding: grid.meta?.encoding ?? 'auto',
    delimiter: grid.meta?.delimiter ?? 'auto',
    mapping,
    headers,
  });
}
