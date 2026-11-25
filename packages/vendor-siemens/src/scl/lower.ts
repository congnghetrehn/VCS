// Lower AST → IR — @vcs/vendor-siemens (M1 §6, P1.3).
// AST đã typecheck → IrProgram. KHÔNG kiểm tra lại kiểu: mọi kiểu lấy từ
// TypecheckResult.types (side-table keyed by node); thiếu kiểu hoặc cấu trúc
// typecheck đã phải chặn mà vẫn tới đây = lỗi nội bộ → throw ồn ào, không
// đoán mò. Chỉ tra cứu thêm BlockSymbols (fold VAR_CONSTANT, tên FC trả).
//
// Quy tắc chèn `convert` (widening ngầm định §4.4 — chỉ widening, không
// thu hẹp; thu hẹp đã bị SCL-T010 chặn ở typecheck):
// - hai vế nhị phân → commonType (vd Int + DInt: trái Int→DInt);
// - giá trị gán / arg IN → kiểu đích (vd `#scaled := #raw * 2`: convert
//   Int→Real bọc NGOÀI phép mul, không bọc toán hạng — bảng B);
// - `**` → intrinsic POWER, hai vế convert về kiểu kết quả (Real/LReal).
// - intrinsic: X_TO_Y / ROUND / TRUNC → node `convert` trực tiếp;
//   SQRT/MIN/MAX/LIMIT/NORM_X/SCALE_X → arg convert về kiểu đích rồi
//   mới gọi `intrinsic`.
// - VAR_CONSTANT ref → fold thành literal; phép tính hằng KHÔNG fold
//   (IR trung thực với nguồn, P1.4 tính — bảng D-a).
//
// Quy tắc lvalue (mở rộng plan ở 2 điểm, xem STATE §18 "Lệch so với plan"):
// - `#x` trần → `local`; `#x.field...` (chỉ member, chưa qua index) →
//   `static` path `[x, field, ...]` — plan chỉ nêu member của instance FB,
//   struct local dùng cùng cơ chế vì `local` không có path;
// - member sau một index (`#a[0].field`) → variant `member` (mới thêm ở
//   ir.ts: `static.path` chỉ chứa string, không biểu diễn được index xen giữa).
// - `"DB".field` → `dbField`; `%I0.0`/`DB1.DBW4` → `abs`/`absDb` (type theo
//   OQ-110, đã có trong types map; width bit → 8 + bit).

import type {
  IrBlock,
  IrDb,
  IrExpr,
  IrInterface,
  IrLValue,
  IrProgram,
  IrStmt,
  IrType,
  IrUdt,
  SrcRef,
} from '@vcs/runtime-iec';
import { stdBlockInterface } from '@vcs/runtime-iec';
import {
  classifyIntrinsic,
  commonType,
  convertModeFor,
  evalConst,
  interfaceFromSymbols,
  intrinsicArgTarget,
  irTypeEquals,
  isPrimitive,
  widen,
} from './typecheck.js';
import type { BlockSymbols, IntrinsicInfo, TypecheckResult } from './typecheck.js';
import type {
  CallExpr,
  CallStmt,
  FbBlock,
  FcBlock,
  ObBlock,
  SclCallArg,
  SclExpr,
  SclFile,
  SclLValue,
  SclStmt,
  SrcLoc,
} from './ast.js';

/** Toán tử nhị phân AST → BinFn (parser chuẩn hóa về các chuỗi này; `&` là
 * dạng viết khác của AND — map phòng thủ). */
const BIN_FN: Record<string, 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge' | 'and' | 'or' | 'xor'> = {
  '+': 'add',
  '-': 'sub',
  '*': 'mul',
  '/': 'div',
  DIV: 'div',
  MOD: 'mod',
  '=': 'eq',
  '<>': 'ne',
  '<': 'lt',
  '<=': 'le',
  '>': 'gt',
  '>=': 'ge',
  AND: 'and',
  '&': 'and',
  OR: 'or',
  XOR: 'xor',
};

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

class Lowerer {
  private readonly file: SclFile;
  private readonly checked: TypecheckResult;
  private readonly fileName: string;

  constructor(file: SclFile, checked: TypecheckResult, fileName: string) {
    this.file = file;
    this.checked = checked;
    this.fileName = fileName;
  }

  private src(loc: SrcLoc): SrcRef {
    return {
      file: this.fileName,
      line: loc.line,
      col: loc.col,
      endLine: loc.endLine,
      endCol: loc.endCol,
    };
  }

  /** Kiểu đã typecheck của một node; thiếu = lỗi nội bộ → throw. */
  private typeOf(node: SclExpr | SclLValue): IrType {
    const t = this.checked.types.get(node);
    if (t === undefined) {
      throw new Error(`lower: thiếu kiểu cho node (${String(node.loc.line)}:${String(node.loc.col)}) — typecheck chưa ghi types map`);
    }
    return t;
  }

  /** Bọc convert khi widening; bằng nhau thì giữ nguyên. Khác kiểu mà
   * không phải widening = lỗi nội bộ (typecheck đã phải chặn) → throw. */
  private convertIfNeeded(e: IrExpr, from: IrType, to: IrType): IrExpr {
    if (irTypeEquals(from, to)) return e;
    if (isPrimitive(from) && isPrimitive(to) && widen(from, to)) {
      return { op: 'convert', from, to, a: e };
    }
    throw new Error(
      `lower: không convert được ${JSON.stringify(from)} → ${JSON.stringify(to)} (không phải widening)`,
    );
  }

  /** Symbols của một block (file hoặc ctx — typecheck đã cache cả hai). */
  private symbolsOf(blockName: string): BlockSymbols {
    const syms = this.checked.blocks.get(blockName.toLowerCase());
    if (syms === undefined) {
      throw new Error(`lower: thiếu symbols cho block '${blockName}'`);
    }
    return syms;
  }

  run(): IrProgram {
    const blocks: IrBlock[] = [];
    const dbs: IrDb[] = [...this.checked.dbs.values()].sort(byId);
    const udts: IrUdt[] = [...this.checked.udts.values()].sort(byId);
    const organization: IrProgram['organization'] = [];
    for (const b of this.file.blocks) {
      if (b.kind === 'OB' || b.kind === 'FC' || b.kind === 'FB') {
        blocks.push(this.lowerBlock(b));
      }
    }
    blocks.sort(byId);
    for (const b of blocks) {
      if (b.kind === 'OB' && b.number !== undefined) {
        organization.push({ ob: b.number, block: b.name });
      }
    }
    organization.sort((a, b) => a.ob - b.ob);
    return { blocks, dbs, udts, organization };
  }

  private lowerBlock(block: ObBlock | FcBlock | FbBlock): IrBlock {
    const syms = this.symbolsOf(block.name);
    const iface = this.lowerInterface(block, syms);
    const body = this.lowerStmts(block.body, block, syms);
    const out: IrBlock = {
      id: block.name,
      kind: block.kind,
      name: block.name,
      interface: iface,
      body,
      src: this.src(block.loc),
    };
    if (block.kind === 'OB') {
      const n = obNumber(block.name);
      if (n !== undefined) out.number = n;
    }
    return out;
  }

  /** Interface từ BlockSymbols + local tổng hợp cho giá trị trả FC (OQ-112)
   * + returnType (chỉ FC). */
  private lowerInterface(block: ObBlock | FcBlock | FbBlock, syms: BlockSymbols): IrInterface {
    const iface = interfaceFromSymbols(syms);
    if (block.kind === 'FC') {
      const rt = this.checked.returnTypes.get(block.name.toLowerCase());
      if (rt !== undefined) {
        iface.returnType = rt;
        iface.temp = [...iface.temp, { name: block.name, type: rt }];
      }
    }
    return iface;
  }

  // ---------------------------------------------------------- lvalue

  private lowerLValue(lv: SclLValue, block: ObBlock | FcBlock | FbBlock, syms: BlockSymbols): IrLValue {
    const base = lv.base;
    let current: IrLValue;
    if (base.kind === 'local') {
      // Tên FC = local tổng hợp chứa giá trị trả (OQ-112).
      current = { k: 'local', name: base.name };
    } else if (base.kind === 'global') {
      // Gán/đọc tên FC của chính block đó ở dạng quoted ("FC_A" — OQ-112):
      // local tổng hợp chứa giá trị trả, không phải dbField. Dạng #FC_A đã
      // vào nhánh local ở trên. So sánh không phân biệt hoa/thường.
      if (block.kind === 'FC' && base.name.toLowerCase() === block.name.toLowerCase()) {
        current = { k: 'local', name: block.name };
      } else {
        current = { k: 'dbField', db: base.name, path: [] };
      }
    } else {
      // Địa chỉ tuyệt đối: path phải rỗng (member/index trên abs đã bị T005
      // chặn ở typecheck).
      if (lv.path.length > 0) {
        throw new Error('lower: địa chỉ tuyệt đối có path — typecheck phải chặn (T005)');
      }
      const addr = base.address;
      const width = addr.width === 1 ? 8 : addr.width;
      const type = this.typeOf(lv);
      if (!isPrimitive(type)) {
        throw new Error('lower: kiểu địa chỉ tuyệt đối phải là primitive');
      }
      if (addr.kind === 'area') {
        current = {
          k: 'abs',
          area: addr.area,
          byte: addr.byte,
          ...(addr.bit !== undefined ? { bit: addr.bit } : {}),
          width,
          type,
        };
      } else {
        current = {
          k: 'absDb',
          db: addr.db,
          byte: addr.byte,
          ...(addr.bit !== undefined ? { bit: addr.bit } : {}),
          width,
          type,
        };
      }
      return current;
    }
    for (const elem of lv.path) {
      if (elem.kind === 'member') {
        if (current.k === 'local') {
          current = { k: 'static', path: [current.name, elem.name] };
        } else if (current.k === 'static' || current.k === 'dbField') {
          current = { ...current, path: [...current.path, elem.name] };
        } else {
          // index/member: member sau index (hoặc sau member) — variant member.
          // (abs/absDb không tới được đây: đã return sớm ở trên.)
          current = { k: 'member', base: current, field: elem.name };
        }
      } else {
        const index = this.lowerExpr(elem.index, block, syms);
        current = { k: 'index', base: current, index };
      }
    }
    return current;
  }

  // ---------------------------------------------------------- expr

  private lowerExpr(expr: SclExpr, block: ObBlock | FcBlock | FbBlock, syms: BlockSymbols): IrExpr {
    switch (expr.kind) {
      case 'literal': {
        const value = expr.literal.value;
        if (typeof value !== 'number' && typeof value !== 'boolean') {
          throw new Error('lower: literal không phải số/Bool — typecheck phải chặn');
        }
        return { op: 'const', type: this.typeOf(expr), value };
      }
      case 'ref': {
        const lv = expr.ref;
        // Fold ref VAR_CONSTANT thành literal (D-a); chỉ ref trần, không path.
        if (lv.base.kind === 'local' && lv.path.length === 0) {
          const lower = lv.base.name.toLowerCase();
          if (
            block.kind === 'FC' &&
            lower === block.name.toLowerCase()
          ) {
            // `#FC_Name` = giá trị trả (OQ-112): load local tổng hợp.
            return { op: 'load', type: this.typeOf(expr), ref: { k: 'local', name: block.name } };
          }
          const sym = syms.vars.get(lower);
          if (sym !== undefined && sym.section === 'const') {
            if (sym.init === undefined) {
              throw new Error(`lower: VAR_CONSTANT '${sym.name}' chưa có giá trị — typecheck phải tính (T008)`);
            }
            return { op: 'const', type: this.typeOf(expr), value: sym.init };
          }
        }
        return { op: 'load', type: this.typeOf(expr), ref: this.lowerLValue(lv, block, syms) };
      }
      case 'unary': {
        if (expr.op === '+') return this.lowerExpr(expr.operand, block, syms);
        const a = this.lowerExpr(expr.operand, block, syms);
        const operandType = this.typeOf(expr.operand);
        const fn = expr.op === '-' ? 'neg' : operandType === 'Bool' ? 'not' : 'bnot';
        return { op: 'unary', fn, type: this.typeOf(expr), a };
      }
      case 'binary': {
        const resultType = this.typeOf(expr);
        const left = this.lowerExpr(expr.left, block, syms);
        const right = this.lowerExpr(expr.right, block, syms);
        if (expr.op === '**') {
          // `**` → intrinsic POWER, hai vế về kiểu kết quả (OQ-114).
          return {
            op: 'intrinsic',
            fn: 'POWER',
            type: resultType,
            args: [
              this.convertIfNeeded(left, this.typeOf(expr.left), resultType),
              this.convertIfNeeded(right, this.typeOf(expr.right), resultType),
            ],
          };
        }
        const fn = BIN_FN[expr.op];
        if (fn === undefined) {
          throw new Error(`lower: toán tử nhị phân không biết: '${expr.op}'`);
        }
        const lt = this.typeOf(expr.left);
        const rt = this.typeOf(expr.right);
        const common = commonType(lt, rt) ?? (irTypeEquals(lt, rt) ? lt : undefined);
        if (common === undefined) {
          throw new Error(
            `lower: không có kiểu chung cho ${JSON.stringify(lt)} và ${JSON.stringify(rt)} — typecheck phải chặn`,
          );
        }
        return {
          op: 'binary',
          fn,
          type: resultType,
          a: this.convertIfNeeded(left, lt, common),
          b: this.convertIfNeeded(right, rt, common),
        };
      }
      case 'call':
        return this.lowerCallExpr(expr, block, syms);
    }
  }

  /** Hạ một call trong biểu thức: intrinsic hoặc FC. FB/OB/system FB đã bị
   * typecheck chặn (T004) nên tới đây là lỗi nội bộ → throw. */
  private lowerCallExpr(expr: CallExpr, block: ObBlock | FcBlock | FbBlock, syms: BlockSymbols): IrExpr {
    const callee = expr.callee;
    if (callee.kind === 'abs') {
      throw new Error('lower: gọi địa chỉ tuyệt đối trong biểu thức — typecheck phải chặn (T004)');
    }
    if (callee.kind === 'local') {
      throw new Error('lower: gọi FB instance trong biểu thức — typecheck phải chặn (T004)');
    }
    const intrinsic = classifyIntrinsic(callee.name);
    if (intrinsic !== undefined) {
      return this.lowerIntrinsicCall(callee.name, intrinsic, expr.args, expr, block, syms);
    }
    const target = this.fcTarget(callee.name);
    if (target === undefined) {
      throw new Error(`lower: không tìm được FC '${callee.name}' — typecheck phải chặn (T001)`);
    }
    const { args } = this.lowerFcArgs(expr.args, target.iface, block, syms);
    return { op: 'callFcExpr', block: target.name, args, type: this.typeOf(expr) };
  }

  /** Hạ call intrinsic (OQ-115): X_TO_Y / ROUND / TRUNC → node `convert`
   * trực tiếp; còn lại → `intrinsic` (arg convert về kiểu đích trước). */
  private lowerIntrinsicCall(
    name: string,
    info: IntrinsicInfo,
    args: SclCallArg[],
    expr: SclExpr,
    block: ObBlock | FcBlock | FbBlock,
    syms: BlockSymbols,
  ): IrExpr {
    const resultType = this.typeOf(expr);
    const positional = args.filter((a) => a.kind === 'positional');
    if (info.kind === 'convert') {
      if (positional.length !== 1 || positional[0] === undefined) {
        throw new Error(`lower: hàm '${name}' cần đúng 1 tham số vị trí — typecheck phải chặn (T004)`);
      }
      const a = this.lowerExpr(positional[0].value, block, syms);
      const mode = convertModeFor(info.from, info.to);
      return {
        op: 'convert',
        from: info.from,
        to: info.to,
        ...(mode !== undefined ? { mode } : {}),
        a,
      };
    }
    if (info.kind === 'roundConvert') {
      if (positional.length !== 1 || positional[0] === undefined) {
        throw new Error(`lower: hàm '${name}' cần đúng 1 tham số vị trí — typecheck phải chặn (T004)`);
      }
      const arg = positional[0];
      const a = this.lowerExpr(arg.value, block, syms);
      return { op: 'convert', from: this.typeOf(arg.value), to: 'DInt', mode: info.mode, a };
    }
    const fn = info.fn;
    const lowered = positional.map((a) => this.lowerExpr(a.value, block, syms));
    const argTypes = positional.map((a) => this.typeOf(a.value));
    let converted: IrExpr[];
    if (fn === 'SQRT' || fn === 'MIN' || fn === 'MAX' || fn === 'LIMIT') {
      // SQRT trả Real/LReal; MIN/MAX/LIMIT trả kiểu chung — arg về kiểu kết quả.
      converted = lowered.map((e, i) => {
        const t = argTypes[i];
        if (t === undefined) throw new Error('lower: thiếu kiểu đối số intrinsic');
        return this.convertIfNeeded(e, t, resultType);
      });
    } else if (fn === 'NORM_X' || fn === 'SCALE_X') {
      const target = argTypes.includes('LReal') ? 'LReal' : (intrinsicArgTarget(name, 0) ?? 'Real');
      converted = lowered.map((e, i) => {
        const t = argTypes[i];
        if (t === undefined) throw new Error('lower: thiếu kiểu đối số intrinsic');
        return this.convertIfNeeded(e, t, target);
      });
    } else {
      converted = lowered;
    }
    return { op: 'intrinsic', fn, type: resultType, args: converted };
  }

  // ---------------------------------------------------------- call: tra cứu

  /** Interface + kiểu trả của một FC theo tên (file hoặc ctx). Tra cứu
   * không phân biệt hoa/thường — typecheck đã kiểm tên đúng quy tắc
   * (ident) / đúng chính tả (global) trước khi lower. */
  private fcTarget(name: string): { name: string; iface: IrInterface; returnType?: IrType } | undefined {
    const syms = this.checked.blocks.get(name.toLowerCase());
    if (syms === undefined) return undefined;
    const iface = interfaceFromSymbols(syms);
    const returnType = this.checked.returnTypes.get(name.toLowerCase());
    const out: { name: string; iface: IrInterface; returnType?: IrType } = {
      name: syms.blockId,
      iface,
    };
    if (returnType !== undefined) out.returnType = returnType;
    return out;
  }

  /** Interface của một FB theo tên kiểu (file hoặc ctx). */
  private fbInterface(fbType: string): IrInterface {
    const syms = this.checked.blocks.get(fbType.toLowerCase());
    if (syms === undefined) {
      throw new Error(`lower: không tìm được FB '${fbType}' — typecheck phải chặn (T001)`);
    }
    return interfaceFromSymbols(syms);
  }

  /** Tìm tham số trong interface (không phân biệt hoa/thường). */
  private findParam(
    iface: IrInterface,
    name: string,
  ): { name: string; section: 'input' | 'output' | 'inout'; type: IrType } | undefined {
    const lower = name.toLowerCase();
    const search = (
      section: 'input' | 'output' | 'inout',
      list: IrInterface[typeof section],
    ): { name: string; section: 'input' | 'output' | 'inout'; type: IrType } | undefined => {
      const v = list.find((x) => x.name.toLowerCase() === lower);
      return v === undefined ? undefined : { name: v.name, section, type: v.type };
    };
    return search('input', iface.input) ?? search('output', iface.output) ?? search('inout', iface.inout);
  }

  // ---------------------------------------------------------- call: hạ arg

  /** Hạ giá trị arg IN (biểu thức) về kiểu tham số (chèn convert widening). */
  private lowerArgValue(value: SclExpr, paramType: IrType, block: ObBlock | FcBlock | FbBlock, syms: BlockSymbols): IrExpr {
    const lowered = this.lowerExpr(value, block, syms);
    return this.convertIfNeeded(lowered, this.typeOf(value), paramType);
  }

  /** Hạ arg của call FC → danh sách `[tên, expr]` + `ret` (khi có `Q =>`).
   * Arg positional đặt tên theo thứ tự khai báo input rồi inout (OQ-123);
   * IN_OUT của FC đã bị T004 chặn ở typecheck (OQ-128) nên không tới đây. */
  private lowerFcArgs(
    args: SclCallArg[],
    iface: IrInterface,
    block: ObBlock | FcBlock | FbBlock,
    syms: BlockSymbols,
  ): { args: [string, IrExpr][]; ret?: IrLValue } {
    const positionalParams = [...iface.input, ...iface.inout];
    const out: [string, IrExpr][] = [];
    let ret: IrLValue | undefined;
    let posIdx = 0;
    for (const arg of args) {
      if (arg.kind === 'positional') {
        const param = positionalParams[posIdx];
        posIdx += 1;
        if (param === undefined) {
          throw new Error('lower: tham số positional thừa — typecheck phải chặn (T004)');
        }
        out.push([param.name, this.lowerArgValue(arg.value, param.type, block, syms)]);
        continue;
      }
      if (arg.kind === 'named') {
        const param = this.findParam(iface, arg.name);
        if (param === undefined || param.section === 'output') {
          throw new Error(`lower: tham số '${arg.name}' không hợp lệ cho FC — typecheck phải chặn (T004)`);
        }
        out.push([param.name, this.lowerArgValue(arg.value, param.type, block, syms)]);
        continue;
      }
      // namedOut: chỉ `Q =>` (giá trị trả) được phép ở dạng statement.
      ret = this.lowerLValue(arg.target, block, syms);
    }
    const result: { args: [string, IrExpr][]; ret?: IrLValue } = { args: out };
    if (ret !== undefined) result.ret = ret;
    return result;
  }

  /** Hạ arg của call FB → inArgs / outArgs / inoutArgs. */
  private lowerFbArgs(
    args: SclCallArg[],
    iface: IrInterface,
    block: ObBlock | FcBlock | FbBlock,
    syms: BlockSymbols,
  ): {
    inArgs: [string, IrExpr][];
    outArgs: [string, IrLValue][];
    inoutArgs: [string, IrLValue][];
  } {
    const inArgs: [string, IrExpr][] = [];
    const outArgs: [string, IrLValue][] = [];
    const inoutArgs: [string, IrLValue][] = [];
    for (const arg of args) {
      if (arg.kind === 'positional') {
        throw new Error('lower: FB dùng tham số positional — typecheck phải chặn (T004)');
      }
      if (arg.kind === 'named') {
        const param = this.findParam(iface, arg.name);
        if (param === undefined) {
          throw new Error(`lower: tham số '${arg.name}' không tồn tại — typecheck phải chặn (T004)`);
        }
        if (param.section === 'input') {
          inArgs.push([param.name, this.lowerArgValue(arg.value, param.type, block, syms)]);
        } else if (param.section === 'inout') {
          if (arg.value.kind !== 'ref') {
            throw new Error(`lower: tham số IN_OUT '${arg.name}' phải là lvalue — typecheck phải chặn (T004)`);
          }
          inoutArgs.push([param.name, this.lowerLValue(arg.value.ref, block, syms)]);
        } else {
          throw new Error(`lower: tham số OUT '${arg.name}' phải dùng '=>' — typecheck phải chặn (T004)`);
        }
        continue;
      }
      const param = this.findParam(iface, arg.name);
      if (param === undefined || param.section !== 'output') {
        throw new Error(`lower: tham số OUT '${arg.name}' không hợp lệ — typecheck phải chặn (T004)`);
      }
      outArgs.push([param.name, this.lowerLValue(arg.target, block, syms)]);
    }
    return { inArgs, outArgs, inoutArgs };
  }

  /** Hạ call dạng statement → callFb / callFc / callSys (std block, P1.5).
   * Intrinsic, OB, gọi FB bằng tên kiểu đã bị typecheck chặn nên tới đây
   * là lỗi nội bộ. */
  private lowerCallStmt(stmt: CallStmt, block: ObBlock | FcBlock | FbBlock, syms: BlockSymbols): IrStmt {
    const callee = stmt.callee;
    const src = this.src(stmt.loc);
    if (callee.kind === 'abs') {
      throw new Error('lower: gọi địa chỉ tuyệt đối dạng statement — typecheck phải chặn (T004)');
    }
    if (callee.kind === 'ident') {
      if (classifyIntrinsic(callee.name) !== undefined) {
        throw new Error(`lower: intrinsic '${callee.name}' gọi dạng statement — typecheck phải chặn (T004)`);
      }
      const target = this.fcTarget(callee.name);
      if (target === undefined) {
        throw new Error(`lower: không tìm được FC '${callee.name}' — typecheck phải chặn (T001)`);
      }
      const { args, ret } = this.lowerFcArgs(stmt.args, target.iface, block, syms);
      const out: IrStmt = { op: 'callFc', block: target.name, args, src };
      if (ret !== undefined) out.ret = ret;
      return out;
    }
    if (callee.kind === 'local') {
      const sym = syms.vars.get(callee.name.toLowerCase());
      if (sym === undefined || sym.fbType === undefined) {
        throw new Error(`lower: '#${callee.name}' không phải instance FB — typecheck phải chặn (T004)`);
      }
      const stdIface = stdBlockInterface(sym.fbType);
      if (stdIface !== undefined) {
        // System block local (#sT(...)) → callSys (P1.5); std không có
        // IN_OUT nên inoutArgs gặp phải là lỗi nội bộ (typecheck đã chặn).
        const { inArgs, outArgs, inoutArgs } = this.lowerFbArgs(stmt.args, stdIface, block, syms);
        if (inoutArgs.length > 0) {
          throw new Error('lower: system block không có IN_OUT — typecheck phải chặn (T004)');
        }
        return {
          op: 'callSys',
          fn: sym.fbType.toUpperCase(),
          instance: { k: 'local', name: callee.name },
          inArgs,
          outArgs,
          src,
        };
      }
      const fbSyms = this.symbolsOf(sym.fbType);
      const iface = interfaceFromSymbols(fbSyms);
      const { inArgs, outArgs, inoutArgs } = this.lowerFbArgs(stmt.args, iface, block, syms);
      return {
        op: 'callFb',
        instance: { k: 'local', name: callee.name },
        block: fbSyms.blockId,
        inArgs,
        outArgs,
        inoutArgs,
        src,
      };
    }
    // callee global: "DB" (instance FB) hoặc "FC" (gọi FC).
    const db = this.checked.dbs.get(callee.name.toLowerCase());
    if (db !== undefined) {
      if (db.fbName === undefined) {
        throw new Error(`lower: DB '${callee.name}' không phải instance FB — typecheck phải chặn (T004)`);
      }
      const stdIface = stdBlockInterface(db.fbName);
      if (stdIface !== undefined) {
        // System block global ("T1"(...)) → callSys (P1.5).
        const { inArgs, outArgs, inoutArgs } = this.lowerFbArgs(stmt.args, stdIface, block, syms);
        if (inoutArgs.length > 0) {
          throw new Error('lower: system block không có IN_OUT — typecheck phải chặn (T004)');
        }
        return {
          op: 'callSys',
          fn: db.fbName.toUpperCase(),
          instance: { k: 'dbField', db: callee.name, path: [] },
          inArgs,
          outArgs,
          src,
        };
      }
      const iface = this.fbInterface(db.fbName);
      const { inArgs, outArgs, inoutArgs } = this.lowerFbArgs(stmt.args, iface, block, syms);
      return {
        op: 'callFb',
        instance: { k: 'dbField', db: callee.name, path: [] },
        block: db.fbName,
        inArgs,
        outArgs,
        inoutArgs,
        src,
      };
    }
    const target = this.fcTarget(callee.name);
    if (target === undefined) {
      throw new Error(`lower: không tìm được FC '${callee.name}' — typecheck phải chặn (T001)`);
    }
    const { args, ret } = this.lowerFcArgs(stmt.args, target.iface, block, syms);
    const out: IrStmt = { op: 'callFc', block: target.name, args, src };
    if (ret !== undefined) out.ret = ret;
    return out;
  }

  // ---------------------------------------------------------- statement

  private lowerStmts(stmts: SclStmt[], block: ObBlock | FcBlock | FbBlock, syms: BlockSymbols): IrStmt[] {
    const out: IrStmt[] = [];
    for (const s of stmts) {
      const lowered = this.lowerStmt(s, block, syms);
      if (lowered !== undefined) out.push(lowered);
    }
    return out;
  }

  /** Hạ một statement; `empty` (`;` trơ) → undefined (không có node IR). */
  private lowerStmt(stmt: SclStmt, block: ObBlock | FcBlock | FbBlock, syms: BlockSymbols): IrStmt | undefined {
    switch (stmt.kind) {
      case 'empty':
        return undefined;
      case 'assign': {
        const target = this.lowerLValue(stmt.target, block, syms);
        const targetType = this.typeOf(stmt.target);
        const value = this.convertIfNeeded(
          this.lowerExpr(stmt.value, block, syms),
          this.typeOf(stmt.value),
          targetType,
        );
        return { op: 'assign', target, value, src: this.src(stmt.loc) };
      }
      case 'if':
        return {
          op: 'if',
          cond: this.lowerExpr(stmt.cond, block, syms),
          then: this.lowerStmts(stmt.then, block, syms),
          elsif: stmt.elsif.map((b) => ({
            cond: this.lowerExpr(b.cond, block, syms),
            body: this.lowerStmts(b.body, block, syms),
          })),
          else: stmt.else === undefined ? [] : this.lowerStmts(stmt.else, block, syms),
          src: this.src(stmt.loc),
        };
      case 'case': {
        return {
          op: 'case',
          sel: this.lowerExpr(stmt.sel, block, syms),
          arms: stmt.arms.map((arm) => ({
            labels: arm.labels.map((label) => {
              if (label.kind === 'range') {
                const lo = evalConst(label.lo, syms);
                const hi = evalConst(label.hi, syms);
                if ('error' in lo || 'error' in hi || typeof lo.value !== 'number' || typeof hi.value !== 'number') {
                  throw new Error('lower: label CASE không hằng — typecheck phải chặn (T008)');
                }
                return [lo.value, hi.value] as [number, number];
              }
              const v = evalConst(label, syms);
              if ('error' in v || typeof v.value !== 'number') {
                throw new Error('lower: label CASE không hằng — typecheck phải chặn (T008)');
              }
              return v.value;
            }),
            body: this.lowerStmts(arm.body, block, syms),
          })),
          else: stmt.else === undefined ? [] : this.lowerStmts(stmt.else, block, syms),
          src: this.src(stmt.loc),
        };
      }
      case 'for': {
        const varName =
          stmt.var.base.kind === 'local' ? stmt.var.base.name : undefined;
        if (varName === undefined || stmt.var.path.length > 0) {
          throw new Error('lower: biến vòng lặp FOR phải là local trần — typecheck phải chặn (T003)');
        }
        const out: IrStmt = {
          op: 'for',
          var: varName,
          from: this.lowerExpr(stmt.from, block, syms),
          to: this.lowerExpr(stmt.to, block, syms),
          body: this.lowerStmts(stmt.body, block, syms),
          src: this.src(stmt.loc),
        };
        if (stmt.by !== undefined) out.by = this.lowerExpr(stmt.by, block, syms);
        return out;
      }
      case 'while':
        return {
          op: 'while',
          cond: this.lowerExpr(stmt.cond, block, syms),
          body: this.lowerStmts(stmt.body, block, syms),
          src: this.src(stmt.loc),
        };
      case 'repeat':
        return {
          op: 'repeat',
          body: this.lowerStmts(stmt.body, block, syms),
          until: this.lowerExpr(stmt.until, block, syms),
          src: this.src(stmt.loc),
        };
      case 'exit':
        return { op: 'exit', src: this.src(stmt.loc) };
      case 'continue':
        return { op: 'continue', src: this.src(stmt.loc) };
      case 'return':
        return { op: 'return', src: this.src(stmt.loc) };
      case 'call':
        return this.lowerCallStmt(stmt, block, syms);
    }
  }
}

/** Số OB từ tên block (OQ-113): `Main` → 1, `OB<n>` → n, tên khác → undefined
 * (block vẫn biên dịch, không vào `organization`). */
export function obNumber(name: string): number | undefined {
  if (name.toLowerCase() === 'main') return 1;
  const m = /^OB(\d+)$/i.exec(name);
  if (m === null || m[1] === undefined) return undefined;
  return Number(m[1]);
}

/** Hạ một file SCL đã typecheck → IrProgram (chỉ block/DB/UDT của file này;
 * gộp nhiều file dùng `compileSclProgram` ở compile.ts). */
export function lowerFile(file: SclFile, checked: TypecheckResult, fileName: string): IrProgram {
  return new Lowerer(file, checked, fileName).run();
}
