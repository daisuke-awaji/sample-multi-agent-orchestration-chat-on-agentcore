import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // Agent パッケージ専用設定: ESM モードで .js 拡張子を強制
  {
    files: ['packages/agent/**/*.ts'],
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/extensions': [
        'error',
        'ignorePackages',
        {
          ts: 'never',
          js: 'always', // ローカルインポートで .js 必須
        },
      ],
    },
  },
  // s3-workspace-sync パッケージ: ESM モードで .js 拡張子を強制
  {
    files: ['packages/libs/s3-workspace-sync/**/*.ts'],
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/extensions': [
        'error',
        'ignorePackages',
        {
          ts: 'never',
          js: 'always',
        },
      ],
    },
  },
  // Agent と Backend パッケージ: 日本語文字列を検出
  {
    files: ['packages/agent/**/*.ts', 'packages/backend/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'Literal[value=/[\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FAF]/]',
          message:
            'Japanese characters detected in string literal. Backend code should use English only.',
        },
        {
          selector:
            'TemplateLiteral[quasis] > TemplateElement[value.raw=/[\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FAF]/]',
          message:
            'Japanese characters detected in template literal. Backend code should use English only.',
        },
      ],
    },
  },
  // Frontend パッケージ専用設定: React関連のルールを適用
  {
    files: ['packages/frontend/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // テストファイル専用設定: no-explicit-any を無効化
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'cdk.out/**'],
  }
);
