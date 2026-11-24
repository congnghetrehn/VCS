// Test yaml.ts (M0 §4.3, §12.1: ≥ 20).
// Vị trí dòng/cột được tính tay từ văn bản mẫu (không sao chép từ implementation).
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { parseYamlWithSchema, type YamlShape } from './yaml.js';
import { projectSchema, PROJECT_SHAPE } from './project.js';
import { tagsFileSchema, TAGS_SHAPE } from './tags.js';

const smallSchema = z.object({
  name: z.string(),
  count: z.number(),
  tags: z.array(z.object({ kind: z.enum(['DI', 'DO']) })).default([]),
});
const SMALL_SHAPE: YamlShape = {
  keys: ['name', 'count', 'tags'],
  children: { tags: { items: { keys: ['kind'] } } },
};

describe('lỗi cú pháp YAML → PRJ-E002', () => {
  it('thụt đầu dòng bằng tab → E002 tại đúng dòng/cột', () => {
    const text = 'name: Test\n\tcount: 3\n';
    const r = parseYamlWithSchema('a.yaml', text, smallSchema);
    expect(r.value).toBeUndefined();
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0]?.code).toBe('PRJ-E002');
    expect(r.diagnostics[0]?.line).toBe(2);
    expect(r.diagnostics[0]?.col).toBe(1);
  });

  it('khóa trùng → E002', () => {
    const text = 'name: A\nname: B\ncount: 1\n';
    const r = parseYamlWithSchema('a.yaml', text, smallSchema);
    expect(r.diagnostics.some((d) => d.code === 'PRJ-E002')).toBe(true);
  });

  it('flow mapping không đóng → E002 (parser báo tại cuối văn bản, dòng 3)', () => {
    const text = 'name: Test\ncount: [1, 2\n';
    const r = parseYamlWithSchema('a.yaml', text, smallSchema);
    expect(r.diagnostics[0]?.code).toBe('PRJ-E002');
    expect(r.diagnostics[0]?.line).toBe(3);
    expect(r.diagnostics[0]?.col).toBe(1);
  });
});

describe('ánh xạ issue.path → dòng/cột', () => {
  it("count sai kiểu → E003 tại dòng 2, cột của giá trị 'x'", () => {
    const text = 'name: Test\ncount: "x"\n';
    const r = parseYamlWithSchema('a.yaml', text, smallSchema);
    expect(r.value).toBeUndefined();
    const d = r.diagnostics.find((x) => x.code === 'PRJ-E003');
    expect(d?.line).toBe(2);
    expect(d?.col).toBe(8); // count: "x" — giá trị bắt đầu cột 8
    expect(d?.message).toContain('count');
  });

  it("tags[1].kind = 'DX' → E003 với thông điệp thân thiện", () => {
    const text = 'name: Test\ncount: 1\ntags:\n  - kind: DI\n  - kind: DX\n';
    const r = parseYamlWithSchema('a.yaml', text, smallSchema);
    const d = r.diagnostics.find((x) => x.code === 'PRJ-E003');
    expect(d?.line).toBe(5);
    expect(d?.col).toBe(11); // "  - kind: DX" — DX bắt đầu cột 11
    expect(d?.message).toContain('tags[1].kind');
    expect(d?.message).toContain("'DX'");
    expect(d?.message).toContain('DI, DO');
  });

  it('khóa bắt buộc thiếu → E003 tại vị trí map cha', () => {
    const text = 'count: 1\n';
    const r = parseYamlWithSchema('a.yaml', text, smallSchema);
    const d = r.diagnostics.find((x) => x.code === 'PRJ-E003');
    expect(d?.line).toBe(1);
    expect(d?.message).toContain('name');
  });

  it('nhiều lỗi → báo hết, sắp theo vị trí', () => {
    const text = 'name: 1\ncount: "x"\ntags:\n  - kind: DX\n';
    const r = parseYamlWithSchema('a.yaml', text, smallSchema);
    expect(r.diagnostics.filter((d) => d.code === 'PRJ-E003')).toHaveLength(3);
    const lines = r.diagnostics.map((d) => d.line ?? 0);
    expect([...lines].sort((a, b) => a - b)).toEqual(lines);
  });

  it('locate() trả đúng vị trí của tags[0].kind', () => {
    const text = 'name: Test\ncount: 1\ntags:\n  - kind: DI\n';
    const r = parseYamlWithSchema('a.yaml', text, smallSchema);
    expect(r.locate(['tags', 0, 'kind'])).toEqual(
      expect.objectContaining({ file: 'a.yaml', line: 4, col: 11 }),
    );
  });
});

describe('khóa lạ → PRJ-W001', () => {
  it("khóa 'nam' gần 'name' → cảnh báo + gợi ý (và E003 vì thiếu 'name')", () => {
    const text = 'nam: Test\ncount: 1\n';
    const r = parseYamlWithSchema('a.yaml', text, smallSchema, { shape: SMALL_SHAPE });
    expect(r.value).toBeUndefined();
    expect(r.diagnostics.some((d) => d.code === 'PRJ-E003')).toBe(true);
    const w = r.diagnostics.find((d) => d.code === 'PRJ-W001');
    expect(w?.severity).toBe('warning');
    expect(w?.line).toBe(1);
    expect(w?.col).toBe(1);
    expect(w?.message).toContain("khóa lạ 'nam'");
    expect(w?.message).toContain("ý bạn là 'name'?");
  });

  it("khóa 'zzzz' xa mọi khóa → cảnh báo không gợi ý", () => {
    const text = 'name: Test\ncount: 1\nzzzz: 2\n';
    const r = parseYamlWithSchema('a.yaml', text, smallSchema, { shape: SMALL_SHAPE });
    const w = r.diagnostics.find((d) => d.code === 'PRJ-W001');
    expect(w?.message).toContain("khóa lạ 'zzzz'");
    expect(w?.message).not.toContain('ý bạn là');
  });

  it('khóa lạ bị bỏ nhưng giá trị vẫn trả về', () => {
    const text = 'name: Test\ncount: 2\nextra: 9\n';
    const r = parseYamlWithSchema('a.yaml', text, smallSchema, { shape: SMALL_SHAPE });
    expect(r.value).toEqual({ name: 'Test', count: 2, tags: [] });
    expect(r.diagnostics.some((d) => d.severity === 'error')).toBe(false);
  });

  it('khóa lạ lồng trong tags item cũng bị phát hiện', () => {
    const text = 'name: Test\ncount: 1\ntags:\n  - kind: DI\n    knd: DO\n';
    const r = parseYamlWithSchema('a.yaml', text, smallSchema, { shape: SMALL_SHAPE });
    const w = r.diagnostics.find((d) => d.code === 'PRJ-W001');
    expect(w?.line).toBe(5);
    expect(w?.message).toContain("khóa lạ 'knd'");
  });
});

describe('chuẩn hóa đầu vào', () => {
  it('BOM + CRLF vẫn parse đúng, vị trí tính theo dòng đã chuẩn hóa', () => {
    const text = '\uFEFFname: Test\r\ncount: "x"\r\n';
    const r = parseYamlWithSchema('a.yaml', text, smallSchema);
    const d = r.diagnostics.find((x) => x.code === 'PRJ-E003');
    expect(d?.line).toBe(2);
    expect(d?.col).toBe(8);
  });

  it('văn bản rỗng → E003 (không phải crash)', () => {
    const r = parseYamlWithSchema('a.yaml', '', smallSchema);
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });
});

describe('ánh xạ trên schema thật', () => {
  it('project: vendor sai → E003 tại đúng dòng của vendor', () => {
    const text = [
      'schemaVersion: 1',
      'name: Demo',
      'controllers:',
      '  - id: PLC1',
      '    mode: builtin',
      '    vendor: acme',
      '',
    ].join('\n');
    const r = parseYamlWithSchema('vcs.project.yaml', text, projectSchema, {
      shape: PROJECT_SHAPE,
    });
    const d = r.diagnostics.find((x) => x.code === 'PRJ-E003');
    expect(d?.line).toBe(6);
    expect(d?.message).toContain('vendor');
    expect(d?.message).toContain('acme');
  });

  it('tags: trùng tên không phân biệt hoa/thường → PRJ-E004 + related', () => {
    const text = [
      'tags:',
      '  - name: BTN_START',
      '    type: Bool',
      '    area: I',
      '    address: "%I0.0"',
      '    controller: PLC1',
      '  - name: btn_start',
      '    type: Bool',
      '    area: I',
      '    address: "%I0.1"',
      '    controller: PLC1',
      '',
    ].join('\n');
    const r = parseYamlWithSchema('tags.yaml', text, tagsFileSchema, { shape: TAGS_SHAPE });
    const d = r.diagnostics.find((x) => x.code === 'PRJ-E004');
    expect(d?.line).toBe(7);
    expect(d?.related?.[0]?.line).toBe(2);
    expect(d?.related?.[0]?.file).toBe('tags.yaml');
  });

  it("khóa lạ lồng trong controllers item → W001 tại đúng dòng của 'foo' (dòng 7)", () => {
    const text = [
      'schemaVersion: 1',
      'name: Demo',
      'controllers:',
      '  - id: PLC1',
      '    mode: builtin',
      '    vendor: demo',
      '    foo: 1',
      '',
    ].join('\n');
    const r = parseYamlWithSchema('vcs.project.yaml', text, projectSchema, {
      shape: PROJECT_SHAPE,
    });
    const w = r.diagnostics.find((x) => x.code === 'PRJ-W001');
    expect(w?.message).toContain("khóa lạ 'foo'");
    expect(w?.line).toBe(7);
    expect(r.value).toBeDefined();
  });

  it("khóa 'controlers' (thiếu chữ l) → W001 kèm gợi ý 'controllers'", () => {
    const text = ['schemaVersion: 1', 'name: Demo', 'controlers:', '  - id: PLC1', ''].join('\n');
    const r = parseYamlWithSchema('vcs.project.yaml', text, projectSchema, {
      shape: PROJECT_SHAPE,
    });
    const w = r.diagnostics.find((x) => x.code === 'PRJ-W001');
    expect(w?.message).toContain('controlers');
    expect(w?.message).toContain("ý bạn là 'controllers'?");
  });

  it('simulation.stepMs = 0 → PRJ-E007 tại dòng 4', () => {
    const text = ['schemaVersion: 1', 'name: Demo', 'simulation:', '  stepMs: 0', ''].join('\n');
    const r = parseYamlWithSchema('vcs.project.yaml', text, projectSchema, {
      shape: PROJECT_SHAPE,
    });
    const d = r.diagnostics.find((x) => x.code === 'PRJ-E007');
    expect(d?.line).toBe(4);
    expect(d?.message).toContain('stepMs phải là số nguyên ≥ 1');
  });

  it('khóa lạ + lỗi type cùng lúc → cả W001 và E003', () => {
    const text = 'nam: A\ncount: x\n';
    const r = parseYamlWithSchema('a.yaml', text, smallSchema, { shape: SMALL_SHAPE });
    expect(r.diagnostics.some((d) => d.code === 'PRJ-W001')).toBe(true);
    expect(r.diagnostics.some((d) => d.code === 'PRJ-E003')).toBe(true);
  });

  it('văn bản chỉ có comment → E003, không crash', () => {
    const r = parseYamlWithSchema('a.yaml', '# chỉ comment\n', smallSchema, { shape: SMALL_SHAPE });
    expect(r.value).toBeUndefined();
    expect(r.diagnostics.some((d) => d.code === 'PRJ-E003')).toBe(true);
  });
});
