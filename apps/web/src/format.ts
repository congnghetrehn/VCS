// Định dạng thời gian mô phỏng — @vcs/web (M0 §8.3, OQ-069).
// mm:ss.mmm, mm = TỔNG số phút (không cuộn giờ): 3 600 000 ms → "60:00.000".

/** Định dạng simTimeMs (số nguyên ms, >= 0) thành "mm:ss.mmm". */
export function formatSimTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  const pad2 = (n: number): string => String(n).padStart(2, '0');
  const pad3 = (n: number): string => String(n).padStart(3, '0');
  return `${pad2(minutes)}:${pad2(seconds)}.${pad3(millis)}`;
}
