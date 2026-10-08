const INTERACTIVE =
  '[data-testid="time-axis-drag-area"], [data-testid="commit-node"], button, a, input, select, textarea';

// Grab-and-drag panning: the content follows the pointer in either direction.
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
    let lastX = event.clientX;
    let lastY = event.clientY;
    scroller.classList.add('panning');
    scroller.setPointerCapture?.(event.pointerId);

    const move = (moveEvent) => {
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
