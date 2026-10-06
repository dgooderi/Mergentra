const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createGitRunner } = require('./git-runner');
const { runGit, runGitWithInput } = createGitRunner();
// The golden angle keeps consecutive hues far apart, and alternating lightness separates close neighbours further.
function graphColor(index) {
  const hue = Math.round((index * 137.508 + 215) % 360);
  const lightness = index % 2 === 0 ? 62 : 48;
  return `hsl(${hue} 78% ${lightness}%)`;
}
let settings;
let activeRepositoryPath = null;

if (process.env.GITSCOPE_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.GITSCOPE_USER_DATA_DIR));
}

function loadSettings() {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  let storedSettings;

  try {
    storedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { gitPath: '', recentRepositories: [] };
    }
    if (error instanceof SyntaxError) {
      throw new Error(`GitScope settings are not valid JSON: ${error.message}`, { cause: error });
    }
    throw new Error(`GitScope settings could not be read: ${error.message}`, { cause: error });
  }

  if (
    typeof storedSettings !== 'object' ||
    storedSettings === null ||
    typeof storedSettings.gitPath !== 'string' ||
    !Array.isArray(storedSettings.recentRepositories) ||
    !storedSettings.recentRepositories.every(
      (repository) =>
        typeof repository === 'object' &&
        repository !== null &&
        typeof repository.path === 'string' &&
        typeof repository.name === 'string'
    )
  ) {
    throw new Error(
      'GitScope settings have an unsupported format. Move settings.json out of the user data folder and restart GitScope.'
    );
  }

  return storedSettings;
}

function saveSettings(nextSettings) {
  const userDataPath = app.getPath('userData');
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(
    path.join(userDataPath, 'settings.json'),
    `${JSON.stringify(nextSettings, null, 2)}\n`,
    'utf8'
  );
  settings = nextSettings;
}

const LOG_LIMITS = { timeout: 300_000, maxBuffer: 400 * 1024 * 1024 };

function sanitizeDiagnostics(diagnostics) {
  return diagnostics.replace(/(https?:\/\/)[^/\s@]+@/gi, '$1[redacted]@').trim();
}

function orderReferences(references) {
  const localReferences = references
    .filter((reference) => !reference.remote)
    .sort((left, right) => left.name.localeCompare(right.name));
  const remoteReferences = references
    .filter((reference) => reference.remote)
    .sort((left, right) => left.name.localeCompare(right.name));
  const ordered = [];
  const pairedRemotes = new Set();
  let pairIndex = 0;

  function addPair(local, remote) {
    const color = graphColor(pairIndex++);
    ordered.push({ ...local, color });
    if (remote) {
      pairedRemotes.add(remote.name);
      ordered.push({ ...remote, color });
    }
  }

  const main = localReferences.find((reference) => reference.name === 'main');
  const originMain = remoteReferences.find((reference) => reference.name === 'origin/main');
  if (main) {
    addPair(main, originMain);
  } else if (originMain) {
    const color = graphColor(pairIndex++);
    ordered.push({ ...originMain, color });
    pairedRemotes.add(originMain.name);
  }

  for (const local of localReferences) {
    if (local.name === 'main') {
      continue;
    }
    const matchingRemote = remoteReferences.find(
      (reference) =>
        !pairedRemotes.has(reference.name) &&
        reference.name.slice(reference.name.indexOf('/') + 1) === local.name
    );
    if (matchingRemote) {
      addPair(local, matchingRemote);
    }
  }

  const unpairedReferences = [
    ...localReferences.filter(
      (reference) =>
        reference.name !== 'main' && !ordered.some((item) => item.name === reference.name)
    ),
    ...remoteReferences.filter((reference) => !pairedRemotes.has(reference.name))
  ].sort((left, right) => left.name.localeCompare(right.name));

  for (const reference of unpairedReferences) {
    ordered.push({
      ...reference,
      color: graphColor(pairIndex++)
    });
  }

  return ordered.map((reference, index) => ({ ...reference, lane: index }));
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

  const worktrees = [];
  let worktree = null;
  function saveWorktree() {
    if (worktree) {
      worktrees.push(worktree);
      worktree = null;
    }
  }

  for (const line of worktreesResult.stdout.split(/\r?\n/)) {
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

  const normalizedCurrentPath =
    process.platform === 'win32'
      ? path.resolve(currentWorktreePath).toLowerCase()
      : path.resolve(currentWorktreePath);
  for (const entry of worktrees) {
    const normalizedWorktreePath =
      process.platform === 'win32'
        ? path.resolve(entry.path).toLowerCase()
        : path.resolve(entry.path);
    entry.current = normalizedWorktreePath === normalizedCurrentPath;
  }

  const worktreeByBranch = new Map(
    worktrees.filter((entry) => entry.branch).map((entry) => [entry.branch, entry.path])
  );
  const references = refsResult.stdout
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
  const orderedReferences = orderReferences(references);
  const commits = logResult.stdout
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
    missingObjectHashes = new Set(
      missingObjectsResult.stdout
        .split(/\r?\n/)
        .filter((line) => line.endsWith(' missing'))
        .map((line) => line.split(' ', 1)[0])
    );
  }
  const missingObjectBoundaries = commits
    .filter(
      (commit) =>
        missingObjectHashes.has(commit.treeHash) ||
        commit.parents.some((parentHash) => missingObjectHashes.has(parentHash))
    )
    .map((commit) => commit.hash);
  const tagsByHash = new Map();
  for (const line of tagsResult.stdout.split(/\r?\n/).filter(Boolean)) {
    const [name, objectHash, peeledHash] = line.split('\0');
    const commitHash = peeledHash || objectHash;
    if (!commitsByHash.has(commitHash)) {
      continue;
    }
    const tags = tagsByHash.get(commitHash) || [];
    tags.push(name);
    tagsByHash.set(commitHash, tags);
  }

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

  const commitIndex = new Map(commits.map((commit, index) => [commit.hash, index]));
  function ancestorsOf(commitHash) {
    const ancestors = new Set();
    const pending = [commitHash];
    while (pending.length > 0) {
      const hash = pending.pop();
      if (ancestors.has(hash) || !commitsByHash.has(hash)) {
        continue;
      }
      ancestors.add(hash);
      pending.push(...commitsByHash.get(hash).parents);
    }
    return ancestors;
  }

  function pathToAncestor(commitHash, ancestorHash) {
    const previous = new Map([[commitHash, null]]);
    const pending = [commitHash];
    for (let cursor = 0; cursor < pending.length; cursor += 1) {
      const hash = pending[cursor];
      if (hash === ancestorHash) {
        const path = [];
        let currentHash = hash;
        while (currentHash !== null) {
          path.push(currentHash);
          currentHash = previous.get(currentHash);
        }
        return path.reverse();
      }

      for (const parentHash of commitsByHash.get(hash)?.parents || []) {
        if (!previous.has(parentHash) && commitsByHash.has(parentHash)) {
          previous.set(parentHash, hash);
          pending.push(parentHash);
        }
      }
    }
    return [];
  }

  const localReferences = orderedReferences.filter((reference) => !reference.remote);
  const mainReference =
    localReferences.find((reference) => reference.name === 'main') || localReferences[0];
  const divergenceMarkers = [];

  if (mainReference) {
    const mainAncestors = ancestorsOf(mainReference.hash);
    for (const reference of localReferences) {
      if (reference.name === mainReference.name) {
        continue;
      }
      const referenceAncestors = ancestorsOf(reference.hash);
      const commonAncestors = [...referenceAncestors]
        .filter((hash) => mainAncestors.has(hash))
        .sort((left, right) => (commitIndex.get(right) ?? -1) - (commitIndex.get(left) ?? -1));

      for (const ancestorHash of commonAncestors) {
        const branchPath = pathToAncestor(reference.hash, ancestorHash);
        const mainPath = pathToAncestor(mainReference.hash, ancestorHash);
        if (branchPath.length > 1 && mainPath.length > 1) {
          divergenceMarkers.push({
            branchName: reference.name,
            ancestorHash,
            commitHash: branchPath[branchPath.length - 2],
            inferred: true
          });
          break;
        }
      }
    }
  }

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

function createWindow() {
  Menu.setApplicationMenu(null);
  const window = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.loadFile(path.join(__dirname, 'index.html'));
  return window;
}

app.whenReady().then(() => {
  try {
    settings = loadSettings();
  } catch (error) {
    dialog.showErrorBox('GitScope could not start', error.message);
    app.quit();
    return;
  }

  const window = createWindow();

  ipcMain.handle('repository:choose', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Open a Git repository',
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('repository:open', (_event, repositoryPath) =>
    openAndRememberRepository(repositoryPath)
  );
  ipcMain.handle('repository:fetch', () => fetchRemoteReferences());
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('external:open-release', async (_event, releaseUrl) => {
    if (typeof releaseUrl !== 'string') {
      throw new Error('The GitHub release link must be a URL.');
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(releaseUrl);
    } catch {
      throw new Error('The GitHub release link is invalid.');
    }
    if (
      parsedUrl.origin !== 'https://github.com' ||
      !parsedUrl.pathname.startsWith('/dgooderi/GitScope/releases/')
    ) {
      throw new Error('Only GitScope GitHub release links can be opened.');
    }

    await shell.openExternal(parsedUrl.href);
  });
  ipcMain.handle('diagnostics:copy', (_event, diagnostics) => {
    if (typeof diagnostics !== 'string') {
      throw new Error('Diagnostics must be text.');
    }
    clipboard.writeText(diagnostics);
  });
  ipcMain.handle('repository:open-in-explorer', async () => {
    if (!activeRepositoryPath) {
      throw new Error('Open a repository first.');
    }
    const failure = await shell.openPath(activeRepositoryPath);
    if (failure) {
      throw new Error(failure);
    }
  });
  ipcMain.handle('repository:recent', () => settings.recentRepositories);
  ipcMain.handle('settings:get-git-path', () => settings.gitPath);
  ipcMain.handle('settings:save-git-path', async (_event, gitPath) => {
    if (typeof gitPath !== 'string') {
      throw new Error('Enter the full path to git.exe.');
    }

    if (gitPath.trim() === '') {
      saveSettings({ ...settings, gitPath: '' });
      return '';
    }

    const resolvedGitPath = path.resolve(gitPath.trim());
    try {
      await runGit(resolvedGitPath, ['--version']);
    } catch (error) {
      throw new Error(`Git could not be started from "${resolvedGitPath}": ${error.message}`, {
        cause: error
      });
    }

    saveSettings({ ...settings, gitPath: resolvedGitPath });
    return resolvedGitPath;
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
