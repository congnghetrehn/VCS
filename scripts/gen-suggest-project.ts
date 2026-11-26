// Sinh project e2e cho Plant Designer (P2.8 commit 8) từ fixture I/O list
// 300 — dùng cho p28 case (2)(3)(4)(6).
// Chạy: `pnpm gen:suggest-project` (ghi apps/web/e2e/fixtures/suggest-project/).
//
// Vì sao không commit fixture qua wizard/CLI: fixture có 18 lỗi validate
// nội tại (IO-E001 trùng tag ×6, IO-E011 chồng địa chỉ ×12) nên cả wizard
// lẫn CLI đều từ chối commit (luật commit 4). Project này lấy signals đã
// normalize từ chính pipeline P2.5 (mirror harness precision P2.7) rồi ghi
// tags.yaml trực tiếp:
// - Dedupe theo tên tag (không phân biệt hoa/thường, giữ dòng đầu): 6 tên
//   trùng bị bỏ (tagsFileSchema chặn trùng tên PRJ-E004);
// - Địa chỉ chồng nhau GIỮ NGUYÊN (schema cho phép; project chỉ dùng cho
//   suggest/apply qua REST, không chạy sim).
// - Controllers: lấy từ tagDefs (PLC1).
// Số suggest đo lại sau khi sinh bằng `vcs suggest` — ghi vào README của
// fixture (không hard-code ở đây để khỏi lệch khi fixture đổi).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyTransforms,
  buildProfile,
  detectHeader,
  gridToRecords,
  normalizeImport,
  readCsvFile,
  recordRowNumbers,
  serializeEquipment,
  serializeTags,
  suggestMapping,
} from '@vcs/importers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps', 'web', 'e2e', 'fixtures', 'suggest-project');

async function main(): Promise<void> {
  const grid = await readCsvFile(join(ROOT, 'fixtures', 'io-list-300.csv'));
  const header = detectHeader(grid);
  const headerRow = header?.headerRow ?? 6;
  const firstDataRow = header?.firstDataRow ?? 7;
  const suggestions = suggestMapping(grid, headerRow);
  const profile = buildProfile(grid, headerRow, firstDataRow, suggestions, {
    name: 'io-list-300',
  });
  const mapping: Record<string, string> = {};
  for (const s of suggestions) mapping[s.field] = s.column;
  const records = gridToRecords(grid, headerRow, firstDataRow, mapping);
  const transformed = applyTransforms(records, profile.transforms);
  const rowNumbers = recordRowNumbers(grid, firstDataRow);
  const signals = normalizeImport(transformed.rows, {
    rowNumbers,
    origin: { file: 'io-list-300.csv' },
    profile,
  });
  // Dedupe tên tag (giữ dòng đầu), bỏ signal không có tagDef.
  const seen = new Set<string>();
  const tagDefs = [];
  let droppedDup = 0;
  let droppedNull = 0;
  for (const s of signals) {
    if (s.tagDef === null) {
      droppedNull++;
      continue;
    }
    const key = s.tagDef.name.toLowerCase();
    if (seen.has(key)) {
      droppedDup++;
      continue;
    }
    seen.add(key);
    tagDefs.push(s.tagDef);
  }
  const controllers = [...new Set(tagDefs.map((t) => t.controller))].sort();
  const projectYaml = [
    '# Project e2e cho Plant Designer — SINH TỰ ĐỘNG, không sửa tay.',
    '# Nguồn: fixtures/io-list-300.csv qua scripts/gen-suggest-project.ts',
    '# (dedupe 6 tên tag trùng; địa chỉ chồng nhau giữ nguyên — xem script).',
    'schemaVersion: 1',
    'name: Suggest Project',
    'language: vi',
    'seed: 1',
    'simulation: { stepMs: 100, plcScanMs: 100 }',
    'controllers:',
    ...controllers.map(
      (c) => `  - id: ${c}\n    mode: builtin\n    vendor: demo\n    model: loopback`,
    ),
    '',
  ].join('\n');
  await mkdir(join(OUT, 'tags'), { recursive: true });
  await mkdir(join(OUT, 'plant'), { recursive: true });
  await writeFile(join(OUT, 'vcs.project.yaml'), projectYaml, 'utf8');
  await writeFile(join(OUT, 'tags', 'tags.yaml'), serializeTags(tagDefs), 'utf8');
  await writeFile(join(OUT, 'plant', 'equipment.yaml'), serializeEquipment([]), 'utf8');
  process.stdout.write(
    `gen-suggest-project: ${String(tagDefs.length)} tag (bỏ ${String(droppedDup)} trùng tên, ${String(droppedNull)} không có tagDef) → ${OUT}\n` +
      `controllers: ${controllers.join(', ')}\n`,
  );
}

await main();
