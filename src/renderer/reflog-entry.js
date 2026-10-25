const NOTES = {
  'in-graph': 'Select to show this commit in the graph.',
  unreachable:
    'This commit is in the repository but is not reachable from any local branch or remote-tracking reference shown in the graph, so it can only be inspected here.',
  unavailable:
    'This commit object is no longer in the repository. Git removes unreferenced objects after their reflog entries expire, and a partial clone may never have downloaded it.',
  'no-commit': 'This entry records the reference being deleted, so it has no commit.'
};

export function describeReflogEntry(entry, graphHashes) {
  let state = 'unreachable';
  if (entry.hash === null) {
    state = 'no-commit';
  } else if (!entry.available) {
    state = 'unavailable';
  } else if (graphHashes.has(entry.hash)) {
    state = 'in-graph';
  }
  return { state, note: NOTES[state] };
}
