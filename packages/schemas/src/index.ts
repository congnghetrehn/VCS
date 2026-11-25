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
export { defineDiagnostics, PRJ_CATALOG, SCL_CATALOG, LAD_CATALOG, DIAGNOSTIC_CODE_RE } from './diagnostics-catalog.js';
export type { DiagnosticInfo, DiagnosticCatalog } from './diagnostics-catalog.js';
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
