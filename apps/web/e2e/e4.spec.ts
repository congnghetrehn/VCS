// E4: ghi thử tag non-free LAMP_RUN → server từ chối TAG-E002 (A19).
// Nút "Ghi thử" gửi tag.write thật; UI hiện thông báo, giá trị không đổi,
// sim vẫn RUNNING (SCAN_CNT tiếp tục tăng).
import { expect, test } from '@playwright/test';
import { getStepCount, gotoTags, resetSim, waitForTagValue } from './helpers.js';

test('E4: ghi thử tag non-free LAMP_RUN → server từ chối TAG-E002', async ({ page }) => {
  await gotoTags(page);
  await resetSim(page);
  await page.getByTestId('btn-run').click();
  await page.waitForTimeout(300);
  await page.getByTestId('toggle-BTN_START').click();
  await waitForTagValue(page, 'LAMP_RUN', 'TRUE');
  const countBefore = await getStepCount(page);
  await page.getByTestId('try-write-LAMP_RUN').click();
  await expect(page.getByTestId('last-error')).toContainText('TAG-E002');
  await expect(page.getByTestId('value-text-LAMP_RUN')).toHaveText('TRUE');
  await expect
    .poll(async () => getStepCount(page), { timeout: 5000 })
    .toBeGreaterThan(countBefore);
});
