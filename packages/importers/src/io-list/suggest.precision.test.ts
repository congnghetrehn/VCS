// Precision harness suggest trên fixture 300 (M2 §11.3, P2.7 commit 4, OQ-374).
// Pipeline thật (CSV → normalize → suggest) so với ground truth
// fixtures/expected.yaml. Số fixture là PROXY — KHÔNG chứng minh
// acceptance 90% trên dữ liệu thật (X-003, OQ-380, TC-2): acceptance
// thật chỉ đo khi dữ liệu thật về (xem docs/acceptance/M2.md sau này).
// (a) equipment + role đúng ≥ 160/177 (trần tính tay 175/177 — 2 tín
// hiệu không đúng được bằng grouping prefix); (b) model đúng ≥ 48/50;
// hồi quy (c) 300/300 địa chỉ, (d) counts P2.6 (IO-E001 ×6, IO-E011
// ×12, IO-W030 ×23, tổng 41).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { detectHeader } from './header-detect.js';
import { suggestMapping } from './mapping.js';
import { normalizeImport } from './normalize.js';
import { buildProfile } from './profile.js';
import { readCsvFile } from './read-csv.js';
import { normalizedSignalsToInputs, suggest } from './suggest.js';
import { applyTransforms, gridToRecords } from './transform.js';
import { recordRowNumbers, validateImport } from './validate.js';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const FIXTURE_CSV = join(ROOT, 'fixtures', 'io-list-300.csv');
const EXPECTED_YAML = join(ROOT, 'fixtures', 'expected.yaml');
const ORIGIN = { file: 'io-list-300.csv' };

interface ExpectedSignal {
  tag: string;
  equipment: string;
  model: string;
  role: string | null;
  signalType: string;
  address: string;
  row: number;
}

/** Parse fixtures/expected.yaml với kiểm tra shape thủ công (không zod:
 *  @vcs/importers không phụ thuộc zod trực tiếp). */
function parseExpected(text: string): ExpectedSignal[] {
  const raw: unknown = parseYaml(text);
  if (typeof raw !== 'object' || raw === null || !('signals' in raw)) {
    throw new Error('expected.yaml: thiếu signals');
  }
  const list: unknown = raw.signals;
  if (!Array.isArray(list)) throw new Error('expected.yaml: signals không phải mảng');
  return list.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`expected.yaml: signals[${String(i)}] không phải object`);
    }
    const s = entry as Record<string, unknown>;
    const str = (key: string): string => {
      const v: unknown = s[key];
      if (typeof v !== 'string') {
        throw new Error(`expected.yaml: signals[${String(i)}].${key} không phải string`);
      }
      return v;
    };
    const roleRaw: unknown = s['role'];
    if (roleRaw !== null && typeof roleRaw !== 'string') {
      throw new Error(`expected.yaml: signals[${String(i)}].role không phải string|null`);
    }
    const rowRaw: unknown = s['row'];
    if (typeof rowRaw !== 'number') {
      throw new Error(`expected.yaml: signals[${String(i)}].row không phải number`);
    }
    return {
      tag: str('tag'),
      equipment: str('equipment'),
      model: str('model'),
      role: roleRaw,
      signalType: str('signalType'),
      address: str('address'),
      row: rowRaw,
    };
  });
}

async function runFixture() {
  const grid = await readCsvFile(FIXTURE_CSV);
  const header = detectHeader(grid);
  const headerRow = header?.headerRow ?? 6;
  const firstDataRow = header?.firstDataRow ?? 7;
  const suggestions = suggestMapping(grid, headerRow);
  const profile = buildProfile(grid, headerRow, firstDataRow, suggestions, { name: 'io-list-300' });
  const mapping: Record<string, string> = {};
  for (const s of suggestions) mapping[s.field] = s.column;
  const records = gridToRecords(grid, headerRow, firstDataRow, mapping);
  const transformed = applyTransforms(records, profile.transforms);
  const rowNumbers = recordRowNumbers(grid, firstDataRow);
  const signals = normalizeImport(transformed.rows, {
    rowNumbers,
    origin: ORIGIN,
    profile,
  });
  const validation = validateImport({
    records: transformed.rows,
    rowNumbers,
    origin: ORIGIN,
    profile,
    declaredControllers: ['PLC1'],
  });
  const result = suggest(normalizedSignalsToInputs(signals));
  const expected = parseExpected(await readFile(EXPECTED_YAML, 'utf-8'));
  return { signals, validation, result, expected };
}

describe('suggest — precision trên fixture 300 (proxy, không phải acceptance thật)', () => {
  it('(a) ≥160/177 equipment+role, (b) ≥48/50 model, (c) 300/300 địa chỉ, (d) counts P2.6', async () => {
    const { signals, validation, result, expected } = await runFixture();
    // Ground truth: model theo equipment (mỗi equipment 1 model).
    const modelByEquipment = new Map<string, string>();
    for (const s of expected) {
      const prev = modelByEquipment.get(s.equipment);
      expect(prev === undefined || prev === s.model).toBe(true);
      modelByEquipment.set(s.equipment, s.model);
    }
    // Map (tag@row) → gợi ý đã gán (row có trong SuggestedSignal).
    const assigned = new Map<string, { equipmentId: string; role: string }>();
    for (const sug of result.suggestions) {
      for (const sig of sug.signals) {
        assigned.set(`${sig.tag}@${String(sig.row)}`, {
          equipmentId: sug.equipmentId,
          role: sig.role,
        });
      }
    }
    const roleKnown = expected.filter((s) => s.role !== null);
    expect(roleKnown).toHaveLength(177);
    let correctA = 0;
    const perModel = new Map<string, { known: number; correct: number }>();
    const misses: string[] = [];
    for (const gt of roleKnown) {
      const got = assigned.get(`${gt.tag}@${String(gt.row)}`);
      const ok = got !== undefined && got.equipmentId === gt.equipment && got.role === gt.role;
      const m = perModel.get(gt.model) ?? { known: 0, correct: 0 };
      m.known++;
      if (ok) {
        correctA++;
        m.correct++;
      } else {
        misses.push(
          `${gt.tag}@${String(gt.row)} gt=${gt.equipment}/${String(gt.role)} got=${got === undefined ? 'unassigned' : `${got.equipmentId}/${got.role}`}`,
        );
      }
      perModel.set(gt.model, m);
    }
    // (b) model đúng theo equipment.
    let correctB = 0;
    const modelMisses: string[] = [];
    for (const [equipmentId, model] of modelByEquipment) {
      const sug = result.suggestions.find((s) => s.equipmentId === equipmentId);
      if (sug !== undefined && sug.model === model) correctB++;
      else modelMisses.push(`${equipmentId} gt=${model} got=${sug?.model ?? 'none'}`);
    }
    // (c) địa chỉ chuẩn hóa đúng theo row.
    const signalByRow = new Map(signals.map((s) => [s.row, s]));
    let correctC = 0;
    const addrMisses: string[] = [];
    for (const gt of expected) {
      const s = signalByRow.get(gt.row);
      if (s?.address?.canonical === gt.address) correctC++;
      else addrMisses.push(`${gt.tag}@${String(gt.row)} gt=${gt.address} got=${s?.address?.canonical ?? 'null'}`);
    }
    // (d) counts validate P2.6.
    const counts = validation.stats.diagnosticsByCode;
    // In bảng báo cáo qua stdout (không dùng console.* — no-console cấm
    // ở package; process.stdout.write là cách CLI/e2e vẫn dùng).
    const report: string[] = [
      `(a) equipment+role: ${String(correctA)}/177 (ngưỡng ≥160, trần tính tay 175)`,
      `(b) model: ${String(correctB)}/50 (ngưỡng ≥48)`,
      `(c) địa chỉ: ${String(correctC)}/300 (ngưỡng 300)`,
      `(d) validate: errors=${String(validation.stats.errors)} warnings=${String(validation.stats.warnings)} ` +
        `IO-E001=${String(counts['IO-E001'] ?? 0)} IO-E011=${String(counts['IO-E011'] ?? 0)} ` +
        `IO-W030=${String(counts['IO-W030'] ?? 0)} tổng=${String(validation.diagnostics.length)}`,
      'per-model (role-known: đúng/tổng):',
      ...[...perModel.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([model, m]) => `  ${model}: ${String(m.correct)}/${String(m.known)}`),
      `status: confident=${String(result.stats.confident)} review=${String(result.stats.review)} unmatched=${String(result.stats.unmatched)} assigned=${String(result.stats.assignedTags)}/300`,
    ];
    const reviews = result.suggestions.filter((s) => s.status === 'review');
    if (reviews.length > 0) {
      report.push('review groups (equipment: model conf [candidates]):');
      for (const s of reviews) {
        const cands = (s.modelCandidates ?? [])
          .map((c) => `${c.model}=${c.score.toFixed(2)}`)
          .join(', ');
        report.push(
          `  ${s.equipmentId}: ${s.model} ${s.confidence.toFixed(2)}${cands === '' ? '' : ` [${cands}]`} missing=${s.missingRequiredRoles.join(',') || '-'}`,
        );
      }
    }
    if (misses.length > 0) report.push('misses (a):\n  ' + misses.join('\n  '));
    if (modelMisses.length > 0) report.push('misses (b):\n  ' + modelMisses.join('\n  '));
    if (addrMisses.length > 0) report.push('misses (c):\n  ' + addrMisses.join('\n  '));
    process.stdout.write(report.join('\n') + '\n');
    expect(correctA).toBeGreaterThanOrEqual(160);
    expect(correctB).toBeGreaterThanOrEqual(48);
    expect(correctC).toBe(300);
    expect(validation.stats.errors).toBe(18);
    expect(validation.stats.warnings).toBe(23);
    expect(counts['IO-E001']).toBe(6);
    expect(counts['IO-E011']).toBe(12);
    expect(counts['IO-W030']).toBe(23);
    expect(validation.diagnostics).toHaveLength(41);
  }, 60_000);
});
