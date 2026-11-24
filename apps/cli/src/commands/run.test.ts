// Test `vcs run` (M0 §8.1, §12.1: CLI ≥ 10; golden T8 STATE §11).
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { runCommand } from './run.js';

const execFileAsync = promisify(execFile);

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const EXAMPLES = join(ROOT, 'examples', 'hello-tags');
const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

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

async function runCaptured(
  dir: string | undefined,
  opts?: Parameters<typeof runCommand>[1],
): Promise<{ code: number; out: string }> {
  const c = capture();
  try {
    const code = await runCommand(dir, opts);
    return { code, out: c.lines.join('\n') };
  } finally {
    c.restore();
  }
}

function hashOf(out: string): string {
  const line = out.split('\n').find((l) => l.startsWith('hash: '));
  if (line === undefined) throw new Error('không thấy dòng hash trong output');
  return line.slice('hash: '.length);
}

describe('vcs run — golden T8', () => {
  it('--until 5s: 500 bước, SCAN_CNT 500, LAMP_AUTO true, HEARTBEAT true, RUN false', async () => {
    const { code, out } = await runCaptured(EXAMPLES, { until: '5s', hash: true });
    expect(code).toBe(0);
    expect(out).toContain('SCAN_CNT = 500');
    expect(out).toContain('LAMP_RUN = false');
    expect(out).toContain('LAMP_AUTO = true');
    expect(out).toContain('LAMP_HEARTBEAT = true');
    expect(out).toContain('BTN_START = false');
    expect(out).toContain('SW_AUTO = false');
    expect(out).toContain('PT01 = 0');
    expect(out).toMatch(/^hash: [0-9a-f]{64}$/m);
  });

  it('--until 5s cho cùng hash qua các lần chạy (tất định)', async () => {
    const a = await runCaptured(EXAMPLES, { until: '5s', hash: true });
    const b = await runCaptured(EXAMPLES, { until: '5s', hash: true });
    expect(a.code).toBe(0);
    expect(hashOf(a.out)).toBe(hashOf(b.out));
  });

  it('--until 5s ghim đúng giá trị hash (M0 §15.6; đã chạy kiểm chứng local 2 lần)', async () => {
    const { code, out } = await runCaptured(EXAMPLES, { until: '5s', hash: true });
    expect(code).toBe(0);
    // Giá trị này phải giống hệt trên Windows và Linux (CI job test cả 2 OS).
    // Đổi khi và chỉ khi golden T8 thay đổi có chủ đích (khi đó cập nhật cả
    // STATE.md §14 + báo rõ trong PR — không sửa lặng lẽ để test xanh).
    expect(hashOf(out)).toBe('21096ab25e36d6e3a31850ceccea482a3f58fffedcd67da625eb2cff7e8b1d53');
  });

  it('--steps 500 cho cùng hash với --until 5s', async () => {
    const a = await runCaptured(EXAMPLES, { steps: '500', hash: true });
    const b = await runCaptured(EXAMPLES, { until: '5s', hash: true });
    expect(hashOf(a.out)).toBe(hashOf(b.out));
  });

  it('--steps 0: không bước nào, hash rỗng sha256', async () => {
    const { code, out } = await runCaptured(EXAMPLES, { steps: '0', hash: true });
    expect(code).toBe(0);
    expect(out).toContain('SCAN_CNT = 0');
    expect(hashOf(out)).toBe(EMPTY_HASH);
  });

  it('--json: simTimeMs 5000, stepCount 500, 7 tag I/Q', async () => {
    const { code, out } = await runCaptured(EXAMPLES, { until: '5s', json: true });
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as {
      simTimeMs: number;
      stepCount: number;
      tags: Record<string, unknown>;
    };
    expect(parsed.simTimeMs).toBe(5000);
    expect(parsed.stepCount).toBe(500);
    expect(Object.keys(parsed.tags)).toHaveLength(7);
    expect(parsed.tags['SCAN_CNT']).toBe(500);
  });

  it('--watch chỉ in tag được chọn', async () => {
    const { code, out } = await runCaptured(EXAMPLES, { steps: '10', watch: 'LAMP_RUN,SCAN_CNT' });
    expect(code).toBe(0);
    expect(out).toContain('LAMP_RUN = false');
    expect(out).toContain('SCAN_CNT = 10');
    expect(out).not.toContain('BTN_START');
  });

  it('--csv: header + 510 dòng change (500 SCAN_CNT + 1 LAMP_AUTO + 9 HEARTBEAT)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-run-csv-'));
    try {
      const csvPath = join(dir, 'trace.csv');
      const { code } = await runCaptured(EXAMPLES, { until: '5s', csv: csvPath });
      expect(code).toBe(0);
      const text = await readFile(csvPath, 'utf8');
      const lines = text.trim().split('\n');
      expect(lines[0]).toBe('T,name,oldValue,newValue,source,writes');
      expect(lines).toHaveLength(511);
      expect(lines[1]).toBe('0,LAMP_AUTO,false,true,plc,1');
      expect(lines[2]).toBe('0,SCAN_CNT,0,1,plc,1');
      expect(lines[52]).toBe('500,LAMP_HEARTBEAT,false,true,plc,1');
      expect(lines[510]).toBe('4990,SCAN_CNT,499,500,plc,1');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('--step-ms 5 --until 5s: 1000 bước nhưng scan 10 ms → SCAN_CNT 500', async () => {
    const { code, out } = await runCaptured(EXAMPLES, { until: '5s', stepMs: '5' });
    expect(code).toBe(0);
    expect(out).toContain('SCAN_CNT = 500');
  });

  it('project không hợp lệ → exit 2', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-run-'));
    try {
      const { code, out } = await runCaptured(dir, { steps: '1' });
      expect(code).toBe(2);
      expect(out).toContain('PRJ-E001');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('sai tham số → exit 3 (thiếu steps/until, cả hai, until xấu, steps xấu, watch lạ, thiếu dir)', async () => {
    const cases: { dir: string | undefined; opts?: Parameters<typeof runCommand>[1] }[] = [
      { dir: EXAMPLES },
      { dir: EXAMPLES, opts: { steps: '10', until: '5s' } },
      { dir: EXAMPLES, opts: { until: 'khong-phai-duration' } },
      { dir: EXAMPLES, opts: { steps: '-1' } },
      { dir: EXAMPLES, opts: { steps: 'abc' } },
      { dir: EXAMPLES, opts: { steps: '1.5' } },
      { dir: EXAMPLES, opts: { steps: '10', stepMs: '0' } },
      { dir: EXAMPLES, opts: { steps: '1', watch: 'TAG_KHONG_CO' } },
      { dir: undefined, opts: { steps: '1' } },
      { dir: join(tmpdir(), 'vcs-khong-ton-tai-xyz'), opts: { steps: '1' } },
    ];
    for (const c of cases) {
      const { code } = await runCaptured(c.dir, c.opts);
      expect(code).toBe(3);
    }
  });
});

describe('vcs run — spawn pnpm vcs thật', () => {
  it('pnpm vcs validate examples/hello-tags → exit 0', async () => {
    const { stdout } = await execFileAsync('pnpm', ['vcs', 'validate', EXAMPLES], {
      cwd: ROOT,
      shell: true,
    });
    expect(stdout).toContain('OK: Hello Tags');
  }, 60_000);

  it('pnpm vcs run --until 5s --hash → exit 0, hash khớp chạy trực tiếp', async () => {
    const direct = await runCaptured(EXAMPLES, { until: '5s', hash: true });
    const { stdout } = await execFileAsync(
      'pnpm',
      ['vcs', 'run', EXAMPLES, '--until', '5s', '--hash'],
      { cwd: ROOT, shell: true },
    );
    expect(stdout).toContain('SCAN_CNT = 500');
    expect(hashOf(stdout)).toBe(hashOf(direct.out));
  }, 60_000);
});
