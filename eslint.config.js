// @ts-check
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// El motor y el pipeline son TypeScript puro: corren en Node y no conocen la interfaz.
const pureEngineMessage = 'src/engine y pipeline/ son TypeScript puro (CLAUDE.md).';
const pureEngineRestrictions = {
  paths: ['react', 'react-dom', 'maplibre-gl', 'dexie', 'zustand', 'wouter'].map((name) => ({
    name,
    message: pureEngineMessage,
  })),
  patterns: [
    {
      group: ['react-dom/*', 'maplibre-gl/*', 'wouter/*', 'virtual:*'],
      message: pureEngineMessage,
    },
    {
      group: ['**/map/**', '**/features/**', '**/storage/**', '**/ui/**'],
      message: pureEngineMessage,
    },
  ],
};

export default defineConfig([
  globalIgnores([
    'dist',
    'dev-dist',
    'coverage',
    'test-results',
    'playwright-report',
    'public',
    'pipeline/raw',
  ]),
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    name: 'sin-gps/js',
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    name: 'sin-gps/ts',
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Choca con no-non-null-assertion (modo estricto): preferimos el cast explícito `as T`.
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
    },
  },
  {
    // "Sin any, salvo con un comentario que lo justifique": todo eslint-disable lleva su motivo.
    name: 'sin-gps/comentarios',
    extends: [comments.recommended],
    rules: { '@eslint-community/eslint-comments/require-description': 'error' },
  },
  {
    name: 'sin-gps/react',
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite()],
    languageOptions: { globals: globals.browser },
  },
  {
    name: 'sin-gps/motor-puro',
    files: ['src/engine/**/*.ts', 'pipeline/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', pureEngineRestrictions] },
  },
  prettier,
]);
