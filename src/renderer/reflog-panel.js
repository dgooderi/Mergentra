import { state } from './state.js';
import { describeReflogEntry } from './reflog-entry.js';

const SHORT_HASH_LENGTH = 8;

export function createReflogPanel({ selectCommit }) {
  const panel = document.getElementById('reflog-panel');
  const referenceSelect = document.getElementById('reflog-reference');
  const status = document.getElementById('reflog-status');
  const list = document.getElementById('reflog-list');
  const detail = document.getElementById('reflog-detail');
  let loadCounter = 0;

  function showEntry(entry, description, button) {
    for (const other of list.querySelectorAll('button')) {
      other.setAttribute('aria-pressed', String(other === button));
    }
    document.getElementById('reflog-detail-selector').textContent = entry.selector;
    document.getElementById('reflog-detail-hash').textContent = entry.hash ?? 'None';
    document.getElementById('reflog-detail-message').textContent = entry.message;
    document.getElementById('reflog-detail-time').textContent = new Date(
      entry.timestamp * 1000
    ).toLocaleString();
    document.getElementById('reflog-detail-note').textContent = description.note;
    detail.dataset.state = description.state;
    detail.hidden = false;

    if (description.state !== 'in-graph') {
      return;
    }
    const commit = state.currentGraph.commits.find((candidate) => candidate.hash === entry.hash);
    selectCommit(commit);
    const node = [...document.querySelectorAll('[data-testid="commit-node"]')].find(
      (candidate) => candidate.getAttribute('data-commit-hash') === entry.hash
    );
    node?.scrollIntoView({ block: 'center', inline: 'center' });
  }

  function render(result) {
    const graphHashes = new Set(state.currentGraph.commits.map((commit) => commit.hash));
    list.replaceChildren();
    detail.hidden = true;
    document.getElementById('reflog-heading').textContent = `Reflog (${result.entries.length}${
      result.truncated ? '+' : ''
    })`;
    if (result.entries.length === 0) {
      status.textContent =
        'Git has no reflog entries for this reference. A reflog is only kept for references updated in this repository, and Git removes old entries over time.';
      return;
    }
    status.textContent = result.truncated
      ? `Showing the ${result.entries.length} most recent entries. Older entries are not shown.`
      : 'Entries older than Git keeps them for have expired and are not listed.';
    for (const entry of result.entries) {
      const description = describeReflogEntry(entry, graphHashes);
      const item = document.createElement('li');
      const button = document.createElement('button');
      const summary = document.createElement('span');
      const meta = document.createElement('small');
      button.type = 'button';
      button.dataset.testid = 'reflog-entry';
      button.dataset.selector = entry.selector;
      button.dataset.hash = entry.hash ?? '';
      button.dataset.state = description.state;
      button.setAttribute('aria-pressed', 'false');
      summary.textContent = `${entry.selector} · ${entry.message}`;
      meta.textContent = `${entry.hash ? entry.hash.slice(0, SHORT_HASH_LENGTH) : 'no commit'} · ${new Date(
        entry.timestamp * 1000
      ).toLocaleString()}${description.state === 'unavailable' ? ' · object unavailable' : ''}`;
      button.append(summary, meta);
      button.addEventListener('click', () => showEntry(entry, description, button));
      item.append(button);
      list.append(item);
    }
  }

  async function load() {
    const requestId = ++loadCounter;
    status.textContent = 'Reading reflog…';
    list.replaceChildren();
    detail.hidden = true;
    try {
      const result = await window.mergentra.readReflog(referenceSelect.value);
      if (requestId === loadCounter) {
        render(result);
      }
    } catch (error) {
      if (requestId === loadCounter) {
        status.textContent = `The reflog could not be read: ${error.message}`;
      }
    }
  }

  function reset(graph) {
    const previous = referenceSelect.value;
    const names = ['HEAD', ...graph.references.filter((r) => !r.remote).map((r) => r.name)];
    referenceSelect.replaceChildren(
      ...names.map((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        return option;
      })
    );
    referenceSelect.value = names.includes(previous) ? previous : 'HEAD';
    list.replaceChildren();
    detail.hidden = true;
    status.textContent = '';
    document.getElementById('reflog-heading').textContent = 'Reflog';
    if (panel.open) {
      void load();
    }
  }

  return {
    init() {
      panel.addEventListener('toggle', () => {
        if (panel.open) {
          void load();
        }
      });
      referenceSelect.addEventListener('change', () => void load());
    },
    reset
  };
}
