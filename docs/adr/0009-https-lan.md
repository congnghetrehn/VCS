# ADR-0009: HTTPS cho truy cập LAN — đề xuất mkcert, chưa quyết (P0.9)

- **Trạng thái:** đề xuất — chưa quyết (D-007, OWNER-INBOX §1)
- **Ngày:** 2026-11-26
- **Người quyết định:** chủ sản phẩm (chưa quyết) · **Người đề xuất:** AI (P0.9)
- **Liên quan:** P0.9 (PWA); M0 §8.2–8.3; D-005; STATE §23 OQ-224

## Bối cảnh
Service worker chỉ chạy trên HTTPS hoặc localhost (secure context). PWA của
P0.9 chạy đầy đủ trên localhost (`127.0.0.1:4170`), nhưng khi mở app từ máy
khác trên LAN (vd tablet kiosk ở hiện trường, `http://192.168.x.y:4170`) thì
trình duyệt từ chối đăng ký service worker: không offline, không cài đặt,
không banner cập nhật. P0.9 **không** đổi bind mặc định (`127.0.0.1`) và
**không** thêm TLS vào server — ADR này chỉ đề xuất phương án để chủ sản
phẩm quyết ở D-007.

## Các lựa chọn đã xem xét
| Lựa chọn | Ưu | Nhược | Rủi ro |
|---|---|---|---|
| A. **mkcert** (đề xuất) | Chứng chỉ local tin cậy được, trình duyệt không cảnh báo; server giữ nguyên Fastify, chỉ thêm cert/key qua env; dùng được cho cả tablet kiosk | Mỗi máy client phải cài root CA của mkcert một lần; cert phải gia hạn/phát hành lại khi đổi host | Thấp — công cụ chuẩn cho dev LAN; không ảnh hưởng localhost hiện tại |
| B. Reverse proxy (Caddy/nginx + TLS) | Không sửa server VCS; proxy lo TLS + có thể thêm auth | Thêm một thành phần vận hành (proxy + cert); cấu hình riêng cho mỗi site | Trung bình — phụ thuộc hạ tầng mạng hiện trường |
| C. Chỉ localhost | Không làm gì thêm | Không dùng PWA được từ tablet/máy khác trên LAN; kiosk phải chạy trình duyệt trên chính máy server | Không rủi ro kỹ thuật, nhưng mất mục đích PWA ở hiện trường |

## Quyết định
**Chưa quyết.** AI đề xuất **A (mkcert)**: ít thay đổi nhất (server chỉ đọc
cert/key từ biến môi trường khi được cấu hình, mặc định vẫn HTTP localhost),
không cần hạ tầng thêm, và phù hợp mô hình on-prem/local-first của VCS
(AGENTS.md §1). Quyết định thuộc về chủ sản phẩm ở **D-007**; ADR này không
tự quyết và không thay đổi hành vi hiện tại.

## Hệ quả
- Tốt: P0.9 hoàn thành mà không chặn D-007; PWA đầy đủ trên localhost ngay.
- Phải trả giá: truy cập LAN qua HTTP vẫn không có service worker cho tới
  khi D-007 được quyết và triển khai (mục kiểm tay trong
  `docs/verify-owner-guide.md`).
- Việc phải làm theo (khi D-007 quyết A): server đọc `VCS_TLS_CERT` /
  `VCS_TLS_KEY` (hoặc tương đương) khi có, vẫn mặc định HTTP + bind
  `127.0.0.1` khi không cấu hình; ghi lại cách cài root CA lên tablet kiosk.
- Cách phát hiện nếu quyết định sai: PWA không đăng ký được trên tablet
  LAN dù đã làm theo hướng dẫn → xem lại lựa chọn B.
