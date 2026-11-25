/// <reference lib="webworker" />
// Service worker PWA — @vcs/web (P0.9, injectManifest, OQ-234).
// Plugin sinh precache manifest (self.__WB_MANIFEST); routing viết tay:
// navigation đi mạng trước (shell luôn mới khi có mạng — bảng B), rớt mạng
// thì trả offline.html đã precache; /api không bao giờ qua cache; asset
// tĩnh từ precache. Prompt model (OQ-222): không skipWaiting tự động, không
// clientsClaim — app gọi updateSW(true) khi user bấm "Tải lại".
//
// Vì sao không phải generateSW + navigateFallback (mặc định OQ-218):
// Workbox generateSW đăng ký NavigationRoute bằng createHandlerBoundToURL —
// MỌI navigation đều trả precached fallback, không bao giờ ra mạng (đã kiểm
// workbox-build 7.4.1 templates/sw-template.js + tài liệu Workbox). Như vậy
// navigation lúc server chạy sẽ trả offline.html thay vì index.html mới —
// trái bảng B. injectManifest giữ plugin sinh manifest, chỉ viết lại routing.
import { cleanupOutdatedCaches, getCacheKeyForURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ integrity?: string; revision: string | null; url: string }>;
};

// directoryIndex: '' (chuỗi rỗng = tắt map "/" → "/index.html"; type của
// workbox chỉ nhận string, null không qua typecheck nhưng runtime cần falsy).
// Nếu không tắt, navigation "/" sẽ trả shell cũ trong cache thay vì
// index.html mới từ server, và lúc offline sẽ trả app nửa chết thay vì
// trang offline — trái OQ-219.
precacheAndRoute(self.__WB_MANIFEST, { directoryIndex: '' });
cleanupOutdatedCaches();

// Prompt model: SW mới chờ tới khi app gửi SKIP_WAITING (qua updateSW(true)).
self.addEventListener('message', (event) => {
  const data: unknown = event.data;
  if (typeof data === 'object' && data !== null && 'type' in data && data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

// Navigation: chỉ đi mạng (không cache shell); rớt mạng → setCatchHandler
// phía dưới trả offline.html đã precache.
registerRoute(new NavigationRoute(new NetworkOnly()));

// /api không bao giờ qua cache (OQ-220 — dữ liệu live, cache là sai).
registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly());

// Mọi lỗi chưa được route nào xử lý: navigation → offline.html đã precache;
// còn lại → lỗi mạng như khi không có SW.
// (RouteHandlerCallbackOptions có `request` riêng, không nằm trong `event`.)
setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') {
    const key = getCacheKeyForURL('/offline.html');
    if (key !== undefined) {
      const offline = await caches.match(key);
      if (offline !== undefined) return offline;
    }
  }
  return Response.error();
});
