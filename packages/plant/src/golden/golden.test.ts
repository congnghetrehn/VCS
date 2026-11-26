// Harness chạy golden YAML plant (M2 §11.1, P2.3 — OQ-295).
// Mỗi file YAML = 1 model, mỗi case = 1 test (mẫu M1: readdirSync +
// describe.each, P1.7). Harness dựng fresh PlantEngine mới cho mỗi case.
// EXPECTED_MODELS tăng theo từng commit model (P2.3: 8 model mới + motor_dol).

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { makeModelSetup, modelEquipmentId } from '../test-helpers.js';
import { parseGoldenYaml, runPlantGoldenCase } from './runner.js';
import type { PlantGoldenCase } from './schema.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const GOLDEN_DIR = `${ROOT}packages/plant/golden`;

const FILES = readdirSync(GOLDEN_DIR)
  .filter((n) => n.endsWith('.golden.yaml'))
  .sort();

/** Số golden tối thiểu §11.1 theo model (damper 3 — OQ-298). */
const MIN_CASES: Record<string, number> = {
  motor_dol: 14,
  motor_vfd: 10,
  valve_onoff: 10,
  valve_ctrl: 6,
  damper: 3,
  analog_sensor: 8,
  switch_di: 8,
  silo_bin: 6,
  conveyor_simple: 8,
};

/** Model đã có file golden (tăng theo từng commit P2.3). */
const EXPECTED_MODELS = ['motor_dol', 'motor_vfd', 'valve_onoff', 'valve_ctrl', 'damper', 'analog_sensor', 'switch_di', 'silo_bin', 'conveyor_simple'];

interface GoldenCaseEntry extends PlantGoldenCase {
  file: string;
  model: string;
  stepMs: number;
  seed: number;
}

function listCases(): GoldenCaseEntry[] {
  const out: GoldenCaseEntry[] = [];
  for (const name of FILES) {
    const file = parseGoldenYaml(readFileSync(`${GOLDEN_DIR}/${name}`, 'utf8'));
    for (const c of file.cases) {
      out.push({ ...c, file: name, model: file.model, stepMs: file.stepMs, seed: file.seed });
    }
  }
  return out;
}

const CASES = listCases();

describe('golden inventory plant (M2 §11.1, OQ-295)', () => {
  it('đủ file/model, đủ case tối thiểu theo model, id duy nhất, stepMs/seed đúng', () => {
    expect(FILES).toHaveLength(EXPECTED_MODELS.length);
    const models = new Set(CASES.map((c) => c.model));
    expect([...models].sort()).toEqual([...EXPECTED_MODELS].sort());
    const ids = new Set(CASES.map((c) => c.id));
    expect(ids.size).toBe(CASES.length);
    for (const model of EXPECTED_MODELS) {
      const n = CASES.filter((c) => c.model === model).length;
      expect(n).toBeGreaterThanOrEqual(MIN_CASES[model] as number);
    }
    for (const c of CASES) {
      expect(c.stepMs).toBe(10);
      expect(c.seed).toBe(42);
    }
  });
});

describe.each(CASES)('golden $model: $id ($file)', (c) => {
  it(c.description, () => {
    const setup = makeModelSetup(c.model, {
      stepMs: c.stepMs,
      seed: c.seed,
      ...(c.params !== undefined ? { params: c.params } : {}),
      ...(c.source !== undefined ? { source: c.source } : {}),
      ...(c.sources !== undefined ? { sources: c.sources } : {}),
    });
    runPlantGoldenCase(
      {
        engine: setup.engine,
        tags: setup.tags,
        equipmentId: modelEquipmentId(c.model),
        signals: setup.signals,
        defs: setup.defMap,
        stepMs: c.stepMs,
      },
      c,
    );
  });
});
