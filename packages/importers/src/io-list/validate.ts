// Validate mã IO-* (M2 §8.7, P2.6 commit 4).
// Hàm thuần: records (sau transform) + rowNumbers → ValidateResult
// (signals đã normalize + diagnostics sort (row, code) + stats).
// Mức độ: overrides theo mã > khóa nhóm rules > mặc định catalog
// (OQ-348); 'ignore' = không emit. PL-W010 phát cho tag đã gán thiết
// bị mà không còn trong file import (assignedTags do CLI lọc theo
// tags.yaml hiện có — chỉ tag đang tồn tại mới tính là "bị xóa").

import {
  diag,
  IO_CATALOG,
  PL_CATALOG,
  sortDiagnostics,
  type Diagnostic,
  type ImportProfile,
  type IoCode,
  type RuleSeverity,
} from '@vcs/schemas';
import { addressBitRange, rangesOverlap } from './address.js';
import { normalizeImport } from './normalize.js';
import type { DeriveColumns, NormalizeOptions, NormalizedSignal } from './normalize.js';
import type { CellValue, RawGrid } from './read-csv.js';
import type { IoRecord } from './transform.js';

/** Tag đã gán thiết bị trong equipment.yaml (cho PL-W010). */
export interface AssignedTag {
  tag: string;
  equipment: string;
  role: string;
}

export interface ValidateOptions {
  origin: { file: string; sheet?: string };
  profile?: ImportProfile;
  /** Controller đã khai báo; undefined = không kiểm IO-W020. */
  declaredControllers?: string[];
  /** Tag đã gán thiết bị (CLI đã lọc theo tags.yaml hiện có). */
  assignedTags?: AssignedTag[];
  /** Controller mặc định khi record không có controller (OQ-360). */
  defaultController?: string;
  /** Cột addressDerive trích từ lưới (CLI cung cấp). */
  deriveColumns?: DeriveColumns;
}

export interface ValidateStats {
  /** Số record sau khi bỏ dòng trống (IO-I001). */
  records: number;
  errors: number;
  warnings: number;
  infos: number;
  /** Số signal có kind suy từ địa chỉ. */
  inferredKinds: number;
  /** Số dòng trống đã bỏ qua (IO-I001). */
  skippedRows: number;
  diagnosticsByCode: Record<string, number>;
}

export interface ValidateResult {
  signals: NormalizedSignal[];
  diagnostics: Diagnostic[];
  stats: ValidateStats;
}

/** Khóa nhóm rules → mã tương ứng (OQ-348). */
const GROUP_CODES: Partial<Record<IoCode, 'duplicateTag' | 'duplicateAddress' | 'missingType' | 'missingRange'>> = {
  'IO-E001': 'duplicateTag',
  'IO-E011': 'duplicateAddress',
  'IO-E003': 'missingType',
  'IO-W001': 'missingRange',
};

function catalogSeverity(code: string): Diagnostic['severity'] {
  return IO_CATALOG.get(code)?.severity ?? PL_CATALOG.get(code)?.severity ?? 'error';
}

function catalogHint(code: string): string | undefined {
  return IO_CATALOG.get(code)?.hint ?? PL_CATALOG.get(code)?.hint;
}

type EffectiveSeverity = Diagnostic['severity'] | 'ignore';

/** RuleSeverity ('error'|'warn'|'ignore') → mức độ diagnostic
 *  ('error'|'warning'|'info'|'ignore'): 'warn' của rules là
 *  'warning' của Diagnostic. */
function toEffective(sev: RuleSeverity): EffectiveSeverity {
  return sev === 'warn' ? 'warning' : sev;
}

/** Mức độ hiệu dụng: overrides theo mã > khóa nhóm > mặc định catalog. */
export function resolveSeverity(
  code: IoCode | 'PL-W010',
  profile: ImportProfile | undefined,
): EffectiveSeverity {
  const overrides = profile?.rules.overrides as Partial<Record<string, RuleSeverity>> | undefined;
  const byCode = overrides?.[code];
  if (byCode !== undefined) return toEffective(byCode);
  const group = GROUP_CODES[code as IoCode];
  if (group !== undefined) {
    const byGroup = profile?.rules[group];
    if (byGroup !== undefined) return toEffective(byGroup);
  }
  return catalogSeverity(code);
}

/** Số dòng file (1-based) của từng record — căn đúng với output của
// gridToRecords (cùng filter firstDataRow..lastDataRow). */
export function recordRowNumbers(
  grid: RawGrid,
  firstDataRow: number,
  lastDataRow?: number | null,
): number[] {
  const out: number[] = [];
  grid.rows.forEach((_, i) => {
    const n = grid.rowNumbers?.[i] ?? i + 1;
    if (n < firstDataRow) return;
    if (lastDataRow !== undefined && lastDataRow !== null && n > lastDataRow) return;
    out.push(n);
  });
  return out;
}

function isEmptyCell(value: CellValue | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

/** Dòng trống (IO-I001): tag/address/signalType/description/equipment
// đều trống (OQ-353). */
export function isEmptyRow(record: IoRecord): boolean {
  return (
    isEmptyCell(record['tag']) &&
    isEmptyCell(record['address']) &&
    isEmptyCell(record['signalType']) &&
    isEmptyCell(record['description']) &&
    isEmptyCell(record['equipment'])
  );
}

export function validateImport(input: {
  records: IoRecord[];
  rowNumbers: number[];
  origin: { file: string; sheet?: string };
  profile?: ImportProfile;
  declaredControllers?: string[];
  assignedTags?: AssignedTag[];
  defaultController?: string;
  deriveColumns?: DeriveColumns;
}): ValidateResult {
  const { records, rowNumbers, origin, profile } = input;
  const diagnostics: Diagnostic[] = [];

  const emit = (
    code: IoCode | 'PL-W010',
    row: number | null,
    message: string,
  ): void => {
    const severity = resolveSeverity(code, profile);
    if (severity === 'ignore') return;
    const loc =
      row === null ? { file: origin.file } : { file: origin.file, line: row };
    diagnostics.push(diag(code, severity, message, loc, catalogHint(code)));
  };

  // Lọc dòng trống (IO-I001) trước khi normalize; deriveColumns lọc
  // cùng chỉ số để căn hàng không lệch.
  const keptIdx: number[] = [];
  let skippedRows = 0;
  records.forEach((record, i) => {
    if (isEmptyRow(record)) {
      skippedRows += 1;
      emit('IO-I001', rowNumbers[i] ?? i + 1, `dòng ${String(rowNumbers[i] ?? i + 1)} trống — bỏ qua`);
    } else {
      keptIdx.push(i);
    }
  });
  const keptRecords = keptIdx.map((i) => records[i] as IoRecord);
  const keptRows = keptIdx.map((i) => rowNumbers[i] ?? i + 1);
  const deriveColumns =
    input.deriveColumns === undefined
      ? undefined
      : {
          moduleStart: keptIdx.map((i) => input.deriveColumns?.moduleStart[i] ?? null),
          channel: keptIdx.map((i) => input.deriveColumns?.channel[i] ?? null),
          moduleType: keptIdx.map((i) => input.deriveColumns?.moduleType[i] ?? null),
        };

  // exactOptionalPropertyTypes: chỉ gán key khi có giá trị thật.
  const normalizeOpts: NormalizeOptions = {
    origin,
    rowNumbers: keptRows,
  };
  if (input.profile !== undefined) normalizeOpts.profile = input.profile;
  if (input.defaultController !== undefined) normalizeOpts.defaultController = input.defaultController;
  if (deriveColumns !== undefined) normalizeOpts.deriveColumns = deriveColumns;
  const signals = normalizeImport(keptRecords, normalizeOpts);

  for (const s of signals) {
    const row = s.row;
    if (s.tag === '') {
      emit('IO-E002', row, `dòng ${String(row)}: tag trống`);
    } else if (s.tag.length > 128) {
      emit('IO-E002', row, `tag '${s.originalTag}' dài ${String(s.tag.length)} ký tự (> 128)`);
    }
    if (s.addressError !== null) {
      emit('IO-E010', row, s.addressError);
    }
    if (s.cleanedTag) {
      emit('IO-W002', row, `tag '${s.originalTag}' có ký tự không chuẩn → dùng '${s.tag}'`);
    }
    if (s.address !== null) {
      const addr = s.address;
      if (s.kind === null) {
        emit(
          'IO-E003',
          row,
          `dòng ${String(row)}: thiếu signalType và không suy ra được kind từ địa chỉ ${addr.canonical}`,
        );
      } else {
        // IO-E012: hướng (DI/AI↔I, DO/AO↔Q; M/DB + kind bất kỳ → lỗi).
        // sym: không có area nên không kiểm hướng.
        if (addr.area !== null) {
          const dirMismatch =
            ((s.kind === 'DI' || s.kind === 'AI') && addr.area !== 'I') ||
            ((s.kind === 'DO' || s.kind === 'AO') && addr.area !== 'Q');
          if (dirMismatch) {
            emit(
              'IO-E012',
              row,
              `tag '${s.tag}': kind ${s.kind} ở area ${addr.area} (DI/AI phải ở I, DO/AO phải ở Q)`,
            );
          }
        }
        // IO-E013: kind rõ ràng mâu thuẫn width (OQ-345). sym: không
        // có width nên không kiểm.
        if (addr.size !== null) {
          const widthMismatch =
            ((s.kind === 'DI' || s.kind === 'DO') && addr.size !== 'bit') ||
            ((s.kind === 'AI' || s.kind === 'AO') && (addr.size === 'bit' || addr.size === 'B')) ||
            addr.size === 'B';
          if (widthMismatch) {
            emit(
              'IO-E013',
              row,
              `tag '${s.tag}': kind ${s.kind} không khớp độ rộng địa chỉ ${addr.canonical} (DI/DO cần bit, AI/AO cần Word/DWord)`,
            );
          }
        }
      }
      // IO-W003: W offset lẻ, D offset không chia hết cho 4 (kể cả DB).
      if (addr.size === 'W' && addr.byte !== null && addr.byte % 2 !== 0) {
        emit('IO-W003', row, `địa chỉ ${addr.canonical}: Word ở byte lẻ ${String(addr.byte)} (cần byte chẵn)`);
      } else if (addr.size === 'D' && addr.byte !== null && addr.byte % 4 !== 0) {
        emit('IO-W003', row, `địa chỉ ${addr.canonical}: DWord ở byte ${String(addr.byte)} (cần chia hết cho 4)`);
      }
      // IO-W010: I/Q/M vượt 1024 byte; DB không giới hạn (OQ-349).
      if (addr.area === 'I' || addr.area === 'Q' || addr.area === 'M') {
        const range = addressBitRange(addr, s.controller);
        if (range !== null && Math.ceil(range.end / 8) > 1024) {
          emit('IO-W010', row, `địa chỉ ${addr.canonical} vượt vùng 1024 byte của controller ${s.controller}`);
        }
      }
      if (s.peripheral) {
        const rawAddr = s.record['address'];
        const rawAddrStr =
          typeof rawAddr === 'string' ? rawAddr : rawAddr === null || rawAddr === undefined ? '' : String(rawAddr);
        emit('IO-W030', row, `địa chỉ '${rawAddrStr}' có tiền tố peripheral (P/:P) — đã strip về ${addr.canonical}`);
      }
    }
    // IO-W020: controller chưa khai báo (chỉ khi có danh sách khai báo).
    if (
      input.declaredControllers !== undefined &&
      !input.declaredControllers.includes(s.controller)
    ) {
      emit('IO-W020', row, `controller '${s.controller}' chưa khai báo trong vcs.project.yaml`);
    }
    // IO-W001 / IO-W040: range analog.
    if (s.kind === 'AI' || s.kind === 'AO') {
      if (s.rangeNonNumeric) {
        emit('IO-W040', row, `tag '${s.tag}': engMin/engMax không phải số — bỏ range`);
        emit('IO-W001', row, `tín hiệu analog '${s.tag}' thiếu engMin/engMax`);
      } else if (s.engMin === null || s.engMax === null) {
        emit('IO-W001', row, `tín hiệu analog '${s.tag}' thiếu engMin/engMax`);
      } else if (s.engMin >= s.engMax) {
        emit('IO-W040', row, `tag '${s.tag}': engMin (${String(s.engMin)}) ≥ engMax (${String(s.engMax)})`);
      }
    }
  }

  // IO-E001: trùng tag (đã normalize, case-insensitive) — báo dòng sau.
  {
    const firstRow = new Map<string, number>();
    for (const s of signals) {
      if (s.tag === '') continue;
      const key = s.tag.toLowerCase();
      const prev = firstRow.get(key);
      if (prev !== undefined) {
        emit('IO-E001', s.row, `tag '${s.tag}' trùng với dòng ${String(prev)} (không phân biệt hoa/thường)`);
      } else {
        firstRow.set(key, s.row);
      }
    }
  }

  // IO-E011: trùng/chồng địa chỉ — báo CẢ HAI dòng (mỗi cặp chồng lấn).
  // Sweep-line theo (key, start): so từng cặp là O(n²) — smoke 20k đo
  // được 2,5 s chỉ riêng validate; sweep chỉ xét entry đang mở
  // (end > start hiện tại) nên số cặp xét ~ số cặp chồng thật.
  // Thứ tự emit có thể khác bản cặp-lồng-nhau, nhưng diagnostics cuối
  // được sort (row, code) nên đầu ra không đổi.
  {
    interface OverlapEntry {
      signal: NormalizedSignal;
      range: { key: string; start: number; end: number };
    }
    const entries: OverlapEntry[] = [];
    for (const s of signals) {
      if (s.address === null) continue;
      const range = addressBitRange(s.address, s.controller);
      if (range === null) continue;
      entries.push({ signal: s, range });
    }
    const byKey = new Map<string, OverlapEntry[]>();
    for (const e of entries) {
      const list = byKey.get(e.range.key) ?? [];
      list.push(e);
      byKey.set(e.range.key, list);
    }
    for (const list of byKey.values()) {
      list.sort(
        (a, b) => a.range.start - b.range.start || a.range.end - b.range.end || a.signal.row - b.signal.row,
      );
      const active: OverlapEntry[] = [];
      for (const cur of list) {
        for (let k = active.length - 1; k >= 0; k -= 1) {
          if ((active[k] as OverlapEntry).range.end <= cur.range.start) active.splice(k, 1);
        }
        for (const other of active) {
          if (!rangesOverlap(other.range, cur.range)) continue;
          emit(
            'IO-E011',
            other.signal.row,
            `địa chỉ ${other.signal.address?.canonical ?? ''} chồng lấn với dòng ${String(cur.signal.row)} (${cur.signal.address?.canonical ?? ''})`,
          );
          emit(
            'IO-E011',
            cur.signal.row,
            `địa chỉ ${cur.signal.address?.canonical ?? ''} chồng lấn với dòng ${String(other.signal.row)} (${other.signal.address?.canonical ?? ''})`,
          );
        }
        active.push(cur);
      }
    }
  }

  // PL-W010: tag đã gán thiết bị nhưng không còn trong file import.
  if (input.assignedTags !== undefined && input.assignedTags.length > 0) {
    const present = new Set(signals.filter((s) => s.tag !== '').map((s) => s.tag.toLowerCase()));
    for (const assigned of input.assignedTags) {
      if (!present.has(assigned.tag.toLowerCase())) {
        emit(
          'PL-W010',
          null,
          `tag '${assigned.tag}' đã gán cho ${assigned.equipment}.${assigned.role} nhưng không còn trong I/O list sau khi re-import`,
        );
      }
    }
  }

  const sorted = sortDiagnostics(diagnostics);
  const diagnosticsByCode: Record<string, number> = {};
  for (const d of sorted) diagnosticsByCode[d.code] = (diagnosticsByCode[d.code] ?? 0) + 1;
  return {
    signals,
    diagnostics: sorted,
    stats: {
      records: signals.length,
      errors: sorted.filter((d) => d.severity === 'error').length,
      warnings: sorted.filter((d) => d.severity === 'warning').length,
      infos: sorted.filter((d) => d.severity === 'info').length,
      inferredKinds: signals.filter((s) => s.derivedKind).length,
      skippedRows,
      diagnosticsByCode,
    },
  };
}
