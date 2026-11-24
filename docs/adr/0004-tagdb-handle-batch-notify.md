# ADR-0004: TagDB theo handle + thông báo theo lô tại `flush()`

- **Trạng thái:** đã chấp nhận
- **Ngày:** 2026-11-24
- **Người quyết định:** chủ sản phẩm · **Người đề xuất:** AI (P0.3–P0.4)
- **Liên quan:** M0 §6.2, §12.4; AMENDMENTS A17; OQ-014, OQ-015, OQ-018, OQ-032; PR #10, PR #11

## Bối cảnh
TagDB là trung tâm dữ liệu: mọi đọc/ghi tag đi qua nó, cần nhanh (bench
§12.4: set/get ≥ 10M ops/s, `flush()` 5 000 tag/0 đổi ≤ 50 µs) và tất định
(thứ tự thông báo ổn định để hash giống hệt). Cần chọn cách định danh tag và
cơ chế thông báo.

## Các lựa chọn đã xem xét
| Lựa chọn | Ưu | Nhược | Rủi ro |
|---|---|---|---|
| A. Handle = chỉ số (theo thứ tự định nghĩa) + thông báo theo lô ở `flush()` | `get`/`set` không cấp phát (mảng); thứ tự thông báo = thứ tự handle (tất định); `flush()` chỉ duyệt dirty list | UI/test phải tra tên → handle (có `read`/`write` theo tên cho tiện) | Thấp — đã bench 51,5M ops/s |
| B. Map tên → giá trị + phát ngay mỗi lần ghi | API đơn giản | Phát từng thay đổi (nhiễu UI/trace); thứ tự phụ thuộc thứ tự ghi; tra tên mỗi lần ghi | Cao — không đạt bench, hash khó ổn định |
| C. Handle + phát ngay nhưng gom bằng debounce wall-time | Đơn giản ở phía ghi | Debounce dùng wall time → phá tất định | Cao — vi phạm ADR-0003 |

## Quyết định
Chọn **A**: `TagDB` theo `TagHandle` (chỉ số, ổn định trong một phiên);
ghi tức thời, thông báo trì hoãn — subscriber chỉ nhận ở `flush()` cuối
bước, theo lô, chỉ tag khác giá trị đã flush lần trước, theo thứ tự handle
tăng dần, duyệt **danh sách dirty** (A17, M0 §6.4 quy tắc 3). Mặc định
`validate` + `enforceOwnership` đều `true` (OQ-014); subscriber ném lỗi thì
**lan truyền**, không nuốt (OQ-015); `namesHash` = sha256 các tên nối bằng
`'\n'`, chỉ dùng nội bộ để kiểm `restore()` (OQ-018).

## Hệ quả
- Tốt: `get`/`set` không cấp phát (heap < 1 MB/10M ops, test); `flush()`
  O(số tag đổi); hash tất định qua `TraceHasher`.
- Phải trả giá: subscriber không thấy thay đổi ngay trong bước (chỉ sau
  `flush()`); giá trị quay về như cũ trong cùng kỳ thì không phát (đúng
  spec, nhưng UI/trace phải hiểu).
- Việc phải làm theo: mọi ghi từ ngoài bước qua `checkWrite` + `post()`
  (xem `docs/semantics.md` §5); không ghi TagDB trực tiếp từ ngoài bước.
- Cách phát hiện nếu quyết định sai: bench `flush()` vượt ngưỡng khi nhiều
  tag đổi (đo lại; nếu dirty-list sort thành cổ chai thì xem lại ngưỡng sort).

## Ghi chú xác minh
Không có. Đã kiểm: 42 test TagDB (≥ 40 theo §12.1), property test
chuỗi ghi/flush, bench TagDB 4/4 PASS.
