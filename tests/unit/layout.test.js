import { describe, expect, it } from 'vitest';
import { computeGraphLayout } from '../../src/renderer/layout.js';

function commit(hash, parents, lane, extra = {}) {
  return { hash, parents, lane, tags: [], references: [], ...extra };
}

function graphOf(commits, references, cutMarkers = []) {
  return { commits, references, cutMarkers };
}

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

  it('keeps master on the top row whichever branch is checked out', () => {
    const layout = computeGraphLayout(
      graphOf(
        [commit('o1', ['m1'], 0), commit('m2', ['m1'], 1), commit('m1', [], 1)],
        [
          { name: 'oams', lane: 0 },
          { name: 'master', lane: 1 }
        ]
      )
    );
    const y = (hash) => layout.commitPositions.get(hash).y;
    expect(y('m1')).toBe(y('m2'));
    expect(y('o1')).toBeGreaterThan(y('m2'));
  });
});
