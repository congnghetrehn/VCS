// Phiên import trong bộ nhớ server — @vcs/server (P2.8, OQ-382).
// Wizard 5 bước giữ trạng thái giữa các bước bằng sessionId; file chỉ
// upload 1 lần, các bước sau gửi sessionId + tham số (không re-upload).
// Hết hạn sau 30 phút không hoạt động; tối đa 5 session / 50 MB tổng
// (vượt → 429); mất khi restart server → UI báo 410 + tải lại file.
// Store thuần (không phụ thuộc fastify) để test được bằng đồng hồ giả.

import { randomUUID } from 'node:crypto';
import type {
  CanonicalField,
  DiffResult,
  ImportProfile,
  IoRecord,
  RawGrid,
  SheetInfo,
  TransformChange,
  ValidateResult,
} from '@vcs/importers';

/** Một phiên import (file + trạng thái wizard). */
export interface ImportSession {
  id: string;
  filename: string;
  kind: 'xlsx' | 'csv';
  /** Nội dung file gốc (giữ để đọc lại sheet khác / chạy lại pipeline). */
  bytes: Uint8Array;
  /** Sheet có trong file (XLSX; CSV → []). */
  sheets: SheetInfo[];
  createdAtMs: number;
  lastAccessMs: number;
  /** Sheet đã chọn (mặc định sheet đầu với XLSX; CSV không có sheet). */
  sheet?: string;
  /** Lưới của sheet đã chọn — cache sau lần đọc đầu (đọc lại workbook
   * 20k dòng tốn ~1 s, không đọc lại mỗi bước). */
  grid?: RawGrid;
  /** Dòng header đã dò/chọn (1-based, theo rowNumbers của lưới). */
  headerRow?: number;
  /** Dòng dữ liệu đầu tiên sau header. */
  firstDataRow?: number;
  /** Mapping cột đã duyệt (bước 3, P2.8 commit 4): field → tên cột. */
  mapping?: Partial<Record<CanonicalField, string>>;
  /** Profile import đã dựng từ mapping (ghi đĩa ở commit, mirror CLI). */
  profile?: ImportProfile;
  /** Bản ghi đã transform sau mapping (bước 3). */
  records?: IoRecord[];
  /** Thay đổi do transform (bước 3). */
  changed?: TransformChange[];
  /** Kết quả validate (bước 4) — đã trừ IO-W002 được chấp nhận nhanh. */
  validated?: ValidateResult;
  /** Kết quả diff vs tags.yaml (bước 5). */
  diff?: DiffResult;
  /** Dòng (số dòng file) đã chấp nhận tên làm sạch — IO-W002 (OQ-390). */
  acceptedCleanRows?: Set<number>;
}

export type SessionCreateError = 'TOO_MANY_SESSIONS' | 'TOTAL_TOO_LARGE';

/** Kho session trong bộ nhớ (OQ-382). */
export class ImportSessionStore {
  /** Hết hạn sau 30 phút không hoạt động. */
  static readonly SESSION_TTL_MS = 30 * 60 * 1000;
  /** Tối đa 5 session cùng lúc. */
  static readonly MAX_SESSIONS = 5;
  /** Tổng dung lượng file mọi session ≤ 50 MB. */
  static readonly MAX_TOTAL_BYTES = 50 * 1024 * 1024;

  readonly #sessions = new Map<string, ImportSession>();
  #totalBytes = 0;
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  /** Số session đang giữ (chưa tính hết hạn lười). */
  get size(): number {
    return this.#sessions.size;
  }

  /** Tổng byte file đang giữ. */
  get totalBytes(): number {
    return this.#totalBytes;
  }

  /** Tạo session mới; vượt giới hạn → lỗi (không tự đuổi session cũ —
   *  user phải hủy tường minh hoặc đợi hết hạn, OQ-382). */
  create(
    filename: string,
    kind: 'xlsx' | 'csv',
    bytes: Uint8Array,
    sheets: SheetInfo[],
  ): { ok: true; session: ImportSession } | { ok: false; error: SessionCreateError } {
    this.#sweepExpired();
    if (this.#sessions.size >= ImportSessionStore.MAX_SESSIONS) {
      return { ok: false, error: 'TOO_MANY_SESSIONS' };
    }
    if (this.#totalBytes + bytes.length > ImportSessionStore.MAX_TOTAL_BYTES) {
      return { ok: false, error: 'TOTAL_TOO_LARGE' };
    }
    const now = this.#now();
    const session: ImportSession = {
      id: randomUUID(),
      filename,
      kind,
      bytes,
      sheets,
      createdAtMs: now,
      lastAccessMs: now,
    };
    if (kind === 'xlsx') {
      const firstSheet = sheets[0]?.name;
      if (firstSheet !== undefined) session.sheet = firstSheet;
    }
    this.#sessions.set(session.id, session);
    this.#totalBytes += bytes.length;
    return { ok: true, session };
  }

  /** Lấy session + chạm lastAccess; hết hạn/không có → undefined. */
  get(id: string): ImportSession | undefined {
    const session = this.#sessions.get(id);
    if (session === undefined) return undefined;
    if (this.#now() - session.lastAccessMs > ImportSessionStore.SESSION_TTL_MS) {
      this.delete(id);
      return undefined;
    }
    session.lastAccessMs = this.#now();
    return session;
  }

  /** Hủy session; trả false khi không tồn tại. */
  delete(id: string): boolean {
    const session = this.#sessions.get(id);
    if (session === undefined) return false;
    this.#sessions.delete(id);
    this.#totalBytes -= session.bytes.length;
    return true;
  }

  /** Xóa session đã hết hạn (chạy lười ở create). */
  #sweepExpired(): void {
    const now = this.#now();
    for (const [id, s] of this.#sessions) {
      if (now - s.lastAccessMs > ImportSessionStore.SESSION_TTL_MS) this.delete(id);
    }
  }
}
