import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fileHistoryModule from '../../src/file-history.js';

const { createGitRunner } = require('../../src/git-runner.js');

const { buildFileHistoryArgs, loadFileHistory, parseFileHistory } = fileHistoryModule;

describe('loading file history from a real repository', () => {
  const { runGit } = createGitRunner();
  let directory;
  const git = (...args) => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
  const commitAll = (message) => {
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD').toString().trim();
  };

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-file-history-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.invalid');
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('follows a file across a rename and across branches', async () => {
    fs.writeFileSync(path.join(directory, 'old.txt'), 'one\ntwo\nthree\n');
    const created = commitAll('create');
    git('mv', 'old.txt', 'new.txt');
    const renamed = commitAll('rename');
    git('checkout', '-q', '-b', 'feature');
    fs.appendFileSync(path.join(directory, 'new.txt'), 'four\n');
    const edited = commitAll('edit on feature');
    git('checkout', '-q', 'main');
    fs.writeFileSync(path.join(directory, 'other.txt'), 'x');
    commitAll('unrelated');

    const result = await loadFileHistory({ runGit }, 'git', directory, 'new.txt');

    expect(result.path).toBe('new.txt');
    expect(new Set(result.hashes)).toEqual(new Set([edited, renamed, created]));
    expect(result.renames).toEqual([{ hash: renamed, from: 'old.txt', to: 'new.txt' }]);
    expect(result.shallow).toBe(false);
  });

  it('reports no commits for a path that never existed', async () => {
    fs.writeFileSync(path.join(directory, 'a.txt'), 'a');
    commitAll('a');

    const result = await loadFileHistory({ runGit }, 'git', directory, 'nope.txt');

    expect(result).toEqual({ path: 'nope.txt', hashes: [], renames: [], shallow: false });
  });

  it('lists every commit that touched a directory', async () => {
    fs.mkdirSync(path.join(directory, 'lib'));
    fs.writeFileSync(path.join(directory, 'lib', 'a.txt'), 'a');
    const first = commitAll('a');
    fs.writeFileSync(path.join(directory, 'root.txt'), 'r');
    commitAll('root');
    fs.writeFileSync(path.join(directory, 'lib', 'b.txt'), 'b');
    const second = commitAll('b');

    const result = await loadFileHistory({ runGit }, 'git', directory, 'lib/');

    expect(new Set(result.hashes)).toEqual(new Set([second, first]));
  });

  it('flags a shallow clone, whose older history is not available', async () => {
    fs.writeFileSync(path.join(directory, 'a.txt'), '1');
    commitAll('one');
    fs.writeFileSync(path.join(directory, 'a.txt'), '2');
    const latest = commitAll('two');
    const clone = path.join(directory, 'shallow-clone');
    git('clone', '-q', '--depth', '1', pathToFileURL(directory).href, clone);

    const result = await loadFileHistory({ runGit }, 'git', clone, 'a.txt');

    expect(result.shallow).toBe(true);
    expect(result.hashes).toEqual([latest]);
  });

  it('includes commits reachable only from a detached HEAD', async () => {
    fs.writeFileSync(path.join(directory, 'a.txt'), '1');
    const base = commitAll('one');
    git('checkout', '-q', '--detach');
    fs.writeFileSync(path.join(directory, 'a.txt'), '2');
    const detached = commitAll('detached');

    const result = await loadFileHistory({ runGit }, 'git', directory, 'a.txt');

    expect(new Set(result.hashes)).toEqual(new Set([detached, base]));
  });

  it('explains a history that Git could not read, such as objects missing from a partial clone', async () => {
    const runGit = async (_gitPath, args) => {
      if (args.includes('log')) {
        throw new Error('fatal: unable to read 0123abc');
      }
      return { stdout: '', stderr: '' };
    };

    await expect(loadFileHistory({ runGit }, 'git', 'C:\\repo', 'a.txt')).rejects.toThrow(
      'The history for this path could not be read completely (fatal: unable to read 0123abc). ' +
        'A partial or shallow clone may be missing the commits or files needed.'
    );
  });
});

describe('file history output', () => {
  const sample =
    '\u0001ccc\n\nM\tnew.txt\n' +
    '\u0001bbb\n\nR100\told.txt\tnew.txt\n' +
    '\u0001aaa\n\nA\told.txt\n';

  it('lists the touching commits newest first and the renames Git followed', () => {
    expect(parseFileHistory(sample)).toEqual({
      hashes: ['ccc', 'bbb', 'aaa'],
      renames: [{ hash: 'bbb', from: 'old.txt', to: 'new.txt' }]
    });
  });
});

describe('file history command', () => {
  it('limits the log to the path, taken literally and after a -- separator', () => {
    const args = buildFileHistoryArgs('C:\\repo', 'src/app.js');

    expect(args.slice(0, 3)).toEqual(['-C', 'C:\\repo', '--literal-pathspecs']);
    expect(args.slice(-2)).toEqual(['--', 'src/app.js']);
    expect(args).toContain('log');
  });

  it('neutralises repository-configured programs and follows renames over every loaded ref', () => {
    const args = buildFileHistoryArgs('C:\\repo', 'a.txt');

    expect(args).toEqual(
      expect.arrayContaining([
        '--no-show-signature',
        '--no-ext-diff',
        '--no-textconv',
        '--follow',
        '--branches',
        '--remotes'
      ])
    );
  });

  it('rejects a path that Git could read as an option', () => {
    expect(() => buildFileHistoryArgs('C:\\repo', '--output=x')).toThrow(
      'Enter a path inside the repository.'
    );
  });

  it.each([
    ['an absolute Windows path', 'C:\\secrets\\key.txt'],
    ['an absolute POSIX path', '/etc/passwd'],
    ['a parent-directory escape', 'src/../../outside.txt'],
    ['a blank value', '   ']
  ])('rejects %s', (_label, value) => {
    expect(() => buildFileHistoryArgs('C:\\repo', value)).toThrow(
      'Enter a path inside the repository.'
    );
  });

  it('accepts Windows separators and surrounding spaces as a repository-relative path', () => {
    const args = buildFileHistoryArgs('C:\\repo', '  src\\lib\\a.js ');

    expect(args.slice(-2)).toEqual(['--', 'src/lib/a.js']);
  });
});
