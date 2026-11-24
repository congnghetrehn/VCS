// Migrate schema project — @vcs/schemas (M0 §4.4).
// Bảng `migrations` rỗng ở M0, nhưng đường đi hoàn chỉnh:
// `migrateProject(doc) → { doc, applied[] }` và có test.

export interface Migration {
  /** Phiên bản nguồn. */
  from: number;
  /** Phiên bản đích. */
  to: number;
  apply: (doc: Record<string, unknown>) => Record<string, unknown>;
}

/** Bảng migrate theo phiên bản schema. Rỗng ở M0. */
export const migrations: Migration[] = [];

export function migrateProject(doc: unknown): { doc: unknown; applied: number[] } {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return { doc, applied: [] };
  }
  let current: Record<string, unknown> = doc as Record<string, unknown>;
  const applied: number[] = [];
  for (;;) {
    const version = typeof current.schemaVersion === 'number' ? current.schemaVersion : 0;
    const m = migrations.find((x) => x.from === version);
    if (m === undefined) break;
    current = m.apply({ ...current });
    applied.push(m.to);
  }
  return { doc: current, applied };
}
