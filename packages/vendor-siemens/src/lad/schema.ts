// Schema JSON cho LAD — @vcs/vendor-siemens (M1 §5.1, P1.6).
// LAD là JSON (không phải text như SCL): `LadBlock {kind, name, number?,
// interface, networks[]}`, mỗi network là một rung (mảng element).
// Validate bằng zod (strict — key lạ bị từ chối ồn ào thay vì lặng lẽ bỏ
// qua); lỗi schema → LAD-S001 (validate.ts chuyển thành Diagnostic).

import { diag, dataTypeSchema } from '@vcs/schemas';
import type { Diagnostic } from '@vcs/schemas';
import { z } from 'zod';

/** Tên định danh (block/var/network id): chữ, số, `_`, bắt đầu bằng chữ/`_`. */
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const operandSchema = z.union([
  z.strictObject({ sym: z.string().min(1) }),
  z.strictObject({ abs: z.string().min(1) }),
  z.strictObject({ local: z.string().min(1) }),
]);
export type LadOperand = z.output<typeof operandSchema>;

export const constSchema = z.strictObject({
  const: z.union([z.number(), z.boolean()]),
  type: dataTypeSchema.optional(),
});
export type LadConst = z.output<typeof constSchema>;

const contactSchema = z.strictObject({
  t: z.literal('contact'),
  mode: z.enum(['NO', 'NC']),
  operand: operandSchema,
});
const posSchema = z.strictObject({
  t: z.literal('pos'),
  operand: operandSchema,
  memBit: operandSchema,
});
const negSchema = z.strictObject({
  t: z.literal('neg'),
  operand: operandSchema,
  memBit: operandSchema,
});
const notSchema = z.strictObject({ t: z.literal('not') });
const coilSchema = z.strictObject({
  t: z.literal('coil'),
  mode: z.enum(['normal', 'negated']),
  operand: operandSchema,
});
const setSchema = z.strictObject({ t: z.literal('set'), operand: operandSchema });
const resetSchema = z.strictObject({ t: z.literal('reset'), operand: operandSchema });
const boxSchema = z.strictObject({
  t: z.literal('box'),
  fn: z.string().min(1),
  instance: operandSchema.optional(),
  inputs: z.record(z.string(), z.union([operandSchema, constSchema])),
  outputs: z.record(z.string(), operandSchema),
});

/** Element LAD (đệ quy qua `parallel` — dùng z.lazy). */
export const ladElementSchema: z.ZodType<LadElement> = z.lazy(() =>
  z.discriminatedUnion('t', [
    contactSchema,
    posSchema,
    negSchema,
    z.strictObject({ t: z.literal('parallel'), branches: z.array(z.array(ladElementSchema).min(1)).min(1) }),
    notSchema,
    coilSchema,
    setSchema,
    resetSchema,
    boxSchema,
  ]),
);

export type LadElement =
  | { t: 'contact'; mode: 'NO' | 'NC'; operand: LadOperand }
  | { t: 'pos'; operand: LadOperand; memBit: LadOperand }
  | { t: 'neg'; operand: LadOperand; memBit: LadOperand }
  | { t: 'parallel'; branches: LadElement[][] }
  | { t: 'not' }
  | { t: 'coil'; mode: 'normal' | 'negated'; operand: LadOperand }
  | { t: 'set'; operand: LadOperand }
  | { t: 'reset'; operand: LadOperand }
  | {
      t: 'box';
      fn: string;
      instance?: LadOperand | undefined; // zod v4: optional → `| undefined` (exactOptionalPropertyTypes)
      inputs: Record<string, LadOperand | LadConst>;
      outputs: Record<string, LadOperand>;
    };

export type BoxFn =
  | 'TON'
  | 'TOF'
  | 'TP'
  | 'TONR'
  | 'CTU'
  | 'CTD'
  | 'CTUD'
  | 'SR'
  | 'RS'
  | 'R_TRIG'
  | 'F_TRIG'
  | 'EQ'
  | 'NE'
  | 'LT'
  | 'LE'
  | 'GT'
  | 'GE'
  | 'ADD'
  | 'SUB'
  | 'MUL'
  | 'DIV'
  | 'MOVE'
  | 'CONVERT'
  | 'NORM_X'
  | 'SCALE_X'
  | 'LIMIT'
  | 'MIN'
  | 'MAX';

/** Mọi tên box hợp lệ (M1 §5.1) — fn ngoài tập → LAD-U001 ở validate. */
export const BOX_FNS: ReadonlySet<string> = new Set<string>([
  'TON',
  'TOF',
  'TP',
  'TONR',
  'CTU',
  'CTD',
  'CTUD',
  'SR',
  'RS',
  'R_TRIG',
  'F_TRIG',
  'EQ',
  'NE',
  'LT',
  'LE',
  'GT',
  'GE',
  'ADD',
  'SUB',
  'MUL',
  'DIV',
  'MOVE',
  'CONVERT',
  'NORM_X',
  'SCALE_X',
  'LIMIT',
  'MIN',
  'MAX',
]);

export const interfaceDeclSchema = z.strictObject({
  name: z.string().regex(IDENT_RE, 'tên biến phải là định danh'),
  type: z.string().min(1),
  init: z.union([z.number(), z.boolean()]).optional(),
});
export type LadInterfaceDecl = z.output<typeof interfaceDeclSchema>;

export const ladInterfaceSchema = z.strictObject({
  input: z.array(interfaceDeclSchema).optional(),
  output: z.array(interfaceDeclSchema).optional(),
  inout: z.array(interfaceDeclSchema).optional(),
  static: z.array(interfaceDeclSchema).optional(),
  temp: z.array(interfaceDeclSchema).optional(),
});
export type LadInterface = z.output<typeof ladInterfaceSchema>;

export const ladNetworkSchema = z.strictObject({
  id: z.string().regex(IDENT_RE, 'network id phải là định danh'),
  title: z.string().optional(),
  comment: z.string().optional(),
  rung: z.array(ladElementSchema).min(1),
});
export type LadNetwork = z.output<typeof ladNetworkSchema>;

export const ladBlockSchema = z.strictObject({
  kind: z.enum(['FC', 'FB', 'OB']),
  name: z.string().regex(IDENT_RE, 'tên block phải là định danh'),
  number: z.number().int().min(1).optional(),
  interface: ladInterfaceSchema,
  networks: z.array(ladNetworkSchema),
});
export type LadBlock = z.output<typeof ladBlockSchema>;

/**
 * Parse một LadBlock từ JSON chưa biết kiểu. Thành công → `{block,
 * diagnostics: []}`; thất bại → mỗi issue zod thành một LAD-S001
 * (line=1, col=1 — JSON không có vị trí nguồn, OQ-193).
 */
export function parseLadBlock(
  input: unknown,
  fileName = 'lad.json',
): { block: LadBlock; diagnostics: Diagnostic[] } | { block: undefined; diagnostics: Diagnostic[] } {
  const parsed = ladBlockSchema.safeParse(input);
  if (parsed.success) {
    return { block: parsed.data, diagnostics: [] };
  }
  const diagnostics = parsed.error.issues.map((issue) =>
    diag(
      'LAD-S001',
      'error',
      `schema LAD không hợp lệ: ${issue.path.join('.') || '(gốc)'} — ${issue.message}`,
      { file: fileName, line: 1, col: 1 },
    ),
  );
  return { block: undefined, diagnostics };
}
