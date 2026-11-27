# SKILL — Viết công cụ, importer, generator và giao thức

## Mục lục

- [1. Nguyên tắc nền: lõi thuần + vỏ I/O mỏng](#1-nguyên-tắc-nền-lõi-thuần-vỏ-io-mỏng)
- [2. CLI (`apps/cli`, commander)](#2-cli-appscli-commander)
- [3. Importer (I/O list, C&E, SimaticML, bảng tag)](#3-importer-io-list-ce-simaticml-bảng-tag)
- [4. Generator (test, báo cáo, docgen, JSON HMI)](#4-generator-test-báo-cáo-docgen-json-hmi)
- [5. Codec và giao thức nhị phân (Modbus, S7comm, VBP/1…)](#5-codec-và-giao-thức-nhị-phân-modbus-s7comm-vbp1)
- [6. Server/ client mạng](#6-server-client-mạng)
- [7. Adapter ngoài (controller thật/ PLCSIM)](#7-adapter-ngoài-controller-thật-plcsim)
- [8. Công cầu nối .NET (Bridge Agent, TIA Export)](#8-công-cầu-nối-net-bridge-agent-tia-export)
- [9. Cấu hình và lược đồ](#9-cấu-hình-và-lược-đồ)
- [10. Hiệu năng](#10-hiệu-năng)
- [11. Lỗi hay gặp](#11-lỗi-hay-gặp)
- [12. Checklist tự kiểm](#12-checklist-tự-kiểm)

> Dùng khi: CLI (`vcs …`), importer (I/O list, C&E, SimaticML), generator (test, báo cáo, docgen), codec/ server/ client mạng (Modbus, S7, OPC UA, VBP), công cụ cầu nối .NET.
> Spec thắng skill. Mẫu mã chỉ minh họa.

## 1. Nguyên tắc nền: lõi thuần + vỏ I/O mỏng
- **Lõi thuần** (parse, encode/decode, map, validate, diff): hàm không I/O, không thời gian, không toàn cục → test nhanh, tất định.
- **Vỏ I/O** (fs, mạng, tiến trình): mỏng, tiêm phụ thuộc (`ProjectFS`, đồng hồ, `now()`), chứa timeout/ retry/ cleanup.
- **Ranh giới = validate:** dữ liệu từ ngoài (YAML/JSON/XML/byte) qua **schema/codec** ngay ở biên; bên trong dùng kiểu chặt.
- **Pipeline có giai đoạn** (đọc → chuẩn hóa → kiểm tra → so sánh → ghi); mỗi giai đoạn trả `{value, diagnostics}`.

## 2. CLI (`apps/cli`, commander)
- Mỗi lệnh một file `commands/*.ts`; tên động từ rõ ràng; `--help` có ví dụ.
- **Đầu ra:** dữ liệu → `stdout`; log/cảnh báo → `stderr`; `--json` cho máy đọc (cấu trúc ổn định, có `schema`/`version`).
- **Mã thoát cố định:** `0` ok · `1` FAIL (test/kiểm tra không đạt) · `2` lỗi (dữ liệu/ môi trường) · `3` sai tham số.
- **Tất định:** cùng đầu vào → cùng đầu ra từng byte (sắp xếp ổn định, không timestamp trong nội dung trừ khi tách riêng).
- **An toàn:** `--dry-run` cho lệnh ghi; `--commit` mới ghi; không ghi đè file người dùng sửa tay (`provenance: manual`); in **đường dẫn đã ghi**.
- **Thông báo lỗi:** `file:line:col  error CODE: message` + `hint:`; không stack trace cho lỗi dữ liệu (chỉ khi `--verbose`).
- Lệnh dài: hiển thị tiến độ ra `stderr`, hỗ trợ hủy (SIGINT) và dọn dẹp.

## 3. Importer (I/O list, C&E, SimaticML, bảng tag)
1. **Phát triển từ mẫu:** bắt đầu từ file thật/ fixture sinh có ground truth; thiếu mẫu → dừng và hỏi (H9), không đoán cấu trúc.
2. **Giữ nguồn gốc:** mỗi bản ghi mang `origin {file, sheet, row | UId}`; diagnostic trỏ về đó.
3. **Chuẩn hóa khoan dung, kiểm tra nghiêm:** chấp nhận biến thể (E/A tiếng Đức, BOM, delimiter lạ), nhưng ghi lại phép chuẩn hóa đã làm; lỗi dữ liệu có mã + hướng sửa.
4. **Idempotent:** import lần hai cùng file → diff rỗng. **Không ghi đè** trường người dùng đã sửa tay.
5. **Khóa so khớp ổn định** (tên chuẩn hóa/ địa chỉ); phát hiện đổi tên; báo tham chiếu treo.
6. **Không bỏ qua im lặng:** dòng/ phần tử bị bỏ → `info/warning` có lý do; thống kê tổng.
7. **XML:** chống XXE (cấm DTD/ external entity), giới hạn kích thước/ độ sâu, so khớp theo `local-name`, phần tử lạ → cảnh báo.
8. **Excel/CSV:** tự nhận encoding & delimiter; ô gộp; ô công thức lấy giá trị cache; vi/en/de header (chuẩn hóa bỏ dấu, chữ thường).
9. **Heuristic phải giải thích được** (`reasons[]`, `confidence`); không ML/LLM trong sản phẩm.

## 4. Generator (test, báo cáo, docgen, JSON HMI)
- **Tất định từng byte:** sắp xếp khóa/ phần tử theo thứ tự cố định; LF; không timestamp vào nội dung (đặt ở metadata ngoài hash); số làm tròn theo quy tắc cố định.
- **Ghi bằng writer chuẩn** (JSON 2 dấu cách khóa cố định; YAML thứ tự cố định) — không `JSON.stringify` mặc định cho file sinh.
- **`--check`:** sinh vào bộ nhớ, so với file hiện có, lệch → exit 1 (dùng trong CI).
- **Đầu ra chỉ-sinh** có header `GENERATED — DO NOT EDIT`; mọi tùy biến qua file cấu hình, không sửa tay.
- Báo cáo HTML: một file tự chứa, không mạng, SVG vẽ bằng code, `@media print`, `resultsHash` để chứng minh tái lập.

## 5. Codec và giao thức nhị phân (Modbus, S7comm, VBP/1…)
**Quy trình:**
1. Lấy **nguồn sự thật**: đặc tả/ tài liệu, và **gói bắt thật** (Wireshark) hoặc cài đặt độc lập (python-snap7, modbus-serial, nodes7) để lấy *golden bytes*.
2. Viết **codec thuần** tách khỏi socket: `encode*/decode*` + **bộ tách khung dạng stream** (`push(chunk) → Frame[]`).
3. Test: golden bytes · chia/gộp gói TCP ở mọi vị trí · property `encode∘decode` · khung sai/ cắt/ dài quá.
4. Mới viết server/client.
**Quy tắc codec:**
- **Không tin trường độ dài/ số lượng từ ngoài:** kiểm biên trước khi cấp phát/ đọc; giới hạn cứng kích thước khung.
- Endianness tường minh (`DataView` với cờ), không dựa mặc định máy.
- Khung sai → đóng kết nối + log hex (cắt ngắn), không crash.
- **Fuzz** nhẹ bằng fast-check (byte ngẫu nhiên không được làm treo/ ném ngoài kiểu lỗi dự kiến).
- Ghi **tất-cả-hoặc-không** cho mỗi yêu cầu ghi nhiều mục (kiểm hết rồi mới áp dụng).

## 6. Server/ client mạng
- **Vòng đời:** `start()/stop()` idempotent; `stop()` đóng mọi socket/timer và chờ hoàn tất (có timeout); không để cổng treo.
- **Không chặn event loop:** xử lý theo lô nhỏ; không đồng bộ nặng trong callback; hàng đợi có giới hạn (backpressure).
- **Timeout ở mọi nơi:** kết nối, yêu cầu, im lặng; **reconnect có backoff** (500 ms → 10 s) và đồng bộ lại trạng thái sau khi nối.
- **Ghi từ client ngoài:** qua `TagBroker` (`checkWrite` + validate + `post`), không ghi TagDB trực tiếp từ callback mạng.
- **Giới hạn tài nguyên:** số kết nối/ phiên/ monitored item; kích thước khung; tốc độ log.
- **Bí mật:** qua biến môi trường; không log; so sánh hằng-thời-gian cho mật khẩu/ HMAC.
- **Quan sát:** đếm đọc/ghi/lỗi, RTT, tuổi dữ liệu; RingLog có giới hạn.
- **Test:** cổng `0`; client độc lập thứ ba; kiểm cả đường lỗi (mất kết nối giữa chừng, peer gửi rác).

## 7. Adapter ngoài (controller thật/ PLCSIM)
- `step()` **đồng bộ** + cache + vòng nền (khung `ExternalAdapterBase`); riêng lockstep là `asyncStep`.
- Mất kết nối: giữ giá trị cuối + `quality 'bad'`; nối lại → ghi lại toàn bộ input.
- Khai báo `capabilities` (snapshot, deterministic, timeScale) thay vì giả định.
- **Không bù trễ vòng kín**; đo và báo cáo RTT/drift.

## 8. Công cầu nối .NET (Bridge Agent, TIA Export)
- **Tiến trình tách biệt**, giao thức có phiên bản + bắt tay; JSON cho điều khiển, nhị phân cho đường nóng.
- **Mọi lời gọi API hãng trên một luồng chuyên trách**; có timeout; ánh xạ ngoại lệ → mã lỗi giao thức.
- Backend `Fake` để test mọi thứ không cần phần mềm hãng; test chéo ngôn ngữ (client TS ↔ agent .NET).
- DLL hãng **không** vào repo; `Directory.Build.props` đọc đường dẫn từ biến môi trường; thiếu → bỏ qua build có thông báo.
- **Chỉ-đọc theo mặc định** (TIA Export); thao tác thay đổi trạng thái cần cờ tường minh + cảnh báo.

## 9. Cấu hình và lược đồ
- zod cho mọi file cấu hình; **khóa lạ = cảnh báo** (gợi ý "ý bạn là…"); lỗi có dòng/cột YAML.
- `schemaVersion` + `migrate`; bí mật chỉ dạng `...Env` (tên biến môi trường).
- Mã chẩn đoán đăng ký `DiagnosticCatalog`; thông báo = đối tượng + vị trí + hướng sửa.

## 10. Hiệu năng
Đo trước; kiểu typed array/`DataView` cho byte; gộp I/O thành lô; tránh cấp phát trong vòng nóng; tránh `JSON.stringify` mỗi bước; cache tra cứu (tên→chỉ số) lúc init.

## 11. Lỗi hay gặp
Parser đoán định dạng thay vì dựa mẫu · tin độ dài từ ngoài · không test chia/gộp gói · endianness ngầm · ghi một phần khi lỗi giữa chừng · `stop()` không đóng sạch · callback mạng ghi thẳng TagDB · không timeout · log lộ mật khẩu · file sinh không tất định · import ghi đè sửa tay · XML không chống XXE · bỏ qua im lặng phần không hiểu · exit code lộn xộn.

## 12. Checklist tự kiểm
☐ Lõi thuần tách khỏi I/O · ☐ có golden bytes/ mẫu thật · ☐ stream parser test chia/gộp · ☐ giới hạn kích thước/ số lượng · ☐ timeout + reconnect · ☐ `stop()` idempotent · ☐ idempotent/`--check` · ☐ mã thoát đúng · ☐ không bỏ qua im lặng · ☐ bí mật không vào log · ☐ test trên client độc lập.
