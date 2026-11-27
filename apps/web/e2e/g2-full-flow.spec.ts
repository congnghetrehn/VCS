// G2 e2e (G2 §34): 1 test duy nhất đi trọn luồng §14 #8 trên 1 project —
// import variant sạch (300 tag, 0 lỗi) → commit qua wizard → restart →
// Designer duyệt gợi ý (300/177/37/13/0) → Accept all confident (200,
// applied 37) → restart → Run → tiêm lỗi stuck CR01_FCV02 → quan sát ở
// inspector + Event log + Tag Manager. Không sửa file bằng tay (test chỉ
// lái UI; restart process theo OQ-384 không phải sửa file).
// Số đo từ CLI ở STATE §34 mục "Kết quả đo" (commit 2): validate 0 lỗi /
// 23 warnings IO-W030, diff +300/−0/0/0; suggest 50 thiết bị (37 confident,
// 13 review, 0 unmatched), 177 tags gán; server apply accept-confident 200
// (applied 37, autoFilled 33) — KHÔNG 400 như case (3) p28 vì CR02_SS02 là
// review nên không vào tập confident.
// Timeout 120s: test dài theo bản chất (2 lần restart server + import 300 dòng).
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const PORT = 4173;
const BASE = `http://127.0.0.1:${String(PORT)}`;
const ROOT = process.cwd();
const EMPTY = join(ROOT, 'apps', 'web', 'e2e', 'fixtures', 'empty-project');
const FIXTURE_XLSX = join(ROOT, 'fixtures', 'io-list-300-clean', 'io-list-300-clean.xlsx');

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
    if (Date.now() - start > timeoutMs) throw new Error('server g2 không lên');
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Restart server trên cùng thư mục (OQ-384) — chờ cổng tự do hẳn rồi mới
 *  spawn (bài học case (5) p28: race EADDRINUSE). */
async function restartServer(): Promise<void> {
  if (server !== undefined && server.pid !== undefined) {
    process.kill(-server.pid, 'SIGTERM');
    server = undefined;
  }
  const start = Date.now();
  for (;;) {
    try {
      await fetch(`${BASE}/api/health`);
    } catch {
      break;
    }
    if (Date.now() - start > 10_000) throw new Error('server g2 cũ không chết');
    await new Promise((r) => setTimeout(r, 200));
  }
  server = spawn('pnpm', ['vcs', 'serve', projectDir, '--port', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
  await waitForHealth();
}

function plantValidateOk(dir: string): string {
  const out = execFileSync('pnpm', ['vcs', 'plant', 'validate', dir], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
  expect(out).toContain('OK:');
  return out;
}

test.beforeAll(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'vcs-g2-full-flow-'));
  await cp(EMPTY, projectDir, { recursive: true });
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

test('g2: luồng trọn §14 #8 — import variant → duyệt gợi ý → chạy → tiêm lỗi → quan sát', async ({
  page,
}) => {
  // Timeout 120s: test dài theo bản chất (2 lần restart server + import 300 dòng).
  test.setTimeout(120_000);
    // 1. Wizard: import variant sạch 300 tag, 0 lỗi → commit OK.
    await page.goto(BASE);
    await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
    await page.getByTestId('nav-import').click();
    await page.getByTestId('import-file-input').setInputFiles(FIXTURE_XLSX);
    await expect(page.getByTestId('import-file-name')).toHaveText('io-list-300-clean.xlsx');
    await expect(page.getByTestId('import-sheet-select')).toHaveValue('IO List');
    await page.getByTestId('import-next-1').click();
    await expect(page.getByTestId('import-header-row')).toHaveText('6');
    await expect(page.getByTestId('import-total-rows')).toHaveText('300');
    await expect(page.getByTestId('import-columns')).toContainText('Tag Name');
    await page.getByTestId('import-next-2').click();
    await expect(page.getByTestId('import-mapping-tag')).toHaveValue('Tag Name');
    await expect(page.getByTestId('import-mapping-address')).toHaveValue('Address');
    await page.getByTestId('import-next-3').click();
    await expect(page.getByTestId('import-stats-errors')).toHaveText('0');
    await expect(page.getByTestId('import-stats-warnings')).toHaveText('23');
    await expect(page.getByTestId('import-stats-by-code')).toContainText('IO-W030×23');
    await page.getByTestId('import-next-4').click();
    await expect(page.getByTestId('import-diff-added')).toHaveText('300');
    await expect(page.getByTestId('import-diff-removed')).toHaveText('0');
    await expect(page.getByTestId('import-diff-unchanged')).toHaveText('0');
    await page.getByTestId('import-commit').click();
    await expect(page.getByTestId('import-committed')).toBeVisible();
    await expect(page.getByTestId('import-files-written')).toContainText('tags/tags.yaml');
    await expect(page.getByTestId('import-files-written')).toContainText('io/io-list.normalized.csv');
    await expect(page.getByTestId('import-files-written')).toContainText('io/import-profile.yaml');
    await expect(page.getByTestId('import-files-written')).toContainText('reports/import-');
    await expect(page.getByTestId('import-restart-banner')).toBeVisible();

    // 2. Restart để sim nhận tags mới (OQ-384), rồi duyệt gợi ý ở Designer.
    await restartServer();
    await page.goto(BASE);
    await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
    await page.getByTestId('nav-plant').click();
    await expect(page.getByTestId('designer-stats')).toHaveText(
      '300 tags · 177 đã gán · 37 confident · 13 review · 0 unmatched',
    );
    await page.getByTestId('designer-filter-status').selectOption('confident');
    await expect(page.locator('[data-testid^="suggestion-CR"]')).toHaveCount(37);
    await page.getByTestId('suggestion-CR01_FCV02').click();
    await expect(page.getByTestId('suggestion-detail')).toContainText('CR01_FCV02');
    await expect(page.getByTestId('suggestion-detail')).toContainText('valve_ctrl');
    await expect(page.getByTestId('suggestion-detail')).toContainText('CR01_FCV02_POS_FB');

    // 3. Accept all confident → 200 (đo CLI: applied 37, autoFilled 33).
    await page.getByTestId('designer-accept-confident').click();
    await expect(page.getByTestId('designer-apply-result')).toContainText('37');
    await expect(page.getByTestId('designer-apply-result')).toContainText('plant/equipment.yaml');
    await expect(page.getByTestId('designer-restart-banner')).toBeVisible();
    const res = await fetch(`${BASE}/api/plant/equipment`);
    const body = (await res.json()) as { equipment: Array<{ id: string }> };
    expect(body.equipment).toHaveLength(37);
    expect(body.equipment.map((e) => e.id)).toContain('CR01_FCV02');
    plantValidateOk(projectDir);

    // 4. Restart lần 2 → Run → tiêm lỗi stuck CR01_FCV02 → quan sát 3 chỗ.
    await restartServer();
    await page.goto(BASE);
    await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
    if ((await page.getByTestId('sim-state').textContent()) !== 'RUNNING') {
      await page.getByTestId('btn-run').click();
    }
    await expect(page.getByTestId('sim-state')).toHaveText('RUNNING');
    await page.getByTestId('nav-plant').click();
    await page.getByTestId('inspector-equipment').selectOption('CR01_FCV02');
    await expect(page.getByTestId('inspector-detail')).toContainText('CR01_FCV02');
    await page.getByTestId('fault-inject-select').selectOption('stuck');
    await page.getByTestId('fault-inject').click();
    await expect(page.locator('[data-testid^="fault-clear-"]')).toHaveCount(1);
    await expect(page.getByTestId('role-value-fault')).toContainText('true');
    await expect(page.getByTestId('event-log')).toContainText('fault');
    await expect(page.getByTestId('event-log')).toContainText('CR01_FCV02');
    await page.getByTestId('nav-tags').click();
    await page.getByTestId('filter-text').fill('CR01_FCV02_FAULT');
    await expect(page.getByTestId('value-CR01_FCV02_FAULT')).toContainText('TRUE');
});
