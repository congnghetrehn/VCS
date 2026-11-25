// Harness chạy golden YAML motor_dol (M2 §11.1, P2.2).
// Mỗi file YAML = 1 model, mỗi case = 1 test (mẫu M1: readdirSync +
// describe.each, P1.7). Harness dựng fresh PlantEngine mới cho mỗi case.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { makeMotorDolSetup } from '../test-helpers.js';
import { parseGoldenYaml, runPlantGoldenCase } from './runner.js';
import type { PlantGoldenCase } from './schema.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const GOLDEN_DIR = `${ROOT}packages/plant/golden`;

const FILES = readdirSync(GOLDEN_DIR)
  .filter((n) => n.endsWith('.golden.yaml'))
  .sort();

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

describe('golden inventory motor_dol (M2 §11.1, OQ-253)', () => {
  it('đủ 14 case, id duy nhất, đúng model/stepMs', () => {
    expect(FILES).toHaveLength(1);
    expect(CASES).toHaveLength(14);
    const ids = new Set(CASES.map((c) => c.id));
    expect(ids.size).toBe(CASES.length);
    for (const c of CASES) {
      expect(c.model).toBe('motor_dol');
      expect(c.stepMs).toBe(10);
      expect(c.seed).toBe(42);
    }
  });
});

describe.each(CASES)('golden motor_dol: $id ($file)', (c) => {
  it(c.description, () => {
    const setup = makeMotorDolSetup({
      stepMs: c.stepMs,
      seed: c.seed,
      ...(c.params !== undefined ? { params: c.params } : {}),
    });
    runPlantGoldenCase(
      {
        engine: setup.engine,
        tags: setup.tags,
        equipmentId: 'CR01_M01',
        signals: setup.signals,
        defs: setup.defMap,
        stepMs: c.stepMs,
      },
      c,
    );
  });
});
