// Ô giá trị của một tag trong bảng Tags — tách từ TagTable (M0 §8.3, A19)
// để TagManager (P2.8) tái dùng đúng hành vi: tag free sửa được (Bool nút
// bật/tắt, số nhập — chỉ kiểm cú pháp, khoảng do server quyết TAG-E001);
// ô non-free chỉ đọc + nút "Ghi thử" (A19): bấm gửi tag.write thật, server
// trả TAG-E002. Giá trị thử: Bool đảo, số +1.

import { useState } from 'react';
import type { TagValue } from '@vcs/schemas';
import { t, type Lang } from '../i18n/index.js';
import type { SnapshotDef } from '../store.js';

export interface TagValueCellProps {
  def: SnapshotDef;
  value: TagValue | undefined;
  lang: Lang;
  onWriteTag: (name: string, value: TagValue) => void;
}

export function TagValueCell({ def, value, lang, onWriteTag }: TagValueCellProps) {
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
