// Test protocol zod (M0 §9.2, §12.1: ≥ 12).
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, clientMessageSchema, serverMessageSchema } from './protocol.js';

describe('PROTOCOL_VERSION', () => {
  it('bằng 1', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});

describe('clientMessageSchema', () => {
  it('hello hợp lệ', () => {
    expect(clientMessageSchema.safeParse({ type: 'hello', protocolVersion: 1 }).success).toBe(true);
  });

  it('hello thiếu protocolVersion → lỗi', () => {
    expect(clientMessageSchema.safeParse({ type: 'hello' }).success).toBe(false);
  });

  it('sim.command run/step với steps trong 1..10000', () => {
    expect(
      clientMessageSchema.safeParse({ type: 'sim.command', cmd: 'step', steps: 5 }).success,
    ).toBe(true);
    expect(clientMessageSchema.safeParse({ type: 'sim.command', cmd: 'run' }).success).toBe(true);
    expect(
      clientMessageSchema.safeParse({ type: 'sim.command', cmd: 'step', steps: 0 }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ type: 'sim.command', cmd: 'step', steps: 10001 }).success,
    ).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'sim.command', cmd: 'jump' }).success).toBe(false);
  });

  it("sim.timeScale chấp nhận số và 'max'", () => {
    expect(clientMessageSchema.safeParse({ type: 'sim.timeScale', value: 10 }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ type: 'sim.timeScale', value: 'max' }).success).toBe(
      true,
    );
  });

  it("tags.subscribe chấp nhận '*' và mảng tên", () => {
    expect(clientMessageSchema.safeParse({ type: 'tags.subscribe', names: '*' }).success).toBe(
      true,
    );
    expect(
      clientMessageSchema.safeParse({ type: 'tags.subscribe', names: ['A', 'B'] }).success,
    ).toBe(true);
  });

  it('tag.write với giá trị bool/number/string', () => {
    expect(
      clientMessageSchema.safeParse({ type: 'tag.write', name: 'BTN', value: true }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({ type: 'tag.write', name: 'PT', value: 3.5 }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({ type: 'tag.write', name: 'X', value: null }).success,
    ).toBe(false);
  });

  it('type lạ → lỗi', () => {
    expect(clientMessageSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });
});

describe('serverMessageSchema', () => {
  const sim = {
    state: 'RUNNING',
    simTimeMs: 100,
    stepCount: 10,
    timeScale: 1,
    lagging: false,
    achievedScale: 1,
  };

  it('welcome hợp lệ', () => {
    expect(
      serverMessageSchema.safeParse({
        type: 'welcome',
        protocolVersion: 1,
        project: { name: 'Demo', language: 'vi', stepMs: 10 },
        sim,
      }).success,
    ).toBe(true);
  });

  it('sim.state hợp lệ; state lạ → lỗi', () => {
    expect(serverMessageSchema.safeParse({ type: 'sim.state', ...sim }).success).toBe(true);
    expect(
      serverMessageSchema.safeParse({ type: 'sim.state', ...sim, state: 'FLYING' }).success,
    ).toBe(false);
  });

  it('tags.snapshot / tags.delta hợp lệ', () => {
    expect(
      serverMessageSchema.safeParse({
        type: 'tags.snapshot',
        defs: [
          {
            name: 'BTN',
            type: 'Bool',
            area: 'I',
            address: '%I0.0',
            controller: 'PLC1',
            owner: 'free',
            writable: true,
          },
        ],
        values: [true],
        simTimeMs: 0,
      }).success,
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({
        type: 'tags.delta',
        simTimeMs: 10,
        changes: [[0, true]],
      }).success,
    ).toBe(true);
  });

  it('diagnostics / error hợp lệ', () => {
    expect(
      serverMessageSchema.safeParse({
        type: 'diagnostics',
        items: [{ code: 'PRJ-E003', severity: 'error', message: 'x' }],
      }).success,
    ).toBe(true);
    expect(
      serverMessageSchema.safeParse({ type: 'error', code: 'WS-E002', message: 'busy' }).success,
    ).toBe(true);
  });
});

describe('serverMessageSchema — sim.state.locked? + comms.* (P0.8, B4)', () => {
  const sim = {
    state: 'RUNNING',
    simTimeMs: 100,
    stepCount: 10,
    timeScale: 1,
    lagging: false,
    achievedScale: 1,
  };

  const stats = {
    state: 'running',
    clients: 1,
    reads: 10,
    writes: 2,
    errors: 0,
  };

  it('sim.state thiếu locked → parse ok; locked true/false → parse ok', () => {
    expect(serverMessageSchema.safeParse({ type: 'sim.state', ...sim }).success).toBe(true);
    expect(serverMessageSchema.safeParse({ type: 'sim.state', ...sim, locked: true }).success).toBe(
      true,
    );
    expect(
      serverMessageSchema.safeParse({ type: 'sim.state', ...sim, locked: false }).success,
    ).toBe(true);
  });

  it("sim.state locked: 'yes' → lỗi", () => {
    expect(
      serverMessageSchema.safeParse({ type: 'sim.state', ...sim, locked: 'yes' }).success,
    ).toBe(false);
  });

  it('comms.status hợp lệ → parse ok', () => {
    expect(
      serverMessageSchema.safeParse({
        type: 'comms.status',
        gateways: [
          { id: 'opc1', kind: 'opcua-server', stats, endpoints: ['opc.tcp://127.0.0.1:4840'] },
        ],
      }).success,
    ).toBe(true);
  });

  it('comms.status thiếu stats / state lạ / kind lạ → lỗi', () => {
    const gw = { id: 'opc1', kind: 'opcua-server', stats, endpoints: [] };
    expect(
      serverMessageSchema.safeParse({
        type: 'comms.status',
        gateways: [{ id: 'opc1', kind: 'opcua-server', endpoints: [] }],
      }).success,
    ).toBe(false);
    expect(
      serverMessageSchema.safeParse({
        type: 'comms.status',
        gateways: [{ ...gw, stats: { ...stats, state: 'flying' } }],
      }).success,
    ).toBe(false);
    expect(
      serverMessageSchema.safeParse({
        type: 'comms.status',
        gateways: [{ ...gw, kind: 's7-server' }],
      }).success,
    ).toBe(false);
  });

  it('comms.log 0 entry + 1 entry đủ trường → parse ok', () => {
    expect(serverMessageSchema.safeParse({ type: 'comms.log', entries: [] }).success).toBe(true);
    expect(
      serverMessageSchema.safeParse({
        type: 'comms.log',
        entries: [
          {
            tWallMs: 1000,
            gateway: 'opc1',
            level: 'info',
            kind: 'session',
            summary: 'client connected',
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('comms.log kind lạ / thiếu summary → lỗi', () => {
    const entry = {
      tWallMs: 1000,
      gateway: 'opc1',
      level: 'info',
      kind: 'session',
      summary: 'ok',
    };
    expect(
      serverMessageSchema.safeParse({
        type: 'comms.log',
        entries: [{ ...entry, kind: 'weird' }],
      }).success,
    ).toBe(false);
    expect(
      serverMessageSchema.safeParse({
        type: 'comms.log',
        entries: [{ tWallMs: 1000, gateway: 'opc1', level: 'info', kind: 'session' }],
      }).success,
    ).toBe(false);
  });
});
