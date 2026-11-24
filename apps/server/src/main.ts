// Entry chạy server độc lập — @vcs/server (M0 §8.2).
// Tách riêng khỏi `index.ts` (entry thư viện, không side-effect): nếu để
// main-guard trong `index.ts`, khi @vcs/server bị bundle vào CLI thì
// `import.meta.url` chính là file dist của CLI và guard tưởng CLI là server
// (chạy main() thêm một lần với argv của CLI). Chạy: `node dist/main.js
// <dir> [--port N] [--host H]`; `vcs serve` là đường chính thức.

import { stat } from 'node:fs/promises';
import { createServer } from './index.js';
import { resolveServerConfig } from './config.js';

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function main(argv: string[]): Promise<number> {
  const dir = argv[0];
  if (dir === undefined || dir === '') {
    process.stderr.write('dùng: node dist/main.js <dir> [--port N] [--host H]\n');
    return 3;
  }
  if (!(await isDirectory(dir))) {
    process.stderr.write(`không tìm thấy thư mục '${dir}'\n`);
    return 3;
  }
  let port: number | undefined;
  let host: string | undefined;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1] !== undefined) {
      port = Number.parseInt(argv[i + 1] as string, 10);
      i += 1;
    } else if (argv[i] === '--host' && argv[i + 1] !== undefined) {
      host = argv[i + 1];
      i += 1;
    }
  }
  const config = resolveServerConfig({
    ...(port !== undefined ? { port } : {}),
    ...(host !== undefined ? { host } : {}),
  });
  const server = await createServer(dir, { config });
  await server.start();
  // Fastify tự log địa chỉ listen qua pino; không in banner riêng.
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

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 2;
  });
