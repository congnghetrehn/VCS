// E6: PLC Workspace trên demo motor-interlock (P1.7).
// Suite chạy server hello-tags ở 4170 (webServer) — E6 tự spawn server
// motor-interlock ở 4171 rồi kill sau test. Luồng: mở tab PLC → cây file
// → mở OB1.scl → Build OK → Watch RUN_CMD/START_PB + các đầu vào cho phép
// → ghi true khi IDLE rồi Force (OQ-141: write %I chỉ tới lần latch kế)
// → Run → RUN_CMD TRUE (seal) + scanCount tăng → Reset → RUN_CMD FALSE.
import { spawn, type ChildProcess } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

const PORT = 4171;
const BASE = `http://127.0.0.1:${String(PORT)}`;

let server: ChildProcess | undefined;

async function waitForHealth(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // Chưa lên — thử lại.
    }
    if (Date.now() - start > timeoutMs) throw new Error('server motor-interlock không lên');
    await new Promise((r) => setTimeout(r, 200));
  }
}

test.beforeAll(async () => {
  server = spawn(
    'pnpm',
    ['vcs', 'serve', 'examples/motor-interlock', '--port', String(PORT)],
    { cwd: process.cwd(), stdio: 'ignore', detached: true },
  );
  await waitForHealth();
});

test.afterAll(() => {
  if (server !== undefined && server.pid !== undefined) {
    // Kill cả cây process: pnpm spawn server node con — kill pnpm không
    // đủ (cổng 4171 còn chiếm, lần chạy sau EADDRINUSE).
    process.kill(-server.pid, 'SIGTERM');
    server = undefined;
  }
});

async function getWatchValue(page: Page, ref: string): Promise<string> {
  const text = await page.getByTestId(`plc-watch-value-${ref}`).textContent();
  return (text ?? '').trim();
}

test('E6: PLC Workspace — mở OB1, Build OK, Watch + force input → RUN_CMD TRUE', async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
  // SimBar có thống kê PLC (scan/fault) khi project có plc/.
  await expect(page.getByTestId('plc-stats')).toBeVisible();
  await expect(page.getByTestId('plc-scan-count')).toHaveText('0');

  // Tab PLC.
  await page.getByTestId('nav-plc').click();
  await expect(page.getByTestId('plc-workspace')).toBeVisible();
  // Cây file nạp tự động (Build lúc mở workspace).
  await expect(page.getByTestId('plc-file-OB1.scl')).toBeVisible();
  await expect(page.getByTestId('plc-file-FB_Motor.scl')).toBeVisible();

  // Mở OB1.scl trong editor.
  await page.getByTestId('plc-file-OB1.scl').click();
  await expect(page.getByTestId('plc-current-file')).toContainText('OB1.scl');
  await expect(page.getByTestId('plc-editor')).toBeVisible();

  // Build → OK.
  await page.getByTestId('plc-build').click();
  await expect(page.getByTestId('plc-build-status')).toHaveText('Build OK');

  // Watch RUN_CMD + START_PB + các đầu vào cho phép (seal cần STOP_OK,
  // OVL_OK, PERM đều TRUE — xem FB_Motor + demo scenario A §13).
  for (const ref of ['RUN_CMD', 'START_PB', 'STOP_OK', 'OVL_OK', 'PERM']) {
    await page.getByTestId('plc-watch-input').fill(ref);
    await page.getByTestId('plc-watch-add').click();
    await expect(page.getByTestId(`plc-watch-ref-${ref}`)).toBeVisible();
  }
  await expect
    .poll(async () => getWatchValue(page, 'RUN_CMD'), { timeout: 5000 })
    .toBe('false');

  // Ghi các đầu vào = true KHI IDLE rồi Force (OQ-141: write %I chỉ tới lần
  // latch kế — khi chạy, scan latch từ IoBus sẽ xóa write; chỉ force mới
  // thắng latch. Force lấy giá trị đang hiển thị nên phải poll true trước).
  for (const ref of ['STOP_OK', 'OVL_OK', 'PERM', 'START_PB']) {
    await page.getByTestId(`plc-watch-write-input-${ref}`).fill('true');
    await page.getByTestId(`plc-watch-write-${ref}`).click();
    await expect
      .poll(async () => getWatchValue(page, ref), { timeout: 5000 })
      .toBe('true');
    await page.getByTestId(`plc-watch-force-${ref}`).click();
  }

  // Chạy sim → R_TRIG thấy START_PB rising, seal (các cho phép đang force
  // TRUE) → RUN_CMD TRUE.
  await page.getByTestId('btn-run').click();
  await expect
    .poll(async () => getWatchValue(page, 'RUN_CMD'), { timeout: 5000 })
    .toBe('true');
  await expect
    .poll(async () => Number(await page.getByTestId('plc-scan-count').textContent()), {
      timeout: 5000,
    })
    .toBeGreaterThan(0);

  // Reset → RUN_CMD FALSE, scan về 0.
  await page.getByTestId('btn-reset').click();
  await expect
    .poll(async () => getWatchValue(page, 'RUN_CMD'), { timeout: 5000 })
    .toBe('false');
  await expect(page.getByTestId('plc-scan-count')).toHaveText('0');
});
