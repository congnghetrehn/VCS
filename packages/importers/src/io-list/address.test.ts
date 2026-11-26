// Test chuẩn hóa địa chỉ (M2 §8.5, P2.6 commit 1).
// Bảng 55 case tính tay ở STATE §30 bảng 1 (không sao chép số từ
// implementation); property idempotent + khớp isValidAddressLight;
// bảng chồng lấn 15 cặp (STATE §30 bảng 2) + property bitmap tham chiếu.

import { describe, expect, it } from 'vitest';
import { isValidAddressLight, type DataType } from '@vcs/schemas';
import {
  addressBitRange,
  deriveFromModule,
  deriveKindFromAddress,
  deriveType,
  normalizeAddress,
  parseModuleStart,
  rangesOverlap,
  type AddressArea,
  type ParsedAddress,
} from './address.js';

interface AddressCase {
  input: string;
  /** null = IO-E010 (không hợp lệ). */
  canonical: string | null;
  area: AddressArea | null;
  /** Kiểu suy ra khi kind chưa biết (W → Word; W + AI/AO → Int, test riêng). */
  type: DataType | null;
  peripheral?: boolean;
}

/** STATE §30 bảng 1 — 55 case tính tay theo §8.5 + OQ-341/342/349/358. */
const CASES: AddressCase[] = [
  { input: 'I0.0', canonical: '%I0.0', area: 'I', type: 'Bool' },
  { input: 'I 0.0', canonical: '%I0.0', area: 'I', type: 'Bool' },
  { input: '%I0.0', canonical: '%I0.0', area: 'I', type: 'Bool' },
  { input: 'E0.0', canonical: '%I0.0', area: 'I', type: 'Bool' },
  { input: 'E 0.0', canonical: '%I0.0', area: 'I', type: 'Bool' },
  { input: 'Q0.0', canonical: '%Q0.0', area: 'Q', type: 'Bool' },
  { input: 'A0.0', canonical: '%Q0.0', area: 'Q', type: 'Bool' },
  { input: 'O0.0', canonical: '%Q0.0', area: 'Q', type: 'Bool' },
  { input: '%Q0.0', canonical: '%Q0.0', area: 'Q', type: 'Bool' },
  { input: 'IB0', canonical: '%IB0', area: 'I', type: 'Byte' },
  { input: 'EB0', canonical: '%IB0', area: 'I', type: 'Byte' },
  { input: 'IW64', canonical: '%IW64', area: 'I', type: 'Word' },
  { input: 'EW64', canonical: '%IW64', area: 'I', type: 'Word' },
  { input: 'PIW64', canonical: '%IW64', area: 'I', type: 'Word', peripheral: true },
  { input: 'PEW64', canonical: '%IW64', area: 'I', type: 'Word', peripheral: true },
  { input: 'QW64', canonical: '%QW64', area: 'Q', type: 'Word' },
  { input: 'AW64', canonical: '%QW64', area: 'Q', type: 'Word' },
  { input: 'PQW64', canonical: '%QW64', area: 'Q', type: 'Word', peripheral: true },
  { input: 'PAW64', canonical: '%QW64', area: 'Q', type: 'Word', peripheral: true },
  { input: 'ID0', canonical: '%ID0', area: 'I', type: 'DInt' },
  { input: 'ED0', canonical: '%ID0', area: 'I', type: 'DInt' },
  { input: 'QD0', canonical: '%QD0', area: 'Q', type: 'DInt' },
  { input: 'AD0', canonical: '%QD0', area: 'Q', type: 'DInt' },
  { input: 'M0.0', canonical: '%M0.0', area: 'M', type: 'Bool' },
  { input: 'MW10', canonical: '%MW10', area: 'M', type: 'Word' },
  { input: 'MD20', canonical: '%MD20', area: 'M', type: 'DInt' },
  { input: 'MB5', canonical: '%MB5', area: 'M', type: 'Byte' },
  { input: 'DB1.DBX0.0', canonical: 'DB1.DBX0.0', area: 'DB', type: 'Bool' },
  { input: 'DB1.DBW4', canonical: 'DB1.DBW4', area: 'DB', type: 'Word' },
  { input: 'DB1.DBD8', canonical: 'DB1.DBD8', area: 'DB', type: 'DInt' },
  { input: 'DB1.DBB2', canonical: 'DB1.DBB2', area: 'DB', type: 'Byte' },
  { input: '%I0.0:P', canonical: '%I0.0', area: 'I', type: 'Bool', peripheral: true },
  { input: 'i0.0', canonical: '%I0.0', area: 'I', type: 'Bool' },
  { input: '%iw64', canonical: '%IW64', area: 'I', type: 'Word' },
  { input: '  %I0.0  ', canonical: '%I0.0', area: 'I', type: 'Bool' },
  { input: 'I0.8', canonical: null, area: null, type: null },
  { input: 'I0.9', canonical: null, area: null, type: null },
  { input: 'DB1.DBX0.8', canonical: null, area: null, type: null },
  { input: 'I-1.0', canonical: null, area: null, type: null },
  { input: 'X0.0', canonical: null, area: null, type: null },
  { input: 'T1', canonical: null, area: null, type: null },
  { input: '', canonical: null, area: null, type: null },
  { input: 'IW64.0', canonical: null, area: null, type: null },
  { input: 'IB0.1', canonical: null, area: null, type: null },
  { input: 'DB1.DBW4.0', canonical: null, area: null, type: null },
  { input: 'I0.0.0', canonical: null, area: null, type: null },
  { input: '%', canonical: null, area: null, type: null },
  { input: 'sym:DB1.MyTag', canonical: 'sym:DB1.MyTag', area: null, type: null },
  { input: '%IW65', canonical: '%IW65', area: 'I', type: 'Word' },
  { input: '%ID66', canonical: '%ID66', area: 'I', type: 'DInt' },
  { input: '%IW1024', canonical: '%IW1024', area: 'I', type: 'Word' },
  { input: '%I1023.7', canonical: '%I1023.7', area: 'I', type: 'Bool' },
  { input: '%I1024.0', canonical: '%I1024.0', area: 'I', type: 'Bool' },
  { input: 'PEW70', canonical: '%IW70', area: 'I', type: 'Word', peripheral: true },
  { input: 'PQW64', canonical: '%QW64', area: 'Q', type: 'Word', peripheral: true },
];

describe('normalizeAddress — bảng 55 case (STATE §30 bảng 1)', () => {
  it.each(CASES)('$input → $canonical', (c) => {
    const result = normalizeAddress(c.input);
    if (c.canonical === null) {
      expect(result.ok, c.input).toBe(false);
      if (!result.ok) expect(result.reason.length, c.input).toBeGreaterThan(0);
      return;
    }
    expect(result.ok, c.input).toBe(true);
    if (!result.ok) return;
    expect(result.address.canonical, c.input).toBe(c.canonical);
    expect(result.address.area, c.input).toBe(c.area);
    expect(deriveType(result.address, null), c.input).toBe(c.type);
    expect(result.address.peripheral, c.input).toBe(c.peripheral ?? false);
  });

  it('đủ 55 case (không thiếu dòng bảng tính tay)', () => {
    expect(CASES).toHaveLength(55);
  });

  it('W + kind AI/AO → Int; W + kind DI/DO → Word', () => {
    const w = normalizeAddress('IW64');
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    expect(deriveType(w.address, 'AI')).toBe('Int');
    expect(deriveType(w.address, 'AO')).toBe('Int');
    expect(deriveType(w.address, 'DI')).toBe('Word');
    expect(deriveType(w.address, null)).toBe('Word');
  });

  it('sym: passthrough nguyên văn, kind thiếu → không suy được; có kind → type suy từ kind', () => {
    const r = normalizeAddress('sym:DB1.MyTag');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.address.symbolic).toBe(true);
    expect(r.address.canonical).toBe('sym:DB1.MyTag');
    expect(deriveKindFromAddress(r.address)).toBeNull();
    expect(deriveType(r.address, null)).toBeNull();
    expect(deriveType(r.address, 'DI')).toBe('Bool');
    expect(deriveType(r.address, 'AI')).toBe('Int');
    expect(addressBitRange(r.address, 'PLC1')).toBeNull();
  });

  it('sym: trống → không hợp lệ', () => {
    expect(normalizeAddress('sym:').ok).toBe(false);
  });
});

describe('normalizeAddress — property', () => {
  it('idempotent theo canonical: normalize(normalize(x)).canonical === normalize(x).canonical', () => {
    // Lưu ý: cờ peripheral KHÔNG bảo toàn qua 2 lần normalize — đúng theo
    // thiết kế: P-prefix/:P bị strip ở lần đầu (kèm IO-W030), dạng chuẩn
    // %IW64 không còn P để strip ở lần sau. Tính chất đúng là dạng chuẩn
    // là điểm bất động (fixed point), còn area/size/byte/bit giữ nguyên.
    for (const c of CASES) {
      if (c.canonical === null) continue;
      const first = normalizeAddress(c.input);
      expect(first.ok).toBe(true);
      if (!first.ok) continue;
      const second = normalizeAddress(first.address.canonical);
      expect(second.ok).toBe(true);
      if (!second.ok) continue;
      expect(second.address.canonical, c.input).toBe(first.address.canonical);
      expect(second.address.area, c.input).toBe(first.address.area);
      expect(second.address.size, c.input).toBe(first.address.size);
      expect(second.address.byte, c.input).toBe(first.address.byte);
      expect(second.address.bit, c.input).toBe(first.address.bit);
      expect(second.address.db, c.input).toBe(first.address.db);
      expect(second.address.symbolic, c.input).toBe(first.address.symbolic);
      expect(second.address.peripheral, c.input).toBe(false);
    }
  });

  it('mọi canonical hợp lệ đều qua isValidAddressLight (loader sẽ nhận)', () => {
    for (const c of CASES) {
      if (c.canonical === null) continue;
      expect(isValidAddressLight(c.canonical), c.input).toBe(true);
    }
  });
});

describe('deriveKindFromAddress', () => {
  it.each([
    ['%I0.0', 'DI'],
    ['%I0.1', 'DI'],
    ['%Q0.0', 'DO'],
    ['%IW64', 'AI'],
    ['%QW64', 'AO'],
    ['%ID0', 'AI'],
    ['%QD0', 'AO'],
    ['%IB0', null],
    ['%M0.0', null],
    ['%MW10', null],
    ['DB1.DBX0.0', null],
    ['DB1.DBW4', null],
  ])('%s → %s', (input, kind) => {
    const r = normalizeAddress(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(deriveKindFromAddress(r.address)).toBe(kind);
  });
});

/** STATE §30 bảng 2 — chồng lấn theo khoảng bit. */
const OVERLAP_CASES: { a: string; b: string; controllerA?: string; overlap: boolean }[] = [
  { a: '%IB0', b: '%I0.3', overlap: true },
  { a: '%IW64', b: '%IB65', overlap: true },
  { a: '%IW64', b: '%IB66', overlap: false },
  { a: '%ID0', b: '%IW2', overlap: true },
  { a: '%ID0', b: '%IW4', overlap: false },
  { a: '%I0.0', b: '%I0.1', overlap: false },
  { a: '%I0.0', b: '%I0.0', overlap: true },
  { a: '%Q0.0', b: '%I0.0', overlap: false },
  { a: '%M0.0', b: '%I0.0', overlap: false },
  { a: 'DB1.DBW0', b: 'DB1.DBW2', overlap: false },
  { a: 'DB1.DBX0.0', b: 'DB1.DBB0', overlap: true },
  { a: 'DB1.DBW0', b: 'DB2.DBW0', overlap: false },
  { a: '%IB0', b: '%IB0', controllerA: 'PLC2', overlap: false },
  { a: '%IW64', b: '%IB64', overlap: true },
  { a: '%ID64', b: '%IW66', overlap: true },
];

describe('addressBitRange / rangesOverlap — bảng 15 cặp (STATE §30 bảng 2)', () => {
  it.each(OVERLAP_CASES)('$a vs $b → overlap=$overlap', (c) => {
    const ra = normalizeAddress(c.a);
    const rb = normalizeAddress(c.b);
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(true);
    if (!ra.ok || !rb.ok) return;
    const rangeA = addressBitRange(ra.address, 'PLC1');
    const rangeB = addressBitRange(rb.address, c.controllerA ?? 'PLC1');
    expect(rangeA).not.toBeNull();
    expect(rangeB).not.toBeNull();
    if (rangeA === null || rangeB === null) return;
    expect(rangesOverlap(rangeA, rangeB)).toBe(c.overlap);
    expect(rangesOverlap(rangeB, rangeA)).toBe(c.overlap);
  });

  it('đủ 15 cặp', () => {
    expect(OVERLAP_CASES).toHaveLength(15);
  });

  it('property: overlap khớp mô hình tham chiếu bitmap brute-force (Set bit)', () => {
    // Mô hình tham chiếu độc lập: mỗi địa chỉ → tập bit; giao nhau ⇔ overlap.
    const bitSet = (addr: ParsedAddress): Set<number> => {
      const out = new Set<number>();
      if (addr.symbolic || addr.size === null || addr.byte === null) return out;
      const start = addr.size === 'bit' ? addr.byte * 8 + (addr.bit ?? 0) : addr.byte * 8;
      const len = addr.size === 'bit' ? 1 : addr.size === 'B' ? 8 : addr.size === 'W' ? 16 : 32;
      for (let i = start; i < start + len; i += 1) out.add(i);
      return out;
    };
    const keyOf = (addr: ParsedAddress): string =>
      addr.area === 'DB' ? `DB${String(addr.db)}` : (addr.area ?? '');
    const inputs = [
      '%I0.0', '%I0.1', '%I0.7', '%I1.0', '%IB0', '%IB1', '%IW0', '%IW1', '%IW2',
      '%ID0', '%ID4', '%Q0.0', '%QW0', '%M0.0', '%MW0', 'DB1.DBX0.0', 'DB1.DBB0',
      'DB1.DBW0', 'DB1.DBW2', 'DB1.DBD0', 'DB1.DBD4', 'DB2.DBW0',
    ];
    for (const a of inputs) {
      for (const b of inputs) {
        const pa = normalizeAddress(a);
        const pb = normalizeAddress(b);
        expect(pa.ok).toBe(true);
        expect(pb.ok).toBe(true);
        if (!pa.ok || !pb.ok) continue;
        const ra = addressBitRange(pa.address, 'PLC1');
        const rb = addressBitRange(pb.address, 'PLC1');
        expect(ra).not.toBeNull();
        expect(rb).not.toBeNull();
        if (ra === null || rb === null) continue;
        const setA = bitSet(pa.address);
        const setB = bitSet(pb.address);
        const refOverlap =
          keyOf(pa.address) === keyOf(pb.address) && [...setA].some((x) => setB.has(x));
        expect(rangesOverlap(ra, rb), `${a} vs ${b}`).toBe(refOverlap);
      }
    }
  });
});

describe('deriveFromModule / parseModuleStart (OQ-347)', () => {
  it.each([
    ['DI16', 0, 8, '%I8.0'],
    ['DI16', 8, 8, '%I9.0'],
    ['DI16', 9, 8, '%I9.1'],
    ['DQ8', 3, 0, '%Q0.3'],
    ['AI4', 0, 16, '%IW16'],
    ['AI4', 1, 16, '%IW18'],
    ['AI4', 3, 16, '%IW22'],
    ['AQ2', 2, 32, '%QW36'],
    ['di16', 0, 8, '%I8.0'],
  ])('%s ch=%s start=%s → %s', (moduleType, channel, start, canonical) => {
    const r = deriveFromModule(moduleType, channel, start);
    expect(r?.canonical).toBe(canonical);
  });

  it('channelBase: channel 1 với base 1 → kênh 0', () => {
    expect(deriveFromModule('DI16', 1, 8, 1)?.canonical).toBe('%I8.0');
    expect(deriveFromModule('AI4', 1, 16, 1)?.canonical).toBe('%IW16');
  });

  it('loại module lạ / channel < base → null', () => {
    expect(deriveFromModule('XX8', 0, 8)).toBeNull();
    expect(deriveFromModule('DI16', 0, 8, 1)).toBeNull();
    expect(deriveFromModule('', 0, 8)).toBeNull();
  });

  it('parseModuleStart: số nguyên / chuỗi số / địa chỉ', () => {
    expect(parseModuleStart(8)).toBe(8);
    expect(parseModuleStart('8')).toBe(8);
    expect(parseModuleStart('%IB8')).toBe(8);
    expect(parseModuleStart('IB8')).toBe(8);
    expect(parseModuleStart('%IW64')).toBe(64);
    expect(parseModuleStart(-1)).toBeNull();
    expect(parseModuleStart(1.5)).toBeNull();
    expect(parseModuleStart('xx')).toBeNull();
    expect(parseModuleStart(null)).toBeNull();
    expect(parseModuleStart(true)).toBeNull();
  });
});
