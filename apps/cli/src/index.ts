#!/usr/bin/env node
// Entry CLI `vcs` — @vcs/cli (M0 §8.1). Chạy từ source qua `pnpm vcs` (tsx).
// Lỗi usage của commander (lệnh lạ, cờ lạ, --help/--version) được map về mã
// thoát: 0 cho help/version, 3 cho sai tham số (OQ-027).

import { CommanderError } from 'commander';
import { createProgram } from './commands/index.js';

async function main(): Promise<number> {
  const program = createProgram();
  program.exitOverride();
  try {
    await program.parseAsync(process.argv);
    return typeof process.exitCode === 'number' ? process.exitCode : 0;
  } catch (err) {
    if (err instanceof CommanderError) {
      if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
        return 0;
      }
      console.error(err.message);
      return 3;
    }
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

process.exitCode = await main();
