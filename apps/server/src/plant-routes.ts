// REST API suggest/tags/models/equipment cho Plant Designer (P2.8 commit 5,
// M2 §10.3) — tái dùng đúng hàm thuần P2.6/P2.7, không đổi pipeline.
// - POST /api/suggest: chạy suggest() trên tags.yaml đã commit của project.
// - POST /api/suggest/apply: áp dụng gợi ý đã duyệt (onlyConfident → chỉ
//   status confident, mirror CLI --accept-confident); auto-fill OQ-392:
//   engMin/engMax/unit của instance mới lấy từ scaling của tag AI khi có;
//   không có scaling (hoặc switch_di thiếu kind) → validate từ chối (400).
// - POST /api/suggest/role-override: học roleOverrides vào plant/naming.yaml
//   (UI hỏi trước khi gọi — OQ-397; endpoint chỉ ghi khi được gọi).
// - GET/POST /api/tags: đọc/ghi tags.yaml trên đĩa (OQ-385, safety net).
// - GET /api/plant/models: metadata model cho form Designer (OQ-386).
// - GET /api/plant/equipment: equipment.yaml trên đĩa (file-backed, đọc lại
//   mỗi lần — nguồn params cho tab Equipment sau apply, không cần restart;
//   GET /api/project chỉ là snapshot lúc khởi động nên cũ sau apply).
// - POST /api/plant/equipment: lưu equipment.yaml (validate trước khi ghi).
// Không hot reload (OQ-384): file ghi xong, sim đang chạy giữ bản cũ cho
// tới khi restart server — UI hiện banner (commit 6).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { loadProject, nodeFS, type ProjectModel } from '@vcs/project';
import {
  diag,
  equipmentFileSchema,
  hasErrors,
  namingConventionSchema,
  sortDiagnostics,
  zodIssueParams,
  type Diagnostic,
  type EquipmentInstance,
  type NamingConvention,
  type TagDef,
} from '@vcs/schemas';
import {
  buildApplySuggestions,
  loadNamingConvention,
  NamingConventionError,
  safetyNetCheck,
  serializeEquipment,
  serializeTags,
  suggest,
  tagDefsToInputs,
  type Suggestion,
} from '@vcs/importers';
import {
  defaultRegistry,
  validatePlantConfig,
  type PlantConfig,
} from '@vcs/plant';
import { describeParams, type ParamField } from './zod-describe.js';

export interface ModelInfo {
  model: string;
  version: string;
  description: string;
  roles: Array<{
    role: string;
    kind: string;
    dataType: string;
    unit?: string;
    optional: boolean;
    description: string;
    synonyms: string[];
  }>;
  params: ParamField[];
  faults: Array<{ id: string; description: string }>;
  presets: Array<{
    name: string;
    description: string;
    signalFault?: { role: string; type: string; params?: Record<string, unknown> };
    equipmentFault?: { fault: string; params?: Record<string, unknown> };
  }>;
  observables: Array<{ key: string; unit?: string; description: string }>;
  hasSource: boolean;
}

export interface AutoFilledParam {
  equipment: string;
  params: Record<string, unknown>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function errorReply(reply: FastifyReply, status: number, error: string, diagnostics?: Diagnostic[]): unknown {
  return reply.status(status).send(
    diagnostics === undefined ? { error } : { error, diagnostics },
  );
}

async function writeProjectFile(projectDir: string, rel: string, content: string): Promise<void> {
  const abs = join(projectDir, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf8');
}

async function loadModel(
  dir: string,
): Promise<
  | { ok: true; model: ProjectModel }
  | { ok: false; error: string; diagnostics: Diagnostic[] }
> {
  const model = await loadProject(nodeFS(dir));
  if (!model.valid) {
    return { ok: false, error: 'dự án không hợp lệ', diagnostics: [...model.diagnostics] };
  }
  return { ok: true, model };
}

/** Metadata toàn bộ model trong registry cho form Designer (OQ-386). */
export function describeModels(): ModelInfo[] {
  return defaultRegistry.list().map((type) => {
    const model = defaultRegistry.get(type);
    if (model === undefined) throw new Error(`Model ${type} không có trong registry.`);
    return {
      model: model.type,
      version: model.version,
      description: model.description,
      roles: model.roles.map((r) => {
        const out: ModelInfo['roles'][number] = {
          role: r.role,
          kind: r.kind,
          dataType: r.dataType,
          optional: r.optional === true,
          description: r.description,
          synonyms: [...r.synonyms],
        };
        if (r.unit !== undefined) out.unit = r.unit;
        return out;
      }),
      params: describeParams(
        model.paramsSchema,
        model.defaultParams as Record<string, unknown>,
      ),
      faults: model.faults.map((f) => ({ id: f.id, description: f.description })),
      presets: Object.entries(model.presets ?? {}).map(([name, p]) => {
        const out: ModelInfo['presets'][number] = { name, description: p.description };
        if (p.signalFault !== undefined) {
          out.signalFault = {
            role: p.signalFault.role,
            type: p.signalFault.type,
            ...(p.signalFault.params !== undefined ? { params: p.signalFault.params } : {}),
          };
        }
        if (p.equipmentFault !== undefined) {
          out.equipmentFault = {
            fault: p.equipmentFault.fault,
            ...(p.equipmentFault.params !== undefined ? { params: p.equipmentFault.params } : {}),
          };
        }
        return out;
      }),
      observables: model.observables.map((o) => {
        const out: ModelInfo['observables'][number] = { key: o.key, description: o.description };
        if (o.unit !== undefined) out.unit = o.unit;
        return out;
      }),
      hasSource: model.hasSource === true,
    };
  });
}

/**
 * Auto-fill OQ-392 (thuần): instance MỚI thiếu engMin/engMax/unit → lấy từ
 * scaling của tag AI mà instance đó gán (role kind AI). Chỉ chạm instance
 * mới (id không có trong oldEquipmentIds) — instance đã có giữ params tay
 * (OQ-370). switch_di `kind` không có nguồn auto-fill → để trống, validate
 * sau đó từ chối. Trả equipment đã fill (bản sao) + danh sách đã fill để UI
 * hiện minh bạch.
 */
export function autoFillParams(
  equipment: EquipmentInstance[],
  tags: TagDef[],
  oldEquipmentIds: ReadonlySet<string>,
): { equipment: EquipmentInstance[]; filled: AutoFilledParam[] } {
  const tagByName = new Map(tags.map((t) => [t.name.toLowerCase(), t]));
  const filled: AutoFilledParam[] = [];
  const out = equipment.map((inst) => {
    if (oldEquipmentIds.has(inst.id)) return inst;
    const model = defaultRegistry.get(inst.model);
    if (model === undefined) return inst;
    const params: Record<string, unknown> = { ...(inst.params ?? {}) };
    const added: Record<string, unknown> = {};
    for (const key of ['engMin', 'engMax', 'unit'] as const) {
      if (params[key] !== undefined) continue;
      for (const [role, tagName] of Object.entries(inst.signals ?? {})) {
        const roleDef = model.roles.find((r) => r.role === role);
        if (roleDef?.kind !== 'AI') continue;
        const scaling = tagByName.get(tagName.toLowerCase())?.signal?.scaling;
        if (scaling === undefined) continue;
        params[key] = scaling[key];
        added[key] = scaling[key];
        break;
      }
    }
    if (Object.keys(added).length === 0) return inst;
    filled.push({ equipment: inst.id, params: added });
    return { ...inst, params };
  });
  return { equipment: out, filled };
}

/**
 * Trừ multiset diagnostics: bỏ khỏi `all` đúng số lần mỗi diagnostic
 * xuất hiện trong `stale` (khớp code + message + vị trí). Dùng để loại
 * diagnostics validate cũ (trên equipment chưa fill) khi đã validate lại
 * trên equipment đã fill — tránh báo lỗi đã được auto-fill sửa.
 */
export function subtractDiagnostics(all: Diagnostic[], stale: Diagnostic[]): Diagnostic[] {
  const keyOf = (d: Diagnostic): string =>
    JSON.stringify([
      d.code,
      d.severity,
      d.message,
      d.file ?? '',
      d.line ?? null,
      d.col ?? null,
    ]);
  const counts = new Map<string, number>();
  for (const d of stale) counts.set(keyOf(d), (counts.get(keyOf(d)) ?? 0) + 1);
  const out: Diagnostic[] = [];
  for (const d of all) {
    const k = keyOf(d);
    const n = counts.get(k) ?? 0;
    if (n > 0) {
      counts.set(k, n - 1);
      continue;
    }
    out.push(d);
  }
  return out;
}

/** Diagnostics của equipmentFileSchema (mirror apply.ts). */
function equipmentSchemaDiagnostics(equipment: EquipmentInstance[]): Diagnostic[] {
  const parsed = equipmentFileSchema.safeParse(equipment);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const params = zodIssueParams(issue);
    return diag(params.diagnosticCode ?? 'PRJ-E003', 'error', issue.message, {
      file: 'plant/equipment.yaml',
    });
  });
}

/**
 * Validate đầy đủ một bộ equipment + tags (như buildApplySuggestions làm
 * sau áp dụng): validatePlantConfig + safety net + equipment schema.
 */
function validateAppliedEquipment(
  equipment: EquipmentInstance[],
  tags: TagDef[],
  stepMs: number,
  seed: number,
  // plcScanMs luôn có số sau transform của project schema (mặc định =
  // stepMs khi project không khai báo) — không optional ở đây.
  plcScanMs: number,
): Diagnostic[] {
  const cfg: PlantConfig = {
    stepMs,
    seed,
    equipment,
    tags: new Map(tags.map((t) => [t.name, t])),
    plcScanMs,
  };
  return sortDiagnostics([
    ...validatePlantConfig(cfg, cfg.tags),
    ...safetyNetCheck(tags),
    ...equipmentSchemaDiagnostics(equipment),
  ]);
}

/** Parse tối thiểu một Suggestion từ body (chỉ các field apply dùng +
 *  status cho onlyConfident; field khác thiếu → mặc định an toàn). */
function parseSuggestion(v: unknown): Suggestion | string {
  if (!isRecord(v)) return 'suggestion phải là object';
  const equipmentId = v['equipmentId'];
  const model = v['model'];
  if (typeof equipmentId !== 'string' || equipmentId === '') {
    return 'suggestion.equipmentId phải là string không rỗng';
  }
  if (typeof model !== 'string' || model === '') {
    return 'suggestion.model phải là string không rỗng';
  }
  const signalsRaw = v['signals'];
  if (!Array.isArray(signalsRaw)) return 'suggestion.signals phải là mảng';
  const signals: Suggestion['signals'] = [];
  for (const s of signalsRaw) {
    if (!isRecord(s) || typeof s['tag'] !== 'string' || typeof s['role'] !== 'string') {
      return 'suggestion.signals[] phải có tag + role là string';
    }
    signals.push({
      tag: s['tag'],
      role: s['role'],
      confidence: typeof s['confidence'] === 'number' ? s['confidence'] : 0,
      reasons: Array.isArray(s['reasons'])
        ? s['reasons'].filter((r): r is string => typeof r === 'string')
        : [],
      row: typeof s['row'] === 'number' ? s['row'] : 0,
    });
  }
  const status = v['status'];
  if (
    status !== undefined &&
    status !== 'confident' &&
    status !== 'review' &&
    status !== 'unmatched'
  ) {
    return "suggestion.status phải là 'confident' | 'review' | 'unmatched'";
  }
  return {
    equipmentId,
    model,
    confidence: typeof v['confidence'] === 'number' ? v['confidence'] : 0,
    signals,
    missingRequiredRoles: Array.isArray(v['missingRequiredRoles'])
      ? v['missingRequiredRoles'].filter((r): r is string => typeof r === 'string')
      : [],
    unusedOptionalRoles: Array.isArray(v['unusedOptionalRoles'])
      ? v['unusedOptionalRoles'].filter((r): r is string => typeof r === 'string')
      : [],
    status: status === undefined ? 'review' : status,
  };
}

export function registerPlantRoutes(fastify: FastifyInstance, projectDir: string): void {
  // Chạy suggest trên tags.yaml đã commit của project (P2.7 §9.1).
  fastify.post('/api/suggest', async (_req, reply) => {
    const loaded = await loadModel(projectDir);
    if (!loaded.ok) {
      return reply.status(400).send({ error: loaded.error, diagnostics: loaded.diagnostics });
    }
    let naming;
    try {
      naming = await loadNamingConvention(projectDir);
    } catch (err) {
      if (err instanceof NamingConventionError) {
        return errorReply(reply, 400, err.message);
      }
      throw err;
    }
    const result = suggest(tagDefsToInputs(loaded.model.tags), naming.convention);
    return {
      ...result,
      naming: {
        usedDefault: naming.usedDefault,
        ...(naming.warning !== undefined ? { warning: naming.warning } : {}),
      },
    };
  });

  // Áp dụng gợi ý đã duyệt (mirror CLI `vcs suggest --accept-confident`).
  fastify.post('/api/suggest/apply', async (req, reply) => {
    const loaded = await loadModel(projectDir);
    if (!loaded.ok) {
      return reply.status(400).send({ error: loaded.error, diagnostics: loaded.diagnostics });
    }
    const model = loaded.model;
    const body: unknown = req.body;
    if (!isRecord(body) || !Array.isArray(body['accepted'])) {
      return errorReply(reply, 400, 'accepted phải là mảng Suggestion');
    }
    const onlyConfidentRaw = body['onlyConfident'];
    if (onlyConfidentRaw !== undefined && typeof onlyConfidentRaw !== 'boolean') {
      return errorReply(reply, 400, 'onlyConfident phải là boolean');
    }
    const suggestions: Suggestion[] = [];
    for (const s of body['accepted'] as unknown[]) {
      const parsed = parseSuggestion(s);
      if (typeof parsed === 'string') return errorReply(reply, 400, parsed);
      suggestions.push(parsed);
    }
    const toApply =
      onlyConfidentRaw === true
        ? suggestions.filter((s) => s.status === 'confident')
        : suggestions;
    if (toApply.length === 0) {
      return { applied: [], skipped: [], filesWritten: [], diagnostics: [], autoFilled: [] };
    }
    const stepMs = model.config.simulation.stepMs;
    const seed = model.config.seed;
    const plcScanMs = model.config.simulation.plcScanMs;
    const appliedResult = buildApplySuggestions(model.tags, model.plant ?? [], toApply, {
      stepMs,
      seed,
      plcScanMs,
    });
    // OQ-392: auto-fill params từ scaling của tag rồi validate LẠI; lỗi
    // validate cũ đã được fill sửa thì trừ khỏi diagnostics trả về.
    const oldIds = new Set((model.plant ?? []).map((e) => e.id));
    const { equipment: filledEquipment, filled } = autoFillParams(
      appliedResult.equipment,
      appliedResult.tags,
      oldIds,
    );
    const fresh = validateAppliedEquipment(
      filledEquipment,
      appliedResult.tags,
      stepMs,
      seed,
      plcScanMs,
    );
    const stale = validateAppliedEquipment(
      appliedResult.equipment,
      appliedResult.tags,
      stepMs,
      seed,
      plcScanMs,
    );
    const diagnostics = sortDiagnostics([
      ...subtractDiagnostics(appliedResult.diagnostics, stale),
      ...fresh,
    ]);
    if (hasErrors(diagnostics)) {
      return reply.status(400).send({
        error: 'apply bị từ chối — sửa lỗi rồi chạy lại (không ghi file)',
        diagnostics,
      });
    }
    const tagsRel = model.config.files.tags;
    const plantRel = model.config.files.plant;
    await writeProjectFile(projectDir, tagsRel, serializeTags(appliedResult.tags));
    await writeProjectFile(projectDir, plantRel, serializeEquipment(filledEquipment));
    return {
      applied: appliedResult.applied,
      skipped: appliedResult.skipped,
      filesWritten: [tagsRel, plantRel],
      diagnostics,
      autoFilled: filled,
    };
  });

  // Học roleOverrides (OQ-397): ghi token → role vào plant/naming.yaml.
  // Ghi đè toàn file bằng dump đã validate schema — comment tay trong file
  // (nếu có) sẽ mất ở lần học đầu tiên (cùng cách serializeTags ghi
  // tags.yaml ở P2.6).
  fastify.post('/api/suggest/role-override', async (req, reply) => {
    const body: unknown = req.body;
    if (
      !isRecord(body) ||
      typeof body['token'] !== 'string' ||
      body['token'] === '' ||
      typeof body['role'] !== 'string' ||
      body['role'] === ''
    ) {
      return errorReply(reply, 400, 'token và role phải là string không rỗng');
    }
    const { token, role } = body;
    const roleExists = defaultRegistry
      .list()
      .some((type) => defaultRegistry.get(type)?.roles.some((r) => r.role === role) === true);
    if (!roleExists) {
      return errorReply(reply, 400, `role '${role}' không tồn tại trong model nào`);
    }
    let convention: NamingConvention;
    try {
      convention = (await loadNamingConvention(projectDir)).convention;
    } catch (err) {
      if (err instanceof NamingConventionError) {
        return errorReply(reply, 400, err.message);
      }
      throw err;
    }
    const updated: NamingConvention = {
      ...convention,
      roleOverrides: { ...convention.roleOverrides, [token]: role },
    };
    const parsed = namingConventionSchema.safeParse(updated);
    if (!parsed.success) {
      return errorReply(
        reply,
        400,
        `naming.yaml sau khi thêm override không hợp lệ: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    await mkdir(join(projectDir, 'plant'), { recursive: true });
    await writeFile(
      join(projectDir, 'plant', 'naming.yaml'),
      stringifyYaml(parsed.data),
      'utf8',
    );
    return { token, role, file: 'plant/naming.yaml' };
  });

  // Tag Manager đọc tags.yaml từ đĩa (OQ-385).
  fastify.get('/api/tags', async (_req, reply) => {
    const loaded = await loadModel(projectDir);
    if (!loaded.ok) {
      return reply.status(400).send({ error: loaded.error, diagnostics: loaded.diagnostics });
    }
    return { tags: loaded.model.tags };
  });

  // Sửa ô equipment/role của một tag (ghi tags.yaml qua safety net).
  fastify.post('/api/tags', async (req, reply) => {
    const loaded = await loadModel(projectDir);
    if (!loaded.ok) {
      return reply.status(400).send({ error: loaded.error, diagnostics: loaded.diagnostics });
    }
    const model = loaded.model;
    const body: unknown = req.body;
    if (!isRecord(body) || typeof body['name'] !== 'string' || body['name'] === '') {
      return errorReply(reply, 400, 'name phải là string không rỗng');
    }
    const equipment = body['equipment'];
    const role = body['role'];
    for (const [key, v] of [
      ['equipment', equipment],
      ['role', role],
    ] as const) {
      if (v !== undefined && v !== null && typeof v !== 'string') {
        return errorReply(reply, 400, `${key} phải là string hoặc null (null = xóa)`);
      }
      if (typeof v === 'string' && v === '') {
        return errorReply(reply, 400, `${key} rỗng — gửi null để xóa thay vì chuỗi rỗng`);
      }
    }
    const name = body['name'];
    const idx = model.tags.findIndex((t) => t.name.toLowerCase() === name.toLowerCase());
    if (idx === -1) {
      return errorReply(reply, 400, `tag '${name}' không tồn tại`);
    }
    const newTags = model.tags.map((t) => ({ ...t }));
    const tag = newTags[idx] as TagDef;
    if (equipment === null) delete tag.equipment;
    else if (typeof equipment === 'string') tag.equipment = equipment;
    if (role === null) delete tag.role;
    else if (typeof role === 'string') tag.role = role;
    const netDiags = safetyNetCheck(newTags);
    if (hasErrors(netDiags)) {
      return reply.status(400).send({
        error: 'safety net từ chối danh sách tag mới (xem diagnostics)',
        diagnostics: netDiags,
      });
    }
    await writeProjectFile(projectDir, model.config.files.tags, serializeTags(newTags));
    return { tag };
  });

  // Metadata model cho form Designer (OQ-386).
  fastify.get('/api/plant/models', () => ({ models: describeModels() }));

  // Equipment trên đĩa cho tab Equipment (OQ-386): file-backed, đọc lại mỗi
  // lần gọi — đúng ngay sau apply mà không cần restart (OQ-384).
  fastify.get('/api/plant/equipment', async (_req, reply) => {
    const loaded = await loadModel(projectDir);
    if (!loaded.ok) {
      return reply.status(400).send({ error: loaded.error, diagnostics: loaded.diagnostics });
    }
    return { equipment: loaded.model.plant ?? [] };
  });

  // Lưu equipment.yaml từ tab Equipment (validate trước khi ghi).
  fastify.post('/api/plant/equipment', async (req, reply) => {
    const loaded = await loadModel(projectDir);
    if (!loaded.ok) {
      return reply.status(400).send({ error: loaded.error, diagnostics: loaded.diagnostics });
    }
    const model = loaded.model;
    const body: unknown = req.body;
    if (!isRecord(body) || !Array.isArray(body['equipment'])) {
      return errorReply(reply, 400, 'equipment phải là mảng EquipmentInstance');
    }
    const parsed = equipmentFileSchema.safeParse(body['equipment']);
    if (!parsed.success) {
      const diagnostics = parsed.error.issues.map((issue) => {
        const params = zodIssueParams(issue);
        return diag(params.diagnosticCode ?? 'PRJ-E003', 'error', issue.message, {
          file: 'plant/equipment.yaml',
        });
      });
      return reply.status(400).send({ error: 'equipment không hợp lệ', diagnostics });
    }
    const stepMs = model.config.simulation.stepMs;
    const seed = model.config.seed;
    const plcScanMs = model.config.simulation.plcScanMs;
    const cfg: PlantConfig = {
      stepMs,
      seed,
      equipment: parsed.data,
      tags: new Map(model.tags.map((t) => [t.name, t])),
      plcScanMs,
    };
    const diags = validatePlantConfig(cfg, cfg.tags);
    if (hasErrors(diags)) {
      return reply.status(400).send({
        error: 'equipment không hợp lệ — sửa lỗi rồi lưu lại (không ghi file)',
        diagnostics: diags,
      });
    }
    await writeProjectFile(
      projectDir,
      model.config.files.plant,
      serializeEquipment(parsed.data),
    );
    return { equipment: parsed.data, filesWritten: [model.config.files.plant] };
  });
}
