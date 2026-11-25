// PlantEngine (M2 §5, bảng D) — validate, step tất định, lỗi, snapshot/restore.

import { describe, expect, it } from 'vitest';

import { PL_CATALOG } from '@vcs/schemas';
import { ManualClock, TagDB, TraceHasher, type TagDBSnapshot, type TagHandle } from '@vcs/kernel';
import type { EquipmentInstance, SourceSpec, TagDef } from '@vcs/schemas';

import { PlantEngine, validatePlantConfig, type PlantConfig, type PlantSnapshot } from './engine.js';
import { createModelRegistry, deriveModel, type ModelRegistry } from './registry.js';
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
  it('7 mã PL (51 → 58 mã tổng)', () => {
    expect(PL_CATALOG.codes()).toEqual([
      'PL-E001',
      'PL-E002',
      'PL-E003',
      'PL-E012',
      'PL-E020',
      'PL-W001',
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
