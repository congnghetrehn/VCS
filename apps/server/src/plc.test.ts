// Test WS plc.* + REST /api/plc/* — @vcs/server (P1.7, OQ-206/207/208/216).
// Client `ws` thật trên port: 0, project demo examples/motor-interlock
// (sim DỪNG — ghi PLC qua introspection không cần scan chạy).

import { cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { serverMessageSchema, type ServerMessage } from '@vcs/schemas';
import { createServer, type RunningServer } from './server.js';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const MOTOR = join(ROOT, 'examples', 'motor-interlock');
const HELLO_TAGS = join(ROOT, 'examples', 'hello-tags');

const servers: RunningServer[] = [];
const clients: TestClient[] = [];

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

async function startServer(dir: string): Promise<{ server: RunningServer; wsUrl: string; httpUrl: string }> {
  const server = await createServer(dir, { config: { port: 0 }, silent: true });
  servers.push(server);
  await server.start();
  const url = server.url;
  return { server, wsUrl: url.replace('http://', 'ws://') + 'ws', httpUrl: url };
}

/** Client WS tối thiểu cho plc.*: parse mọi message bằng schema. */
class TestClient {
  readonly ws: WebSocket;
  readonly messages: ServerMessage[] = [];
  #waiters: Array<{
    pred: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    clients.push(this);
    this.ws.on('message', (data) => {
      const msg = serverMessageSchema.parse(JSON.parse(rawToString(data)) as unknown);
      this.messages.push(msg);
      for (const w of [...this.#waiters]) {
        if (w.pred(msg)) {
          clearTimeout(w.timer);
          this.#waiters.splice(this.#waiters.indexOf(w), 1);
          w.resolve(msg);
        }
      }
    });
    this.ws.on('close', () => {
      for (const w of this.#waiters.splice(0)) {
        clearTimeout(w.timer);
        w.reject(new Error('đóng kết nối'));
      }
    });
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
  }

  close(): void {
    this.ws.close();
  }

  send(obj: unknown): void {
    this.ws.send(JSON.stringify(obj));
  }

  async hello(): Promise<Extract<ServerMessage, { type: 'welcome' }>> {
    const p = this.waitFor((m): m is Extract<ServerMessage, { type: 'welcome' }> => m.type === 'welcome');
    this.send({ type: 'hello', protocolVersion: 1 });
    return p;
  }

  waitFor<T extends ServerMessage>(
    pred: (m: ServerMessage) => m is T,
    timeoutMs = 3000,
  ): Promise<T> {
    const found = this.messages.find(pred);
    if (found !== undefined) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.#waiters.findIndex((w) => w.resolve === resolve);
        if (i >= 0) this.#waiters.splice(i, 1);
        reject(new Error('hết thời gian chờ message'));
      }, timeoutMs);
      this.#waiters.push({
        pred: (m: ServerMessage): boolean => pred(m),
        resolve: (m: ServerMessage) => {
          resolve(m as T);
        },
        reject,
        timer,
      });
    });
  }

  /** Đợi message khớp pred xuất hiện SAU thời điểm gọi (bỏ qua message cũ). */
  waitForNext<T extends ServerMessage>(
    pred: (m: ServerMessage) => m is T,
    timeoutMs = 3000,
  ): Promise<T> {
    const seen = this.messages.length;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.#waiters.findIndex((w) => w.resolve === resolve);
        if (i >= 0) this.#waiters.splice(i, 1);
        reject(new Error('hết thời gian chờ message'));
      }, timeoutMs);
      this.#waiters.push({
        pred: (m: ServerMessage): boolean => pred(m) && this.messages.indexOf(m) >= seen,
        resolve: (m: ServerMessage) => {
          resolve(m as T);
        },
        reject,
        timer,
      });
    });
  }

  /** Không có message khớp pred trong timeoutMs (LWW / unwatch). */
  async expectNo(pred: (m: ServerMessage) => boolean, timeoutMs = 400): Promise<void> {
    const before = this.messages.filter(pred).length;
    await new Promise((r) => setTimeout(r, timeoutMs));
    expect(this.messages.filter(pred).length).toBe(before);
  }
}

describe('WS plc.* (motor-interlock, sim dừng)', () => {
  it('welcome có sim.plc; watch → plc.values; write → values đổi (LWW)', async () => {
    const { wsUrl } = await startServer(MOTOR);
    const c = new TestClient(wsUrl);
    await c.open();
    const welcome = await c.hello();
    expect(welcome.sim.plc).toEqual({ scanCount: 0, faultCount: 0 });

    c.send({ type: 'plc.watch', refs: ['RUN_CMD'] });
    const v0 = await c.waitForNext(
      (m): m is Extract<ServerMessage, { type: 'plc.values' }> => m.type === 'plc.values',
    );
    expect(v0.values).toEqual([[0, false]]);

    c.send({ type: 'plc.write', ref: 'RUN_CMD', value: true });
    const v1 = await c.waitForNext(
      (m): m is Extract<ServerMessage, { type: 'plc.values' }> =>
        m.type === 'plc.values' && m.values.some(([i, v]) => i === 0 && v === true),
    );
    expect(v1.values).toEqual([[0, true]]);

    // LWW: không đổi → không gửi thêm plc.values.
    const n = c.messages.filter((m) => m.type === 'plc.values').length;
    await new Promise((r) => setTimeout(r, 400));
    expect(c.messages.filter((m) => m.type === 'plc.values').length).toBe(n);
  });

  it('plc.unwatch: sau unwatch không còn plc.values', async () => {
    const { wsUrl } = await startServer(MOTOR);
    const c = new TestClient(wsUrl);
    await c.open();
    await c.hello();
    c.send({ type: 'plc.watch', refs: ['RUN_CMD'] });
    await c.waitForNext((m): m is Extract<ServerMessage, { type: 'plc.values' }> => m.type === 'plc.values');
    const n = c.messages.filter((m) => m.type === 'plc.values').length;
    c.send({ type: 'plc.unwatch' });
    c.send({ type: 'plc.write', ref: 'RUN_CMD', value: true });
    await new Promise((r) => setTimeout(r, 400));
    expect(c.messages.filter((m) => m.type === 'plc.values').length).toBe(n);
  });

  it('sim.command run → PLC scan (scanCount tăng); pause dừng scan', async () => {
    const { wsUrl } = await startServer(MOTOR);
    const c = new TestClient(wsUrl);
    await c.open();
    await c.hello();
    c.send({ type: 'sim.command', cmd: 'run' });
    const running = await c.waitForNext(
      (m): m is Extract<ServerMessage, { type: 'sim.state' }> =>
        m.type === 'sim.state' && m.plc !== undefined && m.plc.scanCount >= 2,
      5000,
    );
    expect(running.plc?.scanCount).toBeGreaterThanOrEqual(2);
    c.send({ type: 'sim.command', cmd: 'pause' });
    const paused = await c.waitForNext(
      (m): m is Extract<ServerMessage, { type: 'sim.state' }> =>
        m.type === 'sim.state' && m.state === 'PAUSED',
      3000,
    );
    expect(paused.plc?.scanCount).toBeGreaterThanOrEqual(2);
  });

  it('plc.write sai kiểu → error TAG-E001', async () => {
    const { wsUrl } = await startServer(MOTOR);
    const c = new TestClient(wsUrl);
    await c.open();
    await c.hello();
    c.send({ type: 'plc.write', ref: 'RUN_CMD', value: 5 });
    const err = await c.waitForNext(
      (m): m is Extract<ServerMessage, { type: 'error' }> => m.type === 'error',
    );
    expect(err.code).toBe('TAG-E001');
  });

  it('plc.force/unforce: force thắng write, unforce trả lại write', async () => {
    const { wsUrl } = await startServer(MOTOR);
    const c = new TestClient(wsUrl);
    await c.open();
    await c.hello();
    c.send({ type: 'plc.watch', refs: ['START_PB'] });
    await c.waitForNext((m): m is Extract<ServerMessage, { type: 'plc.values' }> => m.type === 'plc.values');

    c.send({ type: 'plc.force', ref: 'START_PB', value: true });
    const v1 = await c.waitForNext(
      (m): m is Extract<ServerMessage, { type: 'plc.values' }> =>
        m.type === 'plc.values' && m.values.some(([i, v]) => i === 0 && v === true),
    );
    expect(v1.values).toEqual([[0, true]]);

    c.send({ type: 'plc.unforce', ref: 'START_PB' });
    c.send({ type: 'plc.write', ref: 'START_PB', value: false });
    const v2 = await c.waitForNext(
      (m): m is Extract<ServerMessage, { type: 'plc.values' }> =>
        m.type === 'plc.values' && m.values.some(([i, v]) => i === 0 && v === false),
    );
    expect(v2.values).toEqual([[0, false]]);
  });

  it('plc.watch ref lạ → error TAG-E003, không đăng ký', async () => {
    const { wsUrl } = await startServer(MOTOR);
    const c = new TestClient(wsUrl);
    await c.open();
    await c.hello();
    c.send({ type: 'plc.watch', refs: ['NOPE'] });
    const err = await c.waitForNext(
      (m): m is Extract<ServerMessage, { type: 'error' }> => m.type === 'error',
    );
    expect(err.code).toBe('TAG-E003');
    // Không đăng ký: write không tạo plc.values.
    await c.expectNo((m) => m.type === 'plc.values');
  });

  it('project không PLC: plc.watch → SIM-E001; welcome.sim không có plc', async () => {
    const { wsUrl } = await startServer(HELLO_TAGS);
    const c = new TestClient(wsUrl);
    await c.open();
    const welcome = await c.hello();
    expect(welcome.sim.plc).toBeUndefined();
    c.send({ type: 'plc.watch', refs: ['LAMP_RUN'] });
    const err = await c.waitForNext(
      (m): m is Extract<ServerMessage, { type: 'error' }> => m.type === 'error',
    );
    expect(err.code).toBe('SIM-E001');
  });
});

describe('REST /api/plc/* (OQ-208)', () => {
  it('build ok + files: ghi file hợp lệ, chặn đường ra ngoài plc/', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-plc-rest-'));
    await cp(MOTOR, dir, { recursive: true });
    const { httpUrl } = await startServer(dir);

    const build1 = await fetch(`${httpUrl}api/plc/build`, { method: 'POST' });
    expect(build1.status).toBe(200);
    const b1 = (await build1.json()) as { ok: boolean; files: string[] };
    expect(b1.ok).toBe(true);
    expect(b1.files).toEqual(['FB_Motor.scl', 'FB_Motor_DB.scl', 'OB1.scl']);

    const save = await fetch(`${httpUrl}api/plc/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        path: 'FB_Dummy.scl',
        content: 'FUNCTION_BLOCK "FB_Dummy"\nVAR_INPUT\nEND_VAR\nBEGIN\nEND_FUNCTION_BLOCK\n',
      }),
    });
    expect(save.status).toBe(200);
    const build2 = await fetch(`${httpUrl}api/plc/build`, { method: 'POST' });
    const b2 = (await build2.json()) as { ok: boolean; files: string[] };
    expect(b2.ok).toBe(true);
    expect(b2.files).toContain('FB_Dummy.scl');

    const escape = await fetch(`${httpUrl}api/plc/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '../escape.scl', content: 'x' }),
    });
    expect(escape.status).toBe(400);
    await expect(readFile(join(dir, 'escape.scl'), 'utf8')).rejects.toThrow();

    const badBody = await fetch(`${httpUrl}api/plc/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'x.scl' }),
    });
    expect(badBody.status).toBe(400);
  });

  it('GET /api/plc/files đọc nội dung; thiếu → 404; ra ngoài → 400', async () => {
    const { httpUrl } = await startServer(MOTOR);
    const ok = await fetch(`${httpUrl}api/plc/files?path=${encodeURIComponent('OB1.scl')}`);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { path: string; content: string };
    expect(body.path).toBe('OB1.scl');
    expect(body.content).toContain('ORGANIZATION_BLOCK "Main"');
    const missing = await fetch(`${httpUrl}api/plc/files?path=${encodeURIComponent('NOPE.scl')}`);
    expect(missing.status).toBe(404);
    const escape = await fetch(
      `${httpUrl}api/plc/files?path=${encodeURIComponent('../vcs.project.yaml')}`,
    );
    expect(escape.status).toBe(400);
  });

  it('build lỗi → ok=false khi file plc/ hỏng (không hot reload PLC đang chạy)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-plc-rest-'));
    await cp(MOTOR, dir, { recursive: true });
    const { httpUrl } = await startServer(dir);
    await fetch(`${httpUrl}api/plc/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'BROKEN.scl', content: 'FUNCTION_BLOCK "X" BADTOKEN' }),
    });
    const build = await fetch(`${httpUrl}api/plc/build`, { method: 'POST' });
    const b = (await build.json()) as { ok: boolean; diagnostics: Array<{ severity: string }> };
    expect(b.ok).toBe(false);
    expect(b.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});
