# SKILL — Kiểm thử và kiểm chứng

> Dùng khi: viết/ sửa **bất kỳ** test; nhất là golden timeline (M1, M2, M3), property test (codec, bộ nhớ, TagDB), tất định, mutation, conformance, benchmark.
> Triết lý: **test là bằng chứng**, không phải thủ tục. Một test không thể đỏ khi code sai là test vô dụng.

## 1. Các loại test và khi nào dùng
| Loại | Dùng cho | Công cụ | Ghi chú |
|---|---|---|---|
| Unit (thuần) | parser, codec, mapping, số học | Vitest | nhanh, nhiều, table-driven |
| **Golden timeline (tính tay)** | ngữ nghĩa thời gian/PLC/plant/executor | YAML/TS table | nguồn sự thật = phép tính tay + spec, **không** từ output của code |
| Property-based | encode∘decode, bộ nhớ chồng lấn, flush TagDB, timer vs mô hình tham chiếu | fast-check | sinh đầu vào ngẫu nhiên có seed |
| Tất định/ hash | mô phỏng lặp lại | `TraceHasher` | 2 lần chạy + restore giữa chừng |
| Integration (mạng) | OPC UA/Modbus/S7/Bridge | Vitest project riêng | cổng `port: 0`, dọn sạch |
| E2E UI | luồng người dùng | Playwright | ít mà chắc |
| Mutation | chất lượng bộ test C&E | `scripts/mutate-scl.ts` | mutant sống phải được phân loại |
| Conformance | SoftPlc ↔ PLCSIM | `vcs conformance` | cần phần cứng/ phần mềm Siemens |
| Benchmark | ngưỡng hiệu năng | `pnpm bench` | có warm-up, nhiều lần đo |

## 2. Golden timeline tính tay — quy trình bắt buộc
1. Chép **luật** liên quan (step order, độ trễ plant→PLC, process image…) từ spec.
2. Dựng bảng: `T | tác động ngoài | plant (trạng thái) | PLC scan (đọc gì/ghi gì) | tag quan sát`.
3. Tính **từng hàng bằng tay**; đánh dấu hàng "đáng nghi" (cạnh biên: `elapsed ≥ PT` đúng/ sai 1 bước).
4. Đối chiếu bảng trong spec (nếu có). **Khác → dừng, nêu lập luận, ghi `open-questions.md`.**
5. Mới chuyển bảng thành test; implementation chạy ra khác bảng ⇒ lỗi code (hoặc spec) — **không** sửa bảng cho khớp.
```yaml
# mẫu golden (rút gọn) — kỳ vọng do người tính, không phải do code sinh
id: ton_basic_3s
expectedFrom: spec            # spec | siemens-docs | plcsim
config: { scanPeriodMs: 100 }
steps:
  - { t: 200,  set: { "%M0.0": true },  expect: { "%M1.0": false, "\"T1\".ET": 0 } }
  - { t: 3100,                           expect: { "%M1.0": false, "\"T1\".ET": 2900 } }
  - { t: 3200,                           expect: { "%M1.0": true,  "\"T1\".ET": 3000 } }
```
- Mỗi golden ghi `expectedFrom`. Chỉ `plcsim` mới là chuẩn vàng; `spec` chờ xác minh.
- **Thay đổi golden** cần nguồn sự thật (điều khoản spec/ tài liệu/ phép tính tay/ kết quả PLCSIM) — nếu không có, hoàn tác (prompt H6).

## 3. Table-driven và đặt tên
```ts
const cases: Array<[name: string, input: Input, expected: Output]> = [ /* … */ ];
it.each(cases)('%s', (_n, input, expected) => expect(fn(input)).toEqual(expected));
```
- Tên test = hành vi ("TON không đặt Q trước khi elapsed ≥ PT"), không phải tên hàm.
- Arrange–Act–Assert; mỗi test một lý do để đỏ. Biên là nơi lỗi sống: `PT−1`, `PT`, `PT+1`; `32767`/`32768`; rỗng/1/max phần tử.

## 4. Property-based
```ts
import fc from 'fast-check';
it('encode∘decode là phép đồng nhất cho Real/Int/…', () => {
  fc.assert(fc.property(fc.float({ noNaN: true }), (x) => {
    expect(decodeReal(encodeReal(Math.fround(x)))).toBe(Math.fround(x));
  }), { seed: 42, numRuns: 500 });
});
```
- Dùng cho: **codec** (Modbus/S7/VBP), **bộ nhớ** (ghi độ rộng này đọc độ rộng khác so với mô hình byte-array tham chiếu), **TagDB** (chuỗi ghi/flush so với mô hình tham chiếu đơn giản), **timer** (TON ⇔ IN liên tục ≥ PT), **snapshot/restore**, **parse(print(x)) = x**.
- Luôn cố định `seed`; khi fail, in seed + ví dụ co gọn; thêm ví dụ đó thành test thường.
- Mô hình tham chiếu phải **đơn giản đến mức hiển nhiên đúng** (không tái dùng code đang test).

## 5. Tất định
- `TraceHasher.hash()` sau cùng một chuỗi bước = giống hệt; chạy 2 lần; chạy N → snapshot → M → restore → M lại.
- Hash **không** chứa wall time, đường dẫn tuyệt đối, thứ tự `Map` không ổn định.
- Test tất định chạy cả Windows và Linux (EOL/ BOM/ locale `toFixed`/ thứ tự `readdir`).

## 6. Thời gian, bất đồng bộ, mạng
- Không `sleep` thật trong test logic → dùng `FakeClock`/sim time. Với mạng thật dùng `waitFor(cond, {timeout})`, không `setTimeout` cố định.
- Cổng: `listen(0)` rồi đọc cổng thực. `afterEach` đóng mọi socket/server/timer; `stop()` idempotent; test rò tài nguyên = bug.
- **Flaky = bug**, không phải "chạy lại cho qua". Quy trình: tái hiện bằng seed/vòng lặp → tìm nguyên nhân (race, thứ tự, thời gian) → sửa; cách ly tạm thời chỉ qua allow-list kèm OQ và hạn.

## 7. Mutation và phân loại mutant sống
Mutant sống thuộc một trong ba loại: **(a) tương đương** (đổi mà hành vi không đổi) → đánh dấu `equivalent` kèm lý do, chủ sản phẩm duyệt; **(b) thiếu test** → viết test (thường là negative check hoặc biên thời gian); **(c) thiếu binding/ thiết lập** (không có cách kích/ quan sát) → bổ sung binding. Ghi vào `docs/mutation-notes.md`. Không hạ ngưỡng.

## 8. Chất lượng assertion — tự hỏi
- *Nếu implementation sai theo cách X, test này có đỏ không?* (nghĩ ra 2 cách sai và kiểm).
- Không so sánh kết quả với chính hàm đang test; không assert "không ném lỗi" như bằng chứng đúng.
- Không mock thứ đang kiểm; mock chỉ ở **biên** (mạng, đồng hồ, FS) và test hợp đồng của biên đó riêng.
- Snapshot chỉ cho dữ liệu ổn định, nhỏ, có người đọc (IR dump, CSV map); snapshot lớn "ai chấp nhận cũng được" là nợ.

## 9. Benchmark có kỷ luật
- Warm-up, nhiều lần đo, lấy trung vị; cố định kích thước dữ liệu (`bench/project-5000`).
- **Không cấp phát:** `node --expose-gc`; `gc()` → đo `process.memoryUsage().heapUsed` → chạy N thao tác → `gc()` → đo lại; tăng < ngưỡng.
- Ghi `bench/results.json`; hồi quy > 20% → cảnh báo. Không chạy bench trong CI chung (nhiễu) trừ job riêng.

## 10. Đa nền tảng
Đường dẫn dùng `/`; không giả định `\n`; `os.tmpdir()` thay `/tmp`; không phụ thuộc shell; khóa file Windows (đóng handle trước khi xóa); cổng < 1024 cần quyền; phân biệt hoa/thường của hệ file.

## 11. Bằng chứng khi báo cáo
Dán **lệnh + kết quả nguyên văn** (số test, thời gian, hash). Nêu số test **mới**, mã chẩn đoán mới, các bảng timeline đã tính tay (liên kết). Tách ĐÃ CHẠY / CHƯA CHẠY / SUY ĐOÁN (SOUL §6).

## 12. Lỗi hay gặp
Sửa kỳ vọng cho xanh · golden sinh từ output của code · test chỉ kiểm đường vui · biên không test · mock che hành vi · sleep thật · cổng cố định · không dọn tài nguyên · hash lẫn wall time · property test không seed · mô hình tham chiếu sao chép implementation · coverage cao nhưng assert rỗng · bỏ qua Windows.

## 13. Checklist tự kiểm
☐ Có bảng tính tay cho phần ngữ nghĩa · ☐ biên đã test · ☐ mỗi mã chẩn đoán có test · ☐ property test có seed · ☐ 2 lần chạy cùng hash · ☐ không flaky (chạy 3 lần) · ☐ không `.only/.skip` · ☐ không đổi golden không nguồn · ☐ chạy được trên Windows · ☐ bench có số liệu.
