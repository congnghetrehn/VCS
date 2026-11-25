// Golden runner — M1 §12.1, P1.7 (STATE §22, bảng E, OQ-199/200/201).
// Chạy một GoldenCase trên SoftPlc trực tiếp (không qua orchestrator):
// mỗi step YAML = một lần gọi step() — step đầu tiên (i=0) không scan
// (kiểm trạng thái đầu), các step sau gọi step(tᵢ₋₁, tᵢ−tᵢ₋₁).
// Lỗi là GoldenError (không phải mã Diagnostic catalog, OQ-201).

import { parse as parseYaml } from 'yaml';
import type { IrProgram } from '../ir.js';
import { SoftPlc } from '../softplc.js';
import { buildTagAddressMap } from '../tagmap.js';
import { goldenYamlSchema, type GoldenCase, type GoldenExpect } from './schema.js';

export type { GoldenCase } from './schema.js';

/** Lỗi golden: sai format, sai thứ tự step, ref không đọc/ghi được,
 * kỳ vọng sai, fault không khớp. Thông điệp luôn nêu id + step + ref. */
export class GoldenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoldenError';
  }
}

export interface GoldenResult {
  id: string;
  steps: number;
  scans: number;
}

/** Parse text YAML → GoldenCase. Lỗi YAML/schema → GoldenError. */
export function parseGoldenYaml(text: string, fileName = 'golden.yaml'): GoldenCase {
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch (e) {
    throw new GoldenError(
      `${fileName}: YAML không parse được: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const parsed = goldenYamlSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new GoldenError(`${fileName}: schema golden không hợp lệ: ${issues}`);
  }
  const c = parsed.data;
  for (let i = 1; i < c.steps.length; i++) {
    const prev = c.steps[i - 1] as { t: number };
    const cur = c.steps[i] as { t: number };
    if (cur.t < prev.t) {
      throw new GoldenError(
        `${fileName}: steps phải tăng dần theo t (step ${String(i)}: ${String(cur.t)} < ${String(prev.t)})`,
      );
    }
  }
  return c;
}

function fmt(v: unknown): string {
  // JSON.stringify theo kiểu TS luôn trả string; fmt chỉ gọi với giá trị
  // đã qua zod (number/string/boolean/{approx}) nên không có undefined.
  return JSON.stringify(v);
}

function expectMatches(actual: unknown, expected: GoldenExpect): boolean {
  if (typeof expected === 'object') {
    // {approx, eps}: chỉ dùng cho số (Real).
    if (typeof actual !== 'number') return false;
    return Math.abs(actual - expected.approx) <= (expected.eps ?? 1e-6);
  }
  if (typeof expected === 'number' && !Number.isInteger(expected)) {
    // Real: so bằng Object.is sau fround (§12.1).
    return typeof actual === 'number' && Object.is(Math.fround(actual), Math.fround(expected));
  }
  return Object.is(actual, expected);
}

/** Chạy golden trên chương trình ĐÃ BIÊN DỊCH (harness/CLI biên dịch
 * sources bằng compileProject trước). Ném GoldenError khi thất bại. */
export function runGolden(
  golden: GoldenCase,
  program: IrProgram,
  opts?: { id?: string },
): GoldenResult {
  const scanPeriodMs = golden.config?.scanPeriodMs ?? 10;
  let organization = program.organization;
  if (golden.organization !== undefined) {
    organization = golden.organization.map((o) => {
      const found = program.organization.find((b) => b.ob === o.ob);
      if (found === undefined) {
        throw new GoldenError(
          `${golden.id}: organization ob ${String(o.ob)} không có trong chương trình`,
        );
      }
      return {
        ob: o.ob,
        block: found.block,
        ...(o.cycleMs !== undefined ? { cycleMs: o.cycleMs } : {}),
        ...(o.phaseMs !== undefined ? { phaseMs: o.phaseMs } : {}),
      };
    });
  }
  const plc = new SoftPlc(
    { ...program, organization },
    // Bảng tag của golden (nếu có) để ref tên tag giải đúng kiểu
    // (vd Real) — ref tuyệt đối %MD0 mặc định là DInt theo độ rộng.
    buildTagAddressMap(golden.tags ?? []),
    { id: opts?.id ?? 'golden', scanPeriodMs },
  );
  plc.start();

  // Baseline đếm fault theo mã (để tính delta từng step).
  const faultCounts = new Map<string, number>();
  const syncFaultBaseline = (): void => {
    for (const f of plc.getDiagnostics().faults) faultCounts.set(f.code, f.count);
  };

  let saved: unknown;
  let prevT = (golden.steps[0] as { t: number }).t;
  for (let i = 0; i < golden.steps.length; i++) {
    const step = golden.steps[i] as NonNullable<(typeof golden.steps)[number]>;
    const at = `${golden.id} step ${String(i)} (t=${String(step.t)})`;
    if (step.restore === true) {
      if (saved === undefined) {
        throw new GoldenError(`${at}: restore nhưng chưa có snapshot trước đó`);
      }
      plc.restore(saved);
      syncFaultBaseline();
    }
    for (const [ref, v] of Object.entries(step.set ?? {})) {
      try {
        plc.write(ref, v);
      } catch (e) {
        throw new GoldenError(
          `${at}: set ${ref} thất bại: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    for (const [ref, v] of Object.entries(step.force ?? {})) {
      try {
        plc.force(ref, v);
      } catch (e) {
        throw new GoldenError(
          `${at}: force ${ref} thất bại: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    for (const ref of step.unforce ?? []) {
      try {
        plc.unforce(ref);
      } catch (e) {
        throw new GoldenError(
          `${at}: unforce ${ref} thất bại: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    const dt = step.t - prevT;
    if (dt < 0) {
      throw new GoldenError(`${at}: t giảm (${String(step.t)} < ${String(prevT)})`);
    }
    if (dt % scanPeriodMs !== 0) {
      throw new GoldenError(
        `${at}: khoảng ${String(dt)} ms không chia hết cho scanPeriodMs ${String(scanPeriodMs)} (OQ-199)`,
      );
    }
    if (i > 0) plc.step(prevT, dt);
    prevT = step.t;
    for (const [ref, expected] of Object.entries(step.expect ?? {})) {
      let actual: unknown;
      try {
        actual = plc.read(ref);
      } catch (e) {
        throw new GoldenError(
          `${at}: đọc ${ref} thất bại: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      if (!expectMatches(actual, expected)) {
        throw new GoldenError(
          `${at}: ${ref} mong đợi ${fmt(expected)} nhưng thực tế ${fmt(actual)}`,
        );
      }
    }
    const delta: string[] = [];
    for (const f of plc.getDiagnostics().faults) {
      const prev = faultCounts.get(f.code) ?? 0;
      if (f.count > prev) delta.push(f.code);
      faultCounts.set(f.code, f.count);
    }
    const want = [...(step.faults ?? [])].sort();
    const got = [...delta].sort();
    if (JSON.stringify(want) !== JSON.stringify(got)) {
      throw new GoldenError(
        `${at}: faults mong đợi [${want.join(', ')}] nhưng thực tế [${got.join(', ')}]`,
      );
    }
    if (step.snapshot === true) saved = plc.snapshot();
  }
  return { id: golden.id, steps: golden.steps.length, scans: plc.getDiagnostics().scanCount };
}
