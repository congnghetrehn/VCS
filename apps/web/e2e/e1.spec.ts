// E1: load — 12 hàng tag, đã kết nối, IDLE, diagnostics trống (STATE §13).
import { expect, test } from '@playwright/test';
import { getTagValue, gotoTags, resetSim } from './helpers.js';

test('E1: load — 12 hàng tag, đã kết nối, IDLE, diagnostics trống', async ({ page }) => {
  await gotoTags(page);
  await resetSim(page);
  await expect(page.getByTestId('sim-time')).toHaveText('00:00.000');
  await expect(page.getByTestId('step-count')).toHaveText('0');
  await expect(page.getByTestId('sim-state')).toHaveText('IDLE');
  expect(await getTagValue(page, 'BTN_START')).toBe('FALSE');
  expect(await getTagValue(page, 'SCAN_CNT')).toBe('0');
  await expect(page.getByTestId('diagnostics-panel')).toContainText('Diagnostics (0)');
});
