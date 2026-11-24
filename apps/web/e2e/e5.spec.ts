// E5: timeScale max → stepCount tăng nhanh (STATE §13, E1 dòng 8).
import { expect, test } from '@playwright/test';
import { getStepCount, gotoTags, resetSim } from './helpers.js';

test('E5: timeScale max → stepCount tăng ≥ 500 trong 1 s wall', async ({ page }) => {
  await gotoTags(page);
  await resetSim(page);
  await page.getByTestId('btn-run').click();
  await page.getByTestId('timescale-select').selectOption('max');
  const c1 = await getStepCount(page);
  await page.waitForTimeout(1000);
  const c2 = await getStepCount(page);
  expect(c2 - c1).toBeGreaterThanOrEqual(500);
  // lagging hiển thị đúng giá trị server gửi (không assert true/false).
  await expect(page.getByTestId('sim-lagging')).toContainText('lagging');
});
