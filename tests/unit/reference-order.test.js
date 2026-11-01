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

  it('gives up to 36 unrelated branches distinct colours', () => {
    const references = Array.from({ length: 36 }, (_, index) => ({
      name: `branch-${index}`,
      hash: `h${index}`,
      remote: false
    }));
    const colors = new Set(orderReferences(references).map(({ color }) => color));
    expect(colors.size).toBe(36);
  });

  describe('colour assignment', () => {
    const hueOf = (reference) => Number(reference.color.match(/hsl\((\d+)/)[1]);
    const gap = (left, right) => {
      const difference = Math.abs(left - right);
      return Math.min(difference, 360 - difference);
    };
    const now = 1_800_000_000;
    const day = 24 * 60 * 60;

    it('keeps neighbouring lanes at least 90 degrees apart in hue', () => {
      const references = Array.from({ length: 10 }, (_, index) => ({
        name: `branch-${index}`,
        hash: `h${index}`,
        remote: false,
        tipTimestamp: now
      }));
      const hues = orderReferences(references, { now }).map(hueOf);

      for (let index = 1; index < hues.length; index += 1) {
        expect(gap(hues[index], hues[index - 1])).toBeGreaterThanOrEqual(90);
      }
    });

    it('lets branches with no recent commit reuse colours that active branches hold', () => {
      const active = Array.from({ length: 36 }, (_, index) => ({
        name: `active-${String(index).padStart(2, '0')}`,
        hash: `a${index}`,
        remote: false,
        tipTimestamp: now - day
      }));
      const stale = Array.from({ length: 20 }, (_, index) => ({
        name: `stale-${index}`,
        hash: `s${index}`,
        remote: false,
        tipTimestamp: now - 400 * day
      }));
      const ordered = orderReferences([...active, ...stale], { now });
      const activeColors = ordered.filter((reference) => reference.name.startsWith('active-'));

      expect(new Set(activeColors.map(({ color }) => color)).size).toBe(36);
      const held = new Set(activeColors.map(({ color }) => color));
      expect(
        ordered.some(
          (reference) => reference.name.startsWith('stale-') && held.has(reference.color)
        )
      ).toBe(true);
    });

    it('does not let stale branches change the colours of active ones', () => {
      const base = ['alpha', 'beta', 'gamma'].map((name) => ({
        name,
        hash: name,
        remote: false,
        tipTimestamp: now
      }));
      const withStale = [
        ...base,
        { name: 'ancient', hash: 'x', remote: false, tipTimestamp: now - 500 * day }
      ];
      const colors = (references) =>
        new Map(orderReferences(references, { now }).map((entry) => [entry.name, entry.color]));
      const before = colors(base);
      const after = colors(withStale);

      for (const name of ['alpha', 'beta', 'gamma']) {
        expect(after.get(name)).toBe(before.get(name));
      }
    });

    it('treats main as active however old its last commit is', () => {
      const ordered = orderReferences(
        [
          { name: 'main', hash: 'm', remote: false, tipTimestamp: now - 900 * day },
          { name: 'feature', hash: 'f', remote: false, tipTimestamp: now }
        ],
        { now }
      );

      expect(new Set(ordered.map(({ color }) => color)).size).toBe(2);
    });
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
      ]).map((reference) => [reference.name, Number(reference.color.match(/hsl\((\d+)/)[1])])
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
