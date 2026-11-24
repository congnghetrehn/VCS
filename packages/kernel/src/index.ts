// @vcs/kernel — P0.3 (M0 §6.1–6.5, 6.9) + P0.4 (M0 §6.6–6.8, 6.10).
// Demo controller ở subpath riêng `@vcs/kernel/demo`, không export ở đây.
export { ManualClock } from './clock.js';
export type { SimClock } from './clock.js';
export { TagError, SimComponentError, ProjectInvalidError } from './errors.js';
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
export type { Phase, StepResult, SimComponent } from './component.js';
export type {
  ControllerAdapter,
  ControllerConfig,
  ControllerDiagnostics,
  ControllerIntrospection,
} from './component.js';
export { isIntrospectable } from './component.js';
export { SimulationOrchestrator } from './orchestrator.js';
export type {
  StepHooks,
  ExternalCommand,
  OrchestratorOptions,
  SimSnapshot,
  SimEvents,
} from './orchestrator.js';
export { createSimulation } from './builder.js';
export type {
  ControllerKey,
  ControllerFactory,
  SimulationProject,
  BuildCtx,
  SimulationExtension,
  SimulationBundle,
} from './builder.js';
export { Pacer } from './pacer.js';
export type { PacerOptions } from './pacer.js';
