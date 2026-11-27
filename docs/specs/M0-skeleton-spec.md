# M0 — Skeleton: Đặc tả chi tiết

## Mục lục

- [1. Mục tiêu và phạm vi](#1-mục-tiêu-và-phạm-vi)
  - [1.1 Mục tiêu](#11-mục-tiêu)
  - [1.2 Ngoài phạm vi M0 (không làm, không làm tạm)](#12-ngoài-phạm-vi-m0-không-làm-không-làm-tạm)
- [2. Đối chiếu và điều chỉnh so với PRD, M1, M2, M3](#2-đối-chiếu-và-điều-chỉnh-so-với-prd-m1-m2-m3)
- [3. Cấu trúc repo và công cụ](#3-cấu-trúc-repo-và-công-cụ)
  - [3.1 Cây thư mục (M0 tạo; chỉ tạo package có nội dung)](#31-cây-thư-mục-m0-tạo-chỉ-tạo-package-có-nội-dung)
  - [3.2 Quyết định công cụ](#32-quyết-định-công-cụ)
  - [3.3 Scripts gốc (`package.json`)](#33-scripts-gốc-packagejson)
  - [3.4 Chuẩn hóa đa nền tảng (bắt buộc)](#34-chuẩn-hóa-đa-nền-tảng-bắt-buộc)
  - [3.5 Đồ thị phụ thuộc cho phép (dependency-cruiser ép buộc)](#35-đồ-thị-phụ-thuộc-cho-phép-dependency-cruiser-ép-buộc)
  - [3.6 Lint đặc thù dự án](#36-lint-đặc-thù-dự-án)
- [4. Package `schemas`](#4-package-schemas)
  - [4.1 Kiểu dùng chung (`common.ts`)](#41-kiểu-dùng-chung-commonts)
  - [4.2 Thời lượng (`duration.ts`) — chuẩn dùng chung](#42-thời-lượng-durationts-chuẩn-dùng-chung)
  - [4.3 YAML có vị trí (`yaml.ts`)](#43-yaml-có-vị-trí-yamlts)
  - [4.4 Schema `vcs.project.yaml` (`project.ts`)](#44-schema-vcsprojectyaml-projectts)
  - [4.5 Schema `tags.yaml` (`tags.ts`) — dạng cuối (khớp M2 §4.1)](#45-schema-tagsyaml-tagsts-dạng-cuối-khớp-m2-41)
  - [4.6 Schema giao thức WebSocket (`protocol.ts`) — mục 9.2](#46-schema-giao-thức-websocket-protocolts-mục-92)
- [5. Package `project`](#5-package-project)
- [6. Package `kernel`](#6-package-kernel)
  - [6.1 SimClock](#61-simclock)
  - [6.2 TagDB (theo handle, thông báo theo lô)](#62-tagdb-theo-handle-thông-báo-theo-lô)
  - [6.3 IoBus (cài đặt trên TagDB)](#63-iobus-cài-đặt-trên-tagdb)
  - [6.4 Pacer (kiểm soát tốc độ, **không** ảnh hưởng logic)](#64-pacer-kiểm-soát-tốc-độ-không-ảnh-hưởng-logic)
  - [6.5 TagCatalog](#65-tagcatalog)
  - [6.6 SimComponent, ControllerAdapter, giao diện bổ sung](#66-simcomponent-controlleradapter-giao-diện-bổ-sung)
  - [6.7 SimulationOrchestrator](#67-simulationorchestrator)
  - [6.8 Builder và cơ chế extension](#68-builder-và-cơ-chế-extension)
  - [6.9 TraceHasher (kiểm chứng tất định)](#69-tracehasher-kiểm-chứng-tất-định)
  - [6.10 Controller demo `loopback` (`@vcs/kernel/demo`)](#610-controller-demo-loopback-vcskerneldemo)
- [7. Package `test-utils`](#7-package-test-utils)
- [8. Apps](#8-apps)
  - [8.1 `apps/cli` (`vcs`)](#81-appscli-vcs)
  - [8.2 `apps/server`](#82-appsserver)
  - [8.3 `apps/web`](#83-appsweb)
- [9. Giao thức web ↔ server](#9-giao-thức-web-server)
  - [9.1 Nguyên tắc](#91-nguyên-tắc)
  - [9.2 Thông điệp](#92-thông-điệp)
- [10. Ví dụ `examples/hello-tags`](#10-ví-dụ-exampleshello-tags)
- [11. Tài liệu, ADR và `AGENTS.md`](#11-tài-liệu-adr-và-agentsmd)
- [12. Chiến lược test và hiệu năng](#12-chiến-lược-test-và-hiệu-năng)
  - [12.1 Số lượng test tối thiểu](#121-số-lượng-test-tối-thiểu)
  - [12.2 Property-based (fast-check)](#122-property-based-fast-check)
  - [12.3 E2E (Playwright)](#123-e2e-playwright)
  - [12.4 Hiệu năng (`pnpm bench`, lưu `bench/results.json`, hồi quy > 20% → cảnh báo CI)](#124-hiệu-năng-pnpm-bench-lưu-benchresultsjson-hồi-quy-20-cảnh-báo-ci)
- [13. CI (`.github/workflows/ci.yml`; tương đương cho GitLab nếu dùng)](#13-ci-githubworkflowsciyml-tương-đương-cho-gitlab-nếu-dùng)
- [14. Kế hoạch triển khai và prompt cho AI](#14-kế-hoạch-triển-khai-và-prompt-cho-ai)
  - [Prompt mẫu](#prompt-mẫu)
- [15. Tiêu chí nghiệm thu M0 (tất cả phải đạt)](#15-tiêu-chí-nghiệm-thu-m0-tất-cả-phải-đạt)
- [16. Quyết định mặc định (để AI không dừng hỏi)](#16-quyết-định-mặc-định-để-ai-không-dừng-hỏi)
- [17. Việc của chủ sản phẩm (song song)](#17-việc-của-chủ-sản-phẩm-song-song)

> Thuộc dự án VCS (xem `PRD.md`: M0, mục 7, 8; Prompt 0 ở mục 14). Phiên bản: 0.1 (2026-11-21).
> Thời lượng dự kiến: **4–6 ngày công**. Là nền móng cho M1 (soft-PLC), M2 (plant + import I/O), M3 (test automation).
> Quy ước như các spec khác: spec thắng kiến thức sẵn có của AI; chỗ chưa chắc có giá trị mặc định + `VERIFY`; tình huống ngoài spec → chọn phương án đơn giản, ghi `docs/open-questions.md`, thêm test thể hiện lựa chọn.

**Vì sao M0 quan trọng:** M1–M3 đã giả định nhiều thứ (TagDB, IoBus, orchestrator, hooks, snapshot, Diagnostic...). M0 phải dựng **đúng những giao diện đó** để các milestone sau cắm vào mà không phải viết lại. Mục 2 liệt kê các điều chỉnh so với PRD/M1–M3 — **đọc mục 2 trước**.

---

## 1. Mục tiêu và phạm vi

### 1.1 Mục tiêu
1. Monorepo chạy được trên **Windows và Linux**: pnpm + Turborepo, TypeScript strict, lint, test, CI.
2. Package `schemas`: kiểu dùng chung (`TagValue`, `DataType`, `Diagnostic`...), schema zod cho `vcs.project.yaml` / `tags.yaml`, parser YAML **báo lỗi có dòng/cột**, parser thời lượng, schema giao thức WebSocket.
3. Package `kernel`: `SimClock`, `TagDB` (theo handle, thông báo theo lô), `IoBus`, `SimulationOrchestrator` (phases, hooks, snapshot/reset), builder + cơ chế **extension**, `Pacer`, trace hash, controller demo `loopback`.
4. Package `project`: nạp dự án từ thư mục (`ProjectFS`), băm file ổn định giữa các hệ điều hành.
5. `apps/cli` (`vcs validate | run | serve | version`), `apps/server` (Fastify + WebSocket + SimulationService), `apps/web` (React: Sim bar + bảng Tags thời gian thực).
6. Quy tắc cho AI/người: `AGENTS.md`, lint cấm thời gian/ngẫu nhiên thật ở package lõi, dependency-cruiser ép đồ thị phụ thuộc.

### 1.2 Ngoài phạm vi M0 (không làm, không làm tạm)
Runtime PLC (M1), plant engine/import I/O (M2), test runner (M3), OPC UA/Modbus (M4), editor code/HMI designer, auth/multi-user, Docker (làm nếu còn thời gian, P1), Worker transport cho UI (mục 2, mục 9).

---

## 2. Đối chiếu và điều chỉnh so với PRD, M1, M2, M3

Các điểm dưới đây **thay thế** nội dung tương ứng ở spec cũ (AI phải theo bảng này; chủ sản phẩm nên đọc kỹ).

| # | Chủ đề | Spec cũ nói | M0 quyết định |
|---|---|---|---|
| 1 | `ControllerAdapter.step` | M1 §10: `Promise<void>` | **`void \| Promise<void>`**; `SoftPlc.step` phải **đồng bộ** (trả `void`). Orchestrator có đường đồng bộ nhanh `stepOnce()` cho controller builtin và `stepOnceAsync()` cho controller ngoài |
| 2 | `ControllerAdapter` | PRD 8.4: không có snapshot | Thêm **`snapshot()` / `restore()` bắt buộc** (JSON-serializable) |
| 3 | `TagValue` | PRD: có `bigint` | **`boolean \| number \| string`** (không `bigint`; DWord dùng number, LReal dùng number) |
| 4 | `TagDB.write` | PRD/M2: `write(name, v, {source})` | `write(ref: string \| TagHandle, v, source = 'system')` — tham số `source` thẳng, không object (tránh cấp phát). Thêm API theo **handle** (M2 mục 5.6 yêu cầu) |
| 5 | `SimClock` | PRD: có `setTimeScale` | **Bỏ** `setTimeScale` khỏi clock; tốc độ thuộc **`Pacer`** (M3 §6.4) — logic không phụ thuộc tốc độ. Thời gian mô phỏng là **số nguyên ms** |
| 6 | Orchestrator | M2 §5.1, M3 §6.1 vá thêm hooks/snapshot | M0 đã có sẵn: phases, `StepHooks`, `snapshotAll/restoreAll/resetAll/stepOnce` (M3 §6.1 **không còn phải vá**; M2 chỉ cắm `PlantEngine` làm component pha `plant`) |
| 7 | `IoBusImpl` | M2 §2 liệt kê trong M2 | **M0 cài đặt** (trên TagDB); M2 chỉ dùng |
| 8 | `Diagnostic` | M1 định nghĩa trong `runtime-iec/diagnostics.ts` | **Định nghĩa chuẩn ở `@vcs/schemas`**; `runtime-iec` import và mở rộng (`RuntimeFault` vẫn ở runtime-iec) |
| 9 | Schema `tags.yaml` | PRD 8.2 dùng `plantRef`; M2 §4.1 đổi sang `equipment`+`role` | M0 dùng **dạng cuối của M2 §4.1** ngay từ đầu (không migration) |
| 10 | Nơi chạy mô phỏng | PRD: kernel isomorphic; M1 §11: Web Worker | **Mô phỏng chạy trong server Node** (1 process: nạp dự án, mô phỏng, sau này cả truyền thông); UI giao tiếp WebSocket. Giao thức trừu tượng, **Worker transport là tùy chọn sau**. M1 §11 "Web Worker" → thay bằng server (WS) là mặc định |
| 11 | `Pacer` | M3 `testing/exec/pace.ts` | **`Pacer` nằm ở `@vcs/kernel`**; M3 chỉ tái sử dụng |
| 12 | Phân biệt tag | M1/M2 lẫn lộn tag I/Q và tag M/DB | **`TagDB` chỉ chứa tag vùng `I`/`Q`** (biên giới plant↔PLC, virtual input). Tag `M`/`DB` nằm trong **`TagCatalog`** (metadata) và đọc/ghi qua `ControllerAdapter` (giao diện `ControllerIntrospection`, mục 6.6) |
| 13 | Thời lượng | M3 §3.2 tự định nghĩa | **Parser chuẩn ở `@vcs/schemas`** (`parseDuration`), M3 tái sử dụng |
| 14 | CLI | M1–M3 giả định lệnh `vcs ...` | M0 dựng khung `apps/cli` (commander); các milestone sau **thêm file lệnh** vào `apps/cli/src/commands/` |
| 15 | Package mới | PRD mục 7.2 | Thêm `@vcs/project` (nạp dự án) và `@vcs/test-utils` (tiện ích test) |

---

## 3. Cấu trúc repo và công cụ

### 3.1 Cây thư mục (M0 tạo; chỉ tạo package có nội dung)
```
vcs/
  AGENTS.md  README.md  CONTRIBUTING.md  LICENSE(tùy)
  package.json  pnpm-workspace.yaml  turbo.json  .npmrc  .nvmrc  .gitattributes  .editorconfig
  tsconfig.base.json  eslint.config.js  .prettierrc  .dependency-cruiser.cjs  vitest.workspace.ts
  .github/workflows/ci.yml
  apps/
    cli/      server/      web/
  packages/
    schemas/  kernel/  project/  test-utils/
  examples/
    hello-tags/
  docs/
    PRD.md  architecture.md  semantics.md  open-questions.md  diagnostics.md
    adr/0001-… 0006-…
  scripts/
    gen-bench-project.ts  check-diagnostic-codes.ts
  bench/
```
Các package `runtime-iec`, `vendor-siemens`, `plant`, `importers`, `testing`, `comms`, `hmi` **do milestone tương ứng tạo**; M0 chỉ khai báo chúng trong đồ thị phụ thuộc (mục 3.5).

### 3.2 Quyết định công cụ

| Hạng mục | Quyết định |
|---|---|
| Node | `engines: ">=20.11"`, `.nvmrc` = bản LTS hiện hành (22 hoặc mới hơn); CI chạy 20 và 22 |
| Trình quản lý | pnpm (khóa bằng `packageManager` trong `package.json`), `.npmrc`: `save-exact=true`, `engine-strict=true`, `auto-install-peers=true` |
| Lockfile | Commit `pnpm-lock.yaml`; CI dùng `pnpm install --frozen-lockfile` |
| Phiên bản thư viện | Dùng bản ổn định mới nhất lúc cài, **ghim chính xác**; không dùng bản phát hành dưới 14 ngày |
| TypeScript | strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride` + `verbatimModuleSyntax`; ESM (`"type": "module"`); `moduleResolution: "bundler"` |
| Package nội bộ | **JIT (không build)**: `exports` trỏ thẳng `./src/index.ts`; Vite, Vitest, tsx tiêu thụ trực tiếp. Chỉ `apps/server` và `apps/cli` được **bundle bằng tsup** khi `pnpm build` |
| Test | Vitest (workspace) + fast-check (property) + Playwright (e2e) |
| Lint | ESLint flat config + typescript-eslint (strict-type-checked) + Prettier |
| Kiểm tra phụ thuộc | dependency-cruiser (`pnpm depcheck`) |
| Log | `pino` ở server; CLI dùng console (hỗ trợ `--json`) |
| Hash | `@noble/hashes` (sha256 đồng bộ, dùng chung Node/browser) |
| YAML | `yaml` (eemeli) — cần thông tin vị trí (range/LineCounter) |
| Bảng ảo hóa (web) | `@tanstack/react-virtual` |
| Web | React + Vite + Tailwind + Zustand + React Router; i18n tự viết nhẹ (`t(key)`) |
| Server | Fastify + `@fastify/websocket` + `@fastify/static` |
| CLI | commander |

Quy ước package: scope `@vcs/*` (private). Tên: `@vcs/schemas`, `@vcs/kernel`, `@vcs/project`, `@vcs/test-utils`, `@vcs/server`, `@vcs/cli`, `@vcs/web`.

### 3.3 Scripts gốc (`package.json`)
`dev` (turbo: server watch + vite), `build`, `test`, `test:e2e`, `lint`, `typecheck`, `format`, `depcheck`, `bench`, `docs:diagnostics`, `vcs` (chạy CLI từ source bằng tsx). **Không** dùng cú pháp shell riêng (bash/PowerShell); dùng `cross-env` và script Node để chạy được trên Windows.

### 3.4 Chuẩn hóa đa nền tảng (bắt buộc)
- `.gitattributes`: `* text=auto eol=lf`; `.editorconfig` LF, UTF-8, không BOM.
- Đường dẫn trong dự án (`ProjectFS`, kết quả, báo cáo) luôn **dùng `/`** và tương đối gốc dự án.
- Hash file **chuẩn hóa văn bản**: bỏ BOM, đổi CRLF → LF trước khi băm (cùng nội dung → cùng hash trên Windows/Linux).
- Test chạy trong CI **cả `ubuntu-latest` và `windows-latest`**.

### 3.5 Đồ thị phụ thuộc cho phép (dependency-cruiser ép buộc)

| Package | Được import |
|---|---|
| `schemas` | (không package nội bộ) |
| `kernel` | `schemas` |
| `project` | `schemas` |
| `test-utils` | `schemas`, `kernel` |
| `runtime-iec` (M1) | `schemas`, `kernel` |
| `vendor-siemens` (M1) | `schemas`, `runtime-iec` |
| `plant` (M2) | `schemas`, `kernel` |
| `importers` (M2) | `schemas`, `plant` (chỉ `registry`) |
| `comms` (M4) | `schemas`, `kernel` |
| `testing` (M3) | `schemas`, `kernel`, `plant`, `runtime-iec`, `importers` |
| `apps/server`, `apps/cli` | tất cả package trên |
| `apps/web` | `schemas` (chỉ kiểu + schema giao thức; **không** `kernel`/`runtime-iec`) |

Ngoài ra: cấm import ngược (package nhỏ không import app); cấm vòng; cấm import file nội bộ (`../../x/src/...`) xuyên package — chỉ qua `exports`.

### 3.6 Lint đặc thù dự án
- **Cấm thời gian/ngẫu nhiên thật** trong `schemas`, `kernel`, `project`, `runtime-iec`, `vendor-*`, `plant`, `testing/src/{dsl,expr,exec,ce}`:
  `Date.now`, `new Date()` (không đối số), `performance.now`, `Math.random`, `crypto.randomUUID/getRandomValues`.
  Ngoại lệ (allow-list theo file): `kernel/src/pacer.ts`, `apps/*`, `testing/src/{runner,report}`.
  Cài bằng `no-restricted-properties` + `no-restricted-syntax` theo `overrides.files`; **có test** (một file mẫu vi phạm phải làm ESLint thất bại).
- `@typescript-eslint/no-explicit-any: error`; `no-floating-promises`; `consistent-type-imports`; `no-non-null-assertion: warn`; `no-console` (trừ `apps/cli`).
- `eqeqeq`, `no-param-reassign` (props: false), `prefer-const`.

---

## 4. Package `schemas`

### 4.1 Kiểu dùng chung (`common.ts`)
```ts
export type DataType =
  | 'Bool' | 'Byte' | 'Word' | 'DWord' | 'SInt' | 'USInt' | 'UInt' | 'UDInt'
  | 'Int' | 'DInt' | 'Real' | 'LReal' | 'Time' | 'String';   // String: dành sẵn, M1–M3 chưa dùng
export type TagValue = boolean | number | string;
export type SignalKind = 'DI' | 'DO' | 'AI' | 'AO';
export type IoArea = 'I' | 'Q';
export type MemArea = IoArea | 'M' | 'DB';
export type Unsub = () => void;

export interface SrcRef { file: string; line: number; col: number; endLine?: number; endCol?: number }  // 1-based

export interface Diagnostic {
  code: string;                        // ví dụ 'PRJ-E003'
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string; line?: number; col?: number; endLine?: number; endCol?: number;
  hint?: string;
  related?: SrcRef[];
}
```
- Hàm tiện ích: `diag(code, severity, message, loc?, hint?)`, `formatDiagnostic(d)` → `file:line:col error CODE: message` + dòng `hint: ...`; `hasErrors(list)`; `sortDiagnostics` (file, line, col, code — ổn định).
- **`DiagnosticCatalog`** (`diagnostics-catalog.ts`): `defineDiagnostics({ 'PRJ-E001': { severity, title, hint? }, ... })` đăng ký mã; script `check-diagnostic-codes.ts` quét mã trong source và **thất bại nếu có mã không đăng ký**; `pnpm docs:diagnostics` sinh `docs/diagnostics.md`. Các milestone sau đăng ký thêm (IO-*, PL-*, TS-*, CE-*...).

### 4.2 Thời lượng (`duration.ts`) — chuẩn dùng chung
- Cú pháp: nối tiếp các đoạn `số + đơn vị`, đơn vị `ms | s | m | h` (không phân biệt hoa/thường), số có thể thập phân (`1.5s`), có thể dấu `-` đầu: `500ms`, `3s`, `1m30s`, `2h`, `-2s`.
- `parseDuration(text): number` → **ms nguyên**; kết quả không nguyên (`0.5ms`) hoặc cú pháp sai → ném `DurationError` (có `position`). `tryParseDuration` trả `{ok, value} | {ok:false, error}`.
- `formatDuration(ms): string` → dạng ngắn gọn (`90000` → `1m30s`, `0` → `0ms`). `parse(format(x)) === x` (property test).
- Schema zod `durationSchema` chấp nhận chuỗi hoặc số (số = ms).

### 4.3 YAML có vị trí (`yaml.ts`)
```ts
export function parseYamlWithSchema<T>(
  file: string, text: string, schema: ZodType<T>, opts?: { allowUnknownKeys?: boolean }
): { value?: T; diagnostics: Diagnostic[] };
```
Hành vi bắt buộc:
- Lỗi cú pháp YAML → `PRJ-E002` với **dòng/cột** của lỗi.
- Lỗi schema (zod) → `PRJ-E003`: định vị bằng cách **ánh xạ `issue.path` → node YAML → (line, col, endLine, endCol)**; thông điệp thân thiện, ví dụ `tags[3].signal.kind: giá trị 'DX' không hợp lệ (cho phép: DI, DO, AI, AO)`.
- Khóa lạ (`unrecognized_keys`) → **cảnh báo** `PRJ-W001` (không phải lỗi), kèm gợi ý "ý bạn là `...`?" (Levenshtein ≤ 2); giá trị vẫn được trả về (khóa lạ bị bỏ).
- Nhiều lỗi → báo hết (tối đa 100), sắp theo vị trí.
- Chuẩn hóa đầu vào: bỏ BOM, CRLF → LF; tab trong YAML → lỗi cú pháp rõ ràng.

### 4.4 Schema `vcs.project.yaml` (`project.ts`)
```yaml
schemaVersion: 1                   # bắt buộc
name: Crusher Line 1
language: vi                       # vi | en (mặc định 'vi')
seed: 1                            # số nguyên, mặc định 1
simulation:
  stepMs: 10                       # nguyên ≥ 1, mặc định 10
  plcScanMs: 20                    # nguyên ≥ stepMs, khuyến nghị bội của stepMs (PL-W001 ở M2); mặc định = stepMs
  timeScale: 1                     # số > 0 hoặc "max"; chỉ là mặc định của UI
files:                             # đường dẫn tương đối, mặc định như dưới
  tags: tags/tags.yaml
controllers:
  - id: PLC1
    mode: builtin                  # builtin | external
    vendor: siemens                # builtin: bắt buộc (siemens | rockwell | abb | demo)
    model: S7-1500
    config: { }                    # tự do theo vendor (M1: scanPeriodMs, faultPolicy...)
  - id: PLC2
    mode: external
    adapter: opcua                 # opcua | modbus | s7 | plcsim-advanced
    endpoint: opc.tcp://192.168.0.10:4840
    config: { }
```
- `controllers` là **discriminated union theo `mode`**; `id` duy nhất, khớp `^[A-Za-z][A-Za-z0-9_-]{0,31}$`.
- `schemaVersion` khác 1 → `PRJ-E006` (kèm hướng dẫn migrate); có `migrate.ts` với bảng `migrations` (rỗng ở M0, nhưng đường đi hoàn chỉnh: `migrateProject(doc) → {doc, applied[]}` và test).

### 4.5 Schema `tags.yaml` (`tags.ts`) — dạng cuối (khớp M2 §4.1)
```ts
interface TagDef {
  name: string;                      // ^[A-Za-z_][A-Za-z0-9_.\-]{0,127}$
  type: DataType;
  area: MemArea;                     // I | Q | M | DB
  address: string;                   // kiểm tra nhẹ (regex); M1 parse đầy đủ
  controller: string;                // phải tồn tại trong project.controllers
  description?: string;
  initial?: TagValue;                // giá trị khởi tạo (mặc định theo kiểu: false/0)
  signal?: {
    kind: SignalKind | null;
    scaling?: { rawMin: number; rawMax: number; engMin: number; engMax: number; unit?: string };  // chỉ AI/AO
    polarity?: 'NO' | 'NC';
  };
  origin?: { file: string; sheet?: string; row?: number };
  provenance?: 'import' | 'manual';
  equipment?: string;                // bản sao denormalized (equipment.yaml là nguồn thật, M2)
  role?: string;
}
```
Kiểm tra chéo (`superRefine`, mỗi lỗi có vị trí):
- `signal.kind` DI/AI ⇒ `area === 'I'`; DO/AO ⇒ `area === 'Q'` (mã `PRJ-E010`).
- `scaling` chỉ hợp lệ khi kind AI/AO (`PRJ-E011`); `rawMin !== rawMax`, `engMin !== engMax` (`PRJ-E012`).
- DI/DO ⇒ `type === 'Bool'`; AI/AO ⇒ kiểu số (`PRJ-E013`).
- `initial` đúng kiểu (`Bool` ↔ boolean, số ↔ number trong khoảng) (`PRJ-E014`).
- Tên trùng **không phân biệt hoa/thường** (`PRJ-E004`, báo cả hai vị trí qua `related`); `controller` không tồn tại (`PRJ-E005`).

Danh mục mã M0: `PRJ-E001` thiếu file bắt buộc, `E002` cú pháp YAML, `E003` vi phạm schema, `E004` trùng tag, `E005` controller không tồn tại, `E006` schemaVersion không hỗ trợ, `E007` `stepMs/plcScanMs` không hợp lệ, `E010–E014` như trên, `W001` khóa lạ, `W002` không có tags.yaml (coi như rỗng), `SIM-W001` không có runtime đăng ký cho controller, `SIM-E001` component lỗi khi chạy, `SIM-E002` component bất đồng bộ trong đường đồng bộ, `SIM-E003` snapshot không tương thích, `TAG-E001` ghi sai kiểu/ngoài khoảng, `TAG-E002` vi phạm quyền sở hữu, `TAG-E003` tag không tồn tại, `WS-E001…` lỗi giao thức.

### 4.6 Schema giao thức WebSocket (`protocol.ts`) — mục 9.2
Zod discriminated union theo `type`; `PROTOCOL_VERSION = 1`; xuất kiểu `ClientMessage`, `ServerMessage`. Web và server **cùng dùng** schema này.

---

## 5. Package `project`

```ts
export interface ProjectFS {
  readText(path: string): Promise<string>;           // path tương đối, dùng '/'
  exists(path: string): Promise<boolean>;
  list(dir: string, opts?: { glob?: string }): Promise<string[]>;
  root: string;
}
export function nodeFS(rootDir: string): ProjectFS;
export function memoryFS(files: Record<string, string>): ProjectFS;   // cho test, và sau này UI

export interface ProjectModel {
  root: string; config: ProjectConfig; tags: TagDef[];
  catalog: TagCatalog;                                // mục 6.5
  files: { path: string; sha256: string }[];          // đã chuẩn hóa văn bản
  hash: string;                                       // sha256 của danh sách (path, sha256) đã sắp xếp
  diagnostics: Diagnostic[];
}
export async function loadProject(fs: ProjectFS): Promise<ProjectModel>;   // không ném lỗi cho dữ liệu sai: trả diagnostics
export function hashText(text: string): string;                            // chuẩn hóa BOM/CRLF rồi sha256
```
- `loadProject` đọc `vcs.project.yaml` (thiếu → `PRJ-E001`), `files.tags` (thiếu → `PRJ-W002`, coi là rỗng), validate (mục 4), kiểm tra chéo (trùng tag, controller tồn tại, `plcScanMs ≥ stepMs`), trả `ProjectModel`. Có `error` ⇒ `ModelValid = false` (các hàm sau từ chối chạy).
- Sắp xếp `tags` **giữ nguyên thứ tự trong file** (quyết định handle trong TagDB); file do tool sinh đã được sắp ổn định (M2).
- `memoryFS` bắt buộc cho test (không đụng đĩa) và Windows/Linux phải cho cùng kết quả.

---

## 6. Package `kernel`

### 6.1 SimClock
```ts
export interface SimClock {
  nowMs(): number;                        // số nguyên ≥ 0
  advance(dtMs: number): void;            // dtMs nguyên > 0, ngược lại ném
  reset(startMs?: number): void;          // mặc định 0
  snapshot(): number;  restore(ms: number): void;
}
export class ManualClock implements SimClock { ... }
```

### 6.2 TagDB (theo handle, thông báo theo lô)
```ts
export type TagHandle = number & { readonly __brand: 'TagHandle' };
export type TagSource = 'plant' | 'plc' | 'test' | 'hmi' | 'gateway' | 'system' | 'import';
export type TagOwner = 'plant' | 'controller' | 'free';
export type Quality = 'good' | 'bad' | 'uncertain';

export interface TagMeta {
  readonly handle: TagHandle; readonly name: string; readonly type: DataType;
  readonly area: IoArea; readonly controller: string; readonly kind: SignalKind | null;
  readonly initial: TagValue; readonly scaling?: TagDef['signal'] extends infer S ? ... : never; // (lấy từ TagDef)
  readonly description?: string;
}
export interface Tag { name: string; type: DataType; value: TagValue; quality: Quality; ts: number; source: TagSource }
export interface TagChange { handle: TagHandle; name: string; oldValue: TagValue; newValue: TagValue; source: TagSource; ts: number; writes: number }

export interface TagDBOptions { validate?: boolean; enforceOwnership?: boolean }   // mặc định: cả hai true trong test/dev, false trong production/bench

export class TagDB {
  constructor(defs: readonly TagDef[], clock: SimClock, opts?: TagDBOptions);  // chỉ nhận tag area 'I'|'Q'; ném nếu gặp M/DB
  // Tra cứu
  handle(name: string): TagHandle | undefined;  has(name: string): boolean;
  meta(h: TagHandle): TagMeta;  names(): readonly string[];  readonly size: number;
  // Đọc/ghi nhanh (không cấp phát)
  get(h: TagHandle): TagValue;
  set(h: TagHandle, v: TagValue, source: TagSource): void;       // alias nhanh của write
  // Đọc/ghi theo tên (tiện, cấp phát khi tra tên)
  read(name: string): Tag;                                        // ném TAG-E003 nếu không tồn tại
  write(ref: string | TagHandle, v: TagValue, source?: TagSource): void;   // mặc định 'system'
  // Sở hữu & kiểm tra
  setOwner(h: TagHandle, owner: TagOwner): void;  owner(h: TagHandle): TagOwner;
  checkWrite(h: TagHandle, source: TagSource): 'ok' | 'denied';
  setQuality(h: TagHandle, q: Quality): void;
  // Thông báo theo lô
  subscribe(sel: '*' | readonly TagHandle[], cb: (changes: readonly TagChange[]) => void): Unsub;
  flush(): void;                                                  // gọi cuối mỗi bước
  // Trạng thái
  snapshot(): TagDBSnapshot;  restore(s: TagDBSnapshot): void;  reset(): void;
}
export interface TagDBSnapshot { namesHash: string; values: TagValue[]; quality: number[]; ts: number[]; source: TagSource[] }
```

**Quy tắc (bắt buộc, có test):**
1. **Handle** = chỉ số theo thứ tự định nghĩa; ổn định trong một phiên; không dùng giữa phiên (UI nhận bảng ánh xạ ở `tags.snapshot`).
2. **Ghi tức thời, thông báo trì hoãn**: `set/write` cập nhật giá trị ngay; subscriber chỉ được gọi ở `flush()`.
3. **`flush()`**: duyệt danh sách "dirty" (không trùng) theo **thứ tự handle tăng dần**; với mỗi tag so với giá trị **đã flush lần trước**; **khác nhau mới phát** (`oldValue` = giá trị flush trước, `newValue` hiện tại, `source` = người ghi cuối, `writes` = số lần ghi trong kỳ). Giá trị quay về như cũ → **không phát**. Subscriber gọi theo thứ tự đăng ký, đồng bộ. Không có subscriber → không cấp phát mảng.
4. **`ts`** của tag = `clock.nowMs()` lúc ghi.
5. **Validate** (khi `validate: true`): `Bool` phải boolean; kiểu số nguyên phải số nguyên trong khoảng kiểu (Int −32768..32767, Word 0..65535, DInt/…); `Real/LReal` chấp nhận mọi số (kể cả NaN/±Infinity); `Time` số nguyên; sai → ném `TagError('TAG-E001')` (không sửa lén, không wrap).
6. **Ownership** (khi `enforceOwnership: true`; luôn có `checkWrite`):
   | owner | nguồn ghi được phép |
   |---|---|
   | `plant` | `plant`, `system` |
   | `controller` | `plc`, `system` |
   | `free` | `test`, `hmi`, `gateway`, `system` |
   Mặc định khi dựng: `kind` DO/AO → `controller`; DI/AI → `free` (**M2** gọi `setOwner(h, 'plant')` khi gán thiết bị); `kind null` → `free`. Vi phạm khi enforce → `TagError('TAG-E002')`. Mã gọi từ người dùng (UI, test, gateway) **phải** gọi `checkWrite` trước (M3 `TS-E010/E011`, server `tag.write`).
7. **Snapshot/restore**: `snapshot()` JSON-serializable; `restore()` kiểm tra `namesHash` (băm danh sách tên theo thứ tự) khớp, sai → `SIM-E003`; sau `restore`/`reset`, `flush()` phát thay đổi so với giá trị flush cuối để UI/trace cập nhật.
8. Hiệu năng (mục 12): không cấp phát trong `get/set` và trong `flush` khi không có thay đổi.

### 6.3 IoBus (cài đặt trên TagDB)
```ts
export interface IoPort {                                  // đường nhanh; M1 có thể dùng sau (tối ưu)
  readonly inputNames: readonly string[];  readonly inputHandles: readonly TagHandle[];
  readonly outputNames: readonly string[]; readonly outputHandles: readonly TagHandle[];
  readInputsInto(target: TagValue[]): void;                // target.length >= inputNames.length
  writeOutputsFrom(src: ArrayLike<TagValue>): void;        // source = 'plc'
}
export interface IoBus {
  readInputs(controllerId: string): Readonly<Record<string, TagValue>>;     // M1/M2 dùng bản này trước
  writeOutputs(controllerId: string, out: Readonly<Record<string, TagValue>>): void;
  port(controllerId: string): IoPort;
}
export class TagDbIoBus implements IoBus { constructor(tags: TagDB) }
```
- Tập input của controller = mọi tag `area 'I'` có `controller === id`; output = mọi tag `area 'Q'`. Thứ tự = thứ tự handle.
- `writeOutputs` ghi bằng `source 'plc'`; tag không phải output của controller → ném `TAG-E002`; không tồn tại → `TAG-E003`.
- `readInputs` trả object mới mỗi lần (tiện cho test); hot path nên dùng `port()` (M1/M2 tối ưu khi cần).

### 6.4 Pacer (kiểm soát tốc độ, **không** ảnh hưởng logic)
```ts
export interface PacerOptions { timeScale: number | 'max'; sliceBudgetMs?: number /*8*/; maxLagMs?: number /*1000*/ }
export class Pacer {
  constructor(now: () => number /* wall ms, truyền từ ngoài */, opts: PacerOptions);
  setTimeScale(x: number | 'max'): void;
  start(simNowMs: number): void;  pause(): void;
  /** Trả số bước cần chạy ngay trong lát này (≥ 0) để bám timeScale, tôn trọng ngân sách thời gian. */
  plan(simNowMs: number, stepMs: number): { steps: number; lagging: boolean; achievedScale: number };
}
```
- Pacer **nhận hàm `now()` từ ngoài** (nên không gọi `performance.now` trực tiếp; file `pacer.ts` vẫn nằm trong allow-list lint). Test dùng đồng hồ giả.
- `timeScale = 'max'`: yêu cầu chạy hết ngân sách mỗi lát (service dùng `setImmediate` để nhường event loop). Tụt quá `maxLagMs` → đặt lại mốc (`lagging = true`) thay vì "đuổi" vô hạn.

### 6.5 TagCatalog
Map **tĩnh** tên → `TagDef` cho **mọi** tag (I/Q/M/DB): `get(name)`, `byController(id)`, `all()`, `has`. Là nguồn cho `TagAddressMap` (M1), danh sách tag cho UI, import (M2). Không giữ giá trị.

### 6.6 SimComponent, ControllerAdapter, giao diện bổ sung
```ts
export type StepResult = void | Promise<void>;

export interface SimComponent {
  readonly id: string;
  step(simTimeMs: number, dtMs: number): StepResult;
  reset(): StepResult;
  snapshot(): unknown;                     // JSON-serializable
  restore(s: unknown): void;
}

export interface ControllerConfig {
  id: string; def: ControllerDef;          // từ project.controllers[i]
  stepMs: number; scanPeriodMs: number;    // scanPeriodMs = def.config.scanPeriodMs ?? simulation.plcScanMs
  tags: readonly TagDef[];                 // mọi tag thuộc controller này (I/Q/M/DB), thứ tự như file
}
export interface ControllerDiagnostics {
  state: 'STOP' | 'RUN' | 'FAULT' | 'DISCONNECTED';
  scanCount: number; lastScanSimMs: number;
  faults: { code: string; message: string; count: number }[];
  info?: Record<string, unknown>;
}
export interface ControllerAdapter extends SimComponent {
  readonly kind: 'builtin' | 'external';
  init(cfg: ControllerConfig, io: IoBus): Promise<void>;
  getDiagnostics(): ControllerDiagnostics;
}
/** Tùy chọn — M1 cài; UI/test dùng để xem/ghi/force tag M/DB và biến nội bộ */
export interface ControllerIntrospection {
  read(ref: string): TagValue;  write(ref: string, v: TagValue): void;
  force(ref: string, v: TagValue): void;  unforce(ref: string): void;
  listForces(): { ref: string; value: TagValue }[];
  start(): void;  stop(): void;           // RUN/STOP
}
export function isIntrospectable(c: ControllerAdapter): c is ControllerAdapter & ControllerIntrospection;
```

### 6.7 SimulationOrchestrator

```ts
export type Phase = 'plant' | 'controllers' | 'gateways';        // thứ tự chạy cố định
export interface StepHooks {
  beforeExternals?(T: number): void;
  afterStep?(T: number): void;
}
export interface ExternalCommand { label: string; run(ctx: { T: number; tags: TagDB }): void }
export interface OrchestratorOptions {
  stepMs: number; seed: number;
  errorPolicy?: 'throw' | 'isolate';                              // mặc định 'throw'; server dùng 'isolate'
}
export interface SimSnapshot {
  format: 'vcs-sim-snapshot'; version: 1;
  simTimeMs: number; stepCount: number;
  tags: TagDBSnapshot; components: Record<string, unknown>; faulted: string[];
}
export interface SimEvents {
  diagnostic: Diagnostic; componentFault: { id: string; phase: Phase; T: number; error: string };
  reset: void; restored: void;
}

export class SimulationOrchestrator {
  constructor(tags: TagDB, clock: SimClock, io: IoBus, opts: OrchestratorOptions);
  readonly tags: TagDB; readonly clock: SimClock; readonly io: IoBus;
  register(phase: Phase, c: SimComponent): void;                  // thứ tự đăng ký = thứ tự chạy trong pha; id duy nhất
  getComponent<T extends SimComponent = SimComponent>(id: string): T | undefined;
  components(phase?: Phase): readonly SimComponent[];
  setHooks(h?: StepHooks): void;
  post(cmd: ExternalCommand): void;                               // chạy ở đầu bước kế tiếp (sau beforeExternals)
  // Chạy
  stepOnce(): void;                                               // đường ĐỒNG BỘ; ném SIM-E002 nếu component trả Promise
  stepOnceAsync(): Promise<void>;                                 // hỗ trợ component bất đồng bộ
  runSteps(n: number): void;  runUntil(simTimeMs: number): void; // đồng bộ
  // Trạng thái
  readonly stepCount: number; readonly simTimeMs: number;
  snapshotAll(): SimSnapshot;  restoreAll(s: SimSnapshot): void;
  resetAll(): void;  resetAllAsync(): Promise<void>;
  on<K extends keyof SimEvents>(ev: K, cb: (p: SimEvents[K]) => void): Unsub;
}
```

**Thuật toán một bước (cố định, quy chuẩn cho M1–M3):**
```
stepOnce():
  T  = clock.nowMs();  dt = opts.stepMs
  hooks.beforeExternals(T)                          // (M3) hành động của test
  drain inbox: với mỗi cmd theo thứ tự post: try cmd.run({T, tags}) catch → emit 'diagnostic'
  for phase in ['plant','controllers','gateways']:
    for c in components[phase] (theo thứ tự đăng ký), bỏ qua c đã 'faulted':
      try { r = c.step(T, dt); nếu r là Promise → ném SIM-E002 }
      catch (e) { policy 'throw' → ném SimComponentError(id, phase, T, cause)
                  policy 'isolate' → đánh dấu faulted, emit 'componentFault' + 'diagnostic' SIM-E001 }
  tags.flush()                                      // thông báo thay đổi (trace, UI) — trước afterStep
  hooks.afterStep(T)                                // (M3) quan sát trạng thái cuối bước T
  clock.advance(dt);  stepCount += 1
```
- `stepOnceAsync` giống hệt nhưng `await` kết quả từng component (tuần tự, không song song).
- **Hệ quả (khớp M2 §5.1):** plant chạy trước controller (PLC thấy giá trị plant của cùng bước); PLC ghi output ở bước `T` thì plant thấy ở bước `T+dt`.
- `post()` gọi giữa các bước → chạy ở đầu bước kế (sau `beforeExternals`); `snapshotAll()` khi hộp thư không rỗng → ném `SIM-E003` ("có lệnh đang chờ").
- `snapshotAll`: `{ simTimeMs, stepCount, tags.snapshot(), components[id] = c.snapshot(), faulted }`; `restoreAll`: kiểm tra `version`, **cùng tập component id** và `namesHash` (sai → `SIM-E003`), khôi phục đồng hồ, tag, từng component (theo thứ tự đăng ký), rồi `tags.flush()` và phát `restored`.
- `resetAll`: xóa hộp thư và `faulted`; `clock.reset(0)`; `stepCount = 0`; `tags.reset()`; mỗi component `reset()` (theo thứ tự đăng ký); `tags.flush()`; phát `reset`. Sau `resetAll`, **cùng cấu hình + cùng seed ⇒ chạy lại cho kết quả giống hệt** (test).
- **Không** có timer/đồng hồ thật trong orchestrator; chạy liên tục + tốc độ là việc của `SimulationService` (apps/server) + `Pacer`.

### 6.8 Builder và cơ chế extension
```ts
export type ControllerKey = `${'builtin' | 'external'}:${string}`;     // 'builtin:siemens', 'builtin:demo', 'external:opcua'
export type ControllerFactory = (def: ControllerDef, ctx: BuildCtx) => ControllerAdapter | Promise<ControllerAdapter>;

export interface BuildCtx {
  project: ProjectModel; tags: TagDB; clock: SimClock; io: IoBus; orchestrator: SimulationOrchestrator;
  registerController(key: ControllerKey, f: ControllerFactory): void;
  register(phase: Phase, c: SimComponent): void;                       // ví dụ M2 đăng ký PlantEngine ở 'plant'
  addDiagnostic(d: Diagnostic): void;
}
export interface SimulationExtension { id: string; apply(ctx: BuildCtx): void | Promise<void> }

export interface SimulationBundle {
  sim: SimulationOrchestrator; tags: TagDB; clock: SimClock; io: IoBus; project: ProjectModel;
  controllers: ControllerAdapter[]; diagnostics: Diagnostic[];
}
export async function createSimulation(
  project: ProjectModel,
  opts?: { extensions?: SimulationExtension[]; errorPolicy?: 'throw' | 'isolate'; tagDb?: TagDBOptions }
): Promise<SimulationBundle>;
```
Trình tự `createSimulation`:
1. Nếu `project.diagnostics` có error → ném `ProjectInvalidError` (kèm danh sách).
2. Dựng `ManualClock`, `TagDB` (chỉ tag `I/Q` của `project.tags`), `TagDbIoBus`, `SimulationOrchestrator`.
3. Chạy `extensions` **tuần tự theo thứ tự mảng** (`apply`); extension đăng ký factory/component.
4. Với mỗi `project.controllers` theo thứ tự khai báo: tra factory theo key; **không có** → `SIM-W001` (cảnh báo, bỏ qua controller đó, mô phỏng vẫn chạy); có → tạo adapter, `await adapter.init(cfg, io)`, `orchestrator.register('controllers', adapter)`. Lỗi `init` → `SIM-E001`.
5. Trả `SimulationBundle`.

**Quy ước cho milestone sau:** M1 xuất `siemensExtension` (đăng ký `builtin:siemens`); M2 xuất `plantExtension` (đăng ký `PlantEngine` ở pha `plant`, gọi `tags.setOwner`); M4 xuất `commsExtension` (pha `gateways`). `apps/cli` và `apps/server` dựng danh sách extension tập trung ở **một chỗ** (`apps/*/src/extensions.ts`) — thêm extension = thêm một dòng.

### 6.9 TraceHasher (kiểm chứng tất định)
```ts
export class TraceHasher {
  constructor(tags: TagDB);               // subscribe '*'
  hash(): string;                         // sha256 hex của luồng thay đổi
  reset(): void; dispose(): void;
}
```
Mã hóa mỗi `TagChange` (theo thứ tự flush): `simTime(uint64) | handle(uint32) | tag giá trị` (Bool = 1 byte; số = float64 big-endian; chuỗi = độ dài uint32 + UTF-8); băm tăng dần. Dùng cho test tất định (M1–M3) và báo cáo.

### 6.10 Controller demo `loopback` (`@vcs/kernel/demo`)
- Đăng ký `builtin:demo` qua `demoExtension`. Cấu hình `config`:
  ```yaml
  config:
    loopback: [ { in: IN_A, out: OUT_A, invert: false } ]       # out = in (hoặc đảo) mỗi scan
    blink:    [ { out: LAMP, periodMs: 500 } ]                  # đảo mỗi periodMs (đếm theo sim time)
    counter:  [ { out: CNT, step: 1 } ]                         # tăng mỗi scan (kiểu Int, wrap)
  ```
- Cài `ControllerAdapter` đầy đủ (init/step/reset/snapshot/restore/getDiagnostics), `scanCount` theo `scanPeriodMs`. Dùng cho: ví dụ `hello-tags`, e2e web, test orchestrator/server — **không** phải runtime thật (M1 thay thế bằng SoftPlc).

---

## 7. Package `test-utils`
- `makeTags(defs?)`, `defineTags(shorthand)` (ví dụ `'IN_A:Bool:I:%I0.0'`), `makeSim(projectYaml, tagsYaml)` (dùng `memoryFS` + `createSimulation`), `FakeClock`, `FakeController` (tuỳ biến hành vi từng bước, đếm lời gọi, có thể ném lỗi/trả Promise), `recordChanges(tags)`, `waitFor(...)`.
- Mọi test của các milestone sau dùng lại các tiện ích này; **không** tự dựng riêng.

---

## 8. Apps

### 8.1 `apps/cli` (`vcs`)
```
vcs version
vcs validate <dir> [--json]
vcs run <dir> [--steps N | --until 5s] [--step-ms N] [--watch TAG,TAG] [--csv file] [--hash] [--json]
vcs serve <dir> [--port 4170] [--host 127.0.0.1] [--open]
```
- `validate`: nạp dự án, in diagnostics (`formatDiagnostic`), exit `0` (không có error; warning vẫn 0), `2` (có error), `3` (sai tham số/không tìm thấy thư mục).
- `run`: headless bằng `orchestrator.runSteps/runUntil`; in giá trị cuối các tag (`--watch` chọn tag; mặc định tất cả nếu ≤ 50 tag), `--csv` ghi chuỗi thay đổi theo bước (qua subscriber), `--hash` in `TraceHasher.hash()`. Không có controller đăng ký → cảnh báo `SIM-W001` nhưng vẫn chạy (đồng hồ tăng).
- Bộ khung lệnh nằm ở `apps/cli/src/commands/*.ts` (mỗi lệnh một file, đăng ký trong `commands/index.ts`); các milestone sau thêm file vào đây.

### 8.2 `apps/server`
**Cấu hình** (biến môi trường + cờ CLI): `VCS_PORT=4170`, `VCS_HOST=127.0.0.1`, `VCS_LOG_LEVEL=info`, `VCS_UI_RATE_HZ=10`.

**REST** (tối thiểu): `GET /api/health` → `{ok:true, version}`; `GET /api/project` → `{ name, language, stepMs, controllers[], tagCount, diagnostics[] }`; production: phục vụ web build tĩnh (`@fastify/static`, fallback `index.html`).

**SimulationService** (`sim-service.ts`): sở hữu `SimulationBundle` + vòng chạy:
- Trạng thái `IDLE | RUNNING | PAUSED` (+ `lagging: boolean`, `achievedScale`, `timeScale`), `simTimeMs`, `stepCount`.
- Lệnh: `run()`, `pause()`, `step(n = 1)`, `reset()`, `setTimeScale(x | 'max')`. Lệnh khi đang chạy được **xếp hàng và áp dụng giữa các lát** (không chen vào giữa bước).
- Vòng chạy: mỗi lát hỏi `Pacer.plan(...)` rồi gọi `orchestrator.stepOnce()` đúng số bước, tổng thời gian wall ≤ `sliceBudgetMs` (mặc định 8 ms); sau đó nhường event loop (`setImmediate` khi `max`/tụt, `setTimeout` khi đủ nhanh). Dùng `errorPolicy: 'isolate'`.
- **Bước đơn/đang chạy đều tuân cùng quy tắc `flush()`**; UI nhận cập nhật theo nhịp riêng (dưới).
- `tag.write` từ UI: `tags.checkWrite(h,'hmi')` → `ok` thì `orchestrator.post({ run: tags.write(h, v, 'hmi') })`; `denied` → trả `error` (`TAG-E002`).

**WebSocket `/ws`** (giao thức mục 9.2): mỗi kết nối có danh sách subscribe riêng; server gom thay đổi từ **một subscriber `'*'` của TagDB** vào bộ đệm "last-write-wins theo handle" và phát `tags.delta` theo nhịp `VCS_UI_RATE_HZ` (mặc định 10 Hz) cho từng kết nối đã subscribe (lọc theo handle). Giới hạn: kích thước message ≤ 64 KB, kiểm tra `Origin` (chỉ localhost/origin dev đã cấu hình), tối đa 8 kết nối đồng thời (mặc định).

**An toàn:** mặc định chỉ bind `127.0.0.1`; không xác thực trong M0 (ghi rõ trong README: chỉ dùng trên máy cục bộ/mạng tin cậy); `--host 0.0.0.0` in cảnh báo.

### 8.3 `apps/web`
- **Khung:** header (tên dự án, badge kết nối, nút đổi ngôn ngữ vi/en, dark mode), **Sim bar**, vùng nội dung. Chỉ **một** trang "Tags" ở M0 (không tạo trang giữ chỗ).
- **Sim bar:** nút Run/Pause, Step (1 bước), Reset, chọn tốc độ (0.1×, 1×, 2×, 10×, 100×, max), hiển thị `simTime` (định dạng `mm:ss.mmm` và ms), `stepCount`, trạng thái, cảnh báo `lagging` (kèm `achievedScale`).
- **Bảng Tags:** ảo hóa (≥ 20 000 dòng mượt), cột: Tên, Kiểu, Vùng, Địa chỉ, Controller, Mô tả, **Giá trị** (cập nhật thời gian thực; ô đổi màu nháy nhẹ khi thay đổi; Bool hiện `TRUE/FALSE` có chấm màu + chữ, không chỉ màu), lọc theo chuỗi (tên/mô tả), lọc theo controller/vùng; **ô giá trị cho tag `free` có thể sửa** (Bool: nút bật/tắt; số: nhập) → gửi `tag.write`.
- **Diagnostics panel:** hiển thị `project.diagnostics` (nếu có) dạng danh sách thu gọn.
- **State:** Zustand; cập nhật giá trị gom theo `requestAnimationFrame` (không render lại toàn bảng mỗi message); WS client có **tự kết nối lại** (backoff 0.5 s → 5 s) và hiển thị trạng thái.
- **i18n:** `t('key')` với từ điển `vi`/`en` (`apps/web/src/i18n/`); mặc định theo `project.language`, người dùng đổi được (lưu `localStorage`).
- **Trợ năng:** thao tác bàn phím cho Sim bar, nhãn ARIA, tương phản đủ ở cả hai chế độ sáng/tối.
- Dev: Vite proxy `/api` và `/ws` tới `127.0.0.1:4170`.

---

## 9. Giao thức web ↔ server

### 9.1 Nguyên tắc
Một kênh WebSocket JSON; thông điệp có `type`; schema zod chung (`@vcs/schemas/protocol`); phiên bản `PROTOCOL_VERSION = 1` (khác → server đóng với `WS-E001`). Handle trong giao thức là **chỉ số trong mảng `defs` của `tags.snapshot`** của phiên đó (không phải handle nội bộ của kernel — thực tế trùng, nhưng UI không được giả định).

### 9.2 Thông điệp
**Client → Server**
| type | Payload | Ý nghĩa |
|---|---|---|
| `hello` | `{ protocolVersion }` | Bắt tay |
| `sim.command` | `{ cmd: 'run'\|'pause'\|'step'\|'reset', steps?: number }` | Điều khiển |
| `sim.timeScale` | `{ value: number \| 'max' }` | Đặt tốc độ |
| `tags.subscribe` | `{ names: '*' \| string[] }` | Đăng ký nhận |
| `tags.unsubscribe` | `{}` | Hủy |
| `tag.write` | `{ name: string, value: TagValue }` | Ghi tag `free` |

**Server → Client**
| type | Payload |
|---|---|
| `welcome` | `{ protocolVersion, project: { name, language, stepMs }, sim: SimState }` |
| `sim.state` | `SimState = { state, simTimeMs, stepCount, timeScale, lagging, achievedScale }` (≤ 10 Hz và khi đổi trạng thái) |
| `tags.snapshot` | `{ defs: { name, type, area, address, controller, description?, owner, writable }[], values: TagValue[], simTimeMs }` — gửi ngay sau `tags.subscribe` |
| `tags.delta` | `{ simTimeMs, changes: [index: number, value: TagValue][] }` |
| `diagnostics` | `{ items: Diagnostic[] }` |
| `error` | `{ code, message, ref?: string }` |

`step` nhận `steps` (1..10 000); khi đang `RUNNING` bị bỏ qua kèm `error` `WS-E002`.

---

## 10. Ví dụ `examples/hello-tags`

```yaml
# vcs.project.yaml
schemaVersion: 1
name: Hello Tags
language: vi
seed: 1
simulation: { stepMs: 10, plcScanMs: 10 }
controllers:
  - id: PLC1
    mode: builtin
    vendor: demo
    model: loopback
    config:
      loopback: [ { in: BTN_START, out: LAMP_RUN }, { in: SW_AUTO, out: LAMP_AUTO, invert: true } ]
      blink:    [ { out: LAMP_HEARTBEAT, periodMs: 500 } ]
      counter:  [ { out: SCAN_CNT, step: 1 } ]
```
`tags/tags.yaml` (≈ 12 tag): `BTN_START %I0.0 (DI, free)`, `SW_AUTO %I0.1 (DI)`, `PT01 %IW64 (AI, scaling 0..27648 → 0..10 bar)`, `LAMP_RUN %Q0.0 (DO)`, `LAMP_AUTO %Q0.1`, `LAMP_HEARTBEAT %Q0.2`, `SCAN_CNT %QW64 (AO/Int)`, cùng vài tag `M`/`DB` (ví dụ `%M0.0`, `DB1.DBW0`) để kiểm `TagCatalog` (tag M/DB **không** vào TagDB).

Ngoài ra có `scripts/gen-bench-project.ts` sinh `bench/project-5000` (5 000 tag, 4 controller demo) phục vụ benchmark; không commit kết quả sinh.

---

## 11. Tài liệu, ADR và `AGENTS.md`

- `docs/architecture.md`: sơ đồ (pha, luồng dữ liệu `plant → TagDB → IoBus → controller → TagDB → plant`, hooks, snapshot), đồ thị phụ thuộc, hướng dẫn "thêm package/extension/lệnh CLI".
- `docs/semantics.md` (phần M0): thời gian = số nguyên ms; thứ tự bước; plant trước controller; độ trễ 1 bước; thông báo theo lô; `flush` chỉ phát khi giá trị khác lần flush trước; quyền sở hữu tag.
- **ADR** (mỗi file ≤ 1 trang: bối cảnh, quyết định, hệ quả): `0001` package JIT + monorepo, `0002` mô phỏng chạy trong server, `0003` thời gian nguyên ms + Pacer tách biệt, `0004` TagDB theo handle + thông báo theo lô, `0005` SimComponent/phases/extension, `0006` Diagnostic + catalog mã.
- **`AGENTS.md`** (gốc repo; AI đọc đầu tiên; ≤ 120 dòng): (1) mô tả dự án 5 dòng và trỏ tới PRD/spec; (2) lệnh (`pnpm install/dev/test/lint/typecheck/depcheck/bench`); (3) cấu trúc repo + đồ thị phụ thuộc (bảng 3.5); (4) **quy tắc tất định** (không `Date.now/Math.random` ở package lõi; thời gian = `SimClock`; ngẫu nhiên = PRNG seeded); (5) quy tắc code (strict, không `any`, lỗi có mã + vị trí + hướng sửa, không bỏ qua im lặng); (6) quy tắc test (test trước/cùng lúc, golden tính tay, không sửa kỳ vọng để xanh, chạy được trên Windows); (7) Definition of Done; (8) **việc không được làm** (thêm dependency lớn không có ADR, sửa package khác ngoài phạm vi, phá `exports`, commit file sinh/kết quả); (9) cách ghi câu hỏi mở vào `docs/open-questions.md`.
- `README.md`: cài đặt, chạy `examples/hello-tags` (`pnpm vcs serve examples/hello-tags`), cảnh báo bảo mật cục bộ.

---

## 12. Chiến lược test và hiệu năng

### 12.1 Số lượng test tối thiểu

| Nhóm | Test |
|---|---|
| `duration` (hợp lệ, lỗi, vòng `parse∘format`, biên) | ≥ 15 |
| `yaml.ts` (vị trí lỗi cú pháp, ánh xạ `issue.path` → dòng/cột, khóa lạ + gợi ý, BOM/CRLF) | ≥ 20 |
| Schema project/tags (mỗi mã `PRJ-*`, kiểm tra chéo, discriminated union) | ≥ 35 |
| `loadProject` + `memoryFS` + `hashText` (Windows/Linux cùng hash) | ≥ 15 |
| `ManualClock` | ≥ 6 |
| `TagDB` (handle, validate, ownership, `flush` gom lô, giá trị quay về cũ, thứ tự, snapshot/restore, reset, không cấp phát) | ≥ 40 |
| `TagDbIoBus` + `IoPort` | ≥ 12 |
| `Pacer` (đồng hồ giả: 1×, 10×, max, tụt, tạm dừng) | ≥ 10 |
| Orchestrator (thứ tự pha/hook, post/inbox, `throw`/`isolate`, async path, snapshot/restore round-trip, reset, tất định) | ≥ 30 |
| Builder/extension (thứ tự, thiếu factory → `SIM-W001`, lỗi init) | ≥ 10 |
| `LoopbackController` | ≥ 8 |
| `TraceHasher` | ≥ 6 |
| Giao thức zod (hợp lệ/không hợp lệ) | ≥ 12 |
| Server (WS thật: hello, subscribe, run/pause/step/reset, timeScale, tag.write ok/denied, lagging, giới hạn kích thước, Origin) | ≥ 15 |
| CLI (`validate` mã thoát, `run`, `--hash`, `--csv`) | ≥ 10 |
| Web (reducer/store, định dạng thời gian) | ≥ 10 |
| Playwright e2e | ≥ 3 |
| Lint-rule test (file mẫu vi phạm phải bị chặn; allow-list không bị chặn) | ≥ 4 |

### 12.2 Property-based (fast-check)
- `TagDB`: chuỗi ghi/flush ngẫu nhiên → mô hình tham chiếu đơn giản cho cùng tập thay đổi; `restore(snapshot())` là phép đồng nhất.
- Orchestrator: hai lần chạy cùng cấu hình + cùng chuỗi `post` ⇒ `TraceHasher.hash()` giống hệt; chạy N bước, snapshot, chạy M bước (hash), restore, chạy lại M bước ⇒ hash giống hệt.
- `parseDuration(formatDuration(x)) === x`.

### 12.3 E2E (Playwright)
1. Mở web với server chạy `hello-tags` → thấy ≥ 10 hàng tag, badge "đã kết nối".
2. Nhấn Run ≥ 1 s → `simTime` tăng, `LAMP_HEARTBEAT` đổi trạng thái, `SCAN_CNT` tăng; Pause → `simTime` đứng yên; Step → tăng đúng 1 bước (10 ms); Reset → về 0.
3. Bật `BTN_START` (ô giá trị) → `LAMP_RUN` bật sau tối đa một lát cập nhật; thử ghi vào tag `LAMP_RUN` (controller-owned) bị từ chối với thông báo.

### 12.4 Hiệu năng (`pnpm bench`, lưu `bench/results.json`, hồi quy > 20% → cảnh báo CI)
- `TagDB.set/get` theo handle: **≥ 10 triệu thao tác/giây**; không cấp phát (heap tăng < 1 MB sau 10 triệu thao tác).
- `flush()` với 5 000 tag, 0 thay đổi: ≤ 50 µs; với 1 000 thay đổi và 1 subscriber: ≤ 1 ms.
- Orchestrator rỗng (5 000 tag, `LoopbackController`): **≥ 100 000 bước/giây**.
- Server: ở `timeScale max` với `hello-tags`, `tags.delta` không làm event loop trễ > 50 ms (đo bằng timer drift trong test).
- Web: cuộn bảng 20 000 dòng ≥ 50 FPS (kiểm bằng Playwright trace, không bắt buộc CI).

---

## 13. CI (`.github/workflows/ci.yml`; tương đương cho GitLab nếu dùng)
- Trigger: push + PR. Cache pnpm store và Playwright browsers.
- Job `check` (ubuntu): `pnpm install --frozen-lockfile` → `lint` → `typecheck` → `depcheck` → `docs:diagnostics --check` (mã chưa đăng ký/ docs lệch → fail).
- Job `test` (ma trận `ubuntu-latest`, `windows-latest` × Node 20, 22): `pnpm test` (Vitest) có coverage; ngưỡng `kernel` ≥ 85% dòng, `schemas` ≥ 85%, `project` ≥ 80%.
- Job `e2e` (ubuntu): build + Playwright chromium; upload trace khi lỗi.
- Job `bench` (chạy tay/nightly): ghi artifact `bench/results.json`.
- (P1) `Dockerfile` đa tầng + `docker-compose.yml` chạy `vcs serve` (không chạy root, volume cho thư mục dự án).

---

## 14. Kế hoạch triển khai và prompt cho AI

| Ngày | Công việc | Kết quả |
|---|---|---|
| 1 | Repo/công cụ/CI/lint tất định/dependency-cruiser/`AGENTS.md`; `schemas`: `common`, `duration`, `DiagnosticCatalog` | CI xanh (Linux + Windows), test duration |
| 2 | `yaml.ts` (vị trí), schema project/tags/protocol, `migrate`, package `project` + `memoryFS` + hash; fixtures | `vcs validate` logic hoàn chỉnh (chưa CLI) |
| 3 | `kernel`: `ManualClock`, `TagDB`, `TagCatalog`, `TagDbIoBus`, `TraceHasher`, `test-utils`; bench TagDB | ≥ 60 test, bench đạt |
| 4 | `SimulationOrchestrator`, builder/extension, `Pacer`, `LoopbackController`; `apps/cli` (`validate/run/version`) | demo `vcs run examples/hello-tags --hash` |
| 5 | `apps/server` (REST, WS, SimulationService); `apps/web` (khung, Sim bar, bảng Tags, i18n) | chạy end-to-end bằng tay |
| 6 | Playwright e2e, tài liệu + ADR, đệm sửa lỗi, kiểm tra Windows | nghiệm thu |

### Prompt mẫu

**P0.1 (repo + công cụ):**
> Đọc `M0-skeleton-spec.md` mục 1–3 và 11–13. Tạo monorepo pnpm + Turborepo theo 3.1–3.4: package JIT (`exports` trỏ `src/index.ts`), TypeScript strict, ESLint flat + prettier, Vitest workspace, `.gitattributes/.editorconfig/.npmrc`. Cài dependency-cruiser với bảng 3.5 và lint cấm `Date.now/Math.random/...` theo 3.6 (kèm test cho luật lint). Viết `AGENTS.md` theo mục 11 và CI `ubuntu + windows`. Chưa viết logic nghiệp vụ. Không dùng cú pháp shell riêng ở scripts.

**P0.2 (schemas + project):**
> Theo mục 4 và 5: cài `common.ts`, `Diagnostic` + `DiagnosticCatalog`, `duration.ts`, `yaml.ts` (**ánh xạ lỗi zod → dòng/cột YAML**), schema project/tags (đúng cross-check và mã `PRJ-*`), `migrate.ts`, package `project` (`ProjectFS`, `memoryFS`, `nodeFS`, `loadProject`, `hashText`). Viết test theo 12.1 trước hoặc cùng lúc. Hash văn bản phải giống nhau trên Windows/Linux.

**P0.3 (kernel dữ liệu):**
> Theo mục 6.1–6.5, 6.9 và 7: `ManualClock`, `TagDB` (handle, validate, ownership, `flush` theo lô đúng quy tắc 6.2, snapshot/restore/reset), `TagCatalog`, `TagDbIoBus` + `IoPort`, `TraceHasher`, package `test-utils`. Test ≥ 60 + property test + bench (không cấp phát trong `get/set`).

**P0.4 (orchestrator):**
> Theo 6.6–6.8, 6.10: `SimComponent`, `ControllerAdapter`, `SimulationOrchestrator` đúng thuật toán một bước ở 6.7 (phases, hooks, inbox, `throw/isolate`, đường async riêng, snapshot/restore/reset), builder + extension, `LoopbackController`, `Pacer`. **Trước khi code**, tự tính tay ≥ 5 bảng thời gian (thứ tự hook/pha/flush, độ trễ plant→PLC 1 bước) làm golden test. Thêm `apps/cli` với `validate/run/version`.

**P0.5 (server):**
> Theo 8.2 và 9: `SimulationService` (lệnh xếp hàng giữa các lát, `Pacer` do `apps/server` cung cấp `now()`), REST, WebSocket đúng schema zod chung, gom `tags.delta` theo nhịp, kiểm tra Origin/kích thước/số kết nối. Test bằng client `ws` thật.

**P0.6 (web):**
> Theo 8.3: khung, Sim bar, bảng Tags ảo hóa với cập nhật gom theo `requestAnimationFrame`, sửa giá trị tag `free`, diagnostics panel, i18n vi/en, tự kết nối lại. Web chỉ import `@vcs/schemas`. Viết Playwright e2e theo 12.3.

**P0.7 (hoàn thiện):**
> Tài liệu `architecture.md`, `semantics.md`, 6 ADR, `diagnostics.md` sinh tự động, README. Chạy toàn bộ CI local, kiểm tra trên Windows, chạy bench và ghi kết quả.

Mỗi prompt kết thúc: *"Chạy test/lint/typecheck/depcheck/bench, báo cáo kết quả, liệt kê mọi giả định tự đặt vào `docs/open-questions.md`, không sửa package ngoài phạm vi (nêu lý do nếu buộc phải), không hạ tiêu chí nghiệm thu."*

---

## 15. Tiêu chí nghiệm thu M0 (tất cả phải đạt)

1. `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm depcheck && pnpm test` xanh trên **Linux và Windows**, Node 20 và 22.
2. **(PRD)** Web hiển thị danh sách tag từ `examples/hello-tags`; nút Run làm `simTime` tăng; Pause/Step/Reset đúng (e2e xanh).
3. `vcs validate` báo lỗi với **dòng/cột chính xác** cho ≥ 10 lỗi mẫu (cú pháp YAML, sai schema, trùng tag, controller không tồn tại, khóa lạ có gợi ý); mã thoát đúng (0/2/3).
4. `TagDB`: mọi quy tắc 6.2 có test; không cấp phát trong `get/set`; benchmark đạt 12.4.
5. Orchestrator: thứ tự một bước đúng 6.7 (golden tính tay); `snapshotAll/restoreAll/resetAll` tái lập **hash giống hệt**; `isolate` không làm sập; đường async hoạt động; component async trong `stepOnce()` → `SIM-E002`.
6. `vcs run examples/hello-tags --until 5s --hash` cho **cùng hash** trên Windows và Linux và qua các lần chạy.
7. Lint chặn đúng `Date.now/Math.random/...` ở package lõi (có test) và không chặn ở allow-list.
8. Đồ thị phụ thuộc bị ép (thử import sai trong test phải làm `depcheck` thất bại); `apps/web` không kéo `kernel`.
9. Mọi mã chẩn đoán phát ra đều đã đăng ký trong `DiagnosticCatalog`; `docs/diagnostics.md` sinh tự động và khớp.
10. Server: giao thức đúng schema, `tag.write` vào tag không phải `free` bị từ chối, giới hạn kích thước/Origin hoạt động, `timeScale max` không làm event loop trễ quá ngưỡng.
11. Có `AGENTS.md`, `README.md`, 6 ADR, `architecture.md`, `semantics.md` (phần M0).
12. Không `any` ngoài ranh giới I/O (JSON/WS) đã validate; mọi lỗi nêu **mã + vị trí/đối tượng + hướng sửa**.

---

## 16. Quyết định mặc định (để AI không dừng hỏi)

| Chủ đề | Quyết định |
|---|---|
| Nơi chạy mô phỏng | Server Node (WS); Worker transport là tùy chọn sau |
| Thời gian mô phỏng | Số nguyên ms; `stepMs` nguyên ≥ 1; mặc định 10 |
| Chạy liên tục/tốc độ | `SimulationService` + `Pacer` (ngoài orchestrator) |
| Thông báo thay đổi tag | Theo lô tại `flush()` cuối bước, chỉ khi khác lần flush trước |
| Handle tag | Chỉ số theo thứ tự định nghĩa; chỉ trong một phiên |
| Tag `M`/`DB` | Chỉ trong `TagCatalog`; đọc/ghi qua `ControllerIntrospection` |
| Quyền ghi tag | `checkWrite` cho nguồn người dùng; enforce cứng chỉ ở dev/test |
| Lỗi component | `throw` (test/CLI) / `isolate` (server) |
| Khóa lạ trong YAML | Cảnh báo `PRJ-W001`, không lỗi |
| Controller không có runtime | `SIM-W001`, bỏ qua controller, vẫn chạy |
| UI giao tiếp | JSON qua WS, nhịp 10 Hz, last-write-wins theo tag |
| Bảo mật M0 | Bind 127.0.0.1, không auth, kiểm Origin |
| Phiên bản thư viện | Ghim chính xác, lockfile commit, bản ≥ 14 ngày tuổi |
| Hash văn bản | Chuẩn hóa BOM/CRLF, sha256 (`@noble/hashes`) |
| Ngôn ngữ UI mặc định | Theo `project.language` (mặc định `vi`) |

---

## 17. Việc của chủ sản phẩm (song song)

1. **Chọn nơi lưu repo** (GitHub/GitLab/Git nội bộ) và bật CI; xác nhận môi trường phát triển chính là Windows hay Linux (để ưu tiên kiểm tra đúng nền tảng).
2. **Chốt tên sản phẩm/scope package** (`@vcs/*` chỉ là tạm) và giấy phép (nội bộ/độc quyền/mã nguồn mở).
3. Nếu dùng dữ liệu thật từ công việc làm fixture (I/O list, C&E, chương trình PLC): **kiểm tra chính sách bảo mật/sở hữu trí tuệ của công ty và ẩn danh** trước khi đưa vào repo hoặc cho công cụ AI đọc.
4. Quyết định có cần **Worker transport** (chạy mô phỏng ngay trong trình duyệt, không cần server) hay chỉ server là đủ — ảnh hưởng tới M1 §11 và kiến trúc triển khai.
5. Xác nhận ngôn ngữ giao diện/tài liệu chính (Việt/Anh) và chuẩn thời gian hiển thị (sim time `mm:ss.mmm`).
6. Chạy thử M0 trên máy thật của anh (Windows nếu đang dùng) và phản hồi trải nghiệm cài đặt (`pnpm install`, `pnpm dev`) — vì đây là bước đầu tiên của mọi lần vibe coding sau này.
