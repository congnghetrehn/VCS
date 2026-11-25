// `compileProject` — biên dịch toàn bộ chương trình PLC của một project
// (M1 §10, P1.7). Nguồn: `plc/*.scl` + `plc/*.lad.json`, biên dịch theo
// thứ tự tên file tăng dần, LAD sau SCL (DB phải có trước khi LAD tham
// chiếu — OQ-188/202). Mọi file dùng chung một `CompileContext` nên DB/block
// của file trước thấy được ở file sau; bảng tag của project (từ
// `tags.yaml` qua `buildTagAddressMap`) đưa vào ctx để `"NAME"` giải thành
// tag (OQ-198).
//
// Lỗi biên dịch: diagnostics gộp có file/line/col, biên dịch TIẾP các file
// còn lại để thu đủ lỗi (file sau có thể báo thêm T001 do block thiếu —
// đó là lỗi tầng, không phải lỗi giả). Caller kiểm `hasErrors(diagnostics)`
// và dừng ồn ào (CLI exit 2 / server không start), không chạy chương trình
// rỗng. File có đuôi khác bị bỏ qua (OQ-202).

import { diag, LAD_CATALOG, sortDiagnostics, type Diagnostic, type TagDef } from '@vcs/schemas';
import { buildTagAddressMap, type IrProgram } from '@vcs/runtime-iec';
import { compileLad } from '../lad/lower.js';
import { compileSclProgram, createCompileContext, programFromCtx } from './compile.js';

/** Một file nguồn của project: đường dẫn (dùng làm fileName trong
 * diagnostic + sắp xếp thứ tự biên dịch) + nội dung text. */
export interface ProjectSourceFile {
  path: string;
  text: string;
}

export interface CompileProjectOptions {
  /** Tag của project (thứ tự như `tags.yaml`); dùng cho OQ-198. */
  tags: readonly TagDef[];
}

export interface CompileProjectResult {
  /** Chương trình tích lũy (kể cả khi có lỗi — caller phải kiểm
   * diagnostics trước khi dùng). */
  program: IrProgram;
  diagnostics: Diagnostic[];
}

/** Sắp xếp theo tên file tăng dần, không phân biệt hoa/thường (OQ-202):
 * trên Windows/TIA tên file không phân biệt hoa/thường, và thứ tự này
 * đưa `db.scl` lên trước `OB1.scl` để DB tồn tại khi OB biên dịch. */
function byPath(a: ProjectSourceFile, b: ProjectSourceFile): number {
  const pa = a.path.toLowerCase();
  const pb = b.path.toLowerCase();
  return pa < pb ? -1 : pa > pb ? 1 : 0;
}

export function compileProject(
  files: readonly ProjectSourceFile[],
  opts: CompileProjectOptions,
): CompileProjectResult {
  const ctx = createCompileContext();
  ctx.tags = buildTagAddressMap(opts.tags);
  const diagnostics: Diagnostic[] = [];
  const sclFiles = files.filter((f) => f.path.endsWith('.scl')).sort(byPath);
  const ladFiles = files.filter((f) => f.path.endsWith('.lad.json')).sort(byPath);
  for (const file of sclFiles) {
    const result = compileSclProgram(file.text, file.path, ctx);
    diagnostics.push(...result.diagnostics);
  }
  for (const file of ladFiles) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.text) as unknown;
    } catch {
      diagnostics.push(
        diag(
          'LAD-S001',
          'error',
          `file LAD không phải JSON hợp lệ: '${file.path}'`,
          { file: file.path, line: 1, col: 1, endLine: 1, endCol: 2 },
          LAD_CATALOG.get('LAD-S001')?.hint,
        ),
      );
      continue;
    }
    const result = compileLad(parsed, { ctx, tags: [...opts.tags], fileName: file.path });
    diagnostics.push(...result.diagnostics);
  }
  return { program: programFromCtx(ctx), diagnostics: sortDiagnostics(diagnostics) };
}
