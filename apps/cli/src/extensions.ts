// Danh sách extension của CLI — MỘT CHỖ duy nhất (M0 §6.8).
// Thêm extension = thêm một dòng ở đây; `vcs run`/`vcs serve` dùng chung.
import { demoExtension } from '@vcs/kernel/demo';
import type { SimulationExtension } from '@vcs/kernel';
import { plantExtension } from '@vcs/plant';

export const CLI_EXTENSIONS: readonly SimulationExtension[] = [demoExtension, plantExtension()];
