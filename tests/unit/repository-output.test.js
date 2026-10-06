import path from 'node:path';
import { describe, expect, it } from 'vitest';
import repositoryOutput from '../../src/repository-output.js';

const { parseCommitLog, parseWorktrees, parseReferences, parseTags, parseMissingObjectHashes } =
  repositoryOutput;

const commitHash = '1111111111111111111111111111111111111111';
const parentHash = '2222222222222222222222222222222222222222';
const treeHash = '3333333333333333333333333333333333333333';

describe('Git command output parsing', () => {
  it('parses the NUL-delimited commit log format', () => {
    const output = [
      [
        commitHash,
        treeHash,
        parentHash,
        'A commit subject',
        'Ada Lovelace',
        'ada@example.invalid',
        '2026-10-01T11:12:13+00:00',
        '1791234567'
      ].join('\0'),
      [
        parentHash,
        treeHash,
        '',
        'Initial commit',
        'Grace Hopper',
        'grace@example.invalid',
        '2026-09-30T08:00:00+00:00',
        '1790345678'
      ].join('\0')
    ].join('\n');

    expect(parseCommitLog(output)).toEqual([
      {
        hash: commitHash,
        treeHash,
        parents: [parentHash],
        subject: 'A commit subject',
        author: 'Ada Lovelace <ada@example.invalid>',
        authorDate: '2026-10-01T11:12:13+00:00',
        committerTimestamp: 1791234567,
        lane: null
      },
      {
        hash: parentHash,
        treeHash,
        parents: [],
        subject: 'Initial commit',
        author: 'Grace Hopper <grace@example.invalid>',
        authorDate: '2026-09-30T08:00:00+00:00',
        committerTimestamp: 1790345678,
        lane: null
      }
    ]);
  });

  it('parses linked and detached worktrees and marks the current path', () => {
    const currentPath = path.resolve('primary');
    const linkedPath = path.resolve('linked');
    const output = [
      `worktree ${currentPath}`,
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/main',
      '',
      `worktree ${linkedPath}`,
      'HEAD 2222222222222222222222222222222222222222',
      'branch refs/heads/feature',
      '',
      `worktree ${path.resolve('detached')}`,
      'HEAD 3333333333333333333333333333333333333333',
      'detached',
      ''
    ].join('\n');

    expect(parseWorktrees(output, currentPath, process.platform)).toEqual([
      { path: currentPath, branch: 'main', detached: false, current: true },
      { path: linkedPath, branch: 'feature', detached: false, current: false },
      { path: path.resolve('detached'), branch: null, detached: true, current: false }
    ]);
  });

  it('parses references, excludes symbolic references, and associates worktree paths', () => {
    const worktrees = [{ branch: 'feature', path: path.resolve('linked') }];
    const output = [
      `main\0${commitHash}\0\0refs/heads/main`,
      `feature\0${parentHash}\0\0refs/heads/feature`,
      `origin/main\0${commitHash}\0\0refs/remotes/origin/main`,
      `origin/HEAD\0${commitHash}\0refs/remotes/origin/main\0refs/remotes/origin/HEAD`
    ].join('\n');

    expect(parseReferences(output, 'main', worktrees)).toEqual([
      {
        name: 'main',
        hash: commitHash,
        remote: false,
        symbolic: false,
        checkedOut: true,
        worktreePath: null
      },
      {
        name: 'feature',
        hash: parentHash,
        remote: false,
        symbolic: false,
        checkedOut: false,
        worktreePath: path.resolve('linked')
      },
      {
        name: 'origin/main',
        hash: commitHash,
        remote: true,
        symbolic: false,
        checkedOut: false,
        worktreePath: null
      }
    ]);
  });

  it('groups lightweight and annotated tags by their target commit', () => {
    const commitsByHash = new Map([
      [commitHash, { hash: commitHash }],
      [parentHash, { hash: parentHash }]
    ]);
    const output = [
      `v1.0.0\0${commitHash}\0`,
      `v2.0.0\0tag-object-hash\0${parentHash}`,
      'orphan-tag\0unknown-object-hash\0'
    ].join('\n');

    expect(parseTags(output, commitsByHash)).toEqual(
      new Map([
        [commitHash, ['v1.0.0']],
        [parentHash, ['v2.0.0']]
      ])
    );
  });

  it('collects only missing object entries from batch-check output', () => {
    const output = [
      `${treeHash} tree 42`,
      `${commitHash} missing`,
      `${parentHash} commit 120`,
      'malformed missing object entry'
    ].join('\n');

    expect(parseMissingObjectHashes(output)).toEqual(new Set([commitHash]));
  });
});
