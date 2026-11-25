// FaultManager — @vcs/plant (M2 §6).
// Quản lý vòng đời lỗi: pending → active → cleared (hết duration hoặc clear tay).
// Lỗi tín hiệu áp dụng theo thứ tự §6.2; DelayLine cấp phát ở inject (OQ-240),
// giá trị freeze chụp tại lúc kích hoạt (advance), từ giá trị emit gần nhất.

import { DelayLine } from './delay.js';
import { rngGaussian, type RngState } from './rng.js';
import type { FaultInfo, FaultRequest, FaultTarget, SignalFaultType, SignalKind } from '@vcs/schemas';

/**
 * Thứ tự áp dụng lỗi tín hiệu phía emit (M2 §6.2) — số nhỏ áp trước.
 * Chỉ 12 loại phía emit; `lost`/`stuckCmd` áp phía cmd (applyCmd).
 */
export const SIGNAL_FAULT_ORDER: Record<Exclude<SignalFaultType, 'lost' | 'stuckCmd'>, number> = {
  delay: 0,
  gain: 1,
  offset: 2,
  drift: 3,
  noise: 4,
  spike: 5,
  stuck: 6,
  freeze: 7,
  invert: 8,
  chatter: 9,
  outOfRange: 10,
  wireBreak: 11,
};

export type FaultState = 'pending' | 'active' | 'cleared';

export interface FaultRecord {
  id: string;
  target: FaultTarget;
  state: FaultState;
  activateAtMs: number;
  sinceMs: number;
  clearedAtMs?: number;
  durationMs?: number;
  params: Record<string, unknown>;
  delayLine?: DelayLine<number | boolean>;
  freezeValue?: number | boolean;
}

export interface FaultManagerOptions {
  /** Bước mô phỏng (ms) — dùng tính n của DelayLine ở inject. Mặc định 10. */
  stepMs?: number;
  /** Raw khi đứt dây (AI). Mặc định 32767. */
  wireBreakRaw?: number;
  /** Giá trị emit gần nhất của (equipment, role) — dùng lấp DelayLine và chụp freeze. */
  initialValue?: (equipmentId: string, role: string) => number | boolean | undefined;
}

export interface FaultRecordSnapshot {
  id: string;
  target: FaultTarget;
  state: FaultState;
  activateAtMs: number;
  sinceMs: number;
  clearedAtMs: number | null;
  durationMs: number | null;
  params: Record<string, unknown>;
  delay: { buf: (number | boolean | undefined)[]; idx: number } | null;
  freezeValue: number | boolean | null;
}

export interface FaultManagerSnapshot {
  version: 1;
  nextSeq: number;
  records: FaultRecordSnapshot[];
}

function isSignalTarget(t: FaultTarget): t is Extract<FaultTarget, { signal: string }> {
  return 'signal' in t;
}

function numParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export class FaultManager {
  #records: FaultRecord[] = [];
  #nextSeq = 1;
  #stepMs: number;
  #wireBreakRaw: number;
  #initialValue: FaultManagerOptions['initialValue'];

  constructor(options: FaultManagerOptions = {}) {
    this.#stepMs = options.stepMs ?? 10;
    this.#wireBreakRaw = options.wireBreakRaw ?? 32767;
    this.#initialValue = options.initialValue;
  }

  /**
   * Chèn một lỗi, trả về id `F-0001`, `F-0002`, ...
   * `nowMs` là thời điểm hiện tại (dịch 'now' → nowMs, 'after' → nowMs + afterMs).
   */
  inject(req: FaultRequest, nowMs = 0): string {
    const id = `F-${String(this.#nextSeq).padStart(4, '0')}`;
    this.#nextSeq += 1;
    const activateAtMs =
      req.when.at === 'now' ? nowMs : req.when.at === 'time' ? req.when.timeMs : nowMs + req.when.afterMs;
    const record: FaultRecord = {
      id,
      target: req.target,
      state: 'pending',
      activateAtMs,
      sinceMs: 0,
      params: req.params ?? {},
    };
    if (req.durationMs !== undefined) record.durationMs = req.durationMs;
    if (isSignalTarget(req.target) && req.target.type === 'delay') {
      const delayMs = numParam(record.params, 'delayMs', 0);
      const n = Math.max(0, Math.round(delayMs / this.#stepMs));
      const fill = this.#initialValue?.(req.target.equipment, req.target.signal);
      record.delayLine = new DelayLine<number | boolean>(n, fill ?? 0);
    }
    this.#records.push(record);
    return id;
  }

  /**
   * Kích hoạt các lỗi pending đã tới giờ, hết hạn các lỗi active đã quá
   * duration (hết hạn khi T ≥ sinceMs + durationMs).
   */
  advance(T: number): { activated: FaultRecord[]; expired: FaultRecord[] } {
    const activated: FaultRecord[] = [];
    const expired: FaultRecord[] = [];
    for (const r of this.#records) {
      if (r.state === 'pending' && r.activateAtMs <= T) {
        r.state = 'active';
        r.sinceMs = r.activateAtMs;
        if (isSignalTarget(r.target) && r.target.type === 'freeze') {
          const v = this.#initialValue?.(r.target.equipment, r.target.signal);
          if (v !== undefined) r.freezeValue = v;
        }
        activated.push(r);
      }
      if (r.state === 'active' && r.durationMs !== undefined && r.sinceMs + r.durationMs <= T) {
        r.state = 'cleared';
        r.clearedAtMs = r.sinceMs + r.durationMs;
        expired.push(r);
      }
    }
    return { activated, expired };
  }

  /** Clear tay một lỗi (pending hoặc active) tại thời điểm `atMs`. */
  clear(id: string, atMs: number): boolean {
    const r = this.#records.find((x) => x.id === id);
    if (r === undefined || r.state === 'cleared') return false;
    r.state = 'cleared';
    r.clearedAtMs = atMs;
    return true;
  }

  list(): FaultInfo[] {
    return this.#records.map((r) => {
      const info: FaultInfo = {
        id: r.id,
        target: r.target,
        state: r.state,
        sinceMs: r.sinceMs,
        params: { ...r.params },
      };
      if (r.clearedAtMs !== undefined) info.clearedAtMs = r.clearedAtMs;
      return info;
    });
  }

  get(id: string): FaultRecord | undefined {
    return this.#records.find((r) => r.id === id);
  }

  /** Trạng thái lỗi thiết bị mới nhất của (equipment, faultId). */
  equipmentFault(
    equipmentId: string,
    faultId: string,
  ): { active: boolean; params: Record<string, unknown>; sinceMs: number; clearedAtMs?: number } {
    for (let i = this.#records.length - 1; i >= 0; i--) {
      const r = this.#records[i] as FaultRecord;
      if (!isSignalTarget(r.target) && r.target.equipment === equipmentId && r.target.fault === faultId) {
        const out: {
          active: boolean;
          params: Record<string, unknown>;
          sinceMs: number;
          clearedAtMs?: number;
        } = { active: r.state === 'active', params: { ...r.params }, sinceMs: r.sinceMs };
        if (r.clearedAtMs !== undefined) out.clearedAtMs = r.clearedAtMs;
        return out;
      }
    }
    return { active: false, params: {}, sinceMs: 0 };
  }

  #activeSignalFaults(equipmentId: string, role: string): FaultRecord[] {
    const orderOf = (t: SignalFaultType): number =>
      t === 'lost' || t === 'stuckCmd' ? 99 : SIGNAL_FAULT_ORDER[t];
    return this.#records
      .filter(
        (r) =>
          r.state === 'active' &&
          isSignalTarget(r.target) &&
          r.target.equipment === equipmentId &&
          r.target.signal === role,
      )
      .sort(
        (a, b) =>
          orderOf((a.target as Extract<FaultTarget, { signal: string }>).type) -
          orderOf((b.target as Extract<FaultTarget, { signal: string }>).type),
      );
  }

  /**
   * Áp lỗi tín hiệu lên giá trị emit (DI/AI), theo thứ tự §6.2.
   * Trả về giá trị đã biến đổi, hoặc rawOverride khi lỗi chiếm raw (wireBreak/outOfRange).
   */
  applyEmit(
    equipmentId: string,
    role: string,
    kind: SignalKind,
    value: number | boolean,
    T: number,
    dtMs: number,
    rng: RngState,
  ): { value: number | boolean } | { rawOverride: number } {
    let v: number | boolean = value;
    for (const r of this.#activeSignalFaults(equipmentId, role)) {
      const type = (r.target as Extract<FaultTarget, { signal: string }>).type;
      const p = r.params;
      switch (type) {
        case 'delay':
          if (r.delayLine !== undefined) v = r.delayLine.push(v);
          break;
        case 'gain':
          if (typeof v === 'number') v = v * numParam(p, 'factor', 1);
          break;
        case 'offset':
          if (typeof v === 'number') v = v + numParam(p, 'offset', 0);
          break;
        case 'drift':
          if (typeof v === 'number') v = v + (numParam(p, 'ratePerHour', 0) * (T - r.sinceMs)) / 3600000;
          break;
        case 'noise':
          if (typeof v === 'number') v = v + rngGaussian(rng) * numParam(p, 'std', 0);
          break;
        case 'spike': {
          if (typeof v === 'number') {
            const dur = numParam(p, 'durationMs', dtMs);
            if (T - r.sinceMs < dur) v = v + numParam(p, 'magnitude', 0);
          }
          break;
        }
        case 'stuck':
          if (typeof p['value'] === typeof v) v = p['value'] as number | boolean;
          break;
        case 'freeze':
          if (r.freezeValue !== undefined && typeof r.freezeValue === typeof v) v = r.freezeValue;
          break;
        case 'invert':
          if (typeof v === 'boolean') v = !v;
          break;
        case 'chatter': {
          if (typeof v === 'boolean') {
            const period = Math.max(1, numParam(p, 'periodMs', 100));
            if (Math.floor((T - r.sinceMs) / period) % 2 === 1) v = !v;
          }
          break;
        }
        case 'outOfRange':
          return { rawOverride: numParam(p, 'raw', 32511) };
        case 'wireBreak':
          if (kind === 'AI') return { rawOverride: this.#wireBreakRaw };
          v = false;
          break;
        case 'lost':
        case 'stuckCmd':
          // Chỉ áp phía cmd (applyCmd); phía emit bỏ qua.
          break;
      }
    }
    return { value: v };
  }

  /**
   * Áp lỗi tín hiệu lên giá trị cmd đọc từ tag (DO/AO): stuckCmd, stuck,
   * freeze, invert (DO), lost (thắng cuối — mất tín hiệu).
   */
  applyCmd(
    equipmentId: string,
    role: string,
    kind: SignalKind,
    value: number | boolean,
  ): number | boolean {
    let v: number | boolean = value;
    let lost = false;
    for (const r of this.#activeSignalFaults(equipmentId, role)) {
      const type = (r.target as Extract<FaultTarget, { signal: string }>).type;
      const p = r.params;
      switch (type) {
        case 'stuckCmd':
          if (typeof p['value'] === typeof v) v = p['value'] as number | boolean;
          break;
        case 'stuck':
          if (typeof p['value'] === typeof v) v = p['value'] as number | boolean;
          break;
        case 'freeze':
          if (r.freezeValue !== undefined && typeof r.freezeValue === typeof v) v = r.freezeValue;
          break;
        case 'invert':
          if (kind === 'DO' && typeof v === 'boolean') v = !v;
          break;
        case 'lost':
          lost = true;
          break;
        default:
          break;
      }
    }
    if (lost) return typeof v === 'boolean' ? false : 0;
    return v;
  }

  snapshot(): FaultManagerSnapshot {
    return {
      version: 1,
      nextSeq: this.#nextSeq,
      records: this.#records.map((r) => {
        const s: FaultRecordSnapshot = {
          id: r.id,
          target: r.target,
          state: r.state,
          activateAtMs: r.activateAtMs,
          sinceMs: r.sinceMs,
          clearedAtMs: r.clearedAtMs ?? null,
          durationMs: r.durationMs ?? null,
          params: { ...r.params },
          delay: r.delayLine !== undefined ? r.delayLine.snapshot() : null,
          freezeValue: r.freezeValue ?? null,
        };
        return s;
      }),
    };
  }

  restore(s: unknown): void {
    if (
      typeof s !== 'object' ||
      s === null ||
      (s as { version?: unknown }).version !== 1 ||
      !Array.isArray((s as { records?: unknown }).records)
    ) {
      throw new Error('FaultManager.restore: snapshot không tương thích (SIM-E003).');
    }
    const snap = s as FaultManagerSnapshot;
    this.#nextSeq = snap.nextSeq;
    this.#records = snap.records.map((rs) => {
      const r: FaultRecord = {
        id: rs.id,
        target: rs.target,
        state: rs.state,
        activateAtMs: rs.activateAtMs,
        sinceMs: rs.sinceMs,
        params: { ...rs.params },
      };
      if (rs.clearedAtMs !== null) r.clearedAtMs = rs.clearedAtMs;
      if (rs.durationMs !== null) r.durationMs = rs.durationMs;
      if (rs.delay !== null) {
        const dl = new DelayLine<number | boolean>(rs.delay.buf.length, rs.delay.buf[0] ?? 0);
        dl.restore(rs.delay);
        r.delayLine = dl;
      }
      if (rs.freezeValue !== null) r.freezeValue = rs.freezeValue;
      return r;
    });
  }
}
