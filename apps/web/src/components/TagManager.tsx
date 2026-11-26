// Tag Manager — @vcs/web (M2 §10.2, OQ-385/395; thay TagTable M0).
// Bảng ảo hóa ≥ 20 000 dòng (tái dùng pattern TagTable): lọc theo tên/mô tả,
// controller, vùng, loại, thiết bị; cột equipment/role (join GET /api/tags
// từ đĩa theo tên tag — giá trị live vẫn qua WS snapshot); sửa trực tiếp ô
// equipment/role (POST /api/tags, null = xóa); nhóm theo thiết bị; xuất CSV.
// Nguồn equipment/role là FILE trên đĩa — sau commit chưa restart, sim đang
// chạy có thể dùng bản cũ (ghi rõ + nút refresh, OQ-385). Lọc theo "trạng
// thái lỗi" (§10.2) KHÔNG có nguồn dữ liệu ở cấp tag → không làm (ghi lại).
// Ô giá trị tái dùng TagValueCell (hành vi ghi/ghi thử A19 giữ nguyên).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TagValue } from '@vcs/schemas';
import { createImportClient } from '../api/import.js';
import { t, type Lang } from '../i18n/index.js';
import { useSimSnapshot } from '../store.js';
import {
  ALL,
  buildTagCsv,
  buildTagMetaMap,
  distinctEquipment,
  distinctRoles,
  filterTagRows,
  groupTagRows,
  type TagListItem,
  type TagMetaMap,
  type TagRow,
} from '../tag-manager.js';
import { TagValueCell } from './TagValueCell.js';

const COLS = '11rem 4.5rem 3.5rem 6rem 6rem minmax(8rem, 1fr) 7rem 7rem 11rem';

export interface TagManagerProps {
  lang: Lang;
  onWriteTag: (name: string, value: TagValue) => void;
}

export function TagManager({ lang, onWriteTag }: TagManagerProps) {
  const s = useSimSnapshot();
  const api = useMemo(() => createImportClient(), []);
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [meta, setMeta] = useState<TagMetaMap>(new Map());
  const [metaError, setMetaError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [equipmentFilter, setEquipmentFilter] = useState<string>(ALL);
  const [groupBy, setGroupBy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const loadMeta = useCallback(async (): Promise<void> => {
    try {
      const tags = await api.getTags();
      setMeta(buildTagMetaMap(tags));
      setMetaError(null);
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : t(lang, 'tags.meta.error'));
    }
  }, [api, lang]);

  useEffect(() => {
    void loadMeta();
    // Chỉ nạp 1 lần lúc mở view (OQ-385: file đổi từ ngoài → nút refresh).
  }, [loadMeta]);

  const rows: TagRow[] = useMemo(
    () =>
      filterTagRows(s.defs, meta, s.values, {
        query: s.filterQuery,
        controller: s.filterController,
        area: s.filterArea,
        type: typeFilter,
        equipment: equipmentFilter,
      }),
    [s, meta, typeFilter, equipmentFilter],
  );
  const items: TagListItem[] = useMemo(() => groupTagRows(rows, groupBy), [rows, groupBy]);
  const virtualizer = useVirtualizer({
    count: items.length,
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
  const types = useMemo(() => {
    const seen = new Set<string>();
    for (const d of s.defs) seen.add(d.type);
    return [...seen];
  }, [s.defs]);
  const equipments = useMemo(() => distinctEquipment(meta), [meta]);
  const roles = useMemo(() => distinctRoles(meta), [meta]);

  async function saveMeta(
    name: string,
    kind: 'equipment' | 'role',
    value: string | null,
  ): Promise<void> {
    setSaving(name);
    setEditError(null);
    try {
      await api.updateTag(
        name,
        kind === 'equipment' ? value : undefined,
        kind === 'role' ? value : undefined,
      );
      await loadMeta();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t(lang, 'tags.meta.error'));
    } finally {
      setSaving(null);
    }
  }

  function exportCsv(): void {
    const csv = buildTagCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tags.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

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
        <select
          aria-label={t(lang, 'tags.filter.allTypes')}
          data-testid="filter-type"
          onChange={(e) => {
            setTypeFilter(e.target.value);
          }}
          value={typeFilter}
        >
          <option value="all">{t(lang, 'tags.filter.allTypes')}</option>
          {types.map((ty) => (
            <option key={ty} value={ty}>
              {ty}
            </option>
          ))}
        </select>
        <select
          aria-label={t(lang, 'tags.filter.allEquipment')}
          data-testid="filter-equipment"
          onChange={(e) => {
            setEquipmentFilter(e.target.value);
          }}
          value={equipmentFilter}
        >
          <option value="all">{t(lang, 'tags.filter.allEquipment')}</option>
          <option value="">{t(lang, 'tags.filter.unassigned')}</option>
          {equipments.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1">
          <input
            data-testid="tag-group-by"
            checked={groupBy}
            onChange={(e) => {
              setGroupBy(e.target.checked);
            }}
            type="checkbox"
          />
          {t(lang, 'tags.groupBy')}
        </label>
        <button data-testid="tag-export-csv" onClick={exportCsv} type="button">
          {t(lang, 'tags.exportCsv')}
        </button>
        <button
          data-testid="tag-refresh"
          onClick={() => {
            void loadMeta();
          }}
          type="button"
        >
          {t(lang, 'tags.refresh')}
        </button>
        <span data-testid="tags-count">
          {rows.length} / {s.defs.length} tag
        </span>
      </div>
      <p className="mb-1 text-sm text-gray-500" data-testid="tag-source-note">
        {t(lang, 'tags.sourceNote')}
        {metaError !== null && ` — ${metaError}`}
      </p>
      {editError !== null && (
        <p className="mb-1 text-red-600" data-testid="tag-edit-error" role="alert">
          {editError}
        </p>
      )}
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
        <span role="columnheader">{t(lang, 'tags.col.equipment')}</span>
        <span role="columnheader">{t(lang, 'tags.col.role')}</span>
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
            const item = items[vi.index];
            if (item === undefined) return null;
            if (item.kind === 'group') {
              return (
                <div
                  key={item.key}
                  className="flex items-center border-b border-gray-300 bg-gray-100 px-2 font-semibold dark:border-gray-700 dark:bg-gray-800"
                  data-testid={`tag-group-${item.equipment === '' ? 'unassigned' : item.equipment}`}
                  role="row"
                  style={{
                    height: '36px',
                    left: 0,
                    position: 'absolute',
                    top: 0,
                    transform: `translateY(${String(vi.start)}px)`,
                    width: '100%',
                  }}
                >
                  {item.equipment === '' ? t(lang, 'tags.filter.unassigned') : item.equipment} ({item.count})
                </div>
              );
            }
            return (
              <TagManagerRow
                key={item.key}
                row={item.row}
                lang={lang}
                onWriteTag={onWriteTag}
                onSaveMeta={(kind, value) => void saveMeta(item.row.def.name, kind, value)}
                saving={saving === item.row.def.name}
                top={vi.start}
              />
            );
          })}
        </div>
      </div>
      <datalist id="tag-equipment-options">
        {equipments.map((e) => (
          <option key={e} value={e} />
        ))}
      </datalist>
      <datalist id="tag-role-options">
        {roles.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
    </section>
  );
}

interface TagManagerRowProps {
  row: TagRow;
  top: number;
  lang: Lang;
  onWriteTag: (name: string, value: TagValue) => void;
  onSaveMeta: (kind: 'equipment' | 'role', value: string | null) => void;
  saving: boolean;
}

function TagManagerRow({
  row,
  top,
  lang,
  onWriteTag,
  onSaveMeta,
  saving,
}: TagManagerRowProps) {
  const s = useSimSnapshot();
  const { def } = row;
  const flashing = s.changed.has(row.defIndex);
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
      <span role="cell">
        <MetaCell
          testId={`tag-edit-equipment-${def.name}`}
          value={row.equipment}
          listId="tag-equipment-options"
          disabled={saving}
          onSave={(v) => {
            onSaveMeta('equipment', v);
          }}
        />
      </span>
      <span role="cell">
        <MetaCell
          testId={`tag-edit-role-${def.name}`}
          value={row.role}
          listId="tag-role-options"
          disabled={saving}
          onSave={(v) => {
            onSaveMeta('role', v);
          }}
        />
      </span>
      <span className={flashing ? 'flash' : ''} data-testid={`value-${def.name}`} role="cell">
        <TagValueCell def={def} lang={lang} onWriteTag={onWriteTag} value={row.value} />
      </span>
    </div>
  );
}

interface MetaCellProps {
  testId: string;
  value: string;
  listId: string;
  disabled: boolean;
  onSave: (value: string | null) => void;
}

/** Ô sửa equipment/role: text + datalist gợi ý; Enter/blur → lưu; rỗng = xóa. */
function MetaCell({ testId, value, listId, disabled, onSave }: MetaCellProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const commit = (): void => {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (next !== value) onSave(next === '' ? null : next);
  };
  return (
    <input
      aria-label={testId}
      className="w-full min-w-0"
      data-testid={testId}
      disabled={disabled}
      list={listId}
      onBlur={commit}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      type="text"
      value={shown}
    />
  );
}
