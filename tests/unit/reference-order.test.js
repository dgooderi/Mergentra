import { describe, expect, it } from 'vitest';
import referenceOrder from '../../src/reference-order.js';

const { orderReferences } = referenceOrder;

describe('reference ordering', () => {
  it('pairs main and matching references with their remotes before unpaired references', () => {
    const references = [
      { name: 'zeta', hash: 'z', remote: false },
      { name: 'upstream/release', hash: 'r', remote: true },
      { name: 'main', hash: 'm', remote: false },
      { name: 'origin/zeta', hash: 'rz', remote: true },
      { name: 'alpha', hash: 'a', remote: false },
      { name: 'upstream/feature', hash: 'rf', remote: true },
      { name: 'feature', hash: 'f', remote: false },
      { name: 'origin/main', hash: 'rm', remote: true }
    ];

    const ordered = orderReferences(references);

    expect(ordered.map(({ name, lane }) => [name, lane])).toEqual([
      ['main', 0],
      ['origin/main', 1],
      ['feature', 2],
      ['upstream/feature', 3],
      ['zeta', 4],
      ['origin/zeta', 5],
      ['alpha', 6],
      ['upstream/release', 7]
    ]);
    expect(ordered[0].color).toBe(ordered[1].color);
    expect(ordered[2].color).toBe(ordered[3].color);
    expect(ordered[4].color).toBe(ordered[5].color);
  });

  it('places origin/main first when there is no local main reference', () => {
    const ordered = orderReferences([
      { name: 'feature', hash: 'f', remote: false },
      { name: 'origin/main', hash: 'm', remote: true },
      { name: 'origin/feature', hash: 'rf', remote: true }
    ]);

    expect(ordered.map(({ name }) => name)).toEqual(['origin/main', 'feature', 'origin/feature']);
  });

  it('treats master as the main line when there is no main', () => {
    const ordered = orderReferences([
      { name: 'alpha', hash: 'o', remote: false },
      { name: 'master', hash: 'm', remote: false },
      { name: 'zeta', hash: 'z', remote: false }
    ]);

    expect(ordered.map(({ name }) => name)).toEqual(['master', 'alpha', 'zeta']);
  });

  it('puts main ahead of master when both exist', () => {
    const ordered = orderReferences([
      { name: 'master', hash: 'm', remote: false },
      { name: 'main', hash: 'n', remote: false }
    ]);

    expect(ordered.map(({ name }) => name)).toEqual(['main', 'master']);
  });
});
