import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import commitDiff from '../../src/commit-diff.js';
import gitRunner from '../../src/git-runner.js';

const { loadChangedFiles, loadFilePatch } = commitDiff;
const { runGit } = gitRunner.createGitRunner();

const directories = [];

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function makeRepository() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-diff-'));
  directories.push(directory);
  git(directory, '-c', 'init.defaultBranch=main', 'init');
  git(directory, 'config', 'core.autocrlf', 'false');
  git(directory, 'config', 'user.name', 'Diff Test');
  git(directory, 'config', 'user.email', 'diff@example.invalid');
  return directory;
}

function commitFile(repository, name, content, message = `Change ${name}`) {
  fs.writeFileSync(path.join(repository, name), content);
  git(repository, 'add', name);
  git(repository, 'commit', '-m', message);
  return git(repository, 'rev-parse', 'HEAD');
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('commit diff file list', () => {
  it('lists the paths a commit changed against its parent with line counts', async () => {
    const repository = makeRepository();
    commitFile(repository, 'keep.txt', 'one\ntwo\n');
    commitFile(repository, 'gone.txt', 'bye\n');
    fs.writeFileSync(path.join(repository, 'keep.txt'), 'one\nTWO\nthree\n');
    fs.rmSync(path.join(repository, 'gone.txt'));
    fs.writeFileSync(path.join(repository, 'new.txt'), 'fresh\n');
    git(repository, 'add', '-A');
    git(repository, 'commit', '-m', 'Mixed changes');
    const commit = git(repository, 'rev-parse', 'HEAD');
    const parent = git(repository, 'rev-parse', 'HEAD~1');

    const diff = await loadChangedFiles(runGit, 'git', repository, { commit });

    expect(diff.from).toBe(parent);
    expect(diff.to).toBe(commit);
    expect(diff.files).toEqual([
      {
        path: 'gone.txt',
        status: 'deleted',
        additions: 0,
        deletions: 1,
        binary: false,
        submodule: false
      },
      {
        path: 'keep.txt',
        status: 'modified',
        additions: 2,
        deletions: 1,
        binary: false,
        submodule: false
      },
      {
        path: 'new.txt',
        status: 'added',
        additions: 1,
        deletions: 0,
        binary: false,
        submodule: false
      }
    ]);
  });

  it('compares the trees of two chosen commits regardless of how many commits lie between them', async () => {
    const repository = makeRepository();
    const first = commitFile(repository, 'a.txt', 'a\n');
    commitFile(repository, 'b.txt', 'b\n');
    const third = commitFile(repository, 'a.txt', 'a\nmore\n');

    const diff = await loadChangedFiles(runGit, 'git', repository, {
      commit: third,
      compareWith: first.slice(0, 10)
    });

    expect(diff.from).toBe(first);
    expect(diff.to).toBe(third);
    expect(diff.files.map(({ path: file, status }) => [file, status])).toEqual([
      ['a.txt', 'modified'],
      ['b.txt', 'added']
    ]);
  });

  it('shows every file of a root commit as added', async () => {
    const repository = makeRepository();
    const root = commitFile(repository, 'first.txt', 'hello\n');

    const diff = await loadChangedFiles(runGit, 'git', repository, { commit: root });

    expect(diff.from).toBeNull();
    expect(diff.files).toEqual([
      {
        path: 'first.txt',
        status: 'added',
        additions: 1,
        deletions: 0,
        binary: false,
        submodule: false
      }
    ]);
  });
});

describe('commit diff file patch', () => {
  it('returns the text diff of one path between the compared commits', async () => {
    const repository = makeRepository();
    commitFile(repository, 'doc.txt', 'alpha\nbeta\n');
    commitFile(repository, 'other.txt', 'untouched\n');
    const commit = commitFile(repository, 'doc.txt', 'alpha\ngamma\n');

    const result = await loadFilePatch(runGit, 'git', repository, { commit, path: 'doc.txt' });

    expect(result.binary).toBe(false);
    expect(result.truncated).toBe(false);
    expect(result.patch).toContain('@@ -1,2 +1,2 @@\n alpha\n-beta\n+gamma\n');
    expect(result.patch).not.toContain('other.txt');
  });

  it('identifies binary content instead of returning it as text', async () => {
    const repository = makeRepository();
    commitFile(repository, 'text.txt', 'base\n');
    fs.writeFileSync(path.join(repository, 'image.bin'), Buffer.from([0, 1, 2, 255, 0, 7]));
    git(repository, 'add', 'image.bin');
    git(repository, 'commit', '-m', 'Add binary');
    const commit = git(repository, 'rev-parse', 'HEAD');

    const files = await loadChangedFiles(runGit, 'git', repository, { commit });
    const result = await loadFilePatch(runGit, 'git', repository, { commit, path: 'image.bin' });

    expect(files.files).toEqual([
      {
        path: 'image.bin',
        status: 'added',
        additions: 0,
        deletions: 0,
        binary: true,
        submodule: false
      }
    ]);
    expect(result).toEqual({ binary: true, truncated: false, patch: '' });
  });

  it('never runs external diff or text conversion programs named by repository configuration', async () => {
    const repository = makeRepository();
    commitFile(repository, 'data.txt', 'one\n');
    const marker = path.join(repository, 'ran.marker');
    const program = `node -e "require('fs').writeFileSync('${marker.replaceAll('\\', '/')}','x')"`;
    git(repository, 'config', 'diff.external', program);
    git(repository, 'config', 'diff.spy.textconv', program);
    fs.writeFileSync(path.join(repository, '.gitattributes'), '*.txt diff=spy\n');
    git(repository, 'add', '.gitattributes');
    git(repository, 'commit', '-m', 'Attributes');
    const commit = commitFile(repository, 'data.txt', 'two\n');

    const result = await loadFilePatch(runGit, 'git', repository, { commit, path: 'data.txt' });

    expect(result.patch).toContain('-one\n+two\n');
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('rejects revisions and paths that are not a hash from the graph or a plain path', async () => {
    const repository = makeRepository();
    const commit = commitFile(repository, 'a.txt', 'a\n');

    await expect(
      loadChangedFiles(runGit, 'git', repository, { commit: '--output=pwned.txt' })
    ).rejects.toThrow('Choose a commit from the graph.');
    await expect(
      loadChangedFiles(runGit, 'git', repository, { commit, compareWith: 'HEAD' })
    ).rejects.toThrow('Choose a commit from the graph.');
    await expect(
      loadFilePatch(runGit, 'git', repository, { commit, path: 'a\0b' })
    ).rejects.toThrow('Choose a changed file to view.');
    expect(fs.existsSync(path.join(repository, 'pwned.txt'))).toBe(false);
  });

  it('explains that a shallow clone boundary commit has no available parent history', async () => {
    const origin = makeRepository();
    commitFile(origin, 'a.txt', 'a\n');
    const tip = commitFile(origin, 'a.txt', 'b\n');
    const clone = path.join(path.dirname(origin), `${path.basename(origin)}-shallow`);
    directories.push(clone);
    git(origin, 'clone', '--quiet', '--depth', '1', pathToFileURL(origin).href, clone);

    await expect(loadChangedFiles(runGit, 'git', clone, { commit: tip })).rejects.toThrow(
      'The history before this commit is not available because this is a shallow clone.'
    );
  });

  it('explains when a commit is not present in the repository', async () => {
    const repository = makeRepository();
    commitFile(repository, 'a.txt', 'a\n');

    await expect(
      loadChangedFiles(runGit, 'git', repository, { commit: 'abcdef1234567890' })
    ).rejects.toThrow('That commit is not available in this repository.');
  });
});
