// Tiện ích tag cho test — @vcs/test-utils (M0 §7).
// `defineTags` phân tích shorthand thành TagDef; `makeTags` dựng TagDB + ManualClock.

import { ManualClock, TagDB, type TagDBOptions } from '@vcs/kernel';
import {
  TAG_NAME_RE,
  isValidAddressLight,
  type DataType,
  type SignalKind,
  type TagDef,
} from '@vcs/schemas';

const DATA_TYPES: readonly DataType[] = [
  'Bool',
  'Byte',
  'Word',
  'DWord',
  'SInt',
  'USInt',
  'UInt',
  'UDInt',
  'Int',
  'DInt',
  'Real',
  'LReal',
  'Time',
  'String',
];

/**
 * Phân tích shorthand thành TagDef.
 *
 * Dạng mỗi dòng: `TÊN:Kiểu:Vùng:ĐịaChỉ[:Controller[:Kind]]`
 * (ví dụ `'IN_A:Bool:I:%I0.0'`, `'CNT:Int:Q:%QW0:PLC1:AO'`).
 * - `Controller` mặc định `'PLC1'`; `Kind` suy ra từ vùng + kiểu khi vắng:
 *   I+Bool → DI, I+số → AI, Q+Bool → DO, Q+số → AO, M/DB → null.
 * - Mỗi đối số có thể chứa nhiều dòng (ngăn bằng `\n`); dòng trống và dòng
 *   bắt đầu bằng `#` được bỏ qua. Địa chỉ `sym:...` được chấp nhận.
 */
export function defineTags(...shorthands: string[]): TagDef[] {
  const defs: TagDef[] = [];
  for (const block of shorthands) {
    for (const rawLine of block.split('\n')) {
      const line = rawLine.trim();
      if (line === '' || line.startsWith('#')) continue;
      defs.push(parseTagShorthand(line));
    }
  }
  return defs;
}

function parseTagShorthand(line: string): TagDef {
  const parts = line.split(':').map((p) => p.trim());
  const name = parts[0];
  const typeText = parts[1];
  const area = parts[2];
  if (name === undefined || typeText === undefined || area === undefined) {
    throw new Error(
      `defineTags: dòng '${line}' thiếu trường — dạng 'TÊN:Kiểu:Vùng:ĐịaChỉ[:Controller[:Kind]]'.`,
    );
  }
  if (!TAG_NAME_RE.test(name)) {
    throw new Error(`defineTags: tên tag '${name}' không hợp lệ (dòng '${line}').`);
  }
  if (!(DATA_TYPES as readonly string[]).includes(typeText)) {
    throw new Error(`defineTags: kiểu '${typeText}' không hợp lệ (dòng '${line}').`);
  }
  const type = typeText as DataType;
  if (area !== 'I' && area !== 'Q' && area !== 'M' && area !== 'DB') {
    throw new Error(`defineTags: vùng '${area}' không hợp lệ, nhận I/Q/M/DB (dòng '${line}').`);
  }
  const areaChecked = area;
  // Địa chỉ có thể là 'sym:...' (chứa ':') — ghép lại trước khi đọc tiếp.
  let rest = parts.slice(3);
  let address: string;
  if (rest[0] === 'sym') {
    if (rest[1] === undefined || rest[1] === '') {
      throw new Error(`defineTags: địa chỉ 'sym:' thiếu đường dẫn (dòng '${line}').`);
    }
    address = `sym:${rest[1]}`;
    rest = rest.slice(2);
  } else {
    const addr = rest[0];
    if (addr === undefined || addr === '') {
      throw new Error(`defineTags: dòng '${line}' thiếu địa chỉ.`);
    }
    address = addr;
    rest = rest.slice(1);
  }
  if (!isValidAddressLight(address)) {
    throw new Error(`defineTags: địa chỉ '${address}' không hợp lệ (dòng '${line}').`);
  }
  const controller = rest[0] !== undefined && rest[0] !== '' ? rest[0] : 'PLC1';
  const kindText = rest[1];
  let kind: SignalKind | null;
  if (kindText !== undefined && kindText !== '') {
    if (kindText !== 'DI' && kindText !== 'DO' && kindText !== 'AI' && kindText !== 'AO') {
      throw new Error(`defineTags: kind '${kindText}' không hợp lệ (dòng '${line}').`);
    }
    if ((kindText === 'DI' || kindText === 'AI') && area !== 'I') {
      throw new Error(`defineTags: kind '${kindText}' phải ở area I (dòng '${line}').`);
    }
    if ((kindText === 'DO' || kindText === 'AO') && area !== 'Q') {
      throw new Error(`defineTags: kind '${kindText}' phải ở area Q (dòng '${line}').`);
    }
    kind = kindText;
  } else if (area === 'I') {
    kind = type === 'Bool' ? 'DI' : 'AI';
  } else if (area === 'Q') {
    kind = type === 'Bool' ? 'DO' : 'AO';
  } else {
    kind = null;
  }
  const def: TagDef = { name, type, area: areaChecked, address, controller };
  if (kind !== null) def.signal = { kind };
  return def;
}

/** Tập tag mặc định của `makeTags()` không đối số — bảng golden M0 §6.2/STATE §10. */
const DEFAULT_SHORTHAND = [
  'BTN_START:Bool:I:%I0.0',
  'SENSOR:Bool:I:%I0.1',
  'LAMP_RUN:Bool:Q:%Q0.0',
  'CNT:Int:Q:%QW0',
];

export interface MakeTagsOptions extends TagDBOptions {
  /** Đồng hồ dùng cho TagDB; mặc định tạo `ManualClock` mới ở 0. */
  clock?: ManualClock;
}

/**
 * Dựng TagDB (+ đồng hồ) cho test.
 * `defs` có thể là mảng TagDef, một shorthand (xem `defineTags`), hoặc vắng
 * (dùng tập golden 4 tag: BTN_START/SENSOR/LAMP_RUN/CNT).
 */
export function makeTags(
  defs?: readonly TagDef[] | string,
  opts?: MakeTagsOptions,
): { tags: TagDB; clock: ManualClock } {
  const clock = opts?.clock ?? new ManualClock();
  const resolved: readonly TagDef[] =
    defs === undefined
      ? defineTags(...DEFAULT_SHORTHAND)
      : typeof defs === 'string'
        ? defineTags(defs)
        : defs;
  const tags = new TagDB(resolved, clock, opts);
  return { tags, clock };
}
