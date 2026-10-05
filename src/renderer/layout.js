// Row, level and column placement of the commits. Pure: depends only on the graph.
export function branchLabelNames(commit) {
  const branchNames = commit.references.filter((name) => !commit.tags.includes(name));
  const shortNames = branchNames.filter(
    (name) => !(name.includes('/') && branchNames.includes(name.slice(name.indexOf('/') + 1)))
  );
  return { branchNames, shortNames, hasPairedRemote: shortNames.length < branchNames.length };
}

export function truncateBranchName(name) {
  return name.length > 22 ? `…${name.slice(-21)}` : name;
}

export function computeGraphLayout(graph) {
  const rowHeight = 56;
  const axisHeight = 46;
  const leftPadding = 72;
  const rightPadding = 160;
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
  const mainReference =
    graph.references.find((reference) => !reference.remote && reference.name === 'main') ||
    graph.references.find((reference) => !reference.remote && reference.name === 'master') ||
    graph.references.find((reference) => !reference.remote);
  const rootLane = laneSpans.has(mainReference?.lane) ? mainReference.lane : graph.commits[0]?.lane;
  const rowByLane = new Map();
  const rowEnds = [Infinity];
  const lanesByStart = [...laneSpans.keys()].sort(
    (a, b) => laneSpans.get(a).first - laneSpans.get(b).first || a - b
  );
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
  // A commit whose labels would overlap the previous commit in its row drops to a lower level,
  // carrying its labels with it; rows grow to make room for the extra levels.
  const cutMarkersByHash = new Map();
  for (const marker of graph.cutMarkers) {
    cutMarkersByHash.set(marker.commitHash, [
      ...(cutMarkersByHash.get(marker.commitHash) || []),
      marker
    ]);
  }
  const commitLevels = new Map();
  const levelEnds = Array.from({ length: rowCount }, () => []);
  const rowMaxLevel = Array.from({ length: rowCount }, () => 0);
  const rowLabelHeight = Array.from({ length: rowCount }, () => 0);
  graph.commits.forEach((commit, index) => {
    const row = rowByLane.get(commit.lane);
    const centre = leftPadding + index * columnWidth;
    const names = branchLabelNames(commit).shortNames;
    const hasCut = cutMarkersByHash.has(commit.hash);
    const textLength = Math.max(
      7,
      hasCut ? 'Earlier history continues'.length : 0,
      ...names.map((name) => truncateBranchName(name).length + 2)
    );
    const half = (textLength * 7) / 2 + 6;
    const ends = levelEnds[row];
    let level = ends.findIndex((end) => end < centre - half);
    if (level === -1) {
      level = ends.length;
    }
    ends[level] = centre + half;
    commitLevels.set(commit.hash, level);
    rowMaxLevel[row] = Math.max(rowMaxLevel[row], level);
    rowLabelHeight[row] = Math.max(rowLabelHeight[row], (hasCut ? 1 : 0) + names.length);
  });
  const levelStepByRow = rowLabelHeight.map((lines) => rowHeight + Math.max(lines - 1, 0) * 13);
  const rowTops = [];
  let totalRowsHeight = 0;
  for (let row = 0; row < rowCount; row += 1) {
    rowTops.push(totalRowsHeight);
    totalRowsHeight += rowHeight + rowMaxLevel[row] * levelStepByRow[row];
  }
  const width = Math.max(
    144,
    leftPadding + rightPadding + Math.max(graph.commits.length - 1, 0) * columnWidth
  );
  const height = 60 + axisHeight + totalRowsHeight;

  const commitPositions = new Map(
    graph.commits.map((commit, index) => [
      commit.hash,
      {
        x: leftPadding + index * columnWidth,
        y:
          34 +
          axisHeight +
          rowTops[rowByLane.get(commit.lane)] +
          commitLevels.get(commit.hash) * levelStepByRow[rowByLane.get(commit.lane)]
      }
    ])
  );

  return { axisHeight, indexByHash, cutMarkersByHash, commitPositions, width, height };
}
