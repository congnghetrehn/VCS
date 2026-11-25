// SoftPlc — CPU Siemens mềm + scheduler (§8, §10; P1.4).
// `ControllerAdapter` (đồng bộ, A1) + `ControllerIntrospection` (D3).
// Scheduler theo mô hình lưới thời gian đều (OQ-130): scan tại
// `lastScanTimeMs + k * scanPeriodMs` — không có scan tại T=0 khi vừa start.
// Lệch so với plan §19 (ghi ở STATE §19 "Lệch khi triển khai"):
// - Cyclic OB không có `cycleMs` → period mặc định 100 ms (chuẩn Siemens
//   cho OB ngắt chu kỳ OB30–38; `compileSclProgram` hiện không sinh cycleMs).
// - `start()` reset `accMs` về 0 cùng với rebase lưới (acc cũ thuộc lưới cũ).
// - `reset()` đặt state về STOP (cold restart — cần `start()` lại).
// - Force M/DB chỉ là lớp phủ ở `read()`/`write()` (F3): bộ nhớ giữ nguyên
//   giá trị chương trình ghi; chỉ force I (vào PII sau latch) và force Q
//   (vào PIQ sau OB1) mới chạm bộ nhớ trong scan.

import { TagError, validateTagValue } from '@vcs/kernel';
import type {
  ControllerAdapter,
  ControllerConfig,
  ControllerDiagnostics,
  ControllerIntrospection,
  IoBus,
  IoPort,
} from '@vcs/kernel';
import type { TagValue, Unsub } from '@vcs/schemas';
import type { IrBlock, IrDb, IrExpr, IrField, IrLValue, IrProgram, IrStmt, PrimitiveType } from './ir.js';
import { FaultCollector, type RuntimeFault } from './faults.js';
import {
  Interpreter,
  findField,
  initDbStore,
  readMemValue,
  writeMemValue,
  type PlcMemory,
} from './interpreter.js';
import { DbStore, MemoryArea, type MemoryScalarType } from './memory.js';
import { createStdSysCalls } from './std/handlers.js';
import type { SysCallHandler } from './interpreter.js';
import { buildTagAddressMap, canonicalRef, parsePlcRef, type ParsedRef, type TagAddressMap, type TagAddr } from './tagmap.js';
import { sizeOf } from './types.js';

export interface SoftPlcConfig {
  id: string;
  scanPeriodMs: number;
  /** Mặc định 50 (M1 §17). */
  maxScansPerStep?: number;
  /** Mặc định 'continue'. */
  faultPolicy?: 'continue' | 'stop';
  /** Mặc định 24 (§7.1). */
  maxCallDepth?: number;
  /** Mặc định 10_000 (OQ-132). */
  maxLoopIterations?: number;
  /** Mặc định 'zero' (§17). */
  outputsOnStop?: 'zero' | 'hold';
  /**
   * Registry system block (OQ-170): mặc định `createStdSysCalls()` (đủ 11
   * block M1 §9); truyền vào thì THAY THẾ map mặc định (điểm nối test /
   * adapter ngoài). `Interpreter` không đổi: không truyền → SYS_UNSUPPORTED.
   */
  sysCalls?: Map<string, SysCallHandler>;
}

export interface ScanInfo {
  scanTimeMs: number;
  scanCount: number;
}

export interface SoftPlcSnapshot {
  version: 1;
  state: 'STOP' | 'RUN';
  scanCount: number;
  lastScanSimMs: number;
  accMs: number;
  lastScanTimeMs: number | null;
  ob100Done: boolean;
  cyclic: { ob: number; lastIdx: number }[];
  /** Byte theo từng vùng (OQ-147). */
  memI: number[];
  memQ: number[];
  memM: number[];
  dbs: { name: string; bytes: number[] }[];
  /** Ref đã chuẩn hóa (OQ-142). */
  forces: { ref: string; value: TagValue }[];
  faults: RuntimeFault[];
}

interface CyclicOb {
  ob: number;
  block: IrBlock;
  periodMs: number;
  phaseMs: number;
  lastIdx: number;
}

interface StoredForce {
  value: TagValue;
  parsed: ParsedRef;
}

function sizeOrThrow(type: PrimitiveType): number {
  const size = sizeOf(type);
  if (size === undefined) {
    throw new Error(`softplc: không xác định được kích thước kiểu '${type}'`);
  }
  return size;
}

/** Quét IR: kích thước vùng I/Q/M cần thiết + số DB/ng tên DB được tham chiếu. */
function measureProgram(program: IrProgram): {
  i: number;
  q: number;
  m: number;
  absDbNumbers: Set<number>;
  dbFieldNames: Set<string>;
} {
  let i = 0;
  let q = 0;
  let m = 0;
  const absDbNumbers = new Set<number>();
  const dbFieldNames = new Set<string>();
  const visitLValue = (lv: IrLValue): void => {
    switch (lv.k) {
      case 'abs': {
        const end = lv.byte + (lv.bit !== undefined ? 1 : sizeOrThrow(lv.type));
        if (lv.area === 'I') i = Math.max(i, end);
        else if (lv.area === 'Q') q = Math.max(q, end);
        else m = Math.max(m, end);
        break;
      }
      case 'absDb':
        absDbNumbers.add(lv.db);
        break;
      case 'dbField':
        dbFieldNames.add(lv.db);
        break;
      case 'index':
        visitLValue(lv.base);
        visitExpr(lv.index);
        break;
      case 'member':
        visitLValue(lv.base);
        break;
      default:
        break;
    }
  };
  const visitExpr = (e: IrExpr): void => {
    switch (e.op) {
      case 'load':
        visitLValue(e.ref);
        break;
      case 'unary':
        visitExpr(e.a);
        break;
      case 'binary':
        visitExpr(e.a);
        visitExpr(e.b);
        break;
      case 'convert':
        visitExpr(e.a);
        break;
      case 'intrinsic':
        for (const a of e.args) visitExpr(a);
        break;
      case 'callFcExpr':
        for (const [, a] of e.args) visitExpr(a);
        break;
      case 'const':
        break;
    }
  };
  const visitStmt = (s: IrStmt): void => {
    switch (s.op) {
      case 'assign':
        visitLValue(s.target);
        visitExpr(s.value);
        break;
      case 'if':
        visitExpr(s.cond);
        for (const x of s.then) visitStmt(x);
        for (const e of s.elsif) {
          visitExpr(e.cond);
          for (const x of e.body) visitStmt(x);
        }
        for (const x of s.else) visitStmt(x);
        break;
      case 'case':
        visitExpr(s.sel);
        for (const a of s.arms) for (const x of a.body) visitStmt(x);
        for (const x of s.else) visitStmt(x);
        break;
      case 'for':
        visitExpr(s.from);
        visitExpr(s.to);
        if (s.by !== undefined) visitExpr(s.by);
        for (const x of s.body) visitStmt(x);
        break;
      case 'while':
        visitExpr(s.cond);
        for (const x of s.body) visitStmt(x);
        break;
      case 'repeat':
        visitExpr(s.until);
        for (const x of s.body) visitStmt(x);
        break;
      case 'callFb':
        visitLValue(s.instance);
        for (const [, e] of s.inArgs) visitExpr(e);
        for (const [, lv] of s.outArgs) visitLValue(lv);
        for (const [, lv] of s.inoutArgs) visitLValue(lv);
        break;
      case 'callFc':
        for (const [, e] of s.args) visitExpr(e);
        if (s.ret !== undefined) visitLValue(s.ret);
        break;
      case 'callSys':
        if (s.instance !== undefined) visitLValue(s.instance);
        for (const [, e] of s.inArgs) visitExpr(e);
        for (const [, lv] of s.outArgs) visitLValue(lv);
        break;
      case 'exit':
      case 'continue':
      case 'return':
        break;
    }
  };
  for (const b of program.blocks) {
    for (const s of b.body) visitStmt(s);
  }
  return { i, q, m, absDbNumbers, dbFieldNames };
}

/** Resolve đường dẫn dbField → {store, offset, field lá}. */
function resolveDbFieldPath(
  db: IrDb,
  store: DbStore,
  path: readonly string[],
): { store: DbStore; offset: number; field: IrField } {
  let fields = db.fields;
  let offset = 0;
  for (let idx = 0; idx < path.length; idx++) {
    const name = path[idx] as string;
    const field = findField(fields, name);
    if (field === undefined) {
      throw new Error(`softplc: không tìm thấy field '${name}' trong DB '${db.name}'`);
    }
    if (idx === path.length - 1) {
      return { store, offset: offset + field.byteOffset, field };
    }
    if (typeof field.type === 'string' || field.type.kind !== 'struct') {
      throw new Error(`softplc: field '${name}' trong DB '${db.name}' không phải struct`);
    }
    fields = field.type.fields;
    offset += field.byteOffset;
  }
  throw new Error(`softplc: đường dẫn DB '${db.name}' rỗng`);
}

const FAULT_CODES: ReadonlySet<string> = new Set<string>([
  'DIV_ZERO',
  'CONV_RANGE',
  'ARRAY_RANGE',
  'CALL_DEPTH',
  'LOOP_LIMIT',
  'CYCLE_OVERRUN',
  'SCAN_OVERRUN',
  'SYS_UNSUPPORTED',
]);

export class SoftPlc implements ControllerAdapter, ControllerIntrospection {
  readonly id: string;
  readonly kind = 'builtin' as const;
  readonly #faults = new FaultCollector();
  #program: IrProgram = { blocks: [], dbs: [], udts: [], organization: [] };
  #tagMap: TagAddressMap = new Map<string, TagAddr>();
  #mem: PlcMemory = {
    i: new MemoryArea(0),
    q: new MemoryArea(0),
    m: new MemoryArea(0),
    dbs: new Map<string, DbStore>(),
    dbNumbers: new Map<string, number>(),
  };
  /** Registry system block duy nhất của PLC (OQ-170): mặc định đủ 11 block
   * M1 §9; `cfg.sysCalls` (nếu có) thay thế ở constructor, trước khi
   * `#setupProgram` dựng Interpreter thật. */
  #sysCalls: Map<string, SysCallHandler> = createStdSysCalls();
  #interpreter: Interpreter = new Interpreter(
    { blocks: [], dbs: [], udts: [], organization: [] },
    {
      i: new MemoryArea(0),
      q: new MemoryArea(0),
      m: new MemoryArea(0),
      dbs: new Map<string, DbStore>(),
      dbNumbers: new Map<string, number>(),
    },
    this.#faults,
    { sysCalls: this.#sysCalls },
  );
  #scanPeriodMs: number;
  readonly #maxScansPerStep: number;
  readonly #faultPolicy: 'continue' | 'stop';
  readonly #maxCallDepth: number;
  readonly #maxLoopIterations: number;
  readonly #outputsOnStop: 'zero' | 'hold';
  #state: 'STOP' | 'RUN' = 'STOP';
  #scanCount = 0;
  #lastScanSimMs = 0;
  #accMs = 0;
  #lastScanTimeMs: number | null = null;
  #ob100Done = false;
  #ob1: IrBlock | undefined = undefined;
  #ob100: IrBlock | undefined = undefined;
  #cyclic: CyclicOb[] = [];
  #forces = new Map<string, StoredForce>();
  #port: IoPort | undefined = undefined;
  #initialized = false;
  #inputAddrs: TagAddr[] = [];
  #outputAddrs: TagAddr[] = [];
  #inBuf: TagValue[] = [];
  #outBuf: TagValue[] = [];
  #scanCbs: Array<(info: ScanInfo) => void> = [];

  constructor(program: IrProgram, tagMap: TagAddressMap, cfg: SoftPlcConfig) {
    this.id = cfg.id;
    this.#scanPeriodMs = cfg.scanPeriodMs;
    this.#maxScansPerStep = cfg.maxScansPerStep ?? 50;
    this.#faultPolicy = cfg.faultPolicy ?? 'continue';
    this.#maxCallDepth = cfg.maxCallDepth ?? 24;
    this.#maxLoopIterations = cfg.maxLoopIterations ?? 10_000;
    this.#outputsOnStop = cfg.outputsOnStop ?? 'zero';
    if (cfg.sysCalls !== undefined) this.#sysCalls = cfg.sysCalls;
    this.#setupProgram(program, tagMap);
  }

  // ---------------------------------------------------------- Lifecycle

  /** Nạp chương trình mới — yêu cầu STOP (OQ-139); xóa forces + reset trạng thái. */
  load(program: IrProgram): void {
    if (this.#state !== 'STOP') {
      throw new Error(`softplc: load yêu cầu STOP (đang ${this.#state})`);
    }
    this.#setupProgram(program, this.#tagMap);
  }

  /** Khởi tạo từ `createSimulation`: build lại map từ `cfg.tags` (OQ-138). */
  init(cfg: ControllerConfig, io: IoBus): Promise<void> {
    // Đồng bộ, trả Promise.resolve(): interface ControllerAdapter cho phép
    // `void | Promise<void>`; throw đồng bộ để caller thấy ngay (test dùng
    // expect sync, không dùng .rejects). async không await bị lint chặn.
    if (this.#initialized) {
      throw new Error(`softplc: init gọi 2 lần (controller '${cfg.id}')`);
    }
    this.#initialized = true;
    const tagMap = buildTagAddressMap(cfg.tags);
    this.#scanPeriodMs = cfg.scanPeriodMs;
    // Build lại bộ nhớ + interpreter theo map mới (tag có thể trỏ tới địa
    // chỉ mà chương trình IR không dùng tới — vẫn phải đủ chỗ).
    this.#setupProgram(this.#program, tagMap);
    const port = io.port(cfg.id);
    this.#port = port;
    this.#inputAddrs = port.inputNames.map((name) => {
      const addr = tagMap.get(name);
      if (addr === undefined) {
        throw new Error(`softplc: tag input '${name}' không có trong TagAddressMap`);
      }
      return addr;
    });
    this.#outputAddrs = port.outputNames.map((name) => {
      const addr = tagMap.get(name);
      if (addr === undefined) {
        throw new Error(`softplc: tag output '${name}' không có trong TagAddressMap`);
      }
      return addr;
    });
    this.#inBuf = new Array<TagValue>(port.inputNames.length).fill(false);
    this.#outBuf = new Array<TagValue>(port.outputNames.length).fill(false);
    return Promise.resolve();
  }

  start(): void {
    if (this.#state === 'RUN') return;
    this.#state = 'RUN';
    // Rebase lưới (OQ-154): acc cũ thuộc lưới cũ nên xóa cùng lúc.
    this.#accMs = 0;
    this.#lastScanTimeMs = null;
    this.#ob100Done = false;
  }

  stop(): void {
    if (this.#state === 'STOP') return;
    this.#state = 'STOP';
    if (this.#outputsOnStop === 'zero') {
      this.#mem.q.restore(new Uint8Array(this.#mem.q.sizeBytes));
      if (this.#port !== undefined) {
        for (let i = 0; i < this.#outputAddrs.length; i++) {
          this.#outBuf[i] = this.#readMemByAddr(this.#outputAddrs[i] as TagAddr);
        }
        this.#port.writeOutputsFrom(this.#outBuf);
      }
    }
  }

  /** Cold reset (OQ-140): bộ nhớ về init, xóa forces/faults/scanCount/acc/cyclic; state về STOP. */
  reset(): void {
    this.#setupProgram(this.#program, this.#tagMap);
    this.#state = 'STOP';
  }

  // ---------------------------------------------------------- Step / scan

  /** Một bước orchestrator — ĐỒNG BỘ (A1). STOP → no-op; dt=0 → no-op. */
  step(simTimeMs: number, dtMs: number): void {
    if (this.#state === 'STOP') return;
    if (dtMs < 0) {
      throw new RangeError(`softplc: dtMs âm (${String(dtMs)})`);
    }
    if (this.#lastScanTimeMs !== null && simTimeMs < this.#lastScanTimeMs) {
      throw new RangeError(
        `softplc: simTimeMs đi ngược (${String(simTimeMs)} < ${String(this.#lastScanTimeMs)})`,
      );
    }
    if (dtMs === 0) return;
    if (this.#lastScanTimeMs === null) {
      // Rebase lưới tại thời điểm bước đầu sau start (OQ-130).
      this.#lastScanTimeMs = simTimeMs;
      for (const cyc of this.#cyclic) {
        cyc.lastIdx = Math.floor((simTimeMs - cyc.phaseMs) / cyc.periodMs);
      }
    }
    this.#accMs += dtMs;
    let n = Math.floor(this.#accMs / this.#scanPeriodMs);
    if (n > this.#maxScansPerStep) {
      // OQ-131: SCAN_OVERRUN đếm số scan bị cắt, không phải số lần overrun.
      this.#faults.record('SCAN_OVERRUN', {
        simTimeMs,
        message: `vượt maxScansPerStep ${String(this.#maxScansPerStep)}: cắt ${String(n - this.#maxScansPerStep)} scan, giữ acc thừa`,
        count: n - this.#maxScansPerStep,
      });
      n = this.#maxScansPerStep;
    }
    for (let k = 0; k < n; k++) {
      const scanTime: number = this.#lastScanTimeMs + this.#scanPeriodMs;
      this.#scan(scanTime);
      this.#lastScanTimeMs = scanTime;
    }
    this.#accMs -= n * this.#scanPeriodMs;
  }

  /** Một scan tại thời điểm `t` (§8.2). */
  #scan(t: number): void {
    this.#interpreter.nowMs = t;
    const faultsBefore = this.#faultTotal();
    // (a) Latch input từ IoBus → PII, rồi áp force I (force thắng).
    if (this.#port !== undefined) {
      this.#port.readInputsInto(this.#inBuf);
      for (let i = 0; i < this.#inputAddrs.length; i++) {
        this.#writeMemByAddr(this.#inputAddrs[i] as TagAddr, this.#inBuf[i] as TagValue);
      }
    }
    this.#applyForcesToMem('I');
    // (b) OB100 một lần sau RUN.
    if (!this.#ob100Done) {
      if (this.#ob100 !== undefined) this.#interpreter.runBlock(this.#ob100);
      this.#ob100Done = true;
    }
    // (c) Cyclic OB đến hạn (theo số OB tăng dần), tối đa 1 lần/scan.
    for (const cyc of this.#cyclic) {
      const idx = Math.floor((t - cyc.phaseMs) / cyc.periodMs);
      if (idx > cyc.lastIdx) {
        const missed = idx - cyc.lastIdx - 1;
        if (missed > 0) {
          // Đếm số kỳ trễ (không phải số lần ghi).
          this.#faults.record('CYCLE_OVERRUN', {
            simTimeMs: t,
            message: `OB${String(cyc.ob)} trễ ${String(missed)} kỳ tại scan ${String(t)} ms`,
            count: missed,
          });
        }
        cyc.lastIdx = idx;
        this.#interpreter.runBlock(cyc.block);
      }
    }
    // (d) OB1.
    if (this.#ob1 !== undefined) this.#interpreter.runBlock(this.#ob1);
    // (e) Áp force Q rồi đẩy PIQ ra IoBus.
    this.#applyForcesToMem('Q');
    if (this.#port !== undefined) {
      for (let i = 0; i < this.#outputAddrs.length; i++) {
        this.#outBuf[i] = this.#readMemByAddr(this.#outputAddrs[i] as TagAddr);
      }
      this.#port.writeOutputsFrom(this.#outBuf);
    }
    this.#scanCount++;
    this.#lastScanSimMs = t;
    if (this.#faultPolicy === 'stop' && this.#faultTotal() > faultsBefore) {
      this.stop();
    }
    const info: ScanInfo = { scanTimeMs: t, scanCount: this.#scanCount };
    for (const cb of [...this.#scanCbs]) cb(info);
  }

  onScan(cb: (info: ScanInfo) => void): Unsub {
    this.#scanCbs.push(cb);
    return () => {
      const idx = this.#scanCbs.indexOf(cb);
      if (idx >= 0) this.#scanCbs.splice(idx, 1);
    };
  }

  // ---------------------------------------------------------- Introspection

  read(ref: string): TagValue {
    const parsed = parsePlcRef(ref, this.#tagMap);
    const key = canonicalRef(parsed, this.#tagMap);
    const forced = this.#forces.get(key);
    if (forced !== undefined) return forced.value;
    return this.#readParsed(parsed);
  }

  write(ref: string, v: TagValue): void {
    const parsed = parsePlcRef(ref, this.#tagMap);
    const key = canonicalRef(parsed, this.#tagMap);
    // Ghi vào ref đang force → bỏ qua, không báo lỗi (OQ-141).
    if (this.#forces.has(key)) return;
    const type = this.#parsedType(parsed);
    const err = validateTagValue(type, v);
    if (err !== undefined) {
      throw new TagError('TAG-E001', err.message);
    }
    this.#writeParsed(parsed, v);
  }

  force(ref: string, v: TagValue): void {
    const parsed = parsePlcRef(ref, this.#tagMap);
    const key = canonicalRef(parsed, this.#tagMap);
    const type = this.#parsedType(parsed);
    const err = validateTagValue(type, v);
    if (err !== undefined) {
      throw new TagError('TAG-E001', err.message);
    }
    this.#forces.set(key, { value: v, parsed });
  }

  unforce(ref: string): void {
    const parsed = parsePlcRef(ref, this.#tagMap);
    const key = canonicalRef(parsed, this.#tagMap);
    this.#forces.delete(key);
  }

  listForces(): { ref: string; value: TagValue }[] {
    return [...this.#forces.entries()]
      .map(([ref, f]) => ({ ref, value: f.value }))
      .sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  }

  getDiagnostics(): ControllerDiagnostics {
    return {
      state: this.#state,
      scanCount: this.#scanCount,
      lastScanSimMs: this.#lastScanSimMs,
      faults: this.#faults.faults().map((f) => ({
        code: f.code,
        message: f.message,
        count: f.count,
      })),
    };
  }

  // ---------------------------------------------------------- Snapshot

  snapshot(): SoftPlcSnapshot {
    return {
      version: 1,
      state: this.#state,
      scanCount: this.#scanCount,
      lastScanSimMs: this.#lastScanSimMs,
      accMs: this.#accMs,
      lastScanTimeMs: this.#lastScanTimeMs,
      ob100Done: this.#ob100Done,
      cyclic: this.#cyclic.map((c) => ({ ob: c.ob, lastIdx: c.lastIdx })),
      memI: [...this.#mem.i.snapshot()],
      memQ: [...this.#mem.q.snapshot()],
      memM: [...this.#mem.m.snapshot()],
      dbs: [...this.#program.dbs]
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((db) => ({
          name: db.name,
          bytes: [...(this.#mem.dbs.get(db.name.toLowerCase()) as DbStore).snapshot()],
        })),
      forces: this.listForces(),
      faults: this.#faults.snapshot(),
    };
  }

  restore(s: unknown): void {
    if (typeof s !== 'object' || s === null || Array.isArray(s)) {
      throw new Error('softplc: restore nhận snapshot không phải object');
    }
    const snap = s as Partial<SoftPlcSnapshot>;
    if (snap.version !== 1) {
      throw new Error(`softplc: snapshot version không hỗ trợ (nhận ${String(snap.version)})`);
    }
    if (snap.state !== 'STOP' && snap.state !== 'RUN') {
      throw new Error(`softplc: snapshot state không hợp lệ (nhận ${String(snap.state)})`);
    }
    if (
      typeof snap.scanCount !== 'number' ||
      typeof snap.lastScanSimMs !== 'number' ||
      typeof snap.accMs !== 'number' ||
      (typeof snap.lastScanTimeMs !== 'number' && snap.lastScanTimeMs !== null) ||
      typeof snap.ob100Done !== 'boolean'
    ) {
      throw new Error('softplc: snapshot thiếu trường số/boolean (scanCount/lastScanSimMs/accMs/lastScanTimeMs/ob100Done)');
    }
    if (!Array.isArray(snap.memI) || snap.memI.length !== this.#mem.i.sizeBytes) {
      throw new RangeError(
        `softplc: snapshot memI sai độ dài (nhận ${String(Array.isArray(snap.memI) ? snap.memI.length : 'không phải mảng')}, cần ${String(this.#mem.i.sizeBytes)})`,
      );
    }
    if (!Array.isArray(snap.memQ) || snap.memQ.length !== this.#mem.q.sizeBytes) {
      throw new RangeError(
        `softplc: snapshot memQ sai độ dài (nhận ${String(Array.isArray(snap.memQ) ? snap.memQ.length : 'không phải mảng')}, cần ${String(this.#mem.q.sizeBytes)})`,
      );
    }
    if (!Array.isArray(snap.memM) || snap.memM.length !== this.#mem.m.sizeBytes) {
      throw new RangeError(
        `softplc: snapshot memM sai độ dài (nhận ${String(Array.isArray(snap.memM) ? snap.memM.length : 'không phải mảng')}, cần ${String(this.#mem.m.sizeBytes)})`,
      );
    }
    if (!Array.isArray(snap.dbs) || snap.dbs.length !== this.#program.dbs.length) {
      throw new RangeError(
        `softplc: snapshot dbs sai số lượng (nhận ${String(Array.isArray(snap.dbs) ? snap.dbs.length : 'không phải mảng')}, cần ${String(this.#program.dbs.length)})`,
      );
    }
    for (const entry of snap.dbs) {
      const db = this.#program.dbs.find((d) => d.name.toLowerCase() === entry.name.toLowerCase());
      if (db === undefined) {
        throw new Error(`softplc: snapshot chứa DB không tồn tại '${entry.name}'`);
      }
      if (!Array.isArray(entry.bytes) || entry.bytes.length !== db.size) {
        throw new RangeError(
          `softplc: snapshot DB '${entry.name}' sai độ dài (nhận ${String(Array.isArray(entry.bytes) ? entry.bytes.length : 'không phải mảng')}, cần ${String(db.size)})`,
        );
      }
    }
    if (!Array.isArray(snap.cyclic) || snap.cyclic.length !== this.#cyclic.length) {
      throw new RangeError(
        `softplc: snapshot cyclic sai số lượng (nhận ${String(Array.isArray(snap.cyclic) ? snap.cyclic.length : 'không phải mảng')}, cần ${String(this.#cyclic.length)})`,
      );
    }
    for (const entry of snap.cyclic) {
      const cyc = this.#cyclic.find((c) => c.ob === entry.ob);
      if (cyc === undefined || typeof entry.lastIdx !== 'number') {
        throw new Error(`softplc: snapshot cyclic chứa OB không tồn tại '${String(entry.ob)}'`);
      }
    }
    if (!Array.isArray(snap.forces)) {
      throw new Error('softplc: snapshot forces phải là mảng');
    }
    const forces = new Map<string, StoredForce>();
    for (const f of snap.forces) {
      if (typeof f.ref !== 'string') {
        throw new Error('softplc: snapshot force thiếu ref');
      }
      const parsed = parsePlcRef(f.ref, this.#tagMap);
      const key = canonicalRef(parsed, this.#tagMap);
      const err = validateTagValue(this.#parsedType(parsed), f.value);
      if (err !== undefined) {
        throw new TagError('TAG-E001', err.message);
      }
      forces.set(key, { value: f.value, parsed });
    }
    if (!Array.isArray(snap.faults)) {
      throw new Error('softplc: snapshot faults phải là mảng');
    }
    for (const f of snap.faults) {
      if (
        typeof f.code !== 'string' ||
        !FAULT_CODES.has(f.code) ||
        typeof f.message !== 'string' ||
        typeof f.count !== 'number' ||
        typeof f.simTimeMs !== 'number'
      ) {
        throw new Error(`softplc: snapshot fault sai hình (code '${f.code}')`);
      }
    }
    // Áp dụng (chỉ sau khi mọi kiểm tra pass).
    this.#state = snap.state;
    this.#scanCount = snap.scanCount;
    this.#lastScanSimMs = snap.lastScanSimMs;
    this.#accMs = snap.accMs;
    this.#lastScanTimeMs = snap.lastScanTimeMs;
    this.#ob100Done = snap.ob100Done;
    for (const entry of snap.cyclic) {
      const cyc = this.#cyclic.find((c) => c.ob === entry.ob) as CyclicOb;
      cyc.lastIdx = entry.lastIdx;
    }
    this.#mem.i.restore(Uint8Array.from(snap.memI));
    this.#mem.q.restore(Uint8Array.from(snap.memQ));
    this.#mem.m.restore(Uint8Array.from(snap.memM));
    for (const entry of snap.dbs) {
      const store = this.#mem.dbs.get(entry.name.toLowerCase()) as DbStore;
      store.restore(Uint8Array.from(entry.bytes));
    }
    this.#forces = forces;
    this.#faults.restore(snap.faults);
  }

  // ---------------------------------------------------------- Nội bộ

  /** Dựng bộ nhớ + interpreter + binding OB từ program + tagMap; reset trạng thái lập lịch. */
  #setupProgram(program: IrProgram, tagMap: TagAddressMap): void {
    const sortedDbs = [...program.dbs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const dbNumbers = new Map<string, number>();
    const dbNumberSet = new Set<number>();
    const dbs = new Map<string, DbStore>();
    sortedDbs.forEach((db, idx) => {
      const number = idx + 1;
      dbNumbers.set(db.name.toLowerCase(), number);
      dbNumberSet.add(number);
      const store = new DbStore(number, db.size);
      initDbStore(store, db.fields, 0);
      dbs.set(db.name.toLowerCase(), store);
    });
    const measured = measureProgram(program);
    for (const n of measured.absDbNumbers) {
      if (!dbNumberSet.has(n)) {
        throw new RangeError(`softplc: chương trình tham chiếu DB số ${String(n)} không tồn tại (chỉ có ${String(sortedDbs.length)} DB)`);
      }
    }
    for (const name of measured.dbFieldNames) {
      if (!dbNumbers.has(name.toLowerCase())) {
        throw new RangeError(`softplc: chương trình tham chiếu DB '${name}' không tồn tại`);
      }
    }
    let sizeI = measured.i;
    let sizeQ = measured.q;
    let sizeM = measured.m;
    for (const addr of tagMap.values()) {
      if (addr.area === 'DB') {
        if (addr.db === undefined || !dbNumberSet.has(addr.db)) {
          throw new RangeError(`softplc: tag trỏ tới DB số ${String(addr.db)} không tồn tại`);
        }
        continue;
      }
      const end = addr.byte + (addr.bit !== undefined ? 1 : sizeOrThrow(addr.type));
      if (addr.area === 'I') sizeI = Math.max(sizeI, end);
      else if (addr.area === 'Q') sizeQ = Math.max(sizeQ, end);
      else sizeM = Math.max(sizeM, end);
    }
    const mem: PlcMemory = {
      i: new MemoryArea(sizeI),
      q: new MemoryArea(sizeQ),
      m: new MemoryArea(sizeM),
      dbs,
      dbNumbers,
    };
    this.#mem = mem;
    this.#program = program;
    this.#tagMap = tagMap;
    this.#interpreter = new Interpreter(program, mem, this.#faults, {
      maxCallDepth: this.#maxCallDepth,
      maxLoopIterations: this.#maxLoopIterations,
      sysCalls: this.#sysCalls,
    });
    this.#bindObs(program);
    this.#faults.clear();
    this.#forces.clear();
    this.#scanCount = 0;
    this.#lastScanSimMs = 0;
    this.#accMs = 0;
    this.#lastScanTimeMs = null;
    this.#ob100Done = false;
  }

  #bindObs(program: IrProgram): void {
    this.#ob1 = undefined;
    this.#ob100 = undefined;
    this.#cyclic = [];
    for (const b of program.organization) {
      const block = program.blocks.find((x) => x.name.toLowerCase() === b.block.toLowerCase());
      if (block === undefined) {
        throw new Error(`softplc: organization trỏ tới block không tồn tại '${b.block}'`);
      }
      if (b.ob === 1) {
        this.#ob1 = block;
      } else if (b.ob === 100) {
        this.#ob100 = block;
      } else {
        // cycleMs không có → 100 ms (chuẩn Siemens cho OB ngắt chu kỳ).
        this.#cyclic.push({
          ob: b.ob,
          block,
          periodMs: b.cycleMs ?? 100,
          phaseMs: b.phaseMs ?? 0,
          lastIdx: 0,
        });
      }
    }
    this.#cyclic.sort((a, b) => a.ob - b.ob);
  }

  #faultTotal(): number {
    let total = 0;
    for (const f of this.#faults.faults()) total += f.count;
    return total;
  }

  /** Áp force I/Q (dạng abs) vào bộ nhớ trong scan; force M/DB chỉ là lớp phủ ở read/write. */
  #applyForcesToMem(area: 'I' | 'Q'): void {
    for (const f of this.#forces.values()) {
      const parsed = f.parsed;
      if (parsed.k === 'abs' && parsed.area === area) {
        this.#writeMemArea(parsed.area, parsed.byte, parsed.bit, parsed.type, f.value);
        continue;
      }
      if (parsed.k === 'tag') {
        const addr = this.#tagMap.get(parsed.name);
        if (addr !== undefined && addr.area === area) {
          this.#writeMemByAddr(addr, f.value);
        }
      }
    }
  }

  #writeMemArea(area: 'I' | 'Q' | 'M', byte: number, bit: number | undefined, type: PrimitiveType, v: TagValue): void {
    const memArea = area === 'I' ? this.#mem.i : area === 'Q' ? this.#mem.q : this.#mem.m;
    if (bit !== undefined) {
      if (typeof v !== 'boolean') {
        throw new TagError('TAG-E001', `ghi Bool: nhận ${typeof v}`);
      }
      memArea.setBit(byte, bit, v);
      return;
    }
    memArea.write(type as MemoryScalarType, byte, v);
  }

  #readMemArea(area: 'I' | 'Q' | 'M', byte: number, bit: number | undefined, type: PrimitiveType): TagValue {
    const memArea = area === 'I' ? this.#mem.i : area === 'Q' ? this.#mem.q : this.#mem.m;
    if (bit !== undefined) return memArea.getBit(byte, bit);
    return memArea.read(type as MemoryScalarType, byte);
  }

  #writeMemByAddr(addr: TagAddr, v: TagValue): void {
    if (addr.area === 'DB') {
      const store = this.#dbByNumber(addr.db as number);
      if (addr.bit !== undefined) {
        if (typeof v !== 'boolean') {
          throw new TagError('TAG-E001', `ghi Bool: nhận ${typeof v}`);
        }
        store.setBit(addr.byte, addr.bit, v);
        return;
      }
      store.write(addr.type as MemoryScalarType, addr.byte, v);
      return;
    }
    this.#writeMemArea(addr.area, addr.byte, addr.bit, addr.type, v);
  }

  #readMemByAddr(addr: TagAddr): TagValue {
    if (addr.area === 'DB') {
      const store = this.#dbByNumber(addr.db as number);
      if (addr.bit !== undefined) return store.getBit(addr.byte, addr.bit);
      return store.read(addr.type as MemoryScalarType, addr.byte);
    }
    return this.#readMemArea(addr.area, addr.byte, addr.bit, addr.type);
  }

  #dbByNumber(n: number): DbStore {
    for (const [name, number] of this.#mem.dbNumbers) {
      if (number === n) {
        const store = this.#mem.dbs.get(name) as DbStore;
        return store;
      }
    }
    throw new RangeError(`softplc: không tìm thấy DB số ${String(n)}`);
  }

  /** Kiểu để validate `write`/`force` (bit → Bool; dbField → kiểu field lá). */
  #parsedType(parsed: ParsedRef): PrimitiveType {
    switch (parsed.k) {
      case 'tag': {
        const addr = this.#tagMap.get(parsed.name);
        if (addr === undefined) {
          throw new RangeError(`softplc: không tìm thấy tag '${parsed.name}'`);
        }
        return addr.bit !== undefined ? 'Bool' : addr.type;
      }
      case 'abs':
        return parsed.bit !== undefined ? 'Bool' : parsed.type;
      case 'absDb':
        return parsed.bit !== undefined ? 'Bool' : parsed.type;
      case 'dbField': {
        const db = this.#program.dbs.find((d) => d.name.toLowerCase() === parsed.db.toLowerCase());
        if (db === undefined) {
          throw new RangeError(`softplc: không tìm thấy DB '${parsed.db}'`);
        }
        const store = this.#mem.dbs.get(parsed.db.toLowerCase()) as DbStore;
        const { field } = resolveDbFieldPath(db, store, parsed.path);
        if (typeof field.type !== 'string') {
          throw new Error(`softplc: đọc/ghi struct/mảng qua '${parsed.db}.${parsed.path.join('.')}' không hỗ trợ`);
        }
        return field.type;
      }
    }
  }

  #readParsed(parsed: ParsedRef): TagValue {
    switch (parsed.k) {
      case 'tag': {
        const addr = this.#tagMap.get(parsed.name);
        if (addr === undefined) {
          throw new RangeError(`softplc: không tìm thấy tag '${parsed.name}'`);
        }
        return this.#readMemByAddr(addr);
      }
      case 'abs':
        return this.#readMemArea(parsed.area, parsed.byte, parsed.bit, parsed.type);
      case 'absDb': {
        const store = this.#dbByNumber(parsed.db);
        if (parsed.bit !== undefined) return store.getBit(parsed.byte, parsed.bit);
        return store.read(parsed.type as MemoryScalarType, parsed.byte);
      }
      case 'dbField': {
        const db = this.#program.dbs.find((d) => d.name.toLowerCase() === parsed.db.toLowerCase());
        if (db === undefined) {
          throw new RangeError(`softplc: không tìm thấy DB '${parsed.db}'`);
        }
        const store = this.#mem.dbs.get(parsed.db.toLowerCase()) as DbStore;
        const { offset, field } = resolveDbFieldPath(db, store, parsed.path);
        if (typeof field.type !== 'string') {
          throw new Error(`softplc: đọc struct/mảng qua '${parsed.db}.${parsed.path.join('.')}' không hỗ trợ`);
        }
        return readMemValue(store, offset, field);
      }
    }
  }

  #writeParsed(parsed: ParsedRef, v: TagValue): void {
    switch (parsed.k) {
      case 'tag': {
        const addr = this.#tagMap.get(parsed.name);
        if (addr === undefined) {
          throw new RangeError(`softplc: không tìm thấy tag '${parsed.name}'`);
        }
        this.#writeMemByAddr(addr, v);
        return;
      }
      case 'abs':
        this.#writeMemArea(parsed.area, parsed.byte, parsed.bit, parsed.type, v);
        return;
      case 'absDb': {
        const store = this.#dbByNumber(parsed.db);
        if (parsed.bit !== undefined) {
          if (typeof v !== 'boolean') {
            throw new TagError('TAG-E001', `ghi Bool: nhận ${typeof v}`);
          }
          store.setBit(parsed.byte, parsed.bit, v);
          return;
        }
        store.write(parsed.type as MemoryScalarType, parsed.byte, v);
        return;
      }
      case 'dbField': {
        const db = this.#program.dbs.find((d) => d.name.toLowerCase() === parsed.db.toLowerCase());
        if (db === undefined) {
          throw new RangeError(`softplc: không tìm thấy DB '${parsed.db}'`);
        }
        const store = this.#mem.dbs.get(parsed.db.toLowerCase()) as DbStore;
        const { offset, field } = resolveDbFieldPath(db, store, parsed.path);
        if (typeof field.type !== 'string') {
          throw new Error(`softplc: ghi struct/mảng qua '${parsed.db}.${parsed.path.join('.')}' không hỗ trợ`);
        }
        writeMemValue(store, offset, field, v);
        return;
      }
    }
  }
}
