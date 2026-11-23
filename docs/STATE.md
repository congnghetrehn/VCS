# STATE — Trạng thái dự án và bàn giao giữa các phiên

> **AI đọc file này đầu mỗi phiên và cập nhật cuối mỗi phiên.** Chủ sản phẩm kiểm tra và ký ở mục "Ký duyệt milestone". Giữ ngắn: tối đa ~150 dòng; lịch sử chi tiết nằm ở git và `docs/acceptance/`.

## 0. Năng lực công cụ (AI điền ở phiên đầu tiên)
- Shell: ? · git đọc/ghi/push: ? · `gh` CLI: ? · Node/pnpm: ? · .NET SDK: ? · mạng: ? · mở được phiên reviewer độc lập: ?
- Hệ điều hành/ môi trường chạy: ?

## 1. Vị trí hiện tại
- Milestone: **M0** (chưa bắt đầu)
- Prompt đang làm / vừa xong: — 
- Nhánh: —
- Cập nhật lần cuối: YYYY-MM-DD bởi <AI/công cụ/phiên>

## 2. Tiến độ prompt
| Prompt | Trạng thái | Commit/PR | Gate (đã tự chạy lại bởi chủ sản phẩm?) | Ghi chú |
|---|---|---|---|---|
| P0.1 | ☐ chưa | | | |
| P0.2 | ☐ chưa | | | |
| … | | | | |

Trạng thái: ☐ chưa · ◐ đang làm · ✔ xong (gate xanh + đã kiểm) · ✖ bị chặn (nêu lý do)

## 3. Việc đang dở (cho phiên sau)
- File/hàm đang sửa: —
- Test đang hỏng (nguyên văn): —
- Lệnh tái hiện nhanh: —
- Bước tiếp theo cụ thể: —

## 4. Quyết định và giả định gần đây
| Ngày | Nội dung | Tham chiếu (ADR/OQ/spec §) |
|---|---|---|
| | | |

## 5. Đang chờ chủ sản phẩm
Chỉ liệt kê **ID** (chi tiết ở `docs/OWNER-INBOX.md`; câu hỏi/ giả định ở `docs/open-questions.md`):
- Chặn tiến độ: —
- Không chặn (duyệt sau): —

## 6. Dữ liệu/môi trường cần có (🔑) và tình trạng
| Cần | Cho prompt | Tình trạng |
|---|---|---|
| Repo + CI | P0.1 | ☐ |
| I/O list thật ẩn danh + quy ước tên | P2.7 | ☐ |
| C&E thật ẩn danh + biểu mẫu FAT | P3.4–P3.5 | ☐ |
| SCADA đích + node id | P4.4 | ☐ |
| Windows + TIA + PLCSIM Advanced + giấy phép | P5.4, P5.6 | ☐ |
| ≥ 10 file SimaticML thật + XSD | P5.7 | ☐ |
| Dự án VCS_Conformance | P5.9 | ☐ |
| Khảo sát độ phủ SCL thật (Spike S1) | trước P1.2 | ☐ |

## 7. Rủi ro đang theo dõi
| Rủi ro | Mức | Giảm thiểu | Người theo dõi |
|---|---|---|---|
| | | | |

## 8. Ký duyệt milestone
| Milestone | Gói nghiệm thu | Ngày ký | Người ký | Ghi chú |
|---|---|---|---|---|
| M0 | docs/acceptance/M0.md | | | |
| M1 | docs/acceptance/M1.md | | | |
| M2 | docs/acceptance/M2.md | | | |
| M3 | docs/acceptance/M3.md | | | |
| M4 | docs/acceptance/M4.md | | | |
| M5 | docs/acceptance/M5.md | | | |
