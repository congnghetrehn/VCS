// Test `vcs ir dump` (P1.3): exit 0/2/3, JSON ra stdout thuần, --out.
// So sánh byte với golden đã có ở compile.test.ts (E1–E3); ở đây kiểm
// đường dây CLI: đọc file → compile → JSON ra stdout/`--out`, mã thoát.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { compileSclProgram, irToJson } from '@vcs/vendor-siemens';
import { irDumpCommand } from './ir.js';

const FB_MOTOR = `FUNCTION_BLOCK "FB_Motor"
VAR_INPUT
  iStart : Bool;
  iStop : Bool;
END_VAR
VAR_OUTPUT
  qRun : Bool;
END_VAR
VAR
  latched : Bool;
END_VAR
BEGIN
  IF #iStart THEN
    #latched := TRUE;
  END_IF;
  IF #iStop THEN
    #latched := FALSE;
  END_IF;
  #qRun := #latched;
END_FUNCTION_BLOCK`;

const BAD_TYPE = `ORGANIZATION_BLOCK "Main"
VAR_TEMP
  i : Int;
  r : Real;
END_VAR
BEGIN
  #i := #r;
END_ORGANIZATION_BLOCK`;

interface Captured {
  code: number;
  stdout: string;
  console: string;
}

async function runCaptured(
  file: string | undefined,
  opts?: { out?: string },
): Promise<Captured> {
  const chunks: string[] = [];
  const lines: string[] = [];
  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  try {
    const code = await irDumpCommand(file, opts);
    return { code, stdout: chunks.join(''), console: lines.join('\n') };
  } finally {
    writeSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
}

async function writeTemp(name: string, content: string): Promise<{ dir: string; file: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'vcs-ir-'));
  const file = join(dir, name);
  await writeFile(file, content, 'utf8');
  return { dir, file };
}

describe('vcs ir dump', () => {
  it('dump FB_Motor → exit 0, stdout = irToJson của cùng file', async () => {
    const { dir, file } = await writeTemp('FB_Motor.scl', FB_MOTOR);
    try {
      const { code, stdout } = await runCaptured(file);
      expect(code).toBe(0);
      // fileName trong src là đường dẫn truyền vào — tính kỳ vọng bằng đúng
      // đường dẫn đó (so sánh byte với golden ở compile.test.ts E1).
      expect(stdout).toBe(irToJson(compileSclProgram(FB_MOTOR, file).program));
      expect(JSON.parse(stdout)).toMatchObject({ blocks: [{ name: 'FB_Motor' }] });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('file lỗi typecheck → exit 2 + in SCL-T010', async () => {
    const { dir, file } = await writeTemp('Bad.scl', BAD_TYPE);
    try {
      const { code, stdout, console: logged } = await runCaptured(file);
      expect(code).toBe(2);
      expect(stdout).toBe('');
      expect(logged).toContain('SCL-T010');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('file không tồn tại → exit 3', async () => {
    const { code } = await runCaptured(join(tmpdir(), 'vcs-ir-khong-ton-tai.scl'));
    expect(code).toBe(3);
  });

  it('thiếu <file.scl> → exit 3', async () => {
    const { code } = await runCaptured(undefined);
    expect(code).toBe(3);
  });

  it('--out ghi file thay vì stdout', async () => {
    const { dir, file } = await writeTemp('FB_Motor.scl', FB_MOTOR);
    const out = join(dir, 'out.json');
    try {
      const { code, stdout } = await runCaptured(file, { out });
      expect(code).toBe(0);
      expect(stdout).toBe('');
      expect(await readFile(out, 'utf8')).toBe(
        irToJson(compileSclProgram(FB_MOTOR, file).program),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('dump 2 lần ra string giống hệt theo từng byte', async () => {
    const { dir, file } = await writeTemp('FB_Motor.scl', FB_MOTOR);
    try {
      const a = await runCaptured(file);
      const b = await runCaptured(file);
      expect(a.code).toBe(0);
      expect(b.code).toBe(0);
      expect(a.stdout).toBe(b.stdout);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('vcs ir dump <dir> (P1.7, OQ-204)', () => {
  const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
  const MOTOR = join(ROOT, 'examples', 'motor-interlock');

  it('thư mục project motor-interlock → exit 0, blocks FB_Motor + Main', async () => {
    const { code, stdout } = await runCaptured(MOTOR);
    expect(code).toBe(0);
    const ir = JSON.parse(stdout) as { blocks: Array<{ name: string }>; dbs: Array<{ name: string }> };
    expect(ir.blocks.map((b) => b.name)).toEqual(['FB_Motor', 'Main']);
    expect(ir.dbs.map((d) => d.name)).toEqual(['FB_Motor_DB']);
  });

  it('thư mục plc trực tiếp (không tag) → exit 2 vì OB1 tra tag', async () => {
    const { code, console: logged } = await runCaptured(join(MOTOR, 'plc'));
    expect(code).toBe(2);
    expect(logged).toContain('SCL-T001');
  });

  it('thư mục không có file .scl/.lad.json → exit 3', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-ir-dir-'));
    try {
      const { code } = await runCaptured(dir);
      expect(code).toBe(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
