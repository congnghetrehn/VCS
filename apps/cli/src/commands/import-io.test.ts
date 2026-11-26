// Test `vcs import-io` (M2 §8, P2.5 commit 6, OQ-339).
// Gọi importIoCommand trực tiếp, capture console (theo mẫu plant.test.ts).

import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { importIoCommand } from './import-io.js';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const FIXTURE_XLSX = join(ROOT, 'fixtures', 'io-list-300.xlsx');
const FIXTURE_CSV = join(ROOT, 'fixtures', 'io-list-300.csv');
const MOTOR_DIR = join(ROOT, 'examples', 'motor-interlock');

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

describe('vcs import-io --commit/--report (P2.6 §8.8)', () => {
  const CSV_HEAD = 'Tag Name,Address,Signal Type\n';
  const CSV_OK =
    CSV_HEAD +
    'RUN_CMD,%Q0.0,DO\n' +
    'RUN_FB,%I0.4,DI\n' +
    'NEW_TAG,%I0.5,DI\n';
  // 6 tag cũ không có trong CSV → removed (đều provenance import/vắng).
  const REMOVED_6 = ['FAULT_LAMP', 'OVL_OK', 'PERM', 'RESET_PB', 'START_PB', 'STOP_OK'];

  async function setupProject(): Promise<{ tmp: string; proj: string }> {
    const tmp = await mkdtemp(join(tmpdir(), 'vcs-import-'));
    const proj = join(tmp, 'proj');
    await cp(MOTOR_DIR, proj, { recursive: true });
    return { tmp, proj };
  }

  async function listReports(proj: string): Promise<string[]> {
    return (await readdir(join(proj, 'reports'))).filter((f) => f.startsWith('import-')).sort();
  }

  it('--commit thành công: NEW_TAG thêm, OVL_OK xóa, report + normalized + profile được ghi', async () => {
    const { tmp, proj } = await setupProject();
    try {
      const csvPath = join(proj, 'import.csv');
      await writeFile(csvPath, CSV_OK, 'utf8');
      const tagsBefore = await readFile(join(proj, 'tags', 'tags.yaml'), 'utf8');
      const { code, out } = await runCaptured(csvPath, { commit: true });
      expect(code).toBe(0);
      expect(out).toContain('Đã commit');
      const tagsAfter = await readFile(join(proj, 'tags', 'tags.yaml'), 'utf8');
      expect(tagsAfter).toContain('NEW_TAG');
      expect(tagsAfter).not.toContain('OVL_OK');
      expect(tagsAfter).toContain('RUN_CMD');
      expect(tagsAfter).not.toBe(tagsBefore);
      const reports = await listReports(proj);
      expect(reports).toHaveLength(2);
      const jsonName = reports.find((f) => f.endsWith('.json')) as string;
      const htmlName = reports.find((f) => f.endsWith('.html')) as string;
      expect(jsonName).toMatch(/\.json$/);
      expect(htmlName).toMatch(/\.html$/);
      const reportJson = JSON.parse(await readFile(join(proj, 'reports', jsonName), 'utf8')) as {
        stats: { added: number; removed: number; unchanged: number };
        diff: { removed: string[] };
        diagnostics: { code: string }[];
        filesWritten: string[];
      };
      expect(reportJson.stats.added).toBe(1);
      expect(reportJson.stats.removed).toBe(6);
      expect(reportJson.stats.unchanged).toBe(2);
      expect(reportJson.diff.removed).toEqual(REMOVED_6);
      // OVL_OK đã gán M01.overloadOk nhưng bị xóa → PL-W010 (warning, không chặn commit).
      expect(reportJson.diagnostics.filter((d) => d.code === 'PL-W010')).toHaveLength(1);
      expect(reportJson.filesWritten).toContain('tags/tags.yaml');
      expect(reportJson.filesWritten).toContain('io/io-list.normalized.csv');
      expect(reportJson.filesWritten).toContain('io/import-profile.yaml');
      const normalized = await readFile(join(proj, 'io', 'io-list.normalized.csv'), 'utf8');
      expect(normalized.split('\n')[0]).toBe('tag,address,kind,type,controller,description,engMin,engMax,equipment,originRow');
      expect(normalized).toContain('NEW_TAG,%I0.5,DI,Bool,PLC1,,,,,4');
      const profile = await readFile(join(proj, 'io', 'import-profile.yaml'), 'utf8');
      expect(profile).toContain('name: import');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it('--commit bị từ chối (exit 1): địa chỉ lỗi → tags.yaml không đổi', async () => {
    const { tmp, proj } = await setupProject();
    try {
      const csvPath = join(proj, 'import.csv');
      await writeFile(csvPath, `${CSV_HEAD}RUN_CMD,%Q0.0,DO\nBAD_TAG,XYZ,DI\n`, 'utf8');
      const tagsBefore = await readFile(join(proj, 'tags', 'tags.yaml'), 'utf8');
      const { code, out, err } = await runCaptured(csvPath, { commit: true });
      expect(code).toBe(1);
      expect(out + err).toContain('Commit bị từ chối');
      const tagsAfter = await readFile(join(proj, 'tags', 'tags.yaml'), 'utf8');
      expect(tagsAfter).toBe(tagsBefore);
      // Report vẫn được ghi (ghi lại lý do từ chối).
      expect(await listReports(proj)).toHaveLength(2);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it('--report một mình: exit 0, report được ghi, tags.yaml không đổi', async () => {
    const { tmp, proj } = await setupProject();
    try {
      const csvPath = join(proj, 'import.csv');
      await writeFile(csvPath, CSV_OK, 'utf8');
      const tagsBefore = await readFile(join(proj, 'tags', 'tags.yaml'), 'utf8');
      const { code } = await runCaptured(csvPath, { report: true });
      expect(code).toBe(0);
      expect(await listReports(proj)).toHaveLength(2);
      const tagsAfter = await readFile(join(proj, 'tags', 'tags.yaml'), 'utf8');
      expect(tagsAfter).toBe(tagsBefore);
      // Không ghi normalized/profile ở chế độ report.
      await expect(readFile(join(proj, 'io', 'io-list.normalized.csv'), 'utf8')).rejects.toThrow();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it('--overwrite-manual: tag manual chỉ bị ghi đè khi có flag', async () => {
    const { tmp, proj } = await setupProject();
    try {
      const tagsPath = join(proj, 'tags', 'tags.yaml');
      const tagsText = await readFile(tagsPath, 'utf8');
      const manualText = tagsText.replace(
        '    address: "%I0.4"\n    controller: PLC1',
        '    address: "%I0.4"\n    controller: PLC1\n    description: cũ\n    provenance: manual',
      );
      expect(manualText).not.toBe(tagsText);
      await writeFile(tagsPath, manualText, 'utf8');
      const csvPath = join(proj, 'import.csv');
      await writeFile(
        csvPath,
        'Tag Name,Address,Signal Type,Description\n' +
          'RUN_CMD,%Q0.0,DO,Run command\n' +
          'RUN_FB,%I0.4,DI,mới\n' +
          'NEW_TAG,%I0.5,DI,New tag\n',
        'utf8',
      );
      const { code: code1 } = await runCaptured(csvPath, { commit: true });
      expect(code1).toBe(0);
      let after = await readFile(tagsPath, 'utf8');
      expect(after).toContain('description: cũ');
      expect(after).not.toContain('description: mới');
      const { code: code2 } = await runCaptured(csvPath, { commit: true, overwriteManual: true });
      expect(code2).toBe(0);
      after = await readFile(tagsPath, 'utf8');
      expect(after).toContain('description: mới');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it('--commit không có project (exit 2)', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'vcs-import-'));
    try {
      const csvPath = join(tmp, 'import.csv');
      await writeFile(csvPath, CSV_OK, 'utf8');
      const { code, err } = await runCaptured(csvPath, { commit: true });
      expect(code).toBe(2);
      expect(err).toContain('vcs.project.yaml');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it('--report --json: stdout parse được, có validate/diff/commit', async () => {
    const { tmp, proj } = await setupProject();
    try {
      const csvPath = join(proj, 'import.csv');
      await writeFile(csvPath, CSV_OK, 'utf8');
      const { code, out } = await runCaptured(csvPath, { report: true, json: true });
      expect(code).toBe(0);
      const parsed = JSON.parse(out) as {
        validate: { stats: { added: number } };
        diff: { added: string[]; removed: string[] };
        commit: { applied: boolean; refusedReason: string | null; filesWritten: string[] };
      };
      expect(parsed.diff.added).toEqual(['NEW_TAG']);
      expect(parsed.diff.removed).toEqual(REMOVED_6);
      expect(parsed.commit.applied).toBe(false);
      expect(parsed.commit.refusedReason).toBeNull();
      expect(parsed.commit.filesWritten.some((f) => f.endsWith('.json'))).toBe(true);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
