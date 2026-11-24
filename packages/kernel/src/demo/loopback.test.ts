// Test LoopbackController (M0 §6.10, §12.1: ≥ 8).
import { describe, expect, it } from 'vitest';
import { ManualClock, TagDB, TagDbIoBus } from '../index.js';
import type { TagHandle } from '../index.js';
import type { ControllerDef, TagDef } from '@vcs/schemas';
import { LoopbackController } from './loopback.js';

function defs(): TagDef[] {
  return [
    { name: 'IN_A', type: 'Bool', area: 'I', address: '%I0.0', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'IN_B', type: 'Bool', area: 'I', address: '%I0.1', controller: 'PLC1', signal: { kind: 'DI' } },
    { name: 'OUT_A', type: 'Bool', area: 'Q', address: '%Q0.0', controller: 'PLC1', signal: { kind: 'DO' } },
    { name: 'LAMP', type: 'Bool', area: 'Q', address: '%Q0.1', controller: 'PLC1', signal: { kind: 'DO' } },
    { name: 'CNT', type: 'Int', area: 'Q', address: '%QW0', controller: 'PLC1', signal: { kind: 'AO' } },
  ];
}

async function makeLoopback(
  config: Record<string, unknown>,
  scanPeriodMs = 10,
): Promise<{ ctrl: LoopbackController; tags: TagDB }> {
  const clock = new ManualClock();
  const tags = new TagDB(defs(), clock);
  const io = new TagDbIoBus(tags);
  const def: ControllerDef = {
    id: 'PLC1',
    mode: 'builtin',
    vendor: 'demo',
    model: 'loopback',
    config,
  };
  const ctrl = new LoopbackController('PLC1');
  await ctrl.init({ id: 'PLC1', def, stepMs: 10, scanPeriodMs, tags: defs() }, io);
  return { ctrl, tags };
}

describe('LoopbackController — loopback/blink/counter', () => {
  it('out = in mỗi scan; invert đảo giá trị', async () => {
    const { ctrl, tags } = await makeLoopback({
      loopback: [
        { in: 'IN_A', out: 'OUT_A' },
        { in: 'IN_B', out: 'LAMP', invert: true },
      ],
    });
    tags.write('IN_A', true, 'test');
    ctrl.step(0, 10);
    expect(tags.get(2 as TagHandle)).toBe(true);
    expect(tags.get(3 as TagHandle)).toBe(true); // IN_B false → đảo → true
    tags.write('IN_B', true, 'test');
    ctrl.step(10, 10);
    expect(tags.get(3 as TagHandle)).toBe(false);
    expect(ctrl.getDiagnostics().scanCount).toBe(2);
    expect(ctrl.getDiagnostics().lastScanSimMs).toBe(10);
    expect(ctrl.getDiagnostics().state).toBe('RUN');
  });

  it('blink đảo mỗi periodMs theo sim time', async () => {
    const { ctrl, tags } = await makeLoopback({ blink: [{ out: 'LAMP', periodMs: 500 }] });
    for (let t = 0; t < 500; t += 10) ctrl.step(t, 10);
    expect(tags.get(3 as TagHandle)).toBe(false);
    ctrl.step(500, 10);
    expect(tags.get(3 as TagHandle)).toBe(true);
    ctrl.step(990, 10);
    expect(tags.get(3 as TagHandle)).toBe(true);
    ctrl.step(1000, 10);
    expect(tags.get(3 as TagHandle)).toBe(false);
  });

  it('counter tăng mỗi scan; wrap Int 32767 → -32768', async () => {
    const clock = new ManualClock();
    const list = defs();
    (list[4] as TagDef).initial = 32767;
    const tags = new TagDB(list, clock);
    const io = new TagDbIoBus(tags);
    const def: ControllerDef = {
      id: 'PLC1',
      mode: 'builtin',
      vendor: 'demo',
      model: 'loopback',
      config: { counter: [{ out: 'CNT', step: 1 }] },
    };
    const ctrl = new LoopbackController('PLC1');
    await ctrl.init({ id: 'PLC1', def, stepMs: 10, scanPeriodMs: 10, tags: list }, io);
    ctrl.step(0, 10);
    expect(tags.get(4 as TagHandle)).toBe(-32768);
    ctrl.step(10, 10);
    expect(tags.get(4 as TagHandle)).toBe(-32767);
  });

  it('counter step tùy chỉnh, khởi tạo từ TagDef.initial', async () => {
    const clock = new ManualClock();
    const list = defs();
    const cnt = list[4] as TagDef;
    cnt.initial = 100;
    const tags = new TagDB(list, clock);
    const io = new TagDbIoBus(tags);
    const def: ControllerDef = {
      id: 'PLC1',
      mode: 'builtin',
      vendor: 'demo',
      model: 'loopback',
      config: { counter: [{ out: 'CNT', step: 5 }] },
    };
    const ctrl = new LoopbackController('PLC1');
    await ctrl.init({ id: 'PLC1', def, stepMs: 10, scanPeriodMs: 10, tags: list }, io);
    ctrl.step(0, 10);
    expect(tags.get(4 as TagHandle)).toBe(105);
  });

  it('scanPeriodMs > stepMs: scan cách bước; scanPeriodMs < stepMs: nhiều scan/bước', async () => {
    const { ctrl, tags } = await makeLoopback({ counter: [{ out: 'CNT', step: 1 }] }, 20);
    ctrl.step(0, 10);
    expect(ctrl.getDiagnostics().scanCount).toBe(0);
    ctrl.step(10, 10);
    expect(ctrl.getDiagnostics().scanCount).toBe(1);
    expect(tags.get(4 as TagHandle)).toBe(1);
    const fast = await makeLoopback({ counter: [{ out: 'CNT', step: 1 }] }, 5);
    fast.ctrl.step(0, 10);
    expect(fast.ctrl.getDiagnostics().scanCount).toBe(2);
    expect(fast.tags.get(4 as TagHandle)).toBe(2);
  });

  it('step trước init → ném lỗi', () => {
    const ctrl = new LoopbackController('PLC1');
    expect(() => { ctrl.step(0, 10); }).toThrow(/chưa init/);
  });

  it('getDiagnostics: state RUN, faults rỗng sau init', async () => {
    const { ctrl } = await makeLoopback({});
    expect(ctrl.getDiagnostics()).toEqual({
      state: 'RUN',
      scanCount: 0,
      lastScanSimMs: 0,
      faults: [],
    });
  });

  it('config sai → init ném nêu tên khóa/tag', async () => {
    await expect(makeLoopback({ loopback: [{ in: 'KHONG_CO', out: 'OUT_A' }] })).rejects.toThrow(
      /KHONG_CO/,
    );
    await expect(makeLoopback({ loopback: [{ in: 'IN_A', out: 'CNT' }] })).rejects.toThrow(
      /CNT/,
    );
    await expect(makeLoopback({ blink: [{ out: 'LAMP', periodMs: 0 }] })).rejects.toThrow(
      /periodMs/,
    );
    await expect(makeLoopback({ blink: 'khong-phai-mang' })).rejects.toThrow(/blink/);
    await expect(makeLoopback({ counter: [{ out: 'CNT', step: 1.5 }] })).rejects.toThrow(/step/);
    await expect(makeLoopback({}, 0)).rejects.toThrow(/scanPeriodMs/);
  });

  it('khóa lạ trong config được bỏ qua', async () => {
    const { ctrl, tags } = await makeLoopback({
      loopback: [{ in: 'IN_A', out: 'OUT_A' }],
      thuocTinhLa: { x: 1 },
    });
    tags.write('IN_A', true, 'test');
    ctrl.step(0, 10);
    expect(tags.get(2 as TagHandle)).toBe(true);
  });

  it('snapshot/restore: chạy tiếp cho cùng kết quả; reset về đầu', async () => {
    const { ctrl, tags } = await makeLoopback({
      loopback: [{ in: 'IN_A', out: 'OUT_A' }],
      blink: [{ out: 'LAMP', periodMs: 500 }],
      counter: [{ out: 'CNT', step: 1 }],
    });
    tags.write('IN_A', true, 'test');
    for (let t = 0; t < 300; t += 10) ctrl.step(t, 10);
    expect(tags.get(4 as TagHandle)).toBe(30);
    const snap = ctrl.snapshot();
    for (let t = 300; t < 600; t += 10) ctrl.step(t, 10);
    expect(tags.get(4 as TagHandle)).toBe(60);
    expect(tags.get(3 as TagHandle)).toBe(true); // blink đảo ở T=500
    ctrl.restore(snap);
    expect(ctrl.getDiagnostics().scanCount).toBe(30);
    // TagDB không tự restore — khôi phục tag về snapshot bằng tay rồi chạy lại.
    tags.write('CNT', 30, 'system');
    tags.write('LAMP', false, 'system');
    for (let t = 300; t < 600; t += 10) ctrl.step(t, 10);
    expect(tags.get(4 as TagHandle)).toBe(60);
    expect(tags.get(3 as TagHandle)).toBe(true);
    ctrl.reset();
    expect(ctrl.getDiagnostics().scanCount).toBe(0);
    expect(ctrl.getDiagnostics().lastScanSimMs).toBe(0);
    ctrl.step(0, 10);
    expect(tags.get(4 as TagHandle)).toBe(1);
  });

  it('restore snapshot sai dạng → SIM-E003', async () => {
    const { ctrl } = await makeLoopback({ counter: [{ out: 'CNT', step: 1 }] });
    expect(() => { ctrl.restore({}); }).toThrow(/SIM-E003/);
    expect(() => { ctrl.restore({ scanCount: 1 }); }).toThrow(/SIM-E003/);
    expect(() => { ctrl.restore('chuoi'); }).toThrow(/SIM-E003/);
  });

  it('kind là builtin; id từ constructor', () => {
    const ctrl = new LoopbackController('PLC9');
    expect(ctrl.id).toBe('PLC9');
    expect(ctrl.kind).toBe('builtin');
  });
});
