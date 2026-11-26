# switch_di

> File sinh tự động bởi `pnpm docs:equipment` (`scripts/gen-equipment-docs.ts`). Không sửa tay.

Công tắc/limit/level/zero-speed/pull-cord (M2 §7.6).

Phiên bản: `1.0.0`

## Roles

| Role | Kind | Kiểu | Bắt buộc | Synonyms |
| --- | --- | --- | --- | --- |
| `di` | DI | Bool | có | `DI`, `SWITCH`, `LS` |

## Tham số

| Tham số | Mặc định | Mô tả |
| --- | --- | --- |
| `invert` | `false` |  |
| `onDelayMs` | `0` |  |
| `offDelayMs` | `0` |  |
| `threshold` | `0` |  |
| `hysteresis` | `0` |  |
| `condition` | `"gt"` |  |
| `initialActive` | `false` |  |

## Observables

| Key | Mô tả |
| --- | --- |
| `active` | Trạng thái active sau delay + stuck/chatter, trước invert |
| `di` | Giá trị DI emit (sau invert) |

## Lỗi thiết bị

| ID | Mô tả |
| --- | --- |
| `stuckActive` | Kẹt ở active — di giữ mức active (sau invert) (OQ-289). |
| `stuckInactive` | Kẹt ở inactive — di giữ mức inactive (sau invert) (OQ-289). |
| `chatter` | Rung tiếp điểm — lật active mỗi periodMs (OQ-288). |

## Chuyển đổi

- cond: source bool → cond = value; source số → hysteresis (gt/ge: bật khi x ≥ threshold, tắt khi x ≤ threshold − hysteresis; lt/le: bật khi x ≤ threshold, tắt khi x ≥ threshold + hysteresis).
- cond → onDelayStep → offDelayStep → active → stuckActive/stuckInactive → chatter → di = invert ? !active : active.
- off-delay chỉ giữ khi active trước đó đã true (tránh true giả lúc khởi động khi offDelayMs>0 — bảng E).
- chatter: active XOR (floor((T−sinceMs)/periodMs) % 2 === 1), áp sau delay, trước invert (OQ-288).

## Ghi chú

- kind bắt buộc, không default (vi phạm → PL-E001) — OQ-287.
- pull_cord ép invert=true (params.invert bị bỏ qua); zero_speed ép condition=lt (OQ-287).
- gt/ge dùng hysteresisStep trực tiếp (bật tại x == threshold); lt/le qua -x (bật tại x == threshold).
- Observable active = sau stuck/chatter, trước invert; di = sau invert.
