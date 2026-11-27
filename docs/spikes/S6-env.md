# S6 — Môi trường (kết quả chạy `scripts/doctor.mjs`)

## Mục lục

- [1. Máy VM (AI) — 2026-11-24](#1-máy-vm-ai-2026-11-24)
- [2. Quirk phát hiện trên VM (xem OQ-007)](#2-quirk-phát-hiện-trên-vm-xem-oq-007)
- [3. Đã xong (T-001 — chủ sản phẩm chạy trên máy Windows, 2026-11-24 22:45 +07, báo trong chat)](#3-đã-xong-t-001-chủ-sản-phẩm-chạy-trên-máy-windows-2026-11-24-2245-07-báo-trong-chat)

> Mẫu theo `docs/SPIKES.md` §S6. Đây mới là kết quả trên **Linux VM của AI** —
> phần chạy trên **máy Windows của chủ sản phẩm (T-001) đã xong 2026-11-24** (xem mục 3).

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

## 3. Đã xong (T-001 — chủ sản phẩm chạy trên máy Windows, 2026-11-24 22:45 +07, báo trong chat)

| Kiểm tra | Kết quả |
|---|---|
| Demo 2.1–2.4 | OK |
| Hash `--hash` trùng Linux (`21096ab2…1d53`) | OK |
| Node/pnpm/git (`doctor.mjs`) | OK |
| Cổng 4170 | Bận — do server demo của anh còn chạy (không phải lỗi) |
| Cổng 4840 | Bận — app khác (cổng OPC UA, M0 chưa cần) |
| Cổng 1502 | Rảnh |
| `pnpm test` lần 1 | 437/439 — 2 lỗi do repo trong đường dẫn có dấu cách (`C:\Users\Admin\Downloads\PLC simulate\VCS`) — OQ-074; fix PR #16 (bọc đường dẫn trong ngoặc kép) merge 23:00 +07 |
| `pnpm test` lần 2 (sau fix) | **439/439** — xong, anh ký M0 ngay sau đó (STATE §8) |

**Còn thiếu (ghi rõ, không chặn):** e2e mẫu trên máy Windows thật chưa chạy (CI e2e chỉ chạy ubuntu); trạng thái .NET SDK + Playwright trên máy anh chưa được báo cáo. Hai mục này gộp vào mục gate Windows cho M1 ở `docs/verify-owner-guide.md` §4 khi nào anh chạy.
