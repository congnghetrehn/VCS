// Test plantExtension (M2 §5.1, P2.4 commit 1, OQ-312/313).
// Extension đăng ký PlantEngine vào pha 'plant' từ project.plant; vắng
// plant → no-op; config lỗi → fail-fast kèm mã PL.

import { describe, expect, it } from 'vitest';

import { createSimulation, type SimulationProject } from '@vcs/kernel';
import { createTagCatalog } from '@vcs/schemas';
import type { EquipmentInstance, ProjectConfig } from '@vcs/schemas';

import { PlantEngine } from './engine.js';
// Import qua package entry để side-effect đăng ký 9 model vào
// defaultRegistry chạy (models/index.ts) — như consumer thật dùng.
import { plantExtension } from './index.js';
import { motorDolTagDefs } from './test-helpers.js';

const M01: EquipmentInstance = {
  id: 'CR01_M01',
  model: 'motor_dol',
  signals: {
    runCmd: 'CR01_M01_RUN_CMD',
    runFb: 'CR01_M01_RUN_FB',
    ready: 'CR01_M01_READY',
    remote: 'CR01_M01_REMOTE',
    overloadOk: 'CR01_M01_OVL_OK',
    currentFb: 'CR01_M01_CUR',
  },
};

function makeProject(plant: EquipmentInstance[] | undefined): SimulationProject {
  const tags = motorDolTagDefs();
  const config: ProjectConfig = {
    schemaVersion: 1,
    name: 'Plant Test',
    language: 'vi',
    seed: 42,
    simulation: { stepMs: 10, plcScanMs: 10, timeScale: 1 },
    files: {
      tags: 'tags/tags.yaml',
      comms: 'comms/comms.yaml',
      hmi: 'hmi/',
      plant: 'plant/equipment.yaml',
    },
    controllers: [],
  };
  return { config, tags, catalog: createTagCatalog(tags), diagnostics: [], plant };
}

describe('plantExtension — đăng ký pha plant', () => {
  it('không plant → no-op, sim chạy được, 0 component plant', async () => {
    const bundle = await createSimulation(makeProject(undefined), {
      extensions: [plantExtension()],
    });
    expect(bundle.sim.components('plant')).toHaveLength(0);
    bundle.sim.runSteps(5);
    expect(bundle.sim.simTimeMs).toBe(50);
  });

  it('plant rỗng [] → no-op', async () => {
    const bundle = await createSimulation(makeProject([]), {
      extensions: [plantExtension()],
    });
    expect(bundle.sim.components('plant')).toHaveLength(0);
  });

  it('plant hợp lệ → 1 PlantEngine pha plant, id plant', async () => {
    const bundle = await createSimulation(makeProject([M01]), {
      extensions: [plantExtension()],
    });
    const components = bundle.sim.components('plant');
    expect(components).toHaveLength(1);
    expect(components[0]).toBeInstanceOf(PlantEngine);
    expect(bundle.sim.getComponent('plant')).toBe(components[0]);
    const engine = components[0] as PlantEngine;
    // obs chỉ có giá trị sau bước đầu (model emit trong step).
    bundle.sim.runSteps(1);
    expect(engine.getObservable('CR01_M01', 'state')).toBe('STOPPED');
  });

  it('setOwner: DI/AI owner plant, DO giữ controller', async () => {
    const bundle = await createSimulation(makeProject([M01]), {
      extensions: [plantExtension()],
    });
    const fbH = bundle.tags.handle('CR01_M01_RUN_FB');
    const cmdH = bundle.tags.handle('CR01_M01_RUN_CMD');
    const curH = bundle.tags.handle('CR01_M01_CUR');
    expect(fbH).not.toBeUndefined();
    expect(cmdH).not.toBeUndefined();
    expect(curH).not.toBeUndefined();
    if (fbH !== undefined) expect(bundle.tags.owner(fbH)).toBe('plant');
    if (cmdH !== undefined) expect(bundle.tags.owner(cmdH)).toBe('controller');
    if (curH !== undefined) expect(bundle.tags.owner(curH)).toBe('plant');
  });

  it('engine-alone (không PLC): post runCmd → RUNNING sau startDelayMs', async () => {
    const bundle = await createSimulation(makeProject([M01]), {
      extensions: [plantExtension()],
    });
    const engine = bundle.sim.getComponent('plant') as PlantEngine;
    const cmdH = bundle.tags.handle('CR01_M01_RUN_CMD');
    expect(cmdH).not.toBeUndefined();
    if (cmdH !== undefined) {
      bundle.sim.post({
        label: 'test: runCmd=1',
        run: (ctx) => {
          ctx.tags.set(cmdH, true, 'system');
        },
      });
    }
    bundle.sim.runSteps(60);
    expect(engine.getObservable('CR01_M01', 'state')).toBe('RUNNING');
    expect(bundle.sim.tags.read('CR01_M01_RUN_FB').value).toBe(true);
  });

  it('model lạ → createSimulation throw kèm PL-E001 (fail-fast)', async () => {
    const bad: EquipmentInstance = { id: 'X01', model: 'model_khong_ton_tai' };
    await expect(
      createSimulation(makeProject([bad]), { extensions: [plantExtension()] }),
    ).rejects.toThrow(/PL-E001/);
  });

  it('thiếu role bắt buộc → throw kèm PL-E003', async () => {
    const bad: EquipmentInstance = {
      id: 'CR01_M01',
      model: 'motor_dol',
      signals: { runCmd: 'CR01_M01_RUN_CMD' },
    };
    await expect(
      createSimulation(makeProject([bad]), { extensions: [plantExtension()] }),
    ).rejects.toThrow(/PL-E003/);
  });

  it('tag gán không tồn tại → throw kèm TAG-E003', async () => {
    const bad: EquipmentInstance = {
      id: 'CR01_M01',
      model: 'motor_dol',
      signals: {
        runCmd: 'TAG_KHONG_TON_TAI',
        runFb: 'CR01_M01_RUN_FB',
        overloadOk: 'CR01_M01_OVL_OK',
      },
    };
    await expect(
      createSimulation(makeProject([bad]), { extensions: [plantExtension()] }),
    ).rejects.toThrow(/TAG-E003/);
  });

  it('extension id là plant (đăng ký trùng id → lỗi orchestrator)', async () => {
    const bundle = await createSimulation(makeProject([M01]), {
      extensions: [plantExtension()],
    });
    expect(bundle.sim.getComponent('plant')).toBeInstanceOf(PlantEngine);
    await expect(
      createSimulation(makeProject([M01]), {
        extensions: [plantExtension(), plantExtension()],
      }),
    ).rejects.toThrow(/trùng id component 'plant'/);
  });
});
