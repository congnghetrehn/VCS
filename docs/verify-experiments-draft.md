# Danh sách thí nghiệm VERIFY — bản nháp (P1.7)

> **Trạng thái: BẢN NHÁP — chưa chạy thí nghiệm nào trong P1.7.**
> Mọi mục dưới đây chờ chủ sản phẩm chạy trên PLCSIM Advanced (hoặc PLCSIM /
> TIA) với mã thật (spike S1, OWNER-INBOX X-002) hoặc project TIA nhỏ.
> Mỗi thí nghiệm: dựng chương trình TIA tương đương, quan sát hành vi thật,
> so với cột "Hành vi hiện tại (mặc định)" — nếu khác, ghi **SCR** (Spec Change
> Request) vào `docs/open-questions.md`, cập nhật `AMENDMENTS.md` **trước**
> khi sửa code/golden; không âm thầm đổi kỳ vọng. Sau khi xác nhận, đổi
> `expectedFrom` của golden tương ứng thành `plcsim` và nhãn trong
> `docs/semantics.md` thành VERIFIED.
>
> Nguồn: M1 §14 (14 mục) + các điểm UNVERIFIED trong `docs/semantics.md`
> §§12–18. Golden ghim hành vi hiện tại được nêu để biết file nào sẽ đổi
> nếu kết quả thật khác.

## M1 §14 (14 mục, theo thứ tự spec)

| # | Thí nghiệm (TIA/PLCSIM) | Hành vi hiện tại (mặc định) | Golden ghim |
|---|---|---|---|
| 1 | INT: `32767 + 1` trong SCL → kết quả? ENO? (wrap hay giữ?) | Wrap về −32768, chỉ đặt `frame.ov` (không fault) — M1 §7.2, OQ-135 | `arith-overflow-int` |
| 2 | DINT/INT chia 0 → kết quả, CPU có STOP không | Kết quả 0 + `DIV_ZERO` (tiếp tục chạy) | `arith-div-zero`, `arith-mod-zero` |
| 3 | `REAL_TO_INT(2.5)`, `(3.5)`, `(−2.5)`; gán ngầm `Int := Real` có lỗi biên dịch không | Round-half-even (2, 4, −2); gán ngầm Real→Int → T010 (strict) | `arith-convert-real-int`, `arith-power` |
| 4 | `NORM_X`/`SCALE_X` với VALUE ngoài khoảng (có kẹp không) | Không kẹp (khác `LIMIT`); `SCALE_X` ra nguyên làm tròn như `ROUND` | `arith-norm-scale` (xem §15) |
| 5 | TON: PT=T#0s; IN dao động; timer **không được gọi** vài scan rồi gọi lại (Q có "nhảy" không) | PT=0 → Q=IN ngay, ET=0; không gọi → đóng băng theo timestamp: gọi lại ET nhảy tới thời gian đã trôi (OQ-169) | `timer-ton-pt0`, `timer-ton-oscillate`, `timer-ton-not-called` |
| 6 | TP: IN giữ true sau khi hết xung (có kích lại không) | Không kích lại; ET giữ PT tới khi IN xuống | `timer-tp-hold-in`, `timer-tp-retrigger` |
| 7 | TOF: IN true→false→true trong lúc đếm | Rising giữa chừng hủy đếm (ET về 0, Q=true) | `timer-tof-retrigger` |
| 8 | CTU/CTD/CTUD: biên max/min, thứ tự ưu tiên R/LD, CU và CD cùng cạnh | Kẹp CV 32767/−32768; R thắng LD và thắng đếm cùng scan; CU+CD cùng cạnh → không đổi | `counter-ctu-max`, `counter-ctd-min`, `counter-ctud-both`, `counter-ctud-priority` |
| 9 | `R_TRIG` ở scan đầu sau STOP→RUN khi CLK đã true (Q?) | `_m` khởi tạo false → Q=true ở scan đầu; sau STOP→RUN giữ `_m` (CLK=true → Q=false) | `edge-rtrig-first-scan`, `edge-rtrig-restart` |
| 10 | Đọc lại `%Q` trong cùng scan sau khi ghi (PIQ) | Trả giá trị vừa ghi (ghi PIQ, đọc lại thấy ngay) | `bitlogic-read-q-same-scan` |
| 11 | Layout DB standard: struct có Bool xen kẽ Byte/Word/LReal (so offset thực tế) | LReal căn chẵn (không căn 8, OQ-084); Array of Bool gói bit, bắt đầu/kết thúc chẵn (OQ-083) | Bảng B/C P1.1 (`layout.test.ts`) |
| 12 | Độ sâu gọi tối đa, nhiều biến TEMP không khởi tạo (giá trị rác hay 0) | `maxCallDepth` mặc định 24 → `CALL_DEPTH`; TEMP về mặc định kiểu (0/false) + cảnh báo W001 khi đọc trước ghi | `flow-call-depth`, golden TEMP (xem §15) |
| 13 | Array index ngoài khoảng (đọc/ghi): hành vi CPU | Đọc → giá trị mặc định kiểu + `ARRAY_RANGE`; ghi → bỏ qua + `ARRAY_RANGE` | `memory-array-oob-read`, `memory-array-oob-write` |
| 14 | Cyclic OB (OB35) khi chu kỳ không chia hết scan OB1 | Chạy khi `floor((t−phase)/period)` tăng, tối đa 1 lần/scan; trễ → `CYCLE_OVERRUN` (đếm số kỳ trễ) | `scan-cyclic-ob35`, `scan-cyclic-phase` |

## Ngoài M1 §14 (UNVERIFIED trong semantics §§12–18)

| # | Thí nghiệm | Hành vi hiện tại (mặc định) | Golden ghim |
|---|---|---|---|
| 15 | `**` kết hợp phải hay trái; unary `-`/`NOT` ưu tiên | Phải (`2 ** 3 ** 2` = 512); `**` có kiểu Real (OQ-092) | Bảng B P1.2 (`parser.test.ts`), `arith-power` |
| 16 | Tập `X_TO_Y` / `BOOL_TO_*` đầy đủ (SInt/USInt/UInt/UDInt/Time) | Chỉ Int/DInt/Byte/Word/DWord cho `BOOL_TO_*` (OQ-115); `X_TO_Y` cho SInt/USInt/UInt/UDInt/Time chưa nhận (chờ S1) | `scl/typecheck.test.ts` (intrinsics) |
| 17 | `#fb.IN := ...` (gán vào input của instance FB từ ngoài) | Cho phép (member là field của DB instance; chỉ cấm gán input của chính block — OQ-129) | `typecheck.test.ts` (OQ-129) |
| 18 | FC trả giá trị bằng cách gán tên FC | Gán tên FC → biến local tổng hợp trong `interface.temp` (OQ-112) | `lower.test.ts` (FC return) |
| 19 | Lưới scan đều vs scan theo thời gian thực | Lưới đều `lastScanTime + k*period`, scan đầu ở 10 ms khi period 10 (OQ-130) | `scan-*` goldens |
| 20 | Đánh số DB 1..n theo tên sắp xếp | DB numbers 1..n theo id sắp xếp lúc `load()` (OQ-136) | `softplc.test.ts` (DB numbering) |
| 21 | OV/ENO sau tràn số học / lỗi chuyển đổi | Tràn Int chỉ đặt `ov` (không fault); `CONV_RANGE` khi convert ngoài khoảng | `arith-overflow-int`, `arith-convert-*` |
| 22 | TONR ET có clamp ở PT không | KHÔNG clamp: ET=1200 khi IN rớt sau khi vượt PT=1000 (P-S6 ghim; §9.3 không có clamp) | `P-S6` (`softplc-std.test.ts`), `timer-tonr-over-pt` |
| 23 | LAD: `pos`/`neg` có ≡ R_TRIG/F_TRIG không; RLO sau box std (nhất là CTUD→QU); EN-gating (timer có chạy khi EN=false) | `pos`/`neg` ≡ edge; RLO sau box theo bảng OQ-184 (CTUD→QU); std box luôn chạy, box toán chỉ chạy khi EN (OQ-185) | Golden LAD D/G/J/L |
| 24 | LAD: instance DB cho LAD FB (DB nào, layout nào) | Instance DB phải khai bằng SCL trước (OQ-214); LAD dùng `local`/`dbField` | `lad-box-ton`, golden LAD |
| 25 | Comment `(* *)` có lồng không; time literal đơn vị lạ | Không lồng (tới `*)` đầu tiên, phần còn lại → SCL-L001); đơn vị lạ → SCL-L001 | Bảng D P1.2 (D6, D7) |
| 26 | Thứ tự ưu tiên toán tử còn lại (`*`/`/`/`MOD`/`DIV` > `+`/`-` > so sánh > `AND` > `OR`/`XOR`) | Theo M1 §4.3, ghim bằng bảng B P1.2 (15 case) | `parser.test.ts` bảng B |
| 27 | `seed` Orchestrator; trễ 1 bước controller→plant; thứ tự `tags.delta`; thứ tự đăng ký extension trùng; faulted component sau `restoreAll()` | Xem semantics §§1–10 (UNVERIFIED, M0) | — (M0, không thuộc M1) |

## Cách chạy (khi chủ sản phẩm sẵn sàng)

1. Dựng project TIA nhỏ (S7-1500, PLCSIM Advanced) cho từng mục — mỗi mục
   là một OB/FB ngắn, quan sát bằng Watch table của TIA (không cần SCADA).
2. Ghi kết quả vào bảng trên (thêm cột "Kết quả PLCSIM" + ngày + người chạy).
3. Mục nào khác mặc định → SCR vào `docs/open-questions.md` → AMENDMENTS →
   sửa code/golden → gate lại → đổi `expectedFrom` thành `plcsim`.
4. Mục nào khớp → đổi nhãn semantics thành VERIFIED + ghi test vào đây.
