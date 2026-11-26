// Danh sách extension của server — MỘT CHỖ duy nhất (M0 §6.8).
// Thêm extension = thêm một dòng ở đây; mirror `apps/cli` (§6.8).
import { demoExtension } from '@vcs/kernel/demo';
import type { SimulationExtension } from '@vcs/kernel';
import { plantExtension } from '@vcs/plant';

export const SERVER_EXTENSIONS: readonly SimulationExtension[] = [demoExtension, plantExtension()];
