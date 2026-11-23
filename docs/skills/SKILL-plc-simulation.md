# SKILL — Mô phỏng PLC và plant (thuật toán, thời gian, số học)

> Dùng khi: soft-PLC (M1), plant model (M2), vòng mô phỏng (M0), test timeline (M3), adapter lockstep (M5).
> **Spec thắng skill.** Đoạn mã dưới đây là *mẫu minh họa* để hiểu ý, không phải API có thật; ngữ nghĩa chuẩn nằm ở M1 §7–9, M2 §5–7.

## 1. Mô hình thực thi của PLC (cái bạn đang mô phỏng)
```
[đầu chu kỳ]  PII ← ngoại vi (input latch)         ← giá trị input "đóng băng" trong cả chu kỳ
              chạy OB cyclic (OB30–38) đến hạn      ← chạy-đến-hết, không bị OB1 chen giữa (trong mô phỏng)
              chạy OB1 (chương trình chính)         ← đọc PII, đọc/ghi M/DB tức thời, ghi PIQ
[cuối chu kỳ] ngoại vi ← PIQ (output update)        ← output chỉ "ra ngoài" ở cuối chu kỳ
```
- **Khởi động:** OB100 chạy **một lần** trước OB1 đầu tiên (STOP→RUN).
- **Đọc lại `%Q` trong cùng chu kỳ** trả giá trị vừa ghi (PIQ) — mặc định `VERIFY` (thí nghiệm E10).
- **Tức thời:** trong mô phỏng, mọi lệnh tốn 0 thời gian; chu kỳ "xảy ra" tại một mốc sim time.

## 2. Thời gian trong VCS (rời rạc, nguyên ms)
- Một bước tại T: `externals/post → plant.step → controller.step → flush → afterStep → clock += dt`.
- **Plant trước controller**: PLC thấy giá trị plant cùng bước T; plant thấy output PLC từ bước T+dt.
- **Chu kỳ scan** tích lũy: `acc += dt; nếu acc ≥ scanPeriod → chạy 1 scan tại T; acc -= scanPeriod`. Ví dụ `stepMs=10, scan=20`: scan xảy ra ở bước chẵn (theo cấu hình M1 §8.2) — luôn dùng `stepMs = plcScanMs` khi viết ví dụ để tránh mơ hồ.
- **Ví dụ tính tay** (motor, `startDelayMs=500`, `stepMs=scan=10`): scan T=100 ghi `RUN_CMD=1` → plant thấy ở T=110 (`STARTING`) → T=610 `runFb=1` → PLC thấy cùng bước 610 (plant chạy trước). Độ trễ vòng kín = 510 ms, không phải 500.
- Mọi timer dựa `now` của scan; **không** `Date.now`.

## 3. Số học và kiểu dữ liệu kiểu S7 (mẫu minh họa; mặc định theo M1 §7.2)
```ts
const wrapInt   = (x: number) => ((x + 32768) & 0xFFFF) - 32768;  // Int 16 bit hai-bù, wrap
const wrapDInt  = (x: number) => x | 0;                           // DInt 32 bit
const wrapDWord = (x: number) => x >>> 0;                         // DWord/UDInt không dấu
const toReal    = (x: number) => Math.fround(x);                  // Real = float32 SAU MỖI phép tính
function roundHalfEven(x: number): number {                       // REAL→INT: làm tròn chẵn gần nhất
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}
```
- Chia nguyên: cắt về 0 (`Math.trunc`); chia nguyên cho 0 → 0 + `RuntimeFault DIV_ZERO`. Real chia 0 → ±Infinity/NaN (giữ IEEE).
- `Time` = số nguyên ms (DInt). `Bool` là boolean thật, không phải 0/1 (chuyển đổi tường minh).
- **Ranh giới float32:** `TagValue` là `number` (double) nhưng PLC là float32 → `fround` ở **mọi ranh giới** (SoftPlc ghi Q, plant ghi AI, mã hóa S7/OPC UA/Modbus). Test property: `fround(decode(encode(x))) === fround(x)`.
- Thu hẹp kiểu (`Real→Int`) **phải tường minh** (strict) — lỗi biên dịch có gợi ý `REAL_TO_INT`/`TRUNC`.

## 4. Bộ nhớ Siemens
- **Big-endian**: `DataView.setUint16(off, v, false)`. Ghi `%MW0 := 16#1234` ⇒ `%MB0=0x12, %MB1=0x34, %M0.0=false, %M1.2=true` (0x34 = 0011 0100). Test chồng lấn bắt buộc.
- Bit: `%M<byte>.<bit>`, bit 0 = LSB.
- DB standard: Bool gói bit; kiểu ≥ 2 byte bắt đầu ở offset **chẵn**; struct/array bắt đầu & kết thúc chẵn (M1 §3.4, `VERIFY` E11). DB optimized: chỉ symbolic (`sym:`).
- Process image tách khỏi ngoại vi: input latch đầu scan, output ghi cuối scan.

## 5. Thiết kế interpreter
- **IR cây có kiểu, serializable** → **compile một lần thành closure** `(frame) => value`; không duyệt cây mỗi scan.
- Chuyên biệt hóa theo kiểu lúc compile (`addInt`, `addReal`…) thay vì `switch` trong đường nóng.
- Frame: TEMP/local của FC cấp phát **một lần** (pool) và reset giá trị mặc định mỗi lần gọi; instance DB giữ static.
- FB call: copy IN → instance, chạy, copy OUT/INOUT ra; giới hạn độ sâu (mặc định 24), cấm đệ quy (lỗi lúc compile).
- Vòng lặp có giới hạn (`maxLoopIterations`) → `RuntimeFault LOOP_LIMIT`.
- Lỗi runtime = **ghi `RuntimeFault` rồi tiếp tục** (`faultPolicy: continue`), không ném làm sập scan.
- Lệnh chưa hỗ trợ → lỗi **lúc compile** `SCL-U001` kèm vị trí.

## 6. Timer, counter, edge
- **Timer theo timestamp** của scan: lưu `start`, `ET = now − start`; không đếm "số scan". Khi IN đổi hay timer không được gọi vài scan, lần gọi sau dùng `now − start` thực.
```ts
// mẫu minh họa TON (chuẩn: M1 §9.3)
function ton(s: {running:boolean; start:number; ET:number; Q:boolean}, IN: boolean, PT: number, now: number) {
  if (!IN) { s.running = false; s.ET = 0; s.Q = false; return; }
  if (!s.running) { s.running = true; s.start = now; }
  const elapsed = now - s.start;
  if (PT <= 0) { s.ET = 0; s.Q = true; return; }
  s.ET = Math.min(elapsed, PT);
  s.Q = elapsed >= PT;
}
```
- **Edge** (`R_TRIG/F_TRIG`): cần bit nhớ trong instance; khởi tạo `false` ⇒ CLK đã true ở scan đầu sẽ cho `Q=true` một lần (mặc định, `VERIFY` E09).
- **Counter**: phát hiện cạnh nội bộ (`_prevCU`); `R` ưu tiên; biên theo kiểu (Int 32767/−32768).
- **SR/RS**: SR set-dominant; RS reset-dominant — dễ nhầm, có test bảng chân trị.

## 7. LAD/FBD (và SimaticML FlgNet)
- **RLO** bắt đầu `true` ở thanh nguồn trái; contact NO: `rlo &&= v`; NC: `rlo &&= !v`; **nhánh song song = OR**; coil gán `rlo`; Set/Reset có điều kiện.
- Hộp có **EN/ENO**: `EN=false` → không thực thi (trừ timer/counter vốn luôn được gọi mỗi scan, lấy IN từ đầu vào hộp); `ENO=EN` (M1 §5.2).
- FlgNet là **đồ thị**: sắp xếp topo các `Part` theo phụ thuộc dây rồi sinh IR; đừng ép về series/parallel. Mạng có vòng/ chân hở → `SML-E010`.

## 8. Mô hình plant (toán rời rạc, tất định)
```ts
// Lag bậc nhất chính xác theo bước (không phụ thuộc dt nhỏ/lớn)
const lag = (y: number, target: number, dt: number, tau: number) =>
  tau <= 0 ? target : y + (target - y) * (1 - Math.exp(-dt / tau));
// Giới hạn tốc độ thay đổi (ramp biến tần, hành trình van): up/down tính theo đơn vị/ms
const rate = (y: number, target: number, up: number, down: number, dt: number) =>
  y + Math.max(-down * dt, Math.min(up * dt, target - y));
// Tích phân khối lượng silo (t/h × ms → t)
const mass = (m: number, inTph: number, outTph: number, dt: number, cap: number) =>
  Math.min(cap, Math.max(0, m + (inTph - outTph) * dt / 3_600_000));
// Hysteresis (công tắc mức)
const hyst = (prev: boolean, v: number, on: number, off: number) => (prev ? v > off : v >= on);
```
- **PRNG có seed** (không `Math.random`): `mulberry32(hash(seed, equipmentId))`.
```ts
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
```
- **Delay line** (trễ vận chuyển băng tải, signal fault `delay`): ring buffer `n = round(delayMs/dt)` phần tử, không cấp phát mỗi bước.
- **Máy trạng thái thiết bị** (motor: `STOPPED→STARTING→RUNNING→STOPPING`, `TRIPPED`): chuyển trạng thái theo thứ tự kiểm tra cố định (M2 §7.1); `runFb` suy ra từ trạng thái, không lưu riêng.
- **Scaling analog:** `raw = round((eng − engMin)/(engMax − engMin) × 27648)`; kẹp `[−4864, 32511]` (`VERIFY`); lỗi dây → giá trị cấu hình (`32767` mặc định, tùy module).
- **Mọi model:** state JSON-serializable; không cấp phát trong `step`; tag tra bằng chỉ số lúc `init`; duyệt thiết bị theo id/topo.

## 9. Mẫu điều khiển xi măng (để test có ý nghĩa)
- **Seal-in + permissive:** `start` (cạnh) ∧ đủ permissive ∧ không lỗi → chốt chạy; mất permissive/ stop/ lỗi → nhả.
- **Timeout feedback:** `lệnh chạy ∧ ¬runFb` quá `T` (3 s) → lỗi chốt + dừng.
- **Lỗi chốt + reset:** lỗi giữ cho tới `reset` (và điều kiện gốc đã hết).
- **Chuỗi dây chuyền:** khởi động **ngược** chiều vật liệu, dừng **thuận**; trip thiết bị ⇒ dừng nó **và mọi thiết bị thượng nguồn**, hạ nguồn chạy xả.
- **Trễ trip** (áp dầu thấp 5 s, zero-speed 10 s) bằng TON/TOF — dùng để kiểm `within`/`notBefore` ở M3.

## 10. Xác minh ngữ nghĩa
1. **Tính tay timeline** (bảng T, tác động, trạng thái) trước khi code; làm golden.
2. Ghi quy tắc vào `docs/semantics.md` (VERIFIED/UNVERIFIED).
3. So với PLCSIM (M5 conformance); `DIFF` → sửa semantics/runtime có kiểm duyệt.
4. Hai lần chạy cùng `TraceHasher`; snapshot→restore→chạy lại cùng hash.

## 11. Lỗi hay gặp
Timer dùng wall clock · quên latch input đầu scan · ghi `%Q` ra ngoài ngay giữa scan · little-endian · `Int` không wrap · không `fround` Real · `DWord` âm (thiếu `>>> 0`) · edge khởi tạo sai · timer "đóng băng" khi không được gọi · LAD nhánh song song tính AND thay vì OR · hộp EN=false vẫn chạy · plant đọc tag theo tên mỗi bước · thứ tự thiết bị theo `Map` · `Math.random` trong model · độ trễ vòng kín bị bỏ qua khi tính tay.

## 12. Checklist tự kiểm
☐ Có bảng timeline tính tay · ☐ mọi quy tắc số học có test + dòng semantics · ☐ không wall clock/ngẫu nhiên thật · ☐ không cấp phát trong đường nóng · ☐ lệnh chưa hỗ trợ báo lỗi rõ · ☐ hash tái lập · ☐ ranh giới float32 đã `fround`.
