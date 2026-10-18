import { describe, expect, it } from 'vitest';
import { branchPathToMain, parentReferenceName } from '../../src/renderer/branch-path.js';

const commit = (hash, ...parents) => ({ hash, parents });
const timedCommit = (hash, committerTimestamp, ...parents) => ({
  hash,
  committerTimestamp,
  parents
});
const reference = (name, hash) => ({ name, hash, remote: false });

// m1 <- m2 <- m3 (main); d1 branches off m1 (develop); f1 branches off d1 (feature);
// h1 branches off m2 (hotfix). Commits are listed oldest first, as the loader returns them.
const graph = {
  commits: [
    commit('m1'),
    commit('m2', 'm1'),
    commit('d1', 'm1'),
    commit('d2', 'd1'),
    commit('f1', 'd1'),
    commit('h1', 'm2'),
    commit('m3', 'm2')
  ],
  references: [
    reference('main', 'm3'),
    reference('develop', 'd2'),
    reference('feature', 'f1'),
    reference('hotfix', 'h1')
  ]
};

describe('parentReferenceName', () => {
  it('is the branch the given branch forked from', () => {
    expect(parentReferenceName(graph, 'hotfix')).toBe('main');
    expect(parentReferenceName(graph, 'feature')).toBe('develop');
  });

  it('is null for main and for branches that never meet another branch', () => {
    expect(parentReferenceName(graph, 'main')).toBeNull();
    const orphan = {
      commits: [commit('x1'), commit('m1')],
      references: [reference('main', 'm1'), reference('orphan', 'x1')]
    };
    expect(parentReferenceName(orphan, 'orphan')).toBeNull();
  });

  it('prefers the newest parent tip when multiple merge parents lead to main', () => {
    const mergeGraph = {
      commits: [
        timedCommit('m1', 1),
        timedCommit('m2', 20, 'm1'),
        timedCommit('release-1', 10, 'm1'),
        timedCommit('release-2', 100, 'release-1'),
        timedCommit('develop-1', 15, 'm1'),
        timedCommit('develop-2', 200, 'develop-1'),
        timedCommit('feature-merge', 210, 'release-2', 'develop-2')
      ],
      references: [
        reference('main', 'm2'),
        reference('release', 'release-2'),
        reference('develop', 'develop-2'),
        reference('feature', 'feature-merge')
      ]
    };

    expect(parentReferenceName(mergeGraph, 'feature')).toBe('develop');
    expect(branchPathToMain(mergeGraph, 'feature')).toEqual(['feature', 'develop', 'main']);
  });
});

describe('branchPathToMain', () => {
  it('lists the branch and every branch between it and main', () => {
    expect(branchPathToMain(graph, 'feature').sort()).toEqual(['develop', 'feature', 'main']);
    expect(branchPathToMain(graph, 'hotfix').sort()).toEqual(['hotfix', 'main']);
  });

  it('is just main for main itself', () => {
    expect(branchPathToMain(graph, 'main')).toEqual(['main']);
  });
});
