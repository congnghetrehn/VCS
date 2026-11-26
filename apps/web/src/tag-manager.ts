// Logic thuần cho Tag Manager (M2 §10.2, OQ-385) — lọc/nhóm/xuất CSV.
// Hàng = def live (WS snapshot) join meta equipment/role từ GET /api/tags
// (file trên đĩa) theo tên tag. Tag không có trong file → equipment/role
// rỗng (hiện '—'). Không có trạng thái lỗi ở cấp tag trong API nên §10.2
// "lọc theo trạng thái lỗi" KHÔNG làm được ở P2.8 (ghi lại, không bịa).

import type { TagValue } from '@vcs/schemas';
import type { SnapshotDef } from './store.js';

/** Một dòng tags.yaml từ GET /api/tags (chỉ field Tag Manager dùng). */
export interface TagMeta {
  name: string;
  equipment?: string;
  role?: string;
}

export type TagMetaMap = Map<string, TagMeta>;

export function buildTagMetaMap(tags: TagMeta[]): TagMetaMap {
  const map: TagMetaMap = new Map();
  for (const t of tags) map.set(t.name, t);
  return map;
}

/** Hàng đã join: def live + equipment/role từ file + giá trị live. */
export interface TagRow {
  defIndex: number;
  def: SnapshotDef;
  equipment: string;
  role: string;
  value: TagValue | undefined;
}

export interface TagFilters {
  query: string;
  controller: string;
  area: string;
  type: string;
  equipment: string;
}

export const ALL = 'all';
/** Giá trị filter equipment cho "chưa gán thiết bị". */
export const UNASSIGNED = '';

export function filterTagRows(
  defs: SnapshotDef[],
  meta: TagMetaMap,
  values: Map<number, TagValue>,
  filters: TagFilters,
): TagRow[] {
  const q = filters.query.trim().toLowerCase();
  const out: TagRow[] = [];
  defs.forEach((def, i) => {
    if (filters.controller !== ALL && def.controller !== filters.controller) return;
    if (filters.area !== ALL && def.area !== filters.area) return;
    if (filters.type !== ALL && def.type !== filters.type) return;
    const m = meta.get(def.name);
    const equipment = m?.equipment ?? '';
    const role = m?.role ?? '';
    if (filters.equipment !== ALL && equipment !== filters.equipment) return;
    if (q !== '') {
      const hay = `${def.name} ${def.description ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return;
    }
    out.push({ defIndex: i, def, equipment, role, value: values.get(i) });
  });
  return out;
}

export type TagListItem =
  | { kind: 'group'; key: string; equipment: string; count: number }
  | { kind: 'row'; key: string; row: TagRow };

/** Nhóm hàng theo equipment (A→Z, chưa gán '—' cuối); trong nhóm giữ
 *  thứ tự def. Không nhóm → trả nguyên hàng (không có item group). */
export function groupTagRows(rows: TagRow[], grouped: boolean): TagListItem[] {
  if (!grouped) {
    return rows.map((row) => ({ kind: 'row', key: `r:${row.def.name}`, row }));
  }
  const groups = new Map<string, TagRow[]>();
  for (const row of rows) {
    const list = groups.get(row.equipment) ?? [];
    list.push(row);
    groups.set(row.equipment, list);
  }
  const names = [...groups.keys()].sort((a, b) => {
    if (a === '') return 1;
    if (b === '') return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const out: TagListItem[] = [];
  for (const name of names) {
    const list = groups.get(name) ?? [];
    out.push({
      kind: 'group',
      key: `g:${name === '' ? '—' : name}`,
      equipment: name,
      count: list.length,
    });
    for (const row of list) out.push({ kind: 'row', key: `r:${row.def.name}`, row });
  }
  return out;
}

/** Tên equipment distinct (đã sort) cho select lọc + datalist sửa ô. */
export function distinctEquipment(meta: TagMetaMap): string[] {
  const seen = new Set<string>();
  for (const m of meta.values()) {
    if (m.equipment !== undefined && m.equipment !== '') seen.add(m.equipment);
  }
  return [...seen].sort();
}

export function distinctRoles(meta: TagMetaMap): string[] {
  const seen = new Set<string>();
  for (const m of meta.values()) {
    if (m.role !== undefined && m.role !== '') seen.add(m.role);
  }
  return [...seen].sort();
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

function valueText(value: TagValue | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

export const TAG_CSV_HEADER =
  'name,type,area,address,controller,description,equipment,role,value';

/** CSV xuất Tag Manager: 1 dòng/header + 1 dòng/tag (đã lọc), CRLF-free. */
export function buildTagCsv(rows: TagRow[]): string {
  const lines = [TAG_CSV_HEADER];
  for (const row of rows) {
    lines.push(
      [
        row.def.name,
        row.def.type,
        row.def.area,
        row.def.address,
        row.def.controller,
        row.def.description ?? '',
        row.equipment,
        row.role,
        valueText(row.value),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
