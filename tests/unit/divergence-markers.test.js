import { describe, expect, it } from 'vitest';
import divergenceMarkers from '../../src/divergence-markers.js';

const { computeDivergenceMarkers } = divergenceMarkers;

function commit(hash, parents) {
  return { hash, parents };
}

describe('divergence markers', () => {
  it('marks the first unique commit on a diverging local reference', () => {
    const commits = [
      commit('root', []),
      commit('base', ['root']),
      commit('main-only', ['base']),
      commit('feature-only', ['base']),
      commit('main-tip', ['main-only']),
      commit('feature-tip', ['feature-only'])
    ];
    const references = [
      { name: 'main', hash: 'main-tip', remote: false },
      { name: 'origin/main', hash: 'main-tip', remote: true },
      { name: 'feature', hash: 'feature-tip', remote: false }
    ];

    expect(computeDivergenceMarkers(commits, references)).toEqual([
      {
        branchName: 'feature',
        ancestorHash: 'base',
        commitHash: 'feature-only',
        inferred: true
      }
    ]);
  });

  it('does not mark an ancestor reference or an unrelated history', () => {
    const commits = [
      commit('main-tip', ['main-only']),
      commit('main-only', ['base']),
      commit('base', []),
      commit('unrelated', [])
    ];
    const references = [
      { name: 'main', hash: 'main-tip', remote: false },
      { name: 'ancestor', hash: 'base', remote: false },
      { name: 'unrelated', hash: 'unrelated', remote: false }
    ];

    expect(computeDivergenceMarkers(commits, references)).toEqual([]);
  });

  it('uses the first local reference as the main reference when main is absent', () => {
    const commits = [
      commit('primary-tip', ['primary-only']),
      commit('other-tip', ['other-only']),
      commit('primary-only', ['base']),
      commit('other-only', ['base']),
      commit('base', [])
    ];
    const references = [
      { name: 'primary', hash: 'primary-tip', remote: false },
      { name: 'other', hash: 'other-tip', remote: false }
    ];

    expect(computeDivergenceMarkers(commits, references)).toEqual([
      {
        branchName: 'other',
        ancestorHash: 'base',
        commitHash: 'other-only',
        inferred: true
      }
    ]);
  });

  it('measures divergence from master when there is no main', () => {
    const commits = [
      commit('base', []),
      commit('master-tip', ['base']),
      commit('a-only', ['base']),
      commit('a-tip', ['a-only'])
    ];
    const references = [
      { name: 'a', hash: 'a-tip', remote: false },
      { name: 'master', hash: 'master-tip', remote: false }
    ];

    expect(computeDivergenceMarkers(commits, references)).toEqual([
      { branchName: 'a', ancestorHash: 'base', commitHash: 'a-only', inferred: true }
    ]);
  });
});
