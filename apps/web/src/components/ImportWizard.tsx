// Import wizard 5 bước (M2 §10.1, P2.8 commit 6).
// (1) tải file & chọn sheet; (2) header/vùng dữ liệu + xem trước 50 dòng;
// (3) mapping cột (gợi ý + sửa, lưu profile ở commit); (4) kết quả kiểm
// tra — bảng diagnostic lọc mức/mã, click nhảy tới dòng nguồn, nút "sửa
// nhanh" cho IO-W002; (5) diff và Commit.
// State wizard giữ local trong component; mọi tính toán nặng ở server qua
// session (OQ-382/383). Không hot reload (OQ-384): sau commit hiện banner
// khởi động lại server. Session hết hạn (410) → báo + về bước 1.

import { useEffect, useMemo, useState } from 'react';
import type { Diagnostic } from '@vcs/schemas';
import {
  createImportClient,
  ImportApiError,
  type CommitResult,
  type DiffResult,
  type MappingResult,
  type SheetResult,
  type ValidateResult,
} from '../api/import.js';
import { t, type Lang } from '../i18n/index.js';

type Step = 1 | 2 | 3 | 4 | 5;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error('không đọc được file'));
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('không đọc được file'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

function formatCell(v: string | number | boolean | null): string {
  if (v === null) return '';
  return String(v);
}

export function ImportWizard({ lang }: { lang: Lang }) {
  const api = useMemo(() => createImportClient(), []);
  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [detectedSheet, setDetectedSheet] = useState<string | null>(null);
  const [sheet, setSheet] = useState('');
  const [sheetData, setSheetData] = useState<SheetResult | null>(null);
  const [mappingData, setMappingData] = useState<MappingResult | null>(null);
  const [editedMapping, setEditedMapping] = useState<Record<string, string>>({});
  const [validateData, setValidateData] = useState<ValidateResult | null>(null);
  const [diffData, setDiffData] = useState<DiffResult | null>(null);
  const [commitData, setCommitData] = useState<CommitResult | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [codeFilter, setCodeFilter] = useState<string>('all');
  const [selectedDiag, setSelectedDiag] = useState<Diagnostic | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetAll(): void {
    setStep(1);
    setFileName('');
    setSessionId(null);
    setSheets([]);
    setDetectedSheet(null);
    setSheet('');
    setSheetData(null);
    setMappingData(null);
    setEditedMapping({});
    setValidateData(null);
    setDiffData(null);
    setCommitData(null);
    setSeverityFilter('all');
    setCodeFilter('all');
    setSelectedDiag(null);
    setError(null);
  }

  function handleError(err: unknown): void {
    if (err instanceof ImportApiError && err.status === 410) {
      setError(t(lang, 'import.sessionExpired'));
      resetAll();
      setError(t(lang, 'import.sessionExpired'));
      return;
    }
    setError(err instanceof Error ? err.message : t(lang, 'import.error'));
  }

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onFilePicked(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.csv')) {
      setError(t(lang, 'import.badExtension'));
      return;
    }
    const base64 = await run(() => readFileAsBase64(file));
    if (base64 === null) return;
    const created = await run(() => api.createSession(file.name, base64));
    if (created === null) return;
    setFileName(file.name);
    setSessionId(created.sessionId);
    setSheets(created.sheets);
    setDetectedSheet(created.detectedSheet);
    setSheet(created.detectedSheet ?? created.sheets[0] ?? '');
  }

  async function onCancel(): Promise<void> {
    if (sessionId !== null) {
      await api.deleteSession(sessionId).catch(() => undefined);
    }
    resetAll();
  }

  async function goStep2(): Promise<void> {
    if (sessionId === null) return;
    if (sheets.length > 0 && sheet === '') {
      setError(t(lang, 'import.selectSheetFirst'));
      return;
    }
    const res = await run(() =>
      api.selectSheet(sessionId, sheets.length === 0 ? undefined : sheet),
    );
    if (res === null) return;
    setSheetData(res);
    setStep(2);
  }

  async function goStep3(): Promise<void> {
    if (sessionId === null) return;
    const res = await run(() => api.applyMapping(sessionId));
    if (res === null) return;
    setMappingData(res);
    setEditedMapping({ ...res.mapping });
    setStep(3);
  }

  async function onApplyMapping(): Promise<void> {
    if (sessionId === null) return;
    const mapping: Record<string, string> = {};
    for (const [field, column] of Object.entries(editedMapping)) {
      if (column !== '') mapping[field] = column;
    }
    const res = await run(() => api.applyMapping(sessionId, mapping));
    if (res === null) return;
    setMappingData(res);
    setEditedMapping({ ...res.mapping });
  }

  async function goStep4(): Promise<void> {
    if (sessionId === null) return;
    const res = await run(() => api.validate(sessionId));
    if (res === null) return;
    setValidateData(res);
    setSelectedDiag(null);
    setStep(4);
  }

  async function onQuickfix(row: number): Promise<void> {
    if (sessionId === null) return;
    const res = await run(() => api.quickfix(sessionId, row, 'IO-W002'));
    if (res === null) return;
    setValidateData(res);
  }

  async function goStep5(): Promise<void> {
    if (sessionId === null) return;
    const res = await run(() => api.diff(sessionId));
    if (res === null) return;
    setDiffData(res);
    setStep(5);
  }

  async function onCommit(): Promise<void> {
    if (sessionId === null) return;
    const res = await run(() => api.commit(sessionId));
    if (res === null) return;
    setCommitData(res);
  }

  const filteredDiagnostics = useMemo(() => {
    if (validateData === null) return [];
    return validateData.diagnostics.filter((d) => {
      if (severityFilter !== 'all' && d.severity !== severityFilter) return false;
      if (codeFilter !== 'all' && d.code !== codeFilter) return false;
      return true;
    });
  }, [validateData, severityFilter, codeFilter]);

  const codeOptions = useMemo(() => {
    if (validateData === null) return [];
    return Object.keys(validateData.stats.diagnosticsByCode).sort();
  }, [validateData]);

  const selectedLine = selectedDiag?.line ?? null;

  // Click diagnostic → nhảy tới dòng nguồn trong bảng xem trước (bước 4).
  useEffect(() => {
    if (selectedLine === null) return;
    document
      .getElementById(`import-preview-row-${String(selectedLine)}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedLine]);

  const steps: Array<{ n: Step; label: string }> = [
    { n: 1, label: t(lang, 'import.step1') },
    { n: 2, label: t(lang, 'import.step2') },
    { n: 3, label: t(lang, 'import.step3') },
    { n: 4, label: t(lang, 'import.step4') },
    { n: 5, label: t(lang, 'import.step5') },
  ];

  return (
    <section aria-label={t(lang, 'import.title')} className="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-2">
      <h2 className="text-base font-semibold">{t(lang, 'import.title')}</h2>
      <ol className="mb-2 flex flex-wrap gap-2" data-testid="import-steps">
        {steps.map((s) => (
          <li
            key={s.n}
            data-testid={`import-step-${String(s.n)}`}
            className={s.n === step ? 'font-bold underline' : s.n < step ? 'text-gray-500' : undefined}
          >
            {s.label}
          </li>
        ))}
      </ol>
      {error !== null && (
        <div className="mb-2 bg-red-100 px-4 py-1 text-red-800 dark:bg-red-900 dark:text-red-100" role="alert">
          <span data-testid="import-error">
            {t(lang, 'import.error')}: {error}
          </span>{' '}
          <button
            onClick={() => {
              setError(null);
            }}
            type="button"
          >
            {t(lang, 'error.dismiss')}
          </button>
        </div>
      )}
      {busy && <p data-testid="import-loading">{t(lang, 'import.loading')}</p>}

      {step === 1 && (
        <div className="flex flex-col gap-2">
          <label>
            {t(lang, 'import.chooseFile')}{' '}
            <input
              data-testid="import-file-input"
              type="file"
              accept=".xlsx,.csv"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                void onFilePicked(file);
              }}
            />
          </label>
          <p className="text-sm text-gray-500">{t(lang, 'import.fileHint')}</p>
          {fileName !== '' && (
            <p data-testid="import-file-name">{fileName}</p>
          )}
          {sheets.length > 0 && (
            <label>
              {t(lang, 'import.sheets')}{' '}
              <select
                data-testid="import-sheet-select"
                value={sheet}
                disabled={busy}
                onChange={(e) => {
                  setSheet(e.target.value);
                }}
              >
                {sheets.map((s) => (
                  <option key={s} value={s}>
                    {s}
                    {s === detectedSheet ? ` (${t(lang, 'import.detectedSheet')})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-2">
            <button data-testid="import-next-1" disabled={busy || sessionId === null} onClick={() => void goStep2()} type="button">
              {t(lang, 'import.next')}
            </button>
            <button data-testid="import-cancel" disabled={busy || sessionId === null} onClick={() => void onCancel()} type="button">
              {t(lang, 'import.cancel')}
            </button>
          </div>
        </div>
      )}

      {step === 2 && sheetData !== null && (
        <div className="flex flex-col gap-2">
          <p>
            {t(lang, 'import.headerRow')}: <span data-testid="import-header-row">{sheetData.headerRow ?? '—'}</span>
            {' · '}
            {t(lang, 'import.firstDataRow')}: {sheetData.firstDataRow ?? '—'}
            {' · '}
            {t(lang, 'import.totalRows')}: <span data-testid="import-total-rows">{sheetData.totalRows}</span>
          </p>
          <p>
            {t(lang, 'import.columns')}: <span data-testid="import-columns">{sheetData.columns.join(', ')}</span>
          </p>
          <h3>{t(lang, 'import.preview')}</h3>
          <div className="max-h-96 overflow-auto border border-gray-300 dark:border-gray-700">
            <table data-testid="import-preview">
              <thead>
                <tr>
                  <th>#</th>
                  {sheetData.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheetData.preview.map((row, i) => {
                  const fileRow = (sheetData.firstDataRow ?? 0) + i;
                  return (
                    <tr key={fileRow}>
                      <td>{fileRow}</td>
                      {row.map((cell, j) => (
                        <td key={j}>{formatCell(cell)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button data-testid="import-back-2" disabled={busy} onClick={() => { setStep(1); }} type="button">
              {t(lang, 'import.back')}
            </button>
            <button data-testid="import-next-2" disabled={busy} onClick={() => void goStep3()} type="button">
              {t(lang, 'import.next')}
            </button>
            <button data-testid="import-cancel" disabled={busy} onClick={() => void onCancel()} type="button">
              {t(lang, 'import.cancel')}
            </button>
          </div>
        </div>
      )}

      {step === 3 && mappingData !== null && sheetData !== null && (
        <div className="flex flex-col gap-2">
          <h3>{t(lang, 'import.mapping')}</h3>
          <table data-testid="import-mapping-table">
            <thead>
              <tr>
                <th>{t(lang, 'import.field')}</th>
                <th>{t(lang, 'import.column')}</th>
                <th>{t(lang, 'import.suggested')}</th>
                <th>{t(lang, 'import.confidence')}</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(mappingData.mapping).map((field) => {
                const suggestion = mappingData.suggestions.find((s) => s.field === field);
                return (
                  <tr key={field}>
                    <td>{field}</td>
                    <td>
                      <select
                        data-testid={`import-mapping-${field}`}
                        value={editedMapping[field] ?? ''}
                        disabled={busy}
                        onChange={(e) => {
                          setEditedMapping((prev) => ({ ...prev, [field]: e.target.value }));
                        }}
                      >
                        <option value="">{t(lang, 'import.unassigned')}</option>
                        {sheetData.columns.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{suggestion?.column ?? '—'}</td>
                    <td>{suggestion?.confidence ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex gap-2">
            <button data-testid="import-apply-mapping" disabled={busy} onClick={() => void onApplyMapping()} type="button">
              {t(lang, 'import.applyMapping')}
            </button>
          </div>
          <p>
            {t(lang, 'import.records')}: <span data-testid="import-total-rows">{mappingData.totalRows}</span>
            {' · '}
            {t(lang, 'import.changed')}: {mappingData.changed.length}
            {' · '}
            {t(lang, 'import.mapping')}: {mappingData.profile.name}
          </p>
          <div className="max-h-64 overflow-auto border border-gray-300 dark:border-gray-700">
            <table data-testid="import-records-preview">
              <thead>
                <tr>
                  {Object.keys(mappingData.mapping).map((field) => (
                    <th key={field}>{field}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappingData.records.slice(0, 10).map((record, i) => (
                  <tr key={i}>
                    {Object.keys(mappingData.mapping).map((field) => (
                      <td key={field}>{formatCell(record[field] ?? null)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button data-testid="import-back-3" disabled={busy} onClick={() => { setStep(2); }} type="button">
              {t(lang, 'import.back')}
            </button>
            <button data-testid="import-next-3" disabled={busy} onClick={() => void goStep4()} type="button">
              {t(lang, 'import.next')}
            </button>
            <button data-testid="import-cancel" disabled={busy} onClick={() => void onCancel()} type="button">
              {t(lang, 'import.cancel')}
            </button>
          </div>
        </div>
      )}

      {step === 4 && validateData !== null && sheetData !== null && (
        <div className="flex flex-col gap-2">
          <h3>{t(lang, 'import.validate')}</h3>
          <p>
            {t(lang, 'import.errors')}: <span data-testid="import-stats-errors">{validateData.stats.errors}</span>
            {' · '}
            {t(lang, 'import.warnings')}: <span data-testid="import-stats-warnings">{validateData.stats.warnings}</span>
            {' · '}
            {t(lang, 'import.infos')}: <span data-testid="import-stats-infos">{validateData.stats.infos}</span>
          </p>
          <p data-testid="import-stats-by-code">
            {Object.entries(validateData.stats.diagnosticsByCode)
              .map(([code, n]) => `${code}×${String(n)}`)
              .join(', ')}
          </p>
          <div className="flex flex-wrap gap-2">
            <label>
              {t(lang, 'import.filterSeverity')}{' '}
              <select
                data-testid="import-filter-severity"
                value={severityFilter}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'all' || v === 'error' || v === 'warning' || v === 'info') {
                    setSeverityFilter(v);
                  }
                }}
              >
                <option value="all">{t(lang, 'import.all')}</option>
                <option value="error">error</option>
                <option value="warning">warning</option>
                <option value="info">info</option>
              </select>
            </label>
            <label>
              {t(lang, 'import.filterCode')}{' '}
              <select
                data-testid="import-filter-code"
                value={codeFilter}
                onChange={(e) => {
                  setCodeFilter(e.target.value);
                }}
              >
                <option value="all">{t(lang, 'import.all')}</option>
                {codeOptions.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {filteredDiagnostics.length === 0 ? (
            <p>{t(lang, 'import.noDiagnostics')}</p>
          ) : (
            <div className="max-h-64 overflow-auto border border-gray-300 dark:border-gray-700">
              <table data-testid="import-diag-table">
                <thead>
                  <tr>
                    <th>{t(lang, 'import.severity')}</th>
                    <th>{t(lang, 'import.code')}</th>
                    <th>{t(lang, 'import.line')}</th>
                    <th>{t(lang, 'import.message')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDiagnostics.map((d) => (
                    <tr
                      key={`${d.code}-${String(d.line ?? 0)}-${d.message}`}
                      data-testid={`import-diag-${d.code}-${String(d.line ?? 0)}`}
                      onClick={() => {
                        setSelectedDiag(d);
                      }}
                      className={selectedDiag === d ? 'bg-yellow-100 dark:bg-yellow-900' : undefined}
                    >
                      <td>{d.severity}</td>
                      <td>{d.code}</td>
                      <td>{d.line ?? '—'}</td>
                      <td>{d.message}</td>
                      <td>
                        {d.code === 'IO-W002' && d.line !== undefined && (
                          <button
                            data-testid={`import-quickfix-${String(d.line)}`}
                            disabled={busy || validateData.acceptedCleanRows.includes(d.line)}
                            onClick={(e) => {
                              e.stopPropagation();
                              void onQuickfix(d.line as number);
                            }}
                            type="button"
                          >
                            {validateData.acceptedCleanRows.includes(d.line)
                              ? t(lang, 'import.quickfixDone')
                              : t(lang, 'import.quickfix')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selectedDiag !== null && (
            <div data-testid="import-source-row">
              <h4>{t(lang, 'import.sourceRow')}</h4>
              <p>
                {selectedDiag.code} · {t(lang, 'import.line')} {selectedDiag.line ?? '—'}: {selectedDiag.message}
              </p>
              {selectedDiag.hint !== undefined && <p>{selectedDiag.hint}</p>}
              {selectedLine !== null &&
                sheetData.firstDataRow !== null &&
                (selectedLine < sheetData.firstDataRow ||
                  selectedLine >= sheetData.firstDataRow + sheetData.preview.length) && (
                  <p>{t(lang, 'import.rowOutsidePreview')}</p>
                )}
            </div>
          )}
          <h4>{t(lang, 'import.preview')}</h4>
          <div className="max-h-64 overflow-auto border border-gray-300 dark:border-gray-700">
            <table data-testid="import-preview-step4">
              <thead>
                <tr>
                  <th>#</th>
                  {sheetData.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheetData.preview.map((row, i) => {
                  const fileRow = (sheetData.firstDataRow ?? 0) + i;
                  return (
                    <tr
                      key={fileRow}
                      id={`import-preview-row-${String(fileRow)}`}
                      className={
                        selectedLine === fileRow ? 'bg-yellow-100 dark:bg-yellow-900' : undefined
                      }
                    >
                      <td>{fileRow}</td>
                      {row.map((cell, j) => (
                        <td key={j}>{formatCell(cell)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button data-testid="import-back-4" disabled={busy} onClick={() => { setStep(3); }} type="button">
              {t(lang, 'import.back')}
            </button>
            <button data-testid="import-next-4" disabled={busy} onClick={() => void goStep5()} type="button">
              {t(lang, 'import.next')}
            </button>
            <button data-testid="import-cancel" disabled={busy} onClick={() => void onCancel()} type="button">
              {t(lang, 'import.cancel')}
            </button>
          </div>
        </div>
      )}

      {step === 5 && diffData !== null && (
        <div className="flex flex-col gap-2">
          <h3>{t(lang, 'import.diff')}</h3>
          <p>
            {t(lang, 'import.added')}: <span data-testid="import-diff-added">{diffData.added.length}</span>
            {' · '}
            {t(lang, 'import.removed')}: <span data-testid="import-diff-removed">{diffData.removed.length}</span>
            {' · '}
            {t(lang, 'import.changedCount')}: <span data-testid="import-diff-changed">{diffData.changed.length}</span>
            {' · '}
            {t(lang, 'import.unchanged')}: <span data-testid="import-diff-unchanged">{diffData.unchanged.length}</span>
          </p>
          <div className="max-h-64 overflow-auto border border-gray-300 dark:border-gray-700">
            <table data-testid="import-diff-table">
              <thead>
                <tr>
                  <th>{t(lang, 'import.added')}</th>
                  <th>{t(lang, 'import.removed')}</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.max(diffData.added.length, diffData.removed.length) })
                  .slice(0, 20)
                  .map((_, i) => (
                    <tr key={i}>
                      <td>{diffData.added[i] ?? ''}</td>
                      <td>{diffData.removed[i] ?? ''}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {commitData === null ? (
            <div className="flex gap-2">
              <button data-testid="import-back-5" disabled={busy} onClick={() => { setStep(4); }} type="button">
                {t(lang, 'import.back')}
              </button>
              <button data-testid="import-commit" disabled={busy} onClick={() => void onCommit()} type="button">
                {t(lang, 'import.commit')}
              </button>
              <button data-testid="import-cancel" disabled={busy} onClick={() => void onCancel()} type="button">
                {t(lang, 'import.cancel')}
              </button>
            </div>
          ) : (
            <div>
              <p data-testid="import-committed">{t(lang, 'import.committed')}</p>
              <p>
                {t(lang, 'import.filesWritten')}:{' '}
                <span data-testid="import-files-written">{commitData.filesWritten.join(', ')}</span>
              </p>
              <p data-testid="import-restart-banner" role="alert">
                {t(lang, 'import.restartBanner')}
              </p>
              <button
                data-testid="import-restart"
                onClick={() => {
                  resetAll();
                }}
                type="button"
              >
                {t(lang, 'import.cancel')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
