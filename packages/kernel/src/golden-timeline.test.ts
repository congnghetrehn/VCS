// Golden timeline tính tay — STATE.md §10 (M0 §6.2, AGENTS §4, SKILL-testing §2).
// Bảng tính bằng tay TRƯỚC khi code; implementation khác bảng ⇒ lỗi code,
// không sửa bảng. Driver thủ công (chưa có orchestrator — P0.4):
// plant ghi → controller qua IoBus → flush() → advance(10).
import { describe, expect, it } from 'vitest';
import { ManualClock, TagDB, TagDbIoBus, TraceHasher } from './index.js';
import type { TagChange, TagHandle } from './index.js';
import type { DataType, SignalKind, TagDef, TagValue } from '@vcs/schemas';

function mkDef(
  name: string,
  type: DataType,
  area: 'I' | 'Q',
  kind: SignalKind,
  address: string,
): TagDef {
  return { name, type, area, address, controller: 'PLC1', signal: { kind } };
}

const H = { btn: 0, sensor: 1, lamp: 2, cnt: 3 } as const;

function driver(): {
  tags: TagDB;
  clock: ManualClock;
  changes: TagChange[];
  step: (plant?: () => void) => void;
} {
  const clock = new ManualClock();
  const tags = new TagDB(
    [
      mkDef('BTN_START', 'Bool', 'I', 'DI', '%I0.0'),
      mkDef('SENSOR', 'Bool', 'I', 'DI', '%I0.1'),
      mkDef('LAMP_RUN', 'Bool', 'Q', 'DO', '%Q0.0'),
      mkDef('CNT', 'Int', 'Q', 'AO', '%QW0'),
    ],
    clock,
  );
  tags.setOwner(H.sensor as TagHandle, 'plant');
  const io = new TagDbIoBus(tags);
  const changes: TagChange[] = [];
  tags.subscribe('*', (batch) => changes.push(...batch));
  const step = (plant?: () => void): void => {
    plant?.();
    const inputs = io.readInputs('PLC1');
    io.writeOutputs('PLC1', {
      LAMP_RUN: inputs.SENSOR === true,
      CNT: (tags.get(H.cnt as TagHandle) as number) + 1,
    });
    tags.flush();
    clock.advance(10);
  };
  return { tags, clock, changes, step };
}

function change(
  handle: number,
  name: string,
  oldValue: TagValue,
  newValue: TagValue,
  source: 'plant' | 'plc' | 'system' | 'test',
  ts: number,
  writes: number,
): TagChange {
  return { handle: handle as TagHandle, name, oldValue, newValue, source, ts, writes };
}

describe('Golden timeline §10 — plant trước controller, cùng bước T', () => {
  it('bước 1–4 đúng bảng tính tay', () => {
    const { tags, clock, changes, step } = driver();

    // Bước 1, T=0: plant SENSOR false→true; PLC đọc SENSOR=true ngay bước này.
    step(() => {
      tags.set(H.sensor as TagHandle, true, 'plant');
    });
    expect(clock.nowMs()).toBe(10);
    expect(changes).toEqual([
      change(1, 'SENSOR', false, true, 'plant', 0, 1),
      change(2, 'LAMP_RUN', false, true, 'plc', 0, 1),
      change(3, 'CNT', 0, 1, 'plc', 0, 1),
    ]);

    // Bước 2, T=10: PLC ghi lại LAMP_RUN=true (cùng giá trị) → không phát.
    const n2 = changes.length;
    step();
    expect(clock.nowMs()).toBe(20);
    expect(changes.slice(n2)).toEqual([change(3, 'CNT', 1, 2, 'plc', 10, 1)]);

    // Bước 3, T=20: plant ghi SENSOR false rồi true (2 lần) → net không đổi, không phát.
    const n3 = changes.length;
    step(() => {
      tags.set(H.sensor as TagHandle, false, 'plant');
      tags.set(H.sensor as TagHandle, true, 'plant');
    });
    expect(clock.nowMs()).toBe(30);
    expect(changes.slice(n3)).toEqual([change(3, 'CNT', 2, 3, 'plc', 20, 1)]);

    // Bước 4, T=30: plant SENSOR true→false; PLC tắt LAMP, CNT=4.
    const n4 = changes.length;
    step(() => {
      tags.set(H.sensor as TagHandle, false, 'plant');
    });
    expect(clock.nowMs()).toBe(40);
    expect(changes.slice(n4)).toEqual([
      change(1, 'SENSOR', true, false, 'plant', 30, 1),
      change(2, 'LAMP_RUN', true, false, 'plc', 30, 1),
      change(3, 'CNT', 3, 4, 'plc', 30, 1),
    ]);
    expect([
      tags.get(H.btn as TagHandle),
      tags.get(H.sensor as TagHandle),
      tags.get(H.lamp as TagHandle),
      tags.get(H.cnt as TagHandle),
    ]).toEqual([false, false, false, 4]);
  });

  it('bước 5a/5b: snapshot/restore + chạy lại cho hash giống hệt', () => {
    const { tags, clock, changes, step } = driver();
    // Chạy tới T=40 như bước 1–4.
    step(() => {
      tags.set(H.sensor as TagHandle, true, 'plant');
    });
    step();
    step(() => {
      tags.set(H.sensor as TagHandle, false, 'plant');
      tags.set(H.sensor as TagHandle, true, 'plant');
    });
    step(() => {
      tags.set(H.sensor as TagHandle, false, 'plant');
    });
    expect(clock.nowMs()).toBe(40);

    // 5a: snapshot tại T=40, values [F,F,F,4]; hasher bắt đầu từ điểm snapshot.
    const snap = tags.snapshot();
    const clockSnap = clock.snapshot();
    const hasher = new TraceHasher(tags);
    step();
    step();
    expect(clock.nowMs()).toBe(60);
    expect(tags.get(H.cnt as TagHandle)).toBe(6);
    const hashA = hasher.hash();

    // 5b: restore về T=40; flush phát h3 6→4 (ts=30 đã lưu, source plc, writes=0).
    const n5 = changes.length;
    clock.restore(clockSnap);
    tags.restore(snap);
    expect(clock.nowMs()).toBe(40);
    expect(tags.get(H.cnt as TagHandle)).toBe(4);
    tags.flush();
    expect(changes.slice(n5)).toEqual([change(3, 'CNT', 6, 4, 'plc', 30, 0)]);

    // Reset hasher rồi chạy lại 2 bước → hash giống hệt lần 5a.
    hasher.reset();
    step();
    step();
    expect(clock.nowMs()).toBe(60);
    expect(tags.get(H.cnt as TagHandle)).toBe(6);
    expect(hasher.hash()).toBe(hashA);
  });
});
