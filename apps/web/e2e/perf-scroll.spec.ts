// Kiểm cuộn bảng 20 000 dòng ≥ 50 FPS (M0 §12.4, OQ-067).
// CHẠY TAY, không vào CI: sinh fixture rồi chạy với VCS_RUN_PERF=1:
//   pnpm exec tsx apps/web/e2e/fixtures/gen-big-project.ts
//   pnpm build
//   VCS_RUN_PERF=1 pnpm exec playwright test perf-scroll
// Probe tự chạy server riêng (cổng 4171) phục vụ fixture big-project.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE = join(ROOT, 'apps', 'web', 'e2e', 'fixtures', 'big-project');
const PORT = 4171;
const BASE = `http://127.0.0.1:${String(PORT)}`;

let server: ChildProcess | null = null;

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Chưa lên — thử lại.
    }
    if (Date.now() > deadline) throw new Error(`server không lên sau ${String(timeoutMs)} ms: ${url}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

test.beforeAll(async () => {
  if (!existsSync(join(FIXTURE, 'vcs.project.yaml'))) {
    throw new Error(
      'fixture big-project chưa sinh — chạy: pnpm exec tsx apps/web/e2e/fixtures/gen-big-project.ts',
    );
  }
  if (!existsSync(join(ROOT, 'apps', 'web', 'dist', 'index.html'))) {
    throw new Error('apps/web/dist chưa build — chạy: pnpm build');
  }
  server = spawn(
    'npx',
    ['-y', 'pnpm@10.15.0', 'vcs', 'serve', FIXTURE, '--port', String(PORT)],
    { cwd: ROOT, stdio: 'ignore', detached: true },
  );
  await waitForHealth(`${BASE}/api/health`, 60_000);
});

test.afterAll(() => {
  if (server !== null && server.pid !== undefined) {
    // Kill cả cây process: kill pnpm không đủ (con tsx còn chiếm cổng).
    process.kill(-server.pid, 'SIGTERM');
    server = null;
  }
});

test('perf: cuộn bảng 20 000 dòng ≥ 50 FPS', async ({ page }) => {
  await page.goto(BASE + '/');
  await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
  await expect(page.getByTestId('tags-count')).toHaveText('20000 / 20000 tag');
  const fps = await page.evaluate(async () => {
    const el = document.querySelector<HTMLElement>('[data-testid="tags-body"]');
    if (el === null) throw new Error('không tìm thấy tags-body');
    let frames = 0;
    let stopped = false;
    const tick = (): void => {
      if (stopped) return;
      frames += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const end = Date.now() + 3000;
    while (Date.now() < end) {
      const max = Math.max(1, el.scrollHeight - el.clientHeight);
      el.scrollTop = (el.scrollTop + 600) % max;
      await new Promise((r) => setTimeout(r, 16));
    }
    stopped = true;
    return frames / 3;
  });
  expect(fps).toBeGreaterThanOrEqual(50);
});

test('perf: Tag Manager 20 000 dòng nhóm theo thiết bị ≥ 50 FPS (P2.8)', async ({ page }) => {
  await page.goto(BASE + '/');
  await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
  await expect(page.getByTestId('tags-count')).toHaveText('20000 / 20000 tag');
  // Fixture không gán equipment → 1 nhóm "Chưa gán" chứa cả 20 000 dòng.
  await page.getByTestId('tag-group-by').check();
  await expect(page.getByTestId('tag-group-unassigned')).toBeVisible();
  await expect(page.getByTestId('tags-count')).toHaveText('20000 / 20000 tag');
  const fps = await page.evaluate(async () => {
    const el = document.querySelector<HTMLElement>('[data-testid="tags-body"]');
    if (el === null) throw new Error('không tìm thấy tags-body');
    let frames = 0;
    let stopped = false;
    const tick = (): void => {
      if (stopped) return;
      frames += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const end = Date.now() + 3000;
    while (Date.now() < end) {
      const max = Math.max(1, el.scrollHeight - el.clientHeight);
      el.scrollTop = (el.scrollTop + 600) % max;
      await new Promise((r) => setTimeout(r, 16));
    }
    stopped = true;
    return frames / 3;
  });
  expect(fps).toBeGreaterThanOrEqual(50);
});
