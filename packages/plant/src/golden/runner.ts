// Golden runner plant (M2 §11.1, P2.2 — OQ-253/254/257/258/264).
// Chạy 1 case trên PlantEngine đã dựng sẵn (harness dựng fresh engine mỗi
// case, không phụ thuộc `engine.reset()`).
// Ngữ nghĩa 1 step entry {t, cmd?, fault?, expect?} (OQ-254):
//   1. step engine từ bước kế đến t (mỗi bước đều step + flush);
//   2. kiểm `expect` sau step(t), TRƯỚC khi áp cmd/fault của entry này;
//   3. áp `cmd` (ghi TagDB trực tiếp) rồi `fault`/`clear` (inject với
//      `when: {at:'now'}` → hiệu lực từ bước t+dt).

import { parse as parseYaml } from 'yaml';

import type { TagDB } from '@vcs/kernel';
import type { TagDef } from '@vcs/schemas';

import { rawToEng } from '../adapter.js';
import type { PlantEngine } from '../engine.js';
import {
  goldenFileSchema,
  type GoldenExpectValue,
  type PlantGoldenCase,
  type PlantGoldenFile,
} from './schema.js';

/** Lỗi golden: file sai, case sai, expect không khớp, key lạ (OQ-257). */
export class GoldenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoldenError';
  }
}

/** Bối cảnh chạy 1 case golden (harness cung cấp). */
export interface GoldenRunContext {
  engine: PlantEngine;
  tags: TagDB;
  equipmentId: string;
  /** role → tên tag (gán đủ role của model — OQ-258). */
  signals: Record<string, string>;
  /** tên tag → TagDef (để đổi raw→eng cho role analog). */
  defs: Map<string, TagDef>;
  stepMs: number;
}

/** Dung sai mặc định khi so số (OQ-257). */
export const GOLDEN_DEFAULT_EPS = 0.01;

/** Parse + validate file golden YAML (t tăng dần, gap là bội số stepMs). */
export function parseGoldenYaml(text: string): PlantGoldenFile {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (e) {
    throw new GoldenError(
      `Golden YAML không parse được: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const parsed = goldenFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GoldenError(
      `Golden YAML không hợp lệ: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }
  const file = parsed.data;
  const ids = new Set<string>();
  for (const c of file.cases) {
    if (ids.has(c.id)) {
      throw new GoldenError(`Golden case trùng id: ${c.id}`);
    }
    ids.add(c.id);
    let prev = -1;
    for (const s of c.steps) {
      if (prev >= 0) {
        if (s.t <= prev) {
          throw new GoldenError(
            `Golden case ${c.id}: t phải tăng dần (nhận ${String(s.t)} sau ${String(prev)}).`,
          );
        }
        if ((s.t - prev) % file.stepMs !== 0) {
          throw new GoldenError(
            `Golden case ${c.id}: gap ${String(s.t - prev)} không phải bội số stepMs ${String(file.stepMs)}.`,
          );
        }
      }
      prev = s.t;
    }
  }
  return file;
}

function fail(caseId: string, t: number, msg: string): never {
  throw new GoldenError(`Golden case ${caseId} @ t=${String(t)}: ${msg}`);
}

function readRoleValue(ctx: GoldenRunContext, role: string): number | boolean {
  const tagName = ctx.signals[role];
  if (tagName === undefined) {
    throw new GoldenError(`Role ${role} chưa gán tag trong harness (OQ-258).`);
  }
  const h = ctx.tags.handle(tagName);
  if (h === undefined) {
    throw new GoldenError(`Tag ${tagName} (role ${role}) không tồn tại trong TagDB.`);
  }
  const v = ctx.tags.get(h);
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'number') {
    throw new GoldenError(
      `Role ${role} (tag ${tagName}) có giá trị chuỗi — expect số/bool không so được.`,
    );
  }
  const def = ctx.defs.get(tagName);
  const scaling = def?.signal?.scaling;
  if (scaling !== undefined) {
    return rawToEng(v, {
      rawMin: scaling.rawMin,
      rawMax: scaling.rawMax,
      engMin: scaling.engMin,
      engMax: scaling.engMax,
    });
  }
  return v;
}

function readExpected(
  ctx: GoldenRunContext,
  caseId: string,
  t: number,
  key: string,
): number | boolean | string {
  // Key resolve role trước, rồi observable (OQ-257).
  if (Object.hasOwn(ctx.signals, key)) {
    return readRoleValue(ctx, key);
  }
  try {
    const v = ctx.engine.getObservable(ctx.equipmentId, key);
    if (v === undefined) {
      fail(caseId, t, `Observable ${key} chưa có giá trị.`);
    }
    return v;
  } catch (e) {
    if (e instanceof GoldenError) throw e;
    if (e instanceof Error && e.message.includes('không khai báo')) {
      fail(caseId, t, `Key lạ trong expect: ${key} (không phải role hay observable).`);
    }
    throw e;
  }
}

function checkExpect(
  ctx: GoldenRunContext,
  c: PlantGoldenCase,
  t: number,
  expect: Record<string, GoldenExpectValue>,
): void {
  for (const [key, want] of Object.entries(expect)) {
    const actual = readExpected(ctx, c.id, t, key);
    if (typeof want === 'object') {
      if (typeof actual !== 'number') {
        fail(c.id, t, `expect ${key}: cần số, nhận ${typeof actual}.`);
      }
      const eps = want.eps ?? GOLDEN_DEFAULT_EPS;
      if (Math.abs(actual - want.approx) > eps) {
        fail(
          c.id,
          t,
          `expect ${key}: cần ≈ ${String(want.approx)} (±${String(eps)}), nhận ${String(actual)}.`,
        );
      }
      continue;
    }
    if (typeof want === 'number') {
      if (typeof actual !== 'number' || Math.abs(actual - want) > GOLDEN_DEFAULT_EPS) {
        fail(
          c.id,
          t,
          `expect ${key}: cần ≈ ${String(want)} (±${String(GOLDEN_DEFAULT_EPS)}), nhận ${String(actual)}.`,
        );
      }
      continue;
    }
    if (actual !== want) {
      fail(c.id, t, `expect ${key}: cần ${String(want)}, nhận ${String(actual)}.`);
    }
  }
}

/** Chạy 1 case golden trên engine đã dựng sẵn (fresh engine mỗi case). */
export function runPlantGoldenCase(ctx: GoldenRunContext, c: PlantGoldenCase): void {
  // Validate lại thứ tự/gap (parseGoldenYaml đã kiểm; chạy trực tiếp cũng an toàn).
  let prev = -1;
  for (const s of c.steps) {
    if (prev >= 0 && (s.t <= prev || (s.t - prev) % ctx.stepMs !== 0)) {
      fail(c.id, s.t, 't phải tăng dần và gap là bội số stepMs.');
    }
    prev = s.t;
  }
  // id record lỗi đã inject, để {clear} tra cứu (key: `eq:<fault>` / `preset:<name>`).
  const injected = new Map<string, string>();
  let lastT = -ctx.stepMs;
  for (const s of c.steps) {
    for (let tt = lastT + ctx.stepMs; tt <= s.t; tt += ctx.stepMs) {
      ctx.engine.step(tt, ctx.stepMs);
      ctx.tags.flush();
    }
    lastT = s.t;
    if (s.expect !== undefined) {
      checkExpect(ctx, c, s.t, s.expect);
    }
    // Áp cmd/fault SAU step(t) (OQ-254) — hiệu lực từ bước t+dt.
    if (s.cmd !== undefined) {
      for (const [role, v] of Object.entries(s.cmd)) {
        const tagName = ctx.signals[role];
        if (tagName === undefined) {
          fail(c.id, s.t, `cmd cho role lạ: ${role}.`);
        }
        const h = ctx.tags.handle(tagName);
        if (h === undefined) {
          fail(c.id, s.t, `Tag ${tagName} (role ${role}) không tồn tại trong TagDB.`);
        }
        ctx.tags.set(h, v, 'plc');
      }
    }
    if (s.fault !== undefined) {
      const f = s.fault;
      if ('id' in f) {
        const id = ctx.engine.injectFault({
          target: { equipment: ctx.equipmentId, fault: f.id },
          when: { at: 'now' },
          ...(s.durationMs !== undefined ? { durationMs: s.durationMs } : {}),
        });
        injected.set(`eq:${f.id}`, id);
      } else if ('preset' in f) {
        if (s.durationMs !== undefined) {
          fail(
            c.id,
            s.t,
            'durationMs chỉ dùng với inject ({id} / {signal}), không dùng với preset.',
          );
        }
        const id = ctx.engine.applyPreset(ctx.equipmentId, f.preset);
        injected.set(`preset:${f.preset}`, id);
      } else if ('signal' in f) {
        const id = ctx.engine.injectFault({
          target: { equipment: ctx.equipmentId, signal: f.signal.role, type: f.signal.type },
          when: { at: 'now' },
          ...(s.durationMs !== undefined ? { durationMs: s.durationMs } : {}),
          ...(f.signal.params !== undefined ? { params: f.signal.params } : {}),
        });
        injected.set(`signal:${f.signal.role}:${f.signal.type}`, id);
      } else {
        const id = injected.get(`eq:${f.clear}`) ?? injected.get(`preset:${f.clear}`);
        if (id === undefined) {
          fail(c.id, s.t, `clear ${f.clear}: lỗi chưa từng inject trong case này.`);
        }
        if (!ctx.engine.clearFault(id)) {
          fail(c.id, s.t, `clear ${f.clear}: lỗi đã clear/hết hạn trước đó.`);
        }
      }
    }
  }
}
