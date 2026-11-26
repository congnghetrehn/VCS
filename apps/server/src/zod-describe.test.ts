// Test describeParams — serialize zod paramsSchema cho form Designer
// (P2.8 commit 5, OQ-386). Kiểm bằng schema thật của registry, không bịa.

import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { analogSensorModel } from '@vcs/plant';
import { motorDolModel } from '@vcs/plant';
import { switchDiModel } from '@vcs/plant';
import { describeParams } from './zod-describe.js';

describe('describeParams (OQ-386)', () => {
  it('motor_dol: integer min 0 (không maximum artifact int), number 0..1, boolean, description + default', () => {
    const fields = describeParams(
      motorDolModel.paramsSchema,
      motorDolModel.defaultParams,
    );
    expect(fields).toHaveLength(15);
    const byName = new Map(fields.map((f) => [f.name, f]));
    const start = byName.get('startDelayMs');
    expect(start).toMatchObject({
      type: 'integer',
      minimum: 0,
      required: true,
      default: 500,
    });
    expect(start?.maximum).toBeUndefined();
    expect(start?.description).toContain('runFb');
    expect(byName.get('noLoadCurrentFrac')).toMatchObject({
      type: 'number',
      minimum: 0,
      maximum: 1,
      default: 0.35,
    });
    expect(byName.get('resetRequiresCmdOff')).toMatchObject({
      type: 'boolean',
      required: true,
      default: true,
    });
    expect(byName.get('ratedCurrentA')).toMatchObject({
      type: 'number',
      minimum: 0,
      default: 0,
    });
    expect(byName.get('ratedCurrentA')?.maximum).toBeUndefined();
  });

  it('switch_di: enum condition + kind optional (required false)', () => {
    const fields = describeParams(
      switchDiModel.paramsSchema,
      switchDiModel.defaultParams,
    );
    const byName = new Map(fields.map((f) => [f.name, f]));
    expect(byName.get('condition')).toMatchObject({
      type: 'string',
      enum: ['gt', 'ge', 'lt', 'le'],
      required: true,
    });
    const kind = byName.get('kind');
    expect(kind?.enum).toEqual([
      'level_high',
      'level_low',
      'zero_speed',
      'pull_cord',
      'limit',
      'generic',
    ]);
    expect(kind?.required).toBe(false);
  });

  it('analog_sensor: engMin/engMax/unit optional, không default (bắt buộc điền tay — OQ-284)', () => {
    const fields = describeParams(
      analogSensorModel.paramsSchema,
      analogSensorModel.defaultParams,
    );
    const byName = new Map(fields.map((f) => [f.name, f]));
    for (const name of ['engMin', 'engMax', 'unit']) {
      const f = byName.get(name);
      expect(f?.required).toBe(false);
      expect(f !== undefined && 'default' in f).toBe(false);
    }
    expect(byName.get('tauMs')).toMatchObject({ type: 'number', required: true, default: 0 });
  });

  it('schema không phải object → []', () => {
    expect(describeParams(z.string(), {})).toEqual([]);
    expect(describeParams(z.number(), {})).toEqual([]);
  });
});
