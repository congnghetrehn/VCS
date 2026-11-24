# Câu hỏi mở và giả định (open-questions)

> AI **ghi vào đây** mọi mơ hồ/giả định/sai khác so với spec thay vì tự quyết im lặng. Chủ sản phẩm quyết định và cập nhật cột "Quyết định". Mục đã quyết giữ lại (không xóa) để truy vết; nếu ảnh hưởng kiến trúc → thêm ADR.
> Tham chiếu trong mã: `TODO(OQ-012)`.

| ID | Ngày | Nguồn (prompt/spec §) | Câu hỏi / giả định | Mặc định đã dùng | Tác động nếu sai | Trạng thái | Quyết định (ngày, người) |
|---|---|---|---|---|---|---|---|
| OQ-001 | 2026-11-24 | Audit SCR-001, PRD §9 vs §13 | PRD §9 dùng M1–M8 cho lĩnh vực chức năng, trùng số milestone M0–M5 — đổi tên lĩnh vực thành F1–F8? | Chưa đổi; tiếp tục theo spec hiện hành, đọc §9 theo ngữ cảnh | Đọc PRD §9 và PROMPTS song song dễ nhầm M2 = Controller Runtime vs Plant Engine | ☐ mở | |
| OQ-002 | 2026-11-24 | Audit SCR-002, PRD §13 vs M1 §16 | Số golden test M1 là ≥ 60 (PRD) hay ≥ 80 (M1 spec)? | Lấy M1 spec làm chuẩn (≥ 80 golden + unit test riêng) | Tiêu chí nghiệm thu G1 sai nếu lấy nhầm số | ☐ mở | |
| OQ-003 | 2026-11-24 | Audit SCR-003, PRD §13 vs M0 §1 | Thời lượng M0 là 1–2 tuần (PRD) hay 4–6 ngày công (M0 spec)? | Lấy M0 spec làm chuẩn (4–6 ngày công) | Kế hoạch P0.1–P0.7 và cổng G0 lệch ~2 lần | ☐ mở | |
| OQ-004 | 2026-11-24 | AMENDMENTS E6, D-004, M1 §11 | Mô phỏng chạy ở server Node hay Web Worker? | Server Node (A10); Worker chỉ là tùy chọn sau | P0.6/P1.7 phải làm thêm transport Worker nếu chọn B | ☐ mở | |
| OQ-005 | 2026-11-24 | Audit §3, A-01…A-03 | Tham chiếu gãy `M0 §17.4`, ký hiệu `AGENTS §9.7`, ví dụ `D-007` dùng ID chưa tồn tại | Đã sửa cơ học: `M0 §17 mục 4`, `AGENTS §9 mục 7`, ví dụ `D-003` | Không còn — chỉ là ký hiệu, không đổi ngữ nghĩa | ✔ đã quyết | Đã sửa ở commit "fix(docs): mechanical reference fixes", 2026-11-24 |

## Mẫu một mục tốt
- **Câu hỏi:** Chỉ số mảng ngoài khoảng khi **ghi** — PLC thật bỏ qua hay đưa CPU vào STOP?
- **Nguồn:** P1.4, M1 §7.2 (VERIFY), thí nghiệm E13.
- **Mặc định đã dùng:** bỏ qua ghi + `RuntimeFault ARRAY_RANGE`, CPU tiếp tục chạy.
- **Tác động nếu sai:** logic phụ thuộc hành vi lỗi sẽ khác PLC thật; ảnh hưởng độ tin cậy FAT.
- **Cách xác minh:** chạy thí nghiệm E13 trên PLCSIM (M5 §10).

## Phân loại ưu tiên khi anh rà soát
1. **Chặn** prompt kế tiếp (ngữ nghĩa lõi, dữ liệu thật còn thiếu) → quyết trước khi tiếp tục.
2. **Có mặc định an toàn** (VERIFY) → ghi nhận, xác minh bằng PLCSIM sau.
3. **Cosmetic/UX** → gom lại, quyết theo đợt.
