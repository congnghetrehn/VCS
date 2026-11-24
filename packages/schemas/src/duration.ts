// Thời lượng — chuẩn dùng chung (M0 §4.2, AMENDMENTS A13).
// Cú pháp: nối tiếp các đoạn `số + đơn vị`, đơn vị ms | s | m | h
// (không phân biệt hoa/thường), số có thể thập phân, có thể dấu `-` đầu.

import { z } from 'zod';

/** Lỗi phân tích thời lượng; `position` là vị trí (offset 0-based) đoạn lỗi. */
export class DurationError extends Error {
  readonly position: number;
  constructor(message: string, position: number) {
    super(message);
    this.name = 'DurationError';
    this.position = position;
  }
}

const UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

const SEGMENT_RE = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)/i;

function isSpace(ch: string | undefined): boolean {
  return ch !== undefined && /\s/.test(ch);
}

export function tryParseDuration(
  text: string,
): { ok: true; value: number } | { ok: false; error: DurationError } {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: new DurationError('thời lượng rỗng', 0) };
  }
  let i = 0;
  while (isSpace(text[i])) i += 1;
  let sign = 1;
  if (text[i] === '-') {
    sign = -1;
    i += 1;
  } else if (text[i] === '+') {
    i += 1;
  }
  let total = 0;
  let any = false;
  for (;;) {
    while (isSpace(text[i])) i += 1;
    if (i >= text.length) break;
    const m = SEGMENT_RE.exec(text.slice(i));
    if (m === null) {
      return {
        ok: false,
        error: new DurationError(`thời lượng '${text}' sai cú pháp tại vị trí ${String(i)}`, i),
      };
    }
    total += Number(m[1]) * (UNIT_MS[(m[2] ?? 'ms').toLowerCase()] ?? 1);
    i += m[0].length;
    any = true;
  }
  if (!any) {
    return {
      ok: false,
      error: new DurationError(`thời lượng '${text}' thiếu đoạn số + đơn vị`, i),
    };
  }
  const value = sign * total;
  if (!Number.isInteger(value)) {
    return {
      ok: false,
      error: new DurationError(`thời lượng '${text}' cho ${String(value)} ms không nguyên`, 0),
    };
  }
  return { ok: true, value };
}

/** `parseDuration(text): number` → ms nguyên; sai → ném `DurationError`. */
export function parseDuration(text: string): number {
  const r = tryParseDuration(text);
  if (!r.ok) throw r.error;
  return r.value;
}

/** Dạng ngắn gọn: 90000 → `1m30s`, 0 → `0ms`. `parse(format(x)) === x`. */
export function formatDuration(ms: number): string {
  if (!Number.isInteger(ms)) {
    throw new DurationError(`không thể định dạng ${String(ms)} ms không nguyên`, 0);
  }
  if (ms === 0) return '0ms';
  const sign = ms < 0 ? '-' : '';
  let rest = Math.abs(ms);
  const h = Math.floor(rest / 3_600_000);
  rest -= h * 3_600_000;
  const m = Math.floor(rest / 60_000);
  rest -= m * 60_000;
  const s = Math.floor(rest / 1000);
  rest -= s * 1000;
  const parts: string[] = [];
  if (h > 0) parts.push(`${String(h)}h`);
  if (m > 0) parts.push(`${String(m)}m`);
  if (s > 0) parts.push(`${String(s)}s`);
  if (rest > 0) parts.push(`${String(rest)}ms`);
  return sign + parts.join('');
}

/** Schema zod: chấp nhận chuỗi (`1m30s`) hoặc số (số = ms). */
export const durationSchema = z
  .union([z.number(), z.string()])
  .superRefine((v, ctx) => {
    if (typeof v === 'number') {
      if (!Number.isInteger(v)) {
        ctx.addIssue({ code: 'custom', message: `thời lượng ${String(v)} ms không nguyên` });
      }
      return;
    }
    const r = tryParseDuration(v);
    if (!r.ok) ctx.addIssue({ code: 'custom', message: r.error.message });
  })
  .transform((v) => (typeof v === 'number' ? v : parseDuration(v)));
