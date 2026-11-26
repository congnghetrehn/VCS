// Test makeSim + FakeController (M0 §7; OQ-017, OQ-028).
import { describe, expect, it } from 'vitest';
import { FakeController, makeSim } from './index.js';
import { SimComponentError } from '@vcs/kernel';
import type { SimulationProject } from '@vcs/kernel';
import { createTagCatalog } from '@vcs/schemas';
import type { ControllerDef, ProjectConfig, TagDef } from '@vcs/schemas';

function helloProject(controllers: ControllerDef[] = []): SimulationProject {
  const tags: TagDef[] = [
    {
      name: 'BTN_START',
      type: 'Bool',
      area: 'I',
      address: '%I0.0',
      controller: 'PLC1',
      signal: { kind: 'DI' },
    },
    {
      name: 'LAMP_RUN',
      type: 'Bool',
      area: 'Q',
      address: '%Q0.0',
      controller: 'PLC1',
      signal: { kind: 'DO' },
    },
    {
      name: 'SCAN_CNT',
      type: 'Int',
      area: 'Q',
      address: '%QW64',
      controller: 'PLC1',
      signal: { kind: 'AO' },
    },
  ];
  const config: ProjectConfig = {
    schemaVersion: 1,
    name: 'Hello',
    language: 'vi',
    seed: 1,
    simulation: { stepMs: 10, plcScanMs: 10, timeScale: 1 },
    files: { tags: 'tags/tags.yaml', comms: 'comms/comms.yaml', hmi: 'hmi/', plant: 'plant/equipment.yaml' },
    controllers,
  };
  return { config, tags, catalog: createTagCatalog(tags), diagnostics: [] };
}

const DEMO_DEF: ControllerDef = {
  id: 'PLC1',
  mode: 'builtin',
  vendor: 'demo',
  model: 'loopback',
  config: {
    loopback: [{ in: 'BTN_START', out: 'LAMP_RUN' }],
    counter: [{ out: 'SCAN_CNT', step: 1 }],
  },
};

describe('makeSim', () => {
  it('tự đăng ký demoExtension: project builtin:demo chạy bằng một lệnh', async () => {
    const bundle = await makeSim(helloProject([DEMO_DEF]));
    expect(bundle.controllers.map((c) => c.id)).toEqual(['PLC1']);
    bundle.sim.runSteps(3);
    expect(bundle.tags.read('SCAN_CNT').value).toBe(3);
  });

  it('không có controller → vẫn chạy, clock tăng, diagnostics rỗng', async () => {
    const bundle = await makeSim(helloProject());
    bundle.sim.runSteps(2);
    expect(bundle.sim.simTimeMs).toBe(20);
    expect(bundle.diagnostics).toEqual([]);
  });

  it('extensions của caller chạy sau demoExtension', async () => {
    const order: string[] = [];
    const bundle = await makeSim(helloProject([DEMO_DEF]), {
      extensions: [
        {
          id: 'caller-ext',
          apply: () => {
            order.push('caller');
          },
        },
      ],
    });
    expect(order).toEqual(['caller']);
    expect(bundle.controllers.map((c) => c.id)).toEqual(['PLC1']);
  });

  it('errorPolicy/tagDb được chuyển thẳng cho createSimulation', async () => {
    const bundle = await makeSim(helloProject([DEMO_DEF]), { errorPolicy: 'isolate' });
    bundle.sim.runSteps(1);
    expect(bundle.sim.stepCount).toBe(1);
  });
});

describe('FakeController', () => {
  it('đếm stepCalls/resetCalls; init lưu io/cfg; reset đưa stepCalls về 0', async () => {
    const fake = new FakeController('fake1');
    const bundle = await makeSim(helloProject(), {
      extensions: [
        {
          id: 'reg-fake',
          apply: (ctx) => {
            ctx.register('controllers', fake);
          },
        },
      ],
    });
    // Đăng ký trực tiếp qua extension không gọi init → io/cfg chưa có.
    expect(fake.io).toBeUndefined();
    expect(fake.cfg).toBeUndefined();
    await fake.init(
      { id: 'fake1', def: DEMO_DEF, stepMs: 10, scanPeriodMs: 10, tags: [] },
      bundle.io,
    );
    expect(fake.io).toBe(bundle.io);
    expect(fake.cfg?.id).toBe('fake1');
    bundle.sim.runSteps(2);
    expect(fake.stepCalls).toBe(2);
    expect(fake.getDiagnostics().scanCount).toBe(2);
    expect(fake.getDiagnostics().state).toBe('RUN');
    bundle.sim.resetAll();
    expect(fake.resetCalls).toBe(1);
    expect(fake.stepCalls).toBe(0);
  });

  it('stepBehavior ném lỗi → SimComponentError (policy throw)', async () => {
    const fake = new FakeController('boom', {
      stepBehavior: (_T, _dt, self) => {
        if (self.stepCalls >= 2) throw new Error('fake-boom');
      },
    });
    const bundle = await makeSim(helloProject(), {
      extensions: [
        {
          id: 'reg-fake',
          apply: (ctx) => {
            ctx.register('controllers', fake);
          },
        },
      ],
    });
    bundle.sim.stepOnce();
    expect(() => {
      bundle.sim.stepOnce();
    }).toThrow(SimComponentError);
  });

  it('stepBehavior trả Promise → SIM-E002 ở stepOnce, chạy được ở stepOnceAsync', async () => {
    const fake = new FakeController('slow', {
      stepBehavior: () => Promise.resolve(),
    });
    const bundle = await makeSim(helloProject(), {
      extensions: [
        {
          id: 'reg-fake',
          apply: (ctx) => {
            ctx.register('controllers', fake);
          },
        },
      ],
    });
    expect(() => {
      bundle.sim.stepOnce();
    }).toThrow(/SIM-E002/);
    await bundle.sim.stepOnceAsync();
    expect(bundle.sim.stepCount).toBe(1);
    expect(fake.stepCalls).toBe(2);
  });

  it('snapshot/restore giữ bộ đếm; restore sai dạng → SIM-E003', () => {
    const fake = new FakeController('f1');
    expect(fake.step(0, 10)).toBeUndefined();
    expect(fake.step(10, 10)).toBeUndefined();
    const snap = fake.snapshot();
    fake.reset();
    expect(fake.stepCalls).toBe(0);
    fake.restore(snap);
    expect(fake.stepCalls).toBe(2);
    expect(() => {
      fake.restore({});
    }).toThrow(/SIM-E003/);
  });
});
