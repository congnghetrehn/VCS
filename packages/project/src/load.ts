// Nạp dự án — @vcs/project (M0 §5).
// `loadProject` không ném lỗi cho dữ liệu sai: trả diagnostics; có error
// thì `valid = false` và các hàm sau phải từ chối chạy (M0 §5, §6.7 mục 1).

import {
  PRJ_CATALOG,
  PROJECT_SHAPE,
  TAGS_SHAPE,
  createTagCatalog,
  diag,
  hasErrors,
  migrateProject,
  parseYamlWithSchema,
  projectSchema,
  sortDiagnostics,
  tagsFileSchema,
  type Diagnostic,
  type ProjectConfig,
  type TagCatalog,
  type TagDef,
} from '@vcs/schemas';
import type { ProjectFS } from './fs.js';
import { hashText } from './hash.js';

export interface ProjectModel {
  root: string;
  config: ProjectConfig;
  tags: TagDef[];
  catalog: TagCatalog;
  files: { path: string; sha256: string }[];
  /** sha256 của danh sách (path, sha256) đã sắp xếp. */
  hash: string;
  diagnostics: Diagnostic[];
  /** false khi có diagnostic severity error. */
  valid: boolean;
}

/** Cấu hình suy biến dùng khi thiếu `vcs.project.yaml` (model không hợp lệ). */
export const EMPTY_PROJECT_CONFIG: ProjectConfig = {
  schemaVersion: 0,
  name: '',
  language: 'vi',
  seed: 1,
  simulation: { stepMs: 10, plcScanMs: 10, timeScale: 1 },
  files: { tags: 'tags/tags.yaml', comms: 'comms/comms.yaml', hmi: 'hmi/' },
  controllers: [],
};

export async function loadProject(fs: ProjectFS): Promise<ProjectModel> {
  const diagnostics: Diagnostic[] = [];
  const files: { path: string; sha256: string }[] = [];
  let config: ProjectConfig = EMPTY_PROJECT_CONFIG;
  let tags: TagDef[] = [];

  const projectPath = 'vcs.project.yaml';
  if (!(await fs.exists(projectPath))) {
    diagnostics.push(
      diag(
        'PRJ-E001',
        'error',
        'thiếu file bắt buộc vcs.project.yaml',
        { file: projectPath, line: 1, col: 1 },
        PRJ_CATALOG.get('PRJ-E001')?.hint,
      ),
    );
  } else {
    const text = await fs.readText(projectPath);
    files.push({ path: projectPath, sha256: hashText(text) });
    const parsed = parseYamlWithSchema(projectPath, text, projectSchema, {
      shape: PROJECT_SHAPE,
    });
    diagnostics.push(...parsed.diagnostics);
    if (parsed.value !== undefined) {
      config = parsed.value;
      if (config.schemaVersion !== 1) {
        // Bảng migrations rỗng ở M0 nên không áp được gì; khi bảng có
        // migrate thật (M1+), phải migrate tài liệu thô TRƯỚC khi validate
        // schema (xem ghi chú ở migrateProject).
        migrateProject(parsed.value);
        diagnostics.push(
          diag(
            'PRJ-E006',
            'error',
            `schemaVersion ${String(config.schemaVersion)} không hỗ trợ (hỗ trợ: 1)`,
            { file: projectPath, line: 1, col: 1 },
            PRJ_CATALOG.get('PRJ-E006')?.hint,
          ),
        );
      }

      const tagsPath = config.files.tags;
      if (!(await fs.exists(tagsPath))) {
        diagnostics.push(
          diag(
            'PRJ-W002',
            'warning',
            `không có ${tagsPath} (coi như dự án không có tag)`,
            { file: tagsPath, line: 1, col: 1 },
            PRJ_CATALOG.get('PRJ-W002')?.hint,
          ),
        );
      } else {
        const tagsText = await fs.readText(tagsPath);
        files.push({ path: tagsPath, sha256: hashText(tagsText) });
        const parsedTags = parseYamlWithSchema(tagsPath, tagsText, tagsFileSchema, {
          shape: TAGS_SHAPE,
        });
        diagnostics.push(...parsedTags.diagnostics);
        if (parsedTags.value !== undefined) {
          tags = parsedTags.value.tags;
          // Kiểm tra chéo: controller của tag phải tồn tại (PRJ-E005).
          const known = new Set(config.controllers.map((c) => c.id));
          tags.forEach((tagDef, i) => {
            if (!known.has(tagDef.controller)) {
              diagnostics.push(
                diag(
                  'PRJ-E005',
                  'error',
                  `tag '${tagDef.name}': controller '${tagDef.controller}' không tồn tại`,
                  parsedTags.locate(['tags', i, 'controller']),
                  PRJ_CATALOG.get('PRJ-E005')?.hint,
                ),
              );
            }
          });
        }
      }
    }
  }

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = hashText(files.map((f) => `${f.path}:${f.sha256}`).join('\n'));
  const sorted = sortDiagnostics(diagnostics);
  return {
    root: fs.root,
    config,
    tags,
    catalog: createTagCatalog(tags),
    files,
    hash,
    diagnostics: sorted,
    valid: !hasErrors(sorted),
  };
}
