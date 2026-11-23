# SKILLS — Sổ tay kỹ năng theo lĩnh vực

> Skill = **kiến thức cô đọng + quy trình + khuôn mẫu + lỗi hay gặp** cho một nhóm việc. Khác `AGENTS.md` (luật) và spec (yêu cầu): skill dạy **cách làm tốt**. Nạp skill **liên quan** theo bảng dưới (không nạp tất cả). Skill **không** thay spec: khi mâu thuẫn, spec/AMENDMENTS thắng; chỗ skill nói "mẫu minh họa" chỉ là gợi ý, không phải API có thật.

| Skill | Khi dùng | Prompt |
|---|---|---|
| [`SKILL-plc-simulation.md`](SKILL-plc-simulation.md) | Soft-PLC, bước mô phỏng, plant model, thuật toán thời gian/số học | P0.3–P0.4, P1.*, P2.1–P2.4, P3.3, P5.2 |
| [`SKILL-testing-and-verification.md`](SKILL-testing-and-verification.md) | Mọi prompt có test; đặc biệt golden tính tay, property, mutation, tất định | tất cả (đọc trước P0.3), nhấn mạnh P1.4–P1.5, P2.2, P2.4, P3.* |
| [`SKILL-tools-and-protocols.md`](SKILL-tools-and-protocols.md) | CLI, importer, generator, codec/ giao thức, server/client mạng, công cụ cầu nối | P0.2, P0.4, P2.5–P2.7, P3.2–P3.6, P4.2–P4.6, P5.1, P5.3, P5.5–P5.8 |
| [`SKILL-ui-pwa-hmi.md`](SKILL-ui-pwa-hmi.md) | Web UI, bảng thời gian thực, HMI/SVG designer, a11y, i18n, PWA | P0.6, P2.8, P3.8, P4.6–P4.8, P0.9 |
| [`SKILL-siemens-integration.md`](SKILL-siemens-integration.md) | PLCSIM Advanced, TIA Openness, SimaticML, S7comm, OPC UA node id — **quy trình "sự thật trước"** | P4.4, P5.* (bắt buộc) |

Thêm: `docs/SPIKES.md` (các thử nghiệm nhỏ nên làm **trước** để giảm rủi ro) và `docs/facts/` (sổ sự thật về giao diện hãng — xem skill Siemens).

**Cách dùng trong prompt:** thêm dòng *"Nạp thêm: docs/agent/SOUL.md, docs/skills/SKILL-… (mục …)"* sau dòng "Đọc:". AI đọc skill **sau** spec và tự kiểm bằng checklist cuối skill trước khi báo xong.
