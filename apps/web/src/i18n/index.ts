// Từ điển giao diện — @vcs/web (M0 §8.3, OQ-063).
// Chỉ dịch chuỗi giao diện; tên/mô tả tag là dữ liệu, không dịch.
// Khóa thiếu → t() trả chính key (không crash).

export type Lang = 'vi' | 'en';

export const I18N_KEYS = [
  'app.title',
  'header.project',
  'header.connection.connected',
  'header.connection.connecting',
  'header.connection.disconnected',
  'header.language',
  'header.theme.dark',
  'header.theme.light',
  'sim.run',
  'sim.pause',
  'sim.step',
  'sim.reset',
  'sim.timeScale',
  'sim.simTime',
  'sim.stepCount',
  'sim.state',
  'sim.lagging',
  'sim.achievedScale',
  'tags.title',
  'tags.filter.placeholder',
  'tags.filter.allControllers',
  'tags.filter.allAreas',
  'tags.col.name',
  'tags.col.type',
  'tags.col.area',
  'tags.col.address',
  'tags.col.controller',
  'tags.col.description',
  'tags.col.value',
  'tags.write.toggle',
  'tags.write.try',
  'tags.write.tryTitle',
  'tags.write.invalidNumber',
  'tags.write.send',
  'diag.title',
  'diag.empty',
  'error.title',
  'error.dismiss',
  'nav.tags',
  'nav.plc',
  'sim.plcScans',
  'sim.plcFaults',
  'plc.title',
  'plc.files',
  'plc.build',
  'plc.save',
  'plc.newFile',
  'plc.noFile',
  'plc.unsaved',
  'plc.buildOk',
  'plc.buildFail',
  'plc.watch',
  'plc.watchAdd',
  'plc.watchPlaceholder',
  'plc.col.ref',
  'plc.col.value',
  'plc.write',
  'plc.force',
  'plc.unforce',
  'plc.forced',
  'plc.remove',
  'plc.noWatch',
] as const;

export type I18nKey = (typeof I18N_KEYS)[number];

export type Dict = Record<I18nKey, string>;

import { en } from './en.js';
import { vi } from './vi.js';

const DICTS: Record<Lang, Dict> = { vi, en };

/** Dịch key theo ngôn ngữ; khóa thiếu → trả chính key (OQ-063). */
export function t(lang: Lang, key: string): string {
  const dict = DICTS[lang];
  const value = (dict as Record<string, string>)[key];
  return value ?? key;
}
