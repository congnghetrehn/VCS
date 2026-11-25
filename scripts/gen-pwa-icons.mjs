#!/usr/bin/env node
// Sinh PNG icon PWA từ apps/web/public/icons/icon.svg (P0.9, OQ-224).
// Dùng Playwright chromium đã có ở root (@playwright/test) — không thêm dep.
// Chạy: node scripts/gen-pwa-icons.mjs
// (chạy lại sau mỗi lần sửa icon.svg; PNG commit vào repo).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICONS_DIR = join(ROOT, 'apps', 'web', 'public', 'icons');

/** Kích thước PNG sinh ra (maskable 512 dùng cùng SVG — tia sét đã nằm trong vùng an toàn). */
const TARGETS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-512-maskable.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

const svg = readFileSync(join(ICONS_DIR, 'icon.svg'), 'utf-8');
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;

const browser = await chromium.launch();
try {
  for (const { file, size } of TARGETS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<body style="margin:0;padding:0"><img src="${dataUrl}" style="width:${size}px;height:${size}px;display:block" /></body>`,
    );
    await page.locator('img').screenshot({ path: join(ICONS_DIR, file) });
    process.stdout.write(`gen-pwa-icons: ${file} (${size}x${size})\n`);
    await page.close();
  }
} finally {
  await browser.close();
}
