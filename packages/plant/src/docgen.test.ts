// Docgen thiết bị (P2.2 — OQ-260/261).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { generateEquipmentMarkdown } from './docgen.js';
import { motorDolModel } from './models/motor_dol.js';
import { fakeMotorModel } from './test-helpers.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('generateEquipmentMarkdown (OQ-260)', () => {
  it('md motor_dol chứa đủ bảng roles/params/observables/faults/presets/states', () => {
    const md = generateEquipmentMarkdown(motorDolModel);
    expect(md).toContain('# motor_dol');
    expect(md).toContain('## Roles');
    expect(md).toContain('| `runCmd` | DO | Bool | có |');
    expect(md).toContain('| `currentFb` | AI | Int (A) | không |');
    expect(md).toContain('## Tham số');
    expect(md).toContain(
      '| `startDelayMs` | `500` | Thời gian từ lệnh chạy đến khi runFb lên (ms). |',
    );
    expect(md).toContain('| `overloadNC` | `true` |');
    expect(md).toContain('## Observables');
    expect(md).toContain('| `speedPct` |');
    expect(md).toContain('## Lỗi thiết bị');
    expect(md).toContain('| `overload` |');
    expect(md).toContain('## Preset');
    expect(md).toContain('| `overloadTrip` | equipment `overload` |');
    expect(md).toContain('| `noRunFeedback` | signal stuck trên `runFb` |');
    expect(md).toContain('## Trạng thái');
    expect(md).toContain('| `TRIPPED` |');
    expect(md).toContain('## Chuyển đổi');
    expect(md).toContain('1. overload active và state ∈ {STARTING, RUNNING}');
    expect(md).toContain('## Ghi chú');
    expect(md).toContain('OQ-259');
  });

  it('model không có docs → không có mục Trạng thái/Chuyển đổi/Ghi chú', () => {
    const md = generateEquipmentMarkdown(fakeMotorModel);
    expect(md).toContain('# fake_motor');
    expect(md).not.toContain('## Trạng thái');
    expect(md).not.toContain('## Chuyển đổi');
    expect(md).not.toContain('## Ghi chú');
    expect(md).toContain('## Roles');
  });

  it('tất định: hai lần sinh giống hệt, kết thúc bằng \\n', () => {
    const a = generateEquipmentMarkdown(motorDolModel);
    const b = generateEquipmentMarkdown(motorDolModel);
    expect(a).toBe(b);
    expect(a.endsWith('\n')).toBe(true);
    expect(a).not.toContain('\r');
  });

  it('file commit docs/equipment/motor_dol.md khớp đúng output sinh (OQ-261)', () => {
    const committed = readFileSync(`${ROOT}docs/equipment/motor_dol.md`, 'utf8');
    expect(committed).toBe(generateEquipmentMarkdown(motorDolModel));
  });
});
