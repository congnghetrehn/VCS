# OWNER-INBOX — Hộp thư của chủ sản phẩm

> **Chủ sản phẩm chỉ cần đọc file này.** AI ghi vào đây mọi thứ cần anh: quyết định, kiểm thử thật, dữ liệu, thay đổi lớn, ký duyệt. Mỗi mục tự đủ ngữ cảnh để xử lý trong < 2 phút.
> **Cách trả lời:** đánh dấu `[x]` vào lựa chọn (hoặc dán kết quả theo hướng dẫn) rồi commit, hoặc trả lời trong chat với ID mục (ví dụ "D-003: chọn B"). AI sẽ cập nhật trạng thái, ghi vào ADR/OQ nếu cần và gỡ chặn.
> Mục đã xử lý chuyển xuống "Lịch sử" (không xóa). AI gom yêu cầu theo đợt, tối đa 1 lần/ngày làm việc, trừ khi bị chặn hoàn toàn.

Nhãn: **D** QUYẾT ĐỊNH · **T** KIỂM THẬT (PLCSIM/TIA/SCADA/phần cứng) · **X** DỮ LIỆU CẦN CÓ · **S** THAY ĐỔI SPEC/LỚN · **K** KÝ DUYỆT milestone · **R** DUYỆT SAU (tầng B)

## 0. Tóm tắt (AI cập nhật mỗi lần ghi)
- Đang bị chặn bởi: — (liệt kê ID)
- Việc cần anh trong tuần này: — 
- Cập nhật lần cuối: YYYY-MM-DD

---

## 1. QUYẾT ĐỊNH (D) — đang mở
<!-- Mẫu:
### D-001 · <tiêu đề ngắn> · Chặn: P?.? · Hạn mong muốn: <ngày/ "trước P2.7"> · Issue: #
**Bối cảnh:** 2–3 dòng.
**Lựa chọn:**
- [ ] A — … (ưu/nhược)
- [ ] B — …
- [ ] C — …
**Đề xuất của AI:** A, vì …
**Hệ quả nếu chọn khác:** …
**Việc đang chờ:** …  ·  **Liên quan:** spec §…, OQ-…, ADR-…
-->
(chưa có)

## 2. KIỂM THẬT (T) — cần anh chạy trên môi trường thật
<!-- Mẫu:
### T-001 · <tiêu đề> · Chặn: P?.? · Ước tính: 30 phút · Cần: TIA V21 + PLCSIM Advanced V8
**Mục đích:** …
**Các bước (làm đúng thứ tự):**
1. …
2. …
**Kết quả mong đợi:** …
**Dán kết quả vào:** `docs/spikes/Sx-….md` (mẫu) hoặc `fixtures-real/…` (KHÔNG commit dữ liệu nhạy cảm)
**Nếu lỗi:** dán nguyên văn thông báo + ảnh chụp; AI sẽ chẩn đoán.
-->
(chưa có)

## 3. DỮ LIỆU CẦN CÓ (X)
<!-- Mẫu:
### X-001 · I/O list thật (ẩn danh) · Cần trước: P2.7 · Tình trạng: ☐ chưa có
**Cần:** file Excel/CSV … · **Ẩn danh:** thay tên dự án/khách hàng/ tag nhạy cảm theo quy tắc … · **Đặt ở:** `fixtures-real/` (đã .gitignore) hoặc kho riêng
**Dùng để:** tinh chỉnh `naming.yaml`, synonym, kiểm precision auto-suggest
**Phương án tạm AI đang dùng:** fixture tổng hợp (giới hạn: …)
-->
- [ ] X-001 · Môi trường Windows + công cụ (kết quả spike S6) · cần trước P0.1
- [ ] X-002 · Mã SCL/LAD thật ẩn danh (≥ 10 khối) cho spike S1 · cần trước P1.2
- [ ] X-003 · I/O list thật + quy ước tên tag · cần trước P2.7
- [ ] X-004 · C&E thật + biểu mẫu FAT + cách PLC nhận start/stop/reset · cần trước P3.4–P3.5
- [ ] X-005 · SCADA đích + ví dụ node id/tag + chính sách bảo mật · cần trước P4.4
- [ ] X-006 · Windows có TIA + PLCSIM Advanced (+ giấy phép, nhóm quyền) · cần trước P5.4/P5.6 (spike S2, S3 nên sớm)
- [ ] X-007 · ≥ 10 file SimaticML thật + XSD Openness · cần trước P5.7
- [ ] X-008 · Dự án TIA `VCS_Conformance` · cần trước P5.9

## 4. THAY ĐỔI SPEC / LỚN (S)
<!-- Mẫu:
### S-001 · <tiêu đề> (Spec Change Request) · Nguồn: P?.?, spec §…
**Vấn đề + bằng chứng:** …  **Đề xuất sửa:** …  **Tác động (milestone/prompt/test):** …
**Quyết định:** [ ] Chấp nhận  [ ] Chấp nhận sửa đổi: …  [ ] Từ chối
-->
(chưa có)

## 5. KÝ DUYỆT MILESTONE (K)
| Milestone | Gói bằng chứng | Mục KIỂM THẬT liên quan | Trạng thái | Ký (ngày/người) |
|---|---|---|---|---|
| M0 | docs/acceptance/M0.md | — | ☐ chưa yêu cầu | |
| M1 | docs/acceptance/M1.md | T-… | ☐ | |
| M2 | docs/acceptance/M2.md | X-003 | ☐ | |
| M3 | docs/acceptance/M3.md | X-004 | ☐ | |
| M4 | docs/acceptance/M4.md | T-… (UaExpert/SCADA/Modbus) | ☐ | |
| M5 | docs/acceptance/M5.md | T-… (PLCSIM/TIA) | ☐ | |

## 6. DUYỆT SAU (R) — AI đã chọn mặc định, anh có quyền veto
| ID | Prompt | Điều AI đã quyết | Lý do/ OQ | Veto? |
|---|---|---|---|---|
| | | | | ☐ chấp nhận · ☐ đổi thành: |

## 7. Lịch sử (đã xử lý)
| ID | Ngày | Kết quả | Ghi chú |
|---|---|---|---|
