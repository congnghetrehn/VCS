// EventLog của plant — @vcs/plant (M2 §5.3).
// Nhật ký vòng tròn (tối đa 100000 mục): thay đổi observable, bật/tắt lỗi,
// lỗi tín hiệu. Engine ghi; P2.4+ dùng cho trace/report.
//
// OQ-304 (P2.3 commit 10, đo bằng cpu-prof ở bench plant): bản cũ dùng
// `shift()` trên mảng khi đầy — O(n) mỗi push, chiếm 74,7% CPU ở 500 thiết
// bị (log đầy sau ~400 bước, mỗi bước ~250 push). Bản này là ring buffer:
// push O(1), không cấp phát sau khi đầy.

export type PlantEventType = 'state' | 'fault' | 'signal' | 'warn' | 'info';

export interface PlantEvent {
  t: number;
  type: PlantEventType;
  equipment?: string;
  key?: string;
  from?: unknown;
  to?: unknown;
  msg?: string;
  data?: Record<string, unknown>;
}

export const EVENT_LOG_MAX = 100000;

export class EventLog {
  #buf: PlantEvent[] = [];
  /** Chỉ số của mục cũ nhất khi buffer đã đầy. */
  #head = 0;
  /** Số mục đang giữ (≤ EVENT_LOG_MAX). */
  #count = 0;

  get length(): number {
    return this.#count;
  }

  push(e: PlantEvent): void {
    if (this.#count < EVENT_LOG_MAX) {
      this.#buf.push(e);
      this.#count++;
    } else {
      // Đầy: ghi đè mục cũ nhất, không cấp phát, không dời mảng.
      this.#buf[this.#head] = e;
      this.#head = (this.#head + 1) % EVENT_LOG_MAX;
    }
  }

  entries(): PlantEvent[] {
    if (this.#count < EVENT_LOG_MAX) return [...this.#buf];
    return [...this.#buf.slice(this.#head), ...this.#buf.slice(0, this.#head)];
  }

  toJSON(): PlantEvent[] {
    return this.entries();
  }

  clear(): void {
    this.#buf.length = 0;
    this.#head = 0;
    this.#count = 0;
  }
}
