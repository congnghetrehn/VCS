// Schema `vcs.project.yaml` — @vcs/schemas (M0 §4.4).
// `schemaVersion` khác 1 KHÔNG bị từ chối ở đây mà thành PRJ-E006 ở
// loadProject (để `migrateProject` có cơ hội chạy).

import { z } from 'zod';
import type { YamlShape } from './yaml.js';

export const controllerIdSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/, 'id controller không hợp lệ');

const builtinControllerSchema = z.object({
  id: controllerIdSchema,
  mode: z.literal('builtin'),
  vendor: z.enum(['siemens', 'rockwell', 'abb', 'demo']),
  model: z.string().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
});

const externalControllerSchema = z.object({
  id: controllerIdSchema,
  mode: z.literal('external'),
  adapter: z.enum(['opcua', 'modbus', 's7', 'plcsim-advanced']),
  endpoint: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const controllerSchema = z.discriminatedUnion('mode', [
  builtinControllerSchema,
  externalControllerSchema,
]);

export type ControllerDef = z.output<typeof controllerSchema>;

const simulationSchema = z
  .object({
    stepMs: z.number().int().default(10),
    plcScanMs: z.number().int().optional(),
    timeScale: z.union([z.number().positive(), z.literal('max')]).default(1),
  })
  .superRefine((sim, ctx) => {
    if (sim.stepMs < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['stepMs'],
        message: 'stepMs phải là số nguyên ≥ 1',
        params: { diagnosticCode: 'PRJ-E007' },
      });
    }
    if (sim.plcScanMs !== undefined && sim.plcScanMs < sim.stepMs) {
      ctx.addIssue({
        code: 'custom',
        path: ['plcScanMs'],
        message: 'plcScanMs phải là số nguyên ≥ stepMs',
        params: { diagnosticCode: 'PRJ-E007' },
      });
    }
  })
  .transform((sim) => ({ ...sim, plcScanMs: sim.plcScanMs ?? sim.stepMs }));

export const projectSchema = z
  .object({
    schemaVersion: z.number().int(),
    name: z.string().min(1),
    language: z.enum(['vi', 'en']).default('vi'),
    seed: z.number().int().default(1),
    simulation: simulationSchema.default({ stepMs: 10, plcScanMs: 10, timeScale: 1 }),
    files: z
      .object({
        tags: z.string().default('tags/tags.yaml'),
        comms: z.string().default('comms/comms.yaml'),
        hmi: z.string().default('hmi/'),
        plant: z.string().default('plant/equipment.yaml'),
      })
      .default({
        tags: 'tags/tags.yaml',
        comms: 'comms/comms.yaml',
        hmi: 'hmi/',
        plant: 'plant/equipment.yaml',
      }),
    controllers: z.array(controllerSchema).default([]),
  })
  .superRefine((doc, ctx) => {
    const seen = new Map<string, number>();
    doc.controllers.forEach((c, i) => {
      const prev = seen.get(c.id);
      if (prev !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['controllers', i, 'id'],
          message: `controllers: id '${c.id}' trùng với controllers[${String(prev)}].id`,
          params: { diagnosticCode: 'PRJ-E003' },
        });
      } else {
        seen.set(c.id, i);
      }
    });
  });

export type ProjectConfig = z.output<typeof projectSchema>;
export type ProjectConfigInput = z.input<typeof projectSchema>;

/** Hình dạng schema để phát hiện khóa lạ trong YAML (xem yaml.ts). */
export const PROJECT_SHAPE: YamlShape = {
  keys: ['schemaVersion', 'name', 'language', 'seed', 'simulation', 'files', 'controllers'],
  children: {
    simulation: { keys: ['stepMs', 'plcScanMs', 'timeScale'] },
    files: { keys: ['tags', 'comms', 'hmi', 'plant'] },
    controllers: {
      items: {
        keys: ['id', 'mode', 'vendor', 'model', 'config', 'adapter', 'endpoint'],
        children: { config: { freeForm: true } },
      },
    },
  },
};
