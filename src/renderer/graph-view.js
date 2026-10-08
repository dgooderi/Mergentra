// SVG drawing for the commit graph. Each function appends one kind of element to the graph and
// receives everything it needs explicitly: a layout context and an object of actions.
import { computeTimeAxisTicks, dateRangeFromAxisDrag } from './time-axis.js';
import { branchLabelNames, truncateBranchName } from './layout.js';
import { findMainReference } from './lanes.js';
import { markdownToPlainText } from './markdown.js';

const releaseTagPattern = /^v?\d+(\.\d+)+([-+.].*)?$/;
// Merge lines longer than this leave their branch with a visible curve instead of running along its row.
const MERGE_CURVE_AT_START_SPAN = 400;

export function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [attribute, value] of Object.entries(attributes)) {
    element.setAttribute(attribute, String(value));
  }
  return element;
}

// Each visible commit gets a tick; see computeTimeAxisTicks for how its label is chosen.
export function renderTimeAxis(
  graphElement,
  commits,
  commitPositions,
  width,
  axisHeight,
  onRangeSelected,
  selectionAvailable = true
) {
  const { showTime, ticks } = computeTimeAxisTicks(commits, commitPositions);
  if (ticks.length === 0) {
    return;
  }

  const axis = createSvgElement('g', { 'data-testid': 'time-axis', 'aria-hidden': 'true' });
  axis.append(
    createSvgElement('line', {
      class: 'time-axis-line',
      x1: 0,
      y1: axisHeight - 6,
      x2: width,
      y2: axisHeight - 6
    })
  );
  for (const tick of ticks) {
    axis.append(
      createSvgElement('line', {
        class: 'time-axis-tick',
        x1: tick.x,
        y1: axisHeight - 10,
        x2: tick.x,
        y2: axisHeight - 2
      })
    );
    const label = createSvgElement('text', {
      class: 'time-axis-label',
      'data-testid': 'time-axis-label',
      'data-timestamp': tick.timestamp,
      x: tick.x,
      y: showTime ? axisHeight - 27 : axisHeight - 15,
      'text-anchor': 'middle'
    });
    label.textContent = tick.dateText;
    axis.append(label);
    if (showTime) {
      const timeLabel = createSvgElement('text', {
        class: 'time-axis-time',
        x: tick.x,
        y: axisHeight - 14,
        'text-anchor': 'middle'
      });
      timeLabel.textContent = tick.timeText;
      axis.append(timeLabel);
    }
  }
  graphElement.append(axis);
  attachAxisDrag(graphElement, ticks, width, axisHeight, onRangeSelected, selectionAvailable);
}

// Dragging across the axis selects the dates between the ticks it covers. Escape cancels.
function attachAxisDrag(
  graphElement,
  ticks,
  width,
  axisHeight,
  onRangeSelected,
  selectionAvailable
) {
  if (!onRangeSelected) {
    return;
  }
  const hitArea = createSvgElement('rect', {
    class: 'time-axis-drag-area',
    'data-testid': 'time-axis-drag-area',
    x: 0,
    y: 0,
    width,
    height: axisHeight
  });
  graphElement.append(hitArea);
  if (!selectionAvailable) {
    hitArea.classList.add('disabled');
    hitArea.setAttribute('aria-disabled', 'true');
    hitArea.setAttribute('data-disabled', 'true');
    const title = createSvgElement('title');
    title.textContent = 'Zoom out to select a new date range';
    hitArea.append(title);
    return;
  }

  const toGraphX = (event) => {
    const point = new DOMPoint(event.clientX, event.clientY);
    return point.matrixTransform(graphElement.getScreenCTM().inverse()).x;
  };

  hitArea.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const startX = toGraphX(event);
    const selection = createSvgElement('rect', {
      class: 'time-axis-selection',
      'data-testid': 'time-axis-selection',
      x: startX,
      y: 0,
      width: 0,
      height: axisHeight
    });
    graphElement.append(selection);

    const finish = () => {
      selection.remove();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
    const onMove = (moveEvent) => {
      const currentX = toGraphX(moveEvent);
      selection.setAttribute('x', String(Math.min(startX, currentX)));
      selection.setAttribute('width', String(Math.abs(currentX - startX)));
    };
    const onUp = (upEvent) => {
      const range = dateRangeFromAxisDrag(ticks, startX, toGraphX(upEvent));
      finish();
      if (range) {
        onRangeSelected(range);
      }
    };
    const onKey = (keyEvent) => {
      if (keyEvent.key === 'Escape') {
        finish();
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
  });
}

export function appendDefinitions(graphElement) {
  const definitions = createSvgElement('defs');
  const arrowhead = createSvgElement('marker', {
    id: 'commit-arrowhead',
    viewBox: '0 0 10 10',
    refX: 8,
    refY: 5,
    markerWidth: 12,
    markerHeight: 12,
    markerUnits: 'userSpaceOnUse',
    orient: 'auto-start-reverse'
  });
  arrowhead.append(
    createSvgElement('path', {
      d: 'M 0 0 L 10 5 L 0 10 z',
      fill: '#9ca3af'
    })
  );
  definitions.append(arrowhead);
  graphElement.append(definitions);
  return definitions;
}

export function drawEdges(ctx, actions) {
  const { graph, graphElement, definitions, commitPositions, indexByHash, ownerReference } = ctx;
  for (const commit of graph.commits) {
    const childPosition = commitPositions.get(commit.hash);
    for (const parentHash of commit.parents) {
      const parentPosition = commitPositions.get(parentHash);
      if (!parentPosition) {
        continue;
      }
      const isMergeIn = commit.parents.length > 1 && parentHash !== commit.parents[0];
      const curvesAtEnd =
        isMergeIn && childPosition.x - parentPosition.x <= MERGE_CURVE_AT_START_SPAN;
      const bend = Math.min(curvesAtEnd ? 176 : 48, childPosition.x - parentPosition.x);
      let pathData;
      if (parentPosition.y === childPosition.y) {
        pathData = `M ${parentPosition.x} ${parentPosition.y} L ${childPosition.x} ${childPosition.y}`;
      } else if (curvesAtEnd) {
        const turn = childPosition.x - bend;
        pathData = `M ${parentPosition.x} ${parentPosition.y} L ${turn} ${parentPosition.y} C ${turn + bend * 0.8} ${parentPosition.y}, ${turn + bend * 0.2} ${childPosition.y}, ${childPosition.x} ${childPosition.y}`;
      } else if (isMergeIn) {
        // A long merge line leaves its source, runs on its own track beside the target lane, and drops vertically into the merge node.
        const side = Math.sign(parentPosition.y - childPosition.y) || -1;
        const trackY = childPosition.y + side * (26 + (indexByHash.get(commit.hash) % 5) * 16);
        const turn = parentPosition.x + bend;
        const dropX = childPosition.x - 30;
        pathData = `M ${parentPosition.x} ${parentPosition.y} C ${parentPosition.x + bend * 0.8} ${parentPosition.y}, ${parentPosition.x + bend * 0.2} ${trackY}, ${turn} ${trackY} L ${dropX} ${trackY} Q ${childPosition.x} ${trackY} ${childPosition.x} ${childPosition.y + side * 11}`;
      } else {
        const turn = parentPosition.x + bend;
        pathData = `M ${parentPosition.x} ${parentPosition.y} C ${parentPosition.x + bend * 0.8} ${parentPosition.y}, ${parentPosition.x + bend * 0.2} ${childPosition.y}, ${turn} ${childPosition.y} L ${childPosition.x} ${childPosition.y}`;
      }
      const parentCommit = graph.commits[indexByHash.get(parentHash)];
      // Fork and merge lines keep the colour of the branch they leave; a branch takes its own colour after its first commit.
      const edgeLane =
        parentCommit && parentCommit.lane !== commit.lane ? parentCommit.lane : commit.lane;
      let stroke = ownerReference(edgeLane)?.color || '#9ca3af';
      const branchColor = ownerReference(commit.lane)?.color;
      const leavesAtStart = !curvesAtEnd && !isMergeIn && edgeLane !== commit.lane;
      const fadeStart = parentPosition.x + bend;
      const fadeEnd = Math.min(fadeStart + window.innerWidth * 0.05, childPosition.x);
      if (leavesAtStart && branchColor && branchColor !== stroke && fadeEnd > fadeStart) {
        // Switch to the target branch colour just past the curve, within 5% of the window width, so a long line does not masquerade as the source branch.
        const gradientId = `fork-gradient-${commit.hash}-${parentHash}`;
        const gradient = createSvgElement('linearGradient', {
          id: gradientId,
          gradientUnits: 'userSpaceOnUse',
          x1: fadeStart,
          y1: 0,
          x2: fadeEnd,
          y2: 0
        });
        gradient.append(
          createSvgElement('stop', { offset: 0, 'stop-color': stroke }),
          createSvgElement('stop', { offset: 1, 'stop-color': branchColor })
        );
        definitions.append(gradient);
        stroke = `url(#${gradientId})`;
      }
      const checkedOutReference = graph.references.find((reference) => reference.checkedOut);
      if (checkedOutReference && checkedOutReference.lane === edgeLane) {
        // A wide translucent copy under the line gives the whole lane a slight glow without a costly SVG filter.
        graphElement.append(
          createSvgElement('path', {
            d: pathData,
            fill: 'none',
            stroke: checkedOutReference.color,
            'stroke-width': 9,
            'stroke-opacity': 0.28,
            'stroke-linecap': 'round',
            'pointer-events': 'none',
            'aria-hidden': 'true',
            'data-testid': 'checked-out-lane-glow',
            'data-parent-hash': parentHash,
            'data-child-hash': commit.hash
          })
        );
      }
      graphElement.append(
        createSvgElement('path', {
          d: pathData,
          fill: 'none',
          stroke,
          'stroke-width':
            graph.references[commit.lane]?.name === findMainReference(graph.references)?.name &&
            parentCommit?.lane === commit.lane
              ? 5
              : 2,
          'marker-end': 'url(#commit-arrowhead)',
          'data-testid': 'commit-edge',
          'data-parent-hash': parentHash,
          'data-child-hash': commit.hash
        })
      );
      const hoverReference = ownerReference(
        isMergeIn && parentCommit ? parentCommit.lane : commit.lane
      );
      if (hoverReference) {
        const hit = createSvgElement('path', {
          d: pathData,
          fill: 'none',
          stroke: 'transparent',
          'stroke-width': 12,
          'pointer-events': 'stroke',
          'data-testid': 'commit-edge-hover',
          'data-parent-hash': parentHash,
          'data-child-hash': commit.hash,
          'data-ref-name': hoverReference.name
        });
        const title = createSvgElement('title');
        hit.append(title);
        hit.addEventListener('pointerenter', () => {
          const note = actions.getNotes().branches[hoverReference.name];
          title.textContent = note
            ? `${hoverReference.name}\n${markdownToPlainText(note)}`
            : hoverReference.name;
        });
        if (isMergeIn) {
          hit.addEventListener('contextmenu', (event) =>
            actions.openGraphContextMenu(event, [
              {
                label: 'Focus on destination',
                action: () => actions.focusOnCommit(commit, childPosition)
              }
            ])
          );
        }
        graphElement.append(hit);
      }
    }
  }
}

function drawSummaryPill(commit, position, summaryLayer, ctx, actions) {
  const { ownerReference } = ctx;
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
  for (const hidden of commit.compactedCommits) {
    actions.registerCompactedMember(hidden.hash, commit.hash);
  }
  const summaryTitle = createSvgElement('title');
  const listed = commit.compactedCommits
    .slice(0, 15)
    .map((hidden) => `${hidden.hash.slice(0, 7)} ${hidden.subject}`);
  if (commit.compactedCommits.length > 15) {
    listed.push(`…and ${commit.compactedCommits.length - 15} more`);
  }
  summaryTitle.textContent = listed.join('\n');
  const summarySelection = createSvgElement('rect', {
    x: -31,
    y: -16,
    width: 62,
    height: 32,
    rx: 16,
    class: 'selection-ring',
    'data-testid': 'compacted-selection-ring',
    fill: 'none',
    'aria-hidden': 'true'
  });
  const pill = createSvgElement('rect', {
    x: -26,
    y: -11,
    width: 52,
    height: 22,
    rx: 11,
    fill: ownerReference(commit.lane)?.color || '#4b5563'
  });
  const countLabel = createSvgElement('text', {
    x: 0,
    y: 4,
    'text-anchor': 'middle',
    fill: '#111827'
  });
  countLabel.textContent = `+${commit.compactCount}`;
  summary.append(summaryTitle, summarySelection, pill, countLabel);
  const openList = () => actions.openCompactedPopover(commit, summary);
  summary.addEventListener('click', openList);
  summary.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openList();
    }
  });
  summaryLayer.append(summary);
}

function drawCommitNode(commit, position, ctx, actions) {
  const {
    graphElement,
    commitPositions,
    commitByHash,
    mergeTargetsBySource,
    cutMarkersByHash,
    ownerReference
  } = ctx;
  const group = createSvgElement('g', {
    'data-testid': 'commit-node',
    'data-commit-hash': commit.hash,
    'data-lane-index': commit.lane,
    'data-is-merge': String(commit.parents.length > 1),
    transform: `translate(${position.x} ${position.y})`,
    role: 'button',
    tabindex: 0,
    'aria-pressed': 'false',
    'data-ref-names': JSON.stringify(
      commit.references.filter((name) => !commit.tags.includes(name))
    ),
    'aria-label': `Inspect ${commit.subject} (${commit.hash.slice(0, 7)})`
  });
  group.addEventListener('contextmenu', (event) => {
    const items = [];
    for (const target of mergeTargetsBySource.get(commit.hash) || []) {
      items.push({
        label: `Focus on destination (${target.hash.slice(0, 7)})`,
        action: () => actions.focusOnCommit(target, commitPositions.get(target.hash))
      });
    }
    for (const parentHash of commit.parents.slice(1)) {
      const source = commitPositions.get(parentHash) && commitByHash.get(parentHash);
      if (source) {
        items.push({
          label: `Focus on merged branch (${parentHash.slice(0, 7)})`,
          action: () => actions.focusOnCommit(source, commitPositions.get(parentHash))
        });
      }
    }
    const owner = ownerReference(commit.lane);
    if (owner) {
      items.push(
        {
          label: 'Show branches from main to here',
          action: () => actions.showBranchPath(owner.name, true)
        },
        {
          label: 'Show this branch and its parent',
          action: () => actions.showBranchPath(owner.name, false)
        }
      );
    }
    if (items.length) actions.openGraphContextMenu(event, items);
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
  const color = ownerReference(commit.lane)?.color || '#9ca3af';
  const nodeShape =
    commit.parents.length > 1
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
  const selectionRing = createSvgElement('circle', {
    r: 17,
    class: 'selection-ring',
    'data-testid': 'selection-ring',
    fill: 'none',
    'aria-hidden': 'true'
  });
  const noteMarker = createSvgElement('text', {
    x: -16,
    y: -9,
    class: 'note-marker',
    'data-testid': 'note-marker',
    'text-anchor': 'middle',
    'aria-hidden': 'true'
  });
  noteMarker.textContent = '✎';
  group.append(title, hitTarget, selectionRing, nodeShape, label, noteMarker);
  const { shortNames, hasPairedRemote } = branchLabelNames(commit);
  for (const [nameIndex, name] of shortNames.entries()) {
    const branchLabel = createSvgElement('text', {
      x: 0,
      y: 37 + (cutMarkersByHash.has(commit.hash) ? 13 : 0) + nameIndex * 13,
      'text-anchor': 'middle',
      class: 'branch-label',
      'data-testid': 'commit-branch-label',
      fill: color
    });
    branchLabel.textContent =
      truncateBranchName(name) + (hasPairedRemote && nameIndex === 0 ? ' ⇄' : '');
    const labelTitle = createSvgElement('title');
    labelTitle.textContent = name;
    branchLabel.append(labelTitle);
    group.append(branchLabel);
  }
  group.addEventListener('click', () =>
    actions.selectCommit(actions.getSelectedCommit()?.hash === commit.hash ? null : commit)
  );
  group.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      actions.selectCommit(commit);
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
        'data-tag-name': tagName,
        'data-kind': releaseTagPattern.test(tagName) ? 'release' : 'tag',
        class: releaseTagPattern.test(tagName) ? 'release-tag' : 'plain-tag'
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

export function drawCommits(ctx, actions) {
  const { graph, graphElement, commitPositions } = ctx;
  const commitByHash = new Map(graph.commits.map((commit) => [commit.hash, commit]));
  const mergeTargetsBySource = new Map();
  for (const commit of graph.commits) {
    for (const parentHash of commit.parents.slice(1)) {
      if (!mergeTargetsBySource.has(parentHash)) mergeTargetsBySource.set(parentHash, []);
      mergeTargetsBySource.get(parentHash).push(commit);
    }
  }

  const summaryLayer = createSvgElement('g');
  graphElement.append(summaryLayer);
  const nodeContext = { ...ctx, commitByHash, mergeTargetsBySource };
  for (const commit of graph.commits) {
    const position = commitPositions.get(commit.hash);
    if (commit.compactCount) {
      drawSummaryPill(commit, position, summaryLayer, ctx, actions);
    } else {
      drawCommitNode(commit, position, nodeContext, actions);
    }
  }
}

export function drawCheckedOutMarker({ graph, graphElement, commitPositions }) {
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
      marker.append(
        createSvgElement('circle', {
          r: 14,
          fill: 'none',
          stroke: checkedOutReference.color,
          'stroke-width': 2,
          'aria-hidden': 'true'
        })
      );
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
}

export function drawDetachedHeadMarker({ graph, graphElement, commitPositions, ownerReference }) {
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
      const headCommit = graph.commits.find((commit) => commit.hash === graph.headHash);
      marker.append(
        createSvgElement('circle', {
          r: 14,
          fill: 'none',
          stroke: ownerReference(headCommit?.lane)?.color || '#9ca3af',
          'stroke-width': 2,
          'data-testid': 'head-marker-ring',
          'aria-hidden': 'true'
        })
      );
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
}

export function drawHistoryBoundaries({ graph, graphElement, commitPositions }) {
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
}

export function drawDivergenceMarkers({ graph, graphElement, commitPositions }) {
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
}

export function drawCutMarkers({ graph, graphElement, commitPositions }) {
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
}
