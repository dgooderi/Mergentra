import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import historyBoundariesModule from '../../src/history-boundaries.js';
import gitRunnerModule from '../../src/git-runner.js';

const { inspectHistoryBoundaryFacts } = historyBoundariesModule;
const { createGitRunner } = gitRunnerModule;
const temporaryDirectories = [];

function makeRepository() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-boundary-'));
  temporaryDirectories.push(directory);
  return directory;
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('history boundary facts', () => {
  it('recognizes a real shallow clone without classifying it as a partial clone', async () => {
    const parent = makeRepository();
    const source = path.join(parent, 'source');
    const shallow = path.join(parent, 'shallow');
    fs.mkdirSync(source);
    git(source, ['init', '--initial-branch=main']);
    git(source, ['config', 'user.name', 'Mergentra Test']);
    git(source, ['config', 'user.email', 'test@example.invalid']);
    fs.writeFileSync(path.join(source, 'history.txt'), 'first');
    git(source, ['add', 'history.txt']);
    git(source, ['commit', '-m', 'First commit']);
    fs.writeFileSync(path.join(source, 'history.txt'), 'second');
    git(source, ['commit', '-am', 'Second commit']);
    git(parent, ['clone', '--depth=1', pathToFileURL(source).href, shallow]);

    const facts = await inspectHistoryBoundaryFacts(createGitRunner(), 'git', shallow);

    expect(facts).toEqual({ shallow: true, partialClone: false });
  });
});

describe('partial-clone history facts', () => {
  it('recognizes a real filtered clone from its local promisor configuration', async () => {
    const parent = makeRepository();
    const source = path.join(parent, 'source');
    const remote = path.join(parent, 'remote.git');
    const partial = path.join(parent, 'partial');
    fs.mkdirSync(source);
    git(source, ['init', '--initial-branch=main']);
    git(source, ['config', 'user.name', 'Mergentra Test']);
    git(source, ['config', 'user.email', 'test@example.invalid']);
    fs.writeFileSync(path.join(source, 'content.txt'), 'partial clone content');
    git(source, ['add', 'content.txt']);
    git(source, ['commit', '-m', 'Partial clone fixture']);
    git(parent, ['clone', '--bare', source, remote]);
    git(parent, [
      'config',
      '--file',
      path.join(remote, 'config'),
      'uploadpack.allowFilter',
      'true'
    ]);
    git(parent, ['clone', '--filter=tree:0', '--no-checkout', pathToFileURL(remote).href, partial]);

    const facts = await inspectHistoryBoundaryFacts(createGitRunner(), 'git', partial);

    expect(facts).toEqual({ shallow: false, partialClone: true });
  });
});
