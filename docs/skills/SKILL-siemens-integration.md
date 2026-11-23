# SKILL — Tích hợp Siemens: quy trình "sự thật trước" (PLCSIM Advanced, Openness/SimaticML, S7comm, OPC UA node id)

> Dùng khi: P4.4 (node id kiểu S7-1500), toàn bộ M5. Đây là vùng **AI dễ bịa nhất**: API tên đúng 90% nhưng sai 10% là đủ làm hỏng cả công cụ.
> Quy tắc vàng: **không viết code giao diện hãng từ trí nhớ.** Mọi mã chạm API/định dạng/giao thức hãng phải truy được về một **nguồn sự thật** đã ghi lại.

## 1. Quy trình bắt buộc (5 bước)
1. **Tìm nguồn sơ cấp:** manual/ header/ XSD đi kèm bản cài, tài liệu Siemens chính thức, **file mẫu thật**, **gói bắt Wireshark**, cài đặt độc lập (Snap7…).
2. **Ghi vào sổ sự thật** `docs/facts/<chủ-đề>.md` (mẫu mục 6): nguồn, phiên bản, ngày, trạng thái (`VERIFIED`/`UNVERIFIED`), cách xác minh.
3. **Cài đặt từ sổ sự thật**, ghi chú `// facts: <chủ-đề>#<mục>` ở chỗ dùng.
4. **Test bằng mẫu thật** (fixture trong kho riêng) + fixture tổng hợp (công khai) dựng **sau** khi đã đối chiếu mẫu thật.
5. **Xác minh live** (PLCSIM/TIA thật, do chủ sản phẩm chạy) → cập nhật sổ sự thật `UNVERIFIED → VERIFIED` và `docs/semantics.md`.
Thiếu nguồn/ mẫu ở bước 1 → **dừng và hỏi** (prompt H9). Phương án tạm bằng dữ liệu tổng hợp phải nêu rõ giới hạn và đánh dấu `UNVERIFIED`.

## 2. PLCSIM Advanced (Bridge Agent)
- **Phiên bản:** build theo API chính (`6/7/8`); API **không tương thích giữa các phiên bản chính**; runtime mới hỗ trợ API cũ, không ngược lại. DLL **không** vào repo.
- **Luồng:** mọi lời gọi API trên **một luồng chuyên trách**; có timeout; không gọi song song. Kiểu apartment (STA/MTA) lấy từ tài liệu API, không đoán.
- **I/O:** ưu tiên đọc/ghi **theo vùng byte** (`InputArea`/`OutputArea` hoặc tương đương — tên chính xác theo manual bản cài) cho tag I/Q; tag M/DB theo **tên symbolic**; cần `UpdateTagList` sau mỗi lần tải chương trình.
- **Thời gian ảo:** `OperatingMode` (Default / nhóm SingleStep), `RunToNextSyncPoint()`, `ScaleFactor`, `OverwrittenMinimalCycleTime_ns`, `GetSystemTime()`; thay đổi có hiệu lực ở cycle control point. Hành vi chi tiết (OB cyclic, interrupts, "Timespan synchronized CP") → **xác minh trước khi dựa vào**.
- **Môi trường:** nhóm Windows `PlcSimUsers`; adapter mạng ảo "Siemens PLCSIM Virtual Ethernet Adapter" (chế độ một/nhiều adapter ảnh hưởng khả năng client cùng máy kết nối); giấy phép theo instance.
- **Không** tải chương trình bằng API (TIA làm việc đó); `reset` instance chậm — đo thật.

## 3. TIA Openness và SimaticML
- **Chỉ-đọc:** không Save/Import/Download; `--compile` mặc định tắt (nó đổi trạng thái dự án).
- **Offline bắt buộc** để xuất block; block **know-how protected** → bỏ qua + ghi manifest; **không** cố vượt bảo vệ.
- **Phiên bản:** XML khác nhau giữa bản TIA (có token chỉ V21); build công cụ theo `TiaVersion`; đọc `Engineering version`.
- **Parser SimaticML:**
  - Dựa **XSD của Openness** + **≥ 10 file mẫu thật**; so khớp phần tử theo **`local-name`** (URI namespace đổi theo phiên bản); phần tử lạ → cảnh báo, không lỗi.
  - Chống XXE; giới hạn kích thước/ độ sâu; ghi `UId/ID` vào diagnostic.
  - SCL = chuỗi **token** → dựng text → **parser SCL của M1** (một nguồn ngữ nghĩa duy nhất).
  - LAD/FBD = đồ thị `Parts/Wires` → **dataflow** sang IR; không ép về series/parallel.
  - STL/GRAPH/F-safety/ kiểu chưa hỗ trợ → `SML-U*` + báo cáo, **không chạy sai im lặng**.
- **Nguồn sự thật là XML gốc** (`plc/import/`); `plc/generated/*.scl` chỉ để đọc.
- Ghi nhớ: dự án khách hàng là bí mật → fixture thật ở **kho riêng**.

## 4. S7comm cổ điển / Snap7
- **Giới hạn thật:** S7-1200/1500 chỉ qua **PUT/GET** (phải bật), **DB không-optimized**, không S7CommPlus; PUT/GET không xác thực. Một số firmware mới có ràng buộc bảo mật thêm → `VERIFY` theo CPU.
- **Codec tự cài** từ đặc tả + **gói bắt Wireshark** + kiểm bằng `python-snap7`/`nodes7` (chỉ dev). Golden bytes lấy từ cài đặt độc lập, không từ trí nhớ.
- **PDU:** đàm phán `pduLength`; chia yêu cầu theo giới hạn; số item/PDU hữu hạn.
- **Lỗi CPU từ chối** → `S7-E011` kèm **checklist** (bật PUT/GET, tắt Optimized block access cho DB, biên dịch & tải lại — việc đổi thuộc tính DB khởi tạo lại DB, mức bảo vệ).
- Ghi vùng `I` trên **PLC thật** vô nghĩa (bị I/O vật lý ghi đè) → dùng DB giao diện mô phỏng; trên PLCSIM cần xác minh.
- **S7 server của VCS** chỉ phục vụ client S7 cổ điển; client S7CommPlus (WinCC tối ưu) **không** kết nối được — nói rõ trong tài liệu.

## 5. OPC UA node id kiểu S7-1500
- **Mục tiêu:** SCADA có sẵn tag trỏ PLC thật dùng được **không đổi cấu hình**. Sơ đồ `s7-1500`: `ns=<N>;s="Seg1"."Seg2"…`; `N` mặc định 3 (`VERIFY` với PLC thật).
- **Bắt buộc có ví dụ node id thật** từ SCADA/UaExpert (ẩn danh) để chốt chỉ số namespace, quy tắc ngoặc kép, DB/UDT lồng.
- Chỉ số namespace đạt được bằng namespace giữ chỗ (node-opcua gán tuần tự).
- Bảo mật: `Basic256Sha256` + `SignAndEncrypt` + quy trình Trust chứng chỉ; chính sách cũ (`Basic128Rsa15`, `Basic256`) không hỗ trợ.
- PLCSIM Advanced/ PLC thật có OPC UA server **của chính nó** → topology B1/B2: SCADA nối thẳng, VCS chỉ là plant. Đừng ép mọi thứ qua server OPC UA của VCS.

## 6. Mẫu sổ sự thật `docs/facts/<chủ-đề>.md`
```
# Facts: <chủ đề> (ví dụ plcsim-api-v8)
| ID | Phát biểu (cụ thể, kiểm chứng được) | Nguồn (tài liệu/§/URL/file mẫu) | Phiên bản | Ngày | Trạng thái | Cách xác minh | Dùng ở (file:hàm) |
|---|---|---|---|---|---|---|---|
| F-001 | `InputArea.WriteBytes(offset, bytes)` ghi vào ảnh input ngoại vi | Function Manual API §x.y | V8.0 U1 | 2026-11-… | UNVERIFIED | chạy spike S2 | tools/bridge-agent/…/IoArea.cs |
```
Quy tắc: không phát biểu mơ hồ ("có lẽ"); mỗi `UNVERIFIED` có cách xác minh; khi live xác minh xong → cập nhật + liên kết kết quả (log/ảnh).

## 7. Lỗi hay gặp
Gọi API từ nhiều luồng · dùng tên API nhớ mơ hồ · quên `UpdateTagList` · đoán cấu trúc XML thay vì dựa mẫu · xem URI namespace là cố định · ép FlgNet về series/parallel · bỏ qua im lặng lệnh/ block không hỗ trợ · DLL/ dự án thật trong repo · Snap7 với DB optimized · ghi `I` trên PLC thật · hứa S7 server tương thích WinCC · coi `ns=3` là chắc chắn · quên rằng reset PLCSIM chậm · chạy `--compile` mặc định.

## 8. Checklist tự kiểm
☐ Mỗi API/định dạng/giao thức dùng đều có mục trong `docs/facts/` · ☐ `UNVERIFIED` được nêu rõ trong báo cáo · ☐ có mẫu thật hoặc đã dừng hỏi · ☐ DLL/ dữ liệu khách hàng không trong diff · ☐ lệnh/ phần tử không hỗ trợ có mã + vị trí · ☐ luồng API chuyên trách · ☐ công cụ chỉ-đọc · ☐ hướng dẫn live-test cho chủ sản phẩm đã ghi vào OWNER-INBOX.
