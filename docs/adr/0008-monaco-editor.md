# ADR-0008: Editor SCL dùng `monaco-editor` (P1.7)

- **Trạng thái:** đã chấp nhận
- **Ngày:** 2026-11-25
- **Người quyết định:** AI (P1.7, plan STATE §22 — dep lớn cần ADR theo AGENTS.md §5) · **Người đề xuất:** AI (P1.7)
- **Liên quan:** M1 §11 (editor SCL tối thiểu); STATE §22 OQ-209; PR P1.7

## Bối cảnh
P1.7 cần editor SCL tối thiểu trong web PLC Workspace (xem/sửa file `plc/`,
highlight cú pháp). Các lựa chọn: dùng `monaco-editor` (editor của VS Code),
viết editor riêng trên `<textarea>`, hoặc dùng editor nhẹ khác (CodeMirror).
`monaco-editor` là dependency lớn (~vài MB bundle) nên cần ADR.

## Các lựa chọn đã xem xét
| Lựa chọn | Ưu | Nhược | Rủi ro |
|---|---|---|---|
| A. `monaco-editor@0.57.0` (ghim) | Editor chuẩn VS Code; Monarch highlight SCL sẵn có; worker tách thread | Bundle lớn (~2–3 MB); chỉ dùng 1 phần nhỏ tính năng | Trung bình — build Vite/Windows có thể gặp vấn đề (OQ-209: gặp → dừng, báo, không tự đổi sang textarea) |
| B. `<textarea>` tự viết highlight | Không thêm dep; bundle nhỏ | Không có highlight/gutter/folding thật; phải tự viết caret + scroll sync — dễ sai | Cao — tốn công, chất lượng thấp |
| C. CodeMirror 6 | Nhẹ hơn Monaco; modular | Thêm dep mới + API khác; highlight SCL vẫn phải tự viết Monarch tương đương | Trung bình — không rẻ hơn A bao nhiêu |

## Quyết định
Chọn **A**: `monaco-editor@0.57.0` (phát hành 2026-09-24 — thỏa quy tắc
≥ 14 ngày; 0.58.0 ra 2026-11-23, mới 2 ngày nên KHÔNG dùng). Nạp lười
(dynamic import) để trang Tags không phải tải Monaco; worker qua Vite
`?worker`; Monarch SCL tối thiểu (từ khóa, comment, chuỗi, số, `#local`) —
không IntelliSense/completion (ngoài phạm vi P1.7).

## Hệ quả
- Tốt: editor đầy đủ (gutter, undo, tìm kiếm) với ít code tự viết; highlight
  SCL đúng quy ước viết hoa của mẫu M1 §13.
- Phải trả giá: bundle web tăng vài MB (chỉ tải khi mở tab PLC — dynamic
  import); lockfile +1 dep.
- Việc phải làm theo: không import `monaco-editor` tĩnh ở entry web; mọi
  thay đổi editor qua `PlcEditor.tsx`; nếu build gặp vấn đề → dừng, báo
  (OQ-209).
- Cách phát hiện nếu quyết định sai: `pnpm build` ở `apps/web` lỗi, hoặc
  e2e E6 (mở tab PLC) fail; khi đó xem lại lựa chọn B/C.
