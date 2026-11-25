// Testkit dựng IR bằng tay cho test runtime-iec (P1.4).
// CHỈ DÙNG CHO TEST — không export từ `index.ts` (runtime-iec không import
// được `vendor-siemens` nên test không dùng `compileSclProgram` ở đây;
// pipeline thật SCL→IR→SoftPlc được test ở vendor-siemens).

import type {
  BinFn,
  IrBlock,
  IrDb,
  IrExpr,
  IrField,
  IrInterface,
  IrLValue,
  IrObBinding,
  IrProgram,
  IrStmt,
  IrType,
  IrVar,
  PrimitiveType,
} from './ir.js';
import { layoutStruct, type FieldDecl, type FieldType } from './layout.js';
import { sizeOf } from './types.js';

/** Chuyển IrType → FieldType (cho layoutStruct). */
function irTypeToFieldType(t: IrType): FieldType {
  if (typeof t === 'string') return { kind: 'elem', type: t };
  if (t.kind === 'array') {
    return { kind: 'array', elem: irTypeToFieldType(t.elem), lo: t.lo, hi: t.hi };
  }
  return {
    kind: 'struct',
    ...(t.name !== undefined ? { name: t.name } : {}),
    fields: t.fields.map((f) => ({ name: f.name, type: irTypeToFieldType(f.type) })),
  };
}

/** Kiểu struct IrType từ danh sách khai báo (layout theo §3.4). */
export function structType(name: string, decls: { name: string; type: IrType }[]): IrType {
  const layout = layoutStruct(decls.map((d) => ({ name: d.name, type: irTypeToFieldType(d.type) })));
  return {
    kind: 'struct',
    name,
    fields: layout.fields.map((f) => ({
      name: f.name,
      type: decls.find((d) => d.name === f.name)?.type as IrType,
      byteOffset: f.byteOffset,
      ...(f.bitOffset !== undefined ? { bitOffset: f.bitOffset } : {}),
      size: f.size,
    })),
  };
}

/** IrDb từ danh sách khai báo (hỗ trợ struct/array lồng — khác dbForFb chỉ scalar). */
export function dbFromDecls(
  dbName: string,
  decls: { name: string; type: IrType; init?: number | boolean }[],
  fbName?: string,
): IrDb {
  const byName = new Map(decls.map((d) => [d.name, d]));
  const layout = layoutStruct(decls.map((d) => ({ name: d.name, type: irTypeToFieldType(d.type) })));
  const fields: IrField[] = layout.fields.map((f) => {
    const decl = byName.get(f.name) as { name: string; type: IrType; init?: number | boolean };
    return {
      name: f.name,
      type: decl.type,
      byteOffset: f.byteOffset,
      ...(f.bitOffset !== undefined ? { bitOffset: f.bitOffset } : {}),
      size: f.size,
      ...(decl.init !== undefined ? { init: decl.init } : {}),
    };
  });
  return {
    id: dbName.toLowerCase(),
    name: dbName,
    ...(fbName !== undefined ? { fbName } : {}),
    fields,
    size: layout.size,
  };
}
import { SoftPlc, type SoftPlcConfig } from './softplc.js';
import type { TagAddressMap } from './tagmap.js';
import { FaultCollector } from './faults.js';
import { Interpreter, initDbStore, type PlcMemory } from './interpreter.js';
import { DbStore, MemoryArea } from './memory.js';

/** Bộ nhớ PLC cho test interpreter: vùng I/Q/M 64 byte + DB theo IrDb. */
export function makeMem(dbs: IrDb[] = [], sizeBytes = 64): PlcMemory {
  const stores = new Map<string, DbStore>();
  const numbers = new Map<string, number>();
  [...dbs]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .forEach((db, idx) => {
      const store = new DbStore(idx + 1, db.size);
      initDbStore(store, db.fields, 0);
      stores.set(db.name.toLowerCase(), store);
      numbers.set(db.name.toLowerCase(), idx + 1);
    });
  return {
    i: new MemoryArea(sizeBytes),
    q: new MemoryArea(sizeBytes),
    m: new MemoryArea(sizeBytes),
    dbs: stores,
    dbNumbers: numbers,
  };
}

export function makeInterpreter(
  program: IrProgram,
  dbs: IrDb[] = [],
): { interp: Interpreter; faults: FaultCollector; mem: PlcMemory } {
  const mem = makeMem(dbs);
  const faults = new FaultCollector();
  const interp = new Interpreter(program, mem, faults);
  return { interp, faults, mem };
}

export const EMPTY_MAP: TagAddressMap = new Map();

export function num(v: number, type: PrimitiveType = 'Int'): IrExpr {
  return { op: 'const', type, value: v };
}

export function bool(v: boolean): IrExpr {
  return { op: 'const', type: 'Bool', value: v };
}

export function load(ref: IrLValue, type: IrType): IrExpr {
  return { op: 'load', type, ref };
}

export function bin(fn: BinFn, a: IrExpr, b: IrExpr, type: IrType): IrExpr {
  return { op: 'binary', fn, a, b, type };
}

export function unary(fn: 'neg' | 'not' | 'bnot', a: IrExpr, type: IrType): IrExpr {
  return { op: 'unary', fn, a, type };
}

export function convert(a: IrExpr, from: IrType, to: IrType, mode?: 'round' | 'trunc'): IrExpr {
  return { op: 'convert', from, to, a, ...(mode !== undefined ? { mode } : {}) };
}

export function intrinsic(fn: string, args: IrExpr[], type: IrType): IrExpr {
  return { op: 'intrinsic', fn, args, type };
}

export function callFcExpr(block: string, args: [string, IrExpr][], type: IrType): IrExpr {
  return { op: 'callFcExpr', block, args, type };
}

/** Width IR của ref tuyệt đối (theo lower.ts: bit → 8, còn lại = sizeOf×8). */
function widthFor(type: PrimitiveType, bit: number | undefined): 8 | 16 | 32 | 64 {
  if (bit !== undefined) return 8;
  const bytes = sizeOf(type);
  if (bytes === undefined) throw new Error(`ir-testkit: abs kiểu '${type}' không có kích thước`);
  const width = bytes * 8;
  if (width !== 8 && width !== 16 && width !== 32 && width !== 64) {
    throw new Error(`ir-testkit: width ${String(width)} không hợp lệ cho kiểu '${type}'`);
  }
  return width;
}

export function abs(area: 'I' | 'Q' | 'M', byte: number, type: PrimitiveType, bit?: number): IrLValue {
  return { k: 'abs', area, byte, ...(bit !== undefined ? { bit } : {}), width: widthFor(type, bit), type };
}

export function absDb(db: number, byte: number, type: PrimitiveType, bit?: number): IrLValue {
  return { k: 'absDb', db, byte, ...(bit !== undefined ? { bit } : {}), width: widthFor(type, bit), type };
}

export function local(name: string): IrLValue {
  return { k: 'local', name };
}

export function staticPath(path: string[]): IrLValue {
  return { k: 'static', path };
}

export function dbField(db: string, path: string[]): IrLValue {
  return { k: 'dbField', db, path };
}

export function index(base: IrLValue, indexExpr: IrExpr): IrLValue {
  return { k: 'index', base, index: indexExpr };
}

export function member(base: IrLValue, field: string): IrLValue {
  return { k: 'member', base, field };
}

export function assign(target: IrLValue, value: IrExpr): IrStmt {
  return { op: 'assign', target, value };
}

export function ifStmt(
  cond: IrExpr,
  then: IrStmt[],
  elsif: { cond: IrExpr; body: IrStmt[] }[] = [],
  elseStmts: IrStmt[] = [],
): IrStmt {
  return { op: 'if', cond, then, elsif, else: elseStmts };
}

export function caseStmt(
  sel: IrExpr,
  arms: { labels: (number | [number, number])[]; body: IrStmt[] }[],
  elseStmts: IrStmt[] = [],
): IrStmt {
  return { op: 'case', sel, arms, else: elseStmts };
}

export function forStmt(
  v: string,
  from: IrExpr,
  to: IrExpr,
  body: IrStmt[],
  by?: IrExpr,
): IrStmt {
  return { op: 'for', var: v, from, to, ...(by !== undefined ? { by } : {}), body };
}

export function whileStmt(cond: IrExpr, body: IrStmt[]): IrStmt {
  return { op: 'while', cond, body };
}

export function repeatStmt(until: IrExpr, body: IrStmt[]): IrStmt {
  return { op: 'repeat', until, body };
}

export function exitStmt(): IrStmt {
  return { op: 'exit' };
}

export function continueStmt(): IrStmt {
  return { op: 'continue' };
}

export function returnStmt(): IrStmt {
  return { op: 'return' };
}

export function callFcStmt(block: string, args: [string, IrExpr][], ret?: IrLValue): IrStmt {
  return { op: 'callFc', block, args, ...(ret !== undefined ? { ret } : {}) };
}

export function callFbStmt(
  block: string,
  instance: IrLValue,
  inArgs: [string, IrExpr][] = [],
  outArgs: [string, IrLValue][] = [],
  inoutArgs: [string, IrLValue][] = [],
): IrStmt {
  return { op: 'callFb', block, instance, inArgs, outArgs, inoutArgs };
}

export function callSysStmt(
  fn: string,
  inArgs: [string, IrExpr][] = [],
  outArgs: [string, IrLValue][] = [],
  instance?: IrLValue,
): IrStmt {
  return { op: 'callSys', fn, inArgs, outArgs, ...(instance !== undefined ? { instance } : {}) };
}

export function v(name: string, type: IrType, init?: number | boolean): IrVar {
  return { name, type, ...(init !== undefined ? { init } : {}) };
}

export function iface(
  input: IrVar[] = [],
  output: IrVar[] = [],
  inout: IrVar[] = [],
  staticVars: IrVar[] = [],
  temp: IrVar[] = [],
): IrInterface {
  return { input, output, inout, static: staticVars, temp };
}

export function obBlock(name: string, n: number, body: IrStmt[], temp: IrVar[] = []): IrBlock {
  return { id: name, kind: 'OB', name, number: n, interface: iface([], [], [], [], temp), body };
}

export function fcBlock(name: string, intf: IrInterface, body: IrStmt[], returnType?: IrType): IrBlock {
  return {
    id: name,
    kind: 'FC',
    name,
    interface: returnType !== undefined ? { ...intf, returnType } : intf,
    body,
  };
}

export function fbBlock(name: string, intf: IrInterface, body: IrStmt[]): IrBlock {
  return { id: name, kind: 'FB', name, interface: intf, body };
}

export function prog(
  blocks: IrBlock[],
  dbs: IrDb[] = [],
  organization: IrObBinding[] = [],
): IrProgram {
  return { blocks, dbs, udts: [], organization };
}

/** DB instance cho một FB (layout §3.5: input + output + IN_OUT slot 4 byte
 * (không lộ) + static; chỉ kiểu scalar). */
function elemFieldType(t: IrType): FieldType {
  if (typeof t !== 'string') {
    throw new Error('ir-testkit: dbForFb chỉ hỗ trợ field scalar');
  }
  return { kind: 'elem', type: t };
}

export function dbForFb(fbName: string, dbName: string, intf: IrInterface): IrDb {
  const vars = [...intf.input, ...intf.output, ...intf.inout, ...intf.static];
  const inoutNames = new Set(intf.inout.map((v) => v.name.toLowerCase()));
  const decls: FieldDecl[] = vars.map((varDecl) => ({
    name: varDecl.name,
    // IN_OUT: tham chiếu 4 byte nội bộ (§3.5), chiếm chỗ bằng DInt.
    type: inoutNames.has(varDecl.name.toLowerCase())
      ? { kind: 'elem', type: 'DInt' }
      : elemFieldType(varDecl.type),
  }));
  const layout = layoutStruct(decls);
  const fields: IrField[] = layout.fields
    .filter((f) => !inoutNames.has(f.name.toLowerCase()))
    .map((f) => {
      if (f.type.kind !== 'elem') {
        throw new Error('ir-testkit: dbForFb chỉ hỗ trợ field scalar');
      }
      return {
        name: f.name,
        type: f.type.type as IrType,
        byteOffset: f.byteOffset,
        ...(f.bitOffset !== undefined ? { bitOffset: f.bitOffset } : {}),
        size: f.size,
      };
    });
  return { id: dbName.toLowerCase(), name: dbName, fbName, fields, size: layout.size };
}

/** SoftPlc trực tiếp (không qua orchestrator): period 10, id PLC1. */
export function makePlc(
  program: IrProgram,
  cfg: Partial<SoftPlcConfig> & { scanPeriodMs?: number } = {},
): SoftPlc {
  return new SoftPlc(program, EMPTY_MAP, {
    id: 'PLC1',
    scanPeriodMs: 10,
    ...cfg,
  });
}

/** Chạy `n` bước orchestrator-style: step(T, dt) với T = startT, startT+dt… */
export function runSteps(plc: SoftPlc, n: number, dtMs = 10, startT = 0): void {
  for (let k = 0; k < n; k++) {
    plc.step(startT + k * dtMs, dtMs);
  }
}
