const path = require('node:path');

function parseCommitLog(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [
        hash,
        treeHash,
        parentList,
        subject,
        authorName,
        authorEmail,
        authorDate,
        committerTimestamp
      ] = line.split('\0');
      return {
        hash,
        treeHash,
        parents: parentList ? parentList.split(' ') : [],
        subject,
        author: `${authorName} <${authorEmail}>`,
        authorDate,
        committerTimestamp: Number(committerTimestamp),
        lane: null
      };
    });
}

function parseWorktrees(output, currentWorktreePath, platform) {
  const worktrees = [];
  let worktree = null;
  function saveWorktree() {
    if (worktree) {
      worktrees.push(worktree);
      worktree = null;
    }
  }

  for (const line of output.split(/\r?\n/)) {
    if (line === '') {
      saveWorktree();
    } else if (line.startsWith('worktree ')) {
      saveWorktree();
      worktree = {
        path: path.normalize(line.slice('worktree '.length)),
        branch: null,
        detached: false
      };
    } else if (worktree && line.startsWith('branch ')) {
      worktree.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (worktree && line === 'detached') {
      worktree.detached = true;
    }
  }
  saveWorktree();

  const normalizePath = (worktreePath) => {
    const resolved = path.resolve(worktreePath);
    return platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  const normalizedCurrentPath = normalizePath(currentWorktreePath);
  for (const entry of worktrees) {
    entry.current = normalizePath(entry.path) === normalizedCurrentPath;
  }

  return worktrees;
}

function parseReferences(output, branchName, worktrees) {
  const worktreeByBranch = new Map(
    worktrees.filter((entry) => entry.branch).map((entry) => [entry.branch, entry.path])
  );
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [name, hash, symbolicTarget, fullName] = line.split('\0');
      return {
        name,
        hash,
        remote: fullName.startsWith('refs/remotes/'),
        symbolic: symbolicTarget !== '',
        checkedOut: !fullName.startsWith('refs/remotes/') && name === branchName,
        worktreePath: worktreeByBranch.get(name) || null
      };
    })
    .filter((reference) => !reference.symbolic && reference.name && reference.hash);
}

function parseTags(output, commitsByHash) {
  const tagsByHash = new Map();
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const [name, objectHash, peeledHash] = line.split('\0');
    const commitHash = peeledHash || objectHash;
    if (!commitsByHash.has(commitHash)) {
      continue;
    }
    const tags = tagsByHash.get(commitHash) || [];
    tags.push(name);
    tagsByHash.set(commitHash, tags);
  }
  return tagsByHash;
}

function parseMissingObjectHashes(output) {
  return new Set(
    output
      .split(/\r?\n/)
      .filter((line) => line.endsWith(' missing'))
      .map((line) => line.split(' ', 1)[0])
  );
}

module.exports = {
  parseCommitLog,
  parseWorktrees,
  parseReferences,
  parseTags,
  parseMissingObjectHashes
};
