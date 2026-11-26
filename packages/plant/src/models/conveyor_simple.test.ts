// Unit test conveyor_simple (M2 §7.8, P2.3 — OQ-292/293/294, STATE §26).
// Bảng G + 8 golden kiểm qua golden YAML; ở đây kiểm định nghĩa,
// paramsSchema mở rộng, loadTph vs loadSource, delay 0, snapshot/restore
// (buf/idx), beltBlocked đóng băng buf, ngưỡng zeroSpeed.

import type { TagHandle } from '@vcs/kernel';
import { describe, expect, it } from 'vitest';

import {
  makeConveyorSimpleSetup,
  makeModelSetup,
  modelEquipmentId,
  type ModelSetup,
} from '../test-helpers.js';
import { conveyorSimpleModel } from './conveyor_simple.js';
import { motorDolParamsSchema } from './motor_dol.js';

/** Chạy setup tới T, cmd runCmd áp sau step(100) như golden (OQ-254). */
function runWithCmd(s: ModelSetup, upto: number, cmdOffAt?: number): void {
  const cmdH = s.handles['runCmd'] as TagHandle;
  for (let t = 0; t <= upto; t += 10) {
    s.engine.step(t, 10);
    s.tags.flush();
    if (t === 100) s.tags.set(cmdH, true, 'plc');
    if (cmdOffAt !== undefined && t === cmdOffAt) s.tags.set(cmdH, false, 'plc');
  }
}

function obs(s: ModelSetup, key: string): number | boolean | string | undefined {
  return s.engine.getObservable('CR01_CV01', key);
}

describe('conveyor_simple — định nghĩa (M2 §7.8)', () => {
  it('derive từ motor_dol: 8 role, 19 param, 8 fault, 7 observable, hasSource', () => {
    expect(conveyorSimpleModel.type).toBe('conveyor_simple');
    expect(conveyorSimpleModel.version).toBe('1.0.0');
    expect(conveyorSimpleModel.roles).toHaveLength(8);
    expect(conveyorSimpleModel.roles.map((r) => r.role)).toEqual([
      'runCmd',
      'runFb',
      'ready',
      'remote',
      'overloadOk',
      'currentFb',
      'zeroSpeed',
      'pullCord',
    ]);
    expect(conveyorSimpleModel.roles[6]?.optional).toBe(true);
    expect(conveyorSimpleModel.roles[7]?.optional).toBe(true);
    expect(conveyorSimpleModel.faults).toHaveLength(8);
    expect(conveyorSimpleModel.faults.map((f) => f.id)).toEqual([
      'overload',
      'failToStart',
      'contactorStuck',
      'notReady',
      'localMode',
      'beltSlip',
      'pullCordTrip',
      'beltBlocked',
    ]);
    expect(conveyorSimpleModel.observables).toHaveLength(7);
    expect(conveyorSimpleModel.observables.map((o) => o.key)).toContain('beltSpeedPct');
    expect(conveyorSimpleModel.observables.map((o) => o.key)).toContain('deliveredTph');
    expect(conveyorSimpleModel.hasSource).toBe(true);
    expect(Object.keys(conveyorSimpleModel.defaultParams)).toHaveLength(19);
    expect(conveyorSimpleModel.defaultParams.zeroSpeedThresholdPct).toBe(5);
    expect(conveyorSimpleModel.defaultParams.transportDelayMs).toBe(20000);
    expect(conveyorSimpleModel.defaultParams.loadTph).toBe(0);
    expect(conveyorSimpleModel.defaultParams.pullCordHardwired).toBe(true);
    // Preset của motor_dol được kế thừa (deriveModel spread).
    expect(Object.keys(conveyorSimpleModel.presets ?? {})).toEqual([
      'noRunFeedback',
      'feedbackStuckOn',
      'overloadTrip',
      'commandLost',
    ]);
  });

  it('paramsSchema mở rộng: 19 param hợp lệ; giá trị sai bị từ chối; schema motor strip 4 param thêm', () => {
    const defaults = conveyorSimpleModel.defaultParams;
    expect(conveyorSimpleModel.paramsSchema.safeParse(defaults).success).toBe(true);
    expect(conveyorSimpleModel.paramsSchema.safeParse({ ...defaults, transportDelayMs: -1 }).success).toBe(false);
    expect(conveyorSimpleModel.paramsSchema.safeParse({ ...defaults, zeroSpeedThresholdPct: 101 }).success).toBe(false);
    expect(conveyorSimpleModel.paramsSchema.safeParse({ ...defaults, loadTph: -1 }).success).toBe(false);
    expect(
      conveyorSimpleModel.paramsSchema.safeParse({ ...defaults, pullCordHardwired: 'yes' }).success,
    ).toBe(false);
    // Schema motor_dol (không patch) strip 4 param thêm — đó là lý do
    // deriveModel phải hỗ trợ paramsSchema patch (OQ-292).
    const motorParsed = motorDolParamsSchema.safeParse(defaults);
    expect(motorParsed.success).toBe(true);
    if (motorParsed.success) {
      expect(Object.keys(motorParsed.data)).toHaveLength(15);
      expect('transportDelayMs' in motorParsed.data).toBe(false);
    }
    // Unknown key bị strip (quy ước không .strict() — P2.1).
    const withUnknown = conveyorSimpleModel.paramsSchema.safeParse({ ...defaults, foo: 1 });
    expect(withUnknown.success).toBe(true);
    if (withUnknown.success) expect('foo' in withUnknown.data).toBe(false);
  });

  it('init: STOPPED + ring buffer rỗng, idx 0', () => {
    const s = makeConveyorSimpleSetup({});
    expect(s.engine.getState('CR01_CV01')).toMatchObject({ state: 'STOPPED', speedPct: 0, idx: 0 });
    const state = s.engine.getState('CR01_CV01') as { buf: number[] };
    expect(state.buf).toEqual([]);
  });

  it('docs: 5 state của motor_dol + transitions conveyor', () => {
    expect(conveyorSimpleModel.docs?.states).toHaveLength(5);
    const transitions = (conveyorSimpleModel.docs?.transitions ?? []).join(' ');
    expect(transitions).toContain('pullCordTrip');
    expect(transitions).toContain('beltBlocked');
    expect(transitions).toContain('load');
    expect((conveyorSimpleModel.docs?.notes ?? []).join(' ')).toContain('deriveModel');
  });

  it('dispatcher + equipment id (harness golden)', () => {
    expect(modelEquipmentId('conveyor_simple')).toBe('CR01_CV01');
    const s = makeModelSetup('conveyor_simple', {});
    expect(s.engine.getState('CR01_CV01')).toMatchObject({ state: 'STOPPED' });
  });
});

describe('conveyor_simple — hành vi', () => {
  it('preset overloadTrip kế thừa: TRIPPED sau khi áp preset', () => {
    const s = makeConveyorSimpleSetup({});
    const cmdH = s.handles['runCmd'] as TagHandle;
    for (let t = 0; t <= 1010; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
      if (t === 100) s.tags.set(cmdH, true, 'plc');
      if (t === 1000) s.engine.applyPreset('CR01_CV01', 'overloadTrip');
    }
    expect(s.engine.getState('CR01_CV01')).toMatchObject({ state: 'TRIPPED' });
  });

  it('transportDelayMs=0 → deliveredTph = input ngay trong bước', () => {
    const s = makeConveyorSimpleSetup({ params: { transportDelayMs: 0, loadTph: 100 } });
    runWithCmd(s, 110);
    expect(obs(s, 'deliveredTph')).toBeCloseTo(0.6667, 4);
    const state = s.engine.getState('CR01_CV01') as { buf: number[]; idx: number };
    expect(state.buf).toEqual([]);
    expect(state.idx).toBe(0);
  });

  it('không cấu hình load source → dùng param loadTph (OQ-294)', () => {
    const s = makeConveyorSimpleSetup({ params: { loadTph: 50 } });
    runWithCmd(s, 20110);
    // input T=110 = 50 × 0.6667/100 = 0.3333.
    expect(obs(s, 'deliveredTph')).toBeCloseTo(0.3333, 4);
  });

  it('named source load đã cấu hình → thắng loadTph (OQ-294)', () => {
    const s = makeConveyorSimpleSetup({
      params: { loadTph: 50 },
      sources: { load: { kind: 'const', value: 25 } },
    });
    runWithCmd(s, 20110);
    // input T=110 = 25 × 0.6667/100 = 0.1667.
    expect(obs(s, 'deliveredTph')).toBeCloseTo(0.1667, 4);
  });

  it('setSource load giữa chừng: input mới dùng source, input cũ vẫn theo loadTph', () => {
    const s = makeConveyorSimpleSetup({ params: { loadTph: 50 } });
    const cmdH = s.handles['runCmd'] as TagHandle;
    for (let t = 0; t <= 40120; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
      if (t === 100) s.tags.set(cmdH, true, 'plc');
      if (t === 20110) s.engine.setSource('CR01_CV01', { kind: 'const', value: 25 }, 'load');
      if (t === 40110) expect(obs(s, 'deliveredTph')).toBeCloseTo(50, 4);
    }
    // out(40120) = in(20120) = 25 × 100/100.
    expect(obs(s, 'deliveredTph')).toBeCloseTo(25, 4);
  });

  it('snapshot/restore tua được ring buffer (buf/idx)', () => {
    const s = makeConveyorSimpleSetup({ params: { loadTph: 100 } });
    runWithCmd(s, 20110);
    expect(obs(s, 'deliveredTph')).toBeCloseTo(0.6667, 4);
    const snap = s.engine.snapshot();
    runWithCmdContinue(s, 20120, 21610);
    expect(obs(s, 'deliveredTph')).toBeCloseTo(100, 4);
    s.engine.restore(snap);
    expect(obs(s, 'deliveredTph')).toBeCloseTo(0.6667, 4);
    // Bước tiếp sau restore đọc đúng slot đã tua: out = in(120) = 1.3333.
    s.engine.step(20120, 10);
    s.tags.flush();
    expect(obs(s, 'deliveredTph')).toBeCloseTo(1.3333, 4);
  });

  it('beltBlocked đóng băng buf/idx, deliveredTph=0 (OQ-293)', () => {
    const s = makeConveyorSimpleSetup({ params: { loadTph: 100 } });
    const cmdH = s.handles['runCmd'] as TagHandle;
    let bufCopy: number[] = [];
    let idxCopy = 0;
    for (let t = 0; t <= 20110; t += 10) {
      s.engine.step(t, 10);
      s.tags.flush();
      if (t === 100) s.tags.set(cmdH, true, 'plc');
      if (t === 6000) {
        // Copy TRƯỚC khi inject — đóng băng tính từ lúc fault bật.
        const at6000 = s.engine.getState('CR01_CV01') as { buf: number[]; idx: number };
        bufCopy = [...at6000.buf];
        idxCopy = at6000.idx;
        s.engine.injectFault({ target: { equipment: 'CR01_CV01', fault: 'beltBlocked' }, when: { at: 'now' } });
      }
    }
    // Không bị chặn thì deliveredTph tại 20110 = 0.6667 (in T=110).
    expect(obs(s, 'deliveredTph')).toBe(0);
    const after = s.engine.getState('CR01_CV01') as { buf: number[]; idx: number };
    expect(after.buf).toEqual(bufCopy);
    expect(after.idx).toBe(idxCopy);
  });

  it('zeroSpeedThresholdPct=0 → zeroSpeed không bao giờ true (so sánh < nghiêm ngặt)', () => {
    const s = makeConveyorSimpleSetup({ params: { zeroSpeedThresholdPct: 0 } });
    runWithCmd(s, 9010, 6000);
    expect(obs(s, 'beltSpeedPct')).toBe(0);
    expect(s.tags.get(s.handles['zeroSpeed'] as TagHandle)).toBe(false);
  });
});

/** Chạy tiếp setup từ fromMs tới toMs (không reset cmd). */
function runWithCmdContinue(s: ModelSetup, fromMs: number, toMs: number): void {
  for (let t = fromMs; t <= toMs; t += 10) {
    s.engine.step(t, 10);
    s.tags.flush();
  }
}
