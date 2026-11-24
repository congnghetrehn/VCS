// FakeClock — @vcs/test-utils (M0 §7).
// ManualClock + `set(ms)` để nhảy thời gian trong test (không chờ wall time).

import { ManualClock } from '@vcs/kernel';

export class FakeClock extends ManualClock {
  /** Nhảy thẳng tới `ms` (số nguyên ≥ 0, ngược lại ném `RangeError`). */
  set(ms: number): void {
    this.restore(ms);
  }
}
