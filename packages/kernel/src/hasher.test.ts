// Test TraceHasher (M0 §6.9, §12.1: ≥ 6; §12.2 tất định).
import { createHash } from 'node:crypto';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ManualClock, TagDB, TraceHasher } from './index.js';
import type { TagHandle } from './index.js';
import type { DataType, SignalKind, TagDef, TagValue } from '@vcs/schemas';

/** Mã hóa độc lập theo spec §6.9 (viết từ spec, không dùng code hasher). */
function encodeChange(ts: number, handle: number, v: TagValue): Buffer {
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(ts));
  const h = Buffer.alloc(4);
  h.writeUInt32BE(handle);
  let val: Buffer;
  if (typeof v === 'boolean') {
    val = Buffer.from([v ? 1 : 0]);
  } else if (typeof v === 'number') {
    val = Buffer.alloc(8);
    val.writeDoubleBE(v);
  } else {
    const bytes = Buffer.from(v, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(bytes.length);
    val = Buffer.concat([len, bytes]);
  }
  return Buffer.concat([time, h, val]);
}

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function mkDef(
  name: string,
  type: DataType,
  area: 'I' | 'Q',
  kind: SignalKind | null,
  address: string,
): TagDef {
  const def: TagDef = { name, type, area, address, controller: 'PLC1' };
  if (kind !== null) def.signal = { kind };
  return def;
}

function setup(): { tags: TagDB; clock: ManualClock; hasher: TraceHasher } {
  const clock = new ManualClock();
  const tags = new TagDB(
    [
      mkDef('SENSOR', 'Bool', 'I', 'DI', '%I0.0'),
      mkDef('CNT', 'Int', 'Q', 'AO', '%QW0'),
      mkDef('NAME', 'String', 'I', null, '%IB0'),
      mkDef('PRESS', 'Real', 'I', 'AI', '%IW64'),
    ],
    clock,
  );
  // SENSOR/PRESS do plant sở hữu (M2 gán thiết bị) để test ghi bằng source 'plant'.
  tags.setOwner(0 as TagHandle, 'plant');
  tags.setOwner(3 as TagHandle, 'plant');
  const hasher = new TraceHasher(tags);
  return { tags, clock, hasher };
}

describe('TraceHasher', () => {
  it('hash rỗng = sha256 của luồng rỗng', () => {
    const { hasher } = setup();
    expect(hasher.hash()).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('một change Bool băm đúng mã hóa spec (simTime|handle|0x01)', () => {
    const { tags, hasher } = setup();
    tags.set(0 as TagHandle, true, 'plant');
    tags.flush();
    expect(hasher.hash()).toBe(sha256Hex(encodeChange(0, 0, true)));
  });

  it('nhiều change nối tiếp theo thứ tự flush', () => {
    const { tags, clock, hasher } = setup();
    tags.set(0 as TagHandle, true, 'plant');
    tags.set(1 as TagHandle, 5, 'plc');
    tags.flush();
    clock.advance(10);
    tags.set(1 as TagHandle, 6, 'plc');
    tags.flush();
    const expected = sha256Hex(
      Buffer.concat([encodeChange(0, 0, true), encodeChange(0, 1, 5), encodeChange(10, 1, 6)]),
    );
    expect(hasher.hash()).toBe(expected);
  });

  it('chuỗi băm có độ dài uint32 + UTF-8; số Real băm float64', () => {
    const { tags, hasher } = setup();
    tags.set(2 as TagHandle, 'AB', 'test');
    tags.set(3 as TagHandle, 1.5, 'plant');
    tags.flush();
    const expected = sha256Hex(Buffer.concat([encodeChange(0, 2, 'AB'), encodeChange(0, 3, 1.5)]));
    expect(hasher.hash()).toBe(expected);
  });

  it('ghi lại cùng giá trị không đổi hash (không có change)', () => {
    const { tags, hasher } = setup();
    tags.set(0 as TagHandle, true, 'plant');
    tags.flush();
    const h1 = hasher.hash();
    tags.set(0 as TagHandle, true, 'plant');
    tags.flush();
    expect(hasher.hash()).toBe(h1);
  });

  it('hai lần chạy cùng chuỗi thao tác cho hash giống hệt', () => {
    const run = (): string => {
      const { tags, clock, hasher } = setup();
      tags.set(0 as TagHandle, true, 'plant');
      tags.set(1 as TagHandle, 1, 'plc');
      tags.flush();
      clock.advance(10);
      tags.set(0 as TagHandle, false, 'plant');
      tags.set(1 as TagHandle, 2, 'plc');
      tags.flush();
      return hasher.hash();
    };
    expect(run()).toBe(run());
  });

  it('reset() đưa hash về rỗng', () => {
    const { tags, hasher } = setup();
    tags.set(0 as TagHandle, true, 'plant');
    tags.flush();
    expect(hasher.hash()).not.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    hasher.reset();
    expect(hasher.hash()).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('dispose() dừng băm các change sau đó', () => {
    const { tags, hasher } = setup();
    tags.set(0 as TagHandle, true, 'plant');
    tags.flush();
    const h1 = hasher.hash();
    hasher.dispose();
    tags.set(0 as TagHandle, false, 'plant');
    tags.flush();
    expect(hasher.hash()).toBe(h1);
  });

  it('sau restore mà không reset, flush phát change làm lệch hash (phải reset)', () => {
    const { tags, hasher } = setup();
    tags.set(1 as TagHandle, 4, 'plc');
    tags.flush();
    const snap = tags.snapshot();
    const hashBefore = hasher.hash();
    tags.set(1 as TagHandle, 9, 'plc');
    tags.flush();
    tags.restore(snap);
    tags.flush();
    // Change 9→4 sau restore đã lọt vào luồng băm → hash khác trước.
    expect(hasher.hash()).not.toBe(hashBefore);
    hasher.reset();
    expect(hasher.hash()).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('property: hai lần chạy cùng chuỗi ghi ngẫu nhiên cho hash giống hệt', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            h: fc.integer({ min: 0, max: 1 }),
            vBool: fc.boolean(),
            vInt: fc.integer({ min: -10, max: 10 }),
          }),
          { maxLength: 20 },
        ),
        (ops) => {
          const run = (): string => {
            const { tags, hasher } = setup();
            for (const op of ops) {
              tags.set(op.h as TagHandle, op.h === 1 ? op.vInt : op.vBool, 'system');
            }
            tags.flush();
            return hasher.hash();
          };
          expect(run()).toBe(run());
        },
      ),
      { seed: 20261124, numRuns: 50 },
    );
  });
});
