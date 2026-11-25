// Test typecheck SCL — M1 §4.4, plan P1.3 §18 (bảng A + C + D tính tay).
// Mỗi case là một file độc lập; vị trí lỗi lấy theo plan (bảng C) — wrapper
// OB/FC/FB được đếm dòng sao cho dòng gây lỗi đúng số dòng plan ghi.
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '@vcs/schemas';
import { parseScl } from './parser.js';
import { emptyCrossFileTables, evalConst, typecheckFile } from './typecheck.js';
import type { BlockSymbols, CrossFileTables, TypecheckResult } from './typecheck.js';
import type { IrType } from '@vcs/runtime-iec';
import type { ObBlock, SclFile, SclStmt } from './ast.js';

/** Gói temps + body thành OB "Main" (không VAR_CONSTANT — thêm ở từng case). */
function obWith(temps: string, body: string): string {
  return `ORGANIZATION_BLOCK "Main"\nVAR_TEMP\n${temps}\nEND_VAR\nBEGIN\n${body}\nEND_ORGANIZATION_BLOCK`;
}

/** Gói inputs + body thành FB "FB_T" (toán hạng là VAR_INPUT — đã khởi tạo
 * từ caller nên không dính W001; kết quả là VAR_TEMP `res`). */
function fbWith(inputs: string, resType: string, body: string): string {
  return `FUNCTION_BLOCK "FB_T"\nVAR_INPUT\n${inputs}\nEND_VAR\nVAR_TEMP\n  res : ${resType};\nEND_VAR\nBEGIN\n${body}\nEND_FUNCTION_BLOCK`;
}

/** Parse (assert sạch) + typecheck; trả AST + kết quả. */
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

/** Assert đúng 1 diagnostic mã `code` tại (line, col, endCol) + message chứa `msgPart`. */
function expectDiagAt(
  result: TypecheckResult,
  code: string,
  line: number,
  col: number,
  endCol: number,
  msgPart?: string,
): void {
  const d = firstDiag(result, code);
  expect(d, `không thấy ${code} trong ${JSON.stringify(result.diagnostics)}`).toBeDefined();
  expect(d?.line).toBe(line);
  expect(d?.col).toBe(col);
  expect(d?.endCol).toBe(endCol);
  if (msgPart !== undefined) expect(d?.message).toContain(msgPart);
}

/** Kiểu của giá trị gán ở statement đầu tiên của block đầu tiên (bảng A). */
function typeOfFirstAssign(ast: SclFile, result: TypecheckResult): IrType | undefined {
  const block = ast.blocks[0] as ObBlock | Extract<SclFile['blocks'][number], { kind: 'FB' }>;
  const stmt = block.body[0] as Extract<SclStmt, { kind: 'assign' }>;
  return result.types.get(stmt.value);
}

/** Giá trị const của biểu thức (dùng evalConst trực tiếp — bảng A13/D-b). */
function evalOf(src: string): { value: number | boolean } | { error: string } {
  const { ast } = checkSrc(obWith('  res : Int;', `  #res := ${src};`));
  const block = ast.blocks[0] as ObBlock;
  const stmt = block.body[0] as Extract<SclStmt, { kind: 'assign' }>;
  const empty: BlockSymbols = { blockId: 'Main', vars: new Map() };
  return evalConst(stmt.value, empty);
}

/** Bảng A — widening + kiểu kết quả (§4.4). Mỗi case: expr + kiểu kết quả. */
describe('bảng A — kiểu kết quả nhị phân + gán', () => {
  it.each([
    // [tên, expr, kiểu kết quả, kiểu biến đích, temps]
    ['A1', '#i + #d', 'DInt', 'DInt', '  i : Int;\n  d : DInt;'],
    ['A2', '#i + #rl', 'Real', 'Real', '  i : Int;\n  rl : Real;'],
    ['A3', '#rl + #lr', 'LReal', 'LReal', '  rl : Real;\n  lr : LReal;'],
    ['A4', '#si + #i', 'Int', 'Int', '  si : SInt;\n  i : Int;'],
    ['A5', '#si + #d', 'DInt', 'DInt', '  si : SInt;\n  d : DInt;'],
    ['A6', '#usi + #ui', 'UInt', 'UInt', '  usi : USInt;\n  ui : UInt;'],
    ['A7', '#b AND #w', 'Word', 'Word', '  b : Byte;\n  w : Word;'],
    ['A9', '#bo AND #bo', 'Bool', 'Bool', '  bo : Bool;'],
    ['A11', '#ti + #ti', 'Time', 'Time', '  ti : Time;'],
    ['A13', '#d / #i', 'DInt', 'DInt', '  d : DInt;\n  i : Int;'],
    ['A14', '#rl / #i', 'Real', 'Real', '  rl : Real;\n  i : Int;'],
    ['A15', '#i ** #i', 'Real', 'Real', '  i : Int;'],
    ['A16', '#lr ** #i', 'LReal', 'LReal', '  lr : LReal;\n  i : Int;'],
    ['A17', '#i = #d', 'Bool', 'Bool', '  i : Int;\n  d : DInt;'],
    ['A18', '#bo = #bo', 'Bool', 'Bool', '  bo : Bool;'],
    ['A20', '#w = #w', 'Bool', 'Bool', '  w : Word;'],
    ['A22', 'NOT #b', 'Byte', 'Byte', '  b : Byte;'],
    ['A24', '-#i', 'Int', 'Int', '  i : Int;'],
  ] as const)('%s: %s → %s', (_id, expr, expected, resType, temps) => {
    const src = fbWith(temps, resType, `  #res := ${expr};`);
    const { ast, result } = checkSrc(src);
    expect(result.diagnostics).toEqual([]);
    expect(typeOfFirstAssign(ast, result)).toBe(expected);
  });

  it('A13: 7 / 2 = 3, -7 / 2 = -3 (chia nguyên cắt về 0)', () => {
    expect(evalOf('7 / 2')).toEqual({ value: 3 });
    expect(evalOf('-7 / 2')).toEqual({ value: -3 });
    expect(evalOf('7 MOD 2')).toEqual({ value: 1 });
    expect(evalOf('-7 MOD 2')).toEqual({ value: -1 });
  });

  it('A26: gán DInt := Int OK (widening)', () => {
    const { result } = checkSrc(fbWith('  i : Int;', 'DInt', '  #res := #i;'));
    expect(result.diagnostics).toEqual([]);
  });

  it('A28: gán Real := Int OK (widening)', () => {
    const { result } = checkSrc(fbWith('  i : Int;', 'Real', '  #res := #i;'));
    expect(result.diagnostics).toEqual([]);
  });

  it.each([
    // [tên, expr, mã, message chứa, temps, kiểu biến đích]
    ['A8', '#i + #w', 'SCL-T002', 'không khớp', '  i : Int;\n  w : Word;', 'Int'],
    ['A10', '#bo + #bo', 'SCL-T003', 'không áp dụng', '  bo : Bool;', 'Bool'],
    ['A12', '#ti + #i', 'SCL-T003', 'không áp dụng', '  ti : Time;\n  i : Int;', 'Time'],
    ['A19', '#bo < #bo', 'SCL-T003', 'không áp dụng', '  bo : Bool;', 'Bool'],
    ['A21', '#w < #w', 'SCL-T003', 'không áp dụng', '  w : Word;', 'Bool'],
    ['A23', 'NOT #i', 'SCL-T003', 'không áp dụng', '  i : Int;', 'Int'],
    ['A25', '-#b', 'SCL-T003', 'không áp dụng', '  b : Byte;', 'Byte'],
    ['A27', '#i', 'SCL-T010', 'DINT_TO_INT', '  i : Int;\n  d : DInt;', 'Int'],
    ['A29', '#rl', 'SCL-T010', 'REAL_TO_INT', '  i : Int;\n  rl : Real;', 'Int'],
    ['A30', '#i', 'SCL-T010', 'INT_TO_WORD', '  i : Int;\n  w : Word;', 'Word'],
    ['A31', '#i', 'SCL-T002', 'không khớp', '  bo : Bool;\n  i : Int;', 'Bool'],
    ['A32', '#bo', 'SCL-T002', 'không khớp', '  bo : Bool;\n  i : Int;', 'Int'],
  ] as const)('%s: %s → %s', (_id, expr, code, msgPart, temps, resType) => {
    // A27/A29–A32 là lỗi GÁN: expr là giá trị gán vào #res (kiểu resType).
    // A27: #res(Int) := #d(DInt); A29: #res(Int) := #rl(Real);
    // A30: #res(Word) := #i(Int); A31: #res(Bool) := #i(Int);
    // A32: #res(Int) := #bo(Bool). A8/A10/... là lỗi trong expr nhị phân.
    const value =
      _id === 'A27'
        ? '#d'
        : _id === 'A29'
          ? '#rl'
          : _id === 'A30'
            ? '#i'
            : _id === 'A31'
              ? '#i'
              : _id === 'A32'
                ? '#bo'
                : expr;
    const src = fbWith(temps, resType, `  #res := ${value};`);
    const { result } = checkSrc(src);
    const d = firstDiag(result, code);
    expect(d, JSON.stringify(result.diagnostics)).toBeDefined();
    expect(d?.message).toContain(msgPart);
  });
});

/** Bảng C — lỗi typecheck + vị trí chính xác (tính tay, plan §18). */
describe('bảng C — lỗi kiểm tra', () => {
  it('C1: #y chưa khai báo → SCL-T001 tại ref', () => {
    const src = obWith('  x : Int;\n  t : Bool;', '  #x := #y;');
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-T001', 7, 9, 11, 'tên chưa khai báo: #y');
  });

  it('C2: #b + TRUE (Bool) → SCL-T003 tại toàn bộ expr', () => {
    const src = obWith('  a : Int;\n  b : Bool;', '  #a := 1;\n  #a := #b + TRUE;');
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-T003', 8, 9, 18, 'không áp dụng');
  });

  it('C3: #i := #r (Real→Int) → SCL-T010 tại giá trị', () => {
    const src = obWith('  i : Int;\n  r : Real;', '  #i := 1;\n  #i := #r;');
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-T010', 8, 9, 11, 'REAL_TO_INT');
  });

  it('C4: IF #n (Int) → SCL-T002 tại điều kiện', () => {
    const src = obWith('  n : Int;\n  t : Bool;', '  IF #n THEN\n    #t := TRUE;\n  END_IF;');
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-T002', 7, 6, 8, 'điều kiện IF phải là Bool');
  });

  it('C5: gán vào VAR_INPUT → SCL-T006 tại target', () => {
    const src = `FUNCTION_BLOCK "FB_X"\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\n  #i := TRUE;\nEND_FUNCTION_BLOCK`;
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-T006', 6, 3, 5, 'VAR_INPUT');
  });

  it('C6: gọi FB positional → SCL-T004 tại arg', () => {
    const src = `FUNCTION_BLOCK "FB_X"\nVAR_INPUT\n  i : Bool;\nEND_VAR\nBEGIN\nEND_FUNCTION_BLOCK\nORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  fb : FB_X;\n  t : Bool;\nEND_VAR\nBEGIN\n  #fb(TRUE);`;
    const { result } = checkSrc(`${src}\nEND_ORGANIZATION_BLOCK`);
    expectDiagAt(result, 'SCL-T004', 13, 7, 11, 'FB phải dùng tham số đặt tên');
  });

  it('C7: gọi FB bằng tên kiểu → SCL-T004 tại callee', () => {
    const src = `FUNCTION_BLOCK "FB_X"\nVAR_INPUT\n  i : Bool;\nEND_VAR\nBEGIN\nEND_FUNCTION_BLOCK\nORGANIZATION_BLOCK "Main"\nBEGIN\n  "FB_X"(i := TRUE);\nEND_ORGANIZATION_BLOCK`;
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-T004', 9, 3, 9, 'gọi FB cần instance');
  });

  it('C8: label CASE #m (biến) → SCL-T008 tại label', () => {
    const src = obWith(
      '  n : Int;\n  m : Int;',
      '  CASE #n OF\n    1 : #n := 1;\n    #m : #n := 1;\n  END_CASE;',
    );
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-T008', 9, 5, 7, 'không hằng');
  });

  it('C9: EXIT ngoài vòng lặp → SCL-T007', () => {
    const src = `ORGANIZATION_BLOCK "Main"\nBEGIN\n  EXIT;\nEND_ORGANIZATION_BLOCK`;
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-T007', 3, 3, 7, 'EXIT chỉ dùng trong vòng lặp');
  });

  it('C10: #n.field (Int) → SCL-T005 tại member', () => {
    const src = obWith('  n : Int;\n  t : Bool;', '  #n.field := 1;');
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-T005', 7, 6, 11, "không có field 'field'");
  });

  it('C11: #a[5] ngoài [0..3] → SCL-T005 tại index', () => {
    const src = obWith('  a : Array[0..3] of Int;\n  t : Bool;', '  #a[5] := 1;');
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-T005', 7, 6, 7, 'chỉ số 5 ngoài [0..3]');
  });

  it('C12: khai báo trùng x → SCL-T009 tại tên thứ hai', () => {
    const src = `ORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  x : Int;\n  x : Bool;\nEND_VAR\nBEGIN\nEND_ORGANIZATION_BLOCK`;
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-T009', 4, 3, 4, 'tên đã khai báo: x');
  });

  it('C13: FC_A gọi chính nó → SCL-S020 tại callee', () => {
    const src = `FUNCTION "FC_A" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\n  "FC_A" := "FC_A"(i := #i);\nEND_FUNCTION`;
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-S020', 6, 13, 19, 'đệ quy: FC_A gọi chính nó');
  });

  it('C14: đọc TEMP trước khi ghi → SCL-W001 (warning), compile vẫn thành công', () => {
    const src = obWith('  x : Int;\n  t : Int;', '  #x := 1;\n  #x := #t;');
    const { result } = checkSrc(src);
    const d = firstDiag(result, 'SCL-W001');
    expect(d).toBeDefined();
    expect(d?.line).toBe(8);
    expect(d?.col).toBe(9);
    expect(d?.endCol).toBe(11);
    expect(d?.severity).toBe('warning');
    expect(d?.message).toContain('đọc TEMP');
    // Warning không phải error: không chặn compile.
    expect(result.diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('C15: kiểu chưa biết Udt_NoSuch → SCL-T001 tại tên kiểu', () => {
    const src = `ORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  u : Udt_NoSuch;\nEND_VAR\nBEGIN\nEND_ORGANIZATION_BLOCK`;
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-T001', 3, 7, 17, 'kiểu chưa biết: Udt_NoSuch');
  });

  it('C16: FC_B không trả giá trị → SCL-T004 tại callee', () => {
    const src = `FUNCTION "FC_B"\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\nEND_FUNCTION\nORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  x : Int;\n  t : Bool;\nEND_VAR\nBEGIN\n  #x := "FC_B"(i := 1);\nEND_ORGANIZATION_BLOCK`;
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-T004', 13, 9, 15, 'không trả giá trị');
  });
});

/** Bảng D — const eval + CASE + FOR + TEMP (tính tay, plan §18). */
describe('bảng D — const + CASE + FOR + TEMP', () => {
  it('D-a: VAR_CONSTANT 2 + 3 = 5 (evalConst tính phép tính trên hằng)', () => {
    const src = `ORGANIZATION_BLOCK "Main"\nVAR_CONSTANT\n  c : Int := 2 + 3;\nEND_VAR\nVAR_TEMP\n  x : Int;\nEND_VAR\nBEGIN\n  #x := #c;\nEND_ORGANIZATION_BLOCK`;
    const { result } = checkSrc(src);
    expect(result.diagnostics).toEqual([]);
    const syms = result.blocks.get('main');
    expect(syms?.vars.get('c')?.init).toBe(5);
  });

  it('D-b: label trùng trong khoảng → SCL-T005', () => {
    const src = obWith(
      '  n : Int;',
      '  CASE #n OF\n    1..3, 5 : #n := 1;\n    2 : #n := 2;\n  END_CASE;',
    );
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-T005', 8, 5, 6, 'label CASE trùng: 2');
  });

  it('D-b: label 1 + 1 hợp lệ (= 2, const expr)', () => {
    const src = obWith(
      '  n : Int;',
      '  CASE #n OF\n    1 + 1 : #n := 1;\n  END_CASE;',
    );
    const { result } = checkSrc(src);
    // Selector #n là TEMP chưa gán → W001 hợp lệ; quan trọng là không có
    // lỗi nào (label 1+1 được chấp nhận, không T008/T005).
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('FOR: biến vòng lặp không phải integer → SCL-T003', () => {
    const src = obWith(
      '  i : Real;\n  n : Int;',
      '  FOR #i := 1 TO 10 DO\n    #n := 1;\n  END_FOR;',
    );
    const { result } = checkSrc(src);
    expectDiagAt(result, 'SCL-T003', 7, 7, 9, 'biến vòng lặp FOR phải là số nguyên');
  });

  it('FOR: by âm hợp lệ', () => {
    const src = obWith(
      '  i : Int;\n  n : Int;',
      '  FOR #i := 10 TO 1 BY -1 DO\n    #n := 1;\n  END_FOR;',
    );
    const { result } = checkSrc(src);
    expect(result.diagnostics).toEqual([]);
  });

  it('FOR: from widening về kiểu biến vòng lặp (SInt := Int → lỗi T010)', () => {
    const src = obWith(
      '  i : SInt;\n  n : Int;',
      '  FOR #i := #n TO 10 DO\n    #n := 1;\n  END_FOR;',
    );
    const { result } = checkSrc(src);
    // from (#n : Int) gán vào biến vòng lặp SInt = thu hẹp → T010.
    expect(firstDiag(result, 'SCL-T010')).toBeDefined();
  });

  it('TEMP: đọc sau gán thì hết warning', () => {
    const src = obWith('  x : Int;\n  t : Int;', '  #t := 1;\n  #x := #t;');
    const { result } = checkSrc(src);
    expect(result.diagnostics).toEqual([]);
  });

  it('TEMP: đọc trong IF chỉ gán một nhánh vẫn warning', () => {
    const src = obWith(
      '  x : Int;\n  t : Int;\n  c : Bool;',
      '  IF #c THEN\n    #t := 1;\n  END_IF;\n  #x := #t;',
    );
    const { result } = checkSrc(src);
    expect(firstDiag(result, 'SCL-W001')).toBeDefined();
  });
});

/** Đệ quy gián tiếp + system FB (plan §18 — test typecheck). */
describe('đệ quy gián tiếp + system FB', () => {
  it('đệ quy gián tiếp A→B→A → SCL-S020', () => {
    const src = `FUNCTION "FC_A" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\n  "FC_A" := "FC_B"(i := #i);\nEND_FUNCTION\nFUNCTION "FC_B" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\n  "FC_B" := "FC_A"(i := #i);\nEND_FUNCTION`;
    const { result } = checkSrc(src);
    const d = firstDiag(result, 'SCL-S020');
    expect(d, JSON.stringify(result.diagnostics)).toBeDefined();
    expect(d?.message).toContain('FC_A');
    expect(d?.message).toContain('FC_B');
  });

  it('kiểu TON trong VAR → SCL-U001', () => {
    const src = obWith('  sT : TON;', '  #sT := #sT;');
    const { result } = checkSrc(src);
    expect(firstDiag(result, 'SCL-U001')).toBeDefined();
  });

  it('gọi #sT(IN := ...) khi sT : TON → SCL-U001', () => {
    const src = `FUNCTION_BLOCK "FB_X"\nVAR\n  sT : TON;\nEND_VAR\nBEGIN\n  #sT(IN := TRUE);\nEND_FUNCTION_BLOCK`;
    const { result } = checkSrc(src);
    expect(firstDiag(result, 'SCL-U001')).toBeDefined();
  });

  it('OQ-127: tham số OUT của FC (không phải Q) → SCL-T004', () => {
    const src = `FUNCTION "FC_X" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nVAR_OUTPUT\n  out1 : Int;\nEND_VAR\nBEGIN\n  "FC_X" := #i;\nEND_FUNCTION\nORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  x : Int;\n  y : Int;\nEND_VAR\nBEGIN\n  "FC_X"(i := #x, out1 => #y);\nEND_ORGANIZATION_BLOCK`;
    const { result } = checkSrc(src);
    expect(firstDiag(result, 'SCL-T004')).toBeDefined();
  });

  it('OQ-128: tham số IN_OUT của FC → SCL-T004 (IR chưa có slot inout)', () => {
    const src = `FUNCTION "FC_X" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nVAR_IN_OUT\n  io : Int;\nEND_VAR\nBEGIN\n  "FC_X" := #i;\nEND_FUNCTION\nORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  x : Int;\n  y : Int;\nEND_VAR\nBEGIN\n  "FC_X"(i := #x, io := #y);\nEND_ORGANIZATION_BLOCK`;
    const { result } = checkSrc(src);
    const d = firstDiag(result, 'SCL-T004');
    expect(d, JSON.stringify(result.diagnostics)).toBeDefined();
    expect(d?.message).toContain('IN_OUT');
  });

  it('DB init: speed := 40000 vượt khoảng Int → SCL-T002', () => {
    const src = `DATA_BLOCK "DB_Motor"\nSTRUCT\n  speed : Int;\n  run : Bool;\nEND_STRUCT;\nBEGIN\n  "DB_Motor".speed := 40000;\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expect(firstDiag(result, 'SCL-T002')).toBeDefined();
  });

  it('DB init: field không tồn tại → SCL-T005; init trùng field → SCL-T009', () => {
    const badField = `DATA_BLOCK "DB_Motor"\nSTRUCT\n  speed : Int;\nEND_STRUCT;\nBEGIN\n  "DB_Motor".nope := 1;\nEND_DATA_BLOCK`;
    expect(firstDiag(checkSrc(badField).result, 'SCL-T005')).toBeDefined();
    const dupField = `DATA_BLOCK "DB_Motor"\nSTRUCT\n  speed : Int;\nEND_STRUCT;\nBEGIN\n  "DB_Motor".speed := 1;\n  "DB_Motor".speed := 2;\nEND_DATA_BLOCK`;
    expect(firstDiag(checkSrc(dupField).result, 'SCL-T009')).toBeDefined();
  });
});
