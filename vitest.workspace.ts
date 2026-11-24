// Workspace Vitest (M0 §3.2). P0.1 chỉ có project gốc (tests/); các prompt P0.2+
// thêm project cho từng package/app khi package đó có test riêng.
// Vitest 4 không còn export `defineWorkspace` — file workspace export trực tiếp
// mảng cấu hình project.
export default ['./vitest.config.ts'];
