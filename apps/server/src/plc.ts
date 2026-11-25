// Helper PLC dùng chung — @vcs/server (P1.7, OQ-202).
// Đọc `plc/*.scl` + `plc/*.lad.json` của project, biên dịch qua
// compileProject với tag từ catalog (OQ-198). SoftPlc KHÔNG thêm vào
// SERVER_EXTENSIONS tĩnh (OQ-155): extension được tạo động theo project
// khi plc/ tồn tại (xem server.ts). CLI `vcs run`/`vcs serve` dùng chung
// helper này qua @vcs/server.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { isIntrospectable, type SimulationBundle } from '@vcs/kernel';
import type { SimulationExtension } from '@vcs/kernel';
import type { IrProgram } from '@vcs/runtime-iec';
import { softPlcExtension } from '@vcs/runtime-iec';
import type { Diagnostic, TagDef } from '@vcs/schemas';
import { compileProject, type ProjectSourceFile } from '@vcs/vendor-siemens';

/** So sánh tên file không phân biệt hoa/thường (OQ-202, tên file Windows/TIA). */
function byName(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la < lb) return -1;
  if (la > lb) return 1;
  return 0;
}

/**
 * Liệt kê file PLC: `.scl` trước (theo tên tăng dần), rồi `.lad.json`
 * (theo tên tăng dần, LAD sau SCL — OQ-202). Trả đường dẫn tuyệt đối.
 * Không có thư mục plc/ → [].
 */
export async function discoverPlcFiles(dir: string): Promise<string[]> {
  const plcDir = join(dir, 'plc');
  let entries;
  try {
    entries = await readdir(plcDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = entries.filter((e) => e.isFile()).map((e) => e.name);
  const scl = names.filter((n) => n.endsWith('.scl')).sort(byName);
  const lad = names.filter((n) => n.endsWith('.lad.json')).sort(byName);
  return [...scl, ...lad].map((n) => join(plcDir, n));
}

export interface PlcLoadResult {
  program: IrProgram;
  diagnostics: readonly Diagnostic[];
  /** Đường dẫn tuyệt đối, thứ tự biên dịch. */
  files: string[];
}

/**
 * Biên dịch các file PLC trong một thư mục (`.scl` trước rồi `.lad.json`,
 * theo tên tăng dần không phân biệt hoa/thường — OQ-202). Tags từ catalog
 * để giải tên "NAME" (OQ-198). Không có file PLC → program rỗng.
 */
export async function compilePlcDir(
  plcDir: string,
  tags: readonly TagDef[],
): Promise<PlcLoadResult> {
  let entries;
  try {
    entries = await readdir(plcDir, { withFileTypes: true });
  } catch {
    return { program: emptyProgram(), diagnostics: [], files: [] };
  }
  const names = entries.filter((e) => e.isFile()).map((e) => e.name);
  const scl = names.filter((n) => n.endsWith('.scl')).sort(byName);
  const lad = names.filter((n) => n.endsWith('.lad.json')).sort(byName);
  const files = [...scl, ...lad].map((n) => join(plcDir, n));
  const sources: ProjectSourceFile[] = [];
  for (const f of files) {
    let text = await readFile(f, 'utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    text = text.replace(/\r\n?/g, '\n');
    sources.push({ path: basename(f), text });
  }
  const { program, diagnostics } = compileProject(sources, { tags: [...tags] });
  return { program, diagnostics, files };
}

function emptyProgram(): IrProgram {
  return { blocks: [], dbs: [], udts: [], organization: [] };
}

/**
 * Nạp + biên dịch plc/ của project. Không có file PLC → null (project
 * không PLC chạy như cũ). Tags từ catalog để giải tên "NAME" (OQ-198).
 */
export async function loadPlcProgram(
  dir: string,
  tags: readonly TagDef[],
): Promise<PlcLoadResult | null> {
  const files = await discoverPlcFiles(dir);
  if (files.length === 0) return null;
  return compilePlcDir(join(dir, 'plc'), tags);
}

/** Extension SoftPlc động cho một program đã biên dịch (OQ-155). */
export function plcExtension(program: IrProgram): SimulationExtension {
  return softPlcExtension(program);
}

/**
 * Start mọi controller introspectable (SoftPlc) — P1.7.
 *
 * SoftPlc nạp ở STOP (OQ-140) và chỉ golden runner gọi `start()` trước
 * P1.7, nên PLC qua server/CLI không bao giờ scan (scanCount luôn 0).
 * Service gọi ở run()/step(), CLI gọi ở runCommand trước khi chạy.
 * `start()` là no-op khi đã RUN, nên gọi lại sau pause an toàn; sau reset
 * lạnh PLC về STOP (resetAll gọi `reset()`) nên lần run/step kế start lại
 * (rebase lưới + OB100 chạy lại ở scan đầu — đúng ngữ nghĩa STOP→RUN).
 */
export function startPlcControllers(bundle: SimulationBundle): void {
  for (const c of bundle.controllers) {
    if (isIntrospectable(c)) c.start();
  }
}

/**
 * Ghi file PLC (POST /api/plc/files, OQ-208): chỉ cho phép đường dẫn nằm
 * trong `plc/` (chặn `..`/đường tuyệt đối); tạo thư mục con khi cần.
 * Trả đường dẫn tuyệt đối đã ghi. KHÔNG biên dịch lại PLC đang chạy
 * (không hot reload — OQ-208).
 */
export async function savePlcFile(
  dir: string,
  relPath: string,
  content: string,
): Promise<string> {
  const plcDir = resolve(dir, 'plc');
  const target = resolve(plcDir, relPath);
  if (target !== plcDir && !target.startsWith(plcDir + sep)) {
    throw new Error(`savePlcFile: đường dẫn '${relPath}' nằm ngoài thư mục plc/`);
  }
  if (target === plcDir) {
    throw new Error(`savePlcFile: đường dẫn '${relPath}' không phải file`);
  }
  const parent = target.slice(0, target.lastIndexOf(sep));
  if (parent.length > plcDir.length) await mkdir(parent, { recursive: true });
  await writeFile(target, content, 'utf8');
  return target;
}
