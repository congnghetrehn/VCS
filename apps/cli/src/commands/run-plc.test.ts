// Test `vcs run --scans` + nạp plc/ (P1.7, OQ-203/217).
// Gọi trực tiếp runCommand với console capture (không spawn).

import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runCommand } from './run.js';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const MOTOR = join(ROOT, 'examples', 'motor-interlock');
const HELLO_TAGS = join(ROOT, 'examples', 'hello-tags');

async function runCaptured(
  dir: string | undefined,
  opts?: Parameters<typeof runCommand>[1],
): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  try {
    const code = await runCommand(dir, opts);
    return { code, out: lines.join('\n') };
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
}

describe('vcs run --scans (motor-interlock: stepMs 100 = scanPeriod 100)', () => {
  it('--scans 5 → exit 0, scans: 5, RUN_CMD false (chưa start)', async () => {
    const { code, out } = await runCaptured(MOTOR, { scans: '5' });
    expect(code).toBe(0);
    expect(out).toContain('scans: 5');
    expect(out).toContain('RUN_CMD = false');
  });

  it('--scans 5 --json → scans: 5 trong JSON', async () => {
    const { code, out } = await runCaptured(MOTOR, { scans: '5', json: true });
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as { scans?: number; stepCount?: number };
    expect(parsed.scans).toBe(5);
    expect(parsed.stepCount).toBe(5);
  });

  it('--scans 0 → exit 3; --scans cùng --steps → exit 3', async () => {
    const { code: c1 } = await runCaptured(MOTOR, { scans: '0' });
    expect(c1).toBe(3);
    const { code: c2 } = await runCaptured(MOTOR, { scans: '5', steps: '5' });
    expect(c2).toBe(3);
  });

  it('--scans trên project không plc/ → exit 3', async () => {
    const { code, out } = await runCaptured(HELLO_TAGS, { scans: '5' });
    expect(code).toBe(3);
    expect(out).toContain('--scans cần project có plc/');
  });

  it('plc/ biên dịch lỗi → exit 2 (OQ-217, fail fast)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-run-plc-broken-'));
    await cp(MOTOR, dir, { recursive: true });
    await writeFile(join(dir, 'plc', 'OB1.scl'), 'ORGANIZATION_BLOCK "Main"\nBEGIN\n  #khongCo := true;\nEND_ORGANIZATION_BLOCK\n', 'utf8');
    const { code, out } = await runCaptured(dir, { scans: '5' });
    expect(code).toBe(2);
    expect(out).toMatch(/SCL-/);
  });

  it('run --until trên motor-interlock nạp PLC (RUN_CMD false, không crash)', async () => {
    const { code, out } = await runCaptured(MOTOR, { until: '1s' });
    expect(code).toBe(0);
    expect(out).toContain('RUN_CMD = false');
  });
});
