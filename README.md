# Virtual Commissioning Studio (VCS)

Nền tảng web mô phỏng điều khiển công nghiệp trước commissioning: soft-PLC
Siemens, plant model, test tự động từ I/O list + C&E, báo cáo FAT,
OPC UA/Modbus/S7, HMI, kết nối PLCSIM Advanced. Local-first, on-prem.

**Trạng thái:** Milestone **M0 đã hoàn thành tới P0.6** (P0.1–P0.6 đã merge vào
`develop`: repo + tooling, schemas + project, kernel, orchestrator + CLI,
server, web + e2e). P0.7 (tài liệu, ADR, hardening) đang làm. Xem tiến độ từng
prompt ở [`docs/STATE.md`](docs/STATE.md).

## Tài liệu

- Kiến trúc (đã triển khai ở M0): [`docs/architecture.md`](docs/architecture.md)
- Ngữ nghĩa mô phỏng (VERIFIED/UNVERIFIED): [`docs/semantics.md`](docs/semantics.md)
- Quyết định kiến trúc: [`docs/adr/`](docs/adr/) (0001–0007)
- Mã chẩn đoán (sinh tự động): [`docs/diagnostics.md`](docs/diagnostics.md)
- Luật làm việc cho AI agent và người đóng góp: [`AGENTS.md`](AGENTS.md)
- Hướng dẫn khởi động và cách vận hành: [`docs/KIT.md`](docs/KIT.md)
- Yêu cầu sản phẩm: [`docs/PRD.md`](docs/PRD.md)
- Trạng thái dự án: [`docs/STATE.md`](docs/STATE.md)
- Việc cần chủ sản phẩm: [`docs/OWNER-INBOX.md`](docs/OWNER-INBOX.md)

## Cài đặt

Yêu cầu: Node 22, pnpm 10.

```sh
pnpm install --frozen-lockfile
```

## Chạy ví dụ hello-tags

```sh
pnpm vcs serve examples/hello-tags
```

Mở `http://127.0.0.1:4170` — trang Tags hiển thị 12 tag của ví dụ
(`BTN_START`, `SW_AUTO`, `LAMP_RUN`, …). Nhấn **Run** để mô phỏng chạy
(`simTime` tăng, `SCAN_CNT` tăng, `LAMP_HEARTBEAT` nhấp nháy 500 ms);
**Pause** / **Step** (1 bước = 10 ms) / **Reset** để điều khiển; ô giá trị của
tag `free` (vd `BTN_START`) sửa được, ô tag thuộc controller có nút
**"Ghi thử"** (server từ chối với `TAG-E002`).

Chạy headless (không cần server):

```sh
pnpm vcs run examples/hello-tags --until 5s --hash
pnpm vcs validate examples/hello-tags
```

## Bảo mật cục bộ

- Server mặc định chỉ bind `127.0.0.1`, **không có xác thực** — chỉ dùng trên
  máy cục bộ hoặc mạng tin cậy. `--host 0.0.0.0` in cảnh báo.
- WebSocket kiểm tra `Origin` (chỉ localhost/origin dev đã cấu hình), giới
  hạn message ≤ 64 KB, tối đa 8 kết nối.
- Không đưa dữ liệu khách hàng thật (I/O list, C&E, chương trình PLC, DLL
  Siemens) vào repo hay công cụ AI khi chưa ẩn danh và được phép.

## Lệnh thường dùng

```sh
pnpm dev                  # chạy dev (turbo)
pnpm build                # build apps (turbo)
pnpm test                 # Vitest + coverage (ngưỡng M0 §13)
pnpm test:e2e             # Playwright e2e (cần build web trước)
pnpm lint                 # ESLint
pnpm typecheck            # tsc (root + web)
pnpm depcheck             # dependency-cruiser (đồ thị phụ thuộc M0 §3.5)
pnpm bench                # bench TagDB + orchestrator (M0 §12.4)
pnpm docs:diagnostics     # sinh lại docs/diagnostics.md
pnpm review:cheats        # quét "mùi lách luật"
```

Gate trước khi báo xong một prompt:
`lint && typecheck && depcheck && test && review:cheats`
(+ `test:e2e`, `bench` khi prompt yêu cầu).

## Cấu trúc

```
packages/schemas     kiểu chung, zod schema, Diagnostic + catalog
packages/kernel      ManualClock, TagDB, IoBus, TraceHasher, Orchestrator, Pacer, builder/extension, loopback demo
packages/project     ProjectFS, loadProject, hashText
packages/test-utils  defineTags/makeTags, makeSim, FakeClock, FakeController
apps/cli             lệnh vcs (version/validate/run/serve)
apps/server          REST + WebSocket, SimulationService
apps/web             UI React (1 trang Tags)
examples/hello-tags  ví dụ 12 tag, 1 controller demo
docs/specs           spec các milestone (M0–M5) + PRD
```
