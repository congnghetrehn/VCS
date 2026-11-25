# STATE — Trạng thái dự án và bàn giao giữa các phiên

> **AI đọc file này đầu mỗi phiên và cập nhật cuối mỗi phiên.** Chủ sản phẩm kiểm tra và ký ở mục "Ký duyệt milestone". Giữ ngắn: tối đa ~150 dòng; lịch sử chi tiết nằm ở git và `docs/acceptance/`.

## 0. Năng lực công cụ (AI điền ở phiên đầu tiên)

- Shell: bash (Linux VM) · git: bản sao làm việc local (nhánh `m0/p0.4-orchestrator`, commit local, KHÔNG push — mọi thay đổi GitHub đi qua trình duyệt UI trên máy chủ sản phẩm theo chỉ đạo 2026-11-24; `git clone` HTTPS trực tiếp bị chặn, repo private, không có credential trong VM) · `gh` CLI: 2.102.0, chưa login · Node 24.22.1, npm 10.9.4, pnpm: **không có binary** (`pnpm: command not found`, `corepack` không có) nhưng **dùng được qua `npx -y pnpm@10.15.0`** (10.15.0, ĐÃ CHẠY) · .NET SDK: **thiếu** · mạng: github.com 200, registry.npmjs.org 200 · mở được phiên reviewer độc lập: có (subagent)
- Quirk VM (2026-11-24, P0.1; **gặp lại ở P0.2** khi `pnpm add zod/yaml/fast-check`): `pnpm install`/`pnpm add` trong `~/workspace/vcs` (btrfs `/home/hatch`) luôn lỗi cuối `EPERM chown <file tạm>` (exit 255) — chown trực tiếp lúc được lúc không; `pnpm-lock.yaml` vì thế không ghi được tại chỗ. Cách xử lý: sinh lockfile trong bản sao ở `/tmp/vcs-p02` (ở đó pnpm ghi được, exit 0) rồi chép về; `node_modules` vẫn cài đủ (đã kiểm `tsc/eslint/vitest` chạy được) nhưng link workspace `@vcs/*` phải tạo tay (`ln -s`, đã tạo 7 link) vì install dừng trước bước link. **Hậu quả: `pnpm install --frozen-lockfile` CHƯA CHẠY ĐƯỢC trong VM này — phải kiểm lại trên CI và máy Windows (T-001).** Xem OQ-007. **Sửa P0.2 (2026-11-24):** 7 link tay đã xóa; `node_modules` hiện do `pnpm install` thật tạo (đồng bộ từ `/tmp/vcs-fix`). Link tay từng che mất lỗi khai báo dependency khiến PR #9 CI đỏ (ERR_MODULE_NOT_FOUND) — xem OQ-012. **P0.4:** đồng bộ `node_modules` từ `/tmp` về phải gồm cả `node_modules` từng package (`apps/cli`, `packages/*`), không chỉ root — thiếu `apps/cli/node_modules/commander` làm lint/typecheck đỏ ở bản chính trong khi bản `/tmp` xanh dù source giống hệt (lỗi `commander` không resolve được type). **P0.5 (2026-11-24): `pnpm install --frozen-lockfile` CHẠY ĐƯỢC lần đầu trong bản sao `/tmp/vcs-p05` (exit 0, "Already up to date")** — lockfile hiện đầy đủ, không còn thiếu link workspace; trong `~/workspace/vcs` vẫn EPERM nên mọi `pnpm add/install` vẫn phải làm ở `/tmp` rồi chép lockfile + đồng bộ `node_modules` về. Lưu ý: `depcheck` ở bản chính đếm 61 module/115 dep, ở `/tmp` 57/101 — lệch do bản chính có `apps/*/dist/` (build output) cũng bị cruise; cả hai đều "no violations".
- Hệ điều hành/ môi trường chạy: Linux VM (Muse); máy Windows của chủ sản phẩm chưa kiểm (spike S6, T-001)

## 1. Vị trí hiện tại

- Milestone: **M1 — ĐÃ KÝ 2026-11-25** (M0 đã ký 2026-11-24, trên main `31c7200`; P1.1–P1.7 + G1 đã merge vào `develop` qua PR #20–#27)
- Prompt đang làm / vừa xong: G1 — **✔ đã merge PR #27 `85ab770` vào `develop` 2026-11-25 16:48 +07**; **M1 ĐÃ KÝ 2026-11-25** (STATE §8). Tiếp theo: đẩy main per D-001, rồi P0.9 (chủ sản phẩm chọn làm, D-005: B).
- Nhánh: `m0/p0.9-pwa` (từ `3ca09d6` = M1 đã ký trên `develop` `b7cb601`, đã đẩy main `1a2beed3`)
- Cập nhật lần cuối: 2026-11-25 bởi AI (M1 đã ký; đẩy main + P0.9 tiếp theo)

## 2. Tiến độ prompt

| Prompt | Trạng thái                                                                                                                                                     | Commit/PR                                         | Gate (đã tự chạy lại bởi chủ sản phẩm?)                                                                                                                                   | Ghi chú                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P0.1   | ✔ xong (gate xanh local; CI 6/6 xanh, đã merge PR #8 `e8707f2` vào `develop` 2026-11-24)                                                                       | PR #8, nhánh `m0/p0.1-repo-tooling` (đã merge)    | lint/typecheck/depcheck/test/review:cheats xanh 2026-11-24 (10 test local; CI 6/6)                                                                                        | `pnpm install --frozen-lockfile` chưa chạy được trong VM (OQ-007) |
| P0.2   | ✔ xong (gate xanh local; đã merge PR #9 `f3d769a` vào `develop` 2026-11-24, CI 6/6 xanh sau sửa lỗi khai báo `workspace:*`)                                    | PR #9, nhánh `m0/p0.2-schemas-project` (đã merge) | lint/typecheck/depcheck/test/review:cheats + `docs:diagnostics --check` xanh 2026-11-24 (163 test; chạy lại sau sửa lỗi CI: 163/163 trên install thật, không symlink tay) | `@vcs/schemas` + `@vcs/project` + diagnostics; chi tiết §4        |
| P0.3   | ✔ xong (gate xanh local cả bản sao `/tmp` install thật lẫn bản sao chính; bench 4/4 PASS; đã merge PR #10 `4a1181a` vào `develop` 2026-11-24)                  | PR #10, nhánh `m0/p0.3-kernel` (đã merge)         | lint/typecheck/depcheck/test/review:cheats + `docs:diagnostics --check` xanh 2026-11-24 (272 test, 19 file; 109 test mới)                                                 | xem §10 + §4                                                      |
| P0.4   | ✔ xong (gate xanh cả bản sao `/tmp` install thật lẫn bản sao chính; bench TagDB 4/4 PASS; bench orchestrator PASS 504 606 bước/s sau sửa OQ-032 — xem A17; đã merge PR #11 `fc167e1` vào `develop` 2026-11-24) | PR #11, nhánh `m0/p0.4-orchestrator` (đã merge) | lint/typecheck/depcheck/test/review:cheats + `docs:diagnostics --check` xanh 2026-11-24 (369 test, 27 file; 97 test mới)                                                 | xem §11 + §4                                                      |
| P0.5   | ✔ xong (gate xanh cả bản sao `/tmp` install thật lẫn bản sao chính; test 420/420, 51 test mới; bench guard PASS; đã merge PR #12 `65cd373` vào `develop` 2026-11-24, CI 6/6 xanh sau sửa OQ-056)                                                                                                                                                       | PR #12, nhánh `m0/p0.5-server` (đã merge) | lint/typecheck/depcheck/test/review:cheats + `docs:diagnostics --check` xanh 2026-11-24 (420 test, 31 file; 51 test mới) + build tsup xanh + smoke dist | xem §12                                                           |
| P0.6   | ✔ xong (gate xanh cả bản sao `/tmp/vcs-p06` install thật lẫn bản sao chính; vitest 438/438, e2e 5/5 local; bench guard PASS; kiểm cuộn 20 000 dòng: probe PASS 1 lần, đo tay 45,7–60,0 FPS — xem §13; OQ-062 đã quyết (a), A19)                                                                                         | PR #13, nhánh `m0/p0.6-web` (đã merge `471a2ec` 2026-11-24 16:48 +07, CI 8/8 xanh) | lint/typecheck/depcheck/test/test:e2e/review:cheats + `docs:diagnostics --check` xanh 2026-11-24 (438 test vitest, 35 file; 17 test unit mới + 5 e2e) + build xanh + smoke `GET /` | xem §13 |
| P0.7   | ✔ xong (gate xanh cả bản sao `/tmp/vcs-p07` install thật lẫn bản sao chính; test 439/439 + coverage §13 PASS + e2e 5/5; bench baseline + hồi quy; đã merge PR #14 `0188cf8` vào `develop` 2026-11-24 17:24 +07, CI 8 successful + 2 skipped) | PR #14, nhánh `m0/p0.7-docs` (đã merge) | lint/typecheck/depcheck/test (+coverage)/test:e2e/review:cheats + `docs:diagnostics --check` xanh 2026-11-24 (439 test vitest, 35 file; 1 test ghim hash mới) + build xanh + bench PASS | xem §14 |
| P0.8   | ✔ xong (gate xanh local; đã merge PR #19 `aecb372` vào `develop` 2026-11-25 00:31 +07, CI 8 successful + 2 skipped) | PR #19, nhánh `m0/p0.8-interfaces` (đã merge) | lint/typecheck/depcheck/test/test:e2e/review:cheats + `docs:diagnostics --check` + build xanh 2026-11-24 (507 test, 36 file; 68 test mới) + bench TagDB 4/4 + orchestrator 443.627 bước/s | xem §15; OQ-075…081 đóng |
| P0.9   | ◐ đang làm (chủ sản phẩm chọn B ở D-005 ngày 2026-11-25, sau khi ký M1; plan ở §23, 2026-11-25)                                                                                          | nhánh `m0/p0.9-pwa` (plan) |                                                                                                                                                                           | plan-first; HTTPS cho LAN ghi ADR-0009, D-007 chờ owner quyết, không tự đổi bind              |
| G0     | ✔ đã ký 2026-11-24 (gói bằng chứng `docs/acceptance/M0.md`, 12/12 §15 ĐẠT; probe bổ sung 3/3 PASS; Windows 439/439 sau fix OQ-074) | nhánh `m0/g0-acceptance` (đã merge PR #15) | gate xanh 2026-11-24 ở bản sao sạch (439 test + coverage PASS, e2e 5/5, bench PASS, hash ghim khớp 2 lần chạy) | gói nghiệm thu M0 |
| P1.1   | ✔ xong (gate xanh local; đã merge PR #20 `8b3dbb6` vào `develop` 2026-11-25 01:13 +07, CI xanh) | PR #20, nhánh `m1/p1.1-runtime-iec` (đã merge) | lint/typecheck/depcheck/test/test:e2e/review:cheats + `docs:diagnostics --check` xanh (651 test, 40 file; 144 test mới) + build xanh + bench guard PASS | xem §16; OQ-082…091 đóng |
| P1.2   | ✔ xong (gate xanh local; đã merge PR #21 `278e3af` vào `develop` 2026-11-25 05:13 +07, CI 8 successful + 2 skipped) | PR #21, nhánh `m1/p1.2-scl-parser` (đã merge) | lint/typecheck/depcheck/test/test:e2e/review:cheats + `docs:diagnostics --check` xanh (746 test, 42 file; 95 test mới) + build xanh + bench guard PASS | xem §17; OQ-092…104 đóng, OQ-105 mở |
| P1.3   | ✔ xong (gate xanh local; đã merge PR #22 `681e39d` vào `develop` 2026-11-25 07:24 +07, CI 8 successful + 2 skipped) | PR #22, nhánh `m1/p1.3-typecheck-lower` (đã merge) | lint/typecheck/depcheck/test/test:e2e/review:cheats + `docs:diagnostics --check` xanh (1310 test; 564 test mới) + build xanh + bench TagDB 4/4 (49,1M ops/s) + orchestrator 481.809 bước/s | xem §18; OQ-106…129 đóng |
| P1.4   | ✔ xong (gate xanh local; đã merge PR #23 `ae0bed3` vào `develop` 2026-11-25 10:56 +07, CI 10 checks passed)                                                                                                                                                         |                                                   |                                                                                                                                                                           | X-002/S1 vẫn mở nhưng không chặn (làm theo §7/§8, OQ-152) |
| P1.5   | ✔ xong (gate xanh local; đã merge PR #24 `02d75ef` vào `develop` 2026-11-25 11:59 +07, CI 8 successful + 2 skipped) | PR #24, nhánh `m1/p1.5-std-blocks` (đã merge) | lint/typecheck/depcheck/test/test:e2e/review:cheats + `docs:diagnostics --check` xanh 2026-11-25 (1666 test, 63 file; 100 test mới) + build xanh + bench guard PASS | xem §20; OQ-162…181 đóng, OQ-161 mở |
| P1.6   | ✔ xong (gate xanh local; đã merge PR #25 `0f58e15` vào `develop` 2026-11-25 13:28 +07, CI 8 successful + 2 skipped) | PR #25, nhánh `m1/p1.6-lad` (đã merge) | lint/typecheck/depcheck/test/test:e2e/review:cheats + `docs:diagnostics --check` xanh 2026-11-25 (1749 test, 68 file; 83 test mới) + build xanh + bench guard PASS | xem §21; OQ-182…196 đóng, OQ-161 mở |
| P1.7   | ✔ xong (gate xanh local; đã merge PR #26 `7a927e1` vào `develop` 2026-11-25 16:23 +07, CI 8 successful + 2 skipped) | PR #26, nhánh `m1/p1.7-golden-runner` (đã merge) | lint/typecheck/depcheck/test/test:e2e/review:cheats + `docs:diagnostics --check` xanh 2026-11-25 (1927 test, 76 file; 178 test mới) + build xanh + bench softplc 1738 scan/s (parent) / 1664 scan/s (G1) | xem §22; OQ-197…216 đóng, OQ-217 mới, OQ-161 mở |
| G1     | ✔ đã ký 2026-11-25 (gói nghiệm thu `docs/acceptance/M1.md`, 9/9 §16 ĐẠT; probe bổ sung 4/4 PASS; §16.5 + OQ-161 chưa quyết, giữ mặc định) | nhánh `m1/g1-acceptance` (đã merge PR #27 `85ab770`) | gate xanh 2026-11-25 ở bản sao sạch `/tmp/vcs-g1` (1927 test + coverage PASS, e2e 6/6, bench softplc 1664 scan/s) | gói nghiệm thu M1; ký là tier C |
| P2.1   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | ⚠ plan-first                                                      |
| P2.2   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | ⚠ plan-first                                                      |
| P2.3   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           |                                                                   |
| P2.4   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | ⚠ plan-first                                                      |
| P2.5   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           |                                                                   |
| P2.6   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           |                                                                   |
| P2.7   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | ⚠ plan-first, cần X-003                                           |
| P2.8   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           |                                                                   |
| G2     | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | gói nghiệm thu M2                                                 |
| P3.1   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | ⚠ plan-first                                                      |
| P3.2   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           |                                                                   |
| P3.3   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | ⚠ plan-first                                                      |
| P3.4   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | cần X-004                                                         |
| P3.5   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | cần X-004                                                         |
| P3.6   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | ⚠ plan-first                                                      |
| P3.7   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | ⚠ plan-first                                                      |
| P3.8   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           |                                                                   |
| G3     | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | gói nghiệm thu M3                                                 |
| P4.1   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | ⚠ plan-first                                                      |
| P4.2   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           |                                                                   |
| P4.3   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | ⚠ plan-first                                                      |
| P4.4   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | ⚠ plan-first, cần X-005                                           |
| P4.5   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           |                                                                   |
| P4.6   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           |                                                                   |
| P4.7   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | cần X-005                                                         |
| P4.8   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           |                                                                   |
| P4.9   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           |                                                                   |
| G4     | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | gói nghiệm thu M4                                                 |
| P5.1   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | ⚠ plan-first                                                      |
| P5.2   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | ⚠ plan-first                                                      |
| P5.3   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           |                                                                   |
| P5.4   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | cần X-006                                                         |
| P5.5   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | ⚠ plan-first                                                      |
| P5.6   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | cần X-006                                                         |
| P5.7   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | cần X-007                                                         |
| P5.8   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | ⚠ plan-first, cần X-007                                           |
| P5.9   | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | cần X-008                                                         |
| G5     | ☐ chưa                                                                                                                                                         |                                                   |                                                                                                                                                                           | gói nghiệm thu M5                                                 |

Trạng thái: ☐ chưa · ◐ đang làm · ✔ xong (gate xanh + đã kiểm) · ✖ bị chặn (nêu lý do)

## 3. Việc đang dở (cho phiên sau)

- File/hàm đang sửa: — (G0 xong file nghiệm thu, CHƯA mở PR — xem `docs/acceptance/M0.md`)
- Test đang hỏng (nguyên văn): — (G0: gate xanh ở bản sao sạch `/tmp/vcs-g0` install thật — vitest 439/439 + coverage §13 PASS (kernel 97,66%, schemas 95,92%, project 97,83%), e2e 5/5, review:cheats SẠCH, diagnostics khớp, build 3/3; bench TagDB 4/4 (set/get 44,8M ops/s), orchestrator 442 432 bước/s; `check-bench-regression` exit 0, không có hồi quy > 20%; hash ghim khớp 2 lần chạy. P0.7 trước đó: TagDB set/get 51,7M ops/s, orchestrator 508 058 bước/s bản chính.)
- Lệnh tái hiện nhanh: `npx -y pnpm@10.15.0 run lint && npx -y pnpm@10.15.0 run typecheck && npx -y pnpm@10.15.0 run depcheck && npx -y pnpm@10.15.0 run test && npx -y pnpm@10.15.0 run test:e2e && npx -y pnpm@10.15.0 run review:cheats && npx -y pnpm@10.15.0 run docs:diagnostics --check` (ĐÃ CHẠY 2026-11-24 ở P0.6: cả 7 xanh ở cả bản sao `/tmp/vcs-p06` (`pnpm install --frozen-lockfile` exit 0 — OQ-007) lẫn bản sao chính; vitest 438 passed / 35 file (17 test unit mới); e2e 5/5 local (E1–E5, Chromium cài được ở VM — xem §6); depcheck "no violations, 82 modules, 134 dependencies" ở `/tmp` (86 modules, 148 dependencies ở bản chính — lệch do cruise cả `apps/*/dist/` + `test-results/`, không có violation); review:cheats SẠCH, quét 108 file; diagnostics --check khớp, 24 mã). `pnpm bench` ĐÃ CHẠY: set/get 45,4M ops/s (≥10M), flush 5000/0 đổi 0,14 µs (≤50), flush 1000 đổi + 1 sub 0,062 ms (≤1), heap −0,05 MB (<1) — TagDB 4/4 PASS; orchestrator 513 310 bước/s — PASS. `pnpm build` ĐÃ CHẠY: turbo xanh 3 app (server/cli tsup + web vite, `apps/web/dist` có `index.html` + assets); smoke: `vcs serve examples/hello-tags` → `GET /` trả `index.html`, `/api/health` `{"ok":true}`, asset JS 200.
- Bước tiếp theo cụ thể: **P1.5 triển khai** theo plan §20 (nhánh `m1/p1.5-std-blocks`), rồi mở PR P1.5 (plan + triển khai chung một PR), chờ CI xanh, merge; rồi P1.6 plan-first (LAD). X-002/S1 vẫn mở (chủ sản phẩm đưa mã SCL thật khi có) — không chặn P1.5. OQ-054 (sửa golden S1 dòng 6) chờ duyệt sau — không chặn. OQ-161 (layout IN_OUT multi-instance lồng) vẫn mở — P1.5 không quyết (xem §20).
- Đẩy qua UI — danh sách file P0.7 (so với `develop` @ `471a2ec`, nhánh `m0/p0.7-docs`, CHƯA mở PR): `package.json` (script `test` thêm `--coverage`, devDep `@vitest/coverage-v8@4.1.12`), `pnpm-lock.yaml`, `vitest.config.ts` (coverage v8, ngưỡng dòng theo glob §13), `apps/cli/src/commands/run.test.ts` (+1 test ghim hash §15.6), `packages/kernel/src/tags.test.ts` (timeout 60 s cho test heap 10M ops khi đo coverage — xem §14), `.github/workflows/ci.yml` (comment coverage + job bench gọi `check-bench-regression.mjs`), `scripts/check-bench-regression.mjs` (mới), `bench/baseline.json` (mới, trung vị 5 mẫu), `docs/architecture.md` (mới), `docs/semantics.md` (mới, phần M0), `docs/adr/0001-package-jit-monorepo.md` … `0007-main-guard-tsup-split.md` (mới), `README.md` (viết lại), `docs/STATE.md`, `docs/open-questions.md` (OQ-071…073 đóng). KHÔNG đẩy `node_modules/`, `apps/*/dist/`, `bench/results.json`, `coverage/`, `test-results/`.
- Đẩy qua UI — danh sách file P0.6 (so với `develop` @ `65cd373`, nhánh `m0/p0.6-web`, đã merge PR #13 `471a2ec` 2026-11-24): `package.json` (script `test:e2e`, `typecheck` thêm web tsconfig, devDep `@playwright/test@1.65.0`), `pnpm-lock.yaml` (react 19.3.1, react-dom 19.3.1, zustand 5.1.0, @tanstack/react-virtual 3.14.26, vite 8.3.7, @vitejs/plugin-react 6.3.0, tailwindcss 4.3.5, @tailwindcss/vite 4.3.5, @types/react 19.3.0, @types/react-dom 19.3.0, @playwright/test 1.65.0 + link workspace; lưu ý: `vite@8.3.8` trong lockfile là transitive của vitest 4.1.12, đã có từ trước P0.6 — không phải vite của web (8.3.7); `immer`/`use-sync-external-store` là peer optional của zustand, pnpm KHÔNG cài), `tsconfig.json` (exclude `apps/web/**`, include `playwright.config.ts`), `playwright.config.ts`, `.gitignore` (`apps/web/e2e/fixtures/big-project/`, `test-results/`), `.github/workflows/ci.yml` (job `e2e` mới, ubuntu), `scripts/ensure-web-dist.mjs`, `apps/web/package.json` (deps + script `dev`/`build`) + `tsconfig.json` (riêng: lib DOM, jsx react-jsx — root tsconfig lib ES2022 không typecheck được `.tsx`, xem §13) + `vite.config.ts` + `index.html` + `src/{main.tsx,App.tsx,format.ts,format.test.ts,store.ts,store.test.ts,ws-client.ts,ws-client.test.ts,vite-env.d.ts,index.css}` + `src/i18n/{index,vi,en}.ts` + `index.test.ts` + `src/components/{SimBar,TagTable,DiagnosticsPanel}.tsx` + `e2e/{helpers,e1,e2,e3,e4,e5,perf-scroll}.spec.ts` + `e2e/fixtures/gen-big-project.ts`, `apps/server/src/ws.test.ts` (fix OQ-044: test trỏ `webDistDir` vào thư mục tạm trống — kiểm chứng gate của parent), `docs/STATE.md`, `docs/open-questions.md` (OQ-057…OQ-070 đã ghi từ plan; OQ-062 đóng). KHÔNG đẩy `node_modules/`, `apps/*/dist/`, `bench/results.json`, `apps/web/e2e/fixtures/big-project/`, `test-results/`.
- Đẩy qua UI — danh sách file P0.4 (so với `develop` @ `4a1181a`): `package.json` (script `vcs` + dep `@vcs/project`), `pnpm-lock.yaml` (commander 15.1.0 + link workspace), `tsconfig.base.json` (path `@vcs/kernel/demo`), `.gitignore` (`bench/project-5000/`), `packages/kernel/package.json` (export `./demo`), `packages/kernel/src/{component,errors,orchestrator,builder,pacer,index}.ts` + `demo/{loopback,extension,index}.ts` + test (`orchestrator`, `builder`, `pacer`, `demo/loopback` test), `packages/test-utils/src/sim.ts` + `index.ts` + `sim.test.ts`, `apps/cli/package.json` (commander 15.1.0), `apps/cli/tsconfig.json`, `apps/cli/src/{index,extensions}.ts`, `apps/cli/src/commands/{index,version,validate,run}.ts` + test, `examples/hello-tags/{vcs.project.yaml,tags/tags.yaml}`, `scripts/gen-bench-project.ts`, `bench/orchestrator.bench.ts`, `docs/STATE.md`, `docs/open-questions.md` (OQ-030/031/032). KHÔNG đẩy `node_modules/`, `bench/results.json`, `bench/project-5000/`, file profile tạm (đã xóa).
- Đẩy qua UI — bản sửa OQ-032 (so với PR #11 @ `aa4e9ea`, commit riêng `fix(m0): sparse I/O in LoopbackController + empty bench project (OQ-032)`): `docs/AMENDMENTS.md` (hàng A17), `docs/STATE.md`, `docs/open-questions.md` (đóng OQ-032, cập nhật OQ-026), `scripts/gen-bench-project.ts` (project "rỗng" 8 rule), `bench/orchestrator.bench.ts` (comment A17), `packages/kernel/src/demo/{loopback,extension}.ts` (I/O thưa), `packages/kernel/src/demo/loopback.test.ts` (test mới), `packages/kernel/src/tags.ts` (`flush()` duyệt danh sách dirty), `packages/kernel/src/{builder,orchestrator}.test.ts` (truyền TagDB vào constructor LoopbackController). KHÔNG đẩy `node_modules/`, `bench/results.json`, `bench/project-5000/`.
- Đẩy qua UI — danh sách file P0.5 (so với `develop` @ `fc167e1`, nhánh `m0/p0.5-server`, CHƯA mở PR): `package.json` (script `dev`/`build`, devDep `tsup@9.0.0` + `@types/ws@8.18.2`), `pnpm-lock.yaml` (fastify 5.12.8, @fastify/websocket 11.3.7, @fastify/static 10.1.10, pino 10.4.0, ws 8.22.2 dev, tsup 9.0.0, @types/ws 8.18.2 + link workspace), `eslint.config.js` (ignore `**/dist/**`), `apps/server/package.json` + `tsconfig.json` + `tsup.config.ts` + `src/{index,main,server,routes,ws,config,sim-service,extensions,version}.ts` + test (`config`, `sim-service`, `ws` test), `apps/cli/package.json` (dep `@vcs/server` + `yaml`/`fastify`/@fastify/*/`pino` trực tiếp cho dist) + `tsconfig.json` + `tsup.config.ts` + `src/commands/{index,serve}.ts` + `serve.test.ts` + `version.test.ts` (đổi unknown command `'serve'` → `'lạ'`), `packages/schemas/src/diagnostics-catalog.ts` (WS-E003), `docs/diagnostics.md` (24 mã), `docs/STATE.md`, `docs/open-questions.md` (OQ-033…OQ-055). KHÔNG đẩy `node_modules/`, `apps/*/dist/`, `bench/results.json`.
- Đẩy qua UI — danh sách file P0.3 (so với `develop` @ `f3d769a`): `package.json` (script `bench` + dep `@vcs/kernel`, script `test` thêm `NODE_OPTIONS=--expose-gc`), `pnpm-lock.yaml`, `tsconfig.json` (include `bench/`), `eslint.config.js` (console cho phép ở `bench/`), `.gitignore` (`bench/results.json`), `.github/workflows/ci.yml` (job `bench` tay/nightly), `packages/kernel/package.json`, `packages/kernel/src/{clock,errors,tags,iobus,hasher,index}.ts` + test (`clock/tags/iobus/hasher/golden-timeline.test.ts`), `packages/test-utils/package.json`, `packages/test-utils/src/{tags,clock,record,wait,index}.ts` + `test-utils.test.ts`, `bench/tagdb.bench.ts`, `docs/STATE.md`, `docs/open-questions.md` (không đổi nội dung OQ). KHÔNG đẩy `node_modules/`, `bench/results.json` (đã ignore).
- Đẩy qua UI — danh sách file P0.2 (đã merge PR #9 `f3d769a`, không cần đẩy lại): `package.json`, `pnpm-lock.yaml`, `packages/project/package.json`, `tsconfig.json`, `.prettierignore`, `.dependency-cruiser.cjs`, `.github/workflows/ci.yml`, `packages/schemas/package.json`, `packages/schemas/src/{common,duration,diagnostics-catalog,yaml,project,tags,migrate,protocol,index}.ts` + test, `packages/project/src/{fs,hash,load,index}.ts` + test, `scripts/gen-diagnostics.ts`, `tests/gen-diagnostics.test.ts`, `tests/tooling-gates.test.ts`, `docs/diagnostics.md`, `docs/STATE.md`, `docs/open-questions.md`. KHÔNG đẩy `node_modules/` (đã .gitignore).

## 4. Quyết định và giả định gần đây

| Ngày       | Nội dung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Tham chiếu (ADR/OQ/spec §)                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 2026-11-24 | Bootstrap: tài liệu đã đúng vị trí MANIFEST, không cần `git mv`; chỉ tạo 3 thư mục rỗng + audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | docs/acceptance/docs-audit.md                                                     |
| 2026-11-24 | Sửa cơ học tầng A: `M0 §17.4` → `M0 §17 mục 4`; `AGENTS §9.7` → `§9 mục 7`; ví dụ `D-007` → `D-003`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | docs-audit §5, A-01…A-03                                                          |
| 2026-11-24 | Tên sản phẩm đã thống nhất "Virtual Commissioning Studio" (6 lần, không biến thể) — đổi tên là no-op                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | docs-audit §5 A-05                                                                |
| 2026-11-24 | PR template do chủ sản phẩm cung cấp, đưa nguyên văn lên `.github/pull_request_template.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | OWNER-INBOX §3 (ghi chú)                                                          |
| 2026-11-24 | P0.1: ghim phiên bản devDeps đúng quy tắc ≥ 14 ngày (M0 §3.2): typescript 5.9.3, typescript-eslint 8.72.2, eslint 10.14.0, @eslint/js 9.39.5, prettier 3.9.10, vitest 4.1.12, dependency-cruiser 18.7.2, turbo 2.11.10, tsx 4.23.15, cross-env 10.1.0, @types/node 24.19.2. Bản `latest` lúc cài vi phạm quy tắc (typescript 7.0.2, typescript-eslint 8.74.0 mới 1 ngày, vitest 5.1.1 mới 6 ngày, eslint 10.15.0 mới 11 ngày, prettier 3.10.1 mới 12 ngày, dependency-cruiser 18.9.0 mới 2 ngày)                                                                                                                                                                                                                                                                                                                   | M0 §3.2; ngày phát hành kiểm bằng `npm view <pkg> time`                           |
| 2026-11-24 | P0.1: dùng vitest 4.1.12 thay vì vitest 5 — vitest 5 yêu cầu Node ^22.12/24/26, mâu thuẫn M0 §13 (CI chạy Node 20 và 22); vitest 4.1.12 hỗ trợ Node ^20/22/24                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | M0 §13; `npm view vitest@5.1.0 engines`                                           |
| 2026-11-24 | P0.1: ESLint 10 không còn bundle `@eslint/js` (dòng 10.x không tồn tại; mới nhất là 9.39.5, không có peerDependencies) — thêm `@eslint/js@9.39.5` làm devDependency trực tiếp                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Kiểm bằng `npm view @eslint/js` + đọc `eslint@10.14.0/package.json`               |
| 2026-11-24 | P0.1: Vitest 4 bỏ `defineWorkspace` (trả `undefined`) — `vitest.workspace.ts` export trực tiếp mảng project                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Kiểm bằng `node -e` trên `vitest/dist/config.js`                                  |
| 2026-11-24 | P0.1: Prettier mặc định tự chọn (spec không quy định style): singleQuote, trailingComma all, printWidth 100, semi, LF                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `.prettierrc`                                                                     |
| 2026-11-24 | P0.1: package `schemas/kernel/project/test-utils` chỉ có khung (`package.json` + `tsconfig.json` + `src/index.ts` chứa `export {};` + chú thích prompt nào điền) — chưa có logic nghiệp vụ; `apps/*` chỉ có `package.json` (tsconfig/src đến ở prompt của app). `turbo.json` đã tạo nhưng root scripts chưa gọi turbo (tránh chạy trùng/lặp) — turbo dùng từ P0.2 khi có script theo package                                                                                                                                                                                                                                                                                                                                                                                                                       | P0.1 prompt ("Không làm: logic nghiệp vụ"); M0 §3.1 "chỉ tạo package có nội dung" |
| 2026-11-24 | P0.1: CHƯA tạo script `dev/build/vcs/bench/test:e2e/docs:diagnostics` (chưa có code để chạy) — thêm ở prompt sở hữu: `vcs` P0.4, `bench` P0.3, `test:e2e` P0.6, `docs:diagnostics` P0.2, `dev/build` P0.5–P0.7. CI hiện chỉ có job `check` + `test` (ubuntu + windows × Node 22, bỏ Node 20 theo A16); job `e2e`/`bench`/`docs:diagnostics --check` thêm cùng prompt trên                                                                                                                                                                                                                                                                                                                                                                                                                                          | M0 §3.3, §13; OQ-008                                                              |
| 2026-11-24 | P0.1: **bỏ Node 20 khỏi CI** (quyết B của chủ sản phẩm): PR #8 CI đỏ ở job test Node 20 (ubuntu + windows) vì `dependency-cruiser@18.7.2` yêu cầu Node `^22\|\|^24\|\|>=26` (`ERR_PNPM_UNSUPPORTED_ENGINE`); job `check` và test Node 22 xanh. Ghi AMENDMENTS **A16** (thắng M0 §13), sửa `.github/workflows/ci.yml` ma trận `node: [22]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | AMENDMENTS A16; PR #8; CI run #17/#18                                             |
| 2026-11-24 | P0.1: làm theo mặc định D-002 (A: repo private, UNLICENSED, giữ `@vcs/*`) để viết `package.json` — chờ chủ sản phẩm quyết D-002 (ghi R-002, có quyền veto)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | OWNER-INBOX D-002, R-002                                                          |
| 2026-11-24 | P0.1 không có phần ngữ nghĩa thời gian (chưa có SimClock/TagDB) nên không có bảng timeline tính tay — golden timeline bắt đầu từ P0.3/P0.4 theo SKILL-testing-and-verification §2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | SKILL-testing-and-verification §2                                                 |
| 2026-11-24 | P0.2: ghim phiên bản đúng quy tắc ≥ 14 ngày (M0 §3.2): `zod@4.6.7` (2026-10-12), `yaml@2.9.1` (2026-09-11) vào `@vcs/schemas`; `fast-check@4.10.2` (2026-09-19) làm root devDependency. `fast-check@4.11.0` mới 3 ngày → loại                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | M0 §3.2; `npm view <pkg> time`                                                    |
| 2026-11-24 | P0.2: `TagCatalog` (M0 §6.5) đặt trong `@vcs/schemas` (`tags.ts`) để `@vcs/project` dùng trong `loadProject` mà không import `kernel` (graph §3.5 cấm project → kernel); `kernel` dùng lại ở P0.3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | M0 §6.5, §3.5; OQ-009                                                             |
| 2026-11-24 | P0.2: sửa lỗi rule `schemas-standalone` trong `.dependency-cruiser.cjs` (P0.1): rule cũ cấm schemas import **mọi** package kể cả chính nó → 12 vi phạm giả khi schemas có nhiều file; thêm `pathNot` cho phép import nội bộ, vẫn cấm import package khác. Thêm 2 test hồi quy vào `tests/tooling-gates.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | M0 §3.5; depcheck xanh                                                            |
| 2026-11-24 | P0.2: `docs:diagnostics` (M0 §4.1, §13) — script `scripts/gen-diagnostics.ts` (tsx) sinh `docs/diagnostics.md` (23 mã) từ `DiagnosticCatalog`, quét source tìm mã chưa đăng ký (trừ `*.test.ts`), hỗ trợ `--check`; thêm script root + bước CI vào job `check` (sau `depcheck`, không đổi ma trận Node); `docs/diagnostics.md` thêm vào `.prettierignore` (file sinh tự động, không format tay)                                                                                                                                                                                                                                                                                                                                                                                                                    | M0 §4.1, §13; OQ-008 (đóng phần diagnostics)                                      |
| 2026-11-24 | P0.2 — quyết định ngữ nghĩa: (a) khóa lạ phát hiện bằng descriptor `YamlShape` song song zod schema (zod v4 `z.object` strip khóa lạ, không báo được `unrecognized_keys`); PRJ-W001 kèm gợi ý Levenshtein ≤ 2; (b) zod v4 issue không có trường `input` — thông điệp thân thiện tra cứu giá trị từ object đã parse theo `issue.path`; (c) `schemaVersion` ≠ 1 không bị zod từ chối, `loadProject` gọi `migrateProject` (bảng M0 rỗng) rồi báo PRJ-E006; (d) hash project = sha256 của các dòng `${path}:${sha256}` đã sắp xếp; `hashText` strip BOM + CRLF→LF; (e) `SimState = IDLE \| RUNNING \| PAUSED` (M0 §8.2); `PROTOCOL_VERSION = 1`; (f) controller `external` bắt buộc `endpoint`                                                                                                                         | M0 §4–5, §6.5, §8.2, §9.2; OQ-010, OQ-011                                         |
| 2026-11-24 | P0.2 — số lượng test theo M0 §12.1: duration 33 (≥15), yaml 21 (≥20), project+tags 50 (≥35), loadProject+memoryFS+hashText 23 (≥15), protocol 12 (≥12); tổng 163 test / 13 file. 3 lỗi kỳ vọng test được sửa trong lúc chạy (dòng của khóa lạ lồng nhau, định dạng gợi ý, `stepMs=0` → PRJ-E007 chứ không phải E003) — implementation không đổi, đều có bằng chứng debug                                                                                                                                                                                                                                                                                                                                                                                                                                           | M0 §12.1                                                                          |
| 2026-11-24 | P0.2 — sửa lỗi CI PR #9 (nguyên nhân gốc): `packages/project/package.json` và root `package.json` chưa từng khai báo `@vcs/schemas` dù `load.ts` và `scripts/gen-diagnostics.ts` import nó; `pnpm-lock.yaml` có 0 dòng `@vcs/schemas`. Gate local xanh chỉ vì 7 symlink tay trong `node_modules/@vcs` (workaround EPERM P0.1) che mất lỗi. Sửa: thêm `"@vcs/schemas": "workspace:*"` vào cả hai `package.json`; sinh lại lockfile bằng `pnpm install` trong bản sao `/tmp/vcs-fix` (exit 0; lockfile có `link:packages/schemas` và `link:../schemas`); xóa symlink tay, đồng bộ `node_modules` thật về bản sao chính; chạy lại đủ gate ở cả hai nơi: 163/163 test, không còn ERR_MODULE_NOT_FOUND. Grep toàn repo: không còn import `@vcs/*` nào thiếu dependency                                                  | M0 §3.2, §13; OQ-012                                                              |
| 2026-11-24 | P0.3 đã xong local: `ManualClock`, `TagDB` (mảng song song theo handle, flush theo lô, validate + ownership, snapshot/restore/reset), `TagDbIoBus` + `IoPort`, `TraceHasher` (sha256 tăng dần, mã hóa §6.9), `TagError` ở kernel; `@vcs/test-utils` (`defineTags`/`makeTags`/`FakeClock`/`recordChanges`/`waitFor`); bench TagDB + script `pnpm bench` + job CI `bench` tay/nightly. Test mới 109: clock 13 (≥6), TagDB 47 (≥40), IoBus 16 (≥12), Hasher 10 (≥6), golden timeline 2, test-utils 21 — tổng 272 test / 19 file. `docs/diagnostics.md` không đổi (không thêm mã mới)                                                                                                                                                                                                                                  | M0 §6.1–6.5, 6.9, §7, §12; STATE §10                                              |
| 2026-11-24 | P0.3 — bench trên VM này (CPU chia sẻ): set/get 35,1M ops/s; flush 5000/0 đổi 0,17 µs; flush 1000 đổi + 1 sub 0,056 ms; heap −0,06 MB sau 10M thao tác — 4/4 PASS, không hạ ngưỡng                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | M0 §12.4; `pnpm bench`                                                            |
| 2026-11-24 | P0.3 — script `test` thêm `NODE_OPTIONS=--expose-gc` (qua `cross-env`) để test không cấp phát dùng được `gc()` (SKILL-testing §9); đã kiểm chứng NODE_OPTIONS tới được vitest worker trên Linux; `bench` cũng dùng `--expose-gc`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | SKILL-testing-and-verification §9                                                 |
| 2026-11-24 | P0.3 — `flush()`: cập nhật baseline `lastFlushed` + reset `writes` TRƯỚC khi gọi subscriber, nên subscriber ném lỗi (lan truyền, OQ-015) cũng không làm change bị phát lại ở flush sau                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | M0 §6.2 quy tắc 3; OQ-015                                                         |
| 2026-11-24 | P0.3 — `namesHash` tính bằng sha256 trực tiếp bằng `node:crypto` trong kernel (không import `hashText` từ `@vcs/project` — đồ thị §3.5 cấm kernel → project); tên tag không chứa BOM/CRLF nên kết quả giống hệt `hashText` (OQ-018)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | M0 §3.5, §6.2; OQ-018                                                             |
| 2026-11-24 | P0.3 — 16 test đỏ ở lần chạy đầu đều là lỗi test (không phải lỗi implementation): ghi source `'plant'` vào tag owner `free`, và `set(h, i)` với `i` vượt khoảng Int trong test/bench heap — sửa test/bench, không sửa implementation; ghi lại để tránh lặp (xem OQ-012: phân biệt lỗi test và lỗi code)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | M0 §6.2; AGENTS §6                                                                |
| 2026-11-24 | P0.2 đã merge PR #9 (`f3d769a`, 37 file +3039/−35, 11 commit, CI 6/6 xanh) — `develop` đã có `packages/schemas/src/yaml.ts`, `packages/project/src/load.ts`, `docs/diagnostics.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | PR #9                                                                             |
| 2026-11-24 | P0.3 (kế hoạch §10): `TagError` định nghĩa ở `@vcs/kernel` (`errors.ts`, `code: TAG-E001\|E002\|E003`, message từ `DiagnosticCatalog`) — schemas chưa có class này (chỉ có `DurationError`); tag M/DB đưa vào `TagDB` → ném `Error` thường (lỗi lập trình, nêu tên tag + area + hướng lọc I/Q), không dùng sai mã TAG-E003                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | M0 §6.2; OQ-016                                                                   |
| 2026-11-24 | P0.3 (kế hoạch §10): `TraceHasher` băm sha256 tăng dần bằng `node:crypto` (tiền lệ `hashText` ở P0.2) thay vì `@noble/hashes` — kernel M0 chạy ở server Node; `@noble/hashes` chỉ cần khi kernel chạy trong trình duyệt (ngoài M0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | M0 §6.9, §16                                                                      |
| 2026-11-24 | P0.3 (kế hoạch §10): `makeSim` + `FakeController` (M0 §7) dời sang P0.4 — cần `createSimulation`/`SimComponent` (§6.6–6.8) chưa có; hơn nữa `makeSim` theo §7 cần `memoryFS` (`@vcs/project`) nhưng rule `test-utils-deps` cấm test-utils import project — mâu thuẫn nội bộ spec, mặc định: `makeSim` nhận `ProjectModel` đã nạp                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | M0 §7, §3.5; OQ-017                                                               |
| 2026-11-24 | P0.4 đã xong local: `SimComponent`/`ControllerAdapter` (+ khai báo `ControllerIntrospection`/`isIntrospectable`, cài thật ở P1.4), `SimulationOrchestrator` đúng thuật toán §6.7 (pha plant → controllers → gateways, `post()`/inbox snapshot, `throw`/`isolate`, async → SIM-E002, snapshot/restore), `createSimulation` + extension, `LoopbackController` + `demoExtension` (`@vcs/kernel/demo`), `Pacer` (công thức OQ-022), `makeSim` + `FakeController` (OQ-017), `apps/cli` (`version`/`validate`/`run`, exit 0/2/3) + script root `vcs`, `examples/hello-tags`, bench orchestrator. Test mới 96: Pacer 12 (≥10), Orchestrator 32 (≥30), Builder/extension 12 (≥10), Loopback 12 (≥8), CLI 20 (≥10), makeSim/FakeController 8 — tổng 368 test / 27 file. `docs/diagnostics.md` không đổi (không thêm mã mới) | M0 §6.6–6.8, 6.10, §8.1, §12.1–12.2; STATE §11                                    |
| 2026-11-24 | P0.4 — `commander@15.1.0` cho `@vcs/cli`: phát hành 2026-11-07 (17 ngày trước 2026-11-24), đạt quy tắc ≥ 14 ngày (M0 §3.2, kiểm bằng `npm view commander@15.1.0 time`); dependency mới duy nhất của P0.4; khai báo trong `apps/cli/package.json` trước khi chạy gate, lockfile sinh bằng `pnpm install` thật trong `/tmp/vcs-p04` (có `commander@15.1.0` + `link:` workspace)                                                                                                                                                                                                                                                                                                                                                                                                                                      | M0 §3.2; OQ-012                                                                   |
| 2026-11-24 | P0.4 — OQ-030: `createSimulation(project: ProjectModel, ...)` (§6.8) không thực thi được vì rule `kernel-deps` cấm kernel import project (cùng mâu thuẫn cho `makeSim` ở test-utils) — dùng interface cấu trúc `SimulationProject { config, tags, catalog, diagnostics }` định nghĩa trong `@vcs/kernel`; `ProjectModel` thỏa mãn cấu trúc nên caller truyền trực tiếp được. OQ-031: version CLI là hằng `VERSION = '0.1.0'` trong code, đồng bộ thủ công với `apps/cli/package.json`                                                                                                                                                                                                                                                                                                                              | M0 §6.8, §3.5; OQ-030, OQ-031                                                     |
| 2026-11-24 | P0.4 — bench orchestrator (M0 §12.4): 469 bước/s lúc đầu → tối ưu `LoopbackController.#scan` sang fast path `IoPort` (ghi ảnh output bằng `writeOutputsFrom`, vị trí tính trước ở init, không Record/`Object.entries`/lookup tên mỗi scan; ngữ nghĩa giữ nguyên, test cũ xanh) → **2 639 bước/s** (trung vị 5 mẫu, warm-up). Profile: khung orchestrator không controller 0,22 µs/bước (4,5M bước/s); `TagDB.set` ~60 ns; 2 400 set/bước = 144 µs sàn → tối đa ~7 000 bước/s với project này. Ngưỡng 100 000 không đạt được với project 5 000 tag + 2 400 rule — ghi số thật, không hạ ngưỡng, chờ quyết định tầng C                                                                                                                                                                                               | M0 §12.4; OQ-032                                                                  |
| 2026-11-24 | P0.4 — 6 test đỏ ở lần chạy đầu đều là lỗi test/kỳ vọng (không phải lỗi implementation): (1) counter wrap: init đọc giá trị từ `TagDef.initial` (đúng OQ-026), test ghi TagDB trước init — sửa test đặt `initial: 32767`; (2) T3: hook `beforeExternals` tồn tại qua các bước nên post lại C đè D — sửa test chỉ post C một lần; (3) restoreAll faulted: `stepCalls` khôi phục từ snapshot là 1, bước kế bị skip nên vẫn 1 — sửa kỳ vọng; (4) Pacer resume: thiếu `clock.set(600)` trước `start(100)` theo T7; (5) CSV: quên 9 lần đổi `LAMP_HEARTBEAT` (510 change, 511 dòng); (6) `--step-ms 5`: scan vẫn 10 ms nên `SCAN_CNT` = 500, không phải 1000. Implementation không đổi, đều có bằng chứng (CSV thật, bảng T7)                                                                                           | M0 §12.1; AGENTS §6                                                               |
| 2026-11-24 | P0.4 — bài học đồng bộ: `rsync` main → `/tmp` chép cả `pnpm-lock.yaml` cũ và đè mất lockfile mới vừa sinh bằng `pnpm install` trong `/tmp` (phát hiện khi `grep commander@15.1.0` = 0); từ nay sinh lockfile xong chép về ngay, các lần rsync sau phải `--exclude pnpm-lock.yaml`. Đồng bộ `node_modules` về bản chính phải gồm cả `node_modules` từng package (xem §0)                                                                                                                                                                                                                                                                                                                                                                                                                                            | OQ-007, OQ-012                                                                    |

| 2026-11-24 | PR #11 P0.4 đã mở vào `develop` (nhánh `m0/p0.4-orchestrator`, head `aa4e9ea`, 13 commit, 38 file +4268/−143; CI 6/6 xanh push + pull_request, bench skip tay/nightly) — CHƯA merge, chờ sửa OQ-032 | PR #11 |
| 2026-11-24 | OQ-032 — chủ sản phẩm quyết (b) định nghĩa lại project bench "rỗng" (5 000 tag, 4 controller, 2 rule loopback/controller) rồi (ii) I/O thưa cho LoopbackController (chỉ tag có rule) sau khi thử nghiệm 8 rule chứng minh nguyên nhân gốc không phải số rule: 8 rule vẫn chỉ 4 071–4 145 bước/s; `#scan` đọc/ghi toàn bộ ảnh I/O (~4 996 thao tác TagDB/bước ≈ 250 µs); controller 0 rule đạt 6 596 328 bước/s | OQ-032; AMENDMENTS A17 |
| 2026-11-24 | OQ-032 — sửa I/O thưa: `LoopbackController` nhận `TagDB` qua constructor (factory `demoExtension` truyền `ctx.tags` từ `BuildCtx` — không đổi interface spec §6.3/§6.6); `#scan` chỉ `get/set` theo handle của tag có rule; `init` vẫn dùng `IoPort` để đối chiếu tên → handle (một lần). Thay đổi duy nhất: output không có rule giữ nguyên giá trị hiện tại thay vì bị ghi đè về initial mỗi scan (giống PLC thật hơn); có test mới chứng minh. 8 điểm gọi `new LoopbackController` cập nhật (extension + loopback/builder/orchestrator test) | OQ-032, OQ-026; M0 §6.10 |
| 2026-11-24 | OQ-032 — `TagDB.flush()` chỉ duyệt danh sách dirty (O(dirty) thay vì O(n)): thêm `#dirtyList` (mảng tái dùng, xếp tại chỗ theo handle tăng dần, đúng M0 §6.4 quy tắc 3 "duyệt danh sách dirty"); `#applyWrite` thêm handle khi chuyển dirty, `#refreshDirty` (restore/reset) dựng lại danh sách. Ngữ nghĩa giữ nguyên (thứ tự handle, chỉ phát khi khác lần flush trước; property test chuỗi ghi/flush ngẫu nhiên vẫn xanh). Đo: flush 4 dirty/bước (5 000 tag) 13,79 → 0,42 µs; flush 1000 đổi + 1 sub 0,119 ms (≤ 1) | M0 §6.4 quy tắc 3; OQ-032 |
| 2026-11-24 | OQ-032 — bench sau sửa (trung vị 5 mẫu, warm-up, 5 lần chạy ở 2 bản sao): orchestrator **374 059–540 811 bước/s PASS** (ngưỡng ≥ 100 000, biên độ thấp nhất 3,7×); TagDB 4/4 PASS (set/get 51,7M ops/s; flush 5000/0 đổi 0,19 µs; flush 1000 đổi + 1 sub 0,119 ms; heap −0,04 MB). Tổng test 369/369 (27 file; Loopback 13, mới 1 test I/O thưa) | M0 §12.4; OQ-032 |
| 2026-11-24 | P0.5 — dependency mới (đều đạt quy tắc ≥ 14 ngày, cắt 2026-11-10): `fastify@5.12.8` (2026-11-02), `@fastify/websocket@11.3.7` (2026-11-04), `@fastify/static@10.1.10` (2026-11-04 — KHÔNG 10.1.12 ra 2026-11-19), `pino@10.4.0` (2026-10-02), `ws@8.22.2` devDep (2026-11-08 — KHÔNG 8.23.0 ra 2026-11-12), `tsup@9.0.0` (2026-10-14), `@types/ws@8.18.2` root devDep (2026-09-29; `ws` không kèm type, `@fastify/websocket` chỉ khai báo ở devDependencies). Lockfile sinh bằng `pnpm install` thật trong `/tmp/vcs-p05`, chép về ngay; `pnpm install --frozen-lockfile` CHẠY ĐƯỢC lần đầu ở `/tmp` (exit 0) | M0 §3.2; OQ-007, OQ-012 |
| 2026-11-24 | P0.5 — tsup ESM bundle vs `require` động: `yaml` làm `require('process')`, `avvio` (dep fastify) làm `require('events')` → esbuild `__require` shim không xử lý được builtin → CLI dist lỗi `Dynamic require of "process" is not supported`. Sửa: `external: ['yaml']` ở cả 2 config (CLI thêm `fastify`, `@fastify/websocket`, `@fastify/static`, `pino` — vì `@vcs/server` bundle vào CLI qua `noExternal` nên cả cây fastify bị kéo theo); khai báo các dep đó trực tiếp ở `apps/cli/package.json` để pnpm link vào `node_modules` cho runtime resolve từ `dist/` | M0 §8.2 |
| 2026-11-24 | P0.5 — main-guard trong `apps/server/src/index.ts` (`import.meta.url === pathToFileURL(process.argv[1]).href`) chạy nhầm khi server bị bundle vào CLI: `import.meta.url` là file dist của CLI nên guard tưởng CLI là server, chạy `main()` thêm lần nữa với argv CLI (`version` → exit 3, `không tìm thấy thư mục 'version'`). Sửa cấu trúc: `main()` tách ra `apps/server/src/main.ts`; `index.ts` chỉ export (không side-effect); dev script → `tsx watch src/main.ts`; tsup entry server → `['src/index.ts', 'src/main.ts']` (dist `index.js` thư viện + `main.js` chạy được). Ghi ADR hoãn sang P0.7 theo phạm vi plan | M0 §8.2 |
| 2026-11-24 | P0.5 — OQ-054 (tầng B): golden S1 dòng 6 trong plan sai — delta đúng là `[[0,true],[3,true],[6,20]]` (tính tay + probe service xác nhận: `BTN_START` vừa ghi lật F→T ở drain bước 11, `flush()` báo change, LWW giữ lại). OQ-055 (tầng C) ĐÃ QUYẾT 2026-11-24 (chủ sản phẩm chọn giữ cap 150 ms ở gate, ghi nhận kiểm 50 ms trên máy yên): drift `timeScale max` — máy yên p95 6–7 ms, max 6–10 ms (5 lần, ĐẠT 50 ms); bộ test đầy tải trên VM 1,5 CPU p95 57–74 ms trong khi baseline IDLE cùng lúc 35–48 ms (máy đóng góp phần lớn, server thêm ~10–20 ms). Gate test đo 1 s ở max, log số, assert cap p95 ≤ 150 ms (chỉ bắt vòng lặp kẹt) + stepCount tăng. Ngưỡng §12.4 KHÔNG đổi; ghi A18. OQ-056: CI Windows PR #12 đỏ test `message > 64 KB → đóng 1009` (thấy 1006, chỉ Windows) — nguyên nhân gốc ws `close()` gọi `socket.end()` ngay khi receiver lỗi quá tải (receiver.errorEmitted), frame 1009 đua với teardown; sửa bằng close(1009) tường minh trong `#onMessage` + `maxPayload` ws nâng 1 MB (chỉ chống phình bộ nhớ); test không đổi kỳ vọng, thêm test biên đúng 64 KB không bị đóng; chờ CI Windows xanh xác nhận | OQ-054, OQ-055; M0 §12.4; A18 |
| 2026-11-24 | P0.5 — xong local: `apps/server` (`SimulationService`, `WsHub`, REST, config, `SERVER_EXTENSIONS`, `VERSION = '0.1.0'`) + `vcs serve` (exit 3/2/0) + script root `dev`/`build` (tsup). Test mới 51 (config 12, sim-service 11, ws 22, serve 6) — tổng **420/420, 31 file**. Gate xanh cả bản sao `/tmp/vcs-p05` (install thật, frozen-lockfile exit 0) lẫn bản chính: lint 0 lỗi, typecheck sạch, depcheck no violations (57/101 ở `/tmp`, 61/115 ở bản chính — lệch do cruise cả `dist/`), review:cheats SẠCH (82 file), diagnostics --check khớp (24 mã, +WS-E003). Bench guard: TagDB 4/4 PASS, orchestrator 514 972 bước/s bản chính / 507 739 `/tmp` | M0 §8.2, §12.4; STATE §12 |
| 2026-11-24 | P0.6 đã merge PR #13 (`471a2ec`, 2026-11-24 16:48 +07, CI 8/8 xanh — xác minh qua MCP read: merged true, merged_at 2026-11-24T09:48:05Z) — `develop` hiện chứa web + e2e; nhánh plan P0.7 `m0/p0.7-docs` tách từ `d893736` (= nội dung `develop` sau merge) | PR #13 |
| 2026-11-24 | P0.7 plan §14: 7 ADR (0001–0006 theo M0 §11 + 0007 main-guard hoãn từ P0.5 — OQ-071); bằng chứng §15.1 lấy theo A16, không sửa chữ spec (OQ-072); baseline bench là `bench/baseline.json` được commit, `results.json` vẫn gitignore (OQ-073); §15.5 đường async = `stepOnceAsync` + `SIM-E002` đã có từ P0.4 (T6), C1 là P0.8; §15.6 cần ghim giá trị hash; coverage §13 chưa bật | OQ-071, OQ-072, OQ-073; M0 §11, §13, §15 |

## 5. Đang chờ chủ sản phẩm

Chỉ liệt kê **ID** (chi tiết ở `docs/OWNER-INBOX.md`; câu hỏi/ giả định ở `docs/open-questions.md`):

- Chặn tiến độ: T-002, T-003 (nên làm sớm, quyết định khả thi M5); D-001/D-004 đã xong (D-001 rule `main` đã tạo, not enforced — free plan, chấp nhận; D-004 server Node)
- Không còn mục chặn P0.6 (OQ-062 đã quyết 2026-11-24, A19).
- Không chặn (duyệt sau): D-002, D-003, D-005, S-001, S-002, S-003, R-001, R-002; OQ-006, OQ-007, OQ-009, OQ-010, OQ-011, OQ-012, OQ-013, OQ-014, OQ-015, OQ-016, OQ-017, OQ-018, OQ-019, OQ-020, OQ-021, OQ-022, OQ-023, OQ-024, OQ-025, OQ-026, OQ-027, OQ-028, OQ-029, OQ-030, OQ-031, OQ-033, OQ-034, OQ-035, OQ-036, OQ-037, OQ-038, OQ-039, OQ-040, OQ-041, OQ-042, OQ-043, OQ-044, OQ-045, OQ-046, OQ-047, OQ-048, OQ-049, OQ-050, OQ-051, OQ-052, OQ-053, OQ-054, OQ-057, OQ-058, OQ-059, OQ-060, OQ-061, OQ-063, OQ-064, OQ-065, OQ-066, OQ-067, OQ-068, OQ-069, OQ-070, OQ-071, OQ-072, OQ-073 (mở, xem `docs/open-questions.md`)

## 6. Dữ liệu/môi trường cần có (🔑) và tình trạng

| Cần                                         | Cho prompt | Tình trạng                                                                                                                                                                                                                                   |
| ------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo + CI                                   | P0.6       | ✔ P0.6 xong local (gate xanh cả 2 nơi, vitest 438/438, e2e 5/5 local; bench guard PASS — TagDB 4/4, orchestrator 513 310 bước/s bản chính / 494 731 `/tmp`) — mở PR qua UI lên `develop`, chờ CI (check + test + job `e2e` mới), merge khi xanh. `pnpm install --frozen-lockfile` CHẠY ĐƯỢC trong `/tmp` (exit 0, OQ-007 một phần xong — trong `~/workspace/vcs` vẫn EPERM). Playwright Chromium cài được trong VM: `~/.cache/ms-playwright/` có `chromium-1254` + `chromium_headless_shell-1254` + `ffmpeg-1013`; lưu ý: `/tmp` là tmpfs 512M, cài Chromium phải đặt `TMPDIR=/home/hatch/.cache/pw-tmp` (tải ~198 MiB qua proxy chậm 0,7–2,5 MiB/s, 2 lần lỗi trước khi đổi TMPDIR); giết server thừa theo PID (không `pkill -f` — pattern trùng shell tự giết mình) |
| I/O list thật ẩn danh + quy ước tên         | P2.7       | ☐ (X-003)                                                                                                                                                                                                                                    |
| C&E thật ẩn danh + biểu mẫu FAT             | P3.4–P3.5  | ☐ (X-004)                                                                                                                                                                                                                                    |
| SCADA đích + node id                        | P4.4       | ☐ (X-005)                                                                                                                                                                                                                                    |
| Windows + TIA + PLCSIM Advanced + giấy phép | P5.4, P5.6 | ☐ (X-006, T-002/T-003)                                                                                                                                                                                                                       |
| ≥ 10 file SimaticML thật + XSD              | P5.7       | ☐ (X-007)                                                                                                                                                                                                                                    |
| Dự án VCS_Conformance                       | P5.9       | ☐ (X-008)                                                                                                                                                                                                                                    |
| Khảo sát độ phủ SCL thật (Spike S1)         | trước P1.2 | ☐ (X-002) — P1.2 KHÔNG chờ (làm theo EBNF §4.2; S1 chạy khi có mã thật, xem §17 OQ-105) |

## 7. Rủi ro đang theo dõi

| Rủi ro                                                        | Mức | Giảm thiểu                                                                  | Người theo dõi            |
| ------------------------------------------------------------- | --- | --------------------------------------------------------------------------- | ------------------------- |
| Soft-PLC tự viết không tương đương PLC thật                   | C   | Chỉ conformance trên PLCSIM (M5 §10, ≥10/14 thí nghiệm) mới chứng minh được | AI + chủ sản phẩm (T-002) |
| Chưa có dữ liệu thật nào (X-001…X-008)                        | C   | Fixture tổng hợp trước; dữ liệu thật ẩn danh khi có                         | Chủ sản phẩm              |
| Môi trường Windows chưa được chứng minh (S6)                  | B/C | Chạy S6 sớm (T-001); VM này không có pnpm/.NET                              | Chủ sản phẩm (T-001)      |
| Hiệu năng OPC UA 2.000 monitored item @100 ms chưa có số liệu | B   | Bench S4 trước P4.4; không đạt → push (ADR)                                 | AI                        |
| Scope creep + sai im lặng                                     | A   | Gate + review:cheats + reviewer độc lập mỗi PR                              | AI                        |

## 8. Ký duyệt milestone

| Milestone | Gói nghiệm thu        | Ngày ký | Người ký | Ghi chú |
| --------- | --------------------- | ------- | -------- | ------- |
| M0        | docs/acceptance/M0.md | 2026-11-24 | Tiến | 12/12 §15 ĐẠT (G0, PR #15 `b7e764e`); probe bổ sung 3/3 PASS; Windows: demo OK, hash trùng, `pnpm test` 439/439 sau fix OQ-074 (PR #16 `cda44d3`); D-001 rule `main` đã tạo (not enforced — free plan, chấp nhận), D-004 server Node (A) |
| M1        | docs/acceptance/M1.md | 2026-11-25 | Tiến | 9/9 §16 ĐẠT (G1, PR #27 `85ab770`); probe bổ sung 4/4 PASS (demo A–D 24/24, 5 lỗi vị trí chính xác, STRING→U001/POINTER→T001, snapshot/restore giống hệt); §16.5 và OQ-161 chưa quyết — giữ mặc định hiện tại, quyết sau (OQ-161 trước M2 nếu chạm FB lồng có IN_OUT); hướng dẫn kiểm chứng: `docs/verify-owner-guide.md` |
| M2        | docs/acceptance/M2.md |         |          |         |
| M3        | docs/acceptance/M3.md |         |          |         |
| M4        | docs/acceptance/M4.md |         |          |         |
| M5        | docs/acceptance/M5.md |         |          |         |

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

## 10. Kế hoạch P0.3 — @vcs/kernel dữ liệu + @vcs/test-utils (plan-first, 2026-11-24)

**Phạm vi (M0 §6.1–6.5, 6.9, 7; PROMPTS P0.3):** `ManualClock`, `TagDB`, `TagCatalog` (dùng lại `createTagCatalog` ở `@vcs/schemas`, OQ-009 — không viết lại), `TagDbIoBus` + `IoPort`, `TraceHasher`, `@vcs/test-utils`. **Không làm:** orchestrator/builder/Pacer/LoopbackController (§6.6–6.8, 6.10 → P0.4), server/CLI/web, mã chẩn đoán mới (SIM/TAG đã đủ trong catalog: SIM-W001, SIM-E001…E003, TAG-E001…E003 — `docs/diagnostics.md` không đổi).

**File (mới/sửa):**

| File                                               | Nội dung                                                                                                                                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/kernel/src/clock.ts`                     | `SimClock`, `ManualClock` (nowMs/advance/reset/snapshot/restore; `advance(dt≤0` hoặc không nguyên → `RangeError`)                                                                                                                               |
| `packages/kernel/src/errors.ts`                    | `TagError extends Error { code: 'TAG-E001'\|'TAG-E002'\|'TAG-E003' }`, message từ `DiagnosticCatalog` (OQ-016)                                                                                                                                  |
| `packages/kernel/src/tags.ts`                      | `TagDB` + `TagHandle/TagMeta/Tag/TagChange/TagDBSnapshot/TagSource/Quality` (dùng lại `TagOwner/DataType/IoArea/SignalKind/TagDef/TagValue/Unsub` từ `@vcs/schemas`); `TagMeta.scaling` lấy kiểu `Scaling` của schemas (dòng spec §6.2 viết dở) |
| `packages/kernel/src/iobus.ts`                     | `IoBus`, `IoPort`, `TagDbIoBus` (input = tag `I` của controller, output = tag `Q`, thứ tự handle; `writeOutputs` source `'plc'`)                                                                                                                |
| `packages/kernel/src/hasher.ts`                    | `TraceHasher` (subscribe `'*'`, sha256 tăng dần bằng `node:crypto`, mã hóa §6.9)                                                                                                                                                                |
| `packages/kernel/src/index.ts`                     | export JIT toàn bộ trên                                                                                                                                                                                                                         |
| `packages/kernel/package.json`                     | thêm `dependencies: { "@vcs/schemas": "workspace:*" }` (bài học OQ-012: khai báo trước khi chạy gate)                                                                                                                                           |
| `packages/test-utils/src/tags.ts`                  | `makeTags(defs?)`, `defineTags(shorthand)` (vd `'IN_A:Bool:I:%I0.0'`)                                                                                                                                                                           |
| `packages/test-utils/src/clock.ts`                 | `FakeClock` (trên `ManualClock` + `set(ms)` để nhảy thời gian trong test)                                                                                                                                                                       |
| `packages/test-utils/src/record.ts`                | `recordChanges(tags)` → `{ changes, dispose }`                                                                                                                                                                                                  |
| `packages/test-utils/src/wait.ts`                  | `waitFor(...)` (chỉ dùng cho đường async P0.4+; test P0.3 không chờ wall time)                                                                                                                                                                  |
| `packages/test-utils/src/index.ts`                 | export JIT; `package.json` thêm deps `@vcs/schemas` + `@vcs/kernel` (`workspace:*`)                                                                                                                                                             |
| `bench/tagdb.bench.ts` + script root `bench` (tsx) | bench TagDB theo §12.4; ghi `bench/results.json` (file sinh tự động, thêm vào `.gitignore`, **không** commit ở P0.3 — baseline commit ở P0.7)                                                                                                   |
| `pnpm-lock.yaml`                                   | sinh lại bằng `pnpm install` thật trong bản sao `/tmp` (OQ-007), kiểm lockfile có `link:` cho kernel/test-utils; **không** symlink tay; kiểm `node_modules/@vcs` chỉ có link do pnpm tạo                                                        |
| `.github/workflows/ci.yml`                         | job `bench` chạy tay/nightly (M0 §13, OQ-008): chạy `pnpm bench`, upload artifact `bench/results.json`; so sánh hồi quy > 20% → cảnh báo CI dời sang P0.7 (chưa có baseline)                                                                    |

**Thiết kế nhỏ nhất:** TagDB lưu mảng song song theo handle (values/quality/ts/source + `lastFlushed` + dirty-set không trùng); `get/set` không cấp phát; `flush()` chỉ cấp phát mảng `TagChange[]` khi có subscriber và có thay đổi; `snapshot()` JSON-serializable, `namesHash = hashText(tên nối '\n')` (OQ-018); sau `restore`/`reset`, `flush()` phát thay đổi so với giá trị flush cuối (baseline giữ nguyên). `TagDBOptions` mặc định cả hai `true`; bench/production truyền tường minh `false` (OQ-014). Subscriber `flush()` ném lỗi → lan truyền, không nuốt (OQ-015). **Đã loại:** (1) lưu TagDB bằng `Map<string, Tag>` — chậm hơn và cấp phát ở đường nóng; (2) `TagError` đặt ở `@vcs/schemas` — schemas là dữ liệu thuần, lỗi runtime thuộc kernel (OQ-016).

**Bảng timeline tính tay (golden cho test P0.3; nguồn: M0 §6.2 + AGENTS §4; chưa có orchestrator nên driver thủ công: plant ghi → controller qua IoBus → `flush()` → `advance(10)`):**

- Tag (thứ tự = handle): h0 `BTN_START` Bool I DI `false` (owner `free`); h1 `SENSOR` Bool I DI `false` (owner `free` → `setOwner(h,'plant')` như M2 gán thiết bị); h2 `LAMP_RUN` Bool Q DO `false` (owner `controller`); h3 `CNT` Int Q AO `0` (owner `controller`). `stepMs = plcScanMs = 10` (mặc định D2). Subscriber `'*'` ghi mọi `TagChange`.

| Bước | T     | Plant ghi (source `'plant'`)                                                                                     | Controller qua IoBus (source `'plc'`)                                                | `flush()` phát (thứ tự handle tăng dần)                                | T sau |
| ---- | ----- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ----- |
| 1    | 0     | `SENSOR` false→true                                                                                              | đọc `{BTN:false, SENSOR:true}` → `LAMP_RUN=true`, `CNT=1`                            | h1 false→true (writes 1); h2 false→true (1); h3 0→1 (1)                | 10    |
| 2    | 10    | —                                                                                                                | `LAMP_RUN=true` (ghi lại), `CNT=2`                                                   | h3 1→2 (1); h2 true→true **không phát**                                | 20    |
| 3    | 20    | `SENSOR`=false rồi true (2 lần ghi)                                                                              | đọc `SENSOR=true` → `LAMP_RUN=true`, `CNT=3`                                         | h3 2→3 (1); h1 true→true **không phát dù writes=2**; h2 **không phát** | 30    |
| 4    | 30    | `SENSOR` true→false                                                                                              | `LAMP_RUN=false`, `CNT=4`                                                            | h1 true→false; h2 true→false; h3 3→4 (mỗi writes 1)                    | 40    |
| 5a   | 40    | snapshot: clock=40, values `[F,F,F,4]`; chạy 2 bước: T=40 `CNT=5`, T=50 `CNT=6`                                  | flush phát h3 4→5, 5→6                                                               | T=60                                                                   |
| 5b   | 60→40 | `restore(snapshot)` → clock=40, `CNT=4`; `flush()` phát h3 6→4 (ts=30 đã lưu, source `'plc'`, writes=0 — OQ-019) | `hasher.reset()` rồi chạy lại T=40 `CNT=5`, T=50 `CNT=6` → hash **giống hệt** lần 5a | 60                                                                     |

- Đối chiếu spec: plant ghi ở bước T, PLC đọc đúng giá trị plant của cùng bước T (bước 1: `SENSOR=true` → `LAMP_RUN=true` ngay T=0) — khớp AGENTS §4 "plant trước controller". Không phát hiện mâu thuẫn spec ở bảng này. Chú ý: `hasher.reset()` sau restore là bắt buộc — nếu không, lần phát h3 6→4 sau restore sẽ lọt vào luồng băm và hai lần chạy không cùng hash (quy trình §12.2).
- Mã hóa `TraceHasher` mẫu: change đầu tiên (T=0, h1, `true`) = `simTime uint64 BE (0)` | `handle uint32 BE (1)` | `0x01`; sha256 hex của luồng byte nối tiếp.

**Ownership — `checkWrite` (M0 §6.2 quy tắc 6; mặc định D5):**

| Tag                             | Owner        | `plant` | `plc`  | `test` | `hmi`  | `system` |
| ------------------------------- | ------------ | ------- | ------ | ------ | ------ | -------- |
| `SENSOR` (sau `setOwner` plant) | `plant`      | ok      | denied | denied | denied | ok       |
| `LAMP_RUN` / `CNT`              | `controller` | denied  | ok     | denied | denied | ok       |
| `BTN_START`                     | `free`       | denied  | denied | ok     | ok     | ok       |

**Validate — ví dụ số (M0 §6.2 quy tắc 5):** `CNT` Int: `32767` ok, `32768` → `TAG-E001`, `1.5` → `TAG-E001`; Bool ghi `1` → `TAG-E001`; Real chấp nhận mọi số kể cả NaN/±Infinity; Time phải nguyên. `ts` của tag = `clock.nowMs()` lúc ghi.

**Test (M0 §12.1–12.2; gate P0.3: ≥ 60 test):** `ManualClock` ≥ 6; `TagDB` ≥ 40 (handle, validate, ownership, flush gom lô, quay về cũ, thứ tự, snapshot/restore, reset, không cấp phát); `TagDbIoBus` + `IoPort` ≥ 12; `TraceHasher` ≥ 6; test-utils helpers ~6 (defineTags/makeTags/recordChanges); **mục tiêu ≥ 70**. Property (fast-check, seed cố định): chuỗi ghi/flush ngẫu nhiên so với mô hình tham chiếu đơn giản; `restore(snapshot())` là phép đồng nhất; hai lần chạy + restore giữa chừng ⇒ hash giống hệt. Bảng timeline trên thành test golden (không sửa bảng cho khớp code — SKILL-testing-and-verification §2). Vitest: root config đã include `packages/*/src/**/*.test.ts` nên không cần thêm workspace project. Không cấp phát: đo heap sau 10 triệu `set/get` (tăng < 1 MB).

**Bench (M0 §12.4; gate P0.3):** `TagDB.set/get` ≥ 10 triệu thao tác/giây; `flush()` 5.000 tag/0 thay đổi ≤ 50 µs; `flush()` 1.000 thay đổi + 1 subscriber ≤ 1 ms. Bench orchestrator (≥ 100.000 bước/giây) thuộc P0.4, không làm ở đây.

**Rủi ro + cách kiểm:** (1) Hiệu năng không đạt trên VM này (CPU chia sẻ) → đo bằng `pnpm bench` có warm-up, nhiều lần đo; nếu sát ngưỡng, ghi số thật vào STATE, không hạ ngưỡng (hạ ngưỡng là tầng C). (2) Lỗi khai báo dependency lặp lại kiểu PR #9 → kiểm `node_modules/@vcs` chỉ có link pnpm + gate chạy trên bản sao `/tmp` cài thật. (3) `flush()` phát sau restore làm lệch hash nếu quên `reset()` → test tất định bắt đúng quy trình trên.

**Ngoài phạm vi:** orchestrator/builder/Pacer/LoopbackController/CLI (P0.4), `makeSim` + `FakeController` (dời P0.4, OQ-017), `semantics.md`/ADR (P0.7), sửa package khác (trừ `package.json` root + `ci.yml` + `.gitignore` đã nêu, có lý do).

## 11. Kế hoạch P0.4 — Orchestrator + builder + demo controller + CLI (plan-first, 2026-11-24)

**Phạm vi (M0 §6.6–6.8, 6.10, 8.1, 12.2; PROMPTS P0.4; AMENDMENTS A1, A2, A6, D1, D4):** `SimComponent`/`ControllerAdapter` (+ `ControllerIntrospection`/`isIntrospectable` — chỉ khai báo interface + hàm kiểm, cài đặt thật ở P1.4, D3), `SimulationOrchestrator` đúng thuật toán §6.7, builder + extension (`createSimulation`), `LoopbackController` + `demoExtension` (`@vcs/kernel/demo`), `Pacer`, `makeSim` + `FakeController` (OQ-017 — dời từ P0.3), `apps/cli` (`version`/`validate`/`run`, khung `commands/*.ts` theo A14) + script root `vcs` (M0 §3.3, OQ-008 — **thuộc P0.4**), `examples/hello-tags`, bench orchestrator (§12.4). **Không làm:** `vcs serve` (cần server, → P0.5); server/web (P0.5/P0.6); mã chẩn đoán mới — SIM-E001/E002/E003, SIM-W001 đã có trong catalog, `docs/diagnostics.md` không đổi; `semantics.md`/ADR (P0.7).

**Thiết kế nhỏ nhất:** orchestrator giữ 3 danh sách component theo pha (thứ tự đăng ký) + inbox (hàng đợi lệnh) + hook + listener sự kiện; `stepOnce()` theo đúng pseudocode §6.7 (không timer, không `Date.now`/`Math.random` — mọi thời gian từ `SimClock`); `stepOnceAsync()` giống hệt nhưng `await` từng component tuần tự; `createSimulation` theo đúng 5 bước §6.8 (factory key: builtin → `` `builtin:${vendor}` ``, external → `` `external:${adapter}` ``; `ControllerConfig.tags` = mọi tag của controller đó từ `TagCatalog`, kể cả M/DB — TagDB chỉ nhận I/Q). `Pacer` thuần tính toán từ hàm `now()` tiêm vào (không gọi `performance.now` trực tiếp; công thức mặc định ở OQ-022). Loopback giữ trạng thái tối thiểu (`scanCount`, `lastScanSimMs`, `blinkNext[]`, `accMs`) + đọc/ghi qua `IoBus`/`IoPort`. CLI mỏng: mỗi lệnh một file, gọi thẳng `loadProject`/`createSimulation`/`TraceHasher`, in bằng `formatDiagnostic` (đã có ở schemas).

**File (mới/sửa):**

| File                                                                                                           | Nội dung                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/kernel/src/component.ts`                                                                             | `SimComponent`, `ControllerAdapter`, `ControllerConfig`, `ControllerDiagnostics`, `ControllerIntrospection`, `isIntrospectable`, `StepResult`                                                      |
| `packages/kernel/src/errors.ts`                                                                                | thêm `SimComponentError { id, phase, simTimeMs, cause }`, `ProjectInvalidError { diagnostics }` (OQ-020)                                                                                           |
| `packages/kernel/src/orchestrator.ts`                                                                          | `Phase`, `StepHooks`, `ExternalCommand`, `OrchestratorOptions`, `SimSnapshot`, `SimEvents`, `SimulationOrchestrator`                                                                               |
| `packages/kernel/src/builder.ts`                                                                               | `ControllerKey`, `ControllerFactory`, `BuildCtx`, `SimulationExtension`, `SimulationBundle`, `createSimulation`                                                                                    |
| `packages/kernel/src/pacer.ts`                                                                                 | `PacerOptions`, `Pacer` (công thức OQ-022)                                                                                                                                                         |
| `packages/kernel/src/demo/loopback.ts`                                                                         | `LoopbackController` (config `loopback`/`blink`/`counter`, OQ-026)                                                                                                                                 |
| `packages/kernel/src/demo/extension.ts`                                                                        | `demoExtension` (id `'demo'`, đăng ký `builtin:demo`)                                                                                                                                              |
| `packages/kernel/src/demo/index.ts`                                                                            | export subpath `@vcs/kernel/demo`                                                                                                                                                                  |
| `packages/kernel/package.json`                                                                                 | thêm export `"./demo": "./src/demo/index.ts"`                                                                                                                                                      |
| `packages/kernel/src/index.ts`                                                                                 | export component/orchestrator/builder/pacer/errors mới (không export demo — subpath riêng)                                                                                                         |
| `packages/kernel/src/{orchestrator,builder,pacer}.test.ts`, `packages/kernel/src/demo/loopback.test.ts`        | test theo §12.1 + golden T1–T8                                                                                                                                                                     |
| `packages/test-utils/src/sim.ts`                                                                               | `makeSim(project: ProjectModel, opts?)`, `FakeController` (OQ-028)                                                                                                                                 |
| `packages/test-utils/src/index.ts`                                                                             | export `makeSim`/`FakeController` (không thêm dependency — không import `@vcs/project`, OQ-017)                                                                                                    |
| `apps/cli/src/index.ts`, `apps/cli/src/commands/{index,version,validate,run}.ts`, `apps/cli/src/extensions.ts` | entry commander + 3 lệnh + danh sách extension `[demoExtension]` (một chỗ, §6.8)                                                                                                                   |
| `apps/cli/src/commands/*.test.ts`                                                                              | test CLI ≥ 10 (§12.1): gọi hàm lệnh trực tiếp (trả exit code), 2 test spawn `pnpm vcs` thật                                                                                                        |
| `apps/cli/package.json`, `apps/cli/tsconfig.json`                                                              | deps `@vcs/kernel` + `@vcs/project` + `@vcs/schemas` (`workspace:*`), `commander@15.1.0` (phát hành 2026-11-07, ≥ 14 ngày ✓, A14); tsconfig mới (apps/cli hiện chỉ có package.json)                |
| `package.json` (root)                                                                                          | thêm script `"vcs": "tsx apps/cli/src/index.ts"` + dep `@vcs/project: workspace:*` (bench orchestrator nạp project qua `loadProject`)                                                              |
| `examples/hello-tags/vcs.project.yaml`, `examples/hello-tags/tags/tags.yaml`                                   | theo M0 §10 nguyên văn (≈ 12 tag; M/DB chỉ để kiểm `TagCatalog`, không vào TagDB)                                                                                                                  |
| `scripts/gen-bench-project.ts`, `bench/orchestrator.bench.ts`                                                  | sinh `bench/project-5000` (5 000 tag, 4 controller demo, không commit) + bench orchestrator ≥ 100 000 bước/s (§12.4); script root `bench` chạy cả 2 bench; `.gitignore` thêm `bench/project-5000/` |
| `pnpm-lock.yaml`                                                                                               | sinh lại bằng `pnpm install` thật trong bản sao `/tmp` (OQ-007), kiểm lockfile có `link:` cho kernel/cli/commander; **không** symlink tay                                                          |
| `docs/STATE.md`, `docs/open-questions.md`                                                                      | kế hoạch này + OQ-020…OQ-029                                                                                                                                                                       |

**Test (M0 §12.1–12.2; P0.4 mới ≥ 68):** `Pacer` ≥ 10 (đồng hồ giả: 1×, 10×, max, tụt, tạm dừng); Orchestrator ≥ 30 (thứ tự pha/hook, post/inbox, `throw`/`isolate`, async path, snapshot/restore round-trip, reset, tất định); Builder/extension ≥ 10 (thứ tự, thiếu factory → `SIM-W001`, lỗi init); `LoopbackController` ≥ 8; CLI ≥ 10 (`validate` mã thoát 0/2/3, `run`, `--hash`, `--csv`). Property (fast-check, seed cố định): hai lần chạy cùng cấu hình + cùng chuỗi `post` ⇒ hash giống hệt; chạy N bước, snapshot, chạy M bước (hash), restore, chạy lại M bước ⇒ hash giống hệt (§12.2). Tổng sau P0.4: ≥ 340 test. **Gate P0.4 (PROMPTS):** `vcs run examples/hello-tags --until 5s --hash` cho cùng hash qua các lần chạy (test CLI so sánh 2 lần chạy — chạy được cả trên CI ubuntu + windows, thay cho chạy tay); snapshot→restore tái lập hash; component async trong `stepOnce()` → SIM-E002.

**Bench (M0 §12.4):** orchestrator rỗng (project 5 000 tag + LoopbackController) ≥ 100 000 bước/giây; đo có warm-up, không hạ ngưỡng (VM CPU chia sẻ: ghi số thật nếu sát ngưỡng).

**Rủi ro + cách kiểm:** (1) Công thức `Pacer.plan()` do spec không cho — mặc định OQ-022 + test thể hiện đúng công thức, chủ sản phẩm có thể sửa sau (chỉ đổi pacer + test của nó). (2) Bench orchestrator không đạt trên VM chia sẻ → đo nhiều lần, ghi số thật, không hạ ngưỡng (tầng C). (3) Lỗi khai báo dependency lặp lại kiểu PR #9 → khai báo trước khi chạy gate + gate trên bản sao `/tmp` cài thật (OQ-012). (4) `commander@15.1.0` là dependency ngoài mới — spec bắt buộc (A14, M0 §2 dòng 14), đã ghim đúng quy tắc ≥ 14 ngày.

**Ngoài phạm vi:** `vcs serve`, server, web, `semantics.md`/ADR, sửa package khác (trừ `package.json` root + `.gitignore` + lockfile đã nêu, có lý do).

**Kịch bản chung cho các bảng timeline (golden; nguồn: M0 §6.6–6.8, 6.10, §10; AGENTS §4):** tag hello-tags theo thứ tự handle — h0 `BTN_START` Bool I DI `false` (free); h1 `SW_AUTO` Bool I DI `false` (free → plant `setOwner('plant')` lúc setup); h2 `PT01` Int I AI `0` (free, scaling chỉ là metadata); h3 `LAMP_RUN` Bool Q DO `false` (controller); h4 `LAMP_AUTO` Bool Q DO `false` (controller); h5 `LAMP_HEARTBEAT` Bool Q DO `false` (controller); h6 `SCAN_CNT` Int Q AO `0` (controller). TagDB size 7 (tag M/DB `%M0.0`, `DB1.DBW0` chỉ ở catalog). PLC1 builtin demo, `stepMs = plcScanMs = 10`, seed 1, `scanCount₀ = 0`, `lastScanSimMs₀ = 0`, `blinkNext₀ = 500`. Plant `"plant"` (pha plant), PLC1 (pha controllers), gateway `"gw"` (pha gateways, đọc `LAMP_RUN` mỗi bước). Hook `beforeExternals`/`afterStep` ghi log. Subscriber `'*'` ghi mọi `TagChange`.

**T1 — Thứ tự một bước (T = 0; trước bước đã `post` C0: `BTN_START := true`, source `'test'`):**

| #   | Hành động                                           | Kết quả                                                     |
| --- | --------------------------------------------------- | ----------------------------------------------------------- |
| 1   | `beforeExternals(0)`                                | log `before:0`                                              |
| 2   | drain inbox: C0                                     | h0 F→T (ts 0, source `test`, writes 1)                      |
| 3   | plant.step(0, 10): `SW_AUTO := true`                | h1 F→T (ts 0, source `plant`, writes 1)                     |
| 4   | PLC1.step(0, 10): scan#1, đọc `{BTN:true, SW:true}` | h3 F→T, h6 0→1 (source `plc`); h4 `!true = false` không đổi |
| 5   | gw.step(0, 10)                                      | đọc được `LAMP_RUN = true`                                  |
| 6   | `tags.flush()`                                      | phát theo handle: h0, h1, h3, h6                            |
| 7   | `afterStep(0)`                                      | log `(T=0, SCAN_CNT=1)`                                     |
| 8   | `clock.advance(10)`                                 | clock 10, stepCount 1                                       |

Thứ tự sự kiện golden: `before:0 → cmd → plant → plc → gw → flush[h0,h1,h3,h6] → after:0 → clock 10`.

**T2 — Độ trễ plant→PLC 1 bước (plant: T=0 `SW_AUTO := true`; T=10, T=20 đọc `LAMP_RUN`; giữa bước T=0 và T=10 test `post` C1: `BTN_START := true`):**

| T   | Pha plant                                       | Pha controllers                                                                | `flush()` phát | Plant quan sát |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------ | -------------- | -------------- |
| 0   | `SW_AUTO` F→T                                   | đọc `SW_AUTO=true` cùng bước → `LAMP_AUTO = false` (không đổi); `SCAN_CNT` 0→1 | h1, h6         | —              |
| 10  | đọc `LAMP_RUN = false` (PLC chưa chạy bước này) | drain C1: h0 F→T → `LAMP_RUN = true`, `SCAN_CNT` 1→2                           | h0, h3, h6     | `false`        |
| 20  | đọc `LAMP_RUN = true`                           | không đổi đầu vào → chỉ `SCAN_CNT` 2→3                                         | h6             | `true`         |

Kết luận: PLC thấy giá trị plant **cùng bước** T=0; plant thấy output PLC ở **T+dt** (ghi ở T=10, thấy ở T=20).

**T3 — post()/inbox (sim mới; plant: T=0 `SW_AUTO := true`, sau đó nghỉ; chạy 2 bước T=0, 10 → clock 20, sc 2, `SCAN_CNT` = 2):**

| Thời điểm | Hành động                                                       | Kết quả                                                                                         |
| --------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Giữa bước | `post` A (`BTN := true`), `post` B (`BTN := false`)             | inbox = [A, B]                                                                                  |
| Giữa bước | `snapshotAll()`                                                 | ném `SIM-E003` ("có lệnh đang chờ"), clock vẫn 20                                               |
| T=20      | `beforeExternals(20)` `post` C (`PT01 := 100`, source `'test'`) | C vào inbox sau A, B                                                                            |
| T=20      | drain A, B, C theo thứ tự post                                  | A: h0 F→T (w1); B: h0 T→F (w2) — về bằng giá trị đã flush → **không phát h0**; C: h2 0→100 (w1) |
| T=20      | plant.step: `post` D (`PT01 := 200`)                            | D **không** drain ở bước này (drain đã xong)                                                    |
| T=20      | PLC: đầu vào không đổi → `SCAN_CNT` 2→3                         | flush: h2 0→100, h6 2→3; clock 30, sc 3                                                         |
| T=30      | drain D: h2 100→200; PLC `SCAN_CNT` 3→4                         | flush: h2, h6; clock 40, sc 4                                                                   |

Kết luận: lệnh `post` trong `beforeExternals` chạy cùng bước (drain chạy sau hook); lệnh `post` trong pha plant chạy ở bước kế (OQ-029).

**T4 — snapshot/restore + hash tất định (sim mới; plant: T=0 `SW_AUTO := true`, sau đó nghỉ):**

| Giai đoạn                                      | Trạng thái                                                                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chạy 10 bước (T=0..90)                         | clock 100, sc 10, `SCAN_CNT` = 10, `LAMP_AUTO` = false, heartbeat false                                                                             |
| Snapshot S                                     | `{simTimeMs: 100, stepCount: 10, tags: [F,T,0,F,F,F,10], loopback: {scanCount: 10, lastScanSimMs: 90, blinkNext: 500}, faulted: []}`                |
| `hasher.reset()`; chạy 5 bước (T=100..140)     | clock 150, sc 15, `SCAN_CNT` = 15; `hashM` = hash của 5 bước này                                                                                    |
| `restoreAll(S)`                                | clock 100, sc 10, `SCAN_CNT` = 10, loopback như S; `flush()` phát h6 15→10 (ts = 90 đã lưu, source `'plc'`, writes = 0 — OQ-019); emit `'restored'` |
| `hasher.reset()`; chạy lại 5 bước (T=100..140) | clock 150, sc 15, `SCAN_CNT` = 15; `hashM'` **== `hashM`**                                                                                          |

Chú ý: không `reset()` hasher sau restore thì change h6 15→10 lọt vào luồng băm và hai lần chạy lệch hash (bài học P0.3).

**T5 — isolate vs throw (sim mới + `FakeController "boom"` ở pha controllers, đăng ký sau PLC1; ném `Error('boom')` từ lần `step()` thứ 3):**

| Chế độ                     | Bước T=20 (lần step thứ 3 của boom)                                                                                                                                                | Các bước sau                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `throw`                    | PLC1 chạy (`SCAN_CNT` 2→3, chưa flush); boom ném → `SimComponentError{id 'boom', phase 'controllers', T 20, cause}` lan ra ngoài; `flush()` **không** chạy; clock ở 20, sc ở 2     | `stepOnce` kế vẫn ném (boom ném từ lần thứ 3 trở đi); sim kẹt ở T=20 |
| `isolate`                  | boom ném → `faulted = {'boom'}`; emit `componentFault{id 'boom', phase 'controllers', T 20, error 'boom'}` + diagnostic `SIM-E001`; gw chạy; `flush()` phát h6 2→3; clock 30, sc 3 | T=30: boom **bị bỏ qua** (faulted); PLC1 tiếp tục, `SCAN_CNT` 3→4    |
| `resetAll()` (sau isolate) | xóa `faulted`; clock 0; sc 0; `tags.reset()`; `boom.reset()` (đếm lần gọi về 0); `flush()`; emit `'reset'`                                                                         | chạy lại: boom lại ném ở bước T=20                                   |

`snapshotAll` sau khi fault: `faulted: ['boom']` trong snapshot; `restoreAll` khôi phục danh sách faulted.

**T6 — async: SIM-E002 + stepOnceAsync (sim mới + `FakeController "slow"` ở pha controllers sau PLC1; `step()` trả `Promise.resolve()`):**

| Đường chạy                              | Kết quả                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `stepOnce()` T=0                        | plant → PLC1 (`SCAN_CNT` 0→1, chưa flush) → `slow.step()` trả Promise → ném `SIM-E002`; `flush()` không chạy; clock 0, sc 0          |
| `stepOnceAsync()` T=0 (sim mới)         | plant → PLC1 → `await slow.step()` → gw → `flush()` phát h6 0→1 → `afterStep` → clock 10, sc 1; thứ tự pha giữ nguyên                |
| `stepOnceAsync()` + slow reject ở lần 2 | T=0 ok (sc 1); T=10: isolate → faulted + `SIM-E001`, bước hoàn tất (clock 20, sc 2); throw → `SimComponentError`, clock ở 10, sc ở 1 |

`stepOnceAsync` với toàn component đồng bộ cho kết quả giống hệt `stepOnce` (cùng thứ tự, cùng flush).

**T7 — Pacer.plan() với đồng hồ giả (`stepMs = 10`, `sliceBudgetMs = 8`, `maxLagMs = 1000`; công thức OQ-022):**

| Trường hợp              | Gọi                                                                | Kết quả `{steps, lagging, achievedScale}`                       |
| ----------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1×, `start(0)` @wall 0  | `plan(0, 10)` @wall 0                                              | `{0, false, 0}` (elapsed 0, due 0)                              |
| 1×                      | `plan(0, 10)` @wall 100                                            | `{10, false, 0}` (target 100, due 100)                          |
| 1×, đã chạy 10 bước     | `plan(100, 10)` @wall 100                                          | `{0, false, 1}` (due 0; achieved = (100−0)/100)                 |
| 10×, `start(0)` @wall 0 | `plan(0, 10)` @wall 100                                            | `{100, false, 0}` (target 1000, due 1000 = maxLagMs → chưa lag) |
| 10×, đã chạy 100 bước   | `plan(1000, 10)` @wall 150                                         | `{50, false, 6.67}` (target 1500, due 500; achieved = 1000/150) |
| Tụt, 1×                 | `plan(0, 10)` @wall 2000                                           | `{0, true, 0}` (due 2000 > 1000 → đặt lại mốc (2000, 0))        |
| Sau tụt                 | `plan(0, 10)` @wall 2100                                           | `{10, false, 0}` (elapsed 100, due 100)                         |
| max                     | `plan(0, 10)` @wall 50                                             | `{∞, false, 0}` (service tự cắt theo `sliceBudgetMs`)           |
| pause                   | `pause()` rồi `plan(0, 10)` @wall 500                              | `{0, false, 0}`                                                 |
| resume                  | `start(100)` @wall 600 (đặt lại mốc) rồi `plan(100, 10)` @wall 700 | `{10, false, 0}`                                                |

**T8 — CLI golden: `vcs run examples/hello-tags --until 5s --hash` (không có plant component ở M0 — plant phase trống; `runUntil(5000)` chạy T=0..4990):**

| Hạng mục                       | Giá trị sau 500 bước                                                       |
| ------------------------------ | -------------------------------------------------------------------------- |
| clock / stepCount              | 5000 / 500                                                                 |
| `SCAN_CNT`                     | 500 (1 scan/bước, chưa wrap: 500 < 32767)                                  |
| `LAMP_RUN`                     | `false` (`BTN_START` false suốt)                                           |
| `LAMP_AUTO`                    | `true` (`SW_AUTO` false → đảo → true, từ scan T=0)                         |
| `LAMP_HEARTBEAT`               | `true` (đảo ở T=500, 1000, …, 4500 — 9 lần, số lẻ)                         |
| `PT01`, `SW_AUTO`, `BTN_START` | `0`, `false`, `false`                                                      |
| TagDB size                     | 7 (tag M/DB không vào TagDB)                                               |
| Hash                           | chạy 2 lần → giống hệt (luồng flush chỉ chứa sim time, không có wall time) |

`vcs validate examples/hello-tags` → exit 0, không diagnostic.

## 12. Kế hoạch P0.5 — Server: REST/WS/SimulationService + `vcs serve` (plan-first, 2026-11-24)

**Hiểu biết (tóm tắt):** (1) Server Node là nơi duy nhất chạy mô phỏng ở M0 (A10/D-004): `vcs serve` nạp project, dựng `SimulationBundle` bằng `createSimulation` với `errorPolicy: 'isolate'`, phục vụ REST tối thiểu + WS theo schema zod chung đã có ở `@vcs/schemas/protocol` (P0.2, `PROTOCOL_VERSION = 1`). (2) `SimulationService` sở hữu bundle + vòng chạy: mỗi lát hỏi `Pacer.plan()` (công thức OQ-022, `now()` do server tiêm `Date.now` — `apps/*` được dùng thời gian thật, B10), chạy `stepOnce()` đúng số bước trong ngân sách `sliceBudgetMs = 8 ms`, rồi nhường event loop (`setImmediate` khi `max`/tụt, `setTimeout` khi đủ nhanh); lệnh xếp hàng, áp dụng giữa các lát. (3) WS `/ws`: mỗi kết nối subscribe riêng; một subscriber `'*'` của TagDB gom thay đổi vào bộ đệm last-write-wins theo handle, phát `tags.delta` theo nhịp `VCS_UI_RATE_HZ = 10 Hz`, lọc theo handle từng kết nối; giới hạn message ≤ 64 KB, kiểm Origin, tối đa 8 kết nối. (4) `tag.write` từ UI: `checkWrite(h, 'hmi')` → ok thì `post()` (hiệu lực đầu bước kế; tạm dừng thì `applyInbox`, D4), denied → `TAG-E002`. (5) `vcs serve` là lệnh CLI thứ tư (A14, mỗi lệnh một file); `dev`/`build` (M0 §3.3) thuộc P0.5–P0.7. (6) Gate P0.5: ≥ 15 test server; `tag.write` vào tag không-free bị từ chối; `timeScale max` không làm event loop trễ > 50 ms (§12.4).

**Phạm vi (M0 §8.2, §9, §12.1, §12.4, §13; PROMPTS P0.5; AMENDMENTS A10, A14, B10, D4, D5):** `apps/server` (`sim-service.ts`, `server.ts`, `routes.ts`, `ws.ts`, `config.ts`, `extensions.ts`, entry `index.ts` + `VERSION` OQ-051), lệnh `vcs serve` (+ `--port/--host/--open`), REST `GET /api/health` + `GET /api/project`, WS `/ws` đúng schema, gom `tags.delta` 10 Hz, kiểm Origin/kích thước/số kết nối, bind `127.0.0.1` mặc định, mã mới `WS-E003` (OQ-039/041) + sinh lại `docs/diagnostics.md`, script root `dev` (turbo: server watch; vite chờ P0.6) + `build` (tsup bundle `apps/server` + `apps/cli`), test server bằng client `ws` thật trên cổng `port: 0`. **Không làm:** `apps/web` (P0.6; chỉ đăng ký `@fastify/static` có điều kiện khi build tồn tại, OQ-044), e2e Playwright (P0.6), `semantics.md`/ADR (P0.7), các mục P0.8 (B2 `applyInbox` đã có từ P0.4/D4; `validateTagValue`, `asyncStep`/`requiresAsync`, `files.comms`/`files.hmi`, `sym:` — chờ P0.8), mã chẩn đoán khác ngoài `WS-E003`, Worker transport (A10/E6 — tùy chọn sau).

**Thiết kế nhỏ nhất:** `SimulationService` thuần điều phối trên `SimulationBundle` có sẵn: không timer riêng cho sim (chỉ một `setTimeout`/`setImmediate` nối lát), không thread/worker; trạng thái là một object `{state, simTimeMs, stepCount, timeScale, lagging, achievedScale}` đọc từ bundle + Pacer; hàng đợi lệnh là mảng hàm áp dụng giữa các lát. WS handler mỏng: validate zod → điều phối service → serialize `ServerMessage`; bộ đệm delta là `Map<handle, TagValue>` (last-write-wins) + danh sách subscribe mỗi kết nối (`'*'` hoặc `Set<handle>`); tick 10 Hz bằng một `setInterval` duy nhất của server (không phải mỗi kết nối). REST mỏng: đọc thẳng từ bundle/project. `config.ts` đọc env `VCS_PORT/VCS_HOST/VCS_LOG_LEVEL/VCS_UI_RATE_HZ` + cờ CLI (CLI thắng env). Log `pino` JSON (OQ-046). **Lựa chọn đã loại:** (1) Dùng `ws` trực tiếp thay Fastify — loại: spec §3.2 chỉ định Fastify + `@fastify/websocket`, REST + static cần cùng một server. (2) Phát `tags.delta` ngay mỗi `flush()` — loại: spec §8.2 bắt gom theo nhịp 10 Hz; 5 000 tag đổi liên tục sẽ ngập client. (3) Vòng chạy bằng `setInterval` cố định — loại: `Pacer.plan()` + `sliceBudgetMs` mới bám đúng `timeScale`, phát hiện `lagging`, nhường event loop khi `max`.

**Mơ hồ (phân loại):** **Chặn — không có:** mọi mơ hồ đều có mặc định tầng B. **Có mặc định — OQ-033…OQ-053 (21 mục):** OQ-033 snapshot gồm M/DB (quyết định e2e §12.3, xem S1); OQ-034 thứ tự `defs`; OQ-035 gửi lại snapshot sau `reset`; OQ-036 Origin; OQ-037 message > 64 KB → đóng 1009; OQ-038 kết nối thứ 9 → đóng 1013; OQ-039 sai schema/trước `hello` → `WS-E003`, version khác → `WS-E001` rồi đóng 1008; OQ-040 lệnh sai trạng thái (no-op, trừ `step` khi RUNNING → `WS-E002` đã có trong spec); OQ-041 `timeScale` sai → `WS-E003`; OQ-042 `GET /api/project`; OQ-043 `--open`; OQ-044 `GET /` khi chưa có web build; OQ-045 project lỗi → exit 2; OQ-046 log `pino`; OQ-047 nhịp `sim.state`/`delta` khi dừng; OQ-048 `simTimeMs` của delta + không gửi delta rỗng; OQ-049 subscribe tên lạ; OQ-050 SIGINT/SIGTERM; OQ-051 `VERSION` server; OQ-052 `stepOnce()` ném trong lát → pause + diagnostics; OQ-053 thời điểm gửi `diagnostics`. **Không ảnh hưởng:** `ControllerIntrospection`/`isIntrospectable` vẫn chỉ khai báo (P1.4); gateway ngoài chưa có nên `gateways` phase trống.

**File (mới/sửa):**

| File | Nội dung |
| --- | --- |
| `packages/schemas/src/diagnostics-catalog.ts` | thêm `WS-E003` (thông điệp không hợp lệ / `timeScale` sai / gửi trước `hello`) |
| `docs/diagnostics.md` | sinh lại bằng `pnpm docs:diagnostics` (24 mã) |
| `apps/server/package.json`, `apps/server/tsconfig.json` | deps `fastify@5.12.8` (2026-11-02), `@fastify/websocket@11.3.7` (2026-11-04), `@fastify/static@10.1.10` (2026-11-04 — **không** lấy latest 10.1.12 ra 2026-11-19, vi phạm ≥ 14 ngày), `pino@10.4.0` (2026-10-02), workspace `@vcs/kernel` + `@vcs/project` + `@vcs/schemas`; devDep `ws@8.22.2` (2026-11-08 — **không** lấy 8.23.0 ra 2026-11-12) chỉ cho test client thật; tsconfig mới |
| `apps/server/src/config.ts` | `ServerConfig` + đọc env/cờ CLI, mặc định §8.2 (port 4170, host 127.0.0.1, 10 Hz, 8 kết nối, 64 KB) |
| `apps/server/src/sim-service.ts` | `SimulationService` (state, `run/pause/step/reset/setTimeScale`, hàng đợi lệnh giữa các lát, vòng `Pacer.plan` + `sliceBudgetMs` 8 ms, `tag.write` qua `checkWrite` + `post`, bắt lỗi lát → pause + diagnostics OQ-052) |
| `apps/server/src/ws.ts` | WS `/ws`: Origin (OQ-036), giới hạn kết nối/kích thước (OQ-037/038), `hello`/`welcome` (OQ-039), subscribe + snapshot (OQ-033/034/049), buffer delta LWW + tick 10 Hz (OQ-047/048), điều phối lệnh (OQ-040/041), `diagnostics` (OQ-053) |
| `apps/server/src/routes.ts` | `GET /api/health`, `GET /api/project` (OQ-042), `GET /` 404 khi chưa có web build + `@fastify/static` có điều kiện (OQ-044) |
| `apps/server/src/server.ts` | `createServer(dir, config)`: `loadProject` → `createSimulation({extensions, errorPolicy: 'isolate'})` → Fastify + routes + WS + service; `start/stop` (OQ-045/050) |
| `apps/server/src/extensions.ts` | `[demoExtension]` — danh sách extension một chỗ, mirror `apps/cli` (§6.8) |
| `apps/server/src/index.ts` | entry + `VERSION = '0.1.0'` (OQ-051) |
| `apps/server/src/*.test.ts` | test server (xem dưới) |
| `apps/server/tsup.config.ts`, `apps/cli/tsup.config.ts` | bundle ESM `src/index.ts` → `dist` cho `pnpm build` (§3.2) |
| `apps/cli/src/commands/serve.ts`, `apps/cli/src/commands/serve.test.ts` | `vcs serve <dir> [--port] [--host] [--open]`; exit 3/2 (OQ-045), `--open` (OQ-043), `--host 0.0.0.0` → cảnh báo |
| `apps/cli/src/commands/index.ts` | đăng ký `serve` |
| `apps/cli/package.json` | thêm dep `@vcs/server: workspace:*` |
| `package.json` (root) | script `dev` (`turbo run dev`: server watch; vite chờ P0.6) + `build` (`turbo run build`); devDep `tsup@9.0.0` (2026-10-14, ≥ 14 ngày ✓) |
| `turbo.json` | kiểm tra pipeline `dev`/`build`, thêm nếu chưa có |
| `.dependency-cruiser.cjs` | kiểm tra rule `apps/server` (đã cho phép mọi package §3.5); test import sai phải fail (mẫu M0 §15.8) |
| `pnpm-lock.yaml` | sinh lại bằng `pnpm install` thật trong bản sao `/tmp` (OQ-007); kiểm `link:` cho server/fastify; **không** symlink tay |
| `docs/STATE.md`, `docs/open-questions.md` | kế hoạch này + OQ-033…OQ-053 |

**Test (M0 §12.1; P0.5 mới ≥ 20, spec đòi ≥ 15):** server WS thật (client `ws`, Fastify trên `port: 0`, fake `now()` cho Pacer + real timer cho drift): hello/welcome + version khác → `WS-E001` rồi đóng; subscribe `'*'` → snapshot 12 defs đúng S1; subscribe mảng tên (gồm tên lạ → bỏ qua, OQ-049); run/pause/step/reset đúng S1; `step` khi RUNNING → `WS-E002`; `timeScale` số + `'max'` + sai → `WS-E003`; `tag.write` ok (free, hiệu lực bước kế, delta chứa change — S1 dòng 5–6); denied `TAG-E002`; tên không tồn tại → `TAG-E003`; delta gom LWW (SCAN_CNT 1..10 → chỉ `[6,10]`); `lagging` khi Pacer tụt (fake clock nhảy 2000 ms → `lagging: true`, S1/T7); message > 64 KB → đóng 1009; Origin lạ → 403, Origin rỗng/localhost → ok; kết nối thứ 9 → 1013; REST `/api/health` + `/api/project` đúng OQ-042; `serve` exit 3 (thiếu thư mục) / 2 (project lỗi); reset → snapshot lại (OQ-035); `diagnostics` gửi sau `welcome` khi project có warning; vòng chạy gặp `stepOnce()` ném → pause + diagnostics (OQ-052). **Hiệu năng (§12.4, là test không phải bench):** `timeScale max` với hello-tags, đo timer drift event loop ≤ 50 ms (real timers, 1 s). Tổng sau P0.5: ≥ 389 test. **Gate P0.5 (PROMPTS):** ≥ 15 test server; `tag.write` vào tag không-free bị từ chối; `timeScale max` không làm event loop trễ > 50 ms. Gate chuẩn: `lint && typecheck && depcheck && test && review:cheats && docs:diagnostics --check` (WS-E003 → regen `docs/diagnostics.md`); `pnpm bench` chạy lại (TagDB + orchestrator, guard hồi quy, không bench mới).

**Rủi ro + cách kiểm:** (1) OQ-033 (snapshot M/DB) sai → e2e §12.3 #1 (< 10 hàng) đỏ ở P0.6 — kiểm ngay ở P0.5 bằng test đếm defs = 12, không chờ P0.6. (2) Fastify + `@fastify/websocket` phiên bản mới (API đổi) — ghim đúng bản đã kiểm ngày phát hành, test WS thật bắt lỗi tương thích. (3) Timer drift > 50 ms ở `max` trên VM chia sẻ — đo bằng real timer, ghi số thật, không hạ ngưỡng (tầng C nếu đỏ). (4) Lỗi khai báo dependency lặp lại kiểu PR #9 — khai báo trước khi gate + gate trên bản sao `/tmp` cài thật (OQ-012). (5) `@fastify/static` latest vi phạm quy tắc ≥ 14 ngày — đã ghim 10.1.10, ghi rõ lý do ở đây để lần sau không "nâng cấp" nhầm.

**Ngoài phạm vi:** `apps/web`, e2e Playwright, `semantics.md`/ADR, P0.8, sửa package khác (trừ `package.json` root + `pnpm-lock.yaml` + `turbo.json` + `.dependency-cruiser.cjs` đã nêu, có lý do).

**S1 — Golden: phiên WS với `examples/hello-tags` (tính tay; nguồn: M0 §8.2, §9, §6.7; Pacer OQ-022/T7; OQ-033…035, 039–041, 047–048).** Giả thiết: `stepMs = plcScanMs = 10`, seed 1, wall clock giả, tick UI 100 ms, `timeScale = 1×`. Snapshot `defs` (OQ-033/034, thứ tự khai báo): idx 0 `BTN_START` F, 1 `SW_AUTO` F, 2 `PT01` 0, 3 `LAMP_RUN` F, 4 `LAMP_AUTO` F, 5 `LAMP_HEARTBEAT` F, 6 `SCAN_CNT` 0, 7 `M_FLAG` F, 8 `M_CNT` 0, 9 `M_ALARM` F, 10 `DB1_VAL` 0, 11 `DB1_FLAG` F. `SCAN_CNT` tăng 1/bước; `LAMP_AUTO = !SW_AUTO` từ scan đầu (T=0); blink đảo ở T=500, 1000, …; `BTN_START`/`SW_AUTO` ban đầu `false`.

| # | Wall | Client → Server | Server → Client / trạng thái sau |
| --- | --- | --- | --- |
| 1 | 0 | kết nối, `hello {protocolVersion: 1}` | `welcome {protocolVersion: 1, project: {name: 'Hello Tags', language: 'vi', stepMs: 10}, sim: {state: 'IDLE', simTimeMs: 0, stepCount: 0, timeScale: 1, lagging: false, achievedScale: 0}}` |
| 2 | 0 | `tags.subscribe {names: '*'}` | `tags.snapshot {defs: 12 (như trên), values: [F,F,0,F,F,F,0,F,0,F,0,F], simTimeMs: 0}` |
| 3 | 0 | `sim.command {cmd: 'run'}` | `sim.state {state: 'RUNNING', simTimeMs: 0, stepCount: 0, timeScale: 1, lagging: false, achievedScale: 0}` (gửi ngay vì đổi trạng thái); `Pacer.start(0)`, mốc (W=0, sim=0) |
| 4 | 100 | — (tick) | `plan(0, 10)` → `{steps: 10, lagging: false, achievedScale: 0}` (elapsed 100, target 100, due 100). Chạy 10 bước T=0..90: bước 1: `LAMP_AUTO` F→T (idx 4), `SCAN_CNT` 0→1; bước 2..10: `SCAN_CNT` 2..10. Buffer LWW `{4: true, 6: 10}`. → `sim.state {RUNNING, 100, 10, 1, false, 1}` (achievedScale tính lại sau lát = 100/100); `tags.delta {simTimeMs: 100, changes: [[4, true], [6, 10]]}` |
| 5 | 150 | `tag.write {name: 'BTN_START', value: true}` | `checkWrite` ok (free) → `post()` → áp dụng ở drain bước 11 (T=100, bước kế tiếp): `BTN_START` F→T, loopback `LAMP_RUN` F→T (idx 3) |
| 6 | 200 | — (tick) | `plan(100, 10)` → `{10, false, 0.5}` (elapsed 200, achieved = 100/200). Bước 11..20 (T=100..190): `SCAN_CNT` 11..20; bước 11: `LAMP_RUN` T. Buffer `{3: true, 6: 20}`. → `sim.state {RUNNING, 200, 20, 1, false, 1}`; `tags.delta {simTimeMs: 200, changes: [[3, true], [6, 20]]}` |
| 7 | 500 | — (tick) | Bước 41..50 (T=400..490): `SCAN_CNT` 41..50; blink chưa đảo (`blinkNext = 500`, đảo ở bước 51). → `sim.state {RUNNING, 500, 50, 1, false, 1}`; `tags.delta {simTimeMs: 500, changes: [[6, 50]]}` |
| 8 | 600 | — (tick) | Bước 51..60 (T=500..590): bước 51 đảo `LAMP_HEARTBEAT` F→T (idx 5); `SCAN_CNT` 51..60. → `sim.state {RUNNING, 600, 60, 1, false, 1}`; `tags.delta {simTimeMs: 600, changes: [[5, true], [6, 60]]}` |
| 9 | 600 | `tag.write {name: 'LAMP_RUN', value: false}` | `checkWrite` denied (owner `controller`) → `error {code: 'TAG-E002', message: …}`. Không đổi trạng thái, không delta |
| 10 | 650 | `sim.command {cmd: 'step', steps: 1}` khi RUNNING | `error {code: 'WS-E002'}`. Bỏ qua, vẫn RUNNING |
| 11 | 700 | `sim.command {cmd: 'pause'}` | `sim.state {state: 'PAUSED', simTimeMs: 700, stepCount: 70, timeScale: 1, lagging: false, achievedScale: 1}` gửi ngay; timer vẫn chạy nhưng không gửi `sim.state` định kỳ khi dừng (OQ-047) |
| 12 | 750 | `sim.command {cmd: 'step', steps: 3}` | 3× `stepOnce` (T=700, 710, 720): `SCAN_CNT` 71, 72, 73; `simTimeMs` 730, `stepCount` 73. Buffer `{6: 73}` |
| 13 | 800 | — (tick) | `tags.delta {simTimeMs: 730, changes: [[6, 73]]}`; không gửi `sim.state` (PAUSED, không đổi) |
| 14 | 850 | `sim.command {cmd: 'reset'}` | `resetAll`: sim về 0, tag về initial. → `tags.snapshot` đủ 12 defs, values initial, `simTimeMs: 0` + `sim.state {IDLE, 0, 0, 1, false, 0}` (OQ-035) |
| 15 | 900 | `sim.timeScale {value: 'max'}` | `timeScale` → `'max'`; `sim.state {IDLE, 0, 0, 'max', false, 0}` (gửi vì `timeScale` đổi). `run` tiếp → `plan()` trả `∞`, service cắt lát theo `sliceBudgetMs` 8 ms + `setImmediate` |

Lưu ý khi viết test từ S1 (dễ nhầm): `Pacer.plan().achievedScale` tính **trước** khi chạy lát (dòng 4: 0; dòng 6: 0.5), còn `sim.state.achievedScale` tính **sau** lát (luôn 1 ở trạng thái ổn định 1×). Hai giá trị khác nhau là đúng — test phải assert đúng chỗ. `tag.write` ở dòng 5 áp dụng ở drain bước 11 (T=100), không phải bước 16 (T=150): sim time chỉ tăng khi bước chạy, lệnh xếp hàng chờ bước kế tiếp.

**Kết quả P0.5 (2026-11-24, xong local, chưa mở PR).** Code theo đúng phạm vi §12 + OQ-033…OQ-053; không làm `apps/web`, e2e, `semantics.md`/ADR, P0.8, Worker.

- **File mới:** `apps/server/{package.json,tsconfig.json,tsup.config.ts}` + `src/{index,main,server,routes,ws,config,sim-service,extensions,version}.ts` + test (`config` 12, `sim-service` 11, `ws` 22 test); `apps/cli/tsup.config.ts`, `apps/cli/src/commands/{serve,serve.test}.ts` (6 test).
- **File đổi:** `package.json` (script `dev`/`build`, devDep `tsup@9.0.0` + `@types/ws@8.18.2`), `pnpm-lock.yaml`, `eslint.config.js` (ignore `**/dist/**`), `apps/cli/package.json` (dep `@vcs/server` + `yaml`/`fastify`/@fastify/*/`pino` trực tiếp), `apps/cli/tsconfig.json`, `apps/cli/src/commands/{index,version.test}.ts`, `packages/schemas/src/diagnostics-catalog.ts` (WS-E003), `docs/diagnostics.md` (24 mã), `docs/STATE.md`, `docs/open-questions.md` (OQ-033…OQ-055).
- **Test: 51 mới, tổng 420/420 (31 file)** — vượt mục tiêu ≥ 20 mới / ≥ 389 tổng. Client WS thật (`ws`) trên `port: 0`, fake `now()` cho Pacer; golden S1 làm chuẩn.
- **Sai khác so với plan (đều ghi OQ, không tự đổi spec):** OQ-054 — S1 dòng 6 delta đúng `[[0,true],[3,true],[6,20]]` (plan ghi `[[3,true],[6,20]]`, thiếu change `BTN_START`); OQ-055 — drift `timeScale max` (xem §4). Race S1 ở test: gửi `tag.write` cùng turn với `set nowMs=200` làm lát 10 ms chạy trước khi WS xử lý — sửa test (đợi sim 150/15, đợi `sim.state` mới qua `waitForNew` rồi mới tăng clock), không sửa service.
- **Sửa trong lúc code (ghi §4):** (1) tsup `external: ['yaml']` (+ fastify/*, pino ở CLI) vì `require` động của builtin; (2) tách `main()` ra `apps/server/src/main.ts`, `index.ts` chỉ export; (3) `port: 0` cho phép ở config (test cần); (4) nhánh `'max'` đo ngân sách lát bằng `Date.now()` thật (không dùng `now()` giả — clock đóng băng sẽ lặp vô hạn); (5) `lagging` chỉ lấy từ lần `plan()` đầu (lần 2 sau reset anchor luôn trả `false`); (6) `--host` rỗng bị từ chối exit 3; (7) ignore eslint `**/dist/**` (pattern cũ chỉ phủ dist root, lint quét cả bundle).
- **Gate (ĐÃ CHẠY, cả 2 nơi):** bản chính — lint 0 lỗi/cảnh báo; typecheck sạch (root + 2 app tsconfig, gồm cả `tsup.config.ts`); depcheck no violations (61 module, 115 dep — gồm `dist/`); test 420 passed/31 file; review:cheats SẠCH (82 file); diagnostics --check khớp (24 mã). Bản `/tmp/vcs-p05` — `pnpm install --frozen-lockfile` exit 0 (lần đầu trong VM); lint/typecheck/depcheck (57 module, 101 dep)/test 420/420/cheats SẠCH/diagnostics khớp đều xanh.
- **Build + smoke dist (ĐÃ CHẠY):** `pnpm build` tsup xanh cả 2 app (server dist 1,1 MB, CLI 3,13 MB). CLI dist: `version` → `vcs 0.1.0` exit 0; `--version` → `0.1.0` exit 0; `validate examples/hello-tags` → `OK: Hello Tags — 12 tags, 1 controllers` exit 0; `serve` cổng test trả `/api/health` `{ok:true,version:'0.1.0'}` + `/api/project` đúng (12 tag). Server dist: `node dist/main.js examples/hello-tags --port N` chạy, `/api/health` đúng.
- **Bench guard (ĐÃ CHẠY, không bench mới):** TagDB 4/4 PASS (set/get 51,5M ops/s; flush 5000/0 đổi 0,14 µs; flush 1000 đổi + 1 sub 0,061 ms; heap −0,06 MB); orchestrator **514 972 bước/s** bản chính / **507 739** bản `/tmp` — PASS (≥ 100 000).
- **Sửa số liệu P0.4:** bench orchestrator sau sửa OQ-032 ở bản chính là **504 606 bước/s** (parent đo), không phải 374 059 như §1/§2/§3/§6 ghi trước đây — đã sửa ở các mục đó (374 059 là giá trị thấp nhất trong dải 374 059–540 811 ở §4, vẫn đúng trong ngữ cảnh dải).
- **Tiếp theo:** mở PR qua trình duyệt UI (danh sách file §3), chờ CI xanh, merge; rồi P0.6 plan-first.

## 13. Kế hoạch P0.6 — Web + Playwright e2e (plan-first, 2026-11-24)

**Hiểu biết (tóm tắt):** (1) Web là client duy nhất của server P0.5: một trang Tags, nói WS JSON với server qua schema zod chung `@vcs/schemas/protocol` (`PROTOCOL_VERSION = 1`); server đã chạy xong — `hello`/`welcome`, `tags.subscribe '*'` → snapshot 12 defs (OQ-033/034), `tags.delta` LWW 10 Hz, `sim.command`/`sim.timeScale`/`tag.write`, `diagnostics` sau `welcome`, lỗi `TAG-E002`/`WS-E002`/`WS-E003`. (2) Web chỉ được import `@vcs/schemas` (M0 §3.5, rule `web-deps` đã có trong `.dependency-cruiser.cjs`); mọi trạng thái sim/tag đến qua WS, không gọi REST ở M0 (OQ-065). (3) Server đã phục vụ web tĩnh có điều kiện: `apps/web/dist/index.html` tồn tại → `@fastify/static` phục vụ ở `/` (OQ-044); chưa có build → 404 JSON — nên P0.6 chỉ cần sinh ra `dist`, không sửa server. (4) Stack theo M0 §3.2: React + Vite + Tailwind + Zustand + `@tanstack/react-virtual` (bảng ảo hóa), i18n tự viết nhẹ, WS client tự viết có tự kết nối lại. (5) e2e theo M0 §12.3 (3 kịch bản trên hello-tags) + kiểm cuộn 20 000 dòng §12.4 (chạy tay, không bắt buộc CI). (6) Mô phỏng chạy ở server Node (A10/E6); Worker transport là tùy chọn sau, không làm ở P0.6. (7) Gate P0.6: web unit ≥ 10 + e2e ≥ 3 (M0 §12.1); job CI `e2e` mới (ubuntu, build + Playwright chromium, upload trace khi lỗi).

**Phạm vi (M0 §8.3, §9, §12.1, §12.3, §12.4, §13, §15.2/15.8; PROMPTS P0.6; AMENDMENTS A10, B7, B10, E6; OQ-033/034/035, OQ-044, OQ-053):** `apps/web` — khung (header: tên dự án, badge kết nối, đổi ngôn ngữ vi/en, dark mode), Sim bar (Run/Pause, Step 1 bước, Reset, chọn tốc độ 0.1×/1×/2×/10×/100×/max, `simTime` `mm:ss.mmm` + ms, `stepCount`, trạng thái, cảnh báo `lagging` + `achievedScale`), bảng Tags ảo hóa (cột Tên/Kiểu/Vùng/Địa chỉ/Controller/Mô tả/Giá trị; Bool `TRUE/FALSE` + chấm màu + chữ; ô đổi nháy nhẹ; lọc chuỗi tên/mô tả + lọc controller/vùng; ô giá trị tag `free` sửa được — Bool nút bật/tắt, số nhập — → `tag.write`), Diagnostics panel (danh sách thu gọn), state Zustand, cập nhật gom theo `requestAnimationFrame`, WS client tự kết nối lại (backoff 0.5 s → 5 s), i18n `t('key')` vi/en, trợ năng (bàn phím Sim bar, nhãn ARIA, tương phản đủ sáng/tối), Vite dev proxy `/api` + `/ws` → `127.0.0.1:4170`, build ra `apps/web/dist`. Playwright e2e theo §12.3 (E1–E5, xem dưới) + `playwright.config.ts` + job CI `e2e`. Script root `test:e2e` (`playwright test`) + script `dev`/`build` cho web; `docs/STATE.md` + `docs/open-questions.md` (OQ-057…OQ-070). **Không làm:** trang khác ngoài Tags (không tạo trang giữ chỗ), React Router (chưa có route thứ hai), `semantics.md`/ADR (P0.7), P0.8 (`validateTagValue`, `asyncStep`, `files.comms`/`files.hmi`, `sym:`), Worker transport (A10/E6), sửa `apps/server` (trừ khi e2e phát hiện lỗi phục vụ static — khi đó sửa lỗi trong phạm vi P0.6 và ghi rõ), mã chẩn đoán mới, test render component (OQ-068).

**Thiết kế nhỏ nhất:** Web thuần hiển thị + điều khiển, không logic mô phỏng: `WsClient` (class mỏng quanh WebSocket native, constructor tiêm `WebSocket` để test — gửi `ClientMessage` đã validate bằng `clientMessageSchema`, parse `ServerMessage` bằng `serverMessageSchema`, sai schema từ server → log + bỏ message) → Zustand store thuần (`defs`, `values: Map<index, TagValue>`, `sim: SimState`, `connection`, `diagnostics`, `lastError`, `changed: Set<index>`): `applySnapshot` (thay toàn bộ), `applyDelta` (ghi đè LWW theo index), `applyState`; React render qua `useStore` + selector theo hàng (mỗi hàng chỉ render lại khi giá trị của nó đổi); gom render bằng rAF (OQ-060); bảng ảo hóa bằng `useVirtualizer` (`@tanstack/react-virtual`, `estimateSize` 36px, `overscan` 10); lọc bằng derived selector (không copy mảng lớn — lọc trên 12 tag rẻ, trên 20 000 tag vẫn O(n) mỗi lần gõ, chấp nhận ở M0); Sim bar là component thuần đọc store + gọi `client.send`; i18n là object dict + `t(key)` (OQ-063); dark mode class `.dark` trên `<html>` (OQ-064). `vite.config.ts`: plugin React + Tailwind v4, proxy `/api` + `/ws` (ws: true) → `http://127.0.0.1:4170`, build `outDir: dist`, `sourcemap: false`. `index.html` ở `apps/web/` (vite root). **Lựa chọn đã loại:** (1) React Router — loại: M0 chỉ một trang (§8.3), thêm router là code chết; thêm khi M1+ có trang thứ hai. (2) Test render component bằng jsdom — loại: e2e Playwright đã kiểm hành vi thật trên trình duyệt; unit test chỉ logic thuần trong node (OQ-068). (3) TanStack Query/SWR cho REST — loại: web M0 không gọi REST (OQ-065), trạng thái đến qua WS. (4) `eslint-plugin-react-hooks` — loại: thêm dependency chỉ cho một luật; kỷ luật hook do review + TypeScript strict giữ; xem lại ở P0.7 nếu cần. (5) Server-side rendering — loại: app local-first, phục vụ tĩnh là đủ.

**Mơ hồ (phân loại):** **Đã quyết — OQ-062 (tier C, A19):** §8.3 mâu thuẫn §12.3 #3 — chủ sản phẩm chọn (a) 2026-11-24: ô non-free có nút "Ghi thử", bấm gửi `tag.write` thật, server trả `TAG-E002`; E4 làm tiếp. **Có mặc định — OQ-057…OQ-061, OQ-063…OQ-070 (13 mục):** OQ-057 không fallback SPA ở M0; OQ-058 WS URL cùng origin; OQ-059 reconnect backoff 0.5→5 s, gửi lại hello + subscribe, write lúc mất kết nối thì bỏ; OQ-060 store cập nhật ngay, render gom rAF; OQ-061 ô số chỉ kiểm cú pháp, khoảng do server quyết (TAG-E001); OQ-063 i18n mặc định `project.language`, lưu `localStorage['vcs.lang']`, chỉ dịch chuỗi giao diện; OQ-064 dark mode mặc định `prefers-color-scheme`, lưu `localStorage['vcs.theme']`, class `.dark`; OQ-065 diagnostics từ WS, web không gọi REST; OQ-066 e2e `webServer` chạy `vcs serve` cổng 4170, một server, `workers: 1`; OQ-067 fixture 20 000 tag sinh bằng script (gitignored), đo FPS bằng rAF + trace, chạy tay không vào CI; OQ-068 unit test logic thuần trong node, không jsdom; OQ-069 `mm` = tổng phút (60:00.000); OQ-070 lọc substring không phân biệt hoa/thường (tên/mô tả) + đơn chọn controller/vùng, AND. **Không ảnh hưởng:** `tags.unsubscribe` (không có đường UI ở M0 — một trang, không hủy subscribe), `ControllerIntrospection`/M-DB ghi (P1.4/P4.1), `comms.status`/`comms.log` (B4, P4.1).

**File (mới/sửa):**

| File | Nội dung |
| --- | --- |
| `apps/web/package.json` | deps `react@19.3.1` (2026-10-14), `react-dom@19.3.1` (2026-10-14), `zustand@5.1.0` (2026-11-06), `@tanstack/react-virtual@3.14.26` (2026-11-03 — **không** lấy 3.14.27/3.14.28, ra 2026-11-22), `@vcs/schemas: workspace:*`; devDep `vite@8.3.7` (2026-11-09 — **không** lấy 8.3.8 ra 2026-11-11), `@vitejs/plugin-react@6.3.0` (2026-11-09), `tailwindcss@4.3.5` (2026-11-06), `@tailwindcss/vite@4.3.5` (2026-11-06), `@types/react@19.3.0` (2026-09-09), `@types/react-dom@19.3.0` (2026-09-09); script `dev` (`vite`, cổng 5173) + `build` (`vite build`); peer tự cài `immer@11.2.10` (2026-11-10, đúng ngưỡng), `use-sync-external-store@1.7.0` (2026-09-09) — kiểm lại trong lockfile, nếu pnpm resolve bản mới hơn thì ghim tường minh |
| `apps/web/vite.config.ts` | React + Tailwind v4, proxy `/api` + `/ws` (ws: true) → `127.0.0.1:4170`, `outDir: dist` |
| `apps/web/index.html` | entry, `<div id="root">`, title "Virtual Commissioning Studio" |
| `apps/web/src/main.tsx` | mount React, import `index.css`, `<App />` |
| `apps/web/src/App.tsx` | khung: header + Sim bar + bảng Tags + Diagnostics panel |
| `apps/web/src/ws-client.ts` | `WsClient` (connect, send, reconnect backoff OQ-059, validate zod 2 chiều) + `FakeWebSocket` cho test |
| `apps/web/src/store.ts` | Zustand store thuần (`applySnapshot/applyDelta/applyState`, filter selector, `changed` flash) |
| `apps/web/src/components/SimBar.tsx` | Run/Pause/Step/Reset, chọn tốc độ, `simTime`/`stepCount`/`lagging` |
| `apps/web/src/components/TagTable.tsx` | bảng ảo hóa + lọc + ô giá trị (Bool toggle, số nhập, nút "Ghi thử" cho ô non-free — OQ-062 chọn (a), A19) |
| `apps/web/src/components/DiagnosticsPanel.tsx` | danh sách thu gọn + badge đếm |
| `apps/web/src/i18n/index.ts` (+ `vi.ts`, `en.ts`) | `t(key)`, dict vi/en (OQ-063) |
| `apps/web/src/format.ts` | `formatSimTime(ms)` → `mm:ss.mmm` (OQ-069) |
| `apps/web/src/index.css` | `@import "tailwindcss"`, `@custom-variant dark` (OQ-064), class `.flash` cho ô đổi |
| `apps/web/src/*.test.ts(x)` | unit test logic thuần (xem dưới; chạy bằng `pnpm test`, không jsdom) |
| `playwright.config.ts` (root) | `testDir: apps/web/e2e`, `webServer` (OQ-066), `workers: 1`, trace `retain-on-failure`, chỉ chromium |
| `apps/web/e2e/*.spec.ts` | E1–E5 (xem dưới) |
| `apps/web/e2e/fixtures/gen-big-project.ts` | sinh project 20 000 tag (OQ-067, gitignored output) |
| `apps/web/e2e/perf-scroll.spec.ts` | đo FPS cuộn 20 000 dòng (chạy tay, **không** vào CI) |
| `package.json` (root) | script `test:e2e` (`playwright test`); devDep `@playwright/test@1.65.0` (2026-11-05 — **không** lấy 1.65.1 ra 2026-11-13) |
| `tsconfig.json` (root) | include thêm `apps/web/vite.config.ts` (root typecheck đã bao `apps/*/src/**`) |
| `.github/workflows/ci.yml` | job `e2e` (ubuntu, Node 22): install → `playwright install --with-deps chromium` → `pnpm build` → `pnpm test:e2e` → upload trace khi lỗi (M0 §13; OQ-008 phần e2e đóng) |
| `pnpm-lock.yaml` | sinh lại bằng `pnpm install` thật trong bản sao `/tmp` (OQ-007); kiểm `link:` cho web/schemas; **không** symlink tay |
| `.gitignore` | `apps/web/e2e/fixtures/big-project/` (OQ-067) |
| `docs/STATE.md`, `docs/open-questions.md` | kế hoạch này + OQ-057…OQ-070 |

**Test (M0 §12.1; web unit ≥ 10, e2e ≥ 3):** unit (node, logic thuần, 15 test): `formatSimTime` 6 ca (0 → `00:00.000`, 10 → `00:00.010`, 1500 → `00:01.500`, 60000 → `01:00.000`, 61500 → `01:01.500`, 3600000 → `60:00.000`); store: apply snapshot 12 defs, apply delta LWW (`SCAN_CNT` 1..10 → 10), lọc tên substring không phân biệt hoa/thường, lọc controller + vùng (AND); i18n: `t()` vi/en + khóa thiếu → trả key; WS client: backoff 0.5, 1, 2, 4, 5, 5 (capped), reconnect gửi lại hello + subscribe, message sai schema từ server bị bỏ. e2e (5 test, theo E1 dưới): E1 load, E2 run/pause/step/reset, E3 ghi tag free → `LAMP_RUN` bật, E4 ghi bị từ chối `TAG-E002` (**chờ OQ-062**), E5 `timeScale max` → stepCount tăng nhanh. **Tổng sau P0.6: ≥ 440 test** (420 + 15 unit + 5 e2e). **Gate P0.6:** `lint && typecheck && depcheck && test && test:e2e && review:cheats && docs:diagnostics --check`; `pnpm bench` chạy lại (guard hồi quy, không bench mới); `pnpm build` + smoke: `vcs serve examples/hello-tags` → `GET /` trả `index.html`, WS từ trang đã serve hoạt động (e2e bao phủ). Depcheck: kiểm rule `web-deps` bằng test mẫu import sai (theo mẫu `tests/tooling-gates.test.ts` — import `@vcs/kernel` từ `apps/web/src` phải làm `depcheck` fail).

**Rủi ro + cách kiểm:** (1) Playwright browser không chạy được trong VM này (thiếu thư viện hệ thống cho Chromium) — VM chạy quyền root, `cdn.playwright.dev` đã kiểm tới được (proxy 200); cách kiểm: `npx playwright install chromium` + `install-deps chromium` ở bản sao `/tmp` trước khi viết e2e; nếu không chạy được thì e2e CHỈ kiểm trên CI (ghi rõ CHƯA CHẠY local, không bịa kết quả). (2) OQ-062 chưa quyết → E4 + nút "Ghi thử" phải chờ; e2e E1–E3/E5 làm trước, E4 thêm sau khi quyết (không chặn merge các phần khác nhưng merge P0.6 cần E4 hoặc quyết định hoãn E4 bằng văn bản). (3) Tailwind v4 + React 19 + Vite 8 đều là major mới (peer/transitive có thể lệch) — ghim đúng bản đã kiểm ngày phát hành, `pnpm install` thật ở `/tmp` bắt lỗi peer; kiểm `immer`/`use-sync-external-store` tự cài không vượt ngưỡng 14 ngày. (4) Bảng 20 000 dòng chậm hơn 50 FPS — đo bằng probe chạy tay (OQ-067) trước khi kết luận; nếu dưới 50 FPS thì ghi số thật + đề xuất (giảm overscan, memo hàng) thay vì hạ ngưỡng. (5) Lỗi khai báo dependency lặp lại kiểu PR #9 — khai báo `@vcs/schemas` trước khi gate + gate trên bản sao `/tmp` cài thật (OQ-012).

**Ngoài phạm vi:** trang khác, React Router, `semantics.md`/ADR (P0.7), P0.8, Worker transport, sửa package khác (trừ root `package.json` + `tsconfig.json` + `pnpm-lock.yaml` + `.gitignore` + CI đã nêu, có lý do).

**E1 — Golden: luồng e2e trên `examples/hello-tags` (tính tay; nguồn: M0 §8.3, §9.2, §12.3; STATE §12 S1 + OQ-054; OQ-033/034/035/047/048/059/062).** Giả thiết: `stepMs = plcScanMs = 10`, seed 1, `timeScale = 1×`, server chạy `vcs serve examples/hello-tags --port 4170` (build web đã có), trình duyệt mở `http://127.0.0.1:4170/`. Snapshot `defs` (thứ tự khai báo): 0 `BTN_START` F, 1 `SW_AUTO` F, 2 `PT01` 0, 3 `LAMP_RUN` F, 4 `LAMP_AUTO` F, 5 `LAMP_HEARTBEAT` F, 6 `SCAN_CNT` 0, 7 `M_FLAG` F, 8 `M_CNT` 0, 9 `M_ALARM` F, 10 `DB1_VAL` 0, 11 `DB1_FLAG` F. `SCAN_CNT` = `stepCount` (tăng 1/bước từ 0); `LAMP_AUTO` = T từ bước 1 (`SW_AUTO` F, invert); blink đảo ở T=500, 1000, 1500, … (F→T→F→T…).

| # | Hành động (UI) | Giá trị tính tay / assert |
| --- | --- | --- |
| 1 | Mở trang, chờ `welcome` + snapshot | 12 hàng tag (≥ 10, §12.3 #1); badge "đã kết nối"; `simTime` `00:00.000`, `stepCount` 0, trạng thái IDLE; `BTN_START` FALSE, `SCAN_CNT` 0; panel diagnostics trống (hello-tags không có diagnostic) |
| 2 | Bấm Run, chờ wall 1,5 s (poll 100 ms) | `simTime` > 1000 ms, `stepCount` ≥ 100, `SCAN_CNT` ≥ 100; `LAMP_AUTO` TRUE (ổn định từ bước 1); `LAMP_HEARTBEAT` **đã thấy TRUE ít nhất một lần** trong cửa sổ (TRUE ở sim [500,1000) rồi FALSE ở [1000,1500) — không assert giá trị tại một thời điểm vì trễ wall/sim có thể lệch qua mốc 1500) |
| 3 | Bấm Pause; đọc `simTime` 2 lần cách 300 ms | Hai lần bằng nhau; `stepCount` bằng nhau; trạng thái PAUSED |
| 4 | Bấm Step (đang PAUSED) | `simTime` +10 ms **đúng**, `stepCount` +1, `SCAN_CNT` +1 (một bước tất định, không phụ thuộc wall clock) |
| 5 | Bấm Reset | Snapshot gửi lại (OQ-035): `simTime` 0, `stepCount` 0, `SCAN_CNT` 0, `BTN_START` FALSE, `LAMP_HEARTBEAT` FALSE, trạng thái IDLE |
| 6 | Bấm Run; chờ 300 ms; bật `BTN_START` (ô giá trị) | `tag.write {BTN_START: true}` → checkWrite ok → drain ở bước kế: `BTN_START` TRUE, loopback `LAMP_RUN` TRUE; chờ tối đa 2 s (poll + auto-retry của Playwright): `LAMP_RUN` TRUE, `BTN_START` TRUE (theo S1 dòng 5–6 đã sửa OQ-054: delta `[[0,true],[3,true],[6,20]]` ở wall 200) |
| 7 | Thử ghi `LAMP_RUN` = false (**chờ OQ-062**) | Server trả `error {code: 'TAG-E002'}` → UI hiện thông báo chứa `TAG-E002`; `LAMP_RUN` vẫn TRUE; `SCAN_CNT` tiếp tục tăng (sim vẫn RUNNING) |
| 8 | Chọn tốc độ `max`; chờ wall 1 s | `stepCount` tăng ≥ 500 trong 1 s wall (sim chạy hết ngân sách lát; hello-tags nhẹ nên thực tế hàng nghìn bước — ngưỡng 500 có biên lớn); `lagging` hiển thị đúng giá trị server gửi (không assert true/false vì phụ thuộc máy) |

Lưu ý khi viết test từ E1 (dễ nhầm): (a) **Không assert `LAMP_HEARTBEAT` tại một thời điểm** sau Run — chỉ assert "đã thấy TRUE trong cửa sổ poll" (dòng 2). (b) Dòng 6 phải Run **trước** khi bật `BTN_START`: sim IDLE thì `tag.write` áp dụng ngay qua `applyInbox` (D4) nhưng `LAMP_RUN` chỉ đổi khi có bước chạy (loopback scan trong `step()`); bật khi IDLE rồi mới Run cũng được nhưng tính tay phức tạp hơn — test dùng thứ tự Run → bật. (c) Step +10 ms chỉ đúng khi PAUSED (dòng 4); bấm Step khi RUNNING → server trả `WS-E002` (test E2 không bấm trường hợp này). (d) Mọi assert giá trị sim đều dùng `expect(locator).toHaveText()` có timeout (auto-retry), **không** `waitForTimeout` cố định rồi đọc một lần — trừ dòng 3 (Pause, đọc 2 lần cách nhau là chủ đích). (e) Các test chia sẻ một server (`workers: 1`): mỗi test Reset qua UI ở đầu test; E2 để lại sim ở IDLE sau Reset, E3/E4 bắt đầu từ đó.

**Kết quả triển khai (2026-11-24, nhánh `m0/p0.6-web`, CHƯA mở PR):**
- **OQ-062 ĐÃ QUYẾT (a) 2026-11-24, A19** — E4 đã làm: ô non-free hiển thị giá trị + nút "Ghi thử" (title "tag thuộc controller — server sẽ từ chối"); bấm gửi `tag.write` thật, server trả `TAG-E002` → UI hiện thông báo, giá trị không đổi. Không còn phần chặn nào.
- **Gate ĐÃ CHẠY (cả 2 nơi):** bản sao `/tmp/vcs-p06` (install thật `pnpm install --frozen-lockfile` exit 0) và bản sao chính (đồng bộ `node_modules` cả root lẫn từng package từ `/tmp`, theo bài học OQ-012): `lint` 0 lỗi 0 cảnh báo; `typecheck` sạch (root + web); `depcheck` "no dependency violations found" (82 modules, 134 dependencies ở `/tmp`; 86/148 ở bản chính — lệch do cruise cả `apps/*/dist/` + `test-results/`, không violation); `test` **438 passed / 35 file** (420 + 17 unit mới: format 6, store 5, i18n 2, ws-client 4); `test:e2e` **5 passed** (E1–E5, Chromium headless, ~11–13 s); `review:cheats` SẠCH (108 file); `docs:diagnostics --check` khớp (24 mã); `build` 3 task thành công (`apps/web/dist` có `index.html` + assets); smoke `vcs serve examples/hello-tags` → `GET /` trả `index.html`, `/api/health` `{"ok":true}`, asset 200. **Bench guard:** TagDB 4/4 PASS (set/get 45,4M ops/s bản chính / 44,6M `/tmp`; flush 0,14 µs; flush 1000 0,062 ms; heap −0,05 MB), orchestrator 513 310 bước/s bản chính / 494 731 `/tmp` — PASS.
- **Chromium chạy được trong VM:** `~/.cache/ms-playwright/` có `chromium-1254`, `chromium_headless_shell-1254`, `ffmpeg-1013`. Lưu ý môi trường: `/tmp` là tmpfs 512M — cài Chromium phải đặt `TMPDIR=/home/hatch/.cache/pw-tmp` (tải ~198 MiB qua proxy chậm 0,7–2,5 MiB/s; 2 lần lỗi trước khi đổi TMPDIR: download failure + timeout 280 s ở 60%). Giết server thừa theo PID (không `pkill -f` — pattern trùng dòng lệnh shell tự giết mình).
- **Lệch plan §13 (ghi lại, không phải sai spec):** (1) Plan nói root typecheck đã bao phủ `apps/*/src/**` — chỉ đúng với `.ts`; `.tsx` + lib DOM cần `apps/web/tsconfig.json` riêng + script `typecheck` nối 2 tsconfig. (2) Store giữ `WsDiagnostic` (kiểu suy ra từ zod `serverMessageSchema`) thay vì interface `Diagnostic` — `exactOptionalPropertyTypes` làm 2 kiểu không gán được (`file?: string | undefined` vs `file?: string`). (3) `App.tsx` cast `new WebSocket(url) as unknown as WsSocketLike` kèm comment `// boundary:` (kiểu handler DOM hẹp hơn `unknown`). (4) Test probe depcheck `web-deps` đã có sẵn trong `tests/tooling-gates.test.ts` (thêm ở commit plan) — không viết test mới.
- **Sửa test đỏ (nguyên nhân gốc, không sửa golden):** (a) E5 lần đầu đỏ: assert `toContainText('lagging:')` sai — nhãn thật là `Đang trễ (lagging): FALSE` (dấu `:` nằm sau `)`, không có chuỗi con `lagging:`); sửa assert thành `toContainText('lagging')` (kiểm đúng ý plan: hiển thị giá trị server gửi, không assert true/false) → E5 xanh. (b) `perf-scroll.spec.ts`: `ROOT` tính sai 1 cấp (`join(.., '..')` ra `apps/` thay vì gốc repo — `apps/web/e2e` cách gốc 3 cấp); sửa thành 3 `..` → probe chạy được. (c) **Kiểm chứng gate của parent (sau commit 2ba70f3):** `pnpm test` đỏ 1 test — `GET / → 404 JSON khi chưa có web build (OQ-044)` — vì `apps/web/dist/index.html` đã có sau `build` nên server phục vụ web thay vì trả 404. Test phụ thuộc vào trạng thái ambient của cây (thứ tự chạy: test trước build thì xanh). **Sửa:** `startServer` trong `ws.test.ts` nhận thêm `webDistDir` (dùng sẵn seam `CreateServerOptions.webDistDir` của server) và test OQ-044 trỏ vào thư mục tạm trống — kỳ vọng 404 không đổi, test không còn phụ thuộc dist. Sau sửa: test 438/438, e2e 5/5, gate đủ xanh (xem §4).
- **Kiểm cuộn 20 000 dòng (§12.4, chạy tay, không vào CI):** fixture sinh bằng `apps/web/e2e/fixtures/gen-big-project.ts` (20 000 tag, seed 1, 1 controller `builtin:demo`, không rule loopback; 120 001 dòng `tags.yaml`). Probe Playwright PASS 1 lần (≥ 50 FPS). Đo tay bằng script rAF độc lập (3 s, cuộn 600 px/16 ms): cuộn **45,7 / 48,0 / 60,0 FPS**, baseline không cuộn **53,3 / 60,3 FPS** — baseline tự nó đã gần ngưỡng, cuộn bám sát baseline (60,0 vs 60,3) → máy chia sẻ 1,5 CPU + Chromium headless là yếu tố giới hạn, chưa kết luận được app chậm. **KHÔNG hạ ngưỡng.** Đề xuất nếu đo lại trên máy yên mà cuộn vẫn thua baseline rõ: giảm `overscan` (hiện 10), memo hàng (`React.memo` + selector theo tag), rồi đo lại. Kết quả đo ghi ở đây, không đưa vào CI.
- **Dep đã kiểm lại trong lockfile:** `vite@8.3.8` xuất hiện là transitive của vitest 4.1.12 (đã có từ trước P0.6) — vite trực tiếp của web là 8.3.7; `immer`/`use-sync-external-store` chỉ là khai báo peer optional của zustand, pnpm KHÔNG cài — không vi phạm quy tắc ≥ 14 ngày.

## 14. Kế hoạch P0.7 — Tài liệu, ADR, hardening, kiểm Windows (plan-first, 2026-11-24)

**Điểm xuất phát:** P0.6 đã merge PR #13 (`471a2ec`, 2026-11-24 16:48 +07, CI 8/8 xanh — xem §1). Nhánh plan `m0/p0.7-docs` từ `d893736` (= nội dung `develop` sau merge P0.6). Hiện trạng: `docs/architecture.md` + `docs/semantics.md` **chưa có**; `docs/adr/` chỉ có `0000-template.md`; `README.md` còn ghi "M0 chưa bắt đầu" (lỗi thời); `docs/diagnostics.md` có 24 mã, `--check` khớp; `bench/results.json` local hiện tại: set/get 51 508 551 ops/s, flush 0,3 µs / 0,087 ms, heap −0,04 MB, orchestrator 426 480 bước/s (tất cả PASS, gitignored — không commit); job bench CI chỉ upload artifact, chưa so sánh hồi quy; `pnpm test` chưa chạy coverage (M0 §13 yêu cầu ngưỡng kernel/schemas ≥ 85%, project ≥ 80%).

**Hiểu biết (tóm tắt):** (1) P0.7 là prompt docs + hardening, không thêm tính năng: viết lại kiến thức đã làm ở P0.1–P0.6 thành tài liệu có thể đọc độc lập (`architecture.md`, `semantics.md` phần M0, 7 ADR, README), không phát minh kiến trúc mới. (2) 6 ADR theo đúng M0 §11 (0001–0006) + thêm 0007 main-guard hoãn từ P0.5 (OQ-071). (3) Gate của P0.7 là **đối chiếu từng mục M0 §15 (1–12)**: mục nào đã đạt từ P0.1–P0.6 thì ghi bằng chứng, mục nào chưa đạt thì liệt kê — không tự nhận đạt. (4) Windows không có local (VM không có Windows/.NET — T-001/S6 vẫn mở, thuộc chủ sản phẩm): bằng chứng Windows là CI `windows-latest` + test ghim hash chạy cả 2 nền tảng. (5) Bench baseline không phải `bench/results.json` (gitignored, D8) mà là `bench/baseline.json` được commit (OQ-073). (6) Hai chỗ spec ghi Node 20 (§13, §15.1) đã lỗi thời so với A16 — bằng chứng lấy theo A16, không sửa chữ spec trong P0.7 (OQ-072). (7) "Đường async" ở §15.5 là `stepOnceAsync` + `SIM-E002` đã có từ P0.4 (T6), không phải C1/`requiresAsync` của P0.8 — đã kiểm code, ghi rõ ở bảng §15 dưới.

**Phạm vi (M0 §11, §13, §15; PROMPTS P0.7; AMENDMENTS A16–A19, D8; OQ-071…073):** `docs/architecture.md`, `docs/semantics.md` (phần M0), 7 ADR, `docs/diagnostics.md` (chỉ regen + `--check`, không sửa tay), `README.md` (viết lại), kiểm `AGENTS.md` theo 9 điểm §11 (102 dòng ≤ 120 — chỉ sửa nếu thiếu), hardening: bật coverage theo §13 + test ghim hash (§15.6) + baseline bench + so sánh hồi quy > 20% ở job bench CI, chạy toàn bộ gate local + CI, kiểm Windows qua CI. **Không làm:** P0.8, P0.9 PWA, code mới ngoài 3 mục hardening trên + sửa lỗi gate tối thiểu nếu phát sinh (quy tắc: sửa tối thiểu, ghi lý do, không đổi hành vi, không hạ ngưỡng).

**Thiết kế nhỏ nhất:** Docs viết từ code + STATE §4 + AMENDMENTS, không viết từ trí nhớ: mỗi khẳng định trong `architecture.md`/`semantics.md` trỏ về file code hoặc test (vd: thứ tự bước → `orchestrator.ts` + golden T1–T8; quyền ghi tag → `checkWrite` + TAG-E002). `semantics.md` ghi nhãn từng điểm **VERIFIED** (có test) / **UNVERIFIED** (chưa có test trực tiếp — không bịa test). ADR theo đúng `0000-template.md` (mỗi file ≤ 1 trang: bối cảnh, lựa chọn, quyết định, hệ quả, chỉ báo sai). Coverage: bật `--coverage` ở job `test` (provider `@vitest/coverage-v8` — kiểm quy tắc ≥ 14 ngày ở triển khai; nếu bản hiện tại vi phạm thì ghim bản cũ đủ 14 ngày), ngưỡng `thresholds` theo §13 (kernel/schemas ≥ 85% dòng, project ≥ 80%); đo trước — nếu dưới ngưỡng thì bổ sung test tối thiểu, **không hạ ngưỡng**. Baseline bench: `bench/baseline.json` (5 số từ lần chạy P0.7, trung vị 5 mẫu) + `scripts/check-bench-regression.mjs` (đọc `results.json`, vượt > 20% → in `::warning::`, exit 0 — cảnh báo, không fail).

**Bảng đối chiếu M0 §15 (1–12) — kết quả kiểm ở plan (triển khai kiểm lại bằng lệnh + ghi số):**

| # | Tiêu chí §15 | Kết luận ở plan | Bằng chứng / việc P0.7 phải làm |
|---|---|---|---|
| 1 | Gate xanh Linux + Windows, Node 20 và 22 | **ĐẠT MỘT PHẦN** | CI check + test (ubuntu/windows) + e2e xanh qua PR #8–#13. **Node 20 không chạy theo A16** (OQ-072) — bằng chứng lấy theo A16 (Node 22). **Coverage §13 CHƯA có** (`pnpm test` không `--coverage`) → P0.7 bật coverage + ngưỡng. `pnpm install --frozen-lockfile` trong `~/workspace/vcs` **CHƯA CHẠY** (EPERM, OQ-007) — bằng chứng local qua bản sao `/tmp` + CI. |
| 2 | Web hello-tags: Run → simTime tăng; Pause/Step/Reset đúng (e2e xanh) | **ĐẠT** | P0.6: e2e E1–E5 xanh local (5/5) + job CI `e2e`. P0.7 chỉ chạy lại, không viết thêm. |
| 3 | `vcs validate` báo lỗi đúng dòng/cột cho ≥ 10 lỗi mẫu; exit 0/2/3 | **ĐẠT** (đếm lại ở triển khai) | yaml 21 + project/tags 50 + load 23 test (P0.2); CLI validate 5 `it`. P0.7 liệt kê đủ 10 mẫu (cú pháp YAML, sai schema, trùng tag, controller không tồn tại, khóa lạ + gợi ý, thiếu file, schemaVersion, stepMs=0, …) + chạy `vcs validate` trên fixture lỗi, assert dòng/cột + exit code. |
| 4 | TagDB: mọi quy tắc §6.2 có test; không cấp phát `get/set`; bench §12.4 | **ĐẠT** | TagDB 47 test (≥ 40) + property test chuỗi ghi/flush (P0.3); heap < 1 MB sau 10M thao tác; bench TagDB 4/4 PASS (51,5M ops/s; flush 0,3 µs / 0,087 ms). |
| 5 | Orchestrator: thứ tự bước đúng §6.7; snapshot/restore hash giống hệt; `isolate` không sập; đường async hoạt động; async trong `stepOnce()` → `SIM-E002` | **ĐẠT** | Golden T1–T8 + property test hash (P0.4); T6 async: `stepOnce()` gặp Promise → `SIM-E002`, `stepOnceAsync()` await giữ thứ tự pha, `resetAllAsync` (orchestrator.ts:161, test:431). **Ghi rõ:** C1 (`asyncStep?`/`requiresAsync()`/service tự chọn async) là P0.8, **không** thuộc §15.5 — §15.5 chỉ đòi đường async M0 đã có. |
| 6 | `vcs run examples/hello-tags --until 5s --hash` cùng hash trên Windows + Linux + qua lần chạy | **ĐẠT MỘT PHẦN** | Tất định qua lần chạy đã có test (CLI `run.test.ts`: `--until 5s` cho cùng hash qua 2 lần chạy; test này chạy cả trên CI Windows và Linux). **Giá trị hash chưa ghim** → P0.7 thêm 1 test ghim hash (giá trị lấy từ lần chạy local, CI Windows + Linux cùng assert một giá trị) mới chứng minh được "cùng hash trên Windows và Linux". |
| 7 | Lint chặn `Date.now/Math.random/...` ở package lõi (có test), không chặn allow-list | **ĐẠT** | Probe test trong `tests/tooling-gates.test.ts`: chặn `Date.now` ở kernel, `Math.random` ở schemas; không chặn ở `apps/*` (B10). |
| 8 | Đồ thị phụ thuộc bị ép; `apps/web` không kéo `kernel` | **ĐẠT** | Probe depcheck: chặn kernel import `@vcs/project` (`kernel-deps`), chặn web import `@vcs/kernel` (`web-deps`); depcheck xanh 87 module/148 dep (P0.6). |
| 9 | Mọi mã chẩn đoán đã đăng ký; `docs/diagnostics.md` sinh tự động và khớp | **ĐẠT** | 24 mã (PRJ 12 E + 2 W, SIM 3 E + 1 W, TAG 3, WS 3); `pnpm docs:diagnostics --check` khớp qua mọi PR. |
| 10 | Server: giao thức đúng schema, `tag.write` non-free bị từ chối, giới hạn kích thước/Origin, `timeScale max` không trễ quá ngưỡng | **ĐẠT** | WS 22 test (P0.5: hello/subscribe/run/pause/step/reset/timeScale/write ok + denied TAG-E002/lagging/64 KB→1009/Origin/9-conn). Drift: A18 — máy yên p95 6–7 ms ≤ 50 ms (§12.4); gate assert cap 150 ms (tripwire) + stepCount tăng. |
| 11 | Có `AGENTS.md`, `README.md`, 6 ADR, `architecture.md`, `semantics.md` (phần M0) | **CHƯA ĐẠT — PHẠM VI P0.7** | `AGENTS.md` ✓ (102 dòng ≤ 120; kiểm lại 9 điểm §11 ở triển khai). `README.md` cần viết lại (hiện ghi "M0 chưa bắt đầu"). 6 ADR + 0007, `architecture.md`, `semantics.md` chưa có. |
| 12 | Không `any` ngoài ranh giới I/O đã validate; mọi lỗi nêu mã + vị trí/đối tượng + hướng sửa | **ĐẠT** (spot-check ở triển khai) | `grep ': any\|as any'` ở `packages/` + `apps/` (không test) = 0 kết quả (kiểm 2026-11-24). Lỗi qua `Diagnostic` + `DiagnosticCatalog` (mỗi mã có gợi ý sửa trong `docs/diagnostics.md`). |

**Mục chưa đạt cuối plan (3 mục):** §15.1 (coverage chưa bật + ghi chú Node 20 theo A16), §15.6 (chưa ghim giá trị hash), §15.11 (docs + ADR — phạm vi P0.7). Không mục nào thuộc P0.8/P0.9. G0 nghiệm thu M0 chỉ làm sau khi cả 3 mục này xanh + CI PR P0.7 xanh.

**Ví dụ tính tay — bảng kiểm §15: mục nào tự kiểm được local, mục nào chỉ CI Windows chứng minh được (P0.7 là docs nên "tính tay" = bảng kiểm này):**

| Nhóm | Kiểm local được (VM Linux) | Chỉ CI Windows chứng minh được |
|---|---|---|
| §15.2, 3, 4, 5, 7, 8, 9, 10, 11, 12 | Có — chạy `lint && typecheck && depcheck && test && test:e2e && review:cheats && docs:diagnostics --check && build && bench` + đọc docs/ADR + đếm test/mã | Không cần |
| §15.1 (phần Windows) | Không — VM không có Windows/.NET | Có — job `test` windows-latest xanh |
| §15.6 (hash Win == Linux) | Không — chỉ chạy được một nền tảng | Có — test ghim hash phải xanh cả 2 job `test` (ubuntu + windows) |
| `pnpm install --frozen-lockfile` trong `~/workspace/vcs` | **CHƯA CHẠY** (EPERM, OQ-007) — bằng chứng thay thế: bản sao `/tmp` (exit 0) + CI install xanh | CI install xanh cả 2 OS |

**Mơ hồ (phân loại):** **Tier A (tự quyết):** cấu trúc `architecture.md` (sơ đồ pha + luồng dữ liệu + đồ thị phụ thuộc + hướng dẫn thêm package/extension/lệnh CLI, theo §11); thứ tự viết ADR 0001→0007; tên file ADR (`0001-package-jit-monorepo.md` … `0007-main-guard-tsup.md`); bố cục README (Cài đặt / Chạy hello-tags / Bảo mật cục bộ / Tài liệu). **Tier B (mặc định + ghi OQ):** OQ-071 (7 ADR thay vì đúng 6), OQ-072 (bằng chứng §15.1 theo A16, không sửa chữ spec), OQ-073 (`bench/baseline.json` + script so sánh, warning không fail). **Tier C: không có mục chặn dự kiến** — nếu §15 mục nào đỏ ở triển khai (coverage dưới ngưỡng, hash ghim lệch Win/Linux, bench vượt 20%) thì dừng mục đó, ghi OWNER-INBOX + OQ, **không hạ ngưỡng, không sửa kỳ vọng**; quy tắc này là mặc định của plan, không cần hỏi trước.

**File (mới/sửa):**

| File | Nội dung |
|---|---|
| `docs/architecture.md` | Mới: sơ đồ pha + luồng dữ liệu `plant → TagDB → IoBus → controller → TagDB → plant`, hooks, snapshot; đồ thị phụ thuộc (§3.5); hướng dẫn thêm package/extension/lệnh CLI |
| `docs/semantics.md` | Mới (phần M0): 7 điểm §11 (thời gian ms nguyên; thứ tự bước; plant trước controller; trễ 1 bước; thông báo theo lô; `flush` chỉ phát khi khác; quyền sở hữu tag) + điểm đã quyết OQ-014/015/022/026/030/054/055; mỗi điểm nhãn VERIFIED/UNVERIFIED |
| `docs/adr/0001-package-jit-monorepo.md` | ADR 0001 (§11): package JIT (`exports` → `src/index.ts`) + monorepo pnpm + Turborepo — nguồn: P0.1, A14/A15 |
| `docs/adr/0002-simulation-runs-in-server.md` | ADR 0002 (§11): mô phỏng chạy trong server Node, UI qua WS; Worker là tùy chọn sau — nguồn: A10/E6, D-004 |
| `docs/adr/0003-integer-ms-time-pacer.md` | ADR 0003 (§11): thời gian nguyên ms + Pacer tách biệt (không `SimClock.setTimeScale`) — nguồn: A5, OQ-022, §16 |
| `docs/adr/0004-tagdb-handle-batch-notify.md` | ADR 0004 (§11): TagDB theo handle + thông báo theo lô tại `flush()` — nguồn: P0.3 (OQ-014/015/018), A17 (flush duyệt dirty list) |
| `docs/adr/0005-simcomponent-phases-extension.md` | ADR 0005 (§11): SimComponent/phases/extension + `throw`/`isolate` — nguồn: P0.4 (OQ-030 interface cấu trúc, hooks) |
| `docs/adr/0006-diagnostic-catalog.md` | ADR 0006 (§11): Diagnostic + catalog mã, `docs/diagnostics.md` sinh tự động — nguồn: P0.2 (D6), 24 mã |
| `docs/adr/0007-main-guard-tsup-split.md` | ADR 0007 (OQ-071): tách `main()` ra `main.ts`, `index.ts` export-only; tsup `external: ['yaml']` (+ fastify/* ở CLI) — nguồn: P0.5, STATE §4 (hoãn từ P0.5) |
| `README.md` | Viết lại: cài đặt (`pnpm install --frozen-lockfile`), chạy `pnpm vcs serve examples/hello-tags` (mở `http://127.0.0.1:4170`), cảnh báo bảo mật cục bộ (bind 127.0.0.1, không auth, kiểm Origin); bỏ dòng "M0 chưa bắt đầu" |
| `AGENTS.md` | Chỉ sửa nếu kiểm 9 điểm §11 thấy thiếu (hiện 102 dòng ≤ 120) — không viết lại toàn bộ |
| `docs/diagnostics.md` | Chỉ regen (`pnpm docs:diagnostics`) + `--check` — không sửa tay (D8) |
| `bench/baseline.json` | Mới: 5 số baseline từ lần chạy bench P0.7 (trung vị 5 mẫu) — nguồn cho so sánh hồi quy (OQ-073) |
| `scripts/check-bench-regression.mjs` | Mới: so `bench/results.json` với `bench/baseline.json`, vượt > 20% → `::warning::`, exit 0 |
| `.github/workflows/ci.yml` | Job `bench`: thêm bước so sánh hồi quy sau `pnpm bench`. Job `test`: thêm coverage (`--coverage` + ngưỡng §13) |
| `package.json` (+ `pnpm-lock.yaml`) | devDep `@vitest/coverage-v8` nếu cần (kiểm quy tắc ≥ 14 ngày ở triển khai); script coverage nếu cần — không thêm dependency khác |
| `vitest.workspace.ts` / config coverage | Ngưỡng coverage §13 (kernel/schemas ≥ 85% dòng, project ≥ 80%) — file config cụ thể xác định ở triển khai |
| `apps/cli/src/commands/run.test.ts` | +1 test ghim hash `vcs run examples/hello-tags --until 5s --hash` (§15.6; giá trị lấy từ lần chạy local ở triển khai) |
| `docs/STATE.md`, `docs/open-questions.md` | Plan này (§14) + OQ-071…OQ-073 |

**Test (P0.7 — hardening, không test tính năng mới):** +1 test ghim hash (§15.6); coverage: bật + đo, bổ sung test tối thiểu nếu dưới ngưỡng §13 (không hạ ngưỡng); bench: chạy lại 5 mẫu lấy trung vị làm baseline + kiểm script hồi quy (giả lập results.json vượt 20% → warning xuất hiện, exit 0). Tổng test sau P0.7: ≥ 439 (438 + 1 ghim hash; + thêm nếu coverage đòi). **Gate P0.7:** `lint && typecheck && depcheck && test && test:e2e && review:cheats && docs:diagnostics --check` + `build` + `bench` + bảng §15 đủ 12 mục có bằng chứng + CI (check + test ubuntu/windows + e2e ubuntu + bench manual/nightly) xanh.

**Rủi ro + cách kiểm:** (1) Coverage dưới ngưỡng §13 (chưa từng đo) — đo trước bằng `--coverage`; nếu dưới ngưỡng thì liệt kê file thiếu, bổ sung test tối thiểu; không hạ ngưỡng, không đổi config để né file. (2) Hash ghim lệch giữa Windows và Linux — nếu CI Windows đỏ test ghim hash trong khi Linux xanh thì đó là phát hiện khác biệt nền tảng thật (nghi đầu tiên: `hashText`/EOL/đường dẫn trong hash); điều tra nguyên nhân gốc, không đổi kỳ vọng. (3) Baseline bench trên VM chia sẻ dao động > 20% giữa các lần chạy → cảnh báo giả — lấy trung vị 5 mẫu làm baseline, so sánh theo trung vị; ghi rõ độ dao động trong STATE. (4) ADR 0007 vượt số lượng "6 ADR" của §11/§15.11 — đã ghi OQ-071 (7 ⊇ 6, không vi phạm chữ "có 6 ADR").

**Ngoài phạm vi:** P0.8 (`applyInbox`, `validateTagValue`, `files.comms`/`files.hmi`, `comms.status`/`comms.log`, `asyncStep`/`requiresAsync`, `sym:`), P0.9 PWA, sửa package khác ngoài danh sách trên, sửa chữ spec (§13/§15.1 — xem OQ-072), đóng T-001/S6 (máy Windows thật thuộc chủ sản phẩm), G0 (gói nghiệm thu M0 — làm sau P0.7).

## Kết quả triển khai P0.7 (2026-11-24, xong local — CHƯA mở PR)

**Đã làm:** `docs/architecture.md` + `docs/semantics.md` (phần M0, nhãn
VERIFIED/UNVERIFIED) + 7 ADR (0001–0007) + `README.md` viết lại +
`docs/diagnostics.md` regen (24 mã, `--check` khớp) + coverage bật
(`@vitest/coverage-v8@4.1.12`, 2026-10-15, thỏa ≥ 14 ngày; ngưỡng dòng theo
glob §13) + 1 test ghim hash §15.6 + `bench/baseline.json` (trung vị 5 mẫu) +
`scripts/check-bench-regression.mjs` + job bench CI gọi script. `AGENTS.md`
**không sửa** (102 dòng ≤ 120, đủ 9 điểm §11 — kiểm lại ở dưới).

**Gate ĐÃ CHẠY (bản chính, sau khi đồng bộ `node_modules` từ `/tmp/vcs-p07`
install thật, theo OQ-012):** lint 0 lỗi; typecheck sạch (root + web);
depcheck "✔ no dependency violations found (87 modules, 148 dependencies)";
test **439 passed / 35 file** (kèm coverage, không lỗi ngưỡng);
test:e2e **5 passed** (14,0 s); review:cheats SẠCH (109 file);
`docs:diagnostics --check` khớp (24 mã); build 3/3 (turbo, 0 cached lần đầu,
3,29 s lần sau); bench TagDB 4/4 PASS (set/get 51 658 338 ops/s ≥ 10M; flush
5000/0 đổi 0,3 µs ≤ 50; flush 1000 đổi + 1 sub 0,084 ms ≤ 1; heap −0,05 MB
< 1), orchestrator **508 058 bước/s** PASS (≥ 100 000). Bản `/tmp`: test
439/439 + e2e 5/5, bench 5 lần lấy trung vị (xem baseline).

**Coverage dòng (§13, đo bằng `--coverage`, provider v8):** kernel **97,66%**
(627/642, ngưỡng ≥ 85%), schemas **95,92%** (329/343, ≥ 85%), project
**97,83%** (90/92, ≥ 80%) — cả 3 PASS với biên lớn, **không cần bổ sung
test**. Toàn repo 91,36% dòng. (apps/cli 78,12%, apps/web 76,16% — không có
ngưỡng §13, chỉ đo.)

**Hash ghim (§15.6):** `vcs run examples/hello-tags --until 5s --hash` chạy
trực tiếp 2 lần đều cho `21096ab25e36d6e3a31850ceccea482a3f58fffedcd67da625eb2cff7e8b1d53`
— test ghim đúng giá trị này (`run.test.ts`), chạy trong suite 439.
Bằng chứng "cùng hash trên Windows và Linux" chỉ có khi CI job `test`
windows-latest xanh (CHƯA CHẠY — chờ PR).

**Sửa test đỏ (nguyên nhân gốc, không sửa kỳ vọng):** bật `--coverage` làm
test heap TagDB (10M set/get) timeout 5 s — v8 chèn bộ đếm vào mọi hàm nên
vòng lặp chạy chậm hơn nhiều (chi phí đo, không phải hành vi đổi). Sửa:
timeout riêng 60 s cho test đó (`tags.test.ts`), khẳng định heap < 1 MB
không đổi → xanh. Không sửa golden/ngưỡng.

**Bench baseline (5 lần `pnpm bench`, trung vị):** set/get 45 354 782 ops/s
(phạm vi 5 lần: 36,9M–52,2M); flush 0 đổi 0,15 µs (0,14–0,27); flush 1000
đổi 0,063 ms (0,061–0,105); heap −0,04 MB; orchestrator 411 614 bước/s
(337 259–488 762). Độ dao động lớn trên VM chia sẻ — đúng như rủi ro (3) ở
plan. **Phát hiện:** script hồi quy (theo đúng quy tắc plan: > 20% → warning)
cảnh báo cả trên dữ liệu dùng làm baseline (lần chạy 5/5: flushNoChangeUs
+73%, flushChangesMs +67%; lần chạy ở bản chính: +100% / +33%) — vì các số
flush ở thang sub-µs, chênh tuyệt đối chỉ 0,11 µs / 0,021 ms trong khi ngưỡng
spec là 50 µs / 1 ms. Script **không fail** (exit 0, đúng thiết kế); cảnh báo
flush là nhiễu đo, không phải hồi quy thật. Đề xuất cho sau này (không làm ở
P0.7): thêm ngưỡng tuyệt đối (chỉ cảnh báo khi giá trị cũng gần ngưỡng spec).
Kiểm script: giả lập results.json giảm 27–34% (orchestrator 300 000,
set/get 30 000 000) → 4 `::warning::`, exit 0; thiếu baseline → warning bỏ
qua, exit 0.

**Sửa so với plan §14 (ghi lại):** (1) TagDB có **42** test (đếm `it(` trong
`tags.test.ts`), không phải 47 như plan ghi — vẫn ≥ 40 theo §12.1. (2) Ngưỡng
coverage cấu hình **theo glob** trong `vitest.config.ts` (Vitest 4 hỗ trợ
ngưỡng theo glob — đã kiểm code provider `resolveThresholds`), không cần
script kiểm riêng. (3) `coverage/` đã có trong `.gitignore` từ trước (dòng
5) — không cần thêm.

**Bảng đối chiếu M0 §15 (kiểm lại ở triển khai):**

| # | Tiêu chí §15 | Kết luận | Bằng chứng |
|---|---|---|---|
| 1 | Gate xanh Linux + Windows, Node 20 và 22 | **ĐẠT MỘT PHẦN** | Local Linux xanh đủ gate (kèm coverage). Node 20 không chạy theo **A16** (OQ-072) — bằng chứng lấy theo A16 (Node 22). `pnpm install --frozen-lockfile` trong `~/workspace/vcs` **CHƯA CHẠY** (EPERM, OQ-007); bằng chứng thay thế: `/tmp/vcs-p07` install exit 0 + CI. Windows: chỉ CI job `test` windows-latest chứng minh được (chờ PR). |
| 2 | Web hello-tags: Run → simTime tăng; Pause/Step/Reset đúng (e2e xanh) | **ĐẠT** | e2e E1–E5 xanh local 5/5 (14,0 s) + job CI `e2e`. |
| 3 | `vcs validate` báo lỗi đúng dòng/cột cho ≥ 10 lỗi mẫu; exit 0/2/3 | **ĐẠT** | Chuỗi kiểm tra lỗi: yaml 21 + project 15 + tags 16 + load 13 test; mẫu có dòng/cột: tab indent, khóa trùng, flow mapping không đóng, khóa bắt buộc thiếu, nhiều lỗi sắp theo vị trí, `locate()` tags[0].kind, BOM+CRLF, văn bản rỗng, vendor sai dòng, trùng tag không phân biệt hoa/thường (PRJ-E004), stepMs=0 (PRJ-E007), khóa lạ + lỗi type, chỉ comment. Kiểm tay: `vcs validate` trên fixture lỗi → `vcs.project.yaml:5:23 error PRJ-E007`, `11:1 warning PRJ-W001`, exit 2. CLI validate 5 test (exit 0/2/3). |
| 4 | TagDB: mọi quy tắc §6.2 có test; không cấp phát `get/set`; bench §12.4 | **ĐẠT** | TagDB **42** test (≥ 40); property test chuỗi ghi/flush; heap < 1 MB sau 10M ops (test, timeout 60 s khi đo coverage); bench TagDB 4/4 PASS. |
| 5 | Orchestrator: thứ tự bước đúng §6.7; snapshot/restore hash giống hệt; `isolate` không sập; đường async hoạt động; async trong `stepOnce()` → `SIM-E002` | **ĐẠT** | Golden T1–T8 + property test hash; T6 async (`stepOnce()` → SIM-E002, `stepOnceAsync()` await giữ thứ tự pha, `resetAllAsync`). C1 (`asyncStep?`/`requiresAsync()`) là P0.8, không thuộc §15.5. |
| 6 | `vcs run examples/hello-tags --until 5s --hash` cùng hash trên Windows + Linux + qua lần chạy | **ĐẠT MỘT PHẦN** | Tất định qua lần chạy: test cũ (2 lần chạy cùng hash) + **test ghim mới** giá trị `21096ab2…1d53` (đã chạy kiểm chứng local 2 lần). "Cùng hash trên Windows và Linux": chỉ CI job `test` windows-latest xanh mới chứng minh được (chờ PR). |
| 7 | Lint chặn `Date.now/Math.random/...` ở package lõi (có test), không chặn allow-list | **ĐẠT** | Probe test `tests/tooling-gates.test.ts` (10 test): chặn `Date.now` ở kernel, `Math.random` ở schemas; không chặn ở `apps/*` (B10). |
| 8 | Đồ thị phụ thuộc bị ép; `apps/web` không kéo `kernel` | **ĐẠT** | Probe depcheck (`kernel-deps`, `web-deps`); depcheck xanh 87 module/148 dep. |
| 9 | Mọi mã chẩn đoán đã đăng ký; `docs/diagnostics.md` sinh tự động và khớp | **ĐẠT** | 24 mã (PRJ 12 E + 2 W, SIM 3 E + 1 W, TAG 3, WS 3); regen + `--check` khớp. |
| 10 | Server: giao thức đúng schema, `tag.write` non-free bị từ chối, giới hạn kích thước/Origin, `timeScale max` không trễ quá ngưỡng | **ĐẠT** | WS 23 test (hello/subscribe/run/pause/step/reset/timeScale/write ok + denied TAG-E002/lagging/64 KB→1009/Origin/9-conn). Drift: A18 — máy yên p95 6–7 ms ≤ 50 ms; gate assert cap 150 ms + stepCount tăng. |
| 11 | Có `AGENTS.md`, `README.md`, 6 ADR, `architecture.md`, `semantics.md` (phần M0) | **ĐẠT** | `AGENTS.md` 102 dòng ≤ 120, đủ 9 điểm §11 (kiểm lại từng điểm ở triển khai — không sửa). `README.md` viết lại. **7 ADR** (0001–0006 theo §11 + 0007 main-guard, OQ-071). `architecture.md` + `semantics.md` mới. |
| 12 | Không `any` ngoài ranh giới I/O đã validate; mọi lỗi nêu mã + vị trí/đối tượng + hướng sửa | **ĐẠT** | `grep ': any\|as any'` ở `packages/` + `apps/` (không tính test) = 0 kết quả. Lỗi qua `Diagnostic` + catalog (mỗi mã có gợi ý sửa trong `docs/diagnostics.md`). |

**Kết luận §15:** 10/12 ĐẠT, 2 ĐẠT MỘT PHẦN (§15.1, §15.6) — phần còn lại
của 2 mục này chỉ CI Windows chứng minh được (test ghim hash + job `test`
windows-latest). Không mục nào đỏ ở triển khai. G0 nghiệm thu M0 làm sau khi
PR P0.7 merge + CI xanh.

**OQ-071…073 đóng ở P0.7** (tier B, đã áp dụng): OQ-071 — viết 7 ADR;
OQ-072 — bằng chứng §15.1 theo A16, không sửa chữ spec; OQ-073 —
`bench/baseline.json` + script so sánh, warning không fail.

## 15. Kế hoạch P0.8 — Vá trước giao diện M4/M5: applyInbox, validateTagValue, files.comms/hmi, protocol additive, asyncStep/requiresAsync, sym: (plan-first, 2026-11-24)

**Điểm xuất phát:** M0 đã ký 2026-11-24 (G0 PR #15 `b7e764e`, 12/12 §15 ĐẠT; Windows 439/439 sau fix OQ-074 PR #16 `cda44d3`; D-001/D-004 đã quyết; `main` đã có M0 ở `31c7200`; develop head `17790f1` sau PR #17). Nhánh plan `m0/p0.8-interfaces` từ `9ca4964` (= nội dung develop sau merge PR #17). Tổng test hiện tại **439/439** (35 file); CI 8 successful + 2 skipped. PROMPTS P0.8: "áp TRƯỚC các điều chỉnh giao diện rẻ... Mỗi thứ có test; KHÔNG thêm chức năng ngoài danh sách. Gate: toàn bộ test M0 vẫn xanh + test mới; không đổi hành vi hiện có."

**Phát hiện quan trọng khi đọc code (2/7 mục đã có sẵn — KHÔNG code lại):**
- `orchestrator.applyInbox()` **đã có** (`packages/kernel/src/orchestrator.ts:146`, từ P0.4 theo D4): drain inbox tại `clock.nowMs()`; `SimulationService` gọi nó khi PAUSED/IDLE rồi `tags.flush()` (`apps/server/src/sim-service.ts:392-393`); test đã có (`orchestrator.test.ts:585`). P0.8 chỉ chạy lại test hiện có, không sửa hàm này.
- Địa chỉ `sym:` **đã chấp nhận ở schema** (`isValidAddressLight`, `packages/schemas/src/tags.ts:20`, C2 từ P0.2; test `tags.test.ts:29-35`: `sym:Motor.Start`, `sym:DB1.MyVar` hợp lệ, `sym:` rỗng không hợp lệ). `TagAddressMap` hiểu `sym:` (phân giải symbolic → offset) là P1.4/P5.7, không phải P0.8. P0.8 chỉ thêm test mức `loadProject` (xem dưới).

**Hiểu biết (tóm tắt):** (1) P0.8 là "vá giao diện", không phải tính năng: 7 mục, 2 đã có sẵn, 5 cần code mới — tất cả đều **cộng thêm** (trường optional, hàm export mới, key schema có default, message mới trong union) và **không đổi hành vi** của bất kỳ đường chạy hiện có nào. (2) Server **không phát** message mới nào ở P0.8; web không đổi; `SimulationService` không đổi hành vi — validate trước khi ghi là P4.1 (broker), chuyển sang `stepOnceAsync` theo cờ là P5.1, đặt `locked = true` là P4.1/P5.1. (3) Hai hình dạng chưa được spec ghim (`TagValueError`, envelope `comms.*`) → đề xuất mặc định + OQ tier B (OQ-075/076/077), không hỏi trước. (4) Không dependency mới, không mã diagnostic mới, không đổi `.dependency-cruiser.cjs` (không thêm package, không thêm hướng import mới), không ADR mới (quyết định đã có ở AMENDMENTS B/C). (5) `PROTOCOL_VERSION` giữ 1 — test hiện có assert (`protocol.test.ts:5-7`). (6) `pnpm install` trong VM vẫn EPERM (OQ-007) — triển khai làm ở bản sao `/tmp` như các prompt trước; vì không có dependency mới nên `pnpm-lock.yaml` phải **không đổi** (diff lockfile xuất hiện là cờ đỏ, dừng kiểm tra).

**Phạm vi (PROMPTS P0.8; AMENDMENTS B2, B3, B4-schema, B5, C1, C2; M4 §2–§5, §10.1; M5 §2 hàng 1–2, 5):**

| File | Nội dung |
|---|---|
| `packages/kernel/src/tags.ts` | `validateTagValue(type, v)` + `TagValueError` (OQ-075); refactor `validateValue` nội bộ dùng nó (giữ nguyên thông điệp `TAG-E001`) |
| `packages/kernel/src/index.ts` | Export `validateTagValue` + `TagValueError` |
| `packages/kernel/src/component.ts` | `ControllerAdapter.asyncStep?: boolean` (C1) |
| `packages/kernel/src/orchestrator.ts` | `requiresAsync(): boolean` (C1) |
| `packages/schemas/src/project.ts` | `files.comms` (default `'comms/comms.yaml'`), `files.hmi` (default `'hmi/'`) + `PROJECT_SHAPE` |
| `packages/schemas/src/protocol.ts` | `sim.state.locked?` + schema `comms.status`/`comms.log` + thêm vào `serverMessageSchema` (OQ-076/077) |
| `packages/kernel/src/tags.test.ts` | Test `validateTagValue` (bảng tính tay dưới) + tương đương với `TagDB.write` |
| `packages/kernel/src/orchestrator.test.ts` | Test `requiresAsync` + `stepOnce`/`stepOnceAsync` với adapter async |
| `packages/schemas/src/project.test.ts` | Test `files` defaults/explicit + không `PRJ-W001` |
| `packages/schemas/src/protocol.test.ts` | Test message mới + `locked` optional + `PROTOCOL_VERSION` 1 |
| `packages/project/src/load.test.ts` | Test load project có địa chỉ `sym:` + hash hello-tags không đổi |
| `docs/semantics.md` | Thêm mục §11 ngắn: `validateTagValue` TYPE/RANGE + `requiresAsync` + `locked?` chưa phát (nhãn VERIFIED) |
| `docs/STATE.md`, `docs/open-questions.md` | Plan này (§15) + OQ-075…081 |

**Thiết kế nhỏ nhất (từng mục — signature chính xác, file chạm tới, chỗ KHÔNG làm):**

1. **`orchestrator.applyInbox()` (B2) — ĐÃ CÓ, không code.** Chỉ chạy lại test hiện có (`orchestrator.test.ts:585`). Lưu ý đã kiểm: định nghĩa M4 §2 hàng 2 nói "chạy lệnh chờ rồi `tags.flush()`" — code hiện tại chỉ drain, service tự `flush()` sau (`sim-service.ts:393`); **giữ nguyên cách tách này**, không gộp `flush()` vào `applyInbox()` (đổi hành vi + test hiện có). Chốt "cấm gọi trong bước" chưa có → OQ-079 (để P4.1).
2. **`validateTagValue` (B3, M4 §3 hàng 3 + §4.2) — hàm mới ở kernel, không đổi hành vi ghi.** Đặt trong `packages/kernel/src/tags.ts` (cạnh `TYPE_RANGES` + `validateValue` nội bộ đã có), export từ `@vcs/kernel`:
```ts
export interface TagValueError { kind: 'TYPE' | 'RANGE'; message: string }
export function validateTagValue(type: DataType, v: TagValue): TagValueError | undefined
```
Quy tắc tách (OQ-075): TYPE = sai kiểu JS (Bool cần boolean, String cần string, kiểu số cần number); RANGE = number ngoài khoảng kiểu hoặc không nguyên với kiểu nguyên; Real/LReal chấp nhận mọi số kể cả NaN/±Infinity; Time: số nguyên ≥ 0. `validateValue` nội bộ refactor thành `const e = validateTagValue(type, v, ...); if (e) throw new TagError('TAG-E001', message)` — **thông điệp lỗi giữ nguyên văn bản hiện tại** (`${where}: giá trị ... không hợp lệ cho kiểu '...'`), nên mọi test `TAG-E001` cũ vẫn xanh. `validateTagValue` **không normalize** (fround `Real`, `>>> 0` cho DWord/UDInt vẫn chỉ trong `TagDB.write` — test ghim ranh giới này, xem dưới). Đường nóng: trả `undefined` khi hợp lệ → **không cấp phát** ở đường thành công; chỉ cấp phát object lỗi ở đường lỗi (giống `validateValue` hiện tại chỉ throw khi lỗi). `SimulationService.tagWrite` **không** dùng hàm mới ở P0.8 (validate trước ghi + trả `TAG-E001` đồng bộ là việc của broker P4.1; hành vi hiện tại — lỗi kiểu/khoảng phát thành diagnostic `SIM-E001` trong drain theo OQ-021 — giữ nguyên).
3. **`files.comms` / `files.hmi` (B5, M4 §2 hàng 5) — chỉ schema + default, loader không đổi.** `projectSchema.files` thêm `comms: z.string().default('comms/comms.yaml')`, `hmi: z.string().default('hmi/')`; `PROJECT_SHAPE.files.keys` thêm `'comms', 'hmi'` (không thêm thì `files.comms` bị `PRJ-W001` khóa lạ). `loadProject` **không đọc** hai file này ở P0.8 (chỉ đọc `files.tags` — `load.ts:91`); hash project chỉ gồm file đã đọc nên hash hello-tags **không đổi** (test ghim, xem dưới). Nạp file `comms.yaml`/`hmi/` là P4.1.
4. **Protocol additive (B4, M4 §2 hàng 4 + §5.3/§5.4/§10.1) — chỉ schema, không phát message.** `PROTOCOL_VERSION` giữ 1. `simStateSchema` thêm `locked: z.boolean().optional()` (`exactOptionalPropertyTypes`: service `simState()` **không** đặt trường này ở P0.8 → không xuất hiện trên dây, hành vi cũ giữ nguyên). Hai schema mới vào `serverMessageSchema` (discriminated union theo `type`, cộng thêm — message cũ parse như cũ):
```ts
// M4 §5.3 GatewayStats, nguyên văn:
const gatewayStatsSchema = z.object({
  state: z.enum(['stopped', 'starting', 'running', 'error']),
  startedAtWallMs: z.number().int().optional(),
  lastError: z.string().optional(),
  clients: z.number().int().min(0), reads: z.number().int().min(0),
  writes: z.number().int().min(0), errors: z.number().int().min(0),
  monitoredItems: z.number().int().min(0).optional(),
  subscriptions: z.number().int().min(0).optional(),
});
const commsStatusSchema = z.object({ type: z.literal('comms.status'),
  gateways: z.array(z.object({ id: z.string(),
    kind: z.enum(['opcua-server', 'modbus-server']),
    stats: gatewayStatsSchema, endpoints: z.array(z.string()) })) });
// M4 §5.4 RingLog entry, nguyên văn (level xem OQ-077):
const commsLogEntrySchema = z.object({ tWallMs: z.number().int(),
  gateway: z.string(), level: z.string(),
  kind: z.enum(['session', 'request', 'write', 'error', 'info']),
  summary: z.string(), detail: z.string().optional() });
const commsLogSchema = z.object({ type: z.literal('comms.log'),
  entries: z.array(commsLogEntrySchema) });
```
(OQ-076: envelope này do M4 không ghim; danh sách adapter ngoài chưa đưa vào `comms.status` — thêm ở P4.1; kind `'s7-server'` là M5/C7, không có ở P0.8.) Server **không gửi** `comms.*` ở P0.8 (chưa có `GatewayManager`/`RingLog` — P4.1/P4.6); web **không đổi** (không xử lý message mới; union thêm variant không phá parse message cũ).
5. **`ControllerAdapter.asyncStep?` + `orchestrator.requiresAsync()` (C1, M5 §2 hàng 1) — cờ + hàm hỏi, không đổi đường chạy.** `component.ts`: `readonly asyncStep?: boolean` trên `ControllerAdapter` (vắng = `false`, đồng bộ). `orchestrator.ts`:
```ts
/** true khi và chỉ khi có ≥ 1 component đã đăng ký là ControllerAdapter với asyncStep === true (OQ-078). */
requiresAsync(): boolean {
  for (const { component } of this.#byId.values()) {
    if ('asyncStep' in component && (component as ControllerAdapter).asyncStep === true) return true;
  }
  return false;
}
```
`LoopbackController`/`FakeController` **không** đặt cờ (đồng bộ như cũ). `stepOnce()` gặp component trả Promise vẫn ném `SIM-E002` như M0 — kể cả khi `requiresAsync()` là true cho adapter khác (caller phải tự chọn `stepOnceAsync`; xem bảng dưới). `SimulationService`/CLI/M3 chuyển sang `stepOnceAsync` theo cờ là **P5.1, không làm ở P0.8**.
6. **Địa chỉ `sym:` (C2, M5 §2 hàng 2) — ĐÃ CÓ ở schema, chỉ thêm test mức load.** `isValidAddressLight` đã chấp nhận `sym:<đường dẫn>` (bất kỳ chuỗi nào sau `sym:`, dài > 4). P0.8 không sửa regex, không sửa `TagDB` (constructor không kiểm địa chỉ — chỉ kiểm `initial`), không sửa `IoBus` (làm việc theo handle/tên, không theo địa chỉ). Test load-level chứng minh project có `sym:` nạp được end-to-end (xem Test).

**Đã loại:** (1) `validateTagValue` đặt ở `@vcs/schemas` — B3 ghi rõ kernel export; schemas đã có `initialMatchesType` cho PRJ-E014, thêm hàm thứ hai vào schemas sẽ nhân bản logic validate sang package thứ ba. (2) Hợp nhất hai bảng `TYPE_RANGES` (kernel vs schemas) — đổi vị trí nguồn sự thật của khoảng kiểu, ngoài phạm vi "chỉ thêm giao diện" (OQ-081; test chéo hai bảng để bắt lệch). (3) Service dùng `validateTagValue` trong `tagWrite` ngay — P4.1 broker (đổi hành vi trả lỗi: `TAG-E001` đồng bộ thay vì `SIM-E001` trong drain). (4) Service/CLI chuyển sang `stepOnceAsync` khi `requiresAsync()` — P5.1. (5) `TagBroker`, tách `@vcs/expr`, `GatewayManager`/`RingLog`, REST `/api/comms/*`, CLI `--no-comms`/`--hmi-readonly`, `vcs comms export` — tất cả P4.1/P4.6. (6) Thu hẹp `comms.log` `level` thành enum — spec không ghim giá trị (OQ-077).

**Bảng tính tay (golden cho test — tính từ M0 §6.2 quy tắc 5 + `TYPE_RANGES`, chưa chạy code):**

`validateTagValue(type, v)` — `—` = `undefined` (hợp lệ):

| type | v | Kết quả | type | v | Kết quả |
|---|---|---|---|---|---|
| Bool | `true` / `false` | — | Int | `32767` | — |
| Bool | `1` / `'true'` | TYPE | Int | `32768` / `1.5` / `'5'` | RANGE / RANGE / TYPE |
| Word | `0` / `65535` | — | DWord | `4294967295` | — |
| Word | `-1` / `65536` | RANGE | DWord | `4294967296` / `-1` | RANGE |
| Real | `NaN` / `+Infinity` | — | SInt | `-128` | — |
| Real | `'x'` | TYPE | SInt | `-129` | RANGE |
| Time | `0` | — | String | `''` | — |
| Time | `-1` / `1.5` | RANGE | String | `5` | TYPE |

Ranh giới validate ≠ normalize (test ghim): `validateTagValue('Real', 0.30000000000000004)` → `—` (không fround ở đây); `tags.write(h, 0.30000000000000004, 'system')` rồi `get` → `Math.fround(...)` (chuẩn hóa chỉ trong `TagDB.write`, như cũ). `validateTagValue('DWord', 4294967295)` → `—`; giá trị ghi vẫn qua `>>> 0` ở `write` như cũ.

`requiresAsync()` (tính từ định nghĩa cờ, không cần chạy bước):

| Component đã đăng ký | `requiresAsync()` | `stepOnce()` với adapter async |
|---|---|---|
| (không có controller) | `false` | n/a |
| chỉ `LoopbackController` | `false` | n/a (đồng bộ) |
| adapter stub `asyncStep: true` | `true` | ném `SIM-E002` (giữ M0) |
| loopback + stub async | `true` | ném `SIM-E002` ở adapter async |
| adapter `asyncStep: false` tường minh | `false` | n/a |

**Test (mục tiêu: ≥ 31 test mới; tổng ≥ 470 = 439 + 31):**

| Nhóm | File | Test mới (tên + kỳ vọng) |
|---|---|---|
| `validateTagValue` (~14) | `packages/kernel/src/tags.test.ts` | Bảng tính tay trên, mỗi ô một case (dùng `it.each` với bảng case dùng chung); tương đương với `TagDB.write`: case lỗi → `write` (validate: true) ném `TagError('TAG-E001')` cùng message; case hợp lệ → `write` thành công; ranh giới validate ≠ normalize (Real fround / DWord `>>> 0` chỉ ở `write`); import từ `@vcs/kernel` (index) để ghim export |
| `files.comms/hmi` (~5) | `packages/schemas/src/project.test.ts` + `packages/project/src/load.test.ts` | `files` vắng → defaults `{ tags: 'tags/tags.yaml', comms: 'comms/comms.yaml', hmi: 'hmi/' }`; `files.comms`/`files.hmi` tường minh được giữ; `files.comms`/`files.hmi` không báo `PRJ-W001`; `loadProject` hello-tags: hash **không đổi** so với giá trị trước P0.8 (ghim ở triển khai: chạy load trên cây trước thay đổi, ghi giá trị, assert sau thay đổi bằng đúng giá trị đó) |
| Protocol additive (~8) | `packages/schemas/src/protocol.test.ts` (+ 1 ở `apps/server/src/ws.test.ts` hoặc `sim-service.test.ts`) | `sim.state` thiếu `locked` → parse ok; `locked: true/false` → parse ok; `locked: 'yes'` → fail; `comms.status` hợp lệ → parse ok; thiếu `stats` / `state` lạ / `kind` lạ → fail; `comms.log` 0 entry + 1 entry đủ trường → parse ok; `kind` lạ / thiếu `summary` → fail; `PROTOCOL_VERSION` vẫn 1 (test đã có, chạy lại); `service.simState()` **không** chứa key `locked` (ghim hành vi P0.8 — P4.1 sẽ sửa test này khi bắt đầu gửi `locked`) |
| `asyncStep`/`requiresAsync` (~6) | `packages/kernel/src/orchestrator.test.ts` | Bảng `requiresAsync` trên (5 case, adapter async là stub local trong file test, không sửa `FakeController`/`LoopbackController`); `stepOnce` với adapter async → ném `SIM-E002`; `stepOnceAsync` với adapter async → chạy đủ pha, `flush()` chạy, `stepCount` tăng |
| `sym:` (~2) | `packages/project/src/load.test.ts` | Project có tag address `sym:"DB_Motor"."M01"."Start"` → `validate` exit 0 + `loadProject` ok, tag có mặt trong catalog với address nguyên văn; (regex `sym:` rỗng đã có test ở schemas — không lặp) |
| `applyInbox` (0 mới) | — | Chạy lại test hiện có `orchestrator.test.ts:585` |

**Mơ hồ (phân loại):** **Tier A (tự quyết):** vị trí `validateTagValue` trong `tags.ts` (cạnh `validateValue`) thay vì file mới; test dùng bảng case dùng chung (`it.each`) cho cả `validateTagValue` và `TagDB.write`; mục §11 mới trong `docs/semantics.md`; thứ tự triển khai các mục (làm theo thứ tự mục 2→6 ở trên, mục 1 chỉ chạy lại test). **Tier B (mặc định + ghi OQ):** OQ-075 (`TagValueError` `{ kind: 'TYPE'|'RANGE', message }`), OQ-076 (envelope `comms.status`/`comms.log` theo M4 §5.3/§5.4, chưa gồm adapter), OQ-077 (`level: string`, không enum), OQ-078 (`requiresAsync` chỉ theo cờ), OQ-079 (chưa thêm chốt "cấm gọi trong bước" cho `applyInbox`), OQ-080 (chưa quyết quy tắc `locked = true` — M4 vs M5/C5), OQ-081 (giữ hai bảng `TYPE_RANGES`, test chéo bắt lệch). **Tier C: không có mục chặn dự kiến** — nếu khi triển khai phát hiện M4/M5 ghi khác về hình dạng đã đề xuất (vd `GatewayStats` có thêm trường bắt buộc) thì dừng mục đó, ghi OQ/SCR, **không tự sửa spec**; nếu test nào đỏ vì hành vi hiện có đổi (không phải do code mới) thì dừng, báo nguyên nhân gốc.

**Rủi ro + cách kiểm:** (1) Hình dạng `comms.*` đề xuất lệch nhu cầu P4.1 thật — giảm thiểu: chỉ thêm trường optional khi mở rộng (additive); server P0.8 không phát nên không client nào phụ thuộc; P4.1 được phép sửa schema kèm test của chính nó. (2) `requiresAsync` theo cờ bỏ sót component trả Promise không đặt cờ — theo thiết kế (OQ-078); `stepOnce` vẫn ném `SIM-E002` nên lỗi ồn ào, không im lặng. (3) Quy tắc `locked` M4 vs M5/C5 chưa quyết — không ảnh hưởng P0.8 vì trường chỉ thêm vào schema, không phát; quyết ở P4.1/P5.1 (OQ-080). (4) Refactor `validateValue` làm lệch thông điệp `TAG-E001` — test tương đương (cùng message) bắt ngay; chạy `pnpm test` sau mỗi bước refactor nhỏ, không refactor lớn một lần. (5) `files` defaults làm đổi hash project — test ghim hash hello-tags bắt ngay; nếu hash đổi thì dừng (loader đã chạm nhầm `files.comms/hmi`).

**Ngoài phạm vi:** `TagBroker` (P4.1); tách `@vcs/expr` (P4.1); `SimulationService` dùng `validateTagValue` trong `tagWrite` (P4.1); service chuyển `stepOnceAsync` theo `requiresAsync` (P5.1); phát `locked = true` (P4.1/P5.1); gửi/nhận `comms.*` ở server/web, REST `/api/comms/*`, `GatewayManager`/`RingLog` runtime (P4.1/P4.6); CLI `--no-comms`/`--hmi-readonly`, `vcs comms export` (P4.6); `TagAddressMap` hiểu `sym:` (P1.4/P5.7); `ControllerIntrospection.readMany`/`listSymbols` (P1.4); Worker transport (A10/E6); P0.9 PWA; đổi `.dependency-cruiser.cjs` (không cần — không thêm package/hướng import; `depcheck` phải xanh như cũ); ADR mới; mã diagnostic mới (`docs/diagnostics.md` giữ 24 mã, `--check` khớp).

**Gate P0.8 (triển khai):** `lint && typecheck && depcheck && test && test:e2e && review:cheats && docs:diagnostics --check` + `build` + bench guard (`pnpm bench`: TagDB 4/4 PASS + orchestrator ≥ 100 000 bước/s — `requiresAsync` không nằm trên đường nóng, `validateTagValue` không cấp phát ở đường thành công; nếu bench rớt > 20% so với baseline thì dừng điều tra, không hạ ngưỡng) + CI (check + test ubuntu/windows + e2e ubuntu) xanh. Tổng test sau P0.8: **≥ 470**.

**Kết quả triển khai (2026-11-24, nhánh `m0/p0.8-interfaces`):** làm đủ 5 mục code mới + 2 mục đã có sẵn chỉ thêm test; không đổi hành vi (server không phát message mới, web không đổi, hash CLI `21096ab2…1d53` giống hệt 2 lần chạy). **Test mới 68, tổng 507/507 (36 file)** — vượt mục tiêu ≥ 31/≥ 470: validateTagValue 28, requiresAsync 7, files 4, protocol 6, sym: 2, hash pin 1, simState locked 1, test chéo TYPE_RANGES 19. Gate xanh ở bản sao sạch `/tmp/vcs-p08` (install `--frozen-lockfile` thật): lint 0, typecheck sạch, depcheck 82 modules/134 deps, test 507/507 + coverage kernel 97,84%/schemas 95,97%/project 97,83%, e2e 5/5, review:cheats SẠCH, diagnostics --check khớp (24 mã), build 3/3, bench TagDB 4/4 PASS (set/get 50,6M ops/s) + orchestrator 447.228 bước/s, regression exit 0. `pnpm-lock.yaml` không đổi. OQ-075…081 đóng (đã áp dụng). Hình dạng M4/M5 khớp đề xuất trong plan — không mục nào phải dừng ghi SCR.

**Chỗ lệch plan (ghi rõ):** (1) `validateTagValue` bản đầu dùng closure `bad` tạo ở mỗi lần gọi → bench set/get rớt còn 4,1M ops/s (FAIL ngưỡng 10M); A/B cùng máy chứng minh do code mới (stash code → 43,6M PASS). Đã sửa: chỉ tính `kind` bằng biến cục bộ, object lỗi chỉ tạo ở đường lỗi — bench sau sửa 50,6M ops/s PASS. Bài học: "không cấp phát ở đường thành công" phải hiểu cả closure, không chỉ object trả về. (2) Plan không liệt kê nhưng bắt buộc theo type mới: 2 fixture test cũ dựng `ProjectConfig` với `files: { tags }` phải thêm `comms`/`hmi` (`builder.test.ts:71`, `sim.test.ts:42`) — hệ quả trực tiếp của thay đổi schema, không đổi hành vi; và `EMPTY_PROJECT_CONFIG` ở `load.ts` tương tự. (3) Regression script cảnh báo 1 mục `flushChangesMs` +285,7% so baseline (0,063 → 0,243 ms) — giá trị tuyệt đối vẫn trong ngưỡng ≤ 1 ms, là nhiễu đo dưới mili-giây đã biết từ P0.7; script chỉ warn, exit 0.

## 16. Kế hoạch P1.1 — runtime-iec: types/memory/layout + vendor-siemens: address (plan-first, 2026-11-25)

**Điểm xuất phát:** M0 đã ký + lên `main` (`31c7200`); P0.8 đã merge PR #19 (merge commit `aecb372`, develop head `aecb372` — parent xác minh qua MCP read, `merged_at` 2026-11-24T17:30:56Z; nhánh local `m0/p0.8-interfaces` HEAD `fd3578e` = nội dung develop sau merge, chỉ STATE.md §1/§2 còn ghi P0.8 "chưa mở PR" — đã cập nhật trong commit plan này). Tổng test hiện tại **507/507** (36 file); CI 8 successful + 2 skipped. PROMPTS P1.1: "runtime-iec: types.ts, memory.ts (big-endian, DataView), layout.ts (DB/struct); vendor-siemens: address.ts. Test chồng lấn %MW/%MB/bit, layout struct theo M1 §3.4. Không làm: parser/interpreter. Gate: test bộ nhớ/địa chỉ/layout xanh; property test ghi-đọc nhiều độ rộng so với mô hình tham chiếu byte-array."

**Hiểu biết (tóm tắt):** (1) P1.1 là nền móng số học/bộ nhớ cho toàn bộ M1: mọi prompt P1.2–P1.7 đều đứng trên `types`/`memory`/`layout`/`address` — sai ở đây thì golden P1.4–P1.7 sai theo, nên bảng tính tay phải tự tính trước, không sao chép số từ implementation. (2) Spec cho đủ thuật toán (§3.2 chồng lấn + ví dụ, §3.3 bảng địa chỉ, §3.4 layout 6 quy tắc) — chỉ 2 điểm gắn `VERIFY` (LReal căn chẵn không căn 8; Array of Bool gói bit) + vài khoảng trống parser (chữ thường, DB0, lỗi ngoài vùng) → mặc định tier B + OQ, không hỏi trước. (3) Hạ tầng đã sẵn, không cần sửa config ngoài 1 dòng ngưỡng coverage: `pnpm-workspace.yaml` bao `packages/*`; root `tsconfig.json` include `packages/*/src/**`; `vitest.config.ts` include `packages/*/src/**/*.test.ts`; `.dependency-cruiser.cjs` đã có rule `runtime-iec-deps` (được import schemas, kernel) + `vendor-siemens-deps` (schemas, runtime-iec); `eslint.config.js` `CORE_FILES` đã gồm `runtime-iec` + `vendor-*` (cấm `Date.now`/`Math.random` — P1.1 không dùng thời gian/ngẫu nhiên, trừ fast-check có seed cố định trong test); `fast-check@4.10.2` đã là root devDep và đã dùng trong test hiện có. (4) `DataType` đã có đủ 13 kiểu M1 §3.1 trong `@vcs/schemas` (`common.ts`: Bool/Byte/Word/DWord/SInt/USInt/UInt/UDInt/Int/DInt/Real/LReal/Time + String dành sẵn); `validateTagValue` + `TagValueError` đã có ở kernel từ P0.8 — P1.1 tái dùng, không viết lại bảng khoảng kiểu. (5) `String` ngoài phạm vi M1 (§1.3: STRING/WSTRING không hỗ trợ) — `types.ts` không định nghĩa kích thước cho nó (OQ-087). (6) 8 "golden" của M1 §12.2 hàng "Bộ nhớ & địa chỉ" ở P1.1 là **bảng tính tay assert bằng unit test** — chưa có golden runner YAML (P1.7) và các case này không cần SCL/SoftPlc (OQ-082).

**Phạm vi (PROMPTS P1.1; M1 §2–3; AMENDMENTS A3, A8, A12, E5):**

| File | Nội dung |
|---|---|
| `packages/runtime-iec/package.json` | Mới: `@vcs/runtime-iec` 0.1.0, `exports` → `./src/index.ts`, deps `@vcs/schemas: workspace:*` (kernel **chưa** khai — thêm ở P1.4 khi `SoftPlc` cần `ControllerAdapter`), scripts `lint`/`typecheck`/`test` theo mẫu kernel |
| `packages/runtime-iec/tsconfig.json` | Mới: extends `../../tsconfig.base.json`, include `src/**/*.ts` (mẫu kernel) |
| `packages/runtime-iec/src/types.ts` | `TypeInfo` + `TYPE_INFO` + `sizeOf` + phân loại kiểu (M1 §3.1) |
| `packages/runtime-iec/src/memory.ts` | `MemoryArea` + `DbStore` + accessor big-endian qua `DataView` (M1 §3.2) |
| `packages/runtime-iec/src/layout.ts` | `layoutStruct` + `FieldDecl`/`FieldType`/`FieldInfo` (M1 §3.4) |
| `packages/runtime-iec/src/index.ts` | Export 3 module trên |
| `packages/runtime-iec/src/{types,memory,layout}.test.ts` | Test types/memory/layout (bảng tính tay dưới + property) |
| `packages/vendor-siemens/package.json` | Mới: `@vcs/vendor-siemens` 0.1.0, deps `@vcs/schemas` + `@vcs/runtime-iec` (`workspace:*`), scripts theo mẫu kernel |
| `packages/vendor-siemens/tsconfig.json` | Mới: như trên |
| `packages/vendor-siemens/src/address.ts` | `parseAddress` + `formatAddress` + `AbsAddress` (M1 §3.3) |
| `packages/vendor-siemens/src/index.ts` | Export `address.ts` |
| `packages/vendor-siemens/src/address.test.ts` | Test parser địa chỉ (bảng tính tay dưới + property) |
| `vitest.config.ts` | Thêm ngưỡng dòng 85 cho `packages/runtime-iec/src/**` + `packages/vendor-siemens/src/**` (OQ-088) |
| `docs/semantics.md` | Thêm mục §12: bộ nhớ Siemens M1 §3.2–§3.4, mỗi quy tắc gắn `VERIFIED`/`UNVERIFIED` |
| `docs/STATE.md`, `docs/open-questions.md` | Plan này (§16) + OQ-082…091 |

**Thiết kế nhỏ nhất (từng mục — signature chính xác, chỗ KHÔNG làm):**

1. **`types.ts` (M1 §3.1) — bảng kích thước + phân loại, không logic.** `DataType` lấy từ `@vcs/schemas` (không định nghĩa lại):
```ts
export interface TypeInfo {
  readonly name: DataType;
  readonly sizeBytes: number; // Bool = 1 (1 bit trong 1 byte); LReal = 8
  readonly kind: 'bool' | 'signed' | 'unsigned' | 'float' | 'time';
}
export const TYPE_INFO: Readonly<Record<Exclude<DataType, 'String'>, TypeInfo>>;
export function sizeOf(type: DataType): number | undefined; // undefined cho 'String' (OQ-087)
export function isIntegerType(type: DataType): boolean; // SInt/USInt/UInt/UDInt/Int/DInt/Time
export function isFloatType(type: DataType): boolean;   // Real/LReal
export function isBitStringType(type: DataType): boolean; // Byte/Word/DWord
```
Kích thước: Bool 1 (bit, tính theo byte chứa), Byte/SInt/USInt 1, Word/Int/UInt 2, DWord/DInt/UDInt/Real/Time 4, LReal 8. Không hàm chuyển đổi số học ở đây (quy tắc §7.2 là P1.4).
2. **`memory.ts` (M1 §3.2) — một vùng byte + DataView big-endian, không biết tag/kiểu khai báo.** `MemoryArea` là nguyên thủy duy nhất; `DbStore` = `MemoryArea` + số DB (dùng cho diagnostic sau này):
```ts
export class MemoryArea {
  constructor(sizeBytes: number);
  readonly sizeBytes: number;
  getBit(byte: number, bit: number): boolean;          // bit 0 = LSB (§3.2)
  setBit(byte: number, bit: number, value: boolean): void;
  read(type: Exclude<DataType, 'Bool' | 'String'>, byteOffset: number): TagValue;
  write(type: Exclude<DataType, 'Bool' | 'String'>, byteOffset: number, value: TagValue): void;
  snapshot(): Uint8Array;                              // bản sao (không lộ buffer nội bộ)
  restore(data: Uint8Array): void;                     // data.length phải = sizeBytes, sai → RangeError
}
export class DbStore extends MemoryArea {
  constructor(readonly dbNumber: number, sizeBytes: number);
}
```
Quy tắc ghim: **big-endian mọi độ rộng** (`DataView.getUint16(offset, false)`…); `read`/`write` dùng `DataView` trên cùng `Uint8Array` (không sao chép); `write('Real', …)` ép `Math.fround`, `write('DWord'|'UDInt', …)` ép `>>> 0` (AGENTS §4); `write` **validate bằng `validateTagValue` (kernel, P0.8)**, sai → ném `TagError('TAG-E001')` (OQ-091 — wrap/chuẩn hóa là việc của interpreter trước khi ghi, §7.2); `read('Bool', …)` → ném `Error('dùng getBit cho Bool')` (tránh ngữ nghĩa bit mơ hồ — bit nào của byte?); truy cập ngoài vùng (`byteOffset < 0`, `byteOffset + size > sizeBytes`, `bit` ngoài 0..7) → ném `RangeError` nêu rõ vùng/offset/kích thước (OQ-086 — P1.4 map thành `RuntimeFault ARRAY_RANGE` khi phù hợp); `restore` sai độ dài → `RangeError`. **Không** có: container I/Q/M + DB (đó là `SoftPlc`, P1.4); đọc/ghi theo tên symbolic (đó là `TagAddressMap`, P1.4); `Time` đọc như DInt ms (cùng encoding, khác kiểu khai báo).
3. **`layout.ts` (M1 §3.4) — hàm thuần, input là khai báo trung lập (AST sẽ map sang ở P1.3):**
```ts
export type FieldType =
  | { kind: 'elem'; type: DataType }
  | { kind: 'array'; elem: FieldType; lo: number; hi: number }   // 1 chiều, lo..hi bao hàm
  | { kind: 'struct'; name?: string; fields: FieldDecl[] };
export interface FieldDecl { name: string; type: FieldType; }
export interface FieldInfo {
  name: string; byteOffset: number; bitOffset?: number; size: number;
  type: FieldType; fields?: FieldInfo[]; elem?: FieldInfo; count?: number;
}
export interface StructLayout { size: number; fields: FieldInfo[]; }
export function layoutStruct(fields: readonly FieldDecl[]): StructLayout;
```
Thuật toán = đúng 6 quy tắc §3.4 (Bool gói bit trong byte; Byte/SInt/USInt 1 byte không căn; ≥ 2 byte bắt đầu chẵn; LReal chẵn — OQ-084; Struct/UDT/Array bắt đầu chẵn + kết thúc chẵn; tổng làm tròn chẵn). `byteOffset`/`bitOffset` trong `FieldInfo` là **tuyệt đối** trong struct gốc (dùng trực tiếp cho `memory.ts`); với array, `elem` là layout của **một** phần tử tính từ đầu phần tử đầu tiên (`byteOffset` = đầu mảng), `count = hi - lo + 1`, phần tử i ở `byteOffset + i * elem.size`. DB dùng thẳng `layoutStruct` (DB = struct; không có `layoutDb` riêng). Lỗi → ném `Error` nêu tên field + lý do: tên field trùng trong cùng struct; `lo > hi`; array lồng array (nhiều chiều ngoài M1, §3.1); struct chứa `String` (OQ-087); kiểu không rõ. Struct rỗng → `size 0` (hợp lệ).
4. **`address.ts` (M1 §3.3) — parser tuyệt đối, chỉ vị trí, không mang kiểu (OQ-089):**
```ts
export type AbsAddress =
  | { kind: 'area'; area: 'I' | 'Q' | 'M'; byte: number; bit?: number; width: 1 | 8 | 16 | 32 }
  | { kind: 'db'; db: number; byte: number; bit?: number; width: 1 | 8 | 16 | 32 };
export function parseAddress(text: string): AbsAddress;   // sai → throw Error (OQ-090)
export function formatAddress(addr: AbsAddress): string;  // chuẩn '%I0.0' / 'DB1.DBW4'
```
Dạng nhận: `%I0.0`/`%IB10`/`%IW64`/`%ID20` (tương tự Q/M); không `%` cũng parse được (`I0.0`, `IW64` — chuẩn hóa nội bộ thành dạng `%`); `DB<n>.DBX<b>.<bit>`/`DBB`/`DBW`/`DBD`. Width theo chữ cái: (bit) → 1, `B` → 8, `W` → 16, `D` → 32 — **không có dạng 64-bit tuyệt đối** (`%ML` không tồn tại trong §3.3; LReal đọc qua layout/field, không qua chuỗi địa chỉ). Kiểu diễn giải (Int vs Word vs Real với cùng `%IW`) lấy từ **khai báo**, không từ chuỗi địa chỉ (§3.3 "đọc như Int/Word tùy kiểu khai báo"). `%IW65` (word ở byte lẻ) parse được — §3.4 chỉ là quy tắc layout struct, không ràng buộc địa chỉ tuyệt đối. `sym:…` → throw (không phải địa chỉ tuyệt đối; symbolic do `TagAddressMap` P1.4/P5.7 phân giải). Chữ thường (`%i0.0`, `db1.dbw4`) chấp nhận + chuẩn hóa hoa; `DB0` từ chối; bit phải 0..7; không kiểm giới hạn vùng ở parse (byte 1023+ vẫn parse — giới hạn vùng kiểm ở lúc truy cập bộ nhớ) (OQ-085). `formatAddress(parseAddress(s))` là dạng chuẩn (dùng cho test round-trip property).

**Đã loại:** (1) Container PlcMemory (I/Q/M + DBs) — P1.4 `SoftPlc`. (2) `layoutDb` riêng — DB = `layoutStruct`. (3) Đọc/ghi theo tên symbolic, `TagAddressMap` — P1.4/P5.7. (4) Kiểu mới (`Char`, `WChar`, `String` có kích thước) — ngoài M1 §1.3. (5) Lexer/parser SCL, AST, IR — P1.2/P1.3 (PROMPTS "Không làm: parser/interpreter"). (6) S7 codec/Snap7/PUT-GET — M5. (7) Bench mới cho runtime-iec — bench M1 §12.4 (200 FB_Motor, ≥ 1000 scan/s) là P1.7; P1.1 chỉ chạy bench guard hiện có để bắt hồi quy. (8) ADR mới — cấu trúc package theo M1 §2 (spec), không quyết định kiến trúc ngoài spec. (9) Mã diagnostic mới — mã SCL ở P1.2/P1.3 (A8/D6); `docs/diagnostics.md` giữ 24 mã. (10) File `docs/facts/` — nguồn sự thật ở đây là spec M1 (AGENTS §1), không phải manual/API hãng; các mục `VERIFY` theo dõi qua `semantics.md` + OQ + M1 §14 (E11).

**Bảng tính tay A — chồng lấn %MW/%MB/bit/Real (M1 §3.2; bộ nhớ khởi tạo toàn 0; mỗi dòng tính độc lập trừ khi ghi "trên nền trên"):**

| Thao tác | %MB0 | %MB1 | %MB2 | %MB3 | %MW0 | %MW2 | %MD0 | Kiểm thêm |
|---|---|---|---|---|---|---|---|---|
| ghi `%MW0 := 0x1234` (vd §3.2) | 0x12 | 0x34 | 0x00 | 0x00 | 0x1234 | 0x0000 | 0x12340000 | M0.1=1, M0.4=1, M1.2=1, M1.4=1, M1.5=1; M0.0=0, M1.0=0 |
| trên nền trên, ghi `%MB1 := 0xFF` | 0x12 | 0xFF | 0x00 | 0x00 | 0x12FF | 0x0000 | 0x12FF0000 | M1.0..7 = 1 |
| ghi `%MD0 := 0x12345678` | 0x12 | 0x34 | 0x56 | 0x78 | 0x1234 | 0x5678 | 0x12345678 | M2.1=1, M2.6=1, M3.3=1, M3.4=1, M3.5=1, M3.6=1; M3.7=0 |
| set `%M0.3 := true` | 0x08 | 0x00 | 0x00 | 0x00 | 0x0800 | 0x0000 | 0x08000000 | M0.3=1, các bit khác 0 |
| ghi Int `-1` tại `%MW0` | 0xFF | 0xFF | 0x00 | 0x00 | 0xFFFF | 0x0000 | 0xFFFF0000 | đọc Word = 65535, Int = -1 |
| ghi DInt `-1` tại `%MD0` | 0xFF | 0xFF | 0xFF | 0xFF | 0xFFFF | 0xFFFF | 0xFFFFFFFF | DWord = 4294967295, Real = NaN |
| ghi Real `1.5` tại `%MD0` | 0x3F | 0xC0 | 0x00 | 0x00 | 0x3FC0 | 0x0000 | 0x3FC00000 | DWord = 1069547520 |
| ghi Real `0.1` tại `%MD0` | 0x3D | 0xCC | 0xCC | 0xCD | 0x3DCC | 0xCCCD | 0x3DCCCCCD | đọc Real = `fround(0.1)` = 0.10000000149011612 |
| ghi Time `1500` tại `%MD0` | 0x00 | 0x00 | 0x05 | 0xDC | 0x0000 | 0x05DC | 0x000005DC | DInt = 1500 |

Cách tính mẫu (0x12 = 0001 0010 → bit 1, 4; 0x34 = 0011 0100 → bit 2, 4, 5; 0x56 = 0101 0110 → bit 1, 2, 4, 6; 0x78 = 0111 1000 → bit 3, 4, 5, 6; float32 1.5 = 0x3FC00000, 0.1 = 0x3DCCCCCD).

**Bảng tính tay B — layout struct `Motor_Data` (M1 §3.4, tự tính):**

| # | Field | Kiểu | byteOffset | bitOffset | size | Vì sao |
|---|---|---|---|---|---|---|
| 1 | running | Bool | 0 | 0 | 1 bit | |
| 2 | fault | Bool | 0 | 1 | | gói chung byte 0 |
| 3 | ready | Bool | 0 | 2 | | gói chung byte 0 |
| 4 | mode | Byte | 1 | – | 1 | không-Bool → đóng byte 0 |
| 5 | speed | Int | 2 | – | 2 | ≥ 2 byte → chẵn |
| 6 | current | Real | 4 | – | 4 | |
| 7 | temp | LReal | 8 | – | 8 | chẵn (VERIFY, OQ-084) |
| 8 | count | DInt | 16 | – | 4 | |
| 9 | enabled | Bool | 20 | 0 | | |
| 10 | alarm | Bool | 20 | 1 | | gói chung byte 20 |
| 11 | name_len | USInt | 21 | – | 1 | đóng byte 20 |
| 12 | pressure | Word | 22 | – | 2 | chẵn |
| 13 | nested | Struct {a: Bool, b: Bool, c: Word} | 24 | – | 4 | bắt đầu chẵn; a byte 24 bit 0, b byte 24 bit 1, c Word 26..27; kết thúc chẵn 28 |
| 14 | values | Array[1..3] of Int | 28 | – | 6 | 3×2, 28..33 |

Tổng size = **34** (chẵn). Kiểm: các field ≥ 2 byte đều ở offset chẵn; không field nào chồng lấn; byte 24–27 thuộc `nested`, 28–33 thuộc `values`.

**Bảng tính tay C — layout trường hợp biên (§3.4):**

| Struct | Kết quả tính tay |
|---|---|
| `{x: Word, b1..b9: Bool×9, y: Byte}` | x 0..1; b1..b8 byte 2 bit 0..7; b9 byte 3 bit 0; y byte 4; size 5 → **6** |
| `{a: Word, b1, b2: Bool}` | a 0..1; b1 byte 2 bit 0; b2 byte 2 bit 1; size 3 → **4** |
| `{m: Byte, s: Struct{a: Word}}` | m byte 0; s bắt đầu chẵn → 2; a 2..3; size **4** |
| `{m: Byte, arr: Array[0..1] of Word}` | m byte 0; arr bắt đầu chẵn → 2..5; size **6** |
| `{w: Word, flags: Array[0..9] of Bool}` | w 0..1; flags bắt đầu chẵn → byte 2..3 (10 bit); size **4** |
| `{flags: Array[0..6] of Bool}` | flags byte 0 (7 bit = 1 byte) → kết thúc chẵn → size **2** (VERIFY, OQ-083) |
| `{b: Bool}` (DB 1 field) | b byte 0 bit 0; size 1 → **2** |
| `{}` (struct rỗng) | size **0** |
| `{v: Array[1..3] of LReal}` | bắt đầu chẵn → 0..23 (3×8); size **24** |
| `{a: Array[0..2] of Struct{x: Byte, y: Word}}` | elem size 4 (x byte 0, y 2..3); mảng 0..11; size **12** |

**Bảng tính tay D — `parseAddress` (M1 §3.3):**

| Text | Kết quả | Text | Kết quả |
|---|---|---|---|
| `%I0.0` | `{area I, byte 0, bit 0, w 1}` | `%QW0` | `{area Q, byte 0, w 16}` |
| `%I0.7` | `{area I, byte 0, bit 7, w 1}` | `%MB10` | `{area M, byte 10, w 8}` |
| `%I1023.7` | `{area I, byte 1023, bit 7, w 1}` (không kiểm giới hạn vùng) | `%MW0` | `{area M, byte 0, w 16}` |
| `%IB10` | `{area I, byte 10, w 8}` | `%MD20` | `{area M, byte 20, w 32}` |
| `%IW64` | `{area I, byte 64, w 16}` | `I0.0` / `IW64` / `MB10` | như có `%` |
| `%ID20` | `{area I, byte 20, w 32}` | `%IW65` | `{area I, byte 65, w 16}` (byte lẻ vẫn parse) |
| `%Q0.0` / `%QB0` / `%QD0` | area Q, w 1/8/32 | `DB1.DBX0.0` | `{db 1, byte 0, bit 0, w 1}` |
| `%i0.0` / `%mw0` / `db1.dbw4` | chấp nhận, chuẩn hóa hoa (OQ-085) | `DB1.DBB0` / `DB1.DBW4` / `DB1.DBD8` | w 8/16/32 |
| `''`, `%X0.0`, `%I0.8`, `%I`, `%IW`, `%M0.0.0` | throw | `DB0.DBW0`, `DB1.DBZ0`, `DB1.DBW`, `%DB1.DBW0`, `sym:Motor.Start` | throw |

**Test (mục tiêu: ≥ 45 test mới; tổng ≥ 552 = 507 + 45):**

| Nhóm | File | Test mới (tên + kỳ vọng) |
|---|---|---|
| types (~8) | `packages/runtime-iec/src/types.test.ts` | `sizeOf` 13 kiểu M1 (Bool 1, Byte/SInt/USInt 1, Word/Int/UInt 2, DWord/DInt/UDInt/Real/Time 4, LReal 8); `sizeOf('String')` → `undefined` (OQ-087); phân loại `isIntegerType`/`isFloatType`/`isBitStringType` (mỗi loại ≥ 2 case đúng + 2 case sai) |
| memory (~16, gồm bảng A 9 dòng) | `packages/runtime-iec/src/memory.test.ts` | Bảng A: mỗi dòng 1 case (ghi rồi đọc lại đủ độ rộng + bit); `getBit`/`setBit` ranh giới (byte 0 bit 0/7, byte cuối); LReal 64-bit ghi-đọc; `snapshot`/`restore` (đổi rồi restore → đúng byte cũ; `snapshot()` trả bản sao — sửa bản sao không đổi vùng nhớ); OOB: `read`/`write`/`getBit`/`setBit` ngoài vùng → `RangeError`; `write` sai khoảng → `TagError('TAG-E001')` (OQ-091); `read('Bool', …)` → throw (dùng `getBit`); `restore` sai độ dài → `RangeError` |
| layout (~14, gồm bảng B + C) | `packages/runtime-iec/src/layout.test.ts` | Bảng B: assert toàn bộ `FieldInfo` + `size 34` (mỗi field 1 case hoặc 1 case assert deep-equal cả bảng); bảng C: 10 case; lỗi: tên trùng → throw; `lo > hi` → throw; array lồng array → throw; struct chứa `String` → throw (OQ-087); struct rỗng → size 0 |
| address (~20) | `packages/vendor-siemens/src/address.test.ts` | Bảng D: valid ~16 case (gồm không-`%`, DB, chữ thường chuẩn hóa, `%IW65`); invalid ~12 case (throw, message chứa text gốc); `formatAddress(parseAddress(s))` = dạng chuẩn; `parseAddress` không nhận `sym:` |
| property (~3, fast-check, seed cố định) | `memory.test.ts` / `layout.test.ts` / `address.test.ts` | (1) Bộ nhớ: sinh dãy thao tác ghi ngẫu nhiên nhiều độ rộng (8/16/32/bit) tại offset ngẫu nhiên, đọc lại bằng độ rộng khác → bằng **mô hình tham chiếu byte-array viết độc lập** (mảng `number[]` + phép toán big-endian bằng tay, **không** dùng `DataView`); (2) Layout: sinh struct ngẫu nhiên → layout 2 lần giống hệt, mọi offset < size, size chẵn, field không-Bool không chồng lấn; (3) Địa chỉ: sinh địa chỉ hợp lệ → `format` → `parse` → deep-equal dạng chuẩn hóa |

**Mơ hồ (phân loại):** **Tier A (tự quyết):** vị trí file + tên hàm/API như mục thiết kế; test dùng `it.each` với bảng case dùng chung cho bảng A/D; trùng tên field trong cùng struct → throw; `parseAddress` trim khoảng trắng đầu/cuối; thứ tự triển khai (types → memory → layout → address); `DbStore extends MemoryArea` + `dbNumber`. **Tier B (mặc định + ghi OQ):** OQ-082 (8 "golden" §12.2 = bảng tính tay bằng unit test, không chuyển YAML ở P1.7), OQ-083 (Array of Bool gói bit + kết thúc chẵn), OQ-084 (LReal căn chẵn, không căn 8), OQ-085 (parser: chữ thường, DB0, sym:, bit 0..7, không kiểm giới hạn vùng, trim), OQ-086 (ngoài vùng → `RangeError`, P1.4 map thành `ARRAY_RANGE`), OQ-087 (`String`: `sizeOf` → `undefined`, struct chứa String → throw), OQ-088 (ngưỡng coverage 85 dòng cho 2 package mới), OQ-089 (`AbsAddress` chỉ mang width, kiểu theo khai báo), OQ-090 (`parseAddress` throw `Error`, P1.2 chuyển thành Diagnostic), OQ-091 (`write` validate + throw `TAG-E001`, wrap là việc interpreter). **Tier C: không có mục chặn dự kiến** — không cần dữ liệu thật, không cần quyết định chủ sản phẩm trước khi triển khai; nếu khi triển khai phát hiện M1 §3 ghi khác thuật toán đã tính tay (vd quy tắc Bool packing) thì dừng mục đó, ghi OQ/SCR, **không tự sửa spec**.

**Rủi ro + cách kiểm:** (1) Layout `VERIFY` (LReal, Array of Bool) lệch PLC thật — giảm thiểu: golden P1.7 gắn `expectedFrom: spec` cho các case này; xác minh bằng PLCSIM thí nghiệm E11 (M1 §14 mục 11) rồi sửa layout + test (ghi SCR nếu spec đổi). (2) Mặc định parser (chữ thường, DB0) lệch TIA — P1.2 đối chiếu hành vi editor TIA khi có mẫu thật; sửa parser + test, không sửa ngữ nghĩa khác. (3) `AbsAddress` không mang type → P1.3 `lower` phải mang type từ khai báo khi tạo `IrLValue.abs`; nếu quên thì đọc sai (Int vs Word) — giảm thiểu: test P1.3 cho mỗi kiểu đọc qua địa chỉ tuyệt đối. (4) `MemoryArea.write` throw `TAG-E001` ở đường lỗi có thể làm P1.4 phải bọc try/catch — thiết kế P1.4: interpreter chuẩn hóa/wrap trước khi ghi (§7.2) nên scan bình thường không chạm đường lỗi; đo bench P1.7 (≥ 1000 scan/s, 200 FB_Motor). (5) Property test flaky/chậm — seed cố định (fast-check `seed`), giới hạn số mẫu vừa đủ (mặc định 100/case như test hiện có).

**Ngoài phạm vi:** parser/lexer SCL, AST, typecheck, IR/lower, interpreter, scheduler, `SoftPlc`, force, snapshot/restore PLC (P1.2–P1.5); `TagAddressMap` (P1.4/P5.7); `ControllerIntrospection` (P1.4, D3/B8); std blocks TON/CTU/R_TRIG (P1.5); LAD (P1.6); golden runner YAML + demo `motor-interlock` + UI + bench M1 §12.4 (P1.7); container PlcMemory; S7 codec/Snap7/PLCSIM (M5); đổi `.dependency-cruiser.cjs` / `eslint.config.js` / root `tsconfig.json` (đã bao sẵn 2 package mới — `depcheck` + lint phải xanh như cũ); ADR mới; mã diagnostic mới; `docs/facts/` mới; P0.9 PWA.

**Gate P1.1 (triển khai):** `lint && typecheck && depcheck && test && test:e2e && review:cheats && docs:diagnostics --check` + `build` + bench guard (`pnpm bench`: TagDB 4/4 PASS + orchestrator ≥ 100 000 bước/s — P1.1 không chạm đường nóng bench; rớt > 20% so với baseline thì dừng điều tra, không hạ ngưỡng) + CI (check + test ubuntu/windows + e2e ubuntu) xanh. Tổng test sau P1.1: **≥ 552**. `pnpm-lock.yaml` **không đổi** (không dependency mới; diff lockfile xuất hiện là cờ đỏ, dừng kiểm tra). `pnpm install` trong VM vẫn EPERM (OQ-007) — triển khai làm ở bản sao `/tmp` như các prompt trước, cài thật `--frozen-lockfile`.

**Kết quả triển khai (2026-11-25, nhánh `m1/p1.1-runtime-iec`):** làm đủ phạm vi plan §16; không đổi hành vi hiện có (chỉ thêm 2 package mới + ngưỡng coverage + `semantics.md` §12; hash CLI `21096ab2…1d53` giống hệt 2 lần chạy). **Test mới 144, tổng 651/651 (40 file)** — vượt mục tiêu ≥ 45/≥ 552: types 48, memory 23, layout 19, address 54 (gồm 3 property test fast-check seed cố định). Gate xanh ở bản sao sạch `/tmp/vcs-p11` (install `--frozen-lockfile` thật, exit 0): lint 0, typecheck sạch, depcheck "no violations" (88 modules, 141 deps), test 651/651 + coverage dòng runtime-iec types 100% (6/6), memory 93,84% (61/65), layout 100% (68/68), vendor-siemens address 100% (47/47) — đều trên ngưỡng 85, e2e 5/5 (13,7 s), review:cheats SẠCH, diagnostics --check khớp (24 mã), build 3/3, bench TagDB 4/4 PASS (set/get 50,3M ops/s) + orchestrator 440.445 bước/s, regression exit 0 (2 warning nhiễu đo dưới mili-giây: flushNoChangeUs 0,15 → 0,23 µs, flushChangesMs 0,063 → 0,088 ms — giá trị tuyệt đối vẫn trong ngưỡng ≤ 50 µs / ≤ 1 ms). OQ-082…091 đóng (đã áp dụng). `docs/semantics.md` thêm §12 (bộ nhớ M1 §3.2–§3.4; 2 mục `VERIFY` OQ-083/084 ghi `UNVERIFIED`, chờ PLCSIM E11).

**Chỗ lệch plan (ghi rõ):** (1) `packages/runtime-iec/package.json` khai thêm dep `@vcs/kernel: workspace:*` — plan ghi kernel "chưa khai, thêm ở P1.4", nhưng `memory.ts` phải import `validateTagValue`/`TagError` từ kernel ngay ở P1.1 (thiết kế §16 mục 2 + OQ-091); rule dep-cruiser `runtime-iec-deps` đã cho phép kernel từ trước nên không đổi config. (2) `pnpm-lock.yaml` **đổi +18 dòng** — plan ghi "không đổi" là sai ở nghĩa hẹp: lockfile bắt buộc thêm 2 importer mới (`packages/runtime-iec`, `packages/vendor-siemens`, chỉ link `workspace:*`, không đổi version, không dependency ngoài mới); `pnpm install --frozen-lockfile` lần đầu FAIL (`ERR_PNPM_OUTDATED_LOCKFILE`), đã sinh lại lockfile bằng `pnpm install` thật ở `/tmp/vcs-p11`, kiểm diff chỉ có 2 importer mới rồi chép về — sau đó frozen install exit 0. (3) Lỗi regex trong `address.ts` bản đầu: lớp ký tự DB viết `[XBD]` thiếu `W` nên `DB1.DBW4` parse lỗi — property test round-trip bắt được ngay (5/121 đỏ), đã sửa thành `[XBWD]`, sau đó 144/144 xanh. (4) `FieldInfo.size`: byte với mọi kiểu, riêng Bool = 1 (bit) — plan không ghim đơn vị cho Bool; đã ghi rõ trong comment `layout.ts` + `semantics.md` §12.

## 17. Kế hoạch P1.2 — Lexer + parser SCL (Chevrotain) (plan-first, 2026-11-25)

**Điểm xuất phát:** M0 đã ký + lên `main`; P0.8 merge PR #19; P1.1 **đã merge PR #20** (merge commit `8b3dbb6`, develop head `8b3dbb6` — parent xác minh qua MCP read, `merged_at` 2026-11-24T18:13:20Z tức 2026-11-25 01:13 +07; CI xanh, job `check` có 1 warning annotation nhưng succeeded — nội dung warning chưa đọc được qua API, xem khi duyệt PR #20). Tổng test hiện tại **651/651** (40 file). PROMPTS P1.2: "lexer + parser SCL (Chevrotain) theo EBNF M1 §4.2, bảng ưu tiên 4.3, phục hồi lỗi mức statement. AST có type + vị trí. Gate: ≥ 15 test lexer, ≥ 40 parse hợp lệ, ≥ 12 test lỗi (line/col chính xác). Không type check ở bước này."

**Hiểu biết (tóm tắt):** (1) P1.2 là front-end đầu tiên của M1: P1.3–P1.7 (typecheck, lower→IR, interpreter, golden) đều đứng trên AST của P1.2 — AST sai hình thì lower sai theo, nên bảng tính tay (token, ưu tiên, AST, vị trí lỗi) phải tự tính trước, không sao chép từ implementation. (2) Spec cho đủ ngữ pháp: EBNF §4.2 (bắt buộc bám sát), bảng ưu tiên §4.3 (10 mức), lexer §4.1 (từ khóa không phân biệt hoa/thường, `"..."` phân biệt, comment `//` + `(* *)` không lồng, literal đầy đủ) — các khoảng trống là: `init` (DB) và `const_expr` không định nghĩa; kết hợp `**` không nói; mã lỗi parser chỉ nêu tên SCL-P001; comment lồng chỉ ghi VERIFY — tất cả mặc định tier B + OQ, không hỏi trước. (3) `compileScl` ở M1 §10 trả `IrBlock[]` — đó là việc P1.3 (cần typecheck + lower); P1.2 chỉ cung cấp `parseScl` (AST + diagnostics) làm nền, và `tokenizeScl` cho test lexer. (4) Chevrotain là lựa chọn bắt buộc theo M1 §17 (không ANTLR); bản mới nhất 13.2.0 phát hành 2026-08-01 (thỏa quy tắc ≥ 14 ngày), engines Node >= 22.0.0 (khớp CI Node 22), ESM-only (khớp `moduleResolution: bundler` của repo). (5) X-002/S1 (mã SCL thật ≥ 10 khối) vẫn mở — nhưng PROMPTS §4 ghi mã thật cho M1 là "(tùy chọn)", và EBNF §4.2 đã đủ để cài parser + test bằng fixture tự viết; P1.2 **không chờ X-002** (xem OQ-105). (6) Hạ tầng đã sẵn: rule `vendor-siemens-deps` cho phép import schemas/runtime-iec/vendor-siemens (chevrotain là dep ngoài, không chạm rule); `vitest.config.ts` đã có ngưỡng 85 dòng cho vendor-siemens (OQ-088); `parseAddress` (P1.1) tái dùng cho token địa chỉ tuyệt đối; `Diagnostic` chuẩn ở schemas (A8). (7) Mã chẩn đoán SCL chưa có trong `DiagnosticCatalog` — `scripts/gen-diagnostics.ts` hiện chỉ biết `PRJ_CATALOG`, nên P1.2 phải thêm `SCL_CATALOG` + cập nhật script gộp catalog rồi sinh lại `docs/diagnostics.md` (24 → 29 mã).

**Phạm vi (PROMPTS P1.2; M1 §4.1–4.3, §12.2 nhóm lexer/parser; AMENDMENTS A8, D6; M1 §17):**

| File | Nội dung |
|---|---|
| `packages/vendor-siemens/package.json` | Thêm dep `chevrotain@13.2.0` (exact; phát hành 2026-08-01, ≥ 14 ngày; engines Node >= 22) |
| `pnpm-lock.yaml` | Sinh lại bằng `pnpm install` thật ở `/tmp` — chỉ thêm `chevrotain` + 5 gói `@chevrotain/*` 13.2.0, không đổi version khác |
| `packages/vendor-siemens/src/scl/lexer.ts` | Token Chevrotain + `tokenizeScl` + `parseLiteralValue` (chuyển text literal → giá trị) |
| `packages/vendor-siemens/src/scl/ast.ts` | Kiểu AST + `SrcLoc` (mọi node có vị trí) |
| `packages/vendor-siemens/src/scl/parser.ts` | `SclParser extends EmbeddedActionsParser` + `parseScl` + phục hồi lỗi mức statement |
| `packages/vendor-siemens/src/scl/lexer.test.ts` | Test lexer (bảng A + literal + property round-trip token) |
| `packages/vendor-siemens/src/scl/parser.test.ts` | Test parse hợp lệ (bảng B + C) + test lỗi (bảng D + phục hồi) |
| `packages/vendor-siemens/src/index.ts` | Export `parseScl`, `tokenizeScl`, kiểu AST/token (dùng cho P1.3) |
| `packages/schemas/src/diagnostics-catalog.ts` | Thêm `SCL_CATALOG`: SCL-L001, SCL-P001, SCL-P002, SCL-P003, SCL-U001 (OQ-095) |
| `scripts/gen-diagnostics.ts` | Gộp `PRJ_CATALOG` + `SCL_CATALOG` (hiện chỉ biết PRJ) khi quét/sinh |
| `docs/diagnostics.md` | Sinh lại bằng script (24 → 29 mã) — không sửa tay |
| `docs/semantics.md` | Thêm §13: quyết định lexer/parser SCL, mỗi điểm gắn `VERIFIED`/`UNVERIFIED` |
| `docs/STATE.md`, `docs/open-questions.md` | Plan này (§17) + OQ-092…105 |

**Thiết kế nhỏ nhất (từng mục — signature chính xác, chỗ KHÔNG làm):**

1. **`lexer.ts` (M1 §4.1) — token + chuyển literal, không biết grammar.** Dùng `createToken` + `Lexer` của Chevrotain; token không phân biệt hoa/thường với từ khóa (`ignoreCase: true`), `"..."` và `#name` giữ nguyên dạng viết:
```ts
export interface SclToken {
  readonly type: string;   // tên token type (vd 'If', 'Semicolon', 'IntLiteral')
  readonly image: string;  // text gốc
  readonly line: number; readonly col: number;
  readonly endLine: number; readonly endCol: number;
  readonly offset: number; readonly length: number;
}
export interface TokenizeResult { tokens: SclToken[]; diagnostics: Diagnostic[]; }
export function tokenizeScl(source: string, fileName: string): TokenizeResult;
export function parseLiteralValue(raw: string, kind: 'int' | 'real' | 'bool' | 'time' | 'typed')
  : { value: number | boolean; type?: DataType };
```
Token: từ khóa (ORGANIZATION_BLOCK, FUNCTION, FUNCTION_BLOCK, TYPE, STRUCT, END_STRUCT, END_TYPE, DATA_BLOCK, END_DATA_BLOCK, VAR_INPUT, VAR_OUTPUT, VAR_IN_OUT, VAR, VAR_TEMP, VAR_CONSTANT, END_VAR, BEGIN, END_ORGANIZATION_BLOCK, END_FUNCTION, END_FUNCTION_BLOCK, IF, THEN, ELSIF, ELSE, END_IF, CASE, OF, END_CASE, FOR, TO, BY, DO, END_FOR, WHILE, END_WHILE, REPEAT, UNTIL, END_REPEAT, EXIT, CONTINUE, RETURN, AND, OR, XOR, NOT, MOD, DIV, TRUE, FALSE, ARRAY); `Ident` (`[A-Za-z_][A-Za-z0-9_]*` — tên biến/kiểu/hàm không có `#`/`"`); `LocalVar` (`#[A-Za-z_][A-Za-z0-9_]*`); `GlobalVar` (`"[^"\n]*"` — không khớp qua dòng); `AbsAddress` (`%(I|Q|M)[A-Za-z]*\d+(\.\d+)?` và `DB\d+\.DB[XBWD]\d+(\.\d+)?`, không phân biệt hoa/thường — **trước** `Ident` trong thứ tự token, nếu không `DB1` sẽ bị cắt thành Ident); literal `IntLiteral` (thập phân có `_`, `16#FF`, `2#1010_0101`, `8#17`), `RealLiteral` (`1.5`, `3.0E-2`, `1e3`), `TimeLiteral` (`T#5s`, `T#1h30m`, `TIME#...`), `TypedLiteral` (`INT#5`, `WORD#16#FFFF` — một token duy nhất, vì `#` lẻ không phải token hợp lệ); toán tử/tách: `:=`, `=>`, `;`, `:`, `,`, `.`, `..` (**trước** `.` — nếu không `1..3` bị đọc thành Real `1.`), `(`, `)`, `[`, `]`, `=`, `<>`, `<`, `>`, `<=`, `>=`, `+`, `-`, `*`, `/`, `**` (**trước** `*`), `&`. Thứ tự token trong Chevrotain: khớp dài nhất thắng, cùng độ dài thì token khai trước thắng — từ khóa trước `Ident`, `..` trước `.`, `**` trước `*`, `:=` trước `:`, `=>` trước `=`, `<=`/`>=`/`<>` trước `<`/`>`/`=`. Khoảng trắng/comment bỏ qua (không thành token): `//` tới hết dòng; `(* ... *)` **không lồng** — pattern khớp tới `*)` đầu tiên, kiểm tra hậu kỳ: token comment không kết thúc bằng `*)` → SCL-L001 "comment không đóng" tại vị trí `(*` (OQ-096). Dấu `"` không đóng → lexer không khớp token nào → SCL-L001 tại `"`. `SclToken` là dữ liệu thuần (map từ `IToken` của Chevrotain, không lộ kiểu Chevrotain ra ngoài lexer). Giá trị literal (bảng A): `16#FF` → 255, `2#1010_0101` → 165, `8#17` → 15, `T#1h30m` → 5400000 ms, `T#-2s` → -2000, `INT#5` → `{value: 5, type: 'Int'}`, `WORD#16#FFFF` → `{value: 65535, type: 'Word'}`; chữ số sai cơ số (vd `2#2`) → SCL-L001; Real giữ double JS (ép `fround` là việc của interpreter P1.4, §7.2); Time = ms nguyên.
2. **`ast.ts` — cây thuần (plain object, serializable JSON), mọi node có `loc`:**
```ts
export interface SrcLoc { line: number; col: number; endLine: number; endCol: number; offset: number; length: number; }
export type SclFile = { kind: 'file'; blocks: SclBlock[]; loc: SrcLoc };
export type SclBlock = ObBlock | FcBlock | FbBlock | UdtBlock | DbBlock;
// ObBlock { kind: 'OB'; name: string; varSections: VarSection[]; body: SclStmt[]; loc }
// FcBlock { kind: 'FC'; name: string; returnType?: SclType; varSections: VarSection[]; body: SclStmt[]; loc }
// FbBlock { kind: 'FB'; ... }  UdtBlock { kind: 'UDT'; name: string; fields: VarDecl[]; loc }
// DbBlock { kind: 'DB'; name: string; fbName?: string; fields?: VarDecl[]; init?: SclAssign[]; loc }
export interface VarSection { kind: 'VAR_INPUT' | 'VAR_OUTPUT' | 'VAR_IN_OUT' | 'VAR' | 'VAR_TEMP' | 'VAR_CONSTANT'; decls: VarDecl[]; loc: SrcLoc; }
export interface VarDecl { name: string; type: SclType; init?: SclExpr; loc: SrcLoc; }
export type SclType =
  | { kind: 'elementary'; name: string; loc: SrcLoc }   // tên kiểu viết trong code ('Int', 'Bool', ...)
  | { kind: 'array'; lo: number; hi: number; elem: SclType; loc: SrcLoc }
  | { kind: 'struct'; fields: VarDecl[]; loc: SrcLoc }  // struct nội tuyến (OQ-104)
  | { kind: 'named'; name: string; loc: SrcLoc };       // tên UDT/kiểu chưa phân giải — P1.3 phân giải
export type SclStmt = AssignStmt | IfStmt | CaseStmt | ForStmt | WhileStmt | RepeatStmt | ExitStmt | ContinueStmt | ReturnStmt | CallStmt | EmptyStmt;
export type SclExpr = LiteralExpr | RefExpr | UnaryExpr | BinaryExpr | CallExpr;
export type SclLValue = { base: SclRef; path: SclPathElem[]; loc: SrcLoc };
export type SclRef =
  | { kind: 'local'; name: string; loc: SrcLoc }                 // #name
  | { kind: 'global'; name: string; loc: SrcLoc }                // "Name"
  | { kind: 'abs'; address: AbsAddress; raw: string; loc: SrcLoc }; // %I0.0, DB1.DBW4 (parseAddress P1.1)
export type SclPathElem = { kind: 'member'; name: string; loc: SrcLoc } | { kind: 'index'; index: SclExpr; loc: SrcLoc };
export type SclCallArg =
  | { kind: 'named'; name: string; value: SclExpr; loc: SrcLoc }
  | { kind: 'namedOut'; name: string; target: SclLValue; loc: SrcLoc }  // Q => #y
  | { kind: 'positional'; value: SclExpr; loc: SrcLoc };
export type SclLiteral =
  | { kind: 'int' | 'real' | 'bool' | 'time'; value: number | boolean; raw: string; type?: string; loc: SrcLoc };
```
Quy tắc ghim: tên kiểu trong `elementary` giữ nguyên text (`'Int'`, không chuẩn hóa — P1.3 chuẩn hóa/kiểm tra); tên UDT chưa biết giữ dạng `named` (parser **không** kiểm tra tên kiểu tồn tại — trừ `String`/`WString` → SCL-U001, OQ-102); `loc` tính từ token đầu tới token cuối của node (helper `locFrom(first, last)`); AST không chứa function/class instance (serializable JSON, phục vụ debug + P1.3).
3. **`parser.ts` — `EmbeddedActionsParser`, AST trực tiếp (OQ-101):**
```ts
export interface ParseResult { ast: SclFile; diagnostics: Diagnostic[]; }
export function parseScl(source: string, fileName: string): ParseResult;
```
Chọn `EmbeddedActionsParser` (action trả AST node ngay) thay vì `CstParser` + visitor (thêm một lượt CST→AST, phải map vị trí thủ công). `recoveryEnabled: true`. Rule theo đúng EBNF §4.2: `file { block }`; `block = ob | fc | fb | udt | db`; `var_section` 6 loại + `END_VAR`; `var_decl = ident ":" type [":=" const_expr] ";"` (const_expr parse như `expr` thường — tính hằng kiểm ở P1.3, OQ-094); `type` 4 dạng; `stmt` 11 dạng (kể cả `";"` rỗng); `if/case/for/while/repeat` đúng từ khóa kết thúc + `;` cuối; `call` = callee + `args` + `;` (callee là ref hoặc ident — OQ-100); `args` 3 dạng (`:=`, `=>`, positional). Ưu tiên theo bảng §4.3 bằng rule lồng nhau: `or → xor → and → eq → rel → add → mul → unary → power → primary`, trong đó `power = primary [ "**" unary ]` (kết hợp phải — OQ-092) và `unary = ("+"|"-"|"NOT")* power` (nên `-2 ** 2` = `-(2 ** 2)`, `2 ** -3` vẫn parse được). Phân biệt assign/call: sau `ref` có thể là `:=` (assign) hoặc `(` (call) — dùng `$.BACKTRACK` trên nhánh assign (thử parse lvalue + `:=`, thất bại thì backtrack sang nhánh call); không dùng lookahead 1 token vì lvalue có path dài (`#a.b[1] := ...` thì `:=` ở xa hơn token thứ 2). Địa chỉ tuyệt đối: token `AbsAddress` chuyển qua `parseAddress` (P1.1); `parseAddress` throw → Diagnostic SCL-P002 nêu text gốc (vd `DB0.DBW0`). `EXIT`/`CONTINUE` ngoài vòng lặp, `RETURN` ở đâu, positional cho FB, FC không trả giá trị gọi như statement — parser **chấp nhận hết** (kiểm ngữ nghĩa là P1.3, §4.4). **Phục hồi lỗi (§4.4):** lỗi ở một statement không dừng parse — ghi Diagnostic rồi đồng bộ (bỏ qua token) tới `;` hoặc từ khóa kết thúc block (`END_IF`/`END_FOR`/`END_WHILE`/`END_REPEAT`/`END_CASE`/`END_<BLOCK>`) rồi parse statement tiếp theo; tối đa **100** diagnostics, vượt thì dừng và thêm 1 diagnostic SCL-P003 (OQ-095). `parseScl` luôn trả AST **từng phần** + diagnostics khi có lỗi (OQ-099); P1.3 từ chối lower khi diagnostics chứa lỗi (ghi làm bàn giao, không cài ở P1.2). Map lỗi Chevrotain → Diagnostic: lỗi thiếu `;` (token kỳ vọng là `;`) → **SCL-P001 tại vị trí token trước đó** (đúng ghi chú §4.2 — dùng `previousToken` của lỗi Chevrotain); các lỗi khớp token khác → **SCL-P002 tại token lỗi** kèm "expected X"; lỗi lexer → **SCL-L001**; cấu trúc chưa hỗ trợ (`String`, ...) → **SCL-U001**. Chi tiết API đồng bộ token của Chevrotain xác nhận bằng spike nhỏ ở đầu triển khai (parse thử 1 file có 2 lỗi) trước khi viết grammar đầy đủ — nếu API không cho phép thì dùng chiến lược dự phòng: `recoveryEnabled` mặc định của Chevrotain + test phục hồi quyết định (OQ-101).
4. **Mã chẩn đoán (A8/D6) — đăng ký trước khi dùng:**
```ts
// packages/schemas/src/diagnostics-catalog.ts — thêm SCL_CATALOG
'SCL-L001': { severity: 'error', title: 'Lỗi từ vựng SCL', hint: 'Kiểm tra ký tự tại vị trí đã báo; đóng comment (* *) và dấu nháy "...".' }
'SCL-P001': { severity: 'error', title: 'Thiếu \';\' cuối statement', hint: 'Thêm \';\' cuối statement tại vị trí đã báo.' }
'SCL-P002': { severity: 'error', title: 'Lỗi cú pháp SCL', hint: 'Sửa theo "expected ..." tại vị trí đã báo.' }
'SCL-P003': { severity: 'error', title: 'Quá nhiều lỗi cú pháp (tối đa 100)', hint: 'Sửa 100 lỗi đầu đã báo rồi biên dịch lại.' }
'SCL-U001': { severity: 'error', title: 'Cấu trúc SCL chưa hỗ trợ', hint: 'Dùng cấu trúc trong phạm vi M1 (xem M1 §4.2 và Phụ lục A); String không hỗ trợ.' }
```
`scripts/gen-diagnostics.ts` gộp `PRJ_CATALOG` + `SCL_CATALOG` (hiện chỉ quét PRJ — sửa 2 chỗ: vòng sinh + hàm kiểm mã chưa đăng ký); chạy `pnpm docs:diagnostics` sinh lại `docs/diagnostics.md` (24 → 29 mã); `docs:diagnostics --check` phải khớp ở gate.

**Đã loại:** (1) `CstParser` + visitor — thêm lượt chuyển đổi không cần thiết (OQ-101). (2) Viết lexer/parser tay (recursive descent) — spec §17 chỉ định Chevrotain. (3) ANTLR — spec §17 cấm rõ. (4) In lại AST (printer `print(ast)`) — không có trong PROMPTS P1.2; property test lexer không cần printer. (5) Typecheck/lower/IR/`compileScl`/`vcs ir dump` — P1.3. (6) `compileProject` đọc file `plc/*.scl` — P1.7 (P1.2 chỉ parse text đã nạp). (7) Script spike S1 — chạy khi có mã thật (X-002), không thuộc P1.2. (8) ADR mới — Chevrotain do M1 §17 chỉ định, không phải quyết định kiến trúc của P1.2; chỉ ghi version pin + lý do vào plan này. (9) Sửa EBNF §4.2 — các khoảng trống ghi OQ, không sửa spec.

**Bảng tính tay A — lexer: token của một OB mẫu (tính tay, không chạy code):**

Nguồn mẫu (dùng nguyên văn làm fixture test):
```
ORGANIZATION_BLOCK "Main"
VAR_TEMP
  x : Int := 5;
END_VAR
BEGIN
  #x := #x + 16#FF;
  IF #x > 10 THEN
    %Q0.0 := TRUE;
  END_IF;
END_ORGANIZATION_BLOCK
```

| Dòng | Token (theo thứ tự) | Vị trí (dòng, cột, dài) |
|---|---|---|
| 1 | `ORGANIZATION_BLOCK`, `"Main"` | (1,1,18), (1,20,6) |
| 2 | `VAR_TEMP` | (2,1,8) |
| 3 | `x`, `:`, `Int`, `:=`, `5`, `;` | (3,3,1), (3,5,1), (3,7,3), (3,11,2), (3,14,1), (3,15,1) |
| 4 | `END_VAR` | (4,1,7) |
| 5 | `BEGIN` | (5,1,5) |
| 6 | `#x`, `:=`, `#x`, `+`, `16#FF`, `;` | (6,3,2), (6,6,2), (6,9,2), (6,12,1), (6,14,5), (6,19,1) |
| 7 | `IF`, `#x`, `>`, `10`, `THEN` | (7,3,2), (7,6,2), (7,9,1), (7,11,2), (7,14,4) |
| 8 | `%Q0.0`, `:=`, `TRUE`, `;` | (8,5,5), (8,11,2), (8,14,4), (8,18,1) |
| 9 | `END_IF`, `;` | (9,3,6), (9,9,1) |
| 10 | `END_ORGANIZATION_BLOCK` | (10,1,22) |

Kiểm: `ORGANIZATION_BLOCK` = 18 ký tự; `"Main"` bắt đầu cột 20 (sau 1 khoảng trắng ở cột 19); `16#FF` dài 5; `%Q0.0` dài 5. Comment/khoảng trắng không thành token: `// ...` tới hết dòng; `(* ... *)` tới `*)` đầu tiên.

**Bảng tính tay A2 — giá trị literal (tính tay):** `123` → 123; `16#FF` → 255; `2#1010_0101` → 165 (128+32+4+1); `8#17` → 15 (8+7); `1.5` → 1.5; `3.0E-2` → 0.03; `1e3` → 1000; `TRUE`/`FALSE` → true/false; `T#5s` → 5000 ms; `T#1h30m` → 5400000 ms (3600000+1800000); `T#500ms` → 500; `T#-2s` → -2000; `TIME#2s` → 2000; `INT#5` → {5, Int}; `REAL#1.0` → {1, Real}; `DINT#-1` → {-1, DInt}; `WORD#16#FFFF` → {65535, Word}; `2#2` → SCL-L001 (chữ số 2 sai cơ số 2); `1..3` token hóa thành `1`, `..`, `3` (không phải Real `1.` — Real yêu cầu chữ số sau `.`).

**Bảng tính tay B — ưu tiên toán tử (§4.3): cây AST, gốc là toán tử nào (tính tay):**

| # | Biểu thức | Gốc AST | Cấu trúc |
|---|---|---|---|
| 1 | `a + b * c` | `+` | `+(a, *(b, c))` |
| 2 | `a * b + c * d` | `+` | `+(*(a, b), *(c, d))` |
| 3 | `NOT a AND b` | `AND` | `AND(NOT(a), b)` |
| 4 | `a AND b OR c AND d` | `OR` | `OR(AND(a, b), AND(c, d))` |
| 5 | `a OR b XOR c` | `OR` | `OR(a, XOR(b, c))` |
| 6 | `a = b AND c <> d` | `AND` | `AND(=(a, b), <>(c, d))` |
| 7 | `a < b = c` | `=` | `=(<(a, b), c)` |
| 8 | `-a + b` | `+` | `+(-(a), b)` |
| 9 | `-2 ** 2` | unary `-` | `-(2 ** 2)` = -4 (mũ chặt hơn unary) |
| 10 | `2 ** 3 ** 2` | `**` | `2 ** (3 ** 2)` = 512 (kết hợp phải — OQ-092) |
| 11 | `a + b - c` | `-` | `-(+(a, b), c)` (cùng mức, kết hợp trái) |
| 12 | `a / b MOD c` | `MOD` | `MOD(/(a, b), c)` (cùng mức, kết hợp trái) |
| 13 | `NOT NOT a` | `NOT` | `NOT(NOT(a))` |
| 14 | `(a + b) * c` | `*` | `*(+(a, b), c)` |
| 15 | `a AND b & c` | `AND` | `AND(AND(a, b), c)` (`&` = bí danh AND) |

**Bảng tính tay C — AST của một FB mẫu (tính tay, dạng rút gọn — `loc` lược, chỉ ghi kind/name/cấu trúc):**

Nguồn:
```
FUNCTION_BLOCK "FB_Motor"
VAR_INPUT
  iStart : Bool;
END_VAR
VAR_OUTPUT
  qRun : Bool;
END_VAR
BEGIN
  #qRun := #iStart;
END_FUNCTION_BLOCK
```

```json
{ "kind": "file", "blocks": [
  { "kind": "FB", "name": "FB_Motor",
    "varSections": [
      { "kind": "VAR_INPUT", "decls": [
        { "name": "iStart", "type": { "kind": "elementary", "name": "Bool" } } ] },
      { "kind": "VAR_OUTPUT", "decls": [
        { "name": "qRun", "type": { "kind": "elementary", "name": "Bool" } } ] } ],
    "body": [
      { "kind": "assign",
        "target": { "base": { "kind": "local", "name": "qRun" }, "path": [] },
        "value": { "kind": "ref",
          "ref": { "base": { "kind": "local", "name": "iStart" }, "path": [] } } } ] } ] }
```

Kiểm: 2 var_section (INPUT rồi OUTPUT); body 1 assign; target là local `#qRun` (không có path); value là ref `#iStart` bọc trong expr `ref`; không có `returnType` (FB không trả giá trị).

**Bảng tính tay D — lỗi + vị trí chính xác (tính tay):**

| # | Nguồn lỗi | Mã | Vị trí | Thông điệp / kỳ vọng |
|---|---|---|---|---|
| D1 | `#x := 5` thiếu `;` (dòng sau là `#y := 6;`) | SCL-P001 | (3,9) — token `5` | `expected ';'` tại token trước đó (đúng ghi chú §4.2) |
| D2 | `(* comment` không đóng (tới EOF) | SCL-L001 | (3,3) — vị trí `(*` | "comment không đóng" |
| D3 | `#x := 5 $ 3;` | SCL-L001 | (2,11) — ký tự `$` | ký tự không hợp lệ |
| D4 | `IF THEN` (thiếu điều kiện) | SCL-P002 | (2,6) — token `THEN` | `expected expression` |
| D5 | `s : String;` trong VAR | SCL-U001 | (2,7) — token `String` | kiểu String chưa hỗ trợ |
| D6 | `(* a (* b *) c *)` (comment lồng) | SCL-L001 | tại `*` của `*)` thừa | comment chỉ khớp tới `*)` đầu tiên (OQ-096) |
| D7a | `%X0.0` trong biểu thức | SCL-L001 | tại `%` | không có token địa chỉ nào khớp |
| D7b | `DB0.DBW0` trong biểu thức | SCL-P002 | tại token `DB0.DBW0` | `parseAddress` từ chối DB0 |
| D8 | Phục hồi: 2 statement lỗi xen 1 statement đúng — `#x := ;` (lỗi), `#y := 2;` (đúng), `#z := ;` (lỗi) | SCL-P002 × 2 | tại `;` sau `:=` mỗi dòng lỗi | 2 diagnostics; AST vẫn chứa assign `#y := 2;`; parse tiếp tục sau mỗi lỗi |
| D9 | `;` lẻ ở cấp file (sau `END_ORGANIZATION_BLOCK`) | SCL-P002 | tại `;` | file chỉ chứa block, không có statement lẻ |
| D10 | Vượt 100 lỗi trong một file | SCL-P003 | cuối danh sách | đúng 100 diagnostics lỗi + 1 SCL-P003, parse dừng |

**Test (mục tiêu: ≥ 70 test mới; tổng ≥ 721 = 651 + 70):**

| Nhóm | File | Test mới (tên + kỳ vọng) |
|---|---|---|
| lexer (~21) | `packages/vendor-siemens/src/scl/lexer.test.ts` | Bảng A: toàn bộ token + vị trí của OB mẫu (1 test assert deep-equal cả stream, hoặc 1 test/dòng); bảng A2: mỗi literal 1 case (giá trị đúng + `2#2` → SCL-L001); `1..3` → `1`,`..`,`3`; comment `//` + `(* *)` bị bỏ qua (không thành token); comment không đóng → SCL-L001 (D2); ký tự lạ `$` → SCL-L001 (D3); từ khóa không phân biệt hoa/thường (`if`, `If`, `IF` cùng token type; `"Main"` giữ nguyên case); property (fast-check, seed cố định): nối `image` của token = nguồn đã bỏ khoảng trắng/comment |
| parse hợp lệ (~45, gồm bảng B 15 + C) | `packages/vendor-siemens/src/scl/parser.test.ts` | Bảng B: 15 case ưu tiên (assert gốc AST + cấu trúc); bảng C: FB mẫu assert deep-equal AST (trừ `loc` — assert riêng `loc` của 2–3 node: block name, assign, literal); 5 loại block (OB/FC/FB/UDT/DB — mỗi loại ≥ 1 case, gồm FC có/không return type, DB dạng `"fbname"` và dạng STRUCT + BEGIN init); 6 var_section (mỗi loại ≥ 1); type: Array 1 chiều, struct nội tuyến, named; statement: assign (member `.` + index `[]`), IF/ELSIF/ELSE, CASE (label đơn + khoảng `..` + kết hợp `,`), FOR (có/không BY), WHILE, REPEAT, EXIT/CONTINUE/RETURN, call FB (`#sT(IN := #x, PT := T#3s)`), call FC trong biểu thức (`#r := "FC_Scale"(x := #a)`), `Q => #y`, positional arg, statement `;` rỗng, địa chỉ tuyệt đối `%I0.0`/`DB1.DBW4` trong lvalue |
| lỗi (~15, gồm bảng D) | `packages/vendor-siemens/src/scl/parser.test.ts` | D1–D10 (mỗi dòng 1–2 test: mã + line/col chính xác); thiếu `END_IF` → SCL-P002 tại EOF; ngoặc không đóng → SCL-P002; `String` → SCL-U001 (D5); `DB0.DBW0` → SCL-P002 (D7b); phục hồi D8: 2 diagnostics + AST chứa statement đúng; vượt 100 lỗi → 100 + SCL-P003 (D10) |
| diagnostics | `packages/schemas/src/diagnostics-catalog.test.ts` (nếu có) + `tests/gen-diagnostics.test.ts` | 5 mã SCL-* đăng ký trong catalog; `docs:diagnostics --check` khớp sau khi sinh lại (24 → 29 mã); mã SCL dùng trong parser đều có trong catalog (không mã lạ) |

**Mơ hồ (phân loại):** **Tier A (tự quyết):** chọn `EmbeddedActionsParser` (OQ-101 ghi lý do); tên hàm/API `parseScl`/`tokenizeScl`/`parseLiteralValue` + tên node AST như mục thiết kế; `SclToken` là dữ liệu thuần map từ `IToken`; thứ tự triển khai (lexer → ast → parser → diagnostics → test lỗi); test dùng `it.each` với bảng case dùng chung cho bảng A/B/D. **Tier B (mặc định + ghi OQ):** OQ-092 (`**` kết hợp phải), OQ-093 (`init` DB = `lvalue ":=" const_expr ";"`), OQ-094 (`const_expr` parse như `expr`, tính hằng kiểm ở P1.3), OQ-095 (bộ mã SCL-L001/P001/P002/P003/U001 + cách map từ lỗi Chevrotain), OQ-096 (comment lồng: khớp tới `*)` đầu tiên), OQ-097 (time literal đơn vị lạ → SCL-L001), OQ-098 (`#name` giữ dạng viết, so sánh không phân biệt hoa/thường ở P1.3), OQ-099 (`parseScl` trả AST từng phần + diagnostics; P1.3 từ chối lower khi có lỗi), OQ-100 (dạng callee của call statement/expression + positional chấp nhận ở parser), OQ-101 (recovery = `recoveryEnabled` + đồng bộ thủ công, spike-check API đầu triển khai), OQ-102 (`String`/`WString` → SCL-U001), OQ-103 (tên block chấp nhận ident trần hoặc `"..."`), OQ-104 (struct nội tuyến trong `type` có thân `{ var_decl }`). **Tier C (không chặn P1.2, đã ghi ở OWNER-INBOX):** OQ-105 (X-002/S1 — mã SCL thật chưa có; P1.2 làm theo EBNF, không chờ; khi có mã thật thì chạy S1, kết quả có thể sinh SCR điều chỉnh grammar — follow-up, không thuộc P1.2). Nếu khi triển khai phát hiện EBNF thiếu cấu trúc mà chỉ mã thật mới có → **không tự mở rộng grammar**, ghi OQ/SCR.

**Rủi ro + cách kiểm:** (1) X-002/S1 chưa có: EBNF có thể thiếu cấu trúc mà mã thật dùng nhiều (vd `POINTER`, `ANY`, mảng nhiều chiều, `ENO`) — giảm thiểu: parser báo SCL-U001 rõ ràng cho cấu trúc chưa hỗ trợ (không chạy sai im lặng); khi S1 chạy xong, top-10 thiếu sẽ thành SCR điều chỉnh phạm vi (P1.7 hoặc milestone sau). (2) API recovery của Chevrotain không cho đồng bộ mức statement như thiết kế — giảm thiểu: spike-check ở đầu triển khai (OQ-101); nếu không được thì dùng `recoveryEnabled` mặc định + test phục hồi quyết định, ghi rõ giới hạn vào STATE §17. (3) Chevrotain 13 ESM không khớp `moduleResolution: bundler`/vitest — giảm thiểu: smoke test import Chevrotain ở đầu triển khai (trước khi viết grammar); nếu lỗi thì dừng, báo nguyên nhân (không tự đổi bundler/tsconfig — đó là quyết định kiến trúc, tầng C). (4) `**` kết hợp phải (OQ-092) lệch TIA — giảm thiểu: test ghim mặc định; xác minh bằng đoạn SCL thật khi có (S1) hoặc PLCSIM, sửa parser + test nếu khác (ghi SCR nếu spec đổi). (5) Lỗi `previousToken` của Chevrotain không trỏ đúng token cho SCL-P001 — giảm thiểu: test D1 ghim vị trí; nếu API khác thì tự tính token trước đó từ token stream (lexer trả đủ token + offset).

**Ngoài phạm vi:** typecheck (`typecheck.ts`), lower AST→IR (`lower.ts`), `ir.ts`, `compileScl`/`compileProject`, `vcs ir dump` (P1.3); interpreter/scheduler/`SoftPlc`/force/snapshot (P1.4); std blocks (P1.5); LAD (P1.6); golden runner YAML + demo `motor-interlock` + UI + bench M1 §12.4 (P1.7); `project.ts` đọc file `plc/*.scl` (P1.7); script spike S1 (chạy khi có mã thật); sửa EBNF §4.2 / M1 §4.4; đổi `.dependency-cruiser.cjs` / `eslint.config.js` / root `tsconfig.json` / `vitest.config.ts` (ngưỡng vendor-siemens 85 đã có từ OQ-088); ADR mới; mã diagnostic ngoài 5 mã SCL; `docs/facts/` mới; P0.9 PWA.

**Gate P1.2 (triển khai):** `lint && typecheck && depcheck && test && test:e2e && review:cheats && docs:diagnostics --check` + `build` + bench guard (`pnpm bench`: TagDB 4/4 PASS + orchestrator ≥ 100 000 bước/s — P1.2 không chạm đường nóng bench; rớt > 20% so với baseline thì dừng điều tra, không hạ ngưỡng) + CI (check + test ubuntu/windows + e2e ubuntu) xanh. Tổng test sau P1.2: **≥ 721**. `pnpm-lock.yaml` chỉ thêm `chevrotain` + 5 gói `@chevrotain/*` (không đổi version khác — diff khác là cờ đỏ, dừng kiểm tra). `pnpm install` trong VM vẫn EPERM (OQ-007) — triển khai làm ở bản sao `/tmp` như các prompt trước, cài thật `--frozen-lockfile` (dùng `git archive` để copy, không `cp -r` cả cây kèm `node_modules` — bài học ENOSPC ở P0.8).

## Kết quả triển khai P1.2 (2026-11-25, xong local — CHƯA mở PR)

**Triển khai ở bản sao `/tmp/vcs-p12`** (git archive từ HEAD `b17d4cc`, cài thật
`pnpm install --frozen-lockfile` exit 0; chevrotain cài bằng
`pnpm --filter @vcs/vendor-siemens add chevrotain@13.2.0 --save-exact`).
**Gate xanh toàn bộ ở bản sao:** lint 0 lỗi/0 warning; typecheck 0; depcheck
sạch (92 module, 151 dep); **test 746/746 (42 file) — mới +95** (lexer 32,
parser 57, diagnostics 6: catalog 4 + gen-diagnostics 2); coverage dòng
kernel 97.84 / schemas 95.98 / project 97.83 / runtime-iec 97.12 /
vendor-siemens 97.01 (ngưỡng 85/85/80/85/85 — đều đạt; riêng `scl/` 91.55
dòng); review:cheats SẠCH (124 file); `docs:diagnostics --check` khớp
(29 mã); build 3/3; bench TagDB 4/4 PASS (set/get 46.6M ops/s) +
orchestrator 480,893 bước/s PASS; test:e2e 5/5 (11.8 s); regression script
exit 0 (1 warning nhiễu sub-ms: flushChangesMs 0.063→0.09 ms, ngưỡng 1 ms —
hiện tượng đã ghi ở P0.7 §14, không fail). Lockfile chỉ thêm `chevrotain` +
5 gói `@chevrotain/*` 13.2.0, không đổi version khác (đã diff). Tổng test
**746 ≥ 721** (mục tiêu ≥ 70 mới: đạt 95).

**Lệch so với plan (ghi rõ, không sửa plan ngược):**
1. **Chevrotain 13 không có `ignoreCase`** trong `ITokenConfig` (kiểm từ
   `.d.ts` đã cài) — từ khóa dùng regex flag `i`. (Plan §17 ghi "spike-check
   `ignoreCase`" — API này không tồn tại.)
2. **Lexer Chevrotain là first-match theo thứ tự khai báo, KHÔNG phải
   longest-match** (đọc `tokenizeInternal` trong `lexer_public.ts`; chỉ
   `longer_alt` mới thay token đã khớp bằng token dài hơn). Plan ghi
   "longest-match" là sai. Hệ quả bắt buộc: `LineComment` trước `Slash`
   (không thì `// abc` thành `/`,`/`,`abc`); `RealLiteral` trước `IntLiteral`
   (không thì `1.5` thành `1`,`.`,`5` và `1e3` thành `1`,`e3`); mọi từ khóa +
   `BoolLiteral` có `longer_alt: Identifier` (không thì `IFX` thành `IF`+`X`).
   Đã probe xác nhận 3 bug rồi sửa; comment trong `lexer.ts` ghi rõ quy tắc
   thứ tự. `docs/semantics.md` §13 ghi VERIFIED.
3. **`DIAGNOSTIC_CODE_RE` mở rộng `-[EW]` → `-[ELPWU]`** — nếu không, scan
   mã chưa đăng ký của `gen-diagnostics.ts` bỏ qua lặng lẽ mã SCL
   (regex cũ không khớp `-L/-P/-U`). Kèm test `scanCodes` tìm được
   `SCL-P002`/`SCL-L001`.
4. **Giới hạn 100 diagnostics cắt sau khi parse xong** (`capDiagnostics`:
   giữ 100 đầu + thêm SCL-P003), không dừng sớm giữa chừng — dừng sớm làm
   block không đóng được và `file()` trả `undefined` (đã gặp khi thử, D10
   crash). `addDiag` vẫn chặn diagnostic thủ công khi đủ 100.
5. **D6 test dùng nguồn sạch** `(* outer (* inner *) *)` (1 SCL-L001 tại
   (3,24)); bản plan `(* a (* b *) c *)` còn tạo thêm P002 từ ident `c` thừa
   sau `*)` đầu tiên — hành vi đúng, không phải bug, ghi trong test.
6. **Vị trí D3/D4/D5/D7a/D9 trong test parser lệch plan** vì nguồn test có
   wrapper OB+BEGIN (+1 dòng) và khoảng trắng khác: D3 `$` (3,9) thay vì
   (2,11); D4 `THEN` (3,6) thay vì (2,6); D5 `String` (3,7) thay vì (2,7);
   D7a `%` (3,3); D9 `;` thừa ở (4,23) — ngay sau `END_ORGANIZATION_BLOCK`
   cùng dòng, không phải (4,1). D2 sort theo vị trí nên P002 (2,6) đứng
   trước L001 (3,3). Thiếu `END_IF`: P002 tại `END_ORGANIZATION_BLOCK`
   (5,1) — token lỗi là token đó, không phải EOF (EOF chỉ khi OB cũng không
   đóng; khi đó vị trí = cuối token thật cuối).
7. **2 bug parser tìm ra khi viết test (đã sửa code, không sửa kỳ vọng):**
   (a) `dbBlock` dạng STRUCT thiếu `;` sau `END_STRUCT` (UDT có, DB không)
   → P002 tại `;`; đã thêm `CONSUME(Semicolon)` như UDT. (b) rule `type`
   không chấp nhận kiểu named dạng `"UDT_Motor"` (chỉ Array/Struct/ident)
   → P002; đã thêm alternative `GlobalVar` → `named` (bỏ ngoặc kép).
8. **3 lỗi lint/typecheck khi chạy gate (đã sửa):** `toSclP002` check
   `token === undefined` thừa (type `IToken` không undefined — bỏ);
   `Object.values(SclTokens) as TokenType[]` assertion thừa (bỏ);
   `endTok` trong `udtBlock` gán mà không dùng (bỏ biến); helper `exprShape`
   trong test chạm `.name` trên `SclRef` abs (dùng `refShape` cho callee
   dạng ref); sort test dùng `!` (đổi sang object `{line, col}` + `?? 0`).

**OQ-092…104 đóng** (đã áp dụng ở P1.2, ghi ở open-questions.md).
**OQ-105 vẫn mở** (tier C, X-002/S1 chờ mã thật — quyết định "không chờ"
đã áp dụng; S1 chạy khi có mã thật, kết quả có thể sinh SCR).

**Đề xuất follow-up (không làm trong P1.2):** (i) `check-bench-regression.mjs`
cảnh báo nhiễu trên metric sub-ms (flushChangesMs) — thêm ngưỡng tuyệt đối
như đã ghi ở P0.7 §14. (ii) `#fb(...)` ở vị trí biểu thức cho SCL-P001 —
hành vi đúng theo OQ-100, nhưng thông điệp có thể rõ hơn ở P1.3 (ghi "FB
call không phải expression").

## 18. Kế hoạch P1.3 — Typecheck + lower AST→IR + `vcs ir dump` (plan-first, 2026-11-25)

**Điểm xuất phát:** P1.2 **đã merge PR #21** (merge commit `278e3af`, develop head `278e3af` — parent xác minh qua MCP read, `merged_at` 2026-11-24T22:12:54Z tức 2026-11-25 05:12 +07; CI 8 successful + 2 skipped). Tổng test hiện tại **746/746** (42 file). Diagnostic: **29 mã**. PROMPTS P1.3 nguyên văn: "Làm P1.3 theo AGENTS.md §9 (plan-first). Đọc: … → AMENDMENTS (A8) → M1 §4.4, 6. Nhiệm vụ: typecheck.ts (widening ngầm định; thu hẹp phải tường minh), lower.ts (AST → IR cây có kiểu, serializable JSON), CLI vcs ir dump. Diagnostic dùng bản chuẩn ở @vcs/schemas. Gate: ≥ 20 test kiểu; IR dump JSON ổn định (golden)."

**Hiểu biết (tóm tắt):** (1) P1.3 là tầng ngữ nghĩa đầu tiên đứng trên AST của P1.2: typecheck sai thì IR sai, interpreter P1.4 chạy sai mà "trông có vẻ đúng" — nên bảng tính tay (lattice widening, kết quả nhị phân, IR JSON, vị trí lỗi) phải tự tính trước, không sao chép từ implementation. (2) Spec cho đủ quy tắc: §4.4 (widening ngầm định, thu hẹp phải tường minh, kiểu kết quả, kiểm tra phải làm) + §6 (hình IR) + §10 (`compileScl`) + §7.1/§7.2/§7.3 (quy tắc runtime mà typecheck/lower phải chuẩn bị: TEMP warning, đệ quy SCL-S020, intrinsic) — các khoảng trống là: IR dùng `Map` nhưng phải serializable JSON; `SrcMap`/`SrcRef`/`IrDb`/`IrUdt`/`IrObBinding`/`IrInterface`/`PrimitiveType`/`BinFn` không được định nghĩa; chỉ có 1 mã lỗi được nêu tên (SCL-T010); diễn giải kiểu của địa chỉ tuyệt đối trần; FC trả giá trị bằng cách nào; OB ánh xạ sang số OB ra sao; system FB (TON…) ở P1.3 chưa có layout — tất cả mặc định tier B + OQ, không hỏi trước. (3) Ràng buộc đồ thị phụ thuộc (`.dependency-cruiser.cjs`) quyết định vị trí file: `runtime-iec` chỉ được import schemas/kernel/runtime-iec; `vendor-siemens` được import schemas/runtime-iec/vendor-siemens; interpreter P1.4 nằm ở `runtime-iec` nên **không thể import vendor-siemens** → kiểu IR phải nằm ở `runtime-iec/src/ir.ts`, còn typecheck/lower/compile nằm ở `vendor-siemens/src/scl/` và import IR từ runtime-iec. (4) `apps/cli` chưa phụ thuộc `@vcs/vendor-siemens`/`@vcs/runtime-iec` — `vcs ir dump` cần thêm `@vcs/vendor-siemens: workspace:*` vào `apps/cli/package.json` + sinh lại lockfile bằng `pnpm install` thật ở `/tmp` (link workspace, không đổi version khác). (5) X-002/S1 vẫn mở — P1.3 **không chờ** (xem OQ-121): typecheck/lower theo spec §4.4/§6, không theo mã thật; strict là mặc định của spec, S1/PLCSIM sau này chỉ có thể nới lỏng qua SCR. (6) Hạ tầng đã sẵn: `parseScl` trả `{ ast, diagnostics }` (OQ-099 — P1.3 từ chối lower khi diagnostics chứa lỗi); `layoutStruct` (P1.1) nhận `FieldType` trung lập — P1.3 map `SclType` → `FieldType`; `TYPE_INFO`/`isIntegerType`/`isFloatType`/`isBitStringType` (P1.1); `DIAGNOSTIC_CODE_RE` hiện `-[ELPWU]` — phải mở rộng thêm `T`/`S` nếu không scan mã mới sẽ bỏ qua lặng lẽ (bài học P1.2 #3); ngưỡng coverage 85 dòng đã có cho cả runtime-iec và vendor-siemens (OQ-088); `formatDiagnostic` ở schemas.

**Phạm vi (PROMPTS P1.3; M1 §4.4, §6, §7.1–§7.3, §10, §12.1–§12.2; AMENDMENTS A8, D6; M1 §17):**

| File | Nội dung |
|---|---|
| `packages/runtime-iec/src/ir.ts` | Kiểu IR (mục 1 thiết kế): `IrProgram`, `IrBlock`, `IrStmt`, `IrExpr`, `IrLValue`, `IrType`, `PrimitiveType`, `BinFn`, `IrInterface`, `IrVar`, `IrField`, `IrDb`, `IrUdt`, `IrObBinding`, `SrcRef` |
| `packages/runtime-iec/src/index.ts` | Export các kiểu IR |
| `packages/vendor-siemens/src/scl/typecheck.ts` | Đại số kiểu (lattice widening, kiểu kết quả) + kiểm tra (scope, const eval, definite-assignment TEMP, call graph đệ quy) + `typecheckFile` |
| `packages/vendor-siemens/src/scl/lower.ts` | `lowerFile`: AST đã typecheck → `IrProgram` (chèn `convert`, fold `VAR_CONSTANT`, ánh xạ call) |
| `packages/vendor-siemens/src/scl/compile.ts` | `compileScl` (chữ ký M1 §10), `compileSclProgram`, `CompileContext`, `irToJson` (stable stringify) |
| `packages/vendor-siemens/src/scl/typecheck.test.ts` | Test typecheck (bảng A + C + D) |
| `packages/vendor-siemens/src/scl/lower.test.ts` | Test lower (bảng B + D) |
| `packages/vendor-siemens/src/scl/compile.test.ts` | Test compile + golden `irToJson` (bảng E) |
| `packages/vendor-siemens/src/scl/golden/*.json` | 3 golden IR dump: `fb-motor.json`, `fc-scale.json`, `db-motor.json` (bảng B + E) |
| `packages/vendor-siemens/src/index.ts` | Export `compileScl`, `compileSclProgram`, `typecheckFile`, `lowerFile`, kiểu IR (re-export từ runtime-iec) |
| `packages/schemas/src/diagnostics-catalog.ts` | Thêm 13 mã: SCL-T001…T011, SCL-S020, SCL-W001 (OQ-107); `DIAGNOSTIC_CODE_RE` mở rộng `-[ELPWU]` → `-[ELPSTWU]` |
| `docs/diagnostics.md` | Sinh lại bằng script (29 → 42 mã) — không sửa tay |
| `apps/cli/package.json` + `pnpm-lock.yaml` | Thêm dep `@vcs/vendor-siemens: workspace:*` cho CLI (lockfile sinh lại bằng `pnpm install` thật ở `/tmp` — chỉ thêm link workspace) |
| `apps/cli/src/commands/ir.ts` | Lệnh `vcs ir dump <file.scl> [--out <file>]` (mục 6 thiết kế) |
| `apps/cli/src/commands/index.ts` | Đăng ký lệnh `ir` |
| `apps/cli/src/commands/ir.test.ts` | Test CLI (exit code + stdout JSON) |
| `docs/semantics.md` | Thêm §14: quyết định typecheck/lower/IR, mỗi điểm gắn `VERIFIED`/`UNVERIFIED` |
| `docs/STATE.md`, `docs/open-questions.md` | Plan này (§18) + OQ-106…126 |

**Thiết kế nhỏ nhất (từng mục — signature chính xác, chỗ KHÔNG làm):**

1. **`ir.ts` (M1 §6) — kiểu IR thuần (plain object, serializable JSON), mọi `IrStmt`/`IrBlock` có `src`.** Quyết định nền (OQ-106): `IrProgram` dùng **mảng** (`blocks: IrBlock[]`, `dbs: IrDb[]`, `udts: IrUdt[]`, `organization: IrObBinding[]`), sắp xếp theo `id`/`name`/`ob` để dump tất định — spec §6 phác `Map` nhưng đồng thời yêu cầu serializable JSON (`Map` stringify thành `{}`); interpreter P1.4 tự build index `Map` một lần lúc nạp. Struct type inline field (không tham chiếu tên UDT) để interpreter không cần tra cứu; `IrProgram.udts` giữ định nghĩa chuẩn.
```ts
export type PrimitiveType = Exclude<DataType, 'String'>; // String không hỗ trợ ở M1
export type IrType =
  | PrimitiveType
  | { kind: 'array'; elem: IrType; lo: number; hi: number }
  | { kind: 'struct'; name?: string; fields: IrField[] };
export interface IrField {
  name: string; type: IrType;
  byteOffset: number; bitOffset?: number;
  size: number; // byte, trừ Bool = 1 (bit) — cùng quy ước layout.ts FieldInfo (P1.1)
  init?: number | boolean; // chỉ dùng cho field DB có giá trị khởi tạo (bảng D-c)
}
export interface IrVar { name: string; type: IrType; init?: number | boolean; }
export interface IrInterface {
  input: IrVar[]; output: IrVar[]; inout: IrVar[]; static: IrVar[]; temp: IrVar[];
  returnType?: IrType; // chỉ FC
}
export interface SrcRef { file: string; line: number; col: number; endLine: number; endCol: number; }
// SrcMap trong spec §6 = SrcRef (cùng hình: vị trí block/statement); không định nghĩa riêng.
export interface IrBlock {
  id: string; kind: 'OB' | 'FC' | 'FB'; name: string; number?: number; // number: số OB (OQ-113); FC/FB không có số trong nguồn → undefined
  interface: IrInterface; body: IrStmt[]; src?: SrcRef;
}
export interface IrDb { id: string; name: string; fbName?: string; fields: IrField[]; size: number; }
export interface IrUdt { id: string; name: string; fields: IrField[]; size: number; }
export interface IrObBinding { ob: number; block: string; cycleMs?: number; }
export interface IrProgram { blocks: IrBlock[]; dbs: IrDb[]; udts: IrUdt[]; organization: IrObBinding[]; }
export type BinFn = 'add' | 'sub' | 'mul' | 'div' | 'mod'
  | 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge' | 'and' | 'or' | 'xor';
export type IrExpr =
  | { op: 'const'; type: IrType; value: number | boolean }
  | { op: 'load'; type: IrType; ref: IrLValue }
  | { op: 'unary'; fn: 'neg' | 'not' | 'bnot'; type: IrType; a: IrExpr }
  | { op: 'binary'; fn: BinFn; type: IrType; a: IrExpr; b: IrExpr }
  | { op: 'convert'; from: IrType; to: IrType; a: IrExpr; mode?: 'round' | 'trunc' }
  | { op: 'intrinsic'; fn: string; type: IrType; args: IrExpr[] }
  | { op: 'callFcExpr'; block: string; args: [string, IrExpr][]; type: IrType };
export type IrLValue =
  | { k: 'local'; name: string }
  | { k: 'static'; path: string[] }
  | { k: 'dbField'; db: string; path: string[] }
  | { k: 'abs'; area: 'I' | 'Q' | 'M'; byte: number; bit?: number; width: 8 | 16 | 32 | 64; type: PrimitiveType }
  | { k: 'absDb'; db: number; byte: number; bit?: number; width: 8 | 16 | 32 | 64; type: PrimitiveType }
  | { k: 'index'; base: IrLValue; index: IrExpr };
export type IrStmt =
  | { op: 'assign'; target: IrLValue; value: IrExpr; src?: SrcRef }
  | { op: 'if'; cond: IrExpr; then: IrStmt[]; elsif: { cond: IrExpr; body: IrStmt[] }[]; else: IrStmt[]; src?: SrcRef }
  | { op: 'case'; sel: IrExpr; arms: { labels: (number | [number, number])[]; body: IrStmt[] }[]; else: IrStmt[]; src?: SrcRef }
  | { op: 'for'; var: string; from: IrExpr; to: IrExpr; by?: IrExpr; body: IrStmt[]; src?: SrcRef }
  | { op: 'while'; cond: IrExpr; body: IrStmt[]; src?: SrcRef }
  | { op: 'repeat'; body: IrStmt[]; until: IrExpr; src?: SrcRef }
  | { op: 'exit'; src?: SrcRef }
  | { op: 'continue'; src?: SrcRef }
  | { op: 'return'; src?: SrcRef }
  | { op: 'callFb'; instance: IrLValue; block: string; inArgs: [string, IrExpr][]; outArgs: [string, IrLValue][]; inoutArgs: [string, IrLValue][]; src?: SrcRef }
  | { op: 'callFc'; block: string; args: [string, IrExpr][]; ret?: IrLValue; src?: SrcRef }
  | { op: 'callSys'; fn: string; instance?: IrLValue; inArgs: [string, IrExpr][]; outArgs: [string, IrLValue][]; src?: SrcRef };
```
Quy tắc ghim: `IrExpr` **không** có `src` (spec §6 chỉ yêu cầu `src` trên `IrStmt` — lỗi ở biểu thức lấy vị trí từ AST lúc typecheck, không cần src trong IR); `**` không có trong `BinFn` — lower thành `intrinsic 'POWER'` (OQ-114); `elsif` là danh sách, không phải `if` lồng nhau (đọc "ELSIF lồng nhau" ở §6 theo nghĩa danh sách nhánh); `for.var` là tên string (lấy từ `ForStmt.var` là `SclLValue` — phải là local trần, không path, xem mục 2); `callFc.args` luôn là cặp `[tên, expr]` — arg positional của FC được lower đặt tên theo thứ tự khai báo (OQ-123).

2. **`typecheck.ts` — kiểm tra, không sửa AST.** `typecheckFile` trả bảng tra cứu kiểu (key là node AST, không mutate AST P1.2) để `lower` dùng lại — tránh nhân đôi logic suy luận kiểu:
```ts
export type Section = 'input' | 'output' | 'inout' | 'static' | 'temp' | 'const';
export interface SymbolInfo { name: string; section: Section; type: IrType; init?: number | boolean; fbType?: string; }
export interface BlockSymbols { blockId: string; vars: Map<string, SymbolInfo>; } // key = tên local lowercased (OQ-098)
export interface TypecheckResult {
  diagnostics: Diagnostic[];
  types: Map<SclExpr | SclLValue, IrType>; // kiểu đã phân giải của mọi expr/lvalue
  blocks: Map<string, BlockSymbols>;       // key = block id lowercased
  udts: Map<string, IrUdt>;                // key = tên UDT lowercased (OQ-119)
  dbs: Map<string, IrDb>;                  // key = tên DB lowercased
}
export function typecheckFile(file: SclFile, fileName: string, ctx: CompileContext): TypecheckResult;
// Hàm đại số kiểu thuần, export để lower dùng chung (không nhân đôi):
export function widen(from: PrimitiveType, to: PrimitiveType): boolean; // có cạnh widening trực tiếp/gián tiếp
export function commonType(a: IrType, b: IrType): IrType | undefined;    // LUB trong lattice, undefined = không có
export function binaryResultType(op: string, lt: IrType, rt: IrType): IrType | undefined;
export function unaryResultType(op: '+' | '-' | 'NOT', t: IrType): IrType | undefined;
export function evalConst(expr: SclExpr, scope: BlockSymbols): { value: number | boolean } | { error: string };
```
**Lattice widening (§4.4, chỉ đúng các cạnh liệt kê — không thêm):** `SInt→Int→DInt→Real→LReal`; `USInt→UInt→UDInt`; `Byte→Word→DWord`; `Real→LReal`. `Bool` không widening đi đâu; `Time` không widening sang `DInt`/`Real` (OQ-124). **Kiểu kết quả nhị phân:** `Int ∘ Int → Int` (không tự nâng lên DInt); hai vế widening về `commonType` rồi tính; `**` luôn `Real`/`LReal` (`Int ** Int → Real`); `/` và `DIV` trên số nguyên đều cắt về 0 (cùng `BinFn 'div'`); `MOD` chỉ số nguyên, dấu theo số bị chia; so sánh (`=`,`<>`,`<`,`>`,`<=`,`>=`) trả `Bool`; `AND`/`OR`/`XOR` trên `Bool` = logic, trên `Byte`/`Word`/`DWord` = bitwise (hai vế phải cùng họ sau widening); phép số học (`+`,`-`,`*`,`/`,`MOD`,`DIV`,`**`) chỉ trên số nguyên/số thực/`Time` — trên bit-string → SCL-T003 (spec không nói; mặc định an toàn, ghi ở OQ-107/T003); `=`/`<>` được trên mọi kiểu cùng họ (kể cả `Bool`, bit-string); `<`/`>`/`<=`/`>=` không được trên `Bool`/bit-string → SCL-T003. **Gán:** widening được → OK (lower chèn `convert`); thu hẹp trong họ hoặc chéo họ số/bit-string (`DInt→Int`, `Real→Int`, `Word→Int`, `Int→Word`, `DWord→DInt`…) → **SCL-T010** + hint hàm chuyển đổi; không liên quan (`Bool↔Int`, `Time↔Int`, struct/array sai) → **SCL-T002**. **Kiểm tra (§4.4, mỗi kiểm tra có mã + test bảng C):** tên chưa khai báo → T001; gán vào `VAR_INPUT` (FB/FC) hoặc `VAR_CONSTANT` → T006; gọi FB thiếu instance → T004; tham số không tồn tại / thừa / thiếu bắt buộc (FC) / sai kiểu → T004 (tham số FC có `init` là tùy chọn, không bắt buộc); truy cập member/index sai, chỉ số hằng ngoài khoảng → T005; `EXIT`/`CONTINUE` ngoài vòng lặp → T007; `RETURN` ở đâu cũng hợp lệ (thoát block hiện tại); FC không trả giá trị mà dùng trong biểu thức → T004; OB dùng làm callee → T004; khai báo trùng tên trong cùng scope → T009; `const_expr` không hằng (init `VAR`/`VAR_CONSTANT`, label CASE, init DB) → T008; UDT đệ quy → T011; tên kiểu không biết → T001. **Địa chỉ tuyệt đối (OQ-110):** load/store trần diễn giải mặc định theo width — bit→`Bool`, 8→`Byte`, 16→`Int`, 32→`DInt` (64 → `LReal` — `%MD` 64-bit không có trong P1.1, `width` 64 chỉ dành cho `LReal` qua DBD kép? Không — ghi rõ: width 64 chỉ xuất hiện khi type là `LReal` qua khai báo; load abs trần tối đa 32 bit → `DInt`); muốn diễn giải khác phải dùng hàm chuyển đổi tường minh (vd `DINT_TO_REAL(%MD0)`). **Hằng:** `evalConst` chỉ tính literal + unary/binary trên hằng + ref tới `VAR_CONSTANT` (đã tính trước); ref khác → lỗi T008. **`VAR_CONSTANT` ref được lower fold thành literal** (không có vùng nhớ runtime); không fold phép tính hằng (`5 * 2` giữ nguyên trong IR — IR trung thực với nguồn, P1.4 tính). **TEMP (OQ-120, M1 §7.1):** phân tích definite-assignment đơn giản — đọc `VAR_TEMP` trước khi gán trong cùng block → cảnh báo **SCL-W001** (severity `warning`, không làm fail compile); luật join: sau `IF`, biến chỉ "đã gán" nếu gán ở cả hai nhánh (hoặc trước đó); trong vòng lặp chỉ tính gán trước vòng lặp. **Đệ quy (OQ-122, M1 §7.1):** build call graph từ các call trong unit biên dịch + `ctx.blocks`; chu trình → **SCL-S020** tại callee gây chu trình (trực tiếp + gián tiếp); chỉ phát hiện trong phạm vi đã nạp, không quét toàn project. **System FB (OQ-111):** kiểu `TON`/`CTU`/`R_TRIG`/… trong `VAR` và call tới chúng → **SCL-U001** "system block chưa hỗ trợ (P1.5)" — chưa có layout std nên không thể kiểm tra arg; ồn ào, không im lặng. **FOR (OQ-117):** biến vòng lặp phải là local integer đã khai báo (`SInt`/`Int`/`DInt`/`USInt`/`UInt`/`UDInt`, không path); `from`/`to`/`by` widening về kiểu biến vòng lặp; `by` mặc định 1, được âm; **không** kiểm việc sửa biến vòng lặp trong thân (spec không nói — ghi rõ là không kiểm). **CASE (OQ-118):** selector phải integer (widening được); label phải hằng (không → T008), giá trị label trùng (kể cả trùng trong khoảng) → T005.
3. **`lower.ts` — AST + `TypecheckResult` → `IrProgram`, không kiểm tra lại kiểu (chỉ tra cứu).**
```ts
export function lowerFile(file: SclFile, checked: TypecheckResult, fileName: string): IrProgram;
```
Quy tắc: mỗi `SclType` → `IrType` qua `resolveType` (elementary chuẩn hóa case-insensitive về `DataType` — tên kiểu không biết đã bị T001 chặn ở typecheck; `named` → struct inline từ `checked.udts`; `array` → `{kind:'array', elem, lo, hi}`; `struct` nội tuyến → `{kind:'struct', fields}` qua `layoutStruct`); interface block lấy từ 6 `VarSection` (thứ tự khai báo giữ nguyên); `init` của `VarDecl` → `IrVar.init` (đã `evalConst` ở typecheck); `SclLValue` → `IrLValue`: local `#x` → `local` (tra `BlockSymbols`: nếu là instance FB → `static` với path; nếu là member của instance → `static` path `[fb, ...]`); `"DB".field` → `dbField`; `%I0.0`/`DB1.DBW4` → `abs`/`absDb` với `type` theo OQ-110; `base[index]` → `index` (chỉ số không hằng thì kiểm runtime ở P1.4, hằng ngoài khoảng đã bị T005 chặn). Biểu thức: literal → `const` (int literal mặc định `Int`; typed literal lấy `type` — `WORD#16#FFFF` → `Word`; time literal → `Time`, giá trị ms); ref → `load`; unary `+` bỏ (identity), `-` → `neg`, `NOT` trên `Bool` → `not`, trên bit-string → `bnot`; binary → `binary` với `fn` theo bảng (`+`→add, `-`→sub, `*`→mul, `/`/`DIV`→div, `MOD`→mod, `=`→eq, `<>`→ne, `<`→lt, `<=`→le, `>`→gt, `>=`→ge, `AND`/`&`→and, `OR`→or, `XOR`→xor) + chèn `convert` widening hai vế về `commonType`; `**` → `intrinsic 'POWER'` (OQ-114); call FC trong biểu thức → `callFcExpr`; call FC dạng statement → `callFc` (`ret` = target của `Q =>` nếu có, ngược lại undefined — FC có return type mà gọi dạng statement thì giá trị trả bị bỏ); call FB → `callFb` (instance từ callee: `#fb` → `local`, `"DB"` → `dbField` path `[]`; arg `:=` → `inArgs` nếu tham số là INPUT, `inoutArgs` nếu IN_OUT (giá trị phải là lvalue — không phải lvalue → T004); arg `=>` → `outArgs`; arg positional cho FB → đã bị T004 chặn ở typecheck; arg positional cho FC → đặt tên theo thứ tự khai báo, IN_OUT positional phải là lvalue); call system FB → không tới được lower (đã bị SCL-U001 chặn); intrinsic call (`ABS`/`SQRT`/…/`X_TO_Y`, OQ-115) → `convert` cho `REAL_TO_INT`/`ROUND` (mode `round`), `TRUNC` (mode `trunc`), `INT_TO_REAL`… (không mode, widening tường minh); `CEIL`/`FLOOR`/`ABS`/`SQRT`/`MIN`/`MAX`/`LIMIT`/`SHL`/`SHR`/`ROL`/`ROR`/`NORM_X`/`SCALE_X` → `intrinsic` với `fn` = tên gốc; `BOOL_TO_*` chỉ chấp nhận `BOOL_TO_INT`/`BOOL_TO_DINT`/`BOOL_TO_BYTE`/`BOOL_TO_WORD`/`BOOL_TO_DWORD` (theo "bảng VERIFY" §7.3 — bảng không tồn tại trong spec, mặc định hẹp, ghi OQ-115); tên intrinsic không biết → T004 ở typecheck. **FC trả giá trị (OQ-112):** gán vào tên FC của chính block đó (`"FC_Scale" := …` hoặc `#FC_Scale := …`, so sánh không phân biệt hoa/thường) → lower thành assign tới local tổng hợp tên = tên FC; lower tự thêm `IrVar { name: <tên FC>, type: returnType }` vào `interface.temp` (P1.4 đọc local này sau khi `callFcExpr` chạy); khai báo biến trùng tên FC → T009 ở typecheck; `RETURN` trong FC chỉ điều khiển luồng (giá trị trả = local FC-name hiện tại, mặc định 0/false). **DB/UDT:** UDT block → `IrUdt` (field qua `layoutStruct`, `size` làm tròn chẵn theo §3.4); DB dạng STRUCT → `IrDb` + `init` từ `DbBlock.init` (lvalue base global phải là chính tên DB — khác → T005; field không tồn tại → T005; giá trị không hằng → T008; gán trùng field → T009; giá trị vào `IrField.init`); DB dạng `"fbname"` → `IrDb` với `fbName`, layout = `VAR_INPUT + VAR_OUTPUT + VAR_IN_OUT` (4 byte nội bộ, không lộ — lower vẫn tính 4 byte vào layout nhưng không tạo field) + `VAR(static)` theo thứ tự khai báo (§3.5, OQ-125), fbName không biết → T001; FB khai báo trong `VAR` (static) của FB cha → field struct lồng (multi-instance, layout lồng trong DB cha). **OB (OQ-113):** `IrBlock.number` + `organization`: tên `"Main"` (không phân biệt hoa/thường) → OB 1; tên khớp `/^OB(\d+)$/i` → số đó; tên khác → không có binding (block vẫn biên dịch, không vào `organization` — binding là việc mức project, `compileProject` P1.7). **Vị trí:** `IrStmt.src`/`IrBlock.src` lấy từ `SclStmt.loc`/`SclBlock.loc` (đổi `offset`/`length` bỏ đi — `SrcRef` chỉ giữ file/line/col/endLine/endCol); `endCol` exclusive (quy ước repo, P1.2).
4. **`compile.ts` — pipeline + điểm vào CLI (OQ-108, OQ-109).**
```ts
export interface CompileContext {
  udts: Map<string, IrUdt>; dbs: Map<string, IrDb>; blocks: Map<string, IrBlock>; // key = id/name lowercased
}
export function createCompileContext(): CompileContext;
export function compileScl(source: string, fileName: string, ctx?: CompileContext)
  : { blocks: IrBlock[]; diagnostics: Diagnostic[] }; // đúng chữ ký M1 §10
export function compileSclProgram(source: string, fileName: string, ctx?: CompileContext)
  : { program: IrProgram; diagnostics: Diagnostic[] }; // toàn bộ IR (kể cả UDT/DB) cho `vcs ir dump`
export function irToJson(program: IrProgram): string; // stable stringify: sort key đệ quy + indent 2 (OQ-126)
```
Pipeline `compileScl`: `parseScl` → nếu `diagnostics` chứa lỗi (OQ-099) → trả `{ blocks: [], diagnostics }` ngay, **không lower**; `typecheckFile` → nếu có lỗi → trả `{ blocks: [], diagnostics: parse + typecheck }` (warning W001 không chặn); `lowerFile` → cập nhật `ctx` (udts/dbs/blocks của file này) → trả `blocks` (chỉ OB/FC/FB của file này, theo §10). `compileSclProgram`: cùng pipeline, trả `program` = toàn bộ `ctx` sau khi lower (blocks/dbs/udts đã tích lũy + sắp xếp). Diagnostics sắp xếp theo vị trí (`sortDiagnostics` ở schemas). `irToJson` phải tất định theo từng byte (key sort đệ quy, không phụ thuộc thứ tự chèn của `Map`).
5. **Mã chẩn đoán (A8/D6) — đăng ký trước khi dùng (OQ-107):**
```ts
// packages/schemas/src/diagnostics-catalog.ts — thêm vào SCL_CATALOG
'SCL-T001': { severity: 'error', title: 'Tên chưa khai báo', hint: 'Khai báo biến/kiểu/block trước khi dùng, kiểm tra chính tả.' }
'SCL-T002': { severity: 'error', title: 'Kiểu không khớp', hint: 'Đổi kiểu biến hoặc giá trị cho khớp; thu hẹp phải dùng hàm chuyển đổi tường minh.' }
'SCL-T003': { severity: 'error', title: 'Toán tử không áp dụng cho kiểu', hint: 'Phép số học chỉ dùng cho số nguyên/số thực/Time; AND/OR/XOR/NOT dùng cho Bool hoặc Byte/Word/DWord.' }
'SCL-T004': { severity: 'error', title: 'Lỗi gọi block/hàm', hint: 'Gọi FB cần instance (#fb hoặc "DB"); kiểm tra tên và kiểu tham số trong khai báo block.' }
'SCL-T005': { severity: 'error', title: 'Truy cập member/index sai', hint: 'Kiểm tra tên field, kiểu index và khoảng chỉ số hằng của mảng.' }
'SCL-T006': { severity: 'error', title: 'Gán không hợp lệ', hint: 'VAR_INPUT chỉ đọc trong FB/FC; VAR_CONSTANT không được gán.' }
'SCL-T007': { severity: 'error', title: 'EXIT/CONTINUE ngoài vòng lặp', hint: 'EXIT/CONTINUE chỉ dùng trong FOR/WHILE/REPEAT.' }
'SCL-T008': { severity: 'error', title: 'Biểu thức không hằng', hint: 'Giá trị khởi tạo, label CASE và init DB phải là hằng (literal, phép tính trên hằng, VAR_CONSTANT).' }
'SCL-T009': { severity: 'error', title: 'Khai báo trùng tên', hint: 'Đổi tên một trong hai khai báo trong cùng scope.' }
'SCL-T010': { severity: 'error', title: 'Thu hẹp ngầm định', hint: 'Dùng REAL_TO_INT(...)/TRUNC(...) hoặc hàm X_TO_Y tường minh.' }
'SCL-T011': { severity: 'error', title: 'Định nghĩa kiểu đệ quy', hint: 'UDT không được chứa chính nó (trực tiếp hay gián tiếp).' }
'SCL-S020': { severity: 'error', title: 'Đệ quy gọi block', hint: 'FC/FB không được gọi chính nó (trực tiếp hay gián tiếp) — tách thành block khác.' }
'SCL-W001': { severity: 'warning', title: 'Đọc TEMP trước khi ghi', hint: 'TEMP không khởi tạo trên PLC thật; gán giá trị trước khi đọc.' }
```
`DIAGNOSTIC_CODE_RE`: `-[ELPWU]` → `-[ELPSTWU]` (nếu không, scan mã chưa đăng ký của `gen-diagnostics.ts` bỏ qua lặng lẽ mã T/S — bài học P1.2 #3); kèm test `scanCodes` tìm được `SCL-T002`/`SCL-S020`. Chạy `pnpm docs:diagnostics` sinh lại `docs/diagnostics.md` (29 → 42 mã); `docs:diagnostics --check` phải khớp ở gate.
6. **CLI `vcs ir dump` (M1 §6, OQ-126):** `apps/cli/src/commands/ir.ts` export `registerIr(program: Command)` — tạo nhóm `ir` + subcommand `dump <file.scl> [--out <file>]`; đọc file (UTF-8, chuẩn hóa BOM/CRLF như `loadProject`); gọi `compileSclProgram`; nếu diagnostics có lỗi → in từng dòng qua `formatDiagnostic` (schemas) + exit **2**; thành công → in `irToJson(program)` ra stdout (hoặc ghi `--out`) + exit **0**; thiếu file/tham số sai → exit **3** với thông điệp usage (đúng quy ước `run.ts` P0.4: 0 ok, 2 lỗi nội dung, 3 lỗi tham số). `apps/cli/src/commands/index.ts` gọi `registerIr`. Thêm dep `@vcs/vendor-siemens: workspace:*` vào `apps/cli/package.json` (tsup build giữ nguyên pattern P0.5 — dep workspace khai báo trực tiếp để dist resolve được; `tsconfig.base.json` paths `@vcs/*` đã có sẵn nên typecheck không cần thêm gì).
7. **Golden + semantics:** 3 golden JSON ở `packages/vendor-siemens/src/scl/golden/` (`fb-motor.json`, `fc-scale.json` từ bảng B; `db-motor.json` từ bảng D-c/E3); test `compile.test.ts` assert `irToJson(compileSclProgram(...))` bằng đúng file golden (so sánh string, không parse lại — để bắt cả thứ tự key); `ir.test.ts` assert exit code + stdout JSON parse được và bằng golden `fb-motor.json` (không golden riêng cho CLI). `docs/semantics.md` thêm §14 (typecheck/lower/IR) với nhãn `VERIFIED`/`UNVERIFIED` cho từng điểm (lattice, convert, FC return, abs mặc định, TEMP warning, đệ quy, OB binding).

**Đã loại:** (1) IR dùng `Map` như phác §6 — mâu thuẫn yêu cầu serializable JSON (OQ-106). (2) Mutate AST để gắn kiểu (thêm field `type` vào node) — phá tính thuần/serializable của AST P1.2 và làm vỡ test deep-equal; dùng side-table `Map` keyed by node. (3) Lower tự suy luận lại kiểu — nhân đôi logic §4.4; lower chỉ tra `TypecheckResult` + hàm đại số dùng chung. (4) Typecheck dạng Hindley-Milner/suy luận kiểu đầy đủ — SCL là ngôn ngữ khai báo tường minh, không cần. (5) Fold phép tính hằng ở lower — IR giữ nguyên phép tính, P1.4 tính (chỉ fold ref `VAR_CONSTANT` vì không có vùng nhớ). (6) Phát hiện đọc TEMP trước khi ghi bằng dataflow đầy đủ (reaching definitions) — dùng definite-assignment đơn giản, đủ cho §7.1. (7) Chấp nhận system FB (`TON`…) ở P1.3 — chưa có layout std, chấp nhận sẽ kiểm tra arg sai im lặng; báo SCL-U001 tới P1.5 (OQ-111). (8) `compileProject` đọc nhiều file `plc/*.scl` — P1.7 (P1.3 chỉ một file + `CompileContext` tích lũy). (9) Interpreter/scheduler/`SoftPlc`/force/snapshot — P1.4. (10) Dependency mới — không cần (chỉ thêm link workspace). (11) ADR mới — quyết định IR/lattice là thực thi spec §6/§4.4, không phải quyết định kiến trúc mới; ghi vào plan + semantics §14.

**Bảng tính tay A — widening + kiểu kết quả nhị phân (§4.4, tính tay):**

Lattice (chỉ các cạnh này, bắc cầu): `SInt→Int→DInt→Real→LReal`; `USInt→UInt→UDInt`; `Byte→Word→DWord`; `Real→LReal`. `Bool`, `Time`: không widening.

| # | Biểu thức | Kiểu kết quả | Convert chèn vào IR | Ghi chú |
|---|---|---|---|---|
| A1 | `Int + DInt` | `DInt` | trái `Int→DInt` | widening trái |
| A2 | `Int + Real` | `Real` | trái `Int→Real` | |
| A3 | `Real + LReal` | `LReal` | trái `Real→LReal` | |
| A4 | `SInt + Int` | `Int` | trái `SInt→Int` | |
| A5 | `SInt + DInt` | `DInt` | trái `SInt→DInt` (bắc cầu) | |
| A6 | `USInt + UInt` | `UInt` | trái `USInt→UInt` | |
| A7 | `Byte AND Word` | `Word` | trái `Byte→Word` (bitwise) | |
| A8 | `Int + Word` | **lỗi SCL-T002** | — | khác họ, không có LUB |
| A9 | `Bool AND Bool` | `Bool` | — | logic |
| A10 | `Bool + Bool` | **lỗi SCL-T003** | — | `+` không áp dụng cho Bool |
| A11 | `Time + Time` | `Time` | — | OQ-124 |
| A12 | `Time + Int` | **lỗi SCL-T003** | — | |
| A13 | `DInt / Int` | `DInt` | phải `Int→DInt`; `7 / 2 = 3`, `-7 / 2 = -3` (cắt về 0) | `/` = `DIV` trên số nguyên |
| A14 | `Real / Int` | `Real` | phải `Int→Real` | chia thực |
| A15 | `Int ** Int` | `Real` | — | `**` luôn Real/LReal → intrinsic `POWER` |
| A16 | `LReal ** Int` | `LReal` | — | |
| A17 | `Int = DInt` | `Bool` | trái `Int→DInt` | so sánh widening được |
| A18 | `Bool = Bool` | `Bool` | — | |
| A19 | `Bool < Bool` | **lỗi SCL-T003** | — | không có thứ tự trên Bool |
| A20 | `Word = Word` | `Bool` | — | `=` được trên bit-string |
| A21 | `Word < Word` | **lỗi SCL-T003** | — | không có thứ tự trên bit-string |
| A22 | `NOT Byte` | `Byte` | — | bitwise → `bnot` |
| A23 | `NOT Int` | **lỗi SCL-T003** | — | |
| A24 | `-Int` | `Int` | — | `neg` |
| A25 | `-Byte` | **lỗi SCL-T003** | — | |
| A26 | gán `DInt := Int` | OK | giá trị `Int→DInt` | widening |
| A27 | gán `Int := DInt` | **lỗi SCL-T010** | — | hint `DINT_TO_INT(...)` |
| A28 | gán `Real := Int` | OK | giá trị `Int→Real` | |
| A29 | gán `Int := Real` | **lỗi SCL-T010** | — | hint `REAL_TO_INT(...)/TRUNC(...)` |
| A30 | gán `Word := Int` | **lỗi SCL-T010** | — | chéo họ số/bit-string → T010, hint `INT_TO_WORD(...)` |
| A31 | gán `Bool := Int` | **lỗi SCL-T002** | — | không liên quan, không phải thu hẹp |
| A32 | gán `Int := Bool` | **lỗi SCL-T002** | — | |

**Bảng tính tay B — lower: IR JSON của một FB và một FC (tính tay, golden `fb-motor.json` / `fc-scale.json`):**

Nguồn FB (file `FB_Motor.scl`, đúng 20 dòng):
```
1  FUNCTION_BLOCK "FB_Motor"
2  VAR_INPUT
3    iStart : Bool;
4    iStop : Bool;
5  END_VAR
6  VAR_OUTPUT
7    qRun : Bool;
8  END_VAR
9  VAR
10   latched : Bool;
11 END_VAR
12 BEGIN
13   IF #iStart THEN
14     #latched := TRUE;
15   END_IF;
16   IF #iStop THEN
17     #latched := FALSE;
18   END_IF;
19   #qRun := #latched;
20 END_FUNCTION_BLOCK
```
Kiểm vị trí (cột 1-based, `endCol` exclusive): `FUNCTION_BLOCK` dài 14 → (1,1)–(1,15); `"FB_Motor"` dài 10 → (1,16)–(1,26); `END_FUNCTION_BLOCK` dài 19 → block `src` (1,1)–(20,20). L13: `IF` (13,3), `#iStart` (13,6)–(13,13), `THEN` (13,14)–(13,18); L15 `END_IF;` → if `src` (13,3)–(15,10). L14: `#latched` (14,5)–(14,13), `TRUE` (14,17)–(14,21), `;` → assign `src` (14,5)–(14,22). L16: `#iStop` (16,6)–(16,12), `THEN` (16,13)–(16,17); if `src` (16,3)–(18,10). L17: `FALSE` (17,17)–(17,22) → assign `src` (17,5)–(17,23). L19: `#qRun` (19,3)–(19,8), `#latched` (19,12)–(19,20) → assign `src` (19,3)–(19,21).

```json
{
  "blocks": [
    {
      "id": "FB_Motor", "kind": "FB", "name": "FB_Motor",
      "interface": {
        "input": [{ "name": "iStart", "type": "Bool" }, { "name": "iStop", "type": "Bool" }],
        "output": [{ "name": "qRun", "type": "Bool" }],
        "inout": [], "static": [{ "name": "latched", "type": "Bool" }], "temp": []
      },
      "body": [
        { "op": "if",
          "cond": { "op": "load", "type": "Bool", "ref": { "k": "local", "name": "iStart" } },
          "then": [{ "op": "assign", "target": { "k": "local", "name": "latched" },
                     "value": { "op": "const", "type": "Bool", "value": true },
                     "src": { "file": "FB_Motor.scl", "line": 14, "col": 5, "endLine": 14, "endCol": 22 } }],
          "elsif": [], "else": [],
          "src": { "file": "FB_Motor.scl", "line": 13, "col": 3, "endLine": 15, "endCol": 10 } },
        { "op": "if",
          "cond": { "op": "load", "type": "Bool", "ref": { "k": "local", "name": "iStop" } },
          "then": [{ "op": "assign", "target": { "k": "local", "name": "latched" },
                     "value": { "op": "const", "type": "Bool", "value": false },
                     "src": { "file": "FB_Motor.scl", "line": 17, "col": 5, "endLine": 17, "endCol": 23 } }],
          "elsif": [], "else": [],
          "src": { "file": "FB_Motor.scl", "line": 16, "col": 3, "endLine": 18, "endCol": 10 } },
        { "op": "assign", "target": { "k": "local", "name": "qRun" },
          "value": { "op": "load", "type": "Bool", "ref": { "k": "local", "name": "latched" } },
          "src": { "file": "FB_Motor.scl", "line": 19, "col": 3, "endLine": 19, "endCol": 21 } }
      ],
      "src": { "file": "FB_Motor.scl", "line": 1, "col": 1, "endLine": 20, "endCol": 20 }
    }
  ],
  "dbs": [], "udts": [], "organization": []
}
```

Nguồn FC (file `FC_Scale.scl`, đúng 10 dòng):
```
1  FUNCTION "FC_Scale"
2  VAR_INPUT
3    raw : Int;
4  END_VAR
5  VAR_OUTPUT
6    scaled : Real;
7  END_VAR
8  BEGIN
9    #scaled := #raw * 2;
10 END_FUNCTION
```
Kiểm vị trí: `FUNCTION` (1,1)–(1,9); `"FC_Scale"` (1,10)–(1,20); `END_FUNCTION` dài 12 → block `src` (1,1)–(10,13). L9: `#scaled` (9,3)–(9,10), `#raw` (9,14)–(9,18), `*` (9,19), `2` (9,21)–(9,22) → assign `src` (9,3)–(9,23). Kiểu: `#raw * 2` → `Int` (`Int ∘ Int`); gán vào `Real` → chèn `convert Int→Real` **ngoài** phép nhân (không phải trong — convert áp cho kết quả, không cho toán hạng).

```json
{
  "blocks": [
    {
      "id": "FC_Scale", "kind": "FC", "name": "FC_Scale",
      "interface": {
        "input": [{ "name": "raw", "type": "Int" }],
        "output": [{ "name": "scaled", "type": "Real" }],
        "inout": [], "static": [], "temp": []
      },
      "body": [
        { "op": "assign", "target": { "k": "local", "name": "scaled" },
          "value": { "op": "convert", "from": "Int", "to": "Real",
                     "a": { "op": "binary", "fn": "mul", "type": "Int",
                            "a": { "op": "load", "type": "Int", "ref": { "k": "local", "name": "raw" } },
                            "b": { "op": "const", "type": "Int", "value": 2 } } },
          "src": { "file": "FC_Scale.scl", "line": 9, "col": 3, "endLine": 9, "endCol": 23 } }
      ],
      "src": { "file": "FC_Scale.scl", "line": 1, "col": 1, "endLine": 10, "endCol": 13 }
    }
  ],
  "dbs": [], "udts": [], "organization": []
}
```

**Bảng tính tay C — lỗi typecheck + vị trí chính xác (tính tay; mỗi case là một file độc lập, wrapper OB/FC/FB như ghi):**

| # | Nguồn lỗi (dòng gây lỗi) | Mã | Vị trí | Thông điệp / kỳ vọng |
|---|---|---|---|---|
| C1 | `#x := #y;` (`#y` chưa khai báo) — OB, L6 `  #x := #y;` | SCL-T001 | (6,9)–(6,11) — ref `#y` | "tên chưa khai báo: #y" |
| C2 | `#a := #b + TRUE;` (`#b` Bool) — OB, L7 | SCL-T003 | (7,9)–(7,18) — toàn bộ `#b + TRUE` | "`+` không áp dụng cho Bool" |
| C3 | `#i := #r;` (`#i` Int, `#r` Real) — OB, L7 | SCL-T010 | (7,9)–(7,11) — giá trị `#r` | hint "dùng REAL_TO_INT(...)/TRUNC(...)" |
| C4 | `IF #n THEN` (`#n` Int) — OB, L6 | SCL-T002 | (6,6)–(6,8) — điều kiện `#n` | "điều kiện IF phải là Bool" |
| C5 | `#i := TRUE;` trong FB (`#i` là VAR_INPUT) — FB, L6 | SCL-T006 | (6,3)–(6,5) — target `#i` | "VAR_INPUT chỉ đọc" |
| C6 | `#fb(TRUE);` (gọi FB positional) — OB, L12 | SCL-T004 | (12,7)–(12,11) — arg positional `TRUE` | "FB phải dùng tham số đặt tên" |
| C7 | `"FB_X"(i := TRUE);` (gọi FB bằng tên kiểu, không instance) — OB, L9 | SCL-T004 | (9,3)–(9,9) — callee `"FB_X"` | "gọi FB cần instance (#fb hoặc \"DB\")" |
| C8 | label CASE `#m` (`#m` là biến, không hằng) — OB, L8 `    #m : #n := 1;` | SCL-T008 | (8,5)–(8,7) — label `#m` | "label CASE phải là hằng" |
| C9 | `EXIT;` ngoài vòng lặp — OB, L3 | SCL-T007 | (3,3)–(3,7) | "EXIT chỉ dùng trong vòng lặp" |
| C10 | `#n.field := 1;` (`#n` Int) — OB, L6 | SCL-T005 | (6,6)–(6,11) — member `field` | "Int không có field 'field'" |
| C11 | `#a[5] := 1;` (`#a: Array[0..3] of Int`) — OB, L6 | SCL-T005 | (6,6)–(6,7) — index `5` | "chỉ số 5 ngoài [0..3]" |
| C12 | khai báo trùng `x` lần 2 trong VAR_TEMP — OB, L4 `  x : Bool;` | SCL-T009 | (4,3)–(4,4) — tên `x` thứ hai | "tên đã khai báo: x" |
| C13 | `"FC_A" := "FC_A"(i := #i);` trong FC_A (có returnType Int) — FC, L6 | SCL-S020 | (6,13)–(6,19) — callee `"FC_A"` | "đệ quy: FC_A gọi chính nó" |
| C14 | `#x := #t;` (`#t` là VAR_TEMP, chưa gán trước đó) — OB, L7 | SCL-W001 (warning) | (7,9)–(7,11) — lần đọc `#t` | "đọc TEMP trước khi ghi"; compile vẫn thành công |
| C15 | `u : Udt_NoSuch;` trong VAR_TEMP — OB, L3 | SCL-T001 | (3,7)–(3,17) — tên kiểu | "kiểu chưa biết: Udt_NoSuch" |
| C16 | `#x := "FC_B"(i := 1);` (`FC_B` không có returnType) — OB, L12 | SCL-T004 | (12,9)–(12,15) — callee `"FC_B"` | "FC_B không trả giá trị" |

Kiểm vị trí C6: L12 `  #fb(TRUE);` — `#fb` (12,3)–(12,6), `TRUE` (12,7)–(12,11). C7: L9 `  "FB_X"(i := TRUE);` — `"FB_X"` (9,3)–(9,9). C13: L6 `  "FC_A" := "FC_A"(i := #i);` — callee thứ hai (6,13)–(6,19). C16: L12 `  #x := "FC_B"(i := 1);` — `"FC_B"` (12,9)–(12,15).

**Bảng tính tay D — const eval + CASE + DB init (tính tay):**

- **D-a (VAR_CONSTANT fold):** `VAR_CONSTANT c : Int := 2 + 3;` → `evalConst` = 5 (phép tính trên hằng, không cần literal đơn). `#x := #c * 2;` (`#x` Int) → lower: ref `#c` fold thành `const 5`; phép `*` **không** fold → IR: `binary mul(Int, const 5, const 2)`. Kiểm: `2 + 3 = 5` (không phải 6); fold chỉ áp cho ref hằng, không áp cho phép tính.
- **D-b (CASE label):** selector `#n` Int; arm `1..3, 5 : …` → labels `[1,3]` + `5`; arm thứ hai `2 : …` → trùng với khoảng `1..3` → **SCL-T005** tại label `2`. Label `1 + 1` (const expr = 2) → hợp lệ, giá trị 2 (evalConst tính được); label `#m` (biến) → SCL-T008 (bảng C8).
- **D-c (DB init + layout, golden `db-motor.json`):** nguồn:
```
1  DATA_BLOCK "DB_Motor"
2  STRUCT
3    speed : Int;
4    run : Bool;
5  END_STRUCT;
6  BEGIN
7    "DB_Motor".speed := 1500;
8  END_DATA_BLOCK
```
Layout (§3.4): `speed` Int → byteOffset 0, size 2; `run` Bool → byteOffset 2, bitOffset 0, size 1 (bit); tổng dùng 3 byte → làm tròn chẵn → **size 4**. `init`: `speed = 1500` (hằng Int trong khoảng); `run` không init → mặc định false/0. IR (cùng file còn có UDT `UDT_Motor` với đúng 2 field trên — xem bảng E3):
```json
{ "blocks": [], "organization": [],
  "dbs": [{ "id": "DB_Motor", "name": "DB_Motor",
    "fields": [
      { "name": "speed", "type": "Int", "byteOffset": 0, "size": 2, "init": 1500 },
      { "name": "run", "type": "Bool", "byteOffset": 2, "bitOffset": 0, "size": 1 } ],
    "size": 4 }],
  "udts": [{ "id": "UDT_Motor", "name": "UDT_Motor",
    "fields": [
      { "name": "speed", "type": "Int", "byteOffset": 0, "size": 2 },
      { "name": "run", "type": "Bool", "byteOffset": 2, "bitOffset": 0, "size": 1 } ],
    "size": 4 }] }
```
Kiểm: `1500` vừa Int 16-bit (−32768..32767); init `speed := 40000` → lỗi (vượt khoảng Int — mã nào? `validateTagValue` là runtime; ở typecheck, literal Int ngoài khoảng kiểu đích → **SCL-T002** với thông điệp nêu khoảng — ghi ở test D-c, không cần OQ riêng vì đã có T002); init vào field không tồn tại → T005; init không hằng → T008; init trùng field → T009.

**Bảng tính tay E — golden IR dump (CLI `vcs ir dump`):**

| # | File nguồn | Golden | Nội dung kỳ vọng (tóm tắt — JSON đầy đủ ở bảng B/D-c) |
|---|---|---|---|
| E1 | `FB_Motor.scl` (bảng B, 20 dòng) | `packages/vendor-siemens/src/scl/golden/fb-motor.json` | đúng JSON bảng B (1 block FB, 3 stmt, `src` đầy đủ, `dbs`/`udts`/`organization` rỗng) |
| E2 | `FC_Scale.scl` (bảng B, 10 dòng) | `packages/vendor-siemens/src/scl/golden/fc-scale.json` | đúng JSON bảng B (1 block FC, `convert Int→Real` ngoài phép `mul`) |
| E3 | file chứa `TYPE "UDT_Motor" … END_TYPE` + DB bảng D-c | `packages/vendor-siemens/src/scl/golden/db-motor.json` | đúng JSON bảng D-c (`blocks` rỗng, 1 DB + 1 UDT, layout size 4, `init` 1500) |
| E4 | `FB_Motor.scl` qua CLI | — (không golden riêng) | `vcs ir dump` exit 0, stdout JSON parse được và bằng đúng `fb-motor.json` |

**Test (mục tiêu: ≥ 70 test mới; tổng ≥ 816 = 746 + 70):**

| Nhóm | File | Test mới (tên + kỳ vọng) |
|---|---|---|
| typecheck — lattice + kết quả (~18) | `packages/vendor-siemens/src/scl/typecheck.test.ts` | Bảng A: A1–A7/A9/A11/A13–A18/A20/A22/A24/A26/A28 (mỗi case 1 test: kiểu kết quả + convert chèn đúng vị trí — assert qua `types` map hoặc qua lower); A8/A10/A12/A19/A21/A23/A25/A27/A29–A32 (mỗi case 1 test: đúng mã + vị trí) |
| typecheck — lỗi kiểm tra (~16) | `packages/vendor-siemens/src/scl/typecheck.test.ts` | Bảng C: C1–C16 (mỗi case 1 test: mã + line/col/endCol chính xác + severity; C14 là warning, compile vẫn thành công) |
| typecheck — const + FOR/CASE + TEMP (~8) | `packages/vendor-siemens/src/scl/typecheck.test.ts` | Bảng D-a (fold `VAR_CONSTANT`, không fold phép tính); D-b (label trùng trong khoảng → T005; label `1+1` hợp lệ); FOR: biến vòng lặp không phải integer → T003, `by` âm hợp lệ, `from` widening về kiểu biến; TEMP: đọc sau gán thì hết warning, đọc trong nhánh IF chỉ gán một bên vẫn warning |
| typecheck — đệ quy + system FB (~4) | `packages/vendor-siemens/src/scl/typecheck.test.ts` | C13 (trực tiếp); đệ quy gián tiếp A→B→A → SCL-S020; gọi `TON` trong VAR → SCL-U001; gọi `#sT(IN := …)` khi `sT : TON` → SCL-U001 |
| lower (~20) | `packages/vendor-siemens/src/scl/lower.test.ts` | Bảng B: FB_Motor deep-equal IR (trừ `src` assert riêng); FC_Scale deep-equal (convert ngoài `mul`); call FB (`#fb(IN := #x, Q => #y)` → `callFb` với `inArgs`/`outArgs` đúng); call FC trong biểu thức → `callFcExpr`, dạng statement → `callFc` (`ret` khi có `Q =>`); `**` → intrinsic `POWER`; `REAL_TO_INT` → `convert` mode `round`, `TRUNC` → `trunc`, `CEIL` → intrinsic; FC return (`"FC_X" := …` → assign tới local tổng hợp + `interface.temp` có `<tên FC>`); `IF`/`ELSIF`/`ELSE` → `elsif` list; `CASE` (label đơn + khoảng); `FOR`/`WHILE`/`REPEAT`/`EXIT`/`CONTINUE`/`RETURN` đúng `op`; abs `%I0.0` → `abs` type `Bool`, `%MD0` → `abs` type `DInt` (OQ-110), `DB1.DBW4` → `absDb` type `Int`; index `#a[#i]` → `index`; `src` trên statement/block đúng bảng B |
| compile + golden (~8) | `packages/vendor-siemens/src/scl/compile.test.ts` | E1–E3: `irToJson(compileSclProgram(...))` bằng đúng file golden (so sánh string); `compileScl` trả blocks theo §10 (UDT/DB không nằm trong `blocks`); có lỗi parse → blocks rỗng, không lower; có lỗi typecheck → blocks rỗng + diagnostics gộp (parse + typecheck, sort theo vị trí); warning W001 không chặn (blocks vẫn có); `compileScl` lần 2 cùng `ctx` thấy được UDT/DB của lần 1 |
| CLI (~5) | `apps/cli/src/commands/ir.test.ts` | `dump` file FB_Motor → exit 0, stdout = `fb-motor.json`; file có lỗi typecheck → exit 2 + in `SCL-T010`; file không tồn tại → exit 3; `--out` ghi file thay vì stdout; `irToJson` tất định: dump 2 lần ra string giống hệt nhau theo từng byte |
| diagnostics (~2) | `packages/schemas/src/diagnostics-catalog.test.ts` (nếu có) + `tests/gen-diagnostics.test.ts` | 13 mã mới đăng ký trong catalog; `scanCodes` tìm được `SCL-T002`/`SCL-S020` (regex mở rộng); `docs:diagnostics --check` khớp sau khi sinh lại (29 → 42 mã) |

**Mơ hồ (phân loại):** **Tier A (tự quyết):** vị trí file theo đồ thị phụ thuộc (ir.ts ở runtime-iec, typecheck/lower/compile ở vendor-siemens); side-table `Map` keyed by node thay vì mutate AST; `irToJson` sort key đệ quy + indent 2; thứ tự triển khai (ir.ts → catalog mã → typecheck → lower → compile → CLI → golden); test dùng `it.each` với bảng case dùng chung cho bảng A/C. **Tier B (mặc định + ghi OQ):** OQ-106 (IR mảng thay Map + struct inline + elsif list); OQ-107 (bộ 13 mã + regex + quy tắc T002/T003/T010 + phép số học trên bit-string → T003); OQ-108 (vị trí file theo dep graph); OQ-109 (`compileScl` đúng §10 + `compileSclProgram` cho dump); OQ-110 (abs mặc định theo width); OQ-111 (system FB → SCL-U001 tới P1.5); OQ-112 (FC return = gán tên FC → local tổng hợp trong `temp`); OQ-113 (OB → organization: `Main`→1, `OB<n>`→n, khác → không binding); OQ-114 (`**` → intrinsic POWER; `/`=`DIV` trên số nguyên); OQ-115 (X_TO_Y → convert/intrinsic + tập `BOOL_TO_*` hẹp); OQ-116 (gán `VAR_CONSTANT` → T006); OQ-117 (FOR: biến integer, `by` mặc định 1 được âm, không kiểm sửa biến vòng lặp); OQ-118 (CASE: selector integer, label trùng → T005); OQ-119 (tên kiểu không biết → T001; UDT đệ quy → T011; tra cứu block/UDT không phân biệt hoa/thường cho ident); OQ-120 (TEMP read-before-write → W001, definite-assignment đơn giản); OQ-121 (X-002 không chặn P1.3); OQ-122 (đệ quy → SCL-S020 trong phạm vi unit + ctx); OQ-123 (FB/FC call: instance LValue, IN_OUT bằng tham chiếu, FB positional → T004, FC positional theo thứ tự khai báo); OQ-124 (Time: chỉ `+`/`-` giữa Time, không widening); OQ-125 (DB instance layout §3.5 + init DB: base phải là chính DB, field không tồn tại → T005); OQ-126 (`vcs ir dump`: JSON ổn định, exit 0/2/3, golden ở `vendor-siemens/src/scl/golden/`). **Tier C (không chặn P1.3):** không có mục mới — OQ-105 (X-002/S1) vẫn mở từ P1.2, không chặn (OQ-121 ghi rõ lý do); nếu khi triển khai phát hiện §4.4/§6 thiếu quy tắc mà chỉ mã thật/PLCSIM mới quyết được → ghi OQ/SCR, không tự nới lỏng strict.

**Rủi ro + cách kiểm:** (1) X-002/S1 chưa có: mã thật có thể dùng chuyển đổi ngầm định mà P1.3 từ chối (vd `Int := Real` trong code TIA cũ) — giảm thiểu: strict là mặc định của spec (§4.4), lỗi T010 nêu rõ hàm chuyển đổi (không chạy sai im lặng); khi S1 chạy xong, nếu TIA cho phép rộng hơn thì sinh SCR nới lỏng (không tự sửa typecheck). (2) Diễn giải abs mặc định (OQ-110) lệch code thật (vd `%MD0` chứa Real mà không qua convert) — giảm thiểu: test ghim mặc định; xác minh bằng đoạn SCL thật (S1) hoặc PLCSIM, sửa qua SCR nếu khác. (3) FC return bằng gán tên FC (OQ-112) lệch TIA (TIA còn cho `RETURN` với giá trị?) — giảm thiểu: test ghim mặc định; kiểm bằng mã thật khi có. (4) `**` kết hợp phải đã ghim ở P1.2 (OQ-092) — P1.3 chỉ lower theo AST, không kiểm lại. (5) `DIAGNOSTIC_CODE_RE` quên mở rộng → mã T/S bị scan bỏ qua lặng lẽ — giảm thiểu: test `scanCodes` tìm được `SCL-T002`/`SCL-S020` (bài học P1.2 #3). (6) `vcs ir dump` kéo `@vcs/vendor-siemens` vào CLI làm phình dist/break tsup — giảm thiểu: pattern P0.5 đã chứng minh với `@vcs/server`; nếu tsup không bundle được thì dừng, báo nguyên nhân (không tự đổi cấu hình build — quyết định kiến trúc, tầng C). (7) Golden JSON dài (bảng B) — rủi ro sai tay ở `src`/thứ tự key: giảm thiểu: `irToJson` sort key nên thứ tự không phụ thuộc code; test so sánh string bắt sai lệch ngay; bảng B tính tay độc lập với implementation.

**Ngoài phạm vi:** interpreter/scheduler/`SoftPlc`/force/snapshot/`step()` (P1.4); std blocks `TON`/`CTU`/`R_TRIG` (P1.5 — P1.3 chỉ báo SCL-U001); LAD (P1.6); golden runner YAML + demo `motor-interlock` + UI + bench M1 §12.4 (P1.7); `compileProject` đọc nhiều file `plc/*.scl` (P1.7); sửa EBNF §4.2 / M1 §4.4/§6; đổi `.dependency-cruiser.cjs` / `eslint.config.js` / root `tsconfig.json` / `vitest.config.ts` (ngưỡng 85 đã có); ADR mới; mã diagnostic ngoài 13 mã; `docs/facts/` mới; P0.9 PWA; script spike S1 (chạy khi có mã thật).

**Gate P1.3 (triển khai):** `lint && typecheck && depcheck && test && test:e2e && review:cheats && docs:diagnostics --check` + `build` + bench guard (`pnpm bench`: TagDB 4/4 PASS + orchestrator ≥ 100 000 bước/s — P1.3 không chạm đường nóng bench; rớt > 20% so với baseline thì dừng điều tra, không hạ ngưỡng) + CI (check + test ubuntu/windows + e2e ubuntu) xanh. Tổng test sau P1.3: **≥ 816** (≥ 70 mới; riêng typecheck ≥ 20 theo gate PROMPTS — plan đặt ≥ 46 test typecheck). `pnpm-lock.yaml` chỉ thêm link workspace `@vcs/vendor-siemens` cho CLI (không đổi version khác — diff khác là cờ đỏ, dừng kiểm tra). `pnpm install` trong VM vẫn EPERM (OQ-007) — triển khai làm ở bản sao `/tmp` như các prompt trước, cài thật `--frozen-lockfile` (dùng `git archive` để copy, không `cp -r` cả cây kèm `node_modules` — bài học ENOSPC ở P0.8). **Cần kiểm lại khi triển khai:** root `package.json` không bị ghi đè (bài học P1.2: từng bị ghi đè bằng nội dung vendor-siemens — kiểm `name: "vcs"` + diff vs HEAD trống trước khi commit).

## Kết quả triển khai P1.3 (2026-11-25, xong local — CHƯA mở PR)

**Kết quả:** 105 test mới đợt 1 (typecheck 64, lower 24, compile 9, CLI 6,
diagnostics 2) + 347 test `algebra.test.ts` (hàm thuần + intrinsic) +
83 test `typecheck-coverage.test.ts` (DB/UDT/cross-file/call-args/statement)
+ 29 test `lower-coverage.test.ts` (FC positional/ident, FB IN_OUT + DB
instance, OB số, intrinsic convert, throw nội bộ) = **564 test mới, tổng
1310** (746 trước P1.3). 13 mã mới SCL-T001…T011 + SCL-S020 + SCL-W001 (diagnostics
29 → 42). Không dependency mới; chỉ thêm link workspace
`@vcs/vendor-siemens` cho CLI (lockfile +3 dòng). OQ-106…126 đã đóng (đã áp
dụng ở P1.3); thêm OQ-127 (FC OUT, tier B) và OQ-128 (FC IN_OUT, tier B),
đã áp dụng + đóng. `docs/semantics.md` §14 đã viết (mỗi điểm gắn
VERIFIED/UNVERIFIED).

### Lệch so với plan

1. **6 giá trị `src.endCol` trong bảng B tính tay bị sai** — bằng chứng là
   test P1.2 (`parser.test.ts:170-181`): (a) `END_FUNCTION_BLOCK` dài **18**
   ký tự, không phải 19 → block endCol 19, không phải 20; (b) loc của
   statement/block trong parser **không gồm dấu `;` cuối** (endCol = ngay
   sau token có nghĩa cuối), nên mọi endCol của stmt trong bảng B đều thừa
   1 (L14 assign 21 không phải 22; L15 if 9 không phải 10; L17 assign 22
   không phải 23; L19 assign 20 không phải 21; L16 if 9 không phải 10;
   FC_Scale assign L9 endCol 22 không phải 23; block FC endCol 13 đúng).
   Golden giữ theo parser (nguồn sự thật), không sửa lower để "khớp" bảng
   B. Test `lower.test.ts` assert đúng giá trị đã sửa, ghi chú rõ trong test.
2. **`CompileContext` (compile.ts) = `CrossFileTables` (typecheck.ts) về
   mặt cấu trúc, định nghĩa riêng** để tránh import vòng type-only
   typecheck ↔ compile.
3. **`ROUND`/`TRUNC`: `IntrinsicInfo` có kind `roundConvert`
   (`{kind:'roundConvert', mode:'round'|'trunc'}`)** thay vì hardcode
   `from: Real, to: Int` — `from` thực là kiểu đối số (Real/LReal), `to`
   là DInt.
4. **Địa chỉ tuyệt đối bit (`%I0.0`, `DB1.DBX0.0`): IR
   `IrLValue.abs/absDb.width` là `8|16|32|64` (không có 1)** nên width 1
   map sang **8** (một byte) kèm `bit`.
5. **Giá trị init DB do typecheck tính vào `IrField.init` trong
   `checkDbInit`; lower chỉ copy `checked.dbs`** (plan ghi lower làm —
   cùng kết quả quan sát được, tránh nhân đôi logic phân giải path ở lower).
6. **Tham số OUT của FC (không phải `Q`) → SCL-T004 (OQ-127, tier B)** —
   `IrStmt.callFc` không có slot `outArgs`, hạ im lặng sẽ mất ghi.
7. **Tham số IN_OUT của FC → SCL-T004 (OQ-128, tier B)** — IR `callFc`/
   `callFcExpr` không có slot inout; hạ thành load sẽ mất ghi lại. Áp dụng
   cả dạng biểu thức lẫn statement, cả positional lẫn named.
8. **Intrinsic thắng khi trùng tên FC do user; callee không biết → T001;
   FB làm callee trong biểu thức → T004; OB làm callee → T004; system FB
   làm callee → SCL-U001.** Intrinsic chỉ nhận tham số vị trí; named arg →
   T004.
9. **`SQRT` trên int → Real (LReal nếu arg LReal); `CEIL`/`FLOOR` → DInt;
   `NORM_X`/`SCALE_X` chấp nhận số, widen về Real (LReal nếu có arg
   LReal); `MIN`/`MAX`/`LIMIT` widen các arg về kiểu chung;
   `SHL`/`SHR`/`ROL`/`ROR` cần giá trị int/bit-string + count int.**
10. **`getBlockSymbols` lượt 2 viết lại:** fixpoint im lặng cho
    `VAR_CONSTANT` (hằng tham chiếu hằng khai báo sau), rồi lượt có chẩn
    đoán (checkExpr trước, evalConst với guard tránh báo T008 trùng khi tên
    chưa khai báo, kiểm kiểu gán + khoảng); `suppressW001` khi kiểm init;
    lưu/khôi phục `currentBlock`/`currentSymbols` để gọi đệ quy không lệch
    ngữ cảnh.
11. **Inline-struct field init dùng cơ chế pending
    (`pendingStructInits`, flush sau khi tính xong const của block);
    UDT/DB field init tính ngay với `EMPTY_SYMBOLS`.**
12. **`TypecheckResult.blocks` có thể chứa entry tổng hợp cho block ctx**
    (để `lowerFile` tra cứu interface callee chéo file không cần tham số
    ctx); `lookupInterface` cache kiểu trả của FC từ ctx vào `fcReturnTypes`
    để lower dùng qua `TypecheckResult.returnTypes` (đã thêm field này vào
    `TypecheckResult`).
13. **Member của struct local (`#udt.field`) → `static` path `[udt,
    field, ...]`** — plan chỉ nêu member của instance FB; struct local dùng
    cùng cơ chế vì `local` không có path.
14. **Thêm variant `member` vào `IrLValue`** (`{k:'member', base, field}`)
    cho member sau index (`#a[0].field`) — plan không quy định;
    `static.path` chỉ chứa string nên không biểu diễn được index xen giữa.
    Member trực tiếp trên root vẫn dùng `static.path` theo plan.
15. **`lower` không kiểm tra lại kiểu: thiếu kiểu trong `types` map = lỗi
    nội bộ → throw ồn ào. `convertIfNeeded` chỉ cho widening (khác kiểu mà
    không widening → throw).**
16. **FC gọi dạng statement không có `Q =>` thì giá trị trả bị bỏ (ret
    undefined); FC trong biểu thức không nhận `Q =>` (T004).**
17. **`irToJson` trả JSON + newline cuối; golden file kết thúc bằng
    newline; CLI ghi đúng chuỗi đó.**
18. **Trong `lowerCallStmt`, tên FB chuẩn lấy từ `blockId` của symbols
    (không phải tên khai báo as-written).**
19. **Đệ quy chéo file (OQ-122): `recordEdge` chỉ ghi cạnh tới block trong
    file hiện tại — chu trình A→B→A với A, B ở hai file lọt im lặng.**
    Plan nói call graph gồm "call trong unit biên dịch + `ctx.blocks`" nên
    đây là thiếu sót so với plan, không phải mặc định: sửa `recordEdge`
    (ghi cả cạnh tới block trong ctx) + `checkRecursion` seed thêm cạnh
    trích từ IR của `ctx.blocks` (walker `ctxCallEdges`, bỏ qua block cũng
    có trong file hiện tại để re-compile bỏ call không báo đệ quy giả;
    diagnostic S020 mang đúng file của call site gây chu trình). Test
    `typecheck-coverage.test.ts` (đệ quy qua ctx + re-compile bỏ call).
20. **`MIN`/`MAX`/`LIMIT` với arg bit-string (vd `MIN(#i, #w)`) → SCL-T003,
    không phải T002.** `commonNumeric` kiểm tra `isNumeric` trước và báo
    T003 khi gặp Word/Byte/DWord, chưa tới bước LUB (nơi mới sinh T002).
    Bit-string không phải họ số nên T003 nhất quán với OQ-107/T003 (phép
    số học trên bit-string → T003); đường T002 vẫn tồn tại cho hai họ số
    không có LUB (vd `MIN(#i, #u)` Int+UInt → T002). Test trong
    `algebra.test.ts` ghim cả hai hành vi.
21. **Gán trực tiếp vào member INPUT của instance FB (`#fb.IN := …`) →
    cho phép (OQ-129, tier B).** Plan không quy định; `resolveLValue` trả
    symbol của instance (section `var`), không phải của member, nên T006
    không bật. Mặc định: member là field của DB instance, ghi trực tiếp
    tương đương truyền ở lần gọi sau; chỉ cấm gán vào VAR_INPUT của chính
    block đang kiểm (T006). Chờ S1/PLCSIM xác nhận.
22. **Chỉ số mảng không phải số nguyên → SCL-T005 (không phải T003).**
    Message: "chỉ số mảng phải là số nguyên". Test đã sửa kỳ vọng theo
    implementation (implementation đúng với quy tắc T005 "truy cập
    member/index sai" ở plan §18).

### Sửa bug phát hiện khi viết test (nguyên nhân gốc, không sửa kỳ vọng)

- **A8 (`Int + Word`): implementation trả T003, plan bảng A yêu cầu T002.**
  Nguyên nhân: `binaryResult` chưa phân biệt "một vế số + một vế
  bit-string" (khác họ, không có LUB → T002) với "cả hai vế bit-string /
  Bool tham gia" (toán tử không áp dụng → T003). Sửa: thêm
  `numericBitMismatch` → T002 cho các nhánh số học/`**`/`MOD` (test A8
  pass; message T002 đã có sẵn ở `checkExpr`).
- **`X_TO_Y` bị T001 ("tên chưa khai báo"):** `classifyIntrinsic` so sánh
  tên đã upper-case (`'REAL'`) với `CONVERTIBLE_TYPES` chứa tên
  mixed-case (`'Real'`). Sửa: set dùng chữ HOA (chỉ chỗ này dùng set).
  (`BOOL_TO_*` không dính vì `BOOL_TO_TARGETS` đã là chữ HOA.)
- **Lower crash "thiếu kiểu cho node" ở intrinsic call:** `checkCallExpr`
  ghi `types` map cho nhánh FC nhưng **không** ghi cho nhánh intrinsic
  (`checkIntrinsicCall` trả kiểu mà không `set`). Sửa: ghi `types` ở
  nhánh intrinsic trong `checkCallExpr` (như nhánh FC).
- **FC return dạng `"FC_A" := …` hạ thành `dbField` thay vì local tổng
  hợp:** `lowerLValue` chỉ xử lý tên FC ở nhánh base `local` (`#FC_A`),
  còn dạng quoted (`"FC_A"`) rơi vào nhánh `global` → `dbField`. Sửa:
  nhánh `global` kiểm tra tên FC của chính block (không phân biệt
  hoa/thường) → `{k:'local', name: block.name}` (đúng plan §18: cả hai
  dạng đều → local tổng hợp).
- **Arg bị từ chối (FB positional, FC IN_OUT) sinh thêm lỗi "thiếu tham
  số bắt buộc" giả:** `checkCallArgs` `continue` mà không đánh dấu
  `provided`, nên kiểm missing-param sau vòng lặp báo thêm một T004 tại
  vị trí callee (sớm hơn vị trí arg thật). Sửa: đánh dấu `provided` khi
  từ chối arg đã cung cấp giá trị (sai hình thức, không phải thiếu).
- **Lower không phân giải được callee FC/FB ở file khác (throw "không tìm
  được FC 'FC_A'"):** `lookupInterface` nhánh ctx chỉ cache kiểu trả vào
  `fcReturnTypes` mà không ghi entry tổng hợp vào `this.blocks`, nên
  `lower.fcTarget` (chỉ có `TypecheckResult`, không có ctx) không tìm
  được callee. Sửa: nhánh ctx của `lookupInterface` gọi thêm
  `lookupBlockSymbols` (qua `blockSymbolsFromIr`) để ghi entry tổng hợp
  — đúng thiết kế đã ghi ở mục 12. Phát hiện nhờ test đệ quy qua ctx
  (compile FC_B gọi FC_A từ ctx); test mới `typecheck-coverage.test.ts`
  (gọi FB/FC từ ctx qua `compileScl`) ghim hành vi này.
- **Test fixture:** helper `obWith` ban đầu thiếu `END_VAR` (mọi số dòng
  bảng C tính tay lệch 1 — đã đếm lại); bảng A đổi fixture sang FB với
  `VAR_INPUT` (toán hạng) + `VAR_TEMP` (kết quả) vì `VAR_TEMP` đọc trước
  khi gán dính W001 hợp lệ; `TRUNC` trả DInt nên đích test phải là DInt
  (không phải Int); lower sort blocks theo tên nên test tìm block theo
  tên, không theo index.

### Chưa làm / rủi ro còn lại

- **Sự cố VM restart giữa phiên (2026-11-25 ~23:32 +07):** VM restart xóa
  toàn bộ tmpfs `/tmp`, mất bản sao làm việc `/tmp/vcs-p13` (toàn bộ code
  + test P1.3 chưa copy về `~/workspace/vcs`). Khôi phục từ session log
  (`/home/hatch/agents/agent-0039e177…/sessions/*.jsonl` + log subagent
  algebra): replay 150 op `muse.write`/`muse.edit` theo đúng thứ tự seq
  (146/150 áp dụng; 4 edit fail là retry thừa trong phiên gốc, trạng thái
  cuối đã đúng), sinh lại golden (`tsx gen-golden.mts`), diagnostics
  (`pnpm docs:diagnostics`), lockfile (`pnpm install`, +3 dòng), OQ
  (sed). Kiểm chứng: tsc 0, eslint 0, full test 1281/1281 ngay sau khôi
  phục (trước khi viết thêm test coverage). Bài học: **không để bản duy
  nhất của code chưa commit trong `/tmp`** — sau khôi phục đã rsync toàn
  bộ cây làm việc về `~/workspace/vcs` ngay và sau mỗi bước lớn; `/tmp`
  chỉ còn là nơi chạy install/test.
- `X_TO_Y` với `SInt`/`USInt`/`UInt`/`UDInt`/`Time` hiện không nhận (tập
  `CONVERTIBLE_TYPES` chỉ 8 kiểu) — chờ mã thật S1 xác nhận có cần mở
  rộng không (ghi ở `semantics.md` §14 UNVERIFIED).
- Tier-B OQ-106…129 đã đóng dạng "đã áp dụng" (OQ-129 mới: gán `#fb.IN`,
  xem mục 21); chủ sản phẩm có quyền veto qua cơ chế R (OWNER-INBOX §6)
  — plan P1.3 không tạo R-entry riêng cho các OQ này (cùng thực tế với
  P1.2).
- Coverage: `vendor-siemens/src` 90,7% lines (cần ≥85%), `runtime-iec/src`
  97,1%. Các nhánh `throw` nội bộ trong lower còn lại (abs có path, gọi
  abs/FB trong biểu thức, arg convert sai số lượng, FB positional, CASE
  label không hằng, FOR var có path) **không tới được qua chương trình
  hợp lệ** (typecheck đã chặn) nên không có test trực tiếp — chỉ 4 throw
  tới được qua `TypecheckResult` crafted có test.
- Flaky đã thấy 1 lần: `tests/gen-diagnostics.test.ts` fail ENOENT
  (`apps/web/src/__probe-dep-bad.ts`) khi chạy full suite song song — file
  probe do một test khác tạo/xóa trong lúc scan; chạy lại và chạy lẻ đều
  pass (7/7). Không sửa (không phải lỗi P1.3); theo dõi ở gate cuối.
- Tiếp theo: P1.4 plan-first (interpreter/SoftPlc).

## 19. Kế hoạch P1.4 — Interpreter + scheduler + SoftPlc (plan-first, 2026-11-25)

**Điểm xuất phát:** P1.3 **đã merge PR #22** (merge commit `681e39d`, develop head `681e39d` — xác minh qua MCP read, `merged_at` 2026-11-25T00:24:17Z tức 2026-11-25 07:24 +07; CI 8 successful + 2 skipped). Tổng test hiện tại **1310**. Diagnostic: **42 mã**. PROMPTS P1.4 nguyên văn: "Làm P1.4 theo AGENTS.md §9 (plan-first). Đọc: … → AMENDMENTS (A1, A2, A12, D2, D3, E5) → M1 §7–8, 10, 12. Nhiệm vụ: interpreter (IR → closures), quy tắc số học bảng M1 §7.2 (mỗi quy tắc có dòng semantics.md + test), scheduler (OB1/OB100/cyclic OB), SoftPlc implements ControllerAdapter (step ĐỒNG BỘ, snapshot/restore) + ControllerIntrospection (read/write/force/unforce/listForces/start/stop), force, TagAddressMap. TRƯỚC KHI CODE: tự tính tay ≥ 6 scan (process image latch input đầu scan/ghi output cuối scan; OB100 một lần; cyclic OB). Gate: golden xanh; snapshot→restore→chạy lại cho trace giống hệt; lint chặn Date.now trong runtime-iec."

**Hiểu biết (tóm tắt):** (1) P1.4 là tầng thực thi đầu tiên: IR của P1.3 chỉ là cây có kiểu — mọi quyết định ngữ nghĩa runtime (§7.2 số học, §8 scan, §10 API) đều thành hành vi quan sát được ở đây. Sai ở đây là sai im lặng (chạy "gần đúng"), nên bảng tính tay (scan timing, process image, OB, số học, force/snapshot) phải tự tính trước, không sao chép từ implementation. (2) Đồ thị phụ thuộc quyết định vị trí: `runtime-iec` chỉ được import schemas/kernel/runtime-iec (dep-cruiser `runtime-iec-deps`) — SoftPlc + interpreter + TagAddressMap đều nằm ở `runtime-iec`, **không** import `vendor-siemens` (nên `parseAddress` của P1.1 không dùng được ở đây — xem OQ-137); `vendor-siemens` không được import kernel nên extension không nằm ở đó. (3) Hạ tầng đã sẵn, không cần sửa: `ControllerAdapter` + `ControllerIntrospection` đã khai báo ở `packages/kernel/src/component.ts` (D3, B8); `step(): void | Promise<void>` (A1 — SoftPlc đồng bộ, trả `void`); `snapshot()`/`restore()` bắt buộc (A2); `IoBus` + `IoPort` fast path (`readInputsInto`/`writeOutputsFrom`, không cấp phát) đã có; `createSimulation` + extension (`registerController('builtin:<vendor>')`, factory nhận `def` + `ctx`, `init` nhận `ControllerConfig` với `scanPeriodMs` đã tính theo D2 + `tags` của controller) đã có; `MemoryArea`/`DbStore` (big-endian, `snapshot()`/`restore()` theo byte) đã có; `layoutStruct` đã có; lint cấm `Date.now`/`performance.now`/`Math.random`/`new Date()` đã bao `packages/runtime-iec/src/**/*.ts` trong `CORE_FILES` (eslint.config.js) — **không cần sửa eslint**, gate chỉ cần probe chứng minh rule chặn (xem Gate). (4) Khoảng trống spec phải lấp bằng mặc định tier B + OQ: mô hình thời gian scan (nội suy đều hay "tại simTimeMs hiện tại"); số DB gán thế nào (`IrDb` không có số, chỉ có tên); period/phase của cyclic OB lấy từ đâu (`compileScl` không sinh `cycleMs`); `TagAddressMap` lấy từ đâu (constructor hay `init`); `write()`/`force()` vào từng loại ref ra sao; `callSys` khi chưa có std block (P1.5); intrinsics §7.3 (PROMPTS chỉ nêu §7.2 nhưng interpreter phải xử lý mọi `IrExpr` — xem OQ-144); golden runner YAML là P1.7 nên golden P1.4 là bảng TS (xem OQ-151). (5) X-002/S1 vẫn mở — P1.4 **không chờ** (xem OQ-152): interpreter thực thi đúng spec §7/§8, không theo mã thật; mã thật chỉ ảnh hưởng các mục VERIFY (§14) và P1.5 (system FB). (6) Chương trình P1.4 chạy được vẫn bị giới hạn bởi P1.3: system FB (`TON`…) → SCL-U001 ở compile nên IR hợp lệ không chứa `callSys` tới std block; `callSys` ở P1.4 chỉ là điểm cắm registry để P1.5 điền vào (OQ-143).

**Phạm vi (PROMPTS P1.4; M1 §7, §8, §10, §12.1–§12.2; AMENDMENTS A1, A2, A12, D2, D3, E5; M1 §17):**

| File | Nội dung |
|---|---|
| `packages/runtime-iec/src/faults.ts` | `RuntimeFault`, `RuntimeFaultCode` (8 mã, mục 2 thiết kế), `FaultCollector` (gom theo code+block+src, đếm) |
| `packages/runtime-iec/src/arithmetic.ts` | Hàm thuần §7.2: wrap Int/DInt/unsigned, `roundHalfEven` (banker's), `convertChecked` (mode round/trunc + CONV_RANGE), `intBinary` (cộng/trừ/nhân/chia/mod + OV/DIV_ZERO), `shiftOp` (SHL/SHR/ROL/ROR) |
| `packages/runtime-iec/src/intrinsics.ts` | `IntrinsicRegistry` + `createIntrinsicRegistry()` (§7.3: POWER, ABS, SQRT, MIN, MAX, LIMIT, SHL, SHR, ROL, ROR, CEIL, FLOOR, NORM_X, SCALE_X) |
| `packages/runtime-iec/src/tagmap.ts` | `TagAddressMap`, `TagAddr`, `buildTagAddressMap(tags)`, `parsePlcRef(ref, tagMap)`, `canonicalRef` (key force + hiển thị) |
| `packages/runtime-iec/src/interpreter.ts` | `Frame`, `Ref`, `DbView`, `Interpreter` (compile IR → closures một lần: `compileProgram`/`compileBlock`/`compileExpr`/`compileStmt`), `callBlock`, `maxCallDepth`/`maxLoopIterations` |
| `packages/runtime-iec/src/softplc.ts` | `SoftPlc` (ControllerAdapter + ControllerIntrospection), `SoftPlcConfig`, `SoftPlcSnapshot`, `ScanInfo`, scheduler §8.2/§8.3, force, snapshot/restore, `onScan` |
| `packages/runtime-iec/src/extension.ts` | `softPlcExtension(program, opts?)` — đăng ký factory `builtin:siemens` |
| `packages/runtime-iec/src/index.ts` | Export các kiểu/lớp/hàm mới trên |
| `packages/runtime-iec/src/arithmetic.test.ts` | Test hàm thuần §7.2 (bảng E ở mức hàm) |
| `packages/runtime-iec/src/intrinsics.test.ts` | Test §7.3 (mỗi hàm + biên) |
| `packages/runtime-iec/src/tagmap.test.ts` | Test map/parser/canonical + cross-test với `parseAddress` (P1.1) |
| `packages/runtime-iec/src/interpreter.test.ts` | Test closures/frame: eval expr, flow, TEMP reset, IN_OUT ref, call depth, loop limit |
| `packages/runtime-iec/src/softplc.test.ts` | Test API SoftPlc: load/start/stop/reset/init/read/write/force/diagnostics/onScan |
| `packages/runtime-iec/src/softplc-scan.test.ts` | Golden scan (bảng A–D, G): timing, process image, OB100/cyclic, block calls, flow |
| `packages/runtime-iec/src/softplc-snapshot.test.ts` | Golden force + snapshot/restore (bảng F) + tích hợp `makeSim` + `softPlcExtension` |
| `docs/semantics.md` | Thêm §15: interpreter/scheduler/SoftPlc, mỗi điểm gắn `VERIFIED`/`UNVERIFIED` |
| `docs/STATE.md`, `docs/open-questions.md` | Plan này (§19) + OQ-130…160 |

**Thiết kế nhỏ nhất (từng mục — signature chính xác, chỗ KHÔNG làm):**

1. **`faults.ts` — lỗi runtime gom lại, không bao giờ im lặng (§7.2).** `RuntimeFault` không nằm trong `DiagnosticCatalog` (nó là lỗi lúc chạy, không phải lỗi biên dịch — không thêm mã PRJ/SCL mới).
```ts
export type RuntimeFaultCode =
  | 'DIV_ZERO' | 'CONV_RANGE' | 'ARRAY_RANGE' | 'CALL_DEPTH'
  | 'LOOP_LIMIT' | 'CYCLE_OVERRUN' | 'SCAN_OVERRUN' | 'SYS_UNSUPPORTED';
export interface RuntimeFault {
  code: RuntimeFaultCode; blockName?: string; src?: SrcRef;
  simTimeMs: number; // thời điểm lần đầu ghi nhận
  count: number; // số lần ghi nhận (gom theo code + blockName + src)
  message: string; // thông điệp lần đầu (đối tượng + vị trí + nguyên nhân)
}
export class FaultCollector {
  record(code: RuntimeFaultCode, opts: { blockName?: string; src?: SrcRef; simTimeMs: number; message: string }): void;
  faults(): RuntimeFault[]; // theo thứ tự lần xuất hiện đầu tiên
  clear(): void;
  snapshot(): RuntimeFault[]; restore(f: RuntimeFault[]): void;
}
```
Quy tắc ghim: cùng (code, blockName, src) → `count++`, giữ `simTimeMs`/`message` lần đầu; khác `src` (hai dòng khác nhau) là hai fault riêng. `getDiagnostics().faults` map từ đây thành `{code, message, count}` (kernel `ControllerDiagnostics`).

2. **`arithmetic.ts` — hàm thuần, không trạng thái, test trực tiếp không cần SoftPlc.**
```ts
export function wrapInt16(x: number): number; // ((x + 32768) & 0xFFFF) - 32768
export function wrapInt32(x: number): number; // x | 0
export function wrapUnsigned(bits: 8 | 16 | 32, x: number): number; // x & ((1 << bits) - 1), 32-bit dùng >>> 0
export function roundHalfEven(x: number): number; // banker's: .5 về số chẵn gần nhất (2.5→2, 3.5→4, -2.5→-2, -3.5→-4)
export function convertChecked(from: PrimitiveType, to: PrimitiveType, value: number | boolean, mode?: 'round' | 'trunc')
  : { value: number | boolean; fault?: 'CONV_RANGE' };
export function intBinary(fn: 'add' | 'sub' | 'mul' | 'div' | 'mod', type: PrimitiveType, a: number, b: number)
  : { value: number; ov?: boolean; fault?: 'DIV_ZERO' };
export function shiftOp(fn: 'SHL' | 'SHR' | 'ROL' | 'ROR', type: PrimitiveType, value: number, count: number): number;
```
Quy tắc ghim (§7.2 + OQ): `Int` tràn → wrap 16-bit + `ov=true`; `DInt` tràn → wrap 32-bit (`ov` không đặt — spec chỉ nêu cờ OV cho `Int`); chia/mod số nguyên cho 0 → giá trị 0 + `DIV_ZERO` (OQ-133: `MOD` cũng vậy); `Real` sau mỗi phép tính → `Math.fround` (OQ-159; `LReal` giữ float64); `REAL_TO_INT`/`ROUND` → `roundHalfEven` rồi kiểm khoảng đích (ngoài khoảng/NaN → 0 + `CONV_RANGE`, OQ-150); `TRUNC` → cắt về 0 (`Math.trunc`); `CEIL`/`FLOOR` → `Math.ceil`/`Math.floor` (kết quả DInt, kiểm khoảng như convert); `SQRT` số âm → `NaN` (không fault); shift: độ rộng theo kiểu (Byte 8, Word/UInt/Int 16, DWord/UDInt/DInt 32), count ≥ độ rộng → 0, count < 0 → 0 (OQ-134), `SHR` số có dấu mở rộng dấu (`>>`), không dấu dùng `>>>`; `ROL`/`ROR` xoay trong độ rộng; `ABS` số nguyên nhỏ nhất → wrap về chính nó (OQ-134, vd `ABS(-32768: Int) = -32768`).

3. **`intrinsics.ts` — registry §7.3, P1.5 điền `callSys` vào registry riêng (không chung).**
```ts
export type IntrinsicFn = (args: TagValue[], type: PrimitiveType) => TagValue;
export interface IntrinsicRegistry { get(name: string): IntrinsicFn | undefined; }
export function createIntrinsicRegistry(): IntrinsicRegistry;
```
Registry mặc định chứa đúng 14 hàm: `POWER, ABS, SQRT, MIN, MAX, LIMIT, SHL, SHR, ROL, ROR, CEIL, FLOOR, NORM_X, SCALE_X` (OQ-144). Ngữ nghĩa: `POWER` = `Math.pow` (kết quả Real fround, LReal giữ nguyên); `ABS`/`SQRT`/`MIN`/`MAX` theo kiểu `type` (số nguyên wrap như mục 2, Real fround); `LIMIT(MN, IN, MX)` = `MIN(MAX(IN, MN), MX)`; `SHL`/`SHR`/`ROL`/`ROR` gọi `shiftOp` (mục 2); `CEIL`/`FLOOR` → DInt (kiểm khoảng, `CONV_RANGE` nếu ngoài — đi qua `convertChecked` ở interpreter, không tự fault trong registry: registry trả giá trị đã convert, interpreter ghi fault nếu có); `NORM_X(MIN, VALUE, MAX)` → `(VALUE − MIN) / (MAX − MIN)` float32 (fround từng bước? Không — tính double rồi fround kết quả một lần, OQ-159); `SCALE_X(MIN, VALUE, MAX)` → `VALUE * (MAX − MIN) + MIN`, kiểu ra nguyên thì làm tròn như `ROUND`; giá trị ngoài [0..1] **không kẹp** (VERIFY §14.4 — ghi `UNVERIFIED` ở semantics §15). Tên intrinsic không có trong registry → lỗi nội bộ ở compile (throw ồn ào — không tới được qua IR hợp lệ vì lower chỉ sinh tên đã biết).

4. **`tagmap.ts` — ánh xạ tag ↔ địa chỉ (A12, C2, M1 §10).**
```ts
export interface TagAddr { area: 'I' | 'Q' | 'M' | 'DB'; byte: number; bit?: number; db?: number; type: PrimitiveType; }
export type TagAddressMap = ReadonlyMap<string, TagAddr>; // key = tên tag (giữ nguyên case)
export function buildTagAddressMap(tags: readonly TagDef[]): TagAddressMap;
export type ParsedRef =
  | { k: 'abs'; area: 'I' | 'Q' | 'M'; byte: number; bit?: number; width: 8 | 16 | 32 | 64; type: PrimitiveType }
  | { k: 'absDb'; db: number; byte: number; bit?: number; width: 8 | 16 | 32 | 64; type: PrimitiveType }
  | { k: 'dbField'; db: string; path: string[] }
  | { k: 'tag'; name: string };
export function parsePlcRef(ref: string, tagMap: TagAddressMap): ParsedRef; // sai cú pháp/không tìm thấy → throw RangeError nêu ref
export function canonicalRef(parsed: ParsedRef, tagMap: TagAddressMap): string; // key force + chuỗi hiển thị trong listForces
```
Quy tắc ghim: `buildTagAddressMap` dùng `TagDef.address` + `TagDef.type` đã khai báo (không diễn giải lại theo OQ-110 — tag khai báo kiểu tường minh); địa chỉ `sym:` → throw `Error('TagAddressMap: sym: chưa hỗ trợ (P5.7)')` (OQ-137); tên tag trùng → throw (loud); `parsePlcRef` nhận: `%I0.0`, `%MW10`, `%MD0`, `%Q0.0`, `%M0.0`, `DB1.DBW4`, `DB1.DBX0.0`, `"DB_Name".field[.sub]`, tên tag symbolic (tra map); `#name`/`sym:` → throw; kiểu mặc định cho abs trần theo OQ-110 (bit→Bool, 8→Byte, 16→Int, 32→DInt); `canonicalRef` chuẩn hóa mọi dạng về một key: abs → `%I0.0`/`%MW10` (kèm width để `%MB10` ≠ `%MW10`), absDb → `DB1.DBW4`, dbField → `"DB".field`, tag → dạng abs tương ứng (OQ-142 — force bằng tên tag và bằng địa chỉ là cùng một force). Parser này là bản sao nhỏ của `vendor-siemens` `parseAddress` (P1.1) — **không** di chuyển code P1.1 sang (Đã loại #8); test cross-check hai parser cho ra cùng area/byte/bit/type trên mọi dạng địa chỉ (tiền lệ P0.8 `TYPE_RANGES` cross-test).

5. **`interpreter.ts` — IR → closures một lần, không duyệt cây mỗi scan (§6).**
```ts
export interface Ref { get(): TagValue; set(v: TagValue): void; }
export interface DbView { store: DbStore; fields: IrField[]; base: number; } // view vào store tại offset (multi-instance lồng)
export interface Frame {
  temp: Map<string, TagValue>; // VAR_TEMP + biến local FC — cấp phát mới mỗi lần gọi, reset về mặc định kiểu
  vars: Map<string, TagValue>; // FC: VAR_INPUT/OUTPUT + local tên FC (giá trị trả); OB: VAR_TEMP (dùng chung temp)
  instance?: DbView; // instance DB của FB đang chạy
  inout: Map<string, Ref>; // IN_OUT: tham chiếu tới LValue nơi gọi (OQ-148)
  returnValue?: TagValue;
  loopDepth: number;
  flow: 'normal' | 'exit' | 'continue' | 'return';
  ov: boolean; // cờ tràn Int (§7.2), xóa ở đầu mỗi scan (OQ-135)
  depth: number; // độ sâu lời gọi (OB = 0; vượt maxCallDepth → CALL_DEPTH, bỏ qua lời gọi — OQ-157)
}
export interface CompiledBlock { id: string; kind: 'OB' | 'FC' | 'FB'; run(frame: Frame): void; }
export class Interpreter {
  constructor(program: IrProgram, mem: PlcMemory, faults: FaultCollector, opts?: {
    intrinsics?: IntrinsicRegistry; sysCalls?: Map<string, SysCallHandler>;
    maxCallDepth?: number; maxLoopIterations?: number;
  });
  runBlock(blockId: string, frame: Frame): void;
  // nội bộ (không export khỏi package): compileExpr/compileStmt/compileBlock, resolveLValue, readMem/writeMem
}
export type SysCallHandler = (instance: DbView | undefined, inArgs: Map<string, TagValue>, outArgs: Map<string, Ref>, nowMs: number) => void;
export interface PlcMemory { i: MemoryArea; q: MemoryArea; m: MemoryArea; dbs: Map<string, DbStore>; dbNumbers: Map<string, number>; }
```
Quy tắc ghim: compile ở constructor (mỗi node IR → closure một lần); statement biên dịch trả `void` và đặt `frame.flow`, sequence dừng khi `flow !== 'normal'` (không throw cho điều khiển luồng — không cấp phát ở đường nóng); vòng lặp: `FOR` bao hàm hai đầu, kiểm tra tràn trước khi tăng (§7.2), `by` mặc định 1, 0 lần lặp khi hướng sai (OQ-149); `WHILE`/`REPEAT` kiểm `maxLoopIterations` (mặc định 10_000, OQ-132) → vượt thì `LOOP_LIMIT`, thoát vòng lặp, chạy tiếp sau vòng lặp; `EXIT`/`CONTINUE`/`RETURN` đặt `flow` tương ứng, vòng lặp dịch `continue` → normal + lặp tiếp, `exit` → normal + thoát, `return` → lan truyền; `callFcExpr`/`callFc`: frame mới (temp/vars mới, `depth+1`), copy IN, chạy, đọc local tên FC làm giá trị trả (OQ-112), `ret` ghi ra nếu có; `callFb`: resolve instance thành `DbView` (xem mục 6), copy IN vào field input của view, chạy với `frame.instance = view`, copy OUT ra `outArgs`, IN_OUT qua `Ref` (ghi thẳng nơi gọi, không copy-back — OQ-148); `callSys`: tra `sysCalls` — không có handler → `SYS_UNSUPPORTED`, bỏ qua lời gọi, chạy tiếp (OQ-143); `index`: chỉ số ngoài khoảng → đọc 0/false + `ARRAY_RANGE`, ghi bỏ qua + `ARRAY_RANGE` (chỉ số không nguyên → lỗi nội bộ throw — typecheck đã chặn); `load`/`assign`: đọc/ghi qua `resolveLValue` → `Ref` (local/static/dbField/abs/absDb/index/member — xem mục 6); mọi giá trị Real ghi vào bộ nhớ đều `Math.fround` trước (memory.ts đã fround ở `write`, interpreter fround cả giá trị trong frame trước khi so sánh — OQ-159); `convert` → `convertChecked` (fault `CONV_RANGE` ghi vào collector với `blockName`/`src` của statement chứa nó); `intrinsic` → registry (tên không có → throw nội bộ ồn ào).

6. **Phân giải LValue → storage (interpreter nội bộ, dùng `DbView` + layout P1.1/P1.3).** `local`: tra interface block đang chạy — tên thuộc `input`/`output` của FB → field trong `frame.instance` (đường dẫn `[tên]`); tên thuộc `static` → field trong `frame.instance` (đường dẫn `[tên, ...]`); tên thuộc `inout` → `frame.inout.get(tên)` (Ref); tên thuộc `temp` (hoặc mọi local của FC/OB) → `frame.temp`/`frame.vars`; tên = tên block FC → `frame.vars` (local giá trị trả, OQ-112). `static` path `[a, b, ...]`: đi từ `frame.instance`, mỗi bước tra field trong layout (struct lồng = multi-instance, §3.5); field là system FB (`TON`…) không tới được (U001 ở compile). `dbField` `{db, path}`: store = `mem.dbs.get(db)` (không có → throw nội bộ ở load — xem mục 7), đi theo path bằng layout `IrDb.fields`. `member` `{base, field}`: resolve `base` thành `DbView` rồi đi tiếp một field (P1.3 lệch #14). `abs`/`absDb`: memory area theo `area`/`db` + `byte`/`bit`/`width` (bit → `getBit`/`setBit`, còn lại `read`/`write` với `type`; width 8 cho bit là quy ước P1.3 lệch #4 — interpreter dùng `bit !== undefined` để chọn đường bit, không dùng width). `index`: base → `DbView`/mảng trong frame, chỉ số tính từ `IrExpr` (phải nguyên — typecheck đã chặn; ngoài khoảng → `ARRAY_RANGE` như mục 5). Đọc `%M`/DB: trực tiếp, tức thời (§8.4). Đọc `%I`: từ PII (`mem.i`, đã latch đầu scan). Đọc `%Q`: từ PIQ (`mem.q`, giá trị vừa ghi trong cùng scan — VERIFY §14.10, ghi `UNVERIFIED`). Ghi `%Q`: vào PIQ (chỉ cuối scan mới đẩy ra IoBus). **Kích thước vùng nhớ** tính ở `load()`: quét toàn bộ `IrProgram` (mọi `abs`/`absDb` + mọi tag trong `TagAddressMap` dùng cho latch/output) lấy `byte + ceil(width/8)` lớn nhất cho từng area I/Q/M (tối thiểu 0); DB sized theo `IrDb.size`; DB không dùng tới vẫn cấp phát đủ `size` (snapshot/restore cần đủ). **Số DB** (OQ-136): `load()` gán số 1..n cho các `IrDb` theo thứ tự `id` đã sắp xếp (IrProgram mảng đã sort ở P1.3); `absDb` với số ngoài 1..n → `load()` throw `RangeError` nêu block/src; `dbField` với tên DB không có → `load()` throw. Số DB này chỉ dùng nội bộ cho `absDb`; TIA numbering thật là việc P5.7/SimaticML.

7. **`softplc.ts` — CPU + scheduler (§8, §10; A1, A2, D2, D3).**
```ts
export interface SoftPlcConfig {
  id: string; scanPeriodMs: number; maxScansPerStep?: number; // mặc định 50 (M1 §17)
  faultPolicy?: 'continue' | 'stop'; // mặc định 'continue'
  maxCallDepth?: number; // mặc định 24 (§7.1)
  maxLoopIterations?: number; // mặc định 10_000 (OQ-132)
  outputsOnStop?: 'zero' | 'hold'; // mặc định 'zero' (§17)
}
export interface ScanInfo { scanTimeMs: number; scanCount: number; }
export interface SoftPlcSnapshot {
  version: 1; state: 'STOP' | 'RUN';
  scanCount: number; lastScanSimMs: number; accMs: number; lastScanTimeMs: number | null;
  ob100Done: boolean; cyclic: { ob: number; lastIdx: number }[];
  memI: number[]; memQ: number[]; memM: number[]; // byte theo từng vùng (OQ-147)
  dbs: { name: string; bytes: number[] }[];
  forces: { ref: string; value: TagValue }[]; // ref đã chuẩn hóa (OQ-142)
  faults: RuntimeFault[];
}
export class SoftPlc implements ControllerAdapter, ControllerIntrospection {
  constructor(program: IrProgram, tagMap: TagAddressMap, cfg: SoftPlcConfig);
  readonly id: string; readonly kind: 'builtin';
  load(program: IrProgram): void; // yêu cầu STOP (không thì throw); gán số DB (OQ-136); xóa forces + reset trạng thái (OQ-139)
  start(): void; stop(): void; reset(): void; // reset = cold: bộ nhớ về init, xóa forces/faults/scanCount/acc/cyclic (OQ-140)
  step(simTimeMs: number, dtMs: number): void; // ĐỒNG BỘ (A1), trả void
  read(ref: string): TagValue; write(ref: string, v: TagValue): void;
  force(ref: string, v: TagValue): void; unforce(ref: string): void;
  listForces(): { ref: string; value: TagValue }[];
  getDiagnostics(): ControllerDiagnostics;
  snapshot(): SoftPlcSnapshot; restore(s: unknown): void; // s sai hình → throw (loud)
  onScan(cb: (info: ScanInfo) => void): Unsub;
  init(cfg: ControllerConfig, io: IoBus): Promise<void>; // build lại TagAddressMap từ cfg.tags (OQ-138); scanPeriodMs lấy từ cfg (D2); gọi 2 lần → throw
}
```
**Scheduler (§8.2, OQ-130 — mô hình lưới thời gian đều):** trạng thái: `accMs`, `lastScanTimeMs: number | null` (null = chưa rebase), `scanCount`, `lastScanSimMs`, `ob100Done`, `cyclicLastIdx: Map<ob, number>`. `step(T, dt)`: STOP → no-op; `dt < 0` → `RangeError`; `T < lastScanTimeMs` (khi đã set) → `RangeError` (OQ-160); nếu `lastScanTimeMs === null` → rebase: `lastScanTimeMs = T`, `cyclicLastIdx` mỗi OB = `floor((T − phaseMs) / periodMs)`; `accMs += dt`; `n = floor(accMs / scanPeriodMs)`; nếu `n > maxScansPerStep` → `SCAN_OVERRUN` count += `n − maxScansPerStep`, `n = maxScansPerStep` (phần acc thừa GIỮ LẠI để bắt kịp ở bước sau — OQ-131); lặp `k = 1..n`: `scanTime = lastScanTimeMs + scanPeriodMs`, chạy scan tại `scanTime`, `lastScanTimeMs = scanTime`; `accMs −= n * scanPeriodMs`. Hệ quả ghim (bảng A): stepMs = scanPeriodMs = 10 → scan tại 10, 20, 30… (không phải 0, 10, 20); `start()` rebase lại lưới (không reset bộ nhớ — chỉ `reset()` làm việc đó, OQ-154). **Một scan tại `t` (§8.2 bước 3):** (a) latch: `IoPort.readInputsInto` (mảng tái dùng, không cấp phát) → ghi từng input tag vào PII theo `TagAddressMap`, rồi áp force I (OQ-142); không có `io` (dùng trực tiếp, chưa `init`) → bỏ qua latch/output; (b) nếu là scan đầu sau RUN (`!ob100Done`): chạy OB100 (block có `organization.ob === 100`) một lần, `ob100Done = true` (không có OB100 → bỏ qua im lặng — không phải lỗi); (c) cyclic OB đến hạn: `idx = floor((t − phaseMs) / periodMs)`, đến hạn khi `idx > lastIdx`, mỗi OB tối đa 1 lần/scan, chạy theo số OB tăng dần, trễ bỏ qua: `CYCLE_OVERRUN` count += `idx − lastIdx − 1`, rồi `lastIdx = idx` (OQ-145); (d) chạy OB1 (block có `organization.ob === 1`); không có OB1 → scan chạy 0 block (vẫn latch/output, vẫn đếm scan — OQ-146); (e) áp force Q rồi `IoPort.writeOutputsFrom` (mảng tái dùng) từ PIQ; `scanCount++`, `lastScanSimMs = t`, xóa `frame.ov` ở đầu scan (OQ-135), gọi `onScan({scanTimeMs: t, scanCount})`; nếu `faultPolicy === 'stop'` và có fault mới trong scan → `stop()` sau khi scan xong (OQ-158). **STOP/RUN (§8.1, OQ-153/154):** `start()` khi đã RUN → no-op; `stop()` khi đã STOP → no-op; `start()` không reset bộ nhớ; STOP→RUN re-arms OB100 (`ob100Done = false` + rebase lưới ở bước kế); vào STOP: Q về 0 ngay nếu `outputsOnStop === 'zero'` (mặc định) — `stop()` đẩy ảnh Q ra IoBus ngay (không chờ scan), `hold` thì giữ nguyên; `reset()` = cold (OQ-140). **`read`/`write` (OQ-141):** `read`: `%I` → PII, `%Q` → PIQ, `%M`/DB → bộ nhớ trực tiếp, tất cả force-aware (force thắng); tên tag symbolic → qua map; `"DB".field` → DbView; ref không tìm thấy → throw `RangeError` nêu ref; `sym:` → throw `Error` chưa hỗ trợ. `write`: `%I` → ghi PII (thấy tới lần latch kế), `%Q` → ghi PIQ (thấy ngay trong scan, đẩy ra ở output update kế), `%M`/DB → ghi trực tiếp; ghi vào ref đang force → bỏ qua (force thắng, không báo lỗi — force là trạng thái hiển thị, xem bảng F3); kiểu sai → throw `TagError('TAG-E001')` qua `validateTagValue`. **`force`/`unforce`/`listForces` (OQ-142):** `force` validate kiểu như `write` (sai → TAG-E001); force lưu theo key chuẩn hóa (mọi dạng ref cùng địa chỉ là một force); `unforce` ref không có force → no-op (không throw); `listForces` trả ref dạng chuẩn (`%I0.0`, `%MW10`, `"DB".field`) + giá trị, sắp xếp theo ref. **Snapshot/restore (A2, §10, §16.8):** `snapshot()` chụp đủ để tái lập hoàn toàn: state, scanCount, lastScanSimMs, accMs, lastScanTimeMs, ob100Done, cyclic lastIdx, toàn bộ byte I/Q/M/DB (dạng `number[]` — OQ-147), forces, faults; `restore(s: unknown)` validate `version === 1` + đủ trường + độ dài byte khớp vùng nhớ (sai → throw `RangeError`/`Error` nêu trường sai); restore xong chạy tiếp cho trace giống hệt (gate — bảng F6/F7). **Diagnostics:** `getDiagnostics()` → `{state, scanCount, lastScanSimMs, faults: [{code, message, count}]}` (map từ `FaultCollector`; `info` không dùng ở P1.4). **`onScan`:** gọi sau mỗi scan (sau output update); lỗi trong callback → lan truyền ra `step()` (loud — orchestrator xử lý theo errorPolicy).

8. **`extension.ts` — nối SoftPlc vào `createSimulation` (OQ-155).**
```ts
export function softPlcExtension(program: IrProgram, opts?: {
  faultPolicy?: SoftPlcConfig['faultPolicy']; maxCallDepth?: number;
  maxLoopIterations?: number; maxScansPerStep?: number; outputsOnStop?: SoftPlcConfig['outputsOnStop'];
}): SimulationExtension;
```
Factory đăng ký `builtin:siemens` → `new SoftPlc(program, emptyTagMap, { id: def.id, scanPeriodMs: 20 })`; `init(cfg, io)` ghi đè `scanPeriodMs` bằng `cfg.scanPeriodMs` (D2 — builder đã tính `def.config.scanPeriodMs ?? simulation.plcScanMs`) và build lại `TagAddressMap` từ `cfg.tags` (OQ-138). Extension KHÔNG thêm vào `apps/cli/src/extensions.ts` / `apps/server/src/extensions.ts` ở P1.4 (chưa có nguồn program từ project file — việc đó là P1.7 `compileProject`); test dùng `makeSim(project, { extensions: [softPlcExtension(program)] })`.

**Đã loại:** (1) Golden runner YAML (`runtime-iec/golden/*.golden.yaml` + runner, M1 §12.1) — P1.7; golden P1.4 là bảng TS tính tay, mỗi test ghi `expectedFrom: 'spec'` trong tên/comment (OQ-151). (2) Phương thức `scanAt(t)` công khai — test điều khiển qua `step(T, dt)`; P1.7 có thể thêm điểm vào scan trực tiếp cho runner (OQ-156). (3) CLI (`vcs plc run`, demo `motor-interlock`, Watch) — P1.7. (4) std blocks `TON`/`CTU`/`R_TRIG`/… — P1.5; P1.4 chỉ có điểm cắm `sysCalls` + fault `SYS_UNSUPPORTED`. (5) LAD — P1.6. (6) `compileProject` nhiều file — P1.7. (7) Số DB thật từ TIA — P5.7; P1.4 gán 1..n theo id đã sort (OQ-136). (8) Di chuyển `parseAddress` từ `vendor-siemens` sang `runtime-iec` — giữ nguyên code P1.1 đã test; `tagmap.ts` viết parser nhỏ riêng + cross-test (OQ-137). (9) Warm restart / retentive — M1 §8.1: không có; `reset()` luôn cold. (10) ENO/OV đọc được từ SCL — IR không có đường đọc; OV chỉ theo dõi trên frame (OQ-135). (11) Mã diagnostic mới — `RuntimeFault` không vào catalog (D6 chỉ áp cho diagnostic biên dịch). (12) Benchmark M1 §12.4 (200 FB_Motor, ≥ 1000 scan/s) — P1.7; P1.4 chỉ giữ quy tắc không cấp phát ở đường nóng (closures build một lần, mảng IO tái dùng, fault là ngoại lệ duy nhất được cấp phát) + đo smoke một lần ghi vào STATE (không ngưỡng, không gate). (13) `step()` bất đồng bộ — A1: SoftPlc đồng bộ, `asyncStep` không đặt (mặc định false). (14) Thay đổi `.dependency-cruiser.cjs` / `eslint.config.js` / `vitest.config.ts` / `packages/kernel` / `packages/schemas` — không cần: rule đã cho phép (runtime-iec ← kernel; lint đã chặn Date.now ở runtime-iec; ngưỡng coverage 85 đã có cho runtime-iec).

**Bảng tính tay A — scan timing (mô hình lưới đều, OQ-130; stepMs = 10 trừ khi ghi khác):**

| # | Cấu hình | Diễn biến | Kỳ vọng |
|---|---|---|---|
| A1 | period 20, `start()` ở T=0 | step T=0 dt=10: acc 0→10, 0 scan. step T=10: acc 10→20, n=1, scan tại 0+20=20, acc=0. step T=20: acc 10. step T=30: scan tại 40. | Sau 10 bước (T=0..90, clock=100): scan tại 20,40,60,80,100; scanCount=5, lastScanSimMs=100, acc=0 |
| A2 | period 20, dt=50 | step T=0 dt=50: acc 0→50, n=2, scan tại 20, 40; acc=10. step T=50 dt=50: acc 10→60, n=3, scan tại 60, 80, 100; acc=0. | Scan tại 20,40,60,80,100 — lưới đều 20, không trôi |
| A3 | period 20, dt=1200, maxScans=50 | step T=0: acc=1200, n_raw=60 → cap 50, scan tại 20..1000 (cách 20); acc giữ 200; SCAN_OVERRUN count += 10. step T=1200 dt=10: acc 200→210, n=10, scan tại 1020..1200; acc=10. | scanCount=60 sau 2 bước; SCAN_OVERRUN count=10; lưới vẫn đều |
| A4 | period 20, STOP giữa chừng | 3 scan (20,40,60) rồi `stop()`; 5 bước nữa (T=60..100) | scanCount giữ 3; không scan mới; Q về 0 ngay khi `stop()` (outputsOnStop 'zero') |
| A5 | period 20, restart | Sau A4: `start()` rồi step T=110 dt=10 (rebase lastScanTime=110, acc=10), step T=120: scan tại 130 | Scan đầu sau restart tại 130 (lưới rebase, không phải 120); OB100 chạy lại ở scan này |
| A6 | period 10 (= stepMs) | step T=0: acc=10, n=1, scan tại 10. step T=10: scan tại 20. | Scan tại 10,20,30… (không có scan tại 0) — ghim khác biệt với mô hình "scan tại T" |

**Bảng tính tay B — process image (§8.4; period 10, stepMs 10, scan tại 10,20,…):**

Chương trình B1 (OB "Main", VAR_TEMP `t : Bool`):
```
#t := %I0.0;
%Q0.0 := #t;
%Q0.1 := %Q0.0;
%I0.1 := %I0.0;
#t := %I0.1;
%M0.0 := #t;
```
| Scan | TagDB I0.0 trước step | PII sau latch | Q0.0/Q0.1 sau scan | M0.0 sau scan | Ghi chú |
|---|---|---|---|---|---|
| t=10 | TRUE | I0.0=1, I0.1=0 | 1 / 1 | 1 | Q0.1=1 chứng minh đọc `%Q` thấy giá trị vừa ghi cùng scan; `#t := %I0.1` = 1 chứng minh ghi `%I` vào PII |
| t=20 | FALSE | I0.0=0, I0.1=0 (latch ghi đè giá trị chương trình ghi ở scan trước) | 0 / 0 | 0 | Latch đầu scan ghi đè PII |

Chương trình B2 (chỉ `IF %I0.0 THEN %M0.0 := TRUE; END_IF;`): scan t=10 với I0.0=TRUE → M0.0=1; scan t=20 với I0.0=FALSE → M0.0 vẫn 1 (không ghi → giữ; `%M` trực tiếp, không latch).

**Bảng tính tay C — OB100 một lần + cyclic OB (§8.3; stepMs 10, OB1 period 20, scan tại 20,40,…):**

Chương trình: OB100: `%MW2 := 1;` · OB35 (period 100, phase 0): `%MW4 := %MW4 + 1;` · OB1: `%MW0 := %MW0 + 1;` (MW init 0).

| Sau scan | MW0 (OB1) | MW2 (OB100) | MW4 (OB35) | Ghi chú |
|---|---|---|---|---|
| t=20 | 1 | 1 | 0 | OB100 chạy ở scan đầu; OB35 idx floor(20/100)=0, lastIdx init 0 → chưa đến hạn |
| t=40,60,80 | 2,3,4 | 1 | 0 | Chỉ OB1 |
| t=100 | 5 | 1 | 1 | OB35 idx=1 > 0 → đến hạn, chạy TRƯỚC OB1 |
| t=200 | 10 | 1 | 2 | OB35 idx=2 → đến hạn |

Biến thể C-overrun (OB1 period 200, OB35 period 100 phase 0; scan tại 200,400,600): scan t=200: OB35 idx=2 > lastIdx 0 → chạy 1 lần, trễ 1 kỳ (idx 1) → CYCLE_OVERRUN count=1, MW4=1; t=400: idx=4 → chạy, overrun=2, MW4=2; t=600: MW4=3, overrun=3. Biến thể C-phase (OB35 period 100 phase 30, OB1 period 20): đến hạn ở scan t=40 (idx 0 > lastIdx floor((0−30)/100)=−1), t=140 (idx 1), t=240 (idx 2) → sau scan t=140: MW4=2, overrun=0.

**Bảng tính tay D — gọi block: FB + IN_OUT + TEMP + độ sâu + giới hạn vòng lặp:**

FB `FB_Latch` (VAR_INPUT `iSet, iReset : Bool`; VAR_OUTPUT `qOut : Bool`; VAR `sLatched : Bool`; VAR_IN_OUT `ioCount : Int`):
```
IF #iSet THEN #sLatched := TRUE; END_IF;
IF #iReset THEN #sLatched := FALSE; END_IF;
#qOut := #sLatched;
#ioCount := #ioCount + 1;
```
OB1: `"FB_Latch_DB"(iSet := %I0.0, iReset := %I0.1, ioCount := %MW10); %Q0.0 := "FB_Latch_DB".qOut;` (MW10 init 0; period 10, scan tại 10,20,30,40):

| Scan | I0.0 / I0.1 trước step | sLatched | qOut / Q0.0 | MW10 | Ghi chú |
|---|---|---|---|---|---|
| t=10 | 0 / 0 | FALSE | 0 | 1 | IN_OUT tăng mỗi scan dù không set/reset |
| t=20 | 1 / 0 | TRUE | 1 | 2 | iSet chốt |
| t=30 | 0 / 0 | TRUE | 1 | 3 | static giữ giữa các scan |
| t=40 | 0 / 1 | FALSE | 0 | 4 | iReset xả; MW10 chứng minh IN_OUT ghi thẳng nơi gọi |

TEMP reset — FC `FC_Temp` (VAR_INPUT `x : Int`; VAR_TEMP `t : Int`; body `#t := #t + #x; "FC_Temp" := #t;`), OB1: `%MW12 := "FC_Temp"(x := 5);`: scan 1 → MW12=5 (`t` bắt đầu 0); scan 2 → MW12=5 (không phải 10 — TEMP không giữ). Độ sâu — chuỗi FC_1→…→FC_25, mỗi FC trả `FC_{k+1}() + 1`, FC_25 trả 0, maxCallDepth=24 (OB depth 0): lời gọi tới FC_25 (depth 25) → CALL_DEPTH, bỏ qua, trả mặc định 0 → FC_24=1, …, FC_1=24; CALL_DEPTH count=1. Giới hạn vòng lặp — `WHILE TRUE DO #i := #i + 1; END_WHILE;` (`#i` init 0): sau 10_000 lần lặp → LOOP_LIMIT count=1, thoát vòng lặp, `#i`=10000, chạy tiếp sau vòng lặp.

**Bảng tính tay E — số học §7.2 (tính tay, mỗi case là một gán trong OB rồi đọc kết quả):**

| # | Biểu thức | Kết quả | Fault / cờ |
|---|---|---|---|
| E1 | `32767 + 1` (Int) | −32768 | ov=true |
| E2 | `−32768 − 1` (Int) | 32767 | ov=true |
| E3 | `32767 * 2` (Int) | −2 (65534 wrap: ((65534+32768) & 0xFFFF) − 32768 = 32766 − 32768) | ov=true |
| E4 | `2147483647 + 1` (DInt) | −2147483648 | (không đặt ov) |
| E5 | `7 / 2`, `−7 / 2`, `7 MOD 2`, `−7 MOD 2` (Int) | 3, −3, 1, −1 | cắt về 0; MOD dấu theo số bị chia |
| E6 | `7 / 0`, `7 MOD 0` (Int) | 0, 0 | DIV_ZERO ×1 mỗi phép |
| E7 | `1.0 / 0.0`, `−1.0 / 0.0`, `0.0 / 0.0` (Real) | +Infinity, −Infinity, NaN | không fault (IEEE) |
| E8 | `SQRT(−1.0)`, `SQRT(4.0)` | NaN, 2.0 | không fault |
| E9 | `REAL_TO_INT`: 2.5, 3.5, −2.5, −3.5, 0.5, 1.5 | 2, 4, −2, −4, 0, 2 | banker's rounding |
| E9b | `TRUNC(2.9)`, `TRUNC(−2.9)`, `CEIL(2.1)`, `CEIL(−2.1)`, `FLOOR(2.9)`, `FLOOR(−2.9)` | 2, −2, 3, −2, 2, −3 | TRUNC cắt về 0 |
| E10 | `REAL_TO_INT(40000.0)`, `REAL_TO_INT(NaN)` | 0, 0 | CONV_RANGE ×1 mỗi phép |
| E10b | `INT_TO_REAL(16777217)` | 16777216.0 | 2^24+1 không biểu diễn được ở float32 → fround |
| E11 | `#r := 0.1 + 0.2; #b := #r = 0.3;` | `#r` = 0.30000001192092896, `#b` = TRUE | cả hai vế fround về cùng float32 |
| E12 | Word `16#0001 SHL 3`, `SHL 16`, Int `−1 SHR 1`, Word `16#8000 SHR 1`, Byte `16#81 ROL 1`, `ROR 1`, SHL count −1 | `16#0008`, 0, −1, `16#4000`, `16#03`, `16#C0`, 0 | shift ≥ độ rộng → 0; SHR có dấu mở rộng dấu; count âm → 0 |
| E13 | `#a : Array[0..3] of Int`, đọc `#a[5]`, ghi `#a[5] := 7` | đọc 0; ghi bỏ qua, `#a[0..3]` không đổi | ARRAY_RANGE ×1 mỗi lần |
| E14 | `FOR #i := 1 TO 3`, `3 TO 1 BY −1`, `5 TO 1 BY 1`, `32766 TO 32767` (Int) | 3 lần, 3 lần, 0 lần, 2 lần (32766, 32767 — không tràn) | bao hàm hai đầu; kiểm tràn trước khi tăng |
| E15 | `NORM_X(0, 5, 10)`, `SCALE_X(0, 0.5, 10)`, `NORM_X(0, 15, 10)`, `SCALE_X(0, 2.0, 10)` | 0.5, 5.0, 1.5, 20.0 | ngoài [0..1] không kẹp (UNVERIFIED §14.4) |
| E16 | `MIN(3, 7)`, `MAX(3, 7)`, `LIMIT(0, −5, 10)`, `LIMIT(0, 15, 10)`, `LIMIT(0, 5, 10)` | 3, 7, 0, 10, 5 | |
| E17 | `#r := 7;` (`#r` Real, `#x` Int = 7) | 7.0 | widening Int→Real |

**Bảng tính tay F — force + snapshot/restore (chương trình đếm: OB1 `#c := #c + 1; %Q0.0 := #c >= 3;` với `#c` là static? Không — dùng `%MW0 := %MW0 + 1; %Q0.0 := %MW0 >= 3;`):**

| # | Thao tác | Kỳ vọng |
|---|---|---|
| F1 | Force `%I0.0` = TRUE (IoBus FALSE); scan | Chương trình thấy `%I0.0` = TRUE. `unforce` → scan kế thấy FALSE |
| F2 | Force `%Q0.0` = TRUE; chương trình ghi FALSE; scan xong | IoBus `%Q0.0` = TRUE (force thắng ở output update). `listForces()` = `[{ref: "%Q0.0", value: true}]`. `unforce` → giá trị chương trình chảy lại |
| F3 | Force `%M0.0` = TRUE; chương trình ghi `%M0.0 := FALSE`; đọc `read("%M0.0")` | Đọc = TRUE (force thắng); bộ nhớ M0.0 vẫn FALSE (ghi bị bỏ qua, không đổi bộ nhớ). `unforce` → đọc = FALSE |
| F4 | Force `"DB_X".run` = TRUE; chương trình ghi FALSE | Đọc = TRUE; ghi bỏ qua |
| F5 | Force bằng tên tag `"START_PB"` (map → `%I0.0`) | `listForces()` hiện `{ref: "%I0.0", value: …}` (dạng chuẩn, OQ-142); force lại bằng `"%I0.0"` ghi đè cùng force (không tạo 2 force) |
| F6 | Chạy 5 scan (MW0=5, scanCount=5, Q0.0=TRUE vì 5≥3) → snapshot S; chạy 3 scan nữa (MW0=8, scanCount=8, ghi trace Q0.0 = [1,1,1]) → `restore(S)` → chạy 3 scan | MW0=8, scanCount=8, trace Q0.0 = [1,1,1] giống hệt; faults giống hệt (kể cả count) |
| F7 | Force `%I0.0`=TRUE → snapshot → `unforce` → `restore` | `listForces()` hiện lại force `%I0.0` (force nằm trong snapshot) |
| F8 | Tích hợp orchestrator: `makeSim` + `softPlcExtension`, chạy 5 bước, `snapshotAll`, chạy 3 bước (ghi TagDB Q0.0), `restoreAll`, chạy 3 bước | TagDB Q0.0 + scanCount + simTime giống hệt sau restore |

**Bảng tính tay G — điều khiển luồng (mỗi case 1 chương trình OB nhỏ, kết quả cuối sau 1 scan trừ khi ghi khác):**

| # | Chương trình | Kỳ vọng |
|---|---|---|
| G1 | `CASE #n OF 1..3: #r := 1; 5: #r := 2; ELSE #r := 3; END_CASE;` với `#n` = 2 / 5 / 9 | `#r` = 1 / 2 / 3 |
| G2 | `#i := 0; WHILE #i < 10 DO #i := #i + 1; IF #i = 3 THEN EXIT; END_IF; END_WHILE;` | `#i` = 3 |
| G3 | `FOR #i := 1 TO 5 DO IF #i MOD 2 = 0 THEN CONTINUE; END_IF; #s := #s + #i; END_FOR;` (`#s` init 0) | `#s` = 9 (1+3+5) |
| G4 | `#r := 1; RETURN; #r := 2;` | `#r` = 1 (lệnh sau RETURN không chạy) |
| G5 | `#i := 0; REPEAT #i := #i + 1; UNTIL TRUE; END_REPEAT;` | `#i` = 1 (REPEAT chạy ít nhất 1 lần) |
| G6 | `IF #a THEN #r := 1; ELSIF #b THEN #r := 2; ELSE #r := 3; END_IF;` với (`#a`,`#b`) = (0,1) / (0,0) / (1,0) | `#r` = 2 / 3 / 1 |
| G7 | `WHILE #i < 3 DO #i := #i + 1; END_WHILE;` lồng trong `IF FALSE THEN … END_IF;` | `#i` = 0 (nhánh không chạy) |
| G8 | Bit logic: `#q0 := #i0 AND #i1; #q1 := #i0 OR #i1; #q2 := NOT #i0; #q3 := #i0 XOR #i1;` với (I0.0,I0.1) = (1,0) / (1,1) / (0,0) | (0,1,0,1) / (1,1,0,0) / (0,0,1,0) |

**Test (mục tiêu: ≥ 100 test mới; tổng ≥ 1410 = 1310 + 100):**

| Nhóm | File | Test mới (tên + kỳ vọng) |
|---|---|---|
| arithmetic — hàm thuần (~20) | `packages/runtime-iec/src/arithmetic.test.ts` | Bảng E ở mức hàm: E1–E5 (wrap + ov), E6 (div/mod 0), E9/E9b (banker's/TRUNC/CEIL/FLOOR, đủ 6 giá trị .5), E10 (CONV_RANGE + NaN), E10b (fround 16777217), E12 (shift đủ 7 case), `roundHalfEven` property (fast-check: kết quả luôn chẵn khi .5, `roundHalfEven(x)` = `Math.round` khi không .5) |
| intrinsics (~12) | `packages/runtime-iec/src/intrinsics.test.ts` | Mỗi hàm §7.3 ≥ 1 test: POWER (0, âm, phân số), ABS (âm, min-int wrap), SQRT (âm → NaN), MIN/MAX/LIMIT (đủ 5 case E16), SHL/SHR/ROL/ROR (bảng E12), CEIL/FLOOR (E9b), NORM_X/SCALE_X (E15, gồm ngoài khoảng không kẹp) |
| tagmap (~8) | `packages/runtime-iec/src/tagmap.test.ts` | Build từ TagDef (I/Q/M/DB, bit/word/dword), `parsePlcRef` đủ dạng (`%I0.0`, `%MW10`, `DB1.DBW4`, `"DB".field.sub`, tên tag), `sym:` → throw, tên trùng → throw, cross-test `parsePlcRef` vs `parseAddress` (P1.1) trên ~20 địa chỉ (cùng area/byte/bit/type), canonical (`%MB10` ≠ `%MW10`, tag → địa chỉ) |
| interpreter — closures/frame (~15) | `packages/runtime-iec/src/interpreter.test.ts` | Eval: const/load/unary/binary/convert/intrinsic/callFcExpr (mỗi op 1 test); flow: if/elsif/case/for/while/repeat/exit/continue/return (bảng G ở mức interpreter, không qua SoftPlc); TEMP reset qua 2 lần gọi FC (bảng D); IN_OUT Ref ghi thẳng nơi gọi (đổi trong callee → caller thấy ngay); call depth (bảng D, CALL_DEPTH); loop limit (bảng D, LOOP_LIMIT); `callSys` không handler → SYS_UNSUPPORTED, chạy tiếp |
| softplc scan goldens (~38) | `packages/runtime-iec/src/softplc-scan.test.ts` | Bảng A (A1–A6, mỗi case 1 test: scanCount/lastScanSimMs/acc + SCAN_OVERRUN), bảng B (B1 2 scan + B2 2 scan), bảng C (OB100/cyclic: 4 scan mốc + overrun + phase = 6), bảng D (FB 4-scan + TEMP + depth + loop = 4 test, IN_OUT assert qua MW10 từng scan), bảng G (G1–G8, mỗi case 1 test), bit logic 8 (G8 + 7 chương trình AND/OR/NOT/latch/seal — xem ghi chú dưới) |
| softplc math goldens (14) | `packages/runtime-iec/src/softplc-scan.test.ts` | Bảng E1–E17 qua chương trình OB thật (mỗi case 1 test: giá trị cuối + fault count); riêng E11 assert `0.1+0.2 = 0.3` TRUE |
| force/snapshot (~10) | `packages/runtime-iec/src/softplc-snapshot.test.ts` | Bảng F1–F8 (mỗi case 1 test; F6 assert trace 3 scan giống hệt từng giá trị + scanCount + faults; F8 qua `makeSim` + `snapshotAll`/`restoreAll`) + `restore` sai hình → throw (version sai, thiếu trường, độ dài byte sai) |
| softplc API (~12) | `packages/runtime-iec/src/softplc.test.ts` | `load` khi RUN → throw; `load` DB ref không tồn tại → throw; `load` xong scanCount/acc/faults reset; `start`/`stop` idempotent; `stop` đẩy Q=0 ra IoBus ngay (outputsOnStop 'zero') vs 'hold' giữ; `reset` cold (forces/faults/memory về init); `init` 2 lần → throw; `read`/`write` ref không tìm thấy → throw; `write` sai kiểu → TAG-E001; `getDiagnostics` (state/scanCount/faults gom count); `onScan` gọi đúng số lần + unsub |
| scheduler (~8) | `packages/runtime-iec/src/softplc.test.ts` | `step` dt=0 → no-op; dt<0 → RangeError; T đi ngược → RangeError; STOP → step no-op; `faultPolicy: 'stop'` → STOP sau scan có fault đầu tiên (Q về 0); `maxScansPerStep` custom (vd 2) cap đúng; scan không có OB1 → scanCount vẫn tăng, Q vẫn đẩy |

Ghi chú đếm: bit logic 8 = G8 (1 test với 3 bộ input) + 7 test chương trình AND/OR/NOT/latch SET-RST/seal/contact-coil (mỗi chương trình 1–2 scan, giá trị I cho trước, Q kỳ vọng tính tay — không liệt kê từng dòng ở plan, test tự ghi bảng truth). Tổng bảng trên ≈ 20+12+8+15+38+14+10+12+8 = **137 test mới** (mục tiêu sàn ≥ 100, tổng ≥ 1410). Đối chiếu M1 §12.2 cho phần P1.4: bit logic 8 ✓, toán/so sánh/convert/tràn/chia 0: 14 ✓, điều khiển luồng: 8 (G1–G8) ✓, gọi block: 8 (bảng D: FB 4-scan + IN_OUT + TEMP + FC return + depth + loop + multi-instance + callSys — 8 test) ✓, bộ nhớ & địa chỉ: 8 golden (bảng B) + unit tagmap/interpreter ✓, scan: 6 (bảng A) ✓, force/snapshot: 4+ (bảng F) ✓. Mỗi golden ghi `expectedFrom: 'spec'` trong tên test (OQ-151).

**Mơ hồ (phân loại):** **Tier A (tự quyết):** vị trí file theo dep graph (mọi thứ P1.4 ở `runtime-iec`, không đụng `vendor-siemens`/`kernel`/`schemas`); `Frame.flow` thay vì throw cho điều khiển luồng; `FaultCollector` gom theo (code, blockName, src); mảng IO tái dùng cho latch/output (không cấp phát/scan); test dùng `compileSclProgram` + `SoftPlc` trực tiếp, tích hợp dùng `makeSim` + `softPlcExtension`; thứ tự triển khai (faults → arithmetic → intrinsics → tagmap → interpreter → softplc → extension → semantics §15). **Tier B (mặc định + ghi OQ):** OQ-130 (scan lưới đều, scan tại `lastScanTime + period`); OQ-131 (cap scan giữ acc thừa + SCAN_OVERRUN đếm số scan bị cắt); OQ-132 (maxLoopIterations 10_000 + LOOP_LIMIT thoát vòng lặp); OQ-133 (MOD 0 → 0 + DIV_ZERO); OQ-134 (shift count âm → 0 + bảng độ rộng + ABS min-int wrap); OQ-135 (OV trên frame, xóa đầu scan, không lộ ra IR); OQ-136 (số DB 1..n theo id sort ở `load()`; ref ngoài → load throw); OQ-137 (parser địa chỉ riêng ở runtime-iec + cross-test; `sym:` → throw); OQ-138 (`init` build lại map từ `cfg.tags`); OQ-139 (`load` yêu cầu STOP + xóa forces + validate DB ref); OQ-140 (`reset` cold toàn phần); OQ-141 (`write` theo từng loại ref + force thắng + TAG-E001); OQ-142 (force chuẩn hóa về key địa chỉ, `listForces` dạng chuẩn); OQ-143 (`callSys` không handler → SYS_UNSUPPORTED, chạy tiếp); OQ-144 (intrinsics §7.3 trong phạm vi P1.4); OQ-145 (cyclic period/phase từ `organization.cycleMs`); OQ-146 (thiếu OB100/OB1 → bỏ qua im lặng, scan vẫn đếm); OQ-147 (snapshot bộ nhớ dạng `number[]`); OQ-148 (IN_OUT = alias trực tiếp, không copy-back); OQ-149 (FOR bao hàm, 0 lần khi hướng sai, kiểm tràn trước khi tăng); OQ-150 (convert kiểm khoảng theo kiểu đích, NaN → 0 + CONV_RANGE); OQ-151 (golden P1.4 là bảng TS + `expectedFrom: 'spec'`; YAML runner là P1.7); OQ-152 (X-002 không chặn P1.4); OQ-153 (`step` khi STOP = no-op; `stop()` đẩy Q ra IoBus ngay); OQ-154 (`start`/`stop` idempotent; `start` không reset bộ nhớ; STOP→RUN re-arm OB100); OQ-155 (`softPlcExtension(program)` đăng ký `builtin:siemens`, chưa thêm vào CLI/SERVER_EXTENSIONS); OQ-156 (không thêm `scanAt()` ở P1.4); OQ-157 (bộ 8 mã fault + key gom + message lần đầu); OQ-158 (`faultPolicy: 'stop'` dừng sau khi scan xong); OQ-159 (Real fround sau mỗi phép tính, so sánh trên giá trị đã fround); OQ-160 (`step` T đi ngược/dt âm → RangeError, dt=0 → no-op). **Tier C (không chặn P1.4):** không có mục mới — OQ-105 (X-002/S1) vẫn mở từ P1.2, không chặn (OQ-152 ghi rõ lý do); nếu khi triển khai phát hiện §7/§8 thiếu quy tắc mà chỉ mã thật/PLCSIM mới quyết được → ghi OQ/SCR, không tự nới lỏng.

**Rủi ro + cách kiểm:** (1) Mô hình thời gian scan (OQ-130) lệch TIA: "tại simTimeMs hiện tại" có thể hiểu là scan tại T (bảng A6 sẽ khác: scan tại 0,10,20 thay vì 10,20,30) — giảm thiểu: bảng A ghim mô hình lưới đều (thỏa "nội suy tăng đều" cho multi-scan + khớp kịch bản §13 với t=0 là trạng thái đầu); xác minh bằng PLCSIM khi có (VERIFY §14.14 cyclic OB + §14.9 R_TRIG scan đầu); nếu sai thì SCR đổi mô hình + sửa bảng A (test là bằng chứng). (2) Số DB gán 1..n theo id (OQ-136) lệch số DB thật trong TIA — giảm thiểu: chỉ dùng nội bộ cho `absDb`; số thật đi theo SimaticML ở P5.7; ghi `UNVERIFIED` ở semantics §15. (3) OV/ENO không quan sát được từ SCL (OQ-135) — nếu PLCSIM cho thấy ENO ảnh hưởng luồng (vd `ENO` sau phép chia 0) thì cần SCR thêm ENO vào IR (P1.7). (4) X-002/S1: mã thật có thể dùng `TON`… (compile báo U001 — P1.4 không chạy được chương trình đó cho tới P1.5) hoặc dùng `%MD0` như Real (OQ-110 đã ghim ở P1.3) — giảm thiểu: lỗi ồn ào, không chạy sai im lặng. (5) Hiệu năng: closures mỗi node + không cấp phát/scan là thiết kế đúng hướng cho bench §12.4, nhưng P1.4 chưa có bench đo — giảm thiểu: đo smoke một lần với chương trình 200 FB_Motor (ghi số vào STATE, không ngưỡng, không gate); bench chính thức là P1.7. (6) `readInputsInto`/`writeOutputsFrom` ném `RangeError` nếu mảng ngắn hơn số input/output — giảm thiểu: SoftPlc cấp mảng theo đúng số tag trong map ở `init` (test assert không throw khi đủ tag). (7) VM restart mất `/tmp` (bài học P1.3): triển khai làm ở bản sao `/tmp` nhưng **rsync về `~/workspace/vcs` sau mỗi bước lớn**, không để bản duy nhất trong `/tmp`.

**Ngoài phạm vi:** std blocks `TON`/`TOF`/`TP`/`TONR`/`CTU`/`CTD`/`CTUD`/`R_TRIG`/`F_TRIG`/`SR`/`RS` (P1.5 — P1.4 chỉ có điểm cắm `sysCalls`); LAD (P1.6); golden runner YAML + demo `motor-interlock` + UI + bench M1 §12.4 (P1.7); `compileProject` đọc nhiều file (P1.7); CLI `vcs plc run` (P1.7); sửa EBNF §4.2 / M1 §7/§8/§10; đổi `.dependency-cruiser.cjs` / `eslint.config.js` / `vitest.config.ts` / `packages/kernel` / `packages/schemas` / `apps/cli` / `apps/server` / `examples/`; ADR mới (quyết định scan/DB/force là thực thi spec §7/§8/§10, không phải quyết định kiến trúc mới — ghi vào plan + semantics §15); mã diagnostic mới; `docs/facts/` mới; P0.9 PWA; script spike S1 (chạy khi có mã thật).

**Gate P1.4 (triển khai):** `lint && typecheck && depcheck && test && test:e2e && review:cheats && docs:diagnostics --check` + `build` + bench guard M0 (`pnpm bench`: TagDB 4/4 PASS + orchestrator ≥ 100 000 bước/s — P1.4 không chạm đường nóng bench; rớt > 20% so với baseline thì dừng điều tra, không hạ ngưỡng) + **probe lint**: thêm `Date.now()` vào một file scratch trong `packages/runtime-iec/src/` ở bản sao `/tmp` → `pnpm lint` exit 1 (chứng minh rule chặn Date.now trong runtime-iec), xóa file probe sau khi kiểm (tiền lệ probe M0) + CI (check + test ubuntu/windows + e2e ubuntu) xanh. Tổng test sau P1.4: **≥ 1410** (≥ 100 mới). `pnpm-lock.yaml` **không đổi** (không dependency mới — diff lockfile khác rỗng là cờ đỏ, dừng kiểm tra). `pnpm install` trong VM vẫn EPERM (OQ-007) — triển khai làm ở bản sao `/tmp` như các prompt trước, cài thật `--frozen-lockfile` (dùng `git archive` để copy, không `cp -r` cả cây kèm `node_modules` — bài học ENOSPC ở P0.8), **rsync về `~/workspace/vcs` sau mỗi bước lớn** (bài học VM restart P1.3). **Cần kiểm lại khi triển khai:** root `package.json` không bị ghi đè (bài học P1.2: từng bị ghi đè bằng nội dung vendor-siemens — kiểm `name: "vcs"` + diff vs HEAD trống trước khi commit).

**Triển khai P1.4 — KẾT QUẢ (2026-11-25, bản sao `/tmp/vcs-p14`, install thật `--frozen-lockfile`):**

**File (18 file phạm vi + 1 file testkit + 2 file sửa P1.3):** `packages/runtime-iec/src/faults.ts`, `arithmetic.ts`, `intrinsics.ts`, `tagmap.ts`, `interpreter.ts` (~1833 dòng), `softplc.ts` (~700 dòng), `extension.ts`, `index.ts`; test: `arithmetic.test.ts`, `intrinsics.test.ts`, `tagmap.test.ts`, `interpreter.test.ts`, `interpreter-composite.test.ts`, `interpreter-view.test.ts`, `softplc.test.ts`, `softplc-scan.test.ts`, `softplc-snapshot.test.ts`, `ir-testkit.ts` (helper test-only, không export từ index); tích hợp SCL→IR→SoftPlc: `packages/vendor-siemens/src/scl/softplc.test.ts`; sửa P1.3: `packages/vendor-siemens/src/scl/typecheck.ts` (`resolveDb` — xem bug 11) + `packages/runtime-iec/src/ir.ts` (`IrObBinding.phaseMs?`); docs: `docs/semantics.md` §15, `docs/STATE.md` §19 (mục này), `docs/open-questions.md` (OQ-130…160 đóng, OQ-145 bổ sung, OQ-161 mới).

**Test: 256 mới, tổng 1566/1566 (59 file)** — vượt mục tiêu ≥ 100 mới / ≥ 1410 tổng. Chi tiết: arithmetic 26, intrinsics 12, tagmap 19, interpreter 20, interpreter-composite 24, interpreter-view 27, softplc 26, softplc-scan 56, softplc-snapshot 19, vendor-siemens softplc 22 (+45 test khác đã có ở các file này từ trước — tổng mới ròng 256).

**Gate (chạy thật trên `/tmp/vcs-p14`):** lint 0; typecheck 0; depcheck sạch (105 module, 190 dep, no violations); test 1566/1566 (59 file), exit 0 (coverage runtime-iec ≥ 85% — interpreter 85.36% dòng, softplc 86.49%, arithmetic/faults/intrinsics 100%, tagmap 91.89%, memory 98.46%); test:e2e 5/5 (12,1 s); review:cheats SẠCH; docs:diagnostics --check khớp (42 mã); build OK (3 task, 3,582 s); bench guard M0: TagDB 4/4 PASS (set/get 47.306.848 ops/s; flush 5000 tag/0 đổi 0,39 µs; flush 1000 đổi + 1 sub 0,084 ms; heap −0,05 MB), orchestrator 458.835 bước/s PASS (≥ 100.000); probe lint Date.now trong `packages/runtime-iec/src/`: thêm file scratch `__probe-date-now.ts` → `pnpm lint` exit 1 (`no-restricted-properties`), đã xóa file probe. `pnpm-lock.yaml` **không đổi**; root `package.json` không bị ghi đè (kiểm trước khi commit).

**Smoke bench 200 FB_Motor (không ngưỡng, không gate — plan §19):** 2000 scan, FB latch iStart/iStop → qRun, 200 DB riêng: **519 scan/s** (3,86 s) và **533 scan/s** (3,75 s) — 2 lần, ổn định ~520–535, **dưới mục tiêu P1.7 ≥ 1000 scan/s** (~1,9 ms/scan, ~9,6 µs/FB call). Đây là số đo thật, không phải gate P1.4; tối ưu + bench chính thức là P1.7. SUY ĐOÁN nguyên nhân: cấp phát Frame/Ref mỗi lần gọi + đi qua viewFieldRef mỗi lần truy cập field — cách kiểm: profile ở P1.7 trước khi tối ưu.

**Bug thật đã tìm và sửa trong triển khai (12):** (1) `roundHalfEven(-3.5)` sai (−2 thay vì −4; `Math.round` làm tròn .5 về +∞, r lẻ → số chẵn gần nhất là `r−1`). (2) `parsePlcRef` nhận nhầm tag `DB1_VAL` thành ref DB (check `startsWith('DB')` trước tra map) — sửa tra map trước. (3) `DbStore` constructor 2 đối số `(dbNumber, sizeBytes)`, code gọi 1 đối số. (4) `compileSclProgram` không sinh `cycleMs` → cyclic mặc định 100 ms (bổ sung OQ-145). (5) testkit `abs`/`absDb` hardcode `width: 8` — sai cho Int/DInt/LReal (đã sửa theo `widthFor`). (6) `dbForFb` truyền `FieldType` dạng string trần → rơi nhánh struct, crash `fields is not iterable` (đã bọc `{kind:'elem', type}`). (7) `SoftPlc.init` không `async` → throw đồng bộ, test `.rejects` không bắt được; đã đổi `async` rồi REVERT về sync vì lint `require-await` (test đổi sang expect sync). (8) testkit `runSteps` luôn bắt đầu T=0 → lần gọi thứ 2 bị "T đi ngược" (thêm tham số `startT`). (9) `SCAN_OVERRUN`/`CYCLE_OVERRUN` đếm sai: `FaultCollector.record` chỉ +1/lần gọi → thêm `count?: number`, SCAN_OVERRUN truyền số scan bị cắt, CYCLE_OVERRUN truyền số kỳ trễ. (10) `IrObBinding` không có phase — plan bảng C cần → thêm `phaseMs?: number` (mặc định 0) vào `ir.ts`. (11) **BUG P1.3 THẬT — layout DB instance FB sai spec:** `resolveDb` (typecheck.ts) chỉ lấy `iface.static` + prefix 4 byte, trong khi M1 §3.5 + OQ-125 + semantics §14 đều nói layout = `VAR_INPUT + VAR_OUTPUT + VAR_IN_OUT` (slot 4 byte nội bộ, không lộ) + `VAR(static)`; hệ quả: interpreter throw "không tìm thấy field 'iStart'" với mọi IR do compiler sinh, OB không đọc được `"DB".qRun` (T005). Đã sửa `resolveDb` + cập nhật 2 test ghim layout cũ với kỳ vọng tính tay mới (FB_S: fields [['i',0,1],['st',2,2],['b',4,1]], size 6; FB_T có IN_OUT: [['a',0,1],['q',0,1],['st',6,2]], size 8, `io` không trong fields, `"DB_T".io` → T005); đồng bộ `dbForFb` trong testkit. Sau sửa: FB_Motor SCL latch compile + chạy 4 scan đúng; toàn suite 1566/1566. (12) **BUG THẬT — `compositeRef` nhánh struct:** `field()` luôn đệ quy `compositeRef(subField.type, …)` nên truy cập member scalar của struct TEMP (`#u.speed`, speed: Int) ném "compositeRef chỉ dùng cho mảng/struct" ngay lúc compile — nhánh array xử lý scalar đúng, chỉ nhánh struct sai. Đã sửa: tách `getParent`/`getSub`/`setSub`; field scalar → `baseRef`, field composite → đệ quy.

**Sửa kỳ vọng test (không phải bug code, có lý do):** test C-phase: 7 bước chỉ tới scan t=120, cần 14 bước (clock 0→140, period 20) mới tới scan t=140; test `write %I`: latch ghi đè PII từ TagDB ở scan kế nên Q=FALSE sau scan 1 rồi TRUE khi TagDB IN_A=TRUE; test `memM: [0,0]` đúng độ dài thật (MW0 = 2 byte) nên đổi thành `[0]`; test F6: trace ghi từng scan, so faults sau 2 lần chạy 3 scan với nhau; FaultCollector gom theo code+block+src nên 2 lần ARRAY_RANGE OOB → 1 entry count 2; WHILE điều kiện Int: `condFn(frame) === true` nên body bị bỏ qua, không throw (typecheck P1.3 đã chặn non-Bool); `irTypeSize(MOTOR)` = 4 theo §3.4 rule 6; `resolveInstance` dbField chưa nạp throw lúc CHẠY block, không phải lúc dựng Interpreter; `convertChecked('Int','Time',5)` KHÔNG throw — `Time` là đích số hợp lệ (INT_RANGES gồm Time, min 0, max +Inf); `sizeOf('Nope')` crash `TYPE_INFO[type] undefined` trước khi tới nhánh "không có kích thước" — nhánh đó trong `memory.ts#sizeOf` là **dead code** (chỉ `String` cho `undefined`, nhưng đã bị chặn ở trên), chỉ còn dòng 152 chưa cover (memory 98.46%); `intBinary`/`shiftOp` nhận op trước type (`intBinary('add','Real',…)`), không phải type trước.

**Lệch plan (12, đã ghi ở trên + trong báo cáo):** (1) test runtime-iec KHÔNG import được `compileSclProgram` (dep-cruiser cấm runtime-iec → vendor-siemens) — test runtime-iec dựng IR tay qua `ir-testkit.ts`; pipeline thật SCL→IR→SoftPlc ở `vendor-siemens/src/scl/softplc.test.ts`; F8 dùng `createSimulation` trực tiếp (không phải `makeSim` — test-utils cũng không import được từ runtime-iec). (2) Frame thêm `composite: Map<string, LocalValue>` cho biến local mảng/struct; Ref thêm `elem`/`field` tùy chọn. (3) CEIL/FLOOR registry trả số thô, interpreter chuẩn hóa qua `convertChecked`. (4) `convertChecked` kiểm khoảng với mọi chuyển đổi số (OQ-150). (5) FOR BY 0 → cắt bởi LOOP_LIMIT, không special-case. (6) Member sau index sâu hơn 1 cấp + mảng trong mảng → throw ồn ào lúc compile (chưa hỗ trợ). (7) `irTypeToFieldTypeForLayout` đã viết rồi xóa (không cần). (8) Cross-test `parsePlcRef` vs `parseAddress` dời vào file test vendor-siemens (dep-cruiser). (9) `start()` reset `accMs` về 0 cùng rebase lưới; `reset()` về STOP; cyclic không `cycleMs` → 100 ms. (10) `ir-testkit.ts` là helper test-only trong `packages/runtime-iec/src/` (không có tiền lệ shared helper — các package khác dùng `@vcs/test-utils`, runtime-iec không import được). (11) `FaultCollector.record` thêm `count?: number`; `IrObBinding` thêm `phaseMs?`; `resolveDb` sửa theo §3.5 (bug 11); `fbInterfaceStruct` (multi-instance lồng) vẫn layout IN_OUT theo kích thước tự nhiên, không slot 4 byte — **không nhất quán với DB top-level** (OQ-161 mới, mở). (12) `SoftPlc.init` revert về sync (bug 7); `FaultCollector.restore` validate qua type guard `isRuntimeFault`.

**OQ-130…160: đóng (đã áp dụng ở P1.4).** OQ-145 bổ sung: `compileSclProgram` không sinh `cycleMs` → mặc định 100 ms. OQ-161 mới (tier B, mở): layout IN_OUT của multi-instance lồng chưa nhất quán với DB top-level. X-002/S1 vẫn mở, không chặn P1.4 (OQ-152).

**SỰ CỐ `.git` bị xóa (2026-11-25 ~09:00, trong phiên triển khai):** subagent chạy `rsync -a --delete …` không exclude `.git`; nguồn `/tmp/vcs-p14` (từ `git archive`, không có `.git`) nên rsync xóa `~/workspace/vcs/.git`. Chỉ `.git` mất — cây làm việc nguyên vẹn (dry-run rsync không còn diff; manifest hash cây ở `~/workspace/vcs-p14-tree-manifest.sha256`, 248 file). **Không thể commit "feat(m1): P1.4 interpreter + SoftPlc" cho tới khi `.git` được khôi phục** (quyết định của parent: true clone có history, vd máy Windows của owner; KHÔNG re-init mù). Từ nay rsync KHÔNG dùng `--delete` (hoặc luôn `--exclude .git`). Bài học: rsync đích có `.git` thì `--delete` mà không exclude `.git` là lệnh phá hoại.

**Việc tiếp theo:** khôi phục `.git` (parent) → commit duy nhất "feat(m1): P1.4 interpreter + SoftPlc" trên `m1/p1.4-interpreter` (kiểm root `package.json` + lockfile không đổi + `user-chat/` không trong commit) → parent xác minh gate độc lập trên bản sao sạch → PR qua cloud browser → CI xanh → merge → P1.5 plan-first (std blocks).

## 20. Kế hoạch P1.5 — System blocks: R_TRIG/F_TRIG, SR/RS, TON/TOF/TP/TONR, CTU/CTD/CTUD (plan-first, 2026-11-25)

**Điểm xuất phát:** P1.4 **đã merge PR #23** (merge commit `ae0bed3`, develop head `ae0bed3` — xác minh qua MCP read, `merged_at` 2026-11-25T03:56:20Z tức 2026-11-25 10:56 +07; CI 10 checks passed). Tổng test hiện tại **1566**. Diagnostic: **42 mã**. PROMPTS P1.5 nguyên văn: "Làm P1.5 theo AGENTS.md §9 (plan-first). Đọc: … → M1 §9, 12.2. Nhiệm vụ: std blocks: R_TRIG/F_TRIG, SR/RS, TON/TOF/TP/TONR, CTU/CTD/CTUD theo sim time của scan. TRƯỚC KHI CODE: tự tính tay bảng timeline cho mỗi loại timer (gồm PT=0, IN dao động, timer không được gọi vài scan) và counter (R/LD ưu tiên, biên). Dùng làm golden. Gate: ≥ 14 golden timer, ≥ 10 golden counter, property test timer (TON ⇔ IN liên tục ≥ PT)."

**Hiểu biết (tóm tắt):** (1) P1.5 là prompt cuối cùng mở khóa chương trình SCL "thật": từ P1.3 mọi chương trình dùng `TON`/`CTU`/`R_TRIG`/… đều dừng ở compile với SCL-U001 (OQ-111), và IR hợp lệ không bao giờ chứa `callSys` tới std block — P1.5 tháo đúng nút thắt đó ở cả ba tầng: typecheck chấp nhận kiểu + lời gọi, lower sinh `callSys`, interpreter chạy handler. (2) Điểm cắm đã có sẵn từ P1.4, không cần phát minh thêm: IR `callSys {fn, instance?, inArgs, outArgs}` (`ir.ts:184`), `SysCallHandler(instance, inArgs, outArgs, nowMs)` + registry `sysCalls` ở `Interpreter` (`interpreter.ts:86,640`), `callSys` không handler → fault `SYS_UNSUPPORTED` (OQ-143) — P1.5 chỉ việc điền registry và nối dây. (3) Một định nghĩa duy nhất cho mỗi block phải phục vụ cả hai phía: typecheck/lower cần interface (tên + kiểu + tham số bắt buộc) và layout instance DB; handler cần offsets các field (cả ẩn) — nguồn sự thật duy nhất đặt ở `runtime-iec/src/std/defs.ts`, `vendor-siemens` import từ `@vcs/runtime-iec` (rule `vendor-siemens-deps` đã cho phép, P1.3 đã import `ir.ts`/`layout.ts` theo đường này). (4) Timer/counter là trạng thái theo **sim time của scan** (`Interpreter.nowMs`, SoftPlc đặt trước mỗi scan, OQ-130): ET có độ phân giải = chu kỳ scan, PT không chia hết chu kỳ thì Q lật ở scan đầu tiên `elapsed ≥ PT` (bảng B2/B3); timer không được gọi vài scan thì trạng thái đóng băng, lần gọi sau dùng `now − _start` thật nên Q có thể lật ngay (M1 §9.3, bảng D). (5) Instance DB của std block = layout §3.5 (public + ẩn) nhưng chỉ field công khai được đọc/ghi từ SCL — field ẩn (`_start`, `_running`, `_prevIn`, `_accum`, `_m`, `_prevCU`…) chiếm byte trong layout nhưng không truy cập được (`"T1"._start` → T005, OQ-163); tiền lệ đã có ở P1.3: `resolveDb` layout cả slot IN_OUT 4 byte rồi lọc khỏi `IrDb.fields` (OQ-125). (6) Counter chỉ làm biến thể **Int** ở P1.5: spec §9.4 nói "biến thể DInt theo tham số kiểu" nhưng không định nghĩa cú pháp SCL nào để chọn (EBNF §4.2 cũng không có) — làm Int, ghi OQ-168, chờ mẫu TIA/S1. (7) X-002/S1 vẫn mở và lần này **liên quan trực tiếp** (VERIFY §14 mục 5–9 đều là ngữ nghĩa std block) nhưng vẫn **không chặn** P1.5 (OQ-179, cùng mẫu OQ-152): làm đúng spec §9, các mục VERIFY ghi `UNVERIFIED` ở semantics §16, S1/PLCSIM sau này chỉ nới lỏng qua SCR. (8) OQ-161 (layout IN_OUT multi-instance lồng) **vẫn mở sau P1.5**: P1.5 chạm `fbInterfaceStruct` (thêm trường hợp std) nhưng không quyết câu hỏi IN_OUT lồng — std block không có IN_OUT nên không bị ảnh hưởng; plan ghim hành vi hiện tại bằng test (bảng P) và để OQ-161 mở (OQ-173).

**Phạm vi (PROMPTS P1.5; M1 §9, §12.2–12.3; AMENDMENTS — không có mục mới áp dụng; M1 §17):**

| File | Nội dung |
|---|---|
| `packages/runtime-iec/src/std/defs.ts` | `StdBlockDef` × 11 block (interface + hidden + layout đã tính — bảng O), `STD_BLOCKS`, `getStdBlockDef`, `stdBlockInterface` |
| `packages/runtime-iec/src/std/handlers.ts` | `createStdSysCalls(): Map<string, SysCallHandler>` + 11 handler (§9.1–9.4) |
| `packages/runtime-iec/src/std/index.ts` | Export `std/*` |
| `packages/runtime-iec/src/std/defs.test.ts` | Test defs/layout (bảng O) |
| `packages/runtime-iec/src/std/handlers.test.ts` | Test handler trực tiếp với `DbStore` tay (không qua SoftPlc) |
| `packages/runtime-iec/src/softplc-std.test.ts` | Golden scan (bảng A–N) qua SoftPlc + IR tay (`ir-testkit.ts`) |
| `packages/runtime-iec/src/softplc.ts` | Nối `createStdSysCalls()` mặc định vào `Interpreter` (OQ-170) |
| `packages/runtime-iec/src/ir-testkit.ts` | Helper test-only: dựng std instance DB + node `callSys` (thêm) |
| `packages/runtime-iec/src/ir.ts` | Thêm `hidden?: boolean` vào `IrField` (OQ-163) |
| `packages/runtime-iec/src/index.ts` | Export std defs/handlers |
| `packages/vendor-siemens/src/scl/typecheck.ts` | Chấp nhận kiểu std + DB std + lời gọi std + member public-only (mục 4 thiết kế) |
| `packages/vendor-siemens/src/scl/lower.ts` | Hạ lời gọi std (local `#sT(...)` + global `"T1"(...)`) → `callSys` (mục 5) |
| `packages/vendor-siemens/src/scl/typecheck.test.ts` | Thêm test typecheck std (mục Test) |
| `packages/vendor-siemens/src/scl/lower.test.ts` | Thêm test lower `callSys` (mục Test) |
| `packages/vendor-siemens/src/scl/softplc-std.test.ts` | Pipeline SCL thật → IR → SoftPlc (mục Test, P-S1…P-S8) |
| `docs/semantics.md` | Thêm §16: std blocks, mỗi điểm gắn `VERIFIED`/`UNVERIFIED` (VERIFY §14 mục 5–9) |
| `docs/STATE.md`, `docs/open-questions.md` | Plan này (§20) + OQ-162…181 |

**Thiết kế nhỏ nhất (từng mục — signature chính xác, chỗ KHÔNG làm):**

1. **`std/defs.ts` — một định nghĩa duy nhất cho mỗi block (OQ-162).** Layout tính bằng `layoutStruct` (§3.4) **một lần lúc nạp module** trên danh sách field đầy đủ (public + ẩn, theo thứ tự interface: input + output + static-ẩn); kết quả là bảng offset dùng chung cho typecheck (size + public fields) và handler (mọi offset). Không tính layout lại lúc chạy scan.
```ts
export interface StdFieldDecl { name: string; type: PrimitiveType; hidden?: boolean; init?: number | boolean; }
export interface StdBlockDef {
  name: 'TON' | 'TOF' | 'TP' | 'TONR' | 'CTU' | 'CTD' | 'CTUD' | 'SR' | 'RS' | 'R_TRIG' | 'F_TRIG';
  kind: 'edge' | 'bistable' | 'timer' | 'counter';
  input: StdFieldDecl[]; output: StdFieldDecl[]; hidden: StdFieldDecl[];
  /** Toàn bộ field (input + output + hidden) kèm offset đã tính — bảng O. */
  layout: IrField[]; size: number;
}
export declare const STD_BLOCKS: ReadonlyMap<string, StdBlockDef>;
export function getStdBlockDef(name: string): StdBlockDef | undefined; // name không phân biệt hoa/thường
export function stdBlockInterface(name: string): IrInterface | undefined; // input/output/temp rỗng, R/LD mang init=false
```
Định nghĩa interface (theo M1 §9; `init: false` = tham số tùy chọn theo luật `hasInit` sẵn có của `checkCallArgs` — OQ-181):
| Block | Input (bắt buộc, trừ ghi chú) | Output | Hidden |
|---|---|---|---|
| R_TRIG | `CLK: Bool` | `Q: Bool` | `_m: Bool` |
| F_TRIG | `CLK: Bool` | `Q: Bool` | `_m: Bool` |
| SR | `S1: Bool`, `R: Bool` | `Q1: Bool` | — |
| RS | `S: Bool`, `R1: Bool` | `Q1: Bool` | — |
| TON | `IN: Bool`, `PT: Time` | `Q: Bool`, `ET: Time` | `_start: DInt`, `_running: Bool`, `_prevIn: Bool` |
| TOF | `IN: Bool`, `PT: Time` | `Q: Bool`, `ET: Time` | `_start: DInt`, `_running: Bool`, `_prevIn: Bool` |
| TP | `IN: Bool`, `PT: Time` | `Q: Bool`, `ET: Time` | `_start: DInt`, `_running: Bool`, `_prevIn: Bool` |
| TONR | `IN: Bool`, `R: Bool` (tùy chọn), `PT: Time` | `Q: Bool`, `ET: Time` | `_start: DInt`, `_running: Bool`, `_prevIn: Bool`, `_accum: DInt` |
| CTU | `CU: Bool`, `R: Bool` (tùy chọn), `PV: Int` | `QU: Bool`, `CV: Int` | `_prevCU: Bool` |
| CTD | `CD: Bool`, `LD: Bool` (tùy chọn), `PV: Int` | `QD: Bool`, `CV: Int` | `_prevCD: Bool` |
| CTUD | `CU: Bool`, `CD: Bool`, `R: Bool` (tùy chọn), `LD: Bool` (tùy chọn), `PV: Int` | `QU: Bool`, `QD: Bool`, `CV: Int` | `_prevCU: Bool`, `_prevCD: Bool` |
Quy tắc ghim: `_prevIn` có mặt ở cả 4 timer dù TON/TONR không đọc nó — thống nhất một bộ hidden theo dòng "Nội bộ: `_start`, `_running`, `_prevIn`" ở M1 §9.3, và nhờ Bool packing nó **không tốn thêm byte** nào (chung byte 16 với `_running`, bảng O); TONR thêm `_accum`. Counter **chỉ Int** (OQ-168 — không có biến thể DInt ở P1.5). Không có block nào có IN_OUT.

2. **`std/handlers.ts` — 11 handler thuần theo `SysCallHandler` (P1.4).** Mỗi handler nhận `instance: DbView | undefined` (undefined → throw `Error` ồn ào — typecheck bảo đảm mọi lời gọi std đều có instance, tới đây mà thiếu là lỗi nội bộ), đọc inArgs đã tính sẵn, đọc/ghi field qua `instance.store` + offset trong `def.layout` + `instance.base` (không qua `instance.fields` — field ẩn không có trong đó), ghi output ra DB trước rồi ghi tiếp các out-arg `Ref` nếu có (OQ-175). Không cấp phát ngoài việc đọc/ghi trực tiếp (không `Map`, không mảng mới trong handler — Map inArgs/outArgs do closure `callSys` của P1.4 cấp phát, xem Rủi ro (3)). `nowMs` = sim ms của scan hiện tại (SoftPlc đặt `interpreter.nowMs` trước mỗi scan, OQ-130). `PT` hiệu dụng `PT' = max(PT, 0)` (OQ-172 — PT âm xử như 0, ET không bao giờ âm).
```ts
export function createStdSysCalls(): Map<string, SysCallHandler>; // đủ 11 tên, key hoa ('TON', …)
```
Ngữ nghĩa từng handler (M1 §9; `elapsed = nowMs − _start`, mọi phép tính Time là số nguyên ms):
- **R_TRIG:** `Q = CLK AND NOT _m; _m = CLK` (đọc CLK từ inArgs; `_m` khởi tạo false ở DB init — OQ-164).
- **F_TRIG:** `Q = NOT CLK AND _m; _m = CLK`.
- **SR:** `Q1 = S1 OR (Q1 AND NOT R)` (đọc Q1 cũ từ DB, ghi lại — không hidden).
- **RS:** `Q1 = NOT R1 AND (S OR Q1)`.
- **TON:** `PT' ≤ 0` → `Q = IN; ET = 0; _running = false` (không chạm `_start`). Ngược lại: `IN` false → `Q=false; ET=0; _running=false`. `IN` true và `_running` false → `_start=now; _running=true`. `_running` → `ET=min(now−_start, PT'); Q=(now−_start) ≥ PT'`.
- **TOF:** `IN` true → `Q=true; ET=0; _running=false`. `IN` false và `_prevIn` true → `_start=now; _running=true`. `_running` → `ET=min(now−_start, PT'); nếu (now−_start) ≥ PT' thì Q=false; _running=false` (ET giữ = PT' cho tới khi IN lên lại). Cuối mọi lần gọi: `_prevIn = IN`. `PT' ≤ 0`: cạnh xuống → Q=false ngay trong scan đó, ET=0 (cùng công thức với PT'=0).
- **TP:** cạnh lên (`IN` true và `_prevIn` false) và `_running` false → `_start=now; _running=true`. `_running` → `ET=min(now−_start, PT'); Q=(now−_start) < PT'`; khi `(now−_start) ≥ PT'` → `_running=false` (Q=false). Không `_running` và `IN` false → `ET=0` (xung đã kết thúc + IN false — OQ-165: khi xung kết thúc mà IN vẫn true thì ET giữ = PT', Q=false, không kích lại cho tới khi IN xuống rồi lên). Cuối mọi lần gọi: `_prevIn = IN`. `PT' ≤ 0`: cạnh lên → Q=false ngay (xung độ dài 0), ET=0.
- **TONR:** `R` true → `ET=0; Q=false; _accum=0; _running=false` (R thắng IN cùng scan — OQ-166). Ngược lại: `IN` true và `_running` false → `_start=now; _running=true`; `IN` true → `ET=_accum+(now−_start); Q=ET ≥ PT'`; `IN` false và `_running` → `_accum=_accum+(now−_start); _running=false; ET=_accum; Q=ET ≥ PT'`. `PT' ≤ 0` → `Q=IN; ET=0; _accum=0; _running=false` (OQ-166).
- **CTU:** `R` true → `CV=0`. Ngược lại: cạnh lên CU (`CU` true và `_prevCU` false): nếu `CV < 32767` thì `CV+=1`. `QU = CV ≥ PV`. Cuối mọi lần gọi: `_prevCU = CU`. (R thắng đếm cùng scan; kẹp max, không wrap, không fault — OQ-167/177.)
- **CTD:** `LD` true → `CV=PV`. Ngược lại: cạnh lên CD: nếu `CV > −32768` thì `CV−=1`. `QD = CV ≤ 0`. Cuối: `_prevCD = CD`. (LD thắng đếm cùng scan.)
- **CTUD:** `R` true → `CV=0`. Ngược lại `LD` true → `CV=PV`. Ngược lại: cạnh lên CU → nếu `CV < 32767` thì `CV+=1`; cạnh lên CD → nếu `CV > −32768` thì `CV−=1` (cả hai cùng cạnh → tăng rồi giảm = giữ nguyên — OQ-167). `QU = CV ≥ PV; QD = CV ≤ 0`. Cuối: `_prevCU = CU; _prevCD = CD`. Thứ tự ưu tiên: **R > LD > đếm**.

3. **Nối dây ở `SoftPlc` (OQ-170).** `SoftPlc` giữ một `#sysCalls = createStdSysCalls()` duy nhất và truyền vào **cả hai** chỗ dựng `Interpreter` (field initializer `softplc.ts:273` + `load()` `softplc.ts:745` — P1.4 cả hai đều không truyền `sysCalls`). `SoftPlcConfig` thêm `sysCalls?: Map<string, SysCallHandler>` tùy chọn: nếu caller truyền thì **thay thế** map mặc định (điểm nối cho test + cho P5 adapter ngoài nếu cần); không truyền → std đầy đủ. `Interpreter` không đổi (opts.sysCalls rỗng vẫn = không handler → SYS_UNSUPPORTED, giữ nguyên để test đường fault OQ-143).

4. **Typecheck (`vendor-siemens/src/scl/typecheck.ts`) — tháo SCL-U001 đúng 4 chỗ, không viết lại checker:**
   - `resolveTypeNode` (`named`): tên thuộc `SYSTEM_FB_NAMES` → trả `{ type: { kind: 'struct', fields: def.layout }, fbType: name }` (struct layout **đầy đủ gồm hidden** — dùng cho layout lồng, mục 6) thay vì U001 (dòng ~848). Kiểu std chỉ chấp nhận ở **VAR (static) + DATA_BLOCK**; ở VAR_TEMP → T004 (TEMP reset mỗi lần gọi nên timer/counter vô nghĩa — lỗi ồn ào thay vì chạy sai im lặng), ở vị trí kiểu khác (FC return, phần tử mảng, VAR_INPUT của FB người dùng) → T004 (OQ-171).
   - `resolveDb`: `block.fbName` thuộc `SYSTEM_FB_NAMES` → không gọi `findBlock` (sẽ T001 sai); dựng `IrDb` từ def: layout trên toàn bộ field (public + hidden) qua `layoutIrFields`, `fields` = chỉ field public (lọc hidden như tiền lệ lọc IN_OUT ở OQ-125), `size` = `laid.size` (gồm hidden), `fbName` = tên std (giữ nguyên — lower phân biệt bằng `SYSTEM_FB_NAMES`). DB STRUCT thường vẫn từ chối instance FB (quy tắc cũ, không đổi).
   - Lời gọi: đường local (`#sT(...)`, ~2147) và global (`"T1"(...)`, ~2205) — khi `sym.fbType` / `db.fbName` là tên std: `iface = stdBlockInterface(name)`, `checkCallArgs({ kind: 'FB', name, iface }, …)` **tái dùng nguyên xi** (luật `hasInit` sẵn có → R/LD tùy chọn, các input khác bắt buộc; namedOut `=>` cho phép vì kind 'FB' không rơi nhánh OQ-127 của FC; positional → T004 như FB thường, OQ-100). **Không** `recordEdge` cho lời gọi std (std là lá, không đệ quy — `callSys` không có trong call graph, xem comment ~2307). Lời gọi tên std **không có instance** (ident trần `TON(...)`, ~1518/~2261) → vẫn U001? Không — đổi thành T004 "gọi system block cần instance (#tOn hoặc \"T1\")" (cùng thông điệp như FB thường, ~2229) vì đây là lỗi dùng sai, không phải "chưa hỗ trợ". Lời gọi std trong **biểu thức** (`TON(...)` ở `checkCallExpr`, ~1518) → T004 (statement-only, OQ-175; lower không có đường callSys trong biểu thức).
   - Member: `"T1".Q` / `#sT.ET` / `"C1".CV` phân giải qua field public của def; truy cập field ẩn (`"T1"._start`, `#sT._prevIn`) → **SCL-T005** "không tìm thấy field" (nhờ `IrField.hidden`, OQ-163 — kiểm tra ở mọi cấp, cả lồng trong struct cha). Đọc output std qua DB field là đường chính để quan sát Q/ET/QU/CV trong OB (không cần out-arg).
   - `lookupInterface(name)`: tên std → trả `stdBlockInterface(name)` (dùng chung cho local/global/ctx; không duplicate bảng interface ở vendor-siemens — OQ-162).

5. **Lower (`vendor-siemens/src/scl/lower.ts`) — sinh `callSys`, không đổi `callFb`/`callFc`:**
   - `lowerCallStmt` nhánh local (`#sT(...)`, ~580): nếu `sym.fbType` thuộc `SYSTEM_FB_NAMES` → `{ op: 'callSys', fn: fbType, instance: { k: 'local', name }, inArgs, outArgs }` (tách args bằng `lowerFbArgs` hiện có với iface std — inArgs `:=`, outArgs `=>`; inoutArgs gặp phải → throw nội bộ vì typecheck đã chặn T004).
   - Nhánh global (`"T1"(...)`, ~600): nếu `db.fbName` thuộc `SYSTEM_FB_NAMES` → `{ op: 'callSys', fn: db.fbName, instance: { k: 'dbField', db: callee.name, path: [] }, inArgs, outArgs }`. Các nhánh còn lại không đổi. `callSys` không có trong call graph / không sinh cạnh S020 (đã đúng từ P1.3).
   - `ir.ts`: `IrField` thêm `hidden?: boolean` (tùy chọn, JSON-serializable; chỉ field ẩn của std mới đặt). Không đổi shape `callSys` (đã đủ: fn/instance/inArgs/outArgs). **Ràng buộc:** golden IR JSON hiện có không đổi (không field nào cũ có `hidden`; `irToJson` chỉ thêm key khi field có giá trị — kiểm bằng diff trước khi commit).

6. **Multi-instance + OQ-161 (OQ-173).** FB con kiểu std trong `VAR` (static) của FB cha: `fbInterfaceStruct` đã nối `iface.static` vào layout cha — field kiểu std mang struct layout đầy đủ (public + hidden) nên vùng con có đúng size/offset (bảng P); lời gọi `#tOn(...)` trong cha resolve instance qua `frame.instance` + path như FB con thường (P1.4 `resolveInstance`/`walkView` đã hỗ trợ struct lồng). **OQ-161 vẫn mở:** nó hỏi về IN_OUT của FB *người dùng* lồng (slot 4 byte hay kích thước tự nhiên) — P1.5 không đụng tới (std không có IN_OUT); plan ghim hành vi hiện tại (IN_OUT lồng = kích thước tự nhiên, bảng P: `sub.io` Int @34, tổng size 38; nếu OQ-161 sau này quyết slot 4 byte thì bảng P đổi thành 40 kèm SCR) và **không** coi đó là quyết định OQ-161.

7. **Snapshot/restore (OQ-180): không thêm code.** Trạng thái std (kể cả hidden) nằm trong byte của instance DB → `snapshot()`/`restore()` hiện có đã bao trọn; timer sau restore tiếp tục với `_start`/`_accum` đã lưu và đồng hồ đã restore nên `elapsed` nhất quán (không trôi). Một golden ghim: snapshot giữa TON đang chạy → chạy 3 scan → restore → chạy 3 scan → trace Q/ET/scanCount giống hệt.

8. **`docs/semantics.md` §16** — std blocks: mỗi khối ghi ngữ nghĩa + `VERIFIED`/`UNVERIFIED`; các mục VERIFY §14.5 (TON PT=0/dao động/không gọi), §14.6 (TP IN giữ), §14.7 (TOF retrigger), §14.8 (counter biên/ưu tiên), §14.9 (R_TRIG scan đầu) ghi `UNVERIFIED` chờ PLCSIM/S1; OQ-162…181 dẫn chiếu. OQ-111 (U001) đóng ở P1.5 (đã áp dụng); `semantics.md` dòng OQ-111 cập nhật "đã hỗ trợ từ P1.5".

**Đã loại:** (1) Biến thể counter DInt (OQ-168). (2) Tối ưu cấp phát `callSys` (xem Rủi ro (3) — P1.7). (3) Golden runner YAML + port ví dụ §12.1 `ton_basic_3s` sang YAML (P1.7; P1.5 dùng bảng TS + `expectedFrom: 'spec'`, OQ-174). (4) LAD (P1.6). (5) Demo `motor-interlock` / CLI / Watch / bench M1 §12.4 (P1.7). (6) Mã diagnostic mới — std dùng mã sẵn có (T004/T005/U001 đã đổi vai trò, SYS_UNSUPPORTED đã có); `docs/diagnostics.md` **không đổi** (42 mã, `--check` khớp). (7) ADR mới — std blocks là thực thi spec §9, không phải quyết định kiến trúc mới. (8) Sửa EBNF §4.2 / M1 §9. (9) Đổi `.dependency-cruiser.cjs` / `eslint.config.js` / `vitest.config.ts` / `packages/kernel` / `packages/schemas` / `apps/*` / `examples/` — không cần (rule dep đã cho phép vendor-siemens → runtime-iec; lint CORE_FILES đã bao runtime-iec; ngưỡng coverage 85 đã có cho cả hai package).

**Bảng tính tay (tự tính, không sao chép từ implementation — dùng làm golden):**

Quy ước chung: `scanPeriodMs = stepMs` (mỗi step = đúng 1 scan); scan tại `t = period, 2·period, …` (OQ-130 — scan đầu tại `t = period`, không phải 0). Cột input = giá trị tag trước step tạo ra scan đó (đặt qua TagDB/`write` trước step); cột output = giá trị sau scan đó (đọc qua `read("T1".Q)` / `read("T1".ET)` / …). Timer: period 100. Edge/bistable/counter: period 10. `ET`/`PT` tính bằng ms nguyên.

**Bảng A — TON cơ bản (PT=3000):** OB1: `"T1"(IN := %M0.0, PT := T#3s);` (đọc Q/ET qua `"T1".Q` / `"T1".ET`).

| Scan t | %M0.0 (IN) | ET | Q | Ghi chú |
|---|---|---|---|---|
| 100 | FALSE | 0 | FALSE | chưa lên |
| 200 | TRUE | 0 | FALSE | cạnh lên: `_start=200` |
| 300 | TRUE | 100 | FALSE | |
| 1100 | TRUE | 900 | FALSE | |
| 3100 | TRUE | 2900 | FALSE | |
| 3200 | TRUE | 3000 | TRUE | `elapsed=3000 ≥ PT` |
| 3300 | TRUE | 3000 | TRUE | ET kẹp ở PT |
| 3400 | FALSE | 0 | FALSE | IN xuống → reset |

**Bảng B — TON PT biên:**
| # | PT | Diễn biến | Kỳ vọng |
|---|---|---|---|
| B1 | `T#0s` | t=100 IN=F; t=200 IN=T; t=300 IN=T; t=400 IN=F | (F,0,F) → (T,0,T) → (T,0,T) → (F,0,F): `Q=IN` ngay, ET=0 |
| B2 | `T#50ms` (không chia hết chu kỳ 100) | t=100 IN=F; t=200 IN=T (cạnh lên); t=300 IN=T | (F,0,F) → (T,0,F) → (T,50,T): Q lật ở scan đầu `elapsed ≥ PT`, ET kẹp 50 |
| B3 | `T#250ms` | t=200 IN=T; t=300; t=400; t=500 | ET 0 → 100 → 200 → 250; Q F,F,F,T (`elapsed=300 ≥ 250` ở t=500) |

**Bảng C — TON IN dao động (PT=1000):** IN: TRUE t=200, FALSE t=500, TRUE t=700.

| Scan t | IN | ET | Q | Ghi chú |
|---|---|---|---|---|
| 200 | TRUE | 0 | FALSE | cạnh lên `_start=200` |
| 400 | TRUE | 200 | FALSE | |
| 500 | FALSE | 0 | FALSE | IN xuống → reset, đếm lại từ đầu |
| 700 | TRUE | 0 | FALSE | cạnh lên `_start=700` |
| 1600 | TRUE | 900 | FALSE | |
| 1700 | TRUE | 1000 | TRUE | `elapsed=1000 ≥ PT` |

**Bảng D — TON không được gọi vài scan (PT=2000):** OB1: `IF %M0.1 THEN "T1"(IN := %M0.0, PT := T#2s); END_IF;` (%M1.0 := "T1".Q ngoài IF). %M0.0=TRUE từ t=200; %M0.1=TRUE trừ các scan 300…1500 (FALSE).

| Scan t | Gọi? | ET | Q | Ghi chú |
|---|---|---|---|---|
| 200 | có | 0 | FALSE | cạnh lên `_start=200` |
| 300…1500 | không | 0 | FALSE | đóng băng ở giá trị lần gọi cuối (ET=0) |
| 1600 | có | 1400 | FALSE | "nhảy": `1600−200=1400` (timestamp, không phải 100) |
| 2200 | có | 2000 | TRUE | `elapsed=2000 ≥ PT` |

**Bảng E — TOF cơ bản (PT=2000):** IN TRUE từ đầu, FALSE từ t=500.

| Scan t | IN | ET | Q | Ghi chú |
|---|---|---|---|---|
| 100 | TRUE | 0 | TRUE | IN true → Q=true, ET=0 |
| 500 | FALSE | 0 | TRUE | cạnh xuống: `_start=500` |
| 1500 | FALSE | 1000 | TRUE | đang đếm xuống |
| 2400 | FALSE | 1900 | TRUE | |
| 2500 | FALSE | 2000 | FALSE | `elapsed=2000 ≥ PT` → Q=false, ET giữ 2000 |
| 2600 | FALSE | 2000 | FALSE | ET giữ = PT cho tới khi IN lên lại |
| 3000 | TRUE | 0 | TRUE | IN lên → Q=true, ET=0 |

**Bảng F — TOF retrigger (PT=2000):** IN: TRUE, FALSE t=500, TRUE t=1500 (đang đếm), FALSE t=2000.

| Scan t | IN | ET | Q | Ghi chú |
|---|---|---|---|---|
| 500 | FALSE | 0 | TRUE | cạnh xuống `_start=500` |
| 1400 | FALSE | 900 | TRUE | |
| 1500 | TRUE | 0 | TRUE | IN lên giữa chừng → hủy đếm, ET=0 |
| 2000 | FALSE | 0 | TRUE | cạnh xuống mới `_start=2000` |
| 4000 | FALSE | 2000 | FALSE | đếm mới đủ PT |

**Bảng G — TP cơ bản (PT=1000):** IN TRUE t=200, giữ TRUE, FALSE t=1500, TRUE t=1600.

| Scan t | IN | ET | Q | Ghi chú |
|---|---|---|---|---|
| 200 | TRUE | 0 | TRUE | cạnh lên `_start=200` |
| 1100 | TRUE | 900 | TRUE | |
| 1200 | TRUE | 1000 | FALSE | `elapsed=1000` → hết xung, `_running=false` |
| 1300 | TRUE | 1000 | FALSE | IN vẫn true: **không** kích lại, ET giữ 1000 (OQ-165) |
| 1500 | FALSE | 0 | FALSE | xung đã hết + IN false → ET=0 |
| 1600 | TRUE | 0 | TRUE | cạnh lên mới → xung mới |
| 2600 | TRUE | 1000 | FALSE | hết xung thứ hai |

**Bảng H — TP cạnh lên trong lúc phát xung bị bỏ qua (PT=1000):** IN TRUE t=200, FALSE t=400, TRUE t=600.
| Scan t | IN | ET | Q | Ghi chú |
|---|---|---|---|---|
| 200 | TRUE | 0 | TRUE | cạnh lên `_start=200` |
| 400 | FALSE | 200 | TRUE | xung vẫn chạy dù IN đã xuống |
| 600 | TRUE | 400 | TRUE | cạnh lên trong xung → bỏ qua, `_start` vẫn 200 |
| 1200 | TRUE | 1000 | FALSE | xung kết thúc đúng t=1200 (không phải 1600) — chứng minh không retrigger |
Biến thể H2 (IN xuống t=400 và giữ FALSE): t=1200 → Q=FALSE, **ET=0** (xung kết thúc + IN false → ET=0, khác H1 giữ 1000).

**Bảng I — TONR (PT=1000):** cột (IN, R, ET, Q).
| Scan t | IN | R | ET | Q | Ghi chú |
|---|---|---|---|---|---|
| 200 | TRUE | FALSE | 0 | FALSE | cạnh lên `_start=200` |
| 600 | TRUE | FALSE | 400 | FALSE | |
| 700 | FALSE | FALSE | 500 | FALSE | IN xuống: `_accum=500`, `_running=false` |
| 1200 | TRUE | FALSE | 500 | FALSE | cạnh lên `_start=1200`, ET=`_accum+0` |
| 1700 | TRUE | FALSE | 1000 | TRUE | `500+500 ≥ PT` |
| 2000 | TRUE | TRUE | 0 | FALSE | R thắng IN: ET=0, `_accum=0` |
| 2100 | TRUE | FALSE | 0 | FALSE | cạnh lên lại sau reset |
Biến thể I3 (TONR PT=0): (IN=T → Q=TRUE, ET=0), (IN=F → Q=FALSE, ET=0), `_accum` giữ 0 suốt (OQ-166).

**Bảng J — R_TRIG / F_TRIG (period 10):** CLK: F,F,T,T,F,T,F ở t=10…70.

| Scan t | CLK | R_TRIG Q | F_TRIG Q | Ghi chú |
|---|---|---|---|---|
| 10 | FALSE | FALSE | FALSE | `_m=false` |
| 20 | FALSE | FALSE | FALSE | |
| 30 | TRUE | TRUE | FALSE | R: cạnh lên; F: `NOT CLK` |
| 40 | TRUE | FALSE | FALSE | |
| 50 | FALSE | FALSE | TRUE | F: cạnh xuống |
| 60 | TRUE | TRUE | FALSE | |
| 70 | FALSE | FALSE | TRUE | |
J3 (scan đầu sau load, CLK=TRUE ở t=10): R_TRIG Q=**TRUE** (`_m` khởi tạo false), F_TRIG Q=**FALSE**. J5 (STOP→RUN giữ `_m`): chạy t=10 CLK=TRUE → `_m=TRUE`; `stop()`; `start()`; scan CLK=TRUE → R_TRIG Q=**FALSE** (OQ-164, VERIFY §14.9).

**Bảng K — SR / RS (period 10):**
| Scan t | SR (S1,R) → Q1 | RS (S,R1) → Q1 | Ghi chú |
|---|---|---|---|
| 10 | (0,0) → 0 | (0,0) → 0 | Q1 init 0 |
| 20 | (1,0) → 1 | (1,0) → 1 | set |
| 30 | (0,0) → 1 | (0,0) → 1 | giữ |
| 40 | (0,1) → 0 | (0,1) → 0 | reset |
| 50 | (1,1) → **1** | (1,1) → **0** | cả hai true: SR set-dominant, RS reset-dominant |
| 60 | (0,1) → 0 | (1,0) → 1 | |
K3: SR và RS trong cùng OB, cùng cặp (S=1,R=1) một scan → SR Q1=1, RS Q1=0 (đối chiếu dominance trong cùng scan).

**Bảng L — CTU (PV=3, period 10):** cột (CU, R, CV, QU).
| Scan t | CU | R | CV | QU | Ghi chú |
|---|---|---|---|---|---|
| 10 | FALSE | FALSE | 0 | FALSE | |
| 20 | TRUE | FALSE | 1 | FALSE | cạnh lên CU |
| 40 | TRUE | FALSE | 2 | FALSE | cạnh lên lần 2 (CU đã xuống ở t=30) |
| 50 | TRUE | FALSE | 2 | FALSE | CU giữ — không cạnh, không đếm |
| 70 | TRUE | FALSE | 3 | TRUE | `CV ≥ PV` |
| 90 | TRUE | TRUE | 0 | FALSE | R thắng đếm cùng scan |
| 100 | TRUE | FALSE | 0 | FALSE | CU giữ (`_prevCU=TRUE`) — không đếm lại |
| 120 | TRUE | FALSE | 1 | FALSE | cạnh lên mới (CU đã xuống ở t=110) |
L3 (biên max): ghi `"C1".CV := 32767` trước scan, CU cạnh lên → CV giữ **32767** (kẹp, không wrap), QU=TRUE; R=TRUE scan sau → CV=0.

**Bảng M — CTD (PV=3, period 10):** cột (CD, LD, CV, QD).
| Scan t | CD | LD | CV | QD | Ghi chú |
|---|---|---|---|---|---|
| 10 | FALSE | FALSE | 0 | TRUE | `CV ≤ 0` |
| 20 | FALSE | TRUE | 3 | FALSE | LD nạp PV |
| 40 | TRUE | FALSE | 2 | FALSE | cạnh lên CD |
| 70 | TRUE | FALSE | 1 | FALSE | cạnh lên lần 2 |
| 90 | TRUE | FALSE | 0 | TRUE | `CV ≤ 0` |
| 100 | FALSE | TRUE | 3 | FALSE | LD nạp lại |
| 110 | TRUE | TRUE | 3 | FALSE | LD thắng đếm cùng scan (không xuống 2) |
M3 (biên min): ghi `"C1".CV := −32768` trước scan, CD cạnh lên → CV giữ **−32768**, QD=TRUE.

**Bảng N — CTUD (PV=5, period 10):** cột (CU, CD, R, LD, CV, QU, QD).
| Scan t | CU | CD | R | LD | CV | QU | QD | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| 10 | F | F | F | F | 0 | FALSE | TRUE | init |
| 20 | F | F | F | T | 5 | TRUE | FALSE | LD nạp PV |
| 30 | T | F | F | F | 6 | TRUE | FALSE | CU lên |
| 50 | F | T | F | F | 5 | TRUE | FALSE | CD lên |
| 60 | T | T | F | F | 5 | TRUE | FALSE | cả hai cùng cạnh → tăng rồi giảm = giữ nguyên |
| 80 | T | F | T | F | 0 | FALSE | TRUE | R cao nhất (không đếm dù CU lên) |
| 90 | F | F | T | T | 0 | FALSE | TRUE | R thắng LD |
| 100 | F | F | F | T | 5 | TRUE | FALSE | LD (R false) |
| 110 | T | F | F | F | 6 | TRUE | FALSE | CU lên |
N4 (PV=0): CV=0 → QU=**TRUE** (`0 ≥ 0`) và QD=**TRUE** (`0 ≤ 0`) cùng lúc; CU cạnh lên → CV=1, QU=TRUE, QD=FALSE.

**Bảng O — layout instance DB std block (§3.4; Bool gói theo bit, ≥2 byte bắt đầu ở offset chẵn, tổng làm tròn lên chẵn):**

| Block | Fields (offset) | Size |
|---|---|---|
| R_TRIG | `CLK@0.0`, `Q@0.1`, `_m@0.2` | 2 |
| F_TRIG | `CLK@0.0`, `Q@0.1`, `_m@0.2` | 2 |
| SR | `S1@0.0`, `R@0.1`, `Q1@0.2` | 2 |
| RS | `S@0.0`, `R1@0.1`, `Q1@0.2` | 2 |
| TON | `IN@0.0`, `PT@2`, `Q@6.0`, `ET@8`, `_start@12`, `_running@16.0`, `_prevIn@16.1` | 18 |
| TOF | như TON | 18 |
| TP | như TON | 18 |
| TONR | `IN@0.0`, `R@0.1`, `PT@2`, `Q@6.0`, `ET@8`, `_start@12`, `_running@16.0`, `_prevIn@16.1`, `_accum@18` | 22 |
| CTU | `CU@0.0`, `R@0.1`, `PV@2`, `QU@4.0`, `CV@6`, `_prevCU@8.0` | 10 |
| CTD | `CD@0.0`, `LD@0.1`, `PV@2`, `QD@4.0`, `CV@6`, `_prevCD@8.0` | 10 |
| CTUD | `CU@0.0`, `CD@0.1`, `R@0.2`, `LD@0.3`, `PV@2`, `QU@4.0`, `QD@4.1`, `CV@6`, `_prevCU@8.0`, `_prevCD@8.1` | 10 |
Ví dụ tính tay (TON): IN Bool byte 0 bit 0; PT Time (4 byte) cần offset chẵn → 2..5; Q Bool byte 6 bit 0; ET Time → offset chẵn 8..11; `_start` DInt → 12..15; `_running`/`_prevIn` Bool gói chung byte 16 (bit 0/1); tổng 17 byte → làm tròn chẵn = **18**. Nếu `layoutStruct` tính khác bảng này → đó là bug (của layout hoặc của bảng), báo và sửa theo §3.4 — **không** sửa bảng cho khớp code (AGENTS §6).

**Bảng P — multi-instance lồng (OQ-161, ghim hành vi hiện tại):** FB `FB_Motor` (VAR_INPUT `iStart: Bool`; VAR_OUTPUT `qRun: Bool`; VAR `tOn: TON; cCount: CTU; sub: FB_Sub;`) với `FB_Sub` (VAR_INPUT `a: Int`; VAR_OUTPUT `q: Bool`; VAR_IN_OUT `io: Int`; VAR `s: Bool`). Layout DB top-level của `FB_Motor` (resolveDb §3.5: input + output + IN_OUT-slot + static, theo thứ tự khai báo):

| Vùng | Offset tuyệt đối | Ghi chú |
|---|---|---|
| `iStart` | `0.0` | Bool |
| `qRun` | `0.1` | Bool (gói chung byte 0) |
| `tOn` (TON, size 18) | `2..19` | struct bắt đầu ở offset chẵn; trong vùng: `IN@+0.0`, `PT@+2`, `Q@+6.0`, `ET@+8`, `_start@+12`, `_running@+16.0`, `_prevIn@+16.1` |
| `cCount` (CTU, size 10) | `20..29` | trong vùng: `CU@+0.0`, `R@+0.1`, `PV@+2`, `QU@+4.0`, `CV@+6`, `_prevCU@+8.0` |
| `sub` (FB_Sub, size 8) | `30..37` | trong vùng (theo `fbInterfaceStruct` hiện tại — IN_OUT kích thước tự nhiên): `a@+0`, `q@+2.0`, `io@+4`, `s@+6.0` |
| **Tổng size** | **38** | chẵn |
Nếu OQ-161 sau này quyết IN_OUT lồng cũng là slot DInt 4 byte: `sub.io` thành slot `@+4..7`, `s@+8.0`, sub size 10, **tổng 40** — test bảng P lúc đó đổi kỳ vọng kèm SCR (không phải sửa lén).

**Test (mục tiêu: ≥ 80 test mới; tổng ≥ 1646 = 1566 + 80):**

| Nhóm | File | Test mới (tên + kỳ vọng) |
|---|---|---|
| defs/layout (~13) | `packages/runtime-iec/src/std/defs.test.ts` | Bảng O: mỗi block 1 test deep-equal `def.layout` (tên/kiểu/offset/bit/size) + `size` (11 test); `stdBlockInterface('TON')` trả input/output đúng + `R`/`LD` mang `init: false` (1); `getStdBlockDef('nope')` → `undefined` (1) |
| handler unit (~24) | `packages/runtime-iec/src/std/handlers.test.ts` | Gọi handler trực tiếp với `DbStore` tay + `nowMs` cho trước (không qua SoftPlc): TON 4 (cơ bản, PT=0, PT=50 kẹp ET, IN xuống reset), TOF 3 (cơ bản, retrigger, PT=0), TP 3 (cơ bản, cạnh lên trong xung bỏ qua, xung hết + IN false → ET=0), TONR 2 (tích lũy + R reset, PT=0), edge 2 (R_TRIG/F_TRIG pattern 7 scan), bistable 2 (SR/RS truth + cả hai true), CTU 3 (đếm + QU, R thắng đếm, kẹp max), CTD 2 (LD + đếm xuống, kẹp min), CTUD 3 (cả hai cạnh cùng lúc, R>LD, QU/QD) |
| typecheck/lower (~15) | `packages/vendor-siemens/src/scl/typecheck.test.ts` + `lower.test.ts` (thêm) | `VAR sT : TON` chấp nhận (hết U001); `DATA_BLOCK "T1" TON` → IrDb đúng bảng O; thiếu PT → T004; arg không tồn tại → T004; out-arg `Q => %M1.0` chấp nhận; arg IN_OUT cho std → T004; std trong biểu thức → T004; std làm kiểu trả FC → T004; std trong VAR_TEMP → T004; `"T1"._start` → T005; `"T1".Q` kiểu Bool / `"T1".ET` kiểu Time; CTU `PV`/`CV` kiểu Int (không có DInt); CTU không truyền `R` vẫn chấp nhận (init FALSE); lower: `#tOn(...)` → `callSys` local; `"T1"(...)` → `callSys` global |
| golden scan (34) | `packages/runtime-iec/src/softplc-std.test.ts` | **Edge/bistable 8** (§12.2): J1 R_TRIG pattern, J2 F_TRIG pattern, J3 R_TRIG scan đầu CLK=true → Q=true, J4 F_TRIG scan đầu → Q=false, J5 R_TRIG STOP→RUN giữ `_m` → Q=false, K1 SR, K2 RS, K3 SR+RS cùng scan (dominance đối chiếu). **Timer 16** (§12.2 ≥ 14): A1 TON 3s, B1 TON PT=0, B2 TON PT=50, B3 TON PT=250, C1 TON IN dao động, D1 TON không gọi vài scan, E1 TOF cơ bản, E2 TOF PT=0, F1 TOF retrigger, G1 TP cơ bản, G2 TP PT=0, H1 TP cạnh lên trong xung bỏ qua, H2 TP xung hết + IN false → ET=0, I1 TONR tích lũy, I2 TONR R reset, I3 TONR PT=0. **Counter 10** (§12.2): L1 CTU đếm + QU, L2 CTU R ưu tiên + đếm lại, L3 CTU kẹp max, M1 CTD LD + đếm xuống + QD, M2 CTD LD thắng đếm, M3 CTD kẹp min, N1 CTUD đếm lên/xuống, N2 CTUD hai cạnh cùng lúc → giữ, N3 CTUD R>LD, N4 CTUD PV=0 (QU và QD cùng true). Mỗi golden ghi `expectedFrom: 'spec'` trong tên test (OQ-174). |
| pipeline SCL (8) | `packages/vendor-siemens/src/scl/softplc-std.test.ts` | Chương trình SCL thật → `compileSclProgram` → SoftPlc (chứng minh cả ba tầng nối nhau): P-S1 TON (bảng A thu gọn), P-S2 TOF, P-S3 TP, P-S4 TONR, P-S5 R_TRIG + SR trong một OB, P-S6 CTU + CTUD, P-S7 multi-instance (`sT : TON` trong VAR của FB + gọi `#sT(...)`, bảng P thu gọn: `"Motor_DB".tOn.Q` đọc đúng), P-S8 out-arg `=>` (`"T1"(IN := %M0.0, PT := T#1s, Q => %M1.0, ET => %MD4)` với tag `%MD4` kiểu Time trong map test — Q và ET vừa ghi vào DB vừa ra Ref cùng giá trị) |
| property (2) | `packages/runtime-iec/src/softplc-std.test.ts` | TON ⇔ IN liên tục ≥ PT (fast-check, seed cố định, §12.3: chuỗi IN ngẫu nhiên + dt ngẫu nhiên {10, 50, 100} so với mô hình tham chiếu tính thời điểm cạnh lên); counter: chuỗi CU/CD/R/LD ngẫu nhiên → CV luôn trong [min,max] + QU/QD đúng công thức theo CV/PV |
| snapshot (1) | `packages/runtime-iec/src/softplc-std.test.ts` | Snapshot giữa TON đang chạy (ET=1500) → chạy 3 scan → restore → chạy 3 scan → trace Q/ET/scanCount giống hệt (OQ-180) |
Tổng bảng trên = 13+24+15+34+8+2+1 = **97 test mới** (mục tiêu sàn ≥ 80, tổng ≥ 1646). Đối chiếu M1 §12.2 cho phần P1.5: R_TRIG/F_TRIG/SR/RS 8 ✓, timer 16 (≥ 14) ✓, counter 10 ✓. Thứ tự triển khai đề xuất: defs → handlers → SoftPlc wiring → typecheck → lower → semantics §16 (test viết cùng từng bước, golden scan cuối cùng).

**Mơ hồ (phân loại):** **Tier A (tự quyết):** vị trí file theo dep graph (`std/*` ở `runtime-iec`, typecheck/lower ở `vendor-siemens`); `IrField.hidden` là flag tùy chọn; handler đọc/ghi qua def offsets (không qua `instance.fields`); thứ tự triển khai (defs → handlers → wiring → typecheck → lower → semantics §16); test dùng `compileSclProgram` + SoftPlc ở vendor-siemens, IR tay qua `ir-testkit` ở runtime-iec (tiền lệ P1.4). **Tier B (mặc định + ghi OQ):** OQ-162 (một nguồn sự thật defs ở runtime-iec); OQ-163 (hidden trong layout, public-only ở member, flag `hidden`); OQ-164 (R_TRIG `_m` init false ở load/reset, STOP→RUN giữ — VERIFY §14.9); OQ-165 (TP xung hết + IN true: ET giữ PT', không kích lại — VERIFY §14.6); OQ-166 (TONR R thắng IN, PT≤0 → Q=IN/ET=0/`_accum`=0); OQ-167 (counter R > LD > đếm; CU+CD cùng cạnh → giữ nguyên — VERIFY §14.8); OQ-168 (counter chỉ Int, DInt hoãn); OQ-169 (timer không gọi vài scan: timestamp, đóng băng giữa các lần gọi — VERIFY §14.5); OQ-170 (SoftPlc nối std mặc định + `cfg.sysCalls` thay thế); OQ-171 (kiểu std chỉ VAR static + DB; VAR_TEMP/FC return/mảng → T004); OQ-172 (PT hiệu dụng `max(PT,0)`); OQ-173 (multi-instance std theo §3.5; OQ-161 vẫn mở); OQ-174 (golden TS + `expectedFrom: 'spec'`; YAML là P1.7); OQ-175 (out-arg `=>` hỗ trợ; handler ghi DB rồi Ref); OQ-176 (PT tính mỗi lần gọi, đổi giữa chừng áp dụng từ lần gọi sau); OQ-177 (counter kẹp max/min, không wrap/không fault — VERIFY §14.8); OQ-178 (SR/RS Q1 là output field, không hidden; dominance theo công thức); OQ-179 (X-002/S1 không chặn P1.5); OQ-180 (snapshot bao trạng thái std tự động); OQ-181 (R/LD tùy chọn `init: false`, input khác bắt buộc, output tùy chọn). **Tier C (không có mục mới):** không mục nào chặn P1.5 — OQ-105 (X-002/S1) vẫn mở từ P1.2, không chặn (OQ-179 ghi rõ lý do); OQ-161 vẫn mở, không chặn (OQ-173); nếu khi triển khai phát hiện §9 thiếu quy tắc mà chỉ mã thật/PLCSIM mới quyết được → ghi OQ/SCR, không tự nới lỏng.

**Rủi ro + cách kiểm:** (1) Ngữ nghĩa std lệch TIA (VERIFY §14.5–9: TON PT=0/dao động/không gọi, TP kích lại, TOF retrigger, counter biên/ưu tiên, R_TRIG scan đầu) — giảm thiểu: mọi case trên đều có golden ghim lựa chọn spec + ghi `UNVERIFIED` ở semantics §16; xác minh bằng PLCSIM khi có (thí nghiệm M5 §10, P5.9) hoặc mẫu SCL thật (S1); nếu sai thì SCR đổi ngữ nghĩa + sửa golden (test là bằng chứng). (2) Tương tác với lưới scan OQ-130: ET có độ phân giải = chu kỳ scan; PT không chia hết chu kỳ → Q lật ở scan đầu `elapsed ≥ PT` (bảng B2/B3 ghim); nếu TIA tính timer theo thời gian thực bên trong scan thì sai lệch tối đa 1 chu kỳ — ghi `UNVERIFIED`, kiểm bằng PLCSIM. (3) Hiệu năng: closure `callSys` của P1.4 cấp phát 2 `Map` (inArgs/outArgs) **mỗi lần gọi mỗi scan** — với bench P1.7 (200 FB_Motor × 3 timer/edge) là 600 cặp Map/scan cộng thêm; P1.4 smoke đã chỉ ~520 scan/s (dưới mục tiêu P1.7 ≥ 1000 scan/s) **trước** P1.5 — giảm thiểu: P1.5 không tối ưu (ngoài phạm vi), nhưng handler tự thân không cấp phát; đo lại smoke ở P1.7 trước khi tối ưu (vd tái dùng Map hoặc truyền args theo vị trí). (4) OQ-161 lật: nếu IN_OUT lồng quyết slot 4 byte thì bảng P đổi 38 → 40 + sửa `fbInterfaceStruct` — giảm thiểu: test bảng P ghim số hiện tại, đổi kỳ vọng chỉ kèm SCR. (5) Mã thật dùng counter DInt hoặc timer trong VAR_TEMP: P1.5 từ chối ồn ào (T004) — không chạy sai im lặng; nếu S1 cho thấy TIA cho phép thì SCR nới lỏng (OQ-168/OQ-171). (6) `IrField.hidden` là thay đổi IR: golden IR JSON cũ không được đổi (kiểm bằng diff trước commit — mục 5 thiết kế); nếu `irToJson`/test nào assert shape field tuyệt đối thì đó là chỗ phải sửa test có lý do, báo trong triển khai.

**Ngoài phạm vi:** biến thể counter DInt (OQ-168); LAD (P1.6); golden runner YAML + port ví dụ §12.1 `ton_basic_3s` (P1.7); demo `motor-interlock` + CLI `vcs plc run` + Watch + bench M1 §12.4 (P1.7); tối ưu cấp phát `callSys` (P1.7); S7/PLCSIM/SimaticML (M5); sửa EBNF §4.2 / M1 §9; đổi `.dependency-cruiser.cjs` / `eslint.config.js` / `vitest.config.ts` / `packages/kernel` / `packages/schemas` / `apps/*` / `examples/`; ADR mới; mã diagnostic mới (`docs/diagnostics.md` giữ 42 mã); `docs/facts/` mới; P0.9 PWA; script spike S1 (chạy khi có mã thật).

**Gate P1.5 (triển khai):** `lint && typecheck && depcheck && test && test:e2e && review:cheats && docs:diagnostics --check` + `build` + bench guard M0 (`pnpm bench`: TagDB 4/4 PASS + orchestrator ≥ 100 000 bước/s; rớt > 20% so với baseline thì dừng điều tra, không hạ ngưỡng) + CI (check + test ubuntu/windows + e2e ubuntu) xanh. Tổng test sau P1.5: **≥ 1646** (≥ 80 mới), trong đó golden timer ≥ 14 + counter ≥ 10 (PROMPTS) + edge/bistable 8 (§12.2) + 2 property test fast-check (seed cố định). `pnpm-lock.yaml` **không đổi** (không dependency mới — diff lockfile khác rỗng là cờ đỏ, dừng kiểm tra). `pnpm install` trong VM vẫn EPERM (OQ-007) — triển khai làm ở bản sao `/tmp` như các prompt trước, cài thật `--frozen-lockfile` (dùng `git archive` để copy, không `cp -r` cả cây kèm `node_modules` — bài học ENOSPC ở P0.8), **rsync về `~/workspace/vcs` sau mỗi bước lớn, KHÔNG dùng `--delete` (hoặc luôn `--exclude .git`) — bài học mất `.git` ở P1.4**. **Cần kiểm lại khi triển khai:** root `package.json` không bị ghi đè (bài học P1.2 — kiểm `name: "vcs"` + diff vs HEAD trống trước khi commit); `user-chat/` không trong commit; golden IR JSON cũ không đổi (mục 5 thiết kế).

**Kết quả triển khai P1.5 (2026-11-25, commit feat(m1) — xem `git log` nhánh `m1/p1.5-std-blocks`):**

- **File:** mới `runtime-iec/src/std/defs.ts` (11 def + `STD_BLOCKS`/`getStdBlockDef`/`stdBlockInterface`, layout qua `layoutStruct` tính 1 lần lúc load module), `runtime-iec/src/std/handlers.ts` (`createStdSysCalls()` + 11 handler, đọc/ghi qua def offsets + `instance.base`, không cấp phát mỗi lần gọi, lookup field giải 1 lần lúc tạo handler), `runtime-iec/src/std/index.ts`, `runtime-iec/src/std/defs.test.ts` (15), `runtime-iec/src/std/handlers.test.ts` (26), `runtime-iec/src/softplc-std.test.ts` (37: 34 golden + 2 property + 1 snapshot), `vendor-siemens/src/scl/softplc-std.test.ts` (8 pipeline P-S1…P-S8); sửa `runtime-iec/src/ir.ts` (`IrField.hidden?`), `runtime-iec/src/index.ts` (export std), `runtime-iec/src/softplc.ts` (`SoftPlcConfig.sysCalls?` + nối `createStdSysCalls()` mặc định ở cả hai chỗ dựng Interpreter), `runtime-iec/src/ir-testkit.ts` (helper `stdDb`), `vendor-siemens/src/scl/typecheck.ts` (U001 gỡ ở 4 điểm: `lookupInterface` → std iface, `resolveTypeNode` placement static/other, `resolveDb` fbName → IrDb std, `checkCallExpr`/`checkCallStmt`/`checkCallStmtIdent` + T005 cho field hidden), `vendor-siemens/src/scl/lower.ts` (`#sT(...)`/`"T1"(...)` → `callSys`), `docs/semantics.md` §16 + cập nhật đoạn OQ-111 ở §14 ("hỗ trợ từ P1.5"). Không dependency mới; `pnpm-lock.yaml` + root `package.json` không đổi; diagnostics giữ 42 mã; golden IR JSON cũ không đổi (`git status` thư mục `golden/` sạch; `irToJson` chỉ thêm key `hidden` khi set — không field nào cũ có hidden).
- **Test: 100 mới, tổng 1666 (1566 + 100)** — defs 15, handlers 26, golden scan 37 (34 + 2 property fast-check seed 20261125/20261124 + 1 snapshot), typecheck 12, lower 2, pipeline 8. Vượt sàn ≥ 80 mới / ≥ 1646 tổng. Golden timer 16 + counter 10 + edge/bistable 8 (§12.2) + 2 property.
- **OQ-162…181 đóng (đã áp dụng)** — xem `open-questions.md`; **OQ-161 vẫn mở** (bảng P ghim 38 byte). OQ-111 cập nhật "hỗ trợ từ P1.5" (semantics §14 + §16).
- **Lệch so với plan (ghi rõ, không sửa bảng):**
  1. **Bảng N (CTUD):** các hàng liên tiếp trên lưới 10 ms tự mâu thuẫn — hàng t=50 có CD=true nhưng hàng t=60 cần cạnh lên CD, đòi scan trung gian CD=false không tồn tại giữa t=50 và t=60. Golden N1 chèn scan trung gian all-false (hàng "cả hai cùng cạnh" thành t=70); logic ghim không đổi (cả hai cạnh cùng scan → CV giữ nguyên). Bảng L/M không mâu thuẫn (khoảng 20–30 ms cho phép scan trung gian).
  2. **Cú pháp DATA_BLOCK std:** plan viết `DATA_BLOCK "T1" TON` (không ngoặc) nhưng EBNF M1 §4.2 bắt tên FB trong ngoặc kép (`"\"" fbname "\""`) — parser P1.2/P1.3 đã theo EBNF (như `DATA_BLOCK "DB_X" "FB_X"`). Test dùng dạng có ngoặc `DATA_BLOCK "T1" "TON"`; đây là cách viết đúng theo grammar, không phải nới lỏng.
  3. **`#sT(...)` trong biểu thức không parse được** (parser chỉ chấp nhận call dạng `"tên"(...)` ở vị trí biểu thức, như FC — FB không trả giá trị nên đúng là không có ý nghĩa); test "std trong biểu thức → T004" dùng dạng `"TON"(...)` trong OB thay vì `#sT(...)` trong FB.
  4. **P-S4…P-S8:** thứ tự block khác bảng plan (P-S4 CTU thay vì TONR; P-S6 TONR+CTD thay vì CTU+CTUD; CTUD chỉ ở golden scan + handler, không ở pipeline); P-S8 out-arg ET vào `"DB_Out".et` thay vì `%MD4`; P-S7 DB tên `DB_Motor` (plan viết `"Motor_DB"`), đọc `"DB_Motor".cCount.CV`. Ý định (chứng minh cả ba tầng nối nhau qua SCL thật) giữ nguyên; mọi block đều có pipeline trừ CTUD/F_TRIG/RS (chỉ golden scan).
  5. **TONR ET không kẹp PT:** P-S6 ghim ET=1200 khi IN xuống sau khi đã vượt PT=1000 (công thức §9.3 `ET=_accum+(now−_start)` không có kẹp; bảng I không có hàng vượt PT nên không ghim ngược). Ghi `UNVERIFIED` ở semantics §16 — chờ S1/PLCSIM; nếu TIA kẹp thì SCR + sửa handler + golden.
  6. **P-S6 lúc đầu kỳ vọng sai:** tưởng TONR Q=false khi IN xuống sau khi Q đã lên — sai, TONR giữ Q (retentive, M1 §9.3: IN false → `Q = ET ≥ PT`). Test sửa kỳ vọng theo spec (Q=true, ET=1200 ở i=13; R reset rồi chạy đủ PT mới có cạnh CD thứ hai ở i=25) — đây là sửa test theo spec đã đọc lại, không phải sửa để xanh.
  7. **3 test cũ đổi kỳ vọng do chính tính năng P1.5** (không phải sửa để qua gate): `typecheck.test.ts` "TON trong VAR_TEMP → U001" thành T004 (OQ-171), "gọi #sT → U001" thành hợp lệ; `typecheck-coverage.test.ts` "gọi system FB dạng statement → U001" thành T001 (không có DB). Thêm 1 test P1.4 phải đổi setup: `softplc-scan.test.ts` "TON không handler → SYS_UNSUPPORTED" nay truyền `sysCalls: new Map()` tường minh (OQ-170 — SoftPlc mặc định đã có handler); test vẫn ghim đúng hành vi OQ-143 và đồng thời kiểm đường override `cfg.sysCalls?`.
- **Gate (ĐÃ CHẠY thật ở bản sao `/tmp/vcs-p15`, install thật `--frozen-lockfile`, log `/tmp/p15-*.log`):** lint EXIT=0; typecheck EXIT=0; depcheck EXIT=0 (115 modules, 218 deps, no violations); test **1666/1666** (63 files) EXIT=0; review:cheats **SẠCH** (161 file) EXIT=0; docs:diagnostics --check **khớp, 42 mã** EXIT=0; build EXIT=0; test:e2e **5 passed** EXIT=0; bench TagDB 4/4 PASS (set/get 49,169,293 ops/s ≥ 10M) + orchestrator **491,403 steps/s** (≥ 100k) EXIT=0. Smoke 200 FB_Motor CHƯA CHẠY (đo ở P1.7 theo plan).
- **Việc tiếp theo:** PR P1.5 qua cloud browser (theo quy trình chuẩn) → CI xanh → merge → P1.6 (LAD).

---

## 21. P1.6 — LAD: schema + validate + lower → IR (plan, 2026-11-25)

**Prompt P1.6 (nguyên văn):** "Làm P1.6 theo AGENTS.md §9. Đọc: … → M1 §5. Nhiệm vụ: LAD: schema zod + validate + lower LAD → IR (dùng chung interpreter, không interpreter riêng). RLO/EN/ENO theo 5.2. Gate: ≥ 8 golden LAD."

**Tóm tắt hiểu biết (5 dòng):** (1) LAD là JSON: `LadBlock {kind, name, number?, interface, networks[]}`, mỗi network là một rung (mảng element) — M1 §5.1. (2) Ngữ nghĩa RLO §5.2: RLO bắt đầu `true` ở thanh nguồn trái; tiếp điểm NO/NC, `parallel` = OR, `not` đảo RLO, coil ghi RLO, set/reset chỉ ghi khi RLO, box lấy RLO làm EN. (3) Lower LAD → **cùng IR với SCL** (§6), chạy bằng interpreter P1.4 — không interpreter riêng; box std (TON…) → `callSys` (P1.5), box toán/so sánh → `binary`/`intrinsic`. (4) Khác SCL: LAD không có tên `"..."` trỏ DB — operand `{sym}` là **tag** (giải qua tag catalog), `{abs}` là địa chỉ tuyệt đối, `{local}` là `#var` của block. (5) Spec để trống nhiều chỗ (tên key input box toán, ngữ nghĩa pos/neg, RLO sau box trừ TON, instance DB cho LAD) — 15 OQ tier B dưới đây, không có tier C.

**Đọc:** M1 §5 (dòng 213–265: schema §5.1 + ngữ nghĩa §5.2), §3.5 (layout DB), §6 (IR), §12.1–12.2 (golden + `expectedFrom`), §14 (mục 5–11: VERIFY), §16–17 (chấp nhận + mặc định); AMENDMENTS — không mục nào chạm §5 (A16 CI, A17 bench, A18 drift, A19 "Ghi thử", A10 server Node); STATE §19–§20; semantics §14–§16; skill `SKILL-siemens-integration` §3 — ghi chú: câu "LAD/FBD = đồ thị Parts/Wires → dataflow, không ép về series/parallel" chỉ áp dụng cho **SimaticML import (S3, P5.x)**, không áp dụng cho P1.6: M1 §5 định nghĩa LAD JSON theo mô hình rung RLO, P1.6 theo spec; RLO chính là giá trị dataflow cho logic tiếp điểm.

**Phạm vi:**
- Mới: `packages/vendor-siemens/src/lad/{schema.ts, validate.ts, lower.ts}` + test; export ở `packages/vendor-siemens/src/index.ts`; 9 mã diagnostic LAD (`LAD_CATALOG` trong `packages/schemas/src/diagnostics-catalog.ts`, `scripts/gen-diagnostics.ts` thêm vào `CATALOGS` — tiền lệ P1.2; `docs/diagnostics.md` sinh lại bằng script, không sửa tay — AGENTS §11); `docs/semantics.md` §17 mới.
- Tái dùng (không viết lại): IR `packages/runtime-iec/src/ir.ts` (**không đổi** — không thêm field); interpreter + `callSys` + `getStdBlockDef` (P1.4/P1.5); `parseAddress` (P1.1, OQ-110 độ rộng → kiểu); `interfaceFromSymbols` + `layoutIrFields` + `sclTypeToIrType` (export sẵn từ `typecheck.ts`); `obNumber` (export sẵn từ `lower.ts`, OQ-113); `compileSclProgram`/`CompileContext` để chương trình hỗn hợp SCL+LAD chung một ctx; luật widening + `binaryResultType` của SCL cho box toán/so sánh; `TagAddressMap`/`buildTagAddressMap` (OQ-137/138).
- KHÔNG thuộc phạm vi: interpreter riêng cho LAD; LAD editor UI (P1.7); golden runner YAML (P1.7); demo/examples mới ngoài golden; CLI mới (`vcs ir dump` cho LAD để P1.7 — dump qua `compileProject` sau); gọi FB/FC người dùng từ LAD (schema §5.1 không có box call — giới hạn, xem mục "Ngoài phạm vi"); STL/GRAPH; S7/PLCSIM/SimaticML (M5); sửa EBNF §4.2 / M1 §5; ADR mới; `docs/facts/` mới; P0.9.

**Thiết kế (6 điểm):**
1. **Schema (zod) — `lad/schema.ts`:** `LadBlock {kind: 'FC'|'FB'|'OB', name, number?, interface, networks[]}`; `LadNetwork {id, title?, comment?, rung: LadElement[]}`; element: `contact {NO|NC, operand}`, `pos`/`neg {operand, memBit}`, `parallel {branches: LadRung[]}`, `not`, `coil {normal|negated, operand}`, `set`/`reset {operand}`, `box {fn, instance?, inputs, outputs}`. Interface JSON **cùng dạng SCL** — `{input?, output?, inout?, static?, temp?}`, mỗi decl `{name, type, init?}` — validate dựng `BlockSymbols` rồi tái dùng `interfaceFromSymbols` → `IrInterface`. Kiểu trong interface là chuỗi: tên nguyên thủy (không phân biệt hoa/thường, OQ-098), tên UDT/FB trong ctx, tên std block (chỉ VAR static/DB — OQ-171 tái dùng), `Array[lo..hi] of T` (OQ-191). Kind FC/OB → `static` phải rỗng (mirror SCL — OQ-192).
2. **Validate — `lad/validate.ts`:** `validateLad(block, opts: {tags: TagDef[], ctx?: CompileContext}) → {irInterface, networks: ValidatedNetwork[], diagnostics}`. Operand: `{sym}` → tra tag catalog (kiểu từ catalog; không thấy → LAD-T001); `{abs}` → `parseAddress` + kiểu theo độ rộng OQ-110 (bit→Bool, 8→Byte, 16→Int, 32→DInt); `{local}` → `#name[.member]*`, member theo luật SCL (T005, hidden → T005 — OQ-163). Contact/coil/set/reset/pos/neg operand phải Bool, else LAD-T002. **DB field không địa chỉ trực tiếp qua operand** (schema chỉ có 3 dạng) — đọc Q/ET của std box qua (a) RLO sau box, (b) `outputs` của box, (c) `#tOn.Q` local (OQ-187). Coil ghi VAR_INPUT của chính block → LAD-T006 (mirror OQ-129). Rung rỗng / nhánh parallel rỗng / `branches: []` → LAD-S001. Diagnostic LAD: `line=1, col=1` (JSON không có vị trí nguồn), message luôn ghi network id + chỉ số element (OQ-193).
3. **Box instance — `validate.ts` (tiếp):** `instance?: Operand` giải theo **namespace riêng theo vị trí**: `{local}` → static var của block (kiểu std, layout §3.5 qua `resolveDb`); `{sym}` → DB toàn cục theo tên trong `ctx.dbs`, `fbName` phải đúng fn (mirror `resolveDb` P1.3 — sai tên/không có DB → LAD-T001); `{abs}` → LAD-T004. Instance DB cho LAD ở OB lấy từ ctx (biên dịch SCL `DATA_BLOCK "T1" "TON"` trước, rồi LAD tham chiếu `{sym: "T1"}`) — P1.6 không thêm cú pháp DATA_BLOCK cho LAD (OQ-188). Box std thiếu instance → LAD-T004. Box toán/so sánh/MOVE: `instance` phải vắng (có → LAD-T004).
4. **Lower — `lad/lower.ts`:** `lowerLad(validated) → {block: IrBlock, networkMap: Record<networkId, number[]>}`; `compileLad(block, opts, ctx?) → {program, diagnostics}` hợp nhất IrBlock vào ctx chung với SCL (dùng `programFromCtx`, OB binding qua `obNumber` — OQ-113 tái dùng). Temp: **một `__lad_rlo` chung** (mỗi network gán lại `const true` ở đầu — RLO bắt đầu ở thanh nguồn) + temp nhánh `__lad_b<depth>_<idx>` cho parallel; tên temp suy ra từ network id, đụng tên người dùng → LAD-T009 (OQ-189). Temp nằm trong `interface.temp` (tiền lệ synthetic local OQ-112). Map network → chỉ số trong `IrBlock.body` (IR không có node id — OQ-186). Thứ tự: network chạy theo thứ tự mảng; nhiều coil cùng operand trong một network → coil sau thắng (assign tuần tự).
5. **Quy tắc RLO/EN/ENO (từ §5.2 + OQ):**

   | Element | Công thức RLO / hành vi | IR sinh ra |
   |---|---|---|
   | contact NO | `rlo = rlo AND v` | `assign __rlo = binary(and, __rlo, load(v))` |
   | contact NC | `rlo = rlo AND NOT v` | `... unary(not, load(v))` |
   | `pos` | `rlo = rlo AND (v AND NOT m)`; sau đó `m := v` | 2 assign (m = memBit) |
   | `neg` | `rlo = rlo AND (NOT v AND m)`; sau đó `m := v` | 2 assign |
   | `parallel` | `rlo = OR(nhánh_i(rlo_vào))`, nhánh tính theo thứ tự mảng | temp nhánh + OR |
   | `not` | `rlo = NOT rlo` | `assign __rlo = unary(not, __rlo)` |
   | coil normal / negated | `operand := rlo` / `:= NOT rlo` (mọi scan) | 1 assign |
   | `set` / `reset` | nếu rlo thì `operand := true` / `false`; giữ nguyên khi rlo=false | `if (__rlo) { assign ... }` |
   | box std (9 khối) | **luôn `callSys`, không bọc `if (EN)`**; rlo sau = Q-like (bảng dưới) | `callSys` + `assign __rlo = load(instance.<Q-like>)` |
   | box compare | `rlo = EN AND cmp` (không cần bọc if — EN=false cho kết quả false giống hệt) | `assign __rlo = binary(and, __rlo, binary(cmp, in1, in2))` |
   | box toán/MOVE/CONVERT/NORM_X/SCALE_X/LIMIT/MIN/MAX | **chỉ thực thi khi EN** (bọc `if (__rlo)`); rlo sau = ENO = EN (không đổi) | `if (__rlo) { assign OUT = ... }` |

   Bảng rlo sau box std (OQ-184 — spec chỉ quy ước TON→Q, còn lại là mặc định tier B, VERIFY):

   | Box | rlo sau | Box | rlo sau |
   |---|---|---|---|
   | TON / TOF / TP / TONR | Q | CTU | QU |
   | R_TRIG / F_TRIG | Q | CTD | QD |
   | SR / RS | Q1 | CTUD | QU (QD đọc qua `outputs`) |

   Chữ ký box (OQ-194 — tên key chưa có trong spec; theo TIA + tên arg intrinsic SCL):

   | Box | inputs (bắt buộc trừ ghi chú) | outputs | rlo sau |
   |---|---|---|---|
   | TON / TOF / TP / TONR | IN, PT | Q, ET (tùy chọn, qua `=>`) | Q |
   | CTU | CU, PV, R? | QU, CV | QU |
   | CTD | CD, PV, LD? | QD, CV | QD |
   | CTUD | CU, CD, PV, R?, LD? | QU, QD, CV | QU |
   | SR / RS | S, R | Q1 | Q1 |
   | R_TRIG / F_TRIG | CLK | Q | Q |
   | EQ / NE / LT / LE / GT / GE | IN1, IN2 | — (rlo là kết quả) | EN AND cmp |
   | ADD / SUB / MUL / DIV | IN1, IN2 | OUT | EN |
   | MOVE | IN | OUT | EN |
   | CONVERT | IN | OUT (kiểu đích = kiểu OUT) | EN |
   | NORM_X / SCALE_X | MIN, MAX, VALUE | OUT | EN |
   | LIMIT | MN, MX, IN | OUT | EN |
   | MIN / MAX | IN1, IN2 | OUT | EN |

   R/LD tùy chọn (`init: false` — OQ-181 tái dùng). Kiểu box toán/so sánh theo luật SCL (`binaryResultType`, widening; sai → LAD-T002/T003). `Const` không type: number → Int, bool → Bool; PT kiểu Time bắt buộc `type: 'Time'` (OQ-195). DIV 0 → fault `DIV_ZERO` của interpreter (không kiểm ở validate). CONVERT: mode mặc định như SCL `X_TO_Y` (OQ-150 — range → 0 + `CONV_RANGE`).
6. **Diagnostics mới — 9 mã LAD** (tiền lệ P1.2; `DIAGNOSTIC_CODE_RE` đã khớp chữ L/T/S/U — không cần nới; tổng 42 → **51 mã**): LAD-S001 schema/cấu trúc (zod fail + rung/parallel rỗng + box có `instance` thừa/thiếu dạng + FC/OB có static); LAD-T001 tên chưa khai báo (sym/local/DB instance); LAD-T002 kiểu không khớp (contact/coil/box in-out/const); LAD-T003 box/toán tử không áp dụng cho kiểu (ADD trên Bool, so sánh struct); LAD-T004 lỗi gọi box (thiếu input bắt buộc, instance sai, output không tồn tại, std trong biểu thức n/a); LAD-T005 member sai (local path, hidden); LAD-T006 gán không hợp lệ (coil ghi VAR_INPUT); LAD-T009 trùng tên (var, network id, temp `__lad_*`); LAD-U001 chưa hỗ trợ (box fn ngoài tập M1, kiểu String, Array lồng nhau). Mỗi mã ≥ 1 test (AGENTS §6).

**Dependencies mới:** **zod 4.6.7** (phát hành 2026-10-12, 44 ngày — thỏa quy tắc ≥14 ngày) thêm làm dependency **trực tiếp** của `packages/vendor-siemens` (`"zod": "4.6.7"`): zod đã là dep của `@vcs/schemas` nhưng không re-export; LAD schema sống ở vendor-siemens theo M1 §2 nên khai báo trực tiếp (không import xuyên package). Lockfile thay đổi **chỉ** thêm importer `vendor-siemens → zod` (tiền lệ P1.1: +18 dòng cho 2 importer) — diff khác là cờ đỏ, dừng kiểm tra. Không dependency mới nào khác. `pnpm install` trong VM vẫn EPERM (OQ-007) — làm ở bản sao `/tmp` như các prompt trước.

**Golden LAD — 12 bảng tính tay (vượt sàn §12.2: ≥ 8 — series/parallel/box/coil phủ định/edge).** Quy ước chung: lưới scan đều 10 ms trừ khi ghi khác (OQ-130: scan đầu ở t=10, không phải 0); `expectedFrom: 'spec'` trong tên test (OQ-174). Mỗi bảng là trace SoftPlc đầy đủ (không sao chép số từ implementation — AGENTS §6).

- **Bảng A — series NO + NC + coil.** OB, rung: `[NO %I0.0] — [NC %I0.1] — (coil %Q0.0)`.

  | scan | I0.0 | I0.1 | RLO sau c1 | RLO sau c2 | Q0.0 |
  |---|---|---|---|---|---|
  | 10 | F | T | F | F | F |
  | 20 | T | F | T | T | T |
  | 30 | T | T | T | F | F |
  | 40 | F | F | F | F | F |

  IR tương ứng (OB `Main`, temp `__lad_N1_rlo: Bool`):
  ```
  assign __lad_N1_rlo = const Bool true
  assign __lad_N1_rlo = binary(and, Bool, load(__lad_N1_rlo), load(abs %I0.0 Bool))
  assign __lad_N1_rlo = binary(and, Bool, load(__lad_N1_rlo), unary(not, Bool, load(abs %I0.1 Bool)))
  assign abs %Q0.0 Bool = load(__lad_N1_rlo)
  ```
  Các golden còn lại dùng cùng mẫu IR (assign/binary/unary/if/callSys) — chỉ ghi trace giá trị + ghi chú IR khác biệt.

- **Bảng B — parallel (OR).** Rung: `parallel[ [NO %I0.0], [NO %I0.1, NO %I0.2] ] — (coil %Q0.0)`. RLO = `I0.0 OR (I0.1 AND I0.2)`.

  | scan | I0.0 | I0.1 | I0.2 | nhánh 1 | nhánh 2 | Q0.0 |
  |---|---|---|---|---|---|---|
  | 10 | F | T | T | F | T | T |
  | 20 | F | T | F | F | F | F |
  | 30 | T | F | F | T | F | T |
  | 40 | F | F | T | F | F | F |

- **Bảng C — `not` + coil phủ định (phủ định kép).** Rung 1: `[NO %I0.0] — (not) — (coil negated %Q0.0)`; rung 2: `[NO %I0.0] — (coil %Q0.1)`.

  | scan | I0.0 | RLO sau c1 | RLO sau not | Q0.0 (neg) | Q0.1 |
  |---|---|---|---|---|---|
  | 10 | F | F | T | F | F |
  | 20 | T | T | F | T | T |

- **Bảng D — edge `pos`/`neg` (đối chiếu R_TRIG/F_TRIG P1.5).** Rung 1: `[pos %I0.0 mem %M0.0] — (coil %Q0.0)`; rung 2: `[neg %I0.0 mem %M0.1] — (coil %Q0.1)`. `pos`: Q = v AND NOT m_trước, rồi m := v; `neg`: Q = NOT v AND m_trước, rồi m := v.

  | scan | I0.0 | Q0.0 (pos) | Q0.1 (neg) | M0.0 | M0.1 |
  |---|---|---|---|---|---|
  | 10 | F | F | F | F | F |
  | 20 | F | F | F | F | F |
  | 30 | T | T | F | T | T |
  | 40 | T | F | F | T | T |
  | 50 | F | F | T | F | F |
  | 60 | T | T | F | T | T |
  | 70 | F | F | T | F | F |

- **Bảng E — set/reset (SR latch + thứ tự network).** N1: `[NO %I0.0] — (S %M0.0)`; N2: `[NO %I0.1] — (R %M0.0)`; N3: `[NO %M0.0] — (coil %Q0.0)`.

  | scan | I0.0 (set) | I0.1 (reset) | M0.0 sau | Q0.0 |
  |---|---|---|---|---|
  | 10 | F | F | F | F |
  | 20 | T | F | T | T |
  | 30 | F | F | T (giữ) | T |
  | 40 | F | T | F | F |
  | 50 | T | T | F (set rồi reset cùng scan → reset thắng) | F |
  | 60 | T | F | T | T |

- **Bảng F — TON box + rlo sau = Q.** OB, network: `[NO %I0.0] — [TON instance {sym:"T1"} inputs {IN:%I0.0, PT:T#3s} outputs {Q:%M1.0}] — (coil %Q0.0)`. DB `"T1" "TON"` biên dịch từ SCL trước (ctx chung). Chu kỳ 100 ms; IN: F@100, T@200…3300, F@3400. IR: `callSys TON` không bọc if; sau đó `assign __rlo = load(dbField("T1",["Q"]))`.

  | scan | I0.0 (IN) | EN (=I0.0) | T1.ET | T1.Q | Q0.0 |
  |---|---|---|---|---|---|
  | 100 | F | F | 0 | F | F |
  | 200 | T | T | 0 | F | F |
  | 300 | T | T | 100 | F | F |
  | 1100 | T | T | 900 | F | F |
  | 3100 | T | T | 2900 | F | F |
  | 3200 | T | T | 3000 | T | T |
  | 3300 | T | T | 3000 | T | T |
  | 3400 | F | F | 0 | F | F |

- **Bảng G — CTU box + compare box nối tiếp.** Network: `[CTU instance {sym:"C1"} inputs {CU:%I0.0, R:%I0.1, PV:3} outputs {CV:%MW10}] — [EQ inputs {IN1:%MW10, IN2:3}] — (coil %Q0.0)`. R=F suốt. IR: `callSys CTU` + `assign __rlo = load(dbField("C1",["QU"]))`, rồi `assign __rlo = binary(and, __rlo, binary(eq, Int, load(%MW10), const 3))`.

  | scan | CU | CV sau CTU | QU | EQ (CV==3) | Q0.0 |
  |---|---|---|---|---|---|
  | 10 | F | 0 | F | F | F |
  | 20 | T | 1 | F | F | F |
  | 30 | F | 1 | F | F | F |
  | 40 | T | 2 | F | F | F |
  | 50 | F | 2 | F | F | F |
  | 60 | F | 2 | F | F | F |
  | 70 | T | 3 | T | T | T |
  | 80 | F | 3 | T | T | T |
  | 90 | T | 4 | T | F | F |

- **Bảng H — math box + MOVE, EN gating.** N1: `[NO %I0.0] — [ADD inputs {IN1:%MW10, IN2:5} outputs {OUT:%MW12}] — (coil %Q0.0)`; N2: `[NO %I0.1] — [MOVE inputs {IN:%MW12} outputs {OUT:%MW14}]`. MW10=10 đặt trước. IR: `if (__rlo) { assign %MW12 = binary(add, Int, %MW10, 5) }`; rlo sau box không đổi (ENO=EN).

  | scan | I0.0 | MW12 sau | Q0.0 | scan | I0.1 | MW14 sau |
  |---|---|---|---|---|---|---|
  | 10 | F | 0 (giữ — không thực thi khi EN=false) | F | 50 | T | 15 (MOVE khi EN) |
  | 20 | T | 15 | T | 60 | F | 15 (giữ) |
  | 30 | T | 15 | T | | | |
  | 40 | F | 15 (giữ) | F | | | |

- **Bảng I — multi-network, network sau đọc giá trị network trước ghi cùng scan.** N1: `[NO %I0.0] — (coil %M0.0)`; N2: `[NO %M0.0] — (coil %Q0.0)`.

  | scan | I0.0 | M0.0 sau N1 | Q0.0 sau N2 |
  |---|---|---|---|---|
  | 10 | F | F | F |
  | 20 | T | T | T (cùng scan) |
  | 30 | F | F | F |

- **Bảng J — FB LAD multi-instance (static TON + local).** FB `FB_Lad`: VAR_INPUT `iStart: Bool`; VAR_OUTPUT `qRun: Bool`; VAR `sT: TON`. Network: `[NO #iStart] — [TON instance {local:"#sT"} inputs {IN:#iStart, PT:T#300ms}] — (coil #qRun)`. Chu kỳ 100 ms; iStart: F@100, T@200…500, F@600. Test qua chương trình hỗn hợp: SCL OB1 gọi `FB_Lad_DB` + LAD FB + SCL `DATA_BLOCK "FB_Lad_DB" "FB_Lad"` trong một ctx (chứng minh ctx chung SCL+LAD). IR: `callSys TON` instance `{k:'static', path:['sT']}`; rlo sau = `load(static ["sT","Q"])`.

  | scan | iStart | sT.ET | sT.Q | qRun |
  |---|---|---|---|---|
  | 100 | F | 0 | F | F |
  | 200 | T | 0 | F | F |
  | 300 | T | 100 | F | F |
  | 400 | T | 200 | F | F |
  | 500 | T | 300 | T | T |
  | 600 | F | 0 | F | F |

- **Bảng K — parallel lồng nhau.** Rung: `parallel[ [NO %I0.0, NO %I0.1], [parallel[ [NO %I0.2], [NO %I0.3, NO %I0.4] ]] ] — (coil %Q0.0)`. RLO = `(I0.0 AND I0.1) OR (I0.2 OR (I0.3 AND I0.4))`.

  | scan | I0.0 | I0.1 | I0.2 | I0.3 | I0.4 | Q0.0 |
  |---|---|---|---|---|---|---|
  | 10 | T | T | F | F | F | T (nhánh 1) |
  | 20 | T | F | F | F | F | F |
  | 30 | F | F | T | F | F | T (nhánh 2a) |
  | 40 | F | F | F | T | T | T (nhánh 2b) |
  | 50 | F | F | F | T | F | F |

- **Bảng L — EN=false: timer vẫn chạy, math không chạy (ghim lựa chọn OQ-185).** N1: `[NO %I0.0] — [TON instance {sym:"T1"} inputs {IN:%I0.1, PT:T#200ms}] — (coil %Q0.0)`; N2: `[NO %I0.0] — [ADD inputs {IN1:1, IN2:2} outputs {OUT:%MW20}]`. I0.0=F suốt (EN=false); I0.1: F@100, T@200…500. Chu kỳ 100 ms.

  | scan | I0.0 (EN) | I0.1 (IN) | T1.ET | T1.Q | Q0.0 | MW20 |
  |---|---|---|---|---|---|---|
  | 100 | F | F | 0 | F | F | 0 |
  | 200 | F | T | 0 | F | F | 0 |
  | 300 | F | T | 100 | F | F | 0 |
  | 400 | F | T | 200 | T | T | 0 |
  | 500 | F | T | 200 | T | T | 0 |

  Hành vi gây bất ngờ nhưng đúng theo spec-literal: TON chạy dù EN=false (IN lái timer) nên Q lên ở scan 400 và coil sau nó lên **dù contact trước mở**; ADD không bao giờ thực thi nên MW20 giữ 0. Nếu PLCSIM cho thấy TIA chặn timer khi EN=false → SCR + sửa OQ-185 + bảng L (xem rủi ro 1).

**Test target (≥ 60 mới, tổng ≥ 1726):**

| Nhóm | File | Số lượng |
|---|---|---|
| schema (12) | `packages/vendor-siemens/src/lad/schema.test.ts` | block hợp lệ; kind sai; thiếu networks; rung rỗng; parallel rỗng; box fn lạ; operand sai dạng; interface trùng tên; Array sai cú pháp; init sai kiểu; network id trùng; `number?` sai kiểu |
| validate (18) | `packages/vendor-siemens/src/lad/validate.test.ts` | sym không thấy → T001; abs sai → T001; local member sai → T005; hidden → T005; coil VAR_INPUT → T006; contact kiểu Int → T002; ADD Bool → T003; TON thiếu PT → T004; std không instance → T004; instance abs → T004; compare có outputs → S001; box fn ngoài tập → U001; FC có static → S001; CONVERT đích = kiểu OUT; PT const không type → T002; temp `__lad_*` đụng tên → T009; DB instance sai fbName → T001; diagnostics (9 mã, mỗi mã ≥ 1 test) |
| lower (10) | `packages/vendor-siemens/src/lad/lower.test.ts` | IR bảng A deep-equal; IR box F/G/H (callSys / compare / if); temp allocation + network map (chỉ số body); nested parallel; OB `Main`→1 / `OB35`→35; multi-network thứ tự; rlo sau CTUD = QU |
| golden scan (12) | `packages/runtime-iec/src/lad-golden.test.ts` | bảng A–L, `expectedFrom: 'spec'` (IR tay qua `ir-testkit` + SoftPlc — tiền lệ P1.4/P1.5) |
| pipeline (6) | `packages/vendor-siemens/src/lad/softplc-lad.test.ts` | P-L1 LAD OB series (bảng A); P-L2 LAD OB TON qua SCL DB (bảng F); P-L3 hỗn hợp SCL OB1 → LAD FB (bảng J); P-L4 LAD OB CTU+EQ (bảng G); P-L5 LAD OB math/MOVE (bảng H); P-L6 hai block LAD (OB+FB) trong một ctx, `programFromCtx` sắp xếp đúng |
| property (2) | `packages/runtime-iec/src/lad-golden.test.ts` | (1) rung series/parallel ngẫu nhiên ≡ biểu thức Bool SCL tương đương (fast-check, seed cố định; cùng inputs, so SoftPlc LAD vs SCL `IF`); (2) `pos`/`neg` ≡ R_TRIG/F_TRIG (chuỗi I0.0 ngẫu nhiên → Q/m giống hệt) |

Tổng bảng = 12+18+10+12+6+2 = **60 test mới** (sàn ≥ 8 golden §12.2 → 12; tổng ≥ 1726). Coverage: `packages/vendor-siemens/src/**` lines ≥ 85% (ngưỡng hiện có, OQ-088 — không đổi). Thứ tự triển khai đề xuất: schema → validate (operand/box) → lower (RLO/box) → diagnostics catalog → golden scan → pipeline → semantics §17 (test viết cùng từng bước).

**Mơ hồ (phân loại):** **Tier A (tự quyết):** vị trí file theo M1 §2 + dep graph (`lad/*` ở vendor-siemens); không đổi IR; temp `__lad_rlo` chung + temp nhánh; nhiều coil cùng operand → coil sau thắng; set/reset giữ nguyên khi rlo=false (spec-literal); `zod` khai báo trực tiếp ở vendor-siemens; thứ tự triển khai (schema → validate → lower → diagnostics → golden → pipeline → semantics §17); test dùng `ir-testkit` ở runtime-iec, `compileSclProgram`/`compileLad` + SoftPlc ở vendor-siemens (tiền lệ P1.4). **Tier B (mặc định + ghi OQ):** OQ-182 (X-002/S1 không chặn P1.6 — làm theo M1 §5, tiền lệ OQ-105/121/152/179); OQ-183 (`pos`/`neg` theo R_TRIG/F_TRIG: pos `rlo AND (v AND NOT m)`, m:=v; neg `rlo AND (NOT v AND m)`, m:=v; nhánh parallel tính theo thứ tự mảng, cập nhật memBit ngay — VERIFY); OQ-184 (bảng rlo sau box std; CTUD→QU là mặc định tùy ý — VERIFY); OQ-185 (box std luôn gọi, box toán/compare/MOVE chỉ khi EN — VERIFY; golden L ghim); OQ-186 (network map = chỉ số body, trả kèm ngoài IrBlock); OQ-187 (DB field không địa chỉ trực tiếp qua operand); OQ-188 (instance DB OB-level từ ctx.dbs/SCL DATA_BLOCK; instance `{sym}` = namespace DB); OQ-189 (temp `__lad_rlo`/`__lad_b…` trong interface.temp; đụng tên → LAD-T009); OQ-190 (export `fbInterfaceStruct` cho kiểu tên UDT/FB trong interface LAD); OQ-191 (`Array[lo..hi] of T` qua parser regex nhỏ); OQ-192 (FC/OB không VAR static — mirror SCL); OQ-193 (diagnostic LAD line=1, col=1, message ghi network id + chỉ số element); OQ-194 (tên key box toán/so sánh: IN1/IN2, OUT, MIN/MAX/VALUE, MN/MX/IN); OQ-195 (Const không type: number→Int, bool→Bool; PT bắt buộc `type:'Time'`); OQ-196 (`local` hỗ trợ đường dẫn `#name.member[.sub]`; `sym` là tên tag thuần, không dấu chấm). **Tier C (không có mục mới):** không mục nào chặn P1.6 — OQ-105 (X-002/S1) vẫn mở từ P1.2, không chặn (OQ-182 ghi rõ lý do); OQ-161 vẫn mở, không chặn (LAD FB dùng layout §3.5 hiện tại; nếu OQ-161 lật, bảng J đổi theo + SCR); nếu khi triển khai phát hiện §5 thiếu quy tắc mà chỉ mã thật/PLCSIM mới quyết được → ghi OQ/SCR, không tự nới lỏng. **Triển khai liên tục (chủ sản phẩm 2026-11-25 12:11 +07):** plan không có tier C → sau plan, triển khai → tự kiểm gate → PR → merge, không dừng chờ.

**Rủi ro + cách kiểm:** (1) RLO sau box / EN-gating lệch TIA (OQ-184/185) — nhất là bảng L (coil sau TON lên dù contact trước mở) và CTUD→QU: giảm thiểu — mọi lựa chọn đều có golden ghim + ghi `UNVERIFIED` ở semantics §17; xác minh bằng PLCSIM khi có (thí nghiệm M5 §10, P5.9) hoặc mẫu LAD thật (S1); nếu sai thì SCR đổi ngữ nghĩa + sửa golden (test là bằng chứng). (2) Instance DB cho LAD (OQ-188): mã LAD thật có thể khai báo DB trong chính file LAD (vd key `dbs` trong `LadBlock`) — P1.6 từ chối ồn ào (T001) thay vì đoán; nếu S1 cho thấy cần thì SCR thêm trường + golden. (3) Tên key box toán/so sánh + kiểu Const (OQ-194/195): spec không đặt tên; nếu S1 dùng tên khác (vd `IN` thay vì `IN1`) thì đổi schema + golden — giảm thiểu: tên theo TIA/intrinsic SCL, test ghim rõ. (4) OQ-161 lật: nếu IN_OUT lồng quyết slot 4 byte thì bảng J (FB DB size) đổi theo — test ghim số hiện tại, đổi kỳ vọng chỉ kèm SCR. (5) Hiệu năng: LAD không tệ hơn SCL (cùng `callSys`, cùng interpreter); mỗi network thêm 1 assign `__rlo=true` + temp — đo lại smoke 200 FB_Motor ở P1.7 (mục tiêu ≥ 1000 scan/s; P1.4/P1.5 ~520 — đã biết, không phải gate P1.6).

**Ngoài phạm vi:** interpreter riêng cho LAD; LAD editor UI (P1.7); golden runner YAML + port ví dụ §12.1 (P1.7); demo `motor-interlock` + CLI `vcs plc run` + Watch + bench M1 §12.4 (P1.7); tối ưu cấp phát `callSys` (P1.7); gọi FB/FC từ LAD (schema không có box call — nếu cần, SCR/P1.7 thêm box `call`); S7/PLCSIM/SimaticML (M5); sửa EBNF §4.2 / M1 §5; đổi `.dependency-cruiser.cjs` / `eslint.config.js` / `vitest.config.ts` / `packages/kernel` / `packages/schemas` (trừ thêm `LAD_CATALOG`) / `apps/*` / `examples/`; ADR mới; mã diagnostic ngoài 9 mã LAD (`docs/diagnostics.md` 42 → 51); `docs/facts/` mới; P0.9 PWA; script spike S1 (chạy khi có mã thật).

**Gate P1.6 (triển khai):** `lint && typecheck && depcheck && test && test:e2e && review:cheats && docs:diagnostics --check` + `build` + bench guard M0 (`pnpm bench`: TagDB 4/4 PASS + orchestrator ≥ 100 000 bước/s; rớt > 20% so với baseline thì dừng điều tra, không hạ ngưỡng) + CI (check + test ubuntu/windows + e2e ubuntu) xanh. Tổng test sau P1.6: **≥ 1726** (≥ 60 mới), trong đó golden LAD 12 (≥ 8 theo §12.2) + 2 property test fast-check (seed cố định). `pnpm-lock.yaml` thay đổi **chỉ** ở importer `vendor-siemens → zod` (diff khác rỗng là cờ đỏ, dừng kiểm tra). `pnpm install` trong VM vẫn EPERM (OQ-007) — triển khai làm ở bản sao `/tmp` như các prompt trước, cài thật `--frozen-lockfile` (dùng `git archive` để copy, không `cp -r` cả cây kèm `node_modules` — bài học ENOSPC ở P0.8), **rsync về `~/workspace/vcs` sau mỗi bước lớn, KHÔNG dùng `--delete` (hoặc luôn `--exclude .git`) — bài học mất `.git` ở P1.4**. **Cần kiểm lại khi triển khai:** root `package.json` không bị ghi đè (bài học P1.2 — kiểm `name: "vcs"` + diff vs HEAD trống trước khi commit); `user-chat/` không trong commit; golden IR JSON cũ không đổi (IR không đổi — kiểm `git status` thư mục `golden/` sạch); `docs/diagnostics.md` sinh lại bằng script (`pnpm docs:diagnostics`), không sửa tay.

**Kết quả triển khai (2026-11-25, commit feat P1.6):** ĐÃ TRIỂN KHAI đúng
phạm vi §21 — 1 commit `feat(m1): P1.6 LAD` trên nhánh `m1/p1.6-lad`.
OQ-182…196 đóng (đã áp dụng); OQ-161 vẫn mở. `docs/semantics.md` §17
mới (OQ-183/184/185 ghi UNVERIFIED). Test mới **83** (schema 15,
validate 35, lower 13, golden 14 = 12 scan + 2 property, pipeline 6),
tổng **1749/1749** (68 file) — vượt mục tiêu ≥ 1726 (≥ 60 mới). Coverage
`packages/vendor-siemens/src/**` lines **87,27% ≥ 85%** (lad/validate.ts
68,8%, lad/lower.ts 81,2% — riêng thư mục lad thấp hơn nhưng ngưỡng
tính theo glob toàn package, xem `coverage-summary.json`).

Gate đầy đủ trong bản sao sạch `/tmp/vcs-p16` (git archive + `pnpm
install --frozen-lockfile`, exit code thật từng lệnh; log
`/tmp/p16-*.log`): lint exit 0; typecheck exit 0 (cả root + apps/web);
depcheck exit 0 (118 modules, 233 deps, no violations); test exit 0
(1749/1749 — lần chạy đầu 1748/1749 do 1 test flaky môi trường, xem
dưới); test:e2e exit 0 (5/5); review:cheats SẠCH (169 file); docs:
diagnostics --check exit 0 (khớp; catalog 42 → **51** mã, 9 LAD mới);
build exit 0 (3 tasks); bench exit 0 — TagDB 4/4 PASS (set/get
~37–39M ops/s) + orchestrator ~337–357k bước/s ≥ 100 000 PASS.
`pnpm-lock.yaml` diff **chỉ +3 dòng** (importer vendor-siemens → zod
4.6.7). Root `package.json` không đổi; `golden/` sạch (IR không đổi).

Lệch so với plan §21 (đã ghi vào semantics §17 + OQ tương ứng):
1. **SR/RS tên input:** plan viết "S, R" nhưng `StdBlockDef` (single
   source of truth, P1.5) dùng SR = `S1`+`R`, RS = `S`+`R1`. Code dùng
   tên thật qua `getStdBlockDef`; bảng plan sai điểm này.
2. **Tên temp:** plan viết một `__lad_rlo` chung + `__lad_b<depth>_
   <idx>`, nhưng bảng A ghim `__lad_N1_rlo`. Code dùng temp riêng từng
   network `__lad_<id>_rlo` và `__lad_<id>_b<n>` (đếm theo thứ tự duyệt,
   parallel lồng chiếm số sau) — đọc nhất quán với bảng A. OQ-189 đã
   sửa nội dung theo.
3. **Trùng tên:** plan xếp "interface trùng tên" + "network id trùng"
   vào test schema, nhưng mã chẩn đoán là LAD-T009 → kiểm ở validate
   (T009); rung rỗng/parallel rỗng là S001 ở schema (zod `.min(1)`);
   "Array sai cú pháp" là S001 ở validate (OQ-191); "box fn lạ" là
   U001 ở validate. Test nhóm lại theo mã.
4. **Kiểu tag strict (quyết định tier B):** `{sym}` ngoài kiểu từ
   catalog còn yêu cầu kiểu tag == kiểu theo độ rộng địa chỉ (OQ-110),
   lệch → LAD-T002 (catalog mâu thuẫn với độ rộng địa chỉ là lỗi cấu
   hình; tin nó sẽ sinh abs ref sai kiểu).
5. **`BoxInput.target`:** input box std mang kiểu tham số từ def để
   lower convert không cần bảng kiểu thứ hai (bảng `stdParamType`
   hardcode đã viết rồi xóa vì vi phạm single source of truth).
6. **CONVERT box:** `mode: undefined` trước đây lẫn "không convert"
   với "convert không mode" (vd Int→Real); lower nay quyết bằng so
   sánh `input.type === out.type`, luôn sinh node convert khi kiểu
   khác.
7. **Bug thật — `parseAddress` ném:** `parseAddress` THROWS khi đầu
   vào sai, không trả undefined — các kiểm `=== undefined` trong
   validate là dead code (lint phát hiện). Đã thêm `tryParseAddress`
   bọc try/catch; `{abs}` sai hoặc địa chỉ tag sai → LAD-T001, không
   bao giờ throw. Đây là bug tiềm ẩn trong code P1.1 (mọi caller cũ
   đều truyền địa chỉ đã validate nên chưa nổ).
8. **`binary()` helper lower:** nhận kiểu kết quả làm tham số thứ 4
   tường minh (caller biết: 'Bool' cho logic/so sánh, `resultType`
   cho toán) thay vì suy từ `a.type` (eslint type-aware báo `a.type`
   là error type).
9. **Interface loop validate:** dùng mảng tường minh từng section thay
   vì index `LadInterface` bằng `Section` (Section có `'const'` mà
   LadInterface không có); member walk dùng helper `structField`
   thay vì narrowing trong vòng lặp.
10. **Ghi chú IR bảng J trong plan sai:** plan viết instance box std
    là `{k:'static', path:['sT']}` — interpreter `resolveInstance`
    chỉ nhận `local`/`dbField` (lỗi ồn ào "instance FB phải là local
    hoặc dbField"). Golden J tay dùng `local('sT')` (như SCL lower
    `#sT(...)`); lower thật vốn đã đúng (P-L3 xanh trước khi sửa J).
11. **CONVERT Int→Bool ĐƯỢC (test sai, không phải code sai):**
    `classifyIntrinsic('INT_TO_BOOL')` trả về convert hợp lệ vì
    `CONVERTIBLE_TYPES` chứa cả INT và BOOL — SCL chấp nhận
    `INT_TO_BOOL(...)` nên LAD cũng phải chấp nhận. Test đổi thành:
    Time→Int (`TIME_TO_INT` ngoài bảng) → LAD-T003; Int→Bool → không
    lỗi.
12. **Bug Array (đã sửa):** type string bắt đầu `Array[` nhưng không
    khớp regex (vd `Array[1..x] of Int`) rơi xuống "kiểu chưa biết"
    LAD-T001; nay → LAD-S001 (OQ-191).

Sự cố trong quá trình triển khai (bài học):
- Rsync đầu sang /tmp dùng trailing slash nhiều nguồn (`packages/
  scripts/...`) làm phẳng cây, 158 lỗi lint là artifact — lệnh đúng:
  `rsync -a --exclude .git --exclude node_modules --exclude user-chat
  --exclude docs/acceptance ~/workspace/vcs/ /tmp/vcs-p16/` (một nguồn
  duy nhất). Bản sao xây lại sạch bằng `git archive` + install.
- `pnpm install` chạy trước khi sync lockfile → zod chưa link, 111
  lỗi TS5012 — chạy lại install sau sync thì hết.
- Typecheck lần đầu (trên cây polluted) exit 0 là **giả**: `lad/` nằm
  ngoài `packages/` nên tsc không thấy code mới. Typecheck thật sau
  đó bắt 11 lỗi type (exactOptionalPropertyTypes: `| undefined` ở
  options + `instance` của zod; map cmp/math bị widen thành string;
  `sclTypeToIrType` trả `IrType | undefined`; helper test hẹp kiểu)
  — đã sửa hết, typecheck cuối exit 0.
- Golden A–L + property 1 fail loạt lần đầu: program tay `prog()`
  không có `organization` nên SoftPlc không chạy OB nào — đã thêm
  helper `mainProg` (organization `[{ob:1, block:'Main'}]`). Không
  phải lỗi lower.
- Full test lần 1: 1748/1749 — `sim-service.test.ts` "timeScale 'max'"
  được 91 bước (cần >100) do tải VM; chạy riêng 12/12 xanh; lần 2
  full 1749/1749. Đây là test nhạy thời gian đã biết từ P1.4, không
  phải hồi quy P1.6.
- Bench: orchestrator ~337–357k bước/s (P1.5: 511k) — thấp hơn nhưng
  vẫn PASS với biên 3,4×. SUY ĐOÁN: tải VM (cùng cửa sổ sim-service
  cũng thiếu bước); không có đường nhân quả từ P1.6 (bench không
  import lad/schemas mới; orchestrator/TagDB không đụng). Cách kiểm:
  chạy bench trên máy rảnh / so với develop cùng thời điểm.

CHƯA CHẠY: CI trên GitHub (chạy sau khi PR mở — parent mở PR qua
cloud browser, chờ CI xanh rồi merge). SUY ĐOÁN: không có.

## 22. P1.7 — Golden runner + demo motor-interlock + UI Watch + bench (plan, 2026-11-25)

**Prompt P1.7 (nguyên văn):** "Làm P1.7 theo AGENTS.md §9. Đọc: … → AMENDMENTS (A10, E6) → M1 §11–13, 14. Nhiệm vụ: golden runner (format 12.1, expectedFrom), demo examples/motor-interlock (4 kịch bản M1 §13), editor SCL tối thiểu + Watch table (qua server WS — KHÔNG Worker), benchmark M1 §12.4, docs/semantics.md (VERIFIED/UNVERIFIED), danh sách VERIFY (M1 §14) thành docs/verify-experiments-draft.md. Gate: 4 kịch bản đúng qua CLI và UI; bench ≥ 1000 scan/s (200 FB_Motor); mọi mục M1 §16."

**Tóm tắt hiểu biết (6 dòng):** (1) P1.7 là prompt "đóng gói" M1: mọi mảnh P1.1–P1.6 đã có (parser, typecheck, IR, interpreter, std, LAD) — P1.7 nối chúng thành chương trình chạy được từ file project + bằng chứng golden dạng YAML + UI tối thiểu + bench. (2) Golden runner chạy file `*.golden.yaml` (§12.1: sources + steps + expectedFrom) trên SoftPlc trực tiếp, mỗi file là 1 test case trong `pnpm test`. (3) Demo motor-interlock (§13) là 4 kịch bản A–D trên cùng FB_Motor — vừa là golden YAML, vừa là e2e CLI (`vcs golden run`) và UI (Playwright E6). (4) UI theo A10/E6: mô phỏng chạy trong server Node, web qua WS — KHÔNG Worker (§11 ghi Worker nhưng AMENDMENTS A10 thắng). (5) Bench §12.4: 200 FB_Motor × ~30 statement, ≥ 1000 scan/s; hiện trạng smoke P1.4 chỉ 519/533 scan/s — cần profile trước, tối ưu sau, không hạ ngưỡng. (6) `verify-experiments-draft.md` liệt kê mọi mục VERIFY (§14 + UNVERIFIED trong semantics) thành thí nghiệm chờ PLCSIM/S1 — P1.7 chỉ viết bản nháp, không chạy thí nghiệm (việc của chủ sản phẩm, M5/P5.9).

**Đọc:** PROMPTS P1.7 (dòng 242); M1 §11 (UI tối thiểu), §12.1–12.4 (golden format, số lượng, property, bench), §13 (demo + 4 kịch bản), §14 (14 mục VERIFY), §16 (9 tiêu chí nghiệm thu), §17 (mặc định); AMENDMENTS A10 (server Node thay Worker), E6, D2 (scanPeriodMs), D3 (introspection P1.4), D6 (diagnostic catalog), E5 (fround), E7 (examples/); STATE §19 (smoke 519/533 scan/s; OQ-151 port 56 golden; OQ-156 scanAt), §20 (OQ-174 port 34 golden; rủi ro callSys 2 Map/scan), §21 (OQ-182…196; LAD golden A–L); semantics §12–17 (18 điểm UNVERIFIED); open-questions OQ-161 (mở), OQ-105 (X-002/S1); AGENTS.md §9 (quy trình), §3 (dep graph), §11 (không sửa file sinh tay).

**Phát hiện quan trọng (quyết định thiết kế):**
1. **OB1.scl mẫu §13 hiện KHÔNG biên dịch được.** Nó dùng `"START_PB"`, `"RUN_CMD"` (tên tag trong `tags.yaml`) — typecheck P1.3 chỉ giải `"..."` thành DB/block (không thấy → SCL-T001 `tên chưa khai báo`, typecheck.ts:1434); không có chỗ nào trong `typecheck.ts`/`lower.ts`/`compile.ts` tra tag. P1.7 phải thêm giải tên tag vào compile (OQ-198): `CompileContext` nhận thêm bảng tag (từ `tags.yaml` qua `buildTagAddressMap`), `"NAME"` không phải DB/block → tra tag → lower thành abs ref; không thấy → T001. Không được "sửa demo dùng %I0.0" — §13 là spec-literal, tên symbol chính là ý nghĩa của tags.yaml.
2. **`compileProject` là mảnh còn thiếu đã được hẹn từ P1.4** (`extension.ts`: "chưa có nguồn program từ project file — việc đó là P1.7 `compileProject`"). Nó biên dịch nhiều file (SCL + LAD JSON) trong một ctx chung, trả `{program, diagnostics}`; CLI/server dùng nó để nạp `examples/motor-interlock` và để `vcs ir dump <dir>`.
3. **SoftPlc đã đủ API cho runner/UI mà không cần thêm `scanAt`** (OQ-156 → OQ-213: không thêm): `step(T, dt)` + `start/stop` + `read/write/force/unforce/listForces` + `snapshot/restore` + `getDiagnostics` (scanCount, faults). Runner lái scan qua `step()` theo quy tắc bảng E.
4. **Server chưa hề dùng `ControllerIntrospection`** (grep `sim-service/ws/routes`: 0 kết quả) và `SimulationBundle.controllers` đã có sẵn (builder.ts:69) — Watch đi qua đó, không cần API mới ở kernel.
5. **Web không được import vendor-siemens/runtime-iec** (rule `web-deps`: chỉ schemas/expr/hmi) — mọi compile/Watch đều qua server (REST/WS). Build ở web = POST lên server, không compile trong browser.

**Phạm vi:**
- Mới: golden runner (`packages/runtime-iec/src/golden/runner.ts` + test; file YAML ở `packages/runtime-iec/golden/*.golden.yaml`); `compileProject` (`packages/vendor-siemens/src/scl/compile-project.ts` + test); CLI `vcs golden run` (`apps/cli/src/commands/golden.ts`); `vcs run --scans N`; `vcs ir dump <dir>`; demo `examples/motor-interlock/` (project + tags + 3 file SCL + 4 golden YAML); server PLC wiring (`apps/server/src/plc.ts`: nạp + compile + `softPlcExtension`, dùng chung cho `serve`/`run` qua `@vcs/server`); WS `plc.*` (`protocol.ts` + `sim-service.ts` + `ws.ts`); web PLC Workspace (file tree + Monaco + Build/Save + Watch table + SimBar mở rộng scan/fault count); bench `bench/softplc.bench.ts` + baseline; `docs/verify-experiments-draft.md`; ADR-0008 (Monaco); `docs/semantics.md` §18.
- Tái dùng (không viết lại): `compileSclProgram`/`compileLad`/`programFromCtx` (ctx chung SCL+LAD); `SoftPlc` + `softPlcExtension` (P1.4, OQ-155/170); `buildTagAddressMap`/`parsePlcRef` (P1.4, OQ-137/138); `IrProgram`/`irToJson` (P1.3); `loadProject`/`nodeFS` (P0.2); `createSimulation` + `SimulationBundle.controllers` (P0.4); `SimulationService` (lệnh xếp hàng giữa lát, D4); WS protocol + `tags.delta` 10 Hz LWW (P0.5, OQ-033); SimBar/TagTable/DiagnosticsPanel (P0.6); `check-bench-regression.mjs` + `bench/baseline.json` (P0.7); fast-check seed cố định (P1.1).
- KHÔNG thuộc phạm vi: LAD editor đồ họa (§11: không bắt buộc trong M1); Worker transport (A10 thắng — KHÔNG làm); hot reload chương trình PLC khi Build (Build chỉ compile-check, OQ-208); PLCSIM/S1/thí nghiệm VERIFY (chỉ viết draft, M5/P5.9); S7/SimaticML (M5); M2 plant (P2.x); P0.9; sửa EBNF §4.2 / M1 §5/§13 (demo giữ nguyên văn, kể cả khi §13 có điểm lạ — xem bảng B–E); ADR khác ngoài 0008; `docs/facts/` mới.

**Thiết kế (8 điểm):**
1. **Golden runner — `packages/runtime-iec/src/golden/runner.ts`:** schema zod `GoldenFile {id, description?, config: {scanPeriodMs}, sources: [{file, text}], organization?, steps: [{t, set?, expect?, faults?, force?, unforce?, snapshot?, restore?}], expectedFrom}` (OQ-200: `force/unforce/snapshot/restore` là mở rộng ngoài §12.1 cho nhóm force/snapshot; `organization?` mặc định = organization của program; `set/expect` nhận ref `%M0.0`, `"DB".field`, tên tag). `loadGolden(text, fileName) → {golden, diagnostics}` (lỗi file → `GoldenError` có file+step, OQ-201 — không thêm mã catalog). `runGolden(golden) → {pass, failures[]}`: compile sources bằng `compileSclProgram`/`compileLad` trên ctx chung (LAD cần DB SCL biên dịch trước, OQ-214); `new SoftPlc(program, tagMap, {scanPeriodMs})` + `start()`; mỗi step theo quy tắc bảng E (OQ-199); `expect` so Real bằng `Object.is` sau fround hoặc `{approx, eps}`; `faults` so mã RuntimeFault trong `getDiagnostics()`; lỗi in rõ id + step + ref + mong đợi vs thực tế + nguồn IR (§12.1). Test discovery: `packages/runtime-iec/src/golden/runner.test.ts` duyệt `../golden/*.golden.yaml` (vitest `describe.each`), mỗi file = 1 test case — `pnpm test` chạy toàn bộ golden (OQ-211).
2. **`compileProject` — `packages/vendor-siemens/src/scl/compile-project.ts`:** `compileProject(files: Array<{path, text}>, opts: {tags: TagDef[]}) → {program, diagnostics}`. Discovery (OQ-202): đọc `plc/*.scl` + `plc/*.lad.json` trong thư mục project, sắp xếp theo tên file; biên dịch theo thứ tự tên tăng dần, LAD sau SCL (DB phải có trước khi LAD tham chiếu, OQ-188); file khác bỏ qua. Tag: `tags` từ catalog của `loadProject` → `buildTagAddressMap` → đưa vào ctx (OQ-198). DB numbering 1..n theo id đã sort (OQ-136, không đổi). Lỗi biên dịch → diagnostics gộp có file/line/col; compile fail → CLI/server dừng ồn ào (exit 2 / server không start), không chạy chương trình rỗng.
3. **CLI:** `vcs golden run <path>` (OQ-205): path là file `.golden.yaml` hoặc thư mục (đệ quy `*.golden.yaml`, sắp xếp); in từng file PASS/FAIL + tóm tắt; exit 0 hết xanh / 1 có fail / 2 lỗi file/CLI. `vcs run <dir> --scans N` (OQ-203): chạy orchestrator tới khi SoftPlc `scanCount` tăng N (đọc qua `bundle.controllers` + `isIntrospectable`); không có controller siemens → lỗi exit 2. `vcs ir dump <dir>` (OQ-204): dir mode = `compileProject` rồi `irToJson` (file mode cũ giữ nguyên). `vcs run`/`vcs serve` trên project có `plc/` → nạp qua `plc.ts` (điểm 4); project không có `plc/` → hành vi cũ không đổi (hello-tags).
4. **Server PLC wiring — `apps/server/src/plc.ts`:** `loadPlcExtensions(dir, model) → SimulationExtension[]`: nếu `plc/` tồn tại → đọc file → `compileProject` → `[softPlcExtension(program)]`, dùng `cfg.scanPeriodMs` từ controller def (`config.scanPeriodMs ?? simulation.plcScanMs`, D2); compile fail → throw có diagnostics (server không start). `main.ts`/`serve.ts` dùng helper này thay `SERVER_EXTENSIONS` cố định khi project có PLC; CLI `run` import helper từ `@vcs/server` (CLI đã phụ thuộc `@vcs/server`; server thêm link workspace `@vcs/vendor-siemens` + `@vcs/runtime-iec` — lockfile chỉ thêm importer). `softPlcExtension` không đổi (OQ-155: vẫn không thêm vào `SERVER_EXTENSIONS`/`CLI_EXTENSIONS` tĩnh — wiring là động theo project).
5. **Watch + editor qua server (A10/E6, KHÔNG Worker):** protocol additive, `PROTOCOL_VERSION` giữ 1 (tiền lệ P0.8). Client → server: `plc.watch {refs: string[]}`, `plc.unwatch`, `plc.write {ref, value}`, `plc.force {ref, value}`, `plc.unforce {ref}` (OQ-206). Server → client: `plc.values {simTimeMs, values: [string, TagValue][]}` — server poll `introspection.read` cho refs đang watch ở cùng nhịp 10 Hz với `tags.delta`, chỉ gửi khi đổi (LWW). `sim.state` thêm optional `plc?: {scanCount: number, faultCount: number}` (OQ-207) — SimBar hiện scan count + số RuntimeFault (§11). `plc.write` → `introspection.write` (sai kiểu → `TAG-E001` qua message `error`); `plc.force` → `introspection.force` (force thắng ghi, OQ-141; Watch hiện badge Force). Không có controller siemens → server trả message `error` với code `'PLC-NO-CONTROLLER'` (chuỗi tự do của message `error`, không đăng ký catalog — mã catalog chỉ cho diagnostic đã định nghĩa ở D6). REST: `GET /api/project` thêm `plcFiles: string[]` (additive); `POST /api/plc/build {files: [{path, text}]}` → compile-check, trả diagnostics (OQ-208: không hot reload — áp dụng chương trình mới cần restart server, ghi rõ trong UI); `POST /api/plc/files {path, text}` → Save, chỉ cho path trong `plc/` (chặn traversal, lỗi 400 nếu ra ngoài). Web: trang PLC Workspace (cây file trái từ `plcFiles`; Monaco editor SCL + marker Diagnostic từ Build; nút Build/Save; Watch table: thêm ref tay, giá trị realtime ≤ 10 Hz, cột write + checkbox Force; SimBar hiện có tái dùng + thêm scan/fault count). Monaco: xem OQ-209.
6. **Bench M1 §12.4 — `bench/softplc.bench.ts`:** chương trình bench = FB_Motor §13 × 200 instance (mỗi instance ~30 statement, 2 std call R_TRIG + TON — §12.4 mô tả "3 timer/edge" nhưng FB_Motor nguyên văn chỉ có 2; bench dùng nguyên văn, ghi rõ trong báo cáo, không bịa thêm call). Scan 10 ms sim; warm-up; 5 mẫu, lấy trung vị (tiền lệ bench orchestrator); ngưỡng **≥ 1000 scan/s, exit ≠ 0 nếu FAIL**; heap: sau warm-up chạy 2000 scan, heap tăng < 1 MB (OQ-210 — lấy bound từ test heap TagDB, không tune theo số đo). Kết quả merge vào `bench/results.json`; baseline mới `bench/baseline.json` thêm mục softplc (trung vị 5 lần, commit); `check-bench-regression.mjs` so softplc > 20% → warning (không fail, tiền lệ P0.7). `pnpm bench` chạy tagdb + orchestrator + softplc. **Profile trước, tối ưu sau:** chạy `node --cpu-prof` trên bench (hoặc timing theo pha) rồi mới sửa; ứng viên đã biết (chưa chứng minh — đo rồi mới chọn): (a) `callSys` cấp phát 2 Map/call/scan (600 cặp Map/scan — §20 rủi ro 3); (b) Frame/Ref cấp phát mỗi lần gọi FB (§19 smoke SUY ĐOÁN); (c) `viewFieldRef` mỗi lần truy cập field. Ràng buộc: không đổi ngữ nghĩa (toàn bộ golden + test cũ phải xanh); không cấp phát mới ở đường nóng sau tối ưu.
7. **`docs/verify-experiments-draft.md` (OQ-212):** bảng mỗi mục VERIFY: ID (V-01… từ M1 §14 mục 1–14 + UNVERIFIED trong semantics §12/§14/§15/§16/§17), câu hỏi, cách kiểm (project TIA S7-1500 + PLCSIM Advanced, hoặc mẫu S1), golden liên quan + `expectedFrom` hiện tại (`spec`) → đổi thành `plcsim` khi có kết quả, trạng thái (chưa làm). Không chạy thí nghiệm nào trong P1.7; không đổi `expectedFrom` của golden.
8. **`docs/semantics.md` §18 (mới):** golden runner + compileProject + Watch + bench — quy tắc nào VERIFIED (runner stepping, tag resolution, demo A–D qua test) / UNVERIFIED (ngữ nghĩa timer/counter/layout đã ghi từ §15–17 giữ nguyên — P1.7 không xác minh thêm cái nào, chỉ liệt kê lại + trỏ draft).

**Golden tính tay (bảng A–H; nguồn §12.1/§13 đã verify bằng tay — không sao chép số từ implementation):**
- **Bảng A — §12.1 `ton_basic_3s` (mẫu format, chu kỳ 100 ms):** IN lên t=200 → ET=0 tại t=200; t=300 ET=100; t=3100 ET=2900; t=3200 ET=3000, Q=true; t=3300 IN=false → ET=0, Q=false. (TON timestamp: ET = now − lúc IN lên; xem bảng E.)
- **Bảng B — Demo kịch bản A (chạy bình thường rồi trip overload, reset; scan 100 ms; đầu STOP_OK=OVL_OK=PERM=1):** t=0 RUN=0 FAULT=0; t=100 START=1 → RUN=1; t=200 START=0 → RUN=1; t=300 RUN_FB=1 → RUN=1, ET=0; t=400 OVL=0 → RUN=0 FAULT=1; t=500 OVL=1 → RUN=0 FAULT=1 (chốt); t=600 RESET=1 → FAULT=0 RUN=0; t=700 RESET=0 START=1 → RUN=1. Đã tính tay từng scan theo code FB_Motor (§13): tại t=400 `sSeal AND NOT OVL` set qFault trước khi `qFault` clear seal; tại t=600 `iReset AND iOverloadOk` clear fault trước khi seal-set (edge Q=0 nên không seal lại).
- **Bảng C — Kịch bản B (mất feedback, RUN_FB luôn 0):** t=100 START=1 → RUN=1; t=200 START=0 → RUN=1 (timer bắt đầu: ET=0 tại scan 200 vì seal mới lên ở scan 100, timer call ở scan 100 thấy seal=0); t=3100 → RUN=1, ET=2900; t=3200 → RUN=0 FAULT=1 (ET=3000 → Q → qFault → seal=0); t=3300 → RUN=0 FAULT=1, ET=0. Khớp §13 (ET=2900 tại 3100 chứng tỏ TON tính từ lúc IN lên, không phải cộng dồn từ scan đầu).
- **Bảng D — Kịch bản C/D (permissive):** C: PERM=0 khi đang chạy → RUN=0, FAULT=0 (không set qFault — chỉ clear seal); PERM=1 lại → vẫn RUN=0 (cần cạnh START mới — `sStartEdge.Q` đã qua). D: START khi PERM=0 → không chạy (điều kiện seal đòi `iPermissive`).
- **Bảng E — Quy tắc step của runner (chứng minh từ `SoftPlc.step`, softplc.ts:410–448):** lưới scan đều: lần `step()` đầu rebase `lastScanTimeMs = simTimeMs`; mỗi scan tại `lastScanTime + k·period`. Runner: với các step YAML theo thời gian tăng dần t₀<t₁<…: gọi `step(tᵢ₋₁, tᵢ − tᵢ₋₁)` (step đầu `step(t₀, 0)` = no-op, chỉ kiểm trạng thái đầu). Kiểm chứng với bảng A: t₀=0 → no-op; t=100 → rebase 0, scan tại 100; t=200 → scan tại 200 (ET=0); t=300 → ET=100; gap 300→3100 → 28 scan tại 400…3100 (ET=2900) ✓. Hệ quả: gap `(tᵢ − tᵢ₋₁)` phải chia hết cho `scanPeriodMs`, không thì `GoldenError` (OQ-199); `t` giảm → `GoldenError`.
- **Bảng F — Bench baseline (số đo thật P1.4, STATE §19):** 200 FB latch × 2000 scan: 519 scan/s (3,86 s) và 533 scan/s (3,75 s); ~1,9 ms/scan, ~9,6 µs/FB call. Mục tiêu ≥ 1000 scan/s ⇒ cần nhanh ≥ 1,9× (≤ 1,0 ms/scan, ≤ 5,0 µs/FB). Chương trình bench P1.7 nặng hơn smoke P1.4 (FB_Motor §13 đầy đủ thay cho FB latch) nên số đo P1.7 không so trực tiếp với 519/533 — baseline mới đo ở P1.7, ngưỡng giữ 1000.
- **Bảng G — Tồn kho golden TS hiện có (nguồn port sang YAML):** P1.4: interpreter 22 + softplc 33 + softplc-scan 57 + softplc-snapshot 20 (+ arithmetic 17 cases §19) — nhóm §12.2 của P1.4 = 56 golden (OQ-151); P1.5: golden scan 37 (bảng A–P, §20) — nhóm §12.2 của P1.5 = 34 (OQ-174); P1.6: golden scan 12 (bảng A–L, §21) — nhóm LAD §12.2 = 8. Port không sao chép số từ implementation: giá trị kỳ vọng lấy từ bảng tính tay trong STATE §19/§20/§21 (đã verify ở các prompt đó); runner chạy YAML là kiểm độc lập lần nữa — YAML nào đỏ thì lỗi ở khâu port hoặc ở code cũ (báo, không sửa kỳ vọng).
- **Bảng H — Tồn kho YAML đích (§12.2 + demo, OQ-211):**

  | Nhóm (§12.2) | YAML | Nguồn |
  |---|---|---|
  | Bit logic / contact / coil / set / reset | 8 | Mới tính tay (P1.7) — P1.4 không có bảng golden riêng cho nhóm này |
  | R_TRIG / F_TRIG / SR / RS | 8 | Port P1.5 (bảng edge/bistable) |
  | Timer TON/TOF/TP/TONR (PT=0, IN dao động, không gọi vài scan) | 14 | Port P1.5 (bảng timer) |
  | Counter CTU/CTD/CTUD (R/LD ưu tiên, biên max/min) | 10 | Port P1.5 (bảng counter) |
  | Toán/so sánh/convert/làm tròn/tràn số/chia 0 | 14 | Port P1.4 (bảng số học §19, 17 cases → chọn 14) + mới cho convert |
  | Điều khiển luồng (IF/CASE/FOR/WHILE/REPEAT/EXIT/CONTINUE/RETURN, giới hạn vòng lặp) | 8 | Port P1.4 (interpreter tests) |
  | Gọi block: FC trả giá trị, FB + instance DB, multi-instance, IN_OUT, TEMP | 8 | Port P1.4 (softplc tests) |
  | Bộ nhớ & địa chỉ: chồng lấn %MW/%MB, big-endian, bit trong DB, layout struct | 8 | Port P1.1 (bảng A–C) + P1.4 (memory tests) |
  | Scan: process image I/Q, OB100 1 lần, cyclic OB, STOP/RUN/reset | 6 | Port P1.4 (softplc-scan tests) |
  | Force/snapshot/restore | 4 | Port P1.4 (softplc-snapshot tests) — cần key `force/snapshot/restore` (OQ-200) |
  | LAD (series/parallel/box/negated coil/edge) | 8 | Port P1.6 (bảng A–L → chọn 8) |
  | E2E demo motor-interlock | 4 | Bảng B–E (§13) |
  | **Tổng** | **100** | Vượt sàn §16.2 (≥ 80); runner assert ≥ 80 + đủ minima từng nhóm |

**Dependencies mới:**
- `packages/runtime-iec`: thêm dep trực tiếp **`yaml@2.9.1`** (đã có trong cây qua `@vcs/schemas`; phát hành 2024, thỏa ≥ 14 ngày) + **`zod@4.6.7`** (đã có trong cây qua schemas/vendor-siemens). Lockfile chỉ thêm 2 importer (tiền lệ P1.1/P1.6). Không dep mới nào khác cho runner.
- `apps/web`: **`monaco-editor`** (phiên bản ghim ở triển khai, kiểm ngày phát hành ≥ 14 ngày bằng `npm view` trước khi thêm — như P1.6 đã làm với zod; nếu bản mới nhất < 14 ngày thì lấy bản trước đó đủ tuổi). Dep lớn → **ADR-0008** (AGENTS §5). Nạp worker qua Vite `?worker` (không thêm plugin monaco vite). Nếu build Vite gặp vấn đề với worker → dừng, báo (không tự đổi sang textarea — đó là đổi spec §11).
- `apps/server`: thêm link workspace `@vcs/vendor-siemens` + `@vcs/runtime-iec` (chỉ importer, lockfile). CLI đã có vendor-siemens; `vcs golden` import runner — ưu tiên import qua `@vcs/vendor-siemens` re-export để khỏi thêm link cho CLI; nếu re-export làm mờ ranh giới thì thêm link `@vcs/runtime-iec` trực tiếp cho CLI + ghi rõ trong triển khai.
- Không dep mới cho bench (dùng `node --cpu-prof` có sẵn).

**Test target (≥ 163 mới, tổng ≥ 1912):**

| Nhóm | File | Số lượng |
|---|---|---|
| YAML golden (100) | `packages/runtime-iec/golden/*.golden.yaml` (chạy qua runner.test.ts) | 100 (bảng H; mỗi file = 1 test case) |
| runner unit (20) | `packages/runtime-iec/src/golden/runner.test.ts` | schema lỗi (thiếu field, expectedFrom sai); stepping rule (gap không chia hết, t giảm); approx Real; faults; force/snapshot/restore; lỗi compile (SCL-T001 + vị trí); LAD source; `set` tên tag vs abs vs DB field |
| compileProject (12) | `packages/vendor-siemens/src/scl/compile-project.test.ts` | discovery (sắp xếp, bỏ file lạ); tag `"NAME"` → abs (OQ-198) + T001 khi không thấy; multi-file FB+OB+DB; LAD sau SCL; lỗi gộp nhiều file; dir rỗng; DB numbering 1..n |
| CLI (10) | `apps/cli/src/commands/golden.test.ts` (+ `run.test.ts`, `ir.test.ts`) | golden run pass/fail/exit 0/1/2; `--scans` đúng N scan; `--scans` không có PLC → exit 2; `ir dump <dir>`; `run examples/motor-interlock` in cuối RUN_CMD (spawn thật, tiền lệ run.test.ts) |
| server WS (8) | `apps/server/src/ws.test.ts` + `sim-service.test.ts` | plc.watch → plc.values đổi mới gửi; plc.write sai kiểu → error TAG-E001; plc.force/unforce + listForces; watch ref sai → error; không có PLC → error; sim.state có `plc.scanCount` |
| web unit (10) | `apps/web/src/store.test.ts` + `ws-client.test.ts` + `sclLanguage.test.ts` | apply plc.values (LWW); gửi plc.watch/write/force; Monarch SCL: keyword/comment/string/number đăng ký đúng (không render component — tiền lệ P0.6) |
| property (2) | `packages/runtime-iec/src/golden/property.test.ts` | timer §12.3 (Q TON ⇔ IN liên tục ≥ PT); counter §12.3 (CV không vượt biên) — fast-check, seed cố định |
| e2e (1) | `apps/web/e2e/e6.spec.ts` | E6: motor-interlock qua UI — serve demo, START qua Watch write, RUN_CMD=1; OVL=0 → FAULT=1; RESET → FAULT=0 (kịch bản A rút gọn) |

Tổng bảng = 100+20+12+10+8+10+2+1 = **163 test mới** (tổng ≥ 1912). Coverage: giữ ngưỡng hiện có (runtime-iec/vendor-siemens ≥ 85% lines; web không có ngưỡng coverage — tiền lệ P0.6). Thứ tự triển khai đề xuất: compileProject (tag resolution) → demo project + golden A–D → runner + YAML port theo nhóm → CLI golden/run/ir → bench profile + tối ưu → server plc.* + web Watch/editor → verify-experiments-draft + semantics §18 (test viết cùng từng bước).

**Mơ hồ (phân loại):** **Tier A (tự quyết):** vị trí file theo M1 §2 + dep graph (runner ở runtime-iec; compileProject ở vendor-siemens; plc.ts ở server; web chỉ qua REST/WS); `GoldenError` thay vì mã catalog mới; thứ tự triển khai trên; demo giữ nguyên văn §13 (kể cả tên tag `"..."`); bench dùng FB_Motor §13 nguyên văn (2 std call/instance, ghi rõ không đủ 3 như §12.4 mô tả); `pnpm bench` chạy 3 bench. **Tier B (mặc định + ghi OQ):** OQ-197 (X-002/S1 không chặn P1.7 — làm theo M1 §11–13, tiền lệ OQ-105/121/152/179/182); OQ-198 (tag `"NAME"` → abs qua ctx tags; không thấy → T001); OQ-199 (quy tắc step bảng E; gap không chia hết → GoldenError); OQ-200 (key YAML mở rộng force/snapshot/restore; approx Real; faults; organization? mặc định = program); OQ-201 (lỗi runner = GoldenError; exit 0/1/2); OQ-202 (discovery `plc/*.scl` + `plc/*.lad.json`, tên tăng dần, LAD sau SCL); OQ-203 (`--scans N` đếm scanCount SoftPlc); OQ-204 (`ir dump <dir>` = compileProject); OQ-205 (`vcs golden run` file/thư mục); OQ-206 (WS `plc.*`, 10 Hz LWW, controller đầu tiên introspectable); OQ-207 (`sim.state.plc?` additive); OQ-208 (Build compile-check, không hot reload; Save chỉ trong `plc/`); OQ-209 (Monaco + ADR-0008 + Monarch tối thiểu); OQ-210 (heap bench < 1 MB/2000 scan; profile trước); OQ-211 (100 YAML; assert ≥ 80 + minima nhóm); OQ-212 (draft VERIFY, không chạy thí nghiệm); OQ-213 (không thêm `scanAt` — OQ-156 quyết xong); OQ-214 (LAD YAML cần DB SCL trước); OQ-215 (layout demo: stepMs/plcScanMs 100, controller `builtin/siemens`); OQ-216 (Watch write/force qua introspection; sai kiểu → TAG-E001; force có badge). **Tier C (không có mục mới):** không mục nào chặn P1.7 — OQ-105 (X-002/S1) vẫn mở từ P1.2, không chặn (OQ-197 ghi rõ lý do); OQ-161 vẫn mở, không chặn (demo dùng layout §3.5 hiện tại; nếu OQ-161 lật, bảng P + golden layout đổi theo + SCR); nếu khi triển khai phát hiện §11–13 thiếu quy tắc mà chỉ mã thật/PLCSIM mới quyết được → ghi OQ/SCR, không tự nới lỏng. **Triển khai liên tục (chủ sản phẩm 2026-11-25 12:11 +07):** plan không có tier C → sau plan, triển khai → tự kiểm gate → PR → merge, không dừng chờ.

**Rủi ro + cách kiểm:** (1) **Bench không đạt 1000 scan/s sau tối ưu** — rủi ro lớn nhất P1.7: smoke P1.4 chỉ ~520; nếu profile cho thấy cổ chai là kiến trúc interpreter (không phải cấp phát) thì tối ưu có thể chạm ngữ nghĩa. Giảm thiểu: profile trước (OQ-210), tối ưu từng bước nhỏ có đo lại sau mỗi bước, giữ toàn bộ golden xanh; nếu 3 lần tối ưu không đạt → dừng theo AGENTS §9 (gate hỏng 3 lần), báo nguyên nhân + đề xuất thu hẹp (vd bench với FB latch thay FB_Motor đầy đủ — nhưng đó là đổi §12.4, cần chủ sản phẩm quyết, tier C). Không hạ ngưỡng 1000. (2) **Tag `"NAME"` làm đổi hành vi typecheck cũ** — `"NAME"` trước đây luôn T001; nay tag hợp lệ → lower thành abs. Giảm thiểu: thứ tự giải — DB/block trước, tag sau (tag không được che tên DB/block); test hồi quy: `"..."` không phải tag vẫn T001; golden IR JSON cũ không đổi (kiểm bằng diff). (3) **Monaco build rắc rối trên Vite/Windows** — worker + CSS + bundle lớn. Giảm thiểu: ADR-0008 ghi rõ cách nạp; kiểm build + e2e trên CI windows (job test windows chạy build? — CI `check` chạy build? nếu CI không build web thì e2e ubuntu là bằng chứng; ghi rõ trong triển khai). Nếu Monaco chặn build → dừng, báo (không tự thay editor). (4) **YAML port sai lệch TS golden** — 100 file viết tay, lỗi đánh máy cho số kỳ vọng sai. Giảm thiểu: port theo bảng tính tay STATE (không sao chép từ code), runner là kiểm độc lập; file nào đỏ thì tra bảng gốc trước khi nghi code. (5) **OQ-161 lật** — golden layout/memory đổi theo; test ghim số hiện tại, đổi kỳ vọng chỉ kèm SCR (tiền lệ P1.5/P1.6). (6) **Watch realtime qua WS chậm/lệch** — poll 10 Hz + LWW; nếu SimBar scan count và Watch lệch nhau do nhịp khác nhau → ghi chú trong UI (Watch ≤ 10 Hz theo spec §11, không cam kết từng scan).

**Kết quả (triển khai 2026-11-25, commit `feat(m1): P1.7 golden runner + demo + Watch + bench`):**

- **Test mới: 178, tổng 1927/1927** (1749 + 178 — gate đầy đủ đếm thật,
  hơn đếm tay 1):
  YAML 101 (97 `packages/runtime-iec/golden/` + 4 demo) + runner unit 22 +
  compileProject 12 + property 2 (TON/CTUD, fast-check seed 20261125) +
  server PLC 10 (`apps/server/src/plc.test.ts`) + CLI 15 (golden 6 + run-plc 6
  + ir-dir 3) + web unit 13 (store 6 + ws-client 2 + plc-helpers 5) + e2e E6 1
  + hồi quy interpreter 1 (TEMP/instance độc lập — xem dưới).
- **Gate đầy đủ (bản sao sạch `/tmp/vcs-p17v`, `git archive ad4e625` +
  `pnpm install --frozen-lockfile` exit 0; log `/tmp/p17-gate-*.log`):**
  lint **0**, typecheck **0**, depcheck **0** (121 module), test
  **1927/1927 (76 file)**, test:e2e **6/6** (E1–E6, 20.8 s),
  review:cheats **SẠCH** (186 file), diagnostics --check **khớp** (51 mã),
  build **OK** (3 task), bench **exit 0**: TagDB set/get 42,502,739 ops/s
  PASS + flush 0.14 µs PASS + heap −0.05 MB PASS; orchestrator 331,091
  steps/s PASS; **softplc 1730 scan/s PASS** (ngưỡng ≥ 1000) + heap +0.22 MB
  PASS. Gate đỏ 2 lần trong quá trình chạy (lint 11 lỗi + typecheck 2 lỗi
  ở code mới; depcheck 132 lỗi giả do quét `dist/` — xem lệch 16, 17),
  sửa đúng gốc rồi amend, gate cuối xanh toàn bộ.
- **OQ-197…216 đóng (đã áp dụng); OQ-217 mới (tier B, đã áp dụng, xem
  open-questions.md); OQ-161 vẫn mở.**
- **ADR-0008** (Monaco 0.57.0); `docs/semantics.md` §18 mới;
  `docs/verify-experiments-draft.md` mới (M1 §14 mục 1–14 + 13 mục ngoài,
  CHƯA chạy thí nghiệm nào).

**Lệch so với plan §22 (ghi rõ, không sửa plan ngược):**

1. **Demo DB đổi tên:** `plc/db.scl` → `plc/FB_Motor_DB.scl`. Cả hai kiểu
   sort đều biên dịch sai với `db.scl` (case-sensitive: OB1 trước db →
   T001 `FB_Motor_DB`; case-insensitive: db trước FB → T001 `FB_Motor`).
   Sort là case-insensitive (OQ-202 bổ sung).
2. **Bug thật P1.3 — cross-file DB instance:** `TypecheckResult.dbs` chỉ có
   DB file hiện tại; `lower.ts` tra `checked.dbs` → gọi instance DB ở file
   khác ném `lower: không tìm được FC ...` dù typecheck chấp nhận. Sửa:
   `dbs: new Map([...ctx.dbs, ...this.dbs])` (file hiện tại thắng khi trùng
   tên). Chưa từng nổ vì P1.4 đặt FB+DB+OB trong một file. Demo 3 file là
   hồi quy. FC cross-file đã probe: đúng cả hai vị trí (statement/expression).
3. **Bug thật — SoftPlc không bao giờ start qua server/CLI:** `SoftPlc`
   khởi tạo STOP; chỉ golden runner gọi `start()`. Sửa:
   `startPlcControllers(bundle)` trong `apps/server/src/plc.ts`, gọi ở
   `SimulationService.run()`/`step()` + CLI `runCommand`. Hồi quy:
   `plc.test.ts` "sim.command run → scanCount ≥ 2".
4. **Bug thật (E6 phát hiện) — Build status trống khi build sạch:**
   `PlcWorkspace` hiện status theo `diagnostics.length === 0 → ''` nên
   build thành công không diagnostic thì không hiện gì. Sửa: theo
   `plcFiles.length === 0 → ''` (chưa build), có file + không lỗi →
   "Build OK".
5. **E6 phải Force input (OQ-141), không Write:** write `%I` chỉ tới lần
   latch kế (scan latch %I từ IoBus/TagDB rồi mới áp force). Test cũ chỉ ghi
   START_PB=true (thiếu STOP_OK/OVL_OK/PERM) và ghi khi đang chạy → RUN_CMD
   không bao giờ lên. Sửa E6: Watch 5 ref → ghi true khi IDLE → poll true
   → Force từng cái → Run → RUN_CMD TRUE → Reset → FALSE, scan 0. Nút Force
   force giá trị đang hiển thị. `afterAll` kill cả process group (pnpm
   spawn để lại server chiếm 4171).
6. **101 YAML thay vì 100:** bitlogic 9 (plan 8) + arith 14 (plan 14, đã
   đúng) — inventory test assert tổng ≥ 100 + minima nhóm nên 101 vẫn đạt.
7. **Property test ở `packages/vendor-siemens/src/golden/property.test.ts`**
   (plan ghi nhầm `packages/runtime-iec/src/golden/property.test.ts`).
8. **Không có `sclLanguage.test.ts`** (plan liệt kê trong web unit):
   Monarch đăng ký chưa có test unit; e2e E6 (editor hiện + Build OK) là
   bằng chứng. Web unit thực tế 13 (store 6 + ws-client 2 + helpers 5).
9. **Server WS test ở `apps/server/src/plc.test.ts` (10 test)** thay vì
   `ws.test.ts` + `sim-service.test.ts` như plan ghi (8 test).
10. **CLI 15 test thay vì 10** (golden 6 + run-plc 6 + ir-dir 3).
11. **Thêm ngoài plan (nhỏ, có lý do):** `GET /api/plc/files?path=` (editor
    cần ĐỌC file; 404 khi thiếu, 400 khi thoát `plc/`); OQ-217 fail-fast
    PLC (tier B, quyết lúc triển khai).
12. **Root `package.json` suýt ghi đè** (lệnh `cp` nhiều nguồn vào thư mục
    — xem AGENTS.md bài học): phát hiện qua `git status`, khôi phục bằng
    `git checkout -- package.json`; thay đổi hợp lệ duy nhất là 1 dòng
    script `bench`.
13. **`compilePlcDir` thiếu export** ở `apps/server/src/index.ts` (2 test
    ir-dir lỗi `TypeError: compilePlcDir is not a function`): thêm export.
14. **Monaco worker:** `monaco-editor/esm/vs/editor/editor.worker?worker`
    không resolve dưới Vite 8/Rolldown; đúng là
    `monaco-editor/editor/editor.worker.js?worker`. Monaco ghim **0.57.0**
    (2026-09-24, ≥ 14 ngày); 0.58.0 ra 2026-11-23 mới 2 ngày — loại.
15. **Deps:** lockfile +46 dòng vs plan commit (runtime-iec yaml+zod +6;
    server + CLI workspace links +9; web monaco-editor 0.57.0 +31). Chỉ
    importer, không đổi version ngoài.
16. **Gate tìm ra: depcheck quét `apps/web/dist/`** — config chỉ loại trừ
    `node_modules`/test, không loại `dist/`; chunk Monaco có circular
    import nội bộ do bundler sinh → 132 lỗi giả, depcheck exit 26 (lần
    chạy đầu trước khi build thì exit 0 nên không lộ). Sửa đúng gốc:
    `.dependency-cruiser.cjs` thêm `/dist/` vào `exclude` (build output
    không phải source; không nới lỏng rule nào cho source). Sau sửa:
    depcheck exit 0 với `dist/` còn nguyên, 121 module.
17. **Gate tìm ra: 11 lỗi lint + 2 lỗi typecheck ở code mới P1.7**
    (nửa đầu chỉ chạy vitest nên không lộ): `runUntilScans`/`main`
    async không await → sync; 2 arrow trả void shorthand → thêm `{}`;
    `as unknown` thừa; template literal với số → `String(...)`;
    `afterAll` async không await; disable comment cho rule
    `react-hooks/exhaustive-deps` không tồn tại trong config → xóa
    (AGENTS §5 cấm eslint-disable); `fmt` dùng `??` thừa +
    `expected !== null` thừa; property test thiếu `id` trong
    `SoftPlcConfig`. Sửa code, không sửa kỳ vọng; amend vào commit.

**Bench — tối ưu interpreter (profile trước, từng bước có đo, golden xanh
sau mỗi bước; baseline 127 scan/s, heap PASS):**

| Bước | Thay đổi | Kết quả |
|---|---|---|
| A | Index DB theo tên (`#dbsByName`) thay quét tuyến tính `program.dbs` mỗi lần gọi FB | 127 → 127 (0× — quét DB không phải cổ chai; giữ lại) |
| B | Fast path `callFb` (instance dbField + mọi arg scalar + không IN_OUT): resolve view/offset/field một lần lúc compile, ghi/đọc trực tiếp `writeMemValue`/`readMemValue` | 127 → 618 (4.9×) |
| C | `createFrame` dùng chung Map rỗng cho section không có biến (mọi ghi frame map đều qua `byName`; vòng reset mặc định vẫn chạy khi section có biến) | 618 → 760 (1.23×) |
| E | `viewFieldRef` tính trước offset + field lá lúc compile (canonical layout: fields DB đầu tiên mỗi FB; constructor kiểm chứng mọi DB cùng FB cùng layout, lệch → slow path) | 760 → **1652–1660 (2.17×) — PASS** |

- Tổng **127 → ~1660 scan/s (13×)**, ngưỡng ≥ 1000 đạt với biên ~66%;
  heap +0.17–0.19 MB/2000 scan PASS. "set TextDecoder" 21.6% trong profile
  tsx là artifact của tsx (không có `TextDecoder` trong code; profile CLI
  dist không thấy) — không truy tiếp vì bench A/B đã cho đáp án.
- **Không làm Opt D** (callSys tái dùng Map theo site): không cần vì đã vượt
  ngưỡng; ghi làm cơ hội sau (ước ~800 Map/scan).
- **Test hồi quy mới** (`softplc.test.ts`, +1): hai instance cùng FB độc
  lập + TEMP về 0 ở đầu mỗi lần gọi. Kiểm chứng bằng mutation: bỏ vòng
  reset frame → test đỏ (`[0,5]` thay vì `[0,0]`) — test thực sự ghim bất
  biến, không phải test trang trí. Lưu ý tính tay: `#qCnt` gán TRƯỚC khi
  `#sCnt` tăng nên trễ 1 scan (`[0,0],[0,0],[1,0],[2,0],[2,1]`).
- **Rủi ro còn lại:** bench đo trên VM share 1.5 CPU — số tuyệt đối dao động
  theo tải (1652 vs 1660 giữa 2 lần chạy); biên 66% đủ lớn. CI bench job
  là manual/nightly (skipped ở PR) nên gate bench là local.

## 23. P0.9 — PWA shell + ADR HTTPS cho LAN (plan, 2026-11-25)

**Prompt P0.9 (nguyên văn):** "Làm P0.9 theo AGENTS.md §9. Đọc: … → docs/skills/SKILL-ui-pwa-hmi.md §9 (PWA) + M0 §8.2–8.3. Nhiệm vụ: PWA tối thiểu cho apps/web: manifest, service worker (precache tài nguyên tĩnh; KHÔNG cache /api và WebSocket), trang offline, thông báo bản cập nhật, chế độ kiosk (?kiosk=1, Fullscreen, Wake Lock có kiểm tính khả dụng). Ghi ADR về HTTPS cho truy cập LAN (service worker chỉ chạy trên HTTPS/localhost) — đề xuất phương án (mkcert/reverse proxy) vào OWNER-INBOX mục D, KHÔNG tự đổi bind mặc định. Gate: Playwright: manifest hợp lệ, service worker đăng ký trên localhost, offline fallback hiện khi server tắt, /api không bị cache."

**Tóm tắt hiểu biết (7 dòng):** (1) P0.9 là prompt tùy chọn ngoài M0–M5 (skill UI §9): PWA tối thiểu cho `apps/web` — cài đặt như ứng dụng, kiosk cho tablet witness, trang offline — nhưng **không** phải chạy mô phỏng offline (mô phỏng chạy trên server Node, A10/E6). (2) Hiện trạng web: React 19 + Vite 8.3.7 + Tailwind 4 + Monaco 0.57.0, **chưa có** manifest/SW/kiosk (grep `kiosk|serviceWorker|manifest` trong `apps/web/src` + `apps/server/src`: 0 kết quả); `index.html` chỉ có viewport + title. (3) Server phục vụ `apps/web/dist` qua `@fastify/static` (prefix `/`, không header cache riêng, **không** SPA fallback — OQ-057) — SW/manifest/offline.html nằm trong dist là phục vụ được, nhưng cần header `no-cache` riêng cho `sw.js` + manifest (OQ-223). (4) SW chỉ sống trên secure context: `localhost` OK, `http://192.168.x.x` KHÔNG — quyết HTTPS cho LAN là việc của owner (D-007), P0.9 chỉ viết ADR đề xuất, không đổi bind, không thêm TLS vào server. (5) Cập nhật: banner "Có bản mới — tải lại", **không** tự reload giữa lúc đang chạy/chỉnh sửa (skill §9). (6) Kiosk `?kiosk=1`: Fullscreen cần user gesture, Wake Lock xin lại khi tab hiện lại, chặn pull-to-refresh/zoom ngoài ý muốn. (7) Gate P0.9 = Playwright E7 (manifest, SW đăng ký, offline fallback, /api không cache) + full gate hiện có giữ xanh.

**Đọc:** PROMPTS P0.9 (dòng 192); skill UI §9 (toàn bộ) + §10 (lỗi hay gặp: "cache nhầm `/api`", "PWA trên HTTP LAN không chạy") + §11 checklist PWA; M0 §8.2 (server: bind 127.0.0.1, `--host 0.0.0.0` in cảnh báo; static `@fastify/static` fallback `index.html`) + §8.3 (web: khung, Sim bar, Tags, Zustand, WS tự nối lại, i18n vi/en, a11y); AMENDMENTS A10/E6 (server Node, không Worker), D6 (mã diagnostic — P0.9 không thêm mã mới), D8 (file sinh tay); STATE §13 (P0.6: web unit test pure logic node, không jsdom; e2e workers: 1, webServer `vcs serve examples/hello-tags` port 4170) + §22 (P1.7: Monaco worker qua `?worker`; depcheck loại `/dist/`); `apps/web/vite.config.ts` (proxy /api + /ws → 127.0.0.1:4170, build ra dist); `apps/server/src/server.ts:112` (fastifyStatic, không setHeaders); `apps/web/src/App.tsx` (`wsUrl()` đã chọn `wss:` khi `https:` — WSS không cần sửa code khi lên HTTPS); `apps/web/src/main.tsx` (StrictMode — đăng ký SW phải idempotent); OWNER-INBOX D-005 (đã quyết B: làm P0.9 ngay; ADR đề xuất phương án, không đổi bind).

**Phát hiện quan trọng (quyết định thiết kế):**
1. **Plugin: `vite-plugin-pwa@2.0.0` (generateSW, Workbox 7.4.1)** — đã kiểm bằng `npm view`: bản 2.0.0 phát hành **2026-10-03** (53 ngày tuổi, thỏa quy tắc ≥ 14 ngày); peer `vite ^3–^8` khớp Vite 8.3.7; là **devDependency build-time** (SW sinh ra ở `vite build`, không phải runtime dep của app) nên không cần ADR riêng cho plugin (tiền lệ P0.5 tsup; khác P1.7 Monaco là dep runtime lớn → ADR-0008). Ghim chính xác `2.0.0`, lockfile. Phương án SW viết tay bị loại: phải tự sinh precache manifest theo hash build + tự quản lifecycle — đúng việc plugin đã làm, viết tay là phát minh lại Workbox.
2. **Navigation fallback = trang offline riêng, không fallback về shell đã cache (OQ-219).** Shell không server là app nửa chết (tags rỗng, nút sim chết, WS reconnect chạy vô ích); `offline.html` nói rõ "không kết nối được server" + nút "Thử lại" mới là trạng thái thật. Workbox: navigation `NetworkFirst` → fallback `createHandlerBoundToURL('/offline.html')`.
3. **`/api` và `/ws` không bao giờ qua cache (OQ-220).** Workbox chỉ cache GET theo rule mình khai; runtimeCaching = `networkOnly` cho `/api/*`; `/ws` là upgrade WebSocket, không phải fetch event nên SW không chạm được — ghi rõ trong semantics để không ai "sửa" sau này. POST/PUT không cache (Workbox mặc định GET-only).
4. **Server phải set header cho `sw.js` + manifest (OQ-223).** `@fastify/static` mặc định không set `Cache-Control`; SW/manifest bị HTTP cache giữ sẽ làm cập nhật chậm/mất. Sửa nhỏ ở `server.ts` (`setHeaders` khi path là `/sw.js` hoặc `/manifest.webmanifest` → `no-cache`); asset khác giữ mặc định. Đây là thay đổi server duy nhất của P0.9.
5. **Icon không cần dep mới (OQ-224).** Nguồn SVG vẽ tay `apps/web/public/icons/icon.svg`; PNG 192/512 + maskable 512 + apple-touch-icon 180 sinh bằng script `scripts/gen-pwa-icons.mjs` dùng Playwright chromium screenshot (`@playwright/test` đã có ở root, không thêm dep); PNG commit vào repo, script ghi cách sinh lại.
6. **Kiosk là lớp phủ UI, không phải trang riêng.** `?kiosk=1` đọc ở `main.tsx` → store slice `pwa.kiosk`; App ẩn header controls + tab PLC Workspace (chỉ xem Tags + Sim bar + diagnostics — OQ-226); Fullscreen/Wake Lock là hàm trong `pwa.ts`, gọi từ nút bấm (không tự chạy khi load — trình duyệt chặn + gây bất ngờ). Thoát kiosk = nút bấm, không khóa hẳn.

**Phạm vi:**
- Mới: `apps/web/public/manifest.webmanifest` + `apps/web/public/icons/*` (SVG nguồn + PNG sinh) + `apps/web/public/offline.html` (tĩnh, song ngữ — OQ-232); `apps/web/src/pwa.ts` (đăng ký SW qua `virtual:pwa-register`, state cập nhật, helper kiosk/fullscreen/wake-lock, hàm thuần để unit test); `apps/web/vite.config.ts` (+ plugin `VitePWA`); `apps/web/package.json` (+ `vite-plugin-pwa@2.0.0` devDep); `apps/web/index.html` (link manifest, `theme-color`, `apple-touch-icon`); `apps/web/src/main.tsx` (đăng ký SW + đọc `?kiosk=1`); `apps/web/src/App.tsx` + `apps/web/src/store.ts` (slice `pwa`: `updateAvailable`, `kiosk`, `wakeLockSupported/held`; banner cập nhật + kiosk bar); `apps/web/src/i18n/{vi,en}.ts` (key `pwa.*`, `kiosk.*`); `apps/server/src/server.ts` (header `no-cache` cho `sw.js` + manifest — OQ-223); `scripts/gen-pwa-icons.mjs`; `apps/web/e2e/e7.spec.ts` (E7 — xem Test target); `docs/adr/0009-https-lan.md` (ADR HTTPS cho LAN — xem dưới); `docs/semantics.md` §19 (mới); `docs/verify-owner-guide.md` thêm mục kiểm tay kiosk trên tablet thật (xem Rủi ro 3).
- Tái dùng (không viết lại): WS client + reconnect + banner `lastError` (P0.6 — trạng thái mất kết nối đã có; offline là tầng SW, không sửa WS); `wsUrl()` (đã chọn `wss:` khi `https:`); i18n vi/en; e2e helpers (`gotoTags`, `resetSim`); `scripts/ensure-web-dist.mjs` (E7 chạy trên dist đã build như E1–E6); `test:e2e` (không đổi script).
- KHÔNG thuộc phạm vi: TLS trong server / đổi bind mặc định (D-005, D-007 quyết sau); push notification, background sync (skill §9: chưa có yêu cầu); SW ở `vite dev` (OQ-231); PWA cho `examples/` khác ngoài web chính; sửa E1–E6; sửa M0 §8.2–8.3 (P0.9 ngoài spec, không sửa spec); ADR khác ngoài 0009; `docs/facts/` mới; thay icon "đẹp" (cosmetic, thay sau).

**Thiết kế (7 điểm):**
1. **Manifest** (`public/manifest.webmanifest`, OQ-225): `name` "Virtual Commissioning Studio", `short_name` "VCS", `start_url` "/", `scope` "/", `display` "standalone", `lang` "vi" (cố định), `theme_color` "#111827" (khớp header dark `dark:bg-gray-900` ở App.tsx:113), `background_color` "#ffffff", icons 192/512 `any` + 512 `maskable`. `index.html` thêm `<link rel="manifest">` + `<meta name="theme-color">` + `<link rel="apple-touch-icon">`.
2. **Service worker** (`vite.config.ts` → `VitePWA({ registerType: 'prompt', injectRegister: false, workbox: {...} })`, OQ-218/220/221): `globPatterns` toàn bộ dist assets; `maximumFileSizeToCacheInBytes: 5 MB` (mặc định Workbox 2 MB sẽ bỏ qua chunk Monaco lớn — build phải warn nếu file bị bỏ qua, ghi tổng precache vào log build); `runtimeCaching: [{ urlPattern: /^\/api\//, handler: 'NetworkOnly' }]`; `navigateFallback: '/offline.html'` (navigation NetworkFirst — OQ-219); `cleanupOutdatedCaches: true`; `skipWaiting: false`, `clientsClaim: false` (prompt model — OQ-222). Đăng ký ở `main.tsx` qua `registerSW` từ `virtual:pwa-register` (OQ-233: kiểm depcheck xanh; module ảo không thuộc rule `web-deps`).
3. **Cập nhật** (OQ-222): SW mới → `onNeedRefresh` → store `updateAvailable = true` → banner "Có bản mới — tải lại" (i18n, có `data-testid="pwa-update-banner"` + nút `pwa-update-reload`); **không** tự reload. Bấm tải lại: nếu editor PLC đang dirty → hộp xác nhận ("Còn thay đổi chưa lưu — tải lại sẽ mất?"); sim đang RUNNING vẫn cho reload (state ở server, reload chỉ subscribe lại). `updateSW(true)` rồi `location.reload()` do plugin lo.
4. **Trang offline** (`public/offline.html`, OQ-232): file tĩnh, không JS ngoài nút "Thử lại" (`location.reload()`), song ngữ vi (chính) + en (phụ), precache; không dùng i18n runtime. Hiển thị khi: SW đã đăng ký + server tắt + reload/điều hướng (navigation fallback).
5. **Kiosk** (`pwa.ts` + App/store, OQ-226…229): `?kiosk=1` → `pwa.kiosk = true` (đọc 1 lần ở khởi động; đổi param cần reload — ghi rõ). Layout kiosk: ẩn nút đổi ngôn ngữ/dark mode + tab PLC Workspace; giữ tên project, badge kết nối, Sim bar, Tags, Diagnostics; kiosk bar có nút "Toàn màn hình" + "Thoát kiosk" + ghi chú Wake Lock khi không hỗ trợ. Fullscreen: `document.documentElement.requestFullscreen()` chỉ từ nút bấm, fail → bắt lỗi, kiosk chạy tiếp không fullscreen. Wake Lock: `navigator.wakeLock?.request('screen')` khi vào kiosk, xin lại ở `visibilitychange` → visible, release khi thoát; không hỗ trợ → ghi chú 1 dòng trong kiosk bar. Chống vuốt/zoom: CSS kiosk `overscroll-behavior: none` + `touch-action: manipulation` trên root; viewport `maximum-scale=1, user-scalable=no` **chỉ** khi kiosk (đổi meta động), chế độ thường giữ zoom (a11y P0.6).
6. **Server header** (OQ-223): `fastifyStatic` thêm `setHeaders`: path `/sw.js` hoặc `/manifest.webmanifest` → `Cache-Control: no-cache`; còn lại mặc định. Không chạm route `/api` hay WS. Test: E7 đọc header response của `/sw.js`.
7. **ADR-0009 HTTPS cho LAN** (xem bảng dưới — nội dung đầy đủ để triển khai chỉ việc chuyển thành file `docs/adr/0009-https-lan.md`): vấn đề là SW chỉ chạy trên secure context; `vcs serve` mặc định bind `127.0.0.1` → localhost OK; tablet FAT qua `http://192.168.x.x` → không secure → SW không đăng ký, không cài PWA. **Không** đổi bind, **không** thêm TLS vào server trong P0.9. Quyết định chọn phương án là **D-007 (owner)**.

**Bảng A — ADR-0009: phương án HTTPS cho LAN (để triển khai viết thành file ADR):**

| Phương án | Cách làm | Ưu | Nhược | Ghi chú |
|---|---|---|---|---|
| **A — mkcert (đề xuất)** | `mkcert -install` 1 lần trên máy chủ (tạo CA nội bộ tin cậy local) + `mkcert <tên-máy/IP-LAN>` tạo cert; server dùng cert qua TLS (cần thêm TLS vào Fastify — việc riêng sau khi D-007 quyết, không trong P0.9); cài CA root mkcert lên từng tablet (1 lần/tablet) | 1 lệnh, không thêm service chạy thường trực; cert tin cậy nội bộ, trình duyệt không cảnh báo sau khi cài CA | CA phải cài tay trên mỗi tablet; cert có hạn, cần gia hạn theo chu kỳ mkcert; cần cấu hình TLS ở server (chưa có) | `wsUrl()` đã chọn `wss:` khi `https:` nên WS theo tự động, không sửa code web |
| B — Reverse proxy TLS (Caddy/nginx) | Proxy đứng trước server, terminate TLS bằng cert nội bộ/self-signed (trust trên tablet) hoặc cert từ CA nội bộ sẵn có; passthrough `wss://` | Không sửa code server; tách bạch TLS khỏi app | Thêm 1 service cần vận hành + cấu hình proxy (đặc biệt passthrough WebSocket) | Cân nhắc nếu đã có hạ tầng proxy |
| C — Chỉ localhost (không LAN PWA) | Không làm gì: tablet dùng trình duyệt thường qua http, không cài PWA, không SW; witness xem qua máy chủ hoặc remote desktop | Không việc thêm | Mất offline/update/kiosk trên tablet | Phương án dự phòng nếu A/B đều không muốn làm |

**Bảng B — SW xử lý từng loại request (tính tay từ thiết kế điểm 2, dùng làm kỳ vọng test):**

| Request | SW làm gì | Vì sao |
|---|---|---|
| GET `/` (navigation, server chạy) | NetworkFirst → trả `index.html` mới từ server | Luôn lấy shell mới nhất khi có mạng |
| GET `/` (navigation, server tắt) | Network fail → trả precached `/offline.html` | Trạng thái thật là offline, không đưa app nửa chết |
| GET `/assets/*`, `/manifest.webmanifest`, `/icons/*` (đã precache) | Trả từ precache | Tài nguyên tĩnh có hash, không đổi theo bản |
| GET `/sw.js` | Trình duyệt tự fetch với `no-cache` (header server OQ-223); không nằm trong precache | SW mới phải được kiểm tra mỗi lần load |
| GET `/api/*` | NetworkOnly — không đọc/không ghi cache | Dữ liệu live; cache là sai (lỗi hay gặp skill §10) |
| `/ws` (WebSocket upgrade) | SW không chạm (không phải fetch event) | WS không đi qua Cache Storage |
| POST/PUT bất kỳ | Không cache (Workbox mặc định chỉ GET) | Ghi không được cache |

**Bảng C — Ma trận kiosk theo khả năng thiết bị (tính tay, dùng làm kỳ vọng test + kiểm tay):**

| Khả năng | Có | Không có |
|---|---|---|
| Fullscreen API | Kiosk toàn màn hình | Kiosk vẫn chạy trong cửa sổ trình duyệt, ghi chú trong kiosk bar |
| Wake Lock | Màn hình thức trong kiosk | Ghi chú "thiết bị không hỗ trợ Wake Lock", màn hình tắt theo hệ thống |
| Secure context (localhost) | PWA đầy đủ (SW + cài đặt) | http LAN → không SW/không cài được, cần D-007 |
| `?kiosk=1` | Layout kiosk | Layout thường |

**Dependencies mới:**
- `apps/web`: **`vite-plugin-pwa@2.0.0`** (devDependency, build-time; đã kiểm `npm view`: 2.0.0 phát hành 2026-10-03, 53 ngày tuổi — thỏa ≥ 14 ngày; peer `vite ^3–^8` khớp 8.3.7, `workbox-build`/`workbox-window ^7.4.1` đi kèm). Ghim chính xác; lockfile thêm importer + workbox. Không dep runtime mới cho app (Workbox runtime chỉ nằm trong `sw.js` sinh ra, không import vào bundle). Không ADR riêng cho plugin (devDep build-time, tiền lệ tsup P0.5; khác Monaco runtime → ADR-0008).
- Không dep mới cho server (chỉ `setHeaders`, API sẵn của `@fastify/static`), không dep mới cho icon (script dùng `@playwright/test` đã có).
- Lockfile: chỉ thêm importer `vite-plugin-pwa` + `workbox-*` ở `apps/web`; `pnpm-lock.yaml` sinh bằng `pnpm install` thật trong `/tmp` rồi chép về (tiền lệ OQ-007 — không `pnpm add` tại chỗ trong `~/workspace/vcs`).

**Test target (≥ 17 mới, tổng ≥ 1944):**

| Nhóm | File | Số lượng |
|---|---|---|
| web unit (12) | `apps/web/src/pwa.test.ts` (mới) | `parseKioskParam` (?kiosk=1/0/thiếu/sai → true/false); `isCacheableRequest` (bảng B: /api → false, /ws → false, POST → false, /assets → true, / → navigation); `shouldShowUpdateBanner` (waiting + !dirty → true; dirty → confirm); `wakeLockAvailable` (navigator-like giả); `offlinePage` content check (chuỗi vi/en có mặt); manifest object validate (field bắt buộc, icon đủ size) |
| e2e E7 (5) | `apps/web/e2e/e7.spec.ts` (mới) | E7.1 manifest hợp lệ (fetch `/manifest.webmanifest`: name/short_name/start_url/display/icons + từng icon 200); E7.2 SW đăng ký trên localhost (`navigator.serviceWorker.ready` + `registration.active` sau `gotoTags`); E7.3 offline fallback (load app → SW active → `context.setOffline(true)` → reload → trang offline hiện, có nút "Thử lại"); E7.4 `/api` không bị cache (offline → `fetch('/api/health')` phải lỗi, không trả từ cache); E7.5 header `/sw.js` có `Cache-Control: no-cache` |
| e2e update (1, opt-in) | `apps/web/e2e/e7.spec.ts` (cùng file, skip mặc định) | E7.6 banner cập nhật: chỉ chạy khi `VCS_RUN_PWA_UPDATE=1` (tiền lệ perf-scroll — OQ-230): sửa comment trong source → `vite build` → `registration.update()` → banner "Có bản mới" hiện; cleanup try/finally (`git checkout` file + build lại). Implementer chạy tay với flag trước merge, dán kết quả |
| hồi quy | E1–E6 (cũ) | Phải xanh nguyên — SW không được phục vụ shell cũ làm sai E1–E6 (Playwright dùng profile mới mỗi lần chạy nên không dính SW cũ; ghi rõ nếu E1–E6 đỏ sau khi thêm SW thì lỗi ở SW, không sửa kỳ vọng cũ) |

Tổng bảng = 12 + 5 + 1 = **18 test mới** (tổng ≥ 1945). Coverage: web không có ngưỡng coverage (tiền lệ P0.6); `pwa.ts` hàm thuần phải có test cho mọi nhánh (không `any`, không chuỗi cứng — qua i18n). Thứ tự triển khai đề xuất: manifest + icons + offline.html → vite config + SW đăng ký → server header → banner cập nhật → kiosk → E7 (E7.1–E7.5 trước, E7.6 chạy tay cuối) → ADR-0009 + semantics §19.

**Mơ hồ (phân loại):** **Tier A (tự quyết):** vị trí file theo M0 §8.2–8.3 + dep graph (mọi thứ PWA ở `apps/web`, trừ header ở `apps/server/src/server.ts`); `vite-plugin-pwa@2.0.0` generateSW (đã kiểm ngày phát hành, devDep, không ADR riêng); icon SVG vẽ tay + PNG sinh bằng Playwright (không dep mới); thứ tự triển khai trên; offline page không dùng i18n runtime; `start_url` "/" (không kiosk). **Tier B (mặc định + ghi OQ + R-005):** OQ-218 (plugin generateSW vs SW viết tay); OQ-219 (navigation fallback → offline.html riêng, không về shell cache); OQ-220 (NetworkOnly cho /api, /ws không chạm, POST không cache); OQ-221 (precache toàn dist, `maximumFileSizeToCacheInBytes` 5 MB, đo tổng precache ở build); OQ-222 (prompt update, không tự reload; dirty editor → confirm; RUNNING vẫn cho reload); OQ-223 (header `no-cache` cho sw.js + manifest); OQ-224 (icon SVG nguồn + PNG sinh bằng script Playwright); OQ-225 (manifest: name/short_name/display/lang vi cố định/theme #111827); OQ-226 (kiosk ẩn header controls + tab PLC Workspace); OQ-227 (Fullscreen chỉ từ nút bấm, fail thì chạy tiếp); OQ-228 (Wake Lock xin lại khi visible, không hỗ trợ thì ghi chú); OQ-229 (chặn pull-to-refresh/zoom: CSS kiosk + viewport maximum-scale chỉ khi kiosk); OQ-230 (E7.6 update chỉ chạy với `VCS_RUN_PWA_UPDATE=1`); OQ-231 (không bật SW ở `vite dev`); OQ-232 (offline.html tĩnh song ngữ); OQ-233 (`virtual:pwa-register` kiểm depcheck xanh). **Tier C (không có mục chặn P0.9):** D-007 (chọn phương án HTTPS cho LAN: A mkcert / B reverse proxy / C chỉ localhost) — là quyết định của owner, nhưng **không chặn** P0.9 vì PWA chạy đủ trên localhost; ADR-0009 chỉ đề xuất, không quyết. Không đổi bind mặc định (D-005), không thêm TLS vào server, không hạ ngưỡng, không thêm dep runtime lớn. Nếu khi triển khai phát hiện `vite-plugin-pwa` 2.0.0 không tương thích Vite 8.3.7 (dù peer khai ^8) → dừng, báo + đề xuất (không tự hạ Vite hay đổi plugin). **Triển khai liên tục (chủ sản phẩm 2026-11-25 12:11 +07):** plan không có tier C chặn → sau plan, triển khai → tự kiểm gate → PR → merge, không dừng chờ.

**Rủi ro top-3:**
1. **SW phục vụ shell cũ** (sau deploy user thấy bản cũ; E1–E6 sai vì cache). Giảm: prompt-update (không auto), SW update check mỗi lần load, e2e profile mới mỗi lần chạy. Nếu E1–E6 đỏ sau khi thêm SW → lỗi ở SW, không sửa kỳ vọng cũ.
2. **Precache bỏ qua chunk Monaco lớn** (Workbox mặc định 2 MB/file) → offline thiếu editor. Giảm: `maximumFileSizeToCacheInBytes` 5 MB + build warn nếu file bị bỏ qua + đo tổng precache. Lưu ý: editor offline không phải yêu cầu (không server thì không mô phỏng được) — chỉ shell + offline page mới bắt buộc.
3. **Kiosk trên tablet thật chưa kiểm được ở P0.9** (gate chỉ có Chromium desktop qua Playwright; iPad/Android: Fullscreen API, Wake Lock, cài PWA hành vi khác nhau theo hãng — SUY ĐOÁN, chưa có mẫu thật). Giảm: ghi rõ trong `docs/semantics.md` §19 là UNVERIFIED + thêm mục kiểm tay vào `docs/verify-owner-guide.md` ở triển khai (mở app trên tablet thật với `?kiosk=1`, kiểm fullscreen/wake lock/cài đặt); không chặn merge P0.9.

**Kết quả triển khai (2026-11-26):** 1 commit feat (sau plan `66607f9`). **19 test
mới (18 unit `pwa.test.ts` + E7.6 opt-in), tổng 1946/1946 (77 files)** — vượt
mục tiêu ≥ 18/≥ 1945 (plan tính 12 unit, thực tế 19: parseKioskParam 4,
classifyRequest 7, banner/confirm 4, wakeLock 2, offline 1, manifest 1).
E2E: **E1–E7.5 11/11 xanh** (E7.6 skip mặc định) + **E7.6 xanh thủ công với
`VCS_RUN_PWA_UPDATE=1`** (24.2s). Gate trên bản copy sạch (real install):
lint 0, typecheck 0, depcheck 0 (126 modules), test 1946/1946, review:cheats
SẠCH, diagnostics --check khớp (51 codes), build OK (precache 107 entries,
13.9 MiB), bench PASS (TagDB 51.1M ops/s; orchestrator 520,108 steps/s;
softplc 1,684 scan/s ≥ 1000; heap +0.22 MB).

**Lệch plan (ghi OQ-234 + cập nhật OQ-221/230/218):**
1. **OQ-218 — generateSW → injectManifest (OQ-234 mới).** `generateSW` +
   `navigateFallback` không làm được bảng B: Workbox `navigateFallback`
   đăng ký NavigationRoute trả precached fallback cho MỌI navigation, không
   bao giờ chạm network (đọc `workbox-build@7.4.1` templates/sw-template.js
   + docs vite-pwa injectManifest). Với `navigateFallback: '/offline.html'`,
   navigation lúc online sẽ trả offline.html thay vì index.html mới — trái
   bảng B. Đổi sang **injectManifest** (cùng plugin 2.0.0, plugin vẫn sinh
   precache manifest; chỉ routing viết tay trong `src/sw.ts`): NavigationRoute
   NetworkOnly + `setCatchHandler` → precached `/offline.html`;
   `precacheAndRoute(manifest, { directoryIndex: '' })` (chuỗi rỗng = tắt
   map "/" → "/index.html"; type workbox chỉ nhận string, `null` không qua
   typecheck nhưng runtime cần falsy). Cùng plugin, cùng gate, cùng file —
   sửa cơ chế, không phải tier C.
2. **OQ-221 — `maximumFileSizeToCacheInBytes` 5 MB → 8 MiB.** Build đầu lỗi
   ở hook PWA: chunk `ts.worker` của Monaco 6,927,783 bytes (> 5 MB);
   vite-plugin-pwa 2.0.0 biến asset quá giới hạn thành **lỗi build** (không
   chỉ warn). Đặt 8 MiB, có comment ghi số đo.
3. **`workbox-window@7.4.1` thêm làm devDep trực tiếp của `@vcs/web`.**
   Build 2 lỗi Rolldown: không resolve được `workbox-window` từ
   `virtual:pwa-register` (pnpm strict node_modules không expose dep của
   plugin cho app). Guide React của vite-plugin-pwa yêu cầu dep này.
4. **`pwa.ts` helper tên `classifyRequest`** (trả 3 giá trị
   `'precache' | 'navigation' | 'network-only'`) thay cho `isCacheableRequest`
   của plan — `/` cần kết quả thứ ba 'navigation'.
5. **`shouldShowUpdateBanner(waiting)` + `reloadNeedsConfirm(dirty)` tách
   riêng** thay cho 1 hàm 2 tham số (banner hiện khi có update chờ; dirty
   chỉ đổi hành động reload).
6. **Đăng ký SW tách:** `pwa.ts` thuần (test node) vs `pwa-register.ts`
   (import `virtual:pwa-register`, chỉ browser, chỉ main.tsx import) — plan
   đặt đăng ký trong pwa.ts sẽ làm vỡ unit test node.
7. **Thoát kiosk xóa `?kiosk=1` khỏi URL** (replaceState) để reload sau không
   tự vào lại kiosk.
8. **E7.6 probe đổi từ comment sang câu lệnh thật.** Comment trong source bị
   Vite production build strip → bundle không đổi hash → SW không thấy bản
   mới → banner không hiện (E7.6 đỏ lần đầu, 41.7s). Probe mới gán
   `window.__e76probe = 1` (side effect, minifier giữ lại); finally khôi
   phục source nguyên văn + build lại (đã kiểm: App.tsx giống hệt cây live,
   dist về đúng hash bundle gốc).
9. **`server.ts` setHeaders dùng `reply.header(...)`** (FastifyReply), không
   phải `res.setHeader(...)` — type `@fastify/static@10` là FastifyReply;
   lint + typecheck bắt, đã sửa.
10. **`sw.ts` catch handler dùng `request` riêng** (RouteHandlerCallbackOptions
    có `request` ngang hàng `event`, không nằm trong `event`); `getCacheKeyForURL`
    là đồng bộ (`string | undefined`), không `await`.
11. **Test `classifyRequest(':::', ...)` sai kỳ vọng:** `':::'` parse được
    (pathname `/:::`) nên implementation trả 'precache' là đúng; test sửa
    sang URL tuyệt đối sai cú pháp `'http://[::1'` (ném thật) — lỗi test-code,
    không sửa kỳ vọng để cho xanh.
12. **E7.6 skip vào allow-list** `scripts/check-cheats.allow.json`
    (`test-skip`, max 1, lý do OQ-230) — cơ chế allow-list của gate
    (AGENTS §6), không nới rule.
13. **Sự cố dist cũ (bug quy trình, không phải code P0.9):** e2e lần đầu đỏ
    4 test (E6, E7.2–E7.4) — nguyên nhân: cây live còn `apps/web/dist/` từ
    thời M1 (pre-P1.7, 2026-11-24 23:50, gitignored) và rsync live→/tmp
    (không --delete) đã chép đè `index.html` cũ lên bản build mới trong bản
    copy gate → app phục vụ là bundle pre-P1.7 (không có PLC Workspace, không
    có code đăng ký SW); `ensure-web-dist.mjs` chỉ build khi thiếu index.html
    nên không phát hiện. Sửa: xóa `apps/*/dist` khỏi cây live (build output,
    gitignored), build lại mới trong bản copy gate → e2e 11/11 xanh. Bài học:
    rsync về sau loại trừ cả `dist` (đã thêm vào lệnh rsync); không giữ dist
    trong cây live.

**OQ-218…233 đóng (applied); OQ-234 mới (tier B, applied). OQ-161, D-006,
D-007 vẫn mở (không chặn P0.9).** ADR-0009 đã viết (đề xuất A mkcert, chưa
quyết); `docs/semantics.md` §19 mới (kiosk tablet thật = UNVERIFIED);
`docs/verify-owner-guide.md` thêm mục P0.9 (kiosk tablet + D-007).
