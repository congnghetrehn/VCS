// Test i18n t() — vi/en + khóa thiếu trả key (OQ-063).
import { describe, expect, it } from 'vitest';
import { I18N_KEYS, t } from './index.js';
import { en } from './en.js';
import { vi } from './vi.js';

describe('i18n t()', () => {
  it('dịch vi/en', () => {
    expect(t('vi', 'sim.run')).toBe('Chạy');
    expect(t('en', 'sim.run')).toBe('Run');
    expect(t('vi', 'tags.col.name')).toBe('Tên');
    expect(t('en', 'tags.col.name')).toBe('Name');
  });

  it('khóa thiếu → trả chính key', () => {
    expect(t('vi', 'khong.co.key')).toBe('khong.co.key');
    expect(t('en', 'khong.co.key')).toBe('khong.co.key');
  });

  it('mọi key trong I18N_KEYS đều có ở cả vi + en (không thiếu/không thừa)', () => {
    for (const key of I18N_KEYS) {
      expect(vi[key], `vi thiếu ${key}`).toBeTruthy();
      expect(en[key], `en thiếu ${key}`).toBeTruthy();
    }
    expect(Object.keys(vi)).toHaveLength(I18N_KEYS.length);
    expect(Object.keys(en)).toHaveLength(I18N_KEYS.length);
  });
});
