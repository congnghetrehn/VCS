# PRD — Virtual Commissioning Studio (VCS)

## Mục lục

- [0. Cách dùng tài liệu này với AI coding assistant](#0-cách-dùng-tài-liệu-này-với-ai-coding-assistant)
- [1. Tóm tắt sản phẩm](#1-tóm-tắt-sản-phẩm)
- [2. Bối cảnh và vấn đề](#2-bối-cảnh-và-vấn-đề)
- [3. Phân tích cạnh tranh và quyết định chiến lược](#3-phân-tích-cạnh-tranh-và-quyết-định-chiến-lược)
  - [3.1 Đối thủ/giải pháp thay thế (cần xác minh lại giá/tính năng hiện tại trước khi ra quyết định thương mại)](#31-đối-thủgiải-pháp-thay-thế-cần-xác-minh-lại-giátính-năng-hiện-tại-trước-khi-ra-quyết-định-thương-mại)
  - [3.2 Quyết định chiến lược quan trọng (thay đổi so với ý tưởng ban đầu)](#32-quyết-định-chiến-lược-quan-trọng-thay-đổi-so-với-ý-tưởng-ban-đầu)
  - [3.3 Định vị](#33-định-vị)
- [4. Personas và use case](#4-personas-và-use-case)
  - [Personas](#personas)
  - [Use case chính (P0)](#use-case-chính-p0)
- [5. Phạm vi](#5-phạm-vi)
  - [Trong phạm vi MVP (P0)](#trong-phạm-vi-mvp-p0)
  - [Ngoài phạm vi MVP (P1/P2)](#ngoài-phạm-vi-mvp-p1p2)
  - [Không làm](#không-làm)
- [6. Nguyên tắc kiến trúc](#6-nguyên-tắc-kiến-trúc)
- [7. Kiến trúc hệ thống](#7-kiến-trúc-hệ-thống)
  - [7.1 Tech stack đề xuất (cố định để AI không lan man)](#71-tech-stack-đề-xuất-cố-định-để-ai-không-lan-man)
  - [7.2 Cấu trúc repo](#72-cấu-trúc-repo)
- [8. Mô hình dữ liệu và định dạng file dự án](#8-mô-hình-dữ-liệu-và-định-dạng-file-dự-án)
  - [8.1 `vcs.project.yaml`](#81-vcsprojectyaml)
  - [8.2 Tag và I/O](#82-tag-và-io)
  - [8.3 Equipment instance](#83-equipment-instance)
  - [8.4 TypeScript interfaces lõi (AI phải bám sát)](#84-typescript-interfaces-lõi-ai-phải-bám-sát)
  - [8.5 Vòng lặp mô phỏng (thứ tự cố định)](#85-vòng-lặp-mô-phỏng-thứ-tự-cố-định)
- [9. Yêu cầu chức năng](#9-yêu-cầu-chức-năng)
  - [M1 — Project & Import](#m1-project-import)
  - [M2 — Controller Runtime (Chế độ A: Built-in Soft-PLC)](#m2-controller-runtime-chế-độ-a-built-in-soft-plc)
  - [M3 — Coding (editor)](#m3-coding-editor)
  - [M4 — Plant Model (trọng tâm của VC)](#m4-plant-model-trọng-tâm-của-vc)
  - [M5 — Test Automation và báo cáo FAT](#m5-test-automation-và-báo-cáo-fat)
  - [M6 — Communication Gateway](#m6-communication-gateway)
  - [M7 — HMI](#m7-hmi)
  - [M8 — Điều khiển mô phỏng](#m8-điều-khiển-mô-phỏng)
- [10. Yêu cầu phi chức năng](#10-yêu-cầu-phi-chức-năng)
- [11. Bảo mật, sở hữu trí tuệ, pháp lý](#11-bảo-mật-sở-hữu-trí-tuệ-pháp-lý)
- [12. UX tổng quan (màn hình chính)](#12-ux-tổng-quan-màn-hình-chính)
- [13. Lộ trình và milestone (mỗi milestone có demo + tiêu chí nghiệm thu)](#13-lộ-trình-và-milestone-mỗi-milestone-có-demo-tiêu-chí-nghiệm-thu)
  - [M0 — Skeleton (1–2 tuần công)](#m0-skeleton-12-tuần-công)
  - [M1 — Soft-PLC lõi + bit logic + timer (2–3 tuần)](#m1-soft-plc-lõi-bit-logic-timer-23-tuần)
  - [M2 — Plant Engine + thư viện thiết bị cơ bản (2–3 tuần)](#m2-plant-engine-thư-viện-thiết-bị-cơ-bản-23-tuần)
  - [M3 — Test Automation + báo cáo FAT (2–3 tuần)](#m3-test-automation-báo-cáo-fat-23-tuần)
  - [M4 — Comms P0 + HMI cơ bản (3–4 tuần)](#m4-comms-p0-hmi-cơ-bản-34-tuần)
  - [M5 — Siemens integration (P1) (4–6 tuần)](#m5-siemens-integration-p1-46-tuần)
  - [M6 — Clinker cooler lite (demo giá trị) (3–4 tuần)](#m6-clinker-cooler-lite-demo-giá-trị-34-tuần)
  - [M7+ — Rockwell, ABB, 3D, multi-user, cloud (P1/P2)](#m7-rockwell-abb-3d-multi-user-cloud-p1p2)
- [14. Thứ tự prompt gợi ý cho vibe coding (copy từng prompt)](#14-thứ-tự-prompt-gợi-ý-cho-vibe-coding-copy-từng-prompt)
- [15. Quy tắc cho AI coding assistant](#15-quy-tắc-cho-ai-coding-assistant)
- [16. Chiến lược kiểm thử sản phẩm](#16-chiến-lược-kiểm-thử-sản-phẩm)
- [17. Rủi ro và giảm thiểu](#17-rủi-ro-và-giảm-thiểu)
- [18. Câu hỏi mở (chủ sản phẩm cần trả lời trước/trong M1–M3)](#18-câu-hỏi-mở-chủ-sản-phẩm-cần-trả-lời-trướctrong-m1m3)
- [Phụ lục A — Tập lệnh Siemens hỗ trợ (checklist)](#phụ-lục-a-tập-lệnh-siemens-hỗ-trợ-checklist)
- [Phụ lục B — Thư viện thiết bị P0 (tín hiệu và hành vi tối thiểu)](#phụ-lục-b-thư-viện-thiết-bị-p0-tín-hiệu-và-hành-vi-tối-thiểu)
- [Phụ lục C — DSL test (ví dụ)](#phụ-lục-c-dsl-test-ví-dụ)
- [Phụ lục D — Báo cáo FAT (nội dung tối thiểu)](#phụ-lục-d-báo-cáo-fat-nội-dung-tối-thiểu)
- [Phụ lục E — Thuật ngữ](#phụ-lục-e-thuật-ngữ)

> Tên làm việc: **VCS – Virtual Commissioning Studio**. Đổi tên tùy ý.
> Phiên bản tài liệu: 0.1 (2026-11-21)
> Đối tượng đọc: (1) chủ sản phẩm (kỹ sư điện & tự động hóa), (2) AI coding assistant dùng để vibe coding. Mọi yêu cầu có ID (FR-xxx / NFR-xxx) và mức ưu tiên (P0 = bắt buộc cho MVP, P1 = sau MVP, P2 = tương lai).

---

## 0. Cách dùng tài liệu này với AI coding assistant

- Đưa **toàn bộ PRD** làm context, nhưng yêu cầu AI chỉ làm **một milestone mỗi lần** (mục 14).
- Luôn bắt AI: viết test trước hoặc cùng lúc, chạy test, và không chuyển milestone khi test chưa xanh.
- Mục 15 chứa quy tắc code, cấu trúc repo, Definition of Done và các prompt mẫu.
- Khi PRD mâu thuẫn với "ý tưởng" của AI, **PRD thắng**. Nếu thấy PRD thiếu, AI phải ghi câu hỏi vào `docs/open-questions.md` thay vì tự bịa.

---

## 1. Tóm tắt sản phẩm

**VCS** là nền tảng web để **mô phỏng toàn bộ hệ thống điều khiển của một dự án công nghiệp trước khi ra hiện trường**: logic PLC, thiết bị hiện trường (motor, van, biến tần, cảm biến, băng tải, silo...), HMI/SCADA và kết nối truyền thông. Mục tiêu là phát hiện lỗi logic, interlock, sequence và lỗi I/O ngay ở giai đoạn thiết kế/FAT, thay vì ở SAT/commissioning.

Giá trị cốt lõi:
1. **Tạo mô hình thiết bị và kịch bản test tự động từ tài liệu dự án có sẵn** (I/O list, Cause & Effect matrix, danh sách thiết bị), không phải dựng tay.
2. **Chạy logic điều khiển thật** (qua soft-PLC nội bộ hoặc qua adapter kết nối PLCSIM Advanced/PLC thật/OPC UA) cùng plant model.
3. **Test tự động, lặp lại được, có báo cáo FAT** có truy vết yêu cầu → test → kết quả.
4. Chạy trên web, lưu file dạng text (git-friendly), cài on-prem, dữ liệu khách hàng không rời khỏi hạ tầng của người dùng.

Hãng đầu tiên: **Siemens (S7-1200/1500, TIA Portal)**. Mở rộng sau: **Rockwell (Logix/L5X)** và **ABB (AC500/CODESYS, AC800M)**.

---

## 2. Bối cảnh và vấn đề

Ngành xi măng/khai khoáng (và EPC công nghiệp nói chung):

- Chương trình PLC viết rất muộn so với tiến độ, thường chỉ được test thực sự khi có tủ và thiết bị tại FAT hoặc tại site.
- Lỗi thường gặp ở SAT: sai interlock, thứ tự start/stop sai, thiếu permissive, xử lý fault/trip không đúng, sai scaling analog, sai tag/I/O mapping giữa PLC – SCADA – thiết bị.
- FAT với PLC phần cứng thật tốn kém: cần panel, khách hàng đến nhà máy vendor, giới hạn thời gian.
- Dữ liệu đã có sẵn nhưng không được tận dụng: **I/O list (Excel), C&E matrix, P&ID/flow diagram, motor list, instrument list**.
- Phần mềm hiện có hoặc đắt/nặng/khóa hãng (xem mục 3) hoặc chỉ phục vụ đào tạo.

**Vấn đề cần giải quyết:** giảm thời gian và rủi ro commissioning bằng cách cho phép kỹ sư điều khiển kiểm chứng logic với mô hình thiết bị ngay khi có chương trình, theo cách tự động, lặp lại và có bằng chứng.

---

## 3. Phân tích cạnh tranh và quyết định chiến lược

### 3.1 Đối thủ/giải pháp thay thế (cần xác minh lại giá/tính năng hiện tại trước khi ra quyết định thương mại)

| Giải pháp | Mạnh | Yếu so với VCS |
|---|---|---|
| Siemens PLCSIM / PLCSIM Advanced / PLCSIM Unified + SIMIT | Chạy chương trình TIA gần như nguyên bản, SIMIT là công cụ VC mạnh | Khóa hãng, Windows, license đắt, không auto-generate test từ I/O list + C&E theo hướng nhẹ |
| Rockwell Studio 5000 Logix Emulate (và dòng kế nhiệm) + Emulate3D | Chạy logic Logix thật | Khóa hãng, đắt |
| ABB soft controller / 800xA simulator, CODESYS Control (soft PLC) | Chạy logic thật của hãng | Khóa hãng, khó dùng cho test tự động đa hãng |
| Factory I/O, các bộ mô phỏng 3D đào tạo | Dễ dùng, trực quan | Hướng đào tạo, không hướng FAT/traceability |
| OpenPLC, Node-RED, tự viết bằng Python/Matlab/Simulink | Rẻ, linh hoạt | Không có workflow dự án, không import dự án thật |

### 3.2 Quyết định chiến lược quan trọng (thay đổi so với ý tưởng ban đầu)

Với mục tiêu **virtual commissioning**, thứ khách hàng cần kiểm chứng là **chương trình PLC thật** do TIA Portal biên dịch. Một interpreter tự viết **sẽ không bao giờ tương đương 100%** (đặc biệt F-safety, một số lệnh công nghệ, hành vi OB/diagnostic, S7-1500 optimized access, thư viện hãng...). Vì vậy VCS **không đặt cược toàn bộ vào việc tự viết lại PLC**. Thay vào đó:

> **Kiến trúc hai chế độ: tách "bộ điều khiển" khỏi "plant model + test engine".**
> - **Chế độ A – Built-in Soft-PLC (nội bộ):** tự chạy tập con SCL/LAD/FBD của Siemens (và sau này Rockwell/ABB). Dùng cho demo, đào tạo, test logic đơn giản, chạy trên web không cần cài gì, và CI.
> - **Chế độ B – External Controller Adapter:** kết nối tới controller ngoài qua OPC UA / Modbus TCP / S7 (Snap7 với PUT/GET) / **PLCSIM Advanced qua Bridge Agent (Windows, .NET)** / PLC thật. Đây là chế độ cho **VC thực thụ** vì chạy chương trình thật.
> - Plant model, test automation, HMI, báo cáo FAT **dùng chung** cho cả hai chế độ.

Hệ quả:
- Giá trị khác biệt (và phần khó sao chép) nằm ở **plant library + auto-generate từ I/O list/C&E + test automation + báo cáo FAT**, không nằm ở việc cạnh tranh độ tương thích firmware với Siemens.
- Mở rộng sang Rockwell/ABB trở nên dễ: chỉ cần thêm **Controller Adapter** (và importer), plant model và test engine giữ nguyên.
- Tính năng "Coding" và "HMI" trong ý tưởng gốc vẫn có, nhưng ưu tiên thấp hơn plant model + test automation trong MVP (xem mục 13/14).

### 3.3 Định vị

"Công cụ virtual commissioning nhẹ, chạy web, đa hãng, tự sinh mô hình và test từ I/O list và C&E matrix, cho EPC/vendor ngành xi măng và khai khoáng."

---

## 4. Personas và use case

### Personas
1. **Control/Automation Engineer (người dùng chính):** viết/kiểm tra logic PLC, chuẩn bị FAT. Cần nhập I/O list, dựng mô hình thiết bị nhanh, chạy test.
2. **Commissioning Engineer:** chạy kịch bản trước khi ra site, chuẩn bị checklist, tái hiện lỗi.
3. **Process/Package Engineer:** cung cấp mô tả sequence, interlock, giá trị quá trình; xem mô phỏng ở mức quá trình.
4. **FAT Witness (khách hàng/EPC):** quan sát, xem báo cáo, ký xác nhận (chỉ đọc + chạy lại test).
5. **Người đào tạo/sinh viên (P2):** dùng dự án mẫu.

### Use case chính (P0)
- **UC1:** Import I/O list Excel → hệ thống tạo tag, I/O map và gán thiết bị cho từng tín hiệu.
- **UC2:** Chọn mẫu thiết bị từ thư viện (motor DOL, motor VFD, van on/off, van điều khiển, silo level...) → ghép với I/O của PLC.
- **UC3:** Nạp chương trình PLC (Chế độ A: import/nhập SCL/LAD; Chế độ B: kết nối controller ngoài).
- **UC4:** Chạy mô phỏng, quan sát tag/thiết bị trên HMI, force/inject fault.
- **UC5:** Import C&E matrix → tự sinh bộ test interlock/trip → chạy → xem báo cáo pass/fail.
- **UC6:** Viết kịch bản sequence test (YAML) cho start-up/shutdown group (ví dụ crusher, clinker cooler, mill).
- **UC7:** Xuất báo cáo FAT (HTML/PDF/XLSX) có truy vết.
- **UC8 (P1):** Kết nối SCADA/HMI thật (WinCC, Ignition...) vào VCS qua OPC UA để chạy FAT tích hợp.

---

## 5. Phạm vi

### Trong phạm vi MVP (P0)
- Project workspace, file format text, quản lý tag/I/O.
- Import I/O list (Excel/CSV) và C&E matrix (Excel/CSV).
- Soft-PLC nội bộ cho **Siemens SCL + LAD tập con** (mục Phụ lục A).
- Plant model engine + thư viện thiết bị cơ bản (Phụ lục B).
- Test automation (DSL YAML, assertions, fault injection, time acceleration) + báo cáo FAT HTML.
- Comms: **OPC UA server** (VCS cung cấp tag), **OPC UA client + Modbus TCP** (adapter tới controller ngoài).
- HMI viewer/designer mức cơ bản (nút, đèn, giá trị, trend, alarm list, symbol thiết bị).
- Web UI đủ dùng, chạy local hoặc docker on-prem.

### Ngoài phạm vi MVP (P1/P2)
- P1: Bridge Agent cho PLCSIM Advanced, S7comm server/client (Snap7), importer SimaticML (LAD/FBD/SCL từ TIA), FBD editor, PID_Compact mô phỏng đơn giản, báo cáo PDF/XLSX, multi-user, RBAC.
- P1: Rockwell (L5X import, EtherNet/IP), ABB (PLCopen XML, Automation Builder).
- P2: 3D viewer (tích hợp mô hình E3D/Navisworks), process physics nâng cao, cloud SaaS, marketplace thư viện thiết bị, đào tạo.

### Không làm
- Không mô phỏng firmware PLC, không giải mã/giả lập S7comm-plus mã hóa, không mô phỏng chương trình F-safety, không vượt cơ chế bảo vệ know-how (block protection) của hãng.

---

## 6. Nguyên tắc kiến trúc

1. **Controller-agnostic core:** plant model và test engine chỉ biết "tag" và "I/O bus", không biết vendor.
2. **Deterministic simulation:** thời gian mô phỏng (sim clock) tách khỏi thời gian thực; cùng input → cùng output; có record/replay.
3. **Local-first, text-first:** mọi thứ lưu thành file JSON/YAML/SCL trong thư mục dự án để git diff/review được.
4. **Một ngôn ngữ cho phần lõi (TypeScript)** để AI vibe coding dễ nhất; chỗ nào cần hiệu năng thì tách module thay thế được (Rust/WASM) sau này mà không đổi interface.
5. **Plugin hóa:** `VendorAdapter` (importer + dialect), `ControllerAdapter` (runtime/ngoài), `ProtocolGateway`, `EquipmentModel`.
6. **Mọi giả định về độ tương thích phải hiển thị cho người dùng** (Compatibility Report khi import).

---

## 7. Kiến trúc hệ thống

```
┌──────────────────────────── Web App (React + TS) ────────────────────────────┐
│ Project Explorer │ I/O & Tag Mgr │ Code Editor │ Plant Designer │ HMI │ Test  │
└───────────────▲───────────────────────────────────────────────▲──────────────┘
                │ WebSocket / REST (tRPC hoặc REST + zod)       │
┌───────────────┴──────────────── VCS Server (Node.js/TS) ────────┴─────────────┐
│ Project Service │ Import Service │ Simulation Orchestrator │ Test Runner       │
│                                                                                │
│   ┌──────────── Simulation Kernel (isomorphic TS, chạy Worker/Node) ─────────┐ │
│   │ SimClock │ TagDB │ IoBus │ PlantEngine │ ControllerAdapter (A/B)        │ │
│   └────────────────────────────────────────────────────────────────────────┘ │
│ Protocol Gateways: OPC UA Server │ OPC UA Client │ Modbus TCP │ (P1) S7 │ (P1) EtherNet/IP │
└───────────────┬───────────────────────────────────────────────────────────────┘
                │ gRPC/WebSocket (P1)
        ┌───────┴────────────┐     ┌──────────────────────┐    ┌───────────────┐
        │ Bridge Agent (.NET)│     │ PLC thật / OPC UA srv│    │ SCADA/HMI thật│
        │ PLCSIM Advanced API│     └──────────────────────┘    └───────────────┘
        └────────────────────┘
```

### 7.1 Tech stack đề xuất (cố định để AI không lan man)

| Lớp | Lựa chọn |
|---|---|
| Monorepo | pnpm workspaces + Turborepo, TypeScript strict |
| Frontend | React + Vite, Zustand, TanStack Query, Monaco Editor, React Flow (FBD/sơ đồ), SVG cho HMI, uPlot cho trend, Tailwind |
| Backend | Node.js 20+, Fastify, zod (schema), ws (WebSocket) |
| Kernel | TypeScript thuần, chạy trong Web Worker (browser) và Node (server/CI) |
| Parser SCL | Chevrotain (hoặc ANTLR nếu cần), AST có type |
| OPC UA | node-opcua |
| Modbus | modbus-serial hoặc tự cài TCP (tập con) |
| Lưu trữ | Thư mục dự án (JSON/YAML/SCL) + SQLite (better-sqlite3) cho lịch sử chạy test/trace |
| Test | Vitest (unit), Playwright (e2e), golden tests |
| Đóng gói | Docker Compose; bản desktop (Tauri/Electron) là P2 |
| Bridge Agent (P1) | .NET 8, PLCSIM Advanced API, gRPC |

### 7.2 Cấu trúc repo

```
vcs/
  apps/
    web/                  # React app
    server/               # Fastify server
  packages/
    kernel/               # SimClock, TagDB, IoBus, scheduler
    runtime-iec/          # IR + interpreter soft-PLC (vendor-neutral)
    vendor-siemens/       # dialect SCL/LAD Siemens, importer, instruction set
    vendor-rockwell/      # (P1)
    vendor-abb/           # (P1)
    plant/                # PlantEngine + equipment library
    testing/              # DSL parser, assertions, runner, report
    comms/                # opcua-server, opcua-client, modbus
    importers/            # io-list, ce-matrix, (P1) simaticml
    hmi/                  # widget library + runtime binding
    schemas/              # zod schemas dùng chung (project file format)
  examples/
    motor-interlock/      # demo 1
    crusher-sequence/     # demo 2
    clinker-cooler-lite/  # demo 3
  docs/
    PRD.md
    open-questions.md
    adr/                  # architecture decision records
```

---

## 8. Mô hình dữ liệu và định dạng file dự án

Thư mục dự án (git-friendly):

```
myproject/
  vcs.project.yaml
  io/io-list.csv                  # hoặc .xlsx gốc + bản đã normalize
  io/ce-matrix.csv
  tags/tags.yaml
  plc/
    controller.yaml               # chế độ A/B, vendor, model, cấu hình
    blocks/OB1.scl  FB_Motor.scl  DB_Motor.yaml  ...
  plant/
    equipment.yaml                # instance thiết bị + gán tín hiệu
    process.yaml                  # (P1) bin/silo, flow
  hmi/screens/*.json
  tests/*.test.yaml
  reports/                        # sinh ra, có thể gitignore
```

### 8.1 `vcs.project.yaml`
```yaml
name: Crusher Line 1
schemaVersion: 1
controllers:
  - id: PLC1
    mode: builtin            # builtin | external
    vendor: siemens
    model: S7-1500
  - id: PLC2
    mode: external
    adapter: opcua           # opcua | modbus | plcsim-advanced | s7
    endpoint: opc.tcp://192.168.0.10:4840
simulation:
  stepMs: 10                 # bước plant model
  plcScanMs: 20              # chu kỳ quét OB1 mô phỏng (chế độ A)
  timeScale: 1               # 1 = realtime, >1 = nhanh hơn, 0 = nhanh nhất có thể
```

### 8.2 Tag và I/O
```yaml
# tags/tags.yaml
- name: CR01_M01_RUN_CMD
  type: Bool
  area: Q                     # I | Q | M | DB
  address: "%Q0.0"
  controller: PLC1
  description: Crusher motor run command
  signal: { kind: DO, plantRef: "CR01_M01.runCmd" }

- name: CR01_M01_RUN_FB
  type: Bool
  area: I
  address: "%I0.0"
  controller: PLC1
  signal: { kind: DI, plantRef: "CR01_M01.runFb" }

- name: CR01_PT01
  type: Int                   # raw 0..27648
  area: I
  address: "%IW64"
  controller: PLC1
  signal: { kind: AI, plantRef: "CR01_PT01.raw", scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 10, unit: bar } }
```

### 8.3 Equipment instance
```yaml
# plant/equipment.yaml
- id: CR01_M01
  model: motor_dol                 # tham chiếu thư viện
  params: { startDelayMs: 500, stopDelayMs: 800, overloadTripProbability: 0 }
  signals:
    runCmd:   CR01_M01_RUN_CMD     # PLC output -> thiết bị
    runFb:    CR01_M01_RUN_FB      # thiết bị -> PLC input
    fault:    CR01_M01_FAULT
    remote:   CR01_M01_REMOTE
    ready:    CR01_M01_READY
```

### 8.4 TypeScript interfaces lõi (AI phải bám sát)
```ts
export type TagValue = boolean | number | string | bigint;
export type Quality = 'good' | 'bad' | 'uncertain' | 'forced';

export interface Tag {
  name: string; type: DataType; value: TagValue; quality: Quality;
  forced?: boolean; ts: number /* simTimeMs */;
}

export interface TagDB {
  read(name: string): Tag;
  write(name: string, v: TagValue, opts?: { source: string }): void;
  subscribe(names: string[], cb: (changes: TagChange[]) => void): Unsub;
  snapshot(): Record<string, Tag>;
  restore(s: Record<string, Tag>): void;
}

export interface SimClock {
  nowMs(): number;                  // thời gian mô phỏng
  advance(dtMs: number): void;
  setTimeScale(x: number): void;
}

/** Mọi controller (builtin/ngoài) cài interface này */
export interface ControllerAdapter {
  id: string;
  kind: 'builtin' | 'external';
  init(cfg: ControllerConfig, io: IoBus): Promise<void>;
  /** builtin: chạy 1 scan; external: đồng bộ I/O với controller ngoài */
  step(simTimeMs: number, dtMs: number): Promise<void>;
  reset(): Promise<void>;
  getDiagnostics(): ControllerDiagnostics;
}

/** Cầu nối giữa plant và controller */
export interface IoBus {
  readInputs(controllerId: string): Record<string, TagValue>;   // giá trị plant đưa vào PLC
  writeOutputs(controllerId: string, out: Record<string, TagValue>): void; // PLC đưa ra plant
}

export interface EquipmentModel {
  type: string;
  paramsSchema: ZodSchema;
  step(ctx: { dtMs: number; simTimeMs: number; params: any; state: any;
              read: (sig: string) => TagValue; write: (sig: string, v: TagValue) => void }): void;
  faults?: FaultDef[];
}

export interface ProtocolGateway {
  id: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

### 8.5 Vòng lặp mô phỏng (thứ tự cố định)
Mỗi bước `dt = stepMs`:
1. Cập nhật input từ test engine/HMI/force (nếu có).
2. `PlantEngine.step` (thiết bị đọc output PLC từ lần trước, tính trạng thái mới).
3. `IoBus` đẩy input của plant vào controller.
4. `ControllerAdapter.step`: (builtin) latch input → chạy OB theo task → ghi output; (external) đồng bộ qua giao thức.
5. Ghi output PLC vào `TagDB`/plant.
6. Gateways phát subscription; trace ghi lại; `SimClock.advance(dt)`.

Chế độ builtin phải mô phỏng đúng ngữ nghĩa Siemens: **process image input latch đầu scan, process image output ghi cuối scan**.

---

## 9. Yêu cầu chức năng

### M1 — Project & Import

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-101 | Tạo/mở/lưu dự án theo cấu trúc mục 8; validate bằng zod, báo lỗi rõ ràng theo file/dòng | P0 |
| FR-102 | Import I/O list từ CSV/XLSX với **column mapping UI** (người dùng chọn cột: tag, address, type, description, unit, eng range, equipment, module/slot...) và lưu mapping để dùng lại | P0 |
| FR-103 | Chuẩn hóa địa chỉ Siemens (%I0.0, %IW64, %Q0.0, %QW..., DB.DBX) và kiểm tra trùng/chồng địa chỉ | P0 |
| FR-104 | Import C&E matrix (hàng = cause, cột = effect, ký hiệu X/1/I/R...) với mapping ký hiệu → hành động (trip, start-inhibit, stop-sequence, alarm) | P0 |
| FR-105 | **Auto-suggest thiết bị** từ tiền tố tag (ví dụ `CR01_M01_*` → motor_dol) với bảng quy ước đặt tên cấu hình được; người dùng duyệt/sửa hàng loạt | P0 |
| FR-106 | Báo cáo kiểm tra chất lượng I/O list: tag thiếu type, trùng tag, tín hiệu mồ côi chưa gán thiết bị, thiết bị thiếu tín hiệu bắt buộc | P0 |
| FR-107 | Import SimaticML/PLCopen XML (LAD/FBD/SCL) với **Compatibility Report** liệt kê lệnh/block không hỗ trợ | P1 |
| FR-108 | Import L5X (Rockwell), PLCopen XML (ABB) | P1 |

### M2 — Controller Runtime (Chế độ A: Built-in Soft-PLC)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-201 | Pipeline: Source (SCL/LAD) → AST → **IR vendor-neutral** → interpreter. IR là danh sách lệnh typed (xem 9.M2.1) | P0 |
| FR-202 | Mô hình bộ nhớ Siemens: vùng I/Q/M, DB (global + instance), kiểu dữ liệu cơ bản + Array/Struct/UDT, địa chỉ tuyệt đối và symbolic | P0 |
| FR-203 | Mô hình thực thi: OB1 (cyclic), OB100 (startup), cyclic interrupt OB30–38 và OB ≥123 (chu kỳ cấu hình), FC/FB/multi-instance, lời gọi lồng nhau | P0 |
| FR-204 | Scan semantics: input process image latch; output process image ghi cuối scan; hỗ trợ `:P` (truy cập trực tiếp I/O) ở P1 | P0 |
| FR-205 | Timer IEC (TON, TOF, TP, TONR) và counter (CTU, CTD, CTUD) chạy theo **sim clock**, không theo wall clock | P0 |
| FR-206 | Tập lệnh theo Phụ lục A; lệnh chưa hỗ trợ → lỗi biên dịch rõ ràng ghi tên lệnh + vị trí, không bao giờ im lặng bỏ qua | P0 |
| FR-207 | Retentive memory + warm/cold restart; STOP/RUN; reset | P1 |
| FR-208 | PID_Compact mô phỏng đơn giản (P, PI, PID, anti-windup, manual/auto, output limit) có tài liệu rõ sai khác so với hãng | P1 |
| FR-209 | Online debug: breakpoint theo network/dòng SCL, step 1 scan, watch, force, trace buffer | P1 |
| FR-210 | Đo **scan time mô phỏng** (số lệnh × chi phí quy ước cấu hình được) để cảnh báo logic quá nặng; không giả vờ bằng với CPU thật | P2 |

#### 9.M2.1 IR (đặc tả tối thiểu)
- Instruction typed (Bool/Int/DInt/Real/LReal/Time/...), toán hạng: `Ref(tag|mem address|local|const)`.
- Op nhóm: Load/Store, bit logic, compare, arithmetic, convert, shift/rotate, jump/label, call (FC/FB), return, timer/counter intrinsics, system function (`NORM_X`, `SCALE_X`, `LIMIT`, `MIN`, `MAX`...).
- Quy tắc tràn số/ép kiểu theo ngữ nghĩa Siemens (INT 16-bit wrap hay lỗi, REAL IEEE-754 32-bit): ghi vào `docs/semantics.md`, có test cho từng quy tắc.

### M3 — Coding (editor)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-301 | Editor SCL (Monaco): highlight, autocomplete theo tag/block/symbol, lỗi biên dịch inline | P0 |
| FR-302 | Editor LAD tập con: contact NO/NC, coil, set/reset, TON/TOF/CTU, compare, MOVE, nhiều network, comment; lưu dạng JSON graph; chuyển đổi LAD → IR | P0 |
| FR-303 | Online view: highlight đường dẫn dòng điện (LAD) và giá trị biến (SCL) khi chạy | P1 |
| FR-304 | Editor FBD (React Flow) | P1 |
| FR-305 | Watch table, force table, trace/oscilloscope (uPlot) | P0 (watch), P1 (trace) |
| FR-306 | Block library mẫu (FB_Motor, FB_Valve, FB_Analog, FB_Group) theo style phổ biến trong xi măng | P1 |

### M4 — Plant Model (trọng tâm của VC)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-401 | `PlantEngine` chạy các `EquipmentModel` theo bước cố định; đọc/ghi tín hiệu qua `IoBus`; deterministic | P0 |
| FR-402 | Thư viện thiết bị P0 (chi tiết Phụ lục B): motor DOL, motor VFD, van on/off, van điều khiển, damper, cảm biến analog (first-order lag + noise tùy chọn), switch (level/zero-speed/pull-cord/limit), silo/bin level, băng tải đơn giản | P0 |
| FR-403 | Mỗi model khai báo: tín hiệu in/out, tham số (zod), trạng thái nội bộ, **danh sách fault có thể tiêm** (overload trip, no run feedback, stuck valve, sensor drift, signal loss, wire break, VFD fault...) | P0 |
| FR-404 | Fault injection tại thời điểm cố định/điều kiện/ngẫu nhiên có seed; có thể bật/tắt từ UI và từ test | P0 |
| FR-405 | Ghép thiết bị với tín hiệu bằng UI dạng bảng + gợi ý tự động (FR-105); kiểm tra thiếu/thừa tín hiệu | P0 |
| FR-406 | Process model mức khối lượng đơn giản: bin/silo tích phân lưu lượng vào – ra, băng tải vận chuyển có trễ vận chuyển, feeder; quan hệ qua `process.yaml` | P1 |
| FR-407 | Thư viện mở rộng theo đơn vị xi măng: crusher, apron feeder, mill (dòng điện – tải), fan + damper + áp suất, kiln drive, clinker cooler (grate drive, fan, nhiệt độ), bag filter | P1 |
| FR-408 | Người dùng tự định nghĩa model mới bằng TypeScript sandbox hoặc DSL (P1); có validator | P1 |
| FR-409 | Nhập tham số thiết bị từ motor list/instrument list (Excel) | P1 |

### M5 — Test Automation và báo cáo FAT

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-501 | **DSL test bằng YAML** (Phụ lục C): `setup`, `steps` (set tag, wait, inject fault, call sequence), `expect` (assert tag/eq/range/within-time/never/stable-for), `teardown` | P0 |
| FR-502 | Test runner chạy headless (CLI `vcs test`) và trong UI; **time acceleration**; kết quả deterministic | P0 |
| FR-503 | **Auto-generate test từ C&E matrix**: với mỗi cause tạo test "kích cause → mong đợi effect trong T giây, và không có effect ngoài matrix" | P0 |
| FR-504 | Test template cho motor: start/stop bình thường, start khi có inhibit, trip khi overload, mất feedback → fault sau timeout, local/remote | P0 |
| FR-505 | Test sequence template: group start theo thứ tự ngược chiều dòng vật liệu, group stop, trip một thiết bị giữa chừng → dừng đúng nhóm | P1 |
| FR-506 | Báo cáo FAT **HTML** (P0), **PDF/XLSX** (P1): tổng quan, danh sách test, pass/fail, thời gian, bằng chứng (trace tag quanh thời điểm assert), **truy vết** requirement/C&E row/I/O → test → kết quả | P0 |
| FR-507 | Coverage: % tag I/O đã được kích ít nhất 1 lần, % hàng C&E đã test, % thiết bị đã test fault | P1 |
| FR-508 | Record/Replay: ghi toàn bộ input/force/fault + seed; chạy lại cho kết quả giống hệt | P1 |
| FR-509 | Snapshot/restore trạng thái mô phỏng, "điểm kiểm tra" giữa chừng sequence | P1 |
| FR-510 | Chạy test trong CI (GitHub Actions/GitLab) với exit code và JUnit XML | P1 |

### M6 — Communication Gateway

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-601 | **OPC UA server**: expose tag của VCS theo cấu trúc folder cấu hình được; có read/write/subscription; cho SCADA/HMI thật kết nối | P0 |
| FR-602 | **OPC UA client** (Controller Adapter chế độ B): đọc/ghi node của PLC/PLCSIM, ánh xạ node ↔ tag | P0 |
| FR-603 | **Modbus TCP** server (map tag → holding/coil/input) và client (adapter) | P0 |
| FR-604 | Quản lý giao tiếp UI: trạng thái kết nối, thống kê, log frame (bật/tắt), cấu hình mapping dạng bảng | P0 |
| FR-605 | **Bridge Agent (Windows/.NET) cho PLCSIM Advanced**: tạo/khởi động instance, nạp chương trình đã biên dịch, đọc/ghi tag, đồng bộ bước theo sim clock (khi API cho phép) | P1 |
| FR-606 | S7 (Snap7 – PUT/GET) client/server cho S7-300/400/1200/1500 non-optimized DB; nêu rõ giới hạn S7comm-plus | P1 |
| FR-607 | EtherNet/IP (CIP) cho Rockwell | P1 |
| FR-608 | Chế độ đồng bộ thời gian giữa sim clock và controller ngoài (ngoài là real-time → timeScale bị khóa = 1, UI cảnh báo) | P0 |

> Lưu ý cho AI: trình duyệt không mở được TCP thô; mọi giao thức chạy ở **server** hoặc **Bridge Agent**, UI chỉ nhận dữ liệu qua WebSocket.

### M7 — HMI

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-701 | Screen designer kéo thả (SVG): nút (momentary/toggle), đèn trạng thái, numeric display/input, bar/gauge, text, hình cơ bản | P0 |
| FR-702 | Thư viện symbol công nghiệp: motor, valve, fan, conveyor, silo, mill, crusher, pipe/line; biến thể trạng thái (stopped/running/fault/auto-manual) theo tag | P0 |
| FR-703 | Binding widget ↔ tag, có biểu thức đơn giản (`tag > 5`, scaling) và điều kiện hiển thị | P0 |
| FR-704 | Trend (uPlot) nhiều pen, scroll thời gian; export CSV | P1 |
| FR-705 | Alarm list (priority, ack, active/cleared, history) dựa trên điều kiện tag | P1 |
| FR-706 | Faceplate chuẩn cho motor/van/analog (popup điều khiển Auto/Manual, Start/Stop, trạng thái) | P1 |
| FR-707 | Chế độ **Runtime-only** (khóa chỉnh sửa) để người witness FAT dùng | P1 |
| FR-708 | User level cơ bản (Operator/Engineer) | P2 |

### M8 — Điều khiển mô phỏng

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-801 | Run/Pause/Step (1 scan/1 step)/Reset; thanh điều khiển luôn hiện | P0 |
| FR-802 | Time scale: 1x, 2x, 10x, 100x, max; hiển thị "tốc độ thực đạt được" | P0 |
| FR-803 | Force tag (có đánh dấu và danh sách đang force), bỏ force hàng loạt | P0 |
| FR-804 | Event log: thay đổi tag quan trọng, fault tiêm, assert, lỗi runtime | P0 |
| FR-805 | Nhiều controller trong cùng dự án (ví dụ PLC1 builtin + PLC2 external) | P1 |

---

## 10. Yêu cầu phi chức năng

| ID | Yêu cầu | Ngưỡng |
|---|---|---|
| NFR-01 | Hiệu năng kernel (chế độ A) | ≥ 5.000 tag, ≥ 500 thiết bị, bước 10 ms chạy ≥ 10x realtime trên laptop phổ thông; mục tiêu 100x với dự án demo |
| NFR-02 | Determinism | Cùng dự án + cùng seed + cùng input → cùng kết quả bit-by-bit (trừ timestamp wall clock) |
| NFR-03 | Độ trễ UI | Cập nhật giá trị HMI ≤ 200 ms ở 1.000 tag đang subscribe; batching thay đổi |
| NFR-04 | Độ tin cậy | Lỗi trong một model/test không làm sập kernel; có watchdog và thông báo |
| NFR-05 | Khả năng tái lập | File dự án đủ để tái hiện kết quả test; version schema + migration |
| NFR-06 | Bảo mật | Chạy on-prem; không gửi dữ liệu dự án ra ngoài mặc định; không telemetry bắt buộc; secret trong env |
| NFR-07 | Khả năng mở rộng | Thêm EquipmentModel/ProtocolGateway/VendorAdapter không sửa core |
| NFR-08 | Chất lượng mã | TS strict, ESLint, coverage kernel ≥ 80% dòng |
| NFR-09 | Tài liệu | Mỗi package có README, ví dụ chạy được |
| NFR-10 | i18n | UI tiếng Anh + tiếng Việt (chuỗi tách file) |

---

## 11. Bảo mật, sở hữu trí tuệ, pháp lý

- Dữ liệu dự án của khách hàng là bí mật: mặc định **không** upload đi đâu; nếu thêm tính năng AI/cloud sau này phải opt-in, có vùng dữ liệu rõ ràng.
- Không bao gồm code/thư viện/tài liệu bản quyền của Siemens, Rockwell, ABB trong repo. Ngữ nghĩa lệnh được cài lại độc lập từ tài liệu công khai.
- Không bypass block know-how protection/license; importer chỉ đọc file người dùng có quyền.
- Cần kiểm tra **điều khoản license** của PLCSIM Advanced/TIA Openness trước khi phát hành Bridge Agent thương mại.
- Ghi rõ trên UI và báo cáo: *"Kết quả mô phỏng không thay thế SAT; mức độ tương thích tùy chế độ controller"*.
- Bản quyền thư viện bên thứ ba: kiểm tra license (MIT/Apache) trước khi dùng.

---

## 12. UX tổng quan (màn hình chính)

1. **Dashboard dự án:** trạng thái, controller, test gần nhất, cảnh báo chất lượng I/O.
2. **I/O & Tag Manager:** bảng lớn (virtual scroll), lọc, import/mapping, kiểm tra lỗi.
3. **Plant Designer:** danh sách thiết bị + bảng gán tín hiệu; canvas sơ đồ (P1).
4. **PLC Workspace:** cây block, editor SCL/LAD, watch/force.
5. **HMI Designer/Runtime.**
6. **Test Center:** danh sách test (auto-generated vs thủ công), chạy, kết quả, báo cáo.
7. **Communications:** gateway, mapping, log.
8. **Simulation bar (luôn hiện):** run/pause/step/reset/time scale/sim clock.

Nguyên tắc UI: dày thông tin kiểu công cụ kỹ thuật (dense), phím tắt, xử lý bảng lớn tốt, dark mode.

---

## 13. Lộ trình và milestone (mỗi milestone có demo + tiêu chí nghiệm thu)

### M0 — Skeleton (1–2 tuần công)
Monorepo, CI, schemas, TagDB, SimClock, vòng lặp mô phỏng rỗng, server + web tối thiểu hiển thị tag.
**Nghiệm thu:** `pnpm test` xanh; web hiển thị danh sách tag từ `examples/`, nút Run tăng sim clock.

### M1 — Soft-PLC lõi + bit logic + timer (2–3 tuần)
Parser/IR/interpreter SCL tập con và LAD tập con; OB1; I/Q/M; TON/TOF/TP; CTU/CTD; R_TRIG/F_TRIG; SR/RS.
**Nghiệm thu:** ≥ 60 golden test ngữ nghĩa (mục 16) pass; demo `motor-interlock`: nút start/stop + overload hoạt động đúng bằng force tag.

### M2 — Plant Engine + thư viện thiết bị cơ bản (2–3 tuần)
Motor DOL/VFD, van, cảm biến, switch, silo; IoBus; fault injection; import I/O list + column mapping + auto-suggest thiết bị.
**Nghiệm thu:** import I/O list mẫu 300 tín hiệu → tạo đúng thiết bị ≥ 90% theo quy ước tên; motor demo chạy với feedback có trễ, fault tiêm được.

### M3 — Test Automation + báo cáo FAT (2–3 tuần)
DSL YAML, runner, assertion, time scale, auto-test từ C&E, báo cáo HTML, CLI headless.
**Nghiệm thu:** demo `crusher-sequence` (≥ 6 motor, interlock C&E 20 hàng): auto-sinh ≥ 20 test, báo cáo HTML đầy đủ, **cố tình cài lỗi logic → test bắt được lỗi**.

### M4 — Comms P0 + HMI cơ bản (3–4 tuần)
OPC UA server/client, Modbus TCP, trang Communications; HMI designer + runtime + symbol motor/valve.
**Nghiệm thu:** SCADA/OPC UA client công khai (UaExpert hoặc tương đương) đọc/ghi tag VCS; một PLC ngoài giả lập (OPC UA server mẫu) điều khiển plant model qua adapter chế độ B.

### M5 — Siemens integration (P1) (4–6 tuần)
Bridge Agent PLCSIM Advanced, Snap7, importer SimaticML + Compatibility Report, trend/alarm/faceplate.
**Nghiệm thu:** chạy được một dự án TIA thật (đã được chủ sản phẩm cung cấp, ẩn danh) với plant model VCS qua PLCSIM Advanced; báo cáo FAT sinh ra từ chế độ B.

### M6 — Clinker cooler lite (demo giá trị) (3–4 tuần)
Model grate drive/fan/damper/áp suất/nhiệt độ đơn giản; sequence start/stop; PID_Compact đơn giản.
**Nghiệm thu:** demo sequence đầy đủ + 10 kịch bản fault.

### M7+ — Rockwell, ABB, 3D, multi-user, cloud (P1/P2)
Mỗi hãng: VendorAdapter + importer + ControllerAdapter + tập lệnh + test tương ứng.

> Ước lượng là thời gian cho một người định hướng + AI coding; điều chỉnh theo thực tế. Không bắt đầu M(n+1) khi M(n) chưa đạt nghiệm thu.

---

## 14. Thứ tự prompt gợi ý cho vibe coding (copy từng prompt)

**Prompt 0 (setup):**
> Đọc PRD.md. Tạo monorepo theo mục 7.2 với pnpm + Turborepo + TypeScript strict, Vitest, ESLint, Prettier. Cài đặt các interface ở mục 8.4 trong `packages/kernel` và `packages/schemas` (zod). Chưa làm tính năng nào khác. Viết test cho TagDB và SimClock. Dừng lại và liệt kê những gì còn thiếu.

**Prompt 1 (SCL parser):**
> Trong `packages/vendor-siemens`, cài parser SCL bằng Chevrotain cho tập con ở Phụ lục A (IF/CASE/FOR/WHILE, biểu thức, gán, gọi FC/FB, khai báo VAR_INPUT/OUTPUT/IN_OUT/TEMP/STATIC, kiểu cơ bản, Array, Struct). Xuất AST có type. Viết ≥ 40 test parse + 10 test lỗi cú pháp có thông báo vị trí.

**Prompt 2 (IR + interpreter):**
> Trong `packages/runtime-iec`, định nghĩa IR theo mục 9.M2.1 và interpreter (compile AST → closures). Hỗ trợ OB1, FC, FB (instance DB), timer/counter theo SimClock, process image input/output theo mục 8.5. Mỗi ngữ nghĩa (tràn INT, chia 0, REAL→INT làm tròn...) phải có test và dòng trong `docs/semantics.md`.

**Prompt 3 (LAD):** tương tự, JSON graph → IR.
**Prompt 4 (Plant engine):** motor_dol, motor_vfd, valve_onoff, analog_sensor theo Phụ lục B; test từng fault.
**Prompt 5 (Import I/O list):** column mapping UI + auto-suggest theo quy ước tên.
**Prompt 6 (Test DSL + runner + C&E auto-generate + HTML report).**
**Prompt 7 (OPC UA server/client + Modbus).**
**Prompt 8 (HMI).**
Mỗi prompt kết thúc bằng: *"Chạy toàn bộ test, báo cáo kết quả, cập nhật README package, không sửa code của package khác trừ khi cần và phải nêu lý do."*

---

## 15. Quy tắc cho AI coding assistant

1. **Một milestone/prompt mỗi lần.** Không refactor lớn ngoài phạm vi.
2. TypeScript strict, không dùng `any` (trừ ranh giới I/O đã validate bằng zod).
3. Mọi thay đổi hành vi kernel phải có test; **không sửa test cho xanh** mà không giải thích.
4. Không thêm thư viện lớn khi chưa nêu lý do; ghi quyết định vào `docs/adr/NNNN-title.md`.
5. Không hard-code đường dẫn/secret; cấu hình qua env + file dự án.
6. Mọi lỗi người dùng phải có thông báo hành động được (nói rõ file/dòng/tag).
7. Không "mô phỏng im lặng": lệnh/tính năng chưa hỗ trợ → báo lỗi tường minh.
8. Hiệu năng: không cấp phát đối tượng trong vòng lặp nóng; dùng typed array/Map khi cần; có benchmark (`pnpm bench`) cho kernel.
9. Kernel không import gì từ UI/Node-only; chỉ `apps/server` được dùng API Node-only.
10. Commit nhỏ, message rõ (`feat(kernel): ...`).

**Definition of Done (mọi task):** build xanh, test xanh, lint xanh, README/doc cập nhật, ví dụ trong `examples/` chạy được, không có TODO không có issue đi kèm.

---

## 16. Chiến lược kiểm thử sản phẩm

- **Golden tests ngữ nghĩa PLC:** thư mục `packages/runtime-iec/golden/` chứa chương trình nhỏ + chuỗi input theo scan + output kỳ vọng (viết tay dựa trên tài liệu công khai và quan sát từ PLCSIM thật của chủ sản phẩm). Đây là "chân lý" khi AI không chắc về ngữ nghĩa.
- **Test đối chiếu (conformance):** chạy cùng chương trình trên VCS builtin và trên PLCSIM Advanced (khi có) và so sánh trace; sai khác ghi vào `docs/compat-matrix.md`.
- **Property-based test** cho timer/counter/edge detection.
- **Dự án mẫu end-to-end** (`examples/`) chạy trong CI bằng CLI.
- **Playwright e2e** cho luồng: import I/O → gán thiết bị → run → test → báo cáo.

---

## 17. Rủi ro và giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Tự viết interpreter không tương đương PLC thật | Cao | Kiến trúc hai chế độ (mục 3.2); Compatibility Report; golden + conformance test; định vị chế độ A là "lightweight" |
| License/điều khoản PLCSIM Advanced, TIA Openness | Trung bình | Xem điều khoản sớm; Bridge Agent là module riêng, tắt được |
| S7comm-plus không mở | Trung bình | Dùng OPC UA/PUT-GET/PLCSIM API; ghi rõ giới hạn |
| Scope creep (coding + HMI + comms + plant + test) | Cao | Milestone cứng; ưu tiên plant + test (M2–M3) trước HMI/coding nâng cao |
| Chất lượng I/O list thực tế rất lộn xộn | Cao | Column mapping, auto-suggest + review hàng loạt, báo cáo chất lượng (FR-106) |
| Plant model quá đơn giản → test không thuyết phục | Trung bình | Bắt đầu ở mức tín hiệu/thời gian trễ (đủ cho interlock/sequence), mở rộng dần process model |
| AI sinh code sai ngữ nghĩa PLC tinh vi | Cao | Golden tests do chủ sản phẩm duyệt; mọi thay đổi ngữ nghĩa phải sửa `docs/semantics.md` |
| Hiệu năng JS khi dự án lớn | Trung bình | Benchmark từ M1; interface cho phép thay lõi bằng Rust/WASM |

---

## 18. Câu hỏi mở (chủ sản phẩm cần trả lời trước/trong M1–M3)

1. Mô hình kinh doanh: công cụ nội bộ cho công ty, sản phẩm bán cho EPC/vendor, hay dịch vụ? (ảnh hưởng license, đa người dùng, cloud.)
2. Quy ước đặt tên tag/thiết bị thực tế đang dùng (KKS, quy ước nội bộ của dự án xi măng...)? Cần mẫu I/O list và C&E ẩn danh.
3. Dòng PLC ưu tiên: S7-1500 hay S7-1200 (hay S7-400 ở dự án cũ)? Có dùng F-CPU không?
4. Có sẵn license TIA Portal + PLCSIM Advanced để làm test đối chiếu không?
5. SCADA/HMI thật nào cần kết nối (WinCC, PCS7, Ignition, hãng khác)?
6. Ưu tiên unit demo đầu tiên: crusher sequence, clinker cooler, hay mill?
7. Ngôn ngữ UI/tài liệu chính: Việt hay Anh?
8. Có yêu cầu chạy offline hoàn toàn (không internet) không?

---

## Phụ lục A — Tập lệnh Siemens hỗ trợ (checklist)

**P0**
- Bit logic LAD/SCL: `AND/OR/XOR/NOT`, contact NO/NC, coil `=`, `S`/`R` (set/reset), `SR`/`RS` flip-flop, `R_TRIG`/`F_TRIG`, POS/NEG edge.
- Timer IEC: `TON`, `TOF`, `TP`, `TONR` (instance DB hoặc multi-instance, kiểu `TIME` ms).
- Counter IEC: `CTU`, `CTD`, `CTUD` (INT/DINT).
- So sánh: `=, <>, <, <=, >, >=` cho INT/DINT/REAL/TIME.
- Toán: `+ - * / MOD`, `ABS`, `SQRT`, `MIN`, `MAX`, `LIMIT`.
- Chuyển đổi: `INT_TO_REAL`, `REAL_TO_INT` (ngữ nghĩa làm tròn theo Siemens), `DINT_TO_REAL`, `BOOL_TO_INT`, `WORD_TO_INT`...
- Scaling: `NORM_X`, `SCALE_X`.
- Dịch/xoay bit: `SHL`, `SHR`, `ROL`, `ROR`; `AND/OR/XOR` word.
- Điều khiển luồng SCL: `IF/ELSIF/ELSE`, `CASE`, `FOR`, `WHILE`, `REPEAT`, `EXIT`, `CONTINUE`, `RETURN`.
- Gọi block: FC, FB (instance DB và multi-instance), tham số IN/OUT/IN_OUT.
- Kiểu: `Bool, Byte, Word, DWord, Int, DInt, Real, LReal, Time, String (cơ bản), Array, Struct, UDT`.
- OB: OB1, OB100, cyclic interrupt (OB30–38 và OB ≥ 123).

**P1:** `PID_Compact` (đơn giản hóa), `MOVE_BLK`, `FILL_BLK`, `SCATTER/GATHER`, chuỗi (`CONCAT`, `LEN`...), `RUNTIME`, `RD_SYS_T/WR_SYS_T`, `TIME_TCK`, retentive, `:P` access, S7-1500 optimized access, `LREAL` đầy đủ, `Variant` hạn chế.

**P2/Không hỗ trợ:** F-safety blocks, `MC_*` motion/technology objects, `TCON/TSEND/TRCV` (khi cần mô phỏng giao tiếp giữa PLC ↔ PLC sẽ làm riêng), Web server, Trace/Archive của CPU.

---

## Phụ lục B — Thư viện thiết bị P0 (tín hiệu và hành vi tối thiểu)

| Model | Tín hiệu từ PLC (cmd) | Tín hiệu về PLC (fb) | Hành vi | Fault có thể tiêm |
|---|---|---|---|---|
| `motor_dol` | `runCmd` | `runFb`, `ready`, `remote`, `fault/overload` | Trễ contactor start/stop (tham số), run feedback sau delay, trip khi overload | overload trip, no run feedback, feedback stuck, ready=false, local mode |
| `motor_vfd` | `runCmd`, `speedRef` (AO) | `runFb`, `speedFb` (AI), `fault`, `ready` | Ramp tăng/giảm tốc, speedFb theo first-order, giới hạn min/max | VFD fault, ramp fail, speed deviation, comm loss |
| `valve_onoff` | `openCmd`, `closeCmd` | `openLs`, `closedLs`, `fault` | Thời gian hành trình, limit switch, vị trí trung gian | stuck open/closed, LS fail, travel timeout |
| `valve_ctrl` | `posRef` (AO) | `posFb` (AI) | Trễ + giới hạn tốc độ | stuck, drift |
| `damper` | giống `valve_ctrl` | | | |
| `analog_sensor` | (nhận giá trị process từ process model hoặc test) | `raw` (AI) | first-order lag, noise tùy chọn, scaling raw↔eng | drift, stuck, wire break (raw<0/>max), spike |
| `switch_level / zero_speed / pull_cord / limit` | — | `di` | Điều kiện theo process/test, delay, debounce tùy chọn | stuck on/off |
| `silo_bin` | (từ process: lưu lượng in/out) | level analog + level switch (high/low) | tích phân lưu lượng, sinh level switch | sensor fault |
| `conveyor_simple` | motor model | zero-speed, pull-cord, belt-drift (tùy chọn) | trễ vận chuyển (tham số) | pull-cord, zero-speed trip |

Mỗi model: `paramsSchema` zod, tài liệu, ví dụ YAML, test fault đầy đủ.

---

## Phụ lục C — DSL test (ví dụ)

```yaml
id: CR01_M01_overload_trip
title: Motor CR01_M01 trip khi overload và dừng nhóm
requirement: [CE-012, FAT-4.2.1]
timeScale: 20
setup:
  - set: { CR01_AUTO_MODE: true }
  - run: sequence.startGroup CR01
  - wait: { until: "CR01_M01_RUN_FB == true", timeout: 30s }
steps:
  - inject: { equipment: CR01_M01, fault: overload, at: now }
  - wait: 2s
expect:
  - within: 3s
    assert: "CR01_M01_RUN_CMD == false"
    message: "Lệnh chạy phải về 0 khi overload"
  - within: 5s
    assert: "CR01_GROUP_TRIP == true"
  - never: "CR02_M01_RUN_CMD == false and CR01_M01_RUN_CMD == true"
  - stableFor: { assert: "CR01_ALARM_OVERLOAD == true", duration: 2s }
teardown:
  - clearFaults: all
  - reset: plant
```

Auto-generate từ C&E: mỗi hàng cause → file test với `requirement: [CE-<row>]`, `expect` cho các effect được đánh dấu và `never` cho các effect không được đánh dấu (có thể bật/tắt "never" vì tốn thời gian).

---

## Phụ lục D — Báo cáo FAT (nội dung tối thiểu)

1. Trang bìa: dự án, phiên bản dự án/PLC, hash commit, ngày chạy, người chạy, chế độ controller (A/B + chi tiết), seed.
2. Tổng quan: số test pass/fail/skip, thời gian, coverage (P1).
3. Bảng test: ID, tiêu đề, requirement/C&E row, kết quả, thời gian.
4. Chi tiết test fail: assert thất bại, giá trị tag trong cửa sổ trước/sau (biểu đồ nhỏ), log.
5. Truy vết: ma trận requirement ↔ test.
6. Phụ lục: danh sách tag đã force/inject, cấu hình giao tiếp, giả định và giới hạn mô phỏng.
7. Khung ký xác nhận (tên, chức danh, ngày).

---

## Phụ lục E — Thuật ngữ

- **VC:** Virtual Commissioning. **FAT/SAT:** Factory/Site Acceptance Test. **C&E:** Cause & Effect matrix.
- **OB/FB/FC/DB/UDT:** Organization Block / Function Block / Function / Data Block / User Data Type (Siemens).
- **PII/PIQ:** Process Image of Inputs/Outputs.
- **PLCSIM Advanced:** bộ mô phỏng PLC S7-1500 của Siemens có API và mạng ảo.
- **Controller Adapter:** thành phần nối kernel với một controller (nội bộ hoặc ngoài).
- **Plant model:** mô hình thiết bị/quá trình phía hiện trường.
