// Pipeline LAD → IR → SoftPlc (P1.6, STATE §21, test P-L1…P-L6).
// Biên dịch LAD JSON thật (compileLad) rồi chạy SoftPlc; P-L3 hỗn hợp
// SCL+LAD chung một CompileContext. expectedFrom: 'spec' (OQ-174).

import { describe, expect, it } from 'vitest';
import { SoftPlc } from '@vcs/runtime-iec';
import { compileSclProgram, createCompileContext } from '../scl/compile.js';
import type { CompileContext } from '../scl/compile.js';
import { compileLad, compileLadBlock } from './lower.js';

/** Một scan: đặt input rồi step; `now` lấy từ scanCount (mẫu softplc-std.test.ts). */
function scan(plc: SoftPlc, period: number, setInputs: () => void): void {
  setInputs();
  plc.step(plc.getDiagnostics().scanCount * period, period);
}

function compileLadOk(input: unknown, ctx?: CompileContext, period = 10): SoftPlc {
  const { program, diagnostics } = compileLad(input, { ctx });
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const plc = new SoftPlc(program, new Map(), { id: 'PLC1', scanPeriodMs: period });
  plc.start();
  return plc;
}

function ctxWithDb(dbName: string, fbName: string): CompileContext {
  const ctx = createCompileContext();
  const r = compileSclProgram(`DATA_BLOCK "${dbName}" "${fbName}"\nBEGIN\nEND_DATA_BLOCK`, 'T.scl', ctx);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return ctx;
}

describe('pipeline LAD — P-L1 series (bảng A) — expectedFrom: spec', () => {
  it('P-L1 LAD OB series NO+NC+coil', () => {
    const plc = compileLadOk({
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
    });
    const i00 = [false, false, true, true, false];
    const i01 = [false, true, false, true, false];
    const expected = [false, false, true, false, false];
    for (let i = 0; i < 5; i++) {
      scan(plc, 10, () => {
        plc.write('%I0.0', i00[i] as boolean);
        plc.write('%I0.1', i01[i] as boolean);
      });
      expect(plc.read('%Q0.0')).toBe(expected[i]);
    }
  });
});

describe('pipeline LAD — P-L2 TON qua SCL DB (bảng F) — expectedFrom: spec', () => {
  it('P-L2 LAD OB TON instance {sym:"T1"} (DB từ SCL)', () => {
    const ctx = ctxWithDb('T1', 'TON');
    const plc = compileLadOk(
      {
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
      },
      ctx,
      100,
    );
    const expected: Record<number, { et: number; q: boolean }> = {
      1: { et: 0, q: false },
      2: { et: 0, q: false },
      3: { et: 100, q: false },
      11: { et: 900, q: false },
      31: { et: 2900, q: false },
      32: { et: 3000, q: true },
      33: { et: 3000, q: true },
      34: { et: 0, q: false },
    };
    for (let i = 0; i <= 34; i++) {
      scan(plc, 100, () => {
        plc.write('%I0.0', i >= 2 && i <= 33);
      });
      const e = expected[i];
      if (e !== undefined) {
        expect(plc.read('"T1".ET')).toBe(e.et);
        expect(plc.read('"T1".Q')).toBe(e.q);
        expect(plc.read('%Q0.0')).toBe(e.q);
      }
    }
  });
});

describe('pipeline LAD — P-L3 hỗn hợp SCL OB1 → LAD FB (bảng J) — expectedFrom: spec', () => {
  it('P-L3 SCL OB1 gọi FB_Lad_DB (FB viết bằng LAD)', () => {
    const ctx = createCompileContext();
    // 1. LAD FB vào ctx trước (DATA_BLOCK SCL cần FB đã tồn tại).
    const ladFb = compileLadBlock(
      {
        kind: 'FB',
        name: 'FB_Lad',
        interface: {
          input: [{ name: 'iStart', type: 'Bool' }],
          output: [{ name: 'qRun', type: 'Bool' }],
          static: [{ name: 'sT', type: 'TON' }],
        },
        networks: [
          {
            id: 'N1',
            rung: [
              { t: 'contact', mode: 'NO', operand: { local: '#iStart' } },
              {
                t: 'box',
                fn: 'TON',
                instance: { local: '#sT' },
                inputs: { IN: { local: '#iStart' }, PT: { const: 300, type: 'Time' } },
                outputs: {},
              },
              { t: 'coil', mode: 'normal', operand: { local: '#qRun' } },
            ],
          },
        ],
      },
      { ctx },
    );
    expect(ladFb.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    // 2. SCL OB1 + DATA_BLOCK vào cùng ctx.
    const scl = compileSclProgram(
      `DATA_BLOCK "FB_Lad_DB" "FB_Lad"
BEGIN
END_DATA_BLOCK
ORGANIZATION_BLOCK "Main"
BEGIN
  "FB_Lad_DB"(iStart := %I0.0);
  %Q0.0 := "FB_Lad_DB".qRun;
END_ORGANIZATION_BLOCK`,
      'T.scl',
      ctx,
    );
    expect(scl.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const plc = new SoftPlc(scl.program, new Map(), { id: 'PLC1', scanPeriodMs: 100 });
    plc.start();
    const iStart = [false, false, true, true, true, true, false];
    const et = [0, 0, 0, 100, 200, 300, 0];
    const q = [false, false, false, false, false, true, false];
    for (let i = 0; i < 7; i++) {
      scan(plc, 100, () => {
        plc.write('%I0.0', iStart[i] as boolean);
      });
      expect(plc.read('"FB_Lad_DB".sT.ET')).toBe(et[i]);
      expect(plc.read('"FB_Lad_DB".sT.Q')).toBe(q[i]);
      expect(plc.read('"FB_Lad_DB".qRun')).toBe(q[i]);
      expect(plc.read('%Q0.0')).toBe(q[i]);
    }
  });
});

describe('pipeline LAD — P-L4 CTU+EQ (bảng G) — expectedFrom: spec', () => {
  it('P-L4 LAD OB CTU instance {sym:"C1"} + EQ compare', () => {
    const ctx = ctxWithDb('C1', 'CTU');
    const plc = compileLadOk(
      {
        kind: 'OB',
        name: 'Main',
        interface: {},
        networks: [
          {
            id: 'N1',
            rung: [
              {
                t: 'box',
                fn: 'CTU',
                instance: { sym: 'C1' },
                inputs: { CU: { abs: '%I0.0' }, R: { abs: '%I0.1' }, PV: { const: 3 } },
                outputs: { CV: { abs: '%MW10' } },
              },
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
      },
      ctx,
    );
    const cu = [false, false, true, false, true, false, false, true, false, true];
    const cv = [0, 0, 1, 1, 2, 2, 2, 3, 3, 4];
    const q = [false, false, false, false, false, false, false, true, true, false];
    for (let i = 0; i < 10; i++) {
      scan(plc, 10, () => {
        plc.write('%I0.0', cu[i] as boolean);
        plc.write('%I0.1', false);
      });
      expect(plc.read('"C1".CV')).toBe(cv[i]);
      expect(plc.read('%Q0.0')).toBe(q[i]);
    }
  });
});

describe('pipeline LAD — P-L5 math/MOVE (bảng H) — expectedFrom: spec', () => {
  it('P-L5 LAD OB ADD + MOVE, EN gating', () => {
    const plc = compileLadOk({
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
        {
          id: 'N2',
          rung: [
            { t: 'contact', mode: 'NO', operand: { abs: '%I0.1' } },
            {
              t: 'box',
              fn: 'MOVE',
              inputs: { IN: { abs: '%MW12' } },
              outputs: { OUT: { abs: '%MW14' } },
            },
          ],
        },
      ],
    });
    plc.write('%MW10', 10);
    const i00 = [false, false, true, true, false, false, false];
    const i01 = [false, false, false, false, false, true, false];
    const mw12Exp = [0, 0, 15, 15, 15, 15, 15];
    const mw14Exp = [0, 0, 0, 0, 0, 15, 15];
    for (let i = 0; i < 7; i++) {
      scan(plc, 10, () => {
        plc.write('%I0.0', i00[i] as boolean);
        plc.write('%I0.1', i01[i] as boolean);
      });
      expect(plc.read('%MW12')).toBe(mw12Exp[i]);
      expect(plc.read('%MW14')).toBe(mw14Exp[i]);
    }
  });
});

describe('pipeline LAD — P-L6 hai block LAD trong một ctx — expectedFrom: spec', () => {
  it('P-L6 OB+FB LAD chung ctx, programFromCtx sắp xếp theo id', () => {
    const ctx = createCompileContext();
    const fb = compileLadBlock(
      {
        kind: 'FB',
        name: 'FB_X',
        interface: {
          input: [{ name: 'iStart', type: 'Bool' }],
          output: [{ name: 'qRun', type: 'Bool' }],
          static: [{ name: 'sT', type: 'TON' }],
        },
        networks: [
          {
            id: 'N1',
            rung: [
              { t: 'contact', mode: 'NO', operand: { local: '#iStart' } },
              {
                t: 'box',
                fn: 'TON',
                instance: { local: '#sT' },
                inputs: { IN: { local: '#iStart' }, PT: { const: 300, type: 'Time' } },
                outputs: {},
              },
              { t: 'coil', mode: 'normal', operand: { local: '#qRun' } },
            ],
          },
        ],
      },
      { ctx },
    );
    expect(fb.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const ob = compileLadBlock(
      {
        kind: 'OB',
        name: 'Main',
        interface: {},
        networks: [
          {
            id: 'N1',
            rung: [
              { t: 'contact', mode: 'NO', operand: { abs: '%I0.0' } },
              { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
            ],
          },
        ],
      },
      { ctx },
    );
    expect(ob.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(ob.program.blocks.map((b) => b.id)).toEqual(['fb_x', 'main']);
    expect(ob.program.organization).toEqual([{ ob: 1, block: 'Main' }]);
    const plc = new SoftPlc(ob.program, new Map(), { id: 'PLC1', scanPeriodMs: 10 });
    plc.start();
    scan(plc, 10, () => {
      plc.write('%I0.0', true);
    });
    expect(plc.read('%Q0.0')).toBe(true);
  });
});
