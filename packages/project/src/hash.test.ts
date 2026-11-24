// Test hashText (M0 §5, §12.1: nhóm loadProject/hashText ≥ 15 cùng fs/load).
import { describe, expect, it } from 'vitest';
import { hashText } from './hash.js';

describe('hashText', () => {
  it("sha256('a') đúng giá trị chuẩn", () => {
    expect(hashText('a')).toBe('ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb');
  });

  it('CRLF, CR và LF cho cùng hash (chuẩn hóa)', () => {
    expect(hashText('a\r\nb\r\n')).toBe(hashText('a\nb\n'));
    expect(hashText('a\rb\r')).toBe(hashText('a\nb\n'));
  });

  it('BOM đầu file không đổi hash', () => {
    expect(hashText('\uFEFFhello')).toBe(hashText('hello'));
  });

  it('tất định: cùng đầu vào → cùng hash; khác đầu vào → khác hash', () => {
    expect(hashText('x')).toBe(hashText('x'));
    expect(hashText('x')).not.toBe(hashText('y'));
  });
});
