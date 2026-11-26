// PlantEngine — @vcs/plant (M2 §5).
// SimComponent pha 'plant': bước tất định theo topo, source → model step →
// emit qua adapter. Fail-fast ở constructor khi cấu hình lỗi; lỗi trong một
// bước không làm sập engine (model ném lỗi → lỗi được ghi vào EventLog và
// bước dừng ở thiết bị đó — xem step()).

import {
  diag,
  faultRequestSchema,
  sourceSpecSchema,
  type Diagnostic,
  type EquipmentInstance,
  type FaultInfo,
  type FaultRequest,
  type FaultTiming,
  type SignalFaultType,
  type SignalKind,
  type SourceSpec,
  type TagDef,
} from '@vcs/schemas';
import type { SimComponent, TagDB, TagHandle } from '@vcs/kernel';

import { engToRaw, rawToEng, resolveRange, type Range } from './adapter.js';
import { EventLog, type PlantEvent } from './events.js';
import { FaultManager, type FaultManagerOptions, type FaultManagerSnapshot } from './faults.js';
import { hashSeed, rngNext, rngState, type RngState } from './rng.js';
import {
  defaultRegistry,
  type EquipmentModel,
  type FaultSlot,
  type ModelRegistry,
  type ModelSlots,
  type ObsSlot,
  type RoleDef,
  type RoleSlot,
  type SourceSlot,
  type StepCtx,
} from './registry.js';
import { evalSource, topoSort, type SourceRuntime } from './source.js';

/** Cấu hình plant (M2 §5.2). `tags` là map tên → TagDef để validate. */
export interface PlantConfig {
  stepMs: number;
  seed: number;
  equipment: EquipmentInstance[];
  tags: Map<string, TagDef>;
  wireBreakRaw?: number;
  /** Chu kỳ scan PLC (ms) — tùy chọn; chỉ kiểm PL-W001 khi có giá trị (OQ-244). */
  plcScanMs?: number;
}

/** Loại lỗi tín hiệu cho phép theo kind của role (M2 §6.1, bảng "Áp cho"). */
const SIGNAL_FAULT_KINDS: Record<SignalFaultType, readonly SignalKind[]> = {
  stuck: ['DI', 'DO', 'AI', 'AO'],
  freeze: ['DI', 'DO', 'AI', 'AO'],
  invert: ['DI', 'DO'],
  delay: ['DI', 'AI'],
  offset: ['AI'],
  gain: ['AI'],
  drift: ['AI'],
  noise: ['AI'],
  spike: ['AI'],
  outOfRange: ['AI'],
  wireBreak: ['DI', 'AI'],
  chatter: ['DI'],
  lost: ['DO', 'AO'],
  stuckCmd: ['DO', 'AO'],
};

/** 1 record/role, tính trước ở init (P2.4 commit 4): `#cmd`/`#emit` chỉ cần
 *  1 lookup `roleSlot` + 1 index mảng, thay vì 3–4 `Map.get` mỗi lần gọi.
 *  `handle` undefined = role khai báo nhưng chưa gán tag (role optional). */
interface Channel {
  role: string;
  handle: TagHandle | undefined;
  kind: RoleDef['kind'];
  dataType: RoleDef['dataType'];
  range: Range | undefined;
  /** Key `${id}:${role}` tính trước (OQ-267: `#emit` khỏi nối chuỗi mỗi lần gọi). */
  emitKey: string;
}

interface RuntimeEquipment {
  id: string;
  model: EquipmentModel;
  params: Record<string, unknown>;
  state: unknown;
  rng: RngState;
  /** Giá trị observable hiện tại, theo ObsSlot (undefined = chưa set lần nào). */
  obs: (number | boolean | string | undefined)[];
  /** Giá trị observable ở lần drain trước — baseline để #drainPendingObs
   *  so sánh trực tiếp, thay Map pendingObs (A21). */
  prevObs: (number | boolean | string | undefined)[];
  source: SourceRuntime | undefined;
  sourceValue: number | boolean;
  /** Named sources theo thứ tự slot (tên → SourceSlot trong slots.source). */
  namedSources: SourceRuntime[];
  namedSourceValues: (number | boolean)[];
  /** Kênh theo thứ tự `model.roles` — đọc bằng slot, không Map.get. */
  channels: Channel[];
  /** role → slot trong `channels` (giữ cho đường lạnh theo tên: injectFault, #initialValue). */
  roleSlot: Map<string, number>;
  /** Bảng slot của thiết bị (đóng băng, trừ record `source` — xem registry.ts). */
  slots: ModelSlots;
  /** Tên role/obs/fault theo slot — reverse map cho thông báo lỗi + tên
   *  role truyền vào FaultManager (đường lạnh + applyCmd/applyEmit). */
  slotNames: { role: string[]; obs: string[]; fault: string[] };
}

export interface PlantSnapshot {
  version: 1;
  simTimeMs: number;
  equipment: Array<{
    id: string;
    state: unknown;
    rng: RngState;
    obs: Record<string, number | boolean | string>;
    source: SourceRuntime | null;
    sourceValue: number | boolean;
    /** Named sources (OQ-290) — optional để snapshot cũ (v1 trước P2.3) vẫn restore được. */
    namedSources?: Record<string, SourceRuntime>;
    namedSourceValues?: Record<string, number | boolean>;
  }>;
  faults: FaultManagerSnapshot;
  lastEmit: Array<[string, number | boolean]>;
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/**
 * Validate cấu hình plant (hàm thuần). PL-E001 là mã lỗi cấu hình chung
 * (model/link-target/role không tồn tại, trùng id, params sai schema);
 * tag không tồn tại dùng TAG-E003; stepMs sai dùng PRJ-E007.
 */
/** Các id thiết bị mà `inst` phụ thuộc qua link (source chính + named sources). */
function linkDeps(inst: EquipmentInstance | undefined): string[] {
  if (inst === undefined) return [];
  const out: string[] = [];
  const specs: Array<SourceSpec | undefined> = [inst.source, ...Object.values(inst.sources ?? {})];
  for (const spec of specs) {
    if (spec?.kind === 'link' && spec.equipment !== undefined) out.push(spec.equipment);
  }
  return out;
}

export function validatePlantConfig(
  cfg: PlantConfig,
  tags: Map<string, TagDef>,
  models: ModelRegistry = defaultRegistry,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const err = (code: string, message: string): void => {
    out.push(diag(code, 'error', message));
  };
  const warn = (code: string, message: string): void => {
    out.push(diag(code, 'warning', message));
  };
  if (!isInt(cfg.stepMs) || cfg.stepMs < 1) {
    err('PRJ-E007', `PlantConfig: stepMs phải là số nguyên ≥ 1 (nhận ${String(cfg.stepMs)}).`);
  }
  // OQ-244: plcScanMs chỉ kiểm khi có giá trị (quy tắc PRJ-E007, mức warning).
  if (cfg.plcScanMs !== undefined && (!isInt(cfg.plcScanMs) || cfg.plcScanMs < cfg.stepMs)) {
    warn(
      'PL-W001',
      `PlantConfig: plcScanMs phải là số nguyên ≥ stepMs (${String(cfg.stepMs)}) (nhận ${String(cfg.plcScanMs)}).`,
    );
  }
  const ids = new Set<string>();
  for (const inst of cfg.equipment) {
    if (ids.has(inst.id)) {
      err('PL-E001', `Thiết bị ${inst.id} khai báo trùng id.`);
      continue;
    }
    ids.add(inst.id);
  }
  const instById = new Map(cfg.equipment.map((e) => [e.id, e]));
  // Một tag chỉ phục vụ đúng một role (hai role cùng ghi/đọc một tag là cấu hình sai).
  const seenTags = new Map<string, string>();
  for (const inst of cfg.equipment) {
    const model = models.get(inst.model);
    if (model === undefined) {
      err('PL-E001', `Model ${inst.model} của thiết bị ${inst.id} không tồn tại trong registry.`);
      continue;
    }
    // Params ở tầng engine là record không kiểu (model đã validate bằng zod schema của nó).
    const baseParams = model.defaultParams as Record<string, unknown>;
    const mergedParams = { ...baseParams, ...(inst.params ?? {}) };
    const parsed = model.paramsSchema.safeParse(mergedParams);
    if (!parsed.success) {
      err(
        'PL-E001',
        `Params của thiết bị ${inst.id} (model ${inst.model}) không hợp lệ: ${parsed.error.issues.map((i) => i.message).join('; ')}.`,
      );
    }
    const roles = new Map(model.roles.map((r) => [r.role, r]));
    for (const roleName of Object.keys(inst.signals ?? {})) {
      if (!roles.has(roleName)) {
        err('PL-E001', `Role ${roleName} của thiết bị ${inst.id} không khai báo trong model ${inst.model}.`);
      }
    }
    const params = parsed.success
      ? (parsed.data as Record<string, unknown>)
      : (mergedParams as Record<string, unknown>);
    for (const role of model.roles) {
      const tagName = inst.signals?.[role.role];
      if (tagName === undefined) {
        if (role.optional === true) {
          warn('PL-W001', `Role ${role.role} của ${inst.id} chưa gán tag.`);
        } else {
          err('PL-E003', `Thiếu tag bắt buộc cho role ${role.role} của ${inst.id}.`);
        }
        continue;
      }
      const def = tags.get(tagName);
      if (def === undefined) {
        err('TAG-E003', `Tag ${tagName} gán cho role ${role.role} của ${inst.id} không tồn tại.`);
        continue;
      }
      if (def.signal?.kind !== role.kind) {
        err(
          'PL-E002',
          `Tag ${tagName} (kind ${def.signal?.kind ?? 'null'}) không khớp kind ${role.kind} của role ${role.role} (thiết bị ${inst.id}).`,
        );
        continue;
      }
      const firstUse = seenTags.get(tagName);
      if (firstUse !== undefined) {
        err('PL-E001', `Tag ${tagName} đã gán cho ${firstUse}, không gán lại cho role ${role.role} của ${inst.id}.`);
        continue;
      }
      seenTags.set(tagName, `${inst.id}:${role.role}`);
      // OQ-239: tag Real ghi eng trực tiếp (fround) — cảnh báo 1 lần ở validate.
      if (role.dataType === 'Real' && def.type === 'Real') {
        warn(
          'PL-W020',
          `Tag ${tagName} là Real — ghi eng trực tiếp sau Math.fround, chưa kiểm chứng với PLC thật (xem docs/semantics.md §20).`,
        );
      }
      if ((role.kind === 'AI' || role.kind === 'AO') && role.dataType !== 'Real') {
        if (resolveRange(params, def.signal.scaling, role.unit) === undefined) {
          err(
            'PL-E012',
            `Không xác định được dải đo cho role ${role.role} của ${inst.id}: khai báo engMin/engMax trong params, scaling trong tag, hoặc unit "%" cho role.`,
          );
        }
      }
    }
    const linkSpecs: Array<{ name: string; spec: SourceSpec }> = [];
    if (inst.source !== undefined) linkSpecs.push({ name: 'source', spec: inst.source });
    for (const [name, spec] of Object.entries(inst.sources ?? {})) {
      linkSpecs.push({ name, spec });
    }
    for (const { name, spec } of linkSpecs) {
      if (spec.kind !== 'link') continue;
      const targetId = spec.equipment ?? '';
      const target = instById.get(targetId);
      if (target === undefined) {
        err('PL-E001', `Link target ${targetId} của ${name} thiết bị ${inst.id} không tồn tại.`);
      } else {
        const targetModel = models.get(target.model);
        const obsKey = spec.observable ?? '';
        if (targetModel !== undefined && !targetModel.observables.some((o) => o.key === obsKey)) {
          err(
            'PL-E001',
            `Observable ${obsKey} không khai báo trong model ${target.model} của thiết bị ${targetId} (link từ ${name} của ${inst.id}).`,
          );
        }
      }
    }
  }
  const { cycle } = topoSort(
    cfg.equipment.map((e) => e.id),
    (id) => linkDeps(instById.get(id)),
  );
  if (cycle !== undefined) {
    err('PL-E020', `Chu trình link: ${cycle.join(' → ')}.`);
  }
  return out;
}

export class PlantEngine implements SimComponent {
  readonly id = 'plant';
  #cfg: PlantConfig;
  #tags: TagDB;
  #models: ModelRegistry;
  #faults: FaultManager;
  #events = new EventLog();
  #simTimeMs = 0;
  #order: RuntimeEquipment[] = [];
  #byId = new Map<string, RuntimeEquipment>();
  #ctxs = new Map<string, StepCtx>();
  /** Nhóm thiết bị theo model (P2.4 commit 5, OQ-310): mỗi nhóm gọi cùng 1
   *  hàm `model.step` (monomorphic call site). Rỗng khi DAG model có chu
   *  trình → step() dùng `#order` (fallback). */
  #groups: Array<{ model: EquipmentModel; members: RuntimeEquipment[] }> = [];
  #groupedByModel = false;
  #lastEmit = new Map<string, number | boolean>();
  /** Hàm getObs đóng sẵn, tái dùng cho mọi evalSource mỗi bước (OQ-267: khỏi cấp phát closure mỗi lần gọi). */
  #getObsBound = (equipmentId: string, key: string): number | boolean | string | undefined =>
    this.#getObs(equipmentId, key);

  constructor(cfg: PlantConfig, tags: TagDB, models: ModelRegistry = defaultRegistry) {
    this.#cfg = cfg;
    this.#tags = tags;
    this.#models = models;
    const diags = validatePlantConfig(cfg, cfg.tags, models);
    const firstError = diags.find((d) => d.severity === 'error');
    if (firstError !== undefined) {
      throw new Error(`PlantEngine: cấu hình không hợp lệ — ${firstError.code}: ${firstError.message}`);
    }
    this.#faults = this.#makeFaultManager();
    this.#initializeEquipment();
  }

  /** true khi step() chạy theo nhóm model (OQ-310); false khi DAG model có
   *  chu trình → fallback về thứ tự topo thiết bị (không nhóm, không im lặng). */
  get groupedByModel(): boolean {
    return this.#groupedByModel;
  }

  #makeFaultManager(): FaultManager {
    const opts: FaultManagerOptions = {
      stepMs: this.#cfg.stepMs,
      initialValue: (eq, role) => this.#initialValue(eq, role),
    };
    if (this.#cfg.wireBreakRaw !== undefined) opts.wireBreakRaw = this.#cfg.wireBreakRaw;
    return new FaultManager(opts);
  }

  /** Giá trị emit gần nhất (eng/bool) — dùng lấp DelayLine và chụp freeze. */
  #initialValue(equipmentId: string, role: string): number | boolean | undefined {
    const rt = this.#byId.get(equipmentId);
    const ch = rt === undefined ? undefined : this.#channelOf(rt, role);
    const v = this.#lastEmit.get(ch?.emitKey ?? `${equipmentId}:${role}`);
    if (v !== undefined) return v;
    const kind = ch?.kind;
    if (kind === 'DI' || kind === 'DO') return false;
    if (kind === 'AI' || kind === 'AO') return 0;
    return undefined;
  }

  /** Channel của role — undefined khi role không khai báo trong model. */
  #channelOf(rt: RuntimeEquipment, role: string): Channel | undefined {
    const slot = rt.roleSlot.get(role);
    return slot === undefined ? undefined : rt.channels[slot];
  }

  #initializeEquipment(): void {
    const cfg = this.#cfg;
    const instById = new Map(cfg.equipment.map((e) => [e.id, e]));
    const { order: sortedIds } = topoSort(
      cfg.equipment.map((e) => e.id),
      (id) => linkDeps(instById.get(id)),
    );
    this.#order = [];
    this.#byId = new Map();
    this.#ctxs = new Map();
    for (const id of sortedIds) {
      const inst = instById.get(id) as EquipmentInstance;
      const model = this.#models.get(inst.model) as EquipmentModel;
      // Xem chú thích ở validatePlantConfig: params ở tầng engine là record không kiểu.
      const baseParams = model.defaultParams as Record<string, unknown>;
      const mergedParams = { ...baseParams, ...(inst.params ?? {}) };
      const parsed = model.paramsSchema.safeParse(mergedParams);
      const params = parsed.success
        ? (parsed.data as Record<string, unknown>)
        : (mergedParams as Record<string, unknown>);
      const rng = rngState(hashSeed(cfg.seed, id));
      const state = model.init(params, () => rngNext(rng));
      const channels: Channel[] = [];
      const roleSlot = new Map<string, number>();
      for (const role of model.roles) {
        const tagName = inst.signals?.[role.role];
        let handle: TagHandle | undefined;
        let range: Range | undefined;
        if (tagName !== undefined) {
          const def = cfg.tags.get(tagName) as TagDef;
          const h = this.#tags.handle(tagName);
          if (h === undefined) {
            throw new Error(`PlantEngine: tag ${tagName} không tồn tại trong TagDB (TAG-E003).`);
          }
          handle = h;
          if (role.kind === 'DI' || role.kind === 'AI') {
            this.#tags.setOwner(h, 'plant');
          }
          if ((role.kind === 'AI' || role.kind === 'AO') && role.dataType !== 'Real') {
            range = resolveRange(params, def.signal?.scaling, role.unit);
          }
        }
        roleSlot.set(role.role, channels.length);
        channels.push({
          role: role.role,
          handle,
          kind: role.kind,
          dataType: role.dataType,
          range,
          emitKey: `${id}:${role.role}`,
        });
      }
      let source: SourceRuntime | undefined;
      if (model.hasSource === true) {
        const spec: SourceSpec = inst.source ?? { kind: 'const', value: 0 };
        source = { spec, setAtMs: 0, manualValue: 0 };
      }
      const namedSources: SourceRuntime[] = [];
      const namedSourceValues: (number | boolean)[] = [];
      // Bảng slot dựng một lần ở init (OQ-320, A21): role/obs/fault theo
      // thứ tự mảng định nghĩa; source theo thứ tự key config `sources`.
      // RoleSlot = chỉ số kênh (bằng roleSlot đã có từ commit 4).
      const slotNames = {
        role: model.roles.map((r) => r.role),
        obs: model.observables.map((o) => o.key),
        fault: model.faults.map((f) => f.id),
      };
      const roleSlots: Record<string, RoleSlot> = {};
      model.roles.forEach((r, i) => {
        roleSlots[r.role] = i as RoleSlot;
      });
      const obsSlots: Record<string, ObsSlot> = {};
      model.observables.forEach((o, i) => {
        obsSlots[o.key] = i as ObsSlot;
      });
      const faultSlots: Record<string, FaultSlot> = {};
      model.faults.forEach((f, i) => {
        faultSlots[f.id] = i as FaultSlot;
      });
      const sourceSlots: Record<string, SourceSlot> = {};
      for (const [name, spec] of Object.entries(inst.sources ?? {})) {
        sourceSlots[name] = namedSources.length as SourceSlot;
        namedSources.push({ spec, setAtMs: 0, manualValue: 0 });
        namedSourceValues.push(0);
      }
      const slots: ModelSlots = Object.freeze({
        role: Object.freeze(roleSlots),
        obs: Object.freeze(obsSlots),
        fault: Object.freeze(faultSlots),
        source: sourceSlots,
      });
      const rt: RuntimeEquipment = {
        id,
        model,
        params,
        state,
        rng,
        obs: new Array<undefined>(model.observables.length).fill(undefined),
        prevObs: new Array<undefined>(model.observables.length).fill(undefined),
        source,
        sourceValue: 0,
        namedSources,
        namedSourceValues,
        channels,
        roleSlot,
        slots,
        slotNames,
      };
      // Đăng ký fault id của thiết bị để ctx.fault(slot) khỏi quét records (A21).
      this.#faults.registerEquipment(id, model.faults.map((f) => f.id));
      const ctx: StepCtx = {
        dtMs: cfg.stepMs,
        simTimeMs: 0,
        params: rt.params,
        state: rt.state,
        cmd: (slot) => this.#cmd(rt, slot),
        has: (slot) => {
          const ch = slot === undefined ? undefined : rt.channels[slot];
          return ch !== undefined && ch.handle !== undefined;
        },
        emit: (slot, v) => { this.#emit(rt, slot, v); },
        fault: (slot) => this.#faults.equipmentFaultBySlot(rt.id, slot, rt.model.type),
        source: (slot?) =>
          slot === undefined ? rt.sourceValue : (rt.namedSourceValues[slot] ?? 0),
        rand: () => rngNext(rt.rng),
        setObs: (slot, v) => {
          if (slot === undefined || slot < 0 || slot >= rt.obs.length) {
            throw new Error(
              `PlantEngine: slot obs ${String(slot)} không hợp lệ cho model ${rt.model.type} (thiết bị ${rt.id}) — model có ${String(rt.obs.length)} observable.`,
            );
          }
          if (rt.obs[slot] !== v) rt.obs[slot] = v;
        },
        getObs: this.#getObsBound,
        log: (level, msg, data) => {
          const e: PlantEvent = {
            t: this.#simTimeMs,
            type: level === 'warn' ? 'warn' : 'info',
            equipment: rt.id,
            msg,
          };
          if (data !== undefined) e.data = data;
          this.#events.push(e);
        },
      };
      this.#order.push(rt);
      this.#byId.set(id, rt);
      this.#ctxs.set(id, ctx);
    }
    this.#buildModelGroups(instById);
  }

  /**
   * Nhóm thiết bị theo model cho dispatch đơn hình (P2.4 commit 5, OQ-310).
   * DAG mức model: cạnh A→B nếu có thiết bị model A link tới thiết bị model
   * B (link cùng model KHÔNG tính — thứ tự link cùng model giữ bằng thứ tự
   * topo thiết bị trong nhóm, đúng ý plan "giữ đúng thứ tự link cùng
   * model"). Topo-sort model cho thứ tự nhóm; DAG có chu trình chéo model
   * → fallback về `#order` (không nhóm) + `groupedByModel === false`.
   * Thứ tự nhóm + thứ tự topo trong nhóm là một linear extension của thứ
   * tự topo thiết bị nên mọi link đều đúng (link chéo model: model đích
   * nhóm trước; link cùng model: đích trước trong nhóm).
   */
  #buildModelGroups(instById: Map<string, EquipmentInstance>): void {
    const modelOf = new Map(this.#order.map((rt) => [rt.id, rt.model.type]));
    const depsByModel = new Map<string, Set<string>>();
    for (const rt of this.#order) {
      let deps = depsByModel.get(rt.model.type);
      if (deps === undefined) {
        deps = new Set();
        depsByModel.set(rt.model.type, deps);
      }
      for (const depId of linkDeps(instById.get(rt.id))) {
        const depModel = modelOf.get(depId);
        if (depModel !== undefined && depModel !== rt.model.type) deps.add(depModel);
      }
    }
    const modelTypes = [...depsByModel.keys()];
    const { order: modelOrder, cycle } = topoSort(modelTypes, (m) => [
      ...(depsByModel.get(m) ?? []),
    ]);
    if (cycle !== undefined) {
      this.#groups = [];
      this.#groupedByModel = false;
      return;
    }
    const membersByModel = new Map<string, RuntimeEquipment[]>();
    for (const rt of this.#order) {
      const list = membersByModel.get(rt.model.type);
      if (list === undefined) membersByModel.set(rt.model.type, [rt]);
      else list.push(rt);
    }
    this.#groups = modelOrder.map((type) => ({
      model: this.#models.get(type) as EquipmentModel,
      members: membersByModel.get(type) as RuntimeEquipment[],
    }));
    this.#groupedByModel = true;
  }

  #getObs(equipmentId: string, key: string): number | boolean | string | undefined {
    const rt = this.#byId.get(equipmentId);
    if (rt === undefined) return undefined;
    const slot = rt.slots.obs[key];
    if (slot === undefined) return undefined;
    return rt.obs[slot];
  }

  #cmd(rt: RuntimeEquipment, slot: RoleSlot | undefined): boolean | number | undefined {
    const ch = slot === undefined ? undefined : rt.channels[slot];
    if (ch === undefined) {
      throw new Error(
        `PlantEngine: slot role ${String(slot)} không hợp lệ cho model ${rt.model.type} (thiết bị ${rt.id}) — model có ${String(rt.channels.length)} role.`,
      );
    }
    const h = ch.handle;
    if (h === undefined) return undefined;
    const kind = ch.kind;
    let v: number | boolean;
    if (kind === 'DO') {
      v = this.#tags.get(h) === true;
    } else {
      const raw = this.#tags.get(h);
      if (typeof raw !== 'number') return undefined;
      if (ch.dataType === 'Real') {
        v = Math.fround(raw);
      } else {
        const range = ch.range;
        v = range !== undefined ? rawToEng(raw, range) : raw;
      }
    }
    // FaultManager vẫn khớp signal fault theo tên role (ch.role có sẵn trên kênh).
    return this.#faults.applyCmd(rt.id, ch.role, kind, v);
  }

  #emit(rt: RuntimeEquipment, slot: RoleSlot | undefined, v: boolean | number): void {
    const ch = slot === undefined ? undefined : rt.channels[slot];
    if (ch === undefined) {
      throw new Error(
        `PlantEngine: slot role ${String(slot)} không hợp lệ cho model ${rt.model.type} (thiết bị ${rt.id}) — model có ${String(rt.channels.length)} role.`,
      );
    }
    const h = ch.handle;
    if (h === undefined) return;
    const kind = ch.kind;
    const result = this.#faults.applyEmit(rt.id, ch.role, kind, v, this.#simTimeMs, this.#cfg.stepMs, rt.rng);
    if ('rawOverride' in result) {
      if (ch.dataType === 'Real') {
        const range = ch.range;
        const eng = range !== undefined ? rawToEng(result.rawOverride, range) : result.rawOverride;
        this.#tags.set(h, Math.fround(eng), 'plant');
        this.#lastEmit.set(ch.emitKey, eng);
      } else {
        this.#tags.set(h, result.rawOverride, 'plant');
        const range = ch.range;
        this.#lastEmit.set(ch.emitKey, range !== undefined ? rawToEng(result.rawOverride, range) : result.rawOverride);
      }
      return;
    }
    const out = result.value;
    if (kind === 'DI') {
      this.#tags.set(h, out === true, 'plant');
      this.#lastEmit.set(ch.emitKey, out === true);
    } else if (ch.dataType === 'Real') {
      const eng = Math.fround(out as number);
      this.#tags.set(h, eng, 'plant');
      this.#lastEmit.set(ch.emitKey, eng);
    } else {
      const range = ch.range;
      this.#tags.set(h, range !== undefined ? engToRaw(out as number, range) : Math.round(out as number), 'plant');
      this.#lastEmit.set(ch.emitKey, out);
    }
  }

  step(T: number, dtMs: number): void {
    this.#simTimeMs = T;
    const { activated, expired } = this.#faults.advance(T);
    for (const r of activated) {
      const eq = (r.target as { equipment: string }).equipment;
      this.#events.push({ t: T, type: 'fault', equipment: eq, msg: `Lỗi ${r.id} bật.` });
    }
    for (const r of expired) {
      const eq = (r.target as { equipment: string }).equipment;
      this.#events.push({ t: T, type: 'fault', equipment: eq, msg: `Lỗi ${r.id} hết hạn.` });
    }
    if (this.#groupedByModel) {
      // Dispatch đơn hình: `model` bất biến trong vòng trong → cùng 1 hàm
      // `model.step` ở 1 call site (thay vì megamorphic 9 hàm ở #order trộn model).
      for (const g of this.#groups) {
        const model = g.model;
        for (const rt of g.members) {
          const ctx = this.#prepareOne(rt, T);
          if (ctx === undefined) continue;
          ctx.dtMs = dtMs;
          ctx.simTimeMs = T;
          model.step(ctx, rt.slots);
          this.#drainPendingObs(rt, T);
        }
      }
      return;
    }
    for (const rt of this.#order) {
      const ctx = this.#prepareOne(rt, T);
      if (ctx === undefined) continue;
      ctx.dtMs = dtMs;
      ctx.simTimeMs = T;
      rt.model.step(ctx, rt.slots);
      this.#drainPendingObs(rt, T);
    }
  }

  /** Resolve source (+ named sources) và lấy ctx của thiết bị cho bước T. */
  #prepareOne(rt: RuntimeEquipment, T: number): StepCtx | undefined {
    if (rt.source !== undefined) {
      rt.sourceValue = evalSource(
        rt.source.spec,
        T,
        rt.source.setAtMs,
        rt.source.manualValue,
        this.#getObsBound,
      );
    }
    for (let i = 0; i < rt.namedSources.length; i++) {
      const ns = rt.namedSources[i] as SourceRuntime;
      rt.namedSourceValues[i] = evalSource(ns.spec, T, ns.setAtMs, ns.manualValue, this.#getObsBound);
    }
    return this.#ctxs.get(rt.id);
  }

  /**
   * Phát event state cho obs đổi trong bước. So sánh trực tiếp mảng obs với
   * mảng prevObs (baseline lần drain trước), rồi chép obs → prevObs; obs
   * chưa set lần nào (prev undefined) là baseline, không phát event (A21 —
   * giữ đúng ngữ nghĩa setObs cũ: gán lần đầu không phải thay đổi).
   */
  #drainPendingObs(rt: RuntimeEquipment, T: number): void {
    const obs = rt.obs;
    const prev = rt.prevObs;
    for (let i = 0; i < obs.length; i++) {
      const cur = obs[i];
      const from = prev[i];
      if (from !== undefined && cur !== undefined && from !== cur) {
        this.#events.push({
          t: T,
          type: 'state',
          equipment: rt.id,
          key: rt.slotNames.obs[i] as string,
          from,
          to: cur,
        });
      }
      prev[i] = cur;
    }
  }

  reset(): void {
    this.#simTimeMs = 0;
    this.#lastEmit.clear();
    this.#events.clear();
    this.#faults = this.#makeFaultManager();
    this.#initializeEquipment();
  }

  snapshot(): PlantSnapshot {
    return {
      version: 1,
      simTimeMs: this.#simTimeMs,
      equipment: this.#order.map((rt) => {
        // obs/named source lưu dạng Record như trước (định dạng snapshot v1
        // không đổi — mảng nội bộ chỉ là cách lưu runtime, A21).
        const obsRec: Record<string, number | boolean | string> = {};
        for (let i = 0; i < rt.obs.length; i++) {
          const v = rt.obs[i];
          if (v !== undefined) obsRec[rt.slotNames.obs[i] as string] = v;
        }
        const nsRec: Record<string, SourceRuntime> = {};
        const nsvRec: Record<string, number | boolean> = {};
        for (const [name, slot] of Object.entries(rt.slots.source)) {
          const ns = rt.namedSources[slot];
          if (ns !== undefined) nsRec[name] = { ...ns, spec: { ...ns.spec } };
          const v = rt.namedSourceValues[slot];
          if (v !== undefined) nsvRec[name] = v;
        }
        const entry: PlantSnapshot['equipment'][number] = {
          id: rt.id,
          // P2.2: state PHẢI deep-copy — model mutate state tại chỗ mỗi bước
          // nên giữ reference sẽ làm snapshot "trôi" theo (restore không tua
          // được về thời điểm snapshot; motor_dol STARTING → RUNNING).
          // S là JSON-serializable theo hợp đồng (PACKAGE-RULES §plant).
          state: structuredClone(rt.state),
          rng: { ...rt.rng },
          obs: obsRec,
          source: rt.source !== undefined ? { ...rt.source, spec: { ...rt.source.spec } } : null,
          sourceValue: rt.sourceValue,
          namedSources: nsRec,
          namedSourceValues: nsvRec,
        };
        return entry;
      }),
      faults: this.#faults.snapshot(),
      lastEmit: [...this.#lastEmit.entries()],
    };
  }

  restore(s: unknown): void {
    if (
      typeof s !== 'object' ||
      s === null ||
      (s as { version?: unknown }).version !== 1 ||
      !Array.isArray((s as { equipment?: unknown }).equipment)
    ) {
      throw new Error('PlantEngine.restore: snapshot không tương thích (SIM-E003).');
    }
    const snap = s as PlantSnapshot;
    this.#simTimeMs = snap.simTimeMs;
    for (const es of snap.equipment) {
      const rt = this.#byId.get(es.id);
      if (rt === undefined) {
        throw new Error(`PlantEngine.restore: snapshot chứa thiết bị lạ ${es.id} (SIM-E003).`);
      }
      rt.state = es.state;
      const ctx = this.#ctxs.get(es.id);
      if (ctx !== undefined) ctx.state = es.state;
      rt.rng = { ...es.rng };
      for (let i = 0; i < rt.obs.length; i++) {
        rt.obs[i] = es.obs[rt.slotNames.obs[i] as string];
      }
      // Baseline drain = giá trị vừa restore (không phát event cũ sau restore).
      for (let i = 0; i < rt.obs.length; i++) rt.prevObs[i] = rt.obs[i];
      rt.source = es.source ?? undefined;
      rt.sourceValue = es.sourceValue;
      // Named sources: khôi phục theo tên (thứ tự slot giữ nguyên — slot
      // của tên đã có giữ nguyên; tên lạ trong snapshot được thêm slot mới).
      // Khởi tạo đủ chỗ cho mọi slot hiện có trước (snapshot có thể thiếu
      // tên đã thêm lúc chạy sau thời điểm snapshot — giữ placeholder 0).
      rt.namedSources = [];
      rt.namedSourceValues = [];
      for (let i = 0; i < Object.keys(rt.slots.source).length; i++) {
        rt.namedSources.push({ spec: { kind: 'const', value: 0 }, setAtMs: 0, manualValue: 0 });
        rt.namedSourceValues.push(0);
      }
      for (const [name, ns] of Object.entries(es.namedSources ?? {})) {
        const slot = this.#ensureSourceSlot(rt, name);
        rt.namedSources[slot] = { ...ns, spec: { ...ns.spec } };
        rt.namedSourceValues[slot] = es.namedSourceValues?.[name] ?? 0;
      }
    }
    this.#faults.restore(snap.faults);
    this.#lastEmit = new Map(snap.lastEmit);
  }

  /**
   * Slot cho named source `name` — tạo mới khi chưa có (setSource/setManual
   * với tên mới lúc chạy, restore snapshot có tên lạ). Thứ tự slot = thứ tự
   * tạo: key config `sources` ở init, rồi tên thêm lúc chạy (tất định theo
   * trình tự action).
   */
  #ensureSourceSlot(rt: RuntimeEquipment, name: string): SourceSlot {
    let slot = rt.slots.source[name];
    if (slot === undefined) {
      slot = rt.namedSources.length as SourceSlot;
      rt.slots.source[name] = slot;
      rt.namedSources.push({ spec: { kind: 'const', value: 0 }, setAtMs: 0, manualValue: 0 });
      rt.namedSourceValues.push(0);
    }
    return slot;
  }

  /** Validate lại cấu hình hiện tại (không fail-fast). */
  validate(): Diagnostic[] {
    return validatePlantConfig(this.#cfg, this.#cfg.tags, this.#models);
  }

  getState(equipmentId: string): unknown {
    const rt = this.#byId.get(equipmentId);
    if (rt === undefined) throw new Error(`PlantEngine: thiết bị ${equipmentId} không tồn tại.`);
    return rt.state;
  }

  getObservable(equipmentId: string, key: string): number | boolean | string | undefined {
    const rt = this.#byId.get(equipmentId);
    if (rt === undefined) throw new Error(`PlantEngine: thiết bị ${equipmentId} không tồn tại.`);
    const slot = rt.slots.obs[key];
    if (slot === undefined) {
      throw new Error(`PlantEngine: observable ${key} không khai báo trong model ${rt.model.type}.`);
    }
    return rt.obs[slot];
  }

  setSource(equipmentId: string, spec: SourceSpec, name?: string): void {
    const rt = this.#byId.get(equipmentId);
    if (rt === undefined) throw new Error(`PlantEngine: thiết bị ${equipmentId} không tồn tại.`);
    if (rt.model.hasSource !== true) {
      throw new Error(`PlantEngine: model ${rt.model.type} của ${equipmentId} không có source.`);
    }
    const parsed = sourceSpecSchema.parse(spec);
    if (name === undefined) {
      rt.source = { spec: parsed, setAtMs: this.#simTimeMs, manualValue: rt.source?.manualValue ?? 0 };
      return;
    }
    const slot = this.#ensureSourceSlot(rt, name);
    const prev = rt.namedSources[slot];
    rt.namedSources[slot] = {
      spec: parsed,
      setAtMs: this.#simTimeMs,
      manualValue: prev?.manualValue ?? 0,
    };
  }

  setManual(equipmentId: string, value: number | boolean, name?: string): void {
    const rt = this.#byId.get(equipmentId);
    if (rt === undefined) throw new Error(`PlantEngine: thiết bị ${equipmentId} không tồn tại.`);
    if (rt.model.hasSource !== true) {
      throw new Error(`PlantEngine: model ${rt.model.type} của ${equipmentId} không có source.`);
    }
    if (name === undefined) {
      rt.source = { spec: { kind: 'manual' }, setAtMs: this.#simTimeMs, manualValue: value };
      return;
    }
    const slot = this.#ensureSourceSlot(rt, name);
    rt.namedSources[slot] = { spec: { kind: 'manual' }, setAtMs: this.#simTimeMs, manualValue: value };
  }

  injectFault(req: FaultRequest): string {
    const parsed = faultRequestSchema.parse(req);
    const target = parsed.target;
    const rt = this.#byId.get(target.equipment);
    if (rt === undefined) {
      throw new Error(`PlantEngine: thiết bị ${target.equipment} không tồn tại (PL-E001).`);
    }
    if ('signal' in target) {
      const ch = this.#channelOf(rt, target.signal);
      if (ch === undefined) {
        throw new Error(
          `PlantEngine: role ${target.signal} không khai báo trong model ${rt.model.type} (PL-E001).`,
        );
      }
      if (!SIGNAL_FAULT_KINDS[target.type].includes(ch.kind)) {
        throw new Error(
          `PlantEngine: lỗi ${target.type} không áp dụng cho role kind ${ch.kind} (role ${target.signal}).`,
        );
      }
      if ((target.type === 'stuck' || target.type === 'stuckCmd') && parsed.params !== undefined) {
        const pv = parsed.params['value'];
        if (pv !== undefined) {
          const wantBool = ch.dataType === 'Bool';
          if ((wantBool && typeof pv !== 'boolean') || (!wantBool && typeof pv !== 'number')) {
            throw new Error(
              `PlantEngine: params.value của lỗi ${target.type} phải là ${wantBool ? 'boolean' : 'number'} cho role ${target.signal}.`,
            );
          }
        }
      }
    } else {
      if (!rt.model.faults.some((f) => f.id === target.fault)) {
        throw new Error(
          `PlantEngine: lỗi thiết bị ${target.fault} không khai báo trong model ${rt.model.type} (PL-E001).`,
        );
      }
      const def = rt.model.faults.find((f) => f.id === target.fault);
      if (def?.paramsSchema !== undefined && parsed.params !== undefined) {
        const p = def.paramsSchema.safeParse(parsed.params);
        if (!p.success) {
          throw new Error(
            `PlantEngine: params của lỗi ${target.fault} không hợp lệ: ${p.error.issues.map((i) => i.message).join('; ')}.`,
          );
        }
      }
    }
    return this.#faults.inject(parsed, this.#simTimeMs);
  }

  applyPreset(equipmentId: string, name: string, at?: FaultTiming): string {
    const rt = this.#byId.get(equipmentId);
    if (rt === undefined) throw new Error(`PlantEngine: thiết bị ${equipmentId} không tồn tại (PL-E001).`);
    const preset = rt.model.presets?.[name];
    if (preset === undefined) {
      throw new Error(`PlantEngine: preset ${name} không tồn tại trong model ${rt.model.type} (PL-E001).`);
    }
    const when: FaultTiming = at ?? { at: 'now' };
    if (preset.signalFault !== undefined) {
      return this.injectFault({
        target: {
          equipment: equipmentId,
          signal: preset.signalFault.role,
          type: preset.signalFault.type,
        },
        when,
        params: preset.signalFault.params,
      });
    }
    if (preset.equipmentFault !== undefined) {
      return this.injectFault({
        target: { equipment: equipmentId, fault: preset.equipmentFault.fault },
        when,
        params: preset.equipmentFault.params,
      });
    }
    throw new Error(`PlantEngine: preset ${name} không khai báo lỗi nào.`);
  }

  /**
   * Clear tay một lỗi. `atMs` (tùy chọn): thời điểm clear ghi vào
   * `clearedAtMs` — mặc định là `#simTimeMs` hiện tại của engine. Runner
   * scenario truyền `atMs = T` khi clear trước bước T (P2.4: bảng A cần
   * clearedAtMs đúng 2000, bảng D cần lỗi hết hiệu lực trong bước 3000 —
   * clear sau bước cho clearedAtMs đúng nhưng trễ 1 bước, clear trước
   * bước không `atMs` cho clearedAtMs = T−dt; chỉ `atMs` tường minh thỏa
   * cả hai — xem STATE §27 "Lệch so với plan").
   */
  clearFault(id: string, atMs?: number): boolean {
    return this.#faults.clear(id, atMs ?? this.#simTimeMs);
  }

  listFaults(): FaultInfo[] {
    return this.#faults.list();
  }

  events(): PlantEvent[] {
    return this.#events.entries();
  }
}
