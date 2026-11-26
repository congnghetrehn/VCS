// PlantEngine (M2 §5, bảng D) — validate, step tất định, lỗi, snapshot/restore.

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { PL_CATALOG } from '@vcs/schemas';
import { ManualClock, TagDB, TraceHasher, type TagDBSnapshot, type TagHandle } from '@vcs/kernel';
import type { EquipmentInstance, SourceSpec, TagDef } from '@vcs/schemas';

import { PlantEngine, validatePlantConfig, type PlantConfig, type PlantSnapshot } from './engine.js';
// Import qua package entry để side-effect đăng ký 9 model thật vào
// defaultRegistry chạy (models/index.ts) — test mix dùng model thật.
import './index.js';
import {
  createModelRegistry,
  defaultRegistry,
  deriveModel,
  type EquipmentModel,
  type ModelRegistry,
} from './registry.js';
import {
  fakeMotorModel,
  fakeSensorModel,
  makeMotorSetup,
  motorTagDefs,
  runSteps,
  sensorTagDefs,
} from './test-helpers.js';

/** Cấu hình motor chuẩn + registry có fake_motor/fake_sensor. */
function motorWorld(mut?: (cfg: PlantConfig) => void): {
  cfg: PlantConfig;
  tags: TagDB;
  models: ModelRegistry;
} {
  const defs = motorTagDefs();
  const tags = new TagDB(defs, new ManualClock());
  const models = createModelRegistry();
  models.register(fakeMotorModel);
  models.register(fakeSensorModel);
  const cfg: PlantConfig = {
    stepMs: 10,
    seed: 42,
    equipment: [
      {
        id: 'CR01_M01',
        model: 'fake_motor',
        params: { startDelayMs: 500 },
        signals: {
          runCmd: 'CR01_M01_RUN_CMD',
          runFb: 'CR01_M01_RUN_FB',
          currentFb: 'CR01_M01_CUR',
        },
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
  mut?.(cfg);
  return { cfg, tags, models };
}

function codes(diags: { code: string }[]): string[] {
  return diags.map((d) => d.code);
}

function mustHandle(tags: TagDB, name: string): TagHandle {
  const h = tags.handle(name);
  if (h === undefined) throw new Error(`test: tag ${name} không tồn tại.`);
  return h;
}

describe('PL_CATALOG', () => {
  it('8 mã PL (58 → 74 mã tổng; PL-W010 đăng ký ở P2.6 commit 3, OQ-359)', () => {
    expect(PL_CATALOG.codes()).toEqual([
      'PL-E001',
      'PL-E002',
      'PL-E003',
      'PL-E012',
      'PL-E020',
      'PL-W001',
      'PL-W010',
      'PL-W020',
    ]);
  });
});

describe('validatePlantConfig', () => {
  it('cấu hình chuẩn → không diagnostic', () => {
    const { cfg, models } = motorWorld();
    expect(validatePlantConfig(cfg, cfg.tags, models)).toEqual([]);
  });

  it('model không tồn tại → PL-E001', () => {
    const { cfg, models } = motorWorld((c) => {
      (c.equipment[0] as EquipmentInstance).model = 'ghost';
    });
    expect(codes(validatePlantConfig(cfg, cfg.tags, models))).toContain('PL-E001');
  });

  it('trùng id thiết bị → PL-E001', () => {
    const { cfg, models } = motorWorld((c) => {
      const first = c.equipment[0];
      if (first === undefined) throw new Error('test: thiếu thiết bị.');
      c.equipment.push({ ...first });
    });
    expect(codes(validatePlantConfig(cfg, cfg.tags, models))).toContain('PL-E001');
  });

  it('link target không tồn tại → PL-E001', () => {
    const { cfg, models } = motorWorld((c) => {
      c.equipment.push({
        id: 'CR01_TT01',
        model: 'fake_sensor',
        signals: { value: 'CR01_TT01' },
        source: { kind: 'link', equipment: 'GHOST', observable: 'current' },
      });
      c.tags.set('CR01_TT01', sensorTagDefs()[0] as TagDef);
    });
    expect(codes(validatePlantConfig(cfg, cfg.tags, models))).toContain('PL-E001');
  });

  it('link observable không khai báo → PL-E001', () => {
    const { cfg, models } = motorWorld((c) => {
      c.equipment.push({
        id: 'CR01_TT01',
        model: 'fake_sensor',
        signals: { value: 'CR01_TT01' },
        source: { kind: 'link', equipment: 'CR01_M01', observable: 'bogus' },
      });
      c.tags.set('CR01_TT01', sensorTagDefs()[0] as TagDef);
    });
    expect(codes(validatePlantConfig(cfg, cfg.tags, models))).toContain('PL-E001');
  });

  it('role không khai báo trong signals → PL-E001', () => {
    const { cfg, models } = motorWorld((c) => {
      (c.equipment[0] as EquipmentInstance).signals = {
        runCmd: 'CR01_M01_RUN_CMD',
        bogusRole: 'CR01_M01_CUR',
      };
    });
    expect(codes(validatePlantConfig(cfg, cfg.tags, models))).toContain('PL-E001');
  });

  it('tag không tồn tại → TAG-E003', () => {
    const { cfg, models } = motorWorld((c) => {
      (c.equipment[0] as EquipmentInstance).signals = {
        runCmd: 'CR01_M01_RUN_CMD',
        runFb: 'CR01_M01_RUN_FB',
        currentFb: 'NO_SUCH_TAG',
      };
    });
    expect(codes(validatePlantConfig(cfg, cfg.tags, models))).toContain('TAG-E003');
  });

  it('kind mismatch (tag DI gán cho role AI) → PL-E002', () => {
    const { cfg, models } = motorWorld((c) => {
      (c.equipment[0] as EquipmentInstance).signals = {
        runCmd: 'CR01_M01_RUN_CMD',
        runFb: 'CR01_M01_RUN_FB',
        currentFb: 'CR01_M01_RUN_FB',
      };
    });
    expect(codes(validatePlantConfig(cfg, cfg.tags, models))).toContain('PL-E002');
  });

  it('thiếu tag bắt buộc → PL-E003', () => {
    const { cfg, models } = motorWorld((c) => {
      (c.equipment[0] as EquipmentInstance).signals = {
        runCmd: 'CR01_M01_RUN_CMD',
        currentFb: 'CR01_M01_CUR',
      };
    });
    expect(codes(validatePlantConfig(cfg, cfg.tags, models))).toContain('PL-E003');
  });

  it('analog không resolve được range (unit bar, không scaling/params) → PL-E012', () => {
    const { cfg, models } = motorWorld();
    const barModel = deriveModel(fakeSensorModel, {
      type: 'fake_bar',
      roles: [
        {
          role: 'value',
          kind: 'AI',
          dataType: 'Int',
          unit: 'bar',
          description: 'Áp suất bar',
          synonyms: [],
          descKeywords: [],
        },
      ],
    });
    models.register(barModel);
    cfg.equipment.push({
      id: 'CR01_PT01',
      model: 'fake_bar',
      signals: { value: 'CR01_TT01' },
    });
    cfg.tags.set('CR01_TT01', sensorTagDefs()[0] as TagDef);
    expect(codes(validatePlantConfig(cfg, cfg.tags, models))).toContain('PL-E012');
  });

  it('chu trình link → PL-E020', () => {
    const tagA: TagDef = { name: 'TT_A', type: 'Int', area: 'I', address: '%IW66', controller: 'PLC1', signal: { kind: 'AI' } };
    const tagB: TagDef = { name: 'TT_B', type: 'Int', area: 'I', address: '%IW68', controller: 'PLC1', signal: { kind: 'AI' } };
    const models = createModelRegistry();
    models.register(fakeSensorModel);
    const tagMap = new Map<string, TagDef>([
      ['TT_A', tagA],
      ['TT_B', tagB],
    ]);
    const cfg: PlantConfig = {
      stepMs: 10,
      seed: 1,
      equipment: [
        {
          id: 'A',
          model: 'fake_sensor',
          signals: { value: 'TT_A' },
          source: { kind: 'link', equipment: 'B', observable: 'raw' },
        },
        {
          id: 'B',
          model: 'fake_sensor',
          signals: { value: 'TT_B' },
          source: { kind: 'link', equipment: 'A', observable: 'raw' },
        },
      ],
      tags: tagMap,
    };
    const diags = validatePlantConfig(cfg, cfg.tags, models);
    expect(codes(diags)).toContain('PL-E020');
    expect(diags.find((d) => d.code === 'PL-E020')?.message).toContain('A');
  });

  it('tự link → PL-E020', () => {
    const tagA: TagDef = { name: 'TT_A', type: 'Int', area: 'I', address: '%IW66', controller: 'PLC1', signal: { kind: 'AI' } };
    const models = createModelRegistry();
    models.register(fakeSensorModel);
    const cfg: PlantConfig = {
      stepMs: 10,
      seed: 1,
      equipment: [
        {
          id: 'A',
          model: 'fake_sensor',
          signals: { value: 'TT_A' },
          source: { kind: 'link', equipment: 'A', observable: 'raw' },
        },
      ],
      tags: new Map([['TT_A', tagA]]),
    };
    const diags = validatePlantConfig(cfg, cfg.tags, models);
    expect(codes(diags)).toContain('PL-E020');
  });

  it('2 role cùng tag → PL-E001 (lệch plan: plan ghi PL-E003, nhưng PL-E003 nghĩa là "thiếu tag")', () => {
    const tagA: TagDef = { name: 'TT_A', type: 'Int', area: 'I', address: '%IW66', controller: 'PLC1', signal: { kind: 'AI' } };
    const models = createModelRegistry();
    models.register(fakeSensorModel);
    const cfg: PlantConfig = {
      stepMs: 10,
      seed: 1,
      equipment: [
        { id: 'A', model: 'fake_sensor', signals: { value: 'TT_A' } },
        { id: 'B', model: 'fake_sensor', signals: { value: 'TT_A' } },
      ],
      tags: new Map([['TT_A', tagA]]),
    };
    const diags = validatePlantConfig(cfg, cfg.tags, models);
    expect(codes(diags)).toEqual(['PL-E001']);
  });

  it('plcScanMs (OQ-244): < stepMs → PL-W001; ≥ stepMs → không cảnh báo; vắng → không kiểm', () => {
    const low = motorWorld((c) => {
      c.plcScanMs = 5;
    });
    expect(codes(validatePlantConfig(low.cfg, low.cfg.tags, low.models))).toContain('PL-W001');
    const ok = motorWorld((c) => {
      c.plcScanMs = 10;
    });
    expect(codes(validatePlantConfig(ok.cfg, ok.cfg.tags, ok.models))).toEqual([]);
    const absent = motorWorld();
    expect(codes(validatePlantConfig(absent.cfg, absent.cfg.tags, absent.models))).toEqual([]);
  });

  it('tag Real → PL-W020 1 lần/tag ở validate (OQ-239)', () => {
    const realModel = deriveModel(fakeSensorModel, {
      type: 'fake_real',
      roles: [
        {
          role: 'value',
          kind: 'AI',
          dataType: 'Real',
          unit: '%',
          description: 'Giá trị đo % (Real)',
          synonyms: [],
          descKeywords: [],
        },
      ],
    });
    const models = createModelRegistry();
    models.register(realModel);
    const tagR: TagDef = { name: 'TT_R', type: 'Real', area: 'I', address: '%ID64', controller: 'PLC1', signal: { kind: 'AI' } };
    const cfg: PlantConfig = {
      stepMs: 10,
      seed: 1,
      equipment: [{ id: 'R', model: 'fake_real', signals: { value: 'TT_R' } }],
      tags: new Map([['TT_R', tagR]]),
    };
    const diags = validatePlantConfig(cfg, cfg.tags, models);
    expect(codes(diags)).toEqual(['PL-W020']);
    expect(diags[0]?.severity).toBe('warning');
  });

  it('role optional chưa gán → chỉ PL-W001 (warning), engine vẫn chạy', () => {
    const { cfg, tags, models } = motorWorld((c) => {
      (c.equipment[0] as EquipmentInstance).signals = {
        runCmd: 'CR01_M01_RUN_CMD',
        runFb: 'CR01_M01_RUN_FB',
      };
    });
    const diags = validatePlantConfig(cfg, cfg.tags, models);
    expect(codes(diags)).toEqual(['PL-W001']);
    expect(diags[0]?.severity).toBe('warning');
    const engine = new PlantEngine(cfg, tags, models);
    runSteps(engine, tags, 0, 10);
    expect(tags.get(mustHandle(tags, 'CR01_M01_RUN_FB'))).toBe(false);
  });

  it('stepMs 0 → PRJ-E007', () => {
    const { cfg, models } = motorWorld((c) => {
      c.stepMs = 0;
    });
    expect(codes(validatePlantConfig(cfg, cfg.tags, models))).toContain('PRJ-E007');
  });

  it('params sai schema → PL-E001', () => {
    const { cfg, models } = motorWorld((c) => {
      (c.equipment[0] as EquipmentInstance).params = { startDelayMs: -1 };
    });
    expect(codes(validatePlantConfig(cfg, cfg.tags, models))).toContain('PL-E001');
  });

  it('constructor fail-fast: cấu hình lỗi → throw kèm mã đầu tiên', () => {
    const { cfg, tags, models } = motorWorld((c) => {
      (c.equipment[0] as EquipmentInstance).model = 'ghost';
    });
    expect(() => new PlantEngine(cfg, tags, models)).toThrow('PL-E001');
  });
});

describe('PlantEngine step (bảng D)', () => {
  it('id = plant; runCmd=1 tại T=100 → runFb=0 tại 590, =1 tại 600; currentFb raw 11612', () => {
    const { engine, tags, cmdH, fbH, curH } = makeMotorSetup();
    expect(engine.id).toBe('plant');
    for (let t = 0; t <= 600; t += 10) {
      if (t === 100) tags.set(cmdH, true, 'plc');
      engine.step(t, 10);
      tags.flush();
      if (t === 590) {
        expect(tags.get(fbH)).toBe(false);
        expect(tags.get(curH)).toBe(0);
      }
      if (t === 600) {
        expect(tags.get(fbH)).toBe(true);
        expect(tags.get(curH)).toBe(11612);
      }
    }
  });

  it('runCmd=0 cả quá trình → runFb luôn 0, currentFb luôn 0', () => {
    const { engine, tags, fbH, curH } = makeMotorSetup();
    runSteps(engine, tags, 0, 600);
    expect(tags.get(fbH)).toBe(false);
    expect(tags.get(curH)).toBe(0);
  });

  it('tag DI/AI thuộc plant; DO vẫn thuộc controller; ghi ngoài bị từ chối (TAG-E002)', () => {
    const { tags, fbH, curH, cmdH } = makeMotorSetup();
    expect(tags.owner(fbH)).toBe('plant');
    expect(tags.owner(curH)).toBe('plant');
    expect(tags.owner(cmdH)).toBe('controller');
    expect(tags.checkWrite(fbH, 'test')).toBe('denied');
    expect(() => { tags.set(fbH, true, 'test'); }).toThrow('TAG-E002');
    expect(tags.checkWrite(cmdH, 'plc')).toBe('ok');
  });

  it('getState/getObservable; lỗi khi id/key lạ', () => {
    const { engine, tags } = makeMotorSetup();
    runSteps(engine, tags, 0, 0);
    expect(() => engine.getState('GHOST')).toThrow('không tồn tại');
    expect(() => engine.getObservable('CR01_M01', 'bogus')).toThrow('không khai báo');
    expect(engine.getObservable('CR01_M01', 'running')).toBe(false);
  });
});

describe('PlantEngine source', () => {
  function sensorWorld(source?: SourceSpec, tauMs = 0): {
    engine: PlantEngine;
    tags: TagDB;
    h: TagHandle;
  } {
    const defs = sensorTagDefs();
    const tags = new TagDB(defs, new ManualClock());
    const models = createModelRegistry();
    models.register(fakeSensorModel);
    const inst: EquipmentInstance = {
      id: 'CR01_TT01',
      model: 'fake_sensor',
      params: { tauMs },
      signals: { value: 'CR01_TT01' },
    };
    if (source !== undefined) inst.source = source;
    const cfg: PlantConfig = {
      stepMs: 10,
      seed: 7,
      equipment: [inst],
      tags: new Map(defs.map((d) => [d.name, d])),
    };
    return { engine: new PlantEngine(cfg, tags, models), tags, h: mustHandle(tags, 'CR01_TT01') };
  }

  it('const 50 → raw 13824', () => {
    const { engine, tags, h } = sensorWorld({ kind: 'const', value: 50 });
    runSteps(engine, tags, 0, 10);
    expect(tags.get(h)).toBe(13824);
  });

  it('ramp 0→100 trong 1000ms: T=500 → 50% → 13824', () => {
    const { engine, tags, h } = sensorWorld({ kind: 'ramp', from: 0, to: 100, durationMs: 1000 });
    runSteps(engine, tags, 0, 500);
    expect(tags.get(h)).toBe(13824);
  });

  it('sine period 1000, amp 10, offset 50: T=250 → 60% → 16589', () => {
    const { engine, tags, h } = sensorWorld({ kind: 'sine', periodMs: 1000, amplitude: 10, offset: 50 });
    runSteps(engine, tags, 0, 250);
    expect(tags.get(h)).toBe(16589);
  });

  it('setManual(75) → 75% → 20736; setSource đổi nguồn từ thời điểm set', () => {
    const { engine, tags, h } = sensorWorld({ kind: 'const', value: 0 });
    engine.setManual('CR01_TT01', 75);
    runSteps(engine, tags, 0, 10);
    expect(tags.get(h)).toBe(20736);
    engine.setSource('CR01_TT01', { kind: 'ramp', from: 0, to: 100, durationMs: 1000 });
    runSteps(engine, tags, 20, 510);
    expect(tags.get(h)).toBe(13824);
  });

  it('setSource/setManual trên model không có source → throw', () => {
    const { engine } = makeMotorSetup();
    expect(() => { engine.setSource('CR01_M01', { kind: 'const', value: 1 }); }).toThrow('không có source');
    expect(() => { engine.setManual('CR01_M01', 1); }).toThrow('không có source');
  });

  it('link: sensor đọc current của motor — topo chạy motor trước dù khai báo sau', () => {
    const defs = [...motorTagDefs(), ...sensorTagDefs()];
    const tags = new TagDB(defs, new ManualClock());
    const models = createModelRegistry();
    models.register(fakeMotorModel);
    models.register(fakeSensorModel);
    const cfg: PlantConfig = {
      stepMs: 10,
      seed: 42,
      equipment: [
        {
          id: 'CR01_TT01',
          model: 'fake_sensor',
          signals: { value: 'CR01_TT01' },
          source: { kind: 'link', equipment: 'CR01_M01', observable: 'current' },
        },
        {
          id: 'CR01_M01',
          model: 'fake_motor',
          params: { startDelayMs: 500 },
          signals: {
            runCmd: 'CR01_M01_RUN_CMD',
            runFb: 'CR01_M01_RUN_FB',
            currentFb: 'CR01_M01_CUR',
          },
        },
      ],
      tags: new Map(defs.map((d) => [d.name, d])),
    };
    const engine = new PlantEngine(cfg, tags, models);
    const cmdH = mustHandle(tags, 'CR01_M01_RUN_CMD');
    const ttH = mustHandle(tags, 'CR01_TT01');
    for (let t = 0; t <= 600; t += 10) {
      if (t === 100) tags.set(cmdH, true, 'plc');
      engine.step(t, 10);
      tags.flush();
      if (t === 590) expect(tags.get(ttH)).toBe(0);
      if (t === 600) expect(tags.get(ttH)).toBe(11612);
    }
    expect(engine.getObservable('CR01_TT01', 'raw')).toBe(42);
  });

  it('lag τ=500: sensor đuổi theo const 100, T=10 → ≈1.98% → raw 547', () => {
    const { engine, tags, h } = sensorWorld({ kind: 'const', value: 100 }, 500);
    engine.step(0, 10);
    tags.flush();
    // y = 100·(1−e^(−0.02)) ≈ 1.9801 → raw round(1.9801/100·27648) = 547.
    expect(tags.get(h)).toBe(547);
  });
});

describe('PlantEngine faults', () => {
  it('injectFault sai: thiết bị/role/lỗi lạ, kind không hợp, stuck sai kiểu', () => {
    const { engine } = makeMotorSetup();
    expect(() =>
      engine.injectFault({ target: { equipment: 'GHOST', fault: 'noStart' }, when: { at: 'now' } }),
    ).toThrow('PL-E001');
    expect(() =>
      engine.injectFault({
        target: { equipment: 'CR01_M01', signal: 'bogus', type: 'stuck' },
        when: { at: 'now' },
      }),
    ).toThrow('PL-E001');
    expect(() =>
      engine.injectFault({
        target: { equipment: 'CR01_M01', signal: 'runFb', type: 'gain' },
        when: { at: 'now' },
      }),
    ).toThrow('không áp dụng');
    expect(() =>
      engine.injectFault({
        target: { equipment: 'CR01_M01', signal: 'currentFb', type: 'stuck' },
        when: { at: 'now' },
        params: { value: true },
      }),
    ).toThrow('phải là number');
    expect(() =>
      engine.injectFault({ target: { equipment: 'CR01_M01', fault: 'bogus' }, when: { at: 'now' } }),
    ).toThrow('PL-E001');
    expect(() =>
      engine.injectFault({
        target: { equipment: 'CR01_M01', fault: 'overload' },
        when: { at: 'now' },
        params: { limit: 'high' },
      }),
    ).toThrow('không hợp lệ');
  });

  it("injectFault hợp lệ trả F-0001; listFaults thấy nó", () => {
    const { engine } = makeMotorSetup();
    const id = engine.injectFault({
      target: { equipment: 'CR01_M01', signal: 'currentFb', type: 'gain' },
      when: { at: 'now' },
      params: { factor: 2 },
    });
    expect(id).toBe('F-0001');
    expect(engine.listFaults()).toHaveLength(1);
    expect(engine.listFaults()[0]?.state).toBe('pending');
  });

  it('noStart chặn khởi động; clearFault xong chạy tiếp', () => {
    const { engine, tags, cmdH, fbH } = makeMotorSetup();
    const id = engine.injectFault({ target: { equipment: 'CR01_M01', fault: 'noStart' }, when: { at: 'now' } });
    for (let t = 0; t <= 600; t += 10) {
      if (t === 100) tags.set(cmdH, true, 'plc');
      if (t === 400) expect(engine.clearFault(id)).toBe(true);
      engine.step(t, 10);
      tags.flush();
    }
    expect(tags.get(fbH)).toBe(true);
  });

  it('clearFault(id, atMs): clearedAtMs đúng thời điểm truyền vào', () => {
    const { engine } = makeMotorSetup();
    const id = engine.injectFault({ target: { equipment: 'CR01_M01', fault: 'noStart' }, when: { at: 'now' } });
    expect(engine.clearFault(id, 500)).toBe(true);
    expect(engine.listFaults()[0]?.clearedAtMs).toBe(500);
    expect(engine.listFaults()[0]?.state).toBe('cleared');
    // Mặc định (không atMs): dùng #simTimeMs hiện tại (0 trước bước đầu).
    const id2 = engine.injectFault({ target: { equipment: 'CR01_M01', fault: 'noStart' }, when: { at: 'now' } });
    expect(engine.clearFault(id2)).toBe(true);
    expect(engine.listFaults()[1]?.clearedAtMs).toBe(0);
  });

  it('preset stuckOn: runFb=1 ngay từ đầu', () => {
    const { engine, tags, fbH } = makeMotorSetup();
    engine.applyPreset('CR01_M01', 'stuckOn');
    runSteps(engine, tags, 0, 10);
    expect(tags.get(fbH)).toBe(true);
    expect(() => engine.applyPreset('CR01_M01', 'bogus')).toThrow('không tồn tại');
  });

  it('preset noRunFeedback: runFb=0 dù motor chạy trong (currentFb 11612)', () => {
    const { engine, tags, cmdH, fbH, curH } = makeMotorSetup();
    engine.applyPreset('CR01_M01', 'noRunFeedback');
    for (let t = 0; t <= 600; t += 10) {
      if (t === 100) tags.set(cmdH, true, 'plc');
      engine.step(t, 10);
      tags.flush();
    }
    expect(tags.get(fbH)).toBe(false);
    expect(tags.get(curH)).toBe(11612);
  });

  it('gain ×2 trên currentFb: chạy → 84% → raw 23224', () => {
    const { engine, tags, cmdH, curH } = makeMotorSetup();
    engine.injectFault({
      target: { equipment: 'CR01_M01', signal: 'currentFb', type: 'gain' },
      when: { at: 'now' },
      params: { factor: 2 },
    });
    for (let t = 0; t <= 600; t += 10) {
      if (t === 100) tags.set(cmdH, true, 'plc');
      engine.step(t, 10);
      tags.flush();
    }
    expect(tags.get(curH)).toBe(23224);
  });

  it('wireBreak trên currentFb: raw 32767 khi chạy', () => {
    const { engine, tags, cmdH, curH } = makeMotorSetup();
    engine.injectFault({
      target: { equipment: 'CR01_M01', signal: 'currentFb', type: 'wireBreak' },
      when: { at: 'now' },
    });
    for (let t = 0; t <= 600; t += 10) {
      if (t === 100) tags.set(cmdH, true, 'plc');
      engine.step(t, 10);
      tags.flush();
    }
    expect(tags.get(curH)).toBe(32767);
  });

  it('delay 25ms trên runFb: lật ở T=630 thay vì 600', () => {
    const { engine, tags, cmdH, fbH } = makeMotorSetup();
    engine.injectFault({
      target: { equipment: 'CR01_M01', signal: 'runFb', type: 'delay' },
      when: { at: 'now' },
      params: { delayMs: 25 },
    });
    for (let t = 0; t <= 630; t += 10) {
      if (t === 100) tags.set(cmdH, true, 'plc');
      engine.step(t, 10);
      tags.flush();
      if (t === 620) expect(tags.get(fbH)).toBe(false);
      if (t === 630) expect(tags.get(fbH)).toBe(true);
    }
  });

  it('freeze currentFb từ T=500 (giá trị 0) → vẫn 0 ở T=600', () => {
    const { engine, tags, cmdH, curH } = makeMotorSetup();
    engine.injectFault({
      target: { equipment: 'CR01_M01', signal: 'currentFb', type: 'freeze' },
      when: { at: 'time', timeMs: 500 },
    });
    for (let t = 0; t <= 600; t += 10) {
      if (t === 100) tags.set(cmdH, true, 'plc');
      engine.step(t, 10);
      tags.flush();
    }
    expect(tags.get(curH)).toBe(0);
  });
});

describe('PlantEngine events / snapshot / reset (bảng D)', () => {
  it('event state khi running/current đổi; event fault khi bật/hết hạn', () => {
    const { engine, tags, cmdH } = makeMotorSetup();
    engine.injectFault({
      target: { equipment: 'CR01_M01', signal: 'currentFb', type: 'offset' },
      when: { at: 'now' },
      durationMs: 100,
      params: { offset: 1 },
    });
    for (let t = 0; t <= 600; t += 10) {
      if (t === 100) tags.set(cmdH, true, 'plc');
      engine.step(t, 10);
      tags.flush();
    }
    const evs = engine.events();
    const states = evs.filter((e) => e.type === 'state' && e.key === 'running');
    expect(states).toHaveLength(1);
    expect(states[0]?.t).toBe(600);
    expect(states[0]?.from).toBe(false);
    expect(states[0]?.to).toBe(true);
    const faults = evs.filter((e) => e.type === 'fault');
    expect(faults).toHaveLength(2);
    expect(faults[0]?.t).toBe(0);
    expect(faults[1]?.t).toBe(100);
  });

  it('determinism (bảng D): restore tại T=300 rồi chạy lại → TraceHasher giống hệt', () => {
    const { engine, tags, cmdH } = makeMotorSetup();
    let snapPlant: PlantSnapshot | undefined;
    let snapTags: TagDBSnapshot | undefined;
    let hasher1: TraceHasher | undefined;
    for (let t = 0; t <= 600; t += 10) {
      if (t === 100) tags.set(cmdH, true, 'plc');
      engine.step(t, 10);
      tags.flush();
      if (t === 300) {
        snapPlant = engine.snapshot();
        snapTags = tags.snapshot();
        hasher1 = new TraceHasher(tags);
      }
    }
    const hash1 = (hasher1 as TraceHasher).hash();
    expect(hash1).toHaveLength(64);
    expect(hash1).not.toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    (hasher1 as TraceHasher).dispose();
    engine.restore(snapPlant);
    tags.restore(snapTags as TagDBSnapshot);
    // Restore giữ baseline flush cũ nên flush sau restore phát thay đổi "ảo"
    // (giá trị T=600 → T=300); xả trước khi tạo hasher2 để baseline về T=300.
    tags.flush();
    const hasher2 = new TraceHasher(tags);
    for (let t = 310; t <= 600; t += 10) {
      engine.step(t, 10);
      tags.flush();
    }
    expect(hasher2.hash()).toBe(hash1);
  });

  it('restore snapshot lạ → throw SIM-E003', () => {
    const { engine } = makeMotorSetup();
    expect(() => { engine.restore({ version: 2 }); }).toThrow('SIM-E003');
    expect(() => { engine.restore(null); }).toThrow('SIM-E003');
  });

  it('reset: chạy lại cùng kịch bản → cùng kết quả cuối', () => {
    const { engine, tags, cmdH, fbH, curH } = makeMotorSetup();
    const scenario = (): void => {
      for (let t = 0; t <= 600; t += 10) {
        if (t === 100) tags.set(cmdH, true, 'plc');
        engine.step(t, 10);
        tags.flush();
      }
    };
    scenario();
    const first = { fb: tags.get(fbH), cur: tags.get(curH), events: engine.events().length };
    engine.reset();
    tags.reset();
    scenario();
    expect(tags.get(fbH)).toBe(first.fb);
    expect(tags.get(curH)).toBe(first.cur);
    expect(engine.events().length).toBe(first.events);
  });

  it('validate() của engine trả lại diagnostics hiện tại', () => {
    const { engine } = makeMotorSetup();
    expect(engine.validate()).toEqual([]);
  });
});

/** Model thăm dò kênh (P2.4 commit 4): AO/Real + AI/Int có scaling + AI/Real + DI optional chưa gán. */
interface ProbeParams {
  echoMeas: number;
}
interface ProbeState {
  n: number;
}
const probeModel: EquipmentModel<ProbeParams, ProbeState> = {
  type: 'probe',
  version: '0.1.0',
  description: 'Model thăm dò kênh (test commit 4).',
  roles: [
    { role: 'ref', kind: 'AO', dataType: 'Real', description: 'Tham chiếu Real', synonyms: [], descKeywords: [] },
    { role: 'meas', kind: 'AI', dataType: 'Int', unit: '%', description: 'Đo Int có scaling', synonyms: [], descKeywords: [] },
    { role: 'speed', kind: 'AI', dataType: 'Real', description: 'Tốc độ Real', synonyms: [], descKeywords: [] },
    { role: 'opt', kind: 'DI', dataType: 'Bool', optional: true, description: 'Tùy chọn chưa gán', synonyms: [], descKeywords: [] },
  ],
  paramsSchema: z.object({ echoMeas: z.number() }),
  defaultParams: { echoMeas: 25 },
  observables: [
    { key: 'refSeen', description: 'ref đọc qua cmd' },
    { key: 'measSeen', description: 'meas đọc qua cmd' },
    { key: 'hasOpt', description: 'opt có gán không' },
  ],
  faults: [],
  init: () => ({ n: 0 }),
  step: (ctx, slots) => {
    const refSlot = slots.role.ref;
    const measSlot = slots.role.meas;
    const speedSlot = slots.role.speed;
    const optSlot = slots.role.opt;
    const refSeenSlot = slots.obs.refSeen;
    const measSeenSlot = slots.obs.measSeen;
    const hasOptSlot = slots.obs.hasOpt;
    ctx.state.n += 1;
    ctx.setObs(refSeenSlot, ctx.cmd(refSlot) ?? -1);
    ctx.setObs(measSeenSlot, ctx.cmd(measSlot) ?? -1);
    ctx.setObs(hasOptSlot, ctx.has(optSlot));
    ctx.emit(measSlot, ctx.params.echoMeas);
    ctx.emit(speedSlot, 33.3);
    ctx.emit(optSlot, true); // chưa gán → no-op, không ném
  },
};

function probeTagDefs(): TagDef[] {
  return [
    { name: 'PRB_REF', type: 'Real', area: 'Q', address: '%QD8', controller: 'PLC1', signal: { kind: 'AO' } },
    {
      name: 'PRB_MEAS',
      type: 'Int',
      area: 'I',
      address: '%IW68',
      controller: 'PLC1',
      signal: {
        kind: 'AI',
        scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: '%' },
      },
    },
    { name: 'PRB_SPEED', type: 'Real', area: 'I', address: '%ID72', controller: 'PLC1', signal: { kind: 'AI' } },
  ];
}

function probeWorld(): { cfg: PlantConfig; tags: TagDB; models: ModelRegistry } {
  const defs = probeTagDefs();
  const tags = new TagDB(defs, new ManualClock());
  const models = createModelRegistry();
  models.register(probeModel);
  const cfg: PlantConfig = {
    stepMs: 10,
    seed: 42,
    equipment: [
      {
        id: 'PRB01',
        model: 'probe',
        signals: { ref: 'PRB_REF', meas: 'PRB_MEAS', speed: 'PRB_SPEED' },
      },
    ],
    tags: new Map(defs.map((d) => [d.name, d])),
  };
  return { cfg, tags, models };
}

describe('channels (P2.4 commit 4 — 4 Map → channels[] + roleSlot)', () => {
  it('role không gán → has false, emit no-op, model vẫn chạy', () => {
    const { cfg, tags, models } = motorWorld((c) => {
      const eq = c.equipment[0];
      if (eq !== undefined) {
        eq.signals = { runCmd: 'CR01_M01_RUN_CMD', runFb: 'CR01_M01_RUN_FB' };
      }
    });
    const engine = new PlantEngine(cfg, tags, models);
    const cmdH = mustHandle(tags, 'CR01_M01_RUN_CMD');
    const fbH = mustHandle(tags, 'CR01_M01_RUN_FB');
    const curH = mustHandle(tags, 'CR01_M01_CUR');
    tags.set(cmdH, true, 'plc');
    runSteps(engine, tags, 0, 600);
    expect(engine.getObservable('CR01_M01', 'running')).toBe(true);
    expect(engine.getObservable('CR01_M01', 'current')).toBe(42);
    expect(tags.get(fbH)).toBe(true);
    // emit currentFb (không gán) là no-op — tag không bị chạm.
    expect(tags.get(curH)).toBe(0);
  });

  it('kind Real — cmd fround, emit eng trực tiếp (không range)', () => {
    const { cfg, tags, models } = probeWorld();
    const engine = new PlantEngine(cfg, tags, models);
    const refH = mustHandle(tags, 'PRB_REF');
    const speedH = mustHandle(tags, 'PRB_SPEED');
    tags.set(refH, 12.5, 'plc');
    runSteps(engine, tags, 0, 10);
    expect(engine.getObservable('PRB01', 'refSeen')).toBe(12.5);
    expect(engine.getObservable('PRB01', 'hasOpt')).toBe(false);
    expect(tags.get(speedH)).toBe(Math.fround(33.3));
  });

  it('kind Int có scaling — cmd rawToEng, emit engToRaw', () => {
    const { cfg, tags, models } = probeWorld();
    const measH = mustHandle(tags, 'PRB_MEAS');
    // Ghi trước khi dựng engine, nguồn 'system' (tag free chỉ cho test/hmi/gateway/system;
    // AI thuộc owner 'plant' sau init nên 'plc' không ghi được cả trước lẫn sau).
    tags.set(measH, 13824, 'system'); // 50 eng
    const engine = new PlantEngine(cfg, tags, models);
    runSteps(engine, tags, 0, 0);
    expect(engine.getObservable('PRB01', 'measSeen')).toBe(50);
    // emit 25 eng → raw 6912.
    expect(tags.get(measH)).toBe(6912);
    runSteps(engine, tags, 10, 10);
    expect(engine.getObservable('PRB01', 'measSeen')).toBe(25);
  });

  it('restore giữ channels: chạy tiếp sau restore cho cùng observable', () => {
    const build = (): { engine: PlantEngine; tags: TagDB } => {
      const { cfg, tags, models } = probeWorld();
      // Ghi trước khi dựng engine, nguồn 'system' (xem ghi chú test Int scaling).
      tags.set(mustHandle(tags, 'PRB_REF'), 12.5, 'system');
      tags.set(mustHandle(tags, 'PRB_MEAS'), 13824, 'system');
      const engine = new PlantEngine(cfg, tags, models);
      return { engine, tags };
    };
    const ref = build();
    runSteps(ref.engine, ref.tags, 0, 90);
    const test = build();
    runSteps(test.engine, test.tags, 0, 40);
    const snap = test.engine.snapshot();
    runSteps(test.engine, test.tags, 50, 90);
    test.engine.restore(snap);
    runSteps(test.engine, test.tags, 50, 90);
    for (const key of ['refSeen', 'measSeen', 'hasOpt']) {
      expect(test.engine.getObservable('PRB01', key)).toBe(ref.engine.getObservable('PRB01', key));
    }
    expect(test.tags.get(mustHandle(test.tags, 'PRB_MEAS'))).toBe(
      ref.tags.get(mustHandle(ref.tags, 'PRB_MEAS')),
    );
    expect(test.tags.get(mustHandle(test.tags, 'PRB_SPEED'))).toBe(
      ref.tags.get(mustHandle(ref.tags, 'PRB_SPEED')),
    );
  });

  it('2 thiết bị cùng model không chia sẻ channels', () => {
    const defs = motorTagDefs();
    const defs2: TagDef[] = defs.map((d) => {
      if (d.name === 'CR01_M01_RUN_CMD') {
        return { ...d, name: 'CR01_M02_RUN_CMD', address: '%Q0.1' };
      }
      if (d.name === 'CR01_M01_RUN_FB') {
        return { ...d, name: 'CR01_M02_RUN_FB', address: '%I0.1' };
      }
      return { ...d, name: 'CR01_M02_CUR', address: '%IW66' };
    });
    const allDefs = [...defs, ...defs2];
    const tags = new TagDB(allDefs, new ManualClock());
    const models = createModelRegistry();
    models.register(fakeMotorModel);
    const cfg: PlantConfig = {
      stepMs: 10,
      seed: 42,
      equipment: [
        {
          id: 'CR01_M01',
          model: 'fake_motor',
          params: { startDelayMs: 500 },
          signals: { runCmd: 'CR01_M01_RUN_CMD', runFb: 'CR01_M01_RUN_FB', currentFb: 'CR01_M01_CUR' },
        },
        {
          id: 'CR01_M02',
          model: 'fake_motor',
          params: { startDelayMs: 500 },
          signals: { runCmd: 'CR01_M02_RUN_CMD', runFb: 'CR01_M02_RUN_FB', currentFb: 'CR01_M02_CUR' },
        },
      ],
      tags: new Map(allDefs.map((d) => [d.name, d])),
    };
    const engine = new PlantEngine(cfg, tags, models);
    // Chỉ M01 có lệnh chạy.
    tags.set(mustHandle(tags, 'CR01_M01_RUN_CMD'), true, 'plc');
    runSteps(engine, tags, 0, 600);
    expect(engine.getObservable('CR01_M01', 'running')).toBe(true);
    expect(engine.getObservable('CR01_M02', 'running')).toBe(false);
    expect(tags.get(mustHandle(tags, 'CR01_M01_RUN_FB'))).toBe(true);
    expect(tags.get(mustHandle(tags, 'CR01_M02_RUN_FB'))).toBe(false);
    expect(tags.get(mustHandle(tags, 'CR01_M02_CUR'))).toBe(0);
  });

  it('determinism engine-alone (OQ-317 mở rộng): config hỗn hợp 2 lần + restore → cùng hash', () => {
    const build = (): { engine: PlantEngine; tags: TagDB; hasher: TraceHasher } => {
      const defs = [...motorTagDefs(), ...sensorTagDefs(), ...probeTagDefs()];
      const tags = new TagDB(defs, new ManualClock());
      const models = createModelRegistry();
      models.register(fakeMotorModel);
      models.register(fakeSensorModel);
      models.register(probeModel);
      const cfg: PlantConfig = {
        stepMs: 10,
        seed: 42,
        equipment: [
          {
            id: 'CR01_M01',
            model: 'fake_motor',
            params: { startDelayMs: 500 },
            signals: { runCmd: 'CR01_M01_RUN_CMD', runFb: 'CR01_M01_RUN_FB', currentFb: 'CR01_M01_CUR' },
          },
          {
            id: 'CR01_TT01',
            model: 'fake_sensor',
            source: { kind: 'const', value: 50 },
            signals: { value: 'CR01_TT01' },
          },
          {
            id: 'PRB01',
            model: 'probe',
            signals: { ref: 'PRB_REF', meas: 'PRB_MEAS', speed: 'PRB_SPEED' },
          },
        ],
        tags: new Map(defs.map((d) => [d.name, d])),
      };
      // PRB_MEAS (AI) phải ghi trước khi dựng engine, nguồn 'system'
      // (thuộc owner 'plant' sau init; tag free cũng không cho 'plc' ghi).
      tags.set(mustHandle(tags, 'PRB_MEAS'), 13824, 'system');
      const engine = new PlantEngine(cfg, tags, models);
      tags.set(mustHandle(tags, 'CR01_M01_RUN_CMD'), true, 'plc');
      tags.set(mustHandle(tags, 'PRB_REF'), 12.5, 'plc');
      return { engine, tags, hasher: new TraceHasher(tags) };
    };
    // A: chạy liền 100 bước, hash đoạn 50→100.
    const a = build();
    runSteps(a.engine, a.tags, 0, 490);
    a.hasher.reset();
    runSteps(a.engine, a.tags, 500, 990);
    const hashA = a.hasher.hash();
    // B: chạy 50, snapshot, chạy 50 → hash đoạn; restore, chạy lại 50 → cùng hash.
    const b = build();
    runSteps(b.engine, b.tags, 0, 490);
    const snapE = b.engine.snapshot();
    const snapT = b.tags.snapshot();
    b.hasher.reset();
    runSteps(b.engine, b.tags, 500, 990);
    const hashB1 = b.hasher.hash();
    b.engine.restore(snapE);
    b.tags.restore(snapT);
    b.tags.flush();
    b.hasher.reset();
    runSteps(b.engine, b.tags, 500, 990);
    const hashB2 = b.hasher.hash();
    expect(hashB1).toBe(hashA);
    expect(hashB2).toBe(hashA);
  });
});

describe('model grouping (P2.4 commit 5 — dispatch đơn hình, OQ-310)', () => {
  it('link chéo model: analog đọc silo cùng bước sau khi nhóm', () => {
    const defs: TagDef[] = [
      {
        name: 'TT01_RAW',
        type: 'Int',
        area: 'I',
        address: '%IW0',
        controller: 'PLC1',
        signal: {
          kind: 'AI',
          scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: '%' },
        },
      },
    ];
    const tags = new TagDB(defs, new ManualClock());
    const cfg: PlantConfig = {
      stepMs: 10,
      seed: 42,
      equipment: [
        // Khai báo ngược thứ tự topo (analog trước silo) — nhóm vẫn xếp silo trước.
        {
          id: 'TT01',
          model: 'analog_sensor',
          params: { engMin: 0, engMax: 100, unit: '%' },
          source: { kind: 'link', equipment: 'SIL01', observable: 'massT' },
          signals: { raw: 'TT01_RAW' },
        },
        {
          id: 'SIL01',
          model: 'silo_bin',
          sources: {
            inflow: { kind: 'const', value: 3600 },
            outflow: { kind: 'const', value: 1800 },
          },
        },
      ],
      tags: new Map(defs.map((d) => [d.name, d])),
    };
    const engine = new PlantEngine(cfg, tags);
    expect(engine.groupedByModel).toBe(true);
    for (let t = 0; t <= 100; t += 10) {
      engine.step(t, 10);
      tags.flush();
      // Analog bước sau silo trong cùng bước T → pv == massT cùng bước
      // (đi trước 1 bước sẽ lệch đúng 0,005 t).
      expect(engine.getObservable('TT01', 'pv')).toBe(engine.getObservable('SIL01', 'massT'));
    }
    expect(engine.getObservable('SIL01', 'massT') as number).toBeGreaterThan(30);
  });

  it('chu trình mức model → fallback topo thiết bị, groupedByModel false, kết quả vẫn đúng', () => {
    const sensor2 = deriveModel(fakeSensorModel, { type: 'fake_sensor2' });
    const defs: TagDef[] = ['A1', 'B1', 'A2', 'B2'].map((id, i) => ({
      name: `TT_${id}`,
      type: 'Int' as const,
      area: 'I' as const,
      address: `%IW${String(i * 2)}`,
      controller: 'PLC1',
      signal: { kind: 'AI' as const },
    }));
    const tags = new TagDB(defs, new ManualClock());
    const models = createModelRegistry();
    models.register(fakeSensorModel);
    models.register(sensor2);
    const cfg: PlantConfig = {
      stepMs: 10,
      seed: 42,
      equipment: [
        // Model DAG: fake_sensor → fake_sensor2 (A1→B1) + ngược lại (B2→A2) = chu trình.
        { id: 'A1', model: 'fake_sensor', source: { kind: 'link', equipment: 'B1', observable: 'raw' }, signals: { value: 'TT_A1' } },
        { id: 'B1', model: 'fake_sensor2', source: { kind: 'const', value: 50 }, signals: { value: 'TT_B1' } },
        { id: 'A2', model: 'fake_sensor', source: { kind: 'const', value: 70 }, signals: { value: 'TT_A2' } },
        { id: 'B2', model: 'fake_sensor2', source: { kind: 'link', equipment: 'A2', observable: 'raw' }, signals: { value: 'TT_B2' } },
      ],
      tags: new Map(defs.map((d) => [d.name, d])),
    };
    const engine = new PlantEngine(cfg, tags, models);
    expect(engine.groupedByModel).toBe(false);
    engine.step(0, 10);
    tags.flush();
    // Thứ tự topo thiết bị vẫn đúng: B1 trước A1, A2 trước B2 (cùng bước).
    expect(engine.getObservable('A1', 'raw')).toBe(50);
    expect(engine.getObservable('B2', 'raw')).toBe(70);
  });

  it('link cùng model: nhóm vẫn giữ thứ tự topo trong nhóm', () => {
    const defs: TagDef[] = ['S1', 'S2'].map((id, i) => ({
      name: `TT_${id}`,
      type: 'Int' as const,
      area: 'I' as const,
      address: `%IW${String(i * 2)}`,
      controller: 'PLC1',
      signal: { kind: 'AI' as const },
    }));
    const tags = new TagDB(defs, new ManualClock());
    const models = createModelRegistry();
    models.register(fakeSensorModel);
    const cfg: PlantConfig = {
      stepMs: 10,
      seed: 42,
      equipment: [
        // Khai báo ngược (S2 trước S1) — cùng model nên cùng nhóm, topo trong nhóm xếp S1 trước.
        { id: 'S2', model: 'fake_sensor', source: { kind: 'link', equipment: 'S1', observable: 'raw' }, signals: { value: 'TT_S2' } },
        { id: 'S1', model: 'fake_sensor', source: { kind: 'const', value: 50 }, signals: { value: 'TT_S1' } },
      ],
      tags: new Map(defs.map((d) => [d.name, d])),
    };
    const engine = new PlantEngine(cfg, tags, models);
    expect(engine.groupedByModel).toBe(true);
    engine.step(0, 10);
    tags.flush();
    expect(engine.getObservable('S2', 'raw')).toBe(50);
  });

  it('mix 9 model thật, không link → groupedByModel true + tất định', () => {
    const build = (): { engine: PlantEngine; tags: TagDB; hasher: TraceHasher } => {
      const defs: TagDef[] = [];
      const equipment: EquipmentInstance[] = [];
      const counters = { iBit: 0, qBit: 0, iWord: 0, qWord: 0 };
      const nextAddress = (roleKind: string, dataType: string): string => {
        if (dataType === 'Bool') {
          if (roleKind === 'DI' || roleKind === 'AI') {
            const n = counters.iBit;
            counters.iBit += 1;
            return `%I${String(Math.floor(n / 8))}.${String(n % 8)}`;
          }
          const n = counters.qBit;
          counters.qBit += 1;
          return `%Q${String(Math.floor(n / 8))}.${String(n % 8)}`;
        }
        if (dataType === 'Real') {
          if (roleKind === 'AI') {
            const n = counters.iWord;
            counters.iWord += 4;
            return `%ID${String(n)}`;
          }
          const n = counters.qWord;
          counters.qWord += 4;
          return `%QD${String(n)}`;
        }
        if (roleKind === 'AI') {
          const n = counters.iWord;
          counters.iWord += 2;
          return `%IW${String(n)}`;
        }
        const n = counters.qWord;
        counters.qWord += 2;
        return `%QW${String(n)}`;
      };
      const paramsOverride: Record<string, Record<string, unknown>> = {
        analog_sensor: { engMin: 0, engMax: 100, unit: '%' },
        switch_di: { kind: 'generic' },
      };
      for (const type of defaultRegistry.list()) {
        const model = defaultRegistry.get(type) as EquipmentModel;
        const id = `${type}_01`;
        const signals: Record<string, string> = {};
        for (const role of model.roles) {
          if (role.optional === true) continue;
          const tagName = `${id}_${role.role.toUpperCase()}`;
          const area = role.kind === 'DI' || role.kind === 'AI' ? 'I' : 'Q';
          defs.push({
            name: tagName,
            type: role.dataType,
            area,
            address: nextAddress(role.kind, role.dataType),
            controller: 'PLC1',
            signal: {
              kind: role.kind,
              ...(role.dataType === 'Int' && (role.kind === 'AI' || role.kind === 'AO')
                ? {
                    scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: role.unit ?? '%' },
                  }
                : {}),
            },
          });
          signals[role.role] = tagName;
        }
        equipment.push({
          id,
          model: type,
          ...(paramsOverride[type] !== undefined ? { params: paramsOverride[type] } : {}),
          signals,
        });
      }
      const tags = new TagDB(defs, new ManualClock());
      const cfg: PlantConfig = {
        stepMs: 10,
        seed: 42,
        equipment,
        tags: new Map(defs.map((d) => [d.name, d])),
      };
      const engine = new PlantEngine(cfg, tags);
      return { engine, tags, hasher: new TraceHasher(tags) };
    };
    const a = build();
    expect(a.engine.groupedByModel).toBe(true);
    runSteps(a.engine, a.tags, 0, 990);
    const hashA = a.hasher.hash();
    const b = build();
    expect(b.engine.groupedByModel).toBe(true);
    runSteps(b.engine, b.tags, 0, 990);
    expect(b.hasher.hash()).toBe(hashA);
  });
});
