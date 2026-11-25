// EventLog của plant — @vcs/plant (M2 §5.3).
// Nhật ký vòng tròn (tối đa 100000 mục): thay đổi observable, bật/tắt lỗi,
// lỗi tín hiệu. Engine ghi; P2.4+ dùng cho trace/report.

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
  #entries: PlantEvent[] = [];

  get length(): number {
    return this.#entries.length;
  }

  push(e: PlantEvent): void {
    if (this.#entries.length >= EVENT_LOG_MAX) this.#entries.shift();
    this.#entries.push(e);
  }

  entries(): PlantEvent[] {
    return [...this.#entries];
  }

  toJSON(): PlantEvent[] {
    return this.entries();
  }

  clear(): void {
    this.#entries.length = 0;
  }
}
