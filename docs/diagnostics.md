# diagnostics — Danh mục mã chẩn đoán

> File sinh tự động bởi `pnpm docs:diagnostics` (`scripts/gen-diagnostics.ts`). Không sửa tay.

| Mã | Mức | Tiêu đề | Gợi ý |
| --- | --- | --- | --- |
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
| `SIM-E001` | error | Component lỗi khi chạy | Xem diagnostics của component và sửa logic của nó. |
| `SIM-E002` | error | Component bất đồng bộ trong đường đồng bộ | Chuyển component sang đường async (asyncStep), hoặc viết lại thành đồng bộ. |
| `SIM-E003` | error | Snapshot không tương thích | Snapshot được tạo bởi phiên bản khác; chạy lại từ đầu hoặc migrate snapshot. |
| `SIM-W001` | warning | Không có runtime đăng ký cho controller | Đăng ký runtime/adapter cho controller đó, hoặc đổi mode của controller. |
| `TAG-E001` | error | Ghi tag sai kiểu/ngoài khoảng | Ghi giá trị đúng kiểu và trong khoảng của tag. |
| `TAG-E002` | error | Vi phạm quyền sở hữu tag | Chỉ owner của tag mới được ghi; ghi từ bên ngoài phải qua checkWrite + post(). |
| `TAG-E003` | error | Tag không tồn tại | Kiểm tra tên tag trong TagCatalog. |
| `WS-E001` | error | Phiên bản giao thức không khớp | Nâng cấp client/server lên cùng PROTOCOL_VERSION. |
| `WS-E002` | error | Lệnh step bị bỏ qua khi đang RUNNING | Pause trước khi step, hoặc dùng run. |
