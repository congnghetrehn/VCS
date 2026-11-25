// dependency-cruiser — ép đồ thị phụ thuộc M0 §3.5 + AMENDMENTS B7.
// apps/web chỉ được import schemas, expr, hmi. Package không import app.
// Import xuyên package chỉ qua `exports` (index.ts) — xem ghi chú cuối file.
const PKG = (name) => `^packages/${name}/src`;
const ALLOWED = (...names) => `^packages/(${names.join('|')})/src`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    // Không package nào được import code của app.
    {
      name: 'no-package-to-app',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    // Đồ thị M0 §3.5 + B7 (mỗi rule: package này chỉ được import các package liệt kê).
    {
      // schemas không import package khác; import nội bộ trong schemas được phép
      // (P0.2: rule cũ cấm cả import nội bộ nên mọi file schemas đều vi phạm).
      name: 'schemas-standalone',
      severity: 'error',
      from: { path: PKG('schemas') },
      to: { path: '^packages/', pathNot: PKG('schemas') },
    },
    {
      name: 'kernel-deps',
      severity: 'error',
      from: { path: PKG('kernel') },
      to: { path: '^packages/', pathNot: ALLOWED('schemas', 'kernel') },
    },
    {
      name: 'project-deps',
      severity: 'error',
      from: { path: PKG('project') },
      to: { path: '^packages/', pathNot: ALLOWED('schemas', 'project') },
    },
    {
      name: 'test-utils-deps',
      severity: 'error',
      from: { path: PKG('test-utils') },
      to: { path: '^packages/', pathNot: ALLOWED('schemas', 'kernel', 'test-utils') },
    },
    {
      name: 'runtime-iec-deps',
      severity: 'error',
      from: { path: PKG('runtime-iec') },
      to: { path: '^packages/', pathNot: ALLOWED('schemas', 'kernel', 'runtime-iec') },
    },
    {
      name: 'vendor-siemens-deps',
      severity: 'error',
      from: { path: PKG('vendor-siemens') },
      to: { path: '^packages/', pathNot: ALLOWED('schemas', 'runtime-iec', 'vendor-siemens') },
    },
    {
      name: 'plant-deps',
      severity: 'error',
      from: { path: PKG('plant') },
      to: { path: '^packages/', pathNot: ALLOWED('schemas', 'kernel', 'plant') },
    },
    {
      name: 'importers-deps',
      severity: 'error',
      from: { path: PKG('importers') },
      to: { path: '^packages/', pathNot: ALLOWED('schemas', 'plant', 'importers') },
    },
    {
      name: 'comms-deps',
      severity: 'error',
      from: { path: PKG('comms') },
      to: { path: '^packages/', pathNot: ALLOWED('schemas', 'kernel', 'comms') },
    },
    {
      name: 'testing-deps',
      severity: 'error',
      from: { path: PKG('testing') },
      to: {
        path: '^packages/',
        pathNot: ALLOWED('schemas', 'kernel', 'plant', 'runtime-iec', 'importers', 'testing'),
      },
    },
    {
      name: 'expr-deps',
      severity: 'error',
      from: { path: PKG('expr') },
      to: { path: '^packages/', pathNot: ALLOWED('schemas', 'expr') },
    },
    {
      name: 'hmi-deps',
      severity: 'error',
      from: { path: PKG('hmi') },
      to: { path: '^packages/', pathNot: ALLOWED('schemas', 'expr', 'hmi') },
    },
    // apps/web chỉ import schemas, expr, hmi (M0 §3.5 + B7).
    {
      name: 'web-deps',
      severity: 'error',
      from: { path: '^apps/web/src' },
      to: { path: '^packages/', pathNot: ALLOWED('schemas', 'expr', 'hmi') },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    // P1.7: build output (apps/web/dist — chunk Monaco có circular import
    // nội bộ do bundler sinh) không phải source, không quét. Trước P1.7
    // dist cũ (React) không có cycle nên không lộ; Monaco lộ 132 lỗi giả.
    exclude: { path: '(\\.test\\.(ts|tsx)$|/tests/|node_modules|/dist/)' },
    moduleSystems: ['cjs', 'es6', 'tsd'],
  },
};
// Ghi chú (OQ-006): quy tắc "chỉ import qua exports (index.ts), cấm import file nội bộ
// xuyên package" chưa ép được bằng dependency-cruiser — rule theo đường dẫn đã resolve
// không phân biệt được import nội bộ cùng package (./b.ts) với import sâu xuyên package
// (../../kernel/src/foo.ts), vì cả hai đều resolve về packages/<pkg>/src/*.ts.
// Tạm thời dựa vào review + check-cheats; sẽ bổ sung rule riêng khi có cách phân biệt
// (ví dụ rule theo đường dẫn nguồn thô) ở P0.2.
