// Test scripts/gen-io-fixture.ts (M2 §11.3, P2.5 commit 1).
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parse as yamlParse } from 'yaml';
import {
  FIRST_DATA_ROW,
  generateIoFixture,
  HEADER_ROW,
  stripDiacritics,
  writeIoFixture,
} from '../scripts/gen-io-fixture.js';
import type { FixtureData } from '../scripts/gen-io-fixture.js';

const TAG_PATTERN = /^[A-Z]{2}[0-9]{2}_[A-Z]{1,4}[0-9]{2,3}_[A-Z0-9_]+$/;

describe('generateIoFixture (mặc định §11.3)', () => {
  it('50 thiết bị, 300 tín hiệu (177 role + 123 thêm), đúng số lượng từng model', () => {
    const data = generateIoFixture();
    expect(data.devices).toHaveLength(50);
    expect(data.signals).toHaveLength(300);
    expect(data.signals.filter((s) => s.role !== null)).toHaveLength(177);
    expect(data.signals.filter((s) => s.role === null)).toHaveLength(123);
    const byModel = new Map<string, number>();
    for (const d of data.devices) byModel.set(d.model, (byModel.get(d.model) ?? 0) + 1);
    expect(Object.fromEntries(byModel)).toEqual({
      motor_dol: 8,
      motor_vfd: 4,
      valve_onoff: 6,
      valve_ctrl: 3,
      analog_sensor: 14,
      switch_di: 10,
      silo_bin: 3,
      conveyor_simple: 2,
    });
    expect(data.headers).toHaveLength(10);
    expect(data.subtitleRows).toHaveLength(5);
  });

  it('mọi tag khớp mẫu đặt tên §4.3, mọi dòng có số dòng Excel đúng', () => {
    const data = generateIoFixture();
    for (const [i, s] of data.signals.entries()) {
      expect(s.tag).toMatch(TAG_PATTERN);
      expect(s.row).toBe(FIRST_DATA_ROW + i);
      expect(s.address).toMatch(/^%(I|Q)[0-9]+\.[0-7]$|^%(I|Q)W[0-9]+$/);
    }
  });

  it('dòng bẩn đúng số lượng từng loại, tập rời nhau, sắp theo dòng', () => {
    const data = generateIoFixture();
    const byKind = new Map<string, number>();
    for (const d of data.dirtyRows) byKind.set(d.kind, (byKind.get(d.kind) ?? 0) + 1);
    expect(Object.fromEntries(byKind)).toEqual({
      'missing-type': 15,
      'suffix-variant': 9,
      'duplicate-tag': 6,
      'duplicate-address': 6,
    });
    const rows = data.dirtyRows.map((d) => d.row);
    expect(new Set(rows).size).toBe(rows.length);
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
  });

  it('dòng trùng tag thật sự trùng tag của một dòng trước đó', () => {
    const data = generateIoFixture();
    const byRow = new Map(data.signals.map((s) => [s.row, s]));
    for (const d of data.dirtyRows.filter((x) => x.kind === 'duplicate-tag')) {
      const s = byRow.get(d.row);
      expect(s).toBeDefined();
      const earlier = data.signals.filter((x) => x.row < d.row && x.tag === (s as FixtureData['signals'][number]).tag);
      expect(earlier.length).toBeGreaterThanOrEqual(1);
    }
    // Ngoài 6 dòng bẩn, không có tag nào trùng nhau.
    const tags = data.signals.map((s) => s.tag);
    const dupTags = tags.filter((t, i) => tags.indexOf(t) !== i);
    expect(new Set(dupTags).size).toBe(6);
  });

  it('dòng trùng địa chỉ thật sự trùng địa chỉ của một dòng khác cùng loại', () => {
    const data = generateIoFixture();
    for (const d of data.dirtyRows.filter((x) => x.kind === 'duplicate-address')) {
      const s = data.signals.find((x) => x.row === d.row) as FixtureData['signals'][number];
      const same = data.signals.filter((x) => x.row !== d.row && x.address === s.address && x.signalType === s.signalType);
      expect(same.length).toBeGreaterThanOrEqual(1);
    }
    const addresses = data.signals.map((s) => s.address);
    expect(new Set(addresses).size).toBe(300 - 6);
  });

  it('mô tả lẫn vi/en/de; CSV bỏ dấu vẫn đọc được (Windows-1252)', () => {
    const data = generateIoFixture();
    const langs = new Set(data.signals.map((s) => (/[à-ỹđ]/i.test(s.description) ? 'vi' : /[äöüß]/i.test(s.description) ? 'de' : 'en')));
    expect(langs.has('vi')).toBe(true);
    expect(langs.has('en')).toBe(true);
    expect(langs.has('de')).toBe(true);
    for (const s of data.signals) {
      const stripped = stripDiacritics(s.description);
      for (const ch of stripped) expect(ch.codePointAt(0) as number).toBeLessThanOrEqual(0xff);
    }
  });

  it('sinh lại hai lần cho cùng dữ liệu (tính định OQ-330)', () => {
    expect(generateIoFixture()).toEqual(generateIoFixture());
    expect(generateIoFixture({ seed: 42 })).not.toEqual(generateIoFixture());
  });
});

describe('writeIoFixture', () => {
  it('ghi đủ 3 file; xlsx đọc lại: header dòng 6, 300 dòng dữ liệu, station merge dọc, Type trống ở dòng thiếu type', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-fixture-'));
    try {
      const written = await writeIoFixture(dir);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(written.xlsx);
      const ws = wb.getWorksheet('IO List');
      expect(ws).toBeDefined();
      const sheet = ws as ExcelJS.Worksheet;
      expect(sheet.getCell(`A${String(HEADER_ROW)}`).value).toBe('Station');
      expect(sheet.getCell(`B${String(HEADER_ROW)}`).value).toBe('Tag Name');
      expect(sheet.rowCount).toBe(FIRST_DATA_ROW + 300 - 1);
      expect(sheet.model.merges).toEqual(['A7:A163', 'A164:A306']);
      expect(sheet.getCell('A7').value).toBe('CR01');
      expect(sheet.getCell('A8').isMerged).toBe(true);
      expect(sheet.getCell('A164').value).toBe('CR02');
      const data = generateIoFixture();
      const missing = data.dirtyRows.filter((d) => d.kind === 'missing-type');
      for (const d of missing) {
        expect(sheet.getCell(`D${String(d.row)}`).value).toBeNull();
      }
      expect(wb.getWorksheet('Cover')).toBeDefined();
      // expected.yaml đọc lại khớp signals.
      const expected = yamlParse(await readFile(written.yaml, 'utf8')) as {
        generated: { signalCount: number; roleSignals: number; extraSignals: number };
        signals: { tag: string; row: number }[];
        dirty: { row: number }[];
      };
      expect(expected.generated).toEqual({ seed: 20261126, signalCount: 300, roleSignals: 177, extraSignals: 123, headerRow: 6, firstDataRow: 7 });
      expect(expected.signals).toHaveLength(300);
      expect(expected.signals[0]?.tag).toBe(data.signals[0]?.tag);
      expect(expected.dirty).toHaveLength(36);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('CSV đọc lại: 306 dòng, delimiter ;, cùng số dòng dữ liệu, cùng chỉ số dòng bẩn', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-fixture-'));
    try {
      const written = await writeIoFixture(dir);
      const buf = await readFile(written.csv);
      const text = buf.toString('latin1');
      expect(text).not.toContain('�');
      const lines = text.split('\r\n').filter((l) => l.length > 0);
      expect(lines).toHaveLength(306);
      expect(lines[5]).toContain('Tag Name');
      const data = generateIoFixture();
      for (const d of data.dirtyRows.filter((x) => x.kind === 'missing-type')) {
        const fields = (lines[d.row - 1] as string).split(';');
        expect(fields[3]).toBe('');
      }
      // Cùng tag ở dòng dữ liệu đầu trong cả hai file (địa chỉ có thể khác
      // định dạng hiển thị, nhưng tag thì giống).
      expect((lines[6] as string).split(';')[1]).toBe(data.signals[0]?.tag);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ghi hai lần cho nội dung parse được giống hệt (tính định OQ-330)', async () => {
    const dirA = await mkdtemp(join(tmpdir(), 'vcs-fixture-a-'));
    const dirB = await mkdtemp(join(tmpdir(), 'vcs-fixture-b-'));
    try {
      const a = await writeIoFixture(dirA);
      const b = await writeIoFixture(dirB);
      const readCells = async (path: string): Promise<unknown[][]> => {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(path);
        const ws = wb.getWorksheet('IO List') as ExcelJS.Worksheet;
        const out: unknown[][] = [];
        ws.eachRow((row) => {
          out.push(row.values as unknown[]);
        });
        return out;
      };
      expect(await readCells(b.xlsx)).toEqual(await readCells(a.xlsx));
      expect(await readFile(b.csv)).toEqual(await readFile(a.csv));
      expect(await readFile(b.yaml, 'utf8')).toBe(await readFile(a.yaml, 'utf8'));
    } finally {
      await rm(dirA, { recursive: true, force: true });
      await rm(dirB, { recursive: true, force: true });
    }
  });

  it('smoke perf (OQ-340): sinh 20 000 tín hiệu, đủ 8 model', () => {
    const t0 = performance.now();
    const data = generateIoFixture({ signalCount: 20000 });
    const ms = performance.now() - t0;
    expect(data.signals).toHaveLength(20000);
    expect(new Set(data.devices.map((d) => d.model)).size).toBe(8);
    expect(ms).toBeLessThan(60_000);
  });
});
