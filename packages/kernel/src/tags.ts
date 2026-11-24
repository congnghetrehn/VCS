// TagDB — @vcs/kernel (M0 §6.2).
// Lưu trữ song song theo handle (mảng values/quality/ts/source + baseline
// `lastFlushed`); `get/set` không cấp phát; thông báo theo lô tại `flush()`.
// Chỉ chứa tag vùng I/Q — tag M/DB nằm ở TagCatalog, đọc/ghi qua controller.

import { createHash } from 'node:crypto';
import type {
  DataType,
  IoArea,
  Scaling,
  SignalKind,
  TagDef,
  TagOwner,
  TagValue,
  Unsub,
} from '@vcs/schemas';
import { TagError } from './errors.js';
import type { SimClock } from './clock.js';

export type TagHandle = number & { readonly __brand: 'TagHandle' };
export type TagSource = 'plant' | 'plc' | 'test' | 'hmi' | 'gateway' | 'system' | 'import';
export type Quality = 'good' | 'bad' | 'uncertain';

export interface TagMeta {
  readonly handle: TagHandle;
  readonly name: string;
  readonly type: DataType;
  readonly area: IoArea;
  readonly controller: string;
  readonly kind: SignalKind | null;
  readonly initial: TagValue;
  readonly scaling?: Scaling;
  readonly description?: string;
}

export interface Tag {
  name: string;
  type: DataType;
  value: TagValue;
  quality: Quality;
  ts: number;
  source: TagSource;
}

export interface TagChange {
  handle: TagHandle;
  name: string;
  oldValue: TagValue;
  newValue: TagValue;
  source: TagSource;
  ts: number;
  /** Số lần ghi trong kỳ (từ lần flush trước); 0 nếu thay đổi do restore/reset (OQ-019). */
  writes: number;
}

export interface TagDBOptions {
  validate?: boolean;
  enforceOwnership?: boolean;
}

export interface TagDBSnapshot {
  namesHash: string;
  values: TagValue[];
  quality: number[];
  ts: number[];
  source: TagSource[];
}

/** Mã hóa Quality trong snapshot: good=0, bad=1, uncertain=2. */
const QUALITY_CODE: Record<Quality, number> = { good: 0, bad: 1, uncertain: 2 };
const CODE_QUALITY: readonly Quality[] = ['good', 'bad', 'uncertain'];

/** Khoảng hợp lệ theo kiểu (M0 §6.2 quy tắc 5) — giữ đồng bộ với
 * `TYPE_RANGES` trong `packages/schemas/src/tags.ts` (dùng khi validate
 * giá trị khởi tạo ở `loadProject`, mã PRJ-E014). */
const TYPE_RANGES: Record<string, { min: number; max: number; int: boolean }> = {
  Byte: { min: 0, max: 255, int: true },
  USInt: { min: 0, max: 255, int: true },
  Word: { min: 0, max: 65535, int: true },
  UInt: { min: 0, max: 65535, int: true },
  DWord: { min: 0, max: 4294967295, int: true },
  UDInt: { min: 0, max: 4294967295, int: true },
  SInt: { min: -128, max: 127, int: true },
  Int: { min: -32768, max: 32767, int: true },
  DInt: { min: -2147483648, max: 2147483647, int: true },
  Real: { min: -Infinity, max: Infinity, int: false },
  LReal: { min: -Infinity, max: Infinity, int: false },
  Time: { min: 0, max: Infinity, int: true },
};

function defaultInitial(type: DataType): TagValue {
  if (type === 'Bool') return false;
  if (type === 'String') return '';
  return 0;
}

/** Kiểm tra giá trị theo kiểu; sai → `TagError('TAG-E001')`. */
function validateValue(type: DataType, value: TagValue, where: string): void {
  let ok: boolean;
  if (type === 'Bool') {
    ok = typeof value === 'boolean';
  } else if (type === 'String') {
    ok = typeof value === 'string';
  } else if (typeof value !== 'number') {
    ok = false;
  } else {
    const range = TYPE_RANGES[type];
    if (range === undefined) {
      ok = false;
    } else if (range.int) {
      ok = Number.isInteger(value) && value >= range.min && value <= range.max;
    } else {
      ok = true; // Real/LReal chấp nhận mọi số, kể cả NaN/±Infinity
    }
  }
  if (!ok) {
    throw new TagError(
      'TAG-E001',
      `${where}: giá trị ${formatValue(value)} không hợp lệ cho kiểu '${type}'`,
    );
  }
}

/** Chuẩn hóa giá trị khi ghi (AGENTS §4): Real luôn `Math.fround`,
 * DWord/UDInt về `>>> 0`; các kiểu khác giữ nguyên. */
function normalizeValue(type: DataType, value: TagValue): TagValue {
  if (type === 'Real' && typeof value === 'number') return Math.fround(value);
  if ((type === 'DWord' || type === 'UDInt') && typeof value === 'number') return value >>> 0;
  return value;
}

function formatValue(value: TagValue): string {
  if (typeof value === 'string') return `'${value}'`;
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
  return String(value);
}

/** Nguồn được phép ghi theo owner (M0 §6.2 quy tắc 6). */
const ALLOWED_SOURCES: Record<TagOwner, readonly TagSource[]> = {
  plant: ['plant', 'system'],
  controller: ['plc', 'system'],
  free: ['test', 'hmi', 'gateway', 'system'],
};

export class TagDB {
  readonly #clock: SimClock;
  readonly #validate: boolean;
  readonly #enforceOwnership: boolean;
  readonly #metas: TagMeta[];
  readonly #names: readonly string[];
  readonly #byName = new Map<string, TagHandle>();
  readonly #namesHash: string;
  readonly #values: TagValue[];
  readonly #quality: Quality[];
  readonly #ts: number[];
  readonly #source: TagSource[];
  readonly #owners: TagOwner[];
  /** Giá trị đã flush lần trước — baseline để so sánh ở `flush()`. */
  readonly #lastFlushed: TagValue[];
  readonly #writes: number[];
  readonly #dirty: boolean[];
  #dirtyCount = 0;
  readonly #subs: Array<{
    sel: '*' | readonly TagHandle[];
    selSet: ReadonlySet<TagHandle> | null;
    cb: (changes: readonly TagChange[]) => void;
  }> = [];

  constructor(defs: readonly TagDef[], clock: SimClock, opts?: TagDBOptions) {
    // Mặc định cả hai true (OQ-014); caller bench/production truyền tường minh false.
    this.#validate = opts?.validate ?? true;
    this.#enforceOwnership = opts?.enforceOwnership ?? true;
    this.#clock = clock;

    const metas: TagMeta[] = [];
    const names: string[] = [];
    const values: TagValue[] = [];
    const quality: Quality[] = [];
    const ts: number[] = [];
    const source: TagSource[] = [];
    const owners: TagOwner[] = [];
    defs.forEach((def, i) => {
      if (def.area !== 'I' && def.area !== 'Q') {
        throw new Error(
          `TagDB chỉ chứa tag vùng I/Q: tag '${def.name}' ở area '${def.area}' — ` +
            `lọc I/Q qua TagCatalog trước khi dựng TagDB (M0 §6.2).`,
        );
      }
      if (this.#byName.has(def.name)) {
        throw new Error(`TagDB: trùng tên tag '${def.name}' — tên tag phải duy nhất.`);
      }
      const handle = i as TagHandle;
      this.#byName.set(def.name, handle);
      const kind = def.signal?.kind ?? null;
      // Mặc định owner: DO/AO → controller; DI/AI/kind null → free
      // (M2 gọi setOwner(h, 'plant') khi gán thiết bị).
      const owner: TagOwner = kind === 'DO' || kind === 'AO' ? 'controller' : 'free';
      owners.push(owner);
      const initial =
        def.initial !== undefined
          ? normalizeValue(def.type, def.initial)
          : defaultInitial(def.type);
      if (this.#validate && def.initial !== undefined) {
        validateValue(def.type, def.initial, `tag '${def.name}' (initial)`);
      }
      const meta: TagMeta = {
        handle,
        name: def.name,
        type: def.type,
        area: def.area,
        controller: def.controller,
        kind,
        initial,
        ...(def.signal?.scaling !== undefined ? { scaling: def.signal.scaling } : {}),
        ...(def.description !== undefined ? { description: def.description } : {}),
      };
      metas.push(meta);
      names.push(def.name);
      values.push(initial);
      quality.push('good');
      ts.push(clock.nowMs());
      source.push('system');
    });
    this.#metas = metas;
    this.#names = Object.freeze(names);
    this.#values = values;
    this.#quality = quality;
    this.#ts = ts;
    this.#source = source;
    this.#owners = owners;
    this.#lastFlushed = [...values];
    this.#writes = new Array<number>(values.length).fill(0);
    this.#dirty = new Array<boolean>(values.length).fill(false);
    // OQ-018: sha256 của các tên nối bằng '\n' (tên tag không chứa BOM/CRLF
    // nên giống hệt hashText của @vcs/project); chỉ dùng nội bộ cho restore().
    this.#namesHash = createHash('sha256').update(names.join('\n'), 'utf8').digest('hex');
  }

  get size(): number {
    return this.#metas.length;
  }

  handle(name: string): TagHandle | undefined {
    return this.#byName.get(name);
  }

  has(name: string): boolean {
    return this.#byName.has(name);
  }

  meta(h: TagHandle): TagMeta {
    this.#checkHandle(h, 'meta');
    return this.#metas[h] as TagMeta;
  }

  names(): readonly string[] {
    return this.#names;
  }

  /** Đọc nhanh theo handle, không cấp phát. */
  get(h: TagHandle): TagValue {
    this.#checkHandle(h, 'get');
    return this.#values[h] as TagValue;
  }

  /** Ghi nhanh theo handle (alias của `write`); mặc định source `'system'` (OQ-013). */
  set(h: TagHandle, v: TagValue, source: TagSource = 'system'): void {
    this.#checkHandle(h, 'set');
    this.#applyWrite(h, v, source);
  }

  /** Đọc theo tên (cấp phát khi tra tên); không tồn tại → `TagError('TAG-E003')`. */
  read(name: string): Tag {
    const h = this.#byName.get(name);
    if (h === undefined) {
      throw new TagError('TAG-E003', `tag '${name}' không tồn tại`);
    }
    const meta = this.#metas[h] as TagMeta;
    return {
      name,
      type: meta.type,
      value: this.#values[h] as TagValue,
      quality: this.#quality[h] as Quality,
      ts: this.#ts[h] as number,
      source: this.#source[h] as TagSource,
    };
  }

  /** Ghi theo tên hoặc handle; mặc định source `'system'`. */
  write(ref: string | TagHandle, v: TagValue, source: TagSource = 'system'): void {
    const h = typeof ref === 'string' ? this.#byName.get(ref) : ref;
    if (h === undefined) {
      throw new TagError('TAG-E003', `tag '${String(ref)}' không tồn tại`);
    }
    this.#checkHandle(h, 'write');
    this.#applyWrite(h, v, source);
  }

  setOwner(h: TagHandle, owner: TagOwner): void {
    this.#checkHandle(h, 'setOwner');
    this.#owners[h] = owner;
  }

  owner(h: TagHandle): TagOwner {
    this.#checkHandle(h, 'owner');
    return this.#owners[h] as TagOwner;
  }

  checkWrite(h: TagHandle, source: TagSource): 'ok' | 'denied' {
    this.#checkHandle(h, 'checkWrite');
    const owner = this.#owners[h] as TagOwner;
    return ALLOWED_SOURCES[owner].includes(source) ? 'ok' : 'denied';
  }

  setQuality(h: TagHandle, q: Quality): void {
    this.#checkHandle(h, 'setQuality');
    this.#quality[h] = q;
  }

  subscribe(sel: '*' | readonly TagHandle[], cb: (changes: readonly TagChange[]) => void): Unsub {
    const entry = {
      sel,
      selSet: sel === '*' ? null : new Set(sel),
      cb,
    };
    this.#subs.push(entry);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const i = this.#subs.indexOf(entry);
      if (i >= 0) this.#subs.splice(i, 1);
    };
  }

  /**
   * Phát thay đổi theo lô (gọi cuối mỗi bước).
   * Duyệt tag dirty theo thứ tự handle tăng dần; chỉ phát tag khác giá trị
   * đã flush lần trước (giá trị quay về như cũ → không phát). Baseline được
   * cập nhật TRƯỚC khi gọi subscriber, nên subscriber ném lỗi (lan truyền,
   * OQ-015) cũng không làm thay đổi bị phát lại ở lần flush sau.
   * Không có subscriber → không cấp phát mảng.
   */
  flush(): void {
    if (this.#dirtyCount === 0) return;
    const hasSubs = this.#subs.length > 0;
    let changes: TagChange[] | undefined;
    if (hasSubs) changes = [];
    const n = this.#metas.length;
    for (let i = 0; i < n; i++) {
      if (!this.#dirty[i]) continue;
      this.#dirty[i] = false;
      const h = i as TagHandle;
      const oldValue = this.#lastFlushed[i] as TagValue;
      const newValue = this.#values[i] as TagValue;
      const writes = this.#writes[i] as number;
      this.#writes[i] = 0;
      if (oldValue !== newValue) {
        this.#lastFlushed[i] = newValue;
        if (changes !== undefined) {
          changes.push({
            handle: h,
            name: this.#names[i] as string,
            oldValue,
            newValue,
            source: this.#source[i] as TagSource,
            ts: this.#ts[i] as number,
            writes,
          });
        }
      }
    }
    this.#dirtyCount = 0;
    if (changes !== undefined && changes.length > 0) {
      for (const sub of this.#subs) {
        if (sub.sel === '*') {
          sub.cb(changes);
        } else {
          const selSet = sub.selSet as ReadonlySet<TagHandle>;
          const filtered = changes.filter((c) => selSet.has(c.handle));
          if (filtered.length > 0) sub.cb(filtered);
        }
      }
    }
  }

  snapshot(): TagDBSnapshot {
    return {
      namesHash: this.#namesHash,
      values: [...this.#values],
      quality: this.#quality.map((q) => QUALITY_CODE[q]),
      ts: [...this.#ts],
      source: [...this.#source],
    };
  }

  /**
   * Khôi phục snapshot; `namesHash` không khớp → lỗi `SIM-E003`.
   * Sau restore, `flush()` phát thay đổi so với giá trị flush cuối
   * (baseline giữ nguyên); `writes` của các thay đổi đó = 0 (OQ-019).
   */
  restore(s: TagDBSnapshot): void {
    const n = this.#metas.length;
    if (
      s.namesHash !== this.#namesHash ||
      s.values.length !== n ||
      s.quality.length !== n ||
      s.ts.length !== n ||
      s.source.length !== n
    ) {
      throw new Error(
        `SIM-E003: snapshot không tương thích — snapshot được tạo bởi tập tag khác, ` +
          `chạy lại từ đầu hoặc migrate snapshot.`,
      );
    }
    for (let i = 0; i < n; i++) {
      this.#values[i] = s.values[i] as TagValue;
      this.#quality[i] = CODE_QUALITY[s.quality[i] as number] as Quality;
      this.#ts[i] = s.ts[i] as number;
      this.#source[i] = s.source[i] as TagSource;
      this.#writes[i] = 0;
    }
    this.#refreshDirty();
  }

  /** Về giá trị khởi tạo; sau reset, `flush()` phát thay đổi so với giá trị flush cuối. */
  reset(): void {
    const now = this.#clock.nowMs();
    for (let i = 0; i < this.#metas.length; i++) {
      const meta = this.#metas[i] as TagMeta;
      this.#values[i] = meta.initial;
      this.#quality[i] = 'good';
      this.#ts[i] = now;
      this.#source[i] = 'system';
      this.#writes[i] = 0;
    }
    this.#refreshDirty();
  }

  #refreshDirty(): void {
    let count = 0;
    for (let i = 0; i < this.#metas.length; i++) {
      const dirty = this.#values[i] !== this.#lastFlushed[i];
      this.#dirty[i] = dirty;
      if (dirty) count += 1;
    }
    this.#dirtyCount = count;
  }

  #checkHandle(h: TagHandle, where: string): void {
    if (!Number.isInteger(h) || h < 0 || h >= this.#metas.length) {
      throw new TagError(
        'TAG-E003',
        `${where}: handle ${String(h)} ngoài khoảng (0..${String(this.#metas.length - 1)})`,
      );
    }
  }

  #applyWrite(h: TagHandle, v: TagValue, source: TagSource): void {
    const meta = this.#metas[h] as TagMeta;
    if (this.#validate) {
      validateValue(meta.type, v, `tag '${meta.name}'`);
    }
    if (this.#enforceOwnership && this.checkWrite(h, source) === 'denied') {
      const owner = this.#owners[h] as TagOwner;
      throw new TagError(
        'TAG-E002',
        `tag '${meta.name}' thuộc owner '${owner}', nguồn '${source}' không được ghi ` +
          `(cho phép: ${ALLOWED_SOURCES[owner].join(', ')})`,
      );
    }
    this.#values[h] = normalizeValue(meta.type, v);
    this.#ts[h] = this.#clock.nowMs();
    this.#source[h] = source;
    this.#writes[h] = (this.#writes[h] as number) + 1;
    if (!this.#dirty[h]) {
      this.#dirty[h] = true;
      this.#dirtyCount += 1;
    }
  }
}
