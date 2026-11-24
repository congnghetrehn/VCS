// Test memory — @vcs/runtime-iec (M1 §3.2; bảng tính tay A trong STATE §16).
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { TagError } from '@vcs/kernel';
import { DbStore, MemoryArea } from './memory.js';

const bytesOf = (m: MemoryArea): number[] => [...m.snapshot()];

describe('memory — bảng tính tay A: chồng lấn %MW/%MB/bit/Real (M1 §3.2)', () => {
  it('ghi %MW0 := 0x1234 → %MB0=0x12, %MB1=0x34, %MD0=0x12340000', () => {
    const m = new MemoryArea(4);
    m.write('Word', 0, 0x1234);
    expect(bytesOf(m)).toEqual([0x12, 0x34, 0x00, 0x00]);
    expect(m.read('Word', 0)).toBe(0x1234);
    expect(m.read('Word', 2)).toBe(0x0000);
    expect(m.read('DWord', 0)).toBe(0x12340000);
    // 0x12 = 0001 0010 → bit 1, 4; 0x34 = 0011 0100 → bit 2, 4, 5.
    expect(m.getBit(0, 1)).toBe(true);
    expect(m.getBit(0, 4)).toBe(true);
    expect(m.getBit(1, 2)).toBe(true);
    expect(m.getBit(1, 4)).toBe(true);
    expect(m.getBit(1, 5)).toBe(true);
    expect(m.getBit(0, 0)).toBe(false);
    expect(m.getBit(1, 0)).toBe(false);
  });

  it('trên nền trên, ghi %MB1 := 0xFF → %MW0=0x12FF, %MD0=0x12FF0000, byte 1 toàn 1', () => {
    const m = new MemoryArea(4);
    m.write('Word', 0, 0x1234);
    m.write('Byte', 1, 0xff);
    expect(bytesOf(m)).toEqual([0x12, 0xff, 0x00, 0x00]);
    expect(m.read('Word', 0)).toBe(0x12ff);
    expect(m.read('DWord', 0)).toBe(0x12ff0000);
    for (let bit = 0; bit < 8; bit++) expect(m.getBit(1, bit)).toBe(true);
  });

  it('ghi %MD0 := 0x12345678 → byte 0x12/0x34/0x56/0x78, %MW0=0x1234, %MW2=0x5678', () => {
    const m = new MemoryArea(4);
    m.write('DWord', 0, 0x12345678);
    expect(bytesOf(m)).toEqual([0x12, 0x34, 0x56, 0x78]);
    expect(m.read('Word', 0)).toBe(0x1234);
    expect(m.read('Word', 2)).toBe(0x5678);
    expect(m.read('DWord', 0)).toBe(0x12345678);
    // 0x56 = 0101 0110 → bit 1, 2, 4, 6; 0x78 = 0111 1000 → bit 3, 4, 5, 6.
    expect(m.getBit(2, 1)).toBe(true);
    expect(m.getBit(2, 6)).toBe(true);
    expect(m.getBit(3, 3)).toBe(true);
    expect(m.getBit(3, 4)).toBe(true);
    expect(m.getBit(3, 5)).toBe(true);
    expect(m.getBit(3, 6)).toBe(true);
    expect(m.getBit(3, 7)).toBe(false);
  });

  it('set %M0.3 := true → byte 0 = 0x08, %MW0=0x0800, %MD0=0x08000000', () => {
    const m = new MemoryArea(4);
    m.setBit(0, 3, true);
    expect(bytesOf(m)).toEqual([0x08, 0x00, 0x00, 0x00]);
    expect(m.read('Word', 0)).toBe(0x0800);
    expect(m.read('DWord', 0)).toBe(0x08000000);
    expect(m.getBit(0, 3)).toBe(true);
    for (const bit of [0, 1, 2, 4, 5, 6, 7]) expect(m.getBit(0, bit)).toBe(false);
  });

  it('ghi Int -1 tại %MW0 → 0xFFFF, đọc Word = 65535, Int = -1', () => {
    const m = new MemoryArea(4);
    m.write('Int', 0, -1);
    expect(bytesOf(m)).toEqual([0xff, 0xff, 0x00, 0x00]);
    expect(m.read('Word', 0)).toBe(65535);
    expect(m.read('Int', 0)).toBe(-1);
    expect(m.read('DWord', 0)).toBe(0xffff0000);
  });

  it('ghi DInt -1 tại %MD0 → toàn 0xFF, DWord = 4294967295, Real = NaN', () => {
    const m = new MemoryArea(4);
    m.write('DInt', 0, -1);
    expect(bytesOf(m)).toEqual([0xff, 0xff, 0xff, 0xff]);
    expect(m.read('DWord', 0)).toBe(4294967295);
    expect(Number.isNaN(m.read('Real', 0))).toBe(true);
  });

  it('ghi Real 1.5 tại %MD0 → 0x3FC00000, DWord = 1069547520', () => {
    const m = new MemoryArea(4);
    m.write('Real', 0, 1.5);
    expect(bytesOf(m)).toEqual([0x3f, 0xc0, 0x00, 0x00]);
    expect(m.read('DWord', 0)).toBe(1069547520);
    expect(m.read('Real', 0)).toBe(1.5);
  });

  it('ghi Real 0.1 tại %MD0 → 0x3DCCCCCD, đọc lại = fround(0.1)', () => {
    const m = new MemoryArea(4);
    m.write('Real', 0, 0.1);
    expect(bytesOf(m)).toEqual([0x3d, 0xcc, 0xcc, 0xcd]);
    expect(m.read('DWord', 0)).toBe(0x3dcccccd);
    expect(m.read('Real', 0)).toBe(Math.fround(0.1));
    expect(m.read('Real', 0)).toBe(0.10000000149011612);
  });

  it('ghi Time 1500 tại %MD0 → 0x000005DC, đọc DInt = 1500', () => {
    const m = new MemoryArea(4);
    m.write('Time', 0, 1500);
    expect(bytesOf(m)).toEqual([0x00, 0x00, 0x05, 0xdc]);
    expect(m.read('DWord', 0)).toBe(0x000005dc);
    expect(m.read('DInt', 0)).toBe(1500);
  });
});

describe('memory — getBit/setBit ranh giới', () => {
  it('byte 0 bit 0/7 và byte cuối', () => {
    const m = new MemoryArea(4);
    m.setBit(0, 0, true);
    m.setBit(0, 7, true);
    m.setBit(3, 7, true);
    expect(bytesOf(m)).toEqual([0x81, 0x00, 0x00, 0x80]);
    expect(m.getBit(0, 0)).toBe(true);
    expect(m.getBit(0, 7)).toBe(true);
    expect(m.getBit(3, 7)).toBe(true);
    expect(m.getBit(3, 0)).toBe(false);
  });

  it('setBit(false) xóa đúng bit, không chạm bit khác', () => {
    const m = new MemoryArea(2);
    m.write('Byte', 0, 0xff);
    m.setBit(0, 3, false);
    expect(m.read('Byte', 0)).toBe(0xf7);
    m.setBit(0, 3, true);
    expect(m.read('Byte', 0)).toBe(0xff);
  });
});

describe('memory — LReal 64-bit + snapshot/restore', () => {
  it('ghi-đọc LReal 1.5 → byte big-endian 0x3FF8000000000000', () => {
    const m = new MemoryArea(8);
    m.write('LReal', 0, 1.5);
    expect(bytesOf(m)).toEqual([0x3f, 0xf8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(m.read('LReal', 0)).toBe(1.5);
  });

  it('ghi-đọc LReal -0.1 giữ nguyên (không fround)', () => {
    const m = new MemoryArea(8);
    m.write('LReal', 0, -0.1);
    expect(m.read('LReal', 0)).toBe(-0.1);
  });

  it('snapshot trả bản sao — sửa bản sao không đổi vùng nhớ', () => {
    const m = new MemoryArea(4);
    m.write('DWord', 0, 0x12345678);
    const snap = m.snapshot();
    snap[0] = 0x00;
    expect(bytesOf(m)).toEqual([0x12, 0x34, 0x56, 0x78]);
  });

  it('restore khôi phục đúng byte cũ', () => {
    const m = new MemoryArea(4);
    m.write('DWord', 0, 0x12345678);
    const snap = m.snapshot();
    m.write('DWord', 0, 0);
    expect(m.read('DWord', 0)).toBe(0);
    m.restore(snap);
    expect(bytesOf(m)).toEqual([0x12, 0x34, 0x56, 0x78]);
  });

  it('restore sai độ dài → RangeError', () => {
    const m = new MemoryArea(4);
    expect(() => {
      m.restore(new Uint8Array(3));
    }).toThrow(RangeError);
    expect(() => {
      m.restore(new Uint8Array(5));
    }).toThrow(RangeError);
  });
});

describe('memory — lỗi ngoài vùng + validate (OQ-086, OQ-091)', () => {
  it('read/write ngoài vùng → RangeError', () => {
    const m = new MemoryArea(4);
    expect(() => m.read('Word', 3)).toThrow(RangeError); // 3 + 2 > 4
    expect(() => m.read('DWord', 1)).toThrow(RangeError);
    expect(() => m.read('Byte', 4)).toThrow(RangeError);
    expect(() => m.read('Byte', -1)).toThrow(RangeError);
    expect(() => {
      m.write('Word', 3, 1);
    }).toThrow(RangeError);
    expect(() => {
      m.write('Byte', 4, 1);
    }).toThrow(RangeError);
  });

  it('getBit/setBit ngoài vùng hoặc bit ngoài 0..7 → RangeError', () => {
    const m = new MemoryArea(4);
    expect(() => m.getBit(4, 0)).toThrow(RangeError);
    expect(() => m.getBit(-1, 0)).toThrow(RangeError);
    expect(() => m.getBit(0, 8)).toThrow(RangeError);
    expect(() => m.getBit(0, -1)).toThrow(RangeError);
    expect(() => {
      m.setBit(4, 0, true);
    }).toThrow(RangeError);
    expect(() => {
      m.setBit(0, 8, true);
    }).toThrow(RangeError);
  });

  it("write sai khoảng → TagError('TAG-E001')", () => {
    const m = new MemoryArea(4);
    expect(() => {
      m.write('Int', 0, 40000);
    }).toThrow(TagError);
    try {
      m.write('Int', 0, 40000);
      expect.unreachable();
    } catch (e) {
      expect((e as TagError).code).toBe('TAG-E001');
    }
    expect(() => {
      m.write('Byte', 0, -1);
    }).toThrow(TagError);
    expect(() => {
      m.write('Int', 0, 1.5);
    }).toThrow(TagError);
    expect(() => {
      m.write('Time', 0, -1);
    }).toThrow(TagError);
  });

  it("read/write 'Bool' → throw (dùng getBit/setBit)", () => {
    const m = new MemoryArea(4);
    expect(() => m.read('Bool' as 'Byte', 0)).toThrow(Error);
    expect(() => {
      m.write('Bool' as 'Byte', 0, true);
    }).toThrow(Error);
  });

  it('constructor kích thước không hợp lệ → RangeError', () => {
    expect(() => new MemoryArea(-1)).toThrow(RangeError);
    expect(() => new MemoryArea(1.5)).toThrow(RangeError);
  });
});

describe('memory — DbStore', () => {
  it('DbStore là MemoryArea + số DB', () => {
    const db = new DbStore(1, 4);
    expect(db).toBeInstanceOf(MemoryArea);
    expect(db.dbNumber).toBe(1);
    expect(db.sizeBytes).toBe(4);
    db.write('Word', 0, 0x1234);
    expect(db.read('Word', 0)).toBe(0x1234);
  });
});

describe('memory — property (fast-check, seed cố định)', () => {
  // Mô hình tham chiếu: mảng byte thường + phép toán big-endian viết tay,
  // KHÔNG dùng DataView — độc lập với implementation.
  const refWriteU8 = (ref: number[], off: number, v: number): void => {
    ref[off] = v & 0xff;
  };
  const refWriteU16 = (ref: number[], off: number, v: number): void => {
    ref[off] = (v >>> 8) & 0xff;
    ref[off + 1] = v & 0xff;
  };
  const refWriteU32 = (ref: number[], off: number, v: number): void => {
    ref[off] = (v >>> 24) & 0xff;
    ref[off + 1] = (v >>> 16) & 0xff;
    ref[off + 2] = (v >>> 8) & 0xff;
    ref[off + 3] = v & 0xff;
  };
  const refReadU16 = (ref: number[], off: number): number =>
    ((ref[off] as number) * 256 + (ref[off + 1] as number)) >>> 0;
  const refReadU32 = (ref: number[], off: number): number => {
    const b0 = ref[off] as number;
    const b1 = ref[off + 1] as number;
    const b2 = ref[off + 2] as number;
    const b3 = ref[off + 3] as number;
    return (((b0 * 256 + b1) * 256 + b2) * 256 + b3) >>> 0;
  };

  const opArb = fc.oneof(
    fc.record({
      kind: fc.constant('byte' as const),
      off: fc.integer({ min: 0, max: 15 }),
      v: fc.integer({ min: 0, max: 255 }),
    }),
    fc.record({
      kind: fc.constant('word' as const),
      off: fc.integer({ min: 0, max: 14 }),
      v: fc.integer({ min: 0, max: 65535 }),
    }),
    fc.record({
      kind: fc.constant('dword' as const),
      off: fc.integer({ min: 0, max: 12 }),
      v: fc.integer({ min: 0, max: 4294967295 }),
    }),
    fc.record({
      kind: fc.constant('bit' as const),
      off: fc.integer({ min: 0, max: 15 }),
      bit: fc.integer({ min: 0, max: 7 }),
      v: fc.boolean(),
    }),
  );

  it('dãy ghi ngẫu nhiên nhiều độ rộng khớp mô hình tham chiếu byte-array', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 40 }), (ops) => {
        const m = new MemoryArea(16);
        const ref: number[] = new Array<number>(16).fill(0);
        for (const op of ops) {
          if (op.kind === 'byte') {
            m.write('Byte', op.off, op.v);
            refWriteU8(ref, op.off, op.v);
          } else if (op.kind === 'word') {
            m.write('Word', op.off, op.v);
            refWriteU16(ref, op.off, op.v);
          } else if (op.kind === 'dword') {
            m.write('DWord', op.off, op.v);
            refWriteU32(ref, op.off, op.v);
          } else {
            m.setBit(op.off, op.bit, op.v);
            const cur = ref[op.off] as number;
            ref[op.off] = op.v ? cur | (1 << op.bit) : cur & ~(1 << op.bit);
          }
        }
        expect(bytesOf(m)).toEqual(ref);
        // Đọc lại bằng độ rộng khác cũng khớp mô hình tham chiếu.
        expect(m.read('Word', 0)).toBe(refReadU16(ref, 0));
        expect(m.read('Word', 14)).toBe(refReadU16(ref, 14));
        expect(m.read('DWord', 0)).toBe(refReadU32(ref, 0));
        expect(m.read('DWord', 12)).toBe(refReadU32(ref, 12));
      }),
      { seed: 20261124, numRuns: 100 },
    );
  });
});
