// Golden runner plant (P2.2 — OQ-253/254/257/264).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { TagHandle } from '@vcs/kernel';
import { makeModelSetup, makeMotorDolSetup, modelEquipmentId } from '../test-helpers.js';
import {
  GoldenError,
  parseGoldenYaml,
  runPlantGoldenCase,
  type GoldenRunContext,
} from './runner.js';
import type { PlantGoldenCase } from './schema.js';

function miniCase(overrides?: Partial<PlantGoldenCase>): PlantGoldenCase {
  return {
    id: 'mini',
    description: 'Case nhỏ cho runner',
    steps: [{ t: 0, expect: { state: 'STOPPED' } }],
    ...overrides,
  };
}

function runCtx(): GoldenRunContext {
  const setup = makeMotorDolSetup();
  return {
    engine: setup.engine,
    tags: setup.tags,
    equipmentId: 'CR01_M01',
    signals: setup.signals,
    defs: setup.defMap,
    stepMs: 10,
  };
}

describe('parseGoldenYaml (OQ-253/264)', () => {
  it('parse file hợp lệ, đủ 14 case motor_dol', () => {
    const text = readFileSync(
      fileURLToPath(new URL('../../golden/motor_dol.golden.yaml', import.meta.url)),
      'utf8',
    );
    const file = parseGoldenYaml(text);
    expect(file.model).toBe('motor_dol');
    expect(file.stepMs).toBe(10);
    expect(file.cases).toHaveLength(14);
  });

  it('t không tăng → GoldenError', () => {
    expect(() =>
      parseGoldenYaml(
        'model: motor_dol\nstepMs: 10\nseed: 42\ncases:\n  - id: x\n    description: x\n    steps:\n      - { t: 100 }\n      - { t: 90 }\n',
      ),
    ).toThrow(GoldenError);
  });

  it('gap không phải bội số stepMs → GoldenError', () => {
    expect(() =>
      parseGoldenYaml(
        'model: motor_dol\nstepMs: 10\nseed: 42\ncases:\n  - id: x\n    description: x\n    steps:\n      - { t: 0 }\n      - { t: 15 }\n',
      ),
    ).toThrow(GoldenError);
  });

  it('file không có case → GoldenError', () => {
    expect(() => parseGoldenYaml('model: motor_dol\nstepMs: 10\nseed: 42\ncases: []\n')).toThrow(
      GoldenError,
    );
  });

  it('trùng id case → GoldenError', () => {
    expect(() =>
      parseGoldenYaml(
        'model: motor_dol\nstepMs: 10\nseed: 42\ncases:\n  - id: dup\n    description: a\n    steps:\n      - { t: 0 }\n  - id: dup\n    description: b\n    steps:\n      - { t: 0 }\n',
      ),
    ).toThrow(GoldenError);
  });

  it('YAML sai cú pháp → GoldenError', () => {
    expect(() => parseGoldenYaml('model: [unclosed\n')).toThrow(GoldenError);
  });
});

describe('runPlantGoldenCase (OQ-254/257)', () => {
  it('cmd áp SAU step(t) — bảng A t=100: expect STOPPED, T=110 mới STARTING', () => {
    const ctx = runCtx();
    runPlantGoldenCase(
      ctx,
      miniCase({
        steps: [
          { t: 0, expect: { state: 'STOPPED' } },
          { t: 100, cmd: { runCmd: true }, expect: { state: 'STOPPED' } },
          { t: 110, expect: { state: 'STARTING', speedPct: 0.6667 } },
        ],
      }),
    );
  });

  it('expect key lạ → GoldenError', () => {
    const ctx = runCtx();
    expect(() => {
      runPlantGoldenCase(ctx, miniCase({ steps: [{ t: 0, expect: { khongCo: 1 } }] }));
    }).toThrow(GoldenError);
  });

  it('{approx, eps} ghi đè dung sai mặc định', () => {
    const ctx = runCtx();
    // speedPct ở T=110 là 0.6667 — eps 0.001 vẫn khớp, eps 0.00001 thì trượt
    // (|2/3 − 0.6667| ≈ 0.000033 > 0.00001).
    runPlantGoldenCase(
      ctx,
      miniCase({
        steps: [
          { t: 100, cmd: { runCmd: true } },
          { t: 110, expect: { speedPct: { approx: 0.6667, eps: 0.001 } } },
        ],
      }),
    );
    const ctx2 = runCtx();
    expect(() => {
      runPlantGoldenCase(
        ctx2,
        miniCase({
          steps: [
            { t: 100, cmd: { runCmd: true } },
            { t: 110, expect: { speedPct: { approx: 0.6667, eps: 0.00001 } } },
          ],
        }),
      );
    }).toThrow(GoldenError);
  });

  it('số lệch quá 0.01 → GoldenError (dung sai không che lệch 1 bước)', () => {
    const ctx = runCtx();
    expect(() => {
      runPlantGoldenCase(
        ctx,
        miniCase({
          steps: [
            { t: 100, cmd: { runCmd: true } },
            { t: 110, expect: { speedPct: 0.7 } },
          ],
        }),
      );
    }).toThrow(GoldenError);
  });

  it('clear lỗi chưa từng inject → GoldenError', () => {
    const ctx = runCtx();
    expect(() => {
      runPlantGoldenCase(ctx, miniCase({ steps: [{ t: 100, fault: { clear: 'overload' } }] }));
    }).toThrow(GoldenError);
  });

  it('durationMs với preset → GoldenError', () => {
    const ctx = runCtx();
    expect(() => {
      runPlantGoldenCase(
        ctx,
        miniCase({
          steps: [{ t: 0, fault: { preset: 'overloadTrip' }, durationMs: 100 }],
        }),
      );
    }).toThrow(GoldenError);
  });

  it('fault dạng signal {role, type, params} áp được (stuck runFb)', () => {
    const ctx = runCtx();
    runPlantGoldenCase(
      ctx,
      miniCase({
        steps: [
          {
            t: 100,
            cmd: { runCmd: true },
            fault: { signal: { role: 'runFb', type: 'stuck', params: { value: false } } },
          },
          { t: 610, expect: { state: 'RUNNING', runFb: false, speedPct: 34 } },
        ],
      }),
    );
  });

  it('fault equipment + clear theo tên hoạt động (overload → TRIPPED → reset)', () => {
    const ctx = runCtx();
    runPlantGoldenCase(
      ctx,
      miniCase({
        steps: [
          { t: 100, cmd: { runCmd: true } },
          { t: 700, fault: { id: 'overload' }, expect: { state: 'RUNNING' } },
          { t: 710, expect: { state: 'TRIPPED' } },
          { t: 1000, fault: { clear: 'overload' }, expect: { state: 'TRIPPED' } },
          { t: 1200, cmd: { runCmd: false } },
          { t: 2000, expect: { state: 'STOPPED' } },
        ],
      }),
    );
  });

  it('cmd AO viết bằng eng, đổi sang raw theo scaling tag (OQ-299)', () => {
    const setup = makeModelSetup('motor_vfd', { stepMs: 10, seed: 42 });
    const ctx: GoldenRunContext = {
      engine: setup.engine,
      tags: setup.tags,
      equipmentId: modelEquipmentId('motor_vfd'),
      signals: setup.signals,
      defs: setup.defMap,
      stepMs: 10,
    };
    runPlantGoldenCase(ctx, {
      id: 'ao-eng',
      description: 'cmd speedRef eng 50 → raw 13824 → model thấy 50',
      steps: [
        { t: 100, cmd: { runCmd: true, speedRef: 50 }, expect: { state: 'STOPPED' } },
        { t: 110, expect: { state: 'RAMP_UP', speedPct: 0.1, targetPct: 50 } },
      ],
    });
    // Tag speedRef giữ raw 13824 (50% của 0..27648).
    const refH = setup.handles['speedRef'] as TagHandle;
    expect(setup.tags.get(refH)).toBe(13824);
  });

  it('fault equipment có params đi qua engine (speedDeviation pct)', () => {
    const setup = makeModelSetup('motor_vfd', { stepMs: 10, seed: 42 });
    const ctx: GoldenRunContext = {
      engine: setup.engine,
      tags: setup.tags,
      equipmentId: modelEquipmentId('motor_vfd'),
      signals: setup.signals,
      defs: setup.defMap,
      stepMs: 10,
    };
    runPlantGoldenCase(ctx, {
      id: 'eq-params',
      description: 'speedDeviation pct=10 lệch target 50→60',
      steps: [
        { t: 100, cmd: { runCmd: true, speedRef: 50 } },
        { t: 200, fault: { id: 'speedDeviation', params: { pct: 10 } } },
        { t: 300, expect: { targetPct: 60, speedPct: 2 } },
      ],
    });
  });
});
