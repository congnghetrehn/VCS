// SimClock — @vcs/kernel (M0 §6.1).
// Thời gian mô phỏng là số nguyên ms ≥ 0; ManualClock chỉ đổi khi
// advance/reset/restore được gọi — không có đồng hồ thật ở đây.

export interface SimClock {
  /** Thời gian mô phỏng hiện tại (số nguyên ms ≥ 0). */
  nowMs(): number;
  /** Tiến thời gian. `dtMs` phải là số nguyên > 0, ngược lại ném `RangeError`. */
  advance(dtMs: number): void;
  /** Đặt lại thời gian (mặc định 0). */
  reset(startMs?: number): void;
  /** Chụp thời gian hiện tại (số nguyên ms). */
  snapshot(): number;
  /** Khôi phục thời gian đã snapshot. */
  restore(ms: number): void;
}

export class ManualClock implements SimClock {
  #nowMs = 0;

  nowMs(): number {
    return this.#nowMs;
  }

  advance(dtMs: number): void {
    ManualClock.checkMs(dtMs, 'advance(dtMs)');
    if (dtMs <= 0) {
      throw new RangeError(`advance(dtMs): dtMs phải là số nguyên > 0, nhận ${String(dtMs)}`);
    }
    this.#nowMs += dtMs;
  }

  reset(startMs = 0): void {
    ManualClock.checkMs(startMs, 'reset(startMs)');
    this.#nowMs = startMs;
  }

  snapshot(): number {
    return this.#nowMs;
  }

  restore(ms: number): void {
    ManualClock.checkMs(ms, 'restore(ms)');
    this.#nowMs = ms;
  }

  private static checkMs(ms: number, where: string): void {
    if (!Number.isInteger(ms) || ms < 0) {
      throw new RangeError(
        `${where}: thời gian mô phỏng phải là số nguyên ms ≥ 0, nhận ${String(ms)}`,
      );
    }
  }
}
