// @vcs/project — P0.2 (M0 §5).
export { nodeFS, memoryFS, globToRegExp } from './fs.js';
export type { ProjectFS } from './fs.js';
export { normalizeTextForHash, hashText } from './hash.js';
export { loadProject, EMPTY_PROJECT_CONFIG } from './load.js';
export type { ProjectModel } from './load.js';
