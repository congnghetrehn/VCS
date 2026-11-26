// Commit diff vào tags.yaml (M2 §8.8, P2.6 commit 5).
// Hàm thuần: `applyCommit` trả danh sách tag mới (không ghi file —
// ghi file ở biên CLI); `serializeTags` dump YAML; `safetyNetCheck`
// kiểm danh sách mới qua `tagsFileSchema` TRƯỚC khi ghi (TC-2:
// safety net từ chối → không commit).
// - Idempotent: commit 2 lần cùng file → diff rỗng + YAML byte-identical
//   (tag unchanged giữ nguyên TagDef cũ kể cả origin — OQ-355).
// - Tag changed/added lấy TagDef mới nhưng GIỮ `initial`/`equipment`/
//   `role` cũ (import không cung cấp); provenance → 'import'.
// - Sắp xếp ổn định: controller → area (I/Q/M/DB) → địa chỉ
//   (byte, size, bit; DB theo số DB) → tên tag.

import { stringify as stringifyYaml } from 'yaml';
import {
  diag,
  sortDiagnostics,
  tagsFileSchema,
  zodIssueParams,
  type Diagnostic,
  type TagDef,
} from '@vcs/schemas';
import { normalizeAddress } from './address.js';
import type { DiffResult } from './diff.js';
import type { NormalizedSignal } from './normalize.js';

function areaRank(area: TagDef['area']): number {
  switch (area) {
    case 'I': return 0;
    case 'Q': return 1;
    case 'M': return 2;
    case 'DB': return 3;
  }
}

function sizeRank(size: string | null): number {
  switch (size) {
    case 'bit': return 0;
    case 'B': return 1;
    case 'W': return 2;
    case 'D': return 3;
    default: return 4;
  }
}

/** Thứ tự ổn định để ghi tags.yaml (diff git sạch). */
export function compareTagDefs(a: TagDef, b: TagDef): number {
  if (a.controller !== b.controller) return a.controller < b.controller ? -1 : 1;
  const ra = areaRank(a.area);
  const rb = areaRank(b.area);
  if (ra !== rb) return ra - rb;
  const pa = normalizeAddress(a.address);
  const pb = normalizeAddress(b.address);
  if (pa.ok && pb.ok && !pa.address.symbolic && !pb.address.symbolic) {
    const na = pa.address;
    const nb = pb.address;
    if ((na.db ?? 0) !== (nb.db ?? 0)) return (na.db ?? 0) - (nb.db ?? 0);
    if ((na.byte ?? 0) !== (nb.byte ?? 0)) return (na.byte ?? 0) - (nb.byte ?? 0);
    if (sizeRank(na.size) !== sizeRank(nb.size)) return sizeRank(na.size) - sizeRank(nb.size);
    if ((na.bit ?? 0) !== (nb.bit ?? 0)) return (na.bit ?? 0) - (nb.bit ?? 0);
  } else if (a.address !== b.address) {
    return a.address < b.address ? -1 : 1;
  }
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return 0;
}

export function applyCommit(
  oldTags: TagDef[],
  diff: DiffResult,
  newSignals: NormalizedSignal[],
): TagDef[] {
  const newByName = new Map<string, NormalizedSignal>();
  for (const s of newSignals) {
    if (s.tagDef === null) continue;
    newByName.set(s.tag.toLowerCase(), s);
  }
  const removedNames = new Set(diff.removed.map((t) => t.toLowerCase()));
  const changedNames = new Set(diff.changed.map((c) => c.tag.toLowerCase()));
  const out: TagDef[] = [];
  for (const old of oldTags) {
    const key = old.name.toLowerCase();
    if (removedNames.has(key)) continue;
    if (changedNames.has(key)) {
      const fresh = newByName.get(key)?.tagDef;
      if (fresh === undefined || fresh === null) {
        // Không xảy ra (changed suy từ newSignals) — giữ cũ cho an toàn.
        out.push(old);
        continue;
      }
      // TagDef mới, giữ initial/equipment/role cũ (import không cung cấp).
      const merged: TagDef = { ...fresh };
      if (old.initial !== undefined) merged.initial = old.initial;
      if (old.equipment !== undefined) merged.equipment = old.equipment;
      if (old.role !== undefined) merged.role = old.role;
      out.push(merged);
      continue;
    }
    out.push(old);
  }
  for (const tag of diff.added) {
    const fresh = newByName.get(tag.toLowerCase())?.tagDef;
    if (fresh !== undefined && fresh !== null) out.push(fresh);
  }
  out.sort(compareTagDefs);
  return out;
}

/** Dump `{ tags: [...] }` thành YAML (cùng style `saveProfile`). */
export function serializeTags(tags: TagDef[]): string {
  return stringifyYaml({ tags });
}

/** Lưới an toàn: danh sách tag mới phải parse được qua `tagsFileSchema`
 *  (trùng tên/địa chỉ, kind↔area, scaling… — cùng mã PRJ-* như khi load
 *  project). Trả [] khi hợp lệ. `file` là đường dẫn sẽ ghi (cho report). */
export function safetyNetCheck(tags: TagDef[], file = 'tags/tags.yaml'): Diagnostic[] {
  const parsed = tagsFileSchema.safeParse({ tags });
  if (parsed.success) return [];
  const diagnostics: Diagnostic[] = [];
  for (const issue of parsed.error.issues) {
    const params = zodIssueParams(issue);
    const code = params.diagnosticCode ?? 'PRJ-E003';
    const tagIdx = typeof issue.path[1] === 'number' ? issue.path[1] : null;
    const tagName = tagIdx !== null ? tags[tagIdx]?.name : undefined;
    const message =
      tagName !== undefined ? `tag '${tagName}': ${issue.message}` : issue.message;
    diagnostics.push(diag(code, 'error', message, { file }));
  }
  return sortDiagnostics(diagnostics);
}
