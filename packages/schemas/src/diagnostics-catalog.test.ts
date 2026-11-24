// Test DiagnosticCatalog (M0 §4.1).
import { describe, expect, it } from 'vitest';
import { PRJ_CATALOG, SCL_CATALOG, defineDiagnostics } from './diagnostics-catalog.js';

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
  it('chứa đủ 5 mã SCL', () => {
    expect(SCL_CATALOG.codes()).toEqual([
      'SCL-L001',
      'SCL-P001',
      'SCL-P002',
      'SCL-P003',
      'SCL-U001',
    ]);
  });

  it('mỗi mã có severity + title', () => {
    for (const [code, info] of SCL_CATALOG.entries()) {
      expect(['error', 'warning', 'info']).toContain(info.severity);
      expect(info.title.length, code).toBeGreaterThan(0);
    }
  });

  it('SCL-L001/P001/P002/P003/U001 đều là error', () => {
    for (const code of ['SCL-L001', 'SCL-P001', 'SCL-P002', 'SCL-P003', 'SCL-U001']) {
      expect(SCL_CATALOG.get(code)?.severity, code).toBe('error');
    }
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
