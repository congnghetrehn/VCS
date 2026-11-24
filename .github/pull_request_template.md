## Prompt / phạm vi
- Prompt: P?.? — <tên>
- Spec đã bám: `docs/specs/M?-… §…`
- Package đã sửa: …  (ngoài phạm vi? nếu có, lý do: …)

## Đã làm
- …

## Bằng chứng (dán kết quả thật)
```
pnpm lint            →
pnpm typecheck       →
pnpm depcheck        →
pnpm test            →  (số test: …, mới thêm: …)
pnpm review:cheats   →
(pnpm test:integration / test:e2e / bench nếu prompt yêu cầu) →
```
- Demo đã chạy: <lệnh> → <kết quả>
- Bảng timeline tự tính tay (nếu prompt ⚠): <liên kết/ dán>

## Sai khác so với spec / giả định
- [ ] Không có sai khác
- [ ] Có (đã ghi `docs/open-questions.md` OQ-… và/hoặc ADR-…) — **chờ chủ sản phẩm duyệt**

## Checklist
- [ ] Không sửa kỳ vọng/golden để qua gate (nếu có thay đổi: đã giải thích nguồn sự thật)
- [ ] Không `any`/`@ts-ignore`/`eslint-disable` mới (hoặc đã allow-list kèm lý do)
- [ ] Không `Date.now/Math.random` ở package lõi
- [ ] Mã chẩn đoán mới đã đăng ký `DiagnosticCatalog` và có test
- [ ] File sinh tự động không bị sửa tay
- [ ] Chạy được trên Windows và Linux (đường dẫn `/`, LF)
- [ ] Không có dữ liệu khách hàng/DLL Siemens/khóa bí mật trong diff
- [ ] `docs/STATE.md` đã cập nhật

## Rủi ro còn lại / việc tiếp theo
- …
