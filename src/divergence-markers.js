const { mainLineName } = require('./main-line');

function computeDivergenceMarkers(commits, orderedReferences) {
  const commitsByHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const commitIndex = new Map(commits.map((commit, index) => [commit.hash, index]));

  function ancestorsOf(commitHash) {
    const ancestors = new Set();
    const pending = [commitHash];
    while (pending.length > 0) {
      const hash = pending.pop();
      if (ancestors.has(hash) || !commitsByHash.has(hash)) {
        continue;
      }
      ancestors.add(hash);
      pending.push(...commitsByHash.get(hash).parents);
    }
    return ancestors;
  }

  function pathToAncestor(commitHash, ancestorHash) {
    const previous = new Map([[commitHash, null]]);
    const pending = [commitHash];
    for (let cursor = 0; cursor < pending.length; cursor += 1) {
      const hash = pending[cursor];
      if (hash === ancestorHash) {
        const path = [];
        let currentHash = hash;
        while (currentHash !== null) {
          path.push(currentHash);
          currentHash = previous.get(currentHash);
        }
        return path.reverse();
      }

      for (const parentHash of commitsByHash.get(hash)?.parents || []) {
        if (!previous.has(parentHash) && commitsByHash.has(parentHash)) {
          previous.set(parentHash, hash);
          pending.push(parentHash);
        }
      }
    }
    return [];
  }

  const localReferences = orderedReferences.filter((reference) => !reference.remote);
  const mainName = mainLineName(localReferences.map((reference) => reference.name));
  const mainReference =
    localReferences.find((reference) => reference.name === mainName) || localReferences[0];
  const divergenceMarkers = [];

  if (mainReference) {
    const mainAncestors = ancestorsOf(mainReference.hash);
    for (const reference of localReferences) {
      if (reference.name === mainReference.name) {
        continue;
      }
      const referenceAncestors = ancestorsOf(reference.hash);
      const commonAncestors = [...referenceAncestors]
        .filter((hash) => mainAncestors.has(hash))
        .sort((left, right) => (commitIndex.get(right) ?? -1) - (commitIndex.get(left) ?? -1));

      for (const ancestorHash of commonAncestors) {
        const branchPath = pathToAncestor(reference.hash, ancestorHash);
        const mainPath = pathToAncestor(mainReference.hash, ancestorHash);
        if (branchPath.length > 1 && mainPath.length > 1) {
          divergenceMarkers.push({
            branchName: reference.name,
            ancestorHash,
            commitHash: branchPath[branchPath.length - 2],
            inferred: true
          });
          break;
        }
      }
    }
  }

  return divergenceMarkers;
}

module.exports = { computeDivergenceMarkers };
