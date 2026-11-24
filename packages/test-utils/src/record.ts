// recordChanges — @vcs/test-utils (M0 §7).
// Ghi lại mọi TagChange phát ra ở flush() để test khẳng định.

import type { TagChange, TagDB } from '@vcs/kernel';

export interface ChangeRecorder {
  /** Mọi thay đổi đã flush, theo thứ tự phát. */
  readonly changes: TagChange[];
  /** Hủy đăng ký subscriber. */
  dispose(): void;
}

export function recordChanges(tags: TagDB): ChangeRecorder {
  const changes: TagChange[] = [];
  const unsub = tags.subscribe('*', (batch) => {
    changes.push(...batch);
  });
  return { changes, dispose: unsub };
}
