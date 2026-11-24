// Test common.ts: diag/format/hasErrors/sortDiagnostics.
import { describe, expect, it } from 'vitest';
import { diag, formatDiagnostic, hasErrors, sortDiagnostics } from './common.js';

describe('diag / formatDiagnostic', () => {
  it("định dạng 'file:line:col error CODE: message' + hint", () => {
    const d = diag(
      'PRJ-E003',
      'error',
      'giá trị không hợp lệ',
      { file: 'a.yaml', line: 3, col: 5 },
      'Kiểm tra lại.',
    );
    expect(formatDiagnostic(d)).toBe(
      'a.yaml:3:5 error PRJ-E003: giá trị không hợp lệ\n  hint: Kiểm tra lại.',
    );
  });

  it('không có vị trí → dùng —', () => {
    expect(formatDiagnostic(diag('X-E001', 'warning', 'chú ý'))).toBe('— warning X-E001: chú ý');
  });
});

describe('hasErrors', () => {
  it('true khi có error, false khi chỉ warning/info', () => {
    expect(hasErrors([diag('A', 'warning', 'w')])).toBe(false);
    expect(hasErrors([diag('A', 'warning', 'w'), diag('B', 'error', 'e')])).toBe(true);
    expect(hasErrors([])).toBe(false);
  });
});

describe('sortDiagnostics', () => {
  it('sắp theo (file, line, col, code), ổn định', () => {
    const sorted = sortDiagnostics([
      diag('PRJ-E003', 'error', 'b', { file: 'b.yaml', line: 2, col: 1 }),
      diag('PRJ-E002', 'error', 'a', { file: 'a.yaml', line: 9, col: 1 }),
      diag('PRJ-E003', 'error', 'a2', { file: 'a.yaml', line: 2, col: 5 }),
      diag('PRJ-E003', 'error', 'a1', { file: 'a.yaml', line: 2, col: 1 }),
    ]);
    expect(sorted.map((d) => d.message)).toEqual(['a1', 'a2', 'a', 'b']);
  });
});
