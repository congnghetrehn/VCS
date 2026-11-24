// Test SimulationOrchestrator (M0 §6.7, §12.1: ≥ 30; §12.2 property).
// Golden T1–T6 theo STATE.md §11 (tính tay trước khi code, không sao chép số
// từ implementation). Tag: h0 BTN_START, h1 SW_AUTO, h2 PT01, h3 LAMP_RUN,
// h4 LAMP_AUTO, h5 LAMP_HEARTBEAT, h6 SCAN_CNT; stepMs = plcScanMs = 10.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ManualClock,
  SimComponentError,
  SimulationOrchestrator,
  TagDB,
  TagDbIoBus,
  TraceHasher,
} from './index.js';
import type { SimComponent, StepResult, TagChange, TagHandle } from './index.js';
import type { Scaling, TagDef, TagValue } from '@vcs/schemas';
import { LoopbackController } from './demo/loopback.js';
import type { ControllerDef } from '@vcs/schemas';

function mkDef(
  name: string,
  type: 'Bool' | 'Int',
  area: 'I' | 'Q',
  opts: { kind: 'DI' | 'DO' | 'AI' | 'AO'; address: string; scaling?: Scaling },
): TagDef {
  const signal: { kind: 'DI' | 'DO' | 'AI' | 'AO'; scaling?: Scaling } = { kind: opts.kind };
  if (opts.scaling !== undefined) signal.scaling = opts.scaling;
  return {
    name,
    type,
    area,
    address: opts.address,
    controller: 'PLC1',
    signal,
  };
}

/** Tập tag golden §11: 7 tag I/Q, thứ tự handle h0..h6. */
function helloDefs(): TagDef[] {
  return [
    mkDef('BTN_START', 'Bool', 'I', { kind: 'DI', address: '%I0.0' }),
    mkDef('SW_AUTO', 'Bool', 'I', { kind: 'DI', address: '%I0.1' }),
    mkDef('PT01', 'Int', 'I', {
      kind: 'AI',
      address: '%IW64',
      scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 10, unit: 'bar' },
    }),
    mkDef('LAMP_RUN', 'Bool', 'Q', { kind: 'DO', address: '%Q0.0' }),
    mkDef('LAMP_AUTO', 'Bool', 'Q', { kind: 'DO', address: '%Q0.1' }),
    mkDef('LAMP_HEARTBEAT', 'Bool', 'Q', { kind: 'DO', address: '%Q0.2' }),
    mkDef('SCAN_CNT', 'Int', 'Q', { kind: 'AO', address: '%QW64' }),
  ];
}

const PLC1_DEF: ControllerDef = {
  id: 'PLC1',
  mode: 'builtin',
  vendor: 'demo',
  model: 'loopback',
  config: {
    loopback: [
      { in: 'BTN_START', out: 'LAMP_RUN' },
      { in: 'SW_AUTO', out: 'LAMP_AUTO', invert: true },
    ],
    blink: [{ out: 'LAMP_HEARTBEAT', periodMs: 500 }],
    counter: [{ out: 'SCAN_CNT', step: 1 }],
  },
};

/** Component script được cho test: đếm lời gọi, hành vi tùy biến, reset về 0. */
class ScriptedComponent implements SimComponent {
  readonly id: string;
  stepCalls = 0;
  resetCalls = 0;
  lastT = -1;
  behavior: ((T: number, dt: number, self: ScriptedComponent) => StepResult) | undefined =
    undefined;

  constructor(
    id: string,
    behavior?: (T: number, dt: number, self: ScriptedComponent) => StepResult,
  ) {
    this.id = id;
    this.behavior = behavior;
  }

  step(simTimeMs: number, dtMs: number): StepResult {
    this.stepCalls += 1;
    this.lastT = simTimeMs;
    return this.behavior?.(simTimeMs, dtMs, this);
  }

  reset(): void {
    this.stepCalls = 0;
    this.lastT = -1;
    this.resetCalls += 1;
  }

  snapshot(): unknown {
    return { stepCalls: this.stepCalls, lastT: this.lastT };
  }

  restore(s: unknown): void {
    const snap = s as { stepCalls?: unknown; lastT?: unknown } | null | undefined;
    if (typeof snap?.stepCalls !== 'number' || typeof snap.lastT !== 'number') {
      throw new Error('SIM-E003: ScriptedComponent.restore: snapshot không tương thích');
    }
    this.stepCalls = snap.stepCalls;
    this.lastT = snap.lastT;
  }
}

interface GoldenSim {
  sim: SimulationOrchestrator;
  tags: TagDB;
  clock: ManualClock;
  plant: ScriptedComponent;
  plc: LoopbackController;
  gw: ScriptedComponent;
  events: string[];
  changes: TagChange[];
}

/**
 * Sim golden §11: plant (pha plant) + PLC1 loopback (pha controllers) +
 * gw (pha gateways, đọc LAMP_RUN). Plant mặc định: T=0 `SW_AUTO := true`
 * (đã `setOwner('plant')`), sau đó nghỉ. Hook ghi log, subscriber ghi flush.
 */
function makeGoldenSim(errorPolicy?: 'throw' | 'isolate'): GoldenSim {
  const clock = new ManualClock();
  const tags = new TagDB(helloDefs(), clock);
  tags.setOwner(1 as TagHandle, 'plant');
  const io = new TagDbIoBus(tags);
  const sim = new SimulationOrchestrator(tags, clock, io, {
    stepMs: 10,
    seed: 1,
    errorPolicy,
  });
  const events: string[] = [];
  const changes: TagChange[] = [];
  const plant = new ScriptedComponent('plant', (T) => {
    events.push('plant');
    if (T === 0) tags.write('SW_AUTO', true, 'plant');
  });
  const plc = new LoopbackController('PLC1');
  const gw = new ScriptedComponent('gw', () => {
    events.push('gw');
    const lamp = tags.get(3 as TagHandle);
    events.push(`gw:RUN=${lamp === true ? 'true' : 'false'}`);
  });
  void plc.init({ id: 'PLC1', def: PLC1_DEF, stepMs: 10, scanPeriodMs: 10, tags: helloDefs() }, io);
  sim.register('plant', plant);
  sim.register('controllers', plc);
  sim.register('gateways', gw);
  sim.setHooks({
    beforeExternals: (T) => {
      events.push(`before:${String(T)}`);
    },
    afterStep: (T) => {
      events.push(`after:${String(T)},SCAN_CNT=${String(tags.get(6 as TagHandle))}`);
    },
  });
  tags.subscribe('*', (batch) => {
    changes.push(...batch);
  });
  return { sim, tags, clock, plant, plc, gw, events, changes };
}

describe('Orchestrator — T1 thứ tự một bước', () => {
  it('before → cmd → plant → plc → gw → flush[h0,h1,h3,h6] → after → clock 10', () => {
    const { sim, tags, clock, events, changes } = makeGoldenSim();
    sim.post({
      label: 'C0',
      run: ({ tags: t }) => {
        events.push('cmd');
        t.write('BTN_START', true, 'test');
      },
    });
    sim.stepOnce();
    expect(events).toEqual(['before:0', 'cmd', 'plant', 'gw', 'gw:RUN=true', 'after:0,SCAN_CNT=1']);
    expect(changes.map((c) => c.handle)).toEqual([0, 1, 3, 6]);
    expect(changes.map((c) => [c.oldValue, c.newValue])).toEqual([
      [false, true],
      [false, true],
      [false, true],
      [0, 1],
    ]);
    expect(tags.get(3 as TagHandle)).toBe(true);
    expect(tags.get(4 as TagHandle)).toBe(false);
    expect(clock.nowMs()).toBe(10);
    expect(sim.stepCount).toBe(1);
    expect(sim.simTimeMs).toBe(10);
  });
});

describe('Orchestrator — T2 độ trễ plant→PLC 1 bước', () => {
  it('PLC thấy giá trị plant cùng bước; plant thấy output PLC ở T+dt', () => {
    const { sim, tags } = makeGoldenSim();
    const plantSees: TagValue[] = [];
    // Ghi đè hành vi plant: đọc LAMP_RUN mỗi bước.
    const plantComp = sim.getComponent('plant') as ScriptedComponent;
    plantComp.behavior = (T) => {
      if (T === 0) tags.write('SW_AUTO', true, 'plant');
      else plantSees.push(tags.get(3 as TagHandle));
    };
    sim.stepOnce(); // T=0: PLC đọc SW_AUTO=true cùng bước → LAMP_AUTO=false; SCAN_CNT 1
    expect(tags.get(4 as TagHandle)).toBe(false);
    expect(tags.get(6 as TagHandle)).toBe(1);
    sim.post({
      label: 'C1',
      run: ({ tags: t }) => {
        t.write('BTN_START', true, 'test');
      },
    });
    sim.stepOnce(); // T=10: plant đọc LAMP_RUN=false (PLC chưa chạy bước này)
    expect(plantSees).toEqual([false]);
    expect(tags.get(3 as TagHandle)).toBe(true);
    expect(tags.get(6 as TagHandle)).toBe(2);
    sim.stepOnce(); // T=20: plant đọc LAMP_RUN=true
    expect(plantSees).toEqual([false, true]);
    expect(tags.get(6 as TagHandle)).toBe(3);
  });
});

describe('Orchestrator — T3 post()/inbox', () => {
  it('snapshotAll khi inbox không rỗng → SIM-E003; post trong hook cùng bước, trong plant bước kế', () => {
    const { sim, tags, clock } = makeGoldenSim();
    const plant = sim.getComponent('plant') as ScriptedComponent;
    sim.runSteps(2); // clock 20, sc 2, SCAN_CNT 2
    expect(clock.nowMs()).toBe(20);
    expect(sim.stepCount).toBe(2);
    expect(tags.get(6 as TagHandle)).toBe(2);
    sim.post({
      label: 'A',
      run: ({ tags: t }) => {
        t.write('BTN_START', true, 'test');
      },
    });
    sim.post({
      label: 'B',
      run: ({ tags: t }) => {
        t.write('BTN_START', false, 'test');
      },
    });
    expect(() => {
      sim.snapshotAll();
    }).toThrow(/SIM-E003/);
    expect(clock.nowMs()).toBe(20);
    let cPosted = false;
    sim.setHooks({
      beforeExternals: () => {
        // Hook tồn tại qua các bước: chỉ post C một lần, nếu không C sẽ đè D ở bước kế.
        if (cPosted) return;
        cPosted = true;
        sim.post({
          label: 'C',
          run: ({ tags: t }) => {
            t.write('PT01', 100, 'test');
          },
        });
      },
    });
    plant.behavior = (T) => {
      if (T === 20) {
        sim.post({
          label: 'D',
          run: ({ tags: t }) => {
            t.write('PT01', 200, 'test');
          },
        });
      }
    };
    sim.stepOnce(); // T=20: drain A, B, C; D chờ bước kế
    expect(tags.get(2 as TagHandle)).toBe(100);
    expect(tags.get(6 as TagHandle)).toBe(3);
    expect(clock.nowMs()).toBe(30);
    expect(sim.stepCount).toBe(3);
    sim.stepOnce(); // T=30: drain D
    expect(tags.get(2 as TagHandle)).toBe(200);
    expect(tags.get(6 as TagHandle)).toBe(4);
    expect(clock.nowMs()).toBe(40);
  });

  it('A rồi B về bằng giá trị đã flush → không phát change h0', () => {
    const { sim, changes } = makeGoldenSim();
    sim.post({
      label: 'A',
      run: ({ tags: t }) => {
        t.write('BTN_START', true, 'test');
      },
    });
    sim.post({
      label: 'B',
      run: ({ tags: t }) => {
        t.write('BTN_START', false, 'test');
      },
    });
    sim.stepOnce();
    expect(changes.map((c) => c.handle)).toEqual([1, 6]);
  });
});

describe('Orchestrator — T4 snapshot/restore + hash tất định', () => {
  it('restore về đúng trạng thái; chạy lại cho hash giống hệt; flush phát h6 15→10', () => {
    const { sim, tags } = makeGoldenSim();
    const hasher = new TraceHasher(tags);
    let restored = false;
    sim.on('restored', () => {
      restored = true;
    });
    sim.runSteps(10);
    expect(sim.simTimeMs).toBe(100);
    expect(sim.stepCount).toBe(10);
    expect(tags.get(6 as TagHandle)).toBe(10);
    expect(tags.get(4 as TagHandle)).toBe(false);
    expect(tags.get(5 as TagHandle)).toBe(false);
    const snap = sim.snapshotAll();
    expect(snap.simTimeMs).toBe(100);
    expect(snap.stepCount).toBe(10);
    expect(snap.tags.values).toEqual([false, true, 0, false, false, false, 10]);
    const loopSnap = snap.components['PLC1'] as {
      scanCount: number;
      lastScanSimMs: number;
      blinkNext: number[];
    };
    expect(loopSnap.scanCount).toBe(10);
    expect(loopSnap.lastScanSimMs).toBe(90);
    expect(loopSnap.blinkNext).toEqual([500]);
    expect(snap.faulted).toEqual([]);
    hasher.reset();
    sim.runSteps(5);
    const hashM = hasher.hash();
    expect(tags.get(6 as TagHandle)).toBe(15);
    const changes: TagChange[] = [];
    tags.subscribe('*', (batch) => changes.push(...batch));
    sim.restoreAll(snap);
    expect(restored).toBe(true);
    expect(sim.simTimeMs).toBe(100);
    expect(sim.stepCount).toBe(10);
    expect(tags.get(6 as TagHandle)).toBe(10);
    const h6 = changes.find((c) => c.handle === 6);
    expect(h6).toBeDefined();
    expect(h6?.oldValue).toBe(15);
    expect(h6?.newValue).toBe(10);
    expect(h6?.ts).toBe(90);
    expect(h6?.writes).toBe(0);
    hasher.reset();
    sim.runSteps(5);
    expect(hasher.hash()).toBe(hashM);
    expect(tags.get(6 as TagHandle)).toBe(15);
  });
});

describe('Orchestrator — T5 isolate vs throw', () => {
  function makeBoomSim(policy: 'throw' | 'isolate'): {
    sim: SimulationOrchestrator;
    boom: ScriptedComponent;
    faults: { id: string; phase: string; T: number; error: string }[];
    diags: string[];
    changes: TagChange[];
    events: string[];
    tags: TagDB;
    clock: ManualClock;
  } {
    const g = makeGoldenSim(policy);
    const faults: { id: string; phase: string; T: number; error: string }[] = [];
    const diags: string[] = [];
    g.sim.on('componentFault', (p) => faults.push({ ...p }));
    g.sim.on('diagnostic', (d) => diags.push(d.code));
    const boom = new ScriptedComponent('boom', (_T, _dt, self) => {
      if (self.stepCalls >= 3) throw new Error('boom');
    });
    g.sim.register('controllers', boom);
    return { ...g, boom, faults, diags };
  }

  it('throw: SimComponentError lan ra; flush không chạy; clock/sc đứng ở T=20', () => {
    const g = makeBoomSim('throw');
    g.sim.runSteps(2);
    expect(g.tags.get(6 as TagHandle)).toBe(2);
    let caught: unknown;
    try {
      g.sim.stepOnce();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SimComponentError);
    const e = caught as SimComponentError;
    expect(e.id).toBe('boom');
    expect(e.phase).toBe('controllers');
    expect(e.simTimeMs).toBe(20);
    expect(e.cause).toBeInstanceOf(Error);
    expect((e.cause as Error).message).toBe('boom');
    // PLC1 đã ghi SCAN_CNT 2→3 nhưng flush chưa chạy → chưa phát change.
    expect(g.changes.filter((c) => c.handle === 6).map((c) => c.newValue)).toEqual([1, 2]);
    expect(g.clock.nowMs()).toBe(20);
    expect(g.sim.stepCount).toBe(2);
    expect(() => {
      g.sim.stepOnce();
    }).toThrow(SimComponentError);
    expect(g.clock.nowMs()).toBe(20);
  });

  it('isolate: faulted + SIM-E001, gw vẫn chạy, bước hoàn tất; bước sau bỏ qua boom', () => {
    const g = makeBoomSim('isolate');
    g.sim.runSteps(2);
    g.sim.stepOnce(); // T=20: boom ném lần 3
    expect(g.faults).toEqual([{ id: 'boom', phase: 'controllers', T: 20, error: 'boom' }]);
    expect(g.diags).toEqual(['SIM-E001']);
    expect(g.clock.nowMs()).toBe(30);
    expect(g.sim.stepCount).toBe(3);
    expect(g.tags.get(6 as TagHandle)).toBe(3);
    expect(g.events).toContain('gw');
    g.sim.stepOnce(); // T=30: boom bị bỏ qua
    expect(g.boom.stepCalls).toBe(3);
    expect(g.tags.get(6 as TagHandle)).toBe(4);
    expect(g.sim.snapshotAll().faulted).toEqual(['boom']);
    g.sim.resetAll();
    expect(g.clock.nowMs()).toBe(0);
    expect(g.sim.stepCount).toBe(0);
    expect(g.tags.get(6 as TagHandle)).toBe(0);
    expect(g.boom.resetCalls).toBe(1);
    expect(g.boom.stepCalls).toBe(0);
    g.sim.runSteps(2);
    g.sim.stepOnce(); // Sau reset, boom lại ném ở bước T=20 — isolate nên không ném ra.
    expect(g.clock.nowMs()).toBe(30);
    expect(g.sim.snapshotAll().faulted).toEqual(['boom']);
  });
});

describe('Orchestrator — T6 async: SIM-E002 + stepOnceAsync', () => {
  function makeSlowSim(policy?: 'throw' | 'isolate'): GoldenSim & { slow: ScriptedComponent } {
    const g = makeGoldenSim(policy);
    const slow = new ScriptedComponent('slow', () => Promise.resolve());
    g.sim.register('controllers', slow);
    return { ...g, slow };
  }

  it('stepOnce() gặp Promise → ném SIM-E002; flush không chạy; clock/sc đứng', () => {
    const g = makeSlowSim();
    expect(() => {
      g.sim.stepOnce();
    }).toThrow(/SIM-E002/);
    expect(g.clock.nowMs()).toBe(0);
    expect(g.sim.stepCount).toBe(0);
    expect(g.changes).toEqual([]);
  });

  it('stepOnceAsync() await từng component, giữ thứ tự pha, flush chạy', async () => {
    const g = makeSlowSim();
    await g.sim.stepOnceAsync();
    expect(g.clock.nowMs()).toBe(10);
    expect(g.sim.stepCount).toBe(1);
    expect(g.tags.get(6 as TagHandle)).toBe(1);
    expect(g.changes.map((c) => c.handle)).toEqual([1, 6]);
    expect(g.events).toContain('gw');
  });

  it('stepOnceAsync + reject lần 2: isolate hoàn tất bước, throw ném SimComponentError', async () => {
    const mk = (policy: 'throw' | 'isolate'): GoldenSim & { slow: ScriptedComponent } => {
      const g = makeGoldenSim(policy);
      const slow = new ScriptedComponent('slow', (_T, _dt, self) =>
        self.stepCalls >= 2 ? Promise.reject(new Error('slow-boom')) : Promise.resolve(),
      );
      g.sim.register('controllers', slow);
      return { ...g, slow };
    };
    const iso = mk('isolate');
    await iso.sim.stepOnceAsync();
    expect(iso.sim.stepCount).toBe(1);
    await iso.sim.stepOnceAsync();
    expect(iso.sim.stepCount).toBe(2);
    expect(iso.clock.nowMs()).toBe(20);
    expect(iso.sim.snapshotAll().faulted).toEqual(['slow']);
    const thr = mk('throw');
    await thr.sim.stepOnceAsync();
    await expect(thr.sim.stepOnceAsync()).rejects.toBeInstanceOf(SimComponentError);
    expect(thr.clock.nowMs()).toBe(10);
    expect(thr.sim.stepCount).toBe(1);
  });

  it('stepOnceAsync với toàn component đồng bộ cho kết quả giống hệt stepOnce', async () => {
    const a = makeGoldenSim();
    const b = makeGoldenSim();
    const hashA = new TraceHasher(a.tags);
    const hashB = new TraceHasher(b.tags);
    a.sim.runSteps(5);
    for (let i = 0; i < 5; i++) {
      await b.sim.stepOnceAsync();
    }
    expect(hashA.hash()).toBe(hashB.hash());
    expect(b.tags.get(6 as TagHandle)).toBe(5);
  });
});

describe('Orchestrator — đăng ký, hook, sự kiện, runSteps/runUntil', () => {
  it('register trùng id → ném Error nêu id; getComponent/components đúng', () => {
    const { sim, plant } = makeGoldenSim();
    expect(sim.getComponent('plant')).toBe(plant);
    expect(sim.getComponent('khong-co')).toBeUndefined();
    expect(sim.components('plant').map((c) => c.id)).toEqual(['plant']);
    expect(sim.components().map((c) => c.id)).toEqual(['plant', 'PLC1', 'gw']);
    expect(() => {
      sim.register('plant', plant);
    }).toThrow(/trùng id component 'plant'/);
  });

  it('setHooks(undefined) xóa hook; on/unsub hoạt động', () => {
    const { sim, events } = makeGoldenSim();
    sim.setHooks(undefined);
    let resets = 0;
    const unsub = sim.on('reset', () => {
      resets += 1;
    });
    sim.stepOnce();
    expect(events).not.toContain('before:0');
    sim.resetAll();
    expect(resets).toBe(1);
    unsub();
    sim.resetAll();
    expect(resets).toBe(1);
  });

  it('runSteps: n=0 no-op; n âm → RangeError; runUntil chạy tới target, có thể vượt < stepMs', () => {
    const { sim, clock } = makeGoldenSim();
    sim.runSteps(0);
    expect(clock.nowMs()).toBe(0);
    expect(() => {
      sim.runSteps(-1);
    }).toThrow(RangeError);
    expect(() => {
      sim.runSteps(1.5);
    }).toThrow(RangeError);
    sim.runUntil(25);
    expect(clock.nowMs()).toBe(30);
    expect(sim.stepCount).toBe(3);
    sim.runUntil(20); // target đã qua → no-op
    expect(clock.nowMs()).toBe(30);
    expect(() => {
      sim.runUntil(Number.POSITIVE_INFINITY);
    }).toThrow(RangeError);
  });

  it('resetAll: clock/sc/tag/component về đầu; flush phát thay đổi; emit reset', () => {
    const { sim, tags, clock, plant, changes } = makeGoldenSim();
    let resets = 0;
    sim.on('reset', () => {
      resets += 1;
    });
    sim.runSteps(3);
    expect(tags.get(1 as TagHandle)).toBe(true);
    expect(plant.stepCalls).toBe(3);
    sim.resetAll();
    expect(resets).toBe(1);
    expect(clock.nowMs()).toBe(0);
    expect(sim.stepCount).toBe(0);
    expect(tags.get(1 as TagHandle)).toBe(false);
    expect(tags.get(6 as TagHandle)).toBe(0);
    expect(plant.stepCalls).toBe(0);
    expect(plant.resetCalls).toBe(1);
    expect(changes.some((c) => c.handle === 1 && c.newValue === false)).toBe(true);
    // Chạy lại cho kết quả giống hệt (cùng cấu hình + seed).
    const hasher = new TraceHasher(tags);
    sim.runSteps(3);
    const h1 = hasher.hash();
    sim.resetAll();
    hasher.reset();
    sim.runSteps(3);
    expect(hasher.hash()).toBe(h1);
  });

  it('resetAll gặp reset() async → SIM-E002; resetAllAsync await được', async () => {
    const { sim } = makeGoldenSim();
    const asyncReset = new ScriptedComponent('async-reset');
    // Component vi phạm hợp đồng đồng bộ: reset() trả Promise (test SIM-E002).
    Object.defineProperty(asyncReset, 'reset', { value: () => Promise.resolve() });
    sim.register('gateways', asyncReset);
    expect(() => {
      sim.resetAll();
    }).toThrow(/SIM-E002/);
    await expect(sim.resetAllAsync()).resolves.toBeUndefined();
    expect(sim.simTimeMs).toBe(0);
  });

  it('applyInbox chạy lệnh ngay khi tạm dừng, không bước sim', () => {
    const { sim, tags, clock } = makeGoldenSim();
    sim.post({
      label: 'X',
      run: ({ tags: t }) => {
        t.write('BTN_START', true, 'test');
      },
    });
    sim.applyInbox();
    expect(tags.get(0 as TagHandle)).toBe(true);
    expect(clock.nowMs()).toBe(0);
    expect(sim.stepCount).toBe(0);
  });

  it('beforeExternals ném → clock/sc đứng, flush không chạy; afterStep ném → clock/sc đứng', () => {
    const { sim, clock, changes } = makeGoldenSim();
    sim.setHooks({
      beforeExternals: () => {
        throw new Error('hook-boom');
      },
    });
    expect(() => {
      sim.stepOnce();
    }).toThrow(/hook-boom/);
    expect(clock.nowMs()).toBe(0);
    expect(sim.stepCount).toBe(0);
    expect(changes).toEqual([]);
    const g2 = makeGoldenSim();
    g2.sim.setHooks({
      afterStep: () => {
        throw new Error('after-boom');
      },
    });
    expect(() => {
      g2.sim.stepOnce();
    }).toThrow(/after-boom/);
    expect(g2.clock.nowMs()).toBe(0);
    expect(g2.sim.stepCount).toBe(0);
  });

  it('snapshotAll/restoreAll: version sai, tập component khác, namesHash khác → SIM-E003', () => {
    const { sim } = makeGoldenSim();
    sim.runSteps(2);
    const snap = sim.snapshotAll();
    expect(() => {
      sim.restoreAll({ ...snap, version: 2 } as unknown as typeof snap);
    }).toThrow(/SIM-E003/);
    const other = makeGoldenSim();
    const extra = new ScriptedComponent('extra');
    other.sim.register('gateways', extra);
    expect(() => {
      other.sim.restoreAll(snap);
    }).toThrow(/SIM-E003/);
    // Snapshot từ sim có tập tag khác (thiếu PT01) → namesHash khác.
    const clock2 = new ManualClock();
    const tags2 = new TagDB(helloDefs().slice(0, 2), clock2);
    const sim2 = new SimulationOrchestrator(tags2, clock2, new TagDbIoBus(tags2), {
      stepMs: 10,
      seed: 1,
    });
    expect(() => {
      sim2.restoreAll(snap);
    }).toThrow(/SIM-E003/);
  });

  it('post() giữa các bước chạy ở đầu bước kế (sau beforeExternals)', () => {
    const { sim, tags } = makeGoldenSim();
    const order: string[] = [];
    sim.setHooks({
      beforeExternals: () => order.push('before'),
    });
    sim.post({
      label: 'P',
      run: () => {
        order.push('cmd');
      },
    });
    sim.stepOnce();
    expect(order).toEqual(['before', 'cmd']);
    expect(tags.get(0 as TagHandle)).toBe(false);
  });
});

describe('Orchestrator — biên và sự kiện bổ sung', () => {
  it('constructor stepMs không hợp lệ → RangeError', () => {
    const { tags, clock } = makeGoldenSim();
    const io = new TagDbIoBus(tags);
    expect(() => new SimulationOrchestrator(tags, clock, io, { stepMs: 0, seed: 1 })).toThrow(
      RangeError,
    );
    expect(() => new SimulationOrchestrator(tags, clock, io, { stepMs: 2.5, seed: 1 })).toThrow(
      RangeError,
    );
  });

  it('không có component: stepOnce chỉ advance clock và tăng stepCount', () => {
    const clock = new ManualClock();
    const tags = new TagDB(helloDefs(), clock);
    const sim = new SimulationOrchestrator(tags, clock, new TagDbIoBus(tags), {
      stepMs: 10,
      seed: 1,
    });
    sim.stepOnce();
    expect(clock.nowMs()).toBe(10);
    expect(sim.stepCount).toBe(1);
    expect(sim.components()).toEqual([]);
  });

  it('lệnh inbox ném lỗi → diagnostic SIM-E001, các lệnh còn lại vẫn chạy (OQ-021)', () => {
    const { sim, tags } = makeGoldenSim();
    const diags: string[] = [];
    sim.on('diagnostic', (d) => diags.push(d.code));
    sim.post({
      label: 'BAD',
      run: () => {
        throw new Error('cmd-boom');
      },
    });
    sim.post({
      label: 'GOOD',
      run: ({ tags: t }) => {
        t.write('BTN_START', true, 'test');
      },
    });
    sim.stepOnce();
    expect(diags).toEqual(['SIM-E001']);
    expect(tags.get(0 as TagHandle)).toBe(true);
    expect(sim.stepCount).toBe(1);
  });

  it('component lỗi ở pha plant (isolate) → controllers/gateways vẫn chạy', () => {
    const { sim, tags } = makeGoldenSim('isolate');
    const badPlant = new ScriptedComponent('bad-plant', () => {
      throw new Error('plant-boom');
    });
    // Đăng ký thêm plant lỗi sau plant gốc: plant gốc chạy trước, bad-plant ném.
    sim.register('plant', badPlant);
    const faults: string[] = [];
    sim.on('componentFault', (p) => faults.push(p.id));
    sim.stepOnce();
    expect(faults).toEqual(['bad-plant']);
    expect(tags.get(6 as TagHandle)).toBe(1);
    expect(sim.stepCount).toBe(1);
  });

  it('component faulted bị bỏ qua cả ở stepOnceAsync', async () => {
    const { sim } = makeGoldenSim('isolate');
    const boom = new ScriptedComponent('boom', () => {
      throw new Error('boom');
    });
    sim.register('controllers', boom);
    await sim.stepOnceAsync();
    expect(sim.snapshotAll().faulted).toEqual(['boom']);
    const calls = boom.stepCalls;
    await sim.stepOnceAsync();
    expect(boom.stepCalls).toBe(calls);
  });

  it('restoreAll khôi phục danh sách faulted từ snapshot', () => {
    const a = makeGoldenSim('isolate');
    const boom = new ScriptedComponent('boom', () => {
      throw new Error('boom');
    });
    a.sim.register('controllers', boom);
    a.sim.stepOnce();
    const snap = a.sim.snapshotAll();
    expect(snap.faulted).toEqual(['boom']);
    const b = makeGoldenSim('isolate');
    const boomB = new ScriptedComponent('boom', () => {
      throw new Error('boom');
    });
    b.sim.register('controllers', boomB);
    b.sim.restoreAll(snap);
    expect(b.sim.snapshotAll().faulted).toEqual(['boom']);
    expect(boomB.stepCalls).toBe(1); // khôi phục từ snapshot của sim a
    b.sim.stepOnce();
    expect(boomB.stepCalls).toBe(1); // faulted → bị bỏ qua, không tăng
  });

  it('components() trả bản sao — sửa mảng trả về không ảnh hưởng sim', () => {
    const { sim } = makeGoldenSim();
    const list = sim.components('plant');
    (list as SimComponent[]).push(new ScriptedComponent('fake'));
    expect(sim.components('plant').map((c) => c.id)).toEqual(['plant']);
  });

  it('snapshotAll chứa snapshot từng component theo id', () => {
    const { sim } = makeGoldenSim();
    sim.runSteps(2);
    const snap = sim.snapshotAll();
    expect((snap.components['plant'] as { stepCalls: number }).stepCalls).toBe(2);
    expect((snap.components['gw'] as { stepCalls: number }).stepCalls).toBe(2);
    expect(snap.format).toBe('vcs-sim-snapshot');
    expect(snap.version).toBe(1);
  });

  it('stepOnceAsync: post trong beforeExternals chạy cùng bước', async () => {
    const { sim, tags } = makeGoldenSim();
    sim.setHooks({
      beforeExternals: () => {
        sim.post({
          label: 'C',
          run: ({ tags: t }) => {
            t.write('BTN_START', true, 'test');
          },
        });
      },
    });
    await sim.stepOnceAsync();
    expect(tags.get(0 as TagHandle)).toBe(true);
    expect(tags.get(3 as TagHandle)).toBe(true);
  });

  it('resetAllAsync với toàn component đồng bộ chạy được và reset về đầu', async () => {
    const { sim, tags, clock } = makeGoldenSim();
    sim.runSteps(2);
    await sim.resetAllAsync();
    expect(clock.nowMs()).toBe(0);
    expect(sim.stepCount).toBe(0);
    expect(tags.get(6 as TagHandle)).toBe(0);
  });
});

describe('Orchestrator — property tất định (§12.2, seed cố định)', () => {
  it('chạy N, snapshot, chạy M, restore, chạy lại M ⇒ hash giống hệt', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 12 }), (n, m) => {
        const { sim, tags } = makeGoldenSim();
        const hasher = new TraceHasher(tags);
        sim.runSteps(n);
        const snap = sim.snapshotAll();
        hasher.reset();
        sim.runSteps(m);
        const hashA = hasher.hash();
        sim.restoreAll(snap);
        hasher.reset();
        sim.runSteps(m);
        expect(hasher.hash()).toBe(hashA);
      }),
      { seed: 20261124 },
    );
  });

  it('hai sim cùng cấu hình + cùng chuỗi post ⇒ hash giống hệt', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (n) => {
        const a = makeGoldenSim();
        const b = makeGoldenSim();
        const hashA = new TraceHasher(a.tags);
        const hashB = new TraceHasher(b.tags);
        const postBoth = (sim: SimulationOrchestrator): void => {
          sim.post({
            label: 'C0',
            run: ({ tags: t }) => {
              t.write('BTN_START', true, 'test');
            },
          });
        };
        postBoth(a.sim);
        postBoth(b.sim);
        a.sim.runSteps(n);
        b.sim.runSteps(n);
        expect(hashA.hash()).toBe(hashB.hash());
      }),
      { seed: 20261124 },
    );
  });
});
