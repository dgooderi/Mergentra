// Finds commits in the loaded graph by a text query. Pure: no DOM, shared state or Git access.
const haystacks = new WeakMap();

// Lower-casing every field on each keystroke is wasteful on large histories, so do it once.
function haystackFor(commit) {
  let haystack = haystacks.get(commit);
  if (!haystack) {
    haystack = [
      commit.subject,
      commit.author,
      commit.authorDate,
      ...(commit.references || []),
      ...(commit.tags || [])
    ].map((text) => String(text ?? '').toLowerCase());
    haystacks.set(commit, haystack);
  }
  return haystack;
}

function matches(commit, needle) {
  return (
    commit.hash.startsWith(needle) || haystackFor(commit).some((text) => text.includes(needle))
  );
}

export const MAX_QUERY_LENGTH = 200;
export const MAX_RESULTS = 100;

export function searchCommits(commits, query) {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return { status: 'empty', results: [] };
  }
  if (needle.length > MAX_QUERY_LENGTH) {
    return { status: 'invalid', results: [] };
  }
  const results = [];
  let truncated = false;
  for (const commit of commits) {
    if (!matches(commit, needle)) {
      continue;
    }
    if (results.length === MAX_RESULTS) {
      truncated = true;
      break;
    }
    results.push(commit);
  }
  return { status: results.length > 0 ? 'results' : 'no-results', results, truncated };
}

function reaches(commitsByHash, tipHashes, targetHash) {
  const pending = [...tipHashes];
  const seen = new Set();
  while (pending.length > 0) {
    const hash = pending.pop();
    if (hash === targetHash) {
      return true;
    }
    if (seen.has(hash)) {
      continue;
    }
    seen.add(hash);
    pending.push(...(commitsByHash.get(hash)?.parents || []));
  }
  return false;
}

function localDayRange(timestampMilliseconds) {
  const day = new Date(timestampMilliseconds);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

// Chooses the smallest change to the reference filter and time range that draws the commit:
// the first reference that reaches it is added, and an out-of-range time range is narrowed to
// the commit's local day. Compacted history needs no change; the renderer finds its summary.
export function revealCommit(graph, hash, { visibleReferences, timeRange }) {
  const commitsByHash = new Map(graph.commits.map((commit) => [commit.hash, commit]));
  const target = commitsByHash.get(hash);
  const revealed = { visibleReferences, timeRange, changed: false };
  if (!target) {
    return revealed;
  }
  const visibleTips = graph.references
    .filter((reference) => visibleReferences.has(reference.name))
    .map((reference) => reference.hash);
  if (!reaches(commitsByHash, visibleTips, hash)) {
    const reference = graph.references.find(
      (candidate) =>
        !visibleReferences.has(candidate.name) && reaches(commitsByHash, [candidate.hash], hash)
    );
    if (reference) {
      revealed.visibleReferences = new Set([...visibleReferences, reference.name]);
      revealed.changed = true;
    }
  }
  const milliseconds = target.committerTimestamp * 1000;
  if (timeRange && (milliseconds < timeRange.start || milliseconds >= timeRange.end)) {
    revealed.timeRange = localDayRange(milliseconds);
    revealed.changed = true;
  }
  return revealed;
}
