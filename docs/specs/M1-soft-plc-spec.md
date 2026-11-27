# M1 — Soft-PLC lõi: Đặc tả chi tiết

## Mục lục

- [1. Mục tiêu và phạm vi M1](#1-mục-tiêu-và-phạm-vi-m1)
  - [1.1 Mục tiêu](#11-mục-tiêu)
  - [1.2 Trong phạm vi (P0)](#12-trong-phạm-vi-p0)
  - [1.3 Ngoài phạm vi M1 (không làm, không "làm tạm")](#13-ngoài-phạm-vi-m1-không-làm-không-làm-tạm)
- [2. Cấu trúc package](#2-cấu-trúc-package)
- [3. Kiểu dữ liệu và bộ nhớ](#3-kiểu-dữ-liệu-và-bộ-nhớ)
  - [3.1 Kiểu dữ liệu M1](#31-kiểu-dữ-liệu-m1)
  - [3.2 Bộ nhớ](#32-bộ-nhớ)
  - [3.3 Địa chỉ tuyệt đối (parser trong `vendor-siemens/address.ts`)](#33-địa-chỉ-tuyệt-đối-parser-trong-vendor-siemensaddressts)
  - [3.4 Layout DB / Struct (standard access) — `layout.ts` `VERIFY`](#34-layout-db-struct-standard-access-layoutts-verify)
  - [3.5 Instance DB và multi-instance](#35-instance-db-và-multi-instance)
- [4. Front-end SCL](#4-front-end-scl)
  - [4.1 Lexer](#41-lexer)
  - [4.2 Ngữ pháp (EBNF rút gọn, bắt buộc bám sát)](#42-ngữ-pháp-ebnf-rút-gọn-bắt-buộc-bám-sát)
  - [4.3 Ưu tiên toán tử (cao → thấp)](#43-ưu-tiên-toán-tử-cao-thấp)
  - [4.4 Type check (`typecheck.ts`)](#44-type-check-typecheckts)
- [5. Front-end LAD](#5-front-end-lad)
  - [5.1 Schema JSON (`lad/schema.ts`, validate bằng zod)](#51-schema-json-ladschemats-validate-bằng-zod)
  - [5.2 Ngữ nghĩa LAD](#52-ngữ-nghĩa-lad)
- [6. IR (cấu trúc, không phải bytecode)](#6-ir-cấu-trúc-không-phải-bytecode)
- [7. Interpreter và mô hình thực thi](#7-interpreter-và-mô-hình-thực-thi)
  - [7.1 Frame](#71-frame)
  - [7.2 Quy tắc số học (phải giống nhau mọi nơi; ghi vào `docs/semantics.md`)](#72-quy-tắc-số-học-phải-giống-nhau-mọi-nơi-ghi-vào-docssemanticsmd)
  - [7.3 Hàm intrinsic M1 (đăng ký qua `IntrinsicRegistry`)](#73-hàm-intrinsic-m1-đăng-ký-qua-intrinsicregistry)
- [8. Scan và lập lịch (scheduler)](#8-scan-và-lập-lịch-scheduler)
  - [8.1 Trạng thái CPU](#81-trạng-thái-cpu)
  - [8.2 Chu kỳ](#82-chu-kỳ)
  - [8.3 Cyclic OB](#83-cyclic-ob)
  - [8.4 Process image — quy tắc đọc/ghi trong scan](#84-process-image-quy-tắc-đọcghi-trong-scan)
  - [8.5 Thời gian](#85-thời-gian)
- [9. Ngữ nghĩa các system block (`runtime-iec/std`)](#9-ngữ-nghĩa-các-system-block-runtime-iecstd)
  - [9.1 Edge](#91-edge)
  - [9.2 Bistable](#92-bistable)
  - [9.3 Timer IEC (theo thời gian mô phỏng, độ phân giải = chu kỳ scan)](#93-timer-iec-theo-thời-gian-mô-phỏng-độ-phân-giải-chu-kỳ-scan)
  - [9.4 Counter IEC (`PV, CV` kiểu Int mặc định; biến thể DInt theo tham số kiểu)](#94-counter-iec-pv-cv-kiểu-int-mặc-định-biến-thể-dint-theo-tham-số-kiểu)
- [10. API công khai](#10-api-công-khai)
- [11. UI tối thiểu của M1 (`apps/web`)](#11-ui-tối-thiểu-của-m1-appsweb)
- [12. Chiến lược test](#12-chiến-lược-test)
  - [12.1 Golden test format (`runtime-iec/golden/*.golden.yaml`)](#121-golden-test-format-runtime-iecgoldengoldenyaml)
  - [12.2 Số lượng tối thiểu (≥ 80 golden + unit test riêng)](#122-số-lượng-tối-thiểu-80-golden-unit-test-riêng)
  - [12.3 Property-based (fast-check)](#123-property-based-fast-check)
  - [12.4 Benchmark (`pnpm bench`)](#124-benchmark-pnpm-bench)
- [13. Demo chấp nhận: `examples/motor-interlock`](#13-demo-chấp-nhận-examplesmotor-interlock)
- [14. Danh sách VERIFY với PLCSIM (việc của chủ sản phẩm)](#14-danh-sách-verify-với-plcsim-việc-của-chủ-sản-phẩm)
- [15. Kế hoạch triển khai và prompt cho AI](#15-kế-hoạch-triển-khai-và-prompt-cho-ai)
  - [Prompt mẫu](#prompt-mẫu)
- [16. Tiêu chí nghiệm thu M1 (tất cả phải đạt)](#16-tiêu-chí-nghiệm-thu-m1-tất-cả-phải-đạt)
- [17. Quyết định mặc định (để AI không dừng hỏi)](#17-quyết-định-mặc-định-để-ai-không-dừng-hỏi)

> Thuộc dự án VCS (xem `PRD.md`, milestone M1, FR-201 … FR-206, FR-301, FR-302, FR-305).
> Phiên bản: 0.1 (2026-11-21). Thời lượng dự kiến: 2–3 tuần công (10–15 ngày làm việc).
> Dành cho: AI coding assistant. Khi spec này mâu thuẫn với "kiến thức sẵn có" của AI về Siemens, **spec thắng**. Chỗ nào không chắc về ngữ nghĩa Siemens, spec gắn thẻ `VERIFY` và đặt **giá trị mặc định** để AI không bị kẹt; chủ sản phẩm sẽ kiểm tra bằng PLCSIM (mục 14) rồi cập nhật `docs/semantics.md` + golden test.

---

## 1. Mục tiêu và phạm vi M1

### 1.1 Mục tiêu
Một **soft-PLC chạy được, deterministic, theo ngữ nghĩa Siemens S7-1200/1500**, đủ để chạy logic điều khiển motor/interlock thực tế bằng **SCL** và **LAD** (tập con), điều khiển qua watch/force, chạy trong Node và Web Worker, có test ngữ nghĩa dày.

### 1.2 Trong phạm vi (P0)
- Front-end SCL: lexer, parser, kiểm tra kiểu (type check), báo lỗi có vị trí.
- Front-end LAD: schema JSON, chuyển LAD → IR.
- IR phi-vendor + interpreter (biên dịch IR → closures).
- Mô hình bộ nhớ Siemens: vùng I/Q/M, DB (global + instance), big-endian, địa chỉ tuyệt đối và symbolic.
- Block: OB1, OB100, cyclic OB (OB30–38, OB ≥ 123), FC, FB, multi-instance.
- Lệnh: bit logic, so sánh, toán, chuyển đổi, NORM_X/SCALE_X, LIMIT/MIN/MAX/ABS/SQRT, shift/rotate, R_TRIG/F_TRIG, SR/RS, TON/TOF/TP/TONR, CTU/CTD/CTUD.
- Scan semantics: process image input/output, thời gian theo sim clock.
- `SoftPlc` cài `ControllerAdapter` (PRD 8.4) + watch/force API.
- Golden test runner + ≥ 80 golden test + demo `motor-interlock`.

### 1.3 Ngoài phạm vi M1 (không làm, không "làm tạm")
Plant engine, import I/O list, HMI, OPC UA/Modbus, FBD editor, PID_Compact, STRING/WSTRING, retentive/warm restart, `:P` access, S7-1500 optimized-access chi tiết, VARIANT, pointer/ANY, F-safety, MC_*, TCON/TSEND, UI editor hoàn chỉnh (M1 chỉ cần editor SCL tối thiểu + watch table; LAD editor đồ họa để M1.5/M2 nếu hết thời gian — nhưng **schema LAD + compiler LAD→IR là bắt buộc**).

---

## 2. Cấu trúc package

```
packages/
  runtime-iec/                       # vendor-neutral
    src/
      ir.ts                          # định nghĩa IR (mục 6)
      types.ts                       # DataType, TypeInfo, kích thước/alignment
      memory.ts                      # MemoryArea, DbStore, accessor big-endian
      layout.ts                      # tính layout DB/Struct/Array
      interpreter.ts                 # IR -> closures
      scheduler.ts                   # OB scheduling (mục 8)
      softplc.ts                     # SoftPlc implements ControllerAdapter
      forces.ts                      # force table
      diagnostics.ts                 # Diagnostic, RuntimeFault
      std/                           # system FB chuẩn IEC
        ton.ts tof.ts tp.ts tonr.ts ctu.ts ctd.ts ctud.ts
        rtrig.ts ftrig.ts sr.ts rs.ts
      index.ts
    golden/                          # golden tests (mục 12)
    test/
  vendor-siemens/
    src/
      scl/
        lexer.ts  parser.ts  ast.ts  typecheck.ts  lower.ts   # AST -> IR
      lad/
        schema.ts  validate.ts  lower.ts                       # LAD JSON -> IR
      address.ts                     # parse %I0.0, %IW64, DB1.DBX0.0...
      intrinsics.ts                  # ABS, SQRT, LIMIT, NORM_X, SCALE_X, conversions
      project.ts                     # đọc plc/*.scl, *.lad.json, DB yaml, tags.yaml
      index.ts
    test/
docs/
  semantics.md                       # mọi quyết định ngữ nghĩa (mục 14)
  compat-matrix.md
```

Quy tắc phụ thuộc: `runtime-iec` **không** import `vendor-siemens`. `vendor-siemens` import `runtime-iec` (IR types, std blocks, registry). Hàm intrinsic Siemens đăng ký vào `IntrinsicRegistry` do `runtime-iec` cung cấp.

---

## 3. Kiểu dữ liệu và bộ nhớ

### 3.1 Kiểu dữ liệu M1

| Kiểu | Kích thước | Biểu diễn JS trong interpreter | Ghi chú |
|---|---|---|---|
| Bool | 1 bit | `boolean` | |
| Byte | 8 | `number` (0..255) | |
| Word | 16 | `number` (0..65535) | |
| DWord | 32 | `number` (0..2³²−1, dùng `>>> 0`) | |
| SInt/USInt/UInt/UDInt | 8/8/16/32 | `number` | P1 trong M1 nếu kịp (khuyến nghị làm, rẻ) |
| Int | 16 | `number` (−32768..32767) | |
| DInt | 32 | `number` (−2³¹..2³¹−1) | |
| Real | 32 | `number`, **luôn ép qua `Math.fround`** sau mỗi phép toán | |
| LReal | 64 | `number` | |
| Time | 32 (DInt ms) | `number` (ms, có dấu) | literal `T#1h2m3s4ms` |
| Array[lo..hi] of T | | | chỉ 1 chiều trong M1 (nhiều chiều P1) |
| Struct, UDT | | | lồng nhau cho phép |

> `Math.fround` bắt buộc cho Real; thiếu nó sẽ làm kết quả lệch PLC thật.

### 3.2 Bộ nhớ

- Mỗi vùng là `Uint8Array` + `DataView`. **Big-endian** (Siemens): `getUint16(offset, false)`.
- Vùng: `I` (process image input, mặc định 1024 byte), `Q` (1024), `M` (mặc định 8192; cấu hình được), mỗi DB là `Uint8Array` riêng theo layout.
- Truy cập chồng lấn phải đúng: ghi `%MW0 := 16#1234` thì `%MB0 = 16#12`, `%MB1 = 16#34`, `%M0.0 = false`, `%M1.2 = true` (0x34 = 0011 0100 → bit2 = 1).
- Bit addressing: `%M<byte>.<bit>`, bit 0 = LSB.

### 3.3 Địa chỉ tuyệt đối (parser trong `vendor-siemens/address.ts`)

| Dạng | Ví dụ | Ý nghĩa |
|---|---|---|
| `%I<b>.<bit>`, `%Q`, `%M` | `%I0.0` | bit |
| `%IB<b>`, `%QB`, `%MB` | `%MB10` | Byte |
| `%IW<b>`, `%QW`, `%MW` | `%IW64` | Word (đọc như Int/Word tùy kiểu khai báo) |
| `%ID<b>`, `%QD`, `%MD` | `%MD20` | DWord/DInt/Real |
| `DB<n>.DBX<b>.<bit>` / `DBB` / `DBW` / `DBD` | `DB1.DBW4` | truy cập tuyệt đối DB |

Địa chỉ không có `%` (kiểu `I0.0`, `Q0.0`, `M0.0`) cũng parse được (theo cách TIA hiển thị), chuẩn hóa nội bộ thành dạng `%`.

### 3.4 Layout DB / Struct (standard access) — `layout.ts` `VERIFY`
Thuật toán mặc định:
1. Bool: gói theo bit trong byte; chuỗi Bool liên tiếp dùng chung byte; khi gặp phần tử không phải Bool → kết thúc byte hiện tại.
2. Byte/SInt/USInt: 1 byte, không cần căn chẵn.
3. Word/Int/UInt/DWord/DInt/UDInt/Real/Time (≥ 2 byte): bắt đầu ở **offset chẵn**.
4. LReal: offset chẵn (S7 không yêu cầu căn 8) `VERIFY`.
5. Struct/UDT/Array: bắt đầu ở offset chẵn, kết thúc ở offset chẵn (padding). Array of Bool: gói bit `VERIFY`.
6. Tổng kích thước DB làm tròn lên chẵn.

Trả về `FieldInfo { name, type, byteOffset, bitOffset?, size }`. M1 chỉ cần layout đúng và truy cập đúng; export địa chỉ tuyệt đối cho Snap7 là việc sau, nhưng layout phải đúng ngay để khỏi sửa.

### 3.5 Instance DB và multi-instance
- Mỗi FB được gọi với instance DB (`"FB_Motor_DB"`) có layout = `VAR_INPUT + VAR_OUTPUT + VAR_IN_OUT(tham chiếu, M1: 4 byte nội bộ không lộ) + VAR(static)` theo thứ tự khai báo.
- Multi-instance: FB con khai báo trong `VAR` (static) của FB cha → layout lồng trong instance DB của cha.
- System FB (`TON`, `CTU`, `R_TRIG`...) khai báo trong `VAR` như một kiểu: `sT : TON;` → vùng con có layout định nghĩa trong `std/*.ts` (gồm trường công khai + trường nội bộ ẩn như `_startTime`, `_state`).

---

## 4. Front-end SCL

### 4.1 Lexer
- Không phân biệt hoa/thường với từ khóa và tên kiểu; **tên symbol** trong dấu nháy kép `"..."` phân biệt hoa/thường.
- Comment: `// ...` đến hết dòng, `(* ... *)` nhiều dòng (không lồng — `VERIFY` có lồng không; M1 không hỗ trợ lồng, báo lỗi rõ).
- Token biến local: `#name`. Token biến global: `"Name"`. Truy cập member: `.`, mảng: `[ ]`.
- Literal:
  - Số nguyên: `123`, `-5`, `16#FF`, `2#1010_0101`, `8#17`; chấp nhận `_` phân tách.
  - Real: `1.5`, `3.0E-2`, `1e3`.
  - Bool: `TRUE`, `FALSE`.
  - Time: `T#5s`, `T#1h30m`, `T#500ms`, `T#-2s`, `TIME#...`.
  - Có kiểu: `INT#5`, `REAL#1.0`, `DINT#-1`, `WORD#16#FFFF`.
  - String: không hỗ trợ (lỗi rõ ràng).
- Mỗi token có `{ line, col, offset, length }`.

### 4.2 Ngữ pháp (EBNF rút gọn, bắt buộc bám sát)

```ebnf
file         = { block } ;
block        = ob | fc | fb | udt | db ;

ob           = "ORGANIZATION_BLOCK" name { var_section } "BEGIN" { stmt } "END_ORGANIZATION_BLOCK" ;
fc           = "FUNCTION" name [ ":" type ] { var_section } "BEGIN" { stmt } "END_FUNCTION" ;
fb           = "FUNCTION_BLOCK" name { var_section } "BEGIN" { stmt } "END_FUNCTION_BLOCK" ;
udt          = "TYPE" name "STRUCT" { var_decl } "END_STRUCT" ";" "END_TYPE" ;
db           = "DATA_BLOCK" name ( "\"" fbname "\"" | "STRUCT" { var_decl } "END_STRUCT" ) [ "BEGIN" { init } ] "END_DATA_BLOCK" ;

var_section  = ( "VAR_INPUT" | "VAR_OUTPUT" | "VAR_IN_OUT" | "VAR" | "VAR_TEMP" | "VAR_CONSTANT" ) { var_decl } "END_VAR" ;
var_decl     = ident ":" type [ ":=" const_expr ] ";" ;
type         = elementary | "Array" "[" int ".." int "]" "of" type | "Struct" ... "END_STRUCT" | name ;

stmt         = assign | if | case | for | while | repeat | exit | continue | return | call | ";" ;
assign       = lvalue ":=" expr ";" ;
lvalue       = ref { "." ident | "[" expr { "," expr } "]" } ;
ref          = "#" ident | "\"" ident "\"" | absaddr ;
if           = "IF" expr "THEN" { stmt } { "ELSIF" expr "THEN" { stmt } } [ "ELSE" { stmt } ] "END_IF" ";" ;
case         = "CASE" expr "OF" { caselabel ":" { stmt } } [ "ELSE" { stmt } ] "END_CASE" ";" ;
caselabel    = const { "," const } | const ".." const (kết hợp bằng ",") ;
for          = "FOR" lvalue ":=" expr "TO" expr [ "BY" expr ] "DO" { stmt } "END_FOR" ";" ;
while        = "WHILE" expr "DO" { stmt } "END_WHILE" ";" ;
repeat       = "REPEAT" { stmt } "UNTIL" expr "END_REPEAT" ";" ;
call         = callee "(" [ args ] ")" ";" ;
args         = arg { "," arg } ;
arg          = ident ":=" expr | ident "=>" lvalue | expr ;    (* positional chỉ cho FC; FB phải đặt tên *)
expr         = ... theo bảng ưu tiên 4.3 ;
primary      = literal | lvalue | "(" expr ")" | func_call ;
func_call    = ident "(" [ args ] ")" ;                          (* FC trả giá trị hoặc intrinsic *)
```

Ghi chú:
- Dấu `;` bắt buộc cuối statement; thiếu → lỗi `SCL-P001 expected ';'` tại vị trí token trước đó.
- FB call: `#sT(IN := #x, PT := T#3s);` hoặc `"FB_Motor_DB"(iStart := ...)`; đọc output sau đó qua `#sT.Q` hoặc `"FB_Motor_DB".qRun`. Cú pháp `Q => #y` trong lời gọi cũng hỗ trợ.
- FC trả giá trị: dùng trong biểu thức hoặc gán `#r := "FC_Scale"(x := ...)`. FC không trả giá trị gọi như statement.
- `EXIT`/`CONTINUE` chỉ hợp lệ trong vòng lặp; `RETURN` thoát block hiện tại.
- Vòng lặp: giới hạn an toàn `maxLoopIterations` (mặc định 100 000/vòng/scan); vượt → RuntimeFault `LOOP_LIMIT`, thoát vòng.

### 4.3 Ưu tiên toán tử (cao → thấp)

| Mức | Toán tử |
|---|---|
| 1 | `( )` |
| 2 | `**` |
| 3 | unary `+`, `-`, `NOT` |
| 4 | `*`, `/`, `MOD`, `DIV` |
| 5 | `+`, `-` |
| 6 | `<`, `>`, `<=`, `>=` |
| 7 | `=`, `<>` |
| 8 | `AND`, `&` |
| 9 | `XOR` |
| 10 | `OR` |

`AND/OR/XOR/NOT` áp dụng cho Bool (logic) **và** Byte/Word/DWord (bitwise) tùy kiểu toán hạng. Hai vế khác loại → lỗi kiểu.

### 4.4 Type check (`typecheck.ts`)

- Ngầm định chỉ cho phép **mở rộng (widening)**: `SInt→Int→DInt`, `USInt→UInt→UDInt`, `Int/DInt→Real→LReal`, `Byte→Word→DWord` (bit-string), `Real→LReal`. `Bool` không ép sang gì cả.
- Thu hẹp (`Real→Int`, `DInt→Int`, `Word→Int` ...) **phải dùng hàm chuyển đổi** tường minh: lỗi `SCL-T010` kèm gợi ý "dùng `REAL_TO_INT(...)`/`TRUNC(...)`" `VERIFY` (đặt strict làm mặc định).
- Kiểu kết quả: `Int ∘ Int → Int` (không tự lên DInt), `Int ∘ DInt → DInt`, `Int ∘ Real → Real`, `Real ∘ LReal → LReal`. Chia số nguyên cắt về 0 (`7 / 2 = 3`, `-7 / 2 = -3`). `MOD` dấu theo số bị chia (như JS `%`). `**` luôn trả Real/LReal.
- So sánh trả Bool. So sánh Time dùng giá trị ms.
- Kiểm tra: tên chưa khai báo, gán vào `VAR_INPUT` trong FB/FC (cấm), gọi FB thiếu instance, tham số không tồn tại, thừa/thiếu tham số bắt buộc (FC), kiểu tham số sai, truy cập member/mảng sai, chỉ số hằng ngoài khoảng, `EXIT/CONTINUE` ngoài vòng lặp.
- Mọi lỗi → `Diagnostic { code, severity, file, line, col, endLine, endCol, message, hint? }`. Parser **phục hồi lỗi** ở mức statement (đồng bộ tại `;` hoặc từ khóa kết thúc) để báo nhiều lỗi trong một lần compile (tối đa 100).

---

## 5. Front-end LAD

### 5.1 Schema JSON (`lad/schema.ts`, validate bằng zod)

```ts
type LadBlock = {
  kind: 'FC' | 'FB' | 'OB';
  name: string; number?: number;
  interface: InterfaceDecl;            // cùng dạng với SCL (input/output/inout/static/temp)
  networks: LadNetwork[];
};

type LadNetwork = {
  id: string; title?: string; comment?: string;
  rung: LadRung;
};

/** Một rung = chuỗi phần tử nối tiếp, từ power rail trái sang phải */
type LadRung = LadElement[];

type LadElement =
  | { t: 'contact'; mode: 'NO' | 'NC'; operand: Operand }
  | { t: 'pos'; operand: Operand; memBit: Operand }      // edge dương (P_TRIG)
  | { t: 'neg'; operand: Operand; memBit: Operand }
  | { t: 'parallel'; branches: LadRung[] }              // các nhánh song song, OR kết quả
  | { t: 'not' }                                        // đảo RLO
  | { t: 'coil'; mode: 'normal' | 'negated'; operand: Operand }
  | { t: 'set'; operand: Operand }                      // S coil
  | { t: 'reset'; operand: Operand }                    // R coil
  | { t: 'box'; fn: BoxFn; instance?: Operand; inputs: Record<string, Operand | Const>; outputs: Record<string, Operand> };

type BoxFn =
  | 'TON'|'TOF'|'TP'|'TONR'|'CTU'|'CTD'|'CTUD'|'SR'|'RS'
  | 'EQ'|'NE'|'LT'|'LE'|'GT'|'GE'
  | 'ADD'|'SUB'|'MUL'|'DIV'|'MOVE'|'CONVERT'|'NORM_X'|'SCALE_X'|'LIMIT'|'MIN'|'MAX';

type Operand = { sym: string } | { abs: string } | { local: string };   // "Tag", %I0.0, #var
type Const   = { const: number | boolean; type?: DataType };
```

### 5.2 Ngữ nghĩa LAD
- **RLO** (result of logic operation): bắt đầu = `true` ở power rail trái. `contact NO`: `rlo = rlo AND value`; `NC`: `rlo = rlo AND NOT value`. `parallel`: `rlo = OR(branch_i(rlo_in))`. `not`: `rlo = !rlo`.
- `coil normal`: ghi `operand := rlo`; `negated`: `operand := !rlo`. `set`: nếu `rlo` thì `operand := true`. `reset`: nếu `rlo` thì `operand := false`.
- `box`: `rlo` là **EN**. Nếu EN = true, thực thi box; nếu false: box **không** thực thi (riêng TON/TOF/TP/CTU...: IN lấy từ `inputs.IN`, không lấy từ EN — các box timer/counter luôn được "gọi" mỗi scan, giống SCL). Box toán/so sánh/MOVE chỉ thực thi khi EN. `ENO` = EN (M1 không có lỗi ENO) `VERIFY`. Box so sánh phát ra RLO mới = `EN AND (kết quả so sánh)`.
- Một network có thể có nhiều output nối tiếp sau box (rlo sau box = ENO hoặc Q tùy loại; quy ước: sau TON dùng `outputs.Q` làm rlo nếu rung tiếp tục).
- Compile LAD → IR cùng IR với SCL (mục 6). **Không** có interpreter riêng cho LAD.
- Với mỗi network, `lower.ts` sinh map `networkId → [irNodeId]` để M1.5 online monitor highlight (lưu sẵn, chưa dùng).

---

## 6. IR (cấu trúc, không phải bytecode)

IR là **cây có kiểu** (structured), không dùng jump — đơn giản hóa interpreter và đủ cho SCL/LAD tập con.

```ts
export type IrType = PrimitiveType | { kind: 'array'; elem: IrType; lo: number; hi: number }
                   | { kind: 'struct'; name: string; fields: IrField[] };

export interface IrProgram {
  blocks: Map<string, IrBlock>;       // key = tên chuẩn hóa
  dbs: Map<string, IrDb>;
  udts: Map<string, IrUdt>;
  organization: IrObBinding[];         // OB nào là OB1/OB100/cyclic + chu kỳ
}

export interface IrBlock {
  id: string; kind: 'OB'|'FC'|'FB'; name: string; number?: number;
  interface: IrInterface;              // input/output/inout/static/temp + return type
  body: IrStmt[];
  src?: SrcMap;                        // vị trí nguồn (cho debug/lỗi runtime)
}

export type IrStmt =
  | { op: 'assign'; target: IrLValue; value: IrExpr; src?: SrcRef }
  | { op: 'if'; cond: IrExpr; then: IrStmt[]; else: IrStmt[] }          // ELSIF chuyển thành lồng nhau
  | { op: 'case'; sel: IrExpr; arms: { labels: (number | [number, number])[]; body: IrStmt[] }[]; else: IrStmt[] }
  | { op: 'for'; var: IrLValue; from: IrExpr; to: IrExpr; by: IrExpr; body: IrStmt[] }
  | { op: 'while'; cond: IrExpr; body: IrStmt[] }
  | { op: 'repeat'; body: IrStmt[]; until: IrExpr }
  | { op: 'exit' } | { op: 'continue' } | { op: 'return' }
  | { op: 'callFb'; instance: IrLValue; block: string; inArgs: Record<string, IrExpr>; outArgs: Record<string, IrLValue>; inoutArgs: Record<string, IrLValue> }
  | { op: 'callFc'; block: string; args: Record<string, IrExpr | IrLValue>; ret?: IrLValue }
  | { op: 'callSys'; fn: string; instance?: IrLValue; inArgs: Record<string, IrExpr>; outArgs: Record<string, IrLValue> }; // TON, CTU, R_TRIG...

export type IrExpr =
  | { op: 'const'; type: PrimitiveType; value: number | boolean }
  | { op: 'load'; ref: IrLValue }
  | { op: 'unary'; fn: 'neg'|'not'|'bnot'; type: PrimitiveType; a: IrExpr }
  | { op: 'binary'; fn: BinFn; type: PrimitiveType; a: IrExpr; b: IrExpr }
  | { op: 'convert'; from: PrimitiveType; to: PrimitiveType; a: IrExpr; mode?: 'round'|'trunc' }
  | { op: 'intrinsic'; fn: string; type: PrimitiveType; args: IrExpr[] }
  | { op: 'callFcExpr'; block: string; args: Record<string, IrExpr>; type: IrType };

export type IrLValue =
  | { k: 'local'; name: string }                       // VAR_*, TEMP trong frame hiện tại
  | { k: 'static'; path: string[] }                    // trường trong instance DB hiện tại
  | { k: 'dbField'; db: string; path: string[] }       // "DB".field.sub
  | { k: 'abs'; area: 'I'|'Q'|'M'; byte: number; bit?: number; width: 8|16|32|64; type: PrimitiveType }
  | { k: 'absDb'; db: number; byte: number; bit?: number; width: number; type: PrimitiveType }
  | { k: 'index'; base: IrLValue; index: IrExpr };     // mảng
```

Yêu cầu:
- Mỗi `IrStmt` mang `src` (file, line, col) để lỗi runtime/debug truy được về nguồn.
- IR phải **serializable JSON** (để snapshot, so sánh golden, debug dump `vcs ir dump`).
- Interpreter **biên dịch IR → closures một lần** (mỗi node → hàm `(frame) => value`), không duyệt cây mỗi scan.

---

## 7. Interpreter và mô hình thực thi

### 7.1 Frame
```ts
interface Frame {
  temp: Map<string, any> | any[];     // VAR_TEMP và biến local của FC (cấp phát cho mỗi lần gọi, có reset)
  instance?: DbView;                  // instance DB (FB)
  inout: Map<string, Ref>;            // IN_OUT: tham chiếu đến LValue của nơi gọi
  returnValue?: any;
  loopDepth: number;
  flow: 'normal'|'exit'|'continue'|'return';
}
```
- Biến local của FC/TEMP **không giữ giá trị giữa các lần gọi**; khởi tạo theo giá trị mặc định của kiểu (0/false) `VERIFY` (trên PLC thật TEMP không khởi tạo; mô phỏng dùng 0 và **cảnh báo compile** khi đọc TEMP trước khi ghi nếu phát hiện được).
- FB: VAR_INPUT được copy từ lời gọi vào instance DB trước khi chạy; VAR_OUTPUT copy ra `outArgs` sau khi chạy; static giữ giữa các scan.
- Độ sâu lời gọi tối đa `maxCallDepth` (mặc định 24 `VERIFY`); vượt → RuntimeFault `CALL_DEPTH`, bỏ qua lời gọi. **Đệ quy** bị phát hiện ở compile → lỗi `SCL-S020`.

### 7.2 Quy tắc số học (phải giống nhau mọi nơi; ghi vào `docs/semantics.md`)

| Tình huống | Hành vi mặc định (`VERIFY`) |
|---|---|
| `Int` cộng/trừ/nhân tràn | **Wrap** theo hai-bù (`((x + 32768) & 0xFFFF) − 32768`), đặt cờ `OV` của frame; **không** dừng CPU |
| `DInt` tràn | Wrap 32-bit (`x \| 0`) |
| Chia số nguyên cho 0 | Kết quả 0, RuntimeFault `DIV_ZERO` (không dừng CPU) |
| Real chia 0 | IEEE: `±Infinity` hoặc `NaN` (giữ nguyên) |
| `REAL_TO_INT`/`ROUND` | Làm tròn về số chẵn gần nhất (banker's rounding); `TRUNC`: cắt về 0; `CEIL`, `FLOOR` riêng |
| Real → Int ngoài khoảng / NaN | Kết quả 0, RuntimeFault `CONV_RANGE`, ENO=false (nếu có) |
| `Real` sau mỗi phép tính | `Math.fround` |
| `SQRT` số âm | `NaN` |
| Shift `SHL/SHR` | Theo độ rộng kiểu; shift ≥ độ rộng → 0 (với SHR số có dấu: dấu mở rộng) |
| Chỉ số mảng ngoài khoảng (đọc) | Trả 0/false, RuntimeFault `ARRAY_RANGE` |
| Chỉ số mảng ngoài khoảng (ghi) | Bỏ qua ghi, RuntimeFault `ARRAY_RANGE` |
| `FOR` biến chạy tràn | Không xảy ra (kiểm tra trước khi tăng) |

`RuntimeFault { code, blockName, src, simTimeMs, count }` được gom và hiển thị; **không bao giờ im lặng**. Cấu hình `faultPolicy: 'continue' | 'stop'` (mặc định `continue`; `stop` đưa SoftPlc về STOP để test).

### 7.3 Hàm intrinsic M1 (đăng ký qua `IntrinsicRegistry`)

`ABS, SQRT, MIN, MAX, LIMIT(MN,IN,MX), SHL, SHR, ROL, ROR, TRUNC, ROUND, CEIL, FLOOR, NORM_X, SCALE_X`, và nhóm convert `X_TO_Y` (với X,Y ∈ Bool/Byte/Word/DWord/Int/DInt/Real/LReal tương ứng; không có `Bool_To_*` trừ `BOOL_TO_INT`, `BOOL_TO_BYTE`... theo bảng `VERIFY`).

**`NORM_X(MIN, VALUE, MAX)`** → `(VALUE − MIN) / (MAX − MIN)` kiểu Real, tính bằng float32. **`SCALE_X(MIN, VALUE, MAX)`** → `VALUE * (MAX − MIN) + MIN`; nếu kiểu ra là số nguyên thì làm tròn như `ROUND`. Giá trị ngoài [0..1]: **không kẹp** (khác `LIMIT`) `VERIFY` — có test để chủ sản phẩm kiểm với PLCSIM.

---

## 8. Scan và lập lịch (scheduler)

### 8.1 Trạng thái CPU
`STOP → RUN` (qua `start()`), `RUN → STOP` (qua `stop()`), `reset()` = xóa bộ nhớ về giá trị khởi tạo (cold). M1 không có warm restart/retentive.

### 8.2 Chu kỳ
`SoftPlc.step(simTimeMs, dtMs)` (gọi từ vòng lặp mô phỏng, PRD 8.5):
1. Nếu STOP: không làm gì (ngoài việc giữ `Q` theo chính sách: **mặc định đặt Q=0 khi vào STOP**, cấu hình được).
2. Cộng dồn `acc += dtMs`. Khi `acc ≥ scanPeriodMs` (cấu hình `plcScanMs`, mặc định 20) thì **chạy đúng một scan tại `simTimeMs` hiện tại** và `acc −= scanPeriodMs` (nếu `dt` rất lớn, chạy nhiều scan nhưng mỗi scan dùng thời điểm `scanTime` được nội suy tăng đều; có `maxScansPerStep` chống treo).
3. Một scan gồm: 
   a. **Input latch**: sao chép giá trị input từ `IoBus.readInputs` vào vùng `I` (qua bảng ánh xạ tag↔địa chỉ), áp force cho `I`.
   b. Nếu đây là scan đầu sau RUN: chạy **OB100** một lần.
   c. Chạy các **cyclic OB** đến hạn (mục 8.3) theo thứ tự số OB tăng dần (không preempt OB1 giữa chừng; chạy-đến-hết).
   d. Chạy **OB1**.
   e. **Output update**: áp force cho `Q`, rồi đẩy vùng `Q` ra `IoBus.writeOutputs`.
4. `SimClock` do orchestrator tăng; SoftPlc **không** tự tăng đồng hồ.

### 8.3 Cyclic OB
`organization` khai báo `{ ob: 35, periodMs: 100, phaseMs: 0 }`. OB đến hạn khi `floor((now − phase) / period)` tăng so với lần trước; trong một scan, mỗi cyclic OB chạy **tối đa 1 lần** (bù trễ = bỏ qua, ghi `RuntimeFault CYCLE_OVERRUN` đếm). Hạn chế đã biết: không mô phỏng ưu tiên ngắt giữa OB1 `VERIFY` — ghi rõ trong `docs/compat-matrix.md`.

### 8.4 Process image — quy tắc đọc/ghi trong scan
- Đọc `%I`: đọc từ PII (đã latch đầu scan) → **không đổi** trong scan dù plant đổi.
- Ghi `%Q`: ghi vào PIQ; **đọc lại `%Q`** trong cùng scan trả giá trị vừa ghi `VERIFY`.
- Chỉ cuối scan PIQ mới đẩy ra IoBus.
- `%M` và DB đọc/ghi trực tiếp, tức thời.

### 8.5 Thời gian
- `SoftPlc` nhận `now` (sim ms). Timer/counter dùng **`now` của scan**, không bao giờ dùng `Date.now()`/`performance.now()` (kiểm tra bằng lint rule cấm trong `runtime-iec`).
- Mô phỏng thời gian scan: **mọi lệnh tốn 0 thời gian**; scan "xảy ra tức thời" tại `scanTime`. (Chi phí scan thực tế là P2, FR-210.)

---

## 9. Ngữ nghĩa các system block (`runtime-iec/std`)

Ký hiệu: `now` = sim ms của scan hiện tại. Trường nội bộ ẩn bắt đầu bằng `_`.

### 9.1 Edge
- **R_TRIG** (`CLK` → `Q`, nhớ `_m`): `Q = CLK AND NOT _m; _m = CLK`. Scan đầu sau RUN: `_m` khởi tạo **false** (nên CLK=true ngay scan đầu cho `Q=true`) `VERIFY` (trên PLC thật, nhớ-bit khởi tạo 0).
- **F_TRIG**: `Q = NOT CLK AND _m; _m = CLK`.
### 9.2 Bistable
- **SR** (`S1`, `R`, `Q1`): set-dominant: `Q1 = S1 OR (Q1 AND NOT R)`.
- **RS** (`S`, `R1`, `Q1`): reset-dominant: `Q1 = NOT R1 AND (S OR Q1)`.
### 9.3 Timer IEC (theo thời gian mô phỏng, độ phân giải = chu kỳ scan)
Trường công khai: `IN: Bool, PT: Time, Q: Bool, ET: Time`. Nội bộ: `_start: DInt (ms)`, `_running: Bool`, `_prevIn: Bool`.

- **TON** — on-delay:
  - `IN` false: `Q=false; ET=0; _running=false`.
  - `IN` true và `_running` false (cạnh lên): `_start=now; _running=true`.
  - Khi `_running`: `ET = min(now − _start, PT)`; `Q = (now − _start) ≥ PT`.
  - `PT ≤ 0`: `Q = IN` ngay, `ET = 0`.
  - Ví dụ: PT=3000, IN lên tại scan `t=200` → ET=0 (t=200), 100 (t=300)… 3000 (t=3200), `Q=true` từ t=3200.
- **TOF** — off-delay:
  - `IN` true: `Q=true; ET=0; _running=false`.
  - `IN` false và `_prevIn` true (cạnh xuống): `_start=now; _running=true`.
  - Khi `_running`: `ET = min(now − _start, PT)`; nếu `(now − _start) ≥ PT` thì `Q=false; _running=false` (ET giữ = PT cho tới khi IN lên lại), ngược lại `Q=true`.
  - `IN` false và chưa từng true (ban đầu): `Q=false; ET=0`.
- **TP** — pulse:
  - Cạnh lên `IN` khi `_running` false: `_start=now; _running=true; Q=true`.
  - Khi `_running`: `ET=min(now−_start,PT); Q = (now−_start) < PT`; khi hết xung `_running=false` (nhưng nếu IN vẫn true, **không** kích lại cho tới khi IN xuống rồi lên `VERIFY`: chặn bằng `_prevIn`).
  - Cạnh lên `IN` trong lúc đang phát xung: bỏ qua (không retrigger).
  - Khi xung kết thúc và `IN` false: `ET=0`.
- **TONR** — retentive on-delay (`IN, R, PT, Q, ET`):
  - `R` true: `ET=0; Q=false; _accum=0; _running=false`.
  - `IN` true: nếu cạnh lên `_start=now; _running=true`; `ET = _accum + (now − _start)`; `Q = ET ≥ PT`.
  - `IN` false và `_running`: `_accum = _accum + (now − _start)`; `_running=false`; `ET=_accum`; `Q = ET ≥ PT`.
- Tất cả timer: `ET` và `Q` phải được cập nhật **mỗi lần gọi** (mỗi scan), kể cả không có cạnh. Nếu timer không được gọi trong một scan (nằm trong nhánh IF không chạy) thì trạng thái **đóng băng** `VERIFY` (trên PLC thật: timer IEC tính theo `RT_TIMESTAMP` khi được gọi nên khi gọi lại sẽ "nhảy" tới thời gian đã trôi) — **M1 theo hành vi timestamp**: lần gọi tiếp theo dùng `now − _start` thực tế, nên có thể thấy `Q` đổi ngay khi gọi lại. Ghi chú trong `semantics.md`.

### 9.4 Counter IEC (`PV, CV` kiểu Int mặc định; biến thể DInt theo tham số kiểu)
- **CTU**: cạnh lên `CU` (dùng `_prevCU`): nếu `CV < max` thì `CV+=1`. `R` true: `CV=0` (R ưu tiên). `QU = CV ≥ PV`.
- **CTD**: cạnh lên `CD`: nếu `CV > min` thì `CV−=1`. `LD` true: `CV=PV` (LD ưu tiên hơn đếm). `QD = CV ≤ 0`.
- **CTUD**: `CU` cạnh lên tăng, `CD` cạnh lên giảm (đồng thời cả hai cùng cạnh → tăng rồi giảm = giữ nguyên `VERIFY`); `R` đặt 0 (ưu tiên cao nhất); `LD` nạp `PV`; `QU = CV ≥ PV`; `QD = CV ≤ 0`.
- Giới hạn max/min theo kiểu: Int `32767/−32768`, DInt `2147483647/−2147483648`.

---

## 10. API công khai

```ts
// runtime-iec
export interface SoftPlcConfig {
  id: string; scanPeriodMs: number; maxScansPerStep?: number;
  faultPolicy?: 'continue' | 'stop'; maxCallDepth?: number; maxLoopIterations?: number;
  outputsOnStop?: 'zero' | 'hold';
}

export class SoftPlc implements ControllerAdapter {
  constructor(program: IrProgram, tagMap: TagAddressMap, cfg: SoftPlcConfig);
  load(program: IrProgram): void;                 // thay chương trình (STOP trước)
  start(): void; stop(): void; reset(): void;
  step(simTimeMs: number, dtMs: number): Promise<void>;       // ControllerAdapter
  // Watch / Force
  read(ref: string): TagValue;                    // "%MW10" | "\"DB_X\".field" | tên tag symbolic
  write(ref: string, v: TagValue): void;          // ghi trực tiếp (dùng cho test/HMI)
  force(ref: string, v: TagValue): void; unforce(ref: string): void; listForces(): ForceEntry[];
  // Chẩn đoán
  getDiagnostics(): { state: 'STOP'|'RUN'; scanCount: number; lastScanSimMs: number; faults: RuntimeFault[] };
  snapshot(): SoftPlcSnapshot; restore(s: SoftPlcSnapshot): void;
  onScan(cb: (info: ScanInfo) => void): Unsub;    // hook cho trace
}

// vendor-siemens
export function compileProject(files: ProjectFiles, opts?: CompileOptions): { program?: IrProgram; diagnostics: Diagnostic[] };
export function compileScl(source: string, fileName: string, ctx?: CompileContext): { blocks: IrBlock[]; diagnostics: Diagnostic[] };
export function compileLad(json: unknown, fileName: string, ctx?: CompileContext): { blocks: IrBlock[]; diagnostics: Diagnostic[] };
```

- `TagAddressMap`: ánh xạ `tag name ↔ {area, byte, bit, type}` lấy từ `tags/tags.yaml` (PRD 8.2); dùng cho input latch/output update và cho `read/write` bằng tên tag.
- **Force**: ghi đè giá trị khi đọc từ `I`/`Q` (bước 8.2.a và 8.2.e) và với `M`/DB (đọc luôn trả giá trị force, ghi vào bị bỏ qua). Mở rộng VCS (PLC thật chỉ force `:P`); ghi rõ trong `semantics.md`.
- Snapshot phải **đủ để tái lập hoàn toàn** (bộ nhớ, trạng thái timer nội bộ, scan counter, accumulator thời gian, forces).

---

## 11. UI tối thiểu của M1 (`apps/web`)

- Trang **PLC Workspace**: cây file bên trái, Monaco editor SCL (highlight cú pháp SCL tối thiểu, hiển thị `Diagnostic` bằng marker), nút Build.
- **Watch table**: thêm tag/địa chỉ, hiển thị giá trị realtime (≤ 10 Hz), cột sửa giá trị (write) và Force (checkbox).
- **Simulation bar** (PRD M8 tối thiểu): Run/Pause/Step 1 scan/Reset, hiển thị sim time, scan count, RUN/STOP, số RuntimeFault.
- Chạy SoftPlc trong **Web Worker**; giao tiếp message `{type, payload}`; Node dùng chung code qua CLI (`vcs run examples/motor-interlock --scans 100`).
- LAD editor đồ họa: **không bắt buộc** trong M1.

---

## 12. Chiến lược test

### 12.1 Golden test format (`runtime-iec/golden/*.golden.yaml`)

```yaml
id: ton_basic_3s
description: TON 3s, IN lên tại t=200, Q lên tại t=3200
config: { scanPeriodMs: 100 }
sources:
  - file: main.scl
    text: |
      ORGANIZATION_BLOCK "Main"
      VAR_TEMP END_VAR   // (có thể bỏ nếu không có biến)
      BEGIN
        "T1"(IN := %M0.0, PT := T#3s);
        %M1.0 := "T1".Q;
      END_ORGANIZATION_BLOCK
  - file: db.scl
    text: |
      DATA_BLOCK "T1" TON END_DATA_BLOCK     // instance DB của system FB
organization: [{ ob: 1 }]
steps:                                # mỗi step = 1 scan tại thời điểm t
  - { t: 0,    set: { "%M0.0": false },  expect: { "%M1.0": false } }
  - { t: 100,  set: { "%M0.0": false },  expect: { "%M1.0": false } }
  - { t: 200,  set: { "%M0.0": true  },  expect: { "%M1.0": false, "\"T1\".ET": 0 } }
  - { t: 300,                            expect: { "\"T1\".ET": 100 } }
  - { t: 3100,                           expect: { "%M1.0": false, "\"T1\".ET": 2900 } }
  - { t: 3200,                           expect: { "%M1.0": true,  "\"T1\".ET": 3000 } }
  - { t: 3300, set: { "%M0.0": false },  expect: { "%M1.0": false, "\"T1\".ET": 0 } }
```
- Runner: mỗi step: áp `set` (qua `write` hoặc IoBus giả), chạy **đúng 1 scan** tại `t`, so `expect` (so sánh Real bằng `Object.is` sau fround, hoặc `{ approx, eps }`). Lỗi in rõ: test id, step, địa chỉ, giá trị mong đợi vs thực tế, nguồn IR.
- Kỳ vọng cho phép `faults: ['DIV_ZERO']` để kiểm tra RuntimeFault.
- **Mỗi golden test phải ghi rõ nguồn của kỳ vọng**: `expectedFrom: spec | siemens-docs | plcsim` (mặc định `spec`). Test `plcsim` là chuẩn vàng; test `spec` chờ được xác minh.

### 12.2 Số lượng tối thiểu (≥ 80 golden + unit test riêng)

| Nhóm | Golden | Unit test |
|---|---|---|
| Bit logic / contact / coil / set / reset | 8 | |
| R_TRIG / F_TRIG / SR / RS | 8 | |
| Timer TON/TOF/TP/TONR (kể cả PT=0, IN dao động, timer không được gọi vài scan) | 14 | |
| Counter CTU/CTD/CTUD (R/LD ưu tiên, biên max/min) | 10 | |
| Toán/so sánh/convert/làm tròn/tràn số/chia 0 | 14 | |
| Điều khiển luồng (IF/CASE/FOR/WHILE/REPEAT/EXIT/CONTINUE/RETURN, giới hạn vòng lặp) | 8 | |
| Gọi block: FC trả giá trị, FB + instance DB, multi-instance, IN_OUT, TEMP | 8 | |
| Bộ nhớ & địa chỉ: chồng lấn `%MW/%MB`, big-endian, bit trong DB, layout struct | 8 | 20 |
| Scan: process image I/Q, OB100 chạy 1 lần, cyclic OB, STOP/RUN/reset | 6 | |
| Force/snapshot/restore | 4 | |
| LAD (series/parallel/box/negated coil/edge) | 8 | |
| Lexer | | 15 |
| Parser (hợp lệ) | | 40 |
| Parser lỗi + vị trí chính xác + phục hồi lỗi | | 12 |
| Type check (ngầm định/tường minh/lỗi) | | 20 |
| E2E demo `motor-interlock` | 4 | |

### 12.3 Property-based (fast-check)
- Timer: với chuỗi `IN` ngẫu nhiên và `dt` ngẫu nhiên, `Q` của TON ⇔ "IN liên tục true ≥ PT" (so với mô hình tham chiếu đơn giản).
- Bộ nhớ: ghi ngẫu nhiên các độ rộng, đọc lại bằng độ rộng khác, so với mô hình tham chiếu byte-array.
- Counter: chuỗi cạnh ngẫu nhiên, CV không bao giờ vượt biên.

### 12.4 Benchmark (`pnpm bench`)
- Chương trình `FB_Motor` × 200 instance (mỗi instance ~30 statement, 3 timer/edge), scan 10 ms sim: **≥ 1 000 scan/giây trên laptop phổ thông (≥ 10× realtime)**; mục tiêu mở rộng 5 000 scan/s. Không cấp phát đối tượng trong vòng scan (kiểm tra bằng benchmark heap).
- Lưu kết quả `bench/results.json` mỗi lần chạy; regression > 20% → CI cảnh báo.

---

## 13. Demo chấp nhận: `examples/motor-interlock`

**Tags** (`tags.yaml`): `START_PB %I0.0`, `STOP_OK %I0.1` (NC, true = bình thường), `OVL_OK %I0.2`, `PERM %I0.3`, `RUN_FB %I0.4`, `RESET_PB %I0.5`, `RUN_CMD %Q0.0`, `FAULT_LAMP %Q0.1`.

**`FB_Motor.scl`**
```scl
FUNCTION_BLOCK "FB_Motor"
VAR_INPUT
  iStart : Bool;
  iStopOk : Bool;
  iOverloadOk : Bool;
  iPermissive : Bool;
  iRunFb : Bool;
  iReset : Bool;
END_VAR
VAR_OUTPUT
  qRun : Bool;
  qFault : Bool;
END_VAR
VAR
  sSeal : Bool;
  sFbTimer : TON;
  sStartEdge : R_TRIG;
END_VAR
BEGIN
  #sStartEdge(CLK := #iStart);

  IF #iReset AND #iOverloadOk THEN
    #qFault := FALSE;
  END_IF;

  IF #sSeal AND (NOT #iOverloadOk) THEN
    #qFault := TRUE;
  END_IF;

  #sFbTimer(IN := #sSeal AND (NOT #iRunFb), PT := T#3s);
  IF #sFbTimer.Q THEN
    #qFault := TRUE;
  END_IF;

  IF (NOT #iStopOk) OR (NOT #iPermissive) OR #qFault THEN
    #sSeal := FALSE;
  END_IF;

  IF #sStartEdge.Q AND #iStopOk AND #iOverloadOk AND #iPermissive AND (NOT #qFault) THEN
    #sSeal := TRUE;
  END_IF;

  #qRun := #sSeal;
END_FUNCTION_BLOCK
```

**`OB1.scl`**
```scl
ORGANIZATION_BLOCK "Main"
BEGIN
  "FB_Motor_DB"(iStart := "START_PB", iStopOk := "STOP_OK", iOverloadOk := "OVL_OK",
                iPermissive := "PERM", iRunFb := "RUN_FB", iReset := "RESET_PB");
  "RUN_CMD" := "FB_Motor_DB".qRun;
  "FAULT_LAMP" := "FB_Motor_DB".qFault;
END_ORGANIZATION_BLOCK
```

**Kịch bản kiểm (scan 100 ms; trạng thái đầu STOP_OK=1, OVL_OK=1, PERM=1, còn lại 0):**

*Kịch bản A — chạy bình thường rồi trip overload, reset*

| t (ms) | Input thay đổi | Kỳ vọng sau scan |
|---|---|---|
| 0 | — | RUN_CMD=0, FAULT=0 |
| 100 | START_PB=1 | RUN_CMD=1 |
| 200 | START_PB=0 | RUN_CMD=1 |
| 300 | RUN_FB=1 | RUN_CMD=1, timer reset (ET=0) |
| 400 | OVL_OK=0 | RUN_CMD=0, FAULT=1 |
| 500 | OVL_OK=1 | RUN_CMD=0, FAULT=1 (còn chốt) |
| 600 | RESET_PB=1 | FAULT=0, RUN_CMD=0 |
| 700 | RESET_PB=0, START_PB=1 | RUN_CMD=1 |

*Kịch bản B — mất feedback (RUN_FB luôn 0)*

| t | Input | Kỳ vọng |
|---|---|---|
| 100 | START_PB=1 | RUN_CMD=1 |
| 200 | START_PB=0 | RUN_CMD=1 (timer bắt đầu tại 200) |
| 3100 | — | RUN_CMD=1 (ET=2900) |
| 3200 | — | RUN_CMD=0, FAULT=1 |
| 3300 | — | RUN_CMD=0, FAULT=1; timer về 0 |

*Kịch bản C — permissive mất khi đang chạy:* PERM=0 → `RUN_CMD=0`, **không** có FAULT; PERM=1 trở lại **không** tự chạy lại (cần cạnh START mới).
*Kịch bản D — nhấn START khi PERM=0:* không chạy.

Cả 4 kịch bản là golden test (`expectedFrom: spec`) và cũng là test e2e qua CLI.

---

## 14. Danh sách VERIFY với PLCSIM (việc của chủ sản phẩm)

Tạo project TIA nhỏ (S7-1500 trong PLCSIM Advanced hoặc PLCSIM) và ghi kết quả vào `docs/semantics.md`; sau đó đổi `expectedFrom` thành `plcsim` cho golden test tương ứng:

1. INT: 32767 + 1 trong SCL → kết quả? ENO? (wrap hay giữ?).
2. DINT/INT chia 0 → kết quả, CPU có STOP không.
3. `REAL_TO_INT(2.5)`, `(3.5)`, `(−2.5)`; gán ngầm `Int := Real` có bị lỗi biên dịch không.
4. `NORM_X`/`SCALE_X` với VALUE ngoài khoảng (có kẹp không).
5. TON: PT=T#0s; IN dao động; timer **không được gọi** vài scan rồi gọi lại (Q có "nhảy" không).
6. TP: IN giữ true sau khi hết xung (có kích lại không).
7. TOF: IN true→false→true trong lúc đếm.
8. CTU/CTD/CTUD: biên max/min, thứ tự ưu tiên R/LD, CU và CD cùng cạnh.
9. `R_TRIG` ở scan đầu sau STOP→RUN khi CLK đã true (Q?).
10. Đọc lại `%Q` trong cùng scan sau khi ghi (PIQ).
11. Layout DB standard: struct có Bool xen kẽ Byte/Word/LReal (so offset thực tế).
12. Độ sâu gọi tối đa, nhiều biến TEMP không khởi tạo (giá trị rác hay 0).
13. Array index ngoài khoảng (đọc/ghi): hành vi CPU.
14. Cyclic OB (OB35) khi chu kỳ không chia hết scan OB1.

---

## 15. Kế hoạch triển khai và prompt cho AI

| Ngày | Công việc | Kết quả |
|---|---|---|
| 1 | `types.ts`, `memory.ts`, `layout.ts`, `address.ts` + test | bộ nhớ big-endian, địa chỉ, layout DB đúng |
| 2 | Lexer + test | token chính xác với vị trí |
| 3–4 | Parser SCL (AST) + phục hồi lỗi + test | parse đủ ngữ pháp 4.2 |
| 5 | Type check + Diagnostic | lỗi kiểu có gợi ý |
| 6 | IR + lower AST→IR | `vcs ir dump` |
| 7–8 | Interpreter + scheduler + SoftPlc + force + snapshot | chạy được bit logic, scan, OB |
| 9 | std blocks (edge, bistable, timers, counters) | golden timer/counter xanh |
| 10 | intrinsics + convert + NORM_X/SCALE_X + quy tắc số học | golden toán xanh |
| 11 | LAD schema + validate + lower | golden LAD xanh |
| 12 | Golden runner + bổ sung đủ ≥ 80 golden | |
| 13 | UI tối thiểu (editor, watch, sim bar) + Worker | |
| 14 | Demo `motor-interlock` + benchmark + tài liệu `semantics.md` | |
| 15 | Đệm / sửa lỗi / chuẩn bị VERIFY | |

### Prompt mẫu

**P1.1 (bộ nhớ và địa chỉ):**
> Đọc `M1-soft-plc-spec.md` mục 2, 3. Cài `types.ts`, `memory.ts`, `layout.ts` trong `packages/runtime-iec` và `address.ts` trong `packages/vendor-siemens`. Bắt buộc big-endian qua `DataView`. Viết test chồng lấn `%MW/%MB/%M bit`, layout struct theo 3.4. Không viết parser hay interpreter. Chạy test, báo kết quả.

**P1.2 (lexer + parser):**
> Theo mục 4.1–4.3, cài lexer và parser SCL bằng Chevrotain. AST có type đầy đủ (`ast.ts`), mỗi node có vị trí. Ưu tiên theo bảng 4.3. Có phục hồi lỗi ở mức statement. ≥ 15 test lexer, ≥ 40 test parse hợp lệ, ≥ 12 test lỗi (kiểm tra line/col). Không type check ở bước này.

**P1.3 (type check + lower + IR):**
> Theo 4.4 và 6, cài `typecheck.ts` (strict widening) và `lower.ts` (AST → IR). IR phải serializable JSON. Thêm CLI `vcs ir dump <file>`. Test ≥ 20 trường hợp kiểu.

**P1.4 (interpreter + scheduler + SoftPlc):**
> Theo 7, 8, 10, cài interpreter biên dịch IR → closures, scheduler, `SoftPlc` (ControllerAdapter), force, snapshot. Cấm `Date.now()`/`performance.now()` trong `runtime-iec` (thêm lint rule). Mọi quy tắc số học phải khớp bảng 7.2 và có golden test.

**P1.5 (std blocks):**
> Theo mục 9 cài edge, bistable, timer, counter dưới `runtime-iec/std`. Dùng timestamp theo `now` của scan. Viết ≥ 14 golden timer và ≥ 10 golden counter, kể cả trường hợp biên đã liệt kê.

**P1.6 (LAD):**
> Theo mục 5 cài schema zod, validate và `lower.ts` LAD → IR dùng chung interpreter. ≥ 8 golden test LAD.

**P1.7 (golden runner + demo + UI):**
> Theo mục 11, 12, 13: cài golden runner (format 12.1), demo `motor-interlock` với 4 kịch bản, UI tối thiểu, Worker. Chạy benchmark 12.4 và báo số liệu.

Mỗi prompt kết thúc bằng: *"Chạy toàn bộ test/lint/typecheck, báo cáo kết quả, liệt kê mọi giả định về ngữ nghĩa bạn phải tự đặt ra (nếu có) vào `docs/open-questions.md` thay vì tự quyết im lặng."*

---

## 16. Tiêu chí nghiệm thu M1 (tất cả phải đạt)

1. `pnpm test`, `pnpm lint`, `pnpm typecheck` xanh toàn repo.
2. ≥ 80 golden test + unit test theo bảng 12.2 đạt; mỗi test có `expectedFrom`.
3. Demo `motor-interlock` chạy đúng cả 4 kịch bản qua CLI **và** qua UI (Watch table + force).
4. Lỗi biên dịch có vị trí chính xác (±0 ký tự) cho ≥ 12 lỗi mẫu; compile báo nhiều lỗi trong một lần.
5. Không có "bỏ qua im lặng": lệnh/từ khóa chưa hỗ trợ báo lỗi ồn ào kèm vị trí — mã `SCL-U001` cho cấu trúc biết tên nhưng chưa hỗ trợ, `SCL-T001` cho kiểu chưa biết, `SCL-P002` cho cú pháp ngoài EBNF (đã kiểm chứng bằng probe, xem `docs/acceptance/M1.md` §16.5).
6. Benchmark 12.4 ≥ 1 000 scan/s với 200 FB_Motor.
7. `docs/semantics.md` liệt kê mọi quy tắc ở mục 7.2, 8, 9 với trạng thái `VERIFIED` / `UNVERIFIED`.
8. `snapshot()/restore()` tái lập: chạy N scan, snapshot, chạy thêm M scan (ghi kết quả), restore, chạy lại M scan → kết quả **giống hệt**.
9. Không có `any` ngoài ranh giới I/O; không import UI/Node-only trong `runtime-iec` và `vendor-siemens`.

---

## 17. Quyết định mặc định (để AI không dừng hỏi)

| Chủ đề | Quyết định |
|---|---|
| Parser generator | Chevrotain (không ANTLR) |
| Ép kiểu ngầm | Chỉ widening; thu hẹp phải tường minh |
| Tràn INT | Wrap + cờ OV, không dừng CPU |
| Lỗi runtime | Ghi `RuntimeFault`, tiếp tục (`faultPolicy: continue`) |
| Thời gian | Chỉ `now` mô phỏng; mọi lệnh tốn 0 thời gian |
| Scan đầu | OB100 chạy 1 lần trước OB1; `_m` của R_TRIG khởi tạo false |
| Khi STOP | Q về 0 (`outputsOnStop: 'zero'`) |
| Mảng | 1 chiều; chỉ số ngoài khoảng → bỏ qua ghi/đọc 0 + fault |
| String | Không hỗ trợ; báo `SCL-U001` |
| Tên symbol | Phân biệt hoa/thường trong `"..."`; từ khóa không phân biệt |
| Số scan/giây | Không giới hạn; `maxScansPerStep` mặc định 50 |

Nếu gặp tình huống chưa có trong spec: chọn phương án đơn giản, an toàn, **ghi `open-questions.md`**, thêm test thể hiện lựa chọn, tiếp tục.
