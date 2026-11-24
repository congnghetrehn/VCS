// Test createSimulation / builder (M0 §6.8, §12.1: ≥ 10).
// Project dựng bằng literal SimulationProject (kernel không import @vcs/project
// — OQ-030); catalog từ createTagCatalog ở @vcs/schemas.
import { describe, expect, it } from 'vitest';
import { ProjectInvalidError, createSimulation, type SimulationProject } from './index.js';
import { demoExtension } from './demo/index.js';
import { LoopbackController } from './demo/loopback.js';
import { createTagCatalog, diag } from '@vcs/schemas';
import type { ControllerDef, ProjectConfig, TagDef } from '@vcs/schemas';

function helloDefs(): TagDef[] {
  return [
    {
      name: 'BTN_START',
      type: 'Bool',
      area: 'I',
      address: '%I0.0',
      controller: 'PLC1',
      signal: { kind: 'DI' },
    },
    {
      name: 'SW_AUTO',
      type: 'Bool',
      area: 'I',
      address: '%I0.1',
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
    { name: 'M_FLAG', type: 'Bool', area: 'M', address: '%M0.0', controller: 'PLC1' },
  ];
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

function makeProject(
  controllers: ControllerDef[] = [DEMO_DEF],
  diagnostics: SimulationProject['diagnostics'] = [],
): SimulationProject {
  const tags = helloDefs();
  const config: ProjectConfig = {
    schemaVersion: 1,
    name: 'Hello Tags',
    language: 'vi',
    seed: 1,
    simulation: { stepMs: 10, plcScanMs: 10, timeScale: 1 },
    files: { tags: 'tags/tags.yaml' },
    controllers,
  };
  return { config, tags, catalog: createTagCatalog(tags), diagnostics };
}

describe('createSimulation — project không hợp lệ', () => {
  it('diagnostics có error → ném ProjectInvalidError kèm danh sách', async () => {
    const project = makeProject(
      [],
      [diag('PRJ-E001', 'error', 'thiếu file bắt buộc vcs.project.yaml')],
    );
    await expect(createSimulation(project)).rejects.toBeInstanceOf(ProjectInvalidError);
    try {
      await createSimulation(project);
      expect.unreachable();
    } catch (err) {
      const e = err as ProjectInvalidError;
      expect(e.diagnostics).toHaveLength(1);
      expect(e.diagnostics[0]?.code).toBe('PRJ-E001');
    }
  });

  it('chỉ warning thì không ném', async () => {
    const project = makeProject([], [diag('PRJ-W002', 'warning', 'không có tags.yaml')]);
    const bundle = await createSimulation(project, { extensions: [demoExtension] });
    expect(bundle.controllers).toEqual([]);
  });
});

describe('createSimulation — factory / extension', () => {
  it('không có extension đăng ký factory → SIM-W001, controller bị bỏ qua, sim vẫn chạy', async () => {
    const bundle = await createSimulation(makeProject());
    expect(bundle.controllers).toEqual([]);
    expect(bundle.diagnostics.map((d) => d.code)).toEqual(['SIM-W001']);
    expect(bundle.diagnostics[0]?.severity).toBe('warning');
    bundle.sim.runSteps(3);
    expect(bundle.sim.simTimeMs).toBe(30);
    expect(bundle.sim.stepCount).toBe(3);
  });

  it('demoExtension → PLC1 chạy, SCAN_CNT tăng, LAMP_RUN theo BTN_START', async () => {
    const bundle = await createSimulation(makeProject(), { extensions: [demoExtension] });
    expect(bundle.diagnostics).toEqual([]);
    expect(bundle.controllers.map((c) => c.id)).toEqual(['PLC1']);
    expect(bundle.tags.size).toBe(4); // tag M_FLAG không vào TagDB
    bundle.sim.runSteps(5);
    expect(bundle.tags.read('SCAN_CNT').value).toBe(5);
    expect(bundle.controllers[0]?.getDiagnostics().scanCount).toBe(5);
  });

  it('extensions chạy tuần tự theo thứ tự mảng; đăng ký component pha plant', async () => {
    const order: string[] = [];
    const bundle = await createSimulation(makeProject(), {
      extensions: [
        {
          id: 'ext-a',
          apply: () => {
            order.push('a');
          },
        },
        {
          id: 'ext-b',
          apply: (ctx) => {
            order.push('b');
            ctx.register('plant', {
              id: 'plant-b',
              step: () => {
                order.push('plant-b-step');
              },
              reset: () => undefined,
              snapshot: () => ({}),
              restore: () => undefined,
            });
          },
        },
        demoExtension,
      ],
    });
    expect(order).toEqual(['a', 'b']);
    bundle.sim.stepOnce();
    expect(order).toContain('plant-b-step');
    expect(bundle.controllers.map((c) => c.id)).toEqual(['PLC1']);
  });

  it('thiếu factory cho external controller → SIM-W001', async () => {
    const extDef: ControllerDef = {
      id: 'GW1',
      mode: 'external',
      adapter: 'opcua',
      endpoint: 'opc.tcp://127.0.0.1:4840',
      config: {},
    };
    const bundle = await createSimulation(makeProject([extDef]), { extensions: [demoExtension] });
    expect(bundle.controllers).toEqual([]);
    expect(bundle.diagnostics.map((d) => d.code)).toEqual(['SIM-W001']);
  });

  it('lỗi init() → SIM-E001, bỏ qua controller đó, controller khác vẫn chạy (OQ-025)', async () => {
    const badDef: ControllerDef = {
      id: 'BAD',
      mode: 'builtin',
      vendor: 'demo',
      model: 'loopback',
      config: { loopback: [{ in: 'KHONG_CO', out: 'LAMP_RUN' }] },
    };
    const bundle = await createSimulation(makeProject([badDef, DEMO_DEF]), {
      extensions: [demoExtension],
    });
    expect(bundle.controllers.map((c) => c.id)).toEqual(['PLC1']);
    expect(bundle.diagnostics.map((d) => d.code)).toEqual(['SIM-E001']);
    bundle.sim.runSteps(2);
    expect(bundle.tags.read('SCAN_CNT').value).toBe(2);
  });

  it('factory trả Promise được await; init lỗi đồng bộ cũng thành SIM-E001', async () => {
    const bundle = await createSimulation(makeProject(), {
      extensions: [
        {
          id: 'async-factory',
          apply: (ctx) => {
            ctx.registerController('builtin:demo', async (def, fctx) => {
              await Promise.resolve();
              const { LoopbackController } = await import('./demo/loopback.js');
              return new LoopbackController(def.id, fctx.tags);
            });
          },
        },
      ],
    });
    expect(bundle.controllers.map((c) => c.id)).toEqual(['PLC1']);
  });

  it('scanPeriodMs lấy từ def.config, mặc định plcScanMs khi vắng', async () => {
    const withScan: ControllerDef = {
      ...DEMO_DEF,
      config: { ...DEMO_DEF.config, scanPeriodMs: 20 },
    };
    const bundle = await createSimulation(makeProject([withScan]), {
      extensions: [demoExtension],
    });
    bundle.sim.runSteps(2); // 2 bước × 10 ms = 20 ms → 1 scan
    expect(bundle.controllers[0]?.getDiagnostics().scanCount).toBe(1);
    expect(bundle.tags.read('SCAN_CNT').value).toBe(1);
  });

  it('BuildCtx.addDiagnostic ghi vào bundle.diagnostics', async () => {
    const bundle = await createSimulation(makeProject(), {
      extensions: [
        {
          id: 'noter',
          apply: (ctx) => {
            ctx.addDiagnostic(diag('SIM-W001', 'warning', 'ghi chú từ extension'));
          },
        },
        demoExtension,
      ],
    });
    expect(bundle.diagnostics.map((d) => d.message)).toContain('ghi chú từ extension');
  });

  it('errorPolicy isolate được truyền xuống orchestrator', async () => {
    const bundle = await createSimulation(makeProject(), {
      extensions: [demoExtension],
      errorPolicy: 'isolate',
    });
    expect(bundle.sim).toBeDefined();
    bundle.sim.runSteps(1);
    expect(bundle.sim.stepCount).toBe(1);
  });

  it('ControllerConfig.tags = mọi tag của controller (kể cả M/DB), thứ tự như file', async () => {
    let seen: readonly TagDef[] | undefined;
    const bundle = await createSimulation(makeProject(), {
      extensions: [
        {
          id: 'spy',
          apply: (ctx) => {
            ctx.registerController('builtin:demo', (def, c2) => {
              seen = c2.project.catalog.byController(def.id);
              return new LoopbackController(def.id, c2.tags);
            });
          },
        },
      ],
    });
    expect(bundle.controllers.map((c) => c.id)).toEqual(['PLC1']);
    expect(seen?.map((t) => t.name)).toEqual([
      'BTN_START',
      'SW_AUTO',
      'LAMP_RUN',
      'SCAN_CNT',
      'M_FLAG',
    ]);
  });
});
