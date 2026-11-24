// LoopbackController — @vcs/kernel/demo (M0 §6.10).
// Controller demo `builtin:demo`: loopback (out = in, hoặc đảo) mỗi scan,
// blink (đảo mỗi periodMs theo sim time), counter (tăng mỗi scan, wrap Int).
// I/O thưa (OQ-032, quyết bởi chủ sản phẩm 2026-11-24): chỉ đọc input và ghi
// output của các tag CÓ rule, qua TagDB handle trực tiếp (factory truyền TagDB
// qua constructor) — không đọc/ghi toàn bộ ảnh I/O qua IoPort mỗi scan.
// Hệ quả: output không có rule không còn bị ghi đè về giá trị khởi tạo mỗi
// scan mà giữ nguyên giá trị hiện tại (giống PLC thật hơn). `init` vẫn dùng
// IoPort để đối chiếu tên → handle của controller này (một lần, không phải
// mỗi scan). Dùng cho ví dụ hello-tags, e2e web, test orchestrator/server —
// KHÔNG phải runtime thật (M1 thay bằng SoftPlc). Ngữ nghĩa chi tiết: OQ-026.

import type {
  ControllerAdapter,
  ControllerConfig,
  ControllerDiagnostics,
} from '../component.js';
import type { IoBus } from '../iobus.js';
import type { TagDB, TagHandle } from '../tags.js';

interface LoopbackRule {
  in: string;
  out: string;
  invert: boolean;
}

interface BlinkRule {
  out: string;
  periodMs: number;
}

interface CounterRule {
  out: string;
  step: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Wrap giá trị Int sau khi cộng step (Int: −32768..32767). */
function wrapInt(v: number): number {
  return ((((v + 32768) % 65536) + 65536) % 65536) - 32768;
}

export class LoopbackController implements ControllerAdapter {
  readonly kind = 'builtin' as const;
  readonly id: string;
  readonly #tags: TagDB;
  #inited = false;
  #scanPeriodMs = 10;
  #loopback: LoopbackRule[] = [];
  #blink: BlinkRule[] = [];
  #counter: CounterRule[] = [];
  // Handle TagDB đã tính trước ở init (không lookup tên/Map trong scan):
  // mỗi rule loopback: handle input + handle output; blink/counter: handle output.
  #loopbackInH: TagHandle[] = [];
  #loopbackOutH: TagHandle[] = [];
  #blinkOutH: TagHandle[] = [];
  #counterOutH: TagHandle[] = [];
  #scanCount = 0;
  #lastScanSimMs = 0;
  #accMs = 0;
  #blinkNext: number[] = [];
  #blinkValues: boolean[] = [];
  #counterValues: number[] = [];
  #blinkInitial: boolean[] = [];
  #counterInitial: number[] = [];

  constructor(id: string, tags: TagDB) {
    this.id = id;
    this.#tags = tags;
  }

  init(cfg: ControllerConfig, io: IoBus): Promise<void> {
    if (!Number.isInteger(cfg.scanPeriodMs) || cfg.scanPeriodMs < 1) {
      throw new Error(
        `LoopbackController.init: scanPeriodMs phải là số nguyên > 0, nhận ${String(cfg.scanPeriodMs)}`,
      );
    }
    this.#scanPeriodMs = cfg.scanPeriodMs;
    const config = cfg.def.config;
    this.#loopback = parseLoopback(config['loopback']);
    this.#blink = parseBlink(config['blink']);
    this.#counter = parseCounter(config['counter']);
    // Kiểm tra tag tham chiếu tồn tại, đúng area/kiểu (fail-fast ở init).
    const byName = new Map(cfg.tags.map((t) => [t.name, t]));
    const checkTag = (name: string, area: 'I' | 'Q', type: string, where: string): void => {
      const def = byName.get(name);
      if (def === undefined) {
        throw new Error(`LoopbackController.init: ${where}: tag '${name}' không tồn tại`);
      }
      if (def.area !== area || def.controller !== cfg.id) {
        throw new Error(
          `LoopbackController.init: ${where}: tag '${name}' phải ở area '${area}' của controller '${cfg.id}'`,
        );
      }
      if (def.type !== type) {
        throw new Error(
          `LoopbackController.init: ${where}: tag '${name}' phải kiểu '${type}', nhận '${def.type}'`,
        );
      }
    };
    for (const r of this.#loopback) {
      checkTag(r.in, 'I', 'Bool', 'loopback.in');
      checkTag(r.out, 'Q', 'Bool', 'loopback.out');
    }
    for (const r of this.#blink) checkTag(r.out, 'Q', 'Bool', 'blink.out');
    for (const r of this.#counter) checkTag(r.out, 'Q', 'Int', 'counter.out');
    // Tính trước handle TagDB của từng tag có rule (lookup tên chỉ ở init).
    // Port chỉ dùng để đối chiếu tên → handle của controller này.
    const port = io.port(cfg.id);
    const inputIndex = new Map(port.inputNames.map((n, i) => [n, i]));
    const outputIndex = new Map(port.outputNames.map((n, i) => [n, i]));
    const inHandle = (name: string): TagHandle => {
      const p = inputIndex.get(name);
      if (p === undefined) {
        throw new Error(`LoopbackController.init: input '${name}' không có trong port`);
      }
      return port.inputHandles[p] as TagHandle;
    };
    const outHandle = (name: string): TagHandle => {
      const p = outputIndex.get(name);
      if (p === undefined) {
        throw new Error(`LoopbackController.init: output '${name}' không có trong port`);
      }
      return port.outputHandles[p] as TagHandle;
    };
    this.#loopbackInH = this.#loopback.map((r) => inHandle(r.in));
    this.#loopbackOutH = this.#loopback.map((r) => outHandle(r.out));
    this.#blinkOutH = this.#blink.map((r) => outHandle(r.out));
    this.#counterOutH = this.#counter.map((r) => outHandle(r.out));
    // Giá trị khởi tạo từ TagDef.initial (mặc định false/0).
    this.#blinkNext = this.#blink.map((r) => r.periodMs);
    this.#blinkInitial = this.#blink.map((r) => {
      const v = byName.get(r.out)?.initial;
      return typeof v === 'boolean' ? v : false;
    });
    this.#blinkValues = [...this.#blinkInitial];
    this.#counterInitial = this.#counter.map((r) => {
      const v = byName.get(r.out)?.initial;
      return typeof v === 'number' ? v : 0;
    });
    this.#counterValues = [...this.#counterInitial];
    this.#scanCount = 0;
    this.#lastScanSimMs = 0;
    this.#accMs = 0;
    this.#inited = true;
    return Promise.resolve();
  }

  step(simTimeMs: number, dtMs: number): void {
    if (!this.#inited) {
      throw new Error(`LoopbackController.step: chưa init (controller '${this.id}')`);
    }
    this.#accMs += dtMs;
    while (this.#accMs >= this.#scanPeriodMs) {
      this.#accMs -= this.#scanPeriodMs;
      this.#scan(simTimeMs);
    }
  }

  reset(): void {
    this.#scanCount = 0;
    this.#lastScanSimMs = 0;
    this.#accMs = 0;
    this.#blinkNext = this.#blink.map((r) => r.periodMs);
    // Về giá trị khởi tạo của tag (TagDB.reset() cũng đưa tag về initial).
    this.#blinkValues = [...this.#blinkInitial];
    this.#counterValues = [...this.#counterInitial];
  }

  snapshot(): unknown {
    return {
      scanCount: this.#scanCount,
      lastScanSimMs: this.#lastScanSimMs,
      accMs: this.#accMs,
      blinkNext: [...this.#blinkNext],
      blinkValues: [...this.#blinkValues],
      counterValues: [...this.#counterValues],
    };
  }

  restore(s: unknown): void {
    if (
      !isRecord(s) ||
      typeof s['scanCount'] !== 'number' ||
      !Number.isInteger(s['scanCount']) ||
      typeof s['lastScanSimMs'] !== 'number' ||
      !Number.isInteger(s['lastScanSimMs']) ||
      typeof s['accMs'] !== 'number' ||
      !Array.isArray(s['blinkNext']) ||
      !Array.isArray(s['blinkValues']) ||
      !Array.isArray(s['counterValues']) ||
      s['blinkNext'].length !== this.#blink.length ||
      s['blinkValues'].length !== this.#blink.length ||
      s['counterValues'].length !== this.#counter.length
    ) {
      throw new Error(
        'SIM-E003: LoopbackController.restore: snapshot không tương thích — snapshot được tạo bởi phiên bản khác, chạy lại từ đầu.',
      );
    }
    this.#scanCount = s['scanCount'];
    this.#lastScanSimMs = s['lastScanSimMs'];
    this.#accMs = s['accMs'];
    this.#blinkNext = [...(s['blinkNext'] as number[])];
    this.#blinkValues = [...(s['blinkValues'] as boolean[])];
    this.#counterValues = [...(s['counterValues'] as number[])];
  }

  getDiagnostics(): ControllerDiagnostics {
    return {
      state: 'RUN',
      scanCount: this.#scanCount,
      lastScanSimMs: this.#lastScanSimMs,
      faults: [],
    };
  }

  #scan(T: number): void {
    this.#scanCount += 1;
    this.#lastScanSimMs = T;
    // Không có rule nào → không đọc/ghi gì (controller rỗng, chỉ đếm scan).
    if (this.#loopback.length === 0 && this.#blink.length === 0 && this.#counter.length === 0) {
      return;
    }
    const tags = this.#tags;
    for (let i = 0; i < this.#loopback.length; i++) {
      const rule = this.#loopback[i] as LoopbackRule;
      const v = tags.get(this.#loopbackInH[i] as TagHandle);
      if (typeof v !== 'boolean') {
        throw new Error(`LoopbackController: input '${rule.in}' phải là Bool, nhận ${typeof v}`);
      }
      tags.set(this.#loopbackOutH[i] as TagHandle, rule.invert ? !v : v, 'plc');
    }
    for (let i = 0; i < this.#blink.length; i++) {
      const rule = this.#blink[i] as BlinkRule;
      while (T >= (this.#blinkNext[i] as number)) {
        this.#blinkValues[i] = !(this.#blinkValues[i] as boolean);
        this.#blinkNext[i] = (this.#blinkNext[i] as number) + rule.periodMs;
      }
      tags.set(this.#blinkOutH[i] as TagHandle, this.#blinkValues[i] as boolean, 'plc');
    }
    for (let i = 0; i < this.#counter.length; i++) {
      const rule = this.#counter[i] as CounterRule;
      const next = wrapInt((this.#counterValues[i] as number) + rule.step);
      this.#counterValues[i] = next;
      tags.set(this.#counterOutH[i] as TagHandle, next, 'plc');
    }
    // I/O thưa: chỉ tag có rule được đọc/ghi. Output không có rule không bị
    // chạm tới — giữ nguyên giá trị hiện tại (OQ-032).
  }
}

function parseLoopback(v: unknown): LoopbackRule[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    throw new Error(`LoopbackController.init: config.loopback phải là mảng, nhận ${typeof v}`);
  }
  return v.map((entry, i) => {
    if (!isRecord(entry) || typeof entry['in'] !== 'string' || typeof entry['out'] !== 'string') {
      throw new Error(
        `LoopbackController.init: config.loopback[${String(i)}] phải có {in, out} là tên tag`,
      );
    }
    const invert = entry['invert'];
    if (invert !== undefined && typeof invert !== 'boolean') {
      throw new Error(
        `LoopbackController.init: config.loopback[${String(i)}].invert phải là boolean`,
      );
    }
    return { in: entry['in'], out: entry['out'], invert: invert ?? false };
  });
}

function parseBlink(v: unknown): BlinkRule[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    throw new Error(`LoopbackController.init: config.blink phải là mảng, nhận ${typeof v}`);
  }
  return v.map((entry, i) => {
    if (!isRecord(entry) || typeof entry['out'] !== 'string') {
      throw new Error(`LoopbackController.init: config.blink[${String(i)}] phải có {out} là tên tag`);
    }
    const periodMs = entry['periodMs'];
    if (typeof periodMs !== 'number' || !Number.isInteger(periodMs) || periodMs < 1) {
      throw new Error(
        `LoopbackController.init: config.blink[${String(i)}].periodMs phải là số nguyên > 0`,
      );
    }
    return { out: entry['out'], periodMs };
  });
}

function parseCounter(v: unknown): CounterRule[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    throw new Error(`LoopbackController.init: config.counter phải là mảng, nhận ${typeof v}`);
  }
  return v.map((entry, i) => {
    if (!isRecord(entry) || typeof entry['out'] !== 'string') {
      throw new Error(
        `LoopbackController.init: config.counter[${String(i)}] phải có {out} là tên tag`,
      );
    }
    const step = entry['step'];
    if (step !== undefined && (typeof step !== 'number' || !Number.isInteger(step))) {
      throw new Error(
        `LoopbackController.init: config.counter[${String(i)}].step phải là số nguyên`,
      );
    }
    return { out: entry['out'], step: step ?? 1 };
  });
}
