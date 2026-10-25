export function createStashPanel(api = window.mergentra) {
  const panel = document.getElementById('stashes-panel');
  const heading = document.getElementById('stashes-heading');
  const status = document.getElementById('stashes-status');
  const list = document.getElementById('stash-list');
  const details = document.getElementById('stash-details');
  const detailsHeading = document.getElementById('stash-details-heading');
  const detailsStatus = document.getElementById('stash-details-status');
  const changes = document.getElementById('stash-changes');
  let loadToken = 0;

  function hideDetails() {
    details.hidden = true;
    changes.replaceChildren();
  }

  async function inspect(stash, button) {
    for (const other of list.querySelectorAll('button')) {
      other.setAttribute('aria-pressed', String(other === button));
    }
    details.hidden = false;
    detailsHeading.textContent = `${stash.ref} · changed paths`;
    detailsStatus.textContent = 'Reading stash…';
    changes.replaceChildren();
    try {
      const result = await api.inspectStash(stash.index);
      if (!result.available) {
        detailsStatus.textContent = result.message;
        return;
      }
      detailsStatus.textContent =
        result.changes.length === 0 ? 'This stash records no changed paths.' : '';
      for (const change of result.changes) {
        const item = document.createElement('li');
        item.dataset.testid = 'stash-change';
        item.dataset.status = change.status;
        item.textContent = `${change.status}  ${change.path}`;
        changes.append(item);
      }
    } catch (error) {
      detailsStatus.textContent = error.message;
    }
  }

  function renderEntry(stash) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const message = document.createElement('span');
    const meta = document.createElement('small');
    item.dataset.testid = 'stash';
    item.dataset.ref = stash.ref;
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    message.textContent = `${stash.ref} · ${stash.message}`;
    const origin = stash.branch ? `On ${stash.branch}` : 'Branch unknown';
    meta.textContent = `${origin} · ${new Date(stash.date).toLocaleString()} · Base ${stash.baseHash.slice(0, 7)}`;
    button.append(message, meta);
    button.addEventListener('click', () => void inspect(stash, button));
    item.append(button);
    return item;
  }

  async function refresh() {
    const token = ++loadToken;
    hideDetails();
    list.replaceChildren();
    let result;
    try {
      result = await api.listStashes();
    } catch (error) {
      result = { stashes: [], error: error.message };
    }
    if (token !== loadToken) {
      return;
    }
    panel.hidden = false;
    heading.textContent = `Stashes (${result.stashes.length})`;
    panel.open = result.stashes.length > 0 || Boolean(result.error);
    if (result.error) {
      status.textContent = result.error;
    } else if (result.stashes.length === 0) {
      status.textContent = 'This repository has no stashes.';
    } else {
      status.textContent = '';
    }
    list.append(...result.stashes.map(renderEntry));
  }

  return { refresh };
}
