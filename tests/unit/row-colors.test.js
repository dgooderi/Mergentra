import { describe, expect, it } from 'vitest';
import { separateRowColors } from '../../src/renderer/row-colors.js';

const hueOf = (color) => Number(color.match(/hsl\((\d+)/)[1]);
const gap = (left, right) => {
  const difference = Math.abs(left - right);
  return Math.min(difference, 360 - difference);
};

function build(lanesAndColors) {
  const commits = [];
  const commitPositions = new Map();
  for (const suffix of ['a', 'b']) {
    lanesAndColors.forEach(([lane], index) => {
      const hash = `c${index}${suffix}`;
      commits.push({ hash, lane });
      commitPositions.set(hash, { x: 72, y: 100 + index * 16 });
    });
  }
  const colors = new Map(lanesAndColors);
  return { commits, commitPositions, colorOf: (lane) => colors.get(lane) };
}

describe('separateRowColors', () => {
  it('moves a row away from the row above when their hues are close', () => {
    const input = build([
      [0, 'hsl(120 78% 62%)'],
      [1, 'hsl(120 78% 48%)'],
      [2, 'hsl(150 78% 62%)']
    ]);
    const result = separateRowColors(input);
    const colorOf = (lane) => result.get(lane) ?? input.colorOf(lane);

    expect(gap(hueOf(colorOf(1)), hueOf(colorOf(0)))).toBeGreaterThanOrEqual(90);
    expect(gap(hueOf(colorOf(2)), hueOf(colorOf(1)))).toBeGreaterThanOrEqual(90);
    expect(result.has(0)).toBe(false);
  });

  it('leaves colours alone when neighbouring rows are already far apart', () => {
    const result = separateRowColors(
      build([
        [0, 'hsl(300 78% 48%)'],
        [1, 'hsl(120 78% 62%)']
      ])
    );
    expect(result.size).toBe(0);
  });

  it('lets a local branch and its remote counterpart share a colour', () => {
    const result = separateRowColors({
      ...build([
        [0, 'hsl(300 78% 48%)'],
        [1, 'hsl(300 78% 48%)']
      ]),
      mayShare: () => true
    });
    expect(result.size).toBe(0);
  });

  it('keeps hues apart down a long stack of rows', () => {
    const stack = Array.from({ length: 8 }, (_, lane) => [lane, 'hsl(0 78% 62%)']);
    const input = build(stack);
    const result = separateRowColors(input);
    for (let lane = 1; lane < 8; lane += 1) {
      const colorOf = (index) => result.get(index) ?? input.colorOf(index);
      expect(gap(hueOf(colorOf(lane)), hueOf(colorOf(lane - 1)))).toBeGreaterThanOrEqual(90);
    }
  });

  it('separates lanes whose edges run alongside each other without shared commits', () => {
    const commits = [
      { hash: 'a1', lane: 0, parents: [] },
      { hash: 'b1', lane: 1, parents: [] },
      { hash: 'm', lane: 2, parents: ['a1'] },
      { hash: 'c1', lane: 3, parents: ['b1'] }
    ];
    const ys = { a1: 100, b1: 116, m: 132, c1: 148 };
    const commitPositions = new Map(commits.map((c) => [c.hash, { x: 0, y: ys[c.hash] }]));
    const colors = new Map([
      [0, 'hsl(100 78% 62%)'],
      [1, 'hsl(100 78% 62%)'],
      [2, 'hsl(300 78% 62%)'],
      [3, 'hsl(200 78% 62%)']
    ]);
    const result = separateRowColors({ commits, commitPositions, colorOf: (l) => colors.get(l) });
    expect(result.has(1)).toBe(true);
  });

  it('ignores custom colours that are not hsl', () => {
    const result = separateRowColors(
      build([
        [0, '#ff0000'],
        [1, 'hsl(0 78% 62%)']
      ])
    );
    expect(result.size).toBe(0);
  });
});
