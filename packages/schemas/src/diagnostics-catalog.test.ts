// Test DiagnosticCatalog (M0 §4.1).
import { describe, expect, it } from 'vitest';
import { IO_CATALOG, PL_CATALOG, PRJ_CATALOG, SCL_CATALOG, defineDiagnostics } from './diagnostics-catalog.js';

describe('PRJ_CATALOG', () => {
  it('chứa đủ mã M0 §4.5', () => {
    for (const code of [
      'PRJ-E001',
      'PRJ-E002',
      'PRJ-E003',
      'PRJ-E004',
      'PRJ-E005',
      'PRJ-E006',
      'PRJ-E007',
      'PRJ-E010',
      'PRJ-E011',
      'PRJ-E012',
      'PRJ-E013',
      'PRJ-E014',
      'PRJ-W001',
      'PRJ-W002',
      'SIM-W001',
      'SIM-E001',
      'SIM-E002',
      'SIM-E003',
      'TAG-E001',
      'TAG-E002',
      'TAG-E003',
      'WS-E001',
      'WS-E002',
    ]) {
      expect(PRJ_CATALOG.has(code), code).toBe(true);
    }
  });

  it('mỗi mã có severity + title', () => {
    for (const [code, info] of PRJ_CATALOG.entries()) {
      expect(['error', 'warning', 'info']).toContain(info.severity);
      expect(info.title.length, code).toBeGreaterThan(0);
    }
  });

  it('PRJ-E003 là error, PRJ-W001 là warning', () => {
    expect(PRJ_CATALOG.get('PRJ-E003')?.severity).toBe('error');
    expect(PRJ_CATALOG.get('PRJ-W001')?.severity).toBe('warning');
  });

  it('mã chưa đăng ký → undefined', () => {
    expect(PRJ_CATALOG.get('PRJ-E999')).toBeUndefined();
  });
});

describe('SCL_CATALOG (P1.2, M1 §4.4)', () => {
  it('chứa đủ 5 mã SCL (P1.2) + 13 mã P1.3 (codes() sort theo bảng chữ cái)', () => {
    expect(SCL_CATALOG.codes()).toEqual([
      'SCL-L001',
      'SCL-P001',
      'SCL-P002',
      'SCL-P003',
      'SCL-S020',
      'SCL-T001',
      'SCL-T002',
      'SCL-T003',
      'SCL-T004',
      'SCL-T005',
      'SCL-T006',
      'SCL-T007',
      'SCL-T008',
      'SCL-T009',
      'SCL-T010',
      'SCL-T011',
      'SCL-U001',
      'SCL-W001',
    ]);
  });

  it('mỗi mã có severity + title', () => {
    for (const [code, info] of SCL_CATALOG.entries()) {
      expect(['error', 'warning', 'info']).toContain(info.severity);
      expect(info.title.length, code).toBeGreaterThan(0);
    }
  });

  it('SCL-L001/P001/P002/P003/U001/T001–T011/S020 đều là error, W001 là warning', () => {
    for (const code of [
      'SCL-L001',
      'SCL-P001',
      'SCL-P002',
      'SCL-P003',
      'SCL-U001',
      'SCL-T001',
      'SCL-T002',
      'SCL-T003',
      'SCL-T004',
      'SCL-T005',
      'SCL-T006',
      'SCL-T007',
      'SCL-T008',
      'SCL-T009',
      'SCL-T010',
      'SCL-T011',
      'SCL-S020',
    ]) {
      expect(SCL_CATALOG.get(code)?.severity, code).toBe('error');
    }
    expect(SCL_CATALOG.get('SCL-W001')?.severity).toBe('warning');
  });

  it('mã chưa đăng ký → undefined', () => {
    expect(SCL_CATALOG.get('SCL-X001')).toBeUndefined();
  });
});

describe('defineDiagnostics', () => {
  it('đăng ký thêm mã cho milestone sau', () => {
    const cat = defineDiagnostics({
      'IO-E001': { severity: 'error', title: 'Lỗi IO mẫu' },
    });
    expect(cat.has('IO-E001')).toBe(true);
    expect(cat.codes()).toEqual(['IO-E001']);
  });
});

describe('IO_CATALOG (M2 §8.7, P2.6)', () => {
  it('chứa đủ 15 mã IO-*', () => {
    expect(IO_CATALOG.codes()).toEqual([
      'IO-E001',
      'IO-E002',
      'IO-E003',
      'IO-E010',
      'IO-E011',
      'IO-E012',
      'IO-E013',
      'IO-I001',
      'IO-W001',
      'IO-W002',
      'IO-W003',
      'IO-W010',
      'IO-W020',
      'IO-W030',
      'IO-W040',
    ]);
  });

  it('mức độ theo spec §8.7: E* error, W* warning, I001 info', () => {
    for (const code of ['IO-E001', 'IO-E002', 'IO-E003', 'IO-E010', 'IO-E011', 'IO-E012', 'IO-E013']) {
      expect(IO_CATALOG.get(code)?.severity, code).toBe('error');
    }
    for (const code of ['IO-W001', 'IO-W002', 'IO-W003', 'IO-W010', 'IO-W020', 'IO-W030', 'IO-W040']) {
      expect(IO_CATALOG.get(code)?.severity, code).toBe('warning');
    }
    expect(IO_CATALOG.get('IO-I001')?.severity).toBe('info');
  });

  it('mỗi mã có severity + title + hint', () => {
    for (const [code, info] of IO_CATALOG.entries()) {
      expect(info.title.length, code).toBeGreaterThan(0);
      expect(info.hint?.length, code).toBeGreaterThan(0);
    }
  });
});

describe('PL-W010 (M2 §9.4, P2.6, OQ-359)', () => {
  it('PL_CATALOG có PL-W010 warning (spec đã định nghĩa, P2.6 đăng ký)', () => {
    expect(PL_CATALOG.get('PL-W010')?.severity).toBe('warning');
    expect(PL_CATALOG.get('PL-W010')?.title).toContain('re-import');
  });
});
