// @vcs/test-utils — P0.3 (M0 §7).
// `makeSim` + `FakeController` dời sang P0.4 (OQ-017: cần createSimulation/SimComponent).
export { defineTags, makeTags } from './tags.js';
export type { MakeTagsOptions } from './tags.js';
export { FakeClock } from './clock.js';
export { recordChanges } from './record.js';
export type { ChangeRecorder } from './record.js';
export { waitFor } from './wait.js';
export type { WaitForOptions } from './wait.js';
