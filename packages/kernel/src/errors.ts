// TagError — @vcs/kernel (M0 §6.2; OQ-016).
// Lỗi ghi tag mang mã chẩn đoán đã đăng ký (TAG-E001…E003); thông điệp lấy
// tiêu đề + gợi ý từ DiagnosticCatalog, kèm chi tiết đối tượng gây lỗi.

import { PRJ_CATALOG } from '@vcs/schemas';
import type { Diagnostic } from '@vcs/schemas';
import type { Phase } from './component.js';

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

/**
 * Lỗi một component ném ra khi chạy bước (M0 §6.7; OQ-020).
 * Policy `throw` lan truyền lỗi này ra ngoài `stepOnce()`; policy `isolate`
 * đánh dấu component faulted và phát diagnostic `SIM-E001` thay vì ném.
 */
export class SimComponentError extends Error {
  readonly id: string;
  readonly phase: Phase;
  readonly simTimeMs: number;
  override readonly cause: unknown;

  constructor(id: string, phase: Phase, simTimeMs: number, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(
      `SIM-E001: component '${id}' lỗi ở pha '${phase}' tại T=${String(simTimeMs)} — ${reason}`,
    );
    this.name = 'SimComponentError';
    this.id = id;
    this.phase = phase;
    this.simTimeMs = simTimeMs;
    this.cause = cause;
  }
}

/**
 * `createSimulation` ném khi project có diagnostic mức error (M0 §6.8 bước 1;
 * OQ-020). Mang toàn bộ danh sách diagnostics để caller in ra.
 */
export class ProjectInvalidError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[]) {
    super(
      `ProjectInvalidError: dự án không hợp lệ (${String(diagnostics.length)} diagnostic, ` +
        `${String(diagnostics.filter((d) => d.severity === 'error').length)} error) — ` +
        `sửa dự án rồi chạy lại.`,
    );
    this.name = 'ProjectInvalidError';
    this.diagnostics = diagnostics;
  }
}
