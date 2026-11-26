// @vcs/schemas — P0.2 (M0 §4).
// Package độc lập (không import package nào khác, M0 §3.5).
export {
  dataTypeSchema,
  tagValueSchema,
  srcRefSchema,
  diagnosticSchema,
  diag,
  formatDiagnostic,
  hasErrors,
  sortDiagnostics,
} from './common.js';
export type {
  DataType,
  TagValue,
  SignalKind,
  IoArea,
  MemArea,
  TagOwner,
  Unsub,
  SrcRef,
  Diagnostic,
} from './common.js';
export {
  DurationError,
  tryParseDuration,
  parseDuration,
  formatDuration,
  durationSchema,
} from './duration.js';
export { defineDiagnostics, PRJ_CATALOG, SCL_CATALOG, LAD_CATALOG, PL_CATALOG, IO_CATALOG, IO_CODES, DIAGNOSTIC_CODE_RE } from './diagnostics-catalog.js';
export type { DiagnosticInfo, DiagnosticCatalog, IoCode } from './diagnostics-catalog.js';
export { equipmentFileSchema, equipmentInstanceSchema, sourceSpecSchema } from './equipment.js';
export type { EquipmentInstance, SourceSpec } from './equipment.js';
export {
  signalFaultTypeSchema,
  faultTimingSchema,
  faultRequestSchema,
  faultInfoSchema,
} from './fault.js';
export type { SignalFaultType, FaultTarget, FaultTiming, FaultRequest, FaultInfo } from './fault.js';
export { canonicalFieldSchema, importProfileSchema, ioCodeSchema, ruleSeveritySchema, transformStepSchema } from './import-profile.js';
export type { CanonicalField, ImportProfile, RuleSeverity, TransformStep } from './import-profile.js';
export {
  DEFAULT_EQUIPMENT_CODE_TO_MODEL,
  DEFAULT_NAMING_CONVENTION,
  DEFAULT_TAG_PATTERN,
  namingConfigSchema,
  namingConventionSchema,
} from './naming.js';
export type { NamingConfig, NamingConvention } from './naming.js';
export { parseYamlWithSchema, levenshtein, zodIssueParams } from './yaml.js';
export type { YamlShape, ParseYamlResult } from './yaml.js';
export { controllerIdSchema, controllerSchema, projectSchema, PROJECT_SHAPE } from './project.js';
export type { ControllerDef, ProjectConfig, ProjectConfigInput } from './project.js';
export {
  TAG_NAME_RE,
  isValidAddressLight,
  tagSchema,
  tagsFileSchema,
  TAGS_SHAPE,
  createTagCatalog,
} from './tags.js';
export type { Scaling, TagSignal, TagDef, TagsFile, TagCatalog } from './tags.js';
export { migrations, migrateProject } from './migrate.js';
export type { Migration } from './migrate.js';
export {
  PROTOCOL_VERSION,
  simStateSchema,
  clientMessageSchema,
  serverMessageSchema,
} from './protocol.js';
export type { SimState, ClientMessage, ServerMessage } from './protocol.js';
