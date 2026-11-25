import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { IrBlock, IrExpr, IrProgram, IrStmt } from '@vcs/runtime-iec';
import { parseScl } from './parser.js';
import {
  emptyCrossFileTables,
  typecheckFile,
  type TypecheckResult,
} from './typecheck.js';
import { lowerFile } from './lower.js';
import type { SclFile } from './ast.js';

const GOLDEN_DIR = fileURLToPath(new URL('./golden/', import.meta.url));

/** Parse + typecheck (không lỗi) + lower. Warning (W001) được phép — các
 * fixture đọc TEMP chưa gán sẽ tự ghi chú ở từng test. */
function lowerOk(src: string, fileName = 'T.scl'): {
  ast: SclFile;
  result: TypecheckResult;
  program: IrProgram;
} {
  const parsed = parseScl(src, fileName);
  expect(parsed.diagnostics, JSON.stringify(parsed.diagnostics)).toEqual([]);
  const result = typecheckFile(parsed.ast, fileName, emptyCrossFileTables());
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  expect(errors, JSON.stringify(result.diagnostics)).toEqual([]);
  return { ast: parsed.ast, result, program: lowerFile(parsed.ast, result, fileName) };
}

/** Bỏ mọi key `src` (đệ quy) để deep-equal phần IR còn lại với golden. */
function stripSrc(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSrc);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => k !== 'src')
        .map(([k, v]) => [k, stripSrc(v)]),
    );
  }
  return value;
}

function readGolden(name: string): unknown {
  return JSON.parse(readFileSync(`${GOLDEN_DIR}${name}`, 'utf-8')) as unknown;
}

function firstBlock(program: IrProgram): IrBlock {
  const block = program.blocks[0];
  expect(block).toBeDefined();
  return block as IrBlock;
}

/** Tìm block theo tên (lower sort blocks theo tên — không dựa vào index). */
function blockByName(program: IrProgram, name: string): IrBlock {
  const block = program.blocks.find((b) => b.name === name);
  expect(block, `không thấy block ${name}`).toBeDefined();
  return block as IrBlock;
}

/** Gói inputs + body thành FB "FB_T" (toán hạng VAR_INPUT, đích VAR_TEMP). */
function fbWith(inputs: string, temps: string, body: string): string {
  return `FUNCTION_BLOCK "FB_T"\nVAR_INPUT\n${inputs}\nEND_VAR\nVAR_TEMP\n${temps}\nEND_VAR\nBEGIN\n${body}\nEND_FUNCTION_BLOCK`;
}

describe('bảng B — golden FB_Motor (trừ src)', () => {
  const FB_MOTOR = `FUNCTION_BLOCK "FB_Motor"
VAR_INPUT
  iStart : Bool;
  iStop : Bool;
END_VAR
VAR_OUTPUT
  qRun : Bool;
END_VAR
VAR
  latched : Bool;
END_VAR
BEGIN
  IF #iStart THEN
    #latched := TRUE;
  END_IF;
  IF #iStop THEN
    #latched := FALSE;
  END_IF;
  #qRun := #latched;
END_FUNCTION_BLOCK`;

  it('deep-equal với fb-motor.json (trừ src)', () => {
    const { program } = lowerOk(FB_MOTOR, 'FB_Motor.scl');
    const golden = readGolden('fb-motor.json') as IrProgram;
    expect(stripSrc(program)).toEqual(stripSrc(golden));
  });

  it('src trên block/statement đúng bảng B (giá trị đã sửa theo parser)', () => {
    const { program } = lowerOk(FB_MOTOR, 'FB_Motor.scl');
    const block = firstBlock(program);
    // END_FUNCTION_BLOCK dài 18 ký tự → endCol 19, không phải 20 (bảng B cũ sai).
    expect(block.src).toEqual({
      file: 'FB_Motor.scl',
      line: 1,
      col: 1,
      endLine: 20,
      endCol: 19,
    });
    const [if1, if2, assign] = block.body;
    // IF: loc không gồm dấu ';' cuối → endCol ngay sau token có nghĩa cuối.
    expect(if1?.src).toEqual({ file: 'FB_Motor.scl', line: 13, col: 3, endLine: 15, endCol: 9 });
    expect(if2?.src).toEqual({ file: 'FB_Motor.scl', line: 16, col: 3, endLine: 18, endCol: 9 });
    // Assign: endCol ngay sau TRUE/FALSE/#latched, không gồm ';'.
    const then1 = (if1 as Extract<IrStmt, { op: 'if' }>).then[0];
    expect(then1?.src).toEqual({ file: 'FB_Motor.scl', line: 14, col: 5, endLine: 14, endCol: 21 });
    const then2 = (if2 as Extract<IrStmt, { op: 'if' }>).then[0];
    expect(then2?.src).toEqual({ file: 'FB_Motor.scl', line: 17, col: 5, endLine: 17, endCol: 22 });
    expect(assign?.src).toEqual({ file: 'FB_Motor.scl', line: 19, col: 3, endLine: 19, endCol: 20 });
  });
});

describe('bảng B — golden FC_Scale (convert ngoài mul)', () => {
  const FC_SCALE = `FUNCTION "FC_Scale"
VAR_INPUT
  raw : Int;
END_VAR
VAR_OUTPUT
  scaled : Real;
END_VAR
BEGIN
  #scaled := #raw * 2;
END_FUNCTION`;

  it('deep-equal với fc-scale.json (trừ src)', () => {
    const { program } = lowerOk(FC_SCALE, 'FC_Scale.scl');
    const golden = readGolden('fc-scale.json') as IrProgram;
    expect(stripSrc(program)).toEqual(stripSrc(golden));
  });

  it('convert Int→Real bọc NGOÀI phép mul (không phải trong)', () => {
    const { program } = lowerOk(FC_SCALE, 'FC_Scale.scl');
    const assign = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(assign.value).toEqual({
      op: 'convert',
      from: 'Int',
      to: 'Real',
      a: {
        op: 'binary',
        fn: 'mul',
        type: 'Int',
        a: { op: 'load', type: 'Int', ref: { k: 'local', name: 'raw' } },
        b: { op: 'const', type: 'Int', value: 2 },
      },
    });
    // src: block (1,1)→(10,13); assign L9 endCol 22 (không phải 23).
    expect(firstBlock(program).src?.endCol).toBe(13);
    expect(assign.src?.endCol).toBe(22);
  });
});

describe('call FB/FC', () => {
  const FB_X = `FUNCTION_BLOCK "FB_X"
VAR_INPUT
  IN : Bool;
END_VAR
VAR_OUTPUT
  Q : Bool;
END_VAR
BEGIN
  #Q := #IN;
END_FUNCTION_BLOCK`;

  it('call FB #fb(IN := #x, Q => #y) → callFb', () => {
    const src = `${FB_X}\nFUNCTION_BLOCK "FB_Caller"\nVAR\n  fb : FB_X;\nEND_VAR\nVAR_TEMP\n  x : Bool;\n  y : Bool;\nEND_VAR\nBEGIN\n  #fb(IN := #x, Q => #y);\nEND_FUNCTION_BLOCK`;
    const { program } = lowerOk(src);
    const caller = blockByName(program, 'FB_Caller');
    expect(caller.body).toHaveLength(1);
    const stmt = caller.body[0] as Extract<IrStmt, { op: 'callFb' }>;
    expect(stmt.src?.line).toBe(20);
    expect(stmt).toMatchObject({
      op: 'callFb',
      instance: { k: 'local', name: 'fb' },
      block: 'FB_X',
      inArgs: [['IN', { op: 'load', type: 'Bool', ref: { k: 'local', name: 'x' } }]],
      outArgs: [['Q', { k: 'local', name: 'y' }]],
      inoutArgs: [],
    });
  });

  it('call FC trong biểu thức → callFcExpr', () => {
    const src = `FUNCTION "FC_A" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\n  "FC_A" := #i;\nEND_FUNCTION\nORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  x : Int;\n  r : Int;\nEND_VAR\nBEGIN\n  #r := "FC_A"(i := #x);\nEND_ORGANIZATION_BLOCK`;
    const { program } = lowerOk(src);
    const ob = program.blocks[1] as IrBlock;
    const assign = ob.body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(assign.value).toEqual({
      op: 'callFcExpr',
      block: 'FC_A',
      args: [['i', { op: 'load', type: 'Int', ref: { k: 'local', name: 'x' } }]],
      type: 'Int',
    });
  });

  it('call FC dạng statement có Q => → callFc với ret', () => {
    const src = `FUNCTION "FC_A" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\n  "FC_A" := #i;\nEND_FUNCTION\nORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  x : Int;\n  r : Int;\nEND_VAR\nBEGIN\n  "FC_A"(i := #x, Q => #r);\nEND_ORGANIZATION_BLOCK`;
    const { program } = lowerOk(src);
    const ob = blockByName(program, 'Main');
    expect(ob.body).toHaveLength(1);
    const stmt = ob.body[0] as Extract<IrStmt, { op: 'callFc' }>;
    expect(stmt.src?.line).toBe(14);
    expect(stmt).toMatchObject({
      op: 'callFc',
      block: 'FC_A',
      args: [['i', { op: 'load', type: 'Int', ref: { k: 'local', name: 'x' } }]],
      ret: { k: 'local', name: 'r' },
    });
  });

  it('call FC dạng statement không có Q => → ret undefined (giá trị trả bị bỏ)', () => {
    const src = `FUNCTION "FC_A" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\n  "FC_A" := #i;\nEND_FUNCTION\nORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  x : Int;\nEND_VAR\nBEGIN\n  "FC_A"(i := #x);\nEND_ORGANIZATION_BLOCK`;
    const { program } = lowerOk(src);
    const ob = program.blocks[1] as IrBlock;
    const call = ob.body[0] as Extract<IrStmt, { op: 'callFc' }>;
    expect(call.op).toBe('callFc');
    expect(call.ret).toBeUndefined();
  });
});

describe('toán tử + intrinsic + convert', () => {
  it('** → intrinsic POWER (Real)', () => {
    const { program } = lowerOk(fbWith('  x : Int;', '  r : Real;', '  #r := #x ** 2;'));
    const assign = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(assign.value).toEqual({
      op: 'intrinsic',
      fn: 'POWER',
      type: 'Real',
      args: [
        { op: 'convert', from: 'Int', to: 'Real', a: { op: 'load', type: 'Int', ref: { k: 'local', name: 'x' } } },
        { op: 'convert', from: 'Int', to: 'Real', a: { op: 'const', type: 'Int', value: 2 } },
      ],
    });
  });

  it('REAL_TO_INT → convert mode round', () => {
    const { program } = lowerOk(fbWith('  r : Real;', '  i : Int;', '  #i := REAL_TO_INT(#r);'));
    const assign = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(assign.value).toEqual({
      op: 'convert',
      from: 'Real',
      to: 'Int',
      mode: 'round',
      a: { op: 'load', type: 'Real', ref: { k: 'local', name: 'r' } },
    });
  });

  it('TRUNC → convert mode trunc (Real→DInt)', () => {
    const { program } = lowerOk(fbWith('  r : Real;', '  d : DInt;', '  #d := TRUNC(#r);'));
    const assign = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(assign.value).toEqual({
      op: 'convert',
      from: 'Real',
      to: 'DInt',
      mode: 'trunc',
      a: { op: 'load', type: 'Real', ref: { k: 'local', name: 'r' } },
    });
  });

  it('INT_TO_REAL → convert không mode (widening tường minh)', () => {
    const { program } = lowerOk(fbWith('  i : Int;', '  r : Real;', '  #r := INT_TO_REAL(#i);'));
    const assign = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(assign.value).toEqual({
      op: 'convert',
      from: 'Int',
      to: 'Real',
      a: { op: 'load', type: 'Int', ref: { k: 'local', name: 'i' } },
    });
  });

  it('CEIL → intrinsic (DInt)', () => {
    const { program } = lowerOk(fbWith('  r : Real;', '  d : DInt;', '  #d := CEIL(#r);'));
    const assign = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(assign.value).toEqual({
      op: 'intrinsic',
      fn: 'CEIL',
      type: 'DInt',
      args: [{ op: 'load', type: 'Real', ref: { k: 'local', name: 'r' } }],
    });
  });

  it('gán DInt := Int → convert widening chèn quanh load', () => {
    const { program } = lowerOk(fbWith('  i : Int;', '  d : DInt;', '  #d := #i;'));
    const assign = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(assign.value).toEqual({
      op: 'convert',
      from: 'Int',
      to: 'DInt',
      a: { op: 'load', type: 'Int', ref: { k: 'local', name: 'i' } },
    });
  });

  it('VAR_CONSTANT ref được fold thành literal', () => {
    const src = `ORGANIZATION_BLOCK "Main"\nVAR_CONSTANT\n  c : Int := 5;\nEND_VAR\nVAR_TEMP\n  x : Int;\nEND_VAR\nBEGIN\n  #x := #c;\nEND_ORGANIZATION_BLOCK`;
    const { program } = lowerOk(src);
    const assign = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(assign.value).toEqual({ op: 'const', type: 'Int', value: 5 });
  });

  it('unary: NOT Bool → not, NOT Byte → bnot, -Int → neg', () => {
    const { program } = lowerOk(
      fbWith('  b : Bool;\n  w : Byte;\n  i : Int;', '  r1 : Bool;\n  r2 : Byte;\n  r3 : Int;', '  #r1 := NOT #b;\n  #r2 := NOT #w;\n  #r3 := -#i;'),
    );
    const body = firstBlock(program).body as Extract<IrStmt, { op: 'assign' }>[];
    const value = (index: number): IrExpr => (body[index] as Extract<IrStmt, { op: 'assign' }>).value;
    expect(value(0)).toEqual({
      op: 'unary',
      fn: 'not',
      type: 'Bool',
      a: { op: 'load', type: 'Bool', ref: { k: 'local', name: 'b' } },
    });
    expect(value(1)).toEqual({
      op: 'unary',
      fn: 'bnot',
      type: 'Byte',
      a: { op: 'load', type: 'Byte', ref: { k: 'local', name: 'w' } },
    });
    expect(value(2)).toEqual({
      op: 'unary',
      fn: 'neg',
      type: 'Int',
      a: { op: 'load', type: 'Int', ref: { k: 'local', name: 'i' } },
    });
  });
});

describe('FC return + cấu trúc điều khiển', () => {
  it('FC return → assign tới local tổng hợp + interface.temp có <tên FC>', () => {
    const src = `FUNCTION "FC_A" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\n  "FC_A" := #i + 1;\nEND_FUNCTION`;
    const { program } = lowerOk(src);
    const block = firstBlock(program);
    expect(block.interface.temp).toEqual([{ name: 'FC_A', type: 'Int' }]);
    const assign = block.body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(assign.target).toEqual({ k: 'local', name: 'FC_A' });
    expect(assign.value.op).toBe('binary');
  });

  it('IF/ELSIF/ELSE → elsif list + else', () => {
    const src = fbWith(
      '  n : Int;',
      '  r : Int;',
      '  IF #n = 1 THEN\n    #r := 1;\n  ELSIF #n = 2 THEN\n    #r := 2;\n  ELSE\n    #r := 0;\n  END_IF;',
    );
    const { program } = lowerOk(src);
    const stmt = firstBlock(program).body[0] as Extract<IrStmt, { op: 'if' }>;
    expect(stmt.op).toBe('if');
    expect(stmt.elsif).toHaveLength(1);
    expect(stmt.elsif[0]?.body).toHaveLength(1);
    expect(stmt.else).toHaveLength(1);
    expect(stmt.then).toHaveLength(1);
  });

  it('CASE label đơn + khoảng', () => {
    const src = fbWith(
      '  n : Int;',
      '  r : Int;',
      '  CASE #n OF\n    1 : #r := 1;\n    5..9 : #r := 2;\n  ELSE\n    #r := 0;\n  END_CASE;',
    );
    const { program } = lowerOk(src);
    const stmt = firstBlock(program).body[0] as Extract<IrStmt, { op: 'case' }>;
    expect(stmt.op).toBe('case');
    expect(stmt.arms[0]?.labels).toEqual([1]);
    expect(stmt.arms[1]?.labels).toEqual([[5, 9]]);
    expect(stmt.else).toHaveLength(1);
  });

  it('FOR/WHILE/REPEAT/EXIT/CONTINUE/RETURN đúng op', () => {
    const src = fbWith(
      '  i : Int;',
      '  n : Int;\n  r : Int;',
      '  #n := #i;\n  FOR #r := 1 TO 3 BY 1 DO\n    #n := #r;\n  END_FOR;\n  WHILE #n < 10 DO\n    #n := #n + 1;\n    IF #n = 5 THEN\n      CONTINUE;\n    END_IF;\n    IF #n = 8 THEN\n      EXIT;\n    END_IF;\n  END_WHILE;\n  REPEAT\n    #n := #n - 1;\n  UNTIL #n = 0 END_REPEAT;\n  RETURN;',
    );
    const { program } = lowerOk(src);
    const body = firstBlock(program).body;
    expect(body.map((s) => s.op)).toEqual(['assign', 'for', 'while', 'repeat', 'return']);
    const forStmt = body[1] as Extract<IrStmt, { op: 'for' }>;
    expect(forStmt.var).toBe('r');
    expect(forStmt.by).toBeDefined();
    const whileStmt = body[2] as Extract<IrStmt, { op: 'while' }>;
    const ifs = whileStmt.body.filter(
      (s): s is Extract<IrStmt, { op: 'if' }> => s.op === 'if',
    );
    expect(ifs[0]?.then[0]?.op).toBe('continue');
    expect(ifs[1]?.then[0]?.op).toBe('exit');
    const repeat = body[3] as Extract<IrStmt, { op: 'repeat' }>;
    expect(repeat.until.op).toBe('binary');
  });
});

describe('lvalue: abs / index / member', () => {
  it('%I0.0 → Bool, %MD0 → DInt, DB1.DBW4 → absDb Int', () => {
    const src = `ORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  b : Bool;\n  d : DInt;\n  i : Int;\nEND_VAR\nBEGIN\n  #b := %I0.0;\n  #d := %MD0;\n  #i := DB1.DBW4;\nEND_ORGANIZATION_BLOCK`;
    const { program } = lowerOk(src);
    const body = firstBlock(program).body as Extract<IrStmt, { op: 'assign' }>[];
    expect(body[0]?.value).toEqual({
      op: 'load',
      type: 'Bool',
      ref: { k: 'abs', area: 'I', byte: 0, bit: 0, width: 8, type: 'Bool' },
    });
    expect(body[1]?.value).toEqual({
      op: 'load',
      type: 'DInt',
      ref: { k: 'abs', area: 'M', byte: 0, width: 32, type: 'DInt' },
    });
    expect(body[2]?.value).toEqual({
      op: 'load',
      type: 'Int',
      ref: { k: 'absDb', db: 1, byte: 4, width: 16, type: 'Int' },
    });
  });

  it('index #a[#i] → index (base local, index load)', () => {
    const src = fbWith(
      '  i : Int;',
      '  a : Array[0..3] of Int;\n  r : Int;',
      '  #r := #a[#i];',
    );
    const { program } = lowerOk(src);
    const assign = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(assign.value).toEqual({
      op: 'load',
      type: 'Int',
      ref: {
        k: 'index',
        base: { k: 'local', name: 'a' },
        index: { op: 'load', type: 'Int', ref: { k: 'local', name: 'i' } },
      },
    });
  });

  it('#a[0].field → variant member (base index)', () => {
    const src = `TYPE "UDT_P"\nSTRUCT\n  v : Int;\nEND_STRUCT;\nEND_TYPE\nORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  a : Array[0..1] of UDT_P;\n  r : Int;\nEND_VAR\nBEGIN\n  #r := #a[0].v;\nEND_ORGANIZATION_BLOCK`;
    const { program } = lowerOk(src);
    const ob = firstBlock(program);
    const assign = ob.body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(assign.value).toEqual({
      op: 'load',
      type: 'Int',
      ref: {
        k: 'member',
        base: {
          k: 'index',
          base: { k: 'local', name: 'a' },
          index: { op: 'const', type: 'Int', value: 0 },
        },
        field: 'v',
      },
    });
  });

  it('#udt.field → static path [udt, field]', () => {
    const src = `TYPE "UDT_P"\nSTRUCT\n  v : Int;\nEND_STRUCT;\nEND_TYPE\nORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  u : UDT_P;\n  r : Int;\nEND_VAR\nBEGIN\n  #r := #u.v;\nEND_ORGANIZATION_BLOCK`;
    const { program } = lowerOk(src);
    const ob = firstBlock(program);
    const assign = ob.body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(assign.value).toEqual({
      op: 'load',
      type: 'Int',
      ref: { k: 'static', path: ['u', 'v'] },
    });
  });
});

describe('std blocks — lower callSys (P1.5, OQ-162)', () => {
  it('#tOn(IN := ..., PT := ..., Q => ...) → callSys local', () => {
    const src = `FUNCTION_BLOCK "FB_T"\nVAR\n  tOn : TON;\nEND_VAR\nVAR_TEMP\n  x : Bool;\n  y : Bool;\nEND_VAR\nBEGIN\n  #tOn(IN := #x, PT := T#1s, Q => #y);\nEND_FUNCTION_BLOCK`;
    const { program } = lowerOk(src);
    const fb = blockByName(program, 'FB_T');
    expect(fb.body).toHaveLength(1);
    const stmt = fb.body[0] as Extract<IrStmt, { op: 'callSys' }>;
    expect(stmt).toMatchObject({
      op: 'callSys',
      fn: 'TON',
      instance: { k: 'local', name: 'tOn' },
      inArgs: [
        ['IN', { op: 'load', type: 'Bool', ref: { k: 'local', name: 'x' } }],
        ['PT', { op: 'const', type: 'Time', value: 1000 }],
      ],
      outArgs: [['Q', { k: 'local', name: 'y' }]],
    });
  });

  it('"T1"(IN := ..., PT := ...) → callSys global + DB T1 size 18', () => {
    const src = `DATA_BLOCK "T1" "TON"\nBEGIN\nEND_DATA_BLOCK\nORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  x : Bool;\nEND_VAR\nBEGIN\n  "T1"(IN := #x, PT := T#1s);\nEND_ORGANIZATION_BLOCK`;
    const { program } = lowerOk(src);
    const ob = blockByName(program, 'Main');
    expect(ob.body).toHaveLength(1);
    const stmt = ob.body[0] as Extract<IrStmt, { op: 'callSys' }>;
    expect(stmt).toMatchObject({
      op: 'callSys',
      fn: 'TON',
      instance: { k: 'dbField', db: 'T1', path: [] },
      inArgs: [
        ['IN', { op: 'load', type: 'Bool', ref: { k: 'local', name: 'x' } }],
        ['PT', { op: 'const', type: 'Time', value: 1000 }],
      ],
      outArgs: [],
    });
    expect(program.dbs).toHaveLength(1);
    expect(program.dbs[0]?.name).toBe('T1');
    expect(program.dbs[0]?.fbName).toBe('TON');
    expect(program.dbs[0]?.size).toBe(18);
  });
});
