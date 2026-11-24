// ESLint flat config — VCS (M0 §3.6, AMENDMENTS B10).
// Lint tất định: cấm Date.now / performance.now / Math.random / new Date() /
// crypto.randomUUID / getRandomValues trong package lõi. Allow-list: kernel/src/pacer.ts,
// apps/*, testing/src/{runner,report}. B10: comms và apps/* được dùng thời gian thật;
// hmi và expr KHÔNG được.
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// Package lõi theo M0 §3.6 + B10 (hmi, expr không được dùng thời gian thật).
const CORE_FILES = [
  'packages/schemas/src/**/*.ts',
  'packages/kernel/src/**/*.ts',
  'packages/project/src/**/*.ts',
  'packages/runtime-iec/src/**/*.ts',
  'packages/vendor-*/src/**/*.ts',
  'packages/plant/src/**/*.ts',
  'packages/expr/src/**/*.ts',
  'packages/hmi/src/**/*.ts',
  'packages/testing/src/{dsl,expr,exec,ce}/**/*.ts',
];

const NO_TIME_RANDOM = {
  'no-restricted-properties': [
    'error',
    {
      object: 'Date',
      property: 'now',
      message: 'Package lõi phải tất định: dùng SimClock, không dùng Date.now().',
    },
    {
      object: 'performance',
      property: 'now',
      message: 'Package lõi phải tất định: dùng SimClock, không dùng performance.now().',
    },
    {
      object: 'Math',
      property: 'random',
      message: 'Package lõi phải tất định: dùng PRNG có seed, không dùng Math.random().',
    },
    {
      object: 'crypto',
      property: 'randomUUID',
      message: 'Package lõi phải tất định: không dùng crypto.randomUUID().',
    },
    {
      object: 'crypto',
      property: 'getRandomValues',
      message: 'Package lõi phải tất định: không dùng crypto.getRandomValues().',
    },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date'][arguments.length=0]",
      message: 'Package lõi phải tất định: không dùng new Date() không đối số; dùng SimClock.',
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.turbo/**',
      '**/pnpm-lock.yaml',
    ],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Quy tắc code chung (M0 §3.6).
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      eqeqeq: 'error',
      'no-param-reassign': ['error', { props: false }],
      'prefer-const': 'error',
    },
  },
  // Cấm thời gian/ngẫu nhiên thật trong package lõi (M0 §3.6 + B10).
  // pacer.ts là allow-list duy nhất trong kernel (chưa có file ở P0.1 — test ở P0.4).
  {
    files: CORE_FILES,
    ignores: ['packages/kernel/src/pacer.ts'],
    rules: NO_TIME_RANDOM,
  },
  // console: cấm ở package (dùng logger/diagnostic), cho phép ở apps/cli, scripts, tests.
  // (Khối `warn` chung phải đứng TRƯỚC các khối ghi đè — flat config: khối sau thắng.)
  { rules: { 'no-console': 'warn' } },
  { files: ['packages/*/src/**/*.ts'], rules: { 'no-console': 'error' } },
  {
    files: [
      'apps/cli/src/**/*.ts',
      'apps/cli/src/**/*.tsx',
      'scripts/**/*.mjs',
      'scripts/**/*.cjs',
      'bench/**/*.ts',
      'tests/**/*.ts',
    ],
    rules: { 'no-console': 'off' },
  },
  // Globals Node cho file JS (scripts ESM + eslint.config.js) — `no-undef` cần biết chúng.
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        fetch: 'readonly',
        queueMicrotask: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'readonly',
        require: 'readonly',
        exports: 'writable',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
  prettier,
);
