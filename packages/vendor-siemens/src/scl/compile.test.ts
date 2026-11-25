import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileScl, compileSclProgram, createCompileContext, irToJson } from './compile.js';

const GOLDEN_DIR = fileURLToPath(new URL('./golden/', import.meta.url));

function readGolden(name: string): string {
  return readFileSync(`${GOLDEN_DIR}${name}`, 'utf-8');
}

// Nguồn đúng của 3 golden (khôi phục từ JSON + bảng B — xem STATE §18).
const FB_MOTOR = `FUNCTION_BLOCK "FB_Motor"
VAR_INPUT
  iStart : Bool;
  iStop : Bool;
END_VAR
VAR_OUTPUT
  qRun : Bool;
END_VAR
VAR
  latched : Bool;
END_VAR
BEGIN
  IF #iStart THEN
    #latched := TRUE;
  END_IF;
  IF #iStop THEN
    #latched := FALSE;
  END_IF;
  #qRun := #latched;
END_FUNCTION_BLOCK`;

const FC_SCALE = `FUNCTION "FC_Scale"
VAR_INPUT
  raw : Int;
END_VAR
VAR_OUTPUT
  scaled : Real;
END_VAR
BEGIN
  #scaled := #raw * 2;
END_FUNCTION`;

const DB_MOTOR = `TYPE "UDT_Motor"
STRUCT
  speed : Int;
  run : Bool;
END_STRUCT;
END_TYPE
DATA_BLOCK "DB_Motor"
STRUCT
  speed : Int;
  run : Bool;
END_STRUCT;
BEGIN
  "DB_Motor".speed := 1500;
END_DATA_BLOCK`;

describe('E1–E3 — golden IR dump (so sánh string từng byte)', () => {
  it('E1: FB_Motor → fb-motor.json', () => {
    const { program, diagnostics } = compileSclProgram(FB_MOTOR, 'FB_Motor.scl');
    expect(diagnostics).toEqual([]);
    expect(irToJson(program)).toBe(readGolden('fb-motor.json'));
  });

  it('E2: FC_Scale → fc-scale.json', () => {
    const { program, diagnostics } = compileSclProgram(FC_SCALE, 'FC_Scale.scl');
    expect(diagnostics).toEqual([]);
    expect(irToJson(program)).toBe(readGolden('fc-scale.json'));
  });

  it('E3: UDT_Motor + DB_Motor → db-motor.json', () => {
    const { program, diagnostics } = compileSclProgram(DB_MOTOR, 'DB_Motor.scl');
    expect(diagnostics).toEqual([]);
    expect(irToJson(program)).toBe(readGolden('db-motor.json'));
  });

  it('dump 2 lần ra string giống hệt theo từng byte (tất định)', () => {
    const a = irToJson(compileSclProgram(FB_MOTOR, 'FB_Motor.scl').program);
    const b = irToJson(compileSclProgram(FB_MOTOR, 'FB_Motor.scl').program);
    expect(a).toBe(b);
  });
});

describe('compileScl — chữ ký M1 §10', () => {
  it('trả blocks của file này; UDT/DB không nằm trong blocks', () => {
    const ctx = createCompileContext();
    const r = compileScl(DB_MOTOR, 'DB_Motor.scl', ctx);
    expect(r.diagnostics).toEqual([]);
    expect(r.blocks).toEqual([]);
    // UDT/DB nằm trong ctx — lần compile sau thấy được.
    expect(ctx.udts.has('udt_motor')).toBe(true);
    expect(ctx.dbs.has('db_motor')).toBe(true);
  });

  it('lỗi parse → blocks rỗng, không lower', () => {
    const r = compileScl('FUNCTION_BLOCK "X"\nBEGIN\n', 'X.scl');
    expect(r.blocks).toEqual([]);
    expect(r.diagnostics.some((d) => d.code.startsWith('SCL-P'))).toBe(true);
  });

  it('lỗi typecheck → blocks rỗng + diagnostics gộp, sort theo vị trí', () => {
    const src = `ORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  x : Int;\nEND_VAR\nBEGIN\n  #x := #y;\n  #x := "NoSuch"(i := 1);\nEND_ORGANIZATION_BLOCK`;
    const r = compileScl(src, 'T.scl');
    expect(r.blocks).toEqual([]);
    expect(r.diagnostics).toHaveLength(2);
    expect(r.diagnostics[0]?.line).toBeLessThanOrEqual(r.diagnostics[1]?.line ?? 0);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['SCL-T001', 'SCL-T001']);
  });

  it('warning W001 không chặn compile', () => {
    const src = `ORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  x : Int;\n  y : Int;\nEND_VAR\nBEGIN\n  #x := #y;\nEND_ORGANIZATION_BLOCK`;
    const r = compileScl(src, 'T.scl');
    expect(r.blocks).toHaveLength(1);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['SCL-W001']);
  });

  it('compileScl lần 2 cùng ctx thấy UDT của lần 1', () => {
    const ctx = createCompileContext();
    const r1 = compileScl(DB_MOTOR, 'DB_Motor.scl', ctx);
    expect(r1.diagnostics).toEqual([]);
    const ob = `ORGANIZATION_BLOCK "Main"\nVAR_TEMP\n  u : UDT_Motor;\n  r : Int;\nEND_VAR\nBEGIN\n  #r := #u.speed;\nEND_ORGANIZATION_BLOCK`;
    const r2 = compileSclProgram(ob, 'Main.scl', ctx);
    // #u là TEMP chưa gán → W001 hợp lệ; quan trọng là không có lỗi
    // (UDT_Motor từ lần compile 1 đã thấy được — không T001).
    expect(r2.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r2.program.udts.map((u) => u.name)).toEqual(['UDT_Motor']);
    expect(r2.program.dbs.map((d) => d.name)).toEqual(['DB_Motor']);
    expect(r2.program.blocks.map((b) => b.name)).toEqual(['Main']);
  });
});
