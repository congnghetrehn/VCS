// Schema giao thức WebSocket — @vcs/schemas (M0 §9.2).
// Web và server cùng dùng schema này. PROTOCOL_VERSION = 1.

import { z } from 'zod';
import { dataTypeSchema, diagnosticSchema, tagValueSchema } from './common.js';
import { sourceSpecSchema } from './equipment.js';
import { faultRequestSchema, faultTimingSchema } from './fault.js';

export const PROTOCOL_VERSION = 1;

export const simStateSchema = z.object({
  state: z.enum(['IDLE', 'RUNNING', 'PAUSED']),
  simTimeMs: z.number().int().min(0),
  stepCount: z.number().int().min(0),
  timeScale: z.union([z.number(), z.literal('max')]),
  lagging: z.boolean(),
  achievedScale: z.number(),
  /** B4 (M4 §2 hàng 4): khóa điều khiển khi có controller ngoài. Optional,
   * additive — server P0.8 không bao giờ gửi trường này (OQ-080). */
  locked: z.boolean().optional(),
  /** P1.7 (OQ-207): thống kê SoftPlc khi project có plc/ — additive, chỉ
   * có khi có controller introspectable `builtin:siemens`. */
  plc: z
    .object({
      scanCount: z.number().int().min(0),
      faultCount: z.number().int().min(0),
    })
    .optional(),
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

/** P1.7 (OQ-206): Watch PLC — đăng ký danh sách ref cần theo dõi. */
const plcWatchSchema = z.object({
  type: z.literal('plc.watch'),
  refs: z.array(z.string().min(1)).min(1).max(200),
});

const plcUnwatchSchema = z.object({ type: z.literal('plc.unwatch') });

/** P1.7 (OQ-206/216): ghi qua introspection; sai kiểu → lỗi TAG-E001. */
const plcWriteSchema = z.object({
  type: z.literal('plc.write'),
  ref: z.string().min(1),
  value: tagValueSchema,
});

const plcForceSchema = z.object({
  type: z.literal('plc.force'),
  ref: z.string().min(1),
  value: tagValueSchema,
});

const plcUnforceSchema = z.object({
  type: z.literal('plc.unforce'),
  ref: z.string().min(1),
});

/** P2.4 (OQ-318): chèn lỗi plant qua WS — validate bằng faultRequestSchema. */
const plantFaultInjectSchema = z.object({
  type: z.literal('plant.fault.inject'),
  request: faultRequestSchema,
});

/** P2.4 (OQ-318): clear tay một lỗi plant (id record từ inject/listFaults). */
const plantFaultClearSchema = z.object({
  type: z.literal('plant.fault.clear'),
  id: z.string().min(1),
});

/**
 * P2.4 (OQ-318, tier B): áp preset lỗi của model (vd noRunFeedback của
 * motor_dol) — kịch bản B (§11.4) chỉ lái tay được qua preset; `when`
 * mặc định {at:'now'} (panel truyền {at:'time', timeMs: simTimeMs} như
 * inject để khớp mốc scenario).
 */
const plantFaultPresetSchema = z.object({
  type: z.literal('plant.fault.preset'),
  equipment: z.string().min(1),
  preset: z.string().min(1),
  when: faultTimingSchema.optional(),
});

export type PlantFaultInjectMessage = z.infer<typeof plantFaultInjectSchema>;
export type PlantFaultClearMessage = z.infer<typeof plantFaultClearSchema>;
export type PlantFaultPresetMessage = z.infer<typeof plantFaultPresetSchema>;

/**
 * P2.8 (OQ-388): đặt giá trị manual cho source của thiết bị (named source
 * qua `name`, không có → source chính). Validate bằng tagValueSchema ở đây;
 * engine kiểm tra thiết bị có source không → lỗi PL-E001 qua WS error.
 */
const plantManualSetSchema = z.object({
  type: z.literal('plant.manual.set'),
  equipment: z.string().min(1),
  // engine.setManual chỉ nhận number | boolean (string không phải giá trị
  // nguồn hợp lệ) — chặn ngay ở schema, không để lọt vào engine.
  value: z.union([z.number(), z.boolean()]),
  name: z.string().min(1).optional(),
});

/**
 * P2.8 (OQ-388): đổi spec source của thiết bị (named source qua `name`).
 * Validate bằng sourceSpecSchema ở đây; engine kiểm tra thiết bị/model.
 */
const plantSourceSetSchema = z.object({
  type: z.literal('plant.source.set'),
  equipment: z.string().min(1),
  source: sourceSpecSchema,
  name: z.string().min(1).optional(),
});

export type PlantManualSetMessage = z.infer<typeof plantManualSetSchema>;
export type PlantSourceSetMessage = z.infer<typeof plantSourceSetSchema>;

export const clientMessageSchema = z.discriminatedUnion('type', [
  helloSchema,
  simCommandSchema,
  simTimeScaleSchema,
  tagsSubscribeSchema,
  tagsUnsubscribeSchema,
  tagWriteSchema,
  plcWatchSchema,
  plcUnwatchSchema,
  plcWriteSchema,
  plcForceSchema,
  plcUnforceSchema,
  plantFaultInjectSchema,
  plantFaultClearSchema,
  plantFaultPresetSchema,
  plantManualSetSchema,
  plantSourceSetSchema,
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

/** P1.7 (OQ-206): giá trị Watch — [vị trí trong danh sách watch, giá trị],
 * gửi ở nhịp 10 Hz, chỉ khi có ref đổi (LWW). */
const plcValuesSchema = z.object({
  type: z.literal('plc.values'),
  simTimeMs: z.number().int().min(0),
  values: z.array(z.tuple([z.number().int(), tagValueSchema])),
});

/** Thống kê gateway (M4 §5.3, nguyên văn). */
export const gatewayStatsSchema = z.object({
  state: z.enum(['stopped', 'starting', 'running', 'error']),
  startedAtWallMs: z.number().int().optional(),
  lastError: z.string().optional(),
  clients: z.number().int().min(0),
  reads: z.number().int().min(0),
  writes: z.number().int().min(0),
  errors: z.number().int().min(0),
  monitoredItems: z.number().int().min(0).optional(),
  subscriptions: z.number().int().min(0).optional(),
});

export type GatewayStats = z.infer<typeof gatewayStatsSchema>;

/** Trạng thái comms (M4 §5.3 + §10.1; envelope đề xuất ở OQ-076 — P0.8 chỉ
 * schema, server chưa phát message này). */
export const commsStatusSchema = z.object({
  type: z.literal('comms.status'),
  gateways: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['opcua-server', 'modbus-server']),
      stats: gatewayStatsSchema,
      endpoints: z.array(z.string()),
    }),
  ),
});

export type CommsStatus = z.infer<typeof commsStatusSchema>;

/** Một mục RingLog (M4 §5.4, nguyên văn; `level` giữ string, xem OQ-077). */
export const commsLogEntrySchema = z.object({
  tWallMs: z.number().int(),
  gateway: z.string(),
  level: z.string(),
  kind: z.enum(['session', 'request', 'write', 'error', 'info']),
  summary: z.string(),
  detail: z.string().optional(),
});

export type CommsLogEntry = z.infer<typeof commsLogEntrySchema>;

/** Log comms (M4 §5.4; envelope đề xuất ở OQ-076 — P0.8 chỉ schema). */
export const commsLogSchema = z.object({
  type: z.literal('comms.log'),
  entries: z.array(commsLogEntrySchema),
});

export type CommsLog = z.infer<typeof commsLogSchema>;

export const serverMessageSchema = z.discriminatedUnion('type', [
  welcomeSchema,
  simStateMessageSchema,
  tagsSnapshotSchema,
  tagsDeltaSchema,
  diagnosticsMessageSchema,
  errorMessageSchema,
  plcValuesSchema,
  commsStatusSchema,
  commsLogSchema,
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;
