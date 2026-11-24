#!/usr/bin/env node
/**
 * doctor.mjs — kiểm môi trường phát triển (spike S6, docs/SPIKES.md §S6).
 *
 * Chạy:  node scripts/doctor.mjs [--json]
 *   --json  in kết quả dạng JSON (để dán vào docs/spikes/S6-env.md)
 *
 * Kiểm: phiên bản Node/pnpm/git, quyền ghi thư mục repo, cổng 4170/4840/1502
 * rảnh, Playwright có cài được không, (tùy chọn) dotnet --info, git core.autocrlf.
 * Thoát 0 khi mọi kiểm tra BẮT BUỘC đạt; thoát 1 khi có kiểm tra bắt buộc lỗi.
 * .NET thiếu chỉ là cảnh báo (chỉ cần cho tools/ .NET ở P5.3).
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

const asJson = process.argv.includes('--json');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000 });
  if (r.error || r.status !== 0) return null;
  return (r.stdout ?? '').trim();
}

function parseVersion(s) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(s ?? '');
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function atLeast(v, min) {
  if (!v) return false;
  for (let i = 0; i < 3; i += 1) {
    if (v[i] > min[i]) return true;
    if (v[i] < min[i]) return false;
  }
  return true;
}

function portFree(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, timeout: 500 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(true));
  });
}

async function main() {
  const checks = [];
  const check = (id, label, status, detail, required = true) => {
    checks.push({ id, label, status, detail, required });
  };

  // Node >= 20.11 (M0 §3.2).
  const nodeRaw = process.version;
  const nodeOk = atLeast(parseVersion(nodeRaw), [20, 11, 0]);
  check('node', 'Node.js >= 20.11', nodeOk ? 'ok' : 'fail', nodeRaw);

  // pnpm (M0 §3.2). Chỉ kiểm binary trên PATH; thiếu thì báo, dùng npx thay thế.
  const pnpmRaw = run('pnpm', ['--version']);
  check(
    'pnpm',
    'pnpm (packageManager pnpm@10.15.0)',
    pnpmRaw ? 'ok' : 'missing',
    pnpmRaw
      ? `pnpm ${pnpmRaw}`
      : 'không thấy lệnh pnpm — cài pnpm hoặc dùng: npx -y pnpm@10.15.0 --version',
  );

  // git.
  const gitRaw = run('git', ['--version']);
  check('git', 'git', gitRaw ? 'ok' : 'missing', gitRaw ?? 'không thấy lệnh git');

  // Quyền ghi thư mục repo (ghi + xóa file tạm).
  let writeOk = false;
  let writeDetail = '';
  try {
    const probe = join(process.cwd(), '.doctor-write-probe.tmp');
    writeFileSync(probe, 'doctor');
    rmSync(probe);
    writeOk = true;
    writeDetail = `ghi/xóa được trong ${process.cwd()}`;
  } catch (err) {
    writeDetail = `không ghi được trong ${process.cwd()}: ${err.message}`;
  }
  check('write', 'Quyền ghi thư mục repo', writeOk ? 'ok' : 'fail', writeDetail);

  // Cổng 4170/4840/1502 rảnh (S6).
  for (const port of [4170, 4840, 1502]) {
    const free = await portFree(port);
    check(
      `port-${port}`,
      `Cổng ${port} rảnh`,
      free ? 'ok' : 'busy',
      free ? 'rảnh' : 'đang bị chiếm',
    );
  }

  // Playwright: đã cài package chưa (để chạy e2e ở P0.6).
  let playwrightDetail =
    'chưa cài package playwright — chạy `pnpm add -D -w @playwright/test` ở P0.6 rồi `npx playwright install chromium`';
  let playwrightStatus = 'not-installed';
  try {
    const resolved = await import('playwright').catch(() => null);
    if (resolved) {
      playwrightStatus = 'ok';
      playwrightDetail = 'package playwright đã resolve được';
    }
  } catch {
    // giữ not-installed
  }
  check('playwright', 'Playwright (cho e2e P0.6)', playwrightStatus, playwrightDetail, false);

  // .NET SDK — tùy chọn ở M0, cần cho tools/ ở P5.3.
  const dotnetRaw = run('dotnet', ['--version']);
  check(
    'dotnet',
    '.NET SDK (tùy chọn ở M0; cần cho tools/ ở P5.3)',
    dotnetRaw ? 'ok' : 'missing',
    dotnetRaw ? `dotnet ${dotnetRaw}` : 'không thấy lệnh dotnet',
    false,
  );

  // git core.autocrlf (EOL — M0 §3.4 yêu cầu LF).
  const autocrlf = run('git', ['config', '--get', 'core.autocrlf']);
  check(
    'autocrlf',
    'git core.autocrlf (nên là false/input để giữ LF)',
    autocrlf === 'false' || autocrlf === 'input' ? 'ok' : 'warn',
    autocrlf
      ? `core.autocrlf=${autocrlf}`
      : 'chưa đặt (mặc định theo OS — trên Windows nên đặt false)',
    false,
  );

  // tmpdir ghi được (để test dùng os.tmpdir() thay /tmp).
  let tmpOk = false;
  try {
    const probe = join(tmpdir(), '.doctor-tmp-probe.tmp');
    writeFileSync(probe, 'doctor');
    rmSync(probe);
    tmpOk = true;
  } catch {
    tmpOk = false;
  }
  check('tmpdir', 'os.tmpdir() ghi được', tmpOk ? 'ok' : 'fail', tmpdir());

  const requiredFailed = checks.filter(
    (c) => c.required && (c.status === 'fail' || c.status === 'missing' || c.status === 'busy'),
  );
  const exitCode = requiredFailed.length > 0 ? 1 : 0;

  if (asJson) {
    console.log(JSON.stringify({ ok: exitCode === 0, checks }, null, 2));
  } else {
    for (const c of checks) {
      // Kiểm tra tùy chọn lỗi chỉ là WARN (không làm doctor thất bại) — hiển
      // thị FAIL cho chúng sẽ gây hiểu lầm (trông như lỗi nhưng exit code vẫn 0).
      const mark = c.status === 'ok' ? 'OK  ' : c.status === 'warn' || !c.required ? 'WARN' : 'FAIL';
      const suffix = c.status !== 'ok' && !c.required ? ' (tùy chọn)' : '';
      console.log(`[${mark}] ${c.label}: ${c.detail}${suffix}`);
    }
    console.log(
      exitCode === 0
        ? 'doctor: ĐẠT'
        : `doctor: CHƯA ĐẠT (${requiredFailed.length} kiểm tra bắt buộc lỗi)`,
    );
  }
  process.exit(exitCode);
}

main();
