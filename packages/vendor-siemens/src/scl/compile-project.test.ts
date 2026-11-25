// Test `compileProject` — @vcs/vendor-siemens (M1 §10, P1.7).
// Discovery + ctx chung SCL/LAD + tag resolution OQ-198.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hasErrors } from '@vcs/schemas';
import type { TagDef } from '@vcs/schemas';
import { compileProject } from './compile-project.js';
import type { ProjectSourceFile } from './compile-project.js';

const DEMO_DIR = fileURLToPath(new URL('../../../../examples/motor-interlock/plc/', import.meta.url));

function readDemo(name: string): string {
  return readFileSync(`${DEMO_DIR}${name}`, 'utf-8');
}

const DEMO_TAGS: TagDef[] = [
  { name: 'START_PB', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1' },
  { name: 'STOP_OK', type: 'Bool', area: 'I', address: '%I0.1', controller: 'PLC1' },
  { name: 'OVL_OK', type: 'Bool', area: 'I', address: '%I0.2', controller: 'PLC1' },
  { name: 'PERM', type: 'Bool', area: 'I', address: '%I0.3', controller: 'PLC1' },
  { name: 'RUN_FB', type: 'Bool', area: 'I', address: '%I0.4', controller: 'PLC1' },
  { name: 'RESET_PB', type: 'Bool', area: 'I', address: '%I0.5', controller: 'PLC1' },
  { name: 'RUN_CMD', type: 'Bool', area: 'Q', address: '%Q0.0', controller: 'PLC1' },
  { name: 'FAULT_LAMP', type: 'Bool', area: 'Q', address: '%Q0.1', controller: 'PLC1' },
];

const DEMO_FILES: ProjectSourceFile[] = [
  { path: 'plc/FB_Motor.scl', text: readDemo('FB_Motor.scl') },
  { path: 'plc/OB1.scl', text: readDemo('OB1.scl') },
  { path: 'plc/FB_Motor_DB.scl', text: readDemo('FB_Motor_DB.scl') },
];

const OB_TAG = `ORGANIZATION_BLOCK "Main"
BEGIN
  "OUT" := "IN_TAG";
END_ORGANIZATION_BLOCK`;

describe('compileProject — demo motor-interlock (OQ-198/202)', () => {
  it('biên dịch đủ 3 file demo, không lỗi; program có 2 block + 1 DB', () => {
    const { program, diagnostics } = compileProject(DEMO_FILES, { tags: DEMO_TAGS });
    expect(diagnostics).toEqual([]);
    expect(program.blocks.map((b) => b.id).sort()).toEqual(['FB_Motor', 'Main']);
    expect(program.dbs.map((d) => d.name)).toEqual(['FB_Motor_DB']);
    expect(program.organization).toEqual([{ ob: 1, block: 'Main' }]);
  });

  it('OB1: "START_PB" hạ thành abs %I0.0, "RUN_CMD" hạ thành abs %Q0.0', () => {
    const { program, diagnostics } = compileProject(DEMO_FILES, { tags: DEMO_TAGS });
    expect(diagnostics).toEqual([]);
    const ob1 = program.blocks.find((b) => b.id === 'Main');
    expect(ob1).toBeDefined();
    const json = JSON.stringify(ob1);
    expect(json).toContain('"k":"abs","area":"I","byte":0,"bit":0');
    expect(json).toContain('"k":"abs","area":"Q","byte":0,"bit":0');
    expect(json).not.toContain('"k":"dbField","db":"START_PB"');
  });

  it('không có bảng tag → "START_PB" vẫn T001 (hành vi P1.3)', () => {
    const { diagnostics } = compileProject(DEMO_FILES, { tags: [] });
    expect(hasErrors(diagnostics)).toBe(true);
    expect(diagnostics.some((d) => d.code === 'SCL-T001' && d.message.includes('START_PB'))).toBe(
      true,
    );
    expect(diagnostics.some((d) => d.code === 'SCL-T001' && d.message.includes('RUN_CMD'))).toBe(
      true,
    );
  });

  it('tag ở vị trí giá trị mà không có bảng tag → T001, nêu đúng tên', () => {
    const src = `ORGANIZATION_BLOCK "Main"
BEGIN
  %Q0.0 := "NO_SUCH_TAG";
END_ORGANIZATION_BLOCK`;
    const { diagnostics } = compileProject([{ path: 'plc/OB1.scl', text: src }], {
      tags: [],
    });
    expect(hasErrors(diagnostics)).toBe(true);
    expect(diagnostics.some((d) => d.code === 'SCL-T001' && d.message.includes('NO_SUCH_TAG'))).toBe(
      true,
    );
  });

  it('tag khớp không phân biệt hoa/thường ("start_pb" → START_PB)', () => {
    const src = `ORGANIZATION_BLOCK "Main"
BEGIN
  "RUN_CMD" := "start_pb";
END_ORGANIZATION_BLOCK`;
    const { diagnostics } = compileProject([{ path: 'plc/OB1.scl', text: src }], {
      tags: DEMO_TAGS,
    });
    expect(diagnostics).toEqual([]);
  });

  it('tag không che tên DB: "FB_Motor_DB" vẫn là DB dù có tag trùng tên', () => {
    const tags: TagDef[] = [
      ...DEMO_TAGS,
      { name: 'FB_Motor_DB', type: 'Bool', area: 'M', address: '%M9.0', controller: 'PLC1' },
    ];
    const { program, diagnostics } = compileProject(DEMO_FILES, { tags });
    expect(diagnostics).toEqual([]);
    const ob1 = program.blocks.find((b) => b.id === 'Main');
    expect(JSON.stringify(ob1)).toContain('"k":"dbField","db":"FB_Motor_DB"');
  });

  it('"TAG" làm đối gán (target) cũng hạ thành abs', () => {
    const { program, diagnostics } = compileProject(
      [{ path: 'plc/OB1.scl', text: OB_TAG }],
      {
        tags: [
          { name: 'IN_TAG', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1' },
          { name: 'OUT', type: 'Bool', area: 'Q', address: '%Q0.0', controller: 'PLC1' },
        ],
      },
    );
    expect(diagnostics).toEqual([]);
    const json = JSON.stringify(program.blocks[0]);
    expect(json).toContain('"k":"abs","area":"Q","byte":0,"bit":0');
  });

  it('discovery: file lạ bị bỏ qua; file .scl biên dịch theo tên tăng dần', () => {
    const { program, diagnostics } = compileProject(
      [
        { path: 'plc/z-notes.txt', text: 'không phải SCL' },
        { path: 'plc/b.scl', text: 'ORGANIZATION_BLOCK "B"\nBEGIN\nEND_ORGANIZATION_BLOCK' },
        { path: 'plc/a.scl', text: 'ORGANIZATION_BLOCK "A"\nBEGIN\nEND_ORGANIZATION_BLOCK' },
      ],
      { tags: [] },
    );
    expect(diagnostics).toEqual([]);
    expect(program.blocks.map((b) => b.id)).toEqual(['A', 'B']);
  });

  it('dir rỗng → program rỗng, không diagnostics', () => {
    const { program, diagnostics } = compileProject([], { tags: [] });
    expect(diagnostics).toEqual([]);
    expect(program).toEqual({ blocks: [], dbs: [], udts: [], organization: [] });
  });

  it('lỗi gộp nhiều file (mỗi file một T001)', () => {
    const { diagnostics } = compileProject(
      [
        { path: 'plc/a.scl', text: 'ORGANIZATION_BLOCK "A"\nBEGIN\n  %Q0.0 := "MISSING_A";\nEND_ORGANIZATION_BLOCK' },
        { path: 'plc/b.scl', text: 'ORGANIZATION_BLOCK "B"\nBEGIN\n  %Q0.1 := "MISSING_B";\nEND_ORGANIZATION_BLOCK' },
      ],
      { tags: [] },
    );
    const t001 = diagnostics.filter((d) => d.code === 'SCL-T001');
    expect(t001.length).toBe(2);
    expect(t001.map((d) => d.file).sort()).toEqual(['plc/a.scl', 'plc/b.scl']);
  });

  it('LAD sau SCL: LAD tham chiếu DB từ SCL biên dịch được', () => {
    const lad = JSON.stringify({
      name: 'Main',
      kind: 'OB',
      interface: {},
      networks: [
        {
          id: 'N1',
          rung: [
            { t: 'contact', mode: 'NO', operand: { sym: 'START_PB' } },
            { t: 'coil', mode: 'normal', operand: { abs: '%Q0.0' } },
          ],
        },
      ],
    });
    const { program, diagnostics } = compileProject(
      [
        { path: 'plc/FB_Motor.scl', text: readDemo('FB_Motor.scl') },
        { path: 'plc/FB_Motor_DB.scl', text: readDemo('FB_Motor_DB.scl') },
        { path: 'plc/main.lad.json', text: lad },
      ],
      { tags: DEMO_TAGS },
    );
    expect(diagnostics).toEqual([]);
    expect(program.blocks.map((b) => b.id).sort()).toEqual(['FB_Motor', 'main']);
  });

  it('file .lad.json không phải JSON → LAD-S001', () => {
    const { diagnostics } = compileProject([{ path: 'plc/x.lad.json', text: '{không json' }], {
      tags: [],
    });
    expect(hasErrors(diagnostics)).toBe(true);
    expect(diagnostics.some((d) => d.code === 'LAD-S001' && d.file === 'plc/x.lad.json')).toBe(true);
  });
});
