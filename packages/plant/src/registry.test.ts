// Registry model (M2 §4.5).

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createModelRegistry, deriveModel, defaultRegistry, ModelRegistry, type ModelSlots, type StepCtx } from './registry.js';
import { fakeMotorModel, type FakeMotorParams, type FakeMotorState } from './test-helpers.js';
import type { FaultSlot, ObsSlot, RoleSlot } from './registry.js';

describe('ModelRegistry', () => {
  it('register/get/list/has', () => {
    const reg = createModelRegistry();
    expect(reg.has('fake_motor')).toBe(false);
    reg.register(fakeMotorModel);
    expect(reg.has('fake_motor')).toBe(true);
    expect(reg.get('fake_motor')).toBe(fakeMotorModel);
    expect(reg.list()).toEqual(['fake_motor']);
    expect(reg.get('nope')).toBeUndefined();
  });

  it('đăng ký trùng type → throw', () => {
    const reg = createModelRegistry();
    reg.register(fakeMotorModel);
    expect(() => { reg.register(fakeMotorModel); }).toThrow('đã đăng ký');
  });

  it('model không có role → throw', () => {
    const reg = createModelRegistry();
    expect(() => { reg.register({ ...fakeMotorModel, type: 'empty', roles: [] }); },
    ).toThrow('ít nhất một role');
  });

  it('type rỗng → throw', () => {
    const reg = createModelRegistry();
    expect(() => { reg.register({ ...fakeMotorModel, type: '' }); }).toThrow('không được rỗng');
  });

  it('list sắp xếp theo type', () => {
    const reg = createModelRegistry();
    reg.register({ ...fakeMotorModel, type: 'zeta' });
    reg.register(fakeMotorModel);
    expect(reg.list()).toEqual(['fake_motor', 'zeta']);
  });

  it('defaultRegistry là một ModelRegistry riêng, ban đầu rỗng', () => {
    expect(defaultRegistry).toBeInstanceOf(ModelRegistry);
    expect(defaultRegistry.has('fake_motor')).toBe(false);
  });
});

describe('deriveModel', () => {
  it('spread base + patch type/roles/defaultParams', () => {
    const child = deriveModel(fakeMotorModel, {
      type: 'fake_motor_fast',
      defaultParams: { startDelayMs: 100 },
    });
    expect(child.type).toBe('fake_motor_fast');
    expect(child.defaultParams).toEqual({ startDelayMs: 100 });
    expect(child.roles).toBe(fakeMotorModel.roles);
    expect(child.paramsSchema).toBe(fakeMotorModel.paramsSchema);
    expect(child.version).toBe(fakeMotorModel.version);
  });

  it('patch step thay hành vi, giữ init', () => {
    const calls: string[] = [];
    const ctx: StepCtx<FakeMotorParams, FakeMotorState> = {
      dtMs: 10,
      simTimeMs: 0,
      params: { startDelayMs: 500 },
      state: { t0: null },
      cmd: () => undefined,
      has: () => false,
      emit: (slot) => {
        calls.push(`emit:${String(slot)}`);
      },
      fault: () => ({ active: false, params: {}, sinceMs: 0 }),
      source: () => 0,
      rand: () => 0,
      setObs: (slot) => {
        calls.push(`obs:${String(slot)}`);
      },
      getObs: () => undefined,
      log: () => undefined,
    };
    const slots: ModelSlots = Object.freeze({
      role: Object.freeze({
        runCmd: 0 as RoleSlot,
        runFb: 1 as RoleSlot,
        currentFb: 2 as RoleSlot,
      }),
      obs: Object.freeze({ running: 0 as ObsSlot, current: 1 as ObsSlot }),
      fault: Object.freeze({ noStart: 0 as FaultSlot, overload: 1 as FaultSlot }),
      source: {},
    });
    const child = deriveModel(fakeMotorModel, {
      type: 'fake_motor_noop',
      step: () => undefined,
    });
    // init giữ nguyên của base (trả { t0: null }); step đã patch là no-op.
    expect(child.init({ startDelayMs: 100 }, () => 0)).toEqual({ t0: null });
    child.step(ctx, slots);
    expect(calls).toEqual([]);
    expect(ctx.state).toEqual({ t0: null });
  });

  it('paramsSchema patch thay schema (chặt hơn), giữ các trường khác của base', () => {
    const child = deriveModel(fakeMotorModel, {
      type: 'fake_motor_strict',
      paramsSchema: z.object({ startDelayMs: z.number().int().min(100) }),
    });
    expect(child.paramsSchema).not.toBe(fakeMotorModel.paramsSchema);
    expect(child.paramsSchema.safeParse({ startDelayMs: 50 }).success).toBe(false);
    expect(child.paramsSchema.safeParse({ startDelayMs: 500 }).success).toBe(true);
    expect(fakeMotorModel.paramsSchema.safeParse({ startDelayMs: 50 }).success).toBe(true);
    expect(child.roles).toBe(fakeMotorModel.roles);
    expect(child.defaultParams).toBe(fakeMotorModel.defaultParams);
    // init giữ nguyên của base (trả { t0: null }) — so hành vi, không tham
    // chiếu method (lint @typescript-eslint/unbound-method).
    expect(child.init({ startDelayMs: 500 }, () => 0)).toEqual({ t0: null });
  });

  it('paramsSchema của base vẫn validate defaultParams đã patch', () => {
    const child = deriveModel(fakeMotorModel, {
      type: 'fake_motor_bad',
      defaultParams: { startDelayMs: -5 },
    });
    expect(child.paramsSchema.safeParse(child.defaultParams).success).toBe(false);
  });

  it('zod schema của fake_motor: startDelayMs phải là int ≥ 0', () => {
    expect(fakeMotorModel.paramsSchema.safeParse({ startDelayMs: 500 }).success).toBe(true);
    expect(fakeMotorModel.paramsSchema.safeParse({ startDelayMs: -1 }).success).toBe(false);
    expect(fakeMotorModel.paramsSchema.safeParse({ startDelayMs: 1.5 }).success).toBe(false);
  });
});
