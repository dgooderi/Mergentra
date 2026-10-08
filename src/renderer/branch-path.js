// Works out how branches relate to each other from where their first-parent chains meet.
// Pure: no DOM or shared state.
import { findMainReference } from './lanes.js';

function firstParentChain(commitsByHash, tipHash) {
  const chain = [];
  let commit = commitsByHash.get(tipHash);
  while (commit) {
    chain.push(commit.hash);
    commit = commitsByHash.get(commit.parents[0]);
  }
  return chain;
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
  const others = graph.references
    .filter((candidate) => candidate.name !== reference.name)
    .map((candidate) => ({
      name: candidate.name,
      tipOrder: tipOrder.get(candidate.hash),
      chain: new Set(firstParentChain(commitsByHash, candidate.hash))
    }));
  for (const hash of firstParentChain(commitsByHash, reference.hash)) {
    const holders = others.filter(
      (other) =>
        other.chain.has(hash) &&
        (other.name === main?.name || other.tipOrder < tipOrder.get(reference.hash))
    );
    if (holders.length > 0) {
      return (holders.find((other) => other.name === main?.name) || holders[0]).name;
    }
  }
  return null;
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
