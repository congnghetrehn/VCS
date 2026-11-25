// Test đại số kiểu + intrinsic của typecheck — P1.3 (bổ sung coverage).
// Chỉ test hàm thuần export + gọi intrinsic qua typecheck; không sửa source.
// Tên test tiếng Việt, ngắn gọn.
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '@vcs/schemas';
import { parseScl } from './parser.js';
import {
  binaryResultType,
  classifyIntrinsic,
  commonType,
  constFitsRange,
  convertModeFor,
  emptyCrossFileTables,
  evalConst,
  interfaceFromSymbols,
  intrinsicArgTarget,
  irTypeEquals,
  irTypeToFieldType,
  isPrimitive,
  isStrictInteger,
  layoutIrFields,
  sclTypeToIrType,
  typecheckFile,
  unaryResultType,
  widen,
} from './typecheck.js';
import type { BlockSymbols, CrossFileTables, SymbolInfo, TypecheckResult } from './typecheck.js';
import type { IrType, PrimitiveType } from '@vcs/runtime-iec';
import type { SclExpr, SclFile, SclLiteral, SclStmt, SclType, SrcLoc, VarDecl } from './ast.js';

// ---------------------------------------------------------------- helpers chung

const LOC: SrcLoc = { line: 1, col: 1, endLine: 1, endCol: 2, offset: 0, length: 1 };

function lit(kind: SclLiteral['kind'], value: number | boolean, type?: string): SclExpr {
  const literal: SclLiteral = { kind, value, raw: String(value), loc: LOC };
  if (type !== undefined) literal.type = type;
  return { kind: 'literal', literal, loc: LOC };
}

function bin(op: string, left: SclExpr, right: SclExpr): SclExpr {
  return { kind: 'binary', op, left, right, loc: LOC };
}

function un(op: '+' | '-' | 'NOT', operand: SclExpr): SclExpr {
  return { kind: 'unary', op, operand, loc: LOC };
}

function refExpr(name: string, withPath = false): SclExpr {
  return {
    kind: 'ref',
    ref: {
      base: { kind: 'local', name, loc: LOC },
      path: withPath ? [{ kind: 'member', name: 'f', loc: LOC }] : [],
      loc: LOC,
    },
    loc: LOC,
  };
}

function emptyScope(): BlockSymbols {
  return { blockId: 'Main', vars: new Map() };
}

function scopeWith(syms: SymbolInfo[]): BlockSymbols {
  const scope = emptyScope();
  for (const s of syms) scope.vars.set(s.name.toLowerCase(), s);
  return scope;
}

function constSym(name: string, type: IrType, init: number | boolean): SymbolInfo {
  return { name, section: 'const', type, init };
}

function hasError(r: { value: number | boolean } | { error: string }): boolean {
  return 'error' in r;
}

// ---------------------------------------------------------------- widen

describe('widen', () => {
  it.each([
    ['SInt→Int', 'SInt', 'Int', true],
    ['Int→DInt', 'Int', 'DInt', true],
    ['DInt→Real', 'DInt', 'Real', true],
    ['Real→LReal', 'Real', 'LReal', true],
    ['SInt→DInt (gián tiếp)', 'SInt', 'DInt', true],
    ['SInt→Real (gián tiếp)', 'SInt', 'Real', true],
    ['SInt→LReal (gián tiếp)', 'SInt', 'LReal', true],
    ['Int→LReal (gián tiếp)', 'Int', 'LReal', true],
    ['USInt→UInt', 'USInt', 'UInt', true],
    ['UInt→UDInt', 'UInt', 'UDInt', true],
    ['USInt→UDInt (gián tiếp)', 'USInt', 'UDInt', true],
    ['Byte→Word', 'Byte', 'Word', true],
    ['Word→DWord', 'Word', 'DWord', true],
    ['Byte→DWord (gián tiếp)', 'Byte', 'DWord', true],
    ['bằng nhau', 'Int', 'Int', true],
    ['Bool→Bool (bằng nhau)', 'Bool', 'Bool', true],
    ['Time→Time (bằng nhau)', 'Time', 'Time', true],
    ['ngược Int→SInt', 'Int', 'SInt', false],
    ['ngược DInt→Int', 'DInt', 'Int', false],
    ['ngược LReal→Real', 'LReal', 'Real', false],
    ['ngược UDInt→UInt', 'UDInt', 'UInt', false],
    ['ngược DWord→Word', 'DWord', 'Word', false],
    ['Bool không widening', 'Bool', 'Int', false],
    ['Time không widening', 'Time', 'DInt', false],
    ['Time→Real', 'Time', 'Real', false],
    ['khác họ Int→Word', 'Int', 'Word', false],
    ['khác họ Word→Int', 'Word', 'Int', false],
    ['USInt→Int', 'USInt', 'Int', false],
    ['Byte→Int', 'Byte', 'Int', false],
  ] as const)('%s', (_name, from, to, expected) => {
    expect(widen(from, to)).toBe(expected);
  });
});

// ---------------------------------------------------------------- commonType

describe('commonType', () => {
  const structA: IrType = {
    kind: 'struct',
    fields: [
      { name: 'a', type: 'Int', byteOffset: 0, size: 2 },
      { name: 'b', type: 'Bool', byteOffset: 2, bitOffset: 0, size: 1 },
    ],
  };
  const structA2: IrType = {
    kind: 'struct',
    name: 'Khac',
    fields: [
      { name: 'a', type: 'Int', byteOffset: 0, size: 2 },
      { name: 'b', type: 'Bool', byteOffset: 2, bitOffset: 0, size: 1 },
    ],
  };
  const structB: IrType = {
    kind: 'struct',
    fields: [{ name: 'a', type: 'DInt', byteOffset: 0, size: 4 }],
  };
  const arrA: IrType = { kind: 'array', elem: 'Int', lo: 0, hi: 3 };
  const arrB: IrType = { kind: 'array', elem: 'Int', lo: 0, hi: 4 };

  it.each([
    ['Int + DInt → DInt', 'Int', 'DInt', 'DInt'],
    ['DInt + Int → DInt', 'DInt', 'Int', 'DInt'],
    ['SInt + DInt → DInt', 'SInt', 'DInt', 'DInt'],
    ['Int + Real → Real', 'Int', 'Real', 'Real'],
    ['Real + LReal → LReal', 'Real', 'LReal', 'LReal'],
    ['USInt + UDInt → UDInt', 'USInt', 'UDInt', 'UDInt'],
    ['Byte + DWord → DWord', 'Byte', 'DWord', 'DWord'],
    ['bằng nhau → chính nó', 'Int', 'Int', 'Int'],
    ['Bool + Bool → Bool', 'Bool', 'Bool', 'Bool'],
    ['Time + Time → Time', 'Time', 'Time', 'Time'],
  ] as const)('%s', (_name, a, b, expected) => {
    expect(commonType(a, b)).toBe(expected);
  });

  it.each([
    ['Int + Word khác họ', 'Int', 'Word'],
    ['Bool + Int', 'Bool', 'Int'],
    ['Time + Int', 'Time', 'Int'],
    ['Time + Real', 'Time', 'Real'],
    ['USInt + Int', 'USInt', 'Int'],
    ['Byte + Int', 'Byte', 'Int'],
  ] as const)('%s → undefined', (_name, a, b) => {
    expect(commonType(a, b)).toBeUndefined();
  });

  it('struct bằng nhau (tên khác vẫn bằng) → chính nó', () => {
    expect(commonType(structA, structA2)).toEqual(structA);
  });

  it('struct khác nhau → undefined', () => {
    expect(commonType(structA, structB)).toBeUndefined();
  });

  it('array bằng nhau → chính nó', () => {
    expect(commonType(arrA, arrA)).toEqual(arrA);
  });

  it('array khác hi → undefined', () => {
    expect(commonType(arrA, arrB)).toBeUndefined();
  });

  it('struct + array → undefined', () => {
    expect(commonType(structA, arrA)).toBeUndefined();
  });
});

// ---------------------------------------------------------------- irTypeEquals

describe('irTypeEquals', () => {
  it('primitive bằng / khác', () => {
    expect(irTypeEquals('Int', 'Int')).toBe(true);
    expect(irTypeEquals('Int', 'DInt')).toBe(false);
    expect(irTypeEquals('Bool', 'Bool')).toBe(true);
  });

  it('struct: thứ tự field quyết định', () => {
    const a: IrType = {
      kind: 'struct',
      fields: [
        { name: 'x', type: 'Int', byteOffset: 0, size: 2 },
        { name: 'y', type: 'Bool', byteOffset: 2, bitOffset: 0, size: 1 },
      ],
    };
    const same: IrType = {
      kind: 'struct',
      name: 'TenKhac',
      fields: [
        { name: 'x', type: 'Int', byteOffset: 0, size: 2 },
        { name: 'y', type: 'Bool', byteOffset: 2, bitOffset: 0, size: 1 },
      ],
    };
    const swapped: IrType = {
      kind: 'struct',
      fields: [
        { name: 'y', type: 'Bool', byteOffset: 0, bitOffset: 0, size: 1 },
        { name: 'x', type: 'Int', byteOffset: 2, size: 2 },
      ],
    };
    const fewer: IrType = {
      kind: 'struct',
      fields: [{ name: 'x', type: 'Int', byteOffset: 0, size: 2 }],
    };
    expect(irTypeEquals(a, same)).toBe(true);
    expect(irTypeEquals(a, swapped)).toBe(false);
    expect(irTypeEquals(a, fewer)).toBe(false);
  });

  it('array: lo/hi/elem đều phải bằng', () => {
    const base: IrType = { kind: 'array', elem: 'Int', lo: 0, hi: 3 };
    expect(irTypeEquals(base, { kind: 'array', elem: 'Int', lo: 0, hi: 3 })).toBe(true);
    expect(irTypeEquals(base, { kind: 'array', elem: 'Int', lo: 1, hi: 3 })).toBe(false);
    expect(irTypeEquals(base, { kind: 'array', elem: 'Int', lo: 0, hi: 4 })).toBe(false);
    expect(irTypeEquals(base, { kind: 'array', elem: 'DInt', lo: 0, hi: 3 })).toBe(false);
    expect(
      irTypeEquals(base, {
        kind: 'struct',
        fields: [{ name: 'x', type: 'Int', byteOffset: 0, size: 2 }],
      }),
    ).toBe(false);
  });

  it('primitive + struct → false', () => {
    expect(
      irTypeEquals('Int', {
        kind: 'struct',
        fields: [{ name: 'x', type: 'Int', byteOffset: 0, size: 2 }],
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------- binaryResultType

describe('binaryResultType', () => {
  const structA: IrType = {
    kind: 'struct',
    fields: [{ name: 'x', type: 'Int', byteOffset: 0, size: 2 }],
  };
  const structB: IrType = {
    kind: 'struct',
    fields: [{ name: 'x', type: 'DInt', byteOffset: 0, size: 4 }],
  };
  const arr: IrType = { kind: 'array', elem: 'Int', lo: 0, hi: 3 };

  it.each([
    // [tên, op, trái, phải, kết quả]
    ['= cùng kiểu', '=', 'Int', 'Int', 'Bool'],
    ['= widening được', '=', 'Int', 'DInt', 'Bool'],
    ['= Bool', '=', 'Bool', 'Bool', 'Bool'],
    ['= bit-string', '=', 'Word', 'Word', 'Bool'],
    ['= struct bằng nhau', '=', structA, structA, 'Bool'],
    ['<> widening được', '<>', 'Real', 'Int', 'Bool'],
    ['< số', '<', 'Int', 'DInt', 'Bool'],
    ['<= số', '<=', 'SInt', 'Int', 'Bool'],
    ['> số thực', '>', 'Real', 'LReal', 'Bool'],
    ['>= Time', '>=', 'Time', 'Time', 'Bool'],
    ['< Time', '<', 'Time', 'Time', 'Bool'],
    ['AND Bool', 'AND', 'Bool', 'Bool', 'Bool'],
    ['OR Bool', 'OR', 'Bool', 'Bool', 'Bool'],
    ['XOR Bool', 'XOR', 'Bool', 'Bool', 'Bool'],
    ['AND Byte+Word → Word', 'AND', 'Byte', 'Word', 'Word'],
    ['OR Word+DWord → DWord', 'OR', 'Word', 'DWord', 'DWord'],
    ['XOR Byte+Byte → Byte', 'XOR', 'Byte', 'Byte', 'Byte'],
    ['** Int → Real', '**', 'Int', 'Int', 'Real'],
    ['** LReal → LReal', '**', 'LReal', 'Int', 'LReal'],
    ['** Real+LReal → LReal', '**', 'Real', 'LReal', 'LReal'],
    ['MOD Int+DInt → DInt', 'MOD', 'Int', 'DInt', 'DInt'],
    ['MOD SInt+Int → Int', 'MOD', 'SInt', 'Int', 'Int'],
    ['+ Int+DInt → DInt', '+', 'Int', 'DInt', 'DInt'],
    ['- Real+Int → Real', '-', 'Real', 'Int', 'Real'],
    ['* LReal+Real → LReal', '*', 'LReal', 'Real', 'LReal'],
    ['/ DInt/Int → DInt', '/', 'DInt', 'Int', 'DInt'],
    ['DIV Int/DInt → DInt', 'DIV', 'Int', 'DInt', 'DInt'],
    ['+ Time+Time → Time', '+', 'Time', 'Time', 'Time'],
    ['- Time-Time → Time', '-', 'Time', 'Time', 'Time'],
  ] as const)('%s: %s %s %s → %s', (_name, op, lt, rt, expected) => {
    expect(binaryResultType(op, lt, rt)).toBe(expected);
  });

  it.each([
    // [tên, op, trái, phải] → undefined
    ['= khác họ Int/Word', '=', 'Int', 'Word'],
    ['= Bool/Int', '=', 'Bool', 'Int'],
    ['= struct khác nhau', '=', structA, structB],
    ['<> Int/Word', '<>', 'Int', 'Word'],
    ['< Bool', '<', 'Bool', 'Bool'],
    ['< bit-string', '<', 'Word', 'Word'],
    ['< Bool/Int', '<', 'Bool', 'Int'],
    ['< Int/Bool', '<', 'Int', 'Bool'],
    ['< struct', '<', structA, structA],
    ['< array', '<', arr, arr],
    ['AND Bool/bit-string', 'AND', 'Bool', 'Word'],
    ['AND bit-string/Bool', 'AND', 'Word', 'Bool'],
    ['AND số/số', 'AND', 'Int', 'Int'],
    ['OR số/bit-string', 'OR', 'Int', 'Word'],
    ['AND struct', 'AND', structA, structA],
    ['** Bool', '**', 'Bool', 'Int'],
    ['** số/bit-string', '**', 'Int', 'Word'],
    ['** struct', '**', structA, structA],
    ['MOD số thực', 'MOD', 'Real', 'Int'],
    ['MOD Int/Word', 'MOD', 'Int', 'Word'],
    ['MOD Bool', 'MOD', 'Bool', 'Bool'],
    ['+ Bool+Bool', '+', 'Bool', 'Bool'],
    ['+ Time+Int', '+', 'Time', 'Int'],
    ['+ Int+Time', '+', 'Int', 'Time'],
    ['* Time*Time', '*', 'Time', 'Time'],
    ['/ Time/Time', '/', 'Time', 'Time'],
    ['+ số/bit-string', '+', 'Int', 'Word'],
    ['+ bit-string/số', '+', 'Word', 'Int'],
    ['+ số/Bool', '+', 'Int', 'Bool'],
    ['+ struct', '+', structA, structA],
    ['+ array', '+', arr, arr],
  ] as const)('%s → undefined', (_name, op, lt, rt) => {
    expect(binaryResultType(op, lt, rt)).toBeUndefined();
  });
});

// ---------------------------------------------------------------- unaryResultType

describe('unaryResultType', () => {
  it.each([
    ['+ Int', '+', 'Int', 'Int'],
    ['- Int', '-', 'Int', 'Int'],
    ['+ Real', '+', 'Real', 'Real'],
    ['- LReal', '-', 'LReal', 'LReal'],
    ['+ Time', '+', 'Time', 'Time'],
    ['- Time', '-', 'Time', 'Time'],
    ['NOT Bool', 'NOT', 'Bool', 'Bool'],
    ['NOT Byte', 'NOT', 'Byte', 'Byte'],
    ['NOT Word', 'NOT', 'Word', 'Word'],
    ['NOT DWord', 'NOT', 'DWord', 'DWord'],
  ] as const)('%s → %s', (_name, op, t, expected) => {
    expect(unaryResultType(op, t)).toBe(expected);
  });

  it.each([
    ['NOT Int', 'NOT', 'Int'],
    ['NOT Real', 'NOT', 'Real'],
    ['NOT Time', 'NOT', 'Time'],
    ['+ Bool', '+', 'Bool'],
    ['- Byte', '-', 'Byte'],
    ['+ Word', '+', 'Word'],
    ['- Bool', '-', 'Bool'],
  ] as const)('%s → undefined', (_name, op, t) => {
    expect(unaryResultType(op, t)).toBeUndefined();
  });

  it('unary trên struct/array → undefined', () => {
    const s: IrType = {
      kind: 'struct',
      fields: [{ name: 'x', type: 'Int', byteOffset: 0, size: 2 }],
    };
    const a: IrType = { kind: 'array', elem: 'Int', lo: 0, hi: 3 };
    expect(unaryResultType('-', s)).toBeUndefined();
    expect(unaryResultType('NOT', a)).toBeUndefined();
    expect(unaryResultType('+', a)).toBeUndefined();
  });
});

// ---------------------------------------------------------------- constFitsRange

describe('constFitsRange', () => {
  it.each([
    ['SInt -128', -128, 'SInt', true],
    ['SInt 127', 127, 'SInt', true],
    ['SInt 128', 128, 'SInt', false],
    ['SInt -129', -129, 'SInt', false],
    ['Int -32768', -32768, 'Int', true],
    ['Int 32767', 32767, 'Int', true],
    ['Int 32768', 32768, 'Int', false],
    ['DInt min', -2147483648, 'DInt', true],
    ['DInt max', 2147483647, 'DInt', true],
    ['DInt max+1', 2147483648, 'DInt', false],
    ['USInt 0', 0, 'USInt', true],
    ['USInt 255', 255, 'USInt', true],
    ['USInt 256', 256, 'USInt', false],
    ['USInt -1', -1, 'USInt', false],
    ['UInt 65535', 65535, 'UInt', true],
    ['UInt 65536', 65536, 'UInt', false],
    ['UDInt max', 4294967295, 'UDInt', true],
    ['UDInt max+1', 4294967296, 'UDInt', false],
    ['Byte 255', 255, 'Byte', true],
    ['Byte 256', 256, 'Byte', false],
    ['Word 65535', 65535, 'Word', true],
    ['Word -1', -1, 'Word', false],
    ['DWord max', 4294967295, 'DWord', true],
    ['DWord max+1', 4294967296, 'DWord', false],
  ] as const)('%s', (_name, value, target, expected) => {
    expect(constFitsRange(value, target)).toBe(expected);
  });

  it('Real/LReal/Bool/Time luôn true', () => {
    expect(constFitsRange(1e30, 'Real')).toBe(true);
    expect(constFitsRange(-1e30, 'LReal')).toBe(true);
    expect(constFitsRange(999999, 'Bool')).toBe(true);
    expect(constFitsRange(-5, 'Time')).toBe(true);
  });
});

// ---------------------------------------------------------------- evalConst

describe('evalConst', () => {
  it('literal int/real/bool/time', () => {
    expect(evalConst(lit('int', 42), emptyScope())).toEqual({ value: 42 });
    expect(evalConst(lit('real', 2.5), emptyScope())).toEqual({ value: 2.5 });
    expect(evalConst(lit('bool', true), emptyScope())).toEqual({ value: true });
    expect(evalConst(lit('time', 1500), emptyScope())).toEqual({ value: 1500 });
  });

  it('literal String → error', () => {
    expect(hasError(evalConst(lit('int', 0, 'String'), emptyScope()))).toBe(true);
  });

  it('unary - / + / NOT', () => {
    expect(evalConst(un('-', lit('int', 5)), emptyScope())).toEqual({ value: -5 });
    expect(evalConst(un('+', lit('int', 5)), emptyScope())).toEqual({ value: 5 });
    expect(evalConst(un('NOT', lit('bool', true)), emptyScope())).toEqual({ value: false });
    expect(evalConst(un('NOT', lit('bool', false)), emptyScope())).toEqual({ value: true });
    expect(evalConst(un('NOT', lit('int', 5)), emptyScope())).toEqual({ value: -6 });
    expect(evalConst(un('NOT', lit('int', 0)), emptyScope())).toEqual({ value: -1 });
  });

  it('unary sai kiểu → error', () => {
    expect(hasError(evalConst(un('-', lit('bool', true)), emptyScope()))).toBe(true);
    expect(hasError(evalConst(un('+', lit('bool', false)), emptyScope()))).toBe(true);
  });

  it('binary số học + - *', () => {
    expect(evalConst(bin('+', lit('int', 2), lit('int', 3)), emptyScope())).toEqual({ value: 5 });
    expect(evalConst(bin('-', lit('int', 2), lit('int', 3)), emptyScope())).toEqual({ value: -1 });
    expect(evalConst(bin('*', lit('int', 2), lit('int', 3)), emptyScope())).toEqual({ value: 6 });
    expect(evalConst(bin('*', lit('real', 2.5), lit('int', 2)), emptyScope())).toEqual({ value: 5 });
    expect(evalConst(bin('**', lit('int', 2), lit('int', 3)), emptyScope())).toEqual({ value: 8 });
  });

  it('chia nguyên cắt về 0, chia thực giữ thập phân', () => {
    expect(evalConst(bin('/', lit('int', 7), lit('int', 2)), emptyScope())).toEqual({ value: 3 });
    expect(evalConst(bin('/', lit('int', -7), lit('int', 2)), emptyScope())).toEqual({ value: -3 });
    expect(evalConst(bin('DIV', lit('int', 7), lit('int', 2)), emptyScope())).toEqual({ value: 3 });
    expect(evalConst(bin('/', lit('real', 7.5), lit('int', 2)), emptyScope())).toEqual({ value: 3.75 });
  });

  it('chia 0 → error (cả / DIV MOD)', () => {
    expect(hasError(evalConst(bin('/', lit('int', 1), lit('int', 0)), emptyScope()))).toBe(true);
    expect(hasError(evalConst(bin('DIV', lit('int', 1), lit('int', 0)), emptyScope()))).toBe(true);
    expect(hasError(evalConst(bin('MOD', lit('int', 1), lit('int', 0)), emptyScope()))).toBe(true);
  });

  it('MOD dấu theo số bị chia', () => {
    expect(evalConst(bin('MOD', lit('int', -7), lit('int', 2)), emptyScope())).toEqual({ value: -1 });
    expect(evalConst(bin('MOD', lit('int', 7), lit('int', -2)), emptyScope())).toEqual({ value: 1 });
    expect(evalConst(bin('MOD', lit('int', 7), lit('int', 2)), emptyScope())).toEqual({ value: 1 });
  });

  it('so sánh = <> < > <= >=', () => {
    expect(evalConst(bin('=', lit('int', 2), lit('int', 2)), emptyScope())).toEqual({ value: true });
    expect(evalConst(bin('<>', lit('int', 2), lit('int', 3)), emptyScope())).toEqual({ value: true });
    expect(evalConst(bin('<', lit('int', 2), lit('int', 3)), emptyScope())).toEqual({ value: true });
    expect(evalConst(bin('>', lit('int', 2), lit('int', 3)), emptyScope())).toEqual({ value: false });
    expect(evalConst(bin('<=', lit('int', 3), lit('int', 3)), emptyScope())).toEqual({ value: true });
    expect(evalConst(bin('>=', lit('int', 2), lit('int', 3)), emptyScope())).toEqual({ value: false });
    expect(evalConst(bin('=', lit('bool', true), lit('bool', false)), emptyScope())).toEqual({
      value: false,
    });
  });

  it('AND/OR/XOR trên Bool và trên số nguyên', () => {
    expect(evalConst(bin('AND', lit('bool', true), lit('bool', false)), emptyScope())).toEqual({
      value: false,
    });
    expect(evalConst(bin('OR', lit('bool', true), lit('bool', false)), emptyScope())).toEqual({
      value: true,
    });
    expect(evalConst(bin('XOR', lit('bool', true), lit('bool', true)), emptyScope())).toEqual({
      value: false,
    });
    expect(evalConst(bin('AND', lit('int', 5), lit('int', 3)), emptyScope())).toEqual({ value: 1 });
    expect(evalConst(bin('OR', lit('int', 5), lit('int', 3)), emptyScope())).toEqual({ value: 7 });
    expect(evalConst(bin('XOR', lit('int', 5), lit('int', 3)), emptyScope())).toEqual({ value: 6 });
  });

  it('AND/OR/XOR trộn Bool với số → error; + trên Bool → error', () => {
    expect(hasError(evalConst(bin('AND', lit('bool', true), lit('int', 1)), emptyScope()))).toBe(true);
    expect(hasError(evalConst(bin('OR', lit('int', 1), lit('bool', true)), emptyScope()))).toBe(true);
    expect(hasError(evalConst(bin('XOR', lit('bool', true), lit('int', 1)), emptyScope()))).toBe(true);
    expect(hasError(evalConst(bin('+', lit('bool', true), lit('bool', false)), emptyScope()))).toBe(
      true,
    );
  });

  it('toán tử lạ trong biểu thức hằng → error; lỗi lan từ toán hạng', () => {
    expect(
      hasError(evalConst(bin('???', lit('int', 1), lit('int', 2)), emptyScope())),
    ).toBe(true);
    expect(
      hasError(
        evalConst(bin('+', lit('int', 1), bin('/', lit('int', 1), lit('int', 0))), emptyScope()),
      ),
    ).toBe(true);
    expect(
      hasError(evalConst(un('-', bin('/', lit('int', 1), lit('int', 0))), emptyScope())),
    ).toBe(true);
  });

  it('gọi hàm không phải biểu thức hằng', () => {
    const call: SclExpr = {
      kind: 'call',
      callee: { kind: 'ident', name: 'ABS', loc: LOC },
      args: [{ kind: 'positional', value: lit('int', 1), loc: LOC }],
      loc: LOC,
    };
    expect(hasError(evalConst(call, emptyScope()))).toBe(true);
  });

  it('ref tới VAR_CONSTANT có trong scope (không phân biệt hoa/thường)', () => {
    const scope = scopeWith([constSym('c', 'Int', 42)]);
    expect(evalConst(refExpr('c'), scope)).toEqual({ value: 42 });
    expect(evalConst(refExpr('C'), scope)).toEqual({ value: 42 });
    expect(evalConst(bin('+', refExpr('c'), lit('int', 1)), scope)).toEqual({ value: 43 });
  });

  it('ref tới VAR_CONSTANT không có trong scope → error', () => {
    expect(hasError(evalConst(refExpr('khongCo'), emptyScope()))).toBe(true);
  });

  it('ref tới biến thường (không phải const) → error', () => {
    const scope = scopeWith([
      { name: 't', section: 'temp', type: 'Int', init: 5 },
      { name: 'k', section: 'const', type: 'Int' },
    ]);
    expect(hasError(evalConst(refExpr('t'), scope))).toBe(true);
    expect(hasError(evalConst(refExpr('k'), scope))).toBe(true);
  });

  it('ref có path / base global → error', () => {
    const scope = scopeWith([constSym('c', 'Int', 1)]);
    expect(hasError(evalConst(refExpr('c', true), scope))).toBe(true);
    const global: SclExpr = {
      kind: 'ref',
      ref: { base: { kind: 'global', name: 'DB1', loc: LOC }, path: [], loc: LOC },
      loc: LOC,
    };
    expect(hasError(evalConst(global, scope))).toBe(true);
  });
});

// ---------------------------------------------------------------- classifyIntrinsic

describe('classifyIntrinsic', () => {
  it.each([
    ['REAL_TO_INT → convert + round', 'REAL_TO_INT', { kind: 'convert', from: 'Real', to: 'Int', mode: 'round' }],
    ['LREAL_TO_DINT → convert + round', 'LREAL_TO_DINT', { kind: 'convert', from: 'LReal', to: 'DInt', mode: 'round' }],
    ['INT_TO_REAL → convert', 'INT_TO_REAL', { kind: 'convert', from: 'Int', to: 'Real' }],
    ['INT_TO_DINT → convert', 'INT_TO_DINT', { kind: 'convert', from: 'Int', to: 'DInt' }],
    ['DINT_TO_REAL → convert', 'DINT_TO_REAL', { kind: 'convert', from: 'DInt', to: 'Real' }],
    ['REAL_TO_LREAL → convert', 'REAL_TO_LREAL', { kind: 'convert', from: 'Real', to: 'LReal' }],
    ['LREAL_TO_REAL → convert', 'LREAL_TO_REAL', { kind: 'convert', from: 'LReal', to: 'Real' }],
    ['WORD_TO_DWORD → convert', 'WORD_TO_DWORD', { kind: 'convert', from: 'Word', to: 'DWord' }],
    ['DWORD_TO_REAL → convert', 'DWORD_TO_REAL', { kind: 'convert', from: 'DWord', to: 'Real' }],
    ['BYTE_TO_INT → convert', 'BYTE_TO_INT', { kind: 'convert', from: 'Byte', to: 'Int' }],
    ['BOOL_TO_INT → convert', 'BOOL_TO_INT', { kind: 'convert', from: 'Bool', to: 'Int' }],
    ['BOOL_TO_DINT → convert', 'BOOL_TO_DINT', { kind: 'convert', from: 'Bool', to: 'DInt' }],
    ['BOOL_TO_BYTE → convert', 'BOOL_TO_BYTE', { kind: 'convert', from: 'Bool', to: 'Byte' }],
    ['BOOL_TO_WORD → convert', 'BOOL_TO_WORD', { kind: 'convert', from: 'Bool', to: 'Word' }],
    ['BOOL_TO_DWORD → convert', 'BOOL_TO_DWORD', { kind: 'convert', from: 'Bool', to: 'DWord' }],
    ['ROUND → roundConvert round', 'ROUND', { kind: 'roundConvert', mode: 'round' }],
    ['TRUNC → roundConvert trunc', 'TRUNC', { kind: 'roundConvert', mode: 'trunc' }],
    ['ABS → intrinsic', 'ABS', { kind: 'intrinsic', fn: 'ABS' }],
    ['SQRT → intrinsic', 'SQRT', { kind: 'intrinsic', fn: 'SQRT' }],
    ['MIN → intrinsic', 'MIN', { kind: 'intrinsic', fn: 'MIN' }],
    ['MAX → intrinsic', 'MAX', { kind: 'intrinsic', fn: 'MAX' }],
    ['LIMIT → intrinsic', 'LIMIT', { kind: 'intrinsic', fn: 'LIMIT' }],
    ['SHL → intrinsic', 'SHL', { kind: 'intrinsic', fn: 'SHL' }],
    ['SHR → intrinsic', 'SHR', { kind: 'intrinsic', fn: 'SHR' }],
    ['ROL → intrinsic', 'ROL', { kind: 'intrinsic', fn: 'ROL' }],
    ['ROR → intrinsic', 'ROR', { kind: 'intrinsic', fn: 'ROR' }],
    ['CEIL → intrinsic', 'CEIL', { kind: 'intrinsic', fn: 'CEIL' }],
    ['FLOOR → intrinsic', 'FLOOR', { kind: 'intrinsic', fn: 'FLOOR' }],
    ['NORM_X → intrinsic', 'NORM_X', { kind: 'intrinsic', fn: 'NORM_X' }],
    ['SCALE_X → intrinsic', 'SCALE_X', { kind: 'intrinsic', fn: 'SCALE_X' }],
  ] as const)('%s', (_name, input, expected) => {
    expect(classifyIntrinsic(input)).toEqual(expected);
  });

  it.each([
    ['BOOL_TO_REAL (không trong tập hẹp)', 'BOOL_TO_REAL'],
    ['BOOL_TO_SINT', 'BOOL_TO_SINT'],
    ['BOOL_TO_LREAL', 'BOOL_TO_LREAL'],
    ['SINT_TO_INT (SInt không có trong tập)', 'SINT_TO_INT'],
    ['INT_TO_SINT', 'INT_TO_SINT'],
    ['USINT_TO_UINT', 'USINT_TO_UINT'],
    ['TIME_TO_DINT', 'TIME_TO_DINT'],
    ['tên lạ', 'FOO'],
    ['FOO_TO_BAR', 'FOO_TO_BAR'],
    ['INT_TO_FOO', 'INT_TO_FOO'],
    ['không có _TO_', 'INTREAL'],
    ['chuỗi rỗng', ''],
  ] as const)('%s → undefined', (_name, input) => {
    expect(classifyIntrinsic(input)).toBeUndefined();
  });

  it('chữ thường vẫn nhận (real_to_int, round, abs)', () => {
    expect(classifyIntrinsic('real_to_int')).toEqual({
      kind: 'convert',
      from: 'Real',
      to: 'Int',
      mode: 'round',
    });
    expect(classifyIntrinsic('round')).toEqual({ kind: 'roundConvert', mode: 'round' });
    expect(classifyIntrinsic('abs')).toEqual({ kind: 'intrinsic', fn: 'ABS' });
    expect(classifyIntrinsic('bool_to_int')).toEqual({ kind: 'convert', from: 'Bool', to: 'Int' });
  });
});

// ---------------------------------------------------------------- convertModeFor / isStrictInteger / isPrimitive

describe('convertModeFor', () => {
  it.each([
    ['Real→Int round', 'Real', 'Int', 'round'],
    ['LReal→DInt round', 'LReal', 'DInt', 'round'],
    ['Real→SInt round', 'Real', 'SInt', 'round'],
    ['LReal→UInt round', 'LReal', 'UInt', 'round'],
    ['Int→Real undefined', 'Int', 'Real', undefined],
    ['Int→DInt undefined', 'Int', 'DInt', undefined],
    ['Real→LReal undefined', 'Real', 'LReal', undefined],
    ['Real→Word undefined (Word không phải strict integer)', 'Real', 'Word', undefined],
    ['Real→Real undefined', 'Real', 'Real', undefined],
    ['DInt→Real undefined', 'DInt', 'Real', undefined],
  ] as const)('%s', (_name, from, to, expected) => {
    expect(convertModeFor(from, to)).toBe(expected);
  });
});

describe('isStrictInteger', () => {
  it.each([
    ['SInt', 'SInt', true],
    ['USInt', 'USInt', true],
    ['UInt', 'UInt', true],
    ['UDInt', 'UDInt', true],
    ['Int', 'Int', true],
    ['DInt', 'DInt', true],
    ['Byte', 'Byte', false],
    ['Word', 'Word', false],
    ['DWord', 'DWord', false],
    ['Real', 'Real', false],
    ['LReal', 'LReal', false],
    ['Bool', 'Bool', false],
    ['Time (loại trừ)', 'Time', false],
  ] as const)('%s → %s', (_name, t, expected) => {
    expect(isStrictInteger(t)).toBe(expected);
  });
});

describe('isPrimitive', () => {
  it('primitive true, array/struct false', () => {
    expect(isPrimitive('Int')).toBe(true);
    expect(isPrimitive('Bool')).toBe(true);
    expect(isPrimitive({ kind: 'array', elem: 'Int', lo: 0, hi: 3 })).toBe(false);
    expect(
      isPrimitive({
        kind: 'struct',
        fields: [{ name: 'x', type: 'Int', byteOffset: 0, size: 2 }],
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------- irTypeToFieldType

describe('irTypeToFieldType', () => {
  it('mọi primitive → elem', () => {
    for (const t of ['Bool', 'Byte', 'Word', 'DWord', 'SInt', 'USInt', 'UInt', 'UDInt', 'Int', 'DInt', 'Real', 'LReal', 'Time'] as PrimitiveType[]) {
      expect(irTypeToFieldType(t)).toEqual({ kind: 'elem', type: t });
    }
  });

  it('array → array (đệ quy elem)', () => {
    expect(irTypeToFieldType({ kind: 'array', elem: 'Int', lo: 0, hi: 3 })).toEqual({
      kind: 'array',
      elem: { kind: 'elem', type: 'Int' },
      lo: 0,
      hi: 3,
    });
    expect(
      irTypeToFieldType({
        kind: 'array',
        elem: { kind: 'struct', fields: [{ name: 'x', type: 'Bool', byteOffset: 0, bitOffset: 0, size: 1 }] },
        lo: 1,
        hi: 2,
      }),
    ).toEqual({
      kind: 'array',
      elem: {
        kind: 'struct',
        fields: [{ name: 'x', type: { kind: 'elem', type: 'Bool' } }],
      },
      lo: 1,
      hi: 2,
    });
  });

  it('struct → struct (giữ name nếu có, map field)', () => {
    expect(
      irTypeToFieldType({
        kind: 'struct',
        name: 'U',
        fields: [
          { name: 'a', type: 'Int', byteOffset: 0, size: 2 },
          { name: 'b', type: { kind: 'array', elem: 'Bool', lo: 0, hi: 7 }, byteOffset: 2, size: 2 },
        ],
      }),
    ).toEqual({
      kind: 'struct',
      name: 'U',
      fields: [
        { name: 'a', type: { kind: 'elem', type: 'Int' } },
        {
          name: 'b',
          type: { kind: 'array', elem: { kind: 'elem', type: 'Bool' }, lo: 0, hi: 7 },
        },
      ],
    });
    expect(
      irTypeToFieldType({
        kind: 'struct',
        fields: [{ name: 'a', type: 'Int', byteOffset: 0, size: 2 }],
      }),
    ).toEqual({
      kind: 'struct',
      fields: [{ name: 'a', type: { kind: 'elem', type: 'Int' } }],
    });
  });
});

// ---------------------------------------------------------------- layoutIrFields

describe('layoutIrFields', () => {
  it('Bool gói bit chung byte, bitOffset tăng dần', () => {
    const { fields, size } = layoutIrFields([
      { name: 'a', type: 'Bool' },
      { name: 'b', type: 'Bool' },
      { name: 'c', type: 'Bool' },
    ]);
    expect(fields[0]).toMatchObject({ name: 'a', byteOffset: 0, bitOffset: 0, size: 1 });
    expect(fields[1]).toMatchObject({ name: 'b', byteOffset: 0, bitOffset: 1, size: 1 });
    expect(fields[2]).toMatchObject({ name: 'c', byteOffset: 0, bitOffset: 2, size: 1 });
    expect(size).toBe(2);
  });

  it('Int offset/size; Bool rồi Int căn chẵn', () => {
    const { fields, size } = layoutIrFields([
      { name: 'flag', type: 'Bool' },
      { name: 'n', type: 'Int' },
    ]);
    expect(fields[0]).toMatchObject({ name: 'flag', byteOffset: 0, bitOffset: 0, size: 1 });
    expect(fields[1]).toMatchObject({ name: 'n', byteOffset: 2, size: 2 });
    expect(size).toBe(4);
  });

  it('một Byte lẻ → tổng size làm tròn chẵn', () => {
    const { fields, size } = layoutIrFields([{ name: 'b', type: 'Byte' }]);
    expect(fields[0]).toMatchObject({ byteOffset: 0, size: 1 });
    expect(size).toBe(2);
  });

  it('struct lồng: offset tương đối, size lồng', () => {
    const inner: IrType = {
      kind: 'struct',
      fields: [
        { name: 'x', type: 'Int', byteOffset: 0, size: 2 },
        { name: 'y', type: 'Bool', byteOffset: 2, bitOffset: 0, size: 1 },
      ],
    };
    const { fields, size } = layoutIrFields([
      { name: 'inner', type: inner },
      { name: 'n', type: 'DInt' },
    ]);
    expect(fields[0]).toMatchObject({ name: 'inner', byteOffset: 0, size: 4 });
    expect(fields[1]).toMatchObject({ name: 'n', byteOffset: 4, size: 4 });
    expect(size).toBe(8);
  });

  it('array Int[0..3] → 8 byte', () => {
    const { fields, size } = layoutIrFields([
      { name: 'a', type: { kind: 'array', elem: 'Int', lo: 0, hi: 3 } },
    ]);
    expect(fields[0]).toMatchObject({ name: 'a', byteOffset: 0, size: 8 });
    expect(size).toBe(8);
  });

  it('array Bool[0..9] → 2 byte (gói bit, làm tròn chẵn)', () => {
    const { fields, size } = layoutIrFields([
      { name: 'a', type: { kind: 'array', elem: 'Bool', lo: 0, hi: 9 } },
    ]);
    expect(fields[0]).toMatchObject({ name: 'a', byteOffset: 0, size: 2 });
    expect(size).toBe(2);
  });

  it('LReal 8 byte; init được giữ lại', () => {
    const { fields, size } = layoutIrFields([
      { name: 'v', type: 'LReal', init: 0 },
      { name: 'n', type: 'Int', init: 5 },
    ]);
    expect(fields[0]).toMatchObject({ name: 'v', byteOffset: 0, size: 8 });
    expect(fields[1]).toMatchObject({ name: 'n', byteOffset: 8, size: 2, init: 5 });
    expect(size).toBe(10);
  });

  it('struct rỗng → size 0; mảng lồng mảng → ném lỗi', () => {
    expect(layoutIrFields([])).toEqual({ fields: [], size: 0 });
    expect(() =>
      layoutIrFields([
        {
          name: 'a',
          type: { kind: 'array', elem: { kind: 'array', elem: 'Int', lo: 0, hi: 1 }, lo: 0, hi: 1 },
        },
      ]),
    ).toThrow();
  });
});

// ---------------------------------------------------------------- sclTypeToIrType

describe('sclTypeToIrType', () => {
  const elem = (name: string): SclType => ({ kind: 'elementary', name, loc: LOC });
  const vdecl = (name: string, type: SclType): VarDecl => ({ name, type, loc: LOC });

  it('elementary chuẩn hóa hoa/thường', () => {
    expect(sclTypeToIrType(elem('Int'))).toBe('Int');
    expect(sclTypeToIrType(elem('int'))).toBe('Int');
    expect(sclTypeToIrType(elem('BOOL'))).toBe('Bool');
    expect(sclTypeToIrType(elem('LReal'))).toBe('LReal');
    expect(sclTypeToIrType(elem('TIME'))).toBe('Time');
    expect(sclTypeToIrType(elem('DWord'))).toBe('DWord');
    expect(sclTypeToIrType(elem('SInt'))).toBe('SInt');
  });

  it('elementary lạ → undefined', () => {
    expect(sclTypeToIrType(elem('Foo'))).toBeUndefined();
    expect(sclTypeToIrType(elem('String'))).toBeUndefined();
  });

  it('array → IrType array', () => {
    expect(
      sclTypeToIrType({ kind: 'array', lo: 0, hi: 3, elem: elem('Int'), loc: LOC }),
    ).toEqual({ kind: 'array', elem: 'Int', lo: 0, hi: 3 });
    expect(
      sclTypeToIrType({ kind: 'array', lo: 1, hi: 2, elem: elem('Bool'), loc: LOC }),
    ).toEqual({ kind: 'array', elem: 'Bool', lo: 1, hi: 2 });
  });

  it('array của kiểu lạ → undefined', () => {
    expect(
      sclTypeToIrType({ kind: 'array', lo: 0, hi: 3, elem: elem('Foo'), loc: LOC }),
    ).toBeUndefined();
  });

  it('struct nội tuyến → struct có layout', () => {
    const t = sclTypeToIrType({
      kind: 'struct',
      fields: [vdecl('a', elem('Int')), vdecl('b', elem('Bool'))],
      loc: LOC,
    });
    expect(t).toEqual({
      kind: 'struct',
      fields: [
        { name: 'a', type: 'Int', byteOffset: 0, size: 2 },
        { name: 'b', type: 'Bool', byteOffset: 2, bitOffset: 0, size: 1 },
      ],
    });
  });

  it('struct chứa field kiểu lạ → undefined; named → undefined', () => {
    expect(
      sclTypeToIrType({
        kind: 'struct',
        fields: [vdecl('a', elem('Int')), vdecl('b', { kind: 'named', name: 'U', loc: LOC })],
        loc: LOC,
      }),
    ).toBeUndefined();
    expect(sclTypeToIrType({ kind: 'named', name: 'MyUdt', loc: LOC })).toBeUndefined();
    expect(sclTypeToIrType({ kind: 'named', name: 'FB_X', loc: LOC })).toBeUndefined();
  });
});

// ---------------------------------------------------------------- intrinsicArgTarget

describe('intrinsicArgTarget', () => {
  it('NORM_X/SCALE_X → Real ở arg 0..2', () => {
    for (const fn of ['NORM_X', 'SCALE_X', 'norm_x']) {
      expect(intrinsicArgTarget(fn, 0)).toBe('Real');
      expect(intrinsicArgTarget(fn, 1)).toBe('Real');
      expect(intrinsicArgTarget(fn, 2)).toBe('Real');
    }
  });

  it('NORM_X/SCALE_X arg ngoài 0..2 → undefined', () => {
    expect(intrinsicArgTarget('NORM_X', 3)).toBeUndefined();
    expect(intrinsicArgTarget('SCALE_X', -1)).toBeUndefined();
  });

  it('MIN/MAX/LIMIT/SQRT/ABS/convert/tên lạ → undefined', () => {
    for (const fn of ['MIN', 'MAX', 'LIMIT', 'SQRT', 'ABS', 'SHL', 'ROUND', 'REAL_TO_INT', 'FOO', '']) {
      expect(intrinsicArgTarget(fn, 0)).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------- interfaceFromSymbols

describe('interfaceFromSymbols', () => {
  it('input/output/inout/static/temp/const → interface (const bị loại)', () => {
    const syms = scopeWith([
      { name: 'a', section: 'input', type: 'Int' },
      { name: 'b', section: 'output', type: 'Bool' },
      { name: 'c', section: 'inout', type: 'Real' },
      { name: 'd', section: 'static', type: 'DInt', init: 3 },
      { name: 'e', section: 'temp', type: 'Int' },
      { name: 'f', section: 'const', type: 'Int', init: 7 },
    ]);
    expect(interfaceFromSymbols(syms)).toEqual({
      input: [{ name: 'a', type: 'Int' }],
      output: [{ name: 'b', type: 'Bool' }],
      inout: [{ name: 'c', type: 'Real' }],
      static: [{ name: 'd', type: 'DInt', init: 3 }],
      temp: [{ name: 'e', type: 'Int' }],
    });
  });

  it('symbols rỗng → interface rỗng', () => {
    expect(interfaceFromSymbols(emptyScope())).toEqual({
      input: [],
      output: [],
      inout: [],
      static: [],
      temp: [],
    });
  });
});

// ---------------------------------------------------------------- intrinsic qua typecheck

/** Gói temps + body thành OB "Main". */
function obWith(temps: string, body: string): string {
  return `ORGANIZATION_BLOCK "Main"\nVAR_TEMP\n${temps}\nEND_VAR\nBEGIN\n${body}\nEND_ORGANIZATION_BLOCK`;
}

/** Gói inputs + body thành FB "FB_T" (toán hạng VAR_INPUT, kết quả VAR_TEMP `res`). */
function fbWith(inputs: string, resType: string, body: string): string {
  return `FUNCTION_BLOCK "FB_T"\nVAR_INPUT\n${inputs}\nEND_VAR\nVAR_TEMP\n  res : ${resType};\nEND_VAR\nBEGIN\n${body}\nEND_FUNCTION_BLOCK`;
}

function checkSrc(
  src: string,
  ctx?: CrossFileTables,
): { ast: SclFile; result: TypecheckResult } {
  const parsed = parseScl(src, 'T.scl');
  expect(parsed.diagnostics, JSON.stringify(parsed.diagnostics)).toEqual([]);
  const result = typecheckFile(parsed.ast, 'T.scl', ctx ?? emptyCrossFileTables());
  return { ast: parsed.ast, result };
}

function firstDiag(result: TypecheckResult, code: string): Diagnostic | undefined {
  return result.diagnostics.find((d) => d.code === code);
}

/** Kiểu của giá trị gán ở statement đầu tiên của block đầu tiên. */
function typeOfFirstAssign(ast: SclFile, result: TypecheckResult): IrType | undefined {
  const block = ast.blocks[0] as { body: SclStmt[] };
  const stmt = block.body[0] as Extract<SclStmt, { kind: 'assign' }>;
  return result.types.get(stmt.value);
}

/** Gọi intrinsic trong FB, trả kiểu kết quả + diagnostics. */
function intrinsicResult(
  expr: string,
  inputs: string,
  resType: string,
): { type: IrType | undefined; result: TypecheckResult } {
  const { ast, result } = checkSrc(fbWith(inputs, resType, `  #res := ${expr};`));
  return { type: typeOfFirstAssign(ast, result), result };
}

describe('intrinsic qua typecheck — đường đúng', () => {
  it.each([
    // [tên, expr, inputs, resType, kiểu kết quả]
    ['ABS Int → Int', 'ABS(#i)', '  i : Int;', 'Int', 'Int'],
    ['ABS Real → Real', 'ABS(#r)', '  r : Real;', 'Real', 'Real'],
    ['ABS LReal → LReal', 'ABS(#r)', '  r : LReal;', 'LReal', 'LReal'],
    ['ABS DInt → DInt', 'ABS(#i)', '  i : DInt;', 'DInt', 'DInt'],
    ['SQRT Int → Real', 'SQRT(#i)', '  i : Int;', 'Real', 'Real'],
    ['SQRT LReal → LReal', 'SQRT(#r)', '  r : LReal;', 'LReal', 'LReal'],
    ['SQRT Real → Real', 'SQRT(#r)', '  r : Real;', 'Real', 'Real'],
    ['MIN Int → Int', 'MIN(#a, #b)', '  a : Int;\n  b : Int;', 'Int', 'Int'],
    ['MIN Int+DInt → DInt', 'MIN(#a, #b)', '  a : Int;\n  b : DInt;', 'DInt', 'DInt'],
    ['MIN 3 arg Real', 'MIN(#a, #b, #c)', '  a : Real;\n  b : Real;\n  c : Real;', 'Real', 'Real'],
    ['MAX Int+DInt → DInt', 'MAX(#a, #b)', '  a : Int;\n  b : DInt;', 'DInt', 'DInt'],
    ['MAX Real+LReal → LReal', 'MAX(#a, #b)', '  a : Real;\n  b : LReal;', 'LReal', 'LReal'],
    ['LIMIT Int → Int', 'LIMIT(#lo, #x, #hi)', '  lo : Int;\n  x : Int;\n  hi : Int;', 'Int', 'Int'],
    ['LIMIT Real → Real', 'LIMIT(#lo, #x, #hi)', '  lo : Real;\n  x : Real;\n  hi : Real;', 'Real', 'Real'],
    ['SHL Word → Word', 'SHL(#w, 1)', '  w : Word;', 'Word', 'Word'],
    ['SHL Int → Int', 'SHL(#i, #n)', '  i : Int;\n  n : Int;', 'Int', 'Int'],
    ['SHR Byte → Byte', 'SHR(#b, 2)', '  b : Byte;', 'Byte', 'Byte'],
    ['ROL DWord → DWord', 'ROL(#w, 1)', '  w : DWord;', 'DWord', 'DWord'],
    ['ROR DWord → DWord', 'ROR(#w, #n)', '  w : DWord;\n  n : Int;', 'DWord', 'DWord'],
    ['NORM_X Real → Real', 'NORM_X(#x, #lo, #hi)', '  x : Real;\n  lo : Real;\n  hi : Real;', 'Real', 'Real'],
    ['NORM_X có LReal → LReal', 'NORM_X(#x, #lo, #hi)', '  x : LReal;\n  lo : Real;\n  hi : Real;', 'LReal', 'LReal'],
    ['SCALE_X Real → Real', 'SCALE_X(#x, #lo, #hi)', '  x : Real;\n  lo : Real;\n  hi : Real;', 'Real', 'Real'],
    ['SCALE_X có LReal → LReal', 'SCALE_X(#x, #lo, #hi)', '  x : Real;\n  lo : LReal;\n  hi : Real;', 'LReal', 'LReal'],
    ['FLOOR Real → DInt', 'FLOOR(#r)', '  r : Real;', 'DInt', 'DInt'],
    ['FLOOR LReal → DInt', 'FLOOR(#r)', '  r : LReal;', 'DInt', 'DInt'],
    ['CEIL Real → DInt', 'CEIL(#r)', '  r : Real;', 'DInt', 'DInt'],
    ['ROUND Real → DInt', 'ROUND(#r)', '  r : Real;', 'DInt', 'DInt'],
    ['TRUNC LReal → DInt', 'TRUNC(#r)', '  r : LReal;', 'DInt', 'DInt'],
    ['REAL_TO_INT → Int', 'REAL_TO_INT(#r)', '  r : Real;', 'Int', 'Int'],
    ['LREAL_TO_DINT → DInt', 'LREAL_TO_DINT(#r)', '  r : LReal;', 'DInt', 'DInt'],
    ['INT_TO_REAL → Real', 'INT_TO_REAL(#i)', '  i : Int;', 'Real', 'Real'],
    ['INT_TO_DINT → DInt', 'INT_TO_DINT(#i)', '  i : Int;', 'DInt', 'DInt'],
    ['BOOL_TO_INT → Int', 'BOOL_TO_INT(#b)', '  b : Bool;', 'Int', 'Int'],
    ['BOOL_TO_DINT → DInt', 'BOOL_TO_DINT(#b)', '  b : Bool;', 'DInt', 'DInt'],
    ['BOOL_TO_BYTE → Byte', 'BOOL_TO_BYTE(#b)', '  b : Bool;', 'Byte', 'Byte'],
    ['BOOL_TO_WORD → Word', 'BOOL_TO_WORD(#b)', '  b : Bool;', 'Word', 'Word'],
    ['BOOL_TO_DWORD → DWord', 'BOOL_TO_DWORD(#b)', '  b : Bool;', 'DWord', 'DWord'],
    ['chữ thường real_to_int vẫn nhận', 'real_to_int(#r)', '  r : Real;', 'Int', 'Int'],
  ] as const)('%s', (_name, expr, inputs, resType, expected) => {
    const { type, result } = intrinsicResult(expr, inputs, resType);
    expect(result.diagnostics, JSON.stringify(result.diagnostics)).toEqual([]);
    expect(type).toBe(expected);
  });
});

describe('intrinsic qua typecheck — đường lỗi', () => {
  it.each([
    // [tên, expr, inputs, resType, mã]
    ['ABS() thiếu arg → T004', 'ABS()', '  i : Int;', 'Int', 'SCL-T004'],
    ['ABS 2 arg → T004', 'ABS(#i, #i)', '  i : Int;', 'Int', 'SCL-T004'],
    ['SQRT() thiếu arg → T004', 'SQRT()', '  i : Int;', 'Real', 'SCL-T004'],
    ['MIN 1 arg → T004', 'MIN(#i)', '  i : Int;', 'Int', 'SCL-T004'],
    ['LIMIT 2 arg → T004', 'LIMIT(#a, #b)', '  a : Int;\n  b : Int;', 'Int', 'SCL-T004'],
    ['LIMIT 4 arg → T004', 'LIMIT(#a, #b, #c, #d)', '  a : Int;\n  b : Int;\n  c : Int;\n  d : Int;', 'Int', 'SCL-T004'],
    ['SHL 1 arg → T004', 'SHL(#w)', '  w : Word;', 'Word', 'SCL-T004'],
    ['SHL 3 arg → T004', 'SHL(#w, 1, 2)', '  w : Word;', 'Word', 'SCL-T004'],
    ['NORM_X 2 arg → T004', 'NORM_X(#x, #lo)', '  x : Real;\n  lo : Real;', 'Real', 'SCL-T004'],
    ['SCALE_X 4 arg → T004', 'SCALE_X(#x, #lo, #hi, #e)', '  x : Real;\n  lo : Real;\n  hi : Real;\n  e : Real;', 'Real', 'SCL-T004'],
    ['ROUND 2 arg → T004', 'ROUND(#r, #r)', '  r : Real;', 'DInt', 'SCL-T004'],
    ['REAL_TO_INT 2 arg → T004', 'REAL_TO_INT(#r, #r)', '  r : Real;', 'Int', 'SCL-T004'],
    ['REAL_TO_INT() thiếu arg → T004', 'REAL_TO_INT()', '  r : Real;', 'Int', 'SCL-T004'],
    ['ABS named arg → T004', 'ABS(x := #i)', '  i : Int;', 'Int', 'SCL-T004'],
    ['MIN named arg → T004', 'MIN(x := #i, y := #i)', '  i : Int;', 'Int', 'SCL-T004'],
    ['REAL_TO_INT named arg → T004', 'REAL_TO_INT(x := #r)', '  r : Real;', 'Int', 'SCL-T004'],
    ['ROUND named arg → T004', 'ROUND(x := #r)', '  r : Real;', 'DInt', 'SCL-T004'],
    ['ABS Bool → T003', 'ABS(#b)', '  b : Bool;', 'Int', 'SCL-T003'],
    ['SQRT Bool → T003', 'SQRT(#b)', '  b : Bool;', 'Real', 'SCL-T003'],
    ['CEIL Int → T003', 'CEIL(#i)', '  i : Int;', 'DInt', 'SCL-T003'],
    ['FLOOR Int → T003', 'FLOOR(#i)', '  i : Int;', 'DInt', 'SCL-T003'],
    ['ROUND Int → T003', 'ROUND(#i)', '  i : Int;', 'DInt', 'SCL-T003'],
    ['TRUNC Bool → T003', 'TRUNC(#b)', '  b : Bool;', 'DInt', 'SCL-T003'],
    ['MIN có Bool → T003', 'MIN(#i, #b)', '  i : Int;\n  b : Bool;', 'Int', 'SCL-T003'],
    ['MAX có Bool → T003', 'MAX(#b, #b)', '  b : Bool;', 'Bool', 'SCL-T003'],
    ['LIMIT có Bool → T003', 'LIMIT(#a, #b, #c)', '  a : Int;\n  b : Bool;\n  c : Int;', 'Int', 'SCL-T003'],
    ['SHL Bool, Int → T003', 'SHL(#b, #n)', '  b : Bool;\n  n : Int;', 'Int', 'SCL-T003'],
    ['SHL Int, Bool → T003', 'SHL(#i, #b)', '  i : Int;\n  b : Bool;', 'Int', 'SCL-T003'],
    ['SHR Word, Real → T003', 'SHR(#w, #r)', '  w : Word;\n  r : Real;', 'Word', 'SCL-T003'],
    ['NORM_X có Bool → T003', 'NORM_X(#x, #lo, #hi)', '  x : Bool;\n  lo : Real;\n  hi : Real;', 'Real', 'SCL-T003'],
    ['SCALE_X có Word → T003', 'SCALE_X(#x, #lo, #hi)', '  x : Word;\n  lo : Real;\n  hi : Real;', 'Real', 'SCL-T003'],
    ['REAL_TO_INT nhận Int → T002', 'REAL_TO_INT(#i)', '  i : Int;', 'Int', 'SCL-T002'],
    ['INT_TO_REAL nhận Bool → T002', 'INT_TO_REAL(#b)', '  b : Bool;', 'Real', 'SCL-T002'],
    ['BOOL_TO_INT nhận Int → T002', 'BOOL_TO_INT(#i)', '  i : Int;', 'Int', 'SCL-T002'],
    ['MIN Int+UInt khác họ số → T002', 'MIN(#i, #u)', '  i : Int;\n  u : UInt;', 'Int', 'SCL-T002'],
    ['MAX Int+UInt khác họ số → T002', 'MAX(#i, #u)', '  i : Int;\n  u : UInt;', 'Int', 'SCL-T002'],
    ['LIMIT Int+UInt khác họ số → T002', 'LIMIT(#a, #b, #c)', '  a : Int;\n  b : UInt;\n  c : Int;', 'Int', 'SCL-T002'],
    ['MIN Int+Word → T003 (Word không phải số)', 'MIN(#i, #w)', '  i : Int;\n  w : Word;', 'Int', 'SCL-T003'],
    ['MAX Int+Word → T003 (Word không phải số)', 'MAX(#i, #w)', '  i : Int;\n  w : Word;', 'Int', 'SCL-T003'],
    ['LIMIT có Word → T003 (Word không phải số)', 'LIMIT(#a, #b, #c)', '  a : Int;\n  b : Word;\n  c : Int;', 'Int', 'SCL-T003'],
    ['BOOL_TO_REAL → T001 (không trong tập hẹp)', 'BOOL_TO_REAL(#b)', '  b : Bool;', 'Int', 'SCL-T001'],
    ['SINT_TO_INT → T001 (không trong tập)', 'SINT_TO_INT(#i)', '  i : SInt;', 'Int', 'SCL-T001'],
    ['FOO lạ → T001', 'FOO(#i)', '  i : Int;', 'Int', 'SCL-T001'],
  ] as const)('%s', (_name, expr, inputs, resType, code) => {
    const { result } = intrinsicResult(expr, inputs, resType);
    const d = firstDiag(result, code);
    expect(d, JSON.stringify(result.diagnostics)).toBeDefined();
  });

  it('SHL với count là literal ngoài khoảng Int vẫn là Int (không T002)', () => {
    // SHL(#w, 1): literal 1 → Int, strict integer → OK.
    const { result } = intrinsicResult('SHL(#w, 1)', '  w : Word;', 'Word');
    expect(result.diagnostics).toEqual([]);
  });

  it('intrinsic lồng nhau: ABS(MIN(#a, #b)) → Int', () => {
    const { type, result } = intrinsicResult(
      'ABS(MIN(#a, #b))',
      '  a : Int;\n  b : DInt;',
      'DInt',
    );
    expect(result.diagnostics, JSON.stringify(result.diagnostics)).toEqual([]);
    expect(type).toBe('DInt');
  });

  it('intrinsic trong OB (không chỉ FB)', () => {
    const { result } = checkSrc(
      obWith('  i : DInt;\n  r : Real;', '  #r := 2.5;\n  #i := ROUND(#r);'),
    );
    expect(result.diagnostics, JSON.stringify(result.diagnostics)).toEqual([]);
  });
});
