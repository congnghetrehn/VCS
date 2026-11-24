// Test cho scripts/doctor.mjs (spike S6, docs/SPIKES.md §S6).
// Chỉ assert cấu trúc báo cáo + kiểm tra Node (luôn đạt trên máy chạy test);
// các kiểm tra khác phụ thuộc môi trường nên chỉ assert chúng tồn tại với
// trạng thái hợp lệ, không assert đạt/rớt.
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

interface DoctorCheck {
  id: string;
  label: string;
  status: string;
  detail: string;
  required: boolean;
}

async function runDoctor(
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [join(ROOT, 'scripts/doctor.mjs'), ...args],
      {
        cwd: ROOT,
        timeout: 60_000,
      },
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof e.code === 'number' ? e.code : 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
    };
  }
}

describe('scripts/doctor.mjs (S6)', () => {
  it('--json trả báo cáo đủ các kiểm tra, Node đạt', async () => {
    const r = await runDoctor(['--json']);
    // doctor thoát 1 khi có kiểm tra bắt buộc lỗi (vd: pnpm chưa cài) — đó là
    // hành vi đúng, không phải lỗi test; chỉ chấp nhận 0 hoặc 1.
    expect([0, 1]).toContain(r.code);
    const report = JSON.parse(r.stdout) as { ok: boolean; checks: DoctorCheck[] };
    expect(Array.isArray(report.checks)).toBe(true);
    const ids = report.checks.map((c) => c.id);
    for (const id of [
      'node',
      'pnpm',
      'git',
      'write',
      'port-4170',
      'port-4840',
      'port-1502',
      'playwright',
      'dotnet',
      'autocrlf',
      'tmpdir',
    ]) {
      expect(ids, `thiếu kiểm tra ${id}`).toContain(id);
    }
    for (const c of report.checks) {
      expect(['ok', 'fail', 'missing', 'busy', 'warn', 'not-installed']).toContain(c.status);
      expect(c.detail.length).toBeGreaterThan(0);
    }
    const node = report.checks.find((c) => c.id === 'node');
    expect(node?.status).toBe('ok');
    expect(report.ok).toBe(r.code === 0);
  }, 60_000);

  it('in dạng người đọc được, có dòng kết luận', async () => {
    const r = await runDoctor([]);
    expect([0, 1]).toContain(r.code);
    expect(r.stdout).toMatch(/doctor: (ĐẠT|CHƯA ĐẠT)/);
    expect(r.stdout).toContain('Node.js');
  }, 60_000);
});
