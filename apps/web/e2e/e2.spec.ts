// E2: run/pause/step/reset (STATE §13, E1 dòng 2–5).
import { expect, test } from '@playwright/test';
import {
  getSimTimeMs,
  getStepCount,
  getTagValue,
  gotoTags,
  resetSim,
  waitForTagValue,
} from './helpers.js';

test('E2: run/pause/step/reset', async ({ page }) => {
  await gotoTags(page);
  await resetSim(page);

  await page.getByTestId('btn-run').click();
  // simTime > 1000 ms, stepCount ≥ 100 (poll tới khi đạt, không phụ thuộc wall).
  await expect.poll(async () => getSimTimeMs(page), { timeout: 10_000 }).toBeGreaterThan(1000);
  await expect.poll(async () => getStepCount(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(100);
  await waitForTagValue(page, 'LAMP_AUTO', 'TRUE');
  // LAMP_HEARTBEAT đã thấy TRUE ít nhất một lần trong cửa sổ poll (blink
  // 500 ms — không assert giá trị tại một thời điểm, xem STATE §13 (a)).
  let seenTrue = false;
  await expect
    .poll(
      async () => {
        if ((await getTagValue(page, 'LAMP_HEARTBEAT')) === 'TRUE') seenTrue = true;
        return seenTrue;
      },
      { timeout: 5000 },
    )
    .toBe(true);

  // Pause: simTime + stepCount đứng yên.
  await page.getByTestId('btn-pause').click();
  await expect(page.getByTestId('sim-state')).toHaveText('PAUSED');
  const t1 = await getSimTimeMs(page);
  const c1 = await getStepCount(page);
  await page.waitForTimeout(300);
  expect(await getSimTimeMs(page)).toBe(t1);
  expect(await getStepCount(page)).toBe(c1);

  // Step khi PAUSED: +10 ms đúng, +1 bước (tất định, không phụ thuộc wall).
  await page.getByTestId('btn-step').click();
  await expect.poll(async () => getSimTimeMs(page), { timeout: 5000 }).toBe(t1 + 10);
  await expect.poll(async () => getStepCount(page), { timeout: 5000 }).toBe(c1 + 1);
  await waitForTagValue(page, 'SCAN_CNT', String(c1 + 1));

  // Reset: snapshot gửi lại, mọi thứ về 0, IDLE.
  await page.getByTestId('btn-reset').click();
  await expect(page.getByTestId('sim-time')).toHaveText('00:00.000');
  await expect(page.getByTestId('step-count')).toHaveText('0');
  await expect(page.getByTestId('sim-state')).toHaveText('IDLE');
  expect(await getTagValue(page, 'SCAN_CNT')).toBe('0');
  expect(await getTagValue(page, 'BTN_START')).toBe('FALSE');
  expect(await getTagValue(page, 'LAMP_HEARTBEAT')).toBe('FALSE');
});
