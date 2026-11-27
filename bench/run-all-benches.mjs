// Chạy lần lượt 5 bench (M0 §12.4 + M2 §12), in tóm tắt, exit 1 nếu bất kỳ
// bench nào FAIL. Dùng Node thay cho chuỗi `&&` trong script `bench` của
// package.json: `&&` dừng ở bench đầu tiên FAIL (plant FAIL vs ≥ 5000 từ
// P2.3) nên các bench sau không bao giờ chạy — P2.4 commit 3 phát hiện khi
// closedloop (bước 5) không chạy qua `pnpm bench` dù đã nối vào. Runner này
// chạy hết, mỗi bench vẫn tự in kết quả + ghi `bench/results.json` của nó.
// Chạy: `pnpm bench` (hoặc trực tiếp `node bench/run-all-benches.mjs`).
//
// Dual path (D-008 B, commit 8, OQ-324): plant + closedloop chạy bằng node
// thuần từ bundle esbuild (`bench/dist/<tên>.bench.mjs`, build trước,
// fail-fast nếu bundle lỗi) — đo như production; tagdb/orchestrator/softplc
// GIỮ tsx (baseline M0 không đổi cách đo). Runner truyền `VCS_REPO_ROOT`
// cho bench bundle (OQ-325) vì bundle ở `bench/dist/` tính ROOT sai qua
// `import.meta.url`.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Bench §12 đo bằng bundle; bench M0 giữ tsx (OQ-324).
const BENCHES_TSX = ['tagdb', 'orchestrator', 'softplc'];
const BENCHES_BUNDLED = ['plant', 'closedloop'];

// Spawn node + CLI của tsx thay vì shim node_modules/.bin/tsx[.cmd]: cùng lỗi
// EINVAL khi Node spawnSync file .cmd trên Windows (xem scripts/build-bench-
// bundle.mjs). `dist/cli.mjs` là bin chính thức của tsx.
const tsxCli = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

// Bundle plant + closedloop trước (D-008 B): đo bằng node thuần như
// production; build lỗi → fail-fast, không chạy bench cũ.
const build = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build-bench-bundle.mjs')], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (build.status !== 0) {
  console.log('bench: FAIL — build bundle lỗi, dừng trước khi đo.');
  process.exit(1);
}

const failed = [];
for (const name of BENCHES_TSX) {
  const r = spawnSync(process.execPath, [tsxCli, `bench/${name}.bench.ts`], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '--expose-gc' },
  });
  if (r.status !== 0) failed.push(name);
}
for (const name of BENCHES_BUNDLED) {
  const r = spawnSync(process.execPath, [join(ROOT, 'bench', 'dist', `${name}.bench.mjs`)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '--expose-gc', VCS_REPO_ROOT: ROOT },
  });
  if (r.status !== 0) failed.push(name);
}

if (failed.length > 0) {
  console.log(`bench: FAIL — ${failed.join(', ')} (xem kết quả từng bench ở trên).`);
  process.exitCode = 1;
} else {
  console.log('bench: tất cả PASS.');
}
