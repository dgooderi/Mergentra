const picker = document.getElementById('repository-picker');
const form = document.getElementById('repository-form');
const pathInput = document.getElementById('repository-path');
const gitPathInput = document.getElementById('git-executable-path');
const status = document.getElementById('status');
const repositoryView = document.getElementById('repository-view');
let selectedCommit = null;
let currentGraph = null;
let visibleReferences = new Set();
let selectedTimePreset = 'all';
let timeRange = null;

function setStatus(message) {
  status.textContent = message;
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
  document.getElementById('dark-theme').setAttribute('aria-pressed', String(theme === 'dark'));
  document.getElementById('light-theme').setAttribute('aria-pressed', String(theme === 'light'));
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
    const repositoryPath = document.createElement('small');
    button.className = 'recent-repository';
    button.type = 'button';
    name.textContent = repository.name;
    repositoryPath.textContent = repository.path;
    button.append(name, repositoryPath);
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
  try {
    return JSON.parse(localStorage.getItem(viewStateKeyPrefix + currentRepositoryPath)) || null;
  } catch {
    return null;
  }
}

function showRepository(repository) {
  document.getElementById('repository-name').textContent = repository.name;
  document.getElementById('repository-path-value').textContent = repository.path;
  document.getElementById('branch-name').textContent = repository.branch;
  renderGraph(repository.graph);
  picker.hidden = true;
  repositoryView.hidden = false;
}

function renderGraph(graph) {
  currentGraph = graph;
  selectedCommit = null;
  visibleReferences = new Set(graph.references.map((reference) => reference.name));
  selectedTimePreset = 'all';
  timeRange = null;
  customRangeValues = null;
  const startInput = document.getElementById('time-range-start');
  const endInput = document.getElementById('time-range-end');
  startInput.value = '';
  endInput.value = '';
  if (saved?.preset === 'custom' && saved.custom) {
    const start = new Date(`${saved.custom.start}T00:00:00`);
    const end = new Date(`${saved.custom.end}T00:00:00`);
    if (Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())) {
      end.setDate(end.getDate() + 1);
      selectedTimePreset = 'custom';
      timeRange = { start: start.getTime(), end: end.getTime() };
      customRangeValues = saved.custom;
      startInput.value = saved.custom.start;
      endInput.value = saved.custom.end;
    }
  } else if (saved && getPresetRange(saved.preset, new Date())) {
    selectedTimePreset = saved.preset;
    timeRange = getPresetRange(saved.preset, new Date());
  }
  document.getElementById('time-range').value = selectedTimePreset;
  document.getElementById('custom-time-range').hidden = selectedTimePreset !== 'custom';
  document.getElementById('time-range-status').textContent = '';
  document.getElementById('review-dock').hidden = true;
  renderWorktrees(graph.worktrees);
  renderReferenceLanes(graph.references);
  renderFilteredGraph();
}

function refreshRepositoryGraph(repository) {
  document.getElementById('branch-name').textContent = repository.branch;
  const previouslyVisible = visibleReferences;
  currentGraph = repository.graph;
  visibleReferences = new Set(currentGraph.references
    .filter((reference) => previouslyVisible.has(reference.name))
    .map((reference) => reference.name));
  for (const reference of currentGraph.references) {
    if (!previouslyVisible.has(reference.name)) {
      visibleReferences.add(reference.name);
    }
  }
  renderWorktrees(currentGraph.worktrees);
  renderReferenceLanes(currentGraph.references);
  renderFilteredGraph();
}

function renderFilteredGraph() {
  if (!currentGraph) {
    return;
  }

  const references = currentGraph.references
    .filter((reference) => visibleReferences.has(reference.name))
    .map((reference, lane) => ({ ...reference, lane }));
  const commitsByHash = new Map(currentGraph.commits.map((commit) => [commit.hash, commit]));
  const laneByHash = new Map();

  // Claim each branch's first-parent chain first so merged-in branches keep their own lane.
  // Branches that contain others (for example a release line that merged a hotfix) claim
  // shared commits first; `main` always goes first.
  const tipIndex = new Map(currentGraph.commits.map((commit, index) => [commit.hash, index]));
  const claimOrder = [...references].sort((left, right) => (
    (right.name === 'main' ? 1 : 0) - (left.name === 'main' ? 1 : 0)
    || (tipIndex.get(right.hash) ?? -1) - (tipIndex.get(left.hash) ?? -1)
  ));
  for (const reference of claimOrder) {
    let commit = commitsByHash.get(reference.hash);
    while (commit && !laneByHash.has(commit.hash)) {
      laneByHash.set(commit.hash, reference.lane);
      commit = commitsByHash.get(commit.parents[0]);
    }
  }

  for (const reference of references) {
    const pending = [reference.hash];
    while (pending.length > 0) {
      const hash = pending.pop();
      const commit = commitsByHash.get(hash);
      if (!commit || laneByHash.has(hash)) {
        continue;
      }
      laneByHash.set(hash, reference.lane);
      pending.push(...commit.parents);
    }
  }

  if (currentGraph.headDetached && currentGraph.headHash) {
    const pending = [currentGraph.headHash];
    while (pending.length > 0) {
      const hash = pending.pop();
      const commit = commitsByHash.get(hash);
      if (!commit || laneByHash.has(hash)) {
        continue;
      }
      laneByHash.set(hash, references.length);
      pending.push(...commit.parents);
    }
  }

  const reachableHashes = new Set(laneByHash.keys());
  const timeRangeStatus = document.getElementById('time-range-status');
  const commitsInRange = currentGraph.commits.filter((commit) => (
    reachableHashes.has(commit.hash)
    && (!timeRange || (commit.committerTimestamp * 1000 >= timeRange.start
      && commit.committerTimestamp * 1000 < timeRange.end))
  ));
  const inRangeHashes = new Set(commitsInRange.map((commit) => commit.hash));
  const visibleNames = new Set(references.map((reference) => reference.name));
  const graph = {
    ...currentGraph,
    references,
    commits: commitsInRange
      .map((commit) => ({
        ...commit,
        lane: laneByHash.get(commit.hash),
        references: commit.references.filter((name) => visibleNames.has(name) || commit.tags.includes(name))
      })),
    cutMarkers: commitsInRange
      .flatMap((commit) => {
        if (!timeRange) {
          return [];
        }
        const directions = new Set(commit.parents
          .filter((parentHash) => reachableHashes.has(parentHash) && !inRangeHashes.has(parentHash))
          .map((parentHash) => (
            commitsByHash.get(parentHash).committerTimestamp * 1000 < timeRange.start
              ? 'older'
              : 'newer'
          )));
        return [...directions].map((direction) => ({ commitHash: commit.hash, direction }));
      }),
    divergenceMarkers: currentGraph.divergenceMarkers.filter((marker) => (
      visibleNames.has(marker.branchName) && inRangeHashes.has(marker.commitHash)
    )),
    laneCount: Math.max(references.length, 1)
  };

  const displayGraph = compactOrdinaryHistory(graph);
  renderGraphContents(displayGraph);
  if (selectedCommit) {
    const updatedSelection = displayGraph.commits.find((commit) => commit.hash === selectedCommit.hash);
    selectCommit(updatedSelection || null);
  }
}

function compactOrdinaryHistory(graph) {
  const commitsByHash = new Map(graph.commits.map((commit) => [commit.hash, commit]));
  const childrenByHash = new Map(graph.commits.map((commit) => [commit.hash, []]));
  const importantHashes = new Set(graph.references.map((reference) => reference.hash));
  for (const hash of graph.shallowBoundaries) {
    importantHashes.add(hash);
  }
  for (const hash of graph.missingObjectBoundaries) {
    importantHashes.add(hash);
  }
  if (graph.headDetached && graph.headHash) {
    importantHashes.add(graph.headHash);
  }

  for (const commit of graph.commits) {
    if (commit.parents.length > 1 || commit.tags.length > 0) {
      importantHashes.add(commit.hash);
    }
    for (const parentHash of commit.parents) {
      childrenByHash.get(parentHash)?.push(commit.hash);
      if (commit.parents.length > 1) {
        importantHashes.add(parentHash);
      }
    }
  }
  for (const [hash, children] of childrenByHash) {
    if (children.length > 1) {
      importantHashes.add(hash);
      for (const childHash of children) {
        importantHashes.add(childHash);
      }
    }
  }
  for (const marker of graph.divergenceMarkers) {
    importantHashes.add(marker.commitHash);
  }
  for (const marker of graph.cutMarkers) {
    importantHashes.add(marker.commitHash);
  }

  const compactedHashes = new Set();
  const summariesByChild = new Map();
  for (const startHash of importantHashes) {
    const start = commitsByHash.get(startHash);
    if (!start) {
      continue;
    }

    for (const firstChildHash of childrenByHash.get(startHash) || []) {
      let cursor = commitsByHash.get(firstChildHash);
      const hiddenCommits = [];

      while (
        cursor
        && !importantHashes.has(cursor.hash)
        && cursor.parents.filter((hash) => commitsByHash.has(hash)).length === 1
        && (childrenByHash.get(cursor.hash) || []).length === 1
        && !compactedHashes.has(cursor.hash)
      ) {
        hiddenCommits.push(cursor);
        cursor = commitsByHash.get(childrenByHash.get(cursor.hash)[0]);
      }

      if (hiddenCommits.length === 0 || !cursor || !importantHashes.has(cursor.hash)) {
        continue;
      }

      const uniqueHiddenCommits = hiddenCommits.filter((commit) => !compactedHashes.has(commit.hash));
      // A single ordinary commit is shown as itself; a +1 summary hides nothing useful.
      if (uniqueHiddenCommits.length < 2) {
        continue;
      }
      for (const commit of uniqueHiddenCommits) {
        compactedHashes.add(commit.hash);
      }

      const summaryHash = `compact:${start.hash}:${cursor.hash}`;
      const summary = {
        hash: summaryHash,
        parents: [start.hash],
        subject: `${uniqueHiddenCommits.length} commits`,
        author: '',
        authorDate: '',
        committerTimestamp: 0,
        lane: uniqueHiddenCommits[0].lane,
        tags: [],
        references: [],
        compactCount: uniqueHiddenCommits.length,
        compactedHashes: uniqueHiddenCommits.map((commit) => commit.hash)
      };
      const summaries = summariesByChild.get(cursor.hash) || [];
      summaries.push({
        summary,
        replacedParent: uniqueHiddenCommits[uniqueHiddenCommits.length - 1].hash
      });
      summariesByChild.set(cursor.hash, summaries);
    }
  }

  if (compactedHashes.size === 0) {
    return graph;
  }

  const displayCommits = [];
  for (const commit of graph.commits) {
    if (compactedHashes.has(commit.hash)) {
      continue;
    }

    const summaries = summariesByChild.get(commit.hash) || [];
    const replacements = new Map();
    for (const { summary, replacedParent } of summaries) {
      displayCommits.push(summary);
      replacements.set(replacedParent, summary.hash);
    }
    displayCommits.push({
      ...commit,
      originalParents: commit.parents,
      parents: commit.parents.map((parentHash) => replacements.get(parentHash) || parentHash)
    });
  }

  return { ...graph, commits: displayCommits };
}

function subtractCalendarMonths(date, months) {
  const targetMonth = date.getMonth() - months;
  const firstOfTargetMonth = new Date(
    date.getFullYear(),
    targetMonth,
    1,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  );
  const daysInTargetMonth = new Date(
    firstOfTargetMonth.getFullYear(),
    firstOfTargetMonth.getMonth() + 1,
    0
  ).getDate();
  firstOfTargetMonth.setDate(Math.min(date.getDate(), daysInTargetMonth));
  return firstOfTargetMonth;
}

function getPresetRange(preset, now) {
  const durations = {
    '1d': 24 * 60 * 60 * 1000,
    '5d': 5 * 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '2w': 14 * 24 * 60 * 60 * 1000
  };
  if (Object.hasOwn(durations, preset)) {
    return { start: now.getTime() - durations[preset], end: now.getTime() };
  }

  const calendarMonths = {
    '1m': 1,
    '3m': 3,
    '6m': 6,
    '9m': 9,
    '1y': 12
  };
  if (Object.hasOwn(calendarMonths, preset)) {
    return {
      start: subtractCalendarMonths(now, calendarMonths[preset]).getTime(),
      end: now.getTime()
    };
  }

  return null;
}

function applyCustomTimeRange() {
  const startValue = document.getElementById('time-range-start').value;
  const endValue = document.getElementById('time-range-end').value;
  const status = document.getElementById('time-range-status');
  const startDate = new Date(`${startValue}T00:00:00`);
  const endDate = new Date(`${endValue}T00:00:00`);

  if (!startValue || !endValue || !Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
    status.textContent = 'Choose a valid start and end date.';
    return;
  }
  if (endDate < startDate) {
    status.textContent = 'The end date must be on or after the start date.';
    return;
  }

  endDate.setDate(endDate.getDate() + 1);
  timeRange = { start: startDate.getTime(), end: endDate.getTime() };
  selectedTimePreset = 'custom';
  customRangeValues = { start: startValue, end: endValue };
  saveViewState();
  status.textContent = '';
  renderFilteredGraph();
}

document.getElementById('time-range').addEventListener('change', (event) => {
  selectedTimePreset = event.target.value;
  const customRange = document.getElementById('custom-time-range');
  const status = document.getElementById('time-range-status');
  status.textContent = '';

  if (selectedTimePreset === 'custom') {
    customRange.hidden = false;
    return;
  }

  customRange.hidden = true;
  timeRange = getPresetRange(selectedTimePreset, new Date());
  saveViewState();
  renderFilteredGraph();
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
    checkbox.checked = visibleReferences.has(reference.name);
    checkbox.setAttribute('aria-label', reference.name);
    checkbox.dataset.testid = 'reference-filter';
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        visibleReferences.add(reference.name);
      } else {
        visibleReferences.delete(reference.name);
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
    lane.append(checkbox, marker, labelGroup);
    laneList.append(lane);
  }
  filterBranchPicker();
  updateBranchPickerSummary();
}

function updateBranchPickerSummary() {
  const total = currentGraph ? currentGraph.references.length : 0;
  document.getElementById('branch-picker-summary').textContent =
    `Branches: ${visibleReferences.size} of ${total} shown`;
}

function filterBranchPicker() {
  const query = document.getElementById('branch-picker-search').value.trim().toLowerCase();
  for (const lane of document.getElementById('reference-lanes').children) {
    lane.hidden = query !== '' && !lane.dataset.refName.toLowerCase().includes(query);
  }
}

function setVisibleBranches(predicate) {
  visibleReferences = new Set(currentGraph.references
    .filter(predicate)
    .map((reference) => reference.name));
  saveViewState();
  renderReferenceLanes(currentGraph.references);
  renderFilteredGraph();
}

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

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [attribute, value] of Object.entries(attributes)) {
    element.setAttribute(attribute, String(value));
  }
  return element;
}

function renderGraphContents(graph) {
  const graphElement = document.getElementById('commit-graph');
  const emptyMessage = document.getElementById('graph-empty');
  graphElement.replaceChildren();

  const rowHeight = 58;
  const leftPadding = 48;
  const columnWidth = 88;
  // Lanes that never overlap horizontally share a row. The root lane keeps the top
  // row, and each lane's span includes the horizontal run of its fork and merge lines.
  const indexByHash = new Map(graph.commits.map((commit, index) => [commit.hash, index]));
  const laneSpans = new Map();
  graph.commits.forEach((commit, index) => {
    const span = laneSpans.get(commit.lane) || { first: index, last: index };
    span.first = Math.min(span.first, index);
    span.last = Math.max(span.last, index);
    laneSpans.set(commit.lane, span);
  });
  for (const commit of graph.commits) {
    const childIndex = indexByHash.get(commit.hash);
    for (const [parentOrder, parentHash] of commit.parents.entries()) {
      const parent = graph.commits[indexByHash.get(parentHash)];
      if (!parent || parent.lane === commit.lane) {
        continue;
      }
      const isMergeIn = commit.parents.length > 1 && parentOrder > 0;
      const span = laneSpans.get(isMergeIn ? parent.lane : commit.lane);
      span.first = Math.min(span.first, isMergeIn ? span.first : indexByHash.get(parentHash));
      span.last = Math.max(span.last, isMergeIn ? childIndex : span.last);
    }
  }
  const mainReference = graph.references.find((reference) => !reference.remote && reference.name === 'main')
    || graph.references.find((reference) => !reference.remote && reference.name === 'master')
    || graph.references.find((reference) => !reference.remote);
  const rootLane = laneSpans.has(mainReference?.lane) ? mainReference.lane : graph.commits[0]?.lane;
  const rowByLane = new Map();
  const rowEnds = [Infinity];
  const lanesByStart = [...laneSpans.keys()].sort((a, b) => (
    laneSpans.get(a).first - laneSpans.get(b).first || a - b
  ));
  for (const lane of lanesByStart) {
    const span = laneSpans.get(lane);
    let row = 0;
    if (lane !== rootLane) {
      row = rowEnds.findIndex((end, index) => index > 0 && end < span.first);
      if (row === -1) {
        row = rowEnds.length;
      }
      rowEnds[row] = span.last;
    }
    rowByLane.set(lane, row);
  }
  const rowCount = Math.max(rowEnds.length, 1);
  const width = Math.max(144, leftPadding + rightPadding + Math.max(graph.commits.length - 1, 0) * columnWidth);
  const height = 60 + axisHeight + rowCount * rowHeight;
  graphElement.setAttribute('width', String(width));
  graphElement.setAttribute('height', String(height));
  graphElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
  graphElement.dataset.order = graph.order;
  graphElement.dataset.referenceCount = String(graph.references.length);
  graphElement.dataset.timeRangeStart = timeRange ? String(timeRange.start) : '';
  graphElement.dataset.timeRangeEnd = timeRange ? String(timeRange.end) : '';
  const definitions = createSvgElement('defs');
  const arrowhead = createSvgElement('marker', {
    id: 'commit-arrowhead',
    viewBox: '0 0 10 10',
    refX: 8,
    refY: 5,
    markerWidth: 6,
    markerHeight: 6,
    orient: 'auto-start-reverse'
  });
  arrowhead.append(createSvgElement('path', {
    d: 'M 0 0 L 10 5 L 0 10 z',
    fill: '#9ca3af'
  }));
  definitions.append(arrowhead);
  graphElement.append(definitions);

  const commitPositions = new Map(graph.commits.map((commit, index) => [
    commit.hash,
    {
      x: leftPadding + index * columnWidth,
      y: 34 + axisHeight + rowByLane.get(commit.lane) * rowHeight
    }
  ]));

  for (const commit of graph.commits) {
    const childPosition = commitPositions.get(commit.hash);
    for (const parentHash of commit.parents) {
      const parentPosition = commitPositions.get(parentHash);
      if (!parentPosition) {
        continue;
      }
      const isMergeIn = commit.parents.length > 1 && parentHash !== commit.parents[0];
      const bend = Math.min(isMergeIn ? 176 : 48, childPosition.x - parentPosition.x);
      let pathData;
      if (parentPosition.y === childPosition.y) {
        pathData = `M ${parentPosition.x} ${parentPosition.y} L ${childPosition.x} ${childPosition.y}`;
      } else if (isMergeIn) {
        const turn = childPosition.x - bend;
        pathData = `M ${parentPosition.x} ${parentPosition.y} L ${turn} ${parentPosition.y} C ${turn + bend * 0.8} ${parentPosition.y}, ${turn + bend * 0.2} ${childPosition.y}, ${childPosition.x} ${childPosition.y}`;
      } else {
        const turn = parentPosition.x + bend;
        pathData = `M ${parentPosition.x} ${parentPosition.y} C ${parentPosition.x + bend * 0.8} ${parentPosition.y}, ${parentPosition.x + bend * 0.2} ${childPosition.y}, ${turn} ${childPosition.y} L ${childPosition.x} ${childPosition.y}`;
      }
      const parentCommit = graph.commits[indexByHash.get(parentHash)];
      // Fork and merge lines keep the colour of the branch they leave; a branch takes its own colour after its first commit.
      const edgeLane = parentCommit && parentCommit.lane !== commit.lane ? parentCommit.lane : commit.lane;
      graphElement.append(createSvgElement('path', {
        d: pathData,
        fill: 'none',
        stroke: graph.references[edgeLane]?.color || '#9ca3af',
        'stroke-width': 2,
        'marker-end': 'url(#commit-arrowhead)',
        'data-testid': 'commit-edge',
        'data-parent-hash': parentHash,
        'data-child-hash': commit.hash
      }));
    }
  }

  const summaryLayer = createSvgElement('g');
  graphElement.append(summaryLayer);
  for (const commit of graph.commits) {
    const position = commitPositions.get(commit.hash);
    if (commit.compactCount) {
      const summary = createSvgElement('g', {
        'data-testid': 'compacted-commit-count',
        'data-count': commit.compactCount,
        'data-hidden-commit-count': commit.compactedHashes.length,
        transform: `translate(${position.x} ${position.y})`,
        role: 'button',
        tabindex: 0,
        'aria-pressed': 'false',
        'data-summary-hash': commit.hash,
        'aria-label': `${commit.compactCount} ordinary commits compacted`
      });
      const pill = createSvgElement('rect', {
        x: -26,
        y: -11,
        width: 52,
        height: 22,
        rx: 11,
        fill: graph.references[commit.lane]?.color || '#4b5563'
      });
      const countLabel = createSvgElement('text', {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        fill: '#111827'
      });
      countLabel.textContent = `${commit.compactCount} commits`;
      summary.append(pill, countLabel);
      graphElement.append(summary);
      continue;
    }

    const group = createSvgElement('g', {
      'data-testid': 'commit-node',
      'data-commit-hash': commit.hash,
      'data-lane-index': commit.lane,
      'data-is-merge': String(commit.parents.length > 1),
      transform: `translate(${position.x} ${position.y})`,
      role: 'button',
      tabindex: 0,
      'aria-pressed': 'false',
      'data-ref-names': JSON.stringify(commit.references.filter((name) => !commit.tags.includes(name))),
      'aria-label': `Inspect ${commit.subject} (${commit.hash.slice(0, 7)})`
    });
    const title = createSvgElement('title');
    const hitTarget = createSvgElement('rect', {
      x: -42,
      y: -20,
      width: 84,
      height: 40,
      fill: 'transparent',
      'pointer-events': 'all',
      'aria-hidden': 'true'
    });
    const color = graph.references[commit.lane]?.color || '#9ca3af';
    const nodeShape = commit.parents.length > 1
      ? createSvgElement('polygon', {
        points: '0,-11 11,0 0,11 -11,0',
        fill: color,
        stroke: '#111827',
        'stroke-width': 2,
        'data-testid': 'merge-node-shape',
        'data-shape': 'diamond'
      })
      : createSvgElement('circle', {
        r: 8,
        fill: color,
        stroke: '#111827',
        'stroke-width': 2
      });
    const label = createSvgElement('text', {
      x: 0,
      y: 23,
      'text-anchor': 'middle',
      class: 'hash-label'
    });
    title.textContent = `${commit.subject} (${commit.hash.slice(0, 7)})${commit.tags.length > 0 ? ` — tags: ${commit.tags.join(', ')}` : ''}`;
    label.textContent = commit.hash.slice(0, 7);
    group.append(title, hitTarget, nodeShape, label);
    group.addEventListener('click', () => selectCommit(commit));
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectCommit(commit);
      }
    });
    if (commit.tags.length > 0) {
      const tagGroup = createSvgElement('g', {
        'data-testid': 'commit-tags',
        'aria-label': `Tags: ${commit.tags.join(', ')}`
      });
      for (const [tagIndex, tagName] of commit.tags.entries()) {
        const tagLabel = createSvgElement('text', {
          x: 15,
          y: -4 + tagIndex * 13,
          'data-testid': 'commit-tag',
          'data-tag-name': tagName
        });
        tagLabel.textContent = tagName.length > 14 ? `${tagName.slice(0, 13)}…` : tagName;
        const tagTitle = createSvgElement('title');
        tagTitle.textContent = tagName;
        tagLabel.append(tagTitle);
        tagGroup.append(tagLabel);
      }
      group.append(tagGroup);
    }
    graphElement.append(group);
  }

  const checkedOutReference = graph.references.find((reference) => reference.checkedOut);
  if (checkedOutReference) {
    const position = commitPositions.get(checkedOutReference.hash);
    if (position) {
      const marker = createSvgElement('g', {
        'data-testid': 'checked-out-branch-marker',
        'data-branch-name': checkedOutReference.name,
        'data-commit-hash': checkedOutReference.hash,
        transform: `translate(${position.x} ${position.y})`,
        role: 'img',
        'aria-label': `Checked out branch ${checkedOutReference.name}`
      });
      marker.append(createSvgElement('circle', {
        r: 14,
        fill: 'none',
        stroke: checkedOutReference.color,
        'stroke-width': 2,
        'aria-hidden': 'true'
      }));
      const label = createSvgElement('text', {
        x: 16,
        y: -12,
        'data-testid': 'checked-out-branch-label'
      });
      label.textContent = `HEAD · ${checkedOutReference.name}`;
      marker.append(label);
      graphElement.append(marker);
    }
  }

  if (graph.headDetached && graph.headHash) {
    const position = commitPositions.get(graph.headHash);
    if (position) {
      const marker = createSvgElement('g', {
        'data-testid': 'head-marker',
        'data-commit-hash': graph.headHash,
        transform: `translate(${position.x} ${position.y})`,
        role: 'img',
        'aria-label': 'Detached HEAD'
      });
      const label = createSvgElement('text', {
        x: 0,
        y: 39,
        'text-anchor': 'middle'
      });
      label.textContent = 'HEAD';
      marker.append(label);
      graphElement.append(marker);
    }
  }

  for (const hash of graph.shallowBoundaries) {
    const position = commitPositions.get(hash);
    if (!position) {
      continue;
    }
    const marker = createSvgElement('g', {
      'data-testid': 'history-boundary',
      'data-boundary-type': 'shallow',
      'data-commit-hash': hash,
      transform: `translate(${position.x} ${position.y - 25})`,
      role: 'img',
      'aria-label': 'Shallow history boundary'
    });
    const label = createSvgElement('text', {
      x: 0,
      y: 0,
      'text-anchor': 'middle'
    });
    label.textContent = 'Shallow boundary';
    marker.append(label);
    graphElement.append(marker);
  }

  for (const hash of graph.missingObjectBoundaries) {
    const position = commitPositions.get(hash);
    if (!position) {
      continue;
    }
    const marker = createSvgElement('g', {
      'data-testid': 'history-boundary',
      'data-boundary-type': 'missing-object',
      'data-commit-hash': hash,
      transform: `translate(${position.x} ${position.y - 39})`,
      role: 'img',
      'aria-label': 'Missing-object history boundary'
    });
    const label = createSvgElement('text', {
      x: 0,
      y: 0,
      'text-anchor': 'middle'
    });
    label.textContent = 'Missing-object boundary';
    marker.append(label);
    graphElement.append(marker);
  }

  const markersAtCommit = new Map();
  for (const marker of graph.divergenceMarkers) {
    const position = commitPositions.get(marker.commitHash);
    if (!position) {
      continue;
    }
    const stackIndex = markersAtCommit.get(marker.commitHash) || 0;
    markersAtCommit.set(marker.commitHash, stackIndex + 1);
    const markerGroup = createSvgElement('g', {
      'data-testid': 'divergence-marker',
      'data-inferred': String(marker.inferred),
      'data-branch-name': marker.branchName,
      'data-ancestor-hash': marker.ancestorHash,
      'data-commit-hash': marker.commitHash,
      transform: `translate(${position.x} ${position.y - 27 - stackIndex * 12})`,
      role: 'img',
      'aria-label': `Branch diverges: ${marker.branchName}`
    });
    const label = createSvgElement('text', {
      x: 0,
      y: 0,
      'text-anchor': 'middle'
    });
    const title = createSvgElement('title');
    title.textContent = `Inferred branch divergence for ${marker.branchName}; Git does not record branch creation`;
    label.textContent = `Branch diverges: ${marker.branchName}`;
    markerGroup.append(title, label);
    graphElement.append(markerGroup);
  }

  for (const marker of graph.cutMarkers) {
    const position = commitPositions.get(marker.commitHash);
    if (!position) {
      continue;
    }
    const cutMarker = createSvgElement('g', {
      'data-testid': 'history-cut-marker',
      'data-direction': marker.direction,
      'data-commit-hash': marker.commitHash,
      transform: `translate(${position.x} ${position.y + 34})`,
      role: 'img',
      'aria-label': `${marker.direction === 'older' ? 'Earlier' : 'Later'} history continues`
    });
    const label = createSvgElement('text', {
      x: 0,
      y: 0,
      'text-anchor': 'middle'
    });
    label.textContent = `${marker.direction === 'older' ? 'Earlier' : 'Later'} history continues`;
    cutMarker.append(label);
    graphElement.append(cutMarker);
  }

  emptyMessage.hidden = graph.commits.length > 0;
  if (graph.commits.length > 0) {
    emptyMessage.textContent = '';
  } else if (currentGraph.commits.length === 0) {
    emptyMessage.textContent = 'No commits yet. The commit graph will appear after the first commit.';
  } else if (visibleReferences.size === 0) {
    emptyMessage.textContent = 'No references selected. Select a reference to show its history.';
  } else if (timeRange) {
    emptyMessage.textContent = 'No commits in this time range. Choose a different range or select All history.';
  } else {
    emptyMessage.textContent = 'No commits are reachable from the selected references.';
  }
}

function selectCommit(commit) {
  selectedCommit = commit;
  const hash = commit?.hash;
  const dock = document.getElementById('review-dock');
  const commitNodes = document.querySelectorAll('[data-testid="commit-node"]');
  for (const node of commitNodes) {
    node.setAttribute('aria-pressed', String(node.getAttribute('data-commit-hash') === hash));
  }
  if (!selectedCommit) {
    dock.hidden = true;
    return;
  }

  document.getElementById('selected-commit-message').textContent = selectedCommit.subject;
  document.getElementById('selected-commit-author').textContent = selectedCommit.author;
  document.getElementById('selected-commit-author-date').textContent = selectedCommit.authorDate;
  document.getElementById('selected-commit-hash').textContent = selectedCommit.hash;
  const parents = selectedCommit.originalParents || selectedCommit.parents;
  document.getElementById('selected-commit-parents').textContent = parents.length > 0
    ? parents.join(', ')
    : 'None (root commit)';

  const references = document.getElementById('selected-commit-references');
  references.replaceChildren();
  if (selectedCommit.references.length === 0) {
    references.textContent = 'None';
  } else {
    for (const referenceName of selectedCommit.references) {
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
    setStatus(error.message);
  }
});

document.getElementById('change-repository').addEventListener('click', () => {
  repositoryView.hidden = true;
  picker.hidden = false;
  loadPickerSettings();
  pathInput.focus();
});

document.getElementById('fetch-button').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const fetchStatus = document.getElementById('fetch-status');
  const diagnosticsPanel = document.getElementById('fetch-diagnostics-panel');
  const diagnostics = document.getElementById('fetch-diagnostics');
  button.disabled = true;
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
    document.getElementById('diagnostics-copy-status').textContent = `Could not copy diagnostics: ${error.message}`;
  }
});

function parseReleaseVersion(version) {
  const match = version.match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) {
    throw new Error(`GitHub returned an unsupported release version: ${version}`);
  }
  return {
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease: match[4] ? match[4].split('.') : null
  };
}

function compareReleaseVersions(left, right) {
  for (const part of ['major', 'minor', 'patch']) {
    if (left[part] !== right[part]) {
      return left[part] > right[part] ? 1 : -1;
    }
  }
  if (!left.prerelease && !right.prerelease) {
    return 0;
  }
  if (!left.prerelease) {
    return 1;
  }
  if (!right.prerelease) {
    return -1;
  }

  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return leftIdentifier === undefined ? -1 : 1;
    }
    if (leftIdentifier === rightIdentifier) {
      continue;
    }
    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      const leftNumber = BigInt(leftIdentifier);
      const rightNumber = BigInt(rightIdentifier);
      return leftNumber > rightNumber ? 1 : -1;
    }
    if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    }
    return leftIdentifier > rightIdentifier ? 1 : -1;
  }
  return 0;
}

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
      typeof release?.tag_name !== 'string'
      || typeof release?.html_url !== 'string'
      || release.draft
      || release.prerelease
    ) {
      throw new Error('GitHub returned an invalid latest-release response. Try again later.');
    }
    const releaseUrl = new URL(release.html_url);
    if (
      releaseUrl.origin !== 'https://github.com'
      || !releaseUrl.pathname.startsWith('/dgooderi/GitScope/releases/')
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

document.getElementById('dark-theme').addEventListener('click', () => setTheme('dark'));
document.getElementById('light-theme').addEventListener('click', () => setTheme('light'));
