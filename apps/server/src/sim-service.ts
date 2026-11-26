// SimulationService — @vcs/server (M0 §8.2).
// Sở hữu SimulationBundle + vòng chạy. Mỗi lát hỏi Pacer.plan() rồi chạy
// stepOnce() đúng số bước trong ngân sách sliceBudgetMs, rồi nhường event
// loop (setImmediate khi 'max'/tụt, setTimeout khi đủ nhanh). Lệnh xếp hàng
// và áp dụng giữa các lát (không chen vào giữa bước). tag.write: checkWrite
// rồi post() (hiệu lực đầu bước kế; tạm dừng thì applyInbox + flush để UI
// thấy ngay, D4). Lỗi trong lát → pause + diagnostics (OQ-052).
// Thời gian thật (Date.now) chỉ ở apps/* — được phép (B10); Pacer nhận
// now() tiêm vào để test dùng đồng hồ giả.

import {
  diag,
  PRJ_CATALOG,
  type DataType,
  type Diagnostic,
  type FaultInfo,
  type FaultRequest,
  type FaultTiming,
  type SimState,
  type TagDef,
  type TagValue,
} from '@vcs/schemas';
import { Pacer, TraceHasher, isIntrospectable, type SimulationBundle, type TagHandle } from '@vcs/kernel';
import type { ControllerAdapter, ControllerIntrospection } from '@vcs/kernel';
import { defaultRegistry, type PlantEngine } from '@vcs/plant';
import { startPlcControllers } from './plc.js';

export type ServiceState = 'IDLE' | 'RUNNING' | 'PAUSED';

export interface ServiceResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export interface SnapshotDef {
  name: string;
  type: DataType;
  area: 'I' | 'Q' | 'M' | 'DB';
  address: string;
  controller: string;
  description?: string;
  owner: 'plant' | 'controller' | 'free';
  writable: boolean;
}

export interface TagsSnapshot {
  defs: SnapshotDef[];
  values: TagValue[];
  simTimeMs: number;
}

/** Một thiết bị plant trong `GET /api/plant` (P2.4, OQ-318). */
export interface PlantEquipmentSnapshot {
  id: string;
  model: string;
  controller?: string;
  /** Lỗi đã inject (listFaults, lọc theo thiết bị). */
  faults: FaultInfo[];
  /** Snapshot observables qua getObservable (key → giá trị). */
  observables: Record<string, number | boolean | string>;
  /** Lỗi thiết bị model khai báo — panel dùng để Inject. */
  faultDefs: Array<{ id: string; description: string }>;
  /** Preset lỗi của model — panel dùng để áp nhanh (vd noRunFeedback). */
  presets: Array<{ name: string; description: string }>;
}

export interface PlantSnapshotData {
  equipment: PlantEquipmentSnapshot[];
}

export interface SimulationServiceOptions {
  /** Đồng hồ wall (mặc định Date.now); test tiêm đồng hồ giả. */
  now?: () => number;
  /** Ngân sách wall một lát, ms (mặc định 8). */
  sliceBudgetMs?: number;
  onState?: (s: SimState) => void;
  onDiagnostic?: (d: Diagnostic) => void;
  onReset?: () => void;
}

const DIAG_CODE_RE = /^([A-Z]{2,4}-[EW]\d{3})/;

/** Nguồn được phép ghi theo owner (M0 §6.2 quy tắc 6). */
const ALLOWED_SOURCES_TEXT: Record<'plant' | 'controller' | 'free', string> = {
  plant: 'plant, system',
  controller: 'plc, system',
  free: 'test, hmi, gateway, system',
};

/** Giá trị mặc định khi TagDef không có initial — cùng quy tắc TagDB. */
function defaultInitial(type: DataType): TagValue {
  if (type === 'Bool') return false;
  if (type === 'String') return '';
  return 0;
}

export class SimulationService {
  readonly #bundle: SimulationBundle;
  readonly #pacer: Pacer;
  readonly #now: () => number;
  readonly #sliceBudgetMs: number;
  readonly #onState: ((s: SimState) => void) | undefined;
  readonly #onDiagnostic: ((d: Diagnostic) => void) | undefined;
  readonly #onReset: (() => void) | undefined;
  readonly #defs: SnapshotDef[];
  readonly #catalogDefs: readonly TagDef[];
  readonly #handleToDefIndex = new Map<TagHandle, number>();
  readonly #nameToDefIndex = new Map<string, number>();
  readonly #delta = new Map<TagHandle, TagValue>();
  readonly #queue: Array<() => void> = [];
  readonly #unsubscribers: Array<() => void> = [];
  /** P2.4 (OQ-318): băm luồng TagChange cho `GET /api/sim/hash` — 1 hasher
   * cho cả đời server (như CLI `plant run` dùng 1 hasher cho 1 lần chạy);
   * reset() đặt lại về rỗng để hash sau reset khớp hash CLI chạy mới. */
  readonly #hasher: TraceHasher;
  #state: ServiceState = 'IDLE';
  #timeScale: number | 'max' = 1;
  #lagging = false;
  #achievedScale = 0;
  #timer:
    | { kind: 'timeout'; ref: ReturnType<typeof setTimeout> }
    | { kind: 'immediate'; ref: ReturnType<typeof setImmediate> }
    | undefined;
  #inSlice = false;
  #stopped = false;

  constructor(bundle: SimulationBundle, opts?: SimulationServiceOptions) {
    this.#bundle = bundle;
    this.#now = opts?.now ?? Date.now;
    this.#sliceBudgetMs = opts?.sliceBudgetMs ?? 8;
    this.#onState = opts?.onState;
    this.#onDiagnostic = opts?.onDiagnostic;
    this.#onReset = opts?.onReset;
    this.#pacer = new Pacer(this.#now, {
      timeScale: 1,
      sliceBudgetMs: this.#sliceBudgetMs,
    });
    // defs: mọi tag trong catalog, thứ tự khai báo (OQ-033/034). Tag I/Q có
    // handle TagDB (chỉ số handle trùng chỉ số defs với hello-tags, nhưng
    // không giả định — map tường minh qua #handleToDefIndex).
    const catalog = bundle.project.catalog.all();
    this.#catalogDefs = catalog;
    this.#defs = catalog.map((def, i) => {
      const h = bundle.tags.handle(def.name);
      let owner: SnapshotDef['owner'];
      if (h !== undefined) {
        owner = bundle.tags.owner(h);
        this.#handleToDefIndex.set(h, i);
      } else {
        // M/DB không có handle: owner 'controller', không ghi được (OQ-033).
        owner = 'controller';
      }
      this.#nameToDefIndex.set(def.name, i);
      const d: SnapshotDef = {
        name: def.name,
        type: def.type,
        area: def.area,
        address: def.address,
        controller: def.controller,
        owner,
        // UI chỉ ghi được tag free qua 'hmi' (checkWrite).
        writable: owner === 'free',
      };
      if (def.description !== undefined) d.description = def.description;
      return d;
    });
    // Một subscriber '*' duy nhất gom thay đổi vào bộ đệm last-write-wins
    // theo handle (M0 §8.2); hub phát theo nhịp 10 Hz.
    this.#unsubscribers.push(
      bundle.tags.subscribe('*', (batch) => {
        for (const c of batch) this.#delta.set(c.handle, c.newValue);
      }),
    );
    this.#hasher = new TraceHasher(bundle.tags);
    this.#unsubscribers.push(() => {
      this.#hasher.dispose();
    });
    this.#unsubscribers.push(
      bundle.sim.on('diagnostic', (d) => {
        this.#onDiagnostic?.(d);
      }),
    );
  }

  get state(): ServiceState {
    return this.#state;
  }

  get timeScale(): number | 'max' {
    return this.#timeScale;
  }

  get lagging(): boolean {
    return this.#lagging;
  }

  get achievedScale(): number {
    return this.#achievedScale;
  }

  get simTimeMs(): number {
    return this.#bundle.sim.simTimeMs;
  }

  get stepCount(): number {
    return this.#bundle.sim.stepCount;
  }

  /** sha256 hex của luồng TagChange từ lần reset/khởi động gần nhất. */
  simHash(): string {
    return this.#hasher.hash();
  }

  /** Diagnostics của project (loadProject) — gửi sau welcome (OQ-053). */
  get projectDiagnostics(): readonly Diagnostic[] {
    return this.#bundle.project.diagnostics;
  }

  /** Thông tin project cho `welcome` (M0 §9.2). */
  snapshotProject(): { name: string; language: 'vi' | 'en'; stepMs: number } {
    const c = this.#bundle.project.config;
    return { name: c.name, language: c.language, stepMs: c.simulation.stepMs };
  }

  simState(): SimState {
    const base: SimState = {
      state: this.#state,
      simTimeMs: this.#bundle.sim.simTimeMs,
      stepCount: this.#bundle.sim.stepCount,
      timeScale: this.#timeScale,
      lagging: this.#lagging,
      achievedScale: this.#achievedScale,
    };
    // P1.7 (OQ-207): thống kê PLC khi có controller introspectable.
    const plc = this.plc();
    if (plc !== undefined) {
      const d = plc.getDiagnostics();
      base.plc = {
        scanCount: d.scanCount,
        faultCount: d.faults.reduce((n, f) => n + f.count, 0),
      };
    }
    return base;
  }

  /**
   * Controller PLC introspectable đầu tiên (OQ-206/207) — undefined khi
   * project không có plc/ (không có controller `builtin:siemens`).
   */
  plc(): (ControllerAdapter & ControllerIntrospection) | undefined {
    for (const c of this.#bundle.controllers) {
      if (isIntrospectable(c)) return c;
    }
    return undefined;
  }

  /**
   * PlantEngine của project (P2.4, OQ-318) — undefined khi project không
   * có plant/ (plantExtension no-op). Cùng cách CLI `plant run` lấy engine
   * (`sim.getComponent('plant')`).
   */
  plant(): PlantEngine | undefined {
    return this.#bundle.sim.getComponent('plant') as PlantEngine | undefined;
  }

  /**
   * Snapshot plant cho `GET /api/plant` (P2.4, OQ-318): danh sách equipment
   * (từ project.plant) + lỗi đã inject (`listFaults()`) + snapshot
   * observables (`getObservable`) + fault/preset model khai báo (panel
   * dùng để Inject/áp preset). undefined khi project không có plant.
   */
  plantSnapshot(): PlantSnapshotData | undefined {
    const engine = this.plant();
    const instances = this.#bundle.project.plant;
    if (engine === undefined || instances === undefined) return undefined;
    const allFaults = engine.listFaults();
    return {
      equipment: instances.map((inst) => {
        const model = defaultRegistry.get(inst.model);
        const observables: Record<string, number | boolean | string> = {};
        if (model !== undefined) {
          for (const obs of model.observables) {
            const v = engine.getObservable(inst.id, obs.key);
            if (v !== undefined) observables[obs.key] = v;
          }
        }
        const out: PlantEquipmentSnapshot = {
          id: inst.id,
          model: inst.model,
          faults: allFaults.filter((f) => f.target.equipment === inst.id),
          observables,
          faultDefs: (model?.faults ?? []).map((f) => ({ id: f.id, description: f.description })),
          presets: Object.entries(model?.presets ?? {}).map(([name, p]) => ({
            name,
            description: p.description,
          })),
        };
        if (inst.controller !== undefined) out.controller = inst.controller;
        return out;
      }),
    };
  }

  /** Chèn lỗi plant qua WS `plant.fault.inject` (OQ-318): lỗi → mã PL. */
  plantFaultInject(req: FaultRequest): ServiceResult {
    const engine = this.plant();
    if (engine === undefined) {
      return {
        ok: false,
        code: 'PL-E001',
        message: 'plant.fault.inject: project không có plant',
      };
    }
    try {
      engine.injectFault(req);
      return { ok: true };
    } catch (err) {
      return { ok: false, code: plCodeOf(err), message: messageOf(err) };
    }
  }

  /** Clear tay lỗi plant qua WS `plant.fault.clear` (OQ-318). */
  plantFaultClear(id: string): ServiceResult {
    const engine = this.plant();
    if (engine === undefined) {
      return {
        ok: false,
        code: 'PL-E001',
        message: 'plant.fault.clear: project không có plant',
      };
    }
    // atMs tường minh = simTime orchestrator (T): clearFault không atMs lấy
    // #simTimeMs của engine (= T−dt trước bước T) → clearedAtMs lệch 1 bước
    // so với runner (scenario.ts truyền atMs=T tường minh) — OVL_OK hồi sớm
    // 1 bước, expects T=2990 sai (P2.4 commit 11, e2e A).
    if (!engine.clearFault(id, this.simTimeMs)) {
      return {
        ok: false,
        code: 'PL-E001',
        message: `plant.fault.clear: lỗi '${id}' không tồn tại hoặc đã clear`,
      };
    }
    return { ok: true };
  }

  /**
   * Áp preset lỗi qua WS `plant.fault.preset` (OQ-318, tier B — kịch bản B
   * chỉ lái tay được qua preset `noRunFeedback`). `when` mặc định
   * {at:'now'} (panel truyền {at:'time', timeMs: simTimeMs} như inject).
   */
  plantFaultPreset(equipment: string, preset: string, when?: FaultTiming): ServiceResult {
    const engine = this.plant();
    if (engine === undefined) {
      return {
        ok: false,
        code: 'PL-E001',
        message: 'plant.fault.preset: project không có plant',
      };
    }
    try {
      engine.applyPreset(equipment, preset, when);
      return { ok: true };
    } catch (err) {
      return { ok: false, code: plCodeOf(err), message: messageOf(err) };
    }
  }
  snapshot(): TagsSnapshot {
    const values: TagValue[] = this.#defs.map((d, i) => {
      const def = this.#catalogDefs[i] as TagDef;
      const h = this.#bundle.tags.handle(d.name);
      if (h !== undefined) return this.#bundle.tags.get(h);
      return def.initial !== undefined ? def.initial : defaultInitial(def.type);
    });
    return { defs: this.#defs, values, simTimeMs: this.#bundle.sim.simTimeMs };
  }

  /**
   * Lấy và xóa bộ đệm delta: [chỉ số defs, giá trị], xếp theo chỉ số tăng
   * dần. Trả [] khi không có thay đổi (OQ-048: không gửi delta rỗng).
   */
  drainDelta(): Array<readonly [number, TagValue]> {
    if (this.#delta.size === 0) return [];
    const out: Array<readonly [number, TagValue]> = [];
    for (const [h, v] of this.#delta) {
      const idx = this.#handleToDefIndex.get(h);
      if (idx !== undefined) out.push([idx, v]);
    }
    out.sort((a, b) => a[0] - b[0]);
    this.#delta.clear();
    return out;
  }

  /**
   * Chỉ số defs cho một subscription (OQ-034/049): '*' → mọi defs; mảng
   * tên → chỉ số theo thứ tự catalog, tên lạ bị bỏ qua (không báo lỗi).
   */
  subscribeDefs(names: '*' | readonly string[]): number[] {
    if (names === '*') return this.#defs.map((_, i) => i);
    const wanted = new Set(names);
    const out: number[] = [];
    for (const [name, i] of this.#nameToDefIndex) {
      if (wanted.has(name)) out.push(i);
    }
    out.sort((a, b) => a - b);
    return out;
  }

  /** Xếp lệnh, áp dụng ngay nếu không ở giữa lát, nếu không chờ hết lát. */
  enqueueCommand(fn: () => void): void {
    if (this.#inSlice) {
      this.#queue.push(fn);
      return;
    }
    fn();
  }

  /** Chạy một lát đồng bộ (public để test điều khiển; vòng tự động gọi nó). */
  runSlice(): void {
    if (this.#state !== 'RUNNING') return;
    this.#inSlice = true;
    try {
      const stepMs = this.#bundle.project.config.simulation.stepMs;
      const plan = this.#pacer.plan(this.#bundle.sim.simTimeMs, stepMs);
      this.#setLagging(plan.lagging);
      if (plan.steps === Number.POSITIVE_INFINITY) {
        // 'max': chạy tới khi hết ngân sách lát. Ngân sách đo bằng wall
        // clock THẬT (Date.now), không phải now() đã tiêm cho Pacer —
        // now() giả trong test có thể đứng yên và gây lặp vô hạn.
        const started = Date.now();
        while (Date.now() - started < this.#sliceBudgetMs) {
          this.#bundle.sim.stepOnce();
        }
      } else if (plan.steps > 0) {
        this.#bundle.sim.runSteps(plan.steps);
      }
      // achievedScale trong sim.state tính SAU lát (S1 ghi chú): hỏi lại
      // plan() với sim time mới (due ≈ 0 nên không đặt lại mốc). Chỉ lấy
      // achievedScale ở lần hỏi này — lagging lấy từ lần plan đầu (lần
      // hỏi lại sau khi đặt lại mốc luôn trả lagging=false).
      const after = this.#pacer.plan(this.#bundle.sim.simTimeMs, stepMs);
      this.#achievedScale = after.achievedScale;
    } catch (err) {
      this.#handleSliceError(err);
    } finally {
      this.#inSlice = false;
      this.#drainQueue();
    }
  }

  run(): void {
    if (this.#state === 'RUNNING') return; // no-op (OQ-040)
    this.#state = 'RUNNING';
    // P1.7: PLC nạp ở STOP — start trước khi chạy (no-op nếu đã RUN).
    startPlcControllers(this.#bundle);
    this.#pacer.start(this.#bundle.sim.simTimeMs);
    this.#emitState();
    this.#schedule();
  }

  pause(): void {
    if (this.#state !== 'RUNNING') return; // no-op (OQ-040)
    this.#state = 'PAUSED';
    this.#pacer.pause();
    this.#clearTimer();
    this.#emitState();
  }

  /** step(n) khi RUNNING → WS-E002 (OQ-040); khi dừng thì chạy ngay. */
  step(n = 1): ServiceResult {
    if (this.#state === 'RUNNING') {
      return {
        ok: false,
        code: 'WS-E002',
        message: 'step bị bỏ qua khi đang RUNNING — pause trước khi step, hoặc dùng run.',
      };
    }
    if (!Number.isInteger(n) || n < 1) {
      return {
        ok: false,
        code: 'WS-E003',
        message: `step: steps phải là số nguyên ≥ 1, nhận '${String(n)}'`,
      };
    }
    try {
      // P1.7: step khi dừng cũng phải scan PLC (start trước, no-op nếu đã RUN).
      startPlcControllers(this.#bundle);
      this.#bundle.sim.runSteps(n);
    } catch (err) {
      this.#handleSliceError(err);
      return {
        ok: false,
        code: codeOf(err),
        message: err instanceof Error ? err.message : String(err),
      };
    }
    return { ok: true };
  }

  /** reset được gọi ở mọi trạng thái (OQ-040): dừng vòng chạy rồi reset. */
  reset(): void {
    this.#clearTimer();
    this.#pacer.pause();
    this.#bundle.sim.resetAll();
    // P2.4: resetAll() flush thay đổi restore vào luồng băm — đặt hasher
    // lại SAU resetAll để hash sau reset khớp hash CLI chạy mới từ T=0.
    this.#hasher.reset();
    this.#state = 'IDLE';
    this.#lagging = false;
    this.#achievedScale = 0;
    this.#delta.clear();
    this.#emitState();
    this.#onReset?.();
  }

  setTimeScale(x: number | 'max'): ServiceResult {
    if (x !== 'max' && !(typeof x === 'number' && Number.isFinite(x) && x > 0)) {
      return {
        ok: false,
        code: 'WS-E003',
        message: `timeScale phải là số > 0 hoặc 'max', nhận '${String(x)}'`,
      };
    }
    this.#timeScale = x;
    this.#pacer.setTimeScale(x);
    this.#emitState();
    return { ok: true };
  }

  /**
   * Ghi tag từ UI (M0 §8.2): checkWrite(h, 'hmi') → ok thì post() (hiệu
   * lực đầu bước kế; tạm dừng thì applyInbox + flush để UI thấy ngay, D4);
   * denied → TAG-E002; tên không tồn tại hoặc M/DB → TAG-E003 (OQ-033).
   * Lỗi kiểu/khoảng (TAG-E001) phát sinh trong drain → diagnostic SIM-E001
   * theo OQ-021 (validateTagValue đầy đủ chờ P0.8).
   */
  tagWrite(name: string, value: TagValue): ServiceResult {
    const def = this.#bundle.project.catalog.get(name);
    if (def === undefined || (def.area !== 'I' && def.area !== 'Q')) {
      return {
        ok: false,
        code: 'TAG-E003',
        message: `tag '${name}' không tồn tại trong TagDB`,
      };
    }
    const h = this.#bundle.tags.handle(name);
    if (h === undefined) {
      return { ok: false, code: 'TAG-E003', message: `tag '${name}' không tồn tại` };
    }
    if (this.#bundle.tags.checkWrite(h, 'hmi') === 'denied') {
      const owner = this.#bundle.tags.owner(h);
      return {
        ok: false,
        code: 'TAG-E002',
        message:
          `tag '${name}' thuộc owner '${owner}', nguồn 'hmi' không được ghi ` +
          `(cho phép: ${ALLOWED_SOURCES_TEXT[owner]})`,
      };
    }
    this.#bundle.sim.post({
      label: `tag.write ${name}`,
      run: () => {
        this.#bundle.tags.write(h, value, 'hmi');
      },
    });
    if (this.#state !== 'RUNNING') {
      this.#bundle.sim.applyInbox();
      this.#bundle.tags.flush();
    }
    return { ok: true };
  }

  /** Dừng vòng chạy + hủy subscriber; idempotent. */
  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#clearTimer();
    this.#pacer.pause();
    for (const unsub of this.#unsubscribers) unsub();
    this.#unsubscribers.length = 0;
  }

  #schedule(): void {
    if (this.#state !== 'RUNNING' || this.#stopped) return;
    this.#clearTimer();
    const ts = this.#timeScale;
    if (ts === 'max' || this.#lagging) {
      const ref = setImmediate(() => {
        this.#timer = undefined;
        this.#loop();
      });
      this.#timer = { kind: 'immediate', ref };
    } else {
      const stepMs = this.#bundle.project.config.simulation.stepMs;
      const waitMs = Math.max(1, Math.round(stepMs / ts));
      const ref = setTimeout(() => {
        this.#timer = undefined;
        this.#loop();
      }, waitMs);
      this.#timer = { kind: 'timeout', ref };
    }
  }

  #loop(): void {
    if (this.#state !== 'RUNNING' || this.#stopped) return;
    this.runSlice();
    this.#schedule();
  }

  #drainQueue(): void {
    while (this.#queue.length > 0) {
      const fn = this.#queue.shift() as () => void;
      fn();
    }
  }

  #clearTimer(): void {
    if (this.#timer === undefined) return;
    if (this.#timer.kind === 'timeout') clearTimeout(this.#timer.ref);
    else clearImmediate(this.#timer.ref);
    this.#timer = undefined;
  }

  #setLagging(v: boolean): void {
    if (this.#lagging === v) return;
    this.#lagging = v;
    this.#emitState();
  }

  #emitState(): void {
    this.#onState?.(this.simState());
  }

  /**
   * Lỗi trong lát (VD SIM-E002): dừng vòng chạy → PAUSED, phát diagnostics
   * + sim.state, server vẫn chạy, client reset/run lại được (OQ-052).
   */
  #handleSliceError(err: unknown): void {
    const code = codeOf(err);
    const message = err instanceof Error ? err.message : String(err);
    this.#clearTimer();
    this.#pacer.pause();
    if (this.#state === 'RUNNING') this.#state = 'PAUSED';
    const d = diag(code, 'error', message, undefined, PRJ_CATALOG.get(code)?.hint);
    this.#onDiagnostic?.(d);
    this.#emitState();
  }
}

function codeOf(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const m = DIAG_CODE_RE.exec(message);
  return m?.[1] ?? 'SIM-E001';
}

/** Mã PL trong message lỗi engine (vd `(PL-E001)`) — codeOf chỉ bắt mã ở đầu message. */
function plCodeOf(err: unknown): string {
  const message = messageOf(err);
  const m = /PL-[EW]\d{3}/.exec(message);
  return m?.[0] ?? 'SIM-E001';
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
