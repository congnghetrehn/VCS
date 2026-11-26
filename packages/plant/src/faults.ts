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

/**
 * Kết quả `ctx.fault()` (OQ-267).
 * FaultManager trả về CÙNG object cho mỗi (equipment, fault) — cập nhật tại
 * chỗ, không cấp phát mỗi lần gọi. Chỉ đọc: không sửa object trả về, không
 * giữ qua lần gọi sau (giá trị sẽ đổi khi trạng thái lỗi đổi).
 * `params` trả by-reference (model chỉ đọc) thay vì spread mỗi lần gọi.
 */
export interface EquipmentFaultResult {
  active: boolean;
  params: Record<string, unknown>;
  sinceMs: number;
  clearedAtMs?: number;
}

/** Kết quả chia sẻ khi chưa có record nào cho (equipment, fault) — giá trị không đổi theo thời gian. */
const NO_FAULT_RESULT: EquipmentFaultResult = { active: false, params: {}, sinceMs: 0 };

/** Mảng rỗng chia sẻ khi không có lỗi tín hiệu active — chỉ iterate, không mutate. */
const NO_SIGNAL_FAULTS: FaultRecord[] = [];

function isSignalTarget(t: FaultTarget): t is Extract<FaultTarget, { signal: string }> {
  return 'signal' in t;
}

function numParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Trạng thái lỗi thiết bị theo slot (API theo chỉ số, A21): một entry cho
 *  mỗi fault id của model. `record` là record mới nhất (inject sau ghi đè);
 *  `result` tái dùng, cập nhật tại chỗ mỗi lần đọc (như #faultCache). */
interface EquipmentFaultSlot {
  id: string;
  record: FaultRecord | undefined;
  result: EquipmentFaultResult;
}

export class FaultManager {
  #records: FaultRecord[] = [];
  #nextSeq = 1;
  #stepMs: number;
  #wireBreakRaw: number;
  #initialValue: FaultManagerOptions['initialValue'];
  /** Cache kết quả equipmentFault theo `${equipment}:${fault}` (OQ-267). */
  #faultCache = new Map<string, { record: FaultRecord; result: EquipmentFaultResult }>();
  /** Slot tái dùng cho applyEmit (OQ-267) — chỉ dùng ngay trong bước, không giữ qua lần gọi sau. */
  #emitValueSlot: { value: number | boolean } = { value: 0 };
  #emitRawSlot: { rawOverride: number } = { rawOverride: 0 };
  /** Lỗi thiết bị theo slot, đăng ký bởi engine ở init (A21). */
  #equipmentSlots = new Map<string, EquipmentFaultSlot[]>();

  constructor(options: FaultManagerOptions = {}) {
    this.#stepMs = options.stepMs ?? 10;
    this.#wireBreakRaw = options.wireBreakRaw ?? 32767;
    this.#initialValue = options.initialValue;
  }

  /**
   * Đăng ký danh sách fault id của một thiết bị (engine gọi ở init, theo
   * thứ tự `model.faults` — slot = chỉ số trong danh sách). Gọi lại ghi đè
   * đăng ký cũ (engine reset tạo manager mới rồi đăng ký lại).
   */
  registerEquipment(equipmentId: string, faultIds: readonly string[]): void {
    this.#equipmentSlots.set(
      equipmentId,
      faultIds.map((id) => ({
        id,
        record: undefined,
        result: { active: false, params: {}, sinceMs: 0 },
      })),
    );
  }

  /**
   * Trạng thái lỗi thiết bị mới nhất của (equipment, slot) — cùng ngữ nghĩa
   * với `equipmentFault` nhưng không quét records (record mới nhất đã theo
   * dõi ở inject/restore) và không nối chuỗi key (A21). Slot ngoài khoảng
   * hoặc thiết bị chưa đăng ký → throw (lỗi lập trình, fail-fast).
   */
  equipmentFaultBySlot(
    equipmentId: string,
    slot: number | undefined,
    /** Tên model — engine truyền vào để lỗi nêu tên model (FaultManager chỉ biết equipmentId). */
    modelType?: string,
  ): EquipmentFaultResult {
    const slots = this.#equipmentSlots.get(equipmentId);
    const state = slot === undefined ? undefined : slots?.[slot];
    if (state === undefined) {
      throw new Error(
        `FaultManager: slot fault ${String(slot)} không hợp lệ cho thiết bị ${equipmentId}${modelType !== undefined ? ` (model ${modelType})` : ''} (thiết bị chưa đăng ký hoặc model chỉ có ${String(slots?.length ?? 0)} fault).`,
      );
    }
    const r = state.record;
    if (r === undefined) return NO_FAULT_RESULT;
    const out = state.result;
    out.active = r.state === 'active';
    out.params = r.params;
    out.sinceMs = r.sinceMs;
    if (r.clearedAtMs !== undefined) out.clearedAtMs = r.clearedAtMs;
    else delete out.clearedAtMs;
    return out;
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
    // Lỗi thiết bị: record mới nhất cho (equipment, fault) — slot state
    // theo dõi để equipmentFaultBySlot khỏi quét records (A21).
    if (!isSignalTarget(req.target)) {
      const target = req.target;
      const slots = this.#equipmentSlots.get(target.equipment);
      if (slots !== undefined) {
        const st = slots.find((s) => s.id === target.fault);
        if (st !== undefined) {
          st.record = record;
          st.result = { active: false, params: record.params, sinceMs: 0 };
        }
      }
    }
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

  /**
   * Trạng thái lỗi thiết bị mới nhất của (equipment, faultId).
   * OQ-267: trả về CÙNG object cho mỗi cặp (cập nhật tại chỗ) — không cấp
   * phát mỗi lần gọi. Chỉ đọc object trả về (xem EquipmentFaultResult).
   */
  equipmentFault(equipmentId: string, faultId: string): EquipmentFaultResult {
    let latest: FaultRecord | undefined;
    for (let i = this.#records.length - 1; i >= 0; i--) {
      const r = this.#records[i] as FaultRecord;
      if (!isSignalTarget(r.target) && r.target.equipment === equipmentId && r.target.fault === faultId) {
        latest = r;
        break;
      }
    }
    if (latest === undefined) return NO_FAULT_RESULT;
    const key = `${equipmentId}:${faultId}`;
    const entry = this.#faultCache.get(key);
    if (entry !== undefined && entry.record === latest) {
      const out = entry.result;
      out.active = latest.state === 'active';
      out.params = latest.params;
      out.sinceMs = latest.sinceMs;
      if (latest.clearedAtMs !== undefined) out.clearedAtMs = latest.clearedAtMs;
      else delete out.clearedAtMs;
      return out;
    }
    const out: EquipmentFaultResult = {
      active: latest.state === 'active',
      params: latest.params,
      sinceMs: latest.sinceMs,
    };
    if (latest.clearedAtMs !== undefined) out.clearedAtMs = latest.clearedAtMs;
    this.#faultCache.set(key, { record: latest, result: out });
    return out;
  }

  #activeSignalFaults(equipmentId: string, role: string): FaultRecord[] {
    // OQ-267: không có record nào thì không có lỗi active — trả mảng chia sẻ, khỏi filter+sort.
    if (this.#records.length === 0) return NO_SIGNAL_FAULTS;
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
   * OQ-267: trả về slot tái dùng (`#emitValueSlot`/`#emitRawSlot`) — chỉ dùng
   * ngay trong bước, không giữ qua lần gọi sau.
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
          this.#emitRawSlot.rawOverride = numParam(p, 'raw', 32511);
          return this.#emitRawSlot;
        case 'wireBreak':
          if (kind === 'AI') {
            this.#emitRawSlot.rawOverride = this.#wireBreakRaw;
            return this.#emitRawSlot;
          }
          v = false;
          break;
        case 'lost':
        case 'stuckCmd':
          // Chỉ áp phía cmd (applyCmd); phía emit bỏ qua.
          break;
      }
    }
    this.#emitValueSlot.value = v;
    return this.#emitValueSlot;
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
    // Dựng lại slot state từ records đã restore (duyệt theo thứ tự inject —
    // record sau ghi đè record trước nên còn lại record mới nhất, A21).
    for (const slots of this.#equipmentSlots.values()) {
      for (const st of slots) {
        st.record = undefined;
        st.result = { active: false, params: {}, sinceMs: 0 };
      }
    }
    for (const r of this.#records) {
      if (isSignalTarget(r.target)) continue;
      const target = r.target;
      const slots = this.#equipmentSlots.get(target.equipment);
      if (slots === undefined) continue;
      const st = slots.find((s) => s.id === target.fault);
      if (st !== undefined) st.record = r;
    }
  }
}
