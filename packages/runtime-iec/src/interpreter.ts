// Interpreter IR → closures — @vcs/runtime-iec (M1 §6–§8, P1.4).
// IR được biên dịch thành closure MỘT LẦN ở constructor (không duyệt cây
// mỗi scan); frame tạo mới mỗi lần gọi (TEMP reset về mặc định kiểu).
// Quy tắc số học §7.2 ở `arithmetic.ts`; intrinsic §7.3 ở `intrinsics.ts`.
// Lệch so với plan §19 (ghi ở STATE §19 "Lệch khi triển khai"):
// - Frame thêm `composite: Map<string, LocalValue>` cho biến local kiểu
//   mảng/struct (temp/vars chỉ chứa TagValue nên không đựng được chúng).
// - `Ref` thêm `elem`/`field` để điều hướng mảng/struct qua IN_OUT.
// - `Interpreter.nowMs` (public, SoftPlc đặt trước mỗi scan) để fault ghi
//   đúng thời điểm scan — IrExpr không có src nên fault lấy vị trí từ
//   statement chứa nó (plan §19 mục 5).

import { TagError } from '@vcs/kernel';
import type { TagValue } from '@vcs/schemas';
import {
  convertChecked,
  intBinary,
  intRange,
  normalizeScalar,
  wrapToInt,
} from './arithmetic.js';
import type { FaultCollector, RuntimeFault, RuntimeFaultCode } from './faults.js';
import { createIntrinsicRegistry, type IntrinsicRegistry } from './intrinsics.js';
import type {
  IrBlock,
  IrDb,
  IrExpr,
  IrField,
  IrLValue,
  IrProgram,
  IrStmt,
  IrType,
  PrimitiveType,
  SrcRef,
} from './ir.js';
import type { DbStore, MemoryArea, MemoryScalarType } from './memory.js';
import { sizeOf } from './types.js';

/** Tham chiếu tới một vị trí ghi được (dùng cho IN_OUT và `callSys`). */
export interface Ref {
  get(): TagValue;
  set(v: TagValue): void;
  /** Phần tử mảng (chỉ số tuyệt đối, đã gồm `lo`). */
  elem?(index: number): Ref;
  /** Field của struct. */
  field?(name: string): Ref;
}

/** View vào một DB/instance: store + danh sách field + offset gốc (byte). */
export interface DbView {
  store: DbStore;
  fields: IrField[];
  base: number;
}

/** Giá trị local kiểu mảng/struct trong frame (đệ quy). */
export type LocalValue = TagValue | LocalValue[] | Map<string, LocalValue>;

/** Frame thực thi một block (M1 §7.1). */
export interface Frame {
  /** VAR_TEMP + biến local FC (scalar) — Map mới mỗi lần gọi, trừ khi block
   * không có biến temp nào (dùng chung Map rỗng, xem createFrame). */
  temp: Map<string, TagValue>;
  /** FC: VAR_INPUT/OUTPUT (scalar). */
  vars: Map<string, TagValue>;
  /** Biến local kiểu mảng/struct (TEMP + FC), key = tên viết thường. */
  composite: Map<string, LocalValue>;
  /** Instance DB của FB đang chạy. */
  instance?: DbView;
  /** IN_OUT: tham chiếu tới LValue nơi gọi (OQ-148 — alias trực tiếp). */
  inout: Map<string, Ref>;
  /** Giá trị trả của FC sau khi chạy xong (đọc từ local tên FC). */
  returnValue?: TagValue;
  loopDepth: number;
  flow: 'normal' | 'exit' | 'continue' | 'return';
  /** Cờ tràn Int (§7.2), xóa ở đầu mỗi scan (OQ-135). */
  ov: boolean;
  /** Độ sâu lời gọi (OB = 0; vượt maxCallDepth → CALL_DEPTH). */
  depth: number;
}

export interface CompiledBlock {
  info: BlockInfo;
  run(frame: Frame): void;
}

/** Handler cho một system block (P1.5 điền vào; P1.4 registry trống). */
export type SysCallHandler = (
  instance: DbView | undefined,
  inArgs: Map<string, TagValue>,
  outArgs: Map<string, Ref>,
  nowMs: number,
) => void;

/** Bộ nhớ PLC mà interpreter làm việc cùng. */
export interface PlcMemory {
  i: MemoryArea;
  q: MemoryArea;
  m: MemoryArea;
  dbs: Map<string, DbStore>;
  dbNumbers: Map<string, number>;
}

interface FaultCtx {
  blockName: string;
  src?: SrcRef;
}

type Section = 'input' | 'output' | 'inout' | 'static' | 'temp';

interface VarInfo {
  section: Section;
  type: IrType;
}

interface BlockInfo {
  block: IrBlock;
  byName: Map<string, VarInfo>;
  /** Section nào có biến (tính một lần ở blockInfo) — createFrame dùng chung
   * Map rỗng cho section không có biến (P1.7 bench). */
  hasTemp: boolean;
  hasVars: boolean;
  hasComposite: boolean;
  hasInout: boolean;
}

/** Ref đã biên dịch: đọc/ghi không cấp phát ở đường nóng (tạo một lần). */
interface CompiledRef {
  readonly type: IrType;
  read(frame: Frame): TagValue;
  write(frame: Frame, value: TagValue): void;
  readElem(frame: Frame, index: number): TagValue;
  writeElem(frame: Frame, index: number, value: TagValue): void;
  readElemField(frame: Frame, index: number, name: string): TagValue;
  writeElemField(frame: Frame, index: number, name: string, value: TagValue): void;
  field(name: string): CompiledRef;
}

function notArray(type: IrType): never {
  throw new Error(`interpreter: kiểu '${irTypeName(type)}' không phải mảng`);
}

/** Ép TagValue về number; throw ồn ào khi không phải số (lỗi typecheck/IR). */
function asNum(v: TagValue): number {
  if (typeof v !== 'number') {
    throw new Error(`interpreter: giá trị phải là số (nhận ${typeof v})`);
  }
  return v;
}

function notStruct(type: IrType): never {
  throw new Error(`interpreter: kiểu '${irTypeName(type)}' không phải struct`);
}

function irTypeName(t: IrType): string {
  if (typeof t === 'string') return t;
  if (t.kind === 'array') return `Array[${String(t.lo)}..${String(t.hi)}] of ${irTypeName(t.elem)}`;
  return `struct${t.name !== undefined ? ` ${t.name}` : ''}`;
}

/** Giá trị mặc định của một kiểu nguyên thủy. */
export function defaultValue(type: IrType): TagValue {
  if (typeof type !== 'string') {
    throw new Error(`interpreter: defaultValue chỉ dùng cho kiểu nguyên thủy, nhận ${irTypeName(type)}`);
  }
  return type === 'Bool' ? false : 0;
}

/** Giá trị mặc định đệ quy cho kiểu mảng/struct (dùng khởi tạo frame). */
export function defaultLocalValue(type: IrType): LocalValue {
  if (typeof type === 'string') return defaultValue(type);
  if (type.kind === 'array') {
    const out: LocalValue[] = [];
    for (let i = type.lo; i <= type.hi; i++) out.push(defaultLocalValue(type.elem));
    return out;
  }
  const out = new Map<string, LocalValue>();
  for (const f of type.fields) out.set(f.name.toLowerCase(), defaultLocalValue(f.type));
  return out;
}

/** Kích thước (byte) của một IrType; Bool = 1 (bit), mảng Bool gói bit. */
export function irTypeSize(type: IrType): number {
  if (typeof type === 'string') return sizeOf(type) as number;
  if (type.kind === 'array') {
    const count = type.hi - type.lo + 1;
    if (typeof type.elem === 'string' && type.elem === 'Bool') {
      const bytes = Math.ceil(count / 8);
      return bytes % 2 === 1 ? bytes + 1 : bytes;
    }
    const elemSize = irTypeSize(type.elem);
    const total = count * elemSize;
    return total % 2 === 1 ? total + 1 : total;
  }
  let end = 0;
  for (const f of type.fields) {
    const fieldEnd = f.byteOffset + (typeof f.type === 'string' && f.type === 'Bool' ? 1 : f.size);
    if (fieldEnd > end) end = fieldEnd;
  }
  return end % 2 === 1 ? end + 1 : end;
}

/** Tìm field theo tên (không phân biệt hoa/thường). */
export function findField(fields: readonly IrField[], name: string): IrField | undefined {
  const lower = name.toLowerCase();
  return fields.find((f) => f.name.toLowerCase() === lower);
}

/** Đọc một giá trị scalar từ store tại offset tuyệt đối. */
export function readMemValue(store: MemoryArea, byteOffset: number, field: IrField): TagValue {
  if (field.type === 'Bool') {
    return store.getBit(byteOffset, field.bitOffset ?? 0);
  }
  return store.read(field.type as MemoryScalarType, byteOffset);
}

/** Ghi một giá trị scalar vào store tại offset tuyệt đối (chuẩn hóa trước). */
export function writeMemValue(store: MemoryArea, byteOffset: number, field: IrField, value: TagValue): void {
  if (field.type === 'Bool') {
    if (typeof value !== 'boolean') {
      throw new TagError('TAG-E001', `ghi Bool: nhận ${typeof value}`);
    }
    store.setBit(byteOffset, field.bitOffset ?? 0, value);
    return;
  }
  store.write(field.type as MemoryScalarType, byteOffset, normalizeScalar(field.type as PrimitiveType, value as number | boolean));
}

/** Ghi giá trị khởi tạo (IrField.init) vào store, đệ quy qua struct. */
export function initDbStore(store: DbStore, fields: readonly IrField[], base: number): void {
  for (const field of fields) {
    if (typeof field.type !== 'string' && field.type.kind === 'struct') {
      initDbStore(store, field.type.fields, base + field.byteOffset);
      continue;
    }
    if (field.init === undefined) continue;
    if (typeof field.type !== 'string') continue; // mảng không có init scalar
    writeMemValue(store, base + field.byteOffset, field, field.init);
  }
}

/** CompiledRef gốc: chỉ đọc/ghi scalar, các điều hướng còn lại throw. */
function baseRef(
  type: IrType,
  read: (frame: Frame) => TagValue,
  write: (frame: Frame, value: TagValue) => void = () => {
    throw new Error(
      `interpreter: ghi scalar vào kiểu '${typeof type === 'string' ? type : type.kind}'`,
    );
  },
): CompiledRef {
  return {
    type,
    read,
    write,
    readElem: () => notArray(type),
    writeElem: () => notArray(type),
    readElemField: () => notArray(type),
    writeElemField: () => notArray(type),
    field: () => notStruct(type),
  };
}

/**
 * Tính trước offset tương đối + field lá cho một path field (lúc compile).
 * Đi theo path đúng như `resolve` trong viewFieldRef (kể cả lỗi ném ra) —
 * chỉ khác là chạy một lần thay vì mỗi lần truy cập.
 */
function resolvePathOffset(
  fields: readonly IrField[],
  path: readonly string[],
): { offset: number; field: IrField } {
  let offset = 0;
  let current = fields;
  let field: IrField | undefined;
  for (const name of path) {
    field = findField(current, name);
    if (field === undefined) {
      throw new Error(`interpreter: không tìm thấy field '${name}'`);
    }
    offset += field.byteOffset;
    if (name !== path[path.length - 1]) {
      if (typeof field.type === 'string' || field.type.kind !== 'struct') {
        throw new Error(`interpreter: field '${name}' không phải struct`);
      }
      current = field.type.fields;
    }
  }
  if (field === undefined) throw new Error('interpreter: path rỗng');
  return { offset, field };
}

/**
 * Điều hướng một field trong một DbView (DB gốc, instance FB, struct lồng).
 * Path + kiểu lá biết ở compile time; store/offset lấy ở runtime (instance
 * của FB chỉ có khi chạy). Khi `precomputed` có (tính trước bằng
 * resolvePathOffset từ danh sách field tĩnh), mỗi truy cập chỉ cộng offset —
 * không đi theo path bằng `findField` nữa (P1.7 bench).
 */
function viewFieldRef(
  viewOf: (frame: Frame) => DbView,
  path: readonly string[],
  type: IrType,
  recordArrayRange: (message: string) => void,
  precomputed?: { offset: number; field: IrField },
): CompiledRef {
  /** Đi theo path tới field lá: trả store + offset tuyệt đối + field. */
  const resolve = (frame: Frame): { store: DbStore; offset: number; field: IrField } => {
    const view = viewOf(frame);
    if (precomputed !== undefined) {
      return { store: view.store, offset: view.base + precomputed.offset, field: precomputed.field };
    }
    let v = view;
    let field: IrField | undefined;
    for (const name of path) {
      field = findField(v.fields, name);
      if (field === undefined) {
        throw new Error(`interpreter: không tìm thấy field '${name}'`);
      }
      if (name !== path[path.length - 1]) {
        if (typeof field.type === 'string' || field.type.kind !== 'struct') {
          throw new Error(`interpreter: field '${name}' không phải struct`);
        }
        v = { store: v.store, fields: field.type.fields, base: v.base + field.byteOffset };
      }
    }
    if (field === undefined) throw new Error('interpreter: path rỗng');
    return { store: v.store, offset: v.base + field.byteOffset, field };
  };
  if (typeof type === 'string') {
    return baseRef(type, (frame) => {
      const target = resolve(frame);
      return readMemValue(target.store, target.offset, target.field);
    }, (frame, v) => {
      const target = resolve(frame);
      writeMemValue(target.store, target.offset, target.field, v);
    });
  }
  if (type.kind === 'struct') {
    const ref: CompiledRef = {
      ...baseRef(type, () => {
        throw new Error('interpreter: đọc struct như scalar');
      }),
      field: (sub) => {
        const subField = findField(type.fields, sub);
        if (subField === undefined) {
          throw new Error(`interpreter: không tìm thấy field '${sub}'`);
        }
        // Offset lồng = offset của struct cha + offset của field con.
        const nested =
          precomputed !== undefined
            ? { offset: precomputed.offset + subField.byteOffset, field: subField }
            : undefined;
        return viewFieldRef(viewOf, [...path, sub], subField.type, recordArrayRange, nested);
      },
    };
    return ref;
  }
  // Array.
  const elemType = type.elem;
  const lo = type.lo;
  const hi = type.hi;
  const elemSize = irTypeSize(elemType);
  const isBoolArray = typeof elemType === 'string' && elemType === 'Bool';
  const checkBounds = (index: number): boolean => {
    if (index < lo || index > hi) {
      recordArrayRange(`chỉ số mảng ${String(index)} ngoài [${String(lo)}..${String(hi)}]`);
      return false;
    }
    return true;
  };
  const elemPos = (frame: Frame, index: number): { store: DbStore; byte: number; bit: number } => {
    const target = resolve(frame);
    const k = index - lo;
    if (isBoolArray) return { store: target.store, byte: target.offset + (k >> 3), bit: k & 7 };
    return { store: target.store, byte: target.offset + k * elemSize, bit: 0 };
  };
  const ref: CompiledRef = {
    ...baseRef(type, () => {
      throw new Error('interpreter: đọc mảng như scalar');
    }),
    readElem: (frame, index) => {
      if (!checkBounds(index)) return defaultValue(elemType);
      if (typeof elemType !== 'string') {
        throw new Error('interpreter: đọc phần tử struct của mảng như scalar');
      }
      const pos = elemPos(frame, index);
      return readMemValue(pos.store, pos.byte, {
        name: '',
        type: elemType,
        byteOffset: pos.byte,
        ...(isBoolArray ? { bitOffset: pos.bit } : {}),
        size: isBoolArray ? 1 : elemSize,
      });
    },
    writeElem: (frame, index, value) => {
      if (!checkBounds(index)) return;
      if (typeof elemType !== 'string') {
        throw new Error('interpreter: ghi phần tử struct của mảng như scalar');
      }
      const pos = elemPos(frame, index);
      writeMemValue(
        pos.store,
        pos.byte,
        {
          name: '',
          type: elemType,
          byteOffset: pos.byte,
          ...(isBoolArray ? { bitOffset: pos.bit } : {}),
          size: isBoolArray ? 1 : elemSize,
        },
        value,
      );
    },
    readElemField: (frame, index, sub) => {
      if (!checkBounds(index)) return false;
      if (typeof elemType === 'string' || elemType.kind !== 'struct') {
        throw new Error('interpreter: phần tử mảng không phải struct');
      }
      const subField = findField(elemType.fields, sub);
      if (subField === undefined) {
        throw new Error(`interpreter: không tìm thấy field '${sub}'`);
      }
      const pos = elemPos(frame, index);
      return readMemValue(pos.store, pos.byte + subField.byteOffset, subField);
    },
    writeElemField: (frame, index, sub, value) => {
      if (!checkBounds(index)) return;
      if (typeof elemType === 'string' || elemType.kind !== 'struct') {
        throw new Error('interpreter: phần tử mảng không phải struct');
      }
      const subField = findField(elemType.fields, sub);
      if (subField === undefined) {
        throw new Error(`interpreter: không tìm thấy field '${sub}'`);
      }
      const pos = elemPos(frame, index);
      writeMemValue(pos.store, pos.byte + subField.byteOffset, subField, value);
    },
  };
  return ref;
}

/** Đi theo path trong một DbView → view con (dùng resolve instance FB). */
function walkView(view: DbView, path: readonly string[]): DbView {
  let current = view;
  for (const name of path) {
    const field = findField(current.fields, name);
    if (field === undefined) {
      throw new Error(`interpreter: không tìm thấy field '${name}'`);
    }
    if (typeof field.type === 'string' || field.type.kind !== 'struct') {
      throw new Error(`interpreter: field '${name}' không phải struct`);
    }
    current = {
      store: current.store,
      fields: field.type.fields,
      base: current.base + field.byteOffset,
    };
  }
  return current;
}

/** CompiledRef cho biến local kiểu mảng/struct trong frame (composite). */
function compositeRef(
  type: IrType,
  get: (frame: Frame) => LocalValue,
  set: (frame: Frame, value: LocalValue) => void,
  recordArrayRange: (message: string) => void,
): CompiledRef {
  if (typeof type === 'string') {
    throw new Error(`interpreter: compositeRef chỉ dùng cho mảng/struct, nhận '${type}'`);
  }
  if (type.kind === 'struct') {
    const ref: CompiledRef = {
      ...baseRef(type, () => {
        throw new Error('interpreter: đọc struct như scalar');
      }),
      field: (sub) => {
        const subField = findField(type.fields, sub);
        if (subField === undefined) {
          throw new Error(`interpreter: không tìm thấy field '${sub}'`);
        }
        const getParent = (frame: Frame): Map<string, LocalValue> => {
          const parent = get(frame);
          if (!(parent instanceof Map)) {
            throw new Error(`interpreter: giá trị struct '${sub}' không phải Map`);
          }
          return parent;
        };
        const getSub = (frame: Frame): LocalValue => {
          const v = getParent(frame).get(sub.toLowerCase());
          if (v === undefined) throw new Error(`interpreter: thiếu field '${sub}'`);
          return v;
        };
        const setSub = (frame: Frame, v: LocalValue): void => {
          getParent(frame).set(sub.toLowerCase(), v);
        };
        // Field scalar → ref scalar; field composite (struct/mảng) → đệ quy.
        // (Trước đây luôn đệ quy compositeRef nên field scalar như Int ném
        // "compositeRef chỉ dùng cho mảng/struct" ngay lúc compile.)
        if (typeof subField.type === 'string') {
          return baseRef(subField.type, (frame) => {
            const v = getSub(frame);
            if (typeof v === 'object') {
              throw new Error(`interpreter: đọc field '${sub}' kiểu composite như scalar`);
            }
            return v;
          }, setSub);
        }
        return compositeRef(subField.type, getSub, setSub, recordArrayRange);
      },
    };
    return ref;
  }
  // Array.
  const elemType = type.elem;
  const lo = type.lo;
  const hi = type.hi;
  const checkBounds = (index: number): boolean => {
    if (index < lo || index > hi) {
      recordArrayRange(`chỉ số mảng ${String(index)} ngoài [${String(lo)}..${String(hi)}]`);
      return false;
    }
    return true;
  };
  const ref: CompiledRef = {
    ...baseRef(type, () => {
      throw new Error('interpreter: đọc mảng như scalar');
    }),
    readElem: (frame, index) => {
      if (!checkBounds(index)) return defaultValue(elemType);
      const arr = get(frame);
      if (!Array.isArray(arr)) throw new Error('interpreter: giá trị mảng không phải array');
      const v = arr[index - lo];
      if (v === undefined || typeof v === 'object') {
        throw new Error('interpreter: đọc phần tử struct của mảng như scalar');
      }
      return v;
    },
    writeElem: (frame, index, value) => {
      if (!checkBounds(index)) return;
      const arr = get(frame);
      if (!Array.isArray(arr)) throw new Error('interpreter: giá trị mảng không phải array');
      arr[index - lo] = normalizeScalar(elemType as PrimitiveType, value as number | boolean);
    },
    readElemField: (frame, index, sub) => {
      if (!checkBounds(index)) return false;
      const arr = get(frame);
      if (!Array.isArray(arr)) throw new Error('interpreter: giá trị mảng không phải array');
      const elem = arr[index - lo];
      if (!(elem instanceof Map)) {
        throw new Error('interpreter: phần tử mảng không phải struct');
      }
      const v = elem.get(sub.toLowerCase());
      if (v === undefined || typeof v === 'object') {
        throw new Error(`interpreter: đọc field '${sub}' của phần tử mảng như scalar`);
      }
      return v;
    },
    writeElemField: (frame, index, sub, value) => {
      if (!checkBounds(index)) return;
      const arr = get(frame);
      if (!Array.isArray(arr)) throw new Error('interpreter: giá trị mảng không phải array');
      const elem = arr[index - lo];
      if (!(elem instanceof Map)) {
        throw new Error('interpreter: phần tử mảng không phải struct');
      }
      if (typeof type.elem === 'string' || type.elem.kind !== 'struct') {
        throw new Error('interpreter: phần tử mảng không phải struct');
      }
      const subField = findField(type.elem.fields, sub);
      if (subField === undefined) {
        throw new Error(`interpreter: không tìm thấy field '${sub}'`);
      }
      elem.set(
        sub.toLowerCase(),
        typeof subField.type === 'string' ? normalizeScalar(subField.type, value as number | boolean) : value,
      );
    },
  };
  return ref;
}

/** Buộc một CompiledRef vào một frame cụ thể → Ref (dùng cho IN_OUT). */
function bindRef(compiled: CompiledRef, frame: Frame): Ref {
  const ref: Ref = {
    get: () => compiled.read(frame),
    set: (v) => {
      compiled.write(frame, v);
    },
    elem: (index) => {
      if (typeof compiled.type === 'string' || compiled.type.kind !== 'array') {
        throw new Error(`interpreter: kiểu '${irTypeName(compiled.type)}' không phải mảng`);
      }
      const elemType = compiled.type.elem;
      const elemCompiled: CompiledRef = {
        ...baseRef(elemType, () => compiled.readElem(frame, index), (_f, v) => {
          compiled.writeElem(frame, index, v);
        }),
        field: (name) => {
          if (typeof elemType === 'string' || elemType.kind !== 'struct') {
            throw new Error('interpreter: phần tử mảng không phải struct');
          }
          const sub = findField(elemType.fields, name);
          if (sub === undefined) {
            throw new Error(`interpreter: không tìm thấy field '${name}'`);
          }
          return baseRef(sub.type, () => compiled.readElemField(frame, index, name), (_f, v) => {
            compiled.writeElemField(frame, index, name, v);
          });
        },
      };
      return bindRef(elemCompiled, frame);
    },
    field: (name) => bindRef(compiled.field(name), frame),
  };
  return ref;
}

/** Map rỗng dùng chung cho section frame không có biến (P1.7 bench).
 * Không bao giờ ghi vào các map này: mọi ghi vào frame map đều qua byName
 * (xem createFrame + #localRef + invokeFc), nên section không có biến trong
 * byName thì map của nó không bao giờ bị ghi. */
const EMPTY_TAG_VALUES: Map<string, TagValue> = new Map();
const EMPTY_LOCAL_VALUES: Map<string, LocalValue> = new Map();
const EMPTY_REFS: Map<string, Ref> = new Map();

/** Tạo frame mới cho một block (TEMP/vars về mặc định kiểu). */
export function createFrame(info: BlockInfo, depth: number): Frame {
  const temp = info.hasTemp ? new Map<string, TagValue>() : EMPTY_TAG_VALUES;
  const vars = info.hasVars ? new Map<string, TagValue>() : EMPTY_TAG_VALUES;
  const composite = info.hasComposite ? new Map<string, LocalValue>() : EMPTY_LOCAL_VALUES;
  const inout = info.hasInout ? new Map<string, Ref>() : EMPTY_REFS;
  if (info.hasTemp || info.hasVars || info.hasComposite) {
    for (const [name, v] of info.byName) {
      if (v.section === 'inout') continue;
      // FB: input/output/static nằm trong instance DB, không ở frame.
      if (info.block.kind === 'FB' && v.section !== 'temp') continue;
      if (typeof v.type === 'string') {
        const value = v.type === 'Bool' ? false : 0;
        if (v.section === 'temp') temp.set(name, value);
        else vars.set(name, value);
      } else {
        composite.set(name, defaultLocalValue(v.type));
      }
    }
  }
  // Giá trị khởi tạo (IrVar.init) — ghi đè mặc định 0/false khi có.
  if (info.hasTemp || info.hasVars) {
    const applyInit = (list: readonly { name: string; type: IrType; init?: number | boolean }[]): void => {
      for (const v of list) {
        if (v.init === undefined) continue;
        const key = v.name.toLowerCase();
        const section = info.byName.get(key)?.section;
        if (section === undefined || section === 'inout' || section === 'static') continue;
        if ((section === 'input' || section === 'output') && info.block.kind === 'FB') continue;
        if (typeof v.type === 'string') {
          if (section === 'temp') temp.set(key, v.init);
          else vars.set(key, v.init);
        }
      }
    };
    applyInit(info.block.interface.input);
    applyInit(info.block.interface.output);
    applyInit(info.block.interface.temp);
  }
  return {
    temp,
    vars,
    composite,
    inout,
    loopDepth: 0,
    flow: 'normal',
    ov: false,
    depth,
  };
}

function blockInfo(block: IrBlock): BlockInfo {
  const byName = new Map<string, VarInfo>();
  const add = (section: Section, list: readonly { name: string; type: IrType }[]): void => {
    for (const v of list) byName.set(v.name.toLowerCase(), { section, type: v.type });
  };
  add('input', block.interface.input);
  add('output', block.interface.output);
  add('inout', block.interface.inout);
  add('static', block.interface.static);
  add('temp', block.interface.temp);
  // Flags cho createFrame — tính đúng theo điều kiện vòng lặp điền frame
  // (inout riêng: map inout chỉ được ghi ở nơi gọi khi có inoutArgs).
  let hasTemp = false;
  let hasVars = false;
  let hasComposite = false;
  let hasInout = false;
  for (const v of byName.values()) {
    if (v.section === 'inout') {
      hasInout = true;
      continue;
    }
    if (block.kind === 'FB' && v.section !== 'temp') continue;
    if (typeof v.type === 'string') {
      if (v.section === 'temp') hasTemp = true;
      else hasVars = true;
    } else {
      hasComposite = true;
    }
  }
  return { block, byName, hasTemp, hasVars, hasComposite, hasInout };
}

export class Interpreter {
  readonly program: IrProgram;
  readonly mem: PlcMemory;
  readonly faults: FaultCollector;
  /** Thời điểm scan hiện tại (sim ms) — SoftPlc đặt trước mỗi scan. */
  nowMs = 0;
  readonly #infos = new Map<string, BlockInfo>();
  readonly #compiled = new Map<string, CompiledBlock>();
  readonly #dbByNumber = new Map<number, DbStore>();
  /** Index DB theo tên viết thường — thay quét tuyến tính program.dbs mỗi lần gọi FB (P1.7 bench: 200 DB × 200 lần gọi/scan). */
  readonly #dbsByName = new Map<string, IrDb>();
  /**
   * Layout instance chuẩn theo tên FB (fields của DB đầu tiên mang fbName đó).
   * Mọi DB cùng một FB có cùng layout (layoutIrFields thuần theo interface) —
   * constructor kiểm chứng điều này trên toàn bộ DB, FB nào lệch thì loại khỏi
   * map (dùng slow path). Dùng để tính trước offset field lúc compile (Opt E).
   */
  readonly #instanceFieldsByFb = new Map<string, readonly IrField[]>();
  readonly #intrinsics: IntrinsicRegistry;
  readonly #sysCalls: Map<string, SysCallHandler>;
  readonly #maxCallDepth: number;
  readonly #maxLoopIterations: number;

  constructor(
    program: IrProgram,
    mem: PlcMemory,
    faults: FaultCollector,
    opts?: {
      intrinsics?: IntrinsicRegistry;
      sysCalls?: Map<string, SysCallHandler>;
      maxCallDepth?: number;
      maxLoopIterations?: number;
    },
  ) {
    this.program = program;
    this.mem = mem;
    this.faults = faults;
    this.#intrinsics = opts?.intrinsics ?? createIntrinsicRegistry();
    this.#sysCalls = opts?.sysCalls ?? new Map<string, SysCallHandler>();
    this.#maxCallDepth = opts?.maxCallDepth ?? 24;
    this.#maxLoopIterations = opts?.maxLoopIterations ?? 10_000;
    for (const [name, number] of mem.dbNumbers) {
      const store = mem.dbs.get(name);
      if (store !== undefined) this.#dbByNumber.set(number, store);
    }
    for (const db of program.dbs) {
      this.#dbsByName.set(db.name.toLowerCase(), db);
    }
    for (const db of program.dbs) {
      if (db.fbName === undefined) continue;
      const key = db.fbName.toLowerCase();
      const canonical = this.#instanceFieldsByFb.get(key);
      if (canonical === undefined) {
        this.#instanceFieldsByFb.set(key, db.fields);
        continue;
      }
      // Kiểm chứng: mọi DB cùng FB phải có cùng layout (tên + offset + size).
      // Lệch → loại FB khỏi map, các truy cập field của nó dùng slow path.
      const sameLayout =
        canonical.length === db.fields.length &&
        canonical.every(
          (f, i) =>
            f.name.toLowerCase() === (db.fields[i] as IrField).name.toLowerCase() &&
            f.byteOffset === (db.fields[i] as IrField).byteOffset &&
            f.size === (db.fields[i] as IrField).size,
        );
      if (!sameLayout) this.#instanceFieldsByFb.delete(key);
    }
    // Pass 1 — xây info cho mọi block trước: compileExpr/compileStmt của một
    // block có thể tra callee info (callFcExpr/callFb) bất kể thứ tự khai báo.
    for (const block of program.blocks) {
      this.#infos.set(block.id.toLowerCase(), blockInfo(block));
    }
    // Pass 2 — biên dịch từng block thành closure.
    for (const block of program.blocks) {
      const info = this.#infos.get(block.id.toLowerCase());
      if (info === undefined) throw new Error('interpreter: thiếu BlockInfo nội bộ');
      this.#compiled.set(block.id.toLowerCase(), {
        info,
        run: this.compileBlock(info),
      });
    }
  }

  #record(code: RuntimeFaultCode, fctx: FaultCtx, message: string): void {
    this.faults.record(code, {
      blockName: fctx.blockName,
      ...(fctx.src !== undefined ? { src: fctx.src } : {}),
      simTimeMs: this.nowMs,
      message,
    });
  }

  #arrayRangeRecorder(fctx: FaultCtx): (message: string) => void {
    return (message) => {
      this.#record('ARRAY_RANGE', fctx, message);
    };
  }

  // ---------------------------------------------------------- LValue

  /** Kiểu tĩnh của một LValue (undefined khi không xác định được). */
  lvalueType(lv: IrLValue, info: BlockInfo): IrType | undefined {
    switch (lv.k) {
      case 'local': {
        return info.byName.get(lv.name.toLowerCase())?.type;
      }
      case 'static': {
        let type = info.byName.get(lv.path[0]?.toLowerCase() ?? '')?.type;
        if (type === undefined) return undefined;
        for (const name of lv.path.slice(1)) {
          if (typeof type === 'string' || type.kind !== 'struct') return undefined;
          type = findField(type.fields, name)?.type;
          if (type === undefined) return undefined;
        }
        return type;
      }
      case 'dbField': {
        const db = this.#dbsByName.get(lv.db.toLowerCase());
        if (db === undefined) return undefined;
        let fields = db.fields;
        let type: IrType | undefined;
        for (const name of lv.path) {
          const field = findField(fields, name);
          if (field === undefined) return undefined;
          type = field.type;
          if (typeof type !== 'string' && type.kind === 'struct') fields = type.fields;
        }
        return type;
      }
      case 'abs':
      case 'absDb':
        return lv.type;
      case 'index': {
        const base = this.lvalueType(lv.base, info);
        if (base === undefined || typeof base === 'string' || base.kind !== 'array') return undefined;
        return base.elem;
      }
      case 'member': {
        const base = this.lvalueType(lv.base, info);
        if (base === undefined || typeof base === 'string' || base.kind !== 'struct') return undefined;
        return findField(base.fields, lv.field)?.type;
      }
    }
  }

  /** Ref cho một biến local (theo interface của block đang chạy). */
  #localRef(name: string, info: BlockInfo, fctx: FaultCtx): CompiledRef {
    const key = name.toLowerCase();
    const varInfo = info.byName.get(key);
    if (varInfo === undefined) {
      throw new Error(
        `interpreter: không tìm thấy biến '${name}' trong block '${info.block.name}'`,
      );
    }
    const recordArrayRange = this.#arrayRangeRecorder(fctx);
    if (varInfo.section === 'inout') {
      const getRef = (frame: Frame): Ref => {
        const r = frame.inout.get(key);
        if (r === undefined) {
          throw new Error(`interpreter: IN_OUT '${name}' chưa được nối`);
        }
        return r;
      };
      return this.#inoutCompiled(varInfo.type, getRef);
    }
    if (typeof varInfo.type === 'string') {
      const scalarType = varInfo.type;
      if (varInfo.section === 'temp') {
        return baseRef(scalarType, (frame) => frame.temp.get(key) ?? defaultValue(scalarType), (frame, v) =>
          frame.temp.set(key, normalizeScalar(scalarType, v as number | boolean)),
        );
      }
      // Còn lại chỉ có input/output/static (temp/inout đã return ở trên).
      if (info.block.kind === 'FB') {
        const rootFields = this.#instanceFieldsByFb.get(info.block.name.toLowerCase());
        return viewFieldRef(
          (frame) => {
            if (frame.instance === undefined) {
              throw new Error(`interpreter: block '${info.block.name}' không có instance DB`);
            }
            return frame.instance;
          },
          [name],
          scalarType,
          recordArrayRange,
          rootFields !== undefined ? resolvePathOffset(rootFields, [name]) : undefined,
        );
      }
      return baseRef(scalarType, (frame) => frame.vars.get(key) ?? defaultValue(scalarType), (frame, v) =>
        frame.vars.set(key, normalizeScalar(scalarType, v as number | boolean)),
      );
    }
    // Biến local kiểu mảng/struct (TEMP hoặc FC input/output).
    return compositeRef(
      varInfo.type,
      (frame) => {
        const v = frame.composite.get(key);
        if (v === undefined) {
          throw new Error(`interpreter: thiếu biến composite '${name}'`);
        }
        return v;
      },
      (frame, v) => {
        frame.composite.set(key, v);
      },
      recordArrayRange,
    );
  }

  /** CompiledRef cho IN_OUT: điều hướng qua Ref đã nối ở nơi gọi. */
  #inoutCompiled(type: IrType, getRef: (frame: Frame) => Ref): CompiledRef {
    const ref: CompiledRef = {
      type,
      read: (frame) => getRef(frame).get(),
      write: (frame, v) => {
        getRef(frame).set(v);
      },
      readElem: (frame, index) => {
        const elem = getRef(frame).elem?.(index);
        if (elem === undefined) {
          throw new Error('interpreter: IN_OUT không phải mảng');
        }
        return elem.get();
      },
      writeElem: (frame, index, v) => {
        const elem = getRef(frame).elem?.(index);
        if (elem === undefined) {
          throw new Error('interpreter: IN_OUT không phải mảng');
        }
        elem.set(v);
      },
      readElemField: (frame, index, sub) => {
        const ref = getRef(frame);
        const elem = ref.elem === undefined ? undefined : ref.elem(index);
        if (elem === undefined) {
          throw new Error('interpreter: IN_OUT không phải mảng');
        }
        const field = elem.field === undefined ? undefined : elem.field(sub);
        if (field === undefined) {
          throw new Error('interpreter: IN_OUT không phải mảng struct');
        }
        return field.get();
      },
      writeElemField: (frame, index, sub, v) => {
        const ref = getRef(frame);
        const elem = ref.elem === undefined ? undefined : ref.elem(index);
        if (elem === undefined) {
          throw new Error('interpreter: IN_OUT không phải mảng');
        }
        const field = elem.field === undefined ? undefined : elem.field(sub);
        if (field === undefined) {
          throw new Error('interpreter: IN_OUT không phải mảng struct');
        }
        field.set(v);
      },
      field: (sub) => {
        if (typeof type === 'string' || type.kind !== 'struct') notStruct(type);
        const subField = findField(type.fields, sub);
        if (subField === undefined) {
          throw new Error(`interpreter: không tìm thấy field '${sub}'`);
        }
        return this.#inoutCompiled(subField.type, (frame) => {
          const field = getRef(frame).field?.(sub);
          if (field === undefined) {
            throw new Error(`interpreter: IN_OUT không có field '${sub}'`);
          }
          return field;
        });
      },
    };
    return ref;
  }

  /** Biên dịch một LValue thành CompiledRef (tạo một lần, dùng mỗi scan). */
  compileLValue(lv: IrLValue, info: BlockInfo, fctx: FaultCtx): CompiledRef {
    const recordArrayRange = this.#arrayRangeRecorder(fctx);
    switch (lv.k) {
      case 'local':
        return this.#localRef(lv.name, info, fctx);
      case 'static': {
        const first = lv.path[0];
        if (first === undefined) throw new Error('interpreter: static path rỗng');
        const firstInfo = info.byName.get(first.toLowerCase());
        if (firstInfo === undefined) {
          throw new Error(`interpreter: không tìm thấy biến '${first}'`);
        }
        // Field trong instance DB của FB (input/output/static) → đi từ
        // frame.instance; còn lại (TEMP/struct local) → composite.
        const inInstance =
          info.block.kind === 'FB' &&
          (firstInfo.section === 'input' ||
            firstInfo.section === 'output' ||
            firstInfo.section === 'static');
        if (inInstance) {
          let type = firstInfo.type;
          for (const name of lv.path.slice(1)) {
            if (typeof type === 'string' || type.kind !== 'struct') {
              throw new Error(`interpreter: field '${name}' không phải struct`);
            }
            const sub = findField(type.fields, name);
            if (sub === undefined) {
              throw new Error(`interpreter: không tìm thấy field '${name}'`);
            }
            type = sub.type;
          }
          const rootFields = this.#instanceFieldsByFb.get(info.block.name.toLowerCase());
          return viewFieldRef(
            (frame) => {
              if (frame.instance === undefined) {
                throw new Error(`interpreter: block '${info.block.name}' không có instance DB`);
              }
              return frame.instance;
            },
            lv.path,
            type,
            recordArrayRange,
            rootFields !== undefined ? resolvePathOffset(rootFields, lv.path) : undefined,
          );
        }
        // Struct local trong frame.
        let type = firstInfo.type;
        for (const name of lv.path.slice(1)) {
          if (typeof type === 'string' || type.kind !== 'struct') {
            throw new Error(`interpreter: field '${name}' không phải struct`);
          }
          const sub = findField(type.fields, name);
          if (sub === undefined) {
            throw new Error(`interpreter: không tìm thấy field '${name}'`);
          }
          type = sub.type;
        }
        const firstRef = this.#localRef(first, info, fctx);
        return lv.path.slice(1).reduce<CompiledRef>((ref, name) => ref.field(name), firstRef);
      }
      case 'dbField': {
        const db = this.#dbsByName.get(lv.db.toLowerCase());
        if (db === undefined) {
          throw new Error(`interpreter: không tìm thấy DB '${lv.db}'`);
        }
        const store = this.mem.dbs.get(lv.db.toLowerCase());
        if (store === undefined) {
          throw new Error(`interpreter: DB '${lv.db}' chưa được nạp vào bộ nhớ`);
        }
        let type: IrType | undefined;
        let fields = db.fields;
        for (const name of lv.path) {
          const field = findField(fields, name);
          if (field === undefined) {
            throw new Error(`interpreter: không tìm thấy field '${name}' trong DB '${lv.db}'`);
          }
          type = field.type;
          if (typeof type !== 'string' && type.kind === 'struct') fields = type.fields;
        }
        if (type === undefined) {
          // Path rỗng: cả DB (chỉ dùng làm instance FB — resolve riêng).
          throw new Error(`interpreter: dbField '${lv.db}' không có path — dùng làm instance`);
        }
        return viewFieldRef(
          () => ({ store, fields: db.fields, base: 0 }),
          lv.path,
          type,
          recordArrayRange,
          resolvePathOffset(db.fields, lv.path),
        );
      }
      case 'abs': {
        const area = lv.area === 'I' ? this.mem.i : lv.area === 'Q' ? this.mem.q : this.mem.m;
        if (lv.bit !== undefined) {
          return baseRef(lv.type, () => area.getBit(lv.byte, lv.bit as number), (_f, v) => {
            if (typeof v !== 'boolean') {
              throw new TagError('TAG-E001', `ghi Bool: nhận ${typeof v}`);
            }
            area.setBit(lv.byte, lv.bit as number, v);
          });
        }
        return baseRef(lv.type, () => area.read(lv.type as MemoryScalarType, lv.byte), (_f, v) => {
          area.write(lv.type as MemoryScalarType, lv.byte, normalizeScalar(lv.type, v as number | boolean));
        });
      }
      case 'absDb': {
        const store = this.#dbByNumber.get(lv.db);
        if (store === undefined) {
          throw new Error(`interpreter: không tìm thấy DB số ${String(lv.db)}`);
        }
        if (lv.bit !== undefined) {
          return baseRef(lv.type, () => store.getBit(lv.byte, lv.bit as number), (_f, v) => {
            if (typeof v !== 'boolean') {
              throw new TagError('TAG-E001', `ghi Bool: nhận ${typeof v}`);
            }
            store.setBit(lv.byte, lv.bit as number, v);
          });
        }
        return baseRef(lv.type, () => store.read(lv.type as MemoryScalarType, lv.byte), (_f, v) => {
          store.write(lv.type as MemoryScalarType, lv.byte, normalizeScalar(lv.type, v as number | boolean));
        });
      }
      case 'index': {
        const base = this.compileLValue(lv.base, info, fctx);
        const indexFn = this.compileExpr(lv.index, info, fctx);
        const elemType = this.lvalueType(lv, info);
        if (elemType === undefined) {
          throw new Error('interpreter: không xác định được kiểu phần tử mảng');
        }
        const evalIndex = (frame: Frame): number => {
          const i = indexFn(frame);
          if (typeof i !== 'number' || !Number.isInteger(i)) {
            throw new Error('interpreter: chỉ số mảng phải là số nguyên');
          }
          return i;
        };
        if (typeof elemType === 'string') {
          return baseRef(elemType, (frame) => base.readElem(frame, evalIndex(frame)), (frame, v) => {
            base.writeElem(frame, evalIndex(frame), v);
          });
        }
        // Phần tử struct — chỉ đọc/ghi qua member (field). Lồng struct
        // trong phần tử mảng quá 1 cấp chưa hỗ trợ ở P1.4 (throw ồn ào,
        // xem STATE §19 "Lệch khi triển khai").
        const ref: CompiledRef = {
          ...baseRef(elemType, () => {
            throw new Error('interpreter: đọc phần tử struct như scalar');
          }),
          field: (sub) => {
            const subType = this.lvalueType({ k: 'member', base: lv, field: sub }, info);
            if (subType === undefined) {
              throw new Error(`interpreter: không tìm thấy field '${sub}'`);
            }
            return this.#arrayElemFieldRef(base, evalIndex, sub, subType);
          },
        };
        return ref;
      }
      case 'member': {
        const base = this.compileLValue(lv.base, info, fctx);
        return base.field(lv.field);
      }
    }
  }

  /** Sao chép sâu một giá trị composite (để IN/OUT mảng/struct không alias). */
  #cloneLocalValue(v: LocalValue): LocalValue {
    if (Array.isArray(v)) return v.map((e) => this.#cloneLocalValue(e));
    if (v instanceof Map) {
      const out = new Map<string, LocalValue>();
      for (const [k, e] of v) out.set(k, this.#cloneLocalValue(e));
      return out;
    }
    return v;
  }

  /** Đọc toàn bộ giá trị composite (mảng/struct) qua một CompiledRef. */
  #readCompositeValue(ref: CompiledRef, type: IrType, frame: Frame, fctx: FaultCtx): LocalValue {
    if (typeof type === 'string') return ref.read(frame);
    if (type.kind === 'array') {
      const out: LocalValue[] = [];
      for (let i = type.lo; i <= type.hi; i++) {
        if (typeof type.elem === 'string') {
          out.push(ref.readElem(frame, i));
        } else {
          out.push(
            this.#readCompositeValue(
              this.#arrayElemRef(ref, i, type.elem),
              type.elem,
              frame,
              fctx,
            ),
          );
        }
      }
      return out;
    }
    const out = new Map<string, LocalValue>();
    for (const f of type.fields) {
      out.set(
        f.name.toLowerCase(),
        this.#readCompositeValue(ref.field(f.name), f.type, frame, fctx),
      );
    }
    return out;
  }

  /** Ghi toàn bộ giá trị composite (mảng/struct) qua một CompiledRef. */
  #writeCompositeValue(
    ref: CompiledRef,
    type: IrType,
    frame: Frame,
    value: LocalValue,
    fctx: FaultCtx,
  ): void {
    if (typeof type === 'string') {
      ref.write(frame, value as TagValue);
      return;
    }
    if (type.kind === 'array') {
      const arr = value as LocalValue[];
      for (let i = type.lo; i <= type.hi; i++) {
        const elem = arr[i - type.lo];
        if (elem === undefined) continue;
        if (typeof type.elem === 'string') {
          ref.writeElem(frame, i, elem as TagValue);
        } else {
          this.#writeCompositeValue(
            this.#arrayElemRef(ref, i, type.elem),
            type.elem,
            frame,
            elem,
            fctx,
          );
        }
      }
      return;
    }
    const map = value as Map<string, LocalValue>;
    for (const f of type.fields) {
      const v = map.get(f.name.toLowerCase());
      if (v === undefined) continue;
      this.#writeCompositeValue(ref.field(f.name), f.type, frame, v, fctx);
    }
  }

  /** CompiledRef cho phần tử `index` của một mảng (dùng đọc/ghi composite). */
  #arrayElemRef(arrayRef: CompiledRef, index: number, elemType: IrType): CompiledRef {
    if (typeof elemType === 'string') {
      return baseRef(elemType, (frame) => arrayRef.readElem(frame, index), (frame, v) => {
        arrayRef.writeElem(frame, index, v);
      });
    }
    return {
      ...baseRef(elemType, () => {
        throw new Error('interpreter: đọc phần tử struct như scalar');
      }),
      field: (sub) => {
        const subType = this.#structFieldType(elemType, sub);
        return this.#arrayElemFieldRef(arrayRef, () => index, sub, subType);
      },
    };
  }

  /** CompiledRef cho field `sub` của phần tử `index` (mảng struct, 1 cấp). */
  #arrayElemFieldRef(
    arrayRef: CompiledRef,
    getIndex: (frame: Frame) => number,
    sub: string,
    subType: IrType,
  ): CompiledRef {
    const ref: CompiledRef = {
      ...baseRef(subType, (frame) => arrayRef.readElemField(frame, getIndex(frame), sub), (frame, v) => {
        arrayRef.writeElemField(frame, getIndex(frame), sub, v);
      }),
      readElem: () => {
        throw new Error('interpreter: mảng trong phần tử mảng chưa hỗ trợ ở P1.4');
      },
      writeElem: () => {
        throw new Error('interpreter: mảng trong phần tử mảng chưa hỗ trợ ở P1.4');
      },
      field: () => {
        throw new Error(
          'interpreter: struct lồng trong phần tử mảng quá 1 cấp chưa hỗ trợ ở P1.4',
        );
      },
    };
    return ref;
  }

  #structFieldType(type: IrType, name: string): IrType {
    if (typeof type === 'string' || type.kind !== 'struct') notStruct(type);
    const field = findField(type.fields, name);
    if (field === undefined) {
      throw new Error(`interpreter: không tìm thấy field '${name}'`);
    }
    return field.type;
  }

  /** Biên dịch một biểu thức mảng/struct (chỉ `load`) → giá trị composite. */
  compileCompositeExpr(
    expr: IrExpr,
    info: BlockInfo,
    fctx: FaultCtx,
  ): (frame: Frame) => LocalValue {
    if (expr.op !== 'load') {
      throw new Error(
        `interpreter: biểu thức mảng/struct phải là load (nhận '${expr.op}')`,
      );
    }
    const ref = this.compileLValue(expr.ref, info, fctx);
    const type = this.lvalueType(expr.ref, info);
    if (type === undefined || typeof type === 'string') {
      throw new Error('interpreter: load mảng/struct sai kiểu');
    }
    return (frame) => this.#readCompositeValue(ref, type, frame, fctx);
  }

  // ---------------------------------------------------------- Expr

  compileExpr(expr: IrExpr, info: BlockInfo, fctx: FaultCtx): (frame: Frame) => TagValue {
    switch (expr.op) {
      case 'const': {
        const v =
          expr.type === 'Real' && typeof expr.value === 'number'
            ? Math.fround(expr.value)
            : expr.value;
        return () => v;
      }
      case 'load': {
        const ref = this.compileLValue(expr.ref, info, fctx);
        if (typeof expr.type !== 'string') {
          throw new Error(
            `interpreter: load mảng/struct làm giá trị scalar — dùng index/field (block '${info.block.name}')`,
          );
        }
        return (frame) => ref.read(frame);
      }
      case 'unary': {
        const fn = expr.fn;
        const type = expr.type;
        const fa = this.compileExpr(expr.a, info, fctx);
        if (fn === 'not') return (frame) => !fa(frame);
        if (fn === 'bnot') {
          if (typeof type !== 'string') {
            throw new Error('interpreter: bnot trên kiểu mảng/struct');
          }
          return (frame) => wrapToInt(type, ~asNum(fa(frame)));
        }
        // neg
        if (type === 'Real') return (frame) => Math.fround(-asNum(fa(frame)));
        if (type === 'LReal') return (frame) => -asNum(fa(frame));
        if (typeof type !== 'string') {
          throw new Error('interpreter: neg trên kiểu mảng/struct');
        }
        return (frame) => {
          const v = asNum(fa(frame));
          const r = wrapToInt(type, -v);
          if (type === 'Int' && r !== -v) frame.ov = true;
          return r;
        };
      }
      case 'binary': {
        const fn = expr.fn;
        const type = expr.type;
        const fa = this.compileExpr(expr.a, info, fctx);
        const fb = this.compileExpr(expr.b, info, fctx);
        if (fn === 'and' || fn === 'or' || fn === 'xor') {
          if (type === 'Bool') {
            return (frame) => {
              const a = fa(frame) as boolean;
              const b = fb(frame) as boolean;
              return fn === 'and' ? a && b : fn === 'or' ? a || b : a !== b;
            };
          }
          if (typeof type !== 'string') {
            throw new Error('interpreter: and/or/xor trên kiểu mảng/struct');
          }
          return (frame) => {
            const a = asNum(fa(frame));
            const b = asNum(fb(frame));
            const r = fn === 'and' ? a & b : fn === 'or' ? a | b : a ^ b;
            return wrapToInt(type, r);
          };
        }
        if (fn === 'eq' || fn === 'ne' || fn === 'lt' || fn === 'le' || fn === 'gt' || fn === 'ge') {
          return (frame) => {
            const a = fa(frame);
            const b = fb(frame);
            switch (fn) {
              case 'eq':
                return a === b;
              case 'ne':
                return a !== b;
              case 'lt':
                return (a as number) < (b as number);
              case 'le':
                return (a as number) <= (b as number);
              case 'gt':
                return (a as number) > (b as number);
              case 'ge':
                return (a as number) >= (b as number);
            }
          };
        }
        // add/sub/mul/div/mod
        if (type === 'Real') {
          return (frame) => {
            const a = asNum(fa(frame));
            const b = asNum(fb(frame));
            const r =
              fn === 'add' ? a + b : fn === 'sub' ? a - b : fn === 'mul' ? a * b : a / b;
            return Math.fround(r);
          };
        }
        if (type === 'LReal') {
          return (frame) => {
            const a = asNum(fa(frame));
            const b = asNum(fb(frame));
            return fn === 'add' ? a + b : fn === 'sub' ? a - b : fn === 'mul' ? a * b : a / b;
          };
        }
        if (typeof type !== 'string') {
          throw new Error('interpreter: phép tính số học trên kiểu mảng/struct');
        }
        return (frame) => {
          const r = intBinary(fn, type, asNum(fa(frame)), asNum(fb(frame)));
          if (r.ov === true) frame.ov = true;
          if (r.fault !== undefined) {
            this.#record(
              'DIV_ZERO',
              fctx,
              `chia/mod cho 0 trong block '${info.block.name}'`,
            );
          }
          return r.value;
        };
      }
      case 'convert': {
        const from = expr.from;
        const to = expr.to;
        if (typeof from !== 'string' || typeof to !== 'string') {
          throw new Error('interpreter: convert mảng/struct không hỗ trợ');
        }
        const mode = expr.mode ?? 'round';
        const fa = this.compileExpr(expr.a, info, fctx);
        return (frame) => {
          const r = convertChecked(from, to, fa(frame) as number | boolean, mode);
          if (r.fault !== undefined) {
            this.#record(
              'CONV_RANGE',
              fctx,
              `convert ${from}→${to} ngoài khoảng trong block '${info.block.name}'`,
            );
          }
          return r.value;
        };
      }
      case 'intrinsic': {
        const fnName = expr.fn;
        const type = expr.type;
        if (typeof type !== 'string') {
          throw new Error('interpreter: intrinsic trả mảng/struct không hỗ trợ');
        }
        const fn = this.#intrinsics.get(fnName);
        if (fn === undefined) {
          throw new Error(`interpreter: intrinsic '${fnName}' không có trong registry`);
        }
        const argFns = expr.args.map((a) => this.compileExpr(a, info, fctx));
        return (frame) => {
          const args = argFns.map((f) => f(frame));
          const v = fn(args, type);
          // Chuẩn hóa kết quả về kiểu khai báo (CEIL/FLOOR thô → kiểm khoảng).
          if (type === 'Real') return typeof v === 'number' ? Math.fround(v) : v;
          if (type === 'LReal' || type === 'Bool') return v;
          const r = convertChecked(type, type, v as number);
          if (r.fault !== undefined) {
            this.#record(
              'CONV_RANGE',
              fctx,
              `intrinsic ${fnName} ngoài khoảng kiểu ${type} trong block '${info.block.name}'`,
            );
          }
          return r.value;
        };
      }
      case 'callFcExpr': {
        const callee = this.#infos.get(expr.block.toLowerCase());
        if (callee === undefined) {
          throw new Error(`interpreter: không tìm thấy FC '${expr.block}'`);
        }
        const retType = callee.block.interface.returnType;
        if (retType === undefined) {
          throw new Error(`interpreter: FC '${expr.block}' không có kiểu trả`);
        }
        if (typeof retType !== 'string') {
          throw new Error('interpreter: FC trả mảng/struct chưa hỗ trợ ở P1.4');
        }
        const compiledArgs = expr.args.map(([name, argExpr]) => {
          const param = callee.byName.get(name.toLowerCase());
          if (param === undefined) {
            throw new Error(`interpreter: FC '${expr.block}' không có tham số '${name}'`);
          }
          if (typeof param.type === 'string') {
            return { name, scalar: this.compileExpr(argExpr, info, fctx) };
          }
          return { name, composite: this.compileCompositeExpr(argExpr, info, fctx) };
        });
        const retName = expr.block.toLowerCase();
        return (frame) => {
          const cf = this.invokeFc(expr.block, compiledArgs, frame, fctx);
          if (cf === null) return defaultValue(retType);
          return cf.temp.get(retName) ?? defaultValue(retType);
        };
      }
    }
  }

  /** Gọi một FC: tạo frame mới, copy IN, chạy, trả frame (null khi CALL_DEPTH). */
  invokeFc(
    blockId: string,
    args: Array<{
      name: string;
      scalar?: (frame: Frame) => TagValue;
      composite?: (frame: Frame) => LocalValue;
    }>,
    callerFrame: Frame,
    fctx: FaultCtx,
  ): Frame | null {
    const entry = this.#compiled.get(blockId.toLowerCase());
    const entryInfo = this.#infos.get(blockId.toLowerCase());
    if (entry === undefined || entryInfo === undefined) {
      throw new Error(`interpreter: không tìm thấy FC '${blockId}'`);
    }
    if (callerFrame.depth + 1 > this.#maxCallDepth) {
      this.#record(
        'CALL_DEPTH',
        fctx,
        `vượt độ sâu lời gọi tối đa ${String(this.#maxCallDepth)} khi gọi '${blockId}'`,
      );
      return null;
    }
    const frame = createFrame(entryInfo, callerFrame.depth + 1);
    for (const arg of args) {
      const key = arg.name.toLowerCase();
      if (arg.scalar !== undefined) {
        const paramType = entryInfo.byName.get(key)?.type;
        const v = arg.scalar(callerFrame);
        frame.vars.set(
          key,
          paramType !== undefined && typeof paramType === 'string'
            ? normalizeScalar(paramType, v as number | boolean)
            : v,
        );
      } else if (arg.composite !== undefined) {
        frame.composite.set(key, this.#cloneLocalValue(arg.composite(callerFrame)));
      }
    }
    entry.run(frame);
    return frame;
  }

  /** Resolve instance FB của một lời gọi callFb/callSys → DbView. */
  resolveInstance(instance: IrLValue, frame: Frame, info: BlockInfo): DbView {
    switch (instance.k) {
      case 'local': {
        if (frame.instance === undefined) {
          throw new Error(
            `interpreter: block '${info.block.name}' không có instance DB cho '${instance.name}'`,
          );
        }
        const field = findField(frame.instance.fields, instance.name);
        if (field === undefined) {
          throw new Error(`interpreter: không tìm thấy instance '${instance.name}'`);
        }
        if (typeof field.type === 'string' || field.type.kind !== 'struct') {
          throw new Error(`interpreter: '${instance.name}' không phải instance FB`);
        }
        return {
          store: frame.instance.store,
          fields: field.type.fields,
          base: frame.instance.base + field.byteOffset,
        };
      }
      case 'dbField': {
        const db = this.#dbsByName.get(instance.db.toLowerCase());
        if (db === undefined) {
          throw new Error(`interpreter: không tìm thấy DB '${instance.db}'`);
        }
        const store = this.mem.dbs.get(instance.db.toLowerCase());
        if (store === undefined) {
          throw new Error(`interpreter: DB '${instance.db}' chưa được nạp vào bộ nhớ`);
        }
        return walkView({ store, fields: db.fields, base: 0 }, instance.path);
      }
      default:
        throw new Error(
          `interpreter: instance FB phải là local hoặc dbField (nhận '${instance.k}')`,
        );
    }
  }

  // ---------------------------------------------------------- Stmt

  compileStmt(stmt: IrStmt, info: BlockInfo): (frame: Frame) => void {
    const fctx: FaultCtx = { blockName: info.block.name };
    if (stmt.src !== undefined) fctx.src = stmt.src;
    switch (stmt.op) {
      case 'assign': {
        const target = this.compileLValue(stmt.target, info, fctx);
        const targetType = this.lvalueType(stmt.target, info);
        if (targetType === undefined) {
          throw new Error(
            `interpreter: không xác định được kiểu của gán trong block '${info.block.name}'`,
          );
        }
        if (typeof targetType !== 'string') {
          const sourceFn = this.compileCompositeExpr(stmt.value, info, fctx);
          return (frame) => {
            this.#writeCompositeValue(
              target,
              targetType,
              frame,
              this.#cloneLocalValue(sourceFn(frame)),
              fctx,
            );
          };
        }
        const valueFn = this.compileExpr(stmt.value, info, fctx);
        return (frame) => {
          target.write(frame, valueFn(frame));
        };
      }
      case 'if': {
        const condFn = this.compileExpr(stmt.cond, info, fctx);
        const thenFns = stmt.then.map((s) => this.compileStmt(s, info));
        const elsifFns = stmt.elsif.map((e) => ({
          cond: this.compileExpr(e.cond, info, fctx),
          body: e.body.map((s) => this.compileStmt(s, info)),
        }));
        const elseFns = stmt.else.map((s) => this.compileStmt(s, info));
        return (frame) => {
          if (condFn(frame) === true) {
            for (const fn of thenFns) {
              if (frame.flow !== 'normal') break;
              fn(frame);
            }
            return;
          }
          for (const e of elsifFns) {
            if (e.cond(frame) === true) {
              for (const fn of e.body) {
                if (frame.flow !== 'normal') break;
                fn(frame);
              }
              return;
            }
          }
          for (const fn of elseFns) {
            if (frame.flow !== 'normal') break;
            fn(frame);
          }
        };
      }
      case 'case': {
        const selFn = this.compileExpr(stmt.sel, info, fctx);
        const arms = stmt.arms.map((a) => ({
          labels: a.labels,
          body: a.body.map((s) => this.compileStmt(s, info)),
        }));
        const elseFns = stmt.else.map((s) => this.compileStmt(s, info));
        return (frame) => {
          const v = selFn(frame);
          if (typeof v !== 'number') {
            throw new Error('interpreter: case selector phải là số');
          }
          for (const arm of arms) {
            const hit = arm.labels.some((l) =>
              Array.isArray(l) ? v >= l[0] && v <= l[1] : v === l,
            );
            if (hit) {
              for (const fn of arm.body) {
                if (frame.flow !== 'normal') break;
                fn(frame);
              }
              return;
            }
          }
          for (const fn of elseFns) {
            if (frame.flow !== 'normal') break;
            fn(frame);
          }
        };
      }
      case 'for': {
        const fromFn = this.compileExpr(stmt.from, info, fctx);
        const toFn = this.compileExpr(stmt.to, info, fctx);
        const byFn = stmt.by !== undefined ? this.compileExpr(stmt.by, info, fctx) : undefined;
        const varRef = this.compileLValue({ k: 'local', name: stmt.var }, info, fctx);
        const varType = this.lvalueType({ k: 'local', name: stmt.var }, info);
        if (varType === undefined || typeof varType !== 'string') {
          throw new Error(
            `interpreter: biến FOR '${stmt.var}' phải là scalar (block '${info.block.name}')`,
          );
        }
        const range = intRange(varType);
        const bodyFns = stmt.body.map((s) => this.compileStmt(s, info));
        return (frame) => {
          const from = asNum(fromFn(frame));
          const to = asNum(toFn(frame));
          const by = byFn === undefined ? 1 : asNum(byFn(frame));
          let cur = from;
          varRef.write(frame, cur);
          let iter = 0;
          for (;;) {
            const cond = by > 0 ? cur <= to : by < 0 ? cur >= to : true;
            if (!cond) break;
            if (iter >= this.#maxLoopIterations) {
              this.#record(
                'LOOP_LIMIT',
                fctx,
                `vòng lặp FOR vượt ${String(this.#maxLoopIterations)} lần trong block '${info.block.name}'`,
              );
              break;
            }
            for (const fn of bodyFns) {
              if (frame.flow !== 'normal') break;
              fn(frame);
            }
            iter++;
            if (frame.flow === 'return') break;
            if (frame.flow === 'exit') {
              frame.flow = 'normal';
              break;
            }
            if (frame.flow === 'continue') frame.flow = 'normal';
            const next = cur + by;
            if (range !== undefined && (next < range.min || next > range.max)) break;
            cur = next;
            varRef.write(frame, cur);
          }
        };
      }
      case 'while': {
        const condFn = this.compileExpr(stmt.cond, info, fctx);
        const bodyFns = stmt.body.map((s) => this.compileStmt(s, info));
        return (frame) => {
          let iter = 0;
          while (condFn(frame) === true) {
            if (iter >= this.#maxLoopIterations) {
              this.#record(
                'LOOP_LIMIT',
                fctx,
                `vòng lặp WHILE vượt ${String(this.#maxLoopIterations)} lần trong block '${info.block.name}'`,
              );
              break;
            }
            for (const fn of bodyFns) {
              if (frame.flow !== 'normal') break;
              fn(frame);
            }
            iter++;
            if (frame.flow === 'return') break;
            if (frame.flow === 'exit') {
              frame.flow = 'normal';
              break;
            }
            if (frame.flow === 'continue') frame.flow = 'normal';
          }
        };
      }
      case 'repeat': {
        const untilFn = this.compileExpr(stmt.until, info, fctx);
        const bodyFns = stmt.body.map((s) => this.compileStmt(s, info));
        return (frame) => {
          let iter = 0;
          for (;;) {
            if (iter >= this.#maxLoopIterations) {
              this.#record(
                'LOOP_LIMIT',
                fctx,
                `vòng lặp REPEAT vượt ${String(this.#maxLoopIterations)} lần trong block '${info.block.name}'`,
              );
              break;
            }
            for (const fn of bodyFns) {
              if (frame.flow !== 'normal') break;
              fn(frame);
            }
            iter++;
            if (frame.flow === 'return') break;
            if (frame.flow === 'exit') {
              frame.flow = 'normal';
              break;
            }
            if (frame.flow === 'continue') frame.flow = 'normal';
            if (untilFn(frame) === true) break;
          }
        };
      }
      case 'exit':
        return (frame) => {
          frame.flow = 'exit';
        };
      case 'continue':
        return (frame) => {
          frame.flow = 'continue';
        };
      case 'return':
        return (frame) => {
          frame.flow = 'return';
        };
      case 'callFb': {
        const callee = this.#infos.get(stmt.block.toLowerCase());
        if (callee === undefined) {
          throw new Error(`interpreter: không tìm thấy FB '${stmt.block}'`);
        }
        const calleeKey = stmt.block.toLowerCase();
        const inArgs = stmt.inArgs.map(([name, e]) => {
          const param = callee.byName.get(name.toLowerCase());
          if (param === undefined) {
            throw new Error(`interpreter: FB '${stmt.block}' không có tham số '${name}'`);
          }
          if (typeof param.type === 'string') {
            return { name, type: param.type, scalar: this.compileExpr(e, info, fctx) };
          }
          return { name, type: param.type, composite: this.compileCompositeExpr(e, info, fctx) };
        });
        const outArgs = stmt.outArgs.map(([name, lv]) => {
          const param = callee.byName.get(name.toLowerCase());
          if (param === undefined) {
            throw new Error(`interpreter: FB '${stmt.block}' không có tham số '${name}'`);
          }
          return { name, type: param.type, ref: this.compileLValue(lv, info, fctx) };
        });
        const inoutArgs = stmt.inoutArgs.map(([name, lv]) => ({
          name,
          ref: this.compileLValue(lv, info, fctx),
        }));
        // Fast path (P1.7 bench): instance là DB tĩnh + mọi arg scalar + không
        // IN_OUT → resolve view/offset/field một lần lúc compile; mỗi scan chỉ
        // ghi/đọc trực tiếp qua writeMemValue/readMemValue, không tạo
        // viewFieldRef (8 Ref × ~9 closure mỗi lần gọi) và không quét DB.
        // Mọi trường hợp khác dùng slow path bên dưới (ngữ nghĩa không đổi).
        let fast: {
          view: DbView;
          store: DbStore;
          inArgs: { offset: number; field: IrField; scalar: (frame: Frame) => TagValue }[];
          outArgs: { offset: number; field: IrField; ref: CompiledRef }[];
        } | null = null;
        if (stmt.instance.k === 'dbField' && inoutArgs.length === 0) {
          const db = this.#dbsByName.get(stmt.instance.db.toLowerCase());
          const store = this.mem.dbs.get(stmt.instance.db.toLowerCase());
          if (db !== undefined && store !== undefined) {
            const view = walkView({ store, fields: db.fields, base: 0 }, stmt.instance.path);
            const fins: { offset: number; field: IrField; scalar: (frame: Frame) => TagValue }[] = [];
            const fouts: { offset: number; field: IrField; ref: CompiledRef }[] = [];
            let ok = true;
            for (const arg of inArgs) {
              if (arg.scalar === undefined) {
                ok = false;
                break;
              }
              const f = findField(view.fields, arg.name);
              if (f === undefined) {
                ok = false;
                break;
              }
              fins.push({ offset: view.base + f.byteOffset, field: f, scalar: arg.scalar });
            }
            if (ok) {
              for (const arg of outArgs) {
                if (typeof arg.type !== 'string') {
                  ok = false;
                  break;
                }
                const f = findField(view.fields, arg.name);
                if (f === undefined) {
                  ok = false;
                  break;
                }
                fouts.push({ offset: view.base + f.byteOffset, field: f, ref: arg.ref });
              }
            }
            if (ok) fast = { view, store, inArgs: fins, outArgs: fouts };
          }
        }
        if (fast !== null) {
          const f = fast;
          return (frame) => {
            if (frame.depth + 1 > this.#maxCallDepth) {
              this.#record(
                'CALL_DEPTH',
                fctx,
                `vượt độ sâu lời gọi tối đa ${String(this.#maxCallDepth)} khi gọi '${stmt.block}'`,
              );
              return;
            }
            const cf = createFrame(callee, frame.depth + 1);
            cf.instance = f.view;
            for (const arg of f.inArgs) {
              writeMemValue(f.store, arg.offset, arg.field, arg.scalar(frame));
            }
            const calleeEntry = this.#compiled.get(calleeKey);
            if (calleeEntry === undefined) {
              throw new Error(`interpreter: không tìm thấy FB '${stmt.block}'`);
            }
            calleeEntry.run(cf);
            for (const arg of f.outArgs) {
              arg.ref.write(frame, readMemValue(f.store, arg.offset, arg.field));
            }
          };
        }
        return (frame) => {
          if (frame.depth + 1 > this.#maxCallDepth) {
            this.#record(
              'CALL_DEPTH',
              fctx,
              `vượt độ sâu lời gọi tối đa ${String(this.#maxCallDepth)} khi gọi '${stmt.block}'`,
            );
            return;
          }
          const view = this.resolveInstance(stmt.instance, frame, info);
          const cf = createFrame(callee, frame.depth + 1);
          cf.instance = view;
          const recordArrayRange = this.#arrayRangeRecorder(fctx);
          for (const arg of inArgs) {
            const fieldRef = viewFieldRef(() => view, [arg.name], arg.type, recordArrayRange);
            if (arg.scalar !== undefined) {
              fieldRef.write(cf, arg.scalar(frame));
            } else {
              this.#writeCompositeValue(
                fieldRef,
                arg.type,
                cf,
                this.#cloneLocalValue(arg.composite(frame)),
                fctx,
              );
            }
          }
          for (const arg of inoutArgs) {
            cf.inout.set(arg.name.toLowerCase(), bindRef(arg.ref, frame));
          }
          const calleeEntry = this.#compiled.get(calleeKey);
          if (calleeEntry === undefined) {
            throw new Error(`interpreter: không tìm thấy FB '${stmt.block}'`);
          }
          calleeEntry.run(cf);
          for (const arg of outArgs) {
            const fieldRef = viewFieldRef(() => view, [arg.name], arg.type, recordArrayRange);
            if (typeof arg.type === 'string') {
              arg.ref.write(frame, fieldRef.read(cf));
            } else {
              this.#writeCompositeValue(
                arg.ref,
                arg.type,
                frame,
                this.#readCompositeValue(fieldRef, arg.type, cf, fctx),
                fctx,
              );
            }
          }
        };
      }
      case 'callFc': {
        const callee = this.#infos.get(stmt.block.toLowerCase());
        if (callee === undefined) {
          throw new Error(`interpreter: không tìm thấy FC '${stmt.block}'`);
        }
        const compiledArgs = stmt.args.map(([name, e]) => {
          const param = callee.byName.get(name.toLowerCase());
          if (param === undefined) {
            throw new Error(`interpreter: FC '${stmt.block}' không có tham số '${name}'`);
          }
          if (typeof param.type === 'string') {
            return { name, scalar: this.compileExpr(e, info, fctx) };
          }
          return { name, composite: this.compileCompositeExpr(e, info, fctx) };
        });
        const retRef = stmt.ret !== undefined ? this.compileLValue(stmt.ret, info, fctx) : undefined;
        const retType = callee.block.interface.returnType;
        return (frame) => {
          const cf = this.invokeFc(stmt.block, compiledArgs, frame, fctx);
          if (cf === null) return; // CALL_DEPTH — bỏ qua lời gọi
          if (retRef === undefined || retType === undefined) return;
          const retName = stmt.block.toLowerCase();
          if (typeof retType === 'string') {
            retRef.write(frame, cf.temp.get(retName) ?? defaultValue(retType));
          } else {
            this.#writeCompositeValue(
              retRef,
              retType,
              frame,
              this.#cloneLocalValue(cf.composite.get(retName) ?? defaultLocalValue(retType)),
              fctx,
            );
          }
        };
      }
      case 'callSys': {
        const inArgFns = stmt.inArgs.map(([name, e]) => ({
          name,
          fn: this.compileExpr(e, info, fctx),
        }));
        const outArgRefs = stmt.outArgs.map(([name, lv]) => ({
          name,
          ref: this.compileLValue(lv, info, fctx),
        }));
        return (frame) => {
          const handler = this.#sysCalls.get(stmt.fn);
          if (handler === undefined) {
            this.#record(
              'SYS_UNSUPPORTED',
              fctx,
              `system block '${stmt.fn}' chưa có handler (P1.5)`,
            );
            return;
          }
          const inArgs = new Map<string, TagValue>();
          for (const a of inArgFns) inArgs.set(a.name, a.fn(frame));
          const outArgs = new Map<string, Ref>();
          for (const a of outArgRefs) outArgs.set(a.name, bindRef(a.ref, frame));
          const instance =
            stmt.instance !== undefined
              ? this.resolveInstance(stmt.instance, frame, info)
              : undefined;
          handler(instance, inArgs, outArgs, this.nowMs);
        };
      }
    }
  }

  /** Biên dịch toàn bộ body của một block → hàm chạy nhận Frame. */
  compileBlock(info: BlockInfo): (frame: Frame) => void {
    const fns = info.block.body.map((s) => this.compileStmt(s, info));
    return (frame) => {
      for (const fn of fns) {
        if (frame.flow !== 'normal') break;
        fn(frame);
      }
    };
  }

  /** Chạy một block đã compile với instance view cho trước (hoặc không có). */
  runBlock(block: IrBlock, instance?: DbView): RuntimeFault[] {
    const entry = this.#compiled.get(block.name.toLowerCase());
    const info = this.#infos.get(block.name.toLowerCase());
    if (entry === undefined || info === undefined) {
      throw new Error(`interpreter: block '${block.name}' chưa được biên dịch`);
    }
    const frame = createFrame(info, 0);
    if (instance !== undefined) frame.instance = instance;
    entry.run(frame);
    return this.faults.snapshot();
  }
}
