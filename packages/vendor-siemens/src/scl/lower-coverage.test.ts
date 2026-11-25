// Test phủ thêm cho lower P1.3 — các nhánh chưa phủ ở lower.test.ts:
// FC positional/ident, FB IN_OUT + DB instance, OB số, intrinsic convert,
// đọc DB field, câu lệnh rỗng, label CASE const-expr, FOR không BY,
// IF không ELSE, #FC_A local, lowerFile trực tiếp DB/UDT, throw nội bộ.
import { describe, expect, it } from 'vitest';
import type { IrBlock, IrProgram, IrStmt } from '@vcs/runtime-iec';
import { parseScl } from './parser.js';
import {
  emptyCrossFileTables,
  typecheckFile,
  type TypecheckResult,
} from './typecheck.js';
import { lowerFile } from './lower.js';
import type { ObBlock, SclFile } from './ast.js';

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

function firstBlock(program: IrProgram): IrBlock {
  const block = program.blocks[0];
  expect(block).toBeDefined();
  return block as IrBlock;
}

/** Block OB đầu tiên của file (dùng cho test crafted — `SclBlock` là union,
 * `body` chỉ có trên OB/FC/FB). */
function obBlock(ast: SclFile): ObBlock {
  const ob = ast.blocks.find((b): b is ObBlock => b.kind === 'OB');
  if (ob === undefined) throw new Error('fixture sai: không có OB');
  return ob;
}

function blockByName(program: IrProgram, name: string): IrBlock {
  const block = program.blocks.find((b) => b.name === name);
  expect(block, `không thấy block ${name}`).toBeDefined();
  return block as IrBlock;
}

function obWith(temps: string, body: string): string {
  return `ORGANIZATION_BLOCK "Main"\nVAR_TEMP\n${temps}\nEND_VAR\nBEGIN\n${body}\nEND_ORGANIZATION_BLOCK`;
}

const FB_X = `FUNCTION_BLOCK "FB_X"
VAR_INPUT
  IN : Bool;
END_VAR
VAR_OUTPUT
  Q : Bool;
END_VAR
VAR_IN_OUT
  IO : Int;
END_VAR
BEGIN
  #Q := #IN;
END_FUNCTION_BLOCK`;

const FC_A = `FUNCTION "FC_A" : Int
VAR_INPUT
  i : Int;
END_VAR
BEGIN
  "FC_A" := #i;
END_FUNCTION`;

describe('lowerCallStmt — FC positional + ident', () => {
  it('FC dạng ident không ngoặc, positional → callFc block + args theo thứ tự khai báo', () => {
    const src = `${FC_A}\n${obWith('  x : Int;\n  r : Int;', '  FC_A(#x, Q => #r);')}`;
    const { program } = lowerOk(src);
    const stmt = blockByName(program, 'Main').body[0] as Extract<IrStmt, { op: 'callFc' }>;
    expect(stmt.op).toBe('callFc');
    expect(stmt.block).toBe('FC_A');
    expect(stmt.args).toEqual([['i', { op: 'load', type: 'Int', ref: { k: 'local', name: 'x' } }]]);
    expect(stmt.ret).toEqual({ k: 'local', name: 'r' });
  });

  it('FC dạng biểu thức positional → callFcExpr args theo thứ tự khai báo', () => {
    const src = `${FC_A}\n${obWith('  x : Int;\n  r : Int;', '  #r := "FC_A"(#x);')}`;
    const { program } = lowerOk(src);
    const stmt = blockByName(program, 'Main').body[0] as Extract<IrStmt, { op: 'assign' }>;
    const call = stmt.value as Extract<typeof stmt.value, { op: 'callFcExpr' }>;
    expect(call.op).toBe('callFcExpr');
    expect(call.block).toBe('FC_A');
    expect(call.args).toEqual([['i', { op: 'load', type: 'Int', ref: { k: 'local', name: 'x' } }]]);
    expect(call.type).toBe('Int');
  });

  it('FC positional với widening → chèn convert', () => {
    const src = `FUNCTION "FC_R" : Real\nVAR_INPUT\n  v : Real;\nEND_VAR\nBEGIN\n  "FC_R" := #v;\nEND_FUNCTION\n${obWith('  x : Int;\n  r : Real;', '  #r := "FC_R"(#x);')}`;
    const { program } = lowerOk(src);
    const stmt = blockByName(program, 'Main').body[0] as Extract<IrStmt, { op: 'assign' }>;
    const call = stmt.value as Extract<typeof stmt.value, { op: 'callFcExpr' }>;
    expect(call.args[0]?.[0]).toBe('v');
    expect(call.args[0]?.[1]).toMatchObject({ op: 'convert', from: 'Int', to: 'Real' });
  });
});

describe('lowerCallStmt — FB IN_OUT + DB instance', () => {
  it('FB IN_OUT arg → inoutArgs (lvalue)', () => {
    const src = `${FB_X}\nFUNCTION_BLOCK "FB_C"\nVAR\n  fb : FB_X;\nEND_VAR\nVAR_TEMP\n  x : Bool;\n  n : Int;\nEND_VAR\nBEGIN\n  #fb(IN := #x, IO := #n);\nEND_FUNCTION_BLOCK`;
    const { program } = lowerOk(src);
    const stmt = blockByName(program, 'FB_C').body[0] as Extract<IrStmt, { op: 'callFb' }>;
    expect(stmt.op).toBe('callFb');
    expect(stmt.block).toBe('FB_X');
    expect(stmt.instance).toEqual({ k: 'local', name: 'fb' });
    expect(stmt.inArgs).toEqual([['IN', { op: 'load', type: 'Bool', ref: { k: 'local', name: 'x' } }]]);
    expect(stmt.inoutArgs).toEqual([['IO', { k: 'local', name: 'n' }]]);
    expect(stmt.outArgs).toEqual([]);
  });

  it('gọi FB qua instance DB → callFb instance dbField + block = tên FB', () => {
    const src = `${FB_X}\nDATA_BLOCK "DB_X" "FB_X"\nBEGIN\nEND_DATA_BLOCK\n${obWith('  x : Bool;\n  y : Bool;\n  n : Int;', '  "DB_X"(IN := #x, Q => #y, IO := #n);')}`;
    const { program } = lowerOk(src);
    const stmt = blockByName(program, 'Main').body[0] as Extract<IrStmt, { op: 'callFb' }>;
    expect(stmt.op).toBe('callFb');
    expect(stmt.instance).toEqual({ k: 'dbField', db: 'DB_X', path: [] });
    expect(stmt.block).toBe('FB_X');
    expect(stmt.outArgs).toEqual([['Q', { k: 'local', name: 'y' }]]);
    expect(stmt.inoutArgs).toEqual([['IO', { k: 'local', name: 'n' }]]);
  });

  it('gọi FB qua #fb có OUT + IN_OUT → đủ 3 danh sách arg', () => {
    const src = `${FB_X}\nFUNCTION_BLOCK "FB_C"\nVAR\n  fb : FB_X;\nEND_VAR\nVAR_TEMP\n  x : Bool;\n  y : Bool;\n  n : Int;\nEND_VAR\nBEGIN\n  #fb(IN := #x, Q => #y, IO := #n);\nEND_FUNCTION_BLOCK`;
    const { program } = lowerOk(src);
    const stmt = blockByName(program, 'FB_C').body[0] as Extract<IrStmt, { op: 'callFb' }>;
    expect(stmt.inArgs).toHaveLength(1);
    expect(stmt.outArgs).toEqual([['Q', { k: 'local', name: 'y' }]]);
    expect(stmt.inoutArgs).toEqual([['IO', { k: 'local', name: 'n' }]]);
  });
});

describe('lowerLValue — đọc DB field + #FC_A local', () => {
  it('đọc "DB_Motor".speed → dbField', () => {
    const src = `DATA_BLOCK "DB_Motor"\nSTRUCT\n  speed : Int;\n  run : Bool;\nEND_STRUCT;\nBEGIN\nEND_DATA_BLOCK\n${obWith('  r : Int;', '  #r := "DB_Motor".speed;')}`;
    const { program } = lowerOk(src);
    const stmt = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(stmt.value).toMatchObject({
      op: 'load',
      ref: { k: 'dbField', db: 'DB_Motor', path: ['speed'] },
    });
  });

  it('ghi "DB_Motor".speed → target dbField', () => {
    const src = `DATA_BLOCK "DB_Motor"\nSTRUCT\n  speed : Int;\n  run : Bool;\nEND_STRUCT;\nBEGIN\nEND_DATA_BLOCK\n${obWith('', '  "DB_Motor".speed := 100;')}`;
    const { program } = lowerOk(src);
    const stmt = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(stmt.target).toEqual({ k: 'dbField', db: 'DB_Motor', path: ['speed'] });
    expect(stmt.value).toMatchObject({ op: 'const', value: 100 });
  });

  it('đọc #FC_A trong FC → load local tổng hợp tên FC (OQ-112, dạng #)', () => {
    const src = `FUNCTION "FC_A" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nVAR_TEMP\n  t : Int;\nEND_VAR\nBEGIN\n  "FC_A" := #i;\n  #t := #FC_A;\nEND_FUNCTION`;
    const { program } = lowerOk(src);
    const block = blockByName(program, 'FC_A');
    const stmt = block.body[1] as Extract<IrStmt, { op: 'assign' }>;
    expect(stmt.value).toMatchObject({
      op: 'load',
      ref: { k: 'local', name: 'FC_A' },
    });
  });

  it('đọc "FC_A" (quoted) trong FC → load local tổng hợp (OQ-112, dạng ")', () => {
    const src = `FUNCTION "FC_A" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nVAR_TEMP\n  t : Int;\nEND_VAR\nBEGIN\n  "FC_A" := #i;\n  #t := "FC_A";\nEND_FUNCTION`;
    const { program } = lowerOk(src);
    const block = blockByName(program, 'FC_A');
    const stmt = block.body[1] as Extract<IrStmt, { op: 'assign' }>;
    expect(stmt.value).toMatchObject({
      op: 'load',
      ref: { k: 'local', name: 'FC_A' },
    });
  });
});

describe('lowerIntrinsicCall — convert arg về kiểu kết quả', () => {
  it('SQRT(#i) với i:Int → intrinsic SQRT, arg convert Int→Real', () => {
    const { program } = lowerOk(obWith('  i : Int;\n  r : Real;', '  #r := SQRT(#i);'));
    const stmt = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    expect(stmt.value).toMatchObject({ op: 'intrinsic', fn: 'SQRT', type: 'Real' });
    const intr = stmt.value as Extract<typeof stmt.value, { op: 'intrinsic' }>;
    expect(intr.args[0]).toMatchObject({ op: 'convert', from: 'Int', to: 'Real' });
  });

  it('MIN(#i, #d) Int+DInt → kiểu chung DInt, arg Int convert', () => {
    const { program } = lowerOk(
      obWith('  i : Int;\n  d : DInt;\n  r : DInt;', '  #r := MIN(#i, #d);'),
    );
    const stmt = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    const intr = stmt.value as Extract<typeof stmt.value, { op: 'intrinsic' }>;
    expect(intr.fn).toBe('MIN');
    expect(intr.type).toBe('DInt');
    expect(intr.args[0]).toMatchObject({ op: 'convert', from: 'Int', to: 'DInt' });
    expect(intr.args[1]).toMatchObject({ op: 'load', type: 'DInt' });
  });

  it('LIMIT(#lo, #x, #hi) Int → arg giữ nguyên (không convert)', () => {
    const { program } = lowerOk(
      obWith('  lo : Int;\n  x : Int;\n  hi : Int;\n  r : Int;', '  #r := LIMIT(#lo, #x, #hi);'),
    );
    const stmt = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    const intr = stmt.value as Extract<typeof stmt.value, { op: 'intrinsic' }>;
    expect(intr.fn).toBe('LIMIT');
    expect(intr.args).toHaveLength(3);
    for (const a of intr.args) expect(a.op).toBe('load');
  });

  it('NORM_X(#a, #b, #c) với arg Int → convert về Real', () => {
    const { program } = lowerOk(
      obWith('  a : Int;\n  b : Int;\n  c : Int;\n  r : Real;', '  #r := NORM_X(#a, #b, #c);'),
    );
    const stmt = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    const intr = stmt.value as Extract<typeof stmt.value, { op: 'intrinsic' }>;
    expect(intr.fn).toBe('NORM_X');
    expect(intr.type).toBe('Real');
    for (const a of intr.args) expect(a).toMatchObject({ op: 'convert', to: 'Real' });
  });

  it('SCALE_X với arg LReal → convert về LReal', () => {
    const { program } = lowerOk(
      obWith('  a : LReal;\n  b : Int;\n  c : Int;\n  r : LReal;', '  #r := SCALE_X(#a, #b, #c);'),
    );
    const stmt = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    const intr = stmt.value as Extract<typeof stmt.value, { op: 'intrinsic' }>;
    expect(intr.fn).toBe('SCALE_X');
    expect(intr.type).toBe('LReal');
    expect(intr.args[1]).toMatchObject({ op: 'convert', from: 'Int', to: 'LReal' });
  });

  it('MAX với arg LReal → không convert arg LReal, convert arg Int', () => {
    const { program } = lowerOk(
      obWith('  a : Int;\n  b : LReal;\n  r : LReal;', '  #r := MAX(#a, #b);'),
    );
    const stmt = firstBlock(program).body[0] as Extract<IrStmt, { op: 'assign' }>;
    const intr = stmt.value as Extract<typeof stmt.value, { op: 'intrinsic' }>;
    expect(intr.args[0]).toMatchObject({ op: 'convert', from: 'Int', to: 'LReal' });
    expect(intr.args[1]).toMatchObject({ op: 'load', type: 'LReal' });
  });
});

describe('lowerStmt — empty / IF không ELSE / FOR không BY / CASE const-expr', () => {
  it('câu lệnh rỗng `;` → không có node IR', () => {
    const { program } = lowerOk(obWith('  n : Int;', '  #n := 1;\n  ;\n  #n := 2;'));
    expect(firstBlock(program).body).toHaveLength(2);
  });

  it('IF không ELSE → else []', () => {
    const { program } = lowerOk(
      obWith('  b : Bool;\n  n : Int;', '  IF #b THEN\n    #n := 1;\n  END_IF;'),
    );
    const stmt = firstBlock(program).body[0] as Extract<IrStmt, { op: 'if' }>;
    expect(stmt.op).toBe('if');
    expect(stmt.elsif).toEqual([]);
    expect(stmt.else).toEqual([]);
  });

  it('FOR không BY → không có key by', () => {
    const { program } = lowerOk(
      obWith('  n : Int;', '  FOR #n := 1 TO 3 DO\n    #n := 1;\n  END_FOR;'),
    );
    const stmt = firstBlock(program).body[0] as Extract<IrStmt, { op: 'for' }>;
    expect(stmt.op).toBe('for');
    expect(stmt.var).toBe('n');
    expect('by' in stmt).toBe(false);
  });

  it('CASE label là const-expr 1+1 → 2; khoảng 3+1..4+2 → [4,6]', () => {
    const { program } = lowerOk(
      obWith('  n : Int;', '  CASE #n OF\n    1+1 : #n := 1;\n    3+1..4+2 : #n := 2;\n  END_CASE;'),
    );
    const stmt = firstBlock(program).body[0] as Extract<IrStmt, { op: 'case' }>;
    expect(stmt.arms[0]?.labels).toEqual([2]);
    expect(stmt.arms[1]?.labels).toEqual([[4, 6]]);
  });

  it('CASE không ELSE → else []', () => {
    const { program } = lowerOk(obWith('  n : Int;', '  CASE #n OF\n    1 : #n := 1;\n  END_CASE;'));
    const stmt = firstBlock(program).body[0] as Extract<IrStmt, { op: 'case' }>;
    expect(stmt.else).toEqual([]);
  });
});

describe('lowerFile — OB số + DB/UDT trực tiếp', () => {
  it('OB tên OB30 → number 30 + organization [{ob:30, block:"OB30"}]', () => {
    const src = `ORGANIZATION_BLOCK "OB30"\nVAR_TEMP\n  n : Int;\nEND_VAR\nBEGIN\n  #n := 1;\nEND_ORGANIZATION_BLOCK`;
    const { program } = lowerOk(src);
    const block = firstBlock(program);
    expect(block.kind).toBe('OB');
    expect(block.number).toBe(30);
    expect(program.organization).toEqual([{ ob: 30, block: 'OB30' }]);
  });

  it('OB tên khác (không Main, không OB<n>) → không có number/binding', () => {
    const src = `ORGANIZATION_BLOCK "Startup"\nVAR_TEMP\n  n : Int;\nEND_VAR\nBEGIN\n  #n := 1;\nEND_ORGANIZATION_BLOCK`;
    const { program } = lowerOk(src);
    const block = firstBlock(program);
    expect(block.number).toBeUndefined();
    expect(program.organization).toEqual([]);
  });

  it('lowerFile trực tiếp trên nguồn chỉ có DB/UDT → blocks [], dbs/udts đủ', () => {
    const src = `TYPE "UDT_Motor"\nSTRUCT\n  speed : Int;\n  run : Bool;\nEND_STRUCT;\nEND_TYPE\nDATA_BLOCK "DB_Motor"\nSTRUCT\n  speed : Int;\n  run : Bool;\nEND_STRUCT;\nBEGIN\n  "DB_Motor".speed := 1500;\nEND_DATA_BLOCK`;
    const { program } = lowerOk(src);
    expect(program.blocks).toEqual([]);
    expect(program.udts.map((u) => u.name)).toEqual(['UDT_Motor']);
    expect(program.dbs.map((d) => d.name)).toEqual(['DB_Motor']);
    expect(program.dbs[0]?.fields.find((f) => f.name === 'speed')?.init).toBe(1500);
  });

  it('DB dạng "fbname" qua lowerFile → IrDb có fbName + layout VAR(static)', () => {
    const src = `${FB_X}\nDATA_BLOCK "DB_X" "FB_X"\nBEGIN\nEND_DATA_BLOCK`;
    const { program } = lowerOk(src);
    expect(program.blocks.map((b) => b.name)).toEqual(['FB_X']);
    expect(program.dbs).toHaveLength(1);
    expect(program.dbs[0]?.fbName).toBe('FB_X');
  });
});

describe('lower — throw nội bộ khi TypecheckResult thiếu (crafted)', () => {
  it('types map rỗng → throw "thiếu kiểu cho node"', () => {
    const src = obWith('  x : Int;\n  y : Int;', '  #x := #y;');
    const parsed = parseScl(src, 'T.scl');
    const result = typecheckFile(parsed.ast, 'T.scl', emptyCrossFileTables());
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const crafted: TypecheckResult = { ...result, types: new Map() };
    expect(() => lowerFile(parsed.ast, crafted, 'T.scl')).toThrow('thiếu kiểu cho node');
  });

  it('blocks map rỗng → throw "thiếu symbols cho block"', () => {
    const src = obWith('  x : Int;', '  #x := 1;');
    const parsed = parseScl(src, 'T.scl');
    const result = typecheckFile(parsed.ast, 'T.scl', emptyCrossFileTables());
    const crafted: TypecheckResult = { ...result, blocks: new Map() };
    expect(() => lowerFile(parsed.ast, crafted, 'T.scl')).toThrow("thiếu symbols cho block 'Main'");
  });

  it('gán với kiểu crafted không widening được → throw "không convert được"', () => {
    // Gán Real cho Int bị typecheck chặn (T010) nên phải craft: typecheck
    // một chương trình hợp lệ rồi tráo kiểu của value expr.
    const okSrc = obWith('  x : Int;\n  y : Int;', '  #x := #y;');
    const parsed = parseScl(okSrc, 'T.scl');
    const result = typecheckFile(parsed.ast, 'T.scl', emptyCrossFileTables());
    const assign = obBlock(parsed.ast).body[0];
    expect(assign?.kind).toBe('assign');
    if (assign?.kind !== 'assign') throw new Error('fixture sai');
    const craftedTypes = new Map(result.types);
    craftedTypes.set(assign.value, 'Real');
    const crafted: TypecheckResult = { ...result, types: craftedTypes };
    expect(() => lowerFile(parsed.ast, crafted, 'T.scl')).toThrow('không convert được');
  });

  it('nhị phân với kiểu crafted không có kiểu chung → throw "không có kiểu chung"', () => {
    const okSrc = obWith('  x : Int;\n  y : Int;\n  r : Int;', '  #r := #x + #y;');
    const parsed = parseScl(okSrc, 'T.scl');
    const result = typecheckFile(parsed.ast, 'T.scl', emptyCrossFileTables());
    const assign = obBlock(parsed.ast).body[0];
    expect(assign?.kind).toBe('assign');
    if (assign?.kind !== 'assign') throw new Error('fixture sai');
    const value = assign.value;
    expect(value.kind).toBe('binary');
    if (value.kind !== 'binary') throw new Error('fixture sai');
    const craftedTypes = new Map(result.types);
    craftedTypes.set(value.left, 'Bool');
    const crafted: TypecheckResult = { ...result, types: craftedTypes };
    expect(() => lowerFile(parsed.ast, crafted, 'T.scl')).toThrow('không có kiểu chung');
  });
});
