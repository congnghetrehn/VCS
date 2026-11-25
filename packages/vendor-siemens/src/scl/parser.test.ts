// Test parser SCL — M1 §4.2–4.4, plan P1.2 §17 (bảng B + C + D tính tay).
import { describe, expect, it } from 'vitest';
import { parseScl } from './parser.js';
import type {
  SclBlock,
  SclExpr,
  SclFile,
  SclLValue,
  SclRef,
  SclStmt,
} from './ast.js';

/** Bỏ `loc` đệ quy để deep-equal AST (bảng C). */
function stripLoc(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLoc);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'loc') continue;
      out[k] = stripLoc(v);
    }
    return out;
  }
  return value;
}

/** Dạng rút gọn của một expr (bảng B): literal → giá trị, ref → `#a`, binary → [op, l, r]. */
function exprShape(e: SclExpr): unknown {
  switch (e.kind) {
    case 'literal':
      return e.literal.value;
    case 'ref':
      return lvalueShape(e.ref);
    case 'unary':
      return [e.op, exprShape(e.operand)];
    case 'binary':
      return [e.op, exprShape(e.left), exprShape(e.right)];
    case 'call':
      return ['call', e.callee.kind === 'ident' ? e.callee.name : refShape(e.callee)];
  }
}

function lvalueShape(lv: SclLValue): unknown {
  const base = refShape(lv.base);
  if (lv.path.length === 0) return base;
  const parts: unknown[] = [base];
  for (const p of lv.path) {
    if (p.kind === 'member') parts.push(`.${p.name}`);
    else parts.push(['[', exprShape(p.index), ']']);
  }
  return parts;
}

function refShape(r: SclRef): string {
  switch (r.kind) {
    case 'local':
      return `#${r.name}`;
    case 'global':
      return `"${r.name}"`;
    case 'abs':
      return r.raw;
  }
}

/** Parse và assert không lỗi, trả AST. */
function parseOk(src: string): SclFile {
  const r = parseScl(src, 'T.scl');
  expect(r.diagnostics, JSON.stringify(r.diagnostics)).toEqual([]);
  return r.ast;
}

/** Gói một body thành OB để test statement/expr. */
function ob(body: string): string {
  return `ORGANIZATION_BLOCK "Main"\nBEGIN\n${body}\nEND_ORGANIZATION_BLOCK`;
}

function obBody(ast: SclFile): SclStmt[] {
  const b = ast.blocks[0] as Extract<SclBlock, { kind: 'OB' }>;
  return b.body;
}

/** Gốc của `#r := <expr>;` trong OB. */
function exprOfAssign(src: string): SclExpr {
  const body = obBody(parseOk(ob(`  #r := ${src};`)));
  expect(body).toHaveLength(1);
  const stmt = body[0];
  expect(stmt?.kind).toBe('assign');
  if (stmt?.kind !== 'assign') throw new Error('không phải assign');
  return stmt.value;
}

/** Bảng B — 15 case ưu tiên (§4.3). Tên biến dùng `#a`… (bảng gốc viết `a`… gọn). */
describe('bảng B — ưu tiên toán tử', () => {
  it.each([
    ['#a + #b * #c', ['+', '#a', ['*', '#b', '#c']]],
    ['#a * #b + #c * #d', ['+', ['*', '#a', '#b'], ['*', '#c', '#d']]],
    ['NOT #a AND #b', ['AND', ['NOT', '#a'], '#b']],
    ['#a AND #b OR #c AND #d', ['OR', ['AND', '#a', '#b'], ['AND', '#c', '#d']]],
    ['#a OR #b XOR #c', ['OR', '#a', ['XOR', '#b', '#c']]],
    ['#a = #b AND #c <> #d', ['AND', ['=', '#a', '#b'], ['<>', '#c', '#d']]],
    ['#a < #b = #c', ['=', ['<', '#a', '#b'], '#c']],
    ['-#a + #b', ['+', ['-', '#a'], '#b']],
    ['-2 ** 2', ['-', ['**', 2, 2]]],
    ['2 ** 3 ** 2', ['**', 2, ['**', 3, 2]]],
    ['#a + #b - #c', ['-', ['+', '#a', '#b'], '#c']],
    ['#a / #b MOD #c', ['MOD', ['/', '#a', '#b'], '#c']],
    ['NOT NOT #a', ['NOT', ['NOT', '#a']]],
    ['(#a + #b) * #c', ['*', ['+', '#a', '#b'], '#c']],
    ['#a AND #b & #c', ['AND', ['AND', '#a', '#b'], '#c']],
  ] as const)('%s → %s', (src, expected) => {
    expect(exprShape(exprOfAssign(src))).toEqual(expected);
  });

  it('-2 ** 2 = -(2 ** 2) (mũ chặt hơn unary)', () => {
    // Gốc là unary `-`, toán hạng là `2 ** 2` (không phải `(-2) ** 2`).
    expect(exprShape(exprOfAssign('-2 ** 2'))).toEqual(['-', ['**', 2, 2]]);
  });

  it('2 ** 3 ** 2 kết hợp phải (OQ-092)', () => {
    expect(exprShape(exprOfAssign('2 ** 3 ** 2'))).toEqual(['**', 2, ['**', 3, 2]]);
  });
});

/** Bảng C — AST của FB mẫu (tính tay, plan §17). */
describe('bảng C — AST FB mẫu', () => {
  const FB_SRC = `FUNCTION_BLOCK "FB_Motor"
VAR_INPUT
  iStart : Bool;
END_VAR
VAR_OUTPUT
  qRun : Bool;
END_VAR
BEGIN
  #qRun := #iStart;
END_FUNCTION_BLOCK`;

  it('deep-equal AST (trừ loc)', () => {
    const ast = parseOk(FB_SRC);
    expect(stripLoc(ast)).toEqual({
      kind: 'file',
      blocks: [
        {
          kind: 'FB',
          name: 'FB_Motor',
          varSections: [
            {
              kind: 'VAR_INPUT',
              decls: [{ name: 'iStart', type: { kind: 'elementary', name: 'Bool' } }],
            },
            {
              kind: 'VAR_OUTPUT',
              decls: [{ name: 'qRun', type: { kind: 'elementary', name: 'Bool' } }],
            },
          ],
          body: [
            {
              kind: 'assign',
              target: { base: { kind: 'local', name: 'qRun' }, path: [] },
              value: {
                kind: 'ref',
                ref: { base: { kind: 'local', name: 'iStart' }, path: [] },
              },
            },
          ],
        },
      ],
    });
  });

  it('loc: block (1,1)→(10,19); assign (9,3)→(9,19)', () => {
    const ast = parseOk(FB_SRC);
    const fb = ast.blocks[0] as Extract<SclBlock, { kind: 'FB' }>;
    expect(fb.loc.line).toBe(1);
    expect(fb.loc.col).toBe(1);
    expect(fb.loc.endLine).toBe(10);
    expect(fb.loc.endCol).toBe(19);
    const assign = fb.body[0];
    expect(assign?.loc.line).toBe(9);
    expect(assign?.loc.col).toBe(3);
    expect(assign?.loc.endCol).toBe(19);
  });

  it('loc của literal: `#x := 5;` → literal 5 ở (3,9)', () => {
    const ast = parseOk(ob('  #x := 5;'));
    const body = obBody(ast);
    const stmt = body[0];
    expect(stmt?.kind).toBe('assign');
    if (stmt?.kind !== 'assign') throw new Error('không phải assign');
    expect(stmt.value.kind).toBe('literal');
    if (stmt.value.kind !== 'literal') throw new Error('không phải literal');
    expect(stmt.value.literal.value).toBe(5);
    expect(stmt.value.loc.line).toBe(3);
    expect(stmt.value.loc.col).toBe(9);
  });
});

describe('5 loại block', () => {
  it('OB (tên "Main", 0 var_section)', () => {
    const ast = parseOk(ob('  #x := 1;'));
    const b = ast.blocks[0] as Extract<SclBlock, { kind: 'OB' }>;
    expect(b.kind).toBe('OB');
    expect(b.name).toBe('Main');
    expect(b.varSections).toEqual([]);
    expect(b.body).toHaveLength(1);
  });

  it('FC có return type', () => {
    const ast = parseOk(
      'FUNCTION "FC_Add" : Int\nVAR_INPUT\n  a : Int;\nEND_VAR\nBEGIN\n  #FC_Add := #a;\nEND_FUNCTION',
    );
    const b = ast.blocks[0] as Extract<SclBlock, { kind: 'FC' }>;
    expect(b.kind).toBe('FC');
    expect(b.name).toBe('FC_Add');
    expect(b.returnType?.kind).toBe('elementary');
    if (b.returnType?.kind === 'elementary') expect(b.returnType.name).toBe('Int');
  });

  it('FC không return type', () => {
    const ast = parseOk(
      'FUNCTION "FC_Do"\nVAR_INPUT\n  a : Int;\nEND_VAR\nBEGIN\n  #x := #a;\nEND_FUNCTION',
    );
    const b = ast.blocks[0] as Extract<SclBlock, { kind: 'FC' }>;
    expect(b.kind).toBe('FC');
    expect(b.returnType).toBeUndefined();
  });

  it('FB (bảng C đã cover)', () => {
    const ast = parseOk(
      'FUNCTION_BLOCK "FB_X"\nVAR_INPUT\n  i : Bool;\nEND_VAR\nBEGIN\n  #q := #i;\nEND_FUNCTION_BLOCK',
    );
    expect(ast.blocks[0]?.kind).toBe('FB');
  });

  it('UDT (TYPE ... STRUCT)', () => {
    const ast = parseOk(
      'TYPE "UDT_Motor"\nSTRUCT\n  run : Bool;\n  speed : Real;\nEND_STRUCT;\nEND_TYPE',
    );
    const b = ast.blocks[0] as Extract<SclBlock, { kind: 'UDT' }>;
    expect(b.kind).toBe('UDT');
    expect(b.name).toBe('UDT_Motor');
    expect(b.fields.map((f) => f.name)).toEqual(['run', 'speed']);
  });

  it('DB dạng "fbname"', () => {
    const ast = parseOk('DATA_BLOCK "DB_Motor" "FB_Motor"\nBEGIN\nEND_DATA_BLOCK');
    const b = ast.blocks[0] as Extract<SclBlock, { kind: 'DB' }>;
    expect(b.kind).toBe('DB');
    expect(b.name).toBe('DB_Motor');
    expect(b.fbName).toBe('FB_Motor');
  });

  it('DB dạng STRUCT + BEGIN init (OQ-093)', () => {
    const ast = parseOk(
      'DATA_BLOCK "DB_Cfg"\nSTRUCT\n  sp : Real;\n  en : Bool;\nEND_STRUCT;\nBEGIN\n  #sp := 1.5;\n  #en := TRUE;\nEND_DATA_BLOCK',
    );
    const b = ast.blocks[0] as Extract<SclBlock, { kind: 'DB' }>;
    expect(b.kind).toBe('DB');
    expect(b.name).toBe('DB_Cfg');
    expect(b.fields?.map((f) => f.name)).toEqual(['sp', 'en']);
    expect(b.init).toHaveLength(2);
    expect(b.init?.[0]?.kind).toBe('assign');
  });
});

describe('6 var_section + kiểu', () => {
  it('đủ 6 loại var_section trong một FB', () => {
    const ast = parseOk(
      `FUNCTION_BLOCK "FB_All"
VAR_INPUT
  a : Int;
END_VAR
VAR_OUTPUT
  b : Int;
END_VAR
VAR_IN_OUT
  c : Int;
END_VAR
VAR
  d : Int;
END_VAR
VAR_TEMP
  e : Int;
END_VAR
VAR_CONSTANT
  K : Int := 5;
END_VAR
BEGIN
END_FUNCTION_BLOCK`,
    );
    const b = ast.blocks[0] as Extract<SclBlock, { kind: 'FB' }>;
    expect(b.varSections.map((s) => s.kind)).toEqual([
      'VAR_INPUT',
      'VAR_OUTPUT',
      'VAR_IN_OUT',
      'VAR',
      'VAR_TEMP',
      'VAR_CONSTANT',
    ]);
    const k = b.varSections[5]?.decls[0];
    expect(k?.name).toBe('K');
    expect(k?.init?.kind).toBe('literal');
  });

  it('Array 1 chiều (lo/hi, có dấu -)', () => {
    const ast = parseOk(
      'FUNCTION_BLOCK "FB_A"\nVAR\n  arr : Array[-2..9] OF Int;\nEND_VAR\nBEGIN\nEND_FUNCTION_BLOCK',
    );
    const b = ast.blocks[0] as Extract<SclBlock, { kind: 'FB' }>;
    const t = b.varSections[0]?.decls[0]?.type;
    expect(t).toEqual(
      expect.objectContaining({ kind: 'array', lo: -2, hi: 9 }),
    );
    if (t?.kind === 'array') expect(t.elem).toEqual(expect.objectContaining({ kind: 'elementary', name: 'Int' }));
  });

  it('struct nội tuyến trong type (OQ-104)', () => {
    const ast = parseOk(
      'FUNCTION_BLOCK "FB_S"\nVAR\n  st : STRUCT\n    x : Int;\n    y : Bool;\n  END_STRUCT;\nEND_VAR\nBEGIN\nEND_FUNCTION_BLOCK',
    );
    const b = ast.blocks[0] as Extract<SclBlock, { kind: 'FB' }>;
    const t = b.varSections[0]?.decls[0]?.type;
    expect(t?.kind).toBe('struct');
    if (t?.kind === 'struct') expect(t.fields.map((f) => f.name)).toEqual(['x', 'y']);
  });

  it('kiểu named (UDT chưa phân giải) + elementary giữ nguyên text', () => {
    const ast = parseOk(
      'FUNCTION_BLOCK "FB_N"\nVAR\n  m : "UDT_Motor";\n  n : Int;\nEND_VAR\nBEGIN\nEND_FUNCTION_BLOCK',
    );
    const b = ast.blocks[0] as Extract<SclBlock, { kind: 'FB' }>;
    const decls = b.varSections[0]?.decls ?? [];
    expect(decls[0]?.type).toEqual(expect.objectContaining({ kind: 'named', name: 'UDT_Motor' }));
    expect(decls[1]?.type).toEqual(expect.objectContaining({ kind: 'elementary', name: 'Int' }));
  });
});

describe('statement', () => {
  it('assign member `.` + index `[]`', () => {
    const body = obBody(parseOk(ob('  #m.x[1] := #a.b[2];')));
    expect(body).toHaveLength(1);
    const stmt = body[0];
    expect(stmt?.kind).toBe('assign');
    if (stmt?.kind !== 'assign') throw new Error('không phải assign');
    expect(lvalueShape(stmt.target)).toEqual(['#m', '.x', ['[', 1, ']']]);
    expect(exprShape(stmt.value)).toEqual(['#a', '.b', ['[', 2, ']']]);
  });

  it('IF / ELSIF / ELSE', () => {
    const body = obBody(
      parseOk(
        ob('  IF #a THEN\n    #x := 1;\n  ELSIF #b THEN\n    #x := 2;\n  ELSE\n    #x := 3;\n  END_IF;'),
      ),
    );
    expect(body).toHaveLength(1);
    const stmt = body[0];
    expect(stmt?.kind).toBe('if');
    if (stmt?.kind !== 'if') throw new Error('không phải if');
    expect(stmt.elsif).toHaveLength(1);
    expect(stmt.else).toHaveLength(1);
    expect(stmt.then).toHaveLength(1);
  });

  it('CASE: label đơn + khoảng .. + kết hợp , + ELSE', () => {
    const body = obBody(
      parseOk(
        ob('  CASE #n OF\n    1: #x := 1;\n    2..5: #x := 2;\n    7, 8: #x := 3;\n  ELSE\n    #x := 0;\n  END_CASE;'),
      ),
    );
    expect(body).toHaveLength(1);
    const stmt = body[0];
    expect(stmt?.kind).toBe('case');
    if (stmt?.kind !== 'case') throw new Error('không phải case');
    expect(stmt.arms).toHaveLength(3);
    expect(stmt.arms[0]?.labels).toHaveLength(1);
    expect(stmt.arms[1]?.labels[0]?.kind).toBe('range');
    expect(stmt.arms[2]?.labels).toHaveLength(2);
    expect(stmt.else).toHaveLength(1);
  });

  it('FOR có BY và không BY', () => {
    const body = obBody(
      parseOk(ob('  FOR #i := 0 TO 10 BY 2 DO\n    #x := #i;\n  END_FOR;\n  FOR #j := 0 TO 5 DO\n    #y := #j;\n  END_FOR;')),
    );
    expect(body).toHaveLength(2);
    const f1 = body[0];
    const f2 = body[1];
    expect(f1?.kind).toBe('for');
    expect(f2?.kind).toBe('for');
    if (f1?.kind !== 'for' || f2?.kind !== 'for') throw new Error('không phải for');
    expect(f1.by).toBeDefined();
    expect(f2.by).toBeUndefined();
  });

  it('WHILE + REPEAT', () => {
    const body = obBody(
      parseOk(ob('  WHILE #a DO\n    #x := 1;\n  END_WHILE;\n  REPEAT\n    #y := 2;\n  UNTIL #b END_REPEAT;')),
    );
    expect(body).toHaveLength(2);
    expect(body[0]?.kind).toBe('while');
    expect(body[1]?.kind).toBe('repeat');
  });

  it('EXIT / CONTINUE / RETURN', () => {
    const body = obBody(
      parseOk(ob('  FOR #i := 0 TO 3 DO\n    IF #a THEN EXIT; END_IF;\n    IF #b THEN CONTINUE; END_IF;\n  END_FOR;\n  RETURN;')),
    );
    expect(body).toHaveLength(2);
    expect(body[1]?.kind).toBe('return');
    const f = body[0];
    expect(f?.kind).toBe('for');
    if (f?.kind !== 'for') throw new Error('không phải for');
    expect(f.body[0]?.kind).toBe('if');
  });

  it('call FB statement: #sT(IN := #x, PT := T#3s)', () => {
    const body = obBody(parseOk(ob('  #sT(IN := #x, PT := T#3s);')));
    expect(body).toHaveLength(1);
    const stmt = body[0];
    expect(stmt?.kind).toBe('call');
    if (stmt?.kind !== 'call') throw new Error('không phải call');
    expect(stmt.callee.kind).toBe('local');
    expect(stmt.args).toHaveLength(2);
    expect(stmt.args[0]?.kind).toBe('named');
    expect(stmt.args[1]?.kind).toBe('named');
  });

  it('call FC trong biểu thức: #r := "FC_Scale"(x := #a)', () => {
    const value = exprOfAssign('"FC_Scale"(x := #a)');
    expect(value.kind).toBe('call');
    if (value.kind !== 'call') throw new Error('không phải call');
    expect(value.callee.kind).toBe('global');
    expect(value.args).toHaveLength(1);
    expect(value.args[0]?.kind).toBe('named');
  });

  it('namedOut: Q => #y', () => {
    const body = obBody(parseOk(ob('  #fb(Q => #y);')));
    const stmt = body[0];
    expect(stmt?.kind).toBe('call');
    if (stmt?.kind !== 'call') throw new Error('không phải call');
    expect(stmt.args[0]?.kind).toBe('namedOut');
  });

  it('positional arg', () => {
    const value = exprOfAssign('Scale(#a, 2)');
    expect(value.kind).toBe('call');
    if (value.kind !== 'call') throw new Error('không phải call');
    expect(value.args[0]?.kind).toBe('positional');
    expect(value.args[1]?.kind).toBe('positional');
  });

  it('statement `;` rỗng', () => {
    const body = obBody(parseOk(ob('  ;\n  #x := 1;')));
    expect(body).toHaveLength(2);
    expect(body[0]?.kind).toBe('empty');
    expect(body[1]?.kind).toBe('assign');
  });

  it('địa chỉ tuyệt đối %I0.0 / DB1.DBW4 trong lvalue', () => {
    const body = obBody(parseOk(ob('  %Q0.0 := #a;\n  #x := DB1.DBW4;')));
    expect(body).toHaveLength(2);
    const s1 = body[0];
    const s2 = body[1];
    expect(s1?.kind).toBe('assign');
    expect(s2?.kind).toBe('assign');
    if (s1?.kind !== 'assign' || s2?.kind !== 'assign') throw new Error('không phải assign');
    expect(s1.target.base.kind).toBe('abs');
    expect(s2.value.kind).toBe('ref');
    if (s2.value.kind !== 'ref') throw new Error('không phải ref');
    expect(s2.value.ref.base.kind).toBe('abs');
  });
});

/** Bảng D — lỗi + phục hồi (vị trí đã kiểm bằng probe, xem STATE §17). */
describe('bảng D — lỗi', () => {
  function codes(src: string): string[] {
    return parseScl(src, 'T.scl').diagnostics.map((d) => d.code);
  }

  function at(src: string, code: string, line: number, col: number): void {
    const r = parseScl(src, 'T.scl');
    const d = r.diagnostics.find((x) => x.code === code);
    expect(d, JSON.stringify(r.diagnostics)).toBeDefined();
    expect(d?.line).toBe(line);
    expect(d?.col).toBe(col);
  }

  it('D1: thiếu `;` → SCL-P001 tại token trước (3,9); cả hai assign vẫn trong AST', () => {
    const src = ob('  #x := 1\n  #y := 2;');
    const r = parseScl(src, 'T.scl');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['SCL-P001']);
    at(src, 'SCL-P001', 3, 9);
    expect(obBody(r.ast)).toHaveLength(2);
  });

  it('D2: comment `(*` không đóng → SCL-L001 tại (3,3); + P002 cuối BEGIN (2,6)', () => {
    const src = ob('  (* comment\n  #x := 1;');
    const r = parseScl(src, 'T.scl');
    // Sort theo vị trí: P002 (2,6) trước L001 (3,3).
    expect(r.diagnostics.map((d) => d.code)).toEqual(['SCL-P002', 'SCL-L001']);
    at(src, 'SCL-L001', 3, 3);
    at(src, 'SCL-P002', 2, 6);
  });

  it('D3: `$` → SCL-L001 tại (3,9)', () => {
    const src = ob('  #x := $;');
    const r = parseScl(src, 'T.scl');
    expect(r.diagnostics.map((d) => d.code)).toContain('SCL-L001');
    // Dòng 3 `  #x := $;`: `$` ở cột 9.
    at(src, 'SCL-L001', 3, 9);
  });

  it('D4: `IF THEN` → SCL-P002 tại THEN (3,6)', () => {
    const src = ob('  IF THEN\n    #x := 1;\n  END_IF;');
    const r = parseScl(src, 'T.scl');
    expect(r.diagnostics.map((d) => d.code)).toContain('SCL-P002');
    at(src, 'SCL-P002', 3, 6);
  });

  it('D5: `s : String;` → SCL-U001 tại (3,7) (OQ-102)', () => {
    const src = `FUNCTION_BLOCK "FB_S"
VAR
  s : String;
END_VAR
BEGIN
END_FUNCTION_BLOCK`;
    const r = parseScl(src, 'T.scl');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['SCL-U001']);
    at(src, 'SCL-U001', 3, 7);
  });

  it('D6: comment lồng `(* outer (* inner *) *)` → 1 SCL-L001 tại (3,24); assign sau vẫn parse', () => {
    // Lưu ý: bản plan `(* a (* b *) c *)` còn tạo thêm P002 từ ident `c` thừa
    // (hành vi đúng: `c` sau `*)` đầu tiên là token rác) — test dùng dạng sạch.
    const src = ob('  (* outer (* inner *) *)\n  #y := 2;');
    const r = parseScl(src, 'T.scl');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['SCL-L001']);
    at(src, 'SCL-L001', 3, 24);
    expect(obBody(r.ast)).toHaveLength(1);
    expect(obBody(r.ast)[0]?.kind).toBe('assign');
  });

  it('D7a: `%X0.0` → SCL-L001 tại (3,3)', () => {
    const src = ob('  %X0.0 := #a;');
    const r = parseScl(src, 'T.scl');
    expect(r.diagnostics.map((d) => d.code)).toContain('SCL-L001');
    // Dòng 3 `  %X0.0 := #a;`: `%` ở cột 3.
    at(src, 'SCL-L001', 3, 3);
  });

  it('D7b: `DB0.DBW0` → đúng 1 SCL-P002 tại (3,9)', () => {
    const src = ob('  #x := DB0.DBW0;');
    const r = parseScl(src, 'T.scl');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['SCL-P002']);
    at(src, 'SCL-P002', 3, 9);
  });

  it('D8: 2 statement lỗi quanh 1 statement đúng → 2× SCL-P002 tại (3,9)/(5,9); AST chỉ còn assign', () => {
    const src = ob('  #x := ;\n  #y := 2;\n  #z := ;');
    const r = parseScl(src, 'T.scl');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['SCL-P002', 'SCL-P002']);
    expect(r.diagnostics[0]?.line).toBe(3);
    expect(r.diagnostics[0]?.col).toBe(9);
    expect(r.diagnostics[1]?.line).toBe(5);
    expect(r.diagnostics[1]?.col).toBe(9);
    const body = obBody(r.ast);
    expect(body).toHaveLength(1);
    expect(body[0]?.kind).toBe('assign');
  });

  it('D9: `;` thừa ở cấp file → đúng 1 SCL-P002 tại (4,23)', () => {
    const src = `${ob('  #x := 1;')};`;
    const r = parseScl(src, 'T.scl');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['SCL-P002']);
    // `;` nằm ngay sau `END_ORGANIZATION_BLOCK` (22 ký tự) trên dòng 4.
    at(src, 'SCL-P002', 4, 23);
  });

  it('D10: 105 statement lỗi → đúng 101 diag (100 SCL-P002 + 1 SCL-P003), dừng parse', () => {
    const bad = Array.from({ length: 105 }, () => '  #x := ;').join('\n');
    const r = parseScl(ob(bad), 'T.scl');
    expect(r.diagnostics).toHaveLength(101);
    expect(r.diagnostics.slice(0, 100).every((d) => d.code === 'SCL-P002')).toBe(true);
    expect(r.diagnostics[100]?.code).toBe('SCL-P003');
  });

  it('thiếu END_IF → SCL-P002 tại END_ORGANIZATION_BLOCK (5,1)', () => {
    const src = ob('  IF #a THEN\n    #x := 1;');
    const r = parseScl(src, 'T.scl');
    expect(r.diagnostics.map((d) => d.code)).toContain('SCL-P002');
    const d = r.diagnostics.find((x) => x.code === 'SCL-P002');
    // Token lỗi là END_ORGANIZATION_BLOCK (dòng 5, cột 1) — parser đang chờ
    // END_IF thì gặp token này. (EOF chỉ khi OB cũng không đóng.)
    expect(d?.line).toBe(5);
    expect(d?.col).toBe(1);
  });

  it('ngoặc chưa đóng → SCL-P002 tại `;`; assign vẫn trong AST', () => {
    const src = ob('  #x := (#a + #b;');
    const r = parseScl(src, 'T.scl');
    expect(r.diagnostics.map((d) => d.code)).toContain('SCL-P002');
    const body = obBody(r.ast);
    expect(body).toHaveLength(1);
    expect(body[0]?.kind).toBe('assign');
  });

  it('diagnostics đã sort theo vị trí (số, không phải chuỗi)', () => {
    const src = ob('  #x := 1\n  #y := $;');
    const r = parseScl(src, 'T.scl');
    const locs = r.diagnostics.map((d) => ({ line: d.line ?? 0, col: d.col ?? 0 }));
    const sorted = [...locs].sort((a, b) => a.line - b.line || a.col - b.col);
    expect(locs).toEqual(sorted);
    expect(codes(src)).toContain('SCL-L001');
    expect(codes(src)).toContain('SCL-P001');
  });
});
