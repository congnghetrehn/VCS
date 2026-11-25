// DiagnosticCatalog — sổ đăng ký mã chẩn đoán (M0 §4.1, AMENDMENTS A8).
// Mọi mã chẩn đoán phát ra đều phải đăng ký ở đây; script
// `scripts/gen-diagnostics.ts` quét mã trong source và thất bại nếu có mã
// chưa đăng ký; `pnpm docs:diagnostics` sinh `docs/diagnostics.md`.
// Các milestone sau đăng ký thêm (IO-*, PL-*, TS-*, CE-*...).

import type { Diagnostic } from './common.js';

export interface DiagnosticInfo {
  severity: Diagnostic['severity'];
  title: string;
  hint?: string;
}

export interface DiagnosticCatalog {
  get(code: string): DiagnosticInfo | undefined;
  has(code: string): boolean;
  codes(): string[];
  entries(): [string, DiagnosticInfo][];
}

export function defineDiagnostics(entries: Record<string, DiagnosticInfo>): DiagnosticCatalog {
  const map = new Map<string, DiagnosticInfo>(Object.entries(entries));
  return {
    get: (code) => map.get(code),
    has: (code) => map.has(code),
    codes: () => [...map.keys()].sort(),
    entries: () => [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  };
}

/** Danh mục mã M0 (M0 §4.5). */
export const PRJ_CATALOG: DiagnosticCatalog = defineDiagnostics({
  'PRJ-E001': {
    severity: 'error',
    title: 'Thiếu file bắt buộc',
    hint: 'Tạo vcs.project.yaml ở thư mục gốc của dự án.',
  },
  'PRJ-E002': {
    severity: 'error',
    title: 'Cú pháp YAML sai',
    hint: 'Sửa cú pháp YAML tại dòng/cột đã báo (chú ý thụt đầu dòng bằng khoảng trắng, không dùng tab).',
  },
  'PRJ-E003': {
    severity: 'error',
    title: 'Vi phạm schema',
    hint: 'Sửa giá trị theo schema tại vị trí đã báo.',
  },
  'PRJ-E004': {
    severity: 'error',
    title: 'Trùng tên tag (không phân biệt hoa/thường)',
    hint: 'Đổi tên một trong hai tag trùng.',
  },
  'PRJ-E005': {
    severity: 'error',
    title: 'Controller không tồn tại',
    hint: 'Khai báo controller trong vcs.project.yaml, hoặc sửa trường controller của tag.',
  },
  'PRJ-E006': {
    severity: 'error',
    title: 'schemaVersion không hỗ trợ',
    hint: 'Chạy migrate (migrateProject) hoặc sửa schemaVersion về 1.',
  },
  'PRJ-E007': {
    severity: 'error',
    title: 'stepMs/plcScanMs không hợp lệ',
    hint: 'stepMs là số nguyên ≥ 1; plcScanMs là số nguyên ≥ stepMs.',
  },
  'PRJ-E010': {
    severity: 'error',
    title: 'signal.kind không khớp area',
    hint: 'DI/AI phải ở area I; DO/AO phải ở area Q.',
  },
  'PRJ-E011': {
    severity: 'error',
    title: 'scaling chỉ hợp lệ với AI/AO',
    hint: 'Bỏ scaling, hoặc đổi signal.kind thành AI/AO.',
  },
  'PRJ-E012': {
    severity: 'error',
    title: 'Khoảng scaling suy biến',
    hint: 'rawMin phải khác rawMax và engMin phải khác engMax.',
  },
  'PRJ-E013': {
    severity: 'error',
    title: 'signal.kind không khớp kiểu dữ liệu',
    hint: 'DI/DO phải là Bool; AI/AO phải là kiểu số.',
  },
  'PRJ-E014': {
    severity: 'error',
    title: 'Giá trị khởi tạo không đúng kiểu/khoảng',
    hint: 'Bool nhận boolean; kiểu số nhận number trong khoảng của kiểu đó.',
  },
  'PRJ-W001': {
    severity: 'warning',
    title: 'Khóa lạ trong YAML',
    hint: 'Kiểm tra chính tả khóa; khóa lạ bị bỏ qua.',
  },
  'PRJ-W002': {
    severity: 'warning',
    title: 'Không có tags.yaml',
    hint: 'Tạo file tags (mặc định tags/tags.yaml) hoặc chấp nhận dự án không có tag.',
  },
  'SIM-W001': {
    severity: 'warning',
    title: 'Không có runtime đăng ký cho controller',
    hint: 'Đăng ký runtime/adapter cho controller đó, hoặc đổi mode của controller.',
  },
  'SIM-E001': {
    severity: 'error',
    title: 'Component lỗi khi chạy',
    hint: 'Xem diagnostics của component và sửa logic của nó.',
  },
  'SIM-E002': {
    severity: 'error',
    title: 'Component bất đồng bộ trong đường đồng bộ',
    hint: 'Chuyển component sang đường async (asyncStep), hoặc viết lại thành đồng bộ.',
  },
  'SIM-E003': {
    severity: 'error',
    title: 'Snapshot không tương thích',
    hint: 'Snapshot được tạo bởi phiên bản khác; chạy lại từ đầu hoặc migrate snapshot.',
  },
  'TAG-E001': {
    severity: 'error',
    title: 'Ghi tag sai kiểu/ngoài khoảng',
    hint: 'Ghi giá trị đúng kiểu và trong khoảng của tag.',
  },
  'TAG-E002': {
    severity: 'error',
    title: 'Vi phạm quyền sở hữu tag',
    hint: 'Chỉ owner của tag mới được ghi; ghi từ bên ngoài phải qua checkWrite + post().',
  },
  'TAG-E003': {
    severity: 'error',
    title: 'Tag không tồn tại',
    hint: 'Kiểm tra tên tag trong TagCatalog.',
  },
  'WS-E001': {
    severity: 'error',
    title: 'Phiên bản giao thức không khớp',
    hint: 'Nâng cấp client/server lên cùng PROTOCOL_VERSION.',
  },
  'WS-E002': {
    severity: 'error',
    title: 'Lệnh step bị bỏ qua khi đang RUNNING',
    hint: 'Pause trước khi step, hoặc dùng run.',
  },
  'WS-E003': {
    severity: 'error',
    title: 'Thông điệp WebSocket không hợp lệ',
    hint: "Gửi đúng schema giao thức (xem M0 §9.2): hello trước, rồi mới lệnh; timeScale phải là số > 0 hoặc 'max'.",
  },
});

/** Danh mục mã SCL (M1 §4.4, OQ-095). */
export const SCL_CATALOG: DiagnosticCatalog = defineDiagnostics({
  'SCL-L001': {
    severity: 'error',
    title: 'Lỗi từ vựng SCL',
    hint: 'Kiểm tra ký tự tại vị trí đã báo; đóng comment (* *) và dấu nháy "...".',
  },
  'SCL-P001': {
    severity: 'error',
    title: "Thiếu ';' cuối statement",
    hint: "Thêm ';' cuối statement tại vị trí đã báo.",
  },
  'SCL-P002': {
    severity: 'error',
    title: 'Lỗi cú pháp SCL',
    hint: 'Sửa theo "expected ..." tại vị trí đã báo.',
  },
  'SCL-P003': {
    severity: 'error',
    title: 'Quá nhiều lỗi cú pháp (tối đa 100)',
    hint: 'Sửa 100 lỗi đầu đã báo rồi biên dịch lại.',
  },
  'SCL-U001': {
    severity: 'error',
    title: 'Cấu trúc SCL chưa hỗ trợ',
    hint: 'Dùng cấu trúc trong phạm vi M1 (xem M1 §4.2 và Phụ lục A); String không hỗ trợ.',
  },
  'SCL-T001': {
    severity: 'error',
    title: 'Tên chưa khai báo',
    hint: 'Khai báo biến/kiểu/block trước khi dùng, kiểm tra chính tả.',
  },
  'SCL-T002': {
    severity: 'error',
    title: 'Kiểu không khớp',
    hint: 'Đổi kiểu biến hoặc giá trị cho khớp; thu hẹp phải dùng hàm chuyển đổi tường minh.',
  },
  'SCL-T003': {
    severity: 'error',
    title: 'Toán tử không áp dụng cho kiểu',
    hint: 'Phép số học chỉ dùng cho số nguyên/số thực/Time; AND/OR/XOR/NOT dùng cho Bool hoặc Byte/Word/DWord.',
  },
  'SCL-T004': {
    severity: 'error',
    title: 'Lỗi gọi block/hàm',
    hint: 'Gọi FB cần instance (#fb hoặc "DB"); kiểm tra tên và kiểu tham số trong khai báo block.',
  },
  'SCL-T005': {
    severity: 'error',
    title: 'Truy cập member/index sai',
    hint: 'Kiểm tra tên field, kiểu index và khoảng chỉ số hằng của mảng.',
  },
  'SCL-T006': {
    severity: 'error',
    title: 'Gán không hợp lệ',
    hint: 'VAR_INPUT chỉ đọc trong FB/FC; VAR_CONSTANT không được gán.',
  },
  'SCL-T007': {
    severity: 'error',
    title: 'EXIT/CONTINUE ngoài vòng lặp',
    hint: 'EXIT/CONTINUE chỉ dùng trong FOR/WHILE/REPEAT.',
  },
  'SCL-T008': {
    severity: 'error',
    title: 'Biểu thức không hằng',
    hint: 'Giá trị khởi tạo, label CASE và init DB phải là hằng (literal, phép tính trên hằng, VAR_CONSTANT).',
  },
  'SCL-T009': {
    severity: 'error',
    title: 'Khai báo trùng tên',
    hint: 'Đổi tên một trong hai khai báo trong cùng scope.',
  },
  'SCL-T010': {
    severity: 'error',
    title: 'Thu hẹp ngầm định',
    hint: 'Dùng REAL_TO_INT(...)/TRUNC(...) hoặc hàm X_TO_Y tường minh.',
  },
  'SCL-T011': {
    severity: 'error',
    title: 'Định nghĩa kiểu đệ quy',
    hint: 'UDT không được chứa chính nó (trực tiếp hay gián tiếp).',
  },
  'SCL-S020': {
    severity: 'error',
    title: 'Đệ quy gọi block',
    hint: 'FC/FB không được gọi chính nó (trực tiếp hay gián tiếp) — tách thành block khác.',
  },
  'SCL-W001': {
    severity: 'warning',
    title: 'Đọc TEMP trước khi ghi',
    hint: 'TEMP không khởi tạo trên PLC thật; gán giá trị trước khi đọc.',
  },
});

/** Regex quét mã chẩn đoán: tiền tố 2–4 chữ hoa, rồi -E/-W/-L/-P/-S/-T/-U, rồi 3 chữ số.
 * Mở rộng cho SCL (L/P/U) để `gen-diagnostics --check` kiểm được mã SCL dùng
 * trong parser (không thì mã lạ lọt qua im lặng); P1.3 thêm T/S cho typecheck
 * (OQ-107). */
export const DIAGNOSTIC_CODE_RE = /\b[A-Z]{2,4}-[ELPSTWU]\d{3}\b/g;
