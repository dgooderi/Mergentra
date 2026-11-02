const fs = require('node:fs');
const path = require('node:path');
const { parseMissingObjectHashes } = require('./repository-output');

const DEFAULT_LIMIT = 200;
const NULL_HASH = /^0+$/;
const RAW_ENTRY = /^[0-9a-f]+ ([0-9a-f]+) .* (\d+) [+-]\d{4}$/;

// `git reflog show` silently drops entries whose commit is missing, so the log file is read
// directly to keep those entries visible and explain them.
function parseReflogFile(content) {
  const entries = [];
  for (const line of content.split(/\r?\n/).filter(Boolean)) {
    const tab = line.indexOf('\t');
    const match = RAW_ENTRY.exec(tab === -1 ? line : line.slice(0, tab));
    if (!match) {
      continue;
    }
    const message = tab === -1 ? '' : line.slice(tab + 1);
    const colon = message.indexOf(': ');
    entries.push({
      hash: NULL_HASH.test(match[1]) ? null : match[1],
      action: colon === -1 ? message : message.slice(0, colon),
      message,
      timestamp: Number(match[2])
    });
  }
  return entries.reverse();
}

async function findMissingHashes({ runGitWithInput }, gitPath, repositoryPath, hashes) {
  if (hashes.length === 0) {
    return new Set();
  }
  const result = await runGitWithInput(
    gitPath,
    ['-C', repositoryPath, 'cat-file', '--batch-check=%(objecttype)'],
    `${hashes.join('\n')}\n`
  );
  return parseMissingObjectHashes(result.stdout);
}

async function resolveLogName(git, gitPath, repositoryPath, ref) {
  if (ref === 'HEAD') {
    return ref;
  }
  const { stdout } = await git.runGit(gitPath, [
    '-C',
    repositoryPath,
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/heads'
  ]);
  if (typeof ref !== 'string' || !ref || !stdout.split(/\r?\n/).includes(ref)) {
    throw new Error('Choose HEAD or a local branch to browse its reflog.');
  }
  return `refs/heads/${ref}`;
}

async function readReflog(git, gitPath, repositoryPath, ref, { limit = DEFAULT_LIMIT } = {}) {
  const logName = await resolveLogName(git, gitPath, repositoryPath, ref);
  const logPath = (
    await git.runGit(gitPath, ['-C', repositoryPath, 'rev-parse', '--git-path', `logs/${logName}`])
  ).stdout.trim();
  let content = '';
  try {
    content = fs.readFileSync(path.resolve(repositoryPath, logPath), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`The reflog could not be read: ${error.message}`, { cause: error });
    }
  }

  const all = parseReflogFile(content);
  const shown = all.slice(0, limit);
  const hashes = [...new Set(shown.map((entry) => entry.hash).filter(Boolean))];
  const missing = await findMissingHashes(git, gitPath, repositoryPath, hashes);
  return {
    ref,
    entries: shown.map((entry, index) => ({
      selector: `${ref}@{${index}}`,
      ...entry,
      available: entry.hash !== null && !missing.has(entry.hash)
    })),
    truncated: all.length > limit
  };
}

module.exports = { readReflog };
