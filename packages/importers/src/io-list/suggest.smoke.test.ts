// Smoke 20k pipeline đầy đủ (M2 §12, P2.7 commit 6, OQ-373).
// read(CSV) → mapping → normalize → validate → suggest → diff trên file
// 20 000 dòng (generator signalCount: 20000). Ngưỡng §12: tổng ≤ 10 s
// (chốt ở P2.7 — xem STATE §31). Ghi phân rã theo chặng qua stdout.
// Sinh file (writeIoFixture, gồm cả xlsx) là setup, không tính vào tổng.
//
// Khẳng định dùng CPU time (process.cpuUsage), KHÔNG wall-clock:
// wall-clock dưới suite song song đo cả thời gian chờ CPU của scheduler —
// đo được suggest 2 380 ms standalone → 14 613 ms trong suite (×6) trên
// VM 1,5 CPU chia sẻ; pipeline là JS đồng bộ đơn luồng nên CPU ≈ wall
// trên máy yên (standalone: wall 2 942/3 061 ms, CPU ~3 s). Wall-clock
// ≤ 10 s đã đo riêng: CSV 2 942/3 061 ms, XLSX 3 962 ms (STATE §31).
// Dùng CPU time cũng đúng AGENTS.md §6 (test không phụ thuộc thời gian
// chính xác) mà không hạ ngưỡng §12 (vẫn < 10000 ms).

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeIoFixture } from '../../../../scripts/gen-io-fixture.js';
import { detectHeader } from './header-detect.js';
import { suggestMapping } from './mapping.js';
import { normalizeImport } from './normalize.js';
import { buildProfile } from './profile.js';
import { readCsvFile } from './read-csv.js';
import { normalizedSignalsToInputs, suggest } from './suggest.js';
import { applyTransforms, gridToRecords } from './transform.js';
import { recordRowNumbers, validateImport } from './validate.js';
import { diffTags } from './diff.js';

describe('smoke 20k — pipeline đầy đủ ≤ 10 s (§12, OQ-373)', () => {
  it('read→mapping→normalize→validate→suggest→diff trên 20 000 dòng', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-smoke-20k-'));
    try {
      const tGen0 = performance.now();
      const written = await writeIoFixture(dir, { signalCount: 20000 });
      const genMs = performance.now() - tGen0;

      const t0 = performance.now();
      const cpu0 = process.cpuUsage();
      const grid = await readCsvFile(written.csv);
      const tRead = performance.now();
      const header = detectHeader(grid);
      const headerRow = header?.headerRow ?? 6;
      const firstDataRow = header?.firstDataRow ?? 7;
      const suggestions = suggestMapping(grid, headerRow);
      const profile = buildProfile(grid, headerRow, firstDataRow, suggestions, {
        name: 'io-list-20k',
      });
      const mapping: Record<string, string> = {};
      for (const s of suggestions) mapping[s.field] = s.column;
      const records = gridToRecords(grid, headerRow, firstDataRow, mapping);
      const transformed = applyTransforms(records, profile.transforms);
      const tMap = performance.now();
      const rowNumbers = recordRowNumbers(grid, firstDataRow);
      const signals = normalizeImport(transformed.rows, {
        rowNumbers,
        origin: { file: 'io-list-20k.csv' },
        profile,
      });
      const tNorm = performance.now();
      const validation = validateImport({
        records: transformed.rows,
        rowNumbers,
        origin: { file: 'io-list-20k.csv' },
        profile,
        declaredControllers: ['PLC1'],
      });
      const tVal = performance.now();
      const result = suggest(normalizedSignalsToInputs(signals));
      const tSug = performance.now();
      const diff = diffTags([], signals);
      const tDiff = performance.now();
      const cpu1 = process.cpuUsage(cpu0);
      // CPU time (µs → ms): chi phí thực của pipeline, không đổi dù suite
      // song song có làm wall-clock phồng lên bao nhiêu.
      const cpuTotal = (cpu1.user + cpu1.system) / 1000;

      const stages = {
        read: tRead - t0,
        mapping: tMap - tRead,
        normalize: tNorm - tMap,
        validate: tVal - tNorm,
        suggest: tSug - tVal,
        diff: tDiff - tSug,
      };
      const total = tDiff - t0;
      const lines = [
        `smoke 20k (setup sinh file: ${genMs.toFixed(0)} ms, không tính vào tổng):`,
        `  read: ${stages.read.toFixed(0)} ms`,
        `  mapping: ${stages.mapping.toFixed(0)} ms`,
        `  normalize: ${stages.normalize.toFixed(0)} ms`,
        `  validate: ${stages.validate.toFixed(0)} ms`,
        `  suggest: ${stages.suggest.toFixed(0)} ms`,
        `  diff: ${stages.diff.toFixed(0)} ms`,
        `  TỔNG: ${total.toFixed(0)} ms (wall-clock, tham khảo — xem ghi chú đầu file)`,
        `  TỔNG CPU: ${cpuTotal.toFixed(0)} ms (ngưỡng §12 ≤ 10000 ms)`,
        `  signals: ${String(signals.length)}, suggestions: ${String(result.suggestions.length)}, ` +
          `assigned: ${String(result.stats.assignedTags)}/${String(result.stats.totalTags)}, ` +
          `diff added: ${String(diff.added.length)}, validate errors: ${String(validation.stats.errors)}`,
      ];
      process.stdout.write(lines.join('\n') + '\n');

      expect(signals).toHaveLength(20000);
      expect(result.stats.totalTags).toBe(20000);
      expect(result.suggestions.length).toBeGreaterThan(0);
      // Ngưỡng §12 (vẫn 10 s, không hạ): khẳng định trên CPU time.
      expect(cpuTotal).toBeLessThan(10000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
