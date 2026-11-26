// PlantFaultPanel — @vcs/web (P2.4, OQ-308/318).
// Liệt kê lỗi plant của từng thiết bị + chèn/clear lỗi + áp preset qua WS
// plant.fault.*; dữ liệu qua GET /api/plant (poll 1 s + refresh sau thao tác
// — WS plant.fault.* không có ack, như tag.write). Inject/preset dùng
// when {at:'time', timeMs: simTimeMs} — cùng ngữ nghĩa thời gian với
// scenario runner (kịch bản A–D), nên hash parity với CLI giữ được.

import { useEffect, useState } from 'react';
import type { FaultRequest, FaultTiming } from '@vcs/schemas';
import { t, type Lang } from '../i18n/index.js';
import { useSimSnapshot } from '../store.js';

export interface PlantFaultPanelProps {
  lang: Lang;
  onPlantFaultInject: (request: FaultRequest) => void;
  onPlantFaultClear: (id: string) => void;
  onPlantFaultPreset: (equipment: string, preset: string, when?: FaultTiming) => void;
}

interface PlantFaultDef {
  id: string;
  description: string;
}

interface PlantPresetDef {
  name: string;
  description: string;
}

interface PlantFaultRecordView {
  id: string;
  target: unknown;
  state: string;
  sinceMs: number;
}

interface PlantEquipmentView {
  id: string;
  model: string;
  controller?: string;
  faults: PlantFaultRecordView[];
  observables: Record<string, unknown>;
  faultDefs: PlantFaultDef[];
  presets: PlantPresetDef[];
}

interface PlantBody {
  equipment: PlantEquipmentView[];
}

async function fetchPlant(): Promise<PlantBody> {
  const res = await fetch('/api/plant');
  if (!res.ok) throw new Error(`GET /api/plant → HTTP ${String(res.status)}`);
  return (await res.json()) as PlantBody;
}

/** Mô tả ngắn một fault target (equipment fault hoặc signal fault). */
function describeTarget(target: unknown): string {
  if (typeof target !== 'object' || target === null) return String(target);
  const t = target as Record<string, unknown>;
  if (typeof t['fault'] === 'string') return t['fault'];
  if (typeof t['signal'] === 'string') {
    const type = typeof t['type'] === 'string' ? ` ${t['type']}` : '';
    return `${t['signal']}${type}`;
  }
  return JSON.stringify(target);
}

export function PlantFaultPanel({
  lang,
  onPlantFaultInject,
  onPlantFaultClear,
  onPlantFaultPreset,
}: PlantFaultPanelProps) {
  const s = useSimSnapshot();
  const simTimeMs = s.sim?.simTimeMs ?? 0;
  const [plant, setPlant] = useState<PlantBody | null>(null);
  const [faultSel, setFaultSel] = useState<Record<string, string>>({});
  const [presetSel, setPresetSel] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void fetchPlant()
        .then((b) => {
          if (alive) setPlant(b);
        })
        .catch((e: unknown) => {
          if (alive) setErr(e instanceof Error ? e.message : String(e));
        });
    };
    load();
    const timer = setInterval(load, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const refreshSoon = (): void => {
    setTimeout(() => {
      void fetchPlant()
        .then((b) => {
          setPlant(b);
        })
        .catch((e: unknown) => {
          setErr(e instanceof Error ? e.message : String(e));
        });
    }, 300);
  };

  if (plant === null) {
    return (
      <section
        aria-label={t(lang, 'plant.title')}
        className="border-t border-gray-300 px-4 py-2 dark:border-gray-700"
        data-testid="plant-fault-panel"
      >
        <h2>{t(lang, 'plant.title')}</h2>
        {err !== null ? <p>{err}</p> : null}
      </section>
    );
  }
  if (plant.equipment.length === 0) {
    return (
      <section
        aria-label={t(lang, 'plant.title')}
        className="border-t border-gray-300 px-4 py-2 dark:border-gray-700"
        data-testid="plant-fault-panel"
      >
        <h2>{t(lang, 'plant.title')}</h2>
        <p>{t(lang, 'plant.noPlant')}</p>
      </section>
    );
  }

  return (
    <section
      aria-label={t(lang, 'plant.title')}
      className="border-t border-gray-300 px-4 py-2 dark:border-gray-700"
      data-testid="plant-fault-panel"
    >
      <h2>{t(lang, 'plant.title')}</h2>
      {plant.equipment.map((eq) => {
        const activeFaults = eq.faults.filter((f) => f.state !== 'cleared');
        const faultId = faultSel[eq.id] ?? eq.faultDefs[0]?.id ?? '';
        const presetName = presetSel[eq.id] ?? eq.presets[0]?.name ?? '';
        return (
          <div key={eq.id} data-testid={`plant-equipment-${eq.id}`}>
            <h3>
              {eq.id} — {eq.model}
              {eq.controller !== undefined ? ` (${eq.controller})` : ''}
            </h3>
            {Object.keys(eq.observables).length > 0 ? (
              <ul data-testid={`plant-observables-${eq.id}`}>
                {Object.entries(eq.observables).map(([k, v]) => (
                  <li key={k}>
                    {k}: {String(v)}
                  </li>
                ))}
              </ul>
            ) : null}
            {eq.faultDefs.length > 0 ? (
              <div>
                <select
                  aria-label={t(lang, 'plant.inject')}
                  data-testid={`plant-fault-select-${eq.id}`}
                  onChange={(e) => {
                    setFaultSel((m) => ({ ...m, [eq.id]: e.target.value }));
                  }}
                  value={faultId}
                >
                  {eq.faultDefs.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.id} — {f.description}
                    </option>
                  ))}
                </select>
                <button
                  data-testid={`plant-fault-inject-${eq.id}`}
                  onClick={() => {
                    if (faultId === '') return;
                    onPlantFaultInject({
                      target: { equipment: eq.id, fault: faultId },
                      when: { at: 'time', timeMs: simTimeMs },
                    });
                    refreshSoon();
                  }}
                  type="button"
                >
                  {t(lang, 'plant.inject')}
                </button>
              </div>
            ) : null}
            {eq.presets.length > 0 ? (
              <div>
                <select
                  aria-label={t(lang, 'plant.preset')}
                  data-testid={`plant-fault-preset-select-${eq.id}`}
                  onChange={(e) => {
                    setPresetSel((m) => ({ ...m, [eq.id]: e.target.value }));
                  }}
                  value={presetName}
                >
                  {eq.presets.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} — {p.description}
                    </option>
                  ))}
                </select>
                <button
                  data-testid={`plant-fault-preset-${eq.id}`}
                  onClick={() => {
                    if (presetName === '') return;
                    onPlantFaultPreset(eq.id, presetName, {
                      at: 'time',
                      timeMs: simTimeMs,
                    });
                    refreshSoon();
                  }}
                  type="button"
                >
                  {t(lang, 'plant.preset')}
                </button>
              </div>
            ) : null}
            <div>
              <strong>{t(lang, 'plant.faults')}</strong>
              {activeFaults.length === 0 ? (
                <p>{t(lang, 'plant.noFaults')}</p>
              ) : (
                <ul>
                  {activeFaults.map((f) => (
                    <li key={f.id} data-testid={`plant-fault-${f.id}`}>
                      {describeTarget(f.target)} — {f.state} ({String(f.sinceMs)} ms)
                      <button
                        data-testid={`plant-fault-clear-${f.id}`}
                        onClick={() => {
                          onPlantFaultClear(f.id);
                          refreshSoon();
                        }}
                        type="button"
                      >
                        {t(lang, 'plant.clear')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
