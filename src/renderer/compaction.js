export function compactOrdinaryHistory(graph) {
  const commitsByHash = new Map(graph.commits.map((commit) => [commit.hash, commit]));
  const childrenByHash = new Map(graph.commits.map((commit) => [commit.hash, []]));
  const importantHashes = new Set(graph.references.map((reference) => reference.hash));
  for (const hash of graph.shallowBoundaries) {
    importantHashes.add(hash);
  }
  for (const hash of graph.missingObjectBoundaries) {
    importantHashes.add(hash);
  }
  if (graph.headDetached && graph.headHash) {
    importantHashes.add(graph.headHash);
  }

  for (const commit of graph.commits) {
    if (commit.parents.length > 1 || commit.tags.length > 0) {
      importantHashes.add(commit.hash);
    }
    for (const parentHash of commit.parents) {
      childrenByHash.get(parentHash)?.push(commit.hash);
      if (commit.parents.length > 1) {
        importantHashes.add(parentHash);
      }
    }
  }
  for (const [hash, children] of childrenByHash) {
    if (children.length > 1) {
      importantHashes.add(hash);
      for (const childHash of children) {
        importantHashes.add(childHash);
      }
    }
  }
  for (const marker of graph.divergenceMarkers) {
    importantHashes.add(marker.commitHash);
  }
  for (const marker of graph.cutMarkers) {
    importantHashes.add(marker.commitHash);
  }

  const compactedHashes = new Set();
  const summariesByChild = new Map();
  for (const startHash of importantHashes) {
    const start = commitsByHash.get(startHash);
    if (!start) {
      continue;
    }

    for (const firstChildHash of childrenByHash.get(startHash) || []) {
      let cursor = commitsByHash.get(firstChildHash);
      const hiddenCommits = [];

      while (
        cursor &&
        !importantHashes.has(cursor.hash) &&
        cursor.parents.filter((hash) => commitsByHash.has(hash)).length === 1 &&
        (childrenByHash.get(cursor.hash) || []).length === 1 &&
        !compactedHashes.has(cursor.hash)
      ) {
        hiddenCommits.push(cursor);
        cursor = commitsByHash.get(childrenByHash.get(cursor.hash)[0]);
      }

      if (hiddenCommits.length === 0 || !cursor || !importantHashes.has(cursor.hash)) {
        continue;
      }

      const uniqueHiddenCommits = hiddenCommits.filter(
        (commit) => !compactedHashes.has(commit.hash)
      );
      // A single ordinary commit is shown as itself; a +1 summary hides nothing useful.
      if (uniqueHiddenCommits.length < 2) {
        continue;
      }
      for (const commit of uniqueHiddenCommits) {
        compactedHashes.add(commit.hash);
      }

      const summaryHash = `compact:${start.hash}:${cursor.hash}`;
      const summary = {
        hash: summaryHash,
        parents: [start.hash],
        subject: `${uniqueHiddenCommits.length} commits`,
        author: '',
        authorDate: '',
        committerTimestamp: 0,
        lane: uniqueHiddenCommits[0].lane,
        tags: [],
        references: [],
        compactCount: uniqueHiddenCommits.length,
        compactedCommits: [...uniqueHiddenCommits].reverse(),
        compactedHashes: uniqueHiddenCommits.map((commit) => commit.hash)
      };
      const summaries = summariesByChild.get(cursor.hash) || [];
      summaries.push({
        summary,
        replacedParent: uniqueHiddenCommits[uniqueHiddenCommits.length - 1].hash
      });
      summariesByChild.set(cursor.hash, summaries);
    }
  }

  if (compactedHashes.size === 0) {
    return graph;
  }

  const displayCommits = [];
  for (const commit of graph.commits) {
    if (compactedHashes.has(commit.hash)) {
      continue;
    }

    const summaries = summariesByChild.get(commit.hash) || [];
    const replacements = new Map();
    for (const { summary, replacedParent } of summaries) {
      displayCommits.push(summary);
      replacements.set(replacedParent, summary.hash);
    }
    displayCommits.push({
      ...commit,
      originalParents: commit.parents,
      parents: commit.parents.map((parentHash) => replacements.get(parentHash) || parentHash)
    });
  }

  return { ...graph, commits: displayCommits };
}

// Plain commits that stay on one lane (including merges whose side commits share that lane) carry
// no branching information, so each unbroken run of them becomes one summary pill.
export function compactSameLaneRuns(graph) {
  const commits = graph.commits;
  const commitsByHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const pinned = new Set([
    ...graph.shallowBoundaries,
    ...graph.missingObjectBoundaries,
    ...graph.divergenceMarkers.map((marker) => marker.commitHash),
    ...graph.cutMarkers.map((marker) => marker.commitHash)
  ]);
  if (graph.headDetached && graph.headHash) {
    pinned.add(graph.headHash);
  }
  const crossLane = new Set();
  for (const commit of commits) {
    for (const parentHash of commit.parents) {
      const parent = commitsByHash.get(parentHash);
      if (parent && parent.lane !== commit.lane) {
        crossLane.add(commit.hash);
        crossLane.add(parentHash);
      }
    }
  }

  const runs = [];
  const openRuns = new Map();
  for (const commit of commits) {
    const plain =
      !crossLane.has(commit.hash) &&
      !pinned.has(commit.hash) &&
      commit.references.length === 0 &&
      commit.tags.length === 0;
    if (!plain) {
      openRuns.delete(commit.lane);
      continue;
    }
    let run = openRuns.get(commit.lane);
    if (!run) {
      run = [];
      openRuns.set(commit.lane, run);
      runs.push(run);
    }
    run.push(commit);
  }

  const summaryByMember = new Map();
  const summaryByFirst = new Map();
  for (const run of runs.filter((candidate) => candidate.length >= 2)) {
    const memberHashes = new Set(run.map((commit) => commit.hash));
    const compactedCommits = run
      .flatMap((commit) =>
        commit.compactCount ? [...commit.compactedCommits].reverse() : [commit]
      )
      .reverse();
    const summary = {
      hash: `compact-lane:${run[0].hash}:${run[run.length - 1].hash}`,
      parents: [
        ...new Set(
          run.flatMap((commit) => commit.parents).filter((hash) => !memberHashes.has(hash))
        )
      ],
      subject: `${compactedCommits.length} commits`,
      author: '',
      authorDate: '',
      committerTimestamp: 0,
      lane: run[0].lane,
      tags: [],
      references: [],
      compactCount: compactedCommits.length,
      compactedCommits,
      compactedHashes: compactedCommits.map((commit) => commit.hash)
    };
    for (const commit of run) {
      summaryByMember.set(commit.hash, summary);
    }
    summaryByFirst.set(run[0].hash, summary);
  }
  if (summaryByMember.size === 0) {
    return graph;
  }

  const remap = (hashes) => [
    ...new Set(hashes.map((hash) => summaryByMember.get(hash)?.hash || hash))
  ];
  const displayCommits = [];
  for (const commit of commits) {
    const summary = summaryByMember.get(commit.hash);
    if (summary) {
      if (summaryByFirst.get(commit.hash) === summary) {
        displayCommits.push({ ...summary, parents: remap(summary.parents) });
      }
      continue;
    }
    displayCommits.push({
      ...commit,
      originalParents: commit.originalParents || commit.parents,
      parents: remap(commit.parents)
    });
  }
  return { ...graph, commits: displayCommits };
}
