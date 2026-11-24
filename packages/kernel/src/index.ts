// @vcs/kernel — P0.3 (M0 §6.1–6.5, 6.9).
// Orchestrator/Pacer/LoopbackController thuộc P0.4 (M0 §6.6–6.8, 6.10).
export { ManualClock } from './clock.js';
export type { SimClock } from './clock.js';
export { TagError } from './errors.js';
export type { TagErrorCode } from './errors.js';
export { TagDB } from './tags.js';
export type {
  TagHandle,
  TagSource,
  Quality,
  TagMeta,
  Tag,
  TagChange,
  TagDBOptions,
  TagDBSnapshot,
} from './tags.js';
export { TagDbIoBus } from './iobus.js';
export type { IoPort, IoBus } from './iobus.js';
export { TraceHasher } from './hasher.js';
