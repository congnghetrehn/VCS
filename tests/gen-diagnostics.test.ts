// Test scripts/gen-diagnostics.ts (M0 §4.1, §15 mục 9).
import { describe, expect, it } from 'vitest';
import {
  findUnregisteredCodes,
  generateDiagnosticsMarkdown,
  scanCodes,
} from '../scripts/gen-diagnostics.js';

describe('generateDiagnosticsMarkdown', () => {
  it('chứa đủ mã M0 và ghi rõ là file sinh tự động', () => {
    const md = generateDiagnosticsMarkdown();
    expect(md).toContain('sinh tự động');
    for (const code of ['PRJ-E001', 'PRJ-E003', 'PRJ-W001', 'SIM-E002', 'TAG-E003', 'WS-E001']) {
      expect(md).toContain(`\`${code}\``);
    }
  });

  it('chứa đủ 5 mã SCL (P1.2)', () => {
    const md = generateDiagnosticsMarkdown();
    for (const code of ['SCL-L001', 'SCL-P001', 'SCL-P002', 'SCL-P003', 'SCL-U001']) {
      expect(md).toContain(`\`${code}\``);
    }
  });
});

describe('scanCodes', () => {
  it('tìm mã trong văn bản, bỏ trùng', () => {
    expect(scanCodes('lỗi PRJ-E003 và PRJ-E003, cảnh báo PRJ-W001')).toEqual(
      new Set(['PRJ-E003', 'PRJ-W001']),
    );
    expect(scanCodes('không có mã nào')).toEqual(new Set());
  });

  it('tìm được mã SCL (regex bao L/P/U, không chỉ E/W)', () => {
    expect(scanCodes('lỗi SCL-P002 và SCL-L001')).toEqual(new Set(['SCL-P002', 'SCL-L001']));
  });
});

describe('findUnregisteredCodes', () => {
  it('source hiện tại không có mã chưa đăng ký', async () => {
    await expect(findUnregisteredCodes()).resolves.toEqual([]);
  });
});
