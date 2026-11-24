// Test server + WS /ws — @vcs/server (M0 §8.2; golden S1 §12).
// Client `ws` thật trên port: 0; đồng hồ giả cho Pacer (trừ test drift).

import { appendFile, cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { serverMessageSchema, type ServerMessage } from '@vcs/schemas';
import { createServer, type RunningServer } from './server.js';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const HELLO_TAGS = join(ROOT, 'examples', 'hello-tags');

const servers: RunningServer[] = [];
const clients: TestClient[] = [];

/** Chuyển RawData của `ws` thành string (tránh `data.toString()` trên unknown). */
function rawToString(data: WebSocket.RawData): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return Buffer.concat(data).toString('utf8');
}

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) await s.stop();
});

async function startServer(opts?: { now?: () => number; dir?: string }): Promise<{
  server: RunningServer;
  wsUrl: string;
  httpUrl: string;
}> {
  const server = await createServer(opts?.dir ?? HELLO_TAGS, {
    config: { port: 0 },
    silent: true,
    ...(opts?.now !== undefined ? { now: opts.now } : {}),
  });
  servers.push(server);
  await server.start();
  const url = server.url;
  return { server, wsUrl: url.replace('http://', 'ws://') + 'ws', httpUrl: url };
}

/** Client WS test: parse mọi message bằng serverMessageSchema (sai → lỗi). */
class TestClient {
  readonly ws: WebSocket;
  readonly messages: ServerMessage[] = [];
  readonly invalid: Array<{ raw: string; error: string }> = [];
  closed: { code: number; reason: string } | undefined;
  error: Error | undefined;
  #waiters: Array<{
    pred: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(url: string, opts?: { origin?: string }) {
    this.ws = new WebSocket(url, opts?.origin !== undefined ? { origin: opts.origin } : {});
    clients.push(this);
    this.ws.on('message', (data) => {
      const raw = rawToString(data);
      let msg: ServerMessage;
      try {
        msg = serverMessageSchema.parse(JSON.parse(raw) as unknown);
      } catch (err) {
        this.invalid.push({ raw, error: err instanceof Error ? err.message : String(err) });
        this.#fail(new Error(`server gửi message không hợp lệ: ${raw}`));
        return;
      }
      this.messages.push(msg);
      for (const w of [...this.#waiters]) {
        if (w.pred(msg)) {
          clearTimeout(w.timer);
          this.#waiters.splice(this.#waiters.indexOf(w), 1);
          w.resolve(msg);
        }
      }
    });
    this.ws.on('close', (code, reason) => {
      this.closed = { code, reason: reason.toString() };
      this.#fail(new Error(`đóng kết nối ${String(code)}`));
    });
    this.ws.on('error', (err) => {
      this.error = err;
      this.#fail(err);
    });
  }

  #fail(err: Error): void {
    for (const w of this.#waiters.splice(0)) {
      clearTimeout(w.timer);
      w.reject(err);
    }
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
  }

  send(obj: unknown): void {
    this.ws.send(JSON.stringify(obj));
  }

  sendRaw(text: string): void {
    this.ws.send(text);
  }

  /** Đợi message thỏa pred (kiểm tra cả message đã nhận trước đó). */
  waitFor(
    pred: (m: ServerMessage) => boolean,
    timeoutMs = 5000,
    label = 'message',
  ): Promise<ServerMessage> {
    const found = this.messages.find(pred);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiters.splice(this.#waiters.indexOf(w), 1);
        reject(new Error(`timeout đợi ${label} sau ${String(timeoutMs)} ms; đã nhận: ${JSON.stringify(this.messages)}`));
      }, timeoutMs);
      const w = { pred, resolve, reject, timer };
      this.#waiters.push(w);
    });
  }

  /**
   * Đợi message MỚI thỏa pred (chỉ tính message đến sau lúc gọi — không
   * quét message cũ). Dùng để đồng bộ: nhận được message mới từ server
   * chứng tỏ event loop server đã chạy qua một vòng sau lúc gửi, nên
   * message client đã gửi trước đó chắc chắn đã được xử lý.
   */
  waitForNew(
    pred: (m: ServerMessage) => boolean,
    timeoutMs = 5000,
    label = 'message',
  ): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiters.splice(this.#waiters.indexOf(w), 1);
        reject(new Error(`timeout đợi ${label} (mới) sau ${String(timeoutMs)} ms`));
      }, timeoutMs);
      const w = { pred, resolve, reject, timer };
      this.#waiters.push(w);
    });
  }

  waitForClose(timeoutMs = 5000): Promise<{ code: number; reason: string }> {
    if (this.closed) return Promise.resolve(this.closed);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('timeout đợi đóng kết nối'));
      }, timeoutMs);
      this.ws.once('close', (code, reason) => {
        clearTimeout(timer);
        resolve({ code, reason: reason.toString() });
      });
    });
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // Đã đóng.
    }
  }
}

async function helloClient(
  wsUrl: string,
  opts?: { origin?: string },
): Promise<TestClient> {
  const c = new TestClient(wsUrl, opts);
  await c.open();
  c.send({ type: 'hello', protocolVersion: 1 });
  return c;
}

const EXPECTED_DEFS = [
  { name: 'BTN_START', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1', owner: 'free', writable: true },
  { name: 'SW_AUTO', type: 'Bool', area: 'I', address: '%I0.1', controller: 'PLC1', owner: 'free', writable: true },
  { name: 'PT01', type: 'Int', area: 'I', address: '%IW64', controller: 'PLC1', owner: 'free', writable: true },
  { name: 'LAMP_RUN', type: 'Bool', area: 'Q', address: '%Q0.0', controller: 'PLC1', owner: 'controller', writable: false },
  { name: 'LAMP_AUTO', type: 'Bool', area: 'Q', address: '%Q0.1', controller: 'PLC1', owner: 'controller', writable: false },
  { name: 'LAMP_HEARTBEAT', type: 'Bool', area: 'Q', address: '%Q0.2', controller: 'PLC1', owner: 'controller', writable: false },
  { name: 'SCAN_CNT', type: 'Int', area: 'Q', address: '%QW64', controller: 'PLC1', owner: 'controller', writable: false },
  { name: 'M_FLAG', type: 'Bool', area: 'M', address: '%M0.0', controller: 'PLC1', owner: 'controller', writable: false },
  { name: 'M_CNT', type: 'Int', area: 'M', address: '%MW2', controller: 'PLC1', owner: 'controller', writable: false },
  { name: 'M_ALARM', type: 'Bool', area: 'M', address: '%M0.1', controller: 'PLC1', owner: 'controller', writable: false },
  { name: 'DB1_VAL', type: 'Int', area: 'DB', address: 'DB1.DBW0', controller: 'PLC1', owner: 'controller', writable: false },
  { name: 'DB1_FLAG', type: 'Bool', area: 'DB', address: 'DB1.DBX0.0', controller: 'PLC1', owner: 'controller', writable: false },
] as const;

const INITIAL_VALUES = [false, false, 0, false, false, false, 0, false, 0, false, 0, false];

describe('WS /ws — hello/welcome (OQ-039)', () => {
  it('hello đúng version → welcome (S1 dòng 1)', async () => {
    const { wsUrl } = await startServer();
    const c = new TestClient(wsUrl);
    await c.open();
    c.send({ type: 'hello', protocolVersion: 1 });
    const welcome = await c.waitFor((m) => m.type === 'welcome', 5000, 'welcome');
    expect(welcome).toEqual({
      type: 'welcome',
      protocolVersion: 1,
      project: { name: 'Hello Tags', language: 'vi', stepMs: 10 },
      sim: {
        state: 'IDLE',
        simTimeMs: 0,
        stepCount: 0,
        timeScale: 1,
        lagging: false,
        achievedScale: 0,
      },
    });
    expect(c.invalid).toEqual([]);
  });

  it('version khác → WS-E001 rồi đóng 1008', async () => {
    const { wsUrl } = await startServer();
    const c = new TestClient(wsUrl);
    await c.open();
    c.send({ type: 'hello', protocolVersion: 99 });
    const err = await c.waitFor((m) => m.type === 'error', 5000, 'error WS-E001');
    expect(err).toMatchObject({ type: 'error', code: 'WS-E001' });
    const closed = await c.waitForClose();
    expect(closed.code).toBe(1008);
  });

  it('message trước hello → WS-E003, kết nối còn mở (hello sau vẫn được)', async () => {
    const { wsUrl } = await startServer();
    const c = new TestClient(wsUrl);
    await c.open();
    c.send({ type: 'sim.command', cmd: 'run' });
    const err = await c.waitFor((m) => m.type === 'error', 5000, 'error WS-E003');
    expect(err).toMatchObject({ type: 'error', code: 'WS-E003' });
    expect(c.ws.readyState).toBe(WebSocket.OPEN);
    c.send({ type: 'hello', protocolVersion: 1 });
    await c.waitFor((m) => m.type === 'welcome', 5000, 'welcome');
  });

  it('JSON sai → WS-E003, kết nối còn mở', async () => {
    const { wsUrl } = await startServer();
    const c = await helloClient(wsUrl);
    await c.waitFor((m) => m.type === 'welcome', 5000, 'welcome');
    c.sendRaw('{không phải json');
    const err = await c.waitFor((m) => m.type === 'error', 5000, 'error WS-E003');
    expect(err).toMatchObject({ type: 'error', code: 'WS-E003' });
    expect(c.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('schema sai (sim.command lạ) → WS-E003, kết nối còn mở', async () => {
    const { wsUrl } = await startServer();
    const c = await helloClient(wsUrl);
    await c.waitFor((m) => m.type === 'welcome', 5000, 'welcome');
    c.send({ type: 'sim.command', cmd: 'explode' });
    const err = await c.waitFor((m) => m.type === 'error', 5000, 'error WS-E003');
    expect(err).toMatchObject({ type: 'error', code: 'WS-E003' });
    expect(c.ws.readyState).toBe(WebSocket.OPEN);
  });
});

describe('WS /ws — subscribe/snapshot (OQ-033/049)', () => {
  it("subscribe '*' → snapshot 12 defs đúng thứ tự + giá trị ban đầu (S1 dòng 2)", async () => {
    const { wsUrl } = await startServer();
    const c = await helloClient(wsUrl);
    await c.waitFor((m) => m.type === 'welcome', 5000, 'welcome');
    c.send({ type: 'tags.subscribe', names: '*' });
    const snap = await c.waitFor((m) => m.type === 'tags.snapshot', 5000, 'snapshot');
    expect(snap).toEqual({
      type: 'tags.snapshot',
      simTimeMs: 0,
      defs: EXPECTED_DEFS,
      values: INITIAL_VALUES,
    });
  });

  it('subscribe mảng tên: tên lạ bị bỏ qua, thứ tự theo catalog', async () => {
    const { wsUrl } = await startServer();
    const c = await helloClient(wsUrl);
    await c.waitFor((m) => m.type === 'welcome', 5000, 'welcome');
    c.send({ type: 'tags.subscribe', names: ['SCAN_CNT', 'NOPE', 'BTN_START'] });
    const snap = await c.waitFor((m) => m.type === 'tags.snapshot', 5000, 'snapshot');
    expect(snap).toMatchObject({
      type: 'tags.snapshot',
      defs: [EXPECTED_DEFS[0], EXPECTED_DEFS[6]],
      values: [false, 0],
    });
  });

  it('subscribe [] → snapshot rỗng', async () => {
    const { wsUrl } = await startServer();
    const c = await helloClient(wsUrl);
    await c.waitFor((m) => m.type === 'welcome', 5000, 'welcome');
    c.send({ type: 'tags.subscribe', names: [] });
    const snap = await c.waitFor((m) => m.type === 'tags.snapshot', 5000, 'snapshot');
    expect(snap).toMatchObject({ type: 'tags.snapshot', defs: [], values: [] });
  });
});

describe('WS /ws — golden S1 (§12)', () => {
  it('15 dòng: run/pause/step/reset, delta LWW, lỗi WS-E002/TAG-E002', async () => {
    let nowMs = 0;
    const { wsUrl } = await startServer({ now: () => nowMs });
    const c = await helloClient(wsUrl);
    // Dòng 1: welcome.
    await c.waitFor(
      (m) =>
        m.type === 'welcome' &&
        m.sim.state === 'IDLE' &&
        m.sim.simTimeMs === 0 &&
        m.sim.stepCount === 0,
      5000,
      'welcome',
    );
    // Dòng 2: subscribe → snapshot.
    c.send({ type: 'tags.subscribe', names: '*' });
    await c.waitFor(
      (m) => m.type === 'tags.snapshot' && m.defs.length === 12,
      5000,
      'snapshot 12 defs',
    );
    // Dòng 3: run → state RUNNING 0/0.
    c.send({ type: 'sim.command', cmd: 'run' });
    await c.waitFor(
      (m) => m.type === 'sim.state' && m.state === 'RUNNING' && m.simTimeMs === 0,
      5000,
      'state RUNNING 0',
    );
    // Dòng 4: wall 100 → state 100/10 + delta [[4,true],[6,10]].
    nowMs = 100;
    await c.waitFor(
      (m) =>
        m.type === 'sim.state' &&
        m.simTimeMs === 100 &&
        m.stepCount === 10 &&
        m.achievedScale === 1,
      5000,
      'state 100/10',
    );
    const delta100 = await c.waitFor(
      (m) => m.type === 'tags.delta' && m.simTimeMs === 100,
      5000,
      'delta 100',
    );
    expect(delta100).toEqual({ type: 'tags.delta', simTimeMs: 100, changes: [[4, true], [6, 10]] });
    // Dòng 5: wall 150 → đợi sim đạt 150/15 (lát 5 bước đã chạy, tick
    // đã xả delta [[6,15]]). Gửi tag.write, rồi đợi 1 sim.state MỚI
    // (tick sau lúc gửi) — nhận được nó chứng tỏ event loop server đã
    // xử lý message write, nên write chắc chắn được post trước khi tăng
    // clock; nếu tăng clock ngay trong cùng turn gửi, lát 10 ms tiếp theo
    // (timers thắng poll) có thể chạy 10 bước trước khi write tới nơi.
    nowMs = 150;
    await c.waitFor(
      (m) => m.type === 'sim.state' && m.simTimeMs === 150 && m.stepCount === 15,
      5000,
      'state 150/15',
    );
    c.send({ type: 'tag.write', name: 'BTN_START', value: true });
    await c.waitForNew((m) => m.type === 'sim.state', 5000, 'tick sau write');
    // Dòng 6: wall 200 → state 200/20 + delta [[0,true],[3,true],[6,20]]
    // (S1 plan dòng 6 thiếu [0,true] — tag vừa ghi cũng đổi, flush báo;
    // xem OQ-054; probe tầng service + tính tay đều cho 3 phần tử).
    nowMs = 200;
    await c.waitFor(
      (m) =>
        m.type === 'sim.state' &&
        m.simTimeMs === 200 &&
        m.stepCount === 20 &&
        m.achievedScale === 1,
      5000,
      'state 200/20',
    );
    const delta200 = await c.waitFor(
      (m) => m.type === 'tags.delta' && m.simTimeMs === 200,
      5000,
      'delta 200',
    );
    expect(delta200).toEqual({ type: 'tags.delta', simTimeMs: 200, changes: [[0, true], [3, true], [6, 20]] });
    // Dòng 7: wall 500 → state 500/50 + delta [[6,50]].
    nowMs = 500;
    await c.waitFor(
      (m) => m.type === 'sim.state' && m.simTimeMs === 500 && m.stepCount === 50,
      5000,
      'state 500/50',
    );
    const delta500 = await c.waitFor(
      (m) => m.type === 'tags.delta' && m.simTimeMs === 500,
      5000,
      'delta 500',
    );
    expect(delta500).toEqual({ type: 'tags.delta', simTimeMs: 500, changes: [[6, 50]] });
    // Dòng 8: wall 600 → blink đảo, state 600/60 + delta [[5,true],[6,60]].
    nowMs = 600;
    await c.waitFor(
      (m) => m.type === 'sim.state' && m.simTimeMs === 600 && m.stepCount === 60,
      5000,
      'state 600/60',
    );
    const delta600 = await c.waitFor(
      (m) => m.type === 'tags.delta' && m.simTimeMs === 600,
      5000,
      'delta 600',
    );
    expect(delta600).toEqual({ type: 'tags.delta', simTimeMs: 600, changes: [[5, true], [6, 60]] });
    // Dòng 9: tag.write LAMP_RUN (controller) → TAG-E002.
    c.send({ type: 'tag.write', name: 'LAMP_RUN', value: false });
    const errE002 = await c.waitFor(
      (m) => m.type === 'error' && m.code === 'TAG-E002',
      5000,
      'error TAG-E002',
    );
    expect(errE002).toMatchObject({ type: 'error', code: 'TAG-E002' });
    // Dòng 10: step khi RUNNING → WS-E002.
    c.send({ type: 'sim.command', cmd: 'step', steps: 1 });
    const errWsE002 = await c.waitFor(
      (m) => m.type === 'error' && m.code === 'WS-E002',
      5000,
      'error WS-E002',
    );
    expect(errWsE002).toMatchObject({ type: 'error', code: 'WS-E002' });
    // Dòng 11: wall 700 → pause sau khi slice đã chạy tới 700.
    nowMs = 700;
    await c.waitFor(
      (m) => m.type === 'sim.state' && m.state === 'RUNNING' && m.simTimeMs === 700,
      5000,
      'state RUNNING 700',
    );
    c.send({ type: 'sim.command', cmd: 'pause' });
    await c.waitFor(
      (m) => m.type === 'sim.state' && m.state === 'PAUSED' && m.simTimeMs === 700,
      5000,
      'state PAUSED 700',
    );
    // Dòng 12: step 3 khi PAUSED → delta {730, [[6,73]]}.
    c.send({ type: 'sim.command', cmd: 'step', steps: 3 });
    const delta730 = await c.waitFor(
      (m) => m.type === 'tags.delta' && m.simTimeMs === 730,
      5000,
      'delta 730',
    );
    expect(delta730).toEqual({ type: 'tags.delta', simTimeMs: 730, changes: [[6, 73]] });
    // Dòng 13: reset → snapshot đầy đủ + state IDLE 0.
    c.send({ type: 'sim.command', cmd: 'reset' });
    const snap0 = await c.waitFor(
      (m) => m.type === 'tags.snapshot' && m.simTimeMs === 0 && m.values[6] === 0,
      5000,
      'snapshot sau reset',
    );
    expect(snap0).toEqual({
      type: 'tags.snapshot',
      simTimeMs: 0,
      defs: EXPECTED_DEFS,
      values: INITIAL_VALUES,
    });
    await c.waitFor(
      (m) => m.type === 'sim.state' && m.state === 'IDLE' && m.simTimeMs === 0,
      5000,
      'state IDLE 0',
    );
    // Dòng 14: timeScale 'max' → state IDLE timeScale 'max'.
    nowMs = 900;
    c.send({ type: 'sim.timeScale', value: 'max' });
    await c.waitFor(
      (m) => m.type === 'sim.state' && m.timeScale === 'max',
      5000,
      "state timeScale 'max'",
    );
    // Dòng 15: run với 'max' → stepCount tăng nhanh (ngân sách lát 8 ms).
    c.send({ type: 'sim.command', cmd: 'run' });
    await c.waitFor(
      (m) => m.type === 'sim.state' && m.state === 'RUNNING' && m.stepCount > 100,
      5000,
      'state RUNNING max stepCount > 100',
    );
    c.send({ type: 'sim.command', cmd: 'pause' });
    expect(c.invalid).toEqual([]);
  }, 30000);
});

describe('WS /ws — tag.write và timeScale', () => {
  it('ghi PT01 khi IDLE → delta gửi ở tick kế (applyInbox + flush)', async () => {
    const { wsUrl } = await startServer();
    const c = await helloClient(wsUrl);
    await c.waitFor((m) => m.type === 'welcome', 5000, 'welcome');
    c.send({ type: 'tags.subscribe', names: '*' });
    await c.waitFor((m) => m.type === 'tags.snapshot', 5000, 'snapshot');
    c.send({ type: 'tag.write', name: 'PT01', value: 5 });
    const delta = await c.waitFor(
      (m) => m.type === 'tags.delta' && m.changes.some(([i]) => i === 2),
      5000,
      'delta PT01',
    );
    expect(delta).toMatchObject({ type: 'tags.delta', changes: [[2, 5]] });
  });

  it('ghi tên lạ/M/DB → TAG-E003 (OQ-033: chỉ free tags)', async () => {
    const { wsUrl } = await startServer();
    const c = await helloClient(wsUrl);
    await c.waitFor((m) => m.type === 'welcome', 5000, 'welcome');
    c.send({ type: 'tag.write', name: 'NOPE', value: true });
    const e1 = await c.waitFor(
      (m) => m.type === 'error' && m.code === 'TAG-E003',
      5000,
      'error TAG-E003 NOPE',
    );
    expect(e1).toMatchObject({ type: 'error', code: 'TAG-E003' });
    c.send({ type: 'tag.write', name: 'M_FLAG', value: true });
    const e2 = await c.waitFor(
      (m) => m.type === 'error' && m.code === 'TAG-E003',
      5000,
      'error TAG-E003 M_FLAG',
    );
    expect(e2).toMatchObject({ type: 'error', code: 'TAG-E003' });
  });

  it('timeScale 0/âm → WS-E003, giữ 1; 2.5 và max ok (OQ-041)', async () => {
    const { wsUrl } = await startServer();
    const c = await helloClient(wsUrl);
    await c.waitFor((m) => m.type === 'welcome', 5000, 'welcome');
    c.send({ type: 'sim.timeScale', value: 0 });
    const e = await c.waitFor(
      (m) => m.type === 'error' && m.code === 'WS-E003',
      5000,
      'error WS-E003',
    );
    expect(e).toMatchObject({ type: 'error', code: 'WS-E003' });
    c.send({ type: 'sim.timeScale', value: 2.5 });
    await c.waitFor(
      (m) => m.type === 'sim.state' && m.timeScale === 2.5,
      5000,
      "state timeScale 2.5",
    );
    c.send({ type: 'sim.timeScale', value: 'max' });
    await c.waitFor(
      (m) => m.type === 'sim.state' && m.timeScale === 'max',
      5000,
      "state timeScale 'max'",
    );
  });

  it('run khi đã RUNNING là no-op, không lỗi (OQ-040)', async () => {
    const { wsUrl } = await startServer();
    const c = await helloClient(wsUrl);
    await c.waitFor((m) => m.type === 'welcome', 5000, 'welcome');
    c.send({ type: 'sim.command', cmd: 'run' });
    await c.waitFor(
      (m) => m.type === 'sim.state' && m.state === 'RUNNING',
      5000,
      'state RUNNING',
    );
    const before = c.messages.length;
    c.send({ type: 'sim.command', cmd: 'run' });
    await new Promise((r) => setTimeout(r, 300));
    const errors = c.messages.slice(before).filter((m) => m.type === 'error');
    expect(errors).toEqual([]);
  });

  it('lagging khi fake clock nhảy 2000 ms (OQ-047)', async () => {
    let nowMs = 0;
    const { wsUrl } = await startServer({ now: () => nowMs });
    const c = await helloClient(wsUrl);
    await c.waitFor((m) => m.type === 'welcome', 5000, 'welcome');
    c.send({ type: 'sim.command', cmd: 'run' });
    await c.waitFor(
      (m) => m.type === 'sim.state' && m.state === 'RUNNING',
      5000,
      'state RUNNING',
    );
    nowMs = 2000;
    const lag = await c.waitFor(
      (m) => m.type === 'sim.state' && m.lagging,
      5000,
      'state lagging',
    );
    expect(lag).toMatchObject({ type: 'sim.state', lagging: true, stepCount: 0 });
  });
});

describe('WS /ws — giới hạn (OQ-037/038/036)', () => {
  it('message > 64 KB → đóng 1009', async () => {
    const { wsUrl } = await startServer();
    const c = new TestClient(wsUrl);
    await c.open();
    c.sendRaw('x'.repeat(70_000));
    const closed = await c.waitForClose();
    expect(closed.code).toBe(1009);
  });

  it('message đúng 64 KB không bị đóng (giới hạn là >)', async () => {
    const { wsUrl } = await startServer();
    const c = new TestClient(wsUrl);
    await c.open();
    c.sendRaw('x'.repeat(65_536));
    const err = await c.waitFor((m) => m.type === 'error', 5000, 'error');
    expect(err).toMatchObject({ type: 'error', code: 'WS-E003' });
    expect(c.closed).toBeUndefined();
  });

  it('Origin lạ → 403; Origin localhost → ok', async () => {
    const { wsUrl } = await startServer();
    const evil = new TestClient(wsUrl, { origin: 'http://evil.example' });
    await expect(
      new Promise<void>((resolve, reject) => {
        evil.ws.once('open', () => {
          resolve();
        });
        evil.ws.once('error', reject);
      }),
    ).rejects.toThrow('403');
    const ok = await helloClient(wsUrl, { origin: 'http://localhost:3000' });
    await ok.waitFor((m) => m.type === 'welcome', 5000, 'welcome');
  });

  it('kết nối thứ 9 → đóng 1013 (tối đa 8)', async () => {
    const { wsUrl } = await startServer();
    const opened: TestClient[] = [];
    for (let i = 0; i < 8; i += 1) {
      const c = new TestClient(wsUrl);
      await c.open();
      opened.push(c);
    }
    const ninth = new TestClient(wsUrl);
    const closed = await ninth.waitForClose();
    expect(closed.code).toBe(1013);
    expect(opened.every((c) => c.ws.readyState === WebSocket.OPEN)).toBe(true);
  });
});

describe('REST', () => {
  it('GET /api/health → {ok, version}', async () => {
    const { httpUrl } = await startServer();
    const res = await fetch(`${httpUrl}api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: '0.1.0' });
  });

  it('GET /api/project → shape OQ-042', async () => {
    const { httpUrl } = await startServer();
    const res = await fetch(`${httpUrl}api/project`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      name: 'Hello Tags',
      language: 'vi',
      stepMs: 10,
      controllers: [{ id: 'PLC1', mode: 'builtin', vendor: 'demo', model: 'loopback' }],
      tagCount: 12,
      diagnostics: [],
    });
  });

  it('GET / → 404 JSON khi chưa có web build (OQ-044)', async () => {
    const { httpUrl } = await startServer();
    const res = await fetch(httpUrl);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'web build chưa có (P0.6)' });
  });

  it('diagnostics project (PRJ-W001) gửi một lần sau welcome (OQ-053)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-p05-'));
    await cp(HELLO_TAGS, dir, { recursive: true });
    await appendFile(join(dir, 'vcs.project.yaml'), '\nunknownKey: 1\n');
    const { wsUrl } = await startServer({ dir });
    const c = await helloClient(wsUrl);
    await c.waitFor((m) => m.type === 'welcome', 5000, 'welcome');
    const diag = await c.waitFor((m) => m.type === 'diagnostics', 5000, 'diagnostics');
    expect(diag).toMatchObject({
      type: 'diagnostics',
      items: [{ code: 'PRJ-W001', severity: 'warning' }],
    });
  });
});

describe('drift event loop §12.4', () => {
  it("timeScale max chạy 1 s mỗi pha: p95 MAX ≤ 150 ms (OQ-055)", async () => {
    const { wsUrl } = await startServer();
    const c = await helloClient(wsUrl);
    await c.waitFor((m) => m.type === 'welcome', 5000, 'welcome');
    // Đo trễ callback setInterval 10 ms trong 1 s ở timeScale max. Trên VM
    // chia sẻ, p95 tuyệt đối bị nhiễu tải máy (xem OQ-055) nên gate chỉ
    // assert cap nới lỏng 150 ms — bắt vòng lặp kẹt, không phải kiểm §12.4
    // chặt (50 ms chỉ đo được trên máy yên: p95 6–7 ms).
    const measure = async (): Promise<number[]> => {
      const samples: number[] = [];
      let expected = Date.now() + 10;
      const iv = setInterval(() => {
        const now = Date.now();
        samples.push(now - expected);
        expected = now + 10;
      }, 10);
      await new Promise((r) => setTimeout(r, 1000));
      clearInterval(iv);
      return samples;
    };
    const p95 = (s: number[]): number => {
      const sorted = [...s].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length * 0.95)] as number;
    };
    c.send({ type: 'sim.timeScale', value: 'max' });
    await c.waitFor(
      (m) => m.type === 'sim.state' && m.timeScale === 'max',
      5000,
      "state timeScale 'max'",
    );
    c.send({ type: 'sim.command', cmd: 'run' });
    await c.waitFor(
      (m) => m.type === 'sim.state' && m.state === 'RUNNING',
      5000,
      'state RUNNING',
    );
    const max = await measure();
    c.send({ type: 'sim.command', cmd: 'pause' });
    const stopped = await c.waitFor(
      (m) => m.type === 'sim.state' && m.state === 'PAUSED',
      5000,
      'state PAUSED',
    );
    if (stopped.type !== 'sim.state') throw new Error('mong đợi sim.state');
    expect(stopped.stepCount).toBeGreaterThan(100);
    expect(max.length).toBeGreaterThanOrEqual(20);
    const maxP95 = p95(max);
    expect(maxP95).toBeLessThanOrEqual(150);
  }, 30000);
});
