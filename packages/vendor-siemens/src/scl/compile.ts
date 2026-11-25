// Compile SCL → IR — @vcs/vendor-siemens (M1 §10, P1.3).
// Pipeline: parseScl → (lỗi parse → dừng, không lower) → typecheckFile →
// (lỗi typecheck → dừng, không lower) → lowerFile → cập nhật ctx.
// Warning (SCL-W001) không chặn. Diagnostics gộp (parse + typecheck) và
// sắp xếp theo vị trí. `ctx` là bảng tích lũy qua các lần compile cùng
// chương trình — compileSclProgram trả toàn bộ ctx sau khi lower.

import type { IrBlock, IrProgram } from '@vcs/runtime-iec';
import type { Diagnostic } from '@vcs/schemas';
import { hasErrors, sortDiagnostics } from '@vcs/schemas';
import { parseScl } from './parser.js';
import { emptyCrossFileTables, typecheckFile } from './typecheck.js';
import type { CrossFileTables } from './typecheck.js';
import { lowerFile } from './lower.js';

/** Bảng tra cứu tích lũy qua các lần compile cùng chương trình (cùng hình
 * với `CrossFileTables` ở typecheck.ts — định nghĩa lại ở đây để tránh
 * import vòng typecheck ↔ compile; xem STATE §18 "Lệch so với plan"). */
export type CompileContext = CrossFileTables;

export function createCompileContext(): CompileContext {
  return emptyCrossFileTables();
}

export function programFromCtx(ctx: CompileContext): IrProgram {
  const byId = (a: { id: string }, b: { id: string }): number =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const blocks = [...ctx.blocks.values()].sort(byId);
  const dbs = [...ctx.dbs.values()].sort(byId);
  const udts = [...ctx.udts.values()].sort(byId);
  const organization = blocks
    .filter((b): b is IrBlock & { number: number } => b.kind === 'OB' && b.number !== undefined)
    .map((b) => ({ ob: b.number, block: b.name }))
    .sort((a, b) => a.ob - b.ob);
  return { blocks, dbs, udts, organization };
}

function updateCtx(ctx: CompileContext, program: IrProgram): void {
  for (const u of program.udts) ctx.udts.set(u.name.toLowerCase(), u);
  for (const d of program.dbs) ctx.dbs.set(d.name.toLowerCase(), d);
  for (const b of program.blocks) ctx.blocks.set(b.name.toLowerCase(), b);
}

/** Biên dịch một file SCL → các block IR (đúng chữ ký M1 §10: chỉ OB/FC/FB
 * của file này; UDT/DB nằm trong ctx, lấy qua compileSclProgram). */
export function compileScl(
  source: string,
  fileName: string,
  ctx: CompileContext = createCompileContext(),
): { blocks: IrBlock[]; diagnostics: Diagnostic[] } {
  const parsed = parseScl(source, fileName);
  if (hasErrors(parsed.diagnostics)) {
    return { blocks: [], diagnostics: sortDiagnostics(parsed.diagnostics) };
  }
  const checked = typecheckFile(parsed.ast, fileName, ctx);
  const diagnostics = sortDiagnostics([...parsed.diagnostics, ...checked.diagnostics]);
  if (hasErrors(checked.diagnostics)) {
    return { blocks: [], diagnostics };
  }
  const program = lowerFile(parsed.ast, checked, fileName);
  updateCtx(ctx, program);
  return { blocks: program.blocks, diagnostics };
}

/** Biên dịch một file SCL → toàn bộ IrProgram tích lũy trong ctx (kể cả
 * UDT/DB và block của các file đã biên dịch trước với cùng ctx). */
export function compileSclProgram(
  source: string,
  fileName: string,
  ctx: CompileContext = createCompileContext(),
): { program: IrProgram; diagnostics: Diagnostic[] } {
  const parsed = parseScl(source, fileName);
  if (hasErrors(parsed.diagnostics)) {
    return { program: programFromCtx(ctx), diagnostics: sortDiagnostics(parsed.diagnostics) };
  }
  const checked = typecheckFile(parsed.ast, fileName, ctx);
  const diagnostics = sortDiagnostics([...parsed.diagnostics, ...checked.diagnostics]);
  if (hasErrors(checked.diagnostics)) {
    return { program: programFromCtx(ctx), diagnostics };
  }
  const program = lowerFile(parsed.ast, checked, fileName);
  updateCtx(ctx, program);
  return { program: programFromCtx(ctx), diagnostics };
}

/** JSON ổn định theo từng byte: sort key đệ quy + indent 2 + newline cuối.
 * Thứ tự mảng (blocks/dbs/udts/organization) đã sắp xếp lúc build program. */
export function irToJson(program: IrProgram): string {
  return `${JSON.stringify(sortDeep(program), null, 2)}\n`;
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = sortDeep(record[key]);
    }
    return out;
  }
  return value;
}
