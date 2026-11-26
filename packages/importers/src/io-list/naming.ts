// Loader `plant/naming.yaml` — @vcs/importers (M2 §4.3, P2.7 commit 1, OQ-375).
// Thiếu file → quy ước mặc định cement-default + cảnh báo (không fail);
// file lỗi YAML/zod → NamingConventionError (CLI exit 2).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  DEFAULT_NAMING_CONVENTION,
  namingConventionSchema,
  type NamingConvention,
} from '@vcs/schemas';

export class NamingConventionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NamingConventionError';
  }
}

export interface LoadNamingConventionResult {
  convention: NamingConvention;
  /** true khi dùng mặc định vì thiếu file. */
  usedDefault: boolean;
  /** Cảnh báo khi dùng mặc định (chỉ có khi usedDefault). */
  warning?: string;
}

/** Parse nội dung `plant/naming.yaml` (thuần — không đọc file). */
export function parseNamingConvention(text: string): NamingConvention {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new NamingConventionError(`plant/naming.yaml lỗi cú pháp YAML: ${detail}`);
  }
  const result = namingConventionSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(gốc)'}: ${i.message}`)
      .join('; ');
    throw new NamingConventionError(`plant/naming.yaml không hợp lệ: ${issues}`);
  }
  return result.data;
}

/** Đọc `plant/naming.yaml` trong thư mục dự án (OQ-375). */
export async function loadNamingConvention(
  projectDir: string,
): Promise<LoadNamingConventionResult> {
  const path = join(projectDir, 'plant', 'naming.yaml');
  let text: string;
  try {
    text = await readFile(path, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        convention: DEFAULT_NAMING_CONVENTION,
        usedDefault: true,
        warning: 'không có plant/naming.yaml — dùng quy ước mặc định cement-default',
      };
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new NamingConventionError(`không đọc được plant/naming.yaml: ${detail}`);
  }
  return { convention: parseNamingConvention(text), usedDefault: false };
}
