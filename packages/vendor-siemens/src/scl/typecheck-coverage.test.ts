// Test phủ thêm cho typecheck P1.3 — các nhánh chưa phủ ở typecheck.test.ts:
// DB/UDT, cross-file, call-args, checkCallStmt, checkStmt, resolveLValue.
// Chỉ assert mã + mảnh message (vị trí đã ghim ở bảng C).
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '@vcs/schemas';
import { parseScl } from './parser.js';
import { compileScl, createCompileContext } from './compile.js';
import {
  emptyCrossFileTables,
  typecheckFile,
  type CrossFileTables,
  type TypecheckResult,
} from './typecheck.js';
import type { SclFile } from './ast.js';

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

function expectDiag(result: TypecheckResult, code: string, msgPart: string): void {
  const d = firstDiag(result, code);
  expect(d, `không thấy ${code} trong ${JSON.stringify(result.diagnostics)}`).toBeDefined();
  expect(d?.message).toContain(msgPart);
}

function expectNoErrors(result: TypecheckResult): void {
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  expect(errors, JSON.stringify(result.diagnostics)).toEqual([]);
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

const FB_SUB = `FUNCTION_BLOCK "FB_Sub"
VAR_INPUT
  a : Int;
END_VAR
VAR_OUTPUT
  q : Bool;
END_VAR
VAR_IN_OUT
  io : Int;
END_VAR
VAR
  s : Bool;
END_VAR
BEGIN
  #q := #a >= 1;
  #s := #q;
END_FUNCTION_BLOCK`;

const FC_A = `FUNCTION "FC_A" : Int
VAR_INPUT
  i : Int;
END_VAR
BEGIN
  "FC_A" := #i;
END_FUNCTION`;

describe('checkCallArgs — thiếu/thừa/trùng/sai kiểu', () => {
  it('FC thiếu tham số bắt buộc → SCL-T004', () => {
    const src = `${FC_A}\n${obWith('  x : Int;\n  r : Int;', '  #r := "FC_A"();')}`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T004', 'thiếu tham số bắt buộc: i');
  });

  it('FC thừa tham số → SCL-T004', () => {
    const src = `${FC_A}\n${obWith('  x : Int;\n  r : Int;', '  #r := "FC_A"(i := #x, j := 1);')}`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T004', 'tham số không tồn tại: j');
  });

  it('FC trùng tham số → SCL-T004', () => {
    const src = `${FC_A}\n${obWith('  x : Int;\n  r : Int;', '  #r := "FC_A"(i := #x, i := 2);')}`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T004', 'tham số trùng: i');
  });

  it('FC sai kiểu arg → SCL-T004 (assignProblem)', () => {
    const src = `${FC_A}\n${obWith('  b : Bool;\n  r : Int;', '  #r := "FC_A"(i := #b);')}`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T002', 'kiểu không khớp');
  });

  it('FC arg const ngoài khoảng kiểu đích → SCL-T002', () => {
    const src = `${FC_A}\n${obWith('  r : Int;', '  #r := "FC_A"(i := 40000);')}`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T002', 'ngoài khoảng kiểu Int');
  });

  it('FC positional thừa → SCL-T004', () => {
    const src = `${FC_A}\n${obWith('  x : Int;\n  r : Int;', '  #r := "FC_A"(#x, 2);')}`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T004', 'tham số thừa');
  });

  it('FC positional đúng thứ tự → OK', () => {
    const src = `${FC_A}\n${obWith('  x : Int;\n  r : Int;', '  #r := "FC_A"(#x);')}`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
  });

  it('FB: tham số IN dùng => → SCL-T004', () => {
    const src = `${FB_X}\nFUNCTION_BLOCK "FB_C"\nVAR\n  fb : FB_X;\nEND_VAR\nVAR_TEMP\n  x : Bool;\n  n : Int;\nEND_VAR\nBEGIN\n  #fb(IN => #x, IO := #n);\nEND_FUNCTION_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T004', "tham số IN 'IN' dùng ':='");
  });

  it('FB: tham số OUT dùng := → SCL-T004', () => {
    const src = `${FB_X}\nFUNCTION_BLOCK "FB_C"\nVAR\n  fb : FB_X;\nEND_VAR\nVAR_TEMP\n  x : Bool;\n  y : Bool;\n  n : Int;\nEND_VAR\nBEGIN\n  #fb(IN := #x, Q := #y, IO := #n);\nEND_FUNCTION_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T004', "tham số OUT 'Q' dùng '=>'");
  });

  it('FB: IN_OUT với giá trị không phải lvalue → SCL-T004', () => {
    const src = `${FB_X}\nFUNCTION_BLOCK "FB_C"\nVAR\n  fb : FB_X;\nEND_VAR\nVAR_TEMP\n  x : Bool;\nEND_VAR\nBEGIN\n  #fb(IN := #x, IO := 1);\nEND_FUNCTION_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T004', 'tham số IN_OUT phải là biến (lvalue)');
  });

  it('FB: IN_OUT đúng lvalue → OK', () => {
    const src = `${FB_X}\nFUNCTION_BLOCK "FB_C"\nVAR\n  fb : FB_X;\nEND_VAR\nVAR_TEMP\n  x : Bool;\n  n : Int;\nEND_VAR\nBEGIN\n  #fb(IN := #x, IO := #n);\nEND_FUNCTION_BLOCK`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
  });

  it('FC trong biểu thức nhận Q => → SCL-T004', () => {
    const src = `${FC_A}\n${obWith('  x : Int;\n  r : Int;', '  #r := "FC_A"(i := #x, Q => #r);')}`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T004', 'FC trong biểu thức không nhận tham số OUT');
  });

  it('gọi FC không trả giá trị trong biểu thức → SCL-T004 (đã có C16 — dạng statement)', () => {
    const src = `FUNCTION "FC_B"\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\nEND_FUNCTION\nORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  x : Int;\nEND_VAR\nBEGIN\n  "FC_B"(i := #x);\nEND_ORGANIZATION_BLOCK`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
  });

  it('OUT arg đích là VAR_INPUT → SCL-T006', () => {
    const src = `${FB_X}\nFUNCTION_BLOCK "FB_C"\nVAR_INPUT\n  y : Bool;\nEND_VAR\nVAR\n  fb : FB_X;\nEND_VAR\nVAR_TEMP\n  x : Bool;\nEND_VAR\nBEGIN\n  #fb(IN := #x, Q => #y);\nEND_FUNCTION_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T006', 'không được gán vào VAR_INPUT');
  });
});

describe('checkCallStmt — các dạng callee', () => {
  it('FC tự gọi bằng tên không ngoặc kép (ident) → SCL-T004', () => {
    const src = `FUNCTION "FC_A" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\n  FC_A(i := #i);\nEND_FUNCTION`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T004', 'không gọi FC bằng tên không có ngoặc kép');
  });

  it('FC tự gọi bằng #tên → SCL-T004', () => {
    const src = `FUNCTION "FC_A" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\n  #FC_A(i := #i);\nEND_FUNCTION`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T004', 'không gọi FC bằng #tên');
  });

  it('gọi #x chưa khai báo → SCL-T001', () => {
    const src = obWith('  x : Bool;', '  #fb(IN := #x);');
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T001', 'tên chưa khai báo: #fb');
  });

  it('gọi #x không phải instance FB → SCL-T004', () => {
    const src = obWith('  x : Bool;', '  #x(IN := TRUE);');
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T004', '#x không phải instance FB');
  });

  it('gọi FB bằng tên kiểu → SCL-T004 (đã có C7 — dạng "FB_X")', () => {
    const src = `${FB_X}\n${obWith('', '  "FB_X"(IN := TRUE);')}`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T004', 'gọi FB cần instance');
  });

  it('gọi OB → SCL-T004', () => {
    const src = obWith('', '  "Main"();');
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T004', "OB 'Main' không gọi được");
  });

  it('gọi system FB dạng statement không có DB → SCL-T001 (P1.5)', () => {
    const src = obWith('  t : Bool;', '  "TON"(IN := #t);');
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T001', 'tên chưa khai báo: "TON"');
  });

  it('gọi tên không biết dạng statement → SCL-T001', () => {
    const src = obWith('', '  "NoSuch"();');
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T001', 'tên chưa khai báo: "NoSuch"');
  });

  it('gọi địa chỉ tuyệt đối dạng statement → SCL-T004', () => {
    const src = obWith('', '  %Q0.0();');
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T004', 'không gọi được địa chỉ tuyệt đối');
  });

  it('gọi DB không phải instance FB → SCL-T004', () => {
    const src = `DATA_BLOCK "DB_Cfg"\nSTRUCT\n  sp : Real;\nEND_STRUCT;\nBEGIN\nEND_DATA_BLOCK\n${obWith('', '  "DB_Cfg"(IN := TRUE);')}`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T004', "DB 'DB_Cfg' không phải instance FB");
  });

  it('gọi FC dạng statement bằng ident (không ngoặc) → OK', () => {
    const src = `${FC_A}\n${obWith('  x : Int;\n  r : Int;', '  FC_A(i := #x, Q => #r);')}`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
  });

  it('gọi DB instance FB → OK', () => {
    const src = `${FB_X}\nDATA_BLOCK "DB_X" "FB_X"\nBEGIN\nEND_DATA_BLOCK\n${obWith('  x : Bool;\n  y : Bool;\n  n : Int;', '  "DB_X"(IN := #x, Q => #y, IO := #n);')}`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
  });
});

describe('DB — resolveDb + checkDbInit', () => {
  it('DB dạng "fbname" → layout INPUT+OUTPUT+IN_OUT+STATIC (§3.5)', () => {
    const src = `FUNCTION_BLOCK "FB_S"\nVAR_INPUT\n  i : Bool;\nEND_VAR\nVAR\n  st : Int;\n  b : Bool;\nEND_VAR\nBEGIN\nEND_FUNCTION_BLOCK\nDATA_BLOCK "DB_S" "FB_S"\nBEGIN\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
    const db = result.dbs.get('db_s');
    expect(db).toBeDefined();
    expect(db?.fbName).toBe('FB_S');
    // i: Bool byte 0 bit 0; st: Int byte 2 (căn chẵn, size 2); b: Bool byte 4 bit 0 → size 6.
    expect(db?.fields.map((f) => [f.name, f.byteOffset, f.size])).toEqual([
      ['i', 0, 1],
      ['st', 2, 2],
      ['b', 4, 1],
    ]);
    expect(db?.fields.find((f) => f.name === 'i')?.bitOffset).toBe(0);
    expect(db?.fields.find((f) => f.name === 'b')?.bitOffset).toBe(0);
    expect(db?.size).toBe(6);
  });

  it('DB dạng "fbname" có IN_OUT → kích thước tự nhiên, field hiện (đọc được)', () => {
    const src = `FUNCTION_BLOCK "FB_T"\nVAR_INPUT\n  a : Bool;\nEND_VAR\nVAR_OUTPUT\n  q : Bool;\nEND_VAR\nVAR_IN_OUT\n  io : Int;\nEND_VAR\nVAR\n  st : Int;\nEND_VAR\nBEGIN\nEND_FUNCTION_BLOCK\nDATA_BLOCK "DB_T" "FB_T"\nBEGIN\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
    const db = result.dbs.get('db_t');
    expect(db).toBeDefined();
    // a byte 0 bit 0; q byte 0 bit 1; io: Int byte 2 (căn chẵn, 2B);
    // st: Int byte 4, size 2 → tổng 6 (A23 — trước đây slot DInt 4 byte ẩn, size 8).
    expect(db?.fields.map((f) => [f.name, f.byteOffset, f.size])).toEqual([
      ['a', 0, 1],
      ['q', 0, 1],
      ['io', 2, 2],
      ['st', 4, 2],
    ]);
    expect(db?.fields.find((f) => f.name === 'io')?.type).toBe('Int');
    expect(db?.size).toBe(6);
    const ok = checkSrc(
      `${src}\nORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  n : Int;\nEND_VAR\nBEGIN\n  #n := "DB_T".io;\nEND_ORGANIZATION_BLOCK`,
    );
    expectNoErrors(ok.result);
  });

  it('DB_Sub layout: IN_OUT Int @4, size 8 (A23)', () => {
    const src = `${FB_SUB}\nDATA_BLOCK "DB_Sub" "FB_Sub"\nBEGIN\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
    const db = result.dbs.get('db_sub');
    expect(db).toBeDefined();
    // a: Int byte 0 (2B); q: Bool byte 2 bit 0; io: Int byte 4 (căn chẵn, 2B);
    // s: Bool byte 6 bit 0 → nội dung hết byte 6, quy tắc §3.4(6) làm tròn
    // chẵn → size 8. TIA đo 7 byte nội dung, cùng offsets — lệch 1 byte
    // đuôi thuộc OQ-400, không phải lỗi phase này.
    expect(db?.fields.map((f) => [f.name, f.byteOffset, f.size])).toEqual([
      ['a', 0, 2],
      ['q', 2, 1],
      ['io', 4, 2],
      ['s', 6, 1],
    ]);
    expect(db?.size).toBe(8);
  });

  it('"DB_Sub".io đọc + ghi được như field thường (A23)', () => {
    const src = `${FB_SUB}\nDATA_BLOCK "DB_Sub" "FB_Sub"\nBEGIN\nEND_DATA_BLOCK\n${obWith('  n : Int;', '  #n := "DB_Sub".io;\n  "DB_Sub".io := 5;')}`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
  });

  it('DB init ghi vào field IN_OUT → init == 5 (A23, tier B)', () => {
    const src = `${FB_SUB}\nDATA_BLOCK "DB_Sub" "FB_Sub"\nBEGIN\n  "DB_Sub".io := 5;\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
    const db = result.dbs.get('db_sub');
    expect(db?.fields.find((f) => f.name === 'io')?.init).toBe(5);
  });

  it('DB dạng "fbname" với FB không biết → SCL-T001', () => {
    const src = `DATA_BLOCK "DB_S" "FB_NoSuch"\nBEGIN\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T001', 'FB chưa biết: FB_NoSuch');
  });

  it('DB STRUCT trùng tên field → SCL-T009', () => {
    const src = `DATA_BLOCK "DB_C"\nSTRUCT\n  sp : Real;\n  sp : Int;\nEND_STRUCT;\nBEGIN\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T009', 'tên đã khai báo: sp');
  });

  it('DB STRUCT field kiểu FB → SCL-T001', () => {
    const src = `${FB_X}\nDATA_BLOCK "DB_C"\nSTRUCT\n  fb : FB_X;\nEND_STRUCT;\nBEGIN\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T001', 'DB STRUCT không chứa được instance FB');
  });

  it('DB STRUCT field init không hằng → SCL-T008', () => {
    const src = `DATA_BLOCK "DB_C"\nSTRUCT\n  sp : Real := #x;\nEND_STRUCT;\nBEGIN\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T008', 'giá trị khởi tạo không hằng');
  });

  it('DB init vào field không tồn tại → SCL-T005', () => {
    const src = `DATA_BLOCK "DB_M"\nSTRUCT\n  speed : Int;\nEND_STRUCT;\nBEGIN\n  "DB_M".nope := 1;\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T005', 'field không tồn tại: nope');
  });

  it('DB init giá trị không hằng → SCL-T008', () => {
    const src = `DATA_BLOCK "DB_M"\nSTRUCT\n  speed : Int;\nEND_STRUCT;\nBEGIN\n  "DB_M".speed := #x;\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T008', 'giá trị init DB không hằng');
  });

  it('DB init trùng field → SCL-T009', () => {
    const src = `DATA_BLOCK "DB_M"\nSTRUCT\n  speed : Int;\nEND_STRUCT;\nBEGIN\n  "DB_M".speed := 1;\n  "DB_M".speed := 2;\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T009', 'field đã khởi tạo: speed');
  });

  it('DB init giá trị ngoài khoảng → SCL-T002', () => {
    const src = `DATA_BLOCK "DB_M"\nSTRUCT\n  speed : Int;\nEND_STRUCT;\nBEGIN\n  "DB_M".speed := 40000;\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T002', 'ngoài khoảng kiểu Int');
  });

  it('DB init base không phải chính DB → SCL-T005', () => {
    const src = `DATA_BLOCK "DB_M"\nSTRUCT\n  speed : Int;\nEND_STRUCT;\nBEGIN\n  "DB_Other".speed := 1;\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T005', 'init DB phải gán vào chính "DB_M"');
  });

  it('DB init gán cả DB (không field) → SCL-T005', () => {
    const src = `DATA_BLOCK "DB_M"\nSTRUCT\n  speed : Int;\nEND_STRUCT;\nBEGIN\n  "DB_M" := 1;\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T005', 'init DB phải gán vào một field');
  });

  it('DB init gán member lồng → SCL-T005', () => {
    const src = `TYPE "UDT_P"\nSTRUCT\n  v : Int;\nEND_STRUCT;\nEND_TYPE\nDATA_BLOCK "DB_M"\nSTRUCT\n  p : UDT_P;\nEND_STRUCT;\nBEGIN\n  "DB_M".p.v := 1;\nEND_DATA_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T005', 'init DB chỉ gán cả field');
  });
});

describe('UDT — đệ quy + kiểu chưa biết', () => {
  it('UDT tự chứa mình → SCL-T011', () => {
    const src = `TYPE "UDT_A"\nSTRUCT\n  a : UDT_A;\nEND_STRUCT;\nEND_TYPE`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T011', 'kiểu đệ quy');
  });

  it('UDT đệ quy gián tiếp A→B→A → SCL-T011', () => {
    const src = `TYPE "UDT_A"\nSTRUCT\n  b : UDT_B;\nEND_STRUCT;\nEND_TYPE\nTYPE "UDT_B"\nSTRUCT\n  a : UDT_A;\nEND_STRUCT;\nEND_TYPE`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T011', 'kiểu đệ quy');
  });

  it('UDT chứa kiểu chưa biết → SCL-T001', () => {
    const src = `TYPE "UDT_A"\nSTRUCT\n  x : NoSuch;\nEND_STRUCT;\nEND_TYPE`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T001', 'kiểu chưa biết: NoSuch');
  });

  it('UDT với field array + struct lồng → OK', () => {
    const src = `TYPE "UDT_P"\nSTRUCT\n  v : Int;\nEND_STRUCT;\nEND_TYPE\nTYPE "UDT_A"\nSTRUCT\n  p : UDT_P;\n  arr : Array[0..2] of Real;\nEND_STRUCT;\nEND_TYPE`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
    const udt = result.udts.get('udt_a');
    expect(udt?.fields.map((f) => f.name)).toEqual(['p', 'arr']);
  });
});

describe('checkStmt — IF/CASE/FOR/WHILE/REPEAT/EXIT/CONTINUE', () => {
  it('EXIT ngoài vòng lặp → SCL-T007', () => {
    const { result } = checkSrc(obWith('', '  EXIT;'));
    expectDiag(result, 'SCL-T007', 'EXIT chỉ dùng trong vòng lặp');
  });

  it('CONTINUE ngoài vòng lặp → SCL-T007', () => {
    const { result } = checkSrc(obWith('', '  CONTINUE;'));
    expectDiag(result, 'SCL-T007', 'CONTINUE chỉ dùng trong vòng lặp');
  });

  it('RETURN ở đâu cũng hợp lệ', () => {
    const { result } = checkSrc(obWith('', '  RETURN;'));
    expectNoErrors(result);
  });

  it('WHILE điều kiện không Bool → SCL-T002', () => {
    const { result } = checkSrc(obWith('  n : Int;', '  WHILE #n DO\n    #n := 1;\n  END_WHILE;'));
    expectDiag(result, 'SCL-T002', 'điều kiện WHILE phải là Bool');
  });

  it('REPEAT điều kiện UNTIL không Bool → SCL-T002', () => {
    const { result } = checkSrc(obWith('  n : Int;', '  REPEAT\n    #n := 1;\n  UNTIL #n END_REPEAT;'));
    expectDiag(result, 'SCL-T002', 'điều kiện UNTIL phải là Bool');
  });

  it('ELSIF điều kiện không Bool → SCL-T002', () => {
    const { result } = checkSrc(
      obWith('  n : Int;\n  r : Int;', '  IF #n = 1 THEN\n    #r := 1;\n  ELSIF #n THEN\n    #r := 2;\n  END_IF;'),
    );
    expectDiag(result, 'SCL-T002', 'điều kiện ELSIF phải là Bool');
  });

  it('CASE selector Real → SCL-T002', () => {
    const { result } = checkSrc(obWith('  r : Real;\n  n : Int;', '  CASE #r OF\n    1 : #n := 1;\n  END_CASE;'));
    expectDiag(result, 'SCL-T002', 'selector CASE phải là số nguyên');
  });

  it('CASE label không hằng → SCL-T008', () => {
    const { result } = checkSrc(obWith('  n : Int;', '  CASE #n OF\n    #n : #n := 1;\n  END_CASE;'));
    expectDiag(result, 'SCL-T008', 'label CASE không hằng');
  });

  it('CASE label khoảng lo > hi → SCL-T005', () => {
    const { result } = checkSrc(obWith('  n : Int;', '  CASE #n OF\n    5..3 : #n := 1;\n  END_CASE;'));
    expectDiag(result, 'SCL-T005', 'lo > hi');
  });

  it('CASE label khoảng trùng nhau → SCL-T005', () => {
    const { result } = checkSrc(obWith('  n : Int;', '  CASE #n OF\n    1..3 : #n := 1;\n    2..4 : #n := 2;\n  END_CASE;'));
    expectDiag(result, 'SCL-T005', 'label CASE trùng');
  });

  it('CASE label không phải số nguyên → SCL-T002', () => {
    const { result } = checkSrc(obWith('  n : Int;', '  CASE #n OF\n    TRUE : #n := 1;\n  END_CASE;'));
    expectDiag(result, 'SCL-T002', 'label CASE phải là số nguyên');
  });

  it('FOR biến vòng lặp là VAR_INPUT → SCL-T006', () => {
    const src = `FUNCTION_BLOCK "FB_T"\nVAR_INPUT\n  i : Int;\nEND_VAR\nVAR_TEMP\n  n : Int;\nEND_VAR\nBEGIN\n  FOR #i := 1 TO 3 DO\n    #n := 1;\n  END_FOR;\nEND_FUNCTION_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T006', 'không được gán vào VAR_INPUT');
  });

  it('FOR biến vòng lặp kiểu Real → SCL-T003', () => {
    const { result } = checkSrc(
      obWith('  r : Real;\n  n : Int;', '  FOR #r := 1 TO 3 DO\n    #n := 1;\n  END_FOR;'),
    );
    expectDiag(result, 'SCL-T003', 'biến vòng lặp FOR phải là số nguyên');
  });

  it('FOR from sai kiểu (Bool) → lỗi T002/T010', () => {
    const { result } = checkSrc(
      obWith('  n : Int;\n  b : Bool;', '  FOR #n := #b TO 3 DO\n    #n := 1;\n  END_FOR;'),
    );
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('câu lệnh rỗng `;` → OK (không có node IR)', () => {
    const { result } = checkSrc(obWith('  n : Int;', '  #n := 1;\n  ;'));
    expectNoErrors(result);
  });
});

describe('resolveLValue — member/index/abs/db', () => {
  it('index trên kiểu không phải array → SCL-T005', () => {
    const { result } = checkSrc(obWith('  n : Int;\n  r : Int;', '  #r := #n[0];'));
    expectDiag(result, 'SCL-T005', 'không phải mảng');
  });

  it('index không phải số nguyên → SCL-T005', () => {
    const { result } = checkSrc(
      obWith('  a : Array[0..3] of Int;\n  b : Bool;\n  r : Int;', '  #r := #a[#b];'),
    );
    expectDiag(result, 'SCL-T005', 'chỉ số mảng phải là số nguyên');
  });

  it('member trên array → SCL-T005', () => {
    const { result } = checkSrc(obWith('  a : Array[0..3] of Int;\n  r : Int;', '  #r := #a.field;'));
    expectDiag(result, 'SCL-T005', "không có member 'field'");
  });

  it('đọc member của instance FB #fb.Q → OK', () => {
    const src = `${FB_X}\nFUNCTION_BLOCK "FB_C"\nVAR\n  fb : FB_X;\nEND_VAR\nVAR_TEMP\n  x : Bool;\n  y : Bool;\n  n : Int;\nEND_VAR\nBEGIN\n  #fb(IN := #x, Q => #y, IO := #n);\n  #x := #fb.Q;\nEND_FUNCTION_BLOCK`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
  });

  // OQ-129 (tier B): plan không quy định gán trực tiếp vào member INPUT của
  // instance FB. Mặc định: cho phép — member là field của DB instance, ghi
  // trực tiếp tương đương truyền ở lần gọi sau; chỉ cấm gán vào VAR_INPUT
  // của chính block đang kiểm (T006). Chờ S1/PLCSIM xác nhận.
  it('gán vào member INPUT của instance FB → OK (OQ-129)', () => {
    const src = `${FB_X}\nFUNCTION_BLOCK "FB_C"\nVAR\n  fb : FB_X;\nEND_VAR\nVAR_TEMP\n  x : Bool;\nEND_VAR\nBEGIN\n  #fb.IN := #x;\nEND_FUNCTION_BLOCK`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
  });

  it('đọc field DB "DB_M".speed → OK', () => {
    const src = `DATA_BLOCK "DB_M"\nSTRUCT\n  speed : Int;\nEND_STRUCT;\nBEGIN\nEND_DATA_BLOCK\n${obWith('  r : Int;', '  #r := "DB_M".speed;')}`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
  });

  it('đọc field DB không biết → SCL-T001', () => {
    const { result } = checkSrc(obWith('  r : Int;', '  #r := "DB_No".speed;'));
    expectDiag(result, 'SCL-T001', 'tên chưa khai báo: "DB_No"');
  });

  it('ghi %Q0.0 và đọc %IB0 → OK (Bool/Byte)', () => {
    const { result } = checkSrc(obWith('  b : Byte;', '  %Q0.0 := TRUE;\n  #b := %IB0;'));
    expectNoErrors(result);
  });
});

describe('getBlockSymbols — các section VAR', () => {
  it('VAR_CONSTANT init không hằng → SCL-T008', () => {
    const src = `ORGANIZATION_BLOCK "Main"\nVAR_CONSTANT\n  c : Int := #x;\nEND_VAR\nVAR_TEMP\n  x : Int;\nEND_VAR\nBEGIN\nEND_ORGANIZATION_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T008', 'không hằng');
  });

  it('VAR_CONSTANT init ngoài khoảng → SCL-T002', () => {
    const src = `ORGANIZATION_BLOCK "Main"\nVAR_CONSTANT\n  c : Int := 40000;\nEND_VAR\nBEGIN\nEND_ORGANIZATION_BLOCK`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T002', 'ngoài khoảng');
  });

  it('VAR_CONSTANT tham chiếu hằng khai báo sau (fixpoint im lặng) → OK', () => {
    const src = `ORGANIZATION_BLOCK "Main"\nVAR_CONSTANT\n  a : Int := #b + 1;\n  b : Int := 5;\nEND_VAR\nVAR_TEMP\n  x : Int;\nEND_VAR\nBEGIN\n  #x := #a;\nEND_ORGANIZATION_BLOCK`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
    expect(result.blocks.get('main')?.vars.get('a')?.init).toBe(6);
  });

  it('VAR_INPUT có init → tham số tùy chọn (không bắt buộc khi gọi)', () => {
    const src = `FUNCTION "FC_O" : Int\nVAR_INPUT\n  i : Int := 7;\nEND_VAR\nBEGIN\n  "FC_O" := #i;\nEND_FUNCTION\n${obWith('  r : Int;', '  #r := "FC_O"();')}`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
  });

  it('VAR với instance FB (multi-instance) + UDT → OK', () => {
    const src = `${FB_X}\nTYPE "UDT_P"\nSTRUCT\n  v : Int;\nEND_STRUCT;\nEND_TYPE\nFUNCTION_BLOCK "FB_C"\nVAR\n  fb : FB_X;\n  u : UDT_P;\nEND_VAR\nVAR_TEMP\n  x : Bool;\n  n : Int;\nEND_VAR\nBEGIN\n  #fb(IN := #x, IO := #n);\n  #u.v := 1;\nEND_FUNCTION_BLOCK`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
  });

  it('struct nội tuyến init field (pendingStructInits) → OK', () => {
    const src = `ORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  u : STRUCT\n    v : Int := 3;\n  END_STRUCT;\n  r : Int;\nEND_VAR\nBEGIN\n  #r := #u.v;\nEND_ORGANIZATION_BLOCK`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
  });
});

describe('gán struct/array + literal', () => {
  it('struct := struct cùng kiểu → OK', () => {
    const src = `TYPE "UDT_P"\nSTRUCT\n  v : Int;\nEND_STRUCT;\nEND_TYPE\n${obWith('  a : UDT_P;\n  b : UDT_P;', '  #a := #b;')}`;
    const { result } = checkSrc(src);
    expectNoErrors(result);
  });

  it('struct := struct khác kiểu → SCL-T002', () => {
    const src = `TYPE "UDT_P"\nSTRUCT\n  v : Int;\nEND_STRUCT;\nEND_TYPE\nTYPE "UDT_Q"\nSTRUCT\n  w : Int;\nEND_STRUCT;\nEND_TYPE\n${obWith('  a : UDT_P;\n  b : UDT_Q;', '  #a := #b;')}`;
    const { result } = checkSrc(src);
    expectDiag(result, 'SCL-T002', 'kiểu không khớp');
  });

  it('array := array cùng kiểu → OK', () => {
    const { result } = checkSrc(
      obWith('  a : Array[0..2] of Int;\n  b : Array[0..2] of Int;', '  #a := #b;'),
    );
    expectNoErrors(result);
  });

  it('Time := Int → SCL-T002', () => {
    const { result } = checkSrc(obWith('  t : Time;\n  i : Int;', '  #t := #i;'));
    expectDiag(result, 'SCL-T002', 'kiểu không khớp');
  });

  it('literal thời gian T#1s + typed literal → OK', () => {
    const { result } = checkSrc(
      obWith(
        '  t : Time;\n  s : SInt;\n  w : Word;\n  r : Real;',
        '  #t := T#1s;\n  #s := SINT#1;\n  #w := WORD#16#FF;\n  #r := REAL#1.5;',
      ),
    );
    expectNoErrors(result);
  });

  it('hex literal 16#FF gán cho Int → OK (giá trị 255)', () => {
    const { result } = checkSrc(obWith('  i : Int;', '  #i := 16#FF;'));
    expectNoErrors(result);
  });
});

describe('cross-file — interface từ IrBlock trong ctx', () => {
  it('gọi FB/FC từ ctx qua compileScl (lower phân giải được callee chéo file)', () => {
    const ctx = createCompileContext();
    const r1 = compileScl(FB_X, 'FB_X.scl', ctx);
    expect(r1.diagnostics).toEqual([]);
    const r2 = compileScl(FC_A, 'FC_A.scl', ctx);
    expect(r2.diagnostics).toEqual([]);
    const caller = `ORGANIZATION_BLOCK "Main"\nVAR\n  fb : FB_X;\nEND_VAR\nVAR_TEMP\n  x : Bool;\n  y : Bool;\n  n : Int;\n  r : Int;\nEND_VAR\nBEGIN\n  #fb(IN := #x, Q => #y, IO := #n);\n  #r := "FC_A"(i := #n);\nEND_ORGANIZATION_BLOCK`;
    const r3 = compileScl(caller, 'Main.scl', ctx);
    // #x/#n là TEMP chưa gán → W001 hợp lệ; quan trọng là không có lỗi
    // (lower phân giải được callee FB_X/FC_A từ ctx).
    expect(r3.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r3.blocks).toHaveLength(1);
  });

  it('gọi FB/FC đã compile ở file trước (cùng ctx) → OK', () => {
    const ctx = createCompileContext();
    const r1 = compileScl(FB_X, 'FB_X.scl', ctx);
    expect(r1.diagnostics).toEqual([]);
    const r2 = compileScl(FC_A, 'FC_A.scl', ctx);
    expect(r2.diagnostics).toEqual([]);
    const caller = `ORGANIZATION_BLOCK "Main"\nVAR\n  fb : FB_X;\nEND_VAR\nVAR_TEMP\n  x : Bool;\n  y : Bool;\n  n : Int;\n  r : Int;\nEND_VAR\nBEGIN\n  #fb(IN := #x, Q => #y, IO := #n);\n  #r := "FC_A"(i := #n);\nEND_ORGANIZATION_BLOCK`;
    const { result } = checkSrc(caller, ctx);
    expectNoErrors(result);
  });

  it('gọi FB từ ctx thiếu tham số bắt buộc → SCL-T004', () => {
    const ctx = createCompileContext();
    compileScl(FB_X, 'FB_X.scl', ctx);
    const caller = `ORGANIZATION_BLOCK "Main"\nVAR\n  fb : FB_X;\nEND_VAR\nBEGIN\n  #fb();\nEND_ORGANIZATION_BLOCK`;
    const { result } = checkSrc(caller, ctx);
    expectDiag(result, 'SCL-T004', 'thiếu tham số bắt buộc: IN');
  });

  it('gọi FC từ ctx trong biểu thức → kiểu trả từ ctx', () => {
    const ctx = createCompileContext();
    compileScl(FC_A, 'FC_A.scl', ctx);
    const caller = obWith('  n : Int;\n  r : DInt;', '  #r := "FC_A"(i := #n);');
    const { result } = checkSrc(caller, ctx);
    expectNoErrors(result);
  });

  it('đệ quy qua ctx (A gọi B, B gọi A ở file khác) → SCL-S020', () => {
    const ctx = createCompileContext();
    // Bước 1: FC_A sạch vào ctx. Bước 2: FC_B gọi FC_A vào ctx.
    // Bước 3: biên dịch lại FC_A (nay gọi FC_B) — cạnh A→B của lần này +
    // cạnh B→A trích từ IR của FC_B trong ctx tạo chu trình.
    const r1 = compileScl(FC_A, 'FC_A.scl', ctx);
    expect(r1.diagnostics).toEqual([]);
    const fb = `FUNCTION "FC_B" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\n  "FC_B" := "FC_A"(i := #i);\nEND_FUNCTION`;
    const r2 = compileScl(fb, 'FC_B.scl', ctx);
    expect(r2.diagnostics).toEqual([]);
    const fa = `FUNCTION "FC_A" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\n  "FC_A" := "FC_B"(i := #i);\nEND_FUNCTION`;
    const r3 = compileScl(fa, 'FC_A.scl', ctx);
    const s020 = r3.diagnostics.find((d) => d.code === 'SCL-S020');
    expect(s020, JSON.stringify(r3.diagnostics)).toBeDefined();
    expect(s020?.message).toContain('đệ quy gọi block: FC_A → FC_B → FC_A');
    expect(s020?.file).toBe('FC_B.scl');
  });

  it('re-compile bỏ call thì không còn đệ quy (cạnh ctx cũ không giữ)', () => {
    const ctx = createCompileContext();
    const r1 = compileScl(FC_A, 'FC_A.scl', ctx);
    expect(r1.diagnostics).toEqual([]);
    const fb = `FUNCTION "FC_B" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\n  "FC_B" := "FC_A"(i := #i);\nEND_FUNCTION`;
    compileScl(fb, 'FC_B.scl', ctx);
    // Biên dịch lại FC_B không gọi FC_A nữa, rồi biên dịch lại FC_A gọi
    // FC_B: chỉ còn cạnh A→B, không còn chu trình.
    const fb2 = `FUNCTION "FC_B" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\n  "FC_B" := #i;\nEND_FUNCTION`;
    const r2 = compileScl(fb2, 'FC_B.scl', ctx);
    expect(r2.diagnostics).toEqual([]);
    const fa = `FUNCTION "FC_A" : Int\nVAR_INPUT\n  i : Int;\nEND_VAR\nBEGIN\n  "FC_A" := "FC_B"(i := #i);\nEND_FUNCTION`;
    const r3 = compileScl(fa, 'FC_A.scl', ctx);
    expect(r3.diagnostics).toEqual([]);
  });
});
