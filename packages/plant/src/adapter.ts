// Adapter raw↔eng cho tag analog — @vcs/plant (M2 §3.2, bảng A).
// Quy ước S7: 0..27648 ↔ engMin..engMax; KHÔNG clamp eng (110% → 30413);
// chỉ clamp raw về [−4864, 32511] (125% → 34560 → 32511).

import type { Scaling } from '@vcs/schemas';

/** Giới hạn clamp của raw (S7, xem §3.2). */
export const RAW_CLAMP_MIN = -4864;
export const RAW_CLAMP_MAX = 32511;

/** Dải đo đã resolve đầy đủ cho một role analog. */
export interface Range {
  rawMin: number;
  rawMax: number;
  engMin: number;
  engMax: number;
  unit?: string;
}

export function clampRaw(raw: number): number {
  return Math.min(RAW_CLAMP_MAX, Math.max(RAW_CLAMP_MIN, raw));
}

/** eng → raw (làm tròn, rồi clamp về [−4864, 32511]). Không clamp eng. */
export function engToRaw(eng: number, r: Range): number {
  const span = r.engMax - r.engMin;
  if (span === 0) return clampRaw(Math.round(r.rawMin));
  const raw = r.rawMin + ((eng - r.engMin) / span) * (r.rawMax - r.rawMin);
  return clampRaw(Math.round(raw));
}

/** raw → eng (không clamp — raw ngoài dải vẫn cho eng ngoài dải). */
export function rawToEng(raw: number, r: Range): number {
  const span = r.rawMax - r.rawMin;
  if (span === 0) return r.engMin;
  return r.engMin + ((raw - r.rawMin) / span) * (r.engMax - r.engMin);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Resolve dải đo cho một role analog, theo thứ tự ưu tiên (OQ-242):
 * 1. `params.engMin/engMax` (rawMin/rawMax lấy từ scaling của tag, mặc định 0/27648);
 * 2. `scaling` của tag;
 * 3. mặc định 0..100 — chỉ khi unit là `%`;
 * 4. không resolve được → undefined (engine báo PL-E012).
 */
export function resolveRange(
  params: Record<string, unknown> | undefined,
  scaling: Scaling | undefined,
  unit: string | undefined,
): Range | undefined {
  const rawMin = scaling?.rawMin ?? 0;
  const rawMax = scaling?.rawMax ?? 27648;
  const pMin = params?.['engMin'];
  const pMax = params?.['engMax'];
  if (isFiniteNumber(pMin) && isFiniteNumber(pMax)) {
    const r: Range = { rawMin, rawMax, engMin: pMin, engMax: pMax };
    if (unit !== undefined) r.unit = unit;
    return r;
  }
  if (scaling !== undefined) {
    const r: Range = { rawMin, rawMax, engMin: scaling.engMin, engMax: scaling.engMax };
    if (unit !== undefined) r.unit = unit;
    return r;
  }
  if (unit === '%') {
    return { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: '%' };
  }
  return undefined;
}
