// Lệnh `vcs suggest [dir] [--accept-confident] [--json]` — @vcs/cli (M2 §10, P2.7 commit 6, OQ-372).
// Đọc tags.yaml của project → suggest() → in bảng (text) hoặc JSON.
// Không có --accept-confident → dry-run, KHÔNG ghi file.
// --accept-confident → áp dụng chỉ status confident (qua buildApplySuggestions
// + validatePlantConfig); lỗi validate → từ chối ghi, exit 1.
// Exit: 0 ok; 1 apply bị từ chối; 2 không chạy được (project/naming lỗi);
// 3 sai tham số. Dir mặc định cwd.

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  buildApplySuggestions,
  loadNamingConvention,
  NamingConventionError,
  serializeEquipment,
  serializeTags,
  suggest,
  tagDefsToInputs,
} from '@vcs/importers';
import { loadProject, nodeFS } from '@vcs/project';
import { formatDiagnostic, hasErrors, type Diagnostic } from '@vcs/schemas';

export interface SuggestOptions {
  acceptConfident?: boolean;
  json?: boolean;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function writeProjectFile(projectDir: string, rel: string, content: string): Promise<void> {
  const abs = join(projectDir, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf8');
}

function formatConfidence(conf: number): string {
  return conf.toFixed(2);
}

function printTextTable(
  result: ReturnType<typeof suggest>,
  apply: {
    applied: string[];
    filesWritten: string[];
    diagnostics: Diagnostic[];
  } | null,
): void {
  const s = result.stats;
  console.log(
    `suggest: ${String(s.totalTags)} tags → ${String(result.suggestions.length)} thiết bị ` +
      `(${String(s.confident)} confident, ${String(s.review)} review, ${String(s.unmatched)} unmatched), ` +
      `${String(s.assignedTags)} tags gán`,
  );
  console.log('equipment  model          conf  status     signals');
  for (const sug of result.suggestions) {
    const roles = sug.signals.map((x) => x.role).join(', ') || '-';
    console.log(
      `${sug.equipmentId.padEnd(11)}${sug.model.padEnd(15)}${formatConfidence(sug.confidence).padEnd(6)}${sug.status.padEnd(11)}${roles}`,
    );
    if (sug.modelCandidates !== undefined) {
      console.log(
        `  ứng viên: ${sug.modelCandidates.map((c) => `${c.model}=${c.score.toFixed(2)}`).join(', ')}`,
      );
    }
    if (sug.missingRequiredRoles.length > 0) {
      console.log(`  thiếu role bắt buộc: ${sug.missingRequiredRoles.join(', ')}`);
    }
  }
  if (result.unassignedTags.length > 0) {
    console.log(`chưa gán (${String(result.unassignedTags.length)}):`);
    for (const u of result.unassignedTags) {
      console.log(`  ${u.tag}: ${u.reasons.join('; ')}`);
    }
  }
  if (apply !== null) {
    for (const d of apply.diagnostics) console.log(formatDiagnostic(d));
    if (apply.applied.length > 0) {
      console.log(
        `apply: ${String(apply.applied.length)} thiết bị (${apply.applied.join(', ')}), ` +
          `ghi ${apply.filesWritten.join(' + ')}`,
      );
    } else {
      console.log('apply: không có suggestion confident — không ghi file');
    }
  }
}

export async function suggestCommand(dir: string | undefined, opts?: SuggestOptions): Promise<number> {
  const projectDir = dir === undefined || dir === '' ? process.cwd() : dir;
  if (!(await isDirectory(projectDir))) {
    console.error(`vcs suggest: không tìm thấy thư mục '${projectDir}'`);
    return 3;
  }
  const model = await loadProject(nodeFS(projectDir));
  if (hasErrors(model.diagnostics)) {
    for (const d of model.diagnostics) console.log(formatDiagnostic(d));
    return 2;
  }
  let naming;
  try {
    naming = await loadNamingConvention(projectDir);
  } catch (err) {
    if (err instanceof NamingConventionError) {
      console.error(`vcs suggest: ${err.message}`);
      return 2;
    }
    throw err;
  }
  if (naming.usedDefault && naming.warning !== undefined) {
    console.error(`vcs suggest: ${naming.warning}`);
  }
  const result = suggest(tagDefsToInputs(model.tags), naming.convention);

  let apply: {
    applied: string[];
    skipped: Array<{ equipmentId: string; model: string; reason: string }>;
    filesWritten: string[];
    diagnostics: Diagnostic[];
  } | null = null;
  if (opts?.acceptConfident === true) {
    const confident = result.suggestions.filter((sg) => sg.status === 'confident');
    if (confident.length === 0) {
      apply = { applied: [], skipped: [], filesWritten: [], diagnostics: [] };
    } else {
      const appliedResult = buildApplySuggestions(model.tags, model.plant ?? [], confident, {
        stepMs: model.config.simulation.stepMs,
        seed: model.config.seed,
        plcScanMs: model.config.simulation.plcScanMs,
      });
      if (hasErrors(appliedResult.diagnostics)) {
        for (const d of appliedResult.diagnostics) console.log(formatDiagnostic(d));
        console.error('vcs suggest: apply bị từ chối — không ghi file (sửa lỗi trên rồi chạy lại).');
        return 1;
      }
      const tagsRel = model.config.files.tags;
      const plantRel = model.config.files.plant;
      await writeProjectFile(projectDir, tagsRel, serializeTags(appliedResult.tags));
      await writeProjectFile(projectDir, plantRel, serializeEquipment(appliedResult.equipment));
      apply = {
        applied: appliedResult.applied,
        skipped: appliedResult.skipped,
        filesWritten: [tagsRel, plantRel],
        diagnostics: appliedResult.diagnostics,
      };
    }
  }

  if (opts?.json === true) {
    console.log(
      JSON.stringify(
        apply === null ? result : { ...result, apply },
        null,
        2,
      ),
    );
  } else {
    printTextTable(result, apply);
  }
  return 0;
}
