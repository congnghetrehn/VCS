// Test TagAddressMap / parsePlcRef / canonicalRef (OQ-137, OQ-142).
// Cross-test với `parseAddress` (P1.1) KHÔNG ở đây: dep-cruiser cấm
// runtime-iec import vendor-siemens — cross-test nằm ở
// `packages/vendor-siemens/src/scl/softplc.test.ts` (xem STATE §19 "Lệch").

import type { TagDef } from '@vcs/schemas';
import { describe, expect, it } from 'vitest';
import {
  buildTagAddressMap,
  canonicalRef,
  defaultTagValue,
  parsePlcRef,
  type TagAddressMap,
} from './tagmap.js';

function tag(name: string, type: TagDef['type'], area: TagDef['area'], address: string): TagDef {
  return { name, type, area, address, controller: 'PLC1' };
}

const TAGS: TagDef[] = [
  tag('START_PB', 'Bool', 'I', '%I0.0'),
  tag('RUN_LAMP', 'Bool', 'Q', '%Q0.0'),
  tag('SPEED', 'Int', 'M', '%MW10'),
  tag('COUNT', 'DInt', 'M', '%MD20'),
  tag('DB1_VAL', 'Int', 'DB', 'DB1.DBW0'),
  tag('DB1_FLAG', 'Bool', 'DB', 'DB1.DBX2.0'),
];

const MAP: TagAddressMap = buildTagAddressMap(TAGS);

describe('buildTagAddressMap', () => {
  it('map đủ dạng I/Q/M/DB, giữ nguyên case tên tag', () => {
    expect(MAP.get('START_PB')).toEqual({ area: 'I', byte: 0, bit: 0, type: 'Bool' });
    expect(MAP.get('RUN_LAMP')).toEqual({ area: 'Q', byte: 0, bit: 0, type: 'Bool' });
    expect(MAP.get('SPEED')).toEqual({ area: 'M', byte: 10, type: 'Int' });
    expect(MAP.get('COUNT')).toEqual({ area: 'M', byte: 20, type: 'DInt' });
    expect(MAP.get('DB1_VAL')).toEqual({ area: 'DB', byte: 0, db: 1, type: 'Int' });
    expect(MAP.get('DB1_FLAG')).toEqual({ area: 'DB', byte: 2, bit: 0, db: 1, type: 'Bool' });
  });

  it('dùng kiểu khai báo của tag, không diễn giải lại theo OQ-110', () => {
    const map = buildTagAddressMap([tag('X', 'Real', 'M', '%MD30')]);
    expect(map.get('X')).toEqual({ area: 'M', byte: 30, type: 'Real' });
  });

  it('tên tag trùng → throw ồn ào', () => {
    expect(() => buildTagAddressMap([tag('A', 'Bool', 'I', '%I0.0'), tag('A', 'Bool', 'I', '%I0.1')])).toThrow(
      /trùng tên tag 'A'/,
    );
  });

  it("sym: → throw (chưa hỗ trợ, P5.7)", () => {
    expect(() => buildTagAddressMap([tag('S', 'Bool', 'I', 'sym:foo')])).toThrow(/sym:/);
  });
});

describe('parsePlcRef', () => {
  it('đủ dạng abs: bit/byte/word/dword/lreal', () => {
    expect(parsePlcRef('%I0.0', MAP)).toEqual({ k: 'abs', area: 'I', byte: 0, bit: 0, width: 8, type: 'Bool' });
    expect(parsePlcRef('%MW10', MAP)).toEqual({ k: 'abs', area: 'M', byte: 10, width: 16, type: 'Int' });
    expect(parsePlcRef('%MD0', MAP)).toEqual({ k: 'abs', area: 'M', byte: 0, width: 32, type: 'DInt' });
    expect(parsePlcRef('%Q0.0', MAP)).toEqual({ k: 'abs', area: 'Q', byte: 0, bit: 0, width: 8, type: 'Bool' });
    expect(parsePlcRef('%ML10', MAP)).toEqual({ k: 'abs', area: 'M', byte: 10, width: 64, type: 'LReal' });
    expect(parsePlcRef('I0.1', MAP)).toEqual({ k: 'abs', area: 'I', byte: 0, bit: 1, width: 8, type: 'Bool' });
  });

  it('đủ dạng absDb', () => {
    expect(parsePlcRef('DB1.DBW4', MAP)).toEqual({ k: 'absDb', db: 1, byte: 4, width: 16, type: 'Int' });
    expect(parsePlcRef('DB1.DBX0.0', MAP)).toEqual({ k: 'absDb', db: 1, byte: 0, bit: 0, width: 8, type: 'Bool' });
    expect(parsePlcRef('DB1.DBL4', MAP)).toEqual({ k: 'absDb', db: 1, byte: 4, width: 64, type: 'LReal' });
  });

  it('dbField: "DB".field[.sub]', () => {
    expect(parsePlcRef('"DB_X".run', MAP)).toEqual({ k: 'dbField', db: 'DB_X', path: ['run'] });
    expect(parsePlcRef('"DB_X".motor.speed', MAP)).toEqual({
      k: 'dbField',
      db: 'DB_X',
      path: ['motor', 'speed'],
    });
  });

  it('tên tag symbolic → {k: tag} (kể cả tên bắt đầu bằng DB như DB1_VAL)', () => {
    expect(parsePlcRef('START_PB', MAP)).toEqual({ k: 'tag', name: 'START_PB' });
    // Hồi quy: 'DB1_VAL' bắt đầu bằng 'DB' nhưng là tag, không phải ref DB.
    expect(parsePlcRef('DB1_VAL', MAP)).toEqual({ k: 'tag', name: 'DB1_VAL' });
    expect(parsePlcRef('DB1_FLAG', MAP)).toEqual({ k: 'tag', name: 'DB1_FLAG' });
  });

  it('#name / sym: / sai cú pháp / không tìm thấy → RangeError nêu ref', () => {
    expect(() => parsePlcRef('#foo', MAP)).toThrow(RangeError);
    expect(() => parsePlcRef('sym:foo', MAP)).toThrow(RangeError);
    expect(() => parsePlcRef('', MAP)).toThrow(RangeError);
    expect(() => parsePlcRef('NO_SUCH_TAG', MAP)).toThrow(RangeError);
    expect(() => parsePlcRef('"DB_X"', MAP)).toThrow(RangeError);
    expect(() => parsePlcRef('%X0.0', MAP)).toThrow(RangeError);
  });

  it('chữ thường + khoảng trắng thừa được chuẩn hóa', () => {
    expect(parsePlcRef('  %mw10 ', MAP)).toEqual({ k: 'abs', area: 'M', byte: 10, width: 16, type: 'Int' });
    expect(parsePlcRef('db1.dbw4', MAP)).toEqual({ k: 'absDb', db: 1, byte: 4, width: 16, type: 'Int' });
  });
});

describe('canonicalRef (OQ-142)', () => {
  it('%MB10 ≠ %MW10 (khác width là khác force)', () => {
    expect(canonicalRef(parsePlcRef('%MB10', MAP), MAP)).toBe('%MB10');
    expect(canonicalRef(parsePlcRef('%MW10', MAP), MAP)).toBe('%MW10');
  });

  it('tag → dạng abs tương ứng', () => {
    expect(canonicalRef(parsePlcRef('START_PB', MAP), MAP)).toBe('%I0.0');
    expect(canonicalRef(parsePlcRef('SPEED', MAP), MAP)).toBe('%MW10');
    expect(canonicalRef(parsePlcRef('DB1_VAL', MAP), MAP)).toBe('DB1.DBW0');
    expect(canonicalRef(parsePlcRef('DB1_FLAG', MAP), MAP)).toBe('DB1.DBX2.0');
  });

  it('dbField giữ nguyên dạng "DB".field', () => {
    expect(canonicalRef(parsePlcRef('"DB_X".motor.speed', MAP), MAP)).toBe('"DB_X".motor.speed');
  });

  it('bit chuẩn hóa về %I0.0 (không kèm width)', () => {
    expect(canonicalRef(parsePlcRef('%I0.0', MAP), MAP)).toBe('%I0.0');
    expect(canonicalRef(parsePlcRef('DB1.DBX0.0', MAP), MAP)).toBe('DB1.DBX0.0');
  });
});

describe('defaultTagValue', () => {
  it('Bool → false, còn lại → 0', () => {
    expect(defaultTagValue('Bool')).toBe(false);
    expect(defaultTagValue('Int')).toBe(0);
    expect(defaultTagValue('Real')).toBe(0);
  });
});

describe('parsePlcRef — đường lỗi + dạng DB/LReal', () => {
  it('địa chỉ bit thiếu .bit → throw; vùng không biết → throw', () => {
    expect(() => parsePlcRef('%IX0', MAP)).toThrow();
    expect(() => parsePlcRef('%XB0', MAP)).toThrow();
    expect(() => parsePlcRef('%I0.8', MAP)).toThrow();
  });

  it('thiếu dấu " đóng tên DB → throw', () => {
    expect(() => parsePlcRef('"DB_M.motor', MAP)).toThrow(/"/);
  });

  it('%ML10 → LReal 64-bit; DB1.DBX0.0 → bit trong DB', () => {
    expect(parsePlcRef('%ML10', MAP)).toEqual({
      k: 'abs',
      area: 'M',
      byte: 10,
      width: 64,
      type: 'LReal',
    });
    expect(parsePlcRef('DB1.DBX0.0', MAP)).toEqual({
      k: 'absDb',
      db: 1,
      byte: 0,
      bit: 0,
      width: 8,
      type: 'Bool',
    });
  });

  it('canonicalRef: bit → %I0.0; DB bit → DB1.DBX2.0; tag DB → absDb', () => {
    expect(canonicalRef(parsePlcRef('%I0.0', MAP), MAP)).toBe('%I0.0');
    expect(canonicalRef(parsePlcRef('DB1.DBX2.0', MAP), MAP)).toBe('DB1.DBX2.0');
    expect(canonicalRef(parsePlcRef('DB1_VAL', MAP), MAP)).toBe('DB1.DBW0');
    expect(canonicalRef(parsePlcRef('DB1_FLAG', MAP), MAP)).toBe('DB1.DBX2.0');
  });
});
