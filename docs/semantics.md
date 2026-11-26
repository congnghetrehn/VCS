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

**VERIFIED (OQ-111, P1.5).** Kiểu `TON`/`CTU`/`R_TRIG`/… trong `VAR` và
call tới chúng **được hỗ trợ từ P1.5** (trước đó → SCL-U001, xem §16):
typecheck chấp nhận qua registry std duy nhất `runtime-iec/src/std/defs.ts`,
lower sinh `callSys`, interpreter chạy handler. `DATA_BLOCK "T1" "TON"`
(tên FB trong ngoặc kép, theo EBNF §4.2) tạo instance DB theo bảng O.

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

## 15. Interpreter + SoftPlc (M1 §7.2–7.3, §8, §10, P1.4)

**VERIFIED (bảng E, test `arithmetic.test.ts` + `intrinsics.test.ts`).**
Số nguyên wrap theo kiểu đích (`Int` 16 bit, `DInt` 32 bit, unsigned theo
độ rộng); tràn `Int` đặt cờ `OV` trên frame (xóa ở đầu scan, không lộ ra
IR — OQ-135). Chia nguyên cắt về 0; chia/MOD cho 0 → kết quả 0 + fault
`DIV_ZERO` (OQ-133). `roundHalfEven` làm tròn .5 về số chẵn gần nhất
(2.5→2, 3.5→4, −3.5→−4); `TRUNC` cắt; `CEIL`/`FLOOR` qua registry rồi
chuẩn hóa về `DInt` qua `convertChecked` (ngoài khoảng → `CONV_RANGE`).
`Real` fround sau **mỗi** phép tính; so sánh trên giá trị đã fround
(OQ-159) — `0.1 + 0.2 = 0.3` là TRUE. `convertChecked` kiểm khoảng với
mọi chuyển đổi số theo kiểu đích (kể cả thu hẹp `Int→Int` hẹp, không
wrap — OQ-150); `NaN` → 0 + `CONV_RANGE`; `Bool↔số` qua 0/1. Shift:
count âm → 0, count ≥ độ rộng → 0; `SHR` có dấu mở rộng dấu; độ rộng
Byte 8 / Word-UInt-Int 16 / DWord-UDInt-DInt 32 (OQ-134). `ABS` của số
nguyên nhỏ nhất wrap về chính nó, không fault (OQ-134). Intrinsics §7.3
đủ 14 hàm trong registry (`POWER`, `ABS`, `SQRT`, `MIN`, `MAX`, `LIMIT`,
`SHL`, `SHR`, `ROL`, `ROR`, `CEIL`, `FLOOR`, `NORM_X`, `SCALE_X` —
OQ-144); `NORM_X`/`SCALE_X` không kẹp khi x ngoài [0..1]; `SCALE_X`
kiểu nguyên làm tròn half-even; `SQRT` âm → `NaN`.

**VERIFIED (scan, bảng A/B/C, test `softplc-scan.test.ts`).** Mô hình
**lưới thời gian đều** (OQ-130): scan thứ k trong một `step(T, dt)` chạy
tại `lastScanTime + k*period`; với stepMs = period = 10 → scan tại 10,
20, 30… (không có scan tại 0). Vượt `maxScansPerStep` (mặc định 50) →
giữ acc thừa để bắt kịp ở bước sau + `SCAN_OVERRUN` đếm số scan bị cắt
(OQ-131). Thứ tự một scan: (a) latch PII từ IoBus qua `readInputsInto`
+ áp force I; (b) OB100 một lần khi chuyển STOP→RUN; (c) cyclic OB đến
hạn (tối đa 1 lần/scan, theo số OB tăng dần, `CYCLE_OVERRUN` đếm kỳ
trễ); (d) OB1; (e) áp force Q + `writeOutputsFrom`. Process image:
ghi `%Q` trong OB1 thấy ngay trong scan, ghi `%I` chỉ thấy ở scan kế
sau latch (bảng B). Thiếu OB100/OB1 → bỏ qua im lặng, scan vẫn đếm
(OQ-146). `step` khi STOP = no-op; dt = 0 → no-op; dt < 0 hoặc T đi
ngược → `RangeError` (OQ-160). `start`/`stop` idempotent; `start`
không reset bộ nhớ; STOP→RUN re-arm OB100 + rebase lưới (OQ-154).
`stop()` với `outputsOnStop: 'zero'` đẩy Q = 0 ra IoBus ngay (OQ-153).
`faultPolicy: 'stop'` dừng sau khi scan xong nếu có fault mới (OQ-158).

**VERIFIED (gọi block / frame, bảng D + test `interpreter*.test.ts`).**
Interpreter biên dịch IR → closures **một lần** lúc `load()` (2 pass:
pass 1 xây `BlockInfo` cho mọi block để gọi chéo file/thứ tự khai báo
tùy ý, pass 2 compile). FC: tham số IN copy vào frame, giá trị trả qua
local tổng hợp tên = tên FC (OQ-112); gọi FC trong biểu thức sâu tối đa
`maxCallDepth` = 24, vượt → fault `CALL_DEPTH`, trả giá trị mặc định
của kiểu trả. FB: instance DB là view trực tiếp lên `DbStore` (ghi vào
field = ghi vào DB ngay); IN copy vào field input của view, OUT copy ra
sau khi chạy, **IN_OUT = alias trực tiếp** (Ref), không copy-back
(OQ-148). Multi-instance lồng: FB con trong static của FB cha, gọi qua
`frame.instance` + field struct. TEMP reset mỗi lần gọi FC; static FB
giữ qua các scan (latch 4-scan, bảng D). `FOR` bao hàm hai đầu, 0 lần
khi hướng sai, kiểm tràn trước khi tăng (OQ-149); `FOR BY 0` → cắt bởi
`LOOP_LIMIT`. Vòng lặp vượt `maxLoopIterations` = 10_000 → fault
`LOOP_LIMIT`, thoát vòng lặp, chạy tiếp (OQ-132). Điều kiện không phải
`Bool` → nhánh/vòng lặp bị bỏ qua im lặng (typecheck P1.3 đã chặn
non-Bool trước). `callSys` không có handler → fault `SYS_UNSUPPORTED`,
bỏ qua, chạy tiếp (OQ-143; std block thật là P1.5). Index ngoài khoảng
→ đọc 0/false + fault `ARRAY_RANGE`, ghi bỏ qua + fault; chỉ số không
nguyên → throw. Gán cả mảng/struct = deep copy; mảng/struct làm tham số
FC = copy; làm IN_OUT FB = alias. Mảng trong mảng và member sau index
sâu hơn 1 cấp **chưa hỗ trợ** ở P1.4 — throw ồn ào lúc compile.

**VERIFIED (force / snapshot, bảng F, test `softplc-snapshot.test.ts`).**
Force là lớp phủ ở API `read`/`write` (không chạm bộ nhớ đối với
`%M`/DB); chỉ force I (áp vào PII sau latch) và force Q (áp vào PIQ sau
OB1) chạm bộ nhớ trong scan. `write` vào ref đang force → bỏ qua, không
báo lỗi; sai kiểu → `TagError('TAG-E001')` (OQ-141). Force chuẩn hóa về
key địa chỉ (`%MB10` ≠ `%MW10` vì khác width); `listForces` trả dạng
chuẩn sắp xếp theo ref (OQ-142). Snapshot/restore: bộ nhớ dạng
`number[]` (OQ-147); restore validate chặt (version, state, độ dài byte
từng vùng/DB, cyclic khớp OB, force parse + validate, fault đúng hình)
rồi mới áp dụng — sai hình → throw, trạng thái cũ nguyên vẹn.
Snapshot → 3 scan → restore → 3 scan cho trace Q + scanCount + faults
**giống hệt** (F6); force nằm trong snapshot (F7); tích hợp
orchestrator `snapshotAll`/`restoreAll` qua `createSimulation` cho
TagDB Q + scanCount + simTime giống hệt (F8).

**VERIFIED (địa chỉ / DB, test `tagmap.test.ts` + `softplc.test.ts`).**
`TagAddressMap` ở `runtime-iec` với parser riêng (mirror `parseAddress`
P1.1, cross-test ~20 địa chỉ ở vendor-siemens); `sym:` → throw chưa hỗ
trợ (OQ-137). Địa chỉ tuyệt đối trần diễn giải theo width: bit → `Bool`,
8 → `Byte`, 16 → `Int`, 32 → `DInt` (OQ-110); `LReal` 64-bit qua dạng
`%ML10`/`DB1.DBL4` (chỉ có trong `parsePlcRef`, không có trong
`parseAddress`). Layout instance DB (§3.5, OQ-125): `VAR_INPUT` +
`VAR_OUTPUT` + `VAR_IN_OUT` (tham chiếu — slot 4 byte nội bộ, **không
lộ**; truy cập field IN_OUT trong DB → T005) + `VAR(static)`, theo thứ
tự khai báo — **sửa bug P1.3** ở `resolveDb` (bản cũ chỉ lấy `static` +
prefix 4 byte, làm interpreter không tìm được field input). Số DB gán
1..n theo `id` đã sort ở `load()`; ref ngoài → `load()` throw (OQ-136).
`load()` yêu cầu STOP + xóa forces + reset trạng thái (OQ-139);
`reset()` cold toàn phần (OQ-140). `init()` build lại map từ `cfg.tags`
(OQ-138); cyclic OB không có `cycleMs` trong IR → period mặc định
100 ms (chuẩn Siemens OB30–38; bổ sung OQ-145 — `compileSclProgram`
không bao giờ sinh `cycleMs`).

**UNVERIFIED.** Mô hình scan lưới đều (OQ-130) và số DB 1..n (OQ-136)
chưa đối chiếu TIA/PLCSIM — chờ S1/PLCSIM (VERIFY §14.9/§14.14); nếu
sai thì SCR đổi mô hình + sửa bảng A. OV/ENO không quan sát được từ SCL
(OQ-135) — nếu PLCSIM cho thấy ENO ảnh hưởng luồng thì cần SCR thêm ENO
vào IR (P1.7). Ngữ nghĩa intrinsics ở biên (`NORM_X`/`SCALE_X` ngoài
[0..1], tập `X_TO_Y`, `BOOL_TO_*`) theo spec §7.3, chưa đối chiếu code
thật (X-002/S1). Layout IN_OUT của **multi-instance lồng** chưa nhất
quán với DB top-level (`fbInterfaceStruct` dùng kích thước tự nhiên,
không slot 4 byte — OQ-161, mở). Hiệu năng: smoke 200 FB_Motor đo
**519 và 533 scan/s** (2 lần, 2000 scan) — dưới mục tiêu P1.7 ≥ 1000
scan/s; bench chính thức + tối ưu là P1.7, không phải gate P1.4.

## 16. System block IEC — R_TRIG/F_TRIG, SR/RS, TON/TOF/TP/TONR, CTU/CTD/CTUD (M1 §9, P1.5)

Nguồn sự thật duy nhất: `runtime-iec/src/std/defs.ts` (interface + field
ẩn + layout qua `layoutStruct`, bảng O) + `runtime-iec/src/std/handlers.ts`
(`createStdSysCalls()`). `SoftPlc` nối registry mặc định; `SoftPlcConfig`
có `sysCalls?` tùy chọn **thay thế** toàn bộ map (OQ-170); `Interpreter`
trần không có handler → `callSys` fault `SYS_UNSUPPORTED` như cũ (OQ-143).
Golden: bảng A–P (STATE §20), test `softplc-std.test.ts` (34 scan) +
`std/handlers.test.ts` + `std/defs.test.ts` + pipeline `softplc-std.test.ts`
(P-S1…P-S8) — mọi kỳ vọng tính tay, `expectedFrom: 'spec'`.

**VERIFIED (layout, bảng O).** Mỗi block có layout cố định qua
`layoutStruct`: R_TRIG/F_TRIG `CLK@0.0, Q@0.1, _m@0.2` (2 byte);
SR `S1@0.0, R@0.1, Q1@0.2`, RS `S@0.0, R1@0.1, Q1@0.2` (2 byte);
TON/TOF/TP `IN@0.0, PT@2, Q@6.0, ET@8, _start@12, _running@16.0,
_prevIn@16.1` (18 byte); TONR thêm `R@0.1, _accum@18` (22 byte);
CTU `CU@0.0, R@0.1, PV@2, QU@4.0, CV@6, _prevCU@8.0` (10 byte);
CTD `CD@0.0, LD@0.1, PV@2, QD@4.0, CV@6, _prevCD@8.0` (10 byte);
CTUD `CU@0.0, CD@0.1, R@0.2, LD@0.3, PV@2, QU@4.0, QD@4.1, CV@6,
_prevCU@8.0, _prevCD@8.1` (10 byte). Field ẩn (`_m`, `_start`,
`_running`, `_prevIn`, `_accum`, `_prevCU`, `_prevCD`) chiếm byte
trong layout nhưng **không truy cập được từ SCL** (`"T1"._start` →
SCL-T005, OQ-163 — kiểm ở mọi cấp, kể cả lồng trong struct cha);
`IrDb.fields` chỉ chứa field công khai, `size` tính cả ẩn.

**VERIFIED (vị trí dùng, OQ-171).** Kiểu std chỉ ở `VAR` (static) của
block và `DATA_BLOCK "T1" "TON"` (tên FB trong ngoặc kép, EBNF §4.2);
`VAR_TEMP`, `VAR_INPUT`/`VAR_OUTPUT`/`VAR_IN_OUT`, kiểu trả FC, phần
tử mảng, field struct/UDT/DB → **SCL-T004**. Multi-instance std qua
`fbInterfaceStruct` (bảng P: FB_Motor DB 38 byte, xem §15 UNVERIFIED /
OQ-161 — IN_OUT lồng vẫn mở).

**VERIFIED (lời gọi, OQ-175/181).** Chỉ dạng statement: local `#sT(...)`
và global `"T1"(...)` → IR `callSys {fn, instance, inArgs, outArgs}`;
std trong biểu thức → **SCL-T004**; tên std trần không instance
(`TON(...)`) → T004 "cần instance". Tham số: `checkCallArgs` tái dùng
nguyên xi (kind 'FB') — R/LD có `init: false` nên **tùy chọn** (thiếu =
FALSE); input khác bắt buộc, thiếu → T004 "thiếu tham số bắt buộc";
output qua `=>` (tùy chọn); `:=` cho output → T004. Handler ghi output
xuống DB **trước**, rồi mới ghi Ref out-arg cùng giá trị — đọc qua DB
field là đường chính, `=>` là đường phụ, cả hai thấy cùng giá trị trong
cùng scan. `callSys` không vào call graph (std là lá, không đệ quy).

**VERIFIED (edge / bistable, bảng J–K).** R_TRIG: Q = cạnh lên CLK
(`_m` nhớ CLK scan trước); F_TRIG: Q = cạnh xuống. `_m` khởi tạo
false (scan đầu sau load CLK=true → R_TRIG Q=true, F_TRIG Q=false).
SR: Q1 set bởi S1, reset bởi R, **cả hai true → Q1=true** (S thắng);
RS ngược lại (**cả hai true → Q1=false**, R thắng). Q1 chính là trạng
thái (không field ẩn).

**VERIFIED (timer, bảng A–H, OQ-172/176).** Thời gian theo sim time của
scan; PT hiệu dụng `PT' = max(PT, 0)` cho mọi timer, ET không bao giờ
âm. PT thay đổi giữa chừng: áp dụng từ lần gọi sau, `_start` không
tính lại. TON: Q = IN ∧ elapsed ≥ PT'; ET kẹp PT'. PT=0 → Q=IN, ET=0.
TOF: cạnh xuống IN bắt đầu đếm; IN lên giữa chừng hủy đếm (retrigger);
ET kẹp PT'. TP: cạnh lên IN bắt đầu xung dài PT'; cạnh lên trong xung
bị bỏ qua; xung kết thúc + IN vẫn true → ET giữ PT', Q=false, **không**
kích lại cho tới khi IN xuống rồi lên; xung kết thúc + IN false → ET=0
ngay trong scan đó. TONR: IN xuống → `_accum` giữ, `_running=false`;
IN lên lại → đếm tiếp từ `_accum`; R thắng IN cùng scan; PT=0 → Q=IN,
ET=0, `_accum` giữ 0. **TONR ET không kẹp PT** (công thức §9.3
`ET=_accum+(now−_start)`): P-S6 ghim ET=1200 khi IN xuống sau khi đã
vượt PT=1000 — bảng I không có hàng vượt PT nên điểm này chờ đối
chiếu S1 (xem UNVERIFIED dưới).

**VERIFIED (counter, bảng L–N, OQ-168/177).** Chỉ biến thể **Int**
(PV/CV Int, không có DInt — spec §9.4 nói "biến thể DInt theo tham số
kiểu" nhưng EBNF §4.2 không có cú pháp chọn). CTU: cạnh lên CU → CV+1;
R → CV=0 (R thắng đếm cùng scan); `QU = CV ≥ PV`. CTD: cạnh lên CD →
CV−1; LD → CV=PV (LD thắng đếm cùng scan); `QD = CV ≤ 0`. CTUD: R >
LD > đếm; CU+CD cùng cạnh lên → tăng rồi giảm = không đổi; `QU = CV ≥
PV`, `QD = CV ≤ 0` (PV=0 → cả hai cùng true). Kẹp tại biên, không wrap,
không fault: CTU giữ 32767, CTD giữ −32768.

**VERIFIED (snapshot, OQ-180).** Không cần code riêng cho std: trạng
thái nằm trong byte instance DB nên snapshot/restore đã bao trùm —
snapshot giữa TON đang chạy (ET=1500) → 3 scan → restore → 3 scan cho
trace Q/ET/scanCount giống hệt.

**UNVERIFIED (VERIFY M1 §14.5–9, chờ PLCSIM/S1 — OQ-164/165/167/169/177).**
Các mục sau theo spec §9 nhưng **chưa đối chiếu PLC thật**; nếu S1/PLCSIM
cho kết quả khác thì SCR đổi spec + sửa bảng/golden (không âm thầm đổi):
§14.5 TON — PT=0, IN dao động, timer không được gọi vài scan rồi gọi
lại (bảng D ghim ET "nhảy" theo timestamp — OQ-169); §14.6 TP — IN
giữ true sau khi hết xung (bảng G ghim không kích lại — OQ-165);
§14.7 TOF — retrigger (bảng F); §14.8 counter — biên max/min, thứ tự
R/LD, CU+CD cùng cạnh (bảng L–N, OQ-167/177); §14.9 R_TRIG — scan đầu
sau STOP→RUN khi CLK đã true (bảng J5 ghim Q=false vì `_m` giữ —
OQ-164). Ngoài §14: TONR ET không kẹp PT (P-S6 ghim 1200) và `_m` khởi
tạo false sau load (bảng J3) cũng chưa đối chiếu.

## 17. LAD — schema JSON, validate, lower → IR chung SCL (M1 §5, P1.6)

Nguồn sự thật duy nhất: `packages/vendor-siemens/src/lad/schema.ts`
(zod), `validate.ts` (`validateLad`), `lower.ts` (`lowerLad` /
`compileLad`) + `packages/schemas/src/diagnostics-catalog.ts`
(`LAD_CATALOG`, 9 mã). Không interpreter riêng: LAD lower về **cùng IR**
với SCL (M1 §6) và chạy bằng interpreter P1.4 + `callSys` P1.5. IR
không đổi ở P1.6. Golden: bảng A–L (STATE §21), test
`lad-golden.test.ts` (12 scan + 2 property fast-check, seed cố định) +
pipeline `lad/softplc-lad.test.ts` (P-L1…P-L6) — mọi kỳ vọng tính tay,
`expectedFrom: 'spec'`.

**VERIFIED (hình dạng, M1 §5.1).** `LadBlock {kind, name, number?,
interface, networks[]}`; `kind` = `'OB' | 'FB' | 'FC'`; mỗi network là
một rung (mảng element), chạy theo thứ tự mảng; network sau đọc giá trị
network trước ghi trong cùng scan; hai coil cùng operand trong một
network → coil sau thắng. Interface JSON cùng hình dạng SCL
(`{input?, output?, inout?, static?, temp?}`, mỗi khai báo
`{name, type, init?}`); tên kiểu nguyên thủy không phân biệt hoa
thường; UDT/FB qua ctx; kiểu std chỉ ở VAR static / DB (luật §16);
`Array[lo..hi] of T` qua regex (OQ-191; sai cú pháp → LAD-S001).
FC/OB có VAR static → LAD-S001 (OQ-192, như SCL). `number` chỉ cho OB
(`obNumber` theo tên — OQ-113); FB/FC có `number` → LAD-S001.

**VERIFIED (operand).** `{sym}` → tag catalog (thiếu → LAD-T001; kiểu
tag phải bằng kiểu theo độ rộng địa chỉ OQ-110, lệch → LAD-T002);
`{abs}` → `parseAddress` (sai → LAD-T001) + kiểu theo độ rộng (bit→
Bool, 8→Byte, 16→Int, 32→DInt); `{local}` → `#name[.member]*` (sai →
LAD-T005, field ẩn → LAD-T005, OQ-163). Contact/coil/set/reset/pos/
neg phải Bool, không thì LAD-T002; coil ghi vào VAR_INPUT → LAD-T006.
Field DB không địa chỉ trực tiếp qua operand (OQ-187) — đọc Q/ET qua
(a) RLO sau box, (b) box `outputs`, (c) `#tOn.Q` local. Const không
kiểu: số → Int, bool → Bool; PT phải `type: 'Time'` (OQ-195).

**VERIFIED (RLO, M1 §5.2).** Mỗi network bắt đầu `__lad_<id>_rlo :=
TRUE` (temp riêng từng network, OQ-189; đụng tên user → LAD-T009).
Contact NO `rlo = rlo AND v`; NC `rlo = rlo AND NOT v`; `pos` `rlo =
rlo AND (v AND NOT m)`, rồi `m := v`; `neg` `rlo = rlo AND (NOT v AND
m)`, rồi `m := v` (m là memBit do user khai, phải Bool, không được là
VAR_INPUT); `parallel` `rlo = OR(branch_i(rlo_in))`, các nhánh theo
thứ tự mảng, mỗi nhánh một temp `__lad_<id>_b<n>`; `not` `rlo = NOT
rlo`; coil thường/phủ định `operand := rlo` / `:= NOT rlo` mỗi scan;
`set`/`reset` chỉ ghi khi rlo (bọc `if (__rlo)`).

**VERIFIED (box).** Box std (9 block §16) **luôn `callSys`, không bọc
`if (EN)`**; RLO sau box = Q-like (bảng dưới). Box so sánh `rlo = EN
AND cmp` (không bọc if — EN=false cho false giống hệt); box
toán/MOVE/CONVERT/NORM_X/SCALE_X/LIMIT/MIN/MAX **chỉ chạy khi EN**
(bọc `if (__rlo)`), RLO sau = ENO = EN (không đổi). Instance box:
`{local}` → biến static của block; `{sym}` → DB toàn cục theo tên
trong `ctx.dbs`, `fbName` phải khớp fn (sai/thiếu → LAD-T001);
`{abs}` → LAD-T004; std box thiếu instance → LAD-T004; box toán/so
sánh/MOVE có `instance` → LAD-T004. Instance DB cho LAD lấy từ
`ctx.dbs` / SCL `DATA_BLOCK` (OQ-188); LAD không khai DB trong file
(thiếu → T001 ồn ào, không đoán). Kiểu box toán/so sánh theo SCL
`binaryResultType` + widening (sai → LAD-T002/T003); DIV 0 → fault
`DIV_ZERO` ở interpreter (không kiểm ở validate). CONVERT theo bảng
SCL `X_TO_Y` (OQ-150; `INT_TO_BOOL` **được** — có trong bảng
`CONVERTIBLE_TYPES`, test ghim chấp nhận); `TIME_TO_INT` không được →
LAD-T003. Tên key box (OQ-194): TON/TOF/TP/TONR IN, PT → Q, ET;
CTU CU, PV, R? → QU, CV; CTD CD, PV, LD? → QD, CV; CTUD CU, CD, PV,
R?, LD? → QU, QD, CV; SR/RS **S1+R / S+R1** → Q1 (tên thật trong
`defs.ts`, không phải "S, R" như bảng plan §21); R_TRIG/F_TRIG CLK →
Q; so sánh IN1, IN2 → rlo; toán IN1, IN2 → OUT; MOVE IN → OUT;
CONVERT IN → OUT; NORM_X/SCALE_X MIN, MAX, VALUE → OUT; LIMIT MN,
MX, IN → OUT; MIN/MAX IN1, IN2 → OUT. R/LD tùy chọn (`init: false`,
thiếu = FALSE, OQ-181).

**VERIFIED (RLO sau box std, OQ-184).** TON/TOF/TP/TONR → Q;
R_TRIG/F_TRIG → Q; SR/RS → Q1; CTU → QU; CTD → QD; CTUD → QU (QD đọc
qua `outputs`). Instance box std trong lower là `local`/`dbField`
(theo interpreter `resolveInstance`); riêng ghi chú IR bảng J trong
plan §21 viết `{k:'static', path:['sT']}` là **sai** — interpreter chỉ
nhận local/dbField, golden J dùng `local('sT')` (xem STATE §21).

**VERIFIED (diagnostic).** 9 mã LAD (tổng 42 → 51): S001 schema/cấu
trúc; T001 tên chưa khai; T002 sai kiểu; T003 toán tử không áp dụng;
T004 lỗi gọi box; T005 member sai/ẩn; T006 ghi sai; T009 trùng tên;
U001 không hỗ trợ (box ngoài tập M1, kiểu String, mảng lồng). Vị trí
`line=1, col=1` (JSON không có vị trí nguồn); message luôn nêu network
id + chỉ số element (OQ-193). `networkMap` = chỉ số body của từng
network trong `IrBlock.body` (OQ-186). Không có box `call` gọi FB/FC
từ LAD (nếu cần, SCR/P1.7 thêm).

**UNVERIFIED (VERIFY, chờ PLCSIM/S1 — OQ-183/184/185).** Các mục sau
theo M1 §5.2 nhưng **chưa đối chiếu TIA/PLCSIM**; nếu S1/PLCSIM cho
kết quả khác thì SCR đổi spec + sửa bảng/golden (không âm thầm đổi):
`pos`/`neg` ≡ R_TRIG/F_TRIG (OQ-183, golden D + property 2 ghim);
bảng RLO-sau-box std, nhất là CTUD→QU là mặc định tùy ý (OQ-184,
golden G/J ghim); EN-gating — std box luôn chạy, toán chỉ chạy khi EN
(OQ-185, golden L ghim: TON chạy dù EN=false, Q lên ở scan 400 và
coil sau TON lên **dù contact trước mở**; ADD không chạy, MW20 giữ 0
— đúng theo chữ spec nhưng ngược trực giác, nếu TIA chặn timer khi
EN=false thì SCR sửa OQ-185 + bảng L).

## 18. Golden runner + demo + Watch + bench (M1 §11–§14, P1.7)

**VERIFIED (golden runner, M1 §12.1).** Mỗi file `*.golden.yaml` = 1 test case
(`describe.each` qua `packages/vendor-siemens/src/golden/golden.test.ts`);
`runGolden` (`packages/runtime-iec/src/golden/runner.ts`) chạy SoftPlc trực
tiếp: bước 0 = trạng thái khởi tạo, chưa scan (bảng E STATE §22); mỗi bước
`set` áp dụng TRƯỚC mọi scan trong gap của nó; gap phải chia hết cho
`scanPeriodMs` (không thì `GoldenError`); `expect` số nguyên so `Object.is`
tuyệt đối, số thực so sau `Math.fround` hai vế (hoặc `{approx, eps?}`,
mặc định eps 1e-6); `faults` phải KHỚP CHÍNH XÁC tập mã lỗi tăng thêm từ
bước trước (lỗi không liệt kê → fail — "không im lặng"); `snapshot` sau
`expect`, `restore` trước `set`/scan của bước đó. Ref tuyệt đối `%MD0` đọc
theo `typeForWidth` (32-bit → DInt): muốn expect Real phải dùng ref có kiểu
(DB field hoặc tên tag). `scanCount` nằm trong snapshot nên restore tua lại
nó (bước cùng `t` sau restore, gap 0, không tạo thêm scan).

**VERIFIED (step 0 + gap, bài học port YAML).** Bước `t=0` chỉ được expect giá
trị KHỞI TẠO (false/0) — golden nào expect giá trị sau scan ở t=0 là sai
(sửa ở bitlogic-and-or-not, bitlogic-negated-contact, 5 file counter).
Golden nhạy cạnh (edge) phải dùng bước liên tiếp (gap = period): `set` trong
một bước áp dụng trước scan ĐẦU TIÊN của gap, không phải scan cuối (sửa 6
file timer + 3 file counter; TOF retrigger cần thêm bước t=1900). Mô tả YAML
chứa `": "` phải đặt trong dấu nháy kép (lỗi parse YAML).

**VERIFIED (địa chỉ + kiểu, bài học port YAML).** `%MW0` chồng lên các bit
`%M0.0–%M0.7` (counter golden dùng `%MW10` cho CV, không `%MW0`); từ Siemens
big-endian (`%MW0` = byte0<<8 | byte1: `%M0.0`+`%M0.1` → 768, không phải 3).
Typecheck fold hằng + kiểm khoảng: `32767 + 1` → T002, `200 * 300` → T002,
chỉ số mảng hằng ngoài khoảng → T005 lúc biên dịch (golden tràn/chỉ số phải
dùng giá trị runtime `%MW20` / chỉ số biến). `**` (POWER) có kiểu Real:
`2 ** 3` gán cho Int → T010 (không thu hẹp ngầm); `REAL_TO_INT(2.0 ** 3.0
** 2.0)` = 512. Biến TEMP trong thân OB phải có tiền tố `#` (`#i`, `#s`;
`FOR #i := ...`); khai báo giữ nguyên không `#`. Thứ tự biên dịch
`compileProject` theo tên file: file DB tham chiếu FB/TYPE phải đứng SAU file
chứa FB/TYPE (sửa 4 golden call + memory-struct-nested: gộp FB/TYPE + DB vào
một file, FB/TYPE trước). `DATA_BLOCK` không nhận UDT làm kiểu
(`"DB_O" "UDT_Outer"` → T001): khai báo DB dạng STRUCT chứa field UDT.
Khởi tạo trong DB BEGIN cần lvalue đủ qualified (`"DB_D".a := 42;`, không
`a := 42;`).

**VERIFIED (tag resolution, OQ-198).** `"NAME"` không phải DB/block → tra bảng
tag (`CompileContext.tags`, từ catalog qua `buildTagAddressMap`) → lower
thành abs ref; không thấy → T001 như trước. Thứ tự giải: DB/block TRƯỚC,
tag sau (tag không che tên DB/block — test `compile-project.test.ts`).
Hồi quy: golden IR JSON cũ không đổi (typecheck cũ không tra tag nên mọi
`"..."` hợp lệ trước đây đều là DB/block).

**VERIFIED (bug P1.3 sửa ở P1.7 — cross-file DB instance).**
`TypecheckResult.dbs` trước đây chỉ chứa DB của file hiện tại; `lower.ts`
`lowerCallStmt` tra `checked.dbs` nên gọi instance DB khai ở file khác ném
`lower: không tìm được FC ...` dù typecheck chấp nhận (chưa từng nổ vì P1.4
đặt FB+DB+OB trong một file). Sửa: `dbs: new Map([...ctx.dbs, ...this.dbs])`
(file hiện tại thắng khi trùng tên — cùng tiền lệ `checked.blocks`). Demo
motor-interlock (3 file) là hồi quy. FC cross-file đã probe: gọi trong biểu
thức và trong statement đều cho IR đúng (`callFc` không có `ret` khi không
có `Q =>` — `ret` chỉ từ namedOut tường minh, không phải bug).

**VERIFIED (compile order + tên file demo, OQ-202).** Sort file
case-insensitive (tên file Windows/TIA không phân biệt hoa/thường); với
`db.scl` thì cả hai kiểu sort đều sai (case-sensitive: OB1 trước db → T001
`FB_Motor_DB`; case-insensitive: db trước FB → T001 `FB_Motor`). Demo đổi
tên `db.scl` → `FB_Motor_DB.scl` (OQ-202 cho phép quy ước tên tránh lỗi):
thứ tự `FB_Motor.scl` < `FB_Motor_DB.scl` < `OB1.scl` đúng với cả hai sort.
Bench dùng `00_FB_Motor.scl`, `01_DBs.scl`, `02_OB1.scl` cùng lý do.

**VERIFIED (force, OQ-141 + OQ-216).** Force CHỈ áp cho vùng I/Q
(`SoftPlc.#applyForcesToMem('I' | 'Q')`): force `%M` hoặc DB field chỉ lưu
lớp phủ ở `read()` (OB không bao giờ thấy — golden force-db-field đổi thành
force-two-outputs). Unforce KHÔNG khôi phục giá trị vật lý: bộ nhớ giữ giá
trị force cuối cho tới lần ghi/set sau (và `set` cùng bước với `unforce` bị
rớt vì runner áp set → force → unforce theo thứ tự đó; golden force-input
ghim: t=30 unforce → Q vẫn true; t=40 set false → Q false). Write `%I` chỉ
tới lần latch kế (OQ-141: scan latch %I từ IoBus/TagDB rồi mới áp force):
ghi input khi đang chạy bị latch xóa ngay scan sau — E6 phải Force input
mới seal được (xem STATE §22). Write vào ref đang force → bỏ qua im lặng
(OQ-141). Sai kiểu → `TAG-E001`.

**VERIFIED (scan/cyclic OB, §8.2).** Rebase lưới ở bước đầu sau start
(`lastScanTimeMs = simTimeMs`): OB35 period 100 phase 0 chạy ở scan t=100,
200 (không phải t=10); phase 50 chạy ở t=50, 150 (golden scan ghim).
Cyclic OB không có `cycleMs` → period mặc định 100 ms (OB30–38); muốn đặt
`cycleMs` phải qua `organization` trong YAML golden (compileScl không sinh
`cycleMs` từ SCL).

**VERIFIED (LAD box TON + JSON).** Box TON bắt đầu đếm ở scan đầu tiên có
IN=true (t=100), khác FB_Motor (seal đặt SAU lệnh gọi timer nên timer bắt
đầu t=200 — golden lad-box-ton ghim ET=2900 ở t=3000, Q ở t=3100). Golden
LAD cần DB SCL trước (OQ-214).

**VERIFIED (SoftPlc start qua server/CLI — bug thật sửa ở P1.7).**
`SoftPlc` khởi tạo ở STOP; `step()` ở STOP là no-op; trước P1.7 chỉ golden
runner gọi `start()`. Server/CLI nạp PLC qua `softPlcExtension` nhưng không
ai gọi `start()` → PLC chết (Run không scan). Sửa: `startPlcControllers
(bundle)` (`apps/server/src/plc.ts`) — start mọi controller introspectable
(`start()` là no-op khi đã RUN); gọi trong `SimulationService.run()`/`step()`
và CLI `runCommand` sau `createSimulation`. Cold reset (`resetAll`) đưa PLC
về STOP (OQ-140); lần run/step sau start lại (rebase lưới + OB100 — đúng
ngữ nghĩa STOP→RUN). Hồi quy: `plc.test.ts` "sim.command run → scanCount
≥ 2".

**VERIFIED (fail-fast PLC, OQ-217 — tier B, quyết lúc triển khai).**
`vcs run`/`vcs serve` trên project có `plc/` biên dịch lỗi → FAIL FAST
(exit 2 + in diagnostics, như project-invalid), không chạy khi thiếu PLC.
Lý do: sai im lặng nguy hiểm hơn lỗi ồn ào (SOUL); luồng editor
(POST /api/plc/files + build) là để kiểm tra code. Project không có `plc/`
không ảnh hưởng.

**VERIFIED (bench + tối ưu, M1 §12.4).** Bench `bench/softplc.bench.ts`:
FB_Motor §13 × 200, ngưỡng ≥ 1000 scan/s, heap < 1 MB/2000 scan. Baseline
127 scan/s → sau tối ưu **1652–1660 scan/s PASS** (đo ở `/tmp/vcs-p17`,
trung vị 5×2000 scan; heap +0.17–0.19 MB PASS). Các bước (đo lại sau mỗi
bước, golden xanh sau mỗi bước — xem STATE §22): (A) index DB theo tên
(0× — quét DB không phải cổ chai, giữ lại vì đúng đắn); (B) fast path
`callFb` cho instance dbField + mọi arg scalar + không IN_OUT: resolve
view/offset/field một lần lúc compile, mỗi scan ghi/đọc trực tiếp qua
`writeMemValue`/`readMemValue` — bỏ 8 `viewFieldRef` (~9 closure mỗi cái)
mỗi lần gọi (127 → 618); (C) `createFrame` dùng chung Map rỗng cho section
không có biến (mọi ghi vào frame map đều qua `byName` — xem `createFrame` +
`#localRef` + `invokeFc`; vòng lặp reset về mặc định vẫn chạy khi section
có biến, nên map share không bao giờ giữ giá trị cũ — hồi quy
`softplc.test.ts` "hai instance cùng FB độc lập", kiểm chứng bằng mutation:
bỏ vòng reset → test đỏ `[0,5]`) (618 → 760); (E) `viewFieldRef` tính
trước offset tương đối + field lá lúc compile (canonical layout: fields của
DB đầu tiên mỗi FB — constructor kiểm chứng mọi DB cùng FB có cùng layout,
lệch thì loại khỏi map, dùng slow path) (760 → 1652). Không làm Opt D
(callSys tái dùng Map theo site — không cần vì đã vượt ngưỡng với biên 65%;
ghi làm cơ hội sau). "set TextDecoder" 21.6% trong profile tsx là artifact
của tsx (không có `TextDecoder` nào trong code; profile CLI dist không thấy
nó) — không truy tiếp vì bench A/B đã cho đáp án.

**VERIFIED (server/CLI/web P1.7).** `compileProject` discovery `plc/*.scl`
rồi `*.lad.json`, sort case-insensitive theo tên, LAD sau SCL; file lạ bỏ
qua; JSON LAD hỏng → diagnostic LAD-S001; `loadPlcProgram` null khi không có
file PLC. CLI: `vcs golden run <path>` exit 0/1/2 (0 pass hết, 1 ≥1 golden
fail, 2 không chạy được — thiếu path/không có file golden); `vcs run
--scans N` đếm `scanCount` SoftPlc (cap `N*1000+1000` bước, không treo);
`vcs ir dump <dir>` = compileProject (project có `plc/` → kèm tags; thư mục
plc trần → không tags). REST: `POST /api/plc/build` compile-check (luôn 200,
`ok=false` khi lỗi, KHÔNG hot reload) + `POST /api/plc/files` (chỉ trong
`plc/`, 400 khi thoát ra ngoài) + `GET /api/plc/files?path=` (thêm ngoài
plan — editor cần ĐỌC file; 404 khi thiếu, 400 khi thoát). WS `plc.watch`
validate ref ngay (ref sai → error `TAG-E003`, không đăng ký); `plc.values`
10 Hz LWW theo chỉ số watch; `plc.write`/`force`/`unforce` sai kiểu →
`TAG-E001`; project không PLC → `SIM-E001`. `sim.state.plc?` additive
`{scanCount, faultCount}`. Web PLC Workspace: cây file + Monaco (0.57.0,
worker `monaco-editor/editor/editor.worker.js?worker` — đường dẫn
`esm/vs/...` KHÔNG resolve dưới Vite 8/Rolldown) + Build/Save + Watch
(force có badge). Build status: `plcFiles.length === 0` → trống (chưa
build), có file + không lỗi → "Build OK", có lỗi → "Build lỗi" — sửa bug E6
phát hiện (trước đây `diagnostics.length === 0` → trống, build sạch không
hiện gì). E6: Build OK → ghi true khi IDLE → Force → Run → RUN_CMD TRUE →
Reset → FALSE, scan 0 (6/6 e2e xanh).

**UNVERIFIED (VERIFY, chờ PLCSIM/S1 — xem `docs/verify-experiments-draft.md`).**
Q đọc lại cùng scan (M1 §14 mục 10 — golden `bitlogic-read-q-same-scan`
ghim hành vi hiện tại, chưa đối chiếu TIA); TONR ET không clamp trên PT
(P-S6 ghim ET=1200 khi IN rớt sau khi vượt PT=1000 — §9.3 không có clamp,
chờ S1/PLCSIM; nếu TIA clamp thì SCR + sửa); `**` kết hợp phải (OQ-092);
tập `X_TO_Y`/`BOOL_TO_*` (OQ-115); OQ-129 (`#fb.IN :=`); FC trả qua tên
(OQ-112); lưới scan đều (OQ-130); đánh số DB 1..n (OQ-136); OV/ENO;
OQ-083/084 layout (chờ PLCSIM E11); ngữ nghĩa std block P1.5; RLO/EN-gating
LAD (OQ-184/185); LAD instance DB (OQ-188).

## 19. PWA shell + kiosk (M0 §8.2–8.3, P0.9)

**VERIFIED.** Manifest `manifest.webmanifest` (name "Virtual Commissioning
Studio", short_name "VCS", display standalone, lang vi, theme #111827;
icon 192/512 + 512 maskable + apple-touch 180 — PNG vẽ từ SVG bằng
Playwright screenshot, không thêm dep). Service worker `sw.ts`
(injectManifest — xem OQ-234): precache toàn bộ dist (107 entries,
~13.9 MiB, `maximumFileSizeToCacheInBytes` 8 MiB vì chunk ts.worker của
Monaco 6.93 MB); `directoryIndex: ''` — request "/" KHÔNG map sang
precached index.html (nếu không, lúc online trả shell cũ trong cache thay
vì index.html mới, lúc offline trả app nửa chết thay vì trang offline —
trái OQ-219). Navigation NetworkOnly + `setCatchHandler` → precached
`/offline.html` (trang tĩnh song ngữ vi/en); `/api` NetworkOnly, `/ws`
không qua SW, POST không bao giờ cache. Server: `Cache-Control: no-cache`
cho `/sw.js` + manifest (OQ-223). Cập nhật: banner "Có bản mới" khi SW mới
chờ (workbox `waiting` → `onNeedRefresh`), không tự reload; editor bẩn
(dirty) → `window.confirm` trước khi reload (OQ-222). Kiosk `?kiosk=1`:
ẩn header controls + tab PLC Workspace, thanh kiosk (Fullscreen/Thoát),
viewport `maximum-scale=1, user-scalable=no` chỉ trong kiosk; Wake Lock
acquire khi vào kiosk + acquire lại khi tab hiện lại, release khi thoát
(OQ-226/227/228; Fullscreen chỉ từ nút bấm — trình duyệt cấm tự động).
Không có SW ở `vite dev` (OQ-231). E7.1–E7.5 xanh ở CI, E7.6 opt-in
(`VCS_RUN_PWA_UPDATE=1`) xanh thủ công.

**UNVERIFIED (chờ kiểm tay — xem `docs/verify-owner-guide.md` mục P0.9).**
Kiosk trên tablet thật (cảm ứng, Fullscreen, Wake Lock, pull-to-refresh/
zoom) chưa kiểm được bằng desktop Chromium; HTTPS cho LAN chưa quyết
(D-007, ADR-0009 đề xuất A mkcert) nên PWA trên LAN qua HTTP vẫn không
đăng ký được service worker — chỉ localhost đầy đủ.

## 20. Plant — model, adapter, nguồn, lỗi tín hiệu (M2 §3–§6, P2.1)

**VERIFIED (bảng tính tay A–D, ghim bằng test).** Adapter raw↔eng tuyến tính
(§3.2): `raw = clampRaw(round((eng − engMin) × (rawMax − rawMin)/(engMax − engMin) + rawMin))`,
chỉ RAW bị kẹp [−4864, 32511], eng KHÔNG kẹp (bảng A: 110 → 30413,
125 → 32511, −20 → −4864; dải ngược 0..100 → 27648..0). Dải đo resolve theo
thứ tự `params.engMin/engMax` → `tag.signal.scaling` → mặc định 0..100
chỉ khi unit `%`, còn lại PL-E012. Nguồn: `manual` (giá trị đặt tay, hiệu
lực từ bước kế), `const`, `ramp` tuyến tính from→to trong durationMs,
`sine` mean/amp/periodMs (pha từ `setAtMs`), `link` đọc observable thiết bị
khác theo topo (Kahn, id tăng dần khi hòa) — `eng = obs × scale + offset`
(mặc định scale=1, offset=0, OQ-249). Delay line: trễ n = round(delayMs/stepMs)
bước; lag τ, rate-limit, hysteresis (OQ-240: delay cấp phát 1 lần lúc inject).
PRNG mulberry32 + FNV-1a (bảng C): `seed_i = hash32(seed + ':' + id)`,
spare Box–Muller nằm trong state nên snapshot/restore giữ dãy Gauss.
Lỗi tín hiệu (§6.2): áp theo thứ tự delay → gain → offset → drift → noise →
spike → stuck → freeze → invert → outOfRange → wireBreak — terminal thắng
(wireBreak/outOfRange thắng stuck, OQ-241); cmd: stuckCmd → stuck → freeze →
invert (DO) → lost thắng cuối. PlantEngine tất định: cùng seed/config/đầu
vào → TraceHasher giống hệt (2 run độc lập, đảo thứ tự khai báo, restore
tại T=300 — bảng D); event log là ring 100000, ghi đè im lặng (OQ-247),
không vào snapshot.

**UNVERIFIED (chờ kiểm tay — xem `docs/verify-owner-guide.md` mục P2.1).**
Raw clamp §3.2 (rawMin −4864/rawMax 32511) và `wireBreakRaw` mặc định 32767
là giá trị spec chọn, chưa đối chiếu với S7 thật; tag Real ghi eng trực
tiếp sau `Math.fround` (PL-W020 ở validate, OQ-239) chưa kiểm chứng với
PLC thật; lag/rate-limit/hysteresis và delay line chưa đối chiếu với hành vi
thiết bị thật (chỉ có bảng tính tay nội bộ). Model thật đầu tiên là
`motor_dol` ở P2.2 (OQ-246); `fake_motor`/`fake_sensor` chỉ phục vụ test.

## 21. Plant — model `motor_dol` (M2 §7.1, P2.2)

**VERIFIED (bảng tính tay A–K, ghim bằng 14 golden + unit test).** Máy trạng
thái 5 trạng thái, 6 luật theo thứ tự 1–6, một chuyển đổi duy nhất mỗi bước
(OQ-255); `speedPct`/`currentFb` tính theo state SAU chuyển đổi (OQ-256).
`speedPct` tăng `100/accelTimeMs`, giảm `100/coastTimeMs` mỗi ms (rate
limiter P2.1); `currentA = rated × (noLoad + (1−noLoad) × load × speed/100)`
+ inrush `rated × (inrushMult−1) × (1−(T−t0)/inrushMs)` trong `inrushMs` đầu,
bằng 0 khi state ∉ {STARTING, RUNNING}. Emit mỗi bước: `runFb =
state ∈ {RUNNING, STOPPING}`; `overloadOk = overloadNC ? (state != TRIPPED)
: (state == TRIPPED)`; `ready = readyOk && state != TRIPPED`;
`remote = remoteOk` (OQ-259). `tripClearedAt` mirror
`FaultManager.clearedAtMs` (OQ-263). Golden runner: `cmd`/`fault` áp SAU
`engine.step(t)`, `expect` kiểm sau step(t) (OQ-254); số so `|a−b| ≤ 0.01`
mặc định (OQ-257). Snapshot/restore: `snapshot()` deep-copy state
(`structuredClone`) — giữ reference làm restore không tua được state
(lỗi nền P2.1 do P2.2 phát hiện, đã sửa).

**UNVERIFIED (chờ dữ liệu motor thật — S1).** `defaultRemote`/`defaultReady`
được chấp nhận nhưng không ảnh hưởng hành vi P2.2 (OQ-259): nếu motor thật
cho thấy ready/remote phải đọc từ tiếp điểm ngoài thì cần SCR. Ngữ nghĩa
thời gian (start/stop/trip delay, tốc độ tăng/giảm, inrush) chỉ có bảng
tính tay nội bộ, chưa đối chiếu với động cơ thật. `ctx.fault()`/`ctx.emit()`
của engine cấp phát object nhỏ mỗi bước (OQ-267) — đã đo và sửa ở P2.3
(commit 10, xem §22): cached fault result, applyEmit slot tái dùng, emit
key tính trước; profile sau fix phẳng, ngưỡng §12 vẫn chưa đạt.

## 22. Plant — 8 model còn lại (M2 §7.2–§7.8, P2.3)

**VERIFIED (bảng tính tay A–K, ghim bằng 63 golden mới + unit test; tổng golden plant 77 incl. motor_dol 14).**
- `motor_vfd`: speedRef ramp theo accel/decel, speedPct/currentFb mirror motor_dol; `faultNC` default true (OQ-275); 10 golden.
- `valve_onoff`: state suy bằng eps 1e-9 (OQ-302 — 0.1 cộng 1000 lần = 99.9999999999986, không đạt đúng 100); `faultNC` default false; 10 golden.
- `valve_ctrl`: deadband 0.5; posRef qua AO lượng tử hóa — dừng ở 79.5 thay vì 79.55 (OQ-303); 6 golden.
- `damper` = deriveModel(valve_ctrl, strokeTimeS 30); 3 golden (không có tối thiểu §11.1, OQ-298).
- `analog_sensor`: firstOrder theo tau, nhiễu Box-Muller seed 42 (OQ-285); 0 equipment fault; 10 golden.
- `switch_di`: hysteresis + offDelay chỉ giữ khi trước đó đã active (guard); 8 golden.
- `silo_bin`: hysteresis nghiêm ngặt (bật ≥, tắt <); 0 equipment fault; named sources inflow/outflow (OQ-290); 8 golden.
- `conveyor_simple` = deriveModel(motor_dol) + step wrapper: delay line ring buffer inline (DelayLine không JSON-serializable trong state); beltBlocked đóng băng delay line (idx đóng băng cùng buf — vật liệu replay khi idx quay lại 0..600); pullCord hardwired chặn runCmd; zeroSpeed nghiêm ngặt `<` threshold; load source thắng loadTph (`hasSource`, OQ-294); 8 golden.
- Named sources (OQ-290): `sources?` trong instance, `StepCtx.source(name?)`/`hasSource(name?)`, resolve mỗi bước, validate link + topo chu trình PL-E020, snapshot/restore mở rộng.
- Hiệu năng (OQ-267/OQ-297/OQ-304, đo-trước-sửa-sau): bench plant 500 thiết bị — trước fix trung vị 128 bước/s (phạm vi 120–131); sau fix trung vị 1300 bước/s (phạm vi 1207–1394) — ×10,2 nhưng vẫn dưới ngưỡng M2 §12 (≥ 5.000 bước/s, thiếu ×3,85). Đã sửa: EventLog ring buffer (`shift()` O(n) chiếm 74,7% CPU trước fix), cached `equipmentFault` result, `applyEmit` slot tái dùng, emit key tính trước, hoist `getObs` closure. Profile sau fix phẳng (`step` 19,8%, `#emit` 19,7%, còn lại rải rác) — không còn điểm nóng đơn lẻ; heap −16,18 MB PASS (< 1 MB). P2.4 (D-008/A22, 2026-11-26): sau A+B (kênh số StepCtx + bench bundle) plant trung vị 1941 bước/s (phạm vi 1840–2035), đo lại độc lập 2036 (1825–2131); ngưỡng M2 §12 hạ xuống ≥ 1.500 bước/s (min 1840 −15% = 1564 → làm tròn xuống trăm = 1500). Vòng kín trung vị 985 (973–1021) trong phiên đo — dưới 1000 do máy chậm (PLC 0,78–0,84 ms so với 0,614 ms lúc đo 1285 PASS); ngưỡng vòng kín 1000 không đổi.
- Synonym role (OQ-301): quy ước hậu tố mirror §7.1 (spec §7.2–§7.8 không liệt kê bảng synonym).

**UNVERIFIED (chờ dữ liệu thật — S1).** Ngữ nghĩa thời gian/lượng của 8 model (tốc độ van, tau sensor, độ trễ băng tải, mức silo) chỉ có bảng tính tay nội bộ, chưa đối chiếu thiết bị thật. Nhiễu analog_sensor (OQ-285) chưa kiểm với sensor thật. `defaultRemote`/`defaultReady` vẫn như §21 (OQ-259). Synonym OQ-301 là quy ước nội bộ, chưa có trong spec — auto-suggest P2.7 dùng quy ước này, cần xác nhận khi có I/O list thật (X-003). Ngưỡng §12 ≥ 5.000 bước/s chưa đạt (xem VERIFIED) — owner quyết 2026-11-26 09:34 +07: chọn (A) chấp nhận 1300 ở P2.3, làm lại vòng nóng ở P2.4 (plan riêng); ngưỡng §12 giữ nguyên, không hạ.

## 23. Vòng kín plant + SoftPlc + scenario (M2 §5.1, §11.4, P2.4) — VERIFIED (P2.4, commit 12)

**VERIFIED (bảng tính tay A–D STATE §27, ghim bằng demo A–D qua CLI `vcs plant run` — commit 2).**
- Vòng kín (M2 §5.1): một bước T: drain `post()` → faults.advance → plant → PLC scan → flush → advance. PLC thấy giá trị plant của cùng bước T (IoBus đọc thẳng TagDB); plant thấy output PLC từ bước T+dt (trễ 1 bước).
- TON thật: `elapsed = T − _start`, `_start` đặt ở scan đầu IN=true (scan đầu ET=0) — đã kiểm code `makeTon`. Bẫy bảng B: tính ET += dt/scan lệch 1 bước về 3100 (SAI); đúng là ET = T−110 → Q ở T=3110.
- Action đặt ở đầu bước T (trước plant.step); expects kiểm sau bước T đầy đủ (sau scan PLC + flush) — OQ-315.
- Scenario format (OQ-305): YAML `{ name?, simulation?: {stepMs?, plcScanMs?}, steps: [{at, set?, fault?, clear?, preset?}], expects: [{at, tags?, observables?}] }`; fault không có `when` (runner đặt `{at:'time', timeMs: at}`); tag expects so RAW, observable so eng; số |a−b| ≤ 0.01.
- `clear` trước bước T với `atMs = T` tường minh (`PlantEngine.clearFault(id, atMs?)`, mới ở P2.4 commit 2 — additive): `clearFault` không `atMs` lấy `#simTimeMs` (trước bước T còn là T−dt) → bảng A T=2990/3000 lệch 1 bước; clear sau bước cho clearedAtMs đúng nhưng lỗi còn hiệu lực trong bước T → bảng D T=3000/3800 sai. Chỉ `atMs` tường minh thỏa cả hai (xem STATE §27 "Lệch so với plan"). Đường WS clear (`plantFaultClear`, commit 11) áp cùng quy tắc: truyền atMs = simTime orchestrator tường minh — mặc định engine T−dt làm clearedAtMs lệch 1 bước, e2e A bắt được ở `OVL_OK=FALSE at T=2990`.
- CLI `vcs plant run` (OQ-306/307/316): exit 0 pass / 1 expect fail / 2 không chạy được / 3 sai tham số; override timing cờ CLI > scenario.simulation > project config; khi override plcScanMs, CLI ghi đè cả `config.scanPeriodMs` của controller def (nếu không SoftPlc vẫn scan theo def 100 ms, demo sai mốc); stepMs ≤ plcScanMs và plcScanMs bội stepMs, vi phạm → cảnh báo PL-W001, vẫn chạy.
- Determinism (OQ-317): scenario A 2 lần + restore ở T=1000 → cùng hash (test `scenario.test.ts`).

**VERIFIED (hoàn thiện commit 12 — bench + hot-loop + server/UI parity).**
- Bench vòng kín (OQ-314): `bench/closedloop.bench.ts` — 1 SoftPlc × FB_Motor §13 200× + 200 motor_dol, bước 10 ms. Commit 3: 1250 bước/s ≥ 1000 PASS (tách plant ~0,160 / PLC ~0,614 / còn lại ~0,013 ms/bước). Cuối P2.4 (commit 11): 1373 bước/s ≥ 1000 PASS (plant 0,134 / PLC 0,601 / còn lại −0,007 ms/bước). Dao động theo tải máy: các phiên chậm đo 963–985 (< 1000) với cùng code PLC — ngưỡng 1000 giữ nguyên, không hạ.
- Làm lại vòng nóng (commit 4–5 + A+B, OQ-309/310/311, D-008/A21/A22): kênh emit/cmd tính trước (commit 4); dispatch đơn hình theo model (commit 5, fallback topo thiết bị khi DAG model có chu trình); rồi A kênh số StepCtx + B bench từ bundle esbuild. A +17,7% / B +8,0% / A+B +27,1% (cùng phiên: tsx 1527 → 1941; parent đo lại độc lập 2036). Ngưỡng plant §12 hạ 5000 → **1500 bước/s** (A22, D-008 — quyết định owner 2026-11-26: min quan sát −15%, tròn xuống trăm). Số cuối P2.4: bench plant 2706 bước/s (phiên commit 11) — ngưỡng 1500 giữ.
- Server/UI parity (OQ-308/318): WS `plant.fault.inject` / `.clear` / `.preset` (validate schema, lỗi → WS error kèm mã PL) + `GET /api/plant` + `GET /api/sim/hash`; `PlantFaultPanel` trong tab PLC Workspace (poll 1 s, inject/preset gửi `when {at:'time', timeMs: simTimeMs}`); e2e A–D qua UI thật (mọi expects tại mọi mốc + stepCount + CLI hash == golden commit 2 + UI hash tất định khi reset + lái lại). Inspector/designer đầy đủ ở lại P2.8.
- **Phát hiện về hash UI vs CLI (ghi lại, không phải lỗi sản phẩm):** hash UI ≠ hash CLI dù multiset (ts, handle, value) giống hệt cả 4 scenario (A: cùng 19 event, runner `ce95b887…` vs UI `541d4d92…`). Nguyên nhân: `TagDB.flush()` gộp mọi thay đổi trong bước theo handle tăng dần — runner post set trước bước nên flush cuối bước T=0 ra `[STOP_OK(h1), OVL_OK(h2), PERM(h3)]`; UI tag.write khi paused flush ngay từng write nên ra `[STOP_OK, PERM, OVL_OK]`; hasher băm theo thứ tự nhận. Không thể xen kẽ qua UI (sau bước, clock đã sang T+10; set muộn đóng dấu T+10). So hash UI == CLI cần đổi hasher/flush — tier C, chưa làm (xem STATE §27 "Lệch so với plan").

**UNVERIFIED (chờ dữ liệu thật — S1).** Demo A–D chỉ kiểm vòng kín với FB_Motor + motor_dol; ngữ nghĩa timer/counter/layout giữ nguyên từ §15–17.
