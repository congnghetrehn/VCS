// WebSocket /ws — @vcs/server (M0 §8.2, §9.2).
// Mỗi kết nối có danh sách subscribe riêng; một subscriber '*' của TagDB
// (trong SimulationService) gom thay đổi vào bộ đệm last-write-wins, hub
// phát tags.delta theo nhịp VCS_UI_RATE_HZ (một setInterval duy nhất).
// Giới hạn: message ≤ 64 KB (đóng 1009), kiểm Origin (403), tối đa 8 kết
// nối (kết nối thừa đóng 1013). Sai schema/trước hello → WS-E003 và giữ
// kết nối; version khác → WS-E001 rồi đóng 1008 (OQ-039).

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import {
  clientMessageSchema,
  PROTOCOL_VERSION,
  type ClientMessage,
  type Diagnostic,
  type ServerMessage,
  type SimState,
  type TagValue,
} from '@vcs/schemas';
import type { SimulationService, TagsSnapshot } from './sim-service.js';

/** readyState của ws.WebSocket khi mở (tránh import runtime gói `ws`). */
const WS_OPEN = 1;

interface Connection {
  socket: WebSocket;
  greeted: boolean;
  /** Chỉ số defs đã subscribe (vị trí trong snapshot defs của kết nối). */
  sub: { defs: number[]; localIndex: Map<number, number> } | null;
}

export interface WsHubOptions {
  /** Nhịp tick, ms (1000 / uiRateHz). */
  tickMs: number;
  maxConnections: number;
  /**
   * Giới hạn giao thức cho một message, byte (OQ-037: 64 KB). WsHub kiểm tra
   * trong #onMessage và đóng bằng close(1009) tường minh — xem OQ-056.
   */
  maxMessageBytes: number;
}

export class WsHub {
  readonly #fastify: FastifyInstance;
  readonly #service: SimulationService;
  readonly #tickMs: number;
  readonly #maxConnections: number;
  readonly #maxMessageBytes: number;
  readonly #connections = new Set<Connection>();
  #interval: ReturnType<typeof setInterval> | undefined;
  #lastBroadcastState: string | undefined;

  constructor(fastify: FastifyInstance, service: SimulationService, opts: WsHubOptions) {
    this.#fastify = fastify;
    this.#service = service;
    this.#tickMs = opts.tickMs;
    this.#maxConnections = opts.maxConnections;
    this.#maxMessageBytes = opts.maxMessageBytes;
  }

  get connectionCount(): number {
    return this.#connections.size;
  }

  registerRoutes(): void {
    this.#fastify.get('/ws', { websocket: true }, (socket) => {
      if (this.#connections.size >= this.#maxConnections) {
        // OQ-038: quá giới hạn → đóng ngay với 1013, không xếp hàng.
        this.#fastify.log.warn('ws: vượt tối đa kết nối đồng thời — đóng 1013');
        socket.close(1013, 'too many connections');
        return;
      }
      const conn: Connection = { socket, greeted: false, sub: null };
      this.#connections.add(conn);
      this.#fastify.log.info('ws: kết nối mới');
      socket.on('message', (data) => {
        this.#onMessage(conn, data);
      });
      socket.on('close', () => {
        this.#connections.delete(conn);
        this.#fastify.log.info('ws: kết nối đóng');
      });
      socket.on('error', (err) => {
        this.#fastify.log.warn({ err }, 'ws: lỗi kết nối');
      });
    });
  }

  /** Bắt đầu tick 10 Hz (gọi ở start); dừng ở stop. */
  start(): void {
    if (this.#interval !== undefined) return;
    this.#interval = setInterval(() => {
      this.tick();
    }, this.#tickMs);
  }

  stop(): void {
    if (this.#interval !== undefined) {
      clearInterval(this.#interval);
      this.#interval = undefined;
    }
    for (const conn of [...this.#connections]) {
      try {
        conn.socket.close(1001, 'server stopping');
      } catch {
        // socket đã đóng — bỏ qua.
      }
    }
    this.#connections.clear();
  }

  /** Một tick: sim.state (khi RUNNING hoặc khi đổi) + tags.delta (nếu có). */
  tick(): void {
    const state = this.#service.simState();
    const stateJson = JSON.stringify(state);
    if (state.state === 'RUNNING' || stateJson !== this.#lastBroadcastState) {
      this.#broadcastState(state);
      this.#lastBroadcastState = stateJson;
    }
    const changes = this.#service.drainDelta();
    if (changes.length === 0) return;
    const simTimeMs = this.#service.simTimeMs;
    for (const conn of this.#connections) {
      if (conn.sub === null) continue;
      const local: Array<[number, TagValue]> = [];
      for (const [g, v] of changes) {
        const l = conn.sub.localIndex.get(g);
        if (l !== undefined) local.push([l, v]);
      }
      if (local.length === 0) continue;
      this.#send(conn, { type: 'tags.delta', simTimeMs, changes: local });
    }
  }

  /** Gửi sim.state hiện tại tới mọi kết nối đã hello (khi service đổi). */
  broadcastStateNow(): void {
    const state = this.#service.simState();
    this.#broadcastState(state);
    this.#lastBroadcastState = JSON.stringify(state);
  }

  /** Gửi snapshot + sim.state tới mọi kết nối đã subscribe (sau reset). */
  broadcastSnapshotNow(): void {
    const snap = this.#service.snapshot();
    for (const conn of this.#connections) {
      if (conn.sub === null) continue;
      this.#sendSnapshot(conn, snap);
    }
    this.broadcastStateNow();
  }

  /** Gửi diagnostics tới mọi kết nối đã hello (khi phát sinh, OQ-053). */
  broadcastDiagnostics(d: Diagnostic): void {
    this.#broadcast({ type: 'diagnostics', items: [d] });
  }

  #broadcastState(state: SimState): void {
    this.#broadcast({ type: 'sim.state', ...state });
  }

  #broadcast(msg: ServerMessage): void {
    for (const conn of this.#connections) {
      if (conn.greeted) this.#send(conn, msg);
    }
  }

  #send(conn: Connection, msg: ServerMessage): void {
    if (conn.socket.readyState !== WS_OPEN) return;
    conn.socket.send(JSON.stringify(msg));
  }

  #sendError(conn: Connection, code: string, message: string): void {
    this.#send(conn, { type: 'error', code, message });
  }

  #sendSnapshot(conn: Connection, snap: TagsSnapshot): void {
    if (conn.sub === null) return;
    const defs = conn.sub.defs.map((i) => snap.defs[i] as TagsSnapshot['defs'][number]);
    const values = conn.sub.defs.map((i) => snap.values[i] as TagValue);
    this.#send(conn, { type: 'tags.snapshot', defs, values, simTimeMs: snap.simTimeMs });
  }

  #onMessage(conn: Connection, data: unknown): void {
    const size = rawByteLength(data);
    if (size !== undefined && size > this.#maxMessageBytes) {
      // OQ-056: đóng 1009 bằng close() tường minh. Không dựa vào maxPayload
      // của ws: khi receiver của ws lỗi quá tải, close() gọi socket.end()
      // ngay (receiver đã lỗi — ws websocket.js, close() kiểm tra
      // receiver.errorEmitted), frame 1009 đua với teardown và client
      // Windows thấy 1006. Đóng tường minh ở đây thì receiver còn tốt nên
      // close() đợi peer trả frame đóng — 1009 tới nơi chắc chắn.
      this.#fastify.log.warn({ size }, 'ws: message vượt giới hạn — đóng 1009');
      conn.socket.close(1009, 'message too big');
      return;
    }
    const text = rawToString(data);
    if (text === undefined) {
      this.#sendError(conn, 'WS-E003', 'thông điệp không phải văn bản UTF-8');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      this.#sendError(conn, 'WS-E003', 'thông điệp không phải JSON hợp lệ');
      return;
    }
    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      this.#sendError(conn, 'WS-E003', 'thông điệp không đúng schema giao thức (M0 §9.2)');
      return;
    }
    const msg = result.data;
    if (msg.type === 'hello') {
      this.#onHello(conn, msg);
      return;
    }
    if (!conn.greeted) {
      // OQ-039: gửi trước hello → WS-E003, giữ kết nối.
      this.#sendError(conn, 'WS-E003', 'gửi hello trước khi gửi lệnh khác');
      return;
    }
    switch (msg.type) {
      case 'sim.command':
        this.#onSimCommand(conn, msg);
        break;
      case 'sim.timeScale':
        this.#onTimeScale(conn, msg);
        break;
      case 'tags.subscribe':
        this.#onSubscribe(conn, msg);
        break;
      case 'tags.unsubscribe':
        conn.sub = null;
        break;
      case 'tag.write':
        this.#onTagWrite(conn, msg);
        break;
    }
  }

  #onHello(conn: Connection, msg: Extract<ClientMessage, { type: 'hello' }>): void {
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      // OQ-039: version khác → WS-E001 rồi đóng 1008.
      this.#sendError(
        conn,
        'WS-E001',
        `phiên bản giao thức không khớp (client ${String(msg.protocolVersion)}, server ${String(PROTOCOL_VERSION)})`,
      );
      conn.socket.close(1008, 'protocol version mismatch');
      return;
    }
    conn.greeted = true;
    const project = this.#service.snapshotProject();
    this.#send(conn, {
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      project,
      sim: this.#service.simState(),
    });
    // OQ-053: diagnostics của project (nếu có) gửi ngay sau welcome.
    const items = this.#service.projectDiagnostics;
    if (items.length > 0) {
      this.#send(conn, { type: 'diagnostics', items: [...items] });
    }
  }

  #onSimCommand(conn: Connection, msg: Extract<ClientMessage, { type: 'sim.command' }>): void {
    const service = this.#service;
    switch (msg.cmd) {
      case 'run':
        service.enqueueCommand(() => {
          service.run();
        });
        break;
      case 'pause':
        service.enqueueCommand(() => {
          service.pause();
        });
        break;
      case 'step': {
        if (service.state === 'RUNNING') {
          this.#sendError(
            conn,
            'WS-E002',
            'step bị bỏ qua khi đang RUNNING — pause trước khi step, hoặc dùng run.',
          );
          return;
        }
        const r = service.step(msg.steps ?? 1);
        if (!r.ok) {
          this.#sendError(conn, r.code ?? 'SIM-E001', r.message ?? 'step lỗi');
        }
        break;
      }
      case 'reset':
        service.enqueueCommand(() => {
          service.reset();
        });
        break;
    }
  }

  #onTimeScale(conn: Connection, msg: Extract<ClientMessage, { type: 'sim.timeScale' }>): void {
    const r = this.#service.setTimeScale(msg.value);
    if (!r.ok) {
      // OQ-041: timeScale sai → WS-E003, giữ nguyên giá trị cũ.
      this.#sendError(conn, r.code ?? 'WS-E003', r.message ?? 'timeScale không hợp lệ');
    }
  }

  #onSubscribe(conn: Connection, msg: Extract<ClientMessage, { type: 'tags.subscribe' }>): void {
    const defs = this.#service.subscribeDefs(msg.names);
    const localIndex = new Map<number, number>();
    defs.forEach((g, l) => {
      localIndex.set(g, l);
    });
    conn.sub = { defs, localIndex };
    this.#sendSnapshot(conn, this.#service.snapshot());
  }

  #onTagWrite(conn: Connection, msg: Extract<ClientMessage, { type: 'tag.write' }>): void {
    const r = this.#service.tagWrite(msg.name, msg.value);
    if (!r.ok) {
      this.#sendError(conn, r.code ?? 'TAG-E003', r.message ?? 'tag.write lỗi');
    }
  }
}

function rawToString(data: unknown): string | undefined {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (Array.isArray(data) && data.every((b) => Buffer.isBuffer(b))) {
    return Buffer.concat(data).toString('utf8');
  }
  return undefined;
}

/** Số byte của RawData (undefined nếu không nhận dạng được — để rawToString xử lý). */
function rawByteLength(data: unknown): number | undefined {
  if (typeof data === 'string') return Buffer.byteLength(data, 'utf8');
  if (Buffer.isBuffer(data)) return data.length;
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (Array.isArray(data) && data.every((b) => Buffer.isBuffer(b))) {
    return data.reduce((n, b) => n + b.length, 0);
  }
  return undefined;
}
