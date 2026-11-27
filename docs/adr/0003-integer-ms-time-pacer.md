# ADR-0003: Thời gian nguyên ms + Pacer tách biệt

## Mục lục

- [Bối cảnh](#bối-cảnh)
- [Các lựa chọn đã xem xét](#các-lựa-chọn-đã-xem-xét)
- [Quyết định](#quyết-định)
- [Hệ quả](#hệ-quả)
- [Ghi chú xác minh](#ghi-chú-xác-minh)

- **Trạng thái:** đã chấp nhận
- **Ngày:** 2026-11-24
- **Người quyết định:** chủ sản phẩm · **Người đề xuất:** AI (P0.3–P0.4)
- **Liên quan:** M0 §6.1, §6.4, §16; AMENDMENTS A5; OQ-022; PR #10, PR #11

## Bối cảnh
Mô phỏng phải tất định (cùng cấu hình + seed + đầu vào ⇒ cùng kết quả) và
kiểm được bằng golden timeline tính tay. Cần quy ước thời gian + cơ chế điều
tốc mà không làm logic mô phỏng phụ thuộc đồng hồ thật.

## Các lựa chọn đã xem xét
| Lựa chọn | Ưu | Nhược | Rủi ro |
|---|---|---|---|
| A. Thời gian nguyên ms (`SimClock`); tốc độ thuộc `Pacer` riêng | Số nguyên dễ tính tay, dễ hash; logic không biết wall time; test dùng `ManualClock`/đồng hồ giả | Phải viết `Pacer.plan()` (spec không cho công thức — OQ-022) | Thấp — công thức đã test 12 test |
| B. `SimClock.setTimeScale` (PRD 8.4) | Ít code hơn | Đồng hồ vừa giữ thời gian vừa giữ tốc độ → logic lẫn tốc độ; khó test tất định | Trung bình — vi phạm tách biệt |
| C. Thời gian thực `number` (float ms) | Tự nhiên với JS | Sai số float tích lũy; golden timeline khó tính tay chính xác | Cao — hash tất định mong manh |

## Quyết định
Chọn **A**: thời gian mô phỏng là **số nguyên ms**; `SimClock` chỉ giữ thời
gian (`nowMs`/`advance`/`reset`/`snapshot`/`restore`); **bỏ**
`SimClock.setTimeScale` (A5). Tốc độ chạy thuộc `Pacer` — nhận hàm `now()`
wall từ ngoài, `plan()` tính số bước mỗi lát để bám `timeScale` (số hoặc
`'max'`), tôn trọng `sliceBudgetMs` (8 ms), tụt quá `maxLagMs` (1 000 ms) thì
đặt lại mốc (`lagging = true`) thay vì đuổi vô hạn (OQ-022).

## Hệ quả
- Tốt: orchestrator không có timer/đồng hồ thật; golden T1–T8 tính tay bằng
  số nguyên; `timeScale` đổi không đổi kết quả (test ghim hash §15.6).
- Phải trả giá: `Pacer.plan()` là công thức tự định nghĩa (OQ-022) — phải giữ
  test của nó; đổi công thức là đổi hành vi tốc độ (không đổi logic).
- Việc phải làm theo: mọi timer/PLC/plant dùng sim time; `Date.now` chỉ ở
  `apps/*` (lint chặn ở package lõi, có test probe).
- Cách phát hiện nếu quyết định sai: golden timeline lệch do làm tròn/lỗi
  float (không xảy ra với số nguyên); drift `timeScale max` vượt 50 ms trên
  máy yên (A18: đo p95 6–7 ms).

## Ghi chú xác minh
Không có. Đã kiểm: `ManualClock` 5 test, `Pacer` 12 test, golden T1–T8.
