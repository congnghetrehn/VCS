// Test sniff.ts — encoding + delimiter (M2 §8.2, P2.5 commit 2).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeText, sniffDelimiter, sniffEncoding } from './sniff.js';

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe('sniffEncoding', () => {
  it('BOM UTF-8 → utf-8, bỏ 3 byte', () => {
    expect(sniffEncoding(bytes(0xef, 0xbb, 0xbf, 0x61))).toEqual({ encoding: 'utf-8', bomLength: 3 });
  });

  it('BOM UTF-16 LE/BE → utf-16le/utf-16be, bỏ 2 byte', () => {
    expect(sniffEncoding(bytes(0xff, 0xfe, 0x61, 0x00))).toEqual({ encoding: 'utf-16le', bomLength: 2 });
    expect(sniffEncoding(bytes(0xfe, 0xff, 0x00, 0x61))).toEqual({ encoding: 'utf-16be', bomLength: 2 });
  });

  it('UTF-8 không BOM (kèm ký tự có dấu) → utf-8', () => {
    const text = new TextEncoder().encode('Phản hồi chạy;Dừng khẩn cấp');
    expect(sniffEncoding(text)).toEqual({ encoding: 'utf-8', bomLength: 0 });
  });

  it('byte không phải UTF-8 hợp lệ → windows-1252', () => {
    // 0xE9 đơn độc không phải UTF-8 hợp lệ (é trong windows-1252).
    expect(sniffEncoding(bytes(0x61, 0xe9, 0x62))).toEqual({ encoding: 'windows-1252', bomLength: 0 });
  });

  it('decodeText bỏ BOM và giải mã windows-1252', () => {
    expect(decodeText(bytes(0xef, 0xbb, 0xbf, 0x61, 0x62)).text).toBe('ab');
    expect(decodeText(bytes(0x63, 0xe9)).text).toBe('cé');
    expect(decodeText(bytes(0xff, 0xfe, 0x61, 0x00, 0x62, 0x00)).text).toBe('ab');
  });
});

describe('sniffDelimiter', () => {
  it.each([
    ['dấu phẩy', 'a,b,c\n1,2,3\n4,5,6', ','],
    ['dấu chấm phẩy', 'a;b;c\n1;2;3\n4;5;6', ';'],
    ['tab', 'a\tb\tc\n1\t2\t3\n4\t5\t6', '\t'],
    ['gạch đứng', 'a|b|c\n1|2|3\n4|5|6', '|'],
  ])('nhận ra %s', (_label, text, expected) => {
    const r = sniffDelimiter(text);
    expect(r.delimiter).toBe(expected);
    expect(r.confidence).toBe('high');
  });

  it('dấu phân cách trong dấu nháy kép không làm lệch đếm cột', () => {
    const r = sniffDelimiter('"a;b";c;d\n"1;2";3;4\n"x;y";5;6');
    expect(r.delimiter).toBe(';');
    expect(r.confidence).toBe('high');
  });

  it('file 1 cột → null + low + lý do', () => {
    const r = sniffDelimiter('Tag\nM01_RUN\nM01_STOP');
    expect(r.delimiter).toBeNull();
    expect(r.confidence).toBe('low');
    expect(r.reason).toContain('1 cột');
  });

  it('ít hơn 2 dòng không trống → null', () => {
    expect(sniffDelimiter('a;b;c').delimiter).toBeNull();
    expect(sniffDelimiter('').delimiter).toBeNull();
  });

  it('phương sai nhỏ nhất thắng (dòng bẩn làm lệch một ứng viên)', () => {
    // ';' ổn định 3 cột; ',' lúc 1 lúc 2 cột do số thập phân "1,5" trong ô.
    const text = 'a;b;c\n1;2;3\n4;1,5;6\n7;8;9';
    expect(sniffDelimiter(text).delimiter).toBe(';');
  });

  it('property: xáo trộn thứ tự 20 dòng đầu không đổi delimiter đã sniff', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.stringMatching(/^[A-Z0-9_]+$/), fc.stringMatching(/^[A-Z]+$/), fc.integer({ min: 0, max: 99 })), {
          minLength: 2,
          maxLength: 20,
        }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (rows, seed) => {
          const lines = rows.map(([a, b, c]) => `${a};${b};${String(c)}`);
          // Fisher-Yates với LCG có seed từ property (tất định khi replay).
          let s = seed;
          const next = (): number => {
            s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
          };
          const shuffled = [...lines];
          for (let i = shuffled.length - 1; i > 0; i -= 1) {
            const j = Math.floor(next() * (i + 1));
            const tmp = shuffled[i] as string;
            shuffled[i] = shuffled[j] as string;
            shuffled[j] = tmp;
          }
          expect(sniffDelimiter(lines.join('\n')).delimiter).toBe(';');
          expect(sniffDelimiter(shuffled.join('\n')).delimiter).toBe(';');
        },
      ),
      { numRuns: 50 },
    );
  });
});
