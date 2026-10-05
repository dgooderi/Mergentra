import { describe, expect, it } from 'vitest';
import { buildFilteredGraph, computeAvailableReferences } from '../../src/renderer/lanes.js';

const DAY = 24 * 60 * 60;

function commit(hash, parents, day, names = []) {
  return {
    hash,
    parents,
    committerTimestamp: day * DAY,
    tags: [],
    references: names
  };
}

function graphOf(commits, references, overrides = {}) {
  return {
    commits,
    references,
    divergenceMarkers: [],
    headDetached: false,
    headHash: null,
    ...overrides
  };
}

const range = (fromDay, toDay) => ({ start: fromDay * DAY * 1000, end: toDay * DAY * 1000 });

describe('buildFilteredGraph', () => {
  const commits = [
    commit('m', ['b2', 'f2'], 9, ['main']),
    commit('f2', ['f1'], 8, ['feature']),
    commit('f1', ['b2'], 7),
    commit('b2', ['b1'], 6),
    commit('b1', [], 5)
  ];
  const references = [
    { name: 'feature', hash: 'f2' },
    { name: 'main', hash: 'm' }
  ];

  it('puts main on its own lane first even when listed second, and shares ancestors', () => {
    const graph = buildFilteredGraph(
      graphOf(commits, references),
      new Set(['feature', 'main']),
      null
    );
    const lane = Object.fromEntries(graph.commits.map((c) => [c.hash, c.lane]));
    expect(lane).toEqual({ m: 1, f2: 0, f1: 0, b2: 1, b1: 1 });
    expect(graph.laneCount).toBe(2);
  });

  it('puts commits reached only through a merge second parent on a side lane', () => {
    const graph = buildFilteredGraph(graphOf(commits, references), new Set(['main']), null);
    const lane = Object.fromEntries(graph.commits.map((c) => [c.hash, c.lane]));
    expect(lane.m).toBe(0);
    expect(lane.b2).toBe(0);
    expect(lane.f2).toBe(2);
    expect(lane.f1).toBe(2);
    expect(graph.sideLanes.get(2)).toBe(0);
  });

  it('drops branches that are not selected and their exclusive commits', () => {
    const graph = buildFilteredGraph(
      graphOf(
        [commit('x', [], 3, ['other']), ...commits],
        [...references, { name: 'other', hash: 'x' }]
      ),
      new Set(['main']),
      null
    );
    expect(graph.commits.map((c) => c.hash)).not.toContain('x');
  });

  it('keeps only commits in the time range and marks where history was cut', () => {
    const graph = buildFilteredGraph(graphOf(commits, references), new Set(['main']), range(6, 10));
    expect(graph.commits.map((c) => c.hash)).toEqual(['m', 'f2', 'f1', 'b2']);
    expect(graph.cutMarkers).toEqual([{ commitHash: 'b2', direction: 'older' }]);
  });

  it('gives a detached HEAD its own lane after the branch lanes', () => {
    const detached = [commit('d', ['b1'], 6), commit('b1', [], 5, ['main'])];
    const graph = buildFilteredGraph(
      graphOf(detached, [{ name: 'main', hash: 'b1' }], { headDetached: true, headHash: 'd' }),
      new Set(['main']),
      null
    );
    expect(graph.commits.find((c) => c.hash === 'd').lane).toBe(1);
  });
});

describe('computeAvailableReferences', () => {
  const commits = [commit('a2', ['a1'], 9), commit('a1', [], 1), commit('b1', [], 2)];
  const references = [
    { name: 'a', hash: 'a2' },
    { name: 'b', hash: 'b1' }
  ];

  it('is null without a time range', () => {
    expect(computeAvailableReferences(graphOf(commits, references), null)).toBeNull();
  });

  it('lists branches with a first-parent commit inside the range', () => {
    const names = computeAvailableReferences(graphOf(commits, references), range(8, 10));
    expect([...names]).toEqual(['a']);
  });
});
