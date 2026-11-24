# Câu hỏi mở và giả định (open-questions)

> AI **ghi vào đây** mọi mơ hồ/giả định/sai khác so với spec thay vì tự quyết im lặng. Chủ sản phẩm quyết định và cập nhật cột "Quyết định". Mục đã quyết giữ lại (không xóa) để truy vết; nếu ảnh hưởng kiến trúc → thêm ADR.
> Tham chiếu trong mã: `TODO(OQ-012)`.

| ID | Ngày | Nguồn (prompt/spec §) | Câu hỏi / giả định | Mặc định đã dùng | Tác động nếu sai | Trạng thái | Quyết định (ngày, người) |
|---|---|---|---|---|---|---|---|
| OQ-001 | 2026-11-24 | Audit SCR-001, PRD §9 vs §13 | PRD §9 dùng M1–M8 cho lĩnh vực chức năng, trùng số milestone M0–M5 — đổi tên lĩnh vực thành F1–F8? | Chưa đổi; tiếp tục theo spec hiện hành, đọc §9 theo ngữ cảnh | Đọc PRD §9 và PROMPTS song song dễ nhầm M2 = Controller Runtime vs Plant Engine | ☐ mở | |
| OQ-002 | 2026-11-24 | Audit SCR-002, PRD §13 vs M1 §16 | Số golden test M1 là ≥ 60 (PRD) hay ≥ 80 (M1 spec)? | Lấy M1 spec làm chuẩn (≥ 80 golden + unit test riêng) | Tiêu chí nghiệm thu G1 sai nếu lấy nhầm số | ☐ mở | |
| OQ-003 | 2026-11-24 | Audit SCR-003, PRD §13 vs M0 §1 | Thời lượng M0 là 1–2 tuần (PRD) hay 4–6 ngày công (M0 spec)? | Lấy M0 spec làm chuẩn (4–6 ngày công) | Kế hoạch P0.1–P0.7 và cổng G0 lệch ~2 lần | ☐ mở | |
| OQ-004 | 2026-11-24 | AMENDMENTS E6, D-004, M1 §11 | Mô phỏng chạy ở server Node hay Web Worker? | Server Node (A10); Worker chỉ là tùy chọn sau | P0.6/P1.7 phải làm thêm transport Worker nếu chọn B | ☐ mở | |
| OQ-005 | 2026-11-24 | Audit §3, A-01…A-03 | Tham chiếu gãy `M0 §17.4`, ký hiệu `AGENTS §9.7`, ví dụ `D-007` dùng ID chưa tồn tại | Đã sửa cơ học: `M0 §17 mục 4`, `AGENTS §9 mục 7`, ví dụ `D-003` | Không còn — chỉ là ký hiệu, không đổi ngữ nghĩa | ✔ đã quyết | Đã sửa ở commit "fix(docs): mechanical reference fixes", 2026-11-24 |
| OQ-006 | 2026-11-24 | P0.1, M0 §3.5, AGENTS §3 | Quy tắc "import xuyên package chỉ qua `exports` (index.ts), cấm import file nội bộ" chưa ép được bằng dependency-cruiser: rule theo đường dẫn đã resolve không phân biệt được import nội bộ cùng package (`./b.ts`) với import sâu xuyên package (`../../kernel/src/foo.ts`) | Chưa ép bằng tool; dựa vào review + check-cheats; graph theo bảng §3.5 đã ép đủ | Import sâu xuyên package có thể lọt qua `depcheck` | ☐ mở | |
| OQ-007 | 2026-11-24 | P0.1, M0 §3.2 | `pnpm install`/`pnpm add` trong VM này (btrfs `/home/hatch`) luôn lỗi cuối `EPERM chown <file tạm>` (exit 255); lockfile phải sinh trong bản sao ở `/tmp` rồi chép về, link workspace `@vcs/*` phải tạo tay. Đây là quirk của VM hay lỗi của pnpm 10.15.0? | Lockfile đã sinh đúng trong `/tmp` (đã kiểm: không dính đường dẫn tuyệt đối, đúng phiên bản đã ghim) và chép về; `pnpm install --frozen-lockfile` CHƯA CHẠY ĐƯỢC trong VM — phải kiểm lại trên CI và máy Windows (T-001) trước khi tin gate | Nếu CI/Windows cũng lỗi, toàn bộ quy trình cài đặt M0 bị chặn | ☐ mở | |
| OQ-008 | 2026-11-24 | P0.1, M0 §3.3, §13 | CI hiện chỉ có job `check` + `test`; job `e2e` (Playwright), `bench`, `docs:diagnostics --check` chưa có vì chưa có code để chạy — thêm ở P0.6/P0.3/P0.2 có đúng thứ tự không, hay nên thêm job e2e/bench dạng "skip khi chưa có"? | Hoãn job theo prompt sở hữu (e2e → P0.6, bench → P0.3, diagnostics → P0.2); CI hiện tại đủ cho P0.1 | Job thiếu có thể bị coi là CI chưa đủ theo M0 §13 ở cổng G0 nếu quên thêm | ☐ mở | |

## Mẫu một mục tốt
- **Câu hỏi:** Chỉ số mảng ngoài khoảng khi **ghi** — PLC thật bỏ qua hay đưa CPU vào STOP?
- **Nguồn:** P1.4, M1 §7.2 (VERIFY), thí nghiệm E13.
- **Mặc định đã dùng:** bỏ qua ghi + `RuntimeFault ARRAY_RANGE`, CPU tiếp tục chạy.
- **Tác động nếu sai:** logic phụ thuộc hành vi lỗi sẽ khác PLC thật; ảnh hưởng độ tin cậy FAT.
- **Cách xác minh:** chạy thí nghiệm E13 trên PLCSIM (M5 §10).

## Phân loại ưu tiên khi anh rà soát
1. **Chặn** prompt kế tiếp (ngữ nghĩa lõi, dữ liệu thật còn thiếu) → quyết trước khi tiếp tục.
2. **Có mặc định an toàn** (VERIFY) → ghi nhận, xác minh bằng PLCSIM sau.
3. **Cosmetic/UX** → gom lại, quyết theo đợt.
