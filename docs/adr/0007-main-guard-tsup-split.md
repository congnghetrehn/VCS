# ADR-0007: Tách `main()` ra `main.ts`, `index.ts` export-only (main-guard + tsup)

- **Trạng thái:** đã chấp nhận
- **Ngày:** 2026-11-24
- **Người quyết định:** chủ sản phẩm · **Người đề xuất:** AI (P0.5)
- **Liên quan:** M0 §11 (ngoài 6 ADR — xem OQ-071); PR #12

## Bối cảnh
`apps/server/src/index.ts` vừa là entry thư viện (export `createServer`,
`SimulationService`, …) vừa chứa main-guard chạy `main()` khi là entry.
Khi `@vcs/server` bị bundle vào CLI bằng tsup, `import.meta.url` là file
dist của CLI nên main-guard chạy `main()` với argv của CLI và thoát mã 3 ở
lệnh `vcs version`. Cần tách để entry thư viện không có side-effect.

## Các lựa chọn đã xem xét
| Lựa chọn | Ưu | Nhược | Rủi ro |
|---|---|---|---|
| A. Tách `main()` ra `main.ts`; `index.ts` export-only | Entry thư viện sạch; CLI bundle không chạy nhầm main | Thêm 1 file entry | Thấp — đã kiểm bằng smoke `vcs version`/`serve` |
| B. Giữ main-guard trong `index.ts`, sửa điều kiện guard | Ít file hơn | Guard phải phân biệt "đang chạy trực tiếp" với "đang bị bundle" — mong manh theo bundler | Trung bình — dễ tái phát khi đổi bundler |
| C. Bỏ bundle server vào CLI (CLI gọi server qua `tsx` source) | Không cần tách | CLI chạy chậm hơn, phụ thuộc source | Thấp — nhưng đổi cách phân phối CLI |

## Quyết định
Chọn **A**: `apps/server/src/main.ts` chứa `main()` (điểm vào khi chạy
server độc lập); `apps/server/src/index.ts` chỉ export, không side-effect.
tsup: `external: ['yaml']` (server) và fastify/* ở CLI để bundle không nhúng
thư viện nặng. (Ghi chú: đây là ADR thứ 7, ngoài 6 ADR của M0 §11 — OQ-071:
7 ⊇ 6, mỗi ADR một quyết định nên không gộp vào 0002.)

## Hệ quả
- Tốt: `vcs version`/`validate`/`run`/`serve` chạy đúng sau bundle; smoke
  test dist xanh (server dist 1,1 MB, CLI 3,13 MB ở P0.5).
- Phải trả giá: 2 entry cho server (`main.ts` chạy, `index.ts` import) —
  người mới dễ nhầm khi thêm code khởi động.
- Việc phải làm theo: code khởi động chỉ viết ở `main.ts`; không thêm
  side-effect vào `index.ts` của bất kỳ package/app nào.
- Cách phát hiện nếu quyết định sai: smoke `vcs version` sau `pnpm build`
  thoát khác 0, hoặc import `@vcs/server` chạy side-effect (test import
  sẽ lộ).

## Ghi chú xác minh
Không có. Đã kiểm: build + dist smoke ở P0.5 (PR #12).
