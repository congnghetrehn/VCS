// Playwright config — e2e M0 §12.3 (P0.6).
// Một server cho cả suite, workers: 1 (sim state chia sẻ; mỗi test tự Reset
// qua UI ở đầu test — OQ-066). Chỉ chromium. Trace giữ lại khi test lỗi.
// `pnpm vcs serve` phục vụ apps/web/dist đã build (OQ-044/066): CI chạy
// `pnpm build` trước `pnpm test:e2e`; local `test:e2e` tự build nếu dist
// thiếu (scripts/ensure-web-dist.mjs).
// Kiểm cuộn 20 000 dòng (perf-scroll.spec.ts) CHẠY TAY, không vào CI:
//   VCS_RUN_PERF=1 pnpm exec playwright test perf-scroll
import { defineConfig, devices } from '@playwright/test';

const runPerf = process.env.VCS_RUN_PERF === '1';

export default defineConfig({
  testDir: 'apps/web/e2e',
  testIgnore: runPerf ? [] : ['**/perf-scroll.spec.ts'],
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4170',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm vcs serve examples/hello-tags --port 4170',
    url: 'http://127.0.0.1:4170/',
    reuseExistingServer: process.env.CI === undefined,
    timeout: 120_000,
  },
});
