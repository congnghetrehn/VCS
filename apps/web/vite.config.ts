// Vite config — @vcs/web (M0 §8.3, §3.2).
// Proxy /api + /ws → server dev 127.0.0.1:4170 (OQ-058: web dùng cùng
// origin, không hard-code cổng ở client). Build ra apps/web/dist.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  plugins: [react(), tailwindcss()],
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
