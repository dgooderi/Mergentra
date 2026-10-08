const INTERACTIVE =
  '[data-testid="time-axis-drag-area"], [data-testid="commit-node"], [data-testid="compacted-commit-count"], button, a, input, select, textarea';
const DRAG_THRESHOLD_PIXELS = 4;

// Grab-and-drag panning: the content follows the pointer in either direction.
// Panning only starts once the pointer has moved, so plain clicks (including Shift-click zoom) are untouched.
export function attachGraphPan(scroller) {
  scroller.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest(INTERACTIVE)) {
      return;
    }
    // Presses on the scrollbars themselves are left to the browser.
    const bounds = scroller.getBoundingClientRect();
    if (
      event.clientX - bounds.left > scroller.clientWidth ||
      event.clientY - bounds.top > scroller.clientHeight
    ) {
      return;
    }
    const startX = event.clientX;
    const startY = event.clientY;
    let lastX = startX;
    let lastY = startY;
    let panning = false;

    const move = (moveEvent) => {
      if (!panning) {
        if (
          Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < DRAG_THRESHOLD_PIXELS
        ) {
          return;
        }
        panning = true;
        scroller.classList.add('panning');
        scroller.setPointerCapture?.(event.pointerId);
      }
      scroller.scrollLeft -= moveEvent.clientX - lastX;
      scroller.scrollTop -= moveEvent.clientY - lastY;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
    };
    const stop = () => {
      scroller.classList.remove('panning');
      scroller.removeEventListener('pointermove', move);
      scroller.removeEventListener('pointerup', stop);
      scroller.removeEventListener('pointercancel', stop);
    };
    scroller.addEventListener('pointermove', move);
    scroller.addEventListener('pointerup', stop);
    scroller.addEventListener('pointercancel', stop);
  });
}
