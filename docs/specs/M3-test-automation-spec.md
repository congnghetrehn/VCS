# M3 — Test Automation, C&E và Báo cáo FAT: Đặc tả chi tiết

## Mục lục

- [1. Mục tiêu và phạm vi](#1-mục-tiêu-và-phạm-vi)
  - [1.1 Mục tiêu](#11-mục-tiêu)
  - [1.2 Trong phạm vi (P0)](#12-trong-phạm-vi-p0)
  - [1.3 Ngoài phạm vi M3](#13-ngoài-phạm-vi-m3)
- [2. Cấu trúc package](#2-cấu-trúc-package)
- [3. Mô hình dữ liệu](#3-mô-hình-dữ-liệu)
  - [3.1 Tệp test (`tests/*.test.yaml`) — hai dạng, đều hợp lệ](#31-tệp-test-teststestyaml-hai-dạng-đều-hợp-lệ)
  - [3.2 Bước (steps) — danh sách hành động](#32-bước-steps-danh-sách-hành-động)
  - [3.3 Macro](#33-macro)
  - [3.4 Kết quả (types rút gọn)](#34-kết-quả-types-rút-gọn)
- [4. Kỳ vọng (expect)](#4-kỳ-vọng-expect)
- [5. Ngôn ngữ biểu thức](#5-ngôn-ngữ-biểu-thức)
  - [5.1 Ngữ pháp (EBNF)](#51-ngữ-pháp-ebnf)
  - [5.2 Biên dịch](#52-biên-dịch)
- [6. Thực thi (TestExecutor)](#6-thực-thi-testexecutor)
  - [6.1 Hook vào orchestrator (thay đổi nhỏ cho M2)](#61-hook-vào-orchestrator-thay-đổi-nhỏ-cho-m2)
  - [6.2 Isolation và baseline](#62-isolation-và-baseline)
  - [6.3 Máy trạng thái của executor](#63-máy-trạng-thái-của-executor)
  - [6.4 Pacing](#64-pacing)
  - [6.5 Ví dụ thực thi có tính toán (demo `motor-interlock` + `motor_dol`, `stepMs = plcScanMs = 10`, `startDelayMs = 500`)](#65-ví-dụ-thực-thi-có-tính-toán-demo-motor-interlock-motor_dol-stepms-plcscanms-10-startdelayms-500)
- [7. C&E matrix](#7-ce-matrix)
  - [7.1 Khái niệm](#71-khái-niệm)
  - [7.2 Hồ sơ import `io/ce-profile.yaml`](#72-hồ-sơ-import-ioce-profileyaml)
  - [7.3 Phân tích header cột (effect)](#73-phân-tích-header-cột-effect)
  - [7.4 Phân tích hàng (cause)](#74-phân-tích-hàng-cause)
  - [7.5 Kiểm tra dữ liệu C&E (mã cố định)](#75-kiểm-tra-dữ-liệu-ce-mã-cố-định)
  - [7.6 Mô hình](#76-mô-hình)
- [8. Bindings (cause → kích, effect → quan sát)](#8-bindings-cause-kích-effect-quan-sát)
  - [8.1 Tệp `tests/bindings.yaml`](#81-tệp-testsbindingsyaml)
  - [8.2 Bộ resolver heuristic (đề xuất binding) — `ce/bindings.ts`](#82-bộ-resolver-heuristic-đề-xuất-binding-cebindingsts)
- [9. Sinh test từ C&E (FR-503) và mẫu motor (FR-504)](#9-sinh-test-từ-ce-fr-503-và-mẫu-motor-fr-504)
  - [9.1 Thuật toán sinh test cho **mỗi cause (hàng)**](#91-thuật-toán-sinh-test-cho-mỗi-cause-hàng)
  - [9.2 Negative checks (`negativeChecks`)](#92-negative-checks-negativechecks)
  - [9.3 Cell `inhibit` (khóa khởi động)](#93-cell-inhibit-khóa-khởi-động)
  - [9.4 Đầu ra sinh](#94-đầu-ra-sinh)
  - [9.5 Mẫu test motor (`vcs test gen motor <equipment>` hoặc `--all-motors`)](#95-mẫu-test-motor-vcs-test-gen-motor-hoặc---all-motors)
- [10. Báo cáo FAT](#10-báo-cáo-fat)
  - [10.1 Đầu ra](#101-đầu-ra)
  - [10.2 Metadata (`RunMeta`) — trang bìa](#102-metadata-runmeta-trang-bìa)
  - [10.3 Nội dung HTML (một file tự chứa; CSS/JS/SVG inline; không phụ thuộc mạng)](#103-nội-dung-html-một-file-tự-chứa-cssjssvg-inline-không-phụ-thuộc-mạng)
  - [10.4 Biểu đồ bằng chứng (`charts.ts`)](#104-biểu-đồ-bằng-chứng-chartsts)
  - [10.5 Yêu cầu trình bày](#105-yêu-cầu-trình-bày)
  - [10.6 `results.json` và `junit.xml`](#106-resultsjson-và-junitxml)
- [11. CLI và UI](#11-cli-và-ui)
  - [11.1 CLI](#111-cli)
  - [11.2 UI (apps/web)](#112-ui-appsweb)
- [12. Chiến lược test và nghiệm thu](#12-chiến-lược-test-và-nghiệm-thu)
  - [12.1 Test của chính M3 (số lượng tối thiểu)](#121-test-của-chính-m3-số-lượng-tối-thiểu)
  - [12.2 Demo `crusher-sequence` (nghiệm thu chính)](#122-demo-crusher-sequence-nghiệm-thu-chính)
  - [12.3 Mutation check (kiểm chứng chất lượng bộ test)](#123-mutation-check-kiểm-chứng-chất-lượng-bộ-test)
  - [12.4 Tiêu chí nghiệm thu M3 (tất cả phải đạt)](#124-tiêu-chí-nghiệm-thu-m3-tất-cả-phải-đạt)
- [13. Hiệu năng](#13-hiệu-năng)
- [14. Mã chẩn đoán (`TS-*`)](#14-mã-chẩn-đoán-ts-)
- [15. Kế hoạch triển khai và prompt cho AI](#15-kế-hoạch-triển-khai-và-prompt-cho-ai)
  - [Prompt mẫu](#prompt-mẫu)
- [16. Quyết định mặc định](#16-quyết-định-mặc-định)
- [17. Việc của chủ sản phẩm (song song để M3 sát thực tế)](#17-việc-của-chủ-sản-phẩm-song-song-để-m3-sát-thực-tế)

> Thuộc dự án VCS (xem `PRD.md`: M3, FR-501…506; phụ lục C, D). Phiên bản: 0.1 (2026-11-21).
> Thời lượng dự kiến: 2–3 tuần công. **Điều kiện đầu vào:** M1 (SoftPlc) và M2 (PlantEngine, orchestrator, import I/O, equipment) đã đạt nghiệm thu.
> Quy ước như M1/M2: spec thắng kiến thức sẵn có của AI; chỗ chưa chắc có giá trị mặc định + thẻ `VERIFY`; tình huống ngoài spec → chọn phương án đơn giản, ghi `docs/open-questions.md`, thêm test thể hiện lựa chọn.

M3 là milestone tạo ra **giá trị khác biệt** của sản phẩm: biến tài liệu dự án (I/O list, C&E matrix) thành **bộ test chạy tự động, lặp lại được, có bằng chứng và truy vết** cho FAT.

---

## 1. Mục tiêu và phạm vi

### 1.1 Mục tiêu
1. **Test DSL YAML** + trình chạy (headless CLI và UI) dùng thời gian mô phỏng, tăng tốc được, deterministic.
2. **Ngôn ngữ biểu thức** để kiểm tra tag/observable, kèm các kiểu kỳ vọng: `assert`, `within`, `never`, `stableFor`, `ordered`.
3. **Import C&E matrix** (CSV/XLSX) + ánh xạ ký hiệu → hành động + **binding** (cause → cách kích, effect → cách quan sát).
4. **Tự sinh test từ C&E** (tất cả các cặp đã có binding; cặp chưa bind được báo `UNBOUND`, không bao giờ bỏ qua im lặng) + **mẫu test motor**.
5. **Báo cáo FAT HTML** (một file tự chứa, in được) + `results.json` + `junit.xml`, có truy vết *requirement / C&E cell / I/O → test → kết quả* và bằng chứng (trace tag quanh thời điểm assert).
6. **Kiểm chứng chất lượng bộ test bằng mutation** (chèn lỗi logic vào chương trình PLC, bộ test phải bắt được).

### 1.2 Trong phạm vi (P0)
FR-501, FR-502, FR-503, FR-504, FR-506 (HTML), cộng: JUnit XML (FR-510, phần định dạng), checkpoint/restore trong test, mutation tool (dev-only).

### 1.3 Ngoài phạm vi M3
Template sequence group start/stop (FR-505), coverage % I/O/thiết bị (FR-507 — nhưng `results.json` phải chứa đủ dữ liệu để M4+ tính), record/replay (FR-508), CI tích hợp sẵn GitHub/GitLab (FR-510 phần pipeline), PDF/XLSX (P1; HTML phải **in ra PDF sạch** bằng trình duyệt), chạy test song song nhiều worker (thiết kế sẵn, làm sau), test với controller ngoài (Chế độ B, M4–M5), ghi/phát lại thao tác UI.

---

## 2. Cấu trúc package

```
packages/
  testing/
    src/
      dsl/
        schema.ts              # zod schema cho *.test.yaml (+ xuất JSON Schema cho editor)
        load.ts                # đọc YAML, expand macro, validate, trả TestProgram + Diagnostic
        macros.ts              # expand macro/param ${x}
        std/macros.yaml        # thư viện macro chuẩn (startEquipment, stopEquipment, ...)
      expr/
        lexer.ts parser.ts ast.ts compile.ts   # ngôn ngữ biểu thức (mục 5)
        functions.ts
      exec/
        executor.ts            # TestExecutor (mục 6)
        monitors.ts            # within/never/stableFor/ordered
        host.ts                # interface TestHost + cài đặt trên orchestrator
        trace.ts               # TraceStore (delta-encoded)
        pace.ts                # Pacer (max speed / realtime / timeScale)
      runner/
        runner.ts              # TestRunner: chọn test, isolation, kết quả
        results.ts             # RunResult types + hash
        select.ts              # lọc theo tag/grep/requirement
      report/
        html.ts  charts.ts  i18n/vi.json  i18n/en.json  templates/
        json.ts  junit.ts
      ce/
        read.ts profile.ts parse-symbols.ts parse-headers.ts parse-causes.ts
        model.ts validate.ts diff.ts
        bindings.ts            # schema + resolver heuristic
        generate.ts            # sinh test từ C&E + binding
        templates/motor.ts     # mẫu test motor
      index.ts
    fixtures/  test/  golden/
scripts/
  mutate-scl.ts                # chèn lỗi vào AST SCL (mục 12.3)
  gen-ce-fixture.ts
packages/kernel/src/orchestrator.ts   # bổ sung hooks (mục 6.1)
apps/web/                      # Test Center, C&E view, Bindings editor
```

Phụ thuộc: `testing` → `kernel`, `plant`, `runtime-iec` (SoftPlc qua `ControllerAdapter`), `importers` (tái dùng reader CSV/XLSX, bộ synonym, wizard components), `schemas`. `plant`/`runtime-iec` **không** import `testing`.

---

## 3. Mô hình dữ liệu

### 3.1 Tệp test (`tests/*.test.yaml`) — hai dạng, đều hợp lệ

**Dạng 1: một suite nhiều test**
```yaml
suite: crusher-line
description: FAT interlock dây chuyền nghiền
tags: [fat]
config:
  baseline: { warmupMs: 1000 }          # snapshot nền sau khi chạy khởi động
  defaults:
    responseWindowMs: 2000
    toleranceMs: 500
    maxSimTimeMs: 600000
    maxWallTimeMs: 60000
    trace: { tags: ["*_RUN_CMD", "*_RUN_FB"], sampleObservablesMs: 100 }
macros:
  startAll:
    params: [order]
    steps: [ ... ]
tests:
  - id: CR01_overload
    title: ...
    requirement: [CE-002, FAT-4.2.1]
    tags: [interlock]
    isolation: baseline                 # baseline | reset | none (mặc định baseline)
    setup: [ ... ]
    steps: [ ... ]
    expect: [ ... ]                     # implicit expect cuối steps
    teardown: [ ... ]
```
**Dạng 2: một test ở mức gốc** (tương thích PRD phụ lục C): các khóa `id, title, requirement, setup, steps, expect, teardown` ở gốc file; loader bọc thành suite một test, `suite` = tên file.

Quy tắc:
- `id` duy nhất toàn dự án (chuỗi `[A-Za-z0-9_.-]+`); trùng → lỗi `TS-E003`.
- `skip: "<lý do>"` → trạng thái `SKIP` (lý do bắt buộc). `only: true` chỉ dùng khi chạy cục bộ; trong CI (`--ci`) có `only` → lỗi `TS-E004`.
- `generated: { source: ce, matrix: <file>, row: 12, hash: <sha> }` do generator ghi; người dùng **không sửa tay** file trong `tests/generated/`.

### 3.2 Bước (steps) — danh sách hành động

| Khóa | Dạng | Ý nghĩa |
|---|---|---|
| `set` | `{ TAG: value, ... }` | Ghi tag "virtual input" (tag chưa gán thiết bị, hoặc M/DB). Nếu tag do **plant** sở hữu → lỗi `TS-E010` (gợi ý dùng `inject`/`source`); nếu do **PLC** sở hữu (DO/AO) → lỗi `TS-E011` |
| `pulse` | `{ tag, ms, value?: true }` | Đặt `value` rồi tự trả về `!value` sau `ms` (không chặn; bước tiếp theo chạy ngay) |
| `inject` | `{ equipment, fault \| preset \| signal+type, params?, at?, duration? }` | Gọi `PlantEngine.injectFault/applyPreset` (M2 mục 5.2, 6.1) |
| `clearFault` | `{ equipment?, id? } \| all` | Gỡ lỗi |
| `source` | `{ equipment, value \| spec }` | `setManual`/`setSource` (cảm biến, switch, silo) |
| `force` / `unforce` | `{ TAG: value }` / `[TAG..]` | Force tại SoftPlc (mở rộng VCS) |
| `controller` | `{ id?, action: start \| stop \| reset }` | Điều khiển CPU mô phỏng |
| `wait` | `duration` \| `{ until: expr, timeout: duration, onTimeout?: fail \| continue }` | Chặn thực thi (mục 6.3) |
| `expect` | danh sách kỳ vọng (mục 4) | Kiểm tra |
| `run` | `{ macro, args }` hoặc chuỗi `"macro arg1 arg2"` | Gọi macro |
| `checkpoint` / `restore` | `name` | Chụp / khôi phục snapshot mô phỏng đầy đủ (plant + PLC + TagDB + clock + faults + forces) |
| `log` | `"message"` | Chú thích hiển thị trong báo cáo (có thể dùng `${...}`) |

Giá trị trong `set/source`: bool, số, hoặc biểu thức đơn giản `"= expr"` (đánh giá tại thời điểm thực thi).

**Thời lượng:** `500ms`, `3s`, `2m`, `1h`, `1m30s`; làm tròn **lên** bội của `stepMs`; nếu không chia hết → cảnh báo `TS-W010`.

### 3.3 Macro
```yaml
macros:
  startEquipment:
    params: [eq, timeout]
    defaults: { timeout: 10s }
    steps:
      - run: { macro: std.pressStart, args: { eq: "${eq}" } }
      - wait: { until: "$${eq}.runFb == true", timeout: "${timeout}" }
```
- Thay thế văn bản `${param}` trước khi parse; mọi macro được **expand lúc load** (không đệ quy; độ sâu tối đa 8, vi phạm → `TS-E021`); thiếu tham số bắt buộc → `TS-E020`.
- `std.*` = thư viện chuẩn trong `std/macros.yaml`: `pressStart{eq}`, `pressStop{eq}`, `startEquipment{eq,timeout}`, `stopEquipment{eq,timeout}`, `startAll{order,timeout}`, `resetFault{eq}`. Chúng đọc **bindings** (mục 8) để biết kích cái gì; thiếu binding → lỗi `TS-E030` kèm tên trường cần thêm.

### 3.4 Kết quả (types rút gọn)
```ts
export type TestStatus = 'PASS' | 'FAIL' | 'ERROR' | 'SKIP' | 'UNBOUND' | 'NOT_RUN';
export type ExpStatus  = 'pass' | 'fail' | 'error' | 'unresolved';

export interface TestResult {
  id: string; title: string; suite: string; status: TestStatus;
  requirement: string[]; tags: string[]; generated?: GeneratedInfo;
  seed: number; startSimMs: number; endSimMs: number; simDurationMs: number; wallMs: number;
  steps: StepLog[];                // từng hành động đã thực thi: {t, kind, summary, ok}
  expectations: ExpectationResult[];
  error?: { code: string; message: string; step?: number; src?: SrcRef };
  trace: TraceData;                // delta-encoded, chỉ tag đã chọn
  hash: string;                    // sha256 trên {id,status,expectations(code,status,timing),steps(kind,t)} (không gồm wall time)
}
export interface ExpectationResult {
  id: string; kind: 'assert'|'within'|'never'|'stableFor'|'ordered';
  expr: string; message?: string; status: ExpStatus;
  armedAtMs: number; resolvedAtMs?: number; deadlineMs?: number; timeToMs?: number;
  observed: { ref: string; value: unknown; atMs: number }[];     // giá trị các tag trong biểu thức tại lúc quyết định
  window: [fromMs: number, toMs: number];                         // khoảng thời gian dùng làm bằng chứng
  requirement?: string[]; ceCell?: { cause: string; effect: string };
}
export interface RunResult {
  schema: 'vcs-test-results/1';
  meta: RunMeta;                   // mục 9.1
  summary: { total; pass; fail; error; skip; unbound; simMs; wallMs };
  tests: TestResult[];
  ce?: CeResultMatrix;             // mục 7.6
  requirements?: RequirementTrace[];
  unbound: UnboundItem[];          // cặp C&E/ mẫu chưa chạy được + lý do
  resultsHash: string;
}
```

---

## 4. Kỳ vọng (expect)

Mỗi kỳ vọng có `id` tự sinh (`<testId>#<n>`), `message` tùy chọn (hiện trong báo cáo khi fail), `requirement` tùy chọn (kế thừa từ test nếu không có).

| Dạng | Cú pháp | Ngữ nghĩa | Chặn? |
|---|---|---|---|
| `assert` | `- assert: expr` | Đánh giá **một lần** ở cuối bước hiện tại. | Không |
| `within` | `- within: 3s` + `assert: expr` | Đạt khi `expr` đúng ở cuối **một bước bất kỳ** trong `[armedAt, armedAt+d]` (kể cả biên). Ghi `timeToMs`. Quá hạn → `fail`. | **Có** |
| `stableFor` | `- stableFor: { assert: expr, duration: 2s, within?: 5s }` | `expr` phải đúng (trong `within` nếu có, mặc định ngay) rồi **giữ đúng liên tục** `duration`. Vi phạm → fail tại bước vi phạm. | **Có** |
| `never` | `- never: expr` (tùy chọn `for: d` / `until: expr`) | Monitor nền: **fail ngay** ở cuối bước đầu tiên `expr` đúng, từ lúc arm tới khi hết `for`/`until`/hết test (trước teardown). | Không |
| `ordered` | `- ordered: { events: [e1, e2, e3], within: 20s, strict?: false }` | Mỗi `ei` lần đầu đúng ở thời điểm `ti`, yêu cầu `t1 ≤ t2 ≤ t3` (`strict`: `<`). Mọi sự kiện phải xảy ra trong `within`. | **Có** |
| `notBefore` | `within` có `notBefore: d` | `expr` **không** được đúng trước `armedAt + d` (dùng kiểm tra delay chính xác). Đúng sớm → fail | (đi kèm within) |

Ghi chú:
- Kỳ vọng ở mức gốc test (`expect:` sau `steps:`) = implicit `expect` đặt **sau** bước cuối cùng.
- Test kết thúc khi: hết bước, mọi kỳ vọng chặn đã xong, monitor nền dừng; sau đó chạy `teardown`.
- Một kỳ vọng `error` (không đánh giá được, ví dụ tag không tồn tại lúc chạy, vòng lặp vượt giới hạn) làm test `ERROR` chứ không `FAIL`.

---

## 5. Ngôn ngữ biểu thức

### 5.1 Ngữ pháp (EBNF)
```ebnf
expr     = or ;
or       = and { ("or" | "||") and } ;
and      = not { ("and" | "&&") not } ;
not      = ("not" | "!") not | cmp ;
cmp      = add [ ("==" | "!=" | "<" | "<=" | ">" | ">=") add ] ;
add      = mul { ("+" | "-") mul } ;
mul      = unary { ("*" | "/" | "%") unary } ;
unary    = "-" unary | primary ;
primary  = number | "true" | "false" | duration | ref | call | "(" expr ")" ;
ref      = TAG | '"' any '"' | "@" EQUIP "." OBS | "$" EQUIP "." ROLE ;
call     = FUNC "(" [ expr { "," expr } ] ")" ;
duration = number ("ms" | "s" | "m" | "h") ;
```
- `TAG`: `[A-Za-z_][A-Za-z0-9_.-]*` hoặc dạng nháy kép `"Tên Có Dấu Cách"`.
- **`$EQ.role`** = tag đang gán cho role đó của thiết bị (tra `equipment.yaml`), giá trị **raw của tag**. Ví dụ `$CR01_M01.runCmd`. Role chưa gán → lỗi biên dịch `TS-E002`.
- **`@EQ.obs`** = observable của plant (eng, tức thời), ví dụ `@CR01_M01.speedPct`, `@BIN01.levelPct`.
- Hàm: `abs, min, max, round`; `eng(TAG)` (giá trị kỹ thuật của tag AI/AO theo scaling của tag); `prev(x)` (giá trị ở bước trước); `rose(x)` = `x && !prev(x)`; `fell(x)`; `changed(x)`; `since(x)` = thời gian (ms) từ khi `x` chuyển sang trạng thái hiện tại (cho bool).
- Kiểu: bool và number (không có string). So sánh bool với số → lỗi `TS-E005`. Chuỗi/enum observable (`state`) so sánh bằng `@M.state == "RUNNING"` (chuỗi literal nháy kép **kép** trong YAML cần escape; cho phép nháy đơn `'RUNNING'`).
- Ưu tiên toán tử và độ kết hợp: như bảng; `and/or` ngắn mạch.

### 5.2 Biên dịch
- Compile → closure `(ctx) => value`; tag/observable resolve thành **chỉ số** lúc compile; không cấp phát trong lúc đánh giá.
- Thu được `refs[]` (tất cả tag/observable tham chiếu) → dùng cho trace và cho phần `observed` của kết quả.
- Lỗi: `TS-E001 unknown tag/equipment/observable` kèm **gợi ý gần nhất** (Levenshtein ≤ 3); `TS-E002` role chưa gán; `TS-E005` kiểu không khớp; `TS-E006` cú pháp (vị trí chính xác dòng/cột trong YAML khi có thể).

---

## 6. Thực thi (TestExecutor)

### 6.1 Hook vào orchestrator (thay đổi nhỏ cho M2)
`SimulationOrchestrator` thêm:
```ts
interface StepHooks {
  beforeExternals(T: number): void;   // thực thi hành động của test (đầu bước T)
  afterStep(T: number): void;         // quan sát trạng thái cuối bước T (sau scan PLC)
}
orchestrator.setHooks(hooks?: StepHooks): void;
orchestrator.snapshotAll(): SimSnapshot;  orchestrator.restoreAll(s: SimSnapshot): void;
orchestrator.resetAll(): void;            // PLC reset+start, plant reset, TagDB về giá trị khởi tạo, bỏ force/fault, clock = 0
orchestrator.stepOnce(): void;            // một bước đầy đủ theo 5.1 của M2
```
Thứ tự một bước tại `T` (bổ sung vào M2 5.1): `beforeExternals(T)` → (externals/faults/plant/controller như M2) → `afterStep(T)`.

### 6.2 Isolation và baseline
- `isolation: baseline` (mặc định): trước test, `restoreAll(baseline)`; baseline được tạo **một lần** cho suite: `resetAll()` → chạy `warmupMs` (mặc định 1000) → `snapshotAll()`.
- `reset`: gọi `resetAll()` rồi chạy `warmup` lại (chậm, dùng khi nghi ngờ snapshot).
- `none`: nối tiếp trạng thái test trước (chỉ cho test viết tay có chủ ý).
- **Thời gian test tương đối:** `t = T − T0`, với `T0` = thời gian của bước đầu tiên của test (sau baseline). Mọi thời điểm trong kết quả/báo cáo dùng `t` (kèm sim time tuyệt đối trong JSON).
- Teardown **luôn chạy** (kể cả FAIL/ERROR/timeout) nhưng không còn ảnh hưởng kết quả kỳ vọng (monitor nền đã dừng).

### 6.3 Máy trạng thái của executor

Trạng thái: `READY | WAIT_TIME(resumeAt) | WAIT_COND(expr, deadline) | WAIT_EXP(blocking set) | DONE`.

Tại `beforeExternals(T)`:
1. Nếu `WAIT_TIME` và `T ≥ resumeAt` → `READY`.
2. Khi `READY`: lấy lệnh kế tiếp, thực thi **ngay tại `T`**:
   - Hành động (`set, pulse, inject, source, force, controller, checkpoint, restore, clearFault, log`): áp dụng, ghi `StepLog`, **tiếp tục** lệnh sau trong cùng bước `T`.
   - `wait: d`: `resumeAt = T + d`; chuyển `WAIT_TIME`; **dừng** thực thi bước này.
   - `wait {until, timeout}`: `deadline = T + timeout`; chuyển `WAIT_COND`; dừng.
   - `expect`: tạo kỳ vọng với `armedAt = T`; `assert`/`never` không chặn (tiếp tục); `within/stableFor/ordered` chặn (chuyển `WAIT_EXP`, dừng).
   - Hết lệnh và không còn kỳ vọng chặn → `teardown` → `DONE`.

Tại `afterStep(T)` (trạng thái cuối bước T):
1. Cập nhật `TraceStore` (delta).
2. Đánh giá monitor nền (`never`, `stableFor` đang chạy).
3. `WAIT_COND`: nếu `expr` đúng → `READY` (hành động kế tiếp ở **đầu bước T+dt**); nếu `T ≥ deadline` → áp `onTimeout` (`fail` = đánh dấu test `FAIL` với mã `TS-F001 wait timeout`, **dừng test**, chạy teardown; `continue` = ghi cảnh báo và tiếp tục).
4. Đánh giá kỳ vọng `assert` (một lần), `within` (đúng → `pass`, hết hạn → `fail`), `ordered`.
5. Giới hạn: `T − T0 > maxSimTimeMs` → `ERROR TS-R001`; wall time > `maxWallTimeMs` → `ERROR TS-R002`.

**Hệ quả có chủ ý (ghi vào `docs/semantics.md`):**
- Điều kiện chờ đúng ở cuối bước `T` → hành động kế tiếp có hiệu lực ở **đầu bước `T+dt`** (độ trễ 1 bước).
- `wait: d` bắt đầu ở đầu bước `Ta` → hành động kế tiếp ở đầu bước `Ta + d` (chính xác).
- `expect` chạy ngay sau `inject` trong cùng bước nên sẽ **thấy hiệu ứng PLC của chính bước đó** nếu PLC phản ứng tức thì (xem ví dụ 6.5).
- Kỳ vọng `within: d` đánh giá ở cuối các bước `armedAt … armedAt+d` (bao gồm cả hai đầu).

### 6.4 Pacing
`Pacer`: `max` (không ngủ; mặc định CLI), `realtime(timeScale)` (UI; ngủ theo đồng hồ thật để đạt `timeScale`, ví dụ 20×). Logic mô phỏng **không** phụ thuộc pacer (cùng kết quả mọi tốc độ). Với controller ngoài (Chế độ B, sau này) pacer bị khóa 1× — runner phải kiểm tra qua `ControllerAdapter.kind` và báo `TS-E040` nếu test yêu cầu `max` mà có controller ngoài.

### 6.5 Ví dụ thực thi có tính toán (demo `motor-interlock` + `motor_dol`, `stepMs = plcScanMs = 10`, `startDelayMs = 500`)

```yaml
id: MI_overload_trip
title: Overload khi đang chạy → RUN_CMD về 0 và FAULT_LAMP lên
requirement: [FAT-1.1]
steps:
  - pulse: { tag: START_PB, ms: 100 }
  - wait: { until: "RUN_FB == true", timeout: 2s }
  - inject: { equipment: M01, fault: overload }
  - expect:
      - within: 100ms
        assert: "RUN_CMD == false and FAULT_LAMP == true"
```

| t (ms, tương đối) | Sự kiện |
|---|---|
| 0 | `START_PB=1`; PLC scan: cạnh lên → `RUN_CMD=1`; `pulse` hẹn nhả lúc t=100 |
| 10 | plant thấy `runCmd=1` → `STARTING` |
| 100 | `START_PB=0` (nhả) |
| 510 | plant `RUNNING`, `RUN_FB=1` (cuối bước 510 điều kiện `RUN_FB==true` đúng → thoát `WAIT_COND`) |
| 520 | đầu bước: `inject overload` → plant `TRIPPED` (`OVL_OK=0, RUN_FB=0`); PLC scan cùng bước: `FAULT_LAMP=1`, `RUN_CMD=0`; `expect within 100ms` armed tại 520 |
| 520 (cuối bước) | biểu thức đúng → `pass`, `timeToMs = 0` |

Golden test của executor phải tái tạo **đúng** bảng này.

---

## 7. C&E matrix

### 7.1 Khái niệm
- **Cause** (hàng): sự kiện/điều kiện kích (quá tải motor, mức cao, kéo dây, mất feedback...).
- **Effect** (cột): hành động mong đợi (dừng thiết bị X, khóa khởi động Y, báo động Z, đóng van...).
- **Cell**: ký hiệu giao cause–effect (+ thời gian trễ tùy chọn).

### 7.2 Hồ sơ import `io/ce-profile.yaml`
```yaml
name: Crusher line C&E
file: io/CE_matrix_rev2.xlsx
sheet: "C&E"
orientation: causesInRows            # causesInRows | causesInColumns
causeColumns: { id: "No.", tag: "Tag", description: "Cause", condition: "Condition", delay: null }
effectHeaderRows: { equipment: 5, action: 6 }   # hoặc chỉ { single: 5 } (header gộp "Stop BC01")
firstCauseRow: 7
firstEffectColumn: "H"
lastEffectColumn: null
fillDownColumns: []
symbols:                              # ký hiệu → loại tác động
  "X": stop
  "S": stop
  "T": trip
  "I": inhibit
  "A": alarm
  "R": reset
  "●": stop
ignoreSymbols: ["", "-", "n/a", "NA"]
delayPattern: "(\\d+(?:[.,]\\d+)?)\\s*(ms|s|sec|m|min)?"   # ký hiệu kèm delay: "T5", "X 10s", "5s"
```
Cú pháp ô cho phép: `X`, `X10` (10 s mặc định), `X 10s`, `X/10s`, `T 2min`, chỉ `5s` (dùng loại mặc định `stop` — cảnh báo `CE-W004`).

### 7.3 Phân tích header cột (effect)
- Tách động từ + đối tượng: từ điển động từ (vi/en/de, không dấu, không phân biệt hoa/thường):

| Hành động chuẩn | Từ khóa |
|---|---|
| `stop` | stop, trip, shutdown, off, dừng, ngừng, tắt, stopp, abschalten |
| `inhibit` | start inhibit, inhibit, interlock, block start, khóa khởi động, cấm chạy, startsperre |
| `alarm` | alarm, warning, báo động, cảnh báo, störung, alarmierung |
| `start` | start, run, enable, chạy, khởi động |
| `open` / `close` | open, mở, öffnen / close, đóng, schließen |
| `reset` | reset, quittieren |
- Đối tượng: khớp token với **equipment id/tag đã biết** (từ `equipment.yaml`, `tags.yaml`), ưu tiên khớp dài nhất; hàng `equipment` riêng (nếu có) thắng. Không khớp → `CE-W002 unknown equipment` + hiển thị để người dùng gán.
- Kết quả cột: `Effect { id: "E-03", verb, equipmentId?, description, observeExpr?, confidence, reasons[] }`.

### 7.4 Phân tích hàng (cause)
- `id`: từ cột `id` hoặc `CE-<số hàng>`.
- `tag`: tra `tags.yaml` → thiết bị + role (có thể trống).
- `condition` (chuỗi tự do) → cấu trúc `{ kind, op?, value?, unit?, state? }`:
  - So sánh số: `> 90`, `<= 10 %`, `LT01 > 90%` → `{kind: 'analog', op, value}`.
  - Trạng thái: bảng từ khóa → `state`: `active|triggered|pressed|on|high|đã kích|ausgelöst` → `active`; `overload|trip|fault|lỗi|quá tải|störung` → `fault`; `low|thấp|niedrig` → `low`; `lost|mất|no feedback|mất phản hồi` → `lostFeedback`; `0|false|off|not ok` → `false`; `1|true|ok` → `true`.
- Cause cuối cùng: `Cause { id, tag?, equipmentId?, role?, description, condition, confidence, reasons[] }`.

### 7.5 Kiểm tra dữ liệu C&E (mã cố định)

| Mã | Mức | Ý nghĩa |
|---|---|---|
| CE-E001 | error | Trùng id cause |
| CE-E002 | error | Không tìm thấy vùng ma trận / profile sai (hàng, cột ngoài phạm vi) |
| CE-E003 | error | Ký hiệu không có trong bảng `symbols` (liệt kê vị trí) |
| CE-E004 | error | Delay không parse được |
| CE-W001 | warn | Cause không có effect nào (hàng rỗng) |
| CE-W002 | warn | Effect trỏ tới thiết bị không tồn tại |
| CE-W003 | warn | Effect không có cause nào (cột rỗng) |
| CE-W004 | warn | Ô chỉ có delay, không có ký hiệu |
| CE-W005 | warn | Cause có tag không tồn tại trong `tags.yaml` |
| CE-W006 | warn | Delay quá lớn so với `maxSimTimeMs` của test |
| CE-I001 | info | Dòng/cột bị bỏ qua và lý do |

Chuẩn hóa → `tests/ce-matrix.normalized.yaml` (ổn định thứ tự để diff git), kèm báo cáo import (JSON/HTML) như M2. **Re-import idempotent**; trường người dùng sửa tay (`provenance: manual`) không bị ghi đè.

### 7.6 Mô hình
```ts
interface CeMatrix { causes: Cause[]; effects: Effect[]; cells: Cell[] }
interface Cell { cause: string; effect: string; action: 'stop'|'trip'|'inhibit'|'alarm'|'start'|'reset'|'open'|'close'; delayMs?: number; symbol: string; src: SrcRef }
interface CeResultMatrix { cells: { cause: string; effect: string; action: string; delayMs?: number; status: TestStatus | 'UNBOUND'; tests: string[] }[] }
```

---

## 8. Bindings (cause → kích, effect → quan sát)

C&E chỉ mô tả *ý định*. Để chạy được cần biết **kích thế nào** và **quan sát ở đâu** (phụ thuộc chương trình PLC). Quy tắc: *hệ thống đề xuất, người dùng duyệt, mọi thứ chưa bind được hiển thị `UNBOUND`.*

### 8.1 Tệp `tests/bindings.yaml`
```yaml
global:
  setup:                                  # chạy sau baseline cho mọi test sinh tự động
    - set: { ESTOP_OK: true, AUTO_MODE: true }
  startOrder: [FN01, OP01, BC03, BC02, BC01, CR01, AF01]   # thứ tự khởi động thiết bị tiền điều kiện
  defaults:
    responseWindowMs: 2000                # cửa sổ phản hồi khi effect không có delay
    toleranceMs: 500
    negativeChecks: scoped                # off | scoped | all
    startTimeout: 15s
equipment:
  CR01:
    start: { pulse: { tag: CR01_START, ms: 200 } }
    stop:  { pulse: { tag: CR01_STOP,  ms: 200 } }
    runningExpr: "$CR01.runFb == true"            # mặc định: role runFb
    stoppedExpr: "$CR01.runCmd == false"          # quan sát effect "stop": PLC thôi cấp lệnh chạy
    faultTag: CR01_FAULT                          # tùy chọn: bit lỗi chốt
    reset: { pulse: { tag: CR01_RESET, ms: 200 } }
    permissives: [ { tag: OIL_OK, blockedValue: false } ]
    feedbackTimeoutMs: 3000
causes:                                   # ghi đè/bổ sung theo id cause
  CE-008:
    stimulus: [ { source: { equipment: PS01, active: true } } ]
effects:                                  # ghi đè/bổ sung theo id effect
  E-03:
    observe: "$BC01.runCmd == false"
    precondition: [ { run: { macro: std.startEquipment, args: { eq: BC01 } } } ]
```
Zod schema + JSON Schema xuất cho editor; mọi tag/equipment/macro được kiểm tra tồn tại lúc load (`TS-E001`/`TS-E030`).

### 8.2 Bộ resolver heuristic (đề xuất binding) — `ce/bindings.ts`

**Cause → stimulus** (dựa vào thiết bị/role của `cause.tag` và `condition`). Stimulus tác động lên **điều kiện vật lý**, không lên DI (nên polarity NO/NC của PLC không ảnh hưởng):

| Thiết bị/role của cause | Điều kiện | Stimulus sinh ra |
|---|---|---|
| `switch_di` (mọi `kind`) | `active`/mặc định | `source: { equipment, active: true }` (trigger) |
| `analog_sensor` | `analog` (`> v`, `< v`) | `source: { equipment, value: v ± margin }` với `margin = max(2% × span, 1 đơn vị nhỏ nhất)` (tham số `analogMargin`, mặc định 2%) |
| `silo_bin` | `high`/`low` | `source` mức bằng `highPct+1` / `lowPct−1` (qua `inflow/outflow` hoặc đặt `initialLevel` ở setup; ưu tiên `setLevel` nếu model cung cấp, mặc định đặt `mass` qua `source`) |
| `motor_*` | `fault` | `inject: { equipment, fault: overload \| vfdTrip }` |
| `motor_*` (role `runFb`) | `lostFeedback` | `inject: { equipment, preset: noRunFeedback }` |
| `conveyor_simple` (role `pullCord`) | `active` | `inject: { equipment, fault: pullCordTrip }` |
| `conveyor_simple` (role `zeroSpeed`) | `active` | `inject: { equipment, fault: beltSlip }` |
| `valve_*` | `fault`/`stuck` | `inject: { equipment, fault: stuckAtPos \| stuckOpen \| stuckClosed }` (cần người dùng chọn, độ tin cậy thấp) |
| Tag **virtual input** (chưa gán thiết bị: E-stop, selector, lệnh HMI) | `true/false/active` | `set: { TAG: value }` (E-stop NC: dùng giá trị "kích" là `false`; lấy từ cột `polarity` của I/O list nếu có, không có → UNBOUND để hỏi) |
| Khác | — | `UNBOUND` (lý do: "không suy ra được cách kích") |

**Effect → observe** (từ `verb` + `equipmentId`):

| Hành động | Thiết bị | Biểu thức quan sát |
|---|---|---|
| `stop`/`trip` | motor, conveyor, vfd | `stoppedExpr` (mặc định `$EQ.runCmd == false`) |
| `stop`/`trip` | `valve_onoff` đóng | `$EQ.closeCmd == true` (hai cuộn) hoặc `$EQ.openCmd == false` (một cuộn) |
| `open` | `valve_onoff` | ngược lại |
| `stop`/`close` | `valve_ctrl`/damper | `eng($EQ.posRef) <= 1` |
| `inhibit` | motor | **kiểu `blocked`**: sau khi phát lệnh start (binding `start`), `never: $EQ.runCmd == true` trong cửa sổ (không cần `observe`) |
| `alarm` | bất kỳ | cần `alarmTag` trong binding; nếu không có → `UNBOUND` |
| `start`/`enable` | motor | `$EQ.runCmd == true` (cần stimulus start; thường cho C&E dạng "tự khởi động") |

**Tiền điều kiện (precondition) của effect:** trạng thái cần có **trước** khi áp cause để effect quan sát được:
- `stop`/`trip` thiết bị → thiết bị đang **chạy** (`startEquipment`).
- `close` van → van đang **mở**.
- `inhibit` → thiết bị **đang dừng** và các permissive khác thỏa (trừ cause đang xét).
- Với nhiều effect trong một hàng: hợp các tiền điều kiện; thứ tự khởi động theo `global.startOrder` (thiếu → theo thứ tự cột).
- Tiền điều kiện không thực hiện được (thiếu binding `start`...) → `UNBOUND` với lý do cụ thể.

Mỗi đề xuất có `confidence` (0..1) và `reasons[]`; UI duyệt hàng loạt (như M2); CLI `vcs ce suggest-bindings --accept-confident` ghi vào `bindings.yaml` (mục `causes`/`effects`/`equipment` tương ứng) kèm `provenance: suggested`.

---

## 9. Sinh test từ C&E (FR-503) và mẫu motor (FR-504)

### 9.1 Thuật toán sinh test cho **mỗi cause (hàng)**
```
cells = các ô có ký hiệu của hàng
Nếu không có cell nào → bỏ qua (CE-W001), không sinh
Phân loại cells: STOPS (stop/trip), INHIBITS, ALARMS, STARTS, OTHERS
Với mỗi cell: resolve observe/blocked/alarm, precondition. Nếu bất kỳ cell nào không resolve được
   → cell đó đánh dấu UNBOUND (ghi lý do); các cell còn lại vẫn sinh test nếu cause có stimulus.
Nếu cause không có stimulus → toàn bộ hàng UNBOUND (lý do).
Test "CE-<id>":
  isolation: baseline
  setup:
    - global.setup
    - (precondition) startEquipment theo startOrder cho tập thiết bị cần chạy:
        = (equipments của STOPS cells) ∪ (equipments để giữ "scoped negative check", mục 9.2)
    - (precondition) cho INHIBITS: bảo đảm thiết bị dừng, permissive khác thỏa
  steps:
    - log: "Kích cause: <description>"
    - [arm never cho negativeChecks]                     # trước khi áp stimulus
    - stimulus của cause (set/source/inject)
    - [với INHIBITS: sau stimulus, phát start (binding) → never run]  # xem 9.3
  expect (sau stimulus, armed cùng bước):
    - với mỗi cell STOP/TRIP: within: (delay + tolerance), assert: observe
        + nếu cell.delay > 0: notBefore: (delay − tolerance)      # delay chính xác
        + message: "C&E <cause> → <effect> (<symbol>)"
    - với ALARM: within, assert: alarmTag == true
  teardown: clearFault all; (restore baseline tự động bởi isolation)
```
- Cửa sổ `within` cho cell không delay: `responseWindowMs` (mặc định 2000 ms). Có delay `d`: `within: d + toleranceMs`, `notBefore: max(0, d − toleranceMs)`.
- Mỗi expectation mang `ceCell: { cause, effect }` để báo cáo tô màu ô ma trận.
- Trong báo cáo, `requirement` của test = `[CE-<id>]` + id cause từ cột `id` nếu khác.

### 9.2 Negative checks (`negativeChecks`)
- `off`: không kiểm tra.
- `scoped` (**mặc định**): với các thiết bị mà test đã khởi động nhưng **không** nằm trong effect STOP của hàng này (ví dụ hạ nguồn không bị ảnh hưởng): `never: <stoppedExpr của nó>` từ lúc áp stimulus tới hết test. Ý nghĩa: "không có effect ngoài ma trận" cho đúng tập thiết bị liên quan.
- `all`: mở rộng cho mọi thiết bị có binding (chạy hết dây chuyền ở precondition) — chậm hơn, dùng cho FAT cuối.
- Tránh false positive: thiết bị là **hạ nguồn bị dừng do chính chuỗi dừng bình thường** không thuộc phạm vi hàng này → người dùng khai `exempt` trong bindings; mặc định không có exempt.

### 9.3 Cell `inhibit` (khóa khởi động)
Hai dạng, chọn theo cause/effect:
1. **Cause kích khi thiết bị đang dừng**: setup → thiết bị dừng + các permissive khác OK; stimulus cause; phát `start` (binding); `never: $EQ.runCmd == true` trong `responseWindowMs`.
2. **Đối chứng dương (positive control)**: *bắt buộc kèm* một test con `…_control`: **không** áp cause, phát `start` → `within: startTimeout assert runningExpr` (chứng minh thiết bị khởi động được khi không có cause; tránh "inhibit giả" do thiết bị vốn không chạy được vì lý do khác).

### 9.4 Đầu ra sinh
- `tests/generated/ce/<matrixName>.test.yaml` (một suite; mỗi cause một test, test control đặt cạnh). Header: `# GENERATED by vcs ce generate — DO NOT EDIT. source: <file>#<sha>`.
- Ổn định: sắp theo `cause.id`; YAML key theo thứ tự cố định; **cùng đầu vào → cùng byte đầu ra** (golden test).
- `vcs ce generate --check`: sinh vào bộ nhớ và so với file hiện có; lệch → exit 1 (dùng trong CI).
- Tùy biến: không sửa file sinh; thêm/đổi qua `bindings.yaml` (`causes/effects`) hoặc tạo test viết tay riêng trong `tests/manual/` và đặt `skipGenerated: [CE-007]` trong `bindings.global` để loại bản sinh của cause đó.
- `UNBOUND` ghi vào `tests/generated/ce/<matrixName>.unbound.yaml` (cause/cell, lý do, gợi ý binding cần thêm) và xuất hiện trong báo cáo.

### 9.5 Mẫu test motor (`vcs test gen motor <equipment>` hoặc `--all-motors`)
Sinh vào `tests/generated/motor/<EQ>.test.yaml`, dựa trên binding của thiết bị. Mỗi test có bản **đối chứng** khi cần.

| ID mẫu | Nội dung | Điều kiện cần binding | Kỳ vọng chính |
|---|---|---|---|
| `M.start_stop` | Start → chạy → Stop | `start`, `stop` | `within startTimeout`: `runningExpr`; sau stop `within responseWindow`: `stoppedExpr` rồi `runFb == false` trong `stopDelay + margin` |
| `M.start_inhibit_<perm>` | Mất từng permissive → start không chạy; đối chứng dương | `start`, `permissives[]` | `never runCmd` trong cửa sổ; `control` chạy được |
| `M.trip_overload` | Chạy → inject `overload` | `start` | `within responseWindow`: `stoppedExpr`; nếu có `faultTag`: `stableFor: faultTag==true, 2s`; **reset flow:** gỡ lỗi → `reset` → start lại thành công (kiểm tra chốt lỗi và reset) |
| `M.no_feedback` | Chạy với preset `noRunFeedback` | `start`, `feedbackTimeoutMs` | `within feedbackTimeout + tolerance`: `stoppedExpr`; `notBefore: feedbackTimeout − tolerance`; nếu `faultTag`: true |
| `M.local_mode` | Fault `localMode` rồi start | `start` | `never runFb == true` trong `feedbackTimeout + margin`; nếu `faultTag`: true sau timeout |
| `M.abort_starting` | Start rồi Stop trước khi hút | `start`, `stop` | `never runFb == true`; `stoppedExpr` |
| `M.contactor_stuck` | Chạy → `contactorStuck` → Stop | `start`, `stop` | PLC phải báo lỗi hoặc `stoppedExpr` giữ; ghi nhận (expectation phụ thuộc binding `onContactorStuck: expectFault`) |
Thiếu binding → mẫu tương ứng `UNBOUND` (lý do). Giá trị mặc định cửa sổ lấy từ `global.defaults` và tham số model (`startDelayMs`, `stopDelayMs`).

---

## 10. Báo cáo FAT

### 10.1 Đầu ra
`vcs test ... --report out/` ghi: `out/report.html`, `out/results.json`, `out/junit.xml`. `vcs report build results.json` dựng lại HTML từ JSON (chuyển giao/ký xong vẫn tái dựng được).

### 10.2 Metadata (`RunMeta`) — trang bìa
- Tên dự án, controller (id, vendor, model, **chế độ A/B**), phiên bản VCS, version schema.
- **`projectHash`**: sha256 trên (chuẩn hóa) `vcs.project.yaml`, `tags.yaml`, `equipment.yaml`, mọi file PLC nguồn, `bindings.yaml`, các `*.test.yaml`; **`gitCommit`** (nếu là repo git, kèm cờ `dirty`).
- Ngày giờ chạy (UTC + múi giờ máy), người chạy (cấu hình `--operator` hoặc biến môi trường), máy (OS, Node, CPU), `seed`, cấu hình mô phỏng (`stepMs`, `plcScanMs`, `timeScale`), tham số negative checks.
- **`resultsHash`**: sha256 trên danh sách `test.hash` (đã sắp theo id) → hai lần chạy cùng dự án+seed phải cho cùng `resultsHash` (tính chất kiểm chứng tái lập).

### 10.3 Nội dung HTML (một file tự chứa; CSS/JS/SVG inline; không phụ thuộc mạng)
1. **Trang bìa & tóm tắt:** metadata, số PASS/FAIL/ERROR/SKIP/UNBOUND, thanh tỷ lệ, thời gian sim/wall, `resultsHash`.
2. **Mức tuân thủ & giới hạn mô phỏng** (khối cố định, dịch được): chế độ controller; câu "kết quả mô phỏng không thay thế SAT"; **danh sách ngữ nghĩa còn `UNVERIFIED`** lấy từ `docs/semantics.md` (M1) — để người đọc biết giới hạn tương thích.
3. **Bảng test** (lọc theo trạng thái/tag/requirement, tìm kiếm): ID, tiêu đề, requirement, kết quả, thời gian sim, ghi chú.
4. **Chi tiết từng test** (thu gọn/mở rộng, neo `#test-<id>`): mô tả, bước đã thực thi (có thời gian tương đối), bảng kỳ vọng (loại, biểu thức, kết quả, `timeToMs`, giá trị quan sát), **biểu đồ bằng chứng** (mục 10.4), nguyên nhân khi fail/error.
5. **Ma trận C&E** (nếu có): lưới cause×effect, ô tô màu `PASS/FAIL/UNBOUND/SKIP`, ô trống = không ràng buộc; click ô → nhảy tới test; chú giải ký hiệu.
6. **Truy vết requirement** (`tests/requirements.yaml`: `id`, `title`, `source`): bảng requirement → test → kết quả; requirement không có test hiển thị **NOT COVERED**; test tham chiếu requirement lạ → cảnh báo `TS-W020`.
7. **Danh sách UNBOUND/SKIP** và lý do + hướng dẫn bổ sung binding.
8. **Phụ lục:** danh sách tag đã force/fault đã tiêm theo test, cấu hình truyền thông (M4+), cấu hình mô phỏng, danh sách file nguồn kèm hash.
9. **Khung ký xác nhận:** vai trò (Vendor/EPC/Client), tên, chức danh, ngày, chữ ký (để trống).

### 10.4 Biểu đồ bằng chứng (`charts.ts`)
- SVG tạo bằng code (không thư viện ngoài), **biểu đồ bậc thang** cho bool, **đường** cho analog/observable; tối đa 8 tín hiệu/biểu đồ, xếp chồng theo hàng; trục thời gian tương đối.
- Cửa sổ vẽ = `window` của kỳ vọng (mặc định `[armedAt − 1s, resolvedAt|deadline + 1s]`), đánh dấu: `armed`, `deadline`, `resolved`/`failed` (đường đứng), vùng `notBefore`, vùng `never` đã vi phạm.
- Tín hiệu vẽ = tag/observable trong biểu thức + tag liên quan (role runCmd/runFb của thiết bị trong cell). Quá nhiều điểm → giảm mẫu (giữ mọi thay đổi bool; analog chỉ giảm mẫu theo 100 ms).
- Mỗi biểu đồ kèm bảng giá trị rút gọn (tag, giá trị lúc armed / lúc quyết định) — dùng được khi in trắng đen (đồng thời dùng hoa văn/nhãn chữ, không chỉ màu).

### 10.5 Yêu cầu trình bày
- In được: `@media print` (A4, ngắt trang trước mỗi mục lớn, không cắt biểu đồ, bảng lặp header); in ra PDF bằng trình duyệt đạt chất lượng.
- Đa ngôn ngữ `--lang vi|en` (từ điển `i18n/*.json`; tên thiết bị/tag không dịch); mặc định theo `project.language`, dự phòng `en`.
- Khả năng truy cập: tương phản đủ, `alt`/`<title>` cho SVG, điều hướng bàn phím cho bảng lọc.
- Nhúng `results.json` trong `<script type="application/json" id="vcs-results">` (cho công cụ ngoài).
- **Tất định:** cùng `results.json` → cùng HTML từng byte (trừ trường "ngày dựng báo cáo" nếu có; để trường này **nằm ngoài** `resultsHash`).

### 10.6 `results.json` và `junit.xml`
- `results.json`: đúng `RunResult` (mục 3.4), có `schema` version, **sắp xếp ổn định**; trace nén delta; có JSON Schema xuất kèm (`results.schema.json`) và test kiểm tra tương thích.
- `junit.xml`: `<testsuite>` mỗi suite, `<testcase classname=suite name=id time=simSec>`; `FAIL` → `<failure message="...">` (kỳ vọng đầu tiên fail + giá trị quan sát), `ERROR` → `<error>`, `SKIP`/`UNBOUND` → `<skipped message=lý do>`. Kiểm tra bằng XSD JUnit phổ biến.
- Exit code CLI: `0` tất cả PASS (SKIP/UNBOUND không làm fail trừ khi `--strict-unbound`), `1` có FAIL, `2` có ERROR, `3` sai tham số/không load được dự án.

---

## 11. CLI và UI

### 11.1 CLI
```
vcs test [globs…] [--tag t] [--grep s] [--requirement id] [--only-generated|--only-manual]
         [--fail-fast] [--ci] [--seed N] [--lang vi|en] [--operator "Tên"]
         [--report dir] [--format html,json,junit] [--timescale max|N] [--strict-unbound]
vcs test gen motor <EQ>|--all
vcs ce import <file> --profile io/ce-profile.yaml [--commit]
vcs ce suggest-bindings [--accept-confident]
vcs ce generate [--check]
vcs ce status                    # bảng tóm tắt UNBOUND/PASS theo ô
vcs req import <csv>             # tạo tests/requirements.yaml
vcs report build <results.json> [--lang] [--out]
```

### 11.2 UI (apps/web)
1. **Test Center:** cây suite/test (biểu tượng trạng thái), bộ lọc, nút Run (selected/all/failed), tiến độ trực tiếp, chọn `timeScale` (1×…max). Chi tiết kết quả: log bước, bảng kỳ vọng, biểu đồ bằng chứng (dùng cùng `charts.ts`), nút "Mở trong Watch" (đưa tag liên quan vào watch table), nút "Chạy lại có quan sát" (realtime).
2. **C&E view:** import wizard (dùng lại thành phần của wizard I/O: sheet → header → mapping vùng ma trận → bảng ký hiệu → kiểm tra → commit); lưới ma trận tô màu theo kết quả; click ô → test/binding.
3. **Bindings editor:** bảng thiết bị (start/stop/reset/faultTag/permissives/feedbackTimeout), bảng cause (stimulus), bảng effect (observe/precondition); gợi ý + chấp nhận hàng loạt; kiểm tra tức thời bằng nút "Thử" (chạy macro `startEquipment` trực tiếp trong simulation).
4. **Trình soạn YAML test:** Monaco + JSON Schema (từ zod) + autocompletion tag/equipment/fault/macro + lỗi biên dịch biểu thức inline.
5. **Report:** nút Build/Open, chọn ngôn ngữ, xem trước.

---

## 12. Chiến lược test và nghiệm thu

### 12.1 Test của chính M3 (số lượng tối thiểu)

| Nhóm | Số test |
|---|---|
| Lexer/parser/biểu thức (đúng, sai, ưu tiên, hàm, `$`/`@`, lỗi vị trí) | ≥ 50 |
| Schema DSL + loader (hai dạng file, trùng id, skip/only, thời lượng) | ≥ 25 |
| Macro (tham số, mặc định, đệ quy, độ sâu) | ≥ 10 |
| Executor timeline (`wait`, `within`, `never`, `stableFor`, `ordered`, `notBefore`, `pulse`, timeout) | ≥ 30 (mỗi cái có bảng thời gian tính tay như 6.5) |
| Isolation/baseline/checkpoint/restore/teardown | ≥ 10 |
| C&E parsing (ký hiệu, delay, header đa hàng, transposed, từ khóa vi/en/de, điều kiện) | ≥ 35 |
| Binding resolver (mỗi dòng của bảng 8.2 ≥ 1; UNBOUND có lý do) | ≥ 30 |
| Sinh test: golden YAML, deterministic, `--check`, negative checks, inhibit + control | ≥ 20 |
| Mẫu motor (mỗi mẫu 1 golden chạy thật với `motor_dol` + FB_Motor) | ≥ 7 |
| Báo cáo: cấu trúc HTML (cheerio), neo/link, ma trận C&E, bất biến byte, `resultsHash`, i18n, XSD JUnit, JSON Schema | ≥ 25 |
| CLI: exit code, lọc, `--strict-unbound` | ≥ 10 |
| Property-based: biểu thức (parse(print(x)) = x), `within` so với mô hình tham chiếu, `never` | 3 nhóm |

### 12.2 Demo `crusher-sequence` (nghiệm thu chính)

**Thiết bị (≥ 7 motor):** `AF01` apron feeder (`motor_vfd`), `CR01` crusher (`motor_dol`, dòng qua `analog_sensor CT01`, nhiệt vòng bi `TT01`), `OP01` bơm dầu (`motor_dol`) + `PS01` công tắc áp dầu (`switch_di`), `BC01`, `BC02`, `BC03` (`conveyor_simple`, có `pullCord` + `zeroSpeed`), `FN01` quạt bụi (`motor_dol`), `BIN01` (`silo_bin`) + `LSH01`/`LSHH01` (`switch_di` link tới `levelPct`). Dòng vật liệu: **AF01 → CR01 → BC01 → BC02 → BC03 → BIN01**.

**Logic PLC (AI viết SCL, dựa `FB_Motor` của M1):** mỗi motor có lệnh `START_<EQ>`/`STOP_<EQ>` (virtual input) ở chế độ AUTO; điều kiện khởi động: permissive riêng + **hạ nguồn đang chạy** (BC02 chạy mới cho BC01...; CR01 cần `OP01` chạy và `OIL_OK`; `AF01` cần `CR01`); điều kiện dừng/trip theo ma trận dưới; dừng một thiết bị do interlock → dừng **chính nó và mọi thiết bị thượng nguồn** (hạ nguồn tiếp tục chạy xả); mất feedback `3 s` → lỗi chốt `FAULT_<EQ>` + dừng; lỗi chốt cần `RESET_<EQ>` mới khởi động lại. Chương trình phải **có tham số hóa theo mặt nạ interlock** để dễ đối chiếu với C&E.

**Thứ tự khởi động (precondition):** `FN01, OP01, BC03, BC02, BC01, CR01, AF01`.

**C&E mẫu (20 hàng; ● = stop; T = trip; số = delay giây).** Cột effect = dừng thiết bị:

| # | Cause | AF01 | CR01 | BC01 | BC02 | BC03 | OP01 | FN01 |
|---|---|---|---|---|---|---|---|---|
| 1 | AF01 VFD trip | T | | | | | | |
| 2 | CR01 overload | T | T | | | | | |
| 3 | BC01 overload | T | T | T | | | | |
| 4 | BC02 overload | T | T | T | T | | | |
| 5 | BC03 overload | T | T | T | T | T | | |
| 6 | FN01 overload | ● | ● | | | | | T |
| 7 | OP01 overload | ● | ● | | | | T | |
| 8 | PS01 áp dầu thấp (5 s) | ●5 | ●5 | | | | | |
| 9 | BC01 pull-cord | ● | ● | ● | | | | |
| 10 | BC02 pull-cord | ● | ● | ● | ● | | | |
| 11 | BC03 pull-cord | ● | ● | ● | ● | ● | | |
| 12 | BC01 zero-speed khi chạy (10 s) | ●10 | ●10 | ●10 | | | | |
| 13 | BC02 zero-speed (10 s) | ●10 | ●10 | ●10 | ●10 | | | |
| 14 | BC03 zero-speed (10 s) | ●10 | ●10 | ●10 | ●10 | ●10 | | |
| 15 | BIN01 mức cao (LSH01) | ● | | | | | | |
| 16 | BIN01 mức cao-cao (LSHH01) | ● | ● | ● | ● | ● | | |
| 17 | CR01 dòng > 110% (10 s) | ●10 | ●10 | | | | | |
| 18 | CR01 nhiệt vòng bi > 95 °C (5 s) | ●5 | ●5 | | | | | |
| 19 | E-stop (`ESTOP_OK=0`) | ● | ● | ● | ● | ● | ● | ● |
| 20 | OP01 mất feedback (3 s) | ● | ● | | | | T | |

Thêm cột **khóa khởi động `CR01`** (ký hiệu `I`) cho hàng 8, 19 và cột **khóa khởi động `AF01`** cho hàng 19 (sinh test `inhibit` + đối chứng). Cause 12–14 cần `zeroSpeed` do model `conveyor_simple` (fault `beltSlip`); cause 17/18 dùng `analog_sensor` với ngưỡng từ cột condition; cause 20 dùng preset `noRunFeedback`.

**Kết quả mong đợi:** `vcs ce generate` sinh **≥ 20 test C&E** (+ test đối chứng + `inhibit`) và mẫu motor cho 7 motor; chạy đầy đủ **≤ 60 s wall** ở `timeScale max`; báo cáo HTML đầy đủ; **bắt buộc đạt mục 12.3**.

### 12.3 Mutation check (kiểm chứng chất lượng bộ test)
- `scripts/mutate-scl.ts` dùng AST SCL (M1) để sinh mutant của chương trình demo. Toán tử:

| Mã | Biến đổi |
|---|---|
| M-NEG | đảo điều kiện của một `IF`/biểu thức bool (`x` ↔ `NOT x`) |
| M-ANDOR | đổi `AND` ↔ `OR` trong một biểu thức |
| M-DEL | xóa một câu lệnh gán |
| M-CONST | đổi hằng số (±1 bước, `T#3s`→`T#1s` hoặc `T#10s`) |
| M-EDGE | bỏ phát hiện cạnh (dùng mức thay cạnh) |
| M-NC | đảo cực tính một đầu vào (NC ↔ NO) |
| M-ORD | đảo thứ tự hai câu lệnh liền kề |
- Mỗi mutant: biên dịch → chạy **toàn bộ** suite sinh tự động + mẫu motor; mutant **bị giết** nếu có ≥ 1 test `FAIL`/`ERROR` so với chương trình gốc (gốc phải 100% PASS).
- Báo cáo mutation (`reports/mutation.json|html`): tổng mutant, giết/sống, danh sách mutant sống (vị trí, loại) để người dùng đánh giá (mutant tương đương logic có thể sống; đánh dấu `equivalent` bằng tay).
- Chạy mutant song song/nhanh: baseline snapshot, `timeScale max`, giới hạn thời gian mỗi mutant 120 s wall; lấy mẫu có seed (`--sample 100`).

### 12.4 Tiêu chí nghiệm thu M3 (tất cả phải đạt)
1. `pnpm test/lint/typecheck` xanh; M1/M2 không hồi quy.
2. Các bảng thời gian tính tay (6.5 và mọi golden executor) được tái tạo **chính xác**.
3. Demo `crusher-sequence`: import C&E → gợi ý binding (≥ 85% binding đề xuất đúng khi so với `bindings.expected.yaml` của fixture) → sinh **≥ 20 test C&E** + inhibit/control + mẫu motor → chạy → báo cáo.
4. **Mutation score ≥ 90%** trên ≥ 100 mutant (mẫu có seed) sau khi loại mutant tương đương đánh dấu bằng tay (dự kiến ≤ 10%); chương trình gốc 100% PASS, 0 test flaky (chạy 3 lần cho cùng `resultsHash`).
5. Mọi ô C&E đều có trạng thái rõ (PASS/FAIL/UNBOUND/SKIP); **không có "bỏ qua im lặng"** (mọi ô trong ma trận normalized xuất hiện trong báo cáo).
6. Báo cáo HTML đủ mục 10.3, in ra PDF A4 đạt (kiểm bằng Playwright `page.pdf` snapshot cấu trúc), HTML bất biến byte với cùng `results.json`.
7. `results.json` hợp lệ theo JSON Schema; `junit.xml` hợp lệ XSD; exit code đúng.
8. Hiệu năng (mục 13) đạt.
9. UI: người dùng đi trọn luồng *import C&E → duyệt binding → sinh test → chạy → xem ma trận/biểu đồ → build báo cáo* (Playwright e2e xanh).
10. Không `any` ngoài ranh giới I/O; `testing` chỉ đọc/ghi mô phỏng qua `TestHost`; không dùng `Date.now`/`Math.random` trong logic đánh giá (chỉ dùng để gắn timestamp metadata ở lớp runner/report).

---

## 13. Hiệu năng

- Executor + biểu thức: ≥ **200 000 kỳ vọng-đánh-giá/giây** (một kỳ vọng đơn giản × một bước) trên laptop phổ thông; trace delta không làm chậm mô phỏng quá 15% so với không trace.
- Demo `crusher-sequence` (≥ 25 test, mỗi test tiền điều kiện ~8–10 s sim + ≤ 20 s sim): chạy ≤ **60 s wall** ở `max`.
- `TraceStore`: bộ nhớ ≤ 50 MB/test với tag đã chọn (giới hạn cứng 2 triệu sự kiện đổi giá trị/test, vượt → cảnh báo `TS-W030` và cắt bớt phần giữa của trace).
- Sinh báo cáo: 200 test (mỗi test 4 biểu đồ) ≤ 10 s; HTML ≤ 25 MB (cảnh báo > 15 MB).
- `pnpm bench` lưu `bench/results.json`; regression > 20% → cảnh báo CI.

---

## 14. Mã chẩn đoán (`TS-*`)

| Mã | Mức | Ý nghĩa |
|---|---|---|
| TS-E001 | error | Tag/equipment/observable không tồn tại (kèm gợi ý) |
| TS-E002 | error | Role chưa gán cho thiết bị |
| TS-E003 | error | Trùng id test |
| TS-E004 | error | `only` trong chế độ CI |
| TS-E005 | error | Kiểu không khớp trong biểu thức |
| TS-E006 | error | Lỗi cú pháp biểu thức/YAML (vị trí) |
| TS-E010 | error | `set` vào tag do plant sở hữu |
| TS-E011 | error | `set` vào tag do PLC sở hữu |
| TS-E020 | error | Thiếu tham số macro |
| TS-E021 | error | Macro đệ quy/quá sâu |
| TS-E030 | error | Binding bắt buộc bị thiếu |
| TS-E040 | error | Yêu cầu pacing không tương thích controller ngoài |
| TS-F001 | fail | `wait until` hết thời gian |
| TS-R001 | error | Vượt `maxSimTimeMs` |
| TS-R002 | error | Vượt `maxWallTimeMs` |
| TS-W010 | warn | Thời lượng không chia hết `stepMs` |
| TS-W020 | warn | Requirement không tồn tại trong `requirements.yaml` |
| TS-W030 | warn | Trace bị cắt do vượt giới hạn |
| CE-* | | Xem bảng 7.5 |

Mọi thông báo phải nêu: file, dòng/cột (nếu có), đối tượng liên quan và **hướng sửa**.

---

## 15. Kế hoạch triển khai và prompt cho AI

| Ngày | Công việc | Kết quả |
|---|---|---|
| 1 | Lexer/parser/compile biểu thức + test | 50 test xanh |
| 2 | Schema DSL + loader + macro + thư viện `std` | 25+10 test |
| 3 | Hooks orchestrator + `TestHost` + `TraceStore` + `Pacer` | chạy hành động đơn giản |
| 4–5 | Executor + monitors (`within/never/stableFor/ordered/notBefore`) + isolation/baseline/checkpoint | bảng 6.5 tái tạo chính xác, 30+10 test |
| 6 | Runner + select + results + hash + CLI `vcs test` | exit code, `results.json` |
| 7 | Báo cáo: `results.json` schema, JUnit | XSD pass |
| 8–9 | Báo cáo HTML: cấu trúc, charts SVG, ma trận, traceability, i18n, print CSS | test cấu trúc, in PDF |
| 10 | C&E: reader (tái dùng M2), profile, ký hiệu/delay, header/cause parse, validate, diff/commit | 35 test |
| 11 | Bindings: schema + resolver + suggest + UI hook | 30 test |
| 12 | Generator C&E (+ negative checks, inhibit + control, `--check`) + mẫu motor | golden YAML |
| 13 | Demo `crusher-sequence` (PLC SCL + equipment + C&E + bindings) chạy đầy đủ | báo cáo demo |
| 14 | Mutation tool + chạy ≥ 100 mutant, xử lý mutant sống (sửa binding/test) | score ≥ 90% |
| 15 | UI (Test Center, C&E view, Bindings editor) + e2e + tài liệu + đệm | nghiệm thu |

### Prompt mẫu

**P3.1 (biểu thức):**
> Đọc `M3-test-automation-spec.md` mục 5. Trong `packages/testing/src/expr`, cài lexer/parser/compile theo EBNF 5.1 (tham chiếu `$EQ.role`, `@EQ.obs`, hàm `prev/rose/fell/changed/since/eng`). Compile ra closure với tag resolve thành chỉ số; trả về `refs[]`. Lỗi có vị trí chính xác và gợi ý gần nhất (`TS-E001`). ≥ 50 test + property test `parse(print(x)) = x`.

**P3.2 (DSL + macro):**
> Theo mục 3, cài schema zod cho hai dạng tệp, loader (expand macro lúc load, không đệ quy), thư viện `std/macros.yaml`, JSON Schema xuất cho Monaco. Test các mã `TS-E003/E004/E020/E021/E030`.

**P3.3 (executor):**
> Theo mục 4 và 6, cài hooks trong orchestrator, `TestHost`, `TraceStore`, `Pacer`, `TestExecutor` với máy trạng thái 6.3 và các monitor. **Trước khi code**, tự tính tay ≥ 10 bảng thời gian (mỗi loại kỳ vọng) và dùng làm golden test. Bảng ở 6.5 phải tái tạo chính xác. Mâu thuẫn → ghi `docs/open-questions.md`, không sửa kỳ vọng im lặng.

**P3.4 (runner + báo cáo):**
> Theo mục 3.4, 10: `TestRunner` (isolation baseline/reset/none, teardown luôn chạy), `RunResult` + hash, CLI `vcs test`, báo cáo HTML tự chứa (SVG bằng code, không thư viện ngoài), `results.json` + JSON Schema, `junit.xml`. Báo cáo phải tất định theo từng byte và in được A4.

**P3.5 (C&E):**
> Theo mục 7, cài đọc C&E bằng reader của M2, `ce-profile.yaml`, parse ký hiệu/delay, header đa hàng, điều kiện, mã `CE-*`, diff/commit idempotent. Bộ fixture sinh bằng `scripts/gen-ce-fixture.ts` (có ground truth).

**P3.6 (bindings + sinh test):**
> Theo mục 8, 9, cài `bindings.yaml` (schema + resolver + suggest), sinh test C&E (đúng thuật toán 9.1, negative checks 9.2, inhibit + control 9.3) và mẫu motor 9.5. Đầu ra tất định (golden YAML, `--check`). Mọi ô không bind được phải có lý do trong `*.unbound.yaml`.

**P3.7 (demo + mutation):**
> Theo 12.2–12.3, dựng demo `crusher-sequence` (viết SCL cho logic interlock theo mô tả; equipment; C&E 20 hàng; bindings) và `scripts/mutate-scl.ts`. Chạy mutation; với mỗi mutant sống: phân loại (tương đương / thiếu test / thiếu binding) và ghi vào `docs/mutation-notes.md`. Không hạ ngưỡng nghiệm thu.

**P3.8 (UI):** theo mục 11.2 + e2e Playwright.

Mỗi prompt kết thúc: *"Chạy test/lint/typecheck/bench, báo cáo kết quả, liệt kê mọi giả định tự đặt vào `docs/open-questions.md`, không sửa package khác trừ khi cần (nêu lý do), không hạ tiêu chí nghiệm thu."*

---

## 16. Quyết định mặc định

| Chủ đề | Quyết định |
|---|---|
| Quan sát | Cuối bước `T` (sau scan PLC); hành động của test ở đầu bước |
| `wait until` | Độ trễ 1 bước trước hành động kế tiếp |
| `expect within` | Chặn; `never` chạy nền; `assert` không chặn |
| Isolation | Baseline snapshot (warmup 1000 ms) |
| Cửa sổ phản hồi | 2000 ms (không delay); `delay + 500 ms` (có delay) |
| Negative checks | `scoped` |
| Cell `inhibit` | Luôn kèm test đối chứng dương |
| Stimulus | Tác động điều kiện vật lý, không tác động trực tiếp DI |
| Thiếu binding | `UNBOUND` có lý do (không bỏ qua im lặng, không bịa) |
| Đầu ra sinh | Tất định, không sửa tay, `--check` trong CI |
| Báo cáo | HTML tự chứa, SVG tự vẽ, không phụ thuộc mạng |
| Ngôn ngữ báo cáo | Theo `project.language`, dự phòng `en` |
| Exit code | 0 pass / 1 fail / 2 error / 3 usage |
| Song song | Chưa (thiết kế `SimulationFactory`) |
| Ngẫu nhiên | Chỉ qua seed của plant; logic đánh giá không dùng ngẫu nhiên/thời gian thật |

---

## 17. Việc của chủ sản phẩm (song song để M3 sát thực tế)

1. **Cung cấp C&E matrix thật (ẩn danh)** của 1–2 dự án và **mẫu quy trình FAT/biểu mẫu báo cáo** mà EPC/khách hàng đang dùng (cấu trúc, tiêu đề mục, khung ký). Đây quyết định phần parse ký hiệu và bố cục báo cáo.
2. Cho biết **cách PLC thực tế của anh nhận lệnh start/stop/reset** (nút HMI, bit lệnh, DB nhóm?) để binding mặc định sát thực tế, và quy ước **tag lỗi chốt/alarm**.
3. Chốt **ý nghĩa ký hiệu** trong C&E của công ty (X/T/S/I/A... và cách ghi delay) và quy ước **cực tính E-stop/pull-cord** trong I/O list.
4. Duyệt **tolerance và cửa sổ phản hồi** (500 ms / 2000 ms) và các **delay chuẩn** (5 s, 10 s...) so với thực tế dự án.
5. Xác định **danh sách requirement/FAT step** (mã, tiêu đề) để nạp `requirements.yaml` — phần truy vết trong báo cáo sẽ có giá trị cao hơn nhiều.
6. Rà soát **kết quả mutation**: với mỗi mutant sống, cho ý kiến đó là "lỗi thật chưa được test" hay "mutant tương đương".
7. Quyết định **ngôn ngữ báo cáo** (Việt/Anh/song ngữ) và yêu cầu pháp lý/nội bộ về chữ ký, đánh số phiên bản, lưu trữ.
