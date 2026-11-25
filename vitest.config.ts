import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      // Ngưỡng dòng theo M0 §13 (chỉ 3 package có ngưỡng; các package/app
      // khác vẫn đo và in báo cáo nhưng không chặn gate). Vitest 4 hỗ trợ
      // ngưỡng theo glob (key không phải lines/functions/... là glob).
      thresholds: {
        'packages/kernel/src/**': { lines: 85 },
        'packages/schemas/src/**': { lines: 85 },
        'packages/project/src/**': { lines: 80 },
        // P1.1, OQ-088: 2 package mới, bằng kernel/schemas.
        'packages/runtime-iec/src/**': { lines: 85 },
        'packages/vendor-siemens/src/**': { lines: 85 },
        // P2.1, OQ-251: package plant mới, bằng kernel/schemas.
        'packages/plant/src/**': { lines: 85 },
      },
    },
  },
});
