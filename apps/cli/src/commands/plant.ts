// Lệnh `vcs plant run [dir]` — @vcs/cli (M2 §11.4, P2.4 commit 2, OQ-306/307/316).
// Chạy kịch bản vòng kín (plant + SoftPlc) qua runner scenario, hoặc smoke
// mode (không --scenario) như `vcs run`. Exit: 0 tất cả pass, 1 có expect
// fail, 2 không chạy được (project/scenario/plant lỗi), 3 sai tham số
// (mirror run/golden run).

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { createSimulation, TraceHasher, type TagChange } from '@vcs/kernel';
import {
  parseScenarioYaml,
  runScenario,
  validatePlantConfig,
  type PlantConfig,
  type PlantEngine,
  type Scenario,
} from '@vcs/plant';
import { loadProject, nodeFS, type ProjectModel } from '@vcs/project';
import { formatDiagnostic, hasErrors, parseDuration, type TagValue } from '@vcs/schemas';
import { loadPlcProgram, plcExtension, startPlcControllers, type PlcLoadResult } from '@vcs/server';
import { CLI_EXTENSIONS } from '../extensions.js';

export interface PlantRunOptions {
  scenario?: string[];
  until?: string;
  steps?: string;
  stepMs?: string;
  plcScanMs?: string;
  watch?: string;
  csv?: string;
  hash?: boolean;
  json?: boolean;
}

interface ParsedPlantOptions {
  scenarios: string[];
  until?: number;
  steps?: number;
  stepMs?: number;
  plcScanMs?: number;
  watch?: string;
  csv?: string;
  hash?: boolean;
  json?: boolean;
}

/** Sai tham số → in lỗi + trả `undefined` (caller exit 3). */
function parsePlantOptions(opts?: PlantRunOptions): ParsedPlantOptions | undefined {
  const o: PlantRunOptions = opts ?? {};
  const out: ParsedPlantOptions = { scenarios: o.scenario ?? [] };
  if (o.steps !== undefined && o.until !== undefined) {
    console.error('vcs plant run: chỉ cho một trong --steps và --until');
    return undefined;
  }
  if (o.steps === undefined && o.until === undefined && out.scenarios.length === 0) {
    // OQ-027: smoke mode không --steps/--until → exit 3, không mặc định ngầm.
    console.error('vcs plant run: thiếu --steps N hoặc --until <duration> (vd --until 5s)');
    return undefined;
  }
  if (o.steps !== undefined) {
    if (!/^\d+$/.test(o.steps)) {
      console.error(`vcs plant run: --steps phải là số nguyên ≥ 0, nhận '${o.steps}'`);
      return undefined;
    }
    out.steps = Number.parseInt(o.steps, 10);
  }
  if (o.until !== undefined) {
    try {
      out.until = parseDuration(o.until);
    } catch {
      console.error(`vcs plant run: --until không hợp lệ: '${o.until}' (vd 5s, 1m30s)`);
      return undefined;
    }
  }
  if (o.stepMs !== undefined) {
    if (!/^\d+$/.test(o.stepMs) || Number.parseInt(o.stepMs, 10) < 1) {
      console.error(`vcs plant run: --step-ms phải là số nguyên ≥ 1, nhận '${o.stepMs}'`);
      return undefined;
    }
    out.stepMs = Number.parseInt(o.stepMs, 10);
  }
  if (o.plcScanMs !== undefined) {
    if (!/^\d+$/.test(o.plcScanMs) || Number.parseInt(o.plcScanMs, 10) < 1) {
      console.error(`vcs plant run: --plc-scan-ms phải là số nguyên ≥ 1, nhận '${o.plcScanMs}'`);
      return undefined;
    }
    out.plcScanMs = Number.parseInt(o.plcScanMs, 10);
  }
  if (o.watch !== undefined) out.watch = o.watch;
  if (o.csv !== undefined) out.csv = o.csv;
  if (o.hash === true) out.hash = true;
  if (o.json === true) out.json = true;
  return out;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Tag cần in: `--watch` (tên phải tồn tại) hoặc toàn bộ tag I/Q. */
function selectTags(
  bundle: Awaited<ReturnType<typeof createSimulation>>,
  watch: string | undefined,
): string[] | undefined {
  if (watch === undefined) return [...bundle.sim.tags.names()];
  const names = watch
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n !== '');
  for (const name of names) {
    if (!bundle.sim.tags.has(name)) {
      console.error(`vcs plant run: --watch: tag '${name}' không tồn tại trong dự án`);
      return undefined;
    }
  }
  return names;
}

function formatTagValue(v: TagValue): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number' && Number.isNaN(v)) return 'NaN';
  return String(v);
}

function csvValue(v: TagValue): string {
  const text = formatTagValue(v);
  return text.includes(',') || text.includes('"') || text.includes('\n')
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

/** Header `T,name,oldValue,newValue,source,writes`, một dòng mỗi TagChange (OQ-027). */
async function writeCsv(path: string, rows: readonly TagChange[]): Promise<void> {
  const lines = ['T,name,oldValue,newValue,source,writes'];
  for (const c of rows) {
    lines.push(
      [
        String(c.ts),
        c.name,
        csvValue(c.oldValue),
        csvValue(c.newValue),
        c.source,
        String(c.writes),
      ].join(','),
    );
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${lines.join('\n')}\n`, 'utf8');
}

interface BuiltSim {
  bundle: Awaited<ReturnType<typeof createSimulation>>;
  engine: PlantEngine;
}

/**
 * Dựng sim mới với stepMs/plcScanMs hiệu lực (OQ-307). `overridePlcScan`
 * true (cờ CLI hoặc scenario khai plcScanMs) → ghi đè cả
 * `config.scanPeriodMs` của từng controller def — nếu không, SoftPlc vẫn
 * scan theo def (vd 100 ms) dù project plcScanMs đã đổi, demo A–D sai
 * mốc. Trước mỗi lần dựng, khôi phục def về giá trị gốc (xem
 * `origScanPeriod`) để scenario sau không bị dính override của scenario
 * trước. Ném Error khi không dựng được (plantExtension fail-fast OQ-313
 * hoặc project không có plant).
 */
async function buildSim(
  model: ProjectModel,
  plc: PlcLoadResult | null,
  stepMs: number,
  plcScanMs: number,
  overridePlcScan: boolean,
  origScanPeriod: readonly (number | undefined)[],
): Promise<BuiltSim> {
  model.config.simulation.stepMs = stepMs;
  model.config.simulation.plcScanMs = plcScanMs;
  model.config.controllers.forEach((def, i) => {
    const orig = origScanPeriod[i];
    if (orig === undefined) delete def.config['scanPeriodMs'];
    else def.config['scanPeriodMs'] = orig;
    if (overridePlcScan) def.config['scanPeriodMs'] = plcScanMs;
  });
  const bundle = await createSimulation(model, {
    extensions: plc !== null ? [...CLI_EXTENSIONS, plcExtension(plc.program)] : [...CLI_EXTENSIONS],
  });
  for (const d of bundle.diagnostics) console.log(formatDiagnostic(d));
  startPlcControllers(bundle);
  const engine = bundle.sim.getComponent('plant') as PlantEngine | undefined;
  if (engine === undefined) {
    throw new Error('vcs plant run: project không có plant (thêm plant/equipment.yaml rồi chạy lại).');
  }
  return { bundle, engine };
}

/** Cảnh báo PL-W001 khi timing vi phạm §5.1 (vẫn chạy). */
function warnTiming(stepMs: number, plcScanMs: number): void {
  if (stepMs > plcScanMs) {
    console.error(
      `cảnh báo PL-W001: stepMs ${String(stepMs)} > plcScanMs ${String(plcScanMs)} (M2 §5.1: stepMs ≤ plcScanMs) — vẫn chạy.`,
    );
  } else if (plcScanMs % stepMs !== 0) {
    console.error(
      `cảnh báo PL-W001: plcScanMs ${String(plcScanMs)} không phải bội của stepMs ${String(stepMs)} (M2 §5.1) — vẫn chạy.`,
    );
  }
}

export async function plantRunCommand(dir: string | undefined, opts?: PlantRunOptions): Promise<number> {
  if (dir === undefined || dir === '') {
    console.error('vcs plant run: thiếu [dir] — dùng: vcs plant run <dir> [--scenario <file> ...]');
    return 3;
  }
  if (!(await isDirectory(dir))) {
    console.error(`vcs plant run: không tìm thấy thư mục '${dir}'`);
    return 3;
  }
  const parsed = parsePlantOptions(opts);
  if (parsed === undefined) return 3;
  const model = await loadProject(nodeFS(dir));
  if (hasErrors(model.diagnostics)) {
    for (const d of model.diagnostics) console.log(formatDiagnostic(d));
    return 2;
  }
  // P1.7: project có plc/ → nạp SoftPlc (OQ-217: lỗi biên dịch → exit 2).
  const plc = await loadPlcProgram(dir, model.catalog.all());
  if (plc !== null && hasErrors(plc.diagnostics)) {
    for (const d of plc.diagnostics) console.log(formatDiagnostic(d));
    return 2;
  }
  // scanPeriodMs gốc của từng controller def (khôi phục trước mỗi lần dựng).
  const origScanPeriod = model.config.controllers.map((def) => {
    const v = def.config['scanPeriodMs'];
    return typeof v === 'number' ? v : undefined;
  });

  if (parsed.scenarios.length === 0) {
    return plantSmoke(model, plc, parsed, origScanPeriod);
  }

  const results: { file: string; passed: boolean; failures: { at: number; key: string; expected: string; actual: string }[] }[] = [];
  let lastSimTimeMs = 0;
  let lastStepCount = 0;
  let lastHash = '';
  for (const file of parsed.scenarios) {
    let scenario: Scenario;
    try {
      const text = await readFile(file, 'utf8');
      scenario = parseScenarioYaml(text, basename(file));
    } catch (err) {
      console.error(`vcs plant run: scenario '${file}' — ${err instanceof Error ? err.message : String(err)}`);
      return 2;
    }
    // Override: cờ CLI > scenario.simulation > project config (OQ-307).
    const stepMs = parsed.stepMs ?? scenario.simulation?.stepMs ?? model.config.simulation.stepMs;
    const plcScanMs = parsed.plcScanMs ?? scenario.simulation?.plcScanMs ?? model.config.simulation.plcScanMs;
    const overridePlcScan = parsed.plcScanMs !== undefined || scenario.simulation?.plcScanMs !== undefined;
    warnTiming(stepMs, plcScanMs);
    const untilMs =
      parsed.until ?? (parsed.steps !== undefined ? parsed.steps * stepMs : undefined);
    let built: BuiltSim;
    try {
      built = await buildSim(model, plc, stepMs, plcScanMs, overridePlcScan, origScanPeriod);
    } catch (err) {
      console.error(`vcs plant run: ${err instanceof Error ? err.message : String(err)}`);
      return 2;
    }
    const { bundle, engine } = built;
    const hasher = new TraceHasher(bundle.sim.tags);
    let result;
    try {
      result = runScenario(bundle.sim, engine, scenario, {
        ...(untilMs !== undefined ? { untilMs } : {}),
        hasher,
      });
    } catch (err) {
      console.error(`vcs plant run: scenario '${file}' — ${err instanceof Error ? err.message : String(err)}`);
      return 2;
    }
    const name = scenario.name ?? basename(file);
    if (parsed.json !== true) {
      if (result.passed) {
        console.log(`PASS ${name} (${String(result.stepCount)} bước, hash ${result.hash.slice(0, 12)})`);
      } else {
        console.log(`FAIL ${name} (${String(result.failures.length)} expects sai)`);
        for (const f of result.failures) {
          console.log(`  T=${String(f.at)} ${f.key}: kỳ vọng ${f.expected}, thực tế ${f.actual}`);
        }
      }
    }
    results.push({ file, passed: result.passed, failures: result.failures });
    lastSimTimeMs = bundle.sim.simTimeMs;
    lastStepCount = result.stepCount;
    lastHash = result.hash;
  }

  const failed = results.filter((r) => !r.passed).length;
  if (parsed.json === true) {
    console.log(
      JSON.stringify(
        {
          name: model.config.name,
          // Nhiều scenario: simTimeMs/stepCount/hash là của scenario cuối.
          simTimeMs: lastSimTimeMs,
          stepCount: lastStepCount,
          hash: lastHash,
          scenarios: results.map((r) => ({ file: r.file, passed: r.passed, failures: r.failures })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `plant: ${String(results.length - failed)} passed, ${String(failed)} failed, ${String(results.length)} scenarios`,
    );
  }
  return failed > 0 ? 1 : 0;
}

/** Smoke mode (OQ-316): không --scenario — chạy tới --until/--steps như `vcs run`. */
async function plantSmoke(
  model: ProjectModel,
  plc: PlcLoadResult | null,
  parsed: ParsedPlantOptions,
  origScanPeriod: readonly (number | undefined)[],
): Promise<number> {
  const stepMs = parsed.stepMs ?? model.config.simulation.stepMs;
  const plcScanMs = parsed.plcScanMs ?? model.config.simulation.plcScanMs;
  const overridePlcScan = parsed.plcScanMs !== undefined;
  warnTiming(stepMs, plcScanMs);
  let built: BuiltSim;
  try {
    built = await buildSim(model, plc, stepMs, plcScanMs, overridePlcScan, origScanPeriod);
  } catch (err) {
    console.error(`vcs plant run: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
  const { bundle } = built;
  const hasher = new TraceHasher(bundle.sim.tags);
  const csvRows: TagChange[] = [];
  if (parsed.csv !== undefined) {
    bundle.sim.tags.subscribe('*', (batch) => {
      csvRows.push(...batch);
    });
  }
  if (parsed.steps !== undefined) {
    bundle.sim.runSteps(parsed.steps);
  } else {
    bundle.sim.runUntil(parsed.until as number);
  }
  const hash = hasher.hash();
  if (parsed.csv !== undefined) {
    await writeCsv(parsed.csv, csvRows);
  }
  const selected = selectTags(bundle, parsed.watch);
  if (selected === undefined) return 3;
  if (parsed.json === true) {
    const tags: Record<string, TagValue> = {};
    for (const name of selected) tags[name] = bundle.sim.tags.read(name).value;
    console.log(
      JSON.stringify(
        {
          name: model.config.name,
          simTimeMs: bundle.sim.simTimeMs,
          stepCount: bundle.sim.stepCount,
          ...(parsed.hash === true ? { hash } : {}),
          scenarios: [],
          tags,
        },
        null,
        2,
      ),
    );
  } else {
    if (selected.length <= 50) {
      for (const name of selected) {
        console.log(`${name} = ${formatTagValue(bundle.sim.tags.read(name).value)}`);
      }
    } else {
      console.log(
        `${String(selected.length)} tags — dùng --watch TAG,... để xem giá trị (mặc định chỉ in khi ≤ 50 tag).`,
      );
    }
    if (parsed.hash === true) console.log(`hash: ${hash}`);
  }
  return 0;
}

export interface PlantValidateOptions {
  json?: boolean;
}

/**
 * Dựng PlantConfig từ ProjectModel đã nạp (seed ở config gốc, stepMs/
 * plcScanMs ở config.simulation — mirror plantExtension). Trả undefined
 * khi project không có file plant (plant là opt-in).
 */
export function buildPlantConfig(model: ProjectModel): PlantConfig | undefined {
  if (model.plant === undefined) return undefined;
  return {
    stepMs: model.config.simulation.stepMs,
    seed: model.config.seed,
    equipment: model.plant,
    tags: new Map(model.tags.map((t) => [t.name, t])),
    // plcScanMs sau transform luôn có (mặc định = stepMs, project.ts:59).
    plcScanMs: model.config.simulation.plcScanMs,
  };
}

/** Lệnh `vcs plant validate [dir] [--json]` (M2 §10, P2.7 commit 5, OQ-376).
 *  Chỉ kiểm tra cấu hình plant bằng `validatePlantConfig` (không chạy).
 *  Exit: 0 ok (warning vẫn 0), 2 có error / không project / không plant,
 *  3 sai tham số. */
export async function plantValidateCommand(
  dir: string | undefined,
  opts?: PlantValidateOptions,
): Promise<number> {
  if (dir === undefined || dir === '') {
    console.error('vcs plant validate: thiếu [dir] — dùng: vcs plant validate <dir> [--json]');
    return 3;
  }
  if (!(await isDirectory(dir))) {
    console.error(`vcs plant validate: không tìm thấy thư mục '${dir}'`);
    return 3;
  }
  const model = await loadProject(nodeFS(dir));
  if (hasErrors(model.diagnostics)) {
    for (const d of model.diagnostics) console.log(formatDiagnostic(d));
    return 2;
  }
  const cfg = buildPlantConfig(model);
  if (cfg === undefined) {
    console.error('vcs plant validate: project không có plant (thêm plant/equipment.yaml rồi chạy lại).');
    return 2;
  }
  const diagnostics = validatePlantConfig(cfg, cfg.tags);
  if (opts?.json === true) {
    console.log(
      JSON.stringify(
        {
          name: model.config.name,
          valid: !hasErrors(diagnostics),
          equipment: cfg.equipment.length,
          tags: cfg.tags.size,
          diagnostics,
        },
        null,
        2,
      ),
    );
  } else {
    for (const d of model.diagnostics) console.log(formatDiagnostic(d));
    for (const d of diagnostics) console.log(formatDiagnostic(d));
    if (!hasErrors(diagnostics)) {
      console.log(
        `OK: ${model.config.name} — ${String(cfg.equipment.length)} thiết bị, ${String(cfg.tags.size)} tags`,
      );
    }
  }
  return hasErrors(diagnostics) ? 2 : 0;
}
