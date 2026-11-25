// Handler system block — @vcs/runtime-iec (M1 §9, P1.5).
// 11 handler thuần theo `SysCallHandler` (P1.4): nhận `instance` (DbView của
// instance DB), inArgs đã tính sẵn, outArgs (Ref, có thể rỗng), `nowMs` =
// sim ms của scan hiện tại (SoftPlc đặt `interpreter.nowMs` trước mỗi scan,
// OQ-130). Đọc/ghi field qua `instance.store` + offset trong `def.layout` +
// `instance.base` (không qua `instance.fields` — field ẩn không có trong
// đó); ghi output ra DB trước rồi ghi tiếp các out-arg `Ref` nếu có (OQ-175).
// Không cấp phát trong handler (chỉ biến local): bảng field tra một lần lúc
// tạo handler trong `createStdSysCalls`; Map inArgs/outArgs do closure
// `callSys` của P1.4 cấp phát. `PT` hiệu dụng `PT' = max(PT, 0)` (OQ-172).

import type { TagValue } from '@vcs/schemas';
import type { IrField } from '../ir.js';
import {
  readMemValue,
  writeMemValue,
  type DbView,
  type Ref,
  type SysCallHandler,
} from '../interpreter.js';
import { getStdBlockDef, STD_BLOCKS, type StdBlockDef } from './defs.js';

/** Lấy field bắt buộc của def (thiếu = lỗi nội bộ lúc build def). */
function mustField(fields: ReadonlyMap<string, IrField>, name: string): IrField {
  const f = fields.get(name);
  if (f === undefined) throw new Error(`std handlers: thiếu field '${name}' trong def`);
  return f;
}

function fieldMap(def: StdBlockDef): ReadonlyMap<string, IrField> {
  return new Map(def.layout.map((f) => [f.name, f]));
}

/** Instance bắt buộc: typecheck bảo đảm mọi lời gọi std đều có instance —
 * tới đây mà thiếu là lỗi nội bộ → throw ồn ào, không chạy sai im lặng. */
function mustInstance(instance: DbView | undefined, fn: string): DbView {
  if (instance === undefined) {
    throw new Error(`std ${fn}: lời gọi system block thiếu instance (lỗi nội bộ)`);
  }
  return instance;
}

function reqBool(inArgs: ReadonlyMap<string, TagValue>, name: string, fn: string): boolean {
  const v = inArgs.get(name);
  if (typeof v !== 'boolean') {
    throw new Error(`std ${fn}: tham số '${name}' phải là Bool`);
  }
  return v;
}

function reqNum(inArgs: ReadonlyMap<string, TagValue>, name: string, fn: string): number {
  const v = inArgs.get(name);
  if (typeof v !== 'number') {
    throw new Error(`std ${fn}: tham số '${name}' phải là số`);
  }
  return v;
}

/** Tham số tùy chọn (R/LD — OQ-181): thiếu = FALSE. */
function optBool(inArgs: ReadonlyMap<string, TagValue>, name: string, fn: string): boolean {
  const v = inArgs.get(name);
  if (v === undefined) return false;
  if (typeof v !== 'boolean') {
    throw new Error(`std ${fn}: tham số '${name}' phải là Bool`);
  }
  return v;
}

function readBool(view: DbView, field: IrField): boolean {
  const v = readMemValue(view.store, view.base + field.byteOffset, field);
  if (typeof v !== 'boolean') throw new Error(`std: field '${field.name}' phải là Bool`);
  return v;
}

function readNum(view: DbView, field: IrField): number {
  const v = readMemValue(view.store, view.base + field.byteOffset, field);
  if (typeof v !== 'number') throw new Error(`std: field '${field.name}' phải là số`);
  return v;
}

/** Ghi một field (DB) — chưa chạm out-arg. */
function writeField(view: DbView, field: IrField, value: TagValue): void {
  writeMemValue(view.store, view.base + field.byteOffset, field, value);
}

/**
 * Ghi một output: DB trước, rồi Ref out-arg cùng giá trị nếu caller truyền
 * `Q => ...` (OQ-175). Out-arg tùy chọn — không có Ref thì chỉ ghi DB.
 */
function writeOut(
  view: DbView,
  field: IrField,
  value: TagValue,
  outArgs: ReadonlyMap<string, Ref>,
): void {
  writeField(view, field, value);
  const ref = outArgs.get(field.name);
  if (ref !== undefined) ref.set(value);
}

function makeRTrig(def: StdBlockDef): SysCallHandler {
  const fields = fieldMap(def);
  const fQ = mustField(fields, 'Q');
  const fM = mustField(fields, '_m');
  return (instance, inArgs, outArgs) => {
    const view = mustInstance(instance, 'R_TRIG');
    const clk = reqBool(inArgs, 'CLK', 'R_TRIG');
    const m = readBool(view, fM);
    writeOut(view, fQ, clk && !m, outArgs);
    writeField(view, fM, clk);
  };
}

function makeFTrig(def: StdBlockDef): SysCallHandler {
  const fields = fieldMap(def);
  const fQ = mustField(fields, 'Q');
  const fM = mustField(fields, '_m');
  return (instance, inArgs, outArgs) => {
    const view = mustInstance(instance, 'F_TRIG');
    const clk = reqBool(inArgs, 'CLK', 'F_TRIG');
    const m = readBool(view, fM);
    writeOut(view, fQ, !clk && m, outArgs);
    writeField(view, fM, clk);
  };
}

function makeSr(def: StdBlockDef): SysCallHandler {
  const fields = fieldMap(def);
  const fQ1 = mustField(fields, 'Q1');
  return (instance, inArgs, outArgs) => {
    const view = mustInstance(instance, 'SR');
    const s1 = reqBool(inArgs, 'S1', 'SR');
    const r = reqBool(inArgs, 'R', 'SR');
    // Q1 tự nó là trạng thái, không hidden (OQ-178); set-dominant.
    const q1 = s1 || (readBool(view, fQ1) && !r);
    writeOut(view, fQ1, q1, outArgs);
  };
}

function makeRs(def: StdBlockDef): SysCallHandler {
  const fields = fieldMap(def);
  const fQ1 = mustField(fields, 'Q1');
  return (instance, inArgs, outArgs) => {
    const view = mustInstance(instance, 'RS');
    const s = reqBool(inArgs, 'S', 'RS');
    const r1 = reqBool(inArgs, 'R1', 'RS');
    // Reset-dominant: Q1 = NOT R1 AND (S OR Q1).
    const q1 = !r1 && (s || readBool(view, fQ1));
    writeOut(view, fQ1, q1, outArgs);
  };
}

function makeTon(def: StdBlockDef): SysCallHandler {
  const fields = fieldMap(def);
  const fQ = mustField(fields, 'Q');
  const fET = mustField(fields, 'ET');
  const fStart = mustField(fields, '_start');
  const fRunning = mustField(fields, '_running');
  return (instance, inArgs, outArgs, nowMs) => {
    const view = mustInstance(instance, 'TON');
    const inVal = reqBool(inArgs, 'IN', 'TON');
    const pt = Math.max(reqNum(inArgs, 'PT', 'TON'), 0);
    if (pt <= 0) {
      // PT ≤ 0: Q = IN ngay, ET = 0 (stateless).
      writeOut(view, fQ, inVal, outArgs);
      writeOut(view, fET, 0, outArgs);
      writeField(view, fRunning, false);
      return;
    }
    if (!inVal) {
      writeOut(view, fQ, false, outArgs);
      writeOut(view, fET, 0, outArgs);
      writeField(view, fRunning, false);
      return;
    }
    if (!readBool(view, fRunning)) {
      writeField(view, fStart, nowMs);
      writeField(view, fRunning, true);
    }
    const elapsed = nowMs - readNum(view, fStart);
    writeOut(view, fET, Math.min(elapsed, pt), outArgs);
    writeOut(view, fQ, elapsed >= pt, outArgs);
  };
}

function makeTof(def: StdBlockDef): SysCallHandler {
  const fields = fieldMap(def);
  const fQ = mustField(fields, 'Q');
  const fET = mustField(fields, 'ET');
  const fStart = mustField(fields, '_start');
  const fRunning = mustField(fields, '_running');
  const fPrevIn = mustField(fields, '_prevIn');
  return (instance, inArgs, outArgs, nowMs) => {
    const view = mustInstance(instance, 'TOF');
    const inVal = reqBool(inArgs, 'IN', 'TOF');
    const pt = Math.max(reqNum(inArgs, 'PT', 'TOF'), 0);
    const prevIn = readBool(view, fPrevIn);
    if (inVal) {
      // IN lên giữa chừng → hủy đếm, ET = 0 (retrigger, bảng F).
      writeOut(view, fQ, true, outArgs);
      writeOut(view, fET, 0, outArgs);
      writeField(view, fRunning, false);
    } else {
      let running = readBool(view, fRunning);
      if (!running && prevIn) {
        // Cạnh xuống: bắt đầu đếm.
        writeField(view, fStart, nowMs);
        writeField(view, fRunning, true);
        running = true;
      }
      if (running) {
        const elapsed = nowMs - readNum(view, fStart);
        writeOut(view, fET, Math.min(elapsed, pt), outArgs);
        if (elapsed >= pt) {
          writeOut(view, fQ, false, outArgs);
          writeField(view, fRunning, false);
        } else {
          writeOut(view, fQ, true, outArgs);
        }
      }
      // Không chạy và chưa từng lên: Q/ET giữ nguyên (ban đầu false/0;
      // sau khi hết xung ET giữ = PT cho tới khi IN lên lại).
    }
    writeField(view, fPrevIn, inVal);
  };
}

function makeTp(def: StdBlockDef): SysCallHandler {
  const fields = fieldMap(def);
  const fQ = mustField(fields, 'Q');
  const fET = mustField(fields, 'ET');
  const fStart = mustField(fields, '_start');
  const fRunning = mustField(fields, '_running');
  const fPrevIn = mustField(fields, '_prevIn');
  return (instance, inArgs, outArgs, nowMs) => {
    const view = mustInstance(instance, 'TP');
    const inVal = reqBool(inArgs, 'IN', 'TP');
    const pt = Math.max(reqNum(inArgs, 'PT', 'TP'), 0);
    const prevIn = readBool(view, fPrevIn);
    let running = readBool(view, fRunning);
    if (inVal && !prevIn && !running) {
      // Cạnh lên khi không phát xung: bắt đầu xung mới.
      writeField(view, fStart, nowMs);
      writeField(view, fRunning, true);
      running = true;
    }
    if (running) {
      const elapsed = nowMs - readNum(view, fStart);
      if (elapsed >= pt) {
        // Xung kết thúc trong scan này: IN vẫn true → ET giữ = PT, không
        // kích lại (OQ-165); IN false → ET = 0 ngay trong scan này (bảng H2).
        writeOut(view, fQ, false, outArgs);
        writeOut(view, fET, inVal ? pt : 0, outArgs);
        writeField(view, fRunning, false);
      } else {
        writeOut(view, fET, elapsed, outArgs);
        writeOut(view, fQ, true, outArgs);
      }
    } else if (!inVal) {
      // Xung đã hết (hoặc chưa từng kích) và IN false → ET = 0.
      writeOut(view, fET, 0, outArgs);
    }
    // Cạnh lên trong lúc phát xung: bỏ qua, `_start` giữ nguyên (bảng H).
    writeField(view, fPrevIn, inVal);
  };
}

function makeTonr(def: StdBlockDef): SysCallHandler {
  const fields = fieldMap(def);
  const fQ = mustField(fields, 'Q');
  const fET = mustField(fields, 'ET');
  const fStart = mustField(fields, '_start');
  const fRunning = mustField(fields, '_running');
  const fAccum = mustField(fields, '_accum');
  return (instance, inArgs, outArgs, nowMs) => {
    const view = mustInstance(instance, 'TONR');
    const inVal = reqBool(inArgs, 'IN', 'TONR');
    const r = optBool(inArgs, 'R', 'TONR');
    const pt = Math.max(reqNum(inArgs, 'PT', 'TONR'), 0);
    if (r) {
      // R thắng IN cùng scan (OQ-166).
      writeOut(view, fET, 0, outArgs);
      writeOut(view, fQ, false, outArgs);
      writeField(view, fAccum, 0);
      writeField(view, fRunning, false);
      return;
    }
    if (pt <= 0) {
      // PT ≤ 0: Q = IN, ET = 0, `_accum` giữ 0, stateless (OQ-166).
      writeOut(view, fQ, inVal, outArgs);
      writeOut(view, fET, 0, outArgs);
      writeField(view, fAccum, 0);
      writeField(view, fRunning, false);
      return;
    }
    if (inVal) {
      if (!readBool(view, fRunning)) {
        writeField(view, fStart, nowMs);
        writeField(view, fRunning, true);
      }
      const et = readNum(view, fAccum) + (nowMs - readNum(view, fStart));
      writeOut(view, fET, et, outArgs);
      writeOut(view, fQ, et >= pt, outArgs);
    } else if (readBool(view, fRunning)) {
      // IN xuống: cộng dồn thời gian đã chạy rồi dừng (giữ `_accum`).
      const accum = readNum(view, fAccum) + (nowMs - readNum(view, fStart));
      writeField(view, fAccum, accum);
      writeField(view, fRunning, false);
      writeOut(view, fET, accum, outArgs);
      writeOut(view, fQ, accum >= pt, outArgs);
    }
    // IN false và không chạy: giữ nguyên ET/Q (đã đúng từ lần ghi trước).
  };
}

function makeCtu(def: StdBlockDef): SysCallHandler {
  const fields = fieldMap(def);
  const fQU = mustField(fields, 'QU');
  const fCV = mustField(fields, 'CV');
  const fPrevCU = mustField(fields, '_prevCU');
  return (instance, inArgs, outArgs) => {
    const view = mustInstance(instance, 'CTU');
    const cu = reqBool(inArgs, 'CU', 'CTU');
    const r = optBool(inArgs, 'R', 'CTU');
    const pv = reqNum(inArgs, 'PV', 'CTU');
    let cv = readNum(view, fCV);
    const prevCU = readBool(view, fPrevCU);
    if (r) {
      cv = 0; // R thắng đếm cùng scan.
    } else if (cu && !prevCU && cv < 32767) {
      cv += 1; // Kẹp ở max, không wrap, không fault (OQ-177).
    }
    writeOut(view, fCV, cv, outArgs);
    writeOut(view, fQU, cv >= pv, outArgs);
    writeField(view, fPrevCU, cu);
  };
}

function makeCtd(def: StdBlockDef): SysCallHandler {
  const fields = fieldMap(def);
  const fQD = mustField(fields, 'QD');
  const fCV = mustField(fields, 'CV');
  const fPrevCD = mustField(fields, '_prevCD');
  return (instance, inArgs, outArgs) => {
    const view = mustInstance(instance, 'CTD');
    const cd = reqBool(inArgs, 'CD', 'CTD');
    const ld = optBool(inArgs, 'LD', 'CTD');
    const pv = reqNum(inArgs, 'PV', 'CTD');
    let cv = readNum(view, fCV);
    const prevCD = readBool(view, fPrevCD);
    if (ld) {
      cv = pv; // LD thắng đếm cùng scan.
    } else if (cd && !prevCD && cv > -32768) {
      cv -= 1; // Kẹp ở min, không wrap, không fault (OQ-177).
    }
    writeOut(view, fCV, cv, outArgs);
    writeOut(view, fQD, cv <= 0, outArgs);
    writeField(view, fPrevCD, cd);
  };
}

function makeCtud(def: StdBlockDef): SysCallHandler {
  const fields = fieldMap(def);
  const fQU = mustField(fields, 'QU');
  const fQD = mustField(fields, 'QD');
  const fCV = mustField(fields, 'CV');
  const fPrevCU = mustField(fields, '_prevCU');
  const fPrevCD = mustField(fields, '_prevCD');
  return (instance, inArgs, outArgs) => {
    const view = mustInstance(instance, 'CTUD');
    const cu = reqBool(inArgs, 'CU', 'CTUD');
    const cd = reqBool(inArgs, 'CD', 'CTUD');
    const r = optBool(inArgs, 'R', 'CTUD');
    const ld = optBool(inArgs, 'LD', 'CTUD');
    const pv = reqNum(inArgs, 'PV', 'CTUD');
    let cv = readNum(view, fCV);
    const prevCU = readBool(view, fPrevCU);
    const prevCD = readBool(view, fPrevCD);
    // Thứ tự ưu tiên: R > LD > đếm (OQ-167).
    if (r) {
      cv = 0;
    } else if (ld) {
      cv = pv;
    } else {
      if (cu && !prevCU && cv < 32767) cv += 1;
      // CU và CD cùng cạnh lên → tăng rồi giảm = giữ nguyên.
      if (cd && !prevCD && cv > -32768) cv -= 1;
    }
    writeOut(view, fCV, cv, outArgs);
    writeOut(view, fQU, cv >= pv, outArgs);
    writeOut(view, fQD, cv <= 0, outArgs);
    writeField(view, fPrevCU, cu);
    writeField(view, fPrevCD, cd);
  };
}

/** Tạo registry handler cho đủ 11 system block (M1 §9). */
export function createStdSysCalls(): Map<string, SysCallHandler> {
  const makers: Record<string, (def: StdBlockDef) => SysCallHandler> = {
    R_TRIG: makeRTrig,
    F_TRIG: makeFTrig,
    SR: makeSr,
    RS: makeRs,
    TON: makeTon,
    TOF: makeTof,
    TP: makeTp,
    TONR: makeTonr,
    CTU: makeCtu,
    CTD: makeCtd,
    CTUD: makeCtud,
  };
  const out = new Map<string, SysCallHandler>();
  for (const [name, def] of STD_BLOCKS) {
    const make = makers[name];
    if (make === undefined) throw new Error(`std handlers: thiếu maker cho '${name}'`);
    out.set(name, make(def));
  }
  return out;
}

/** Tra cứu def (dùng cho test/kiểm tra): không phân biệt hoa/thường. */
export function stdDef(name: string): StdBlockDef | undefined {
  return getStdBlockDef(name);
}
