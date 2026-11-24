// demoExtension — @vcs/kernel/demo (M0 §6.10).
// Đăng ký factory `builtin:demo` → LoopbackController.

import type { ControllerDef } from '@vcs/schemas';
import type { BuildCtx, SimulationExtension } from '../builder.js';
import type { ControllerAdapter } from '../component.js';
import { LoopbackController } from './loopback.js';

export const demoExtension: SimulationExtension = {
  id: 'demo',
  apply(ctx: BuildCtx): void {
    ctx.registerController('builtin:demo', (def: ControllerDef): ControllerAdapter => {
      return new LoopbackController(def.id, ctx.tags);
    });
  },
};
