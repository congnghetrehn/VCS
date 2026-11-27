# M5 — Bridge Agent PLCSIM Advanced + S7 (Snap7) + Importer SimaticML: Đặc tả chi tiết

## Mục lục

- [1. Mục tiêu, phạm vi, topologies](#1-mục-tiêu-phạm-vi-topologies)
  - [1.1 Trong phạm vi (P0)](#11-trong-phạm-vi-p0)
  - [1.2 P1 / P2 (không nghiệm thu)](#12-p1-p2-không-nghiệm-thu)
  - [1.3 Ngoài phạm vi](#13-ngoài-phạm-vi)
  - [1.4 Ba topology (quan trọng khi nối SCADA)](#14-ba-topology-quan-trọng-khi-nối-scada)
- [2. Đối chiếu và điều chỉnh so với M0–M4](#2-đối-chiếu-và-điều-chỉnh-so-với-m0m4)
- [3. Sự thật kỹ thuật đã tra cứu (đầu 11/2026) và giới hạn](#3-sự-thật-kỹ-thuật-đã-tra-cứu-đầu-112026-và-giới-hạn)
- [4. Kiến trúc và cấu trúc repo](#4-kiến-trúc-và-cấu-trúc-repo)
- [5. Bridge Agent](#5-bridge-agent)
  - [5.1 Trách nhiệm](#51-trách-nhiệm)
  - [5.2 Luồng và an toàn thread](#52-luồng-và-an-toàn-thread)
  - [5.3 Giao thức VBP/1 (TCP, nhị phân có khung)](#53-giao-thức-vbp1-tcp-nhị-phân-có-khung)
  - [5.4 Lệnh chính (tóm tắt; đầy đủ ở Phụ lục A)](#54-lệnh-chính-tóm-tắt-đầy-đủ-ở-phụ-lục-a)
  - [5.5 Backend](#55-backend)
  - [5.6 Ánh xạ lỗi](#56-ánh-xạ-lỗi)
  - [5.7 Cấu hình agent (`bridge-agent.json`)](#57-cấu-hình-agent-bridge-agentjson)
- [6. Adapter `external:plcsim-advanced`](#6-adapter-externalplcsim-advanced)
  - [6.1 Cấu hình (`vcs.project.yaml`)](#61-cấu-hình-vcsprojectyaml)
  - [6.2 Ý nghĩa tag](#62-ý-nghĩa-tag)
  - [6.3 Ảnh I/O và mã hóa](#63-ảnh-io-và-mã-hóa)
  - [6.4 Chế độ đồng bộ thời gian](#64-chế-độ-đồng-bộ-thời-gian)
  - [6.5 Introspection (M/DB) bằng cache](#65-introspection-mdb-bằng-cache)
  - [6.6 Vòng đời](#66-vòng-đời)
  - [6.7 Điều khiển CPU từ VCS](#67-điều-khiển-cpu-từ-vcs)
  - [6.8 Snapshot và cô lập test (M3)](#68-snapshot-và-cô-lập-test-m3)
- [7. S7 classic: codec, client adapter, server, probe](#7-s7-classic-codec-client-adapter-server-probe)
  - [7.1 Phạm vi giao thức](#71-phạm-vi-giao-thức)
  - [7.2 Codec (`s7/codec.ts`) — tham chiếu nhanh ở Phụ lục B](#72-codec-s7codects-tham-chiếu-nhanh-ở-phụ-lục-b)
  - [7.3 Client adapter `external:s7`](#73-client-adapter-externals7)
  - [7.4 `vcs s7 probe`](#74-vcs-s7-probe)
  - [7.5 Cache/Introspection](#75-cacheintrospection)
  - [7.6 Server gateway `s7-server` (SCADA/OPC server dùng S7 classic đọc/ghi VCS)](#76-server-gateway-s7-server-scadaopc-server-dùng-s7-classic-đọcghi-vcs)
- [8. Công cụ xuất TIA (`vcs-tia-export`)](#8-công-cụ-xuất-tia-vcs-tia-export)
  - [8.1 Mục đích và ràng buộc](#81-mục-đích-và-ràng-buộc)
  - [8.2 CLI](#82-cli)
  - [8.3 Bố cục đầu ra](#83-bố-cục-đầu-ra)
  - [8.4 Build theo phiên bản TIA](#84-build-theo-phiên-bản-tia)
  - [8.5 Không tự động hóa ở M5](#85-không-tự-động-hóa-ở-m5)
- [9. Importer SimaticML (`vcs tia import`)](#9-importer-simaticml-vcs-tia-import)
  - [9.1 Chế độ và đầu vào](#91-chế-độ-và-đầu-vào)
  - [9.2 Đầu ra (tất định, ghi `--commit`)](#92-đầu-ra-tất-định-ghi---commit)
  - [9.3 Đọc XML (nguyên tắc chung — `simaticml/xml.ts`)](#93-đọc-xml-nguyên-tắc-chung-simaticmlxmlts)
  - [9.4 Block và giao diện (`interface.ts`)](#94-block-và-giao-diện-interfacets)
  - [9.5 SCL (`structured-text.ts`) — tái sử dụng parser M1](#95-scl-structured-textts-tái-sử-dụng-parser-m1)
  - [9.6 LAD/FBD (`flgnet.ts`, `lower.ts`) — compile **dataflow** trực tiếp sang IR](#96-ladfbd-flgnetts-lowerts-compile-dataflow-trực-tiếp-sang-ir)
  - [9.7 Bảng tag và hợp nhất với I/O list](#97-bảng-tag-và-hợp-nhất-với-io-list)
  - [9.8 Compatibility Report](#98-compatibility-report)
  - [9.9 M1 tích hợp](#99-m1-tích-hợp)
- [10. Conformance và thí nghiệm VERIFY](#10-conformance-và-thí-nghiệm-verify)
  - [10.1 Mục tiêu](#101-mục-tiêu)
  - [10.2 Thí nghiệm](#102-thí-nghiệm)
  - [10.3 Harness (`vcs conformance run`)](#103-harness-vcs-conformance-run)
  - [10.4 Nghiệm thu một phần](#104-nghiệm-thu-một-phần)
- [11. CLI và UI](#11-cli-và-ui)
  - [11.1 CLI](#111-cli)
  - [11.2 UI (trang Communications mở rộng + trang PLC)](#112-ui-trang-communications-mở-rộng-trang-plc)
- [12. Bảo mật, giấy phép, pháp lý](#12-bảo-mật-giấy-phép-pháp-lý)
- [13. Chiến lược test (phân tầng theo hạ tầng)](#13-chiến-lược-test-phân-tầng-theo-hạ-tầng)
  - [13.1 Số lượng tối thiểu (T1/T2)](#131-số-lượng-tối-thiểu-t1t2)
  - [13.2 Fixture SimaticML](#132-fixture-simaticml)
  - [13.3 Live (T3) — danh mục nghiệm thu thủ công/tự quản](#133-live-t3-danh-mục-nghiệm-thu-thủ-côngtự-quản)
- [14. Hiệu năng (mục tiêu; đo ở T1 bằng fake agent và T3 bằng PLCSIM thật)](#14-hiệu-năng-mục-tiêu-đo-ở-t1-bằng-fake-agent-và-t3-bằng-plcsim-thật)
- [15. Mã chẩn đoán](#15-mã-chẩn-đoán)
- [16. Kế hoạch triển khai và prompt cho AI](#16-kế-hoạch-triển-khai-và-prompt-cho-ai)
  - [Prompt mẫu](#prompt-mẫu)
- [17. Tiêu chí nghiệm thu M5](#17-tiêu-chí-nghiệm-thu-m5)
- [18. Quyết định mặc định (để AI không dừng hỏi)](#18-quyết-định-mặc-định-để-ai-không-dừng-hỏi)
- [19. Việc của chủ sản phẩm (song song — quyết định thành bại của M5)](#19-việc-của-chủ-sản-phẩm-song-song-quyết-định-thành-bại-của-m5)
- [Phụ lục A — VBP/1 (tóm tắt thông điệp)](#phụ-lục-a-vbp1-tóm-tắt-thông-điệp)
- [Phụ lục B — Tham chiếu nhanh S7comm cổ điển (**xác minh bằng Snap7 docs/Wireshark**, `VERIFY`)](#phụ-lục-b-tham-chiếu-nhanh-s7comm-cổ-điển-xác-minh-bằng-snap7-docswireshark-verify)
- [Phụ lục C — Phần tử SimaticML thường gặp (**định hướng, không phải đặc tả**; bắt buộc đối chiếu XSD + mẫu thật)](#phụ-lục-c-phần-tử-simaticml-thường-gặp-định-hướng-không-phải-đặc-tả-bắt-buộc-đối-chiếu-xsd-mẫu-thật)

> Thuộc dự án VCS (xem `PRD.md`: M5, FR-107, FR-605, FR-606, mục 3.2 "kiến trúc hai chế độ"; M0 §6; M1 §14, §16; M3 §6; M4 §8–9).
> Phiên bản: 0.1 (2026-11-21). Thời lượng dự kiến: **4–6 tuần công**. Điều kiện đầu vào: M0–M4 đạt nghiệm thu.
> Quy ước như các spec trước. **Lưu ý đặc biệt của M5:** phần lớn rủi ro nằm ở **sự thật về sản phẩm Siemens** (API PLCSIM Advanced, TIA Openness, SimaticML, giao thức S7). Spec này dựa trên tài liệu công khai đã tra cứu (mục 3) nhưng **AI không được viết parser/adapter từ trí nhớ**: phải bám tài liệu Siemens, XSD của Openness, tài liệu Snap7 và **file mẫu thật do chủ sản phẩm cung cấp** (mục 19). Chỗ chưa chắc gắn `VERIFY`.

**Mục đích của M5:** chạy **chương trình PLC thật do TIA Portal biên dịch** trong vòng lặp mô phỏng của VCS. Đây là phần biến VCS từ "soft-PLC gần đúng" (Chế độ A) thành công cụ **virtual commissioning thực thụ** (Chế độ B, PRD mục 3.2).

---

## 1. Mục tiêu, phạm vi, topologies

### 1.1 Trong phạm vi (P0)
| Nhóm | Nội dung | FR |
|---|---|---|
| Bridge Agent | Tiến trình Windows (.NET) điều khiển **PLCSIM Advanced** qua API; giao thức TCP riêng (VBP/1) tới VCS server; có backend giả để test | FR-605 |
| Adapter PLCSIM | `external:plcsim-advanced` với **3 chế độ đồng bộ thời gian**: `realtime`, `scaled`, **`lockstep`** (tất định, nhanh hơn thời gian thực) | FR-605, 608 |
| S7 classic | Codec S7comm tự cài + **client adapter** `external:s7` (S7-300/400, S7-1200/1500 PUT/GET, PLCSIM) + **server gateway** (SCADA/OPC server dùng S7 classic đọc/ghi VCS) + công cụ `vcs s7 probe` | FR-606 |
| TIA Export | Công cụ Windows (.NET) dùng **TIA Openness** xuất block/UDT/tag table/nguồn SCL + `manifest.json` | FR-107 |
| Importer SimaticML | Nhập XML/nguồn từ TIA → `tags.yaml`, cấu trúc DB/UDT, logic (SCL, LAD, FBD) chạy được trên SoftPlc; **Compatibility Report** | FR-107 |
| Conformance | Bộ thí nghiệm đối chiếu SoftPlc ↔ PLCSIM, đóng vòng `VERIFY` của M1 | M1 §14 |

### 1.2 P1 / P2 (không nghiệm thu)
P1: Timespan-synchronized mode (nếu API cho phép khe thời gian cố định, mục 6.4), tải chương trình xuống PLCSIM bằng Openness (`DownloadProvider`), nhập định dạng tài liệu `.s7dcl` của TIA V21, nhập SCL/DB/UDT dạng nguồn nâng cao, S7 server hỗ trợ SZL nâng cao, TLS cho Bridge. P2: S7CommPlus (không dùng Snap7), PLCSIM V21 (bản "standard"), Rockwell/ABB (M6+), STL/GRAPH.

### 1.3 Ngoài phạm vi
Mô phỏng F-safety, bypass bảo vệ know-how, S7CommPlus mã hóa, tải firmware, chạy trên Linux (Bridge Agent và TIA Export **chỉ Windows**; VCS server có thể ở máy khác).

### 1.4 Ba topology (quan trọng khi nối SCADA)
| Topology | Controller | Plant | SCADA nối vào đâu |
|---|---|---|---|
| **A** (M4) | SoftPlc nội bộ | VCS | VCS OPC UA/Modbus/S7 server |
| **B1** (M5) | **PLCSIM Advanced** | VCS qua **Bridge API** | **Trực tiếp PLCSIM Advanced** (OPC UA/S7 gốc qua adapter mạng ảo của PLCSIM) |
| **B2** (M4+M5) | PLC thật | VCS qua OPC UA/Modbus/S7 client | Trực tiếp PLC thật |
Với B1/B2, SCADA nói chuyện với **PLC thật/PLCSIM bằng giao thức gốc** (kể cả S7CommPlus/optimized DB) — VCS chỉ đóng vai **plant**. Server OPC UA/Modbus/S7 của VCS chủ yếu cho topology A.

---

## 2. Đối chiếu và điều chỉnh so với M0–M4

| # | Chủ đề | Quyết định của M5 |
|---|---|---|
| 1 | Adapter bất đồng bộ | M0 §6.6: thêm `readonly asyncStep?: boolean` vào `ControllerAdapter`; orchestrator thêm `requiresAsync(): boolean`; `SimulationService` dùng `stepOnceAsync()` khi có component bất đồng bộ (lockstep) |
| 2 | Địa chỉ tag | M0 §4.5: `address` cho phép dạng **`sym:<đường dẫn symbolic>`** (ví dụ `sym:"DB_Motor"."M01"."Start"`) cho biến DB **optimized** (không có offset tuyệt đối). `TagAddressMap` (M1) hiểu `sym:` |
| 3 | M1 `compileProject` | Nhận thêm: `plc/import/**/*.xml` (SimaticML), `*.scl`/`*.db`/`*.udt` sinh bởi "Generate source" của TIA. Front-end SimaticML ở `vendor-siemens/src/simaticml/` |
| 4 | M3 runner | `TestRunner` hỗ trợ orchestrator **bất đồng bộ** (`runStepsAsync`). `TS-E040` chỉ áp dụng cho adapter ngoài **không tất định** (`deterministic: false`: realtime/scaled); `lockstep` được phép. Adapter khai báo `capabilities.snapshot`; PLCSIM **không** hỗ trợ snapshot → `isolation: baseline` tự rơi về `reset` + cảnh báo thời gian (mục 6.8) |
| 5 | M4 §9 "khóa 1×" | Thay bằng **khả năng khai báo**: adapter ngoài khai `timeScale: { min, max, locked }`; `external:plcsim-advanced` ở `scaled/lockstep` không khóa; `sim.state.locked` chỉ đúng khi dải không đủ |
| 6 | M4 `ControllerIntrospection` cho controller ngoài | Adapter ngoài cài introspection **dựa trên cache + `watch(refs)`** (đọc trả giá trị cache, ghi xếp hàng); `TagBroker` M4 dùng được cho tag `M/DB` của PLCSIM/S7 |
| 7 | M4 gateway | Thêm `s7Servers` vào `comms.yaml` (mục 7.6); `GatewayManager` đăng ký `s7-server` |
| 8 | Thư mục | Thêm `tools/` (mã .NET) **ngoài** workspace pnpm; CI job Windows riêng |
| 9 | Đồ thị phụ thuộc | Không đổi package TS: S7 trong `comms`, tia-importer trong `vendor-siemens/src/tia`, bridge-client trong `comms/src/plcsim` |
| 10 | M1 §14 `VERIFY` | M5 mục 10 cung cấp harness + 14 thí nghiệm để đóng vòng; kết quả cập nhật `docs/semantics.md` và `expectedFrom: plcsim` |

---

## 3. Sự thật kỹ thuật đã tra cứu (đầu 11/2026) và giới hạn

Các điểm sau lấy từ tài liệu/ trang công khai của Siemens và cộng đồng; **phải xác minh lại với bản cài thật trước khi cam kết** (đánh dấu `VERIFY` ở các mục tương ứng).

| Chủ đề | Điều đã biết |
|---|---|
| Phiên bản | TIA Portal **V21** (đã có Update 3, 10/2026) và **S7-PLCSIM Advanced V8.0 (Update 1)**; V8 hỗ trợ dự án TIA **V14–V21**, firmware CPU **V1.8–V4.1**, hỗ trợ API **V3.0–V8.0**, **S7-1200 G2**; kết nối Runtime Manager **được mã hóa** từ V8. Có thêm **S7-PLCSIM V21 (standard)** — không phải sản phẩm có API co-simulation |
| API | PLCSIM Advanced có API **.NET và C++**; `ISimulationRuntimeManager`, `IInstance` (PowerOn/Off, Run/Stop, `UpdateTagList`, đọc/ghi theo tên tag hoặc theo vùng `EArea`, `InputArea`/`OutputArea`). Các worker .NET đã công bố của bên thứ ba dùng **.NET Framework 4.8**; API **không tương thích giữa các phiên bản chính** → phải build theo phiên bản API (V6/V7/V8). DLL API nằm ở thư mục cài đặt (`...\PLCSIMADV\API\<ver>\`) và **không được phân phối lại** |
| Thời gian ảo | `OperatingMode` (Default và nhóm **SingleStep**: C, CT, P, CP, CPT, "Timespan synchronized CP"), `RunToNextSyncPoint()`, sự kiện `OnSyncPointReached`, `ScaleFactor` (0…1000, thời gian ảo nhanh/chậm so với thời gian thật), `OverwrittenMinimalCycleTime_ns`, `GetSystemTime()` (thời gian ảo). Thay đổi có hiệu lực ở **cycle control point** |
| Quyền Windows | Người dùng phải thuộc nhóm **`Siemens TIA Openness`** (Openness) và **`PlcSimUsers`** (PLCSIM) |
| Openness | Xuất block bằng `PlcBlock.Export(FileInfo, ExportOptions)` ra **SimaticML XML**; **không xuất được khi TIA đang online**; block **know-how protected** không xuất được; XML nhập/xuất khác nhau giữa phiên bản TIA (có token chỉ V21); có đường nhập riêng cho XML, nguồn SCL (`ExternalSources` + `GenerateBlocksFromSource`) và (V21) tài liệu `.s7dcl` |
| S7 classic (Snap7) | Với S7-1200/1500 chỉ chạy khi bật **PUT/GET**, chỉ truy cập **DB không-optimized** và vùng I/Q/M/T/C; **không** S7CommPlus; PUT/GET không xác thực. Một số firmware mới (S7-1500 ≥ V3.1, S7-1200 ≥ V4.7) có thêm ràng buộc bảo mật khi bật PUT/GET (`VERIFY`) |
| Mạng PLCSIM | Giao tiếp TCP/IP qua **"Siemens PLCSIM Virtual Ethernet Adapter"**, có chế độ một adapter (promiscuous) và nhiều adapter (non-promiscuous); cấu hình địa chỉ IP/mạng ảnh hưởng tới việc client S7/OPC UA từ cùng máy nối được hay không (`VERIFY`) |
| Giấy phép | PLCSIM Advanced tính theo giấy phép/instance (các đời cũ: 1 giấy phép = 2 instance); `VERIFY` với V8 |

**Hệ quả thiết kế:** (1) Bridge Agent build theo phiên bản API; (2) **I/O bằng vùng byte** (`InputArea.WriteBytes` / `OutputArea.ReadBytes`) cho tag I/Q (rất nhanh), còn tag M/DB đọc/ghi **theo tên symbolic** (hỗ trợ cả DB optimized — ưu thế so với Snap7); (3) lockstep dùng SingleStep + `RunToNextSyncPoint()`; (4) importer là **một công cụ riêng** vì PLCSIM chạy chương trình thật, importer chủ yếu cần để lấy **symbol/tag/địa chỉ** và (tùy chọn) chạy cùng logic trên SoftPlc.

---

## 4. Kiến trúc và cấu trúc repo

```
 VCS server (Node, Windows/Linux)                          Máy Windows có PLCSIM Advanced
┌─────────────────────────────────────────┐   VBP/1 (TCP)  ┌──────────────────────────────────────────┐
│ Orchestrator: plant → controllers        │◄──────────────►│ vcs-bridge-agent (net48, x64)             │
│   PlcsimAdapter (external:plcsim-advanced)│                │   Core (giao thức, hàng đợi, an toàn)     │
│   S7Adapter     (external:s7) ───────────┼── S7 (ISO-TCP) ─► PLC thật / PLCSIM (PUT/GET)              │
│ Gateways: s7-server ◄── Kepware/Ignition  │                │   Backend PlcSim.V6/V7/V8 (Siemens API)   │
└─────────────────────────────────────────┘                │   Backend Fake (không cần Siemens)        │
                                                            └──────────────┬───────────────────────────┘
                                                                           ▼ PLCSIM Advanced Runtime
 vcs-tia-export (net48) ──► TIA Portal (Openness) ──► export/ (XML, .scl, manifest.json) ──► vcs tia import
```
```
tools/                                  # .NET, ngoài workspace pnpm
  bridge-agent/
    VCS.Bridge.Core/                    # giao thức VBP/1, luồng, hàng đợi lệnh, IBackend
    VCS.Bridge.Agent/                   # exe: cấu hình, chọn backend, token
    VCS.Bridge.PlcSim/                  # IBackend cài bằng Siemens API; build theo PlcSimApiVersion=6|7|8
    VCS.Bridge.Fake/                    # backend giả (bộ nhớ + logic kịch bản) cho test
    VCS.Bridge.Tests/                   # xUnit
  tia-export/
    VCS.TiaExport/                      # build theo TiaVersion=17|18|19|20|21
    VCS.TiaExport.Tests/
  Directory.Build.props                 # đọc PLCSIM_API_DIR, TIA_PUBLICAPI_DIR từ biến môi trường (không commit DLL)
packages/comms/src/
  plcsim/ {bridge-client.ts, vbp.ts, adapter.ts, io-image.ts, introspection.ts}
  s7/     {codec.ts, client.ts, server.ts, adapter.ts, areas.ts, probe.ts}
packages/comms/test/fixtures/fake-bridge-agent.ts   # agent giả bằng TS (dùng SoftPlc của M1) — chạy trên Linux CI
packages/vendor-siemens/src/
  tia/ {manifest.ts, tag-tables.ts, udt.ts, db-layout.ts, report.ts, import.ts, merge.ts}
  simaticml/ {xml.ts, interface.ts, structured-text.ts, flgnet.ts, lower.ts, instructions.ts}
apps/cli/src/commands/{bridge.ts, s7.ts, tia.ts, conformance.ts}
docs/{plcsim-setup.md, tia-export.md, verify-experiments.md, compat-matrix.md}
```
Quy tắc: DLL Siemens (`Siemens.Simatic.Simulation.Runtime.Api.*.dll`, `Siemens.Engineering*.dll`) **không** nằm trong repo; `Directory.Build.props` trỏ tới thư mục cài đặt; thiếu → dự án .NET tương ứng **bỏ qua** (backend Fake vẫn build).

---

## 5. Bridge Agent

### 5.1 Trách nhiệm
Điều khiển PLCSIM Advanced trên máy Windows và phơi bày một giao diện **đơn giản, tuần tự, an toàn** cho VCS: quản lý instance, chế độ chạy/thời gian, I/O vùng byte theo lô, đọc/ghi symbolic, bước lockstep, sự kiện trạng thái. **Không** tải chương trình (TIA Portal làm việc đó; P1 có thể tự động hóa).

### 5.2 Luồng và an toàn thread
- Một **luồng API chuyên trách** (STA/MTA theo yêu cầu API; `VERIFY`) thực thi **mọi lời gọi Siemens** từ hàng đợi lệnh (không gọi API song song). Luồng mạng chỉ đưa lệnh vào hàng đợi và nhận kết quả.
- Mỗi lệnh có `timeoutMs`; quá hạn → lỗi `BRG-E010`, instance **không** bị tắt tự động.
- `SimulationRuntimeException` → ánh xạ mã lỗi giao thức (bảng 5.6) kèm `runtimeErrorCode` gốc (ví dụ `SREC_TIMEOUT`, `SREC_INSTANCE_NOT_RUNNING`, `SREC_DOES_NOT_EXIST`, `SREC_TYPE_MISMATCH`, `SREC_NOT_UP_TO_DATE`).

### 5.3 Giao thức VBP/1 (TCP, nhị phân có khung)
Khung: `u32 length (big-endian, không gồm 4 byte này) | u8 type | u32 requestId | u8 flags | payload`.
- `type`: `0x01` request JSON, `0x02` response JSON, `0x03` event JSON, `0x10` **IO exchange** (nhị phân), `0x11` **step** (nhị phân), `0x7F` ping/pong.
- JSON UTF-8 cho điều khiển; **nhị phân** cho đường nóng (I/O mỗi bước).
- Bắt tay: client gửi `hello { protocol: 1, clientId, auth: hmac }`; agent trả `welcome { protocol, agentVersion, backend: 'plcsim'|'fake', plcsimRuntimeVersion?, apiVersion?, instances[] }`. **Xác thực**: bắt buộc khi bind ngoài `127.0.0.1`: thách thức-đáp ứng HMAC-SHA256 với bí mật chia sẻ (`tokenEnv`); loopback cho phép không token (cảnh báo).
- Giới hạn: kích thước khung ≤ 4 MB; tối đa 4 client; khung sai → đóng kết nối + `BRG-E001`.
- Chi tiết thông điệp: Phụ lục A. Phiên bản giao thức đàm phán ở `hello`; khác → từ chối `BRG-E002`.

### 5.4 Lệnh chính (tóm tắt; đầy đủ ở Phụ lục A)
| Nhóm | Lệnh |
|---|---|
| Quản lý | `manager.info`, `instances.list`, `instance.create {name, cpuType?, ip?}`, `instance.adopt {name}`, `instance.destroy`, `instance.powerOn/off`, `instance.run/stop`, `instance.state`, `instance.reset` |
| Mạng | `instance.setIp {adapterIndex, ip, mask, gateway}`, `instance.netInfo` |
| Thời gian | `time.setMode {mode: default\|singleStepC\|singleStepCT\|singleStepCP\|...}`, `time.setScale {factor}`, `time.setMinCycle {ns}`, `time.getSystemTime` |
| Tag | `tags.update`, `tags.list {filter?}`, `tags.read {names[]}`, `tags.write {items[]}` |
| Vùng | `io.layout {inputBytes, outputBytes}` (khai báo kích thước ảnh), `io.exchange` (nhị phân), `mem.read/write {area, offset, count}` (M, DB nếu có) |
| Bước | `step.run {writes, reads, cycles}` (lockstep), `step.freeze/resume` |
| Chẩn đoán | `diag.log {level, n}`, `diag.stats` |
| Sự kiện | `event.stateChanged`, `event.syncPoint`, `event.tagListUpdated`, `event.error` |

### 5.5 Backend
```csharp
interface IBackend {
  ManagerInfo GetInfo();
  IReadOnlyList<InstanceInfo> ListInstances();
  IInstanceHandle Create(string name, CpuType? cpu, ...);  IInstanceHandle Adopt(string name);
  // IInstanceHandle: PowerOn/Off, Run/Stop, State, SetOperatingMode, ScaleFactor, MinCycle, SystemTime,
  //   UpdateTagList, ListTags, ReadTags/WriteTags, InputArea.WriteBytes/OutputArea.ReadBytes, ReadBytes/WriteBytes(area..),
  //   RunToNextSyncPoint(timeout), events
}
```
- **`PlcSim` backend:** cài đặt bằng API Siemens. **Tên cụ thể của phương thức bulk-I/O (`InputArea`/`OutputArea` `WriteBytes/ReadBytes` hay `ReadBytes(EArea...)`) phải xác minh theo manual API V6/V7/V8** (`VERIFY`); nếu API không có đọc/ghi lô theo vùng, rơi về đọc/ghi từng tag theo tên và ghi nhận hiệu năng (mục 14).
- **Build theo phiên bản:** `PlcSimApiVersion ∈ {6,7,8}` (MSBuild) → ba file thực thi (`vcs-bridge-agent-v6/v7/v8.exe`); launcher chọn theo phiên bản runtime đã cài (đọc registry/thư mục `API\`); không có phiên bản phù hợp → `BRG-E020` kèm hướng dẫn.
- **`Fake` backend:** bộ nhớ vùng I/Q/M + tag symbolic + **kịch bản logic cấu hình bằng JSON** (ví dụ cổng và timer đơn giản); có chế độ lockstep giả (mỗi `step.run` chạy N chu kỳ). Dùng cho test giao thức/adapter trên mọi CI; **không** mô phỏng ngữ nghĩa PLC.
- Instance **do VCS tạo** (`create`) được hủy khi agent thoát nếu `destroyOnExit: true` (mặc định `false`); instance **adopt** (do TIA/Control Panel tạo) không bao giờ bị hủy bởi agent.

### 5.6 Ánh xạ lỗi
| Tình huống | Mã VBP | Ghi chú |
|---|---|---|
| Hết thời gian | `BRG-E010` | |
| Instance chưa chạy/không tồn tại | `BRG-E011` / `BRG-E012` | gợi ý: nạp chương trình từ TIA, `PowerOn`, `Run` |
| Tag không tồn tại / sai kiểu / danh sách tag cũ | `BRG-E013` / `BRG-E014` / `BRG-E015` | `tags.update` rồi thử lại 1 lần |
| Giấy phép/instance vượt hạn mức | `BRG-E021` | hiển thị nguyên văn lỗi runtime |
| API không tương thích với runtime | `BRG-E020` | chọn đúng bản agent |
| Quyền Windows (nhóm `PlcSimUsers`) | `BRG-E022` | |

### 5.7 Cấu hình agent (`bridge-agent.json`)
```json
{ "listen": "127.0.0.1:4850", "tokenEnv": "VCS_BRIDGE_TOKEN", "backend": "plcsim",
  "plcsim": { "apiVersion": "auto", "commandTimeoutMs": 5000 },
  "instances": { "destroyOnExit": false },
  "log": { "level": "info", "file": "logs/bridge.log" } }
```
Chạy như ứng dụng console hoặc dịch vụ Windows (P1). Log không chứa token.

---

## 6. Adapter `external:plcsim-advanced`

### 6.1 Cấu hình (`vcs.project.yaml`)
```yaml
controllers:
  - id: PLC1
    mode: external
    adapter: plcsim-advanced
    endpoint: tcp://127.0.0.1:4850          # địa chỉ Bridge Agent
    config:
      tokenEnv: VCS_BRIDGE_TOKEN
      instance: { name: VCS_PLC1, mode: adopt, powerOn: true, run: true }   # adopt | create(+cpuType, ip)
      sync: lockstep                        # realtime | scaled | lockstep
      lockstep: { operatingMode: singleStepCT, cyclesPerStep: auto }   # auto = plcScanMs/stepMs
      scaled: { maxFactor: 20 }
      io: { inputBytes: 1024, outputBytes: 1024, transfer: area }      # area | tags
      symbolic: { enabled: true, watchMax: 2000 }                       # tag M/DB
      onDisconnect: hold
      timeouts: { connectMs: 5000, commandMs: 5000, stepMs: 2000 }
      conformance: { recordStateEveryStep: false }
```

### 6.2 Ý nghĩa tag
Như M0/M4 §9: tag `area I` = **plant → PLC**; `area Q` = **PLC → plant**. Với PLCSIM Advanced, tag I/Q có địa chỉ tuyệt đối (`%I0.0`, `%QW64`) nên **ghi/đọc theo vùng byte** là tự nhiên (giống I/O vật lý, qua `InputArea`/`OutputArea`). Tag `M/DB` (kể cả `sym:`) qua **symbolic** (`tags.read/write`), cần `tags.update` sau mỗi lần tải chương trình mới.

### 6.3 Ảnh I/O và mã hóa
- Adapter dựng **ảnh byte** (big-endian S7): `inputImage[0..inputBytes)` từ tag `I`, `outputImage` từ tag `Q`. Mã hóa/giải mã dùng **cùng bảng M1** (`memory.ts`): `Bool` = bit, `Byte`, `Word/Int` 2 byte BE, `DWord/DInt/Real` 4 byte BE, `LReal` 8 byte BE.
- Chỉ ghi **đoạn byte thay đổi** (diff theo `lastSent`) khi `transfer: area`; gom thành ít `io.exchange` nhất (một vòng cho cả ghi input và đọc output).
- Tag `Q` vượt `outputBytes`/tag `I` vượt `inputBytes` → lỗi cấu hình `PSA-E003` lúc `init`.
- **Quyền ghi:** địa chỉ ảnh input/output trong PLCSIM chịu **quy tắc process image của CPU**; xác minh thực nghiệm rằng ghi `InputArea` được CPU lấy ở đầu chu kỳ và `OutputArea` phản ánh PIQ cuối chu kỳ (`VERIFY`, thí nghiệm E10 ở mục 10).

### 6.4 Chế độ đồng bộ thời gian

**(a) `realtime`** — PLCSIM chạy chế độ Default, `ScaleFactor = 1`. Adapter dùng khung chung M4 §9 (vòng nền poll/ghi theo cache; `step()` đồng bộ). `timeScale` khóa 1×. Không tất định.

**(b) `scaled`** — `ScaleFactor = timeScale` của VCS (≤ `scaled.maxFactor`): thời gian ảo của PLC chạy nhanh/chậm cùng tốc độ với đồng hồ mô phỏng, nhờ đó timer trong PLC khớp thời gian mô phỏng. Khi người dùng đổi `timeScale`, adapter gọi `time.setScale` (có hiệu lực ở cycle control point). Không tất định; độ lệch pha có thể lớn khi `scale` cao. Cảnh báo `PSA-W030` nếu `|virtualTime − simTime|` vượt ngưỡng (mặc định 200 ms).

**(c) `lockstep` (khuyến nghị cho test/FAT tự động)** — VCS **điều khiển** thời gian của PLCSIM:
1. Đặt `OperatingMode = SingleStep_CT` (cycle control point; chu kỳ tối thiểu ghi đè) và `OverwrittenMinimalCycleTime_ns = plcScanMs × 1 000 000`.
2. Mỗi `plcScanMs` (bội của `stepMs`), trong `step(T, dt)`: gói ảnh input từ TagDB → gửi `step.run { inputDiff, cycles: 1, readOutputs: true }` → agent: ghi input, `RunToNextSyncPoint()`, đọc output → trả `{ outputImage, virtualTimeNs, cycleOverrun? }` → adapter ghi output vào TagDB (`source 'plc'`).
3. Giữa các scan, `step()` không làm gì (giữ output).
4. **Tính chất:** không phụ thuộc đồng hồ thật → chạy **nhanh hơn thời gian thực** và (với cùng chương trình, cùng input theo chu kỳ) **lặp lại được**; tốc độ bị giới hạn bởi RTT + thời gian một chu kỳ (mục tiêu mục 14).
5. **Phát hiện trôi thời gian:** `virtualTimeNs` thực tế tăng `Δv` mỗi chu kỳ; nếu `Δv > plcScanMs` (chương trình nặng hơn chu kỳ ghi đè) → `PSA-W031` kèm thống kê; adapter **không** tự bù (báo cáo FAT ghi giá trị trôi).
6. `VERIFY`: (i) hành vi `RunToNextSyncPoint` với OB chu kỳ (OB30–38) và với interrupts, (ii) quan hệ giữa thời gian ảo và chu kỳ khi `SingleStep_CT`, (iii) chế độ **"Timespan synchronized CP"** có cho phép tiến một **khoảng thời gian cố định** (hợp với `stepMs` hơn) — nếu có, đây là phương án thay thế P1 cho `cyclesPerStep`.

**Hệ quả với orchestrator:** `PlcsimAdapter.asyncStep = true` ở `lockstep`; `SimulationService`/CLI/M3 dùng `stepOnceAsync`. Thứ tự một bước giữ nguyên M0 §6.7 (plant chạy trước controller; output PLC có hiệu lực ở bước T+dt).

### 6.5 Introspection (M/DB) bằng cache
- `ControllerIntrospection` được cài với **cache**: `read(ref)` trả giá trị cache (kèm tuổi); lần đầu đọc một `ref` → thêm vào **watch set** (tối đa `watchMax`); vòng nền (hoặc, ở lockstep, **cùng `step.run`**) đọc watch set theo lô bằng `tags.read` và cập nhật cache. `write(ref, v)` xếp hàng → gửi ở lần trao đổi kế tiếp (lockstep: trước `RunToNextSyncPoint`).
- Tên symbolic: chuẩn hóa từ tag (`"DB_Motor"."M01"."Start"` ⇄ chuỗi tag của API; chấp nhận cả dạng có/không có dấu nháy — `VERIFY` định dạng đúng theo `tags.list`).
- `force/unforce`: **không hỗ trợ** qua API (trả `UNSUPPORTED`); dùng bảng force của TIA nếu cần.
- `start()/stop()` (RUN/STOP CPU) → `instance.run/stop`.

### 6.6 Vòng đời
`init`: kết nối agent → `instance.adopt/create` → (tùy) `powerOn` → chờ `run` (timeout) → `tags.update` → xác minh ánh xạ: mọi tag `I/Q` nằm trong ảnh; mọi `M/DB` tag tồn tại trong tag list (không có → `PSA-W010`, tag `quality 'bad'`); chọn chế độ thời gian. Mất kết nối agent: `DISCONNECTED`, `onDisconnect: hold|zero`, thử lại có backoff; sau khi nối lại: chạy lại `init` nhẹ (kiểm tra instance/trạng thái, `tags.update`) và đồng bộ lại toàn bộ input.
`getDiagnostics()`: `state` (`RUN/STOP/DISCONNECTED/FAULT`), `info`: `plcsimVersion`, `apiVersion`, `operatingMode`, `scaleFactor`, `virtualTimeMs`, `driftMs`, `cycleCount`, `rttMsAvg/Max`, `watchSize`, `missingTags`.

### 6.7 Điều khiển CPU từ VCS
UI/CLI: Run/Stop CPU, Power cycle, `Reset` instance (mục 6.8). **Tải chương trình mới** do TIA Portal thực hiện; khi phát hiện `event.tagListUpdated` hoặc trạng thái đổi (Stop→Run sau download), adapter gọi `tags.update`, xác minh lại ánh xạ và thông báo `PSA-I010`.

### 6.8 Snapshot và cô lập test (M3)
- `capabilities`: `{ snapshot: false, deterministic: sync === 'lockstep', timeScale: realtime:{1,1} | scaled:{0.1..maxFactor} | lockstep:{0.1..max} }`.
- `snapshot()/restore()` chỉ giữ trạng thái phía VCS (`lastSent`, bộ đếm); **trạng thái PLC không khôi phục** → `snapshotAll` trả cảnh báo và M3 `isolation: baseline` tự chuyển `reset`.
- **`reset`**: `instance.reset` của agent = Stop → (tùy chọn `PowerOff`→`PowerOn`) → Run → chờ ổn định; **thời gian thực tế phải đo** (`VERIFY`, dự kiến vài giây đến chục giây). Với suite lớn M3 ghi cảnh báo thời gian; có tùy chọn `isolation: none` + test viết để tự dọn trạng thái.
- M3 `meta` báo cáo FAT ghi: phiên bản PLCSIM/API, chế độ đồng bộ, `driftMs`, firmware/CPU của instance.

---

## 7. S7 classic: codec, client adapter, server, probe

### 7.1 Phạm vi giao thức
**S7comm cổ điển** trên ISO-on-TCP (RFC1006, cổng 102): TPKT + COTP + S7 PDU. Chức năng: **Setup communication**, **Read Var**, **Write Var** cho vùng `I (0x81)`, `Q (0x82)`, `M (0x83)`, `DB (0x84)` (+ `T/C` P1), và tối thiểu thông tin CPU (SZL 0x0011/0x001C, đọc trạng thái) để `probe` và để client như Snap7 `GetCpuInfo` không lỗi. **Không** hỗ trợ: S7CommPlus, truy cập symbolic/optimized DB, upload/download block, PI service, userdata ngoài SZL.
Codec **tự cài** (thuần, không mạng) như codec Modbus ở M4; **bắt buộc kiểm tương thích** bằng thư viện độc lập (`python-snap7`, `nodes7` — chỉ dependency của test) và bắt gói tham chiếu (Wireshark) do chủ sản phẩm cung cấp (mục 19).

### 7.2 Codec (`s7/codec.ts`) — tham chiếu nhanh ở Phụ lục B
- TPKT `03 00 len16`; COTP: Connection Request/Confirm (TSAP, PDU size), Data TPDU `02 F0 80`.
- S7 header: `32 | ROSCTR (1 Job, 2 Ack, 3 AckData) | 0000 | pduRef | paramLen | dataLen | [errClass errCode khi Ack]`.
- Hàm: `F0` setup communication (đàm phán `maxAmq`, `pduLength`), `04` Read Var, `05` Write Var; item `12 0A 10 | transportSize | length | dbNumber | area | address(3B, đơn vị bit)`.
- Mã trả về mục dữ liệu: `0xFF` thành công, `0x0A` đối tượng không tồn tại, `0x05` địa chỉ không hợp lệ, `0x03` truy cập bị từ chối, `0x06` kiểu không hỗ trợ.
- API thuần: `buildConnectRequest/parseConfirm`, `buildSetupComm/parse`, `buildReadVar(items)/parseReadResponse`, `buildWriteVar(items)/parseWriteResponse`, bộ tách khung `S7FrameParser` (xử lý chia/gộp gói TCP), `splitItems(requests, pduSize)` (chia theo `pduLength` đã đàm phán và giới hạn số item/PDU).
- Kích thước PDU: mặc định 240; chấp nhận tới 960 nếu CPU cho; số item tối đa/PDU: giá trị an toàn 20 (`VERIFY` theo CPU).

### 7.3 Client adapter `external:s7`
```yaml
controllers:
  - id: PLC3
    mode: external
    adapter: s7
    endpoint: tcp://192.168.0.30:102
    config:
      rack: 0
      slot: 1                       # S7-1200/1500: 1; S7-300/400: 2 (hoặc theo cấu hình)
      pollMs: 20
      writeMs: 10
      pduSize: 480
      mapping: comms/plc3-s7-map.yaml     # tùy chọn: [{ tag, area, db, byte, bit }]
      writeInputsTo: image          # image (ghi vùng I) | db:<n> (ghi vào DB giao diện mô phỏng, theo mapping)
      onDisconnect: hold
```
- Tag có **địa chỉ tuyệt đối** → ánh xạ tự động (`%I0.0` → area I; `DB5.DBW6` → DB 5 byte 6). Tag `sym:` (optimized) **không** đọc/ghi được → `S7-E010` + hướng dẫn tắt "Optimized block access" hoặc dùng `external:plcsim-advanced`/OPC UA.
- **Ghi vào vùng I trên PLC thật**: CPU ghi đè ảnh input bằng I/O vật lý mỗi chu kỳ → với PLC thật dùng `writeInputsTo: db:<n>` (DB giao diện mô phỏng trong chương trình PLC, ánh xạ trong `mapping`) hoặc phần cứng giả lập I/O; cảnh báo `S7-W020` nếu cấu hình ghi vùng I trên CPU không phải PLCSIM. (Ghi `I` có hiệu lực/ không trên PLCSIM qua S7: `VERIFY`.)
- Gom khối đọc theo vùng/DB liền kề; ghi chỉ khi đổi; lỗi `function refused by CPU`/`0x81 0x04` → `S7-E011` kèm checklist: bật PUT/GET (Properties → Protection & Security → Connection mechanisms), tắt Optimized block access cho từng DB, biên dịch & tải lại (việc đổi thuộc tính DB **khởi tạo lại DB**), kiểm tra mức bảo vệ, firmware mới có thể yêu cầu thêm thiết lập (`VERIFY`).
- Khung chung adapter ngoài của M4 §9 (cache + vòng nền, `quality 'bad'` khi mất kết nối, khóa 1×, `deterministic: false`).

### 7.4 `vcs s7 probe`
`vcs s7 probe <host> [--rack 0 --slot 1] [--db 1 --offset 0 --len 4]`: kết nối, in thông tin CPU (nếu có), thử đọc DB/M/I/Q mẫu, kiểm tra PDU đàm phán, và **chẩn đoán có hướng dẫn** (PUT/GET chưa bật, DB optimized, rack/slot sai, firewall/mạng). Mã thoát: 0 ok, 2 lỗi, 3 tham số.

### 7.5 Cache/Introspection
Như mục 6.5 nhưng đọc theo lô `ReadVar` trên watch set; `write` xếp hàng. Tag `sym:` → `UNSUPPORTED`.

### 7.6 Server gateway `s7-server` (SCADA/OPC server dùng S7 classic đọc/ghi VCS)
```yaml
s7Servers:
  - id: s7-plc1
    controller: PLC1
    enabled: true
    host: 127.0.0.1
    port: 102                       # cổng chuẩn; cảnh báo nếu cần quyền cao
    rackSlot: [[0, 1], [0, 2]]      # TSAP chấp nhận
    unmapped: store                 # store | ignore | error — byte không thuộc tag nào
    limits: { maxConnections: 8, pduSize: 480 }
```
- **Ảnh vùng:** server dựng ảnh byte cho `I`, `Q`, `M` và từng `DB<n>` từ **catalog tag** (địa chỉ tuyệt đối). Đọc: gom giá trị qua `TagBroker.readMany`, **mã hóa BE** theo kiểu tag vào ảnh rồi trả đúng đoạn yêu cầu; byte không có tag: giá trị trong **ảnh thô** (khởi tạo 0).
- **Ghi:** giải mã đoạn byte ghi → với mỗi tag **nằm trọn** trong đoạn: `broker.write(...,'gateway')` (luật quyền M4 §4.2); ghi **một phần** tag nhiều byte → `0x05` (từ chối, không áp dụng gì — tất-cả-hoặc-không trên mỗi yêu cầu); byte không thuộc tag: theo `unmapped` (`store` lưu vào ảnh thô); ghi vào tag không `writable` → `0x03`.
- Khác biệt so với PLC thật (ghi rõ trong tài liệu): không có định thời chu kỳ; DB optimized không tồn tại; client dùng S7CommPlus (WinCC Professional/Unified "S7-1500 optimized") **không** kết nối được — chỉ client S7 cổ điển (Snap7, nodeS7, nhiều OPC server/ SCADA bên thứ ba) dùng được. `VERIFY` khả năng tương thích với Kepware/Ignition ở site thật.
- Thống kê/ log vào trang Communications (M4).

---

## 8. Công cụ xuất TIA (`vcs-tia-export`)

### 8.1 Mục đích và ràng buộc
Xuất dữ liệu **chỉ-đọc** từ một dự án TIA bằng Openness để importer dùng. Ràng buộc: Windows; TIA Portal đã cài (cùng phiên bản với bản build của công cụ); người dùng thuộc nhóm `Siemens TIA Openness`; TIA có thể hỏi cấp quyền truy cập Openness lần đầu; **xuất block yêu cầu TIA ở chế độ offline**.

### 8.2 CLI
```
vcs-tia-export --tia-version 21 (--attach [--pid N] | --project <file.ap21>) --plc "PLC_1"
               --out <dir> [--include blocks,types,tags,sources,hw] [--blocks "FB_*,OB1"]
               [--compile] [--skip-protected] [--json]
```
- `--attach`: gắn vào TIA đang chạy (`TiaPortal.GetProcesses()` → `Attach`), **không đóng** TIA sau đó; `--project`: mở không giao diện (`WithoutUserInterface`), **không lưu**, đóng khi xong (cảnh báo nếu dự án đang bị khóa bởi TIA khác).
- Quy tắc **chỉ-đọc**: không gọi Save/Import/Download/Compile (trừ khi `--compile`, vốn thay đổi trạng thái biên dịch — mặc định **tắt**, và nếu bật phải cảnh báo rõ).
- Xuất: nhóm block (duyệt đệ quy `BlockGroup.Groups`), `Export(FileInfo, ExportOptions)` cho FB/FC/OB/DB; UDT (`PlcType`); bảng tag (`PlcTagTable`, gồm hằng); nguồn SCL (`GenerateSource` nếu có, `VERIFY` phiên bản); thông tin phần cứng CPU (tên, `TypeIdentifier`/MLFB, firmware, địa chỉ IP nếu có); trạng thái nhất quán biên dịch của từng block (nếu đọc được).
- Block **know-how protected** hoặc không xuất được → **bỏ qua + ghi vào manifest** (`TIA-W010`), không bao giờ cố vượt bảo vệ.
- Lỗi do TIA online → `TIA-E010` ("chuyển TIA sang Offline rồi chạy lại").

### 8.3 Bố cục đầu ra
```
export/
  manifest.json
  plc/<PLC_Name>/blocks/<group...>/<Block>.xml
  plc/<PLC_Name>/types/<UDT>.xml
  plc/<PLC_Name>/tags/<Table>.xml
  plc/<PLC_Name>/sources/<Block>.scl        # nếu có
```
`manifest.json`: `{ exporterVersion, tiaVersion, exportedAtUtc, project: { name, path? }, plc: { name, type, orderNumber, firmware, ip? }, options, files: [{ path, sha256, kind, blockType, language, name, number }], skipped: [{ name, reason }], warnings[] }`. Mọi `sha256` tính trên nội dung đã chuẩn hóa (bỏ BOM, LF).

### 8.4 Build theo phiên bản TIA
`TiaVersion ∈ {17,18,19,20,21}` (MSBuild) tham chiếu `Siemens.Engineering.dll` của bản tương ứng (`PublicAPI\V21\...`); ưu tiên build **V21** và **V20** trước. Nhiều phiên bản cài song song → chọn bản khớp `--tia-version`. Có `--dry-run` kiểm tra môi trường (nhóm Windows, đường dẫn DLL, tiến trình TIA).

### 8.5 Không tự động hóa ở M5
Không tạo dự án, không tải xuống PLCSIM, không sửa block (các việc này là P1/P2). Hướng dẫn thủ công trong `docs/tia-export.md` và `docs/plcsim-setup.md`.

---

## 9. Importer SimaticML (`vcs tia import`)

### 9.1 Chế độ và đầu vào
```
vcs tia import <exportDir | file.xml | file.scl> [--mode symbols|logic|all] [--controller PLC1]
               [--merge-io io/io-list.normalized.csv] [--on-unsupported skip|stub|fail] [--commit] [--report]
```
| Chế độ | Làm gì | Khi dùng |
|---|---|---|
| `symbols` (**ưu tiên số 1**) | Sinh/cập nhật `tags/tags.yaml` từ bảng tag + biến DB (offset cho DB standard, `sym:` cho optimized), bố cục UDT/DB; **không** biên dịch logic | Chế độ B (PLCSIM/PLC thật/S7/OPC UA): cần symbol/địa chỉ, không cần logic |
| `logic` | Chuyển block (SCL/LAD/FBD) sang IR để chạy trên **SoftPlc** | Chế độ A dùng logic thật |
| `all` | Cả hai | |
Đầu vào chấp nhận: thư mục `export/` (có `manifest.json`), file SimaticML `.xml` lẻ, nguồn TIA `.scl/.db/.udt` ("Generate source from blocks" trong TIA UI — **không cần Openness**, dùng lại parser SCL của M1; chỉ SCL/STL, LAD/FBD không có dạng nguồn).

### 9.2 Đầu ra (tất định, ghi `--commit`)
- `tags/tags.yaml` (M0 §4.5; `origin` ghi file/mục; `provenance: import`; `controller` từ manifest).
- `plc/import/<PLC>/**` — **bản gốc SimaticML/nguồn** (sao chép nguyên văn, **nguồn sự thật** cho logic; chỉ-đọc theo quy ước).
- `plc/generated/*.scl` — **bản đọc** (SCL dựng lại từ token, mô tả LAD/FBD dạng văn bản) để review; **tái sinh được**, không sửa tay, không là nguồn sự thật.
- `plc/organization.yaml` — ánh xạ OB (số, loại, chu kỳ nếu đọc được; mặc định cấu hình) vào `organization` của M1.
- `reports/tia-import-<ts>.json|html` — **Compatibility Report** (mục 9.8).
- Re-import: diff theo (tên + địa chỉ), không ghi đè trường `provenance: manual`, idempotent (như M2 §8.8).

### 9.3 Đọc XML (nguyên tắc chung — `simaticml/xml.ts`)
- Trình đọc **an toàn**: cấm DTD/external entity (XXE), giới hạn kích thước (mặc định 50 MB/file) và độ sâu; không tải tài nguyên ngoài.
- **So khớp phần tử theo `local-name`**, bỏ qua URI namespace (hậu tố phiên bản `v3/v4/v5...` thay đổi giữa bản TIA); phần tử/thuộc tính lạ → cảnh báo `SML-W001` (không lỗi); `Engineering version` → ghi vào báo cáo.
- Ghi vị trí (file, dòng, `UId`/`ID` của đối tượng) vào mọi `Diagnostic`.
- **Cấm viết parser từ trí nhớ:** bắt buộc đối chiếu **XSD Openness** (thư mục schema đi kèm bản cài) và **≥ 10 file mẫu thật** (mục 19). Bảng phần tử dưới đây chỉ là **định hướng** (Phụ lục C).

### 9.4 Block và giao diện (`interface.ts`)
- Loại block: `SW.Blocks.OB/FB/FC/GlobalDB/InstanceDB`, `SW.Types.PlcStruct`, `SW.Tags.PlcTagTable`. Ngôn ngữ (`ProgrammingLanguage`): `SCL`, `LAD`, `FBD` hỗ trợ; `STL`, `GRAPH`, `F_*` (an toàn) → `SML-U001/U002` (bỏ qua theo `--on-unsupported`).
- **Interface**: các `Section` (`Input/Output/InOut/Static/Temp/Constant/Return`) → khai báo biến M1 (kể cả cấu trúc lồng, mảng, UDT); `Datatype` dạng chuỗi (`Bool`, `Int`, `"UDT_Name"`, `Array[0..9] of Int`...) → `DataType` của M0/M1; kiểu chưa hỗ trợ (`String`, `Variant`, `Pointer`, `DTL`...) → `SML-U010` cho biến/ block đó.
- **`MemoryLayout`**: `Standard` → tính offset bằng thuật toán M1 §3.4 (`VERIFY` bằng thí nghiệm E11); `Optimized` → chỉ symbolic (`sym:`).
- **Giá trị khởi tạo**: `StartValue` → giá trị ban đầu DB/biến static.
- **Instance DB**: `InstanceOfName` → gắn instance DB với FB (M1 §3.5).
- **Số block/tên** giữ nguyên để địa chỉ tuyệt đối `DBn` khớp PLC.

### 9.5 SCL (`structured-text.ts`) — tái sử dụng parser M1
`StructuredText` là chuỗi token (`Token`, `Blank`, `NewLine`, `Access`, `Comment`, `LineComment`, ...). Importer **dựng lại văn bản SCL** theo quy tắc: `Token@Text` giữ nguyên; `Blank@Num` → khoảng trắng; `NewLine@Num` → xuống dòng; `Access Scope=LocalVariable` → `#a.b[...]`; `Scope=GlobalVariable` → `"A"."B"`; hằng (`LiteralConstant`/`TypedConstant`) theo `ConstantValue` + kiểu; **`Call`** (FC/FB/instance) dựng thành lời gọi SCL kèm tham số; chú thích giữ lại. Sau đó chạy **cùng** lexer/parser/type-check của M1 → IR. Mọi sai khác ngữ nghĩa giữa SimaticML-SCL và SCL nguồn do TIA sinh ra được kiểm bằng test đối chiếu (mục 13).

### 9.6 LAD/FBD (`flgnet.ts`, `lower.ts`) — compile **dataflow** trực tiếp sang IR
Không chuyển về JSON LAD của M1 (mạng FlgNet là đồ thị tổng quát). Thuật toán:
1. Đọc `Parts` (`Access`, `Part`, `Call`) và `Wires` → đồ thị chân (pin): mỗi `Part` có chân vào/ra (`in/out`, `en/eno`, `in1/in2`, `operand`, `pre/bit`...).
2. Dây `Powerrail` = hằng `true`; nhiều dây vào cùng một chân điều kiện = **OR** (nhánh song song).
3. Sắp xếp topo các `Part` theo phụ thuộc; sinh IR: `Contact`: `out = in AND value` (đảo nếu `Negated`); `Coil`: `operand := in` (đảo nếu `Negated`); `SCoil/RCoil`: có điều kiện; `PBox/NBox`: cạnh với bit nhớ (`bit`/`operand`); so sánh (`Eq/Ne/Lt/Le/Gt/Ge`), số học (`Add/Sub/Mul/Div`), `Move`, `Convert`, `Limit/Min/Max/Norm/Scale` → intrinsic M1; **hộp có EN/ENO**: khi `en = false` không thực thi, `eno = en` (M1 §5.2; `VERIFY` thí nghiệm); `Call` đến FC/FB/IEC timer/counter (`TON, TOF, TP, TONR, CTU, CTD, CTUD, R_TRIG, F_TRIG, SR, RS`) → `callFb/callSys` của M1 (timer/counter luôn được gọi mỗi scan).
4. Mạng có vòng/pin chưa nối/`UId` thiếu → `SML-E010`.
5. Mỗi mạng ghi `srcMap` (`UId` → IR node) để báo lỗi và (P1) tô sáng online.
Lệnh Siemens chưa có trong Phụ lục A của M1 → `SML-U003 unsupported instruction <tên>`; xử lý theo `--on-unsupported`:
- `skip` (mặc định): **không nạp cả block** chứa lệnh đó; các nơi gọi block đó thành lỗi biên dịch rõ ràng (không chạy sai im lặng);
- `stub`: nạp block, thay lệnh bằng **no-op + `RuntimeFault UNSUPPORTED`** (đếm, hiển thị);
- `fail`: dừng import.

### 9.7 Bảng tag và hợp nhất với I/O list
- `SW.Tags.PlcTag` (`Name`, `DataTypeName`, `LogicalAddress`) → `TagDef` (`area` từ địa chỉ, `type` từ kiểu). Hằng (`PlcUserConstant`) → không thành tag runtime (ghi báo cáo, dùng khi phân giải biểu thức).
- **Suy ra `signal.kind`** khi chưa có I/O list: `I`+`Bool` → `DI`; `I`+kiểu số → `AI`; `Q`+`Bool` → `DO`; `Q`+kiểu số → `AO`; `M`/DB → `null`. Độ tin cậy thấp: `provenance: import`, **I/O list (M2) luôn thắng** về `kind`, `scaling`, `polarity`.
- `--merge-io`: khớp theo **địa chỉ** (chính) rồi **tên**; xung đột (cùng địa chỉ khác tên / cùng tên khác địa chỉ / kiểu khác) → `SML-W020` liệt kê, **không** tự chọn im lặng; mặc định giữ giá trị I/O list và ghi tag bảng PLC thành `alias`.
- **Biến DB → tag:** mỗi biến lá của DB **standard** → một tag (`area: DB`, `address: DBn.DBXb.i/DBWb/DBDb`, tên `DB.Path.Member`); DB **optimized** → `address: sym:"DB"."Path"`. Cấu trúc/mảng lớn: tùy chọn `--db-depth`, `--include-db "DB_*"`, giới hạn tổng (mặc định 20 000 tag) để tránh bùng nổ.

### 9.8 Compatibility Report
JSON + HTML: danh sách block (tên, số, loại, ngôn ngữ, bố cục bộ nhớ, trạng thái `OK/PARTIAL/UNSUPPORTED/SKIPPED`), **bảng lệnh không hỗ trợ** (tên, số lần, các block), số mạng/SCL dòng đã chuyển, tỷ lệ block/mạng chuyển được, cảnh báo (`know-how protected`, F-block, STL, kiểu không hỗ trợ), danh sách hợp nhất tag (xung đột), khuyến nghị (`dùng PLCSIM Advanced cho độ chính xác`), `projectHash`/hash từng file, phiên bản exporter/TIA. **Điểm "convertibility"** hiển thị rõ để người dùng quyết định Chế độ A hay B.

### 9.9 M1 tích hợp
`compileProject` nạp `plc/import/**/*.xml` bằng front-end `simaticml` (mục 9.4–9.6), `plc/**/*.scl|db|udt` (TIA source) bằng front-end SCL; hợp nhất với block viết tay (trùng tên → lỗi `SML-E020`). Thứ tự ưu tiên: block viết tay > import (trừ khi cấu hình). `organization.yaml` điền `organization` (OB1, OB100, cyclic).

---

## 10. Conformance và thí nghiệm VERIFY

### 10.1 Mục tiêu
Đóng vòng các mục `VERIFY` của M1 §14 bằng cách chạy **cùng thí nghiệm** trên SoftPlc và PLCSIM (lockstep), so sánh và cập nhật `docs/semantics.md` + golden test (`expectedFrom: plcsim`).

### 10.2 Thí nghiệm
- Mỗi thí nghiệm = **bộ nguồn SCL** (`experiments/Exx/*.scl`) + **kịch bản** (YAML: chuỗi scan với input đặt trước, tag quan sát) + **kỳ vọng của SoftPlc** (theo spec hiện hành).
- 14 thí nghiệm khớp M1 §14: E01 INT tràn, E02 chia 0, E03 làm tròn REAL→INT + gán ngầm, E04 `NORM_X/SCALE_X` ngoài khoảng, E05 TON `PT=0` + gọi lại sau nhiều scan, E06 TP khi IN giữ true, E07 TOF IN dao động, E08 bộ đếm biên/ưu tiên, E09 `R_TRIG` scan đầu sau STOP→RUN, E10 đọc lại `%Q` trong cùng scan + thời điểm lấy `InputArea`, E11 layout DB standard, E12 độ sâu gọi/TEMP chưa khởi tạo, E13 chỉ số mảng ngoài khoảng, E14 cyclic OB không chia hết chu kỳ OB1.
- **Chủ sản phẩm tạo một dự án TIA** `VCS_Conformance` (hướng dẫn trong `docs/verify-experiments.md`): nhập các `.scl` bằng "External source files → Generate blocks from source", tạo DB `Exp_IO` làm giao diện (hoặc dùng tag `I/Q`), tải vào PLCSIM Advanced instance.
- Mỗi thí nghiệm kèm **mô tả giao diện** (tag nào đặt/đọc) để harness chạy không cần sửa tay.

### 10.3 Harness (`vcs conformance run`)
```
vcs conformance run <dir> --experiments E01,E05,... --target plcsim --instance VCS_CONF
                          [--compare builtin] [--out reports/conformance-<ts>]
```
Quy trình mỗi thí nghiệm: `reset` instance → đặt chế độ lockstep → áp kịch bản theo scan → ghi trace (tag quan sát theo scan) → (nếu `--compare builtin`) chạy cùng kịch bản trên SoftPlc → so sánh từng scan/tag. Đầu ra: `conformance.json/html` với bảng `PASS/DIFF` và **bản golden YAML** (`expectedFrom: plcsim`) sinh sẵn; `docs/compat-matrix.md` cập nhật tự động; mỗi `DIFF` kèm gợi ý sửa `semantics.md`. **Không** tự động sửa runtime; người dùng/AI sửa có kiểm duyệt.

### 10.4 Nghiệm thu một phần
Cần **PLCSIM Advanced thật** + dự án TIA do chủ sản phẩm tạo (mục 17, tiêu chí 8).

---

## 11. CLI và UI

### 11.1 CLI
```
vcs bridge ping|info|instances|run|stop|reset  [--endpoint tcp://127.0.0.1:4850]
vcs s7 probe <host> ...
vcs tia import <path> ...           (mục 9)
vcs tia report <dir>                (mở/ xuất báo cáo)
vcs conformance run <dir> ...       (mục 10)
```
### 11.2 UI (trang Communications mở rộng + trang PLC)
- Thẻ **PLCSIM Advanced**: trạng thái agent/instance, phiên bản runtime/API, chế độ đồng bộ (đổi được khi dừng), **drift**, RTT, chu kỳ ảo, nút Run/Stop/Reset CPU, cảnh báo thiếu tag, nút "Cập nhật tag list".
- Thẻ **S7** (client/server): trạng thái, PDU, số item, lỗi và **checklist PUT/GET** theo mã lỗi.
- Trang **TIA Import**: chọn thư mục export, xem Compatibility Report, chọn chế độ (`symbols/logic/all`), xem diff tag, Commit.
- Sim bar: hiển thị `timeScale` cho phép theo adapter (không chỉ "khóa").

---

## 12. Bảo mật, giấy phép, pháp lý
- **Giấy phép Siemens:** PLCSIM Advanced cần giấy phép hợp lệ; Openness yêu cầu TIA Portal có giấy phép phù hợp (`VERIFY` điều khoản phiên bản đang dùng). **Không phân phối lại** DLL Siemens; mọi build .NET cần bản cài của người dùng.
- **Dự án khách hàng là tài sản bảo mật:** XML/nguồn xuất ra chứa know-how; `export/` và `plc/import/` **không** commit vào repo công khai; hướng dẫn `.gitignore`/kho riêng; báo cáo ghi hash nhưng không nhúng nguồn.
- **Không vượt bảo vệ:** block know-how protected bị bỏ qua; không công cụ nào cố giải mã.
- **PUT/GET** không xác thực, **VCS S7 server/client** chỉ dùng trong mạng FAT cô lập; mặc định bind `127.0.0.1`; cảnh báo khi cấu hình ra ngoài.
- **Bridge:** token HMAC khi không loopback; không log token; giới hạn khung/kết nối; (P1) TLS.
- **Openness:** công cụ chỉ-đọc, cảnh báo trước mọi thao tác thay đổi trạng thái (`--compile`).
- Ghi trong tài liệu: PLCSIM là **mô phỏng**, kết quả không thay thế SAT (kế thừa M3 §10).

---

## 13. Chiến lược test (phân tầng theo hạ tầng)

| Tầng | Cần gì | Chạy ở đâu | Nội dung |
|---|---|---|---|
| **T1 — thuần** | Không cần Siemens | Mọi CI (Linux + Windows) | Codec VBP/1; adapter ↔ **fake-bridge-agent (TS)**; codec S7 + client/server (+ interop `python-snap7`/`nodes7`); toàn bộ importer SimaticML bằng XML fixture; DB layout; merge; report |
| **T2 — .NET** | .NET SDK | CI Windows (và Linux nếu SDK) | `VCS.Bridge.Core` + `Fake` backend (xUnit); mô phỏng lỗi/ timeout/ khung sai; agent giả ↔ client TS (cross-language) |
| **T3 — live** | PLCSIM Advanced + TIA + giấy phép | **Runner Windows tự quản / thủ công** | Bridge thật, lockstep, conformance, exporter Openness, round-trip S7 với PLCSIM |

### 13.1 Số lượng tối thiểu (T1/T2)
| Nhóm | Test |
|---|---|
| Codec VBP/1 (khung, JSON, nhị phân, HMAC, giới hạn, khung sai) | ≥ 40 |
| `fake-bridge-agent` + `PlcsimAdapter` (init, ảnh I/O, diff ghi, lockstep từng bước, realtime/scaled, drift, mất kết nối/nối lại, `tags.update`, cache introspection) | ≥ 40 |
| **Vòng kín lockstep** (fake agent dùng **SoftPlc M1** + plant `motor_dol` + `FB_Motor`): bảng thời gian tính tay giống M2 §11.4 | ≥ 4 kịch bản |
| M3 với adapter lockstep (runner async, `isolation: reset`, báo cáo meta) | ≥ 8 |
| S7 codec (từng PDU, chia/gộp khung, mã lỗi, `splitItems`) | ≥ 60 |
| S7 server (đọc/ghi theo kiểu, tất-cả-hoặc-không, partial, unmapped, giới hạn) bằng client của ta **và** `python-snap7`/`nodes7` | ≥ 40 |
| S7 client adapter với server của ta/`fake` (gom khối, ghi khi đổi, `S7-E011`, kết nối lại) | ≥ 20 |
| `vcs s7 probe` (các tình huống lỗi giả lập) | ≥ 8 |
| Manifest/exporter contract (đọc/ghi `manifest.json`, hash, skipped) | ≥ 15 |
| Importer: giao diện/kiểu/mảng/UDT/DB layout (standard/optimized) | ≥ 50 |
| Importer: SCL từ token → văn bản → IR (so với SCL nguồn tương đương) | ≥ 40 |
| Importer: FlgNet LAD/FBD → IR (contact, nhánh song song, coil, set/reset, cạnh, so sánh, số học, timer/counter, call FC/FB, EN/ENO, mạng lỗi) | ≥ 60 |
| Importer: bảng tag, merge I/O list, xung đột, idempotent re-import | ≥ 25 |
| Compatibility Report (cấu trúc, số liệu) | ≥ 15 |
| An toàn XML (XXE, kích thước, độ sâu, phần tử lạ) | ≥ 10 |
| Property: `encode∘decode` S7/VBP; layout DB so với mô hình tham chiếu | 3 nhóm |
| .NET (xUnit): Core, Fake backend, lỗi/timeouts | ≥ 40 |

### 13.2 Fixture SimaticML
- **Fixture thật (bắt buộc):** ≥ 10 file xuất từ TIA thật (ẩn danh), đủ: FB/FC/OB SCL, FB/FC LAD, FBD, GlobalDB (standard/optimized), InstanceDB, UDT, bảng tag, block dùng timer/counter/edge/`Convert`/`NORM_X`, block STL (để kiểm `SML-U001`), block F-safety (nếu có). Đặt trong `fixtures/tia-real/` (**kho riêng**, không công khai).
- **Fixture tổng hợp:** viết tay **sau khi** đã đối chiếu mẫu thật, cho từng cấu trúc, để CI công khai chạy được.
- Mỗi fixture có `expected` (IR dump hoặc bảng tag) tính tay/đối chiếu với kết quả PLCSIM (qua conformance) khi có.

### 13.3 Live (T3) — danh mục nghiệm thu thủ công/tự quản
Xem mục 17 (tiêu chí 5–9) và `docs/plcsim-setup.md` (checklist cài đặt: nhóm Windows, giấy phép, mạng ảo, instance, tải chương trình).

---

## 14. Hiệu năng (mục tiêu; đo ở T1 bằng fake agent và T3 bằng PLCSIM thật)
- **VBP/1:** `io.exchange` 1 024 byte vào + 1 024 byte ra: RTT loopback ≤ 1 ms (agent giả); codec ≥ 200 000 khung/s.
- **Lockstep (PLCSIM thật):** ≥ **100 bước/giây** ở `plcScanMs = 10` (≥ 1× thời gian thực) là **mức tối thiểu**; mục tiêu ≥ 300 bước/giây; đo và ghi vào `docs/plcsim-setup.md` (phụ thuộc máy/phiên bản).
- **Adapter `step()`** (không lockstep): ≤ 50 µs/200 tag; lockstep: thời gian `await` không chặn event loop > 50 ms.
- **S7 server:** đọc 480 byte ≤ 2 ms; 200 yêu cầu/giây ổn định.
- **Importer:** dự án 500 block/20 000 tag → `symbols` ≤ 10 s, `logic` ≤ 30 s.
- `pnpm bench` bổ sung nhóm `bridge`, `s7`, `tia`.

---

## 15. Mã chẩn đoán

| Mã | Mức | Ý nghĩa |
|---|---|---|
| BRG-E001 | error | Khung VBP sai/đóng kết nối |
| BRG-E002 | error | Phiên bản giao thức không khớp |
| BRG-E010 | error | Hết thời gian lệnh |
| BRG-E011/E012 | error | Instance chưa chạy / không tồn tại |
| BRG-E013/E014/E015 | error | Tag không tồn tại / sai kiểu / tag list cũ |
| BRG-E020 | error | API không tương thích runtime |
| BRG-E021 | error | Giấy phép/số instance |
| BRG-E022 | error | Thiếu quyền Windows (`PlcSimUsers`) |
| PSA-E003 | error | Tag I/Q vượt kích thước ảnh |
| PSA-W010 | warn | Tag M/DB không có trong tag list |
| PSA-W030 | warn | Lệch thời gian ảo ↔ mô phỏng (scaled) |
| PSA-W031 | warn | Chu kỳ PLC thực tế dài hơn chu kỳ ghi đè (lockstep) |
| PSA-I010 | info | Tag list/ chương trình đã được cập nhật sau download |
| S7-E010 | error | Tag `sym:` không truy cập được bằng S7 classic |
| S7-E011 | error | CPU từ chối (PUT/GET/ optimized / bảo vệ) kèm checklist |
| S7-W020 | warn | Ghi vùng I trên CPU không phải PLCSIM |
| TIA-E010 | error | TIA đang online / không xuất được |
| TIA-W010 | warn | Block bị bỏ qua (know-how protected/ không xuất được) |
| SML-E010 | error | Mạng FlgNet không hợp lệ (vòng/ pin chưa nối) |
| SML-E020 | error | Trùng tên block với block viết tay |
| SML-W001 | warn | Phần tử/thuộc tính SimaticML lạ |
| SML-W020 | warn | Xung đột tag giữa bảng PLC và I/O list |
| SML-U001/U002 | warn | Ngôn ngữ/ loại block không hỗ trợ (STL, GRAPH, F-) |
| SML-U003 | warn | Lệnh không hỗ trợ |
| SML-U010 | warn | Kiểu dữ liệu không hỗ trợ |
Đăng ký vào `DiagnosticCatalog` (M0); mọi thông báo nêu đối tượng, vị trí (file/`UId`) và **hướng sửa**.

---

## 16. Kế hoạch triển khai và prompt cho AI

| Ngày | Công việc | Kết quả |
|---|---|---|
| 1 | Vá M0–M4 (mục 2: `asyncStep`, `sym:`, runner async, capabilities); thiết kế VBP/1 (Phụ lục A) + `vbp.ts` + `fake-bridge-agent.ts` (TS, dùng SoftPlc) | codec + agent giả |
| 2–3 | `PlcsimAdapter`: ảnh I/O, diff, realtime/scaled, introspection cache, lifecycle | test với agent giả |
| 4 | **Lockstep** + vòng kín (SoftPlc trong agent giả) + tích hợp M3 (`isolation: reset`) | bảng thời gian tính tay |
| 5–7 | `tools/bridge-agent`: Core + Fake backend + xUnit + cross-language test | agent .NET (backend giả) chạy được |
| 8–10 | Backend PlcSim.V8 (rồi V7/V6): theo manual API; live qualification (T3) | `vcs bridge` + lockstep thật |
| 11–13 | S7 codec + client + server + interop + `probe` | S7 hoàn chỉnh |
| 14 | `external:s7` adapter + checklist lỗi PUT/GET | vòng kín với server của ta |
| 15–16 | `vcs-tia-export` (V21 rồi V20) + manifest | export từ TIA thật |
| 17–19 | Importer: manifest, bảng tag, UDT/DB layout, `symbols` mode, merge, report | `tags.yaml` từ dự án thật |
| 20–22 | Importer `logic`: SCL (token→text→M1), FlgNet→IR, instruction map, report | block thật chạy trên SoftPlc |
| 23–24 | Conformance harness + 14 thí nghiệm + cập nhật `semantics.md` | báo cáo conformance |
| 25–26 | UI (Communications mở rộng, TIA Import), tài liệu (`plcsim-setup`, `tia-export`, `verify-experiments`), bench, đệm | nghiệm thu |

### Prompt mẫu

**P5.1 (vá + VBP + agent giả):**
> Đọc `M5-plcsim-s7-simaticml-spec.md` mục 2, 5.3, Phụ lục A. Vá M0–M4 theo bảng mục 2 (adapter `asyncStep`, `requiresAsync()`, địa chỉ `sym:`, M3 runner async + capabilities). Cài `packages/comms/src/plcsim/vbp.ts` (codec khung + JSON + nhị phân + HMAC) và `fake-bridge-agent.ts` bằng TypeScript chạy **SoftPlc của M1** làm "PLCSIM" (hỗ trợ lockstep). Test codec ≥ 40.

**P5.2 (PlcsimAdapter):**
> Theo mục 6: adapter `external:plcsim-advanced` (ảnh I/O theo vùng, diff, 3 chế độ đồng bộ, introspection cache, lifecycle, drift). Viết **bảng thời gian tính tay** cho vòng kín lockstep với `FB_Motor` + `motor_dol` (giống M2 §11.4) trước khi code. Không giả định hành vi PLCSIM ngoài những gì mục 3, 6 nêu; mọi giả định → `docs/open-questions.md`.

**P5.3 (Bridge Agent .NET):**
> Theo mục 5: `tools/bridge-agent` (net48, x64): Core, Agent, Fake backend, xUnit; luồng API chuyên trách; ánh xạ lỗi; token HMAC. **Chưa** viết backend PlcSim cho tới khi người dùng cung cấp thư mục API và xác nhận tên phương thức bulk-I/O. DLL Siemens không vào repo.

**P5.4 (Backend PlcSim):**
> Theo mục 5.5: cài `VCS.Bridge.PlcSim` cho API V8 (rồi V7/V6) **đọc manual API và header/doc đi kèm bản cài**; xác minh các mục `VERIFY` (tên API bulk-I/O, STA/MTA, định dạng tên symbolic, hành vi `RunToNextSyncPoint`). Viết checklist kết quả vào `docs/plcsim-setup.md`.

**P5.5 (S7):**
> Theo mục 7 và Phụ lục B: codec S7comm cổ điển (thuần), client/server/adapter, probe. **Kiểm tương thích** bằng `python-snap7` và `nodes7` làm client độc lập, và bằng gói Wireshark mẫu nếu có. Ghi tất-cả-hoặc-không như 7.6.

**P5.6 (TIA export):**
> Theo mục 8: `vcs-tia-export` (net48) chỉ-đọc, manifest chuẩn, build theo `TiaVersion` (V21 rồi V20). Dùng tài liệu Openness và XSD đi kèm bản cài; không tự suy đoán API.

**P5.7 (Importer symbols):**
> Theo 9.1–9.2, 9.4, 9.7, 9.8: chế độ `symbols`, bảng tag, UDT/DB layout (standard/optimized `sym:`), merge với I/O list, report. **Bắt buộc** làm từ file mẫu thật do chủ sản phẩm cung cấp và XSD Openness; thiếu mẫu → dừng và hỏi, không bịa cấu trúc XML.

**P5.8 (Importer logic):**
> Theo 9.5–9.6: SCL token→text→parser M1; FlgNet→IR dataflow; instruction map theo M1 Phụ lục A; `--on-unsupported`. Test đối chiếu IR từ SimaticML với IR từ SCL nguồn tương đương.

**P5.9 (Conformance + UI + tài liệu):** mục 10, 11, 13.3.

Mỗi prompt kết thúc: *"Chạy test/lint/typecheck/depcheck/bench (và .NET test nếu có), báo cáo kết quả, liệt kê mọi giả định tự đặt vào `docs/open-questions.md`, không sửa package ngoài phạm vi (nêu lý do), không hạ tiêu chí nghiệm thu, không đưa DLL/ file dự án khách hàng vào repo công khai."*

---

## 17. Tiêu chí nghiệm thu M5

**Tầng T1/T2 (tự động, mọi CI):**
1. `pnpm lint/typecheck/depcheck/test` xanh trên Linux và Windows; `dotnet test` (Core + Fake) xanh; M0–M4 không hồi quy.
2. Vòng kín **lockstep** với agent giả (SoftPlc) khớp bảng thời gian tính tay; **hai lần chạy cho cùng `TraceHasher.hash()`**; M3 chạy được suite với adapter lockstep (`isolation: reset`), báo cáo có meta chế độ/drift.
3. S7: server của ta tương thích `python-snap7` và `nodes7` (đọc/ghi mọi kiểu, tất-cả-hoặc-không); client adapter + `probe` chẩn đoán đúng ≥ 6 tình huống lỗi giả lập (PUT/GET tắt, DB optimized, rack/slot sai...).
4. Importer: trên **≥ 10 file TIA thật**: `symbols` sinh `tags.yaml` đúng 100% địa chỉ/kiểu với bảng tag; DB standard có offset khớp tài liệu TIA/ PLCSIM (kiểm bằng E11); `logic` chuyển được **≥ 90% block SCL/LAD/FBD** trong dự án mẫu của chủ sản phẩm (phần còn lại có báo cáo rõ); IR từ SimaticML khớp IR từ SCL nguồn tương đương; **không** có bỏ qua im lặng (mọi lệnh/ block bị bỏ nằm trong Compatibility Report).

**Tầng T3 (live — cần PLCSIM Advanced + TIA; nghiệm thu thủ công/tự quản):**
5. Bridge Agent (bản phù hợp V8, và V7/V6 nếu dùng) điều khiển instance thật: liệt kê, adopt/create, Run/Stop, `tags.update`, đọc/ghi vùng I/Q và symbolic (kể cả DB optimized).
6. **Chế độ B thực thụ:** dự án `crusher-sequence` (hoặc `motor-interlock`) với chương trình **TIA thật** trong PLCSIM Advanced + plant VCS: demo A–D (M2 §11.4) cho cùng **kết quả logic** như SoftPlc ở lockstep (khác biệt có giải thích trong `compat-matrix.md`).
7. Lockstep đạt ≥ 100 bước/giây (mục 14) và chạy nhanh hơn thời gian thực; `scaled` hoạt động với `timeScale ≤ maxFactor`; `PSA-W030/W031` phát đúng khi cố ý làm chương trình nặng.
8. **Conformance:** ≥ 10/14 thí nghiệm chạy thật và có kết quả ghi lại; mọi `DIFF` có xử lý (sửa `semantics.md`/runtime hoặc ghi chú chấp nhận); `docs/semantics.md` đổi trạng thái `VERIFIED` tương ứng; golden test đổi `expectedFrom: plcsim`.
9. `vcs-tia-export` (V21 và, nếu dùng, V20) xuất đúng từ TIA thật (offline), bỏ qua block know-how protected có báo cáo, **không thay đổi dự án**; `vcs tia import` hoàn tất vòng *export → import → tags/logic → chạy*.
10. Mọi mã `BRG-/PSA-/S7-/TIA-/SML-*` có test (T1/T2) và thông báo hành động được; tài liệu `docs/plcsim-setup.md`, `tia-export.md`, `verify-experiments.md` đủ để người khác cài đặt từ đầu.
11. Không có DLL Siemens hay dữ liệu dự án khách hàng trong repo; `Directory.Build.props` thiếu SDK Siemens → build bỏ qua có thông báo, các tầng T1/T2 vẫn xanh.

---

## 18. Quyết định mặc định (để AI không dừng hỏi)

| Chủ đề | Quyết định |
|---|---|
| Runtime Agent | .NET Framework 4.8 x64; build theo API `6/7/8`; ưu tiên V8 |
| Giao thức agent | VBP/1 (TCP, khung nhị phân + JSON), HMAC khi không loopback |
| Cổng agent | 4850, bind `127.0.0.1` |
| Chế độ đồng bộ mặc định | `realtime`; **khuyến nghị `lockstep`** cho test/FAT tự động |
| Lockstep | `SingleStep_CT`, ghi đè chu kỳ = `plcScanMs` |
| I/O tag I/Q | Theo vùng byte; tag M/DB theo symbolic |
| Force qua PLCSIM | Không hỗ trợ |
| Cô lập test PLCSIM | `reset` (Stop/PowerOff/PowerOn/Run), không snapshot |
| S7 | Codec tự cài; PUT/GET; không optimized; không S7CommPlus |
| S7 ghi vùng I trên PLC thật | Cảnh báo; dùng DB giao diện mô phỏng |
| S7 server `unmapped` | `store` |
| TIA Export | Chỉ-đọc; offline; bỏ qua know-how protected; `--compile` tắt |
| SimaticML nguồn sự thật | XML gốc trong `plc/import/`; `plc/generated/` chỉ để đọc |
| LAD/FBD | Compile dataflow trực tiếp sang IR |
| SCL từ SimaticML | Dựng lại text → parser M1 |
| Lệnh không hỗ trợ | `skip` block + báo cáo (không chạy sai im lặng) |
| Tag kind suy ra | Thấp tin cậy; I/O list thắng |
| DB optimized | `sym:` (chỉ qua PLCSIM/OPC UA, không qua S7) |
| Parser XML | local-name, chống XXE, phần tử lạ → cảnh báo |
| Fixture | Thật (kho riêng) + tổng hợp (công khai) |
| DLL Siemens | Không vào repo |

---

## 19. Việc của chủ sản phẩm (song song — quyết định thành bại của M5)

1. **Môi trường Windows:** cài **TIA Portal** (bản đang dùng tại dự án, ưu tiên V20/V21) và **S7-PLCSIM Advanced** (V8.0 nếu dùng TIA V21; kiểm tra tương thích dự án cũ), có giấy phép; thêm tài khoản Windows vào nhóm **`Siemens TIA Openness`** và **`PlcSimUsers`**; cấu hình **Siemens PLCSIM Virtual Ethernet Adapter** và địa chỉ IP instance. Cho biết **phiên bản chính xác** (TIA, PLCSIM Advanced, firmware CPU).
2. **Cung cấp dữ liệu thật (ẩn danh):** ≥ 10 file SimaticML xuất từ TIA (hoặc cho phép tôi/AI dùng công cụ export để tự xuất từ một dự án mẫu nhỏ), đủ SCL/LAD/FBD, DB standard/optimized, UDT, bảng tag; **một dự án TIA nhỏ có thể tải vào PLCSIM** (ví dụ `FB_Motor` + OB1 + I/O như `motor-interlock`, và dự án `crusher-sequence`).
3. **Tạo dự án `VCS_Conformance`** theo `docs/verify-experiments.md` (14 thí nghiệm) và chạy harness; đây là cách duy nhất để biết SoftPlc sai/ đúng so với PLC thật.
4. **Xác nhận các mục `VERIFY`** bằng cách mở manual API của đúng bản cài (đường dẫn `...\PLCSIMADV\API\<ver>\` và tài liệu "Function Manual API"): tên phương thức bulk-I/O theo vùng, định dạng tên symbolic, hành vi `RunToNextSyncPoint`/"Timespan synchronized CP", thời gian reset instance, số instance theo giấy phép.
5. **Chốt topology thực tế tại site:** SCADA sẽ nối **trực tiếp PLCSIM/PLC thật** (B1/B2) hay qua VCS (A)? SCADA dùng **S7CommPlus (WinCC tối ưu)**, OPC UA hay S7 cổ điển/Modbus? Điều này quyết định S7 server của VCS có ích hay không.
6. **Chính sách bảo mật của công ty/khách hàng:** có cho phép xuất dự án TIA bằng công cụ ngoài, đưa XML vào kho mã/ công cụ AI, bật PUT/GET trên PLC thật (thường **không** nên) — nếu không, B2 chỉ dùng OPC UA/PLCSIM.
7. **Quyết định đầu tư:** dùng PLCSIM Advanced (cần giấy phép) làm đường chính cho độ chính xác; Chế độ A (SoftPlc) giữ vai trò nhẹ/CI/đào tạo. Nếu CI cần chạy PLCSIM: cần **runner Windows tự quản** có giấy phép.
8. **Rà soát pháp lý Openness/PLCSIM API** (điều khoản sử dụng, phân phối công cụ do anh xây cho khách/ đồng nghiệp): đặc biệt nếu dự định thương mại hóa VCS (Bridge Agent và TIA Export phụ thuộc phần mềm Siemens của người dùng).

---

## Phụ lục A — VBP/1 (tóm tắt thông điệp)

**Khung:** `u32 length | u8 type | u32 requestId | u8 flags | payload`. `flags`: bit0 = response lỗi.

**Request JSON (`type 0x01`)** `{ "cmd": "...", "args": { ... }, "timeoutMs": 5000 }` → **Response JSON (`0x02`)** `{ "ok": true, "result": {...} }` hoặc `{ "ok": false, "error": { "code": "BRG-E0xx", "message": "...", "runtimeErrorCode"?: "SREC_..." } }`.

| `cmd` | `args` → `result` |
|---|---|
| `hello` | `{protocol, clientId, auth?}` → `{protocol, agentVersion, backend, plcsimRuntimeVersion?, apiVersion?}` |
| `manager.info` | `{}` → `{runtimeVersion, apiVersion, instanceCount, licenseInfo?}` |
| `instances.list` | `{}` → `[{name, state, cpuType, ip?, operatingMode, scaleFactor}]` |
| `instance.create`/`adopt`/`destroy` | `{name, cpuType?, ip?}` |
| `instance.powerOn`/`powerOff`/`run`/`stop`/`reset` | `{name, timeoutMs?}` → `{state}` |
| `instance.state` | `{name}` → `{state, virtualTimeNs, systemTime}` |
| `time.setMode` | `{name, mode}`; `time.setScale {name, factor}`; `time.setMinCycle {name, ns}` |
| `tags.update` | `{name}` → `{count}`; `tags.list {name, filter?}` → `[{name, type, area?, offset?}]` |
| `tags.read` | `{name, tags:[...]}` → `[{tag, type, value, quality}]`; `tags.write {name, items:[{tag, value}]}` |
| `io.layout` | `{name, inputBytes, outputBytes}` → `{ok}` |
| `mem.read`/`mem.write` | `{name, area:'M'|'DB', db?, offset, count|data}` |
| `step.run` | xem dưới (có thể dùng khung nhị phân `0x11`) |
| `diag.log`/`diag.stats` | nhật ký/ thống kê |
**Event (`0x03`):** `{ "event": "stateChanged"|"syncPoint"|"tagListUpdated"|"error", "instance": "...", "data": {...} }`.

**Khung nhị phân IO exchange (`0x10`)** request: `u8 instanceIdx | u16 writeCount | [u16 offset, u16 len, bytes]* | u16 readOffset | u16 readLen`; response: `u16 readLen | bytes`.
**Khung nhị phân step (`0x11`)** request: `u8 instanceIdx | u16 cycles | u8 flags(bit0: readOutputs) | u16 writeCount | [u16 offset, u16 len, bytes]* | u16 readOffset | u16 readLen | u16 symWriteCount | [...]`; response: `i64 virtualTimeNs | u32 cyclesRun | u8 flags(bit0: cycleOverrun) | u16 readLen | bytes | u16 symReadCount | [...]`.
(Mọi số nguyên big-endian; kích thước thực tế phải khớp mục 6.4; lỗi → response JSON lỗi.)

## Phụ lục B — Tham chiếu nhanh S7comm cổ điển (**xác minh bằng Snap7 docs/Wireshark**, `VERIFY`)
- **Kết nối:** TCP 102 → COTP CR `11 E0 0000 0001 00 | C0 01 0A | C1 02 <srcTSAP> | C2 02 <dstTSAP>` (TSAP nguồn `0x0100`; đích `0x0100 + rack*0x20 + slot` cho kiểu PG) → CC; sau đó **Setup communication** (`F0`) đàm phán PDU.
- **Read Var (`04`):** item `12 0A 10 | TS | len(2) | db(2) | area(1) | addr(3)`; `TS`: `01` BIT, `02` BYTE, `04` WORD, `05` INT, `06` DWORD, `07` DINT, `08` REAL; `addr` = (byte×8 + bit); vùng: `81` I, `82` Q, `83` M, `84` DB.
- **Response (AckData):** mỗi item `return(1) | transportSize(1) | length(2) | data`; `return 0xFF` = OK; độ dài tính theo bit cho `transportSize 04/03`, theo byte cho `09`; các item đệm cho chẵn byte trừ item cuối.
- **Write Var (`05`):** param như Read; data item `00 | transportSize | length | data` (đệm chẵn); response: `05 count | return codes`.
- **Mã lỗi header (`errClass/errCode`)** và mã item (`0x03`, `0x05`, `0x06`, `0x0A`) như mục 7.2.
- **Giới hạn:** dữ liệu mỗi item ≤ PDU − 18 (đọc); số item/PDU hữu hạn; yêu cầu vượt → chia nhỏ (`splitItems`).

## Phụ lục C — Phần tử SimaticML thường gặp (**định hướng, không phải đặc tả**; bắt buộc đối chiếu XSD + mẫu thật)
| Phần tử | Nội dung | Ánh xạ |
|---|---|---|
| `SW.Blocks.FB/FC/OB/GlobalDB/InstanceDB` | block + `AttributeList` (`Name`, `Number`, `ProgrammingLanguage`, `MemoryLayout`) + `ObjectList` | Block M1; số/tên giữ nguyên |
| `Interface/Sections/Section[@Name]/Member[@Name,@Datatype]` | biến (lồng `Member`) | Khai báo biến M1; `StartValue` → giá trị khởi tạo |
| `SW.Blocks.CompileUnit/AttributeList/NetworkSource` | mạng | LAD/FBD: `FlgNet`; SCL: `StructuredText` |
| `FlgNet/Parts/Access[@Scope]` (`Symbol/Component`, `Constant`) | toán hạng | Tag/biến cục bộ/hằng |
| `FlgNet/Parts/Part[@Name]` (`Contact`, `Coil`, `SCoil`, `RCoil`, `PBox`, `NBox`, `Eq`..., `Add`..., `Move`, `Convert`...) | phần tử LAD/FBD; `Negated[@Name]` | IR theo 9.6 |
| `FlgNet/Parts/Call/CallInfo` (`Name`, `BlockType`, `Instance`, `Parameter`) | gọi FC/FB/IEC block | `callFc/callFb/callSys` |
| `FlgNet/Wires/Wire` (`Powerrail`, `IdentCon[@UId]`, `NameCon[@UId,@Name]`) | kết nối | Đồ thị chân |
| `StructuredText/{Token,Blank,NewLine,Access,Comment,LineComment}` | SCL dạng token | Dựng text → parser M1 |
| `SW.Types.PlcStruct` | UDT | UDT M1 |
| `SW.Tags.PlcTagTable/SW.Tags.PlcTag[@Name,@DataTypeName,@LogicalAddress]` | bảng tag | `TagDef` |
