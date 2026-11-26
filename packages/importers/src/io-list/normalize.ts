// Chuẩn hóa tên tag + dựng normalized record (M2 §8.6, P2.6 commit 2).
// Hàm thuần: IoRecord (sau transform) → NormalizedSignal (TagDef sẵn
// sàng ghi tags.yaml + metadata để validate/diff dùng).
//
// Quyết định tier A (ghi ở STATE §30 kết quả commit 2):
// - signalType nhận cả dạng Đức DE/DA/AE/AA (spec §4.4 ví dụ transform
//   map DE→DI, DA→DO, AE→AI, AA→AO); dạng khác → coi như thiếu kind.
// - scaling chỉ dựng khi kind AI/AO và engMin/engMax đều là số (raw
//   0..27648 theo chuẩn Siemens — file không có cột raw range); engMin
//   === engMax vẫn dựng scaling để safety net PRJ-E012 chặn commit
//   (OQ-352); non-number → bỏ range (+ IO-W040, AI/AO thêm IO-W001).
// - tagDef = null khi không dựng được TagDef hợp lệ (tên lỗi, địa chỉ
//   lỗi, thiếu kind cho sym:, thiếu type) — không bịa TagDef giả; các
//   record này luôn kèm diagnostic lỗi nên commit bị chặn.
// - sym: + kind → area suy từ kind (DI/AI→I, DO/AO→Q); sym: + thiếu
//   kind → tagDef null + IO-E003 (validate).
// - addressDerive: cột là TÊN HEADER (§4.4: "Module Start"/"Channel"/
//   "Module"); CLI trích từ lưới theo tên header đưa vào opts.deriveColumns;
//   fallback: đọc trực tiếp record[column] (record tự dựng trong test).
//   Thiếu moduleType → suy area/size từ kind (DI/DO→bit, AI/AO→word);
//   module 8/16/32 không ảnh hưởng công thức địa chỉ.

import type { DataType, ImportProfile, SignalKind, TagDef } from '@vcs/schemas';
import { normalizeAddress, deriveFromModule, deriveKindFromAddress, deriveType, parseModuleStart } from './address.js';
import type { ParsedAddress } from './address.js';
import type { CellValue, RawGrid } from './read-csv.js';
import { headerRowIndex } from './mapping.js';
import type { IoRecord } from './transform.js';

/** Tên tag đã chuẩn hóa (§8.6). `cleaned` = true chỉ khi có ký tự lạ
// bị thay hoặc ký tự đầu bị thêm '_' (IO-W002); trim và space → '_'
// KHÔNG tính là làm sạch (bảng 3). */
export function normalizeTagName(raw: string): { tag: string; cleaned: boolean } {
  const trimmed = raw.trim();
  const spaced = trimmed.replace(/\s+/g, '_');
  const legal = spaced.replace(/[^A-Za-z0-9_.-]/g, '_');
  const illegalReplaced = legal !== spaced;
  let out = legal;
  let leadingFixed = false;
  if (out !== '' && !/^[A-Za-z_]/.test(out)) {
    out = `_${out}`;
    leadingFixed = true;
  }
  return { tag: out, cleaned: illegalReplaced || leadingFixed };
}

/** signalType trong file: DI/DO/AI/AO + dạng Đức DE/DA/AE/AA (§4.4).
// Khác (kể cả chuỗi rỗng) → null (coi như thiếu kind). */
export function parseSignalType(value: CellValue): SignalKind | null {
  if (typeof value !== 'string') return null;
  switch (value.trim().toUpperCase()) {
    case 'DI':
    case 'DE':
      return 'DI';
    case 'DO':
    case 'DA':
      return 'DO';
    case 'AI':
    case 'AE':
      return 'AI';
    case 'AO':
    case 'AA':
      return 'AO';
    default:
      return null;
  }
}

/** polarity NO/NC (không phân biệt hoa/thường); khác → null (bỏ qua). */
export function parsePolarity(value: CellValue): 'NO' | 'NC' | null {
  if (typeof value !== 'string') return null;
  const t = value.trim().toUpperCase();
  if (t === 'NO' || t === 'NC') return t;
  return null;
}

function cellString(value: CellValue): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t === '' ? null : t;
}

function parseEng(value: CellValue): { num: number | null; nonNumeric: boolean } {
  if (value === null) return { num: null, nonNumeric: false };
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { num: value, nonNumeric: false } : { num: null, nonNumeric: true };
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '') return { num: null, nonNumeric: false };
    const n = Number(t);
    return Number.isFinite(n) ? { num: n, nonNumeric: false } : { num: null, nonNumeric: true };
  }
  return { num: null, nonNumeric: true };
}

export interface DeriveColumns {
  /** Giá trị cột moduleStart (số byte hoặc địa chỉ) theo từng record. */
  moduleStart: CellValue[];
  /** Giá trị cột channel theo từng record. */
  channel: CellValue[];
  /** Giá trị cột moduleType ('DI16'...) theo từng record (nếu có). */
  moduleType: CellValue[];
}

export interface NormalizeOptions {
  profile?: ImportProfile;
  /** Controller mặc định khi record không có controller (OQ-360). */
  defaultController?: string;
  /** Origin ghi vào TagDef.origin (file/sheet từ bước đọc). */
  origin?: { file: string; sheet?: string };
  /** Số dòng file (1-based) của từng record — căn với gridToRecords. */
  rowNumbers?: number[];
  /** Cột addressDerive trích từ lưới theo tên header (CLI cung cấp). */
  deriveColumns?: DeriveColumns;
}

export interface NormalizedSignal {
  /** Tên tag đã chuẩn hóa (§8.6). */
  tag: string;
  /** Tên gốc trong file (để report). */
  originalTag: string;
  /** TagDef sẵn sàng ghi tags.yaml; null khi không dựng được (tên lỗi,
// địa chỉ lỗi, thiếu kind cho sym:, thiếu type). */
  tagDef: TagDef | null;
  /** true khi kind suy từ địa chỉ (không có trong file). */
  derivedKind: boolean;
  /** true khi tên đã bị làm sạch (IO-W002). */
  cleanedTag: boolean;
  /** true khi địa chỉ có P-prefix/:P (đã strip + IO-W030). */
  peripheral: boolean;
  /** Số dòng file (1-based). */
  row: number;
  /** Địa chỉ đã parse (null khi lỗi/trống). */
  address: ParsedAddress | null;
  /** Lý do địa chỉ lỗi (để validate báo IO-E010); null khi parse được. */
  addressError: string | null;
  /** Kind cuối (đã cho hoặc suy ra); null khi không có. */
  kind: SignalKind | null;
  /** Kind có trong file (sau chuẩn hóa DE/DA...); null khi thiếu/lạ. */
  givenKind: SignalKind | null;
  /** engMin/engMax đã parse số; null khi vắng/không phải số. */
  engMin: number | null;
  engMax: number | null;
  /** true khi engMin/engMax có mặt nhưng không phải số (IO-W040). */
  rangeNonNumeric: boolean;
  /** Controller đã phân giải (OQ-360). */
  controller: string;
  /** Record gốc — commit dùng để ghi normalized CSV. */
  record: IoRecord;
}

/** Trích cột addressDerive từ lưới theo TÊN HEADER (§4.4), căn hàng với
// output của gridToRecords (cùng filter firstDataRow..lastDataRow).
// Cột header không có → toàn null (derive thất bại từng dòng → IO-E010). */
export function extractDeriveColumns(
  grid: RawGrid,
  headerRow: number,
  firstDataRow: number,
  lastDataRow: number | null | undefined,
  addressDerive: NonNullable<ImportProfile['addressDerive']>,
): DeriveColumns {
  const headerIndex = headerRowIndex(grid, headerRow);
  const headerCells = grid.rows[headerIndex] ?? [];
  const colOf = (name: string): number =>
    headerCells.findIndex((c) => (c === null ? '' : String(c)) === name);
  const startCol = colOf(addressDerive.moduleStartColumn);
  const channelCol = colOf(addressDerive.channelColumn);
  const typeCol =
    addressDerive.moduleTypeColumn !== undefined ? colOf(addressDerive.moduleTypeColumn) : -1;
  const take = (col: number, row: CellValue[]): CellValue =>
    col < 0 ? null : (row[col] ?? null);
  const moduleStart: CellValue[] = [];
  const channel: CellValue[] = [];
  const moduleType: CellValue[] = [];
  grid.rows.forEach((row, i) => {
    const rowNumber = grid.rowNumbers?.[i] ?? i + 1;
    if (rowNumber < firstDataRow) return;
    if (lastDataRow !== undefined && lastDataRow !== null && rowNumber > lastDataRow) return;
    moduleStart.push(take(startCol, row));
    channel.push(take(channelCol, row));
    moduleType.push(take(typeCol, row));
  });
  return { moduleStart, channel, moduleType };
}

function moduleTypeForKind(kind: SignalKind): string {
  // Chỉ area+size ảnh hưởng công thức địa chỉ; cỡ module (8/16/32,
// 2/4/8) không ảnh hưởng nên dùng cỡ nhỏ nhất làm đại diện.
  switch (kind) {
    case 'DI':
      return 'DI8';
    case 'DO':
      return 'DQ8';
    case 'AI':
      return 'AI2';
    case 'AO':
      return 'AQ2';
  }
}

function deriveAddress(
  record: IoRecord,
  index: number,
  profile: ImportProfile | undefined,
  deriveColumns: DeriveColumns | undefined,
): { address: ParsedAddress | null; error: string | null } {
  const rawAddr = record['address'];
  if (typeof rawAddr === 'string' && rawAddr.trim() !== '') {
    const r = normalizeAddress(rawAddr);
    if (r.ok) return { address: r.address, error: null };
    return { address: null, error: r.reason };
  }
  if (rawAddr !== null && rawAddr !== undefined && typeof rawAddr !== 'string') {
    // Ô address có giá trị không phải chuỗi (số/boolean) → không derive.
    return { address: null, error: `địa chỉ không hợp lệ: '${String(rawAddr)}'` };
  }
  // Chuỗi rỗng/trắng hoặc vắng → thử derive từ module (nếu có cấu hình).
  const ad = profile?.addressDerive;
  if (ad === undefined) {
    return { address: null, error: 'địa chỉ trống và không có addressDerive' };
  }
  const byKey = (name: string): CellValue | undefined => record[name];
  const col = deriveColumns;
  const startRaw =
    col !== undefined ? col.moduleStart[index] : byKey(ad.moduleStartColumn);
  const channelRaw =
    col !== undefined ? col.channel[index] : byKey(ad.channelColumn);
  const typeRaw =
    col !== undefined
      ? col.moduleType[index]
      : ad.moduleTypeColumn !== undefined
        ? byKey(ad.moduleTypeColumn)
        : undefined;
  const start = parseModuleStart(startRaw ?? null);
  if (start === null) {
    return { address: null, error: `không parse được moduleStart '${String(startRaw ?? '')}'` };
  }
  const channel =
    typeof channelRaw === 'number'
      ? channelRaw
      : typeof channelRaw === 'string' && channelRaw.trim() !== '' && /^-?\d+$/.test(channelRaw.trim())
        ? Number(channelRaw.trim())
        : null;
  if (channel === null || !Number.isInteger(channel)) {
    return { address: null, error: `không parse được channel '${String(channelRaw ?? '')}'` };
  }
  const givenKind = parseSignalType(record['signalType'] ?? null);
  const moduleType =
    typeof typeRaw === 'string' && typeRaw.trim() !== ''
      ? typeRaw.trim()
      : givenKind !== null
        ? moduleTypeForKind(givenKind)
        : null;
  if (moduleType === null) {
    return { address: null, error: 'không suy được địa chỉ: thiếu loại module và signalType' };
  }
  const derived = deriveFromModule(moduleType, channel, start, ad.channelBase);
  if (derived === null) {
    return { address: null, error: `không suy được địa chỉ từ module '${moduleType}' channel ${String(channel)}` };
  }
  return { address: derived, error: null };
}

/** Chuẩn hóa một record thành NormalizedSignal. */
export function normalizeImport(records: IoRecord[], opts: NormalizeOptions = {}): NormalizedSignal[] {
  const profile = opts.profile;
  return records.map((record, i) => {
    const row = opts.rowNumbers?.[i] ?? i + 1;
    const rawTag = record['tag'];
    const rawTagStr =
      typeof rawTag === 'string' ? rawTag : rawTag === null || rawTag === undefined ? '' : String(rawTag);
    const { tag, cleaned } = normalizeTagName(rawTagStr);

    const { address, error: addressError } = deriveAddress(record, i, profile, opts.deriveColumns);
    const givenKind = parseSignalType(record['signalType'] ?? null);
    const derived = address !== null ? deriveKindFromAddress(address) : null;
    const kind = givenKind ?? derived;
    const derivedKind = givenKind === null && derived !== null;

    const engMinParsed = parseEng(record['engMin'] ?? null);
    const engMaxParsed = parseEng(record['engMax'] ?? null);
    const engMin = engMinParsed.num;
    const engMax = engMaxParsed.num;
    const rangeNonNumeric = engMinParsed.nonNumeric || engMaxParsed.nonNumeric;

    const controllerCell = record['controller'] ?? null;
    const controllerRaw =
      typeof controllerCell === 'string'
        ? controllerCell.trim() === ''
          ? null
          : controllerCell.trim()
        : typeof controllerCell === 'number'
          ? String(controllerCell)
          : null;
    const defaultsController = profile?.defaults['controller'];
    const controller =
      controllerRaw ??
      (typeof defaultsController === 'string'
        ? defaultsController.trim() === ''
          ? null
          : defaultsController.trim()
        : typeof defaultsController === 'number' || typeof defaultsController === 'boolean'
          ? String(defaultsController)
          : null) ??
      opts.defaultController ??
      'PLC1';

    const tagDef = buildTagDef({
      tag,
      address,
      kind,
      controller,
      record,
      engMin,
      engMax,
      row,
      origin: opts.origin,
    });

    return {
      tag,
      originalTag: rawTagStr,
      tagDef,
      derivedKind,
      cleanedTag: cleaned,
      peripheral: address?.peripheral ?? false,
      row,
      address,
      addressError,
      kind,
      givenKind,
      engMin,
      engMax,
      rangeNonNumeric,
      controller,
      record,
    };
  });
}

/** Raw range chuẩn Siemens cho AI/AO khi file chỉ cho eng range
// (OQ-352: file không có cột raw range). */
const RAW_MIN = 0;
const RAW_MAX = 27648;

function buildTagDef(input: {
  tag: string;
  address: ParsedAddress | null;
  kind: SignalKind | null;
  controller: string;
  record: IoRecord;
  engMin: number | null;
  engMax: number | null;
  row: number;
  origin: NormalizeOptions['origin'];
}): TagDef | null {
  const { tag, address, kind, controller, record, engMin, engMax, row, origin } = input;
  if (tag === '' || tag.length > 128) return null;
  if (address === null) return null;
  const type: DataType | null = deriveType(address, kind);
  if (type === null) return null;
  let area = address.area;
  if (area === null) {
    // sym: — area suy từ kind (DI/AI→I, DO/AO→Q); thiếu kind → null.
    if (kind === 'DI' || kind === 'AI') area = 'I';
    else if (kind === 'DO' || kind === 'AO') area = 'Q';
    else return null;
  }
  const tagDef: TagDef = {
    name: tag,
    type,
    area,
    address: address.canonical,
    controller,
  };
  const description = cellString(record['description'] ?? null);
  if (description !== null) tagDef.description = description;
  const polarity = parsePolarity(record['polarity'] ?? null);
  if (kind !== null || polarity !== null) {
    const signal: NonNullable<TagDef['signal']> = { kind };
    if (polarity !== null) signal.polarity = polarity;
    if (kind === 'AI' || kind === 'AO') {
      if (engMin !== null && engMax !== null) {
        const unit = cellString(record['unit'] ?? null);
        signal.scaling = {
          rawMin: RAW_MIN,
          rawMax: RAW_MAX,
          engMin,
          engMax,
          ...(unit !== null ? { unit } : {}),
        };
      }
    }
    tagDef.signal = signal;
  }
  if (origin !== undefined) {
    tagDef.origin = {
      file: origin.file,
      ...(origin.sheet !== undefined ? { sheet: origin.sheet } : {}),
      row,
    };
  }
  tagDef.provenance = 'import';
  const equipment = cellString(record['equipment'] ?? null);
  if (equipment !== null) tagDef.equipment = equipment;
  return tagDef;
}
