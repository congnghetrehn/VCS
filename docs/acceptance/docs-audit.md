# docs-audit — Kiểm kê tài liệu VCS (bản sao local, chỉ đọc)

> Nguồn: bản sao local `/home/hatch/workspace/vcs/`, tải từ repo `congnghetrehn/VCS`, nhánh `main`, commit `0f60c2d` "first repo upload".
> Ngày kiểm: 2026-11-24. Phương pháp: `find` đệ quy + `grep` toàn bộ `*.md` (đường dẫn `docs/…`, `scripts/…`, `§…`, mã `P*.*`, mã AMENDMENTS `A*/B*/C*/D*/E*`, mã `H*`, link markdown) + đọc theo thứ tự AGENTS → SOUL → AUTONOMY → AMENDMENTS → PRD → M0 (đầy đủ, qua mục lục + các mục 1–17) → mục lục + tiêu chí nghiệm thu M1–M5 → PROMPTS → skills/README → SPIKES → REVIEW-CHECKLISTS → STATE / OWNER-INBOX / open-questions.
> Quy tắc: KHÔNG sửa file gốc, KHÔNG bịa file thiếu, KHÔNG tự sửa ngữ nghĩa. File thiếu theo MANIFEST → OWNER-INBOX mục X; mâu thuẫn ngữ nghĩa → SCR mục S; lỗi cơ học → tầng A.
> Lệnh đã chạy: `node scripts/check-cheats.mjs` — kết quả `KẾT QUẢ: SẠCH` (quét 1 file — lúc này repo chưa có `apps/`/`packages/`, nên kết quả này chỉ là tầm thường, không phải bằng chứng gate).

## 1. Kết quả tổng quát

- Tổng số file trong bản sao: **29 file**, khớp danh sách kiểm kê qua trình duyệt (07:04 +07, 2026-11-24).
- Có theo MANIFEST: **28/29 file** (xem bảng). Thiếu: **1 file** (`.github/pull_request_template.md`).
- File lạ / trùng / phiên bản khác nhau: **0**. Không có thư mục `vcs-kit/`, không có file phẳng lộn xộn — tài liệu đã nằm đúng vị trí đích gần như toàn bộ, bước `git mv` sắp xếp gần như không cần di chuyển.
- Thư mục rỗng cần tạo (kèm `.gitkeep`): `docs/spikes/`, `docs/acceptance/`, `docs/facts/` — **cả 3 đều thiếu**. Riêng `docs/facts/` đã được `docs/skills/README.md` nhắc tới nhưng mở trên GitHub trả 404.
- Tên sản phẩm: chuỗi `Virtual Commissioning Studio` xuất hiện **6 lần**, không có biến thể tên khác — bước đổi tên trong BOOTSTRAP là **no-op** trên bản sao này.
- Mã prompt: **50/50** mã `P*.*` được nhắc tới đều có định nghĩa trong `docs/PROMPTS.md` (P0.1–P0.9, P1.1–P1.7, P2.1–P2.8, P3.1–P3.8, P4.1–P4.9, P5.1–P5.9); **0 mã mồ côi**.
- Mã AMENDMENTS: A1–A15, B1–B12, C1–C9, D1–D8, E1–E8 đều có định nghĩa. C7, C8, E7, E8 không được nhắc trong `PROMPTS.md` (chỉ xuất hiện trong AMENDMENTS/spec) — không gãy, chỉ là chưa được prompt nào trỏ tới.
- Mã H: H1–H9 đều có định nghĩa ở `PROMPTS.md` §3.
- Tham chiếu `M{n} §x`: **166 tham chiếu riêng biệt, 164 hợp lệ, 2 gãy** — cả hai đều là `M0 §17.4` (xem §3.1).
- Link markdown: 5 link skill trong `docs/skills/README.md` đều tồn tại. 2 "link" trong M2 §8 là regex trong code block, không phải link — không tính.

## 2. Bảng kiểm kê theo MANIFEST

| File | Trạng thái | Vấn đề | Cách xử lý |
|---|---|---|---|
| `AGENTS.md` (gốc) | có | 102 dòng, khớp M0 §11 (≤ 120 dòng). Không có vấn đề nội dung ở lần rà này. | Giữ nguyên |
| `docs/PRD.md` | có | 712 dòng. Có 3 mâu thuẫn với spec chi tiết — xem §4 (SCR-001…SCR-003). FR-105/FR-106 xuất hiện 2 lần mỗi mã, lần 2 là tham chiếu chéo (M4 §4, PRD §17), không phải định nghĩa trùng. | Giữ nguyên; xử lý SCR theo §4 |
| `docs/specs/M0-skeleton-spec.md` | có | 785 dòng. §17 là danh sách đánh số 1–6, **không có §17.4** — mọi tham chiếu `M0 §17.4` đều gãy (xem §3.1). | Sửa tham chiếu ở nơi trỏ tới (tầng A), không sửa M0 |
| `docs/specs/M1-soft-plc-spec.md` | có | 746 dòng, 20 lần `VERIFY` (§14). Nghiệm thu §16 yêu cầu ≥ 80 golden, mâu thuẫn PRD §13 (≥ 60) — xem SCR-002. | Giữ nguyên; chờ quyết SCR-002 |
| `docs/specs/M2-plant-and-io-import-spec.md` | có | 824 dòng. 2 "link markdown gãy" ở dòng 151 là regex trong code block, không phải link. | Không làm gì |
| `docs/specs/M3-test-automation-spec.md` | có | 808 dòng. | Giữ nguyên |
| `docs/specs/M4-comms-and-hmi-spec.md` | có | 801 dòng. | Giữ nguyên |
| `docs/specs/M5-plcsim-s7-simaticml-spec.md` | có | 703 dòng, 26 lần `VERIFY` (nhiều nhất). | Giữ nguyên |
| `docs/KIT.md` | có | 57 dòng. Cây thư mục §2 khớp vị trí đích thực tế. | Giữ nguyên |
| `docs/AUTONOMY.md` | có | 64 dòng. Tầng A/B/C rõ; D-001…D-005 trong BOOTSTRAP chưa được chép vào OWNER-INBOX. | Chép D/T vào OWNER-INBOX ở bước II.8 (không phải lỗi tài liệu) |
| `docs/OWNER-INBOX.md` | có | 85 dòng. Mục D, T, S đang trống "(chưa có)"; chỉ có X-001…X-008 và bảng K. Ví dụ `D-007` ở phần mở đầu không có mục D-007 thật — xem §3.3. | Điền D-001…D-005, T-001…T-004 ở bước II.8 |
| `docs/STATE.md` | có | 66 dòng. §0 năng lực còn `?`; §2 mới liệt kê P0.1, P0.2 + hàng `…` (mẫu chưa điền). | Điền ở bước II.8 / P0.1 |
| `docs/PROMPTS.md` | có | 488 dòng. 50 prompt + G0–G5; bảng §5 có 2 mục số 8 và 8b (P0.8, P0.9) — cố ý, không phải lỗi đánh số. | Giữ nguyên |
| `docs/AMENDMENTS.md` | có | 86 dòng. A1–A15, B1–B12, C1–C9, D1–D8, E1–E8. | Giữ nguyên |
| `docs/PACKAGE-RULES.md` | có | 95 dòng. | Giữ nguyên |
| `docs/REVIEW-CHECKLISTS.md` | có | 170 dòng. | Giữ nguyên |
| `docs/SPIKES.md` | có | 54 dòng. S1–S6 đầy đủ. | Giữ nguyên |
| `docs/open-questions.md` | có | 21 dòng. Chỉ có mẫu OQ-001 trống + 1 mục mẫu tốt, chưa có câu hỏi thật. | Điền từ §5 ở bước II.8 |
| `docs/BOOTSTRAP-PROMPT.md` | có | 92 dòng. Chứa 2 tham chiếu gãy `M0 §17.4` và ví dụ `D-007` — xem §3. | Sửa tầng A |
| `docs/agent/SOUL.md` | có | 110 dòng. | Giữ nguyên |
| `docs/skills/README.md` | có | 16 dòng. Nhắc `docs/facts/` (chưa tồn tại) — xem hàng thư mục rỗng dưới. | Tạo `docs/facts/.gitkeep` ở bước I.2 |
| `docs/skills/SKILL-plc-simulation.md` | có | 122 dòng. | Giữ nguyên |
| `docs/skills/SKILL-testing-and-verification.md` | có | 94 dòng. | Giữ nguyên |
| `docs/skills/SKILL-tools-and-protocols.md` | có | 88 dòng. | Giữ nguyên |
| `docs/skills/SKILL-ui-pwa-hmi.md` | có | 76 dòng. | Giữ nguyên |
| `docs/skills/SKILL-siemens-integration.md` | có | 64 dòng. | Giữ nguyên |
| `docs/adr/0000-template.md` | có | 28 dòng. | Giữ nguyên |
| `scripts/check-cheats.mjs` | có | 155 dòng, chạy được (`node scripts/check-cheats.mjs` → SẠCH). | Giữ nguyên |
| `scripts/check-cheats.allow.json` | có | 8 dòng, các allow-list đều rỗng. | Giữ nguyên |
| `.github/pull_request_template.md` | **thiếu** | Cả thư mục `.github/` cũng không có (GitHub trả 404). Được nhắc ở AUTONOMY §5, BOOTSTRAP §6, KIT §2. | **OWNER-INBOX mục X mới** (xem §5): không tự bịa nội dung template — chờ chủ sản phẩm cung cấp hoặc quyết cho AI viết mới theo mẫu REVIEW-CHECKLISTS §4 |
| `docs/spikes/` | **thiếu** | Thư mục rỗng cần tạo theo MANIFEST; được nhắc ở SPIKES.md, AGENTS §6, KIT §2. | Tạo + `.gitkeep` ở bước I.2 |
| `docs/acceptance/` | **thiếu** | Thư mục rỗng cần tạo theo MANIFEST; được nhắc ở AUTONOMY §7, PROMPTS §7, STATE §8. File audit này được viết vào đây ở bản sao local trước. | Tạo + `.gitkeep` ở bước I.2 (giữ file audit này trong PR bootstrap) |
| `docs/facts/` | **thiếu** | Thư mục rỗng cần tạo theo MANIFEST; được nhắc ở AGENTS §1/§6, skills README, SKILL-siemens-integration §6. | Tạo + `.gitkeep` ở bước I.2 |
| `/README.md` (gốc repo, mới) | **thiếu — theo kế hoạch** | Không có trong MANIFEST gốc; BOOTSTRAP bước 6 yêu cầu tạo mới (ngắn, trỏ `docs/KIT.md`). | Tạo ở bước II.6 |
| `/.gitignore`, `/.gitattributes` | **thiếu — theo kế hoạch** | BOOTSTRAP bước 6 yêu cầu tạo mới. | Tạo ở bước II.6 |
| `/.github/workflows/ci.yml` | **thiếu — theo kế hoạch** | Được nhắc ở M0 §13; tạo ở P0.1. | Tạo ở P0.1, không bịa ở bước bootstrap |

## 3. Tham chiếu gãy / mơ hồ (đã kiểm bằng grep + script Python)

### 3.1 Gãy thật (2 lần, cùng một gốc)
- **`M0 §17.4` — gãy.** M0 §17 ("Việc của chủ sản phẩm") là danh sách đánh số 1–6, không có tiểu mục 17.4. Mục 4 trong danh sách là quyết định Worker transport — đúng nội dung được trỏ tới, chỉ sai ký hiệu.
  - `docs/AMENDMENTS.md` — E6: "…(M0 §17.4)".
  - `docs/BOOTSTRAP-PROMPT.md` — D-004: "…(M0 §17.4)".
  - Cách xử lý (tầng A): sửa cả hai chỗ thành `M0 §17 mục 4`. Không đổi ngữ nghĩa.

### 3.2 Mơ hồ về ký hiệu, không gãy hẳn
- **`AGENTS.md §9.7` (2 lần: BOOTSTRAP §kết phiên, PROMPTS §2).** AGENTS §9 là danh sách 7 mục, không có tiểu mục 9.7; mục 7 trong §9 đúng là "Báo cáo cuối (đúng mẫu)". Đọc được theo nghĩa "§9 mục 7", nhưng ký hiệu dễ nhầm với tiểu mục.
  - Cách xử lý (tầng A): đổi thành `AGENTS.md §9 mục 7` ở cả hai chỗ.
- **`D-007` làm ví dụ (BOOTSTRAP §C, OWNER-INBOX phần mở đầu).** Không tồn tại mục quyết định D-006 hay D-007 nào; D-001…D-005 mới được định nghĩa ở BOOTSTRAP bước 7. Ví dụ dùng một ID chưa tồn tại gây nhầm lẫn với không gian ID quyết định thật.
  - Cách xử lý (tầng A): đổi ví dụ thành `D-003: B` (đã có trong BOOTSTRAP) hoặc ghi rõ "(ví dụ, chưa phải mục thật)". Lưu ý thêm: không gian ID `D-xxx` của OWNER-INBOX trùng tiền tố với `D1–D8` của AMENDMENTS — giữ nguyên hai hệ ID vì đã dùng khắp nơi, nhưng khi viết phải luôn kèm ngữ cảnh (AMENDMENTS D… vs OWNER-INBOX D-00…).

### 3.3 Tham chiếu tới file chưa tồn tại — KHÔNG tính là gãy (file sẽ tạo ở prompt tương ứng)
Tổng cộng 17 đường dẫn `docs/*.md` + 5 script + 1 CI được nhắc tới nhưng chưa có file. Tất cả đều là đầu ra đã được lên kế hoạch, có prompt tạo ra chúng — không đưa vào OWNER-INBOX mục X, không bịa.
- `docs/semantics.md` (25 lần) — M0 §11, M1 §16 mục 7; tạo ở P0.7, cập nhật mỗi milestone.
- `docs/diagnostics.md` (7 lần) — sinh tự động ở M0 §15 mục 9; tạo ở P0.1/P0.2.
- `docs/architecture.md` (2 lần) — M0 §11; tạo ở P0.7.
- `docs/acceptance/M0.md` … `M5.md` (2–3 lần mỗi file) + `docs/acceptance/Mx.md` (mẫu) — tạo ở G0…G5.
- `docs/compat-matrix.md` (3 lần) — PRD §16, M5 §17 mục 6; tạo ở P5.9.
- `docs/equipment/motor_dol.md` (2 lần) — M2 §14 mục 7, sinh tự động; tạo ở P2.1–P2.2.
- `docs/mutation-notes.md` (3 lần) — M3 §15; tạo ở P3.7.
- `docs/plcsim-setup.md` (6 lần), `docs/tia-export.md` (1 lần), `docs/verify-experiments.md` (3 lần), `docs/verify-experiments-draft.md` (1 lần) — M5; tạo ở P5.3–P5.9.
- `docs/scada-integration.md` (8 lần) — M4 §17 mục 12, Phụ lục C; tạo ở P4.9.
- `docs/spikes/S1-coverage.md`, `S2-plcsim.md`, `S5-scada.md`, `S6-env.md` (1–2 lần mỗi file) — tạo khi chạy spike tương ứng. Lưu ý: `S3` và `S4` không có file spike riêng được nhắc tên trong SPIKES.md (S3 đầu ra là file SimaticML + `docs/facts/simaticml-*.md`; S4 đầu ra là ADR) — không phải thiếu sót.
- `docs/adr/NNNN-title.md` (1 lần) — mẫu tên file ADR, không phải file thật.
- `scripts/doctor.mjs` (S6), `scripts/gen-bench-project.ts` (M0 §3.1), `scripts/gen-io-fixture.ts`, `scripts/gen-ce-fixture.ts`, `scripts/mutate-scl.ts` — tạo ở P0.1 / P2.5 / P3.2 / P3.7.
- `.github/workflows/ci.yml` — tạo ở P0.1.

## 4. Mâu thuẫn ngữ nghĩa — đề xuất SCR (KHÔNG tự sửa)

### SCR-001 · PRD §9 dùng M1–M8 cho lĩnh vực chức năng, trùng số với milestone M0–M5
- Vấn đề + bằng chứng: PRD §9 đặt tên các lĩnh vực chức năng là M1 (Project & Import), M2 (Controller Runtime), M3 (Coding), M4 (Plant Model), M5 (Test Automation), M6 (Communication Gateway), M7 (HMI), M8 (Điều khiển mô phỏng) — trong khi PRD §13 và toàn bộ spec dùng M0–M5 cho milestone, với M1 = Soft-PLC, M2 = Plant, M3 = Test, M4 = Comms/HMI, M5 = Siemens. Cùng một ký hiệu M2 vừa là "Controller Runtime" (§9) vừa là "Plant Engine" (milestone) — đọc PRD §9 và PROMPTS §5 song song rất dễ nhầm.
- Đề xuất sửa: đổi tên các lĩnh vực ở PRD §9 thành F1–F8 (hoặc "FR nhóm 1–8"), giữ nguyên số FR-1xx…FR-8xx; thêm một dòng chú thích "M1–M8 ở §9 không phải milestone M0–M5 ở §13".
- Tác động: PRD §9 + §14 (Prompt 0–8 cũ) + mọi chỗ nhắc "M1–M3" theo nghĩa §9; không đổi mã FR, không đổi milestone/spec. Mức: tầng C (đổi spec), cần chủ sản phẩm quyết.
- AMENDMENTS D7 đã ghi một phần vấn đề này (PRD §13 gọi M0–M7, spec chỉ có M0–M5) nhưng chưa chạm tới xung đột §9 — SCR này bổ sung, không trùng.

### SCR-002 · Số golden test M1: PRD §13 nói ≥ 60, M1 §16 nói ≥ 80
- Vấn đề + bằng chứng: PRD §13 (M1): "≥ 60 golden test ngữ nghĩa (mục 16) pass"; M1 §12.2 và §16 mục 2: "≥ 80 golden test + unit test theo bảng 12.2". Cả hai đều là tiêu chí nghiệm thu, không thể cùng đúng.
- Đề xuất sửa: lấy M1 spec làm chuẩn (≥ 80 golden + unit test riêng, mỗi test có `expectedFrom`), sửa PRD §13 thành ≥ 80 cho khớp; hoặc nếu chủ sản phẩm muốn giữ 60 thì sửa M1 §12.2/§16 xuống 60 và giảm bảng 12.2 tương ứng.
- Tác động: M1 §16, §12.2, REVIEW-CHECKLISTS §2 (M1 đã ghi ≥ 80 — khớp M1 spec), PROMPTS G1. Mức: tầng C.

### SCR-003 · Thời lượng M0: PRD §13 nói 1–2 tuần, M0 spec nói 4–6 ngày công
- Vấn đề + bằng chứng: PRD §13: "M0 — Skeleton (1–2 tuần công)"; M0 §1: "Thời lượng dự kiến: 4–6 ngày công". Chênh lệch ~2 lần, ảnh hưởng kế hoạch và cổng G0.
- Đề xuất sửa: lấy M0 spec làm chuẩn (4–6 ngày công, là ước lượng chi tiết sau), sửa PRD §13 thành "4–6 ngày công"; hoặc giữ 1–2 tuần nếu tính cả thời gian chờ chủ sản phẩm (S6, quyết định D-001…D-005).
- Tác động: PRD §13, STATE.md, kế hoạch P0.1–P0.7. Mức: tầng C (đổi PRD), nhưng có thể quyết nhanh theo mặc định đề xuất.

### SCR-004 · PRD §13 có M6 (Clinker cooler lite) và M7+ nhưng chưa có spec
- Vấn đề + bằng chứng: PRD §13 liệt kê M6 (3–4 tuần) và M7+ (Rockwell/ABB/3D…) với tiêu chí nghiệm thu, nhưng không có spec M6/M7 nào trong repo. AMENDMENTS D7 đã ghi "không làm trước" — audit này xác nhận D7 là đủ, không cần SCR mới, chỉ nhắc lại: đừng để PROMPTS hay STATE vô tình lên lịch M6/M7.
- Đề xuất: không sửa gì thêm; giữ D7. Không đưa vào OWNER-INBOX mục S mới (tránh trùng).

### Đã kiểm và KHÔNG phải mâu thuẫn
- PRD §7.2 thiếu `apps/cli`, `packages/project`, `packages/test-utils`, `examples/hello-tags` so với M0 §3.1 — đã được AMENDMENTS A15 và M0 §2 mục 15 xử lý (thêm 2 package mới); M0 thắng PRD ở điểm này theo AGENTS §1.
- `TagValue` có `bigint` (PRD §8.4) vs không `bigint` (M0/AMENDMENTS A3) — đã được A3 xử lý.
- `ControllerAdapter.step` async (M1 §10) vs đồng bộ (M0/A1) — đã được A1 xử lý.
- `VERIFY`: tổng 74 lần trong toàn repo, tập trung ở M5 (26) và M1 (20) — đây là các điểm cần xác minh bằng PLCSIM, đã có danh sách ở M1 §14 và M5 §10; không phải lỗi tài liệu.

## 5. Lỗi cơ học tầng A (sửa được ngay, không đổi ngữ nghĩa)

| # | Vị trí | Lỗi | Sửa thành |
|---|---|---|---|
| A-01 | AMENDMENTS E6; BOOTSTRAP D-004 | `M0 §17.4` — M0 không có §17.4 | `M0 §17 mục 4` |
| A-02 | BOOTSTRAP §kết phiên; PROMPTS §2 | `AGENTS.md §9.7` — AGENTS §9 không có tiểu mục 9.7 (mục 7 trong §9 mới là mẫu báo cáo) | `AGENTS.md §9 mục 7` |
| A-03 | BOOTSTRAP §C; OWNER-INBOX phần mở đầu | Ví dụ `D-007: B` dùng ID quyết định chưa tồn tại | `D-003: B` (hoặc ghi rõ là ví dụ) |
| A-04 | STATE.md §2 | Bảng tiến độ mới có P0.1, P0.2 + hàng `…` | Điền đủ 50 prompt + G0–G5 ở P0.1 (việc của prompt, không phải lỗi nội dung) |
| A-05 | (không lỗi) | Tên sản phẩm đã thống nhất `Virtual Commissioning Studio` (6 lần, không biến thể) | Không cần đổi tên |

## 6. Ghi chú kiểm tra khác

- `node scripts/check-cheats.mjs` — ĐÃ CHẠY, kết quả SẠCH, exit 0. Lưu ý: lúc này chỉ quét được 1 file trong `scripts/`; chưa có `apps/`/`packages/` nên kết quả không chứng minh được gì về gate.
- Tổng số `VERIFY` = 74; M1 §14 liệt kê danh sách VERIFY cần PLCSIM, M5 §10 có harness conformance — hai danh sách này là đầu vào cho T-002/T-003.
- OWNER-INBOX hiện chỉ có X-001…X-008; D/T/S/K/R đều trống. D-001…D-005 và T-001…T-004 nằm trong BOOTSTRAP bước 7–8, chưa được chép vào inbox — việc này thuộc bước II.8, không phải lỗi của file hiện tại.
- Không phát hiện TODO/FIXME không có tham chiếu trong mã nguồn tài liệu (các lần xuất hiện `TODO` đều là quy tắc/ví dụ trong AGENTS/SOUL/PRD, không phải TODO thật).
