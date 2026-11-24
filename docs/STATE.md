# STATE — Trạng thái dự án và bàn giao giữa các phiên

> **AI đọc file này đầu mỗi phiên và cập nhật cuối mỗi phiên.** Chủ sản phẩm kiểm tra và ký ở mục "Ký duyệt milestone". Giữ ngắn: tối đa ~150 dòng; lịch sử chi tiết nằm ở git và `docs/acceptance/`.

## 0. Năng lực công cụ (AI điền ở phiên đầu tiên)
- Shell: bash (Linux VM) · git: bản sao làm việc local (nhánh `m0/p0.2-schemas-project`, commit local, KHÔNG push — mọi thay đổi GitHub đi qua trình duyệt UI trên máy chủ sản phẩm theo chỉ đạo 2026-11-24; `git clone` HTTPS trực tiếp bị chặn, repo private, không có credential trong VM) · `gh` CLI: 2.102.0, chưa login · Node 24.22.1, npm 10.9.4, pnpm: **không có binary** (`pnpm: command not found`, `corepack` không có) nhưng **dùng được qua `npx -y pnpm@10.15.0`** (10.15.0, ĐÃ CHẠY) · .NET SDK: **thiếu** · mạng: github.com 200, registry.npmjs.org 200 · mở được phiên reviewer độc lập: có (subagent)
- Quirk VM (2026-11-24, P0.1; **gặp lại ở P0.2** khi `pnpm add zod/yaml/fast-check`): `pnpm install`/`pnpm add` trong `~/workspace/vcs` (btrfs `/home/hatch`) luôn lỗi cuối `EPERM chown <file tạm>` (exit 255) — chown trực tiếp lúc được lúc không; `pnpm-lock.yaml` vì thế không ghi được tại chỗ. Cách xử lý: sinh lockfile trong bản sao ở `/tmp/vcs-p02` (ở đó pnpm ghi được, exit 0) rồi chép về; `node_modules` vẫn cài đủ (đã kiểm `tsc/eslint/vitest` chạy được) nhưng link workspace `@vcs/*` phải tạo tay (`ln -s`, đã tạo 7 link) vì install dừng trước bước link. **Hậu quả: `pnpm install --frozen-lockfile` CHƯA CHẠY ĐƯỢC trong VM này — phải kiểm lại trên CI và máy Windows (T-001).** Xem OQ-007. **Sửa P0.2 (2026-11-24):** 7 link tay đã xóa; `node_modules` hiện do `pnpm install` thật tạo (đồng bộ từ `/tmp/vcs-fix`). Link tay từng che mất lỗi khai báo dependency khiến PR #9 CI đỏ (ERR_MODULE_NOT_FOUND) — xem OQ-012.
- Hệ điều hành/ môi trường chạy: Linux VM (Muse); máy Windows của chủ sản phẩm chưa kiểm (spike S6, T-001)

## 1. Vị trí hiện tại
- Milestone: **M0** (P0.1 đã merge vào `develop` qua PR #8, merge commit `e8707f2`, CI 6/6 xanh; P0.2 xong trên bản sao local, chưa đẩy lên GitHub; PR #9 CI đỏ ở job test — ERR_MODULE_NOT_FOUND `@vcs/schemas`, 147/163 — đã sửa, gate chạy lại 163/163 trên install thật)
- Prompt đang làm / vừa xong: P0.2 — `@vcs/schemas` + `@vcs/project` (xong, gate xanh local 163 test; đã sửa lỗi CI PR #9, chờ đẩy lên GitHub); tiếp theo: P0.3 (⚠ plan-first)
- Nhánh: `m0/p0.2-schemas-project` (bản sao local, commit local, chưa push — đẩy qua trình duyệt UI ở bước sau)
- Cập nhật lần cuối: 2026-11-24 bởi AI (P0.2)

## 2. Tiến độ prompt
| Prompt | Trạng thái | Commit/PR | Gate (đã tự chạy lại bởi chủ sản phẩm?) | Ghi chú |
|---|---|---|---|---|
| P0.1 | ✔ xong (gate xanh local; CI 6/6 xanh, đã merge PR #8 `e8707f2` vào `develop` 2026-11-24) | PR #8, nhánh `m0/p0.1-repo-tooling` (đã merge) | lint/typecheck/depcheck/test/review:cheats xanh 2026-11-24 (10 test local; CI 6/6) | `pnpm install --frozen-lockfile` chưa chạy được trong VM (OQ-007) |
| P0.2 | ✔ xong (gate xanh local; chưa push; đã sửa lỗi CI PR #9 — xem §4) | nhánh local `m0/p0.2-schemas-project` | lint/typecheck/depcheck/test/review:cheats + `docs:diagnostics --check` xanh 2026-11-24 (163 test; chạy lại sau sửa lỗi CI: 163/163 trên install thật, không symlink tay) | `@vcs/schemas` + `@vcs/project` + diagnostics; chi tiết §4 |
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
- Lệnh tái hiện nhanh: `npx -y pnpm@10.15.0 run lint && npx -y pnpm@10.15.0 run typecheck && npx -y pnpm@10.15.0 run depcheck && npx -y pnpm@10.15.0 run test && npx -y pnpm@10.15.0 run review:cheats && npx -y pnpm@10.15.0 run docs:diagnostics --check` (ĐÃ CHẠY 2026-11-24: cả 6 xanh; test 163 passed / 13 file; depcheck "no violations, 18 modules, 20 dependencies"; review:cheats SẠCH, quét 28 file; diagnostics --check khớp, 23 mã). `node scripts/doctor.mjs` thoát 1 — chỉ do thiếu binary pnpm trong VM (xem OQ-007). Gate chạy lại 2026-11-24 sau khi sửa lỗi CI PR #9: cả 6 xanh trên cả bản sao `/tmp/vcs-fix` (install thật) lẫn bản sao chính (đã đồng bộ `node_modules` thật, không còn symlink tay) — test 163/163, không còn ERR_MODULE_NOT_FOUND.
- Bước tiếp theo cụ thể: **đẩy các file P0.2 lên nhánh `m0/p0.2-schemas-project` qua trình duyệt UI** (danh sách dưới), mở PR vào `develop`, chờ CI xanh (ubuntu + windows × Node 22) rồi merge; sau đó P0.3 — @vcs/kernel (⚠ plan-first: ghi kế hoạch + bảng timeline tính tay vào STATE trước khi code).
- Đẩy qua UI — danh sách file P0.2 (so với `develop` sau PR #8): `package.json`, `pnpm-lock.yaml` (sinh lại: thêm `@vcs/schemas` `link:` — sửa lỗi CI PR #9), `packages/project/package.json` (thêm dep `@vcs/schemas` — sửa lỗi CI PR #9), `tsconfig.json`, `.prettierignore`, `.dependency-cruiser.cjs`, `.github/workflows/ci.yml`, `packages/schemas/package.json`, `packages/schemas/src/{common,duration,diagnostics-catalog,yaml,project,tags,migrate,protocol,index}.ts` + test (`common,duration,diagnostics-catalog,yaml,project,tags,protocol`).test.ts, `packages/project/src/{fs,hash,load,index}.ts` + test (`fs,hash,load`).test.ts, `packages/project/src/index.ts` (đã có khung P0.1, nay điền thật), `packages/schemas/src/index.ts` (điền thật), `scripts/gen-diagnostics.ts`, `tests/gen-diagnostics.test.ts`, `tests/tooling-gates.test.ts` (thêm 2 test hồi quy depcheck), `docs/diagnostics.md` (sinh tự động), `docs/STATE.md`, `docs/open-questions.md`. KHÔNG đẩy `node_modules/` (đã .gitignore).

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
| 2026-11-24 | P0.1: CHƯA tạo script `dev/build/vcs/bench/test:e2e/docs:diagnostics` (chưa có code để chạy) — thêm ở prompt sở hữu: `vcs` P0.4, `bench` P0.3, `test:e2e` P0.6, `docs:diagnostics` P0.2, `dev/build` P0.5–P0.7. CI hiện chỉ có job `check` + `test` (ubuntu + windows × Node 22, bỏ Node 20 theo A16); job `e2e`/`bench`/`docs:diagnostics --check` thêm cùng prompt trên | M0 §3.3, §13; OQ-008 |
| 2026-11-24 | P0.1: **bỏ Node 20 khỏi CI** (quyết B của chủ sản phẩm): PR #8 CI đỏ ở job test Node 20 (ubuntu + windows) vì `dependency-cruiser@18.7.2` yêu cầu Node `^22\|\|^24\|\|>=26` (`ERR_PNPM_UNSUPPORTED_ENGINE`); job `check` và test Node 22 xanh. Ghi AMENDMENTS **A16** (thắng M0 §13), sửa `.github/workflows/ci.yml` ma trận `node: [22]` | AMENDMENTS A16; PR #8; CI run #17/#18 |
| 2026-11-24 | P0.1: làm theo mặc định D-002 (A: repo private, UNLICENSED, giữ `@vcs/*`) để viết `package.json` — chờ chủ sản phẩm quyết D-002 (ghi R-002, có quyền veto) | OWNER-INBOX D-002, R-002 |
| 2026-11-24 | P0.1 không có phần ngữ nghĩa thời gian (chưa có SimClock/TagDB) nên không có bảng timeline tính tay — golden timeline bắt đầu từ P0.3/P0.4 theo SKILL-testing-and-verification §2 | SKILL-testing-and-verification §2 |
| 2026-11-24 | P0.2: ghim phiên bản đúng quy tắc ≥ 14 ngày (M0 §3.2): `zod@4.6.7` (2026-10-12), `yaml@2.9.1` (2026-09-11) vào `@vcs/schemas`; `fast-check@4.10.2` (2026-09-19) làm root devDependency. `fast-check@4.11.0` mới 3 ngày → loại | M0 §3.2; `npm view <pkg> time` |
| 2026-11-24 | P0.2: `TagCatalog` (M0 §6.5) đặt trong `@vcs/schemas` (`tags.ts`) để `@vcs/project` dùng trong `loadProject` mà không import `kernel` (graph §3.5 cấm project → kernel); `kernel` dùng lại ở P0.3 | M0 §6.5, §3.5; OQ-009 |
| 2026-11-24 | P0.2: sửa lỗi rule `schemas-standalone` trong `.dependency-cruiser.cjs` (P0.1): rule cũ cấm schemas import **mọi** package kể cả chính nó → 12 vi phạm giả khi schemas có nhiều file; thêm `pathNot` cho phép import nội bộ, vẫn cấm import package khác. Thêm 2 test hồi quy vào `tests/tooling-gates.test.ts` | M0 §3.5; depcheck xanh |
| 2026-11-24 | P0.2: `docs:diagnostics` (M0 §4.1, §13) — script `scripts/gen-diagnostics.ts` (tsx) sinh `docs/diagnostics.md` (23 mã) từ `DiagnosticCatalog`, quét source tìm mã chưa đăng ký (trừ `*.test.ts`), hỗ trợ `--check`; thêm script root + bước CI vào job `check` (sau `depcheck`, không đổi ma trận Node); `docs/diagnostics.md` thêm vào `.prettierignore` (file sinh tự động, không format tay) | M0 §4.1, §13; OQ-008 (đóng phần diagnostics) |
| 2026-11-24 | P0.2 — quyết định ngữ nghĩa: (a) khóa lạ phát hiện bằng descriptor `YamlShape` song song zod schema (zod v4 `z.object` strip khóa lạ, không báo được `unrecognized_keys`); PRJ-W001 kèm gợi ý Levenshtein ≤ 2; (b) zod v4 issue không có trường `input` — thông điệp thân thiện tra cứu giá trị từ object đã parse theo `issue.path`; (c) `schemaVersion` ≠ 1 không bị zod từ chối, `loadProject` gọi `migrateProject` (bảng M0 rỗng) rồi báo PRJ-E006; (d) hash project = sha256 của các dòng `${path}:${sha256}` đã sắp xếp; `hashText` strip BOM + CRLF→LF; (e) `SimState = IDLE \| RUNNING \| PAUSED` (M0 §8.2); `PROTOCOL_VERSION = 1`; (f) controller `external` bắt buộc `endpoint` | M0 §4–5, §6.5, §8.2, §9.2; OQ-010, OQ-011 |
| 2026-11-24 | P0.2 — số lượng test theo M0 §12.1: duration 33 (≥15), yaml 21 (≥20), project+tags 50 (≥35), loadProject+memoryFS+hashText 23 (≥15), protocol 12 (≥12); tổng 163 test / 13 file. 3 lỗi kỳ vọng test được sửa trong lúc chạy (dòng của khóa lạ lồng nhau, định dạng gợi ý, `stepMs=0` → PRJ-E007 chứ không phải E003) — implementation không đổi, đều có bằng chứng debug | M0 §12.1 |
| 2026-11-24 | P0.2 — sửa lỗi CI PR #9 (nguyên nhân gốc): `packages/project/package.json` và root `package.json` chưa từng khai báo `@vcs/schemas` dù `load.ts` và `scripts/gen-diagnostics.ts` import nó; `pnpm-lock.yaml` có 0 dòng `@vcs/schemas`. Gate local xanh chỉ vì 7 symlink tay trong `node_modules/@vcs` (workaround EPERM P0.1) che mất lỗi. Sửa: thêm `"@vcs/schemas": "workspace:*"` vào cả hai `package.json`; sinh lại lockfile bằng `pnpm install` trong bản sao `/tmp/vcs-fix` (exit 0; lockfile có `link:packages/schemas` và `link:../schemas`); xóa symlink tay, đồng bộ `node_modules` thật về bản sao chính; chạy lại đủ gate ở cả hai nơi: 163/163 test, không còn ERR_MODULE_NOT_FOUND. Grep toàn repo: không còn import `@vcs/*` nào thiếu dependency | M0 §3.2, §13; OQ-012 |

## 5. Đang chờ chủ sản phẩm
Chỉ liệt kê **ID** (chi tiết ở `docs/OWNER-INBOX.md`; câu hỏi/ giả định ở `docs/open-questions.md`):
- Chặn tiến độ: D-001, D-004 (trước G0); T-002, T-003 (nên làm sớm, quyết định khả thi M5)
- Không chặn (duyệt sau): D-002, D-003, D-005, S-001, S-002, S-003, R-001, R-002; OQ-006, OQ-007, OQ-009, OQ-010, OQ-011, OQ-012 (mở, xem `docs/open-questions.md`)

## 6. Dữ liệu/môi trường cần có (🔑) và tình trạng
| Cần | Cho prompt | Tình trạng |
|---|---|---|
| Repo + CI | P0.2 | ✔ P0.1 đã merge (PR #8, `e8707f2`, CI 6/6 xanh); P0.2 xong local trên nhánh `m0/p0.2-schemas-project`, chưa push — đã sửa lỗi CI PR #9 (khai báo `workspace:*` + lockfile mới), chờ đẩy qua UI và CI xanh lại. `pnpm install --frozen-lockfile` trong VM vẫn chưa chạy được (OQ-007) |
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
