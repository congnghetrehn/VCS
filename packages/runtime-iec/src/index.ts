// @vcs/runtime-iec — P1.1 (M1 §3: kiểu, bộ nhớ, layout).
export { TYPE_INFO, sizeOf, isIntegerType, isFloatType, isBitStringType } from './types.js';
export type { TypeInfo } from './types.js';
export { MemoryArea, DbStore } from './memory.js';
export type { MemoryScalarType } from './memory.js';
export { layoutStruct } from './layout.js';
export type { FieldType, FieldDecl, FieldInfo, StructLayout } from './layout.js';
export type {
  PrimitiveType,
  IrType,
  IrField,
  IrVar,
  IrInterface,
  SrcRef,
  IrBlock,
  IrDb,
  IrUdt,
  IrObBinding,
  IrProgram,
  BinFn,
  IrExpr,
  IrLValue,
  IrStmt,
} from './ir.js';
