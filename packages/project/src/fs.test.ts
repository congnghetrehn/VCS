// Test ProjectFS: memoryFS + nodeFS (M0 §5).
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globToRegExp, memoryFS, nodeFS } from './fs.js';

describe('globToRegExp', () => {
  it('khớp *, **, ?', () => {
    expect(globToRegExp('*.yaml').test('a.yaml')).toBe(true);
    expect(globToRegExp('*.yaml').test('sub/a.yaml')).toBe(false);
    expect(globToRegExp('**/*.yaml').test('sub/deep/a.yaml')).toBe(true);
    expect(globToRegExp('**/*.yaml').test('a.yaml')).toBe(true);
    expect(globToRegExp('tags/?.yaml').test('tags/a.yaml')).toBe(true);
    expect(globToRegExp('tags/?.yaml').test('tags/ab.yaml')).toBe(false);
  });
});

describe('memoryFS', () => {
  const fs = memoryFS({
    'vcs.project.yaml': 'name: X',
    'tags/tags.yaml': 'tags: []',
    'tags/other.txt': 'x',
  });

  it('readText/exists', async () => {
    await expect(fs.readText('vcs.project.yaml')).resolves.toBe('name: X');
    await expect(fs.exists('nope.yaml')).resolves.toBe(false);
    await expect(fs.readText('nope.yaml')).rejects.toThrow();
  });

  it('list theo thư mục + glob, đã sắp xếp', async () => {
    await expect(fs.list('tags')).resolves.toEqual(['tags/other.txt', 'tags/tags.yaml']);
    await expect(fs.list('tags', { glob: '**/*.yaml' })).resolves.toEqual(['tags/tags.yaml']);
    await expect(fs.list('')).resolves.toEqual([
      'tags/other.txt',
      'tags/tags.yaml',
      'vcs.project.yaml',
    ]);
  });

  it('root là chuỗi rỗng (bộ nhớ)', () => {
    expect(fs.root).toBe('');
  });
});

describe('nodeFS', () => {
  it('đọc/ghi/list trên đĩa thật (thư mục tạm, dọn sau test)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-p02-'));
    try {
      await mkdir(join(dir, 'tags'), { recursive: true });
      await writeFile(join(dir, 'vcs.project.yaml'), 'name: X\n', 'utf8');
      await writeFile(join(dir, 'tags', 'tags.yaml'), 'tags: []\n', 'utf8');
      const fs = nodeFS(dir);
      expect(fs.root).toBe(dir);
      await expect(fs.readText('vcs.project.yaml')).resolves.toBe('name: X\n');
      await expect(fs.exists('tags/tags.yaml')).resolves.toBe(true);
      await expect(fs.list('', { glob: '**/*.yaml' })).resolves.toEqual([
        'tags/tags.yaml',
        'vcs.project.yaml',
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('từ chối đọc ra ngoài root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-p02-'));
    try {
      const fs = nodeFS(dir);
      await expect(fs.readText('../secret.txt')).rejects.toThrow();
      await expect(fs.readText('tags/../../secret.txt')).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
