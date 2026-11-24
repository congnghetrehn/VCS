// Version của server — @vcs/server (M0 §8.1–8.2).
// Giữ đồng bộ tay với `apps/server/package.json` (xem OQ-051); test assert
// VERSION === package.json.version. File riêng để tránh import vòng tròn
// (routes.ts dùng VERSION, index.ts re-export).

export const VERSION = '0.1.0';
