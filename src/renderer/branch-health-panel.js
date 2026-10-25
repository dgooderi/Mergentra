import { state } from './state.js';
import { computeBranchHealth } from './branch-health.js';

const STATUS_LABELS = {
  diverged: 'Diverged',
  unrelated: 'No shared history',
  contained: 'Already in target',
  'same-commit': 'Same commit as target',
  target: 'Target'
};

let cachedReport = null;

function reportFor(graph, targetName) {
  if (cachedReport?.graph !== graph || cachedReport.targetName !== targetName) {
    cachedReport = { graph, targetName, report: computeBranchHealth(graph, targetName) };
  }
  return cachedReport.report;
}

function formatDate(timestamp) {
  return Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString().slice(0, 10) : '–';
}

function renderRow(row, targetName, revealCommit) {
  const item = document.createElement('li');
  item.dataset.testid = 'branch-health-row';
  item.dataset.branch = row.name;
  item.dataset.status = row.status;
  item.dataset.uncertain = String(row.uncertain);

  const name = document.createElement('strong');
  name.textContent = row.name;
  const status = document.createElement('small');
  status.textContent = STATUS_LABELS[row.status];
  item.append(name, status);

  if (row.explanation) {
    const explanation = document.createElement('small');
    explanation.dataset.testid = 'branch-health-explanation';
    explanation.textContent = row.explanation;
    item.append(explanation);
  }
  if (row.ahead !== null) {
    const counts = document.createElement('small');
    counts.dataset.testid = 'branch-health-counts';
    counts.textContent = `${row.ahead} ahead · ${row.behind} behind · last commit ${formatDate(row.lastCommitTimestamp)}`;
    item.append(counts);
  }
  if (row.divergenceHash) {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'secondary';
    link.dataset.testid = 'branch-health-divergence';
    link.textContent = `Divergence point (inferred): ${row.divergenceHash.slice(0, 7)}`;
    link.addEventListener('click', () => revealCommit(row.divergenceHash, [row.name, targetName]));
    item.append(link);
  }
  if (row.uncertain) {
    const warning = document.createElement('small');
    warning.dataset.testid = 'branch-health-uncertainty';
    warning.textContent = row.uncertainty;
    item.append(warning);
  }
  return item;
}

export function createBranchHealthPanel({ revealCommit }) {
  const panel = document.getElementById('branch-health-panel');
  const note = document.getElementById('branch-health-note');
  const list = document.getElementById('branch-health-list');

  function render() {
    if (!state.currentGraph || !panel.open) {
      return;
    }
    const report = reportFor(state.currentGraph, state.targetBranchName);
    list.replaceChildren(
      ...report.rows.map((row) => renderRow(row, report.targetName, revealCommit))
    );
    note.textContent = report.explanation ?? `Compared with ${report.targetName}.`;
  }

  panel.addEventListener('toggle', render);

  return {
    refresh() {
      panel.hidden = !state.currentGraph || state.currentGraph.commits.length === 0;
      render();
    }
  };
}
