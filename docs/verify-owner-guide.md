# Hướng dẫn kiểm chứng cho chủ sản phẩm

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
| M1 | `docs/acceptance/M1.md` | 2026-11-25 | 9/9 §16 ĐẠT; probe 4/4 PASS; §16.5 và OQ-161 chưa quyết (giữ mặc định, xem mục 5–6) |

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

**Vấn đề:** DB top-level dùng slot DInt 4 byte **không lộ** cho IN_OUT (đọc field
IN_OUT trong DB → T005), nhưng `fbInterfaceStruct` — layout cho FB con lồng
trong static của FB cha — lại layout IN_OUT theo kích thước tự nhiên. Hai chỗ
không nhất quán. Hiện tại P1.4/P1.5 giữ nguyên cả hai; test bảng P ghim FB_Motor
DB **38 byte**. Nếu lật sang "IN_OUT lồng cũng là tham chiếu 4 byte" thì DB thành
40 byte + SCR + sửa `fbInterfaceStruct` + sửa test bảng P.

- **A (đề xuất): hoãn tới khi có bằng chứng PLCSIM/S1**, không chặn ký M1, nhưng
  phải quyết trước M2 nếu chạm FB lồng có IN_OUT.
- **B: quyết ngay theo kinh nghiệm hiện trường của anh** — IN_OUT lồng là tham
  chiếu 4 byte → AI sửa ngay trong phase sau.

**Báo lại:** "OQ-161: A hay B".

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

**Đã ký 2026-11-25.** §16.5 và OQ-161 chưa quyết — giữ mặc định hiện tại (mục 5–6).

### Quan sát (không phải lỗi)

- Bảng Watch: cột Ghi/Force hơi chật ở viewport 1280px, chữ dính nhau
  ("GhiForce"/"Bỏ forceXóa"), giá trị vẫn đọc được. Đã ghi vào báo cáo probe M1
  (`~/workspace/vcs-probe-results-m1/PROBE-REPORT.md`). Chưa sửa — sẽ sửa khi chạm
  lại bảng Watch (M2), trừ khi anh muốn sửa ngay.

---

## Các mục verify sau này

Mỗi khi có việc mới chỉ chủ sản phẩm làm được (M2: I/O list thật, C&E thật;
M4: SCADA/Modbus thật; M5: PLCSIM/S7/SimaticML…), AI sẽ viết hướng dẫn chi tiết
vào file này theo cùng mẫu: mục đích → làm gì (lệnh/file) → kỳ vọng số → báo
lại bằng cách nào. Mục đã xong chuyển xuống cuối file, không xóa.
