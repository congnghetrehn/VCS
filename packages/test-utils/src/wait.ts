// waitFor — @vcs/test-utils (M0 §7).
// Chỉ dùng cho đường bất đồng bộ (P0.4+); test đồng bộ P0.3 không chờ wall time.

export interface WaitForOptions {
  /** Hết thời gian thì reject (mặc định 1000 ms). */
  timeoutMs?: number;
  /** Khoảng thăm dò (mặc định 10 ms). */
  intervalMs?: number;
  /** Thông điệp khi timeout. */
  message?: string;
}

export function waitFor(
  condition: () => boolean | Promise<boolean>,
  opts?: WaitForOptions,
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 1000;
  const intervalMs = opts?.intervalMs ?? 10;
  const message = opts?.message ?? 'waitFor: hết thời gian chờ điều kiện';
  const started = Date.now();
  return new Promise<void>((resolve, reject) => {
    const tick = (): void => {
      void Promise.resolve(condition()).then(
        (ok) => {
          if (ok) {
            resolve();
            return;
          }
          if (Date.now() - started >= timeoutMs) {
            reject(new Error(`${message} (timeout ${String(timeoutMs)} ms)`));
            return;
          }
          setTimeout(tick, intervalMs);
        },
        (err: unknown) => {
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    };
    tick();
  });
}
