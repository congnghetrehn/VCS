# SKILL — Giao diện web, HMI/SVG designer và PWA

## Mục lục

- [1. Bản chất UI này](#1-bản-chất-ui-này)
- [2. Kiến trúc và luồng dữ liệu](#2-kiến-trúc-và-luồng-dữ-liệu)
- [3. Hiệu năng](#3-hiệu-năng)
- [4. Form, validation, i18n](#4-form-validation-i18n)
- [5. Trợ năng (a11y) và UX công nghiệp](#5-trợ-năng-a11y-và-ux-công-nghiệp)
- [6. HMI/SVG — runtime](#6-hmisvg-runtime)
- [7. HMI/SVG — designer](#7-hmisvg-designer)
- [8. Bảng thời gian thực và các trang dữ liệu](#8-bảng-thời-gian-thực-và-các-trang-dữ-liệu)
- [9. PWA (tùy chọn — prompt P0.9; ngoài M0–M5)](#9-pwa-tùy-chọn-prompt-p09-ngoài-m0m5)
- [10. Lỗi hay gặp](#10-lỗi-hay-gặp)
- [11. Checklist tự kiểm](#11-checklist-tự-kiểm)

> Dùng khi: `apps/web` (bảng Tags, Sim bar, Import wizard, Test Center, Communications), HMI designer/runtime (M4), và **PWA** (tùy chọn, prompt P0.9).
> Spec thắng skill. Mẫu mã chỉ minh họa.

## 1. Bản chất UI này
Công cụ **kỹ thuật, dày thông tin**, dùng lâu, đôi khi dùng bởi người **witness FAT** trên máy tính bảng. Ưu tiên: **rõ ràng, ổn định, đúng**, rồi mới đẹp. Dữ liệu thời gian thực (10 Hz) trên hàng nghìn tag.

## 2. Kiến trúc và luồng dữ liệu
- `apps/web` chỉ import `@vcs/schemas`, `@vcs/expr`, `@vcs/hmi`. **Không** import `kernel`/`runtime-iec`.
- Một WebSocket client duy nhất (tự kết nối lại, backoff 0.5→5 s). Thông điệp parse bằng schema zod chung.
- **Store (Zustand):** giữ `values[tagIndex]`, `quality[tagIndex]` dạng mảng/typed array; **cập nhật gom theo `requestAnimationFrame`** (nhiều message → một lần render).
- **Selector theo từng tag:** mỗi widget/ô chỉ đăng ký đúng tag của nó; không render lại cả bảng khi một tag đổi.
- Trạng thái UI thuần (lọc, chọn, panel) tách khỏi dữ liệu thời gian thực.
- Trạng thái kết nối là công dân hạng nhất: `kết nối / đang nối lại / mất`; khi mất, **mọi giá trị chuyển sang stale** (mờ + gạch xéo + giờ cuối), không hiện như "tươi".

## 3. Hiệu năng
- **Ảo hóa** bảng lớn (`@tanstack/react-virtual`): ≥ 20 000 dòng mượt; chiều cao dòng cố định khi có thể.
- Tránh tạo hàm/ object mới mỗi render trong ô bảng; `memo` có chủ đích; key ổn định.
- Nháy màu khi giá trị đổi bằng **CSS class tạm** (không state React mỗi tag).
- Code-split: **Monaco, designer, biểu đồ** nạp lười; ngân sách bundle ban đầu có số (đặt trong ADR, ví dụ ≤ 300 KB gzip cho shell).
- Đo bằng Playwright trace/ DevTools; không tối ưu theo cảm giác.

## 4. Form, validation, i18n
- Form sinh từ **zod schema** (nhãn, đơn vị, mô tả từ metadata schema); lỗi hiển thị tại ô, kèm hướng sửa.
- i18n tự viết nhẹ `t('key')` (vi/en); **không chuỗi cứng**; số/ngày theo locale nhưng sim time hiển thị cố định `mm:ss.mmm`.
- Thông báo lỗi nghiệp vụ đi qua `Diagnostic` (mã + hướng sửa), không tự chế chuỗi ở UI.

## 5. Trợ năng (a11y) và UX công nghiệp
- Điều khiển bàn phím đầy đủ cho Sim bar, bảng, designer; nhãn ARIA; vòng focus rõ; tương phản đạt ở sáng/tối.
- **Không chỉ dựa vào màu:** trạng thái = màu + hình/ ký hiệu + chữ (fault có "!"; chạy có mũi tên/chữ R).
- `prefers-reduced-motion`: tắt nhấp nháy/ chuyển động không cần thiết.
- Phong cách "bình tĩnh": nền trung tính, **màu rực chỉ cho bất thường** (kiểu ISA-101); bố cục nhất quán; lệnh nguy hiểm có **xác nhận** (nút xác nhận bật sau ~300 ms).
- Mục tiêu chạm ≥ 44 px cho máy tính bảng; không dựa vào hover.

## 6. HMI/SVG — runtime
- Màn hình `size {w,h}` → `<svg viewBox>`; **scale-to-fit** giữ tỉ lệ; toạ độ logic, không pixel cứng.
- Biểu thức binding biên dịch **một lần** khi nạp màn hình (`@vcs/expr`); tập `refs` → đăng ký đúng các tag.
- Lỗi đánh giá/ tag `bad` → widget hiện "không xác định" (gạch chéo `?`), **không** làm đổ cả màn hình.
- **Nút `momentary`:** `pointerdown` ghi `true`; nhả ở `pointerup`, `pointercancel`, `pointerleave`, `blur` cửa sổ, mất WS (server cũng nhả khi WS đóng). Dùng `setPointerCapture`.
- Điều khiển vô hiệu khi tag không `writable` (mờ + tooltip lý do); lệnh quan trọng `confirm`.
- Animation bằng **CSS/SMIL nhẹ**, không vòng lặp JS mỗi widget; ≥ 500 widget 10 Hz ≥ 50 FPS.

## 7. HMI/SVG — designer
- **Mô hình dữ liệu bất biến** (immutable) + **command stack** (do/undo/redo, giới hạn 200). Mỗi thao tác = một command có `apply`/`revert`; kéo thả gom thành **một** command khi nhả chuột.
```ts
interface Command { label: string; apply(s: Doc): Doc; revert(s: Doc): Doc }   // minh họa
```
- **Chọn/ biến đổi:** hit-test bằng pointer events trên SVG; 8 tay nắm; snap lưới; phím mũi tên (1 px, Shift = 10 px); chuyển hệ toạ độ màn hình ↔ logic bằng `getScreenCTM().inverse()`.
- Chọn nhiều, nhóm/ rã nhóm (toạ độ tương đối), z-order, khóa widget, copy/paste/duplicate (id mới, offset).
- **Panel thuộc tính sinh từ schema zod**; ô biểu thức có kiểm tra tức thì + autocomplete tag/equipment/role + **giá trị hiện tại** khi mô phỏng chạy.
- **Lưu:** debounce ~1.5 s + Ctrl+S; `etag` (sha256 nội dung) → `412` khi file đổi từ ngoài → hộp thoại tải lại/ghi đè; **JSON tất định** (khóa cố định, 2 dấu cách, tọa độ ≤ 2 chữ số thập phân).
- **Problems panel:** `HMI-*` (tag/symbol/role không tồn tại, biểu thức lỗi, ngoài khung, điều khiển tag không writable) nhảy tới widget.
- **Bảo mật:** văn bản render như **text**, không HTML; SVG symbol qua **sanitizer allowlist** (cấm `script`, `foreignObject`, `style`, `on*`, `href` ngoài `#id`, `javascript:`/`data:`).

## 8. Bảng thời gian thực và các trang dữ liệu
- Sửa giá trị tại ô (chỉ tag `free`): Bool = nút bật/tắt; số = nhập + Enter/Esc; kiểm kiểu/ khoảng trước khi gửi; lỗi hiển thị tại chỗ.
- Lọc/ tìm kiếm phía client trên chỉ mục tên; không tính lại toàn bộ khi một giá trị đổi.
- Trang Import/ Test Center: tiến trình dài có thanh tiến độ + hủy; kết quả có thể lọc/xuất CSV; bảng diagnostic click → nhảy tới dòng nguồn.

## 9. PWA (tùy chọn — prompt P0.9; ngoài M0–M5)
**Mục tiêu hợp lý:** cài đặt như ứng dụng (cửa sổ riêng, biểu tượng), **kiosk/ toàn màn hình** cho máy tính bảng witness, trang "không kết nối server" khi offline, tải shell nhanh. **Không** phải chạy mô phỏng offline: mô phỏng chạy trên **server**.
- **Manifest:** `name`, `short_name`, `start_url`, `scope`, `display: standalone`, `theme_color`, biểu tượng (192/512, maskable), `lang`.
- **Service worker** (Workbox/`vite-plugin-pwa`): *precache* tài nguyên tĩnh có hash; **không bao giờ cache `/api/*` và WebSocket**; chiến lược: shell = precache, điều hướng = network-first với fallback trang offline; dọn cache cũ khi cập nhật.
- **Cập nhật:** phát hiện bản mới → hiển thị "Có bản mới — tải lại" (không tự reload giữa lúc đang chạy mô phỏng/ chỉnh sửa).
- **Ngữ cảnh an toàn (quan trọng):** service worker/ cài đặt **chỉ hoạt động trên HTTPS hoặc `localhost`**. Truy cập qua `http://192.168.x.x` (máy tính bảng trong mạng FAT) **không** là secure context → không cài PWA được. Cần HTTPS cục bộ (chứng chỉ do CA nội bộ/ `mkcert`, hoặc reverse proxy) và `wss://`. Quyết định phải ghi ADR; liên quan bảo mật M0 §8.2 (bind mặc định `127.0.0.1`).
- **Kiosk:** Fullscreen API (cần thao tác người dùng); Screen Wake Lock (`navigator.wakeLock`, kiểm tính khả dụng, xin lại khi tab hiện lại); chặn pull-to-refresh/ zoom ngoài ý muốn; `viewport` đúng; tham số `?kiosk=1`.
- **Kiểm thử:** Playwright: manifest hợp lệ, service worker đăng ký (trên `localhost`), trang offline hiện khi server tắt, `/api` không bị cache, bản cập nhật được thông báo.
- Không thêm tính năng PWA khác (push, background sync) khi chưa có yêu cầu.

## 10. Lỗi hay gặp
Render lại cả bảng mỗi message · subscribe toàn bộ tag cho mọi widget · không stale khi mất kết nối · nút momentary kẹt "đang nhấn" · biểu thức đánh giá mỗi frame bằng cách parse lại · SVG từ file chưa sanitize · JSON màn hình không tất định (diff git ồn) · chỉ dùng màu · chuỗi cứng không i18n · Monaco nạp ở bundle chính · cache nhầm `/api` trong service worker · PWA trên HTTP LAN không chạy · undo/redo lưu bản sao toàn bộ mỗi thao tác kéo.

## 11. Checklist tự kiểm
☐ Cập nhật gom rAF + selector theo tag · ☐ stale khi mất kết nối · ☐ ≥ 20 000 dòng mượt · ☐ không chỉ dựa màu · ☐ bàn phím + ARIA · ☐ i18n vi/en · ☐ momentary luôn nhả · ☐ designer: undo/redo, etag, JSON tất định · ☐ sanitizer có test · ☐ code-split nặng · ☐ (PWA) không cache API/WS, ADR về HTTPS.
