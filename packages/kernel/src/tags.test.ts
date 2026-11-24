// Test TagDB (M0 §6.2, §12.1: ≥ 40).
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ManualClock, TagDB, TagError } from './index.js';
import type { TagChange, TagDBSnapshot, TagHandle, TagSource } from './index.js';
import type { DataType, SignalKind, TagDef, TagValue } from '@vcs/schemas';

function mkDef(
  name: string,
  type: DataType,
  area: 'I' | 'Q' | 'M' | 'DB',
  opts?: { controller?: string; kind?: SignalKind | null; initial?: TagValue; address?: string },
): TagDef {
  const address =
    opts?.address ??
    (area === 'I' ? (type === 'Bool' ? '%I0.0' : '%IW64') : type === 'Bool' ? '%Q0.0' : '%QW0');
  const def: TagDef = {
    name,
    type,
    area,
    address,
    controller: opts?.controller ?? 'PLC1',
  };
  if (opts?.kind !== undefined && opts.kind !== null) def.signal = { kind: opts.kind };
  if (opts?.initial !== undefined) def.initial = opts.initial;
  return def;
}

/** Tập tag golden STATE §10: h0 BTN_START, h1 SENSOR, h2 LAMP_RUN, h3 CNT. */
function goldenDefs(): TagDef[] {
  return [
    mkDef('BTN_START', 'Bool', 'I', { kind: 'DI', address: '%I0.0' }),
    mkDef('SENSOR', 'Bool', 'I', { kind: 'DI', address: '%I0.1' }),
    mkDef('LAMP_RUN', 'Bool', 'Q', { kind: 'DO', address: '%Q0.0' }),
    mkDef('CNT', 'Int', 'Q', { kind: 'AO', address: '%QW0' }),
  ];
}

function goldenDb(opts?: { validate?: boolean; enforceOwnership?: boolean }): {
  tags: TagDB;
  clock: ManualClock;
} {
  const clock = new ManualClock();
  const tags = new TagDB(goldenDefs(), clock, opts);
  return { tags, clock };
}

describe('TagDB — dựng và tra cứu', () => {
  it('handle = chỉ số theo thứ tự định nghĩa; size/names/meta đúng', () => {
    const { tags } = goldenDb();
    expect(tags.size).toBe(4);
    expect(tags.handle('BTN_START')).toBe(0);
    expect(tags.handle('SENSOR')).toBe(1);
    expect(tags.handle('LAMP_RUN')).toBe(2);
    expect(tags.handle('CNT')).toBe(3);
    expect(tags.handle('KHONG_CO')).toBeUndefined();
    expect(tags.has('CNT')).toBe(true);
    expect(tags.has('KHONG_CO')).toBe(false);
    expect(tags.names()).toEqual(['BTN_START', 'SENSOR', 'LAMP_RUN', 'CNT']);
    const meta = tags.meta(3 as TagHandle);
    expect(meta.name).toBe('CNT');
    expect(meta.type).toBe('Int');
    expect(meta.area).toBe('Q');
    expect(meta.controller).toBe('PLC1');
    expect(meta.kind).toBe('AO');
    expect(meta.initial).toBe(0);
  });

  it('giá trị khởi tạo mặc định theo kiểu (Bool false, số 0, String rỗng)', () => {
    const clock = new ManualClock();
    const tags = new TagDB(
      [
        mkDef('B', 'Bool', 'I', { kind: 'DI' }),
        mkDef('N', 'Int', 'Q', { kind: 'AO' }),
        mkDef('S', 'String', 'I', { kind: null, address: '%IB0' }),
      ],
      clock,
    );
    expect(tags.get(0 as TagHandle)).toBe(false);
    expect(tags.get(1 as TagHandle)).toBe(0);
    expect(tags.get(2 as TagHandle)).toBe('');
  });

  it('giá trị khởi tạo lấy từ def.initial', () => {
    const clock = new ManualClock();
    const tags = new TagDB([mkDef('CNT', 'Int', 'Q', { kind: 'AO', initial: 7 })], clock);
    expect(tags.get(0 as TagHandle)).toBe(7);
    expect(tags.meta(0 as TagHandle).initial).toBe(7);
  });

  it('initial không hợp lệ → TagError TAG-E001 ngay khi dựng', () => {
    const clock = new ManualClock();
    expect(
      () => new TagDB([mkDef('CNT', 'Int', 'Q', { kind: 'AO', initial: 40000 })], clock),
    ).toThrow(TagError);
    expect(
      () => new TagDB([mkDef('CNT', 'Int', 'Q', { kind: 'AO', initial: 40000 })], clock),
    ).toThrow('TAG-E001');
  });

  it('tag M/DB → Error thường nêu tên + area (OQ-016)', () => {
    const clock = new ManualClock();
    expect(
      () => new TagDB([mkDef('M0', 'Bool', 'M', { kind: null, address: '%M0.0' })], clock),
    ).toThrow(/vùng I\/Q.*M0.*area 'M'/);
  });

  it('trùng tên tag → Error', () => {
    const clock = new ManualClock();
    expect(
      () =>
        new TagDB(
          [
            mkDef('A', 'Bool', 'I', { kind: 'DI' }),
            mkDef('A', 'Bool', 'I', { kind: 'DI', address: '%I0.1' }),
          ],
          clock,
        ),
    ).toThrow(/trùng tên tag 'A'/);
  });

  it('owner mặc định: DO/AO → controller; DI/AI/kind null → free', () => {
    const { tags } = goldenDb();
    expect(tags.owner(0 as TagHandle)).toBe('free');
    expect(tags.owner(1 as TagHandle)).toBe('free');
    expect(tags.owner(2 as TagHandle)).toBe('controller');
    expect(tags.owner(3 as TagHandle)).toBe('controller');
  });

  it('meta/get với handle ngoài khoảng → TagError TAG-E003', () => {
    const { tags } = goldenDb();
    expect(() => tags.meta(4 as TagHandle)).toThrow('TAG-E003');
    expect(() => tags.meta(-1 as TagHandle)).toThrow('TAG-E003');
    expect(() => tags.get(99 as TagHandle)).toThrow('TAG-E003');
  });
});

describe('TagDB — đọc/ghi', () => {
  it('set cập nhật ngay trước flush; get trả giá trị mới', () => {
    const { tags } = goldenDb();
    tags.set(1 as TagHandle, true);
    expect(tags.get(1 as TagHandle)).toBe(true);
    expect(tags.read('SENSOR').value).toBe(true);
  });

  it('read trả đủ trường (name/type/value/quality/ts/source); ts = clock lúc ghi', () => {
    const { tags, clock } = goldenDb();
    clock.advance(25);
    tags.set(3 as TagHandle, 5, 'plc');
    const tag = tags.read('CNT');
    expect(tag).toEqual({
      name: 'CNT',
      type: 'Int',
      value: 5,
      quality: 'good',
      ts: 25,
      source: 'plc',
    });
  });

  it('read tag không tồn tại → TAG-E003', () => {
    const { tags } = goldenDb();
    expect(() => tags.read('KHONG_CO')).toThrow('TAG-E003');
  });

  it('write theo tên và theo handle; mặc định source system (OQ-013)', () => {
    const { tags } = goldenDb();
    const seen: TagChange[] = [];
    tags.subscribe('*', (batch) => seen.push(...batch));
    tags.write('CNT', 9);
    tags.write(1 as TagHandle, true, 'test');
    tags.flush();
    expect(seen).toEqual([
      expect.objectContaining({ name: 'SENSOR', newValue: true, source: 'test' }),
      expect.objectContaining({ name: 'CNT', newValue: 9, source: 'system' }),
    ]);
  });

  it('write tên không tồn tại → TAG-E003', () => {
    const { tags } = goldenDb();
    expect(() => {
      tags.write('KHONG_CO', true);
    }).toThrow('TAG-E003');
  });

  it('set mặc định source system (OQ-013)', () => {
    const { tags } = goldenDb();
    const seen: TagChange[] = [];
    tags.subscribe('*', (batch) => seen.push(...batch));
    tags.set(1 as TagHandle, true);
    tags.flush();
    expect(seen[0]?.source).toBe('system');
  });
});

describe('TagDB — validate (quy tắc 5)', () => {
  it.each([
    ['Int 32767 ok', 'CNT', 32767, true],
    ['Int 32768 → E001', 'CNT', 32768, false],
    ['Int 1.5 → E001', 'CNT', 1.5, false],
    ['Int -32768 ok', 'CNT', -32768, true],
    ['Int -32769 → E001', 'CNT', -32769, false],
  ])('%s', (_label, name, value, ok) => {
    const { tags } = goldenDb();
    if (ok) {
      expect(() => {
        tags.write(name, value);
      }).not.toThrow();
    } else {
      expect(() => {
        tags.write(name, value);
      }).toThrow('TAG-E001');
    }
  });

  it('Bool ghi 1/"true" → TAG-E001; ghi boolean ok', () => {
    const { tags } = goldenDb();
    expect(() => {
      tags.write('SENSOR', 1);
    }).toThrow('TAG-E001');
    expect(() => {
      tags.write('SENSOR', 'true');
    }).toThrow('TAG-E001');
    expect(() => {
      tags.write('SENSOR', true);
    }).not.toThrow();
  });

  it('Real chấp nhận NaN/±Infinity và fround giá trị (AGENTS §4)', () => {
    const clock = new ManualClock();
    const tags = new TagDB([mkDef('P', 'Real', 'I', { kind: 'AI' })], clock);
    tags.set(0 as TagHandle, Number.NaN);
    expect(tags.get(0 as TagHandle)).toBeNaN();
    tags.set(0 as TagHandle, Number.POSITIVE_INFINITY);
    expect(tags.get(0 as TagHandle)).toBe(Number.POSITIVE_INFINITY);
    tags.set(0 as TagHandle, 0.1);
    expect(tags.get(0 as TagHandle)).toBe(Math.fround(0.1));
  });

  it('Time phải nguyên ≥ 0; Word/DWord đúng khoảng', () => {
    const clock = new ManualClock();
    const tags = new TagDB(
      [
        mkDef('T', 'Time', 'I', { kind: null, address: '%IW64' }),
        mkDef('W', 'Word', 'Q', { kind: 'AO' }),
        mkDef('DW', 'DWord', 'Q', { kind: 'AO', address: '%QD0' }),
      ],
      clock,
    );
    expect(() => {
      tags.set(0 as TagHandle, -1);
    }).toThrow('TAG-E001');
    expect(() => {
      tags.set(0 as TagHandle, 1.5);
    }).toThrow('TAG-E001');
    expect(() => {
      tags.set(0 as TagHandle, 100);
    }).not.toThrow();
    expect(() => {
      tags.set(1 as TagHandle, 65535);
    }).not.toThrow();
    expect(() => {
      tags.set(1 as TagHandle, 65536);
    }).toThrow('TAG-E001');
    expect(() => {
      tags.set(2 as TagHandle, 4294967295);
    }).not.toThrow();
    expect(() => {
      tags.set(2 as TagHandle, 4294967296);
    }).toThrow('TAG-E001');
  });

  it('validate: false cho ghi ngoài khoảng (đường bench)', () => {
    const { tags } = goldenDb({ validate: false });
    expect(() => {
      tags.write('CNT', 99999);
    }).not.toThrow();
    expect(tags.get(3 as TagHandle)).toBe(99999);
  });

  it('lỗi TAG-E001 là TagError có code + message nêu đối tượng', () => {
    const { tags } = goldenDb();
    try {
      tags.write('CNT', 40000);
      expect.unreachable('phải ném lỗi');
    } catch (err) {
      expect(err).toBeInstanceOf(TagError);
      expect((err as TagError).code).toBe('TAG-E001');
      expect((err as Error).message).toContain("tag 'CNT'");
    }
  });
});

describe('TagDB — ownership (quy tắc 6)', () => {
  it('checkWrite đúng bảng quyền (STATE §10)', () => {
    const { tags } = goldenDb();
    tags.setOwner(1 as TagHandle, 'plant');
    const cases: Array<[number, string, string]> = [
      [1, 'plant', 'ok'],
      [1, 'system', 'ok'],
      [1, 'plc', 'denied'],
      [1, 'test', 'denied'],
      [2, 'plc', 'ok'],
      [2, 'system', 'ok'],
      [2, 'plant', 'denied'],
      [2, 'test', 'denied'],
      [0, 'test', 'ok'],
      [0, 'hmi', 'ok'],
      [0, 'gateway', 'ok'],
      [0, 'system', 'ok'],
      [0, 'plant', 'denied'],
      [0, 'plc', 'denied'],
    ];
    for (const [h, source, expected] of cases) {
      expect(tags.checkWrite(h as TagHandle, source as TagSource)).toBe(expected);
    }
  });

  it('ghi vi phạm ownership → TAG-E002; source import luôn bị từ chối', () => {
    const { tags } = goldenDb();
    tags.setOwner(1 as TagHandle, 'plant');
    expect(() => {
      tags.set(1 as TagHandle, true, 'plc');
    }).toThrow('TAG-E002');
    expect(() => {
      tags.set(2 as TagHandle, true, 'test');
    }).toThrow('TAG-E002');
    expect(() => {
      tags.set(0 as TagHandle, true, 'import');
    }).toThrow('TAG-E002');
    expect(tags.get(1 as TagHandle)).toBe(false);
  });

  it('setOwner đổi owner; enforceOwnership: false bỏ qua kiểm tra', () => {
    const { tags } = goldenDb({ enforceOwnership: false });
    tags.setOwner(1 as TagHandle, 'plant');
    expect(() => {
      tags.set(1 as TagHandle, true, 'plc');
    }).not.toThrow();
    expect(tags.owner(1 as TagHandle)).toBe('plant');
  });
});

describe('TagDB — flush theo lô (quy tắc 2–3)', () => {
  it('không thay đổi → subscriber không được gọi', () => {
    const { tags } = goldenDb();
    let calls = 0;
    tags.subscribe('*', () => {
      calls += 1;
    });
    tags.flush();
    expect(calls).toBe(0);
  });

  it('flush phát đúng một change với old/new/source/ts/writes', () => {
    const { tags, clock } = goldenDb();
    tags.setOwner(1 as TagHandle, 'plant');
    clock.advance(10);
    const seen: TagChange[] = [];
    tags.subscribe('*', (batch) => seen.push(...batch));
    tags.set(1 as TagHandle, true, 'plant');
    tags.flush();
    expect(seen).toEqual([
      {
        handle: 1,
        name: 'SENSOR',
        oldValue: false,
        newValue: true,
        source: 'plant',
        ts: 10,
        writes: 1,
      },
    ]);
  });

  it('ghi lại cùng giá trị → không phát; giá trị quay về cũ → không phát', () => {
    const { tags } = goldenDb();
    const seen: TagChange[] = [];
    tags.subscribe('*', (batch) => seen.push(...batch));
    tags.set(1 as TagHandle, false);
    tags.flush();
    expect(seen).toEqual([]);
    tags.set(1 as TagHandle, true);
    tags.set(1 as TagHandle, false);
    tags.flush();
    expect(seen).toEqual([]);
  });

  it('nhiều lần ghi trong một kỳ gom thành 1 change, writes đếm đủ', () => {
    const { tags } = goldenDb();
    const seen: TagChange[] = [];
    tags.subscribe('*', (batch) => seen.push(...batch));
    tags.set(3 as TagHandle, 1, 'plc');
    tags.set(3 as TagHandle, 2, 'plc');
    tags.set(3 as TagHandle, 3, 'plc');
    tags.flush();
    expect(seen).toEqual([
      expect.objectContaining({ name: 'CNT', oldValue: 0, newValue: 3, writes: 3 }),
    ]);
  });

  it('flush phát theo thứ tự handle tăng dần, không theo thứ tự ghi', () => {
    const { tags } = goldenDb();
    tags.setOwner(1 as TagHandle, 'plant');
    const seen: TagChange[] = [];
    tags.subscribe('*', (batch) => seen.push(...batch));
    tags.set(3 as TagHandle, 1, 'plc');
    tags.set(0 as TagHandle, true, 'test');
    tags.set(1 as TagHandle, true, 'plant');
    tags.flush();
    expect(seen.map((c) => c.name)).toEqual(['BTN_START', 'SENSOR', 'CNT']);
  });

  it('subscriber gọi theo thứ tự đăng ký, đồng bộ', () => {
    const { tags } = goldenDb();
    const order: string[] = [];
    tags.subscribe('*', () => order.push('a'));
    tags.subscribe('*', () => order.push('b'));
    tags.set(1 as TagHandle, true);
    tags.flush();
    expect(order).toEqual(['a', 'b']);
  });

  it('subscriber chọn handle chỉ nhận change của tag đó', () => {
    const { tags } = goldenDb();
    const seen: TagChange[] = [];
    tags.subscribe([3 as TagHandle], (batch) => seen.push(...batch));
    tags.set(1 as TagHandle, true);
    tags.set(3 as TagHandle, 1, 'plc');
    tags.flush();
    expect(seen.map((c) => c.name)).toEqual(['CNT']);
  });

  it('unsubscribe dừng nhận; gọi 2 lần vẫn an toàn', () => {
    const { tags } = goldenDb();
    const seen: TagChange[] = [];
    const unsub = tags.subscribe('*', (batch) => seen.push(...batch));
    unsub();
    unsub();
    tags.set(1 as TagHandle, true);
    tags.flush();
    expect(seen).toEqual([]);
  });

  it('subscriber ném lỗi → lan truyền (OQ-015), không nuốt', () => {
    const { tags } = goldenDb();
    tags.subscribe('*', () => {
      throw new Error('subscriber lỗi');
    });
    tags.set(1 as TagHandle, true);
    expect(() => {
      tags.flush();
    }).toThrow('subscriber lỗi');
  });

  it('subscriber lỗi không làm change bị phát lại ở flush sau', () => {
    const { tags } = goldenDb();
    let fail = true;
    const seen: TagChange[] = [];
    tags.subscribe('*', () => {
      if (fail) throw new Error('lỗi lần đầu');
    });
    tags.subscribe('*', (batch) => seen.push(...batch));
    tags.set(1 as TagHandle, true);
    expect(() => {
      tags.flush();
    }).toThrow('lỗi lần đầu');
    fail = false;
    tags.flush();
    expect(seen).toEqual([]);
  });

  it('setQuality đổi quality, không phát change', () => {
    const { tags } = goldenDb();
    const seen: TagChange[] = [];
    tags.subscribe('*', (batch) => seen.push(...batch));
    tags.setQuality(1 as TagHandle, 'bad');
    tags.flush();
    expect(seen).toEqual([]);
    expect(tags.read('SENSOR').quality).toBe('bad');
  });
});

describe('TagDB — snapshot/restore/reset (quy tắc 7)', () => {
  it('snapshot JSON-serializable; restore(snapshot()) là phép đồng nhất', () => {
    const { tags } = goldenDb();
    tags.setOwner(1 as TagHandle, 'plant');
    tags.set(1 as TagHandle, true, 'plant');
    tags.set(3 as TagHandle, 4, 'plc');
    tags.flush();
    const snap = tags.snapshot();
    const parsed = JSON.parse(JSON.stringify(snap)) as TagDBSnapshot;
    tags.restore(parsed);
    expect(tags.snapshot()).toEqual(snap);
    const seen: TagChange[] = [];
    tags.subscribe('*', (batch) => seen.push(...batch));
    tags.flush();
    expect(seen).toEqual([]);
  });

  it('restore namesHash không khớp → lỗi SIM-E003', () => {
    const { tags } = goldenDb();
    const snap = tags.snapshot();
    expect(() => {
      tags.restore({ ...snap, namesHash: 'deadbeef' });
    }).toThrow('SIM-E003');
  });

  it('restore snapshot của tập tag khác (độ dài lệch) → lỗi SIM-E003', () => {
    const { tags } = goldenDb();
    const other = new TagDB([mkDef('X', 'Bool', 'I', { kind: 'DI' })], new ManualClock());
    const snap = other.snapshot();
    expect(() => {
      tags.restore(snap);
    }).toThrow('SIM-E003');
  });

  it('sau restore, flush phát thay đổi so với giá trị flush cuối, writes = 0 (OQ-019)', () => {
    const { tags } = goldenDb();
    tags.set(3 as TagHandle, 4, 'plc');
    tags.flush();
    const snap = tags.snapshot();
    tags.set(3 as TagHandle, 9, 'plc');
    tags.flush();
    const seen: TagChange[] = [];
    tags.subscribe('*', (batch) => seen.push(...batch));
    tags.restore(snap);
    tags.flush();
    expect(seen).toEqual([
      expect.objectContaining({ name: 'CNT', oldValue: 9, newValue: 4, writes: 0 }),
    ]);
  });

  it('reset về giá trị khởi tạo; flush sau reset phát thay đổi', () => {
    const { tags } = goldenDb();
    tags.setOwner(1 as TagHandle, 'plant');
    tags.set(1 as TagHandle, true, 'plant');
    tags.set(3 as TagHandle, 4, 'plc');
    tags.flush();
    const seen: TagChange[] = [];
    tags.subscribe('*', (batch) => seen.push(...batch));
    tags.reset();
    expect(tags.get(1 as TagHandle)).toBe(false);
    expect(tags.get(3 as TagHandle)).toBe(0);
    expect(tags.read('SENSOR').quality).toBe('good');
    tags.flush();
    expect(seen.map((c) => [c.name, c.oldValue, c.newValue])).toEqual([
      ['SENSOR', true, false],
      ['CNT', 4, 0],
    ]);
  });

  it('snapshot giữ quality/ts/source', () => {
    const { tags, clock } = goldenDb();
    tags.setOwner(1 as TagHandle, 'plant');
    clock.advance(30);
    tags.set(1 as TagHandle, true, 'plant');
    tags.setQuality(1 as TagHandle, 'uncertain');
    const snap = tags.snapshot();
    expect(snap.quality[1]).toBe(2);
    expect(snap.ts[1]).toBe(30);
    expect(snap.source[1]).toBe('plant');
    tags.set(1 as TagHandle, false, 'plant');
    tags.restore(snap);
    expect(tags.read('SENSOR')).toEqual(
      expect.objectContaining({ value: true, quality: 'uncertain', ts: 30, source: 'plant' }),
    );
  });
});

describe('TagDB — không cấp phát (M0 §12.4)', () => {
  // Timeout 60 s (mặc định 5 s): đo coverage v8 chèn bộ đếm vào mọi hàm nên
  // vòng 10M thao tác chạy chậm hơn nhiều — đây là chi phí đo, không phải
  // hành vi đổi. Khẳng định heap < 1 MB không đổi.
  it('get/set không cấp phát: heap tăng < 1 MB sau 10 triệu thao tác', () => {
    const gc = (globalThis as { gc?: () => void }).gc;
    // Chạy với NODE_OPTIONS=--expose-gc (xem script "test" ở package.json gốc).
    expect(gc).toBeDefined();
    const { tags } = goldenDb();
    const h = 3 as TagHandle;
    for (let i = 0; i < 100_000; i++) {
      tags.set(h, i % 1000);
      tags.get(h);
    }
    gc?.();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 10_000_000; i++) {
      tags.set(h, i % 1000);
      tags.get(h);
    }
    gc?.();
    const after = process.memoryUsage().heapUsed;
    expect(after - before).toBeLessThan(1024 * 1024);
  }, 60_000);
});

describe('TagDB — property (fast-check, seed cố định)', () => {
  const opArb = fc.record({
    h: fc.integer({ min: 0, max: 3 }),
    vBool: fc.boolean(),
    vInt: fc.integer({ min: -5, max: 5 }),
  });
  const periodsArb = fc.array(fc.array(opArb, { maxLength: 10 }), { maxLength: 4 });

  it('chuỗi ghi/flush ngẫu nhiên khớp mô hình tham chiếu đơn giản', () => {
    fc.assert(
      fc.property(periodsArb, (periods) => {
        const { tags } = goldenDb();
        const seen: TagChange[] = [];
        tags.subscribe('*', (batch) => seen.push(...batch));
        // Mô hình tham chiếu: values, lastFlushed, writes.
        const values: TagValue[] = [false, false, false, 0];
        const lastFlushed: TagValue[] = [false, false, false, 0];
        const writes = [0, 0, 0, 0];
        let seenCount = 0;
        for (const period of periods) {
          for (const op of period) {
            const v: TagValue = op.h === 3 ? op.vInt : op.vBool;
            tags.set(op.h as TagHandle, v, 'system');
            values[op.h] = v;
            writes[op.h] = (writes[op.h] ?? 0) + 1;
          }
          const expected: Array<Partial<TagChange>> = [];
          for (let h = 0; h < 4; h++) {
            const cur = values[h];
            const prev = lastFlushed[h];
            if (cur !== undefined && prev !== undefined && cur !== prev) {
              expected.push({
                handle: h as TagHandle,
                oldValue: prev,
                newValue: cur,
                writes: writes[h] ?? 0,
              });
              lastFlushed[h] = cur;
            }
            writes[h] = 0;
          }
          tags.flush();
          const got = seen.slice(seenCount);
          seenCount = seen.length;
          expect(
            got.map((c) => ({
              handle: c.handle,
              oldValue: c.oldValue,
              newValue: c.newValue,
              writes: c.writes,
            })),
          ).toEqual(
            expected.map((e) => ({
              handle: e.handle,
              oldValue: e.oldValue,
              newValue: e.newValue,
              writes: e.writes,
            })),
          );
        }
      }),
      { seed: 20261124, numRuns: 200 },
    );
  });

  it('restore(snapshot()) là phép đồng nhất với chuỗi ghi ngẫu nhiên', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 20 }), (ops) => {
        const { tags } = goldenDb();
        for (const op of ops) {
          const v: TagValue = op.h === 3 ? op.vInt : op.vBool;
          tags.set(op.h as TagHandle, v, 'system');
        }
        tags.flush();
        const snap = tags.snapshot();
        const parsed = JSON.parse(JSON.stringify(snap)) as TagDBSnapshot;
        tags.restore(parsed);
        expect(tags.snapshot()).toEqual(snap);
        const seen: TagChange[] = [];
        tags.subscribe('*', (batch) => seen.push(...batch));
        tags.flush();
        expect(seen).toEqual([]);
      }),
      { seed: 20261124, numRuns: 100 },
    );
  });
});
