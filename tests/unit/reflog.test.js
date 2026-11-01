import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import gitRunnerModule from '../../src/git-runner.js';
import reflogModule from '../../src/reflog.js';

const { createGitRunner } = gitRunnerModule;
const { readReflog } = reflogModule;
const git = createGitRunner();

let repositoryPath;

function run(...args) {
  return execFileSync('git', ['-C', repositoryPath, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Ada',
      GIT_AUTHOR_EMAIL: 'ada@example.invalid',
      GIT_COMMITTER_NAME: 'Ada',
      GIT_COMMITTER_EMAIL: 'ada@example.invalid',
      GIT_COMMITTER_DATE: process.env.TEST_DATE || '2026-01-02T03:04:05Z'
    }
  }).trim();
}

function commitAt(message, date) {
  process.env.TEST_DATE = date;
  try {
    run('commit', '--allow-empty', '-m', message);
  } finally {
    delete process.env.TEST_DATE;
  }
  return run('rev-parse', 'HEAD');
}

beforeEach(() => {
  repositoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-reflog-'));
  run('init', '--initial-branch=main');
});

afterEach(() => {
  fs.rmSync(repositoryPath, { recursive: true, force: true });
});

describe('reading a reflog', () => {
  it('lists HEAD entries newest first with selector, hash, action, message and time', async () => {
    const first = commitAt('first', '2026-01-02T03:04:05Z');
    const second = commitAt('second', '2026-01-03T03:04:05Z');

    const result = await readReflog(git, 'git', repositoryPath, 'HEAD');

    expect(result.entries).toEqual([
      {
        selector: 'HEAD@{0}',
        hash: second,
        action: 'commit',
        message: 'commit: second',
        timestamp: 1767409445,
        available: true
      },
      {
        selector: 'HEAD@{1}',
        hash: first,
        action: 'commit (initial)',
        message: 'commit (initial): first',
        timestamp: 1767323045,
        available: true
      }
    ]);
    expect(result.truncated).toBe(false);
  });

  it('caps the number of entries and reports that older ones were left out', async () => {
    commitAt('one', '2026-01-02T03:04:05Z');
    commitAt('two', '2026-01-02T03:04:06Z');
    const three = commitAt('three', '2026-01-02T03:04:07Z');

    const result = await readReflog(git, 'git', repositoryPath, 'HEAD', { limit: 2 });

    expect(result.entries.map((entry) => entry.message)).toEqual(['commit: three', 'commit: two']);
    expect(result.entries[0].hash).toBe(three);
    expect(result.truncated).toBe(true);
  });

  it('marks entries whose commit object is no longer in the repository', async () => {
    const kept = commitAt('kept', '2026-01-02T03:04:05Z');
    const lost = commitAt('lost', '2026-01-02T03:04:06Z');
    run('reset', '--hard', kept);
    fs.rmSync(path.join(repositoryPath, '.git', 'objects', lost.slice(0, 2), lost.slice(2)), {
      force: true
    });

    const result = await readReflog(git, 'git', repositoryPath, 'HEAD');

    expect(result.entries.map((entry) => [entry.action, entry.hash, entry.available])).toEqual([
      ['reset', kept, true],
      ['commit', lost, false],
      ['commit (initial)', kept, true]
    ]);
  });

  it('reads the reflog of a chosen local branch', async () => {
    const base = commitAt('base', '2026-01-02T03:04:05Z');
    run('branch', 'feature');
    const next = commitAt('next', '2026-01-02T03:04:06Z');
    run('update-ref', '-m', 'moved for review', 'refs/heads/feature', next);

    const result = await readReflog(git, 'git', repositoryPath, 'feature');

    expect(result.entries.map((entry) => [entry.selector, entry.message, entry.hash])).toEqual([
      ['feature@{0}', 'moved for review', next],
      ['feature@{1}', 'branch: Created from main', base]
    ]);
  });

  it('rejects references that are neither HEAD nor a local branch', async () => {
    commitAt('base', '2026-01-02T03:04:05Z');
    run('update-ref', 'refs/tags/v1', 'HEAD');

    for (const ref of ['--output=stolen.txt', '-n', 'v1', 'refs/remotes/origin/main', 'nope', '']) {
      await expect(readReflog(git, 'git', repositoryPath, ref)).rejects.toThrow(
        'Choose HEAD or a local branch to browse its reflog.'
      );
    }
  });

  it('returns no entries when the reference has no reflog', async () => {
    commitAt('base', '2026-01-02T03:04:05Z');
    fs.rmSync(path.join(repositoryPath, '.git', 'logs'), { recursive: true, force: true });

    const result = await readReflog(git, 'git', repositoryPath, 'HEAD');

    expect(result).toEqual({ ref: 'HEAD', entries: [], truncated: false });
  });
});
