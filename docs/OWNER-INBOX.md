# OWNER-INBOX — Hộp thư của chủ sản phẩm

## Mục lục

- [0. Tóm tắt (AI cập nhật mỗi lần ghi)](#0-tóm-tắt-ai-cập-nhật-mỗi-lần-ghi)
- [1. QUYẾT ĐỊNH (D) — đang mở](#1-quyết-định-d-đang-mở)
  - [D-001 · Bật branch protection cho `main` · Chặn: G0 · Hạn mong muốn: trước P0.1 — ✅ ĐÃ QUYẾT 2026-11-24: chọn A](#d-001-bật-branch-protection-cho-main-chặn-g0-hạn-mong-muốn-trước-p01-đã-quyết-2026-11-24-chọn-a)
  - [D-002 · Giấy phép / tên gói (`@vcs/*`) · Chặn: P0.1 · Hạn mong muốn: trước P0.1 — ✅ ĐÃ QUYẾT 2026-11-27: chọn A](#d-002-giấy-phép-tên-gói-vcs-chặn-p01-hạn-mong-muốn-trước-p01-đã-quyết-2026-11-27-chọn-a)
  - [D-003 · Chính sách dữ liệu khách hàng · Chặn: P2.7 · Hạn mong muốn: trước P2.7 — ✅ ĐÃ QUYẾT 2026-11-27: chọn A](#d-003-chính-sách-dữ-liệu-khách-hàng-chặn-p27-hạn-mong-muốn-trước-p27-đã-quyết-2026-11-27-chọn-a)
  - [D-004 · Nơi chạy mô phỏng (server hay Worker) · Chặn: G0 · Hạn mong muốn: trước P0.6/P1.7 — ✅ ĐÃ QUYẾT 2026-11-24: chọn A (server Node)](#d-004-nơi-chạy-mô-phỏng-server-hay-worker-chặn-g0-hạn-mong-muốn-trước-p06p17-đã-quyết-2026-11-24-chọn-a-server-node)
  - [D-005 · PWA (P0.9) · Chặn: không chặn M0 · Hạn mong muốn: sau M0 — ✅ ĐÃ QUYẾT 2026-11-25: chọn B](#d-005-pwa-p09-chặn-không-chặn-m0-hạn-mong-muốn-sau-m0-đã-quyết-2026-11-25-chọn-b)
  - [D-006 · §16.5 — giữ mã lỗi tách riêng hay gom về U001? · Chặn: không chặn ký M1 · Hạn mong muốn: trước M2 — ✅ ĐÃ QUYẾT 2026-11-27: chọn A](#d-006-165-giữ-mã-lỗi-tách-riêng-hay-gom-về-u001-chặn-không-chặn-ký-m1-hạn-mong-muốn-trước-m2-đã-quyết-2026-11-27-chọn-a)
  - [D-007 · HTTPS cho LAN (PWA trên tablet) — chọn mkcert, reverse proxy, hay chỉ localhost? · Chặn: không chặn P0.9 (PWA chạy đủ trên localhost) · Hạn mong muốn: trước khi dùng tablet witness qua LAN — ✅ ĐÃ QUYẾT 2026-11-27: chọn A (mkcert)](#d-007-https-cho-lan-pwa-trên-tablet-chọn-mkcert-reverse-proxy-hay-chỉ-localhost-chặn-không-chặn-p09-pwa-chạy-đủ-trên-localhost-hạn-mong-muốn-trước-khi-dùng-tablet-witness-qua-lan-đã-quyết-2026-11-27-chọn-a-mkcert)
  - [D-008 · Hot-loop plant không đạt M2 §12 ≥ 5000 bước/s — ✅ ĐÃ QUYẾT 2026-11-26 13:38 +07: làm A+B, hạ ngưỡng theo số đạt được · Chặn: P2.4 (commit 6–12) + nghiệm thu M2](#d-008-hot-loop-plant-không-đạt-m2-12-5000-bướcs-đã-quyết-2026-11-26-1338-07-làm-ab-hạ-ngưỡng-theo-số-đạt-được-chặn-p24-commit-612-nghiệm-thu-m2)
  - [D-009 · Sửa OQ-125 theo bằng chứng TIA — ✅ ĐÃ QUYẾT 2026-11-27: chọn A](#d-009-sửa-oq-125-theo-bằng-chứng-tia-đã-quyết-2026-11-27-chọn-a)
  - [D-010 · Lệch layout so với TIA — hướng xử lý — ✅ ĐÃ QUYẾT 2026-11-27: chọn A](#d-010-lệch-layout-so-với-tia-hướng-xử-lý-đã-quyết-2026-11-27-chọn-a)
- [2. KIỂM THẬT (T) — cần anh chạy trên môi trường thật](#2-kiểm-thật-t-cần-anh-chạy-trên-môi-trường-thật)
  - [T-001 · Spike S6 — kiểm môi trường Windows · Chặn: P0.1 · Ước tính: 30 phút · Cần: máy Windows của anh — ✅ ĐÃ XONG 2026-11-24 23:02 +07](#t-001-spike-s6-kiểm-môi-trường-windows-chặn-p01-ước-tính-30-phút-cần-máy-windows-của-anh-đã-xong-2026-11-24-2302-07)
  - [T-002 · Spike S2 — PLCSIM Advanced "hello" · Chặn: M5 (P5.4/P5.6) · Ước tính: 1 ngày · Cần: PLCSIM Advanced + giấy phép, nhóm `PlcSimUsers`](#t-002-spike-s2-plcsim-advanced-hello-chặn-m5-p54p56-ước-tính-1-ngày-cần-plcsim-advanced-giấy-phép-nhóm-plcsimusers)
  - [T-003 · Spike S3 — TIA Openness export · Chặn: P5.7 · Ước tính: 1 ngày · Cần: TIA (Offline), nhóm `Siemens TIA Openness`](#t-003-spike-s3-tia-openness-export-chặn-p57-ước-tính-1-ngày-cần-tia-offline-nhóm-siemens-tia-openness)
  - [T-004 · Spike S5 — SCADA smoke test · Chặn: P4.4 · Ước tính: 0.5 ngày · Cần: SCADA đích](#t-004-spike-s5-scada-smoke-test-chặn-p44-ước-tính-05-ngày-cần-scada-đích)
- [3. DỮ LIỆU CẦN CÓ (X)](#3-dữ-liệu-cần-có-x)
  - [X-003 · P2.7: cần I/O list thật để đo acceptance suggest ≥ 90% (tier C — chặn nghiệm thu thật, KHÔNG chặn code/merge P2.7) · Hạn mong muốn: trước khi ký M2 (G2) — ✅ ĐÃ QUYẾT B 2026-11-26 21:55](#x-003-p27-cần-io-list-thật-để-đo-acceptance-suggest-90-tier-c-chặn-nghiệm-thu-thật-không-chặn-codemerge-p27-hạn-mong-muốn-trước-khi-ký-m2-g2-đã-quyết-b-2026-11-26-2155)
- [4. THAY ĐỔI SPEC / LỚN (S)](#4-thay-đổi-spec-lớn-s)
  - [S-001 · PRD §9 dùng M1–M8 cho lĩnh vực chức năng, trùng số milestone M0–M5 (Spec Change Request) · Nguồn: docs-audit §4 SCR-001, PRD §9 vs §13](#s-001-prd-9-dùng-m1m8-cho-lĩnh-vực-chức-năng-trùng-số-milestone-m0m5-spec-change-request-nguồn-docs-audit-4-scr-001-prd-9-vs-13)
  - [S-002 · Số golden test M1: PRD §13 nói ≥ 60, M1 §16 nói ≥ 80 · Nguồn: docs-audit §4 SCR-002](#s-002-số-golden-test-m1-prd-13-nói-60-m1-16-nói-80-nguồn-docs-audit-4-scr-002)
  - [S-003 · Thời lượng M0: PRD §13 nói 1–2 tuần, M0 spec nói 4–6 ngày công · Nguồn: docs-audit §4 SCR-003](#s-003-thời-lượng-m0-prd-13-nói-12-tuần-m0-spec-nói-46-ngày-công-nguồn-docs-audit-4-scr-003)
- [5. KÝ DUYỆT MILESTONE (K)](#5-ký-duyệt-milestone-k)
- [6. DUYỆT SAU (R) — AI đã chọn mặc định, anh có quyền veto](#6-duyệt-sau-r-ai-đã-chọn-mặc-định-anh-có-quyền-veto)
- [7. Lịch sử (đã xử lý)](#7-lịch-sử-đã-xử-lý)

> **Chủ sản phẩm chỉ cần đọc file này.** AI ghi vào đây mọi thứ cần anh: quyết định, kiểm thử thật, dữ liệu, thay đổi lớn, ký duyệt. Mỗi mục tự đủ ngữ cảnh để xử lý trong < 2 phút.
> **Cách trả lời:** đánh dấu `[x]` vào lựa chọn (hoặc dán kết quả theo hướng dẫn) rồi commit, hoặc trả lời trong chat với ID mục (ví dụ "D-003: chọn B"). AI sẽ cập nhật trạng thái, ghi vào ADR/OQ nếu cần và gỡ chặn.
> Mục đã xử lý chuyển xuống "Lịch sử" (không xóa). AI gom yêu cầu theo đợt, tối đa 1 lần/ngày làm việc, trừ khi bị chặn hoàn toàn.

Nhãn: **D** QUYẾT ĐỊNH · **T** KIỂM THẬT (PLCSIM/TIA/SCADA/phần cứng) · **X** DỮ LIỆU CẦN CÓ · **S** THAY ĐỔI SPEC/LỚN · **K** KÝ DUYỆT milestone · **R** DUYỆT SAU (tầng B)

## 0. Tóm tắt (AI cập nhật mỗi lần ghi)
- Đang bị chặn bởi: T-002, T-003 (nên làm sớm — quyết định khả thi M5 và giấy phép). X-003 chặn nghiệm thu thật P2.7 (đo acceptance suggest ≥ 90% trên I/O list thật) — không chặn code/merge P2.7; ĐÃ QUYẾT B 2026-11-26 21:55 (hoãn đo, acceptance UNVERIFIED tới khi có dữ liệu). D-001/D-002/D-003/D-004/D-005/D-006/D-007 ĐÃ XONG; M0 ĐÃ KÝ 2026-11-24; M1 ĐÃ KÝ 2026-11-25.
- Việc cần anh trong tuần này: probe FB_Probe (D-010 A — xem `docs/verify-owner-guide.md`); chuẩn bị T-002/T-003 sớm nếu có PLCSIM/TIA; VERIFY §14 với PLCSIM + mã thật (xem `docs/verify-owner-guide.md` mục 3)
- Cập nhật lần cuối: 2026-11-27 (D-009 + D-010 ĐÃ QUYẾT A; OQ-161 ĐÃ ĐÓNG bằng bằng chứng TIA 2026-11-27 — IN_OUT lồng kích thước tự nhiên, code đúng không đổi; OQ-399/OQ-400 mới (SCR: OQ-125 bị bác bỏ + lệch layout rộng hơn); D-002 + D-006 ĐÃ QUYẾT A; D-003 ĐÃ QUYẾT A + D-007 ĐÃ QUYẾT A (mkcert); T-001 ĐÃ XONG 2026-11-24 23:02 +07; P2.8 MERGED PR #39 02:58 +07)
- Nhãn/milestone GitHub (II.7): CHƯA CHẠY — GitHub MCP không có tool tạo nhãn/milestone (46 tool đã kiểm, không có); cần làm qua giao diện GitHub hoặc chủ sản phẩm. Không tự đổi branch protection (D-001).

---

## 1. QUYẾT ĐỊNH (D) — đang mở

### D-001 · Bật branch protection cho `main` · Chặn: G0 · Hạn mong muốn: trước P0.1 — ✅ ĐÃ QUYẾT 2026-11-24: chọn A
**Bối cảnh:** Repo hiện chưa có branch protection. `main` chỉ nhận từ `develop` sau khi anh ký milestone; AI chỉ merge vào `develop`.
**Lựa chọn:**
- [x] A — Bật: `main` yêu cầu PR + CI xanh, cho phép AI push nhánh / tạo PR
- [ ] B — Không bật lúc này, chỉ quy ước bằng miệng
**Đã quyết 2026-11-24: chọn A.** Rule đã tạo 2026-11-24 17:53 +07 (classic branch protection, branch `main`, rule ID 86808264): yêu cầu PR (0 approval), bắt buộc 4 check xanh — check (lint, typecheck, depcheck, diagnostics, cheats), test ubuntu-latest Node 22, test windows-latest Node 22, e2e ubuntu Node 22 — + require up to date, chặn force-push, admin bypass vẫn được. **CẢNH BÁO: GitHub báo rule "Not enforced" vì repo private trên gói free — rule chỉ có hiệu lực khi nâng cấp Team/Enterprise hoặc repo public.** **Chủ sản phẩm quyết 2026-11-24 17:58 +07: chấp nhận hiện trạng (không nâng cấp, không public) — AI tự push `main` khi đã hoàn tất kiểm tra các đánh giá nghiệm thu G0–G5.** Nghĩa thực tế: sau khi gói nghiệm thu của một milestone đã merge vào `develop` VÀ chủ sản phẩm đã ký milestone ở STATE.md §8, AI mở PR `develop` → `main` qua trình duyệt, chờ CI xanh rồi merge (đó là cách duy nhất đẩy `main` qua UI, vì VM không có credential git). AI không push `main` ngoài thời điểm đó.
**Đề xuất của AI:** A, vì đây là hàng rào duy nhất ngăn merge nhầm vào `main` trước khi có CI.
**Hệ quả nếu chọn khác:** B thì `main` có thể bị ghi đè trực tiếp; AI vẫn tự giữ quy tắc không push `main`.
**Việc đang chờ:** P0.1 (CI) và G0 · **Liên quan:** AUTONOMY §5, BOOTSTRAP bước 7

### D-002 · Giấy phép / tên gói (`@vcs/*`) · Chặn: P0.1 · Hạn mong muốn: trước P0.1 — ✅ ĐÃ QUYẾT 2026-11-27: chọn A
**Bối cảnh:** Repo đang public tạm thời (từ 2026-11-26, để mở lại Actions — sẽ về private sau), chưa có file LICENSE; `package.json:34` ghi `"license": "UNLICENSED"`. Tên gói theo spec là `@vcs/*`, lệnh `vcs`.
**Lựa chọn:**
- [x] A — Repo private, proprietary/UNLICENSED, tên gói giữ nguyên `@vcs/*`
- [ ] B — Chọn giấy phép khác: …
**✅ ĐÃ QUYẾT 2026-11-27: chọn A.** Giữ nguyên UNLICENSED: `package.json` không đổi, không thêm file LICENSE. R-002 (P0.1 làm theo mặc định A) nay được chốt chính thức. Nếu sau này anh muốn mở mã thì quyết lại (thêm file LICENSE MIT/Apache-2.0 + sửa `package.json`).
**Hệ quả nếu chọn khác:** B thì cần ghi LICENSE tương ứng trước P0.1.
**Việc đang chờ:** P0.1 · **Liên quan:** BOOTSTRAP bước 7

**Phân tích (bổ sung 2026-11-27, theo yêu cầu của anh):**

*Hiện trạng đã kiểm chứng:* `package.json` ghi `"license": "UNLICENSED"`, repo **không có file LICENSE** (P0.1 làm theo mặc định A, R-002). UNLICENSED ở đây không phải là một giấy phép — nó là cách npm ghi "chưa cấp phép gì cả".

**Câu 1 — A (UNLICENSED) thì anh có dùng được trong công việc của mình không?**
- **Được, thoải mái.** Theo mặc định của luật bản quyền, tác giả là chủ bản quyền toàn bộ code của dự án mình — không có giấy phép nào hạn chế chính chủ sở hữu. Anh dùng nội bộ, chạy demo, giao cho hệ thống của khách, sửa code — đều được.
- **Hạn chế duy nhất của A là với người khác, không phải với anh:** không ai khác (đồng nghiệp ngoài dự án, nhà thầu, khách hàng, người xem repo) có quyền dùng/sao chép/sửa/phân phối code này nếu anh không cho phép bằng văn bản riêng. Muốn đưa code cho khách hay cộng tác viên thì cần cấp phép riêng theo từng trường hợp (hợp đồng/thỏa thuận).
- **Lưu ý repo đang public tạm thời:** ai cũng xem được code, nhưng UNLICENSED nghĩa là xem được ≠ dùng được — họ không có quyền pháp lý để tái sử dụng. Khi anh chuyển repo về private thì điểm này hết.

**Câu 2 — Nếu chọn B (giấy phép nguồn mở) thì sao?**
- Giấy phép nguồn mở là anh **chủ động cho phép mọi người** dùng/sao chép/sửa/phân phối code, kèm điều kiện của từng loại:
  - **MIT (đơn giản nhất):** ai cũng dùng được, kể cả mục đích thương mại; chỉ cần giữ lại dòng bản quyền của anh. Đối thủ cũng dùng được.
  - **Apache-2.0:** như MIT, cộng thêm điều khoản bằng sáng chế (người dùng không được kiện anh về patent liên quan) + phải ghi rõ chỗ nào đã sửa.
  - **GPL (copyleft):** ai phân phối bản sửa đổi thì phải mở mã nguồn bản đó — ràng buộc mạnh, dễ xung đột với việc giao hệ thống đóng cho khách; không khuyến nghị cho VCS.
- **Việc phải làm nếu chọn B:** thêm file `LICENSE` (toàn văn giấy phép) + sửa `package.json` `"license"` thành `MIT`/`Apache-2.0` + ghi chú ngắn vào README. Thay đổi nhỏ, làm trong 1 commit.
- **Không quay lại được hoàn toàn:** code đã phát hành dưới MIT thì các bản sao đã phát đi vẫn giữ quyền MIT — anh chỉ có thể đổi giấy phép cho phiên bản sau (và chỉ khi anh là chủ toàn bộ bản quyền; nếu có người khác đóng góp thì cần họ đồng ý).
- **Rủi ro riêng của VCS:** code có phần tích hợp Siemens (S7/TIA/Openness) — kiến thức lấy từ manual/API của Siemens có thể chịu điều khoản của Siemens. Trước khi mở mã, anh nên rà soát xem có đoạn nào sao chép tài liệu/API độc quyền của Siemens không. Đây là lý do AI đề xuất A.

**Đề xuất của AI (giữ nguyên):** A — cho tới khi anh có nhu cầu cụ thể muốn chia sẻ code công khai (vd công bố dự án, nhận đóng góp cộng đồng). Khi đó chọn MIT, trừ khi cần điều khoản patent thì Apache-2.0.
> Đây là thông tin chung về bản quyền, không phải tư vấn pháp lý.

### D-003 · Chính sách dữ liệu khách hàng · Chặn: P2.7 · Hạn mong muốn: trước P2.7 — ✅ ĐÃ QUYẾT 2026-11-27: chọn A
**Bối cảnh:** Các prompt P2.7, P3.5, P4.4, P5.7 cần dữ liệu thật (I/O list, C&E, SimaticML, SCADA). Dữ liệu thật không được vào repo hay công cụ AI nếu chưa ẩn danh.
**Lựa chọn:**
- [x] A — KHÔNG đưa dữ liệu thật vào công cụ AI / repo; chỉ dữ liệu ẩn danh đặt ở `fixtures-real/` (đã .gitignore) hoặc kho riêng
- [ ] B — Cho phép dùng dữ liệu thật có giới hạn: …
**✅ ĐÃ QUYẾT 2026-11-27: chọn A.** Dữ liệu thật chỉ được dùng sau khi ẩn danh (xóa/đổi tên khách hàng, tên dự án, IP, ghi chú nội bộ; giữ nguyên cấu trúc cột + tên tag/thiết bị + mô tả), đặt ở `fixtures-real/` (đã .gitignore — không vào repo) hoặc kho riêng; AI chỉ đọc trong VM, không commit. Áp dụng cho X-003…X-008 (I/O list, C&E, SimaticML, SCADA). X-003 hiện đang chọn B (hoãn, 2026-11-26) — không đổi; khi nào có file thật thì phải ẩn danh theo A mới được đưa vào. Không đổi spec (AMENDMENTS E8 đã ghi nguyên tắc này). Nếu hợp đồng khách hàng yêu cầu khác thì quyết lại (mở B).
**Đề xuất của AI:** A, vì đây là dữ liệu khách hàng + dự án TIA.
**Hệ quả nếu chọn khác:** B thì cần quy tắc ẩn danh + kho lưu trữ cụ thể trước khi đưa.
**Việc đang chờ:** X-003…X-008 · **Liên quan:** AGENTS §8, BOOTSTRAP bước 7

### D-004 · Nơi chạy mô phỏng (server hay Worker) · Chặn: G0 · Hạn mong muốn: trước P0.6/P1.7 — ✅ ĐÃ QUYẾT 2026-11-24: chọn A (server Node)
**Bối cảnh:** M1 §11 từng nói SoftPlc chạy trong Web Worker; AMENDMENTS A10/E6 đã đổi mặc định thành server Node, Worker chỉ là tùy chọn sau (M0 §17 mục 4).
**Lựa chọn:**
- [x] A — Server Node (mặc định), Worker không cần
- [ ] B — Worker (cần nêu lý do: …)
**Đã quyết 2026-11-24: chọn A (server Node).** Khớp mặc định A10/E6 đã triển khai khắp P0.5/P0.6.
**Đề xuất của AI:** A, theo A10/E6 và vì UI đã qua WebSocket.
**Hệ quả nếu chọn khác:** B thì P0.6/P1.7 phải làm thêm transport Worker.
**Việc đang chờ:** P0.6, P1.7 · **Liên quan:** AMENDMENTS A10/E6, OQ-004

### D-005 · PWA (P0.9) · Chặn: không chặn M0 · Hạn mong muốn: sau M0 — ✅ ĐÃ QUYẾT 2026-11-25: chọn B
**Bối cảnh:** P0.9 là prompt tùy chọn (PWA shell), ngoài spec; nếu làm cần quyết HTTPS cho LAN.
**Lựa chọn:**
- [ ] A — Hoãn tới sau M0 (mặc định)
- [x] B — Làm ở P0.9, cần quyết HTTPS cho LAN trước
**Đã quyết 2026-11-25: chọn B.** Chủ sản phẩm yêu cầu làm P0.9 ngay sau khi ký M1. HTTPS cho LAN: P0.9 ghi ADR đề xuất phương án (mkcert/reverse proxy) vào OWNER-INBOX mục D, KHÔNG tự đổi bind mặc định.
**Đề xuất của AI:** A, để M0 không bị kéo dài.
**Hệ quả nếu chọn khác:** B thì cần anh quyết cách cấp chứng chỉ HTTPS cho LAN.
**Việc đang chờ:** P0.9 · **Liên quan:** BOOTSTRAP bước 7, SKILL-ui-pwa-hmi §9

### D-006 · §16.5 — giữ mã lỗi tách riêng hay gom về U001? · Chặn: không chặn ký M1 · Hạn mong muốn: trước M2 — ✅ ĐÃ QUYẾT 2026-11-27: chọn A
**Bối cảnh:** Chữ spec §16.5 viết "SCL-U001" cho mọi lệnh chưa hỗ trợ, nhưng thực tế đã kiểm chứng bằng probe (đều lỗi ồn ào, có vị trí, exit 2 — không gì chạy sai im lặng): `String` → SCL-U001 (3:7); `POINTER`/`ANY` → SCL-T001 "kiểu chưa biết"; mảng nhiều chiều/`GOTO` → SCL-P002. Chỉ M1 §17 quy định String → U001; các trường hợp còn lại rơi vào nhánh lỗi kiểu/cú pháp trước khi tới U001. Xem `docs/acceptance/M1.md` §16.5 và `docs/verify-owner-guide.md` mục 6.
**Lựa chọn:**
- [x] A — Giữ nguyên, chỉ ghi anh chấp nhận phạm vi mã này, không sửa code
- [ ] B — SCR gom mọi cấu trúc ngoài EBNF về một mã U001 (đổi spec + sửa parser, làm ở phase sau)
**✅ ĐÃ QUYẾT 2026-11-27: chọn A** (kèm sửa 1 câu chữ spec cho đúng 3 mã — SCR chỉ đổi tài liệu, không sửa code). Đã làm: M1 spec §16.5 câu 5 viết lại thành "báo lỗi ồn ào kèm vị trí — mã `SCL-U001` cho cấu trúc biết tên nhưng chưa hỗ trợ, `SCL-T001` cho kiểu chưa biết, `SCL-P002` cho cú pháp ngoài EBNF"; ghi AMENDMENTS **D9**. Không đổi parser, không đổi test/golden.
**Đề xuất của AI:** A, vì mọi trường hợp đều đã ồn ào + có vị trí; gom mã chỉ đổi tên lỗi, không tăng an toàn.
**Hệ quả nếu chọn khác:** B thì cần SCR + sửa parser ở phase sau.
**Việc đang chờ:** M1 đã ký (giữ mặc định) · **Liên quan:** M1 §16.5, OQ-102

**Phân tích lại (bổ sung 2026-11-27, theo yêu cầu của anh — đọc kỹ trước khi quyết):**

**1. Chữ spec viết gì (tài liệu gốc):**
- M1 spec §16.5 (dòng 721, mục tiêu chí nghiệm thu): "Không có 'bỏ qua im lặng': lệnh/từ khóa chưa hỗ trợ cho lỗi `SCL-U001 unsupported: <tên>` kèm vị trí." Đọc theo chữ: mọi thứ chưa hỗ trợ đều về U001.
- M1 spec §17 + bảng §4.2 (dòng 741): chỉ quy định riêng `String` → `SCL-U001` ("String: không hỗ trợ (lỗi rõ ràng)"); các kiểu khác không có trong EBNF §4.2 thì không được gọi tên ở đây.
- `docs/acceptance/M1.md` §16.5 + `docs/verify-owner-guide.md` mục 6: đã ghi rõ phạm vi mã thực tế (xem bảng dưới).

**2. Thực tế đã kiểm chứng bằng probe (không phải suy đoán):**

| Cấu trúc | Mã thực tế | Vị trí | Exit | Ghi chú |
|---|---|---|---|---|
| `String`/`WString` | SCL-U001 | 3:7 | 2 | đúng chữ spec; OQ-102 đã đóng (P1.2) |
| `POINTER`/`ANY` | SCL-T001 "kiểu chưa biết" | 3:7 | 2 | tên kiểu không có trong EBNF §4.2 → nhánh named-type báo T001 trước khi tới U001 |
| Mảng nhiều chiều | SCL-P002 | 3:17 + 3:31 | 2 | lỗi cú pháp — không parse được, chưa tới bước phân loại "chưa hỗ trợ" |
| `GOTO` | SCL-P002 | 3:8 | 2 | như trên |

Cả 5 probe đều lỗi ồn ào, có vị trí, exit 2 — không có gì chạy sai im lặng. Đây là điểm M1 §16.5 thực sự yêu cầu, và nó ĐẠT. Mã U001 chỉ có 1 emitter duy nhất trong SCL (`packages/vendor-siemens/src/scl/parser.ts:733`); LAD có mã riêng `LAD-U001` (ngoài phạm vi M1 §5). Mã đăng ký trong catalog (`packages/schemas/src/diagnostics-catalog.ts:178`).

**3. Vậy mâu thuẫn nằm ở đâu?**
Không phải code sai — code làm đúng "lỗi ồn ào + vị trí". Mâu thuẫn là **chữ spec nói rộng hơn thực tế**: §16.5 viết U001 cho "mọi lệnh/từ khóa chưa hỗ trợ", nhưng parser phân loại lỗi theo tầng: kiểu lạ → T001 (lỗi kiểu), cú pháp không parse được → P002 (lỗi cú pháp), chỉ cấu trúc "biết tên nhưng chưa hỗ trợ" (String) → U001. Ba mã này cho người dùng **nhiều thông tin hơn** một mã duy nhất: T001 = "kiểu này không tồn tại trong SCL chuẩn mà tôi biết", P002 = "cú pháp này không đúng ngữ pháp", U001 = "biết cấu trúc này nhưng M1 chưa hỗ trợ".

**4. Lựa chọn:**
- **A — Giữ nguyên (AI vẫn đề xuất):** không sửa code, chỉ ghi anh chấp nhận phạm vi mã như hiện tại. Ý nghĩa: người dùng thấy 3 mã khác nhau tùy loại lỗi; tài liệu (M1.md §16.5) đã ghi rõ phạm vi. Chi phí: 0. Hạn chế duy nhất: chữ spec §16.5 vẫn viết rộng hơn thực tế — cần sửa 1 câu chữ spec cho đúng (xem mục 5), không phải sửa parser.
- **B — SCR gom mọi cấu trúc ngoài EBNF về một mã U001:** đổi spec + sửa parser ở phase sau. Ý nghĩa: mọi thứ chưa hỗ trợ đều báo U001 — gọn trong tài liệu người dùng (1 mã để tra). Cái giá phải trả: (a) mất độ chi tiết chẩn đoán — T001/P002 hiện phân biệt "kiểu lạ" / "sai cú pháp" / "chưa hỗ trợ", gom lại thì người dùng phải đọc message mới phân biệt được; (b) sửa parser không tầm thường — `GOTO`/mảng nhiều chiều hiện lỗi ở tầng cú pháp P002, muốn báo U001 thì parser phải nhận diện được "đây là cấu trúc có thật nhưng chưa hỗ trợ" giữa vô số lỗi cú pháp khác, dễ báo nhầm; (c) churn test — các golden/probe đang ghim T001/P002 cho những trường hợp này phải sửa theo, kể cả test của P1.2/P1.3; (d) LAD-U001 đã tách riêng — gom SCL không chạm LAD, vẫn còn 2 mã.

**5. Đề xuất của AI (cập nhật):** chọn **A**, kèm **sửa 1 câu chữ spec** (SCR chỉ đổi tài liệu, không sửa code): M1 §16.5 viết lại thành "lệnh/từ khóa chưa hỗ trợ báo lỗi ồn ào kèm vị trí — mã U001 cho cấu trúc biết tên nhưng chưa hỗ trợ, T001 cho kiểu chưa biết, P002 cho cú pháp ngoài EBNF". Như vậy spec đúng với thực tế đã kiểm chứng, không tốn công sửa parser, không mất độ chi tiết. Nếu anh chọn B thì AI mở SCR + sửa parser ở phase sau (M2 không chạm phần này).

### D-007 · HTTPS cho LAN (PWA trên tablet) — chọn mkcert, reverse proxy, hay chỉ localhost? · Chặn: không chặn P0.9 (PWA chạy đủ trên localhost) · Hạn mong muốn: trước khi dùng tablet witness qua LAN — ✅ ĐÃ QUYẾT 2026-11-27: chọn A (mkcert)
**Bối cảnh:** Service worker chỉ chạy trên secure context (HTTPS hoặc `localhost`). `vcs serve` mặc định bind `127.0.0.1` nên trên máy chủ thì PWA chạy đủ. Nhưng tablet witness truy cập qua `http://192.168.x.x` thì **không** phải secure context → SW không đăng ký, không cài PWA được. P0.9 viết ADR-0009 đề xuất phương án (bảng so sánh trong STATE §23 bảng A); P0.9 **không** đổi bind mặc định, **không** thêm TLS vào server — việc đó làm sau khi anh chọn.
**Lựa chọn:**
- [x] A — mkcert (AI đề xuất): `mkcert -install` 1 lần trên máy chủ + `mkcert <tên-máy/IP-LAN>` tạo cert; server thêm TLS sau; cài CA root mkcert lên từng tablet 1 lần
- [ ] B — Reverse proxy TLS (Caddy/nginx): proxy terminate TLS trước server, passthrough `wss://`; không sửa code server
- [ ] C — Chỉ localhost: không LAN PWA; tablet dùng trình duyệt thường qua http, witness xem qua máy chủ/remote desktop
**✅ ĐÃ QUYẾT 2026-11-27: chọn A (mkcert).** Việc tiếp theo (không trong P0.9, làm riêng sau): (1) `mkcert -install` 1 lần trên máy chủ; (2) `mkcert <tên-máy/IP-LAN>` tạo cert; (3) server đọc cert/key qua env (`VCS_TLS_CERT`/`VCS_TLS_KEY` hoặc tương đương) khi được cấu hình — mặc định vẫn HTTP + bind `127.0.0.1`; (4) cài CA root mkcert lên từng tablet 1 lần; (5) gia hạn cert theo chu kỳ mkcert. WS đã tự chọn `wss:` khi `https:` nên không sửa code web. ADR-0009 đã cập nhật trạng thái đã quyết. Nếu triển khai gặp vấn đề (tablet vẫn không đăng ký được SW dù đã cài CA) → xem lại B (reverse proxy) — đã ghi trong ADR-0009.
**Đề xuất của AI:** A, vì 1 lệnh, không thêm service chạy thường trực; cert tin cậy nội bộ sau khi cài CA.
**Hệ quả nếu chọn khác:** B thì thêm 1 service cần vận hành + cấu hình proxy (đặc biệt passthrough WebSocket); C thì mất offline/update/kiosk trên tablet. Dù chọn A hay B đều cần thêm TLS vào server/proxy sau (việc riêng, không trong P0.9).
**Việc đang chờ:** P0.9 xong; chờ triển khai TLS theo quyết định A (việc riêng sau P0.9) · **Liên quan:** D-005, STATE §23 bảng A, skill UI §9

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

### D-009 · Sửa OQ-125 theo bằng chứng TIA — ✅ ĐÃ QUYẾT 2026-11-27: chọn A
**Bối cảnh:** OQ-125 (đã đóng 2026-11-25) quyết IN_OUT top-level là slot DInt 4 byte, ẩn, đọc → T005 (M1 §3.5 + `resolveDb`). Bằng chứng TIA 2026-11-27 của anh (DB_Sub, CPU 1511-1 PN): `io: Int` @4.0, 2 byte, hiện trong DB, `s` @6.0 — IN_OUT top-level cũng kích thước tự nhiên. Nhà mình sai: DB_Sub 10 byte vs TIA 7 byte, đọc `DB_Sub.io` báo T005 sai.
**Lựa chọn:**
- [x] A — Sửa ngay phase nhỏ: `resolveDb` layout IN_OUT theo kích thước tự nhiên + hiện field; sửa M1 §3.5 + AMENDMENTS (SCR OQ-399); cập nhật test ghim slot/T005. Bảng P không đổi.
- [ ] B — Hoãn sang M2/sau, ghi UNVERIFIED, giữ hành vi sai đã biết.
**Đã quyết 2026-11-27: chọn A — triển khai phase nhỏ (plan → implement → gate → PR → merge).**
**Đề xuất của AI:** A, vì nhỏ, rõ phạm vi, và để lại layout sai đã biết trong M1 đã ký là đúng kiểu lỗi im lặng.
**Hệ quả nếu chọn khác:** B thì mọi DB của FB có IN_OUT top-level vẫn sai 3 byte + đọc field IN_OUT vẫn T005 sai tới khi sửa.
**Việc đang chờ:** ✅ Đã quyết A 2026-11-27 — phase nhỏ đang triển khai · **Liên quan:** OQ-399, OQ-125, M1 §3.5, `typecheck.ts: resolveDb`

### D-010 · Lệch layout so với TIA — hướng xử lý — ✅ ĐÃ QUYẾT 2026-11-27: chọn A
**Bối cảnh:** Bằng chứng TIA 2026-11-27 (DB_Motor/DB_Sub): layout nhà mình lệch TIA ở 4 điểm — Bool interface gói bit vs mỗi Bool 1 byte + căn chẵn; TON 18 vs 16 byte; CTU 10 vs 6 byte (thiếu CD/LD/QD); tổng DB_Motor 38 vs 33, DB_Sub 10 vs 7. Quy tắc tổng quát chưa chốt được từ 2 DB này (section-based hay căn chẵn tối thiểu đều khớp).
**Lựa chọn:**
- [x] A — Probe thêm: anh tạo 1 FB đa kiểu trên TIA (DInt/Real/LReal/Array/UDT/nhiều Bool) rồi gửi offset; AI chốt quy tắc + lập phase viết lại §3.4/defs + golden theo bằng chứng.
- [ ] B — Hoãn, ghi UNVERIFIED ở semantics §12, tiếp tục M2; layout lệch vẫn tồn tại.
**Đã quyết 2026-11-27: chọn A — anh làm probe FB_Probe theo hướng dẫn ở `docs/verify-owner-guide.md` (mục mới trong "Các mục verify sau này"), gửi offset về; AI chốt quy tắc + lập phase viết lại layout.**
**Đề xuất của AI:** A, vì sửa khi chưa biết quy tắc tổng quát có thể ra model sai lần hai; probe chỉ tốn ~10 phút của anh.
**Hệ quả nếu chọn khác:** B thì mọi thứ đọc DB theo địa chỉ tuyệt đối tiếp tục lệch tới 5 byte/DB.
**Việc đang chờ:** ✅ Đã quyết A 2026-11-27 — chờ anh probe FB_Probe (xem `docs/verify-owner-guide.md`) · **Liên quan:** OQ-400, M1 §3.4/§3.5/§9, `runtime-iec/src/std/defs.ts`, `runtime-iec/src/layout.ts`

## 2. KIỂM THẬT (T) — cần anh chạy trên môi trường thật

### T-001 · Spike S6 — kiểm môi trường Windows · Chặn: P0.1 · Ước tính: 30 phút · Cần: máy Windows của anh — ✅ ĐÃ XONG 2026-11-24 23:02 +07
**Mục đích:** Biết máy anh dựng được repo không (Node, pnpm, Playwright, cổng, .NET SDK).
**Các bước (làm đúng thứ tự):**
1. Chạy `node scripts/doctor.mjs` (AI viết ở P0.1; trước đó chạy tay: `node --version`, `pnpm --version`, `git --version`, `dotnet --info`).
2. Kiểm cổng 4170/4840/1502 còn rảnh; kiểm `git config core.autocrlf`.
3. Chạy `pnpm install` + một test mẫu + một e2e mẫu (khi có ở P0.1).
**Kết quả mong đợi:** `pnpm install` + test mẫu + e2e mẫu chạy được trên máy anh.
**Dán kết quả vào:** `docs/spikes/S6-env.md` (theo mẫu cuối `docs/SPIKES.md`) hoặc dán nguyên văn log vào chat với ID "T-001".
**Nếu lỗi:** dán nguyên văn thông báo + ảnh chụp; AI sẽ chẩn đoán.
**✅ ĐÃ XONG 2026-11-24 23:02 +07 — chủ sản phẩm chạy trên máy Windows thật, báo kết quả trong chat 22:45 +07 (log `user-chat/main.md`):**
- Demo 2.1–2.4: OK; hash `--hash` trùng Linux (`21096ab2…1d53`): OK.
- `doctor.mjs`: Node/pnpm/git OK; cổng 4170 bận (do server demo của anh còn chạy), 4840 bận (app khác — cổng OPC UA, M0 chưa cần), 1502 rảnh.
- `pnpm test` lần 1: 437/439 — 2 lỗi thật do repo đặt trong `C:\Users\Admin\Downloads\PLC simulate\VCS` (đường dẫn có dấu cách, shell chẻ đối số) — OQ-074; fix PR #16 (bọc đường dẫn trong ngoặc kép, 2 dòng test) merge 23:00 +07.
- `pnpm test` lần 2 (sau fix): **439/439** — xong, anh ký M0 ngay sau đó (STATE §8).
- **Còn thiếu (ghi rõ, không chặn):** e2e mẫu trên máy Windows thật chưa chạy (CI e2e chỉ chạy ubuntu); trạng thái .NET SDK + Playwright trên máy anh chưa được báo cáo. Hai mục này gộp vào mục gate Windows cho M1 ở `docs/verify-owner-guide.md` §4 khi nào anh chạy.

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

### X-003 · P2.7: cần I/O list thật để đo acceptance suggest ≥ 90% (tier C — chặn nghiệm thu thật, KHÔNG chặn code/merge P2.7) · Hạn mong muốn: trước khi ký M2 (G2) — ✅ ĐÃ QUYẾT B 2026-11-26 21:55
**Bối cảnh:** P2.7 đã cài xong engine auto-suggest (§9) và đo được trên fixture tổng hợp 300 tín hiệu (177 có ground truth). Nhưng fixture chỉ là xấp xỉ quy ước tên thật (M2 §16 mục 1, AMENDMENTS E8): số ≥ 90% trên fixture KHÔNG chứng minh được 90% trên dữ liệu thật. Cần I/O list thật (đã ẩn danh theo D-003) để đo acceptance và hiệu chỉnh `naming.yaml`/synonym.
**Cần anh cung cấp (chọn 1 trong 2 cách):**
- [ ] A — File I/O list thật (1–2 dự án, đã ẩn danh: xóa/đổi tên khách hàng, tên dự án, IP, ghi chú nội bộ; giữ nguyên cấu trúc cột + tên tag/thiết bị + mô tả): định dạng XLSX hoặc CSV, ≥ 100 tín hiệu, có cột tag / mô tả / loại / địa chỉ (cột equipment nếu có càng tốt) + file `naming.yaml` hoặc mô tả quy ước đặt tên đang dùng (vd tiền tố thiết bị, hậu tố role). Đặt file vào `fixtures-real/` (đã .gitignore — không vào repo) hoặc gửi qua kênh riêng; AI chỉ đọc trong VM, không commit.
- [x] B — Chưa có file lúc này: P2.7 merge với bằng chứng fixture, acceptance thật ghi UNVERIFIED tới khi có dữ liệu (M2 ký sau). **← ĐÃ CHỌN 2026-11-26 21:55.**
**Cách AI dùng:** chạy `vcs suggest` trên file thật, so equipment+role với ground truth do anh xác nhận (AI in bảng, anh duyệt/tick đúng-sai hoặc đưa file đối chiếu); pass khi ≥ 90% tín hiệu và ≥ 95% thiết bị đúng (§11.3); nếu < 90% thì AI chỉnh `naming.yaml`/synonym (đổi dữ liệu, không đổi thuật toán) rồi đo lại. Kết quả ghi vào `docs/acceptance/M2.md`.
**Đề xuất của AI:** A, vì đây là dữ liệu quan trọng nhất để M2 sát thực tế (M2 §16 mục 1); B chỉ hoãn việc đo, không hoãn code.
**Việc đang chờ:** P2.7 (plan §31, OQ-380) · **Liên quan:** D-003 (chính sách dữ liệu — chưa quyết), STATE §31, OQ-374/380
**Quyết định 2026-11-26 21:55 (owner chọn B):** chưa có file lúc này — hoãn đo acceptance; P2.7 merge với bằng chứng fixture, acceptance thật UNVERIFIED tới khi có dữ liệu, M2 ký sau. OQ-380 giữ MỞ. P2.7 không đo/không hiệu chỉnh theo dữ liệu thật.
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

| R-010 | P2.8 | 17 mặc định tier B (OQ-382…398): session import trong bộ nhớ server, UUID, hết hạn 30 phút (OQ-382); upload base64 JSON, chỉ .xlsx/.csv, cap 20 MB, không thêm @fastify/multipart (OQ-383); KHÔNG hot reload — commit ghi file + banner khởi động lại server, e2e restart process (OQ-384); Tag Manager đọc GET /api/tags từ đĩa, Watch join equipment/role theo tên (OQ-385); form params từ GET /api/plant/models serialize zod server-side (OQ-386); eng do server tính bằng adapter, không scaling → chỉ raw (OQ-387); WS mới plant.manual.set/plant.source.set, additive (OQ-388); Event log ≤ 100 dòng, poll 1 s (OQ-389); "sửa nhanh" IO-W002 = chấp nhận tên đã làm sạch trong session (OQ-390); **quyết OQ-381: thêm `FB` vào synonyms runFb (chỉ runFb), đo lại harness (giữ 175/177) + CLI motor-interlock (OQ-391)**; apply thiếu params/range: auto-fill engMin/engMax/unit từ scaling của tag khi có, switch_di kind chặn + dropdown (OQ-392); không thêm @testing-library/jsdom — UI test bằng e2e (OQ-393); e2e parity ngữ nghĩa (không hash) + restart server giữa commit và run (OQ-394); Watch thêm cột equipment/role + sửa cosmetic Ghi/Force ở 1280 px (OQ-395); kiosk ẩn tab import/plant (OQ-396); học roleOverrides: confirm dialog trước khi ghi naming.yaml (OQ-397); GET /api/project equipment shape {id, model, roles: [{role, tag}]} (OQ-398, B9). Không có tier C chặn bắt đầu P2.8; TC-1/TC-2/TC-3 là điểm dừng có điều kiện (STATE §32). | Quyết sai ở OQ-384 (reload vs restart) → UX commit khác kỳ vọng — giảm bằng banner rõ + e2e chứng minh luồng restart; quyết sai ở OQ-391 (FB) → suggest lệch — giảm bằng đo lại harness bắt buộc giữ số. **Đã triển khai xong P2.8 commit 1–9, gate xanh local 2026-11-26 (test 2910/2910, e2e p28 8/8); OQ-381 + OQ-382…398 đã đóng trong open-questions.md — chờ anh duyệt sau (không tick thay).** | ☐ chấp nhận · ☐ đổi thành: |

## 7. Lịch sử (đã xử lý)
| ID | Ngày | Kết quả | Ghi chú |
|---|---|---|---|
