// System block — @vcs/runtime-iec (M1 §9, P1.5).

export { getStdBlockDef, stdBlockInterface, STD_BLOCKS } from './defs.js';
export type { StdBlockDef, StdBlockKind, StdBlockName, StdFieldDecl } from './defs.js';
export { createStdSysCalls, stdDef } from './handlers.js';
