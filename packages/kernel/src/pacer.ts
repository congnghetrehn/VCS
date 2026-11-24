// Pacer — @vcs/kernel (M0 §6.4).
// Kiểm soát tốc độ chạy, KHÔNG ảnh hưởng logic mô phỏng. Thuần tính toán từ
// hàm `now()` (wall ms) tiêm vào — không gọi `performance.now` trực tiếp
// (file này vẫn nằm trong allow-list lint của M0 §3.6). Công thức mặc định ở
// OQ-022 (spec chỉ cho interface + vài quy tắc, không cho công thức).

export interface PacerOptions {
  timeScale: number | 'max';
  /** Ngân sách thời gian một lát, ms (mặc định 8); service tự cắt lát. */
  sliceBudgetMs?: number;
  /** Tụt quá ngưỡng này thì đặt lại mốc thay vì "đuổi" vô hạn (mặc định 1000). */
  maxLagMs?: number;
}

export class Pacer {
  readonly #now: () => number;
  #timeScale: number | 'max';
  readonly #sliceBudgetMs: number;
  readonly #maxLagMs: number;
  #running = false;
  #anchorWall = 0;
  #anchorSim = 0;

  constructor(now: () => number, opts: PacerOptions) {
    if (opts.timeScale !== 'max' && !(typeof opts.timeScale === 'number' && opts.timeScale > 0)) {
      throw new RangeError(
        `Pacer: timeScale phải là số > 0 hoặc 'max', nhận ${String(opts.timeScale)}`,
      );
    }
    this.#now = now;
    this.#timeScale = opts.timeScale;
    this.#sliceBudgetMs = opts.sliceBudgetMs ?? 8;
    this.#maxLagMs = opts.maxLagMs ?? 1000;
  }

  /** Ngân sách thời gian một lát (ms) — service dùng để cắt lát. */
  get sliceBudgetMs(): number {
    return this.#sliceBudgetMs;
  }

  get timeScale(): number | 'max' {
    return this.#timeScale;
  }

  setTimeScale(x: number | 'max'): void {
    if (x !== 'max' && !(typeof x === 'number' && x > 0)) {
      throw new RangeError(`Pacer.setTimeScale: phải là số > 0 hoặc 'max', nhận ${String(x)}`);
    }
    this.#timeScale = x;
  }

  /** Bắt đầu/tiếp tục: đặt lại mốc (wall, sim) về hiện tại. */
  start(simNowMs: number): void {
    this.#anchorWall = this.#now();
    this.#anchorSim = simNowMs;
    this.#running = true;
  }

  pause(): void {
    this.#running = false;
  }

  /**
   * Trả số bước cần chạy ngay trong lát này (≥ 0) để bám `timeScale`.
   * Chưa `start()` hoặc đang `pause()` → `{0, false, 0}`.
   * `timeScale = 'max'` → `steps: Infinity` (service tự cắt lát theo
   * `sliceBudgetMs` bằng `setImmediate`). Tụt quá `maxLagMs` → đặt lại mốc,
   * trả `{0, true, achievedScale}`.
   */
  plan(
    simNowMs: number,
    stepMs: number,
  ): { steps: number; lagging: boolean; achievedScale: number } {
    if (!this.#running) return { steps: 0, lagging: false, achievedScale: 0 };
    if (!Number.isInteger(stepMs) || stepMs < 1) {
      throw new RangeError(`Pacer.plan: stepMs phải là số nguyên ≥ 1, nhận ${String(stepMs)}`);
    }
    const now = this.#now();
    const elapsed = Math.max(0, now - this.#anchorWall);
    const achievedScale = elapsed > 0 ? (simNowMs - this.#anchorSim) / elapsed : 0;
    if (this.#timeScale === 'max') {
      return { steps: Number.POSITIVE_INFINITY, lagging: false, achievedScale };
    }
    const target = this.#anchorSim + elapsed * this.#timeScale;
    const due = target - simNowMs;
    if (due > this.#maxLagMs) {
      // Tụt quá ngưỡng: đặt lại mốc thay vì đuổi vô hạn.
      this.#anchorWall = now;
      this.#anchorSim = simNowMs;
      return { steps: 0, lagging: true, achievedScale };
    }
    return { steps: Math.max(0, Math.floor(due / stepMs)), lagging: false, achievedScale };
  }
}
