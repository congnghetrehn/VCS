// Registry model thiết bị — @vcs/plant (M2 §4.5).
// Model là dữ liệu + hai hàm thuần (init/step); registry là map type → model.
// P2.1 chưa có model thật — model giả chỉ tồn tại trong file test (OQ-246).

import type { ZodType } from 'zod';

import type { SignalFaultType, SignalKind } from '@vcs/schemas';

/** Một role của model: kênh I/O mà model đọc (cmd) hoặc ghi (emit). */
export interface RoleDef {
  role: string;
  kind: SignalKind;
  dataType: 'Bool' | 'Int' | 'Real';
  unit?: string;
  optional?: boolean;
  description: string;
  synonyms: string[];
  descKeywords: string[];
}

/** Một observable: giá trị nội bộ model công bố cho link/source. */
export interface ObsDef {
  key: string;
  unit?: string;
  description: string;
}

/** Một lỗi thiết bị mà model khai báo (kích hoạt qua fault(id)). */
export interface FaultDef {
  id: string;
  description: string;
  paramsSchema?: ZodType;
}

/** Một preset lỗi: chèn nhanh một lỗi tín hiệu hoặc lỗi thiết bị. */
export interface FaultPreset {
  description: string;
  signalFault?: { role: string; type: SignalFaultType; params?: Record<string, unknown> };
  equipmentFault?: { fault: string; params?: Record<string, unknown> };
}

/** Bối cảnh một bước của model — các hàm do engine cung cấp. */
export interface StepCtx<P = unknown, S = unknown> {
  dtMs: number;
  simTimeMs: number;
  params: P;
  state: S;
  /** Đọc role input (DO/AO); undefined khi role chưa gán. */
  cmd(role: string): boolean | number | undefined;
  /** true khi role đã gán tag. */
  has(role: string): boolean;
  /** Ghi role output (DI/AI); không làm gì khi role chưa gán. */
  emit(role: string, v: boolean | number): void;
  /** Trạng thái lỗi thiết bị (không active → active=false, sinceMs=0). */
  fault(id: string): {
    active: boolean;
    params: Record<string, unknown>;
    sinceMs: number;
    clearedAtMs?: number;
  };
  /** Giá trị nguồn đã resolve (0 khi model không có source). */
  source(): number | boolean;
  /** Số giả ngẫu nhiên [0,1) từ PRNG riêng của thiết bị. */
  rand(): number;
  setObs(key: string, v: number | boolean | string): void;
  getObs(equipmentId: string, key: string): number | boolean | string | undefined;
  log(level: 'info' | 'warn', msg: string, data?: Record<string, unknown>): void;
}

/** Tài liệu mô hình cho docgen (OQ-260, P2.2): trạng thái/chuyển đổi/ghi chú. */
export interface ModelDocs {
  states?: Array<{ state: string; description: string }>;
  transitions?: string[];
  notes?: string[];
}

/** Model thiết bị. `init`/`step` khai báo dạng method để variance hai chiều
 *  (một model P/S cụ thể gán được cho EquipmentModel<unknown, unknown>). */
export interface EquipmentModel<P = unknown, S = unknown> {
  type: string;
  version: string;
  description: string;
  roles: RoleDef[];
  paramsSchema: ZodType<P>;
  defaultParams: P;
  observables: ObsDef[];
  faults: FaultDef[];
  presets?: Record<string, FaultPreset>;
  hasSource?: boolean;
  /** Tài liệu cho docgen — additive, không breaking (OQ-260). */
  docs?: ModelDocs;
  init(params: P, rng: () => number): S;
  step(ctx: StepCtx<P, S>): void;
}

/** Registry model: map type → model, fail-fast khi đăng ký sai. */
export class ModelRegistry {
  #models = new Map<string, EquipmentModel>();

  register<P, S>(model: EquipmentModel<P, S>): void {
    if (model.type === '') {
      throw new Error('ModelRegistry: type của model không được rỗng.');
    }
    if (model.roles.length === 0) {
      throw new Error(`ModelRegistry: model ${model.type} phải khai báo ít nhất một role.`);
    }
    if (this.#models.has(model.type)) {
      throw new Error(`ModelRegistry: model ${model.type} đã đăng ký.`);
    }
    this.#models.set(model.type, model);
  }

  get(type: string): EquipmentModel | undefined {
    return this.#models.get(type);
  }

  has(type: string): boolean {
    return this.#models.has(type);
  }

  list(): string[] {
    return [...this.#models.keys()].sort();
  }
}

/** Registry mặc định của tiến trình — model thật (P2.2+) đăng ký vào đây. */
export const defaultRegistry = new ModelRegistry();

export function createModelRegistry(): ModelRegistry {
  return new ModelRegistry();
}

/**
 * Tạo model mới từ model gốc (spread base + patch; roles thay nếu cho).
 * paramsSchema được kế thừa từ base.
 */
export function deriveModel<P extends object, S>(
  base: EquipmentModel<P, S>,
  patch: {
    type: string;
    version?: string;
    description?: string;
    roles?: RoleDef[];
    defaultParams?: Partial<P>;
    observables?: ObsDef[];
    faults?: FaultDef[];
    presets?: Record<string, FaultPreset>;
    hasSource?: boolean;
    docs?: ModelDocs;
    init?: EquipmentModel<P, S>['init'];
    step?: EquipmentModel<P, S>['step'];
  },
): EquipmentModel<P, S> {
  return {
    ...base,
    type: patch.type,
    ...(patch.version !== undefined ? { version: patch.version } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.roles !== undefined ? { roles: patch.roles } : {}),
    ...(patch.defaultParams !== undefined
      ? { defaultParams: { ...base.defaultParams, ...patch.defaultParams } }
      : {}),
    ...(patch.observables !== undefined ? { observables: patch.observables } : {}),
    ...(patch.faults !== undefined ? { faults: patch.faults } : {}),
    ...(patch.presets !== undefined ? { presets: patch.presets } : {}),
    ...(patch.hasSource !== undefined ? { hasSource: patch.hasSource } : {}),
    ...(patch.docs !== undefined ? { docs: patch.docs } : {}),
    ...(patch.init !== undefined ? { init: patch.init } : {}),
    ...(patch.step !== undefined ? { step: patch.step } : {}),
  };
}
