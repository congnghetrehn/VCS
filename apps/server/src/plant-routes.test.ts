// Test REST suggest/apply/tags/models/equipment (P2.8 commit 5) qua fastify
// inject trên project tạm (copy motor-interlock + tags/equipment viết tay).

import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { serializeTags } from '@vcs/importers';
import { defaultRegistry, motorDolModel } from '@vcs/plant';
import type { TagDef } from '@vcs/schemas';
import { registerPlantRoutes } from './plant-routes.js';

const ROOT = join(fileURLToPath(new URL('../../..', import.meta.url)));
const MOTOR = join(ROOT, 'examples', 'motor-interlock');

const apps: FastifyInstance[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

async function makeApp(dir: string): Promise<FastifyInstance> {
  const app = Fastify();
  registerPlantRoutes(app, dir);
  await app.ready();
  apps.push(app);
  return app;
}

async function postJson(
  app: FastifyInstance,
  url: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'POST', url, payload });
  return { status: res.statusCode, body: res.json<Record<string, unknown>>() };
}

async function getJson(
  app: FastifyInstance,
  url: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json<Record<string, unknown>>() };
}

async function makeTempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vcs-p28-plant-'));
  await cp(MOTOR, dir, { recursive: true });
  return dir;
}

function tag(
  name: string,
  type: 'Bool' | 'Int',
  area: 'I' | 'Q',
  address: string,
  kind: 'DI' | 'DO' | 'AI',
  scaling?: { rawMin: number; rawMax: number; engMin: number; engMax: number; unit: string },
): TagDef {
  return {
    name,
    type,
    area,
    address,
    controller: 'PLC1',
    signal: { kind, ...(scaling !== undefined ? { scaling } : {}) },
  };
}

async function writeTagsAndEquipment(
  dir: string,
  tags: TagDef[],
  equipmentYaml: string,
): Promise<void> {
  await writeFile(join(dir, 'tags', 'tags.yaml'), serializeTags(tags), 'utf8');
  await writeFile(join(dir, 'plant', 'equipment.yaml'), equipmentYaml, 'utf8');
}

describe('GET /api/tags + POST /api/tags (OQ-385)', () => {
  it('GET → 8 tag motor-interlock; POST gán equipment/role → ghi tags.yaml; clear bằng null; tag lạ → 400', async () => {
    const dir = await makeTempProject();
    const app = await makeApp(dir);
    const got = await getJson(app, '/api/tags');
    expect(got.status).toBe(200);
    const tags = got.body['tags'] as Array<{ name: string }>;
    expect(tags).toHaveLength(8);
    expect(tags.map((t) => t.name)).toContain('RUN_CMD');
    const set = await postJson(app, '/api/tags', {
      name: 'RUN_CMD',
      equipment: 'M01',
      role: 'runCmd',
    });
    expect(set.status).toBe(200);
    expect(set.body['tag']).toMatchObject({ name: 'RUN_CMD', equipment: 'M01', role: 'runCmd' });
    const yaml = await readFile(join(dir, 'tags', 'tags.yaml'), 'utf8');
    expect(yaml).toContain('equipment: M01');
    expect(yaml).toContain('role: runCmd');
    const cleared = await postJson(app, '/api/tags', { name: 'RUN_CMD', equipment: null });
    expect(cleared.status).toBe(200);
    expect('equipment' in (cleared.body['tag'] as Record<string, unknown>)).toBe(false);
    const unknown = await postJson(app, '/api/tags', { name: 'KHONG_CO', equipment: 'M01' });
    expect(unknown.status).toBe(400);
    const empty = await postJson(app, '/api/tags', { name: 'RUN_CMD', equipment: '' });
    expect(empty.status).toBe(400);
  });
});

describe('GET /api/plant/models (OQ-386)', () => {
  it('trả đủ model registry; motor_dol params có startDelayMs integer/default 500; analog_sensor engMin không default', async () => {
    const dir = await makeTempProject();
    const app = await makeApp(dir);
    const { status, body } = await getJson(app, '/api/plant/models');
    expect(status).toBe(200);
    const models = body['models'] as Array<Record<string, unknown>>;
    expect(models).toHaveLength(defaultRegistry.list().length);
    const byType = new Map(models.map((m) => [m['model'] as string, m]));
    const dol = byType.get('motor_dol') as Record<string, unknown>;
    expect(dol['version']).toBe('1.0.0');
    const params = dol['params'] as Array<Record<string, unknown>>;
    const start = params.find((p) => p['name'] === 'startDelayMs');
    expect(start).toMatchObject({ type: 'integer', minimum: 0, default: 500 });
    expect(start?.['maximum']).toBeUndefined();
    const roles = dol['roles'] as Array<Record<string, unknown>>;
    expect(roles.find((r) => r['role'] === 'runFb')?.['synonyms']).toContain('FB');
    const analog = byType.get('analog_sensor') as Record<string, unknown>;
    const engMin = (analog['params'] as Array<Record<string, unknown>>).find(
      (p) => p['name'] === 'engMin',
    );
    expect(engMin?.['required']).toBe(false);
    expect(engMin !== undefined && 'default' in engMin).toBe(false);
    expect(analog['hasSource']).toBe(true);
    expect(byType.get('motor_dol')?.['hasSource']).toBe(false);
  });
});

describe('GET /api/plant/equipment (OQ-386, file-backed)', () => {
  it('trả equipment.yaml trên đĩa kèm params; ghi lại file → GET sau trả bản mới (không cache)', async () => {
    const dir = await makeTempProject();
    const app = await makeApp(dir);
    const first = await getJson(app, '/api/plant/equipment');
    expect(first.status).toBe(200);
    const equipment = first.body['equipment'] as Array<Record<string, unknown>>;
    expect(equipment).toHaveLength(1);
    expect(equipment[0]).toMatchObject({ id: 'M01', model: 'motor_dol' });
    // M01 gốc không có params (dùng default của model) — params undefined.
    expect(equipment[0]?.['params']).toBeUndefined();
    expect(equipment[0]?.['signals']).toMatchObject({ runCmd: 'RUN_CMD', runFb: 'RUN_FB' });
    // Ghi lại equipment.yaml trực tiếp trên đĩa → GET sau phải thấy bản mới.
    // (Giữ đủ 8 tag gốc: plc/ của project biên dịch với chúng.)
    await writeTagsAndEquipment(
      dir,
      [
        tag('START_PB', 'Bool', 'I', '%I0.0', 'DI'),
        tag('STOP_OK', 'Bool', 'I', '%I0.1', 'DI'),
        tag('OVL_OK', 'Bool', 'I', '%I0.2', 'DI'),
        tag('PERM', 'Bool', 'I', '%I0.3', 'DI'),
        tag('RUN_FB', 'Bool', 'I', '%I0.4', 'DI'),
        tag('RESET_PB', 'Bool', 'I', '%I0.5', 'DI'),
        tag('RUN_CMD', 'Bool', 'Q', '%Q0.0', 'DO'),
        tag('FAULT_LAMP', 'Bool', 'Q', '%Q0.1', 'DO'),
      ],
      '- id: M02\n  model: motor_dol\n  params:\n    startDelayMs: 700\n  signals:\n    runCmd: RUN_CMD\n    runFb: RUN_FB\n',
    );
    const second = await getJson(app, '/api/plant/equipment');
    expect(second.status).toBe(200);
    const equipment2 = second.body['equipment'] as Array<Record<string, unknown>>;
    expect(equipment2).toHaveLength(1);
    expect(equipment2[0]).toMatchObject({ id: 'M02', model: 'motor_dol' });
    expect(equipment2[0]?.['params']).toMatchObject({ startDelayMs: 700 });
  });
});

describe('POST /api/suggest + /api/suggest/apply (OQ-392)', () => {
  it('suggest motor-interlock → 8 tags, 7 gợi ý, 2 tags gán (đo thật commit 1); naming dùng file, không default', async () => {
    const dir = await makeTempProject();
    const app = await makeApp(dir);
    const { status, body } = await postJson(app, '/api/suggest', {});
    expect(status).toBe(200);
    expect(body['stats']).toMatchObject({
      totalTags: 8,
      assignedTags: 2,
      confident: 0,
      review: 6,
      unmatched: 1,
    });
    expect((body['suggestions'] as unknown[]).length).toBe(7);
    expect((body['naming'] as Record<string, unknown>)['usedDefault']).toBe(false);
  });

  it('apply 3 tag CR01_M01 → 200, ghi equipment.yaml + tags.yaml, tag có equipment/role', async () => {
    const dir = await makeTempProject();
    await writeTagsAndEquipment(
      dir,
      [
        tag('CR01_M01_RUN_CMD', 'Bool', 'Q', '%Q0.0', 'DO'),
        tag('CR01_M01_RUN_FB', 'Bool', 'I', '%I0.0', 'DI'),
        tag('CR01_M01_OVL_OK', 'Bool', 'I', '%I0.1', 'DI'),
      ],
      '[]\n',
    );
    const app = await makeApp(dir);
    const sug = await postJson(app, '/api/suggest', {});
    expect(sug.status).toBe(200);
    const suggestions = sug.body['suggestions'] as Array<Record<string, unknown>>;
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.['equipmentId']).toBe('CR01_M01');
    expect(suggestions[0]?.['model']).toBe('motor_dol');
    expect(suggestions[0]?.['status']).toBe('confident');
    expect((suggestions[0]?.['signals'] as unknown[]).length).toBe(3);
    const applied = await postJson(app, '/api/suggest/apply', { accepted: suggestions });
    expect(applied.status).toBe(200);
    expect(applied.body['applied']).toEqual(['CR01_M01']);
    expect(applied.body['filesWritten']).toEqual(['tags/tags.yaml', 'plant/equipment.yaml']);
    const equipmentYaml = await readFile(join(dir, 'plant', 'equipment.yaml'), 'utf8');
    expect(equipmentYaml).toContain('id: CR01_M01');
    expect(equipmentYaml).toContain('model: motor_dol');
    expect(equipmentYaml).toContain('runCmd: CR01_M01_RUN_CMD');
    const tagsYaml = await readFile(join(dir, 'tags', 'tags.yaml'), 'utf8');
    expect(tagsYaml).toContain('equipment: CR01_M01');
    expect(tagsYaml).toContain('role: runFb');
  });

  it('onlyConfident=true trên motor-interlock (0 confident, 6 review) → applied [], không ghi file', async () => {
    const dir = await makeTempProject();
    const equipmentBefore = await readFile(join(dir, 'plant', 'equipment.yaml'), 'utf8');
    const tagsBefore = await readFile(join(dir, 'tags', 'tags.yaml'), 'utf8');
    const app = await makeApp(dir);
    const sug = await postJson(app, '/api/suggest', {});
    const suggestions = sug.body['suggestions'] as Array<Record<string, unknown>>;
    expect(suggestions).toHaveLength(7);
    expect(suggestions.every((s) => s['status'] !== 'confident')).toBe(true);
    const applied = await postJson(app, '/api/suggest/apply', {
      accepted: suggestions,
      onlyConfident: true,
    });
    expect(applied.status).toBe(200);
    expect(applied.body['applied']).toEqual([]);
    expect(applied.body['filesWritten']).toEqual([]);
    expect(await readFile(join(dir, 'plant', 'equipment.yaml'), 'utf8')).toBe(equipmentBefore);
    expect(await readFile(join(dir, 'tags', 'tags.yaml'), 'utf8')).toBe(tagsBefore);
  });

  it('analog_sensor có scaling → apply 200 + autoFilled engMin/engMax/unit; không scaling → 400 PL-E001, không ghi', async () => {
    const scaling = { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: '%' };
    const dirOk = await makeTempProject();
    await writeTagsAndEquipment(
      dirOk,
      [tag('CR01_PT01_PV', 'Int', 'I', '%IW0', 'AI', scaling)],
      '[]\n',
    );
    const appOk = await makeApp(dirOk);
    const sugOk = await postJson(appOk, '/api/suggest', {});
    const suggestionsOk = sugOk.body['suggestions'] as Array<Record<string, unknown>>;
    expect(suggestionsOk).toHaveLength(1);
    expect(suggestionsOk[0]?.['model']).toBe('analog_sensor');
    const appliedOk = await postJson(appOk, '/api/suggest/apply', { accepted: suggestionsOk });
    expect(appliedOk.status).toBe(200);
    expect(appliedOk.body['autoFilled']).toEqual([
      { equipment: 'CR01_PT01', params: { engMin: 0, engMax: 100, unit: '%' } },
    ]);
    const equipmentYaml = await readFile(join(dirOk, 'plant', 'equipment.yaml'), 'utf8');
    expect(equipmentYaml).toContain('engMin: 0');
    expect(equipmentYaml).toContain('engMax: 100');
    expect(equipmentYaml).toContain('unit: "%"');

    const dirNo = await makeTempProject();
    await writeTagsAndEquipment(dirNo, [tag('CR01_PT01_PV', 'Int', 'I', '%IW0', 'AI')], '[]\n');
    const appNo = await makeApp(dirNo);
    const sugNo = await postJson(appNo, '/api/suggest', {});
    const suggestionsNo = sugNo.body['suggestions'] as Array<Record<string, unknown>>;
    const appliedNo = await postJson(appNo, '/api/suggest/apply', { accepted: suggestionsNo });
    expect(appliedNo.status).toBe(400);
    const diags = appliedNo.body['diagnostics'] as Array<{ code: string; message: string }>;
    expect(diags.some((d) => d.code === 'PL-E001' && d.message.includes('engMin'))).toBe(true);
    expect(await readFile(join(dirNo, 'plant', 'equipment.yaml'), 'utf8')).toBe('[]\n');
  });

  it('switch_di thiếu kind → apply 400 PL-E001 (kind không auto-fill được — OQ-392)', async () => {
    const dir = await makeTempProject();
    await writeTagsAndEquipment(
      dir,
      [tag('CR01_LSH01_DI', 'Bool', 'I', '%I0.0', 'DI')],
      '[]\n',
    );
    const app = await makeApp(dir);
    const sug = await postJson(app, '/api/suggest', {});
    const suggestions = sug.body['suggestions'] as Array<Record<string, unknown>>;
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.['model']).toBe('switch_di');
    const applied = await postJson(app, '/api/suggest/apply', { accepted: suggestions });
    expect(applied.status).toBe(400);
    const diags = applied.body['diagnostics'] as Array<{ code: string; message: string }>;
    expect(diags.some((d) => d.code === 'PL-E001' && d.message.includes('kind'))).toBe(true);
  });

  it('accepted sai shape → 400; accepted rỗng → 200 applied []', async () => {
    const dir = await makeTempProject();
    const app = await makeApp(dir);
    const bad = await postJson(app, '/api/suggest/apply', { accepted: [{ model: 'motor_dol' }] });
    expect(bad.status).toBe(400);
    const empty = await postJson(app, '/api/suggest/apply', { accepted: [] });
    expect(empty.status).toBe(200);
    expect(empty.body['applied']).toEqual([]);
  });
});

describe('POST /api/suggest/role-override (OQ-397)', () => {
  it('học token mới → 200, naming.yaml có override; role lạ/token rỗng → 400', async () => {
    const dir = await makeTempProject();
    const app = await makeApp(dir);
    const ok = await postJson(app, '/api/suggest/role-override', {
      token: 'TEST_TOK',
      role: 'runFb',
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ token: 'TEST_TOK', role: 'runFb', file: 'plant/naming.yaml' });
    const naming = await readFile(join(dir, 'plant', 'naming.yaml'), 'utf8');
    expect(naming).toContain('TEST_TOK: runFb');
    expect(naming).toContain('RUN_ST: runFb');
    const badRole = await postJson(app, '/api/suggest/role-override', {
      token: 'X',
      role: 'khongCo',
    });
    expect(badRole.status).toBe(400);
    const badToken = await postJson(app, '/api/suggest/role-override', {
      token: '',
      role: 'runFb',
    });
    expect(badToken.status).toBe(400);
  });
});

describe('POST /api/plant/equipment', () => {
  it('lưu instance motor_dol đủ signals → 200 + ghi file; model lạ → 400; thiếu signals bắt buộc → 400 PL-E003', async () => {
    const dir = await makeTempProject();
    const app = await makeApp(dir);
    const good = await postJson(app, '/api/plant/equipment', {
      equipment: [
        {
          id: 'M01',
          model: 'motor_dol',
          controller: 'PLC1',
          params: { ...(motorDolModel.defaultParams as Record<string, unknown>) },
          signals: { runCmd: 'RUN_CMD', runFb: 'RUN_FB', overloadOk: 'OVL_OK' },
        },
      ],
    });
    expect(good.status).toBe(200);
    expect(good.body['filesWritten']).toEqual(['plant/equipment.yaml']);
    const yaml = await readFile(join(dir, 'plant', 'equipment.yaml'), 'utf8');
    expect(yaml).toContain('id: M01');
    const badModel = await postJson(app, '/api/plant/equipment', {
      equipment: [{ id: 'X1', model: 'khongCo', params: {} }],
    });
    expect(badModel.status).toBe(400);
    const missing = await postJson(app, '/api/plant/equipment', {
      equipment: [
        {
          id: 'M02',
          model: 'motor_dol',
          params: { ...(motorDolModel.defaultParams as Record<string, unknown>) },
          signals: {},
        },
      ],
    });
    expect(missing.status).toBe(400);
    const diags = missing.body['diagnostics'] as Array<{ code: string }>;
    expect(diags.some((d) => d.code === 'PL-E003')).toBe(true);
    const notArray = await postJson(app, '/api/plant/equipment', { equipment: {} });
    expect(notArray.status).toBe(400);
  });
});
