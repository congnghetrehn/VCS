// Helpers e2e — dùng chung cho E1–E5 (golden STATE §13).
import { expect, type Page } from '@playwright/test';

export async function gotoTags(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
  await expect(page.getByTestId('tags-count')).toHaveText('12 / 12 tag');
}

/** Reset qua UI ở đầu mỗi test (sim state chia sẻ, workers: 1 — OQ-066). */
export async function resetSim(page: Page): Promise<void> {
  await page.getByTestId('btn-reset').click();
  await expect(page.getByTestId('step-count')).toHaveText('0');
  await expect(page.getByTestId('sim-time')).toHaveText('00:00.000');
  await expect(page.getByTestId('sim-state')).toHaveText('IDLE');
}

export async function getStepCount(page: Page): Promise<number> {
  const text = await page.getByTestId('step-count').textContent();
  return Number(text ?? '0');
}

/** Đọc "mm:ss.mmm" thành ms (mm = tổng phút, OQ-069). */
export function parseSimTime(text: string): number {
  const m = /^(\d+):(\d{2})\.(\d{3})$/.exec(text.trim());
  if (m === null) throw new Error(`simTime không đúng định dạng: ${text}`);
  return Number(m[1]) * 60_000 + Number(m[2]) * 1000 + Number(m[3]);
}

export async function getSimTimeMs(page: Page): Promise<number> {
  const text = await page.getByTestId('sim-time').textContent();
  return parseSimTime(text ?? '');
}

/**
 * Giá trị hiển thị của tag: Bool free → nút toggle; số free → ô nhập;
 * non-free → span value-text.
 */
export async function getTagValue(page: Page, name: string): Promise<string> {
  const toggle = page.getByTestId(`toggle-${name}`);
  if ((await toggle.count()) > 0) return (await toggle.textContent())?.trim() ?? '';
  const input = page.getByTestId(`input-${name}`);
  if ((await input.count()) > 0) return await input.inputValue();
  const text = page.getByTestId(`value-text-${name}`);
  return (await text.textContent())?.trim() ?? '';
}

/** Chờ giá trị tag đạt kỳ vọng (poll, auto-retry của Playwright). */
export async function waitForTagValue(
  page: Page,
  name: string,
  expected: string,
  timeout = 5000,
): Promise<void> {
  await expect
    .poll(async () => getTagValue(page, name), { timeout })
    .toBe(expected);
}
