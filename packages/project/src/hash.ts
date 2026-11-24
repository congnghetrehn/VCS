// Hash văn bản — @vcs/project (M0 §5).
// Chuẩn hóa BOM/CRLF rồi sha256, nên Windows và Linux cho cùng hash.

import { createHash } from 'node:crypto';

export function normalizeTextForHash(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

export function hashText(text: string): string {
  return createHash('sha256').update(normalizeTextForHash(text), 'utf8').digest('hex');
}
