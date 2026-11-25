// Source của plant — @vcs/plant (M2 §4.2, §6.3).
// Resolve giá trị nguồn tại một thời điểm + sắp xếp topo theo link.

import type { SourceSpec } from '@vcs/schemas';

/** Trạng thái runtime của một source (gốc thời gian = lúc set source). */
export interface SourceRuntime {
  spec: SourceSpec;
  setAtMs: number;
  manualValue: number | boolean;
}

/**
 * Tính giá trị nguồn tại `simTimeMs`. `originMs` = setAtMs (ramp/sine đo từ đó).
 * Link đọc observable của thiết bị khác; observable chưa có giá trị → 0.
 */
export function evalSource(
  spec: SourceSpec,
  simTimeMs: number,
  originMs: number,
  manualValue: number | boolean,
  getObs: (equipmentId: string, key: string) => number | boolean | string | undefined,
): number | boolean {
  switch (spec.kind) {
    case 'manual':
      return manualValue;
    case 'const':
      return spec.value ?? 0;
    case 'ramp': {
      const from = spec.from ?? 0;
      const to = spec.to ?? 0;
      const dur = spec.durationMs ?? 1;
      const p = Math.min(1, Math.max(0, (simTimeMs - originMs) / dur));
      return from + (to - from) * p;
    }
    case 'sine': {
      const period = spec.periodMs ?? 1;
      const amp = spec.amplitude ?? 0;
      const off = spec.offset ?? 0;
      return off + amp * Math.sin((2 * Math.PI * (simTimeMs - originMs)) / period);
    }
    case 'link': {
      const v = getObs(spec.equipment ?? '', spec.observable ?? '');
      if (typeof v === 'number') return v * (spec.scale ?? 1) + (spec.offset ?? 0);
      if (typeof v === 'boolean') return v;
      return 0;
    }
  }
}

export interface TopoResult {
  order: string[];
  /** Các id còn lại khi không sắp xếp được (chu trình hoặc phụ thuộc treo). */
  cycle?: string[];
}

/**
 * Sắp xếp topo (Kahn) với tie-break theo id tăng dần — tất định.
 * `dependsOn(id)` liệt kê các id mà `id` phụ thuộc (phải đứng trước).
 */
export function topoSort(
  ids: readonly string[],
  dependsOn: (id: string) => readonly string[],
): TopoResult {
  const remaining = new Set(ids);
  const done = new Set<string>();
  const order: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((id) => dependsOn(id).every((d) => done.has(d)))
      .sort();
    if (ready.length === 0) {
      return { order, cycle: [...remaining].sort() };
    }
    for (const id of ready) {
      remaining.delete(id);
      done.add(id);
      order.push(id);
    }
  }
  return { order };
}
