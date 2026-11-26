// Scenario runner vòng kín (M2 §11.4, P2.4 — OQ-305/315/317/319).
// Chạy một kịch bản YAML trên sim đã dựng (plant + SoftPlc): tác động đặt ở
// đầu bước T (trước pha plant), kỳ vọng kiểm sau bước T đầy đủ (sau scan
// PLC + flush). Tag so raw (Bool chính xác, số |a−b| ≤ 0.01 — mirror
// OQ-257); observable so eng. Tag expects so giá trị RAW của TagDB —
// muốn so eng thì dùng observable (runner không có TagDef/scaling).
// `clear` gọi trước bước T với `atMs = T` tường minh (`clearFault(id, T)`):
// `clearFault` không `atMs` lấy `#simTimeMs` của engine — trước bước T nó
// còn là T−dt → bảng A T=2990/3000 (reset 1000 ms từ clear 2000) lệch 1
// bước; clear sau bước cho clearedAtMs đúng nhưng lỗi còn hiệu lực trong
// bước T → bảng D T=3000/3800 sai. Chỉ `atMs` tường minh thỏa cả hai.
// Xem STATE §27 "Lệch so với plan".

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { TraceHasher, type SimulationOrchestrator } from '@vcs/kernel';
import { faultRequestSchema, type FaultRequest } from '@vcs/schemas';
import type { PlantEngine } from './engine.js';

/** Lỗi trong file/chạy scenario (mirror `GoldenError` OQ-201). Không mã
 * Diagnostic mới (OQ-319): CLI in message + exit 2. */
export class ScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioError';
  }
}

/** Giá trị expect: Bool/string chính xác; số |a−b| ≤ 0.01 (mirror OQ-257). */
export const scenarioExpectValueSchema = z.union([z.boolean(), z.number(), z.string()]);

export type ScenarioExpectValue = z.infer<typeof scenarioExpectValueSchema>;

/**
 * Fault trong scenario: như `FaultRequest` nhưng KHÔNG có `when` — runner
 * đặt `when: { at: 'time', timeMs: at }` từ `at` của step (OQ-305; plan
 * ghi `{time: at}` là shorthand — shape thật của `FaultTiming` là
 * `{at: 'time', timeMs}`).
 */
export const scenarioFaultSchema = faultRequestSchema.omit({ when: true }).strict();

export type ScenarioFault = z.infer<typeof scenarioFaultSchema>;

export const scenarioStepSchema = z
  .object({
    at: z.number().int().min(0),
    set: z.record(z.string(), z.union([z.boolean(), z.number()])).optional(),
    fault: scenarioFaultSchema.optional(),
    clear: z.string().min(1).optional(),
    preset: z
      .object({ equipment: z.string().min(1), preset: z.string().min(1) })
      .strict()
      .optional(),
  })
  .strict();

export type ScenarioStep = z.infer<typeof scenarioStepSchema>;

export const scenarioExpectSchema = z
  .object({
    at: z.number().int().min(0),
    tags: z.record(z.string(), z.union([z.boolean(), z.number()])).optional(),
    observables: z.record(z.string(), z.record(z.string(), scenarioExpectValueSchema)).optional(),
  })
  .strict();

export type ScenarioExpect = z.infer<typeof scenarioExpectSchema>;

export const scenarioSchema = z
  .object({
    name: z.string().min(1).optional(),
    simulation: z
      .object({
        stepMs: z.number().int().positive().optional(),
        plcScanMs: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    steps: z.array(scenarioStepSchema).default([]),
    expects: z.array(scenarioExpectSchema).min(1),
  })
  .strict()
  .superRefine((s, ctx) => {
    const sorted = (label: string, ats: readonly number[]): void => {
      for (let i = 1; i < ats.length; i++) {
        if ((ats[i] as number) < (ats[i - 1] as number)) {
          ctx.addIssue({
            code: 'custom',
            path: [label],
            message: `scenario: ${label} phải tăng dần theo 'at' (nhận ${String(ats[i - 1])} rồi ${String(ats[i])}).`,
          });
          return;
        }
      }
    };
    sorted('steps', s.steps.map((x) => x.at));
    sorted('expects', s.expects.map((x) => x.at));
  });

export type Scenario = z.infer<typeof scenarioSchema>;

/** Parse YAML scenario (file sai schema → `ScenarioError`). */
export function parseScenarioYaml(text: string, fileName: string): Scenario {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    throw new ScenarioError(
      `scenario ${fileName}: YAML không parse được — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const parsed = scenarioSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ScenarioError(
      `scenario ${fileName}: schema không hợp lệ — ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return parsed.data;
}

export interface ScenarioFailure {
  at: number;
  key: string;
  expected: string;
  actual: string;
}

export interface ScenarioResult {
  passed: boolean;
  failures: ScenarioFailure[];
  hash: string;
  stepCount: number;
}

export interface RunScenarioOptions {
  /** Chạy tới bước T này (mặc định: `at` lớn nhất trong steps/expects). */
  untilMs?: number;
  /** Hasher có sẵn (CLI tạo như `run.ts`); không có → runner tự tạo. */
  hasher?: TraceHasher;
}

const EPS = 0.01;

function valueText(v: number | boolean | string): string {
  return typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
}

function matches(expected: number | boolean | string, actual: number | boolean | string): boolean {
  if (typeof expected === 'number' && typeof actual === 'number') {
    return Math.abs(expected - actual) <= EPS;
  }
  return expected === actual;
}

/**
 * Chạy scenario trên sim đã dựng. Vòng lặp T = simTimeMs hiện tại, stepMs,
 * … tới `untilMs`: (1) áp action đúng `at == T` (set qua `sim.post` —
 * drain ở đầu bước, trước pha plant; fault/preset gọi trực tiếp engine
 * với `when` tuyệt đối; clear gọi `engine.clearFault(id, T)` — xem ghi
 * chú đầu file); (2) `sim.stepOnce()`; (3) kiểm expects đúng `at == T`
 * sau bước T đầy đủ. `clear` tên lỗi thiết bị/preset đã inject trong
 * lần chạy này (map nội bộ); nếu không có → tìm record active trong
 * `engine.listFaults()` (để chạy tiếp sau restore/snapshot vẫn clear
 * được — OQ-317); không thấy → `ScenarioError`. Lỗi scenario (tag/
 * equipment/observable không tồn tại, `at` không phải bội stepMs,
 * expects vượt `untilMs`) → `ScenarioError`; giá trị sai → ghi
 * `failures` (không ném).
 */
export function runScenario(
  sim: SimulationOrchestrator,
  engine: PlantEngine,
  scenario: Scenario,
  opts?: RunScenarioOptions,
): ScenarioResult {
  const stepMs = sim.stepMs;
  const startT = sim.simTimeMs;
  if (startT % stepMs !== 0) {
    throw new ScenarioError(
      `scenario: simTimeMs hiện tại ${String(startT)} không phải bội stepMs ${String(stepMs)}.`,
    );
  }
  const maxAt = Math.max(
    ...scenario.steps.map((s) => s.at),
    ...scenario.expects.map((e) => e.at),
    startT,
  );
  const untilMs = opts?.untilMs ?? maxAt;
  if (untilMs < startT) {
    throw new ScenarioError(
      `scenario: untilMs ${String(untilMs)} nhỏ hơn simTimeMs hiện tại ${String(startT)}.`,
    );
  }
  if ((untilMs - startT) % stepMs !== 0) {
    throw new ScenarioError(
      `scenario: untilMs ${String(untilMs)} không nằm trên lưới bước (bắt đầu ${String(startT)}, stepMs ${String(stepMs)}).`,
    );
  }
  for (const e of scenario.expects) {
    if (e.at > untilMs) {
      throw new ScenarioError(
        `scenario: expects tại ${String(e.at)} vượt quá untilMs ${String(untilMs)} — tăng --until/--steps hoặc bỏ expect.`,
      );
    }
  }

  const hasher = opts?.hasher ?? new TraceHasher(sim.tags);
  const failures: ScenarioFailure[] = [];
  // Record id đã inject trong lần chạy này: `eq:<fault>` / `preset:<name>`.
  const injected = new Map<string, string>();

  const stepsByAt = new Map<number, ScenarioStep[]>();
  for (const s of scenario.steps) {
    if (s.at % stepMs !== 0) {
      throw new ScenarioError(
        `scenario: steps tại ${String(s.at)} không phải bội stepMs ${String(stepMs)}.`,
      );
    }
    const list = stepsByAt.get(s.at) ?? [];
    list.push(s);
    stepsByAt.set(s.at, list);
  }
  const expectsByAt = new Map<number, ScenarioExpect[]>();
  for (const e of scenario.expects) {
    if (e.at % stepMs !== 0) {
      throw new ScenarioError(
        `scenario: expects tại ${String(e.at)} không phải bội stepMs ${String(stepMs)}.`,
      );
    }
    const list = expectsByAt.get(e.at) ?? [];
    list.push(e);
    expectsByAt.set(e.at, list);
  }

  for (let T = startT; T <= untilMs; T += stepMs) {
    // (1) Action trước bước T: set (qua post) + fault/preset/clear (trực tiếp).
    const actions = stepsByAt.get(T) ?? [];
    for (const a of actions) {
      if (a.set !== undefined) {
        for (const [name, value] of Object.entries(a.set)) {
          const handle = sim.tags.handle(name);
          if (handle === undefined) {
            throw new ScenarioError(`scenario: tag '${name}' (set tại ${String(T)}) không tồn tại.`);
          }
          sim.post({
            label: `scenario set ${name}`,
            run: (ctx) => {
              ctx.tags.set(handle, value, 'system');
            },
          });
        }
      }
      if (a.fault !== undefined) {
        const req: FaultRequest = {
          ...a.fault,
          when: { at: 'time', timeMs: T },
        };
        let id: string;
        try {
          id = engine.injectFault(req);
        } catch (err) {
          throw new ScenarioError(
            `scenario: inject fault tại ${String(T)} — ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        if (!('signal' in req.target)) {
          injected.set(`eq:${req.target.fault}`, id);
        }
      }
      if (a.preset !== undefined) {
        let id: string;
        try {
          id = engine.applyPreset(a.preset.equipment, a.preset.preset, {
            at: 'time',
            timeMs: T,
          });
        } catch (err) {
          throw new ScenarioError(
            `scenario: preset '${a.preset.equipment}.${a.preset.preset}' tại ${String(T)} — ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        injected.set(`preset:${a.preset.preset}`, id);
      }
      if (a.clear !== undefined) {
        const id =
          injected.get(`eq:${a.clear}`) ??
          injected.get(`preset:${a.clear}`) ??
          findActiveFaultRecord(engine, a.clear);
        if (id === undefined) {
          throw new ScenarioError(
            `scenario: clear '${a.clear}' tại ${String(T)} — lỗi chưa từng inject trong scenario này (hoặc đã clear).`,
          );
        }
        // atMs = T tường minh: clearedAtMs đúng T (bảng A) + lỗi hết hiệu
        // lực trong bước T (bảng D) — xem ghi chú đầu file.
        if (!engine.clearFault(id, T)) {
          throw new ScenarioError(`scenario: clear '${a.clear}' tại ${String(T)} — record đã clear/hết hạn.`);
        }
        injected.delete(`eq:${a.clear}`);
        injected.delete(`preset:${a.clear}`);
      }
    }
    // (2) Bước T đầy đủ (plant → PLC → flush).
    sim.stepOnce();
    // (3) Expects sau bước T đầy đủ.
    for (const e of expectsByAt.get(T) ?? []) {
      if (e.tags !== undefined) {
        for (const [name, expected] of Object.entries(e.tags)) {
          let actual: number | boolean | string;
          try {
            actual = sim.tags.read(name).value;
          } catch {
            throw new ScenarioError(`scenario: tag '${name}' (expect tại ${String(T)}) không tồn tại.`);
          }
          if (!matches(expected, actual)) {
            failures.push({ at: T, key: name, expected: valueText(expected), actual: valueText(actual) });
          }
        }
      }
      if (e.observables !== undefined) {
        for (const [equipmentId, obs] of Object.entries(e.observables)) {
          for (const [key, expected] of Object.entries(obs)) {
            let actual: number | boolean | string | undefined;
            try {
              actual = engine.getObservable(equipmentId, key);
            } catch (err) {
              throw new ScenarioError(
                `scenario: observable '${equipmentId}.${key}' (expect tại ${String(T)}) — ${err instanceof Error ? err.message : String(err)}`,
              );
            }
            if (actual === undefined) {
              throw new ScenarioError(
                `scenario: observable '${equipmentId}.${key}' chưa có giá trị tại ${String(T)}.`,
              );
            }
            if (!matches(expected, actual)) {
              failures.push({
                at: T,
                key: `${equipmentId}.${key}`,
                expected: valueText(expected),
                actual: valueText(actual),
              });
            }
          }
        }
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    hash: hasher.hash(),
    stepCount: sim.stepCount,
  };
}

/** Tìm record fault thiết bị đang active/pending theo tên lỗi (mọi thiết bị). */
function findActiveFaultRecord(engine: PlantEngine, faultName: string): string | undefined {
  for (const f of engine.listFaults()) {
    if (f.state === 'cleared') continue;
    if (!('signal' in f.target) && f.target.fault === faultName) return f.id;
  }
  return undefined;
}
