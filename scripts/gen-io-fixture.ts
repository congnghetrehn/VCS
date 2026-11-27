// Sinh fixture I/O list 300 tín hiệu (M2 §11.3) — dùng làm ground truth cho
// P2.5 (đọc CSV/XLSX) / P2.6 (validate) / P2.7 (auto-suggest).
// Chạy: `pnpm gen:io-fixture` (ghi fixtures/io-list-300.{xlsx,csv} +
// fixtures/expected.yaml) hoặc `pnpm gen:io-fixture --out <dir> --seed <n>`.
// Hàm thuần `generateIoFixture()` là nguồn sự thật cho test (không cần file).
// Tính định (OQ-330): cùng seed → cùng nội dung parse được (không so byte,
// vì ExcelJS zip có thể nhúng timestamp); seed mặc định 20261126.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import { stringify as yamlStringify } from 'yaml';
import { defaultRegistry, rngNext, rngState } from '@vcs/plant';
import type { RngState } from '@vcs/plant';
import type { SignalKind } from '@vcs/schemas';

/** Seed mặc định — sinh lại cho cùng nội dung parse được (OQ-330). */
export const FIXTURE_SEED = 20261126;
/** Dòng header trong file (1-based, M2 §11.3: header ở dòng 6). */
export const HEADER_ROW = 6;
/** Dòng dữ liệu đầu tiên (1-based). */
export const FIRST_DATA_ROW = HEADER_ROW + 1;

export const HEADERS = [
  'Station',
  'Tag Name',
  'Description',
  'Type',
  'Address',
  'PLC',
  'Range Lo',
  'Range Hi',
  'Unit',
  'Equipment',
] as const;

/** 5 dòng tiêu đề phụ phía trên header (M2 §11.3). */
export const SUBTITLE_ROWS: readonly (readonly string[])[] = [
  ['IO List - Crushing Line (CR01/CR02)'],
  ['Project: VCS Demo Plant'],
  ['Revision: 3 | Date: 2026-11-26'],
  [],
  ['Note: header at row 6, station column merged vertically'],
];

/** Một tín hiệu trong fixture. `tag`/`address` là giá trị ĐANG CÓ trong file
 *  (kể cả dòng bẩn trùng tag/địa chỉ); `role`/`signalType` là ground truth. */
export interface FixtureSignal {
  tag: string;
  equipment: string;
  model: string;
  role: string | null;
  signalType: SignalKind;
  /** Địa chỉ chuẩn (%I0.0 / %IW64) — định dạng hiển thị trong file có thể
   *  khác (I0.0, E0.0, PEW64...), xem `displayAddress`. */
  address: string;
  description: string;
  unit: string | null;
  engMin: number | null;
  engMax: number | null;
  /** Dòng Excel 1-based trong file. */
  row: number;
  station: string;
}

export type FixtureDirtyKind =
  | 'missing-type'
  | 'suffix-variant'
  | 'duplicate-tag'
  | 'duplicate-address';

/** Một dòng bẩn cố ý (M2 §11.3) — để P2.6 assert phát hiện. */
export interface FixtureDirtyRow {
  row: number;
  kind: FixtureDirtyKind;
  detail: string;
}

export interface FixtureDevice {
  id: string;
  model: string;
  station: string;
}

export interface FixtureData {
  seed: number;
  devices: FixtureDevice[];
  signals: FixtureSignal[];
  dirtyRows: FixtureDirtyRow[];
  headers: readonly string[];
  subtitleRows: readonly (readonly string[])[];
}

export interface GenerateIoFixtureOptions {
  seed?: number;
  /** Sinh đúng N tín hiệu role (không bẩn, không tín hiệu thêm) — dùng cho
   *  smoke test perf 20k dòng (OQ-340). Không cho → layout §11.3 (300). */
  signalCount?: number;
  /** G2 §34: chỉ tắt dirt trùng (duplicateTag + duplicateAddress) để fixture
   *  commit được qua wizard; giữ missingType + suffixVariant (không sinh lỗi). */
  cleanDuplicates?: boolean;
  /** Tên file cơ sở cho xlsx/csv (mặc định 'io-list-300'). */
  fileBase?: string;
}

/** Bố cục 50 thiết bị §11.3, nhóm theo station để cột station merge được
 *  thành khối liên tục. Tổng: 8 motor_dol, 4 motor_vfd, 6 valve_onoff,
 *  3 valve_ctrl, 14 analog_sensor, 10 switch_di, 3 silo_bin, 2 conveyor. */
const DEVICE_LAYOUT: readonly { model: string; station: string; codes: readonly string[] }[] = [
  { model: 'motor_dol', station: 'CR01', codes: ['M01', 'M02', 'M03', 'M04'] },
  { model: 'motor_vfd', station: 'CR01', codes: ['MV01', 'MV02'] },
  { model: 'valve_onoff', station: 'CR01', codes: ['XV01', 'XV02', 'XV03'] },
  { model: 'valve_ctrl', station: 'CR01', codes: ['FCV01', 'FCV02'] },
  {
    model: 'analog_sensor',
    station: 'CR01',
    codes: ['PT01', 'PT02', 'TT01', 'TT02', 'LT01', 'LT02', 'FT01'],
  },
  { model: 'switch_di', station: 'CR01', codes: ['LSH01', 'LSL01', 'ZS01', 'ZS02', 'SS01'] },
  { model: 'silo_bin', station: 'CR01', codes: ['BIN01', 'BIN02'] },
  { model: 'conveyor_simple', station: 'CR01', codes: ['BC01'] },
  { model: 'motor_dol', station: 'CR02', codes: ['M01', 'M02', 'M03', 'M04'] },
  { model: 'motor_vfd', station: 'CR02', codes: ['MV01', 'MV02'] },
  { model: 'valve_onoff', station: 'CR02', codes: ['XV01', 'XV02', 'XV03'] },
  { model: 'valve_ctrl', station: 'CR02', codes: ['FCV01'] },
  {
    model: 'analog_sensor',
    station: 'CR02',
    codes: ['PT03', 'TT03', 'LT03', 'FT02', 'WT01', 'ST01', 'FT03'],
  },
  { model: 'switch_di', station: 'CR02', codes: ['SS02', 'PC01', 'PC02', 'LSH02', 'ZS03'] },
  { model: 'silo_bin', station: 'CR02', codes: ['SILO01'] },
  { model: 'conveyor_simple', station: 'CR02', codes: ['BC02'] },
];

/** Tín hiệu thêm thực tế ngoài role của model (OQ-329, mặc định A):
 *  ground-truth `role: null` → P2.7 để unassigned. Tổng bảng này = 123
 *  (32+12+12+6+14+20+9+18), cộng 177 tín hiệu role = đúng 300. */
interface ExtraSignalDef {
  suffix: string;
  kind: SignalKind;
  unit: string | null;
  engMin: number | null;
  engMax: number | null;
}

const EXTRA_SIGNALS: Readonly<Record<string, readonly ExtraSignalDef[]>> = {
  motor_dol: [
    { suffix: 'TEMP', kind: 'AI', unit: '°C', engMin: 0, engMax: 150 },
    { suffix: 'VIB', kind: 'AI', unit: 'mm/s', engMin: 0, engMax: 25 },
    { suffix: 'PWR', kind: 'AI', unit: 'kW', engMin: 0, engMax: 200 },
    { suffix: 'ESTOP', kind: 'DI', unit: null, engMin: null, engMax: null },
  ],
  motor_vfd: [
    { suffix: 'TEMP', kind: 'AI', unit: '°C', engMin: 0, engMax: 150 },
    { suffix: 'VIB', kind: 'AI', unit: 'mm/s', engMin: 0, engMax: 25 },
    { suffix: 'PWR', kind: 'AI', unit: 'kW', engMin: 0, engMax: 200 },
  ],
  valve_onoff: [
    { suffix: 'TORQ', kind: 'AI', unit: 'Nm', engMin: 0, engMax: 100 },
    { suffix: 'LOCAL', kind: 'DI', unit: null, engMin: null, engMax: null },
  ],
  valve_ctrl: [
    { suffix: 'TORQ', kind: 'AI', unit: 'Nm', engMin: 0, engMax: 100 },
    { suffix: 'LOCAL', kind: 'DI', unit: null, engMin: null, engMax: null },
  ],
  analog_sensor: [{ suffix: 'BYPASS', kind: 'DI', unit: null, engMin: null, engMax: null }],
  switch_di: [
    { suffix: 'TEST', kind: 'DI', unit: null, engMin: null, engMax: null },
    { suffix: 'BYPASS', kind: 'DI', unit: null, engMin: null, engMax: null },
  ],
  silo_bin: [
    { suffix: 'WEIGHT', kind: 'AI', unit: 't', engMin: 0, engMax: 100 },
    { suffix: 'TEMP', kind: 'AI', unit: '°C', engMin: 0, engMax: 150 },
    { suffix: 'DUST', kind: 'DI', unit: null, engMin: null, engMax: null },
  ],
  conveyor_simple: [
    { suffix: 'TEMP', kind: 'AI', unit: '°C', engMin: 0, engMax: 150 },
    { suffix: 'VIB', kind: 'AI', unit: 'mm/s', engMin: 0, engMax: 25 },
    { suffix: 'PWR', kind: 'AI', unit: 'kW', engMin: 0, engMax: 200 },
    { suffix: 'LOAD', kind: 'AI', unit: 't/h', engMin: 0, engMax: 500 },
    { suffix: 'SPEED', kind: 'AI', unit: 'm/s', engMin: 0, engMax: 5 },
    { suffix: 'TRACK', kind: 'DI', unit: null, engMin: null, engMax: null },
    { suffix: 'RIP', kind: 'DI', unit: null, engMin: null, engMax: null },
    { suffix: 'BLOCK', kind: 'DI', unit: null, engMin: null, engMax: null },
    { suffix: 'SLIP', kind: 'DI', unit: null, engMin: null, engMax: null },
  ],
};

/** Mô tả [vi, en, de] theo role/suffix — mô tả trong file lẫn 3 thứ tiếng
 *  (M2 §11.3). Nguồn: role.description của registry (vi) + thuật ngữ
 *  kỹ thuật chuẩn en/de. */
const DESCRIPTIONS: Readonly<Record<string, readonly [string, string, string]>> = {
  runCmd: ['Lệnh chạy', 'Run command', 'Laufbefehl'],
  runFb: ['Phản hồi chạy', 'Run feedback', 'Rückmeldung Lauf'],
  ready: ['Sẵn sàng', 'Ready', 'Bereit'],
  remote: ['Chế độ từ xa', 'Remote mode', 'Fernbetrieb'],
  overloadOk: ['Quá tải OK', 'Overload OK', 'Überlast OK'],
  currentFb: ['Dòng động cơ', 'Motor current', 'Motorstrom'],
  speedRef: ['Đặt tốc độ', 'Speed setpoint', 'Drehzahl Sollwert'],
  speedFb: ['Phản hồi tốc độ', 'Speed feedback', 'Drehzahl Istwert'],
  vfdFaultOk: ['Biến tần không lỗi', 'VFD fault OK', 'FU Störung OK'],
  openCmd: ['Lệnh mở', 'Open command', 'Öffnen Befehl'],
  closeCmd: ['Lệnh đóng', 'Close command', 'Schließen Befehl'],
  openLs: ['Công tắc giới hạn mở', 'Open limit switch', 'Endschalter Auf'],
  closedLs: ['Công tắc giới hạn đóng', 'Closed limit switch', 'Endschalter Zu'],
  fault: ['Lỗi', 'Fault', 'Störung'],
  posRef: ['Đặt vị trí', 'Position setpoint', 'Position Sollwert'],
  posFb: ['Phản hồi vị trí', 'Position feedback', 'Position Istwert'],
  raw: ['Giá trị đo', 'Measured value', 'Messwert'],
  di: ['Đầu vào số', 'Digital input', 'Digitaleingang'],
  levelRaw: ['Mức', 'Level', 'Füllstand'],
  levelHigh: ['Mức cao', 'High level', 'Füllstand Hoch'],
  levelLow: ['Mức thấp', 'Low level', 'Füllstand Niedrig'],
  levelHighHigh: ['Mức rất cao', 'High-high level', 'Füllstand Hoch-Hoch'],
  zeroSpeed: ['Băng đứng yên', 'Zero speed', 'Stillstand'],
  pullCord: ['Dây giật khẩn cấp', 'Pull cord', 'Reißleine'],
  TEMP: ['Nhiệt độ', 'Temperature', 'Temperatur'],
  VIB: ['Độ rung', 'Vibration', 'Vibration'],
  PWR: ['Công suất', 'Power', 'Leistung'],
  ESTOP: ['Dừng khẩn cấp', 'Emergency stop', 'Not-Halt'],
  TORQ: ['Mô-men', 'Torque', 'Drehmoment'],
  LOCAL: ['Điều khiển tại chỗ', 'Local control', 'Vor-Ort-Steuerung'],
  BYPASS: ['Bỏ qua', 'Bypass', 'Bypass'],
  TEST: ['Nút kiểm tra', 'Test button', 'Testtaster'],
  WEIGHT: ['Khối lượng', 'Weight', 'Gewicht'],
  DUST: ['Báo bụi', 'Dust alarm', 'Staubalarm'],
  LOAD: ['Lưu lượng', 'Flow rate', 'Förderleistung'],
  SPEED: ['Tốc độ băng', 'Belt speed', 'Bandgeschwindigkeit'],
  TRACK: ['Lệch băng', 'Belt tracking', 'Bandlauf'],
  RIP: ['Rách băng', 'Belt rip', 'Bandriss'],
  BLOCK: ['Tắc chute', 'Chute blocked', 'Schurre verstopft'],
  SLIP: ['Trượt băng', 'Belt slip', 'Bandschlupf'],
};

/** Khoảng đo + đơn vị của cảm biến tương tự theo tiền tố mã thiết bị. */
const SENSOR_RANGES: Readonly<Record<string, { unit: string; engMin: number; engMax: number }>> = {
  PT: { unit: 'bar', engMin: 0, engMax: 10 },
  TT: { unit: '°C', engMin: 0, engMax: 200 },
  LT: { unit: '%', engMin: 0, engMax: 100 },
  FT: { unit: 't/h', engMin: 0, engMax: 500 },
  WT: { unit: 't', engMin: 0, engMax: 100 },
  ST: { unit: '%', engMin: 0, engMax: 100 },
};

/** Hậu tố thay thế cho 9 dòng sai hậu tố (M2 §11.3). Lưu ý: RUNNING/RUN_ST/
 *  RUN_FBK đều có trong synonyms của role runFb trong registry — "sai" ở
 *  đây nghĩa là không dùng hậu tố chuẩn (synonym đầu tiên RUN_FB); ground
 *  truth role vẫn là runFb. */
const SUFFIX_VARIANTS = ['RUN_FBK', 'RUNNING', 'RUN_ST'] as const;

/** Số dòng bẩn cố ý theo từng loại (M2 §11.3: ~5% / ~3% / ~2% / ~2%). */
const DIRTY_COUNTS = { missingType: 15, suffixVariant: 9, duplicateTag: 6, duplicateAddress: 6 } as const;

/** Khoảng đo + đơn vị của một role AI (null với DI/DO). */
function aiRange(
  role: string,
  codePrefix: string,
): { unit: string; engMin: number; engMax: number } | null {
  switch (role) {
    case 'currentFb':
      return { unit: 'A', engMin: 0, engMax: 150 };
    case 'speedRef':
    case 'speedFb':
    case 'posRef':
    case 'posFb':
    case 'levelRaw':
      return { unit: '%', engMin: 0, engMax: 100 };
    case 'raw':
      return SENSOR_RANGES[codePrefix] ?? { unit: '%', engMin: 0, engMax: 100 };
    default:
      return null;
  }
}

/** Chọn k chỉ số phân biệt từ 0..count-1 bằng PRNG (sắp xếp theo khóa ngẫu
 *  nhiên) — tất định với cùng seed, không trùng nhau. */
function pickIndices(count: number, k: number, rng: RngState, exclude: ReadonlySet<number>): number[] {
  const picked: number[] = [];
  const used = new Set(exclude);
  const keyed = Array.from({ length: count }, (_, i) => ({ i, key: rngNext(rng) }));
  keyed.sort((a, b) => a.key - b.key);
  for (const { i } of keyed) {
    if (picked.length >= k) break;
    if (used.has(i)) continue;
    used.add(i);
    picked.push(i);
  }
  picked.sort((a, b) => a - b);
  return picked;
}

/** Bộ đếm cấp địa chỉ chuẩn không trùng (bit I/Q, word IW/QW). */
interface AddressAllocator {
  next(kind: SignalKind): string;
}

function createAddressAllocator(): AddressAllocator {
  let diBit = 0;
  let doBit = 0;
  let aiWord = 64;
  let aoWord = 64;
  return {
    next(kind: SignalKind): string {
      switch (kind) {
        case 'DI': {
          const a = `%I${String(Math.floor(diBit / 8))}.${String(diBit % 8)}`;
          diBit += 1;
          return a;
        }
        case 'DO': {
          const a = `%Q${String(Math.floor(doBit / 8))}.${String(doBit % 8)}`;
          doBit += 1;
          return a;
        }
        case 'AI': {
          const a = `%IW${String(aiWord)}`;
          aiWord += 2;
          return a;
        }
        case 'AO': {
          const a = `%QW${String(aoWord)}`;
          aoWord += 2;
          return a;
        }
      }
    },
  };
}

/** Định dạng địa chỉ hiển thị trong file — biến thể hợp lệ theo M2 §8.5
 *  (I0.0 / E0.0 / %I0.0 / PEW64...). Ground truth trong expected.yaml luôn
 *  là dạng chuẩn %I0.0 / %IW64. */
function displayAddress(canonical: string, rng: RngState): string {
  const bit = /^%([IQ])([0-9]+)\.([0-7])$/.exec(canonical);
  if (bit !== null) {
    const area = bit[1] as string;
    const byte = bit[2] as string;
    const bitNo = bit[3] as string;
    const variants =
      area === 'I' ? [`%I${byte}.${bitNo}`, `I${byte}.${bitNo}`, `E${byte}.${bitNo}`] : [`%Q${byte}.${bitNo}`, `Q${byte}.${bitNo}`, `A${byte}.${bitNo}`];
    const v = variants[Math.floor(rngNext(rng) * variants.length)];
    return v as string;
  }
  const word = /^%([IQ])W([0-9]+)$/.exec(canonical);
  if (word !== null) {
    const area = word[1] as string;
    const byte = word[2] as string;
    const variants =
      area === 'I'
        ? [`%IW${byte}`, `IW${byte}`, `EW${byte}`, `PEW${byte}`]
        : [`%QW${byte}`, `QW${byte}`, `AW${byte}`, `PQW${byte}`];
    const v = variants[Math.floor(rngNext(rng) * variants.length)];
    return v as string;
  }
  throw new Error(`gen-io-fixture: địa chỉ chuẩn không nhận dạng được: ${canonical}`);
}

/** Bỏ dấu tiếng Việt (NFD + đ/Đ) — CSV là Windows-1252, không chứa được ký
 *  tự tiếng Việt có dấu (U+0100+). Mô tả tiếng Việt trong CSV giữ nguyên từ
 *  nhưng không dấu; mô tả Đức giữ ü/ö/ß (có trong Windows-1252). XLSX giữ
 *  nguyên dấu (UTF-8 nội bộ). */
export function stripDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Trích một ô thành chuỗi hiển thị cho CSV (quote kiểu RFC 4180 khi cần). */
function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const s = String(value);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

interface PendingSignal {
  tag: string;
  equipment: string;
  model: string;
  role: string | null;
  signalType: SignalKind;
  address: string;
  description: string;
  unit: string | null;
  engMin: number | null;
  engMax: number | null;
  station: string;
}

/** Sinh dữ liệu fixture (hàm thuần, tất định theo seed). */
export function generateIoFixture(options: GenerateIoFixtureOptions = {}): FixtureData {
  const seed = options.seed ?? FIXTURE_SEED;
  const rng = rngState(seed);
  const devices: FixtureDevice[] = [];
  const pending: PendingSignal[] = [];

  const alloc = createAddressAllocator();
  const describe = (key: string): string => {
    const entry = DESCRIPTIONS[key];
    if (entry === undefined) throw new Error(`gen-io-fixture: thiếu mô tả cho ${key}`);
    const r = rngNext(rng);
    return r < 0.5 ? entry[0] : r < 0.8 ? entry[1] : entry[2];
  };

  if (options.signalCount !== undefined) {
    // Chế độ smoke perf (OQ-340): thiết bị quay vòng 8 model tới đủ N tín
    //  hiệu role, không bẩn, không tín hiệu thêm.
    const models = ['motor_dol', 'motor_vfd', 'valve_onoff', 'valve_ctrl', 'analog_sensor', 'switch_di', 'silo_bin', 'conveyor_simple'];
    const counters = new Map<string, number>();
    const prefixes: Record<string, string> = {
      motor_dol: 'M',
      motor_vfd: 'MV',
      valve_onoff: 'XV',
      valve_ctrl: 'FCV',
      analog_sensor: 'PT',
      switch_di: 'ZS',
      silo_bin: 'BIN',
      conveyor_simple: 'BC',
    };
    let mi = 0;
    while (pending.length < options.signalCount) {
      const model = models[mi % models.length] as string;
      mi += 1;
      const def = defaultRegistry.get(model);
      if (def === undefined) throw new Error(`gen-io-fixture: model ${model} chưa đăng ký`);
      const n = (counters.get(model) ?? 0) + 1;
      counters.set(model, n);
      const code = `${prefixes[model] as string}${String(n).padStart(2, '0')}`;
      const equipment = `SM01_${code}`;
      devices.push({ id: equipment, model, station: 'SM01' });
      for (const role of def.roles) {
        const suffix = role.synonyms[0] as string;
        const range = role.kind === 'AI' || role.kind === 'AO' ? aiRange(role.role, code.replace(/[0-9]+$/, '')) : null;
        pending.push({
          tag: `${equipment}_${suffix}`,
          equipment,
          model,
          role: role.role,
          signalType: role.kind,
          address: alloc.next(role.kind),
          description: describe(role.role),
          unit: range?.unit ?? null,
          engMin: range?.engMin ?? null,
          engMax: range?.engMax ?? null,
          station: 'SM01',
        });
      }
    }
    // Cắt đúng signalCount (vòng lặp thêm cả thiết bị nên có thể vượt) và
    // chỉ giữ thiết bị còn ít nhất một tín hiệu sau khi cắt.
    const sliced = pending.slice(0, options.signalCount);
    const keptIds = new Set(sliced.map((s) => s.equipment));
    const signals: FixtureSignal[] = sliced.map((s, i) => ({ ...s, row: FIRST_DATA_ROW + i }));
    return {
      seed,
      devices: devices.filter((d) => keptIds.has(d.id)),
      signals,
      dirtyRows: [],
      headers: HEADERS,
      subtitleRows: SUBTITLE_ROWS,
    };
  }

  // Layout §11.3: 50 thiết bị, tín hiệu role + tín hiệu thêm.
  for (const entry of DEVICE_LAYOUT) {
    for (const code of entry.codes) {
      const equipment = `${entry.station}_${code}`;
      const def = defaultRegistry.get(entry.model);
      if (def === undefined) throw new Error(`gen-io-fixture: model ${entry.model} chưa đăng ký`);
      devices.push({ id: equipment, model: entry.model, station: entry.station });
      const codePrefix = code.replace(/[0-9]+$/, '');
      for (const role of def.roles) {
        const suffix = role.synonyms[0] as string;
        const range = role.kind === 'AI' || role.kind === 'AO' ? aiRange(role.role, codePrefix) : null;
        pending.push({
          tag: `${equipment}_${suffix}`,
          equipment,
          model: entry.model,
          role: role.role,
          signalType: role.kind,
          address: alloc.next(role.kind),
          description: describe(role.role),
          unit: range?.unit ?? null,
          engMin: range?.engMin ?? null,
          engMax: range?.engMax ?? null,
          station: entry.station,
        });
      }
      const extras = EXTRA_SIGNALS[entry.model];
      if (extras === undefined) throw new Error(`gen-io-fixture: thiếu bảng tín hiệu thêm cho ${entry.model}`);
      for (const extra of extras) {
        const range =
          extra.kind === 'AI' || extra.kind === 'AO'
            ? { unit: extra.unit as string, engMin: extra.engMin as number, engMax: extra.engMax as number }
            : null;
        pending.push({
          tag: `${equipment}_${extra.suffix}`,
          equipment,
          model: entry.model,
          role: null,
          signalType: extra.kind,
          address: alloc.next(extra.kind),
          description: describe(extra.suffix),
          unit: range?.unit ?? null,
          engMin: range?.engMin ?? null,
          engMax: range?.engMax ?? null,
          station: entry.station,
        });
      }
    }
  }

  const roleCount = pending.filter((s) => s.role !== null).length;
  const extraCount = pending.length - roleCount;
  if (pending.length !== 300 || roleCount !== 177 || extraCount !== 123) {
    throw new Error(
      `gen-io-fixture: số tín hiệu lệch (tổng ${String(pending.length)}, role ${String(roleCount)}, thêm ${String(extraCount)} — kỳ vọng 300/177/123)`,
    );
  }

  // Chọn dòng bẩn (tập rời nhau, tất định theo seed).
  // --clean-duplicates (G2 §34): tắt dirt trùng để fixture commit được qua
  // wizard; pickIndices với k=0 vẫn rút RNG như thường nên thứ tự rút của
  // các dirt còn lại không đổi — variant khác gốc đúng 12 dòng (6 tag + 6 địa chỉ).
  const dirty = options.cleanDuplicates
    ? { ...DIRTY_COUNTS, duplicateTag: 0, duplicateAddress: 0 }
    : DIRTY_COUNTS;
  const used = new Set<number>();
  const dirtyRows: FixtureDirtyRow[] = [];
  const signals: FixtureSignal[] = pending.map((s, i) => ({ ...s, row: FIRST_DATA_ROW + i }));

  for (const idx of pickIndices(signals.length, dirty.missingType, rng, used)) {
    used.add(idx);
    const s = signals[idx] as FixtureSignal;
    dirtyRows.push({ row: s.row, kind: 'missing-type', detail: `Type cell empty in file; ground truth ${s.signalType}` });
  }
  const runFbIndices = signals.map((s, i) => (s.role === 'runFb' ? i : -1)).filter((i) => i >= 0);
  const variantPool = runFbIndices.filter((i) => !used.has(i));
  for (let k = 0; k < dirty.suffixVariant && k < variantPool.length; k += 1) {
    const idx = variantPool[k] as number;
    used.add(idx);
    const s = signals[idx] as FixtureSignal;
    const variant = SUFFIX_VARIANTS[k % SUFFIX_VARIANTS.length] as string;
    const oldSuffix = s.tag.split('_').at(-1) as string;
    s.tag = `${s.equipment}_${variant}`;
    dirtyRows.push({ row: s.row, kind: 'suffix-variant', detail: `suffix ${oldSuffix} -> ${variant}; ground truth role runFb` });
  }
  for (const idx of pickIndices(signals.length, dirty.duplicateTag, rng, used)) {
    used.add(idx);
    const s = signals[idx] as FixtureSignal;
    const donorIdx = Math.floor(rngNext(rng) * idx);
    const donor = signals[donorIdx] as FixtureSignal;
    const oldTag = s.tag;
    s.tag = donor.tag;
    dirtyRows.push({ row: s.row, kind: 'duplicate-tag', detail: `tag ${oldTag} -> ${donor.tag} (dup of row ${String(donor.row)})` });
  }
  const sameKind = (idx: number): number[] => {
    const kind = (signals[idx] as FixtureSignal).signalType;
    return signals.map((s, i) => (s.signalType === kind && i !== idx && !used.has(i) ? i : -1)).filter((i) => i >= 0);
  };
  for (const idx of pickIndices(signals.length, dirty.duplicateAddress, rng, used)) {
    used.add(idx);
    const s = signals[idx] as FixtureSignal;
    const donors = sameKind(idx);
    if (donors.length === 0) throw new Error('gen-io-fixture: không tìm được donor trùng địa chỉ');
    const donor = signals[donors[Math.floor(rngNext(rng) * donors.length)] as number] as FixtureSignal;
    const oldAddress = s.address;
    s.address = donor.address;
    dirtyRows.push({
      row: s.row,
      kind: 'duplicate-address',
      detail: `address ${oldAddress} -> ${donor.address} (dup of row ${String(donor.row)})`,
    });
  }
  dirtyRows.sort((a, b) => a.row - b.row);

  return { seed, devices, signals, dirtyRows, headers: HEADERS, subtitleRows: SUBTITLE_ROWS };
}

/** Một dòng dữ liệu dưới dạng mảng ô (theo thứ tự HEADERS). */
function signalCells(s: FixtureSignal, rng: RngState, missingType: boolean, forCsv: boolean): (string | number | null)[] {
  return [
    s.station,
    s.tag,
    forCsv ? stripDiacritics(s.description) : s.description,
    missingType ? null : s.signalType,
    displayAddress(s.address, rng),
    'PLC1',
    s.engMin,
    s.engMax,
    s.unit,
    s.equipment,
  ];
}

function buildWorkbook(data: FixtureData): ExcelJS.Workbook {
  const rng = rngState(data.seed);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VCS';
  wb.lastModifiedBy = 'VCS';
  const fixed = new Date('2026-11-26T00:00:00.000Z');
  wb.created = fixed;
  wb.modified = fixed;
  const ws = wb.addWorksheet('IO List');
  const missingTypeRows = new Set(data.dirtyRows.filter((d) => d.kind === 'missing-type').map((d) => d.row));
  for (const row of data.subtitleRows) ws.addRow(row.length === 0 ? [] : [row[0] as string]);
  ws.addRow([...data.headers]);
  for (const s of data.signals) {
    ws.addRow(signalCells(s, rng, missingTypeRows.has(s.row), false));
  }
  // Merge dọc cột station theo từng khối liên tục (M2 §11.3).
  let blockStart = FIRST_DATA_ROW;
  for (let i = 1; i <= data.signals.length; i += 1) {
    const prev = data.signals[i - 1] as FixtureSignal;
    const cur = data.signals[i];
    if (cur === undefined || cur.station !== prev.station) {
      const blockEnd = FIRST_DATA_ROW + i - 1;
      if (blockEnd > blockStart) ws.mergeCells(`A${String(blockStart)}:A${String(blockEnd)}`);
      blockStart = FIRST_DATA_ROW + i;
    }
  }
  // Sheet phụ không liên quan (M2 §11.3).
  const cover = wb.addWorksheet('Cover');
  cover.addRow(['IO List - Crushing Line']);
  cover.addRow(['Revision: 3']);
  cover.addRow(['This sheet is unrelated to the IO data.']);
  return wb;
}

function buildCsvText(data: FixtureData): string {
  const rng = rngState(data.seed);
  const lines: string[] = [];
  const missingTypeRows = new Set(data.dirtyRows.filter((d) => d.kind === 'missing-type').map((d) => d.row));
  for (const row of data.subtitleRows) {
    const cells: (string | number | null)[] = Array.from({ length: HEADERS.length }, () => null);
    if (row.length > 0) cells[0] = row[0] as string;
    lines.push(cells.map(csvCell).join(';'));
  }
  lines.push(HEADERS.map(csvCell).join(';'));
  for (const s of data.signals) {
    lines.push(signalCells(s, rng, missingTypeRows.has(s.row), true).map(csvCell).join(';'));
  }
  const text = `${lines.join('\r\n')}\r\n`;
  // Windows-1252: mọi ký tự phải nằm trong latin1 — fail-fast thay vì ghi
  // sai im lặng (mô tả vi đã bỏ dấu, mô tả de chỉ dùng ü/ö/ß).
  for (const ch of text) {
    if (ch.codePointAt(0) as number > 0xff) {
      throw new Error(`gen-io-fixture: ký tự không mã hóa được Windows-1252: U+${(ch.codePointAt(0) as number).toString(16)}`);
    }
  }
  return text;
}

function buildExpectedYaml(data: FixtureData): string {
  const roleCount = data.signals.filter((s) => s.role !== null).length;
  return yamlStringify({
    generated: {
      seed: data.seed,
      signalCount: data.signals.length,
      roleSignals: roleCount,
      extraSignals: data.signals.length - roleCount,
      headerRow: HEADER_ROW,
      firstDataRow: FIRST_DATA_ROW,
    },
    headers: [...data.headers],
    signals: data.signals.map((s) => ({
      tag: s.tag,
      equipment: s.equipment,
      model: s.model,
      role: s.role,
      signalType: s.signalType,
      address: s.address,
      row: s.row,
    })),
    dirty: data.dirtyRows,
  });
}

export interface WrittenFixture {
  xlsx: string;
  csv: string;
  yaml: string;
}

/** Ghi 3 file fixture vào thư mục out (tạo thư mục nếu chưa có). */
export async function writeIoFixture(outDir: string, options: GenerateIoFixtureOptions = {}): Promise<WrittenFixture> {
  const data = generateIoFixture(options);
  await mkdir(outDir, { recursive: true });
  const base = options.fileBase ?? 'io-list-300';
  const xlsxPath = join(outDir, `${base}.xlsx`);
  const csvPath = join(outDir, `${base}.csv`);
  const yamlPath = join(outDir, 'expected.yaml');
  const wb = buildWorkbook(data);
  await wb.xlsx.writeFile(xlsxPath);
  await writeFile(csvPath, Buffer.from(buildCsvText(data), 'latin1'));
  await writeFile(yamlPath, buildExpectedYaml(data), 'utf8');
  return { xlsx: xlsxPath, csv: csvPath, yaml: yamlPath };
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  let outDir = 'fixtures';
  let seed = FIXTURE_SEED;
  let cleanDuplicates = false;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] as string;
    if (a === '--out') {
      const v = args[i + 1];
      if (v === undefined) throw new Error('gen-io-fixture: --out cần giá trị');
      outDir = v;
      i += 1;
    } else if (a === '--seed') {
      const v = args[i + 1];
      if (v === undefined) throw new Error('gen-io-fixture: --seed cần giá trị');
      seed = Number(v);
      if (!Number.isInteger(seed)) throw new Error('gen-io-fixture: --seed phải là số nguyên');
      i += 1;
    } else if (a === '--clean-duplicates') {
      cleanDuplicates = true;
    } else {
      throw new Error(`gen-io-fixture: tham số không nhận dạng được: ${a}`);
    }
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  // exactOptionalPropertyTypes: chỉ truyền fileBase khi có giá trị.
  const written = await writeIoFixture(join(root, outDir), {
    seed,
    cleanDuplicates,
    ...(cleanDuplicates ? { fileBase: 'io-list-300-clean' } : {}),
  });
  const data = generateIoFixture({ seed, cleanDuplicates });
  process.stdout.write(
    `Đã sinh fixture (${String(data.signals.length)} tín hiệu, ${String(data.devices.length)} thiết bị, ${String(data.dirtyRows.length)} dòng bẩn):\n` +
      `  ${written.xlsx}\n  ${written.csv}\n  ${written.yaml}\n`,
  );
  return 0;
}

// Chỉ chạy CLI khi file là entry point (import từ test không sinh file).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
