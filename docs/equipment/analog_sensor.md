# analog_sensor

> File sinh tự động bởi `pnpm docs:equipment` (`scripts/gen-equipment-docs.ts`). Không sửa tay.

Cảm biến tương tự (M2 §7.5).

Phiên bản: `1.0.0`

## Roles

| Role | Kind | Kiểu | Bắt buộc | Synonyms |
| --- | --- | --- | --- | --- |
| `raw` | AI | Int | có | `RAW`, `PV`, `VALUE`, `MEAS` |

## Tham số

| Tham số | Mặc định | Mô tả |
| --- | --- | --- |
| `tauMs` | `0` |  |
| `noiseStd` | `0` |  |

## Observables

| Key | Mô tả |
| --- | --- |
| `pv` | Giá trị đo đã lọc (eng, chưa cộng noise) |
| `raw` | Giá trị raw int (eng→raw theo engMin/engMax, chưa qua signal fault) |

## Lỗi thiết bị

| ID | Mô tả |
| --- | --- |

## Preset

| Preset | Lỗi | Mô tả |
| --- | --- | --- |
| `wireBreak` | signal wireBreak trên `raw` | Đứt dây — raw=32767 (wireBreakRaw mặc định). |
| `drift` | signal drift trên `raw` | Trôi — signal fault drift trên role raw (rate theo params, mặc định 0). |
| `stuck` | signal stuck trên `raw` | Kẹt — signal fault stuck trên role raw (cần params.value để có hiệu lực). |
| `noisy` | signal noise trên `raw` | Nhiễu — signal fault noise trên role raw (std theo params, mặc định 0). |

## Chuyển đổi

- pv_target = source(); pv = lag(pv, pv_target, tauMs); eng_out = pv + noise; emit(raw, eng_out).
- noise Gaussian Box–Muller, 2 rand()/bước, σ=noiseStd; noiseStd==0 → không gọi rand() (OQ-285).
- Không có equipment fault — signal fault drift/stuck/freeze/noise/spike/wireBreak/offset/gain trên role raw.

## Ghi chú

- engMin/engMax/unit bắt buộc, engMin < engMax (vi phạm → PL-E001) — OQ-284.
- pv khởi tạo = initialValue ?? 0 (mọi loại source) — OQ-286.
- Observable raw = eng→raw của eng_out (chưa qua signal fault); tag raw chịu signal fault.
- Công thức noise + preset vẫn UNVERIFIED chờ S1 (OQ-285).
