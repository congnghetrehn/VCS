// REST tối thiểu — @vcs/server (M0 §8.2).
// GET /api/health, GET /api/project (OQ-042). GET / trả web build tĩnh khi
// có (đăng ký ở server.ts), ngược lại 404 JSON (OQ-044).
// P1.7 (OQ-208): POST /api/plc/build (compile-check, không hot reload) +
// POST /api/plc/files (ghi file trong plc/).

import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { hasErrors, type Diagnostic, type TagDef } from '@vcs/schemas';
import { loadPlcProgram, savePlcFile } from './plc.js';
import type { SimulationService } from './sim-service.js';
import { VERSION } from './version.js';

export interface ProjectInfo {
  name: string;
  language: 'vi' | 'en';
  stepMs: number;
  controllers: Array<{
    id: string;
    mode: 'builtin' | 'external';
    vendor?: string;
    model?: string;
  }>;
  tagCount: number;
  diagnostics: readonly Diagnostic[];
  /** P2.8 (AMENDMENTS B9, OQ-398): equipment từ plant/equipment.yaml trên
   * đĩa (static, không cần sim chạy); project không plant → []. */
  equipment: Array<{
    id: string;
    model: string;
    roles: Array<{ role: string; tag: string }>;
  }>;
}

/** Ngữ cảnh PLC cho REST (P1.7): thư mục project + tag catalog (OQ-198). */
export interface PlcRoutesContext {
  dir: string;
  tags: readonly TagDef[];
}

export function registerRestRoutes(
  fastify: FastifyInstance,
  project: ProjectInfo,
  opts?: {
    hasWebBuild?: boolean;
    plc?: PlcRoutesContext;
    /** P2.4 (OQ-318): service cho GET /api/plant + GET /api/sim/hash. */
    service?: SimulationService;
  },
): void {
  fastify.get('/api/health', () => ({ ok: true, version: VERSION }));
  fastify.get('/api/project', () => ({
    name: project.name,
    language: project.language,
    stepMs: project.stepMs,
    controllers: project.controllers,
    tagCount: project.tagCount,
    diagnostics: project.diagnostics,
    equipment: project.equipment,
  }));
  if (opts?.service !== undefined) {
    const service = opts.service;
    // P2.4 (OQ-318): snapshot plant (equipment + faults + observables +
    // fault/preset model khai báo); project không plant → {equipment: []}.
    // P2.8 (OQ-389): thêm events ≤ 100 mới nhất.
    fastify.get('/api/plant', () => {
      const snap = service.plantSnapshot();
      return { equipment: snap?.equipment ?? [], events: snap?.events ?? [] };
    });
    // P2.4 (OQ-318): hash trace hiện tại — e2e so với hash CLI `plant run`.
    fastify.get('/api/sim/hash', () => ({
      hash: service.simHash(),
      simTimeMs: service.simTimeMs,
      stepCount: service.stepCount,
    }));
  }
  if (opts?.plc !== undefined) {
    const plcCtx = opts.plc;
    // P1.7 (OQ-208): compile-check plc/ hiện tại trên đĩa; KHÔNG hot reload
    // PLC đang chạy. Luôn 200; ok=false khi có error.
    fastify.post('/api/plc/build', async () => {
      const loaded = await loadPlcProgram(plcCtx.dir, plcCtx.tags);
      if (loaded === null) return { ok: true, diagnostics: [], files: [] };
      return {
        ok: !hasErrors(loaded.diagnostics),
        diagnostics: [...loaded.diagnostics],
        files: loaded.files.map((f) => basename(f)),
      };
    });
    // P1.7 (OQ-208): ghi file trong plc/; đường ra ngoài → 400.
    fastify.post('/api/plc/files', async (req, reply) => {
      const body: unknown = req.body;
      if (
        typeof body !== 'object' ||
        body === null ||
        !('path' in body) ||
        !('content' in body) ||
        typeof (body as { path: unknown }).path !== 'string' ||
        typeof (body as { content: unknown }).content !== 'string' ||
        (body as { path: string }).path === ''
      ) {
        return reply
          .status(400)
          .send({ error: 'body phải là {path: string, content: string}' });
      }
      const { path, content } = body as { path: string; content: string };
      try {
        const saved = await savePlcFile(plcCtx.dir, path, content);
        return { ok: true, path: basename(saved) };
      } catch (err) {
        return reply
          .status(400)
          .send({ error: err instanceof Error ? err.message : String(err) });
      }
    });
    // P1.7 (bổ sung OQ-208 — editor cần đọc file): đọc file trong plc/;
    // đường ra ngoài → 400, không có → 404. Chỉ đọc, không biên dịch lại.
    fastify.get('/api/plc/files', async (req, reply) => {
      const query = req.query as { path?: unknown };
      if (typeof query.path !== 'string' || query.path === '') {
        return reply.status(400).send({ error: 'query phải có ?path=<file trong plc/>' });
      }
      const plcDir = resolve(plcCtx.dir, 'plc');
      const target = resolve(plcDir, query.path);
      if (target !== plcDir && !target.startsWith(plcDir + sep)) {
        return reply.status(400).send({ error: `đường dẫn '${query.path}' nằm ngoài thư mục plc/` });
      }
      try {
        const content = await readFile(target, 'utf8');
        return { path: query.path, content };
      } catch {
        return reply.status(404).send({ error: `không tìm thấy file '${query.path}'` });
      }
    });
  }
  if (opts?.hasWebBuild !== true) {
    // OQ-044: chưa có web build (P0.6) → GET / 404 JSON rõ nghĩa.
    fastify.get('/', (_req, reply) => {
      void reply.status(404).send({ error: 'web build chưa có (P0.6)' });
    });
  }
}
