import { describe, expect, it } from 'vitest';
import { inferBranchContext } from '../../src/renderer/branch-context.js';

function commit(hash, parents, subject = hash) {
  return { hash, parents, subject };
}

function graphOf(commits, references, divergenceMarkers = []) {
  return { commits, references, divergenceMarkers };
}

describe('inferBranchContext', () => {
  const commits = [
    commit('merge', ['m1', 'f2'], "Merge branch 'feature'"),
    commit('f2', ['f1']),
    commit('f1', ['base']),
    commit('m1', ['base']),
    commit('base', [])
  ];
  const references = [
    { name: 'main', hash: 'merge', remote: false },
    { name: 'feature', hash: 'f2', remote: false }
  ];

  it('returns null for an ordinary commit', () => {
    expect(inferBranchContext(commits[1], graphOf(commits, references))).toBeNull();
  });

  it('names the branch holding the merge as the destination and the merged-in branch as the source', () => {
    expect(inferBranchContext(commits[0], graphOf(commits, references))).toEqual({
      kind: 'merge',
      source: 'feature',
      destination: 'main'
    });
  });

  it('falls back to the merge message when the merged branch no longer exists', () => {
    const graph = graphOf(commits, [references[0]]);
    expect(inferBranchContext(commits[0], graph)).toEqual({
      kind: 'merge',
      source: 'feature',
      destination: 'main'
    });
  });

  it('reads the source from a pull request merge message', () => {
    const pullRequestMerge = commit('merge', ['m1', 'f2'], 'Merge pull request #7 from octo/topic');
    const graph = graphOf([pullRequestMerge, ...commits.slice(1)], [references[0]]);
    expect(inferBranchContext(pullRequestMerge, graph)).toEqual({
      kind: 'merge',
      source: 'topic',
      destination: 'main'
    });
  });

  it('reports unknown names rather than guessing', () => {
    const plainMerge = commit('merge', ['m1', 'f2'], 'Combine work');
    const graph = graphOf([plainMerge, ...commits.slice(1)], []);
    expect(inferBranchContext(plainMerge, graph)).toEqual({
      kind: 'merge',
      source: null,
      destination: null
    });
  });

  it('uses the original parents of a compacted commit', () => {
    const compacted = { ...commits[0], parents: ['m1'], originalParents: ['m1', 'f2'] };
    expect(inferBranchContext(compacted, graphOf(commits, references))?.source).toBe('feature');
  });

  it('names the diverging branch and the main line for a branch divergence commit', () => {
    const graph = graphOf(commits, references, [
      { branchName: 'feature', ancestorHash: 'base', commitHash: 'f1', inferred: true }
    ]);
    expect(inferBranchContext(commits[2], graph)).toEqual({
      kind: 'divergence',
      source: 'feature',
      destination: 'main'
    });
  });

  it('uses master as the main line when there is no main', () => {
    const graph = graphOf(
      commits,
      [
        { name: 'master', hash: 'm1', remote: false },
        { name: 'feature', hash: 'f2', remote: false }
      ],
      [{ branchName: 'feature', ancestorHash: 'base', commitHash: 'f1', inferred: true }]
    );
    expect(inferBranchContext(commits[2], graph)?.destination).toBe('master');
  });
});
