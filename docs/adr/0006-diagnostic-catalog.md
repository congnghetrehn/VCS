# ADR-0006: Diagnostic + catalog mã, tài liệu sinh tự động

- **Trạng thái:** đã chấp nhận
- **Ngày:** 2026-11-24
- **Người quyết định:** chủ sản phẩm · **Người đề xuất:** AI (P0.2)
- **Liên quan:** M0 §4, §15.9; AMENDMENTS D6, D8; PR #9

## Bối cảnh
Mọi lỗi người dùng (YAML sai, schema sai, tag sai, WS sai, component lỗi)
phải nêu **mã + vị trí/đối tượng + hướng sửa** và phải tra được trong tài
liệu. Cần cơ chế để mã lỗi không bị bịa lung tung và docs không lệch code.

## Các lựa chọn đã xem xét
| Lựa chọn | Ưu | Nhược | Rủi ro |
|---|---|---|---|
| A. `DiagnosticCatalog` (đăng ký mã tập trung) + `docs/diagnostics.md` sinh tự động từ catalog (`pnpm docs:diagnostics`, CI `--check`) | Một nguồn sự thật; docs lệch code → CI đỏ; thêm mã = thêm test | Thêm bước regen khi thêm mã | Thấp — script đã có từ P0.2 |
| B. Mã lỗi là chuỗi tự do ở chỗ ném | Nhanh | Không kiểm được mã có tồn tại; docs viết tay dễ lệch | Cao — lỗi im lặng, mã sai |
| C. Docs viết tay, review bằng mắt | Không cần script | Lệch sau vài PR | Cao — đã từng lệch ở bootstrap |

## Quyết định
Chọn **A**: mọi mã mới (PRJ/SIM/TAG/WS/…) đăng ký ở `DiagnosticCatalog`
(D6); `Diagnostic { code, severity, message, file?, line?, col?, hint? }`;
`docs/diagnostics.md` **sinh tự động** (D8 — không sửa tay), CI chạy
`--check` (mã chưa đăng ký hoặc docs lệch → fail). Mỗi mã phát ra có ≥ 1 test.

## Hệ quả
- Tốt: 24 mã ở M0 (PRJ 12 E + 2 W, SIM 3 E + 1 W, TAG 3, WS 3), docs luôn
  khớp code qua mọi PR (#9–#13).
- Phải trả giá: thêm mã chẩn đoán phải chạy lại script regen + commit file
  sinh (đúng quy trình, không phải "sửa tay").
- Việc phải làm theo: xem `docs/architecture.md` §10 (thêm mã → đăng ký →
  regen → test).
- Cách phát hiện nếu quyết định sai: CI `--check` đỏ liên tục vì script
  không ổn định (chưa xảy ra); mã lỗi thiếu `hint` hữu ích (review ở PR).

## Ghi chú xác minh
Không có. Đã kiểm: `pnpm docs:diagnostics --check` khớp qua mọi PR.
