// Server Fastify — @vcs/server (M0 §8.2).
// createServer(dir): loadProject → createSimulation({extensions,
// errorPolicy: 'isolate'}) → Fastify + REST + WS + SimulationService.
// Project có error → ném ProjectInvalidError (serve exit 2, OQ-045).
// Bind mặc định 127.0.0.1; --host 0.0.0.0 in cảnh báo ở lệnh serve.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import type { VerifyClientCallbackAsync } from 'ws';
import { ProjectInvalidError, createSimulation } from '@vcs/kernel';
import { loadProject, nodeFS } from '@vcs/project';
import { hasErrors } from '@vcs/schemas';
import { isOriginAllowed, resolveServerConfig, type ServerConfigInput } from './config.js';
import { SERVER_EXTENSIONS } from './extensions.js';
import { registerRestRoutes, type ProjectInfo } from './routes.js';
import { SimulationService } from './sim-service.js';
import { WsHub } from './ws.js';

export interface CreateServerOptions {
  config?: ServerConfigInput;
  /** Đồng hồ wall cho Pacer (mặc định Date.now); test tiêm đồng hồ giả. */
  now?: () => number;
  /** Thư mục web build (mặc định apps/web/dist); test có thể trỏ thư mục tạm. */
  webDistDir?: string;
  /** Tắt logger (test); mặc định bật pino theo VCS_LOG_LEVEL. */
  silent?: boolean;
}

export interface RunningServer {
  fastify: FastifyInstance;
  service: SimulationService;
  hub: WsHub;
  config: ReturnType<typeof resolveServerConfig>;
  url: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function createServer(
  dir: string,
  opts?: CreateServerOptions,
): Promise<RunningServer> {
  const model = await loadProject(nodeFS(dir));
  if (hasErrors(model.diagnostics)) {
    throw new ProjectInvalidError(model.diagnostics);
  }
  const bundle = await createSimulation(model, {
    extensions: [...SERVER_EXTENSIONS],
    errorPolicy: 'isolate',
  });
  const config = resolveServerConfig(opts?.config);
  const fastify = Fastify({
    logger: opts?.silent === true ? false : { level: config.logLevel },
  });
  const verifyClient: VerifyClientCallbackAsync = (info, cb) => {
    // OQ-036: Origin lạ → từ chối handshake HTTP 403 + log.
    const origin = info.origin;
    if (!isOriginAllowed(origin, config.allowedOrigins)) {
      fastify.log.warn({ origin }, 'ws: từ chối Origin không cho phép');
      cb(false, 403, 'Forbidden');
      return;
    }
    cb(true);
  };
  await fastify.register(websocket, {
    options: { maxPayload: config.maxPayloadBytes, verifyClient },
  });
  const service = new SimulationService(bundle, {
    ...(opts?.now !== undefined ? { now: opts.now } : {}),
    onState: () => {
      hub.broadcastStateNow();
    },
    onDiagnostic: (d) => {
      hub.broadcastDiagnostics(d);
    },
    onReset: () => {
      hub.broadcastSnapshotNow();
    },
  });
  const hub = new WsHub(fastify, service, {
    tickMs: Math.max(1, Math.round(1000 / config.uiRateHz)),
    maxConnections: config.maxConnections,
  });
  hub.registerRoutes();
  const webDistDir =
    opts?.webDistDir ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
  const hasWebBuild = existsSync(join(webDistDir, 'index.html'));
  if (hasWebBuild) {
    await fastify.register(fastifyStatic, { root: webDistDir, prefix: '/' });
  }
  const projectInfo: ProjectInfo = {
    name: model.config.name,
    language: model.config.language,
    stepMs: model.config.simulation.stepMs,
    controllers: model.config.controllers.map((c) => {
      if (c.mode === 'builtin') {
        const base: ProjectInfo['controllers'][number] = {
          id: c.id,
          mode: c.mode,
          vendor: c.vendor,
        };
        if (c.model !== undefined) base.model = c.model;
        return base;
      }
      return { id: c.id, mode: c.mode };
    }),
    tagCount: model.catalog.all().length,
    diagnostics: model.diagnostics,
  };
  registerRestRoutes(fastify, projectInfo, { hasWebBuild });
  let url = `http://${config.host}:${String(config.port)}/`;
  let started = false;
  let stopped = false;
  return {
    fastify,
    service,
    hub,
    config,
    get url() {
      return url;
    },
    async start() {
      if (started) return;
      started = true;
      await fastify.listen({ port: config.port, host: config.host });
      const address = fastify.server.address();
      const actualPort =
        typeof address === 'object' && address !== null ? address.port : config.port;
      url = `http://${config.host}:${String(actualPort)}/`;
      fastify.log.info(
        { host: config.host, port: actualPort, project: model.config.name },
        'vcs server đang chạy',
      );
      hub.start();
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      service.stop();
      hub.stop();
      await fastify.close();
    },
  };
}
