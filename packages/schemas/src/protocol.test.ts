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
