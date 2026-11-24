// Lệnh `vcs validate <dir> [--json]` — @vcs/cli (M0 §8.1).
// Nạp dự án, in diagnostics (`formatDiagnostic`); exit 0 (không có error;
// warning vẫn 0), 2 (có error), 3 (sai tham số/không tìm thấy thư mục).

import { stat } from 'node:fs/promises';
import { formatDiagnostic, hasErrors } from '@vcs/schemas';
import { loadProject, nodeFS } from '@vcs/project';

export interface ValidateOptions {
  json?: boolean;
}

export async function validateCommand(
  dir: string | undefined,
  opts?: ValidateOptions,
): Promise<number> {
  if (dir === undefined || dir === '') {
    console.error('vcs validate: thiếu <dir> — dùng: vcs validate <dir> [--json]');
    return 3;
  }
  if (!(await isDirectory(dir))) {
    console.error(`vcs validate: không tìm thấy thư mục '${dir}'`);
    return 3;
  }
  const model = await loadProject(nodeFS(dir));
  if (opts?.json === true) {
    console.log(
      JSON.stringify(
        { name: model.config.name, valid: model.valid, diagnostics: model.diagnostics },
        null,
        2,
      ),
    );
  } else {
    for (const d of model.diagnostics) console.log(formatDiagnostic(d));
    if (model.diagnostics.length === 0) {
      console.log(
        `OK: ${model.config.name} — ${String(model.tags.length)} tags, ` +
          `${String(model.config.controllers.length)} controllers`,
      );
    }
  }
  return hasErrors(model.diagnostics) ? 2 : 0;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
