import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import gitRunnerModule from '../../src/git-runner.js';
import blameModule from '../../src/blame.js';

const { parseBlamePorcelain, readBlame } = blameModule;
const { runGit } = gitRunnerModule.createGitRunner();

const directories = [];

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function makeRepository() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-blame-'));
  directories.push(directory);
  git(directory, '-c', 'init.defaultBranch=main', 'init');
  git(directory, 'config', 'core.autocrlf', 'false');
  git(directory, 'config', 'user.name', 'Test Author');
  git(directory, 'config', 'user.email', 'test@example.invalid');
  return directory;
}

function commitFile(directory, name, content, message) {
  fs.writeFileSync(path.join(directory, name), content);
  git(directory, 'add', name);
  git(directory, 'commit', '-m', message);
  return git(directory, 'rev-parse', 'HEAD');
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const firstCommit = '1111111111111111111111111111111111111111';
const secondCommit = '2222222222222222222222222222222222222222';

describe('Git blame porcelain parsing', () => {
  it('attributes each line to its commit, repeating commit details for later lines', () => {
    const output = [
      `${firstCommit} 1 1 2`,
      'author Ada Lovelace',
      'author-mail <ada@example.invalid>',
      'author-time 1790000000',
      'author-tz +0000',
      'committer Ada Lovelace',
      'committer-mail <ada@example.invalid>',
      'committer-time 1790000000',
      'committer-tz +0000',
      'summary First draft',
      'filename notes.txt',
      '\talpha',
      `${firstCommit} 2 2`,
      '\t\tindented\r',
      `${secondCommit} 3 3 1`,
      'author Grace Hopper',
      'author-mail <grace@example.invalid>',
      'author-time 1790086400',
      'author-tz +0000',
      'committer Grace Hopper',
      'committer-mail <grace@example.invalid>',
      'committer-time 1790086400',
      'committer-tz +0000',
      'summary Fix: tidy',
      'previous 0000000000000000000000000000000000000000 notes.txt',
      'filename notes.txt',
      '\tgamma',
      ''
    ].join('\n');

    expect(parseBlamePorcelain(output)).toEqual([
      {
        line: 1,
        commit: firstCommit,
        author: 'Ada Lovelace',
        date: '2026-09-21T14:13:20.000Z',
        summary: 'First draft',
        text: 'alpha',
        boundary: false
      },
      {
        line: 2,
        commit: firstCommit,
        author: 'Ada Lovelace',
        date: '2026-09-21T14:13:20.000Z',
        summary: 'First draft',
        text: '\tindented\r',
        boundary: false
      },
      {
        line: 3,
        commit: secondCommit,
        author: 'Grace Hopper',
        date: '2026-09-22T14:13:20.000Z',
        summary: 'Fix: tidy',
        text: 'gamma',
        boundary: false
      }
    ]);
  });
});

describe('reading blame for a revision', () => {
  it('attributes lines at the chosen revision regardless of later commits or working tree edits', async () => {
    const repository = makeRepository();
    const first = commitFile(repository, 'notes.txt', 'alpha\nbeta\n', 'Add notes');
    const second = commitFile(repository, 'notes.txt', 'alpha\nBETA\ngamma\n', 'Change beta');
    fs.writeFileSync(path.join(repository, 'notes.txt'), 'dirty\n');

    const atFirst = await readBlame({ runGit }, 'git', repository, {
      revision: first,
      path: 'notes.txt'
    });
    const atSecond = await readBlame({ runGit }, 'git', repository, {
      revision: second,
      path: 'notes.txt'
    });

    expect(atFirst.status).toBe('ok');
    expect(atFirst.lines.map((line) => [line.commit, line.text])).toEqual([
      [first, 'alpha'],
      [first, 'beta']
    ]);
    expect(
      atSecond.lines.map((line) => [line.commit, line.author, line.summary, line.text])
    ).toEqual([
      [first, 'Test Author', 'Add notes', 'alpha'],
      [second, 'Test Author', 'Change beta', 'BETA'],
      [second, 'Test Author', 'Change beta', 'gamma']
    ]);
    expect(git(repository, 'status', '--porcelain')).toBe('M notes.txt');
  });

  it.each([
    ['a branch name', 'main', 'notes.txt'],
    ['an option', '--contents', 'notes.txt'],
    ['an abbreviated hash', '1111111', 'notes.txt'],
    ['a path starting with a dash', '1111111111111111111111111111111111111111', '-notes.txt'],
    ['a parent-directory path', '1111111111111111111111111111111111111111', '../secret.txt'],
    ['a nested parent-directory path', '1111111111111111111111111111111111111111', 'a/../../x'],
    ['a rooted path', '1111111111111111111111111111111111111111', '/etc/passwd'],
    ['a drive path', '1111111111111111111111111111111111111111', 'C:\\secret.txt'],
    ['an empty path', '1111111111111111111111111111111111111111', ''],
    ['a path with a NUL byte', '1111111111111111111111111111111111111111', 'a\0b']
  ])('rejects %s without running Git', async (_name, revision, filePath) => {
    const runGitSpy = vi.fn();

    const result = await readBlame({ runGit: runGitSpy }, 'git', 'C:\\repo', {
      revision,
      path: filePath
    });

    expect(result.status).toBe('invalid-request');
    expect(result.message).toMatch(/commit hash|repository-relative/);
    expect(runGitSpy).not.toHaveBeenCalled();
  });

  it('explains when the path does not exist at the revision', async () => {
    const repository = makeRepository();
    const first = commitFile(repository, 'notes.txt', 'alpha\n', 'Add notes');

    const result = await readBlame({ runGit }, 'git', repository, {
      revision: first,
      path: 'later.txt'
    });

    expect(result).toEqual({
      status: 'missing-path',
      message: 'later.txt does not exist at this commit.'
    });
  });

  it('explains when the commit is not available in this repository', async () => {
    const repository = makeRepository();
    commitFile(repository, 'notes.txt', 'alpha\n', 'Add notes');

    const result = await readBlame({ runGit }, 'git', repository, {
      revision: '1111111111111111111111111111111111111111',
      path: 'notes.txt'
    });

    expect(result).toEqual({
      status: 'missing-object',
      message:
        'This commit is not available in the local repository. It may have been removed, or the clone may be partial.'
    });
  });

  it('explains that binary files have no line attribution', async () => {
    const repository = makeRepository();
    const first = commitFile(repository, 'logo.bin', Buffer.from([1, 0, 2, 10, 3]), 'Add logo');

    const result = await readBlame({ runGit }, 'git', repository, {
      revision: first,
      path: 'logo.bin'
    });

    expect(result).toEqual({
      status: 'binary',
      message: 'logo.bin is a binary file, so line-by-line blame is not available.'
    });
  });

  it('refuses files with more lines than the viewer limit', async () => {
    const repository = makeRepository();
    const first = commitFile(repository, 'big.txt', 'x\n'.repeat(20001), 'Add big file');

    const result = await readBlame({ runGit }, 'git', repository, {
      revision: first,
      path: 'big.txt'
    });

    expect(result).toEqual({
      status: 'too-large',
      message: 'big.txt has 20,001 lines; blame is limited to files of 20,000 lines or fewer.'
    });
  });

  it('refuses files larger than the viewer size limit without reading them', async () => {
    const repository = makeRepository();
    const first = commitFile(repository, 'huge.txt', 'a'.repeat(2 * 1024 * 1024), 'Add huge file');
    const recordingRunGit = vi.fn(runGit);

    const result = await readBlame({ runGit: recordingRunGit }, 'git', repository, {
      revision: first,
      path: 'huge.txt'
    });

    expect(result).toEqual({
      status: 'too-large',
      message: 'huge.txt is 2.0 MiB; blame is limited to files of 1 MiB or smaller.'
    });
    expect(recordingRunGit.mock.calls.some(([, args]) => args.includes('cat-file'))).toBe(false);
  });

  it('explains when the path is a directory rather than a file', async () => {
    const repository = makeRepository();
    fs.mkdirSync(path.join(repository, 'src'));
    const first = commitFile(repository, 'src/main.txt', 'one\n', 'Add source');

    const result = await readBlame({ runGit }, 'git', repository, {
      revision: first,
      path: 'src'
    });

    expect(result).toEqual({
      status: 'not-a-file',
      message: 'src is not a file at this commit, so it cannot be blamed.'
    });
  });

  it('never runs textconv programs configured by the repository', async () => {
    const repository = makeRepository();
    const marker = path.join(repository, '..', `${path.basename(repository)}-textconv-ran`);
    fs.writeFileSync(path.join(repository, '.gitattributes'), '*.txt diff=conv\n');
    git(
      repository,
      'config',
      'diff.conv.textconv',
      `node -e "require('fs').writeFileSync('${marker.replaceAll('\\', '/')}','ran')"`
    );
    git(repository, 'add', '.gitattributes');
    const first = commitFile(repository, 'notes.txt', 'alpha\n', 'Add notes');

    const result = await readBlame({ runGit }, 'git', repository, {
      revision: first,
      path: 'notes.txt'
    });

    expect(result.status).toBe('ok');
    expect(result.lines.map((line) => line.text)).toEqual(['alpha']);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('flags lines attributed to the oldest available commit of a shallow clone', async () => {
    const source = makeRepository();
    commitFile(source, 'notes.txt', 'alpha\n', 'Add notes');
    commitFile(source, 'notes.txt', 'alpha\nbeta\n', 'Add beta');
    const clone = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-blame-')), 'clone');
    directories.push(path.dirname(clone));
    git(source, 'clone', '--quiet', '--depth', '1', pathToFileURL(source).href, clone);
    const tip = git(clone, 'rev-parse', 'HEAD');

    const result = await readBlame({ runGit }, 'git', clone, {
      revision: tip,
      path: 'notes.txt'
    });

    expect(result.status).toBe('ok');
    expect(result.incompleteHistory).toBe(true);
    expect(result.lines.map((line) => line.boundary)).toEqual([true, true]);
    expect(result.message).toBe(
      'History is incomplete: 2 lines are attributed to the oldest available commit of a shallow clone, which may not be where they were introduced.'
    );
  });
});
