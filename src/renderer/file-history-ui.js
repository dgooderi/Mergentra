import { state } from './state.js';
import { summarizeFileHistory } from './file-history.js';

export function createFileHistoryPanel({ renderFilteredGraph, selectCommit }) {
  const form = document.getElementById('file-history-form');
  const input = document.getElementById('file-history-path');
  const status = document.getElementById('file-history-status');
  const list = document.getElementById('file-history-list');
  const clearButton = document.getElementById('file-history-clear');

  function clear({ redraw = true } = {}) {
    const wasActive = state.fileHistoryHashes !== null;
    state.fileHistoryHashes = null;
    input.value = '';
    status.textContent = '';
    list.replaceChildren();
    list.hidden = true;
    clearButton.hidden = true;
    if (wasActive && redraw) {
      renderFilteredGraph();
    }
  }

  function showSummary(summary, result) {
    const lines = [...summary.notes];
    if (summary.matches.length > 0) {
      const count = summary.matches.length;
      lines.unshift(`${count} ${count === 1 ? 'commit' : 'commits'} changed "${result.path}".`);
    }
    status.textContent = lines.join(' ');
    list.replaceChildren();
    for (const commit of summary.matches) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary';
      button.dataset.testid = 'file-history-commit';
      button.dataset.commitHash = commit.hash;
      button.textContent = `${commit.hash.slice(0, 7)} ${commit.subject}`;
      button.addEventListener('click', () => selectCommit(commit));
      item.append(button);
      list.append(item);
    }
    list.hidden = summary.matches.length === 0;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (input.value.trim() === '') {
      clear();
      return;
    }
    status.textContent = 'Reading file history…';
    try {
      const result = await window.mergentra.getFileHistory(input.value);
      state.fileHistoryHashes = new Set(result.hashes);
      showSummary(summarizeFileHistory(state.currentGraph.commits, result), result);
      clearButton.hidden = false;
      renderFilteredGraph();
    } catch (error) {
      status.textContent = error.message.replace(
        /^Error invoking remote method '[^']+': (Error: )?/,
        ''
      );
    }
  });
  clearButton.addEventListener('click', clear);

  return { reset: () => clear({ redraw: false }) };
}
