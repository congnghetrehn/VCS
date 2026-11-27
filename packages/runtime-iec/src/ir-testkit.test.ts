// Unit test trực tiếp cho `dbForFb` (ir-testkit) — D-009/A23.
import { describe, expect, it } from 'vitest';
import { dbForFb, fbBlock, iface, v } from './ir-testkit.js';

describe('dbForFb', () => {
  it('IN_OUT kích thước tự nhiên, field hiện (A23)', () => {
    const fb = fbBlock(
      'FB_T',
      iface([v('a', 'Bool')], [v('q', 'Bool')], [v('io', 'Int')], [v('st', 'Int')], []),
      [],
    );
    const db = dbForFb('FB_T', 'DB_T', fb.interface);
    // a byte 0 bit 0; q byte 0 bit 1; io: Int byte 2 (căn chẵn, 2B);
    // st: Int byte 4, size 2 → tổng 6 (trước A23: slot DInt 4 byte ẩn, size 8).
    expect(db.fields.map((f) => [f.name, f.byteOffset, f.size])).toEqual([
      ['a', 0, 1],
      ['q', 0, 1],
      ['io', 2, 2],
      ['st', 4, 2],
    ]);
    expect(db.size).toBe(6);
    expect(db.fbName).toBe('FB_T');
  });
});
