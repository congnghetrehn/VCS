# REVIEW-CHECKLISTS — Checklist rà soát (chủ sản phẩm làm sau mỗi prompt và mỗi milestone)

> Nguyên tắc: **"xanh" trong báo cáo của AI chưa phải bằng chứng**. Anh (hoặc một AI reviewer độc lập, prompt H4) tự chạy lệnh và đọc diff. Mục 1 dùng cho **mọi** prompt; mục 2 theo milestone; mục 3 là việc kiểm bằng tay cần kiến thức điều khiển của anh.

---

## 1. Checklist chung (mỗi prompt/PR)

### 1.1 Chạy lại gate (máy anh, môi trường sạch)
```
git switch <nhánh> && pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm depcheck && pnpm test && pnpm review:cheats
# nếu prompt yêu cầu: pnpm test:integration | pnpm test:e2e | pnpm bench
```
☐ Tất cả xanh · ☐ số test tăng đúng như báo cáo · ☐ không test bị skip/only

### 1.2 Đọc diff — những file phải xem kỹ
☐ `**/*.golden.yaml`, `expected*`, `fixtures/**`, `docs/semantics.md` — **kỳ vọng bị đổi?** (nếu có: nguồn sự thật nào chứng minh giá trị cũ sai? dùng H6)
☐ `package.json`, `pnpm-lock.yaml` — dependency mới/ bản mới < 14 ngày/ license lạ?
☐ `eslint.config.js`, `.dependency-cruiser.cjs`, `tsconfig*.json`, `scripts/check-cheats.allow.json`, CI — **có nới luật không?**
☐ ngưỡng hiệu năng/ coverage trong `bench`, `vitest.config` — có bị hạ?
☐ file "sinh tự động" có bị sửa tay? (`tests/generated/**`, `plc/generated/**`, `docs/diagnostics.md`, `docs/equipment/*.md`, JSON HMI)

### 1.3 Mùi gian lận / yếu (tìm trong diff)
☐ `.only`, `.skip`, `xit`, `@ts-ignore`, `eslint-disable`, `: any`, `as any` (script đã quét, nhưng liếc lại)
☐ `catch {}` rỗng; `try/catch` nuốt lỗi rồi trả giá trị mặc định
☐ Giá trị cứng "cho test qua" (`if (name === 'MOTOR1')`), nhánh `process.env.NODE_ENV === 'test'` đổi hành vi
☐ Mock che hành vi cần kiểm (ví dụ mock TagDB trong test của TagDB)
☐ Assert yếu: chỉ kiểm "không ném lỗi", `toBeDefined()`, snapshot không ai đọc, so sánh với chính hàm đang test
☐ Test không thể fail: tự hỏi *"nếu implementation sai thì test này có đỏ không?"*
☐ Sleep/ timeout thật trong test logic (phải dùng đồng hồ giả/ sim time)
☐ Stub "tạm thời" trả dữ liệu giả mà không báo lỗi tường minh

### 1.4 Bất biến lõi (AGENTS.md §4) — kiểm nhanh bằng grep
```
git diff main -U0 | findstr /i "Date.now Math.random performance.now"   (Windows)
git diff main -U0 | grep -nE "Date\.now|Math\.random|performance\.now"    (Linux/mac)
```
☐ Không phát sinh ở package lõi · ☐ không ghi TagDB trực tiếp từ ngoài bước · ☐ không cấp phát trong `step/get/set/flush` · ☐ lỗi có `Diagnostic` + mã đăng ký

### 1.5 Báo cáo của AI có trung thực không?
☐ Có dán **lệnh + kết quả nguyên văn**? · ☐ nêu rõ cái **chưa chạy**/ chưa đạt? · ☐ mục "Sai khác so với spec" không để trống một cách đáng ngờ? · ☐ mọi giả định đã vào `open-questions.md`?

### 1.6 Quyết định
**MERGE** nếu 1.1–1.5 sạch và demo (mục 2) chạy đúng · **SỬA** nếu có vi phạm nhỏ (nêu rõ) · **TỪ CHỐI** nếu sửa kỳ vọng không lý do, nới luật, hoặc vi phạm bất biến lõi.

---

## 2. Checklist theo milestone

### M0 — Skeleton
**Demo tay**
```
pnpm vcs validate examples/hello-tags          # kỳ vọng: không lỗi
pnpm vcs run examples/hello-tags --until 5s --hash   # chạy 2 lần, hash giống hệt
pnpm vcs serve examples/hello-tags             # mở web: bảng Tags, Run/Pause/Step/Reset
```
**Nghiệm thu (M0 §15)**
☐ CI xanh Linux **và Windows**, Node 20 + 22 · ☐ web hiện tag, Run tăng sim time, Step = đúng 10 ms, Reset về 0
☐ `vcs validate` báo **dòng/cột đúng** cho: YAML hỏng, sai schema, trùng tag, controller không tồn tại, khóa lạ (kèm gợi ý) — tự thử 5 file lỗi
☐ Hash `vcs run` giống nhau Windows ↔ Linux ↔ các lần chạy
☐ Thử cố ý `Date.now()` trong `packages/kernel/src/x.ts` → lint **phải** fail; thử import sai package → `depcheck` **phải** fail
☐ Ghi `tag.write` vào tag `LAMP_RUN` (controller-owned) từ UI → bị từ chối
☐ Có `AGENTS.md`, ADR 0001–0006, `architecture.md`, `semantics.md`
**Red flags:** `TagDB` phát thông báo ngay trong `set` (phải ở `flush`); orchestrator có timer thật; `loadProject` ném lỗi thay vì trả diagnostics; hash khác nhau giữa Windows/Linux (EOL/ BOM); web import `kernel`.

### M1 — Soft-PLC
**Demo tay**
```
pnpm vcs run examples/motor-interlock --scans 100
pnpm vcs ir dump examples/motor-interlock/plc/FB_Motor.scl
```
**Nghiệm thu (M1 §16)**
☐ 4 kịch bản demo A–D (bảng timeline M1 §13) đúng qua CLI **và** UI (Watch + force) — **tự tính tay lại ít nhất kịch bản B** (mất feedback: `RUN_CMD=0` tại t=3200)
☐ ≥ 80 golden, mỗi golden có `expectedFrom` · ☐ lỗi biên dịch có vị trí chính xác (thử 5 lỗi cú pháp/kiểu của riêng anh)
☐ Lệnh/cú pháp chưa hỗ trợ → `SCL-U001` (thử `STRING`, `POINTER`) — **không** chạy sai im lặng
☐ Snapshot → chạy → restore → chạy lại: trace giống hệt · ☐ bench ≥ 1000 scan/s (200 FB_Motor)
☐ `docs/semantics.md` liệt kê mọi quy tắc 7.2/8/9 với VERIFIED/UNVERIFIED
**Kiểm kiến thức PLC của anh (mục 3.1)** — đây là phần AI không tự biết đúng.
**Red flags:** timer dùng wall clock; `Int` không wrap; `Real` không `fround`; output `%Q` ra ngoài ngay giữa scan; `SoftPlc.step` async; input không latch đầu scan; bộ nhớ little-endian.

### M2 — Plant + I/O import
**Demo tay**
```
pnpm vcs import-io fixtures/io-list-300.xlsx --profile <profile.yaml> --commit
pnpm vcs suggest        # xem bảng gợi ý, confidence, reasons
pnpm vcs plant run examples/motor-interlock --scenario scenarios/trip.yaml --until 5000ms
```
**Nghiệm thu (M2 §14)**
☐ Fixture 300 tín hiệu: ≥ 90% (equipment, role) đúng · 100% địa chỉ chuẩn hóa · 100% lỗi cố ý bị phát hiện · 0 báo nhầm
☐ Re-import cùng file → diff rỗng; trường `provenance: manual` không bị ghi đè (tự sửa tay một tag rồi import lại)
☐ Demo vòng kín A–D khớp bảng thời gian M2 §11.4 (tự tính tay kịch bản A tới T=1000) · ☐ hash tất định, restore giữa chừng cùng hash
☐ Mỗi fault của mỗi model bật/tắt được từ UI, PLC phản ứng đúng
☐ `docs/equipment/*.md` sinh tự động khớp định nghĩa
**Thử với dữ liệu thật của anh (bắt buộc):** chạy `import-io` + `suggest` trên I/O list thật ẩn danh → ghi tỷ lệ đúng/sai vào `STATE.md`; chỉnh `naming.yaml`/synonym; **không** chấp nhận "đạt trên fixture tổng hợp" làm bằng chứng cuối.
**Red flags:** model dùng `Math.random`/`Date.now`; adapter scale sai (0..27648, kẹp over/under-range); auto-suggest gọi mạng/LLM; link vòng không bị bắt; model đọc tag theo tên mỗi bước.

### M3 — Test automation
**Demo tay**
```
pnpm vcs ce import io/CE_matrix.xlsx --profile io/ce-profile.yaml --commit
pnpm vcs ce suggest-bindings && pnpm vcs ce generate --check
pnpm vcs test --report out --format html,json,junit
```
**Nghiệm thu (M3 §12.4)**
☐ Bảng timeline M3 §6.5 tái tạo **chính xác** · ☐ sinh ≥ 20 test C&E + inhibit + đối chứng + mẫu motor · ☐ `ce generate --check` sạch (tất định)
☐ **Mutation score ≥ 90%** trên ≥ 100 mutant; gốc 100% PASS; 3 lần chạy cùng `resultsHash` — **anh duyệt từng mutant sống** (tương đương hay thiếu test?)
☐ Mọi ô C&E có trạng thái (PASS/FAIL/UNBOUND/SKIP), **không có ô biến mất**
☐ Báo cáo HTML: mở được offline, in PDF A4 sạch, biểu đồ bằng chứng đọc được trắng đen, truy vết requirement, khung ký
☐ Sửa tay logic PLC (đảo một interlock) → test **phải đỏ** (tự cài lỗi thử 3 chỗ)
**Đọc báo cáo như khách hàng/witness:** có đủ để ký FAT không? thiếu gì?
**Red flags:** quan sát trước khi PLC scan xong; `within` không chặn; wall-time lẫn vào hash; sửa tay `tests/generated/**`; cell không bind được bị bỏ qua; `UNBOUND` không có lý do; M/DB tag không đọc được trong biểu thức (xem AMENDMENTS E1).

### M4 — Comms + HMI
**Demo tay**
```
pnpm vcs serve examples/crusher-sequence       # OPC UA 4840, Modbus 1502, web
# UaExpert: kết nối opc.tcp://localhost:4840 → duyệt → đọc/ghi → subscription
# Modbus master (ModbusPoll/QModMaster) theo modbus-map.generated.csv
# Web: /hmi → thiết kế màn hình → Run → nhấn nút
```
**Nghiệm thu (M4 §17) — nhiều mục phải kiểm TAY với công cụ thật**
☐ UaExpert: duyệt, đọc/ghi tag free và M/DB, subscription cập nhật; ghi tag plant-owned → `BadNotWritable`
☐ Node id `ns=3;s="Tag"` / `ns=3;s="DB"."Member"` đúng với **ví dụ node id SCADA thật của anh**
☐ Basic256Sha256 + SignAndEncrypt: trước Trust bị từ chối, sau Trust kết nối được; sai mật khẩu bị từ chối
☐ Modbus: mọi kiểu × byteOrder đọc đúng; ghi một phần tag 32-bit → exception 3
☐ Chế độ B với PLC giả (OPC UA + Modbus) điều khiển plant `motor_dol`; mất kết nối → `quality bad`, nối lại → đồng bộ lại
☐ HMI: tạo màn hình tổng quan bằng designer (không sửa file tay), lưu **tất định**, runtime chạy đúng; nút momentary **luôn nhả** (thử: nhả chuột, rời nút, Alt-Tab, tắt server)
☐ Symbol SVG chứa `<script>`/`onload`/`href` ngoài → bị chặn `HMI-E005`
☐ Bench: 2 000 monitored item CPU ≤ 25% một lõi · ☐ không có mật khẩu trong log/API
**Red flags:** ghi từ OPC UA/Modbus thẳng vào TagDB; callback mạng chặn event loop; `stop()` không đóng sạch (cổng treo); test dùng cổng cố định; SVG chưa qua sanitizer; mất WS mà giá trị HMI vẫn hiện như "tươi".

### M5 — PLCSIM / S7 / SimaticML
**Tầng T1/T2 (tự động)**
☐ `pnpm test` + `dotnet test` xanh; vòng kín lockstep với agent giả khớp bảng tính tay; 2 lần chạy cùng hash; M3 chạy suite với lockstep
☐ S7 server tương thích `python-snap7` và `nodes7`; `probe` chẩn đoán đúng ≥ 6 tình huống lỗi
☐ Importer: ≥ 10 file TIA thật → 100% địa chỉ/kiểu đúng với bảng tag; mọi lệnh/ block không hỗ trợ **nằm trong Compatibility Report**
**Tầng T3 (anh làm trên máy có TIA + PLCSIM Advanced)**
☐ `vcs bridge info/instances/run/stop` với instance thật · ☐ lockstep chạy kịch bản thật, ≥ 100 bước/giây
☐ Chương trình **TIA thật** + plant VCS: demo A–D cho cùng kết quả logic như SoftPlc (khác biệt có giải thích)
☐ Conformance: ≥ 10/14 thí nghiệm có kết quả; mọi DIFF đã xử lý; `semantics.md` cập nhật VERIFIED
☐ `vcs-tia-export` xuất đúng (offline), **dự án TIA không bị thay đổi** (so sánh trước/sau), block know-how protected được báo cáo
**Red flags:** DLL Siemens/ file dự án thật trong repo; importer "đoán" cấu trúc XML thay vì dựa mẫu/XSD; S7 server áp dụng ghi một phần; lockstep dùng wall clock; mọi lời gọi API Siemens không nằm trên luồng chuyên trách; bỏ qua im lặng lệnh không hỗ trợ.

---

## 3. Việc kiểm bằng tay cần kiến thức điều khiển của anh (AI không tự làm được)

### 3.1 Ngữ nghĩa PLC (M1/M2)
☐ Với 3 kịch bản timer/counter tự chọn: tính tay đầu ra từng scan, so với golden
☐ Xem `docs/semantics.md`: các mục `UNVERIFIED` có mặc định hợp lý không? Ghi những mục anh **biết chắc** hành vi thật (từ kinh nghiệm hiện trường)
☐ Logic demo có "giống thực tế" không (seal-in, timeout feedback, latch fault + reset)? Chỉnh nếu khác tập quán dự án
☐ Thang analog 0..27648, vùng over/under-range, giá trị đứt dây của module AI thực tế
### 3.2 Chất lượng bộ test (M3)
☐ Đọc 5 test C&E sinh tự động: kỳ vọng và cửa sổ thời gian có hợp lý với hiện trường?
☐ Có hàng C&E nào "tự dưng PASS" quá dễ (ví dụ negative check yếu)? Cài lỗi thử xem có bắt được không
### 3.3 Hiện trường (M4/M5)
☐ SCADA thật nối được qua tag cũ không đổi cấu hình? Chính sách bảo mật có chấp nhận cấu hình mặc định?
☐ PLCSIM vs SoftPlc cho cùng kết quả với chương trình thật của anh? Chỗ lệch có chấp nhận được cho mục đích FAT?

## 4. Mẫu ghi nhận kết quả rà soát (dán vào PR/`docs/acceptance/Mx.md`)
```
Prompt/Milestone: P?.? | Ngày: | Người rà soát: | Công cụ/AI thực hiện:
Gate tự chạy lại: lint ☐ typecheck ☐ depcheck ☐ test ☐ cheats ☐ (+ integration/e2e/bench ☐)
Diff đã đọc: golden ☐ lockfile ☐ cấu hình lint/CI ☐ ngưỡng ☐ file sinh tự động ☐
Demo đã chạy: <lệnh> → <kết quả>
Phát hiện: <vi phạm/ rủi ro, mức nghiêm trọng>
Kết luận: MERGE / SỬA (liệt kê) / TỪ CHỐI (lý do)
```
