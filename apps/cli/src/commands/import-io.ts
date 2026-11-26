// Lệnh `vcs import-io <file>` — @vcs/cli (M2 §8, P2.5 commit 6, OQ-339; P2.6 commit 6: --commit/--report/--overwrite-manual).
// Đọc I/O list CSV/XLSX → dò header → gợi ý mapping → transform → in
// preview 50 dòng + mapping JSON. `--commit`/`--report` chạy thêm
// validate (§8.7) + diff (§8.8) + ghi tags.yaml/normalized/profile/report.
// Exit: 0 ok, 1 commit bị từ chối (lỗi validate/safety-net/dự án hỏng),
// 2 lỗi đọc/header/profile/không có project cho --commit, 3 sai tham số (mirror run/plant).

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { loadProject, nodeFS } from '@vcs/project';
import { formatDiagnostic, hasErrors, sortDiagnostics, type Diagnostic, type TagDef } from '@vcs/schemas';
import {
  applyCommit,
  applyFillDown,
  applyTransforms,
  buildProfile,
  buildReport,
  columnIndexToLetter,
  detectFillDownColumns,
  detectHeader,
  diffTags,
  extractDeriveColumns,
  gridToRecords,
  ImportReadError,
  loadProfile,
  matchesProfile,
  normalizeColumnName,
  readCsvFile,
  readXlsxFile,
  recordRowNumbers,
  reportToHtml,
  reportToJson,
  safetyNetCheck,
  saveProfile,
  serializeTags,
  suggestMapping,
  validateImport,
  type AssignedTag,
  type CanonicalField,
  type ImportProfile,
  type IoRecord,
  type MappingSuggestion,
  type NormalizedSignal,
  type RawGrid,
  type TransformChange,
  type ValidateResult,
} from '@vcs/importers';

export interface ImportIoOptions {
  sheet?: string;
  profile?: string;
  json?: boolean;
  /** Ghi tags.yaml + normalized CSV + profile + report (cần project). */
  commit?: boolean;
  /** Chỉ validate + diff + report, không ghi tags.yaml. */
  report?: boolean;
  /** Ghi đè tag provenance manual (chỉ có nghĩa với --commit/--report). */
  overwriteManual?: boolean;
}

interface MappingDisplay {
  field: string;
  column: string;
  source: 'profile' | 'suggest';
  confidence: 'high' | 'medium';
  reason: string;
}

function headerCells(grid: RawGrid, headerRow: number): string[] {
  const idx = grid.rowNumbers?.indexOf(headerRow) ?? headerRow - 1;
  const row = grid.rows[idx] ?? [];
  return row.map((c) => (typeof c === 'string' ? c : c === null ? '' : String(c)));
}

function formatValue(v: string | number | boolean | null): string {
  if (v === null) return '(trống)';
  if (typeof v === 'string') {
    const s = v.length > 24 ? `${v.slice(0, 24)}…` : v;
    return `"${s}"`;
  }
  return String(v);
}

function previewValue(v: string | number | boolean | null): string {
  if (v === null) return '(trống)';
  const s = String(v);
  return s.length > 24 ? `${s.slice(0, 24)}…` : s;
}

export async function importIoCommand(file: string | undefined, opts?: ImportIoOptions): Promise<number> {
  const o: ImportIoOptions = opts ?? {};
  if (file === undefined || file === '') {
    console.error('vcs import-io: thiếu <file> — dùng: vcs import-io <file> [--sheet X] [--profile <yaml>] [--json]');
    return 3;
  }
  const lower = file.toLowerCase();
  const isCsv = lower.endsWith('.csv');
  const isXlsx = lower.endsWith('.xlsx');
  if (!isCsv && !isXlsx) {
    if (lower.endsWith('.xls')) {
      console.error('vcs import-io: chỉ hỗ trợ .xlsx (không đọc được .xls cũ) và .csv');
    } else {
      console.error('vcs import-io: chỉ hỗ trợ file .csv/.xlsx');
    }
    return 3;
  }
  if (isCsv && o.sheet !== undefined) {
    console.error('vcs import-io: cảnh báo: --sheet chỉ dùng cho XLSX, bỏ qua với CSV');
  }

  let profile: ImportProfile | undefined;
  if (o.profile !== undefined) {
    try {
      const text = await readFile(o.profile, 'utf-8');
      profile = loadProfile(text);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`vcs import-io: không đọc được profile ${o.profile}: ${detail}`);
      return 2;
    }
  }

  let grid: RawGrid;
  try {
    if (isCsv) {
      grid = await readCsvFile(
        file,
        profile?.delimiter !== undefined && profile.delimiter !== 'auto'
          ? { delimiter: profile.delimiter }
          : {},
      );
    } else {
      grid = await readXlsxFile(file, o.sheet !== undefined ? { sheet: o.sheet } : {});
    }
  } catch (err) {
    if (err instanceof ImportReadError) {
      console.error(`vcs import-io: ${err.message}`);
      return 2;
    }
    throw err;
  }

  // Header: tự dò; profile (nếu khớp) có thể ghi đè headerRow/firstDataRow.
  const guess = detectHeader(grid);
  if (profile !== undefined) {
    const matchHeaders =
      guess !== null
        ? headerCells(grid, guess.headerRow)
        : profile.headerRow !== undefined
          ? headerCells(grid, profile.headerRow)
          : null;
    if (matchHeaders === null) {
      console.error(
        'vcs import-io: không tìm thấy dòng header (cần ≥ 3 khớp synonym) và profile không có headerRow — chỉnh headerRow trong profile',
      );
      return 2;
    }
    if (!matchesProfile(profile, grid.origin.sheet, matchHeaders)) {
      if (guess === null) {
        console.error('vcs import-io: profile không khớp file và không dò được header tự động — chỉnh profile (sheet/header) rồi chạy lại');
        return 2;
      }
      console.error(
        'vcs import-io: cảnh báo: profile không khớp file (sheet/header) — bỏ qua profile, dùng gợi ý tự động',
      );
      profile = undefined;
    }
  }
  const headerRow = profile?.headerRow ?? guess?.headerRow;
  const firstDataRow = profile?.firstDataRow ?? guess?.firstDataRow;
  if (headerRow === undefined || firstDataRow === undefined) {
    console.error(
      'vcs import-io: không tìm thấy dòng header (cần ≥ 3 khớp synonym) — chỉnh headerRow trong profile (--profile) rồi chạy lại',
    );
    return 2;
  }

  // Fill-down: profile (theo tên) ưu tiên, không thì tự phát hiện merge dọc
  // ở cột station/area.
  const headers = headerCells(grid, headerRow);
  let fillDownLetters: string[];
  if (profile !== undefined && profile.fillDownColumns.length > 0) {
    fillDownLetters = [];
    for (const name of profile.fillDownColumns) {
      const col = headers.findIndex((h) => normalizeColumnName(h) === normalizeColumnName(name));
      if (col < 0) {
        console.error(`vcs import-io: cảnh báo: fillDownColumns '${name}' không khớp cột nào — bỏ qua`);
        continue;
      }
      fillDownLetters.push(columnIndexToLetter(col));
    }
  } else {
    fillDownLetters = detectFillDownColumns(grid, headerRow);
  }
  if (fillDownLetters.length > 0) grid = applyFillDown(grid, fillDownLetters);

  // Mapping: profile (nếu có) ưu tiên, không thì gợi ý tự động.
  let mappingDisplay: MappingDisplay[];
  let mappingRecord: Partial<Record<CanonicalField, string>>;
  let autoSuggestions: MappingSuggestion[] = [];
  if (profile !== undefined && Object.keys(profile.mapping).length > 0) {
    mappingRecord = profile.mapping;
    mappingDisplay = Object.entries(profile.mapping).map(([field, column]) => ({
      field,
      column,
      source: 'profile' as const,
      confidence: 'high' as const,
      reason: `theo profile ${profile.name}`,
    }));
  } else {
    const suggestions: MappingSuggestion[] = suggestMapping(grid, headerRow);
    autoSuggestions = suggestions;
    mappingRecord = {};
    mappingDisplay = suggestions.map((s) => {
      mappingRecord[s.field] = s.column;
      return { field: s.field, column: s.column, source: 'suggest' as const, confidence: s.confidence, reason: s.reason };
    });
  }
  if (mappingDisplay.length === 0) {
    console.error('vcs import-io: cảnh báo: không gợi ý được mapping cho field nào — kiểm tra dòng header');
  }

  const records = gridToRecords(grid, headerRow, firstDataRow, mappingRecord, profile?.lastDataRow ?? null);
  const { rows: transformed, changed } = applyTransforms(records, profile?.transforms ?? []);

  // --commit/--report: validate + diff + (ghi) + report (P2.6 §8.7/§8.8).
  if (o.commit === true || o.report === true) {
    return runCommitOrReport({
      file,
      isCsv,
      grid,
      headerRow,
      firstDataRow,
      profile,
      autoSuggestions,
      mappingDisplay,
      transformed,
      changed,
      totalRows: records.length,
      opts: o,
    });
  }

  const preview = transformed.slice(0, 50);

  if (o.json === true) {
    console.log(
      JSON.stringify(
        {
          file,
          sheet: grid.origin.sheet ?? null,
          format: isCsv ? 'csv' : 'xlsx',
          encoding: grid.meta?.encoding ?? 'auto',
          delimiter: grid.meta?.delimiter ?? 'auto',
          headerRow,
          firstDataRow,
          lastDataRow: profile?.lastDataRow ?? null,
          gridRows: grid.rows.length,
          totalRows: records.length,
          mapping: mappingDisplay,
          preview,
          changed,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const formatLine = isCsv
    ? `File: ${file} (CSV, encoding ${grid.meta?.encoding ?? 'auto'}, delimiter '${grid.meta?.delimiter ?? 'auto'}')`
    : `File: ${file} (XLSX, sheet "${grid.origin.sheet ?? ''}", ${String(grid.sheets?.length ?? 0)} sheet)`;
  console.log(formatLine);
  console.log(`Lưới: ${String(grid.rows.length)} dòng · Header: dòng ${String(headerRow)} · Dữ liệu từ dòng ${String(firstDataRow)} · Bản ghi: ${String(records.length)}`);
  console.log(`Mapping (${String(mappingDisplay.length)} field):`);
  const fieldWidth = Math.max(0, ...mappingDisplay.map((m) => m.field.length));
  for (const m of mappingDisplay) {
    console.log(`  ${m.field.padEnd(fieldWidth)} <- ${m.column} [${m.confidence}, ${m.source}] ${m.reason}`);
  }
  console.log(`Preview (${String(preview.length)}/${String(records.length)} bản ghi):`);
  const fields = mappingDisplay.map((m) => m.field);
  preview.forEach((record, i) => {
    const parts = fields.map((f) => `${f}=${previewValue(record[f] ?? null)}`);
    console.log(`  #${String(i + 1)} ${parts.join(' ')}`);
  });
  console.log(`Thay đổi do transform (${String(changed.length)}):`);
  const shown = changed.slice(0, 20);
  for (const c of shown) {
    console.log(`  #${String(c.row + 1)} ${c.field}: ${formatValue(c.from)} → ${formatValue(c.to)} (${c.op})`);
  }
  if (changed.length > shown.length) {
    console.log(`  … và ${String(changed.length - shown.length)} thay đổi nữa`);
  }
  return 0;
}

// --- Flow --commit/--report (P2.6 §8.7/§8.8) ---

/** Đi lên từ thư mục chứa file import để tìm `vcs.project.yaml`. */
async function findProjectRoot(startDir: string): Promise<string | null> {
  let dir = resolve(startDir);
  for (;;) {
    try {
      await access(join(dir, 'vcs.project.yaml'));
      return dir;
    } catch {
      // Không có ở đây — đi lên thư mục cha.
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Timestamp local `YYYYMMDD-HHmmss` cho tên file report (wall time, cho phép ở apps/*). */
function formatTimestamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** CSV chuẩn hóa: 1 dòng / tín hiệu (địa chỉ/kind đã chuẩn hóa). */
function toNormalizedCsv(signals: NormalizedSignal[]): string {
  const header = 'tag,address,kind,type,controller,description,engMin,engMax,equipment,originRow';
  const lines = signals.map((s) => {
    const desc =
      s.tagDef?.description ??
      (typeof s.record['description'] === 'string' ? s.record['description'] : '');
    const equip = typeof s.record['equipment'] === 'string' ? s.record['equipment'] : '';
    const cells = [
      s.tag,
      s.address?.canonical ?? '',
      s.kind ?? '',
      s.tagDef?.type ?? '',
      s.controller,
      desc,
      s.engMin === null ? '' : String(s.engMin),
      s.engMax === null ? '' : String(s.engMax),
      equip,
      String(s.row),
    ];
    return cells.map(csvCell).join(',');
  });
  return `${[header, ...lines].join('\n')}\n`;
}

/** Gộp thêm diagnostics (safety net) vào kết quả validate cho report. */
function withExtraDiagnostics(validated: ValidateResult, extra: Diagnostic[]): ValidateResult {
  if (extra.length === 0) return validated;
  const diagnostics = sortDiagnostics([...validated.diagnostics, ...extra]);
  const diagnosticsByCode: Record<string, number> = { ...validated.stats.diagnosticsByCode };
  for (const d of extra) diagnosticsByCode[d.code] = (diagnosticsByCode[d.code] ?? 0) + 1;
  return {
    ...validated,
    diagnostics,
    stats: {
      ...validated.stats,
      errors: validated.stats.errors + extra.filter((d) => d.severity === 'error').length,
      warnings: validated.stats.warnings + extra.filter((d) => d.severity === 'warning').length,
      infos: validated.stats.infos + extra.filter((d) => d.severity === 'info').length,
      diagnosticsByCode,
    },
  };
}

interface CommitFlowInput {
  file: string;
  isCsv: boolean;
  grid: RawGrid;
  headerRow: number;
  firstDataRow: number;
  profile: ImportProfile | undefined;
  autoSuggestions: MappingSuggestion[];
  mappingDisplay: MappingDisplay[];
  transformed: IoRecord[];
  changed: TransformChange[];
  totalRows: number;
  opts: ImportIoOptions;
}

async function runCommitOrReport(input: CommitFlowInput): Promise<number> {
  const { file, grid, headerRow, firstDataRow, profile, opts } = input;
  const doCommit = opts.commit === true;

  // 1. Tìm project (đi lên từ thư mục chứa file import).
  const projectRoot = await findProjectRoot(dirname(resolve(file)));
  if (projectRoot === null && doCommit) {
    console.error(
      `vcs import-io: --commit cần vcs.project.yaml — không tìm thấy khi đi lên từ ${dirname(resolve(file))}`,
    );
    return 2;
  }
  if (projectRoot === null) {
    console.error(
      'vcs import-io: cảnh báo: không có vcs.project.yaml — --report chạy với baseline rỗng (không diff với tags.yaml)',
    );
  }
  const outRoot = projectRoot ?? process.cwd();

  // 2. Nạp project (nếu có) — baseline hỏng → từ chối (TC-2).
  let oldTags: TagDef[] = [];
  let declaredControllers: string[] | undefined;
  const assignedTags: AssignedTag[] = [];
  let defaultController: string | undefined;
  let tagsRel = 'tags/tags.yaml';
  if (projectRoot !== null) {
    const model = await loadProject(nodeFS(projectRoot));
    if (!model.valid) {
      console.error('vcs import-io: dự án baseline không hợp lệ — không commit/report:');
      for (const d of model.diagnostics) console.error(`  ${formatDiagnostic(d)}`);
      return 1;
    }
    oldTags = model.tags;
    tagsRel = model.config.files.tags;
    // controllers là ControllerDef[] ({id, mode, vendor…}) — chỉ lấy id.
    const controllerIds = model.config.controllers.map((c) => c.id);
    if (controllerIds.length > 0) {
      declaredControllers = controllerIds;
      defaultController = controllerIds[0];
    }
    for (const eq of model.plant ?? []) {
      for (const [role, tag] of Object.entries(eq.signals ?? {})) {
        assignedTags.push({ tag, equipment: eq.id, role });
      }
    }
  }

  // 3. Validate (§8.7).
  const rowNumbers = recordRowNumbers(grid, firstDataRow, profile?.lastDataRow ?? null);
  const deriveColumns =
    profile?.addressDerive !== undefined
      ? extractDeriveColumns(grid, headerRow, firstDataRow, profile.lastDataRow ?? null, profile.addressDerive)
      : undefined;
  const origin: { file: string; sheet?: string } = { file };
  if (grid.origin.sheet !== undefined) origin.sheet = grid.origin.sheet;
  // exactOptionalPropertyTypes: chỉ gán key khi có giá trị thật.
  const validateArgs: Parameters<typeof validateImport>[0] = {
    records: input.transformed,
    rowNumbers,
    origin,
  };
  if (profile !== undefined) validateArgs.profile = profile;
  if (declaredControllers !== undefined) validateArgs.declaredControllers = declaredControllers;
  if (assignedTags.length > 0) validateArgs.assignedTags = assignedTags;
  if (defaultController !== undefined) validateArgs.defaultController = defaultController;
  if (deriveColumns !== undefined) validateArgs.deriveColumns = deriveColumns;
  const validated = validateImport(validateArgs);

  // 4. Diff (§8.8).
  // exactOptionalPropertyTypes: chỉ gán key khi có giá trị thật.
  const diffArgs: Parameters<typeof diffTags>[2] = {};
  if (opts.overwriteManual !== undefined) diffArgs.overwriteManual = opts.overwriteManual;
  const diff = diffTags(oldTags, validated.signals, diffArgs);

  // 5. Gate commit: lỗi validate → từ chối; safety net từ chối → từ chối.
  const hasValidateErrors = hasErrors(validated.diagnostics);
  let newTags: TagDef[] | null = null;
  let netDiags: Diagnostic[] = [];
  let refusedReason: string | null = null;
  if (doCommit) {
    if (hasValidateErrors) {
      refusedReason = `validate có ${String(validated.stats.errors)} lỗi — sửa I/O list rồi chạy lại`;
    } else {
      newTags = applyCommit(oldTags, diff, validated.signals);
      netDiags = safetyNetCheck(newTags, tagsRel);
      if (hasErrors(netDiags)) {
        refusedReason = 'safety net từ chối danh sách tag mới (xem diagnostics trong report)';
      }
    }
  }

  // 6. Chuẩn bị file ghi (tên report biết trước để ghi vào filesWritten).
  const timestamp = formatTimestamp(new Date());
  const reportJsonRel = `reports/import-${timestamp}.json`;
  const reportHtmlRel = `reports/import-${timestamp}.html`;
  const toWrite: { rel: string; content: string }[] = [];
  if (doCommit && refusedReason === null && newTags !== null) {
    toWrite.push({ rel: tagsRel, content: serializeTags(newTags) });
    toWrite.push({ rel: 'io/io-list.normalized.csv', content: toNormalizedCsv(validated.signals) });
    const effectiveProfile =
      profile ??
      buildProfile(grid, headerRow, firstDataRow, input.autoSuggestions, {
        name: basename(file).replace(/\.[^.]+$/, ''),
        file,
      });
    toWrite.push({ rel: 'io/import-profile.yaml', content: saveProfile(effectiveProfile) });
  }
  const filesWritten = [...toWrite.map((w) => w.rel), reportJsonRel, reportHtmlRel];
  const reportValidate = withExtraDiagnostics(validated, netDiags);
  const reportArgs: Parameters<typeof buildReport>[0] = {
    generatedAt: new Date().toISOString(),
    file,
    validateResult: reportValidate,
    diff,
    filesWritten,
  };
  if (grid.origin.sheet !== undefined) reportArgs.sheet = grid.origin.sheet;
  if (profile !== undefined) reportArgs.profile = profile.name;
  const report = buildReport(reportArgs);

  // 7. Ghi file.
  for (const w of toWrite) {
    const abs = join(outRoot, w.rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, w.content, 'utf8');
  }
  await mkdir(join(outRoot, 'reports'), { recursive: true });
  await writeFile(join(outRoot, reportJsonRel), reportToJson(report), 'utf8');
  await writeFile(join(outRoot, reportHtmlRel), reportToHtml(report), 'utf8');

  // 8. In kết quả + exit code.
  const changedTags = new Set(diff.changed.map((c) => c.tag.toLowerCase())).size;
  if (opts.json === true) {
    console.log(
      JSON.stringify(
        {
          file,
          sheet: grid.origin.sheet ?? null,
          format: input.isCsv ? 'csv' : 'xlsx',
          encoding: grid.meta?.encoding ?? 'auto',
          delimiter: grid.meta?.delimiter ?? 'auto',
          headerRow,
          firstDataRow,
          lastDataRow: profile?.lastDataRow ?? null,
          gridRows: grid.rows.length,
          totalRows: input.totalRows,
          mapping: input.mappingDisplay,
          preview: input.transformed.slice(0, 50),
          changed: input.changed,
          validate: { diagnostics: report.diagnostics, stats: report.stats },
          diff: {
            added: diff.added,
            removed: diff.removed,
            changed: diff.changed,
            unchanged: diff.unchanged,
            skippedManual: diff.skippedManual,
            renamedCandidates: diff.renamedCandidates,
          },
          commit: { applied: doCommit && refusedReason === null, refusedReason, filesWritten },
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `Validate: ${String(validated.stats.records)} bản ghi · ${String(validated.stats.errors)} lỗi · ${String(validated.stats.warnings)} cảnh báo · ${String(validated.stats.infos)} info · ${String(validated.stats.inferredKinds)} kind suy ra · ${String(validated.stats.skippedRows)} dòng bỏ qua`,
    );
    for (const d of report.diagnostics) console.log(`  ${formatDiagnostic(d)}`);
    console.log(
      `Diff: +${String(diff.added.length)} thêm · -${String(diff.removed.length)} xóa · ${String(changedTags)} đổi · ${String(diff.unchanged.length)} không đổi · ${String(diff.skippedManual.length)} bỏ qua (manual) · ${String(diff.renamedCandidates.length)} đề xuất đổi tên`,
    );
    if (refusedReason !== null) {
      console.error(`Commit bị từ chối: ${refusedReason}`);
    } else if (doCommit) {
      console.log(`Đã commit: ${toWrite.map((w) => w.rel).join(', ')}`);
    }
    console.log(`Báo cáo: ${reportJsonRel} · ${reportHtmlRel}`);
  }
  return refusedReason !== null ? 1 : 0;
}
