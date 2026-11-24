// Diagnostics panel — @vcs/web (M0 §8.3, OQ-065).
// Dữ liệu từ message WS `diagnostics` (không gọi REST); thu gọn mặc định,
// badge đếm số mục ở tiêu đề.

import { useState } from 'react';
import { t, type Lang } from '../i18n/index.js';
import { useSimSnapshot } from '../store.js';

export function DiagnosticsPanel({ lang }: { lang: Lang }) {
  const s = useSimSnapshot();
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-label={t(lang, 'diag.title')}
      className="border-t border-gray-300 px-4 py-2 dark:border-gray-700"
      data-testid="diagnostics-panel"
    >
      <button
        aria-expanded={open}
        data-testid="diagnostics-toggle"
        onClick={() => {
          setOpen((o) => !o);
        }}
        type="button"
      >
        {t(lang, 'diag.title')} ({s.diagnostics.length})
      </button>
      {open &&
        (s.diagnostics.length === 0 ? (
          <p>{t(lang, 'diag.empty')}</p>
        ) : (
          <ul>
            {s.diagnostics.map((d, i) => (
              <li key={`${d.code}-${String(i)}`}>
                <strong>{d.code}</strong>: {d.message}
                {d.hint !== undefined ? ` — ${d.hint}` : ''}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
