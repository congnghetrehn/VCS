// Extension nối SoftPlc vào `createSimulation` (OQ-155).
// Đăng ký factory `builtin:siemens` → `SoftPlc`; `init(cfg, io)` ghi đè
// `scanPeriodMs` bằng `cfg.scanPeriodMs` (D2) và build lại `TagAddressMap`
// từ `cfg.tags` (OQ-138). CHƯA thêm vào `apps/cli`/`apps/server`
// extensions (chưa có nguồn program từ project file — việc đó là P1.7
// `compileProject`); test dùng `makeSim(project, { extensions: [
// softPlcExtension(program) ] })`.

import type { ControllerAdapter, SimulationExtension } from '@vcs/kernel';
import type { IrProgram } from './ir.js';
import { SoftPlc, type SoftPlcConfig } from './softplc.js';
import type { TagAddressMap } from './tagmap.js';

const EMPTY_TAG_MAP: TagAddressMap = new Map();

export function softPlcExtension(
  program: IrProgram,
  opts?: {
    faultPolicy?: SoftPlcConfig['faultPolicy'];
    maxCallDepth?: number;
    maxLoopIterations?: number;
    maxScansPerStep?: number;
    outputsOnStop?: SoftPlcConfig['outputsOnStop'];
  },
): SimulationExtension {
  return {
    id: 'siemens-softplc',
    apply(ctx): void {
      ctx.registerController('builtin:siemens', (def): ControllerAdapter => {
        return new SoftPlc(program, EMPTY_TAG_MAP, {
          id: def.id,
          // Placeholder tới khi `init(cfg, io)` ghi đè bằng cfg.scanPeriodMs (D2).
          scanPeriodMs: 20,
          ...(opts?.faultPolicy !== undefined ? { faultPolicy: opts.faultPolicy } : {}),
          ...(opts?.maxCallDepth !== undefined ? { maxCallDepth: opts.maxCallDepth } : {}),
          ...(opts?.maxLoopIterations !== undefined
            ? { maxLoopIterations: opts.maxLoopIterations }
            : {}),
          ...(opts?.maxScansPerStep !== undefined
            ? { maxScansPerStep: opts.maxScansPerStep }
            : {}),
          ...(opts?.outputsOnStop !== undefined ? { outputsOnStop: opts.outputsOnStop } : {}),
        });
      });
    },
  };
}
