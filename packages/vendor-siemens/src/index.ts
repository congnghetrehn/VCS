// @vcs/vendor-siemens — P1.1 (M1 §3.3: địa chỉ tuyệt đối), P1.2 (M1 §4: lexer + parser SCL), P1.3 (typecheck + lower + compile).
export { parseAddress, formatAddress } from './address.js';
export type { AbsAddress } from './address.js';
export { parseScl, SclParser, MAX_SCL_DIAGNOSTICS } from './scl/parser.js';
export type { ParseResult } from './scl/parser.js';
export { tokenizeScl, parseLiteralValue } from './scl/lexer.js';
export type { SclToken, TokenizeResult } from './scl/lexer.js';
export {
  typecheckFile,
  emptyCrossFileTables,
  // Đại số kiểu thuần (lower dùng chung, không nhân đôi — P1.3 §18 mục 2).
  widen,
  commonType,
  binaryResultType,
  unaryResultType,
  evalConst,
  classifyIntrinsic,
  convertModeFor,
  sclTypeToIrType,
  intrinsicArgTarget,
  interfaceFromSymbols,
  irTypeToFieldType,
  layoutIrFields,
  isPrimitive,
  irTypeEquals,
  isStrictInteger,
} from './scl/typecheck.js';
export type {
  Section,
  SymbolInfo,
  BlockSymbols,
  TypecheckResult,
  CrossFileTables,
  IntrinsicInfo,
  LayoutFieldDecl,
} from './scl/typecheck.js';
export { lowerFile, obNumber } from './scl/lower.js';
export { compileScl, compileSclProgram, createCompileContext, irToJson } from './scl/compile.js';
export type { CompileContext } from './scl/compile.js';
export type {
  IrProgram,
  IrBlock,
  IrStmt,
  IrExpr,
  IrLValue,
  IrType,
  PrimitiveType,
  BinFn,
  IrInterface,
  IrVar,
  IrField,
  IrDb,
  IrUdt,
  IrObBinding,
  SrcRef,
} from '@vcs/runtime-iec';
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
