import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import commitGraph from '../../src/commit-graph.js';
import gitRunner from '../../src/git-runner.js';

const { loadCommitGraph } = commitGraph;
const { createGitRunner } = gitRunner;

describe('commit order', () => {
  let directory;
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it('places commits from interleaved branches in time order, left to right', async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-order-'));
    const git = (args, date) =>
      execFileSync('git', args, {
        cwd: directory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@example.invalid',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@example.invalid',
          ...(date && { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date })
        }
      });
    const commit = (message, day) =>
      git(['commit', '--allow-empty', '-m', message], `2025-07-${day}T12:00:00Z`);

    git(['init', '--initial-branch=main']);
    commit('base', '20');
    git(['checkout', '-b', 'feature']);
    commit('feature 1', '21');
    commit('feature 2', '23');
    commit('feature 3', '25');
    git(['checkout', 'main']);
    commit('main 1', '22');
    commit('main 2', '24');
    commit('main 3', '26');

    const graph = await loadCommitGraph(createGitRunner(), 'git', directory, 'main', directory);
    const timestamps = graph.commits.map((entry) => entry.committerTimestamp);

    expect(timestamps).toEqual([...timestamps].sort((left, right) => left - right));
  });
});
