// Test lexer SCL — M1 §4.1, plan P1.2 §17 (bảng A + A2 tính tay).
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { parseLiteralValue, tokenizeScl } from './lexer.js';

const OB_SAMPLE = `ORGANIZATION_BLOCK "Main"
VAR_TEMP
  x : Int := 5;
END_VAR
BEGIN
  #x := #x + 16#FF;
  IF #x > 10 THEN
    %Q0.0 := TRUE;
  END_IF;
END_ORGANIZATION_BLOCK`;

/** Bảng A — toàn bộ token + vị trí của OB mẫu (tính tay, plan §17). */
describe('bảng A — token OB mẫu', () => {
  it('token stream khớp deep-equal (type, image, line, col, length)', () => {
    const { tokens, diagnostics } = tokenizeScl(OB_SAMPLE, 'Main.scl');
    expect(diagnostics).toEqual([]);
    const got = tokens.map((t) => [t.type, t.image, t.line, t.col, t.length]);
    expect(got).toEqual([
      ['OrganizationBlock', 'ORGANIZATION_BLOCK', 1, 1, 18],
      ['GlobalVar', '"Main"', 1, 20, 6],
      ['VarTemp', 'VAR_TEMP', 2, 1, 8],
      ['Identifier', 'x', 3, 3, 1],
      ['Colon', ':', 3, 5, 1],
      ['Identifier', 'Int', 3, 7, 3],
      ['ColonEquals', ':=', 3, 11, 2],
      ['IntLiteral', '5', 3, 14, 1],
      ['Semicolon', ';', 3, 15, 1],
      ['EndVar', 'END_VAR', 4, 1, 7],
      ['Begin', 'BEGIN', 5, 1, 5],
      ['LocalVar', '#x', 6, 3, 2],
      ['ColonEquals', ':=', 6, 6, 2],
      ['LocalVar', '#x', 6, 9, 2],
      ['Plus', '+', 6, 12, 1],
      ['IntLiteral', '16#FF', 6, 14, 5],
      ['Semicolon', ';', 6, 19, 1],
      ['If', 'IF', 7, 3, 2],
      ['LocalVar', '#x', 7, 6, 2],
      ['Greater', '>', 7, 9, 1],
      ['IntLiteral', '10', 7, 11, 2],
      ['Then', 'THEN', 7, 14, 4],
      ['AbsAddress', '%Q0.0', 8, 5, 5],
      ['ColonEquals', ':=', 8, 11, 2],
      ['BoolLiteral', 'TRUE', 8, 14, 4],
      ['Semicolon', ';', 8, 18, 1],
      ['EndIf', 'END_IF', 9, 3, 6],
      ['Semicolon', ';', 9, 9, 1],
      ['EndOrganizationBlock', 'END_ORGANIZATION_BLOCK', 10, 1, 22],
    ]);
  });

  it('endCol exclusive: endCol = col + length', () => {
    const { tokens } = tokenizeScl(OB_SAMPLE, 'Main.scl');
    for (const t of tokens) {
      expect(t.endCol, t.image).toBe(t.col + t.length);
      expect(t.endLine, t.image).toBe(t.line);
    }
  });
});

/** Bảng A2 — giá trị literal (tính tay, plan §17). */
describe('bảng A2 — parseLiteralValue', () => {
  it.each([
    ['123', 'int', 123, undefined],
    ['16#FF', 'int', 255, undefined],
    ['2#1010_0101', 'int', 165, undefined],
    ['8#17', 'int', 15, undefined],
    ['1.5', 'real', 1.5, undefined],
    ['3.0E-2', 'real', 0.03, undefined],
    ['1e3', 'real', 1000, undefined],
    ['TRUE', 'bool', true, undefined],
    ['FALSE', 'bool', false, undefined],
    ['T#5s', 'time', 5000, undefined],
    ['T#1h30m', 'time', 5400000, undefined],
    ['T#500ms', 'time', 500, undefined],
    ['T#-2s', 'time', -2000, undefined],
    ['TIME#2s', 'time', 2000, undefined],
    ['INT#5', 'typed', 5, 'Int'],
    ['REAL#1.0', 'typed', 1, 'Real'],
    ['DINT#-1', 'typed', -1, 'DInt'],
    ['WORD#16#FFFF', 'typed', 65535, 'Word'],
  ] as const)('%s (%s) → %s', (raw, kind, value, type) => {
    const got = parseLiteralValue(raw, kind);
    expect(got.value).toBe(value);
    expect(got.type).toBe(type);
  });

  it('1..3 → 1, .., 3 (Real yêu cầu chữ số sau .)', () => {
    const { tokens, diagnostics } = tokenizeScl('1..3', 'T.scl');
    expect(diagnostics).toEqual([]);
    expect(tokens.map((t) => [t.type, t.image])).toEqual([
      ['IntLiteral', '1'],
      ['DotDot', '..'],
      ['IntLiteral', '3'],
    ]);
  });

  it('2#2 → SCL-L001 (chữ số 2 sai cơ số 2)', () => {
    const { diagnostics } = tokenizeScl('#x := 2#2;', 'T.scl');
    expect(diagnostics.map((d) => d.code)).toContain('SCL-L001');
    const d = diagnostics.find((x) => x.code === 'SCL-L001');
    // `#` của `2#2` ở cột 8: `#x := 2#2;` → #=1..2, :=, 2, #=8.
    expect(d?.line).toBe(1);
    expect(d?.col).toBe(8);
  });
});

describe('comment + ký tự lạ', () => {
  it('comment // và (* *) bị bỏ qua, không thành token', () => {
    const src = '// dòng comment\n#x := 1; (* khối\n nhiều dòng *) #y := 2;';
    const { tokens, diagnostics } = tokenizeScl(src, 'T.scl');
    expect(diagnostics).toEqual([]);
    expect(tokens.map((t) => t.image)).toEqual(['#x', ':=', '1', ';', '#y', ':=', '2', ';']);
  });

  it('comment không đóng → SCL-L001 tại vị trí (* (D2)', () => {
    const src = 'ORGANIZATION_BLOCK "Main"\nBEGIN\n  (* comment\nEND_ORGANIZATION_BLOCK';
    const { diagnostics } = tokenizeScl(src, 'T.scl');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('SCL-L001');
    expect(diagnostics[0]?.line).toBe(3);
    expect(diagnostics[0]?.col).toBe(3);
  });

  it('ký tự lạ $ → SCL-L001 tại $ (D3)', () => {
    const src = 'ORGANIZATION_BLOCK "Main"\n  #x := 5 $ 3;';
    const { diagnostics } = tokenizeScl(src, 'T.scl');
    expect(diagnostics.map((d) => d.code)).toContain('SCL-L001');
    const d = diagnostics.find((x) => x.code === 'SCL-L001');
    expect(d?.line).toBe(2);
    expect(d?.col).toBe(11);
  });

  it('dấu " không đóng → SCL-L001 tại "', () => {
    const { diagnostics } = tokenizeScl('#x := "abc;', 'T.scl');
    expect(diagnostics.map((d) => d.code)).toContain('SCL-L001');
  });

  it('T#5x (đơn vị lạ) → SCL-L001 (OQ-097)', () => {
    const { diagnostics } = tokenizeScl('#x := T#5x;', 'T.scl');
    expect(diagnostics.map((d) => d.code)).toContain('SCL-L001');
    const d = diagnostics.find((x) => x.code === 'SCL-L001');
    expect(d?.line).toBe(1);
    // BadTimeLiteral `T#5x` bắt đầu ở cột 7 (chữ `T`).
    expect(d?.col).toBe(7);
  });

  it('comment lồng: chỉ khớp tới *) đầu tiên, *) thừa → SCL-L001 (D6, OQ-096)', () => {
    const src = '(* outer (* inner *) *)';
    const { diagnostics } = tokenizeScl(src, 'T.scl');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('SCL-L001');
    expect(diagnostics[0]?.line).toBe(1);
    // `*)` thừa bắt đầu ở cột 22: `(* outer (* inner *) *)`
    // (đếm: `(*`=1-2, ` outer `=3-9, `(*`=10-11, ` inner `=12-18, `*)`=19-20,
    // ` `=21, `*)`=22-23).
    expect(diagnostics[0]?.col).toBe(22);
  });
});

describe('case + tên', () => {
  it('từ khóa không phân biệt hoa/thường', () => {
    for (const kw of ['if', 'If', 'IF', 'iF']) {
      const { tokens } = tokenizeScl(`${kw} #x THEN #y := 1; END_IF;`, 'T.scl');
      expect(tokens[0]?.type, kw).toBe('If');
    }
    for (const kw of ['end_if', 'END_IF', 'End_If']) {
      const { tokens } = tokenizeScl(kw, 'T.scl');
      expect(tokens[0]?.type, kw).toBe('EndIf');
    }
  });

  it('"Main" giữ nguyên case; #name giữ dạng viết', () => {
    const { tokens } = tokenizeScl('"Main" #MixedCase', 'T.scl');
    expect(tokens[0]?.image).toBe('"Main"');
    expect(tokens[1]?.image).toBe('#MixedCase');
  });

  it('DB1.DBW4 là một AbsAddress (không bị cắt thành Ident)', () => {
    const { tokens, diagnostics } = tokenizeScl('DB1.DBW4', 'T.scl');
    expect(diagnostics).toEqual([]);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.type).toBe('AbsAddress');
    expect(tokens[0]?.image).toBe('DB1.DBW4');
  });
});

describe('property — nối image token = nguồn đã bỏ khoảng trắng', () => {
  it('round-trip token (fast-check, seed cố định)', () => {
    const pieces = [
      'IF', 'THEN', 'ELSE', 'END_IF', 'BEGIN', 'END_VAR', 'VAR', 'Int', 'Bool',
      '#x', '#y', '"Main"', '%I0.0', '%Q0.0', 'DB1.DBW4',
      '5', '16#FF', '2#1010', '1.5', 'T#5s', 'INT#5', 'TRUE', 'FALSE',
      ':=', ';', ':', ',', '.', '..', '(', ')', '[', ']', '=', '<>', '<', '>',
      '<=', '>=', '+', '-', '*', '/', '**', '&', '=>',
    ];
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...pieces), { minLength: 1, maxLength: 40 }),
        fc.array(fc.constantFrom(' ', '  ', '\n', '\t'), { minLength: 0, maxLength: 40 }),
        (toks, seps) => {
          // Ghép token + khoảng trắng xen kẽ (không comment) rồi tokenize lại.
          let src = '';
          for (let i = 0; i < toks.length; i++) {
            src += toks[i] ?? '';
            if (i < toks.length - 1) src += seps[i % seps.length] ?? ' ';
          }
          const { tokens, diagnostics } = tokenizeScl(src, 'T.scl');
          expect(diagnostics).toEqual([]);
          const joined = tokens.map((t) => t.image).join('');
          const stripped = src.replace(/\s+/g, '');
          expect(joined).toBe(stripped);
        },
      ),
      { seed: 20261125, numRuns: 200 },
    );
  });
});
