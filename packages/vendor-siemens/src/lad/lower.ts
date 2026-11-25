// Lower LAD → IR — @vcs/vendor-siemens (M1 §5, P1.6).
// `lowerLad(validated) → {block, networkMap}`: dịch thuần ValidatedLad
// sang IrBlock chung với SCL (không kiểm tra lại kiểu — validate đã làm).
// `compileLad(input, opts)` = parse → validate → lower → hợp nhất vào
// CompileContext chung với SCL (dùng `programFromCtx`).
//
// Quy tắc RLO/EN/ENO (STATE §21, M1 §5.2):
//  - mỗi network bắt đầu bằng `__lad_<id>_rlo := TRUE`;
//  - contact NO: rlo := rlo AND v; NC: rlo := rlo AND NOT v;
//  - pos: rlo := rlo AND (v AND NOT m); m := v (neg tương tự với NOT v);
//  - parallel: mỗi nhánh chạy với rlo riêng, cuối OR lại;
//  - not: rlo := NOT rlo; coil: ghi rlo / NOT rlo mỗi scan;
//    set/reset: chỉ ghi khi rlo;
//  - std box: LUÔN callSys (không bọc if EN); rlo sau = output Q-like
//    (OQ-184/185); compare: rlo := EN AND cmp;
//  - math/MOVE/CONVERT/NORM_X/SCALE_X/LIMIT/MIN/MAX: chỉ chạy khi EN
//    (bọc if (__rlo)), rlo sau = ENO = EN (không đổi).

import { hasErrors, sortDiagnostics } from '@vcs/schemas';
import type { Diagnostic, TagDef } from '@vcs/schemas';
import type { IrBlock, IrExpr, IrLValue, IrProgram, IrStmt, IrType } from '@vcs/runtime-iec';
import { obNumber } from '../scl/lower.js';
import { createCompileContext, programFromCtx } from '../scl/compile.js';
import type { CompileContext } from '../scl/compile.js';
import { convertModeFor, widen } from '../scl/typecheck.js';
import { parseLadBlock } from './schema.js';
import type { LadBlock } from './schema.js';
import { validateLad } from './validate.js';
import type { ValidatedBox, ValidatedElement, ValidatedLad } from './validate.js';

// ---------------------------------------------------------- hạ IR

export function lowerLad(validated: ValidatedLad): { block: IrBlock; networkMap: Record<string, number[]> } {
  const body: IrStmt[] = [];
  const networkMap: Record<string, number[]> = {};
  for (const net of validated.networks) {
    const start = body.length;
    body.push(assignStmt({ k: 'local', name: net.rloTemp }, constBool(true)));
    for (const el of net.rung) {
      lowerElement(el, net.rloTemp, body);
    }
    networkMap[net.id] = range(start, body.length);
  }
  const number =
    validated.kind === 'OB' ? (validated.number ?? obNumber(validated.name)) : undefined;
  const block: IrBlock = {
    id: validated.name.toLowerCase(),
    kind: validated.kind,
    name: validated.name,
    ...(number !== undefined ? { number } : {}),
    interface: validated.irInterface,
    body,
  };
  return { block, networkMap };
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}

function lowerElement(el: ValidatedElement, rlo: string, out: IrStmt[]): void {
  switch (el.t) {
    case 'contact': {
      const v = el.operand.expr;
      const gated = el.mode === 'NO' ? v : unary('not', v);
      out.push(assignStmt({ k: 'local', name: rlo }, binary('and', loadBool(rlo), gated, 'Bool')));
      return;
    }
    case 'pos':
    case 'neg': {
      const v = el.operand.expr;
      const m = el.memBit.expr;
      const edge =
        el.t === 'pos'
          ? binary('and', v, unary('not', m), 'Bool')
          : binary('and', unary('not', v), m, 'Bool');
      out.push(assignStmt({ k: 'local', name: rlo }, binary('and', loadBool(rlo), edge, 'Bool')));
      out.push(assignStmt(el.memBit.ref, v));
      return;
    }
    case 'not':
      out.push(assignStmt({ k: 'local', name: rlo }, unary('not', loadBool(rlo))));
      return;
    case 'coil': {
      const value = el.mode === 'normal' ? loadBool(rlo) : unary('not', loadBool(rlo));
      out.push(assignStmt(el.operand.ref, value));
      return;
    }
    case 'set':
      out.push(ifStmt(loadBool(rlo), [assignStmt(el.operand.ref, constBool(true))]));
      return;
    case 'reset':
      out.push(ifStmt(loadBool(rlo), [assignStmt(el.operand.ref, constBool(false))]));
      return;
    case 'parallel': {
      for (let i = 0; i < el.branches.length; i++) {
        const temp = el.branchTemps[i] as string;
        out.push(assignStmt({ k: 'local', name: temp }, loadBool(rlo)));
        const branch = el.branches[i] as ValidatedElement[];
        for (const sub of branch) lowerElement(sub, temp, out);
      }
      let acc: IrExpr = loadBool(el.branchTemps[0] as string);
      for (let i = 1; i < el.branchTemps.length; i++) {
        acc = binary('or', acc, loadBool(el.branchTemps[i] as string), 'Bool');
      }
      out.push(assignStmt({ k: 'local', name: rlo }, acc));
      return;
    }
    case 'box':
      lowerBox(el.box, rlo, out);
      return;
  }
}

function lowerBox(box: ValidatedBox, rlo: string, out: IrStmt[]): void {
  switch (box.kind) {
    case 'std': {
      out.push({
        op: 'callSys',
        fn: box.fn,
        instance: box.instance,
        inArgs: box.inputs.map((i) => [i.name, convertIfNeeded(i.type, i.expr, i.target ?? i.type)] as [string, IrExpr]),
        outArgs: box.outputs.map((o) => [o.name, o.ref] as [string, IrLValue]),
      });
      // rlo sau = output Q-like của instance (OQ-184).
      const qRef = qLikeRef(box.instance, box.qLike);
      out.push(assignStmt({ k: 'local', name: rlo }, { op: 'load', type: 'Bool', ref: qRef }));
      return;
    }
    case 'compare': {
      const [a, b] = box.inputs;
      const cmp = binary(cmpFn(box.fn), convertIfNeeded(a.type, a.expr, box.common), convertIfNeeded(b.type, b.expr, box.common), 'Bool');
      out.push(assignStmt({ k: 'local', name: rlo }, binary('and', loadBool(rlo), cmp, 'Bool')));
      return;
    }
    case 'math': {
      const [a, b] = box.inputs;
      const expr = binary(mathFn(box.fn), convertIfNeeded(a.type, a.expr, box.resultType), convertIfNeeded(b.type, b.expr, box.resultType), box.resultType);
      out.push(ifStmt(loadBool(rlo), [assignStmt(box.out.ref, convertIfNeeded(box.resultType, expr, box.out.type))]));
      return;
    }
    case 'move': {
      out.push(ifStmt(loadBool(rlo), [assignStmt(box.out.ref, convertIfNeeded(box.input.type, box.input.expr, box.out.type))]));
      return;
    }
    case 'convert': {
      const value: IrExpr =
        box.input.type === box.out.type
          ? box.input.expr
          : {
              op: 'convert',
              from: box.input.type,
              to: box.out.type,
              a: box.input.expr,
              ...(box.mode !== undefined ? { mode: box.mode } : {}),
            };
      out.push(ifStmt(loadBool(rlo), [assignStmt(box.out.ref, value)]));
      return;
    }
    case 'normScale': {
      const args = box.inputs.map((i) => convertIfNeeded(i.type, i.expr, box.target));
      const expr: IrExpr = { op: 'intrinsic', fn: box.fn, type: box.target, args };
      out.push(ifStmt(loadBool(rlo), [assignStmt(box.out.ref, convertIfNeeded(box.target, expr, box.out.type))]));
      return;
    }
    case 'limitMinMax': {
      const args = box.inputs.map((i) => convertIfNeeded(i.type, i.expr, box.resultType));
      const expr: IrExpr = { op: 'intrinsic', fn: box.fn, type: box.resultType, args };
      out.push(ifStmt(loadBool(rlo), [assignStmt(box.out.ref, convertIfNeeded(box.resultType, expr, box.out.type))]));
      return;
    }
  }
}

/** Ref tới output Q-like của instance (local → static path, DB → dbField). */
function qLikeRef(instance: IrLValue, qLike: string): IrLValue {
  if (instance.k === 'local') return { k: 'static', path: [instance.name, qLike] };
  if (instance.k === 'dbField') return { k: 'dbField', db: instance.db, path: [qLike] };
  throw new Error('lowerLad: instance std box phải là local hoặc dbField');
}

function cmpFn(fn: 'EQ' | 'NE' | 'LT' | 'LE' | 'GT' | 'GE'): 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge' {
  return ({ EQ: 'eq', NE: 'ne', LT: 'lt', LE: 'le', GT: 'gt', GE: 'ge' } as const)[fn];
}

function mathFn(fn: 'ADD' | 'SUB' | 'MUL' | 'DIV'): 'add' | 'sub' | 'mul' | 'div' {
  return ({ ADD: 'add', SUB: 'sub', MUL: 'mul', DIV: 'div' } as const)[fn];
}

// ---------------------------------------------------------- helpers IR

function assignStmt(target: IrLValue, value: IrExpr): IrStmt {
  return { op: 'assign', target, value };
}

function ifStmt(cond: IrExpr, then: IrStmt[]): IrStmt {
  return { op: 'if', cond, then, elsif: [], else: [] };
}

function constBool(value: boolean): IrExpr {
  return { op: 'const', type: 'Bool', value };
}

function loadBool(name: string): IrExpr {
  return { op: 'load', type: 'Bool', ref: { k: 'local', name } };
}

function unary(fn: 'not' | 'neg' | 'bnot', a: IrExpr): IrExpr {
  return { op: 'unary', fn, type: 'Bool', a };
}

function binary(fn: 'and' | 'or' | 'xor' | 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge' | 'add' | 'sub' | 'mul' | 'div', a: IrExpr, b: IrExpr, type: IrType): IrExpr {
  return { op: 'binary', fn, type, a, b };
}

/**
 * Chuyển kiểu khi mở rộng (giống convertIfNeeded của SCL lower): bằng
 * nhau → giữ nguyên; widen → node convert (mode từ convertModeFor);
 * ngược lại → lỗi ồn ào (validate phải chặn trước).
 */
function convertIfNeeded(from: IrType, expr: IrExpr, to: IrType): IrExpr {
  if (from === to) return expr;
  if (typeof from === 'string' && typeof to === 'string' && widen(from, to)) {
    const mode = convertModeFor(from, to);
    return { op: 'convert', from, to, a: expr, ...(mode !== undefined ? { mode } : {}) };
  }
  throw new Error(`lowerLad: không chuyển được ${typeName(from)} → ${typeName(to)} (validate phải chặn)`);
}

function typeName(t: IrType): string {
  if (typeof t === 'string') return t;
  if (t.kind === 'struct') return t.name ?? 'Struct';
  return `Array[${String(t.lo)}..${String(t.hi)}] of ${typeName(t.elem)}`;
}

// ---------------------------------------------------------- compile

export interface CompileLadOptions {
  tags?: TagDef[] | undefined;
  ctx?: CompileContext | undefined;
  fileName?: string | undefined;
}

export interface CompileLadResult {
  program: IrProgram;
  networkMap: Record<string, number[]>;
  diagnostics: Diagnostic[];
}

/**
 * Biên dịch một LadBlock (JSON hoặc object đã parse) thành IrProgram.
 * Lỗi parse/validate → program rỗng theo ctx hiện tại + diagnostics.
 */
export function compileLad(input: unknown, opts: CompileLadOptions = {}): CompileLadResult {
  const fileName = opts.fileName ?? 'lad.json';
  const ctx = opts.ctx ?? createCompileContext();
  const parsed = parseLadBlock(input, fileName);
  if (parsed.block === undefined) {
    return { program: programFromCtx(ctx), networkMap: {}, diagnostics: sortDiagnostics(parsed.diagnostics) };
  }
  const validated = validateLad(parsed.block, { tags: opts.tags, ctx, fileName });
  if (hasErrors(validated.diagnostics)) {
    return { program: programFromCtx(ctx), networkMap: {}, diagnostics: sortDiagnostics(validated.diagnostics) };
  }
  const { block, networkMap } = lowerLad(validated);
  ctx.blocks.set(block.id, block);
  return { program: programFromCtx(ctx), networkMap, diagnostics: [] };
}

/** Biên dịch trực tiếp một LadBlock đã có (bỏ qua bước parse zod). */
export function compileLadBlock(block: LadBlock, opts: CompileLadOptions = {}): CompileLadResult {
  const fileName = opts.fileName ?? 'lad.json';
  const ctx = opts.ctx ?? createCompileContext();
  const validated = validateLad(block, { tags: opts.tags, ctx, fileName });
  if (hasErrors(validated.diagnostics)) {
    return { program: programFromCtx(ctx), networkMap: {}, diagnostics: sortDiagnostics(validated.diagnostics) };
  }
  const { block: irBlock, networkMap } = lowerLad(validated);
  ctx.blocks.set(irBlock.id, irBlock);
  return { program: programFromCtx(ctx), networkMap, diagnostics: [] };
}
