const { defineConfig } = require('@playwright/test');

// A developer's global git config may sign tags and commits, which opens editors or prompts during test setup.
Object.assign(process.env, {
  GIT_CONFIG_COUNT: '2',
  GIT_CONFIG_KEY_0: 'tag.gpgsign',
  GIT_CONFIG_VALUE_0: 'false',
  GIT_CONFIG_KEY_1: 'commit.gpgsign',
  GIT_CONFIG_VALUE_1: 'false',
  // The licence agreement has its own tests; every other test starts past it.
  MERGENTRA_SKIP_LICENSE: '1'
});

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
