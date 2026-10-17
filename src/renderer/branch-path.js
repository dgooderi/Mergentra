// Works out how branches relate to each other from where their first-parent chains meet.
// Pure: no DOM or shared state.
import { findMainReference } from './lanes.js';

function firstParentChainDistances(commitsByHash, tipHash) {
  const distances = new Map();
  let commit = commitsByHash.get(tipHash);
  let distance = 0;
  while (commit && !distances.has(commit.hash)) {
    distances.set(commit.hash, distance);
    distance += 1;
    commit = commitsByHash.get(commit.parents[0]);
  }
  return distances;
}

// The parent of a branch is the branch it forked from: the first commit on its chain that
// another branch also holds. `main` always qualifies; any other branch must have an older tip
// (commits are listed oldest first), so branches that share a fork point are not each other's parent.
export function parentReferenceName(graph, referenceName) {
  const commitsByHash = new Map(graph.commits.map((commit) => [commit.hash, commit]));
  const tipOrder = new Map(graph.commits.map((commit, index) => [commit.hash, index]));
  const main = findMainReference(graph.references);
  const reference = graph.references.find((candidate) => candidate.name === referenceName);
  if (!reference || reference.name === main?.name) {
    return null;
  }
  const targetDistances = firstParentChainDistances(commitsByHash, reference.hash);
  const targetTipOrder = tipOrder.get(reference.hash);
  let parent = null;
  let parentDistance = Infinity;

  for (const candidate of graph.references) {
    if (
      candidate.name === reference.name ||
      (candidate.name !== main?.name && tipOrder.get(candidate.hash) >= targetTipOrder)
    ) {
      continue;
    }
    let commit = commitsByHash.get(candidate.hash);
    while (commit) {
      const distance = targetDistances.get(commit.hash);
      if (
        distance !== undefined &&
        (distance < parentDistance ||
          (distance === parentDistance && candidate.name === main?.name))
      ) {
        parent = candidate.name;
        parentDistance = distance;
      }
      commit = commitsByHash.get(commit.parents[0]);
    }
  }
  return parent;
}

// The branch and each parent above it, up to main.
export function branchPathToMain(graph, referenceName) {
  const path = [referenceName];
  let parent = parentReferenceName(graph, referenceName);
  while (parent && !path.includes(parent)) {
    path.push(parent);
    parent = parentReferenceName(graph, parent);
  }
  return path;
}
