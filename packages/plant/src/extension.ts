// plantExtension — @vcs/plant (M2 §5.1, P2.4 commit 1, OQ-312/313).
// Đăng ký PlantEngine vào pha 'plant' của orchestrator từ config project.
// Không có plant trong project (hoặc danh sách rỗng) → no-op: plant là
// opt-in theo project. Config plant lỗi → PlantEngine constructor throw
// kèm mã PL, lan truyền khỏi createSimulation (fail-fast — OQ-313).

import type { SimulationExtension } from '@vcs/kernel';

import { PlantEngine } from './engine.js';

export function plantExtension(): SimulationExtension {
  return {
    id: 'plant',
    apply(ctx) {
      const plant = ctx.project.plant;
      if (plant === undefined || plant.length === 0) return;
      const engine = new PlantEngine(
        {
          stepMs: ctx.project.config.simulation.stepMs,
          seed: ctx.project.config.seed,
          equipment: [...plant],
          tags: new Map(ctx.project.tags.map((t) => [t.name, t])),
          plcScanMs: ctx.project.config.simulation.plcScanMs,
        },
        ctx.tags,
      );
      ctx.register('plant', engine);
    },
  };
}
