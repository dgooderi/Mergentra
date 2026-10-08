import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'playwright-report/**', 'test-results/**', 'samples/**']
  },
  js.configs.recommended,
  {
    files: [
      'src/main.js',
      'src/commit-graph.js',
      'src/preload.js',
      'src/git-runner.js',
      'src/git-config-safety.js',
      'src/reference-order.js',
      'src/divergence-markers.js',
      'src/ipc-handlers.js',
      'src/main-window.js',
      'src/repository-output.js',
      'src/settings-store.js',
      'src/recent-repositories.js',
      'src/main-line.js',
      'tests/**/*.cjs',
      'playwright.config.*'
    ],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } }
  },
  {
    files: ['tests/unit/**/*.test.js'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    files: ['tests/**/*.cjs'],
    languageOptions: { globals: { ...globals.browser } }
  },
  {
    files: ['src/renderer.js', 'src/renderer/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser } }
  }
];
