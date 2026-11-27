// Bundle bench plant/closedloop bằng esbuild để chạy bằng node thuần (D-008 B,
// STATE §28 commit 8): đo tốc độ như production (server/CLI chạy từ JS biên
// dịch), không đo qua tsx. Chỉ 2 bench §12 đổi cách đo; tagdb/orchestrator/
// softplc giữ tsx (OQ-324).
// Chạy: node scripts/build-bench-bundle.mjs [plant|closedloop] (mặc định cả hai).
// Fail-fast khi bundle lỗi (exit 1) — runner không đo bằng bundle hỏng.

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'bench', 'dist');

// Spawn node + entry JS của esbuild thay vì shim node_modules/.bin/esbuild[.cmd]:
// Node spawnSync file .cmd trên Windows lỗi EINVAL (repro 2026-11-27: status
// null, signal null, error EINVAL) trong khi chạy trực tiếp ở PowerShell vẫn
// OK — esbuild bản thân không hỏng. Entry JS là bin chính thức của esbuild.
const esbuildBin = join(ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild');

const BUNDLED = ['plant', 'closedloop'];
const targets = process.argv.slice(2);
const names = targets.length > 0 ? targets : BUNDLED;
for (const name of names) {
  if (!BUNDLED.includes(name)) {
    console.error(`build-bench-bundle: chỉ bundle ${BUNDLED.join('/')}, nhận '${name}'.`);
    process.exit(1);
  }
}

mkdirSync(DIST, { recursive: true });
for (const name of names) {
  const r = spawnSync(
    process.execPath,
    [
      esbuildBin,
      join(ROOT, 'bench', `${name}.bench.ts`),
      '--bundle',
      '--format=esm',
      '--platform=node',
      // yaml (dep của @vcs/schemas) dùng require('process') động — esbuild
      // __require trong bundle ESM ném lỗi, shims không sửa được; để yaml
      // external, runtime resolve từ node_modules của repo (root devDep
      // yaml@2.9.1 — OQ-323). Tiền lệ: apps/server/tsup.config.ts +
      // apps/cli/tsup.config.ts.
      '--external:yaml',
      `--outfile=${join(DIST, `${name}.bench.mjs`)}`,
    ],
    { cwd: ROOT, stdio: 'inherit' },
  );
  if (r.status !== 0) {
    console.error(
      `build-bench-bundle: bundle ${name} FAIL (exit ${r.status}${r.error ? `, error: ${r.error.message}` : ''}).`,
    );
    process.exit(1);
  }
}
console.log(`build-bench-bundle: xong — ${names.map((n) => `bench/dist/${n}.bench.mjs`).join(', ')}`);
