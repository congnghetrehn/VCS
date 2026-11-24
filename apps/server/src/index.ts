// Entry @vcs/server — M0 §8.2.
// Export API cho `vcs serve` và cho test. Entry thư viện thuần, KHÔNG có
// main-guard/side-effect (xem `main.ts`): để guard ở đây thì khi @vcs/server
// bị bundle vào CLI, `import.meta.url` là file dist của CLI và guard chạy
// nhầm main() với argv của CLI.

export { VERSION } from './version.js';
export { createServer } from './server.js';
export type { CreateServerOptions, RunningServer } from './server.js';
export { SimulationService } from './sim-service.js';
export type {
  ServiceState,
  ServiceResult,
  SnapshotDef,
  TagsSnapshot,
  SimulationServiceOptions,
} from './sim-service.js';
export { WsHub } from './ws.js';
export type { WsHubOptions } from './ws.js';
export { resolveServerConfig, isOriginAllowed, DEFAULT_SERVER_CONFIG } from './config.js';
export type { ServerConfig, ServerConfigInput } from './config.js';
export { registerRestRoutes } from './routes.js';
export type { ProjectInfo } from './routes.js';
export { SERVER_EXTENSIONS } from './extensions.js';
