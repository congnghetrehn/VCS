// Sim bar — @vcs/web (M0 §8.3).
// Run/Pause/Step/Reset, chọn tốc độ, simTime mm:ss.mmm + ms, stepCount,
// trạng thái, lagging + achievedScale. Step chỉ bật khi không RUNNING
// (bấm Step khi RUNNING → server trả WS-E002, xem STATE §13 E1 ghi chú (c)).

import { formatSimTime } from '../format.js';
import { t, type Lang } from '../i18n/index.js';
import { useSimSnapshot } from '../store.js';

const TIME_SCALES: Array<{ value: number | 'max'; label: string }> = [
  { value: 0.1, label: '0.1×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 10, label: '10×' },
  { value: 100, label: '100×' },
  { value: 'max', label: 'max' },
];

export interface SimBarProps {
  lang: Lang;
  onCommand: (cmd: 'run' | 'pause' | 'step' | 'reset') => void;
  onTimeScale: (value: number | 'max') => void;
}

export function SimBar({ lang, onCommand, onTimeScale }: SimBarProps) {
  const s = useSimSnapshot();
  const sim = s.sim;
  const state = sim?.state ?? 'IDLE';
  return (
    <section
      aria-label={t(lang, 'sim.state')}
      className="flex flex-wrap items-center gap-2 border-b border-gray-300 px-4 py-2 dark:border-gray-700"
    >
      <button
        data-testid="btn-run"
        disabled={state === 'RUNNING'}
        onClick={() => {
          onCommand('run');
        }}
        type="button"
      >
        {t(lang, 'sim.run')}
      </button>
      <button
        data-testid="btn-pause"
        disabled={state !== 'RUNNING'}
        onClick={() => {
          onCommand('pause');
        }}
        type="button"
      >
        {t(lang, 'sim.pause')}
      </button>
      <button
        data-testid="btn-step"
        disabled={state === 'RUNNING'}
        onClick={() => {
          onCommand('step');
        }}
        type="button"
      >
        {t(lang, 'sim.step')}
      </button>
      <button
        data-testid="btn-reset"
        onClick={() => {
          onCommand('reset');
        }}
        type="button"
      >
        {t(lang, 'sim.reset')}
      </button>
      <label>
        {t(lang, 'sim.timeScale')}{' '}
        <select
          data-testid="timescale-select"
          onChange={(e) => {
            const v = e.target.value;
            onTimeScale(v === 'max' ? 'max' : Number(v));
          }}
          value={String(sim?.timeScale ?? 1)}
        >
          {TIME_SCALES.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <span>
        {t(lang, 'sim.simTime')}:{' '}
        <span data-testid="sim-time">{formatSimTime(sim?.simTimeMs ?? 0)}</span>
      </span>
      <span>
        {t(lang, 'sim.stepCount')}: <span data-testid="step-count">{sim?.stepCount ?? 0}</span>
      </span>
      <span>
        {t(lang, 'sim.state')}: <span data-testid="sim-state">{state}</span>
      </span>
      <span data-testid="sim-lagging">
        {t(lang, 'sim.lagging')}: {sim?.lagging === true ? 'TRUE' : 'FALSE'}
      </span>
      <span data-testid="sim-achieved-scale">
        {t(lang, 'sim.achievedScale')}: {sim?.achievedScale ?? 1}
      </span>
    </section>
  );
}
