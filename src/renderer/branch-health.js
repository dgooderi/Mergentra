// Summarises each local branch against a target branch from the loaded commit graph.
// Pure: no DOM or shared state. Git records no branch-creation event, so the divergence commit
// is inferred from where the branch's history leaves the target's.
import { findMainReference } from './lanes.js';

const UNCERTAINTY =
  'History is shallow or incomplete here, so these counts and the divergence point may be inaccurate.';

const STATUS_ORDER = ['diverged', 'unrelated', 'contained', 'same-commit', 'target'];

function rankOf(row) {
  return STATUS_ORDER.indexOf(row.status);
}

// Most diverged first, then the stalest tip, then by name for a stable order.
function compareRows(left, right) {
  return (
    (right.ahead ?? 0) + (right.behind ?? 0) - ((left.ahead ?? 0) + (left.behind ?? 0)) ||
    (left.lastCommitTimestamp ?? 0) - (right.lastCommitTimestamp ?? 0) ||
    left.name.localeCompare(right.name)
  );
}

// `incomplete` is set when the walk touches a history boundary or a parent that was not loaded.
function ancestorsOf(tipHash, commitsByHash, boundaries) {
  const hashes = new Set();
  let incomplete = false;
  const pending = [tipHash];
  while (pending.length > 0) {
    const hash = pending.pop();
    const commit = commitsByHash.get(hash);
    if (!commit) {
      incomplete = true;
      continue;
    }
    if (hashes.has(hash)) {
      continue;
    }
    hashes.add(hash);
    incomplete = incomplete || boundaries.has(hash);
    for (const parent of commit.parents) {
      pending.push(parent);
    }
  }
  return { hashes, incomplete };
}

export function computeBranchHealth(graph, targetName) {
  const commitsByHash = new Map(graph.commits.map((commit) => [commit.hash, commit]));
  const boundaries = new Set([...graph.shallowBoundaries, ...graph.missingObjectBoundaries]);
  const target =
    graph.references.find((reference) => !reference.remote && reference.name === targetName) ||
    (targetName ? null : findMainReference(graph.references));
  if (!target) {
    return {
      targetName: null,
      rows: [],
      explanation:
        graph.commits.length === 0
          ? 'This repository has no commits yet, so there are no branches to compare.'
          : 'Select a target branch to compare the other branches against.'
    };
  }
  targetName = target.name;
  const targetAncestors = ancestorsOf(target.hash, commitsByHash, boundaries);
  const rows = graph.references
    .filter((reference) => !reference.remote)
    .map((reference) => {
      if (reference.name === targetName) {
        return {
          name: reference.name,
          status: 'target',
          ahead: null,
          behind: null,
          uncertain: false,
          explanation: 'This is the target branch, so there is nothing to compare.'
        };
      }
      const branchAncestors = ancestorsOf(reference.hash, commitsByHash, boundaries);
      const ancestors = branchAncestors.hashes;
      let ahead = 0;
      let divergence = null;
      for (const hash of ancestors) {
        if (targetAncestors.hashes.has(hash)) {
          continue;
        }
        ahead += 1;
        const unique = commitsByHash.get(hash);
        const forkPointHash = unique.parents.find((parent) => targetAncestors.hashes.has(parent));
        if (
          forkPointHash !== undefined &&
          (!divergence || unique.committerTimestamp < divergence.timestamp)
        ) {
          divergence = { hash, forkPointHash, timestamp: unique.committerTimestamp };
        }
      }
      let behind = 0;
      for (const hash of targetAncestors.hashes) {
        if (!ancestors.has(hash)) {
          behind += 1;
        }
      }
      let status = 'diverged';
      let explanation = null;
      if (ahead === 0 && behind === 0) {
        status = 'same-commit';
        explanation = 'This branch points at the same commit as the target.';
      } else if (ahead === 0) {
        status = 'contained';
        explanation =
          'Every commit on this branch is already in the target, so it has no unique commits.';
      } else if (ahead === ancestors.size) {
        status = 'unrelated';
        explanation = 'This branch shares no history with the target.';
      }
      const uncertain = branchAncestors.incomplete || targetAncestors.incomplete;
      return {
        name: reference.name,
        status,
        explanation,
        uncertain,
        uncertainty: uncertain ? UNCERTAINTY : null,
        ahead,
        behind,
        divergenceHash: divergence?.hash ?? null,
        forkPointHash: divergence?.forkPointHash ?? null,
        lastCommitTimestamp: commitsByHash.get(reference.hash)?.committerTimestamp ?? null
      };
    });
  rows.sort((left, right) => rankOf(left) - rankOf(right) || compareRows(left, right));
  return { targetName, rows };
}
