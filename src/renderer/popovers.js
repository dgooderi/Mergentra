import { state } from './state.js';
import { summarizeCompactedRun } from './compaction.js';

export function closeGraphContextMenu() {
  document.getElementById('graph-context-menu')?.remove();
}

export function openGraphContextMenu(event, items) {
  event.preventDefault();
  closeGraphContextMenu();
  const menu = document.createElement('div');
  menu.id = 'graph-context-menu';
  menu.className = 'graph-context-menu';
  menu.setAttribute('role', 'menu');
  for (const { label, action } of items) {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.textContent = label;
    item.addEventListener('click', () => {
      closeGraphContextMenu();
      action();
    });
    menu.append(item);
  }
  document.body.append(menu);
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 4)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 4)}px`;
  menu.querySelector('button')?.focus();
}

export function closeCompactedPopover() {
  document.getElementById('compacted-popover')?.remove();
}

export function openCompactedPopover(summary, anchor, onSelect) {
  closeCompactedPopover();
  const popover = document.createElement('div');
  popover.id = 'compacted-popover';
  popover.className = 'compacted-popover';
  popover.dataset.testid = 'compacted-popover';
  popover.dataset.summaryHash = summary.hash;
  const anchorBox = anchor.getBoundingClientRect();
  popover.style.left = `${Math.min(Math.max(anchorBox.left + anchorBox.width / 2 - 150, 4), window.innerWidth - 310)}px`;
  popover.style.top = `${Math.min(anchorBox.bottom + 6, Math.max(window.innerHeight - 270, 4))}px`;
  const heading = document.createElement('p');
  heading.textContent = `${summary.compactedCommits.length} ordinary commits`;
  const aggregate = summarizeCompactedRun(summary.compactedCommits);
  const details = document.createElement('div');
  details.dataset.testid = 'compacted-run-summary';
  const addDetail = (testid, text) => {
    const line = document.createElement('p');
    line.dataset.testid = testid;
    line.textContent = text;
    details.append(line);
  };
  if (aggregate.firstTimestamp > 0) {
    const formatDate = (timestamp) => new Date(timestamp * 1000).toLocaleDateString();
    const first = formatDate(aggregate.firstTimestamp);
    const last = formatDate(aggregate.lastTimestamp);
    addDetail('compacted-date-span', first === last ? first : `${first} – ${last}`);
  }
  addDetail(
    'compacted-commit-kinds',
    `${aggregate.ordinaryCount} ordinary, ${aggregate.mergeCount} merge`
  );
  if (aggregate.authorCount > 0) {
    const shown = aggregate.authors.slice(0, 5).map((author) => author.name);
    if (aggregate.authorCount > shown.length) {
      shown.push(`…and ${aggregate.authorCount - shown.length} more`);
    }
    addDetail(
      'compacted-authors',
      `${aggregate.authorCount} ${aggregate.authorCount === 1 ? 'author' : 'authors'}: ${shown.join(', ')}`
    );
  }
  const list = document.createElement('ul');
  for (const commit of summary.compactedCommits) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.testid = 'compacted-commit-item';
    button.dataset.commitHash = commit.hash;
    button.setAttribute('aria-pressed', String(state.selectedCommit?.hash === commit.hash));
    const hash = document.createElement('code');
    hash.textContent = commit.hash.slice(0, 7);
    const subject = document.createElement('span');
    subject.textContent = commit.subject;
    button.append(hash, subject);
    button.addEventListener('click', () => {
      onSelect(state.selectedCommit?.hash === commit.hash ? null : commit);
    });
    item.append(button);
    list.append(item);
  }
  popover.append(heading, details, list);
  document.body.append(popover);
}
