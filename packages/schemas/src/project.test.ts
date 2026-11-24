// Test schema project (M0 §4.4, §12.1: nhóm schema ≥ 35 cùng tags-schema).
import { describe, expect, it } from 'vitest';
import { PROJECT_SHAPE, projectSchema } from './project.js';
import { parseYamlWithSchema, zodIssueParams } from './yaml.js';
import { migrateProject, migrations } from './migrate.js';

const BASE = { schemaVersion: 1, name: 'Demo' };

describe('projectSchema — mặc định', () => {
  it('tài liệu tối thiểu → mặc định đầy đủ', () => {
    const r = projectSchema.safeParse(BASE);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.language).toBe('vi');
      expect(r.data.seed).toBe(1);
      expect(r.data.simulation.stepMs).toBe(10);
      expect(r.data.simulation.plcScanMs).toBe(10); // mặc định = stepMs
      expect(r.data.simulation.timeScale).toBe(1);
      expect(r.data.files.tags).toBe('tags/tags.yaml');
      expect(r.data.controllers).toEqual([]);
    }
  });

  it('plcScanMs riêng được giữ', () => {
    const r = projectSchema.safeParse({ ...BASE, simulation: { stepMs: 10, plcScanMs: 20 } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.simulation.plcScanMs).toBe(20);
  });

  it("timeScale 'max' được chấp nhận", () => {
    const r = projectSchema.safeParse({ ...BASE, simulation: { timeScale: 'max' } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.simulation.timeScale).toBe('max');
  });
});

describe('projectSchema — discriminated union controllers', () => {
  it('builtin cần vendor, model tùy chọn, config mặc định {}', () => {
    const r = projectSchema.safeParse({
      ...BASE,
      controllers: [{ id: 'PLC1', mode: 'builtin', vendor: 'siemens', model: 'S7-1500' }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.controllers[0]).toMatchObject({ mode: 'builtin', config: {} });
  });

  it('builtin thiếu vendor → lỗi', () => {
    const r = projectSchema.safeParse({
      ...BASE,
      controllers: [{ id: 'PLC1', mode: 'builtin' }],
    });
    expect(r.success).toBe(false);
  });

  it('external cần adapter + endpoint', () => {
    const ok = projectSchema.safeParse({
      ...BASE,
      controllers: [
        { id: 'PLC2', mode: 'external', adapter: 'opcua', endpoint: 'opc.tcp://127.0.0.1:4840' },
      ],
    });
    expect(ok.success).toBe(true);
    const bad = projectSchema.safeParse({
      ...BASE,
      controllers: [{ id: 'PLC2', mode: 'external', adapter: 'opcua' }],
    });
    expect(bad.success).toBe(false);
  });

  it('mode lạ → lỗi (discriminated union)', () => {
    const r = projectSchema.safeParse({
      ...BASE,
      controllers: [{ id: 'PLC1', mode: 'weird' }],
    });
    expect(r.success).toBe(false);
  });

  it('id controller sai định dạng → lỗi', () => {
    for (const id of ['1PLC', 'PLC 1', 'a'.repeat(33)]) {
      const r = projectSchema.safeParse({
        ...BASE,
        controllers: [{ id, mode: 'builtin', vendor: 'demo' }],
      });
      expect(r.success).toBe(false);
    }
  });

  it('id controller trùng → lỗi', () => {
    const r = projectSchema.safeParse({
      ...BASE,
      controllers: [
        { id: 'PLC1', mode: 'builtin', vendor: 'demo' },
        { id: 'PLC1', mode: 'builtin', vendor: 'demo' },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe('projectSchema — PRJ-E007', () => {
  it('stepMs = 0 → lỗi E007 (qua superRefine)', () => {
    const r = projectSchema.safeParse({ ...BASE, simulation: { stepMs: 0 } });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(zodIssueParams(r.error.issues[0]).diagnosticCode).toBe('PRJ-E007');
    }
  });

  it('plcScanMs < stepMs → lỗi E007', () => {
    const r = projectSchema.safeParse({
      ...BASE,
      simulation: { stepMs: 20, plcScanMs: 10 },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(zodIssueParams(r.error.issues[0]).diagnosticCode).toBe('PRJ-E007');
    }
  });

  it('schemaVersion khác 1 vẫn parse được ở tầng schema (E006 do loadProject báo)', () => {
    const r = projectSchema.safeParse({ schemaVersion: 2, name: 'Demo' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.schemaVersion).toBe(2);
  });
});

describe('migrateProject', () => {
  it('bảng migrations rỗng ở M0', () => {
    expect(migrations).toEqual([]);
  });

  it('doc schemaVersion 1 → không áp migrate nào', () => {
    expect(migrateProject({ schemaVersion: 1, name: 'X' })).toEqual({
      doc: { schemaVersion: 1, name: 'X' },
      applied: [],
    });
  });

  it('doc không phải object → trả nguyên', () => {
    expect(migrateProject('nope')).toEqual({ doc: 'nope', applied: [] });
    expect(migrateProject(null)).toEqual({ doc: null, applied: [] });
  });
});

describe('projectSchema — files.comms/hmi (P0.8, B5)', () => {
  it('vắng files → defaults đầy đủ', () => {
    const r = projectSchema.safeParse(BASE);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.files).toEqual({
        tags: 'tags/tags.yaml',
        comms: 'comms/comms.yaml',
        hmi: 'hmi/',
      });
    }
  });

  it('files chỉ có tags → comms/hmi lấy default', () => {
    const r = projectSchema.safeParse({ ...BASE, files: { tags: 't/tags.yaml' } });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.files).toEqual({
        tags: 't/tags.yaml',
        comms: 'comms/comms.yaml',
        hmi: 'hmi/',
      });
    }
  });

  it('files.comms/hmi tường minh được giữ', () => {
    const r = projectSchema.safeParse({
      ...BASE,
      files: { tags: 't/tags.yaml', comms: 'c/c.yaml', hmi: 'h/' },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.files).toEqual({ tags: 't/tags.yaml', comms: 'c/c.yaml', hmi: 'h/' });
    }
  });

  it('files.comms/hmi không báo PRJ-W001', () => {
    const text = `schemaVersion: 1
name: Demo
files:
  tags: tags/tags.yaml
  comms: comms/comms.yaml
  hmi: hmi/
`;
    const r = parseYamlWithSchema('vcs.project.yaml', text, projectSchema, {
      shape: PROJECT_SHAPE,
    });
    expect(r.diagnostics.map((d) => d.code)).not.toContain('PRJ-W001');
    expect(r.value?.files).toEqual({
      tags: 'tags/tags.yaml',
      comms: 'comms/comms.yaml',
      hmi: 'hmi/',
    });
  });
});
