// Test `vcs validate` (M0 §8.1, §12.1: CLI ≥ 10).
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { validateCommand } from './validate.js';

const EXAMPLES = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'examples',
  'hello-tags',
);

function capture(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  return {
    lines,
    restore: () => {
      logSpy.mockRestore();
      errSpy.mockRestore();
    },
  };
}

describe('vcs validate', () => {
  it('examples/hello-tags → exit 0, in OK', async () => {
    const c = capture();
    try {
      expect(await validateCommand(EXAMPLES)).toBe(0);
      expect(c.lines.join('\n')).toContain('OK: Hello Tags — 12 tags, 1 controllers');
    } finally {
      c.restore();
    }
  });

  it('--json → JSON parse được, valid true', async () => {
    const c = capture();
    try {
      expect(await validateCommand(EXAMPLES, { json: true })).toBe(0);
      const parsed = JSON.parse(c.lines.join('\n')) as { name: string; valid: boolean };
      expect(parsed.name).toBe('Hello Tags');
      expect(parsed.valid).toBe(true);
    } finally {
      c.restore();
    }
  });

  it('thiếu vcs.project.yaml → exit 2, in PRJ-E001', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-validate-'));
    try {
      const c = capture();
      try {
        expect(await validateCommand(dir)).toBe(2);
        expect(c.lines.join('\n')).toContain('PRJ-E001');
      } finally {
        c.restore();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('project có warning nhưng không error → exit 0', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-validate-'));
    try {
      await writeFile(
        join(dir, 'vcs.project.yaml'),
        'schemaVersion: 1\nname: No Tags\nlanguage: vi\nseed: 1\nsimulation: { stepMs: 10, plcScanMs: 10 }\ncontrollers: []\n',
        'utf8',
      );
      const c = capture();
      try {
        expect(await validateCommand(dir)).toBe(0);
        expect(c.lines.join('\n')).toContain('PRJ-W002');
      } finally {
        c.restore();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('thiếu thư mục / thiếu đối số / đường dẫn là file → exit 3', async () => {
    const c = capture();
    try {
      expect(await validateCommand(join(tmpdir(), 'vcs-khong-ton-tai-xyz'))).toBe(3);
      expect(await validateCommand(undefined)).toBe(3);
      expect(await validateCommand('')).toBe(3);
      expect(await validateCommand(join(EXAMPLES, 'vcs.project.yaml'))).toBe(3);
    } finally {
      c.restore();
    }
  });
});
