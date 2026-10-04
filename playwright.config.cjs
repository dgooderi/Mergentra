const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.spec.cjs',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  workers: 1,
  reporter: 'list'
});
