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

  it('keeps a reference color when other references are added or removed', () => {
    const baseline = orderReferences([
      { name: 'main', hash: 'm', remote: false },
      { name: 'feature', hash: 'f', remote: false },
      { name: 'origin/feature', hash: 'rf', remote: true }
    ]);
    const expanded = orderReferences([
      { name: 'main', hash: 'm', remote: false },
      { name: 'feature', hash: 'f', remote: false },
      { name: 'origin/feature', hash: 'rf', remote: true },
      { name: 'new-branch', hash: 'n', remote: false }
    ]);
    const colorByName = new Map(expanded.map((reference) => [reference.name, reference.color]));

    for (const reference of baseline) {
      expect(colorByName.get(reference.name)).toBe(reference.color);
    }
  });

  it('assigns visibly different colors to similarly named branches', () => {
    const colors = orderReferences([
      { name: 'main', hash: 'm', remote: false },
      { name: 'feature-1', hash: 'f1', remote: false },
      { name: 'feature-2', hash: 'f2', remote: false },
      { name: 'feature-3', hash: 'f3', remote: false }
    ])
      .filter((reference) => reference.name.startsWith('feature-'))
      .map((reference) => Number(reference.color.match(/hsl\((\d+)/)[1]));

    for (let left = 0; left < colors.length; left += 1) {
      for (let right = left + 1; right < colors.length; right += 1) {
        const difference = Math.abs(colors[left] - colors[right]);
        expect(Math.min(difference, 360 - difference)).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it('assigns main and a feature branch visibly different colors', () => {
    const colors = new Map(
      orderReferences([
        { name: 'main', hash: 'm', remote: false },
        { name: 'feature-3', hash: 'f3', remote: false }
      ]).map((reference) => [
        reference.name,
        Number(reference.color.match(/hsl\((\d+)/)[1])
      ])
    );
    const difference = Math.abs(colors.get('main') - colors.get('feature-3'));

    expect(Math.min(difference, 360 - difference)).toBeGreaterThanOrEqual(30);
  });

  it('assigns visibly different colors to the sample repository branches', () => {
    const hues = orderReferences([
      { name: 'main', hash: 'm', remote: false },
      { name: 'upgrade', hash: 'u', remote: false },
      { name: 'feature-1', hash: 'f1', remote: false },
      { name: 'feature-2', hash: 'f2', remote: false },
      { name: 'feature-3', hash: 'f3', remote: false }
    ]).map((reference) => Number(reference.color.match(/hsl\((\d+)/)[1]));

    for (let left = 0; left < hues.length; left += 1) {
      for (let right = left + 1; right < hues.length; right += 1) {
        const difference = Math.abs(hues[left] - hues[right]);
        expect(Math.min(difference, 360 - difference)).toBeGreaterThanOrEqual(30);
      }
    }
  });
});
