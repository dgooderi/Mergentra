// Row, level and column placement of the commits. Pure: depends only on the graph.
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
  const cutMarkersByHash = new Map();
  for (const marker of graph.cutMarkers) {
    cutMarkersByHash.set(marker.commitHash, [
      ...(cutMarkersByHash.get(marker.commitHash) || []),
      marker
    ]);
  }
  // Every commit stays on its lane's row so each branch is one straight line.
  const rowTops = Array.from({ length: rowCount }, (_, row) => row * rowHeight);
  const totalRowsHeight = rowCount * rowHeight;
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
        y: 34 + axisHeight + rowTops[rowByLane.get(commit.lane)]
      }
    ])
  );

  return { axisHeight, indexByHash, cutMarkersByHash, commitPositions, width, height };
}
