// Client fetch typed cho API import/suggest/tags (P2.8 commit 6, M2 §10.1).
// Thuần (fetch tiêm vào được) — web không import `@vcs/importers` (đồ thị
// phụ thuộc cấm) nên các kiểu response khai báo lại theo đúng JSON server
// trả (chỉ các field UI dùng). Lỗi HTTP → ImportApiError (status + error +
// diagnostics để UI hiện); 410 = session hết hạn (OQ-382).

import type { Diagnostic } from '@vcs/schemas';
import type { TagMeta } from '../tag-manager.js';

export type CellValue = string | number | boolean | null;

export interface SessionCreateResult {
  sessionId: string;
  sheets: string[];
  detectedSheet: string | null;
}

/** Shape wire server trả cho POST /api/import/session (commit 3):
 *  sheets là object {name,rowCount,columnCount}, không phải string. */
interface SessionCreateWire {
  sessionId: string;
  sheets: Array<{ name: string; rowCount: number; columnCount: number }>;
  detectedSheet: string | null;
}

export interface SheetResult {
  sheet: string | null;
  headerRow: number | null;
  firstDataRow: number | null;
  columns: string[];
  preview: CellValue[][];
  totalRows: number;
}

/** Shape wire server trả cho POST .../sheet (commit 3): xem trước tên
 *  `preview50`, không phải `preview`. */
interface SheetWire {
  sheet: string | null;
  headerRow: number | null;
  firstDataRow: number | null;
  columns: string[];
  preview50: CellValue[][];
  totalRows: number;
}

export interface MappingSuggestion {
  field: string;
  column: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export type ImportRecord = Record<string, CellValue>;

export interface MappingResult {
  mapping: Record<string, string>;
  suggestions: MappingSuggestion[];
  profile: { name: string };
  records: ImportRecord[];
  totalRows: number;
  changed: unknown[];
}

export interface ValidateStats {
  records: number;
  errors: number;
  warnings: number;
  infos: number;
  diagnosticsByCode: Record<string, number>;
}

export interface ValidateResult {
  diagnostics: Diagnostic[];
  stats: ValidateStats;
  acceptedCleanRows: number[];
}

/** Diff wire = DiffResult của @vcs/importers (packages/importers/src/io-list/diff.ts):
 *  changed là TagChange {tag, field, old, next}; renamedCandidates {from, to, address};
 *  skippedManual là SkippedManual {tag, fields, reason}. */
export interface DiffResult {
  added: string[];
  removed: string[];
  changed: Array<{ tag: string; field: string; old: unknown; next: unknown }>;
  unchanged: string[];
  renamedCandidates: Array<{ from: string; to: string; address: string }>;
  skippedManual: Array<{ tag: string; fields: string[]; reason: 'changed' | 'removed' }>;
}

export interface CommitResult {
  filesWritten: string[];
  report: { json: string; html: string };
  diff: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
    skippedManual: number;
    renamedCandidates: number;
  };
  commit: { applied: boolean };
}

export class ImportApiError extends Error {
  readonly status: number;
  readonly diagnostics?: Diagnostic[];

  constructor(status: number, message: string, diagnostics?: Diagnostic[]) {
    super(message);
    this.name = 'ImportApiError';
    this.status = status;
    if (diagnostics !== undefined) this.diagnostics = diagnostics;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

async function fetchJson<T>(fetchFn: FetchFn, url: string, init?: RequestInit): Promise<T> {
  const res = await fetchFn(url, init);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = isRecord(body) ? body : {};
    const message =
      typeof err['error'] === 'string' ? err['error'] : `HTTP ${String(res.status)}`;
    const diagnostics = Array.isArray(err['diagnostics'])
      ? (err['diagnostics'] as Diagnostic[])
      : undefined;
    throw new ImportApiError(res.status, message, diagnostics);
  }
  return body as T;
}

function jsonInit(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

export interface ImportClient {
  createSession(filename: string, contentBase64: string): Promise<SessionCreateResult>;
  selectSheet(sessionId: string, sheet?: string): Promise<SheetResult>;
  applyMapping(
    sessionId: string,
    mapping?: Record<string, string>,
  ): Promise<MappingResult>;
  validate(sessionId: string): Promise<ValidateResult>;
  quickfix(sessionId: string, row: number, code: string): Promise<ValidateResult>;
  diff(sessionId: string): Promise<DiffResult>;
  commit(sessionId: string): Promise<CommitResult>;
  deleteSession(sessionId: string): Promise<void>;
  /** Tag Manager (OQ-385): đọc tags.yaml từ đĩa — equipment/role của tag. */
  getTags(): Promise<TagMeta[]>;
  /** Sửa ô equipment/role của một tag (null = xóa); lỗi → ImportApiError. */
  updateTag(name: string, equipment?: string | null, role?: string | null): Promise<void>;
  // --- Plant Designer (P2.8 commit 8, M2 §10.3) ---
  /** Chạy suggest trên tags.yaml đã commit (POST /api/suggest). */
  suggest(): Promise<SuggestResult>;
  /** Áp dụng gợi ý đã duyệt (onlyConfident → chỉ status confident). */
  applySuggest(accepted: Suggestion[], onlyConfident?: boolean): Promise<ApplyResult>;
  /** Học token → role vào plant/naming.yaml (UI hỏi trước — OQ-397). */
  learnRoleOverride(token: string, role: string): Promise<RoleOverrideResult>;
  /** Metadata model cho form params (GET /api/plant/models). */
  getModels(): Promise<ModelInfo[]>;
  /** Equipment trên đĩa (GET /api/plant/equipment, file-backed). */
  getEquipment(): Promise<EquipmentInstance[]>;
  /** Lưu toàn bộ equipment.yaml (validate trước khi ghi). */
  saveEquipment(equipment: EquipmentInstance[]): Promise<SaveEquipmentResult>;
  /** Snapshot plant live + events (GET /api/plant, OQ-387/389). */
  getPlant(): Promise<PlantSnapshot>;
}

// --- Plant Designer (P2.8 commit 8, M2 §10.3) — kiểu mirror JSON server
// (packages/importers suggest.ts, apps/server plant-routes.ts + sim-service.ts).

export interface SuggestedSignal {
  tag: string;
  role: string;
  confidence: number;
  reasons: string[];
  row: number;
}

export interface Suggestion {
  equipmentId: string;
  model: string;
  confidence: number;
  signals: SuggestedSignal[];
  missingRequiredRoles: string[];
  unusedOptionalRoles: string[];
  status: 'confident' | 'review' | 'unmatched';
  modelCandidates?: Array<{ model: string; score: number }>;
}

export interface SuggestResult {
  suggestions: Suggestion[];
  unassignedTags: Array<{ tag: string; reasons: string[] }>;
  stats: {
    totalTags: number;
    assignedTags: number;
    confident: number;
    review: number;
    unmatched: number;
  };
}

export interface ApplyResult {
  applied: string[];
  skipped: string[];
  filesWritten: string[];
  diagnostics: Diagnostic[];
  autoFilled: Array<{ equipment: string; params: Record<string, unknown> }>;
}

export interface RoleOverrideResult {
  token: string;
  role: string;
  file: string;
}

export interface ModelRoleInfo {
  role: string;
  kind: string;
  dataType: string;
  unit?: string;
  optional: boolean;
  description?: string;
  synonyms: string[];
}

export interface ParamField {
  name: string;
  type: 'integer' | 'number' | 'boolean' | 'string';
  enum?: string[];
  minimum?: number;
  maximum?: number;
  description?: string;
  required: boolean;
  default?: unknown;
}

export interface ModelInfo {
  model: string;
  version: string;
  description: string;
  roles: ModelRoleInfo[];
  params: ParamField[];
  faults: Array<{ id: string; description: string }>;
  presets: Array<{ name: string; description: string }>;
  observables: Array<{ key: string; description: string; unit?: string }>;
  hasSource: boolean;
}

export interface EquipmentInstance {
  id: string;
  model: string;
  controller?: string;
  params?: Record<string, unknown>;
  signals?: Record<string, string>;
}

export interface SaveEquipmentResult {
  equipment: EquipmentInstance[];
  filesWritten: string[];
}

export interface RoleValue {
  tag: string;
  raw: string | number | boolean;
  eng?: number;
  unit?: string;
  overRange?: boolean;
}

export interface PlantFaultRecord {
  id: string;
  target: unknown;
  state: string;
  sinceMs: number;
}

export interface PlantEquipmentSnapshot {
  id: string;
  model: string;
  controller?: string;
  faults: PlantFaultRecord[];
  observables: Record<string, number | boolean | string>;
  faultDefs: Array<{ id: string; description: string }>;
  presets: Array<{ name: string; description: string }>;
  signals: Record<string, string>;
  roleValues: Record<string, RoleValue>;
}

export interface PlantEvent {
  t: number;
  type: string;
  equipment?: string;
  key?: string;
  from?: unknown;
  to?: unknown;
  msg?: string;
  data?: Record<string, unknown>;
}

export interface PlantSnapshot {
  equipment: PlantEquipmentSnapshot[];
  events: PlantEvent[];
}

export function createImportClient(fetchFn: FetchFn = fetch): ImportClient {
  const base = '/api/import/session';
  return {
    createSession: async (filename, contentBase64) => {
      const wire = await fetchJson<SessionCreateWire>(
        fetchFn,
        base,
        jsonInit({ filename, contentBase64 }),
      );
      return {
        sessionId: wire.sessionId,
        sheets: wire.sheets.map((s) => s.name),
        detectedSheet: wire.detectedSheet,
      };
    },
    selectSheet: async (sessionId, sheet) => {
      const wire = await fetchJson<SheetWire>(
        fetchFn,
        `${base}/${sessionId}/sheet`,
        jsonInit(sheet === undefined ? {} : { sheet }),
      );
      return {
        sheet: wire.sheet,
        headerRow: wire.headerRow,
        firstDataRow: wire.firstDataRow,
        columns: wire.columns,
        preview: wire.preview50,
        totalRows: wire.totalRows,
      };
    },
    applyMapping: (sessionId, mapping) =>
      fetchJson<MappingResult>(
        fetchFn,
        `${base}/${sessionId}/mapping`,
        jsonInit(mapping === undefined ? {} : { mapping }),
      ),
    validate: (sessionId) =>
      fetchJson<ValidateResult>(fetchFn, `${base}/${sessionId}/validate`, jsonInit({})),
    quickfix: (sessionId, row, code) =>
      fetchJson<ValidateResult>(fetchFn, `${base}/${sessionId}/quickfix`, jsonInit({ row, code })),
    diff: (sessionId) => fetchJson<DiffResult>(fetchFn, `${base}/${sessionId}/diff`, jsonInit({})),
    commit: (sessionId) =>
      fetchJson<CommitResult>(fetchFn, `${base}/${sessionId}/commit`, jsonInit({})),
    deleteSession: async (sessionId) => {
      await fetchFn(`${base}/${sessionId}`, { method: 'DELETE' });
    },
    getTags: async () => {
      const body = await fetchJson<{ tags: TagMeta[] }>(fetchFn, '/api/tags');
      return body.tags;
    },
    updateTag: async (name, equipment, role) => {
      const payload: Record<string, unknown> = { name };
      if (equipment !== undefined) payload['equipment'] = equipment;
      if (role !== undefined) payload['role'] = role;
      await fetchJson<unknown>(fetchFn, '/api/tags', jsonInit(payload));
    },
    suggest: () => fetchJson<SuggestResult>(fetchFn, '/api/suggest', jsonInit({})),
    applySuggest: (accepted, onlyConfident) =>
      fetchJson<ApplyResult>(
        fetchFn,
        '/api/suggest/apply',
        jsonInit(onlyConfident === undefined ? { accepted } : { accepted, onlyConfident }),
      ),
    learnRoleOverride: (token, role) =>
      fetchJson<RoleOverrideResult>(
        fetchFn,
        '/api/suggest/role-override',
        jsonInit({ token, role }),
      ),
    getModels: async () => {
      const body = await fetchJson<{ models: ModelInfo[] }>(fetchFn, '/api/plant/models');
      return body.models;
    },
    getEquipment: async () => {
      const body = await fetchJson<{ equipment: EquipmentInstance[] }>(
        fetchFn,
        '/api/plant/equipment',
      );
      return body.equipment;
    },
    saveEquipment: (equipment) =>
      fetchJson<SaveEquipmentResult>(
        fetchFn,
        '/api/plant/equipment',
        jsonInit({ equipment }),
      ),
    getPlant: () => fetchJson<PlantSnapshot>(fetchFn, '/api/plant'),
  };
}
