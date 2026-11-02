import { findMainReference } from './lanes.js';

// Git does not record which branch a merge came from or went into, so the names here are
// inferred from the references and, failing that, from the conventional merge message.
const MERGE_MESSAGES = [
  /^Merge branch '([^']+)'(?: of \S+)?(?: into (.+))?$/,
  /^Merge remote-tracking branch '([^']+)'(?: into (.+))?$/,
  /^Merge pull request #\d+ from (?:[^/\s]+\/)?(\S+)$/
];

function firstParentChain(tipHash, commitsByHash) {
  const chain = new Set();
  let commit = commitsByHash.get(tipHash);
  while (commit && !chain.has(commit.hash)) {
    chain.add(commit.hash);
    commit = commitsByHash.get(commit.parents[0]);
  }
  return chain;
}

function namesFromMessage(subject) {
  for (const pattern of MERGE_MESSAGES) {
    const match = pattern.exec(subject || '');
    if (match) {
      return { source: match[1], destination: match[2] || null };
    }
  }
  return { source: null, destination: null };
}

function inferMerge(commit, graph, parents) {
  const commitsByHash = new Map(graph.commits.map((item) => [item.hash, item]));
  const references = [...graph.references].sort(
    (left, right) => Number(Boolean(left.remote)) - Number(Boolean(right.remote))
  );
  const chains = new Map(
    references.map((reference) => [reference.name, firstParentChain(reference.hash, commitsByHash)])
  );
  const message = namesFromMessage(commit.subject);
  const destination =
    references.find((reference) => chains.get(reference.name).has(commit.hash))?.name ??
    message.destination;
  const source =
    references.find(
      (reference) =>
        reference.name !== destination &&
        chains.get(reference.name).has(parents[1]) &&
        !chains.get(reference.name).has(commit.hash)
    )?.name ?? message.source;
  return { kind: 'merge', source, destination };
}

// Side lanes belong to a branch that was merged into another one, so they carry the owner's
// reference. This names each from the merge that brought it in, to avoid labelling them all
// with the owner's name. Lanes whose name cannot be inferred are absent from the map.
export function sideLaneNames(graph) {
  const names = new Map();
  if (!graph.sideLanes || graph.sideLanes.size === 0) {
    return names;
  }
  const commitsByHash = new Map(graph.commits.map((item) => [item.hash, item]));
  for (const commit of graph.commits) {
    const parents = commit.originalParents || commit.parents;
    for (const parentHash of parents.slice(1)) {
      const lane = commitsByHash.get(parentHash)?.lane;
      if (lane !== undefined && graph.sideLanes.has(lane) && !names.has(lane)) {
        const source = inferBranchContext(commit, graph)?.source;
        if (source) {
          names.set(lane, source);
        }
      }
    }
  }
  return names;
}

export function inferBranchContext(commit, graph) {
  const parents = commit.originalParents || commit.parents;
  if (parents.length > 1) {
    return inferMerge(commit, graph, parents);
  }
  const marker = (graph.divergenceMarkers || []).find((item) => item.commitHash === commit.hash);
  if (marker) {
    const localReferences = graph.references.filter((reference) => !reference.remote);
    const mainReference = findMainReference(graph.references) || localReferences[0];
    return {
      kind: 'divergence',
      source: marker.branchName,
      destination: mainReference?.name ?? null
    };
  }
  return null;
}
