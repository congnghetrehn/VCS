// Lệnh `vcs ir dump <file.scl|dir>` — @vcs/cli (M1 §6, P1.3, P1.7).
// Biên dịch một file SCL → IR JSON ổn định (irToJson). Exit: 0 ok,
// 2 lỗi biên dịch (parse/typecheck), 3 thiếu file/tham số sai (đúng quy
// ước run.ts P0.4). JSON ra stdout thuần (không lẫn diagnostics — warning
// in ra stderr để stdout parse được đúng golden).
// P1.7 (OQ-204): `<dir>` = thư mục project (có plc/ → biên dịch plc/ với
// tag từ catalog) hoặc thư mục plc trực tiếp (biên dịch file trong đó,
// không có tag). Cả hai dùng compileProject.

import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { formatDiagnostic, hasErrors, type Diagnostic } from '@vcs/schemas';
import { compilePlcDir, loadPlcProgram } from '@vcs/server';
import { loadProject, nodeFS } from '@vcs/project';
import { compileSclProgram, irToJson } from '@vcs/vendor-siemens';
import type { IrProgram } from '@vcs/runtime-iec';

export interface IrDumpOptions {
  out?: string;
}

export async function irDumpCommand(file: string | undefined, opts?: IrDumpOptions): Promise<number> {
  if (file === undefined || file === '') {
    console.error('vcs ir dump: thiếu <file.scl|dir> — dùng: vcs ir dump <file.scl|dir> [--out <file>]');
    return 3;
  }
  // P1.7 (OQ-204): thư mục → compileProject.
  let st;
  try {
    st = await stat(file);
  } catch {
    console.error(`vcs ir dump: không đọc được '${file}'`);
    return 3;
  }
  if (st.isDirectory()) {
    return irDumpDir(file, opts);
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
  return writeIrJson(program, opts);
}

async function writeIrJson(program: IrProgram, opts?: IrDumpOptions): Promise<number> {
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

/** P1.7 (OQ-204): `ir dump <dir>` = compileProject. */
async function irDumpDir(dir: string, opts?: IrDumpOptions): Promise<number> {
  let program: IrProgram;
  let diagnostics: readonly Diagnostic[];
  if (existsSync(join(dir, 'plc'))) {
    // Thư mục project: tag từ catalog (OQ-198) + plc/ bên trong.
    const model = await loadProject(nodeFS(dir));
    if (hasErrors(model.diagnostics)) {
      for (const d of model.diagnostics) console.log(formatDiagnostic(d));
      return 2;
    }
    const loaded = await loadPlcProgram(dir, model.catalog.all());
    if (loaded === null) {
      console.error(`vcs ir dump: thư mục '${dir}' không có file plc/`);
      return 3;
    }
    program = loaded.program;
    diagnostics = loaded.diagnostics;
  } else {
    // Thư mục plc trực tiếp: biên dịch file trong đó, không có tag.
    const loaded = await compilePlcDir(dir, []);
    if (loaded.files.length === 0) {
      console.error(`vcs ir dump: thư mục '${dir}' không có file .scl/.lad.json`);
      return 3;
    }
    program = loaded.program;
    diagnostics = loaded.diagnostics;
  }
  if (hasErrors(diagnostics)) {
    for (const d of diagnostics) console.log(formatDiagnostic(d));
    return 2;
  }
  for (const d of diagnostics) console.error(formatDiagnostic(d));
  return writeIrJson(program, opts);
}
