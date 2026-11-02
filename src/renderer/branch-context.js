import { findMainReference } from './lanes.js';

// Git does not record which branch a merge came from or went into, so the names here are
// inferred from the references and, failing that, from the conventional merge message.
const MERGE_MESSAGES = [
  /^Merge branch '([^']+)'(?: of \S+)?(?: into (.+))?$/,
  /^Merge remote-tracking branch '([^']+)'(?: into (.+))?$/,
  /^Merge pull request #\d+ from (?:[^/\s]+\/)?(\S+)$/
];

function namesFromMessage(subject) {
  for (const pattern of MERGE_MESSAGES) {
    const match = pattern.exec(subject || '');
    if (match) {
      return { source: match[1], destination: match[2] || null };
    }
  }
  return { source: null, destination: null };
}

// Built once per graph: the old per-click rebuild walked every reference down its whole first-parent
// chain, which froze the window on repositories with many commits and branches.
const indexCache = new WeakMap();

function indexFor(graph) {
  let index = indexCache.get(graph);
  if (!index) {
    const commitsByHash = new Map(graph.commits.map((item) => [item.hash, item]));
    const firstParentChildren = new Map();
    for (const item of graph.commits) {
      const parent = item.parents[0];
      if (parent !== undefined && commitsByHash.has(parent)) {
        const children = firstParentChildren.get(parent);
        if (children) {
          children.push(item.hash);
        } else {
          firstParentChildren.set(parent, [item.hash]);
        }
      }
    }
    const references = [...graph.references].sort(
      (left, right) => Number(Boolean(left.remote)) - Number(Boolean(right.remote))
    );
    index = { commitsByHash, firstParentChildren, references };
    indexCache.set(graph, index);
  }
  return index;
}

// Every commit whose first-parent chain passes through the start commit, itself included.
function firstParentDescendants(startHash, firstParentChildren) {
  const seen = new Set([startHash]);
  const pending = [startHash];
  while (pending.length > 0) {
    for (const child of firstParentChildren.get(pending.pop()) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        pending.push(child);
      }
    }
  }
  return seen;
}

function inferMerge(commit, graph, parents) {
  const { commitsByHash, firstParentChildren, references } = indexFor(graph);
  const message = namesFromMessage(commit.subject);
  // A reference's first-parent chain contains a commit exactly when its tip is a first-parent descendant of it.
  const holdsCommit = commitsByHash.has(commit.hash)
    ? firstParentDescendants(commit.hash, firstParentChildren)
    : new Set([commit.hash]);
  const destination =
    references.find((reference) => holdsCommit.has(reference.hash))?.name ?? message.destination;
  const holdsMerged = commitsByHash.has(parents[1])
    ? firstParentDescendants(parents[1], firstParentChildren)
    : new Set([parents[1]]);
  const source =
    references.find(
      (reference) =>
        reference.name !== destination &&
        holdsMerged.has(reference.hash) &&
        !holdsCommit.has(reference.hash)
    )?.name ?? message.source;
  return { kind: 'merge', source, destination };
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
