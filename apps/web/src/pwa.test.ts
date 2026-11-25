// Unit test helpers PWA thuần — @vcs/web (P0.9, STATE §23 test target).
// Chạy bằng node (vitest); file tĩnh manifest/offline đọc qua import.meta.url
// nên không phụ thuộc cwd.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyRequest,
  parseKioskParam,
  reloadNeedsConfirm,
  shouldShowUpdateBanner,
  wakeLockAvailable,
} from './pwa.js';

describe('parseKioskParam', () => {
  it('?kiosk=1 → true', () => {
    expect(parseKioskParam('?kiosk=1')).toBe(true);
  });
  it('?kiosk=0 → false', () => {
    expect(parseKioskParam('?kiosk=0')).toBe(false);
  });
  it('thiếu param → false', () => {
    expect(parseKioskParam('?foo=bar')).toBe(false);
  });
  it('giá trị sai (?kiosk=yes) → false', () => {
    expect(parseKioskParam('?kiosk=yes')).toBe(false);
  });
});

describe('classifyRequest (bảng B — STATE §23)', () => {
  it('/api/* GET → network-only (dữ liệu live, cache là sai)', () => {
    expect(classifyRequest('/api/health', 'GET')).toBe('network-only');
    expect(classifyRequest('http://127.0.0.1:4170/api/project', 'GET')).toBe('network-only');
  });
  it('/ws → network-only (WebSocket upgrade, SW không chạm)', () => {
    expect(classifyRequest('/ws', 'GET')).toBe('network-only');
  });
  it('POST bất kỳ → network-only (ghi không được cache)', () => {
    expect(classifyRequest('/api/plc/build', 'POST')).toBe('network-only');
  });
  it('/sw.js → network-only (không nằm trong precache)', () => {
    expect(classifyRequest('/sw.js', 'GET')).toBe('network-only');
  });
  it('/assets/* GET → precache (tài nguyên tĩnh có hash)', () => {
    expect(classifyRequest('/assets/index-abc123.js', 'GET')).toBe('precache');
    expect(classifyRequest('/manifest.webmanifest', 'GET')).toBe('precache');
  });
  it('/ GET → navigation (đi mạng trước, rớt về offline.html)', () => {
    expect(classifyRequest('/', 'GET')).toBe('navigation');
    expect(classifyRequest('/index.html', 'GET')).toBe('navigation');
  });
  it('URL không parse được → network-only (mặc định an toàn)', () => {
    // ':::' vẫn parse được (pathname '/:::') nên không dùng làm ví dụ lỗi;
    // URL tuyệt đối sai cú pháp (IPv6 thiếu ]) mới ném.
    expect(classifyRequest('http://[::1', 'GET')).toBe('network-only');
  });
});

describe('shouldShowUpdateBanner / reloadNeedsConfirm (OQ-222)', () => {
  it('SW đang chờ → banner hiện', () => {
    expect(shouldShowUpdateBanner(true)).toBe(true);
  });
  it('không có SW chờ → banner ẩn', () => {
    expect(shouldShowUpdateBanner(false)).toBe(false);
  });
  it('editor dirty → bấm "Tải lại" phải hỏi xác nhận', () => {
    expect(reloadNeedsConfirm(true)).toBe(true);
  });
  it('editor sạch → bấm "Tải lại" tải ngay', () => {
    expect(reloadNeedsConfirm(false)).toBe(false);
  });
});

describe('wakeLockAvailable (OQ-228)', () => {
  it('navigator có wakeLock.request → true', () => {
    expect(wakeLockAvailable({ wakeLock: { request: () => Promise.resolve(null) } })).toBe(true);
  });
  it('navigator không có wakeLock → false', () => {
    expect(wakeLockAvailable({})).toBe(false);
    expect(wakeLockAvailable({ wakeLock: null })).toBe(false);
    expect(wakeLockAvailable({ wakeLock: {} })).toBe(false);
  });
});

describe('offline.html tĩnh (OQ-232)', () => {
  it('có nội dung vi + en và nút Thử lại', () => {
    const html = readFileSync(
      fileURLToPath(new URL('../public/offline.html', import.meta.url)),
      'utf-8',
    );
    expect(html).toContain('Không kết nối được tới server');
    expect(html).toContain('Cannot reach the server');
    expect(html).toContain('Thử lại');
    expect(html).toContain('Retry');
    expect(html).toContain('location.reload()');
  });
});

describe('manifest.webmanifest (OQ-225)', () => {
  it('đủ field bắt buộc và icon 192/512/maskable', () => {
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../public/manifest.webmanifest', import.meta.url)), 'utf-8'),
    ) as {
      icons: Array<{ purpose?: string; sizes: string; src: string; type: string }>;
      name: string;
      short_name: string;
      start_url: string;
      display: string;
      lang: string;
      theme_color: string;
    };
    expect(manifest.name).toBe('Virtual Commissioning Studio');
    expect(manifest.short_name).toBe('VCS');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('vi');
    expect(manifest.theme_color).toBe('#111827');
    const sizes = manifest.icons.map((i) => `${i.sizes}${i.purpose === 'maskable' ? ':maskable' : ''}`);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(sizes).toContain('512x512:maskable');
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      expect(icon.src.startsWith('/icons/')).toBe(true);
    }
  });
});
