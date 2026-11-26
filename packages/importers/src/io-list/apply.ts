// Áp dụng Suggestion vào cấu hình plant (M2 §9.3, P2.7 commit 5).
// Hàm thuần: `buildApplySuggestions` trả equipment.yaml + tags.yaml mới
// (không ghi file — ghi file ở biên CLI); kiểm tra sau áp dụng bằng
// `validatePlantConfig` NGUYÊN VẸN (mã thực tế, OQ-371 — không đổi mã)
// + safety net `tagsFileSchema` (mirror P2.6 commit).
// - Instance mới: params mặc định model + signals map (OQ-370).
// - Instance đã có: cập nhật signals, GIỮ params/model/source/sources/
//   controller (OQ-370); model khác suggestion → giữ model cũ, validate
//   sau áp dụng từ chối nếu không khớp (lộ ra, không im lặng).
// - Idempotent: apply 2 lần → không đổi (signals merge ổn định, tags
//   sort bằng compareTagDefs, equipment sort theo id).
// - LƯU Ý (OQ-284/287): analog_sensor thiếu engMin/engMax/unit và
//   switch_di thiếu kind trong defaultParams → instance MỚI của 2 model
//   này bị validate từ chối (PL-E001) cho tới khi params được điền tay.
//   Đây là hành vi theo plan (params mặc định + từ chối khi lỗi),
//   ghi lại ở STATE §31 commit 5.

import { stringify as stringifyYaml } from 'yaml';
import {
  diag,
  equipmentFileSchema,
  sortDiagnostics,
  zodIssueParams,
  type Diagnostic,
  type EquipmentInstance,
  type TagDef,
} from '@vcs/schemas';
import {
  defaultRegistry,
  validatePlantConfig,
  type ModelRegistry,
  type PlantConfig,
} from '@vcs/plant';
import { compareTagDefs, safetyNetCheck } from './commit.js';
import type { Suggestion } from './suggest.js';

export interface ApplySuggestionOptions {
  registry?: ModelRegistry;
  /** stepMs cho PlantConfig kiểm tra sau áp dụng (mặc định 100). */
  stepMs?: number;
  /** seed cho PlantConfig kiểm tra sau áp dụng (mặc định 1). */
  seed?: number;
  /** plcScanMs cho PlantConfig (không truyền → bỏ kiểm PL-W001). */
  plcScanMs?: number;
}

export interface SkippedSuggestion {
  equipmentId: string;
  model: string;
  reason: string;
}

export interface ApplySuggestionsResult {
  equipment: EquipmentInstance[];
  tags: TagDef[];
  /** validatePlantConfig + safety net + lỗi skip, đã sort. Có error → CLI từ chối ghi. */
  diagnostics: Diagnostic[];
  /** Id thiết bị đã áp dụng (sort theo id). */
  applied: string[];
  skipped: SkippedSuggestion[];
}

/** Thứ tự role ổn định cho signals map: theo model roles, role lạ xếp sau theo tên. */
function sortSignalRoles(
  signals: Record<string, string>,
  roleOrder: readonly string[],
): Record<string, string> {
  const order = new Map(roleOrder.map((r, i) => [r, i]));
  const out: Record<string, string> = {};
  for (const role of Object.keys(signals).sort((a, b) => {
    const oa = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ob = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a < b ? -1 : a > b ? 1 : 0;
  })) {
    out[role] = signals[role] as string;
  }
  return out;
}

export function buildApplySuggestions(
  oldTags: TagDef[],
  oldEquipment: EquipmentInstance[],
  suggestions: Suggestion[],
  opts: ApplySuggestionOptions = {},
): ApplySuggestionsResult {
  const registry = opts.registry ?? defaultRegistry;
  const stepMs = opts.stepMs ?? 100;
  const seed = opts.seed ?? 1;
  const diagnostics: Diagnostic[] = [];
  const skipped: SkippedSuggestion[] = [];
  const applied: string[] = [];

  const tagByName = new Map(oldTags.map((t) => [t.name.toLowerCase(), t]));
  // Làm việc trên bản sao (không đột biến đầu vào).
  const equipmentById = new Map<string, EquipmentInstance>();
  for (const inst of oldEquipment) {
    equipmentById.set(inst.id, {
      ...inst,
      ...(inst.signals !== undefined ? { signals: { ...inst.signals } } : {}),
    });
  }
  const newTags = new Map<string, TagDef>(oldTags.map((t) => [t.name.toLowerCase(), { ...t }]));

  const ordered = [...suggestions].sort((a, b) =>
    a.equipmentId < b.equipmentId ? -1 : a.equipmentId > b.equipmentId ? 1 : 0,
  );
  for (const suggestion of ordered) {
    if (suggestion.signals.length === 0) {
      skipped.push({
        equipmentId: suggestion.equipmentId,
        model: suggestion.model,
        reason: 'không có tín hiệu nào được gán',
      });
      continue;
    }
    const model = registry.get(suggestion.model);
    if (model === undefined) {
      const reason = `model ${suggestion.model} không tồn tại trong registry`;
      skipped.push({ equipmentId: suggestion.equipmentId, model: suggestion.model, reason });
      diagnostics.push(diag('PL-E001', 'error', `Thiết bị ${suggestion.equipmentId}: ${reason}.`));
      continue;
    }
    // Signals map: chỉ tag tồn tại trong tags.yaml; tag lạ → lỗi TAG-E003
    // (lộ ra, không im lặng) và bỏ tín hiệu đó.
    const newSignals: Record<string, string> = {};
    const missingTags: string[] = [];
    for (const s of suggestion.signals) {
      if (!tagByName.has(s.tag.toLowerCase())) {
        missingTags.push(s.tag);
        continue;
      }
      newSignals[s.role] = s.tag;
    }
    for (const tag of missingTags) {
      diagnostics.push(
        diag('TAG-E003', 'error', `Thiết bị ${suggestion.equipmentId}: tag '${tag}' không tồn tại trong tags.yaml.`),
      );
    }
    const old = equipmentById.get(suggestion.equipmentId);
    if (old === undefined) {
      // Instance mới: params mặc định model + signals map (OQ-370).
      // Controller lấy từ tag đầu tiên (sort theo tên) — cùng controller
      // cho cả nhóm trong thực tế; không tìm được → bỏ qua (optional).
      const firstTag = [...Object.values(newSignals)].sort()[0];
      const controller = firstTag !== undefined ? tagByName.get(firstTag.toLowerCase())?.controller : undefined;
      const inst: EquipmentInstance = {
        id: suggestion.equipmentId,
        model: suggestion.model,
        ...(controller !== undefined ? { controller } : {}),
        params: { ...(model.defaultParams as Record<string, unknown>) },
        signals: sortSignalRoles(newSignals, model.roles.map((r) => r.role)),
      };
      equipmentById.set(inst.id, inst);
    } else {
      // Instance đã có: cập nhật signals, GIỮ params/model/source (OQ-370).
      // Bỏ entry cũ nào dùng tag nay gán sang role khác (tránh 1 tag 2 role);
      // role cũ không bị đụng thì giữ (không xóa việc gán tay).
      const assignedTags = new Set(Object.values(newSignals));
      const merged: Record<string, string> = {};
      for (const [role, tag] of Object.entries(old.signals ?? {})) {
        if (!assignedTags.has(tag)) merged[role] = tag;
      }
      for (const [role, tag] of Object.entries(newSignals)) merged[role] = tag;
      const oldModel = registry.get(old.model);
      old.signals = sortSignalRoles(
        merged,
        oldModel !== undefined ? oldModel.roles.map((r) => r.role) : model.roles.map((r) => r.role),
      );
    }
    applied.push(suggestion.equipmentId);
    // Cập nhật equipment/role trên TagDef cho tín hiệu được áp dụng.
    for (const s of suggestion.signals) {
      const tag = newTags.get(s.tag.toLowerCase());
      if (tag === undefined) continue;
      tag.equipment = suggestion.equipmentId;
      tag.role = s.role;
    }
  }

  const equipment = [...equipmentById.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const tags = [...newTags.values()].sort(compareTagDefs);

  // Kiểm tra sau áp dụng (OQ-371): validatePlantConfig nguyên vẹn.
  const cfg: PlantConfig = {
    stepMs,
    seed,
    equipment,
    tags: new Map(tags.map((t) => [t.name, t])),
    ...(opts.plcScanMs !== undefined ? { plcScanMs: opts.plcScanMs } : {}),
  };
  diagnostics.push(...validatePlantConfig(cfg, cfg.tags, registry));
  diagnostics.push(...safetyNetCheck(tags));
  const parsedEquipment = equipmentFileSchema.safeParse(equipment);
  if (!parsedEquipment.success) {
    for (const issue of parsedEquipment.error.issues) {
      const params = zodIssueParams(issue);
      diagnostics.push(
        diag(params.diagnosticCode ?? 'PRJ-E003', 'error', issue.message, {
          file: 'plant/equipment.yaml',
        }),
      );
    }
  }
  return {
    equipment,
    tags,
    diagnostics: sortDiagnostics(diagnostics),
    applied: [...applied].sort(),
    skipped,
  };
}

/** Dump danh sách thiết bị thành YAML (mảng top-level, như ví dụ P2.4). */
export function serializeEquipment(equipment: EquipmentInstance[]): string {
  return stringifyYaml(equipment);
}
