# PACKAGE-RULES — Quy tắc riêng theo package

## Mục lục

- [`@vcs/schemas` (M0 §4)](#vcsschemas-m0-4)
- [`@vcs/kernel` (M0 §6, M4 §4)](#vcskernel-m0-6-m4-4)
- [`@vcs/project` (M0 §5)](#vcsproject-m0-5)
- [`@vcs/test-utils` (M0 §7)](#vcstest-utils-m0-7)
- [`@vcs/expr` (M3 §5, M4 §11.3)](#vcsexpr-m3-5-m4-113)
- [`@vcs/runtime-iec` + `@vcs/vendor-siemens` (M1, M5 §9)](#vcsruntime-iec-vcsvendor-siemens-m1-m5-9)
- [`@vcs/plant` (M2 §3–7)](#vcsplant-m2-37)
- [`@vcs/importers` (M2 §8–9)](#vcsimporters-m2-89)
- [`@vcs/testing` (M3)](#vcstesting-m3)
- [`@vcs/comms` (M4, M5 §6–7)](#vcscomms-m4-m5-67)
- [`@vcs/hmi` + `apps/web` (M4 §11)](#vcshmi-appsweb-m4-11)
- [`apps/server` (M0 §8.2, M4 §10)](#appsserver-m0-82-m4-10)
- [`apps/cli` (M0 §8.1)](#appscli-m0-81)
- [`apps/web` (M0 §8.3, M4 §11.7)](#appsweb-m0-83-m4-117)
- [`tools/bridge-agent` (M5 §5) — .NET Framework 4.8 x64](#toolsbridge-agent-m5-5-net-framework-48-x64)
- [`tools/tia-export` (M5 §8) — .NET Framework 4.8 x64](#toolstia-export-m5-8-net-framework-48-x64)

> Khi một package được tạo, **copy mục tương ứng thành `packages/<tên>/AGENTS.md`** (công cụ AI thường đọc file gần nhất với thư mục đang sửa). Quy tắc chung nằm ở `AGENTS.md` gốc; ở đây chỉ có **bất biến riêng** và **lỗi hay gặp**. Nguồn chi tiết: spec trong ngoặc.

---

## `@vcs/schemas` (M0 §4)
- Thuần: không I/O, không phụ thuộc package nội bộ. Chứa `DataType`, `TagValue`, `Diagnostic`, `DiagnosticCatalog`, `parseDuration`, `parseYamlWithSchema`, schema project/tags/protocol.
- **Lỗi YAML phải có dòng/cột** (ánh xạ `issue.path` → node YAML). Khóa lạ = cảnh báo `PRJ-W001` + gợi ý "ý bạn là…", **không** lỗi.
- `TagDef` ở dạng cuối (`equipment`, `role`, `provenance`, `origin`; `address` có thể `sym:`...). Thêm trường = thêm schema + test + migration note.
- Mã chẩn đoán mới phải `defineDiagnostics(...)`; `check-diagnostic-codes` sẽ fail nếu phát mã chưa đăng ký.
- *Hay sai:* ném lỗi thay vì trả `Diagnostic`; dùng `Date.now` để gắn thời gian; schema quá chặt làm hỏng tương thích tiến.

## `@vcs/kernel` (M0 §6, M4 §4)
- `TagDB`: handle, `get/set` không cấp phát, `flush()` theo lô đúng quy tắc (dirty theo thứ tự handle; chỉ phát khi khác lần flush trước; `writes` đếm số lần ghi). `checkWrite` luôn có; `enforceOwnership` chỉ dev/test.
- `SimulationOrchestrator`: **đúng thuật toán một bước** (M0 §6.7). Không timer/đồng hồ thật. `post()` chạy đầu bước kế; `snapshotAll` ném khi inbox không rỗng; `isolate` đánh dấu component lỗi, không sập.
- `ControllerAdapter.step` có thể đồng bộ **hoặc** Promise; `stepOnce()` ném `SIM-E002` nếu gặp Promise. (M5: `asyncStep`, `requiresAsync()`.)
- `Pacer` nhận `now()` từ ngoài; không ảnh hưởng logic.
- `TagBroker` (M4): đọc I/Q từ TagDB, M/DB từ introspection; ghi theo bảng luật M4 §4.2; poll M/DB **chỉ cho tag có subscriber**.
- *Hay sai:* thông báo ngay khi `set` (phải trì hoãn tới `flush`); cấp phát mảng trong `flush` khi không có subscriber; quên `reset()` xóa inbox/faulted; hash trace phụ thuộc thứ tự `Map`.

## `@vcs/project` (M0 §5)
- `ProjectFS` trừu tượng (`nodeFS`, `memoryFS`); đường dẫn luôn `/`. `loadProject` **không ném** vì dữ liệu sai — trả `diagnostics`.
- `hashText` chuẩn hóa BOM/CRLF → cùng hash trên Windows/Linux.
- *Hay sai:* dùng `path.join` làm khóa; đọc file đồng bộ trong đường nóng; hash trước khi chuẩn hóa EOL.

## `@vcs/test-utils` (M0 §7)
- Mọi test của các milestone dùng lại `makeSim`, `defineTags`, `FakeController`, `recordChanges`, `waitFor`. Không tự dựng bản riêng.

## `@vcs/expr` (M3 §5, M4 §11.3)
- Ngôn ngữ biểu thức **thuần**, resolver tiêm vào; compile → closure, tag resolve thành chỉ số lúc compile; không `eval`, không truy cập global.
- HMI chỉ dùng tập con (không `@obs`, `prev/rose/fell/since`).
- Lỗi có vị trí chính xác + gợi ý gần nhất (`TS-E001`).

## `@vcs/runtime-iec` + `@vcs/vendor-siemens` (M1, M5 §9)
- IR là **cây có kiểu, serializable JSON**; interpreter compile IR → closures **một lần**.
- Số học theo bảng M1 §7.2 (Int wrap hai-bù, Real `fround`, chia nguyên cắt về 0, chia 0 → 0 + `RuntimeFault`). Mọi quy tắc có dòng trong `docs/semantics.md` + test.
- Timer/counter chạy theo `now` của scan; trạng thái nội bộ trong instance DB. Timer **không** "đóng băng" khi không được gọi — dùng timestamp (M1 §9.3).
- `SoftPlc.step` **đồng bộ**. Cài `ControllerIntrospection` (read/write/force/RUN-STOP) ngay từ M1.
- LAD và SimaticML FlgNet **dùng chung interpreter** (không có interpreter riêng). SCL từ SimaticML: dựng text → **parser M1**.
- Lệnh chưa hỗ trợ → `SCL-U001`/`SML-U003` có vị trí, không bỏ qua im lặng.
- *Hay sai:* dùng `Date.now` cho timer; quên latch input; ghi `%Q` ra ngoài ngay giữa scan; endianness; `>>> 0` cho DWord; không `fround` Real.

## `@vcs/plant` (M2 §3–7)
- Model làm việc bằng **eng units**; `adapter.ts` scale raw↔eng (0..27648; kẹp [-4864, 32511] `VERIFY`). `S` (state) JSON-serializable.
- PRNG seeded `mulberry32(seed, equipmentId)`; **cấm** `Math.random`. Duyệt thiết bị theo id/topo, không theo thứ tự `Map`.
- `FaultManager`: equipment fault + signal fault; thứ tự áp signal fault cố định (M2 §6.2). `faults.advance(T)` là bước đầu của `PlantEngine.step` (không có pha riêng).
- Không cấp phát trong `step`; tag tra bằng chỉ số lúc `init`.
- *Hay sai:* model đọc tag theo tên mỗi bước; quên polarity NC/NO; link vòng; `ready/remote` không phản ánh fault.

## `@vcs/importers` (M2 §8–9)
- Hàm thuần (đọc → sniff → mapping → transform → normalize → validate → diff → commit). Re-import **idempotent**; không ghi đè `provenance: manual`.
- Auto-suggest: heuristic **giải thích được** (`reasons[]`), không ML/LLM; role/synonym lấy từ `plant/registry`.
- Địa chỉ: chuẩn hóa `E/A` (Đức) → `I/Q`; chồng lấn kiểm bằng bitmap.

## `@vcs/testing` (M3)
- Executor: máy trạng thái `READY/WAIT_TIME/WAIT_COND/WAIT_EXP`; kỳ vọng `within` chặn, `never` nền, `assert` không chặn. Teardown luôn chạy.
- Runner hỗ trợ orchestrator async (M5) và `isolation: baseline | reset | none`; `TS-E040` chỉ cho adapter ngoài không tất định.
- Sinh test: tất định từng byte, `--check` cho CI; `UNBOUND` luôn có lý do; negative checks `scoped` mặc định; `inhibit` luôn kèm test đối chứng dương.
- Báo cáo: HTML tự chứa, SVG vẽ bằng code, in A4, bất biến byte; `projectHash`/`resultsHash`.
- `TestHost` định tuyến ghi: I/Q → TagDB (`checkWrite('test')`); M/DB → `ControllerIntrospection.write` (xem AMENDMENTS §D).
- *Hay sai:* quan sát trước khi PLC scan xong; thời gian wall lẫn vào `hash`; sửa file `tests/generated/**` bằng tay.

## `@vcs/comms` (M4, M5 §6–7)
- Modbus/S7: codec **thuần** tách khỏi mạng; ghi **tất-cả-hoặc-không** mỗi yêu cầu; ghi một phần tag nhiều-word bị từ chối.
- OPC UA server: ghi từ client → `broker.write(…,'gateway')` → mã trạng thái theo bảng M4 §7.4; node id sơ đồ `s7-1500`/`vcs`; PKI + quy trình Trust.
- Adapter ngoài: `step()` đồng bộ + cache + vòng nền (khung `ExternalAdapterBase`); mất kết nối → giữ giá trị + `quality 'bad'`; lockstep PLCSIM là `asyncStep`.
- Mật khẩu từ biến môi trường; log ẩn bí mật; bind `127.0.0.1` mặc định.
- *Hay sai:* ghi thẳng TagDB từ callback mạng; chặn event loop; quên `stop()` đóng sạch; test phụ thuộc cổng cố định.

## `@vcs/hmi` + `apps/web` (M4 §11)
- `hmi` thuần (schema, validate, symbol, sanitizer, compile binding); React nằm ở `apps/web`.
- JSON màn hình **tất định** (khóa cố định, 2 dấu cách, LF, tọa độ ≤ 2 chữ số thập phân); chỉ designer/API ghi.
- Sanitizer allowlist: cấm `script`, `foreignObject`, `style`, `on*`, `href` ngoài `#id`, `javascript:`/`data:`. Vi phạm → `HMI-E005`, không render.
- Nút `momentary` nhả khi nhả chuột/rời nút/mất focus/mất WS (server cũng nhả khi WS đóng). Điều khiển bị vô hiệu khi tag không `writable`.
- Không dựa **chỉ** vào màu để biểu đạt trạng thái.

## `apps/server` (M0 §8.2, M4 §10)
- `SimulationService` sở hữu vòng chạy + `Pacer`; lệnh áp dụng **giữa các lát**; `errorPolicy: 'isolate'`. Dùng `stepOnceAsync` khi `requiresAsync()`.
- WS: schema zod chung; `tags.delta` gom last-write-wins theo nhịp; kiểm Origin/kích thước/số kết nối. Endpoint ghi cần Origin (+ token nếu đặt).

## `apps/cli` (M0 §8.1)
- Mỗi lệnh một file trong `src/commands/`; mã thoát: 0 ok, 1 FAIL, 2 lỗi, 3 sai tham số. `--json` cho máy đọc.

## `apps/web` (M0 §8.3, M4 §11.7)
- Chỉ import `@vcs/schemas`, `@vcs/expr`, `@vcs/hmi`. Cập nhật giá trị gom theo `requestAnimationFrame`; selector theo từng tag; bảng ảo hóa; i18n vi/en; trợ năng (ARIA, tương phản).

## `tools/bridge-agent` (M5 §5) — .NET Framework 4.8 x64
- **Mọi lời gọi Siemens trên một luồng API chuyên trách**; có timeout; ánh xạ lỗi theo bảng. Build theo `PlcSimApiVersion` (6/7/8). DLL Siemens **không** vào repo (`Directory.Build.props` đọc biến môi trường).
- Backend `Fake` cho test; instance adopt không bao giờ bị hủy. Token HMAC khi không loopback; không log token.

## `tools/tia-export` (M5 §8) — .NET Framework 4.8 x64
- **Chỉ-đọc**: không Save/Import/Download; `--compile` mặc định tắt. Yêu cầu TIA offline; bỏ qua block know-how protected (ghi manifest), không vượt bảo vệ.
- Build theo `TiaVersion`; `manifest.json` có sha256 chuẩn hóa từng file.
