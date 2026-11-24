// makeSim + FakeController — @vcs/test-utils (M0 §7; OQ-017, OQ-028).
// `makeSim` nhận `ProjectModel` đã nạp (không import `@vcs/project` — rule
// `test-utils-deps` cấm; dùng `SimulationProject` cấu trúc ở @vcs/kernel,
// OQ-030). Tự đăng ký `demoExtension` trước, rồi extension của caller.

import {
  createSimulation,
  type ControllerAdapter,
  type ControllerConfig,
  type ControllerDiagnostics,
  type OrchestratorOptions,
  type SimComponent,
  type SimulationBundle,
  type SimulationExtension,
  type SimulationProject,
  type StepResult,
  type TagDBOptions,
} from '@vcs/kernel';
import { demoExtension } from '@vcs/kernel/demo';
import type { IoBus } from '@vcs/kernel';

export interface MakeSimOptions {
  extensions?: SimulationExtension[];
  errorPolicy?: OrchestratorOptions['errorPolicy'];
  tagDb?: TagDBOptions;
}

/** Dựng simulation từ project đã nạp (`loadProject`); tự có demo controller. */
export async function makeSim(
  project: SimulationProject,
  opts?: MakeSimOptions,
): Promise<SimulationBundle> {
  return createSimulation(project, {
    extensions: [demoExtension, ...(opts?.extensions ?? [])],
    errorPolicy: opts?.errorPolicy,
    tagDb: opts?.tagDb,
  });
}

export interface FakeControllerOptions {
  stepBehavior?: (T: number, dt: number, self: FakeController) => StepResult;
}

/**
 * Controller giả cho test: đếm lời gọi, `stepBehavior` tùy biến được
 * (ném lỗi/trả Promise), `init` lưu `io` để test ghi output.
 */
export class FakeController implements ControllerAdapter, SimComponent {
  readonly kind = 'builtin' as const;
  readonly id: string;
  stepCalls = 0;
  resetCalls = 0;
  stepBehavior: ((T: number, dt: number, self: FakeController) => StepResult) | undefined =
    undefined;
  #io: IoBus | undefined;
  #cfg: ControllerConfig | undefined;
  #lastT = 0;

  constructor(id: string, opts?: FakeControllerOptions) {
    this.id = id;
    this.stepBehavior = opts?.stepBehavior;
  }

  /** IoBus đã init (undefined trước init) — test dùng để ghi output. */
  get io(): IoBus | undefined {
    return this.#io;
  }

  get cfg(): ControllerConfig | undefined {
    return this.#cfg;
  }

  init(cfg: ControllerConfig, io: IoBus): Promise<void> {
    this.#cfg = cfg;
    this.#io = io;
    return Promise.resolve();
  }

  step(simTimeMs: number, dtMs: number): StepResult {
    this.stepCalls += 1;
    this.#lastT = simTimeMs;
    return this.stepBehavior?.(simTimeMs, dtMs, this);
  }

  /**
   * Đặt lại bộ đếm bước về 0 (golden T5 §11: sau `resetAll()`, component lại
   * ném ở bước thứ 3 như lúc đầu); `resetCalls` đếm lũy tích số lần reset.
   */
  reset(): void {
    this.stepCalls = 0;
    this.#lastT = 0;
    this.resetCalls += 1;
  }

  snapshot(): unknown {
    return { stepCalls: this.stepCalls, resetCalls: this.resetCalls, lastT: this.#lastT };
  }

  restore(s: unknown): void {
    if (
      typeof s !== 'object' ||
      s === null ||
      typeof (s as { stepCalls?: unknown }).stepCalls !== 'number' ||
      typeof (s as { resetCalls?: unknown }).resetCalls !== 'number' ||
      typeof (s as { lastT?: unknown }).lastT !== 'number'
    ) {
      throw new Error(
        'SIM-E003: FakeController.restore: snapshot không tương thích — snapshot được tạo bởi phiên bản khác, chạy lại từ đầu.',
      );
    }
    const snap = s as { stepCalls: number; resetCalls: number; lastT: number };
    this.stepCalls = snap.stepCalls;
    this.resetCalls = snap.resetCalls;
    this.#lastT = snap.lastT;
  }

  getDiagnostics(): ControllerDiagnostics {
    return {
      state: 'RUN',
      scanCount: this.stepCalls,
      lastScanSimMs: this.#lastT,
      faults: [],
    };
  }
}
