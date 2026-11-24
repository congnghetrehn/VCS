// Test chéo hai bảng TYPE_RANGES (OQ-081, P0.8): kernel (`validateTagValue`)
// và schemas (`initialMatchesType` qua PRJ-E014 ở `loadProject`) phải đồng ý
// về tính hợp lệ của cùng một (kiểu, giá trị khởi tạo). Hai bảng giữ đồng bộ
// bằng tay (không hợp nhất ở P0.8); test này bắt lệch ngay khi một bên đổi.
// Lưu ý cố ý: `initialMatchesType` còn từ chối số không hữu hạn (NaN/±Infinity)
// trong khi `validateTagValue` chấp nhận chúng cho Real/LReal — giá trị khởi
// tạo phải hữu hạn; các trường hợp đó không nằm trong bảng chung này.
import { describe, expect, it } from 'vitest';
import { validateTagValue } from '@vcs/kernel';
import { loadProject, memoryFS } from '@vcs/project';
import type { DataType, TagValue } from '@vcs/schemas';

const PROJECT = `schemaVersion: 1
name: Cross
language: vi
seed: 1
simulation:
  stepMs: 10
  plcScanMs: 10
controllers:
  - id: PLC1
    mode: builtin
    vendor: demo
    model: loopback
`;

function tagsWith(type: DataType, initialYaml: string): string {
  return `tags:
  - name: T
    type: ${type}
    area: I
    address: "%I0.0"
    controller: PLC1
    initial: ${initialYaml}
`;
}

// [kiểu, giá trị JS, literal YAML cho initial, hợp lệ?]
const CROSS_CASES: ReadonlyArray<readonly [DataType, TagValue, string, boolean]> = [
  ['Byte', -1, '-1', false],
  ['Byte', 0, '0', true],
  ['Byte', 255, '255', true],
  ['Byte', 256, '256', false],
  ['Int', -32768, '-32768', true],
  ['Int', 32767, '32767', true],
  ['Int', 32768, '32768', false],
  ['Int', 1.5, '1.5', false],
  ['Int', '5', "'5'", false],
  ['DWord', 4294967295, '4294967295', true],
  ['DWord', 4294967296, '4294967296', false],
  ['Time', 0, '0', true],
  ['Time', -1, '-1', false],
  ['Real', 1.5, '1.5', true],
  ['Real', 'x', 'x', false],
  ['String', '', "''", true],
  ['String', 5, '5', false],
  ['Bool', true, 'true', true],
  ['Bool', 1, '1', false],
];

describe('TYPE_RANGES chéo kernel ↔ schemas (OQ-081)', () => {
  it.each(CROSS_CASES)('%s initial %s → hợp lệ: %s', async (type, v, yaml, valid) => {
    expect(validateTagValue(type, v) === undefined).toBe(valid);
    const model = await loadProject(memoryFS({ 'vcs.project.yaml': PROJECT, 'tags/tags.yaml': tagsWith(type, yaml) }));
    expect(model.diagnostics.some((d) => d.code === 'PRJ-E014')).toBe(!valid);
  });
});
