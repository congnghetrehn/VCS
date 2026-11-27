# AMENDMENTS — Sổ đối chiếu chéo giữa các spec

## Mục lục

- [A. Điều chỉnh từ M0 §2 (áp dụng khi làm M1, M2, M3)](#a-điều-chỉnh-từ-m0-2-áp-dụng-khi-làm-m1-m2-m3)
- [B. Điều chỉnh từ M4 §2 (áp dụng khi làm M4; một phần có thể làm trước ở **P0.8**)](#b-điều-chỉnh-từ-m4-2-áp-dụng-khi-làm-m4-một-phần-có-thể-làm-trước-ở-p08)
- [C. Điều chỉnh từ M5 §2 (áp dụng khi làm M5; một phần có thể làm trước ở **P0.8**)](#c-điều-chỉnh-từ-m5-2-áp-dụng-khi-làm-m5-một-phần-có-thể-làm-trước-ở-p08)
- [D. Làm rõ bổ sung (không đổi hành vi, tránh AI hiểu sai)](#d-làm-rõ-bổ-sung-không-đổi-hành-vi-tránh-ai-hiểu-sai)
- [E. Điểm hở đã phát hiện — cần quyết định (kèm đề xuất mặc định)](#e-điểm-hở-đã-phát-hiện-cần-quyết-định-kèm-đề-xuất-mặc-định)

> **Quy tắc:** các spec được viết lần lượt (PRD → M1 → M2 → M3 → M0 → M4 → M5), nên spec sau điều chỉnh spec trước. Ở mỗi điểm dưới đây, **sổ này thắng** nội dung cũ. Khi bắt đầu một milestone, AI đọc mục của milestone đó.
> Cột "Khi nào" = prompt/milestone **áp dụng**. Mục **D** là làm rõ bổ sung và **E** là điểm hở cần quyết định (có đề xuất mặc định).

---

## A. Điều chỉnh từ M0 §2 (áp dụng khi làm M1, M2, M3)

| # | Spec cũ | Điều chỉnh | Khi nào |
|---|---|---|---|
| A1 | M1 §10: `ControllerAdapter.step(): Promise<void>` | `step(): void \| Promise<void>`; **`SoftPlc.step` đồng bộ** (trả `void`). `stepOnce()` ném `SIM-E002` nếu gặp Promise | P1.4 |
| A2 | PRD 8.4: `ControllerAdapter` không có snapshot | Thêm **`snapshot()`/`restore()` bắt buộc** (JSON-serializable) | P1.4 |
| A3 | PRD 8.4: `TagValue` có `bigint` | `boolean \| number \| string` | M0 → mọi milestone |
| A4 | PRD/M2: `write(name, v, {source})` | `write(ref: string \| TagHandle, v, source = 'system')` + API theo handle | P0.3 |
| A5 | PRD 8.4: `SimClock.setTimeScale` | Bỏ; tốc độ thuộc `Pacer` (kernel). Thời gian = số nguyên ms | P0.3–P0.4 |
| A6 | M3 §6.1 vá orchestrator | Hooks `beforeExternals/afterStep`, `snapshotAll/restoreAll/resetAll/stepOnce` **đã có sẵn từ M0** | P3.3 không phải vá |
| A7 | M2 §2: `IoBusImpl` thuộc M2 | **M0 cài** (`TagDbIoBus` + `IoPort`); M2 chỉ dùng | P2.4 |
| A8 | M1: `Diagnostic` tự định nghĩa | Chuẩn ở `@vcs/schemas`; `runtime-iec` import + mở rộng (`RuntimeFault` giữ ở runtime-iec) | P1.3 |
| A9 | PRD 8.2: tag có `plantRef` | Dùng **dạng cuối M2 §4.1**: `equipment` + `role` + `provenance` + `origin` | P0.2 |
| A10 | M1 §11: SoftPlc chạy trong Web Worker | **Mô phỏng chạy trong server Node**, UI qua WebSocket; Worker transport là tùy chọn sau | P1.7 |
| A11 | M3 `testing/exec/pace.ts` | `Pacer` ở `@vcs/kernel`; M3 chỉ tái sử dụng | P3.3–P3.4 |
| A12 | M1/M2: tag I/Q và M/DB lẫn lộn | `TagDB` chỉ I/Q; M/DB ở `TagCatalog` + `ControllerIntrospection` | P1.4, P2.4 |
| A13 | M3 §3.2: tự định nghĩa thời lượng | Dùng `parseDuration` của `@vcs/schemas` | P3.2 |
| A14 | M1–M3: lệnh `vcs …` | Khung `apps/cli` (commander); mỗi lệnh một file `commands/*.ts` | mọi milestone |
| A15 | PRD 7.2 | Thêm `@vcs/project`, `@vcs/test-utils` | P0.1–P0.2 |
| A16 | M0 §13: CI ma trận Node 20, 22 (job `test` ubuntu/windows; gate xanh Node 20 và 22) | **CI chỉ chạy Node 22** (bỏ Node 20): `dependency-cruiser@18.7.2` yêu cầu Node `^22\|\|^24\|\|>=26`, `pnpm install` trên Node 20 lỗi `ERR_PNPM_UNSUPPORTED_ENGINE`. Quyết bởi chủ sản phẩm 2026-11-24 (chọn B, không hạ dependency-cruiser) | P0.1 |
| A17 | M0 §12.4: bench orchestrator "rỗng" (5 000 tag, LoopbackController), ngưỡng ≥ 100 000 bước/s — spec không định nghĩa thành phần project bench | **Project bench "rỗng" được định nghĩa: 5 000 tag trong TagDB, 4 controller demo, mỗi controller 2 rule loopback (tổng 8) + 1 counter + 1 blink; các tag còn lại không có rule. `LoopbackController` I/O thưa: chỉ đọc input và ghi output của tag có rule (qua TagDB handle; factory truyền `ctx.tags`); output không có rule giữ nguyên giá trị hiện tại, không bị ghi đè về initial mỗi scan. `TagDB.flush()` chỉ duyệt danh sách dirty (O(số tag đổi), theo M0 §6.4 quy tắc 3). Ngưỡng KHÔNG đổi (≥ 100 000 bước/s).** Quyết bởi chủ sản phẩm 2026-11-24 (chọn (b) định nghĩa lại project "rỗng", rồi (ii) I/O thưa) | P0.4 |
| A18 | M0 §12.4: drift event loop ≤ 50 ms ở `timeScale max` — spec không nói max hay phân vị, trên máy nào; gate chạy cả suite song song trên VM chia sẻ không đo 50 ms được | **Ngưỡng §12.4 KHÔNG đổi (≤ 50 ms). Kiểm chặt 50 ms bằng đo p95 interval 10 ms trên máy yên: p95 6–7 ms, max 6–10 ms (5 lần) — ĐẠT với biên lớn; ghi nhận làm bằng chứng §12.4. Gate tự động (test) assert cap nới lỏng p95 ≤ 150 ms (chỉ bắt vòng lặp kẹt) + stepCount tăng, vì chạy song song trên VM chia sẻ 1,5 CPU cho p95 57–74 ms trong khi baseline IDLE cùng lúc đã 35–48 ms (môi trường đóng góp phần lớn).** Quyết bởi chủ sản phẩm 2026-11-24 (giữ cap 150 ms ở gate, ghi nhận kiểm 50 ms trên máy yên) | P0.5 |
| A19 | M0 §8.3 vs §12.3 #3: §8.3 "ô giá trị cho tag `free` có thể sửa" (ngầm hiểu non-free chỉ đọc) mâu thuẫn §12.3 #3 (thử ghi `LAMP_RUN` bị từ chối qua UI) — ô non-free chỉ đọc thì không có đường UI để thử ghi | **Ô non-free hiển thị giá trị + nút "Ghi thử" nhỏ (title "tag thuộc controller — server sẽ từ chối"); bấm → gửi `tag.write` thật, server trả `TAG-E002` → UI hiện thông báo, giá trị không đổi. e2e E4 kiểm qua nút này.** Quyết bởi chủ sản phẩm 2026-11-24 (chọn (a)) | P0.6 |
| A20 | M0 §13: CI chạy trên mọi push (không lọc nhánh) + `pull_request` + nightly full suite — Free plan 2000 phút/tháng cạn 2026-11-26 (90% mail 02:45, 100% mail 04:50 +07; mỗi commit trên nhánh PR chạy 2 suite ≈ 25 phút) | **Gói A: `push` chỉ `develop`/`main`; `concurrency` cancel-in-progress theo ref; job `test-windows` chỉ chạy khi push lên develop/main, manual dispatch, hoặc PR vào `main` (tên job giữ nguyên để D-001 required checks trên main vẫn đủ); nightly chỉ chạy `bench`; `check`/`test` (ubuntu)/`e2e` bỏ qua khi `schedule`.** Quyết bởi chủ sản phẩm 2026-11-26 06:18 (chọn gói A). Repo chuyển public cùng ngày nên phút Actions không còn giới hạn — gói A vẫn giữ để tiết kiệm phút khi về lại private và giảm nhiễu CI. Merge PR #33 `e06cfaa` 2026-11-26 08:33 +07 (1 file `.github/workflows/ci.yml` +44/−9; CI re-run xanh 3 successful + 2 skipped). | infra/ci-save-minutes (PR #33) |
| A21 | OQ-309 (P2.4, M2 §5.6): làm lại vòng nóng KHÔNG được đổi interface `StepCtx` | **ĐƯỢC đổi sang slot số: `EquipmentModel.step(ctx, slots)` + brand types `RoleSlot`/`ObsSlot`/`FaultSlot`/`SourceSlot`, bảng slot dựng một lần ở init từ định nghĩa model (roles/observables/faults) + key config `sources`.** Quyết bởi chủ sản phẩm 2026-11-26 13:38 +07 (D-008: "Làm A+B, hạ ngưỡng theo số đạt được"). Thiết kế + bất biến hành vi (golden/determinism/demo hash giống hệt) xem STATE §28. | P2.4 commit 6 |
| A22 | M2 §12: engine-alone ≥ 5.000 bước/s (500 thiết bị, bước 10 ms) | **Ngưỡng hạ xuống ≥ 1.500 bước/s (min quan sát sau A+B 1840 −15% = 1564 → làm tròn xuống trăm = 1500). Bằng chứng: implementer commit 9 (bundle, 2026-11-26): plant [1974, 1840, 2035, 1921, 1941] trung vị 1941; parent đo lại độc lập (bản sao sạch, cài thật, 2026-11-26): [2061, 2032, 2131, 2036, 1825] trung vị 2036, min 1825 → cùng cho 1500; TC-1 KHÔNG tái hiện (2036 ≥ 2000).** Ngưỡng vòng kín ≥ 1.000 KHÔNG đổi. Quyết bởi chủ sản phẩm 2026-11-26 15:09 +07 (chọn (a) chấp nhận 1500, làm tiếp commit 10–12). | P2.4 commit 10 |
| A23 | M1 §3.5: instance DB layout `VAR_IN_OUT` (tham chiếu, 4 byte nội bộ không lộ) | **IN_OUT layout theo kích thước tự nhiên của kiểu khai báo, hiện field như field thường (đọc/ghi/init được).** Bằng chứng TIA 2026-11-27 (CPU 1511-1 PN): `DB_Sub.io: Int` @4.0 (2 byte), `s` @6.0. Quyết bởi chủ sản phẩm 2026-11-27 (D-009 chọn A). `resolveDb` + `dbForFb` đồng bộ; bảng P không đổi. | D-009 |

## B. Điều chỉnh từ M4 §2 (áp dụng khi làm M4; một phần có thể làm trước ở **P0.8**)

| # | Điều chỉnh | Khi nào | Pre-apply ở P0.8? |
|---|---|---|---|
| B1 | `ProtocolGateway` (PRD 8.4) định nghĩa ở M4 §5.3; pha `gateways` để trống (gateway không đăng ký `SimComponent`) | P4.6 | — |
| B2 | **`orchestrator.applyInbox()`**: chạy lệnh đang chờ tại `clock.nowMs()` rồi `tags.flush()`; cấm gọi trong bước | P4.1 | **Có** |
| B3 | Kernel export **`validateTagValue(type, v)`** và `TagBroker` | P4.1 | `validateTagValue`: **Có**; broker: không |
| B4 | WS dùng `TagBroker`; `tags.snapshot.defs` gồm **mọi tag catalog (I/Q/M/DB)**; thêm `comms.status`, `comms.log`; `sim.state.locked?` (giữ `PROTOCOL_VERSION = 1`, additive) | P4.1/P4.6 | Chỉ phần schema giao thức: Có |
| B5 | Schema dự án: `files.comms` (mặc định `comms/comms.yaml`), `files.hmi` (mặc định `hmi/`) | P4.1 | **Có** |
| B6 | Tách `packages/testing/src/expr` → **`@vcs/expr`** (resolver tiêm vào); `testing` import lại; **test M3 vẫn xanh** | P4.1 | Nếu muốn: có thể tách ngay ở P3.1 |
| B7 | Đồ thị phụ thuộc: `expr → schemas`; `comms → schemas, kernel`; `hmi → schemas, expr`; `apps/web → schemas, expr, hmi` | P4.1 | Cập nhật `.dependency-cruiser.cjs` từ P0.1 |
| B8 | M1 `ControllerIntrospection` **bắt buộc** cho SoftPlc (+ `readMany` tùy chọn, `listSymbols` P1) | P1.4 | Có (xem D3) |
| B9 | `GET /api/project` thêm `equipment: [{id, model, roles}]` | P2.8/P4.7 | — |
| B10 | Lint tất định: `comms`, `apps/*` được dùng thời gian thật; `hmi`, `expr` **không** | P0.1 (cấu hình) | Có |
| B11 | CLI: `vcs serve --no-comms --hmi-readonly`; `vcs comms export` | P4.6 | — |
| B12 | Chạy có gateway/ghi ngoài **không tất định**; test M3 chạy headless, **không bật gateway** | luôn | — |

## C. Điều chỉnh từ M5 §2 (áp dụng khi làm M5; một phần có thể làm trước ở **P0.8**)

| # | Điều chỉnh | Khi nào | Pre-apply ở P0.8? |
|---|---|---|---|
| C1 | `ControllerAdapter.asyncStep?: boolean`; `orchestrator.requiresAsync()`; `SimulationService` dùng `stepOnceAsync` khi cần | P5.1 | **Có** |
| C2 | Địa chỉ tag cho phép **`sym:<đường dẫn symbolic>`** (DB optimized); `TagAddressMap` hiểu `sym:` | P0.2 (regex) / P1.4 / P5.7 | Regex ở schema: **Có** |
| C3 | `compileProject` nhận `plc/import/**/*.xml` (SimaticML) và `*.scl/*.db/*.udt` do TIA sinh | P5.7–P5.8 | — |
| C4 | M3 runner hỗ trợ orchestrator **async** (`runStepsAsync`); `TS-E040` chỉ cho adapter **không tất định**; `capabilities.snapshot=false` → `isolation: baseline` rơi về `reset` + cảnh báo | P5.2 | Thiết kế runner có `runStepsAsync` từ P3.4: nên |
| C5 | M4 §9 "khóa 1×" thay bằng khai báo `timeScale: {min, max, locked}` theo adapter | P5.2 | — |
| C6 | Adapter ngoài cài `ControllerIntrospection` bằng **cache + `watch(refs)`** | P5.2 | — |
| C7 | `s7Servers` trong `comms.yaml`; `GatewayManager` đăng ký `s7-server` | P5.5 | — |
| C8 | Thêm `tools/` (.NET) ngoài workspace pnpm; CI job Windows riêng | P5.3 | — |
| C9 | Vòng `VERIFY` của M1 §14 đóng bằng harness conformance (M5 §10) | P5.9 | — |

---

## D. Làm rõ bổ sung (không đổi hành vi, tránh AI hiểu sai)

| # | Làm rõ |
|---|---|
| D1 | **`faults.advance(T)`** (M2 §5.1 bước 2) là bước đầu của `PlantEngine.step`; orchestrator **không** có pha `faults` riêng (chỉ `plant/controllers/gateways`). |
| D2 | **`plcScanMs` vs `scanPeriodMs`**: `ControllerConfig.scanPeriodMs = def.config.scanPeriodMs ?? simulation.plcScanMs` (M0 §6.6). Mặc định `plcScanMs = stepMs`. Scan chỉ xảy ra khi tích lũy ≥ chu kỳ; ví dụ timeline của M2/M3 dùng `stepMs = plcScanMs = 10` để mọi mốc không mơ hồ. |
| D3 | **`ControllerIntrospection` của SoftPlc** (read/write/force/unforce/listForces/start/stop) được cài **ngay ở P1.4**, vì M3 (`set` vào M/DB), M4 (`TagBroker`) và UI Watch đều cần. |
| D4 | **`post()` khi tạm dừng:** lệnh chờ tới bước kế; khi mô phỏng `PAUSED/IDLE`, `SimulationService` gọi `applyInbox()` để có hiệu lực ngay (M4 §4.2). |
| D5 | **Chủ sở hữu mặc định của tag:** DO/AO → `controller`; DI/AI → `free` cho tới khi **plant** gán thiết bị (`setOwner(h,'plant')` ở M2). Tag chưa gán thiết bị = virtual input. |
| D6 | **Diagnostic codes:** mọi mã mới (PRJ/SIM/TAG/WS/SCL/IO/PL/TS/CE/COM/HMI/BRG/PSA/S7/TIA/SML) đăng ký ở `DiagnosticCatalog`; `docs/diagnostics.md` sinh tự động. |
| D7 | **Đánh số milestone:** PRD §13 gọi M0–M7; các spec chi tiết hiện có **M0–M5** trùng số với PRD. **PRD M6 (clinker cooler lite) và M7+ (Rockwell/ABB, 3D…) chưa có spec** — không làm trước. |
| D8 | **File sinh tự động / không sửa tay:** `tests/generated/**`, `plc/generated/**`, `docs/diagnostics.md`, `docs/equipment/*.md`, JSON màn hình HMI (chỉ designer/API), `bench/results.json`, `reports/**`. |
| D9 | **M1 §16.5 — mã lỗi cho cấu trúc chưa hỗ trợ (chỉ đổi chữ, không đổi hành vi):** chữ cũ viết `SCL-U001` cho mọi lệnh/từ khóa chưa hỗ trợ; thực tế đã kiểm chứng bằng probe (M1.md §16.5): `SCL-U001` chỉ cho cấu trúc biết tên nhưng chưa hỗ trợ (String), `SCL-T001` cho kiểu chưa biết (POINTER/ANY), `SCL-P002` cho cú pháp ngoài EBNF (mảng nhiều chiều, GOTO) — cả 5 probe đều lỗi ồn ào, có vị trí, exit 2. Quyết D-006 (chủ sản phẩm, 2026-11-27): giữ nguyên 3 mã (A), chỉ sửa câu chữ §16.5 cho đúng thực tế. |

## E. Điểm hở đã phát hiện — cần quyết định (kèm đề xuất mặc định)

| # | Vấn đề | Đề xuất mặc định | Quyết định tại |
|---|---|---|---|
| E1 | **M3 đọc/ghi tag M/DB:** biểu thức, `set`, `faultTag`/`alarmTag` thường là bit trong DB (không nằm trong TagDB). Spec M3 viết như thể mọi tag đều trong TagDB. | `TestHost` định tuyến: I/Q → TagDB; M/DB → `ControllerIntrospection` (đọc **một lần/bước/tag được tham chiếu**, cache theo bước). Resolver `@vcs/expr` phân biệt tag "nhanh" (I/Q) và "chậm" (M/DB). `set` vào M/DB đi qua `controller.write` ở đầu bước. | P3.1 + P3.3 (**⚠ plan-first**) |
| E2 | **M5: cô lập test với PLCSIM chậm** (reset instance vài–chục giây) | Chấp nhận; cảnh báo thời gian; khuyến nghị suite nhỏ hơn/`isolation: none` có dọn trạng thái | P5.2 |
| E3 | **M4: hiệu năng pull-sampling của node-opcua** (2 000 monitored item) | Chạy bench trước; không đạt → push cho I/Q (M4 §7.4) + ADR | P4.4 |
| E4 | **M5: độ chính xác import logic vs PLCSIM** | Importer `logic` chỉ để chạy Chế độ A; chuẩn vàng là PLCSIM; báo cáo "convertibility" rõ | P5.8 |
| E5 | **`TagValue` Real = double nhưng PLC dùng float32** | `Math.fround` ở **ranh giới** (SoftPlc ghi Q, plant adapter ghi AI, S7/OPC UA encode); test property cho round-trip | P1.4, P2.1 |
| E6 | **UI Worker vs server** (M1 §11) | Server là mặc định (A10); Worker chỉ nếu chủ sản phẩm yêu cầu (M0 §17 mục 4) | P0.6/P1.7 |
| E7 | **Thư mục mẫu `examples/`**: `hello-tags` (M0), `motor-interlock` (M1), `crusher-sequence` (M3) | Giữ cùng tên; mỗi milestone chỉ **thêm**, không đổi hành vi ví dụ cũ (test hồi quy dùng chúng) | mọi milestone |
| E8 | **Dữ liệu thật để tinh chỉnh** (I/O list, C&E, SimaticML, SCADA node id) | AI làm bằng fixture tổng hợp trước; **chủ sản phẩm đưa dữ liệu thật ẩn danh** → chạy lại + chỉnh `naming.yaml`/bindings/synonym | trước P2.7, P3.5, P4.4, P5.7 |
