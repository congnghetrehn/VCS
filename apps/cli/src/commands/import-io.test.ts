// Test `vcs import-io` (M2 §8, P2.5 commit 6, OQ-339).
// Gọi importIoCommand trực tiếp, capture console (theo mẫu plant.test.ts).

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { importIoCommand } from './import-io.js';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const FIXTURE_XLSX = join(ROOT, 'fixtures', 'io-list-300.xlsx');
const FIXTURE_CSV = join(ROOT, 'fixtures', 'io-list-300.csv');

function capture(): { stdout: string[]; stderr: string[]; restore: () => void } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderr.push(args.map(String).join(' '));
  });
  return {
    stdout,
    stderr,
    restore: () => {
      logSpy.mockRestore();
      errSpy.mockRestore();
    },
  };
}

async function runCaptured(
  file: string | undefined,
  opts?: Parameters<typeof importIoCommand>[1],
): Promise<{ code: number; out: string; err: string }> {
  const c = capture();
  try {
    const code = await importIoCommand(file, opts);
    return { code, out: c.stdout.join('\n'), err: c.stderr.join('\n') };
  } finally {
    c.restore();
  }
}

describe('vcs import-io — fixture', () => {
  it('XLSX: exit 0, header dòng 6, 300 bản ghi, preview có tag đầu', async () => {
    const { code, out } = await runCaptured(FIXTURE_XLSX);
    expect(code).toBe(0);
    expect(out).toContain('Header: dòng 6');
    expect(out).toContain('Bản ghi: 300');
    expect(out).toMatch(/tag\s+<- Tag Name/);
    expect(out).toContain('CR01_M01_RUN_CMD');
    expect(out).toContain('Preview (50/300 bản ghi)');
  }, 60_000);

  it('CSV: exit 0, encoding/delimiter đã sniff hiện trong output', async () => {
    const { code, out } = await runCaptured(FIXTURE_CSV);
    expect(code).toBe(0);
    expect(out).toContain("encoding windows-1252, delimiter ';'");
    expect(out).toContain('Bản ghi: 300');
  }, 60_000);

  it('--json: stdout parse được, mapping đủ 9 field, preview 50, totalRows 300', async () => {
    const { code, out } = await runCaptured(FIXTURE_XLSX, { json: true });
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as {
      headerRow: number;
      firstDataRow: number;
      totalRows: number;
      mapping: { field: string; column: string; source: string }[];
      preview: { tag?: string }[];
      changed: unknown[];
    };
    expect(parsed.headerRow).toBe(6);
    expect(parsed.firstDataRow).toBe(7);
    expect(parsed.totalRows).toBe(300);
    expect(parsed.mapping).toHaveLength(9);
    expect(parsed.mapping.find((m) => m.field === 'tag')?.column).toBe('Tag Name');
    expect(parsed.mapping.every((m) => m.source === 'suggest')).toBe(true);
    expect(parsed.preview).toHaveLength(50);
    expect(parsed.preview[0]?.tag).toBe('CR01_M01_RUN_CMD');
    expect(parsed.changed).toEqual([]);
  }, 60_000);

  it('--sheet Cover: đọc sheet phụ (3 dòng, không header → exit 2)', async () => {
    const { code, err } = await runCaptured(FIXTURE_XLSX, { sheet: 'Cover' });
    expect(code).toBe(2);
    expect(err).toContain('không tìm thấy dòng header');
  }, 60_000);
});

describe('vcs import-io — lỗi tham số/đọc', () => {
  it('thiếu <file> → exit 3', async () => {
    const { code } = await runCaptured(undefined);
    expect(code).toBe(3);
  });

  it('file không tồn tại → exit 2', async () => {
    const { code, err } = await runCaptured(join(ROOT, 'không-tồn-tại.xlsx'));
    expect(code).toBe(2);
    expect(err).toContain('Không đọc được file');
  });

  it('đuôi lạ (.txt) → exit 3; .xls cũ → exit 3', async () => {
    expect((await runCaptured(join(ROOT, 'a.txt'))).code).toBe(3);
    expect((await runCaptured(join(ROOT, 'a.xls'))).code).toBe(3);
  });
});

describe('vcs import-io — profile', () => {
  async function writeTemp(content: string, name: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-import-io-'));
    const path = join(dir, name);
    await writeFile(path, content);
    return path;
  }

  it('--profile khớp: mapping từ profile (source profile), transform chạy', async () => {
    const profilePath = await writeTemp(
      `name: Fixture profile
file: fixtures/io-list-300.xlsx
sheet: "IO List"
headerRow: 6
firstDataRow: 7
lastDataRow: null
fillDownColumns: [station]
encoding: auto
delimiter: auto
mapping:
  tag: "Tag Name"
  description: "Description"
  signalType: "Type"
  address: "Address"
  controller: "PLC"
transforms:
  - { field: tag, op: replace, pattern: "_RUN_", with: "_CHAY_" }
headers: [Station, "Tag Name", Description, Type, Address, PLC, "Range Lo", "Range Hi", Unit, Equipment]
`,
      'profile.yaml',
    );
    try {
      const { code, out } = await runCaptured(FIXTURE_XLSX, { profile: profilePath, json: true });
      expect(code).toBe(0);
      const parsed = JSON.parse(out) as {
        mapping: { field: string; source: string }[];
        preview: { tag?: string }[];
        changed: { field: string; op: string }[];
      };
      expect(parsed.mapping.every((m) => m.source === 'profile')).toBe(true);
      expect(parsed.mapping).toHaveLength(5);
      expect(parsed.preview[0]?.tag).toBe('CR01_M01_CHAY_CMD');
      expect(parsed.changed.length).toBeGreaterThan(0);
      expect(parsed.changed[0]?.field).toBe('tag');
    } finally {
      await rm(join(profilePath, '..'), { recursive: true, force: true });
    }
  }, 60_000);

  it('--profile không khớp (sai sheet): cảnh báo + dùng gợi ý tự động, exit 0', async () => {
    const profilePath = await writeTemp(
      `name: Sai sheet
sheet: "Không có"
headerRow: 6
firstDataRow: 7
mapping:
  tag: "Tag Name"
headers: [Station, "Tag Name"]
`,
      'profile.yaml',
    );
    try {
      const { code, out, err } = await runCaptured(FIXTURE_XLSX, { profile: profilePath, json: true });
      expect(code).toBe(0);
      expect(err).toContain('profile không khớp file');
      const parsed = JSON.parse(out) as { mapping: { source: string }[] };
      expect(parsed.mapping.every((m) => m.source === 'suggest')).toBe(true);
    } finally {
      await rm(join(profilePath, '..'), { recursive: true, force: true });
    }
  }, 60_000);

  it('--profile hỏng (YAML sai) → exit 2', async () => {
    const profilePath = await writeTemp('name: [không đóng', 'profile.yaml');
    try {
      const { code } = await runCaptured(FIXTURE_XLSX, { profile: profilePath });
      expect(code).toBe(2);
    } finally {
      await rm(join(profilePath, '..'), { recursive: true, force: true });
    }
  });

  it('file không header + profile cho headerRow → chạy được (đường hồi phục của plan)', async () => {
    const csvPath = await writeTemp('Foo;Bar\nM01;x\nM02;y\n', 'no-header.csv');
    const profilePath = await writeTemp(
      `name: Tay
headerRow: 1
firstDataRow: 2
mapping:
  tag: Foo
`,
      'profile.yaml',
    );
    try {
      const { code, out, err } = await runCaptured(csvPath, { profile: profilePath, json: true });
      expect(code).toBe(0);
      const parsed = JSON.parse(out) as { preview: { tag?: string }[] };
      expect(parsed.preview[0]?.tag).toBe('M01');
      expect(err).not.toContain('không tìm thấy dòng header');
    } finally {
      await rm(join(csvPath, '..'), { recursive: true, force: true });
      await rm(join(profilePath, '..'), { recursive: true, force: true });
    }
  });
});
