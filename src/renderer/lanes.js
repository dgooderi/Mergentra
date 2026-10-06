// Decides which commits are drawn and on which lane, from the loaded graph, the branches the
// user selected and the time range. Pure: no DOM or shared state.
// A branch is available in the time range when a commit on its first-parent chain falls inside it.
const graphIndexes = new WeakMap();
const availabilityCache = new WeakMap();

function indexesFor(graph) {
  let indexes = graphIndexes.get(graph);
  if (!indexes) {
    const commitsByHash = new Map();
    const tipIndex = new Map();
    const mergeCommits = [];
    graph.commits.forEach((commit, index) => {
      commitsByHash.set(commit.hash, commit);
      tipIndex.set(commit.hash, index);
      if (commit.parents.length > 1) {
        mergeCommits.push(commit);
      }
    });
    const mainReference = graph.references.find((reference) => reference.name === 'main');
    let mainContainsAllCommits = false;
    if (mainReference && mergeCommits.length === 0) {
      let commit = commitsByHash.get(mainReference.hash);
      let reachableCount = 0;
      while (commit) {
        reachableCount += 1;
        commit = commitsByHash.get(commit.parents[0]);
      }
      mainContainsAllCommits = reachableCount === graph.commits.length;
    }
    indexes = { commitsByHash, tipIndex, mergeCommits, mainContainsAllCommits };
    graphIndexes.set(graph, indexes);
  }
  return indexes;
}

export function computeAvailableReferences(currentGraph, timeRange) {
  if (!currentGraph || !timeRange) {
    return null;
  }
  const cached = availabilityCache.get(currentGraph);
  if (cached?.start === timeRange.start && cached.end === timeRange.end) {
    return new Set(cached.names);
  }
  const { commitsByHash } = indexesFor(currentGraph);
  const memo = new Map();
  const inRange = (commit) =>
    commit.committerTimestamp * 1000 >= timeRange.start &&
    commit.committerTimestamp * 1000 < timeRange.end;
  const available = (tipHash) => {
    const chain = [];
    let result = false;
    let commit = commitsByHash.get(tipHash);
    while (commit) {
      if (memo.has(commit.hash)) {
        result = memo.get(commit.hash);
        break;
      }
      chain.push(commit.hash);
      if (inRange(commit)) {
        result = true;
        break;
      }
      commit = commitsByHash.get(commit.parents[0]);
    }
    for (const hash of chain) {
      memo.set(hash, result);
    }
    return result;
  };
  const names = currentGraph.references
    .filter((reference) => available(reference.hash))
    .map((reference) => reference.name);
  availabilityCache.set(currentGraph, { start: timeRange.start, end: timeRange.end, names });
  return new Set(names);
}

export function buildFilteredGraph(sourceGraph, visibleReferences, timeRange) {
  const references = sourceGraph.references
    .filter((reference) => visibleReferences.has(reference.name))
    .map((reference, lane) => ({ ...reference, lane }));
  const {
    commitsByHash,
    tipIndex,
    mergeCommits,
    mainContainsAllCommits: completeMainHistory
  } = indexesFor(sourceGraph);
  const laneByHash = new Map();
  const mainReference = references.find((reference) => reference.name === 'main');
  const mainContainsAllCommits = Boolean(mainReference && completeMainHistory);

  // Claim each branch's first-parent chain first so merged-in branches keep their own lane.
  // Branches that contain others (for example a release line that merged a hotfix) claim
  // shared commits first; `main` always goes first.
  if (!mainContainsAllCommits) {
    const claimOrder = [...references].sort(
      (left, right) =>
        (right.name === 'main' ? 1 : 0) - (left.name === 'main' ? 1 : 0) ||
        (tipIndex.get(right.hash) ?? -1) - (tipIndex.get(left.hash) ?? -1)
    );
    for (const reference of claimOrder) {
      let commit = commitsByHash.get(reference.hash);
      while (commit && !laneByHash.has(commit.hash)) {
        laneByHash.set(commit.hash, reference.lane);
        commit = commitsByHash.get(commit.parents[0]);
      }
    }
  }

  // Commits reached only through a merge's second parent sit on a side lane below their branch,
  // so a merged-in branch visibly leaves and rejoins instead of hiding on the main line.
  // The walk goes through commits already claimed by a first-parent chain so it still finds
  // the second parents of merges on that chain.
  const sideLanes = new Map();
  if (!mainContainsAllCommits && mergeCommits.length > 0) {
    const walked = new Set();
    for (const reference of references) {
      const sideLane = references.length + 1 + reference.lane;
      const pending = [reference.hash];
      while (pending.length > 0) {
        const hash = pending.pop();
        const commit = commitsByHash.get(hash);
        if (!commit || walked.has(hash)) {
          continue;
        }
        walked.add(hash);
        if (!laneByHash.has(hash)) {
          if (hash !== reference.hash) {
            sideLanes.set(sideLane, reference.lane);
          }
          laneByHash.set(hash, hash === reference.hash ? reference.lane : sideLane);
        }
        pending.push(...commit.parents);
      }
    }
  }

  if (!mainContainsAllCommits && sourceGraph.headDetached && sourceGraph.headHash) {
    const pending = [sourceGraph.headHash];
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

  const reachableHashes = mainContainsAllCommits ? null : new Set(laneByHash.keys());
  const commitsInRange = sourceGraph.commits.filter(
    (commit) =>
      (mainContainsAllCommits || reachableHashes.has(commit.hash)) &&
      (!timeRange ||
        (commit.committerTimestamp * 1000 >= timeRange.start &&
          commit.committerTimestamp * 1000 < timeRange.end))
  );
  const inRangeHashes = new Set(commitsInRange.map((commit) => commit.hash));
  const visibleNames = new Set(references.map((reference) => reference.name));
  const graph = {
    ...sourceGraph,
    references,
    sideLanes,
    commits: commitsInRange.map((commit) => ({
      ...commit,
      lane: mainContainsAllCommits ? mainReference.lane : laneByHash.get(commit.hash),
      references: commit.references.filter(
        (name) => visibleNames.has(name) || commit.tags.includes(name)
      )
    })),
    cutMarkers: commitsInRange.flatMap((commit) => {
      if (!timeRange) {
        return [];
      }
      const directions = new Set(
        commit.parents
          .filter(
            (parentHash) =>
              (mainContainsAllCommits
                ? commitsByHash.has(parentHash)
                : reachableHashes.has(parentHash)) && !inRangeHashes.has(parentHash)
          )
          .map((parentHash) =>
            commitsByHash.get(parentHash).committerTimestamp * 1000 < timeRange.start
              ? 'older'
              : 'newer'
          )
      );
      return [...directions].map((direction) => ({ commitHash: commit.hash, direction }));
    }),
    divergenceMarkers: sourceGraph.divergenceMarkers.filter(
      (marker) => visibleNames.has(marker.branchName) && inRangeHashes.has(marker.commitHash)
    ),
    laneCount: Math.max(references.length, 1)
  };

  return graph;
}
