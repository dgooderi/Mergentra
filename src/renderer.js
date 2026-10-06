import { compactOrdinaryHistory, compactSameLaneRuns } from './renderer/compaction.js';
import { buildFilteredGraph, computeAvailableReferences } from './renderer/lanes.js';
import { computeGraphLayout } from './renderer/layout.js';
import {
  appendDefinitions,
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
import { loadViewState, saveViewState } from './renderer/view-state.js';
import {
  initTimeToolbar,
  syncCustomInputsToRange,
  updateTimeNavigation
} from './renderer/time-toolbar.js';
import { initZoomControls, stepZoom } from './renderer/zoom.js';
import { createReferencePicker } from './renderer/reference-picker.js';
import { viewStorage } from './renderer/app-storage.js';
import { loadNotes, refreshNoteMarkers } from './renderer/notes-ui.js';
import { createRepositoryActions } from './renderer/repository-actions.js';
import { createRepositoryControls } from './renderer/repository-controls.js';
import {
  closeCompactedPopover,
  closeGraphContextMenu,
  openCompactedPopover,
  openGraphContextMenu
} from './renderer/popovers.js';
import { getPresetRange } from './renderer/time-range.js';
import { createReviewDock } from './renderer/review-dock.js';
const reviewDock = createReviewDock({ updateTimeNavigation });
const selectCommit = reviewDock.selectCommit;
const picker = document.getElementById('repository-picker');
const repositoryView = document.getElementById('repository-view');
function applyDisplayOptions() {
  const graphElement = document.getElementById('commit-graph');
  graphElement.dataset.showTags = String(state.displayOptions.tags);
  graphElement.dataset.showHashes = String(state.displayOptions.hashes);
  graphElement.dataset.showReleases = String(state.displayOptions.releases);
  document.getElementById('show-tags').checked = state.displayOptions.tags;
  document.getElementById('show-hashes').checked = state.displayOptions.hashes;
  document.getElementById('show-releases').checked = state.displayOptions.releases;
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
  reviewDock.hide();
  renderWorktrees(graph.worktrees);
  referencePicker.render(graph.references);
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
  referencePicker.render(state.currentGraph.references);
  renderFilteredGraph();
}

function renderFilteredGraph() {
  if (!state.currentGraph) {
    return;
  }
  state.availableReferenceNames = computeAvailableReferences(state.currentGraph, state.timeRange);
  updateTimeNavigation();
  referencePicker.refresh();

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

initTimeToolbar({ renderFilteredGraph });
initZoomControls();
const referencePicker = createReferencePicker({ renderFilteredGraph });
referencePicker.init();

// Owners are computed once per loaded graph; scanning every commit per branch is far too slow on large repositories.

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
  openCompactedPopover: (summary, anchor) => openCompactedPopover(summary, anchor, selectCommit),
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

createRepositoryControls({ showRepository }).init();
createRepositoryActions({ refreshRepositoryGraph }).init();
