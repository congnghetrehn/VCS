// TagError — @vcs/kernel (M0 §6.2; OQ-016).
// Lỗi ghi tag mang mã chẩn đoán đã đăng ký (TAG-E001…E003); thông điệp lấy
// tiêu đề + gợi ý từ DiagnosticCatalog, kèm chi tiết đối tượng gây lỗi.

import { PRJ_CATALOG } from '@vcs/schemas';

export type TagErrorCode = 'TAG-E001' | 'TAG-E002' | 'TAG-E003';

export class TagError extends Error {
  readonly code: TagErrorCode;

  constructor(code: TagErrorCode, detail: string) {
    const info = PRJ_CATALOG.get(code);
    const title = info?.title ?? code;
    const hint = info?.hint;
    super(
      hint !== undefined
        ? `${code}: ${title} — ${detail} (${hint})`
        : `${code}: ${title} — ${detail}`,
    );
    this.name = 'TagError';
    this.code = code;
  }
}
