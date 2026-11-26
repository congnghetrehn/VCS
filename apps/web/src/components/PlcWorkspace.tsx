// PLC Workspace — @vcs/web (P1.7, OQ-206/208/209).
// Cây file plc/ + editor SCL (Monaco) + Build/Save qua REST + bảng Watch
// qua WS plc.*. Web KHÔNG import vendor-siemens/runtime-iec (rule
// web-deps): mọi biên dịch/Watch qua server. Build chỉ compile-check,
// KHÔNG hot reload PLC đang chạy (OQ-208).

import { useEffect, useMemo, useState } from 'react';
import type { FaultRequest, FaultTiming, TagValue } from '@vcs/schemas';
import { createImportClient } from '../api/import.js';
import { t, type Lang } from '../i18n/index.js';
import { isValidPlcFileName, isValidWatchRef, parseWatchValue } from '../plc-helpers.js';
import { useSimSnapshot, useSimStore, type WsDiagnostic } from '../store.js';
import { buildTagMetaMap, type TagMetaMap } from '../tag-manager.js';
import { PlcEditor } from './PlcEditor.js';
import { PlantFaultPanel } from './PlantFaultPanel.js';

export interface PlcWorkspaceProps {
  lang: Lang;
  onPlcWatch: (refs: string[]) => void;
  onPlcUnwatch: () => void;
  onPlcWrite: (ref: string, value: TagValue) => void;
  onPlcForce: (ref: string, value: TagValue) => void;
  onPlcUnforce: (ref: string) => void;
  onPlantFaultInject: (request: FaultRequest) => void;
  onPlantFaultClear: (id: string) => void;
  onPlantFaultPreset: (equipment: string, preset: string, when?: FaultTiming) => void;
}

interface BuildResult {
  ok: boolean;
  diagnostics: WsDiagnostic[];
  files: string[];
}

async function plcBuild(): Promise<BuildResult> {
  const res = await fetch('/api/plc/build', { method: 'POST' });
  if (!res.ok) throw new Error(`POST /api/plc/build → HTTP ${String(res.status)}`);
  return (await res.json()) as BuildResult;
}

async function plcLoad(path: string): Promise<string> {
  const res = await fetch(`/api/plc/files?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`GET /api/plc/files?path=${path} → HTTP ${String(res.status)}`);
  const body = (await res.json()) as { content: string };
  return body.content;
}

async function plcSave(path: string, content: string): Promise<void> {
  const res = await fetch('/api/plc/files', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `POST /api/plc/files → HTTP ${String(res.status)}`);
  }
}

export function PlcWorkspace({
  lang,
  onPlcWatch,
  onPlcUnwatch,
  onPlcWrite,
  onPlcForce,
  onPlcUnforce,
  onPlantFaultInject,
  onPlantFaultClear,
  onPlantFaultPreset,
}: PlcWorkspaceProps) {
  const s = useSimSnapshot();
  const [newFileName, setNewFileName] = useState('');
  const [newRef, setNewRef] = useState('');
  const [writeInputs, setWriteInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Watch hiểu tag plant (OQ-385/395): equipment/role join từ GET /api/tags.
  const [tagMeta, setTagMeta] = useState<TagMetaMap>(new Map());
  const [watchEquipmentFilter, setWatchEquipmentFilter] = useState('all');

  // Mở workspace → nạp danh sách file (Build cũng là compile-check).
  useEffect(() => {
    let alive = true;
    void plcBuild()
      .then((r) => {
        if (!alive) return;
        const st = useSimStore.getState();
        st.setPlcFiles(r.files);
        st.setPlcDiagnostics(r.diagnostics);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        useSimStore.getState().setLastError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
    };
  }, []);

  // Nạp equipment/role cho Watch (GET /api/tags, file trên đĩa — lỗi thì
  // Watch vẫn chạy, 2 cột hiện '—').
  useEffect(() => {
    let alive = true;
    void createImportClient()
      .getTags()
      .then((tags) => {
        if (alive) setTagMeta(buildTagMetaMap(tags));
      })
      .catch(() => {
        // Giữ map rỗng — cột equipment/role hiện '—'.
      });
    return () => {
      alive = false;
    };
  }, []);

  async function doBuild(): Promise<void> {
    setBusy(true);
    try {
      const r = await plcBuild();
      const st = useSimStore.getState();
      st.setPlcFiles(r.files);
      st.setPlcDiagnostics(r.diagnostics);
    } catch (err) {
      useSimStore.getState().setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function openFile(path: string): Promise<void> {
    setBusy(true);
    try {
      const content = await plcLoad(path);
      useSimStore.getState().openPlcFile(path, content);
    } catch (err) {
      useSimStore.getState().setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrent(): Promise<void> {
    const st = useSimStore.getState();
    if (st.plcCurrentPath === null) return;
    setBusy(true);
    try {
      await plcSave(st.plcCurrentPath, st.plcCurrentContent);
      st.markPlcSaved();
    } catch (err) {
      useSimStore.getState().setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createFile(): Promise<void> {
    const name = newFileName.trim();
    if (!isValidPlcFileName(name)) {
      useSimStore.getState().setLastError('Tên file phải kết thúc .scl hoặc .lad.json');
      return;
    }
    setBusy(true);
    try {
      await plcSave(name, '');
      setNewFileName('');
      const r = await plcBuild();
      const st = useSimStore.getState();
      st.setPlcFiles(r.files);
      st.setPlcDiagnostics(r.diagnostics);
      await openFile(name);
    } catch (err) {
      useSimStore.getState().setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function addRef(): void {
    const ref = newRef.trim();
    if (!isValidWatchRef(ref) || s.plcWatchRefs.includes(ref)) return;
    const refs = [...s.plcWatchRefs, ref];
    useSimStore.getState().setPlcWatch(refs);
    onPlcWatch(refs);
    setNewRef('');
  }

  function removeRef(ref: string): void {
    const refs = s.plcWatchRefs.filter((r) => r !== ref);
    useSimStore.getState().setPlcWatch(refs);
    if (refs.length === 0) onPlcUnwatch();
    else onPlcWatch(refs);
  }

  const buildFailed = s.plcDiagnostics.some((d) => d.severity === 'error');

  // Watch: thiết bị distinct (từ meta) + danh sách ref sau lọc thiết bị.
  const watchEquipments = useMemo(() => {
    const seen = new Set<string>();
    for (const m of tagMeta.values()) {
      if (m.equipment !== undefined && m.equipment !== '') seen.add(m.equipment);
    }
    return [...seen].sort();
  }, [tagMeta]);
  const shownWatchRefs = s.plcWatchRefs.filter(
    (ref) => watchEquipmentFilter === 'all' || (tagMeta.get(ref)?.equipment ?? '') === watchEquipmentFilter,
  );

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-auto p-4" data-testid="plc-workspace">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold">{t(lang, 'plc.title')}</h2>
        <button data-testid="plc-build" disabled={busy} onClick={() => void doBuild()} type="button">
          {t(lang, 'plc.build')}
        </button>
        <button
          data-testid="plc-save"
          disabled={busy || s.plcCurrentPath === null || !s.plcDirty}
          onClick={() => void saveCurrent()}
          type="button"
        >
          {t(lang, 'plc.save')}
          {s.plcDirty ? ` (${t(lang, 'plc.unsaved')})` : ''}
        </button>
        <span data-testid="plc-build-status">
          {s.plcFiles.length === 0
            ? ''
            : buildFailed
              ? t(lang, 'plc.buildFail')
              : t(lang, 'plc.buildOk')}
        </span>
      </div>

      <div className="flex flex-1 gap-3">
        <section aria-label={t(lang, 'plc.files')} className="w-56 shrink-0">
          <h3 className="font-bold">{t(lang, 'plc.files')}</h3>
          <ul>
            {s.plcFiles.map((f) => (
              <li key={f}>
                <button
                  data-testid={`plc-file-${f}`}
                  onClick={() => void openFile(f)}
                  type="button"
                  className={f === s.plcCurrentPath ? 'font-bold underline' : undefined}
                >
                  {f}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-1">
            <input
              aria-label={t(lang, 'plc.newFile')}
              data-testid="plc-newfile-input"
              onChange={(e) => {
                setNewFileName(e.target.value);
              }}
              placeholder="VD: FB_New.scl"
              value={newFileName}
            />
            <button data-testid="plc-newfile" disabled={busy} onClick={() => void createFile()} type="button">
              {t(lang, 'plc.newFile')}
            </button>
          </div>
        </section>

        <section aria-label={t(lang, 'plc.title')} className="flex min-w-0 flex-1 flex-col">
          {s.plcCurrentPath === null ? (
            <p>{t(lang, 'plc.noFile')}</p>
          ) : (
            <>
              <p data-testid="plc-current-file">
                {s.plcCurrentPath}
                {s.plcDirty ? ` (${t(lang, 'plc.unsaved')})` : ''}
              </p>
              <PlcEditor
                onChange={(v) => {
                  useSimStore.getState().setPlcContent(v);
                }}
                theme={s.theme}
                value={s.plcCurrentContent}
              />
            </>
          )}
          {s.plcDiagnostics.length > 0 && (
            <ul data-testid="plc-diagnostics" className="mt-2">
              {s.plcDiagnostics.map((d, i) => (
                <li key={`${d.code}-${String(i)}`}>
                  {d.code}: {d.message}
                  {d.file !== undefined ? ` (${d.file}${d.line !== undefined ? `:${String(d.line)}` : ''})` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-label={t(lang, 'plc.watch')} className="border-t border-gray-300 pt-2 dark:border-gray-700">
        <h3 className="font-bold">{t(lang, 'plc.watch')}</h3>
        <div className="flex gap-1">
          <input
            aria-label={t(lang, 'plc.watch')}
            data-testid="plc-watch-input"
            onChange={(e) => {
              setNewRef(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addRef();
            }}
            placeholder={t(lang, 'plc.watchPlaceholder')}
            value={newRef}
          />
          <button data-testid="plc-watch-add" onClick={addRef} type="button">
            {t(lang, 'plc.watchAdd')}
          </button>
        </div>
        {s.plcWatchRefs.length === 0 ? (
          <p>{t(lang, 'plc.noWatch')}</p>
        ) : (
          <>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <label>
                {t(lang, 'plc.watchFilterEquipment')}{' '}
                <select
                  data-testid="plc-watch-filter-equipment"
                  value={watchEquipmentFilter}
                  onChange={(e) => {
                    setWatchEquipmentFilter(e.target.value);
                  }}
                >
                  <option value="all">{t(lang, 'tags.filter.allEquipment')}</option>
                  <option value="">{t(lang, 'tags.filter.unassigned')}</option>
                  {watchEquipments.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <table>
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left">{t(lang, 'plc.col.ref')}</th>
                  <th className="px-2 py-1 text-left">{t(lang, 'plc.col.value')}</th>
                  <th className="whitespace-nowrap px-2 py-1 text-left">{t(lang, 'tags.col.equipment')}</th>
                  <th className="whitespace-nowrap px-2 py-1 text-left">{t(lang, 'tags.col.role')}</th>
                  <th className="whitespace-nowrap px-2 py-1 text-left">{t(lang, 'plc.write')}</th>
                  <th className="whitespace-nowrap px-2 py-1 text-left">{t(lang, 'plc.force')}</th>
                  <th className="whitespace-nowrap px-2 py-1 text-left">{t(lang, 'plc.remove')}</th>
                </tr>
              </thead>
              <tbody>
                {shownWatchRefs.map((ref) => {
                  const i = s.plcWatchRefs.indexOf(ref);
                  const v = s.plcWatchValues.get(i);
                  const forced = s.plcForced.has(ref);
                  const meta = tagMeta.get(ref);
                  return (
                    <tr key={ref}>
                      <td className="px-2 py-1" data-testid={`plc-watch-ref-${ref}`}>
                        {ref}
                        {forced ? ` (${t(lang, 'plc.forced')})` : ''}
                      </td>
                      <td className="px-2 py-1" data-testid={`plc-watch-value-${ref}`}>{v === undefined ? '—' : String(v)}</td>
                      <td className="whitespace-nowrap px-2 py-1" data-testid={`plc-watch-equipment-${ref}`}>
                        {meta?.equipment ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1" data-testid={`plc-watch-role-${ref}`}>
                        {meta?.role ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1">
                        <span className="inline-flex items-center gap-1">
                          <input
                            aria-label={`${t(lang, 'plc.write')} ${ref}`}
                            className="w-20"
                            data-testid={`plc-watch-write-input-${ref}`}
                            onChange={(e) => {
                              setWriteInputs((prev) => ({ ...prev, [ref]: e.target.value }));
                            }}
                            value={writeInputs[ref] ?? ''}
                          />
                          <button
                            data-testid={`plc-watch-write-${ref}`}
                            onClick={() => {
                              if (v === undefined) return;
                              try {
                                const parsed = parseWatchValue(v, writeInputs[ref] ?? '');
                                onPlcWrite(ref, parsed);
                              } catch (err) {
                                useSimStore.getState().setLastError(
                                  err instanceof Error ? err.message : String(err),
                                );
                              }
                            }}
                            type="button"
                          >
                            {t(lang, 'plc.write')}
                          </button>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1">
                        {forced ? (
                          <button
                            data-testid={`plc-watch-unforce-${ref}`}
                            onClick={() => {
                              useSimStore.getState().markPlcForced(ref, false);
                              onPlcUnforce(ref);
                            }}
                            type="button"
                          >
                            {t(lang, 'plc.unforce')}
                          </button>
                        ) : (
                          <button
                            data-testid={`plc-watch-force-${ref}`}
                            disabled={v === undefined}
                            onClick={() => {
                              if (v === undefined) return;
                              useSimStore.getState().markPlcForced(ref, true);
                              onPlcForce(ref, v);
                            }}
                            type="button"
                          >
                            {t(lang, 'plc.force')}
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1">
                        <button
                          data-testid={`plc-watch-remove-${ref}`}
                          onClick={() => {
                            removeRef(ref);
                          }}
                          type="button"
                        >
                          {t(lang, 'plc.remove')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </section>
      <PlantFaultPanel
        lang={lang}
        onPlantFaultClear={onPlantFaultClear}
        onPlantFaultInject={onPlantFaultInject}
        onPlantFaultPreset={onPlantFaultPreset}
      />
    </div>
  );
}
