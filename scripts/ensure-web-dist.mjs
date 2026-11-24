#!/usr/bin/env node
// Đảm bảo apps/web/dist tồn tại trước khi chạy e2e local (OQ-066):
// nếu thiếu index.html thì build web một lần rồi mới chạy playwright test.
// CI chạy `pnpm build` tường minh nên script này là no-op ở CI.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = join(ROOT, 'apps', 'web', 'dist', 'index.html');
if (!existsSync(indexHtml)) {
  process.stdout.write('ensure-web-dist: apps/web/dist thiếu — build web trước…\n');
  execSync('pnpm --filter @vcs/web build', { cwd: ROOT, stdio: 'inherit' });
}
