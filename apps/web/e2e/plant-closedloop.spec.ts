// E2E parity UI ↔ CLI cho demo A–D (P2.4 commit 11, OQ-308/318).
// Suite tự spawn server motor-interlock ở 4171 (bản sao tạm với stepMs 10,
// xem ghi chú temp-copy) — webServer của suite vẫn phục vụ hello-tags ở 4170.
// Lái bằng tay qua UI thật: toggle TagTable cho `set`, PlantFaultPanel cho
// fault/preset/clear; bước theo lô qua WS `sim.command step` (test-owned);
// đợi mốc bằng step-count (không sleep wall-clock).
//
// VỀ HASH — phát hiện khi viết test này (probe apps/cli/src/probe-parity.mts,
// đã xóa sau khi đo; kết quả ghi ở STATE §27 "Lệch"):
// hash UI ≠ hash CLI cho cùng scenario, DÙ multiset (ts, handle, value) giống
// hệt cả 4 scenario (vd A: cùng 19 event). Nguyên nhân: TagDB.flush() gộp
// mọi thay đổi trong bước theo handle tăng dần — runner post set trước bước
// nên flush cuối bước T=0 ra [STOP_OK(h1), OVL_OK(h2), PERM(h3)]; UI tag.write
// khi paused flush ngay từng write nên ra [STOP_OK, PERM, OVL_OK]. Hasher
// băm theo thứ tự nhận nên khác. Không thể xen kẽ qua UI (sau bước, clock đã
// sang T+10; set muộn sẽ đóng dấu T+10). Đây là khác biệt nhóm flush, không
// phải khác ngữ nghĩa — nên test này assert parity NGỮ NGHĨA: mọi expects
// của scenario tại mọi mốc (tags qua TagTable + observables qua /api/plant),
// stepCount cuối, CLI hash == golden commit 2, và UI hash tất định khi chạy
// lại (test A reset + lái lại).
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { expect, test, type Page } from '@playwright/test';

const execFileAsync = promisify(execFile);

const PORT = 4171;
const BASE = `http://127.0.0.1:${String(PORT)}`;
const ROOT = process.cwd();
const MOTOR = join(ROOT, 'examples', 'motor-interlock');
const SCEN_DIR = join(MOTOR, 'scenarios');
const SCEN = {
  A: join(SCEN_DIR, 'a-normal-overload.yaml'),
  B: join(SCEN_DIR, 'b-no-feedback.yaml'),
  C: join(SCEN_DIR, 'c-local-mode.yaml'),
  D: join(SCEN_DIR, 'd-contactor-stuck.yaml'),
} as const;

// Hash CLI demo A–D tại commit 2 (TC-2: lệch là regression hành vi, STOP).
const GOLDEN_HASH: Record<string, string> = {
  A: 'ce95b887b29f02be96db65dd6486d2557f605a38c1fe0aa04587004892bb4b54',
  B: 'f3c6a4ee470ec362bcadd0d0c8b6344a1e064b18b5d77bed3fe093671882a07e',
  C: 'f3c6a4ee470ec362bcadd0d0c8b6344a1e064b18b5d77bed3fe093671882a07e',
  D: '7d337ac0880bde7205941698ef8e4a08df7ea52b7eb776e013873e2a6180747c',
};
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

interface ScenarioStep {
  at: number;
  set?: Record<string, boolean>;
  fault?: { target: { equipment: string; fault: string } };
  preset?: { equipment: string; preset: string };
  clear?: string;
}
interface ScenarioExpect {
  at: number;
  tags?: Record<string, boolean>;
  observables?: Record<string, Record<string, string>>;
}
interface ScenarioDoc {
  name?: string;
  steps?: ScenarioStep[];
  expects?: ScenarioExpect[];
}

interface PlantFaultView {
  id: string;
  target: unknown;
  state: string;
}
interface PlantBody {
  equipment: Array<{
    id: string;
    faults: PlantFaultView[];
    observables: Record<string, unknown>;
  }>;
}

let server: ChildProcess | undefined;
let tmpDir = '';

async function waitForHealth(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // Chưa lên — thử lại.
    }
    if (Date.now() - start > timeoutMs) throw new Error('server motor-interlock (temp copy) không lên');
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function cliHash(scenFile: string): Promise<{ hash: string; stepCount: number }> {
  const { stdout } = await execFileAsync(
    'pnpm',
    ['vcs', 'plant', 'run', MOTOR, '--scenario', scenFile, '--json'],
    { cwd: ROOT, timeout: 60_000 },
  );
  // `pnpm vcs` in thêm banner `> vcs@0.1.0 …` lên stdout trước JSON — cắt
  // từ khối JSON cuối (pretty-print, bắt đầu bằng `{\n`).
  const jsonStart = stdout.lastIndexOf('\n{\n');
  const jsonText = jsonStart >= 0 ? stdout.slice(jsonStart + 1) : stdout;
  const body = JSON.parse(jsonText) as { hash: string; stepCount: number };
  return body;
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  // Bản sao tạm của motor-interlock với lưới 10 ms (tier B, OQ-308): file gốc
  // là stepMs 100 (mặc định demo M1; run-plc.test.ts ghim stepMs 100 = scan
  // 100) còn scenario khai 10 ms — hash parity cần cùng lưới. CLI chạy trên
  // thư mục GỐC (scenario khai 10 ms → CLI 10 ms).
  tmpDir = await mkdtemp(join(tmpdir(), 'vcs-plant-e2e-'));
  await cp(MOTOR, tmpDir, { recursive: true });
  const projFile = join(tmpDir, 'vcs.project.yaml');
  const proj = await readFile(projFile, 'utf8');
  const patched = proj
    .replace('simulation: { stepMs: 100, plcScanMs: 100 }', 'simulation: { stepMs: 10, plcScanMs: 10 }')
    .replace('scanPeriodMs: 100', 'scanPeriodMs: 10');
  if (!patched.includes('stepMs: 10') || !patched.includes('scanPeriodMs: 10')) {
    throw new Error('patch vcs.project.yaml (temp copy) thất bại — chuỗi gốc đã đổi?');
  }
  await writeFile(projFile, patched, 'utf8');

  server = spawn('pnpm', ['vcs', 'serve', tmpDir, '--port', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
  await waitForHealth();

  // CLI hash cho từng scenario (1 lần/scenario) + kiểm golden commit 2.
  for (const [key, file] of Object.entries(SCEN)) {
    const { hash, stepCount } = await cliHash(file);
    expect(hash).toBe(GOLDEN_HASH[key]);
    expect(stepCount).toBeGreaterThan(0);
  }
});

test.afterAll(async () => {
  if (server !== undefined && server.pid !== undefined) {
    process.kill(-server.pid, 'SIGTERM');
    server = undefined;
  }
  if (tmpDir !== '') {
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = '';
  }
});

/** WS test-owned: hello rồi chờ welcome; trả về socket + hàm step. */
async function openWs(): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${String(PORT)}/ws`);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('WS không welcome'));
    }, 5000);
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data)) as { type?: string };
      if (msg.type === 'welcome') {
        clearTimeout(timer);
        resolve();
      }
    });
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'hello', protocolVersion: 1 }));
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('WS lỗi kết nối'));
    });
  });
  return ws;
}

async function getPlant(): Promise<PlantBody> {
  const res = await fetch(`${BASE}/api/plant`);
  if (!res.ok) throw new Error(`GET /api/plant → HTTP ${String(res.status)}`);
  return (await res.json()) as PlantBody;
}

async function getHash(): Promise<{ hash: string; simTimeMs: number; stepCount: number }> {
  const res = await fetch(`${BASE}/api/sim/hash`);
  if (!res.ok) throw new Error(`GET /api/sim/hash → HTTP ${String(res.status)}`);
  return (await res.json()) as { hash: string; simTimeMs: number; stepCount: number };
}

/** Giá trị Bool hiển thị: toggle (writable) hoặc value-text (chỉ đọc). */
async function getTagValue(page: Page, name: string): Promise<string> {
  const text = page.getByTestId(`value-text-${name}`);
  if ((await text.count()) > 0) return (await text.textContent())?.trim() ?? '';
  return (await page.getByTestId(`toggle-${name}`).textContent())?.trim() ?? '';
}

/** Ghi Bool qua toggle TagTable (tối đa 3 lần: đọc lại nếu lần bấm lệch do UI trễ). */
async function setTag(page: Page, name: string, value: boolean): Promise<void> {
  const want = value ? 'TRUE' : 'FALSE';
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await getTagValue(page, name)) === want) return;
    await page.getByTestId(`toggle-${name}`).click();
    try {
      await expect.poll(async () => getTagValue(page, name), { timeout: 3000 }).toBe(want);
      return;
    } catch {
      // Bấm lệch (giá trị đọc trước đó đã cũ) — đọc lại rồi bấm tiếp.
    }
  }
  throw new Error(`setTag ${name}=${want} thất bại sau 3 lần`);
}

async function stepCountOf(page: Page): Promise<number> {
  return Number(await page.getByTestId('step-count').textContent());
}

/** Lái một scenario qua UI; trả stepCount cuối (để test assert). */
async function drive(page: Page, ws: WebSocket, scenFile: string): Promise<number> {
  const doc = parseYaml(await readFile(scenFile, 'utf8')) as ScenarioDoc;
  const steps = doc.steps ?? [];
  const expects = doc.expects ?? [];
  const times = [...new Set([...steps.map((s) => s.at), ...expects.map((e) => e.at)])].sort(
    (a, b) => a - b,
  );
  const stepsByAt = new Map<number, ScenarioStep[]>();
  for (const s of steps) {
    const arr = stepsByAt.get(s.at) ?? [];
    arr.push(s);
    stepsByAt.set(s.at, arr);
  }
  const expectsByAt = new Map<number, ScenarioExpect[]>();
  for (const e of expects) {
    const arr = expectsByAt.get(e.at) ?? [];
    arr.push(e);
    expectsByAt.set(e.at, arr);
  }
  let stepCount = 0;
  let tab: 'tags' | 'plc' = 'tags';
  // openPage để lại tab PLC (kiểm panel) — về lại tags trước khi lái.
  await page.getByTestId('nav-tags').click();
  const goTab = async (next: 'tags' | 'plc'): Promise<void> => {
    if (tab === next) return;
    await page.getByTestId(next === 'tags' ? 'nav-tags' : 'nav-plc').click();
    tab = next;
  };

  for (const T of times) {
    // (0) Đưa simTime về đúng T TRƯỚC khi làm actions: panel inject/preset
    // gửi when {at:'time', timeMs: simTimeMs} và clear lấy #simTimeMs hiện
    // tại — làm actions khi simTime còn ở mốc trước sẽ đóng dấu sai T (vd
    // clear T=2000 thành clear lúc 1010 → OVL_OK hồi sớm, expects 2990 sai).
    const actions = stepsByAt.get(T) ?? [];
    if (actions.length > 0) {
      const target0 = T / 10;
      if (target0 > stepCount) {
        ws.send(JSON.stringify({ type: 'sim.command', cmd: 'step', steps: target0 - stepCount }));
        stepCount = target0;
        await expect.poll(async () => stepCountOf(page), { timeout: 10_000 }).toBe(target0);
      }
    }
    // (1) Actions tại T — trước bước T (giống runner: một step có thể vừa
    // set vừa fault/preset — xử lý từng field độc lập, KHÔNG else-if).
    for (const a of actions) {
      let handled = false;
      if (a.set !== undefined) {
        handled = true;
        await goTab('tags');
        for (const [name, value] of Object.entries(a.set)) {
          await setTag(page, name, value);
        }
      }
      if (a.fault !== undefined) {
        handled = true;
        await goTab('plc');
        const eq = a.fault.target.equipment;
        await page.getByTestId(`plant-fault-select-${eq}`).selectOption(a.fault.target.fault);
        await page.getByTestId(`plant-fault-inject-${eq}`).click();
        await expect
          .poll(
            async () => {
              const plant = await getPlant();
              return (
                plant.equipment
                  .find((e) => e.id === eq)
                  ?.faults.filter((f) => {
                    const t = f.target as { fault?: string };
                    return t.fault === a.fault?.target.fault && f.state !== 'cleared';
                  }).length ?? 0
              );
            },
            { timeout: 10_000 },
          )
          .toBeGreaterThan(0);
      }
      if (a.preset !== undefined) {
        handled = true;
        await goTab('plc');
        const eq = a.preset.equipment;
        await page.getByTestId(`plant-fault-preset-select-${eq}`).selectOption(a.preset.preset);
        await page.getByTestId(`plant-fault-preset-${eq}`).click();
        await expect
          .poll(
            async () => {
              const plant = await getPlant();
              return (
                plant.equipment
                  .find((e) => e.id === eq)
                  ?.faults.filter((f) => f.state !== 'cleared').length ?? 0
              );
            },
            { timeout: 10_000 },
          )
          .toBeGreaterThan(0);
      }
      if (a.clear !== undefined) {
        handled = true;
        await goTab('plc');
        const plant = await getPlant();
        const rec = plant.equipment
          .flatMap((e) => e.faults)
          .find((f) => {
            const t = f.target as { fault?: string };
            return t.fault === a.clear && f.state !== 'cleared';
          });
        expect(rec).toBeDefined();
        await page.getByTestId(`plant-fault-clear-${rec?.id ?? ''}`).click();
        await expect
          .poll(
            async () => {
              const p2 = await getPlant();
              return p2.equipment
                .flatMap((e) => e.faults)
                .filter((f) => {
                  const t = f.target as { fault?: string };
                  return t.fault === a.clear && f.state !== 'cleared';
                }).length;
            },
            { timeout: 10_000 },
          )
          .toBe(0);
      }
      if (!handled) {
        throw new Error(`scenario step tại ${String(T)} không rõ loại`);
      }
    }
    // (2) Bước T đầy đủ: stepCount mục tiêu T/10+1 (expects kiểm sau bước T).
    const target = T / 10 + 1;
    if (target > stepCount) {
      ws.send(JSON.stringify({ type: 'sim.command', cmd: 'step', steps: target - stepCount }));
      stepCount = target;
      await expect
        .poll(async () => stepCountOf(page), { timeout: 10_000 })
        .toBe(target);
    }
    // (3) Expects sau bước T.
    for (const e of expectsByAt.get(T) ?? []) {
      if (e.tags !== undefined) {
        await goTab('tags');
        for (const [name, expected] of Object.entries(e.tags)) {
          await expect
            .poll(async () => getTagValue(page, name), {
              timeout: 5000,
              message: `expect ${name}=${expected ? 'TRUE' : 'FALSE'} at T=${String(T)}`,
            })
            .toBe(expected ? 'TRUE' : 'FALSE');
        }
      }
      if (e.observables !== undefined) {
        const plant = await getPlant();
        for (const [eq, obs] of Object.entries(e.observables)) {
          const got = plant.equipment.find((x) => x.id === eq)?.observables ?? {};
          for (const [k, v] of Object.entries(obs)) {
            expect(got[k]).toBe(v);
          }
        }
      }
    }
  }
  return stepCount;
}

async function openPage(page: Page): Promise<void> {
  await page.goto(BASE);
  await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
  // Server dùng chung cho cả 4 test (beforeAll) — reset về 0 trước mỗi test
  // (test trước để lại stepCount/hash cũ).
  await page.getByTestId('btn-reset').click();
  await expect.poll(async () => stepCountOf(page), { timeout: 10_000 }).toBe(0);
  await page.getByTestId('nav-plc').click();
  await expect(page.getByTestId('plant-fault-panel')).toBeVisible();
}

test('A: UI lái a-normal-overload — mọi expects + hash tất định khi chạy lại', async ({ page }) => {
  test.setTimeout(60_000);
  const ws = await openWs();
  try {
    await openPage(page);
    const steps = await drive(page, ws, SCEN.A);
    expect(steps).toBe(372);
    const hash1 = (await getHash()).hash;
    expect(hash1).not.toBe(EMPTY_SHA256);
    // Reset + lái lại từ đầu → hash UI phải giống hệt (tất định).
    await page.getByTestId('btn-reset').click();
    await expect.poll(async () => stepCountOf(page), { timeout: 10_000 }).toBe(0);
    await expect.poll(async () => (await getHash()).hash, { timeout: 10_000 }).toBe(EMPTY_SHA256);
    const steps2 = await drive(page, ws, SCEN.A);
    expect(steps2).toBe(372);
    expect((await getHash()).hash).toBe(hash1);
  } finally {
    ws.close();
  }
});

test('B: UI lái b-no-feedback — mọi expects', async ({ page }) => {
  test.setTimeout(60_000);
  const ws = await openWs();
  try {
    await openPage(page);
    expect(await drive(page, ws, SCEN.B)).toBe(393);
    expect((await getHash()).hash).not.toBe(EMPTY_SHA256);
  } finally {
    ws.close();
  }
});

test('C: UI lái c-local-mode — mọi expects', async ({ page }) => {
  test.setTimeout(60_000);
  const ws = await openWs();
  try {
    await openPage(page);
    expect(await drive(page, ws, SCEN.C)).toBe(313);
    expect((await getHash()).hash).not.toBe(EMPTY_SHA256);
  } finally {
    ws.close();
  }
});

test('D: UI lái d-contactor-stuck — mọi expects', async ({ page }) => {
  test.setTimeout(60_000);
  const ws = await openWs();
  try {
    await openPage(page);
    expect(await drive(page, ws, SCEN.D)).toBe(381);
    expect((await getHash()).hash).not.toBe(EMPTY_SHA256);
  } finally {
    ws.close();
  }
});
