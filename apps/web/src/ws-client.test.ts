// Test WsClient — backoff, nối lại gửi lại hello + subscribe, message sai
// schema từ server bị bỏ (plan STATE §13, OQ-059, OQ-068).
import { describe, expect, it } from 'vitest';
import {
  backoffMs,
  WsClient,
  WS_OPEN,
  type WsSocketLike,
  type WsTimer,
} from './ws-client.js';

class FakeWebSocket implements WsSocketLike {
  readonly readyState: number = WS_OPEN;
  sent: string[] = [];
  closed = false;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  /** Giả lập server mở kết nối. */
  open(): void {
    this.onopen?.({});
  }

  /** Giả lập server gửi text. */
  receive(text: string): void {
    this.onmessage?.({ data: text });
  }

  /** Giả lập server đóng kết nối. */
  closeFromServer(): void {
    this.onclose?.({});
  }
}

class FakeTimer implements WsTimer {
  /** [id, fn, ms] đang chờ. */
  pending: Array<{ id: number; fn: () => void; ms: number }> = [];
  #nextId = 1;

  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.#nextId;
    this.#nextId += 1;
    this.pending.push({ id, fn, ms });
    return id;
  }

  clearTimeout(id: unknown): void {
    this.pending = this.pending.filter((p) => p.id !== id);
  }

  /** Chạy timer đang chờ đầu tiên (FIFO). */
  fireNext(): void {
    const next = this.pending.shift();
    next?.fn();
  }
}

describe('backoffMs', () => {
  it('0.5, 1, 2, 4, 5, 5… s (chặn trên 5 s)', () => {
    expect([0, 1, 2, 3, 4, 5, 10].map((a) => backoffMs(a))).toEqual([
      500, 1000, 2000, 4000, 5000, 5000, 5000,
    ]);
  });
});

describe('WsClient', () => {
  it('nối lại gửi lại hello + subscribe, backoff tăng dần', () => {
    const sockets: FakeWebSocket[] = [];
    const timer = new FakeTimer();
    const statuses: string[] = [];
    const client = new WsClient('ws://x/ws', () => {
      const s = new FakeWebSocket();
      sockets.push(s);
      return s;
    }, {
      onMessage: () => {},
      onConnectionChange: (s) => {
        statuses.push(s);
      },
      timer,
    });
    client.connect();
    expect(sockets).toHaveLength(1);
    sockets[0]?.open();
    expect(JSON.parse(sockets[0]?.sent[0] ?? '')).toEqual({
      type: 'hello',
      protocolVersion: 1,
    });
    expect(JSON.parse(sockets[0]?.sent[1] ?? '')).toEqual({
      type: 'tags.subscribe',
      names: '*',
    });
    // Mất kết nối → hẹn nối lại sau 500 ms.
    sockets[0]?.closeFromServer();
    expect(timer.pending).toHaveLength(1);
    expect(timer.pending[0]?.ms).toBe(500);
    timer.fireNext();
    expect(sockets).toHaveLength(2);
    sockets[1]?.open();
    expect(JSON.parse(sockets[1]?.sent[0] ?? '')).toEqual({
      type: 'hello',
      protocolVersion: 1,
    });
    expect(JSON.parse(sockets[1]?.sent[1] ?? '')).toEqual({
      type: 'tags.subscribe',
      names: '*',
    });
    // Mất lần 2 → backoff lại 500 ms vì attempt đã reset về 0 khi mở lại.
    sockets[1]?.closeFromServer();
    expect(timer.pending[0]?.ms).toBe(500);
    client.stop();
    expect(statuses.at(-1)).toBe('disconnected');
  });

  it('message sai schema từ server bị bỏ, message đúng được chuyển', () => {
    const sockets: FakeWebSocket[] = [];
    const received: unknown[] = [];
    const invalid: string[] = [];
    const client = new WsClient('ws://x/ws', () => {
      const s = new FakeWebSocket();
      sockets.push(s);
      return s;
    }, {
      onMessage: (m) => {
        received.push(m);
      },
      onConnectionChange: () => {},
      onInvalidMessage: (r) => {
        invalid.push(r);
      },
    });
    client.connect();
    const socket = sockets[0];
    socket?.open();
    socket?.receive('khong-phai-json');
    socket?.receive(JSON.stringify({ type: 'la-gi-do', x: 1 }));
    socket?.receive(JSON.stringify({
      type: 'sim.state',
      state: 'IDLE',
      simTimeMs: 0,
      stepCount: 0,
      timeScale: 1,
      lagging: false,
      achievedScale: 1,
    }));
    expect(received).toHaveLength(1);
    expect(invalid).toHaveLength(2);
    client.stop();
  });

  it('send khi chưa mở → false, không xếp hàng (OQ-059)', () => {
    const sockets: FakeWebSocket[] = [];
    const client = new WsClient('ws://x/ws', () => {
      const s = new FakeWebSocket();
      sockets.push(s);
      return s;
    }, {
      onMessage: () => {},
      onConnectionChange: () => {},
    });
    // Chưa connect(): không có socket → send bỏ.
    expect(client.writeTag('BTN_START', true)).toBe(false);
    client.connect();
    sockets[0]?.open();
    expect(client.writeTag('BTN_START', true)).toBe(true);
    expect(sockets[0]?.sent.at(-1)).toBe(
      JSON.stringify({ type: 'tag.write', name: 'BTN_START', value: true }),
    );
    client.stop();
  });
});
