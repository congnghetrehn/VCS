// Test cho gate tooling của P0.1 (M0 §3.5, §3.6, §15 mục 7–8).
// Mỗi test tạo file probe tạm trong repo, chạy tool thật, rồi xóa probe trong
// `finally` — không để lại file probe trong cây làm việc.
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runNode(entry: string, args: string[]): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [join(ROOT, entry), ...args], {
      cwd: ROOT,
      timeout: 180_000,
      maxBuffer: 10 * 1024 * 1024,
    });
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

async function withProbe(path: string, content: string, fn: () => Promise<void>): Promise<void> {
  await mkdir(dirname(join(ROOT, path)), { recursive: true });
  await writeFile(join(ROOT, path), content, 'utf8');
  try {
    await fn();
  } finally {
    await rm(join(ROOT, path), { force: true });
  }
}

describe('scripts gốc (package.json)', () => {
  it('có đủ script gate theo M0 §3.3', async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    for (const script of ['lint', 'typecheck', 'depcheck', 'test', 'review:cheats']) {
      expect(pkg.scripts[script], `thiếu script ${script}`).toBeTruthy();
    }
    // Phiên bản đã ghim, tương thích lẫn nhau (không dùng TypeScript 7 — peer của
    // typescript-eslint là <6.1.0; không dùng vitest 5 — bỏ hỗ trợ Node 20, M0 §13
    // yêu cầu CI chạy Node 20 và 22).
    expect(pkg.devDependencies.typescript).toBe('5.9.3');
    expect(pkg.devDependencies.vitest).toBe('4.1.12');
    expect(pkg.devDependencies.eslint).toBe('10.14.0');
    expect(pkg.devDependencies['typescript-eslint']).toBe('8.72.2');
    // ESLint 10 không còn bundle @eslint/js (nó là package riêng, dòng 9.x mới
    // nhất là 9.39.5, không có peerDependencies nên dùng chung với eslint 10 được).
    expect(pkg.devDependencies['@eslint/js']).toBe('9.39.5');
  });

  it('pnpm-workspace.yaml liệt kê apps/* và packages/*, lockfile khớp phiên bản đã ghim', async () => {
    const workspace = await readFile(join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
    expect(workspace).toContain('apps/*');
    expect(workspace).toContain('packages/*');
    const lock = await readFile(join(ROOT, 'pnpm-lock.yaml'), 'utf8');
    expect(lock).toContain('typescript@5.9.3');
    expect(lock).toContain('vitest@4.1.12');
    expect(lock).not.toContain('typescript@7.');
  });
});

describe('lint tất định (M0 §3.6)', () => {
  it('chặn Date.now trong package lõi (kernel)', async () => {
    const probe = 'packages/kernel/src/__probe-lint-bad.ts';
    await withProbe(probe, 'export const probe = Date.now();\n', async () => {
      const r = await runNode('node_modules/eslint/bin/eslint.js', [probe]);
      expect(r.code, `eslint phải thất bại trên ${probe}, stdout=${r.stdout}`).not.toBe(0);
      expect(r.stdout + r.stderr).toMatch(/no-restricted-properties|Date\.now/);
    });
  }, 180_000);

  it('chặn Math.random trong package lõi (schemas)', async () => {
    const probe = 'packages/schemas/src/__probe-lint-bad.ts';
    await withProbe(probe, 'export const probe = Math.random();\n', async () => {
      const r = await runNode('node_modules/eslint/bin/eslint.js', [probe]);
      expect(r.code, `eslint phải thất bại trên ${probe}, stdout=${r.stdout}`).not.toBe(0);
      expect(r.stdout + r.stderr).toMatch(/no-restricted-properties|Math\.random/);
    });
  }, 180_000);

  it('không chặn Date.now ở allow-list apps/* (B10)', async () => {
    const probe = 'apps/server/src/__probe-lint-ok.ts';
    await withProbe(probe, 'export const probe = Date.now();\n', async () => {
      const r = await runNode('node_modules/eslint/bin/eslint.js', [probe]);
      expect(r.code, `eslint không được chặn ${probe}, stdout=${r.stdout} stderr=${r.stderr}`).toBe(
        0,
      );
    });
  }, 180_000);
});

describe('dependency-cruiser (M0 §3.5 + B7)', () => {
  it('chặn kernel import @vcs/project (kernel chỉ được import schemas)', async () => {
    const probe = 'packages/kernel/src/__probe-dep-bad.ts';
    await withProbe(probe, "import '@vcs/project';\nexport {};\n", async () => {
      const r = await runNode('node_modules/dependency-cruiser/bin/dependency-cruiser.mjs', [
        '--validate',
        '.dependency-cruiser.cjs',
        probe,
      ]);
      expect(r.code, `depcruise phải thất bại trên ${probe}, stdout=${r.stdout}`).not.toBe(0);
      expect(r.stdout + r.stderr).toMatch(/kernel-deps/);
    });
  }, 180_000);

  it('cho phép kernel import @vcs/schemas', async () => {
    const probe = 'packages/kernel/src/__probe-dep-ok.ts';
    await withProbe(probe, "import '@vcs/schemas';\nexport {};\n", async () => {
      const r = await runNode('node_modules/dependency-cruiser/bin/dependency-cruiser.mjs', [
        '--validate',
        '.dependency-cruiser.cjs',
        probe,
      ]);
      expect(
        r.code,
        `depcruise không được chặn ${probe}, stdout=${r.stdout} stderr=${r.stderr}`,
      ).toBe(0);
    });
  }, 180_000);

  it('cho phép schemas import nội bộ (schemas-standalone chỉ cấm package khác)', async () => {
    const probe = 'packages/schemas/src/__probe-dep-ok.ts';
    await withProbe(probe, "import './common.js';\nexport {};\n", async () => {
      const r = await runNode('node_modules/dependency-cruiser/bin/dependency-cruiser.mjs', [
        '--validate',
        '.dependency-cruiser.cjs',
        probe,
      ]);
      expect(
        r.code,
        `depcruise không được chặn ${probe}, stdout=${r.stdout} stderr=${r.stderr}`,
      ).toBe(0);
    });
  }, 180_000);

  it('chặn schemas import @vcs/project (schemas không import package khác)', async () => {
    const probe = 'packages/schemas/src/__probe-dep-bad.ts';
    await withProbe(probe, "import '@vcs/project';\nexport {};\n", async () => {
      const r = await runNode('node_modules/dependency-cruiser/bin/dependency-cruiser.mjs', [
        '--validate',
        '.dependency-cruiser.cjs',
        probe,
      ]);
      expect(r.code, `depcruise phải thất bại trên ${probe}, stdout=${r.stdout}`).not.toBe(0);
      expect(r.stdout + r.stderr).toMatch(/schemas-standalone/);
    });
  }, 180_000);

  it('chặn apps/web import @vcs/kernel (web chỉ được schemas, expr, hmi)', async () => {
    const probe = 'apps/web/src/__probe-dep-bad.ts';
    await withProbe(probe, "import '@vcs/kernel';\nexport {};\n", async () => {
      const r = await runNode('node_modules/dependency-cruiser/bin/dependency-cruiser.mjs', [
        '--validate',
        '.dependency-cruiser.cjs',
        probe,
      ]);
      expect(r.code, `depcruise phải thất bại trên ${probe}, stdout=${r.stdout}`).not.toBe(0);
      expect(r.stdout + r.stderr).toMatch(/web-deps/);
    });
  }, 180_000);
});
