# Hướng dẫn kiểm chứng cho chủ sản phẩm

## Mục lục

- [Trạng thái](#trạng-thái)
- [M1 — Soft-PLC](#m1-soft-plc)
  - [1. Bench trên máy anh](#1-bench-trên-máy-anh)
  - [2. Rà `docs/semantics.md` §15–§16](#2-rà-docssemanticsmd-1516)
  - [3. VERIFY §14 với PLCSIM + mã thật](#3-verify-14-với-plcsim-mã-thật)
  - [4. Gate trên máy Windows thật](#4-gate-trên-máy-windows-thật)
  - [5. Quyết OQ-161 — layout IN_OUT của multi-instance lồng](#5-quyết-oq-161-layout-in_out-của-multi-instance-lồng)
  - [6. Phán §16.5 — giữ mã lỗi tách riêng hay gom về U001?](#6-phán-165-giữ-mã-lỗi-tách-riêng-hay-gom-về-u001)
  - [7. Ký M1](#7-ký-m1)
  - [Quan sát (không phải lỗi)](#quan-sát-không-phải-lỗi)
- [P0.9 — Kiosk trên tablet thật + HTTPS cho LAN (D-007)](#p09-kiosk-trên-tablet-thật-https-cho-lan-d-007)
  - [1. Kiosk trên tablet thật](#1-kiosk-trên-tablet-thật)
  - [2. Quyết D-007 — HTTPS cho truy cập LAN](#2-quyết-d-007-https-cho-truy-cập-lan)
- [Các mục verify sau này](#các-mục-verify-sau-này)
  - [Probe layout — FB đa kiểu (D-010 A, OQ-400)](#probe-layout-fb-đa-kiểu-d-010-a-oq-400)

> File sống: AI ghi vào đây hướng dẫn chi tiết cho mọi việc chỉ chủ sản phẩm làm
> được (kiến thức điều khiển, máy thật, PLCSIM/TIA, quyết định). Mỗi mục tự đủ
> ngữ cảnh: làm gì, lệnh nào, kỳ vọng số nào, báo lại bằng cách nào.
> Cách báo lại: nhắn trong chat kèm ID mục (ví dụ "§16.5: chọn A") hoặc dán kết
> quả theo hướng dẫn trong mục. Mục nào khác với mặc định → SCR, sửa sau, không
> sửa lặng trong milestone đang ký.

## Trạng thái

| Milestone | Gói nghiệm thu | Ngày ký | Ghi chú |
| --------- | -------------- | ------- | ------- |
| M0 | `docs/acceptance/M0.md` | 2026-11-24 | 12/12 §15 ĐẠT; probe 3/3 PASS; Windows 439/439 |
| M1 | `docs/acceptance/M1.md` | 2026-11-25 | 9/9 §16 ĐẠT; probe 4/4 PASS; §16.5 đã quyết A 2026-11-27; OQ-161 đã đóng 2026-11-27 bằng bằng chứng TIA (xem mục 5) |

---

## M1 — Soft-PLC

### 1. Bench trên máy anh

**Mục đích:** số scan/s trên máy anh mới là bằng chứng §16.6 (§12.4 ≥ 1000
scan/s với 200 FB_Motor). Số trên VM (1664 ở G1, 1738 ở P1.7) chỉ là tham chiếu —
VM chia sẻ CPU nên số dao động vài % giữa các lần chạy.

**Làm:**

```text
cd <thư mục repo VCS trên máy anh>
git checkout develop
git pull
pnpm install --frozen-lockfile
pnpm bench
```

Chạy lúc máy rảnh (không chạy thêm gì nặng). Lệnh `pnpm bench` chạy cả 3 bench
(TagDB, orchestrator, softplc); con số quyết định là **softplc scan/s**.

**Kỳ vọng:**

| Bench | Ngưỡng | VM đo được |
| ----- | ------- | ---------- |
| softplc (200 FB_Motor) | ≥ 1000 scan/s | 1664 (G1), 1738 (P1.7) |
| softplc heap | < 1 MB / 2000 scan | +0.22 MB |
| TagDB set/get | ≥ 10M ops/s | ~50M ops/s |
| orchestrator | ≥ 100 000 steps/s | ~455 000 steps/s |

**Báo lại:** con số softplc scan/s anh đo được. Nếu dưới 1000 → tier C: dừng
lại bàn, không hạ ngưỡng, không sửa kỳ vọng để cho qua.

### 2. Rà `docs/semantics.md` §15–§16

**Mục đích:** AI không tự biết hành vi PLC thật; chỉ anh mới phán được các mặc
định UNVERIFIED có đúng với TIA/PLCSIM và kinh nghiệm hiện trường không.

**Đọc:** `docs/semantics.md`, §15 từ dòng 575 (interpreter + SoftPlc) và §16 từ
dòng 681 (11 std block). Phần VERIFIED đã có test ghim — anh chỉ cần rà phần
**UNVERIFIED**:

**§15 — Interpreter + SoftPlc:**

- Lưới scan đều (OQ-130): scan thứ k chạy tại `lastScanTime + k*period`; với
  stepMs = period = 10 thì scan tại 10, 20, 30… — **không có scan tại 0**.
  PLC thật có scan tại t=0 không?
- Số DB gán 1..n theo `id` đã sort ở `load()` (OQ-136).
- OV/ENO không quan sát được từ SCL (OQ-135): tràn `Int` chỉ đặt cờ `ov` nội
  bộ, không fault, không lộ ra IR. Nếu PLCSIM cho thấy ENO ảnh hưởng luồng thì
  cần SCR thêm ENO vào IR.
- Intrinsics ở biên: `NORM_X`/`SCALE_X` với x ngoài [0..1] **không kẹp**;
  tập `X_TO_Y`/`BOOL_TO_*` chỉ nhận Int/DInt/Byte/Word/DWord.
- OQ-161 (mục 5).

**§16 — System block IEC:**

- TONR ET **không kẹp PT**: công thức §9.3 `ET = _accum + (now − _start)` —
  test P-S6 ghim ET=1200 khi IN rớt sau khi đã vượt PT=1000. TIA có kẹp ET ở PT
  không?
- TP giữ IN=true sau khi hết xung: không kích lại, ET giữ = PT tới khi IN xuống
  (OQ-165). TIA có reset ET về 0 ngay khi hết xung không?
- Timer nằm trong nhánh IF, không được gọi vài scan rồi gọi lại: ET "nhảy" theo
  thời gian đã trôi (timestamp), Q có thể lật ngay (OQ-169, bảng D). TIA có đóng
  băng cả đồng hồ không?
- TOF: IN lên giữa chừng hủy đếm (retrigger), ET về 0, Q=true.
- Counter: kẹp CV ở 32767/−32768 (không wrap, không fault); thứ tự ưu tiên
  R > LD > đếm; CU+CD cùng cạnh lên → tăng rồi giảm = giữ nguyên.
- R_TRIG scan đầu: `_m` khởi tạo false sau load (CLK=true → Q=true ở scan đầu);
  sau STOP→RUN giữ `_m` cũ (CLK=true → Q=false) (OQ-164).
- Counter chỉ có biến thể Int — spec §9.4 nói "biến thể DInt theo tham số kiểu"
  nhưng EBNF không có cú pháp chọn (OQ-168); mã thật dùng counter DInt sẽ bị
  từ chối ồn ào (T004).

**Thêm theo REVIEW-CHECKLISTS §3.1:**

- Tự chọn 3 kịch bản timer/counter, tính tay đầu ra từng scan, so với golden.
- Xem logic demo có "giống thực tế" không (seal-in, timeout feedback, latch
  fault + reset). Chỉnh nếu khác tập quán dự án.

**Báo lại:** mục nào anh **biết chắc** khác (kèm hành vi thật), mục nào anh đồng
ý. Mục nào khác → SCR, sửa sau khi ký, không sửa lặng trong M1.

### 3. VERIFY §14 với PLCSIM + mã thật

**Mục đích:** đối chiếu 27 hành vi mặc định với PLC thật. Đây là việc lớn nhất
còn lại của M1 — **không chặn ký**: M1.md đã ghi các mục này là UNVERIFIED chứ
không phải CHƯA ĐẠT, nên anh có thể làm sau khi ký, trước M2.

**Danh sách:** `docs/verify-experiments-draft.md` — 14 mục M1 §14 + 13 mục ngoài
§§12–18 (tổng 27). Mỗi mục có sẵn cột "Hành vi hiện tại (mặc định)" và golden
nào ghim nó, để biết file nào sẽ đổi nếu kết quả thật khác.

**Cách làm cho mỗi mục:**

1. Dựng project TIA nhỏ (S7-1500, PLCSIM Advanced), một OB/FB ngắn cho mục đó.
2. Quan sát bằng Watch table của TIA (không cần SCADA).
3. So với cột "Hành vi hiện tại (mặc định)" trong file.
4. Mục nào khác → SCR vào `docs/open-questions.md` → AMENDMENTS → sửa
   code/golden → gate lại → đổi `expectedFrom` của golden tương ứng thành
   `plcsim`. Mục nào khớp → đổi nhãn trong `docs/semantics.md` thành VERIFIED.

**14 mục §14 (theo thứ tự spec):**

| # | Thí nghiệm | Hành vi hiện tại |
| - | ---------- | ---------------- |
| 1 | INT: `32767 + 1` → kết quả? ENO? | Wrap về −32768, chỉ đặt `frame.ov` (không fault) |
| 2 | DINT/INT chia 0 → kết quả, CPU có STOP không | Kết quả 0 + `DIV_ZERO`, tiếp tục chạy |
| 3 | `REAL_TO_INT(2.5)`, `(3.5)`, `(−2.5)`; gán ngầm `Int := Real` có lỗi biên dịch không | Round-half-even (2, 4, −2); gán ngầm → T010 (strict) |
| 4 | `NORM_X`/`SCALE_X` với VALUE ngoài khoảng (có kẹp không) | Không kẹp (khác `LIMIT`); `SCALE_X` ra nguyên làm tròn như `ROUND` |
| 5 | TON: PT=T#0s; IN dao động; timer **không được gọi** vài scan rồi gọi lại (Q có "nhảy" không) | PT=0 → Q=IN ngay, ET=0; không gọi → đóng băng theo timestamp, gọi lại ET nhảy |
| 6 | TP: IN giữ true sau khi hết xung (có kích lại không) | Không kích lại; ET giữ PT tới khi IN xuống |
| 7 | TOF: IN true→false→true trong lúc đếm | Rising giữa chừng hủy đếm (ET về 0, Q=true) |
| 8 | CTU/CTD/CTUD: biên max/min, thứ tự ưu tiên R/LD, CU và CD cùng cạnh | Kẹp CV 32767/−32768; R thắng LD và thắng đếm cùng scan; CU+CD cùng cạnh → không đổi |
| 9 | `R_TRIG` ở scan đầu sau STOP→RUN khi CLK đã true (Q?) | `_m` khởi tạo false → Q=true ở scan đầu; sau STOP→RUN giữ `_m` (CLK=true → Q=false) |
| 10 | Đọc lại `%Q` trong cùng scan sau khi ghi (PIQ) | Trả giá trị vừa ghi (ghi PIQ, đọc lại thấy ngay) |
| 11 | Layout DB standard: struct có Bool xen kẽ Byte/Word/LReal (so offset thực tế) | LReal căn chẵn (không căn 8, OQ-084); Array of Bool gói bit, bắt đầu/kết thúc chẵn (OQ-083) |
| 12 | Độ sâu gọi tối đa, nhiều biến TEMP không khởi tạo (giá trị rác hay 0) | `maxCallDepth` mặc định 24 → `CALL_DEPTH`; TEMP về mặc định kiểu (0/false) + cảnh báo W001 khi đọc trước ghi |
| 13 | Array index ngoài khoảng (đọc/ghi): hành vi CPU | Đọc → giá trị mặc định kiểu + `ARRAY_RANGE`; ghi → bỏ qua + `ARRAY_RANGE` |
| 14 | Cyclic OB (OB35) khi chu kỳ không chia hết scan OB1 | Chạy khi `floor((t−phase)/period)` tăng, tối đa 1 lần/scan; trễ → `CYCLE_OVERRUN` (đếm số kỳ trễ) |

**13 mục ngoài §14** (mục 15–27 trong file draft): `**` kết hợp phải (`2 ** 3 ** 2`
= 512); tập `X_TO_Y`/`BOOL_TO_*` đầy đủ; `#fb.IN := ...` (gán vào input của
instance FB từ ngoài — hiện cho phép, OQ-129); FC trả giá trị bằng cách gán tên
FC (OQ-112); lưới scan đều vs thời gian thực (OQ-130); đánh số DB 1..n (OQ-136);
OV/ENO; TONR ET có clamp ở PT không (mục 22 — hiện KHÔNG clamp); LAD `pos`/`neg`,
RLO sau box std, EN-gating; LAD instance DB; comment `(* *)` lồng; thứ tự ưu
tiên toán tử còn lại; các mục M0 (seed, trễ 1 bước, thứ tự delta…).

**Mã thật (X-002/S1):** export ≥ 10 block SCL/LAD từ TIA, ẩn danh tên tag/block
rồi đưa file cho AI; AI chạy đối chiếu và báo lệch dưới dạng SCR. P1.2–P1.7 đều
đã làm theo spec strict khi chưa có mã thật; S1/PLCSIM sau này chỉ nới lỏng qua
SCR, không âm thầm đổi kỳ vọng.

**Báo lại:** kết quả từng mục (khớp / khác + hành vi thật), hoặc gửi file mã thật
để AI đối chiếu.

### 4. Gate trên máy Windows thật

**Mục đích:** CI windows-latest xanh không thay thế máy thật (M0 đã chứng minh:
máy anh bắt được lỗi path có dấu cách mà CI không bắt — OQ-074).

**Làm** (repo, nhánh `develop`, sau `pnpm install --frozen-lockfile`):

```text
pnpm lint        # kỳ vọng: 0 lỗi
pnpm typecheck   # kỳ vọng: sạch
pnpm test        # kỳ vọng: 1927/1927 (76 file)
pnpm test:e2e    # kỳ vọng: 6/6
pnpm bench       # như mục 1
```

Tiền lệ M0: máy anh chạy 439/439 sau fix OQ-074. Nếu test Windows đỏ, chụp log
gửi AI — đừng sửa test để cho xanh.

### 5. Quyết OQ-161 — layout IN_OUT của multi-instance lồng

**✅ ĐÃ ĐÓNG 2026-11-27 — bằng chứng TIA của anh (CPU 1511-1 PN).** Kiểm tra 1 (layout) đã đủ để kết luận — **IN_OUT lồng = kích thước tự nhiên**, không phải slot 4 byte: `DB_Motor.sub.io: Int` @30.0 (2 byte), `s` @32.0. Code hiện tại (`fbInterfaceStruct`) đã đúng, không đổi code; test bảng P giữ 38 byte. Kiểm tra 2 (PLCSIM, hành vi) **không còn cần cho OQ-161** — IN_OUT truyền bằng tham chiếu đã là ngữ nghĩa của TIA và của interpreter nhà mình (semantics §15, OQ-148).

**Phát hiện thêm từ cùng bằng chứng (cần anh quyết — D-009/D-010, xem `docs/OWNER-INBOX.md`):**
- OQ-125 bị bác bỏ: IN_OUT top-level cũng kích thước tự nhiên (`DB_Sub.io: Int` @4.0, 2 byte, `s` @6.0) — nhà mình đang slot DInt 4 byte, ẩn, đọc → T005 (DB_Sub 10 byte vs TIA 7 byte). → SCR OQ-399.
- Lệch layout rộng hơn: Bool interface (nhà mình gói bit, TIA mỗi Bool 1 byte + căn chẵn — qRun @2.0 không phải @0.1); TON 18 vs 16 byte; CTU 10 vs 6 byte (TIA có CD/LD/QD, nhà mình không có); DB_Motor 33 vs 38 byte. → SCR OQ-400.

**Bảng đối chiếu TIA vs nhà mình (DB_Motor):** iStart @0.0 / qRun @2.0 / tOn @4.0 (TON_TIME 16 byte) / cCount @20.0 (CTU_INT 6 byte) / sub @26.0 (a @26.0, q @28.0, io @30.0, s @32.0) — tổng 33 byte. Nhà mình: iStart+qRun byte 0 / tOn @2 (18 byte) / cCount @20 (10 byte) / sub @30 (8 byte) — tổng 38 byte.

### 6. Phán §16.5 — giữ mã lỗi tách riêng hay gom về U001?

**Hiện trạng đã kiểm chứng bằng probe** (đều lỗi ồn ào, có vị trí, exit 2 —
không cấu trúc nào chạy sai im lặng; xem `docs/acceptance/M1.md` §16.5):

| Cấu trúc | Kết quả |
| -------- | ------- |
| `String`/`WString` | SCL-U001 tại 3:7 |
| `POINTER`/`ANY` | SCL-T001 "kiểu chưa biết" tại 3:7 |
| Mảng nhiều chiều | SCL-P002 tại 3:17 + 3:31 |
| `GOTO` | SCL-P002 tại 3:8 |

Chữ spec §16.5 viết "`SCL-U001`" cho mọi lệnh/từ khóa chưa hỗ trợ, nhưng quyết
định mặc định M1 §17 chỉ quy định String → U001; các tên kiểu không có trong
EBNF §4.2 (`POINTER`, `ANY`) đi qua nhánh named-type rồi bị T001 tại đúng token
kiểu; cấu trúc ngoài ngữ pháp (mảng nhiều chiều, `GOTO`) bị P002 tại đúng vị trí.

- **A (đề xuất): giữ nguyên**, chỉ ghi anh chấp nhận phạm vi mã này, không sửa code.
- **B: SCR gom mọi cấu trúc ngoài EBNF về một mã U001** — đổi spec + sửa parser,
  làm ở phase sau.

**Báo lại:** "§16.5: A hay B".

### 7. Ký M1

Sau khi anh duyệt xong `docs/acceptance/M1.md` (9/9 tiêu chí §16 ĐẠT, 0 CHƯA ĐẠT)
và làm xong các mục anh chọn ở trên, anh chỉ cần nhắn "ký M1" như lần M0. AI sẽ
ghi chữ ký vào `docs/STATE.md` §8 (ngày ký, người ký, ghi chú), mở PR → develop,
chờ CI xanh rồi merge, sau đó đẩy main theo D-001 (PR develop → main, CI xanh,
merge). Anh không cần tự sửa file.

**Đã ký 2026-11-25.** §16.5 đã quyết A 2026-11-27; OQ-161 đã đóng 2026-11-27 bằng bằng chứng TIA (mục 5).

### Quan sát (không phải lỗi)

- Bảng Watch: cột Ghi/Force hơi chật ở viewport 1280px, chữ dính nhau
  ("GhiForce"/"Bỏ forceXóa"), giá trị vẫn đọc được. Đã ghi vào báo cáo probe M1
  (`~/workspace/vcs-probe-results-m1/PROBE-REPORT.md`). Chưa sửa — sẽ sửa khi chạm
  lại bảng Watch (M2), trừ khi anh muốn sửa ngay.

---

## P0.9 — Kiosk trên tablet thật + HTTPS cho LAN (D-007)

PWA đã xong và xanh ở CI (E7.1–E7.5 + E7.6 opt-in), nhưng có 2 việc chỉ kiểm
được trên thiết bị thật của anh — AI không làm hộ được bằng desktop Chromium.

### 1. Kiosk trên tablet thật

**Mục đích:** kiểm chế độ kiosk (`?kiosk=1`) chạy đúng trên tablet ở hiện
trường: cảm ứng, Fullscreen, Wake Lock (màn hình không tắt), chặn
pull-to-refresh/zoom.

**Làm gì:**
1. Trên máy server, chạy như bình thường: `pnpm vcs serve examples/hello-tags`
   (hoặc demo motor-interlock), mở trên tablet cùng mạng LAN… **nhưng** lưu ý:
   PWA qua HTTP trên LAN **không** đăng ký được service worker (mục 2 dưới)
   — để kiểm kiosk đầy đủ (offline + cài đặt), mở trên chính máy server
   (`http://127.0.0.1:4170/?kiosk=1`) hoặc chờ D-007 (HTTPS) xong.
2. Mở `http://127.0.0.1:4170/?kiosk=1` trên tablet (hoặc trình duyệt máy anh
   giả lập): header (chọn ngôn ngữ, đổi theme, tab Tags/PLC) phải **ẩn**;
   chỉ còn thanh kiosk với nút Fullscreen/Thoát.
3. Bấm Fullscreen → app chiếm toàn màn hình; bấm Thoát → về giao diện thường
   (URL mất `?kiosk=1`, reload lại không tự vào kiosk nữa).
4. Để tablet ở trang kiosk 5 phút, không chạm: màn hình **không** tự tắt
   (Wake Lock). Tắt tab → mở lại: Wake Lock xin lại khi tab hiện.
5. Kéo từ trên xuống (pull-to-refresh) và pinch-zoom: trang **không** reload/
   zoom trong kiosk; ngoài kiosk vẫn zoom bình thường.

**Kỳ vọng:** 5 điểm trên đều đạt. Nếu Wake Lock không giữ (màn hình vẫn tắt):
báo lại model tablet + trình duyệt — có thể trình duyệt đó không hỗ trợ
Wake Lock, khi đó ghi UNVERIFIED cho thiết bị đó (không sửa code để "cho
qua"). Nếu Fullscreen không vào được: kiểm xem trình duyệt có chặn
Fullscreen khi không có tương tác người dùng không (P0.9 chỉ gọi Fullscreen
từ nút bấm nên phải vào được).

**Báo lại:** "Kiosk tablet: đạt / lỗi ở bước X (máy + trình duyệt)".

### 2. Quyết D-007 — HTTPS cho truy cập LAN

**Mục đích:** chọn cách đưa PWA lên LAN để tablet ở hiện trường dùng được
offline + cài đặt (service worker chỉ chạy trên HTTPS/localhost).

**Lựa chọn (ADR-0009):**
- **A (AI đề xuất): mkcert** — chứng chỉ local tin cậy được, trình duyệt
  không cảnh báo; server chỉ thêm cert/key qua env, mặc định vẫn HTTP
  localhost. Mỗi máy client cài root CA của mkcert một lần.
- **B: Reverse proxy (Caddy/nginx + TLS)** — không sửa server VCS, nhưng
  thêm một thành phần vận hành riêng cho mỗi site.
- **C: Chỉ localhost** — không làm gì thêm; tablet LAN không dùng được PWA.

**Báo lại:** "D-007: A / B / C". Không chặn P0.9 — PWA đã đầy đủ trên
localhost; quyết xong mới triển khai ở phase sau.

---

## Các mục verify sau này

Mỗi khi có việc mới chỉ chủ sản phẩm làm được (M2: I/O list thật, C&E thật;
M4: SCADA/Modbus thật; M5: PLCSIM/S7/SimaticML…), AI sẽ viết hướng dẫn chi tiết
vào file này theo cùng mẫu: mục đích → làm gì (lệnh/file) → kỳ vọng số → báo
lại bằng cách nào. Mục đã xong chuyển xuống cuối file, không xóa.

### Probe layout — FB đa kiểu (D-010 A, OQ-400)

**Mục đích:** chốt quy tắc căn tổng quát của layout instance DB trên TIA (optimized). Từ 2 DB đã đo (DB_Motor/DB_Sub), hai quy tắc ứng viên đều khớp: (a) layout theo section (Input → Output → InOut → Static, mỗi section căn theo phần tử đầu), (b) mọi biến interface bắt đầu ở địa chỉ chẵn (căn tối thiểu 2 byte). Probe này đo thêm các kiểu lớn/mảng/UDT để AI khớp model với toàn bộ offset và chốt quy tắc.

**Làm gì:**
1. Trong cùng project TIA (CPU 1511-1 PN), tạo UDT `UDT_Probe`: `x: Int; y: Bool; z: DInt;`
2. Tạo FB `FB_SubD`: VAR_INPUT `a: Int`; VAR_OUTPUT `q: Bool`; VAR_IN_OUT `ioD: DInt`; VAR `s: Bool`. Thân: `#q := #a >= 1; #s := #q;`
3. Tạo FB `FB_Probe` đúng thứ tự khai báo sau (thứ tự là thứ probe kiểm — đừng sắp lại):
   - VAR_INPUT: `di: DInt; r: Real; lr: LReal; bIn: Bool;`
   - VAR_OUTPUT: `qo: Bool; ro: Real;`
   - VAR_IN_OUT: `ioD: DInt; ioR: Real;`
   - VAR: `b1: Bool; b2: Bool; i1: Int; arr: Array[0..3] of Int; u: UDT_Probe; subD: FB_SubD; t1: TON; c1: CTU;`
4. Tạo instance DB `DB_Probe` (FB_Probe). Compile all.
5. Mở `DB_Probe`, chụp Details view (cột Name/Offset/Data type) như lần trước — thấy hết các field + field con của `u`, `subD`, `t1`, `c1`.
6. Kiểm thêm: mở Properties của FB_Probe → General → "Optimized block access" có tick không (ghi lại có/không).

**Kỳ vọng:** `lr: LReal` (8 byte) cho biết căn 8 hay căn 4; `arr` (4×Int) cho biết mảng căn/kích thước; `u` cho biết UDT lồng căn thế nào; `ioD`/`ioR` xác nhận IN_OUT DInt/Real cũng kích thước tự nhiên (dự kiến 4 byte mỗi cái); `subD.ioD` xác nhận IN_OUT lồng kiểu DInt cũng tự nhiên.

**Báo lại:** ảnh Details view của DB_Probe + "Optimized block access: có/không" + độ dài DB (xem ở Properties của DB nếu có).
