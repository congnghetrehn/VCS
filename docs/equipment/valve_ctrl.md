# valve_ctrl

> File sinh tự động bởi `pnpm docs:equipment` (`scripts/gen-equipment-docs.ts`). Không sửa tay.

Van điều khiển vị trí theo posRef (M2 §7.4).

Phiên bản: `1.0.0`

## Roles

| Role | Kind | Kiểu | Bắt buộc | Synonyms |
| --- | --- | --- | --- | --- |
| `posRef` | AO | Int (%) | có | `POS_REF`, `POS_SP`, `POS_SET`, `SOLLWERT` |
| `posFb` | AI | Int (%) | có | `POS_FB`, `POS`, `POS_ACT`, `POS_FBK`, `ISTWERT` |
| `fault` | DI | Bool | không | `FAULT`, `FAULT_DI`, `ALARM` |
| `closedLs` | DI | Bool | không | `CLOSED_LS`, `CLOSE_LS`, `CLOSED_LIMIT`, `LS_CLOSED` |
| `openLs` | DI | Bool | không | `OPEN_LS`, `OPEN_LIMIT`, `LS_OPEN` |

## Tham số

| Tham số | Mặc định | Mô tả |
| --- | --- | --- |
| `strokeTimeS` | `20` |  |
| `lagMs` | `0` |  |
| `deadbandPct` | `0.5` |  |
| `failPosition` | `"hold"` |  |
| `initialPosPct` | `0` |  |
| `posFbRange` | `[object Object]` |  |
| `faultNC` | `false` |  |

## Observables

| Key | Mô tả |
| --- | --- |
| `posPct` | Vị trí van % (0..100) |
| `targetPct` | Vị trí đích hiệu dụng % (sau deadband/lỗi) |

## Lỗi thiết bị

| ID | Mô tả |
| --- | --- |
| `stuck` | Kẹt — pos đóng băng tại giá trị hiện tại. |
| `drift` | Trôi vị trí sau bước rate-limit (OQ-281). |
| `positionerFail` | Hỏng positioner — posFb đóng băng + target latch (OQ-282). |
| `signalLoss` | Mất tín hiệu posRef — về failPosition (OQ-283). |

## Chuyển đổi

- target = |posRef − pos| > deadband ? clamp(posRef, 0, 100) : pos (dừng trong deadband — bảng C: 79.55, không đạt 80).
- pos đuổi target bằng rate limiter 100/(strokeTimeS×1000); posFb = lag(pos, lagMs).
- positionerFail: posFb đóng băng + target latch tại giá trị lúc fault bật (OQ-282).
- signalLoss: posRef hiệu dụng = failPosition (hold → pos hiện tại, close → 0, open → 100) — OQ-283.
- drift: sau bước rate-limit, pos += pctPerHour/3600000 × dtMs (OQ-281).

## Ghi chú

- closedLs/openLs ngưỡng cố định 1% (OQ-280): closedLs = pos ≤ 1, openLs = pos ≥ 99.
- fault DI = OR mọi equipment fault đang active, polarity theo faultNC (default false) — OQ-275.
