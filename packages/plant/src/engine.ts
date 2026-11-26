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
  type ModelRegistry,
  type RoleDef,
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

interface RuntimeEquipment {
  id: string;
  model: EquipmentModel;
  params: Record<string, unknown>;
  state: unknown;
  rng: RngState;
  obs: Record<string, number | boolean | string>;
  source: SourceRuntime | undefined;
  sourceValue: number | boolean;
  /** Named sources (OQ-290): tên → runtime + giá trị đã resolve mỗi bước. */
  namedSources: Map<string, SourceRuntime>;
  namedSourceValues: Map<string, number | boolean>;
  handles: Map<string, TagHandle>;
  roles: Map<string, RoleDef>;
  ranges: Map<string, Range>;
  /** Key `${id}:${role}` tính trước ở init (OQ-267: #emit khỏi nối chuỗi mỗi lần gọi). */
  emitKeys: Map<string, string>;
  pendingObs: Map<string, { from: unknown; to: number | boolean | string }>;
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
    const v = this.#lastEmit.get(`${equipmentId}:${role}`);
    if (v !== undefined) return v;
    const rt = this.#byId.get(equipmentId);
    const kind = rt?.roles.get(role)?.kind;
    if (kind === 'DI' || kind === 'DO') return false;
    if (kind === 'AI' || kind === 'AO') return 0;
    return undefined;
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
      const roles = new Map(model.roles.map((r) => [r.role, r]));
      const handles = new Map<string, TagHandle>();
      const ranges = new Map<string, Range>();
      for (const role of model.roles) {
        const tagName = inst.signals?.[role.role];
        if (tagName === undefined) continue;
        const def = cfg.tags.get(tagName) as TagDef;
        const h = this.#tags.handle(tagName);
        if (h === undefined) {
          throw new Error(`PlantEngine: tag ${tagName} không tồn tại trong TagDB (TAG-E003).`);
        }
        handles.set(role.role, h);
        if (role.kind === 'DI' || role.kind === 'AI') {
          this.#tags.setOwner(h, 'plant');
        }
        if ((role.kind === 'AI' || role.kind === 'AO') && role.dataType !== 'Real') {
          const range = resolveRange(params, def.signal?.scaling, role.unit);
          if (range !== undefined) ranges.set(role.role, range);
        }
      }
      let source: SourceRuntime | undefined;
      if (model.hasSource === true) {
        const spec: SourceSpec = inst.source ?? { kind: 'const', value: 0 };
        source = { spec, setAtMs: 0, manualValue: 0 };
      }
      const namedSources = new Map<string, SourceRuntime>();
      for (const [name, spec] of Object.entries(inst.sources ?? {})) {
        namedSources.set(name, { spec, setAtMs: 0, manualValue: 0 });
      }
      const rt: RuntimeEquipment = {
        id,
        model,
        params,
        state,
        rng,
        obs: {},
        source,
        sourceValue: 0,
        namedSources,
        namedSourceValues: new Map(),
        handles,
        roles,
        ranges,
        emitKeys: new Map(model.roles.map((r) => [r.role, `${id}:${r.role}`])),
        pendingObs: new Map(),
      };
      const ctx: StepCtx = {
        dtMs: cfg.stepMs,
        simTimeMs: 0,
        params: rt.params,
        state: rt.state,
        cmd: (role) => this.#cmd(rt, role),
        has: (role) => rt.handles.has(role),
        emit: (role, v) => { this.#emit(rt, role, v); },
        fault: (fid) => this.#faults.equipmentFault(rt.id, fid),
        source: (name?: string) =>
          name === undefined ? rt.sourceValue : (rt.namedSourceValues.get(name) ?? 0),
        // OQ-294: phân biệt named source đã cấu hình với chưa cấu hình
        // (source() trả 0 cho cả hai trường hợp).
        hasSource: (name?: string) =>
          name === undefined ? rt.source !== undefined : rt.namedSources.has(name),
        rand: () => rngNext(rt.rng),
        setObs: (key, v) => {
          const prev = rt.obs[key];
          if (prev === v) return;
          // Gán lần đầu (chưa có giá trị trước) là baseline, không phải thay đổi.
          if (prev !== undefined) {
            const pending = rt.pendingObs.get(key);
            if (pending === undefined) rt.pendingObs.set(key, { from: prev, to: v });
            else pending.to = v;
          }
          rt.obs[key] = v;
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
  }

  #getObs(equipmentId: string, key: string): number | boolean | string | undefined {
    return this.#byId.get(equipmentId)?.obs[key];
  }

  #cmd(rt: RuntimeEquipment, role: string): boolean | number | undefined {
    const h = rt.handles.get(role);
    if (h === undefined) return undefined;
    const roleDef = rt.roles.get(role) as RoleDef;
    const kind = roleDef.kind;
    let v: number | boolean;
    if (kind === 'DO') {
      v = this.#tags.get(h) === true;
    } else {
      const raw = this.#tags.get(h);
      if (typeof raw !== 'number') return undefined;
      if (roleDef.dataType === 'Real') {
        v = Math.fround(raw);
      } else {
        const range = rt.ranges.get(role);
        v = range !== undefined ? rawToEng(raw, range) : raw;
      }
    }
    return this.#faults.applyCmd(rt.id, role, kind, v);
  }

  #emit(rt: RuntimeEquipment, role: string, v: boolean | number): void {
    const h = rt.handles.get(role);
    if (h === undefined) return;
    const roleDef = rt.roles.get(role) as RoleDef;
    const kind = roleDef.kind;
    const key = rt.emitKeys.get(role) ?? `${rt.id}:${role}`;
    const result = this.#faults.applyEmit(rt.id, role, kind, v, this.#simTimeMs, this.#cfg.stepMs, rt.rng);
    if ('rawOverride' in result) {
      if (roleDef.dataType === 'Real') {
        const range = rt.ranges.get(role);
        const eng = range !== undefined ? rawToEng(result.rawOverride, range) : result.rawOverride;
        this.#tags.set(h, Math.fround(eng), 'plant');
        this.#lastEmit.set(key, eng);
      } else {
        this.#tags.set(h, result.rawOverride, 'plant');
        const range = rt.ranges.get(role);
        this.#lastEmit.set(key, range !== undefined ? rawToEng(result.rawOverride, range) : result.rawOverride);
      }
      return;
    }
    const out = result.value;
    if (kind === 'DI') {
      this.#tags.set(h, out === true, 'plant');
      this.#lastEmit.set(key, out === true);
    } else if (roleDef.dataType === 'Real') {
      const eng = Math.fround(out as number);
      this.#tags.set(h, eng, 'plant');
      this.#lastEmit.set(key, eng);
    } else {
      const range = rt.ranges.get(role);
      this.#tags.set(h, range !== undefined ? engToRaw(out as number, range) : Math.round(out as number), 'plant');
      this.#lastEmit.set(key, out);
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
    for (const rt of this.#order) {
      if (rt.source !== undefined) {
        rt.sourceValue = evalSource(
          rt.source.spec,
          T,
          rt.source.setAtMs,
          rt.source.manualValue,
          this.#getObsBound,
        );
      }
      for (const [name, ns] of rt.namedSources) {
        rt.namedSourceValues.set(
          name,
          evalSource(ns.spec, T, ns.setAtMs, ns.manualValue, this.#getObsBound),
        );
      }
      const ctx = this.#ctxs.get(rt.id);
      if (ctx === undefined) continue;
      ctx.dtMs = dtMs;
      ctx.simTimeMs = T;
      rt.model.step(ctx);
      for (const [key, change] of rt.pendingObs) {
        if (change.from !== change.to) {
          this.#events.push({ t: T, type: 'state', equipment: rt.id, key, from: change.from, to: change.to });
        }
      }
      rt.pendingObs.clear();
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
        const entry: PlantSnapshot['equipment'][number] = {
          id: rt.id,
          // P2.2: state PHẢI deep-copy — model mutate state tại chỗ mỗi bước
          // nên giữ reference sẽ làm snapshot "trôi" theo (restore không tua
          // được về thời điểm snapshot; motor_dol STARTING → RUNNING).
          // S là JSON-serializable theo hợp đồng (PACKAGE-RULES §plant).
          state: structuredClone(rt.state),
          rng: { ...rt.rng },
          obs: { ...rt.obs },
          source: rt.source !== undefined ? { ...rt.source, spec: { ...rt.source.spec } } : null,
          sourceValue: rt.sourceValue,
          namedSources: Object.fromEntries(
            [...rt.namedSources.entries()].map(([name, ns]) => [
              name,
              { ...ns, spec: { ...ns.spec } },
            ]),
          ),
          namedSourceValues: Object.fromEntries(rt.namedSourceValues.entries()),
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
      rt.obs = { ...es.obs };
      rt.pendingObs.clear();
      rt.source = es.source ?? undefined;
      rt.sourceValue = es.sourceValue;
      rt.namedSources = new Map(
        Object.entries(es.namedSources ?? {}).map(([name, ns]) => [
          name,
          { ...ns, spec: { ...ns.spec } },
        ]),
      );
      rt.namedSourceValues = new Map(Object.entries(es.namedSourceValues ?? {}));
    }
    this.#faults.restore(snap.faults);
    this.#lastEmit = new Map(snap.lastEmit);
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
    if (!rt.model.observables.some((o) => o.key === key)) {
      throw new Error(`PlantEngine: observable ${key} không khai báo trong model ${rt.model.type}.`);
    }
    return rt.obs[key];
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
    const prev = rt.namedSources.get(name);
    rt.namedSources.set(name, {
      spec: parsed,
      setAtMs: this.#simTimeMs,
      manualValue: prev?.manualValue ?? 0,
    });
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
    rt.namedSources.set(name, { spec: { kind: 'manual' }, setAtMs: this.#simTimeMs, manualValue: value });
  }

  injectFault(req: FaultRequest): string {
    const parsed = faultRequestSchema.parse(req);
    const target = parsed.target;
    const rt = this.#byId.get(target.equipment);
    if (rt === undefined) {
      throw new Error(`PlantEngine: thiết bị ${target.equipment} không tồn tại (PL-E001).`);
    }
    if ('signal' in target) {
      const role = rt.roles.get(target.signal);
      if (role === undefined) {
        throw new Error(
          `PlantEngine: role ${target.signal} không khai báo trong model ${rt.model.type} (PL-E001).`,
        );
      }
      if (!SIGNAL_FAULT_KINDS[target.type].includes(role.kind)) {
        throw new Error(
          `PlantEngine: lỗi ${target.type} không áp dụng cho role kind ${role.kind} (role ${target.signal}).`,
        );
      }
      if ((target.type === 'stuck' || target.type === 'stuckCmd') && parsed.params !== undefined) {
        const pv = parsed.params['value'];
        if (pv !== undefined) {
          const wantBool = role.dataType === 'Bool';
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
      throw new Error(`PlantEngine: preset ${name} không tồn tại trong model ${rt.model.type}.`);
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

  clearFault(id: string): boolean {
    return this.#faults.clear(id, this.#simTimeMs);
  }

  listFaults(): FaultInfo[] {
    return this.#faults.list();
  }

  events(): PlantEvent[] {
    return this.#events.entries();
  }
}
