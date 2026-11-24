// Lệnh `vcs serve <dir>` — @vcs/cli (M0 §8.1, §8.2).
// Khởi động server (REST + WS) cho project; chạy tới khi nhận SIGINT/SIGTERM
// rồi dừng sạch, exit 0 (OQ-050). Exit: 0 ok (dừng bằng signal), 2 project
// không hợp lệ (in diagnostics), 3 sai tham số/thiếu thư mục (OQ-045).
// `--host 0.0.0.0` in cảnh báo (M0 §8.2). `--open` mở trình duyệt; mở lỗi
// → cảnh báo, server vẫn chạy (OQ-043).

import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { ProjectInvalidError } from '@vcs/kernel';
import { formatDiagnostic } from '@vcs/schemas';
import { createServer, resolveServerConfig, type RunningServer } from '@vcs/server';

export interface ServeOptions {
  port?: string;
  host?: string;
  open?: boolean;
  /** Tắt logger (test dùng; CLI luôn log). */
  silent?: boolean;
}

export interface ServeHandle {
  url: string;
  stop(): Promise<void>;
}

async function startServer(dir: string, opts?: ServeOptions): Promise<RunningServer> {
  const config = parseServeOptions(opts);
  const server = await createServer(dir, { config, silent: opts?.silent ?? false });
  await server.start();
  return server;
}

/** Khởi động server (không chờ signal) — dùng cho test và `serveCommand`. */
export async function startServe(dir: string, opts?: ServeOptions): Promise<ServeHandle> {
  const server = await startServer(dir, opts);
  return {
    url: server.url,
    async stop() {
      await server.stop();
    },
  };
}

export async function serveCommand(dir: string | undefined, opts?: ServeOptions): Promise<number> {
  if (dir === undefined || dir === '') {
    console.error('vcs serve: thiếu <dir> — dùng: vcs serve <dir> [--port N] [--host H] [--open]');
    return 3;
  }
  if (!(await isDirectory(dir))) {
    console.error(`vcs serve: không tìm thấy thư mục '${dir}'`);
    return 3;
  }
  let server: RunningServer;
  try {
    server = await startServer(dir, opts);
  } catch (err) {
    if (err instanceof ProjectInvalidError) {
      for (const d of err.diagnostics) console.log(formatDiagnostic(d));
      return 2;
    }
    if (err instanceof Error && err.message.startsWith('vcs serve:')) {
      console.error(err.message);
      return 3;
    }
    throw err;
  }
  if (server.config.host === '0.0.0.0') {
    console.warn(
      'vcs serve: cảnh báo — bind 0.0.0.0 mở server ra toàn mạng; M0 không có xác thực, chỉ dùng trên máy cục bộ/mạng tin cậy.',
    );
  }
  console.log(
    `vcs server đang chạy tại ${server.url} (project: ${server.service.snapshotProject().name})`,
  );
  if (opts?.open === true) {
    openBrowser(server.url);
  }
  await new Promise<void>((resolve) => {
    process.once('SIGINT', () => {
      resolve();
    });
    process.once('SIGTERM', () => {
      resolve();
    });
  });
  await server.stop();
  return 0;
}

function parseServeOptions(opts?: ServeOptions): ReturnType<typeof resolveServerConfig> {
  const o: ServeOptions = opts ?? {};
  const input: Parameters<typeof resolveServerConfig>[0] = {};
  if (o.port !== undefined) {
    if (!/^\d+$/.test(o.port)) {
      throw new Error(`vcs serve: --port phải là số nguyên 0..65535, nhận '${o.port}'`);
    }
    input.port = Number.parseInt(o.port, 10);
  }
  if (o.host !== undefined) {
    if (o.host.trim() === '') {
      throw new Error(`vcs serve: --host không được rỗng`);
    }
    input.host = o.host;
  }
  try {
    return resolveServerConfig(input);
  } catch (err) {
    if (err instanceof Error) throw new Error(`vcs serve: ${err.message}`);
    throw err;
  }
}

/** Mở trình duyệt hệ thống (OQ-043); lỗi → cảnh báo, server vẫn chạy. */
function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.unref();
    child.on('error', () => {
      console.warn(`vcs serve: không mở được trình duyệt cho ${url}`);
    });
  } catch {
    console.warn(`vcs serve: không mở được trình duyệt cho ${url}`);
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
