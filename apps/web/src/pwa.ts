// Helpers PWA thuần — @vcs/web (P0.9).
// Không chạm DOM/navigator ở top-level: unit test chạy bằng node (vitest,
// tiền lệ P0.6 — web unit test pure logic). Mọi nhánh có test ở pwa.test.ts.
// Phân loại request theo bảng B (STATE §23): SW (apps/web/src/sw.ts) dùng
// cùng quy tắc — navigation đi mạng trước rồi rớt về offline.html, /api và
// /ws không bao giờ qua cache, asset tĩnh từ precache.

/** `?kiosk=1` → true; thiếu/`0`/sai → false (OQ-226). */
export function parseKioskParam(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get('kiosk') === '1';
}

/** Cách SW xử lý một request (bảng B). */
export type RequestStrategy = 'precache' | 'navigation' | 'network-only';

export function classifyRequest(url: string, method: string): RequestStrategy {
  if (method !== 'GET') return 'network-only';
  let path: string;
  try {
    // URL tuyệt đối hoặc tương đối đều parse được nhờ base giả.
    path = new URL(url, 'http://localhost').pathname;
  } catch {
    // Không phân loại được → mặc định an toàn: không cache.
    return 'network-only';
  }
  // /sw.js không nằm trong precache: trình duyệt tự fetch với no-cache
  // (header server OQ-223) để SW mới được kiểm tra mỗi lần load.
  if (path === '/sw.js') return 'network-only';
  if (path.startsWith('/api/') || path === '/ws' || path.startsWith('/ws/')) return 'network-only';
  if (path === '/' || path === '/index.html') return 'navigation';
  return 'precache';
}

/**
 * true khi banner "Có bản mới" hiện — có SW mới đang chờ (OQ-222).
 * Banner hiện bất kể editor dirty hay không; dirty chỉ đổi hành động khi
 * bấm "Tải lại" (xem reloadNeedsConfirm).
 */
export function shouldShowUpdateBanner(waiting: boolean): boolean {
  return waiting;
}

/** true khi bấm "Tải lại" phải hỏi xác nhận trước (editor đang dirty — OQ-222). */
export function reloadNeedsConfirm(dirty: boolean): boolean {
  return dirty;
}

/** true khi navigator có Wake Lock API (OQ-228). */
export function wakeLockAvailable(nav: {
  wakeLock?: { request?: unknown } | null | undefined;
}): boolean {
  return typeof nav.wakeLock?.request === 'function';
}
