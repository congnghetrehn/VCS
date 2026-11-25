// Lỗi runtime — @vcs/runtime-iec (M1 §7.2, P1.4).
// `RuntimeFault` KHÔNG nằm trong `DiagnosticCatalog` (lỗi lúc chạy, không
// phải lỗi biên dịch — không thêm mã PRJ/SCL mới, OQ-157). Fault được gom
// theo (code, blockName, src): cùng vị trí → `count++`, giữ `simTimeMs` và
// `message` lần đầu — không bao giờ im lặng.

import type { SrcRef } from './ir.js';

/** Bộ 8 mã fault runtime (OQ-157 — mã mới chỉ thêm khi có quy tắc mới). */
export type RuntimeFaultCode =
  | 'DIV_ZERO'
  | 'CONV_RANGE'
  | 'ARRAY_RANGE'
  | 'CALL_DEPTH'
  | 'LOOP_LIMIT'
  | 'CYCLE_OVERRUN'
  | 'SCAN_OVERRUN'
  | 'SYS_UNSUPPORTED';

export interface RuntimeFault {
  code: RuntimeFaultCode;
  blockName?: string;
  src?: SrcRef;
  /** Thời điểm (sim ms) lần đầu ghi nhận. */
  simTimeMs: number;
  /** Số lần ghi nhận (gom theo code + blockName + src). */
  count: number;
  /** Thông điệp lần đầu (đối tượng + vị trí + nguyên nhân). */
  message: string;
}

/** Gom fault theo (code, blockName, src), giữ thứ tự lần xuất hiện đầu. */
/** Type guard cho một fault trong snapshot (dữ liệu ngoài, validate runtime). */
function isRuntimeFault(v: unknown): v is RuntimeFault {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r['code'] === 'string' &&
    typeof r['simTimeMs'] === 'number' &&
    typeof r['count'] === 'number' &&
    typeof r['message'] === 'string'
  );
}

export class FaultCollector {
  readonly #faults: RuntimeFault[] = [];
  readonly #index = new Map<string, RuntimeFault>();

  record(
    code: RuntimeFaultCode,
    opts: {
      blockName?: string;
      src?: SrcRef;
      simTimeMs: number;
      message: string;
      /** Số lần sự kiện xảy ra trong lần ghi này (mặc định 1). */
      count?: number;
    },
  ): void {
    const key = JSON.stringify([code, opts.blockName ?? null, opts.src ?? null]);
    const count = opts.count ?? 1;
    const existing = this.#index.get(key);
    if (existing !== undefined) {
      existing.count += count;
      return;
    }
    const fault: RuntimeFault = {
      code,
      ...(opts.blockName !== undefined ? { blockName: opts.blockName } : {}),
      ...(opts.src !== undefined ? { src: opts.src } : {}),
      simTimeMs: opts.simTimeMs,
      count,
      message: opts.message,
    };
    this.#faults.push(fault);
    this.#index.set(key, fault);
  }

  /** Fault theo thứ tự lần xuất hiện đầu tiên (bản sao). */
  faults(): RuntimeFault[] {
    return this.#faults.map((f) => ({
      ...f,
      ...(f.src !== undefined ? { src: { ...f.src } } : {}),
    }));
  }

  clear(): void {
    this.#faults.length = 0;
    this.#index.clear();
  }

  /** Snapshot sâu (cho `SoftPlc.snapshot` — sửa bản sao không đổi collector). */
  snapshot(): RuntimeFault[] {
    return this.faults();
  }

  /** Khôi phục từ snapshot (sai hình → throw ồn ào). */
  restore(faults: RuntimeFault[]): void {
    if (!Array.isArray(faults)) {
      throw new RangeError('FaultCollector.restore: snapshot faults phải là mảng');
    }
    const copy: RuntimeFault[] = [];
    const index = new Map<string, RuntimeFault>();
    for (const raw of faults) {
      // Snapshot có thể do caller tự dựng (JSON) nên validate ở runtime;
      // ép về unknown trước để các kiểm tra không bị lint coi là thừa
      // (kiểu khai báo RuntimeFault luôn là object).
      const f: unknown = raw;
      if (!isRuntimeFault(f)) {
        throw new RangeError('FaultCollector.restore: fault trong snapshot sai hình');
      }
      const item: RuntimeFault = {
        code: f.code,
        ...(f.blockName !== undefined ? { blockName: f.blockName } : {}),
        ...(f.src !== undefined ? { src: { ...f.src } } : {}),
        simTimeMs: f.simTimeMs,
        count: f.count,
        message: f.message,
      };
      copy.push(item);
      index.set(
        JSON.stringify([item.code, item.blockName ?? null, item.src ?? null]),
        item,
      );
    }
    this.#faults.length = 0;
    this.#faults.push(...copy);
    this.#index.clear();
    for (const [k, v] of index) this.#index.set(k, v);
  }
}
