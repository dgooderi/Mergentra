const INVALID_PATH_MESSAGE = 'Enter a path inside the repository.';

function normalizeHistoryPath(input) {
  const segments = String(input)
    .trim()
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.');
  const absolute = /^([a-z]:|\/)/i.test(String(input).trim().replaceAll('\\', '/'));
  if (
    segments.length === 0 ||
    absolute ||
    segments.includes('..') ||
    segments[0].startsWith('-') ||
    segments.some((segment) => segment.includes('\0'))
  ) {
    throw new Error(INVALID_PATH_MESSAGE);
  }
  return segments.join('/');
}

function buildFileHistoryArgs(repositoryPath, input, { includeHead = false } = {}) {
  const historyPath = normalizeHistoryPath(input);
  return [
    '-C',
    repositoryPath,
    '--literal-pathspecs',
    '-c',
    'core.quotePath=off',
    'log',
    '--no-show-signature',
    '--no-ext-diff',
    '--no-textconv',
    '--follow',
    '--name-status',
    '--format=%x01%H',
    '--branches',
    '--remotes',
    ...(includeHead ? ['HEAD'] : []),
    '--',
    historyPath
  ];
}

function parseFileHistory(output) {
  const hashes = [];
  const renames = [];
  for (const record of output.split('\u0001').filter(Boolean)) {
    const [hash, ...lines] = record.split(/\r?\n/);
    hashes.push(hash);
    for (const line of lines) {
      const [status, from, to] = line.split('\t');
      if (status.startsWith('R') && from && to) {
        renames.push({ hash, from, to });
      }
    }
  }
  return { hashes, renames };
}

async function hasHead(runGit, gitPath, repositoryPath) {
  try {
    await runGit(gitPath, ['-C', repositoryPath, 'rev-parse', '--verify', '--quiet', 'HEAD']);
    return true;
  } catch (error) {
    // An unborn branch has no HEAD commit; anything else is a real failure.
    if (error.code === 1) {
      return false;
    }
    throw error;
  }
}

async function loadFileHistory({ runGit }, gitPath, repositoryPath, input) {
  const args = buildFileHistoryArgs(repositoryPath, input, {
    includeHead: await hasHead(runGit, gitPath, repositoryPath)
  });
  let stdout;
  let shallowResult;
  try {
    [{ stdout }, shallowResult] = await Promise.all([
      runGit(gitPath, args, { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 }),
      runGit(gitPath, ['-C', repositoryPath, 'rev-parse', '--is-shallow-repository'])
    ]);
  } catch (error) {
    const detail = (error.stderr || error.message || '').trim();
    throw new Error(
      `The history for this path could not be read completely (${detail}). ` +
        'A partial or shallow clone may be missing the commits or files needed.',
      { cause: error }
    );
  }
  return {
    path: args[args.length - 1],
    ...parseFileHistory(stdout),
    shallow: shallowResult.stdout.trim() === 'true'
  };
}

module.exports = { buildFileHistoryArgs, loadFileHistory, parseFileHistory };
