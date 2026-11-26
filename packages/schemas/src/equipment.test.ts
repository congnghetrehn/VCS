// Schema plant (M2 §4.3, §6) — equipment/naming/import-profile/fault.

import { describe, expect, it } from 'vitest';

import { equipmentFileSchema, equipmentInstanceSchema, sourceSpecSchema } from './equipment.js';
import { faultInfoSchema, faultRequestSchema, faultTimingSchema, signalFaultTypeSchema } from './fault.js';
import { importProfileSchema } from './import-profile.js';
import { namingConfigSchema } from './naming.js';

describe('sourceSpecSchema', () => {
  it('manual/const hợp lệ', () => {
    expect(sourceSpecSchema.parse({ kind: 'manual' }).kind).toBe('manual');
    expect(sourceSpecSchema.parse({ kind: 'const', value: 42 }).value).toBe(42);
  });

  it('ramp đủ from/to/durationMs', () => {
    const s = sourceSpecSchema.parse({ kind: 'ramp', from: 0, to: 100, durationMs: 1000 });
    expect(s.from).toBe(0);
    expect(s.to).toBe(100);
  });

  it('ramp thiếu from → lỗi', () => {
    expect(() => sourceSpecSchema.parse({ kind: 'ramp', to: 100, durationMs: 1000 })).toThrow();
  });

  it('ramp thiếu durationMs → lỗi', () => {
    expect(() => sourceSpecSchema.parse({ kind: 'ramp', from: 0, to: 100 })).toThrow();
  });

  it('sine đủ periodMs/amplitude (+offset)', () => {
    const s = sourceSpecSchema.parse({ kind: 'sine', periodMs: 2000, amplitude: 10, offset: 50 });
    expect(s.offset).toBe(50);
  });

  it('sine thiếu amplitude → lỗi', () => {
    expect(() => sourceSpecSchema.parse({ kind: 'sine', periodMs: 2000 })).toThrow();
  });

  it('link đủ equipment/observable', () => {
    const s = sourceSpecSchema.parse({ kind: 'link', equipment: 'CR01_M01', observable: 'currentA' });
    expect(s.equipment).toBe('CR01_M01');
  });

  it('link thiếu observable → lỗi', () => {
    expect(() => sourceSpecSchema.parse({ kind: 'link', equipment: 'CR01_M01' })).toThrow();
  });

  it('kind lạ → lỗi', () => {
    expect(() => sourceSpecSchema.parse({ kind: 'random' })).toThrow();
  });

  it('khóa lạ bị strip (quy ước zod của repo)', () => {
    const s = sourceSpecSchema.parse({ kind: 'const', value: 5, bogus: 1 });
    expect('bogus' in s).toBe(false);
  });
});

describe('equipmentInstanceSchema', () => {
  it('tối thiểu chỉ cần id + model', () => {
    const e = equipmentInstanceSchema.parse({ id: 'CR01_M01', model: 'motor_dol' });
    expect(e.id).toBe('CR01_M01');
    expect(e.params).toBeUndefined();
  });

  it('đầy đủ params/signals/source', () => {
    const e = equipmentInstanceSchema.parse({
      id: 'CR01_M01',
      model: 'motor_dol',
      params: { startDelayMs: 500 },
      signals: { runCmd: 'CR01_M01_RUN_CMD' },
      source: { kind: 'const', value: 0 },
    });
    expect(e.signals?.['runCmd']).toBe('CR01_M01_RUN_CMD');
    expect(e.source?.kind).toBe('const');
  });

  it('id rỗng → lỗi', () => {
    expect(() => equipmentInstanceSchema.parse({ id: '', model: 'motor_dol' })).toThrow();
  });

  it('controller §4.2 được giữ (optional)', () => {
    const e = equipmentInstanceSchema.parse({
      id: 'CR01_M01',
      model: 'motor_dol',
      controller: 'PLC1',
    });
    expect(e.controller).toBe('PLC1');
  });

  it('khóa lạ (description/initial §4.2) bị strip', () => {
    const e = equipmentInstanceSchema.parse({
      id: 'CR01_M01',
      model: 'motor_dol',
      description: 'Crusher main motor',
      initial: {},
    });
    expect('description' in e).toBe(false);
    expect('initial' in e).toBe(false);
  });
});

describe('equipmentFileSchema — plant/equipment.yaml (M2 §4.2, P2.4)', () => {
  it('danh sách 2 thiết bị hợp lệ (kèm controller)', () => {
    const f = equipmentFileSchema.parse([
      { id: 'CR01_M01', model: 'motor_dol', controller: 'PLC1', params: { startDelayMs: 500 } },
      { id: 'CR01_LT01', model: 'analog_sensor', source: { kind: 'const', value: 0 } },
    ]);
    expect(f).toHaveLength(2);
    expect(f[0]?.controller).toBe('PLC1');
  });

  it('danh sách rỗng hợp lệ', () => {
    expect(equipmentFileSchema.parse([])).toEqual([]);
  });

  it('phần tử thiếu model → lỗi', () => {
    expect(() => equipmentFileSchema.parse([{ id: 'X' }])).toThrow();
  });

  it('không phải mảng → lỗi', () => {
    expect(() => equipmentFileSchema.parse({ id: 'CR01_M01', model: 'motor_dol' })).toThrow();
  });
});

describe('namingConfigSchema', () => {
  it('mặc định start=1, step=1, minDigits=2', () => {
    const n = namingConfigSchema.parse({ template: 'CR01_M{n:02}' });
    expect(n.start).toBe(1);
    expect(n.step).toBe(1);
    expect(n.minDigits).toBe(2);
  });

  it('giá trị tùy chỉnh', () => {
    const n = namingConfigSchema.parse({ template: 'M{n:3}', start: 0, step: 5, minDigits: 3 });
    expect(n.step).toBe(5);
  });

  it('minDigits ngoài 1..6 → lỗi', () => {
    expect(() => namingConfigSchema.parse({ template: 'M{n}', minDigits: 0 })).toThrow();
    expect(() => namingConfigSchema.parse({ template: 'M{n}', minDigits: 7 })).toThrow();
  });

  it('template rỗng → lỗi', () => {
    expect(() => namingConfigSchema.parse({ template: '' })).toThrow();
  });
});

describe('importProfileSchema', () => {
  const base = {
    name: 'Siemens IO',
    format: 'csv' as const,
    columns: { tagName: 'Tag', address: 'Address', type: 'Type' },
    naming: { template: 'CR01_{n:02}' },
  };

  it('csv hợp lệ, strip mặc định []', () => {
    const p = importProfileSchema.parse(base);
    expect(p.format).toBe('csv');
    expect(p.strip).toEqual([]);
  });

  it('xlsx hợp lệ', () => {
    expect(importProfileSchema.parse({ ...base, format: 'xlsx' }).format).toBe('xlsx');
  });

  it('thiếu columns.tagName → lỗi', () => {
    expect(() => importProfileSchema.parse({ ...base, columns: { address: 'Address' } })).toThrow();
  });

  it('format lạ → lỗi', () => {
    expect(() => importProfileSchema.parse({ ...base, format: 'pdf' })).toThrow();
  });
});

describe('fault schemas', () => {
  it('14 loại lỗi tín hiệu đều parse được', () => {
    const types = [
      'offset', 'gain', 'drift', 'noise', 'spike', 'stuck', 'freeze', 'invert', 'delay',
      'wireBreak', 'outOfRange', 'chatter', 'lost', 'stuckCmd',
    ];
    for (const t of types) expect(signalFaultTypeSchema.parse(t)).toBe(t);
    expect(types).toHaveLength(14);
  });

  it('loại lỗi lạ → lỗi', () => {
    expect(() => signalFaultTypeSchema.parse('explode')).toThrow();
  });

  it('FaultRequest tối thiểu: when mặc định {at:"now"}', () => {
    const r = faultRequestSchema.parse({ target: { equipment: 'CR01_M01', fault: 'noStart' } });
    expect(r.when).toEqual({ at: 'now' });
    expect(r.durationMs).toBeUndefined();
  });

  it('FaultRequest không có repeat/random — khóa lạ bị strip (P1 hoãn)', () => {
    const r = faultRequestSchema.parse({
      target: { equipment: 'CR01_M01', signal: 'runFb', type: 'stuck' },
      params: { value: true },
      repeat: 3,
    });
    expect('repeat' in r).toBe(false);
    expect(r.params?.['value']).toBe(true);
  });

  it('FaultRequest durationMs phải > 0', () => {
    expect(() =>
      faultRequestSchema.parse({
        target: { equipment: 'CR01_M01', fault: 'noStart' },
        durationMs: 0,
      }),
    ).toThrow();
  });

  it('FaultTiming time/after, timeMs âm → lỗi', () => {
    expect(faultTimingSchema.safeParse({ at: 'time', timeMs: 500 }).success).toBe(true);
    expect(faultTimingSchema.safeParse({ at: 'after', afterMs: 100 }).success).toBe(true);
    expect(() => faultTimingSchema.parse({ at: 'time', timeMs: -1 })).toThrow();
  });

  it('FaultInfo hợp lệ, có/không clearedAtMs', () => {
    const base = {
      id: 'F-0001',
      target: { equipment: 'CR01_M01', fault: 'noStart' },
      state: 'active' as const,
      sinceMs: 100,
      params: {},
    };
    expect(faultInfoSchema.parse(base).state).toBe('active');
    expect(faultInfoSchema.parse({ ...base, clearedAtMs: 500 }).clearedAtMs).toBe(500);
    expect(() => faultInfoSchema.parse({ ...base, state: 'weird' })).toThrow();
  });
});
