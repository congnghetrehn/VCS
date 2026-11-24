// Test config server — @vcs/server (M0 §8.2; OQ-036, OQ-051).
// resolveServerConfig: mặc định / env / cờ CLI (CLI thắng env).

import { describe, expect, it } from 'vitest';
import { isOriginAllowed, resolveServerConfig } from './config.js';

describe('resolveServerConfig', () => {
  it('mặc định theo §8.2', () => {
    const c = resolveServerConfig(undefined, {});
    expect(c).toEqual({
      port: 4170,
      host: '127.0.0.1',
      logLevel: 'info',
      uiRateHz: 10,
      maxConnections: 8,
      maxPayloadBytes: 64 * 1024,
      allowedOrigins: [],
    });
  });

  it('env VCS_PORT/VCS_HOST/VCS_LOG_LEVEL/VCS_UI_RATE_HZ/VCS_ALLOWED_ORIGINS', () => {
    const c = resolveServerConfig(undefined, {
      VCS_PORT: '8080',
      VCS_HOST: '0.0.0.0',
      VCS_LOG_LEVEL: 'debug',
      VCS_UI_RATE_HZ: '5',
      VCS_ALLOWED_ORIGINS: 'http://a.example, http://b.example',
    });
    expect(c.port).toBe(8080);
    expect(c.host).toBe('0.0.0.0');
    expect(c.logLevel).toBe('debug');
    expect(c.uiRateHz).toBe(5);
    expect(c.allowedOrigins).toEqual(['http://a.example', 'http://b.example']);
  });

  it('cờ CLI thắng env', () => {
    const c = resolveServerConfig(
      { port: 9000, host: '127.0.0.1' },
      { VCS_PORT: '8080', VCS_HOST: '0.0.0.0' },
    );
    expect(c.port).toBe(9000);
    expect(c.host).toBe('127.0.0.1');
  });

  it('port 0 được phép (cổng do OS cấp, test dùng port: 0)', () => {
    expect(resolveServerConfig({ port: 0 }, {}).port).toBe(0);
    expect(resolveServerConfig(undefined, { VCS_PORT: '0' }).port).toBe(0);
  });

  it('port sai → ném nêu tên nguồn', () => {
    expect(() => resolveServerConfig({ port: 70000 }, {})).toThrow('--port');
    expect(() => resolveServerConfig({ port: -1 }, {})).toThrow('--port');
    expect(() => resolveServerConfig(undefined, { VCS_PORT: 'abc' })).toThrow('VCS_PORT');
    expect(() => resolveServerConfig(undefined, { VCS_PORT: '70000' })).toThrow('VCS_PORT');
  });

  it('uiRateHz sai → ném', () => {
    expect(() => resolveServerConfig({ uiRateHz: 0 }, {})).toThrow('uiRateHz');
    expect(() => resolveServerConfig(undefined, { VCS_UI_RATE_HZ: '-2' })).toThrow(
      'VCS_UI_RATE_HZ',
    );
  });

  it('maxConnections/maxPayloadBytes sai → ném', () => {
    expect(() => resolveServerConfig({ maxConnections: 0 }, {})).toThrow('maxConnections');
    expect(() => resolveServerConfig({ maxPayloadBytes: 100 }, {})).toThrow('maxPayloadBytes');
  });

  it('env rỗng được bỏ qua (dùng mặc định)', () => {
    const c = resolveServerConfig(undefined, { VCS_PORT: '', VCS_HOST: '' });
    expect(c.port).toBe(4170);
    expect(c.host).toBe('127.0.0.1');
  });
});

describe('isOriginAllowed (OQ-036)', () => {
  it('Origin rỗng (client không trình duyệt) → cho phép', () => {
    expect(isOriginAllowed(undefined, [])).toBe(true);
    expect(isOriginAllowed('', [])).toBe(true);
  });

  it('localhost/127.0.0.1 mọi cổng → cho phép', () => {
    expect(isOriginAllowed('http://localhost:4170', [])).toBe(true);
    expect(isOriginAllowed('http://localhost', [])).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:3000', [])).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1', [])).toBe(true);
  });

  it('origin trong danh sách cho phép → cho phép, còn lại → từ chối', () => {
    expect(isOriginAllowed('http://dev.example', ['http://dev.example'])).toBe(true);
    expect(isOriginAllowed('http://evil.example', ['http://dev.example'])).toBe(false);
    expect(isOriginAllowed('http://evil.example', [])).toBe(false);
  });

  it('localhost giả mạo (hậu tố khác) → từ chối', () => {
    expect(isOriginAllowed('http://localhost.evil.example', [])).toBe(false);
    expect(isOriginAllowed('http://notlocalhost:4170', [])).toBe(false);
  });
});
