// Test loader `plant/naming.yaml` (M2 §4.3, P2.7 commit 1, OQ-375).

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_NAMING_CONVENTION } from '@vcs/schemas';
import {
  loadNamingConvention,
  NamingConventionError,
  parseNamingConvention,
} from './naming.js';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const EXAMPLE_NAMING = join(ROOT, 'examples', 'motor-interlock', 'plant', 'naming.yaml');

const FULL_EXAMPLE = `# ví dụ §4.3
convention: cement-default
tagPattern: "^(?<area>[A-Z]{2}\\\\d{2})[_-](?<eqcode>[A-Z]{1,4}\\\\d{2,3})[_-](?<role>[A-Z0-9_]+)$"
equipmentIdTemplate: "{area}_{eqcode}"
equipmentCodeToModel:
  MV: motor_vfd
  M: motor_dol
  XV: valve_onoff
  FCV: valve_ctrl
  CV: valve_ctrl
  DMP: damper
  PT: analog_sensor
  TT: analog_sensor
  LT: analog_sensor
  FT: analog_sensor
  WT: analog_sensor
  ST: analog_sensor
  LSH: switch_di
  LSL: switch_di
  ZS: switch_di
  SS: switch_di
  PC: switch_di
  BIN: silo_bin
  SILO: silo_bin
  BC: conveyor_simple
roleOverrides:
  RUN_ST: runFb
`;

describe('parseNamingConvention', () => {
  it('ví dụ đầy đủ §4.3 → đúng DEFAULT_NAMING_CONVENTION', () => {
    expect(parseNamingConvention(FULL_EXAMPLE)).toEqual(DEFAULT_NAMING_CONVENTION);
  });

  it('file rỗng {} → mọi trường lấy mặc định', () => {
    const c = parseNamingConvention('{}');
    expect(c.convention).toBe('cement-default');
    expect(c.tagPattern).toBe(DEFAULT_NAMING_CONVENTION.tagPattern);
    expect(c.equipmentIdTemplate).toBe('{area}_{eqcode}');
    expect(c.equipmentCodeToModel['MV']).toBe('motor_vfd');
    expect(c.equipmentCodeToModel['BIN']).toBe('silo_bin');
    expect(c.roleOverrides).toEqual({ RUN_ST: 'runFb' });
  });

  it('file ví dụ motor-interlock parse ra đúng mặc định', async () => {
    const text = await readFile(EXAMPLE_NAMING, 'utf-8');
    expect(parseNamingConvention(text)).toEqual(DEFAULT_NAMING_CONVENTION);
  });

  it('tagPattern thiếu nhóm đặt tên → NamingConventionError', () => {
    expect(() => parseNamingConvention('tagPattern: "^(.+)$"')).toThrow(NamingConventionError);
    expect(() => parseNamingConvention('tagPattern: "^(?<area>.+)_(?<eqcode>.+)$"')).toThrow(
      NamingConventionError,
    );
  });

  it('tagPattern không phải RegExp hợp lệ → NamingConventionError', () => {
    expect(() => parseNamingConvention('tagPattern: "("')).toThrow(NamingConventionError);
  });

  it('equipmentIdTemplate thiếu {area} hoặc {eqcode} → NamingConventionError', () => {
    expect(() => parseNamingConvention('equipmentIdTemplate: "{area}"')).toThrow(
      NamingConventionError,
    );
    expect(() => parseNamingConvention('equipmentIdTemplate: "EQ-{eqcode}"')).toThrow(
      NamingConventionError,
    );
  });

  it('equipmentCodeToModel key không phải tiền tố chữ hoa → NamingConventionError', () => {
    expect(() => parseNamingConvention('equipmentCodeToModel:\n  mv: motor_dol')).toThrow(
      NamingConventionError,
    );
    expect(() => parseNamingConvention('equipmentCodeToModel:\n  M12345: motor_dol')).toThrow(
      NamingConventionError,
    );
  });

  it('YAML lỗi cú pháp → NamingConventionError', () => {
    expect(() => parseNamingConvention('a: [')).toThrow(NamingConventionError);
  });

  it('tagPattern mặc định tách đúng tag fixture', () => {
    const re = new RegExp(DEFAULT_NAMING_CONVENTION.tagPattern);
    const m = re.exec('CR01_MV02_REMOTE');
    expect(m?.groups).toEqual({ area: 'CR01', eqcode: 'MV02', role: 'REMOTE' });
    expect(re.exec('CR01_FCV01_POS_FB')?.groups).toEqual({
      area: 'CR01',
      eqcode: 'FCV01',
      role: 'POS_FB',
    });
    expect(re.exec('RUN_CMD')).toBeNull();
  });
});

describe('loadNamingConvention', () => {
  it('thiếu file → mặc định + usedDefault + warning', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-naming-'));
    try {
      const r = await loadNamingConvention(dir);
      expect(r.usedDefault).toBe(true);
      expect(r.warning).toContain('không có plant/naming.yaml');
      expect(r.convention).toEqual(DEFAULT_NAMING_CONVENTION);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('có file hợp lệ → usedDefault false, đọc đúng nội dung', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-naming-'));
    try {
      await mkdir(join(dir, 'plant'), { recursive: true });
      await writeFile(
        join(dir, 'plant', 'naming.yaml'),
        'convention: custom\ntagPattern: "^(?<area>[A-Z]{2}\\\\d{2})[_-](?<eqcode>[A-Z]{1,4}\\\\d{2,3})[_-](?<role>[A-Z0-9_]+)$"\n',
        'utf-8',
      );
      const r = await loadNamingConvention(dir);
      expect(r.usedDefault).toBe(false);
      expect(r.warning).toBeUndefined();
      expect(r.convention.convention).toBe('custom');
      expect(r.convention.equipmentCodeToModel['MV']).toBe('motor_vfd');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('file lỗi → reject NamingConventionError', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-naming-'));
    try {
      await mkdir(join(dir, 'plant'), { recursive: true });
      await writeFile(join(dir, 'plant', 'naming.yaml'), 'tagPattern: "("', 'utf-8');
      await expect(loadNamingConvention(dir)).rejects.toThrow(NamingConventionError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
