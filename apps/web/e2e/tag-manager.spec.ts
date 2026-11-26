// Tag Manager + Watch hiểu tag plant (P2.8 commit 7, OQ-385/395).
// Server riêng trên bản sao tạm motor-interlock ở 4171 (như p28); suite
// webServer vẫn phục vụ hello-tags ở 4170.
//
// (1) Tag Manager: sửa ô equipment/role qua UI → tags.yaml trên đĩa đổi
//     (kiểm qua GET /api/tags), lọc theo thiết bị, nhóm theo thiết bị.
// (2) Watch: cột equipment/role join từ file + lọc theo thiết bị; nút
//     Ghi/Force không dính nhau ở 1280 px (OQ-395: probe M1 ghi
//     "GhiForce"/"Bỏ forceXóa") — kiểm bằng bounding box có khoảng cách.
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const PORT = 4171;
const BASE = `http://127.0.0.1:${String(PORT)}`;
const ROOT = process.cwd();
const MOTOR = join(ROOT, 'examples', 'motor-interlock');

let server: ChildProcess | undefined;
let projectDir = '';

async function waitForHealth(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // Chưa lên — thử lại.
    }
    if (Date.now() - start > timeoutMs) throw new Error('server tag-manager không lên');
    await new Promise((r) => setTimeout(r, 200));
  }
}

test.beforeAll(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'vcs-tm-e2e-'));
  await cp(MOTOR, projectDir, { recursive: true });
  server = spawn('pnpm', ['vcs', 'serve', projectDir, '--port', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
  await waitForHealth();
});

test.afterAll(async () => {
  if (server !== undefined && server.pid !== undefined) {
    process.kill(-server.pid, 'SIGTERM');
    server = undefined;
  }
  if (projectDir !== '') await rm(projectDir, { recursive: true, force: true });
});

test('tag-manager: sửa equipment/role qua UI → file đổi; lọc + nhóm theo thiết bị', async ({
  page,
}) => {
  await page.goto(BASE);
  await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
  await expect(page.getByTestId('tags-count')).toHaveText('8 / 8 tag');
  // Ban đầu tags.yaml motor-interlock chưa gán equipment/role cho tag nào.
  await expect(page.getByTestId('tag-edit-equipment-RUN_CMD')).toHaveValue('');
  await page.getByTestId('tag-edit-equipment-RUN_CMD').fill('M01');
  await page.getByTestId('tag-edit-equipment-RUN_CMD').press('Enter');
  await expect(page.getByTestId('tag-edit-equipment-RUN_CMD')).toHaveValue('M01');
  await page.getByTestId('tag-edit-role-RUN_CMD').fill('runCmd');
  await page.getByTestId('tag-edit-role-RUN_CMD').press('Enter');
  await expect(page.getByTestId('tag-edit-role-RUN_CMD')).toHaveValue('runCmd');
  // File trên đĩa đã đổi (kiểm độc lập với UI).
  const res = await page.request.get(`${BASE}/api/tags`);
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as {
    tags: Array<{ name: string; equipment?: string; role?: string }>;
  };
  const runCmd = body.tags.find((t) => t.name === 'RUN_CMD');
  expect(runCmd?.equipment).toBe('M01');
  expect(runCmd?.role).toBe('runCmd');
  // Lọc theo thiết bị M01 → chỉ RUN_CMD; nhóm → header M01 (1).
  await page.getByTestId('filter-equipment').selectOption('M01');
  await expect(page.getByTestId('tags-count')).toHaveText('1 / 8 tag');
  await page.getByTestId('tag-group-by').check();
  await expect(page.getByTestId('tag-group-M01')).toBeVisible();
  await expect(page.getByTestId('tag-group-M01')).toContainText('(1)');
});

test('watch: cột equipment/role + lọc thiết bị; Ghi/Force không dính nhau ở 1280px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // Gán trước qua API để test độc lập với test trên.
  const setRes = await page.request.post(`${BASE}/api/tags`, {
    data: { name: 'RUN_CMD', equipment: 'M01', role: 'runCmd' },
  });
  expect(setRes.ok()).toBe(true);
  await page.goto(BASE);
  await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
  await page.getByTestId('nav-plc').click();
  await expect(page.getByTestId('plc-workspace')).toBeVisible();
  await page.getByTestId('plc-watch-input').fill('RUN_CMD');
  await page.getByTestId('plc-watch-add').click();
  await page.getByTestId('plc-watch-input').fill('START_PB');
  await page.getByTestId('plc-watch-add').click();
  await expect(page.getByTestId('plc-watch-equipment-RUN_CMD')).toHaveText('M01');
  await expect(page.getByTestId('plc-watch-role-RUN_CMD')).toHaveText('runCmd');
  await expect(page.getByTestId('plc-watch-equipment-START_PB')).toHaveText('—');
  // Ghi/Force không dính nhau: nút Ghi kết thúc trước khi nút Force bắt đầu.
  const writeBox = await page.getByTestId('plc-watch-write-RUN_CMD').boundingBox();
  const forceBox = await page.getByTestId('plc-watch-force-RUN_CMD').boundingBox();
  expect(writeBox).not.toBeNull();
  expect(forceBox).not.toBeNull();
  expect((forceBox as { x: number }).x).toBeGreaterThan(
    (writeBox as { x: number; width: number }).x + (writeBox as { width: number }).width,
  );
  // Lọc thiết bị M01 → chỉ RUN_CMD; về 'all' → cả 2.
  await page.getByTestId('plc-watch-filter-equipment').selectOption('M01');
  await expect(page.getByTestId('plc-watch-ref-RUN_CMD')).toBeVisible();
  await expect(page.getByTestId('plc-watch-ref-START_PB')).toHaveCount(0);
  await page.getByTestId('plc-watch-filter-equipment').selectOption('all');
  await expect(page.getByTestId('plc-watch-ref-START_PB')).toBeVisible();
});
