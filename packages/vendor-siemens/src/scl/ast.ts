// AST SCL — @vcs/vendor-siemens (M1 §4.2).
// Cây thuần (plain object, serializable JSON); mọi node có `loc`.
// `loc` là nửa khoảng [start, end): endCol = cột ngay sau ký tự cuối (như yaml.ts).
// Tên kiểu trong `elementary` giữ nguyên text viết trong code (P1.3 chuẩn hóa);
// tên UDT chưa biết giữ dạng `named` (parser không kiểm tra tên kiểu tồn tại,
// trừ String/WString → SCL-U001, OQ-102).

import type { AbsAddress } from '../address.js';

export interface SrcLoc {
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  offset: number;
  length: number;
}

/** Hợp hai vị trí: từ đầu của `first` tới cuối của `last`. */
export function locFrom(first: SrcLoc, last: SrcLoc): SrcLoc {
  return {
    line: first.line,
    col: first.col,
    endLine: last.endLine,
    endCol: last.endCol,
    offset: first.offset,
    length: last.offset + last.length - first.offset,
  };
}

export type SclFile = { kind: 'file'; blocks: SclBlock[]; loc: SrcLoc };
export type SclBlock = ObBlock | FcBlock | FbBlock | UdtBlock | DbBlock;

export interface ObBlock {
  kind: 'OB';
  name: string;
  varSections: VarSection[];
  body: SclStmt[];
  loc: SrcLoc;
}
export interface FcBlock {
  kind: 'FC';
  name: string;
  returnType?: SclType;
  varSections: VarSection[];
  body: SclStmt[];
  loc: SrcLoc;
}
export interface FbBlock {
  kind: 'FB';
  name: string;
  varSections: VarSection[];
  body: SclStmt[];
  loc: SrcLoc;
}
export interface UdtBlock {
  kind: 'UDT';
  name: string;
  fields: VarDecl[];
  loc: SrcLoc;
}
export interface DbBlock {
  kind: 'DB';
  name: string;
  fbName?: string; // DATA_BLOCK name "fbname" (không có STRUCT)
  fields?: VarDecl[]; // DATA_BLOCK name STRUCT ... END_STRUCT
  init?: SclAssign[]; // DATA_BLOCK ... BEGIN { init } (OQ-093)
  loc: SrcLoc;
}

export interface VarSection {
  kind: 'VAR_INPUT' | 'VAR_OUTPUT' | 'VAR_IN_OUT' | 'VAR' | 'VAR_TEMP' | 'VAR_CONSTANT';
  decls: VarDecl[];
  loc: SrcLoc;
}

export interface VarDecl {
  name: string;
  type: SclType;
  init?: SclExpr; // const_expr (OQ-094: parse như expr, tính hằng kiểm ở P1.3)
  loc: SrcLoc;
}

export type SclType =
  | { kind: 'elementary'; name: string; loc: SrcLoc } // tên kiểu viết trong code ('Int', 'Bool', ...)
  | { kind: 'array'; lo: number; hi: number; elem: SclType; loc: SrcLoc }
  | { kind: 'struct'; fields: VarDecl[]; loc: SrcLoc } // struct nội tuyến (OQ-104)
  | { kind: 'named'; name: string; loc: SrcLoc }; // tên UDT/kiểu chưa phân giải — P1.3 phân giải

export type SclStmt =
  | AssignStmt
  | IfStmt
  | CaseStmt
  | ForStmt
  | WhileStmt
  | RepeatStmt
  | ExitStmt
  | ContinueStmt
  | ReturnStmt
  | CallStmt
  | EmptyStmt;

export interface AssignStmt {
  kind: 'assign';
  target: SclLValue;
  value: SclExpr;
  loc: SrcLoc;
}
/** Gán khởi tạo trong DB (OQ-093) — cùng hình với AssignStmt. */
export type SclAssign = AssignStmt;

export interface IfStmt {
  kind: 'if';
  cond: SclExpr;
  then: SclStmt[];
  elsif: { cond: SclExpr; body: SclStmt[]; loc: SrcLoc }[];
  else?: SclStmt[];
  loc: SrcLoc;
}

export type SclCaseLabel =
  | SclExpr
  | { kind: 'range'; lo: SclExpr; hi: SclExpr; loc: SrcLoc };

export interface CaseStmt {
  kind: 'case';
  sel: SclExpr;
  arms: { labels: SclCaseLabel[]; body: SclStmt[]; loc: SrcLoc }[];
  else?: SclStmt[];
  loc: SrcLoc;
}

export interface ForStmt {
  kind: 'for';
  var: SclLValue;
  from: SclExpr;
  to: SclExpr;
  by?: SclExpr;
  body: SclStmt[];
  loc: SrcLoc;
}

export interface WhileStmt {
  kind: 'while';
  cond: SclExpr;
  body: SclStmt[];
  loc: SrcLoc;
}

export interface RepeatStmt {
  kind: 'repeat';
  body: SclStmt[];
  until: SclExpr;
  loc: SrcLoc;
}

export interface ExitStmt {
  kind: 'exit';
  loc: SrcLoc;
}
export interface ContinueStmt {
  kind: 'continue';
  loc: SrcLoc;
}
export interface ReturnStmt {
  kind: 'return';
  loc: SrcLoc;
}

export interface CallStmt {
  kind: 'call';
  callee: SclRef | { kind: 'ident'; name: string; loc: SrcLoc };
  args: SclCallArg[];
  loc: SrcLoc;
}

export interface EmptyStmt {
  kind: 'empty';
  loc: SrcLoc;
}

export type SclExpr = LiteralExpr | RefExpr | UnaryExpr | BinaryExpr | CallExpr;

export interface LiteralExpr {
  kind: 'literal';
  literal: SclLiteral;
  loc: SrcLoc;
}
export interface RefExpr {
  kind: 'ref';
  ref: SclLValue;
  loc: SrcLoc;
}
export interface UnaryExpr {
  kind: 'unary';
  op: '+' | '-' | 'NOT';
  operand: SclExpr;
  loc: SrcLoc;
}
export interface BinaryExpr {
  kind: 'binary';
  op: string; // '+', '-', '*', '/', 'MOD', 'DIV', '=', '<>', '<', '>', '<=', '>=', 'AND', 'XOR', 'OR', '**'
  left: SclExpr;
  right: SclExpr;
  loc: SrcLoc;
}
export interface CallExpr {
  kind: 'call';
  callee: { kind: 'ident'; name: string; loc: SrcLoc } | SclRef;
  args: SclCallArg[];
  loc: SrcLoc;
}

export type SclLValue = { base: SclRef; path: SclPathElem[]; loc: SrcLoc };

export type SclRef =
  | { kind: 'local'; name: string; loc: SrcLoc } // #name
  | { kind: 'global'; name: string; loc: SrcLoc } // "Name"
  | { kind: 'abs'; address: AbsAddress; raw: string; loc: SrcLoc }; // %I0.0, DB1.DBW4

export type SclPathElem =
  | { kind: 'member'; name: string; loc: SrcLoc }
  | { kind: 'index'; index: SclExpr; loc: SrcLoc };

export type SclCallArg =
  | { kind: 'named'; name: string; value: SclExpr; loc: SrcLoc }
  | { kind: 'namedOut'; name: string; target: SclLValue; loc: SrcLoc } // Q => #y
  | { kind: 'positional'; value: SclExpr; loc: SrcLoc };

export type SclLiteral = {
  kind: 'int' | 'real' | 'bool' | 'time';
  value: number | boolean;
  raw: string;
  type?: string; // typed literal: tên kiểu chuẩn hóa ('Int', 'Word', ...) — parseLiteralValue
  loc: SrcLoc;
};
