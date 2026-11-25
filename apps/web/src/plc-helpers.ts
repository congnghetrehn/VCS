// Helper thuần cho PLC Workspace — @vcs/web (P1.7).
// Không import React/Monaco để test được bằng vitest node.

import type { TagValue } from '@vcs/schemas';

/**
 * Parse giá trị người dùng nhập trong bảng Watch theo kiểu giá trị hiện
 * tại: boolean nhận `true/false/1/0` (không phân biệt hoa thường); number
 * nhận số (kể cả `NaN`); string giữ nguyên. Sai định dạng → lỗi có message.
 */
export function parseWatchValue(current: TagValue, input: string): TagValue {
  const text = input.trim();
  if (typeof current === 'boolean') {
    const low = text.toLowerCase();
    if (low === 'true' || low === '1') return true;
    if (low === 'false' || low === '0') return false;
    throw new Error(`giá trị boolean phải là true/false, nhận '${input}'`);
  }
  if (typeof current === 'number') {
    if (text === '') throw new Error('giá trị số không được rỗng');
    const n = Number(text);
    if (!Number.isFinite(n) && text.toLowerCase() !== 'nan') {
      throw new Error(`giá trị số không hợp lệ: '${input}'`);
    }
    return n;
  }
  return input;
}

/** Ref Watch hợp lệ: không rỗng, không chứa khoảng trắng. */
export function isValidWatchRef(ref: string): boolean {
  const t = ref.trim();
  return t !== '' && !/\s/.test(t);
}

/** Tên file PLC mới hợp lệ: `.scl` hoặc `.lad.json`, không chứa `/..`. */
export function isValidPlcFileName(name: string): boolean {
  const t = name.trim();
  if (t === '' || t.includes('..') || t.startsWith('/')) return false;
  return t.endsWith('.scl') || t.endsWith('.lad.json');
}
