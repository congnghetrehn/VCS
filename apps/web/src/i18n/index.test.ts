// Test i18n t() — vi/en + khóa thiếu trả key (OQ-063).
import { describe, expect, it } from 'vitest';
import { t } from './index.js';

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
});
