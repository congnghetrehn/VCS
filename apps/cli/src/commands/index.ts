// Khung lệnh CLI — @vcs/cli (M0 §8.1, AMENDMENTS A14).
// Mỗi lệnh một file `commands/*.ts`; milestone sau thêm file vào đây.
// `serve` thuộc P0.5.

import { Command } from 'commander';
import { goldenRunCommand } from './golden.js';
import { importIoCommand } from './import-io.js';
import { plantRunCommand } from './plant.js';
import { runCommand } from './run.js';
import { serveCommand } from './serve.js';
import { validateCommand } from './validate.js';
import { irDumpCommand } from './ir.js';
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
    .option('--scans <n>', 'chạy tới khi PLC đủ N scan (P1.7, OQ-203)')
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
          scans?: string;
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

  const ir = program.command('ir').description('Lệnh liên quan tới IR (M1 §6)');
  ir.command('dump')
    .description('Biên dịch file SCL/thư mục ra IR JSON (exit 0 ok, 2 lỗi biên dịch, 3 sai tham số)')
    .argument('[file]', 'file SCL (.scl) hoặc thư mục project/plc (P1.7, OQ-204)')
    .option('--out <file>', 'ghi JSON ra file thay vì stdout')
    .action(async (file: string | undefined, opts: { out?: string }) => {
      process.exitCode = await irDumpCommand(file, opts);
    });

  const golden = program.command('golden').description('Lệnh liên quan tới golden YAML (M1 §12.1)');
  golden
    .command('run')
    .description('Chạy golden YAML (exit 0 pass, 1 có golden fail, 2 không chạy được)')
    .argument('[path]', 'file .golden.yaml hoặc thư mục chứa golden')
    .action(async (path: string | undefined) => {
      process.exitCode = await goldenRunCommand(path);
    });

  program
    .command('import-io')
    .description('Đọc I/O list CSV/XLSX, xem trước 50 dòng + mapping JSON (M2 §8; exit 0 ok, 1 commit bị từ chối, 2 lỗi đọc/header/profile, 3 sai tham số)')
    .argument('[file]', 'file CSV/XLSX')
    .option('--sheet <name>', 'tên sheet (XLSX)')
    .option('--profile <yaml>', 'file import-profile.yaml')
    .option('--json', 'in JSON thay cho text')
    .option('--commit', 'ghi tags.yaml + normalized CSV + profile + report (cần vcs.project.yaml)')
    .option('--report', 'chỉ validate + diff + report, không ghi tags.yaml')
    .option('--overwrite-manual', 'ghi đè tag provenance manual (với --commit/--report)')
    .action(async (file: string | undefined, opts: { sheet?: string; profile?: string; json?: boolean; commit?: boolean; report?: boolean; overwriteManual?: boolean }) => {
      process.exitCode = await importIoCommand(file, opts);
    });

  const plant = program.command('plant').description('Lệnh liên quan tới plant vòng kín (M2 §11.4)');
  plant
    .command('run')
    .description('Chạy kịch bản vòng kín (exit 0 pass, 1 có expect fail, 2 không chạy được, 3 sai tham số)')
    .argument('[dir]', 'thư mục dự án')
    .option('--scenario <file>', 'file scenario YAML (lặp được)', (v: string, acc: string[]) => [...acc, v], [] as string[])
    .option('--until <duration>', 'chạy tới thời gian mô phỏng (vd 5s)')
    .option('--steps <n>', 'số bước chạy')
    .option('--step-ms <n>', 'ghi đè stepMs của project/scenario')
    .option('--plc-scan-ms <n>', 'ghi đè plcScanMs của project/scenario')
    .option('--watch <tags>', 'tag cần in, ngăn bằng dấu phẩy')
    .option('--csv <file>', 'ghi chuỗi thay đổi ra file CSV')
    .option('--hash', 'in TraceHasher.hash() sau khi chạy')
    .option('--json', 'in JSON thay cho text')
    .action(
      async (
        dir: string | undefined,
        opts: {
          scenario?: string[];
          until?: string;
          steps?: string;
          stepMs?: string;
          plcScanMs?: string;
          watch?: string;
          csv?: string;
          hash?: boolean;
          json?: boolean;
        },
      ) => {
        process.exitCode = await plantRunCommand(dir, opts);
      },
    );

  return program;
}
