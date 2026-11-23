# Câu hỏi mở và giả định (open-questions)

> AI **ghi vào đây** mọi mơ hồ/giả định/sai khác so với spec thay vì tự quyết im lặng. Chủ sản phẩm quyết định và cập nhật cột "Quyết định". Mục đã quyết giữ lại (không xóa) để truy vết; nếu ảnh hưởng kiến trúc → thêm ADR.
> Tham chiếu trong mã: `TODO(OQ-012)`.

| ID | Ngày | Nguồn (prompt/spec §) | Câu hỏi / giả định | Mặc định đã dùng | Tác động nếu sai | Trạng thái | Quyết định (ngày, người) |
|---|---|---|---|---|---|---|---|
| OQ-001 | | | | | | ☐ mở / ✔ đã quyết | |

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
