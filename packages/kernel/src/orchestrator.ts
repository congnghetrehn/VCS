// SimulationOrchestrator — @vcs/kernel (M0 §6.7).
// Một bước cố định (AGENTS §4): beforeExternals → drain post() → pha plant →
// controllers → gateways → tags.flush() → afterStep → clock.advance(dt).
// Không timer/đồng hồ thật ở đây; mọi thời gian từ SimClock. Lỗi component:
// policy 'throw' lan truyền SimComponentError, 'isolate' đánh dấu faulted và
// phát diagnostic SIM-E001 (OQ-021…OQ-024, OQ-029).

import { diag, PRJ_CATALOG } from '@vcs/schemas';
import type { Diagnostic, Unsub } from '@vcs/schemas';
import type { SimClock } from './clock.js';
import type { ControllerAdapter, Phase, SimComponent, StepResult } from './component.js';
import { SimComponentError } from './errors.js';
import type { IoBus } from './iobus.js';
import type { TagDB, TagDBSnapshot } from './tags.js';

export type { Phase } from './component.js';

export interface StepHooks {
  beforeExternals?(T: number): void;
  afterStep?(T: number): void;
}

export interface ExternalCommand {
  label: string;
  run(ctx: { T: number; tags: TagDB }): void;
}

export interface OrchestratorOptions {
  stepMs: number;
  /** Seed cho PRNG (M2); M0 chưa dùng, giữ lại để cấu hình tất định. */
  seed: number;
  /** Mặc định 'throw'; server dùng 'isolate'. */
  errorPolicy?: 'throw' | 'isolate' | undefined;
}

export interface SimSnapshot {
  format: 'vcs-sim-snapshot';
  version: 1;
  simTimeMs: number;
  stepCount: number;
  tags: TagDBSnapshot;
  components: Record<string, unknown>;
  faulted: string[];
}

export interface SimEvents {
  diagnostic: Diagnostic;
  componentFault: { id: string; phase: Phase; T: number; error: string };
  reset: undefined;
  restored: undefined;
}

const PHASES: readonly Phase[] = ['plant', 'controllers', 'gateways'];

function isThenable(value: unknown): value is Promise<void> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function simError(code: 'SIM-E001' | 'SIM-E002' | 'SIM-E003', message: string): Error {
  const hint = PRJ_CATALOG.get(code)?.hint;
  return new Error(hint !== undefined ? `${code}: ${message} (${hint})` : `${code}: ${message}`);
}

export class SimulationOrchestrator {
  readonly tags: TagDB;
  readonly clock: SimClock;
  readonly io: IoBus;
  readonly #stepMs: number;
  readonly #errorPolicy: 'throw' | 'isolate';
  readonly #components: Record<Phase, SimComponent[]> = {
    plant: [],
    controllers: [],
    gateways: [],
  };
  readonly #byId = new Map<string, { phase: Phase; component: SimComponent }>();
  readonly #faulted = new Set<string>();
  #inbox: ExternalCommand[] = [];
  #hooks: StepHooks | undefined;
  #stepCount = 0;
  readonly #listeners = new Map<keyof SimEvents, Set<(payload: never) => void>>();

  constructor(tags: TagDB, clock: SimClock, io: IoBus, opts: OrchestratorOptions) {
    if (!Number.isInteger(opts.stepMs) || opts.stepMs < 1) {
      throw new RangeError(
        `SimulationOrchestrator: stepMs phải là số nguyên ≥ 1, nhận ${String(opts.stepMs)}`,
      );
    }
    this.tags = tags;
    this.clock = clock;
    this.io = io;
    this.#stepMs = opts.stepMs;
    this.#errorPolicy = opts.errorPolicy ?? 'throw';
    // opts.seed: dự trữ cho PRNG có seed (M2); M0 chưa có nguồn ngẫu nhiên nào.
  }

  get stepCount(): number {
    return this.#stepCount;
  }

  get simTimeMs(): number {
    return this.clock.nowMs();
  }

  /** Thứ tự đăng ký = thứ tự chạy trong pha; id duy nhất (OQ-024). */
  register(phase: Phase, c: SimComponent): void {
    if (this.#byId.has(c.id)) {
      throw new Error(
        `SimulationOrchestrator.register: trùng id component '${c.id}' — id phải duy nhất.`,
      );
    }
    this.#components[phase].push(c);
    this.#byId.set(c.id, { phase, component: c });
  }

  getComponent(id: string): SimComponent | undefined {
    return this.#byId.get(id)?.component;
  }

  components(phase?: Phase): readonly SimComponent[] {
    if (phase !== undefined) return [...this.#components[phase]];
    return [
      ...this.#components.plant,
      ...this.#components.controllers,
      ...this.#components.gateways,
    ];
  }

  setHooks(h?: StepHooks): void {
    this.#hooks = h;
  }

  /** Chạy ở đầu bước kế tiếp (sau beforeExternals); xem OQ-029. */
  post(cmd: ExternalCommand): void {
    this.#inbox.push(cmd);
  }

  /**
   * Chạy các lệnh đang chờ ngay (không bước sim) — dùng khi mô phỏng tạm dừng
   * (AMENDMENTS D4): lệnh có hiệu lực ngay thay vì chờ bước kế.
   */
  applyInbox(): void {
    this.#drainInbox(this.clock.nowMs());
  }

  /**
   * True khi và chỉ khi có ≥ 1 component đã đăng ký là ControllerAdapter với
   * `asyncStep === true` (C1, OQ-078). Chỉ là cờ hỏi — không đổi đường chạy:
   * `stepOnce()` gặp component trả Promise vẫn ném `SIM-E002` như M0.
   */
  requiresAsync(): boolean {
    for (const { component } of this.#byId.values()) {
      if ('asyncStep' in component && (component as ControllerAdapter).asyncStep === true) {
        return true;
      }
    }
    return false;
  }

  /** Đường ĐỒNG BỘ; component trả Promise → ném `SIM-E002`. */
  stepOnce(): void {
    const T = this.clock.nowMs();
    const dt = this.#stepMs;
    this.#hooks?.beforeExternals?.(T);
    this.#drainInbox(T);
    this.#runPhasesSync(T, dt);
    this.#finishStep(T, dt);
  }

  /** Giống `stepOnce` nhưng `await` kết quả từng component, tuần tự. */
  async stepOnceAsync(): Promise<void> {
    const T = this.clock.nowMs();
    const dt = this.#stepMs;
    this.#hooks?.beforeExternals?.(T);
    this.#drainInbox(T);
    await this.#runPhasesAsync(T, dt);
    this.#finishStep(T, dt);
  }

  /** `n` phải int ≥ 0 (sai → `RangeError`); n = 0 là no-op (OQ-023). */
  runSteps(n: number): void {
    if (!Number.isInteger(n) || n < 0) {
      throw new RangeError(`runSteps(n): n phải là số nguyên ≥ 0, nhận ${String(n)}`);
    }
    for (let i = 0; i < n; i++) this.stepOnce();
  }

  /** Chạy khi `nowMs < target`; có thể vượt target < stepMs (OQ-023). */
  runUntil(simTimeMs: number): void {
    if (!Number.isFinite(simTimeMs)) {
      throw new RangeError(
        `runUntil(target): target phải là số hữu hạn, nhận ${String(simTimeMs)}`,
      );
    }
    while (this.clock.nowMs() < simTimeMs) this.stepOnce();
  }

  /** Hộp thư không rỗng → ném `SIM-E003` ("có lệnh đang chờ"). */
  snapshotAll(): SimSnapshot {
    if (this.#inbox.length > 0) {
      throw simError(
        'SIM-E003',
        'snapshotAll: có lệnh đang chờ trong hộp thư — chạy một bước trước',
      );
    }
    const components: Record<string, unknown> = {};
    for (const phase of PHASES) {
      for (const c of this.#components[phase]) components[c.id] = c.snapshot();
    }
    return {
      format: 'vcs-sim-snapshot',
      version: 1,
      simTimeMs: this.clock.nowMs(),
      stepCount: this.#stepCount,
      tags: this.tags.snapshot(),
      components,
      faulted: [...this.#faulted],
    };
  }

  restoreAll(s: SimSnapshot): void {
    // Đọc qua kiểu lỏng (unknown) để các so sánh format/version có ý nghĩa;
    // dùng lại `s` (SimSnapshot) chỉ sau khi đã kiểm tra đủ trường.
    const raw = s as {
      format?: unknown;
      version?: unknown;
      simTimeMs?: unknown;
      stepCount?: unknown;
      components?: unknown;
      faulted?: unknown;
    } | null;
    if (
      typeof raw !== 'object' ||
      raw === null ||
      raw.format !== 'vcs-sim-snapshot' ||
      raw.version !== 1 ||
      !Number.isInteger(raw.simTimeMs) ||
      !Number.isInteger(raw.stepCount) ||
      typeof raw.components !== 'object' ||
      raw.components === null ||
      !Array.isArray(raw.faulted)
    ) {
      throw simError('SIM-E003', 'restoreAll: snapshot không tương thích (format/version sai)');
    }
    const known = new Set(this.#byId.keys());
    const got = new Set(Object.keys(s.components));
    if (known.size !== got.size || [...known].some((id) => !got.has(id))) {
      throw simError(
        'SIM-E003',
        'restoreAll: snapshot không tương thích (tập component id khác — ' +
          `kỳ vọng [${[...known].join(', ')}], nhận [${[...got].join(', ')}])`,
      );
    }
    this.clock.restore(s.simTimeMs);
    this.tags.restore(s.tags);
    for (const phase of PHASES) {
      for (const c of this.#components[phase]) {
        c.restore(s.components[c.id]);
      }
    }
    this.#stepCount = s.stepCount;
    this.#faulted.clear();
    for (const id of s.faulted) this.#faulted.add(id);
    this.tags.flush();
    this.#emit('restored', undefined);
  }

  /** `reset()` component trả Promise → ném `SIM-E002` (OQ-024). */
  resetAll(): void {
    this.#inbox = [];
    this.#faulted.clear();
    this.clock.reset(0);
    this.#stepCount = 0;
    this.tags.reset();
    for (const phase of PHASES) {
      for (const c of this.#components[phase]) {
        const r: StepResult = c.reset();
        if (isThenable(r)) {
          throw simError(
            'SIM-E002',
            `resetAll: component '${c.id}' trả Promise trong đường đồng bộ — dùng resetAllAsync`,
          );
        }
      }
    }
    this.tags.flush();
    this.#emit('reset', undefined);
  }

  async resetAllAsync(): Promise<void> {
    this.#inbox = [];
    this.#faulted.clear();
    this.clock.reset(0);
    this.#stepCount = 0;
    this.tags.reset();
    for (const phase of PHASES) {
      for (const c of this.#components[phase]) {
        await c.reset();
      }
    }
    this.tags.flush();
    this.#emit('reset', undefined);
  }

  on<K extends keyof SimEvents>(ev: K, cb: (p: SimEvents[K]) => void): Unsub {
    let set = this.#listeners.get(ev);
    if (set === undefined) {
      set = new Set();
      this.#listeners.set(ev, set);
    }
    const wrapped = cb as (payload: never) => void;
    set.add(wrapped);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      set.delete(wrapped);
    };
  }

  /**
   * Drain chụp inbox lúc bắt đầu bước (OQ-029): lệnh `post` trong lúc drain
   * (vd trong `step()` của plant) chạy ở bước kế; lệnh `post` trong
   * `beforeExternals` chạy cùng bước (drain chạy sau hook).
   * Lệnh ném lỗi → diagnostic `SIM-E001`, các lệnh còn lại vẫn chạy (OQ-021).
   */
  #drainInbox(T: number): void {
    const inbox = this.#inbox;
    this.#inbox = [];
    for (const cmd of inbox) {
      try {
        cmd.run({ T, tags: this.tags });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.#emitDiagnostic(
          diag(
            'SIM-E001',
            'error',
            `lệnh '${cmd.label}' lỗi tại T=${String(T)} — ${reason}`,
            undefined,
            PRJ_CATALOG.get('SIM-E001')?.hint,
          ),
        );
      }
    }
  }

  #runPhasesSync(T: number, dt: number): void {
    for (const phase of PHASES) {
      for (const c of this.#components[phase]) {
        if (this.#faulted.has(c.id)) continue;
        let r: StepResult;
        try {
          r = c.step(T, dt);
        } catch (err) {
          this.#handleStepError(c, phase, T, err);
          continue;
        }
        if (isThenable(r)) {
          throw simError(
            'SIM-E002',
            `component '${c.id}' trả Promise trong đường đồng bộ tại T=${String(T)} — ` +
              `chuyển sang stepOnceAsync hoặc viết lại thành đồng bộ`,
          );
        }
      }
    }
  }

  async #runPhasesAsync(T: number, dt: number): Promise<void> {
    for (const phase of PHASES) {
      for (const c of this.#components[phase]) {
        if (this.#faulted.has(c.id)) continue;
        try {
          await c.step(T, dt);
        } catch (err) {
          this.#handleStepError(c, phase, T, err);
        }
      }
    }
  }

  #handleStepError(c: SimComponent, phase: Phase, T: number, err: unknown): void {
    if (this.#errorPolicy === 'throw') {
      throw new SimComponentError(c.id, phase, T, err);
    }
    this.#faulted.add(c.id);
    const reason = err instanceof Error ? err.message : String(err);
    this.#emit('componentFault', { id: c.id, phase, T, error: reason });
    this.#emitDiagnostic(
      diag(
        'SIM-E001',
        'error',
        `component '${c.id}' lỗi ở pha '${phase}' tại T=${String(T)} — ${reason}`,
        undefined,
        PRJ_CATALOG.get('SIM-E001')?.hint,
      ),
    );
  }

  /**
   * Ném giữa bước → clock không advance, stepCount không tăng, `flush()`
   * không chạy (OQ-023); giá trị TagDB đã ghi giữ nguyên và phát ở `flush()`
   * của bước thành công sau.
   */
  #finishStep(T: number, dt: number): void {
    this.tags.flush();
    this.#hooks?.afterStep?.(T);
    this.clock.advance(dt);
    this.#stepCount += 1;
  }

  #emit<K extends keyof SimEvents>(ev: K, payload: SimEvents[K]): void {
    const set = this.#listeners.get(ev);
    if (set === undefined) return;
    for (const cb of [...set]) cb(payload as never);
  }

  #emitDiagnostic(d: Diagnostic): void {
    this.#emit('diagnostic', d);
  }
}
