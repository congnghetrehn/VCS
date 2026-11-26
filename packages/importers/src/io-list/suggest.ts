// Auto-suggest thiết bị — @vcs/importers (M2 §9, P2.7).
// Engine thuần: parseTag → groupSignals → scoreModel → assignRoles →
// equipmentConfidence → suggest. Không đọc file, không ghi file.
// P2.7 commit 2: bước 1–2 (parseTag + groupSignals) + converters.

import {
  DEFAULT_NAMING_CONVENTION,
  type NamingConvention,
  type SignalKind,
  type TagDef,
} from '@vcs/schemas';
import {
  defaultRegistry,
  type EquipmentModel,
  type ModelRegistry,
  type RoleDef,
} from '@vcs/plant';
import type { NormalizedSignal } from './normalize.js';
import type { IoRecord } from './transform.js';

/** Epsilon so sánh confidence (OQ-361): 0.5×0.6+0.5×1.0 = 0.7999999999999999
 *  ở IEEE754 — không có eps sẽ rớt khỏi confident. */
export const SUGGEST_EPS = 1e-9;

export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Chuẩn hóa mô tả/từ khóa để khớp desc (OQ-364): lowercase + strip dấu
 *  NFKD + gom whitespace. Riêng 'đ'/'Đ' không phân rã theo NFKD nên gộp
 *  về 'd'/'D' (quy ước tìm kiếm tiếng Việt — tier A, xem STATE §31). */
export function normalizeDescText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function splitDescWords(descNorm: string): string[] {
  return descNorm.split(/[\s\-.,;:()/]+/).filter((w) => w !== '');
}

/** Khớp từ khóa trên chuỗi ĐÃ chuẩn hóa (cả hai phía đã qua
 *  normalizeDescText) — lõi dùng chung để tránh chuẩn hóa lại mô tả
 *  cho mỗi từ khóa (TC-3). */
function descKeywordMatchesNorm(kw: string, desc: string, words: readonly string[]): boolean {
  if (kw === '' || desc === '') return false;
  if (kw.includes(' ')) return desc.includes(kw);
  if (words.includes(kw)) return true;
  if (kw.length <= 3) return false;
  return words.some((w) => w.startsWith(kw));
}

/** Một descKeyword có khớp mô tả không (OQ-364): nhiều từ → chứa chuỗi;
 *  một từ → bằng đúng một từ trong mô tả, HOẶC (len ≥ 4) là prefix của
 *  một từ; từ khóa ≤ 3 ký tự chỉ khớp whole-word. */
export function descKeywordMatches(keyword: string, description: string): boolean {
  const kw = normalizeDescText(keyword);
  const desc = normalizeDescText(description);
  return descKeywordMatchesNorm(kw, desc, splitDescWords(desc));
}

/** Từ khóa desc đã chuẩn hóa theo RoleDef (memoize thuần — RoleDef là
 *  object tĩnh trong registry nên cache theo identity là tất định;
 *  tránh chuẩn hóa lại cùng từ khóa cho mỗi tín hiệu — TC-3). */
const normalizedKeywordsCache = new WeakMap<RoleDef, string[]>();
function normalizedKeywords(role: RoleDef): string[] {
  const cached = normalizedKeywordsCache.get(role);
  if (cached !== undefined) return cached;
  const list = role.descKeywords.map((k) => normalizeDescText(k));
  normalizedKeywordsCache.set(role, list);
  return list;
}

/** Mô tả đã chuẩn hóa 1 lần cho 1 tín hiệu trong nhóm (TC-3:
 *  normalizeDescText chiếm ~46% CPU ở smoke 20k khi tính lại cho mỗi
 *  cặp (role, model) — 1 tín hiệu được chấm ~36 lần). */
interface PreparedSignal {
  signal: GroupedSignal;
  descNorm: string;
  descWords: string[];
}

function prepareGroup(group: SignalGroup): PreparedSignal[] {
  return group.signals.map((signal) => {
    const descNorm = normalizeDescText(signal.input.description);
    return { signal, descNorm, descWords: splitDescWords(descNorm) };
  });
}

function normalizeToken(token: string): string {
  return token.trim().toUpperCase();
}

/** Khớp biên: token == synonym, hoặc synonym ở đầu/cuối/giữa token với
 *  phân cách `_ - .` (vd RUN_CMD_1 chứa RUN_CMD). */
function matchesAtBoundary(token: string, synonym: string): boolean {
  if (token === synonym) return true;
  for (const sep of ['_', '-', '.']) {
    if (
      token.startsWith(synonym + sep) ||
      token.endsWith(sep + synonym) ||
      token.includes(sep + synonym + sep)
    ) {
      return true;
    }
  }
  return false;
}

/** Vai trò mà roleOverrides gán cho token (khớp exact, không phân biệt
 *  hoa/thường); undefined khi không có override cho token này. */
function overrideRoleFor(convention: NamingConvention, tokenNorm: string): string | undefined {
  for (const [key, role] of Object.entries(convention.roleOverrides)) {
    if (normalizeToken(key) === tokenNorm) return role;
  }
  return undefined;
}

/** Kết quả khớp synonym: exact/boundary + từ khóa nào + có qua override không. */
interface SynonymMatch {
  kind: 'exact' | 'boundary';
  synonym: string;
  viaOverride: boolean;
}

function synonymMatch(
  role: RoleDef,
  tokenNorm: string,
  override: string | undefined,
): SynonymMatch | null {
  if (override !== undefined) {
    if (override === role.role) {
      return { kind: 'exact', synonym: tokenNorm, viaOverride: true };
    }
    // Override của role khác → exact bị chặn cho role này (chỉ chặn
    // exact; chứa ở biên vẫn tính như thường — OQ-370).
    for (const s of role.synonyms) {
      const syn = normalizeToken(s);
      if (syn !== tokenNorm && matchesAtBoundary(tokenNorm, syn)) {
        return { kind: 'boundary', synonym: s, viaOverride: false };
      }
    }
    return null;
  }
  for (const s of role.synonyms) {
    if (normalizeToken(s) === tokenNorm) {
      return { kind: 'exact', synonym: s, viaOverride: false };
    }
  }
  for (const s of role.synonyms) {
    const syn = normalizeToken(s);
    if (syn !== tokenNorm && matchesAtBoundary(tokenNorm, syn)) {
      return { kind: 'boundary', synonym: s, viaOverride: false };
    }
  }
  return null;
}

/** Từ khóa desc đầu tiên (theo thứ tự định nghĩa) khớp mô tả đã chuẩn
 *  hóa; null khi không có. Trả từ khóa GỐC (để in reasons). */
function firstDescKeyword(role: RoleDef, prepared: PreparedSignal): string | null {
  if (prepared.descNorm === '') return null;
  const kws = normalizedKeywords(role);
  for (let i = 0; i < role.descKeywords.length; i++) {
    const kw = kws[i];
    if (
      kw !== undefined &&
      descKeywordMatchesNorm(kw, prepared.descNorm, prepared.descWords)
    ) {
      return role.descKeywords[i] as string;
    }
  }
  return null;
}

export interface RoleScoreDetails {
  score: number;
  reasons: string[];
}

/** Điểm role + lý do từng thành phần (bước 4, §9.2) — nguồn sự thật duy
 *  nhất cho điểm role; scoreRole chỉ lấy .score. */
/** Điểm role + lý do từng thành phần (bước 4, §9.2) — nguồn sự thật duy
 *  nhất cho điểm role; scoreRole chỉ lấy .score. Bản Norm nhận mô tả
 *  đã chuẩn hóa 1 lần (TC-3); bản public chuẩn hóa rồi gọi Norm. */
function scoreRoleDetailsNorm(
  role: RoleDef,
  prepared: PreparedSignal,
  convention: NamingConvention = DEFAULT_NAMING_CONVENTION,
): RoleScoreDetails {
  const signal = prepared.signal;
  const tokenNorm = normalizeToken(signal.parsed.roleToken);
  const override = overrideRoleFor(convention, tokenNorm);
  const match = synonymMatch(role, tokenNorm, override);
  const synonymScore = match === null ? 0 : match.kind === 'exact' ? 0.6 : 0.4;
  const keyword = firstDescKeyword(role, prepared);
  const descScore = keyword === null ? 0 : 0.2;
  const kindScore =
    signal.input.kind === null ? 0 : signal.input.kind === role.kind ? 0.2 : -0.5;
  const reasons: string[] = [];
  if (match !== null) {
    if (match.viaOverride) reasons.push(`role override ${match.synonym} → ${role.role}`);
    else if (match.kind === 'exact') reasons.push(`exact synonym ${match.synonym}`);
    else reasons.push(`boundary synonym ${match.synonym}`);
  }
  if (keyword !== null) reasons.push(`description keyword ${keyword}`);
  if (signal.input.kind !== null) {
    reasons.push(
      signal.input.kind === role.kind
        ? `kind ${signal.input.kind} matches`
        : `kind ${signal.input.kind} ≠ ${role.kind}`,
    );
  }
  return { score: synonymScore + descScore + kindScore, reasons };
}

export function scoreRoleDetails(
  role: RoleDef,
  signal: GroupedSignal,
  convention: NamingConvention = DEFAULT_NAMING_CONVENTION,
): RoleScoreDetails {
  const descNorm = normalizeDescText(signal.input.description);
  return scoreRoleDetailsNorm(
    role,
    { signal, descNorm, descWords: splitDescWords(descNorm) },
    convention,
  );
}

/** Điểm role (bước 4, §9.2): exact synonym +0.6 (roleOverrides khớp
 *  exact tính như exact và chặn exact của role khác — OQ-370); chứa ở
 *  biên +0.4; descKeywords +0.2 (OQ-364); kind khớp +0.2, không khớp −0.5. */
export function scoreRole(
  role: RoleDef,
  signal: GroupedSignal,
  convention: NamingConvention = DEFAULT_NAMING_CONVENTION,
): number {
  return scoreRoleDetails(role, signal, convention).score;
}

/** Tiền tố chữ của eqcode: token cuối của equipmentId, lấy các chữ cái
 *  đầu (vd 'CR01_MV02' → 'MV', 'CR01_M01' → 'M'). */
export function eqcodeLetters(equipmentId: string): string {
  const tokens = equipmentId
    .toUpperCase()
    .split(/[_-]/)
    .filter((t) => t !== '');
  const last = tokens[tokens.length - 1] ?? '';
  return /^[A-Z]+/.exec(last)?.[0] ?? '';
}

export interface ModelScore {
  model: string;
  /** Điểm thô (chưa chuẩn hóa): prefix + 0.4×coverage + thừa + chữ ký. */
  score: number;
  /** Tỷ lệ role bắt buộc được phủ (0 role bắt buộc → 1.0, OQ-363). */
  coverage: number;
  /** Phạt thừa: −0.1 mỗi tín hiệu không gán được, tối đa −0.3. */
  excess: number;
}

/** Chữ ký model (OQ-362): +0.3 mỗi chữ ký khớp (AO+runCmd → vfd,
 *  hai LS → valve_onoff, chỉ có AI → analog_sensor, chỉ có 1 DI →
 *  switch_di, posRef AO → valve_ctrl/damper); motor_dol −0.2 khi có
 *  AO+runCmd. Tính từ điểm role bước 4, trước greedy. */
function signatureBonus(
  modelName: string,
  group: SignalGroup,
  matrix: number[][],
  model: EquipmentModel,
): number {
  const kinds = group.signals.map((s) => s.input.kind);
  const hasAO = kinds.includes('AO');
  const roleScoreAtLeast = (roleName: string): boolean => {
    const idx = model.roles.findIndex((r) => r.role === roleName);
    if (idx === -1) return false;
    return matrix.some((row) => (row[idx] ?? 0) >= 0.4);
  };
  const hasRunCmd = roleScoreAtLeast('runCmd');
  const hasPosRefAO = (() => {
    const idx = model.roles.findIndex((r) => r.role === 'posRef');
    if (idx === -1) return false;
    return group.signals.some(
      (s, i) => s.input.kind === 'AO' && (matrix[i]?.[idx] ?? 0) >= 0.4,
    );
  })();
  const lsCount = (() => {
    const openIdx = model.roles.findIndex((r) => r.role === 'openLs');
    const closedIdx = model.roles.findIndex((r) => r.role === 'closedLs');
    let n = 0;
    for (const row of matrix) {
      const best = Math.max(row[openIdx] ?? -Infinity, row[closedIdx] ?? -Infinity);
      if (best >= 0.4) n++;
    }
    return n;
  })();
  const allAI = group.signals.length > 0 && kinds.every((k) => k === 'AI');
  const singleDI = group.signals.length === 1 && kinds[0] === 'DI';
  switch (modelName) {
    case 'motor_vfd':
      return hasAO && hasRunCmd ? 0.3 : 0;
    case 'motor_dol':
      return hasAO && hasRunCmd ? -0.2 : 0;
    case 'valve_onoff':
      return lsCount >= 2 ? 0.3 : 0;
    case 'analog_sensor':
      return allAI ? 0.3 : 0;
    case 'switch_di':
      return singleDI ? 0.3 : 0;
    case 'valve_ctrl':
    case 'damper':
      return hasPosRefAO ? 0.3 : 0;
    default:
      return 0;
  }
}

/** Điểm model (bước 3, §9.2): +0.5 cho model khớp tiền tố DÀI NHẤT
 *  (OQ-369) + 0.4×coverage (OQ-366) + thừa (tối đa −0.3) + chữ ký
 *  (OQ-362). Trả về mọi model đã sort điểm giảm dần, hòa điểm → tên
 *  model asc (tất định). */
export function scoreModel(
  group: SignalGroup,
  convention: NamingConvention = DEFAULT_NAMING_CONVENTION,
  registry: ModelRegistry = defaultRegistry,
): ModelScore[] {
  // Tiền tố dài nhất TOÀN CỤC (OQ-369): chỉ model đó được +0.5.
  const letters = eqcodeLetters(group.equipmentId);
  let longestKey = '';
  let longestModel: string | undefined;
  for (const [key, mapped] of Object.entries(convention.equipmentCodeToModel)) {
    if (letters.startsWith(key) && key.length > longestKey.length) {
      longestKey = key;
      longestModel = mapped;
    }
  }
  const scores: ModelScore[] = [];
  // Mô tả chuẩn hóa 1 lần/nhóm, dùng chung cho cả 9 model (TC-3).
  const prepared = prepareGroup(group);
  for (const modelName of registry.list()) {
    const model = registry.get(modelName);
    if (model === undefined) continue;
    // Ma trận điểm role (tín hiệu × role) — dùng chung cho coverage,
    // thừa, chữ ký (tính bằng scoring bước 4, trước greedy — OQ-366).
    const matrix: number[][] = prepared.map(({ signal, descNorm, descWords }) =>
      model.roles.map(
        (r) =>
          scoreRoleDetailsNorm(r, { signal, descNorm, descWords }, convention).score,
      ),
    );
    const required = model.roles.filter((r) => r.optional !== true);
    let covered = 0;
    for (const role of required) {
      const roleIdx = model.roles.indexOf(role);
      if (matrix.some((row) => (row[roleIdx] ?? 0) >= 0.4)) covered++;
    }
    const coverage = required.length === 0 ? 1 : covered / required.length;
    let excessCount = 0;
    for (const row of matrix) {
      if (row.every((v) => v < 0.4)) excessCount++;
    }
    const excess = -0.1 * Math.min(excessCount, 3);
    const prefixBonus = modelName === longestModel ? 0.5 : 0;
    const signature = signatureBonus(modelName, group, matrix, model);
    scores.push({
      model: modelName,
      score: prefixBonus + 0.4 * coverage + excess + signature,
      coverage,
      excess,
    });
  }
  return scores.sort(
    (a, b) => b.score - a.score || (a.model < b.model ? -1 : a.model > b.model ? 1 : 0),
  );
}

/** Một tín hiệu đã gán role (bước 4). */
export interface AssignedSignal {
  input: SuggestInput;
  parsed: ParsedTag;
  role: string;
  score: number;
  /** clamp(score, 0, 1) — OQ-367. */
  confidence: number;
  /** Lý do từng thành phần (tính 1 lần ở assignRoles — TC-3). */
  reasons: string[];
}

export interface AssignRolesResult {
  assigned: AssignedSignal[];
  unassigned: GroupedSignal[];
}

/** Gán role tham lam (bước 4): xét mọi cặp (tín hiệu, role) ≥ 0.4 theo
 *  điểm giảm dần, hòa điểm → tên tag asc rồi row asc (thêm role asc làm
 *  tie-break cuối — cùng tín hiệu, cùng điểm, khác role); mỗi tín hiệu
 *  và mỗi role tối đa 1 lần. */
export function assignRoles(
  group: SignalGroup,
  model: EquipmentModel,
  convention: NamingConvention = DEFAULT_NAMING_CONVENTION,
): AssignRolesResult {
  interface Pair {
    signalIdx: number;
    role: string;
    score: number;
    reasons: string[];
  }
  // Mô tả chuẩn hóa 1 lần/nhóm (TC-3); reasons tính cùng lúc với điểm.
  const prepared = prepareGroup(group);
  const pairs: Pair[] = [];
  prepared.forEach(({ signal, descNorm, descWords }, i) => {
    for (const r of model.roles) {
      const details = scoreRoleDetailsNorm(r, { signal, descNorm, descWords }, convention);
      if (details.score >= 0.4) {
        pairs.push({ signalIdx: i, role: r.role, score: details.score, reasons: details.reasons });
      }
    }
  });
  pairs.sort(
    (a, b) =>
      b.score - a.score ||
      compareStr(
        group.signals[a.signalIdx]?.input.tag ?? '',
        group.signals[b.signalIdx]?.input.tag ?? '',
      ) ||
      (group.signals[a.signalIdx]?.input.row ?? 0) -
        (group.signals[b.signalIdx]?.input.row ?? 0) ||
      compareStr(a.role, b.role),
  );
  const usedSignals = new Set<number>();
  const usedRoles = new Set<string>();
  const assigned: AssignedSignal[] = [];
  for (const p of pairs) {
    if (usedSignals.has(p.signalIdx) || usedRoles.has(p.role)) continue;
    usedSignals.add(p.signalIdx);
    usedRoles.add(p.role);
    const s = group.signals[p.signalIdx];
    if (s === undefined) continue;
    assigned.push({
      input: s.input,
      parsed: s.parsed,
      role: p.role,
      score: p.score,
      confidence: clamp01(p.score),
      reasons: p.reasons,
    });
  }
  const unassigned = group.signals.filter((_, i) => !usedSignals.has(i));
  assigned.sort((a, b) => compareStr(a.input.tag, b.input.tag) || a.input.row - b.input.row);
  return { assigned, unassigned };
}

/** Confidence thiết bị (bước 5, OQ-361): 0.5×clamp(rawModelScore,0,1) +
 *  0.5×trung bình confidence role − 0.15×số role bắt buộc thiếu, clamp
 *  [0,1]. Không có tín hiệu gán → trung bình = 0. */
export function equipmentConfidence(
  rawModelScore: number,
  assigned: AssignedSignal[],
  requiredRoles: RoleDef[],
): number {
  const avg =
    assigned.length === 0
      ? 0
      : assigned.reduce((sum, a) => sum + a.confidence, 0) / assigned.length;
  const assignedRoles = new Set(assigned.map((a) => a.role));
  const missing = requiredRoles.filter((r) => !assignedRoles.has(r.role)).length;
  return clamp01(0.5 * clamp01(rawModelScore) + 0.5 * avg - 0.15 * missing);
}

/** Một tín hiệu đưa vào suggest (đã chuẩn hóa, chưa gán thiết bị). */
export interface SuggestInput {
  /** Tên tag đã chuẩn hóa (§8.6). */
  tag: string;
  /** Kind DI/DO/AI/AO; null khi không xác định được. */
  kind: SignalKind | null;
  /** Mô tả (để chấm descKeywords). */
  description: string;
  /** Cột equipment trong file (nếu có); null khi vắng. */
  equipmentColumn: string | null;
  /** Số dòng file (1-based) — dùng sort ổn định + report. */
  row: number;
  /** TagDef sẵn sàng ghi; null khi không dựng được (tên/địa chỉ/kind lỗi). */
  tagDef: TagDef | null;
  /** Mã lỗi validate của record (IO-E002/IO-E010/IO-E003); vắng = sạch. */
  errorCode?: string;
}

/** Kết quả tách tag: thiết bị + token role + nguồn tách. */
export interface ParsedTag {
  equipmentId: string;
  /** Phần còn lại để chấm role (vd 'REMOTE', 'POS_FB'); rỗng chỉ khi
   *  tag trùng hẳn equipmentId. */
  roleToken: string;
  source: 'pattern' | 'equipment-column' | 'lcp';
}

/** Một tín hiệu trong group (kèm kết quả parse đã chốt). */
export interface GroupedSignal {
  input: SuggestInput;
  parsed: ParsedTag;
}

/** Nhóm tín hiệu cùng một thiết bị (đã sort theo equipmentId). */
export interface SignalGroup {
  equipmentId: string;
  signals: GroupedSignal[];
}

function recordString(record: IoRecord, field: string): string | null {
  const v = record[field];
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** Chuẩn hóa NormalizedSignal (P2.6) thành SuggestInput.
 *  errorCode khớp đúng validateImport (OQ-378): tag rỗng/>128 → IO-E002,
 *  địa chỉ lỗi → IO-E010, còn lại tagDef null → IO-E003. */
export function normalizedSignalsToInputs(signals: NormalizedSignal[]): SuggestInput[] {
  return signals.map((s) => {
    const input: SuggestInput = {
      tag: s.tag,
      kind: s.kind,
      description: s.tagDef?.description ?? recordString(s.record, 'description') ?? '',
      equipmentColumn: s.tagDef?.equipment ?? recordString(s.record, 'equipment'),
      row: s.row,
      tagDef: s.tagDef,
    };
    if (s.tag === '' || s.tag.length > 128) input.errorCode = 'IO-E002';
    else if (s.addressError !== null) input.errorCode = 'IO-E010';
    else if (s.tagDef === null) input.errorCode = 'IO-E003';
    return input;
  });
}

/** TagDef trong tags.yaml → SuggestInput (equipment = TagDef.equipment,
 *  row = thứ tự trong file, ổn định để sort). */
export function tagDefsToInputs(tagDefs: TagDef[]): SuggestInput[] {
  return tagDefs.map((t, i) => ({
    tag: t.name,
    kind: t.signal?.kind ?? null,
    description: t.description ?? '',
    equipmentColumn: t.equipment ?? null,
    row: i + 1,
    tagDef: t,
  }));
}

/** Token đầu của tag (tách bằng `_`/`-`); tag rỗng → ''. */
export function firstToken(tag: string): string {
  const idx = tag.search(/[_-]/);
  return idx === -1 ? tag : tag.slice(0, idx);
}

function compareStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Bỏ tiền tố equipment khỏi tag để lấy token role:
 *  - tag bắt đầu bằng `equipmentId` + separator → phần còn lại;
 *  - equipmentId là một token trong tag → các token sau nó (nối `_`);
 *  - còn lại (không tìm thấy / phần còn lại rỗng) → toàn bộ tag. */
export function stripEquipmentPrefix(tag: string, equipmentId: string): string {
  if (equipmentId !== '' && tag.startsWith(equipmentId)) {
    const rest = tag.slice(equipmentId.length);
    if (rest !== '' && (rest[0] === '_' || rest[0] === '-')) {
      const token = rest.slice(1);
      if (token !== '') return token;
    }
    if (rest === '') return tag;
  }
  const tokens = tag.split(/[_-]/);
  const idx = tokens.findIndex((t) => t === equipmentId);
  if (idx !== -1 && idx < tokens.length - 1) {
    const token = tokens.slice(idx + 1).join('_');
    if (token !== '') return token;
  }
  return tag;
}

/** Tách tag thành thiết bị + token role (bước 1, §9.1):
 *  1. tagPattern (nhóm đặt tên area/eqcode/role);
 *  2. cột equipment (nếu có);
 *  3. fallback LCP — ở đây chỉ trả first token; groupSignals tính LCP
 *     thật theo bucket (cần nhìn cả nhóm). */
export function parseTag(
  tag: string,
  convention: NamingConvention = DEFAULT_NAMING_CONVENTION,
  equipmentColumn?: string | null,
): ParsedTag {
  const re = new RegExp(convention.tagPattern);
  const m = re.exec(tag);
  if (m?.groups?.['area'] && m.groups['eqcode'] && m.groups['role']) {
    const equipmentId = convention.equipmentIdTemplate
      .replaceAll('{area}', m.groups['area'])
      .replaceAll('{eqcode}', m.groups['eqcode']);
    return { equipmentId, roleToken: m.groups['role'], source: 'pattern' };
  }
  const col = equipmentColumn?.trim() ?? '';
  if (col !== '') {
    return { equipmentId: col, roleToken: stripEquipmentPrefix(tag, col), source: 'equipment-column' };
  }
  return { equipmentId: firstToken(tag), roleToken: tag, source: 'lcp' };
}

function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/** Cắt tiền tố chung tới separator cuối: LCP kết thúc bằng separator →
 *  bỏ separator cuối ('RUN_' → 'RUN'); còn lại → cắt ở separator cuối
 *  ('CR01_MV0' → 'CR01'); không có separator → ''. */
export function truncateToSeparator(prefix: string): string {
  if (prefix === '') return '';
  if (prefix[prefix.length - 1] === '_' || prefix[prefix.length - 1] === '-') {
    return prefix.replace(/[_-]+$/, '');
  }
  const idx = Math.max(prefix.lastIndexOf('_'), prefix.lastIndexOf('-'));
  return idx < 0 ? '' : prefix.slice(0, idx);
}

/** Gom tín hiệu theo thiết bị (bước 2, §9.1): pattern/equipment-column
 *  lấy equipmentId từ parseTag; fallback LCP: bucket theo first token,
 *  mỗi tag lấy LCP dài nhất với 2 neighbour đã sort (O(k log k)), cắt
 *  tới separator cuối; không candidate → first token. Group sort theo
 *  equipmentId; tín hiệu trong group sort theo (tag, row). */
export function groupSignals(
  inputs: SuggestInput[],
  convention: NamingConvention = DEFAULT_NAMING_CONVENTION,
): SignalGroup[] {
  const grouped: GroupedSignal[] = inputs.map((input) => ({
    input,
    parsed: parseTag(input.tag, convention, input.equipmentColumn),
  }));
  const lcpBuckets = new Map<string, GroupedSignal[]>();
  for (const g of grouped) {
    if (g.parsed.source !== 'lcp') continue;
    const key = firstToken(g.input.tag);
    const bucket = lcpBuckets.get(key) ?? [];
    bucket.push(g);
    lcpBuckets.set(key, bucket);
  }
  for (const bucket of lcpBuckets.values()) {
    if (bucket.length < 2) continue;
    const sorted = [...bucket].sort((a, b) => compareStr(a.input.tag, b.input.tag));
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      if (item === undefined) continue;
      const tag = item.input.tag;
      const prev = i > 0 ? sorted[i - 1]?.input.tag ?? null : null;
      const next = i < sorted.length - 1 ? sorted[i + 1]?.input.tag ?? null : null;
      const prevLen = prev === null ? -1 : commonPrefixLength(tag, prev);
      const nextLen = next === null ? -1 : commonPrefixLength(tag, next);
      const best = Math.max(prevLen, nextLen);
      const lcp = best <= 0 ? '' : tag.slice(0, best);
      const key = truncateToSeparator(lcp);
      const equipmentId = key === '' ? firstToken(tag) : key;
      item.parsed = {
        equipmentId,
        roleToken: stripEquipmentPrefix(tag, equipmentId),
        source: 'lcp',
      };
    }
  }
  const byEquipment = new Map<string, GroupedSignal[]>();
  for (const g of grouped) {
    const list = byEquipment.get(g.parsed.equipmentId) ?? [];
    list.push(g);
    byEquipment.set(g.parsed.equipmentId, list);
  }
  return [...byEquipment.entries()]
    .sort((a, b) => compareStr(a[0], b[0]))
    .map(([equipmentId, signals]) => ({
      equipmentId,
      signals: [...signals].sort(
        (a, b) => compareStr(a.input.tag, b.input.tag) || a.input.row - b.input.row,
      ),
    }));
}

/** Một tín hiệu đã gán trong Suggestion (§9.1). `row` là trường truy vết
 *  thêm (tier A): phân biệt các record trùng tag khi đối chiếu/apply. */
export interface SuggestedSignal {
  tag: string;
  role: string;
  confidence: number;
  reasons: string[];
  /** Số dòng file (1-based) của record được gán. */
  row: number;
}

/** Gợi ý cho một thiết bị (§9.1 + trường truy vết). */
export interface Suggestion {
  equipmentId: string;
  model: string;
  confidence: number;
  signals: SuggestedSignal[];
  missingRequiredRoles: string[];
  unusedOptionalRoles: string[];
  /** ≥ 0.8 | 0.5–0.8 | < 0.5 (so với eps 1e-9, OQ-361); tie model
   *  (chênh ≤ 0.1) ép review bất kể confidence (OQ-367). */
  status: 'confident' | 'review' | 'unmatched';
  /** Top-2 model khi chênh ≤ 0.1 (OQ-367). */
  modelCandidates?: { model: string; score: number }[];
}

export interface SuggestResult {
  suggestions: Suggestion[];
  unassignedTags: { tag: string; reasons: string[] }[];
  stats: {
    totalTags: number;
    assignedTags: number;
    confident: number;
    review: number;
    unmatched: number;
  };
}

/** Pipeline suggest đầy đủ (bước 6, §9.1): group → chấm model → gán
 *  role → confidence → phân loại. Thuần, tất định (không Date.now/
 *  Math.random); suggestions sort theo equipmentId, unassignedTags sort
 *  theo (tag, row). Record tagDef null không tham gia scoring, vào
 *  unassignedTags với lý do mã lỗi (OQ-365). */
export function suggest(
  inputs: SuggestInput[],
  convention: NamingConvention = DEFAULT_NAMING_CONVENTION,
  registry: ModelRegistry = defaultRegistry,
): SuggestResult {
  const unassignedTags: Array<{ tag: string; row: number; reasons: string[] }> = [];
  const validInputs: SuggestInput[] = [];
  for (const input of inputs) {
    if (input.tagDef === null) {
      const reason =
        input.errorCode !== undefined
          ? `invalid record (tagDef null): ${input.errorCode}`
          : 'invalid record (tagDef null)';
      unassignedTags.push({ tag: input.tag, row: input.row, reasons: [reason] });
    } else {
      validInputs.push(input);
    }
  }
  const groups = groupSignals(validInputs, convention);
  const suggestions: Suggestion[] = [];
  // Tag → tín hiệu đã gán (để phát hiện dup tag ở bước mồ côi).
  const assignedByTag = new Map<string, { role: string; row: number }>();
  const pendingUnassigned: Array<{
    signal: GroupedSignal;
    model: EquipmentModel;
    assigned: AssignedSignal[];
  }> = [];
  for (const group of groups) {
    const scores = scoreModel(group, convention, registry);
    const best = scores[0];
    if (best === undefined) continue;
    const model = registry.get(best.model);
    if (model === undefined) continue;
    const { assigned, unassigned } = assignRoles(group, model, convention);
    const requiredRoles = model.roles.filter((r) => r.optional !== true);
    const assignedRoles = new Set(assigned.map((a) => a.role));
    const missingRequiredRoles = requiredRoles
      .map((r) => r.role)
      .filter((r) => !assignedRoles.has(r));
    const unusedOptionalRoles = model.roles
      .filter((r) => r.optional === true)
      .map((r) => r.role)
      .filter((r) => !assignedRoles.has(r));
    const confidence = equipmentConfidence(best.score, assigned, requiredRoles);
    const second = scores[1];
    const tie = second !== undefined && best.score - second.score <= 0.1 + SUGGEST_EPS;
    let status: Suggestion['status'];
    if (tie) status = 'review';
    else if (confidence >= 0.8 - SUGGEST_EPS) status = 'confident';
    else if (confidence >= 0.5 - SUGGEST_EPS) status = 'review';
    else status = 'unmatched';
    const suggestion: Suggestion = {
      equipmentId: group.equipmentId,
      model: best.model,
      confidence,
      signals: assigned.map((a) => ({
        tag: a.input.tag,
        role: a.role,
        confidence: a.confidence,
        // Reasons đã tính 1 lần ở assignRoles (TC-3) — không tính lại.
        reasons: a.reasons,
        row: a.input.row,
      })),
      missingRequiredRoles,
      unusedOptionalRoles,
      status,
    };
    if (tie) {
      suggestion.modelCandidates = [
        { model: best.model, score: best.score },
        { model: second.model, score: second.score },
      ];
    }
    suggestions.push(suggestion);
    for (const a of assigned) {
      if (!assignedByTag.has(a.input.tag)) {
        assignedByTag.set(a.input.tag, { role: a.role, row: a.input.row });
      }
    }
    for (const s of unassigned) pendingUnassigned.push({ signal: s, model, assigned });
  }
  // Bước 6 mồ côi (OQ-378): lý do cho từng tag không gán được.
  for (const { signal, model, assigned } of pendingUnassigned) {
    let bestRole: string | null = null;
    let bestScore = -Infinity;
    for (const role of model.roles) {
      const score = scoreRole(role, signal, convention);
      if (score > bestScore) {
        bestScore = score;
        bestRole = role.role;
      }
    }
    const reasons: string[] = [];
    if (bestScore >= 0.4 && bestRole !== null) {
      const taker = assignedByTag.get(signal.input.tag);
      const holder = assigned.find((a) => a.role === bestRole);
      if (taker !== undefined && taker.role === bestRole) {
        reasons.push(`duplicate tag — role taken by row ${String(taker.row)}`);
      } else if (holder !== undefined) {
        reasons.push(
          holder.input.tag === signal.input.tag
            ? `duplicate tag — role taken by row ${String(holder.input.row)}`
            : `role ${bestRole} taken by ${holder.input.tag} (row ${String(holder.input.row)})`,
        );
      } else {
        reasons.push(`role ${bestRole} taken`);
      }
    } else {
      reasons.push('no role ≥ 0.4');
    }
    unassignedTags.push({ tag: signal.input.tag, row: signal.input.row, reasons });
  }
  unassignedTags.sort((a, b) => compareStr(a.tag, b.tag) || a.row - b.row);
  const stats = {
    totalTags: inputs.length,
    assignedTags: suggestions.reduce((n, s) => n + s.signals.length, 0),
    confident: suggestions.filter((s) => s.status === 'confident').length,
    review: suggestions.filter((s) => s.status === 'review').length,
    unmatched: suggestions.filter((s) => s.status === 'unmatched').length,
  };
  return {
    suggestions,
    unassignedTags: unassignedTags.map(({ tag, reasons }) => ({ tag, reasons })),
    stats,
  };
}
