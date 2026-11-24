// Test loadProject (M0 §5, §12.1: nhóm loadProject ≥ 15).
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadProject, memoryFS, nodeFS } from './index.js';

const HELLO_TAGS_DIR = join(
  fileURLToPath(new URL('../../..', import.meta.url)),
  'examples',
  'hello-tags',
);

const PROJECT = `schemaVersion: 1
name: Hello Tags
language: vi
seed: 1
simulation:
  stepMs: 10
  plcScanMs: 20
controllers:
  - id: PLC1
    mode: builtin
    vendor: demo
    model: loopback
`;

const TAGS = `tags:
  - name: BTN_START
    type: Bool
    area: I
    address: "%I0.0"
    controller: PLC1
    signal:
      kind: DI
  - name: PT01
    type: Int
    area: I
    address: "%IW64"
    controller: PLC1
    signal:
      kind: AI
      scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 10, unit: bar }
  - name: LAMP_RUN
    type: Bool
    area: Q
    address: "%Q0.0"
    controller: PLC1
    signal:
      kind: DO
`;

function fsWith(project: string, tags?: string): ReturnType<typeof memoryFS> {
  const files: Record<string, string> = { 'vcs.project.yaml': project };
  if (tags !== undefined) files['tags/tags.yaml'] = tags;
  return memoryFS(files);
}

describe('loadProject — dự án hợp lệ', () => {
  it('valid=true, config/tags/catalog đầy đủ, giữ thứ tự tags trong file', async () => {
    const model = await loadProject(fsWith(PROJECT, TAGS));
    expect(model.valid).toBe(true);
    expect(model.diagnostics).toEqual([]);
    expect(model.config.name).toBe('Hello Tags');
    expect(model.config.simulation.stepMs).toBe(10);
    expect(model.config.simulation.plcScanMs).toBe(20);
    expect(model.tags.map((t) => t.name)).toEqual(['BTN_START', 'PT01', 'LAMP_RUN']);
    expect(model.catalog.get('PT01')?.type).toBe('Int');
    expect(model.catalog.byController('PLC1')).toHaveLength(3);
  });

  it('hash tất định và không phụ thuộc thứ tự đọc file', async () => {
    const a = await loadProject(fsWith(PROJECT, TAGS));
    const b = await loadProject(fsWith(PROJECT, TAGS));
    expect(a.hash).toBe(b.hash);
    expect(a.files.map((f) => f.path)).toEqual(['tags/tags.yaml', 'vcs.project.yaml']);
  });

  it('CRLF và LF cho cùng hash (chuẩn hóa văn bản)', async () => {
    const crlf = await loadProject(
      fsWith(PROJECT.replace(/\n/g, '\r\n'), TAGS.replace(/\n/g, '\r\n')),
    );
    const lf = await loadProject(fsWith(PROJECT, TAGS));
    expect(crlf.hash).toBe(lf.hash);
  });

  it('thiếu tags.yaml → W002, tags rỗng, vẫn valid', async () => {
    const model = await loadProject(fsWith(PROJECT));
    expect(model.valid).toBe(true);
    expect(model.tags).toEqual([]);
    expect(model.diagnostics.map((d) => d.code)).toEqual(['PRJ-W002']);
  });
});

describe('loadProject — lỗi', () => {
  it('thiếu vcs.project.yaml → PRJ-E001, valid=false', async () => {
    const model = await loadProject(memoryFS({}));
    expect(model.valid).toBe(false);
    expect(model.diagnostics.map((d) => d.code)).toEqual(['PRJ-E001']);
    expect(model.tags).toEqual([]);
  });

  it('schemaVersion 2 → PRJ-E006', async () => {
    const model = await loadProject(
      fsWith(PROJECT.replace('schemaVersion: 1', 'schemaVersion: 2'), TAGS),
    );
    expect(model.valid).toBe(false);
    expect(model.diagnostics.some((d) => d.code === 'PRJ-E006')).toBe(true);
  });

  it('stepMs 0 → PRJ-E007', async () => {
    const bad = PROJECT.replace('stepMs: 10', 'stepMs: 0');
    const model = await loadProject(fsWith(bad, TAGS));
    expect(model.diagnostics.some((d) => d.code === 'PRJ-E007')).toBe(true);
    expect(model.valid).toBe(false);
  });

  it('trùng tag → PRJ-E004 (kèm related)', async () => {
    const dup = `${TAGS}  - name: btn_start\n    type: Bool\n    area: I\n    address: "%I0.1"\n    controller: PLC1\n`;
    const model = await loadProject(fsWith(PROJECT, dup));
    const d = model.diagnostics.find((x) => x.code === 'PRJ-E004');
    expect(d).toBeDefined();
    expect(d?.related?.[0]?.line).toBe(2);
    expect(model.valid).toBe(false);
  });

  it('controller không tồn tại → PRJ-E005 tại đúng dòng của controller', async () => {
    const badTags = TAGS.replace('controller: PLC1', 'controller: PLC9');
    const model = await loadProject(fsWith(PROJECT, badTags));
    const d = model.diagnostics.find((x) => x.code === 'PRJ-E005');
    expect(d?.line).toBe(6); // controller của tag đầu ở dòng 6
    expect(d?.message).toContain('PLC9');
    expect(model.valid).toBe(false);
  });

  it('cú pháp YAML sai trong project → PRJ-E002', async () => {
    const model = await loadProject(fsWith('schemaVersion: 1\nname: [\n', TAGS));
    expect(model.diagnostics.some((d) => d.code === 'PRJ-E002')).toBe(true);
    expect(model.valid).toBe(false);
  });

  it("khóa lạ 'nmae' → PRJ-W001 kèm gợi ý, vẫn valid", async () => {
    const model = await loadProject(
      fsWith(PROJECT.replace('name: Hello Tags', 'nmae: Hello Tags\nname: Hello Tags'), TAGS),
    );
    const w = model.diagnostics.find((d) => d.code === 'PRJ-W001');
    expect(w?.message).toContain("ý bạn là 'name'?");
    expect(model.valid).toBe(true);
  });

  it('signal.kind sai area → PRJ-E010 qua loadProject', async () => {
    const badTags = TAGS.replace('area: Q', 'area: I');
    const model = await loadProject(fsWith(PROJECT, badTags));
    expect(model.diagnostics.some((d) => d.code === 'PRJ-E010')).toBe(true);
  });

  it('địa chỉ tag sai định dạng → PRJ-E003', async () => {
    const badTags = TAGS.replace('"%I0.0"', '"hello"');
    const model = await loadProject(fsWith(PROJECT, badTags));
    expect(model.diagnostics.some((d) => d.code === 'PRJ-E003')).toBe(true);
  });
});

describe('loadProject — địa chỉ sym: (P0.8, C2)', () => {
  const TAGS_SYM = `${TAGS}  - name: MOTOR_START
    type: Bool
    area: I
    address: 'sym:"DB_Motor"."M01"."Start"'
    controller: PLC1
    signal:
      kind: DI
`;

  it('project có tag address sym: → nạp ok, không diagnostic', async () => {
    const model = await loadProject(fsWith(PROJECT, TAGS_SYM));
    expect(model.valid).toBe(true);
    expect(model.diagnostics).toEqual([]);
    expect(model.tags).toHaveLength(4);
  });

  it('address sym: giữ nguyên văn trong tags và catalog', async () => {
    const model = await loadProject(fsWith(PROJECT, TAGS_SYM));
    expect(model.tags[3]?.address).toBe('sym:"DB_Motor"."M01"."Start"');
    expect(model.catalog.get('MOTOR_START')?.address).toBe('sym:"DB_Motor"."M01"."Start"');
  });
});

describe('loadProject — hash hello-tags không đổi sau P0.8 (B5)', () => {
  it('hash ghim trước thay đổi; files có defaults comms/hmi', async () => {
    const model = await loadProject(nodeFS(HELLO_TAGS_DIR));
    expect(model.valid).toBe(true);
    expect(model.hash).toBe(
      'ac669d063454a5c749e8ee6783a11cfbd8b29d9b5e4247a136d4ba719a9daa05',
    );
    expect(model.config.files).toEqual({
      tags: 'tags/tags.yaml',
      comms: 'comms/comms.yaml',
      hmi: 'hmi/',
    });
  });
});
