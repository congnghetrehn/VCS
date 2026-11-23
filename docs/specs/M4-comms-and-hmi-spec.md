# M4 — Truyền thông (OPC UA / Modbus TCP) và HMI cơ bản: Đặc tả chi tiết

> Thuộc dự án VCS (xem `PRD.md`: M4, FR-601…604, FR-608, FR-701…703; M0 mục 6–9; M2 mục 3–5; M3 mục 6).
> Phiên bản: 0.1 (2026-11-21). Thời lượng dự kiến: **3–4 tuần công**. Điều kiện đầu vào: M0–M3 đạt nghiệm thu.
> Quy ước như các spec trước: spec thắng kiến thức sẵn có của AI; chỗ chưa chắc có giá trị mặc định + `VERIFY`; tình huống ngoài spec → chọn phương án đơn giản, ghi `docs/open-questions.md`, thêm test thể hiện lựa chọn.

**Mục đích của M4:** (1) cho phép **SCADA/HMI thật** (WinCC, Ignition, UaExpert, Modbus master...) kết nối vào VCS như thể đó là PLC thật, **không phải sửa tag của SCADA**; (2) cho phép VCS làm **plant simulator** cho **controller ngoài** (PLC thật/PLCSIM/mô phỏng khác) qua OPC UA/Modbus (Chế độ B); (3) có **HMI nội bộ cơ bản** để thao tác và quan sát mà không cần SCADA.

---

## 1. Mục tiêu và phạm vi

### 1.1 Trong phạm vi (P0)
| Nhóm | Nội dung | FR |
|---|---|---|
| Hạ tầng | `TagBroker` hợp nhất đọc/ghi/subscribe tag I/Q/M/DB; vòng đời gateway; trạng thái/log | FR-604 |
| Modbus TCP | Codec tự cài + **server** (SCADA đọc/ghi VCS) + **client adapter** (`external:modbus`) | FR-603 |
| OPC UA | **Server** (sơ đồ node id mô phỏng PLC Siemens `s7-1500` hoặc `vcs`, bảo mật, PKI) + **client adapter** (`external:opcua`) | FR-601, 602 |
| Chế độ B | Cơ chế adapter ngoài dùng chung (cache, kết nối lại, khóa tốc độ 1×) | FR-608 |
| UI truyền thông | Trang **Communications**: trạng thái, log, bảng mapping, xuất CSV, tin cậy chứng chỉ | FR-604 |
| HMI | Designer SVG, runtime, widget cơ bản, thư viện symbol (motor/van/băng tải/silo...), binding bằng biểu thức | FR-701…703 |
| Tài liệu | `docs/scada-integration.md` (hướng dẫn nối SCADA thật) | |

### 1.2 P1 (làm nếu còn thời gian, **không** nằm trong nghiệm thu)
Trend (uPlot) + bộ đệm lịch sử phía server (FR-704), alarm list (FR-705), faceplate (FR-706), chế độ runtime-only/khóa chỉnh sửa (`--hmi-readonly` làm sẵn ở P0 vì rẻ; phần RBAC là P2), `EURange/EngineeringUnits` cho node analog OPC UA, xuất NodeSet2 XML, `listSymbols()` để tự động phơi bày biến DB nội bộ của SoftPlc, OPC UA methods điều khiển mô phỏng.

### 1.3 Ngoài phạm vi
S7comm/Snap7 và EtherNet/IP (M5+), Modbus RTU/serial, OPC UA PubSub/Alarms&Conditions/Historical Access, Bridge Agent PLCSIM Advanced (M5), xác thực/phân quyền người dùng (P2), 3D, đa người dùng đồng thời chỉnh HMI.

---

## 2. Đối chiếu và điều chỉnh so với M0–M3

| # | Chủ đề | Quyết định của M4 |
|---|---|---|
| 1 | `ProtocolGateway` (PRD 8.4) | M0 chưa định nghĩa; **M4 định nghĩa** (mục 5.3). Gateway **không** đăng ký `SimComponent`; pha `gateways` của orchestrator để trống |
| 2 | Orchestrator | **Bổ sung `applyInbox(): void`** (M0 §6.7): chạy các `ExternalCommand` đang chờ tại `clock.nowMs()` rồi `tags.flush()`; **cấm gọi trong lúc đang chạy bước**; chỉ `SimulationService` dùng khi mô phỏng `PAUSED/IDLE` để ghi từ SCADA/HMI có hiệu lực ngay |
| 3 | Kernel | Xuất thêm `validateTagValue(type, v): TagValueError \| undefined` (tách từ validate nội bộ của TagDB) và **`TagBroker`** (mục 4) |
| 4 | WS của M0 | Handler WS chuyển sang dùng **`TagBroker`**: `tags.snapshot.defs` nay gồm **mọi tag catalog (I/Q/M/DB)**; `writable` tính theo broker; thêm thông điệp **additive**: `comms.status`, `comms.log`; `sim.state` thêm trường tùy chọn `locked?: boolean` (`PROTOCOL_VERSION` giữ nguyên 1) |
| 5 | Schema dự án | `files` thêm `comms` (mặc định `comms/comms.yaml`) và `hmi` (mặc định `hmi/`) |
| 6 | M3 `expr` | **Tách `packages/testing/src/expr` thành `@vcs/expr`** (isomorphic, không phụ thuộc plant/kernel; resolver được tiêm vào). `testing` import lại; HMI dùng chung (mục 11.3) |
| 7 | Đồ thị phụ thuộc (M0 §3.5) | Thêm: `expr → schemas`; `comms → schemas, kernel`; `hmi → schemas, expr`; `apps/web → schemas, expr, hmi`; `apps/server → comms, hmi, …`. Cập nhật `.dependency-cruiser.cjs` |
| 8 | M1 `ControllerIntrospection` | **Bắt buộc** cho SoftPlc (để SCADA/HMI đọc-ghi tag `M`/`DB`): `read/write/listForces/...`; thêm tùy chọn `readMany(refs: string[]): TagValue[]` (P1 tối ưu); thêm tùy chọn `listSymbols()` (P1) |
| 9 | M2 `GET /api/project` | Thêm `equipment: [{ id, model, roles: Record<role, tagName> }]` (HMI giải `$EQ.role`) |
| 10 | Lint tất định (M0 §3.6) | `comms` và `apps/*` **được phép** dùng `Date.now/performance.now` (là biên giới thời gian thực); `hmi`, `expr` **không** |
| 11 | CLI | `vcs serve` thêm `--no-comms`, `--hmi-readonly`; `vcs comms export <dir> --modbus-map out.csv --opcua-nodes out.csv` (không cần chạy server) |
| 12 | Tất định | **Chạy có truyền thông ngoài/ghi từ SCADA không tái lập bit-by-bit** (ghi bất đồng bộ theo đồng hồ thật). Test M3 chạy headless, **không bật gateway**. Record/replay là FR-508 (P1) |
| 13 | M3 TS-E040 | Khi có controller ngoài: `SimulationService` khóa `timeScale = 1`, `sim.state.locked = true` |

---

## 3. Kiến trúc và cấu trúc package

```
                     ┌────────────── apps/server (1 process Node) ──────────────┐
 SCADA / UaExpert ──►│ OPC UA server(s)   Modbus TCP server(s)                  │
 Modbus master ─────►│        │                  │                              │
                     │        ▼                  ▼                              │
 Web (HMI, Tags,     │   ┌──────────────── TagBroker ───────────────┐           │
 Communications) ───►│   │ read/write/subscribe (I/Q: TagDB;         │           │
   WS + REST         │   │ M/DB: ControllerIntrospection)            │           │
                     │   └───────┬──────────────────────┬───────────┘           │
                     │           │ post()/applyInbox()  │                       │
                     │   ┌───────▼──────────────────────▼───────────┐           │
                     │   │ SimulationOrchestrator (M0)               │           │
                     │   │  plant ─► controllers(builtin | external) │           │
                     │   └───────────────────────────┬──────────────┘           │
                     │                  external:opcua│external:modbus           │
                     └───────────────────────────────┼──────────────────────────┘
                                                      ▼
                                       PLC thật / PLCSIM / PLC giả lập (OPC UA, Modbus)
```

### 3.1 Package mới/đổi
```
packages/
  expr/                      # tách từ testing/expr (lexer, parser, compile, functions); resolver tiêm vào
  comms/
    src/
      config.ts              # zod schema comms.yaml + cấu hình adapter
      gateway.ts             # ProtocolGateway, GatewayContext, GatewayManager
      log.ts                 # RingLog (log yêu cầu/khung)
      mapping/               # datatype map, node id schemes, modbus layout, CSV export
      modbus/
        codec.ts             # MBAP + PDU (thuần, không mạng)
        server.ts            # node:net server
        client.ts            # node:net client (dùng cho adapter)
        adapter.ts           # ControllerAdapter 'external:modbus'
      opcua/
        server.ts address-space.ts security.ts pki.ts write-path.ts
        client-adapter.ts    # ControllerAdapter 'external:opcua'
      external/              # khung dùng chung cho adapter ngoài (mục 9)
      extension.ts           # commsExtension: đăng ký factory external:*
    test/ fixtures/ (fake-plc-opcua.ts, fake-plc-modbus.ts)
  hmi/                       # thuần (không React): schema widget/screen/symbol, thư viện symbol, sanitizer, validate, compile binding
  kernel/src/broker.ts       # TagBroker (mục 4)
apps/
  server/src/{comms-service.ts, hmi-routes.ts, comms-routes.ts}
  web/src/features/{communications, hmi-designer, hmi-runtime}/
docs/scada-integration.md
```

### 3.2 Thư viện chọn sẵn
| Việc | Lựa chọn |
|---|---|
| OPC UA server + client | `node-opcua` (ghim chính xác; gói con `node-opcua-pki` cho chứng chỉ) |
| Modbus TCP | **Tự cài codec + server/client bằng `node:net`** (thuần, dễ test); **`modbus-serial` chỉ dùng trong test** làm bên thứ ba độc lập để kiểm tra tương thích |
| Làm sạch SVG | `dompurify` (+ `jsdom` ở Node cho test) với allowlist riêng (mục 11.8) |
| Biểu đồ (P1) | `uplot` |
| Canvas HMI | SVG thuần + React (không dùng thư viện canvas nặng); kéo thả tự cài bằng pointer events |

---

## 4. `TagBroker` (kernel)

**Vấn đề:** `TagDB` (M0) chỉ giữ tag vùng I/Q; tag `M`/`DB` nằm trong controller. SCADA/HMI thật cần đọc-ghi cả hai (lệnh điều khiển từ SCADA thường ghi vào bit `M`/`DB`). Broker hợp nhất.

```ts
export interface BrokerTag {
  name: string; type: DataType; area: MemArea; address: string; controller: string;
  description?: string; kind: SignalKind | null; scaling?: Scaling;
  owner: TagOwner | 'controller-memory';          // M/DB → 'controller-memory'
  writable: boolean;                                // theo luật mục 4.2
}
export type WriteFail = 'NOT_FOUND' | 'DENIED' | 'TYPE' | 'RANGE' | 'UNSUPPORTED';
export type WriteResult = { ok: true } | { ok: false; code: WriteFail; message: string };
export interface BrokerValue { value: TagValue; quality: Quality; tsWallMs: number; simTimeMs: number }
export interface BrokerChange { name: string; value: TagValue; quality: Quality; simTimeMs: number }

export class TagBroker {
  constructor(sim: SimulationBundle, opts?: { pollMs?: number /*100*/ });
  list(): readonly BrokerTag[];                              // thứ tự catalog
  get(name: string): BrokerTag | undefined;
  read(name: string): BrokerValue;                           // I/Q: TagDB; M/DB: controller.read()
  readMany(names: readonly string[]): BrokerValue[];
  write(name: string, v: TagValue, source: 'hmi' | 'gateway'): WriteResult;
  subscribe(names: '*' | readonly string[], cb: (c: readonly BrokerChange[]) => void): Unsub;
  readonly isRunning: () => boolean;                         // do SimulationService cung cấp
  attach(hooks: { post(cmd: ExternalCommand): void; applyIfIdle(): void; isRunning(): boolean }): void;
}
```

### 4.1 Đọc
- Tag `I/Q`: `TagDB.get(handle)` (+ `quality`, `ts`). `tsWallMs` = thời điểm wall lần đổi giá trị gần nhất (broker giữ mảng `lastChangeWallMs[handle]` cập nhật bằng subscriber `'*'` của TagDB tại `flush`).
- Tag `M/DB`: `ControllerIntrospection.read(ref)` của controller sở hữu (ref = địa chỉ chuẩn hóa hoặc tên symbolic theo M1). Không có introspection (controller ngoài/không hỗ trợ) → `quality 'bad'`, giá trị mặc định kiểu.
- Đọc diễn ra **giữa các lát mô phỏng** (event loop đơn luồng) nên luôn nhất quán trong một bước.

### 4.2 Ghi (luật cố định)
| Loại tag | `source = 'hmi'` | `source = 'gateway'` |
|---|---|---|
| `I/Q`, owner `free` | cho phép | cho phép |
| `I/Q`, owner `plant` hoặc `controller` | **từ chối** `DENIED` | **từ chối** `DENIED` |
| `M/DB` | cho phép nếu controller `isIntrospectable` | như `hmi` |
Quy trình `write`: tìm tag (`NOT_FOUND`) → `validateTagValue(type, v)` (`TYPE`/`RANGE`) → kiểm quyền (`DENIED`) → `post({ label: 'broker:write NAME', run })` với `run` thực hiện `tags.write(h, v, source)` hoặc `controller.write(ref, v)`; lỗi lúc chạy → diagnostic `COM-W030`. Nếu mô phỏng **không chạy** (`!isRunning()`) → gọi `applyIfIdle()` ngay (→ `orchestrator.applyInbox()`), để giá trị có hiệu lực tức thì và đọc lại thấy ngay.

### 4.3 Subscribe
- I/Q: nhận thay đổi từ `TagDB.flush` (đồng bộ, trong bước) — broker chỉ chuyển tiếp danh sách thay đổi đã lọc.
- M/DB: **thăm dò theo nhu cầu** — chỉ các tag M/DB có ≥ 1 subscriber được đọc mỗi `pollMs` (wall) và so với giá trị đã gửi; tag không ai theo dõi → chi phí 0.
- WS của M0 (`tags.subscribe`) và HMI runtime dùng broker; OPC UA/Modbus server **không** dùng `subscribe` (dùng đọc theo yêu cầu, xem mục 7.4).

---

## 5. Cấu hình truyền thông

### 5.1 `comms/comms.yaml` (validate bằng zod, lỗi có dòng/cột như M0)
```yaml
schemaVersion: 1
opcuaServers:
  - id: opcua-plc1
    controller: PLC1                 # exposes tag của controller này (có thể "*" = mọi controller, thư mục riêng)
    enabled: true
    host: 127.0.0.1                  # 0.0.0.0 để SCADA máy khác kết nối (kèm cảnh báo COM-W002)
    port: 4840
    path: ""                         # endpoint: opc.tcp://host:port/path
    applicationName: VCS PLC1
    nodeIdScheme: s7-1500            # vcs | s7-1500
    namespaceIndex: 3                # chỉ s7-1500: chỉ số namespace mong muốn (>= 2)
    namespaceUri: urn:vcs:PLC1
    expose: { areas: [I, Q, M, DB], include: "*", exclude: [] }   # glob theo tên tag
    security:
      policies: [None, Basic256Sha256]          # Basic256Sha256 | Aes128_Sha256_RsaOaep | Aes256_Sha256_RsaPss | None
      modes: [None, SignAndEncrypt]             # None | Sign | SignAndEncrypt
      allowAnonymous: true
      users: [ { name: scada, passwordEnv: VCS_OPC_PWD } ]      # không lưu mật khẩu trong YAML
      autoTrustClients: false                   # true chỉ cho dev (cảnh báo COM-W003)
    limits: { maxSessions: 20, maxSubscriptionsPerSession: 50, maxMonitoredItems: 20000, minSamplingIntervalMs: 50 }
modbusServers:
  - id: modbus-plc1
    controller: PLC1
    enabled: true
    host: 127.0.0.1
    port: 1502                       # 502 cần quyền trên một số hệ; cấu hình được
    unitIds: [1]
    byteOrder: ABCD                  # thứ tự byte/word của số 32/64 bit: ABCD | CDAB | BADC | DCBA
    addressBase: 0                   # 0|1 — chỉ ảnh hưởng hiển thị CSV/UI (PDU luôn 0-based)
    gapPolicy: zero                  # zero | exception — đọc vùng trống
    readOnlyException: 3             # mã exception khi ghi vào địa chỉ chỉ đọc (2|3|4)
    autoMap: { include: "*", memory: true }     # tự gán địa chỉ (mục 6.3); memory = có cả tag M/DB
    map: []                          # ghi đè/ bổ sung: [{ tag, table, address }]
    limits: { maxConnections: 16, idleTimeoutMs: 60000 }
```
Controller ngoài (adapter) cấu hình trong `vcs.project.yaml` → `controllers[].config` (mục 8.1, 6.6); bảng mapping riêng (tùy chọn) ở file chỉ định trong `config.mapping`.

### 5.2 Kiểm tra cấu hình (mã `COM-*`, mục 15)
Trùng `id`/`port` giữa các server; `controller` không tồn tại; cổng bị chiếm lúc khởi động → `COM-E002` (gateway ở `ERROR`, **không** làm sập server); bind ngoài `127.0.0.1` → `COM-W002`; `autoTrustClients` → `COM-W003`; `passwordEnv` không có biến môi trường → `COM-E004`.

### 5.3 Giao diện gateway và quản lý vòng đời
```ts
export type GatewayState = 'stopped' | 'starting' | 'running' | 'error';
export interface GatewayStats {
  state: GatewayState; startedAtWallMs?: number; lastError?: string;
  clients: number;                        // phiên OPC UA / kết nối TCP
  reads: number; writes: number; errors: number; monitoredItems?: number; subscriptions?: number;
}
export interface ProtocolGateway {
  readonly id: string; readonly kind: 'opcua-server' | 'modbus-server';
  start(): Promise<void>; stop(): Promise<void>;
  status(): GatewayStats; endpoints(): string[];
  mappingRows(): MappingRow[];            // cho UI/CSV
}
export interface GatewayContext { broker: TagBroker; bundle: SimulationBundle; log: RingLog; pki: PkiPaths; emitDiagnostic(d: Diagnostic): void }
export class GatewayManager {
  constructor(cfg: CommsConfig, ctx: GatewayContext);
  startAll(): Promise<void>; stopAll(): Promise<void>;
  start(id: string): Promise<void>; stop(id: string): Promise<void>;
  list(): { id: string; kind: string; stats: GatewayStats; endpoints: string[] }[];
}
```
`apps/server` dựng `GatewayManager` sau `createSimulation`, khởi động ở `startAll()` (trừ khi `--no-comms`), dừng khi tắt server. Một gateway lỗi **không** ảnh hưởng gateway khác hay mô phỏng.

### 5.4 `RingLog`
Vòng đệm 1 000 mục `{ tWallMs, gateway, level, kind: 'session'|'request'|'write'|'error'|'info', summary, detail? }`; mặc định chỉ ghi `session/write/error/info`; **verbose** (ghi từng request/khung) bật/tắt từ UI (giới hạn tốc độ ghi, tối đa 200 mục/giây). Không ghi mật khẩu/giá trị nhạy cảm; truy cập qua `GET /api/comms/log` và WS `comms.log`.

---

## 6. Modbus TCP

### 6.1 Codec (`modbus/codec.ts`, thuần, không mạng)
- **MBAP**: `txId(2) protoId(2)=0 length(2) unitId(1)`; `length` = 1 + độ dài PDU. Bộ tách khung (`FrameParser`) xử lý **chia/gộp gói TCP** (stream), bỏ khung `protoId != 0`, giới hạn độ dài PDU ≤ 253, khung sai → đóng kết nối + log.
- Function code hỗ trợ: **1, 2, 3, 4, 5, 6, 15, 16** (+ exception `fc | 0x80` với mã 1 illegal function, 2 illegal data address, 3 illegal data value, 4 server device failure). FC khác → exception 1.
- Giới hạn số lượng: FC1/2 ≤ 2 000 bit; FC3/4 ≤ 125 thanh ghi; FC15 ≤ 1 968 bit; FC16 ≤ 123 thanh ghi; vượt/`quantity = 0`/`byteCount` sai → exception 3.
- FC5 giá trị hợp lệ chỉ `0xFF00`/`0x0000` (khác → exception 3). Bit trong byte: LSB = địa chỉ nhỏ nhất.
- API thuần: `decodeRequest(pdu)`, `encodeResponse(...)`, `encodeException`, `encodeRequest`/`decodeResponse` (cho client), `packBits/unpackBits`, `FrameParser.push(chunk): Frame[]`.

### 6.2 Mã hóa kiểu dữ liệu ↔ thanh ghi
| Kiểu tag | Số thanh ghi | Ghi chú |
|---|---|---|
| `Bool` | 1 bit (coil/discrete) | |
| `Byte`, `USInt` | 1 | giá trị ở **byte thấp** |
| `SInt` | 1 | hai-bù, byte thấp |
| `Word`, `UInt` | 1 | |
| `Int` | 1 | hai-bù 16 bit |
| `DWord`, `UDInt` | 2 | theo `byteOrder` |
| `DInt`, `Time` | 2 | `Time` = ms (DInt) |
| `Real` | 2 | IEEE-754 float32 |
| `LReal` | 4 | IEEE-754 float64 |
| `String` | không hỗ trợ | `COM-E012` |
`byteOrder` mô tả thứ tự các byte của giá trị (`ABCD` = big-endian chuẩn Modbus; `CDAB` = đổi chỗ hai word — phổ biến ở nhiều PLC/thiết bị; `BADC`, `DCBA`). Với 64 bit áp dụng tương tự cho 4 word (`ABCDEFGH` / đảo word `GHEFCDAB`...). Test bắt buộc cho từng kiểu × từng `byteOrder`, gồm biên và NaN/±Inf của Real.

### 6.3 Bảng địa chỉ và tự gán (`autoMap`)
| Bảng Modbus | FC | Tag được đưa vào | Quyền |
|---|---|---|---|
| Discrete inputs | 2 | Bool, `kind = DI` | đọc |
| Coils | 1, 5, 15 | Bool, `kind = DO`; Bool tag `free`; Bool `M/DB` | đọc; ghi nếu `broker.get(name).writable` |
| Input registers | 4 | số, `kind = AI` | đọc |
| Holding registers | 3, 6, 16 | số, `kind = AO`; số tag `free`; số `M/DB` | đọc; ghi nếu writable |
- Gán địa chỉ **tất định**: theo thứ tự catalog trong từng bảng, địa chỉ bắt đầu 0, **liên tục** (thanh ghi nhiều-word chiếm liền kề; không căn chẵn). Thêm tag mới ở cuối file → địa chỉ cũ không đổi (SCADA không phải cấu hình lại); xóa tag → để **lỗ** (không dồn) khi có file khóa `comms/modbus-<id>.lock.yaml` (sinh bằng `vcs comms lock`, tùy chọn) — mặc định không khóa.
- `map:` ghi đè từng tag (`{ tag, table, address }`); trùng/chồng địa chỉ → `COM-E011` (báo cả hai).
- **Xuất CSV** `modbus-map.generated.csv`: `table, address0, addressDisplay(addressBase), fc, tag, type, regs, access, unit, scaleRaw→Eng, controller` (SCADA engineer nhập vào SCADA).

### 6.4 Hành vi server
- Mỗi kết nối TCP: bộ tách khung riêng; **xử lý tuần tự theo thứ tự đến**; phản hồi giữ `txId`/`unitId` của yêu cầu; `unitId` không thuộc `unitIds` → **không trả lời** (hành vi gateway phổ biến) và ghi log (cấu hình `unknownUnit: ignore|exception` mặc định `ignore`).
- **Đọc:** lấy giá trị qua `broker.readMany` đúng các tag phủ lên khoảng yêu cầu, mã hóa theo `byteOrder`; vùng trống: `gapPolicy: zero` (trả 0 trong phạm vi `[0, maxMapped]`), `exception` hoặc vượt phạm vi → exception 2. Đọc **một phần** một tag nhiều-word cho phép (trả word tương ứng).
- **Ghi (FC5/6/15/16):** *tất cả-hoặc-không* cho từng yêu cầu: (1) mọi địa chỉ phải được ánh xạ (không → exception 2); (2) mọi tag chạm tới phải `writable` (không → `readOnlyException`); (3) ghi **một phần** tag nhiều-word → exception 3; (4) giá trị phải qua `validateTagValue` (RANGE/TYPE → exception 3); rồi `broker.write(..., 'gateway')` cho từng tag. Phản hồi thành công sau khi **xếp hàng** (hiệu lực ở đầu bước kế hoặc ngay nếu đang tạm dừng).
- Giới hạn `maxConnections`, `idleTimeoutMs`; đóng kết nối nhàn rỗi; `SO_KEEPALIVE`; không giữ xử lý dở khi đóng server (`stop()` đóng sạch).
- Thống kê: số request theo FC, số exception, byte vào/ra, số kết nối.

### 6.5 Client (`modbus/client.ts`) — dùng cho adapter
Kết nối TCP, hàng đợi một-yêu-cầu-một-lúc có `txId`, timeout (mặc định 1 000 ms), thử lại có giới hạn, `readCoils/readDiscrete/readHolding/readInput/writeCoil/writeCoils/writeRegister/writeRegisters`, tự gom khối (mục 6.6).

### 6.6 Adapter `external:modbus`
```yaml
controllers:
  - id: PLC2
    mode: external
    adapter: modbus
    endpoint: tcp://192.168.0.20:502        # host:port
    config:
      unitId: 1
      pollMs: 50                            # chu kỳ đọc output PLC
      writeMs: 20                           # chu kỳ gộp ghi input
      timeoutMs: 1000
      byteOrder: ABCD
      onDisconnect: hold                    # hold | zero
      mapping: comms/plc2-modbus-map.yaml   # bắt buộc nếu không có autoMap
      autoMap: { enabled: true }            # cùng thuật toán 6.3 (để PLC thật đối xứng với server của VCS)
```
`mapping`: `[{ tag, table: coil|discrete|holding|input, address, type?, scale? }]`.
Hướng dữ liệu (xem mục 9): tag `area I` của controller = **plant → PLC** (ghi sang PLC bằng coil/holding), `area Q` = **PLC → plant** (đọc từ PLC bằng coil/discrete/holding/input). Tag không có mapping → `COM-W010` (cảnh báo, tag giữ `quality 'bad'`). **Gom khối đọc**: nhóm các địa chỉ liền kề (cho phép khoảng trống ≤ `gapMax` = 4) thành ít request nhất trong giới hạn FC. Ghi: chỉ các tag **thay đổi** kể từ lần ghi thành công gần nhất, gộp theo khối liền kề; ghi đầy đủ lại toàn bộ sau khi kết nối lại.

---

## 7. OPC UA Server

### 7.1 Không gian node và sơ đồ node id
Mục tiêu: **SCADA đã có sẵn tag trỏ tới PLC thật phải dùng được ngay** → chọn `nodeIdScheme: s7-1500` để mô phỏng cách PLC Siemens S7-1500 đặt node id; `vcs` là sơ đồ đơn giản.

| Sơ đồ | NodeId | Cây browse |
|---|---|---|
| `s7-1500` | `ns=<namespaceIndex>;s="<seg1>"."<seg2>"…` với `seg` = các đoạn của tên tag tách theo `.` (mỗi đoạn trong dấu nháy kép). Ví dụ tag `START_PB` → `ns=3;s="START_PB"`; tag `DB_Motor.M01.Start` → `ns=3;s="DB_Motor"."M01"."Start"` | `Objects/<controller>/{Inputs,Outputs,Memory,DataBlocks}/…`; tag phân cấp (`.`) tạo `FolderType` lồng nhau |
| `vcs` | `ns=2;s=<controller>.<tagName>` | `Objects/VCS/<controller>/<area>/<tag>` |
- Ghi đè từng tag: `tags.yaml` hỗ trợ `opcua: { nodeId: 'ns=3;s="X"."Y"' }` (khóa tùy chọn; schema M0 mở rộng) **hoặc** file `comms/opcua-overrides.yaml` (`[{tag, nodeId}]`). Trùng nodeId → `COM-E010`.
- **Chỉ số namespace:** node-opcua gán chỉ số theo thứ tự đăng ký; để đạt `namespaceIndex = N` server đăng ký **namespace giữ chỗ** `urn:vcs:placeholder:<i>` cho tới khi namespace thật ra đúng `N`; `N < 2` → `COM-E001`. `VERIFY` với PLC thật (chỉ số `ns=` của SCADA đang dùng).
- Thêm thư mục chẩn đoán chỉ-đọc **`Objects/VCS/Simulation`** (nodeId `ns=<ownNs>;s=VCS.Simulation.<State|SimTimeMs|StepCount|TimeScale>`) — SCADA/UaExpert xem được trạng thái mô phỏng.
- Mỗi node: `DisplayName` = đoạn cuối, `Description` = mô tả tag, `Value`, `DataType`, `AccessLevel`.

### 7.2 Ánh xạ kiểu dữ liệu và quyền
| `DataType` tag | OPC UA | Ghi chú |
|---|---|---|
| Bool | Boolean | |
| Byte | Byte | |
| SInt | SByte | |
| USInt | Byte | |
| Word, UInt | UInt16 | |
| Int | Int16 | |
| DWord, UDInt | UInt32 | |
| DInt | Int32 | |
| Time | Int32 (ms) | `VERIFY` với S7-1500 |
| Real | Float | `Math.fround` |
| LReal | Double | |
| String | String | (dành sẵn) |
- `AccessLevel`: `CurrentRead` luôn; thêm `CurrentWrite` nếu `broker.get(name).writable`. `UserAccessLevel` giống `AccessLevel` (không phân quyền theo người dùng ở M0/M4).
- Chất lượng: `good → Good`, `uncertain → Uncertain`, `bad → BadNoCommunication`.

### 7.3 Bảo mật và PKI
- **Mặc định (dev):** `policies: [None]`, `modes: [None]`, `allowAnonymous: true`, bind `127.0.0.1`.
- **Dùng với SCADA thật (khuyến nghị):** `Basic256Sha256` + `SignAndEncrypt` (và tùy chọn `Aes128_Sha256_RsaOaep`, `Aes256_Sha256_RsaPss`); các chính sách cũ (`Basic128Rsa15`, `Basic256`) **không** hỗ trợ (ghi trong tài liệu). Xác thực: anonymous và/hoặc username/password (so khớp hằng-thời-gian; mật khẩu từ biến môi trường).
- **PKI** thư mục `.vcs/pki/<serverId>/` (`own/`, `trusted/`, `rejected/`, `issuers/`): lần đầu **tự sinh chứng chỉ tự ký** (RSA ≥ 2048, SHA-256, hiệu lực 5 năm) với `applicationUri = urn:<hostname>:vcs:<serverId>` và **SAN** gồm hostname, `localhost`, các IP cục bộ; tạo lại nếu hostname/IP đổi (cảnh báo). `.vcs/` được thêm vào `.gitignore` mẫu.
- **Quy trình tin cậy:** khi client lạ kết nối → chứng chỉ vào `rejected/`; UI Communications hiện danh sách (thumbprint, subject, applicationUri, thời điểm) với nút **Trust / Reject / Delete**; `Trust` chuyển file sang `trusted/certs/`. Ngoài ra người dùng có thể thả file chứng chỉ của SCADA (`.der/.pem`) vào `trusted/certs/`. `autoTrustClients: true` chỉ cho dev.
- Giới hạn: `maxSessions`, `maxSubscriptionsPerSession`, `maxMonitoredItems`, `minSamplingIntervalMs` (client yêu cầu thấp hơn → nâng lên).

### 7.4 Đọc, subscription, ghi
- **Đọc/sampling:** biến dùng **getter** (pull) đọc `broker.read(name)`; node-opcua tự lấy mẫu theo `samplingInterval` của monitored item. `sourceTimestamp` = `tsWallMs` (thời điểm giá trị đổi lần cuối, wall), `serverTimestamp` = thời điểm đọc. Với tag M/DB dùng cùng đường (đọc trực tiếp controller).
- **Ngưỡng hiệu năng bắt buộc** (mục 14); nếu node-opcua pull-sampling không đạt → áp dụng phương án dự phòng đã đặc tả: chuyển I/Q sang **push** (subscriber `'*'` của TagDB → tập dirty → `setValueFromSource` theo nhịp 20 ms wall), M/DB vẫn pull. Ghi quyết định vào ADR.
- **Ghi (client → VCS):** `onWrite` → ép kiểu theo `DataType` → `broker.write(name, v, 'gateway')`:
  | Kết quả broker | StatusCode OPC UA |
  |---|---|
  | `ok` | `Good` (giá trị **đã xếp hàng**; hiệu lực đầu bước kế, hoặc ngay khi tạm dừng) |
  | `DENIED`/`UNSUPPORTED` | `BadNotWritable` |
  | `TYPE` | `BadTypeMismatch` |
  | `RANGE` | `BadOutOfRange` |
  | `NOT_FOUND` | `BadNodeIdUnknown` |
- **Ghi nhiều node trong một yêu cầu** xử lý độc lập từng node (OPC UA không bảo đảm nguyên tử); trả StatusCode theo từng node.
- Ghi vào tag `plant`/`controller` luôn bị từ chối (mô phỏng "PLC không cho ghi vào I/Q").

### 7.5 Vòng đời
`start()`: dựng địa chỉ không gian từ `broker.list()` (lọc `expose`), nạp PKI, mở cổng; `stop()` đóng phiên/ cổng sạch trong ≤ 3 s. **Thay đổi tập tag sau khi dự án nạp lại** → restart gateway (không hot-reload ở M4). Khi dự án có `error` diagnostics → không khởi động gateway.

---

## 8. OPC UA Client — Adapter `external:opcua`

### 8.1 Cấu hình
```yaml
controllers:
  - id: PLC2
    mode: external
    adapter: opcua
    endpoint: opc.tcp://192.168.0.10:4840
    config:
      securityMode: None                 # None | Sign | SignAndEncrypt
      securityPolicy: Basic256Sha256     # khi mode != None
      auth: { type: anonymous }          # | { type: username, user: vcs, passwordEnv: VCS_PLC2_PWD }
      nodeIdScheme: s7-1500              # vcs | s7-1500 | explicit
      namespaceIndex: 3
      mapping: comms/plc2-opcua-map.yaml # [{ tag, nodeId, dataType? }] ghi đè/ bổ sung
      publishingIntervalMs: 50
      writeBatchMs: 20
      connectTimeoutMs: 5000
      reconnect: { initialMs: 500, maxMs: 10000 }
      onDisconnect: hold                 # hold | zero
```
- `nodeIdScheme: explicit` = chỉ dùng `mapping`. Ở các sơ đồ khác, nodeId mặc định sinh theo quy tắc mục 7.1 (đối xứng với server của VCS).
- **Ý nghĩa tag** (khớp mục 9): `area I` → VCS **ghi** sang node của PLC (thường là DB giao diện mô phỏng I/O, hoặc đầu vào của PLCSIM); `area Q` → VCS **đọc/subscribe** node của PLC.

### 8.2 Hành vi
1. **`init`**: tạo client, kết nối (chờ tối đa `connectTimeoutMs`); thất bại **không làm lỗi** — chuyển `DISCONNECTED`, tiếp tục thử lại nền; `init` vẫn thành công (mô phỏng chạy, tag của controller `quality 'bad'`).
2. **Sau khi kết nối:** đọc thuộc tính `DataType` + `AccessLevel` của mọi node ánh xạ (một lần, theo lô); node không tồn tại → `COM-W010` (liệt kê), tag tương ứng `quality 'bad'`; kiểu khác `DataType` của tag → coi tương thích nếu **chuyển được không mất** (Int16→Int32 ghi được; Float↔Double ok), ngược lại `COM-W011` và không ghi/đọc node đó. Ghi chọn kiểu `Variant` theo `DataType` của node (không theo kiểu tag).
3. **Đọc (PLC → plant):** một subscription, mỗi tag `Q` một monitored item (`samplingInterval = publishingIntervalMs`, `queueSize 10`, `discardOldest`), cập nhật **cache** `lastQ[handle] = {value, status}`.
4. **Ghi (plant → PLC):** `step()` so tag `I` với `lastSent`; tag đổi → vào tập `dirty`; tác vụ nền gom `dirty` mỗi `writeBatchMs` thành một `writeValues`; thành công → cập nhật `lastSent`; `BadNodeIdUnknown/BadNotWritable/BadTypeMismatch` → log một lần, đặt tag đó `quality 'bad'`, ngừng thử tới khi kết nối lại.
5. **Mất kết nối:** trạng thái `DISCONNECTED`; `onDisconnect: hold` giữ giá trị cuối của output PLC trong TagDB nhưng đặt `quality 'bad'`; `zero` ghi 0/false (kèm `quality 'bad'`); thử lại theo backoff; khi nối lại: đăng ký lại subscription, **ghi lại toàn bộ** input plant → PLC (đồng bộ lại), đưa `quality 'good'`.
6. `getDiagnostics()`: `state` (`RUN` khi đã kết nối, `DISCONNECTED`, `FAULT` khi lỗi cấu hình/chứng chỉ), `info`: `endpoint`, `rttMsAvg/Max`, `lastWriteAgeMs`, `lastReadAgeMs`, `dirtyCount`, `missingNodes`.

### 8.3 Controller giả (fixture) cho test: `fake-plc-opcua.ts`
Server node-opcua dựng trong test, mô phỏng một PLC đơn giản tương thích sơ đồ `s7-1500` (`ns=3`): nodes `START_PB, STOP_OK, OVL_OK, PERM, RUN_FB, RESET_PB` (ghi bởi VCS) và `RUN_CMD, FAULT_LAMP` (đọc bởi VCS); **logic giống `FB_Motor` của M1** viết bằng JS, quét mỗi 10 ms theo đồng hồ thật. Có phiên bản Modbus (`fake-plc-modbus.ts`, cùng logic, bảng coil/holding). Dùng cho nghiệm thu Chế độ B (mục 17).

---

## 9. Khung chung cho adapter ngoài (`comms/external/`)

**Nguyên tắc:** `ControllerAdapter.step()` phải **đồng bộ** (M0); mọi I/O mạng chạy trong **vòng nền bất đồng bộ**; hai bên trao đổi qua **bộ đệm** → mô phỏng không bị chặn bởi mạng.

```ts
abstract class ExternalAdapterBase implements ControllerAdapter {
  kind = 'external' as const;
  // step(T, dt) [ĐỒNG BỘ]:
  //   1. với mỗi tag Q (PLC→plant): tags.set(h, cache.q[i], 'plc'); tags.setQuality(h, cache.qQuality[i])   // chỉ khi đổi
  //   2. với mỗi tag I (plant→PLC): v = tags.get(h); nếu v !== lastSent[i] → dirty.add(i)
  // vòng nền: poll/subscribe + batch write theo chu kỳ cấu hình; cập nhật cache, thống kê
  protected abstract connect(): Promise<void>; protected abstract pump(): Promise<void>;
}
```
- Độ trễ vòng kín = trễ `step` (≤ 1 bước) + chu kỳ poll/publish + RTT + quét PLC. **Không bù trễ**; ghi rõ trong tài liệu và báo cáo (mục 13 của M3: `chế độ B` + `rtt`).
- **Khóa tốc độ:** `SimulationService` kiểm `controllers.some(c => c.kind === 'external')` → `timeScale` ép `1` (lệnh khác → `WS-E003` + `COM-W020`), `sim.state.locked = true`; UI vô hiệu hóa chọn tốc độ. `Reset` mô phỏng không đặt lại PLC ngoài (hiển thị cảnh báo).
- `snapshot()` trả `{ kind:'external', lastSent }`; `restore()` chỉ nạp lại `lastSent` và log cảnh báo (trạng thái PLC ngoài **không** khôi phục được) → **M3 baseline/checkpoint không dùng với controller ngoài**; runner kiểm `kind` và báo `TS-E040`.
- Thống nhất mã hóa giá trị: Bool/int/float theo kiểu node/thanh ghi; tag `Real` qua `Math.fround`.

---

## 10. Quản lý và giao diện Communications

### 10.1 REST/WS (`apps/server`)
| API | Mô tả |
|---|---|
| `GET /api/comms/gateways` | Danh sách gateway: id, kind, stats, endpoints, state; danh sách adapter ngoài + trạng thái (`getDiagnostics`) |
| `POST /api/comms/gateways/:id/start` \| `stop` | Điều khiển |
| `GET /api/comms/mapping/:id` | `mappingRows()` (Modbus: bảng địa chỉ; OPC UA: danh sách node) |
| `GET /api/comms/export/:id.csv` | CSV (Modbus map / OPC UA nodes: `nodeId, browsePath, tag, dataType, access, controller`) |
| `GET /api/comms/log?since=&gateway=` , WS `comms.log` | Log |
| `POST /api/comms/log/verbose` `{gateway, on}` | Bật/tắt ghi chi tiết |
| `GET /api/comms/pki/:id`, `POST /api/comms/pki/:id/trust\|reject\|delete` `{thumbprint}` | Chứng chỉ |
| WS `comms.status` | Đẩy trạng thái khi đổi và mỗi 1 s |
Các `POST` cần `Origin` hợp lệ (M0) và, nếu đặt `VCS_ADMIN_TOKEN`, header `Authorization: Bearer`.

### 10.2 Trang **Communications** (web)
- Thẻ cho từng gateway/adapter: trạng thái (chấm + chữ), endpoint (nút copy), số client/phiên, số monitored item, đếm đọc/ghi/lỗi, thời gian chạy; nút **Start/Stop**; cảnh báo cấu hình (`COM-W*`) hiển thị tại chỗ.
- Tab **Mapping**: bảng ảo hóa (Modbus: bảng/địa chỉ/FC/tag/kiểu/quyền; OPC UA: nodeId/browse path/tag/kiểu/quyền), lọc, **Export CSV**, chỉnh `map`/overrides tại chỗ (ghi lại `comms.yaml`/overrides, kiểm trùng ngay).
- Tab **Log**: dòng cuộn có lọc theo gateway/mức/loại, bật verbose, nút xóa.
- Tab **Security** (OPC UA): chọn policy/mode, danh sách chứng chỉ chờ + Trust/Reject, hiển thị `applicationUri`/thumbprint của server (để dán vào SCADA).
- Với adapter ngoài: RTT, độ trễ ghi, node thiếu, nút "Kết nối lại ngay".

---

## 11. HMI

### 11.1 Mô hình tệp
```
hmi/
  hmi.yaml                      # { schemaVersion, startScreen, theme: auto|light|dark, standard: default|isa101 }
  screens/<id>.json             # mỗi màn hình một file
  symbols/<id>.json             # symbol riêng của dự án (ghi đè/ bổ sung thư viện chuẩn)
```
- `id` màn hình: `^[a-z0-9][a-z0-9_-]{0,63}$`. JSON ghi **tất định**: khóa theo thứ tự cố định, 2 dấu cách, LF, số làm tròn tối đa 2 chữ số thập phân cho tọa độ (diff git sạch).

### 11.2 Schema màn hình và widget (`packages/hmi`, zod)
```ts
interface HmiScreen {
  schemaVersion: 1; id: string; title: string;
  size: { w: number; h: number };                       // px logic, mặc định 1280×720
  background?: string;                                  // token hoặc hex
  grid?: { size: number; snap: boolean };
  widgets: HmiWidget[];                                 // thứ tự mảng = thứ tự z (cuối = trên cùng)
}
type Expr = string;                                     // ngôn ngữ biểu thức mục 11.3
interface WidgetBase {
  id: string; name?: string; type: string;
  x: number; y: number; w: number; h: number; rotation?: number;
  visible?: Expr; opacity?: number; locked?: boolean;   // locked: chỉ editor
  tooltip?: string;
}
```
Danh mục widget P0:

| `type` | Thuộc tính chính | Hành vi |
|---|---|---|
| `rect`, `ellipse` | `fill`, `stroke`, `strokeWidth`, `radius?`, `fillRules?: [{when: Expr, fill: token}]` | Hình + màu động (quy tắc đầu tiên khớp) |
| `line`, `polyline` | `points`, `stroke`, `strokeWidth`, `dash?`, `strokeRules?` | Đường ống/liên kết; màu theo trạng thái |
| `text` | `text`, `fontSize`, `align`, `fontWeight`, `fill`, `textExpr?: Expr` | `textExpr` cho chuỗi/số động (`textExpr` ưu tiên khi có) |
| `lamp` | `on: Expr`, `onColor`, `offColor`, `blinkWhen?: Expr`, `shape: circle\|square`, `label?` | Đèn báo (kèm chữ/biểu tượng, không chỉ màu) |
| `button` | `label`, `mode: momentary\|toggle\|set\|reset\|pulse\|navigate`, `tag?`, `value?`, `pulseMs?`, `target?` (screen id), `confirm?: boolean`, `enabled?: Expr`, `activeWhen?: Expr` | Lệnh ghi qua broker; xem 11.6 |
| `numeric` | `value: Expr`, `decimals`, `unit?`, `mode: display\|input`, `tag?` (khi input), `min?`, `max?`, `fontSize`, `align` | Hiển thị/nhập số |
| `bar` | `value: Expr`, `min`, `max`, `orientation`, `unit?`, `showValue`, `thresholds?: [{at, color}]` | Thanh mức |
| `symbol` | `symbol: string`, `inputs: Record<string, Expr>`, `equipment?: string`, `props?`, `label?`, `onClick?: { navigate: screenId } \| { write: {...} }` | Biểu tượng công nghiệp theo trạng thái (11.5) |
| `group` | `children: HmiWidget[]` (toạ độ tương đối) | Gom nhóm, di chuyển cùng nhau |
- **Màu:** token (`token:run|stop|fault|warn|ok|info|bg|fg|muted|border|accent`) hoặc hex; token ánh xạ biến CSS theo `theme` và `standard` (`isa101` = nền xám nhạt, màu rực chỉ cho bất thường; `default`).
- Widget id duy nhất trong màn hình (`HMI-E006`).

### 11.3 Ngôn ngữ biểu thức cho HMI (`@vcs/expr`)
- Dùng **cùng ngữ pháp M3 §5.1** nhưng **tập con**: toán tử số học/so sánh/logic; hàm `abs, min, max, round, eng`; tham chiếu `TAG` (tên hoặc `"tên có dấu"`) và `$EQ.role`. **Không** có `@EQ.obs`, `prev/rose/fell/changed/since` (cần dữ liệu plant/lịch sử).
- **Resolver tiêm vào:** HMI cung cấp `resolveTag(name) → {index, type, scaling}` từ `defs` của broker, và `resolveRole(eq, role) → tagName` từ `project.equipment`. `$EQ.role` được **giải lúc biên dịch** thành tag; role/equipment không tồn tại → `HMI-E004`.
- Biên dịch một lần khi nạp màn hình → closure `(values: ArrayLike<TagValue>) => unknown`; tập `refs` dùng để subscribe đúng các tag cần.
- Kết quả mong đợi theo ngữ cảnh: `visible/on/blinkWhen/enabled/activeWhen/when` → bool (số ≠ 0 coi true), `value/textExpr` → số/chuỗi/bool. Lỗi đánh giá (tag `bad`, chia 0) → widget hiện trạng thái "không xác định" (gạch chéo, nhãn `?`), không làm đổ cả màn hình.

### 11.4 Quy tắc dữ liệu thời gian thực
- Runtime đăng ký **một** `tags.subscribe` với hợp các `refs` của màn hình đang mở; khi chuyển màn hình → cập nhật tập đăng ký.
- Store (Zustand) giữ `values[tagIndex]`, `quality[tagIndex]`; mỗi widget dùng selector theo **chỉ các tag của nó**; cập nhật gom theo `requestAnimationFrame`.
- Mất kết nối WS: lớp phủ "mất kết nối", **mọi giá trị chuyển sang trạng thái cũ (stale)**: gạch xéo mờ + nhãn thời gian cuối; khi nối lại tự đăng ký và đồng bộ.
- Tag `quality 'bad'` (adapter ngoài mất kết nối...) → widget liên quan hiển thị stale/`?` kèm tooltip lý do.

### 11.5 Symbol
```json
{
  "id": "motor", "title": "Motor", "category": "drives", "size": { "w": 48, "h": 48 },
  "inputs": [
    { "name": "run",   "type": "bool", "default": false },
    { "name": "fault", "type": "bool", "default": false },
    { "name": "ready", "type": "bool", "default": true }
  ],
  "states": [
    { "name": "fault",   "when": "fault" },
    { "name": "running", "when": "run" },
    { "name": "stopped", "when": "true" }
  ],
  "svg": "<g> ... </g>"
}
```
- `states`: danh sách **ưu tiên từ trên xuống**, `when` là biểu thức trên **input** của symbol (cùng ngôn ngữ 11.3, tham chiếu input theo tên). Trạng thái được chọn xuất hiện trên phần tử gốc dưới dạng `data-state="running"`.
- SVG trong symbol dùng các thuộc tính điều khiển (allowlist 11.8):
  - `data-show="running|fault"`: phần tử chỉ hiện ở các trạng thái liệt kê.
  - `data-fill-state='{"running":"token:run","fault":"token:fault","stopped":"token:stop"}'`: màu theo trạng thái.
  - `data-level="<inputName>"` + `data-level-min/max`: co giãn phần tử (rect) theo input số (silo, tank).
  - `data-rotate="<inputName>"`: quay theo input (P1: quạt).
  - `data-blink-state="fault"`: nhấp nháy ở trạng thái (tôn trọng `prefers-reduced-motion`).
- **Không dựa hoàn toàn vào màu:** mỗi trạng thái có thêm dấu hiệu hình (ví dụ `fault` có ký hiệu "!", `running` có mũi tên/ chữ `R` nhỏ).
- Binding trong widget: `inputs: { run: "$CR01_M01.runFb", fault: "CR01_FAULT" }`; **autobind** `equipment: "CR01_M01"` suy ra input theo bảng quy ước của từng symbol (`motor`: `run ← runFb`, `fault ← not overloadOk`(nếu có) hoặc `faultTag` của bindings M3, `ready ← ready`; `valve_onoff`: `open ← openLs`, `closed ← closedLs`, ...). Người dùng có thể ghi đè từng input.
- **Thư viện chuẩn P0 (Phụ lục B):** `motor`, `motor_vfd`, `valve_onoff`, `valve_ctrl`, `conveyor`, `silo`, `fan`, `pump`, `tank`, `instrument` (nhãn đo kèm giá trị), `pipe` (đã thuộc `polyline`), `switch` (công tắc/limit). Symbol dự án (`hmi/symbols/*.json`) trùng id sẽ ghi đè bản chuẩn.

### 11.6 Điều khiển (button, numeric input)
- **Quyền:** nút/ô nhập bị **vô hiệu** (mờ + tooltip lý do) nếu tag đích `writable = false` (theo `defs`) hoặc `enabled` = false → `HMI-W002` khi thiết kế.
- `momentary`: `pointerdown` → ghi `true`; `pointerup/pointercancel/pointerleave`, `blur` cửa sổ, mất WS → ghi `false` (đảm bảo nhả; server cũng không giữ trạng thái "đang nhấn" sau khi WS đóng: **khi kết nối WS đóng, server ghi `false` cho mọi tag momentary mà kết nối đó đã đặt `true`** — theo dõi bằng danh sách `held` mỗi kết nối).
- `toggle`: ghi `!giá_trị_hiện_tại` (đọc từ broker); `set/reset`: ghi `value` / `false`; `pulse`: ghi `true`, hẹn nhả sau `pulseMs` **ở phía server** (`post` hai lệnh theo bước mô phỏng thông qua timer wall, ≥ 1 bước); `navigate`: chuyển màn hình.
- `confirm: true`: hộp xác nhận (Enter/Esc, không bấm nhầm nhanh: nút xác nhận bật sau 300 ms).
- `numeric` input: Enter ghi, Esc hủy, kiểm tra kiểu/khoảng của tag (+ `min/max` của widget) trước khi gửi; lỗi hiện tại chỗ.
- Mọi lệnh ghi qua WS `tag.write` (M0) → `broker.write(name, v, 'hmi')`; phản hồi `error` hiển thị toast.

### 11.7 Runtime và Designer (web)
**Điều hướng:** `/hmi` (danh sách màn hình), `/hmi/:id` (runtime), `/hmi/:id/edit` (designer). Tham số `?kiosk=1` ẩn khung; nút toàn màn hình; **scale-to-fit** giữ tỉ lệ.

**Runtime:** render SVG; ≥ 500 widget cập nhật 10 Hz ≥ 50 FPS (mục 14); tooltip hiện tên tag/giá trị/chất lượng.

**Designer (P0):**
| Tính năng | Chi tiết |
|---|---|
| Canvas | SVG; pan (Space+kéo/giữa chuột), zoom (cuộn + Ctrl), lưới + snap, khung màn hình |
| Palette | Hình cơ bản, điều khiển, **thư viện symbol** (xem trước, tìm kiếm), `group` |
| Chọn/chỉnh | Chọn đơn + chọn nhiều (kéo khung/Shift), di chuyển, đổi kích thước (8 tay nắm), xoay (P1), phím mũi tên (1 px; Shift = 10 px) |
| Thao tác | Copy/Paste/Duplicate (Ctrl+C/V/D), Delete, Group/Ungroup, Bring-to-front/Send-to-back, khóa widget, **Undo/Redo** (Ctrl+Z/Y) bằng **command stack** (giới hạn 200) |
| Thuộc tính | Panel sinh từ schema zod (mô tả, đơn vị, kiểu), ô biểu thức có **kiểm tra tức thì** + **autocomplete** tag/equipment/role + **giá trị hiện tại** khi mô phỏng đang chạy |
| Chế độ Test | Nút "Chạy thử": render runtime ngay trong designer (không rời trang, vô hiệu chỉnh sửa) |
| Màn hình | Tạo/đổi tên/nhân bản/xóa; đặt màn hình khởi động (`hmi.yaml`) |
| Lưu | Tự động (debounce 1.5 s) + Ctrl+S; **phát hiện xung đột** qua `etag` (sha256 nội dung): nếu file đổi từ ngoài → hộp thoại "tải lại/ghi đè"; trạng thái "chưa lưu" |
| Kiểm tra | Panel **Problems**: `HMI-*` (tag/symbol/role không tồn tại, biểu thức lỗi, widget ngoài khung, nút điều khiển tag không writable) với nhảy tới widget |
Phím tắt có trợ giúp (`?`); thao tác chính truy cập được bằng bàn phím; nhãn ARIA cho palette/panel.

### 11.8 Bảo mật nội dung (bắt buộc, có test)
- Văn bản widget render **như text**, không bao giờ như HTML.
- **Symbol SVG** (chuẩn và của dự án) đi qua **sanitizer allowlist** trước khi render: phần tử cho phép `g, path, rect, circle, ellipse, line, polyline, polygon, text, tspan, defs, linearGradient, radialGradient, stop, clipPath, use(chỉ href="#id")`; thuộc tính cho phép: hình học/kiểu chuẩn (`d, x, y, cx, cy, r, rx, ry, width, height, points, transform, fill, stroke, stroke-width, stroke-linecap, stroke-linejoin, stroke-dasharray, opacity, font-size, font-family, text-anchor, id, class, viewBox`) và các `data-show/data-fill-state/data-level*/data-rotate/data-blink-state`. **Cấm:** `script, foreignObject, style` (CSS tùy ý), mọi `on*`, `href`/`xlink:href` ngoài `#id`, `javascript:`/`data:`. Vi phạm → `HMI-E005` và **không render** symbol.
- Biểu thức chạy trong trình thông dịch `@vcs/expr` (không `eval`, không truy cập đối tượng toàn cục).
- API ghi màn hình/symbol: kiểm `id` theo regex, giới hạn kích thước (≤ 2 MB/file), chỉ ghi trong `hmi/` (chặn path traversal), Origin + token tùy chọn (mục 12).

### 11.9 API HMI (`apps/server/hmi-routes.ts`)
| API | Mô tả |
|---|---|
| `GET /api/hmi` | `hmi.yaml` + danh sách màn hình `{id, title, etag}` + danh sách symbol |
| `GET /api/hmi/screens/:id` | JSON + `etag` |
| `PUT /api/hmi/screens/:id` | Body `{ screen, ifMatch }`; xác thực schema + sanitize; `412` nếu `etag` lệch; ghi file tất định; **bị chặn khi `--hmi-readonly`** (`403`) |
| `DELETE /api/hmi/screens/:id` | Xóa (không xóa màn hình khởi động) |
| `GET /api/hmi/symbols` | Thư viện chuẩn + của dự án (đã sanitize) |
| `POST /api/hmi/validate` | Trả `HMI-*` diagnostics (server kiểm bằng catalog + equipment) |

---

## 12. Bảo mật tổng hợp
- Mặc định mọi cổng bind `127.0.0.1`; bind rộng hơn phải khai báo rõ + cảnh báo trong log/UI (`COM-W002`); README/tài liệu nêu rủi ro (không xác thực Modbus; OPC UA anonymous).
- Bí mật qua biến môi trường (`passwordEnv`), **không** nằm trong YAML/log; log ẩn mật khẩu.
- PKI: thư mục `.vcs/pki` quyền chỉ chủ sở hữu (Linux `0700`; Windows ACL mặc định thư mục người dùng); khóa riêng không bao giờ trả qua API.
- Mọi endpoint ghi (`PUT/POST/DELETE`) kiểm `Origin` + (nếu đặt) `VCS_ADMIN_TOKEN`.
- Giới hạn tài nguyên: số phiên/subscription/monitored item (OPC UA), số kết nối/độ dài khung (Modbus), kích thước body REST, tốc độ ghi log.
- Cảnh báo pháp lý/kỹ thuật trong tài liệu: kết nối VCS vào mạng sản xuất thật **không được khuyến nghị**; chỉ dùng trong mạng FAT/phòng thí nghiệm tách biệt.

---

## 13. Chiến lược test

### 13.1 Số lượng tối thiểu
| Nhóm | Test |
|---|---|
| `@vcs/expr` sau khi tách (M3 vẫn xanh) + resolver HMI | ≥ 20 mới |
| `TagBroker` (đọc I/Q & M/DB, ghi theo luật 4.2, `applyIfIdle`, subscribe M/DB theo nhu cầu) | ≥ 30 |
| `applyInbox`, `validateTagValue` (M0 vá) | ≥ 10 |
| Modbus codec (mỗi FC, exception, giới hạn, tách/gộp khung TCP, bit packing) | ≥ 50 |
| Mã hóa kiểu × `byteOrder` (golden) | ≥ 40 |
| Modbus server (đọc/ghi, all-or-nothing, gap, partial, unit id, giới hạn kết nối) bằng client của chính ta **và `modbus-serial`** | ≥ 30 |
| Modbus adapter (gom khối, ghi khi đổi, mất kết nối/nối lại, `onDisconnect`) với `fake-plc-modbus` | ≥ 15 |
| Mapping/node id (sơ đồ `s7-1500`/`vcs`, tên phân cấp, trùng, namespace giữ chỗ) | ≥ 25 |
| OPC UA server (browse, read, write mã trạng thái, subscription, kiểu dữ liệu, quyền, `Simulation` folder) bằng client node-opcua | ≥ 30 |
| OPC UA bảo mật (None, Basic256Sha256 Sign/SignAndEncrypt, username đúng/sai, chứng chỉ bị từ chối → Trust → thành công) | ≥ 10 |
| OPC UA adapter + `fake-plc-opcua` (kết nối, thiếu node, kiểu, subscription, ghi theo lô, mất kết nối/nối lại, đồng bộ lại) | ≥ 20 |
| **Vòng kín Chế độ B** (fake PLC ↔ adapter ↔ plant `motor_dol`) | ≥ 4 kịch bản |
| `hmi` (schema, validate, symbol states, sanitizer — mỗi phần tử/thuộc tính cấm ≥ 1 test, golden JSON tất định) | ≥ 60 |
| HMI runtime (RTL: mỗi loại widget, stale, quyền nút, momentary nhả khi blur/mất WS) | ≥ 40 |
| Designer (reducer/command stack, undo/redo, snap, nhóm, lưu + xung đột etag) | ≥ 40 |
| REST/WS mới (Communications, HMI, `--hmi-readonly`, Origin/token) | ≥ 25 |
| Playwright e2e | ≥ 5 |

### 13.2 Chạy test tích hợp mạng
- Dự án Vitest riêng `integration` (cổng ngẫu nhiên do hệ điều hành cấp, `port: 0` → đọc lại cổng thực); mặc định **tắt trong `pnpm test`**, chạy trong CI job riêng (`pnpm test:integration`) trên Linux + Windows. Thời gian chờ rộng; mỗi test dọn sạch (đóng server/client). Test **không** phụ thuộc đồng hồ chính xác (dùng `waitFor` với timeout).
- Kiểm tra **tương thích bên thứ ba**: `modbus-serial` (client và server) cho Modbus; client node-opcua độc lập cho OPC UA. Danh mục tay (owner, mục 19): UaExpert + một Modbus master GUI.

### 13.3 E2E Playwright
1. Mở Communications: thấy OPC UA/Modbus `running` với endpoint; bật verbose; Export CSV tải được và đúng số dòng.
2. Dùng client OPC UA (trong test) ghi `START_PB` (tag `free`) → trên web `LAMP_RUN`/`RUN_CMD` đổi (với dự án mẫu có controller); ghi vào tag plant-owned bị từ chối.
3. Designer: kéo symbol `motor` + `lamp` + `button`, bind tag (autocomplete), Lưu → file `hmi/screens/*.json` đúng và tất định; sang runtime, Run, nhấn nút → trạng thái symbol đổi.
4. Mất WS (đóng server) → lớp phủ + stale; mở lại → tự đồng bộ.
5. `--hmi-readonly`: designer báo chỉ đọc, `PUT` bị 403.

### 13.4 Dự án mẫu cho M4: `examples/crusher-sequence`
Dùng lại dự án M3 và thêm: `comms/comms.yaml` (OPC UA `s7-1500` ns=3 + Modbus), `hmi/` (màn hình tổng quan dây chuyền: 7 motor, băng tải, silo, đèn trạng thái, nút Start/Stop/Reset, E-stop), `docs/` hướng dẫn UaExpert.

---

## 14. Hiệu năng (bắt buộc đạt)
- **OPC UA:** 2 000 monitored item, sampling 100 ms, mô phỏng chạy 1× với dự án ~2 000 tag: CPU tiến trình server ≤ **25% một lõi**; độ trễ từ lúc client ghi → hiệu lực ở tag ≤ `stepMs + 20 ms` khi đang chạy; không làm `SimulationService` trễ lát > 50 ms (đo drift).
- **OPC UA:** khởi động server với 5 000 node ≤ 5 s.
- **Modbus:** đọc 125 thanh ghi ≤ 2 ms (server); 100 kết nối nhàn rỗi không tốn CPU đáng kể; 1 000 request/giây xử lý ổn định.
- **Adapter ngoài:** `step()` không chặn (đo ≤ 50 µs/200 tag); RTT hiển thị.
- **HMI:** màn hình 500 widget, 10 Hz cập nhật ≥ 50 FPS (Playwright trace, không bắt buộc CI); designer kéo thả 500 widget ≥ 30 FPS; JSON màn hình 500 widget nạp ≤ 100 ms.
- `pnpm bench` bổ sung nhóm `comms`/`hmi`; hồi quy > 20% → cảnh báo CI.

---

## 15. Mã chẩn đoán

| Mã | Mức | Ý nghĩa |
|---|---|---|
| COM-E001 | error | Cấu hình comms không hợp lệ (schema/giá trị) |
| COM-E002 | error | Không mở được cổng (bị chiếm/không quyền) |
| COM-E003 | error | Lỗi chứng chỉ/PKI |
| COM-E004 | error | Thiếu biến môi trường mật khẩu |
| COM-E010 | error | Trùng NodeId |
| COM-E011 | error | Trùng/chồng địa chỉ Modbus |
| COM-E012 | error | Kiểu dữ liệu không ánh xạ được |
| COM-W002 | warn | Bind ngoài localhost |
| COM-W003 | warn | `autoTrustClients` bật |
| COM-W010 | warn | Node/địa chỉ của PLC ngoài không tồn tại / chưa ánh xạ |
| COM-W011 | warn | Kiểu node không tương thích với tag |
| COM-W020 | warn | Có controller ngoài → `timeScale` bị khóa 1× |
| COM-W030 | warn | Ghi (xếp hàng) thất bại lúc thực thi |
| COM-I001 | info | Client kết nối/ngắt |
| HMI-E001 | error | JSON màn hình/symbol không hợp lệ |
| HMI-E002 | error | Tag không tồn tại |
| HMI-E003 | error | Symbol không tồn tại |
| HMI-E004 | error | Biểu thức lỗi (cú pháp/role/equipment) |
| HMI-E005 | error | Symbol vi phạm sanitizer |
| HMI-E006 | error | Trùng widget id |
| HMI-W001 | warn | Widget ngoài khung màn hình |
| HMI-W002 | warn | Điều khiển gắn với tag không writable |
Mọi thông báo nêu: đối tượng (gateway/tag/widget id), vị trí (file/dòng nếu có) và **hướng sửa**. Đăng ký vào `DiagnosticCatalog` (M0).

---

## 16. Kế hoạch triển khai và prompt cho AI

| Ngày | Công việc | Kết quả |
|---|---|---|
| 1 | Vá M0 (`applyInbox`, `validateTagValue`, schema `files.comms/hmi`, protocol additive), tách `@vcs/expr`, `TagBroker`, chuyển WS sang broker | test xanh, Tags page hiện cả M/DB |
| 2–3 | Modbus codec + mã hóa kiểu + tests | ≥ 90 test |
| 4 | Modbus server + mapping/CSV + test với `modbus-serial` | SCADA tool đọc/ghi được |
| 5 | Khung adapter ngoài + Modbus client/adapter + `fake-plc-modbus` | vòng kín Modbus |
| 6–8 | OPC UA server: không gian node, sơ đồ node id, kiểu, đọc/ghi/status, security + PKI, ghi qua broker | client node-opcua đạt; test bảo mật |
| 9 | Ngưỡng hiệu năng OPC UA (bench), phương án push nếu cần, ADR | bench đạt |
| 10–11 | OPC UA client adapter + `fake-plc-opcua` + vòng kín với plant (Chế độ B) | kịch bản nghiệm thu |
| 12 | `GatewayManager`, REST/WS, log, trang Communications | UI hoàn chỉnh |
| 13–14 | `packages/hmi`: schema, validate, symbol + sanitizer, thư viện symbol chuẩn, compile binding | ≥ 60 test |
| 15 | HMI runtime (render, binding, điều khiển, stale) | demo `crusher-sequence` |
| 16–17 | Designer (canvas, palette, thuộc tính, undo/redo, lưu/etag, Problems) | e2e |
| 18 | `docs/scada-integration.md`, ví dụ, bench, tinh chỉnh, đệm | nghiệm thu |

### Prompt mẫu

**P4.1 (nền):**
> Đọc `M4-comms-and-hmi-spec.md` mục 2, 4. (a) Vá M0: `orchestrator.applyInbox()`, `validateTagValue`, schema `files.comms/hmi`, thông điệp WS additive (`comms.*`, `locked`). (b) Tách `packages/testing/src/expr` thành `@vcs/expr` (resolver tiêm vào), `testing` import lại, **toàn bộ test M3 phải vẫn xanh**. (c) Cài `TagBroker` đúng 4.1–4.3 trong kernel và chuyển WS handler sang broker (`tags.snapshot` gồm cả M/DB). Cập nhật `.dependency-cruiser.cjs`. Test ≥ 70.

**P4.2 (Modbus codec + server):**
> Theo mục 6.1–6.4: codec MBAP/PDU thuần (FC 1,2,3,4,5,6,15,16 + exception), mã hóa kiểu × `byteOrder`, tự gán địa chỉ tất định, xuất CSV, server `node:net`. Tự viết golden test cho từng kiểu × từng byteOrder trước. Kiểm tương thích bằng `modbus-serial` làm client độc lập (dependency chỉ cho test). Ghi tất-cả-hoặc-không đúng 6.4.

**P4.3 (khung adapter ngoài + Modbus adapter):**
> Theo mục 9 và 6.5–6.6: `ExternalAdapterBase` (step đồng bộ + cache + vòng nền), Modbus client/adapter (gom khối, ghi khi đổi, kết nối lại, `onDisconnect`), khóa timeScale trong `SimulationService`. Viết `fake-plc-modbus` với logic giống `FB_Motor`; kịch bản vòng kín với plant `motor_dol` (tolerance rộng, `waitFor`).

**P4.4 (OPC UA server):**
> Theo mục 7: không gian node + sơ đồ `s7-1500`/`vcs` (namespace giữ chỗ), ánh xạ kiểu, getter đọc từ `TagBroker`, ghi qua `broker.write` với bảng StatusCode 7.4, security Basic256Sha256 + username, PKI tự ký + quy trình Trust. Test bằng client node-opcua độc lập. **Chạy bench 2 000 monitored item**; không đạt → chuyển I/Q sang push theo 7.4 và ghi ADR.

**P4.5 (OPC UA client adapter):**
> Theo mục 8 và 9: adapter `external:opcua` (subscription cho tag Q, ghi theo lô cho tag I, đọc DataType node lúc nối, `COM-W010/W011`, mất kết nối/đồng bộ lại), `fake-plc-opcua`, vòng kín với plant (nghiệm thu Chế độ B).

**P4.6 (GatewayManager + Communications UI):** mục 5.3–5.4, 10.

**P4.7 (HMI nền):**
> Theo 11.1–11.5, 11.8: schema zod màn hình/widget/symbol, validate (`HMI-*`), compile binding bằng `@vcs/expr` + resolver, symbol states, **sanitizer allowlist** (mỗi phần tử/thuộc tính cấm có test), thư viện symbol chuẩn (Phụ lục B), JSON ghi tất định.

**P4.8 (HMI runtime + designer):**
> Theo 11.4, 11.6, 11.7, 11.9: runtime (store theo selector, rAF, stale, điều khiển có quyền/confirm/momentary an toàn), designer (command stack, snap, nhóm, panel thuộc tính từ schema, autocomplete, Problems, lưu etag), REST HMI, `--hmi-readonly`. Playwright e2e theo 13.3.

**P4.9 (tài liệu + nghiệm thu):** `docs/scada-integration.md` (Phụ lục C), ví dụ `crusher-sequence`, chạy bench/integration trên Linux + Windows.

Mỗi prompt kết thúc: *"Chạy test/lint/typecheck/depcheck/bench (kèm test integration nếu có), báo cáo kết quả, liệt kê mọi giả định tự đặt vào `docs/open-questions.md`, không sửa package ngoài phạm vi (nêu lý do nếu buộc phải), không hạ tiêu chí nghiệm thu."*

---

## 17. Tiêu chí nghiệm thu M4 (tất cả phải đạt)

1. `pnpm lint/typecheck/depcheck/test` xanh; `pnpm test:integration` xanh trên **Linux và Windows**; M0–M3 không hồi quy (test M3 vẫn xanh sau khi tách `@vcs/expr`).
2. **(PRD)** Client OPC UA công khai (**UaExpert** hoặc tương đương) kết nối `opc.tcp://localhost:4840`: duyệt cây, **đọc/ghi tag** `free` và tag `M/DB`, subscription cập nhật khi mô phỏng chạy; ghi vào tag plant-owned bị từ chối đúng `BadNotWritable`.
3. Với `nodeIdScheme: s7-1500, namespaceIndex: 3`: node id đúng dạng `ns=3;s="Tag"` / `ns=3;s="DB"."Member"` (test tự động) — SCADA dùng tag trỏ node id thật **không đổi cấu hình tag**.
4. OPC UA `Basic256Sha256` `SignAndEncrypt` + username: kết nối thành công sau khi **Trust** chứng chỉ trong UI; trước đó bị từ chối; sai mật khẩu bị từ chối.
5. **Modbus:** `modbus-serial` (client độc lập) đọc/ghi coil/holding/input đúng theo bảng CSV xuất ra; mọi kiểu × `byteOrder` đúng; ghi một phần tag nhiều-word bị `exception 3`; ghi vào địa chỉ chỉ đọc bị exception theo cấu hình.
6. **(PRD) Chế độ B:** PLC giả (`fake-plc-opcua` **và** `fake-plc-modbus`) điều khiển plant `motor_dol` qua adapter: start → `RUN_FB` về PLC sau độ trễ động cơ → timer mất feedback; `overload` tiêm từ plant làm PLC giả cắt `RUN_CMD`; mất kết nối → `quality 'bad'` + `DISCONNECTED`, nối lại → đồng bộ lại; `timeScale` bị khóa 1×.
7. Hiệu năng mục 14 đạt (bench OPC UA 2 000 monitored item).
8. Trang Communications hoàn chỉnh: trạng thái, mapping, Export CSV, log (verbose), tab Security (Trust/Reject), điều khiển Start/Stop; một gateway lỗi không ảnh hưởng gateway khác/mô phỏng.
9. **HMI:** tạo màn hình tổng quan `crusher-sequence` bằng designer (không sửa file tay): symbol theo trạng thái, nút Start/Stop/Reset hoạt động, đèn, thanh mức silo; lưu file **tất định**; runtime chạy đúng khi mô phỏng chạy; mất WS → stale; mọi vi phạm sanitizer bị chặn (test).
10. Nút `momentary` luôn nhả khi: nhả chuột, rời nút, mất focus, mất kết nối WS (cả phía server).
11. `--hmi-readonly`, `--no-comms`, Origin/token hoạt động; mật khẩu không xuất hiện trong log/API.
12. Mọi mã `COM-*`/`HMI-*` đã đăng ký catalog, có test và thông báo hành động được; `docs/scada-integration.md` đủ để người khác nối WinCC/UaExpert/Modbus master theo từng bước.
13. Không `any` ngoài ranh giới I/O; `hmi`/`expr` không dùng thời gian/ngẫu nhiên thật.

---

## 18. Quyết định mặc định (để AI không dừng hỏi)

| Chủ đề | Quyết định |
|---|---|
| Modbus | Tự cài codec/server/client (`node:net`); `modbus-serial` chỉ để test |
| Port mặc định | OPC UA 4840; Modbus 1502 |
| Bind mặc định | `127.0.0.1` |
| NodeId mặc định | `s7-1500`, `namespaceIndex 3` (cấu hình được) |
| OPC UA đọc | Pull (getter) + bench; dự phòng push cho I/Q |
| Bảo mật OPC UA mặc định | None/anonymous (dev); khuyến nghị Basic256Sha256 |
| Ghi từ SCADA/HMI | Xếp hàng qua `post`; hiệu lực đầu bước kế hoặc ngay khi tạm dừng (`applyInbox`) |
| Ghi vào tag I/Q plant/controller-owned | Luôn từ chối |
| Modbus ghi | Tất-cả-hoặc-không; partial multi-word → exception 3 |
| Modbus gap đọc | Trả 0 trong phạm vi đã ánh xạ |
| Địa chỉ Modbus | Tự gán tất định, thêm tag ở cuối không đổi địa chỉ cũ |
| Adapter ngoài | `step()` đồng bộ + cache + vòng nền; khóa 1×; không bù trễ |
| Mất kết nối ngoài | Giữ giá trị cuối + `quality 'bad'` |
| HMI vẽ | SVG thuần; JSON tất định; token màu theo theme |
| HMI biểu thức | `@vcs/expr` tập con (không `@obs`, không lịch sử) |
| SVG symbol | Sanitizer allowlist, không render nếu vi phạm |
| Trend/Alarm/Faceplate | P1 (không nghiệm thu) |
| Tất định | Test M3 không bật gateway; gateway/ghi ngoài không tái lập bit-by-bit |

---

## 19. Việc của chủ sản phẩm (song song)

1. **Cho biết SCADA đích** (WinCC Professional/Unified, PCS 7, Ignition, hãng khác) và **giao thức đang dùng tới PLC thật** (OPC UA hay S7/Modbus). Nếu SCADA dùng S7 protocol gốc (S7comm) thay vì OPC UA, cần mục S7comm ở M5.
2. **Xuất danh sách tag/node id thực** từ một dự án SCADA (CSV/XML) kèm vài ví dụ `ns=…;s=…`: dùng để chốt `namespaceIndex`, kiểu quote của node id, quy ước đặt tên DB/UDT, và làm fixture kiểm tra (đã ẩn danh).
3. **Chính sách bảo mật yêu cầu:** security policy/mode của SCADA (Basic256Sha256? chứng chỉ do ai cấp?), có cho dùng chứng chỉ tự ký không, xác thực user/anonymous.
4. **Thử bằng tay với UaExpert** và một Modbus master (ví dụ ModbusPoll/QModMaster) theo checklist trong `docs/scada-integration.md`; và với **một SCADA thật trong mạng FAT/lab tách biệt** (không nối mạng sản xuất).
5. Cung cấp/duyệt **bộ symbol chuẩn của công ty** (SVG, màu theo tiêu chuẩn HMI đang dùng, ISA-101 hay riêng) để thay/ bổ sung thư viện mặc định; chốt **bảng màu trạng thái** (run/stop/fault/warn) và quy ước tên.
6. Quyết định **chuẩn HMI**: có cần faceplate, alarm list, trend ngay không (đang là P1), và người dùng cuối của HMI nội bộ là ai (kỹ sư hay khách hàng witness FAT).
7. Kiểm tra điều khoản **giấy phép** của thư viện (node-opcua và phụ thuộc) và chính sách mạng/firewall (mở cổng 4840/1502) trên máy chạy FAT.
8. Xác nhận **mức tin cậy kết nối SCADA**: ghi từ SCADA được áp dụng ở bước kế tiếp (không tức thì khi đang chạy) — chấp nhận được cho FAT hay cần cơ chế khác?

---

## Phụ lục A — Bảng ánh xạ nhanh

| Tag | Modbus | OPC UA | Quyền SCADA ghi |
|---|---|---|---|
| `kind DI` (plant→PLC), `free` | Discrete input (FC2) hoặc coil nếu `free` | Boolean | chỉ khi `free` |
| `kind DO` (PLC→plant) | Coil (đọc) | Boolean | không |
| `kind AI`, `free` | Input register / holding nếu `free` | Int16/Float/… | chỉ khi `free` |
| `kind AO` | Holding (đọc) | Int16/Float/… | không |
| `M`/`DB` bit/số | Coil/Holding | Boolean/số | có (nếu controller có introspection) |

## Phụ lục B — Symbol chuẩn P0 (input → trạng thái)

| Symbol | Inputs | Trạng thái (ưu tiên trên→dưới) |
|---|---|---|
| `motor` | `run`, `fault`, `ready` | `fault` > `running` > `stopped` |
| `motor_vfd` | `run`, `fault`, `speed` (số, %) | `fault` > `running` (hiện `speed`) > `stopped` |
| `valve_onoff` | `open`, `closed`, `fault` | `fault` > `open` > `closed` > `moving` |
| `valve_ctrl` | `pos` (số, %), `fault` | `fault` > `moving/pos` (kim chỉ vị trí) |
| `conveyor` | `run`, `fault`, `zeroSpeed` | `fault` > `running` (mũi tên chuyển động) > `stopped` |
| `silo` | `level` (số, %), `high`, `low` | mức tô theo `level`; viền cảnh báo khi `high`/`low` |
| `fan` | `run`, `fault`, `speed` | `fault` > `running` > `stopped` |
| `pump` | `run`, `fault` | tương tự motor |
| `tank` | `level`, `high`, `low` | như silo |
| `instrument` | `value` (số), `alarm` | hiển thị giá trị + nhãn; viền đổi theo `alarm` |
| `switch` | `active`, `fault` | `fault` > `active` > `inactive` |

## Phụ lục C — Dàn ý `docs/scada-integration.md`
1. Trước khi bắt đầu: mạng FAT tách biệt, firewall, chọn cổng; **không nối mạng sản xuất**.
2. OPC UA: chọn `nodeIdScheme`/`namespaceIndex` khớp tag SCADA; cấu hình bảo mật; **lấy `applicationUri` + chứng chỉ server**, đưa chứng chỉ SCADA vào `trusted/` hoặc dùng nút Trust; kiểm tra bằng UaExpert; xử lý lỗi thường gặp (`BadSecurityChecksFailed`, `BadCertificateUriInvalid`, host name, lệch đồng hồ).
3. Modbus: xuất CSV, nhập vào SCADA, `byteOrder` đúng, địa chỉ 0/1-based, exception khi ghi chỉ đọc.
4. Tốc độ: giữ **1×** khi SCADA tham gia (timestamp/alarm của SCADA theo đồng hồ thật); tốc độ cao chỉ khi chạy test headless.
5. Ghi từ SCADA có hiệu lực ở bước mô phỏng kế tiếp (và ngay khi tạm dừng).
6. Tag chỉ-đọc (do plant/PLC sở hữu) và lý do; tag nào SCADA được phép ghi.
7. Chế độ B (VCS làm plant cho PLC thật): ánh xạ I/Q, DB giao diện mô phỏng I/O trong PLC, độ trễ vòng kín, giới hạn.
8. Checklist nghiệm thu với SCADA thật; thu thập log (`comms.log`) khi báo lỗi.
