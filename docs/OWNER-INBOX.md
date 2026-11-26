# OWNER-INBOX — Hộp thư của chủ sản phẩm

> **Chủ sản phẩm chỉ cần đọc file này.** AI ghi vào đây mọi thứ cần anh: quyết định, kiểm thử thật, dữ liệu, thay đổi lớn, ký duyệt. Mỗi mục tự đủ ngữ cảnh để xử lý trong < 2 phút.
> **Cách trả lời:** đánh dấu `[x]` vào lựa chọn (hoặc dán kết quả theo hướng dẫn) rồi commit, hoặc trả lời trong chat với ID mục (ví dụ "D-003: chọn B"). AI sẽ cập nhật trạng thái, ghi vào ADR/OQ nếu cần và gỡ chặn.
> Mục đã xử lý chuyển xuống "Lịch sử" (không xóa). AI gom yêu cầu theo đợt, tối đa 1 lần/ngày làm việc, trừ khi bị chặn hoàn toàn.

Nhãn: **D** QUYẾT ĐỊNH · **T** KIỂM THẬT (PLCSIM/TIA/SCADA/phần cứng) · **X** DỮ LIỆU CẦN CÓ · **S** THAY ĐỔI SPEC/LỚN · **K** KÝ DUYỆT milestone · **R** DUYỆT SAU (tầng B)

## 0. Tóm tắt (AI cập nhật mỗi lần ghi)
- Đang bị chặn bởi: T-002, T-003 (nên làm sớm — quyết định khả thi M5 và giấy phép). D-001/D-004/D-005 ĐÃ XONG; M0 ĐÃ KÝ 2026-11-24; M1 ĐÃ KÝ 2026-11-25.
- Việc cần anh trong tuần này: quyết §16.5 (D-006) + OQ-161 + chọn HTTPS cho LAN (D-007: mkcert / reverse proxy / chỉ localhost); chạy T-001 (S6, môi trường Windows); chuẩn bị T-002/T-003 sớm nếu có PLCSIM/TIA; VERIFY §14 với PLCSIM + mã thật (xem `docs/verify-owner-guide.md` mục 3)
- Cập nhật lần cuối: 2026-11-26 (P2.2 đã merge PR #32; P2.3 plan §26, R-008)
- Nhãn/milestone GitHub (II.7): CHƯA CHẠY — GitHub MCP không có tool tạo nhãn/milestone (46 tool đã kiểm, không có); cần làm qua giao diện GitHub hoặc chủ sản phẩm. Không tự đổi branch protection (D-001).

---

## 1. QUYẾT ĐỊNH (D) — đang mở

### D-001 · Bật branch protection cho `main` · Chặn: G0 · Hạn mong muốn: trước P0.1
**Bối cảnh:** Repo hiện chưa có branch protection. `main` chỉ nhận từ `develop` sau khi anh ký milestone; AI chỉ merge vào `develop`.
**Lựa chọn:**
- [x] A — Bật: `main` yêu cầu PR + CI xanh, cho phép AI push nhánh / tạo PR
- [ ] B — Không bật lúc này, chỉ quy ước bằng miệng
**Đã quyết 2026-11-24: chọn A.** Rule đã tạo 2026-11-24 17:53 +07 (classic branch protection, branch `main`, rule ID 86808264): yêu cầu PR (0 approval), bắt buộc 4 check xanh — check (lint, typecheck, depcheck, diagnostics, cheats), test ubuntu-latest Node 22, test windows-latest Node 22, e2e ubuntu Node 22 — + require up to date, chặn force-push, admin bypass vẫn được. **CẢNH BÁO: GitHub báo rule "Not enforced" vì repo private trên gói free — rule chỉ có hiệu lực khi nâng cấp Team/Enterprise hoặc repo public.** **Chủ sản phẩm quyết 2026-11-24 17:58 +07: chấp nhận hiện trạng (không nâng cấp, không public) — AI tự push `main` khi đã hoàn tất kiểm tra các đánh giá nghiệm thu G0–G5.** Nghĩa thực tế: sau khi gói nghiệm thu của một milestone đã merge vào `develop` VÀ chủ sản phẩm đã ký milestone ở STATE.md §8, AI mở PR `develop` → `main` qua trình duyệt, chờ CI xanh rồi merge (đó là cách duy nhất đẩy `main` qua UI, vì VM không có credential git). AI không push `main` ngoài thời điểm đó.
**Đề xuất của AI:** A, vì đây là hàng rào duy nhất ngăn merge nhầm vào `main` trước khi có CI.
**Hệ quả nếu chọn khác:** B thì `main` có thể bị ghi đè trực tiếp; AI vẫn tự giữ quy tắc không push `main`.
**Việc đang chờ:** P0.1 (CI) và G0 · **Liên quan:** AUTONOMY §5, BOOTSTRAP bước 7

### D-002 · Giấy phép / tên gói (`@vcs/*`) · Chặn: P0.1 · Hạn mong muốn: trước P0.1
**Bối cảnh:** Repo đang private, chưa có file LICENSE, chưa có package.json. Tên gói theo spec là `@vcs/*`, lệnh `vcs`.
**Lựa chọn:**
- [ ] A — Repo private, proprietary/UNLICENSED, tên gói giữ nguyên `@vcs/*`
- [ ] B — Chọn giấy phép khác: …
**Đề xuất của AI:** A, vì sản phẩm dùng nội bộ + có tích hợp Siemens có bản quyền.
**Hệ quả nếu chọn khác:** B thì cần ghi LICENSE tương ứng trước P0.1.
**Việc đang chờ:** P0.1 · **Liên quan:** BOOTSTRAP bước 7

### D-003 · Chính sách dữ liệu khách hàng · Chặn: P2.7 · Hạn mong muốn: trước P2.7
**Bối cảnh:** Các prompt P2.7, P3.5, P4.4, P5.7 cần dữ liệu thật (I/O list, C&E, SimaticML, SCADA). Dữ liệu thật không được vào repo hay công cụ AI nếu chưa ẩn danh.
**Lựa chọn:**
- [ ] A — KHÔNG đưa dữ liệu thật vào công cụ AI / repo; chỉ dữ liệu ẩn danh đặt ở `fixtures-real/` (đã .gitignore) hoặc kho riêng
- [ ] B — Cho phép dùng dữ liệu thật có giới hạn: …
**Đề xuất của AI:** A, vì đây là dữ liệu khách hàng + dự án TIA.
**Hệ quả nếu chọn khác:** B thì cần quy tắc ẩn danh + kho lưu trữ cụ thể trước khi đưa.
**Việc đang chờ:** X-003…X-008 · **Liên quan:** AGENTS §8, BOOTSTRAP bước 7

### D-004 · Nơi chạy mô phỏng (server hay Worker) · Chặn: G0 · Hạn mong muốn: trước P0.6/P1.7
**Bối cảnh:** M1 §11 từng nói SoftPlc chạy trong Web Worker; AMENDMENTS A10/E6 đã đổi mặc định thành server Node, Worker chỉ là tùy chọn sau (M0 §17 mục 4).
**Lựa chọn:**
- [x] A — Server Node (mặc định), Worker không cần
- [ ] B — Worker (cần nêu lý do: …)
**Đã quyết 2026-11-24: chọn A (server Node).** Khớp mặc định A10/E6 đã triển khai khắp P0.5/P0.6.
**Đề xuất của AI:** A, theo A10/E6 và vì UI đã qua WebSocket.
**Hệ quả nếu chọn khác:** B thì P0.6/P1.7 phải làm thêm transport Worker.
**Việc đang chờ:** P0.6, P1.7 · **Liên quan:** AMENDMENTS A10/E6, OQ-004

### D-005 · PWA (P0.9) · Chặn: không chặn M0 · Hạn mong muốn: sau M0
**Bối cảnh:** P0.9 là prompt tùy chọn (PWA shell), ngoài spec; nếu làm cần quyết HTTPS cho LAN.
**Lựa chọn:**
- [ ] A — Hoãn tới sau M0 (mặc định)
- [x] B — Làm ở P0.9, cần quyết HTTPS cho LAN trước
**Đã quyết 2026-11-25: chọn B.** Chủ sản phẩm yêu cầu làm P0.9 ngay sau khi ký M1. HTTPS cho LAN: P0.9 ghi ADR đề xuất phương án (mkcert/reverse proxy) vào OWNER-INBOX mục D, KHÔNG tự đổi bind mặc định.
**Đề xuất của AI:** A, để M0 không bị kéo dài.
**Hệ quả nếu chọn khác:** B thì cần anh quyết cách cấp chứng chỉ HTTPS cho LAN.
**Việc đang chờ:** P0.9 · **Liên quan:** BOOTSTRAP bước 7, SKILL-ui-pwa-hmi §9

### D-006 · §16.5 — giữ mã lỗi tách riêng hay gom về U001? · Chặn: không chặn ký M1 · Hạn mong muốn: trước M2
**Bối cảnh:** Chữ spec §16.5 viết "SCL-U001" cho mọi lệnh chưa hỗ trợ, nhưng thực tế đã kiểm chứng bằng probe (đều lỗi ồn ào, có vị trí, exit 2 — không gì chạy sai im lặng): `String` → SCL-U001 (3:7); `POINTER`/`ANY` → SCL-T001 "kiểu chưa biết"; mảng nhiều chiều/`GOTO` → SCL-P002. Chỉ M1 §17 quy định String → U001; các trường hợp còn lại rơi vào nhánh lỗi kiểu/cú pháp trước khi tới U001. Xem `docs/acceptance/M1.md` §16.5 và `docs/verify-owner-guide.md` mục 6.
**Lựa chọn:**
- [ ] A — Giữ nguyên, chỉ ghi anh chấp nhận phạm vi mã này, không sửa code
- [ ] B — SCR gom mọi cấu trúc ngoài EBNF về một mã U001 (đổi spec + sửa parser, làm ở phase sau)
**Đề xuất của AI:** A, vì mọi trường hợp đều đã ồn ào + có vị trí; gom mã chỉ đổi tên lỗi, không tăng an toàn.
**Hệ quả nếu chọn khác:** B thì cần SCR + sửa parser ở phase sau.
**Việc đang chờ:** M1 đã ký (giữ mặc định) · **Liên quan:** M1 §16.5, OQ-102

### D-007 · HTTPS cho LAN (PWA trên tablet) — chọn mkcert, reverse proxy, hay chỉ localhost? · Chặn: không chặn P0.9 (PWA chạy đủ trên localhost) · Hạn mong muốn: trước khi dùng tablet witness qua LAN
**Bối cảnh:** Service worker chỉ chạy trên secure context (HTTPS hoặc `localhost`). `vcs serve` mặc định bind `127.0.0.1` nên trên máy chủ thì PWA chạy đủ. Nhưng tablet witness truy cập qua `http://192.168.x.x` thì **không** phải secure context → SW không đăng ký, không cài PWA được. P0.9 viết ADR-0009 đề xuất phương án (bảng so sánh trong STATE §23 bảng A); P0.9 **không** đổi bind mặc định, **không** thêm TLS vào server — việc đó làm sau khi anh chọn.
**Lựa chọn:**
- [ ] A — mkcert (AI đề xuất): `mkcert -install` 1 lần trên máy chủ + `mkcert <tên-máy/IP-LAN>` tạo cert; server thêm TLS sau; cài CA root mkcert lên từng tablet 1 lần
- [ ] B — Reverse proxy TLS (Caddy/nginx): proxy terminate TLS trước server, passthrough `wss://`; không sửa code server
- [ ] C — Chỉ localhost: không LAN PWA; tablet dùng trình duyệt thường qua http, witness xem qua máy chủ/remote desktop
**Đề xuất của AI:** A, vì 1 lệnh, không thêm service chạy thường trực; cert tin cậy nội bộ sau khi cài CA.
**Hệ quả nếu chọn khác:** B thì thêm 1 service cần vận hành + cấu hình proxy (đặc biệt passthrough WebSocket); C thì mất offline/update/kiosk trên tablet. Dù chọn A hay B đều cần thêm TLS vào server/proxy sau (việc riêng, không trong P0.9).
**Việc đang chờ:** P0.9 (ADR-0009 viết xong, chờ anh chọn) · **Liên quan:** D-005, STATE §23 bảng A, skill UI §9

### D-008 · Hot-loop plant không đạt M2 §12 ≥ 5000 bước/s — ✅ ĐÃ QUYẾT 2026-11-26 13:38 +07: làm A+B, hạ ngưỡng theo số đạt được · Chặn: P2.4 (commit 6–12) + nghiệm thu M2
**Bối cảnh:** P2.4 làm lại vòng nóng plant theo quyết định A của anh (26-11-2026). Sau cả 2 lần đổi kiến trúc, bench plant (500 thiết bị hỗn hợp, bước 10 ms, trung vị 5 runs trên VM) vẫn **~1.896 bước/s** (phạm vi 1.772–2.132 qua 15 lần chạy), thiếu **×2,64** so với M2 §12 ≥ 5.000. Commit 4 (kênh tính trước): +2,8%; commit 5 (dispatch đơn hình theo model): +0,5% — đều trong dao động VM. Commit 6 (fault fast-path) đã BỎ QUA theo plan vì profile không chứng minh cần. Profile CPU sau commit 5 (`node --cpu-prof`, 52.388 mẫu): `#emit` 25,0%, `#prepareOne` 10,4%, `#applyWrite` (TagDB) 10,1%, engine `step` 8,6%, `#drainPendingObs` 5,8%, `#channelOf` 5,6%, các `model.step` ~16% tổng, GC 2,0%, `#activeSignalFaults` chỉ 0,2% — chi phí nằm ở bản thân máy móc step/emit/tag, không còn điểm nóng đơn lẻ. Bench vòng kín **1.282 bước/s ≥ 1.000 PASS** (yêu cầu vòng kín dùng thật đã đạt; chỉ bench engine-alone tổng hợp là chưa). Nhánh dừng ở commit 5 (commit 7 server/UI + commit 8 docs chưa làm). **Bổ sung 2026-11-26 13:22 +07 (spike B đo thật):** bench plant tsx 2054 → node + esbuild bundle 2331 bước/s (+13,5% cùng phiên; quy hoạch B +8–14%). A+B cộng lại (nhân) ~2200–2800, trung tâm ~2400–2550. Vòng kín chỉ +4–6% từ A+B (PLC ~79% bước). Phương án viết lại engine riêng để giữ 5000 đã phân tích cùng ngày và không chọn (cỡ P2.1+P2.2+P2.3, vòng kín chỉ +11%).
**Quyết định (chủ sản phẩm chọn 2026-11-26 13:38 +07 — thay thế các lựa chọn A/B/C dưới đây):**
- [x] **Làm A+B, hạ ngưỡng theo số đạt được** — A: kênh số cho StepCtx (`step(ctx, slots)` + brand types, đảo OQ-309 — đã ghi AMENDMENTS A21); B: bench plant + closedloop từ JS biên dịch (esbuild bundle, yaml external, KHÔNG đổi exports packages); đo sau mỗi bước; ngưỡng mới = min quan sát sau A+B −15% (dự kiến ~2000 nếu trung tâm ~2400–2500; band khả năng tối đa anh nêu: 2000–2500). Plan: STATE §28, commit 6–12 trên nhánh `m2/p2.4-closed-loop`.
- ~~A — Kênh số cho StepCtx (riêng lẻ)~~, ~~B — JS biên dịch trước (riêng lẻ)~~, ~~C — Chỉ hạ ngưỡng về ≥ 1.500 (AI từng đề xuất)~~: cả ba đã bị thay thế bởi quyết định trên.
**Đề xuất của AI (đã bị quyết định trên thay thế):** C — nay không còn hiệu lực. Phân tích A+B và viết lại engine riêng đã báo cáo 2026-11-26 13:22 +07 và 13:30 +07.
**Điểm tier C (STATE §28):** TC-1 — trung vị plant sau A+B < 2000 bước/s → DỪNG, chờ anh quyết (không tự hạ ngưỡng dưới 2000, không tự chọn hướng khác); TC-2 — golden/determinism/hash demo lệch sau A → DỪNG, không sửa golden; TC-3 — B tắc sau 3 lần sửa → fallback bench tsx, đo A-only, báo anh.
**⛔ TC-1 ĐÃ XẢY RA — 2026-11-26 (commit 9, sau đo A+B):** bench plant qua bundle: [1974, 1840, 2035, 1921, 1941], trung vị **1941 bước/s** (min 1840, max 2035) — **dưới 2000**, thiếu 59 bước/s (3%). A = +17,7% (tsx), B = +8,0% (bundle), A+B = +27,1% so với gốc tsx 1527 — cả hai đều trong quy hoạch, nhưng máy chậm phiên này nên số tuyệt đối không tới band. Vòng kín bundle trung vị 985 (973–1021), cũng dưới ngưỡng 1000 trong phiên này (parent đo 1285 cho cùng code lúc 12:52 — biến động VM). **Đã DỪNG theo plan: chưa hạ ngưỡng (M2 §12 vẫn ≥ 5000), chưa làm commit 10–12.** Theo công thức OQ-326, ngưỡng sẽ là 1500 (min 1840 −15%, làm tròn xuống trăm) — CHƯA áp dụng.
**Cần anh quyết (chọn một):** (a) chấp nhận ngưỡng 1500 theo công thức (dưới band 2000–2500); (b) đo lại vào phiên máy yên rồi quyết theo số mới (trung vị 1941 chỉ thiếu 3% — cùng code từng đo 1932 tsx lúc 12:52, máy yên có thể qua 2000); (c) hướng khác do anh chỉ định (vd viết lại engine riêng đã phân tích 13:30 — cỡ P2.1+P2.2+P2.3). **Liên quan:** STATE §28 (kết quả commit 9).
**✅ ĐÃ QUYẾT 2026-11-26 15:09 +07 — anh chọn (a): chấp nhận ngưỡng 1500, làm tiếp commit 10–12.** Parent đo lại độc lập trước khi trình (bản sao sạch `~/.cache/vcs-tc1pv`, HEAD `d64ebfc`, cài thật): plant bundle ×5 [2061, 2032, 2131, 2036, 1825] trung vị **2036** ≥ 2000 → **TC-1 KHÔNG tái hiện**; vòng kín [975, 963, 931] trung vị 963 < 1000 (máy chậm, PLC không đổi từ lúc PASS 1285 — đo lại ở parent gate, KHÔNG hạ ngưỡng vòng kín). Công thức OQ-326 cho 1500 ở cả hai bộ (min 1840/1825 −15% → 1564/1551 → 1500). Commit 10 áp dụng: M2 §12 ≥ 1500, A22 chốt, `THRESHOLD_STEPS_PER_SEC = 1500`, baseline plant 1941 / closedLoop 985, OQ-326 đóng.
**Việc đang chờ:** ✅ Đã quyết (a) 15:09 +07 — commit 10 xong (ngưỡng 1500); commit 11–12 đang làm · **Liên quan:** STATE §27 (commit 4/5/6 + profile) + §28 (plan A+B), OQ-309 (đảo ngược) / OQ-310/311 / OQ-320…326, AMENDMENTS A21 + A22 (ĐÃ QUYẾT)

## 2. KIỂM THẬT (T) — cần anh chạy trên môi trường thật

### T-001 · Spike S6 — kiểm môi trường Windows · Chặn: P0.1 · Ước tính: 30 phút · Cần: máy Windows của anh
**Mục đích:** Biết máy anh dựng được repo không (Node, pnpm, Playwright, cổng, .NET SDK).
**Các bước (làm đúng thứ tự):**
1. Chạy `node scripts/doctor.mjs` (AI viết ở P0.1; trước đó chạy tay: `node --version`, `pnpm --version`, `git --version`, `dotnet --info`).
2. Kiểm cổng 4170/4840/1502 còn rảnh; kiểm `git config core.autocrlf`.
3. Chạy `pnpm install` + một test mẫu + một e2e mẫu (khi có ở P0.1).
**Kết quả mong đợi:** `pnpm install` + test mẫu + e2e mẫu chạy được trên máy anh.
**Dán kết quả vào:** `docs/spikes/S6-env.md` (theo mẫu cuối `docs/SPIKES.md`) hoặc dán nguyên văn log vào chat với ID "T-001".
**Nếu lỗi:** dán nguyên văn thông báo + ảnh chụp; AI sẽ chẩn đoán.

### T-002 · Spike S2 — PLCSIM Advanced "hello" · Chặn: M5 (P5.4/P5.6) · Ước tính: 1 ngày · Cần: PLCSIM Advanced + giấy phép, nhóm `PlcSimUsers`
**Mục đích:** Biết PLCSIM Advanced có làm được lockstep, tên API bulk-I/O, tốc độ và giấy phép không. **Nên làm sớm — quyết định khả thi M5 và giấy phép.**
**Các bước (làm đúng thứ tự):**
1. Cài PLCSIM Advanced, vào nhóm `PlcSimUsers`, tạo 1 instance, tải chương trình mẫu rất nhỏ (OB1 sao chép `%I0.0 → %Q0.0`, một bộ đếm trong DB).
2. AI viết console C# (net48, API bản anh đang cài; đọc manual/header đi kèm): liệt kê instance, `PowerOn/Run`, `UpdateTagList`, đọc/ghi bit & byte vùng, đọc tag symbolic, đặt SingleStep + `RunToNextSyncPoint()` 1000 lần.
3. Đo: RTT một lần trao đổi; số chu kỳ/giây ở lockstep; thời gian `reset`; hành vi khi ghi input (có được lấy ở đầu chu kỳ?).
**Kết quả mong đợi:** Đọc/ghi bit & byte vùng được; `RunToNextSyncPoint()` chạy 1000 lần; có số RTT và chu kỳ/giây.
**Dán kết quả vào:** `docs/spikes/S2-plcsim.md` + `docs/facts/plcsim-api-*.md` (F-xxx `VERIFIED`); hoặc dán nguyên văn log vào chat với ID "T-002".
**Nếu lỗi:** dán nguyên văn thông báo + ảnh chụp; AI sẽ chẩn đoán.

### T-003 · Spike S3 — TIA Openness export · Chặn: P5.7 · Ước tính: 1 ngày · Cần: TIA (Offline), nhóm `Siemens TIA Openness`
**Mục đích:** Biết SimaticML ở bản TIA của anh trông thế nào, để viết parser. **Nên làm sớm — quyết định khả thi M5 và giấy phép.**
**Các bước (làm đúng thứ tự):**
1. Mở TIA ở chế độ Offline, chuẩn bị một dự án nhỏ (SCL + LAD + DB standard + DB optimized + UDT + bảng tag).
2. AI viết exporter tối thiểu (net48, tham chiếu `Siemens.Engineering.dll` của bản anh đang cài) xuất block/UDT/bảng tag + manifest; **không sửa dự án**.
3. Xuất ≥ 10 file SimaticML, đưa vào kho fixture riêng (không commit dữ liệu nhạy cảm).
**Kết quả mong đợi:** ≥ 10 file SimaticML + phát hiện khác biệt phiên bản, ghi vào `docs/facts/simaticml-*.md`.
**Dán kết quả vào:** `docs/spikes/S3-*.md` (theo mẫu cuối `docs/SPIKES.md`) hoặc dán nguyên văn log vào chat với ID "T-003".
**Nếu lỗi:** dán nguyên văn thông báo + ảnh chụp; AI sẽ chẩn đoán.

### T-004 · Spike S5 — SCADA smoke test · Chặn: P4.4 · Ước tính: 0.5 ngày · Cần: SCADA đích
**Mục đích:** Biết SCADA đích nối được server OPC UA mẫu không, chính sách bảo mật nào được chấp nhận.
**Các bước (làm đúng thứ tự):**
1. AI dựng server node-opcua mẫu có vài node `ns=3;s="Tag"` + `"DB"."Member"`, security None và Basic256Sha256.
2. Anh thử kết nối từ SCADA đích, ghi lỗi gặp (chứng chỉ, URI, hostname, policy).
**Kết quả mong đợi:** Kết nối được với ít nhất một policy; danh sách chính sách được chấp nhận.
**Dán kết quả vào:** `docs/spikes/S5-scada.md` hoặc dán nguyên văn lỗi vào chat với ID "T-004".
**Nếu lỗi:** dán nguyên văn thông báo + ảnh chụp; AI sẽ chẩn đoán.

## 3. DỮ LIỆU CẦN CÓ (X)
- [ ] X-001 · Môi trường Windows + công cụ (kết quả spike S6) · cần trước P0.1
- [ ] X-002 · Mã SCL/LAD thật ẩn danh (≥ 10 khối) cho spike S1 · cần trước P1.2
- [ ] X-003 · I/O list thật + quy ước tên tag · cần trước P2.7
- [ ] X-004 · C&E thật + biểu mẫu FAT + cách PLC nhận start/stop/reset · cần trước P3.4–P3.5
- [ ] X-005 · SCADA đích + ví dụ node id/tag + chính sách bảo mật · cần trước P4.4
- [ ] X-006 · Windows có TIA + PLCSIM Advanced (+ giấy phép, nhóm quyền) · cần trước P5.4/P5.6 (spike S2, S3 nên sớm)
- [ ] X-007 · ≥ 10 file SimaticML thật + XSD Openness · cần trước P5.7
- [ ] X-008 · Dự án TIA `VCS_Conformance` · cần trước P5.9

> Ghi chú: file `.github/pull_request_template.md` KHÔNG có mục X mới — chủ sản phẩm đã cung cấp file gốc, AI đã đưa nguyên văn lên nhánh `chore/docs-bootstrap` (commit "docs: add PR template", 1.421 byte, byte-identical).

## 4. THAY ĐỔI SPEC / LỚN (S)

### S-001 · PRD §9 dùng M1–M8 cho lĩnh vực chức năng, trùng số milestone M0–M5 (Spec Change Request) · Nguồn: docs-audit §4 SCR-001, PRD §9 vs §13
**Vấn đề + bằng chứng:** PRD §9 đặt tên lĩnh vực chức năng là M1 (Project & Import), M2 (Controller Runtime), M3 (Coding), M4 (Plant Model), M5 (Test Automation), M6 (Communication Gateway), M7 (HMI), M8 (Điều khiển mô phỏng) — trong khi PRD §13 và toàn bộ spec dùng M0–M5 cho milestone, với M1 = Soft-PLC, M2 = Plant, M3 = Test, M4 = Comms/HMI, M5 = Siemens. Cùng ký hiệu M2 vừa là "Controller Runtime" (§9) vừa là "Plant Engine" (milestone).
**Đề xuất sửa:** Đổi tên các lĩnh vực ở PRD §9 thành F1–F8 (hoặc "FR nhóm 1–8"), giữ nguyên số FR-1xx…FR-8xx; thêm dòng chú thích "M1–M8 ở §9 không phải milestone M0–M5 ở §13".
**Tác động (milestone/prompt/test):** PRD §9 + §14 + mọi chỗ nhắc "M1–M3" theo nghĩa §9; không đổi mã FR, không đổi milestone/spec. Tầng C.
**Quyết định:** [ ] Chấp nhận  [ ] Chấp nhận sửa đổi: …  [ ] Từ chối

### S-002 · Số golden test M1: PRD §13 nói ≥ 60, M1 §16 nói ≥ 80 · Nguồn: docs-audit §4 SCR-002
**Vấn đề + bằng chứng:** PRD §13 (M1): "≥ 60 golden test ngữ nghĩa (mục 16) pass"; M1 §12.2 và §16 mục 2: "≥ 80 golden test + unit test theo bảng 12.2". Cả hai đều là tiêu chí nghiệm thu, không thể cùng đúng.
**Đề xuất sửa:** Lấy M1 spec làm chuẩn (≥ 80 golden + unit test riêng, mỗi test có `expectedFrom`), sửa PRD §13 thành ≥ 80 cho khớp; hoặc nếu anh muốn giữ 60 thì sửa M1 §12.2/§16 xuống 60 và giảm bảng 12.2 tương ứng.
**Tác động (milestone/prompt/test):** M1 §16, §12.2, REVIEW-CHECKLISTS §2 (M1 đã ghi ≥ 80 — khớp M1 spec), PROMPTS G1. Tầng C.
**Quyết định:** [ ] Chấp nhận  [ ] Chấp nhận sửa đổi: …  [ ] Từ chối

### S-003 · Thời lượng M0: PRD §13 nói 1–2 tuần, M0 spec nói 4–6 ngày công · Nguồn: docs-audit §4 SCR-003
**Vấn đề + bằng chứng:** PRD §13: "M0 — Skeleton (1–2 tuần công)"; M0 §1: "Thời lượng dự kiến: 4–6 ngày công". Chênh lệch ~2 lần, ảnh hưởng kế hoạch và cổng G0.
**Đề xuất sửa:** Lấy M0 spec làm chuẩn (4–6 ngày công, là ước lượng chi tiết sau), sửa PRD §13 thành "4–6 ngày công"; hoặc giữ 1–2 tuần nếu tính cả thời gian chờ chủ sản phẩm (S6, quyết định D-001…D-005).
**Tác động (milestone/prompt/test):** PRD §13, STATE.md, kế hoạch P0.1–P0.7. Tầng C (đổi PRD), nhưng có thể quyết nhanh theo mặc định đề xuất.
**Quyết định:** [ ] Chấp nhận  [ ] Chấp nhận sửa đổi: …  [ ] Từ chối

## 5. KÝ DUYỆT MILESTONE (K)
| Milestone | Gói bằng chứng | Mục KIỂM THẬT liên quan | Trạng thái | Ký (ngày/người) |
|---|---|---|---|---|
| M0 | docs/acceptance/M0.md | — | ✔ đã ký 2026-11-24 | 2026-11-24 / Tiến |
| M1 | docs/acceptance/M1.md | VERIFY §14 (PLCSIM/S1, T-002/T-003) | ✔ đã ký 2026-11-25 | 2026-11-25 / Tiến |
| M2 | docs/acceptance/M2.md | X-003 | ☐ | |
| M3 | docs/acceptance/M3.md | X-004 | ☐ | |
| M4 | docs/acceptance/M4.md | T-… (UaExpert/SCADA/Modbus) | ☐ | |
| M5 | docs/acceptance/M5.md | T-… (PLCSIM/TIA) | ☐ | |

## 6. DUYỆT SAU (R) — AI đã chọn mặc định, anh có quyền veto
| ID | Prompt | Điều AI đã quyết | Lý do/ OQ | Veto? |
|---|---|---|---|---|
| R-001 | Bootstrap | Merge PR `chore/docs-bootstrap` → `develop` khi tự rà soát sạch, dù chưa có CI — ngoại lệ duy nhất theo BOOTSTRAP bước 9 | Chưa có CI ở bước bootstrap; PR chỉ chứa tài liệu | ☐ chấp nhận · ☐ đổi thành: |
| R-002 | P0.1 | Viết `package.json` theo mặc định D-002 (A): repo private, `license: UNLICENSED`, tên gói giữ `@vcs/*`, chưa tạo file LICENSE | D-002 đang mở; P0.1 cần `package.json` để cài tooling | ☐ chấp nhận · ☐ đổi thành: |
| R-003 | P1.6 | 15 mặc định tier B (OQ-182…196): LAD theo M1 §5 khi chưa có mã LAD thật (OQ-182); `pos`/`neg` theo R_TRIG/F_TRIG (OQ-183); bảng rlo sau box std, CTUD→QU (OQ-184); box std luôn gọi, box toán chỉ khi EN (OQ-185, golden L); network map = chỉ số body (OQ-186); DB field không địa chỉ trực tiếp (OQ-187); instance DB từ ctx/SCL DATA_BLOCK (OQ-188); temp `__lad_rlo` (OQ-189); export `fbInterfaceStruct` (OQ-190); `Array[lo..hi] of T` (OQ-191); FC/OB không static (OQ-192); diagnostic line=1/col=1 + network id trong message (OQ-193); tên key box IN1/IN2/OUT/… (OQ-194); Const không type → Int, PT bắt buộc `type:'Time'` (OQ-195); local `#name.member` (OQ-196). Không có tier C — plan → triển khai liên tục theo quyết định 2026-11-25. | Các mục ghi VERIFY (OQ-183/184/185) chỉ PLCSIM/S1 mới chốt được; sai thì SCR | ☐ chấp nhận · ☐ đổi thành: |
| R-004 | P1.7 | 20 mặc định tier B (OQ-197…216): X-002/S1 không chặn P1.7 (OQ-197); tag `"NAME"` giải qua ctx tags, không thấy → T001 (OQ-198 — phát hiện: OB1.scl §13 hiện không biên dịch được); quy tắc step runner bảng E (OQ-199); key YAML mở rộng force/snapshot/restore (OQ-200); lỗi runner = GoldenError, exit 0/1/2 (OQ-201); discovery `plc/*.scl` + `*.lad.json` (OQ-202); `vcs run --scans N` (OQ-203); `ir dump <dir>` (OQ-204); `vcs golden run` (OQ-205); WS `plc.*` 10 Hz LWW (OQ-206); `sim.state.plc?` (OQ-207); Build compile-check, không hot reload; Save chỉ trong `plc/` (OQ-208); Monaco + ADR-0008 (OQ-209); heap bench < 1 MB, profile trước (OQ-210); 100 YAML golden (OQ-211); draft VERIFY, không chạy thí nghiệm (OQ-212); không thêm `scanAt` (OQ-213); LAD YAML cần DB SCL trước (OQ-214); layout demo motor-interlock (OQ-215); Watch write/force qua introspection (OQ-216). Không có tier C — plan → triển khai liên tục theo quyết định 2026-11-25. | Bench là rủi ro lớn nhất (smoke P1.4 chỉ ~520 scan/s vs mục tiêu ≥ 1000); nếu 3 lần tối ưu không đạt → dừng, báo + đề xuất thu hẹp (tier C), không hạ ngưỡng | ☐ chấp nhận · ☐ đổi thành: |
| R-005 | P0.9 | 16 mặc định tier B (OQ-218…233): `vite-plugin-pwa@2.0.0` generateSW (OQ-218 — đã kiểm phát hành 2026-10-03, ≥ 14 ngày); navigation fallback → trang offline riêng, không về shell cache (OQ-219); NetworkOnly cho /api, /ws không chạm, POST không cache (OQ-220); precache toàn dist, `maximumFileSizeToCacheInBytes` 5 MB (OQ-221); prompt update, không tự reload; dirty editor → confirm (OQ-222); header `no-cache` cho sw.js + manifest (OQ-223); icon SVG nguồn + PNG sinh bằng Playwright (OQ-224); manifest name/short_name/display/lang vi cố định/theme #111827 (OQ-225); kiosk ẩn header controls + tab PLC Workspace (OQ-226); Fullscreen chỉ từ nút bấm (OQ-227); Wake Lock xin lại khi visible (OQ-228); chặn pull-to-refresh/zoom chỉ khi kiosk (OQ-229); E7.6 update chỉ chạy với `VCS_RUN_PWA_UPDATE=1` (OQ-230); không bật SW ở `vite dev` (OQ-231); offline.html tĩnh song ngữ (OQ-232); `virtual:pwa-register` kiểm depcheck xanh (OQ-233). Không có tier C chặn P0.9 — D-007 (chọn HTTPS cho LAN) là quyết định owner nhưng không chặn vì PWA chạy đủ trên localhost; plan → triển khai liên tục theo quyết định 2026-11-25. | Kiosk trên tablet thật chưa kiểm được ở P0.9 (gate chỉ Chromium desktop) — ghi UNVERIFIED ở semantics §19 + mục kiểm tay trong verify-owner-guide; SW phục vụ shell cũ là rủi ro lớn nhất (giảm bằng prompt-update + e2e profile mới) | ☐ chấp nhận · ☐ đổi thành: |
| R-006 | P2.1 | 18 mặc định tier B (OQ-235…252): hash32 = FNV-1a của `${seed}:${equipmentId}` (OQ-235); seed_i dùng thẳng làm seed mulberry32 (OQ-236); golden vector RNG tính từ định nghĩa thuật toán (OQ-237); khoảng ngược công thức tự xử lý (OQ-238); Real ghi trực tiếp sau fround, PL-W020 1 lần ở validate (OQ-239); delay ring buffer cấp phát lúc inject (OQ-240); terminal fault sau thắng trước, wireBreak thắng stuck (OQ-241); drift tích từ sinceMs (OQ-242); Box–Muller spare cache trong state (OQ-243); PL-W001 chỉ khi plcScanMs có trong config (OQ-244); bench §12 hoãn tới P2.3/P2.4 (OQ-245); fake model chỉ trong test file (OQ-246); EventLog tràn bỏ cũ nhất (OQ-247); validate thuần + constructor fail-fast khi có error (OQ-248); link eng = obs × scale + offset, tự link → PL-E020 (OQ-249); setManual/setSource thấy từ step kế (OQ-250); coverage plant 85 lines (OQ-251); load file plant/*.yaml hoãn tới P2.4 (OQ-252). Không có tier C chặn P2.1 — X-003 chỉ chặn P2.7, không chặn P2.1; plan → triển khai liên tục theo quyết định 2026-11-25. | Adapter scaling và topo sort là rủi ro lớn nhất (sai là sai cả vòng kín P2.4) — giảm bằng bảng A/B ghim tay + property test round-trip + test topo 3 tầng; mất tất định do PRNG/state không serialize hết — giảm bằng snapshot test hash 3 lần | ☐ chấp nhận · ☐ đổi thành: |
| R-007 | P2.2 | 14 mặc định tier B (OQ-253…266): 1 file golden/model, cases[] (OQ-253); cmd/fault/clear áp sau step(t), expect sau step(t) (OQ-254); 1 chuyển đổi/step (OQ-255); speed/current target theo state sau chuyển đổi (OQ-256); expect số ±0.01 mặc định, {approx,eps} ghi đè (OQ-257); harness gán đủ 6 role, currentFb scaling 0..100 A, currentA qua observable (OQ-258); defaultRemote/defaultReady chấp nhận nhưng không ảnh hưởng hành vi — chờ dữ liệu motor thật (OQ-259); EquipmentModel.docs? + cấu trúc md (OQ-260); script docs:equipment + CI --check (OQ-261); yaml@2.9.1 cho @vcs/plant (OQ-262); tripClearedAt mirror FaultManager.clearedAtMs (OQ-263); định dạng fault entry golden (OQ-264); giữ ngưỡng coverage plant 85 (OQ-265); không bench ở P2.2 (OQ-266). Không có tier C chặn P2.2 — X-003 chỉ chặn P2.7, OQ-161 không chạm; plan → triển khai liên tục theo quyết định 2026-11-25. | Rủi ro lớn nhất là sai ngữ nghĩa timing 1 bước (OQ-254/255/256) — giảm bằng 11 bảng tính tay A–K + test ghim t=100; defaultRemote/defaultReady (OQ-259) là điểm duy nhất ghi UNVERIFIED chờ S1/dữ liệu thật | ☐ chấp nhận · ☐ đổi thành: |
| R-008 | P2.3 | 33 mặc định tier B (OQ-268…300): vfd speedFb offset=0 (OQ-268); faultNC vfd default true + ready/remote/vfdFaultOk emit (OQ-269); speedDeviation lệch target (OQ-270); commLoss latch lệnh + speedFb freeze (OQ-271); rampFail đóng băng speed (OQ-272); state vfd + eps 1e-9 (OQ-273); currentA vfd (OQ-274); fault DI valve = OR + faultNC default false (OQ-275); travelTimeout inject (OQ-276); bothCmdPolicy chỉ 'hold' + warn 1 lần (OQ-277); stuckOpen/Closed ép pos 100/0 (OQ-278); slowTravel nhân travelTime (OQ-279); LS valve_ctrl cố định 1% (OQ-280); drift (OQ-281); positionerFail (OQ-282); signalLoss (OQ-283); analog_sensor engMin/engMax/unit bắt buộc (OQ-284); noise Gaussian + presets (OQ-285); initialValue (OQ-286); switch_di kind defaults + threshold default 0 (OQ-287); chatter lật mỗi periodMs (OQ-288); stuck ở mức active (OQ-289); named sources (OQ-290); levelLag + levelHighHigh hyst (OQ-291); conveyor derive + proxy ctx + ring buffer inline (OQ-292); beltBlocked đóng băng delay line (OQ-293); loadTph vs loadSource (OQ-294); harness golden tổng quát (OQ-295); bench plant (OQ-296); OQ-267 fix đo-trước-sửa-sau (OQ-297); damper 3 golden (OQ-298); AO scaling harness 0..100% (OQ-299); ngưỡng/diagnostics không đổi (OQ-300). Không có tier C chặn P2.3 — X-003 chỉ chặn P2.7, OQ-161 không chạm; plan → triển khai liên tục theo quyết định 2026-11-25. | Rủi ro lớn nhất là sai ngữ nghĩa timing/float (bảng A T=300 runFb=true do float; bảng C deadband dừng ở 79.55) — giảm bằng 11 bảng tính tay A–K từ script tham chiếu độc lập /tmp/p23-ref.mjs + test ghim; named sources (OQ-290) là điểm duy nhất chạm nền engine | ☐ chấp nhận · ☐ đổi thành: |
| R-009 | P2.4 | 15 mặc định tier B (OQ-305…319) + 3 mang sang từ P2.3 (OQ-301/302/303): format scenario YAML (OQ-305); hình dạng `vcs plant run` + exit 0/1/2/3 (OQ-306); scenario khai stepMs/plcScanMs, không sửa project ví dụ M1 (OQ-307); chân UI tối thiểu, inspector đầy đủ ở P2.8 (OQ-308); giữ nguyên interface StepCtx khi làm lại vòng nóng (OQ-309); nhóm theo model + fallback khi DAG model có chu trình (OQ-310); spike tsx vs JS biên dịch (OQ-311); `files.plant` mặc định + file thiếu im lặng (OQ-312); config plant lỗi → fail-fast + exit 2 (OQ-313); bench vòng kín 1 SoftPlc × 200 FB dựng in-code (OQ-314); expects kiểm sau bước T đầy đủ (OQ-315); smoke mode không `--scenario` (OQ-316); determinism 2 lần + restore → cùng hash (OQ-317); API server plant (WS `plant.fault.*` + `GET /api/plant` + `GET /api/sim/hash`) (OQ-318); lỗi scenario không mã Diagnostic mới (OQ-319); mang sang: synonym role quy ước hậu tố (OQ-301), state van eps 1e-9 (OQ-302), golden ghim hành vi thật 79.5/0.5 do lượng tử hóa AO (OQ-303). Không có tier C trong plan — điểm quyết định sau commit 6 (hot-loop không đạt ≥ 5000 → dừng, owner chọn trong 3 phương án; bench vòng kín < 1000 do SoftPlc chiếm phần lớn → tier C); plan → triển khai liên tục theo quyết định 2026-11-25. | Rủi ro lớn nhất là bench vòng kín sát ngưỡng theo cấu tạo (SoftPlc 200 FB đã 0,65–0,9 ms trong ngân sách 1,0 ms/bước) — giảm bằng đo phần tách ở commit 3 trước khi tối ưu; rủi ro thứ hai là hot-loop không đạt ×3,85 bằng đổi nội bộ — giảm bằng điểm quyết định tier C sau commit 6 (không hạ ngưỡng im lặng) | ☐ chấp nhận · ☐ đổi thành: |

## 7. Lịch sử (đã xử lý)
| ID | Ngày | Kết quả | Ghi chú |
|---|---|---|---|
