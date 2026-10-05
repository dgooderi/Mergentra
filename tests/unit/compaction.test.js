import { describe, expect, it } from 'vitest';
import { compactOrdinaryHistory, compactSameLaneRuns } from '../../src/renderer/compaction.js';

function commit(hash, parents, extra = {}) {
  return { hash, parents, lane: 0, tags: [], references: [], ...extra };
}

function graphOf(commits, overrides = {}) {
  return {
    commits,
    references: [],
    shallowBoundaries: [],
    missingObjectBoundaries: [],
    divergenceMarkers: [],
    cutMarkers: [],
    headDetached: false,
    headHash: null,
    ...overrides
  };
}

// Newest first, like the commits arrive from the main process.
function chain(length, endpoints = {}) {
  const hashes = Array.from({ length }, (_, index) => `c${length - index}`);
  return hashes.map((hash, index) =>
    commit(hash, index === hashes.length - 1 ? [] : [hashes[index + 1]], endpoints[hash])
  );
}

describe('compactOrdinaryHistory', () => {
  it('replaces a run of ordinary commits between important commits with one summary', () => {
    const graph = graphOf(chain(5, { c1: { tags: ['v1'] } }), {
      references: [{ hash: 'c5' }]
    });

    const result = compactOrdinaryHistory(graph);

    expect(result.commits.map((c) => c.hash)).toEqual(['compact:c1:c5', 'c5', 'c1']);
    const summary = result.commits[0];
    expect(summary.compactCount).toBe(3);
    expect(summary.parents).toEqual(['c1']);
    expect(summary.compactedHashes).toEqual(['c2', 'c3', 'c4']);
    expect(summary.compactedCommits.map((c) => c.hash)).toEqual(['c4', 'c3', 'c2']);
    expect(result.commits[1].parents).toEqual(['compact:c1:c5']);
    expect(result.commits[1].originalParents).toEqual(['c4']);
  });

  it('shows a single ordinary commit as itself', () => {
    const graph = graphOf(chain(3, { c1: { tags: ['v1'] } }), { references: [{ hash: 'c3' }] });
    expect(compactOrdinaryHistory(graph)).toBe(graph);
  });

  it('keeps shallow boundaries, divergence markers and detached HEAD important', () => {
    const base = chain(6, { c1: { tags: ['v1'] } });
    for (const overrides of [
      { shallowBoundaries: ['c3'] },
      { divergenceMarkers: [{ commitHash: 'c3' }] },
      { headDetached: true, headHash: 'c3' }
    ]) {
      const result = compactOrdinaryHistory(
        graphOf(base, { references: [{ hash: 'c6' }], ...overrides })
      );
      expect(result.commits.map((c) => c.hash)).toContain('c3');
    }
  });

  it('keeps merge commits and their parents visible', () => {
    const commits = [
      commit('m', ['b2', 'a2']),
      commit('b2', ['b1']),
      commit('b1', ['root']),
      commit('a2', ['a1']),
      commit('a1', ['root']),
      commit('root', [], { tags: ['v0'] })
    ];
    const result = compactOrdinaryHistory(graphOf(commits, { references: [{ hash: 'm' }] }));
    expect(result.commits.map((c) => c.hash)).toEqual(commits.map((c) => c.hash));
  });
});

describe('compactSameLaneRuns', () => {
  it('collapses an unbroken run of plain commits on one lane', () => {
    const graph = graphOf(
      chain(5, { c1: { tags: ['v1'] }, c5: { references: [{ name: 'main' }] } })
    );

    const result = compactSameLaneRuns(graph);

    expect(result.commits.map((c) => c.hash)).toEqual(['c5', 'compact-lane:c4:c2', 'c1']);
    const summary = result.commits[1];
    expect(summary.compactCount).toBe(3);
    expect(summary.parents).toEqual(['c1']);
    expect(result.commits[0].parents).toEqual(['compact-lane:c4:c2']);
  });

  it('does not collapse commits that touch another lane', () => {
    const commits = chain(5, { c1: { tags: ['v1'] }, c5: { references: [{ name: 'main' }] } });
    commits[2] = { ...commits[2], lane: 1 };
    const graph = graphOf(commits);
    expect(compactSameLaneRuns(graph)).toBe(graph);
  });

  it('does not collapse a run of one', () => {
    const graph = graphOf(
      chain(3, { c1: { tags: ['v1'] }, c3: { references: [{ name: 'main' }] } })
    );
    expect(compactSameLaneRuns(graph)).toBe(graph);
  });
});
