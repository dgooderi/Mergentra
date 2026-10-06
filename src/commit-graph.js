const fs = require('node:fs');
const path = require('node:path');
const {
  parseCommitLog,
  parseWorktrees,
  parseReferences,
  parseTags,
  parseMissingObjectHashes
} = require('./repository-output');
const { computeDivergenceMarkers } = require('./divergence-markers');
const { orderReferences } = require('./reference-order');

const LOG_LIMITS = { timeout: 300_000, maxBuffer: 400 * 1024 * 1024 };

async function resolveHeadHash({ runGit }, gitPath, repositoryPath, branchName) {
  try {
    const result = await runGit(gitPath, [
      '-C',
      repositoryPath,
      'rev-parse',
      '--verify',
      '--quiet',
      'HEAD'
    ]);
    return result.stdout.trim() || null;
  } catch (error) {
    // An unborn branch has no HEAD commit; anything else is a real failure.
    if (error.code !== 1 || !branchName) {
      throw error;
    }
    return null;
  }
}

function readGitOutputs({ runGit }, gitPath, repositoryPath, headHash) {
  const logRoots = ['--branches', '--remotes'];
  if (headHash) {
    logRoots.push('HEAD');
  }
  const git = (...args) => runGit(gitPath, ['-C', repositoryPath, ...args]);
  return Promise.all([
    runGit(
      gitPath,
      [
        '-C',
        repositoryPath,
        'log',
        '--no-show-signature',
        ...logRoots,
        '--topo-order',
        '--reverse',
        '--format=%H%x00%T%x00%P%x00%s%x00%an%x00%ae%x00%aI%x00%ct'
      ],
      LOG_LIMITS
    ),
    git(
      'for-each-ref',
      '--format=%(refname:short)%00%(objectname)%00%(symref)%00%(refname)',
      'refs/heads',
      'refs/remotes'
    ),
    git('for-each-ref', '--format=%(refname:short)%00%(objectname)%00%(*objectname)', 'refs/tags'),
    git('worktree', 'list', '--porcelain'),
    git('rev-parse', '--git-path', 'shallow')
  ]);
}

function readShallowBoundaries(repositoryPath, shallowPathOutput) {
  try {
    return fs
      .readFileSync(path.resolve(repositoryPath, shallowPathOutput.trim()), 'utf8')
      .split(/\r?\n/)
      .filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw new Error(`Git shallow boundaries could not be read: ${error.message}`, {
      cause: error
    });
  }
}

async function findMissingObjectBoundaries({ runGitWithInput }, gitPath, repositoryPath, commits) {
  const commitsByHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const objectHashesToCheck = new Set(commits.map((commit) => commit.treeHash));
  for (const commit of commits) {
    for (const parentHash of commit.parents) {
      if (!commitsByHash.has(parentHash)) {
        objectHashesToCheck.add(parentHash);
      }
    }
  }
  if (objectHashesToCheck.size === 0) {
    return [];
  }
  const result = await runGitWithInput(
    gitPath,
    ['-C', repositoryPath, 'cat-file', '--batch-check=%(objecttype)'],
    `${[...objectHashesToCheck].join('\n')}\n`
  );
  const missing = parseMissingObjectHashes(result.stdout);
  return commits
    .filter(
      (commit) =>
        missing.has(commit.treeHash) || commit.parents.some((parentHash) => missing.has(parentHash))
    )
    .map((commit) => commit.hash);
}

function assignLanes(commits, commitsByHash, orderedReferences) {
  for (const reference of orderedReferences) {
    const pending = [reference.hash];
    while (pending.length > 0) {
      const commit = commitsByHash.get(pending.pop());
      if (!commit || commit.lane !== null) {
        continue;
      }
      commit.lane = reference.lane;
      pending.push(...commit.parents);
    }
  }
  for (const commit of commits) {
    if (commit.lane === null) {
      commit.lane = orderedReferences.length;
    }
  }
}

function labelCommits(commits, commitsByHash, orderedReferences, tagsOutput) {
  const tagsByHash = parseTags(tagsOutput, commitsByHash);
  const referenceNamesByHash = new Map();
  for (const reference of orderedReferences) {
    const names = referenceNamesByHash.get(reference.hash) || [];
    names.push(reference.name);
    referenceNamesByHash.set(reference.hash, names);
  }
  for (const commit of commits) {
    commit.tags = (tagsByHash.get(commit.hash) || []).sort((left, right) =>
      left.localeCompare(right)
    );
    commit.references = (referenceNamesByHash.get(commit.hash) || []).concat(commit.tags);
  }
}

async function loadCommitGraph(git, gitPath, repositoryPath, branchName, currentWorktreePath) {
  const headHash = await resolveHeadHash(git, gitPath, repositoryPath, branchName);
  const [logResult, refsResult, tagsResult, worktreesResult, shallowPathResult] =
    await readGitOutputs(git, gitPath, repositoryPath, headHash);

  const shallowBoundaries = readShallowBoundaries(repositoryPath, shallowPathResult.stdout);
  const worktrees = parseWorktrees(worktreesResult.stdout, currentWorktreePath, process.platform);
  const orderedReferences = orderReferences(
    parseReferences(refsResult.stdout, branchName, worktrees)
  );
  const commits = parseCommitLog(logResult.stdout);
  const commitsByHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const missingObjectBoundaries = await findMissingObjectBoundaries(
    git,
    gitPath,
    repositoryPath,
    commits
  );

  assignLanes(commits, commitsByHash, orderedReferences);
  labelCommits(commits, commitsByHash, orderedReferences, tagsResult.stdout);

  return {
    commits,
    references: orderedReferences.map((reference) => ({
      name: reference.name,
      hash: reference.hash,
      remote: reference.remote,
      checkedOut: reference.checkedOut,
      color: reference.color,
      lane: reference.lane,
      worktreePath: reference.worktreePath
    })),
    worktrees,
    shallowBoundaries,
    missingObjectBoundaries,
    headHash,
    headDetached: Boolean(headHash && !branchName),
    divergenceMarkers: computeDivergenceMarkers(commits, orderedReferences),
    order: 'parent-before-child',
    laneCount: Math.max(orderedReferences.length, 1)
  };
}

module.exports = { loadCommitGraph };
