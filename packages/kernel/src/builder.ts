// Builder + cơ chế extension — @vcs/kernel (M0 §6.8).
// `createSimulation` theo đúng 5 bước §6.8; extension đăng ký factory/component
// theo thứ tự mảng; thiếu factory → SIM-W001 (bỏ qua, vẫn chạy); lỗi `init()`
// → SIM-E001 (bỏ qua controller đó, OQ-025). `apps/cli`/`apps/server` dựng
// danh sách extension tập trung ở một chỗ (`apps/*/src/extensions.ts`).

import {
  diag,
  PRJ_CATALOG,
  hasErrors,
  type ControllerDef,
  type Diagnostic,
  type ProjectConfig,
  type TagCatalog,
  type TagDef,
} from '@vcs/schemas';
import type { SimClock } from './clock.js';
import type { ControllerAdapter, Phase, SimComponent } from './component.js';
import { ProjectInvalidError } from './errors.js';
import type { IoBus } from './iobus.js';
import { TagDbIoBus } from './iobus.js';
import { ManualClock } from './clock.js';
import { SimulationOrchestrator } from './orchestrator.js';
import type { TagDBOptions } from './tags.js';
import { TagDB } from './tags.js';

export type ControllerKey = `${'builtin' | 'external'}:${string}`;
export type ControllerFactory = (
  def: ControllerDef,
  ctx: BuildCtx,
) => ControllerAdapter | Promise<ControllerAdapter>;

/**
 * Hình dạng project tối thiểu mà `createSimulation` cần (OQ-030).
 * Spec §6.8 ghi tham số là `ProjectModel` (@vcs/project), nhưng đồ thị phụ
 * thuộc M0 §3.5 cấm kernel import project (tiền lệ P0.3: `namesHash` tính
 * bằng `node:crypto` thay vì import `hashText`). `ProjectModel` thỏa mãn
 * interface này theo cấu trúc nên caller truyền thẳng `ProjectModel` được.
 */
export interface SimulationProject {
  config: ProjectConfig;
  tags: readonly TagDef[];
  catalog: TagCatalog;
  diagnostics: readonly Diagnostic[];
}

export interface BuildCtx {
  project: SimulationProject;
  tags: TagDB;
  clock: SimClock;
  io: IoBus;
  orchestrator: SimulationOrchestrator;
  registerController(key: ControllerKey, f: ControllerFactory): void;
  register(phase: Phase, c: SimComponent): void;
  addDiagnostic(d: Diagnostic): void;
}

export interface SimulationExtension {
  id: string;
  apply(ctx: BuildCtx): void | Promise<void>;
}

export interface SimulationBundle {
  sim: SimulationOrchestrator;
  tags: TagDB;
  clock: SimClock;
  io: IoBus;
  project: SimulationProject;
  controllers: ControllerAdapter[];
  diagnostics: Diagnostic[];
}

function controllerKey(def: ControllerDef): ControllerKey {
  return def.mode === 'builtin' ? `builtin:${def.vendor}` : `external:${def.adapter}`;
}

export async function createSimulation(
  project: SimulationProject,
  opts?: {
    extensions?: SimulationExtension[];
    errorPolicy?: 'throw' | 'isolate' | undefined;
    tagDb?: TagDBOptions | undefined;
  },
): Promise<SimulationBundle> {
  // Bước 1: project có error → ném (kèm danh sách diagnostics).
  if (hasErrors(project.diagnostics)) {
    throw new ProjectInvalidError(project.diagnostics);
  }
  // Bước 2: dựng clock, TagDB (chỉ tag I/Q), IoBus, orchestrator.
  const clock = new ManualClock();
  const iqTags = project.tags.filter((t) => t.area === 'I' || t.area === 'Q');
  const tags = new TagDB(iqTags, clock, opts?.tagDb);
  const io = new TagDbIoBus(tags);
  const sim = new SimulationOrchestrator(tags, clock, io, {
    stepMs: project.config.simulation.stepMs,
    seed: project.config.seed,
    errorPolicy: opts?.errorPolicy,
  });
  const diagnostics: Diagnostic[] = [];
  const factories = new Map<ControllerKey, ControllerFactory>();
  const ctx: BuildCtx = {
    project,
    tags,
    clock,
    io,
    orchestrator: sim,
    registerController(key, f) {
      factories.set(key, f);
    },
    register(phase, c) {
      sim.register(phase, c);
    },
    addDiagnostic(d) {
      diagnostics.push(d);
    },
  };
  // Bước 3: chạy extensions tuần tự theo thứ tự mảng.
  for (const ext of opts?.extensions ?? []) {
    await ext.apply(ctx);
  }
  // Bước 4: với mỗi controller theo thứ tự khai báo.
  const controllers: ControllerAdapter[] = [];
  for (const def of project.config.controllers) {
    const key = controllerKey(def);
    const factory = factories.get(key);
    if (factory === undefined) {
      diagnostics.push(
        diag(
          'SIM-W001',
          'warning',
          `không có runtime đăng ký cho controller '${def.id}' (${key}) — bỏ qua controller này`,
          undefined,
          PRJ_CATALOG.get('SIM-W001')?.hint,
        ),
      );
      continue;
    }
    let adapter: ControllerAdapter;
    try {
      adapter = await factory(def, ctx);
      const scanPeriodRaw: unknown = def.config['scanPeriodMs'];
      const scanPeriodMs =
        typeof scanPeriodRaw === 'number' ? scanPeriodRaw : project.config.simulation.plcScanMs;
      await adapter.init(
        {
          id: def.id,
          def,
          stepMs: project.config.simulation.stepMs,
          scanPeriodMs,
          tags: project.catalog.byController(def.id),
        },
        io,
      );
    } catch (err) {
      // OQ-025: lỗi init → SIM-E001, bỏ qua controller đó, tiếp tục controller khác.
      const reason = err instanceof Error ? err.message : String(err);
      diagnostics.push(
        diag(
          'SIM-E001',
          'error',
          `controller '${def.id}' lỗi khi khởi tạo — ${reason}`,
          undefined,
          PRJ_CATALOG.get('SIM-E001')?.hint,
        ),
      );
      continue;
    }
    sim.register('controllers', adapter);
    controllers.push(adapter);
  }
  // Bước 5: trả bundle.
  return { sim, tags, clock, io, project, controllers, diagnostics };
}
