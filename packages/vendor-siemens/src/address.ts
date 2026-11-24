// Địa chỉ tuyệt đối Siemens — @vcs/vendor-siemens (M1 §3.3).
// Parser chỉ vị trí, không mang kiểu (OQ-089): kiểu diễn giải (Int vs Word
// vs Real với cùng `%IW`) lấy từ khai báo ở lúc đọc, không từ chuỗi địa chỉ.

export type AbsAddress =
  | { kind: 'area'; area: 'I' | 'Q' | 'M'; byte: number; bit?: number; width: 1 | 8 | 16 | 32 }
  | { kind: 'db'; db: number; byte: number; bit?: number; width: 1 | 8 | 16 | 32 };

const WIDTH_BY_LETTER: Record<string, 1 | 8 | 16 | 32> = { B: 8, W: 16, D: 32 };

function fail(text: string, reason: string): never {
  throw new Error(`địa chỉ không hợp lệ: '${text}' (${reason})`);
}

/**
 * Parse địa chỉ tuyệt đối (M1 §3.3): `%I0.0`, `%IB10`, `%IW64`, `%ID20`
 * (tương tự Q/M), `DB1.DBX0.0`/`DBB`/`DBW`/`DBD`. Không `%` cũng parse được
 * (`I0.0`, `IW64` — chuẩn hóa nội bộ thành dạng `%`); chữ thường chấp nhận
 * + chuẩn hóa hoa; khoảng trắng đầu/cuối được trim (OQ-085).
 * Không kiểm giới hạn vùng ở parse (byte lớn vẫn parse — giới hạn vùng
 * kiểm ở lúc truy cập bộ nhớ). `DB0` và `sym:…` → throw.
 * Sai → throw `Error('địa chỉ không hợp lệ: ...')` (OQ-090).
 */
export function parseAddress(text: string): AbsAddress {
  const trimmed = text.trim();
  if (trimmed === '') fail(text, 'chuỗi rỗng');
  if (/^sym:/i.test(trimmed)) {
    fail(text, 'địa chỉ symbolic (sym:...) không phải địa chỉ tuyệt đối');
  }
  const upper = trimmed.toUpperCase();

  // DB: DB<n>.DBX<b>.<bit> / DBB / DBW / DBD (không có tiền tố %).
  if (upper.startsWith('%DB')) {
    fail(text, 'địa chỉ DB không có tiền tố %');
  }
  if (upper.startsWith('DB')) {
    const m = /^DB(\d+)\.DB([XBWD])(\d+)(?:\.(\d+))?$/.exec(upper);
    if (m === null) {
      fail(text, 'dạng DB phải là DB<n>.DBX<b>.<bit> / DBB<b> / DBW<b> / DBD<b>');
    }
    const db = Number(m[1]);
    if (db === 0) fail(text, 'DB0 không phải DB người dùng');
    const letter = m[2] as string;
    const byte = Number(m[3]);
    const bitText = m[4];
    if (letter === 'X') {
      if (bitText === undefined) fail(text, 'DBX thiếu số bit (dạng DB<n>.DBX<b>.<bit>)');
      const bit = Number(bitText);
      if (bit < 0 || bit > 7) fail(text, 'bit phải 0..7');
      return { kind: 'db', db, byte, bit, width: 1 };
    }
    if (bitText !== undefined) {
      fail(text, `DB${letter} không có phần bit (chỉ DBX mới có bit)`);
    }
    return { kind: 'db', db, byte, width: WIDTH_BY_LETTER[letter] as 8 | 16 | 32 };
  }

  // Vùng I/Q/M: %I0.0 / %IB10 / %IW64 / %ID20 (có hoặc không có %).
  const m = /^%?(I|Q|M)([BWD])?(\d+)(?:\.(\d+))?$/.exec(upper);
  if (m === null) {
    fail(text, 'dạng phải là %I/%Q/%M<b>.<bit> / %IB/%IW/%ID<b> hoặc DB<n>.DB…');
  }
  const area = m[1] as 'I' | 'Q' | 'M';
  const letter = m[2];
  const byte = Number(m[3]);
  const bitText = m[4];
  if (letter === undefined) {
    if (bitText === undefined) fail(text, 'thiếu số bit (dạng %I<b>.<bit>)');
    const bit = Number(bitText);
    if (bit < 0 || bit > 7) fail(text, 'bit phải 0..7');
    return { kind: 'area', area, byte, bit, width: 1 };
  }
  if (bitText !== undefined) {
    fail(text, `dạng %${letter} không có phần bit (chỉ dạng bit mới có .<bit>)`);
  }
  return { kind: 'area', area, byte, width: WIDTH_BY_LETTER[letter] as 8 | 16 | 32 };
}

/**
 * Định dạng chuẩn: `'%I0.0'`, `'%IW64'`, `'DB1.DBW4'`.
 * `parseAddress` rồi `formatAddress` cho dạng chuẩn (dùng cho test
 * round-trip). Width 1 mà thiếu `bit` → throw (địa chỉ bit phải có bit).
 */
export function formatAddress(addr: AbsAddress): string {
  if (addr.width === 1) {
    if (addr.bit === undefined) {
      throw new Error('formatAddress: địa chỉ bit (width 1) thiếu bit');
    }
    return addr.kind === 'area'
      ? `%${addr.area}${String(addr.byte)}.${String(addr.bit)}`
      : `DB${String(addr.db)}.DBX${String(addr.byte)}.${String(addr.bit)}`;
  }
  const letter = addr.width === 8 ? 'B' : addr.width === 16 ? 'W' : 'D';
  return addr.kind === 'area'
    ? `%${addr.area}${letter}${String(addr.byte)}`
    : `DB${String(addr.db)}.DB${letter}${String(addr.byte)}`;
}
