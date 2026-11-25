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
// P1.4 — interpreter + SoftPlc (M1 §7–§8, §10).
export { FaultCollector } from './faults.js';
export type { RuntimeFault, RuntimeFaultCode } from './faults.js';
export {
  wrapInt16,
  wrapInt32,
  wrapUnsigned,
  roundHalfEven,
  convertChecked,
  intBinary,
  shiftOp,
} from './arithmetic.js';
export { createIntrinsicRegistry } from './intrinsics.js';
export type { IntrinsicFn, IntrinsicRegistry } from './intrinsics.js';
export { buildTagAddressMap, parsePlcRef, canonicalRef } from './tagmap.js';
export type { TagAddr, TagAddressMap, ParsedRef } from './tagmap.js';
export { Interpreter, createFrame, initDbStore } from './interpreter.js';
export type {
  Frame,
  Ref,
  DbView,
  LocalValue,
  CompiledBlock,
  SysCallHandler,
  PlcMemory,
} from './interpreter.js';
export { SoftPlc } from './softplc.js';
export type { SoftPlcConfig, ScanInfo, SoftPlcSnapshot } from './softplc.js';
export { softPlcExtension } from './extension.js';
