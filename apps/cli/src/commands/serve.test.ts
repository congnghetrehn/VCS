// Test lệnh `vcs serve` — apps/cli (M0 §8.2; OQ-043/045).
// serveCommand: mã thoát 3 (thiếu thư mục/tham số sai), 2 (lỗi project).
// startServe: chạy thật trên port 0, kiểm tra /api/health rồi dừng.

import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { serveCommand, startServe, type ServeHandle } from './serve.js';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const HELLO_TAGS = join(ROOT, 'examples', 'hello-tags');

const handles: ServeHandle[] = [];

afterEach(async () => {
  for (const h of handles.splice(0)) await h.stop();
});

describe('serveCommand — mã thoát', () => {
  it('thiếu thư mục → 3', async () => {
    expect(await serveCommand(undefined, {})).toBe(3);
  });

  it('thư mục không tồn tại → 3', async () => {
    expect(await serveCommand(join(tmpdir(), 'vcs-khong-ton-tai'), {})).toBe(3);
  });

  it('tham số sai (port chữ, host rỗng) → 3', async () => {
    expect(await serveCommand(HELLO_TAGS, { port: 'abc' })).toBe(3);
    expect(await serveCommand(HELLO_TAGS, { host: '' })).toBe(3);
  });

  it('project lỗi (thiếu vcs.project.yaml) → 2', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-p05-'));
    expect(await serveCommand(dir, {})).toBe(2);
  });

  it('project có lỗi validate (tags.yaml sai) → 2', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-p05-'));
    await cp(HELLO_TAGS, dir, { recursive: true });
    await writeFile(
      join(dir, 'tags', 'tags.yaml'),
      'version: 1\ntags:\n  - name: X\n    type: WrongType\n',
    );
    expect(await serveCommand(dir, {})).toBe(2);
  });
});

describe('startServe — chạy thật', () => {
  it('khởi động trên port 0, /api/health ok, dừng sạch', async () => {
    const handle = await startServe(HELLO_TAGS, { port: '0', silent: true });
    handles.push(handle);
    expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const res = await fetch(`${handle.url}api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: '0.1.0' });
    await handle.stop();
    handles.splice(handles.indexOf(handle), 1);
    await expect(fetch(`${handle.url}api/health`)).rejects.toThrow();
  });
});
