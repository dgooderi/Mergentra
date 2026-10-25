export function summarizeFileHistory(commits, result) {
  const touching = new Set(result.hashes);
  const matches = commits
    .filter((commit) => touching.has(commit.hash))
    .sort((first, second) => second.committerTimestamp - first.committerTimestamp);

  const notes = [];
  if (result.hashes.length === 0) {
    notes.push(
      `No commits in the loaded history changed "${result.path}". Check the spelling of the path.`
    );
  }
  for (const rename of result.renames) {
    notes.push(`Followed a rename: ${rename.from} → ${rename.to}.`);
  }
  if (result.shallow) {
    notes.push('This is a shallow clone, so changes before its oldest commit are not shown.');
  }
  const notLoaded = result.hashes.length - matches.length;
  if (notLoaded > 0) {
    notes.push(
      `${notLoaded} matching ${notLoaded === 1 ? 'commit is' : 'commits are'} not in the loaded graph.`
    );
  }
  return { matches, notes };
}
