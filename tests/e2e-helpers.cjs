const { _electron: electron, expect, test } = require('@playwright/test');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function launchGitScope(userDataPathOrOptions) {
  const options =
    typeof userDataPathOrOptions === 'string'
      ? {
          args: [path.resolve(__dirname, '..')],
          env: { ...process.env, GITSCOPE_USER_DATA_DIR: userDataPathOrOptions }
        }
      : userDataPathOrOptions;
  return electron.launch(options);
}

module.exports = {
  assert,
  electron,
  execFileSync,
  expect,
  fs,
  launchGitScope,
  os,
  path,
  pathToFileURL,
  spawn,
  test
};
