// Test scenario runner (M2 §11.4, P2.4 commit 2 — OQ-305/315/317/319).
// Schema: parse YAML + strict + thứ tự at. Runner: plant-only (motor_dol,
// stepMs 10) — set/fault/clear/preset, expects tag/observable, lỗi
// ScenarioError, determinism 2 lần + restore (OQ-317).

import { describe, expect, it } from 'vitest';

import { createSimulation, TraceHasher, type SimulationProject } from '@vcs/kernel';
import { createTagCatalog, type EquipmentInstance, type ProjectConfig } from '@vcs/schemas';

import type { PlantEngine } from './engine.js';
// Import qua package entry để side-effect đăng ký 9 model chạy.
import { parseScenarioYaml, runScenario, ScenarioError, scenarioSchema, plantExtension } from './index.js';
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

function makeProject(): SimulationProject {
  const tags = motorDolTagDefs();
  const config: ProjectConfig = {
    schemaVersion: 1,
    name: 'Scenario Test',
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
  return { config, tags, catalog: createTagCatalog(tags), diagnostics: [], plant: [M01] };
}

async function makeSim(): Promise<{
  sim: Awaited<ReturnType<typeof createSimulation>>['sim'];
  engine: PlantEngine;
}> {
  const bundle = await createSimulation(makeProject(), { extensions: [plantExtension()] });
  const engine = bundle.sim.getComponent('plant') as PlantEngine;
  return { sim: bundle.sim, engine };
}

/** Scenario overload + clear (bảng A: clearedAt=2000 → STOPPED 3000). */
const overloadSteps = [
  { at: 0, set: { CR01_M01_RUN_CMD: true } },
  { at: 1000, fault: { target: { equipment: 'CR01_M01', fault: 'overload' } } },
  { at: 2000, clear: 'overload', set: { CR01_M01_RUN_CMD: false } },
] as const;

const overloadScenario = scenarioSchema.parse({
  steps: overloadSteps,
  expects: [
    { at: 1000, observables: { CR01_M01: { state: 'TRIPPED' } } },
    { at: 2000, observables: { CR01_M01: { state: 'TRIPPED' } } },
    { at: 2990, observables: { CR01_M01: { state: 'TRIPPED' } } },
    { at: 3000, observables: { CR01_M01: { state: 'STOPPED' } } },
  ],
});

/** Cùng steps, chỉ expects tới 1000 — leg đầu của test restore (runner chặn
 * expects vượt untilMs nên leg đầu không dùng được scenario đầy đủ). */
const overloadPartial = scenarioSchema.parse({
  steps: overloadSteps,
  expects: [{ at: 1000, observables: { CR01_M01: { state: 'TRIPPED' } } }],
});

describe('parseScenarioYaml — schema', () => {
  it('YAML hợp lệ → parse đủ name/simulation/steps/expects', () => {
    const s = parseScenarioYaml(
      `name: test-a
simulation: { stepMs: 10, plcScanMs: 10 }
steps:
  - { at: 0, set: { STOP_OK: true } }
  - { at: 100, fault: { target: { equipment: M01, fault: overload } } }
  - { at: 200, clear: overload }
expects:
  - { at: 0, tags: { RUN_CMD: false } }
  - { at: 100, observables: { M01: { state: TRIPPED } } }
`,
      'a.yaml',
    );
    expect(s.name).toBe('test-a');
    expect(s.simulation).toEqual({ stepMs: 10, plcScanMs: 10 });
    expect(s.steps).toHaveLength(3);
    expect(s.expects).toHaveLength(2);
  });

  it('expects rỗng → ScenarioError', () => {
    expect(() => parseScenarioYaml('steps: []\nexpects: []\n', 'x.yaml')).toThrow(ScenarioError);
  });

  it('at âm → ScenarioError', () => {
    expect(() =>
      parseScenarioYaml('steps:\n  - { at: -10, set: { A: true } }\nexpects:\n  - { at: 0, tags: { A: true } }\n', 'x.yaml'),
    ).toThrow(ScenarioError);
  });

  it('steps không tăng dần → ScenarioError', () => {
    expect(() =>
      parseScenarioYaml(
        'steps:\n  - { at: 100, set: { A: true } }\n  - { at: 0, set: { A: false } }\nexpects:\n  - { at: 100, tags: { A: true } }\n',
        'x.yaml',
      ),
    ).toThrow(ScenarioError);
  });

  it('expects không tăng dần → ScenarioError', () => {
    expect(() =>
      parseScenarioYaml(
        'steps:\n  - { at: 0, set: { A: true } }\nexpects:\n  - { at: 100, tags: { A: true } }\n  - { at: 0, tags: { A: true } }\n',
        'x.yaml',
      ),
    ).toThrow(ScenarioError);
  });

  it('key lạ trong step (typo) → ScenarioError (strict)', () => {
    expect(() =>
      parseScenarioYaml(
        'steps:\n  - { at: 0, sett: { A: true } }\nexpects:\n  - { at: 0, tags: { A: true } }\n',
        'x.yaml',
      ),
    ).toThrow(ScenarioError);
  });

  it('fault kèm when → ScenarioError (when do runner đặt từ at)', () => {
    expect(() =>
      parseScenarioYaml(
        "steps:\n  - { at: 0, fault: { target: { equipment: M01, fault: overload }, when: { at: 'now' } } }\nexpects:\n  - { at: 0, tags: { A: true } }\n",
        'x.yaml',
      ),
    ).toThrow(ScenarioError);
  });

  it('YAML lỗi cú pháp → ScenarioError', () => {
    expect(() => parseScenarioYaml('name: [unclosed\n', 'x.yaml')).toThrow(ScenarioError);
  });
});

describe('runScenario — runner', () => {
  it('start bình thường: STARTING 0, RUNNING 500, runFb tag true', async () => {
    const { sim, engine } = await makeSim();
    const scenario = scenarioSchema.parse({
      steps: [{ at: 0, set: { CR01_M01_RUN_CMD: true } }],
      expects: [
        { at: 0, observables: { CR01_M01: { state: 'STARTING' } } },
        { at: 490, observables: { CR01_M01: { state: 'STARTING' } }, tags: { CR01_M01_RUN_FB: false } },
        { at: 500, observables: { CR01_M01: { state: 'RUNNING' } }, tags: { CR01_M01_RUN_FB: true } },
      ],
    });
    const result = runScenario(sim, engine, scenario);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.stepCount).toBe(51);
  });

  it('expects sai → passed=false, failures ghi đúng at/key/expected/actual', async () => {
    const { sim, engine } = await makeSim();
    const scenario = scenarioSchema.parse({
      steps: [{ at: 0, set: { CR01_M01_RUN_CMD: true } }],
      expects: [
        { at: 500, observables: { CR01_M01: { state: 'RUNNING' } }, tags: { CR01_M01_RUN_FB: false } },
      ],
    });
    const result = runScenario(sim, engine, scenario);
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      { at: 500, key: 'CR01_M01_RUN_FB', expected: 'false', actual: 'true' },
    ]);
  });

  it('overload + clear: TRIPPED 1000/2000/2990, STOPPED 3000 (clearedAt=2000)', async () => {
    const { sim, engine } = await makeSim();
    const result = runScenario(sim, engine, overloadScenario);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.stepCount).toBe(301);
  });

  it('preset noRunFeedback: RUNNING 500 nhưng runFb false (tag)', async () => {
    const { sim, engine } = await makeSim();
    const scenario = scenarioSchema.parse({
      steps: [
        { at: 0, set: { CR01_M01_RUN_CMD: true }, preset: { equipment: 'CR01_M01', preset: 'noRunFeedback' } },
      ],
      expects: [
        {
          at: 500,
          observables: { CR01_M01: { state: 'RUNNING' } },
          tags: { CR01_M01_RUN_FB: false },
        },
      ],
    });
    const result = runScenario(sim, engine, scenario);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("clear lỗi chưa inject → ScenarioError", async () => {
    const { sim, engine } = await makeSim();
    const scenario = scenarioSchema.parse({
      steps: [
        { at: 0, set: { CR01_M01_RUN_CMD: true } },
        { at: 100, clear: 'overload' },
      ],
      expects: [{ at: 100, observables: { CR01_M01: { state: 'STARTING' } } }],
    });
    expect(() => runScenario(sim, engine, scenario)).toThrow(ScenarioError);
  });

  it('set tag lạ → ScenarioError', async () => {
    const { sim, engine } = await makeSim();
    const scenario = scenarioSchema.parse({
      steps: [{ at: 0, set: { NOPE_TAG: true } }],
      expects: [{ at: 0, observables: { CR01_M01: { state: 'STOPPED' } } }],
    });
    expect(() => runScenario(sim, engine, scenario)).toThrow(ScenarioError);
  });

  it('expect tag lạ → ScenarioError', async () => {
    const { sim, engine } = await makeSim();
    const scenario = scenarioSchema.parse({
      steps: [],
      expects: [{ at: 0, tags: { NOPE_TAG: true } }],
    });
    expect(() => runScenario(sim, engine, scenario)).toThrow(ScenarioError);
  });

  it('expect observable lạ → ScenarioError', async () => {
    const { sim, engine } = await makeSim();
    const scenario = scenarioSchema.parse({
      steps: [],
      expects: [{ at: 0, observables: { CR01_M01: { nopeKey: 1 } } }],
    });
    expect(() => runScenario(sim, engine, scenario)).toThrow(ScenarioError);
  });

  it('fault equipment lạ → ScenarioError', async () => {
    const { sim, engine } = await makeSim();
    const scenario = scenarioSchema.parse({
      steps: [{ at: 0, fault: { target: { equipment: 'M99', fault: 'overload' } } }],
      expects: [{ at: 0, observables: { CR01_M01: { state: 'STOPPED' } } }],
    });
    expect(() => runScenario(sim, engine, scenario)).toThrow(ScenarioError);
  });

  it('at không phải bội stepMs → ScenarioError', async () => {
    const { sim, engine } = await makeSim();
    const scenario = scenarioSchema.parse({
      steps: [{ at: 5, set: { CR01_M01_RUN_CMD: true } }],
      expects: [{ at: 10, observables: { CR01_M01: { state: 'STARTING' } } }],
    });
    expect(() => runScenario(sim, engine, scenario)).toThrow(ScenarioError);
  });

  it('expects vượt untilMs → ScenarioError', async () => {
    const { sim, engine } = await makeSim();
    expect(() => runScenario(sim, engine, overloadScenario, { untilMs: 100 })).toThrow(ScenarioError);
  });

  it('determinism (OQ-317): 2 lần cùng hash; restore ở T=1000 → chạy lại cùng hash', async () => {
    const { sim: simA, engine: engA } = await makeSim();
    const hashA = runScenario(simA, engA, overloadScenario).hash;
    const { sim: simB, engine: engB } = await makeSim();
    const hashB = runScenario(simB, engB, overloadScenario).hash;
    expect(hashB).toBe(hashA);

    const { sim, engine } = await makeSim();
    const hasher = new TraceHasher(sim.tags);
    runScenario(sim, engine, overloadPartial, { untilMs: 1000, hasher });
    expect(sim.simTimeMs).toBe(1010);
    const snap = sim.snapshotAll();
    hasher.reset();
    const hashSeg1 = runScenario(sim, engine, overloadScenario, { untilMs: 3000, hasher }).hash;
    sim.restoreAll(snap);
    hasher.reset();
    const hashSeg2 = runScenario(sim, engine, overloadScenario, { untilMs: 3000, hasher }).hash;
    expect(hashSeg2).toBe(hashSeg1);
  });
});
