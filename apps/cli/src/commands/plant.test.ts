// Test `vcs plant run` (M2 §11.4, P2.4 commit 2 — OQ-306/307/316).
// Demo A–D qua CLI thật (exit 0 + hash ổn định), expect sai → 1, lỗi → 2,
// sai tham số → 3, smoke mode, spawn pnpm vcs thật.
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { plantRunCommand, plantValidateCommand } from './plant.js';

const execFileAsync = promisify(execFile);

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const MOTOR = join(ROOT, 'examples', 'motor-interlock');
const SCEN = join(MOTOR, 'scenarios');
const A = join(SCEN, 'a-normal-overload.yaml');
const B = join(SCEN, 'b-no-feedback.yaml');
const C = join(SCEN, 'c-local-mode.yaml');
const D = join(SCEN, 'd-contactor-stuck.yaml');

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
  opts?: Parameters<typeof plantRunCommand>[1],
): Promise<{ code: number; out: string }> {
  const c = capture();
  try {
    const code = await plantRunCommand(dir, opts);
    return { code, out: c.lines.join('\n') };
  } finally {
    c.restore();
  }
}

describe('vcs plant run — demo A–D (M2 §11.4)', () => {
  it('A chạy bình thường rồi overload, reset, chạy lại → exit 0', async () => {
    const { code, out } = await runCaptured(MOTOR, { scenario: [A] });
    expect(code).toBe(0);
    expect(out).toContain('PASS a-normal-overload (372 bước');
  }, 60_000);

  it('B mất feedback → exit 0', async () => {
    const { code, out } = await runCaptured(MOTOR, { scenario: [B] });
    expect(code).toBe(0);
    expect(out).toContain('PASS b-no-feedback');
  }, 60_000);

  it('C localMode → exit 0', async () => {
    const { code, out } = await runCaptured(MOTOR, { scenario: [C] });
    expect(code).toBe(0);
    expect(out).toContain('PASS c-local-mode');
  }, 60_000);

  it('D contactorStuck → exit 0', async () => {
    const { code, out } = await runCaptured(MOTOR, { scenario: [D] });
    expect(code).toBe(0);
    expect(out).toContain('PASS d-contactor-stuck');
  }, 60_000);

  it('cả 4 scenario 1 lần gọi → exit 0, 4 passed', async () => {
    const { code, out } = await runCaptured(MOTOR, { scenario: [A, B, C, D] });
    expect(code).toBe(0);
    expect(out).toContain('plant: 4 passed, 0 failed, 4 scenarios');
  }, 60_000);

  it('--json: A pass, hash 64 hex, simTimeMs 3720, stepCount 372', async () => {
    const { code, out } = await runCaptured(MOTOR, { scenario: [A], json: true });
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as {
      simTimeMs: number;
      stepCount: number;
      hash: string;
      scenarios: { file: string; passed: boolean; failures: unknown[] }[];
    };
    expect(parsed.simTimeMs).toBe(3720);
    expect(parsed.stepCount).toBe(372);
    expect(parsed.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.scenarios).toHaveLength(1);
    expect(parsed.scenarios[0]?.passed).toBe(true);
    expect(parsed.scenarios[0]?.failures).toEqual([]);
  }, 60_000);

  it('A chạy 2 lần cho cùng hash (tất định)', async () => {
    const a = await runCaptured(MOTOR, { scenario: [A], json: true });
    const b = await runCaptured(MOTOR, { scenario: [A], json: true });
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    const hashA = (JSON.parse(a.out) as { hash: string }).hash;
    const hashB = (JSON.parse(b.out) as { hash: string }).hash;
    expect(hashB).toBe(hashA);
  }, 60_000);
});

describe('vcs plant run — lỗi', () => {
  it('expect sai → exit 1 + in đúng checkpoint', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-plant-'));
    try {
      const file = join(dir, 'wrong.yaml');
      await writeFile(
        file,
        `name: wrong-expect
simulation: { stepMs: 10, plcScanMs: 10 }
steps:
  - { at: 0, set: { STOP_OK: true, PERM: true } }
  - { at: 100, set: { START_PB: true } }
expects:
  - { at: 100, tags: { RUN_CMD: false } }
`,
        'utf8',
      );
      const { code, out } = await runCaptured(MOTOR, { scenario: [file] });
      expect(code).toBe(1);
      expect(out).toContain('FAIL wrong-expect');
      expect(out).toContain('T=100 RUN_CMD: kỳ vọng false, thực tế true');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('file scenario thiếu → exit 2', async () => {
    const { code } = await runCaptured(MOTOR, { scenario: [join(SCEN, 'khong-co.yaml')] });
    expect(code).toBe(2);
  }, 60_000);

  it('sai tham số → exit 3 (cả --steps + --until, --until xấu, smoke không steps/until, thiếu dir)', async () => {
    expect((await runCaptured(MOTOR, { scenario: [A], steps: '10', until: '5s' })).code).toBe(3);
    expect((await runCaptured(MOTOR, { scenario: [A], until: 'xấu' })).code).toBe(3);
    expect((await runCaptured(MOTOR, {})).code).toBe(3);
    expect((await runCaptured(undefined, { scenario: [A] })).code).toBe(3);
  }, 60_000);

  it('project không có plant → exit 2', async () => {
    const { code } = await runCaptured(join(ROOT, 'examples', 'hello-tags'), { until: '1s' });
    expect(code).toBe(2);
  }, 60_000);
});

describe('vcs plant run — smoke mode', () => {
  it('--until 1s --hash → exit 0, in tag + hash', async () => {
    const { code, out } = await runCaptured(MOTOR, { until: '1s', hash: true });
    expect(code).toBe(0);
    expect(out).toContain('RUN_CMD = false');
    expect(out).toContain('hash: ');
  }, 60_000);

  it('--json smoke: scenarios rỗng, simTimeMs 1000', async () => {
    const { code, out } = await runCaptured(MOTOR, { until: '1s', json: true });
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as { simTimeMs: number; scenarios: unknown[] };
    expect(parsed.simTimeMs).toBe(1000);
    expect(parsed.scenarios).toEqual([]);
  }, 60_000);
});

describe('vcs plant run — spawn pnpm vcs thật', () => {
  it('pnpm vcs plant run --scenario A --json → exit 0, hash ổn định 2 lần chạy', async () => {
    const run = async (): Promise<string> => {
      const { stdout } = await execFileAsync(
        'pnpm',
        ['vcs', 'plant', 'run', `"${MOTOR}"`, '--scenario', `"${A}"`, '--json'],
        { cwd: ROOT, shell: true },
      );
      // pnpm in banner `> vcs@0.1.0 ...` ra stdout trước JSON — trích từ `{` đầu.
      const i = stdout.indexOf('{');
      if (i < 0) throw new Error(`không thấy JSON trong stdout: ${stdout.slice(0, 200)}`);
      return stdout.slice(i);
    };
    const outA = await run();
    const outB = await run();
    const hashA = (JSON.parse(outA) as { hash: string }).hash;
    const hashB = (JSON.parse(outB) as { hash: string }).hash;
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    expect(hashB).toBe(hashA);
  }, 120_000);
});

describe('vcs plant validate (M2 §10, P2.7 commit 5, OQ-376)', () => {
  async function runValidateCaptured(
    dir: string | undefined,
    opts?: Parameters<typeof plantValidateCommand>[1],
  ): Promise<{ code: number; out: string }> {
    const c = capture();
    try {
      const code = await plantValidateCommand(dir, opts);
      return { code, out: c.lines.join('\n') };
    } finally {
      c.restore();
    }
  }

  it('examples/motor-interlock → exit 0, in OK + PL-W001 (role optional chưa gán)', async () => {
    const { code, out } = await runValidateCaptured(MOTOR);
    expect(code).toBe(0);
    expect(out).toContain('OK: Motor Interlock — 1 thiết bị, 8 tags');
    expect(out).toContain('PL-W001');
  });

  it('--json → JSON parse được, valid true, equipment 1', async () => {
    const { code, out } = await runValidateCaptured(MOTOR, { json: true });
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as {
      name: string;
      valid: boolean;
      equipment: number;
      tags: number;
      diagnostics: unknown[];
    };
    expect(parsed.name).toBe('Motor Interlock');
    expect(parsed.valid).toBe(true);
    expect(parsed.equipment).toBe(1);
    expect(parsed.tags).toBe(8);
  });

  it('thiếu [dir] → exit 3', async () => {
    const { code } = await runValidateCaptured(undefined);
    expect(code).toBe(3);
  });

  it('thư mục không tồn tại → exit 3', async () => {
    const { code } = await runValidateCaptured(join(tmpdir(), 'vcs-khong-ton-tai-p27'));
    expect(code).toBe(3);
  });

  it('project không có plant (hello-tags) → exit 2', async () => {
    const { code, out } = await runValidateCaptured(
      join(ROOT, 'examples', 'hello-tags'),
    );
    expect(code).toBe(2);
    expect(out).toContain('không có plant');
  });

  it('plant model không tồn tại → exit 2 + PL-E001', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-plant-validate-'));
    try {
      await cp(join(ROOT, 'examples', 'hello-tags'), dir, { recursive: true });
      await mkdir(join(dir, 'plant'), { recursive: true });
      await writeFile(
        join(dir, 'plant', 'equipment.yaml'),
        '- id: X01\n  model: no_such_model\n  signals:\n    runCmd: BTN_START\n',
        'utf8',
      );
      const { code, out } = await runValidateCaptured(dir);
      expect(code).toBe(2);
      expect(out).toContain('PL-E001');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
