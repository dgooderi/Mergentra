import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import gitRunner from '../../src/git-runner.js';
import stashes from '../../src/stashes.js';

const { createGitRunner } = gitRunner;
const { listStashes, inspectStash } = stashes;
const { runGit } = createGitRunner();

const directories = [];

function makeRepository() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-stash-'));
  directories.push(directory);
  const git = (...args) =>
    execFileSync('git', args, { cwd: directory, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  git('-c', 'init.defaultBranch=main', 'init');
  git('config', 'user.name', 'Stash Test');
  git('config', 'user.email', 'stash-test@example.invalid');
  git('commit', '--allow-empty', '-m', 'Base commit');
  return { directory, git };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('listStashes', () => {
  it('lists stashes newest first with message, origin branch and base commit', async () => {
    const { directory, git } = makeRepository();
    const baseHash = git('rev-parse', 'HEAD');
    git('checkout', '-b', 'feature/x');
    fs.writeFileSync(path.join(directory, 'a.txt'), 'one');
    git('add', 'a.txt');
    git('stash', 'push', '-m', 'first idea');
    fs.writeFileSync(path.join(directory, 'b.txt'), 'two');
    git('add', 'b.txt');
    git('stash', 'push', '-m', 'second idea');
    const newestHash = git('rev-parse', 'stash@{0}');

    const result = await listStashes({ runGit }, 'git', directory);

    expect(
      result.map(({ ref, message, branch, baseHash: base }) => [ref, message, branch, base])
    ).toEqual([
      ['stash@{0}', 'second idea', 'feature/x', baseHash],
      ['stash@{1}', 'first idea', 'feature/x', baseHash]
    ]);
    expect(result[0].hash).toBe(newestHash);
    expect(result[0].date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns an empty list when the repository has no stashes', async () => {
    const { directory } = makeRepository();

    expect(await listStashes({ runGit }, 'git', directory)).toEqual([]);
  });

  it('reports a stash list whose commit object is missing', async () => {
    const { directory, git } = makeRepository();
    fs.writeFileSync(path.join(directory, 'a.txt'), 'one');
    git('add', 'a.txt');
    git('stash', 'push');
    const stashHash = git('rev-parse', 'stash@{0}');
    const objectFile = path.join(
      directory,
      '.git',
      'objects',
      stashHash.slice(0, 2),
      stashHash.slice(2)
    );
    fs.chmodSync(objectFile, 0o666);
    fs.rmSync(objectFile);

    await expect(listStashes({ runGit }, 'git', directory)).rejects.toThrow(
      'Stashes are unavailable: Git could not read a saved stash object (missing objects).'
    );
  });
});

describe('inspectStash', () => {
  it('lists changed tracked and untracked paths with their status', async () => {
    const { directory, git } = makeRepository();
    fs.writeFileSync(path.join(directory, 'kept.txt'), 'v1');
    fs.writeFileSync(path.join(directory, 'gone.txt'), 'v1');
    git('add', '.');
    git('commit', '-m', 'Add files');
    fs.writeFileSync(path.join(directory, 'kept.txt'), 'v2');
    fs.rmSync(path.join(directory, 'gone.txt'));
    fs.writeFileSync(path.join(directory, 'added.txt'), 'new');
    git('add', 'added.txt');
    fs.writeFileSync(path.join(directory, 'loose.txt'), 'untracked');
    git('stash', 'push', '--include-untracked', '-m', 'mixed');

    const result = await inspectStash({ runGit }, 'git', directory, 0);

    expect(result.available).toBe(true);
    expect([...result.changes].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { status: 'A', path: 'added.txt' },
      { status: 'D', path: 'gone.txt' },
      { status: 'M', path: 'kept.txt' },
      { status: 'A', path: 'loose.txt' }
    ]);
  });

  it('inspects a stash that has no untracked files', async () => {
    const { directory, git } = makeRepository();
    fs.writeFileSync(path.join(directory, 'only.txt'), 'v1');
    git('add', '.');
    git('commit', '-m', 'Add file');
    fs.writeFileSync(path.join(directory, 'only.txt'), 'v2');
    git('stash', 'push');

    expect(await inspectStash({ runGit }, 'git', directory, 0)).toEqual({
      available: true,
      changes: [{ status: 'M', path: 'only.txt' }]
    });
  });

  it('reports a stash that no longer exists as unavailable', async () => {
    const { directory, git } = makeRepository();
    fs.writeFileSync(path.join(directory, 'a.txt'), 'one');
    git('add', 'a.txt');
    git('stash', 'push');

    const result = await inspectStash({ runGit }, 'git', directory, 3);

    expect(result.available).toBe(false);
    expect(result.message).toBe('stash@{3} no longer exists. Refresh to see the current stashes.');
  });

  it.each([-1, 1.5, '0', '0}; --output=x', null, undefined, 10_000_000_000])(
    'rejects %j as a stash index without running Git',
    async (badIndex) => {
      const calls = [];
      const spyRunGit = async (...args) => {
        calls.push(args);
        return { stdout: '' };
      };

      await expect(
        inspectStash({ runGit: spyRunGit }, 'git', 'C:\\repo', badIndex)
      ).rejects.toThrow('Choose a stash from the list.');
      expect(calls).toEqual([]);
    }
  );

  it('reports a stash whose objects are missing as unreadable', async () => {
    const { directory, git } = makeRepository();
    fs.writeFileSync(path.join(directory, 'a.txt'), 'one');
    git('add', 'a.txt');
    git('stash', 'push');
    const treeHash = git('rev-parse', 'stash@{0}^{tree}');
    const objectFile = path.join(
      directory,
      '.git',
      'objects',
      treeHash.slice(0, 2),
      treeHash.slice(2)
    );
    fs.chmodSync(objectFile, 0o666);
    fs.rmSync(objectFile);

    const result = await inspectStash({ runGit }, 'git', directory, 0);

    expect(result).toEqual({
      available: false,
      message: 'stash@{0} is listed, but Git could not read its saved changes (missing objects).'
    });
  });
});
