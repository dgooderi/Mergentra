import { describe, expect, it } from 'vitest';
import { sideLaneColor } from '../../src/renderer/side-lane-color.js';

const hueOf = (color) => Number(color.match(/hsl\((\d+)/)[1]);

describe('sideLaneColor', () => {
  it('moves the hue well away from the owner so merged-in branches stand apart', () => {
    for (const owner of ['hsl(300 78% 48%)', 'hsl(0 78% 62%)', 'hsl(330 78% 74%)']) {
      const difference = Math.abs(hueOf(sideLaneColor(owner)) - hueOf(owner));
      expect(Math.min(difference, 360 - difference)).toBeGreaterThanOrEqual(120);
    }
  });

  it('keeps custom colours that are not hsl', () => {
    expect(sideLaneColor('#ff00aa')).toBe('#ff00aa');
  });
});
