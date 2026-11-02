// Shows the main process's confirmation requests in a dialog that matches the app theme,
// instead of a native message box that follows the Windows colours.
export function initConfirmDialog() {
  const overlay = document.getElementById('confirm-dialog');
  const heading = document.getElementById('confirm-heading');
  const message = document.getElementById('confirm-message');
  const detail = document.getElementById('confirm-detail');
  const actions = document.getElementById('confirm-actions');
  const appMain = document.getElementById('app-main');
  let activeId = null;

  function close(response) {
    if (activeId === null) {
      return;
    }
    const id = activeId;
    activeId = null;
    overlay.hidden = true;
    appMain.inert = false;
    window.mergentra.respondToConfirm(id, response);
  }

  window.mergentra.onConfirmRequest(({ id, title, message: text, detail: more, buttons }) => {
    activeId = id;
    heading.textContent = title;
    message.textContent = text;
    detail.textContent = more ?? '';
    detail.hidden = !more;
    actions.replaceChildren(
      ...buttons.map((label, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        // The first button is the safe choice (cancel); the last is the one that continues.
        button.className = index === buttons.length - 1 ? '' : 'secondary';
        button.addEventListener('click', () => close(index));
        return button;
      })
    );
    appMain.inert = true;
    overlay.hidden = false;
    actions.firstElementChild?.focus();
  });

  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      close(0);
    }
  });
}
