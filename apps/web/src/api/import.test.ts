// Test client import API (thuần, fetch stub) — P2.8 commit 6.

import { describe, expect, it } from 'vitest';
import {
  createImportClient,
  ImportApiError,
  type FetchFn,
} from './import.js';

function stubFetch(
  handler: (url: string, init?: RequestInit) => { status: number; body: unknown },
): FetchFn {
  return (url: string, init?: RequestInit) => {
    const { status, body } = handler(url, init);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response);
  };
}

describe('createImportClient', () => {
  it('createSession → parse sessionId/sheets/detectedSheet; gửi đúng payload', async () => {
    let seenUrl = '';
    let seenBody: unknown;
    const fetchFn = stubFetch((url, init) => {
      seenUrl = url;
      seenBody = init?.body !== undefined ? JSON.parse(init.body as string) : undefined;
      return {
        status: 200,
        body: {
          sessionId: 's1',
          sheets: [
            { name: 'IO List', rowCount: 306, columnCount: 10 },
            { name: 'Cover', rowCount: 3, columnCount: 1 },
          ],
          detectedSheet: 'IO List',
        },
      };
    });
    const api = createImportClient(fetchFn);
    const res = await api.createSession('io-list-300.xlsx', 'AAAA');
    expect(res).toEqual({
      sessionId: 's1',
      sheets: ['IO List', 'Cover'],
      detectedSheet: 'IO List',
    });
    expect(seenUrl).toBe('/api/import/session');
    expect(seenBody).toEqual({ filename: 'io-list-300.xlsx', contentBase64: 'AAAA' });
  });

  it('lỗi HTTP → ImportApiError giữ status + error + diagnostics', async () => {
    const fetchFn = stubFetch(() => ({
      status: 400,
      body: {
        error: 'mapping: cột không có trong dòng header',
        diagnostics: [{ code: 'IO-E001', severity: 'error', message: 'x' }],
      },
    }));
    const api = createImportClient(fetchFn);
    await expect(api.applyMapping('s1', { tag: 'Khong Co' })).rejects.toMatchObject({
      status: 400,
    });
    try {
      await api.applyMapping('s1', { tag: 'Khong Co' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ImportApiError);
      expect((err as ImportApiError).message).toBe('mapping: cột không có trong dòng header');
      expect((err as ImportApiError).diagnostics).toHaveLength(1);
    }
  });

  it('410 session hết hạn → status 410, message từ server', async () => {
    const fetchFn = stubFetch(() => ({
      status: 410,
      body: { error: 'session import không tồn tại hoặc đã hết hạn — tải lại file' },
    }));
    const api = createImportClient(fetchFn);
    await expect(api.validate('het-han')).rejects.toMatchObject({ status: 410 });
  });

  it('selectSheet không sheet → body {}; quickfix/diff/commit đúng URL', async () => {
    const urls: string[] = [];
    const bodies: unknown[] = [];
    const fetchFn = stubFetch((url, init) => {
      urls.push(url);
      bodies.push(init?.body !== undefined ? JSON.parse(init.body as string) : undefined);
      if (url.endsWith('/sheet')) {
        return {
          status: 200,
          body: { sheet: 'IO List', headerRow: 6, firstDataRow: 7, columns: ['Tag Name'], preview50: [['A', 'DI']], totalRows: 300 },
        };
      }
      if (url.endsWith('/quickfix')) {
        return { status: 200, body: { diagnostics: [], stats: { records: 2, errors: 0, warnings: 0, infos: 0, diagnosticsByCode: {} }, acceptedCleanRows: [2] } };
      }
      if (url.endsWith('/diff')) {
        return { status: 200, body: { added: ['A'], removed: [], changed: [], unchanged: [], renamedCandidates: [], skippedManual: [] } };
      }
      return {
        status: 200,
        body: { filesWritten: ['tags/tags.yaml'], report: { json: 'r.json', html: 'r.html' }, diff: { added: 1, removed: 0, changed: 0, unchanged: 0, skippedManual: 0, renamedCandidates: 0 }, commit: { applied: true } },
      };
    });
    const api = createImportClient(fetchFn);
    const sheet = await api.selectSheet('s1');
    expect(sheet.headerRow).toBe(6);
    expect(sheet.preview).toEqual([['A', 'DI']]);
    expect(bodies[0]).toEqual({});
    const fixed = await api.quickfix('s1', 2, 'IO-W002');
    expect(fixed.acceptedCleanRows).toEqual([2]);
    expect(bodies[1]).toEqual({ row: 2, code: 'IO-W002' });
    const diff = await api.diff('s1');
    expect(diff.added).toEqual(['A']);
    const commit = await api.commit('s1');
    expect(commit.commit.applied).toBe(true);
    expect(urls).toEqual([
      '/api/import/session/s1/sheet',
      '/api/import/session/s1/quickfix',
      '/api/import/session/s1/diff',
      '/api/import/session/s1/commit',
    ]);
  });

  it('deleteSession → DELETE, không throw khi 410', async () => {
    let method = '';
    const fetchFn = stubFetch((url, init) => {
      method = init?.method ?? '';
      return { status: 410, body: { error: 'hết hạn' } };
    });
    const api = createImportClient(fetchFn);
    await api.deleteSession('s1');
    expect(method).toBe('DELETE');
  });

  it('getTags/updateTag: đúng URL + payload (null = xóa)', async () => {
    const urls: string[] = [];
    const bodies: unknown[] = [];
    const fetchFn = stubFetch((url, init) => {
      urls.push(url);
      bodies.push(init?.body !== undefined ? JSON.parse(init.body as string) : undefined);
      if (url === '/api/tags' && (init?.method ?? 'GET') === 'GET') {
        return {
          status: 200,
          body: { tags: [{ name: 'RUN_CMD', equipment: 'M01', role: 'runCmd' }] },
        };
      }
      return { status: 200, body: { tag: { name: 'RUN_CMD', equipment: 'M02' } } };
    });
    const api = createImportClient(fetchFn);
    const tags = await api.getTags();
    expect(tags).toEqual([{ name: 'RUN_CMD', equipment: 'M01', role: 'runCmd' }]);
    await api.updateTag('RUN_CMD', 'M02');
    await api.updateTag('RUN_FB', null, 'runFb');
    expect(urls).toEqual(['/api/tags', '/api/tags', '/api/tags']);
    expect(bodies[1]).toEqual({ name: 'RUN_CMD', equipment: 'M02' });
    expect(bodies[2]).toEqual({ name: 'RUN_FB', equipment: null, role: 'runFb' });
  });
});

describe('createImportClient — Plant Designer (commit 8)', () => {
  it('suggest/applySuggest/learnRoleOverride: đúng URL + payload; apply giữ autoFilled', async () => {
    const urls: string[] = [];
    const bodies: unknown[] = [];
    const fetchFn = stubFetch((url, init) => {
      urls.push(url);
      bodies.push(init?.body !== undefined ? JSON.parse(init.body as string) : undefined);
      if (url === '/api/suggest') {
        return {
          status: 200,
          body: {
            suggestions: [
              {
                equipmentId: 'M01',
                model: 'motor_dol',
                confidence: 0.95,
                signals: [],
                missingRequiredRoles: [],
                unusedOptionalRoles: [],
                status: 'confident',
              },
            ],
            unassignedTags: [],
            stats: { totalTags: 8, assignedTags: 2, confident: 1, review: 0, unmatched: 0 },
          },
        };
      }
      if (url === '/api/suggest/apply') {
        return {
          status: 200,
          body: {
            applied: ['M01'],
            skipped: [],
            filesWritten: ['tags/tags.yaml', 'plant/equipment.yaml'],
            diagnostics: [],
            autoFilled: [],
          },
        };
      }
      return { status: 200, body: { token: 'FB', role: 'runFb', file: 'plant/naming.yaml' } };
    });
    const api = createImportClient(fetchFn);
    const res = await api.suggest();
    expect(res.stats).toEqual({
      totalTags: 8,
      assignedTags: 2,
      confident: 1,
      review: 0,
      unmatched: 0,
    });
    const applied = await api.applySuggest(res.suggestions, true);
    expect(applied.applied).toEqual(['M01']);
    expect(applied.filesWritten).toContain('plant/equipment.yaml');
    const learned = await api.learnRoleOverride('FB', 'runFb');
    expect(learned).toEqual({ token: 'FB', role: 'runFb', file: 'plant/naming.yaml' });
    expect(urls).toEqual(['/api/suggest', '/api/suggest/apply', '/api/suggest/role-override']);
    expect(bodies[1]).toEqual({ accepted: res.suggestions, onlyConfident: true });
    expect(bodies[2]).toEqual({ token: 'FB', role: 'runFb' });
  });

  it('getModels/getEquipment/saveEquipment/getPlant: unwrap đúng field', async () => {
    const fetchFn = stubFetch((url, init) => {
      if (url === '/api/plant/models') {
        return { status: 200, body: { models: [{ model: 'motor_dol', hasSource: false }] } };
      }
      if (url === '/api/plant/equipment' && (init?.method ?? 'GET') === 'GET') {
        return { status: 200, body: { equipment: [{ id: 'M01', model: 'motor_dol' }] } };
      }
      if (url === '/api/plant') {
        return { status: 200, body: { equipment: [], events: [] } };
      }
      return { status: 400, body: { error: 'không ngờ tới' } };
    });
    const api = createImportClient(fetchFn);
    expect(await api.getModels()).toEqual([{ model: 'motor_dol', hasSource: false }]);
    expect(await api.getEquipment()).toEqual([{ id: 'M01', model: 'motor_dol' }]);
    expect(await api.getPlant()).toEqual({ equipment: [], events: [] });
    await expect(
      api.saveEquipment([{ id: 'M01', model: 'motor_dol', params: { startDelayMs: 700 } }]),
    ).rejects.toThrow(ImportApiError);
  });
});
