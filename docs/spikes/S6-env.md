# S6 — Môi trường (kết quả chạy `scripts/doctor.mjs`)

> Mẫu theo `docs/SPIKES.md` §S6. Đây mới là kết quả trên **Linux VM của AI** —
> phần chạy trên **máy Windows của chủ sản phẩm (T-001) vẫn đang chờ**.

## 1. Máy VM (AI) — 2026-11-24

Lệnh: `node scripts/doctor.mjs` (thoát 1 — 1 kiểm tra bắt buộc lỗi: thiếu binary pnpm).

| Kiểm tra | Kết quả |
|---|---|
| Node.js >= 20.11 | OK — v24.22.1 |
| pnpm (packageManager pnpm@10.15.0) | **FAIL — không thấy lệnh `pnpm`** (cũng không có `corepack`). Dùng được qua `npx -y pnpm@10.15.0` (10.15.0, đã chạy) |
| git | OK — 2.43.0 |
| Quyền ghi thư mục repo | OK |
| Cổng 4170 / 4840 / 1502 | OK — cả 3 đều rảnh |
| Playwright (cho e2e P0.6) | Chưa cài (tùy chọn ở P0.1) |
| .NET SDK | **Thiếu** (tùy chọn ở M0; cần cho `tools/` ở P5.3) |
| git core.autocrlf | Chưa đặt — trên Windows nên đặt `false` để giữ LF |
| os.tmpdir() ghi được | OK — /tmp |

## 2. Quirk phát hiện trên VM (xem OQ-007)

`pnpm install` / `pnpm add` trong `~/workspace/vcs` (btrfs `/home/hatch`) luôn lỗi
cuối `EPERM: operation not permitted, chown '<file tạm>'` (exit 255) — đã xác minh
bằng strace: pnpm gọi `chown(<file tạm>, 0, 65534)` và bị EPERM, trong khi chown
trực tiếp bằng Node/shell lúc được lúc không. Hậu quả:

- `pnpm-lock.yaml` phải sinh trong bản sao ở `/tmp/vcs-lock` (ở đó pnpm ghi được,
  exit 0) rồi chép về `~/workspace/vcs` (đã kiểm: không dính đường dẫn tuyệt đối).
- `node_modules` vẫn cài đủ, nhưng link workspace `@vcs/*` phải tạo tay bằng `ln -s`
  (7 link) vì install dừng trước bước link.
- `pnpm install --frozen-lockfile` **CHƯA CHẠY ĐƯỢC trong VM này** — phải kiểm lại
  trên CI và máy Windows trước khi tin gate.

## 3. Còn chờ (T-001 — chủ sản phẩm chạy trên máy Windows)

1. Chạy `node scripts/doctor.mjs` trên máy Windows, dán kết quả vào đây hoặc vào
   chat với ID "T-001".
2. Kiểm cổng 4170/4840/1502 còn rảnh; kiểm `git config core.autocrlf` (nên là `false`).
3. Chạy `pnpm install` + một test mẫu + một e2e mẫu (khi có ở P0.1/P0.6).

**Đạt khi:** `pnpm install` + test mẫu + e2e mẫu chạy được trên máy anh.
