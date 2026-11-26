// Test import session API — @vcs/server (P2.8 commit 3, OQ-382/383).
// Fastify inject (không mở cổng thật); đồng hồ giả cho expiry.

import { cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ImportSessionStore } from './import-session.js';
import { registerImportRoutes } from './import-routes.js';

const ROOT = join(fileURLToPath(new URL('../../..', import.meta.url)));
const XLSX = join(ROOT, 'fixtures', 'io-list-300.xlsx');
const CSV = join(ROOT, 'fixtures', 'io-list-300.csv');
const MOTOR = join(ROOT, 'examples', 'motor-interlock');

let xlsxB64 = '';
let csvB64 = '';

beforeAll(async () => {
  xlsxB64 = (await readFile(XLSX)).toString('base64');
  csvB64 = (await readFile(CSV)).toString('base64');
});

const apps: FastifyInstance[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function makeApp(
  now?: () => number,
  projectDir?: string,
): Promise<{ app: FastifyInstance; store: ImportSessionStore }> {
  const app = Fastify();
  const store = new ImportSessionStore(now);
  registerImportRoutes(app, store, projectDir ?? join(ROOT, 'examples', 'hello-tags'));
  await app.ready();
  apps.push(app);
  return { app, store };
}

/** Copy motor-interlock thành project tạm cho test commit (ghi đĩa). */
async function makeTempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vcs-p28-import-'));
  await cp(MOTOR, dir, { recursive: true });
  return dir;
}

async function createSession(
  app: FastifyInstance,
  filename: string,
  contentBase64: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/import/session',
    payload: { filename, contentBase64 },
  });
  return { status: res.statusCode, body: res.json<Record<string, unknown>>() };
}

/** Tạo session từ fixture XLSX + chọn sheet mặc định, trả sessionId. */
async function fixtureSession(app: FastifyInstance): Promise<string> {
  const { body } = await createSession(app, 'io-list-300.xlsx', xlsxB64);
  const id = body['sessionId'] as string;
  const sheet = await app.inject({ method: 'POST', url: `/api/import/session/${id}/sheet`, payload: {} });
  expect(sheet.statusCode).toBe(200);
  return id;
}

async function postJson(
  app: FastifyInstance,
  url: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'POST', url, payload });
  return { status: res.statusCode, body: res.json<Record<string, unknown>>() };
}

describe('POST /api/import/session (OQ-382/383)', () => {
  it('XLSX fixture → 200, 2 sheet, detectedSheet = sheet đầu', async () => {
    const { app } = await makeApp();
    const { status, body } = await createSession(app, 'io-list-300.xlsx', xlsxB64);
    expect(status).toBe(200);
    expect(typeof body['sessionId']).toBe('string');
    expect(body['filename']).toBe('io-list-300.xlsx');
    expect(body['kind']).toBe('xlsx');
    expect(body['sheets']).toEqual([
      { name: 'IO List', rowCount: 306, columnCount: 10 },
      { name: 'Cover', rowCount: 3, columnCount: 1 },
    ]);
    expect(body['detectedSheet']).toBe('IO List');
  });

  it('CSV fixture → 200, sheets [], detectedSheet null', async () => {
    const { app } = await makeApp();
    const { status, body } = await createSession(app, 'io-list-300.csv', csvB64);
    expect(status).toBe(200);
    expect(body['kind']).toBe('csv');
    expect(body['sheets']).toEqual([]);
    expect(body['detectedSheet']).toBeNull();
  });

  it('đuôi khác .xlsx/.csv → 400; base64 sai → 400; filename rỗng → 400', async () => {
    const { app } = await makeApp();
    const badExt = await createSession(app, 'io-list.txt', xlsxB64);
    expect(badExt.status).toBe(400);
    expect(badExt.body['error']).toMatch(/\.xlsx\/\.csv/);
    const badB64 = await createSession(app, 'io-list-300.xlsx', '!!!khong-phai-base64');
    expect(badB64.status).toBe(400);
    const emptyName = await createSession(app, '', xlsxB64);
    expect(emptyName.status).toBe(400);
  });

  it('file > 20 MB → 413', async () => {
    const { app } = await makeApp();
    const big = Buffer.alloc(21 * 1024 * 1024, 0).toString('base64');
    const { status, body } = await createSession(app, 'lon.xlsx', big);
    expect(status).toBe(413);
    expect(body['error']).toMatch(/20 MB/);
  });

  it('5 session rồi → session thứ 6 = 429', async () => {
    const { app } = await makeApp();
    for (let i = 0; i < 5; i += 1) {
      const r = await createSession(app, 'io-list-300.csv', csvB64);
      expect(r.status).toBe(200);
    }
    const sixth = await createSession(app, 'io-list-300.csv', csvB64);
    expect(sixth.status).toBe(429);
    expect(sixth.body['error']).toMatch(/5 session/);
  });
});

describe('ImportSessionStore — giới hạn + hết hạn (OQ-382)', () => {
  it('tổng > 50 MB → TOTAL_TOO_LARGE; xóa session giải phóng dung lượng', () => {
    const store = new ImportSessionStore(() => 0);
    const big = new Uint8Array(51 * 1024 * 1024);
    expect(store.create('lon.xlsx', 'xlsx', big, []).ok).toBe(false);
    const small = new Uint8Array(1024);
    const created = store.create('nho.csv', 'csv', small, []);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(store.totalBytes).toBe(1024);
    expect(store.delete(created.session.id)).toBe(true);
    expect(store.totalBytes).toBe(0);
    expect(store.delete(created.session.id)).toBe(false);
  });

  it('get chạm lastAccess (gia hạn); quá 30 phút không chạm → hết hạn', () => {
    let now = 0;
    const store = new ImportSessionStore(() => now);
    const created = store.create('a.csv', 'csv', new Uint8Array(10), []);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.session.id;
    now = 29 * 60 * 1000;
    expect(store.get(id)).toBeDefined();
    // Chạm ở phút 29 → hạn mới tới phút 59.
    now = 50 * 60 * 1000;
    expect(store.get(id)).toBeDefined();
    now = 81 * 60 * 1000;
    expect(store.get(id)).toBeUndefined();
    expect(store.size).toBe(0);
  });
});

describe('GET/POST sheet + DELETE (OQ-382)', () => {
  it('XLSX: chọn sheet mặc định → headerRow 6, 10 cột, preview50 = 50, totalRows 300', async () => {
    const { app } = await makeApp();
    const { body } = await createSession(app, 'io-list-300.xlsx', xlsxB64);
    const id = body['sessionId'] as string;
    const res = await app.inject({ method: 'POST', url: `/api/import/session/${id}/sheet`, payload: {} });
    expect(res.statusCode).toBe(200);
    const sheet = res.json<Record<string, unknown>>();
    expect(sheet['sheet']).toBe('IO List');
    expect(sheet['headerRow']).toBe(6);
    expect(sheet['firstDataRow']).toBe(7);
    expect(sheet['matches']).toBe(10);
    expect(sheet['columns']).toEqual([
      'Station',
      'Tag Name',
      'Description',
      'Type',
      'Address',
      'PLC',
      'Range Lo',
      'Range Hi',
      'Unit',
      'Equipment',
    ]);
    expect((sheet['preview50'] as unknown[]).length).toBe(50);
    expect(sheet['totalRows']).toBe(300);
    // GET session thấy sheet + headerRow đã lưu.
    const got = await app.inject({ method: 'GET', url: `/api/import/session/${id}` });
    expect(got.statusCode).toBe(200);
    expect((got.json<Record<string, unknown>>())['headerRow']).toBe(6);
  });

  it('CSV: sheet → headerRow 6, preview50 = 50, totalRows 300', async () => {
    const { app } = await makeApp();
    const { body } = await createSession(app, 'io-list-300.csv', csvB64);
    const id = body['sessionId'] as string;
    const res = await app.inject({ method: 'POST', url: `/api/import/session/${id}/sheet`, payload: {} });
    expect(res.statusCode).toBe(200);
    const sheet = res.json<Record<string, unknown>>();
    expect(sheet['sheet']).toBeNull();
    expect(sheet['headerRow']).toBe(6);
    expect((sheet['preview50'] as unknown[]).length).toBe(50);
    expect(sheet['totalRows']).toBe(300);
  });

  it("chọn sheet 'Cover' (không header) → 200, headerRow null, columns []", async () => {
    const { app } = await makeApp();
    const { body } = await createSession(app, 'io-list-300.xlsx', xlsxB64);
    const id = body['sessionId'] as string;
    const res = await app.inject({
      method: 'POST',
      url: `/api/import/session/${id}/sheet`,
      payload: { sheet: 'Cover' },
    });
    expect(res.statusCode).toBe(200);
    const sheet = res.json<Record<string, unknown>>();
    expect(sheet['sheet']).toBe('Cover');
    expect(sheet['headerRow']).toBeNull();
    expect(sheet['columns']).toEqual([]);
    expect((sheet['preview50'] as unknown[]).length).toBe(3);
  });

  it('sheet không có → 400; session không có → 410 (GET/POST/DELETE)', async () => {
    const { app } = await makeApp();
    const { body } = await createSession(app, 'io-list-300.xlsx', xlsxB64);
    const id = body['sessionId'] as string;
    const bad = await app.inject({
      method: 'POST',
      url: `/api/import/session/${id}/sheet`,
      payload: { sheet: 'KhongCo' },
    });
    expect(bad.statusCode).toBe(400);
    for (const [method, url] of [
      ['GET', '/api/import/session/khong-co'],
      ['POST', '/api/import/session/khong-co/sheet'],
      ['DELETE', '/api/import/session/khong-co'],
    ] as const) {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode).toBe(410);
      expect((res.json<Record<string, unknown>>())['error']).toMatch(/tải lại file/);
    }
  });

  it('DELETE xong → GET 410; session hết hạn (đồng hồ giả +31 phút) → 410', async () => {
    let now = 0;
    const { app } = await makeApp(() => now);
    const { body } = await createSession(app, 'io-list-300.csv', csvB64);
    const id = body['sessionId'] as string;
    const del = await app.inject({ method: 'DELETE', url: `/api/import/session/${id}` });
    expect(del.statusCode).toBe(200);
    expect((del.json<Record<string, unknown>>())['ok']).toBe(true);
    const gone = await app.inject({ method: 'GET', url: `/api/import/session/${id}` });
    expect(gone.statusCode).toBe(410);

    const second = await createSession(app, 'io-list-300.csv', csvB64);
    const id2 = second.body['sessionId'] as string;
    now = 31 * 60 * 1000;
    const expired = await app.inject({ method: 'GET', url: `/api/import/session/${id2}` });
    expect(expired.statusCode).toBe(410);
  });
});

describe('mapping → validate → quickfix → diff → commit (P2.8 commit 4)', () => {
  it('mapping tự động trên fixture → mapping đủ field, records 300, profile io-list-300', async () => {
    const dir = await makeTempProject();
    const { app } = await makeApp(undefined, dir);
    const id = await fixtureSession(app);
    const { status, body } = await postJson(app, `/api/import/session/${id}/mapping`, {});
    expect(status).toBe(200);
    const mapping = body['mapping'] as Record<string, string>;
    expect(mapping['tag']).toBe('Tag Name');
    expect(mapping['address']).toBe('Address');
    expect(mapping['description']).toBe('Description');
    expect((body['suggestions'] as unknown[]).length).toBeGreaterThan(0);
    expect((body['records'] as unknown[]).length).toBe(50);
    expect(body['totalRows']).toBe(300);
    expect((body['profile'] as Record<string, unknown>)['name']).toBe('io-list-300');
  });

  it('mapping do user sửa → dùng mapping user; field lạ → 400; cột không có → 400', async () => {
    const dir = await makeTempProject();
    const { app } = await makeApp(undefined, dir);
    const id = await fixtureSession(app);
    const ok = await postJson(app, `/api/import/session/${id}/mapping`, {
      mapping: { tag: 'Tag Name', address: 'Address' },
    });
    expect(ok.status).toBe(200);
    expect((ok.body['mapping'] as Record<string, string>)['tag']).toBe('Tag Name');
    expect(ok.body['totalRows']).toBe(300);
    const badField = await postJson(app, `/api/import/session/${id}/mapping`, {
      mapping: { khongCo: 'Tag Name' },
    });
    expect(badField.status).toBe(400);
    const badCol = await postJson(app, `/api/import/session/${id}/mapping`, {
      mapping: { tag: 'Cot Khong Co' },
    });
    expect(badCol.status).toBe(400);
  });

  it('validate chưa mapping → 400; validate trên fixture vs motor-interlock → 18 lỗi, 26 warnings (23 IO-W030 + 3 PL-W010 do M01 đã gán tag, đúng theo assignedTags), tổng 44', async () => {
    const dir = await makeTempProject();
    const { app } = await makeApp(undefined, dir);
    const id = await fixtureSession(app);
    const early = await postJson(app, `/api/import/session/${id}/validate`, {});
    expect(early.status).toBe(400);
    const mapped = await postJson(app, `/api/import/session/${id}/mapping`, {});
    expect(mapped.status).toBe(200);
    const { status, body } = await postJson(app, `/api/import/session/${id}/validate`, {});
    expect(status).toBe(200);
    const stats = body['stats'] as Record<string, unknown>;
    expect(stats['errors']).toBe(18);
    expect(stats['warnings']).toBe(26);
    const byCode = stats['diagnosticsByCode'] as Record<string, number>;
    expect(byCode['IO-E001']).toBe(6);
    expect(byCode['IO-E011']).toBe(12);
    expect(byCode['IO-W030']).toBe(23);
    expect(byCode['PL-W010']).toBe(3);
    expect((body['diagnostics'] as unknown[]).length).toBe(44);
  });

  it("quickfix IO-W002: CSV tag có ký tự lạ '/' → chấp nhận → warnings −1, dòng vào acceptedCleanRows; sai mã/dòng → 400", async () => {
    const dir = await makeTempProject();
    const { app } = await makeApp(undefined, dir);
    const csv = [
      'Tag Name,Type,Address,PLC',
      // '/' là ký tự lạ → normalize thay '_' + IO-W002 (§8.6 bảng 3:
      // khoảng trắng → '_' KHÔNG tính là làm sạch nên không dùng 'MOTOR 01').
      'MOTOR/01,DI,%I1.0,PLC1',
      'MOTOR02,DI,%I1.1,PLC1',
    ].join('\n');
    const { body } = await createSession(app, 'dirty.csv', Buffer.from(csv, 'utf8').toString('base64'));
    const id = body['sessionId'] as string;
    await postJson(app, `/api/import/session/${id}/sheet`, {});
    await postJson(app, `/api/import/session/${id}/mapping`, {});
    const validated = await postJson(app, `/api/import/session/${id}/validate`, {});
    expect(validated.status).toBe(200);
    const diags = validated.body['diagnostics'] as Array<{ code: string; line?: number }>;
    const w002 = diags.filter((d) => d.code === 'IO-W002');
    expect(w002).toHaveLength(1);
    expect(w002[0]?.line).toBe(2);
    const warningsBefore = (validated.body['stats'] as Record<string, number>)['warnings'] ?? 0;
    const wrongCode = await postJson(app, `/api/import/session/${id}/quickfix`, { row: 2, code: 'IO-W030' });
    expect(wrongCode.status).toBe(400);
    const wrongRow = await postJson(app, `/api/import/session/${id}/quickfix`, { row: 3, code: 'IO-W002' });
    expect(wrongRow.status).toBe(400);
    const fixed = await postJson(app, `/api/import/session/${id}/quickfix`, { row: 2, code: 'IO-W002' });
    expect(fixed.status).toBe(200);
    const diags2 = fixed.body['diagnostics'] as Array<{ code: string; line?: number }>;
    expect(diags2.some((d) => d.code === 'IO-W002' && d.line === 2)).toBe(false);
    expect((fixed.body['stats'] as Record<string, number>)['warnings']).toBe(warningsBefore - 1);
    expect(fixed.body['acceptedCleanRows']).toEqual([2]);
  });

  it('diff trên fixture vs motor-interlock → added 300, removed 8, unchanged 0', async () => {
    const dir = await makeTempProject();
    const { app } = await makeApp(undefined, dir);
    const id = await fixtureSession(app);
    await postJson(app, `/api/import/session/${id}/mapping`, {});
    await postJson(app, `/api/import/session/${id}/validate`, {});
    const { status, body } = await postJson(app, `/api/import/session/${id}/diff`, {});
    expect(status).toBe(200);
    expect((body['added'] as unknown[]).length).toBe(300);
    expect((body['removed'] as unknown[]).length).toBe(8);
    expect((body['unchanged'] as unknown[]).length).toBe(0);
  });

  it('commit trên fixture bẩn (18 lỗi) → 400 từ chối, tags.yaml không đổi', async () => {
    const dir = await makeTempProject();
    const { app } = await makeApp(undefined, dir);
    const id = await fixtureSession(app);
    await postJson(app, `/api/import/session/${id}/mapping`, {});
    await postJson(app, `/api/import/session/${id}/validate`, {});
    await postJson(app, `/api/import/session/${id}/diff`, {});
    const tagsBefore = await readFile(join(dir, 'tags', 'tags.yaml'), 'utf8');
    const { status, body } = await postJson(app, `/api/import/session/${id}/commit`, {});
    expect(status).toBe(400);
    expect(body['error']).toMatch(/18 lỗi/);
    expect(await readFile(join(dir, 'tags', 'tags.yaml'), 'utf8')).toBe(tagsBefore);
  });

  it('commit trên CSV sạch 2 tag → 200, ghi tags.yaml + normalized CSV + profile + report; tags.yaml có tag mới', async () => {
    const dir = await makeTempProject();
    const { app } = await makeApp(undefined, dir);
    const csv = [
      'Tag Name,Type,Address,PLC',
      'NEW1,DI,%I1.0,PLC1',
      'NEW2,DI,%I1.1,PLC1',
    ].join('\n');
    const { body } = await createSession(app, 'clean.csv', Buffer.from(csv, 'utf8').toString('base64'));
    const id = body['sessionId'] as string;
    await postJson(app, `/api/import/session/${id}/sheet`, {});
    const mapped = await postJson(app, `/api/import/session/${id}/mapping`, {});
    expect(mapped.status).toBe(200);
    const validated = await postJson(app, `/api/import/session/${id}/validate`, {});
    expect(validated.status).toBe(200);
    expect((validated.body['stats'] as Record<string, number>)['errors']).toBe(0);
    const diffed = await postJson(app, `/api/import/session/${id}/diff`, {});
    expect(diffed.status).toBe(200);
    expect((diffed.body['added'] as unknown[]).length).toBe(2);
    const { status, body: commitBody } = await postJson(app, `/api/import/session/${id}/commit`, {});
    expect(status).toBe(200);
    expect((commitBody['commit'] as Record<string, unknown>)['applied']).toBe(true);
    const files = commitBody['filesWritten'] as string[];
    expect(files).toContain('tags/tags.yaml');
    expect(files).toContain('io/io-list.normalized.csv');
    expect(files).toContain('io/import-profile.yaml');
    expect(files.some((f) => f.startsWith('reports/import-') && f.endsWith('.json'))).toBe(true);
    expect(files.some((f) => f.startsWith('reports/import-') && f.endsWith('.html'))).toBe(true);
    const tagsAfter = await readFile(join(dir, 'tags', 'tags.yaml'), 'utf8');
    expect(tagsAfter).toContain('NEW1');
    expect(tagsAfter).toContain('NEW2');
    // applyCommit áp cả removed: import 2 tag thay thế baseline 8 tag
    // → tag cũ RUN_CMD bị xóa (đúng ngữ nghĩa diff, mirror CLI).
    expect(tagsAfter).not.toContain('RUN_CMD');
    const normalized = await readFile(join(dir, 'io', 'io-list.normalized.csv'), 'utf8');
    expect(normalized).toContain('NEW1,%I1.0,DI');
    const report = commitBody['report'] as { json: string; html: string };
    const reportJson = await readFile(join(dir, report.json), 'utf8');
    expect(JSON.parse(reportJson)).toMatchObject({ diff: { added: ['NEW1', 'NEW2'] } });
  });
});
