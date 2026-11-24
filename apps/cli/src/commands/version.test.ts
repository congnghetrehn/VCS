// Test `vcs version` + khung lệnh (M0 §8.1).
import { describe, expect, it, vi } from 'vitest';
import { createProgram } from './index.js';
import { VERSION, versionCommand } from './version.js';

describe('vcs version', () => {
  it('versionCommand in "vcs 0.1.0", exit 0', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(versionCommand()).toBe(0);
      expect(spy).toHaveBeenCalledWith(`vcs ${VERSION}`);
      expect(VERSION).toBe('0.1.0');
    } finally {
      spy.mockRestore();
    }
  });

  it('lệnh version qua createProgram → exit 0', async () => {
    const program = createProgram();
    program.exitOverride();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await program.parseAsync(['node', 'vcs', 'version']);
      expect(process.exitCode).toBe(0);
    } finally {
      spy.mockRestore();
      process.exitCode = undefined;
    }
  });

  it('lệnh lạ → CommanderError (index.ts map về exit 3)', async () => {
    const program = createProgram();
    program.exitOverride();
    await expect(program.parseAsync(['node', 'vcs', 'lạ'])).rejects.toMatchObject({
      code: 'commander.unknownCommand',
    });
  });
});
