import { describe, expect, it } from 'vitest';
import { computeTimeAxisTicks, dateRangeFromAxisDrag } from '../../src/renderer/time-axis.js';

const DAY = 24 * 60 * 60;
const at = (year, month, day, hour = 12) => new Date(year, month, day, hour).getTime() / 1000;

function positions(commits) {
  return new Map(commits.map((commit, index) => [commit.hash, { x: 72 + index * 88, y: 0 }]));
}

describe('computeTimeAxisTicks', () => {
  const now = new Date(2024, 5, 20);

  it('has no ticks without dated commits', () => {
    const commits = [{ hash: 'a', committerTimestamp: 0 }];
    expect(computeTimeAxisTicks(commits, positions(commits), now).ticks).toEqual([]);
  });

  it('adds a tick per positioned commit with its x and timestamp', () => {
    const commits = [
      { hash: 'a', committerTimestamp: at(2024, 5, 10) },
      { hash: 'b', committerTimestamp: at(2024, 5, 9) }
    ];
    const { ticks } = computeTimeAxisTicks(commits, positions(commits), now);
    expect(ticks.map((tick) => [tick.x, tick.timestamp])).toEqual([
      [72, commits[0].committerTimestamp],
      [160, commits[1].committerTimestamp]
    ]);
  });

  it('skips commits without a position', () => {
    const commits = [{ hash: 'a', committerTimestamp: at(2024, 5, 10) }];
    expect(computeTimeAxisTicks(commits, new Map(), now).ticks).toEqual([]);
  });

  it('shows times for short spans and drops them for long ones', () => {
    const short = [
      { hash: 'a', committerTimestamp: at(2024, 5, 10) },
      { hash: 'b', committerTimestamp: at(2024, 5, 10) - DAY }
    ];
    const long = [
      { hash: 'a', committerTimestamp: at(2024, 5, 10) },
      { hash: 'b', committerTimestamp: at(2024, 1, 10) }
    ];
    const shortResult = computeTimeAxisTicks(short, positions(short), now);
    expect(shortResult.showTime).toBe(true);
    expect(shortResult.ticks[0].timeText).not.toBe('');
    const longResult = computeTimeAxisTicks(long, positions(long), now);
    expect(longResult.showTime).toBe(false);
    expect(longResult.ticks[0].timeText).toBe('');
  });

  it('includes the year only when it is not the current one', () => {
    const commits = [
      { hash: 'a', committerTimestamp: at(2024, 5, 10) },
      { hash: 'b', committerTimestamp: at(2022, 5, 10) }
    ];
    const { ticks } = computeTimeAxisTicks(commits, positions(commits), now);
    expect(ticks[0].dateText).not.toContain('2024');
    expect(ticks[1].dateText).toContain('2022');
  });
});

describe('dateRangeFromAxisDrag', () => {
  const tick = (x, year, month, day) => ({ x, timestamp: at(year, month, day) });
  const ticks = [
    tick(100, 2024, 0, 10),
    tick(200, 2024, 1, 20),
    tick(300, 2024, 2, 5),
    tick(400, 2024, 3, 30)
  ];

  it('covers the dates of the ticks the drag passes over, whichever direction it goes', () => {
    const expected = { start: '2024-02-20', end: '2024-03-05' };
    expect(dateRangeFromAxisDrag(ticks, 150, 350)).toEqual(expected);
    expect(dateRangeFromAxisDrag(ticks, 350, 150)).toEqual(expected);
  });

  it('uses the earliest and latest dates even when history order is not date order', () => {
    const unordered = [tick(100, 2024, 5, 1), tick(200, 2024, 0, 1), tick(300, 2024, 2, 1)];
    expect(dateRangeFromAxisDrag(unordered, 50, 350)).toEqual({
      start: '2024-01-01',
      end: '2024-06-01'
    });
  });

  it('ignores tiny drags so a plain click is not a selection', () => {
    expect(dateRangeFromAxisDrag(ticks, 150, 154)).toBeNull();
  });

  it('returns null when the drag does not cover any dated tick', () => {
    expect(dateRangeFromAxisDrag(ticks, 210, 290)).toBeNull();
    expect(dateRangeFromAxisDrag([], 0, 500)).toBeNull();
  });
});
