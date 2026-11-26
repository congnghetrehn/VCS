// Test `vcs suggest [dir] [--accept-confident] [--json]` (M2 §10, P2.7 commit 6, OQ-372).
// Dry-run không ghi file; --accept-confident chỉ áp dụng confident;
// lỗi validate sau áp dụng → exit 1, không ghi file.

import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { suggestCommand } from './suggest.js';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const MOTOR = join(ROOT, 'examples', 'motor-interlock');

function capture(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  return {
    lines,
    restore: () => {
      logSpy.mockRestore();
      errSpy.mockRestore();
    },
  };
}

async function runCaptured(
  dir: string | undefined,
  opts?: Parameters<typeof suggestCommand>[1],
): Promise<{ code: number; out: string }> {
  const c = capture();
  try {
    const code = await suggestCommand(dir, opts);
    return { code, out: c.lines.join('\n') };
  } finally {
    c.restore();
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Copy ví dụ motor-interlock vào thư mục tạm (để test ghi file an toàn). */
async function copyMotor(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vcs-suggest-'));
  await cp(MOTOR, dir, { recursive: true });
  return dir;
}

const M01_TAGS_YAML = `tags:
  - name: CR01_M01_RUN_CMD
    type: Bool
    area: Q
    address: "%Q0.0"
    controller: PLC1
    signal:
      kind: DO
  - name: CR01_M01_RUN_FBK
    type: Bool
    area: I
    address: "%I0.0"
    controller: PLC1
    signal:
      kind: DI
  - name: CR01_M01_READY
    type: Bool
    area: I
    address: "%I0.1"
    controller: PLC1
    signal:
      kind: DI
  - name: CR01_M01_REMOTE
    type: Bool
    area: I
    address: "%I0.2"
    controller: PLC1
    signal:
      kind: DI
  - name: CR01_M01_OVL_OK
    type: Bool
    area: I
    address: "%I0.3"
    controller: PLC1
    signal:
      kind: DI
  - name: CR01_M01_CUR
    type: Int
    area: I
    address: "%IW0"
    controller: PLC1
    signal:
      kind: AI
      scaling: { rawMin: 0, rawMax: 27648, engMin: 0, engMax: 10, unit: A }
`;

describe('vcs suggest — dry-run trên motor-interlock', () => {
  // Hành vi thật (đo 2026-11-26): 8 tag không khớp pattern → LCP fallback,
  // 7 nhóm, 0 tag gán. RUN_CMD gán được (token CMD là synonym runCmd)
  // nhưng RUN_FB không (token FB không có trong synonyms runFb — xem
  // OQ-381); START/STOP dính tiền tố 'ST' → analog_sensor (quy tắc
  // prefix dài nhất OQ-369 trên từ tự do). Tất cả đều review/unmatched,
  // không confident — đúng theo spec hiện hành, không sửa synonym ở P2.7.
  it('exit 0, 8 tags → 7 thiết bị (0 confident, 6 review, 1 unmatched), 0 tags gán', async () => {
    const { code, out } = await runCaptured(MOTOR);
    expect(code).toBe(0);
    expect(out).toContain('suggest: 8 tags → 7 thiết bị (0 confident, 6 review, 1 unmatched), 0 tags gán');
    expect(out).toContain('RUN');
    expect(out).toContain('silo_bin');
    expect(out).toContain('review');
  });

  it('dry-run không ghi file (equipment.yaml + tags.yaml byte-identical)', async () => {
    const eqBefore = await readFile(join(MOTOR, 'plant', 'equipment.yaml'), 'utf8');
    const tagsBefore = await readFile(join(MOTOR, 'tags', 'tags.yaml'), 'utf8');
    const { code } = await runCaptured(MOTOR);
    expect(code).toBe(0);
    expect(await readFile(join(MOTOR, 'plant', 'equipment.yaml'), 'utf8')).toBe(eqBefore);
    expect(await readFile(join(MOTOR, 'tags', 'tags.yaml'), 'utf8')).toBe(tagsBefore);
  });

  it('--json → JSON parse được, stats 8 tags, 7 suggestions', async () => {
    const { code, out } = await runCaptured(MOTOR, { json: true });
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as {
      stats: { totalTags: number; assignedTags: number; confident: number; review: number; unmatched: number };
      suggestions: Array<{ equipmentId: string; model: string; status: string; signals: unknown[] }>;
    };
    expect(parsed.stats.totalTags).toBe(8);
    expect(parsed.stats.confident).toBe(0);
    expect(parsed.stats.review).toBe(6);
    expect(parsed.stats.unmatched).toBe(1);
    expect(parsed.stats.assignedTags).toBe(0);
    expect(parsed.suggestions).toHaveLength(7);
    const run = parsed.suggestions.find((s) => s.equipmentId === 'RUN');
    expect(run?.model).toBe('silo_bin');
    expect(run?.status).toBe('review');
    expect(run?.signals).toHaveLength(0);
  });

  it('thư mục không tồn tại → exit 3', async () => {
    const { code } = await runCaptured(join(tmpdir(), 'vcs-khong-ton-tai-p27'));
    expect(code).toBe(3);
  });
});

describe('vcs suggest --accept-confident', () => {
  it('motor-interlock: 0 confident → exit 0, không ghi file', async () => {
    const dir = await copyMotor();
    try {
      const eqBefore = await readFile(join(dir, 'plant', 'equipment.yaml'), 'utf8');
      const tagsBefore = await readFile(join(dir, 'tags', 'tags.yaml'), 'utf8');
      const { code, out } = await runCaptured(dir, { acceptConfident: true });
      expect(code).toBe(0);
      expect(out).toContain('không có suggestion confident');
      expect(await readFile(join(dir, 'plant', 'equipment.yaml'), 'utf8')).toBe(eqBefore);
      expect(await readFile(join(dir, 'tags', 'tags.yaml'), 'utf8')).toBe(tagsBefore);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('M01 confident → ghi equipment.yaml + tags.yaml, chạy lại idempotent', async () => {
    const dir = await copyMotor();
    try {
      await rm(join(dir, 'plant', 'equipment.yaml'), { force: true });
      await writeFile(join(dir, 'tags', 'tags.yaml'), M01_TAGS_YAML, 'utf8');
      const first = await runCaptured(dir, { acceptConfident: true });
      expect(first.code).toBe(0);
      expect(first.out).toContain('apply: 1 thiết bị (CR01_M01)');
      expect(first.out).toContain('tags/tags.yaml + plant/equipment.yaml');
      const eqYaml = await readFile(join(dir, 'plant', 'equipment.yaml'), 'utf8');
      expect(eqYaml).toContain('id: CR01_M01');
      expect(eqYaml).toContain('model: motor_dol');
      expect(eqYaml).toContain('runCmd: CR01_M01_RUN_CMD');
      const tagsYaml = await readFile(join(dir, 'tags', 'tags.yaml'), 'utf8');
      expect(tagsYaml).toContain('equipment: CR01_M01');
      expect(tagsYaml).toContain('role: runCmd');
      const second = await runCaptured(dir, { acceptConfident: true });
      expect(second.code).toBe(0);
      expect(await readFile(join(dir, 'plant', 'equipment.yaml'), 'utf8')).toBe(eqYaml);
      expect(await readFile(join(dir, 'tags', 'tags.yaml'), 'utf8')).toBe(tagsYaml);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('analog_sensor mới thiếu params → exit 1, không ghi file (PL-E001)', async () => {
    const dir = await copyMotor();
    try {
      await rm(join(dir, 'plant', 'equipment.yaml'), { force: true });
      await writeFile(
        join(dir, 'tags', 'tags.yaml'),
        `tags:
  - name: CR01_LT01_RAW
    type: Int
    area: I
    address: "%IW64"
    controller: PLC1
    signal:
      kind: AI
`,
        'utf8',
      );
      const { code, out } = await runCaptured(dir, { acceptConfident: true });
      expect(code).toBe(1);
      expect(out).toContain('PL-E001');
      expect(out).toContain('apply bị từ chối');
      expect(await exists(join(dir, 'plant', 'equipment.yaml'))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('vcs suggest — lỗi đầu vào', () => {
  it('naming.yaml lỗi → exit 2', async () => {
    const dir = await copyMotor();
    try {
      await writeFile(join(dir, 'plant', 'naming.yaml'), 'tagPattern: "[a-"\n', 'utf8');
      const { code, out } = await runCaptured(dir);
      expect(code).toBe(2);
      expect(out).toContain('naming.yaml');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('project hỏng (vcs.project.yaml sai cú pháp) → exit 2', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vcs-suggest-bad-'));
    try {
      await writeFile(join(dir, 'vcs.project.yaml'), '{{{\n', 'utf8');
      const { code } = await runCaptured(dir);
      expect(code).toBe(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
