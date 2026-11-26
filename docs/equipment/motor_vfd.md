# motor_vfd

> File sinh tự động bởi `pnpm docs:equipment` (`scripts/gen-equipment-docs.ts`). Không sửa tay.

Động cơ biến tần (VFD) — M2 §7.2.

Phiên bản: `1.0.0`

## Roles

| Role | Kind | Kiểu | Bắt buộc | Synonyms |
| --- | --- | --- | --- | --- |
| `runCmd` | DO | Bool | có | `RUN_CMD`, `START_CMD`, `RUN`, `START`, `CMD` |
| `speedRef` | AO | Int (%) | có | `SPEED_REF`, `SPEED_SP`, `SPEED_SET`, `SOLLWERT` |
| `runFb` | DI | Bool | có | `RUN_FB`, `RUNNING`, `RUN_ST`, `AUX`, `RUN_FBK` |
| `speedFb` | AI | Int (%) | có | `SPEED_FB`, `SPEED`, `SPEED_ACT`, `SPEED_FBK`, `ISTWERT` |
| `ready` | DI | Bool | không | `READY`, `RDY`, `MCB_OK`, `BREAKER_ON` |
| `vfdFaultOk` | DI | Bool | không | `VFD_OK`, `VFD_FAULT_OK`, `DRIVE_OK`, `FAULT_OK` |
| `remote` | DI | Bool | không | `REMOTE`, `REM`, `AUTO_SEL` |
| `currentFb` | AI | Int (A) | không | `CUR`, `CURRENT`, `AMP`, `I_ACT` |

## Tham số

| Tham số | Mặc định | Mô tả |
| --- | --- | --- |
| `accelTimeS` | `10` | Thời gian tăng tốc 0→100% (s). |
| `decelTimeS` | `10` | Thời gian giảm tốc 100→0% (s). |
| `minSpeedPct` | `0` | Tốc độ nhỏ nhất cho phép (%). |
| `maxSpeedPct` | `100` | Tốc độ lớn nhất cho phép (%). |
| `runThresholdPct` | `2` | Ngưỡng tốc độ để runFb = true (%). |
| `speedFbLagMs` | `200` | Hằng số thời gian lag của speedFb (ms). |
| `coastTimeS` | `20` | Thời gian quán tính khi trip/ngắt (s). |
| `ratedCurrentA` | `0` | Dòng định mức (A); 0 = không mô phỏng dòng. |
| `loadFraction` | `0.7` | Tỷ lệ tải (0..1). |
| `faultNC` | `true` | vfdFaultOk = true khi bình thường (tiếp điểm NC) — OQ-269. |

## Observables

| Key | Mô tả |
| --- | --- |
| `speedPct` | Tốc độ % (0..100) |
| `targetPct` | Tốc độ đích hiệu dụng % (sau clamp/lệch lỗi) |
| `currentA` | Dòng điện (A) |
| `running` | Đang chạy (speedPct > runThresholdPct) |
| `state` | Trạng thái máy (STOPPED/RAMP_UP/AT_SPEED/RAMP_DOWN/TRIPPED) |

## Lỗi thiết bị

| ID | Mô tả |
| --- | --- |
| `vfdTrip` | Biến tần trip — target về 0, giảm tốc theo coastTimeS. |
| `rampFail` | Lỗi ramp — tốc độ đứng yên giá trị hiện tại. |
| `speedDeviation` | Lệch tốc độ — target lệch ±pct (OQ-270). |
| `commLoss` | Mất truyền thông — latch lệnh, speedFb đóng băng, ready=false (OQ-271). |
| `notReady` | Không sẵn sàng — không cho chạy. |
| `localMode` | Chế độ local — PLC không điều khiển được. |

## Trạng thái

| Trạng thái | Mô tả |
| --- | --- |
| `STOPPED` | Dừng — tốc độ ≈ 0, target = 0. |
| `RAMP_UP` | Đang tăng tốc về phía target. |
| `AT_SPEED` | Đã đạt target (|speed − target| ≤ 1e-9). |
| `RAMP_DOWN` | Đang giảm tốc về phía target (hoặc về 0). |
| `TRIPPED` | Đã trip — giảm tốc theo coastTimeS, ready/vfdFaultOk = false. |

## Chuyển đổi

- vfdTrip active → TRIPPED (bất kỳ state nào).
- TRIPPED: trip clear → RAMP_DOWN (speed > 0) hoặc STOPPED (speed ≈ 0).
- target > 0: |speed − target| ≤ 1e-9 → AT_SPEED; speed < target → RAMP_UP; speed > target → RAMP_DOWN.
- target = 0: speed ≈ 0 → STOPPED, còn lại RAMP_DOWN.
- So sánh tốc độ bằng eps 1e-9 (float tích lũy 0.1/bước không ra đúng 50.0) — OQ-273.

## Ghi chú

- speedFb = lag(speed, speedFbLagMs), offset(fault) = 0 (OQ-268); speedDeviation lệch target, không cộng offset riêng.
- currentA = ratedCurrentA × loadFraction × speedPct/100 khi speed > 0, ngược lại 0 (OQ-274, UNVERIFIED chờ S1).
- commLoss latch lệnh lúc fault bật, speedFb đóng băng tại giá trị lúc fault bật (OQ-271).
- running = speedPct > runThresholdPct (cùng ngưỡng với runFb).
- T=300 bảng A: speed tích lũy float 2.0000000000000004 > 2 → runFb = true (bẫy float, không sửa theo toán exact).
