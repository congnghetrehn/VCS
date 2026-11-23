# AUTONOMY — Chính sách tự chủ của AI agent

> Mục tiêu: AI **tự làm gần như toàn bộ** (đọc spec, lập kế hoạch, viết code/test/tài liệu, tự rà soát, ghi chép, bàn giao phiên), chủ sản phẩm **chỉ can thiệp** khi cần: (1) quyết định, (2) thay đổi lớn, (3) test thật với PLCSIM/TIA/SCADA/phần cứng, (4) cung cấp dữ liệu thật.
> File này **ưu tiên hơn** các chỗ trong `AGENTS.md`/`PROMPTS.md` nói "dừng chờ xác nhận" (⚠ plan-first): ở chế độ tự chủ, AI **không dừng chờ** trừ khi gặp mục Tầng C bên dưới — thay vào đó ghi kế hoạch/giả định và đi tiếp bằng mặc định của spec.

## 1. Ba tầng quyết định
| Tầng | Phạm vi | AI làm gì | Chủ sản phẩm |
|---|---|---|---|
| **A — Tự quyết** | Trong spec, rõ ràng: cấu trúc code, đặt tên, thuật toán nội bộ, test, refactor cục bộ, tài liệu, sửa lỗi, chọn thư viện nhỏ đã được phép | Làm, ghi commit/PR; merge vào `develop` khi gate xanh + tự rà soát | Không cần biết |
| **B — Tự quyết có ghi + duyệt sau** | Spec mơ hồ nhưng có **mặc định**; giá trị `VERIFY`; chi tiết ngữ nghĩa ít rủi ro; ngưỡng/ tham số mặc định; lựa chọn kỹ thuật giữa 2 phương án tương đương | Dùng mặc định của spec, **ghi `open-questions.md` (OQ) + dòng trong OWNER-INBOX mục "Duyệt sau"**, thêm test thể hiện lựa chọn, đi tiếp | Duyệt hàng loạt ở cổng milestone; có quyền veto → AI sửa |
| **C — Dừng và hỏi** | xem mục 2 | Ghi mục **QUYẾT ĐỊNH** vào OWNER-INBOX (có lựa chọn + mặc định đề xuất + hệ quả), **chuyển sang việc khác không bị chặn**; không làm phần bị chặn | Quyết định |

## 2. Tầng C — luôn dừng và hỏi
1. **Thay đổi spec/PRD/kiến trúc lõi** (đổi bất biến AGENTS §4, interface lõi, thứ tự bước, đồ thị phụ thuộc, tiêu chí nghiệm thu, phạm vi milestone).
2. **Hạ/nới** ngưỡng chất lượng (bench, mutation, coverage, lint, CI) hoặc tắt kiểm tra.
3. **Dependency lớn**, đổi license, bản mới < 14 ngày, thêm dịch vụ ngoài/ gọi mạng.
4. **Bảo mật/ pháp lý/ IP:** bind ngoài localhost mặc định, lưu bí mật, dữ liệu khách hàng, DLL Siemens, vượt bảo vệ know-how, điều khoản giấy phép.
5. **Dữ liệu thật cần có** (🔑): I/O list, C&E, SimaticML, SCADA node id, biểu mẫu FAT, tài liệu API hãng.
6. **Kiểm thử thật** trên PLCSIM/TIA/SCADA/PLC/phần cứng (tầng T3), kể cả mọi `VERIFY` cần xác nhận bằng thực nghiệm.
7. **Mâu thuẫn spec** chưa có trong `AMENDMENTS.md` mà ảnh hưởng ngữ nghĩa.
8. **Hành động không thể đảo ngược/ ảnh hưởng ngoài repo:** xóa dữ liệu, force-push, sửa lịch sử `main`, phát hành, tạo tài nguyên có phí.
9. **Ký duyệt milestone** (merge `develop` → `main`).

## 3. Không bao giờ chờ — chỉ ghi lại và đi tiếp
Ghi chú kế hoạch, giả định tầng B, câu hỏi cosmetic, đề xuất cải tiến ngoài phạm vi (ghi STATE mục "Đề xuất"), lỗi nhỏ phát hiện ở nơi khác (ghi issue/ OQ).

## 4. Vòng làm việc tự chủ (mỗi phiên)
```
1. Đọc: SOUL → AGENTS → AUTONOMY → STATE → OWNER-INBOX (xem có QUYẾT ĐỊNH đã được trả lời) → AMENDMENTS (mục milestone) → spec.
2. Chọn việc tiếp theo = prompt đầu tiên chưa xong trong PROMPTS.md mà KHÔNG bị chặn bởi mục Tầng C chưa trả lời.
   Nếu mọi prompt đều bị chặn → làm: spike giả lập/ tài liệu/ test bổ sung/ dọn nợ kỹ thuật; nếu vẫn không còn gì → viết "Yêu cầu chủ sản phẩm" tổng hợp rồi dừng.
3. Lập kế hoạch (≤ 15 dòng) vào STATE; liệt kê mơ hồ → phân tầng A/B/C. Tầng C → OWNER-INBOX (không chờ trên chính prompt này nếu có phần độc lập để làm).
4. Làm trên nhánh m{n}/p{n.k}-slug; test cùng lúc; tự tính tay timeline cho phần ngữ nghĩa.
5. Gate đầy đủ. Tự rà soát theo REVIEW-CHECKLISTS §1 (+ chạy H4 bằng phiên/tác tử độc lập nếu công cụ cho phép).
6. Ghi chép: STATE (tiến độ + bàn giao), open-questions (OQ), ADR, OWNER-INBOX, docs/semantics.md, docs/facts/.
7. PR → `develop` (tự merge nếu gate xanh và không có mục Tầng C chưa giải quyết liên quan).
8. Lặp lại tới khi hết việc không bị chặn hoặc cạn ngữ cảnh → bàn giao (H3).
Khi xong prompt cuối của milestone → làm G{n}, mở yêu cầu KÝ DUYỆT trong OWNER-INBOX, rồi **được sang milestone kế tiếp trên `develop`** miễn là tại một thời điểm chỉ có **MỘT milestone đang chờ ký**. Nếu milestone n+1 xong G mà milestone n vẫn chưa ký → dừng làm mới, chỉ làm việc không phụ thuộc (spike giả lập, tài liệu, dọn nợ) và nhắc trong OWNER-INBOX.
```

## 5. Quy tắc nhánh và PR
- `main`: bảo vệ, **chỉ** nhận từ `develop` sau khi chủ sản phẩm ký milestone. `develop`: tích hợp liên tục từ các PR của AI.
- Mỗi prompt = một nhánh = một PR (mẫu `.github/pull_request_template.md`), commit kiểu `feat(kernel): …`.
- AI **không** push trực tiếp `main`, không force-push nhánh dùng chung, không đổi lịch sử đã đẩy.
- CI đỏ → sửa trước khi làm việc khác. Không "tạm tắt" CI.
- Nếu công cụ không có quyền push/ tạo PR: commit cục bộ trên nhánh, ghi rõ trong STATE và OWNER-INBOX ("cần anh push/ tạo PR").

## 6. Giữ cho chủ sản phẩm ít việc nhất
- **Một hộp thư:** chủ sản phẩm chỉ cần đọc `docs/OWNER-INBOX.md` (mỗi mục tự đủ ngữ cảnh để quyết trong < 2 phút).
- Mỗi mục QUYẾT ĐỊNH có: bối cảnh 2–3 dòng, **lựa chọn (A/B/C)**, **mặc định đề xuất + lý do**, hệ quả, việc đang bị chặn, cách trả lời (đánh dấu `[x]` ở lựa chọn rồi commit/ trả lời trong chat).
- Mỗi mục KIỂM THẬT có: **hướng dẫn từng bước** (lệnh/ thao tác), kết quả mong đợi, **cách dán kết quả** (tên file/ mẫu), thời gian ước tính.
- Gom yêu cầu theo đợt (tối đa 1 lần/ngày làm việc) trừ khi bị chặn hoàn toàn; không "spam" từng câu nhỏ.
- Nếu công cụ có `gh`: mỗi mục OPEN tạo một GitHub Issue (nhãn `owner-decision` | `needs-real-test` | `needs-data` | `spec-change` | `signoff`) và ghi số issue vào inbox, để chủ sản phẩm nhận thông báo.

## 7. Tự kiểm soát chất lượng (thay cho việc chủ sản phẩm soi từng PR)
- **Tự rà soát có cấu trúc:** sau gate, chạy `REVIEW-CHECKLISTS §1`; nếu có khả năng, mở một **phiên/ tác tử reviewer độc lập** (không thấy lịch sử, prompt H4) và xử lý hết phát hiện trước khi merge.
- **Chống tự lừa:** không sửa golden/ngưỡng để qua gate; không tắt lint; `review:cheats` sạch; báo cáo tách ĐÃ CHẠY/CHƯA CHẠY/SUY ĐOÁN.
- **Bằng chứng nghiệm thu** (G{n}) lưu ở `docs/acceptance/M{n}.md`; chủ sản phẩm ký ở cổng milestone dựa trên đó + các mục KIỂM THẬT.
- **Ngưỡng dừng an toàn:** cùng một gate hỏng 3 lần, hoặc 2 PR liên tiếp bị reviewer từ chối vì cùng nguyên nhân → dừng, viết phân tích gốc rễ, đề xuất thu hẹp (H2/H7) vào STATE + OWNER-INBOX.

## 8. Mức ưu tiên khi nhiều việc cùng khả dụng
1. Mở khóa việc bị chặn của chính mình (viết hướng dẫn kiểm thật rõ ràng cho chủ sản phẩm) → 2. Sửa CI/ nợ chặn → 3. Prompt tiếp theo theo thứ tự → 4. Tài liệu/ test bổ sung → 5. Spike giả lập.
Không nhảy sang milestone sau nếu việc đó **phụ thuộc trực tiếp** vào một mục KIỂM THẬT/ DỮ LIỆU/ QUYẾT ĐỊNH chưa được trả lời; và luôn tuân theo quy tắc "một milestone chờ ký" ở mục 4.
