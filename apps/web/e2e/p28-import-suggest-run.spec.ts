// P28 e2e (P2.8): luồng import → duyệt suggestion → run → fault → PLC báo
// lỗi (§14 #8). Server riêng trên bản sao tạm motor-interlock ở 4171 (như
// plant-closedloop.spec.ts); webServer của suite vẫn phục vụ hello-tags
// ở 4170.
//
// Case (1) — wizard 5 bước (commit 6):
//   (1a) CSV bẩn 2 dòng: quickfix IO-W002 (warnings 4 → 3, PL-W010×3 do
//        M01 đã gán tag — cùng phát hiện commit 4, không commit);
//   (1b) fixture XLSX 300: số diagnostic bước 4 (18 lỗi / 26 warnings =
//        23 IO-W030 + 3 PL-W010 do baseline motor-interlock có equipment
//        M01; Bảng 2 của plan ghi 23 vì đo không có equipment baseline),
//        diff 300/8/0, commit BỊ TỪ CHỐI (18 lỗi nội tại IO-E001×6 +
//        IO-E011×12 — trùng tag/địa chỉ trong chính file; luật commit 4);
//   (1c) CSV sạch 2 tag: diff 2/8/0, commit OK + banner khởi động lại
//        (OQ-384). Case (1) kết thúc ở banner của (1c).
//
// Case (2)(3)(4)(6) — Designer trên bản sao tạm của fixture suggest-project
// (commit 8). Server riêng ở 4172 ("restart" ở case (2) của plan = khởi
// động server mới trên project suggest — khác project với server 4171
// của case (1)). Fixture 300 không commit được qua wizard (18 lỗi nội
// tại) nên các case Designer dùng project sinh sẵn này.
//   (2) Suggestions: stats 294/176/36/14/0; lọc confident → 36 dòng;
//       chi tiết CR01_FCV02 có đủ signals.
//   (3) Accept all confident → BỊ TỪ CHỐI (CR02_SS02 switch_di thiếu kind
//       — OQ-392, kind không auto-fill); "áp dụng các nhóm còn lại" →
//       applied 35, equipment.yaml 35 thiết bị, `vcs plant validate` OK.
//   (4) Equipment: sửa strokeTimeS của CR01_FCV02 20 → 25, lưu →
//       GET /api/plant/equipment thấy 25, validate vẫn OK.
//   (6) Unassigned: gán CR01_BC01_SPEED → CR01_BC01 / zeroSpeed, học
//       roleOverrides (confirm dialog) → naming.yaml có SPEED → zeroSpeed,
//       tags.yaml gán role cho tag.
//   (5) Luồng trọn (§14 #8) — chạy sau (3): restart server trên cùng thư
//       mục (OQ-384: sim nhận 35 thiết bị đã apply) → inspector tiêm lỗi
//       'stuck' cho CR01_FCV02 → quan sát: fault hiện ở inspector, event
//       fault ở Event log, tag CR01_FCV02_FAULT lên true ở Tag Manager
//       (fault DI = OR mọi fault active, OQ-275). Chân import của luồng
//       là case (1) + fixture (kết quả import); không gộp thành 1 test
//       duy nhất vì fixture 300 không commit được qua wizard (18 lỗi
//       nội tại) còn motor-interlock có 0 confident để apply — xem
//       docs P2.8 (commit 9).
//   Case (5) (luồng trọn import → suggest → run → fault → PLC báo lỗi,
//   §14 #8) ở commit 9.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const PORT = 4171;
const BASE = `http://127.0.0.1:${String(PORT)}`;
const ROOT = process.cwd();
const MOTOR = join(ROOT, 'examples', 'motor-interlock');
const FIXTURE_XLSX = join(ROOT, 'fixtures', 'io-list-300.xlsx');

let server: ChildProcess | undefined;
let projectDir = '';
let dirtyCsv = '';
let cleanCsv = '';

async function waitForHealth(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // Chưa lên — thử lại.
    }
    if (Date.now() - start > timeoutMs) throw new Error('server p28 không lên');
    await new Promise((r) => setTimeout(r, 200));
  }
}

test.beforeAll(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'vcs-p28-e2e-'));
  await cp(MOTOR, projectDir, { recursive: true });
  dirtyCsv = join(projectDir, 'dirty.csv');
  await writeFile(
    dirtyCsv,
    ['Tag Name,Type,Address,PLC', 'MOTOR/01,DI,%I1.0,PLC1', 'MOTOR02,DI,%I1.1,PLC1'].join('\n'),
    'utf8',
  );
  // CSV sạch: 2 tag mới, địa chỉ không chồng baseline (%I0.0–0.5, %Q0.0–0.1)
  // → validate 0 lỗi, commit được. Fixture 300 có 18 lỗi nội tại (trùng
  // tag/địa chỉ trong chính file) nên commit của nó luôn bị từ chối 400 —
  // xem (1b): plan Bảng 2 ghi commit fixture là sai so với luật commit 4.
  cleanCsv = join(projectDir, 'clean.csv');
  await writeFile(
    cleanCsv,
    ['Tag Name,Type,Address,PLC', 'CLEAN01,DI,%I1.0,PLC1', 'CLEAN02,DI,%I1.1,PLC1'].join('\n'),
    'utf8',
  );
  server = spawn('pnpm', ['vcs', 'serve', projectDir, '--port', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
  await waitForHealth();
});

test.afterAll(async () => {
  if (server !== undefined && server.pid !== undefined) {
    process.kill(-server.pid, 'SIGTERM');
    server = undefined;
  }
  if (projectDir !== '') await rm(projectDir, { recursive: true, force: true });
});

test('p28 (1a): wizard CSV bẩn — quickfix IO-W002, warnings 4 → 3', async ({ page }) => {
  await page.goto(BASE);
  await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
  await page.getByTestId('nav-import').click();
  await page.getByTestId('import-file-input').setInputFiles(dirtyCsv);
  await expect(page.getByTestId('import-file-name')).toHaveText('dirty.csv');
  await page.getByTestId('import-next-1').click();
  await expect(page.getByTestId('import-header-row')).toHaveText('1');
  await expect(page.getByTestId('import-total-rows')).toHaveText('2');
  await page.getByTestId('import-next-2').click();
  await expect(page.getByTestId('import-mapping-tag')).toHaveValue('Tag Name');
  await page.getByTestId('import-next-3').click();
  await expect(page.getByTestId('import-stats-errors')).toHaveText('0');
  await expect(page.getByTestId('import-stats-warnings')).toHaveText('4');
  await expect(page.getByTestId('import-stats-by-code')).toContainText('IO-W002×1');
  await expect(page.getByTestId('import-stats-by-code')).toContainText('PL-W010×3');
  await expect(page.getByTestId('import-diag-IO-W002-2')).toBeVisible();
  await page.getByTestId('import-quickfix-2').click();
  await expect(page.getByTestId('import-stats-warnings')).toHaveText('3');
  await expect(page.getByTestId('import-diag-IO-W002-2')).toHaveCount(0);
  // Không commit CSV bẩn — hủy phiên, về bước 1 cho luồng fixture.
  await page.getByTestId('import-cancel').click();
  await expect(page.getByTestId('import-file-input')).toBeVisible();
});

test('p28 (1b): wizard fixture 300 — số diagnostic, diff 300/8/0, commit BỊ TỪ CHỐI (18 lỗi)', async ({
  page,
}) => {
  await page.goto(BASE);
  await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
  await page.getByTestId('nav-import').click();
  await page.getByTestId('import-file-input').setInputFiles(FIXTURE_XLSX);
  await expect(page.getByTestId('import-file-name')).toHaveText('io-list-300.xlsx');
  await expect(page.getByTestId('import-sheet-select')).toHaveValue('IO List');
  await page.getByTestId('import-next-1').click();
  await expect(page.getByTestId('import-header-row')).toHaveText('6');
  await expect(page.getByTestId('import-total-rows')).toHaveText('300');
  await expect(page.getByTestId('import-columns')).toContainText('Tag Name');
  await page.getByTestId('import-next-2').click();
  await expect(page.getByTestId('import-mapping-tag')).toHaveValue('Tag Name');
  await expect(page.getByTestId('import-mapping-address')).toHaveValue('Address');
  await page.getByTestId('import-next-3').click();
  await expect(page.getByTestId('import-stats-errors')).toHaveText('18');
  await expect(page.getByTestId('import-stats-warnings')).toHaveText('26');
  const byCode = page.getByTestId('import-stats-by-code');
  await expect(byCode).toContainText('IO-E001×6');
  await expect(byCode).toContainText('IO-E011×12');
  await expect(byCode).toContainText('IO-W030×23');
  await expect(byCode).toContainText('PL-W010×3');
  await page.getByTestId('import-next-4').click();
  await expect(page.getByTestId('import-diff-added')).toHaveText('300');
  await expect(page.getByTestId('import-diff-removed')).toHaveText('8');
  await expect(page.getByTestId('import-diff-unchanged')).toHaveText('0');
  // Fixture có 18 lỗi nội tại (IO-E001/E011) → commit phải bị từ chối 400
  // (luật commit 4); không có banner restart, wizard ở lại bước 5.
  await page.getByTestId('import-commit').click();
  await expect(page.getByTestId('import-error')).toContainText('validate có 18 lỗi');
  await expect(page.getByTestId('import-committed')).toHaveCount(0);
  await expect(page.getByTestId('import-restart-banner')).toHaveCount(0);
  await page.getByTestId('import-cancel').click();
  await expect(page.getByTestId('import-file-input')).toBeVisible();
});

test('p28 (1c): wizard CSV sạch 2 tag — diff 2/8/0, commit OK + banner restart', async ({
  page,
}) => {
  await page.goto(BASE);
  await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
  await page.getByTestId('nav-import').click();
  await page.getByTestId('import-file-input').setInputFiles(cleanCsv);
  await expect(page.getByTestId('import-file-name')).toHaveText('clean.csv');
  await page.getByTestId('import-next-1').click();
  await expect(page.getByTestId('import-header-row')).toHaveText('1');
  await expect(page.getByTestId('import-total-rows')).toHaveText('2');
  await page.getByTestId('import-next-2').click();
  await expect(page.getByTestId('import-mapping-tag')).toHaveValue('Tag Name');
  await page.getByTestId('import-next-3').click();
  await expect(page.getByTestId('import-stats-errors')).toHaveText('0');
  await expect(page.getByTestId('import-stats-warnings')).toHaveText('3');
  await expect(page.getByTestId('import-stats-by-code')).toContainText('PL-W010×3');
  await page.getByTestId('import-next-4').click();
  await expect(page.getByTestId('import-diff-added')).toHaveText('2');
  await expect(page.getByTestId('import-diff-removed')).toHaveText('8');
  await expect(page.getByTestId('import-diff-unchanged')).toHaveText('0');
  await page.getByTestId('import-commit').click();
  await expect(page.getByTestId('import-committed')).toBeVisible();
  await expect(page.getByTestId('import-files-written')).toContainText('tags/tags.yaml');
  await expect(page.getByTestId('import-files-written')).toContainText('io/io-list.normalized.csv');
  await expect(page.getByTestId('import-files-written')).toContainText('io/import-profile.yaml');
  await expect(page.getByTestId('import-files-written')).toContainText('reports/import-');
  await expect(page.getByTestId('import-restart-banner')).toBeVisible();
});

// ---- Designer (2)(3)(4)(6) — server riêng trên bản sao suggest-project ----

const PORT2 = 4172;
const BASE2 = `http://127.0.0.1:${String(PORT2)}`;
const SUGGEST = join(ROOT, 'apps', 'web', 'e2e', 'fixtures', 'suggest-project');

let server2: ChildProcess | undefined;
let projectDir2 = '';

async function waitForHealth2(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${BASE2}/api/health`);
      if (res.ok) return;
    } catch {
      // Chưa lên — thử lại.
    }
    if (Date.now() - start > timeoutMs) throw new Error('server p28 designer không lên');
    await new Promise((r) => setTimeout(r, 200));
  }
}

function plantValidateOk(dir: string): string {
  const out = execFileSync('pnpm', ['vcs', 'plant', 'validate', dir], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
  expect(out).toContain('OK:');
  return out;
}

/** Restart server Designer trên cùng thư mục (OQ-384: sim nhận file mới). */
async function restartServer2(): Promise<void> {
  if (server2 !== undefined && server2.pid !== undefined) {
    process.kill(-server2.pid, 'SIGTERM');
    server2 = undefined;
  }
  // Chờ server cũ nhả cổng 4172 hẳn rồi mới spawn mới — không thì server
  // mới bind EADDRINUSE và chết im (stdio ignore), còn health check lại
  // chạm nhầm server cũ đang tắt dần (race đã đỏ 1 lần).
  const start = Date.now();
  for (;;) {
    try {
      await fetch(`${BASE2}/api/health`);
    } catch {
      break;
    }
    if (Date.now() - start > 10_000) throw new Error('server p28 designer cũ không chết');
    await new Promise((r) => setTimeout(r, 200));
  }
  server2 = spawn('pnpm', ['vcs', 'serve', projectDir2, '--port', String(PORT2)], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
  await waitForHealth2();
}

test.describe('p28 designer', () => {
  test.beforeAll(async () => {
    projectDir2 = await mkdtemp(join(tmpdir(), 'vcs-p28-designer-'));
    await cp(SUGGEST, projectDir2, { recursive: true });
    server2 = spawn('pnpm', ['vcs', 'serve', projectDir2, '--port', String(PORT2)], {
      cwd: ROOT,
      stdio: 'ignore',
      detached: true,
    });
    await waitForHealth2();
  });

  test.afterAll(async () => {
    if (server2 !== undefined && server2.pid !== undefined) {
      process.kill(-server2.pid, 'SIGTERM');
      server2 = undefined;
    }
    if (projectDir2 !== '') await rm(projectDir2, { recursive: true, force: true });
  });

  test('p28 (2): Designer Suggestions — stats 294/176/36/14/0, lọc confident 36 dòng', async ({
    page,
  }) => {
    await page.goto(BASE2);
    await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
    await page.getByTestId('nav-plant').click();
    await expect(page.getByTestId('designer-stats')).toHaveText(
      '294 tags · 176 đã gán · 36 confident · 14 review · 0 unmatched',
    );
    await page.getByTestId('designer-filter-status').selectOption('confident');
    await expect(page.locator('[data-testid^="suggestion-CR"]')).toHaveCount(36);
    await page.getByTestId('suggestion-CR01_FCV02').click();
    await expect(page.getByTestId('suggestion-detail')).toContainText('CR01_FCV02');
    await expect(page.getByTestId('suggestion-detail')).toContainText('valve_ctrl');
    await expect(page.getByTestId('suggestion-detail')).toContainText('CR01_FCV02_POS_FB');
  });

  test('p28 (3): Accept all confident — từ chối vì CR02_SS02 thiếu kind, áp dụng 35 nhóm còn lại → validate OK', async ({
    page,
  }) => {
    await page.goto(BASE2);
    await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
    await page.getByTestId('nav-plant').click();
    await expect(page.getByTestId('designer-stats')).toBeVisible();
    await page.getByTestId('designer-accept-confident').click();
    // OQ-392: switch_di kind không auto-fill được → apply 400, diagnostics
    // nêu đúng thiết bị bị chặn.
    await expect(page.getByTestId('designer-apply-diagnostics')).toContainText('CR02_SS02');
    await expect(page.getByTestId('designer-apply-diagnostics')).toContainText('kind bắt buộc');
    await page.getByTestId('designer-apply-rest').click();
    await expect(page.getByTestId('designer-apply-result')).toContainText('35');
    await expect(page.getByTestId('designer-apply-result')).toContainText('plant/equipment.yaml');
    await expect(page.getByTestId('designer-restart-banner')).toBeVisible();
    const res = await fetch(`${BASE2}/api/plant/equipment`);
    const body = (await res.json()) as { equipment: Array<{ id: string }> };
    expect(body.equipment).toHaveLength(35);
    expect(body.equipment.map((e) => e.id)).not.toContain('CR02_SS02');
    plantValidateOk(projectDir2);
  });

  test('p28 (4): Equipment — sửa strokeTimeS CR01_FCV02 20 → 25, lưu → đĩa thấy 25, validate OK', async ({
    page,
  }) => {
    await page.goto(BASE2);
    await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
    await page.getByTestId('nav-plant').click();
    await page.getByTestId('designer-tab-equipment').click();
    await page.getByTestId('equipment-CR01_FCV02').click();
    await expect(page.getByTestId('param-strokeTimeS')).toHaveValue('20');
    await page.getByTestId('param-strokeTimeS').fill('25');
    await page.getByTestId('equipment-save').click();
    await expect(page.getByTestId('equipment-saved')).toBeVisible();
    const res = await fetch(`${BASE2}/api/plant/equipment`);
    const body = (await res.json()) as {
      equipment: Array<{ id: string; params?: { strokeTimeS?: number } }>;
    };
    const fcv02 = body.equipment.find((e) => e.id === 'CR01_FCV02');
    expect(fcv02?.params?.strokeTimeS).toBe(25);
    plantValidateOk(projectDir2);
  });

  test('p28 (6): Unassigned — gán CR01_BC01_SPEED → CR01_BC01/zeroSpeed + học roleOverrides', async ({
    page,
  }) => {
    await page.goto(BASE2);
    await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
    await page.getByTestId('nav-plant').click();
    await page.getByTestId('designer-tab-unassigned').click();
    await expect(page.getByTestId('unassigned-CR01_BC01_SPEED')).toContainText('no role ≥ 0.4');
    await page
      .getByTestId('assign-equipment-CR01_BC01_SPEED')
      .selectOption('CR01_BC01');
    await page.getByTestId('assign-role-CR01_BC01_SPEED').selectOption('zeroSpeed');
    await page.getByTestId('assign-CR01_BC01_SPEED').click();
    // OQ-397: dialog hỏi trước khi ghi roleOverrides — token SPEED → role
    // zeroSpeed (SPEED là tín hiệu tốc độ, dùng cho phát hiện tốc độ 0).
    await expect(page.getByTestId('learn-dialog')).toContainText('SPEED');
    await expect(page.getByTestId('learn-dialog')).toContainText('zeroSpeed');
    await page.getByTestId('learn-confirm').click();
    await expect(page.getByTestId('assign-done')).toBeVisible();
    const naming = await readFile(join(projectDir2, 'plant', 'naming.yaml'), 'utf8');
    expect(naming).toContain('SPEED');
    expect(naming).toContain('zeroSpeed');
    const tagsYaml = await readFile(join(projectDir2, 'tags', 'tags.yaml'), 'utf8');
    expect(tagsYaml).toContain('role: zeroSpeed');
  });

  test('p28 (5): luồng trọn §14 #8 — restart (chạy) → tiêm lỗi stuck → quan sát ở inspector + event log + Tag Manager', async ({
    page,
  }) => {
    await restartServer2();
    await page.goto(BASE2);
    await expect(page.getByTestId('connection-badge')).toHaveText('Đã kết nối');
    // Sim khởi động ở IDLE — bấm Run mới là chân "chạy" của luồng (§14 #8).
    if ((await page.getByTestId('sim-state').textContent()) !== 'RUNNING') {
      await page.getByTestId('btn-run').click();
    }
    await expect(page.getByTestId('sim-state')).toHaveText('RUNNING');
    await page.getByTestId('nav-plant').click();
    // Sim sau restart đã nhận 35 thiết bị (OQ-384) — inspector thấy đủ.
    await page.getByTestId('inspector-equipment').selectOption('CR01_FCV02');
    await expect(page.getByTestId('inspector-detail')).toContainText('CR01_FCV02');
    await page.getByTestId('fault-inject-select').selectOption('stuck');
    await page.getByTestId('fault-inject').click();
    // Quan sát 1 — inspector: fault đang chèn + role fault lên true.
    await expect(page.locator('[data-testid^="fault-clear-"]')).toHaveCount(1);
    await expect(page.getByTestId('role-value-fault')).toContainText('true');
    // Quan sát 2 — Event log: có event fault của CR01_FCV02.
    await expect(page.getByTestId('event-log')).toContainText('fault');
    await expect(page.getByTestId('event-log')).toContainText('CR01_FCV02');
    // Quan sát 3 — Tag Manager: tag fault của van lên TRUE (PLC thấy lỗi).
    // (Cell còn chứa nút "Ghi thử" nên assert contain, không haveText.)
    await page.getByTestId('nav-tags').click();
    await page.getByTestId('filter-text').fill('CR01_FCV02_FAULT');
    await expect(page.getByTestId('value-CR01_FCV02_FAULT')).toContainText('TRUE');
  });
});
