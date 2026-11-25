// Test `vcs golden run` — @vcs/cli (M1 §12.1, P1.7, OQ-201/205).
// Gọi trực tiếp goldenRunCommand với console capture (không spawn).

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { goldenRunCommand } from './golden.js';

const COPY_SCL = [
  'FUNCTION_BLOCK "FB_Copy"',
  'VAR_INPUT',
  '  iIn: Bool;',
  'END_VAR',
  'VAR_OUTPUT',
  '  qOut: Bool;',
  'END_VAR',
  'BEGIN',
  '  #qOut := #iIn;',
  'END_FUNCTION_BLOCK',
  '',
  'DATA_BLOCK "DB_Copy" "FB_Copy"',
  'BEGIN',
  'END_DATA_BLOCK',
  '',
  'ORGANIZATION_BLOCK "Main"',
  'BEGIN',
  '  "DB_Copy"(iIn := %I0.0);',
  '  %Q0.0 := "DB_Copy".qOut;',
  'END_ORGANIZATION_BLOCK',
  '',
].join('\n');

function copyGolden(id: string, expectQ: boolean): string {
  return [
    `id: ${id}`,
    'description: "copy I0.0 sang Q0.0"',
    'sources:',
    '  - file: copy.scl',
    '    text: |',
    ...COPY_SCL.split('\n').map((l) => `      ${l}`),
    'steps:',
    '  - t: 0',
    '    expect:',
    '      "%Q0.0": false',
    '  - t: 10',
    '    set:',
    '      "%I0.0": true',
    '    expect:',
    `      "%Q0.0": ${expectQ ? 'true' : 'false'}`,
    '',
  ].join('\n');
}

async function runCaptured(path: string | undefined): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  try {
    const code = await goldenRunCommand(path);
    return { code, out: lines.join('\n') };
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
}

async function writeGoldenDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vcs-golden-cli-'));
  for (const [name, content] of Object.entries(files)) {
    const full = join(dir, name);
    await mkdir(join(dir, name.split('/').slice(0, -1).join('/')), { recursive: true }).catch(() => {});
    await writeFile(full, content, 'utf8');
  }
  return dir;
}

describe('vcs golden run', () => {
  it('thư mục 1 golden pass → exit 0', async () => {
    const dir = await writeGoldenDir({ 'copy.golden.yaml': copyGolden('copy', true) });
    const { code, out } = await runCaptured(dir);
    expect(code).toBe(0);
    expect(out).toContain('PASS copy (2 steps, 1 scans)');
    expect(out).toContain('golden: 1 passed, 0 failed, 1 files');
  });

  it('1 file trực tiếp → exit 0', async () => {
    const dir = await writeGoldenDir({ 'copy.golden.yaml': copyGolden('copy', true) });
    const { code } = await runCaptured(join(dir, 'copy.golden.yaml'));
    expect(code).toBe(0);
  });

  it('kỳ vọng sai → exit 1, FAIL nêu id + ref', async () => {
    const dir = await writeGoldenDir({ 'copy.golden.yaml': copyGolden('copy', false) });
    const { code, out } = await runCaptured(dir);
    expect(code).toBe(1);
    expect(out).toContain('FAIL copy');
    expect(out).toContain('%Q0.0');
    expect(out).toContain('golden: 0 passed, 1 failed, 1 files');
  });

  it('YAML hỏng → exit 1 (FAIL, không crash)', async () => {
    const dir = await writeGoldenDir({ 'bad.golden.yaml': 'id: [\n  steps: [' });
    const { code, out } = await runCaptured(dir);
    expect(code).toBe(1);
    expect(out).toContain('FAIL bad.golden.yaml');
  });

  it('SCL trong golden lỗi biên dịch → exit 1', async () => {
    const bad = copyGolden('copy', true).replace('#qOut := #iIn;', '#qOut := #khongCo;');
    const dir = await writeGoldenDir({ 'copy.golden.yaml': bad });
    const { code, out } = await runCaptured(dir);
    expect(code).toBe(1);
    expect(out).toContain('FAIL copy');
  });

  it('thiếu path → exit 2; thư mục không có golden → exit 2', async () => {
    const { code: c1 } = await runCaptured(undefined);
    expect(c1).toBe(2);
    const { code: c2 } = await runCaptured(join(tmpdir(), 'vcs-golden-khong-ton-tai-xyz'));
    expect(c2).toBe(2);
    const dir = await writeGoldenDir({ 'note.txt': 'hello' });
    const { code: c3 } = await runCaptured(dir);
    expect(c3).toBe(2);
  });
});
