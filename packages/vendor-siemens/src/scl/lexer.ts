// Lexer SCL — @vcs/vendor-siemens (M1 §4.1).
// Token Chevrotain; `tokenizeScl` trả token thuần (SclToken) + diagnostics SCL-L001.
// Lexer không biết grammar: comment/ký tự lạ chỉ thành diagnostic, không ném.
// Từ khóa không phân biệt hoa/thường (regex flag `i` — Chevrotain 13 bỏ `ignoreCase`).

import {
  createToken,
  Lexer,
  type CustomPatternMatcherReturn,
  type IToken,
  type TokenType,
} from 'chevrotain';
import type { DataType, Diagnostic } from '@vcs/schemas';
import { diag, SCL_CATALOG } from '@vcs/schemas';

export interface SclToken {
  readonly type: string; // tên token type (vd 'If', 'Semicolon', 'IntLiteral')
  readonly image: string; // text gốc
  readonly line: number;
  readonly col: number;
  readonly endLine: number; // endCol là exclusive: cột ngay sau ký tự cuối (như yaml.ts)
  readonly endCol: number;
  readonly offset: number;
  readonly length: number;
}

export interface TokenizeResult {
  tokens: SclToken[];
  diagnostics: Diagnostic[];
}

// `Identifier` khai trước để từ khóa dùng làm `longer_alt` (xem dưới).
const Identifier = createToken({
  name: 'Identifier',
  pattern: /[A-Za-z_][A-Za-z0-9_]*/,
  label: "'identifier'",
});

function keyword(name: string, image: string): TokenType {
  // Chevrotain 13 không còn `ignoreCase` trong ITokenConfig — dùng regex flag `i`.
  // `image` chỉ gồm chữ cái + `_` nên không cần escape.
  // Lexer Chevrotain là first-match theo thứ tự khai báo (KHÔNG phải longest-match):
  // từ khóa cần `longer_alt: Identifier` để `IFX` thành một Ident, không phải `IF` + `X`.
  return createToken({
    name,
    pattern: new RegExp(image, 'i'),
    label: `'${image}'`,
    longer_alt: Identifier,
  });
}

function punct(name: string, image: string): TokenType {
  return createToken({ name, pattern: image, label: `'${image}'` });
}

// --- Từ khóa (không phân biệt hoa/thường) ---
const OrganizationBlock = keyword('OrganizationBlock', 'ORGANIZATION_BLOCK');
const EndOrganizationBlock = keyword('EndOrganizationBlock', 'END_ORGANIZATION_BLOCK');
const FunctionKw = keyword('Function', 'FUNCTION');
const EndFunction = keyword('EndFunction', 'END_FUNCTION');
const FunctionBlock = keyword('FunctionBlock', 'FUNCTION_BLOCK');
const EndFunctionBlock = keyword('EndFunctionBlock', 'END_FUNCTION_BLOCK');
const Type = keyword('Type', 'TYPE');
const EndType = keyword('EndType', 'END_TYPE');
const DataBlock = keyword('DataBlock', 'DATA_BLOCK');
const EndDataBlock = keyword('EndDataBlock', 'END_DATA_BLOCK');
const Struct = keyword('Struct', 'STRUCT');
const EndStruct = keyword('EndStruct', 'END_STRUCT');
const Begin = keyword('Begin', 'BEGIN');
const VarInput = keyword('VarInput', 'VAR_INPUT');
const VarOutput = keyword('VarOutput', 'VAR_OUTPUT');
const VarInOut = keyword('VarInOut', 'VAR_IN_OUT');
const Var = keyword('Var', 'VAR');
const VarTemp = keyword('VarTemp', 'VAR_TEMP');
const VarConstant = keyword('VarConstant', 'VAR_CONSTANT');
const EndVar = keyword('EndVar', 'END_VAR');
const If = keyword('If', 'IF');
const Then = keyword('Then', 'THEN');
const Elsif = keyword('Elsif', 'ELSIF');
const Else = keyword('Else', 'ELSE');
const EndIf = keyword('EndIf', 'END_IF');
const Case = keyword('Case', 'CASE');
const Of = keyword('Of', 'OF');
const EndCase = keyword('EndCase', 'END_CASE');
const For = keyword('For', 'FOR');
const To = keyword('To', 'TO');
const By = keyword('By', 'BY');
const Do = keyword('Do', 'DO');
const EndFor = keyword('EndFor', 'END_FOR');
const While = keyword('While', 'WHILE');
const EndWhile = keyword('EndWhile', 'END_WHILE');
const Repeat = keyword('Repeat', 'REPEAT');
const Until = keyword('Until', 'UNTIL');
const EndRepeat = keyword('EndRepeat', 'END_REPEAT');
const Exit = keyword('Exit', 'EXIT');
const Continue = keyword('Continue', 'CONTINUE');
const Return = keyword('Return', 'RETURN');
const ArrayKw = keyword('Array', 'ARRAY');
const And = keyword('And', 'AND');
const Or = keyword('Or', 'OR');
const Xor = keyword('Xor', 'XOR');
const Not = keyword('Not', 'NOT');
const Mod = keyword('Mod', 'MOD');
const Div = keyword('Div', 'DIV');

// --- Literal / định danh ---
const BoolLiteral = createToken({
  name: 'BoolLiteral',
  pattern: /(?:TRUE|FALSE)/i,
  label: "'boolean literal'",
  // Như từ khóa: `TRUEE` phải thành Ident, không phải BoolLiteral + `E`.
  longer_alt: Identifier,
});
const TimeLiteral = createToken({
  name: 'TimeLiteral',
  // T#5s, T#1h30m, T#500ms, T#-2s, TIME#2s, T#1.5s (đơn vị d/h/m/s/ms).
  pattern: /(?:T|TIME)#-?(?:\d+(?:\.\d+)?(?:ms|[hmsd]))+/i,
  label: "'time literal'",
});
const TypedLiteral = createToken({
  name: 'TypedLiteral',
  // INT#5, DINT#-1, REAL#1.0, WORD#16#FFFF, BOOL#TRUE — một token duy nhất.
  // TIME/T không nằm đây (đã có TimeLiteral); String không có literal.
  pattern:
    /(?:INT|DINT|SINT|USINT|UINT|UDINT|REAL|LREAL|WORD|DWORD|BYTE|BOOL)#[+-]?(?:16#[0-9A-Fa-f_]+|2#[01_]+|8#[0-7_]+|\d[\d_]*(?:\.\d[\d_]*(?:[eE][+-]?\d[\d_]*)?|[eE][+-]?\d[\d_]*)?|TRUE|FALSE)/i,
  label: "'typed literal'",
});
const BadTimeLiteral = createToken({
  name: 'BadTimeLiteral',
  // T#/TIME# với đơn vị lạ hoặc thiếu đơn vị (vd T#5x, T#5) — OQ-097 → SCL-L001.
  // Phải đứng SAU TimeLiteral (cùng độ dài thì token khai trước thắng).
  pattern: /(?:T|TIME)#-?[\w.]+/i,
  label: "'bad time literal'",
});
const IntLiteral = createToken({
  name: 'IntLiteral',
  pattern: /(?:16#[0-9A-Fa-f_]+|2#[01_]+|8#[0-7_]+|\d[\d_]*)/,
  label: "'integer literal'",
});
const RealLiteral = createToken({
  name: 'RealLiteral',
  // Yêu cầu chữ số sau '.' (nên 1..3 → 1, .., 3 — không phải Real '1.').
  pattern: /(?:\d[\d_]*\.\d[\d_]*(?:[eE][+-]?\d[\d_]*)?|\d[\d_]*[eE][+-]?\d[\d_]*)/,
  label: "'real literal'",
});
const AbsAddress = createToken({
  name: 'AbsAddress',
  // %I0.0, %IB10, %IW64, %ID20 (tương tự Q/M), DB1.DBW4, DB1.DBX0.0.
  // Không phân biệt hoa/thường (OQ-085); trước Ident để DB1.DBW4 không bị cắt.
  pattern: /%[IQM][BWD]?\d+(?:\.\d+)?|DB\d+\.DB[XBWD]\d+(?:\.\d+)?/i,
  label: "'absolute address'",
});
const LocalVar = createToken({
  name: 'LocalVar',
  pattern: /#[A-Za-z_][A-Za-z0-9_]*/,
  label: "'#local name'",
});
const GlobalVar = createToken({
  name: 'GlobalVar',
  pattern: /"[^"\r\n]*"/,
  label: "'\"global name\"'",
});

// --- Toán tử / dấu tách (nhiều ký tự trước một ký tự: := trước :, ** trước *) ---
const ColonEquals = punct('ColonEquals', ':=');
const Power = punct('Power', '**');
const NotEquals = punct('NotEquals', '<>');
const LessEquals = punct('LessEquals', '<=');
const GreaterEquals = punct('GreaterEquals', '>=');
const DotDot = punct('DotDot', '..');
const Arrow = punct('Arrow', '=>');
const Semicolon = punct('Semicolon', ';');
const Colon = punct('Colon', ':');
const Comma = punct('Comma', ',');
const Dot = punct('Dot', '.');
const LParen = punct('LParen', '(');
const RParen = punct('RParen', ')');
const LBracket = punct('LBracket', '[');
const RBracket = punct('RBracket', ']');
const Plus = punct('Plus', '+');
const Minus = punct('Minus', '-');
const Star = punct('Star', '*');
const Slash = punct('Slash', '/');
const Equals = punct('Equals', '=');
const Less = punct('Less', '<');
const Greater = punct('Greater', '>');
const Ampersand = punct('Ampersand', '&');

// --- Comment ---
const LineComment = createToken({
  name: 'LineComment',
  pattern: /\/\/[^\r\n]*/,
  group: Lexer.SKIPPED,
});
const White = createToken({
  name: 'White',
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});
const BlockComment = createToken({
  name: 'BlockComment',
  label: "'(* comment *)'",
  // Không lồng (OQ-096): khớp tới `*)` đầu tiên. Không đóng → payload { closed: false },
  // tokenizeScl báo SCL-L001 tại vị trí `(*`.
  // Comment có thể nhiều dòng → line_breaks để lexer đếm dòng đúng.
  line_breaks: true,
  pattern: (text: string, offset: number): CustomPatternMatcherReturn | null => {
    if (!text.startsWith('(*', offset)) return null;
    const end = text.indexOf('*)', offset + 2);
    const result: CustomPatternMatcherReturn =
      end === -1 ? [text.slice(offset)] : [text.slice(offset, end + 2)];
    result.payload = { closed: end !== -1 };
    return result;
  },
});
const StrayCommentEnd = createToken({
  name: 'StrayCommentEnd',
  // `*)` thừa (từ comment lồng, OQ-096) → SCL-L001, bỏ token.
  pattern: /\*\)/,
  label: "'*)'",
});

// Thứ tự = thứ tự ưu tiên first-match của Chevrotain (KHÔNG phải longest-match).
// Quy tắc: token dài hơn / cụ thể hơn đứng trước token ngắn hơn có thể khớp
// tiền tố của nó (LineComment trước Slash, RealLiteral trước IntLiteral,
// DotDot trước Dot, ** trước *, := trước :, <=/>=/<> trước </>/=, từ khóa
// trước Ident, TimeLiteral trước BadTimeLiteral, AbsAddress trước Ident).
// Thứ tự từ khóa dài-trước-ngắn (EndFunctionBlock < FunctionBlock < EndFunction
// < Function, VarInput… < Var, EndIf < If, …) là để qua check tĩnh "unreachable
// pattern" của Chevrotain (regex trước `exec` được lên source của token sau).
const allTokens: TokenType[] = [
  BlockComment,
  LineComment,
  StrayCommentEnd,
  EndOrganizationBlock,
  OrganizationBlock,
  EndFunctionBlock,
  FunctionBlock,
  EndFunction,
  FunctionKw,
  EndType,
  Type,
  EndDataBlock,
  DataBlock,
  EndStruct,
  Struct,
  Begin,
  VarInput,
  VarOutput,
  VarInOut,
  VarTemp,
  VarConstant,
  EndVar,
  Var,
  EndIf,
  If,
  Then,
  Elsif,
  Else,
  EndCase,
  Case,
  Of,
  EndFor,
  For,
  To,
  By,
  Do,
  EndWhile,
  While,
  EndRepeat,
  Repeat,
  Until,
  Exit,
  Continue,
  Return,
  ArrayKw,
  And,
  Xor,
  Or,
  Not,
  Mod,
  Div,
  BoolLiteral,
  TimeLiteral,
  TypedLiteral,
  BadTimeLiteral,
  RealLiteral,
  IntLiteral,
  AbsAddress,
  LocalVar,
  GlobalVar,
  Identifier,
  ColonEquals,
  Power,
  NotEquals,
  LessEquals,
  GreaterEquals,
  DotDot,
  Arrow,
  Semicolon,
  Colon,
  Comma,
  Dot,
  LParen,
  RParen,
  LBracket,
  RBracket,
  Plus,
  Minus,
  Star,
  Slash,
  Equals,
  Less,
  Greater,
  Ampersand,
  White,
];

/** Toàn bộ token type SCL (parser dùng cho CONSUME/LA). */
export const SclTokens = {
  OrganizationBlock,
  EndOrganizationBlock,
  Function: FunctionKw,
  EndFunction,
  FunctionBlock,
  EndFunctionBlock,
  Type,
  EndType,
  DataBlock,
  EndDataBlock,
  Struct,
  EndStruct,
  Begin,
  VarInput,
  VarOutput,
  VarInOut,
  Var,
  VarTemp,
  VarConstant,
  EndVar,
  If,
  Then,
  Elsif,
  Else,
  EndIf,
  Case,
  Of,
  EndCase,
  For,
  To,
  By,
  Do,
  EndFor,
  While,
  EndWhile,
  Repeat,
  Until,
  EndRepeat,
  Exit,
  Continue,
  Return,
  Array: ArrayKw,
  And,
  Or,
  Xor,
  Not,
  Mod,
  Div,
  BoolLiteral,
  TimeLiteral,
  TypedLiteral,
  BadTimeLiteral,
  RealLiteral,
  IntLiteral,
  AbsAddress,
  LocalVar,
  GlobalVar,
  Identifier,
  ColonEquals,
  Power,
  NotEquals,
  LessEquals,
  GreaterEquals,
  DotDot,
  Arrow,
  Semicolon,
  Colon,
  Comma,
  Dot,
  LParen,
  RParen,
  LBracket,
  RBracket,
  Plus,
  Minus,
  Star,
  Slash,
  Equals,
  Less,
  Greater,
  Ampersand,
  LineComment,
  BlockComment,
  StrayCommentEnd,
  White,
} as const;

const sclLexer = new Lexer(allTokens);

/** Vị trí của một IToken (endCol exclusive). Token nhiều dòng (comment) tính đúng endLine. */
export function locOfToken(t: IToken): {
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  offset: number;
  length: number;
} {
  const line = t.startLine ?? 1;
  const col = t.startColumn ?? 1;
  const image = t.image;
  const lastNewline = image.lastIndexOf('\n');
  if (lastNewline === -1) {
    return { line, col, endLine: line, endCol: col + image.length, offset: t.startOffset, length: image.length };
  }
  const lines = image.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
  return {
    line,
    col,
    endLine: line + lines.length - 1,
    endCol: lastLine.length + 1,
    offset: t.startOffset,
    length: image.length,
  };
}

function toSclToken(t: IToken): SclToken {
  const loc = locOfToken(t);
  return { type: t.tokenType.name, image: t.image, ...loc };
}

function l001(fileName: string, message: string, t: IToken): Diagnostic {
  const loc = locOfToken(t);
  return diag('SCL-L001', 'error', message, { file: fileName, ...loc }, SCL_CATALOG.get('SCL-L001')?.hint);
}

/** Payload của token BlockComment (đọc có kiểm kiểu — `IToken.payload` là `any`). */
function blockCommentPayload(t: IToken): { closed: boolean } | undefined {
  const payload: unknown = (t as { payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return undefined;
  if (!('closed' in payload) || typeof payload.closed !== 'boolean') return undefined;
  return { closed: payload.closed };
}

export interface RawTokenizeResult {
  tokens: IToken[];
  diagnostics: Diagnostic[];
}

/**
 * Tokenize nội bộ (parser dùng): trả IToken của Chevrotain (đã lọc comment),
 * kèm diagnostics SCL-L001. Không export ra ngoài package.
 */
export function tokenizeSclRaw(source: string, fileName: string): RawTokenizeResult {
  const lexResult = sclLexer.tokenize(source);
  const diagnostics: Diagnostic[] = [];
  for (const e of lexResult.errors) {
    const ch = source.slice(e.offset, e.offset + e.length);
    const line = e.line ?? 1;
    const col = e.column ?? 1;
    diagnostics.push(
      diag(
        'SCL-L001',
        'error',
        `ký tự không hợp lệ: '${ch}'`,
        { file: fileName, line, col, endLine: line, endCol: col + e.length },
        SCL_CATALOG.get('SCL-L001')?.hint,
      ),
    );
  }
  const tokens: IToken[] = [];
  for (const t of lexResult.tokens) {
    if (t.tokenType === BlockComment) {
      if (blockCommentPayload(t)?.closed === false) {
        diagnostics.push(l001(fileName, 'comment không đóng', t));
      }
      continue;
    }
    if (t.tokenType === StrayCommentEnd) {
      diagnostics.push(l001(fileName, 'dấu *) thừa — comment (* *) không lồng', t));
      continue;
    }
    if (t.tokenType === BadTimeLiteral) {
      diagnostics.push(l001(fileName, `time literal không hợp lệ: '${t.image}'`, t));
      continue;
    }
    tokens.push(t);
  }
  return { tokens, diagnostics };
}

/** Tokenize công khai: token thuần (không lộ kiểu Chevrotain) + diagnostics SCL-L001. */
export function tokenizeScl(source: string, fileName: string): TokenizeResult {
  const { tokens, diagnostics } = tokenizeSclRaw(source, fileName);
  return { tokens: tokens.map(toSclToken), diagnostics };
}

const TIME_UNIT_MS: Record<string, number> = { d: 86400000, h: 3600000, m: 60000, s: 1000, ms: 1 };

const CANONICAL_TYPES: Record<string, DataType> = {
  bool: 'Bool',
  byte: 'Byte',
  word: 'Word',
  dword: 'DWord',
  sint: 'SInt',
  usint: 'USInt',
  uint: 'UInt',
  udint: 'UDInt',
  int: 'Int',
  dint: 'DInt',
  real: 'Real',
  lreal: 'LReal',
  time: 'Time',
  string: 'String',
};

function parseIntLiteral(raw: string): number {
  const text = raw.replaceAll('_', '');
  const hash = text.indexOf('#');
  if (hash === -1) {
    const n = Number.parseInt(text, 10);
    if (Number.isNaN(n)) throw new Error(`int literal không hợp lệ: '${raw}'`);
    return n;
  }
  const base = Number.parseInt(text.slice(0, hash), 10);
  if (base !== 2 && base !== 8 && base !== 16) {
    throw new Error(`cơ số không hỗ trợ: '${raw}'`);
  }
  const n = Number.parseInt(text.slice(hash + 1), base);
  if (Number.isNaN(n)) throw new Error(`int literal không hợp lệ: '${raw}'`);
  return n;
}

function parseTimeLiteral(raw: string): number {
  const m = /^(?:T|TIME)#(-?)(.*)$/i.exec(raw);
  if (m === null || m[2] === undefined || m[2] === '') {
    throw new Error(`time literal không hợp lệ: '${raw}'`);
  }
  const sign = m[1] === '-' ? -1 : 1;
  const body = m[2];
  let total = 0;
  let consumed = 0;
  const re = /(\d+(?:\.\d+)?)(ms|[hmsd])/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    if (match.index !== consumed) throw new Error(`time literal không hợp lệ: '${raw}'`);
    const amount = Number(match[1]);
    const unit = (match[2] ?? '').toLowerCase();
    const mult = TIME_UNIT_MS[unit];
    if (mult === undefined) throw new Error(`đơn vị time không hỗ trợ: '${unit}'`);
    total += amount * mult;
    consumed = match.index + match[0].length;
  }
  if (consumed !== body.length) throw new Error(`time literal không hợp lệ: '${raw}'`);
  return sign * total;
}

/** Giá trị của phần sau `#` trong typed literal (số / bool / số có cơ số). */
function parseTypedValue(text: string): number | boolean {
  const upper = text.toUpperCase();
  if (upper === 'TRUE') return true;
  if (upper === 'FALSE') return false;
  if (text.includes('#')) return parseIntLiteral(text);
  const n = Number(text.replaceAll('_', ''));
  if (Number.isNaN(n)) throw new Error(`giá trị typed literal không hợp lệ: '${text}'`);
  return n;
}

/**
 * Chuyển text literal → giá trị (bảng A2). Real giữ double JS (ép `fround`
 * là việc của interpreter P1.4); Time = ms nguyên. Sai → throw Error.
 */
export function parseLiteralValue(
  raw: string,
  kind: 'int' | 'real' | 'bool' | 'time' | 'typed',
): { value: number | boolean; type?: DataType } {
  switch (kind) {
    case 'int':
      return { value: parseIntLiteral(raw) };
    case 'real': {
      const n = Number(raw.replaceAll('_', ''));
      if (Number.isNaN(n)) throw new Error(`real literal không hợp lệ: '${raw}'`);
      return { value: n };
    }
    case 'bool': {
      const upper = raw.toUpperCase();
      if (upper === 'TRUE') return { value: true };
      if (upper === 'FALSE') return { value: false };
      throw new Error(`bool literal không hợp lệ: '${raw}'`);
    }
    case 'time':
      return { value: parseTimeLiteral(raw) };
    case 'typed': {
      const hash = raw.indexOf('#');
      if (hash === -1) throw new Error(`typed literal không hợp lệ: '${raw}'`);
      const type = CANONICAL_TYPES[raw.slice(0, hash).toLowerCase()];
      if (type === undefined) {
        throw new Error(`kiểu không hỗ trợ trong typed literal: '${raw.slice(0, hash)}'`);
      }
      return { value: parseTypedValue(raw.slice(hash + 1)), type };
    }
  }
}
