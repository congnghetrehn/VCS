# AGENTS.md — VCS (Virtual Commissioning Studio)

Đây là **luật chơi** cho mọi AI agent và người đóng góp. Đọc hết trước khi làm. Nếu prompt mâu thuẫn với file này hoặc với spec → **dừng và hỏi**, đừng tự quyết.
Quy tắc riêng cho từng package: `docs/PACKAGE-RULES.md` (và `packages/<x>/AGENTS.md` khi package đã tạo).

## 1. Dự án và nguồn sự thật
VCS = nền tảng web mô phỏng điều khiển công nghiệp trước commissioning: soft-PLC Siemens, plant model, test tự động từ I/O list + C&E, báo cáo FAT, OPC UA/Modbus/S7, HMI, kết nối PLCSIM Advanced. Local-first, on-prem. TypeScript monorepo (pnpm + Turborepo) + công cụ .NET Windows trong `tools/`.

Thứ tự ưu tiên khi có mâu thuẫn:
1. `docs/AMENDMENTS.md` (điều chỉnh chéo giữa các spec — **thắng** spec cũ ở những điểm nó liệt kê);
2. Spec milestone đang làm: `docs/specs/M{n}-*.md`;
3. `docs/PRD.md`;
4. File này (quy trình/chất lượng).
Kiến thức sẵn có của bạn về Siemens / OPC UA / Modbus / S7 / SimaticML **không phải nguồn sự thật**; chỗ spec ghi `VERIFY` thì dùng giá trị mặc định của spec và ghi lại, không tự "sửa cho đúng".
Trạng thái và việc tiếp theo: `docs/STATE.md`. Câu hỏi mở: `docs/open-questions.md`. Quyết định kiến trúc: `docs/adr/`.
Tư duy/ nghề làm việc: `docs/agent/SOUL.md` (đọc mỗi phiên). **Chế độ tự chủ và ranh giới quyết định: `docs/AUTONOMY.md`** (thắng các chỗ "dừng chờ xác nhận" trong file này và `PROMPTS.md`). Mọi thứ cần chủ sản phẩm: `docs/OWNER-INBOX.md`. Kỹ năng theo lĩnh vực: `docs/skills/README.md` (nạp skill liên quan). Sự thật về giao diện hãng: `docs/facts/`. Thử nghiệm giảm rủi ro: `docs/SPIKES.md`.

## 2. Lệnh
```
pnpm install --frozen-lockfile
pnpm dev | build | test | test:integration | test:e2e | lint | typecheck | depcheck | bench | format
pnpm docs:diagnostics        # sinh docs/diagnostics.md (CI chạy --check)
pnpm review:cheats           # quét "mùi lách luật" (scripts/check-cheats.mjs)
pnpm vcs <lệnh> ...          # CLI chạy từ source (tsx)
dotnet test tools/...        # chỉ khi có .NET SDK (Windows)
```
**Gate trước khi báo xong:** `lint && typecheck && depcheck && test && review:cheats` (+ `test:integration`, `test:e2e`, `bench` nếu prompt yêu cầu). Phải **chạy thật và dán kết quả**, không suy đoán.

## 3. Cấu trúc và phụ thuộc (ép bằng dependency-cruiser)
`schemas` ← `kernel`, `project`, `expr` ← `runtime-iec`, `plant`, `comms`, `hmi` ← `vendor-siemens`, `importers`, `testing` ← `apps/{server,cli}`; `apps/web` chỉ import `schemas`, `expr`, `hmi`. Chi tiết: M0 §3.5 và `docs/AMENDMENTS.md`. Package nội bộ **JIT** (`exports` → `src/index.ts`); cấm import xuyên package bằng đường dẫn tương đối.

## 4. Bất biến lõi (vi phạm = lỗi nghiêm trọng)
**Thời gian và bước mô phỏng**
- Thời gian mô phỏng là **số nguyên ms** (`SimClock`). Mọi timer/PLC/plant dùng sim time. **Cấm** `Date.now`, `performance.now`, `Math.random`, `new Date()` ở package lõi (danh sách trong lint; allow-list: `kernel/src/pacer.ts`, `apps/*`, `comms`, `testing/src/{runner,report}`).
- Một bước tại T: `beforeExternals(T)` → drain `post()` → pha `plant` → `controllers` → `gateways` → `tags.flush()` → `afterStep(T)` → `clock.advance(dt)`.
- Plant chạy **trước** controller: PLC thấy giá trị plant của cùng bước T; plant thấy output PLC từ bước T+dt (trễ tối thiểu 1 bước).
- Test (M3): hành động ở **đầu** bước, quan sát ở **cuối** bước (sau scan PLC); `wait until` đúng ở cuối T → hành động kế ở đầu T+dt.
- Cùng cấu hình + seed + đầu vào ⇒ cùng kết quả (`TraceHasher` giống hệt). Chạy có gateway/controller ngoài/ghi từ SCADA là **không** tất định.

**Tag và dữ liệu**
- `TagDB` chỉ chứa tag vùng **I/Q**, truy cập bằng `TagHandle`, **không cấp phát** ở đường nóng. Tag `M/DB` nằm ở `TagCatalog` + `ControllerIntrospection` (đọc/ghi qua controller/broker).
- Thông báo thay đổi theo lô tại `flush()`, chỉ phát khi giá trị **khác** lần flush trước.
- Quyền ghi: owner `plant` ← {plant, system}; `controller` ← {plc, system}; `free` ← {test, hmi, gateway, system}. Ghi từ UI/test/gateway: `checkWrite` rồi `post()` (hiệu lực đầu bước kế; tạm dừng thì `applyInbox`). **Không** ghi TagDB trực tiếp từ ngoài bước.
- `TagValue = boolean | number | string` (không bigint). Real luôn `Math.fround`; DWord/UDInt dùng `>>> 0`; Time = ms nguyên.

**Soft-PLC (M1)**: bộ nhớ Siemens **big-endian**; process image: latch input **đầu** scan, ghi output **cuối** scan; timer/counter theo sim time của scan; lệnh/cú pháp chưa hỗ trợ → lỗi `SCL-U001` (không bỏ qua im lặng); ngữ nghĩa không chắc → ghi `docs/semantics.md` (VERIFIED/UNVERIFIED).
**Plant (M2)**: model làm việc bằng **đơn vị kỹ thuật**, adapter scale raw↔eng; PRNG seeded theo (seed, equipmentId); thứ tự cập nhật theo topo/id; role + synonym của model là nguồn duy nhất cho auto-suggest; import I/O **không** ghi đè trường `provenance: manual`.
**Test (M3)**: file sinh tự động (`tests/generated/**`) không sửa tay; cell không bind được = `UNBOUND` có lý do (không bỏ qua im lặng); báo cáo HTML tất định theo từng byte.
**Comms/HMI (M4)**: adapter ngoài có `step()` đồng bộ + cache + vòng nền; ghi từ SCADA đi qua `TagBroker`; SVG symbol qua **sanitizer allowlist**; nút `momentary` luôn nhả; bí mật qua biến môi trường, không vào log.
**PLCSIM/S7/SimaticML (M5)**: DLL Siemens và dữ liệu dự án khách hàng **không** vào repo; importer **không bịa** cấu trúc XML (dựa XSD + mẫu thật); S7 server ghi một phần tag = từ chối cả yêu cầu; lockstep không dùng đồng hồ thật.

## 5. Quy tắc code
- TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`); ESM. **Không `any`** (trừ ranh giới I/O đã validate bằng zod, có `// boundary:` giải thích). Không `@ts-ignore`, không `eslint-disable` (nếu bắt buộc: ADR + allow-list).
- Danh pháp tiếng Anh; chú thích/tài liệu tiếng Việt được; thông báo người dùng đi qua `Diagnostic` + i18n, không chuỗi cứng.
- Không cấp phát trong vòng lặp nóng (`step`, `get/set`, `flush`); không `console.log` ở package (dùng logger/diagnostic).
- Thêm dependency lớn hoặc bản mới < 14 ngày tuổi: cần ADR. Ghim phiên bản chính xác; commit lockfile.
- Hàm thuần cho parser/codec/mapping; I/O (fs, mạng) ở biên.

## 6. Quy tắc test
- Viết test **trước hoặc cùng** code. Với ngữ nghĩa thời gian/PLC: **tự tính tay bảng timeline trước khi code** và dùng làm golden; không sao chép số từ chính implementation.
- **Cấm** sửa kỳ vọng/golden để test xanh. Nếu kỳ vọng sai: giải thích trong báo cáo, ghi `open-questions.md`, chờ xác nhận.
- Không `.only`, `.skip`, `.todo` (trừ khi có lý do + allow-list), không assert tầm thường (`expect(true)`), không mock che mất hành vi cần kiểm.
- Mỗi mã chẩn đoán phát ra có ≥ 1 test; mỗi quy tắc spec đánh số có test tương ứng.
- Property-based (fast-check) cho codec/bộ nhớ/hash; benchmark có ngưỡng trong spec.
- Test phải chạy được trên **Windows và Linux** (đường dẫn `/`, EOL LF, không phụ thuộc shell).
- Test mạng dùng cổng do OS cấp (`port: 0`), dọn sạch tài nguyên, không phụ thuộc thời gian chính xác.

## 7. Lỗi và chẩn đoán
Mọi lỗi người dùng là `Diagnostic { code, severity, message, file/line/col, hint }`, mã **đăng ký trong `DiagnosticCatalog`**, thông báo nêu **đối tượng + vị trí + hướng sửa**. Lỗi trong một component/gateway/test không làm sập kernel. Không nuốt lỗi (`catch {}` rỗng bị cấm).

## 8. Dữ liệu, bảo mật, sở hữu trí tuệ
- Không commit: DLL/SDK Siemens, file dự án TIA/SimaticML thật, I/O list/C&E thật chưa ẩn danh, chứng chỉ/khóa, token, `.vcs/`. Fixture thật ở kho riêng (`fixtures-real/` đã ignore).
- Mặc định bind `127.0.0.1`; bí mật qua biến môi trường; log không chứa mật khẩu/token.
- Không công cụ nào được cố vượt bảo vệ know-how/giấy phép.
- Dữ liệu khách hàng không được dán vào công cụ AI/dịch vụ ngoài nếu chưa ẩn danh và được phép.

## 9. Quy trình một phiên làm việc
1. **Đọc:** `AGENTS.md` → `docs/agent/SOUL.md` → `docs/AUTONOMY.md` → `docs/STATE.md` → `docs/OWNER-INBOX.md` (có QUYẾT ĐỊNH nào đã được trả lời không?) → `docs/AMENDMENTS.md` (mục milestone) → phần spec mà prompt chỉ định → skill liên quan (`docs/skills/README.md`).
2. **Phạm vi:** làm **đúng một prompt**; chỉ sửa package được nêu; cần sửa ngoài phạm vi thì nêu lý do trước.
3. **Kế hoạch (≤ 15 dòng)** + danh sách mơ hồ, phân tầng A/B/C theo `docs/AUTONOMY.md`. Tầng C → ghi `docs/OWNER-INBOX.md` và làm tiếp phần không bị chặn; **không** dừng chờ ở tầng A/B. Prompt ⚠ plan-first = ghi kế hoạch + tự tính tay timeline vào STATE rồi đi tiếp bằng mặc định của spec.
4. **Làm:** nhánh `m{n}/p{n.k}-slug`; commit nhỏ kiểu `feat(kernel): …`; test cùng lúc.
5. **Gate:** chạy đủ mục 2; sửa tới khi xanh. Cùng một gate hỏng **3 lần** → dừng, báo nguyên nhân và đề xuất thu hẹp phạm vi.
6. **Ghi chép:** cập nhật `docs/STATE.md` (tiến độ + bàn giao); giả định/sai khác → `docs/open-questions.md`; quyết định kiến trúc → `docs/adr/NNNN-*.md`; **mọi thứ cần chủ sản phẩm → `docs/OWNER-INBOX.md`**; sự thật về API/định dạng hãng → `docs/facts/`; kết quả spike → `docs/spikes/`.
7. **Báo cáo cuối (đúng mẫu):** *Đã làm* / *Lệnh đã chạy + kết quả (dán)* / *Giả định tự đặt* / *Sai khác so với spec* / *Rủi ro còn lại* / *Việc tiếp theo*.
Sai khác so với spec **không được merge** nếu chưa có phê duyệt của chủ sản phẩm (tầng C trong `AUTONOMY.md`: ghi OWNER-INBOX mục S + OQ/ADR). Dùng mặc định có sẵn của spec (tầng B) **không** phải sai khác — chỉ cần ghi nhận.

## 10. Definition of Done (mọi task)
Build/lint/typecheck/depcheck/test xanh; `review:cheats` sạch; test mới cho mọi hành vi mới; spec/README package/`docs/` cập nhật; ví dụ trong `examples/` chạy được; không TODO không có tham chiếu (`TODO(OQ-12)`); không thay đổi hành vi ngoài phạm vi; `STATE.md` cập nhật; báo cáo cuối đủ mục.

## 11. Không được làm
- Sửa test/golden/ngưỡng hiệu năng để qua gate; hạ tiêu chí nghiệm thu.
- Thêm "tạm thời" (stub im lặng, giá trị cứng, đường tắt) mà không báo.
- Phá `exports`, import xuyên package, thêm phụ thuộc ngược chiều.
- Sửa file sinh tự động bằng tay (`tests/generated/**`, `plc/generated/**`, `docs/diagnostics.md`, `docs/equipment/*.md`, JSON màn hình HMI ngoài designer/API).
- Tự đoán định dạng/giao thức khi có tài liệu hoặc mẫu thật phải dựa vào (SimaticML, S7comm, API PLCSIM, OPC UA node id); thiếu mẫu → dừng và hỏi.
- Dùng LLM/mạng ngoài trong logic sản phẩm (auto-suggest, parser…).

## 12. Windows và đa nền tảng
LF, UTF-8 không BOM; đường dẫn dự án dùng `/` và tương đối gốc dự án; không script shell riêng (dùng Node + `cross-env`); hash văn bản chuẩn hóa BOM/CRLF; cổng 102/502 có thể cần quyền — mặc định dùng cổng cao hơn (OPC UA 4840, Modbus 1502).

## 13. Khi mâu thuẫn hoặc bí
Mâu thuẫn giữa các spec → xem `docs/AMENDMENTS.md`; chưa có → ghi `open-questions.md` (đề xuất mặc định) và **hỏi**. Thiếu dữ liệu thật (I/O list, C&E, mẫu SimaticML, tài liệu API Siemens) → dừng, nêu chính xác cần gì. Không "đoán cho chạy được".
