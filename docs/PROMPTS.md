# PROMPTS — Thứ tự prompt và sổ tay làm việc với AI

> **Chế độ vận hành mặc định là TỰ CHỦ (`docs/AUTONOMY.md`):** AI tự đi hết danh sách này theo thứ tự, tự rà soát, ghi `STATE.md`/`OWNER-INBOX.md`, chỉ dừng ở các mục Tầng C. Vì vậy: (a) "⚠ plan-first" nghĩa là *ghi kế hoạch + tính tay rồi đi tiếp*, không chờ xác nhận; (b) nguyên tắc 2 ở mục 1 ("gate do chính anh chạy lại") áp dụng ở **cổng milestone** (G0…G5), không áp dụng từng prompt. Các prompt dưới đây cũng dùng được thủ công khi anh muốn điều khiển từng bước.

> Cách dùng: mỗi lần mở **một phiên mới**, dán **một** prompt (mục 6). Quy trình chi tiết đã nằm trong `AGENTS.md §9` nên prompt chỉ cần nêu nhiệm vụ, tài liệu cần đọc và gate. Các prompt gốc ở mục "Prompt mẫu" của từng spec được chuẩn hóa lại ở đây (thêm điều kiện trước, gate, plan-first).
> Ký hiệu: **⚠ plan-first** = AI phải đưa kế hoạch + liệt kê mơ hồ và **chờ anh xác nhận** trước khi code (phần có ngữ nghĩa dễ sai). **🔑 cần dữ liệu** = anh phải đưa dữ liệu/ môi trường trước khi chạy prompt.

---

## 1. Nguyên tắc vận hành
1. **Một prompt = một phiên = một nhánh = một PR.** Không gộp nhiều prompt; không nhảy cóc.
2. **Gate trước khi tiếp:** prompt kế tiếp chỉ bắt đầu khi gate của prompt trước **xanh do chính anh chạy lại** và `docs/STATE.md` đã cập nhật.
3. **Ngữ cảnh gọn:** mỗi phiên chỉ nạp `AGENTS.md`, `STATE.md`, mục `AMENDMENTS` liên quan và **các mục spec được chỉ định** — không dán cả bộ tài liệu.
4. **Ngữ nghĩa trước, code sau:** với prompt ⚠, yêu cầu AI **tự tính tay bảng timeline/ví dụ** rồi mới code (giúp phát hiện hiểu sai sớm).
5. **Không tin "xanh" từ báo cáo của AI:** tự chạy `pnpm lint typecheck depcheck test review:cheats` và các demo trong `REVIEW-CHECKLISTS.md`.
6. **Một gate hỏng 3 lần → dừng**, dùng prompt H2 (thu hẹp/ thiết kế lại).
7. **Kết thúc milestone** bằng prompt `G{n}` (gói bằng chứng nghiệm thu) rồi anh ký duyệt trong `STATE.md`.

## 2. Khung chuẩn (đã nằm trong mọi prompt ở mục 6)
**Mở đầu:** `Làm P{ID} theo quy trình AGENTS.md §9 và chính sách docs/AUTONOMY.md. Đọc: AGENTS.md → docs/agent/SOUL.md → docs/STATE.md → docs/OWNER-INBOX.md → docs/AMENDMENTS.md (mục {X}) → docs/specs/{spec} {mục}. Nạp skill: {skill} (docs/skills/README.md).`
**Kết thúc:** `Gate: {gate}. Báo cáo cuối đúng mẫu AGENTS.md §9 mục 7; dán kết quả lệnh thật; cập nhật STATE.md và open-questions.md.`

## 3. Prompt phụ trợ (dán khi cần)

**H1 — Xác nhận kế hoạch (cho prompt ⚠)**
```
Kế hoạch ổn. Quyết định cho các mơ hồ: <1…n>. Nếu còn mơ hồ ảnh hưởng ngữ nghĩa mà tôi chưa trả lời, hãy dùng mặc định của spec và ghi vào open-questions.md. Bắt đầu code. Trước khi code phần ngữ nghĩa thời gian, hãy dán bảng timeline tính tay.
```
**H2 — Gate hỏng 3 lần / AI vòng vo**
```
Dừng. Không sửa thêm. Hãy: (1) liệt kê chính xác test/lệnh đang hỏng và thông báo lỗi nguyên văn; (2) nêu 2–3 giả thuyết nguyên nhân gốc và bằng chứng cho từng cái; (3) đề xuất cách thu hẹp phạm vi hoặc thiết kế lại; (4) KHÔNG sửa test/golden/ngưỡng để qua gate. Chờ tôi chọn.
```
**H3 — Bàn giao khi hết ngữ cảnh**
```
Cập nhật docs/STATE.md để một phiên mới tiếp tục được: việc đã xong (kèm commit), việc đang dở (file + hàm), quyết định/giả định, test đang hỏng (nguyên văn), lệnh chạy nhanh để tái hiện, và bước tiếp theo cụ thể. Commit WIP trên nhánh. Không thêm tính năng mới.
```
**H4 — Review độc lập (dùng AI thứ hai, phiên mới, không thấy lịch sử)**
```
Bạn là reviewer độc lập. Đọc AGENTS.md, docs/AMENDMENTS.md, spec {spec} các mục {mục}, và diff của nhánh {nhánh} so với main. Dùng docs/REVIEW-CHECKLISTS.md (mục chung + mục M{n}). KHÔNG sửa code. Trả về: (a) vi phạm bất biến/ spec (kèm file:dòng và điều khoản), (b) test yếu/ gian lận (kỳ vọng bị đổi, assert tầm thường, mock che hành vi), (c) khoảng trống so với spec, (d) rủi ro, (e) kết luận MERGE / SỬA / TỪ CHỐI. Chỉ nêu điều bạn kiểm chứng được từ mã/diff.
```
**H5 — Tính tay timeline trước khi code**
```
Trước khi viết code: tự tính tay bảng thời gian cho {tình huống} theo luật {mục spec} (step order, độ trễ plant→PLC, process image...). Dán bảng (T, tác động, trạng thái từng tag/ thành phần). Nếu kết quả khác bảng trong spec, DỪNG và nêu lập luận — không sửa kỳ vọng im lặng.
```
**H6 — Khi AI đổi kỳ vọng/golden**
```
Bạn đã sửa kỳ vọng/golden trong {file}. Với từng thay đổi: nguồn sự thật nào chứng minh giá trị cũ sai (điều khoản spec/ tài liệu/ phép tính tay)? Nếu không có, hoàn tác thay đổi và sửa code. Liệt kê lại diff của các file *.golden.yaml / expected.
```
**H7 — Thu hẹp phạm vi**
```
Thu hẹp prompt này xuống phần tối thiểu vẫn đạt gate: {phần giữ lại}. Phần còn lại chuyển thành mục "chưa làm" trong STATE.md với lý do và ước lượng. Không để stub im lặng — mọi phần chưa làm phải báo lỗi tường minh khi dùng.
```
**H8 — Chứng minh gate**
```
Chạy lại toàn bộ gate trên sạch (xóa cache build, pnpm install --frozen-lockfile) và dán nguyên văn kết quả: lint, typecheck, depcheck, test (kèm số test), review:cheats, và các lệnh demo của prompt. Nêu số test mới thêm và các mã chẩn đoán mới.
```
**H9 — Hỏi lại dữ liệu thật**
```
Bạn đang cần dữ liệu/ tài liệu thật để tiếp tục. Liệt kê chính xác: file/ thông tin nào, ở dạng nào, dùng cho mục nào của spec, và phương án tạm bằng dữ liệu tổng hợp (nêu rõ giới hạn). Không bịa cấu trúc.
```

## 4. Cổng milestone và dữ liệu cần có trước

| Milestone | Trước khi bắt đầu (chủ sản phẩm) | Gói nghiệm thu |
|---|---|---|
| **M0** | Chọn nơi lưu repo + bật CI; xác nhận OS phát triển (Windows/Linux); tên sản phẩm/giấy phép; chính sách IP/bảo mật; quyết định Worker vs server (mặc định: server) | G0 |
| **M1** | Duyệt quyết định mặc định (M1 §17: strict typing, INT wrap, lỗi runtime tiếp tục…); (tùy chọn) vài đoạn SCL thật để kiểm cú pháp | G1 |
| **M2** | **I/O list thật ẩn danh + quy ước đặt tên tag** (trước P2.7); số liệu motor/biến tần/van thực tế; dải raw analog của module AI | G2 |
| **M3** | **C&E thật ẩn danh + biểu mẫu FAT** (trước P3.4–P3.5); cách PLC nhận start/stop/reset; tolerance; danh sách requirement; ngôn ngữ báo cáo | G3 |
| **M4** | SCADA đích + danh sách node id/tag SCADA (trước P4.4); chính sách bảo mật OPC UA; bộ symbol/tiêu chuẩn HMI; port/firewall | G4 |
| **M5** | **Windows có TIA + PLCSIM Advanced + giấy phép + nhóm quyền** (trước P5.4/P5.6); ≥ 10 file SimaticML thật (trước P5.7); dự án `VCS_Conformance` (trước P5.9); chốt topology A/B1/B2 | G5 |

## 5. Danh sách prompt theo thứ tự

| # | ID | Nội dung | Spec | ⚠ | 🔑 |
|---|---|---|---|---|---|
| 1 | P0.1 | Repo + công cụ + CI + lint tất định + dependency-cruiser + AGENTS.md | M0 §1–3, 11–13 | | |
| 2 | P0.2 | `schemas` + `project` | M0 §4–5 | | |
| 3 | P0.3 | `kernel` dữ liệu (clock, TagDB, IoBus, TraceHasher) + `test-utils` | M0 §6.1–6.5, 6.9, 7 | ⚠ | |
| 4 | P0.4 | Orchestrator + builder + demo controller + CLI | M0 §6.6–6.8, 6.10, 8.1 | ⚠ | |
| 5 | P0.5 | Server (REST/WS/SimulationService/Pacer) | M0 §8.2, 9 | | |
| 6 | P0.6 | Web (khung, Sim bar, bảng Tags) + e2e | M0 §8.3, 12.3 | | |
| 7 | P0.7 | Tài liệu, ADR, hardening, kiểm Windows | M0 §11–13 | | |
| 8 | P0.8 | *(khuyến nghị)* Áp trước các điều chỉnh giao diện của M4/M5 | AMENDMENTS B, C | | |
| 8b | P0.9 | *(tùy chọn)* PWA shell + quyết định HTTPS cho LAN (ngoài spec; theo skill UI §9) | skills/SKILL-ui-pwa-hmi §9 | | |
| 9 | **G0** | Gói nghiệm thu M0 | M0 §15 | | |
| 10 | P1.1 | Bộ nhớ, kiểu, layout, địa chỉ | M1 §2–3 | | |
| 11 | P1.2 | Lexer + parser SCL | M1 §4.1–4.3 | | |
| 12 | P1.3 | Type check + lower + IR + `vcs ir dump` | M1 §4.4, 6 | ⚠ | |
| 13 | P1.4 | Interpreter + scheduler + SoftPlc + introspection + snapshot | M1 §7–8, 10 | ⚠ | |
| 14 | P1.5 | System block (edge, bistable, timer, counter) | M1 §9 | ⚠ | |
| 15 | P1.6 | LAD (schema + lower) | M1 §5 | | |
| 16 | P1.7 | Golden runner + demo `motor-interlock` + UI Watch | M1 §11–13 | | |
| 17 | **G1** | Gói nghiệm thu M1 | M1 §16 | | |
| 18 | P2.1 | Nền plant (schemas, rng, adapter, source, FaultManager, engine) | M2 §3–6 | ⚠ | |
| 19 | P2.2 | `motor_dol` | M2 §7.1, 11.1 | ⚠ | |
| 20 | P2.3 | Các model còn lại | M2 §7.2–7.8 | | |
| 21 | P2.4 | Orchestrator vòng kín + demo A–D + CLI `plant run` | M2 §5.1, 11.4 | ⚠ | |
| 22 | P2.5 | Đọc CSV/XLSX + mapping + fixture generator | M2 §8.1–8.4, 11.3 | | |
| 23 | P2.6 | Địa chỉ + validate + diff/commit | M2 §8.5–8.8 | | |
| 24 | P2.7 | Auto-suggest thiết bị | M2 §9 | ⚠ | 🔑 |
| 25 | P2.8 | UI import wizard + Tag Manager + Plant Designer + inspector | M2 §10 | | |
| 26 | **G2** | Gói nghiệm thu M2 | M2 §14 | | |
| 27 | P3.1 | `expr` | M3 §5 | ⚠ | |
| 28 | P3.2 | DSL + macro | M3 §3 | | |
| 29 | P3.3 | Executor + monitors + isolation | M3 §4, 6 | ⚠ | |
| 30 | P3.4 | Runner + kết quả + báo cáo HTML/JSON/JUnit | M3 §3.4, 10 | | 🔑 |
| 31 | P3.5 | Import C&E | M3 §7 | | 🔑 |
| 32 | P3.6 | Bindings + sinh test + mẫu motor | M3 §8–9 | ⚠ | |
| 33 | P3.7 | Demo `crusher-sequence` + mutation | M3 §12.2–12.3 | ⚠ | |
| 34 | P3.8 | UI Test Center / C&E / Bindings | M3 §11 | | |
| 35 | **G3** | Gói nghiệm thu M3 | M3 §12.4 | | |
| 36 | P4.1 | Vá nền (applyInbox…), tách `@vcs/expr`, `TagBroker` | M4 §2, 4 | ⚠ | |
| 37 | P4.2 | Modbus codec + server + CSV | M4 §6.1–6.4 | | |
| 38 | P4.3 | Khung adapter ngoài + Modbus adapter | M4 §9, 6.5–6.6 | ⚠ | |
| 39 | P4.4 | OPC UA server (+ bench) | M4 §7 | ⚠ | 🔑 |
| 40 | P4.5 | OPC UA client adapter + PLC giả | M4 §8 | | |
| 41 | P4.6 | GatewayManager + REST/WS + trang Communications | M4 §5.3–5.4, 10 | | |
| 42 | P4.7 | HMI nền (schema, symbol, sanitizer, binding) | M4 §11.1–11.5, 11.8 | | 🔑 |
| 43 | P4.8 | HMI runtime + designer + REST | M4 §11.4, 11.6–11.9 | | |
| 44 | P4.9 | Tài liệu SCADA + ví dụ + bench + integration | M4 §13, App. C | | |
| 45 | **G4** | Gói nghiệm thu M4 | M4 §17 | | |
| 46 | P5.1 | Vá nền (asyncStep, `sym:`, runner async) + VBP/1 + agent giả TS | M5 §2, 5.3, App. A | ⚠ | |
| 47 | P5.2 | `PlcsimAdapter` (realtime/scaled/lockstep) | M5 §6 | ⚠ | |
| 48 | P5.3 | Bridge Agent .NET (Core + Fake) | M5 §5 | | |
| 49 | P5.4 | Backend PlcSim (V8→V7/V6) + live | M5 §5.5 | | 🔑 |
| 50 | P5.5 | S7 codec + client + server + probe | M5 §7, App. B | ⚠ | |
| 51 | P5.6 | `vcs-tia-export` | M5 §8 | | 🔑 |
| 52 | P5.7 | Importer `symbols` | M5 §9.1–9.4, 9.7–9.8 | | 🔑 |
| 53 | P5.8 | Importer `logic` (SCL, FlgNet→IR) | M5 §9.5–9.6, 9.9 | ⚠ | 🔑 |
| 54 | P5.9 | Conformance + UI + tài liệu | M5 §10–11 | | 🔑 |
| 55 | **G5** | Gói nghiệm thu M5 (tầng T1/T2 tự động; T3 thủ công) | M5 §17 | | |

---

## 6. Nội dung từng prompt

### M0 — Skeleton

**P0.1**
```
Làm P0.1 theo AGENTS.md §9. Đọc: AGENTS.md → docs/STATE.md → docs/AMENDMENTS.md (A, B7, B10) → docs/specs/M0 §1–3, 11–13.
Nhiệm vụ: tạo monorepo pnpm + Turborepo: package JIT (exports → src/index.ts), TypeScript strict, ESLint flat + Prettier, Vitest workspace, .gitattributes/.editorconfig/.npmrc/.nvmrc, dependency-cruiser theo bảng M0 §3.5 (đã cập nhật ở AMENDMENTS B7), lint cấm Date.now/performance.now/Math.random/new Date() theo M0 §3.6 (+B10) kèm TEST cho luật lint, copy AGENTS.md + docs kit vào đúng chỗ, script review:cheats, CI ubuntu + windows.
Không làm: logic nghiệp vụ; không dùng cú pháp shell riêng.
Gate: CI xanh trên ubuntu + windows; test lint (file vi phạm phải bị chặn); test depcheck (import sai phải fail).
```
**P0.2**
```
Làm P0.2 theo AGENTS.md §9. Đọc: AGENTS.md → STATE.md → AMENDMENTS (A3, A8, A9, A13, C2) → M0 §4–5, §12.1 (nhóm schemas/project).
Nhiệm vụ: @vcs/schemas (common, Diagnostic + DiagnosticCatalog, duration, yaml.ts có DÒNG/CỘT, schema project/tags dạng cuối, migrate, protocol) và @vcs/project (ProjectFS, memoryFS, nodeFS, loadProject, hashText). Cho phép address dạng sym:<...> (C2).
Test theo M0 §12.1; hash văn bản phải giống nhau trên Windows/Linux.
Gate: lint/typecheck/depcheck/test xanh; ≥ 10 lỗi mẫu cho vị trí dòng/cột chính xác.
```
**P0.3 ⚠**
```
Làm P0.3 theo AGENTS.md §9 (plan-first). Đọc: AGENTS.md → STATE.md → AMENDMENTS (A3–A5, A12) → M0 §6.1–6.5, 6.9, 7, 12.
Nhiệm vụ: ManualClock, TagDB (handle, validate, ownership, flush theo lô, snapshot/restore/reset), TagCatalog, TagDbIoBus + IoPort, TraceHasher, @vcs/test-utils. Property test (fast-check) + bench TagDB.
Trước khi code: nêu hiểu biết về flush (dirty theo thứ tự handle, chỉ phát khi khác lần flush trước) và ownership bằng ví dụ số.
Gate: ≥ 60 test; bench: TagDB.set/get ≥ 10 triệu/giây, không cấp phát; flush 5000 tag/0 thay đổi ≤ 50µs.
```
**P0.4 ⚠**
```
Làm P0.4 theo AGENTS.md §9 (plan-first). Đọc: AGENTS.md → STATE.md → AMENDMENTS (A1, A2, A6, D1, D4) → M0 §6.6–6.8, 6.10, 8.1, 12.2.
Nhiệm vụ: SimComponent/ControllerAdapter, SimulationOrchestrator đúng thuật toán M0 §6.7 (phases, hooks, inbox, throw/isolate, đường async riêng, snapshot/restore/reset), builder + extension, LoopbackController, Pacer, apps/cli (validate/run/version).
TRƯỚC KHI CODE: tự tính tay ≥ 5 bảng thời gian (thứ tự hook/pha/flush; độ trễ plant→PLC 1 bước) làm golden test.
Gate: vcs run examples/hello-tags --until 5s --hash cho cùng hash lần/ OS; snapshot→restore tái lập hash; component async trong stepOnce() → SIM-E002.
```
**P0.5**
```
Làm P0.5 theo AGENTS.md §9. Đọc: … → M0 §8.2, 9, 12.1 (nhóm server/protocol).
Nhiệm vụ: apps/server: REST tối thiểu, WebSocket theo schema zod chung, SimulationService (lệnh xếp hàng giữa các lát, Pacer nhận now() từ server), gom tags.delta theo nhịp 10 Hz, kiểm Origin/kích thước/số kết nối, bind 127.0.0.1. Test bằng client ws thật.
Gate: ≥ 15 test server; tag.write vào tag không-free bị từ chối; timeScale max không làm event loop trễ > 50 ms.
```
**P0.6**
```
Làm P0.6 theo AGENTS.md §9. Đọc: … → M0 §8.3, 12.3.
Nhiệm vụ: apps/web: khung, Sim bar (Run/Pause/Step/Reset/tốc độ), bảng Tags ảo hóa (cập nhật gom theo rAF, sửa giá trị tag free), diagnostics panel, i18n vi/en, tự kết nối lại. Chỉ import @vcs/schemas. Playwright e2e theo M0 §12.3.
Gate: e2e xanh; ≥ 10 test store.
```
**P0.7**
```
Làm P0.7 theo AGENTS.md §9. Đọc: … → M0 §11, 13, 15.
Nhiệm vụ: docs/architecture.md, semantics.md (phần M0), 6 ADR, diagnostics.md sinh tự động, README repo; chạy toàn bộ CI local, kiểm Windows, chạy bench và ghi bench/results.json.
Gate: toàn bộ tiêu chí M0 §15 (mục 1–12) tự kiểm được; liệt kê mục chưa đạt.
```
**P0.8 (khuyến nghị)**
```
Làm P0.8 theo AGENTS.md §9. Đọc: AGENTS.md → STATE.md → docs/AMENDMENTS.md (B2, B3, B4-schema, B5, C1, C2).
Nhiệm vụ: áp TRƯỚC các điều chỉnh giao diện rẻ: orchestrator.applyInbox(); export validateTagValue(); schema project: files.comms/files.hmi; schema giao thức: thông điệp comms.status/comms.log + sim.state.locked? (additive, PROTOCOL_VERSION giữ 1); ControllerAdapter.asyncStep? + orchestrator.requiresAsync(); address cho phép sym:. Mỗi thứ có test; KHÔNG thêm chức năng ngoài danh sách.
Gate: toàn bộ test M0 vẫn xanh + test mới; không đổi hành vi hiện có.
```
**P0.9 (tùy chọn — chỉ khi chủ sản phẩm chọn trong OWNER-INBOX)**
```
Làm P0.9 theo AGENTS.md §9. Đọc: … → docs/skills/SKILL-ui-pwa-hmi.md §9 (PWA) + M0 §8.2–8.3.
Nhiệm vụ: PWA tối thiểu cho apps/web: manifest, service worker (precache tài nguyên tĩnh; KHÔNG cache /api và WebSocket), trang offline, thông báo bản cập nhật, chế độ kiosk (?kiosk=1, Fullscreen, Wake Lock có kiểm tính khả dụng). Ghi ADR về HTTPS cho truy cập LAN (service worker chỉ chạy trên HTTPS/localhost) — đề xuất phương án (mkcert/ reverse proxy) vào OWNER-INBOX mục D, KHÔNG tự đổi bind mặc định.
Gate: Playwright: manifest hợp lệ, service worker đăng ký trên localhost, offline fallback hiện khi server tắt, /api không bị cache.
```

**G0** — xem mục 7.

### M1 — Soft-PLC

**P1.1**
```
Làm P1.1 theo AGENTS.md §9. Đọc: … → AMENDMENTS (A) → M1 §2–3.
Nhiệm vụ: runtime-iec: types.ts, memory.ts (big-endian, DataView), layout.ts (DB/struct); vendor-siemens: address.ts. Test chồng lấn %MW/%MB/bit, layout struct theo M1 §3.4.
Không làm: parser/interpreter.
Gate: test bộ nhớ/địa chỉ/layout xanh; property test ghi-đọc nhiều độ rộng so với mô hình tham chiếu byte-array.
```
**P1.2**
```
Làm P1.2 theo AGENTS.md §9. Đọc: … → M1 §4.1–4.3, 12.2 (nhóm lexer/parser).
Nhiệm vụ: lexer + parser SCL (Chevrotain) theo EBNF M1 §4.2, bảng ưu tiên 4.3, phục hồi lỗi mức statement. AST có type + vị trí.
Gate: ≥ 15 test lexer, ≥ 40 parse hợp lệ, ≥ 12 test lỗi (line/col chính xác). Không type check ở bước này.
```
**P1.3 ⚠**
```
Làm P1.3 theo AGENTS.md §9 (plan-first). Đọc: … → AMENDMENTS (A8) → M1 §4.4, 6.
Nhiệm vụ: typecheck.ts (widening ngầm định; thu hẹp phải tường minh), lower.ts (AST → IR cây có kiểu, serializable JSON), CLI vcs ir dump. Diagnostic dùng bản chuẩn ở @vcs/schemas.
Gate: ≥ 20 test kiểu; IR dump JSON ổn định (golden).
```
**P1.4 ⚠**
```
Làm P1.4 theo AGENTS.md §9 (plan-first). Đọc: … → AMENDMENTS (A1, A2, A12, D2, D3, E5) → M1 §7–8, 10, 12.
Nhiệm vụ: interpreter (IR → closures), quy tắc số học bảng M1 §7.2 (mỗi quy tắc có dòng semantics.md + test), scheduler (OB1/OB100/cyclic OB), SoftPlc implements ControllerAdapter (step ĐỒNG BỘ, snapshot/restore) + ControllerIntrospection (read/write/force/unforce/listForces/start/stop), force, TagAddressMap.
TRƯỚC KHI CODE: tự tính tay ≥ 6 scan (process image latch input đầu scan/ghi output cuối scan; OB100 một lần; cyclic OB).
Gate: golden xanh; snapshot→restore→chạy lại cho trace giống hệt; lint chặn Date.now trong runtime-iec.
```
**P1.5 ⚠**
```
Làm P1.5 theo AGENTS.md §9 (plan-first). Đọc: … → M1 §9, 12.2.
Nhiệm vụ: std blocks: R_TRIG/F_TRIG, SR/RS, TON/TOF/TP/TONR, CTU/CTD/CTUD theo sim time của scan.
TRƯỚC KHI CODE: tự tính tay bảng timeline cho mỗi loại timer (gồm PT=0, IN dao động, timer không được gọi vài scan) và counter (R/LD ưu tiên, biên). Dùng làm golden.
Gate: ≥ 14 golden timer, ≥ 10 golden counter, property test timer (TON ⇔ IN liên tục ≥ PT).
```
**P1.6**
```
Làm P1.6 theo AGENTS.md §9. Đọc: … → M1 §5.
Nhiệm vụ: LAD: schema zod + validate + lower LAD → IR (dùng chung interpreter, không interpreter riêng). RLO/EN/ENO theo 5.2.
Gate: ≥ 8 golden LAD.
```
**P1.7**
```
Làm P1.7 theo AGENTS.md §9. Đọc: … → AMENDMENTS (A10, E6) → M1 §11–13, 14.
Nhiệm vụ: golden runner (format 12.1, expectedFrom), demo examples/motor-interlock (4 kịch bản M1 §13), editor SCL tối thiểu + Watch table (qua server WS — KHÔNG Worker), benchmark M1 §12.4, docs/semantics.md (VERIFIED/UNVERIFIED), danh sách VERIFY (M1 §14) thành docs/verify-experiments-draft.md.
Gate: 4 kịch bản đúng qua CLI và UI; bench ≥ 1000 scan/s (200 FB_Motor); mọi mục M1 §16.
```

### M2 — Plant + I/O import

**P2.1 ⚠**
```
Làm P2.1 theo AGENTS.md §9 (plan-first). Đọc: … → AMENDMENTS (A4, A9, A12, D1, D5, E5) → M2 §3–6.
Nhiệm vụ: schemas (equipment/naming/profile/fault), rng (mulberry32), delay, lag/rate-limit, adapter scaling (M2 §3.2), source (manual/const/ramp/sine/link + topo), FaultManager, PlantEngine (step tất định), EventLog. Cấm Math.random/Date.now (lint). Chỉ dùng model giả để test engine.
Gate: test scaling (≥ 12), signal fault (≥ 12), determinism (hash trace giống hệt kể cả restore giữa chừng).
```
**P2.2 ⚠**
```
Làm P2.2 theo AGENTS.md §9 (plan-first). Đọc: … → M2 §7.1, 11.1.
Nhiệm vụ: motor_dol đúng máy trạng thái M2 §7.1 + docgen sinh docs/equipment/motor_dol.md.
TRƯỚC KHI CODE: tự tính tay bảng timeline M2 §11.1 (startDelayMs 500, stopDelayMs 800, stepMs 10) và thêm ≥ 6 timeline cho fault (overload, failToStart, contactorStuck, notReady, localMode).
Gate: ≥ 14 golden motor_dol; mỗi fault/preset có test.
```
**P2.3**
```
Làm P2.3 theo AGENTS.md §9. Đọc: … → M2 §7.2–7.8, 11.1.
Nhiệm vụ: motor_vfd, valve_onoff, valve_ctrl + damper (deriveModel), analog_sensor, switch_di, silo_bin, conveyor_simple. Mỗi model 1 commit; golden timeline + test fault; docgen.
Gate: số golden theo M2 §11.1; docs/equipment/*.md sinh tự động và CI --check khớp.
```
**P2.4 ⚠**
```
Làm P2.4 theo AGENTS.md §9 (plan-first). Đọc: … → AMENDMENTS (A6, A7, D1) → M2 §5.1, 11.4.
Nhiệm vụ: plantExtension (đăng ký PlantEngine pha 'plant', setOwner), vòng kín với SoftPlc: demo A–D (M2 §11.4) + CLI vcs plant run.
TRƯỚC KHI CODE: tự tính tay kịch bản A–D; mọi sai khác với bảng spec → DỪNG, ghi open-questions, hỏi.
Gate: 4 kịch bản qua CLI và UI cho cùng kết quả; hash tất định; bench vòng kín ≥ 1000 bước/giây.
```
**P2.5**
```
Làm P2.5 theo AGENTS.md §9. Đọc: … → M2 §8.1–8.4, 11.3.
Nhiệm vụ: VIẾT TRƯỚC scripts/gen-io-fixture.ts (300 tín hiệu cố ý làm bẩn + expected.yaml), rồi đọc CSV/XLSX (exceljs), sniff, dò header, gợi ý mapping vi/en/de, transform, profile.
Gate: đọc đúng fixture XLSX và CSV (; + Windows-1252); test theo M2 §11.3.
```
**P2.6**
```
Làm P2.6 theo AGENTS.md §9. Đọc: … → M2 §8.5–8.8.
Nhiệm vụ: chuẩn hóa địa chỉ (≥ 40 test, E/A tiếng Đức), validate bitmap chồng lấn, toàn bộ mã IO-*, diff/commit idempotent, báo cáo HTML/JSON.
Gate: 100% lỗi cố ý bị phát hiện, 0 báo nhầm dòng sạch; re-import idempotent.
```
**P2.7 ⚠ 🔑**
```
Làm P2.7 theo AGENTS.md §9 (plan-first). Đọc: … → M2 §9, 11.3, 16.
Nhiệm vụ: auto-suggest đúng 6 bước (heuristic có reasons[]; role/synonym lấy từ plant/registry; KHÔNG ML/LLM). Chạy trên fixture 300 tín hiệu và (nếu có) I/O list thật ẩn danh; in bảng precision theo role/model.
Gate: ≥ 90% (equipment, role) đúng, ≥ 95% model đúng trên fixture; báo cáo kết quả trên dữ liệu thật + danh sách sai.
```
**P2.8**
```
Làm P2.8 theo AGENTS.md §9. Đọc: … → AMENDMENTS (B9) → M2 §10.
Nhiệm vụ: Import wizard 5 bước, I/O & Tag Manager (≥ 20 000 dòng), Plant Designer (Suggestions/Equipment/Unassigned), Equipment inspector + fault panel + event log; GET /api/project thêm equipment. Playwright e2e: import → duyệt gợi ý → chạy → bật fault → PLC báo lỗi.
Gate: e2e xanh; mọi mục M2 §14.
```

### M3 — Test automation

**P3.1 ⚠**
```
Làm P3.1 theo AGENTS.md §9 (plan-first). Đọc: … → AMENDMENTS (B6, D3, E1) → M3 §5.
Nhiệm vụ: lexer/parser/compile biểu thức (EBNF 5.1; $EQ.role, @EQ.obs, prev/rose/fell/changed/since/eng); resolver TIÊM VÀO để sau này tách @vcs/expr; tag M/DB theo đề xuất E1 (đọc một lần/bước/tag qua introspection). Lỗi có vị trí + gợi ý gần nhất.
Gate: ≥ 50 test + property parse(print(x)) = x.
```
**P3.2**
```
Làm P3.2 theo AGENTS.md §9. Đọc: … → AMENDMENTS (A13) → M3 §3.
Nhiệm vụ: schema zod hai dạng tệp, loader (expand macro lúc load, không đệ quy), thư viện std/macros.yaml, JSON Schema xuất cho Monaco. Dùng parseDuration của @vcs/schemas.
Gate: test mã TS-E003/E004/E020/E021/E030; ≥ 25 + 10 test.
```
**P3.3 ⚠**
```
Làm P3.3 theo AGENTS.md §9 (plan-first). Đọc: … → AMENDMENTS (A6, A11, C4, E1) → M3 §4, 6.
Nhiệm vụ: TestHost, TraceStore, TestExecutor (máy trạng thái 6.3), monitors within/never/stableFor/ordered/notBefore, isolation baseline/reset/none, checkpoint/restore. Hooks đã có sẵn ở M0 (không vá).
TRƯỚC KHI CODE: tự tính tay ≥ 10 bảng thời gian (mỗi loại kỳ vọng); bảng M3 §6.5 phải tái tạo CHÍNH XÁC.
Gate: ≥ 30 test executor + ≥ 10 isolation; mọi bảng tính tay khớp.
```
**P3.4 🔑**
```
Làm P3.4 theo AGENTS.md §9. Đọc: … → AMENDMENTS (C4) → M3 §3.4, 10.
Nhiệm vụ: TestRunner (isolation, teardown luôn chạy; thiết kế runStepsAsync sẵn), RunResult + hash, CLI vcs test, báo cáo HTML tự chứa (SVG vẽ bằng code, in A4, bất biến byte), results.json + JSON Schema, junit.xml. Nếu có biểu mẫu FAT thật: bám bố cục đó.
Gate: HTML bất biến byte với cùng results.json; JUnit hợp lệ XSD; exit code đúng.
```
**P3.5 🔑**
```
Làm P3.5 theo AGENTS.md §9. Đọc: … → M3 §7.
Nhiệm vụ: đọc C&E (reader của M2), ce-profile.yaml, ký hiệu/delay, header đa hàng, điều kiện, mã CE-*, diff/commit idempotent. Viết scripts/gen-ce-fixture.ts (có ground truth) trước; chạy thêm trên C&E thật ẩn danh nếu có.
Gate: ≥ 35 test; re-import idempotent.
```
**P3.6 ⚠**
```
Làm P3.6 theo AGENTS.md §9 (plan-first). Đọc: … → M3 §8–9.
Nhiệm vụ: bindings.yaml (schema + resolver + suggest), sinh test C&E đúng 9.1 (negative checks scoped, inhibit + đối chứng dương), mẫu motor 9.5; đầu ra tất định + --check. Cell không bind được → UNBOUND có lý do (*.unbound.yaml).
Gate: golden YAML sinh; ≥ 30 test resolver; ≥ 20 test sinh.
```
**P3.7 ⚠**
```
Làm P3.7 theo AGENTS.md §9 (plan-first). Đọc: … → M3 §12.2–12.3.
Nhiệm vụ: dựng demo examples/crusher-sequence (SCL interlock theo mô tả, equipment, C&E 20 hàng, bindings) và scripts/mutate-scl.ts. Chạy ≥ 100 mutant (mẫu có seed); với mỗi mutant sống: phân loại (tương đương / thiếu test / thiếu binding) → docs/mutation-notes.md. KHÔNG hạ ngưỡng.
Gate: gốc 100% PASS, 3 lần chạy cùng resultsHash; mutation score ≥ 90% sau khi loại mutant tương đương đã được chủ sản phẩm duyệt.
```
**P3.8**
```
Làm P3.8 theo AGENTS.md §9. Đọc: … → M3 §11.2.
Nhiệm vụ: Test Center, C&E view (ma trận tô màu), Bindings editor, trình soạn YAML test (Monaco + JSON Schema + autocomplete), Report build/open. Playwright e2e: import C&E → duyệt binding → sinh → chạy → xem ma trận/biểu đồ → build báo cáo.
Gate: e2e xanh; mọi mục M3 §12.4.
```

### M4 — Comms + HMI

**P4.1 ⚠**
```
Làm P4.1 theo AGENTS.md §9 (plan-first). Đọc: … → AMENDMENTS (B1–B8, D4) → M4 §2, 4.
Nhiệm vụ: (a) vá M0 nếu chưa có (P0.8): applyInbox, validateTagValue, schema files.comms/hmi, thông điệp WS additive; (b) tách packages/testing/src/expr → @vcs/expr (resolver tiêm vào) — TOÀN BỘ TEST M3 PHẢI VẪN XANH; (c) TagBroker đúng M4 §4.1–4.3 và chuyển WS handler sang broker; (d) cập nhật .dependency-cruiser.cjs.
Gate: ≥ 70 test mới; Tags page hiện cả tag M/DB; M3 xanh.
```
**P4.2**
```
Làm P4.2 theo AGENTS.md §9. Đọc: … → M4 §6.1–6.4, 13.1 (Modbus).
Nhiệm vụ: codec MBAP/PDU thuần (FC 1,2,3,4,5,6,15,16 + exception), mã hóa kiểu × byteOrder (golden tự tính trước), tự gán địa chỉ tất định, xuất CSV, server node:net. Tương thích kiểm bằng modbus-serial (dev dependency, client độc lập).
Gate: ≥ 90 test codec/kiểu, ≥ 30 test server; ghi tất-cả-hoặc-không.
```
**P4.3 ⚠**
```
Làm P4.3 theo AGENTS.md §9 (plan-first). Đọc: … → AMENDMENTS (C5, C6) → M4 §9, 6.5–6.6.
Nhiệm vụ: ExternalAdapterBase (step đồng bộ + cache + vòng nền), Modbus client + adapter external:modbus (gom khối, ghi khi đổi, kết nối lại, onDisconnect), khóa timeScale trong SimulationService, fake-plc-modbus (logic giống FB_Motor), vòng kín với plant motor_dol (tolerance rộng, waitFor).
Gate: ≥ 15 test adapter; vòng kín xanh trên Linux + Windows.
```
**P4.4 ⚠ 🔑**
```
Làm P4.4 theo AGENTS.md §9 (plan-first). Đọc: … → AMENDMENTS (E3) → M4 §7, 14.
Nhiệm vụ: OPC UA server: không gian node + sơ đồ s7-1500/vcs (namespace giữ chỗ), ánh xạ kiểu, getter đọc từ TagBroker, ghi qua broker.write với bảng StatusCode 7.4, bảo mật Basic256Sha256 + username, PKI tự ký + quy trình Trust. Kiểm bằng client node-opcua độc lập. CHẠY BENCH 2 000 monitored item; không đạt → chuyển I/Q sang push theo 7.4 và viết ADR.
Gate: ≥ 30 test server + ≥ 10 test bảo mật; bench đạt (CPU ≤ 25% một lõi).
```
**P4.5**
```
Làm P4.5 theo AGENTS.md §9. Đọc: … → M4 §8, 9.
Nhiệm vụ: adapter external:opcua (subscription cho tag Q, ghi theo lô cho tag I, đọc DataType node lúc nối, COM-W010/W011, mất kết nối/đồng bộ lại) + fake-plc-opcua; vòng kín với plant (nghiệm thu Chế độ B).
Gate: ≥ 20 test adapter + ≥ 4 kịch bản vòng kín.
```
**P4.6**
```
Làm P4.6 theo AGENTS.md §9. Đọc: … → M4 §5.3–5.4, 10.
Nhiệm vụ: GatewayManager (một gateway lỗi không ảnh hưởng gateway khác/mô phỏng), RingLog, REST/WS comms.*, trang Communications (trạng thái, Mapping + Export CSV, Log verbose, Security/Trust), vcs comms export, --no-comms.
Gate: e2e Communications xanh; ≥ 25 test REST/WS.
```
**P4.7 🔑**
```
Làm P4.7 theo AGENTS.md §9. Đọc: … → M4 §11.1–11.5, 11.8, Phụ lục B.
Nhiệm vụ: @vcs/hmi: schema màn hình/widget/symbol, validate (HMI-*), compile binding bằng @vcs/expr + resolver, symbol states, SANITIZER allowlist (mỗi phần tử/thuộc tính cấm có test), thư viện symbol chuẩn (11 symbol), JSON ghi tất định. Nếu có symbol chuẩn của công ty: tích hợp.
Gate: ≥ 60 test hmi; mọi vi phạm sanitizer bị chặn.
```
**P4.8**
```
Làm P4.8 theo AGENTS.md §9. Đọc: … → M4 §11.4, 11.6–11.9.
Nhiệm vụ: HMI runtime (store theo selector, rAF, stale, điều khiển có quyền/confirm/momentary an toàn), designer (command stack, snap, nhóm, panel thuộc tính từ schema, autocomplete, Problems, lưu etag), REST HMI, --hmi-readonly. Playwright e2e theo M4 §13.3.
Gate: ≥ 40 test runtime + ≥ 40 test designer; e2e xanh; nút momentary luôn nhả.
```
**P4.9**
```
Làm P4.9 theo AGENTS.md §9. Đọc: … → M4 §13, 14, Phụ lục C.
Nhiệm vụ: docs/scada-integration.md (theo dàn ý App. C), mở rộng examples/crusher-sequence (comms.yaml + màn hình HMI), chạy bench + test:integration trên Linux và Windows.
Gate: mọi mục M4 §17 tự kiểm được; liệt kê mục cần anh kiểm tay (UaExpert, Modbus master).
```

### M5 — PLCSIM / S7 / SimaticML

**P5.1 ⚠**
```
Làm P5.1 theo AGENTS.md §9 (plan-first). Đọc: … → AMENDMENTS (C1–C6) → M5 §2, 5.3, Phụ lục A.
Nhiệm vụ: vá nền theo C1–C5 (nếu chưa có ở P0.8/P3.4): asyncStep/requiresAsync, sym:, runner async + capabilities; cài packages/comms/src/plcsim/vbp.ts (khung + JSON + nhị phân + HMAC) và fake-bridge-agent.ts (TypeScript, dùng SoftPlc của M1, hỗ trợ lockstep).
Gate: ≥ 40 test VBP; M0–M4 không hồi quy.
```
**P5.2 ⚠**
```
Làm P5.2 theo AGENTS.md §9 (plan-first). Đọc: … → AMENDMENTS (C4–C6, E2) → M5 §6.
Nhiệm vụ: adapter external:plcsim-advanced (ảnh I/O theo vùng + diff, realtime/scaled/lockstep, introspection cache + watch, lifecycle, drift).
TRƯỚC KHI CODE: tự tính tay bảng timeline vòng kín lockstep (FB_Motor + motor_dol, giống M2 §11.4).
Gate: ≥ 40 test adapter; ≥ 4 kịch bản vòng kín; 2 lần chạy cùng TraceHasher; M3 chạy suite với lockstep (isolation: reset).
```
**P5.3**
```
Làm P5.3 theo AGENTS.md §9. Đọc: … → M5 §5 (trừ 5.5 backend PlcSim).
Nhiệm vụ: tools/bridge-agent (net48 x64): Core, Agent, Fake backend, xUnit; luồng API chuyên trách; ánh xạ lỗi; token HMAC; test chéo ngôn ngữ (agent .NET Fake ↔ client TS). KHÔNG viết backend PlcSim. DLL Siemens không vào repo.
Gate: dotnet test xanh; client TS ↔ agent .NET (Fake) chạy vòng kín.
```
**P5.4 🔑**
```
Làm P5.4 theo AGENTS.md §9. Cần: máy Windows có PLCSIM Advanced + thư mục API + manual API (anh cung cấp đường dẫn).
Đọc: … → M5 §3, 5.5, 6.4, 19.
Nhiệm vụ: VCS.Bridge.PlcSim cho API V8 (rồi V7/V6) — ĐỌC manual API/header đi kèm bản cài; xác minh các mục VERIFY (tên API bulk-I/O, STA/MTA, định dạng tên symbolic, RunToNextSyncPoint, thời gian reset). Ghi kết quả vào docs/plcsim-setup.md.
Gate: vcs bridge info/instances/run/stop hoạt động với instance thật; lockstep chạy một kịch bản thật; checklist VERIFY có kết quả.
```
**P5.5 ⚠**
```
Làm P5.5 theo AGENTS.md §9 (plan-first). Đọc: … → M5 §7, Phụ lục B.
Nhiệm vụ: codec S7comm cổ điển (thuần), client/server/adapter external:s7, vcs s7 probe. Kiểm tương thích bằng python-snap7 và nodes7 (dev only) và gói Wireshark mẫu nếu có. Ghi tất-cả-hoặc-không như 7.6.
Gate: ≥ 60 test codec, ≥ 40 test server, ≥ 20 test adapter, ≥ 8 test probe.
```
**P5.6 🔑**
```
Làm P5.6 theo AGENTS.md §9. Cần: Windows + TIA Portal (phiên bản anh đang dùng) + nhóm Siemens TIA Openness + một dự án TIA mẫu.
Đọc: … → M5 §8.
Nhiệm vụ: vcs-tia-export (net48) CHỈ-ĐỌC, manifest chuẩn, build theo TiaVersion (V21 rồi V20). Dùng tài liệu Openness/XSD đi kèm bản cài; không đoán API.
Gate: xuất đúng từ dự án mẫu (offline); block know-how protected bị bỏ qua có báo cáo; dự án không bị thay đổi.
```
**P5.7 🔑**
```
Làm P5.7 theo AGENTS.md §9. Cần: ≥ 10 file SimaticML thật ẩn danh + XSD Openness (anh cung cấp).
Đọc: … → AMENDMENTS (C2, C3) → M5 §9.1–9.4, 9.7–9.8, 13.2.
Nhiệm vụ: importer chế độ symbols (bảng tag, UDT/DB layout standard + sym: cho optimized, merge với I/O list, Compatibility Report). Làm TỪ file mẫu thật + XSD; thiếu mẫu → DỪNG và hỏi (H9), không bịa cấu trúc XML.
Gate: 100% địa chỉ/kiểu đúng với bảng tag; re-import idempotent; ≥ 50 test giao diện/DB.
```
**P5.8 ⚠ 🔑**
```
Làm P5.8 theo AGENTS.md §9 (plan-first). Đọc: … → AMENDMENTS (C3, E4) → M5 §9.5–9.6, 9.9.
Nhiệm vụ: SCL từ StructuredText → text → parser M1; FlgNet → IR dataflow (Contact/Coil/SCoil/RCoil/PBox/NBox/so sánh/số học/Move/Convert/Call/EN-ENO); instruction map theo M1 Phụ lục A; --on-unsupported skip|stub|fail.
Gate: IR từ SimaticML khớp IR từ SCL nguồn tương đương; ≥ 90% block SCL/LAD/FBD trong dự án mẫu chuyển được (phần còn lại có báo cáo).
```
**P5.9 🔑**
```
Làm P5.9 theo AGENTS.md §9. Cần: dự án TIA VCS_Conformance (anh tạo theo docs/verify-experiments.md) + PLCSIM Advanced.
Đọc: … → AMENDMENTS (C9) → M5 §10–11, 13.3.
Nhiệm vụ: conformance harness (vcs conformance run) + 14 thí nghiệm (SCL + kịch bản + kỳ vọng SoftPlc), UI (Communications mở rộng, TIA Import), docs/{plcsim-setup,tia-export,verify-experiments}.md. Với mỗi DIFF: đề xuất sửa semantics.md/runtime (KHÔNG tự sửa runtime).
Gate: ≥ 10/14 thí nghiệm chạy thật và có kết quả; golden đổi sang expectedFrom: plcsim cho phần đã xác minh.
```

---

## 7. Prompt gói nghiệm thu milestone (G0…G5)
```
Làm G{n}: gói bằng chứng nghiệm thu milestone M{n}. Đọc: AGENTS.md → STATE.md → docs/specs/M{n} (mục "Tiêu chí nghiệm thu").
Nhiệm vụ: tạo docs/acceptance/M{n}.md gồm, với MỖI tiêu chí nghiệm thu: (1) lệnh đã chạy (nguyên văn), (2) kết quả dán nguyên văn/ ảnh chụp mô tả, (3) trạng thái ĐẠT / CHƯA ĐẠT / CẦN KIỂM TAY, (4) liên kết tới test/commit. Chạy trên môi trường sạch (xóa cache, install --frozen-lockfile). Không sửa mã trong prompt này, trừ lỗi nhỏ ngăn chạy lệnh (nêu rõ). Danh sách tiêu chí CHƯA ĐẠT và CẦN KIỂM TAY đặt ở đầu file.
Gate: file docs/acceptance/M{n}.md đầy đủ; chờ chủ sản phẩm duyệt (REVIEW-CHECKLISTS) rồi ký trong STATE.md.
```

## 8. Quy trình review sau mỗi prompt (anh làm)
1. Chạy gate trên máy anh (lệnh ở `REVIEW-CHECKLISTS.md §1`).
2. Mở diff: đặc biệt `*.golden.yaml`, `expected*`, `docs/semantics.md`, `package.json`, `.dependency-cruiser.cjs`, `eslint.config.js`, allow-list của `review:cheats`.
3. Chạy demo của prompt (mục demo trong `REVIEW-CHECKLISTS.md` theo milestone).
4. (Khuyến nghị) chạy **H4** với một AI khác để review độc lập trước khi merge.
5. Merge → cập nhật `STATE.md` (AI đã làm; anh kiểm tra) → mở prompt kế.
