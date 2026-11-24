// Test TagDbIoBus + IoPort (M0 §6.3, §12.1: ≥ 12).
import { describe, expect, it } from 'vitest';
import { ManualClock, TagDB, TagDbIoBus } from './index.js';
import type { TagHandle } from './index.js';
import type { DataType, SignalKind, TagDef, TagValue } from '@vcs/schemas';

function mkDef(
  name: string,
  type: DataType,
  area: 'I' | 'Q',
  controller: string,
  kind: SignalKind,
  address: string,
): TagDef {
  return { name, type, area, address, controller, signal: { kind } };
}

function setup(): { tags: TagDB; io: TagDbIoBus } {
  const clock = new ManualClock();
  const tags = new TagDB(
    [
      mkDef('IN_A', 'Bool', 'I', 'PLC1', 'DI', '%I0.0'),
      mkDef('IN_B', 'Bool', 'I', 'PLC1', 'DI', '%I0.1'),
      mkDef('PT01', 'Int', 'I', 'PLC1', 'AI', '%IW64'),
      mkDef('OUT_A', 'Bool', 'Q', 'PLC1', 'DO', '%Q0.0'),
      mkDef('CNT', 'Int', 'Q', 'PLC1', 'AO', '%QW0'),
      mkDef('IN_X', 'Bool', 'I', 'PLC2', 'DI', '%I1.0'),
      mkDef('OUT_X', 'Bool', 'Q', 'PLC2', 'DO', '%Q1.0'),
    ],
    clock,
  );
  return { tags, io: new TagDbIoBus(tags) };
}

describe('TagDbIoBus — readInputs/writeOutputs', () => {
  it('readInputs trả input của controller, không gồm output hay controller khác', () => {
    const { io } = setup();
    expect(io.readInputs('PLC1')).toEqual({ IN_A: false, IN_B: false, PT01: 0 });
    expect(io.readInputs('PLC2')).toEqual({ IN_X: false });
  });

  it('readInputs thấy giá trị plant vừa ghi', () => {
    const { tags, io } = setup();
    tags.setOwner(0 as TagHandle, 'plant');
    tags.setOwner(2 as TagHandle, 'plant');
    tags.set(0 as TagHandle, true, 'plant');
    tags.set(2 as TagHandle, 42, 'plant');
    expect(io.readInputs('PLC1')).toEqual({ IN_A: true, IN_B: false, PT01: 42 });
  });

  it('readInputs controller lạ trả {}', () => {
    const { io } = setup();
    expect(io.readInputs('KHONG_CO')).toEqual({});
  });

  it('readInputs trả object mới mỗi lần (sửa object trả về không ảnh hưởng TagDB)', () => {
    const { io } = setup();
    const a = io.readInputs('PLC1');
    const b = io.readInputs('PLC1');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    (a as Record<string, TagValue>).IN_A = true;
    expect(io.readInputs('PLC1').IN_A).toBe(false);
  });

  it('writeOutputs ghi bằng source plc (thấy ở change sau flush)', () => {
    const { tags, io } = setup();
    const seen: Array<{ name: string; source: string }> = [];
    tags.subscribe('*', (batch) =>
      seen.push(...batch.map((c) => ({ name: c.name, source: c.source }))),
    );
    io.writeOutputs('PLC1', { OUT_A: true, CNT: 3 });
    expect(tags.get(3 as TagHandle)).toBe(true);
    expect(tags.get(4 as TagHandle)).toBe(3);
    tags.flush();
    expect(seen).toEqual([
      { name: 'OUT_A', source: 'plc' },
      { name: 'CNT', source: 'plc' },
    ]);
  });

  it('writeOutputs tag không tồn tại → TAG-E003', () => {
    const { io } = setup();
    expect(() => {
      io.writeOutputs('PLC1', { KHONG_CO: true });
    }).toThrow('TAG-E003');
  });

  it('writeOutputs tag input → TAG-E002; tag của controller khác → TAG-E002', () => {
    const { io } = setup();
    expect(() => {
      io.writeOutputs('PLC1', { IN_A: true });
    }).toThrow('TAG-E002');
    expect(() => {
      io.writeOutputs('PLC1', { OUT_X: true });
    }).toThrow('TAG-E002');
    expect(() => {
      io.writeOutputs('PLC2', { OUT_A: true });
    }).toThrow('TAG-E002');
  });

  it('writeOutputs giá trị sai kiểu → TAG-E001', () => {
    const { io } = setup();
    expect(() => {
      io.writeOutputs('PLC1', { CNT: 40000 });
    }).toThrow('TAG-E001');
  });

  it('writeOutputs rỗng không làm gì, không ném', () => {
    const { io } = setup();
    expect(() => {
      io.writeOutputs('PLC1', {});
    }).not.toThrow();
    expect(() => {
      io.writeOutputs('KHONG_CO', {});
    }).not.toThrow();
  });
});

describe('TagDbIoBus — IoPort (đường nhanh)', () => {
  it('port liệt kê input/output theo thứ tự handle', () => {
    const { io } = setup();
    const port = io.port('PLC1');
    expect(port.inputNames).toEqual(['IN_A', 'IN_B', 'PT01']);
    expect(port.inputHandles).toEqual([0, 1, 2]);
    expect(port.outputNames).toEqual(['OUT_A', 'CNT']);
    expect(port.outputHandles).toEqual([3, 4]);
  });

  it('port() trả cùng object mỗi lần gọi', () => {
    const { io } = setup();
    expect(io.port('PLC1')).toBe(io.port('PLC1'));
    expect(io.port('PLC1')).not.toBe(io.port('PLC2'));
  });

  it('readInputsInto điền target, không cấp phát mảng mới', () => {
    const { tags, io } = setup();
    tags.setOwner(0 as TagHandle, 'plant');
    tags.setOwner(2 as TagHandle, 'plant');
    tags.set(0 as TagHandle, true, 'plant');
    tags.set(2 as TagHandle, 7, 'plant');
    const target: TagValue[] = [false, false, 0];
    io.port('PLC1').readInputsInto(target);
    expect(target).toEqual([true, false, 7]);
  });

  it('readInputsInto target ngắn hơn số input → RangeError', () => {
    const { io } = setup();
    expect(() => {
      io.port('PLC1').readInputsInto([false]);
    }).toThrow(RangeError);
  });

  it('writeOutputsFrom ghi output theo thứ tự, source plc', () => {
    const { tags, io } = setup();
    io.port('PLC1').writeOutputsFrom([true, 5]);
    expect(tags.get(3 as TagHandle)).toBe(true);
    expect(tags.get(4 as TagHandle)).toBe(5);
    expect(tags.read('CNT').source).toBe('plc');
  });

  it('writeOutputsFrom src ngắn hơn số output → RangeError', () => {
    const { io } = setup();
    expect(() => {
      io.port('PLC1').writeOutputsFrom([true]);
    }).toThrow(RangeError);
  });

  it('port controller lạ: danh sách rỗng, read/write rỗng không ném', () => {
    const { io } = setup();
    const port = io.port('KHONG_CO');
    expect(port.inputNames).toEqual([]);
    expect(port.outputHandles).toEqual([]);
    expect(() => {
      port.readInputsInto([]);
    }).not.toThrow();
    expect(() => {
      port.writeOutputsFrom([]);
    }).not.toThrow();
  });
});
