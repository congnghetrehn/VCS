// E3: ghi tag free BTN_START → LAMP_RUN bật (STATE §13, E1 dòng 6).
import { test } from '@playwright/test';
import { gotoTags, resetSim, waitForTagValue } from './helpers.js';

test('E3: ghi tag free BTN_START → LAMP_RUN bật', async ({ page }) => {
  await gotoTags(page);
  await resetSim(page);
  await page.getByTestId('btn-run').click();
  await page.waitForTimeout(300);
  await page.getByTestId('toggle-BTN_START').click();
  await waitForTagValue(page, 'BTN_START', 'TRUE');
  await waitForTagValue(page, 'LAMP_RUN', 'TRUE');
});
