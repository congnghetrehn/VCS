// PRNG tất định cho plant — @vcs/plant (M2 §4.2).
// mulberry32 (seed 32-bit) + FNV-1a để suy seed theo (seed, equipmentId).
// Trạng thái là dữ liệu thuần (snapshot/restore được), không dùng Math.random.

/** Trạng thái của một PRNG mulberry32 (+ giá trị dự phòng của Box–Muller). */
export interface RngState {
  /** Trạng thái nội bộ mulberry32 (int32 có dấu). */
  a: number;
  /** Giá trị Gauss dự phòng (cặp Box–Muller thứ hai), null nếu chưa có. */
  spare: number | null;
}

export function rngState(seed: number): RngState {
  return { a: seed | 0, spare: null };
}

/** Một số trong [0, 1) — mulberry32, khớp bảng C (STATE §24). */
export function rngNext(s: RngState): number {
  s.a = (s.a + 0x6d2b79f5) | 0;
  let t = Math.imul(s.a ^ (s.a >>> 15), 1 | s.a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Một số Gauss chuẩn N(0, 1) — Box–Muller, dùng `spare` để không phí số. */
export function rngGaussian(s: RngState): number {
  if (s.spare !== null) {
    const v = s.spare;
    s.spare = null;
    return v;
  }
  let u = 0;
  do {
    u = rngNext(s);
  } while (u <= 0);
  const v = rngNext(s);
  const mag = Math.sqrt(-2 * Math.log(u));
  s.spare = mag * Math.sin(2 * Math.PI * v);
  return mag * Math.cos(2 * Math.PI * v);
}

/** FNV-1a 32-bit (chỉ dùng cho id ASCII — equipment id theo quy ước). */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seed riêng cho một thiết bị: hash32(`${seed}:${equipmentId}`). */
export function hashSeed(seed: number, equipmentId: string): number {
  return hash32(`${String(seed)}:${equipmentId}`);
}
