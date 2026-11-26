// Event log plant (M2 §10.4, P2.8 commit 8, OQ-389).
// Poll GET /api/plant 1 s; server đã cắt ≤ 100 dòng mới nhất — UI hiện đúng
// số đó, không cắt thêm, không tự sinh event.

import { useEffect, useMemo, useState } from 'react';
import { createImportClient, type PlantEvent } from '../api/import.js';
import { t, type Lang } from '../i18n/index.js';
import { formatEventLine } from '../plant-designer.js';

export function EventLog({ lang }: { lang: Lang }) {
  const api = useMemo(() => createImportClient(), []);
  const [events, setEvents] = useState<PlantEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const snap = await api.getPlant();
        if (cancelled) return;
        setEvents(snap.events);
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

  return (
    <section aria-label={t(lang, 'eventlog.title')}>
      <h2>{t(lang, 'eventlog.title')}</h2>
      {error !== null ? (
        <p data-testid="eventlog-error">
          {t(lang, 'designer.error')}: {error}
        </p>
      ) : events.length === 0 ? (
        <p data-testid="eventlog-empty">{t(lang, 'eventlog.empty')}</p>
      ) : (
        <ul data-testid="event-log">
          {events.map((e, i) => (
            <li key={`${String(e.t)}-${String(i)}`}>{formatEventLine(e)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
