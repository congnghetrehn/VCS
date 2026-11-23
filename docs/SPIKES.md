# SPIKES — Thử nghiệm nhỏ để giảm rủi ro (làm sớm, giới hạn thời gian)

> Spike = thí nghiệm **0.5–1 ngày** nhằm trả lời một câu hỏi có thể làm đổ kế hoạch. Kết quả ghi vào `docs/spikes/Sx-*.md` (mẫu cuối file) và cập nhật `OWNER-INBOX.md`/`STATE.md`. Spike **không** là mã sản phẩm: có thể bỏ.
> Spike cần phần cứng/phần mềm/ dữ liệu của anh sẽ được AI ghi thành mục 🔑 trong `OWNER-INBOX.md` kèm hướng dẫn từng bước; AI tiếp tục làm việc khác trong lúc chờ.

| ID | Câu hỏi cần trả lời | Làm trước | Ai làm | Quyết định bị ảnh hưởng |
|---|---|---|---|---|
| **S6** | Môi trường Windows của anh dựng được repo không? (Node, pnpm, Playwright, cổng, .NET SDK) | P0.1 | AI viết script kiểm; anh chạy | OS phát triển, CI, đường dẫn |
| **S1** | **Mã SCL/LAD thật** của anh dùng những cấu trúc/lệnh/kiểu nào? M1 phủ được bao nhiêu %? | P1.2 | Anh đưa mã; AI thống kê | Phạm vi M1 (STRING? mảng nhiều chiều? lệnh nào ưu tiên?) |
| **S4** | node-opcua có đạt 2 000 monitored item @100 ms với CPU ≤ 25%? | P4.4 | AI | Pull vs push (ADR) |
| **S5** | SCADA đích nối được server OPC UA mẫu kiểu `s7-1500` + policy bảo mật không? | P4.4 | Anh (có SCADA) + AI viết server mẫu | Mặc định bảo mật, `namespaceIndex`, quy trình Trust |
| **S2** | PLCSIM Advanced "hello": tạo/adopt instance, đọc/ghi bit & byte vùng, `RunToNextSyncPoint`, đo RTT/chu kỳ, kiểm giấy phép | trước M5 (tốt nhất sớm) | Anh + AI viết console C# | Khả thi lockstep, tên API bulk-I/O, tốc độ, giấy phép, môi trường CI |
| **S3** | TIA Openness xuất 1 block + 1 bảng tag: SimaticML trông thế nào ở bản TIA của anh? | trước P5.7 | Anh + AI viết exporter tối thiểu | Parser SimaticML, fixture, phiên bản hỗ trợ |

## S6 — Môi trường Windows (0.5 ngày)
- **Làm:** `scripts/doctor.mjs` kiểm: phiên bản Node/pnpm/git, quyền ghi, cổng 4170/4840/1502 rảnh, Playwright cài được trình duyệt, (tùy chọn) `dotnet --info`, mã hóa/ EOL git (`core.autocrlf`).
- **Đạt khi:** `pnpm install` + một test mẫu + một e2e mẫu chạy trên máy anh.
- **Đầu ra:** báo cáo + hướng dẫn khắc phục vào `docs/spikes/S6-env.md`.

## S1 — Khảo sát độ phủ ngôn ngữ trên mã thật (0.5–1 ngày)
- **Anh đưa:** ≥ 10 khối thật ẩn danh (SCL/LAD/FBD; xuất nguồn SCL từ TIA bằng "Generate source" nếu được) và danh sách các FB "kiểu công ty" (motor, valve, group).
- **AI làm:** script đếm cấu trúc (IF/CASE/FOR…), kiểu dữ liệu, lệnh/ FB hệ thống (TON/CTU/SCALE_X/…), việc dùng `STRING`, `ARRAY` nhiều chiều, `POINTER/ANY/VARIANT`, `ENO`, truy cập `:P`, `RD_SYS_T`…; so với M1 Phụ lục A; ước tính **% block chuyển được** và **top 10 lệnh/kiểu thiếu** (theo tần suất).
- **Đầu ra:** `docs/spikes/S1-coverage.md` + đề xuất điều chỉnh phạm vi M1 (SCR nếu cần).

## S4 — Bench node-opcua (0.5 ngày)
- **Làm:** server node-opcua 2 000 biến, client tạo 2 000 monitored item @100 ms, mô phỏng đổi 5% giá trị mỗi 100 ms; đo CPU, độ trễ cập nhật, bộ nhớ; thử **pull** (getter) vs **push** (`setValueFromSource`).
- **Đạt khi:** có số liệu đủ để chọn; ghi ADR.

## S5 — SCADA smoke test (0.5 ngày, cần SCADA)
- **Làm:** AI dựng server node-opcua mẫu có vài node `ns=3;s="Tag"` + `"DB"."Member"`, security None và Basic256Sha256; anh thử kết nối từ SCADA đích; ghi lỗi gặp (chứng chỉ, URI, hostname, policy).
- **Đầu ra:** `docs/spikes/S5-scada.md` + danh sách chính sách bảo mật được chấp nhận.

## S2 — PLCSIM Advanced "hello" (1 ngày, cần PLCSIM)
- **Anh:** cài PLCSIM Advanced, nhóm `PlcSimUsers`, tạo 1 instance, tải chương trình mẫu rất nhỏ (ví dụ OB1 sao chép `%I0.0 → %Q0.0`, một bộ đếm trong DB).
- **AI viết** console C# (net48, API bản đang cài; **đọc manual/ header đi kèm**): liệt kê instance, `PowerOn/Run`, `UpdateTagList`, đọc/ghi bit & byte vùng, đọc tag symbolic, đặt chế độ SingleStep + `RunToNextSyncPoint()` 1000 lần.
- **Đo:** RTT một lần trao đổi; số chu kỳ/giây ở lockstep; thời gian `reset`; hành vi khi ghi input (có được lấy ở đầu chu kỳ?).
- **Ghi:** kết quả vào `docs/facts/plcsim-api-*.md` (F-xxx `VERIFIED`) + `docs/spikes/S2-plcsim.md`.

## S3 — Openness export (1 ngày, cần TIA)
- **Anh:** TIA ở **Offline**, nhóm `Siemens TIA Openness`, một dự án nhỏ (SCL + LAD + DB standard + DB optimized + UDT + bảng tag).
- **AI viết** exporter tối thiểu (net48, tham chiếu `Siemens.Engineering.dll` của bản đang cài) xuất block/ UDT/ bảng tag + manifest; **không sửa dự án**.
- **Đầu ra:** ≥ 10 file SimaticML (đưa vào kho fixture riêng), phát hiện khác biệt phiên bản, `docs/facts/simaticml-*.md`.

## Mẫu `docs/spikes/Sx-<tên>.md`
```
# Sx — <tên> · Ngày · Người/AI thực hiện · Môi trường (OS, phiên bản phần mềm)
Câu hỏi:
Cách làm (lệnh/ mã, liên kết commit):
Kết quả (số liệu/ log nguyên văn):
Kết luận: ĐẠT / KHÔNG ĐẠT / CẦN THÊM DỮ LIỆU
Quyết định đề xuất (ADR/SCR/OQ):
Việc tiếp theo:
```
