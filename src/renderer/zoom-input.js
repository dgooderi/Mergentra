export const ZOOM_STEPS = [0.25, 0.4, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

export function parseZoomInput(text) {
  const trimmed = text.trim();
  if (/^reset/i.test(trimmed)) {
    return 1;
  }
  const match = /^(\d+(?:\.\d+)?)\s*%?$/.exec(trimmed);
  if (!match) {
    return null;
  }
  return Math.min(Math.max(Number(match[1]) / 100, MIN_ZOOM), MAX_ZOOM);
}
