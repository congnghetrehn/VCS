// Validate LAD — @vcs/vendor-siemens (M1 §5, P1.6).
// `validateLad(block, opts) → {irInterface, networks, diagnostics}`:
//  - phân giải interface (kiểu chuỗi → IrType) và cấp temp `__lad_*`;
//  - phân giải operand (`{sym}` → tag catalog, `{abs}` → parseAddress +
//    kiểu theo độ rộng OQ-110, `{local}` → #name[.member]*);
//  - kiểm tra kiểu contact/coil/box theo bảng chữ ký (STATE §21);
//  - lỗi → Diagnostic LAD-* (vị trí line=1, col=1; message nêu network id
//    + chỉ số element, OQ-193).
// Lower (lower.ts) chỉ dịch ValidatedLad → IR, không kiểm tra lại kiểu.

import { diag } from '@vcs/schemas';
import type { Diagnostic, TagDef } from '@vcs/schemas';
import type { IrExpr, IrField, IrInterface, IrLValue, IrType, IrVar, PrimitiveType } from '@vcs/runtime-iec';
import { getStdBlockDef, isFloatType } from '@vcs/runtime-iec';
import type { StdBlockDef, StdBlockName } from '@vcs/runtime-iec';
import { parseAddress } from '../address.js';
import type { AbsAddress } from '../address.js';
import type { CompileContext } from '../scl/compile.js';
import {
  binaryResultDetail,
  classifyIntrinsic,
  commonType,
  constFitsRange,
  convertModeFor,
  fbInterfaceStruct,
  interfaceFromSymbols,
  isStrictInteger,
  sclTypeToIrType,
  widen,
} from '../scl/typecheck.js';
import type { BlockSymbols, Section, SymbolInfo } from '../scl/typecheck.js';
import type { SclType } from '../scl/ast.js';
import { BOX_FNS } from './schema.js';
import type { LadBlock, LadConst, LadElement, LadInterfaceDecl, LadNetwork, LadOperand } from './schema.js';

/** parseAddress ném lỗi khi địa chỉ sai — validate cần undefined thay vì
 * throw để báo LAD-T001. */
function tryParseAddress(text: string): AbsAddress | undefined {
  try {
    return parseAddress(text);
  } catch {
    return undefined;
  }
}

/** Field của struct theo tên (không phân biệt hoa/thường); không phải
 * struct → undefined. */
function structField(type: IrType, name: string): IrField | undefined {
  if (typeof type !== 'string' && type.kind === 'struct') {
    return type.fields.find((f) => f.name.toLowerCase() === name.toLowerCase());
  }
  return undefined;
}

/** Vị trí giả cho kiểu nguyên thủy (sclTypeToIrType cần SrcLoc). */
const DUMMY_LOC = { line: 1, col: 1, endLine: 1, endCol: 1, offset: 0, length: 0 };

/** Tên kiểu nguyên thủy chuẩn (case-insensitive) → IrType. */
const PRIMITIVES: ReadonlyMap<string, PrimitiveType> = new Map([
  ['bool', 'Bool'],
  ['byte', 'Byte'],
  ['word', 'Word'],
  ['dword', 'DWord'],
  ['sint', 'SInt'],
  ['usint', 'USInt'],
  ['int', 'Int'],
  ['uint', 'UInt'],
  ['dint', 'DInt'],
  ['udint', 'UDInt'],
  ['real', 'Real'],
  ['lreal', 'LReal'],
  ['time', 'Time'],
]);

/** Toán tử so sánh LAD → toán tử nhị phân SCL (cho binaryResultDetail). */
const CMP_OP: Readonly<Record<string, string>> = {
  EQ: '=',
  NE: '<>',
  LT: '<',
  LE: '<=',
  GT: '>',
  GE: '>=',
};

const MATH_OP: Readonly<Record<string, string>> = {
  ADD: '+',
  SUB: '-',
  MUL: '*',
  DIV: 'DIV',
};

const STD_BOX_FNS: ReadonlySet<string> = new Set([
  'TON',
  'TOF',
  'TP',
  'TONR',
  'CTU',
  'CTD',
  'CTUD',
  'SR',
  'RS',
  'R_TRIG',
  'F_TRIG',
]);

function isNumericType(t: IrType): boolean {
  return typeof t === 'string' && (isStrictInteger(t) || isFloatType(t));
}

function irTypeName(t: IrType): string {
  if (typeof t === 'string') return t;
  if (t.kind === 'struct') return t.name ?? 'Struct';
  return `Array[${String(t.lo)}..${String(t.hi)}] of ${irTypeName(t.elem)}`;
}

function irTypeEquals(a: IrType, b: IrType): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'array' && b.kind === 'array') {
    return a.lo === b.lo && a.hi === b.hi && irTypeEquals(a.elem, b.elem);
  }
  if (a.kind === 'struct' && b.kind === 'struct') {
    return (
      a.name === b.name &&
      a.fields.length === b.fields.length &&
      a.fields.every((f, i) => {
        const g = b.fields[i];
        return g !== undefined && f.name === g.name && irTypeEquals(f.type, g.type);
      })
    );
  }
  return false;
}

// ---------------------------------------------------------- kiểu đã phân giải

/** Operand đã phân giải: kiểu + IrLValue (+ expr load tương ứng). */
export interface ResolvedOperand {
  type: IrType;
  ref: IrLValue;
  /** false = không ghi được (ghi vào → LAD-T006). */
  writable: boolean;
  /** fbType của biến gốc (chỉ cho `{local}` là instance FB/std). */
  fbType: string | undefined;
  expr: IrExpr;
}

export interface BoxInput {
  name: string;
  type: IrType;
  expr: IrExpr;
  /** Kiểu đích (chỉ std box: param type trong def — dùng cho convert). */
  target?: IrType;
}

export interface BoxOutput {
  name: string;
  type: IrType;
  ref: IrLValue;
}

export type ValidatedBox =
  | {
      kind: 'std';
      fn: StdBlockName;
      instance: IrLValue;
      inputs: BoxInput[];
      outputs: BoxOutput[];
      /** Tên output làm rlo sau box (OQ-184): Q/Q1/QU/QD. */
      qLike: string;
    }
  | { kind: 'compare'; fn: 'EQ' | 'NE' | 'LT' | 'LE' | 'GT' | 'GE'; inputs: [BoxInput, BoxInput]; common: IrType }
  | { kind: 'math'; fn: 'ADD' | 'SUB' | 'MUL' | 'DIV'; inputs: [BoxInput, BoxInput]; out: BoxOutput; resultType: IrType }
  | { kind: 'move'; input: BoxInput; out: BoxOutput }
  | { kind: 'convert'; input: BoxInput; out: BoxOutput; mode: 'round' | 'trunc' | undefined }
  | { kind: 'normScale'; fn: 'NORM_X' | 'SCALE_X'; inputs: [BoxInput, BoxInput, BoxInput]; out: BoxOutput; target: 'Real' | 'LReal' }
  | { kind: 'limitMinMax'; fn: 'LIMIT' | 'MIN' | 'MAX'; inputs: BoxInput[]; out: BoxOutput; resultType: IrType };

export type ValidatedElement =
  | { t: 'contact'; mode: 'NO' | 'NC'; operand: ResolvedOperand }
  | { t: 'pos' | 'neg'; operand: ResolvedOperand; memBit: ResolvedOperand }
  | { t: 'parallel'; branches: ValidatedElement[][]; branchTemps: string[] }
  | { t: 'not' }
  | { t: 'coil'; mode: 'normal' | 'negated'; operand: ResolvedOperand }
  | { t: 'set' | 'reset'; operand: ResolvedOperand }
  | { t: 'box'; box: ValidatedBox };

export interface ValidatedNetwork {
  id: string;
  rloTemp: string;
  rung: ValidatedElement[];
}

export interface ValidatedLad {
  name: string;
  kind: 'FC' | 'FB' | 'OB';
  number: number | undefined;
  irInterface: IrInterface;
  networks: ValidatedNetwork[];
  diagnostics: Diagnostic[];
}

export interface ValidateLadOptions {
  tags?: TagDef[] | undefined;
  ctx?: CompileContext | undefined;
  fileName?: string | undefined;
}

// ---------------------------------------------------------- phân giải kiểu chuỗi

const ARRAY_RE = /^Array\[(\d+)\.\.(\d+)\] of (.+)$/i;

interface ResolvedType {
  type: IrType;
  fbType?: string;
}

/**
 * Phân giải chuỗi kiểu LAD → IrType (OQ-191: `Array[lo..hi] of T` qua
 * regex; kiểu nguyên thủy case-insensitive; UDT/FB/std qua ctx).
 * `placement`: 'static' cho phép FB/std instance, các section khác không.
 */
function resolveTypeString(
  s: string,
  placement: Section,
  ctx: CompileContext | undefined,
  err: (code: string, message: string) => void,
): ResolvedType | undefined {
  const trimmed = s.trim();
  const arr = ARRAY_RE.exec(trimmed);
  if (arr !== null) {
    const lo = Number(arr[1]);
    const hi = Number(arr[2]);
    const elemRaw = arr[3] as string;
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo > hi) {
      err('LAD-S001', `kiểu mảng không hợp lệ '${trimmed}' (cần Array[lo..hi] of T với lo <= hi)`);
      return undefined;
    }
    const elem = resolveTypeString(elemRaw, 'temp', ctx, err);
    if (elem === undefined) return undefined;
    return { type: { kind: 'array', lo, hi, elem: elem.type } };
  }
  const prim = PRIMITIVES.get(trimmed.toLowerCase());
  if (prim !== undefined) {
    const t: SclType = { kind: 'elementary', name: prim, loc: DUMMY_LOC };
    const ir = sclTypeToIrType(t);
    if (ir === undefined) {
      // Không thể tới: prim đã qua PRIMITIVES (kiểu nguyên thủy hợp lệ).
      err('LAD-U001', `kiểu không hỗ trợ '${trimmed}'`);
      return undefined;
    }
    return { type: ir };
  }
  // 'Array[...' nhưng không khớp regex → cú pháp mảng sai (LAD-S001,
  // OQ-191) thay vì rơi xuống "kiểu chưa biết" (LAD-T001).
  if (/^array\[/i.test(trimmed)) {
    err('LAD-S001', `kiểu mảng không hợp lệ '${trimmed}' (cần Array[lo..hi] of T với lo <= hi)`);
    return undefined;
  }
  // Kiểu đặt tên: std block / UDT / FB (theo ctx) — mirror resolveTypeNode.
  const lower = trimmed.toLowerCase();
  const std = getStdBlockDef(trimmed);
  if (std !== undefined) {
    if (placement !== 'static') {
      err('LAD-T004', `kiểu '${trimmed}' là system block, chỉ dùng ở VAR (static) hoặc DATA_BLOCK`);
      return undefined;
    }
    return { type: { kind: 'struct', fields: std.layout }, fbType: std.name };
  }
  if (ctx !== undefined) {
    const udt = ctx.udts.get(lower);
    if (udt !== undefined) {
      return { type: { kind: 'struct', name: udt.name, fields: udt.fields } };
    }
    const fb = ctx.blocks.get(lower);
    if (fb !== undefined && fb.kind === 'FB') {
      if (placement !== 'static') {
        err('LAD-T004', `kiểu '${trimmed}' là FB, chỉ dùng ở VAR (static) hoặc DATA_BLOCK`);
        return undefined;
      }
      return { type: fbInterfaceStruct(fb.interface), fbType: fb.name };
    }
  }
  err('LAD-T001', `kiểu chưa biết '${trimmed}'`);
  return undefined;
}

// ---------------------------------------------------------- validate chính

export function validateLad(block: LadBlock, opts: ValidateLadOptions = {}): ValidatedLad {
  const fileName = opts.fileName ?? 'lad.json';
  const diagnostics: Diagnostic[] = [];
  const err = (code: string, message: string): void => {
    diagnostics.push(diag(code, 'error', message, { file: fileName, line: 1, col: 1 }));
  };
  const ctx = opts.ctx;

  // --- 1. Interface: trùng tên / FC-OB có static / kiểu / init ----------
  // Liệt kê tường minh từng section (không index LadInterface bằng Section —
  // Section có thêm 'const' mà LadInterface không có).
  const sectionDecls: [Section, LadInterfaceDecl[]][] = [
    ['input', block.interface.input ?? []],
    ['output', block.interface.output ?? []],
    ['inout', block.interface.inout ?? []],
    ['static', block.interface.static ?? []],
    ['temp', block.interface.temp ?? []],
  ];
  const syms: BlockSymbols = { blockId: block.name.toLowerCase(), vars: new Map() };
  const seenNames = new Map<string, string>();
  for (const [section, decls] of sectionDecls) {
    if ((block.kind === 'FC' || block.kind === 'OB') && section === 'static' && decls.length > 0) {
      err('LAD-S001', `block ${block.kind} '${block.name}' không có VAR (static)`);
    }
    for (const decl of decls) {
      const key = decl.name.toLowerCase();
      const prev = seenNames.get(key);
      if (prev !== undefined) {
        err('LAD-T009', `trùng tên biến '${decl.name}' (đã khai ở ${prev})`);
        continue;
      }
      seenNames.set(key, section);
      if (key === block.name.toLowerCase()) {
        err('LAD-T009', `biến '${decl.name}' trùng tên block '${block.name}'`);
        continue;
      }
      const resolved = resolveTypeString(decl.type, section, ctx, (code, message) => {
        err(code, `biến '${decl.name}': ${message}`);
      });
      if (resolved === undefined) continue;
      if (decl.init !== undefined) {
        checkInit(decl.name, resolved.type, decl.init, err);
      }
      const sym: SymbolInfo = {
        name: decl.name,
        type: resolved.type,
        section,
        ...(resolved.fbType !== undefined ? { fbType: resolved.fbType } : {}),
        ...(decl.init !== undefined ? { init: decl.init } : {}),
      };
      syms.vars.set(key, sym);
    }
  }

  // --- 2. FC/FB có number → S001; network id trùng → T009 ----------------
  if (block.number !== undefined && (block.kind === 'FC' || block.kind === 'FB')) {
    err('LAD-S001', `block ${block.kind} '${block.name}' không có number`);
  }
  const seenNet = new Set<string>();
  for (const net of block.networks) {
    const key = net.id.toLowerCase();
    if (seenNet.has(key)) {
      err('LAD-T009', `trùng network id '${net.id}'`);
    }
    seenNet.add(key);
  }

  // --- 3. IrInterface + bảng tag ------------------------------------------
  const irInterface = interfaceFromSymbols(syms);
  const tagMap = new Map<string, TagDef>();
  for (const tag of opts.tags ?? []) tagMap.set(tag.name.toLowerCase(), tag);

  // --- 4. Validate từng network -------------------------------------------
  const v = new LadValidator(block, syms, tagMap, ctx, fileName, diagnostics);
  const networks: ValidatedNetwork[] = [];
  const generatedTemps: IrVar[] = [];
  for (const net of block.networks) {
    const vn = v.validateNetwork(net);
    networks.push(vn);
    for (const name of [vn.rloTemp, ...collectBranchTemps(vn.rung)]) {
      if (seenNames.has(name.toLowerCase())) {
        err('LAD-T009', `temp sinh '${name}' trùng tên biến người dùng (network '${net.id}')`);
      }
      generatedTemps.push({ name, type: 'Bool' });
    }
  }
  irInterface.temp = [...irInterface.temp, ...generatedTemps];

  return {
    name: block.name,
    kind: block.kind,
    number: block.number,
    irInterface,
    networks,
    diagnostics,
  };
}

function collectBranchTemps(rung: ValidatedElement[]): string[] {
  const out: string[] = [];
  for (const el of rung) {
    if (el.t === 'parallel') {
      out.push(...el.branchTemps);
      for (const branch of el.branches) out.push(...collectBranchTemps(branch));
    }
  }
  return out;
}

/** Kiểm tra init của một khai báo (chỉ number/boolean; struct/array/FB
 * instance không có init). */
function checkInit(
  name: string,
  type: IrType,
  init: number | boolean,
  err: (code: string, message: string) => void,
): void {
  if (typeof type !== 'string') {
    err('LAD-T002', `biến '${name}': init không dùng được cho kiểu ${irTypeName(type)}`);
    return;
  }
  if (type === 'Bool' && typeof init !== 'boolean') {
    err('LAD-T002', `biến '${name}': init ${String(init)} không phải Bool`);
    return;
  }
  if (type !== 'Bool' && typeof init !== 'number') {
    err('LAD-T002', `biến '${name}': init ${String(init)} không phải số`);
    return;
  }
  if (typeof init === 'number' && !constFitsRange(init, type)) {
    err('LAD-T002', `biến '${name}': init ${String(init)} ngoài phạm vi ${type}`);
  }
}

// ---------------------------------------------------------- validator

class LadValidator {
  private readonly diags: Diagnostic[];
  private readonly fileName: string;

  constructor(
    private readonly block: LadBlock,
    private readonly syms: BlockSymbols,
    private readonly tagMap: Map<string, TagDef>,
    private readonly ctx: CompileContext | undefined,
    fileName: string,
    diagnostics: Diagnostic[],
  ) {
    this.diags = diagnostics;
    this.fileName = fileName;
  }

  private err(code: string, message: string): void {
    this.diags.push(diag(code, 'error', message, { file: this.fileName, line: 1, col: 1 }));
  }

  private ctxMsg(netId: string, idx: number, message: string): string {
    return `network '${netId}' element ${String(idx)}: ${message}`;
  }

  // --- operand ------------------------------------------------------------

  /** Phân giải một operand → {type, ref, writable, fbType, expr}. */
  resolveOperand(op: LadOperand, netId: string, idx: number): ResolvedOperand | undefined {
    if ('sym' in op) {
      const tag = this.tagMap.get(op.sym.toLowerCase());
      if (tag === undefined) {
        this.err('LAD-T001', this.ctxMsg(netId, idx, `tag chưa khai báo '${op.sym}'`));
        return undefined;
      }
      const abs = tryParseAddress(tag.address);
      if (abs === undefined) {
        this.err('LAD-T001', this.ctxMsg(netId, idx, `tag '${op.sym}' có địa chỉ không phân giải được '${tag.address}'`));
        return undefined;
      }
      const type = absType(abs);
      if (tag.type !== type) {
        this.err('LAD-T002', this.ctxMsg(netId, idx, `tag '${op.sym}' khai kiểu ${tag.type} nhưng địa chỉ ${tag.address} là ${type} (OQ-110)`));
        return undefined;
      }
      return this.absResolved(abs);
    }
    if ('abs' in op) {
      const abs = tryParseAddress(op.abs);
      if (abs === undefined) {
        this.err('LAD-T001', this.ctxMsg(netId, idx, `địa chỉ tuyệt đối không hợp lệ '${op.abs}'`));
        return undefined;
      }
      return this.absResolved(abs);
    }
    // local: #name[.member]*
    const parts = op.local.split('.');
    const head = parts[0] as string;
    const baseName = head.startsWith('#') ? head.slice(1) : head;
    const sym = this.syms.vars.get(baseName.toLowerCase());
    if (sym === undefined) {
      this.err('LAD-T001', this.ctxMsg(netId, idx, `biến cục bộ chưa khai báo '${op.local}'`));
      return undefined;
    }
    let type = sym.type;
    let ref: IrLValue = { k: 'local', name: sym.name };
    const path: string[] = [];
    for (const member of parts.slice(1)) {
      const field = structField(type, member);
      if (field === undefined) {
        if (typeof type !== 'string' && type.kind === 'struct') {
          this.err('LAD-T005', this.ctxMsg(netId, idx, `'${op.local}': không có field '${member}'`));
        } else {
          this.err('LAD-T005', this.ctxMsg(netId, idx, `'${op.local}': '${member}' không phải field của ${irTypeName(type)}`));
        }
        return undefined;
      }
      if (field.hidden === true) {
        this.err('LAD-T005', this.ctxMsg(netId, idx, `'${op.local}': field '${member}' là field ẩn, không truy cập được`));
        return undefined;
      }
      path.push(field.name);
      ref = { k: 'static', path: [sym.name, ...path] };
      type = field.type;
    }
    const writable = sym.section !== 'input';
    return { type, ref, writable, fbType: sym.fbType, expr: { op: 'load', type, ref } };
  }

  /** AbsAddress → IrLValue abs/absDb (mirror lowerLValue của SCL). */
  private absResolved(abs: AbsAddress): ResolvedOperand | undefined {
    const type = absType(abs);
    const width = abs.width === 1 ? 8 : abs.width;
    const ref: IrLValue =
      abs.kind === 'area'
        ? {
            k: 'abs',
            area: abs.area,
            byte: abs.byte,
            ...(abs.bit !== undefined ? { bit: abs.bit } : {}),
            width,
            type,
          }
        : {
            k: 'absDb',
            db: abs.db,
            byte: abs.byte,
            ...(abs.bit !== undefined ? { bit: abs.bit } : {}),
            width,
            type,
          };
    return { type, ref, writable: true, fbType: undefined, expr: { op: 'load', type, ref } };
  }

  /** Kiểm tra operand Bool (contact/coil/pos/neg). */
  private requireBool(
    op: LadOperand,
    netId: string,
    idx: number,
    what: string,
  ): ResolvedOperand | undefined {
    const resolved = this.resolveOperand(op, netId, idx);
    if (resolved === undefined) return undefined;
    if (resolved.type !== 'Bool') {
      this.err('LAD-T002', this.ctxMsg(netId, idx, `${what} cần Bool, nhận ${irTypeName(resolved.type)}`));
      return undefined;
    }
    return resolved;
  }

  /** Kiểm tra operand ghi được (coil/set/reset/memBit/box output). */
  private requireWritable(
    resolved: ResolvedOperand,
    netId: string,
    idx: number,
    what: string,
  ): boolean {
    if (!resolved.writable) {
      this.err('LAD-T006', this.ctxMsg(netId, idx, `${what}: không được ghi vào VAR_INPUT`));
      return false;
    }
    return true;
  }

  // --- giá trị (operand | const) ------------------------------------------

  /** Phân giải một giá trị đầu vào box: operand hoặc const. */
  resolveValue(
    value: LadOperand | LadConst,
    netId: string,
    idx: number,
  ): { type: IrType; expr: IrExpr } | undefined {
    if ('const' in value) {
      const c = value.const;
      if (typeof c === 'boolean') {
        if (value.type !== undefined && value.type !== 'Bool') {
          this.err('LAD-T002', this.ctxMsg(netId, idx, `hằng Bool không khớp type '${value.type}'`));
          return undefined;
        }
        return { type: 'Bool', expr: { op: 'const', type: 'Bool', value: c } };
      }
      // number: type rõ ràng, hoặc mặc định Int (OQ-195).
      const target: PrimitiveType = value.type === undefined ? 'Int' : (PRIMITIVES.get(value.type.toLowerCase()) ?? 'Int');
      if (value.type !== undefined && PRIMITIVES.get(value.type.toLowerCase()) === undefined) {
        this.err('LAD-T002', this.ctxMsg(netId, idx, `hằng số có type không hợp lệ '${value.type}'`));
        return undefined;
      }
      if (target === 'Bool') {
        this.err('LAD-T002', this.ctxMsg(netId, idx, 'hằng số không thể có type Bool'));
        return undefined;
      }
      if (!constFitsRange(c, target)) {
        this.err('LAD-T002', this.ctxMsg(netId, idx, `hằng ${String(c)} ngoài phạm vi ${target}`));
        return undefined;
      }
      return { type: target, expr: { op: 'const', type: target, value: c } };
    }
    const resolved = this.resolveOperand(value, netId, idx);
    if (resolved === undefined) return undefined;
    return { type: resolved.type, expr: resolved.expr };
  }

  /** Gán được? (giống assignProblem của SCL nhưng lỗi LAD-T002.) */
  private assignOk(
    to: IrType,
    from: IrType,
    netId: string,
    idx: number,
    what: string,
  ): boolean {
    if (irTypeEquals(to, from)) return true;
    if (typeof to === 'string' && typeof from === 'string' && widen(from, to)) return true;
    this.err('LAD-T002', this.ctxMsg(netId, idx, `${what}: ${irTypeName(from)} không gán được cho ${irTypeName(to)}`));
    return false;
  }

  // --- network --------------------------------------------------------------

  validateNetwork(net: LadNetwork): ValidatedNetwork {
    const rloTemp = `__lad_${net.id}_rlo`;
    let branchCounter = 0;
    const allocBranchTemp = (): string => `__lad_${net.id}_b${String(branchCounter++)}`;
    const validateElements = (els: LadElement[]): ValidatedElement[] => {
      const out: ValidatedElement[] = [];
      els.forEach((el, idx) => {
        const v = this.validateElement(el, net.id, idx, allocBranchTemp);
        if (v !== undefined) out.push(v);
      });
      return out;
    };
    return { id: net.id, rloTemp, rung: validateElements(net.rung) };
  }

  private validateElement(
    el: LadElement,
    netId: string,
    idx: number,
    allocBranchTemp: () => string,
  ): ValidatedElement | undefined {
    switch (el.t) {
      case 'contact': {
        const operand = this.requireBool(el.operand, netId, idx, 'contact');
        if (operand === undefined) return undefined;
        return { t: 'contact', mode: el.mode, operand };
      }
      case 'pos':
      case 'neg': {
        const operand = this.requireBool(el.operand, netId, idx, el.t);
        if (operand === undefined) return undefined;
        const memBit = this.requireBool(el.memBit, netId, idx, `${el.t} memBit`);
        if (memBit === undefined) return undefined;
        this.requireWritable(memBit, netId, idx, `${el.t} memBit`);
        return { t: el.t, operand, memBit };
      }
      case 'not':
        return { t: 'not' };
      case 'coil': {
        const operand = this.requireBool(el.operand, netId, idx, 'coil');
        if (operand === undefined) return undefined;
        this.requireWritable(operand, netId, idx, 'coil');
        return { t: 'coil', mode: el.mode, operand };
      }
      case 'set':
      case 'reset': {
        const operand = this.requireBool(el.operand, netId, idx, el.t);
        if (operand === undefined) return undefined;
        this.requireWritable(operand, netId, idx, el.t);
        return { t: el.t, operand };
      }
      case 'parallel': {
        const branchTemps: string[] = [];
        const branches: ValidatedElement[][] = [];
        el.branches.forEach((branch) => {
          const temp = allocBranchTemp();
          branchTemps.push(temp);
          const validated: ValidatedElement[] = [];
          branch.forEach((sub, subIdx) => {
            const v = this.validateElement(sub, netId, idx * 100 + subIdx, allocBranchTemp);
            if (v !== undefined) validated.push(v);
          });
          branches.push(validated);
        });
        return { t: 'parallel', branches, branchTemps };
      }
      case 'box':
        return this.validateBox(el, netId, idx);
    }
  }

  // --- box ------------------------------------------------------------------

  private validateBox(
    el: Extract<LadElement, { t: 'box' }>,
    netId: string,
    idx: number,
  ): ValidatedElement | undefined {
    const fn = el.fn.toUpperCase();
    if (!BOX_FNS.has(fn)) {
      this.err('LAD-U001', this.ctxMsg(netId, idx, `box '${el.fn}' chưa hỗ trợ (ngoài phạm vi M1 §5)`));
      return undefined;
    }
    if (STD_BOX_FNS.has(fn)) {
      const box = this.validateStdBox(fn as StdBlockName, el, netId, idx);
      return box === undefined ? undefined : { t: 'box', box };
    }
    if (fn === 'EQ' || fn === 'NE' || fn === 'LT' || fn === 'LE' || fn === 'GT' || fn === 'GE') {
      const box = this.validateCompareBox(fn, el, netId, idx);
      return box === undefined ? undefined : { t: 'box', box };
    }
    if (fn === 'ADD' || fn === 'SUB' || fn === 'MUL' || fn === 'DIV') {
      const box = this.validateMathBox(fn, el, netId, idx);
      return box === undefined ? undefined : { t: 'box', box };
    }
    if (fn === 'MOVE') {
      const box = this.validateMoveBox(el, netId, idx);
      return box === undefined ? undefined : { t: 'box', box };
    }
    if (fn === 'CONVERT') {
      const box = this.validateConvertBox(el, netId, idx);
      return box === undefined ? undefined : { t: 'box', box };
    }
    if (fn === 'NORM_X' || fn === 'SCALE_X') {
      const box = this.validateNormScaleBox(fn, el, netId, idx);
      return box === undefined ? undefined : { t: 'box', box };
    }
    const box = this.validateLimitMinMaxBox(fn as 'LIMIT' | 'MIN' | 'MAX', el, netId, idx);
    return box === undefined ? undefined : { t: 'box', box };
  }

  /** Lấy giá trị input theo tên (case-insensitive); thiếu bắt buộc → T004. */
  private boxInput(
    el: Extract<LadElement, { t: 'box' }>,
    name: string,
    required: boolean,
    netId: string,
    idx: number,
  ): { type: IrType; expr: IrExpr } | undefined {
    const key = Object.keys(el.inputs).find((k) => k.toLowerCase() === name.toLowerCase());
    if (key === undefined) {
      if (required) {
        this.err('LAD-T004', this.ctxMsg(netId, idx, `box '${el.fn}': thiếu input bắt buộc '${name}'`));
      }
      return undefined;
    }
    return this.resolveValue(el.inputs[key] as LadOperand | LadConst, netId, idx);
  }

  /** Kiểm tra key lạ trong inputs/outputs. */
  private checkBoxKeys(
    el: Extract<LadElement, { t: 'box' }>,
    knownInputs: readonly string[],
    knownOutputs: readonly string[],
    netId: string,
    idx: number,
  ): void {
    for (const key of Object.keys(el.inputs)) {
      if (!knownInputs.some((k) => k.toLowerCase() === key.toLowerCase())) {
        this.err('LAD-T004', this.ctxMsg(netId, idx, `box '${el.fn}': input không có '${key}'`));
      }
    }
    for (const key of Object.keys(el.outputs)) {
      if (!knownOutputs.some((k) => k.toLowerCase() === key.toLowerCase())) {
        this.err('LAD-T004', this.ctxMsg(netId, idx, `box '${el.fn}': output không có '${key}'`));
      }
    }
  }

  /** Phân giải instance của std box → IrLValue (local static var hoặc DB). */
  private stdInstance(
    el: Extract<LadElement, { t: 'box' }>,
    def: StdBlockDef,
    netId: string,
    idx: number,
  ): IrLValue | undefined {
    if (el.instance === undefined) {
      this.err('LAD-T004', this.ctxMsg(netId, idx, `box '${el.fn}': thiếu instance`));
      return undefined;
    }
    const inst = el.instance;
    if ('local' in inst) {
      if (inst.local.includes('.')) {
        this.err('LAD-T004', this.ctxMsg(netId, idx, `box '${el.fn}': instance phải là biến, không phải member '${inst.local}'`));
        return undefined;
      }
      const resolved = this.resolveOperand(inst, netId, idx);
      if (resolved === undefined) return undefined;
      if (resolved.fbType !== def.name) {
        this.err(
          'LAD-T001',
          this.ctxMsg(netId, idx, `instance '${inst.local}' không phải ${def.name} (kiểu ${irTypeName(resolved.type)})`),
        );
        return undefined;
      }
      return resolved.ref;
    }
    if ('sym' in inst) {
      if (this.ctx === undefined) {
        this.err('LAD-T001', this.ctxMsg(netId, idx, `không có DB nào khai báo (instance '${inst.sym}')`));
        return undefined;
      }
      const db = this.ctx.dbs.get(inst.sym.toLowerCase());
      if (db === undefined) {
        this.err('LAD-T001', this.ctxMsg(netId, idx, `DB chưa khai báo '${inst.sym}'`));
        return undefined;
      }
      if (db.fbName !== def.name) {
        this.err('LAD-T001', this.ctxMsg(netId, idx, `DB '${inst.sym}' là instance của ${db.fbName ?? '(không phải FB)'}, không phải ${def.name}`));
        return undefined;
      }
      return { k: 'dbField', db: db.name, path: [] };
    }
    this.err('LAD-T004', this.ctxMsg(netId, idx, `box '${el.fn}': instance không dùng địa chỉ tuyệt đối`));
    return undefined;
  }

  private validateStdBox(
    fn: StdBlockName,
    el: Extract<LadElement, { t: 'box' }>,
    netId: string,
    idx: number,
  ): ValidatedBox | undefined {
    const def = getStdBlockDef(fn);
    if (def === undefined) return undefined;
    this.checkBoxKeys(
      el,
      def.input.map((f) => f.name),
      def.output.map((f) => f.name),
      netId,
      idx,
    );
    const instance = this.stdInstance(el, def, netId, idx);
    if (instance === undefined) return undefined;
    const inputs: BoxInput[] = [];
    let ok = true;
    for (const param of def.input) {
      const value = this.boxInput(el, param.name, param.init === undefined, netId, idx);
      if (value === undefined) {
        if (param.init === undefined) ok = false;
        continue;
      }
      if (!this.assignOk(param.type, value.type, netId, idx, `box '${fn}' input '${param.name}'`)) {
        ok = false;
        continue;
      }
      inputs.push({ name: param.name, type: value.type, expr: value.expr, target: param.type });
    }
    const outputs: BoxOutput[] = [];
    for (const param of def.output) {
      const key = Object.keys(el.outputs).find((k) => k.toLowerCase() === param.name.toLowerCase());
      if (key === undefined) continue;
      const resolved = this.resolveOperand(el.outputs[key] as LadOperand, netId, idx);
      if (resolved === undefined) {
        ok = false;
        continue;
      }
      if (!this.requireWritable(resolved, netId, idx, `box '${fn}' output '${param.name}'`)) {
        ok = false;
        continue;
      }
      // OUT: giá trị kiểu param phải gán được vào target (mở rộng cho phép).
      if (!this.assignOk(resolved.type, param.type, netId, idx, `box '${fn}' output '${param.name}'`)) {
        ok = false;
        continue;
      }
      outputs.push({ name: param.name, type: resolved.type, ref: resolved.ref });
    }
    if (!ok) return undefined;
    const qLike = qLikeOf(def);
    return { kind: 'std', fn, instance, inputs, outputs, qLike };
  }

  private validateCompareBox(
    fn: 'EQ' | 'NE' | 'LT' | 'LE' | 'GT' | 'GE',
    el: Extract<LadElement, { t: 'box' }>,
    netId: string,
    idx: number,
  ): ValidatedBox | undefined {
    if (el.instance !== undefined) {
      this.err('LAD-T004', this.ctxMsg(netId, idx, `box '${fn}': không nhận instance`));
      return undefined;
    }
    if (Object.keys(el.outputs).length > 0) {
      this.err('LAD-S001', this.ctxMsg(netId, idx, `box '${fn}': output viết qua rlo, không khai outputs`));
      return undefined;
    }
    this.checkBoxKeys(el, ['IN1', 'IN2'], [], netId, idx);
    const in1 = this.boxInput(el, 'IN1', true, netId, idx);
    const in2 = this.boxInput(el, 'IN2', true, netId, idx);
    if (in1 === undefined || in2 === undefined) return undefined;
    const r = binaryResultDetail(CMP_OP[fn] as string, in1.type, in2.type);
    if (!('type' in r)) {
      const code = r.code === 'SCL-T002' ? 'LAD-T002' : 'LAD-T003';
      this.err(code, this.ctxMsg(netId, idx, `box '${fn}': so sánh ${irTypeName(in1.type)} với ${irTypeName(in2.type)} không hợp lệ`));
      return undefined;
    }
    const common = commonType(in1.type, in2.type) ?? in1.type;
    return { kind: 'compare', fn, inputs: [{ name: 'IN1', type: in1.type, expr: in1.expr }, { name: 'IN2', type: in2.type, expr: in2.expr }], common };
  }

  private validateMathBox(
    fn: 'ADD' | 'SUB' | 'MUL' | 'DIV',
    el: Extract<LadElement, { t: 'box' }>,
    netId: string,
    idx: number,
  ): ValidatedBox | undefined {
    if (el.instance !== undefined) {
      this.err('LAD-T004', this.ctxMsg(netId, idx, `box '${fn}': không nhận instance`));
      return undefined;
    }
    this.checkBoxKeys(el, ['IN1', 'IN2'], ['OUT'], netId, idx);
    const in1 = this.boxInput(el, 'IN1', true, netId, idx);
    const in2 = this.boxInput(el, 'IN2', true, netId, idx);
    if (in1 === undefined || in2 === undefined) return undefined;
    const r = binaryResultDetail(MATH_OP[fn] as string, in1.type, in2.type);
    if (!('type' in r)) {
      const code = r.code === 'SCL-T002' ? 'LAD-T002' : 'LAD-T003';
      this.err(code, this.ctxMsg(netId, idx, `box '${fn}': ${irTypeName(in1.type)} ${MATH_OP[fn] as string} ${irTypeName(in2.type)} không hợp lệ`));
      return undefined;
    }
    const resultType = r.type;
    const outKey = Object.keys(el.outputs).find((k) => k.toLowerCase() === 'out');
    if (outKey === undefined) {
      this.err('LAD-T004', this.ctxMsg(netId, idx, `box '${fn}': thiếu output bắt buộc 'OUT'`));
      return undefined;
    }
    const outResolved = this.resolveOperand(el.outputs[outKey] as LadOperand, netId, idx);
    if (outResolved === undefined) return undefined;
    if (!this.requireWritable(outResolved, netId, idx, `box '${fn}' output 'OUT'`)) return undefined;
    if (!this.assignOk(outResolved.type, resultType, netId, idx, `box '${fn}' output 'OUT'`)) return undefined;
    return {
      kind: 'math',
      fn,
      inputs: [{ name: 'IN1', type: in1.type, expr: in1.expr }, { name: 'IN2', type: in2.type, expr: in2.expr }],
      out: { name: 'OUT', type: outResolved.type, ref: outResolved.ref },
      resultType,
    };
  }

  private validateMoveBox(
    el: Extract<LadElement, { t: 'box' }>,
    netId: string,
    idx: number,
  ): ValidatedBox | undefined {
    if (el.instance !== undefined) {
      this.err('LAD-T004', this.ctxMsg(netId, idx, "box 'MOVE': không nhận instance"));
      return undefined;
    }
    this.checkBoxKeys(el, ['IN'], ['OUT'], netId, idx);
    const inValue = this.boxInput(el, 'IN', true, netId, idx);
    if (inValue === undefined) return undefined;
    const outKey = Object.keys(el.outputs).find((k) => k.toLowerCase() === 'out');
    if (outKey === undefined) {
      this.err('LAD-T004', this.ctxMsg(netId, idx, "box 'MOVE': thiếu output bắt buộc 'OUT'"));
      return undefined;
    }
    const outResolved = this.resolveOperand(el.outputs[outKey] as LadOperand, netId, idx);
    if (outResolved === undefined) return undefined;
    if (!this.requireWritable(outResolved, netId, idx, "box 'MOVE' output 'OUT'")) return undefined;
    if (!this.assignOk(outResolved.type, inValue.type, netId, idx, "box 'MOVE' output 'OUT'")) return undefined;
    return {
      kind: 'move',
      input: { name: 'IN', type: inValue.type, expr: inValue.expr },
      out: { name: 'OUT', type: outResolved.type, ref: outResolved.ref },
    };
  }

  private validateConvertBox(
    el: Extract<LadElement, { t: 'box' }>,
    netId: string,
    idx: number,
  ): ValidatedBox | undefined {
    if (el.instance !== undefined) {
      this.err('LAD-T004', this.ctxMsg(netId, idx, "box 'CONVERT': không nhận instance"));
      return undefined;
    }
    this.checkBoxKeys(el, ['IN'], ['OUT'], netId, idx);
    const inValue = this.boxInput(el, 'IN', true, netId, idx);
    if (inValue === undefined) return undefined;
    const outKey = Object.keys(el.outputs).find((k) => k.toLowerCase() === 'out');
    if (outKey === undefined) {
      this.err('LAD-T004', this.ctxMsg(netId, idx, "box 'CONVERT': thiếu output bắt buộc 'OUT'"));
      return undefined;
    }
    const outResolved = this.resolveOperand(el.outputs[outKey] as LadOperand, netId, idx);
    if (outResolved === undefined) return undefined;
    if (!this.requireWritable(outResolved, netId, idx, "box 'CONVERT' output 'OUT'")) return undefined;
    if (typeof inValue.type !== 'string' || typeof outResolved.type !== 'string') {
      this.err('LAD-T003', this.ctxMsg(netId, idx, "box 'CONVERT': chỉ dùng cho kiểu nguyên thủy"));
      return undefined;
    }
    if (inValue.type === outResolved.type) {
      return {
        kind: 'convert',
        input: { name: 'IN', type: inValue.type, expr: inValue.expr },
        out: { name: 'OUT', type: outResolved.type, ref: outResolved.ref },
        mode: undefined,
      };
    }
    const info = classifyIntrinsic(`${inValue.type.toUpperCase()}_TO_${outResolved.type.toUpperCase()}`);
    if (info === undefined || info.kind !== 'convert') {
      this.err('LAD-T003', this.ctxMsg(netId, idx, `box 'CONVERT': không chuyển được ${inValue.type} → ${outResolved.type}`));
      return undefined;
    }
    const mode = convertModeFor(inValue.type, outResolved.type);
    return {
      kind: 'convert',
      input: { name: 'IN', type: inValue.type, expr: inValue.expr },
      out: { name: 'OUT', type: outResolved.type, ref: outResolved.ref },
      mode,
    };
  }

  private validateNormScaleBox(
    fn: 'NORM_X' | 'SCALE_X',
    el: Extract<LadElement, { t: 'box' }>,
    netId: string,
    idx: number,
  ): ValidatedBox | undefined {
    if (el.instance !== undefined) {
      this.err('LAD-T004', this.ctxMsg(netId, idx, `box '${fn}': không nhận instance`));
      return undefined;
    }
    this.checkBoxKeys(el, ['MIN', 'MAX', 'VALUE'], ['OUT'], netId, idx);
    const min = this.boxInput(el, 'MIN', true, netId, idx);
    const max = this.boxInput(el, 'MAX', true, netId, idx);
    const value = this.boxInput(el, 'VALUE', true, netId, idx);
    if (min === undefined || max === undefined || value === undefined) return undefined;
    for (const [name, v] of [['MIN', min], ['MAX', max], ['VALUE', value]] as const) {
      if (!isNumericType(v.type)) {
        this.err('LAD-T003', this.ctxMsg(netId, idx, `box '${fn}': '${name}' cần số, nhận ${irTypeName(v.type)}`));
        return undefined;
      }
    }
    const target: 'Real' | 'LReal' =
      min.type === 'LReal' || max.type === 'LReal' || value.type === 'LReal' ? 'LReal' : 'Real';
    const outKey = Object.keys(el.outputs).find((k) => k.toLowerCase() === 'out');
    if (outKey === undefined) {
      this.err('LAD-T004', this.ctxMsg(netId, idx, `box '${fn}': thiếu output bắt buộc 'OUT'`));
      return undefined;
    }
    const outResolved = this.resolveOperand(el.outputs[outKey] as LadOperand, netId, idx);
    if (outResolved === undefined) return undefined;
    if (!this.requireWritable(outResolved, netId, idx, `box '${fn}' output 'OUT'`)) return undefined;
    if (!this.assignOk(outResolved.type, target, netId, idx, `box '${fn}' output 'OUT'`)) return undefined;
    return {
      kind: 'normScale',
      fn,
      inputs: [
        { name: 'MIN', type: min.type, expr: min.expr },
        { name: 'MAX', type: max.type, expr: max.expr },
        { name: 'VALUE', type: value.type, expr: value.expr },
      ],
      out: { name: 'OUT', type: outResolved.type, ref: outResolved.ref },
      target,
    };
  }

  private validateLimitMinMaxBox(
    fn: 'LIMIT' | 'MIN' | 'MAX',
    el: Extract<LadElement, { t: 'box' }>,
    netId: string,
    idx: number,
  ): ValidatedBox | undefined {
    if (el.instance !== undefined) {
      this.err('LAD-T004', this.ctxMsg(netId, idx, `box '${fn}': không nhận instance`));
      return undefined;
    }
    const inNames = fn === 'LIMIT' ? ['MN', 'MX', 'IN'] : ['IN1', 'IN2'];
    this.checkBoxKeys(el, inNames, ['OUT'], netId, idx);
    const values: { type: IrType; expr: IrExpr }[] = [];
    for (const name of inNames) {
      const v = this.boxInput(el, name, true, netId, idx);
      if (v === undefined) return undefined;
      values.push(v);
    }
    // commonNumeric (giống SCL): số hoặc Time, chung họ.
    let resultType: IrType | undefined;
    for (const v of values) {
      if (typeof v.type !== 'string' || (!isNumericType(v.type) && v.type !== 'Time')) {
        this.err('LAD-T003', this.ctxMsg(netId, idx, `box '${fn}': chỉ dùng cho số`));
        return undefined;
      }
      if (resultType === undefined) {
        resultType = v.type;
      } else {
        const common = commonType(resultType, v.type);
        if (common === undefined) {
          this.err('LAD-T002', this.ctxMsg(netId, idx, `box '${fn}': ${irTypeName(resultType)} và ${irTypeName(v.type)} không cùng họ`));
          return undefined;
        }
        resultType = common;
      }
    }
    if (resultType === undefined) return undefined;
    const outKey = Object.keys(el.outputs).find((k) => k.toLowerCase() === 'out');
    if (outKey === undefined) {
      this.err('LAD-T004', this.ctxMsg(netId, idx, `box '${fn}': thiếu output bắt buộc 'OUT'`));
      return undefined;
    }
    const outResolved = this.resolveOperand(el.outputs[outKey] as LadOperand, netId, idx);
    if (outResolved === undefined) return undefined;
    if (!this.requireWritable(outResolved, netId, idx, `box '${fn}' output 'OUT'`)) return undefined;
    if (!this.assignOk(outResolved.type, resultType, netId, idx, `box '${fn}' output 'OUT'`)) return undefined;
    return {
      kind: 'limitMinMax',
      fn,
      inputs: values.map((v, i) => ({ name: inNames[i] as string, type: v.type, expr: v.expr })),
      out: { name: 'OUT', type: outResolved.type, ref: outResolved.ref },
      resultType,
    };
  }
}

// ---------------------------------------------------------- phụ trợ

/** Kiểu theo độ rộng địa chỉ tuyệt đối (OQ-110): bit→Bool, 8→Byte,
 * 16→Int, 32→DInt. */
function absType(abs: AbsAddress): PrimitiveType {
  if (abs.width === 1) return 'Bool';
  if (abs.width === 8) return 'Byte';
  if (abs.width === 16) return 'Int';
  return 'DInt';
}

/** Output nào của std block làm rlo sau box (OQ-184). */
function qLikeOf(def: StdBlockDef): string {
  switch (def.name) {
    case 'CTU':
      return 'QU';
    case 'CTD':
      return 'QD';
    case 'CTUD':
      return 'QU';
    case 'SR':
    case 'RS':
      return 'Q1';
    default:
      return 'Q';
  }
}
