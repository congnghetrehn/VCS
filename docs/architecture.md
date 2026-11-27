# Kiến trúc VCS — Milestone M0

## Mục lục

- [1. Tổng quan](#1-tổng-quan)
- [2. Monorepo và package JIT](#2-monorepo-và-package-jit)
- [3. Luồng dữ liệu trong một bước mô phỏng](#3-luồng-dữ-liệu-trong-một-bước-mô-phỏng)
- [4. Thời gian và tốc độ](#4-thời-gian-và-tốc-độ)
- [5. Builder và extension](#5-builder-và-extension)
- [6. Server và giao thức](#6-server-và-giao-thức)
- [7. Web và CLI](#7-web-và-cli)
- [8. Lỗi và chẩn đoán](#8-lỗi-và-chẩn-đoán)
- [9. Test, bench và CI](#9-test-bench-và-ci)
- [10. Thêm package / extension / lệnh CLI](#10-thêm-package-extension-lệnh-cli)
- [11. Những gì M0 KHÔNG có (thuộc milestone sau)](#11-những-gì-m0-không-có-thuộc-milestone-sau)

Tài liệu này mô tả kiến trúc **đã triển khai** ở M0 (P0.1–P0.6). Mọi khẳng định trỏ về
file code hoặc test; chỗ nào là dự định cho milestone sau thì ghi rõ "chưa có".
Ngữ nghĩa chi tiết (thời gian, thứ tự bước, quyền ghi): xem `docs/semantics.md`.
Quyết định kiến trúc: xem `docs/adr/`.

## 1. Tổng quan

VCS là nền tảng web mô phỏng điều khiển công nghiệp trước commissioning. Ở M0, hệ thống
gồm 3 tầng chạy trong **một process Node** (server) + một client web mỏng:

```
┌────────────────────────────┐        WebSocket JSON (zod, §9)        ┌───────────────────────┐
│  apps/web (React + Vite)   │ ◄────────────────────────────────────► │  apps/server (Fastify)│
│  1 trang Tags, Zustand,    │   hello / sim.command / tag.write /    │  REST + WS /ws         │
│  WS client tự nối lại      │   welcome / sim.state / tags.delta     │  SimulationService    │
└────────────────────────────┘                                        └──────────┬────────────┘
                                                                                  │ stepOnce()
                                                                     ┌────────────▼────────────┐
                                                                     │  @vcs/kernel            │
                                                                     │  SimulationOrchestrator │
                                                                     │  TagDB · TagDbIoBus     │
                                                                     │  ManualClock · Pacer    │
                                                                     └────────────┬────────────┘
                                                                                  │ loadProject
                                                                     ┌────────────▼────────────┐
                                                                     │  @vcs/project           │
                                                                     │  ProjectFS · loadProject│
                                                                     │  hashText (sha256)      │
                                                                     └─────────────────────────┘
```

- **Mô phỏng chạy trong server Node** (ADR 0002, AMENDMENTS A10): UI không chạy mô
  phỏng, chỉ hiển thị và gửi lệnh qua WebSocket. Worker transport là tùy chọn sau.
- **Dữ liệu vào**: thư mục dự án (`vcs.project.yaml` + `tags/tags.yaml`), nạp bằng
  `@vcs/project` (`packages/project/src/load.ts`). Không có dữ liệu khách hàng thật
  trong repo (AGENTS.md §8, D-003).
- **CLI** (`apps/cli`, lệnh `vcs`): `version`, `validate`, `run`, `serve` — xem §7.

## 2. Monorepo và package JIT

Monorepo pnpm + Turborepo (ADR 0001). Mỗi package nội bộ là **JIT**: `package.json`
`exports` trỏ thẳng `src/index.ts`, không qua bước build riêng (trừ `apps/*` có
`tsup` khi bundle). Cấm import xuyên package bằng đường dẫn tương đối — chỉ qua
`exports` (ép bằng dependency-cruiser, `pnpm depcheck`).

| Package / app | Vai trò | Import được |
|---|---|---|
| `@vcs/schemas` | Kiểu chung, zod schema (project/tags/protocol), `Diagnostic` + `DiagnosticCatalog`, `duration`, `yaml` | (không package nội bộ) |
| `@vcs/kernel` | `ManualClock`, `TagDB`, `TagDbIoBus`/`IoPort`, `TraceHasher`, `SimulationOrchestrator`, `Pacer`, builder/extension, controller demo `loopback` | `schemas` |
| `@vcs/project` | `ProjectFS` (nodeFS/memoryFS), `loadProject`, `hashText` | `schemas` |
| `@vcs/test-utils` | `defineTags`/`makeTags`, `makeSim`, `FakeClock`, `FakeController`, `recordChanges`, `waitFor` | `schemas`, `kernel` |
| `apps/cli` | Lệnh `vcs` (`version`/`validate`/`run`/`serve`) | tất cả package |
| `apps/server` | REST + WS, `SimulationService` | tất cả package |
| `apps/web` | UI React (1 trang Tags) | chỉ `schemas` |

Đồ thị đầy đủ (gồm package của milestone sau): M0 §3.5. M0 chỉ có 4 package
(`schemas`, `kernel`, `project`, `test-utils`) + 3 app (`cli`, `server`, `web`).

## 3. Luồng dữ liệu trong một bước mô phỏng

Một bước tại thời điểm sim `T` (ms nguyên), `dt = stepMs` — thứ tự cố định
(`packages/kernel/src/orchestrator.ts`, `stepOnce()`; ngữ nghĩa: `semantics.md` §2):

```
beforeExternals(T)          ← hook (M3: hành động của test)
drain inbox (post())        ← lệnh đã xếp hàng, theo thứ tự post
pha plant                   ← component pha plant (M0: chưa có; M2 đăng ký PlantEngine)
pha controllers             ← controller (M0: LoopbackController demo)
pha gateways                ← component pha gateways (M0: chưa có; M4 đăng ký comms)
tags.flush()                ← thông báo thay đổi theo lô cho subscriber (trace, UI)
afterStep(T)                ← hook (M3: quan sát cuối bước)
clock.advance(dt); stepCount += 1
```

**Hệ quả** (M0 §6.7, khớp M2 §5.1): plant chạy trước controller nên PLC thấy giá
trị plant của cùng bước `T`; PLC ghi output ở bước `T` thì plant thấy ở bước
`T+dt` (trễ tối thiểu 1 bước).

**TagDB là trung tâm dữ liệu** (`packages/kernel/src/tags.ts`):

- Tag chỉ có vùng `I`/`Q` mới vào TagDB; tag `M`/`DB` chỉ ở `TagCatalog`
  (`packages/schemas`, M0 §6.5) và không vào TagDB.
- Truy cập nhanh bằng `TagHandle` (chỉ số theo thứ tự định nghĩa, ổn định trong
  một phiên); `get`/`set` không cấp phát (bench §12.4, test heap < 1 MB/10M ops).
- Ghi tức thời, thông báo trì hoãn: `set`/`write` đổi giá trị ngay; subscriber
  chỉ nhận ở `flush()` cuối bước, theo lô, chỉ tag khác giá trị đã flush lần
  trước, theo thứ tự handle tăng dần (danh sách dirty, A17).
- Quyền ghi theo owner (`checkWrite`): `plant ← {plant, system}`,
  `controller ← {plc, system}`, `free ← {test, hmi, gateway, system}`.
  Vi phạm khi enforce → `TagError('TAG-E002')`.
- `snapshot()`/`restore()` JSON-serializable; `restore()` kiểm `namesHash`,
  sai → `SIM-E003`; sau restore/reset, `flush()` phát thay đổi so với giá trị
  flush cuối.

**IoBus** (`packages/kernel/src/iobus.ts`, M0 §6.3): cài đặt trên TagDB. Input của
controller = mọi tag area `I` có `controller === id`; output = mọi tag area `Q`,
thứ tự = thứ tự handle. `IoPort` là đường nhanh không cấp phát
(`readInputsInto`/`writeOutputsFrom`, ghi bằng source `'plc'`).
`LoopbackController` ở M0 dùng I/O thưa qua handle (A17): chỉ đọc/ghi tag có
rule; output không có rule giữ nguyên, không bị ghi đè về initial mỗi scan.

**TraceHasher** (`packages/kernel/src/hasher.ts`, M0 §6.9): subscribe `'*'` trên
TagDB, mã hóa mỗi `TagChange` theo thứ tự flush
(`simTime uint64 | handle uint32 | giá trị`: Bool 1 byte, số float64
big-endian, chuỗi độ dài uint32 + UTF-8), băm sha256 tăng dần. Cùng cấu hình +
seed + đầu vào ⇒ cùng hash — dùng cho test tất định và `vcs run --hash`
(§15.6 ghim hash `21096ab2…1d53` cho `hello-tags --until 5s`).

## 4. Thời gian và tốc độ

- **Thời gian mô phỏng là số nguyên ms** (`SimClock`, ADR 0003). `ManualClock`
  (`packages/kernel/src/clock.ts`): `nowMs()`/`advance(dt)`/`reset()`/
  `snapshot()`/`restore()`. Không `Date.now`/`Math.random` ở package lõi
  (lint chặn, có test probe; allow-list: `kernel/src/pacer.ts`, `apps/*`).
- **Pacer tách biệt khỏi logic** (`packages/kernel/src/pacer.ts`, M0 §6.4):
  nhận hàm `now()` wall từ ngoài, `plan(simNowMs, stepMs)` trả số bước chạy
  trong lát này để bám `timeScale` (số hoặc `'max'`), tôn trọng
  `sliceBudgetMs` (mặc định 8 ms). `timeScale = 'max'`: chạy hết ngân sách mỗi
  lát; tụt quá `maxLagMs` (1 000 ms) → đặt lại mốc, `lagging = true`, thay vì
  "đuổi" vô hạn. Công thức `plan()` đầy đủ: xem OQ-022.
- **Vòng chạy thuộc `SimulationService`** (`apps/server/src/sim-service.ts`,
  M0 §8.2): mỗi lát hỏi `Pacer.plan()`, gọi `stepOnce()` đúng số bước, rồi
  nhường event loop (`setImmediate` khi `max`/tụt, `setTimeout` khi đủ nhanh).
  Lệnh (run/pause/step/reset/setTimeScale) xếp hàng và áp dụng **giữa các lát**,
  không chen vào giữa bước. `tag.write`: `checkWrite(h, 'hmi')` → ok thì
  `orchestrator.post(...)` (hiệu lực đầu bước kế; tạm dừng thì `applyInbox()` +
  `flush()` để UI thấy ngay, D4); denied → lỗi `TAG-E002`.
- Lỗi trong lát → pause + diagnostic (OQ-052). Service dùng
  `errorPolicy: 'isolate'` (component lỗi bị đánh dấu faulted, không sập
  server); CLI dùng `'throw'`.

## 5. Builder và extension

`createSimulation(project, { extensions, errorPolicy, tagDb })`
(`packages/kernel/src/builder.ts`, M0 §6.8):

1. `project.diagnostics` có error → ném `ProjectInvalidError`.
2. Dựng `ManualClock`, `TagDB` (chỉ tag `I`/`Q`), `TagDbIoBus`,
   `SimulationOrchestrator`.
3. Chạy `extensions` **tuần tự theo thứ tự mảng** (`apply(ctx)`); extension đăng
   ký factory/component qua `BuildCtx`.
4. Với mỗi `project.controllers` theo thứ tự khai báo: tra factory theo key
   `builtin:<vendor>` / `external:<kind>`; **không có** → `SIM-W001` (cảnh báo,
   bỏ qua controller, vẫn chạy); có → `await adapter.init(cfg, io)`,
   `orchestrator.register('controllers', adapter)`. Lỗi `init` → `SIM-E001`.
5. Trả `SimulationBundle` (`sim`, `tags`, `clock`, `io`, `project`,
   `controllers`, `diagnostics`).

`apps/cli` và `apps/server` dựng danh sách extension tập trung ở **một chỗ**
(`apps/*/src/extensions.ts`) — thêm extension = thêm một dòng. M0 chỉ có
`demoExtension` (`builtin:demo`, `LoopbackController`). Quy ước milestone sau:
M1 `siemensExtension`, M2 `plantExtension` (pha `plant` + `setOwner`),
M4 `commsExtension` (pha `gateways`).

`SimComponent` (`packages/kernel/src/component.ts`, M0 §6.6): `id`, `step(T, dt)`,
`reset()`, `snapshot()`/`restore()` (JSON-serializable, bắt buộc). `step()` trả
`void | Promise<void>` (A1): đường đồng bộ `stepOnce()` gặp Promise → ném
`SIM-E002`; đường async `stepOnceAsync()` `await` từng component tuần tự
(không song song). `ControllerAdapter` thêm `kind`, `init(cfg, io)`,
`getDiagnostics()` (state STOP/RUN/FAULT/DISCONNECTED, `scanCount`,
`lastScanSimMs`, `faults`).

## 6. Server và giao thức

`apps/server` (M0 §8.2, §9):

- **REST**: `GET /api/health` → `{ok: true, version}`; `GET /api/project` →
  `{name, language, stepMs, controllers[], tagCount, diagnostics[]}`.
  Khi có web build (`apps/web/dist/index.html`), phục vụ web tĩnh qua
  `@fastify/static` (fallback `index.html`); chưa có → `GET /` trả 404 JSON
  `web build chưa có (P0.6)`.
- **WebSocket `/ws`**: một kênh JSON, schema zod chung
  (`@vcs/schemas/protocol`, `PROTOCOL_VERSION = 1`; khác → `WS-E001` rồi đóng
  1008). Client → server: `hello`, `sim.command` (`run`/`pause`/`step`/`reset`,
  `steps` 1..10 000), `sim.timeScale`, `tags.subscribe` (`'*'` hoặc tên tag),
  `tags.unsubscribe`, `tag.write`. Server → client: `welcome`, `sim.state`,
  `tags.snapshot` (ngay sau subscribe: `defs` + `values` + `simTimeMs`),
  `tags.delta` (`[index, value][]`, index là vị trí trong `defs`),
  `diagnostics`, `error` (`{code, message, ref?}`).
- **Delta 10 Hz, last-write-wins** (`apps/server/src/ws.ts`): server gom thay
  đổi từ **một** subscriber `'*'` của TagDB vào bộ đệm LWW theo handle, phát
  `tags.delta` theo nhịp `VCS_UI_RATE_HZ` (mặc định 10 Hz) cho từng kết nối đã
  subscribe (lọc theo handle). `sim.state` gửi ≤ 10 Hz và khi đổi trạng thái.
- **Giới hạn**: message ≤ 64 KB (vượt → đóng 1009 tường minh, OQ-056 — không
  dựa vào `maxPayload` của `ws` vì frame 1009 đua với teardown, Windows thấy
  1006); kiểm Origin (chỉ localhost/origin dev đã cấu hình, sai → 403); tối đa
  8 kết nối (thừa → 1013). Cấu hình qua env: `VCS_PORT=4170`,
  `VCS_HOST=127.0.0.1`, `VCS_LOG_LEVEL=info`, `VCS_UI_RATE_HZ=10`.
- **Bảo mật M0**: bind mặc định `127.0.0.1`, không auth — chỉ dùng trên máy
  cục bộ/mạng tin cậy; `--host 0.0.0.0` in cảnh báo (README § Bảo mật).

## 7. Web và CLI

**Web** (`apps/web`, M0 §8.3): React 19 + Vite + Tailwind v4 + Zustand +
`@tanstack/react-virtual`. Chỉ **một** trang Tags ở M0 (không trang giữ chỗ):
header (tên dự án, badge kết nối, đổi ngôn ngữ vi/en, dark mode), Sim bar
(Run/Pause, Step 1 bước, Reset, chọn tốc độ 0.1×–max, hiển thị `simTime`
`mm:ss.mmm` + ms, `stepCount`, trạng thái, cảnh báo `lagging` kèm
`achievedScale`), bảng Tags ảo hóa (≥ 20 000 dòng; cột Tên/Kiểu/Vùng/Địa chỉ/
Controller/Mô tả/Giá trị; lọc chuỗi + controller/vùng; ô đổi màu nháy khi giá
trị đổi; Bool hiện `TRUE/FALSE` có chấm màu + chữ), Diagnostics panel
(`project.diagnostics` dạng thu gọn).

- **State**: Zustand; cập nhật giá trị gom theo `requestAnimationFrame`, không
  render lại toàn bảng mỗi message. WS client tự nối lại với backoff 0.5 s →
  5 s (OQ-059), gửi lại `hello` + `subscribe`; write lúc mất kết nối thì bỏ.
- **Ghi tag**: ô giá trị cho tag `free` sửa được (Bool: nút bật/tắt; số: nhập,
  chỉ kiểm cú pháp, khoảng do server quyết — TAG-E001). Ô non-free hiển thị
  giá trị + nút **"Ghi thử"** (A19/OQ-062): bấm gửi `tag.write` thật, server trả
  `TAG-E002`, UI hiện thông báo, giá trị không đổi.
- **i18n**: `t('key')`, từ điển `vi`/`en`; mặc định theo `project.language`,
  lưu `localStorage['vcs.lang']`. Dark mode mặc định `prefers-color-scheme`,
  class `.dark`, lưu `localStorage['vcs.theme']`.
- Web chỉ import `@vcs/schemas` (depcheck ép; `web-deps`). Dev: Vite proxy
  `/api` + `/ws` → `127.0.0.1:4170`.

**CLI** (`apps/cli`, M0 §8.1): khung commander, mỗi lệnh một file
`apps/cli/src/commands/*.ts`, đăng ký ở `commands/index.ts`.

| Lệnh | Hành vi |
|---|---|
| `vcs version` | In version |
| `vcs validate <dir> [--json]` | Nạp dự án, in diagnostics (`formatDiagnostic`); exit `0` (không error; warning vẫn 0), `2` (có error), `3` (sai tham số/không tìm thấy thư mục) |
| `vcs run <dir> [--steps N \| --until 5s] [--step-ms N] [--watch TAG,TAG] [--csv file] [--hash] [--json]` | Headless: `runSteps`/`runUntil`; in giá trị cuối các tag; `--csv` ghi chuỗi thay đổi theo bước; `--hash` in `TraceHasher.hash()`; không có controller đăng ký → cảnh báo `SIM-W001` nhưng vẫn chạy |
| `vcs serve <dir> [--port 4170] [--host 127.0.0.1] [--open]` | Chạy server (mục 6) |

**Ví dụ** (`examples/hello-tags`, M0 §10): 12 tag, 1 controller demo
(`PLC1`, loopback: `BTN_START → LAMP_RUN`, `SW_AUTO → LAMP_AUTO` đảo,
`LAMP_HEARTBEAT` blink 500 ms, `SCAN_CNT` counter). `stepMs = plcScanMs = 10`,
`seed = 1`. Tag `M`/`DB` (`%M0.0`, `DB1.DBW0`) có trong catalog nhưng **không**
vào TagDB.

## 8. Lỗi và chẩn đoán

Mọi lỗi người dùng là `Diagnostic { code, severity, message, file?, line?,
col?, hint? }`, mã đăng ký trong `DiagnosticCatalog`
(`packages/schemas/src/diagnostics-catalog.ts`). M0 có **24 mã** (PRJ 12 E +
2 W, SIM 3 E + 1 W, TAG 3, WS 3) — danh sách đầy đủ: `docs/diagnostics.md`
(sinh tự động bằng `pnpm docs:diagnostics`, CI chạy `--check`; **không sửa
tay**, D8). Mỗi mã có ≥ 1 test; mỗi quy tắc spec đánh số có test tương ứng.

Lỗi component không làm sập kernel: policy `'throw'` (test/CLI) lan truyền
`SimComponentError`; `'isolate'` (server) đánh dấu faulted + phát `SIM-E001`
+ `componentFault`. Lệnh `post()` lỗi → diagnostic `SIM-E001`, các lệnh còn
lại vẫn chạy. Không nuốt lỗi (`catch {}` rỗng bị cấm).

## 9. Test, bench và CI

- **Test** (`pnpm test`, Vitest workspace, `--coverage`): 439 test, 35 file
  (P0.7). Ngưỡng coverage dòng theo M0 §13: `kernel` ≥ 85%, `schemas` ≥ 85%,
  `project` ≥ 80% — đo: kernel 97,66%, schemas 95,92%, project 97,83%
  (P0.7, `vitest.config.ts` ngưỡng theo glob). Golden timeline tính tay T1–T8
  (orchestrator) + S1 (server) làm chuẩn; property test (fast-check) cho
  TagDB/orchestrator/duration.
- **E2E** (`pnpm test:e2e`, Playwright): E1–E5 trên `hello-tags` (M0 §12.3):
  load, run/pause/step/reset, ghi tag free, ghi thử tag non-free → TAG-E002,
  `timeScale max`. Cuộn 20 000 dòng ≥ 50 FPS đo tay (không vào CI).
- **Bench** (`pnpm bench` → `bench/results.json`, gitignored, D8): TagDB
  set/get ≥ 10M ops/s; flush 5 000 tag/0 đổi ≤ 50 µs; flush 1 000 đổi + 1 sub
  ≤ 1 ms; heap < 1 MB sau 10M ops; orchestrator "rỗng" (5 000 tag, 4
  controller demo, 8 rule loopback + counter + blink, A17) ≥ 100 000 bước/s;
  drift event loop ≤ 50 ms ở `timeScale max` (đo trên máy yên, A18).
  Baseline commit ở `bench/baseline.json` (trung vị 5 mẫu, P0.7);
  `scripts/check-bench-regression.mjs` so sánh `results.json` với baseline,
  vượt > 20% → `::warning::` (không fail). Hồi quy > 20% → cảnh báo CI.
- **CI** (`.github/workflows/ci.yml`, M0 §13, sửa bởi A16 — chỉ Node 22):
  push + PR. Job `check` (ubuntu): lint → typecheck → depcheck →
  `docs:diagnostics --check` → `review:cheats`. Job `test`
  (ubuntu/windows × Node 22): `pnpm test` (kèm coverage). Job `e2e`
  (ubuntu): build + Playwright chromium. Job `bench` (tay/nightly): `pnpm
  bench` + so sánh hồi quy + upload artifact `bench/results.json`.

## 10. Thêm package / extension / lệnh CLI

- **Thêm package**: tạo `packages/<tên>/` với `package.json` (`exports` →
  `src/index.ts`, `workspace:*` ở nơi dùng), khai báo đồ thị cho phép ở M0
  §3.5 + `.dependency-cruiser.cjs`, thêm test + cập nhật bảng §2 ở đây.
  Dependency mới: ghim phiên bản chính xác, ≥ 14 ngày tuổi, cần ADR nếu lớn.
- **Thêm extension**: implement `SimulationExtension` (`apply(ctx)`), đăng ký
  factory qua `ctx.registerController(key, factory)` hoặc component qua
  `ctx.register(phase, component)`; thêm **một dòng** vào
  `apps/cli/src/extensions.ts` và `apps/server/src/extensions.ts`.
- **Thêm lệnh CLI**: tạo `apps/cli/src/commands/<tên>.ts` (export hàm lệnh trả
  exit code 0/2/3 theo quy ước §7), đăng ký ở `commands/index.ts`, thêm test
  cùng lúc (mỗi mã thoát ≥ 1 test).
- **Thêm mã chẩn đoán**: đăng ký ở `DiagnosticCatalog` (D6), chạy
  `pnpm docs:diagnostics` để sinh lại `docs/diagnostics.md`, thêm ≥ 1 test
  phát ra mã đó.

## 11. Những gì M0 KHÔNG có (thuộc milestone sau)

- SoftPlc S7 / OB1 / FB / DB / timer thật — M1 (LoopbackController chỉ là
  demo: copy/blink/counter).
- Plant model, import I/O list + C&E — M2.
- Test tự động từ I/O list, báo cáo FAT — M3 (chỉ có hook `beforeExternals`/
  `afterStep` + `TraceHasher` làm nền).
- OPC UA/Modbus/S7 gateway, HMI, SCADA — M4 (chỉ có pha `gateways` trống).
- PLCSIM Advanced, TIA Openness, SimaticML — M5.
- PWA — P0.9 (hoãn sau M0, D-005). Worker transport — tùy chọn sau (A10).
