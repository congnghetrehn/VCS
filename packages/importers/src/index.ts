// @vcs/importers — đọc I/O list CSV/XLSX + mapping + transform (M2 §8).
// P2.5 commit 6: read-csv + sniff + read-xlsx + header-detect/mapping/
// profile + transform + CLI; docs (commit 7).
export type { CanonicalField, ImportProfile, RuleSeverity, TransformStep } from '@vcs/schemas';

export { decodeText, DELIMITER_CANDIDATES, sniffDelimiter, sniffEncoding } from './io-list/sniff.js';
export type { DelimiterSniff, EncodingSniff, SniffEncoding } from './io-list/sniff.js';
export { ImportReadError, readCsvFile, readCsvText } from './io-list/read-csv.js';
export type { CellValue, RawGrid, ReadCsvOptions, SheetInfo } from './io-list/read-csv.js';
export { applyFillDown, columnLetterToIndex, listSheets, parseMergeRange, readXlsxBuffer, readXlsxFile } from './io-list/read-xlsx.js';
export type { MergeRange, ReadXlsxOptions } from './io-list/read-xlsx.js';
export { detectHeader } from './io-list/header-detect.js';
export type { HeaderGuess } from './io-list/header-detect.js';
export {
  columnIndexToLetter,
  detectFillDownColumns,
  FIELD_SYNONYMS,
  findStationAreaColumns,
  headerRowIndex,
  normalizeColumnName,
  suggestMapping,
} from './io-list/mapping.js';
export type { MappingConfidence, MappingSuggestion } from './io-list/mapping.js';
export { buildProfile, loadProfile, matchesProfile, saveProfile } from './io-list/profile.js';
export { applyTransforms, gridToRecords } from './io-list/transform.js';
export type { IoRecord, TransformChange, TransformResult } from './io-list/transform.js';
export {
  addressBitRange,
  deriveFromModule,
  deriveKindFromAddress,
  deriveType,
  normalizeAddress,
  parseModuleStart,
  rangesOverlap,
} from './io-list/address.js';
export type { AddressArea, AddressBitRange, AddressSize, NormalizeAddressResult, ParsedAddress } from './io-list/address.js';
export {
  extractDeriveColumns,
  normalizeImport,
  normalizeTagName,
  parsePolarity,
  parseSignalType,
} from './io-list/normalize.js';
export type { DeriveColumns, NormalizeOptions, NormalizedSignal } from './io-list/normalize.js';
export { isEmptyRow, recordRowNumbers, resolveSeverity, validateImport } from './io-list/validate.js';
export type { AssignedTag, ValidateOptions, ValidateResult, ValidateStats } from './io-list/validate.js';
export { diffTags, tagFields } from './io-list/diff.js';
export type { DiffOptions, DiffResult, RenameCandidate, SkippedManual, TagChange } from './io-list/diff.js';
export { applyCommit, compareTagDefs, safetyNetCheck, serializeTags } from './io-list/commit.js';
export { buildReport, escapeHtml, reportToHtml, reportToJson } from './io-list/report.js';
export type { ImportReport, ImportReportStats } from './io-list/report.js';
