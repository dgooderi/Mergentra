const FIELD_SEPARATOR = '\0';
const RECORD_SEPARATOR = '\x1e';
const STASH_FORMAT = ['%H', '%P', '%cI', '%gs'].join('%x00') + '%x1e';

function parseStashList(output) {
  return output
    .split(RECORD_SEPARATOR)
    .map((record) => record.replace(/^\r?\n/, ''))
    .filter(Boolean)
    .map((record, index) => {
      const [hash, parentList, date, reflogMessage] = record.split(FIELD_SEPARATOR);
      const described = /^(?:WIP on|On) ([^:]+): ([\s\S]*)$/.exec(reflogMessage);
      return {
        index,
        ref: `stash@{${index}}`,
        hash,
        baseHash: parentList.split(' ')[0],
        date,
        branch: described ? described[1] : null,
        message: described ? described[2] : reflogMessage
      };
    });
}

async function listStashes({ runGit }, gitPath, repositoryPath) {
  const stashRef = await runGit(gitPath, [
    '-C',
    repositoryPath,
    'for-each-ref',
    '--format=%(objectname)',
    'refs/stash'
  ]);
  if (stashRef.stdout.trim() === '') {
    return [];
  }
  try {
    const result = await runGit(gitPath, [
      '-C',
      repositoryPath,
      'log',
      '--walk-reflogs',
      '--no-show-signature',
      `--format=${STASH_FORMAT}`,
      'refs/stash'
    ]);
    return parseStashList(result.stdout);
  } catch (error) {
    throw new Error(
      'Stashes are unavailable: Git could not read a saved stash object (missing objects).',
      { cause: error }
    );
  }
}

function parseNameStatus(output) {
  const parts = output.split('\0').filter(Boolean);
  const changes = [];
  for (let index = 0; index + 1 < parts.length; index += 2) {
    changes.push({ status: parts[index], path: parts[index + 1] });
  }
  return changes;
}

async function inspectStash({ runGit }, gitPath, repositoryPath, stashIndex) {
  if (!Number.isSafeInteger(stashIndex) || stashIndex < 0 || stashIndex > 1_000_000) {
    throw new Error('Choose a stash from the list.');
  }
  const git = (...args) => runGit(gitPath, ['-C', repositoryPath, ...args]);
  const ref = `stash@{${stashIndex}}`;
  let hash;
  try {
    hash = (await git('rev-parse', '--verify', ref)).stdout.trim();
  } catch {
    return {
      available: false,
      message: `${ref} no longer exists. Refresh to see the current stashes.`
    };
  }
  try {
    const parents = (await git('rev-list', '--parents', '--max-count=1', hash)).stdout
      .trim()
      .split(' ')
      .slice(1);
    const tracked = await git(
      'diff-tree',
      '-r',
      '--no-commit-id',
      '--no-renames',
      '--no-ext-diff',
      '--no-textconv',
      '--name-status',
      '-z',
      parents[0],
      hash
    );
    const changes = parseNameStatus(tracked.stdout);
    if (parents[2]) {
      const untracked = await git('ls-tree', '-r', '--name-only', '-z', parents[2]);
      for (const untrackedPath of untracked.stdout.split('\0').filter(Boolean)) {
        changes.push({ status: 'A', path: untrackedPath });
      }
    }
    return { available: true, changes };
  } catch {
    return {
      available: false,
      message: `${ref} is listed, but Git could not read its saved changes (missing objects).`
    };
  }
}

module.exports = { parseStashList, listStashes, inspectStash };
