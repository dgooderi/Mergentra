import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEPS, parseZoomInput } from '../../src/renderer/zoom-input.js';

describe('parseZoomInput', () => {
  it('reads a percentage with or without the percent sign', () => {
    expect(parseZoomInput('150%')).toBe(1.5);
    expect(parseZoomInput(' 80 ')).toBe(0.8);
    expect(parseZoomInput('62.5%')).toBe(0.625);
  });

  it('clamps values outside the supported range to the nearest limit', () => {
    expect(parseZoomInput('1000')).toBe(MAX_ZOOM);
    expect(parseZoomInput('5%')).toBe(MIN_ZOOM);
    expect(parseZoomInput('0')).toBe(MIN_ZOOM);
  });

  it('returns null for text that is not a percentage so the caller can revert', () => {
    expect(parseZoomInput('')).toBeNull();
    expect(parseZoomInput('abc')).toBeNull();
    expect(parseZoomInput('-50')).toBeNull();
    expect(parseZoomInput('12 34')).toBeNull();
  });

  it('treats the reset option as 100%', () => {
    expect(parseZoomInput('Reset to 100%')).toBe(1);
  });
});

describe('zoom limits', () => {
  it('spans 25% to 300%', () => {
    expect([MIN_ZOOM, MAX_ZOOM]).toEqual([0.25, 3]);
    expect(ZOOM_STEPS).toContain(1);
  });
});
