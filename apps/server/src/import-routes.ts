// REST import wizard — @vcs/server (P2.8, M2 §10.1, OQ-382/383).
// Commit 3: tạo session + chọn sheet + xem trước (upload → sheet →
// preview). Mapping/validate/diff/commit ở commit 4.
// Upload bằng JSON body base64 {filename, contentBase64} (OQ-383):
// chỉ .xlsx/.csv, cap 20 MB (vượt → 413). KHÔNG @fastify/multipart.
// Session không tồn tại/hết hạn → 410 + hướng dẫn tải lại file.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { loadProject, nodeFS } from '@vcs/project';
import {
  hasErrors,
  sortDiagnostics,
  type Diagnostic,
  type TagDef,
} from '@vcs/schemas';
import {
  applyCommit,
  applyFillDown,
  applyTransforms,
  buildProfile,
  buildReport,
  decodeText,
  detectFillDownColumns,
  detectHeader,
  diffTags,
  FIELD_SYNONYMS,
  gridToRecords,
  ImportReadError,
  readCsvText,
  readXlsxBuffer,
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
  type CellValue,
  type DiffResult,
  type IoRecord,
  type MappingSuggestion,
  type NormalizedSignal,
  type RawGrid,
  type ValidateResult,
} from '@vcs/importers';
import { ImportSessionStore, type ImportSession } from './import-session.js';

/** Cap dung lượng file upload (OQ-383). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function isXlsx(filename: string): boolean {
  return filename.toLowerCase().endsWith('.xlsx');
}

function isCsv(filename: string): boolean {
  return filename.toLowerCase().endsWith('.csv');
}

function errorReply(reply: { status: (code: number) => { send: (body: unknown) => unknown } }, code: number, message: string): unknown {
  return reply.status(code).send({ error: message });
}

function sessionSummary(session: ImportSession): Record<string, unknown> {
  return {
    sessionId: session.id,
    filename: session.filename,
    kind: session.kind,
    sheets: session.sheets,
    sheet: session.sheet ?? null,
    headerRow: session.headerRow ?? null,
  };
}

export function registerImportRoutes(
  fastify: FastifyInstance,
  store: ImportSessionStore,
  projectDir: string,
): void {
  // Tạo session: upload file 1 lần, server đọc workbook, trả sheet list.
  // bodyLimit riêng 30 MB (base64 của file 20 MB ≈ 27 MB) — giới hạn
  // mặc định của Fastify là 1 MB, không đủ cho upload; cap 20 MB thật
  // vẫn do handler kiểm (413 + thông báo rõ).
  fastify.post('/api/import/session', { bodyLimit: 30 * 1024 * 1024 }, async (req, reply) => {
    const body: unknown = req.body;
    if (
      typeof body !== 'object' ||
      body === null ||
      !('filename' in body) ||
      !('contentBase64' in body) ||
      typeof (body as { filename: unknown }).filename !== 'string' ||
      typeof (body as { contentBase64: unknown }).contentBase64 !== 'string'
    ) {
      return errorReply(reply, 400, 'body phải là {filename: string, contentBase64: string}');
    }
    const { filename, contentBase64 } = body as { filename: string; contentBase64: string };
    if (filename === '') {
      return errorReply(reply, 400, 'filename không được rỗng');
    }
    if (!isXlsx(filename) && !isCsv(filename)) {
      return errorReply(reply, 400, `chỉ nhận file .xlsx/.csv, nhận được '${filename}'`);
    }
    if (contentBase64 === '' || contentBase64.length % 4 !== 0 || !BASE64_RE.test(contentBase64)) {
      return errorReply(reply, 400, 'contentBase64 không phải base64 hợp lệ');
    }
    const bytes = Buffer.from(contentBase64, 'base64');
    if (bytes.length > MAX_UPLOAD_BYTES) {
      return errorReply(
        reply,
        413,
        `file ${(bytes.length / 1024 / 1024).toFixed(1)} MB vượt giới hạn 20 MB`,
      );
    }
    const kind = isXlsx(filename) ? 'xlsx' : 'csv';
    let sheets: ImportSession['sheets'] = [];
    try {
      if (kind === 'xlsx') {
        const grid = await readXlsxBuffer(bytes, { file: filename });
        sheets = grid.sheets ?? [];
      } else {
        const { text } = decodeText(bytes);
        readCsvText(text, { file: filename });
      }
    } catch (err) {
      if (err instanceof ImportReadError) {
        return errorReply(reply, 400, `không đọc được file: ${err.message}`);
      }
      throw err;
    }
    const created = store.create(filename, kind, bytes, sheets);
    if (!created.ok) {
      if (created.error === 'TOO_MANY_SESSIONS') {
        return errorReply(
          reply,
          429,
          `đã có ${String(ImportSessionStore.MAX_SESSIONS)} session import — hủy session cũ rồi tải lại`,
        );
      }
      return errorReply(
        reply,
        429,
        'tổng dung lượng session import vượt 50 MB — hủy session cũ rồi tải lại',
      );
    }
    return {
      ...sessionSummary(created.session),
      detectedSheet: created.session.sheet ?? null,
    };
  });

  // Đọc lại trạng thái session (wizard quay lại bước trước).
  fastify.get('/api/import/session/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = store.get(id);
    if (session === undefined) {
      return errorReply(reply, 410, 'session import không tồn tại hoặc đã hết hạn — tải lại file');
    }
    return sessionSummary(session);
  });

  // Chọn sheet (XLSX) + dò header + xem trước 50 dòng (§10.1 bước 2).
  fastify.post('/api/import/session/:id/sheet', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = store.get(id);
    if (session === undefined) {
      return errorReply(reply, 410, 'session import không tồn tại hoặc đã hết hạn — tải lại file');
    }
    const body: unknown = req.body;
    const wanted =
      typeof body === 'object' && body !== null && 'sheet' in body ? body.sheet : undefined;
    if (wanted !== undefined && typeof wanted !== 'string') {
      return errorReply(reply, 400, 'sheet phải là string');
    }
    if (session.kind === 'xlsx' && wanted !== undefined) {
      if (!session.sheets.some((s) => s.name === wanted)) {
        return errorReply(reply, 400, `không tìm thấy sheet '${wanted}' trong file ${session.filename}`);
      }
      if (wanted !== session.sheet) {
        session.sheet = wanted;
        delete session.grid;
        delete session.headerRow;
        delete session.firstDataRow;
      }
    }
    try {
      if (session.grid === undefined) {
        session.grid =
          session.kind === 'xlsx'
            ? await readXlsxBuffer(
                session.bytes,
                session.sheet === undefined
                  ? { file: session.filename }
                  : { file: session.filename, sheet: session.sheet },
              )
            : readCsvText(decodeText(session.bytes).text, { file: session.filename });
      }
    } catch (err) {
      if (err instanceof ImportReadError) {
        return errorReply(reply, 400, `không đọc được file: ${err.message}`);
      }
      throw err;
    }
    const grid = session.grid;
    const guess = detectHeader(grid);
    if (guess !== null) {
      session.headerRow = guess.headerRow;
      session.firstDataRow = guess.firstDataRow;
    }
    const headerRow = session.headerRow;
    const headerIdx =
      headerRow !== undefined
        ? (grid.rowNumbers ?? grid.rows.map((_r, i) => i + 1)).indexOf(headerRow)
        : -1;
    const columns: string[] =
      headerIdx >= 0
        ? (grid.rows[headerIdx] ?? []).map((c) => (c === null ? '' : String(c)))
        : [];
    // 50 dòng đầu sau header (không header → 50 dòng đầu lưới).
    const dataRows = grid.rows.filter((_row, i) => {
      const n = grid.rowNumbers?.[i] ?? i + 1;
      return headerRow === undefined || n > headerRow;
    });
    const preview50: CellValue[][] = dataRows.slice(0, 50);
    return {
      sheet: session.sheet ?? null,
      headerRow: headerRow ?? null,
      firstDataRow: session.firstDataRow ?? null,
      matches: guess?.matches ?? 0,
      columns,
      preview50,
      totalRows: dataRows.length,
    };
  });

  // Hủy session.
  fastify.delete('/api/import/session/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!store.delete(id)) {
      return errorReply(reply, 410, 'session import không tồn tại hoặc đã hết hạn — tải lại file');
    }
    return { ok: true };
  });

  // --- Commit 4: mapping → validate → quickfix → diff → commit (§10.1) ---

  // Mapping cột (bước 3): gợi ý tự động hoặc mapping do user sửa; dựng
  // records + profile (profile chỉ ghi đĩa ở commit, mirror CLI).
  fastify.post('/api/import/session/:id/mapping', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = store.get(id);
    if (session === undefined) {
      return errorReply(reply, 410, 'session import không tồn tại hoặc đã hết hạn — tải lại file');
    }
    const ensured = await ensureGridAndHeader(session);
    if (!ensured.ok) return errorReply(reply, 400, ensured.error);
    const grid = session.grid as RawGrid;
    const headerRow = session.headerRow as number;
    const firstDataRow = session.firstDataRow as number;

    // Mapping do user gửi (nếu có): key phải là CanonicalField, value phải
    // là tên cột có trong dòng header.
    const body: unknown = req.body;
    let userMapping: Partial<Record<CanonicalField, string>> | undefined;
    if (typeof body === 'object' && body !== null && 'mapping' in body && body.mapping !== undefined) {
      const raw = body.mapping as unknown;
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return errorReply(reply, 400, 'mapping phải là object field → tên cột');
      }
      const headerCells = (grid.rows[(grid.rowNumbers ?? grid.rows.map((_r, i) => i + 1)).indexOf(headerRow)] ?? []).map(
        (c) => (c === null ? '' : String(c)),
      );
      userMapping = {};
      for (const [field, column] of Object.entries(raw as Record<string, unknown>)) {
        if (!(field in FIELD_SYNONYMS)) {
          return errorReply(reply, 400, `mapping: field '${field}' không phải CanonicalField`);
        }
        if (typeof column !== 'string' || column === '') {
          return errorReply(reply, 400, `mapping: cột của field '${field}' phải là string không rỗng`);
        }
        if (!headerCells.includes(column)) {
          return errorReply(reply, 400, `mapping: cột '${column}' không có trong dòng header`);
        }
        (userMapping as Record<string, string>)[field] = column;
      }
    }

    // Fill-down cột merge dọc (mirror CLI import-io, trước mapping).
    const fillDownLetters = detectFillDownColumns(grid, headerRow);
    if (fillDownLetters.length > 0) session.grid = applyFillDown(grid, fillDownLetters);
    const filled = session.grid as RawGrid;

    const autoSuggestions: MappingSuggestion[] = suggestMapping(filled, headerRow);
    let mappingRecord: Partial<Record<CanonicalField, string>>;
    if (userMapping !== undefined) {
      mappingRecord = userMapping;
    } else {
      mappingRecord = {};
      for (const s of autoSuggestions) mappingRecord[s.field] = s.column;
    }
    const profileSuggestions: MappingSuggestion[] =
      userMapping !== undefined
        ? Object.entries(mappingRecord).map(([field, column]) => ({
            field: field as CanonicalField,
            column,
            confidence: 'high' as const,
            reason: 'người dùng chọn',
          }))
        : autoSuggestions;
    const profile = buildProfile(filled, headerRow, firstDataRow, profileSuggestions, {
      name: session.filename.replace(/\.[^.]+$/, ''),
      file: session.filename,
    });
    const records = gridToRecords(filled, headerRow, firstDataRow, mappingRecord, profile.lastDataRow);
    const { rows: transformed, changed } = applyTransforms(records, profile.transforms);
    session.mapping = mappingRecord;
    session.profile = profile;
    session.records = transformed;
    session.changed = changed;
    delete session.validated;
    delete session.diff;
    return {
      mapping: mappingRecord,
      suggestions: autoSuggestions,
      profile,
      records: transformed.slice(0, 50),
      totalRows: transformed.length,
      changed,
    };
  });

  // Validate (bước 4): chạy validateImport trên records của session, trừ
  // IO-W002 đã chấp nhận nhanh (OQ-390).
  fastify.post('/api/import/session/:id/validate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = store.get(id);
    if (session === undefined) {
      return errorReply(reply, 410, 'session import không tồn tại hoặc đã hết hạn — tải lại file');
    }
    if (session.records === undefined) {
      return errorReply(reply, 400, 'chưa mapping — gọi /mapping trước');
    }
    const baseline = await loadBaseline(projectDir);
    if (!baseline.ok) {
      return reply.status(400).send({ error: baseline.error, diagnostics: baseline.diagnostics ?? [] });
    }
    const validated = runValidate(session, baseline.baseline);
    session.validated = validated;
    delete session.diff;
    return validateResponse(session, validated);
  });

  // "Sửa nhanh" IO-W002 (bước 4, OQ-390): chấp nhận tên đã làm sạch của
  // dòng đó trong session rồi validate lại. Chỉ IO-W002, không mã khác.
  fastify.post('/api/import/session/:id/quickfix', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = store.get(id);
    if (session === undefined) {
      return errorReply(reply, 410, 'session import không tồn tại hoặc đã hết hạn — tải lại file');
    }
    const body: unknown = req.body;
    const row =
      typeof body === 'object' && body !== null && 'row' in body ? body.row : undefined;
    const code =
      typeof body === 'object' && body !== null && 'code' in body ? body.code : undefined;
    if (typeof row !== 'number' || !Number.isInteger(row) || row < 1) {
      return errorReply(reply, 400, 'row phải là số dòng file (nguyên ≥ 1)');
    }
    if (code !== 'IO-W002') {
      return errorReply(reply, 400, "chỉ hỗ trợ sửa nhanh IO-W002 (code phải là 'IO-W002')");
    }
    if (session.validated === undefined) {
      return errorReply(reply, 400, 'chưa validate — gọi /validate trước');
    }
    const has = session.validated.diagnostics.some((d) => d.code === 'IO-W002' && d.line === row);
    if (!has) {
      return errorReply(reply, 400, `dòng ${String(row)} không có cảnh báo IO-W002`);
    }
    if (session.acceptedCleanRows === undefined) session.acceptedCleanRows = new Set<number>();
    session.acceptedCleanRows.add(row);
    const baseline = await loadBaseline(projectDir);
    if (!baseline.ok) {
      return reply.status(400).send({ error: baseline.error, diagnostics: baseline.diagnostics ?? [] });
    }
    const validated = runValidate(session, baseline.baseline);
    session.validated = validated;
    delete session.diff;
    return validateResponse(session, validated);
  });

  // Diff vs tags.yaml hiện tại (bước 5, §8.8).
  fastify.post('/api/import/session/:id/diff', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = store.get(id);
    if (session === undefined) {
      return errorReply(reply, 410, 'session import không tồn tại hoặc đã hết hạn — tải lại file');
    }
    if (session.validated === undefined) {
      return errorReply(reply, 400, 'chưa validate — gọi /validate trước');
    }
    const overwriteManual = readOverwriteManual(req.body);
    if (typeof overwriteManual === 'string') {
      return errorReply(reply, 400, overwriteManual);
    }
    const baseline = await loadBaseline(projectDir);
    if (!baseline.ok) {
      return reply.status(400).send({ error: baseline.error, diagnostics: baseline.diagnostics ?? [] });
    }
    const diff = diffTags(
      baseline.baseline.oldTags,
      session.validated.signals,
      overwriteManual === undefined ? {} : { overwriteManual },
    );
    session.diff = diff;
    return diff;
  });

  // Commit (bước 5): ghi tags.yaml + normalized CSV + profile + report.
  // Mirror CLI `vcs import-io --commit`: lỗi validate → từ chối (400);
  // safety net từ chối → 400. Không hot reload (OQ-384) — UI hiện banner.
  fastify.post('/api/import/session/:id/commit', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = store.get(id);
    if (session === undefined) {
      return errorReply(reply, 410, 'session import không tồn tại hoặc đã hết hạn — tải lại file');
    }
    if (session.validated === undefined) {
      return errorReply(reply, 400, 'chưa validate — gọi /validate trước');
    }
    if (session.diff === undefined) {
      return errorReply(reply, 400, 'chưa diff — gọi /diff trước');
    }
    const overwriteManual = readOverwriteManual(req.body);
    if (typeof overwriteManual === 'string') {
      return errorReply(reply, 400, overwriteManual);
    }
    const baseline = await loadBaseline(projectDir);
    if (!baseline.ok) {
      return reply.status(400).send({ error: baseline.error, diagnostics: baseline.diagnostics ?? [] });
    }
    const { baseline: base } = baseline;
    let diff: DiffResult = session.diff;
    if (overwriteManual !== undefined) {
      diff = diffTags(base.oldTags, session.validated.signals, { overwriteManual });
      session.diff = diff;
    }
    const validated = session.validated;
    if (hasErrors(validated.diagnostics)) {
      return reply.status(400).send({
        error: `validate có ${String(validated.stats.errors)} lỗi — sửa I/O list rồi chạy lại`,
        diagnostics: validated.diagnostics,
      });
    }
    const newTags = applyCommit(base.oldTags, diff, validated.signals);
    const netDiags = safetyNetCheck(newTags, base.tagsRel);
    if (hasErrors(netDiags)) {
      return reply.status(400).send({
        error: 'safety net từ chối danh sách tag mới (xem diagnostics)',
        diagnostics: netDiags,
      });
    }
    const grid = session.grid as RawGrid;
    const headerRow = session.headerRow as number;
    const firstDataRow = session.firstDataRow as number;
    const effectiveProfile =
      session.profile ??
      buildProfile(grid, headerRow, firstDataRow, suggestMapping(grid, headerRow), {
        name: session.filename.replace(/\.[^.]+$/, ''),
        file: session.filename,
      });
    const timestamp = formatTimestamp(new Date());
    const reportJsonRel = `reports/import-${timestamp}.json`;
    const reportHtmlRel = `reports/import-${timestamp}.html`;
    const toWrite: Array<{ rel: string; content: string }> = [
      { rel: base.tagsRel, content: serializeTags(newTags) },
      { rel: 'io/io-list.normalized.csv', content: toNormalizedCsv(validated.signals) },
      { rel: 'io/import-profile.yaml', content: saveProfile(effectiveProfile) },
    ];
    const filesWritten = [...toWrite.map((w) => w.rel), reportJsonRel, reportHtmlRel];
    const reportValidate = withExtraDiagnostics(validated, netDiags);
    const reportArgs: Parameters<typeof buildReport>[0] = {
      generatedAt: new Date().toISOString(),
      file: session.filename,
      validateResult: reportValidate,
      diff,
      filesWritten,
    };
    if (grid.origin.sheet !== undefined) reportArgs.sheet = grid.origin.sheet;
    reportArgs.profile = effectiveProfile.name;
    const report = buildReport(reportArgs);
    for (const w of toWrite) {
      const abs = join(projectDir, w.rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, w.content, 'utf8');
    }
    await mkdir(join(projectDir, 'reports'), { recursive: true });
    await writeFile(join(projectDir, reportJsonRel), reportToJson(report), 'utf8');
    await writeFile(join(projectDir, reportHtmlRel), reportToHtml(report), 'utf8');
    return {
      filesWritten,
      report: { json: reportJsonRel, html: reportHtmlRel },
      diff: {
        added: diff.added.length,
        removed: diff.removed.length,
        changed: diff.changed.length,
        unchanged: diff.unchanged.length,
        skippedManual: diff.skippedManual.length,
        renamedCandidates: diff.renamedCandidates.length,
      },
      commit: { applied: true },
    };
  });
}

// --- Helper commit 4 (thuần, trừ loadBaseline ghi/đọc đĩa) ---

/** Đọc lưới + dò header khi wizard gọi thẳng mapping mà chưa qua sheet. */
async function ensureGridAndHeader(
  session: ImportSession,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (session.grid === undefined) {
      session.grid =
        session.kind === 'xlsx'
          ? await readXlsxBuffer(
              session.bytes,
              session.sheet === undefined
                ? { file: session.filename }
                : { file: session.filename, sheet: session.sheet },
            )
          : readCsvText(decodeText(session.bytes).text, { file: session.filename });
    }
  } catch (err) {
    if (err instanceof ImportReadError) {
      return { ok: false, error: `không đọc được file: ${err.message}` };
    }
    throw err;
  }
  if (session.headerRow === undefined) {
    const guess = detectHeader(session.grid);
    if (guess === null) {
      return { ok: false, error: 'không dò được dòng header — chọn sheet rồi gửi headerRow' };
    }
    session.headerRow = guess.headerRow;
    session.firstDataRow = guess.firstDataRow;
  }
  if (session.firstDataRow === undefined) {
    session.firstDataRow = session.headerRow + 1;
  }
  return { ok: true };
}

interface Baseline {
  oldTags: TagDef[];
  tagsRel: string;
  declaredControllers: string[];
  defaultController: string | undefined;
  assignedTags: AssignedTag[];
}

/** Nạp baseline project trên đĩa (tags.yaml hiện tại + controllers +
 *  equipment đã gán) cho validate/diff/commit — mirror CLI import-io. */
async function loadBaseline(
  dir: string,
): Promise<
  | { ok: true; baseline: Baseline }
  | { ok: false; error: string; diagnostics?: Diagnostic[] }
> {
  const model = await loadProject(nodeFS(dir));
  if (!model.valid) {
    return {
      ok: false,
      error: 'dự án baseline không hợp lệ — không validate/diff/commit được',
      diagnostics: [...model.diagnostics],
    };
  }
  const controllerIds = model.config.controllers.map((c) => c.id);
  const assignedTags: AssignedTag[] = [];
  for (const eq of model.plant ?? []) {
    for (const [role, tag] of Object.entries(eq.signals ?? {})) {
      assignedTags.push({ tag, equipment: eq.id, role });
    }
  }
  return {
    ok: true,
    baseline: {
      oldTags: model.tags,
      tagsRel: model.config.files.tags,
      declaredControllers: controllerIds,
      defaultController: controllerIds[0],
      assignedTags,
    },
  };
}

/** Chạy validateImport trên records của session (mirror CLI, §8.7). */
function runValidate(session: ImportSession, baseline: Baseline): ValidateResult {
  const grid = session.grid as RawGrid;
  const records = session.records as IoRecord[];
  const rowNumbers = recordRowNumbers(grid, session.firstDataRow as number, session.profile?.lastDataRow ?? null);
  const origin: { file: string; sheet?: string } = { file: session.filename };
  if (grid.origin.sheet !== undefined) origin.sheet = grid.origin.sheet;
  const args: Parameters<typeof validateImport>[0] = {
    records,
    rowNumbers,
    origin,
  };
  if (session.profile !== undefined) args.profile = session.profile;
  if (baseline.declaredControllers.length > 0) args.declaredControllers = baseline.declaredControllers;
  if (baseline.assignedTags.length > 0) args.assignedTags = baseline.assignedTags;
  if (baseline.defaultController !== undefined) args.defaultController = baseline.defaultController;
  const validated = validateImport(args);
  return applyQuickfixAcceptance(validated, session.acceptedCleanRows);
}

/** Trừ IO-W002 đã chấp nhận nhanh (OQ-390) khỏi kết quả validate +
 *  điều chỉnh stats cho khớp (warnings − N, diagnosticsByCode − N). */
function applyQuickfixAcceptance(
  validated: ValidateResult,
  accepted: Set<number> | undefined,
): ValidateResult {
  if (accepted === undefined || accepted.size === 0) return validated;
  const isAccepted = (d: Diagnostic): boolean =>
    d.code === 'IO-W002' && d.line !== undefined && accepted.has(d.line);
  const removed = validated.diagnostics.filter(isAccepted);
  if (removed.length === 0) return validated;
  const diagnostics = validated.diagnostics.filter((d) => !isAccepted(d));
  const diagnosticsByCode: Record<string, number> = { ...validated.stats.diagnosticsByCode };
  diagnosticsByCode['IO-W002'] = (diagnosticsByCode['IO-W002'] ?? 0) - removed.length;
  if (diagnosticsByCode['IO-W002'] <= 0) delete diagnosticsByCode['IO-W002'];
  return {
    ...validated,
    diagnostics,
    stats: {
      ...validated.stats,
      warnings: validated.stats.warnings - removed.length,
      diagnosticsByCode,
    },
  };
}

function validateResponse(
  session: ImportSession,
  validated: ValidateResult,
): Record<string, unknown> {
  return {
    diagnostics: validated.diagnostics,
    stats: validated.stats,
    acceptedCleanRows: [...(session.acceptedCleanRows ?? [])].sort((a, b) => a - b),
  };
}

/** Đọc cờ overwriteManual từ body: undefined (không gửi) | boolean |
 *  string = thông báo lỗi 400. */
function readOverwriteManual(body: unknown): boolean | undefined | string {
  if (typeof body !== 'object' || body === null || !('overwriteManual' in body)) return undefined;
  const v = body.overwriteManual;
  if (typeof v === 'boolean') return v;
  return 'overwriteManual phải là boolean';
}

/** Gộp thêm diagnostics (safety net) vào kết quả validate cho report
 *  (mirror CLI import-io — cùng logic, cùng stats). */
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

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** CSV chuẩn hóa: 1 dòng / tín hiệu (mirror CLI import-io — cùng header
 *  và cột, để report/commit qua UI giống hệt qua CLI). */
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

/** Timestamp local `YYYYMMDD-HHmmss` cho tên file report (wall time,
 *  cho phép ở apps/* — mirror CLI import-io). */
function formatTimestamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
