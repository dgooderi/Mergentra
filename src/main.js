const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createGitRunner } = require('./git-runner');
const { loadCommitGraph } = require('./commit-graph');
const { createSettingsStore } = require('./settings-store');
const { createAppState } = require('./app-state');
const { registerIpcHandlers } = require('./ipc-handlers');
const { createMainWindow } = require('./main-window');
const { createSplash, revealWhenReady } = require('./splash');
const { UnsafeRepositoryConfigError, assertRepositoryConfigSafe } = require('./git-config-safety');
const { createUpdateService } = require('./update-service');
const { downloadAsset } = require('./update-download');
const { detectInstallChannel } = require('./update-policy');
const { rememberRepository } = require('./recent-repositories');
const { validateCloneUrl, checkDestination, runClone } = require('./clone');
const { runGit, runGitWithInput } = createGitRunner();
// Created once the app is ready, because the settings folder is only known then.
let state;

if (process.env.MERGENTRA_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.MERGENTRA_USER_DATA_DIR));
}

// Measured at roughly 2.6 KB of memory per commit across the main and renderer processes.
const MEMORY_PER_COMMIT_BYTES = 2600;
const LARGE_REPOSITORY_COMMITS = Number(process.env.MERGENTRA_LARGE_REPOSITORY_COMMITS) || 300_000;

async function confirmLargeRepository(gitPath, repositoryPath) {
  let commitCount;
  try {
    const { stdout } = await runGit(
      gitPath,
      ['-C', repositoryPath, 'rev-list', '--count', '--branches', '--remotes'],
      { timeout: 120_000 }
    );
    commitCount = Number(stdout.trim());
  } catch {
    return;
  }
  if (!(commitCount > LARGE_REPOSITORY_COMMITS)) {
    return;
  }

  const formattedCount = commitCount.toLocaleString('en-US');
  const estimatedGigabytes = ((commitCount * MEMORY_PER_COMMIT_BYTES) / 1e9).toFixed(1);
  const { response } = await dialog.showMessageBox(BrowserWindow.getFocusedWindow() ?? null, {
    type: 'warning',
    title: 'Large repository',
    message: `This repository has ${formattedCount} commits.`,
    detail: `Opening it needs roughly ${estimatedGigabytes} GB of memory and may take a minute or more. On a computer with limited memory, Mergentra may become very slow or close. Close other programs first if you continue.`,
    buttons: ['Cancel', 'Open anyway'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (response !== 1) {
    throw new Error(`Opening was cancelled: the repository has ${formattedCount} commits.`);
  }
}

function sanitizeDiagnostics(diagnostics) {
  return diagnostics.replace(/(https?:\/\/)[^/\s@]+@/gi, '$1[redacted]@').trim();
}

function errorDiagnostics(error) {
  return sanitizeDiagnostics(
    [error.message, error.stderr, error.stdout]
      .filter((value) => typeof value === 'string' && value.trim() !== '')
      .join('\n')
  );
}

async function openRepository(repositoryPath, { confirmLarge = false } = {}) {
  if (typeof repositoryPath !== 'string' || repositoryPath.trim() === '') {
    throw new Error('Choose a repository folder before opening it.');
  }

  const resolvedPath = path.resolve(repositoryPath.trim());
  const { gitPath: configuredGitPath } = state.getSettings();
  const gitPath = configuredGitPath || 'git';
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
    if (error.code === 'ENOENT' && !state.getSettings().gitPath) {
      throw new Error(
        'Git was not found on PATH. Install Git for Windows, then restart Mergentra.',
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
  if (confirmLarge) {
    await confirmLargeRepository(gitPath, resolvedPath);
  }
  const graph = await loadCommitGraph(
    { runGit, runGitWithInput },
    gitPath,
    resolvedPath,
    stdout.trim(),
    repositoryRoot
  );
  return {
    path: resolvedPath,
    name: path.basename(resolvedPath),
    branch: stdout.trim() || 'Detached HEAD',
    graph
  };
}

async function openAndRememberRepository(repositoryPath) {
  const repository = await openRepository(repositoryPath, { confirmLarge: true });
  const settings = state.getSettings();
  const recentRepositories = rememberRepository(settings.recentRepositories, repository, {
    caseInsensitive: process.platform === 'win32'
  });
  state.saveSettings({ ...settings, recentRepositories });
  state.setActiveRepositoryPath(repository.path);
  return repository;
}

async function confirmUnsafeFetch(error) {
  const findingLines = sanitizeDiagnostics(
    error.findings.map(({ scope, key, value }) => `${scope}: ${key}=${value}`).join('\n')
  );
  const { response } = await dialog.showMessageBox(BrowserWindow.getFocusedWindow() ?? null, {
    type: 'warning',
    title: 'Unsafe repository configuration',
    message: "This repository's Git configuration can run programs during a fetch.",
    detail: `${findingLines}\n\nOnly continue if you trust this repository and understand these settings. They may run commands on this computer.`,
    buttons: ['Cancel', 'Fetch anyway'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  return { confirmed: response === 1, findingLines };
}

async function fetchRemoteReferences() {
  if (!state.getActiveRepositoryPath()) {
    return {
      success: false,
      message: 'Open a repository before fetching.',
      diagnostics: ''
    };
  }

  const gitPath = state.getSettings().gitPath || 'git';
  const activeRepositoryPath = state.getActiveRepositoryPath();
  try {
    await assertRepositoryConfigSafe(runGit, gitPath, activeRepositoryPath);
  } catch (error) {
    if (error instanceof UnsafeRepositoryConfigError) {
      const { confirmed, findingLines } = await confirmUnsafeFetch(error);
      if (!confirmed) {
        return {
          success: false,
          message: error.message,
          diagnostics: findingLines
        };
      }
    } else {
      return {
        success: false,
        message: 'Fetch failed. Mergentra could not verify the repository configuration is safe.',
        diagnostics: sanitizeDiagnostics(error.message)
      };
    }
  }

  try {
    await runGit(gitPath, ['-C', activeRepositoryPath, 'fetch', '--all', '--prune', '--progress']);
  } catch (error) {
    return {
      success: false,
      message: 'Fetch failed. Check the remote configuration and Git credentials, then try again.',
      diagnostics: errorDiagnostics(error)
    };
  }

  try {
    return {
      success: true,
      repository: await openRepository(activeRepositoryPath)
    };
  } catch (error) {
    return {
      success: false,
      message: 'Fetch succeeded, but Mergentra could not refresh the repository graph.',
      diagnostics: errorDiagnostics(error)
    };
  }
}

const AUTHENTICATION_FAILURE =
  /authentication failed|could not read (username|password)|terminal prompts disabled|permission denied|publickey/i;
// Only the end-to-end tests clone from a local bare repository, which normal use rejects.
const allowLocalClone = process.env.MERGENTRA_ALLOW_LOCAL_CLONE === '1';
let activeClone = null;

async function cloneRepository({ url, destination, historyOnly }, onProgress) {
  if (activeClone) {
    return { success: false, message: 'A clone is already running.', diagnostics: '' };
  }
  const urlCheck = validateCloneUrl(url, { allowLocal: allowLocalClone });
  if (!urlCheck.valid) {
    return { success: false, message: urlCheck.message, diagnostics: '' };
  }
  const destinationCheck = checkDestination(destination);
  if (!destinationCheck.valid) {
    return { success: false, message: destinationCheck.message, diagnostics: '' };
  }

  const run = runClone({
    gitPath: state.getSettings().gitPath || 'git',
    url: urlCheck.url,
    destination: destinationCheck.path,
    existed: destinationCheck.existed,
    historyOnly: Boolean(historyOnly),
    allowLocal: allowLocalClone,
    onProgress
  });
  activeClone = run;
  try {
    const result = await run.promise;
    if (result.cancelled) {
      return { success: false, cancelled: true, message: 'Clone cancelled.', diagnostics: '' };
    }
  } catch (error) {
    const diagnostics = errorDiagnostics(error);
    return {
      success: false,
      message: AUTHENTICATION_FAILURE.test(diagnostics)
        ? 'Clone failed: authentication is required. Mergentra cannot prompt for passwords, so set up a Git credential helper or an SSH agent and try again.'
        : 'Clone failed. Check the URL and your network connection, then try again.',
      diagnostics
    };
  } finally {
    activeClone = null;
  }

  try {
    return { success: true, repository: await openAndRememberRepository(destinationCheck.path) };
  } catch (error) {
    return {
      success: false,
      message: 'The repository was cloned, but Mergentra could not open it.',
      diagnostics: errorDiagnostics(error)
    };
  }
}

function cancelClone() {
  activeClone?.cancel();
}

app.whenReady().then(() => {
  try {
    state = createAppState(createSettingsStore(app.getPath('userData')));
  } catch (error) {
    dialog.showErrorBox('Mergentra could not start', error.message);
    app.quit();
    return;
  }

  // Automated tests set a private user-data directory and look for the first window, so they skip the splash.
  const splash = createSplash({
    BrowserWindow,
    applicationDirectory: __dirname,
    enabled: !process.env.MERGENTRA_USER_DATA_DIR
  });
  const window = createMainWindow({
    BrowserWindow,
    Menu,
    applicationDirectory: __dirname
  });
  revealWhenReady({ window, splash });
  const installChannel = detectInstallChannel({
    resourcesPath: process.resourcesPath,
    env: process.env,
    fileSystem: fs
  });

  const apiUrl = process.env.MERGENTRA_UPDATE_API_URL;
  const updateService = createUpdateService({
    getVersion: () => app.getVersion(),
    getSettings: state.getSettings,
    saveSettings: state.saveSettings,
    channel: installChannel,
    ...(apiUrl ? { apiUrl } : {}),
    showMessageBox: (options) => dialog.showMessageBox(window, options),
    showError: (title, message) => dialog.showErrorBox(title, message),
    openExternal: (url) => shell.openExternal(url),
    showItemInFolder: (file) => shell.showItemInFolder(file),
    launchInstaller: (file) => shell.openPath(file),
    quit: () => app.quit(),
    downloadAsset,
    downloadDirectory: () => app.getPath('downloads'),
    setProgress: (fraction) => window.setProgressBar(fraction),
    log: (message) => console.warn(message)
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
    cloneRepository,
    cancelClone,
    getSettings: state.getSettings,
    saveSettings: state.saveSettings,
    getActiveRepositoryPath: state.getActiveRepositoryPath,
    runGit,
    installChannel,
    checkForUpdates: updateService.check
  });

  // Wait until the window is up so the check never slows startup.
  const delay = Number(process.env.MERGENTRA_UPDATE_CHECK_DELAY_MS) || 5000;
  // Tests with a private user-data folder only check when pointed at a stub server.
  if (apiUrl || !process.env.MERGENTRA_USER_DATA_DIR) {
    setTimeout(() => void updateService.runScheduledCheck(), delay);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
