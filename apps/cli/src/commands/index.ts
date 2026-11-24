// Khung lệnh CLI — @vcs/cli (M0 §8.1, AMENDMENTS A14).
// Mỗi lệnh một file `commands/*.ts`; milestone sau thêm file vào đây.
// `serve` thuộc P0.5.

import { Command } from 'commander';
import { runCommand } from './run.js';
import { serveCommand } from './serve.js';
import { validateCommand } from './validate.js';
import { VERSION, versionCommand } from './version.js';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('vcs')
    .description('Virtual Commissioning Studio — mô phỏng điều khiển trước commissioning')
    .version(VERSION);

  program
    .command('version')
    .description('In phiên bản')
    .action(() => {
      process.exitCode = versionCommand();
    });

  program
    .command('validate')
    .description('Nạp dự án và in diagnostics (exit 0 ok, 2 có error, 3 sai tham số)')
    .argument('[dir]', 'thư mục dự án')
    .option('--json', 'in JSON')
    .action(async (dir: string | undefined, opts: { json?: boolean }) => {
      process.exitCode = await validateCommand(dir, opts);
    });

  program
    .command('run')
    .description('Chạy mô phỏng headless (exit 0 ok, 2 project lỗi, 3 sai tham số)')
    .argument('[dir]', 'thư mục dự án')
    .option('--steps <n>', 'số bước chạy')
    .option('--until <duration>', 'chạy tới thời gian mô phỏng (vd 5s)')
    .option('--step-ms <n>', 'ghi đè stepMs của project')
    .option('--watch <tags>', 'tag cần in, ngăn bằng dấu phẩy')
    .option('--csv <file>', 'ghi chuỗi thay đổi ra file CSV')
    .option('--hash', 'in TraceHasher.hash() sau khi chạy')
    .option('--json', 'in JSON thay cho text')
    .action(
      async (
        dir: string | undefined,
        opts: {
          steps?: string;
          until?: string;
          stepMs?: string;
          watch?: string;
          csv?: string;
          hash?: boolean;
          json?: boolean;
        },
      ) => {
        process.exitCode = await runCommand(dir, opts);
      },
    );

  program
    .command('serve')
    .description(
      'Chạy server REST + WebSocket (exit 0 dừng bằng signal, 2 project lỗi, 3 sai tham số)',
    )
    .argument('[dir]', 'thư mục dự án')
    .option('--port <n>', 'cổng lắng nghe (mặc định 4170, env VCS_PORT)')
    .option('--host <h>', 'host bind (mặc định 127.0.0.1, env VCS_HOST)')
    .option('--open', 'mở trình duyệt sau khi khởi động')
    .action(
      async (dir: string | undefined, opts: { port?: string; host?: string; open?: boolean }) => {
        process.exitCode = await serveCommand(dir, opts);
      },
    );

  return program;
}
