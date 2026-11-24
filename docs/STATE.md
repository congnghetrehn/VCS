# STATE — Trạng thái dự án và bàn giao giữa các phiên

> **AI đọc file này đầu mỗi phiên và cập nhật cuối mỗi phiên.** Chủ sản phẩm kiểm tra và ký ở mục "Ký duyệt milestone". Giữ ngắn: tối đa ~150 dòng; lịch sử chi tiết nằm ở git và `docs/acceptance/`.

## 0. Năng lực công cụ (AI điền ở phiên đầu tiên)
- Shell: bash (Linux VM) · git đọc/ghi/push: qua GitHub MCP (`/opt/hatch/bin/github`, đã kết nối congnghetrehn, đã tạo nhánh `develop` + `chore/docs-bootstrap`); `git clone` HTTPS trực tiếp bị chặn (repo private, không có credential trong VM) · `gh` CLI: 2.102.0, chưa login · Node 24.22.1, npm 10.9.4, pnpm: chưa có (lệnh `pnpm` không có; `npx -y pnpm@10` chưa xác nhận) · .NET SDK: thiếu · mạng: github.com 200, registry.npmjs.org 200 · mở được phiên reviewer độc lập: có (subagent)
- Hệ điều hành/ môi trường chạy: Linux VM (Muse); máy Windows của chủ sản phẩm chưa kiểm (spike S6, T-001)

## 1. Vị trí hiện tại
- Milestone: **M0** (chưa bắt đầu)
- Prompt đang làm / vừa xong: Bootstrap I–II (docs-bootstrap) — xong, chờ merge PR vào `develop`; tiếp theo: P0.1
- Nhánh: `chore/docs-bootstrap` (từ `develop` @ 0f60c2d)
- Cập nhật lần cuối: 2026-11-24 bởi AI (bootstrap)

## 2. Tiến độ prompt
| Prompt | Trạng thái | Commit/PR | Gate (đã tự chạy lại bởi chủ sản phẩm?) | Ghi chú |
|---|---|---|---|---|
| P0.1 | ☐ chưa | | | |
| P0.2 | ☐ chưa | | | |
| P0.3 | ☐ chưa | | | ⚠ plan-first |
| P0.4 | ☐ chưa | | | ⚠ plan-first |
| P0.5 | ☐ chưa | | | |
| P0.6 | ☐ chưa | | | |
| P0.7 | ☐ chưa | | | |
| P0.8 | ☐ chưa | | | khuyến nghị |
| P0.9 | ☐ chưa | | | tùy chọn, chờ D-005 |
| G0 | ☐ chưa | | | gói nghiệm thu M0 |
| P1.1 | ☐ chưa | | | |
| P1.2 | ☐ chưa | | | cần X-002 (S1) |
| P1.3 | ☐ chưa | | | ⚠ plan-first |
| P1.4 | ☐ chưa | | | ⚠ plan-first |
| P1.5 | ☐ chưa | | | ⚠ plan-first |
| P1.6 | ☐ chưa | | | |
| P1.7 | ☐ chưa | | | |
| G1 | ☐ chưa | | | gói nghiệm thu M1 |
| P2.1 | ☐ chưa | | | ⚠ plan-first |
| P2.2 | ☐ chưa | | | ⚠ plan-first |
| P2.3 | ☐ chưa | | | |
| P2.4 | ☐ chưa | | | ⚠ plan-first |
| P2.5 | ☐ chưa | | | |
| P2.6 | ☐ chưa | | | |
| P2.7 | ☐ chưa | | | ⚠ plan-first, cần X-003 |
| P2.8 | ☐ chưa | | | |
| G2 | ☐ chưa | | | gói nghiệm thu M2 |
| P3.1 | ☐ chưa | | | ⚠ plan-first |
| P3.2 | ☐ chưa | | | |
| P3.3 | ☐ chưa | | | ⚠ plan-first |
| P3.4 | ☐ chưa | | | cần X-004 |
| P3.5 | ☐ chưa | | | cần X-004 |
| P3.6 | ☐ chưa | | | ⚠ plan-first |
| P3.7 | ☐ chưa | | | ⚠ plan-first |
| P3.8 | ☐ chưa | | | |
| G3 | ☐ chưa | | | gói nghiệm thu M3 |
| P4.1 | ☐ chưa | | | ⚠ plan-first |
| P4.2 | ☐ chưa | | | |
| P4.3 | ☐ chưa | | | ⚠ plan-first |
| P4.4 | ☐ chưa | | | ⚠ plan-first, cần X-005 |
| P4.5 | ☐ chưa | | | |
| P4.6 | ☐ chưa | | | |
| P4.7 | ☐ chưa | | | cần X-005 |
| P4.8 | ☐ chưa | | | |
| P4.9 | ☐ chưa | | | |
| G4 | ☐ chưa | | | gói nghiệm thu M4 |
| P5.1 | ☐ chưa | | | ⚠ plan-first |
| P5.2 | ☐ chưa | | | ⚠ plan-first |
| P5.3 | ☐ chưa | | | |
| P5.4 | ☐ chưa | | | cần X-006 |
| P5.5 | ☐ chưa | | | ⚠ plan-first |
| P5.6 | ☐ chưa | | | cần X-006 |
| P5.7 | ☐ chưa | | | cần X-007 |
| P5.8 | ☐ chưa | | | ⚠ plan-first, cần X-007 |
| P5.9 | ☐ chưa | | | cần X-008 |
| G5 | ☐ chưa | | | gói nghiệm thu M5 |

Trạng thái: ☐ chưa · ◐ đang làm · ✔ xong (gate xanh + đã kiểm) · ✖ bị chặn (nêu lý do)

## 3. Việc đang dở (cho phiên sau)
- File/hàm đang sửa: —
- Test đang hỏng (nguyên văn): —
- Lệnh tái hiện nhanh: `node scripts/check-cheats.mjs` (ĐÃ CHẠY 2026-11-24: SẠCH — lúc này chỉ quét 1 file, chưa có apps/packages)
- Bước tiếp theo cụ thể: P0.1 — Repo + công cụ + CI + lint tất định + dependency-cruiser + AGENTS.md (M0 §1–3, 11–13)

## 4. Quyết định và giả định gần đây
| Ngày | Nội dung | Tham chiếu (ADR/OQ/spec §) |
|---|---|---|
| 2026-11-24 | Bootstrap: tài liệu đã đúng vị trí MANIFEST, không cần `git mv`; chỉ tạo 3 thư mục rỗng + audit | docs/acceptance/docs-audit.md |
| 2026-11-24 | Sửa cơ học tầng A: `M0 §17.4` → `M0 §17 mục 4`; `AGENTS §9.7` → `§9 mục 7`; ví dụ `D-007` → `D-003` | docs-audit §5, A-01…A-03 |
| 2026-11-24 | Tên sản phẩm đã thống nhất "Virtual Commissioning Studio" (6 lần, không biến thể) — đổi tên là no-op | docs-audit §5 A-05 |
| 2026-11-24 | PR template do chủ sản phẩm cung cấp, đưa nguyên văn lên `.github/pull_request_template.md` | OWNER-INBOX §3 (ghi chú) |

## 5. Đang chờ chủ sản phẩm
Chỉ liệt kê **ID** (chi tiết ở `docs/OWNER-INBOX.md`; câu hỏi/ giả định ở `docs/open-questions.md`):
- Chặn tiến độ: D-001, D-004 (trước G0); T-002, T-003 (nên làm sớm, quyết định khả thi M5)
- Không chặn (duyệt sau): D-002, D-003, D-005, S-001, S-002, S-003, R-001

## 6. Dữ liệu/môi trường cần có (🔑) và tình trạng
| Cần | Cho prompt | Tình trạng |
|---|---|---|
| Repo + CI | P0.1 | ◐ repo có (main @0f60c2d, develop đã tạo); CI chưa có (tạo ở P0.1) |
| I/O list thật ẩn danh + quy ước tên | P2.7 | ☐ (X-003) |
| C&E thật ẩn danh + biểu mẫu FAT | P3.4–P3.5 | ☐ (X-004) |
| SCADA đích + node id | P4.4 | ☐ (X-005) |
| Windows + TIA + PLCSIM Advanced + giấy phép | P5.4, P5.6 | ☐ (X-006, T-002/T-003) |
| ≥ 10 file SimaticML thật + XSD | P5.7 | ☐ (X-007) |
| Dự án VCS_Conformance | P5.9 | ☐ (X-008) |
| Khảo sát độ phủ SCL thật (Spike S1) | trước P1.2 | ☐ (X-002) |

## 7. Rủi ro đang theo dõi
| Rủi ro | Mức | Giảm thiểu | Người theo dõi |
|---|---|---|---|
| Soft-PLC tự viết không tương đương PLC thật | C | Chỉ conformance trên PLCSIM (M5 §10, ≥10/14 thí nghiệm) mới chứng minh được | AI + chủ sản phẩm (T-002) |
| Chưa có dữ liệu thật nào (X-001…X-008) | C | Fixture tổng hợp trước; dữ liệu thật ẩn danh khi có | Chủ sản phẩm |
| Môi trường Windows chưa được chứng minh (S6) | B/C | Chạy S6 sớm (T-001); VM này không có pnpm/.NET | Chủ sản phẩm (T-001) |
| Hiệu năng OPC UA 2.000 monitored item @100 ms chưa có số liệu | B | Bench S4 trước P4.4; không đạt → push (ADR) | AI |
| Scope creep + sai im lặng | A | Gate + review:cheats + reviewer độc lập mỗi PR | AI |

## 8. Ký duyệt milestone
| Milestone | Gói nghiệm thu | Ngày ký | Người ký | Ghi chú |
|---|---|---|---|---|
| M0 | docs/acceptance/M0.md | | | |
| M1 | docs/acceptance/M1.md | | | |
| M2 | docs/acceptance/M2.md | | | |
| M3 | docs/acceptance/M3.md | | | |
| M4 | docs/acceptance/M4.md | | | |
| M5 | docs/acceptance/M5.md | | | |

## 9. Ghi chú (10 dòng — đọc & nội hóa, 2026-11-24)
Cốt lõi: VCS là nền tảng web mô phỏng điều khiển công nghiệp trước commissioning, local-first, TypeScript monorepo + .NET Windows; bất biến lõi là sim time nguyên ms, plant trước controller, tất định theo seed, mọi lỗi đều có mã + vị trí, sai im lặng là lỗi nghiêm trọng nhất.
Rủi ro 1 (C): Soft-PLC tự viết không tương đương PLC thật — chỉ conformance trên PLCSIM (M5 §10, ≥10/14 thí nghiệm) mới chứng minh được, chưa có môi trường/dữ liệu để chạy.
Rủi ro 2 (C): Chưa có dữ liệu thật nào (X-001…X-008: I/O list, C&E, SimaticML, SCADA, TIA/PLCSIM) — nghiệm thu M2–M5 phụ thuộc trực tiếp vào chúng, fixture tổng hợp chỉ là xấp xỉ.
Rủi ro 3 (B/C): Môi trường Windows chưa được chứng minh (S6; VM này không có pnpm/.NET, gh chưa login) — P0.1 và CI Windows có thể chặn ngay từ đầu.
Rủi ro 4 (B): Hiệu năng OPC UA 2.000 monitored item @100 ms (E3/S4) chưa có số liệu — nếu pull không đạt phải đổi sang push, ảnh hưởng M4 §7.4.
Rủi ro 5 (A): Scope creep + sai im lặng — 6 milestone, 50 prompt, nhiều đầu ra "sẽ tạo sau" (semantics.md, facts/, acceptance/) dễ trôi nếu thiếu gate + review:cheats + reviewer độc lập mỗi PR.
Mơ hồ 1 (C): PRD §9 dùng M1–M8 cho lĩnh vực chức năng, trùng số milestone M0–M5 — SCR-001 đề xuất đổi thành F1–F8.
Mơ hồ 2 (B) + 3 (B): Số golden M1: PRD §13 ≥60 vs M1 §16 ≥80; thời lượng M0: PRD 1–2 tuần vs M0 spec 4–6 ngày — SCR-002/SCR-003, mặc định lấy spec chi tiết làm chuẩn.
Mơ hồ 4 (A): Tham chiếu gãy `M0 §17.4` (2 lần) và ký hiệu `AGENTS §9.7` — sửa cơ học thành `M0 §17 mục 4` / `§9 mục 7`; ví dụ `D-007` dùng ID quyết định chưa tồn tại.
Mơ hồ 5 (C): Worker vs server (E6/D-004, mặc định server Node, Worker chỉ là tùy chọn sau) — chờ quyết định của chủ sản phẩm, không chặn P0.1–P0.7.
