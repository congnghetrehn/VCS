# conveyor_simple

> File sinh tự động bởi `pnpm docs:equipment` (`scripts/gen-equipment-docs.ts`). Không sửa tay.

Băng tải đơn giản — motor_dol + vật liệu trễ vận chuyển (M2 §7.8).

Phiên bản: `1.0.0`

## Roles

| Role | Kind | Kiểu | Bắt buộc | Synonyms |
| --- | --- | --- | --- | --- |
| `runCmd` | DO | Bool | có | `RUN_CMD`, `START_CMD`, `RUN`, `START`, `CMD`, `BETRIEB_BEFEHL` |
| `runFb` | DI | Bool | có | `RUN_FB`, `RUNNING`, `RUN_ST`, `AUX`, `RUN_FBK`, `RUECKMELDUNG` |
| `ready` | DI | Bool | không | `READY`, `RDY`, `MCB_OK`, `BREAKER_ON` |
| `remote` | DI | Bool | không | `REMOTE`, `REM`, `AUTO_SEL` |
| `overloadOk` | DI | Bool | không | `OVL_OK`, `OL_OK`, `THERMAL_OK`, `OVERLOAD_OK`, `OVL` |
| `currentFb` | AI | Int (A) | không | `CUR`, `CURRENT`, `AMP`, `I_ACT` |
| `zeroSpeed` | DI | Bool | không | `ZERO_SPEED`, `ZERO_SPD`, `ZS`, `NO_SPEED`, `BELT_STOP` |
| `pullCord` | DI | Bool | không | `PULL_CORD`, `PULLCORD`, `CORD_SWITCH`, `EMERGENCY_PULL` |

## Tham số

| Tham số | Mặc định | Mô tả |
| --- | --- | --- |
| `startDelayMs` | `500` | Thời gian từ lệnh chạy đến khi runFb lên (ms). |
| `stopDelayMs` | `800` | Thời gian từ khi hết lệnh đến khi runFb về false (ms). |
| `accelTimeMs` | `1500` | Thời gian tăng tốc 0→100% (ms). |
| `coastTimeMs` | `3000` | Thời gian quán tính giảm tốc 100→0% (ms). |
| `tripDelayMs` | `0` | Trễ từ khi lỗi overload bật đến khi trip (ms). |
| `overloadResetMs` | `1000` | Thời gian chờ sau khi clear overload trước khi reset (ms). |
| `resetRequiresCmdOff` | `true` | Reset sau trip có yêu cầu runCmd = false không. |
| `overloadNC` | `true` | overloadOk = true khi bình thường (tiếp điểm NC). |
| `ratedCurrentA` | `0` | Dòng định mức (A); 0 = không mô phỏng dòng. |
| `noLoadCurrentFrac` | `0.35` | Tỷ lệ dòng không tải so với dòng định mức (0..1). |
| `loadFraction` | `0.8` | Tỷ lệ tải (0..1). |
| `inrushMult` | `6` | Hệ số dòng khởi động (≥ 1). |
| `inrushMs` | `1000` | Thời gian dòng khởi động giảm về 0 (ms). |
| `defaultRemote` | `true` | Giá trị remote mặc định (P2.2: chưa dùng — xem OQ-259). |
| `defaultReady` | `true` | Giá trị ready mặc định (P2.2: chưa dùng — xem OQ-259). |
| `zeroSpeedThresholdPct` | `5` | Ngưỡng beltSpeed (%) dưới đó zeroSpeed = true. |
| `transportDelayMs` | `20000` | Trễ vận chuyển vật liệu (ms). |
| `loadTph` | `0` | Lưu lượng tải mặc định (t/h) khi không cấu hình named source load. |
| `pullCordHardwired` | `true` | Pull-cord đấu cứng: trip thì contactor rơi như notReady. |

## Observables

| Key | Mô tả |
| --- | --- |
| `state` | Trạng thái máy (STOPPED/STARTING/RUNNING/STOPPING/TRIPPED) |
| `speedPct` | Tốc độ % (0..100) |
| `currentA` | Dòng điện (A) |
| `running` | Đang chạy (speedPct > 5) |
| `energized` | Contactor đang hút (STARTING/RUNNING) |
| `beltSpeedPct` | Tốc độ băng % (0 khi beltSlip) |
| `deliveredTph` | Lưu lượng ra khỏi băng (t/h, sau trễ vận chuyển) |

## Lỗi thiết bị

| ID | Mô tả |
| --- | --- |
| `overload` | Quá tải — trip sau tripDelayMs kể từ khi lỗi bật. |
| `failToStart` | Không khởi động được — lệnh bị bỏ qua, không dòng. |
| `contactorStuck` | Contactor dính — giữ RUNNING dù hết lệnh. |
| `notReady` | Không sẵn sàng — không cho chạy. |
| `localMode` | Chế độ local — PLC không điều khiển được. |
| `beltSlip` | Trượt băng — beltSpeed = 0, zeroSpeed = true. |
| `pullCordTrip` | Giật dây kéo khẩn cấp — pullCord = false; nếu pullCordHardwired thì contactor rơi như notReady. |
| `beltBlocked` | Băng kẹt — deliveredTph = 0, delay line đóng băng (OQ-293). |

## Preset

| Preset | Lỗi | Mô tả |
| --- | --- | --- |
| `noRunFeedback` | signal stuck trên `runFb` | Mất phản hồi chạy |
| `feedbackStuckOn` | signal stuck trên `runFb` | Phản hồi kẹt ở mức chạy |
| `overloadTrip` | equipment `overload` | Quá tải |
| `commandLost` | signal lost trên `runCmd` | Mất lệnh chạy |

## Trạng thái

| Trạng thái | Mô tả |
| --- | --- |
| `STOPPED` | Dừng — contactor nhả, runFb = false. |
| `STARTING` | Đang khởi động — contactor đã hút, chờ đủ startDelayMs. |
| `RUNNING` | Đang chạy — runFb = true. |
| `STOPPING` | Đang dừng — chờ đủ stopDelayMs, runFb vẫn true. |
| `TRIPPED` | Đã trip do quá tải — runFb = false, overloadOk báo lỗi. |

## Chuyển đổi

- 1. overload active và state ∈ {STARTING, RUNNING}: sau tripDelayMs kể từ lúc lỗi bật → TRIPPED.
- 2. STOPPED: runCmd && canRun && !failToStart → STARTING (t0 = T).
- 3. STARTING: !runCmd → STOPPED; T − t0 ≥ startDelayMs → RUNNING.
- 4. RUNNING: !runCmd && !contactorStuck → STOPPING (t1 = T).
- 5. STOPPING: T − t1 ≥ stopDelayMs → STOPPED; runCmd trong lúc STOPPING bị bỏ qua.
- 6. TRIPPED: !overload active && T − clearedAt ≥ overloadResetMs && (!resetRequiresCmdOff || !runCmd) → STOPPED.
- pullCordTrip active && pullCordHardwired: cmd runCmd bị ép false (như notReady) — motor STOPPING → STOPPED (OQ-292).
- beltSpeed = fault(beltSlip) ? 0 : speedPct (sau step motor); zeroSpeed = beltSpeed < zeroSpeedThresholdPct (so sánh nghiêm ngặt <).
- load = named source load nếu đã cấu hình, ngược lại params.loadTph (OQ-294); input = load × beltSpeed/100; deliveredTph = delay(input, transportDelayMs) qua ring buffer inline {buf, idx}, n = round(transportDelayMs/dtMs) bước, khởi tạo 0.
- beltBlocked active: deliveredTph = 0 và delay line đóng băng (không dịch, không nhận input mới); hết fault thì chạy tiếp từ trạng thái đã đóng băng (OQ-293).
- transportDelayMs = 0 → không trễ: deliveredTph = input ngay trong bước.

## Ghi chú

- Derive từ motor_dol bằng deriveModel — kế thừa 6 role, 15 param, 5 state, 6 luật, 5 fault, 4 preset (OQ-292).
- Step wrapper cấp phát 1 proxy ctx mỗi bước/conveyor — ngoại lệ không-cấp-phát duy nhất, bench đo (OQ-292).
- Ring buffer inline trong state (buf/idx) — DelayLine là class nên không ở được trong state model (không JSON-serializable).
- Synonym zeroSpeed/pullCord theo quy ước hậu tố mirror §7.1 (OQ-301: spec §7.2–7.8 không có bảng synonym).
