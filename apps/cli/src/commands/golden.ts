// Lệnh `vcs golden run <path>` — @vcs/cli (M1 §12.1, P1.7).
// Chạy golden YAML: file `.golden.yaml` hoặc thư mục (đệ quy, tìm
// `*.golden.yaml`). Mỗi file: parse → compileProject → runGolden.
// Exit: 0 mọi golden pass, 1 có golden fail (kỳ vọng sai / parse / biên
// dịch), 2 không chạy được (thiếu path, không tìm thấy file) — OQ-201/205.

import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { GoldenError, parseGoldenYaml, runGolden } from '@vcs/runtime-iec';
import { hasErrors } from '@vcs/schemas';
import { compileProject } from '@vcs/vendor-siemens';

export async function goldenRunCommand(path: string | undefined): Promise<number> {
  if (path === undefined || path === '') {
    console.error('vcs golden run: thiếu <path> — dùng: vcs golden run <file.golden.yaml|dir>');
    return 2;
  }
  let files: string[];
  try {
    files = await collectGoldenFiles(path);
  } catch {
    console.error(`vcs golden run: không tìm thấy '${path}'`);
    return 2;
  }
  if (files.length === 0) {
    console.error(`vcs golden run: không có file *.golden.yaml trong '${path}'`);
    return 2;
  }
  let passed = 0;
  let failed = 0;
  for (const file of files) {
    const name = basename(file);
    try {
      const text = await readFile(file, 'utf8');
      const golden = parseGoldenYaml(text, name);
      const { program, diagnostics } = compileProject(
        golden.sources.map((s) => ({ path: s.file, text: s.text })),
        { tags: golden.tags ?? [] },
      );
      if (hasErrors(diagnostics)) {
        failed++;
        console.log(`FAIL ${golden.id}: biên dịch lỗi:`);
        for (const d of diagnostics) {
          if (d.severity === 'error') console.log(`  ${d.code} ${d.file ?? ''}:${String(d.line ?? '?')}: ${d.message}`);
        }
        continue;
      }
      const result = runGolden(golden, program);
      passed++;
      console.log(`PASS ${golden.id} (${String(result.steps)} steps, ${String(result.scans)} scans)`);
    } catch (err) {
      failed++;
      const reason = err instanceof GoldenError ? err.message : err instanceof Error ? err.message : String(err);
      console.log(`FAIL ${name}: ${reason}`);
    }
  }
  console.log(`golden: ${String(passed)} passed, ${String(failed)} failed, ${String(files.length)} files`);
  return failed > 0 ? 1 : 0;
}

async function collectGoldenFiles(path: string): Promise<string[]> {
  const st = await stat(path);
  if (st.isFile()) {
    return extname(path) === '.yaml' && basename(path).endsWith('.golden.yaml') ? [path] : [];
  }
  if (!st.isDirectory()) return [];
  const out: string[] = [];
  const entries = await readdir(path, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const full = join(path, e.name);
    if (e.isDirectory()) {
      out.push(...(await collectGoldenFiles(full)));
    } else if (e.isFile() && e.name.endsWith('.golden.yaml')) {
      out.push(full);
    }
  }
  return out;
}
