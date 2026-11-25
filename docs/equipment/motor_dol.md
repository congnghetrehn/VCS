# motor_dol

> File sinh tự động bởi `pnpm docs:equipment` (`scripts/gen-equipment-docs.ts`). Không sửa tay.

Động cơ khởi động trực tiếp (DOL) — M2 §7.1.

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

## Observables

| Key | Mô tả |
| --- | --- |
| `state` | Trạng thái máy (STOPPED/STARTING/RUNNING/STOPPING/TRIPPED) |
| `speedPct` | Tốc độ % (0..100) |
| `currentA` | Dòng điện (A) |
| `running` | Đang chạy (speedPct > 5) |
| `energized` | Contactor đang hút (STARTING/RUNNING) |

## Lỗi thiết bị

| ID | Mô tả |
| --- | --- |
| `overload` | Quá tải — trip sau tripDelayMs kể từ khi lỗi bật. |
| `failToStart` | Không khởi động được — lệnh bị bỏ qua, không dòng. |
| `contactorStuck` | Contactor dính — giữ RUNNING dù hết lệnh. |
| `notReady` | Không sẵn sàng — không cho chạy. |
| `localMode` | Chế độ local — PLC không điều khiển được. |

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

## Ghi chú

- canRun chỉ tính từ fault (localMode/notReady); ready/remote là đầu ra emit, không đọc tag (OQ-259).
- defaultRemote/defaultReady được chấp nhận trong params nhưng không ảnh hưởng hành vi ở P2.2 — chờ dữ liệu motor thật xác minh (S1).
- Một chuyển đổi duy nhất mỗi bước (OQ-255); speed/current tính theo state sau chuyển đổi (OQ-256).
