# VCS Kit — Bộ khởi động vibe coding tự chủ

> Đặt file này ở `docs/KIT.md` trong repo. Đây là hướng dẫn cho **chủ sản phẩm**; AI đọc `AGENTS.md` và `docs/AUTONOMY.md`.

## 1. Kit gồm gì
| Nhóm | File | Dùng để |
|---|---|---|
| **Luật & tư duy** | `AGENTS.md`, `docs/agent/SOUL.md`, `docs/AUTONOMY.md` | Quy tắc, cách làm việc chuyên nghiệp, ranh giới tự chủ |
| **Kế hoạch** | `docs/PRD.md`, `docs/specs/M0…M5`, `docs/PROMPTS.md`, `docs/SPIKES.md` | Cái cần làm, thứ tự, thử nghiệm giảm rủi ro |
| **Điều phối chéo** | `docs/AMENDMENTS.md`, `docs/PACKAGE-RULES.md` | Sửa mâu thuẫn giữa spec, quy tắc theo package |
| **Kỹ năng** | `docs/skills/*` | Mô phỏng PLC, kiểm thử, công cụ/giao thức, UI/PWA/HMI, tích hợp Siemens |
| **Sổ sống** (AI cập nhật) | `docs/STATE.md`, `docs/OWNER-INBOX.md`, `docs/open-questions.md`, `docs/adr/`, `docs/facts/`, `docs/spikes/`, `docs/acceptance/` | Tiến độ, bàn giao, quyết định, câu hỏi, sự thật, bằng chứng |
| **Kiểm soát** | `docs/REVIEW-CHECKLISTS.md`, `scripts/check-cheats.*`, `.github/pull_request_template.md` | Rà soát, chống "lách luật" |
| **Khởi động** | `docs/BOOTSTRAP-PROMPT.md` | Prompt đầu tiên + prompt "tiếp tục" |

## 2. Vị trí đích trong repo
```
/AGENTS.md   /README.md (tạo mới)   /.gitignore   /.gitattributes   [/CLAUDE.md nếu công cụ cần]
/.github/pull_request_template.md
/scripts/check-cheats.mjs  /scripts/check-cheats.allow.json
/docs/
  PRD.md  KIT.md  AUTONOMY.md  OWNER-INBOX.md  STATE.md  PROMPTS.md  AMENDMENTS.md
  PACKAGE-RULES.md  REVIEW-CHECKLISTS.md  SPIKES.md  open-questions.md  BOOTSTRAP-PROMPT.md
  agent/SOUL.md
  skills/README.md  SKILL-plc-simulation.md  SKILL-testing-and-verification.md
         SKILL-tools-and-protocols.md  SKILL-ui-pwa-hmi.md  SKILL-siemens-integration.md
  specs/M0-skeleton-spec.md … M5-plcsim-s7-simaticml-spec.md
  adr/0000-template.md   spikes/   acceptance/   facts/
```
Bước đầu AI tự sắp xếp theo bảng này (prompt khởi động).

## 3. Cách vận hành (khuyến nghị: tự chủ)
1. Dán **prompt khởi động** (`docs/BOOTSTRAP-PROMPT.md`) vào AI có quyền shell + git trên repo.
2. AI sắp xếp tài liệu, thiết lập hạ tầng, rồi đi theo `docs/PROMPTS.md` (M0 → M5).
3. Anh **chỉ đọc `docs/OWNER-INBOX.md`** (hoặc nhận GitHub Issue có nhãn). Có 6 loại việc: **D** quyết định · **T** kiểm thật (PLCSIM/TIA/SCADA) · **X** dữ liệu cần có · **S** thay đổi spec/lớn · **K** ký duyệt milestone · **R** duyệt sau.
4. Mỗi phiên AI hết ngữ cảnh → bàn giao qua `docs/STATE.md`; anh dán **prompt "tiếp tục"** để mở phiên mới.
5. Cuối mỗi milestone AI nộp `docs/acceptance/M{n}.md`; anh làm các mục T/K rồi ký (merge `develop` → `main`).

## 4. Anh cần làm gì (và chỉ những việc này)
- Trả lời mục **D/S** (chọn lựa chọn, thường mặc định AI đề xuất là đủ).
- Chạy mục **T** theo hướng dẫn từng bước AI viết (PLCSIM, TIA, SCADA, Modbus master).
- Cung cấp mục **X** (dữ liệu thật ẩn danh) đúng lúc.
- **Ký** milestone sau khi xem bằng chứng + chạy demo theo `REVIEW-CHECKLISTS.md`.
- Duyệt/ veto mục **R** theo đợt.
- Thiết lập quyền GitHub (branch protection `main`, quyền push/PR cho AI) — việc duy nhất ngoài repo.

## 5. Nên làm ngay (tuần đầu)
Spike **S6** (môi trường Windows), **S1** (mã SCL thật → quyết phạm vi M1), **S2/S3** (PLCSIM/TIA "hello" — để biết sớm khả thi M5 và giấy phép). Chi tiết `docs/SPIKES.md`.

## 6. Giới hạn cần biết (trung thực)
- Spec là **v0.x chưa được thực tế kiểm**: dự kiến có sai sót; quy trình SCR (OWNER-INBOX mục S) để sửa có kiểm soát.
- Nhiều giá trị ngữ nghĩa gắn `VERIFY` (hành vi PLC/PLCSIM thật): chỉ đóng được bằng thí nghiệm trên PLCSIM (M5 conformance).
- Thông tin sản phẩm Siemens trong M5 lấy từ tài liệu công khai đầu 11/2026 — phải xác minh với bản cài thật (skill Siemens: quy trình "sự thật trước").
- Tự chủ ≠ không cần giám sát: bạn vẫn là người ký milestone và duyệt các quyết định tầng C.
- Ước lượng thời gian (M0 4–6 ngày … M5 4–6 tuần) cho **một luồng** AI + anh; thực tế phụ thuộc công cụ AI và tốc độ anh trả lời inbox.
- Chưa có spec cho: PRD M6 (clinker cooler lite), Rockwell/ABB, 3D, đa người dùng/cloud.
