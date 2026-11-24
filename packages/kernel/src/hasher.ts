// TraceHasher — @vcs/kernel (M0 §6.9).
// Băm sha256 tăng dần luồng TagChange (subscribe '*' trên TagDB) để kiểm chứng
// tất định: cùng cấu hình + seed + đầu vào ⇒ cùng hash. Không chứa wall time.

import { createHash, type Hash } from 'node:crypto';
import type { Unsub } from '@vcs/schemas';
import type { TagChange, TagDB } from './tags.js';

/** Mã hóa một TagChange (M0 §6.9): simTime uint64 BE | handle uint32 BE | giá trị
 * (Bool = 1 byte; số = float64 big-endian; chuỗi = độ dài uint32 BE + UTF-8). */
function feedChange(hash: Hash, c: TagChange): void {
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(c.ts));
  hash.update(time);
  const handle = Buffer.alloc(4);
  handle.writeUInt32BE(c.handle);
  hash.update(handle);
  const v = c.newValue;
  if (typeof v === 'boolean') {
    hash.update(Buffer.from([v ? 1 : 0]));
  } else if (typeof v === 'number') {
    const num = Buffer.alloc(8);
    num.writeDoubleBE(v);
    hash.update(num);
  } else {
    const bytes = Buffer.from(v, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(bytes.length);
    hash.update(len);
    hash.update(bytes);
  }
}

export class TraceHasher {
  #hash: Hash = createHash('sha256');
  readonly #unsub: Unsub;

  constructor(tags: TagDB) {
    this.#unsub = tags.subscribe('*', (changes) => {
      for (const c of changes) feedChange(this.#hash, c);
    });
  }

  /** sha256 hex của luồng thay đổi đã thấy (không làm đổi trạng thái). */
  hash(): string {
    return this.#hash.copy().digest('hex');
  }

  /**
   * Đặt lại luồng băm về rỗng. BẮT BUỘC gọi sau `TagDB.restore()` nếu muốn
   * chạy lại cho hash giống hệt lần trước (kế hoạch §10 bước 5b): nếu không,
   * thay đổi phát ra bởi flush sau restore sẽ lọt vào luồng băm.
   */
  reset(): void {
    this.#hash = createHash('sha256');
  }

  dispose(): void {
    this.#unsub();
  }
}
