# M2 — Plant Engine và Import I/O List: Đặc tả chi tiết

> Thuộc dự án VCS (xem `PRD.md`: M2, FR-101…106, FR-401…405, FR-402, FR-403, FR-404; phụ lục B).
> Phiên bản: 0.1 (2026-11-21). Thời lượng dự kiến: 2–3 tuần công (10–15 ngày làm việc). **Điều kiện đầu vào:** M1 đã đạt nghiệm thu (SoftPlc chạy được, `TagAddressMap`, `IoBus` interface, force/snapshot).
> Quy ước như M1: spec thắng kiến thức sẵn có của AI; chỗ chưa chắc gắn `VERIFY` và có giá trị mặc định; nếu gặp tình huống ngoài spec → chọn phương án đơn giản, ghi `docs/open-questions.md`, thêm test thể hiện lựa chọn.

---

## 1. Mục tiêu và phạm vi

### 1.1 Mục tiêu
1. **Plant engine** deterministic chạy các mô hình thiết bị hiện trường, nối với controller qua tag/I-O bus, có **tiêm lỗi** (equipment fault + signal fault).
2. **Thư viện thiết bị P0**: `motor_dol`, `motor_vfd`, `valve_onoff`, `valve_ctrl` (+ `damper`), `analog_sensor`, `switch_di` (level/zero-speed/pull-cord/limit), `silo_bin`, `conveyor_simple`.
3. **Import I/O list** (CSV/XLSX) với column mapping, chuẩn hóa địa chỉ (kể cả ký hiệu Đức E/A), kiểm tra chất lượng, sinh `tags/tags.yaml`.
4. **Auto-suggest thiết bị**: gom tín hiệu theo thiết bị, đoán model và vai trò tín hiệu (role), có độ tin cậy và lý do; người dùng duyệt hàng loạt.
5. Chạy **vòng kín** `FB_Motor (SoftPlc) ⇄ motor_dol (plant)` và quan sát/tiêm lỗi từ UI.

### 1.2 Trong phạm vi (P0)
FR-101 (một phần: schema file plant/import), FR-102, FR-103, FR-105, FR-106, FR-401, FR-402, FR-403, FR-404, FR-405.

### 1.3 Ngoài phạm vi M2 (không làm)
Import C&E matrix (M3), test DSL/runner/báo cáo (M3), process model dạng mạng lưu chất (FR-406), thư viện xi măng chuyên dụng (FR-407), import motor list/instrument list (FR-409), OPC UA/Modbus (M4), SimaticML (M5), 3D. Liên kết quá trình trong M2 chỉ ở mức "observable link" đơn giản (mục 3.4).

---

## 2. Cấu trúc package

```
packages/
  schemas/src/
    equipment.ts  naming.ts  import-profile.ts  tags.ts  fault.ts      # zod + TS types (mục 4)
  plant/
    src/
      engine.ts            # PlantEngine
      registry.ts          # registerModel / getModel / listModels
      adapter.ts           # chuyển đổi raw <-> eng, polarity, kiểu dữ liệu
      faults.ts            # FaultManager (equipment + signal faults)
      source.ts            # resolve "manual | link | ramp | sine" sources
      rng.ts               # PRNG seeded (mulberry32), không dùng Math.random
      delay.ts             # delay line (ring buffer)
      events.ts            # EventLog
      models/
        motor_dol.ts motor_vfd.ts valve_onoff.ts valve_ctrl.ts damper.ts
        analog_sensor.ts switch_di.ts silo_bin.ts conveyor_simple.ts
        index.ts
      docgen.ts            # sinh docs/equipment/<model>.md từ định nghĩa model
    test/ golden/
  importers/
    src/
      io-list/
        read-csv.ts read-xlsx.ts sniff.ts header-detect.ts
        mapping.ts transform.ts address.ts normalize.ts validate.ts
        diff.ts commit.ts report.ts
      suggest/
        naming.ts classify.ts roles.ts score.ts suggest.ts
      index.ts
    fixtures/  test/
  kernel/src/
    orchestrator.ts        # SimulationOrchestrator (vòng lặp mục 5.1)
    iobus.ts               # IoBusImpl dựa trên TagDB
scripts/
  gen-io-fixture.ts        # sinh fixture 300 tín hiệu + ground truth (mục 11.3)
docs/equipment/*.md        # sinh tự động
```

Quy tắc phụ thuộc: `plant` chỉ phụ thuộc `schemas` + `kernel` types (TagDB, SimClock). `plant` **không** biết `runtime-iec`, `importers`. `importers` phụ thuộc `schemas` và `plant/registry` (lấy role/synonym từ model; mục 9.2). Đọc XLSX bằng **`exceljs`** (MIT), CSV bằng `papaparse` (hoặc tự viết RFC 4180); parse chạy ở server/Node (UI upload lên server local), có CLI `vcs import-io`.

---

## 3. Khái niệm cốt lõi

### 3.1 Tín hiệu, hướng, vai trò (role)
- **Hướng luôn tính theo góc nhìn PLC**: `DI`/`AI` = plant → PLC (plant ghi, PLC đọc); `DO`/`AO` = PLC → plant (PLC ghi, plant đọc).
- Mỗi model khai báo danh sách **role**: tên chuẩn (`runCmd`, `runFb`, `speedRef`...), kind (DI/DO/AI/AO), kiểu dữ liệu, đơn vị kỹ thuật, `optional`, và **synonyms** (từ khóa nhận diện, dùng cho auto-suggest). Đây là **nguồn sự thật duy nhất** cho cả engine lẫn importer.
- Một **equipment instance** gán mỗi role → một tag (tên tag trong `tags.yaml`), hoặc để trống nếu role optional.
- **Ownership của tag:** tag có `signal.kind` DI/AI do plant sở hữu (nếu đã gán thiết bị); DO/AO do controller sở hữu. Tag **chưa gán** thiết bị: giữ giá trị do test/HMI/người dùng ghi (virtual input). Một tag gán cho nhiều role/thiết bị → lỗi `PL-E003`.

### 3.2 Đơn vị kỹ thuật và scaling
- Model **luôn làm việc bằng đơn vị kỹ thuật (eng)**: %, bar, °C, A, t/h, bool.
- **Adapter** (`adapter.ts`) chuyển giữa raw (giá trị tag) và eng:
  - **AI (plant → PLC):** `raw = round((eng − engMin)/(engMax − engMin) × (rawMax − rawMin)) + rawMin`, mặc định `rawMin=0, rawMax=27648` (4–20 mA chuẩn hóa S7) và **kẹp** trong `[−4864, 32511]` (vùng under/over-range) `VERIFY`.
  - **AO (PLC → plant):** `eng = rawToEng(raw)` với cùng thông số; `speedRef`/`posRef` mặc định eng = % (0..100).
  - **Nguồn thông số** (ưu tiên giảm dần): `params.engMin/engMax` của thiết bị (khoảng hiệu chuẩn của transmitter/biến tần) → `tag.signal.scaling` từ I/O list → mặc định theo role (ví dụ % → 0..100). Role analog không xác định được khoảng → lỗi `PL-E012`.
  - Kiểu dữ liệu tag AI/AO mặc định `Int`; nếu tag khai báo `Real` thì adapter ghi **trực tiếp eng** (không scale) — dùng cho mô phỏng bus số (P1: ghi cảnh báo `PL-W020`).
- **DI/DO:** bool; polarity xử lý bằng tham số của model (`overloadNC`, `invert`), không xử lý ở adapter.

### 3.3 Hai loại lỗi
- **Equipment fault**: do model định nghĩa, có ngữ nghĩa vật lý (overload, stuck valve...). Mục 6.1.
- **Signal fault**: áp dụng chung cho **bất kỳ** tín hiệu (stuck, wire break, delay, drift, noise, spike, invert, chatter). Mục 6.2. Nhiều lỗi "thông thường" (mất feedback, kẹt tín hiệu) thực hiện bằng signal fault, không cần viết lại trong từng model.
- **Preset** là tên gọi tắt ánh xạ sang signal fault (ví dụ `noRunFeedback` = `stuck(false)` trên role `runFb`). Preset do model khai báo.

### 3.4 Observable và liên kết quá trình đơn giản
- Model công bố **observable** (biến trạng thái đọc được): ví dụ `motor.speedPct`, `motor.currentA`, `valve.posPct`, `silo.levelPct`, `conveyor.deliveredTph`.
- Một nguồn (`source`) của sensor/switch/silo có thể **link** tới observable của thiết bị khác:
  ```yaml
  source: { kind: link, equipment: CR01_M01, observable: currentA, scale: 1, offset: 0 }
  ```
- Các loại source P0: `manual` (đặt từ UI/test), `const`, `ramp {from,to,durationMs}`, `sine {mean,amp,periodMs}`, `link`. Đồ thị link phải **không có vòng** (kiểm tra khi load: `PL-E020`). Thứ tự cập nhật thiết bị = sắp xếp topo theo link, bằng tên khi không phụ thuộc nhau (deterministic).

---

## 4. Schema dữ liệu (zod trong `packages/schemas`)

### 4.1 `tags/tags.yaml` (mở rộng so với PRD 8.2)
```yaml
- name: CR01_M01_RUN_CMD
  type: Bool                         # Bool | Int | DInt | Real | Word ...
  area: Q                            # I | Q | M | DB
  address: "%Q0.0"
  controller: PLC1
  description: Crusher motor run command
  signal:
    kind: DO                         # DI | DO | AI | AO | null (tag nội bộ M/DB)
    scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 100, unit: "%" }   # chỉ AI/AO
    polarity: NO                     # NO | NC (thông tin từ I/O list, chỉ để hiển thị/gợi ý)
  origin: { file: io-list.xlsx, sheet: "IO", row: 15 }   # truy vết nguồn import
  provenance: import                 # import | manual (trường người dùng đã sửa tay giữ nguyên khi re-import)
  equipment: CR01_M01                # gán ở bước gán thiết bị (có thể rỗng)
  role: runCmd
```
> Thay đổi so với PRD 8.2: bỏ `plantRef` (thay bằng `equipment` + `role`; nguồn sự thật gán nằm ở `equipment.yaml`, các trường này trong `tags.yaml` chỉ là bản sao denormalized do tool ghi, **không** sửa tay). Nếu mâu thuẫn, `equipment.yaml` thắng.

### 4.2 `plant/equipment.yaml`
```yaml
- id: CR01_M01
  model: motor_dol
  description: Crusher main motor
  controller: PLC1
  params:
    startDelayMs: 500
    stopDelayMs: 800
    ratedCurrentA: 120
  signals:                      # role -> tag
    runCmd:     CR01_M01_RUN_CMD
    runFb:      CR01_M01_RUN_FB
    ready:      CR01_M01_READY
    remote:     CR01_M01_REMOTE
    overloadOk: CR01_M01_OVL_OK
    currentFb:  CR01_M01_CUR
  initial: { }                  # trạng thái ban đầu (tùy model)
- id: CR01_LT01
  model: analog_sensor
  params: { engMin: 0, engMax: 100, unit: "%", tauMs: 500, noiseStd: 0 }
  source: { kind: link, equipment: CR01_BIN01, observable: levelPct }
  signals: { raw: CR01_LT01_PV }
```

### 4.3 `plant/naming.yaml` (cấu hình quy ước đặt tên, mục 9)
```yaml
convention: cement-default
tagPattern: "^(?<area>[A-Z]{2}\\d{2})[_-](?<eqcode>[A-Z]{1,4}\\d{2,3})[_-](?<role>[A-Z0-9_]+)$"
equipmentIdTemplate: "{area}_{eqcode}"
equipmentCodeToModel:             # theo tiền tố chữ của eqcode (so khớp dài nhất trước)
  MV:  motor_vfd
  M:   motor_dol
  XV:  valve_onoff
  FCV: valve_ctrl
  CV:  valve_ctrl
  DMP: damper
  PT:  analog_sensor
  TT:  analog_sensor
  LT:  analog_sensor
  FT:  analog_sensor
  WT:  analog_sensor
  ST:  analog_sensor
  LSH: switch_di
  LSL: switch_di
  ZS:  switch_di
  SS:  switch_di
  PC:  switch_di          # pull-cord
  BIN: silo_bin
  SILO: silo_bin
  BC:  conveyor_simple
roleOverrides:                     # bổ sung synonym theo dự án (suffix -> role), mở rộng bộ synonym của model
  RUN_ST: runFb
```

### 4.4 `io/import-profile.yaml`
```yaml
name: Project X IO list
file: io/IO_list_rev3.xlsx
sheet: "IO List"
headerRow: 6
firstDataRow: 7
lastDataRow: null              # null = tới hết
skipRowsWhen: [ { column: tag, empty: true } ]
fillDownColumns: [ station ]   # cột bị merge dọc cần điền xuống
encoding: auto                 # auto | utf-8 | windows-1252 ...
delimiter: auto                # chỉ CSV
mapping:                       # canonical field -> cột (theo tên header hoặc chỉ số A,B..)
  tag: "Tag Name"
  description: "Description"
  signalType: "Type"
  address: "Address"
  controller: "PLC"
  engMin: "Range Lo"
  engMax: "Range Hi"
  unit: "Unit"
  equipment: "Equipment"       # tùy chọn
  polarity: "NO/NC"
transforms:
  - { field: tag, op: replace, pattern: "\\s+", with: "_" }
  - { field: tag, op: upper }
  - { field: signalType, op: map, table: { "DE": DI, "DA": DO, "AE": AI, "AA": AO, "Digital Input": DI } }
defaults: { controller: PLC1 }
addressDerive:                 # tùy chọn: sinh địa chỉ từ module + kênh khi cột address trống
  moduleStartColumn: "Module Start"
  channelColumn: "Channel"
  moduleTypeColumn: "Module"   # ví dụ DI16, DQ16, AI8, AQ4
rules: { duplicateTag: error, duplicateAddress: error, missingType: error, missingRange: warn }
```

### 4.5 TypeScript (rút gọn, bám sát)
```ts
export type SignalKind = 'DI' | 'DO' | 'AI' | 'AO';
export interface RoleDef {
  role: string; kind: SignalKind; dataType: 'Bool' | 'Int' | 'Real';
  unit?: string; optional?: boolean; description: string;
  synonyms: string[];               // hậu tố/từ khóa tag: ['RUN_FB','RUNNING','AUX','RUN_ST']
  descKeywords: string[];           // từ khóa mô tả vi/en/de: ['run feedback','phản hồi chạy','rückmeldung']
}
export interface ObsDef { key: string; unit?: string; description: string }
export interface FaultDef { id: string; description: string; paramsSchema?: ZodTypeAny }
export interface StepCtx<P, S> {
  dtMs: number; simTimeMs: number; params: P; state: S;
  cmd(role: string): boolean | number | undefined;        // giá trị PLC→plant (eng) ; undefined nếu role chưa gán
  has(role: string): boolean;                             // role đã gán tag?
  emit(role: string, v: boolean | number): void;          // plant→PLC (eng); engine lo scaling + signal fault
  fault(id: string): { active: boolean; params: any; sinceMs: number; clearedAtMs?: number } ;
  source(): number | boolean;                             // giá trị nguồn đã resolve (manual/link/ramp/...)
  rand(): number;                                         // PRNG seeded, [0,1)
  setObs(key: string, v: number | boolean | string): void;
  getObs(equipmentId: string, key: string): number | boolean | string | undefined;
  log(level: 'info' | 'warn', msg: string, data?: object): void;
}
export interface EquipmentModel<P = any, S = any> {
  type: string; version: number; description: string;
  roles: RoleDef[]; paramsSchema: ZodType<P>; defaultParams: P;
  observables: ObsDef[]; faults: FaultDef[];
  presets?: Record<string, { signalFault?: { role: string; type: SignalFaultType; params?: object }; equipmentFault?: { id: string; params?: object } }>;
  hasSource?: boolean;                 // sensor/switch/silo dùng `source`
  init(params: P, rng: () => number): S;
  step(ctx: StepCtx<P, S>): void;
}
```
Yêu cầu: `S` phải **JSON-serializable** (cho snapshot). Không lưu hàm/Map/Set trong state (dùng object/array).

---

## 5. PlantEngine

### 5.1 Vòng lặp mô phỏng và thứ tự (cố định, thay thế PRD 8.5 bằng chi tiết hơn)

`SimulationOrchestrator.step()` tại thời điểm mô phỏng `T` (ms), bước `dt = stepMs`:

```
1. externalInputs(T)         // test/HMI/force đã xếp hàng cho T: setManual, injectFault, write virtual inputs, force
2. faults.advance(T)         // kích hoạt/hết hạn các fault đã lên lịch
3. plant.step(T, dt)         // đọc tag DO/AO (giá trị PLC ghi ở scan trước), chạy model, ghi DI/AI vào TagDB
4. controllers[i].step(T,dt) // SoftPlc: latch input → chạy OB → ghi output (chỉ khi đến hạn scan)
5. gateways.publish(T)       // (M4) 
6. trace/events flush; clock.advance(dt)
```
Hệ quả có chủ ý, ghi trong `docs/semantics.md`:
- **PLC thấy giá trị plant của cùng bước T** (plant chạy trước controller).
- **Plant thấy output của PLC ở bước T chỉ từ bước T+dt** (độ trễ tối thiểu = 1 bước plant).
- Khi `plcScanMs > stepMs`, scan chỉ xảy ra ở một số bước; output PLC giữ nguyên giữa các scan.
- **Khuyến nghị khi cấu hình**: `stepMs ≤ plcScanMs` và `plcScanMs` là bội của `stepMs`. Nếu không → cảnh báo `PL-W001`.
- Test tích hợp trong spec này dùng `stepMs = plcScanMs = 10` để mọi mốc thời gian không mơ hồ (SoftPlc với `scanPeriodMs = dt` luôn scan ở mọi bước, kể cả `T = 0`).

### 5.2 API
```ts
export interface PlantConfig {
  stepMs: number; seed: number;
  equipment: EquipmentInstance[];       // từ equipment.yaml, đã validate
  tags: Map<string, TagDef>;
}
export class PlantEngine {
  constructor(cfg: PlantConfig, tags: TagDB, models?: ModelRegistry);
  validate(): Diagnostic[];                                // thiếu role bắt buộc, trùng tag, link vòng, thiếu range...
  step(simTimeMs: number, dtMs: number): void;
  // Nguồn/điều khiển thủ công
  setSource(equipmentId: string, source: SourceSpec): void;
  setManual(equipmentId: string, value: number | boolean): void;
  // Lỗi
  injectFault(req: FaultRequest): string;                  // trả faultId
  clearFault(faultId: string, at?: 'now' | number): void;
  clearAllFaults(): void;
  listFaults(): FaultInfo[];
  applyPreset(equipmentId: string, preset: string, at?: FaultTiming): string;
  // Quan sát
  getObservable(equipmentId: string, key: string): number | boolean | string;
  getState(equipmentId: string): unknown;                   // chỉ để debug
  events: EventLog;
  snapshot(): PlantSnapshot; restore(s: PlantSnapshot): void;
  reset(): void;                                           // về trạng thái init (cùng seed)
}
```

### 5.3 Determinism
- Mọi ngẫu nhiên qua `ctx.rand()`; mỗi thiết bị một PRNG: `seed_i = hash32(globalSeed, equipmentId)` (mulberry32). **Cấm** `Math.random`, `Date.now`, `performance.now` trong `plant` (lint rule).
- Cùng cấu hình + seed + chuỗi tác động ngoài (theo bước) → state, tag và event **giống hệt** (kiểm bằng hash trace, mục 11.2).
- Không phụ thuộc thứ tự hash của `Map`/`Object`: luôn duyệt theo thứ tự đã sắp (id tăng dần hoặc topo).
- Số học bằng `number` (double) nhưng các giá trị emit sang AI qua adapter được **làm tròn về số nguyên raw** → kết quả ổn định.

### 5.4 Bộ lọc/helper dùng chung
- **First-order lag chính xác theo bước**: `y += (target − y) × (1 − exp(−dt/τ))`; `τ ≤ 0` → `y = target`.
- **Rate limiter**: `y += clamp(target − y, −down×dt, +up×dt)` với `up/down` đơn vị/ms.
- **Delay line**: ring buffer theo số bước `n = round(delayMs/dt)`.
- **Hysteresis** & **on/off delay** helper cho switch.

### 5.5 Event log
`EventLog` ghi (tối đa N=100 000, vòng): `{ t, type: 'state'|'fault'|'signal'|'warn'|'info', equipment, key, from, to, msg }`. Model gọi `ctx.log`; engine tự ghi khi: chuyển trạng thái model (`state` observable đổi), fault bật/tắt, cảnh báo cấu hình. API xuất JSON; UI hiển thị.

### 5.6 Hiệu năng (xem mục 12)
Không cấp phát đối tượng trong `step`; state dạng object phẳng; tra cứu tag bằng index số đã resolve lúc `init`, không tra `Map<string>` mỗi bước.

---

## 6. Hệ thống lỗi

### 6.1 Equipment fault
```ts
export interface FaultRequest {
  target:
    | { equipment: string; fault: string; params?: object }                   // equipment fault
    | { equipment: string; signal: string /*role*/; type: SignalFaultType; params?: object }; // signal fault
  at?: 'now' | { timeMs: number } | { afterMs: number };   // mặc định 'now'
  durationMs?: number;                                     // tự gỡ sau durationMs
  repeat?: { periodMs: number; count?: number };           // P1, tùy chọn
  random?: { probabilityPerHour: number; seed?: number };  // P1: bật ngẫu nhiên có seed
}
```
- `FaultManager` giữ danh sách fault: `pending → active → cleared`. Mỗi fault có `id` (`F-0001`...), `sinceMs`, `clearedAtMs`.
- `ctx.fault(id)` trả trạng thái (active/params/sinceMs/clearedAtMs); model tự diễn giải.
- Bật/tắt fault tạo event + hiển thị UI.

### 6.2 Signal fault (áp dụng engine, sau `emit` hoặc trước `cmd`)

| type | Áp cho | Tham số | Hiệu ứng |
|---|---|---|---|
| `stuck` | mọi | `value` | giá trị cố định (eng/bool) |
| `freeze` | mọi | — | giữ giá trị tại thời điểm bật |
| `invert` | DI/DO | — | đảo bool |
| `offset` | AI | `value` (eng) | cộng offset |
| `gain` | AI | `factor` | nhân hệ số |
| `drift` | AI | `ratePerHour` (eng/h) | offset tăng tuyến tính theo thời gian từ lúc bật |
| `noise` | AI | `std` (eng) | cộng nhiễu Gauss (PRNG seeded, Box–Muller) |
| `spike` | AI | `magnitude`, `durationMs` | cộng xung 1 lần |
| `delay` | DI/AI | `ms` | trễ tín hiệu (delay line) |
| `wireBreak` | AI | — (`wireBreakRaw` ở cấu hình, mặc định 32767 `VERIFY` tùy module) | raw = giá trị lỗi dây; DI: false |
| `outOfRange` | AI | `raw` | ép raw |
| `chatter` | DI | `periodMs` | đổi trạng thái liên tục |
| `lost` | DO/AO (đầu vào của plant) | — | plant thấy 0/false |
| `stuckCmd` | DO/AO | `value` | plant thấy giá trị cố định |

Có thể chồng nhiều signal fault lên một tín hiệu; thứ tự áp: `delay → gain → offset → drift → noise → spike → stuck/freeze/invert/chatter/outOfRange/wireBreak` (cuối cùng thắng).

---

## 7. Thư viện thiết bị P0 (đặc tả hành vi)

Quy ước chung: thời gian theo `simTimeMs`; `dtMs` = `stepMs`; mỗi model có file `docs/equipment/<model>.md` sinh tự động từ định nghĩa (role/param/observable/fault/preset) — **bắt buộc** (script `pnpm docs:equipment`, CI kiểm tra file không lệch).

### 7.1 `motor_dol` — động cơ khởi động trực tiếp

**Roles**

| role | kind | type | optional | synonyms (suffix) |
|---|---|---|---|---|
| `runCmd` | DO | Bool | không | `RUN_CMD`, `START_CMD`, `RUN`, `START`, `CMD`, `BETRIEB_BEFEHL` |
| `runFb` | DI | Bool | không | `RUN_FB`, `RUNNING`, `RUN_ST`, `AUX`, `RUN_FBK`, `RUECKMELDUNG` |
| `ready` | DI | Bool | có | `READY`, `RDY`, `MCB_OK`, `BREAKER_ON` |
| `remote` | DI | Bool | có | `REMOTE`, `REM`, `AUTO_SEL` |
| `overloadOk` | DI | Bool | có | `OVL_OK`, `OL_OK`, `THERMAL_OK`, `OVERLOAD_OK`, `OVL` (đảo theo `overloadNC`) |
| `currentFb` | AI | Int | có | `CUR`, `CURRENT`, `AMP`, `I_ACT` (unit A) |

**Tham số (mặc định)**: `startDelayMs 500` (từ lệnh đến `runFb`), `stopDelayMs 800` (từ hết lệnh đến `runFb` về false), `accelTimeMs 1500`, `coastTimeMs 3000`, `tripDelayMs 0`, `overloadResetMs 1000`, `resetRequiresCmdOff true`, `overloadNC true` (`overloadOk = true` khi bình thường), `ratedCurrentA 0` (0 = không mô phỏng dòng), `noLoadCurrentFrac 0.35`, `loadFraction 0.8`, `inrushMult 6`, `inrushMs 1000`, `defaultRemote true`, `defaultReady true`.

**Trạng thái** `state ∈ {STOPPED, STARTING, RUNNING, STOPPING, TRIPPED}`; `t0` (lúc vào STARTING), `t1` (lúc vào STOPPING), `speedPct` (0..100), `tripClearedAt`.

**Điều kiện cho phép chạy** `canRun = remoteOk && readyOk` với `remoteOk = !fault('localMode').active (và nếu role remote có gán: emit remote = remoteOk)`, `readyOk = !fault('notReady').active`.

**Chuyển trạng thái tại mỗi bước T** (theo thứ tự kiểm tra):
1. Nếu `fault('overload').active` và state ∈ {STARTING, RUNNING}: sau `tripDelayMs` kể từ lúc fault bật → `TRIPPED` (`runFb=false`, `overloadOk` báo lỗi ngay khi vào TRIPPED).
2. `STOPPED`: nếu `runCmd && canRun && !fault('failToStart').active` → `STARTING`, `t0 = T`.
3. `STARTING`: nếu `!runCmd` → `STOPPED` (contactor chưa kịp hút, `runFb` không bao giờ lên). Nếu `T − t0 ≥ startDelayMs` → `RUNNING` (`runFb = true` từ bước này).
4. `RUNNING`: nếu `!runCmd` và `!fault('contactorStuck').active` → `STOPPING`, `t1 = T`.
5. `STOPPING`: khi `T − t1 ≥ stopDelayMs` → `STOPPED` (`runFb=false`). Nếu `runCmd` lại true trong lúc STOPPING: bỏ qua cho tới khi về `STOPPED`, sau đó áp dụng bước 2.
6. `TRIPPED`: khi `!fault('overload').active` **và** `T − faultClearedAt ≥ overloadResetMs` **và** (`!resetRequiresCmdOff || !runCmd`) → `STOPPED`.

**Đầu ra (emit) mỗi bước:**
- `runFb = (state ∈ {RUNNING, STOPPING})`.
- `overloadOk`: `healthy = (state != TRIPPED)`; giá trị emit = `overloadNC ? healthy : !healthy`.
- `ready = readyOk && state != TRIPPED`; `remote = remoteOk`.
- `speedPct`: `target = (state ∈ {STARTING, RUNNING}) ? 100 : 0`; tăng theo `100/accelTimeMs`, giảm theo `100/coastTimeMs` (rate limiter).
- `currentFb` (nếu `ratedCurrentA>0` và gán): khi contactor kéo (state ∈ {STARTING, RUNNING}): `I = rated × (noLoad + (1 − noLoad) × loadFraction × speed/100)`; trong `inrushMs` đầu từ `t0`: cộng `rated × (inrushMult − 1) × (1 − (T−t0)/inrushMs)`. Ngoài ra `0`.

**Observables:** `state` (chuỗi), `speedPct`, `currentA`, `running` (= `speedPct > 5`), `energized` (state ∈ {STARTING, RUNNING}).

**Equipment fault:** `overload`, `failToStart` (lệnh bị bỏ qua, không dòng), `contactorStuck` (giữ RUNNING dù hết lệnh; `runFb` vẫn true), `notReady`, `localMode` (PLC không điều khiển được; `remote=false`).
**Preset:** `noRunFeedback` = signal `stuck(false)` trên `runFb`; `feedbackStuckOn` = `stuck(true)` trên `runFb`; `overloadTrip` = equipment `overload`; `commandLost` = signal `lost` trên `runCmd`.

### 7.2 `motor_vfd` — động cơ biến tần

**Roles:** `runCmd` (DO), `speedRef` (AO, %), `runFb` (DI), `speedFb` (AI, %), `ready` (DI, opt), `vfdFaultOk` (DI, opt, true = không lỗi; `faultNC` tham số), `currentFb` (AI, opt, A), `remote` (DI, opt).
**Tham số:** `accelTimeS 10` (0→100%), `decelTimeS 10`, `minSpeedPct 0`, `maxSpeedPct 100`, `runThresholdPct 2`, `speedFbLagMs 200`, `coastTimeS 20` (khi lỗi/ngắt), `ratedCurrentA 0`, `loadFraction 0.7`.
**Hành vi:** `target = runCmd && canRun ? clamp(speedRef, minSpeedPct, maxSpeedPct) : 0`; `speed` đuổi theo `target` bằng rate limiter (up = `100/(accelTimeS×1000)`, down = `100/(decelTimeS×1000)` mỗi ms). `runFb = speed > runThresholdPct`. `speedFb = lag(speed, speedFbLagMs) + offset(fault)`. Khi `fault('vfdTrip')`: `target=0` với decel = `100/(coastTimeS×1000)`, `ready=false`, `vfdFaultOk=false`, `runFb` theo speed.
**Equipment fault:** `vfdTrip`, `rampFail` (speed đứng yên giá trị hiện tại), `speedDeviation{pct}` (speed thực = target ± pct), `commLoss` (ready=false, speedFb freeze, lệnh bị bỏ qua), `notReady`, `localMode`.
**Observables:** `speedPct`, `targetPct`, `currentA`, `running`, `state` (`STOPPED/RAMP_UP/AT_SPEED/RAMP_DOWN/TRIPPED`).

### 7.3 `valve_onoff` — van đóng/mở (kèm limit switch)

**Roles:** `openCmd` (DO), `closeCmd` (DO, opt), `openLs` (DI), `closedLs` (DI), `fault` (DI, opt; `faultNC`).
**Tham số:** `travelTimeMs 5000`, `singleSolenoid false` (nếu true: `openCmd=true` → mở, `false` → đóng về vị trí an toàn), `lsThresholdPct 1` (LS báo khi `pos ≥ 100−thr` hoặc `pos ≤ thr`), `initialPosPct 0`, `bothCmdPolicy 'hold'` (cả hai lệnh cùng true → giữ nguyên, log `warn` một lần).
**Hành vi:** `dir = +1 nếu openCmd (và !closeCmd cho double), −1 nếu closeCmd hoặc (singleSolenoid && !openCmd), 0 nếu hold`; `pos += dir × 100/travelTimeMs × dt` (clamp 0..100). `openLs = pos ≥ 100−thr`; `closedLs = pos ≤ thr`.
**Equipment fault:** `stuckOpen`, `stuckClosed`, `stuckAtPos{pct}` (vị trí đóng băng), `slowTravel{factor}` (nhân travelTime), `travelTimeout` (không đạt vị trí cuối, `fault=true`), `lsOpenFail`/`lsClosedFail` (LS tương ứng luôn false).
**Observables:** `posPct`, `moving`, `state` (`CLOSED/OPENING/OPEN/CLOSING/INTERMEDIATE`).

### 7.4 `valve_ctrl` và `damper` — van/damper điều khiển

**Roles:** `posRef` (AO, %), `posFb` (AI, %), `fault` (DI, opt), `closedLs`/`openLs` (DI, opt).
**Tham số:** `strokeTimeS 20`, `lagMs 0`, `deadbandPct 0.5`, `failPosition 'hold'|'close'|'open'`, `initialPosPct 0`, `posFbRange {engMin:0, engMax:100}`.
**Hành vi:** `target = |posRef − pos| > deadband ? clamp(posRef,0,100) : pos`; rate limiter với `100/(strokeTimeS×1000)`; `posFb = pos` (qua lag nếu `lagMs>0`).
**Equipment fault:** `stuck`, `drift{pctPerHour}`, `positionerFail` (posFb freeze + lệnh bỏ qua), `signalLoss` (posRef = failPosition).
`damper` = `valve_ctrl` với `strokeTimeS 30` mặc định, tên khác (đăng ký riêng, tái sử dụng cài đặt bằng composition helper `deriveModel(base, overrides)`).
**Observables:** `posPct`, `targetPct`.

### 7.5 `analog_sensor` — cảm biến tương tự

**Roles:** `raw` (AI, Int; unit theo param).
**Tham số:** `engMin`, `engMax`, `unit`, `tauMs 0`, `noiseStd 0`, `initialValue` (nếu source manual).
**Source** (bắt buộc): `manual | const | ramp | sine | link`.
**Hành vi:** `pv_target = source()`; `pv = lag(pv, pv_target, tauMs)`; `eng_out = pv + noise`; `emit('raw', eng_out)` (engine scale về raw theo `engMin/engMax`; clamp vùng over/under-range).
**Equipment fault:** không có riêng; dùng signal fault (`drift`, `stuck`, `freeze`, `noise`, `spike`, `wireBreak`, `offset`, `gain`).
**Preset:** `wireBreak`, `drift`, `stuck`, `noisy`.
**Observables:** `pv` (eng), `raw` (int).

### 7.6 `switch_di` — công tắc/limit/level/zero-speed/pull-cord

**Roles:** `di` (DI, Bool).
**Tham số:** `kind` (nhãn: `level_high|level_low|zero_speed|pull_cord|limit|generic`), `invert false` (đầu ra = `!active`), `onDelayMs 0`, `offDelayMs 0`, `threshold`, `hysteresis 0`, `condition 'gt'|'ge'|'lt'|'le'` (cho source dạng số), `initialActive false`.
**Source:** `manual` (bool, UI/test đặt), hoặc `link` tới observable số/bool kèm `condition/threshold/hysteresis`. Với source bool: `cond = value`.
**Hành vi:** `cond` (có hysteresis: bật khi vượt `threshold`, tắt khi trở lại qua `threshold ∓ hysteresis`) → qua on/off-delay → `active` → `di = invert ? !active : active`.
**Mặc định theo `kind`:** `pull_cord`: `invert=true` (NC an toàn: bình thường DI = true; kích → false); `zero_speed`: `condition='lt'`, `invert=false`.
**Equipment fault:** `stuckActive`, `stuckInactive`, `chatter{periodMs}` (tương đương signal fault, vẫn cung cấp để dễ đọc).
**Observables:** `active`, `di`.

### 7.7 `silo_bin` — silo/bin mức vật liệu

**Roles:** `levelRaw` (AI, opt), `levelHigh` (DI, opt), `levelLow` (DI, opt), `levelHighHigh` (DI, opt).
**Tham số:** `capacityT 100`, `initialLevelPct 30`, `highPct 90`, `lowPct 10`, `highHighPct 97`, `hystPct 2`, `engMin 0`, `engMax 100` (cho `levelRaw`), `levelLagMs 0`.
**Nguồn vào/ra:** `inflowSource`, `outflowSource` (mỗi cái là `SourceSpec` đơn vị t/h; mặc định `const 0`); thường `link` tới `conveyor_simple.deliveredTph` hoặc `motor.speedPct×k`.
**Hành vi:** `mass += (inflow − outflow) × dt/3 600 000` (t/h × ms), clamp `[0, capacityT]`; `levelPct = mass/capacityT×100`. Switch có hysteresis: `levelHigh` bật khi `levelPct ≥ highPct`, tắt khi `< highPct − hystPct`; `levelLow` bật khi `levelPct ≤ lowPct`, tắt khi `> lowPct + hystPct`.
**Observables:** `levelPct`, `massT`, `inflowTph`, `outflowTph`.

### 7.8 `conveyor_simple` — băng tải đơn giản

Gồm hành vi `motor_dol` (cùng role/tham số, thêm role dưới) + vật liệu.
**Roles thêm:** `zeroSpeed` (DI, opt; true = băng đứng yên), `pullCord` (DI, opt; NC: true = bình thường).
**Tham số thêm:** `zeroSpeedThresholdPct 5`, `transportDelayMs 20000`, `loadTph 0` (hoặc `loadSource`), `pullCordHardwired true`.
**Hành vi thêm:** `beltSpeed = fault('beltSlip') ? 0 : motor.speedPct`; `zeroSpeed = beltSpeed < threshold`; `deliveredTph = delay(loadTph × beltSpeed/100, transportDelayMs)` (delay line). Khi `fault('pullCordTrip')`: `pullCord=false`; nếu `pullCordHardwired` → hành vi như `notReady` (contactor không hút / rơi).
**Equipment fault:** của `motor_dol` + `beltSlip`, `pullCordTrip`, `beltBlocked` (`deliveredTph=0`).
**Observables:** của `motor_dol` + `beltSpeedPct`, `deliveredTph`.

> Các model P1 (crusher, mill, fan+damper, kiln drive, clinker cooler...) nằm ngoài M2; framework phải cho phép thêm bằng `registerModel` mà không sửa engine.

---

## 8. Import I/O list

### 8.1 Pipeline
```
file (CSV/XLSX) → read → sniff (encoding/delimiter/sheet) → header detect → mapping (auto-guess + user)
 → transform → normalize (type, address, tag) → validate → diff với tags.yaml hiện có → commit (ghi tags.yaml)
 → (kế tiếp) auto-suggest thiết bị (mục 9)
```
Tất cả bước là **hàm thuần** (input → output + diagnostics), chạy được trong CLI/test không cần UI.

### 8.2 Đọc file (FR-102)
- **CSV**: tự nhận encoding (UTF-8, UTF-8 BOM, Windows-1252; thử UTF-16 nếu có BOM), dấu phân tách (`, ; \t |`) bằng thống kê nhất quán số cột trên 20 dòng đầu; hỗ trợ dấu nháy kép, xuống dòng trong ô.
- **XLSX**: liệt kê sheet (kèm số dòng/cột), cho chọn sheet; ô công thức lấy **giá trị cache**; ô merge: giá trị của ô đầu điền cho vùng merge theo cấu hình `fillDownColumns` (mặc định bật cho cột `station/area` nếu phát hiện merge dọc); bỏ qua dòng/cột ẩn (tùy chọn, mặc định bỏ qua dòng ẩn).
- Kích thước: hỗ trợ ≥ 20 000 dòng; đọc streaming ở server; trả về trang đầu (50 dòng) để xem trước.

### 8.3 Nhận diện header và gợi ý mapping
- **Dò dòng header:** trong 30 dòng đầu chọn dòng có số ô khớp từ điển synonym cao nhất (≥ 3 khớp); người dùng chỉnh được `headerRow/firstDataRow`.
- **Chuẩn hóa tên cột để khớp:** NFD → bỏ dấu tiếng Việt, hạ chữ thường, bỏ ký tự không chữ/số.
- **Từ điển synonym theo field canonical (vi/en/de)** — tối thiểu:

| field | synonyms |
|---|---|
| `tag` | tag, tagname, tagno, signal, signalname, kks, kennzeichen, bezeichnung, tenthietbi, matin hieu, tentin hieu |
| `description` | description, desc, service, beschreibung, mota, noidung |
| `signalType` | type, signaltype, iotype, io, signalart, loaitinhieu, loai |
| `address` | address, addr, plcaddress, adresse, diachi, absoluteaddress |
| `controller` | plc, cpu, controller, station, steuerung, trambien |
| `engMin`/`engMax` | rangelo/rangehi, min/max, lrv/urv, spanlow/spanhigh, messbereichvon/bis |
| `unit` | unit, eu, einheit, donvi |
| `equipment` | equipment, device, parent, owner, anlage, thietbi |
| `polarity` | no/nc, polarity, contact, ruhearbeit |
| `rack/slot/channel/module` | rack, slot, channel, ch, kanal, module, baugruppe |
- **Content sniffing** để xác nhận/đảo gợi ý: cột chứa >70% giá trị khớp regex địa chỉ → `address`; chứa tập {DI,DO,AI,AO,...} → `signalType`; cột số có giá trị gần 0..100/4..20 → có thể là range.
- Gợi ý mapping trả về `{ field, column, confidence, reason }[]`; UI cho sửa; lưu thành `import-profile.yaml` để dùng lại (khớp profile theo tên sheet + bộ header).

### 8.4 Transform (có thể cấu hình)
`replace{pattern,with}`, `upper`, `lower`, `trim`, `prefix`, `suffix`, `map{table}`, `split{pattern,into:[field,field]}`, `concat`, `default`. Áp theo thứ tự khai báo, ghi lại bước nào đã đổi giá trị (để hiển thị trong xem trước).

### 8.5 Chuẩn hóa địa chỉ (FR-103) — `address.ts`
Chấp nhận (không phân biệt hoa/thường, bỏ khoảng trắng, dấu `%` tùy chọn), chuẩn hóa về `%` kiểu IEC:

| Đầu vào | Chuẩn hóa | Ghi chú |
|---|---|---|
| `I0.0`, `I 0.0`, `%I0.0`, `E0.0`, `E 0.0` | `%I0.0` | `E` = Eingang (Đức) |
| `Q0.0`, `A0.0`, `O0.0`, `%Q0.0` | `%Q0.0` | `A` = Ausgang |
| `IB0`, `EB0` | `%IB0` | |
| `IW64`, `EW64`, `PIW64`, `PEW64` | `%IW64` | `PIW/PEW` = peripheral input word; bỏ tiền tố P (ghi cảnh báo `IO-W030` nếu cần phân biệt `:P`) |
| `QW64`, `AW64`, `PQW64`, `PAW64` | `%QW64` | |
| `ID0`, `ED0`, `QD0`, `AD0` | `%ID0`, `%QD0` | |
| `M0.0`, `MW10`, `MD20`, `MB5` | `%M0.0`... | |
| `DB1.DBX0.0`, `DB1.DBW4`, `DB1.DBD8`, `DB1.DBB2` | giữ nguyên dạng chuẩn | |
| `%I0.0:P` | `%I0.0` + cờ `peripheral` | |
| Số bit > 7 (`I0.8`) / byte âm | lỗi `IO-E010` | |

**Suy ra kiểu dữ liệu & vùng:** `%I/%Q/%M ... .bit` → Bool; `B` → Byte; `W` → Int (nếu `signalType` AI/AO) hoặc Word; `D` → DInt (hoặc Real nếu cột type nói Real). `area` = I/Q/M/DB.
**Sinh địa chỉ từ module** (`addressDerive`, khi cột address trống): `module ∈ {DI8,DI16,DI32,DQ8,DQ16,DQ32,AI2,AI4,AI8,AQ2,AQ4}`; DI/DQ: `byte = moduleStart + floor(ch/8)`, `bit = ch % 8`; AI/AQ: `byte = moduleStart + ch×2` (word). Đánh dấu `derived: true` để UI hiển thị. `VERIFY` với quy ước đánh số kênh của dự án thật (kênh bắt đầu từ 0 hay 1: tham số `channelBase`, mặc định 0).
**Kiểm tra tương thích hướng:** `DI/AI` ↔ vùng `I`; `DO/AO` ↔ vùng `Q`; sai → `IO-E012`.

### 8.6 Chuẩn hóa tên tag
- Trim, thay khoảng trắng liên tiếp bằng `_` (tùy chọn, mặc định bật), giữ nguyên hoa/thường như nguồn (không tự ép hoa trừ khi transform `upper`).
- Ký tự hợp lệ cho tag symbolic của VCS: chữ/số/`_`/`-`/`.`, bắt đầu bằng chữ hoặc `_`, độ dài ≤ 128; khác → `IO-W002` (kèm đề xuất tên đã làm sạch, người dùng chấp nhận hàng loạt).
- Trùng tên **không phân biệt hoa/thường** → `IO-E001`.

### 8.7 Quy tắc kiểm tra (FR-106) — mã lỗi cố định

| Mã | Mức | Mô tả |
|---|---|---|
| IO-E001 | error | Trùng tag (không phân biệt hoa/thường) |
| IO-E002 | error | Tag trống hoặc quá dài |
| IO-E003 | error | Thiếu `signalType` và không suy ra được từ địa chỉ |
| IO-E010 | error | Địa chỉ không hợp lệ |
| IO-E011 | error | **Trùng/chồng địa chỉ** trong cùng controller (bit/byte/word chồng lấn, ví dụ `%IB0` với `%I0.3`, `%IW64` với `%IB65`) — báo cả hai dòng |
| IO-E012 | error | Hướng sai (DI/AI ở vùng Q, DO/AO ở vùng I) |
| IO-E013 | error | Kiểu dữ liệu không khớp độ rộng địa chỉ (Bool ↔ `%IW`...) |
| IO-W001 | warn | Tín hiệu analog thiếu `engMin/engMax` |
| IO-W002 | warn | Tên tag có ký tự không chuẩn |
| IO-W003 | warn | Địa chỉ Word/DWord ở offset lẻ (cảnh báo căn chẵn) |
| IO-W010 | warn | Địa chỉ nằm ngoài vùng khai báo của controller (mặc định I/Q 1024 byte) |
| IO-W020 | warn | Controller trong I/O list chưa khai báo trong `vcs.project.yaml` (gợi ý tự tạo) |
| IO-W030 | warn | Có tiền tố peripheral (`P`/`:P`) — M1 chưa mô phỏng khác biệt |
| IO-W040 | warn | `engMin ≥ engMax` hoặc giá trị không phải số |
| IO-I001 | info | Dòng bị bỏ qua (dòng trống/tiêu đề phụ) kèm lý do |

Mỗi diagnostic có `{ code, severity, row, column?, tag?, message, hint? }` và liên kết ngược tới dòng nguồn (`origin`).
**Cấu hình mức độ** trong `rules` của profile (ví dụ nâng `IO-W001` thành error).

### 8.8 Diff và commit (re-import an toàn)
- Khóa so khớp: **tên tag chuẩn hóa** (case-insensitive); nếu tag mất nhưng địa chỉ giữ nguyên → đề xuất "đổi tên".
- Diff gồm: `added`, `removed`, `changed{field: old→new}`, `unchanged`, `renamedCandidates`.
- Các trường có `provenance: manual` (người dùng đã sửa tay) **không bị ghi đè** trừ khi chọn "ghi đè".
- Commit ghi `tags/tags.yaml` (sắp xếp ổn định theo controller, vùng, địa chỉ để diff git sạch), `io/io-list.normalized.csv`, `io/import-profile.yaml`, và báo cáo `reports/import-<timestamp>.json|html` (thống kê, diagnostic, diff).
- Re-import **idempotent**: chạy hai lần cùng file → diff rỗng (kiểm bằng test).
- Nếu tag đã gán thiết bị (`equipment.yaml`) bị `removed`/`renamed` → cảnh báo `PL-W010` (tham chiếu treo) và đề xuất cập nhật.

---

## 9. Auto-suggest thiết bị (FR-105)

### 9.1 Mục tiêu và đầu ra
Từ danh sách tag đã chuẩn hóa, đề xuất: **nhóm tín hiệu → thiết bị (id, model) → role của từng tín hiệu**, kèm `confidence` và `reasons[]` để giải thích. Không bao giờ tự áp dụng khi chưa được người dùng duyệt (ngoại trừ chế độ `--accept-confident` của CLI).

```ts
interface Suggestion {
  equipmentId: string; model: string; confidence: number;           // 0..1
  signals: { tag: string; role: string; confidence: number; reasons: string[] }[];
  missingRequiredRoles: string[]; unusedOptionalRoles: string[];
  status: 'confident' | 'review' | 'unmatched';                      // ≥0.8 | 0.5–0.8 | <0.5
}
interface SuggestResult { suggestions: Suggestion[]; unassignedTags: { tag: string; reasons: string[] }[]; stats: {...} }
```

### 9.2 Thuật toán (cố định, deterministic, giải thích được)

**Bước 1 — Phân tách tag.** Thử `tagPattern` (naming.yaml) → `{area, eqcode, role}`. Nếu không khớp: (a) dùng cột `equipment` của I/O list nếu có; (b) tách theo ký tự phân cách `_ - .`, lấy tiền tố chung dài nhất với các tag khác làm `equipmentKey`, phần còn lại là `roleToken`. Ghi `reason`.

**Bước 2 — Gom nhóm.** Gom theo `equipmentId` (template). Thiết bị có ≥ 1 tín hiệu.

**Bước 3 — Suy ra model.** Điểm cho mỗi model ứng viên:
- `+0.5` nếu tiền tố chữ của `eqcode` có trong `equipmentCodeToModel` (khớp dài nhất).
- `+0.4 × (tỷ lệ role bắt buộc của model được phủ bởi tín hiệu trong nhóm)`; tín hiệu "thừa" không thuộc model: `−0.1` mỗi tín hiệu (tối đa −0.3).
- **Chữ ký tín hiệu** (signature) cộng thêm: có `AO` + `runCmd` → `motor_vfd` (+0.3, trừ `motor_dol` −0.2); có hai LS (open/closed) → `valve_onoff`; chỉ có `AI` → `analog_sensor`; chỉ có 1 `DI` → `switch_di`; có `posRef` AO → `valve_ctrl`.
- Chọn model điểm cao nhất; nếu chênh ≤ 0.1 giữa hai model → `status: review` và liệt kê cả hai trong `reasons`.

**Bước 4 — Gán role.** Với mỗi tín hiệu trong nhóm, tính điểm cho từng role của model đã chọn:
- `+0.6` nếu `roleToken` (chuẩn hóa) khớp chính xác synonym của role; `+0.4` nếu chứa (substring, token boundary); `+roleOverrides` ưu tiên cao nhất.
- `+0.2` nếu `description` chứa `descKeywords` của role (vi/en/de, không dấu, không phân biệt hoa/thường).
- `+0.2` nếu `signalType` (kind) khớp kind của role; `−0.5` nếu **không khớp kind** (ví dụ AI không thể là `runCmd`).
- Mỗi role chỉ gán cho tối đa 1 tín hiệu: giải bằng ghép tham lam theo điểm giảm dần (ổn định theo tên tag khi hòa điểm). Tín hiệu không đạt ≥ 0.4 → vào `unassignedTags` của nhóm.

**Bước 5 — Confidence thiết bị** = `0.5 × điểm model chuẩn hóa + 0.5 × trung bình confidence role` (trừ `0.15` cho mỗi role bắt buộc còn thiếu). Phân loại `confident / review / unmatched`.

**Bước 6 — Tín hiệu mồ côi:** tag không thuộc nhóm nào có model → `unassignedTags` (người dùng gán tay hoặc để làm "virtual input").

### 9.3 UI duyệt (xem mục 10) và áp dụng
- Áp dụng gợi ý = ghi `equipment.yaml` (tạo instance với `params` mặc định của model + `signals` map) và cập nhật `equipment/role` trong `tags.yaml`.
- Có thể gán lại model/role bằng dropdown; thay đổi sinh lại `missingRequiredRoles`.
- Lưu **lựa chọn của người dùng** để gợi ý lần sau (học theo dự án): sửa role của `…_ST` thành `runFb` ⇒ gợi ý thêm vào `roleOverrides` (hỏi trước khi ghi).
- Kiểm tra sau áp dụng (`plant.validate()`): role bắt buộc thiếu `PL-E001`, tag gán trùng `PL-E003`, thiếu range analog `PL-E012`, tham chiếu tag không tồn tại `PL-E002`.

### 9.4 Mã chẩn đoán plant (`PL-*`)

| Mã | Mức | Ý nghĩa |
|---|---|---|
| PL-E001 | error | Thiếu role bắt buộc của model |
| PL-E002 | error | Role trỏ tới tag không tồn tại |
| PL-E003 | error | Một tag gán cho nhiều role/thiết bị |
| PL-E004 | error | Kind tag (DI/DO/AI/AO) không khớp kind của role |
| PL-E010 | error | Tham số thiết bị sai schema (zod, nêu rõ đường dẫn) |
| PL-E012 | error | Role analog không xác định được khoảng đo |
| PL-E020 | error | `source`/link tạo vòng, hoặc link tới thiết bị/observable không tồn tại |
| PL-W001 | warn | `stepMs`/`plcScanMs` không hợp lệ theo khuyến nghị |
| PL-W010 | warn | Tham chiếu treo sau khi re-import I/O list |
| PL-W020 | warn | Tag Real được ghi trực tiếp eng, bỏ qua scaling |

---

## 10. UI (M2, `apps/web`)

1. **Import wizard** (5 bước): (1) tải file & chọn sheet; (2) header/vùng dữ liệu + xem trước 50 dòng; (3) mapping cột (gợi ý + sửa, lưu profile); (4) kết quả kiểm tra — bảng diagnostic lọc theo mức/mã, click nhảy tới dòng, nút "sửa nhanh" cho `IO-W002`; (5) diff và Commit.
2. **I/O & Tag Manager:** bảng ảo hóa (≥ 20 000 dòng mượt), lọc theo controller/loại/thiết bị/trạng thái lỗi, sửa trực tiếp ô, cột `equipment`/`role`, nhóm theo thiết bị, xuất CSV.
3. **Plant Designer:** (a) tab **Suggestions** (bảng thiết bị gợi ý, màu theo status, "Accept all confident", sửa model/role, panel chi tiết với `reasons`); (b) tab **Equipment** (danh sách + lưới gán role↔tag, tham số theo form sinh từ zod); (c) tab **Unassigned**.
4. **Simulation view (mở rộng sim bar M1):** panel **Equipment inspector** (chọn thiết bị → state, observables, giá trị role hiện tại dạng raw/eng, các fault có thể bật; nút bật/tắt fault, đặt manual/source); **Event log**; Watch table (M1) hiểu tag của plant.
5. Ngôn ngữ: chuỗi qua file i18n (vi/en).

CLI:
```
vcs import-io <file> --profile <yaml> [--sheet X] [--commit] [--report]
vcs suggest [--accept-confident]
vcs plant validate
vcs plant run examples/motor-interlock --scenario scenarios/trip.yaml --until 5000ms
```

---

## 11. Chiến lược test

### 11.1 Test model (mỗi model bắt buộc)
Mỗi model có file `golden/<model>.golden.yaml` dạng timeline: danh sách `{ t, cmd: {role: value}, fault: [...], expect: {role/observable: value} }`, chạy `PlantEngine` với `stepMs=10` (không cần PLC). Tối thiểu: `motor_dol` 14, `motor_vfd` 10, `valve_onoff` 10, `valve_ctrl` 6, `analog_sensor` 8, `switch_di` 8, `silo_bin` 6, `conveyor_simple` 8; mỗi **fault** của model ≥ 1 test; mỗi **signal fault** ≥ 1 test (tổng ≥ 12); adapter scaling ≥ 12 (biên 0, 27648, over/under-range, đảo ngược khoảng).

Ví dụ `motor_dol` (startDelayMs 500, stopDelayMs 800, stepMs 10):

| t (ms) | tác động | kỳ vọng sau bước |
|---|---|---|
| 0 | — | `runFb=0, overloadOk=1, ready=1, state=STOPPED` |
| 100 | PLC ghi `runCmd=1` (cuối scan t=100) | `state=STOPPED` (plant chưa thấy) |
| 110 | — | `state=STARTING, runFb=0` |
| 600 | — | `runFb=0` (600−110=490 < 500) |
| 610 | — | `runFb=1, state=RUNNING` |
| 1000 | PLC ghi `runCmd=0` | — |
| 1010 | — | `state=STOPPING, runFb=1` |
| 1800 | — | `runFb=1` (790 < 800) |
| 1810 | — | `runFb=0, state=STOPPED` |

(Quy ước cột "tác động" cho test độc lập: lệnh `cmd` được đặt **trước** `plant.step` của bước kế tiếp, mô phỏng "PLC ghi ở cuối scan T".)

### 11.2 Test engine
- **Determinism:** chạy cùng kịch bản 2 lần (và 1 lần với restore từ snapshot giữa chừng) → hash SHA-256 của trace (mọi tag mỗi bước) **giống hệt**.
- **Thứ tự cập nhật:** đảo thứ tự khai báo thiết bị trong YAML → kết quả không đổi.
- **Link:** sensor link tới motor `currentA` cho kết quả đúng; vòng link bị bắt (`PL-E020`).
- **Ownership:** hai role cùng tag → `PL-E003`; tag DI chưa gán không bị engine ghi đè.
- **Snapshot/restore:** `S` serializable; restore giữa lúc motor STARTING chạy tiếp đúng.
- **Không cấp phát trong step** (benchmark heap, mục 12).

### 11.3 Test import (fixture)
- `scripts/gen-io-fixture.ts` sinh **`fixtures/io-list-300.xlsx`** + `expected.yaml` (ground truth: tag → equipment + role + model + địa chỉ chuẩn). Nội dung giả lập dây chuyền nghiền: 8 `motor_dol`, 4 `motor_vfd`, 6 `valve_onoff`, 3 `valve_ctrl`, 14 `analog_sensor`, 10 `switch_di` (level/pull-cord/zero-speed), 3 `silo_bin`, 2 `conveyor_simple` ≈ 300 tín hiệu.
- **Cố ý làm bẩn** (cấu hình mức bẩn): header ở dòng 6 với tiêu đề phụ phía trên; cột merge dọc (`station`); địa chỉ lẫn `I0.0`/`E0.0`/`%I0.0`/`PEW64`; ~5% thiếu `signalType`; ~3% sai chính tả hậu tố (`RUN_FBK`, `RUNNING`, `RUN_ST`); ~2% trùng tag; ~2% trùng/chồng địa chỉ; mô tả lẫn tiếng Việt/Anh/Đức; 1 sheet phụ không liên quan.
- **Bản CSV** của cùng dữ liệu với dấu `;` và Windows-1252 (kèm ký tự có dấu).
- **Nghiệm thu thống kê:** (a) ≥ **90%** tín hiệu gán đúng `equipment + role` (so `expected.yaml`); (b) ≥ 95% **thiết bị** có model đúng; (c) **100%** địa chỉ chuẩn hóa đúng; (d) 100% lỗi cố ý (trùng tag, trùng địa chỉ) bị phát hiện, 0 báo nhầm trên dòng sạch.
- **Bảng test chuẩn hóa địa chỉ**: ≥ 40 trường hợp (mục 8.5, gồm lỗi).
- **Property test:** chuẩn hóa địa chỉ idempotent (`norm(norm(x)) = norm(x)`); re-import idempotent; phát hiện chồng lấn khớp mô hình tham chiếu bitmap.
- **Test mỗi mã diagnostic** (bảng 8.7, 9.4) ≥ 1 test.

### 11.4 Test tích hợp vòng kín (**demo chấp nhận M2**): `examples/motor-interlock` + `motor_dol`

Cấu hình: `stepMs = plcScanMs = 10`; PLC chạy `FB_Motor` + OB1 của M1 (tag: `START_PB %I0.0`, `STOP_OK %I0.1`, `OVL_OK %I0.2`, `PERM %I0.3`, `RUN_FB %I0.4`, `RESET_PB %I0.5`, `RUN_CMD %Q0.0`, `FAULT_LAMP %Q0.1`). Thiết bị `M01` = `motor_dol` gán: `runCmd=RUN_CMD`, `runFb=RUN_FB`, `overloadOk=OVL_OK`; `START_PB`, `STOP_OK`, `PERM`, `RESET_PB` là virtual input (chưa gán, do test đặt). Trạng thái đầu: `STOP_OK=1, PERM=1`.

**Kịch bản A — chạy bình thường rồi overload, reset, chạy lại** (`tác động` đặt ở đầu bước T, trước plant.step):

| T (ms) | Tác động | Kỳ vọng sau bước T |
|---|---|---|
| 0 | — | `RUN_CMD=0`, `OVL_OK=1`, `RUN_FB=0` |
| 100 | `START_PB=1` | `RUN_CMD=1` (scan T=100 thấy cạnh lên) |
| 110 | — | plant: `STARTING` (t0=110); PLC: timer FB bắt đầu đếm (IN = sSeal ∧ ¬RUN_FB, start=110) |
| 200 | `START_PB=0` | `RUN_CMD=1` |
| 600 | — | `RUN_FB=0` (600−110 = 490 < 500) |
| 610 | — | plant `RUNNING`, `RUN_FB=1` → PLC cùng bước thấy `RUN_FB=1`; timer reset (ET=0); `RUN_CMD=1` |
| 1000 | inject `overload` | `OVL_OK=0`, `RUN_FB=0` (plant TRIPPED); PLC cùng bước: `FAULT_LAMP=1`, `RUN_CMD=0` |
| 1010 | — | plant thấy `runCmd=0`, vẫn `TRIPPED` |
| 2000 | clear `overload` | plant bắt đầu đếm `overloadResetMs` |
| 2990 | — | `OVL_OK=0` |
| 3000 | — | `OVL_OK=1`, plant `STOPPED` (1000ms trôi qua, `runCmd=0`) |
| 3100 | `RESET_PB=1` | `FAULT_LAMP=0` |
| 3200 | `RESET_PB=0`, `START_PB=1` | `RUN_CMD=1` (cạnh lên tại scan T=3200) |
| 3210 | — | plant thấy `runCmd=1` → `STARTING` (t0=3210) |
| 3300 | `START_PB=0` | `RUN_CMD=1` |
| 3700 | — | `RUN_FB=0` (3700−3210 = 490 < 500) |
| 3710 | — | plant `RUNNING`, `RUN_FB=1`; PLC cùng bước thấy `RUN_FB=1` |

> Ghi chú cho AI: các mốc trên đã được tính tay theo luật 5.1 và 7.1. Nếu bạn tính ra kết quả khác, **không sửa kỳ vọng im lặng**: ghi sai khác và lập luận vào `docs/open-questions.md`, rồi hỏi chủ sản phẩm.

**Kịch bản B — mất feedback (preset `noRunFeedback` bật từ T=0):**

| T | Tác động | Kỳ vọng |
|---|---|---|
| 100 | `START_PB=1` | `RUN_CMD=1` |
| 110 | — | timer FB của PLC bắt đầu (IN = sSeal ∧ ¬RUN_FB, ở scan T=110) |
| 3100 | — | `RUN_CMD=1` (ET=2990) |
| 3110 | — | `FAULT_LAMP=1`, `RUN_CMD=0` (ET=3000 ≥ PT) |
| 3120 | — | plant thấy `runCmd=0`, `STOPPING`; sau 800 ms `STOPPED` |

**Kịch bản C — `localMode`:** bật fault `localMode` rồi `START_PB=1` ⇒ `RUN_CMD=1` nhưng plant **không** chạy (`RUN_FB` luôn 0) ⇒ như B: PLC báo lỗi sau 3 s.
**Kịch bản D — `contactorStuck`:** chạy bình thường, `runCmd=0` nhưng plant vẫn RUNNING, `RUN_FB=1` ⇒ kiểm tra PLC không giả định feedback tắt.

Cả 4 kịch bản chạy qua CLI (`vcs plant run`) **và** qua UI (inspector + bật/tắt fault bằng tay) cho cùng kết quả.

---

## 12. Hiệu năng

- Engine một mình: **500 thiết bị hỗn hợp, bước 10 ms ≥ 1 500 bước/giây** (≥ 15× realtime) trên laptop phổ thông; không cấp phát đối tượng mới mỗi bước (kiểm tra bằng heap benchmark: tăng heap < 1 MB sau 100 000 bước).
- Vòng kín (`SoftPlc` 200 `FB_Motor` + 200 `motor_dol`): **≥ 1 000 bước/giây** (≥ 10× realtime).
- Import: file XLSX 20 000 dòng → kết quả (đã validate + suggest) trong **≤ 10 s**; UI bảng 20 000 dòng cuộn mượt (virtualized).
- `pnpm bench` ghi `bench/results.json`; regression > 20% → cảnh báo CI.

---

## 13. Kế hoạch triển khai và prompt cho AI

| Ngày | Công việc | Kết quả |
|---|---|---|
| 1 | `schemas` (equipment/naming/profile/tags/fault), `rng`, `delay`, helper lag/rate-limit | type + test |
| 2 | `registry`, `adapter` (scaling) , `source` (manual/const/ramp/sine/link + topo) | scaling & source test |
| 3 | `FaultManager` (equipment + signal fault) + `PlantEngine.step` + EventLog | engine chạy model giả |
| 4 | `motor_dol` + golden | 14 test xanh |
| 5 | `valve_onoff`, `valve_ctrl`, `damper` | golden xanh |
| 6 | `analog_sensor`, `switch_di`, `silo_bin`, `conveyor_simple`, `motor_vfd` | golden xanh |
| 7 | `docgen`, snapshot/restore, determinism test, orchestrator + IoBusImpl | vòng kín với SoftPlc |
| 8 | Demo A–D (mục 11.4) + CLI `vcs plant run` | demo đạt |
| 9 | Importer: đọc CSV/XLSX, sniff, header detect | test fixture đọc |
| 10 | Mapping/transform/profile + synonym | gợi ý mapping |
| 11 | Địa chỉ + normalize + validate (mã IO-*) + diff/commit | test bảng địa chỉ |
| 12 | Suggest (naming → nhóm → model → role → confidence) | đạt ngưỡng trên fixture |
| 13 | UI: import wizard, tag manager | |
| 14 | UI: plant designer + inspector + fault panel | |
| 15 | Fixture generator, benchmark, tài liệu, đệm | nghiệm thu |

### Prompt mẫu

**P2.1 (nền tảng plant):**
> Đọc `M2-plant-and-io-import-spec.md` mục 3–6. Trong `packages/schemas` và `packages/plant`, cài các schema (zod), `rng` (mulberry32 seeded, cấm Math.random), `delay`, helper lag/rate-limiter, `adapter` scaling (mục 3.2), `source`, `FaultManager` (6.1–6.2), `PlantEngine` với thứ tự cập nhật deterministic (5.3). Chưa viết model thật, chỉ model giả để test engine. Thêm lint rule cấm `Date.now/performance.now/Math.random` trong `plant`. Test scaling, signal fault, determinism.

**P2.2 (motor_dol):**
> Theo mục 7.1, cài `motor_dol` đúng máy trạng thái và bảng thời gian ở 11.1. Mỗi fault và preset có test. Sinh tài liệu `docs/equipment/motor_dol.md` từ định nghĩa model bằng `docgen`.

**P2.3 (các model còn lại):** theo 7.2–7.8; mỗi model một PR/commit; bắt buộc golden timeline.

**P2.4 (orchestrator + vòng kín):**
> Theo 5.1 và 11.4, cài `SimulationOrchestrator`, `IoBusImpl`, CLI `vcs plant run`. Chạy 4 kịch bản demo với `SoftPlc` của M1. **Tự tính kỳ vọng theo luật** (đừng sao chép bảng nếu mâu thuẫn) và ghi sai khác vào `docs/open-questions.md`.

**P2.5 (đọc file + mapping):**
> Theo 8.1–8.4, cài đọc CSV/XLSX (exceljs), sniff, dò header, gợi ý mapping bằng từ điển synonym vi/en/de, transform, lưu/đọc `import-profile.yaml`. Viết fixture generator `scripts/gen-io-fixture.ts` trước (mục 11.3) và dùng nó làm dữ liệu test.

**P2.6 (địa chỉ + validate + diff):**
> Theo 8.5–8.8, cài chuẩn hóa địa chỉ (≥ 40 test), kiểm tra chồng lấn bằng bitmap, toàn bộ mã IO-*, diff/commit idempotent, báo cáo HTML/JSON.

**P2.7 (suggest):**
> Theo mục 9, cài thuật toán gợi ý đúng 6 bước, lấy role/synonym trực tiếp từ `plant/registry`. Mọi suggestion có `reasons`. Chạy trên fixture 300 tín hiệu và in bảng precision theo role/model; đạt ngưỡng 11.3. Không "học" bằng LLM hay mạng ngoài.

**P2.8 (UI):** theo mục 10; bảng ảo hóa; Playwright e2e cho luồng *import → duyệt suggestion → run → bật fault → thấy PLC báo lỗi*.

Mỗi prompt kết thúc: *"Chạy test/lint/typecheck/bench, báo cáo kết quả, liệt kê mọi giả định tự đặt vào `docs/open-questions.md`, không sửa package khác trừ khi cần và nêu lý do."*

---

## 14. Tiêu chí nghiệm thu M2 (tất cả phải đạt)

1. `pnpm test`, `lint`, `typecheck` xanh toàn repo; M1 không bị hồi quy.
2. Toàn bộ golden model (mục 11.1) và test engine (11.2) đạt; mọi fault/preset có test.
3. Demo vòng kín A–D đạt qua CLI và UI; trace hash deterministic (chạy 2 lần giống hệt, restore giữa chừng giống hệt).
4. Import fixture 300 tín hiệu đạt ngưỡng 11.3: **≥ 90% (equipment, role)**, ≥ 95% model, 100% địa chỉ, 100% lỗi cố ý bị phát hiện, 0 báo nhầm dòng sạch; re-import idempotent.
5. Mọi mã chẩn đoán (IO-*, PL-*) có test và thông báo hành động được (nêu dòng/tag/gợi ý).
6. Hiệu năng đạt mục 12.
7. `docs/equipment/*.md` sinh tự động, CI kiểm tra không lệch định nghĩa.
8. UI: người dùng đi trọn luồng *import → duyệt gợi ý → chạy → tiêm lỗi → quan sát* mà không phải sửa file bằng tay (Playwright e2e xanh).
9. Không có `any` ngoài ranh giới I/O; `plant` không import `runtime-iec`/UI; không dùng thời gian/ngẫu nhiên thật.

---

## 15. Quyết định mặc định (để AI không dừng hỏi)

| Chủ đề | Quyết định |
|---|---|
| Đọc XLSX | `exceljs`, parse ở server/Node |
| Thứ tự plant ↔ PLC | Plant trước, controller sau; plant thấy output PLC sau 1 bước |
| Đơn vị trong model | Luôn eng; adapter scale raw |
| Raw analog | 0..27648 nominal; kẹp `[-4864, 32511]` |
| Lỗi dây AI | raw = 32767 (cấu hình được) |
| Địa chỉ E/A tiếng Đức | `E`→I, `A`→Q; `PEW/PAW` bỏ tiền tố P + cảnh báo |
| Tag trùng tên | không phân biệt hoa/thường, lỗi |
| Re-import | Không ghi đè trường `provenance: manual` |
| Ngẫu nhiên | PRNG seeded theo (seed, equipmentId) |
| Link vòng | Cấm (lỗi) |
| Auto-suggest | Heuristic có giải thích; không ML/LLM trong M2 |
| Tag chưa gán thiết bị | Virtual input, không bị plant ghi |

---

## 16. Việc của chủ sản phẩm (cần làm song song để M2 sát thực tế)

1. **Cung cấp I/O list thật (đã ẩn danh)** của 1–2 dự án và **quy ước đặt tên tag/thiết bị** đang dùng (hoặc ảnh chụp cấu trúc KKS/ISA). Đây là dữ liệu quan trọng nhất để chỉnh `naming.yaml` và từ điển synonym; fixture sinh tự động chỉ là xấp xỉ.
2. Xác nhận bằng module thật/PLCSIM: dải raw analog (`0..27648`, vùng over/under-range), giá trị `wire break` của module AI đang dùng, kênh module bắt đầu từ 0 hay 1, ký hiệu địa chỉ trong I/O list (E/A hay I/Q).
3. Cho **số liệu thực tế** của motor trong dây chuyền: thời gian kéo contactor/hồi tiếp (`startDelayMs`, `stopDelayMs`), thời gian tăng/giảm tốc biến tần, hành trình van — để đặt tham số mặc định thực tế thay cho số tạm.
4. Duyệt danh sách **fault** của từng model (mục 7) và bổ sung các fault hay gặp ở site mà spec chưa có.
5. Chạy thử kịch bản A–D (mục 11.4) bằng tay trên PLCSIM + logic thật nếu có, để đối chiếu hành vi PLC ↔ feedback.
