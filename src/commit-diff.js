const fs = require('node:fs');
const path = require('node:path');

const HASH_PATTERN = /^[0-9a-f]{4,64}$/i;

// Every diff runs with these so a repository's own configuration cannot launch programs.
const SAFE_DIFF_OPTIONS = [
  '--literal-pathspecs',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.quotePath=false'
];
const DIFF_FLAGS = ['--no-ext-diff', '--no-textconv', '--no-color', '--no-renames'];

const STATUS_NAMES = { A: 'added', D: 'deleted', M: 'modified', T: 'typechange' };

function parseChangedFiles(output) {
  const tokens = output.split('\0');
  const files = new Map();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith(':')) {
      const [oldMode, newMode, , , status] = token.slice(1).split(' ');
      const filePath = tokens[(index += 1)];
      files.set(filePath, {
        path: filePath,
        status: STATUS_NAMES[status[0]] || 'modified',
        additions: 0,
        deletions: 0,
        binary: false,
        submodule: oldMode === '160000' || newMode === '160000'
      });
    } else if (token !== '') {
      const [additions, deletions, ...pathParts] = token.split('\t');
      const file = files.get(pathParts.join('\t'));
      if (file) {
        file.binary = additions === '-';
        file.additions = file.binary ? 0 : Number(additions);
        file.deletions = file.binary ? 0 : Number(deletions);
      }
    }
  }
  return [...files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function gitArguments(repositoryPath, args) {
  return [...SAFE_DIFF_OPTIONS, '-C', repositoryPath, ...args];
}

async function resolveCommit(runGit, gitPath, repositoryPath, hash) {
  if (typeof hash !== 'string' || !HASH_PATTERN.test(hash)) {
    throw new Error('Choose a commit from the graph.');
  }
  try {
    const { stdout } = await runGit(
      gitPath,
      gitArguments(repositoryPath, ['rev-parse', '--verify', `${hash}^{commit}`])
    );
    return stdout.trim();
  } catch (error) {
    throw new Error('That commit is not available in this repository.', { cause: error });
  }
}

async function isShallowBoundary(runGit, gitPath, repositoryPath, hash) {
  const { stdout } = await runGit(
    gitPath,
    gitArguments(repositoryPath, ['rev-parse', '--git-path', 'shallow'])
  );
  try {
    const boundaries = fs.readFileSync(path.resolve(repositoryPath, stdout.trim()), 'utf8');
    return boundaries.split(/\r?\n/).includes(hash);
  } catch {
    return false;
  }
}

// A merge or ordinary commit is shown against its first parent; a root commit against nothing.
async function resolveRange(runGit, gitPath, repositoryPath, { commit, compareWith }) {
  const to = await resolveCommit(runGit, gitPath, repositoryPath, commit);
  if (compareWith !== undefined) {
    return { from: await resolveCommit(runGit, gitPath, repositoryPath, compareWith), to };
  }
  const { stdout } = await runGit(
    gitPath,
    gitArguments(repositoryPath, ['rev-list', '--parents', '-n', '1', to])
  );
  const [, firstParent = null] = stdout.trim().split(' ');
  if (firstParent === null && (await isShallowBoundary(runGit, gitPath, repositoryPath, to))) {
    throw new Error(
      'The history before this commit is not available because this is a shallow clone.'
    );
  }
  return { from: firstParent, to };
}

function diffArguments(repositoryPath, { from, to }, options, filePath) {
  const range =
    from === null ? ['diff-tree', '--root', '--no-commit-id', '-r', to] : ['diff', from, to];
  return gitArguments(repositoryPath, [
    range[0],
    ...DIFF_FLAGS,
    ...options,
    ...range.slice(1),
    '--',
    ...(filePath === undefined ? [] : [filePath])
  ]);
}

async function loadChangedFiles(runGit, gitPath, repositoryPath, request) {
  const range = await resolveRange(runGit, gitPath, repositoryPath, request);
  const { stdout } = await runGit(
    gitPath,
    diffArguments(repositoryPath, range, ['-z', '--raw', '--numstat'])
  );
  return { ...range, files: parseChangedFiles(stdout) };
}

const PATCH_CHARACTER_LIMIT = 256_000;

async function loadFilePatch(runGit, gitPath, repositoryPath, { path: filePath, ...request }) {
  if (typeof filePath !== 'string' || filePath === '' || filePath.includes('\0')) {
    throw new Error('Choose a changed file to view.');
  }
  const range = await resolveRange(runGit, gitPath, repositoryPath, request);
  const { stdout } = await runGit(
    gitPath,
    diffArguments(repositoryPath, range, ['--patch'], filePath)
  );
  const binary = /^Binary files .* differ$/m.test(stdout);
  const truncated = !binary && stdout.length > PATCH_CHARACTER_LIMIT;
  return {
    binary,
    truncated,
    patch: binary ? '' : stdout.slice(0, PATCH_CHARACTER_LIMIT)
  };
}

module.exports = { loadChangedFiles, loadFilePatch };
