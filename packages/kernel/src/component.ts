// SimComponent / ControllerAdapter — @vcs/kernel (M0 §6.6).
// Chỉ khai báo interface + hàm kiểm; cài đặt thật của ControllerIntrospection
// ở P1.4 (D3). `step()` trả `void | Promise<void>` (AMENDMENTS A1);
// `snapshot()`/`restore()` bắt buộc (A2).

import type { ControllerDef, TagDef, TagValue } from '@vcs/schemas';
import type { IoBus } from './iobus.js';

/** Kết quả một bước: đồng bộ (`void`) hoặc bất đồng bộ (`Promise<void>`). */
export type StepResult = void | Promise<void>;

/** Pha chạy trong một bước mô phỏng (§6.7) — thứ tự cố định. */
export type Phase = 'plant' | 'controllers' | 'gateways';

/** Đơn vị mô phỏng: plant, controller, gateway — chạy theo pha (§6.7). */
export interface SimComponent {
  readonly id: string;
  step(simTimeMs: number, dtMs: number): StepResult;
  reset(): StepResult;
  /** JSON-serializable. */
  snapshot(): unknown;
  restore(s: unknown): void;
}

export interface ControllerConfig {
  /** id từ project.controllers[i]. */
  id: string;
  def: ControllerDef;
  stepMs: number;
  /** `def.config.scanPeriodMs ?? simulation.plcScanMs`. */
  scanPeriodMs: number;
  /** Mọi tag thuộc controller này (I/Q/M/DB), thứ tự như file. */
  tags: readonly TagDef[];
}

export interface ControllerDiagnostics {
  state: 'STOP' | 'RUN' | 'FAULT' | 'DISCONNECTED';
  scanCount: number;
  lastScanSimMs: number;
  faults: { code: string; message: string; count: number }[];
  info?: Record<string, unknown>;
}

export interface ControllerAdapter extends SimComponent {
  readonly kind: 'builtin' | 'external';
  init(cfg: ControllerConfig, io: IoBus): Promise<void>;
  getDiagnostics(): ControllerDiagnostics;
}

/**
 * Tùy chọn — M1 cài đặt thật; UI/test dùng để xem/ghi/force tag M/DB và
 * biến nội bộ. Ở M0 chỉ khai báo interface + hàm kiểm `isIntrospectable`.
 */
export interface ControllerIntrospection {
  read(ref: string): TagValue;
  write(ref: string, v: TagValue): void;
  force(ref: string, v: TagValue): void;
  unforce(ref: string): void;
  listForces(): { ref: string; value: TagValue }[];
  /** RUN/STOP. */
  start(): void;
  stop(): void;
}

export function isIntrospectable(
  c: ControllerAdapter,
): c is ControllerAdapter & ControllerIntrospection {
  const candidate = c as unknown as Partial<ControllerIntrospection>;
  return (
    typeof candidate.read === 'function' &&
    typeof candidate.write === 'function' &&
    typeof candidate.force === 'function' &&
    typeof candidate.unforce === 'function' &&
    typeof candidate.listForces === 'function' &&
    typeof candidate.start === 'function' &&
    typeof candidate.stop === 'function'
  );
}
