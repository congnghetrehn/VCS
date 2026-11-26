// WS client — @vcs/web (M0 §8.3, §9.2).
// Class mỏng quanh WebSocket: validate zod 2 chiều (clientMessageSchema khi
// gửi, serverMessageSchema khi nhận), tự nối lại với backoff (OQ-059).
// Constructor tiêm factory WebSocket + timer để test được trong node (OQ-068).

import {
  clientMessageSchema,
  PROTOCOL_VERSION,
  serverMessageSchema,
  type ClientMessage,
  type FaultRequest,
  type FaultTiming,
  type ServerMessage,
  type SourceSpec,
  type TagValue,
} from '@vcs/schemas';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

/** Socket tối thiểu mà WsClient cần — WebSocket native thỏa mãn. */
export interface WsSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

/** readyState của WebSocket khi mở (tránh phụ thuộc kiểu DOM ở file này). */
export const WS_OPEN = 1;

export type WsSocketFactory = (url: string) => WsSocketLike;

export interface WsTimer {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export interface WsClientOptions {
  onMessage: (msg: ServerMessage) => void;
  onConnectionChange: (status: ConnectionStatus) => void;
  /** Message từ server sai JSON/schema → bỏ + báo (không crash, không im lặng). */
  onInvalidMessage?: (reason: string) => void;
  /** Ghi đè timer (test); mặc định global setTimeout/clearTimeout. */
  timer?: WsTimer;
}

/** Backoff nối lại (OQ-059): 0.5, 1, 2, 4, 5, 5… s. */
export function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 5000);
}

const DEFAULT_TIMER: WsTimer = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => {
    clearTimeout(id as ReturnType<typeof setTimeout>);
  },
};

export class WsClient {
  readonly #url: string;
  readonly #factory: WsSocketFactory;
  readonly #opts: WsClientOptions;
  readonly #timer: WsTimer;
  #socket: WsSocketLike | null = null;
  #attempt = 0;
  #stopped = false;
  #timerId: unknown = null;
  #status: ConnectionStatus = 'disconnected';

  constructor(url: string, factory: WsSocketFactory, opts: WsClientOptions) {
    this.#url = url;
    this.#factory = factory;
    this.#opts = opts;
    this.#timer = opts.timer ?? DEFAULT_TIMER;
  }

  get status(): ConnectionStatus {
    return this.#status;
  }

  /** Mở kết nối (lần đầu hoặc nối lại sau khi stop() thì không tự nối). */
  connect(): void {
    if (this.#stopped || this.#socket !== null) return;
    this.#setStatus('connecting');
    const socket = this.#factory(this.#url);
    this.#socket = socket;
    socket.onopen = () => {
      this.#attempt = 0;
      this.#setStatus('connected');
      // Gửi lại hello + subscribe sau mỗi lần nối lại (OQ-059).
      this.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION });
      this.send({ type: 'tags.subscribe', names: '*' });
    };
    socket.onmessage = (ev) => {
      this.#handleText(typeof ev.data === 'string' ? ev.data : null);
    };
    socket.onclose = () => {
      this.#socket = null;
      if (this.#stopped) {
        this.#setStatus('disconnected');
        return;
      }
      this.#setStatus('connecting');
      const delay = backoffMs(this.#attempt);
      this.#attempt += 1;
      this.#timerId = this.#timer.setTimeout(() => {
        this.#timerId = null;
        this.connect();
      }, delay);
    };
    socket.onerror = () => {
      // Lỗi transport: onclose sẽ lo nối lại; không làm gì thêm ở đây.
    };
  }

  /** Dừng hẳn: đóng socket, hủy timer nối lại, không nối nữa. */
  stop(): void {
    this.#stopped = true;
    if (this.#timerId !== null) {
      this.#timer.clearTimeout(this.#timerId);
      this.#timerId = null;
    }
    if (this.#socket !== null) {
      const socket = this.#socket;
      this.#socket = null;
      socket.onclose = null;
      socket.close();
    }
    this.#setStatus('disconnected');
  }

  /**
   * Gửi message đã validate; trả false khi message sai schema hoặc socket
   * chưa mở (OQ-059: write lúc mất kết nối thì bỏ, không xếp hàng).
   */
  send(msg: ClientMessage): boolean {
    const parsed = clientMessageSchema.safeParse(msg);
    if (!parsed.success) return false;
    if (this.#socket === null || this.#socket.readyState !== WS_OPEN) return false;
    this.#socket.send(JSON.stringify(parsed.data));
    return true;
  }

  command(cmd: 'run' | 'pause' | 'step' | 'reset', steps?: number): boolean {
    if (steps === undefined) return this.send({ type: 'sim.command', cmd });
    return this.send({ type: 'sim.command', cmd, steps });
  }

  timeScale(value: number | 'max'): boolean {
    return this.send({ type: 'sim.timeScale', value });
  }

  writeTag(name: string, value: TagValue): boolean {
    return this.send({ type: 'tag.write', name, value });
  }

  /** P1.7 — PLC Watch (OQ-206/216). */
  plcWatch(refs: string[]): boolean {
    return this.send({ type: 'plc.watch', refs });
  }

  plcUnwatch(): boolean {
    return this.send({ type: 'plc.unwatch' });
  }

  plcWrite(ref: string, value: TagValue): boolean {
    return this.send({ type: 'plc.write', ref, value });
  }

  plcForce(ref: string, value: TagValue): boolean {
    return this.send({ type: 'plc.force', ref, value });
  }

  plcUnforce(ref: string): boolean {
    return this.send({ type: 'plc.unforce', ref });
  }

  /** P2.4 (OQ-318) — chèn lỗi plant (validate faultRequestSchema ở server). */
  plantFaultInject(request: FaultRequest): boolean {
    return this.send({ type: 'plant.fault.inject', request });
  }

  /** P2.4 (OQ-318) — clear tay lỗi plant (id record). */
  plantFaultClear(id: string): boolean {
    return this.send({ type: 'plant.fault.clear', id });
  }

  /** P2.4 (OQ-318, tier B) — áp preset lỗi của model (vd noRunFeedback). */
  plantFaultPreset(equipment: string, preset: string, when?: FaultTiming): boolean {
    if (when === undefined) {
      return this.send({ type: 'plant.fault.preset', equipment, preset });
    }
    return this.send({ type: 'plant.fault.preset', equipment, preset, when });
  }

  /** P2.8 (OQ-388) — đặt giá trị manual cho source chính của thiết bị
   *  (clientMessageSchema chặn value string — chỉ number | boolean). */
  plantManualSet(equipment: string, value: number | boolean): boolean {
    return this.send({ type: 'plant.manual.set', equipment, value });
  }

  /** P2.8 (OQ-388) — đổi spec source chính của thiết bị (const/ramp/...). */
  plantSourceSet(equipment: string, source: SourceSpec): boolean {
    return this.send({ type: 'plant.source.set', equipment, source });
  }

  #handleText(text: string | null): void {
    if (text === null) {
      this.#opts.onInvalidMessage?.('WS: message không phải text');
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      this.#opts.onInvalidMessage?.('WS: message không phải JSON');
      return;
    }
    const parsed = serverMessageSchema.safeParse(json);
    if (!parsed.success) {
      this.#opts.onInvalidMessage?.('WS: message sai schema — đã bỏ qua');
      return;
    }
    this.#opts.onMessage(parsed.data);
  }

  #setStatus(status: ConnectionStatus): void {
    if (this.#status === status) return;
    this.#status = status;
    this.#opts.onConnectionChange(status);
  }
}
