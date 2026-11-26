# silo_bin

> File sinh tự động bởi `pnpm docs:equipment` (`scripts/gen-equipment-docs.ts`). Không sửa tay.

Silo/bin mức vật liệu (M2 §7.7).

Phiên bản: `1.0.0`

## Roles

| Role | Kind | Kiểu | Bắt buộc | Synonyms |
| --- | --- | --- | --- | --- |
| `levelRaw` | AI | Int | không | `LEVEL_RAW`, `LEVEL`, `LT` |
| `levelHigh` | DI | Bool | không | `LEVEL_HIGH`, `LSH`, `HIGH` |
| `levelLow` | DI | Bool | không | `LEVEL_LOW`, `LSL`, `LOW` |
| `levelHighHigh` | DI | Bool | không | `LEVEL_HIGH_HIGH`, `LSHH` |

## Tham số

| Tham số | Mặc định | Mô tả |
| --- | --- | --- |
| `capacityT` | `100` |  |
| `initialLevelPct` | `30` |  |
| `highPct` | `90` |  |
| `lowPct` | `10` |  |
| `highHighPct` | `97` |  |
| `hystPct` | `2` |  |
| `engMin` | `0` |  |
| `engMax` | `100` |  |
| `levelLagMs` | `0` |  |

## Observables

| Key | Mô tả |
| --- | --- |
| `levelPct` | Mức vật liệu % (đã lag theo levelLagMs) |
| `massT` | Khối lượng trong silo (tấn, không lag) |
| `inflowTph` | Lưu lượng vào (t/h, named source inflow) |
| `outflowTph` | Lưu lượng ra (t/h, named source outflow) |

## Lỗi thiết bị

| ID | Mô tả |
| --- | --- |

## Chuyển đổi

- mass += (inflow − outflow) × dt/3 600 000 (t/h × ms), clamp [0, capacityT]; levelPct = lag(mass/capacityT×100, levelLagMs).
- levelHigh: bật khi levelPct ≥ highPct, tắt khi < highPct − hystPct; levelLow: bật khi ≤ lowPct, tắt khi > lowPct + hystPct; levelHighHigh mirror levelHigh với highHighPct (OQ-291). Ngưỡng tắt nghiêm ngặt (< / >), khác hysteresisStep (≤).
- emit levelRaw = levelPct (đã lag); massT không lag (OQ-291).

## Ghi chú

- inflow/outflow là named sources (OQ-290), mặc định const 0 khi không cấu hình.
- Không có equipment fault (spec §7.7 không liệt kê) — chỉ signal fault trên levelRaw.
