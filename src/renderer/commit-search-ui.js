import { searchCommits } from './commit-search.js';
import { state } from './state.js';

const DEBOUNCE_MILLISECONDS = 150;

function statusText(outcome, query) {
  switch (outcome.status) {
    case 'invalid':
      return 'That search is too long. Use at most 200 characters.';
    case 'no-results':
      return `No commits match “${query.trim()}”.`;
    case 'results':
      return outcome.truncated
        ? `Showing the first ${outcome.results.length} matches. Refine your search to narrow them.`
        : `${outcome.results.length} ${outcome.results.length === 1 ? 'match' : 'matches'}`;
    default:
      return '';
  }
}

export function createCommitSearch({ onSelect }) {
  const input = document.getElementById('commit-search');
  const status = document.getElementById('commit-search-status');
  const list = document.getElementById('commit-search-results');
  let timer = null;
  let current = [];

  function renderResults(results) {
    list.replaceChildren();
    for (const commit of results) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      const hash = document.createElement('code');
      const subject = document.createElement('span');
      const detail = document.createElement('small');
      button.type = 'button';
      button.className = 'secondary';
      button.dataset.testid = 'commit-search-result';
      button.dataset.commitHash = commit.hash;
      button.setAttribute('aria-pressed', String(state.selectedCommit?.hash === commit.hash));
      hash.textContent = commit.hash.slice(0, 7);
      subject.textContent = commit.subject;
      detail.textContent = `${commit.author} · ${commit.authorDate.slice(0, 10)}`;
      button.append(hash, subject, detail);
      button.addEventListener('click', () => {
        onSelect(commit);
        list.hidden = true;
      });
      item.append(button);
      list.append(item);
    }
    list.hidden = results.length === 0;
  }

  function run() {
    const outcome = searchCommits(state.currentGraph?.commits ?? [], input.value);
    current = outcome.results;
    status.textContent = statusText(outcome, input.value);
    renderResults(current);
  }

  function clear() {
    window.clearTimeout(timer);
    input.value = '';
    run();
  }

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, DEBOUNCE_MILLISECONDS);
  });
  input.addEventListener('focus', () => {
    list.hidden = current.length === 0;
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && current.length > 0) {
      window.clearTimeout(timer);
      run();
      onSelect(current[0]);
      list.hidden = true;
    } else if (event.key === 'Escape' && (input.value !== '' || !list.hidden)) {
      event.stopPropagation();
      clear();
    }
  });

  return { clear };
}
