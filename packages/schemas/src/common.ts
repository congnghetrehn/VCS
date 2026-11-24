// Kiểu dùng chung — @vcs/schemas (M0 §4.1, AMENDMENTS A3, A8).
// Mọi package khác dùng các kiểu này; không import ngược lại.

import { z } from 'zod';

export type DataType =
  | 'Bool'
  | 'Byte'
  | 'Word'
  | 'DWord'
  | 'SInt'
  | 'USInt'
  | 'UInt'
  | 'UDInt'
  | 'Int'
  | 'DInt'
  | 'Real'
  | 'LReal'
  | 'Time'
  | 'String'; // String: dành sẵn, M1–M3 chưa dùng

/** Giá trị tag (AMENDMENTS A3: không bigint). Real luôn Math.fround (M1). */
export type TagValue = boolean | number | string;

export const dataTypeSchema = z.enum([
  'Bool',
  'Byte',
  'Word',
  'DWord',
  'SInt',
  'USInt',
  'UInt',
  'UDInt',
  'Int',
  'DInt',
  'Real',
  'LReal',
  'Time',
  'String',
]);

export const tagValueSchema = z.union([z.boolean(), z.number(), z.string()]);

export type SignalKind = 'DI' | 'DO' | 'AI' | 'AO';
export type IoArea = 'I' | 'Q';
export type MemArea = IoArea | 'M' | 'DB';

/** Chủ sở hữu ghi của một tag (AGENTS §4): plant ← {plant, system},
 * controller ← {plc, system}, free ← {test, hmi, gateway, system}. */
export type TagOwner = 'plant' | 'controller' | 'free';

export type Unsub = () => void;

/** Vị trí trong file, 1-based (M0 §4.1). */
export interface SrcRef {
  file: string;
  line: number;
  col: number;
  endLine?: number;
  endCol?: number;
}

export interface Diagnostic {
  code: string; // ví dụ 'PRJ-E003'
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  col?: number;
  endLine?: number;
  endCol?: number;
  hint?: string;
  related?: SrcRef[];
}

export const srcRefSchema = z.object({
  file: z.string(),
  line: z.number().int().min(1),
  col: z.number().int().min(1),
  endLine: z.number().int().min(1).optional(),
  endCol: z.number().int().min(1).optional(),
});

export const diagnosticSchema = z.object({
  code: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  file: z.string().optional(),
  line: z.number().int().min(1).optional(),
  col: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
  endCol: z.number().int().min(1).optional(),
  hint: z.string().optional(),
  related: z.array(srcRefSchema).optional(),
});

/** Tạo một Diagnostic. `loc` nhận SrcRef hoặc một phần vị trí. */
export function diag(
  code: string,
  severity: Diagnostic['severity'],
  message: string,
  loc?: Partial<SrcRef>,
  hint?: string,
): Diagnostic {
  const d: Diagnostic = { code, severity, message };
  if (loc !== undefined) {
    if (loc.file !== undefined) d.file = loc.file;
    if (loc.line !== undefined) d.line = loc.line;
    if (loc.col !== undefined) d.col = loc.col;
    if (loc.endLine !== undefined) d.endLine = loc.endLine;
    if (loc.endCol !== undefined) d.endCol = loc.endCol;
  }
  if (hint !== undefined) d.hint = hint;
  return d;
}

/** `file:line:col error CODE: message` + dòng `hint: ...` (M0 §4.1). */
export function formatDiagnostic(d: Diagnostic): string {
  const loc = d.file !== undefined ? `${d.file}:${String(d.line ?? 1)}:${String(d.col ?? 1)}` : '—';
  const head = `${loc} ${d.severity} ${d.code}: ${d.message}`;
  return d.hint !== undefined ? `${head}\n  hint: ${d.hint}` : head;
}

export function hasErrors(list: readonly Diagnostic[]): boolean {
  return list.some((d) => d.severity === 'error');
}

/** Sắp xếp ổn định theo (file, line, col, code) (M0 §4.1). */
export function sortDiagnostics(list: readonly Diagnostic[]): Diagnostic[] {
  return [...list].sort((a, b) => {
    const fa = a.file ?? '';
    const fb = b.file ?? '';
    if (fa !== fb) return fa < fb ? -1 : 1;
    if ((a.line ?? 0) !== (b.line ?? 0)) return (a.line ?? 0) - (b.line ?? 0);
    if ((a.col ?? 0) !== (b.col ?? 0)) return (a.col ?? 0) - (b.col ?? 0);
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return 0;
  });
}
