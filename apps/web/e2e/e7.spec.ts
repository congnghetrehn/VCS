// E7: PWA — manifest, service worker, offline fallback, /api không cache (P0.9).
// Suite chạy server hello-tags ở 4170 (webServer) như E1–E5. Mỗi test dùng
// context mới (profile mới) nên không dính SW cũ (STATE §23).
// E7.6 chỉ chạy khi VCS_RUN_PWA_UPDATE=1 (rebuild 2 lần — OQ-230).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { gotoTags } from './helpers.js';

/** File source đổi tạm để E7.6 tạo SW mới (khôi phục nguyên văn ở finally). */
const APP_SOURCE = 'apps/web/src/App.tsx';

test('E7.1: manifest hợp lệ, icon đều 200, header no-cache', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  expect(res.headers()['cache-control']).toContain('no-cache');
  const manifest = (await res.json()) as {
    display: string;
    icons: Array<{ sizes: string; src: string }>;
    lang: string;
    name: string;
    short_name: string;
    start_url: string;
  };
  expect(manifest.name).toBe('Virtual Commissioning Studio');
  expect(manifest.short_name).toBe('VCS');
  expect(manifest.start_url).toBe('/');
  expect(manifest.display).toBe('standalone');
  expect(manifest.lang).toBe('vi');
  const sizes = manifest.icons.map((i) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  for (const icon of manifest.icons) {
    const iconRes = await request.get(icon.src);
    expect(iconRes.ok()).toBe(true);
  }
});

test('E7.2: service worker đăng ký trên localhost', async ({ page }) => {
  await gotoTags(page);
  const state = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { active: reg.active !== null, scope: reg.scope };
  });
  expect(state.active).toBe(true);
  expect(state.scope).toBe('http://127.0.0.1:4170/');
});

test('E7.3: offline → trang offline hiện (không phải app nửa chết)', async ({
  context,
  page,
}) => {
  await gotoTags(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // clientsClaim: false — reload 1 lần để SW điều khiển trang.
  await page.reload();
  await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Không kết nối được tới server')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  await context.setOffline(false);
});

test('E7.4: /api không bị cache — offline thì fetch lỗi', async ({ context, page }) => {
  await gotoTags(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  const online = await page.evaluate(async () => {
    const res = await fetch('/api/health');
    return res.status;
  });
  expect(online).toBe(200);
  await context.setOffline(true);
  const offline = await page.evaluate(async () => {
    try {
      await fetch('/api/health');
      return 'responded';
    } catch {
      return 'error';
    }
  });
  expect(offline).toBe('error');
  await context.setOffline(false);
});

test('E7.5: /sw.js có Cache-Control: no-cache', async ({ request }) => {
  const res = await request.get('/sw.js');
  expect(res.ok()).toBe(true);
  expect(res.headers()['cache-control']).toContain('no-cache');
});

test('E7.6: banner cập nhật hiện khi có SW mới', async ({ page }) => {
  test.skip(
    process.env.VCS_RUN_PWA_UPDATE !== '1',
    'chỉ chạy khi VCS_RUN_PWA_UPDATE=1 (rebuild 2 lần — OQ-230)',
  );
  test.setTimeout(180_000);
  await gotoTags(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Đổi code thật (không phải comment — Vite production build strip comment
  // nên bundle không đổi, SW không thấy bản mới). Gán window chỉ để bundle
  // đổi hash; finally khôi phục source nguyên văn + build lại.
  const original = readFileSync(APP_SOURCE, 'utf-8');
  try {
    writeFileSync(
      APP_SOURCE,
      `${original}\n// E7.6 probe: đổi bundle để SW mới xuất hiện.\nif (typeof window !== 'undefined') {\n  (window as unknown as Record<string, unknown>).__e76probe = 1;\n}\n`,
    );
    execSync('pnpm --filter @vcs/web build', { stdio: 'pipe', timeout: 120_000 });
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    });
    await expect(page.getByTestId('pwa-update-banner')).toBeVisible({ timeout: 15_000 });
  } finally {
    // Khôi phục source nguyên văn + build lại để dist về trạng thái ban đầu.
    writeFileSync(APP_SOURCE, original);
    execSync('pnpm --filter @vcs/web build', { stdio: 'pipe', timeout: 120_000 });
  }
});
