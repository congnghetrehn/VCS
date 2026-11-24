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

## 11. Vá giao diện P0.8 (M4/M5 áp trước)

**VERIFIED (OQ-075).** `validateTagValue(type, v)` (`@vcs/kernel`, `tags.ts`)
trả `undefined` khi hợp lệ, `{ kind: 'TYPE' | 'RANGE', message }` khi sai:
TYPE = sai kiểu JS (Bool cần boolean, String cần string, kiểu số cần number);
RANGE = number ngoài khoảng kiểu hoặc không nguyên với kiểu nguyên; Real/LReal
chấp nhận mọi số kể cả NaN/±Infinity; Time: số nguyên ≥ 0. Hàm không chuẩn hóa
(`Math.fround`, `>>> 0` chỉ trong `TagDB.write`). `validateValue` nội bộ dùng
lại hàm này nên thông điệp `TAG-E001` giữ nguyên văn bản cũ.

**VERIFIED (OQ-081).** Hai bảng `TYPE_RANGES` (kernel cho `TagDB`, schemas cho
`initialMatchesType` → PRJ-E014) giữ đồng bộ bằng tay; test chéo
(`tests/type-ranges-cross.test.ts`) so sánh verdict hai bảng trên cùng bộ case
biên để bắt lệch.

**VERIFIED.** `files.comms` (default `'comms/comms.yaml'`) và `files.hmi`
(default `'hmi/'`) chỉ là schema + default — `loadProject` chưa đọc hai file
này, hash project (chỉ gồm file đã đọc) không đổi.

**VERIFIED (OQ-076/077/080).** Giao thức additive, `PROTOCOL_VERSION` giữ 1:
`sim.state.locked?` (optional), message `comms.status` (envelope theo M4 §5.3)
và `comms.log` (mục RingLog theo M4 §5.4, `level: string`). Server P0.8
**không phát** message mới nào, web không đổi; quy tắc khi nào `locked = true`
(M4 vs M5/C5) chưa quyết — do P4.1/P5.1 quyết.

**VERIFIED (OQ-078).** `requiresAsync()` = true khi và chỉ khi có ≥ 1 component
đã đăng ký là `ControllerAdapter` với `asyncStep === true`. Component trả
Promise mà không đặt cờ vẫn bị `stepOnce()` ném `SIM-E002` như M0 — cờ là cách
duy nhất để khai báo bất đồng bộ. Chuyển sang `stepOnceAsync` theo cờ là P5.1.

## 12. Bộ nhớ Siemens (M1 §3.1–§3.4, P1.1)

**VERIFIED.** Bộ nhớ là `Uint8Array` + `DataView`, **big-endian mọi độ rộng**
(`getUint16(offset, false)`…). Truy cập chồng lấn đúng: ghi `%MW0 := 0x1234`
thì `%MB0 = 0x12`, `%MB1 = 0x34`, `%MD0 = 0x12340000`; ghi Real `0.1` thì
đọc lại `fround(0.1)` = 0.10000000149011612; DInt `-1` đọc như DWord =
4294967295 và như Real = NaN (bảng tính tay A, 9 dòng, assert bằng unit test).

**VERIFIED.** Bit addressing: `%M<byte>.<bit>`, bit 0 = LSB. `Time` đọc/ghi
như DInt ms (cùng encoding, khác kiểu khai báo). `Real` luôn ép `Math.fround`,
`DWord`/`UDInt` ép `>>> 0` khi ghi (AGENTS §4).

**VERIFIED.** Layout DB/struct đúng 6 quy tắc §3.4: Bool gói bit trong byte,
chuỗi Bool liên tiếp dùng chung byte, gặp phần tử không-Bool thì đóng byte;
Byte/SInt/USInt 1 byte không căn; kiểu ≥ 2 byte bắt đầu chẵn; Struct/UDT/Array
bắt đầu chẵn + kết thúc chẵn; tổng kích thước làm tròn chẵn. DB dùng thẳng
`layoutStruct` (DB = struct). `FieldInfo.byteOffset`/`bitOffset` là tuyệt đối
trong struct gốc; với array, `elem` là layout của **một** phần tử (phần tử i
ở `byteOffset + i * elem.size`, riêng array Bool thì phần tử i ở bit i).
`size` của FieldInfo tính bằng byte, riêng Bool = 1 (bit).

**UNVERIFIED (OQ-084, `VERIFY` §3.4 quy tắc 4).** LReal căn theo offset chẵn,
không căn 8 ("S7 không yêu cầu căn 8"). Chờ xác minh PLCSIM thí nghiệm E11
(M1 §14 mục 11); nếu PLC thật căn 8 thì struct có LReal sau field lẻ lệch
4 byte — sửa layout + test, ghi SCR nếu spec đổi.

**UNVERIFIED (OQ-083, `VERIFY` §3.4 quy tắc 5).** Array of Bool gói bit
(10 Bool = 2 byte); array bắt đầu chẵn, kết thúc chẵn (pad — 7 bit = 1 byte
nội dung → size 2). Chờ xác minh PLCSIM E11 như trên.

**VERIFIED (OQ-087).** M1 không hỗ trợ STRING: `sizeOf('String')` →
`undefined`; `layoutStruct` gặp field String (kể cả trong array) → throw
`Error` nêu tên field. Không bịa kích thước.

**VERIFIED (OQ-086).** Truy cập ngoài vùng (`read`/`write`/`getBit`/`setBit`
vượt `sizeBytes`, `restore` sai độ dài) → ném `RangeError` nêu rõ
vùng/offset/kích thước (lỗi ồn ào, không im lặng). P1.4 map thành
`RuntimeFault ARRAY_RANGE` khi ngữ cảnh là chỉ số mảng.

**VERIFIED (OQ-091).** `MemoryArea.write` validate bằng `validateTagValue`
(kernel, P0.8), sai → ném `TagError('TAG-E001')`. Bộ nhớ không tự wrap/kẹp;
wrap/chuẩn hóa là việc của interpreter trước khi ghi (§7.2).

**VERIFIED (OQ-089).** `AbsAddress` chỉ mang width (1/8/16/32), không mang
`DataType`: cùng `%IW64` có thể là Int, Word hoặc Real tùy khai báo ở lúc
đọc. Không có dạng 64-bit tuyệt đối (`%ML` không tồn tại trong §3.3).

**VERIFIED (OQ-085/090).** `parseAddress`: chấp nhận chữ thường + chuẩn hóa
hoa, trim khoảng trắng, không `%` cũng parse được; `DB0` → throw;
`sym:…` → throw; bit phải 0..7; không kiểm giới hạn vùng ở parse
(byte lớn vẫn parse, lỗi chỉ phát khi truy cập bộ nhớ); `%IW65` (word ở
byte lẻ) parse được. Sai → throw `Error('địa chỉ không hợp lệ: ...')`
nêu text gốc + lý do; P1.2 chuyển thành Diagnostic.

## 13. Lexer + parser SCL (M1 §4.2–4.4, P1.2)

**VERIFIED.** Lexer Chevrotain 13 là **first-match theo thứ tự khai báo,
không phải longest-match** (đọc `tokenizeInternal` trong `lexer_public.ts`:
vòng pattern dừng ở match đầu tiên; chỉ `longer_alt` mới thay token đã khớp
bằng token dài hơn). Hệ quả: `LineComment` đứng trước `Slash` (nếu không
`// abc` thành `/`, `/`, `abc`); `RealLiteral` đứng trước `IntLiteral` (nếu
không `1.5` thành `1`, `.`, `5`); mọi từ khóa + `BoolLiteral` có
`longer_alt: Identifier` (nếu không `IFX` thành `IF` + `X`). Thứ tự còn lại:
token dài/cụ thể trước token ngắn (`**` trước `*`, `..` trước `.`, `:=`
trước `:`, `<=`/`>=`/`<>` trước `<`/`>`/`=`), `TimeLiteral` trước
`BadTimeLiteral`, `AbsAddress` trước `Identifier`, `BlockComment` đầu tiên.
Thứ tự từ khóa dài-trước-ngắn còn để qua check tĩnh "unreachable pattern"
của Chevrotain (regex trước `exec` được lên source token sau).

**VERIFIED.** Chevrotain 13 không có `ignoreCase` trong `ITokenConfig`
(kiểm từ `.d.ts` đã cài): từ khóa dùng regex flag `i` trên image (chỉ chữ
cái + `_` nên không cần escape). `TRUE`/`FALSE` là `BoolLiteral`, không phải
từ khóa.

**VERIFIED (OQ-096).** Comment khối `(* *)` **không lồng**: pattern khớp tới
`*)` đầu tiên; `*)` thừa thành token `StrayCommentEnd` → SCL-L001 tại vị trí
của nó và bị bỏ. Comment dòng `//` và khối đều bị bỏ khỏi token stream.
Comment không đóng (`(*` tới EOF) → SCL-L001 tại vị trí mở, nuốt tới EOF.

**VERIFIED (OQ-097).** `T#`/`TIME#` với đơn vị lạ hoặc thiếu đơn vị (vd
`T#5x`, `T#5`) khớp token `BadTimeLiteral` → SCL-L001 tại vị trí bắt đầu
literal, token bị bỏ (không vào AST).

**VERIFIED (OQ-098).** `#name` và `"Name"` giữ nguyên chữ viết trong AST;
so sánh không phân biệt hoa/thường là việc của P1.3 (typecheck/lower), không
phải parser.

**VERIFIED.** `endCol` là **exclusive** (`endCol = startColumn + length`),
khớp quy ước sẵn của repo (`packages/schemas/src/yaml.ts` dùng `range[1]`).
Token nhiều dòng (comment) tính đúng `endLine`.

**VERIFIED (OQ-101).** Parser là `EmbeddedActionsParser` — build AST trực
tiếp, không qua CST→AST. Mọi rule trả `T | undefined`; rule trả `undefined`
nếu một phần không-phải-list bị `undefined`; list rule lọc `undefined`.
Với `recoveryEnabled`, `SUBRULE` lỗi trả `undefined` thay vì throw; lỗi
tích trong `parser.errors`; parse cấp cao không throw. Code trong rule chỉ
được chạm `.loc`/`.image` để build AST bên trong `this.ACTION(...)` (giai
đoạn ghi GAST: `LA()` trả EOF, `SUBRULE` trả object đóng băng không có
`loc`); vòng lặp/if JS thuần quanh DSL không được ghi vào GAST nên grammar
dùng `MANY`/`OPTION`/`MANY_SEP` của DSL, không dùng vòng lặp JS.

**VERIFIED (OQ-095).** Mã lỗi: SCL-L001 lexer (ký tự lạ, comment không
đóng, time unit sai, `*)` thừa); SCL-P001 thiếu `;` — ghi tại token trước
đó (`LA(0)`), không tiêu thụ token, do `expectSemi()` tự viết (Chevrotain
không bao giờ báo lỗi `;`); SCL-P002 mọi lỗi cú pháp khác của Chevrotain
(mismatch/no-viable-alt/early-exit tại `error.token`,
`NotAllInputParsedException` tại token thừa đầu tiên); SCL-P003 quá 100 lỗi;
SCL-U001 chưa hỗ trợ. `parseScl` trả AST từng phần + diagnostics đã sort
theo vị trí; P1.3 từ chối lower khi có lỗi (OQ-099).

**VERIFIED.** Phục hồi mức statement: Chevrotain resync + `syncAfterFailedStmt`
tự viết — sau statement lỗi, bỏ token bằng `SKIP_TOKEN()` tới `;` (tiêu thụ
nó) hoặc đầu statement / cuối block / EOF. Nhờ đó 2 statement lỗi quanh 1
statement đúng cho đúng 2× SCL-P002 và statement đúng vẫn trong AST (D8);
statement rỗng `;` sau phục hồi không thành `EmptyStmt` thừa.

**VERIFIED.** Giới hạn 100 diagnostics **cắt sau khi parse xong**
(`capDiagnostics`: giữ 100 đầu + thêm SCL-P003 tại cuối file), không dừng
sớm giữa chừng — dừng sớm làm block không đóng được và `file()` trả
`undefined` (đã gặp khi thử, D10).

**VERIFIED (OQ-100).** Phân biệt assign/call bằng `OR` với **BACKTRACK GATE**
trên nhánh assign (thử lvalue + `:=`, rớt thì sang call). Diagnostic ghi
trong gate bị chặn bởi cờ `suppressDiagnostics` (embedded action chạy cả khi
backtrack nên không chặn sẽ ghi trùng). Statement call chấp nhận ref hoặc
ident; expression call chỉ chấp nhận ident hoặc `"..."`. Hệ quả: `#fb(...)`
ở vị trí biểu thức **không** phải expression call — parser parse `#fb` thành
ref rồi `(` cho SCL-P001.

**VERIFIED (OQ-093/094).** DB init là `lvalue ":=" const_expr ";"`;
`const_expr` parse như expr thường, tính const kiểm ở P1.3. DB dạng STRUCT
kết `END_STRUCT;` (có `;`, như UDT); DB dạng `"fbname"` không có body.

**VERIFIED (OQ-102).** `String`/`WString` trong khai báo → SCL-U001 tại
token kiểu, node vẫn là `named` để parse tiếp tục.

**VERIFIED (OQ-103/104).** Tên block chấp nhận ident trần hoặc `"..."`.
Struct nội tuyến trong `type` có body `{ var_decl }` như UDT (không có
`END_STRUCT;` ở cuối type — `;` thuộc về `varDecl`).

**UNVERIFIED (OQ-092).** `**` kết hợp phải (`2 ** 3 ** 2` = 512) và unary
chặt hơn mũ (`-2 ** 2` = −4) là mặc định theo EBNF §4.3; chưa đối chiếu TIA/
PLCSIM — chờ mã thật S1 hoặc thí nghiệm PLCSIM (X-002/S1).

**UNVERIFIED.** Thứ tự ưu tiên còn lại (§4.3: `*`/`/`/`MOD`/`DIV` >
`+`/`-` > quan hệ > `=`/`<>` > `AND` > `XOR` > `OR`, `&` là alias `AND`,
`NOT` chặt hơn `AND`) theo EBNF; chưa đối chiếu TIA/PLCSIM — chờ S1.

## 14. Typecheck + lower AST→IR (M1 §4.4, §6, §7.1–7.3, P1.3)

**VERIFIED (bảng A, test `typecheck.test.ts`).** Lattice widening chỉ đúng
các cạnh: `SInt→Int→DInt→Real→LReal`; `USInt→UInt→UDInt`;
`Byte→Word→DWord`; `Real→LReal`. `Bool` không widening đi đâu; `Time`
không widening sang `DInt`/`Real` (OQ-124). Kiểu kết quả nhị phân: hai vế
widening về `commonType` (LUB) rồi tính; `Int ∘ Int → Int` (không tự nâng
lên DInt); `**` luôn `Real`/`LReal`; `/` và `DIV` trên số nguyên đều cắt về
0 (cùng `BinFn 'div'`); `MOD` chỉ số nguyên, dấu theo số bị chia. So sánh
trả `Bool`. `AND`/`OR`/`XOR` trên `Bool` = logic, trên `Byte`/`Word`/`DWord`
= bitwise (hai vế phải cùng họ sau widening). Một vế số + một vế bit-string
(`Int + Word`) → **SCL-T002** "khác họ, không có LUB" (bảng A, A8); cả hai
vế bit-string cho phép số học → **SCL-T003**; `Time` + không-`Time` → T003;
`Bool` tham gia phép số học → T003. Gán: widening được → OK (lower chèn
`convert`); thu hẹp trong họ hoặc chéo họ số/bit-string (`DInt→Int`,
`Real→Int`, `Word→Int`, `Int→Word`, `DWord→DInt`…) → **SCL-T010** + hint
hàm chuyển đổi; không liên quan (`Bool↔Int`, `Time↔Int`, struct/array sai)
→ **SCL-T002**.

**VERIFIED (bảng C).** Tên chưa khai báo → T001; gán vào `VAR_INPUT`
(FB/FC) hoặc `VAR_CONSTANT` → T006; gọi FB thiếu instance, tham số không
tồn tại/thừa/thiếu bắt buộc/sai kiểu, FC không trả giá trị mà dùng trong
biểu thức, OB làm callee → T004; truy cập member/index sai, chỉ số hằng
ngoài khoảng, label CASE trùng → T005; `EXIT`/`CONTINUE` ngoài vòng lặp →
T007; `const_expr` không hằng → T008; khai báo trùng tên trong cùng scope →
T009; UDT đệ quy → T011; tên kiểu không biết → T001. Vị trí diagnostic =
vị trí node gây lỗi (ref, toàn bộ expr, giá trị, điều kiện, target, arg,
callee, tên thứ hai — xem bảng C).

**VERIFIED (bảng D).** `evalConst` chỉ tính literal + unary/binary trên
hằng + ref tới `VAR_CONSTANT` (đã tính trước, fixpoint im lặng cho hằng
tham chiếu hằng khai báo sau); ref khác → T008. `VAR_CONSTANT` ref được
lower fold thành literal; **không** fold phép tính hằng (`5 * 2` giữ nguyên
trong IR — IR trung thực với nguồn, P1.4 tính). Label CASE phải hằng
(`1 + 1` hợp lệ = 2); label trùng kể cả trùng trong khoảng → T005. FOR:
biến vòng lặp phải là local integer đã khai báo; `from`/`to`/`by` widening
về kiểu biến vòng lặp; `by` mặc định 1, được âm; không kiểm việc sửa biến
vòng lặp trong thân (spec không nói).

**VERIFIED (OQ-120).** Đọc `VAR_TEMP` trước khi gán trong cùng block →
cảnh báo **SCL-W001** (severity `warning`, không làm fail compile). Luật
join: sau `IF`, biến chỉ "đã gán" nếu gán ở cả hai nhánh (hoặc trước đó);
trong vòng lặp chỉ tính gán trước vòng lặp. Đọc TEMP sau khi gán thì hết
warning; đọc trong nhánh IF chỉ gán một bên vẫn warning.

**VERIFIED (OQ-122).** Đệ quy → **SCL-S020** tại callee gây chu trình
(trực tiếp + gián tiếp, qua call graph của unit biên dịch + `ctx.blocks`);
chỉ phát hiện trong phạm vi đã nạp, không quét toàn project.

**VERIFIED (OQ-111).** Kiểu `TON`/`CTU`/`R_TRIG`/… trong `VAR` và call tới
chúng → **SCL-U001** "system block chưa hỗ trợ (P1.5)" — chưa có layout
std nên không thể kiểm tra arg; ồn ào, không im lặng.

**VERIFIED (OQ-112).** FC trả giá trị bằng gán vào tên FC của chính block
(`"FC_A" := …` hoặc `#FC_A := …`, không phân biệt hoa/thường) → lower
thành assign tới local tổng hợp tên = tên FC; lower tự thêm
`IrVar { name: <tên FC>, type: returnType }` vào `interface.temp` (P1.4
đọc local này sau khi `callFcExpr` chạy). Khai báo biến trùng tên FC →
T009. `RETURN` trong FC chỉ điều khiển luồng (giá trị trả = local FC-name
hiện tại, mặc định 0/false).

**VERIFIED (OQ-113).** OB → `IrBlock.number` + `organization`: tên
`"Main"` (không phân biệt hoa/thường) → OB 1; tên khớp `/^OB(\d+)$/i` →
số đó; tên khác → không có binding (block vẫn biên dịch, không vào
`organization`).

**VERIFIED (OQ-114/115).** `**` → intrinsic `POWER`; `/` = `DIV` trên số
nguyên. `X_TO_Y` → node `convert` (`REAL_TO_INT`/`ROUND` mode `round`,
`TRUNC` mode `trunc`, còn lại không mode); `CEIL`/`FLOOR`/`ABS`/`SQRT`/
`MIN`/`MAX`/`LIMIT`/`SHL`/`SHR`/`ROL`/`ROR`/`NORM_X`/`SCALE_X` → intrinsic
với `fn` = tên gốc. `ROUND`/`TRUNC`: `from` = kiểu đối số (Real/LReal),
`to` = DInt. `BOOL_TO_*` chỉ chấp nhận `BOOL_TO_INT`/`BOOL_TO_DINT`/
`BOOL_TO_BYTE`/`BOOL_TO_WORD`/`BOOL_TO_DWORD` (mặc định hẹp, OQ-115).
`SQRT` trên int → Real (LReal nếu arg LReal); `CEIL`/`FLOOR` → DInt;
`NORM_X`/`SCALE_X` chấp nhận số, widen về Real (LReal nếu có arg LReal);
`MIN`/`MAX`/`LIMIT` widen các arg về kiểu chung; `SHL`/`SHR`/`ROL`/`ROR`
cần giá trị int/bit-string + count int. Tên intrinsic không biết → T004.

**VERIFIED (OQ-110).** Địa chỉ tuyệt đối load/store trần diễn giải mặc
định theo width — bit→`Bool`, 8→`Byte`, 16→`Int`, 32→`DInt`; width 1
(bit, `%I0.0`) map sang width 8 (một byte) kèm `bit`. Muốn diễn giải khác
phải dùng hàm chuyển đổi tường minh (vd `DINT_TO_REAL(%MD0)`).

**VERIFIED (OQ-123).** Gọi FB phải dùng tham số đặt tên (positional →
T004); gọi FC positional theo thứ tự khai báo. Arg `:=` → `inArgs` nếu
tham số là INPUT, `inoutArgs` nếu IN_OUT (giá trị phải là lvalue — không
phải lvalue → T004); arg `=>` → `outArgs`. FC gọi dạng statement không có
`Q =>` thì giá trị trả bị bỏ (`ret` undefined); FC trong biểu thức không
nhận `Q =>` (T004). Intrinsic thắng khi trùng tên FC do user; callee
không biết → T001; FB làm callee trong biểu thức → T004; OB làm callee →
T004; system FB làm callee → SCL-U001. Intrinsic chỉ nhận tham số vị trí;
named arg → T004.

**VERIFIED (OQ-125/127/128).** DB dạng STRUCT → `IrDb` + `init` từ
`DbBlock.init` (lvalue base global phải là chính tên DB — khác → T005;
field không tồn tại → T005; giá trị không hằng → T008; gán trùng field →
T009; giá trị vào `IrField.init` — do **typecheck** tính, lower chỉ copy).
DB dạng `"fbname"` → `IrDb` với `fbName`, layout = `VAR_INPUT` +
`VAR_OUTPUT` + `VAR_IN_OUT` (4 byte nội bộ, không lộ) + `VAR(static)` theo
thứ tự khai báo. Tham số OUT của FC (không phải `Q`) → **SCL-T004**
(OQ-127 — `IrStmt.callFc` không có slot `outArgs`); tham số IN_OUT của FC
→ **SCL-T004** (OQ-128 — IR `callFc`/`callFcExpr` không có slot inout;
hạ thành load sẽ mất ghi lại).

**VERIFIED (OQ-106).** IR dùng mảng, không `Map` (spec §6 đồng thời yêu
cầu JSON-serializable); `elsif` là list; `IrExpr` có `type` mọi node,
không `src` trên expr. `IrLValue` thêm variant `member` (`{k:'member',
base, field}`) cho member sau index (`#a[0].field`) — `static.path` chỉ
chứa string nên không biểu diễn được index xen giữa; member trực tiếp
trên root vẫn dùng `static.path`. Member của struct local (`#udt.field`)
→ `static` path `[udt, field, ...]`.

**VERIFIED (bảng B, golden).** `irToJson` sort key đệ quy + indent 2 +
newline cuối; `vcs ir dump` ra JSON ổn định theo từng byte (dump 2 lần
giống hệt). `IrStmt.src`/`IrBlock.src` lấy từ `SclStmt.loc`/`SclBlock.loc`;
`endCol` exclusive (quy ước repo, P1.2): loc của statement/block **không
gồm dấu `;` cuối** (bằng chứng: `parser.test.ts:170-181`). 6 giá trị
`src.endCol` trong bảng B tính tay bị sai theo quy ước này
(`END_FUNCTION_BLOCK` dài 18 ký tự → block endCol 19; mọi endCol stmt
thừa 1) — golden giữ theo parser (nguồn sự thật), xem STATE §18 "Lệch so
với plan".

**VERIFIED.** `compileScl` đúng chữ ký M1 §10 (trả `{blocks,
diagnostics}` — chỉ OB/FC/FB của file này; UDT/DB nằm trong ctx, lấy qua
`compileSclProgram`); parse lỗi → dừng, không lower; typecheck lỗi →
dừng; warning W001 không chặn; diagnostics gộp + sort theo vị trí.
`lower` không kiểm tra lại kiểu: thiếu kiểu trong `types` map = lỗi nội
bộ → throw ồn ào. `convertIfNeeded` chỉ cho widening (khác kiểu mà không
widening → throw).

**UNVERIFIED.** Các quyết định trên là mặc định theo spec §4.4/§6/§7 khi
spec không nói rõ (OQ-106…128) — chờ mã SCL thật (S1) hoặc thí nghiệm
PLCSIM để đối chiếu; nếu TIA cho phép rộng hơn (vd `Int := Real` trong
code cũ) thì sinh SCR nới lỏng, không tự sửa typecheck. `X_TO_Y` với
`SInt`/`USInt`/`UInt`/`UDInt`/`Time` hiện không nhận (tập `CONVERTIBLE_TYPES`
chỉ 8 kiểu) — chờ S1 xác nhận có cần mở rộng không.
