const { _electron: electron, expect, test } = require('@playwright/test');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function launchMergentra(userDataPathOrOptions) {
  const options =
    typeof userDataPathOrOptions === 'string'
      ? {
          args: [path.resolve(__dirname, '..')],
          env: { ...process.env, MERGENTRA_USER_DATA_DIR: userDataPathOrOptions }
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
  launchMergentra,
  os,
  path,
  pathToFileURL,
  spawn,
  test
};
