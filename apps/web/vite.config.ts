// Vite config — @vcs/web (M0 §8.3, §3.2).
// Proxy /api + /ws → server dev 127.0.0.1:4170 (OQ-058: web dùng cùng
// origin, không hard-code cổng ở client). Build ra apps/web/dist.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  plugins: [
    react(),
    tailwindcss(),
    // PWA tối thiểu (P0.9, OQ-218/OQ-234): injectManifest — plugin sinh
    // precache manifest, routing viết tay ở src/sw.ts (navigation đi mạng
    // trước rồi rớt về offline.html; /api NetworkOnly). Manifest tĩnh ở
    // public/manifest.webmanifest (OQ-225) nên plugin không sinh manifest.
    // Không bật SW ở vite dev (OQ-231). Đăng ký SW bằng tay ở main.tsx
    // (injectRegister: false) để onNeedRefresh cập nhật store.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // OQ-221 (đã hiệu chỉnh bằng đo thật): chunk Monaco lớn nhất là
        // ts.worker ~6,93 MB (đo ở build 2026-11-25) nên 5 MB của plan
        // không đủ — build lỗi "won't be precached". 8 MiB phủ được.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4170',
      '/ws': {
        target: 'http://127.0.0.1:4170',
        ws: true,
      },
    },
  },
});
