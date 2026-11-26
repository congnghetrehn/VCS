// Bench vòng kín — M2 §12 (P2.4, OQ-314). Chạy: `pnpm bench` (bước thứ 5,
// sau plant). Ngưỡng (không hạ): 1 SoftPlc × OB1 gọi FB_Motor 200× + 200
// motor_dol (params mặc định), bước 10 ms, plcScanMs 10, ≥ 1000 bước/s;
// heap chỉ in (không ngưỡng). Đo có warm-up, lấy trung vị. In thêm phần
// tách plant/PLC/còn lại (ms/bước) để biết phần nào chiếm ngân sách (bằng
// chứng cho điểm quyết định tier C nếu < 1000). Kết quả hợp nhất vào
// `bench/results.json` (file sinh tự động, không commit — baseline ở P0.7).
// Exit ≠ 0 khi FAIL (CI bench job chạy script này).
//
// Cấu hình (OQ-314): mỗi FB nhận input riêng iRunFb := %I của motor thứ k
// (RUN_FB_k), iStart/iStopOk/iOverloadOk/iPermissive/iReset chung từ virtual
// input (%I0.0/%I0.1/%I0.2/%I0.3/%I0.5); qRun → RUN_CMD_k (%Q), qFault → %M.
// Vòng kín qua runCmd/runFb; OVL_OK_k (plant) không nối vào PLC (iOverloadOk
// chung) — bench đo hiệu năng, không kiểm chức năng overload.
// Phần tách: plant = engine.step trực tiếp, PLC = component PLC1 .step trực
// tiếp (cùng T tiếp nối từ sim hiện tại), còn lại = tổng − plant − PLC
// (flush + chi phí orchestrator: beforeExternals/drain/finishStep/clock).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation, isIntrospectable, type SimulationProject } from '@vcs/kernel';
import { softPlcExtension, type SoftPlc } from '@vcs/runtime-iec';
import {
  createTagCatalog,
  type EquipmentInstance,
  type ProjectConfig,
  type TagDef,
} from '@vcs/schemas';
import { plantExtension, type PlantEngine } from '@vcs/plant';
import { compileProject } from '@vcs/vendor-siemens';

// ROOT: bundle chạy từ bench/dist/ (D-008 B) — import.meta.url cho bench/
// thay vì gốc repo; ưu tiên env VCS_REPO_ROOT do runner truyền (OQ-325),
// fallback import.meta.url để chạy trực tiếp bằng tsx vẫn đúng.
const ROOT =
  process.env.VCS_REPO_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'bench', 'results.json');
const FB_MOTOR_SCL = join(ROOT, 'examples', 'motor-interlock', 'plc', 'FB_Motor.scl');

const N_MOTORS = 200;
const STEP_MS = 10;
const PLC_SCAN_MS = 10;
const THRESHOLD_STEPS_PER_SEC = 1000;
const WARMUP_STEPS = 200;
const SAMPLE_STEPS = 2000;
const SAMPLES = 5;
const HEAP_STEPS = 2000;

/** Virtual input chung: [tên tag, địa chỉ, giá trị]. */
const SHARED_INPUTS: Array<{ name: string; address: string; value: boolean }> = [
  { name: 'START_PB', address: '%I0.0', value: true },
  { name: 'STOP_OK', address: '%I0.1', value: true },
  { name: 'OVL_OK', address: '%I0.2', value: true },
  { name: 'PERM', address: '%I0.3', value: true },
  { name: 'RESET_PB', address: '%I0.5', value: false },
];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

function gcOrThrow(): () => void {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc === undefined) {
    throw new Error('bench cần --expose-gc (script "bench" đã đặt NODE_OPTIONS).');
  }
  return gc;
}

/** Program bench: FB_Motor §13 + 200 DB + OB1 gọi cả 200 (mirror softplc.bench.ts). */
function buildBenchProgram(): { program: ReturnType<typeof compileProject>['program'] } {
  const fbMotor = readFileSync(FB_MOTOR_SCL, 'utf8');
  const dbs: string[] = [];
  const calls: string[] = [];
  for (let k = 0; k < N_MOTORS; k++) {
    const id = `M${String(k + 1).padStart(3, '0')}`;
    dbs.push(`DATA_BLOCK "DB_Motor_${id}" "FB_Motor"\nBEGIN\nEND_DATA_BLOCK\n`);
    const fbByte = 1 + Math.floor(k / 8);
    const fbBit = k % 8;
    const cmdByte = Math.floor(k / 8);
    const cmdBit = k % 8;
    const faultByte = Math.floor((200 + k) / 8);
    const faultBit = (200 + k) % 8;
    calls.push(
      `  "DB_Motor_${id}"(iStart := %I0.0, iStopOk := %I0.1, iOverloadOk := %I0.2, iPermissive := %I0.3, iRunFb := %I${String(fbByte)}.${String(fbBit)}, iReset := %I0.5);`,
      `  %Q${String(cmdByte)}.${String(cmdBit)} := "DB_Motor_${id}".qRun;`,
      `  %M${String(faultByte)}.${String(faultBit)} := "DB_Motor_${id}".qFault;`,
    );
  }
  const ob1 = ['ORGANIZATION_BLOCK "Main"', 'BEGIN', ...calls, 'END_ORGANIZATION_BLOCK', ''].join(
    '\n',
  );
  const { program, diagnostics } = compileProject(
    [
      // Thứ tự tên file quyết định thứ tự biên dịch (OQ-202): FB trước,
      // DB sau, OB cuối — DBs.scl sort trước FB_Motor.scl sẽ T001.
      { path: '00_FB_Motor.scl', text: fbMotor },
      { path: '01_DBs.scl', text: dbs.join('\n') },
      { path: '02_OB1.scl', text: ob1 },
    ],
    { tags: [] },
  );
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    throw new Error(
      `bench closedloop: program bench biên dịch lỗi: ${errors.map((d) => `${d.code} ${d.message}`).join('; ')}`,
    );
  }
  return { program };
}

function buildProject(): SimulationProject {
  const tags: TagDef[] = [];
  for (const input of SHARED_INPUTS) {
    tags.push({
      name: input.name,
      type: 'Bool',
      area: 'I',
      address: input.address,
      controller: 'PLC1',
      signal: { kind: 'DI' },
    });
  }
  const equipment: EquipmentInstance[] = [];
  for (let k = 0; k < N_MOTORS; k++) {
    const id = `M${String(k + 1).padStart(3, '0')}`;
    const fbByte = 1 + Math.floor(k / 8);
    const fbBit = k % 8;
    const cmdByte = Math.floor(k / 8);
    const cmdBit = k % 8;
    const ovlByte = 26 + Math.floor(k / 8);
    const ovlBit = k % 8;
    tags.push(
      {
        name: `${id}_RUN_CMD`,
        type: 'Bool',
        area: 'Q',
        address: `%Q${String(cmdByte)}.${String(cmdBit)}`,
        controller: 'PLC1',
        signal: { kind: 'DO' },
      },
      {
        name: `${id}_RUN_FB`,
        type: 'Bool',
        area: 'I',
        address: `%I${String(fbByte)}.${String(fbBit)}`,
        controller: 'PLC1',
        signal: { kind: 'DI' },
      },
      {
        name: `${id}_OVL_OK`,
        type: 'Bool',
        area: 'I',
        address: `%I${String(ovlByte)}.${String(ovlBit)}`,
        controller: 'PLC1',
        signal: { kind: 'DI' },
      },
    );
    equipment.push({
      id,
      model: 'motor_dol',
      signals: {
        runCmd: `${id}_RUN_CMD`,
        runFb: `${id}_RUN_FB`,
        overloadOk: `${id}_OVL_OK`,
      },
    });
  }
  const config: ProjectConfig = {
    schemaVersion: 1,
    name: 'Closed-loop bench',
    language: 'vi',
    seed: 42,
    simulation: { stepMs: STEP_MS, plcScanMs: PLC_SCAN_MS, timeScale: 1 },
    files: {
      tags: 'tags/tags.yaml',
      comms: 'comms/comms.yaml',
      hmi: 'hmi/',
      plant: 'plant/equipment.yaml',
    },
    controllers: [
      {
        id: 'PLC1',
        mode: 'builtin',
        vendor: 'siemens',
        model: 'S7-1200',
        config: { scanPeriodMs: PLC_SCAN_MS },
      },
    ],
  };
  return { config, tags, catalog: createTagCatalog(tags), diagnostics: [], plant: equipment };
}

async function main(): Promise<void> {
  const { program } = buildBenchProgram();
  const bundle = await createSimulation(buildProject(), {
    extensions: [softPlcExtension(program), plantExtension()],
  });
  const { sim } = bundle;
  // PLC ở STOP sau init — phải start như CLI/server làm (startPlcControllers,
  // apps/server/src/plc.ts); không start thì step() là no-op và bench đo nhầm
  // (lần chạy đầu không start: 6.355 bước/s chỉ là plant + overhead).
  for (const c of bundle.controllers) {
    if (isIntrospectable(c)) c.start();
  }
  // Cast về kiểu cụ thể: SimComponent.step trả StepResult (void | Promise)
  // nên gọi trực tiếp bị lint no-floating-promises; hai component này đồng bộ
  // (stepOnce cũng ném SIM-E002 nếu component trả Promise).
  const engine = sim.getComponent('plant') as PlantEngine | undefined;
  const plc = sim.getComponent('PLC1') as SoftPlc | undefined;
  if (engine === undefined || plc === undefined) {
    throw new Error('bench closedloop: thiếu component plant hoặc PLC1.');
  }

  // Virtual input chung qua post() (drain đầu bước 0); START_PB=1 tạo cạnh
  // lên cho R_TRIG của FB_Motor, motor chốt RUNNING và giữ (không cần nhả).
  // post nhận ExternalCommand { label, run } — shape { name, value, source }
  // KHÔNG tồn tại: run() thiếu → drainInbox bắt lỗi thành diagnostic im lặng,
  // input không bao giờ được set (bẫy gặp ở lần chạy đầu: đo nhầm motor
  // STOPPED 1.319 bước/s).
  for (const input of SHARED_INPUTS) {
    const handle = sim.tags.handle(input.name);
    if (handle === undefined) {
      throw new Error(`bench closedloop: tag ${input.name} không tồn tại.`);
    }
    sim.post({
      label: `bench closedloop set ${input.name}`,
      run: (ctx) => {
        ctx.tags.set(handle, input.value, 'system');
      },
    });
  }

  // Warm-up: 200 bước (JIT + motor qua startDelayMs 500 ms → RUNNING).
  sim.runSteps(WARMUP_STEPS);

  // Vòng kín phải thật: sau warm-up M001 đã RUNNING và RUN_CMD đã lên 1.
  // Không có assertion này, bench đo nhầm trạng thái STOPPED mà vẫn in PASS.
  if (sim.tags.read('M001_RUN_CMD').value !== true) {
    throw new Error('bench closedloop: M001_RUN_CMD chưa lên 1 sau warm-up — vòng kín chưa đóng.');
  }
  if (engine.getObservable('M001', 'state') !== 'RUNNING') {
    throw new Error(
      `bench closedloop: M001 chưa RUNNING sau warm-up (state=${String(engine.getObservable('M001', 'state'))}) — vòng kín chưa đóng.`,
    );
  }

  const samples: number[] = [];
  for (let r = 0; r < SAMPLES; r++) {
    const t0 = performance.now();
    sim.runSteps(SAMPLE_STEPS);
    samples.push(SAMPLE_STEPS / ((performance.now() - t0) / 1000));
  }
  const stepsPerSec = median(samples);
  const pass = stepsPerSec >= THRESHOLD_STEPS_PER_SEC;
  const totalMsPerStep = 1000 / stepsPerSec;

  // Heap: chỉ in, không ngưỡng (OQ-314). Chạy TRƯỚC vòng tách — vòng tách
  // gọi step() trực tiếp lên component, đẩy đồng hồ nội bộ của PLC/engine
  // vượt đồng hồ sim; runSteps sau đó sẽ lỗi "simTimeMs đi ngược".
  const gc = gcOrThrow();
  gc();
  const before = process.memoryUsage().heapUsed;
  sim.runSteps(HEAP_STEPS);
  gc();
  const heapMB = (process.memoryUsage().heapUsed - before) / (1024 * 1024);

  // Phần tách (cùng sim, trạng thái ổn định RUNNING; mỗi vòng đo T tiếp nối
  // từ thời gian hiện tại của sim — bước kế của orchestrator — tăng 10 ms).
  // Chạy cuối cùng: sau đó không còn runSteps nào nữa.
  const baseT = sim.simTimeMs;
  let t = baseT;
  let t0 = performance.now();
  for (let i = 0; i < SAMPLE_STEPS; i++) {
    engine.step(t, STEP_MS);
    t += STEP_MS;
  }
  const plantMsPerStep = (performance.now() - t0) / SAMPLE_STEPS;

  t = baseT;
  t0 = performance.now();
  for (let i = 0; i < SAMPLE_STEPS; i++) {
    plc.step(t, STEP_MS);
    t += STEP_MS;
  }
  const plcMsPerStep = (performance.now() - t0) / SAMPLE_STEPS;

  const restMsPerStep = totalMsPerStep - plantMsPerStep - plcMsPerStep;

  console.log(
    'bench closedloop (M2 §12) — 1 SoftPlc × FB_Motor §13 200× + 200 motor_dol, bước 10 ms, trung vị:',
  );
  console.log(
    `  steps: ${Math.round(stepsPerSec).toLocaleString('en-US')} bước/s ` +
      `(ngưỡng ≥ ${THRESHOLD_STEPS_PER_SEC.toLocaleString('en-US')}) ${pass ? 'PASS' : 'FAIL'}`,
  );
  console.log(
    `  tách: plant ${plantMsPerStep.toFixed(3)} ms/bước, ` +
      `PLC ${plcMsPerStep.toFixed(3)} ms/bước, ` +
      `còn lại (flush + orchestrator) ${restMsPerStep.toFixed(3)} ms/bước, ` +
      `tổng ${totalMsPerStep.toFixed(3)} ms/bước`,
  );
  console.log(`  heap: +${heapMB.toFixed(2)} MB / ${HEAP_STEPS.toLocaleString('en-US')} bước (chỉ in, không ngưỡng)`);

  let prev: Record<string, unknown> = {};
  if (existsSync(OUT)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(OUT, 'utf8'));
      if (typeof parsed === 'object' && parsed !== null) prev = parsed as Record<string, unknown>;
    } catch {
      prev = {};
    }
  }
  const merged = {
    ...prev,
    thresholds: {
      ...((prev['thresholds'] as Record<string, unknown> | undefined) ?? {}),
      closedLoopStepsPerSec: THRESHOLD_STEPS_PER_SEC,
    },
    results: {
      ...((prev['results'] as Record<string, unknown> | undefined) ?? {}),
      closedLoopStepsPerSec: Math.round(stepsPerSec),
      closedLoopPlantMsPerStep: Number(plantMsPerStep.toFixed(3)),
      closedLoopPlcMsPerStep: Number(plcMsPerStep.toFixed(3)),
      closedLoopOtherMsPerStep: Number(restMsPerStep.toFixed(3)),
      closedLoopHeapMB: Number(heapMB.toFixed(3)),
    },
    pass: {
      ...((prev['pass'] as Record<string, unknown> | undefined) ?? {}),
      closedLoop: pass,
    },
  };
  writeFileSync(OUT, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  if (!pass) {
    process.exitCode = 1;
  }
}

await main();
