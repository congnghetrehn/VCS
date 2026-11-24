// Bảng Tags ảo hóa — @vcs/web (M0 §8.3, OQ-061, OQ-070, A19).
// Cột Tên/Kiểu/Vùng/Địa chỉ/Controller/Mô tả/Giá trị; Bool TRUE/FALSE + chấm
// màu; ô đổi nháy nhẹ (class flash từ store.changed); lọc chuỗi tên/mô tả +
// lọc controller/vùng (AND). Ô giá trị tag free sửa được (Bool nút bật/tắt,
// số nhập — chỉ kiểm cú pháp, khoảng do server quyết TAG-E001). Ô non-free
// chỉ đọc + nút "Ghi thử" (A19): bấm gửi tag.write thật, server trả TAG-E002.

import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TagValue } from '@vcs/schemas';
import { t, type Lang } from '../i18n/index.js';
import {
  selectFilteredIndices,
  useSimSnapshot,
  type SnapshotDef,
} from '../store.js';

const COLS = '11rem 4.5rem 3.5rem 6rem 6rem minmax(8rem, 1fr) 11rem';

export interface TagTableProps {
  lang: Lang;
  onWriteTag: (name: string, value: TagValue) => void;
}

export function TagTable({ lang, onWriteTag }: TagTableProps) {
  const s = useSimSnapshot();
  const parentRef = useRef<HTMLDivElement | null>(null);
  const filtered = useMemo(() => selectFilteredIndices(s), [s]);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    estimateSize: () => 36,
    getScrollElement: () => parentRef.current,
    overscan: 10,
  });
  const controllers = useMemo(() => {
    const seen = new Set<string>();
    for (const d of s.defs) seen.add(d.controller);
    return [...seen];
  }, [s.defs]);
  const areas = useMemo(() => {
    const seen = new Set<string>();
    for (const d of s.defs) seen.add(d.area);
    return [...seen];
  }, [s.defs]);

  return (
    <section aria-label={t(lang, 'tags.title')} className="flex min-h-0 flex-1 flex-col px-4 py-2">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{t(lang, 'tags.title')}</h2>
        <input
          aria-label={t(lang, 'tags.filter.placeholder')}
          data-testid="filter-text"
          onChange={(e) => {
            s.setFilter({ query: e.target.value });
          }}
          placeholder={t(lang, 'tags.filter.placeholder')}
          type="search"
          value={s.filterQuery}
        />
        <select
          aria-label={t(lang, 'tags.filter.allControllers')}
          data-testid="filter-controller"
          onChange={(e) => {
            s.setFilter({ controller: e.target.value });
          }}
          value={s.filterController}
        >
          <option value="all">{t(lang, 'tags.filter.allControllers')}</option>
          {controllers.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          aria-label={t(lang, 'tags.filter.allAreas')}
          data-testid="filter-area"
          onChange={(e) => {
            s.setFilter({ area: e.target.value });
          }}
          value={s.filterArea}
        >
          <option value="all">{t(lang, 'tags.filter.allAreas')}</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <span data-testid="tags-count">
          {filtered.length} / {s.defs.length} tag
        </span>
      </div>
      <div
        className="grid border-b border-gray-300 font-semibold dark:border-gray-700"
        role="row"
        style={{ gridTemplateColumns: COLS }}
      >
        <span role="columnheader">{t(lang, 'tags.col.name')}</span>
        <span role="columnheader">{t(lang, 'tags.col.type')}</span>
        <span role="columnheader">{t(lang, 'tags.col.area')}</span>
        <span role="columnheader">{t(lang, 'tags.col.address')}</span>
        <span role="columnheader">{t(lang, 'tags.col.controller')}</span>
        <span role="columnheader">{t(lang, 'tags.col.description')}</span>
        <span role="columnheader">{t(lang, 'tags.col.value')}</span>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto"
        data-testid="tags-body"
        ref={parentRef}
        role="rowgroup"
      >
        <div style={{ height: `${String(virtualizer.getTotalSize())}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const defIndex = filtered[vi.index];
            if (defIndex === undefined) return null;
            return (
              <TagRow
                defIndex={defIndex}
                key={vi.key}
                lang={lang}
                onWriteTag={onWriteTag}
                top={vi.start}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

interface TagRowProps {
  defIndex: number;
  top: number;
  lang: Lang;
  onWriteTag: (name: string, value: TagValue) => void;
}

function TagRow({ defIndex, top, lang, onWriteTag }: TagRowProps) {
  const s = useSimSnapshot();
  const def = s.defs[defIndex];
  if (def === undefined) return null;
  const value = s.values.get(defIndex);
  const flashing = s.changed.has(defIndex);
  return (
    <div
      className="grid items-center border-b border-gray-100 dark:border-gray-800"
      data-testid={`tag-${def.name}`}
      role="row"
      style={{
        gridTemplateColumns: COLS,
        height: '36px',
        left: 0,
        position: 'absolute',
        top: 0,
        transform: `translateY(${String(top)}px)`,
        width: '100%',
      }}
    >
      <span className="truncate font-mono" role="cell">
        {def.name}
      </span>
      <span role="cell">{def.type}</span>
      <span role="cell">{def.area}</span>
      <span className="font-mono" role="cell">
        {def.address}
      </span>
      <span role="cell">{def.controller}</span>
      <span className="truncate" role="cell">
        {def.description ?? ''}
      </span>
      <span className={flashing ? 'flash' : ''} data-testid={`value-${def.name}`} role="cell">
        <ValueCell def={def} lang={lang} onWriteTag={onWriteTag} value={value} />
      </span>
    </div>
  );
}

interface ValueCellProps {
  def: SnapshotDef;
  value: TagValue | undefined;
  lang: Lang;
  onWriteTag: (name: string, value: TagValue) => void;
}

function ValueCell({ def, value, lang, onWriteTag }: ValueCellProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (def.writable && def.type === 'Bool') {
    const on = value === true;
    return (
      <span className="inline-flex items-center gap-2">
        <span
          aria-label={on ? 'TRUE' : 'FALSE'}
          className={on ? 'inline-block h-2.5 w-2.5 rounded-full bg-green-500' : 'inline-block h-2.5 w-2.5 rounded-full bg-gray-400'}
        />
        <button
          aria-label={`${t(lang, 'tags.write.toggle')} ${def.name}`}
          data-testid={`toggle-${def.name}`}
          onClick={() => {
            onWriteTag(def.name, !on);
          }}
          type="button"
        >
          {on ? 'TRUE' : 'FALSE'}
        </button>
      </span>
    );
  }

  if (def.writable && typeof value === 'number') {
    const shown = draft ?? String(value);
    const commit = (): void => {
      if (draft === null) return;
      const text = draft.trim();
      if (text === '' || Number.isNaN(Number(text))) {
        setError(t(lang, 'tags.write.invalidNumber'));
        return;
      }
      setError(null);
      setDraft(null);
      onWriteTag(def.name, Number(text));
    };
    return (
      <span className="inline-flex items-center gap-1">
        <input
          aria-label={def.name}
          className="w-24"
          data-testid={`input-${def.name}`}
          onBlur={commit}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
          type="number"
          value={shown}
        />
        {error !== null && (
          <span className="text-red-600" data-testid={`error-${def.name}`}>
            {error}
          </span>
        )}
      </span>
    );
  }

  if (def.writable && typeof value === 'string') {
    const shown = draft ?? value;
    return (
      <span className="inline-flex items-center gap-1">
        <input
          aria-label={def.name}
          className="w-24"
          data-testid={`input-${def.name}`}
          onBlur={() => {
            if (draft === null) return;
            setDraft(null);
            onWriteTag(def.name, draft);
          }}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          type="text"
          value={shown}
        />
      </span>
    );
  }

  // Ô non-free: chỉ đọc + nút "Ghi thử" (A19). Giá trị thử: Bool đảo, số +1.
  const tryValue: TagValue =
    typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : value ?? '';
  return (
    <span className="inline-flex items-center gap-2">
      <span data-testid={`value-text-${def.name}`}>
        {typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : String(value ?? '')}
      </span>
      <button
        data-testid={`try-write-${def.name}`}
        onClick={() => {
          onWriteTag(def.name, tryValue);
        }}
        title={t(lang, 'tags.write.tryTitle')}
        type="button"
      >
        {t(lang, 'tags.write.try')}
      </button>
    </span>
  );
}
