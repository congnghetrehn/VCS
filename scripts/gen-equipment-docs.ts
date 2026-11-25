// Sinh docs/equipment/*.md từ defaultRegistry (M2 §2, P2.2 — OQ-261).
// Chạy: `pnpm docs:equipment` (ghi file) hoặc
// `pnpm docs:equipment --check` (fail nếu file lệch với model đã đăng ký).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defaultRegistry, generateEquipmentMarkdown } from '@vcs/plant';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'docs', 'equipment');

async function main(): Promise<number> {
  const check = process.argv.includes('--check');
  const types = defaultRegistry.list();
  let written = 0;
  for (const type of types) {
    const model = defaultRegistry.get(type);
    if (model === undefined) continue;
    const md = generateEquipmentMarkdown(model);
    const out = join(OUT_DIR, `${type}.md`);
    let existing: string | null = null;
    try {
      existing = (await readFile(out, 'utf8')).replace(/\r\n/g, '\n');
    } catch {
      existing = null;
    }
    if (check) {
      if (existing !== md) {
        process.stderr.write(
          `docs/equipment/${type}.md lệch với model. Chạy \`pnpm docs:equipment\` để sinh lại.\n`,
        );
        return 1;
      }
      continue;
    }
    if (existing !== md) {
      await mkdir(OUT_DIR, { recursive: true });
      await writeFile(out, md, 'utf8');
      written += 1;
    }
  }
  if (check) {
    process.stdout.write(`docs:equipment --check: khớp (${String(types.length)} model).\n`);
    return 0;
  }
  process.stdout.write(
    `Đã sinh docs/equipment (${String(written)} file mới/cập nhật, ${String(types.length)} model).\n`,
  );
  return 0;
}

process.exitCode = await main();
