// Diff tags cũ (tags.yaml) với tín hiệu mới đã validate (M2 §8.8, P2.6 commit 5).
// Hàm thuần, tất định.
// - Khóa so khớp: tên tag chuẩn hóa, không phân biệt hoa/thường.
// - Scope (OQ-354): chỉ controller có trong file import; tag của
//   controller khác không đụng (không vào bucket nào).
// - Tag `provenance: manual` không bị ghi đè/xóa trừ `--overwrite-manual`
//   (OQ-354); tag manual khác giá trị nhưng không áp → `skippedManual`
//   (OQ-355), không gộp vào `unchanged`.
// - `renamedCandidates` chỉ đề xuất: removed × added cùng địa chỉ chuẩn;
//   commit vẫn áp removed+added và báo candidate trong report.

import type { TagDef } from '@vcs/schemas';
import type { NormalizedSignal } from './normalize.js';

/** Một trường thay đổi: `field` dạng dotted (`signal.scaling.engMax`). */
export interface TagChange {
  tag: string;
  field: string;
  old: unknown;
  next: unknown;
}

export interface SkippedManual {
  tag: string;
  /** Trường khác giá trị (rỗng khi lý do là 'removed'). */
  fields: string[];
  reason: 'changed' | 'removed';
}

export interface RenameCandidate {
  from: string;
  to: string;
  address: string;
}

export interface DiffResult {
  added: string[];
  removed: string[];
  changed: TagChange[];
  unchanged: string[];
  renamedCandidates: RenameCandidate[];
  /** Ngoài 5 bucket của spec (OQ-355). */
  skippedManual: SkippedManual[];
}

export interface DiffOptions {
  /** Ghi đè tag manual (mặc định false). */
  overwriteManual?: boolean;
}

function byTag(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Các trường import cung cấp — so sánh từng trường; `initial`,
 *  `equipment`, `role`, `origin`, `provenance` KHÔNG so (import không
 *  cung cấp: giữ nguyên giá trị cũ khi commit). */
export function tagFields(oldTag: TagDef, newTag: TagDef): TagChange[] {
  const changes: TagChange[] = [];
  const tag = newTag.name;
  if (oldTag.type !== newTag.type) {
    changes.push({ tag, field: 'type', old: oldTag.type, next: newTag.type });
  }
  if (oldTag.area !== newTag.area) {
    changes.push({ tag, field: 'area', old: oldTag.area, next: newTag.area });
  }
  if (oldTag.address !== newTag.address) {
    changes.push({ tag, field: 'address', old: oldTag.address, next: newTag.address });
  }
  if (oldTag.controller !== newTag.controller) {
    changes.push({ tag, field: 'controller', old: oldTag.controller, next: newTag.controller });
  }
  if (oldTag.description !== newTag.description) {
    changes.push({ tag, field: 'description', old: oldTag.description, next: newTag.description });
  }
  const oSig = oldTag.signal;
  const nSig = newTag.signal;
  if (oSig === undefined && nSig === undefined) {
    // bằng nhau — không đổi.
  } else if (oSig === undefined || nSig === undefined) {
    changes.push({ tag, field: 'signal', old: oSig ?? null, next: nSig ?? null });
  } else {
    if (oSig.kind !== nSig.kind) {
      changes.push({ tag, field: 'signal.kind', old: oSig.kind, next: nSig.kind });
    }
    if (oSig.polarity !== nSig.polarity) {
      changes.push({ tag, field: 'signal.polarity', old: oSig.polarity, next: nSig.polarity });
    }
    const oSc = oSig.scaling;
    const nSc = nSig.scaling;
    if (oSc === undefined && nSc === undefined) {
      // bằng nhau.
    } else if (oSc === undefined || nSc === undefined) {
      changes.push({ tag, field: 'signal.scaling', old: oSc ?? null, next: nSc ?? null });
    } else {
      for (const f of ['rawMin', 'rawMax', 'engMin', 'engMax', 'unit'] as const) {
        if (oSc[f] !== nSc[f]) {
          changes.push({ tag, field: `signal.scaling.${f}`, old: oSc[f], next: nSc[f] });
        }
      }
    }
  }
  return changes;
}

export function diffTags(
  oldTags: TagDef[],
  newSignals: NormalizedSignal[],
  opts: DiffOptions = {},
): DiffResult {
  const overwriteManual = opts.overwriteManual ?? false;
  const added: string[] = [];
  const removed: string[] = [];
  const changed: TagChange[] = [];
  const unchanged: string[] = [];
  const skippedManual: SkippedManual[] = [];

  const newByName = new Map<string, NormalizedSignal>();
  const inScopeControllers = new Set<string>();
  for (const s of newSignals) {
    if (s.tagDef === null) continue;
    newByName.set(s.tag.toLowerCase(), s);
    inScopeControllers.add(s.controller);
  }
  const oldByName = new Map<string, TagDef>();
  for (const t of oldTags) oldByName.set(t.name.toLowerCase(), t);

  for (const s of newSignals) {
    if (s.tagDef === null) continue;
    const old = oldByName.get(s.tag.toLowerCase());
    if (old === undefined) {
      added.push(s.tag);
      continue;
    }
    const fields = tagFields(old, s.tagDef);
    if (old.provenance === 'manual' && !overwriteManual) {
      if (fields.length === 0) unchanged.push(s.tag);
      else {
        skippedManual.push({
          tag: s.tag,
          fields: fields.map((f) => f.field),
          reason: 'changed',
        });
      }
    } else if (fields.length === 0) {
      unchanged.push(s.tag);
    } else {
      changed.push(...fields);
    }
  }

  for (const old of oldTags) {
    if (!inScopeControllers.has(old.controller)) continue;
    if (newByName.has(old.name.toLowerCase())) continue;
    if (old.provenance === 'manual' && !overwriteManual) {
      skippedManual.push({ tag: old.name, fields: [], reason: 'removed' });
    } else {
      removed.push(old.name);
    }
  }

  // renamedCandidates: removed × added cùng địa chỉ chuẩn (ghép tham lam
  // theo tên tag, tất định). Dùng Set cho added (includes trong filter
  // là O(n²) — smoke 20k đo được 2,3 s chỉ riêng diff).
  const renamedCandidates: RenameCandidate[] = [];
  const addedByAddress = new Map<string, NormalizedSignal[]>();
  const addedSet = new Set(added);
  const addedSignals = newSignals
    .filter((s) => s.tagDef !== null && addedSet.has(s.tag))
    .sort((a, b) => byTag(a.tag, b.tag));
  for (const s of addedSignals) {
    if (s.tagDef === null) continue;
    const list = addedByAddress.get(s.tagDef.address) ?? [];
    list.push(s);
    addedByAddress.set(s.tagDef.address, list);
  }
  const removedSorted = [...removed].sort(byTag);
  for (const name of removedSorted) {
    const old = oldByName.get(name.toLowerCase());
    if (old === undefined) continue;
    const candidates = addedByAddress.get(old.address) ?? [];
    const match = candidates.find((s) => !renamedCandidates.some((c) => c.to === s.tag));
    if (match !== undefined) {
      renamedCandidates.push({ from: old.name, to: match.tag, address: old.address });
    }
  }

  added.sort(byTag);
  removed.sort(byTag);
  unchanged.sort(byTag);
  changed.sort((a, b) => byTag(a.tag, b.tag) || (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));
  skippedManual.sort((a, b) => byTag(a.tag, b.tag));
  renamedCandidates.sort((a, b) => byTag(a.from, b.from));
  return { added, removed, changed, unchanged, renamedCandidates, skippedManual };
}
