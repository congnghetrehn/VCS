// Bundle ESM cho @vcs/cli (M0 §3.2, `pnpm build`).
// Bundle cả package workspace @vcs/* (noExternal) để dist chạy độc lập;
// node_modules ngoài (commander) giữ external.
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  // yaml (dep của @vcs/schemas) dùng require('process') động — esbuild
  // __require trong bundle ESM ném lỗi, shims không sửa được; để yaml
  // external, runtime resolve từ node_modules của app (khai báo dep trực
  // tiếp ở package.json). fastify/@fastify/*/pino cũng external: chúng là
  // dep của @vcs/server (được bundle qua noExternal), không phải dep trực
  // tiếp của CLI nên tsup sẽ bundle cả cây fastify (avvio require động).
  external: ['yaml', 'fastify', '@fastify/websocket', '@fastify/static', 'pino'],
  noExternal: [/^@vcs\//],
});
