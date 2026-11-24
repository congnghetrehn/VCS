// Lệnh `vcs version` — @vcs/cli (M0 §8.1).
// VERSION giữ đồng bộ tay với `apps/cli/package.json` (M0 chưa có build đọc
// version từ package.json — xem OQ-031).

export const VERSION = '0.1.0';

export function versionCommand(): number {
  console.log(`vcs ${VERSION}`);
  return 0;
}
