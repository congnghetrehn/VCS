# Fixture: project cho Plant Designer e2e (p28 case 2/3/4/6)

Sinh tự động bằng `pnpm gen:suggest-project`
(`scripts/gen-suggest-project.ts`) từ `fixtures/io-list-300.csv`
— không sửa tay.

- 294 tag (300 dòng − 6 tên trùng, giữ dòng đầu; địa chỉ chồng nhau
  giữ nguyên — tagsFileSchema chỉ chặn trùng tên PRJ-E004).
- 0 thiết bị ban đầu (`plant/equipment.yaml` rỗng); controller PLC1
  (demo loopback); không có plc/, không chạy sim.
- Số đo bằng CLI trên project này (2026-11-26):
  - `vcs suggest`: **50 thiết bị (36 confident, 14 review, 0 unmatched),
    176 tags gán** — khớp bảng P2.7 (fixture 300 đầy đủ).
  - `vcs plant validate`: OK (0 thiết bị, 294 tags).
