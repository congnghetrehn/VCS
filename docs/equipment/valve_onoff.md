# valve_onoff

> File sinh tự động bởi `pnpm docs:equipment` (`scripts/gen-equipment-docs.ts`). Không sửa tay.

Van đóng/mở kèm limit switch (M2 §7.3).

Phiên bản: `1.0.0`

## Roles

| Role | Kind | Kiểu | Bắt buộc | Synonyms |
| --- | --- | --- | --- | --- |
| `openCmd` | DO | Bool | có | `OPEN_CMD`, `OPEN`, `START_OPEN` |
| `closeCmd` | DO | Bool | không | `CLOSE_CMD`, `CLOSE` |
| `openLs` | DI | Bool | có | `OPEN_LS`, `OPEN_LIMIT`, `LS_OPEN` |
| `closedLs` | DI | Bool | có | `CLOSED_LS`, `CLOSE_LS`, `CLOSED_LIMIT`, `LS_CLOSED` |
| `fault` | DI | Bool | không | `FAULT`, `FAULT_DI`, `ALARM` |

## Tham số

| Tham số | Mặc định | Mô tả |
| --- | --- | --- |
| `travelTimeMs` | `5000` |  |
| `singleSolenoid` | `false` |  |
| `lsThresholdPct` | `1` |  |
| `initialPosPct` | `0` |  |
| `bothCmdPolicy` | `"hold"` |  |
| `faultNC` | `false` |  |

## Observables

| Key | Mô tả |
| --- | --- |
| `posPct` | Vị trí van % (0..100) |
| `moving` | Van đang chuyển động (dir != 0) |
| `state` | Trạng thái van (CLOSED/OPENING/OPEN/CLOSING/INTERMEDIATE) |

## Lỗi thiết bị

| ID | Mô tả |
| --- | --- |
| `stuckOpen` | Kẹt mở — ép pos=100 (OQ-278). |
| `stuckClosed` | Kẹt đóng — ép pos=0 (OQ-278). |
| `stuckAtPos` | Đóng băng pos tại giá trị lúc fault bật (OQ-278). |
| `slowTravel` | Chạy chậm — travelTime hiệu dụng × factor (OQ-279). |
| `travelTimeout` | Không đạt vị trí cuối — pos đóng băng + fault=true (OQ-276). |
| `lsOpenFail` | Limit switch mở luôn false. |
| `lsClosedFail` | Limit switch đóng luôn false. |

## Trạng thái

| Trạng thái | Mô tả |
| --- | --- |
| `CLOSED` | Đóng — pos ≈ 0. |
| `OPENING` | Đang mở (dir +1, pos ở giữa). |
| `OPEN` | Mở — pos ≈ 100. |
| `CLOSING` | Đang đóng (dir −1, pos ở giữa). |
| `INTERMEDIATE` | Ở giữa, không lệnh (dir = 0). |

## Chuyển đổi

- pos == 0 → CLOSED; pos == 100 → OPEN; dir +1 → OPENING; dir −1 → CLOSING; còn lại INTERMEDIATE.
- Cả hai lệnh cùng true (double solenoid) → hold + warn 1 lần (OQ-277).
- stuckOpen → pos=100; stuckClosed → pos=0; stuckAtPos → đóng băng tại pos lúc fault bật (OQ-278).

## Ghi chú

- fault DI = OR mọi equipment fault đang active, polarity theo faultNC (default false) — OQ-275.
- travelTimeout: fault inject, pos đóng băng + fault=true, không có watchdog tự động (OQ-276).
- slowTravel: travelTime hiệu dụng = travelTimeMs × factor (OQ-279).
