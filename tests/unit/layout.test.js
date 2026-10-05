import { describe, expect, it } from 'vitest';
import {
  branchLabelNames,
  computeGraphLayout,
  truncateBranchName
} from '../../src/renderer/layout.js';

function commit(hash, parents, lane, extra = {}) {
  return { hash, parents, lane, tags: [], references: [], ...extra };
}

function graphOf(commits, references, cutMarkers = []) {
  return { commits, references, cutMarkers };
}

describe('branchLabelNames', () => {
  it('excludes tags and collapses a remote branch paired with its local branch', () => {
    const names = branchLabelNames(
      commit('a', [], 0, {
        references: ['main', 'origin/main', 'v1', 'origin/other'],
        tags: ['v1']
      })
    );
    expect(names.branchNames).toEqual(['main', 'origin/main', 'origin/other']);
    expect(names.shortNames).toEqual(['main', 'origin/other']);
    expect(names.hasPairedRemote).toBe(true);
  });
});

describe('truncateBranchName', () => {
  it('keeps the end of long names', () => {
    expect(truncateBranchName('short')).toBe('short');
    const long = 'feature/' + 'x'.repeat(30);
    expect(truncateBranchName(long)).toHaveLength(22);
    expect(truncateBranchName(long).startsWith('\u2026')).toBe(true);
  });
});

describe('computeGraphLayout', () => {
  const references = [
    { name: 'feature', lane: 0 },
    { name: 'main', lane: 1 }
  ];

  it('spaces commits left to right by history order', () => {
    const layout = computeGraphLayout(
      graphOf([commit('b', ['a'], 1), commit('a', [], 1)], [{ name: 'main', lane: 0 }])
    );
    const [b, a] = ['b', 'a'].map((hash) => layout.commitPositions.get(hash));
    expect(a.x - b.x).toBe(88);
    expect(a.y).toBe(b.y);
  });

  it('keeps main on the top row and puts an overlapping branch below it', () => {
    const commits = [commit('m', ['f1', 'b'], 1), commit('f1', ['b'], 0), commit('b', [], 1)];
    const layout = computeGraphLayout(graphOf(commits, references));
    const y = (hash) => layout.commitPositions.get(hash).y;
    expect(y('m')).toBe(y('b'));
    expect(y('f1')).toBeGreaterThan(y('m'));
  });

  it('lets lanes that never overlap share a row', () => {
    const commits = [
      commit('x2', ['x1'], 0),
      commit('x1', [], 0),
      commit('y2', ['y1'], 2),
      commit('y1', [], 2),
      commit('m', [], 1)
    ];
    const layout = computeGraphLayout(
      graphOf(commits, [...references, { name: 'other', lane: 2 }])
    );
    expect(layout.commitPositions.get('x1').y).toBe(layout.commitPositions.get('y1').y);
  });

  it('makes a cut marker available by commit and sizes the canvas', () => {
    const marker = { commitHash: 'a', direction: 'older' };
    const layout = computeGraphLayout(
      graphOf([commit('a', [], 0)], [{ name: 'main', lane: 0 }], [marker])
    );
    expect(layout.cutMarkersByHash.get('a')).toEqual([marker]);
    expect(layout.width).toBe(232);
    expect(layout.height).toBeGreaterThan(106);
  });
});
