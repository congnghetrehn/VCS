// Test validate LAD — P1.6 (STATE §21, bảng validate 18).
// Mỗi mã LAD có ≥ 1 test (AGENTS §6).

import { describe, expect, it } from 'vitest';
import type { TagDef } from '@vcs/schemas';
import { compileSclProgram, createCompileContext } from '../scl/compile.js';
import type { CompileContext } from '../scl/compile.js';
import { validateLad } from './validate.js';
import type { LadBlock } from './schema.js';

function obBlock(networks: LadBlock['networks'], iface: LadBlock['interface'] = {}): LadBlock {
  return { kind: 'OB', name: 'Main', interface: iface, networks };
}

function codes(block: LadBlock, opts: { tags?: TagDef[]; ctx?: CompileContext } = {}): string[] {
  return validateLad(block, opts).diagnostics.map((d) => d.code);
}

function ctxWithDb(dbName: string, fbName: string): CompileContext {
  const ctx = createCompileContext();
  const r = compileSclProgram(`DATA_BLOCK "${dbName}" "${fbName}"\nBEGIN\nEND_DATA_BLOCK`, 'T.scl', ctx);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return ctx;
}

const NO = { t: 'contact', mode: 'NO', operand: { abs: '%I0.0' } } as const;
const COIL_Q = { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } } as const;

describe('validate LAD — operand', () => {
  it('sym không thấy → LAD-T001', () => {
    const b = obBlock([
      { id: 'N1', rung: [{ t: 'contact', mode: 'NO', operand: { sym: 'NOPE' } }, COIL_Q] },
    ]);
    expect(codes(b)).toContain('LAD-T001');
  });

  it('abs sai → LAD-T001', () => {
    const b = obBlock([
      { id: 'N1', rung: [{ t: 'contact', mode: 'NO', operand: { abs: '%X0.0' } }, COIL_Q] },
    ]);
    expect(codes(b)).toContain('LAD-T001');
  });

  it('local chưa khai → LAD-T001', () => {
    const b = obBlock([
      { id: 'N1', rung: [{ t: 'contact', mode: 'NO', operand: { local: '#nope' } }, COIL_Q] },
    ]);
    expect(codes(b)).toContain('LAD-T001');
  });

  it('local member sai → LAD-T005', () => {
    const b: LadBlock = {
      kind: 'FB',
      name: 'FB_X',
      interface: { static: [{ name: 'u', type: 'TON' }] },
      networks: [
        {
          id: 'N1',
          rung: [{ t: 'contact', mode: 'NO', operand: { local: '#u.nope' } }, COIL_Q],
        },
      ],
    };
    expect(codes(b)).toContain('LAD-T005');
  });

  it('local member hidden (#sT._start) → LAD-T005', () => {
    const b: LadBlock = {
      kind: 'FB',
      name: 'FB_X',
      interface: { static: [{ name: 'sT', type: 'TON' }] },
      networks: [
        {
          id: 'N1',
          rung: [{ t: 'contact', mode: 'NO', operand: { local: '#sT._start' } }, COIL_Q],
        },
      ],
    };
    expect(codes(b)).toContain('LAD-T005');
  });

  it('tag khai kiểu khác độ rộng địa chỉ → LAD-T002', () => {
    const tags: TagDef[] = [
      { name: 'START', type: 'Int', area: 'I', address: '%I0.0', controller: 'PLC1' },
    ];
    const b = obBlock([
      { id: 'N1', rung: [{ t: 'contact', mode: 'NO', operand: { sym: 'START' } }, COIL_Q] },
    ]);
    expect(codes(b, { tags })).toContain('LAD-T002');
  });
});

describe('validate LAD — contact/coil/set/reset/pos/neg', () => {
  it('contact kiểu Int → LAD-T002', () => {
    const b = obBlock([
      { id: 'N1', rung: [{ t: 'contact', mode: 'NO', operand: { abs: '%IW0' } }, COIL_Q] },
    ]);
    expect(codes(b)).toContain('LAD-T002');
  });

  it('coil ghi VAR_INPUT → LAD-T006', () => {
    const b = obBlock(
      [{ id: 'N1', rung: [NO, { t: 'coil', mode: 'normal', operand: { local: '#in1' } }] }],
      { input: [{ name: 'in1', type: 'Bool' }] },
    );
    expect(codes(b)).toContain('LAD-T006');
  });

  it('coil kiểu Int → LAD-T002', () => {
    const b = obBlock([
      { id: 'N1', rung: [NO, { t: 'coil', mode: 'normal', operand: { abs: '%MW0' } }] },
    ]);
    expect(codes(b)).toContain('LAD-T002');
  });

  it('pos memBit là VAR_INPUT → LAD-T006', () => {
    const b = obBlock(
      [
        {
          id: 'N1',
          rung: [
            { t: 'pos', operand: { abs: '%I0.0' }, memBit: { local: '#in1' } },
            COIL_Q,
          ],
        },
      ],
      { input: [{ name: 'in1', type: 'Bool' }] },
    );
    expect(codes(b)).toContain('LAD-T006');
  });

  it('pos operand kiểu Int → LAD-T002', () => {
    const b = obBlock([
      {
        id: 'N1',
        rung: [
          { t: 'pos', operand: { abs: '%IW0' }, memBit: { abs: '%M0.0' } },
          COIL_Q,
        ],
      },
    ]);
    expect(codes(b)).toContain('LAD-T002');
  });
});

describe('validate LAD — box std', () => {
  it('TON thiếu PT → LAD-T004', () => {
    const b = obBlock([
      {
        id: 'N1',
        rung: [
          {
            t: 'box',
            fn: 'TON',
            instance: { sym: 'T1' },
            inputs: { IN: { abs: '%I0.0' } },
            outputs: {},
          },
          COIL_Q,
        ],
      },
    ]);
    expect(codes(b, { ctx: ctxWithDb('T1', 'TON') })).toContain('LAD-T004');
  });

  it('std box thiếu instance → LAD-T004', () => {
    const b = obBlock([
      {
        id: 'N1',
        rung: [
          {
            t: 'box',
            fn: 'TON',
            inputs: { IN: { abs: '%I0.0' }, PT: { const: 3000, type: 'Time' } },
            outputs: {},
          },
          COIL_Q,
        ],
      },
    ]);
    expect(codes(b, { ctx: ctxWithDb('T1', 'TON') })).toContain('LAD-T004');
  });

  it('std box instance abs → LAD-T004', () => {
    const b = obBlock([
      {
        id: 'N1',
        rung: [
          {
            t: 'box',
            fn: 'TON',
            instance: { abs: '%I0.0' },
            inputs: { IN: { abs: '%I0.0' }, PT: { const: 3000, type: 'Time' } },
            outputs: {},
          },
          COIL_Q,
        ],
      },
    ]);
    expect(codes(b, { ctx: ctxWithDb('T1', 'TON') })).toContain('LAD-T004');
  });

  it('DB instance sai fbName (T1 là TON, dùng cho CTU) → LAD-T001', () => {
    const b = obBlock([
      {
        id: 'N1',
        rung: [
          {
            t: 'box',
            fn: 'CTU',
            instance: { sym: 'T1' },
            inputs: { CU: { abs: '%I0.0' }, PV: { const: 3 } },
            outputs: {},
          },
          COIL_Q,
        ],
      },
    ]);
    expect(codes(b, { ctx: ctxWithDb('T1', 'TON') })).toContain('LAD-T001');
  });

  it('DB instance đúng (TON qua SCL DATA_BLOCK) → không lỗi', () => {
    const b = obBlock([
      {
        id: 'N1',
        rung: [
          {
            t: 'box',
            fn: 'TON',
            instance: { sym: 'T1' },
            inputs: { IN: { abs: '%I0.0' }, PT: { const: 3000, type: 'Time' } },
            outputs: { Q: { abs: '%M1.0' } },
          },
          COIL_Q,
        ],
      },
    ]);
    expect(codes(b, { ctx: ctxWithDb('T1', 'TON') })).toEqual([]);
  });

  it('TON input lạ → LAD-T004', () => {
    const b = obBlock([
      {
        id: 'N1',
        rung: [
          {
            t: 'box',
            fn: 'TON',
            instance: { sym: 'T1' },
            inputs: { IN: { abs: '%I0.0' }, PT: { const: 3000, type: 'Time' }, FOO: { const: 1 } },
            outputs: {},
          },
          COIL_Q,
        ],
      },
    ]);
    expect(codes(b, { ctx: ctxWithDb('T1', 'TON') })).toContain('LAD-T004');
  });

  it('TON output không có → LAD-T004', () => {
    const b = obBlock([
      {
        id: 'N1',
        rung: [
          {
            t: 'box',
            fn: 'TON',
            instance: { sym: 'T1' },
            inputs: { IN: { abs: '%I0.0' }, PT: { const: 3000, type: 'Time' } },
            outputs: { FOO: { abs: '%M1.0' } },
          },
          COIL_Q,
        ],
      },
    ]);
    expect(codes(b, { ctx: ctxWithDb('T1', 'TON') })).toContain('LAD-T004');
  });

  it('TON PT là const Int (không type Time) → LAD-T002 (OQ-195)', () => {
    const b = obBlock([
      {
        id: 'N1',
        rung: [
          {
            t: 'box',
            fn: 'TON',
            instance: { sym: 'T1' },
            inputs: { IN: { abs: '%I0.0' }, PT: { const: 3000 } },
            outputs: {},
          },
          COIL_Q,
        ],
      },
    ]);
    expect(codes(b, { ctx: ctxWithDb('T1', 'TON') })).toContain('LAD-T002');
  });

  it('TON IN kiểu Int → LAD-T002', () => {
    const b = obBlock([
      {
        id: 'N1',
        rung: [
          {
            t: 'box',
            fn: 'TON',
            instance: { sym: 'T1' },
            inputs: { IN: { abs: '%IW0' }, PT: { const: 3000, type: 'Time' } },
            outputs: {},
          },
          COIL_Q,
        ],
      },
    ]);
    expect(codes(b, { ctx: ctxWithDb('T1', 'TON') })).toContain('LAD-T002');
  });

  it('local instance sai kiểu (Int var làm TON) → LAD-T001', () => {
    const b: LadBlock = {
      kind: 'FB',
      name: 'FB_X',
      interface: { static: [{ name: 'n', type: 'Int' }] },
      networks: [
        {
          id: 'N1',
          rung: [
            {
              t: 'box',
              fn: 'TON',
              instance: { local: '#n' },
              inputs: { IN: { abs: '%I0.0' }, PT: { const: 3000, type: 'Time' } },
              outputs: {},
            },
            COIL_Q,
          ],
        },
      ],
    };
    expect(codes(b)).toContain('LAD-T001');
  });
});

describe('validate LAD — box toán/so sánh/MOVE/CONVERT', () => {
  it('ADD trên Bool → LAD-T003', () => {
    const b = obBlock(
      [
        {
          id: 'N1',
          rung: [
            {
              t: 'box',
              fn: 'ADD',
              inputs: { IN1: { abs: '%I0.0' }, IN2: { abs: '%I0.1' } },
              outputs: { OUT: { abs: '%MW12' } },
            },
          ],
        },
      ],
      { temp: [{ name: 'w', type: 'Int' }] },
    );
    expect(codes(b)).toContain('LAD-T003');
  });

  it('box fn ngoài tập → LAD-U001', () => {
    const b = obBlock([
      { id: 'N1', rung: [{ t: 'box', fn: 'SQRT', inputs: {}, outputs: {} }, COIL_Q] },
    ]);
    expect(codes(b)).toContain('LAD-U001');
  });

  it('box math có instance → LAD-T004', () => {
    const b = obBlock([
      {
        id: 'N1',
        rung: [
          {
            t: 'box',
            fn: 'ADD',
            instance: { abs: '%I0.0' },
            inputs: { IN1: { const: 1 }, IN2: { const: 2 } },
            outputs: { OUT: { abs: '%MW12' } },
          },
        ],
      },
    ]);
    expect(codes(b)).toContain('LAD-T004');
  });

  it('compare có outputs → LAD-S001', () => {
    const b = obBlock([
      {
        id: 'N1',
        rung: [
          {
            t: 'box',
            fn: 'EQ',
            inputs: { IN1: { abs: '%MW10' }, IN2: { const: 3 } },
            outputs: { OUT: { abs: '%Q0.0' } },
          },
          COIL_Q,
        ],
      },
    ]);
    expect(codes(b)).toContain('LAD-S001');
  });

  it('MOVE thiếu OUT → LAD-T004', () => {
    const b = obBlock([
      {
        id: 'N1',
        rung: [
          { t: 'box', fn: 'MOVE', inputs: { IN: { abs: '%MW10' } }, outputs: {} },
        ],
      },
    ]);
    expect(codes(b)).toContain('LAD-T004');
  });

  it('CONVERT Time → Int không được (TIME_TO_INT ngoài bảng SCL) → LAD-T003', () => {
    const b = obBlock(
      [
        {
          id: 'N1',
          rung: [
            {
              t: 'box',
              fn: 'CONVERT',
              inputs: { IN: { const: 3000, type: 'Time' } },
              outputs: { OUT: { local: '#nOut' } },
            },
          ],
        },
      ],
      { temp: [{ name: 'nOut', type: 'Int' }] },
    );
    expect(codes(b)).toContain('LAD-T003');
  });

  it('CONVERT Int → Bool được (INT_TO_BOOL có trong bảng SCL X_TO_Y)', () => {
    const b = obBlock(
      [
        {
          id: 'N1',
          rung: [
            {
              t: 'box',
              fn: 'CONVERT',
              inputs: { IN: { abs: '%MW10' } },
              outputs: { OUT: { local: '#bOut' } },
            },
          ],
        },
      ],
      { temp: [{ name: 'bOut', type: 'Bool' }] },
    );
    expect(codes(b)).toEqual([]);
  });

  it('CONVERT Int → Real (đích = kiểu OUT) → không lỗi', () => {
    const b = obBlock(
      [
        {
          id: 'N1',
          rung: [
            {
              t: 'box',
              fn: 'CONVERT',
              inputs: { IN: { abs: '%MW10' } },
              outputs: { OUT: { local: '#rOut' } },
            },
          ],
        },
      ],
      { temp: [{ name: 'rOut', type: 'Real' }] },
    );
    expect(codes(b)).toEqual([]);
  });
});

describe('validate LAD — cấu trúc/interface', () => {
  it('FC có static → LAD-S001', () => {
    const b: LadBlock = {
      kind: 'FC',
      name: 'FC_A',
      interface: { static: [{ name: 'sT', type: 'TON' }] },
      networks: [{ id: 'N1', rung: [COIL_Q] }],
    };
    expect(codes(b)).toContain('LAD-S001');
  });

  it('OB có static → LAD-S001', () => {
    const b = obBlock([{ id: 'N1', rung: [COIL_Q] }], {
      static: [{ name: 'sT', type: 'TON' }],
    });
    expect(codes(b)).toContain('LAD-S001');
  });

  it('Array sai cú pháp → LAD-S001', () => {
    const b = obBlock([{ id: 'N1', rung: [COIL_Q] }], {
      temp: [{ name: 'a', type: 'Array[1..x] of Int' }],
    });
    expect(codes(b)).toContain('LAD-S001');
  });

  it('network id trùng → LAD-T009', () => {
    const b = obBlock([
      { id: 'N1', rung: [COIL_Q] },
      { id: 'N1', rung: [COIL_Q] },
    ]);
    expect(codes(b)).toContain('LAD-T009');
  });

  it('temp __lad_N1_rlo đụng tên người dùng → LAD-T009', () => {
    const b = obBlock([{ id: 'N1', rung: [COIL_Q] }], {
      temp: [{ name: '__lad_N1_rlo', type: 'Bool' }],
    });
    expect(codes(b)).toContain('LAD-T009');
  });

  it('block hợp lệ (series + TON local) → không lỗi', () => {
    const b: LadBlock = {
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
    };
    expect(codes(b)).toEqual([]);
  });
});
