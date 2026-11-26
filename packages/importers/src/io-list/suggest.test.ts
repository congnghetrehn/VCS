// Test suggest bước 1–2: parseTag + groupSignals + converters
// (M2 §9.1, P2.7 commit 2).

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_NAMING_CONVENTION, type SignalKind } from '@vcs/schemas';
import { defaultRegistry, motorDolModel, type EquipmentModel, type RoleDef } from '@vcs/plant';
import { detectHeader } from './header-detect.js';
import { suggestMapping } from './mapping.js';
import { normalizeImport, type NormalizedSignal as NormalizedSignalType } from './normalize.js';
import { buildProfile } from './profile.js';
import { readCsvFile } from './read-csv.js';
import {
  assignRoles,
  clamp01,
  descKeywordMatches,
  eqcodeLetters,
  equipmentConfidence,
  firstToken,
  groupSignals,
  normalizeDescText,
  normalizedSignalsToInputs,
  parseTag,
  scoreModel,
  scoreRole,
  stripEquipmentPrefix,
  SUGGEST_EPS,
  suggest,
  tagDefsToInputs,
  truncateToSeparator,
  type GroupedSignal,
  type SignalGroup,
  type SuggestInput,
} from './suggest.js';
import { applyTransforms, gridToRecords } from './transform.js';
import { recordRowNumbers } from './validate.js';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const FIXTURE_CSV = join(ROOT, 'fixtures', 'io-list-300.csv');
const ORIGIN = { file: 'io-list-300.csv' };

async function fixtureInputs(): Promise<SuggestInput[]> {
  const grid = await readCsvFile(FIXTURE_CSV);
  const header = detectHeader(grid);
  const headerRow = header?.headerRow ?? 6;
  const firstDataRow = header?.firstDataRow ?? 7;
  const suggestions = suggestMapping(grid, headerRow);
  const profile = buildProfile(grid, headerRow, firstDataRow, suggestions, { name: 'io-list-300' });
  const mapping: Record<string, string> = {};
  for (const s of suggestions) mapping[s.field] = s.column;
  const records = gridToRecords(grid, headerRow, firstDataRow, mapping);
  const transformed = applyTransforms(records, profile.transforms);
  const signals = normalizeImport(transformed.rows, {
    rowNumbers: recordRowNumbers(grid, firstDataRow),
    origin: ORIGIN,
    profile,
  });
  return normalizedSignalsToInputs(signals);
}

function mkInput(over: Partial<SuggestInput> & { tag: string }): SuggestInput {
  return {
    kind: null,
    description: '',
    equipmentColumn: null,
    row: 1,
    // TagDef tối thiểu (hợp lệ) — suggest() lọc record tagDef null
    // (OQ-365) nên input test phải có tagDef thì mới vào scoring.
    tagDef: { name: over.tag, type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1' },
    ...over,
  };
}

function mkSignal(over: Partial<NormalizedSignalType> & { tag: string }): NormalizedSignalType {
  return {
    originalTag: over.tag,
    tagDef: null,
    derivedKind: false,
    cleanedTag: false,
    peripheral: false,
    row: 1,
    address: null,
    addressError: null,
    kind: null,
    givenKind: null,
    engMin: null,
    engMax: null,
    rangeNonNumeric: false,
    controller: 'PLC1',
    record: {},
    ...over,
  };
}

describe('parseTag', () => {
  it('pattern: tách area/eqcode/role', () => {
    expect(parseTag('CR01_MV02_REMOTE')).toEqual({
      equipmentId: 'CR01_MV02',
      roleToken: 'REMOTE',
      source: 'pattern',
    });
    expect(parseTag('CR01_FCV01_POS_FB')).toEqual({
      equipmentId: 'CR01_FCV01',
      roleToken: 'POS_FB',
      source: 'pattern',
    });
    expect(parseTag('CR01_BC02_ZERO_SPEED')).toEqual({
      equipmentId: 'CR01_BC02',
      roleToken: 'ZERO_SPEED',
      source: 'pattern',
    });
    // Separator '-' cũng khớp ([_-] trong pattern).
    expect(parseTag('CR01-MV02-REMOTE')).toEqual({
      equipmentId: 'CR01_MV02',
      roleToken: 'REMOTE',
      source: 'pattern',
    });
  });

  it('pattern: template khác → equipmentId theo template', () => {
    const conv = { ...DEFAULT_NAMING_CONVENTION, equipmentIdTemplate: '{area}-{eqcode}' };
    expect(parseTag('CR01_MV02_REMOTE', conv)).toEqual({
      equipmentId: 'CR01-MV02',
      roleToken: 'REMOTE',
      source: 'pattern',
    });
  });

  it('cột equipment: chỉ dùng khi tag KHÔNG khớp pattern', () => {
    // 'CR01_MV02_REMOTE' khớp pattern → pattern thắng, cột không được dùng.
    expect(parseTag('CR01_MV02_REMOTE', DEFAULT_NAMING_CONVENTION, 'MV02').source).toBe(
      'pattern',
    );
    expect(parseTag('MV02_REMOTE', DEFAULT_NAMING_CONVENTION, 'MV02')).toEqual({
      equipmentId: 'MV02',
      roleToken: 'REMOTE',
      source: 'equipment-column',
    });
    expect(parseTag('RUN_CMD', DEFAULT_NAMING_CONVENTION, 'M01')).toEqual({
      equipmentId: 'M01',
      roleToken: 'RUN_CMD',
      source: 'equipment-column',
    });
  });

  it('không pattern, không cột → LCP fallback: equipmentId = first token', () => {
    expect(parseTag('RUN_CMD')).toEqual({
      equipmentId: 'RUN',
      roleToken: 'RUN_CMD',
      source: 'lcp',
    });
    expect(parseTag('PUMP1_RUN')).toEqual({
      equipmentId: 'PUMP1',
      roleToken: 'PUMP1_RUN',
      source: 'lcp',
    });
  });
});

describe('firstToken / stripEquipmentPrefix / truncateToSeparator', () => {
  it('firstToken', () => {
    expect(firstToken('CR01_MV02_REMOTE')).toBe('CR01');
    expect(firstToken('RUN_CMD')).toBe('RUN');
    expect(firstToken('TAG')).toBe('TAG');
    expect(firstToken('')).toBe('');
  });

  it('stripEquipmentPrefix', () => {
    expect(stripEquipmentPrefix('CR01_MV02_REMOTE', 'CR01_MV02')).toBe('REMOTE');
    expect(stripEquipmentPrefix('CR01_MV02_REMOTE', 'MV02')).toBe('REMOTE');
    expect(stripEquipmentPrefix('RUN_CMD', 'M01')).toBe('RUN_CMD');
    expect(stripEquipmentPrefix('CR01_MV02', 'MV02')).toBe('CR01_MV02');
    expect(stripEquipmentPrefix('A-B-C', 'A')).toBe('B-C');
  });

  it('truncateToSeparator', () => {
    expect(truncateToSeparator('RUN_')).toBe('RUN');
    expect(truncateToSeparator('CR01_MV02_')).toBe('CR01_MV02');
    expect(truncateToSeparator('CR01_MV0')).toBe('CR01');
    expect(truncateToSeparator('CR01')).toBe('');
    expect(truncateToSeparator('')).toBe('');
  });
});

describe('groupSignals', () => {
  it('pattern: gom theo {area}_{eqcode}, sort group + tín hiệu', () => {
    const groups = groupSignals([
      mkInput({ tag: 'CR01_FCV01_POS_FB', kind: 'AI', row: 91 }),
      mkInput({ tag: 'CR01_MV02_RUN_FB', kind: 'DI', row: 2 }),
      mkInput({ tag: 'CR01_MV02_REMOTE', kind: 'DI', row: 1 }),
    ]);
    expect(groups.map((g) => g.equipmentId)).toEqual(['CR01_FCV01', 'CR01_MV02']);
    const mv02 = groups.find((g) => g.equipmentId === 'CR01_MV02');
    expect(mv02?.signals.map((s) => s.input.tag)).toEqual([
      'CR01_MV02_REMOTE',
      'CR01_MV02_RUN_FB',
    ]);
    expect(mv02?.signals.map((s) => s.parsed)[0]).toEqual({
      equipmentId: 'CR01_MV02',
      roleToken: 'REMOTE',
      source: 'pattern',
    });
  });

  it('LCP: bucket theo first token, neighbour-LCP cắt tới separator', () => {
    const groups = groupSignals([
      mkInput({ tag: 'PUMP2_RUN', row: 3 }),
      mkInput({ tag: 'PUMP1_STOP', row: 2 }),
      mkInput({ tag: 'PUMP1_RUN', row: 1 }),
    ]);
    expect(groups.map((g) => g.equipmentId)).toEqual(['PUMP1', 'PUMP2']);
    const pump1 = groups.find((g) => g.equipmentId === 'PUMP1');
    const pump2 = groups.find((g) => g.equipmentId === 'PUMP2');
    expect(pump1?.signals.map((s) => s.parsed.roleToken)).toEqual(['RUN', 'STOP']);
    expect(pump2?.signals.map((s) => s.parsed.roleToken)).toEqual(['PUMP2_RUN']);
  });

  it('LCP: tiền tố chung cắt giữa token → lùi về separator trước', () => {
    const groups = groupSignals([
      mkInput({ tag: 'AB12_X2_B', row: 2 }),
      mkInput({ tag: 'AB12_X1_A', row: 1 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups.map((g) => g.equipmentId)).toEqual(['AB12']);
    expect(groups.flatMap((g) => g.signals.map((s) => s.parsed.roleToken))).toEqual([
      'X1_A',
      'X2_B',
    ]);
  });

  it('tag rỗng → group "" (suggest sẽ đưa vào unassigned vì tagDef null)', () => {
    const groups = groupSignals([mkInput({ tag: '' })]);
    expect(groups).toHaveLength(1);
    expect(groups.map((g) => g.equipmentId)).toEqual(['']);
  });

  it('cùng tag, khác row → sort theo row', () => {
    const groups = groupSignals([
      mkInput({ tag: 'CR01_MV02_REMOTE', row: 91 }),
      mkInput({ tag: 'CR01_MV02_REMOTE', row: 64 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups.flatMap((g) => g.signals.map((s) => s.input.row))).toEqual([64, 91]);
  });
});

describe('groupSignals — fixture 300 (ground truth, đã đo ở commit 2)', () => {
  it('50 group = 50 thiết bị, 300/300 pattern, 0 lỗi', async () => {
    const inputs = await fixtureInputs();
    expect(inputs).toHaveLength(300);
    expect(inputs.filter((i) => i.tagDef === null)).toHaveLength(0);
    expect(inputs.filter((i) => i.errorCode !== undefined)).toHaveLength(0);
    const groups = groupSignals(inputs);
    expect(groups).toHaveLength(50);
    expect(groups.every((g) => g.signals.every((s) => s.parsed.source === 'pattern'))).toBe(true);
    expect(groups.map((g) => `${g.equipmentId}:${String(g.signals.length)}`).join(' ')).toBe(
      'CR01_BC01:18 CR01_BIN01:7 CR01_BIN02:6 CR01_FCV01:6 CR01_FCV02:7 CR01_FT01:2 ' +
        'CR01_LSH01:3 CR01_LSL01:3 CR01_LT01:2 CR01_LT02:2 CR01_M01:11 CR01_M02:11 CR01_M03:10 ' +
        'CR01_M04:10 CR01_MV01:11 CR01_MV02:13 CR01_PT01:2 CR01_PT02:2 CR01_SS01:4 CR01_TT01:2 ' +
        'CR01_TT02:2 CR01_XV01:6 CR01_XV02:6 CR01_XV03:7 CR01_ZS01:3 CR01_ZS02:3 CR02_BC02:16 ' +
        'CR02_FCV01:7 CR02_FT02:2 CR02_FT03:2 CR02_LSH02:3 CR02_LT03:2 CR02_M01:10 CR02_M02:10 ' +
        'CR02_M03:10 CR02_M04:10 CR02_MV01:11 CR02_MV02:11 CR02_PC01:3 CR02_PC02:3 CR02_PT03:2 ' +
        'CR02_SILO01:7 CR02_SS02:2 CR02_ST01:2 CR02_TT03:2 CR02_WT01:2 CR02_XV01:7 CR02_XV02:7 ' +
        'CR02_XV03:7 CR02_ZS03:3',
    );
  }, 60_000);
});

describe('converters', () => {
  it('normalizedSignalsToInputs: errorCode khớp validateImport', () => {
    const inputs = normalizedSignalsToInputs([
      mkSignal({ tag: '' }),
      mkSignal({ tag: 'X'.repeat(129) }),
      mkSignal({ tag: 'CR01_MV02_REMOTE', addressError: 'địa chỉ lỗi' }),
      mkSignal({ tag: 'CR01_MV02_REMOTE', kind: null }),
      mkSignal({
        tag: 'CR01_MV02_REMOTE',
        kind: 'DI',
        tagDef: { name: 'CR01_MV02_REMOTE', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1' },
      }),
    ]);
    expect(inputs.map((i) => i.errorCode)).toEqual([
      'IO-E002',
      'IO-E002',
      'IO-E010',
      'IO-E003',
      undefined,
    ]);
  });

  it('normalizedSignalsToInputs: equipment/description từ tagDef, fallback record', () => {
    const inputs = normalizedSignalsToInputs([
      mkSignal({
        tag: 'CR01_MV02_REMOTE',
        tagDef: {
          name: 'CR01_MV02_REMOTE',
          type: 'Bool',
          area: 'I',
          address: '%I0.0',
          controller: 'PLC1',
          equipment: 'MV02',
          description: 'chọn remote',
        },
      }),
      mkSignal({
        tag: 'CR01_MV02_RUN_FB',
        record: { equipment: 'MV02', description: 'đang chạy' },
      }),
    ]);
    expect(inputs.map((i) => [i.equipmentColumn, i.description])).toEqual([
      ['MV02', 'chọn remote'],
      ['MV02', 'đang chạy'],
    ]);
  });

  it('tagDefsToInputs: equipment + kind từ TagDef, row = thứ tự', () => {
    const inputs = tagDefsToInputs([
      {
        name: 'RUN_CMD',
        type: 'Bool',
        area: 'Q',
        address: '%Q0.0',
        controller: 'PLC1',
        equipment: 'M01',
        signal: { kind: 'DO' },
      },
      { name: 'RUN_FB', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1' },
    ]);
    expect(inputs.map((i) => ({ ...i, tagDef: i.tagDef?.name ?? null }))).toEqual([
      {
        tag: 'RUN_CMD',
        kind: 'DO',
        description: '',
        equipmentColumn: 'M01',
        row: 1,
        tagDef: 'RUN_CMD',
      },
      {
        tag: 'RUN_FB',
        kind: null,
        description: '',
        equipmentColumn: null,
        row: 2,
        tagDef: 'RUN_FB',
      },
    ]);
  });
});

// Test suggest bước 3–5: scoreRole + scoreModel + assignRoles +
// equipmentConfidence + descKeywords vi/de (M2 §9.2, P2.7 commit 3, OQ-361…364/366/367/369/370).

describe('normalizeDescText / descKeywordMatches (OQ-364)', () => {
  it('normalize: lowercase + strip dấu NFKD + đ→d + gom whitespace', () => {
    expect(normalizeDescText('Sẵn sàng')).toBe('san sang');
    expect(normalizeDescText('Dong dong co')).toBe('dong dong co');
    expect(normalizeDescText('Rückmeldung Lauf')).toBe('ruckmeldung lauf');
    expect(normalizeDescText('Überlast')).toBe('uberlast');
    expect(normalizeDescText('Đặt  tốc độ')).toBe('dat toc do');
    expect(normalizeDescText('  High-high   level ')).toBe('high-high level');
  });

  it('multi-word → chứa chuỗi', () => {
    expect(descKeywordMatches('sẵn sàng', 'San sang')).toBe(true);
    expect(descKeywordMatches('phản hồi chạy', 'Phan hoi chay')).toBe(true);
    expect(descKeywordMatches('đặt vị trí', 'Dat vi tri')).toBe(true);
    expect(descKeywordMatches('mức rất cao', 'High-high level')).toBe(false);
  });

  it('một từ: whole-word, hoặc prefix khi len ≥ 4', () => {
    expect(descKeywordMatches('lauf', 'Laufbefehl')).toBe(true);
    expect(descKeywordMatches('measure', 'Measured value')).toBe(true);
    expect(descKeywordMatches('dòng', 'Dong dong co')).toBe(true);
    expect(descKeywordMatches('füllstand', 'Fullstand')).toBe(true);
    expect(descKeywordMatches('vfd', 'VFD fault OK')).toBe(true);
    expect(descKeywordMatches('high', 'High-high level')).toBe(true);
  });

  it('từ khóa ≤ 3 ký tự chỉ khớp whole-word', () => {
    expect(descKeywordMatches('mo', 'Motor')).toBe(false);
    expect(descKeywordMatches('mo', 'Remote mode')).toBe(false);
    expect(descKeywordMatches('cur', 'Current')).toBe(false);
    expect(descKeywordMatches('cur', 'CUR')).toBe(true);
  });
});

// Nhóm M01 thật (fixture dòng 7–16 + dòng dup 81) — Bảng 1 §31.
function m01GroupInputs(): SuggestInput[] {
  const rows: Array<{ tag: string; kind: SignalKind; description: string; row: number }> = [
    { tag: 'CR01_M01_RUN_CMD', kind: 'DO', description: 'Laufbefehl', row: 7 },
    { tag: 'CR01_M01_RUN_FBK', kind: 'DI', description: 'Run feedback', row: 8 },
    { tag: 'CR01_M01_READY', kind: 'DI', description: 'San sang', row: 9 },
    { tag: 'CR01_M01_REMOTE', kind: 'DI', description: 'Remote mode', row: 10 },
    { tag: 'CR01_M01_OVL_OK', kind: 'DI', description: 'Overload OK', row: 11 },
    { tag: 'CR01_M01_CUR', kind: 'AI', description: 'Dong dong co', row: 12 },
    { tag: 'CR01_M01_TEMP', kind: 'AI', description: 'Temperature', row: 13 },
    { tag: 'CR01_M01_VIB', kind: 'AI', description: 'Vibration', row: 14 },
    { tag: 'CR01_M01_PWR', kind: 'AI', description: 'Leistung', row: 15 },
    { tag: 'CR01_M01_ESTOP', kind: 'DI', description: 'Dung khan cap', row: 16 },
    { tag: 'CR01_M01_REMOTE', kind: 'AI', description: 'Mo-men', row: 81 },
  ];
  return rows.map((r) =>
    mkInput({ tag: r.tag, kind: r.kind, description: r.description, row: r.row }),
  );
}

function m01Group(): SignalGroup {
  const groups = groupSignals(m01GroupInputs());
  expect(groups).toHaveLength(1);
  const g = groups.find((x) => x.equipmentId === 'CR01_M01');
  expect(g).toBeDefined();
  return g as SignalGroup;
}

function signalOf(group: SignalGroup, tag: string, row?: number): GroupedSignal {
  const found = group.signals.find(
    (s) => s.input.tag === tag && (row === undefined || s.input.row === row),
  );
  expect(found).toBeDefined();
  return found as GroupedSignal;
}

function singleGroup(inputs: SuggestInput[]): SignalGroup {
  const groups = groupSignals(inputs);
  if (groups.length !== 1) throw new Error(`expected 1 group, got ${String(groups.length)}`);
  const g = groups[0];
  if (g === undefined) throw new Error('no group');
  return g;
}

function roleOf(model: EquipmentModel, roleName: string): RoleDef {
  const role = model.roles.find((r) => r.role === roleName);
  if (role === undefined) throw new Error(`no role ${roleName}`);
  return role;
}

describe('scoreRole (Bảng 1 §31)', () => {
  it('6 role đúng = 1.00, thừa tốt nhất 0.2', () => {
    const g = m01Group();
    const cases: Array<[string, string, number]> = [
      ['CR01_M01_RUN_CMD', 'runCmd', 1.0],
      ['CR01_M01_RUN_FBK', 'runFb', 1.0],
      ['CR01_M01_READY', 'ready', 1.0],
      ['CR01_M01_REMOTE', 'remote', 1.0],
      ['CR01_M01_OVL_OK', 'overloadOk', 1.0],
      ['CR01_M01_CUR', 'currentFb', 1.0],
    ];
    for (const [tag, roleName, expected] of cases) {
      expect(scoreRole(roleOf(motorDolModel, roleName), signalOf(g, tag))).toBeCloseTo(
        expected,
        9,
      );
    }
    expect(
      scoreRole(roleOf(motorDolModel, 'currentFb'), signalOf(g, 'CR01_M01_TEMP')),
    ).toBeCloseTo(0.2, 9);
    // Dòng dup row 81 (REMOTE, AI, 'Mo-men'): exact +0.6, kind −0.5, desc 0 → 0.1.
    expect(
      scoreRole(roleOf(motorDolModel, 'remote'), signalOf(g, 'CR01_M01_REMOTE', 81)),
    ).toBeCloseTo(0.1, 9);
  });

  it('roleOverrides (OQ-370): RUN_ST → runFb exact, chặn exact của runCmd', () => {
    const group = singleGroup([
      mkInput({ tag: 'CR01_M01_RUN_ST', kind: 'DI', description: '', row: 1 }),
    ]);
    const s = signalOf(group, 'CR01_M01_RUN_ST');
    // runFb: override exact +0.6 + kind DI +0.2 = 0.8.
    expect(scoreRole(roleOf(motorDolModel, 'runFb'), s)).toBeCloseTo(0.8, 9);
    // runCmd: exact bị chặn; chứa biên 'RUN' +0.4, kind DO vs DI −0.5 → −0.1.
    expect(scoreRole(roleOf(motorDolModel, 'runCmd'), s)).toBeCloseTo(-0.1, 9);
  });

  it('chứa ở biên +0.4: RUN_CMD_1 chứa RUN_CMD', () => {
    const group = singleGroup([
      mkInput({ tag: 'CR01_M01_RUN_CMD_1', kind: 'DO', description: '', row: 1 }),
    ]);
    const s = signalOf(group, 'CR01_M01_RUN_CMD_1');
    expect(scoreRole(roleOf(motorDolModel, 'runCmd'), s)).toBeCloseTo(0.6, 9);
  });

  it('kind null → không cộng/trừ kind', () => {
    const group = singleGroup([
      mkInput({ tag: 'CR01_M01_RUN_CMD', kind: null, description: '', row: 1 }),
    ]);
    const s = signalOf(group, 'CR01_M01_RUN_CMD');
    expect(scoreRole(roleOf(motorDolModel, 'runCmd'), s)).toBeCloseTo(0.6, 9);
  });
});

describe('scoreModel (Bảng 1–4 §31)', () => {
  it('M01: motor_dol 0.6, motor_vfd −0.1', () => {
    const scores = scoreModel(m01Group());
    expect(scores[0]?.model).toBe('motor_dol');
    expect(scores[0]?.score).toBeCloseTo(0.6, 9);
    expect(scores[0]?.coverage).toBeCloseTo(1, 9);
    const vfd = scores.find((s) => s.model === 'motor_vfd');
    expect(vfd?.score).toBeCloseTo(-0.1, 9);
    expect(vfd?.coverage).toBeCloseTo(0.5, 9);
  });

  it('MV01 (Bảng 2): motor_vfd 0.9, motor_dol −0.1', () => {
    const rows: Array<{ tag: string; kind: SignalKind; description: string; row: number }> = [
      { tag: 'CR01_MV01_RUN_CMD', kind: 'DO', description: 'Run command', row: 47 },
      { tag: 'CR01_MV01_SPEED_REF', kind: 'AO', description: 'Speed setpoint', row: 48 },
      { tag: 'CR01_MV01_RUNNING', kind: 'DI', description: 'Run feedback', row: 49 },
      { tag: 'CR01_MV01_SPEED_FB', kind: 'AI', description: 'Speed feedback', row: 50 },
      { tag: 'CR01_MV01_READY', kind: 'DI', description: 'Ready', row: 51 },
      { tag: 'CR01_MV01_VFD_OK', kind: 'DI', description: 'VFD fault OK', row: 52 },
      { tag: 'CR01_MV01_REMOTE', kind: 'DI', description: 'Remote mode', row: 53 },
      { tag: 'CR01_MV01_CUR', kind: 'AI', description: 'Dong dong co', row: 54 },
      { tag: 'CR01_MV01_TEMP', kind: 'AI', description: 'Temperature', row: 55 },
      { tag: 'CR01_MV01_VIB', kind: 'AI', description: 'Do rung', row: 56 },
      { tag: 'CR01_MV01_PWR', kind: 'AI', description: 'Cong suat', row: 57 },
    ];
    const groups = groupSignals(
      rows.map((r) =>
        mkInput({ tag: r.tag, kind: r.kind, description: r.description, row: r.row }),
      ),
    );
    const g = groups.find((x) => x.equipmentId === 'CR01_MV01');
    expect(g).toBeDefined();
    const scores = scoreModel(g as SignalGroup);
    expect(scores[0]?.model).toBe('motor_vfd');
    expect(scores[0]?.score).toBeCloseTo(0.9, 9);
    expect(scores[0]?.coverage).toBeCloseTo(1, 9);
    const dol = scores.find((s) => s.model === 'motor_dol');
    expect(dol?.score).toBeCloseTo(-0.1, 9);
  });

  it('LT01 + BIN01 (Bảng 3): analog_sensor 0.8, silo_bin 0.6', () => {
    const lt = groupSignals([
      mkInput({ tag: 'CR01_LT01_RAW', kind: 'AI', description: 'Measured value', row: 112 }),
      mkInput({ tag: 'CR01_LT01_BYPASS', kind: 'DI', description: 'Bo qua', row: 113 }),
    ]);
    const ltGroup = lt.find((x) => x.equipmentId === 'CR01_LT01');
    const ltScores = scoreModel(ltGroup as SignalGroup);
    expect(ltScores[0]?.model).toBe('analog_sensor');
    expect(ltScores[0]?.score).toBeCloseTo(0.8, 9);
    const bin = groupSignals([
      mkInput({ tag: 'CR01_BIN01_LEVEL_RAW', kind: 'AI', description: 'Fullstand', row: 133 }),
      mkInput({ tag: 'CR01_BIN01_LEVEL_HIGH', kind: 'DI', description: 'High level', row: 134 }),
      mkInput({ tag: 'CR01_BIN01_LEVEL_LOW', kind: 'DI', description: 'Low level', row: 135 }),
      mkInput({ tag: 'CR01_BIN01_LEVEL_HIGH_HIGH', kind: 'DI', description: 'High-high level', row: 136 }),
      mkInput({ tag: 'CR01_BIN01_WEIGHT', kind: 'AI', description: 'Khoi luong', row: 137 }),
      mkInput({ tag: 'CR01_BIN01_TEMP', kind: 'AI', description: 'Nhiet do', row: 138 }),
      mkInput({ tag: 'CR01_BIN01_DUST', kind: 'DI', description: 'Bao bui', row: 139 }),
    ]);
    const binGroup = bin.find((x) => x.equipmentId === 'CR01_BIN01');
    const binScores = scoreModel(binGroup as SignalGroup);
    expect(binScores[0]?.model).toBe('silo_bin');
    expect(binScores[0]?.score).toBeCloseTo(0.6, 9);
    expect(binScores[0]?.coverage).toBeCloseTo(1, 9);
  });

  it('tie Bảng 4 (hiệu đính — xem STATE §31): dol 0.6 = vfd 0.6, chênh 0', () => {
    // Bảng 4 viết 'XX_M01_*' nhưng XX không khớp area [A-Z]{2}\d{2} của
    // pattern mặc định (sẽ rớt LCP, tách 2 nhóm) — dùng CR99 để giữ đúng
    // 1 nhóm; eqcode 'M01' nên điểm prefix/chữ ký như Bảng 4. Bảng 4
    // tính dol 0.7 (thừa 0) là sai số tay: SPEED_REF (AO) không đạt
    // ≥ 0.4 cho role nào của dol → thừa −0.1 → dol 0.6, chênh 0.0.
    const groups = groupSignals([
      mkInput({ tag: 'CR99_M01_RUN_CMD', kind: 'DO', description: '', row: 1 }),
      mkInput({ tag: 'CR99_M01_SPEED_REF', kind: 'AO', description: '', row: 2 }),
      mkInput({ tag: 'CR99_M01_RUN_FB', kind: 'DI', description: '', row: 3 }),
    ]);
    expect(groups).toHaveLength(1);
    const scores = scoreModel(groups[0] as SignalGroup);
    const dol = scores.find((s) => s.model === 'motor_dol');
    const vfd = scores.find((s) => s.model === 'motor_vfd');
    expect(dol?.score).toBeCloseTo(0.6, 9);
    expect(vfd?.score).toBeCloseTo(0.6, 9);
    expect(Math.abs((dol?.score ?? 0) - (vfd?.score ?? 0))).toBeLessThanOrEqual(0.1);
  });

  it('damper (OQ-377): DMP → damper, roles = valve_ctrl', () => {
    const groups = groupSignals([
      mkInput({ tag: 'CR01_DMP01_POS_REF', kind: 'AO', description: 'Dat vi tri', row: 1 }),
      mkInput({ tag: 'CR01_DMP01_POS_FB', kind: 'AI', description: 'Phan hoi vi tri', row: 2 }),
    ]);
    const g = groups.find((x) => x.equipmentId === 'CR01_DMP01');
    const scores = scoreModel(g as SignalGroup);
    expect(scores[0]?.model).toBe('damper');
    expect(scores[0]?.score).toBeCloseTo(1.2, 9);
  });

  it('eqcodeLetters: MV thắng M (OQ-369)', () => {
    expect(eqcodeLetters('CR01_MV02')).toBe('MV');
    expect(eqcodeLetters('CR01_M01')).toBe('M');
    expect(eqcodeLetters('CR01_SILO01')).toBe('SILO');
    expect(eqcodeLetters('')).toBe('');
  });
});

describe('assignRoles + equipmentConfidence', () => {
  it('M01: gán 6 role, thừa 5 (kể cả dup row 81)', () => {
    const g = m01Group();
    const { assigned, unassigned } = assignRoles(g, motorDolModel);
    expect(assigned.map((a) => `${a.input.tag}@${String(a.input.row)}:${a.role}`)).toEqual([
      'CR01_M01_CUR@12:currentFb',
      'CR01_M01_OVL_OK@11:overloadOk',
      'CR01_M01_READY@9:ready',
      'CR01_M01_REMOTE@10:remote',
      'CR01_M01_RUN_CMD@7:runCmd',
      'CR01_M01_RUN_FBK@8:runFb',
    ]);
    expect(assigned.every((a) => a.confidence === 1)).toBe(true);
    expect(unassigned.map((s) => s.input.tag)).toEqual([
      'CR01_M01_ESTOP',
      'CR01_M01_PWR',
      'CR01_M01_REMOTE',
      'CR01_M01_TEMP',
      'CR01_M01_VIB',
    ]);
  });

  it('equipmentConfidence: 0.80/0.95/0.90/0.80 đúng Bảng 1–3 (eps OQ-361)', () => {
    expect(SUGGEST_EPS).toBe(1e-9);
    // Giá trị nằm ngay biên làm tròn IEEE754: điểm thô 0.5+0.4−0.3 =
    // 0.6000000000000001 (không phải 0.6) — confidence tính ra đúng 0.8
    // với thứ tự phép tính này, nhưng chỉ cần đổi thứ tự cộng là có thể
    // rơi xuống 0.7999999999999999 (số plan nêu) — nên so sánh với eps
    // 1e-9 thay vì so thẳng với 0.8 (OQ-361).
    const rawScore = scoreModel(m01Group())[0]?.score ?? 0;
    expect(rawScore).toBeCloseTo(0.6, 9);
    expect(Math.abs(rawScore - 0.6)).toBeLessThan(SUGGEST_EPS);
    const required = motorDolModel.roles.filter((r) => r.optional !== true);
    const assigned6 = assignRoles(m01Group(), motorDolModel).assigned;
    expect(assigned6).toHaveLength(6);
    const conf = equipmentConfidence(rawScore, assigned6, required);
    expect(conf + SUGGEST_EPS).toBeGreaterThanOrEqual(0.8);
    expect(conf).toBeCloseTo(0.8, 9);
    expect(equipmentConfidence(0.9, assigned6, required)).toBeCloseTo(0.95, 9);
    // Thiếu 1 role bắt buộc → −0.15.
    const missingOne = assigned6.filter((a) => a.role !== 'runCmd');
    expect(equipmentConfidence(0.6, missingOne, required)).toBeCloseTo(0.65, 9);
    // Không có tín hiệu gán → trung bình 0; clamp dưới 0.
    expect(equipmentConfidence(-0.1, [], required)).toBeCloseTo(0, 9);
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
  });
});

describe('descKeywords vi/de (OQ-364, Bảng 6 §31)', () => {
  it('motor_dol/motor_vfd/valve_ctrl/silo/conveyor có từ khóa vi/de', () => {
    const kw = (model: string, role: string): string[] => {
      const m = defaultRegistry.get(model);
      return m?.roles.find((r) => r.role === role)?.descKeywords ?? [];
    };
    expect(kw('motor_dol', 'runCmd')).toEqual(
      expect.arrayContaining(['chạy', 'khởi động', 'lauf', 'einschalten']),
    );
    expect(kw('motor_dol', 'runFb')).toEqual(
      expect.arrayContaining(['phản hồi chạy', 'đang chạy', 'rückmeldung', 'läuft']),
    );
    expect(kw('motor_dol', 'ready')).toEqual(
      expect.arrayContaining(['sẵn sàng', 'bereit', 'betriebsbereit']),
    );
    expect(kw('motor_vfd', 'speedRef')).toEqual(
      expect.arrayContaining(['tốc độ đặt', 'đặt tốc độ', 'drehzahl', 'sollwert']),
    );
    expect(kw('motor_vfd', 'vfdFaultOk')).toEqual(
      expect.arrayContaining(['lỗi biến tần', 'umrichter']),
    );
    expect(kw('valve_ctrl', 'posRef')).toEqual(
      expect.arrayContaining(['vị trí', 'đặt vị trí', 'stellung', 'sollwert']),
    );
    expect(kw('valve_ctrl', 'posFb')).toEqual(
      expect.arrayContaining(['vị trí', 'phản hồi vị trí', 'stellung', 'istwert']),
    );
    expect(kw('silo_bin', 'levelHighHigh')).toEqual(
      expect.arrayContaining(['mức rất cao', 'hoch']),
    );
    expect(kw('conveyor_simple', 'zeroSpeed')).toEqual(
      expect.arrayContaining(['dừng', 'đứng yên', 'stillstand']),
    );
    expect(kw('analog_sensor', 'raw')).toEqual(
      expect.arrayContaining(['đo', 'giá trị đo', 'messwert']),
    );
    expect(kw('switch_di', 'di')).toEqual(
      expect.arrayContaining(['công tắc', 'tiếp điểm', 'schalter', 'kontakt']),
    );
    // damper derive từ valve_ctrl → hưởng descKeywords của valve_ctrl.
    expect(kw('damper', 'posRef')).toEqual(kw('valve_ctrl', 'posRef'));
    // Synonym không đổi (chỉ thêm descKeywords).
    expect(defaultRegistry.get('motor_dol')?.roles.find((r) => r.role === 'runCmd')?.synonyms).toEqual(
      ['RUN_CMD', 'START_CMD', 'RUN', 'START', 'CMD', 'BETRIEB_BEFEHL'],
    );
  });
});

// Test suggest() bước 6 (M2 §9.1, P2.7 commit 4, OQ-365/367/378).

describe('suggest()', () => {
  it('M01: 1 suggestion motor_dol confident, 6 signals, stats khớp', () => {
    const inputs = m01GroupInputs();
    const r = suggest(inputs);
    expect(r.suggestions).toHaveLength(1);
    const s = r.suggestions.find((x) => x.equipmentId === 'CR01_M01');
    expect(s?.model).toBe('motor_dol');
    expect(s?.status).toBe('confident');
    expect(s?.confidence).toBeCloseTo(0.8, 9);
    expect(s?.signals.map((x) => `${x.tag}@${String(x.row)}:${x.role}`)).toEqual([
      'CR01_M01_CUR@12:currentFb',
      'CR01_M01_OVL_OK@11:overloadOk',
      'CR01_M01_READY@9:ready',
      'CR01_M01_REMOTE@10:remote',
      'CR01_M01_RUN_CMD@7:runCmd',
      'CR01_M01_RUN_FBK@8:runFb',
    ]);
    expect(s?.missingRequiredRoles).toEqual([]);
    expect(s?.modelCandidates).toBeUndefined();
    expect(s?.signals.find((x) => x.role === 'runCmd')?.reasons).toEqual([
      'exact synonym RUN_CMD',
      'description keyword lauf',
      'kind DO matches',
    ]);
    expect(r.stats).toEqual({
      totalTags: 11,
      assignedTags: 6,
      confident: 1,
      review: 0,
      unmatched: 0,
    });
    expect(r.unassignedTags.map((u) => u.tag)).toEqual([
      'CR01_M01_ESTOP',
      'CR01_M01_PWR',
      'CR01_M01_REMOTE',
      'CR01_M01_TEMP',
      'CR01_M01_VIB',
    ]);
    expect(
      r.unassignedTags.every((u) => u.reasons.includes('no role ≥ 0.4')),
    ).toBe(true);
  });

  it('tie Bảng 4: review + modelCandidates top-2 bất kể confidence', () => {
    // Desc thật → 2 role 1.00, avg 1.00, conf = 0.5×0.6+0.5×1.0 = 0.8
    // (đủ confident theo số) nhưng chênh model 0.0 ≤ 0.1 → vẫn review.
    const r = suggest([
      mkInput({ tag: 'CR99_M01_RUN_CMD', kind: 'DO', description: 'Run command', row: 1 }),
      mkInput({ tag: 'CR99_M01_SPEED_REF', kind: 'AO', description: 'Speed setpoint', row: 2 }),
      mkInput({ tag: 'CR99_M01_RUN_FB', kind: 'DI', description: 'Run feedback', row: 3 }),
    ]);
    expect(r.suggestions).toHaveLength(1);
    const s = r.suggestions[0];
    expect(s?.model).toBe('motor_dol');
    expect(s?.confidence).toBeCloseTo(0.8, 9);
    expect(s?.status).toBe('review');
    expect(s?.modelCandidates).toHaveLength(2);
    expect(s?.modelCandidates?.[0]?.model).toBe('motor_dol');
    expect(s?.modelCandidates?.[0]?.score).toBeCloseTo(0.6, 9);
    expect(s?.modelCandidates?.[1]?.model).toBe('motor_vfd');
    expect(s?.modelCandidates?.[1]?.score).toBeCloseTo(0.6, 9);
    expect(s?.signals.map((x) => x.role)).toEqual(['runCmd', 'runFb']);
    expect(r.unassignedTags.map((u) => u.tag)).toEqual(['CR99_M01_SPEED_REF']);
  });

  it('dup tag cùng điểm: row sau → "duplicate tag — role taken by row N"', () => {
    const r = suggest([
      mkInput({ tag: 'CR01_M01_RUN_CMD', kind: 'DO', description: 'Run command', row: 7 }),
      mkInput({ tag: 'CR01_M01_RUN_CMD', kind: 'DO', description: 'Run command', row: 99 }),
    ]);
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0]?.signals).toHaveLength(1);
    expect(r.suggestions[0]?.signals[0]?.row).toBe(7);
    expect(r.unassignedTags).toHaveLength(1);
    expect(r.unassignedTags[0]?.reasons).toEqual(['duplicate tag — role taken by row 7']);
  });

  it('hai tag khác tranh 1 role: kẻ thua → "role taken by <tag> (row N)"', () => {
    const r = suggest([
      mkInput({ tag: 'CR01_M01_RUN_CMD', kind: 'DO', description: '', row: 7 }),
      mkInput({ tag: 'CR01_M01_START_CMD', kind: 'DO', description: '', row: 99 }),
    ]);
    expect(r.unassignedTags).toHaveLength(1);
    expect(r.unassignedTags[0]?.tag).toBe('CR01_M01_START_CMD');
    expect(r.unassignedTags[0]?.reasons).toEqual([
      'role runCmd taken by CR01_M01_RUN_CMD (row 7)',
    ]);
  });

  it('record tagDef null → unassigned với lý do mã lỗi (OQ-365)', () => {
    const bad = mkSignal({ tag: '', row: 5 });
    const inputs = normalizedSignalsToInputs([bad]);
    const r = suggest(inputs);
    expect(r.suggestions).toHaveLength(0);
    expect(r.unassignedTags).toEqual([
      { tag: '', reasons: ['invalid record (tagDef null): IO-E002'] },
    ]);
    expect(r.stats.totalTags).toBe(1);
    expect(r.stats.assignedTags).toBe(0);
  });

  it('nhóm không gán được gì: confidence 0 nhưng tie dol/silo 0.1 → review (OQ-367)', () => {
    // TEMP đơn: dol 0.4 (prefix 0.5 + coverage 0 − thừa 0.1), silo_bin
    // 0.3 (coverage mặc định 1.0 → +0.4 − thừa 0.1) — chênh đúng 0.1
    // → tie ép review bất kể confidence (quy tắc OQ-367 không trừ
    // nhóm rỗng; xem STATE §31 commit 4).
    const r = suggest([
      mkInput({ tag: 'CR01_M01_TEMP', kind: 'AI', description: 'Temperature', row: 13 }),
    ]);
    expect(r.suggestions).toHaveLength(1);
    const s = r.suggestions[0];
    expect(s?.model).toBe('motor_dol');
    expect(s?.status).toBe('review');
    expect(s?.confidence).toBe(0);
    expect(s?.signals).toEqual([]);
    expect(s?.missingRequiredRoles).toEqual(['runCmd', 'runFb']);
    expect(s?.modelCandidates).toHaveLength(2);
    expect(s?.modelCandidates?.[0]?.model).toBe('motor_dol');
    expect(s?.modelCandidates?.[0]?.score).toBeCloseTo(0.4, 9);
    expect(s?.modelCandidates?.[1]?.model).toBe('silo_bin');
    expect(s?.modelCandidates?.[1]?.score).toBeCloseTo(0.3, 9);
    expect(r.unassignedTags).toHaveLength(1);
  });

  it('inputs rỗng → kết quả rỗng', () => {
    expect(suggest([])).toEqual({
      suggestions: [],
      unassignedTags: [],
      stats: { totalTags: 0, assignedTags: 0, confident: 0, review: 0, unmatched: 0 },
    });
  });
});

// OQ-381 đã quyết ở P2.8 (OQ-391): thêm 'FB' vào synonyms runFb
// (motor_dol + motor_vfd) → RUN_FB (roleToken 'FB') khớp synonym:
// 0.6 synonym + 0.2 kind = 0.8, gán được. Hành vi cũ (0.2) chỉ đúng
// trước khi quyết; không sửa test để xanh — hành vi đổi theo quyết định.
describe('synonym gap FB (OQ-381) — đã quyết P2.8 (OQ-391)', () => {
  it("RUN_FB (LCP, roleToken 'FB') → runFb 0.8 (synonym + kind), gán được", () => {
    const groups = groupSignals([
      mkInput({ tag: 'RUN_FB', kind: 'DI', description: '', row: 5 }),
      mkInput({ tag: 'RUN_CMD', kind: 'DO', description: '', row: 7 }),
    ]);
    expect(groups).toHaveLength(1);
    const g = groups[0] as SignalGroup;
    expect(g.equipmentId).toBe('RUN');
    const fb = g.signals.find((s) => s.input.tag === 'RUN_FB');
    expect(fb?.parsed.roleToken).toBe('FB');
    const runFb = motorDolModel.roles.find((r) => r.role === 'runFb') as RoleDef;
    expect(fb !== undefined ? scoreRole(runFb, fb) : -1).toBeCloseTo(0.8, 9);
    // RUN_CMD vẫn khớp (token CMD là synonym runCmd).
    const cmd = g.signals.find((s) => s.input.tag === 'RUN_CMD');
    const runCmd = motorDolModel.roles.find((r) => r.role === 'runCmd') as RoleDef;
    expect(cmd !== undefined ? scoreRole(runCmd, cmd) : -1).toBeCloseTo(0.8, 9);
  });
});
