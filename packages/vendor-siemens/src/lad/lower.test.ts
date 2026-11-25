// Test lower LAD — P1.6 (STATE §21, bảng lower 10).
// IR deep-equal cho bảng A; cấu trúc cho box F/G/H + parallel lồng.

import { describe, expect, it } from 'vitest';
import type { IrBlock, IrLValue, IrStmt } from '@vcs/runtime-iec';
import { compileSclProgram, createCompileContext } from '../scl/compile.js';
import type { CompileContext } from '../scl/compile.js';
import { validateLad } from './validate.js';
import { compileLad, lowerLad } from './lower.js';
import type { LadBlock } from './schema.js';

function lowerOk(block: LadBlock, ctx?: CompileContext): { block: IrBlock; networkMap: Record<string, number[]> } {
  const v = validateLad(block, { ctx });
  expect(v.diagnostics).toEqual([]);
  return lowerLad(v);
}

function ctxWithDb(dbName: string, fbName: string): CompileContext {
  const ctx = createCompileContext();
  const r = compileSclProgram(`DATA_BLOCK "${dbName}" "${fbName}"\nBEGIN\nEND_DATA_BLOCK`, 'T.scl', ctx);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return ctx;
}

const ABS_I00 = { k: 'abs', area: 'I', byte: 0, bit: 0, width: 8, type: 'Bool' } as const;
const ABS_I01 = { k: 'abs', area: 'I', byte: 0, bit: 1, width: 8, type: 'Bool' } as const;
const ABS_Q00 = { k: 'abs', area: 'Q', byte: 0, bit: 0, width: 8, type: 'Bool' } as const;

function loadBool(ref: IrLValue): { op: 'load'; type: 'Bool'; ref: IrLValue } {
  return { op: 'load', type: 'Bool', ref };
}

describe('lower LAD — bảng A deep-equal', () => {
  it('IR bảng A deep-equal (series NO+NC+coil, temp __lad_N1_rlo) — expectedFrom: spec', () => {
    const block: LadBlock = {
      kind: 'OB',
      name: 'Main',
      interface: {},
      networks: [
        {
          id: 'N1',
          rung: [
            { t: 'contact', mode: 'NO', operand: { abs: '%I0.0' } },
            { t: 'contact', mode: 'NC', operand: { abs: '%I0.1' } },
            { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
          ],
        },
      ],
    };
    const { block: ir, networkMap } = lowerOk(block);
    const rlo = { k: 'local', name: '__lad_N1_rlo' } as const;
    expect(ir).toEqual({
      id: 'main',
      kind: 'OB',
      name: 'Main',
      number: 1,
      interface: {
        input: [],
        output: [],
        inout: [],
        static: [],
        temp: [{ name: '__lad_N1_rlo', type: 'Bool' }],
      },
      body: [
        { op: 'assign', target: rlo, value: { op: 'const', type: 'Bool', value: true } },
        {
          op: 'assign',
          target: rlo,
          value: {
            op: 'binary',
            fn: 'and',
            type: 'Bool',
            a: loadBool(rlo),
            b: loadBool(ABS_I00),
          },
        },
        {
          op: 'assign',
          target: rlo,
          value: {
            op: 'binary',
            fn: 'and',
            type: 'Bool',
            a: loadBool(rlo),
            b: { op: 'unary', fn: 'not', type: 'Bool', a: loadBool(ABS_I01) },
          },
        },
        { op: 'assign', target: ABS_Q00, value: loadBool(rlo) },
      ],
    });
    expect(networkMap).toEqual({ N1: [0, 1, 2, 3] });
  });
});

describe('lower LAD — RLO elements', () => {
  it('parallel: temp nhánh + OR (bảng B)', () => {
    const block: LadBlock = {
      kind: 'OB',
      name: 'Main',
      interface: {},
      networks: [
        {
          id: 'N1',
          rung: [
            {
              t: 'parallel',
              branches: [
                [{ t: 'contact', mode: 'NO', operand: { abs: '%I0.0' } }],
                [
                  { t: 'contact', mode: 'NO', operand: { abs: '%I0.1' } },
                  { t: 'contact', mode: 'NO', operand: { abs: '%I0.2' } },
                ],
              ],
            },
            { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
          ],
        },
      ],
    };
    const { block: ir } = lowerOk(block);
    expect(ir.interface.temp.map((t) => t.name)).toEqual([
      '__lad_N1_rlo',
      '__lad_N1_b0',
      '__lad_N1_b1',
    ]);
    // b0 := rlo; b0 := b0 AND I0.0; b1 := rlo; b1 := b1 AND I0.1; b1 := b1 AND I0.2;
    // rlo := b0 OR b1; Q0.0 := rlo
    expect(ir.body).toHaveLength(8);
    const last = ir.body[6] as Extract<IrStmt, { op: 'assign' }>;
    expect(last.op).toBe('assign');
    expect(last.value).toEqual({
      op: 'binary',
      fn: 'or',
      type: 'Bool',
      a: loadBool({ k: 'local', name: '__lad_N1_b0' }),
      b: loadBool({ k: 'local', name: '__lad_N1_b1' }),
    });
  });

  it('parallel lồng nhau: temp cấp theo thứ tự duyệt (bảng K)', () => {
    const block: LadBlock = {
      kind: 'OB',
      name: 'Main',
      interface: {},
      networks: [
        {
          id: 'N1',
          rung: [
            {
              t: 'parallel',
              branches: [
                [
                  { t: 'contact', mode: 'NO', operand: { abs: '%I0.0' } },
                  { t: 'contact', mode: 'NO', operand: { abs: '%I0.1' } },
                ],
                [
                  {
                    t: 'parallel',
                    branches: [
                      [{ t: 'contact', mode: 'NO', operand: { abs: '%I0.2' } }],
                      [
                        { t: 'contact', mode: 'NO', operand: { abs: '%I0.3' } },
                        { t: 'contact', mode: 'NO', operand: { abs: '%I0.4' } },
                      ],
                    ],
                  },
                ],
              ],
            },
            { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
          ],
        },
      ],
    };
    const { block: ir } = lowerOk(block);
    expect(ir.interface.temp.map((t) => t.name)).toEqual([
      '__lad_N1_rlo',
      '__lad_N1_b0',
      '__lad_N1_b1',
      '__lad_N1_b2',
      '__lad_N1_b3',
    ]);
  });

  it('pos: rlo AND (v AND NOT m), rồi m := v', () => {
    const block: LadBlock = {
      kind: 'OB',
      name: 'Main',
      interface: {},
      networks: [
        {
          id: 'N1',
          rung: [
            { t: 'pos', operand: { abs: '%I0.0' }, memBit: { abs: '%M0.0' } },
            { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
          ],
        },
      ],
    };
    const { block: ir } = lowerOk(block);
    expect(ir.body).toHaveLength(4);
    const edge = ir.body[1] as Extract<IrStmt, { op: 'assign' }>;
    expect(edge.value).toEqual({
      op: 'binary',
      fn: 'and',
      type: 'Bool',
      a: loadBool({ k: 'local', name: '__lad_N1_rlo' }),
      b: {
        op: 'binary',
        fn: 'and',
        type: 'Bool',
        a: loadBool(ABS_I00),
        b: {
          op: 'unary',
          fn: 'not',
          type: 'Bool',
          a: loadBool({ k: 'abs', area: 'M', byte: 0, bit: 0, width: 8, type: 'Bool' }),
        },
      },
    });
    const memAssign = ir.body[2] as Extract<IrStmt, { op: 'assign' }>;
    expect(memAssign.target).toEqual({ k: 'abs', area: 'M', byte: 0, bit: 0, width: 8, type: 'Bool' });
    expect(memAssign.value).toEqual(loadBool(ABS_I00));
  });

  it('set/reset: bọc if (__rlo)', () => {
    const block: LadBlock = {
      kind: 'OB',
      name: 'Main',
      interface: {},
      networks: [
        {
          id: 'N1',
          rung: [
            { t: 'contact', mode: 'NO', operand: { abs: '%I0.0' } },
            { t: 'set', operand: { abs: '%M0.0' } },
            { t: 'reset', operand: { abs: '%M0.1' } },
          ],
        },
      ],
    };
    const { block: ir } = lowerOk(block);
    const setStmt = ir.body[2] as Extract<IrStmt, { op: 'if' }>;
    expect(setStmt.op).toBe('if');
    expect(setStmt.then).toEqual([
      {
        op: 'assign',
        target: { k: 'abs', area: 'M', byte: 0, bit: 0, width: 8, type: 'Bool' },
        value: { op: 'const', type: 'Bool', value: true },
      },
    ]);
    const resetStmt = ir.body[3] as Extract<IrStmt, { op: 'if' }>;
    expect(resetStmt.then).toEqual([
      {
        op: 'assign',
        target: { k: 'abs', area: 'M', byte: 0, bit: 1, width: 8, type: 'Bool' },
        value: { op: 'const', type: 'Bool', value: false },
      },
    ]);
  });

  it('not + coil negated: phủ định kép (bảng C)', () => {
    const block: LadBlock = {
      kind: 'OB',
      name: 'Main',
      interface: {},
      networks: [
        {
          id: 'N1',
          rung: [
            { t: 'contact', mode: 'NO', operand: { abs: '%I0.0' } },
            { t: 'not' },
            { t: 'coil', mode: 'negated', operand: { abs: '%Q0.0' } },
          ],
        },
      ],
    };
    const { block: ir } = lowerOk(block);
    const notStmt = ir.body[2] as Extract<IrStmt, { op: 'assign' }>;
    expect(notStmt.value).toEqual({
      op: 'unary',
      fn: 'not',
      type: 'Bool',
      a: loadBool({ k: 'local', name: '__lad_N1_rlo' }),
    });
    const coil = ir.body[3] as Extract<IrStmt, { op: 'assign' }>;
    expect(coil.value).toEqual({
      op: 'unary',
      fn: 'not',
      type: 'Bool',
      a: loadBool({ k: 'local', name: '__lad_N1_rlo' }),
    });
  });
});

describe('lower LAD — box', () => {
  it('TON qua DB: callSys + rlo sau = load T1.Q (bảng F)', () => {
    const ctx = ctxWithDb('T1', 'TON');
    const block: LadBlock = {
      kind: 'OB',
      name: 'Main',
      interface: {},
      networks: [
        {
          id: 'N1',
          rung: [
            { t: 'contact', mode: 'NO', operand: { abs: '%I0.0' } },
            {
              t: 'box',
              fn: 'TON',
              instance: { sym: 'T1' },
              inputs: { IN: { abs: '%I0.0' }, PT: { const: 3000, type: 'Time' } },
              outputs: { Q: { abs: '%M1.0' } },
            },
            { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
          ],
        },
      ],
    };
    const { block: ir } = lowerOk(block, ctx);
    const call = ir.body[2] as Extract<IrStmt, { op: 'callSys' }>;
    expect(call.op).toBe('callSys');
    expect(call.fn).toBe('TON');
    expect(call.instance).toEqual({ k: 'dbField', db: 'T1', path: [] });
    expect(call.inArgs).toEqual([
      ['IN', loadBool(ABS_I00)],
      ['PT', { op: 'const', type: 'Time', value: 3000 }],
    ]);
    expect(call.outArgs).toEqual([
      ['Q', { k: 'abs', area: 'M', byte: 1, bit: 0, width: 8, type: 'Bool' }],
    ]);
    const rloAfter = ir.body[3] as Extract<IrStmt, { op: 'assign' }>;
    expect(rloAfter.value).toEqual({
      op: 'load',
      type: 'Bool',
      ref: { k: 'dbField', db: 'T1', path: ['Q'] },
    });
  });

  it('CTUD: rlo sau = QU (OQ-184)', () => {
    const ctx = ctxWithDb('C1', 'CTUD');
    const block: LadBlock = {
      kind: 'OB',
      name: 'Main',
      interface: {},
      networks: [
        {
          id: 'N1',
          rung: [
            {
              t: 'box',
              fn: 'CTUD',
              instance: { sym: 'C1' },
              inputs: { CU: { abs: '%I0.0' }, CD: { abs: '%I0.1' }, PV: { const: 3 } },
              outputs: {},
            },
            { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
          ],
        },
      ],
    };
    const { block: ir } = lowerOk(block, ctx);
    const rloAfter = ir.body[2] as Extract<IrStmt, { op: 'assign' }>;
    expect(rloAfter.value).toEqual({
      op: 'load',
      type: 'Bool',
      ref: { k: 'dbField', db: 'C1', path: ['QU'] },
    });
  });

  it('compare EQ: rlo = rlo AND (MW10 == 3) (bảng G)', () => {
    const block: LadBlock = {
      kind: 'OB',
      name: 'Main',
      interface: {},
      networks: [
        {
          id: 'N1',
          rung: [
            {
              t: 'box',
              fn: 'EQ',
              inputs: { IN1: { abs: '%MW10' }, IN2: { const: 3 } },
              outputs: {},
            },
            { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
          ],
        },
      ],
    };
    const { block: ir } = lowerOk(block);
    const cmp = ir.body[1] as Extract<IrStmt, { op: 'assign' }>;
    expect(cmp.value).toEqual({
      op: 'binary',
      fn: 'and',
      type: 'Bool',
      a: loadBool({ k: 'local', name: '__lad_N1_rlo' }),
      b: {
        op: 'binary',
        fn: 'eq',
        type: 'Bool',
        a: { op: 'load', type: 'Int', ref: { k: 'abs', area: 'M', byte: 10, width: 16, type: 'Int' } },
        b: { op: 'const', type: 'Int', value: 3 },
      },
    });
  });

  it('math ADD: bọc if (__rlo), rlo không đổi (bảng H)', () => {
    const block: LadBlock = {
      kind: 'OB',
      name: 'Main',
      interface: {},
      networks: [
        {
          id: 'N1',
          rung: [
            { t: 'contact', mode: 'NO', operand: { abs: '%I0.0' } },
            {
              t: 'box',
              fn: 'ADD',
              inputs: { IN1: { abs: '%MW10' }, IN2: { const: 5 } },
              outputs: { OUT: { abs: '%MW12' } },
            },
            { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
          ],
        },
      ],
    };
    const { block: ir } = lowerOk(block);
    const ifStmt = ir.body[2] as Extract<IrStmt, { op: 'if' }>;
    expect(ifStmt.op).toBe('if');
    expect(ifStmt.cond).toEqual(loadBool({ k: 'local', name: '__lad_N1_rlo' }));
    expect(ifStmt.then).toEqual([
      {
        op: 'assign',
        target: { k: 'abs', area: 'M', byte: 12, width: 16, type: 'Int' },
        value: {
          op: 'binary',
          fn: 'add',
          type: 'Int',
          a: { op: 'load', type: 'Int', ref: { k: 'abs', area: 'M', byte: 10, width: 16, type: 'Int' } },
          b: { op: 'const', type: 'Int', value: 5 },
        },
      },
    ]);
  });
});

describe('lower LAD — block/program', () => {
  it('multi-network: networkMap chỉ số body + thứ tự', () => {
    const block: LadBlock = {
      kind: 'OB',
      name: 'Main',
      interface: {},
      networks: [
        { id: 'N1', rung: [{ t: 'contact', mode: 'NO', operand: { abs: '%I0.0' } }, { t: 'coil', mode: 'normal', operand: { abs: '%M0.0' } }] },
        { id: 'N2', rung: [{ t: 'contact', mode: 'NO', operand: { abs: '%M0.0' } }, { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } }] },
      ],
    };
    const { block: ir, networkMap } = lowerOk(block);
    expect(networkMap).toEqual({ N1: [0, 1, 2], N2: [3, 4, 5] });
    expect(ir.body).toHaveLength(6);
    expect(ir.interface.temp.map((t) => t.name)).toEqual(['__lad_N1_rlo', '__lad_N2_rlo']);
  });

  it('OB Main → number 1; OB35 → 35; FC không có number', () => {
    const ob35: LadBlock = {
      kind: 'OB',
      name: 'OB35',
      interface: {},
      networks: [{ id: 'N1', rung: [{ t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } }] }],
    };
    expect(lowerOk(ob35).block.number).toBe(35);
    const fc: LadBlock = {
      kind: 'FC',
      name: 'FC_A',
      interface: {},
      networks: [{ id: 'N1', rung: [{ t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } }] }],
    };
    expect(lowerOk(fc).block.number).toBeUndefined();
  });

  it('compileLad: program chứa block; lỗi → diagnostics + program không chứa block', () => {
    const ok = compileLad({
      kind: 'OB',
      name: 'Main',
      interface: {},
      networks: [{ id: 'N1', rung: [{ t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } }] }],
    });
    expect(ok.diagnostics).toEqual([]);
    expect(ok.program.blocks.map((b) => b.name)).toEqual(['Main']);
    expect(ok.networkMap).toEqual({ N1: [0, 1] });

    const bad = compileLad({
      kind: 'OB',
      name: 'Main',
      interface: {},
      networks: [
        {
          id: 'N1',
          rung: [
            { t: 'contact', mode: 'NO', operand: { sym: 'NOPE' } },
            { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
          ],
        },
      ],
    });
    expect(bad.diagnostics.map((d) => d.code)).toContain('LAD-T001');
    expect(bad.program.blocks).toEqual([]);
  });
});
