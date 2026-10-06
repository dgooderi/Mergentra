import { state } from './state.js';

const ZOOM_STEPS = [0.25, 0.4, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];

export function setZoom(level, anchor) {
  const graphElement = document.getElementById('commit-graph');
  const scroller = graphElement.parentElement;
  const previous = state.zoomLevel;
  state.zoomLevel = Math.min(Math.max(level, ZOOM_STEPS[0]), ZOOM_STEPS[ZOOM_STEPS.length - 1]);
  document.getElementById('zoom-reset').textContent = `${Math.round(state.zoomLevel * 100)}%`;
  document.getElementById('zoom-in').disabled =
    state.zoomLevel >= ZOOM_STEPS[ZOOM_STEPS.length - 1];
  document.getElementById('zoom-out').disabled = state.zoomLevel <= ZOOM_STEPS[0];
  const baseWidth = Number(graphElement.dataset.baseWidth);
  if (!baseWidth || previous === state.zoomLevel) {
    return;
  }
  // Keep the point under the cursor (or the view centre) in place while zooming.
  const box = scroller.getBoundingClientRect();
  const anchorX = anchor ? anchor.x - box.left : scroller.clientWidth / 2;
  const anchorY = anchor ? anchor.y - box.top : scroller.clientHeight / 2;
  const contentX = (scroller.scrollLeft + anchorX) / previous;
  const contentY = (scroller.scrollTop + anchorY) / previous;
  graphElement.setAttribute('width', String(Math.round(baseWidth * state.zoomLevel)));
  graphElement.setAttribute(
    'height',
    String(Math.round(Number(graphElement.dataset.baseHeight) * state.zoomLevel))
  );
  scroller.scrollLeft = contentX * state.zoomLevel - anchorX;
  scroller.scrollTop = contentY * state.zoomLevel - anchorY;
}

export function stepZoom(direction, anchor) {
  const index = ZOOM_STEPS.findIndex((step) => step >= state.zoomLevel - 0.001);
  const next = Math.min(Math.max(index + direction, 0), ZOOM_STEPS.length - 1);
  setZoom(ZOOM_STEPS[next], anchor);
}

export function initZoomControls() {
  document.getElementById('zoom-in').addEventListener('click', () => stepZoom(1));
  document.getElementById('zoom-out').addEventListener('click', () => stepZoom(-1));
  document.getElementById('zoom-reset').addEventListener('click', () => setZoom(1));
}
