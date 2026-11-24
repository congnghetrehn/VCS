// Store Zustand — @vcs/web (M0 §8.3).
// Store thuần (không logic mô phỏng): defs + values theo chỉ số def,
// sim state, diagnostics, lỗi cuối, trạng thái kết nối, bộ lọc, i18n/theme.
// Cập nhật store NGAY khi message tới (OQ-060); React chỉ render lại tối
// đa 1 lần/frame qua rAF (cờ renderTick — component subscribe tick rồi đọc
// getState() lúc render). Ô vừa đổi nằm trong `changed` (nháy 800 ms).

import { create } from 'zustand';
import type { ServerMessage, SimState, TagValue } from '@vcs/schemas';
import type { Lang } from './i18n/index.js';
import type { ConnectionStatus } from './ws-client.js';

export type SnapshotDef = Extract<
  ServerMessage,
  { type: 'tags.snapshot' }
>['defs'][number];

/**
 * Diagnostic nhận qua WS — kiểu suy ra từ schema zod. Không dùng
 * `Diagnostic` của schemas ở đây: zod suy ra `file?: string | undefined`
 * còn interface `Diagnostic` khai `file?: string`; với
 * `exactOptionalPropertyTypes` hai kiểu không gán được cho nhau.
 */
export type WsDiagnostic = Extract<
  ServerMessage,
  { type: 'diagnostics' }
>['items'][number];

export type SnapshotMessage = Extract<ServerMessage, { type: 'tags.snapshot' }>;
export type DeltaMessage = Extract<ServerMessage, { type: 'tags.delta' }>;
export type DiagnosticsMessage = Extract<ServerMessage, { type: 'diagnostics' }>;

export type Theme = 'light' | 'dark';

/** Thời gian ô đổi giữ class flash (ms). */
export const FLASH_MS = 800;

export interface SimStoreState {
  defs: SnapshotDef[];
  values: Map<number, TagValue>;
  sim: SimState | null;
  projectName: string;
  projectLanguage: Lang;
  connection: ConnectionStatus;
  diagnostics: WsDiagnostic[];
  lastError: string | null;
  /** Chỉ số def đổi ở delta gần nhất (để nháy ô). */
  changed: Set<number>;
  /** null = chưa chọn: dùng projectLanguage (OQ-063). */
  lang: Lang | null;
  theme: Theme;
  filterQuery: string;
  filterController: string;
  filterArea: string;
  /** Tăng tối đa 1 lần/frame; component subscribe tick để render lại. */
  renderTick: number;

  applySnapshot(msg: SnapshotMessage): void;
  applyDelta(msg: DeltaMessage): void;
  applyState(sim: SimState): void;
  applyDiagnostics(msg: DiagnosticsMessage): void;
  setConnection(status: ConnectionStatus): void;
  setProject(name: string, language: Lang): void;
  setLastError(message: string | null): void;
  setLang(lang: Lang): void;
  setTheme(theme: Theme): void;
  setFilter(partial: {
    query?: string;
    controller?: string;
    area?: string;
  }): void;
  clearChanged(): void;
}

let rafId: number | null = null;
let flashTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRender(): void {
  if (typeof requestAnimationFrame === 'function') {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      useSimStore.setState((s) => ({ renderTick: s.renderTick + 1 }));
    });
    return;
  }
  // Môi trường không có rAF (test node): tăng tick đồng bộ.
  useSimStore.setState((s) => ({ renderTick: s.renderTick + 1 }));
}

function scheduleClearChanged(): void {
  if (flashTimer !== null) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flashTimer = null;
    useSimStore.getState().clearChanged();
  }, FLASH_MS);
}

export const useSimStore = create<SimStoreState>()((set) => ({
  defs: [],
  values: new Map(),
  sim: null,
  projectName: '',
  projectLanguage: 'vi',
  connection: 'disconnected',
  diagnostics: [],
  lastError: null,
  changed: new Set(),
  lang: null,
  theme: 'light',
  filterQuery: '',
  filterController: 'all',
  filterArea: 'all',
  renderTick: 0,

  applySnapshot(msg) {
    const values = new Map<number, TagValue>();
    msg.values.forEach((v, i) => {
      values.set(i, v);
    });
    set({ defs: msg.defs, values, changed: new Set() });
    scheduleRender();
  },

  applyDelta(msg) {
    const state = useSimStore.getState();
    const changed = new Set<number>();
    for (const [index, value] of msg.changes) {
      if (state.values.get(index) !== value) {
        state.values.set(index, value);
        changed.add(index);
      }
    }
    if (changed.size === 0) return;
    set({ changed });
    scheduleClearChanged();
    scheduleRender();
  },

  applyState(sim) {
    set({ sim });
    scheduleRender();
  },

  applyDiagnostics(msg) {
    const state = useSimStore.getState();
    const known = new Set(state.diagnostics.map((d) => `${d.code}\n${d.message}`));
    const fresh = msg.items.filter((d) => !known.has(`${d.code}\n${d.message}`));
    if (fresh.length === 0) return;
    set({ diagnostics: [...state.diagnostics, ...fresh] });
    scheduleRender();
  },

  setConnection(status) {
    set({ connection: status });
    scheduleRender();
  },

  setProject(name, language) {
    set({ projectName: name, projectLanguage: language });
    scheduleRender();
  },

  setLastError(message) {
    set({ lastError: message });
    scheduleRender();
  },

  setLang(lang) {
    set({ lang });
    scheduleRender();
  },

  setTheme(theme) {
    set({ theme });
    scheduleRender();
  },

  setFilter(partial) {
    set((s) => ({
      filterQuery: partial.query ?? s.filterQuery,
      filterController: partial.controller ?? s.filterController,
      filterArea: partial.area ?? s.filterArea,
    }));
    scheduleRender();
  },

  clearChanged() {
    set({ changed: new Set() });
    scheduleRender();
  },
}));

/** Ngôn ngữ hiệu dụng: lựa chọn đã lưu thắng project.language (OQ-063). */
export function effectiveLang(state: SimStoreState): Lang {
  return state.lang ?? state.projectLanguage;
}

/**
 * Đăng ký render lại tối đa 1 lần/frame (renderTick); đọc state qua
 * getState() lúc render (OQ-060).
 */
export function useSimSnapshot(): SimStoreState {
  useSimStore((s) => s.renderTick);
  return useSimStore.getState();
}

/**
 * Chỉ số def sau lọc (OQ-070): chuỗi lọc khớp tên hoặc mô tả, substring
 * không phân biệt hoa/thường; controller/vùng đơn chọn; kết hợp AND.
 */
export function selectFilteredIndices(state: SimStoreState): number[] {
  const q = state.filterQuery.trim().toLowerCase();
  const out: number[] = [];
  state.defs.forEach((def, i) => {
    if (state.filterController !== 'all' && def.controller !== state.filterController) return;
    if (state.filterArea !== 'all' && def.area !== state.filterArea) return;
    if (q !== '') {
      const hay = `${def.name} ${def.description ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return;
    }
    out.push(i);
  });
  return out;
}
