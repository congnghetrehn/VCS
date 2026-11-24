// Test @vcs/test-utils (M0 §7, §12.1: helpers ~6).
import { describe, expect, it } from 'vitest';
import { FakeClock, defineTags, makeTags, recordChanges, waitFor } from './index.js';
import { ManualClock } from '@vcs/kernel';
import type { TagHandle } from '@vcs/kernel';

describe('defineTags', () => {
  it('phân tích shorthand cơ bản, mặc định controller PLC1 + kind suy ra', () => {
    const defs = defineTags('IN_A:Bool:I:%I0.0', 'PT01:Int:I:%IW64', 'OUT_A:Bool:Q:%Q0.0');
    expect(defs).toEqual([
      expect.objectContaining({
        name: 'IN_A',
        type: 'Bool',
        area: 'I',
        address: '%I0.0',
        controller: 'PLC1',
        signal: { kind: 'DI' },
      }),
      expect.objectContaining({ name: 'PT01', signal: { kind: 'AI' } }),
      expect.objectContaining({ name: 'OUT_A', signal: { kind: 'DO' } }),
    ]);
  });

  it('controller + kind tường minh được giữ nguyên', () => {
    const defs = defineTags('CNT:Int:Q:%QW0:PLC2:AO');
    expect(defs[0]).toEqual(
      expect.objectContaining({ name: 'CNT', controller: 'PLC2', signal: { kind: 'AO' } }),
    );
  });

  it('nhiều dòng trong một chuỗi, bỏ dòng trống + comment', () => {
    const defs = defineTags(`
      # comment
      A:Bool:I:%I0.0

      B:Bool:Q:%Q0.0
    `);
    expect(defs.map((d) => d.name)).toEqual(['A', 'B']);
  });

  it('địa chỉ sym: được chấp nhận', () => {
    const defs = defineTags('X:Bool:I:sym:DB1.Start');
    expect(defs[0]?.address).toBe('sym:DB1.Start');
  });

  it.each([
    ['thiếu trường', 'A:Bool:I'],
    ['tên sai', '1A:Bool:I:%I0.0'],
    ['kiểu sai', 'A:Foo:I:%I0.0'],
    ['vùng sai', 'A:Bool:X:%I0.0'],
    ['địa chỉ sai', 'A:Bool:I:XYZ'],
    ['kind sai vùng', 'A:Bool:I:%I0.0:PLC1:DO'],
    ['kind lạ', 'A:Bool:I:%I0.0:PLC1:XX'],
  ])('dòng sai (%s) → ném Error', (_label, line) => {
    expect(() => defineTags(line)).toThrow(Error);
  });
});

describe('makeTags', () => {
  it('không đối số → tập golden 4 tag (BTN_START/SENSOR/LAMP_RUN/CNT)', () => {
    const { tags, clock } = makeTags();
    expect(tags.names()).toEqual(['BTN_START', 'SENSOR', 'LAMP_RUN', 'CNT']);
    expect(clock.nowMs()).toBe(0);
    expect(clock).toBeInstanceOf(ManualClock);
  });

  it('nhận shorthand string và mảng TagDef', () => {
    const a = makeTags('A:Bool:I:%I0.0\nB:Int:Q:%QW0');
    expect(a.tags.names()).toEqual(['A', 'B']);
    const b = makeTags(defineTags('C:Bool:I:%I0.0'));
    expect(b.tags.names()).toEqual(['C']);
  });

  it('dùng clock truyền vào (cùng instance)', () => {
    const clock = new ManualClock();
    clock.advance(50);
    const { tags, clock: used } = makeTags(undefined, { clock });
    expect(used).toBe(clock);
    tags.set(0 as TagHandle, true);
    expect(tags.read('BTN_START').ts).toBe(50);
  });

  it('truyền TagDBOptions qua (validate/enforceOwnership)', () => {
    const { tags } = makeTags(undefined, { validate: false });
    expect(() => {
      tags.write('CNT', 99999);
    }).not.toThrow();
  });
});

describe('FakeClock', () => {
  it('set nhảy thời gian; advance kế thừa từ ManualClock', () => {
    const clock = new FakeClock();
    clock.set(500);
    expect(clock.nowMs()).toBe(500);
    clock.advance(10);
    expect(clock.nowMs()).toBe(510);
    clock.set(0);
    expect(clock.nowMs()).toBe(0);
  });

  it('set giá trị không hợp lệ → RangeError', () => {
    const clock = new FakeClock();
    expect(() => {
      clock.set(-1);
    }).toThrow(RangeError);
    expect(() => {
      clock.set(1.5);
    }).toThrow(RangeError);
  });
});

describe('recordChanges', () => {
  it('ghi lại mọi change đã flush; dispose dừng ghi', () => {
    const { tags } = makeTags();
    const rec = recordChanges(tags);
    tags.set(1 as TagHandle, true, 'test');
    tags.flush();
    expect(rec.changes).toHaveLength(1);
    expect(rec.changes[0]).toMatchObject({ name: 'SENSOR', newValue: true });
    rec.dispose();
    tags.set(1 as TagHandle, false, 'test');
    tags.flush();
    expect(rec.changes).toHaveLength(1);
  });
});

describe('waitFor', () => {
  it('resolve khi điều kiện thành true', async () => {
    let ready = false;
    setTimeout(() => {
      ready = true;
    }, 20);
    await waitFor(() => ready, { timeoutMs: 500, intervalMs: 5 });
    expect(ready).toBe(true);
  });

  it('reject khi hết timeout', async () => {
    await expect(waitFor(() => false, { timeoutMs: 30, intervalMs: 5 })).rejects.toThrow(
      /hết thời gian chờ/,
    );
  });

  it('reject với lỗi của điều kiện', async () => {
    await expect(
      waitFor(
        () => {
          throw new Error('điều kiện lỗi');
        },
        { timeoutMs: 100 },
      ),
    ).rejects.toThrow('điều kiện lỗi');
  });
});
