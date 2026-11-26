// So sánh hồi quy bench (M0 §12.4, OQ-073): đọc `bench/results.json` (sinh bởi
// `pnpm bench`) và so với `bench/baseline.json` (trung vị 5 mẫu, commit).
// Chênh > 20% theo hướng xấu → in `::warning::` (GitHub Actions), KHÔNG fail
// (exit 0). Chạy sau `pnpm bench` trong job bench CI.
//
// Hướng so sánh: setGetOpsPerSec / orchestratorStepsPerSec càng cao càng tốt
// (cảnh báo khi giảm > 20%); flushNoChangeUs / flushChangesMs càng thấp càng
// tốt (cảnh báo khi tăng > 20%). heapIncreaseMB: baseline âm/gần 0 nên so
// tương đối vô nghĩa — chỉ cảnh báo khi vượt ngưỡng tuyệt đối §12.4 (< 1 MB).
// Thiếu baseline → bỏ qua so sánh (cảnh báo, exit 0). Thiếu results.json →
// lỗi (exit 1) vì `pnpm bench` phải chạy trước.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS = join(ROOT, 'bench', 'results.json');
const BASELINE = join(ROOT, 'bench', 'baseline.json');
const THRESHOLD = 0.2; // 20%

/** higherIsBetter: true = càng cao càng tốt; false = càng thấp càng tốt. */
const METRICS = {
  setGetOpsPerSec: true,
  orchestratorStepsPerSec: true,
  plantStepsPerSec: true,
  flushNoChangeUs: false,
  flushChangesMs: false,
};

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`check-bench-regression: không đọc được ${label} (${path}): ${String(err)}`);
    process.exit(1);
  }
}

function main() {
  if (!existsSync(RESULTS)) {
    console.error('check-bench-regression: thiếu bench/results.json — chạy `pnpm bench` trước.');
    process.exit(1);
  }
  if (!existsSync(BASELINE)) {
    console.log(
      '::warning::check-bench-regression: chưa có bench/baseline.json — bỏ qua so sánh hồi quy.',
    );
    return;
  }
  const current = readJson(RESULTS, 'results.json').results;
  const baseline = readJson(BASELINE, 'baseline.json').results;
  let warned = 0;
  for (const [key, higherIsBetter] of Object.entries(METRICS)) {
    const base = baseline[key];
    const cur = current[key];
    if (typeof base !== 'number' || typeof cur !== 'number' || base === 0) {
      console.log(
        `::warning::check-bench-regression: bỏ qua ${key} (số liệu thiếu/không so được: baseline=${String(base)}, current=${String(cur)}).`,
      );
      continue;
    }
    const ratio = higherIsBetter ? cur / base : base / cur;
    const changePct = ((cur - base) / base) * 100;
    if (ratio < 1 - THRESHOLD) {
      warned += 1;
      console.log(
        `::warning::check-bench-regression: ${key} hồi quy ${changePct.toFixed(1)}% so với baseline (baseline=${base}, current=${cur}).`,
      );
    } else {
      console.log(
        `check-bench-regression: ${key} OK (${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}% so với baseline).`,
      );
    }
  }
  // heap: chỉ cảnh báo khi vượt ngưỡng tuyệt đối §12.4.
  const heap = current.heapIncreaseMB;
  if (typeof heap === 'number' && heap >= 1) {
    warned += 1;
    console.log(
      `::warning::check-bench-regression: heapIncreaseMB ${heap} MB vượt ngưỡng §12.4 (< 1 MB).`,
    );
  } else {
    console.log(`check-bench-regression: heapIncreaseMB OK (${String(heap)} MB).`);
  }
  // heap plant: chỉ cảnh báo khi vượt ngưỡng tuyệt đối M2 §12 (< 1 MB).
  const plantHeap = current.plantHeapIncreaseMB;
  if (typeof plantHeap === 'number' && plantHeap >= 1) {
    warned += 1;
    console.log(
      `::warning::check-bench-regression: plantHeapIncreaseMB ${plantHeap} MB vượt ngưỡng M2 §12 (< 1 MB).`,
    );
  } else {
    console.log(`check-bench-regression: plantHeapIncreaseMB OK (${String(plantHeap)} MB).`);
  }
  if (warned > 0) {
    console.log(`check-bench-regression: ${warned} cảnh báo hồi quy (không fail).`);
  } else {
    console.log('check-bench-regression: không có hồi quy > 20%.');
  }
}

main();
