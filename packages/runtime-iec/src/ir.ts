// IR SCL — @vcs/runtime-iec (M1 §6, P1.3).
// Cây có kiểu, plain object, serializable JSON (để snapshot, golden, `vcs ir dump`).
// Mọi IrStmt/IrBlock có `src` (file/line/col/endLine/endCol, endCol exclusive —
// cùng quy ước repo, P1.2). IrExpr KHÔNG có `src` (spec §6 chỉ yêu cầu src
// trên IrStmt; lỗi ở biểu thức lấy vị trí từ AST lúc typecheck).
// Quyết định nền (OQ-106): IrProgram dùng MẢNG (blocks/dbs/udts/organization),
// sắp xếp theo id/name/ob để dump tất định — spec §6 phác `Map` nhưng đồng
// thời yêu cầu serializable JSON (`Map` stringify thành `{}`); interpreter
// P1.4 tự build index `Map` một lần lúc nạp. Struct type inline field
// (interpreter không cần tra cứu); IrProgram.udts giữ định nghĩa chuẩn.

import type { DataType } from '@vcs/schemas';

/** Kiểu nguyên thủy M1 — String không hỗ trợ (OQ-087). */
export type PrimitiveType = Exclude<DataType, 'String'>;

export type IrType =
  | PrimitiveType
  | { kind: 'array'; elem: IrType; lo: number; hi: number }
  | { kind: 'struct'; name?: string; fields: IrField[] };

export interface IrField {
  name: string;
  type: IrType;
  byteOffset: number;
  bitOffset?: number;
  /** Kích thước vùng field chiếm: byte với mọi kiểu, riêng Bool = 1 (bit) —
   * cùng quy ước layout.ts FieldInfo (P1.1). */
  size: number;
  /** Chỉ dùng cho field DB có giá trị khởi tạo (bảng D-c). */
  init?: number | boolean;
}

export interface IrVar {
  name: string;
  type: IrType;
  init?: number | boolean;
}

export interface IrInterface {
  input: IrVar[];
  output: IrVar[];
  inout: IrVar[];
  static: IrVar[];
  temp: IrVar[];
  /** Chỉ FC. */
  returnType?: IrType;
}

export interface SrcRef {
  file: string;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
}

export interface IrBlock {
  id: string;
  kind: 'OB' | 'FC' | 'FB';
  name: string;
  /** Số OB (OQ-113); FC/FB không có số trong nguồn → undefined. */
  number?: number;
  interface: IrInterface;
  body: IrStmt[];
  src?: SrcRef;
}

export interface IrDb {
  id: string;
  name: string;
  fbName?: string;
  fields: IrField[];
  size: number;
}

export interface IrUdt {
  id: string;
  name: string;
  fields: IrField[];
  size: number;
}

export interface IrObBinding {
  ob: number;
  block: string;
  cycleMs?: number;
}

export interface IrProgram {
  blocks: IrBlock[];
  dbs: IrDb[];
  udts: IrUdt[];
  organization: IrObBinding[];
}

export type BinFn =
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'
  | 'mod'
  | 'eq'
  | 'ne'
  | 'lt'
  | 'le'
  | 'gt'
  | 'ge'
  | 'and'
  | 'or'
  | 'xor';

export type IrExpr =
  | { op: 'const'; type: IrType; value: number | boolean }
  | { op: 'load'; type: IrType; ref: IrLValue }
  | { op: 'unary'; fn: 'neg' | 'not' | 'bnot'; type: IrType; a: IrExpr }
  | { op: 'binary'; fn: BinFn; type: IrType; a: IrExpr; b: IrExpr }
  | { op: 'convert'; from: IrType; to: IrType; a: IrExpr; mode?: 'round' | 'trunc' }
  | { op: 'intrinsic'; fn: string; type: IrType; args: IrExpr[] }
  | { op: 'callFcExpr'; block: string; args: [string, IrExpr][]; type: IrType };

export type IrLValue =
  | { k: 'local'; name: string }
  | { k: 'static'; path: string[] }
  | { k: 'dbField'; db: string; path: string[] }
  | {
      k: 'abs';
      area: 'I' | 'Q' | 'M';
      byte: number;
      bit?: number;
      width: 8 | 16 | 32 | 64;
      type: PrimitiveType;
    }
  | {
      k: 'absDb';
      db: number;
      byte: number;
      bit?: number;
      width: 8 | 16 | 32 | 64;
      type: PrimitiveType;
    }
  | { k: 'index'; base: IrLValue; index: IrExpr }
  // Member sau một index (`#a[0].field`): `static.path` chỉ chứa string nên
  // không biểu diễn được index xen giữa — variant riêng (xem STATE §18
  // "Lệch so với plan"). Member trực tiếp trên root vẫn dùng `static.path`.
  | { k: 'member'; base: IrLValue; field: string };

export type IrStmt =
  | { op: 'assign'; target: IrLValue; value: IrExpr; src?: SrcRef }
  | {
      op: 'if';
      cond: IrExpr;
      then: IrStmt[];
      elsif: { cond: IrExpr; body: IrStmt[] }[];
      else: IrStmt[];
      src?: SrcRef;
    }
  | {
      op: 'case';
      sel: IrExpr;
      arms: { labels: (number | [number, number])[]; body: IrStmt[] }[];
      else: IrStmt[];
      src?: SrcRef;
    }
  | { op: 'for'; var: string; from: IrExpr; to: IrExpr; by?: IrExpr; body: IrStmt[]; src?: SrcRef }
  | { op: 'while'; cond: IrExpr; body: IrStmt[]; src?: SrcRef }
  | { op: 'repeat'; body: IrStmt[]; until: IrExpr; src?: SrcRef }
  | { op: 'exit'; src?: SrcRef }
  | { op: 'continue'; src?: SrcRef }
  | { op: 'return'; src?: SrcRef }
  | {
      op: 'callFb';
      instance: IrLValue;
      block: string;
      inArgs: [string, IrExpr][];
      outArgs: [string, IrLValue][];
      inoutArgs: [string, IrLValue][];
      src?: SrcRef;
    }
  | { op: 'callFc'; block: string; args: [string, IrExpr][]; ret?: IrLValue; src?: SrcRef }
  | {
      op: 'callSys';
      fn: string;
      instance?: IrLValue;
      inArgs: [string, IrExpr][];
      outArgs: [string, IrLValue][];
      src?: SrcRef;
    };
