import { state } from './state.js';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEPS, parseZoomInput } from './zoom-input.js';

const formatZoom = (level) => `${Math.round(level * 100)}%`;

export function setZoom(level, anchor) {
  const graphElement = document.getElementById('commit-graph');
  const scroller = graphElement.parentElement;
  const previous = state.zoomLevel;
  state.zoomLevel = Math.min(Math.max(level, MIN_ZOOM), MAX_ZOOM);
  document.getElementById('zoom-level').value = formatZoom(state.zoomLevel);
  document.getElementById('zoom-in').disabled = state.zoomLevel >= MAX_ZOOM;
  document.getElementById('zoom-out').disabled = state.zoomLevel <= MIN_ZOOM;
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
  const input = document.getElementById('zoom-level');
  const list = document.getElementById('zoom-options');
  const toggle = document.getElementById('zoom-options-toggle');

  function setOpen(open) {
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
  }

  function applyTypedValue() {
    const level = parseZoomInput(input.value);
    if (level === null) {
      input.value = formatZoom(state.zoomLevel);
    } else {
      setZoom(level);
    }
  }

  const choices = [
    { label: 'Reset to 100%', level: 1 },
    ...ZOOM_STEPS.map((step) => ({ label: formatZoom(step), level: step }))
  ];
  for (const choice of choices) {
    const option = document.createElement('li');
    option.setAttribute('role', 'option');
    option.textContent = choice.label;
    option.addEventListener('mousedown', (event) => event.preventDefault());
    option.addEventListener('click', () => {
      setZoom(choice.level);
      setOpen(false);
    });
    list.append(option);
  }

  toggle.addEventListener('click', () => setOpen(list.hidden));
  input.addEventListener('focus', () => input.select());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      applyTypedValue();
      setOpen(false);
    } else if (event.key === 'Escape') {
      input.value = formatZoom(state.zoomLevel);
      setOpen(false);
    }
  });
  input.addEventListener('blur', applyTypedValue);
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.zoom-level')) {
      setOpen(false);
    }
  });
  document.getElementById('zoom-in').addEventListener('click', () => stepZoom(1));
  document.getElementById('zoom-out').addEventListener('click', () => stepZoom(-1));
}
