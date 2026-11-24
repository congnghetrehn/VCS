// Test layout — @vcs/runtime-iec (M1 §3.4; bảng tính tay B/C trong STATE §16).
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { FieldDecl, FieldInfo, FieldType } from './layout.js';
import { layoutStruct } from './layout.js';

const elem = (
  type:
    | 'Bool'
    | 'Byte'
    | 'Word'
    | 'DWord'
    | 'Int'
    | 'DInt'
    | 'Real'
    | 'LReal'
    | 'Time'
    | 'USInt'
    | 'SInt'
    | 'UInt'
    | 'UDInt'
    | 'String',
) => ({ kind: 'elem', type }) as const;

describe('layout — bảng tính tay B: struct Motor_Data (M1 §3.4)', () => {
  const motorData: FieldDecl[] = [
    { name: 'running', type: elem('Bool') },
    { name: 'fault', type: elem('Bool') },
    { name: 'ready', type: elem('Bool') },
    { name: 'mode', type: elem('Byte') },
    { name: 'speed', type: elem('Int') },
    { name: 'current', type: elem('Real') },
    { name: 'temp', type: elem('LReal') },
    { name: 'count', type: elem('DInt') },
    { name: 'enabled', type: elem('Bool') },
    { name: 'alarm', type: elem('Bool') },
    { name: 'name_len', type: elem('USInt') },
    { name: 'pressure', type: elem('Word') },
    {
      name: 'nested',
      type: {
        kind: 'struct',
        fields: [
          { name: 'a', type: elem('Bool') },
          { name: 'b', type: elem('Bool') },
          { name: 'c', type: elem('Word') },
        ],
      },
    },
    {
      name: 'values',
      type: { kind: 'array', elem: elem('Int'), lo: 1, hi: 3 },
    },
  ];

  it('toàn bộ FieldInfo + size 34 khớp bảng tính tay', () => {
    const expected: FieldInfo[] = [
      { name: 'running', byteOffset: 0, bitOffset: 0, size: 1, type: elem('Bool') },
      { name: 'fault', byteOffset: 0, bitOffset: 1, size: 1, type: elem('Bool') },
      { name: 'ready', byteOffset: 0, bitOffset: 2, size: 1, type: elem('Bool') },
      { name: 'mode', byteOffset: 1, size: 1, type: elem('Byte') },
      { name: 'speed', byteOffset: 2, size: 2, type: elem('Int') },
      { name: 'current', byteOffset: 4, size: 4, type: elem('Real') },
      { name: 'temp', byteOffset: 8, size: 8, type: elem('LReal') },
      { name: 'count', byteOffset: 16, size: 4, type: elem('DInt') },
      { name: 'enabled', byteOffset: 20, bitOffset: 0, size: 1, type: elem('Bool') },
      { name: 'alarm', byteOffset: 20, bitOffset: 1, size: 1, type: elem('Bool') },
      { name: 'name_len', byteOffset: 21, size: 1, type: elem('USInt') },
      { name: 'pressure', byteOffset: 22, size: 2, type: elem('Word') },
      {
        name: 'nested',
        byteOffset: 24,
        size: 4,
        type: {
          kind: 'struct',
          fields: [
            { name: 'a', type: elem('Bool') },
            { name: 'b', type: elem('Bool') },
            { name: 'c', type: elem('Word') },
          ],
        },
        fields: [
          { name: 'a', byteOffset: 24, bitOffset: 0, size: 1, type: elem('Bool') },
          { name: 'b', byteOffset: 24, bitOffset: 1, size: 1, type: elem('Bool') },
          { name: 'c', byteOffset: 26, size: 2, type: elem('Word') },
        ],
      },
      {
        name: 'values',
        byteOffset: 28,
        size: 6,
        type: { kind: 'array', elem: elem('Int'), lo: 1, hi: 3 },
        elem: { name: '', byteOffset: 0, size: 2, type: elem('Int') },
        count: 3,
      },
    ];
    const layout = layoutStruct(motorData);
    expect(layout.size).toBe(34);
    expect(layout.fields).toEqual(expected);
  });

  it('mọi field ≥ 2 byte ở offset chẵn, không field nào chồng lấn', () => {
    const layout = layoutStruct(motorData);
    for (const f of layout.fields) {
      if (f.type.kind === 'elem' && f.type.type !== 'Bool' && f.size >= 2) {
        expect(f.byteOffset % 2).toBe(0);
      }
    }
    // Byte 24–27 thuộc nested, 28–33 thuộc values.
    const nested = layout.fields[12] as FieldInfo;
    expect(nested.byteOffset).toBe(24);
    expect(nested.size).toBe(4);
    const values = layout.fields[13] as FieldInfo;
    expect(values.byteOffset).toBe(28);
    expect(values.size).toBe(6);
  });
});

describe('layout — bảng tính tay C: trường hợp biên (M1 §3.4)', () => {
  const bool = (name: string): FieldDecl => ({ name, type: elem('Bool') });

  it('{x: Word, b1..b9: Bool×9, y: Byte} → size 6', () => {
    const fields: FieldDecl[] = [
      { name: 'x', type: elem('Word') },
      ...Array.from({ length: 9 }, (_, i) => bool(`b${String(i + 1)}`)),
      { name: 'y', type: elem('Byte') },
    ];
    const l = layoutStruct(fields);
    expect(l.size).toBe(6);
    expect(l.fields[0]?.byteOffset).toBe(0);
    expect(l.fields[1]?.byteOffset).toBe(2);
    expect(l.fields[1]?.bitOffset).toBe(0);
    expect(l.fields[8]?.byteOffset).toBe(2);
    expect(l.fields[8]?.bitOffset).toBe(7);
    expect(l.fields[9]?.byteOffset).toBe(3);
    expect(l.fields[9]?.bitOffset).toBe(0);
    expect(l.fields[10]?.byteOffset).toBe(4);
  });

  it('{a: Word, b1, b2: Bool} → size 4', () => {
    const l = layoutStruct([{ name: 'a', type: elem('Word') }, bool('b1'), bool('b2')]);
    expect(l.size).toBe(4);
    expect(l.fields[1]?.byteOffset).toBe(2);
    expect(l.fields[1]?.bitOffset).toBe(0);
    expect(l.fields[2]?.byteOffset).toBe(2);
    expect(l.fields[2]?.bitOffset).toBe(1);
  });

  it('{m: Byte, s: Struct{a: Word}} → s ở byte 2, size 4', () => {
    const l = layoutStruct([
      { name: 'm', type: elem('Byte') },
      { name: 's', type: { kind: 'struct', fields: [{ name: 'a', type: elem('Word') }] } },
    ]);
    expect(l.size).toBe(4);
    expect(l.fields[1]?.byteOffset).toBe(2);
    expect(l.fields[1]?.size).toBe(2);
    expect(l.fields[1]?.fields?.[0]?.byteOffset).toBe(2);
  });

  it('{m: Byte, arr: Array[0..1] of Word} → arr ở byte 2..5, size 6', () => {
    const l = layoutStruct([
      { name: 'm', type: elem('Byte') },
      { name: 'arr', type: { kind: 'array', elem: elem('Word'), lo: 0, hi: 1 } },
    ]);
    expect(l.size).toBe(6);
    expect(l.fields[1]?.byteOffset).toBe(2);
    expect(l.fields[1]?.size).toBe(4);
    expect(l.fields[1]?.elem?.size).toBe(2);
    expect(l.fields[1]?.count).toBe(2);
  });

  it('{w: Word, flags: Array[0..9] of Bool} → flags byte 2..3, size 4', () => {
    const l = layoutStruct([
      { name: 'w', type: elem('Word') },
      { name: 'flags', type: { kind: 'array', elem: elem('Bool'), lo: 0, hi: 9 } },
    ]);
    expect(l.size).toBe(4);
    expect(l.fields[1]?.byteOffset).toBe(2);
    expect(l.fields[1]?.size).toBe(2);
    expect(l.fields[1]?.elem?.size).toBe(1); // 1 bit/phần tử
    expect(l.fields[1]?.count).toBe(10);
  });

  it('{flags: Array[0..6] of Bool} → 7 bit = 1 byte, kết thúc chẵn → size 2 (OQ-083)', () => {
    const l = layoutStruct([
      { name: 'flags', type: { kind: 'array', elem: elem('Bool'), lo: 0, hi: 6 } },
    ]);
    expect(l.size).toBe(2);
    expect(l.fields[0]?.byteOffset).toBe(0);
    expect(l.fields[0]?.count).toBe(7);
  });

  it('{b: Bool} → size 2 (1 byte nội dung, làm tròn chẵn)', () => {
    const l = layoutStruct([bool('b')]);
    expect(l.size).toBe(2);
    expect(l.fields[0]?.byteOffset).toBe(0);
    expect(l.fields[0]?.bitOffset).toBe(0);
  });

  it('{} (struct rỗng) → size 0', () => {
    expect(layoutStruct([])).toEqual({ size: 0, fields: [] });
  });

  it('{v: Array[1..3] of LReal} → 3×8 = 24', () => {
    const l = layoutStruct([
      { name: 'v', type: { kind: 'array', elem: elem('LReal'), lo: 1, hi: 3 } },
    ]);
    expect(l.size).toBe(24);
    expect(l.fields[0]?.byteOffset).toBe(0);
    expect(l.fields[0]?.elem?.size).toBe(8);
    expect(l.fields[0]?.count).toBe(3);
  });

  it('{a: Array[0..2] of Struct{x: Byte, y: Word}} → elem 4 byte, tổng 12', () => {
    const l = layoutStruct([
      {
        name: 'a',
        type: {
          kind: 'array',
          elem: {
            kind: 'struct',
            fields: [
              { name: 'x', type: elem('Byte') },
              { name: 'y', type: elem('Word') },
            ],
          },
          lo: 0,
          hi: 2,
        },
      },
    ]);
    expect(l.size).toBe(12);
    expect(l.fields[0]?.byteOffset).toBe(0);
    expect(l.fields[0]?.elem?.size).toBe(4);
    expect(l.fields[0]?.elem?.fields?.[0]?.byteOffset).toBe(0);
    expect(l.fields[0]?.elem?.fields?.[1]?.byteOffset).toBe(2);
    expect(l.fields[0]?.count).toBe(3);
  });
});

describe('layout — lỗi', () => {
  it('trùng tên field trong cùng struct → throw', () => {
    expect(() =>
      layoutStruct([
        { name: 'a', type: elem('Byte') },
        { name: 'a', type: elem('Word') },
      ]),
    ).toThrow(/trùng tên field 'a'/);
  });

  it('array lo > hi → throw', () => {
    expect(() =>
      layoutStruct([{ name: 'a', type: { kind: 'array', elem: elem('Int'), lo: 3, hi: 1 } }]),
    ).toThrow(/lo \(3\) > hi \(1\)/);
  });

  it('array lồng array → throw', () => {
    expect(() =>
      layoutStruct([
        {
          name: 'a',
          type: {
            kind: 'array',
            elem: { kind: 'array', elem: elem('Int'), lo: 0, hi: 1 },
            lo: 0,
            hi: 1,
          },
        },
      ]),
    ).toThrow(/lồng array/);
  });

  it('struct chứa String → throw (OQ-087)', () => {
    expect(() => layoutStruct([{ name: 's', type: elem('String') }])).toThrow(/String chưa hỗ trợ/);
  });

  it('array chứa String → throw (OQ-087)', () => {
    expect(() =>
      layoutStruct([{ name: 'a', type: { kind: 'array', elem: elem('String'), lo: 0, hi: 1 } }]),
    ).toThrow(/String chưa hỗ trợ/);
  });

  it('trùng tên ở struct con khác tên ở struct cha thì hợp lệ', () => {
    const l = layoutStruct([
      { name: 'a', type: elem('Byte') },
      {
        name: 's',
        type: {
          kind: 'struct',
          fields: [{ name: 'a', type: elem('Word') }],
        },
      },
    ]);
    expect(l.size).toBe(4);
    expect(l.fields[1]?.fields?.[0]?.byteOffset).toBe(2);
  });
});

describe('layout — property (fast-check, seed cố định)', () => {
  const arrayInt: FieldType = { kind: 'array', elem: elem('Int'), lo: 0, hi: 2 };
  const arrayBool: FieldType = { kind: 'array', elem: elem('Bool'), lo: 0, hi: 5 };
  const nestedStruct: FieldType = {
    kind: 'struct',
    fields: [
      { name: 'a', type: elem('Bool') },
      { name: 'b', type: elem('Word') },
    ],
  };
  const fieldTypeArb = fc.oneof(
    fc.constant(elem('Bool')),
    fc.constant(elem('Byte')),
    fc.constant(elem('Word')),
    fc.constant(elem('Int')),
    fc.constant(elem('DWord')),
    fc.constant(elem('Real')),
    fc.constant(elem('LReal')),
    fc.constant(elem('Time')),
    fc.constant(arrayInt),
    fc.constant(arrayBool),
    fc.constant(nestedStruct),
  );
  const structArb = fc
    .array(fieldTypeArb, { maxLength: 6 })
    .map((types) => types.map((type, i) => ({ name: `f${String(i)}`, type })));

  it('layout tất định, size chẵn, field không-Bool không chồng lấn', () => {
    fc.assert(
      fc.property(structArb, (fields) => {
        const a = layoutStruct(fields);
        const b = layoutStruct(fields);
        expect(a).toEqual(b);
        expect(a.size % 2).toBe(0);
        // Mọi field nằm trong [0, size); field ≥ 2 byte/struct/array ở offset chẵn.
        for (const f of a.fields) {
          expect(f.byteOffset).toBeGreaterThanOrEqual(0);
          expect(f.byteOffset).toBeLessThanOrEqual(Math.max(a.size, 0));
          if (f.size >= 2 && f.type.kind !== 'elem') {
            expect(f.byteOffset % 2).toBe(0);
          }
          if (f.type.kind === 'elem' && f.type.type !== 'Bool' && f.size >= 2) {
            expect(f.byteOffset % 2).toBe(0);
          }
        }
        // Field không-Bool không chồng lấn (theo byte).
        const ranges = a.fields
          .filter((f) => !(f.type.kind === 'elem' && f.type.type === 'Bool'))
          .map((f) => [f.byteOffset, f.byteOffset + f.size] as const);
        for (let i = 0; i < ranges.length; i++) {
          for (let j = i + 1; j < ranges.length; j++) {
            const [a0, a1] = ranges[i] as readonly [number, number];
            const [b0, b1] = ranges[j] as readonly [number, number];
            expect(a1 <= b0 || b1 <= a0).toBe(true);
          }
        }
      }),
      { seed: 20261124, numRuns: 100 },
    );
  });
});
