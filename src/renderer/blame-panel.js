import { annotateBlameRuns } from './blame-runs.js';

export function createBlamePanel({ getSelectedCommit, findCommit, selectCommit }) {
  const form = document.getElementById('blame-form');
  const pathInput = document.getElementById('blame-path');
  const status = document.getElementById('blame-status');
  const result = document.getElementById('blame-result');
  const caption = document.getElementById('blame-caption');
  const body = document.getElementById('blame-lines');
  let requestId = 0;

  function clear() {
    requestId += 1;
    status.hidden = true;
    status.textContent = '';
    result.hidden = true;
    caption.textContent = '';
    body.replaceChildren();
  }

  function showStatus(message) {
    status.textContent = message;
    status.hidden = false;
  }

  function cell(className, text) {
    const element = document.createElement('td');
    element.className = className;
    element.textContent = text;
    return element;
  }

  function commitCell(row) {
    const element = document.createElement('td');
    element.className = 'blame-commit';
    if (!row.startsRun) {
      return element;
    }
    const target = findCommit(row.commit);
    if (target) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'blame-commit-link';
      button.dataset.testid = 'blame-commit-link';
      button.dataset.commitHash = row.commit;
      button.title = `${row.summary} (${row.author}, ${row.date.slice(0, 10)})`;
      button.textContent = row.shortHash;
      button.addEventListener('click', () => selectCommit(target));
      element.append(button);
    } else {
      element.textContent = row.shortHash;
      element.title = 'This commit is not in the loaded graph.';
    }
    return element;
  }

  function render(revision, filePath, blame) {
    const rows = document.createDocumentFragment();
    for (const row of annotateBlameRuns(blame.lines)) {
      const tableRow = document.createElement('tr');
      tableRow.dataset.testid = 'blame-line';
      tableRow.className = row.startsRun ? 'blame-run-start' : '';
      tableRow.append(
        cell('blame-number', String(row.line)),
        commitCell(row),
        cell('blame-author', row.startsRun ? `${row.author} — ${row.summary}` : ''),
        cell('blame-text', row.text)
      );
      rows.append(tableRow);
    }
    body.replaceChildren(rows);
    caption.textContent = `${filePath} at ${revision.slice(0, 7)}`;
    result.hidden = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const commit = getSelectedCommit();
    const filePath = pathInput.value.trim();
    clear();
    if (!commit) {
      showStatus('Select a commit first.');
      return;
    }
    if (filePath === '') {
      showStatus('Enter the path of a file in the repository.');
      return;
    }
    const currentRequest = requestId;
    showStatus('Reading blame…');
    let blame;
    try {
      blame = await window.mergentra.blameFile(commit.hash, filePath);
    } catch (error) {
      blame = { status: 'error', message: error.message };
    }
    if (currentRequest !== requestId) {
      return;
    }
    if (blame.status !== 'ok') {
      showStatus(blame.message);
      return;
    }
    if (blame.incompleteHistory) {
      showStatus(blame.message);
    } else {
      status.hidden = true;
    }
    render(commit.hash, filePath, blame);
  });

  return { clear };
}
