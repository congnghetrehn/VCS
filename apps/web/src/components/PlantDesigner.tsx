// Plant Designer 3 tab (M2 §10.3, P2.8 commit 8, OQ-386/392/397).
// - Suggestions: bảng suggest (36/14/0 trên fixture 300) + "Accept all
//   confident". Apply bị từ chối (OQ-392: switch_di thiếu kind — kind không
//   auto-fill được) → hiện diagnostics + nút "áp dụng các nhóm còn lại"
//   (loại đúng thiết bị bị chặn, lấy từ message PL-E001).
// - Equipment: form params từ GET /api/plant/models (zod-describe) trên
//   equipment.yaml đọc file-backed (GET /api/plant/equipment — đúng ngay
//   sau apply, không cần restart); lưu qua POST /api/plant/equipment.
// - Unassigned: gán tay tag → equipment/role; hỏi trước khi học
//   roleOverrides (OQ-397) — confirm dialog, không tự ghi.
// Sau apply/commit: banner khởi động lại (OQ-384, không hot reload).

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Diagnostic } from '@vcs/schemas';
import {
  createImportClient,
  ImportApiError,
  type ApplyResult,
  type EquipmentInstance,
  type ModelInfo,
  type ParamField,
  type Suggestion,
  type SuggestResult,
} from '../api/import.js';
import type { TagMeta } from '../tag-manager.js';
import { t, type Lang } from '../i18n/index.js';
import {
  blockedEquipmentIds,
  filterSuggestions,
  formatParamValue,
  isScalarParam,
  lastToken,
  parseParamValue,
} from '../plant-designer.js';

type Tab = 'suggestions' | 'equipment' | 'unassigned';

interface LearnDialog {
  tag: string;
  equipment: string;
  role: string;
}

function diagText(d: Diagnostic): string {
  return `${d.code}: ${d.message}`;
}

export function PlantDesigner({ lang }: { lang: Lang }) {
  const api = useMemo(() => createImportClient(), []);
  const [tab, setTab] = useState<Tab>('suggestions');
  const [suggestData, setSuggestData] = useState<SuggestResult | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [equipment, setEquipment] = useState<EquipmentInstance[]>([]);
  const [tags, setTags] = useState<TagMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'' | Suggestion['status']>('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [applyError, setApplyError] = useState<ImportApiError | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);

  const [selectedEquipment, setSelectedEquipment] = useState<string | null>(null);
  const [paramDraft, setParamDraft] = useState<Record<string, string>>({});
  const [signalDraft, setSignalDraft] = useState<Record<string, string>>({});
  const [paramErrors, setParamErrors] = useState<Record<string, string>>({});
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<ImportApiError | null>(null);
  const [newId, setNewId] = useState('');
  const [newModel, setNewModel] = useState('');

  const [assignEquipment, setAssignEquipment] = useState<Record<string, string>>({});
  const [assignRole, setAssignRole] = useState<Record<string, string>>({});
  const [learnDialog, setLearnDialog] = useState<LearnDialog | null>(null);
  const [assignMessage, setAssignMessage] = useState<string | null>(null);

  const refreshAll = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [s, m, e, tg] = await Promise.all([
        api.suggest(),
        api.getModels(),
        api.getEquipment(),
        api.getTags(),
      ]);
      setSuggestData(s);
      setModels(m);
      setEquipment(e);
      setTags(tg);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const modelsById = useMemo(
    () => new Map(models.map((m) => [m.model, m])),
    [models],
  );

  /** Model của một equipment: từ file trước, rồi từ gợi ý (review chưa áp
   *  dụng chưa có trong equipment.yaml). */
  const modelOfEquipment = useMemo(() => {
    const map = new Map<string, string>();
    for (const inst of equipment) map.set(inst.id, inst.model);
    for (const s of suggestData?.suggestions ?? []) {
      if (!map.has(s.equipmentId)) map.set(s.equipmentId, s.model);
    }
    return map;
  }, [equipment, suggestData]);

  const selectedInstance = equipment.find((e) => e.id === selectedEquipment) ?? null;
  const selectedModel =
    selectedInstance !== null ? modelsById.get(selectedInstance.model) : undefined;

  function selectEquipmentInstance(inst: EquipmentInstance): void {
    setSelectedEquipment(inst.id);
    setSaveMessage(null);
    setSaveError(null);
    setParamErrors({});
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(inst.params ?? {})) params[k] = formatParamValue(v);
    setParamDraft(params);
    setSignalDraft({ ...(inst.signals ?? {}) });
  }

  async function runApply(accepted: Suggestion[], onlyConfident: boolean): Promise<void> {
    setApplyBusy(true);
    setApplyError(null);
    setApplyResult(null);
    try {
      const res = await api.applySuggest(accepted, onlyConfident);
      setApplyResult(res);
      setEquipment(await api.getEquipment());
    } catch (err) {
      if (err instanceof ImportApiError) setApplyError(err);
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplyBusy(false);
    }
  }

  async function acceptConfident(): Promise<void> {
    if (suggestData === null) return;
    await runApply(suggestData.suggestions, true);
  }

  async function applyRest(): Promise<void> {
    if (suggestData === null || applyError === null) return;
    const blocked = new Set(blockedEquipmentIds(applyError.diagnostics ?? []));
    const rest = suggestData.suggestions.filter(
      (s) => s.status === 'confident' && !blocked.has(s.equipmentId),
    );
    await runApply(rest, true);
  }

  async function saveEquipment(): Promise<void> {
    if (selectedInstance === null || selectedModel === undefined) return;
    const errors: Record<string, string> = {};
    const params: Record<string, unknown> = {};
    for (const field of selectedModel.params) {
      const raw = paramDraft[field.name] ?? '';
      if (raw.trim() === '') continue; // Rỗng = bỏ key — server validate
      // (PL-E001 nếu field thật sự bắt buộc, vd kind của switch_di).
      if (!isScalarParam(field)) continue; // Object lồng chỉ đọc.
      const parsed = parseParamValue(field, raw);
      if (!parsed.ok) errors[field.name] = parsed.error;
      else params[field.name] = parsed.value;
    }
    setParamErrors(errors);
    if (Object.keys(errors).length > 0) return;
    // Role chưa gán (ô trống) thì bỏ khỏi signals — không gửi chuỗi rỗng.
    const signals: Record<string, string> = {};
    for (const [role, tagName] of Object.entries(signalDraft)) {
      if (tagName.trim() !== '') signals[role] = tagName.trim();
    }
    const next: EquipmentInstance[] = equipment.map((inst) =>
      inst.id === selectedInstance.id ? { ...inst, params, signals } : inst,
    );
    setSaveError(null);
    try {
      const res = await api.saveEquipment(next);
      setEquipment(res.equipment);
      setSaveMessage(t(lang, 'designer.saved'));
    } catch (err) {
      if (err instanceof ImportApiError) setSaveError(err);
      else setError(err instanceof Error ? err.message : String(err));
    }
  }

  function addEquipment(): void {
    const id = newId.trim();
    if (id === '' || newModel === '') return;
    if (equipment.some((e) => e.id === id)) {
      setSaveError(new ImportApiError(400, `equipment ${id} đã tồn tại`));
      return;
    }
    const model = modelsById.get(newModel);
    const params: Record<string, unknown> = {};
    for (const field of model?.params ?? []) {
      if (field.default !== undefined) params[field.name] = field.default;
    }
    const inst: EquipmentInstance = { id, model: newModel, params, signals: {} };
    setEquipment([...equipment, inst]);
    setNewId('');
    setNewModel('');
    selectEquipmentInstance(inst);
  }

  async function doAssign(learn: boolean): Promise<void> {
    if (learnDialog === null) return;
    const { tag, equipment: eqId, role } = learnDialog;
    setLearnDialog(null);
    try {
      if (learn) await api.learnRoleOverride(lastToken(tag), role);
      await api.updateTag(tag, eqId, role);
      setAssignMessage(t(lang, 'designer.assignDone'));
      setSuggestData(await api.suggest());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) {
    return <p data-testid="designer-loading">{t(lang, 'designer.loading')}</p>;
  }
  if (error !== null) {
    return (
      <p data-testid="designer-error">
        {t(lang, 'designer.error')}: {error}
      </p>
    );
  }

  const suggestions = suggestData?.suggestions ?? [];
  const visible = filterSuggestions(suggestions, statusFilter);
  const stats = suggestData?.stats;
  const blocked = applyError === null ? [] : blockedEquipmentIds(applyError.diagnostics ?? []);
  const selectedSug = suggestions.find((s) => s.equipmentId === selectedSuggestion) ?? null;

  return (
    <section aria-label={t(lang, 'designer.title')}>
      <h2>{t(lang, 'designer.title')}</h2>
      {stats !== undefined && (
        <p data-testid="designer-stats">
          {String(stats.totalTags)} {t(lang, 'designer.tags')} · {String(stats.assignedTags)}{' '}
          {t(lang, 'designer.assigned')} · {String(stats.confident)}{' '}
          {t(lang, 'designer.confident')} · {String(stats.review)} {t(lang, 'designer.review')} ·{' '}
          {String(stats.unmatched)} {t(lang, 'designer.unmatched')}
        </p>
      )}
      <div role="tablist" aria-label={t(lang, 'designer.title')}>
        <button
          data-testid="designer-tab-suggestions"
          onClick={() => {
            setTab('suggestions');
          }}
          type="button"
          className={tab === 'suggestions' ? 'font-bold underline' : undefined}
        >
          {t(lang, 'designer.tab.suggestions')}
        </button>{' '}
        <button
          data-testid="designer-tab-equipment"
          onClick={() => {
            setTab('equipment');
          }}
          type="button"
          className={tab === 'equipment' ? 'font-bold underline' : undefined}
        >
          {t(lang, 'designer.tab.equipment')}
        </button>{' '}
        <button
          data-testid="designer-tab-unassigned"
          onClick={() => {
            setTab('unassigned');
          }}
          type="button"
          className={tab === 'unassigned' ? 'font-bold underline' : undefined}
        >
          {t(lang, 'designer.tab.unassigned')}
        </button>
      </div>

      {tab === 'suggestions' && (
        <div>
          <label>
            {t(lang, 'designer.filterStatus')}:{' '}
            <select
              data-testid="designer-filter-status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as '' | Suggestion['status']);
              }}
            >
              <option value="">{t(lang, 'designer.all')}</option>
              <option value="confident">{t(lang, 'designer.confident')}</option>
              <option value="review">{t(lang, 'designer.review')}</option>
              <option value="unmatched">{t(lang, 'designer.unmatched')}</option>
            </select>
          </label>{' '}
          <button
            data-testid="designer-accept-confident"
            disabled={applyBusy}
            onClick={() => {
              void acceptConfident();
            }}
            type="button"
          >
            {t(lang, 'designer.acceptConfident')}
          </button>
          {applyResult !== null && (
            <p data-testid="designer-apply-result">
              {t(lang, 'designer.applyResult')}: {String(applyResult.applied.length)} ·{' '}
              {applyResult.filesWritten.join(', ')}
              {applyResult.autoFilled.length > 0 &&
                ` · ${String(applyResult.autoFilled.length)} ${t(lang, 'designer.autoFilled')}`}
            </p>
          )}
          {applyResult !== null && (
            <p data-testid="designer-restart-banner">{t(lang, 'import.restartBanner')}</p>
          )}
          {applyError !== null && (
            <div data-testid="designer-apply-diagnostics">
              <p>
                {t(lang, 'designer.applyFailed')}: {applyError.message}
              </p>
              <ul>
                {(applyError.diagnostics ?? []).map((d, i) => (
                  <li key={i}>{diagText(d)}</li>
                ))}
              </ul>
              {blocked.length > 0 && (
                <button
                  data-testid="designer-apply-rest"
                  disabled={applyBusy}
                  onClick={() => {
                    void applyRest();
                  }}
                  type="button"
                >
                  {t(lang, 'designer.applyRest')} ({String(blocked.length)} bị chặn:{' '}
                  {blocked.join(', ')})
                </button>
              )}
            </div>
          )}
          {visible.length === 0 ? (
            <p>{t(lang, 'designer.noSuggestions')}</p>
          ) : (
            <ul>
              {visible.map((s) => (
                <li key={s.equipmentId}>
                  <button
                    data-testid={`suggestion-${s.equipmentId}`}
                    onClick={() => {
                      setSelectedSuggestion(s.equipmentId);
                    }}
                    type="button"
                  >
                    {s.equipmentId} — {s.model} — {s.status} —{' '}
                    {String(Math.round(s.confidence * 100))}% — {String(s.signals.length)}{' '}
                    {t(lang, 'designer.signals')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedSug !== null && (
            <div data-testid="suggestion-detail">
              <h3>
                {selectedSug.equipmentId} — {selectedSug.model}
              </h3>
              <p>
                {t(lang, 'designer.confidence')}: {String(Math.round(selectedSug.confidence * 100))}
                % · {selectedSug.status}
              </p>
              {selectedSug.modelCandidates !== undefined && (
                <p>
                  {t(lang, 'designer.candidates')}:{' '}
                  {selectedSug.modelCandidates
                    .map((c) => `${c.model} ${String(Math.round(c.score * 100))}%`)
                    .join(', ')}
                </p>
              )}
              {selectedSug.missingRequiredRoles.length > 0 && (
                <p>
                  {t(lang, 'designer.missingRoles')}:{' '}
                  {selectedSug.missingRequiredRoles.join(', ')}
                </p>
              )}
              {selectedSug.unusedOptionalRoles.length > 0 && (
                <p>
                  {t(lang, 'designer.unusedRoles')}: {selectedSug.unusedOptionalRoles.join(', ')}
                </p>
              )}
              <table>
                <thead>
                  <tr>
                    <th>{t(lang, 'designer.tag')}</th>
                    <th>{t(lang, 'designer.role')}</th>
                    <th>{t(lang, 'designer.confidence')}</th>
                    <th>{t(lang, 'designer.reasons')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSug.signals.map((sig) => (
                    <tr key={sig.tag}>
                      <td>{sig.tag}</td>
                      <td>{sig.role}</td>
                      <td>{String(Math.round(sig.confidence * 100))}%</td>
                      <td>{sig.reasons.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'equipment' && (
        <div>
          <ul>
            {equipment.map((inst) => (
              <li key={inst.id}>
                <button
                  data-testid={`equipment-${inst.id}`}
                  onClick={() => {
                    selectEquipmentInstance(inst);
                  }}
                  type="button"
                  className={selectedEquipment === inst.id ? 'font-bold underline' : undefined}
                >
                  {inst.id} — {inst.model}
                </button>
              </li>
            ))}
          </ul>
          <div>
            <input
              data-testid="equipment-add-id"
              aria-label={t(lang, 'designer.newId')}
              placeholder={t(lang, 'designer.newId')}
              value={newId}
              onChange={(e) => {
                setNewId(e.target.value);
              }}
            />{' '}
            <select
              data-testid="equipment-add-model"
              aria-label={t(lang, 'designer.selectModel')}
              value={newModel}
              onChange={(e) => {
                setNewModel(e.target.value);
              }}
            >
              <option value="">{t(lang, 'designer.selectModel')}</option>
              {models.map((m) => (
                <option key={m.model} value={m.model}>
                  {m.model}
                </option>
              ))}
            </select>{' '}
            <button
              data-testid="equipment-add"
              onClick={() => {
                addEquipment();
              }}
              type="button"
            >
              {t(lang, 'designer.addEquipment')}
            </button>
          </div>
          {selectedInstance !== null && selectedModel !== undefined && (
            <div data-testid="equipment-params">
              <h3>
                {selectedInstance.id} — {selectedInstance.model}
              </h3>
              <h4>{t(lang, 'designer.params')}</h4>
              {selectedModel.params.map((field: ParamField) => (
                <div key={field.name}>
                  <label>
                    {field.name}
                    {field.description !== undefined ? ` — ${field.description}` : ''}
                    {': '}
                    {isScalarParam(field) ? (
                      field.enum !== undefined ? (
                        <select
                          data-testid={`param-${field.name}`}
                          value={paramDraft[field.name] ?? formatParamValue(field.default)}
                          onChange={(e) => {
                            setParamDraft({ ...paramDraft, [field.name]: e.target.value });
                          }}
                        >
                          {field.enum.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'boolean' ? (
                        <select
                          data-testid={`param-${field.name}`}
                          value={paramDraft[field.name] ?? formatParamValue(field.default)}
                          onChange={(e) => {
                            setParamDraft({ ...paramDraft, [field.name]: e.target.value });
                          }}
                        >
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          data-testid={`param-${field.name}`}
                          value={paramDraft[field.name] ?? formatParamValue(field.default)}
                          onChange={(e) => {
                            setParamDraft({ ...paramDraft, [field.name]: e.target.value });
                          }}
                        />
                      )
                    ) : (
                      <code>
                        {formatParamValue(selectedInstance.params?.[field.name])} (
                        {t(lang, 'designer.readOnly')})
                      </code>
                    )}
                  </label>
                  {paramErrors[field.name] !== undefined && (
                    <span data-testid={`param-error-${field.name}`}>
                      {' '}
                      {paramErrors[field.name]}
                    </span>
                  )}
                </div>
              ))}
              <h4>{t(lang, 'designer.signals')}</h4>
              {selectedModel.roles.map((role) => (
                <div key={role.role}>
                  <label>
                    {role.role}:{' '}
                    <input
                      data-testid={`signal-${role.role}`}
                      list="designer-tag-list"
                      value={signalDraft[role.role] ?? ''}
                      onChange={(e) => {
                        setSignalDraft({ ...signalDraft, [role.role]: e.target.value });
                      }}
                    />
                  </label>
                </div>
              ))}
              <datalist id="designer-tag-list">
                {tags.map((tg) => (
                  <option key={tg.name} value={tg.name} />
                ))}
              </datalist>
              <button
                data-testid="equipment-save"
                onClick={() => {
                  void saveEquipment();
                }}
                type="button"
              >
                {t(lang, 'designer.save')}
              </button>
              {saveMessage !== null && <p data-testid="equipment-saved">{saveMessage}</p>}
              {saveError !== null && (
                <div data-testid="equipment-save-diagnostics">
                  <p>
                    {saveError.message}
                  </p>
                  <ul>
                    {(saveError.diagnostics ?? []).map((d, i) => (
                      <li key={i}>{diagText(d)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'unassigned' && (
        <div>
          {assignMessage !== null && <p data-testid="assign-done">{assignMessage}</p>}
          {(suggestData?.unassignedTags ?? []).length === 0 ? (
            <p>{t(lang, 'designer.noUnassigned')}</p>
          ) : (
            <ul>
              {(suggestData?.unassignedTags ?? []).map((u) => {
                const eqId = assignEquipment[u.tag] ?? '';
                const model = eqId === '' ? undefined : modelOfEquipment.get(eqId);
                const roles = model === undefined ? [] : (modelsById.get(model)?.roles ?? []);
                const role = assignRole[u.tag] ?? '';
                return (
                  <li key={u.tag} data-testid={`unassigned-${u.tag}`}>
                    <span>
                      {u.tag} — {u.reasons.join('; ')}
                    </span>{' '}
                    <select
                      data-testid={`assign-equipment-${u.tag}`}
                      aria-label={t(lang, 'designer.chooseEquipment')}
                      value={eqId}
                      onChange={(e) => {
                        setAssignEquipment({ ...assignEquipment, [u.tag]: e.target.value });
                        setAssignRole({ ...assignRole, [u.tag]: '' });
                      }}
                    >
                      <option value="">{t(lang, 'designer.chooseEquipment')}</option>
                      {[...modelOfEquipment.keys()].sort().map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>{' '}
                    <select
                      data-testid={`assign-role-${u.tag}`}
                      aria-label={t(lang, 'designer.chooseRole')}
                      value={role}
                      disabled={roles.length === 0}
                      onChange={(e) => {
                        setAssignRole({ ...assignRole, [u.tag]: e.target.value });
                      }}
                    >
                      <option value="">{t(lang, 'designer.chooseRole')}</option>
                      {roles.map((r) => (
                        <option key={r.role} value={r.role}>
                          {r.role}
                        </option>
                      ))}
                    </select>{' '}
                    <button
                      data-testid={`assign-${u.tag}`}
                      disabled={eqId === '' || role === ''}
                      onClick={() => {
                        setLearnDialog({ tag: u.tag, equipment: eqId, role });
                      }}
                      type="button"
                    >
                      {t(lang, 'designer.assign')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {learnDialog !== null && (
            <div data-testid="learn-dialog" role="dialog">
              <p>
                {t(lang, 'designer.learnTitle')} Token `{lastToken(learnDialog.tag)}` → role `
                {learnDialog.role}`
              </p>
              <button
                data-testid="learn-confirm"
                onClick={() => {
                  void doAssign(true);
                }}
                type="button"
              >
                {t(lang, 'designer.learnConfirm')}
              </button>{' '}
              <button
                data-testid="learn-skip"
                onClick={() => {
                  void doAssign(false);
                }}
                type="button"
              >
                {t(lang, 'designer.learnSkip')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
