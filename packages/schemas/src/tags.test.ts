// Test schema tags (M0 §4.5, §12.1: nhóm schema ≥ 35 cùng project-schema).
import { describe, expect, it } from 'vitest';
import { createTagCatalog, isValidAddressLight, tagSchema, tagsFileSchema } from './tags.js';
import { zodIssueParams } from './yaml.js';

function tag(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'BTN_START',
    type: 'Bool',
    area: 'I',
    address: '%I0.0',
    controller: 'PLC1',
    ...over,
  };
}

describe('isValidAddressLight (C2)', () => {
  it.each([
    '%I0.0',
    '%Q0.0',
    '%IW64',
    '%QW64',
    '%M0.0',
    '%MB0',
    '%MD0',
    'DB1.DBW0',
    'DB1.DBX0.0',
    'I0.0',
    'sym:Motor.Start',
    'sym:DB1.MyVar',
  ])("'%s' hợp lệ", (a) => {
    expect(isValidAddressLight(a)).toBe(true);
  });

  it.each(['hello', '%X0.0', 'DB1.DBZ0', 'sym:', '', '%I', 'DB1.W0'])("'%s' không hợp lệ", (a) => {
    expect(isValidAddressLight(a)).toBe(false);
  });
});

describe('tagSchema — kiểm tra chéo', () => {
  it('tag DI hợp lệ', () => {
    expect(tagSchema.safeParse(tag({ signal: { kind: 'DI' } })).success).toBe(true);
  });

  it('E010: DI ở area Q → lỗi', () => {
    const r = tagSchema.safeParse(tag({ area: 'Q', signal: { kind: 'DI' } }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(zodIssueParams(r.error.issues[0]).diagnosticCode).toBe('PRJ-E010');
    }
  });

  it('E010: AO ở area I → lỗi', () => {
    const r = tagSchema.safeParse(
      tag({ area: 'I', type: 'Int', address: '%IW64', signal: { kind: 'AO' } }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(zodIssueParams(r.error.issues[0]).diagnosticCode).toBe('PRJ-E010');
    }
  });

  it('E011: scaling với kind DI → lỗi', () => {
    const r = tagSchema.safeParse(
      tag({
        signal: {
          kind: 'DI',
          scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 10 },
        },
      }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => zodIssueParams(i).diagnosticCode === 'PRJ-E011')).toBe(
        true,
      );
    }
  });

  it('AI với scaling hợp lệ → ok', () => {
    const r = tagSchema.safeParse(
      tag({
        type: 'Int',
        area: 'I',
        address: '%IW64',
        signal: {
          kind: 'AI',
          scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 10, unit: 'bar' },
        },
      }),
    );
    expect(r.success).toBe(true);
  });

  it('E012: rawMin == rawMax → lỗi; engMin == engMax → lỗi', () => {
    const base = {
      type: 'Int',
      area: 'I',
      address: '%IW64',
      signal: { kind: 'AI', scaling: { rawMin: 5, rawMax: 5, engMin: 0, engMax: 10 } },
    };
    expect(tagSchema.safeParse(tag(base)).success).toBe(false);
    const base2 = {
      ...base,
      signal: { kind: 'AI', scaling: { rawMin: 0, rawMax: 10, engMin: 7, engMax: 7 } },
    };
    const r2 = tagSchema.safeParse(tag(base2));
    expect(r2.success).toBe(false);
    if (!r2.success) {
      expect(zodIssueParams(r2.error.issues[0]).diagnosticCode).toBe('PRJ-E012');
    }
  });

  it('E013: DI với kiểu Int → lỗi; AI với kiểu Bool → lỗi', () => {
    expect(tagSchema.safeParse(tag({ type: 'Int', signal: { kind: 'DI' } })).success).toBe(false);
    const r = tagSchema.safeParse(
      tag({ type: 'Bool', area: 'I', address: '%IW64', signal: { kind: 'AI' } }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(zodIssueParams(r.error.issues[0]).diagnosticCode).toBe('PRJ-E013');
    }
  });

  it('E014: initial sai kiểu/khoảng', () => {
    expect(tagSchema.safeParse(tag({ initial: 1 })).success).toBe(false); // Bool cần boolean
    expect(tagSchema.safeParse(tag({ type: 'Byte', initial: 300 })).success).toBe(false);
    expect(tagSchema.safeParse(tag({ type: 'Byte', initial: 1.5 })).success).toBe(false);
  });

  it('E014: initial đúng kiểu/khoảng → ok', () => {
    expect(tagSchema.safeParse(tag({ initial: true })).success).toBe(true);
    expect(tagSchema.safeParse(tag({ type: 'Int', address: '%IW64', initial: -5 })).success).toBe(
      true,
    );
    expect(tagSchema.safeParse(tag({ type: 'Real', address: '%IW64', initial: 1.5 })).success).toBe(
      true,
    );
  });

  it('tên tag sai định dạng → lỗi', () => {
    expect(tagSchema.safeParse(tag({ name: '1BAD' })).success).toBe(false);
    expect(tagSchema.safeParse(tag({ name: 'a'.repeat(129) })).success).toBe(false);
  });

  it('signal.kind null được chấp nhận', () => {
    expect(tagSchema.safeParse(tag({ signal: { kind: null } })).success).toBe(true);
  });
});

describe('tagsFileSchema — E004', () => {
  it('hai tag trùng tên (khác hoa/thường) → E004', () => {
    const r = tagsFileSchema.safeParse({
      tags: [tag({ name: 'BTN' }), tag({ name: 'btn', address: '%I0.1' })],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(zodIssueParams(r.error.issues[0]).diagnosticCode).toBe('PRJ-E004');
      expect(zodIssueParams(r.error.issues[0]).relatedPath).toEqual(['tags', 0, 'name']);
    }
  });

  it('tags rỗng → ok', () => {
    expect(tagsFileSchema.safeParse({ tags: [] }).success).toBe(true);
    expect(tagsFileSchema.safeParse({}).success).toBe(true);
  });
});

describe('createTagCatalog (M0 §6.5)', () => {
  const defs = [
    tag({ name: 'A', controller: 'PLC1' }),
    tag({ name: 'B', controller: 'PLC2' }),
    tag({ name: 'C', controller: 'PLC1', address: '%Q0.0', area: 'Q' }),
  ] as never;
  const catalog = createTagCatalog(defs);

  it('get/has theo tên chính xác', () => {
    expect(catalog.get('A')?.name).toBe('A');
    expect(catalog.has('ZZZ')).toBe(false);
  });

  it('byController giữ thứ tự file', () => {
    expect(catalog.byController('PLC1').map((t) => t.name)).toEqual(['A', 'C']);
  });

  it('all() trả bản sao theo thứ tự file', () => {
    expect(catalog.all().map((t) => t.name)).toEqual(['A', 'B', 'C']);
  });
});
