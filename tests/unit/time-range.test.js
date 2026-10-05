import { describe, expect, it } from 'vitest';
import {
  getPresetRange,
  localDateString,
  subtractCalendarMonths
} from '../../src/renderer/time-range.js';

const DAY = 24 * 60 * 60 * 1000;

describe('getPresetRange', () => {
  it('uses fixed durations for day and week presets', () => {
    const now = new Date(2024, 5, 15, 12);
    for (const [preset, days] of [
      ['1d', 1],
      ['5d', 5],
      ['1w', 7],
      ['2w', 14]
    ]) {
      expect(getPresetRange(preset, now)).toEqual({
        start: now.getTime() - days * DAY,
        end: now.getTime()
      });
    }
  });

  it('uses calendar months for month and year presets', () => {
    const now = new Date(2024, 5, 15, 12);
    expect(getPresetRange('3m', now).start).toBe(new Date(2024, 2, 15, 12).getTime());
    expect(getPresetRange('1y', now).start).toBe(new Date(2023, 5, 15, 12).getTime());
  });

  it('returns null for unknown presets such as custom or all', () => {
    expect(getPresetRange('custom', new Date())).toBeNull();
    expect(getPresetRange('all', new Date())).toBeNull();
  });
});

describe('subtractCalendarMonths', () => {
  it('clamps to the last day of shorter months', () => {
    expect(subtractCalendarMonths(new Date(2024, 2, 31), 1).getDate()).toBe(29);
    expect(subtractCalendarMonths(new Date(2023, 2, 31), 1).getDate()).toBe(28);
  });

  it('crosses year boundaries', () => {
    const result = subtractCalendarMonths(new Date(2024, 1, 10), 3);
    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2023, 10, 10]);
  });
});

describe('localDateString', () => {
  it('formats a timestamp as a zero-padded local date', () => {
    expect(localDateString(new Date(2024, 0, 5, 23, 59).getTime())).toBe('2024-01-05');
  });
});
