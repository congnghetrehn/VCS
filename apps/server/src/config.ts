// Cấu hình server — @vcs/server (M0 §8.2).
// Đọc biến môi trường + cờ CLI; CLI thắng env, env thắng mặc định.
// Mọi giá trị đều validate (sai → ném Error nêu tên biến/giá trị).

export interface ServerConfig {
  port: number;
  host: string;
  logLevel: string;
  /** Nhịp phát tags.delta/sim.state, Hz. */
  uiRateHz: number;
  /** Số kết nối WS đồng thời tối đa. */
  maxConnections: number;
  /** Kích thước message WS tối đa, byte. */
  maxPayloadBytes: number;
  /** Origin cho phép thêm ngoài localhost (khớp chính xác). */
  allowedOrigins: string[];
}

export interface ServerConfigInput {
  port?: number | undefined;
  host?: string | undefined;
  logLevel?: string | undefined;
  uiRateHz?: number | undefined;
  maxConnections?: number | undefined;
  maxPayloadBytes?: number | undefined;
  allowedOrigins?: string[] | undefined;
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: 4170,
  host: '127.0.0.1',
  logLevel: 'info',
  uiRateHz: 10,
  maxConnections: 8,
  maxPayloadBytes: 64 * 1024,
  allowedOrigins: [],
};

function parsePort(raw: string, where: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${where}: port phải là số nguyên 0..65535, nhận '${raw}'`);
  }
  const n = Number.parseInt(raw, 10);
  if (n < 0 || n > 65535) {
    throw new Error(`${where}: port phải là số nguyên 0..65535, nhận '${raw}'`);
  }
  return n;
}

function parsePositiveNumber(raw: string, where: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${where}: phải là số > 0, nhận '${raw}'`);
  }
  return n;
}

/**
 * Gộp mặc định ← env ← cờ CLI (input). `env` mặc định là `process.env`
 * (tiêm vào để test được).
 */
export function resolveServerConfig(
  input?: ServerConfigInput,
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const out: ServerConfig = {
    ...DEFAULT_SERVER_CONFIG,
    allowedOrigins: [...DEFAULT_SERVER_CONFIG.allowedOrigins],
  };
  const envPort = env['VCS_PORT'];
  if (envPort !== undefined && envPort !== '') out.port = parsePort(envPort, 'VCS_PORT');
  const envHost = env['VCS_HOST'];
  if (envHost !== undefined && envHost !== '') out.host = envHost;
  const envLog = env['VCS_LOG_LEVEL'];
  if (envLog !== undefined && envLog !== '') out.logLevel = envLog;
  const envRate = env['VCS_UI_RATE_HZ'];
  if (envRate !== undefined && envRate !== '') {
    out.uiRateHz = parsePositiveNumber(envRate, 'VCS_UI_RATE_HZ');
  }
  const envOrigins = env['VCS_ALLOWED_ORIGINS'];
  if (envOrigins !== undefined && envOrigins !== '') {
    out.allowedOrigins = envOrigins
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
  }
  const o: ServerConfigInput = input ?? {};
  if (o.port !== undefined) {
    if (!Number.isInteger(o.port) || o.port < 0 || o.port > 65535) {
      throw new Error(`--port: phải là số nguyên 0..65535, nhận '${String(o.port)}'`);
    }
    out.port = o.port;
  }
  if (o.host !== undefined) out.host = o.host;
  if (o.logLevel !== undefined) out.logLevel = o.logLevel;
  if (o.uiRateHz !== undefined) {
    if (typeof o.uiRateHz !== 'number' || !Number.isFinite(o.uiRateHz) || o.uiRateHz <= 0) {
      throw new Error(`uiRateHz: phải là số > 0, nhận '${String(o.uiRateHz)}'`);
    }
    out.uiRateHz = o.uiRateHz;
  }
  if (o.maxConnections !== undefined) {
    if (!Number.isInteger(o.maxConnections) || o.maxConnections < 1) {
      throw new Error(`maxConnections: phải là số nguyên ≥ 1, nhận '${String(o.maxConnections)}'`);
    }
    out.maxConnections = o.maxConnections;
  }
  if (o.maxPayloadBytes !== undefined) {
    if (!Number.isInteger(o.maxPayloadBytes) || o.maxPayloadBytes < 1024) {
      throw new Error(
        `maxPayloadBytes: phải là số nguyên ≥ 1024, nhận '${String(o.maxPayloadBytes)}'`,
      );
    }
    out.maxPayloadBytes = o.maxPayloadBytes;
  }
  if (o.allowedOrigins !== undefined) out.allowedOrigins = [...o.allowedOrigins];
  return out;
}

/**
 * Origin được phép bắt tay WS (OQ-036): rỗng (client không trình duyệt),
 * `http://localhost:*` / `http://127.0.0.1:*` mọi cổng, hoặc khớp chính xác
 * một origin trong danh sách cho phép. Còn lại → từ chối.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (origin === undefined || origin === '') return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return allowedOrigins.includes(origin);
}
