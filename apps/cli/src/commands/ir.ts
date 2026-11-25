// Lệnh `vcs ir dump <file.scl>` — @vcs/cli (M1 §6, P1.3).
// Biên dịch một file SCL → IR JSON ổn định (irToJson). Exit: 0 ok,
// 2 lỗi biên dịch (parse/typecheck), 3 thiếu file/tham số sai (đúng quy
// ước run.ts P0.4). JSON ra stdout thuần (không lẫn diagnostics — warning
// in ra stderr để stdout parse được đúng golden).

import { readFile, writeFile } from 'node:fs/promises';
import { formatDiagnostic, hasErrors } from '@vcs/schemas';
import { compileSclProgram, irToJson } from '@vcs/vendor-siemens';

export interface IrDumpOptions {
  out?: string;
}

export async function irDumpCommand(file: string | undefined, opts?: IrDumpOptions): Promise<number> {
  if (file === undefined || file === '') {
    console.error('vcs ir dump: thiếu <file.scl> — dùng: vcs ir dump <file.scl> [--out <file>]');
    return 3;
  }
  let source: string;
  try {
    source = await readFile(file, 'utf8');
  } catch {
    console.error(`vcs ir dump: không đọc được file '${file}'`);
    return 3;
  }
  // Chuẩn hóa BOM/CRLF như loadProject (P0.2).
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
  source = source.replace(/\r\n?/g, '\n');
  const { program, diagnostics } = compileSclProgram(source, file);
  if (hasErrors(diagnostics)) {
    for (const d of diagnostics) console.log(formatDiagnostic(d));
    return 2;
  }
  // Chỉ còn warning (W001): in ra stderr để stdout giữ đúng JSON.
  for (const d of diagnostics) console.error(formatDiagnostic(d));
  const json = irToJson(program);
  if (opts?.out !== undefined) {
    try {
      await writeFile(opts.out, json, 'utf8');
    } catch {
      console.error(`vcs ir dump: không ghi được file '${opts.out}'`);
      return 3;
    }
    return 0;
  }
  process.stdout.write(json);
  return 0;
}
