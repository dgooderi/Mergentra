// Decides which commits are drawn and on which lane, from the loaded graph, the branches the
// user selected and the time range. Pure: no DOM or shared state.
// A branch is available in the time range when a commit on its first-parent chain falls inside it.
export function computeAvailableReferences(currentGraph, timeRange) {
  if (!currentGraph || !timeRange) {
    return null;
  }
  const commitsByHash = new Map(currentGraph.commits.map((commit) => [commit.hash, commit]));
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
  return new Set(
    currentGraph.references.filter((reference) => available(reference.hash)).map((r) => r.name)
  );
}

export function buildFilteredGraph(sourceGraph, visibleReferences, timeRange) {
  const references = sourceGraph.references
    .filter((reference) => visibleReferences.has(reference.name))
    .map((reference, lane) => ({ ...reference, lane }));
  const commitsByHash = new Map(sourceGraph.commits.map((commit) => [commit.hash, commit]));
  const laneByHash = new Map();

  // Claim each branch's first-parent chain first so merged-in branches keep their own lane.
  // Branches that contain others (for example a release line that merged a hotfix) claim
  // shared commits first; `main` always goes first.
  const tipIndex = new Map(sourceGraph.commits.map((commit, index) => [commit.hash, index]));
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

  // Commits reached only through a merge's second parent sit on a side lane below their branch,
  // so a merged-in branch visibly leaves and rejoins instead of hiding on the main line.
  // The walk goes through commits already claimed by a first-parent chain so it still finds
  // the second parents of merges on that chain.
  const sideLanes = new Map();
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

  if (sourceGraph.headDetached && sourceGraph.headHash) {
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

  const reachableHashes = new Set(laneByHash.keys());
  const commitsInRange = sourceGraph.commits.filter(
    (commit) =>
      reachableHashes.has(commit.hash) &&
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
      lane: laneByHash.get(commit.hash),
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
          .filter((parentHash) => reachableHashes.has(parentHash) && !inRangeHashes.has(parentHash))
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
