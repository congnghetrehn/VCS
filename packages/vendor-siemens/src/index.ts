// @vcs/vendor-siemens — P1.1 (M1 §3.3: địa chỉ tuyệt đối), P1.2 (M1 §4: lexer + parser SCL).
export { parseAddress, formatAddress } from './address.js';
export type { AbsAddress } from './address.js';
export { parseScl, SclParser, MAX_SCL_DIAGNOSTICS } from './scl/parser.js';
export type { ParseResult } from './scl/parser.js';
export { tokenizeScl, parseLiteralValue } from './scl/lexer.js';
export type { SclToken, TokenizeResult } from './scl/lexer.js';
export type {
  SrcLoc,
  SclFile,
  SclBlock,
  ObBlock,
  FcBlock,
  FbBlock,
  UdtBlock,
  DbBlock,
  VarSection,
  VarDecl,
  SclType,
  SclStmt,
  AssignStmt,
  SclAssign,
  IfStmt,
  CaseStmt,
  SclCaseLabel,
  ForStmt,
  WhileStmt,
  RepeatStmt,
  ExitStmt,
  ContinueStmt,
  ReturnStmt,
  CallStmt,
  EmptyStmt,
  SclExpr,
  LiteralExpr,
  RefExpr,
  UnaryExpr,
  BinaryExpr,
  CallExpr,
  SclLValue,
  SclRef,
  SclPathElem,
  SclCallArg,
  SclLiteral,
} from './scl/ast.js';
export { locFrom } from './scl/ast.js';
