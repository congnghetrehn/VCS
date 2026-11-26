# diagnostics — Danh mục mã chẩn đoán

> File sinh tự động bởi `pnpm docs:diagnostics` (`scripts/gen-diagnostics.ts`). Không sửa tay.

| Mã | Mức | Tiêu đề | Gợi ý |
| --- | --- | --- | --- |
| `IO-E001` | error | Trùng tag (không phân biệt hoa/thường) | Đổi tên một trong các tag trùng. |
| `IO-E002` | error | Tag trống hoặc quá dài | Đặt tên tag khác rỗng, ≤ 128 ký tự, bắt đầu bằng chữ hoặc _. |
| `IO-E003` | error | Thiếu signalType và không suy ra được từ địa chỉ | Ghi signalType (DI/DO/AI/AO) hoặc dùng địa chỉ I/Q để suy kind. |
| `IO-E010` | error | Địa chỉ không hợp lệ | Sửa địa chỉ theo dạng %I0.0 / %IW64 / DB1.DBX0.0 (xem M2 §8.5). |
| `IO-E011` | error | Trùng/chồng địa chỉ trong cùng controller | Đổi địa chỉ của một trong hai tín hiệu chồng lấn. |
| `IO-E012` | error | Hướng sai (DI/AI ở vùng Q, DO/AO ở vùng I) | DI/AI phải ở area I; DO/AO phải ở area Q. |
| `IO-E013` | error | Kiểu dữ liệu không khớp độ rộng địa chỉ | DI/DO cần địa chỉ bit; AI/AO cần Word/DWord. |
| `IO-I001` | info | Dòng bị bỏ qua (dòng trống/tiêu đề phụ) | Dòng trống trong vùng dữ liệu được bỏ qua. |
| `IO-W001` | warning | Tín hiệu analog thiếu engMin/engMax | Ghi Range Lo/Hi cho tín hiệu AI/AO. |
| `IO-W002` | warning | Tên tag có ký tự không chuẩn | Dùng tên đã làm sạch trong báo cáo import. |
| `IO-W003` | warning | Địa chỉ Word/DWord ở offset lẻ | Word cần byte chẵn; DWord cần byte chia hết cho 4. |
| `IO-W010` | warning | Địa chỉ nằm ngoài vùng khai báo của controller | Kiểm tra vùng địa chỉ của controller (mặc định I/Q 1024 byte). |
| `IO-W020` | warning | Controller chưa khai báo trong vcs.project.yaml | Khai báo controller trong vcs.project.yaml. |
| `IO-W030` | warning | Có tiền tố peripheral (P/:P) | Địa chỉ peripheral đã được strip về dạng chuẩn; M1 chưa mô phỏng khác biệt. |
| `IO-W040` | warning | engMin ≥ engMax hoặc giá trị không phải số | Kiểm tra Range Lo/Hi: phải là số và Lo < Hi (trừ range đảo có chủ đích). |
| `LAD-S001` | error | Schema/cấu trúc LAD không hợp lệ | Kiểm tra JSON theo M1 §5.1: rung/parallel không rỗng, key đúng tên, FC/OB không có VAR (static). |
| `LAD-T001` | error | Tên chưa khai báo | Khai báo tag/biến/DB trước khi dùng, kiểm tra chính tả. |
| `LAD-T002` | error | Kiểu không khớp | Đổi kiểu operand hoặc giá trị cho khớp; thu hẹp phải dùng box CONVERT. |
| `LAD-T003` | error | Toán tử không áp dụng cho kiểu | Phép số học chỉ dùng cho số; so sánh không dùng cho Bool/struct. |
| `LAD-T004` | error | Lỗi gọi box | Kiểm tra instance, tên và kiểu input/output của box theo bảng chữ ký (STATE §21). |
| `LAD-T005` | error | Truy cập member/index sai | Kiểm tra tên field; field ẩn (hidden) không truy cập được. |
| `LAD-T006` | error | Gán không hợp lệ | VAR_INPUT chỉ đọc; không ghi vào VAR_INPUT. |
| `LAD-T009` | error | Trùng tên | Đổi tên một trong các khai báo trùng (biến, network, temp __lad_*). |
| `LAD-U001` | error | Box/kiểu chưa hỗ trợ | Dùng box/kiểu trong phạm vi M1 §5; String và mảng lồng nhau chưa hỗ trợ. |
| `PL-E001` | error | Model không tồn tại trong registry | Kiểm tra tên model trong cấu hình; model phải được đăng ký trước khi dùng. |
| `PL-E002` | error | Tag không khớp kind của role | Gán tag có signal.kind khớp role (DI/DO/AI/AO). |
| `PL-E003` | error | Thiếu tag bắt buộc cho role | Gán tag cho role bắt buộc, hoặc khai báo role là optional trong model. |
| `PL-E012` | error | Không xác định được dải đo cho role analog | Khai báo engMin/engMax trong params, hoặc scaling trong tag, hoặc unit "%" cho role. |
| `PL-E020` | error | Chu trình link giữa các thiết bị | Bỏ một liên kết link để phá chu trình (thứ tự topo phải không có chu trình). |
| `PL-W001` | warning | Cảnh báo cấu hình plant | Kiểm tra cấu hình plant: gán tag cho role; plcScanMs (nếu có) phải là số nguyên ≥ stepMs. |
| `PL-W010` | warning | Tham chiếu treo sau khi re-import I/O list | Tag đã gán thiết bị bị xóa/đổi tên — cập nhật equipment.yaml. |
| `PL-W020` | warning | Hành vi chưa kiểm chứng | Hành vi này chưa được kiểm chứng với PLC thật; xem docs/semantics.md. |
| `PRJ-E001` | error | Thiếu file bắt buộc | Tạo vcs.project.yaml ở thư mục gốc của dự án. |
| `PRJ-E002` | error | Cú pháp YAML sai | Sửa cú pháp YAML tại dòng/cột đã báo (chú ý thụt đầu dòng bằng khoảng trắng, không dùng tab). |
| `PRJ-E003` | error | Vi phạm schema | Sửa giá trị theo schema tại vị trí đã báo. |
| `PRJ-E004` | error | Trùng tên tag (không phân biệt hoa/thường) | Đổi tên một trong hai tag trùng. |
| `PRJ-E005` | error | Controller không tồn tại | Khai báo controller trong vcs.project.yaml, hoặc sửa trường controller của tag. |
| `PRJ-E006` | error | schemaVersion không hỗ trợ | Chạy migrate (migrateProject) hoặc sửa schemaVersion về 1. |
| `PRJ-E007` | error | stepMs/plcScanMs không hợp lệ | stepMs là số nguyên ≥ 1; plcScanMs là số nguyên ≥ stepMs. |
| `PRJ-E010` | error | signal.kind không khớp area | DI/AI phải ở area I; DO/AO phải ở area Q. |
| `PRJ-E011` | error | scaling chỉ hợp lệ với AI/AO | Bỏ scaling, hoặc đổi signal.kind thành AI/AO. |
| `PRJ-E012` | error | Khoảng scaling suy biến | rawMin phải khác rawMax và engMin phải khác engMax. |
| `PRJ-E013` | error | signal.kind không khớp kiểu dữ liệu | DI/DO phải là Bool; AI/AO phải là kiểu số. |
| `PRJ-E014` | error | Giá trị khởi tạo không đúng kiểu/khoảng | Bool nhận boolean; kiểu số nhận number trong khoảng của kiểu đó. |
| `PRJ-W001` | warning | Khóa lạ trong YAML | Kiểm tra chính tả khóa; khóa lạ bị bỏ qua. |
| `PRJ-W002` | warning | Không có tags.yaml | Tạo file tags (mặc định tags/tags.yaml) hoặc chấp nhận dự án không có tag. |
| `SCL-L001` | error | Lỗi từ vựng SCL | Kiểm tra ký tự tại vị trí đã báo; đóng comment (* *) và dấu nháy "...". |
| `SCL-P001` | error | Thiếu ';' cuối statement | Thêm ';' cuối statement tại vị trí đã báo. |
| `SCL-P002` | error | Lỗi cú pháp SCL | Sửa theo "expected ..." tại vị trí đã báo. |
| `SCL-P003` | error | Quá nhiều lỗi cú pháp (tối đa 100) | Sửa 100 lỗi đầu đã báo rồi biên dịch lại. |
| `SCL-S020` | error | Đệ quy gọi block | FC/FB không được gọi chính nó (trực tiếp hay gián tiếp) — tách thành block khác. |
| `SCL-T001` | error | Tên chưa khai báo | Khai báo biến/kiểu/block trước khi dùng, kiểm tra chính tả. |
| `SCL-T002` | error | Kiểu không khớp | Đổi kiểu biến hoặc giá trị cho khớp; thu hẹp phải dùng hàm chuyển đổi tường minh. |
| `SCL-T003` | error | Toán tử không áp dụng cho kiểu | Phép số học chỉ dùng cho số nguyên/số thực/Time; AND/OR/XOR/NOT dùng cho Bool hoặc Byte/Word/DWord. |
| `SCL-T004` | error | Lỗi gọi block/hàm | Gọi FB cần instance (#fb hoặc "DB"); kiểm tra tên và kiểu tham số trong khai báo block. |
| `SCL-T005` | error | Truy cập member/index sai | Kiểm tra tên field, kiểu index và khoảng chỉ số hằng của mảng. |
| `SCL-T006` | error | Gán không hợp lệ | VAR_INPUT chỉ đọc trong FB/FC; VAR_CONSTANT không được gán. |
| `SCL-T007` | error | EXIT/CONTINUE ngoài vòng lặp | EXIT/CONTINUE chỉ dùng trong FOR/WHILE/REPEAT. |
| `SCL-T008` | error | Biểu thức không hằng | Giá trị khởi tạo, label CASE và init DB phải là hằng (literal, phép tính trên hằng, VAR_CONSTANT). |
| `SCL-T009` | error | Khai báo trùng tên | Đổi tên một trong hai khai báo trong cùng scope. |
| `SCL-T010` | error | Thu hẹp ngầm định | Dùng REAL_TO_INT(...)/TRUNC(...) hoặc hàm X_TO_Y tường minh. |
| `SCL-T011` | error | Định nghĩa kiểu đệ quy | UDT không được chứa chính nó (trực tiếp hay gián tiếp). |
| `SCL-U001` | error | Cấu trúc SCL chưa hỗ trợ | Dùng cấu trúc trong phạm vi M1 (xem M1 §4.2 và Phụ lục A); String không hỗ trợ. |
| `SCL-W001` | warning | Đọc TEMP trước khi ghi | TEMP không khởi tạo trên PLC thật; gán giá trị trước khi đọc. |
| `SIM-E001` | error | Component lỗi khi chạy | Xem diagnostics của component và sửa logic của nó. |
| `SIM-E002` | error | Component bất đồng bộ trong đường đồng bộ | Chuyển component sang đường async (asyncStep), hoặc viết lại thành đồng bộ. |
| `SIM-E003` | error | Snapshot không tương thích | Snapshot được tạo bởi phiên bản khác; chạy lại từ đầu hoặc migrate snapshot. |
| `SIM-W001` | warning | Không có runtime đăng ký cho controller | Đăng ký runtime/adapter cho controller đó, hoặc đổi mode của controller. |
| `TAG-E001` | error | Ghi tag sai kiểu/ngoài khoảng | Ghi giá trị đúng kiểu và trong khoảng của tag. |
| `TAG-E002` | error | Vi phạm quyền sở hữu tag | Chỉ owner của tag mới được ghi; ghi từ bên ngoài phải qua checkWrite + post(). |
| `TAG-E003` | error | Tag không tồn tại | Kiểm tra tên tag trong TagCatalog. |
| `WS-E001` | error | Phiên bản giao thức không khớp | Nâng cấp client/server lên cùng PROTOCOL_VERSION. |
| `WS-E002` | error | Lệnh step bị bỏ qua khi đang RUNNING | Pause trước khi step, hoặc dùng run. |
| `WS-E003` | error | Thông điệp WebSocket không hợp lệ | Gửi đúng schema giao thức (xem M0 §9.2): hello trước, rồi mới lệnh; timeScale phải là số > 0 hoặc 'max'. |
