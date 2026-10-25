const HEADER = /^([0-9a-f]{40}|[0-9a-f]{64}) \d+ (\d+)(?: \d+)?$/;

function parseBlamePorcelain(output) {
  const commits = new Map();
  const lines = [];
  let current = null;
  for (const row of output.split('\n')) {
    if (row.startsWith('\t')) {
      const info = commits.get(current.commit);
      lines.push({
        line: current.line,
        commit: current.commit,
        author: info.author,
        date: info.date,
        summary: info.summary,
        text: row.slice(1),
        boundary: info.boundary
      });
      continue;
    }
    const header = HEADER.exec(row);
    if (header) {
      current = { commit: header[1], line: Number(header[2]) };
      if (!commits.has(current.commit)) {
        commits.set(current.commit, { author: '', date: '', summary: '', boundary: false });
      }
      continue;
    }
    const info = current && commits.get(current.commit);
    if (!info) {
      continue;
    }
    if (row.startsWith('author ')) {
      info.author = row.slice('author '.length);
    } else if (row.startsWith('author-time ')) {
      info.date = new Date(Number(row.slice('author-time '.length)) * 1000).toISOString();
    } else if (row.startsWith('summary ')) {
      info.summary = row.slice('summary '.length);
    } else if (row === 'boundary') {
      info.boundary = true;
    }
  }
  return lines;
}

const BINARY_SNIFF_LENGTH = 8000;
const MAX_LINES = 20_000;
const EMPTY_TREES = {
  40: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
  64: '6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321'
};
const MAX_BYTES = 1024 * 1024;
const COMMIT_HASH = /^([0-9a-f]{40}|[0-9a-f]{64})$/;

function normalizeRepositoryPath(filePath) {
  if (typeof filePath !== 'string' || filePath === '' || filePath.includes('\0')) {
    return null;
  }
  const normalized = filePath.replaceAll('\\', '/');
  if (
    normalized.startsWith('-') ||
    normalized.startsWith('/') ||
    /^[a-z]:/i.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    return null;
  }
  return normalized;
}

async function readBlame({ runGit }, gitPath, repositoryPath, request) {
  const { revision } = request;
  const filePath = normalizeRepositoryPath(request.path);
  if (typeof revision !== 'string' || !COMMIT_HASH.test(revision)) {
    return { status: 'invalid-request', message: 'Choose a commit hash from the graph to blame.' };
  }
  if (filePath === null) {
    return { status: 'invalid-request', message: 'Enter a repository-relative file path.' };
  }
  try {
    await runGit(gitPath, [
      '-C',
      repositoryPath,
      'rev-parse',
      '--verify',
      '--quiet',
      `${revision}^{commit}`
    ]);
  } catch (error) {
    if (error.code !== 1) {
      throw error;
    }
    return {
      status: 'missing-object',
      message:
        'This commit is not available in the local repository. It may have been removed, or the clone may be partial.'
    };
  }
  const entry = await runGit(gitPath, [
    '-C',
    repositoryPath,
    'ls-tree',
    '-l',
    '-z',
    revision,
    '--',
    filePath
  ]);
  if (entry.stdout === '') {
    return { status: 'missing-path', message: `${filePath} does not exist at this commit.` };
  }
  const entries = entry.stdout.split('\0').filter(Boolean);
  if (entries.length !== 1 || !/^\d+ blob /.test(entries[0])) {
    return {
      status: 'not-a-file',
      message: `${filePath} is not a file at this commit, so it cannot be blamed.`
    };
  }
  const treeEntry = /^\d+ \w+ ([0-9a-f]+) +(\d+|-)\t/.exec(entries[0]);
  const size = Number(treeEntry[2]);
  if (size > MAX_BYTES) {
    return {
      status: 'too-large',
      message: `${filePath} is ${(size / MAX_BYTES).toFixed(1)} MiB; blame is limited to files of 1 MiB or smaller.`
    };
  }
  const blob = await runGit(gitPath, ['-C', repositoryPath, 'cat-file', 'blob', treeEntry[1]]);
  if (blob.stdout.slice(0, BINARY_SNIFF_LENGTH).includes('\0')) {
    return {
      status: 'binary',
      message: `${filePath} is a binary file, so line-by-line blame is not available.`
    };
  }
  const lineCount = blob.stdout.split('\n').length - (blob.stdout.endsWith('\n') ? 1 : 0);
  if (lineCount > MAX_LINES) {
    return {
      status: 'too-large',
      message: `${filePath} has ${lineCount.toLocaleString('en-US')} lines; blame is limited to files of ${MAX_LINES.toLocaleString('en-US')} lines or fewer.`
    };
  }
  const { stdout } = await runGit(
    gitPath,
    [
      '-C',
      repositoryPath,
      // Attributes come from the empty tree so repository-defined textconv programs never run.
      `--attr-source=${EMPTY_TREES[revision.length]}`,
      'blame',
      '--porcelain',
      revision,
      '--',
      filePath
    ],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  const lines = parseBlamePorcelain(stdout);
  const boundaryLines = lines.filter((line) => line.boundary).length;
  if (boundaryLines === 0) {
    return { status: 'ok', lines, incompleteHistory: false };
  }
  return {
    status: 'ok',
    lines,
    incompleteHistory: true,
    message: `History is incomplete: ${boundaryLines.toLocaleString('en-US')} ${boundaryLines === 1 ? 'line is' : 'lines are'} attributed to the oldest available commit of a shallow clone, which may not be where ${boundaryLines === 1 ? 'it was' : 'they were'} introduced.`
  };
}

module.exports = { parseBlamePorcelain, readBlame };
