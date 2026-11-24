# STATE — Trạng thái dự án và bàn giao giữa các phiên

> **AI đọc file này đầu mỗi phiên và cập nhật cuối mỗi phiên.** Chủ sản phẩm kiểm tra và ký ở mục "Ký duyệt milestone". Giữ ngắn: tối đa ~150 dòng; lịch sử chi tiết nằm ở git và `docs/acceptance/`.

## 0. Năng lực công cụ (AI điền ở phiên đầu tiên)
- Shell: bash (Linux VM) · git: bản sao làm việc local (nhánh `m0/p0.1-repo-tooling`, commit local, KHÔNG push — mọi thay đổi GitHub đi qua trình duyệt UI trên máy chủ sản phẩm theo chỉ đạo 2026-11-24; `git clone` HTTPS trực tiếp bị chặn, repo private, không có credential trong VM) · `gh` CLI: 2.102.0, chưa login · Node 24.22.1, npm 10.9.4, pnpm: **không có binary** (`pnpm: command not found`, `corepack` không có) nhưng **dùng được qua `npx -y pnpm@10.15.0`** (10.15.0, ĐÃ CHẠY) · .NET SDK: **thiếu** · mạng: github.com 200, registry.npmjs.org 200 · mở được phiên reviewer độc lập: có (subagent)
- Quirk VM (2026-11-24, P0.1): `pnpm install`/`pnpm add` trong `~/workspace/vcs` (btrfs `/home/hatch`) luôn lỗi cuối `EPERM chown <file tạm>` (exit 255) — chown trực tiếp lúc được lúc không; `pnpm-lock.yaml` vì thế không ghi được tại chỗ. Cách xử lý: sinh lockfile trong bản sao ở `/tmp/vcs-lock` (ở đó pnpm ghi được, exit 0) rồi chép về; `node_modules` vẫn cài đủ (đã kiểm `tsc/eslint/vitest` chạy được) nhưng link workspace `@vcs/*` phải tạo tay (`ln -s`, đã tạo 7 link) vì install dừng trước bước link. **Hậu quả: `pnpm install --frozen-lockfile` CHƯA CHẠY ĐƯỢC trong VM này — phải kiểm lại trên CI và máy Windows (T-001).** Xem OQ-007.
- Hệ điều hành/ môi trường chạy: Linux VM (Muse); máy Windows của chủ sản phẩm chưa kiểm (spike S6, T-001)

## 1. Vị trí hiện tại
- Milestone: **M0** (P0.1 xong trên bản sao local, chưa đẩy lên GitHub; bootstrap I–II đã merge vào `develop` qua PR #1, merge commit `6567556`)
- Prompt đang làm / vừa xong: P0.1 — Repo + công cụ + CI + lint tất định + dependency-cruiser (xong, gate xanh local); tiếp theo: P0.2
- Nhánh: `m0/p0.1-repo-tooling` (bản sao local, commit local, chưa push — đẩy qua trình duyệt UI ở bước sau)
- Cập nhật lần cuối: 2026-11-24 bởi AI (P0.1)

## 2. Tiến độ prompt
| Prompt | Trạng thái | Commit/PR | Gate (đã tự chạy lại bởi chủ sản phẩm?) | Ghi chú |
|---|---|---|---|---|
| P0.1 | ✔ xong (gate xanh local; CI chưa chạy — chưa có trên GitHub) | nhánh local `m0/p0.1-repo-tooling` | lint/typecheck/depcheck/test/review:cheats xanh 2026-11-24 (10 test) | Chưa push; `pnpm install --frozen-lockfile` chưa chạy được trong VM (OQ-007) |
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
- Lệnh tái hiện nhanh: `npx -y pnpm@10.15.0 run lint && npx -y pnpm@10.15.0 run typecheck && npx -y pnpm@10.15.0 run depcheck && npx -y pnpm@10.15.0 run test && npx -y pnpm@10.15.0 run review:cheats` (ĐÃ CHẠY 2026-11-24: cả 5 xanh; test 10 passed; depcheck "no violations, 4 modules, 0 dependencies"; review:cheats SẠCH, quét 6 file). `node scripts/doctor.mjs` thoát 1 — chỉ do thiếu binary pnpm trong VM (xem OQ-007).
- Bước tiếp theo cụ thể: **đẩy nhánh `m0/p0.1-repo-tooling` lên GitHub qua trình duyệt UI** (file đã sẵn sàng, xem §3 cuối mục này), mở PR → `develop`, chờ CI xanh (ubuntu + windows × Node 20/22) rồi merge; sau đó P0.2 — @vcs/schemas + @vcs/project (M0 §4–5).
- Đẩy qua UI — danh sách file P0.1 (so với baseline bootstrap): `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `tsconfig.base.json`, `tsconfig.json`, `.npmrc`, `.nvmrc`, `.editorconfig`, `.prettierrc`, `.prettierignore`, `eslint.config.js`, `.dependency-cruiser.cjs`, `vitest.config.ts`, `vitest.workspace.ts`, `CONTRIBUTING.md`, `.github/workflows/ci.yml`, `packages/{schemas,kernel,project,test-utils}/{package.json,tsconfig.json,src/index.ts}`, `apps/{cli,server,web}/package.json`, `scripts/doctor.mjs`, `tests/tooling-gates.test.ts`, `tests/doctor.test.ts`, `docs/spikes/S6-env.md`, `docs/STATE.md`, `docs/open-questions.md`, `docs/OWNER-INBOX.md`. KHÔNG đẩy `node_modules/` (đã .gitignore).

## 4. Quyết định và giả định gần đây
| Ngày | Nội dung | Tham chiếu (ADR/OQ/spec §) |
|---|---|---|
| 2026-11-24 | Bootstrap: tài liệu đã đúng vị trí MANIFEST, không cần `git mv`; chỉ tạo 3 thư mục rỗng + audit | docs/acceptance/docs-audit.md |
| 2026-11-24 | Sửa cơ học tầng A: `M0 §17.4` → `M0 §17 mục 4`; `AGENTS §9.7` → `§9 mục 7`; ví dụ `D-007` → `D-003` | docs-audit §5, A-01…A-03 |
| 2026-11-24 | Tên sản phẩm đã thống nhất "Virtual Commissioning Studio" (6 lần, không biến thể) — đổi tên là no-op | docs-audit §5 A-05 |
| 2026-11-24 | PR template do chủ sản phẩm cung cấp, đưa nguyên văn lên `.github/pull_request_template.md` | OWNER-INBOX §3 (ghi chú) |
| 2026-11-24 | P0.1: ghim phiên bản devDeps đúng quy tắc ≥ 14 ngày (M0 §3.2): typescript 5.9.3, typescript-eslint 8.72.2, eslint 10.14.0, @eslint/js 9.39.5, prettier 3.9.10, vitest 4.1.12, dependency-cruiser 18.7.2, turbo 2.11.10, tsx 4.23.15, cross-env 10.1.0, @types/node 24.19.2. Bản `latest` lúc cài vi phạm quy tắc (typescript 7.0.2, typescript-eslint 8.74.0 mới 1 ngày, vitest 5.1.1 mới 6 ngày, eslint 10.15.0 mới 11 ngày, prettier 3.10.1 mới 12 ngày, dependency-cruiser 18.9.0 mới 2 ngày) | M0 §3.2; ngày phát hành kiểm bằng `npm view <pkg> time` |
| 2026-11-24 | P0.1: dùng vitest 4.1.12 thay vì vitest 5 — vitest 5 yêu cầu Node ^22.12/24/26, mâu thuẫn M0 §13 (CI chạy Node 20 và 22); vitest 4.1.12 hỗ trợ Node ^20/22/24 | M0 §13; `npm view vitest@5.1.0 engines` |
| 2026-11-24 | P0.1: ESLint 10 không còn bundle `@eslint/js` (dòng 10.x không tồn tại; mới nhất là 9.39.5, không có peerDependencies) — thêm `@eslint/js@9.39.5` làm devDependency trực tiếp | Kiểm bằng `npm view @eslint/js` + đọc `eslint@10.14.0/package.json` |
| 2026-11-24 | P0.1: Vitest 4 bỏ `defineWorkspace` (trả `undefined`) — `vitest.workspace.ts` export trực tiếp mảng project | Kiểm bằng `node -e` trên `vitest/dist/config.js` |
| 2026-11-24 | P0.1: Prettier mặc định tự chọn (spec không quy định style): singleQuote, trailingComma all, printWidth 100, semi, LF | `.prettierrc` |
| 2026-11-24 | P0.1: package `schemas/kernel/project/test-utils` chỉ có khung (`package.json` + `tsconfig.json` + `src/index.ts` chứa `export {};` + chú thích prompt nào điền) — chưa có logic nghiệp vụ; `apps/*` chỉ có `package.json` (tsconfig/src đến ở prompt của app). `turbo.json` đã tạo nhưng root scripts chưa gọi turbo (tránh chạy trùng/lặp) — turbo dùng từ P0.2 khi có script theo package | P0.1 prompt ("Không làm: logic nghiệp vụ"); M0 §3.1 "chỉ tạo package có nội dung" |
| 2026-11-24 | P0.1: CHƯA tạo script `dev/build/vcs/bench/test:e2e/docs:diagnostics` (chưa có code để chạy) — thêm ở prompt sở hữu: `vcs` P0.4, `bench` P0.3, `test:e2e` P0.6, `docs:diagnostics` P0.2, `dev/build` P0.5–P0.7. CI hiện chỉ có job `check` + `test` (ubuntu + windows × Node 20/22); job `e2e`/`bench`/`docs:diagnostics --check` thêm cùng prompt trên | M0 §3.3, §13; OQ-008 |
| 2026-11-24 | P0.1: làm theo mặc định D-002 (A: repo private, UNLICENSED, giữ `@vcs/*`) để viết `package.json` — chờ chủ sản phẩm quyết D-002 (ghi R-002, có quyền veto) | OWNER-INBOX D-002, R-002 |
| 2026-11-24 | P0.1 không có phần ngữ nghĩa thời gian (chưa có SimClock/TagDB) nên không có bảng timeline tính tay — golden timeline bắt đầu từ P0.3/P0.4 theo SKILL-testing-and-verification §2 | SKILL-testing-and-verification §2 |

## 5. Đang chờ chủ sản phẩm
Chỉ liệt kê **ID** (chi tiết ở `docs/OWNER-INBOX.md`; câu hỏi/ giả định ở `docs/open-questions.md`):
- Chặn tiến độ: D-001, D-004 (trước G0); T-002, T-003 (nên làm sớm, quyết định khả thi M5)
- Không chặn (duyệt sau): D-002, D-003, D-005, S-001, S-002, S-003, R-001, R-002; OQ-006, OQ-007, OQ-008 (mở, xem `docs/open-questions.md`)

## 6. Dữ liệu/môi trường cần có (🔑) và tình trạng
| Cần | Cho prompt | Tình trạng |
|---|---|---|
| Repo + CI | P0.1 | ✔ khung xong trên bản sao local (CI file `.github/workflows/ci.yml`: job `check` ubuntu + job `test` ubuntu/windows × Node 20/22); CI CHƯA CHẠY — chưa đẩy lên GitHub, cần kiểm lại trên CI thật (OQ-007) |
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
