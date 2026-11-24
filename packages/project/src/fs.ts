// Hệ file trừu tượng của dự án — @vcs/project (M0 §5).
// Đường dẫn luôn tương đối, dùng '/'. `nodeFS` chặn đọc ra ngoài root.

import { access, readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

export interface ProjectFS {
  readText(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  list(dir: string, opts?: { glob?: string }): Promise<string[]>;
  root: string;
}

function normalizeKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/** Chuyển glob đơn giản (`*`, `**`, `?`) thành RegExp. */
export function globToRegExp(glob: string): RegExp {
  let out = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i] ?? '';
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // `**/` khớp 0 hoặc nhiều thư mục; `**` khớp mọi thứ.
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${out}$`);
}

export function nodeFS(rootDir: string): ProjectFS {
  const root = resolve(rootDir);
  const toAbs = (path: string): string => {
    const abs = resolve(root, ...normalizeKey(path).split('/'));
    const rel = relative(root, abs);
    if (rel.startsWith('..') || rel === '..') {
      throw new Error(`đường dẫn '${path}' nằm ngoài thư mục dự án`);
    }
    return abs;
  };
  const walk = async (dir: string, out: string[]): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) await walk(abs, out);
      else if (e.isFile()) out.push(abs);
    }
  };
  return {
    root,
    async readText(path: string): Promise<string> {
      return readFile(toAbs(path), 'utf8');
    },
    async exists(path: string): Promise<boolean> {
      try {
        await access(toAbs(path));
        return true;
      } catch {
        return false;
      }
    },
    async list(dir: string, opts?: { glob?: string }): Promise<string[]> {
      const base = dir === '' ? root : toAbs(dir);
      const found: string[] = [];
      await walk(base, found);
      let rel = found.map((abs) => relative(root, abs).split(sep).join('/'));
      if (opts?.glob !== undefined) {
        const re = globToRegExp(opts.glob);
        rel = rel.filter((p) => re.test(p));
      }
      return rel.sort();
    },
  };
}

export function memoryFS(files: Record<string, string>): ProjectFS {
  const store = new Map<string, string>();
  for (const [k, v] of Object.entries(files)) store.set(normalizeKey(k), v);
  return {
    root: '',
    readText(path: string): Promise<string> {
      const v = store.get(normalizeKey(path));
      if (v === undefined) return Promise.reject(new Error(`không tìm thấy file: ${path}`));
      return Promise.resolve(v);
    },
    exists(path: string): Promise<boolean> {
      return Promise.resolve(store.has(normalizeKey(path)));
    },
    list(dir: string, opts?: { glob?: string }): Promise<string[]> {
      const prefix = dir === '' ? '' : `${normalizeKey(dir)}/`;
      let keys = [...store.keys()].filter((k) => k.startsWith(prefix));
      if (opts?.glob !== undefined) {
        const re = globToRegExp(opts.glob);
        keys = keys.filter((k) => re.test(k));
      }
      return Promise.resolve(keys.sort());
    },
  };
}
