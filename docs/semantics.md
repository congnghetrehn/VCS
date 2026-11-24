# Ngữ nghĩa mô phỏng — phần M0

Tài liệu này ghi lại ngữ nghĩa **đã triển khai** ở M0 (P0.1–P0.6): mỗi điểm có
nhãn **VERIFIED** (có test trực tiếp) hoặc **UNVERIFIED** (chưa có test trực
tiếp — suy từ code/spec, không viết như đã chắc). Khi một điểm UNVERIFIED được
test ở milestone sau, đổi nhãn và ghi test vào đây. Mọi điểm đều trỏ về code
hoặc test cụ thể. Kiến trúc tổng thể: xem `docs/architecture.md`.

Quy ước nhãn:

- **VERIFIED** — có test (unit/property/golden/e2e) khẳng định trực tiếp điểm này.
- **UNVERIFIED** — chưa có test trực tiếp; hành vi suy từ code đọc được hoặc từ
  spec. Không dùng điểm này làm bằng chứng nghiệm thu.

## 1. Thời gian — số nguyên ms

**VERIFIED.** Thời gian mô phỏng là số nguyên ms (`SimClock`,
`packages/kernel/src/clock.ts`); `advance(dt)` với `dt` không nguyên hoặc ≤ 0
thì ném. Không có `Date.now`/`Math.random` ở package lõi (lint chặn, test
probe ở `tests/tooling-gates.test.ts`). `stepMs` phải int ≥ 1
(`SimulationOrchestrator` ném `RangeError` nếu sai;
`packages/kernel/src/orchestrator.ts`).

**VERIFIED.** `ManualClock`: `nowMs()`/`advance()`/`reset()`/
`snapshot()`/`restore()` — test ở `packages/kernel/src/clock.test.ts` (5 test).
Đồng hồ wall (`Date.now`) chỉ tồn tại ở `apps/*` (được phép, B10) và được tiêm
vào `Pacer`/`SimulationService` qua hàm `now()` để test dùng đồng hồ giả.

**UNVERIFIED.** `seed` trong `OrchestratorOptions` chưa có tác dụng ở M0 (giữ
lại cho PRNG có seed ở M2; `orchestrator.ts`: "M0 chưa có nguồn ngẫu nhiên
nào"). Tính tất định ở M0 đến từ việc không có nguồn ngẫu nhiên nào, không
phải từ seed.

## 2. Thứ tự một bước

**VERIFIED.** Một bước tại `T`, `dt = stepMs`, thứ tự cố định
(`packages/kernel/src/orchestrator.ts`, `stepOnce()`):

```
beforeExternals(T) → drain inbox (post()) → pha plant → pha controllers
→ pha gateways → tags.flush() → afterStep(T) → clock.advance(dt), stepCount += 1
```

Golden timeline tính tay T1–T8 (`packages/kernel/src/golden-timeline.test.ts`,
2 test) + `orchestrator.test.ts` (33 test) khẳng định thứ tự hook/pha/flush,
thứ tự đăng ký = thứ tự chạy trong pha, id component duy nhất.

**VERIFIED.** Lệnh `post()` gọi giữa các bước chạy ở đầu bước kế, **sau**
`beforeExternals`; lệnh `post()` trong `beforeExternals` chạy cùng bước; lệnh
`post()` trong `step()` của một component chạy ở bước kế (drain chụp inbox lúc
bắt đầu bước, OQ-029). Lệnh ném lỗi → diagnostic `SIM-E001`, các lệnh còn lại
vẫn chạy (OQ-021).

**VERIFIED.** Ném giữa bước → clock không advance, `stepCount` không tăng,
`flush()` không chạy; giá trị TagDB đã ghi giữ nguyên và phát ở `flush()` của
bước thành công sau (OQ-023, `orchestrator.ts` `#finishStep`).

**VERIFIED.** `snapshotAll()` khi hộp thư không rỗng → ném `SIM-E003` ("có
lệnh đang chờ"). `restoreAll()` kiểm `format`/`version`, cùng tập component
id và `namesHash` của TagDB (sai → `SIM-E003`); khôi phục đồng hồ, tag, từng
component theo thứ tự đăng ký, rồi `tags.flush()` + phát `restored`.
`resetAll()` xóa inbox + `faulted`, `clock.reset(0)`, `stepCount = 0`,
`tags.reset()`, `reset()` từng component, `flush()`, phát `reset`. Sau
`resetAll`, cùng cấu hình + seed ⇒ chạy lại cho kết quả giống hệt (property
test hash, P0.4).

## 3. Plant trước controller; trễ 1 bước

**VERIFIED (với component giả; chưa có PlantEngine thật ở M0).** Plant chạy
trước controller trong cùng bước nên PLC thấy giá trị plant của cùng bước `T`;
PLC ghi output ở bước `T` thì plant thấy ở bước `T+dt`. Thứ tự pha được test
bằng `FakeController` đăng ký ở các pha (`packages/test-utils/src/sim.ts`,
`orchestrator.test.ts`). **Chưa có** `PlantEngine` thật ở M0 (M2) — pha `plant`
đang trống trong mọi bundle M0.

**VERIFIED.** Lệnh ghi từ test/UI (`post()` → drain ở đầu bước) có hiệu lực
trong cùng bước: controller đọc được giá trị vừa ghi ngay ở pha `controllers`
của bước đó. Đây là hành vi đã kiểm bằng golden S1 (server): tag `BTN_START`
vừa ghi đổi F→T ở drain bước 11 và `flush()` báo ngay trong bước đó (OQ-054:
delta `[[0,true],[3,true],[6,20]]`).

**UNVERIFIED.** Trễ 1 bước cho chiều controller→plant chưa có test end-to-end
với plant thật (không có plant ở M0); suy từ thứ tự pha cố định ở §2.

## 4. Thông báo thay đổi theo lô tại `flush()`

**VERIFIED.** `set`/`write` cập nhật giá trị ngay; subscriber chỉ được gọi ở
`flush()` cuối bước (`packages/kernel/src/tags.ts`, `flush()`; test
`packages/kernel/src/tags.test.ts`, 42 test):

- Duyệt danh sách dirty không trùng theo **thứ tự handle tăng dần** (M0 §6.4
  quy tắc 3; A17: chỉ duyệt dirty list, O(số tag đổi)).
- Chỉ phát tag **khác giá trị đã flush lần trước** (`oldValue` = giá trị flush
  trước, `newValue` hiện tại, `source` = người ghi cuối, `writes` = số lần ghi
  trong kỳ). Giá trị quay về như cũ trong cùng kỳ → **không phát**.
- Baseline (`lastFlushed`) cập nhật **trước** khi gọi subscriber.
- Subscriber gọi theo thứ tự đăng ký, đồng bộ. Không có subscriber → không
  cấp phát mảng.

**VERIFIED (OQ-015).** Subscriber của `flush()` ném lỗi → **lan truyền** (lỗi
ồn ào, không nuốt — AGENTS.md §7); vì baseline đã cập nhật trước nên thay đổi
đó không bị phát lại ở lần flush sau
(`tags.test.ts`: "subscriber ném lỗi → lan truyền (OQ-015), không nuốt").

**VERIFIED.** `ts` của tag = `clock.nowMs()` lúc ghi. `flush()` với 5 000 tag,
0 thay đổi ≤ 50 µs; với 1 000 thay đổi + 1 sub ≤ 1 ms (bench §12.4, P0.3).

**VERIFIED (OQ-014).** `TagDBOptions` mặc định cả `validate` và
`enforceOwnership` đều `true`; caller bench/production truyền tường minh
`false` (`tags.ts`: "Mặc định cả hai true (OQ-014)").

## 5. Quyền sở hữu tag

**VERIFIED.** Bảng nguồn ghi được phép theo owner (`checkWrite`,
`packages/kernel/src/tags.ts`):

| owner | nguồn được phép |
|---|---|
| `plant` | `plant`, `system` |
| `controller` | `plc`, `system` |
| `free` | `test`, `hmi`, `gateway`, `system` |

Mặc định khi dựng: `kind` DO/AO → `controller`; DI/AI → `free`;
`kind null` → `free` (M2 gọi `setOwner(h, 'plant')` khi gán thiết bị).
Vi phạm khi enforce → `TagError('TAG-E002')`.

**VERIFIED.** Mã gọi từ người dùng (UI/test/gateway) phải gọi `checkWrite`
trước: server `tag.write` kiểm `checkWrite(h, 'hmi')`, denied → lỗi
`TAG-E002` (`apps/server/src/sim-service.ts`); UI: ô non-free có nút
"Ghi thử" gửi `tag.write` thật và nhận `TAG-E002` (A19, e2e E4);
`TagDbIoBus.writeOutputs` ghi bằng source `'plc'`; tag không phải output của
controller → `TAG-E002`; không tồn tại → `TAG-E003`.

**VERIFIED.** TagDB chỉ chứa tag vùng `I`/`Q`; gặp `M`/`DB` ở constructor thì
ném. Tag `M`/`DB` chỉ ở `TagCatalog` (nguồn cho UI/`TagAddressMap` M1).
Handle = chỉ số theo thứ tự định nghĩa, ổn định trong một phiên; UI nhận bảng
ánh xạ ở `tags.snapshot` (handle trong giao thức là chỉ số trong mảng `defs`,
không phải handle nội bộ kernel — thực tế trùng, nhưng UI không được giả
định, M0 §9.1).

**VERIFIED.** Validate khi `validate: true`: `Bool` phải boolean; số nguyên
phải số nguyên trong khoảng kiểu (Int −32768..32767, Word 0..65535, …);
`Real`/`LReal` chấp nhận mọi số (kể cả NaN/±Infinity); `Time` số nguyên; sai
→ `TagError('TAG-E001')` (không sửa lén, không wrap).

## 6. Pacer và tốc độ (không ảnh hưởng logic)

**VERIFIED.** `Pacer` nhận hàm `now()` wall từ ngoài, không gọi
`performance.now` trực tiếp; `plan(simNowMs, stepMs)` trả
`{ steps, lagging, achievedScale }` (`packages/kernel/src/pacer.ts`, test
`pacer.test.ts` 12 test — 1×, 10×, max, tụt, tạm dừng).

Công thức `plan()` (OQ-022 — spec không cho công thức, triển khai tự định
nghĩa và test): chưa `start()` hoặc đang `pause()` → `{0, false, 0}`;
`elapsed = max(0, now() − anchorWall)`;
`achievedScale = elapsed > 0 ? (simNowMs − anchorSim) / elapsed : 0`;
`timeScale = 'max'` → `{steps: ∞, lagging: false, achievedScale}` (service
chạy hết ngân sách lát rồi nhường event loop); ngược lại
`target = anchorSim + elapsed × timeScale`, `due = target − simNowMs`;
`due > maxLagMs` (1 000 ms) → đặt lại mốc, `{0, lagging: true,
achievedScale}`; ngược lại `steps = max(0, floor(due / stepMs))`.

**VERIFIED.** `timeScale` không ảnh hưởng logic mô phỏng: cùng số bước ⇒ cùng
kết quả bất kể tốc độ (tất định qua `TraceHasher.hash()`; test ghim hash
§15.6). Drift event loop ≤ 50 ms ở `timeScale max` (M0 §12.4): đo p95
interval 10 ms trên máy yên 6–7 ms (max 6–10 ms, 5 lần) — ĐẠT với biên lớn;
gate tự động assert cap nới lỏng p95 ≤ 150 ms (chỉ bắt vòng lặp kẹt) +
`stepCount` tăng (A18, OQ-055).

## 7. Lỗi component: `throw` / `isolate`

**VERIFIED.** Policy `'throw'` (mặc định; CLI dùng): lỗi `step()` lan truyền
`SimComponentError(id, phase, T, cause)`. Policy `'isolate'` (server dùng):
component lỗi bị đánh dấu faulted, bỏ qua ở các bước sau, phát
`componentFault` + diagnostic `SIM-E001`
(`orchestrator.ts` `#handleStepError`; test `orchestrator.test.ts`).

**VERIFIED.** Component async trong `stepOnce()` → `SIM-E002`
(`stepOnce()` gặp Promise thì ném, kèm hướng dẫn "chuyển sang
`stepOnceAsync` hoặc viết lại thành đồng bộ"); `stepOnceAsync()` `await` từng
component tuần tự, giữ thứ tự pha; `reset()` trả Promise trong đường đồng bộ
→ `SIM-E002`, dùng `resetAllAsync()` (M0 §15.5 — **không** phải C1
`asyncStep?`/`requiresAsync()` của P0.8).

**UNVERIFIED.** Hành vi faulted component sau `restoreAll()`: snapshot lưu
`faulted[]`, `restoreAll` khôi phục tập faulted — có test restore round-trip
cho tag/component, nhưng chưa có test riêng cho "component đang faulted →
snapshot → restore → vẫn faulted và bị bỏ qua".

## 8. Controller demo `loopback` (không phải PLC thật)

`LoopbackController` (`packages/kernel/src/demo/loopback.ts`, M0 §6.10) là
**demo thay thế** cho SoftPlc (M1): copy input→output, blink, counter. Không
có OB1/timer/FB/DB/interrupt/comms — không dùng để kết luận về PLC thật.

**VERIFIED (OQ-026).** `getDiagnostics().state = 'RUN'` sau `init`,
`lastScanSimMs` khởi đầu `0`, `faults = []`;
`scanPeriodMs = config.scanPeriodMs ?? simulation.plcScanMs`, phải int > 0
(sai → `init` ném); tích lũy `dt` mỗi `step()`,
`while acc ≥ scanPeriodMs: scan, acc −= scanPeriodMs` (nhiều scan/bước nếu
`scanPeriodMs < stepMs`); counter wrap Int
(`((v + step + 32768) mod 65536) − 32768`); snapshot gồm `scanCount`,
`lastScanSimMs`, `blinkNext[]` (giá trị tag đã ở TagDB); `config`: khóa đã
biết (`loopback`/`blink`/`counter`) kiểm tra chặt về dạng/kiểu, khóa lạ bỏ
qua, khóa đã biết sai dạng → `init` ném nêu tên khóa.

**VERIFIED (OQ-032, A17).** I/O thưa: mỗi scan chỉ đọc input và ghi output
của tag có rule (qua TagDB handle; factory truyền `ctx.tags`); output không
có rule giữ nguyên giá trị hiện tại, không bị ghi đè về initial mỗi scan.
Test: output không có rule bị ghi từ ngoài (source `'system'`) vẫn sống qua
các scan.

**VERIFIED.** Bench project "rỗng" (A17): 5 000 tag, 4 controller demo, mỗi
controller 2 rule loopback (tổng 8) + 1 counter + 1 blink; các tag còn lại
không có rule. Ngưỡng orchestrator ≥ 100 000 bước/s **chỉ áp dụng cho project
"rỗng" này** — project thật 2 400 rule chạy chậm hơn theo tuyến tính (mỗi rule
thêm đọc + ghi mỗi bước).

## 9. Giao thức và delta

**VERIFIED.** Một kênh WebSocket JSON, schema zod chung
(`@vcs/schemas/protocol`, `PROTOCOL_VERSION = 1`); version khác → `WS-E001`
rồi đóng 1008. `tags.snapshot` gửi ngay sau `tags.subscribe` (đủ `defs` để UI
ánh xạ handle). `tags.delta` gom last-write-wins theo handle, nhịp 10 Hz
(`apps/server/src/ws.ts`).

**VERIFIED (OQ-054).** Delta giữ cả thay đổi của tag vừa ghi trong cùng kỳ:
golden S1 — tag `BTN_START` vừa ghi đổi F→T ở drain bước 11, `flush()` báo,
delta LWW giữ lại (`[[0,true],[3,true],[6,20]]`). Không lược thay đổi của tag
vừa ghi.

**VERIFIED.** Giới hạn: message > 64 KB → đóng 1009 tường minh (OQ-056);
Origin sai → 403; quá 8 kết nối → 1013; `step` khi đang `RUNNING` → bỏ qua
kèm `error` `WS-E002`.

**UNVERIFIED.** Thứ tự `tags.delta` khi nhiều thay đổi cùng tag trong một kỳ:
LWW giữ giá trị cuối — có test delta gom, nhưng chưa có test khẳng định thứ tự
`changes` trong `tags.delta` theo handle tăng dần (thứ tự này là hệ quả của
`flush()` §4, không phải cam kết giao thức).

## 10. Builder và extension

**VERIFIED (OQ-030).** `createSimulation` nhận interface cấu trúc
`SimulationProject { config, tags, catalog, diagnostics }` định nghĩa trong
`@vcs/kernel` (`builder.ts`) — không import `@vcs/project` (rule
`kernel-deps`); `ProjectModel` thỏa mãn cấu trúc nên caller truyền trực tiếp
được; `makeSim` nhận cùng kiểu.

**VERIFIED.** `project.diagnostics` có error → `createSimulation` ném
`ProjectInvalidError` (kèm danh sách). Controller không có factory →
`SIM-W001` (cảnh báo, bỏ qua controller, mô phỏng vẫn chạy); lỗi `init` →
`SIM-E001`. Extensions chạy tuần tự theo thứ tự mảng.

**UNVERIFIED.** Thứ tự đăng ký extension khi hai extension đăng ký cùng
controller key: factory đăng ký sau ghi đè factory trước (hành vi của
`Map.set` trong `BuildCtx`) — chưa có test; tránh dựa vào hành vi này.
