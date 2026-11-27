# ADR-0002: Mô phỏng chạy trong server Node, UI qua WebSocket

## Mục lục

- [Bối cảnh](#bối-cảnh)
- [Các lựa chọn đã xem xét](#các-lựa-chọn-đã-xem-xét)
- [Quyết định](#quyết-định)
- [Hệ quả](#hệ-quả)
- [Ghi chú xác minh](#ghi-chú-xác-minh)

- **Trạng thái:** đã chấp nhận
- **Ngày:** 2026-11-24
- **Người quyết định:** chủ sản phẩm · **Người đề xuất:** AI (P0.5)
- **Liên quan:** M0 §8.2, §9, §16, §17 mục 4; AMENDMENTS A10, D-004; PRD 8.4; PR #12

## Bối cảnh
PRD nói kernel "isomorphic" và M1 §11 nhắc Web Worker; nhưng M0 cần demo
end-to-end nhanh (server + web + CLI dùng chung một orchestrator), và logic
mô phỏng không được phụ thuộc DOM/browser. Cần chọn nơi chạy mô phỏng ở M0.

## Các lựa chọn đã xem xét
| Lựa chọn | Ưu | Nhược | Rủi ro |
|---|---|---|---|
| A. Server Node (1 process: nạp dự án, mô phỏng, sau này cả truyền thông); UI qua WS | Một runtime duy nhất cho CLI/server/web; `Date.now`/timer chỉ ở `apps/*`; test dùng client `ws` thật | Cần server đang chạy mới xem được web | Thấp — `vcs serve` là một lệnh |
| B. Web Worker trong trình duyệt | Web chạy độc lập, không cần server | Kernel phải chạy được trong Worker ngay từ M0; CLI vẫn cần runtime riêng → 2 đường chạy | Cao — trùng lặp, khó tất định |
| C. Cả hai (server mặc định + Worker tùy chọn) | Linh hoạt | Gấp đôi công việc ở M0 | Cao — ngoài phạm vi M0 |

## Quyết định
Chọn **A**: mô phỏng chạy trong server Node; UI giao tiếp WebSocket theo
schema zod chung (`@vcs/schemas/protocol`, `PROTOCOL_VERSION = 1`).
Worker transport là **tùy chọn sau** (A10, E6, M0 §17 mục 4) — chỉ làm khi
chủ sản phẩm yêu cầu. Giao thức trừu tượng nên sau này đổi transport không
đổi ngữ nghĩa mô phỏng.

## Hệ quả
- Tốt: `apps/cli` (`vcs run`) và `apps/server` dùng chung
  `SimulationOrchestrator` + `SimulationService`; e2e kiểm đúng server thật.
- Phải trả giá: web không chạy offline khi không có server; M1 phải giữ giao
  thức ổn định nếu thêm Worker.
- Việc phải làm theo: mọi tính năng mô phỏng mới viết ở `kernel`/`server`,
  không viết logic mô phỏng trong `apps/web` (web chỉ import `schemas`).
- Cách phát hiện nếu quyết định sai: chủ sản phẩm yêu cầu chạy web độc lập
  không cần server (M0 §17 mục 4) → khi đó mới làm Worker transport.

## Ghi chú xác minh
Không có. Đã kiểm: e2e E1–E5 xanh (P0.6), `vcs serve` phục vụ web tĩnh.
