import { compareReleaseVersions, parseReleaseVersion } from './renderer/release-version.js';
import { compactOrdinaryHistory, compactSameLaneRuns } from './renderer/compaction.js';
import { buildFilteredGraph, computeAvailableReferences } from './renderer/lanes.js';
import { computeGraphLayout } from './renderer/layout.js';
import {
  appendDefinitions,
  createSvgElement,
  drawCheckedOutMarker,
  drawCommits,
  drawCutMarkers,
  drawDetachedHeadMarker,
  drawDivergenceMarkers,
  drawEdges,
  drawHistoryBoundaries,
  renderTimeAxis
} from './renderer/graph-view.js';
import { state } from './renderer/state.js';
import { createViewStorage } from './renderer/view-storage.js';
import { getPresetRange, localDateString } from './renderer/time-range.js';
const picker = document.getElementById('repository-picker');
const form = document.getElementById('repository-form');
const pathInput = document.getElementById('repository-path');
const gitPathInput = document.getElementById('git-executable-path');
const statusMessage = document.getElementById('status');
const repositoryView = document.getElementById('repository-view');
const viewStorage = createViewStorage(localStorage);
const ZOOM_STEPS = [0.25, 0.4, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];

function applyDisplayOptions() {
  const graphElement = document.getElementById('commit-graph');
  graphElement.dataset.showTags = String(state.displayOptions.tags);
  graphElement.dataset.showHashes = String(state.displayOptions.hashes);
  graphElement.dataset.showReleases = String(state.displayOptions.releases);
  document.getElementById('show-tags').checked = state.displayOptions.tags;
  document.getElementById('show-hashes').checked = state.displayOptions.hashes;
  document.getElementById('show-releases').checked = state.displayOptions.releases;
}

function closeGraphContextMenu() {
  document.getElementById('graph-context-menu')?.remove();
}

function openGraphContextMenu(event, items) {
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

function focusOnCommit(commit, position) {
  selectCommit(commit);
  const scroller = document.getElementById('commit-graph').parentElement;
  scroller.scrollTo({
    left: Math.max(position.x - scroller.clientWidth / 2, 0),
    top: Math.max(position.y - scroller.clientHeight / 2, 0),
    behavior: 'smooth'
  });
}

function closeCompactedPopover() {
  document.getElementById('compacted-popover')?.remove();
}

function openCompactedPopover(summary, anchor) {
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
      selectCommit(state.selectedCommit?.hash === commit.hash ? null : commit);
    });
    item.append(button);
    list.append(item);
  }
  popover.append(heading, list);
  document.body.append(popover);
}

function loadNotes() {
  state.notes = viewStorage.loadNotes(state.currentRepositoryPath);
}

function setNote(kind, key, text) {
  if (text.trim() === '') {
    delete state.notes[kind][key];
  } else {
    state.notes[kind][key] = text;
  }
  viewStorage.saveNotes(state.currentRepositoryPath, state.notes);
  refreshNoteMarkers();
}

function refreshNoteMarkers() {
  for (const node of document.querySelectorAll('[data-testid="commit-node"]')) {
    const refNames = JSON.parse(node.dataset.refNames || '[]');
    const hasNote =
      Object.hasOwn(state.notes.commits, node.dataset.commitHash) ||
      refNames.some((name) => Object.hasOwn(state.notes.branches, name));
    node.dataset.hasNote = String(hasNote);
  }
  for (const lane of document.querySelectorAll('#reference-lanes li')) {
    const hasNote = Object.hasOwn(state.notes.branches, lane.dataset.refName);
    lane.dataset.hasNote = String(hasNote);
    lane.querySelector('[data-testid="branch-note-toggle"]').textContent = hasNote
      ? 'Note ✎'
      : 'Note';
  }
  renderSelectedBranchNotes();
}

function renderSelectedBranchNotes() {
  const list = document.getElementById('selected-commit-branch-notes');
  list.replaceChildren();
  const names = (state.selectedCommit?.references || []).filter((name) =>
    Object.hasOwn(state.notes.branches, name)
  );
  for (const name of names) {
    const item = document.createElement('li');
    item.textContent = `${name}: ${state.notes.branches[name]}`;
    list.append(item);
  }
  document.getElementById('selected-commit-branch-notes-heading').hidden = names.length === 0;
  list.parentElement.hidden = names.length === 0;
}

function setStatus(message) {
  statusMessage.textContent = message;
}

async function openRepository(repositoryPath, triggerButton) {
  const progress = document.getElementById('repository-progress');
  const openButton = form.querySelector('button[type="submit"]');
  const buttons = new Set([openButton, triggerButton].filter(Boolean));
  for (const button of buttons) {
    button.disabled = true;
  }
  setStatus('');
  progress.textContent = 'Loading repository history…';

  try {
    showRepository(await window.gitScope.openRepository(repositoryPath));
    progress.textContent = '';
  } catch (error) {
    progress.textContent = '';
    setStatus(error.message);
  } finally {
    for (const button of buttons) {
      button.disabled = false;
    }
  }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const toggle = document.getElementById('theme-toggle');
  toggle.dataset.themeTarget = theme === 'dark' ? 'light' : 'dark';
  toggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
}

function renderRecentRepositories(repositories) {
  const list = document.getElementById('recent-repositories');
  list.replaceChildren();

  if (repositories.length === 0) {
    const emptyState = document.createElement('li');
    emptyState.className = 'empty-recent';
    emptyState.textContent = 'Repositories you open will appear here.';
    list.append(emptyState);
    return;
  }

  for (const repository of repositories) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const name = document.createElement('span');
    const repositoryNote = viewStorage.readRepositoryNote(repository.path);
    button.className = 'recent-repository';
    button.type = 'button';
    name.textContent = repository.name;
    button.title = repository.path;
    button.append(name);
    if (repositoryNote) {
      const note = document.createElement('small');
      note.textContent = repositoryNote;
      button.append(note);
    }
    button.addEventListener('click', () => {
      openRepository(repository.path, button);
    });
    item.append(button);
    list.append(item);
  }
}

async function loadPickerSettings() {
  try {
    const [gitPath, recentRepositories] = await Promise.all([
      window.gitScope.getGitPath(),
      window.gitScope.getRecentRepositories()
    ]);
    gitPathInput.value = gitPath;
    renderRecentRepositories(recentRepositories);
  } catch (error) {
    setStatus(error.message);
  }
}

loadPickerSettings();

function loadViewState() {
  return viewStorage.loadViewState(state.currentRepositoryPath);
}

function setZoom(level, anchor) {
  const graphElement = document.getElementById('commit-graph');
  const scroller = graphElement.parentElement;
  const previous = state.zoomLevel;
  state.zoomLevel = Math.min(Math.max(level, ZOOM_STEPS[0]), ZOOM_STEPS[ZOOM_STEPS.length - 1]);
  document.getElementById('zoom-reset').textContent = `${Math.round(state.zoomLevel * 100)}%`;
  document.getElementById('zoom-in').disabled =
    state.zoomLevel >= ZOOM_STEPS[ZOOM_STEPS.length - 1];
  document.getElementById('zoom-out').disabled = state.zoomLevel <= ZOOM_STEPS[0];
  const baseWidth = Number(graphElement.dataset.baseWidth);
  if (!baseWidth || previous === state.zoomLevel) {
    return;
  }
  // Keep the point under the cursor (or the view centre) in place while zooming.
  const box = scroller.getBoundingClientRect();
  const anchorX = anchor ? anchor.x - box.left : scroller.clientWidth / 2;
  const anchorY = anchor ? anchor.y - box.top : scroller.clientHeight / 2;
  const contentX = (scroller.scrollLeft + anchorX) / previous;
  const contentY = (scroller.scrollTop + anchorY) / previous;
  graphElement.setAttribute('width', String(Math.round(baseWidth * state.zoomLevel)));
  graphElement.setAttribute(
    'height',
    String(Math.round(Number(graphElement.dataset.baseHeight) * state.zoomLevel))
  );
  scroller.scrollLeft = contentX * state.zoomLevel - anchorX;
  scroller.scrollTop = contentY * state.zoomLevel - anchorY;
}

function stepZoom(direction, anchor) {
  const index = ZOOM_STEPS.findIndex((step) => step >= state.zoomLevel - 0.001);
  const next = Math.min(Math.max(index + direction, 0), ZOOM_STEPS.length - 1);
  setZoom(ZOOM_STEPS[next], anchor);
}

document.getElementById('zoom-in').addEventListener('click', () => stepZoom(1));
document.getElementById('zoom-out').addEventListener('click', () => stepZoom(-1));
document.getElementById('zoom-reset').addEventListener('click', () => setZoom(1));

function saveViewState() {
  if (!state.currentRepositoryPath || !state.currentGraph) {
    return;
  }
  const hidden = state.currentGraph.references
    .filter((reference) => !state.visibleReferences.has(reference.name))
    .map((reference) => reference.name);
  viewStorage.saveViewState(state.currentRepositoryPath, {
    hidden,
    preset: state.selectedTimePreset,
    display: state.displayOptions,
    custom: state.selectedTimePreset === 'custom' ? state.customRangeValues : null,
    range: state.rangeAdjusted && state.timeRange ? state.timeRange : null
  });
}

function showRepository(repository) {
  state.currentRepositoryPath = repository.path;
  loadNotes();
  document.getElementById('repository-name').textContent = repository.name;
  document.getElementById('repository-path-value').textContent = repository.path;
  document.getElementById('branch-name').textContent = repository.branch;
  document.getElementById('repository-note').value = viewStorage.readRepositoryNote(
    repository.path
  );
  renderGraph(repository.graph);
  picker.hidden = true;
  repositoryView.hidden = false;
}

const LARGE_HISTORY_COMMITS = 100000;

function renderGraph(graph) {
  state.currentGraph = graph;
  state.selectedCommit = null;
  const saved = loadViewState();
  state.displayOptions = { tags: true, hashes: true, releases: true, ...(saved?.display || {}) };
  applyDisplayOptions();
  const hidden = new Set(saved?.hidden || []);
  state.visibleReferences = new Set(
    graph.references
      .filter((reference) => !hidden.has(reference.name))
      .map((reference) => reference.name)
  );
  state.selectedTimePreset = 'all';
  state.timeRange = null;
  state.customRangeValues = null;
  const startInput = document.getElementById('time-range-start');
  const endInput = document.getElementById('time-range-end');
  startInput.value = '';
  endInput.value = '';
  if (saved?.preset === 'custom' && saved.custom) {
    const start = new Date(`${saved.custom.start}T00:00:00`);
    const end = new Date(`${saved.custom.end}T00:00:00`);
    if (Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())) {
      end.setDate(end.getDate() + 1);
      state.selectedTimePreset = 'custom';
      state.timeRange = { start: start.getTime(), end: end.getTime() };
      state.customRangeValues = saved.custom;
      startInput.value = saved.custom.start;
      endInput.value = saved.custom.end;
    }
  } else if (saved && getPresetRange(saved.preset, new Date())) {
    state.selectedTimePreset = saved.preset;
    state.timeRange = getPresetRange(saved.preset, new Date());
  } else if (!saved && graph.commits.length > LARGE_HISTORY_COMMITS) {
    // Drawing every commit of a very large history freezes the window, so start with recent work.
    state.selectedTimePreset = '1w';
    state.timeRange = getPresetRange('1w', new Date());
  }
  state.rangeAdjusted = false;
  if (
    state.timeRange &&
    Number.isFinite(saved?.range?.start) &&
    Number.isFinite(saved?.range?.end) &&
    saved.range.end > saved.range.start
  ) {
    state.timeRange = { start: saved.range.start, end: saved.range.end };
    state.rangeAdjusted = true;
    if (state.selectedTimePreset === 'custom') {
      syncCustomInputsToRange();
    }
  }
  state.ownerFilter = '';
  document.getElementById('time-range').value = state.selectedTimePreset;
  document.getElementById('custom-time-range').hidden = state.selectedTimePreset !== 'custom';
  document.getElementById('time-range-status').textContent = '';
  document.getElementById('review-dock').hidden = true;
  renderWorktrees(graph.worktrees);
  renderReferenceLanes(graph.references);
  renderFilteredGraph();
}

function refreshRepositoryGraph(repository) {
  document.getElementById('branch-name').textContent = repository.branch;
  const previouslyVisible = state.visibleReferences;
  state.currentGraph = repository.graph;
  state.visibleReferences = new Set(
    state.currentGraph.references
      .filter((reference) => previouslyVisible.has(reference.name))
      .map((reference) => reference.name)
  );
  for (const reference of state.currentGraph.references) {
    if (!previouslyVisible.has(reference.name)) {
      state.visibleReferences.add(reference.name);
    }
  }
  renderWorktrees(state.currentGraph.worktrees);
  renderReferenceLanes(state.currentGraph.references);
  renderFilteredGraph();
}

function renderFilteredGraph() {
  if (!state.currentGraph) {
    return;
  }
  state.availableReferenceNames = computeAvailableReferences(state.currentGraph, state.timeRange);
  updateTimeNavigation();
  updateBranchPickerSummary();
  filterBranchPicker();

  const graph = buildFilteredGraph(state.currentGraph, state.visibleReferences, state.timeRange);
  const displayGraph = compactSameLaneRuns(compactOrdinaryHistory(graph));
  renderGraphContents(displayGraph);
  refreshNoteMarkers();
  if (state.selectedCommit) {
    const updatedSelection =
      displayGraph.commits.find((commit) => commit.hash === state.selectedCommit.hash) ||
      displayGraph.commits
        .flatMap((commit) => commit.compactedCommits || [])
        .find((commit) => commit.hash === state.selectedCommit.hash);
    selectCommit(updatedSelection || null);
  }
}

function syncCustomInputsToRange() {
  state.customRangeValues = {
    start: localDateString(state.timeRange.start),
    end: localDateString(state.timeRange.end - 1)
  };
  document.getElementById('time-range-start').value = state.customRangeValues.start;
  document.getElementById('time-range-end').value = state.customRangeValues.end;
}

function setAdjustedRange(start, end) {
  state.timeRange = { start, end };
  state.rangeAdjusted = true;
  if (state.selectedTimePreset === 'custom') {
    syncCustomInputsToRange();
  }
  saveViewState();
  renderFilteredGraph();
}

function shiftTimeRange(direction) {
  if (!state.timeRange) {
    return;
  }
  const span = state.timeRange.end - state.timeRange.start;
  let start = state.timeRange.start + direction * span;
  // The range cannot move past the present.
  start = Math.min(start, Date.now() - span);
  setAdjustedRange(start, start + span);
}

function centreTimeRangeOnSelection() {
  if (!state.timeRange || !state.selectedCommit?.committerTimestamp) {
    return;
  }
  const span = state.timeRange.end - state.timeRange.start;
  const middle = state.selectedCommit.committerTimestamp * 1000;
  setAdjustedRange(middle - span / 2, middle + span / 2);
  const node = document.querySelector(`[data-commit-hash="${state.selectedCommit.hash}"]`);
  node?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function updateTimeNavigation() {
  const hasRange = Boolean(state.timeRange);
  document.getElementById('time-earlier').disabled = !hasRange;
  document.getElementById('time-later').disabled = !hasRange || state.timeRange.end >= Date.now();
  document.getElementById('time-centre').disabled =
    !hasRange || !state.selectedCommit?.committerTimestamp;
}

document.getElementById('time-earlier').addEventListener('click', () => shiftTimeRange(-1));
document.getElementById('time-later').addEventListener('click', () => shiftTimeRange(1));
document.getElementById('time-centre').addEventListener('click', centreTimeRangeOnSelection);

function applyCustomTimeRange() {
  const startValue = document.getElementById('time-range-start').value;
  const endValue = document.getElementById('time-range-end').value;
  const status = document.getElementById('time-range-status');
  const startDate = new Date(`${startValue}T00:00:00`);
  const endDate = new Date(`${endValue}T00:00:00`);

  if (
    !startValue ||
    !endValue ||
    !Number.isFinite(startDate.getTime()) ||
    !Number.isFinite(endDate.getTime())
  ) {
    status.textContent = 'Choose a valid start and end date.';
    return;
  }
  if (endDate < startDate) {
    status.textContent = 'The end date must be on or after the start date.';
    return;
  }

  endDate.setDate(endDate.getDate() + 1);
  state.timeRange = { start: startDate.getTime(), end: endDate.getTime() };
  state.selectedTimePreset = 'custom';
  state.customRangeValues = { start: startValue, end: endValue };
  state.rangeAdjusted = false;
  saveViewState();
  status.textContent = '';
  renderFilteredGraph();
}

document.getElementById('time-range').addEventListener('change', (event) => {
  state.selectedTimePreset = event.target.value;
  const customRange = document.getElementById('custom-time-range');
  const status = document.getElementById('time-range-status');
  status.textContent = '';

  if (state.selectedTimePreset === 'custom') {
    customRange.hidden = false;
    return;
  }

  customRange.hidden = true;
  state.rangeAdjusted = false;
  state.timeRange = getPresetRange(state.selectedTimePreset, new Date());
  if (state.timeRange && state.selectedCommit?.committerTimestamp) {
    // Keep the selected commit in the middle of the new range.
    const half = (state.timeRange.end - state.timeRange.start) / 2;
    const middle = state.selectedCommit.committerTimestamp * 1000;
    state.timeRange = { start: middle - half, end: middle + half };
    state.rangeAdjusted = true;
  }
  saveViewState();
  renderFilteredGraph();
  if (state.rangeAdjusted) {
    document
      .querySelector(`[data-commit-hash="${state.selectedCommit.hash}"]`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
});

document.getElementById('custom-time-range').addEventListener('submit', (event) => {
  event.preventDefault();
  applyCustomTimeRange();
});

function renderReferenceLanes(references) {
  const laneList = document.getElementById('reference-lanes');
  laneList.replaceChildren();

  for (const reference of references) {
    const lane = document.createElement('li');
    const checkbox = document.createElement('input');
    const marker = createSvgElement('svg', {
      viewBox: '0 0 28 16',
      'aria-hidden': 'true'
    });
    const line = createSvgElement('line', {
      'data-testid': 'reference-lane-style',
      x1: 1,
      y1: 8,
      x2: 27,
      y2: 8,
      stroke: reference.color,
      'stroke-width': 3
    });
    const label = document.createElement('span');
    const labelGroup = document.createElement('div');

    lane.dataset.testid = 'reference-lane';
    lane.dataset.refName = reference.name;
    lane.dataset.remote = String(reference.remote);
    lane.dataset.checkedOut = String(reference.checkedOut);
    lane.dataset.color = reference.color;
    lane.dataset.laneIndex = String(reference.lane);
    lane.dataset.targetHash = reference.hash;
    checkbox.type = 'checkbox';
    checkbox.checked = state.visibleReferences.has(reference.name);
    checkbox.setAttribute('aria-label', reference.name);
    checkbox.dataset.testid = 'reference-filter';
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        state.visibleReferences.add(reference.name);
      } else {
        state.visibleReferences.delete(reference.name);
      }
      saveViewState();
      updateBranchPickerSummary();
      renderFilteredGraph();
    });
    marker.append(line);
    if (reference.remote) {
      line.setAttribute('stroke-dasharray', '6 4');
    }
    label.textContent = reference.name;
    labelGroup.className = 'reference-label';
    labelGroup.append(label);
    if (reference.checkedOut) {
      const checkedOutLabel = document.createElement('small');
      checkedOutLabel.className = 'checked-out-label';
      checkedOutLabel.dataset.testid = 'checked-out-label';
      checkedOutLabel.textContent = 'Checked out';
      labelGroup.append(checkedOutLabel);
    }
    if (reference.worktreePath) {
      const worktreeLocation = document.createElement('small');
      worktreeLocation.dataset.testid = 'reference-worktree';
      worktreeLocation.textContent = reference.worktreePath;
      labelGroup.append(worktreeLocation);
    }
    const noteToggle = document.createElement('button');
    const noteEditor = document.createElement('textarea');
    noteToggle.type = 'button';
    noteToggle.className = 'note-toggle secondary';
    noteToggle.dataset.testid = 'branch-note-toggle';
    noteToggle.setAttribute('aria-label', `Note for ${reference.name}`);
    noteToggle.textContent = Object.hasOwn(state.notes.branches, reference.name)
      ? 'Note ✎'
      : 'Note';
    noteEditor.hidden = true;
    noteEditor.rows = 2;
    noteEditor.className = 'note-editor';
    noteEditor.dataset.testid = 'branch-note-input';
    noteEditor.placeholder = 'Private note about this branch';
    noteEditor.setAttribute('aria-label', `Note text for ${reference.name}`);
    noteEditor.value = state.notes.branches[reference.name] || '';
    noteToggle.addEventListener('click', () => {
      noteEditor.hidden = !noteEditor.hidden;
      if (!noteEditor.hidden) {
        noteEditor.focus();
      }
    });
    noteEditor.addEventListener('input', () =>
      setNote('branches', reference.name, noteEditor.value)
    );
    lane.dataset.hasNote = String(Object.hasOwn(state.notes.branches, reference.name));
    lane.append(checkbox, marker, labelGroup, noteToggle, noteEditor);
    laneList.append(lane);
  }
  renderOwnerFilter();
  filterBranchPicker();
  updateBranchPickerSummary();
}

const ownerCache = new WeakMap();

// Owners are computed once per loaded graph; scanning every commit per branch is far too slow on large repositories.
function ownersForGraph() {
  let owners = ownerCache.get(state.currentGraph);
  if (!owners) {
    const tips = new Set(state.currentGraph.references.map((reference) => reference.hash));
    const authorByTip = new Map();
    for (const commit of state.currentGraph.commits) {
      if (tips.has(commit.hash)) {
        authorByTip.set(commit.hash, commit.author || '');
      }
    }
    owners = new Map();
    for (const reference of state.currentGraph.references) {
      const author = (authorByTip.get(reference.hash) || '').replace(/\s*<[^>]*>$/, '').trim();
      // The same person often commits under several emails or capitalisations, so owners are
      // matched by name without regard to case.
      owners.set(reference.name, author.replace(/\s+/g, ' ').toLowerCase());
    }
    ownerCache.set(state.currentGraph, owners);
  }
  return owners;
}

function referenceOwner(reference) {
  return ownersForGraph().get(reference.name) || '';
}

function renderOwnerFilter() {
  const select = document.getElementById('branch-owner-filter');
  const displayNames = new Map();
  for (const reference of state.currentGraph.references) {
    const owner = referenceOwner(reference);
    if (owner !== '' && !displayNames.has(owner)) {
      displayNames.set(
        owner,
        owner.replace(/(^|\s)\S/g, (match) => match.toUpperCase())
      );
    }
  }
  const owners = [...displayNames.keys()].sort((left, right) => left.localeCompare(right));
  select.replaceChildren(new Option('All owners', ''));
  for (const owner of owners) {
    select.append(new Option(displayNames.get(owner), owner));
  }
  if (!owners.includes(state.ownerFilter)) {
    state.ownerFilter = '';
  }
  select.value = state.ownerFilter;
}

document.getElementById('branch-owner-filter').addEventListener('change', (event) => {
  const owner = event.target.value;
  // Owner is the author of a branch's latest commit.
  setVisibleBranches((reference) => owner === '' || referenceOwner(reference) === owner);
  state.ownerFilter = owner;
  event.target.value = owner;
});

function updateBranchPickerSummary() {
  const total = state.currentGraph
    ? state.availableReferenceNames
      ? state.availableReferenceNames.size
      : state.currentGraph.references.length
    : 0;
  const shown = state.availableReferenceNames
    ? [...state.visibleReferences].filter((name) => state.availableReferenceNames.has(name)).length
    : state.visibleReferences.size;
  document.getElementById('branch-picker-summary').textContent =
    `Branches: ${shown} of ${total} shown`;
}

function filterBranchPicker() {
  const query = document.getElementById('branch-picker-search').value.trim().toLowerCase();
  for (const lane of document.getElementById('reference-lanes').children) {
    lane.hidden =
      (query !== '' && !lane.dataset.refName.toLowerCase().includes(query)) ||
      (state.availableReferenceNames !== null &&
        !state.availableReferenceNames.has(lane.dataset.refName));
  }
}

function setVisibleBranches(predicate) {
  state.ownerFilter = '';
  state.visibleReferences = new Set(
    state.currentGraph.references.filter(predicate).map((reference) => reference.name)
  );
  saveViewState();
  renderReferenceLanes(state.currentGraph.references);
  renderFilteredGraph();
}

document.getElementById('commit-graph').addEventListener('click', (event) => {
  if (event.shiftKey && !event.target.closest('[data-testid="commit-node"]')) {
    // Shift+click zooms in on the clicked point; Shift+Alt+click zooms out.
    stepZoom(event.altKey ? -1 : 1, { x: event.clientX, y: event.clientY });
    return;
  }
  if (
    !event.target.closest('[data-testid="commit-node"], [data-testid="compacted-commit-count"]')
  ) {
    selectCommit(null);
    closeCompactedPopover();
  }
});
document.querySelector('.graph-scroll').addEventListener('scroll', closeCompactedPopover);
document.addEventListener('click', (event) => {
  if (
    !event.target.closest(
      '#compacted-popover, [data-testid="compacted-commit-count"], #commit-graph'
    )
  ) {
    closeCompactedPopover();
  }
});
for (const [id, key] of [
  ['show-tags', 'tags'],
  ['show-hashes', 'hashes'],
  ['show-releases', 'releases']
]) {
  document.getElementById(id).addEventListener('change', (event) => {
    state.displayOptions[key] = event.target.checked;
    applyDisplayOptions();
    saveViewState();
  });
}
document.getElementById('branch-picker-search').addEventListener('input', filterBranchPicker);
document
  .getElementById('branch-picker-all')
  .addEventListener('click', () => setVisibleBranches(() => true));
document
  .getElementById('branch-picker-local')
  .addEventListener('click', () => setVisibleBranches((reference) => !reference.remote));
document
  .getElementById('branch-picker-none')
  .addEventListener('click', () => setVisibleBranches(() => false));
document.addEventListener('click', (event) => {
  const picker = document.getElementById('branch-picker');
  if (picker.open && !picker.contains(event.target)) {
    picker.open = false;
  }
});
document.addEventListener('click', closeGraphContextMenu);
window.addEventListener('blur', closeGraphContextMenu);
document.addEventListener('keydown', (event) => {
  const picker = document.getElementById('branch-picker');
  if (event.key === 'Escape' && document.getElementById('graph-context-menu')) {
    closeGraphContextMenu();
  } else if (event.key === 'Escape' && picker.open) {
    picker.open = false;
    picker.querySelector('summary').focus();
  } else if (event.key === 'Escape' && document.getElementById('compacted-popover')) {
    closeCompactedPopover();
  } else if (
    event.key === 'Escape' &&
    state.selectedCommit &&
    event.target.tagName !== 'TEXTAREA'
  ) {
    selectCommit(null);
  }
});

function renderWorktrees(worktrees) {
  const worktreeList = document.getElementById('worktree-list');
  worktreeList.replaceChildren();
  const worktreePanel = document.getElementById('worktrees-panel');
  worktreePanel.hidden = worktrees.length < 2;
  worktreePanel.open = worktrees.length > 1;
  document.getElementById('worktrees-heading').textContent = `Worktrees (${worktrees.length})`;

  for (const worktree of worktrees) {
    const item = document.createElement('li');
    const location = document.createElement('span');
    const branch = document.createElement('small');
    item.dataset.testid = 'worktree';
    item.dataset.path = worktree.path;
    item.dataset.branch = worktree.branch || '';
    item.dataset.detached = String(worktree.detached);
    item.dataset.current = String(worktree.current);
    location.textContent = worktree.path;
    const checkoutState = worktree.current ? 'Current worktree' : 'Linked worktree';
    branch.textContent = worktree.branch
      ? `${checkoutState} · Branch: ${worktree.branch}`
      : `${checkoutState} · ${worktree.detached ? 'Detached HEAD' : 'No branch checked out'}`;
    item.append(location, branch);
    worktreeList.append(item);
  }
}

const graphActions = {
  getNotes: () => state.notes,
  getSelectedCommit: () => state.selectedCommit,
  selectCommit: (commit) => selectCommit(commit),
  focusOnCommit,
  openGraphContextMenu,
  openCompactedPopover,
  registerCompactedMember: (hash, summaryHash) => state.compactedMembership.set(hash, summaryHash)
};

function renderGraphContents(graph) {
  const graphElement = document.getElementById('commit-graph');
  const emptyMessage = document.getElementById('graph-empty');
  graphElement.replaceChildren();
  closeCompactedPopover();
  state.compactedMembership = new Map();
  applyDisplayOptions();

  const ownerReference = (lane) => graph.references[graph.sideLanes?.get(lane) ?? lane];
  const { axisHeight, indexByHash, cutMarkersByHash, commitPositions, width, height } =
    computeGraphLayout(graph);
  graphElement.dataset.baseWidth = String(width);
  graphElement.dataset.baseHeight = String(height);
  graphElement.setAttribute('width', String(Math.round(width * state.zoomLevel)));
  graphElement.setAttribute('height', String(Math.round(height * state.zoomLevel)));
  graphElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
  graphElement.dataset.order = graph.order;
  graphElement.dataset.referenceCount = String(graph.references.length);
  graphElement.dataset.timeRangeStart = state.timeRange ? String(state.timeRange.start) : '';
  graphElement.dataset.timeRangeEnd = state.timeRange ? String(state.timeRange.end) : '';
  const ctx = {
    graph,
    graphElement,
    definitions: appendDefinitions(graphElement),
    commitPositions,
    indexByHash,
    cutMarkersByHash,
    ownerReference
  };
  renderTimeAxis(graphElement, graph.commits, commitPositions, width, axisHeight);
  drawEdges(ctx, graphActions);
  drawCommits(ctx, graphActions);
  drawCheckedOutMarker(ctx);
  drawDetachedHeadMarker(ctx);
  drawHistoryBoundaries(ctx);
  drawDivergenceMarkers(ctx);
  drawCutMarkers(ctx);

  emptyMessage.hidden = graph.commits.length > 0;
  if (graph.commits.length > 0) {
    emptyMessage.textContent = '';
  } else if (state.currentGraph.commits.length === 0) {
    emptyMessage.textContent =
      'No commits yet. The commit graph will appear after the first commit.';
  } else if (state.visibleReferences.size === 0) {
    emptyMessage.textContent = 'No references selected. Select a reference to show its history.';
  } else if (state.timeRange) {
    emptyMessage.textContent =
      'No commits in this time range. Choose a different range or select All history.';
  } else {
    emptyMessage.textContent = 'No commits are reachable from the selected references.';
  }
}

function selectCommit(commit) {
  state.selectedCommit = commit;
  updateTimeNavigation();
  const hash = commit?.hash;
  const dock = document.getElementById('review-dock');
  const commitNodes = document.querySelectorAll('[data-testid="commit-node"]');
  for (const node of commitNodes) {
    node.setAttribute('aria-pressed', String(node.getAttribute('data-commit-hash') === hash));
  }
  const memberSummary = hash ? state.compactedMembership.get(hash) : null;
  for (const summaryNode of document.querySelectorAll('[data-testid="compacted-commit-count"]')) {
    summaryNode.setAttribute(
      'aria-pressed',
      String(Boolean(memberSummary) && summaryNode.dataset.summaryHash === memberSummary)
    );
  }
  for (const item of document.querySelectorAll('[data-testid="compacted-commit-item"]')) {
    item.setAttribute('aria-pressed', String(item.dataset.commitHash === hash));
  }
  if (!state.selectedCommit) {
    dock.hidden = true;
    renderSelectedBranchNotes();
    return;
  }

  const noteInput = document.getElementById('selected-commit-note');
  noteInput.value = state.notes.commits[state.selectedCommit.hash] || '';
  noteInput.oninput = () => setNote('commits', state.selectedCommit.hash, noteInput.value);
  renderSelectedBranchNotes();

  document.getElementById('selected-commit-message').textContent = state.selectedCommit.subject;
  document.getElementById('selected-commit-author').textContent = state.selectedCommit.author;
  document.getElementById('selected-commit-author-date').textContent =
    state.selectedCommit.authorDate;
  document.getElementById('selected-commit-hash').textContent = state.selectedCommit.hash;
  const parents = state.selectedCommit.originalParents || state.selectedCommit.parents;
  document.getElementById('selected-commit-parents').textContent =
    parents.length > 0 ? parents.join(', ') : 'None (root commit)';

  const references = document.getElementById('selected-commit-references');
  references.replaceChildren();
  if (state.selectedCommit.references.length === 0) {
    references.textContent = 'None';
  } else {
    for (const referenceName of state.selectedCommit.references) {
      const item = document.createElement('li');
      item.textContent = referenceName;
      references.append(item);
    }
  }
  dock.hidden = false;
}

document.getElementById('browse-button').addEventListener('click', async () => {
  setStatus('');
  try {
    const selectedPath = await window.gitScope.chooseRepository();
    if (selectedPath) {
      pathInput.value = selectedPath;
    }
  } catch (error) {
    setStatus(error.message);
  }
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  openRepository(pathInput.value, event.submitter);
});

document.getElementById('git-path-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  document.getElementById('git-path-status').textContent = '';
  try {
    const gitPath = await window.gitScope.saveGitPath(gitPathInput.value);
    gitPathInput.value = gitPath;
    document.getElementById('git-path-status').textContent = gitPath
      ? 'Git path saved.'
      : 'Git path cleared. GitScope will use Git on PATH.';
  } catch (error) {
    document.getElementById('git-path-status').textContent = error.message;
  }
});

const settingsPanel = document.getElementById('settings-panel');
const settingsButton = document.getElementById('open-settings');
settingsButton.addEventListener('click', () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  settingsButton.setAttribute('aria-expanded', String(!settingsPanel.hidden));
  if (!settingsPanel.hidden) {
    gitPathInput.focus();
  }
});

document.getElementById('repository-note').addEventListener('input', (event) => {
  viewStorage.writeRepositoryNote(state.currentRepositoryPath, event.currentTarget.value);
});

document.getElementById('open-explorer').addEventListener('click', async () => {
  try {
    await window.gitScope.openInExplorer();
  } catch (error) {
    document.getElementById('fetch-status').textContent = error.message;
  }
});

document.getElementById('change-repository').addEventListener('click', () => {
  repositoryView.hidden = true;
  picker.hidden = false;
  loadPickerSettings();
  pathInput.focus();
});

let fetchStatusTimer;
document.getElementById('fetch-button').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const fetchStatus = document.getElementById('fetch-status');
  const diagnosticsPanel = document.getElementById('fetch-diagnostics-panel');
  const diagnostics = document.getElementById('fetch-diagnostics');
  button.disabled = true;
  clearTimeout(fetchStatusTimer);
  fetchStatus.textContent = 'Fetching remote references…';
  diagnosticsPanel.hidden = true;
  diagnostics.textContent = '';
  document.getElementById('diagnostics-copy-status').textContent = '';

  try {
    const result = await window.gitScope.fetchRemoteReferences();
    if (!result.success) {
      fetchStatus.textContent = result.message;
      diagnostics.textContent = result.diagnostics;
      diagnosticsPanel.hidden = result.diagnostics === '';
      return;
    }

    refreshRepositoryGraph(result.repository);
    fetchStatus.textContent = 'Fetch completed. Remote-tracking references are up to date.';
    const successMessage = fetchStatus.textContent;
    clearTimeout(fetchStatusTimer);
    fetchStatusTimer = setTimeout(() => {
      if (fetchStatus.textContent === successMessage) fetchStatus.textContent = '';
    }, 5000);
  } catch (error) {
    fetchStatus.textContent = `Fetch could not be completed: ${error.message}`;
  } finally {
    button.disabled = false;
  }
});

document.getElementById('copy-fetch-diagnostics').addEventListener('click', async () => {
  try {
    await window.gitScope.copyDiagnostics(document.getElementById('fetch-diagnostics').textContent);
    document.getElementById('diagnostics-copy-status').textContent = 'Diagnostics copied.';
  } catch (error) {
    document.getElementById('diagnostics-copy-status').textContent =
      `Could not copy diagnostics: ${error.message}`;
  }
});

document.getElementById('check-for-updates').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const updateStatus = document.getElementById('update-status');
  const releaseLink = document.getElementById('update-release-link');
  button.disabled = true;
  updateStatus.textContent = 'Checking GitHub Releases…';
  releaseLink.hidden = true;
  releaseLink.removeAttribute('href');

  try {
    const [response, currentVersion] = await Promise.all([
      fetch('https://api.github.com/repos/dgooderi/GitScope/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(10_000)
      }),
      window.gitScope.getAppVersion()
    ]);
    if (!response.ok) {
      throw new Error(`GitHub release check failed with HTTP ${response.status}. Try again later.`);
    }

    const release = await response.json();
    if (
      typeof release?.tag_name !== 'string' ||
      typeof release?.html_url !== 'string' ||
      release.draft ||
      release.prerelease
    ) {
      throw new Error('GitHub returned an invalid latest-release response. Try again later.');
    }
    const releaseUrl = new URL(release.html_url);
    if (
      releaseUrl.origin !== 'https://github.com' ||
      !releaseUrl.pathname.startsWith('/dgooderi/GitScope/releases/')
    ) {
      throw new Error('GitHub returned an unexpected release link.');
    }

    const latestVersion = parseReleaseVersion(release.tag_name.replace(/^v/, ''));
    const installedVersion = parseReleaseVersion(currentVersion);
    const versionComparison = compareReleaseVersions(latestVersion, installedVersion);
    const displayedVersion = release.tag_name.replace(/^v/, '');
    if (versionComparison > 0) {
      updateStatus.textContent = `GitScope ${displayedVersion} is available.`;
      releaseLink.href = releaseUrl.href;
      releaseLink.textContent = `View GitScope ${displayedVersion} on GitHub Releases`;
      releaseLink.hidden = false;
    } else {
      updateStatus.textContent = `GitScope is up to date (${currentVersion}).`;
    }
  } catch (error) {
    updateStatus.textContent = `Could not check for updates: ${error.message}`;
  } finally {
    button.disabled = false;
  }
});

document.getElementById('update-release-link').addEventListener('click', async (event) => {
  event.preventDefault();
  const updateStatus = document.getElementById('update-status');
  try {
    await window.gitScope.openRelease(event.currentTarget.href);
  } catch (error) {
    updateStatus.textContent = `Could not open the GitHub release: ${error.message}`;
  }
});

document
  .getElementById('theme-toggle')
  .addEventListener('click', (event) => setTheme(event.currentTarget.dataset.themeTarget));
