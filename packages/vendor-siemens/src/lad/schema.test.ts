// Test schema LAD — P1.6 (STATE §21, bảng schema 12).
// parseLadBlock: zod strict — key lạ / rung rỗng / parallel rỗng → LAD-S001.

import { describe, expect, it } from 'vitest';
import { parseLadBlock } from './schema.js';
import type { LadBlock } from './schema.js';
import { validateLad } from './validate.js';

function baseBlock(overrides: Partial<LadBlock> = {}): Record<string, unknown> {
  return {
    kind: 'OB',
    name: 'Main',
    interface: { input: [], output: [], static: [], temp: [] },
    networks: [
      {
        id: 'N1',
        rung: [
          { t: 'contact', mode: 'NO', operand: { abs: '%I0.0' } },
          { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
        ],
      },
    ],
    ...overrides,
  };
}

function codes(result: ReturnType<typeof parseLadBlock>): string[] {
  return result.diagnostics.map((d) => d.code);
}

describe('schema LAD — block hợp lệ', () => {
  it('block hợp lệ → parse được, không diagnostic', () => {
    const r = parseLadBlock(baseBlock());
    expect(r.block).toBeDefined();
    expect(r.diagnostics).toEqual([]);
    expect(r.block?.kind).toBe('OB');
    expect(r.block?.networks).toHaveLength(1);
  });

  it('block FB với static TON + network rỗng tiêu đề → parse được', () => {
    const r = parseLadBlock(
      baseBlock({
        kind: 'FB',
        name: 'FB_Lad',
        interface: {
          input: [{ name: 'iStart', type: 'Bool' }],
          output: [{ name: 'qRun', type: 'Bool' }],
          static: [{ name: 'sT', type: 'TON' }],
        },
      }),
    );
    expect(r.diagnostics).toEqual([]);
    expect(r.block?.interface.static).toHaveLength(1);
  });
});

describe('schema LAD — lỗi cấu trúc → LAD-S001', () => {
  it('kind sai → LAD-S001', () => {
    const r = parseLadBlock(baseBlock({ kind: 'XX' as never }));
    expect(r.block).toBeUndefined();
    expect(codes(r)).toContain('LAD-S001');
  });

  it('thiếu networks → LAD-S001', () => {
    const input = baseBlock();
    delete input.networks;
    const r = parseLadBlock(input);
    expect(r.block).toBeUndefined();
    expect(codes(r)).toContain('LAD-S001');
  });

  it('rung rỗng → LAD-S001', () => {
    const r = parseLadBlock(baseBlock({ networks: [{ id: 'N1', rung: [] }] }));
    expect(r.block).toBeUndefined();
    expect(codes(r)).toContain('LAD-S001');
  });

  it('parallel branches rỗng → LAD-S001', () => {
    const r = parseLadBlock(
      baseBlock({
        networks: [
          {
            id: 'N1',
            rung: [
              { t: 'parallel', branches: [] },
              { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
            ],
          },
        ],
      }),
    );
    expect(r.block).toBeUndefined();
    expect(codes(r)).toContain('LAD-S001');
  });

  it('parallel có nhánh rỗng → LAD-S001', () => {
    const r = parseLadBlock(
      baseBlock({
        networks: [
          {
            id: 'N1',
            rung: [
              {
                t: 'parallel',
                branches: [[{ t: 'contact', mode: 'NO', operand: { abs: '%I0.0' } }], []],
              },
              { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
            ],
          },
        ],
      }),
    );
    expect(r.block).toBeUndefined();
    expect(codes(r)).toContain('LAD-S001');
  });

  it('operand sai dạng → LAD-S001', () => {
    const r = parseLadBlock(
      baseBlock({
        networks: [
          {
            id: 'N1',
            rung: [
              { t: 'contact', mode: 'NO', operand: { foo: 1 } as never },
              { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
            ],
          },
        ],
      }),
    );
    expect(r.block).toBeUndefined();
    expect(codes(r)).toContain('LAD-S001');
  });

  it('key lạ trong block → LAD-S001 (strict object)', () => {
    const r = parseLadBlock(baseBlock({ unknownKey: 1 } as never));
    expect(r.block).toBeUndefined();
    expect(codes(r)).toContain('LAD-S001');
  });

  it('tên block không phải định danh → LAD-S001', () => {
    const r = parseLadBlock(baseBlock({ name: '1Main' }));
    expect(r.block).toBeUndefined();
    expect(codes(r)).toContain('LAD-S001');
  });

  it('network id không phải định danh → LAD-S001', () => {
    const r = parseLadBlock(baseBlock({ networks: [{ id: 'N-1', rung: [{ t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } }] }] }));
    expect(r.block).toBeUndefined();
    expect(codes(r)).toContain('LAD-S001');
  });

  it('number sai kiểu → LAD-S001', () => {
    const r = parseLadBlock(baseBlock({ number: '1' as never }));
    expect(r.block).toBeUndefined();
    expect(codes(r)).toContain('LAD-S001');
  });

  it('init sai kiểu → LAD-S001', () => {
    const r = parseLadBlock(
      baseBlock({
        interface: { input: [{ name: 'x', type: 'Int', init: 'abc' as never }] },
      }),
    );
    expect(r.block).toBeUndefined();
    expect(codes(r)).toContain('LAD-S001');
  });
});

describe('schema LAD — lỗi thuộc về validate (schema chấp nhận)', () => {
  it('box fn lạ → schema chấp nhận, validate báo LAD-U001', () => {
    const r = parseLadBlock(
      baseBlock({
        networks: [
          {
            id: 'N1',
            rung: [
              { t: 'box', fn: 'FOO', inputs: {}, outputs: {} },
              { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
            ],
          },
        ],
      }),
    );
    expect(r.block).toBeDefined();
    expect(r.diagnostics).toEqual([]);
    const v = validateLad(r.block as LadBlock);
    expect(v.diagnostics.map((d) => d.code)).toContain('LAD-U001');
  });

  it('interface trùng tên → schema chấp nhận, validate báo LAD-T009', () => {
    const r = parseLadBlock(
      baseBlock({
        interface: {
          input: [{ name: 'x', type: 'Bool' }],
          output: [{ name: 'X', type: 'Bool' }],
        },
      }),
    );
    expect(r.block).toBeDefined();
    const v = validateLad(r.block as LadBlock);
    expect(v.diagnostics.map((d) => d.code)).toContain('LAD-T009');
  });
});
