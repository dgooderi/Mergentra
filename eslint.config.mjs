import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'playwright-report/**', 'test-results/**', 'samples/**']
  },
  js.configs.recommended,
  {
    files: ['src/main.js', 'src/preload.js', 'tests/**/*.cjs', 'playwright.config.*'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } }
  },
  {
    files: ['src/renderer.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } }
  }
];
