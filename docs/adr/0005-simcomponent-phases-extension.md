# ADR-0005: SimComponent/phases/extension + lỗi `throw`/`isolate`

- **Trạng thái:** đã chấp nhận
- **Ngày:** 2026-11-24
- **Người quyết định:** chủ sản phẩm · **Người đề xuất:** AI (P0.4)
- **Liên quan:** M0 §6.6–6.8; OQ-021…OQ-024, OQ-029, OQ-030; PR #11

## Bối cảnh
M0 cần orchestrator chạy được plant/controller/gateway của các milestone sau
(M1 SoftPlc, M2 PlantEngine, M4 comms) mà không sửa kernel mỗi lần thêm
loại component. Cần giao diện component + cơ chế đăng ký + chính sách lỗi
thống nhất.

## Các lựa chọn đã xem xét
| Lựa chọn | Ưu | Nhược | Rủi ro |
|---|---|---|---|
| A. `SimComponent` (`step`/`reset`/`snapshot`/`restore`) + 3 pha cố định (`plant`/`controllers`/`gateways`) + extension đăng ký factory/component | Thêm loại mới = thêm extension, không sửa orchestrator; thứ tự pha cố định nên golden tính tay được | Pha cố định (không thêm pha mới không sửa kernel) | Thấp — 3 pha đã bao quát M1–M4 |
| B. Mỗi loại component có orchestrator riêng | Linh hoạt | Trùng lặp logic bước/flush/snapshot; khó giữ thứ tự liên pha | Cao — phá tính tay timeline |
| C. Component tự đăng ký qua global registry | Ít code nối | Khó kiểm soát thứ tự, khó test (trạng thái toàn cục) | Trung bình — vi phạm tách biệt |

## Quyết định
Chọn **A**: giao diện `SimComponent` tối thiểu (`id`, `step(T, dt)`,
`reset()`, `snapshot()`/`restore()` JSON-serializable, bắt buộc);
`ControllerAdapter` thêm `kind`/`init`/`getDiagnostics()`. Orchestrator chạy
3 pha cố định theo thứ tự đăng ký; `createSimulation` nhận interface cấu
trúc `SimulationProject` (OQ-030 — kernel không import `@vcs/project`).
Extension (`apply(ctx)`) đăng ký factory/component; `apps/cli` +
`apps/server` tập hợp extension ở **một chỗ** (`extensions.ts`).
Lỗi component: policy `'throw'` (mặc định; CLI) lan truyền
`SimComponentError`; `'isolate'` (server) đánh dấu faulted + `SIM-E001`,
không sập. `step()` trả `void | Promise<void>`: đường đồng bộ gặp Promise →
`SIM-E002`; đường async `await` tuần tự.

## Hệ quả
- Tốt: M1/M2/M4 thêm extension mà không sửa orchestrator; `snapshotAll`/
  `restoreAll`/`resetAll` làm việc trên mọi component qua cùng giao diện.
- Phải trả giá: component phải implement `snapshot`/`restore` (kể cả demo);
  snapshot không tương thích (tập id khác) → `SIM-E003`.
- Việc phải làm theo: component mới phải có test thứ tự pha + snapshot
  round-trip + lỗi (throw/isolate) trước khi đăng ký extension.
- Cách phát hiện nếu quyết định sai: milestone sau cần pha thứ 4 hoặc
  component cần chạy song song (async hiện tuần tự) → khi đó mới xem lại.

## Ghi chú xác minh
Không có. Đã kiểm: golden T1–T8, 33 test orchestrator, 12 test builder.
