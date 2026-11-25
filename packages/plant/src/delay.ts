// Trễ và bộ lọc tín hiệu — @vcs/plant (M2 §4.2, §6.2).
// Toàn bộ hàm thuần hoặc có trạng thái tường minh (snapshot được), không
// dùng thời gian thật; dtMs luôn lấy từ bước mô phỏng.

/** Hàng đợi trễ n bước (ring buffer): output = input của n bước trước. */
export class DelayLine<T> {
  readonly n: number;
  #buf: (T | undefined)[];
  #idx = 0;

  constructor(n: number, initial: T) {
    this.n = n;
    this.#buf = new Array<T | undefined>(n).fill(initial);
  }

  /** Đẩy `v` vào, trả ra giá trị đã trễ. */
  push(v: T): T {
    if (this.n === 0) return v;
    const out = this.#buf[this.#idx] as T;
    this.#buf[this.#idx] = v;
    this.#idx = (this.#idx + 1) % this.n;
    return out;
  }

  snapshot(): { buf: (T | undefined)[]; idx: number } {
    return { buf: [...this.#buf], idx: this.#idx };
  }

  restore(s: { buf: (T | undefined)[]; idx: number }): void {
    this.#buf = [...s.buf];
    this.#idx = s.idx;
  }
}

/**
 * Lọc trễ bậc một (lag): y += (target − y)·(1 − e^(−dt/τ)).
 * τ ≤ 0 nghĩa là bám ngay (y = target).
 */
export function lagStep(y: number, target: number, dtMs: number, tauMs: number): number {
  if (tauMs <= 0) return target;
  return y + (target - y) * (1 - Math.exp(-dtMs / tauMs));
}

/**
 * Giới hạn tốc độ thay đổi: |Δy| ≤ tốc độ·dt (up khi tăng, down khi giảm).
 * Tốc độ ≤ 0 ở một chiều nghĩa là chiều đó không giới hạn.
 */
export function rateLimitStep(
  y: number,
  target: number,
  dtMs: number,
  upPerMs: number,
  downPerMs: number,
): number {
  const d = target - y;
  if (d > 0 && upPerMs > 0) return y + Math.min(d, upPerMs * dtMs);
  if (d < 0 && downPerMs > 0) return y - Math.min(-d, downPerMs * dtMs);
  return target;
}

/**
 * Hysteresis hai ngưỡng: bật khi x ≥ onAt, tắt khi x ≤ offAt, giữa hai
 * ngưỡng giữ nguyên trạng thái. Yêu cầu onAt > offAt.
 */
export function hysteresisStep(current: boolean, x: number, onAt: number, offAt: number): boolean {
  if (!current && x >= onAt) return true;
  if (current && x <= offAt) return false;
  return current;
}

/** Trạng thái của bộ hẹn giờ on/off-delay (thời gian đã tích lũy). */
export interface DelayTimerState {
  elapsedMs: number;
}

/**
 * On-delay: output true chỉ khi input đã true liên tục đủ `delayMs`.
 * delayMs ≤ 0 nghĩa là bám input ngay.
 */
export function onDelayStep(s: DelayTimerState, input: boolean, dtMs: number, delayMs: number): boolean {
  if (delayMs <= 0) return input;
  if (input) {
    s.elapsedMs += dtMs;
    return s.elapsedMs >= delayMs;
  }
  s.elapsedMs = 0;
  return false;
}

/**
 * Off-delay: output vẫn true trong `delayMs` sau khi input đã false.
 * delayMs ≤ 0 nghĩa là bám input ngay.
 */
export function offDelayStep(s: DelayTimerState, input: boolean, dtMs: number, delayMs: number): boolean {
  if (delayMs <= 0) return input;
  if (input) {
    s.elapsedMs = 0;
    return true;
  }
  s.elapsedMs += dtMs;
  return s.elapsedMs < delayMs;
}
