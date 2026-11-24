# ADR-0001: Package JIT + monorepo pnpm + Turborepo

- **Trạng thái:** đã chấp nhận
- **Ngày:** 2026-11-24
- **Người quyết định:** chủ sản phẩm · **Người đề xuất:** AI (P0.1)
- **Liên quan:** M0 §3.1–3.4, PR #8

## Bối cảnh
M0 cần nhiều package (`schemas`, `kernel`, `project`, `test-utils`, …) và app
(`cli`, `server`, `web`) chia sẻ kiểu + schema, build/test/lint thống nhất,
chạy được trên Windows và Linux. Cần chọn cấu trúc repo trước khi viết logic.

## Các lựa chọn đã xem xét
| Lựa chọn | Ưu | Nhược | Rủi ro |
|---|---|---|---|
| A. Monorepo pnpm + Turborepo, package JIT (`exports` → `src/index.ts`) | Không bước build riêng cho package nội bộ; sửa package thấy ngay ở app; lockfile chung | Lỗi kiểu xuyên package chỉ lộ ở `typecheck` toàn repo | Thấp — `typecheck` chạy ở CI |
| B. Mỗi package build ra `dist` riêng | Rõ ràng như thư viện ngoài | Chậm (build nối tiếp), dễ quên build sau khi sửa | Trung bình — sai lệch dist/source |
| C. Một package duy nhất | Đơn giản nhất lúc đầu | Không tách được ranh giới (kernel không được import project) | Cao — phá đồ thị §3.5 |

## Quyết định
Chọn **A**: monorepo pnpm + Turborepo; package nội bộ JIT (`exports` trỏ
`src/index.ts`); chỉ `apps/*` bundle bằng `tsup` khi cần chạy độc lập.
Ranh giới ép bằng dependency-cruiser theo M0 §3.5 (`pnpm depcheck`).

## Hệ quả
- Tốt: sửa `schemas`/`kernel` thấy ngay ở `server`/`cli` không cần build; một
  lockfile, một lệnh gate cho cả repo.
- Phải trả giá: `pnpm install` trong VM bị EPERM (OQ-007) — cài trong bản sao
  `/tmp` rồi copy lockfile về; CI là bằng chứng cài đặt chính.
- Việc phải làm theo: package mới phải khai báo `exports` + đồ thị cho phép
  (§3.5) + test (xem `docs/architecture.md` §10).
- Cách phát hiện nếu quyết định sai: thời gian `typecheck`/`test` tăng vọt
  theo số package; khi đó cân nhắc build riêng cho package ổn định.

## Ghi chú xác minh
Không có. Đã kiểm bằng CI xanh qua PR #8–#13 (check + test ubuntu/windows).
