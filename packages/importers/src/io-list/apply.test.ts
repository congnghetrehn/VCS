// Test buildApplySuggestions + serializeEquipment (M2 §9.3, P2.7 commit 5, OQ-370/371).

import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { equipmentFileSchema, hasErrors, type EquipmentInstance, type TagDef } from '@vcs/schemas';
import { motorDolModel } from '@vcs/plant';
import { buildApplySuggestions, serializeEquipment } from './apply.js';
import type { Suggestion } from './suggest.js';

function mkTag(name: string, address: string, kind: 'DI' | 'DO' | 'AI' | 'AO'): TagDef {
  const area = kind === 'DO' || kind === 'AO' ? 'Q' : 'I';
  const type = kind === 'AI' || kind === 'AO' ? 'Int' : 'Bool';
  return { name, type, area, address, controller: 'PLC1', signal: { kind } };
}

/** Tag AI có scaling — validatePlantConfig PL-E012 bắt buộc dải đo cho
 *  role AI/AO (params engMin/engMax, scaling trong tag, hoặc unit '%'). */
function mkAiTag(
  name: string,
  address: string,
  scaling: { rawMin: number; rawMax: number; engMin: number; engMax: number; unit?: string },
): TagDef {
  return {
    name,
    type: 'Int',
    area: 'I',
    address,
    controller: 'PLC1',
    signal: { kind: 'AI', scaling },
  };
}

/** 6 tag M01 (fixture dòng 7–12) + suggestion motor_dol confident 6 role. */
function m01Tags(): TagDef[] {
  return [
    mkTag('CR01_M01_RUN_CMD', '%Q0.0', 'DO'),
    mkTag('CR01_M01_RUN_FBK', '%I0.0', 'DI'),
    mkTag('CR01_M01_READY', '%I0.1', 'DI'),
    mkTag('CR01_M01_REMOTE', '%I0.2', 'DI'),
    mkTag('CR01_M01_OVL_OK', '%I0.3', 'DI'),
    // CUR (currentFb, AI): cần scaling để qua PL-E012 (dải đo 0–10 A).
    mkAiTag('CR01_M01_CUR', '%IW0', { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 10, unit: 'A' }),
  ];
}

function m01Suggestion(): Suggestion {
  return {
    equipmentId: 'CR01_M01',
    model: 'motor_dol',
    confidence: 0.8,
    signals: [
      { tag: 'CR01_M01_RUN_CMD', role: 'runCmd', confidence: 1, reasons: [], row: 7 },
      { tag: 'CR01_M01_RUN_FBK', role: 'runFb', confidence: 1, reasons: [], row: 8 },
      { tag: 'CR01_M01_READY', role: 'ready', confidence: 1, reasons: [], row: 9 },
      { tag: 'CR01_M01_REMOTE', role: 'remote', confidence: 1, reasons: [], row: 10 },
      { tag: 'CR01_M01_OVL_OK', role: 'overloadOk', confidence: 1, reasons: [], row: 11 },
      { tag: 'CR01_M01_CUR', role: 'currentFb', confidence: 1, reasons: [], row: 12 },
    ],
    missingRequiredRoles: [],
    unusedOptionalRoles: [],
    status: 'confident',
  };
}

describe('buildApplySuggestions — instance mới', () => {
  it('tạo equipment params mặc định + signals map, cập nhật tags, không lỗi', () => {
    const r = buildApplySuggestions(m01Tags(), [], [m01Suggestion()]);
    expect(r.applied).toEqual(['CR01_M01']);
    expect(r.skipped).toEqual([]);
    expect(r.equipment).toHaveLength(1);
    const inst = r.equipment[0] as EquipmentInstance;
    expect(inst.id).toBe('CR01_M01');
    expect(inst.model).toBe('motor_dol');
    expect(inst.controller).toBe('PLC1');
    expect(inst.params).toEqual(motorDolModel.defaultParams);
    expect(inst.signals).toEqual({
      runCmd: 'CR01_M01_RUN_CMD',
      runFb: 'CR01_M01_RUN_FBK',
      ready: 'CR01_M01_READY',
      remote: 'CR01_M01_REMOTE',
      overloadOk: 'CR01_M01_OVL_OK',
      currentFb: 'CR01_M01_CUR',
    });
    expect(hasErrors(r.diagnostics)).toBe(false);
    expect(r.diagnostics).toEqual([]);
    for (const t of r.tags) {
      expect(t.equipment).toBe('CR01_M01');
      expect(t.role).toBeDefined();
    }
    expect(r.tags.find((t) => t.name === 'CR01_M01_RUN_CMD')?.role).toBe('runCmd');
    expect(r.tags.find((t) => t.name === 'CR01_M01_CUR')?.role).toBe('currentFb');
  });

  it('instance mới analog_sensor bị từ chối vì thiếu engMin/engMax/unit (OQ-284)', () => {
    const tags = [mkTag('CR01_LT01_RAW', '%IW64', 'AI')];
    const sug: Suggestion = {
      equipmentId: 'CR01_LT01',
      model: 'analog_sensor',
      confidence: 0.9,
      signals: [{ tag: 'CR01_LT01_RAW', role: 'raw', confidence: 1, reasons: [], row: 1 }],
      missingRequiredRoles: [],
      unusedOptionalRoles: [],
      status: 'confident',
    };
    const r = buildApplySuggestions(tags, [], [sug]);
    expect(r.applied).toEqual(['CR01_LT01']);
    expect(r.equipment[0]?.params).toEqual({ tauMs: 0, noiseStd: 0 });
    expect(hasErrors(r.diagnostics)).toBe(true);
    expect(r.diagnostics.some((d) => d.code === 'PL-E001' && d.message.includes('engMin'))).toBe(true);
  });

  it('instance mới switch_di bị từ chối vì thiếu kind (OQ-287)', () => {
    const tags = [mkTag('CR01_LSH01_LSH', '%I0.0', 'DI')];
    const sug: Suggestion = {
      equipmentId: 'CR01_LSH01',
      model: 'switch_di',
      confidence: 0.9,
      signals: [{ tag: 'CR01_LSH01_LSH', role: 'di', confidence: 1, reasons: [], row: 1 }],
      missingRequiredRoles: [],
      unusedOptionalRoles: [],
      status: 'confident',
    };
    const r = buildApplySuggestions(tags, [], [sug]);
    expect(hasErrors(r.diagnostics)).toBe(true);
    expect(r.diagnostics.some((d) => d.code === 'PL-E001' && d.message.includes('kind'))).toBe(true);
  });

  it('role AI không có dải đo (tag không scaling, params không engMin/engMax) → PL-E012 từ chối', () => {
    const tags = [mkTag('CR01_M01_CUR', '%IW0', 'AI')];
    const sug: Suggestion = {
      equipmentId: 'CR01_M01',
      model: 'motor_dol',
      confidence: 0.9,
      signals: [{ tag: 'CR01_M01_CUR', role: 'currentFb', confidence: 1, reasons: [], row: 12 }],
      missingRequiredRoles: [],
      unusedOptionalRoles: [],
      status: 'confident',
    };
    const r = buildApplySuggestions(tags, [], [sug]);
    expect(r.equipment[0]?.signals).toEqual({ currentFb: 'CR01_M01_CUR' });
    expect(hasErrors(r.diagnostics)).toBe(true);
    expect(r.diagnostics.some((d) => d.code === 'PL-E012' && d.message.includes('currentFb'))).toBe(true);
  });
});

describe('buildApplySuggestions — instance đã có', () => {
  it('giữ params/model/source, merge signals (OQ-370)', () => {
    const old: EquipmentInstance[] = [
      {
        id: 'CR01_M01',
        model: 'motor_dol',
        controller: 'PLC1',
        params: { startDelayMs: 999, stopDelayMs: 800, tripDelayMs: 0, overloadResetMs: 1000, resetRequiresCmdOff: true },
        signals: { runCmd: 'CR01_M01_RUN_CMD' },
        source: { kind: 'manual', value: true },
      },
    ];
    const sug: Suggestion = {
      ...m01Suggestion(),
      signals: m01Suggestion().signals.slice(0, 3),
    };
    const r = buildApplySuggestions(m01Tags(), old, [sug]);
    const inst = r.equipment[0] as EquipmentInstance;
    expect(inst.model).toBe('motor_dol');
    expect(inst.params).toEqual({
      startDelayMs: 999,
      stopDelayMs: 800,
      tripDelayMs: 0,
      overloadResetMs: 1000,
      resetRequiresCmdOff: true,
    });
    expect(inst.source).toEqual({ kind: 'manual', value: true });
    expect(inst.signals).toEqual({
      runCmd: 'CR01_M01_RUN_CMD',
      runFb: 'CR01_M01_RUN_FBK',
      ready: 'CR01_M01_READY',
    });
    expect(hasErrors(r.diagnostics)).toBe(false);
  });

  it('tag gán sang role khác: entry cũ dùng tag đó bị bỏ (tránh 1 tag 2 role)', () => {
    const old: EquipmentInstance[] = [
      {
        id: 'CR01_M01',
        model: 'motor_dol',
        params: { ...(motorDolModel.defaultParams as Record<string, unknown>) },
        signals: { runCmd: 'CR01_M01_RUN_FBK', ready: 'CR01_M01_READY' },
      },
    ];
    const sug: Suggestion = {
      ...m01Suggestion(),
      signals: [
        { tag: 'CR01_M01_RUN_CMD', role: 'runCmd', confidence: 1, reasons: [], row: 7 },
        { tag: 'CR01_M01_RUN_FBK', role: 'runFb', confidence: 1, reasons: [], row: 8 },
      ],
    };
    const r = buildApplySuggestions(m01Tags(), old, [sug]);
    expect(r.equipment[0]?.signals).toEqual({
      runCmd: 'CR01_M01_RUN_CMD',
      runFb: 'CR01_M01_RUN_FBK',
      ready: 'CR01_M01_READY',
    });
    expect(hasErrors(r.diagnostics)).toBe(false);
  });

  it('model khác suggestion: giữ model cũ, validate từ chối khi role không khớp (OQ-370)', () => {
    const old: EquipmentInstance[] = [
      {
        id: 'CR01_M01',
        model: 'valve_onoff',
        params: { strokeTimeS: 10 },
        signals: { openCmd: 'CR01_M01_RUN_CMD' },
      },
    ];
    const r = buildApplySuggestions(m01Tags(), old, [m01Suggestion()]);
    expect(r.equipment[0]?.model).toBe('valve_onoff');
    expect(r.equipment[0]?.params).toEqual({ strokeTimeS: 10 });
    expect(hasErrors(r.diagnostics)).toBe(true);
    expect(r.diagnostics.some((d) => d.code === 'PL-E001' && d.message.includes('runCmd'))).toBe(true);
  });
});

describe('buildApplySuggestions — idempotence + skip + lỗi', () => {
  it('apply 2 lần → equipment/tags/diagnostics không đổi', () => {
    const tags = m01Tags();
    const first = buildApplySuggestions(tags, [], [m01Suggestion()]);
    expect(hasErrors(first.diagnostics)).toBe(false);
    const second = buildApplySuggestions(first.tags, first.equipment, [m01Suggestion()]);
    expect(second.equipment).toEqual(first.equipment);
    expect(second.tags).toEqual(first.tags);
    expect(second.diagnostics).toEqual(first.diagnostics);
    expect(serializeEquipment(second.equipment)).toBe(serializeEquipment(first.equipment));
  });

  it('model không tồn tại → skip + PL-E001, không tạo instance', () => {
    const sug: Suggestion = { ...m01Suggestion(), model: 'no_such_model' };
    const r = buildApplySuggestions(m01Tags(), [], [sug]);
    expect(r.applied).toEqual([]);
    expect(r.equipment).toEqual([]);
    expect(r.skipped).toEqual([
      {
        equipmentId: 'CR01_M01',
        model: 'no_such_model',
        reason: 'model no_such_model không tồn tại trong registry',
      },
    ]);
    expect(r.diagnostics.some((d) => d.code === 'PL-E001')).toBe(true);
  });

  it('suggestion 0 signal → skip, không tạo instance rỗng', () => {
    const sug: Suggestion = { ...m01Suggestion(), signals: [] };
    const r = buildApplySuggestions(m01Tags(), [], [sug]);
    expect(r.equipment).toEqual([]);
    expect(r.skipped[0]?.reason).toBe('không có tín hiệu nào được gán');
  });

  it('tag không có trong tags.yaml → TAG-E003, bỏ tín hiệu đó', () => {
    const sug: Suggestion = {
      ...m01Suggestion(),
      signals: [
        { tag: 'CR01_M01_RUN_CMD', role: 'runCmd', confidence: 1, reasons: [], row: 7 },
        { tag: 'CR01_M01_GHOST', role: 'runFb', confidence: 1, reasons: [], row: 8 },
      ],
    };
    const r = buildApplySuggestions(m01Tags(), [], [sug]);
    expect(r.equipment[0]?.signals).toEqual({ runCmd: 'CR01_M01_RUN_CMD' });
    expect(r.diagnostics.some((d) => d.code === 'TAG-E003' && d.message.includes('CR01_M01_GHOST'))).toBe(true);
  });

  it('không đột biến đầu vào', () => {
    const tags = m01Tags();
    const old: EquipmentInstance[] = [
      { id: 'CR01_M01', model: 'motor_dol', params: { startDelayMs: 999 }, signals: { runCmd: 'X' } },
    ];
    const tagsBefore = JSON.stringify(tags);
    const oldBefore = JSON.stringify(old);
    buildApplySuggestions(tags, old, [m01Suggestion()]);
    expect(JSON.stringify(tags)).toBe(tagsBefore);
    expect(JSON.stringify(old)).toBe(oldBefore);
  });

  it('equipment không được suggest giữ nguyên; sort theo id', () => {
    const old: EquipmentInstance[] = [
      { id: 'ZZ99_X01', model: 'motor_dol', params: { startDelayMs: 1 } },
    ];
    const r = buildApplySuggestions(m01Tags(), old, [m01Suggestion()]);
    expect(r.equipment.map((e) => e.id)).toEqual(['CR01_M01', 'ZZ99_X01']);
    expect(r.equipment[1]).toEqual(old[0]);
  });
});

describe('serializeEquipment', () => {
  it('YAML mảng top-level, parse lại bằng equipmentFileSchema khớp', () => {
    const r = buildApplySuggestions(m01Tags(), [], [m01Suggestion()]);
    const yaml = serializeEquipment(r.equipment);
    expect(yaml.startsWith('- id: CR01_M01')).toBe(true);
    const parsed = equipmentFileSchema.safeParse(parseYaml(yaml) as unknown);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(r.equipment);
  });
});
