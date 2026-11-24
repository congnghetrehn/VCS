// IoBus — @vcs/kernel (M0 §6.3).
// Cài đặt IoBus trên TagDB: input của controller = mọi tag area 'I' có
// `controller === id`, output = mọi tag area 'Q'; thứ tự = thứ tự handle.
// `writeOutputs` ghi bằng source `'plc'`; đường nhanh `IoPort` không cấp phát.

import type { TagValue } from '@vcs/schemas';
import { TagError } from './errors.js';
import type { TagDB, TagHandle } from './tags.js';

export interface IoPort {
  readonly inputNames: readonly string[];
  readonly inputHandles: readonly TagHandle[];
  readonly outputNames: readonly string[];
  readonly outputHandles: readonly TagHandle[];
  /** Đọc input vào `target` (không cấp phát); `target` ngắn hơn số input → `RangeError`. */
  readInputsInto(target: TagValue[]): void;
  /** Ghi output từ `src` bằng source `'plc'`; `src` ngắn hơn số output → `RangeError`. */
  writeOutputsFrom(src: ArrayLike<TagValue>): void;
}

export interface IoBus {
  /** Đọc input của controller thành object mới (tiện cho test); controller lạ → `{}`. */
  readInputs(controllerId: string): Readonly<Record<string, TagValue>>;
  writeOutputs(controllerId: string, out: Readonly<Record<string, TagValue>>): void;
  port(controllerId: string): IoPort;
}

interface PortDef {
  inputNames: readonly string[];
  inputHandles: readonly TagHandle[];
  outputNames: readonly string[];
  outputHandles: readonly TagHandle[];
  outputSet: ReadonlySet<TagHandle>;
}

class TagDbIoPort implements IoPort {
  readonly inputNames: readonly string[];
  readonly inputHandles: readonly TagHandle[];
  readonly outputNames: readonly string[];
  readonly outputHandles: readonly TagHandle[];
  readonly #tags: TagDB;

  constructor(tags: TagDB, def: PortDef) {
    this.#tags = tags;
    this.inputNames = def.inputNames;
    this.inputHandles = def.inputHandles;
    this.outputNames = def.outputNames;
    this.outputHandles = def.outputHandles;
  }

  readInputsInto(target: TagValue[]): void {
    if (target.length < this.inputHandles.length) {
      throw new RangeError(
        `readInputsInto: target.length ${String(target.length)} < số input ${String(this.inputHandles.length)}`,
      );
    }
    for (let i = 0; i < this.inputHandles.length; i++) {
      target[i] = this.#tags.get(this.inputHandles[i] as TagHandle);
    }
  }

  writeOutputsFrom(src: ArrayLike<TagValue>): void {
    if (src.length < this.outputHandles.length) {
      throw new RangeError(
        `writeOutputsFrom: src.length ${String(src.length)} < số output ${String(this.outputHandles.length)}`,
      );
    }
    for (let i = 0; i < this.outputHandles.length; i++) {
      this.#tags.set(this.outputHandles[i] as TagHandle, src[i] as TagValue, 'plc');
    }
  }
}

export class TagDbIoBus implements IoBus {
  readonly #tags: TagDB;
  readonly #defs = new Map<string, PortDef>();
  readonly #ports = new Map<string, IoPort>();

  constructor(tags: TagDB) {
    this.#tags = tags;
    // Nhóm tag theo controller một lần (tập tag cố định trong một phiên).
    const byController = new Map<string, { inputs: string[]; outputs: string[] }>();
    for (const name of tags.names()) {
      const h = tags.handle(name) as TagHandle;
      const meta = tags.meta(h);
      let group = byController.get(meta.controller);
      if (group === undefined) {
        group = { inputs: [], outputs: [] };
        byController.set(meta.controller, group);
      }
      if (meta.area === 'I') group.inputs.push(name);
      else group.outputs.push(name);
    }
    // Thứ tự duyệt tên đã là thứ tự handle tăng dần.
    for (const [id, group] of byController) {
      const inputHandles = group.inputs.map((n) => tags.handle(n) as TagHandle);
      const outputHandles = group.outputs.map((n) => tags.handle(n) as TagHandle);
      this.#defs.set(id, {
        inputNames: Object.freeze(group.inputs),
        inputHandles: Object.freeze(inputHandles),
        outputNames: Object.freeze(group.outputs),
        outputHandles: Object.freeze(outputHandles),
        outputSet: new Set(outputHandles),
      });
    }
  }

  readInputs(controllerId: string): Readonly<Record<string, TagValue>> {
    const def = this.#defs.get(controllerId);
    const out: Record<string, TagValue> = {};
    if (def === undefined) return out;
    for (let i = 0; i < def.inputHandles.length; i++) {
      out[def.inputNames[i] as string] = this.#tags.get(def.inputHandles[i] as TagHandle);
    }
    return out;
  }

  writeOutputs(controllerId: string, out: Readonly<Record<string, TagValue>>): void {
    const def = this.#defs.get(controllerId);
    for (const [name, value] of Object.entries(out)) {
      const h = this.#tags.handle(name);
      if (h === undefined) {
        throw new TagError(
          'TAG-E003',
          `writeOutputs('${controllerId}'): tag '${name}' không tồn tại`,
        );
      }
      if (def === undefined || !def.outputSet.has(h)) {
        throw new TagError(
          'TAG-E002',
          `writeOutputs('${controllerId}'): tag '${name}' không phải output của controller '${controllerId}'`,
        );
      }
      this.#tags.set(h, value, 'plc');
    }
  }

  port(controllerId: string): IoPort {
    let port = this.#ports.get(controllerId);
    if (port === undefined) {
      const def = this.#defs.get(controllerId) ?? {
        inputNames: Object.freeze([] as string[]),
        inputHandles: Object.freeze([] as TagHandle[]),
        outputNames: Object.freeze([] as string[]),
        outputHandles: Object.freeze([] as TagHandle[]),
        outputSet: new Set<TagHandle>(),
      };
      port = new TagDbIoPort(this.#tags, def);
      this.#ports.set(controllerId, port);
    }
    return port;
  }
}
