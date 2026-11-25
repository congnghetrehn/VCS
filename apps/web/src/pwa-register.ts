// Đăng ký service worker — @vcs/web (P0.9).
// Tách khỏi pwa.ts (pure, test node): 'virtual:pwa-register' chỉ tồn tại
// trong build Vite + trình duyệt; main.tsx là điểm vào duy nhất.
import { registerSW } from 'virtual:pwa-register';
import { useSimStore } from './store.js';

let updateSw: ((reloadPage?: boolean) => Promise<void>) | null = null;

/** Đăng ký SW (gọi 1 lần ở main.tsx, ngoài StrictMode effect). */
export function initPwa(): void {
  updateSw = registerSW({
    onNeedRefresh() {
      // SW mới đang chờ → banner "Có bản mới" (OQ-222); không tự reload.
      useSimStore.getState().setUpdateAvailable(true);
    },
    onRegisterError() {
      // SW không đăng ký được (vd http LAN — D-007): app chạy thường, không báo lỗi.
    },
  });
}

/** App gọi khi user bấm "Tải lại" trên banner cập nhật. */
export function applyPwaUpdate(): void {
  if (updateSw !== null) void updateSw(true);
}
