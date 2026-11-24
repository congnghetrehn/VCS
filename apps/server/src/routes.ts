// REST tối thiểu — @vcs/server (M0 §8.2).
// GET /api/health, GET /api/project (OQ-042). GET / trả web build tĩnh khi
// có (đăng ký ở server.ts), ngược lại 404 JSON (OQ-044).

import type { FastifyInstance } from 'fastify';
import type { Diagnostic } from '@vcs/schemas';
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
}

export function registerRestRoutes(
  fastify: FastifyInstance,
  project: ProjectInfo,
  opts?: { hasWebBuild?: boolean },
): void {
  fastify.get('/api/health', () => ({ ok: true, version: VERSION }));
  fastify.get('/api/project', () => ({
    name: project.name,
    language: project.language,
    stepMs: project.stepMs,
    controllers: project.controllers,
    tagCount: project.tagCount,
    diagnostics: project.diagnostics,
  }));
  if (opts?.hasWebBuild !== true) {
    // OQ-044: chưa có web build (P0.6) → GET / 404 JSON rõ nghĩa.
    fastify.get('/', (_req, reply) => {
      void reply.status(404).send({ error: 'web build chưa có (P0.6)' });
    });
  }
}
