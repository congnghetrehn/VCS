// Equipment Inspector (M2 §10.4, P2.8 commit 8, OQ-387/388).
// Chọn thiết bị → observables + giá trị từng role (raw + eng do server tính,
// cờ vượt dải) + lỗi đang chèn (clear) + chèn lỗi/preset qua WS + đặt
// manual/source cho model có source (hasSource, vd analog_sensor).
// Dữ liệu live qua GET /api/plant (poll 1 s, cùng nhịp PlantFaultPanel);
// WS plant.manual.set/plant.source.set không có ack — nút đặt xong thì
// poll sau tự cập nhật.

import { useEffect, useMemo, useState } from 'react';
import type { FaultRequest, FaultTiming, SourceSpec } from '@vcs/schemas';
import {
  createImportClient,
  type ModelInfo,
  type PlantEquipmentSnapshot,
} from '../api/import.js';
import { t, type Lang } from '../i18n/index.js';
import { formatRoleValue } from '../plant-designer.js';

export interface EquipmentInspectorProps {
  lang: Lang;
  onPlantManualSet: (equipment: string, value: number | boolean) => void;
  onPlantSourceSet: (equipment: string, source: SourceSpec) => void;
  onPlantFaultInject: (request: FaultRequest) => void;
  onPlantFaultClear: (id: string) => void;
  onPlantFaultPreset: (equipment: string, preset: string, when?: FaultTiming) => void;
}

/** Parse giá trị manual/source từ ô nhập: 'true'/'false' → boolean, còn
 *  lại phải là số hữu hạn. */
export function parseSourceValue(raw: string): number | boolean | null {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function EquipmentInspector({
  lang,
  onPlantManualSet,
  onPlantSourceSet,
  onPlantFaultInject,
  onPlantFaultClear,
  onPlantFaultPreset,
}: EquipmentInspectorProps) {
  const api = useMemo(() => createImportClient(), []);
  const [plant, setPlant] = useState<PlantEquipmentSnapshot[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [faultSel, setFaultSel] = useState('');
  const [presetSel, setPresetSel] = useState('');
  const [sourceKind, setSourceKind] = useState<'manual' | 'const'>('manual');
  const [sourceValue, setSourceValue] = useState('');
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const snap = await api.getPlant();
        if (cancelled) return;
        setPlant(snap.equipment);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    const timer = setInterval(() => {
      void load();
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    void api
      .getModels()
      .then((m) => {
        if (!cancelled) setModels(m);
      })
      .catch(() => {
        // Models chỉ để biết hasSource — lỗi thì inspector ẩn phần
        // manual/source, không chặn xem trạng thái.
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const selected = plant.find((e) => e.id === selectedId) ?? null;
  const selectedModel = selected === null
    ? undefined
    : models.find((m) => m.model === selected.model);

  function applySource(): void {
    if (selected === null) return;
    const value = parseSourceValue(sourceValue);
    if (value === null) {
      setSourceError(`${t(lang, 'inspector.value')}: true/false hoặc số`);
      return;
    }
    setSourceError(null);
    if (sourceKind === 'manual') onPlantManualSet(selected.id, value);
    else onPlantSourceSet(selected.id, { kind: 'const', value });
  }

  if (error !== null) {
    return (
      <p data-testid="inspector-error">
        {t(lang, 'designer.error')}: {error}
      </p>
    );
  }
  if (plant.length === 0) {
    return <p data-testid="inspector-empty">{t(lang, 'inspector.noPlant')}</p>;
  }

  return (
    <section aria-label={t(lang, 'inspector.title')}>
      <h2>{t(lang, 'inspector.title')}</h2>
      <label>
        {t(lang, 'inspector.selectEquipment')}:{' '}
        <select
          data-testid="inspector-equipment"
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setFaultSel('');
            setPresetSel('');
            setSourceError(null);
          }}
        >
          <option value="">{t(lang, 'inspector.selectEquipment')}</option>
          {plant.map((e) => (
            <option key={e.id} value={e.id}>
              {e.id} — {e.model}
            </option>
          ))}
        </select>
      </label>
      {selected !== null && (
        <div data-testid="inspector-detail">
          <p>
            {selected.id} — {selected.model}
            {selected.controller !== undefined ? ` (${selected.controller})` : ''}
          </p>
          <h3>{t(lang, 'inspector.observables')}</h3>
          <ul data-testid="inspector-observables">
            {Object.entries(selected.observables).map(([key, value]) => (
              <li key={key}>
                {key}: {String(value)}
              </li>
            ))}
          </ul>
          <h3>{t(lang, 'inspector.roleValues')}</h3>
          <ul data-testid="inspector-role-values">
            {Object.entries(selected.roleValues).map(([role, rv]) => {
              const formatted = formatRoleValue(rv);
              return (
                <li key={role} data-testid={`role-value-${role}`}>
                  {role}: {rv.tag} — {formatted.text}
                  {formatted.overRange && (
                    <span data-testid={`role-overrange-${role}`}>
                      {' '}
                      ({t(lang, 'inspector.overRange')})
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <h3>{t(lang, 'inspector.faults')}</h3>
          {selected.faults.length === 0 ? (
            <p>{t(lang, 'inspector.noFaults')}</p>
          ) : (
            <ul>
              {selected.faults.map((f) => (
                <li key={f.id}>
                  {f.id} — {f.state}{' '}
                  <button
                    data-testid={`fault-clear-${f.id}`}
                    onClick={() => {
                      onPlantFaultClear(f.id);
                    }}
                    type="button"
                  >
                    {t(lang, 'inspector.clear')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected.faultDefs.length > 0 && (
            <div>
              <select
                data-testid="fault-inject-select"
                value={faultSel}
                onChange={(e) => {
                  setFaultSel(e.target.value);
                }}
              >
                <option value="">{t(lang, 'inspector.inject')}</option>
                {selected.faultDefs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.id} — {f.description}
                  </option>
                ))}
              </select>{' '}
              <button
                data-testid="fault-inject"
                disabled={faultSel === ''}
                onClick={() => {
                  onPlantFaultInject({
                    target: { equipment: selected.id, fault: faultSel },
                    when: { at: 'now' },
                  });
                }}
                type="button"
              >
                {t(lang, 'inspector.inject')}
              </button>
            </div>
          )}
          {selected.presets.length > 0 && (
            <div>
              <select
                data-testid="preset-select"
                value={presetSel}
                onChange={(e) => {
                  setPresetSel(e.target.value);
                }}
              >
                <option value="">{t(lang, 'inspector.preset')}</option>
                {selected.presets.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} — {p.description}
                  </option>
                ))}
              </select>{' '}
              <button
                data-testid="preset-apply"
                disabled={presetSel === ''}
                onClick={() => {
                  onPlantFaultPreset(selected.id, presetSel);
                }}
                type="button"
              >
                {t(lang, 'inspector.applyPreset')}
              </button>
            </div>
          )}
          {selectedModel?.hasSource === true && (
            <div>
              <h3>
                {t(lang, 'inspector.manual')} / {t(lang, 'inspector.source')}
              </h3>
              <select
                data-testid="inspector-source-kind"
                value={sourceKind}
                onChange={(e) => {
                  setSourceKind(e.target.value as 'manual' | 'const');
                }}
              >
                <option value="manual">{t(lang, 'inspector.manual')}</option>
                <option value="const">const</option>
              </select>{' '}
              <input
                data-testid="inspector-source-value"
                aria-label={t(lang, 'inspector.value')}
                placeholder={t(lang, 'inspector.value')}
                value={sourceValue}
                onChange={(e) => {
                  setSourceValue(e.target.value);
                }}
              />{' '}
              <button
                data-testid="inspector-source-set"
                onClick={() => {
                  applySource();
                }}
                type="button"
              >
                {t(lang, 'inspector.set')}
              </button>
              {sourceError !== null && <span data-testid="inspector-source-error"> {sourceError}</span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
