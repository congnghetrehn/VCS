// Schema giao thức WebSocket — @vcs/schemas (M0 §9.2).
// Web và server cùng dùng schema này. PROTOCOL_VERSION = 1.

import { z } from 'zod';
import { dataTypeSchema, diagnosticSchema, tagValueSchema } from './common.js';

export const PROTOCOL_VERSION = 1;

export const simStateSchema = z.object({
  state: z.enum(['IDLE', 'RUNNING', 'PAUSED']),
  simTimeMs: z.number().int().min(0),
  stepCount: z.number().int().min(0),
  timeScale: z.union([z.number(), z.literal('max')]),
  lagging: z.boolean(),
  achievedScale: z.number(),
});

export type SimState = z.infer<typeof simStateSchema>;

const helloSchema = z.object({
  type: z.literal('hello'),
  protocolVersion: z.number().int(),
});

const simCommandSchema = z.object({
  type: z.literal('sim.command'),
  cmd: z.enum(['run', 'pause', 'step', 'reset']),
  steps: z.number().int().min(1).max(10_000).optional(),
});

const simTimeScaleSchema = z.object({
  type: z.literal('sim.timeScale'),
  value: z.union([z.number(), z.literal('max')]),
});

const tagsSubscribeSchema = z.object({
  type: z.literal('tags.subscribe'),
  names: z.union([z.literal('*'), z.array(z.string())]),
});

const tagsUnsubscribeSchema = z.object({ type: z.literal('tags.unsubscribe') });

const tagWriteSchema = z.object({
  type: z.literal('tag.write'),
  name: z.string(),
  value: tagValueSchema,
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  helloSchema,
  simCommandSchema,
  simTimeScaleSchema,
  tagsSubscribeSchema,
  tagsUnsubscribeSchema,
  tagWriteSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

const welcomeSchema = z.object({
  type: z.literal('welcome'),
  protocolVersion: z.number().int(),
  project: z.object({
    name: z.string(),
    language: z.enum(['vi', 'en']),
    stepMs: z.number().int(),
  }),
  sim: simStateSchema,
});

const simStateMessageSchema = simStateSchema.extend({ type: z.literal('sim.state') });

const tagsSnapshotSchema = z.object({
  type: z.literal('tags.snapshot'),
  defs: z.array(
    z.object({
      name: z.string(),
      type: dataTypeSchema,
      area: z.enum(['I', 'Q', 'M', 'DB']),
      address: z.string(),
      controller: z.string(),
      description: z.string().optional(),
      owner: z.enum(['plant', 'controller', 'free']),
      writable: z.boolean(),
    }),
  ),
  values: z.array(tagValueSchema),
  simTimeMs: z.number().int().min(0),
});

const tagsDeltaSchema = z.object({
  type: z.literal('tags.delta'),
  simTimeMs: z.number().int().min(0),
  changes: z.array(z.tuple([z.number().int(), tagValueSchema])),
});

const diagnosticsMessageSchema = z.object({
  type: z.literal('diagnostics'),
  items: z.array(diagnosticSchema),
});

const errorMessageSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
  ref: z.string().optional(),
});

export const serverMessageSchema = z.discriminatedUnion('type', [
  welcomeSchema,
  simStateMessageSchema,
  tagsSnapshotSchema,
  tagsDeltaSchema,
  diagnosticsMessageSchema,
  errorMessageSchema,
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;
