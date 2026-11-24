# Đóng góp cho VCS

Luật làm việc: đọc `AGENTS.md` trước mọi thứ (≤ 120 dòng, trỏ tới PRD/spec/skill).
Tài liệu khởi động: `docs/KIT.md`. Trạng thái dự án: `docs/STATE.md`.
Việc cần chủ sản phẩm: `docs/OWNER-INBOX.md`.

Quy tắc ngắn gọn:

- Một prompt = một nhánh = một PR vào `develop`. Không push trực tiếp `main`.
- Chạy gate trước khi báo xong: `pnpm lint && pnpm typecheck && pnpm depcheck && pnpm test && pnpm review:cheats`.
- Không sửa kỳ vọng/golden để qua gate. Không stub im lặng — cái chưa làm phải lộ ra bằng lỗi có mã.
- Mọi lỗi người dùng là `Diagnostic` có mã + vị trí + hướng sửa.
- Mơ hồ/giả định ghi vào `docs/open-questions.md`, quyết định kiến trúc ghi ADR (`docs/adr/`).
