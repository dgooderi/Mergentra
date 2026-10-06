const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createGitRunner } = require('./git-runner');
const {
  parseCommitLog,
  parseWorktrees,
  parseReferences,
  parseTags,
  parseMissingObjectHashes
} = require('./repository-output');
const { computeDivergenceMarkers } = require('./divergence-markers');
const { orderReferences } = require('./reference-order');
const { createSettingsStore } = require('./settings-store');
const { registerIpcHandlers } = require('./ipc-handlers');
const { createMainWindow } = require('./main-window');
const { runGit, runGitWithInput } = createGitRunner();
let settings;
let settingsStore;
let activeRepositoryPath = null;

if (process.env.GITSCOPE_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.GITSCOPE_USER_DATA_DIR));
}

function saveSettings(nextSettings) {
  settingsStore.save(nextSettings);
  settings = nextSettings;
}

const LOG_LIMITS = { timeout: 300_000, maxBuffer: 400 * 1024 * 1024 };

function sanitizeDiagnostics(diagnostics) {
  return diagnostics.replace(/(https?:\/\/)[^/\s@]+@/gi, '$1[redacted]@').trim();
}

async function loadCommitGraph(gitPath, repositoryPath, branchName, currentWorktreePath) {
  let headHash = null;
  try {
    const headResult = await runGit(gitPath, [
      '-C',
      repositoryPath,
      'rev-parse',
      '--verify',
      '--quiet',
      'HEAD'
    ]);
    headHash = headResult.stdout.trim() || null;
  } catch (error) {
    if (error.code !== 1 || !branchName) {
      throw error;
    }
  }

  const logRoots = ['--branches', '--remotes'];
  if (headHash) {
    logRoots.push('HEAD');
  }
  const [logResult, refsResult, tagsResult, worktreesResult, shallowPathResult] = await Promise.all(
    [
      runGit(
        gitPath,
        [
          '-C',
          repositoryPath,
          'log',
          ...logRoots,
          '--topo-order',
          '--reverse',
          '--format=%H%x00%T%x00%P%x00%s%x00%an%x00%ae%x00%aI%x00%ct'
        ],
        LOG_LIMITS
      ),
      runGit(gitPath, [
        '-C',
        repositoryPath,
        'for-each-ref',
        '--format=%(refname:short)%00%(objectname)%00%(symref)%00%(refname)',
        'refs/heads',
        'refs/remotes'
      ]),
      runGit(gitPath, [
        '-C',
        repositoryPath,
        'for-each-ref',
        '--format=%(refname:short)%00%(objectname)%00%(*objectname)',
        'refs/tags'
      ]),
      runGit(gitPath, ['-C', repositoryPath, 'worktree', 'list', '--porcelain']),
      runGit(gitPath, ['-C', repositoryPath, 'rev-parse', '--git-path', 'shallow'])
    ]
  );

  let shallowBoundaries = [];
  try {
    shallowBoundaries = fs
      .readFileSync(path.resolve(repositoryPath, shallowPathResult.stdout.trim()), 'utf8')
      .split(/\r?\n/)
      .filter(Boolean);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Git shallow boundaries could not be read: ${error.message}`, {
        cause: error
      });
    }
  }

  const worktrees = parseWorktrees(worktreesResult.stdout, currentWorktreePath, process.platform);
  const references = parseReferences(refsResult.stdout, branchName, worktrees);
  const orderedReferences = orderReferences(references);
  const commits = parseCommitLog(logResult.stdout);
  const commitsByHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const objectHashesToCheck = new Set(commits.map((commit) => commit.treeHash));
  for (const commit of commits) {
    for (const parentHash of commit.parents) {
      if (!commitsByHash.has(parentHash)) {
        objectHashesToCheck.add(parentHash);
      }
    }
  }
  let missingObjectHashes = new Set();
  if (objectHashesToCheck.size > 0) {
    const missingObjectsResult = await runGitWithInput(
      gitPath,
      ['-C', repositoryPath, 'cat-file', '--batch-check'],
      `${[...objectHashesToCheck].join('\n')}\n`
    );
    missingObjectHashes = parseMissingObjectHashes(missingObjectsResult.stdout);
  }
  const missingObjectBoundaries = commits
    .filter(
      (commit) =>
        missingObjectHashes.has(commit.treeHash) ||
        commit.parents.some((parentHash) => missingObjectHashes.has(parentHash))
    )
    .map((commit) => commit.hash);
  const tagsByHash = parseTags(tagsResult.stdout, commitsByHash);

  for (const reference of orderedReferences) {
    const pending = [reference.hash];
    while (pending.length > 0) {
      const hash = pending.pop();
      const commit = commitsByHash.get(hash);
      if (!commit || commit.lane !== null) {
        continue;
      }
      commit.lane = reference.lane;
      pending.push(...commit.parents);
    }
  }

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
    if (commit.lane === null) {
      commit.lane = orderedReferences.length;
    }
  }

  const divergenceMarkers = computeDivergenceMarkers(commits, orderedReferences);

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
    divergenceMarkers,
    order: 'parent-before-child',
    laneCount: Math.max(orderedReferences.length, 1)
  };
}

async function openRepository(repositoryPath) {
  if (typeof repositoryPath !== 'string' || repositoryPath.trim() === '') {
    throw new Error('Choose a repository folder before opening it.');
  }

  const resolvedPath = path.resolve(repositoryPath.trim());
  const gitPath = settings.gitPath || 'git';
  let repositoryStat;
  let repositoryRoot;

  try {
    repositoryStat = fs.statSync(resolvedPath);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      throw new Error(
        'The selected folder does not exist. Choose an existing Git repository folder.',
        { cause: error }
      );
    }
    throw new Error(`The selected folder could not be accessed: ${error.message}`, {
      cause: error
    });
  }

  if (!repositoryStat.isDirectory()) {
    throw new Error('The selected path is not a folder. Choose a Git repository folder.');
  }

  try {
    await runGit(gitPath, ['--version']);
  } catch (error) {
    if (error.code === 'ENOENT' && !settings.gitPath) {
      throw new Error(
        'Git was not found on PATH. Install Git for Windows, then restart GitScope.',
        { cause: error }
      );
    }
    throw new Error(`Git could not be started: ${error.message}`, { cause: error });
  }

  try {
    repositoryRoot = (
      await runGit(gitPath, ['-C', resolvedPath, 'rev-parse', '--show-toplevel'])
    ).stdout.trim();
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        'The selected folder does not exist. Choose an existing Git repository folder.',
        { cause: error }
      );
    }
    throw new Error(
      'The selected folder is not a Git repository. Choose a folder containing a Git repository.',
      { cause: error }
    );
  }

  const { stdout } = await runGit(gitPath, ['-C', resolvedPath, 'branch', '--show-current']);
  const graph = await loadCommitGraph(gitPath, resolvedPath, stdout.trim(), repositoryRoot);
  return {
    path: resolvedPath,
    name: path.basename(resolvedPath),
    branch: stdout.trim() || 'Detached HEAD',
    graph
  };
}

async function openAndRememberRepository(repositoryPath) {
  const repository = await openRepository(repositoryPath);
  const normalizedPath =
    process.platform === 'win32' ? repository.path.toLowerCase() : repository.path;
  const recentRepositories = [
    repository,
    ...settings.recentRepositories.filter((recent) => {
      const recentPath = process.platform === 'win32' ? recent.path.toLowerCase() : recent.path;
      return recentPath !== normalizedPath;
    })
  ];
  saveSettings({ ...settings, recentRepositories });
  activeRepositoryPath = repository.path;
  return repository;
}

async function fetchRemoteReferences() {
  if (!activeRepositoryPath) {
    return {
      success: false,
      message: 'Open a repository before fetching.',
      diagnostics: ''
    };
  }

  const gitPath = settings.gitPath || 'git';
  try {
    await runGit(gitPath, ['-C', activeRepositoryPath, 'fetch', '--all', '--prune', '--progress']);
  } catch (error) {
    const details = [error.message, error.stderr, error.stdout]
      .filter((value) => typeof value === 'string' && value.trim() !== '')
      .join('\n');
    return {
      success: false,
      message: 'Fetch failed. Check the remote configuration and Git credentials, then try again.',
      diagnostics: sanitizeDiagnostics(details)
    };
  }

  try {
    return {
      success: true,
      repository: await openRepository(activeRepositoryPath)
    };
  } catch (error) {
    const details = [error.message, error.stderr, error.stdout]
      .filter((value) => typeof value === 'string' && value.trim() !== '')
      .join('\n');
    return {
      success: false,
      message: 'Fetch succeeded, but GitScope could not refresh the repository graph.',
      diagnostics: sanitizeDiagnostics(details)
    };
  }
}

app.whenReady().then(() => {
  try {
    settingsStore = createSettingsStore(app.getPath('userData'));
    settings = settingsStore.load();
  } catch (error) {
    dialog.showErrorBox('GitScope could not start', error.message);
    app.quit();
    return;
  }

  const window = createMainWindow({
    BrowserWindow,
    Menu,
    applicationDirectory: __dirname
  });

  registerIpcHandlers({
    ipcMain,
    app,
    dialog,
    shell,
    clipboard,
    window,
    openAndRememberRepository,
    fetchRemoteReferences,
    getSettings: () => settings,
    saveSettings,
    getActiveRepositoryPath: () => activeRepositoryPath,
    runGit
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
