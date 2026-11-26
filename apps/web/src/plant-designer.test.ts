// Test logic thuần Plant Designer — P2.8 commit 8.

import { describe, expect, it } from 'vitest';
import {
  blockedEquipmentIds,
  filterSuggestions,
  formatEventLine,
  formatParamValue,
  formatRoleValue,
  isScalarParam,
  lastToken,
  parseParamValue,
} from './plant-designer.js';
import type { ParamField, PlantEvent, Suggestion } from './api/import.js';

function field(patch: Partial<ParamField>): ParamField {
  return { name: 'x', type: 'number', required: false, ...patch };
}

describe('lastToken', () => {
  it('lấy token cuối sau `_`; không có `_` → chính tag', () => {
    expect(lastToken('CR01_BC01_SPEED')).toBe('SPEED');
    expect(lastToken('CR01_FCV01_LOCAL')).toBe('LOCAL');
    expect(lastToken('RUN_CMD')).toBe('CMD');
    expect(lastToken('TAG')).toBe('TAG');
    expect(lastToken('')).toBe('');
  });
});

describe('parseParamValue', () => {
  it('integer: chuỗi số → number; chữ/thập phân/vượt min-max → lỗi nêu tên', () => {
    expect(parseParamValue(field({ name: 'startDelayMs', type: 'integer', minimum: 0 }), '700')).toEqual({
      ok: true,
      value: 700,
    });
    expect(parseParamValue(field({ name: 'startDelayMs', type: 'integer' }), 'abc')).toEqual({
      ok: false,
      error: 'startDelayMs: phải là số nguyên',
    });
    expect(parseParamValue(field({ name: 'startDelayMs', type: 'integer' }), '1.5')).toEqual({
      ok: false,
      error: 'startDelayMs: phải là số nguyên',
    });
    expect(parseParamValue(field({ name: 'n', type: 'integer', minimum: 0 }), '-1')).toEqual({
      ok: false,
      error: 'n: phải ≥ 0',
    });
    expect(parseParamValue(field({ name: 'n', type: 'integer', maximum: 100 }), '101')).toEqual({
      ok: false,
      error: 'n: phải ≤ 100',
    });
  });

  it('number/boolean/enum: parse đúng; sai → lỗi', () => {
    expect(parseParamValue(field({ name: 'deadbandPct', type: 'number' }), '0.5')).toEqual({
      ok: true,
      value: 0.5,
    });
    expect(parseParamValue(field({ name: 'deadbandPct', type: 'number' }), '')).toEqual({
      ok: false,
      error: 'deadbandPct: phải là số',
    });
    expect(parseParamValue(field({ name: 'invert', type: 'boolean' }), 'true')).toEqual({
      ok: true,
      value: true,
    });
    expect(parseParamValue(field({ name: 'invert', type: 'boolean' }), 'yes')).toEqual({
      ok: false,
      error: 'invert: phải là true hoặc false',
    });
    expect(
      parseParamValue(
        field({ name: 'kind', type: 'string', enum: ['level_high', 'limit', 'generic'] }),
        'limit',
      ),
    ).toEqual({ ok: true, value: 'limit' });
    expect(
      parseParamValue(
        field({ name: 'kind', type: 'string', enum: ['level_high', 'limit', 'generic'] }),
        'other',
      ),
    ).toEqual({
      ok: false,
      error: 'kind: phải là một trong level_high, limit, generic',
    });
  });
});

describe('formatParamValue + isScalarParam', () => {
  it('scalar → chuỗi; object → JSON; undefined → rỗng', () => {
    expect(formatParamValue(20)).toBe('20');
    expect(formatParamValue(true)).toBe('true');
    expect(formatParamValue('%')).toBe('%');
    expect(formatParamValue({ engMin: 0, engMax: 100 })).toBe('{"engMin":0,"engMax":100}');
    expect(formatParamValue(undefined)).toBe('');
  });

  it('chỉ scalar sửa được; object không có type scalar → read-only', () => {
    expect(isScalarParam(field({ type: 'integer' }))).toBe(true);
    expect(isScalarParam(field({ type: 'boolean' }))).toBe(true);
  });
});

describe('blockedEquipmentIds', () => {
  it('lấy ID thiết bị từ message PL-E001; không khớp → []', () => {
    expect(
      blockedEquipmentIds([
        {
          message:
            'Params của thiết bị CR02_SS02 (model switch_di) không hợp lệ: switch_di: kind bắt buộc (OQ-287)..',
        },
        { message: 'lỗi khác không nêu thiết bị' },
      ]),
    ).toEqual(['CR02_SS02']);
    expect(blockedEquipmentIds([])).toEqual([]);
    expect(blockedEquipmentIds([{ message: '' }])).toEqual([]);
  });
});

describe('filterSuggestions', () => {
  const mk = (id: string, status: Suggestion['status']): Suggestion => ({
    equipmentId: id,
    model: 'motor_dol',
    confidence: 0.9,
    signals: [],
    missingRequiredRoles: [],
    unusedOptionalRoles: [],
    status,
  });

  it('lọc theo status; rỗng → tất cả, giữ thứ tự', () => {
    const list = [mk('A', 'confident'), mk('B', 'review'), mk('C', 'confident')];
    expect(filterSuggestions(list, 'confident').map((s) => s.equipmentId)).toEqual(['A', 'C']);
    expect(filterSuggestions(list, '')).toHaveLength(3);
    expect(filterSuggestions(list, 'unmatched')).toEqual([]);
  });
});

describe('formatEventLine', () => {
  it('chỉ gồm field có mặt; from/to hiện mũi tên', () => {
    const full: PlantEvent = {
      t: 1200,
      type: 'state',
      equipment: 'M01',
      key: 'running',
      from: false,
      to: true,
    };
    expect(formatEventLine(full)).toBe('[1200ms] state M01 running (false → true)');
    expect(formatEventLine({ t: 0, type: 'info', msg: 'khởi động' })).toBe(
      '[0ms] info: khởi động',
    );
  });
});

describe('formatRoleValue', () => {
  it('chỉ raw khi không có eng; có eng → "raw (eng unit)"; overRange cờ riêng', () => {
    expect(formatRoleValue({ tag: 'RUN_FB', raw: true })).toEqual({
      text: 'true',
      overRange: false,
    });
    expect(
      formatRoleValue({ tag: 'PT01_PV', raw: 32511, eng: 117.58897, unit: '%', overRange: true }),
    ).toEqual({ text: '32511 (117.58897 %)', overRange: true });
    expect(formatRoleValue({ tag: 'PT01_PV', raw: 13824, eng: 50, unit: '%' })).toEqual({
      text: '13824 (50 %)',
      overRange: false,
    });
  });
});
