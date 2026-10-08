const path = require('node:path');
const fs = require('node:fs');
const { forgetRepository, renameRepository } = require('./recent-repositories');
const { isAutoCheckEnabled } = require('./update-policy');

function isExistingDirectory(directory) {
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

function registerIpcHandlers({
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
  getSettings,
  saveSettings,
  getActiveRepositoryPath,
  runGit,
  installChannel = 'installer',
  checkForUpdates,
  directoryExists = isExistingDirectory
}) {
  // The last folder used wins; the default directory only applies when there is none.
  function browseStartDirectory() {
    const { lastBrowsedDirectory, defaultDirectory } = getSettings();
    return [lastBrowsedDirectory, defaultDirectory].find(
      (directory) => directory && directoryExists(directory)
    );
  }

  ipcMain.handle('repository:choose', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Open a Git repository',
      properties: ['openDirectory'],
      defaultPath: browseStartDirectory()
    });
    if (result.canceled) {
      return null;
    }
    const chosenPath = result.filePaths[0];
    saveSettings({ ...getSettings(), lastBrowsedDirectory: path.dirname(chosenPath) });
    return chosenPath;
  });

  // Large repositories are sent as one JSON string: Electron's object serialization takes
  // tens of seconds past a few hundred thousand commits, while a string transfers in about a second.
  ipcMain.handle('repository:open', async (_event, repositoryPath) =>
    JSON.stringify(await openAndRememberRepository(repositoryPath))
  );
  ipcMain.handle('repository:fetch', async () => {
    const result = await fetchRemoteReferences();
    return result.repository
      ? { ...result, repository: JSON.stringify(result.repository) }
      : result;
  });
  ipcMain.handle('clone:choose-destination', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Choose an empty folder for the clone',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: browseStartDirectory()
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('clone:start', async (_event, request) => {
    if (typeof request?.url !== 'string' || typeof request?.destination !== 'string') {
      throw new Error('Enter a repository URL and a destination folder.');
    }
    const result = await cloneRepository(
      {
        url: request.url,
        destination: request.destination,
        historyOnly: request.historyOnly === true
      },
      (line) => window.webContents.send('clone:progress', line)
    );
    return result.repository
      ? { ...result, repository: JSON.stringify(result.repository) }
      : result;
  });
  ipcMain.handle('clone:cancel', () => cancelClone());
  ipcMain.handle('settings:get-auto-update-check', () =>
    isAutoCheckEnabled(getSettings(), installChannel)
  );
  ipcMain.handle('settings:save-auto-update-check', (_event, enabled) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('The automatic update setting must be on or off.');
    }
    saveSettings({ ...getSettings(), autoUpdateCheck: enabled });
    return enabled;
  });
  ipcMain.handle('updates:check', async () => {
    const { available, currentVersion, release } = await checkForUpdates();
    return { available, currentVersion, version: release.version, url: release.url };
  });
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
      !parsedUrl.pathname.startsWith('/dgooderi/Mergentra/releases/')
    ) {
      throw new Error('Only Mergentra GitHub release links can be opened.');
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
    const activeRepositoryPath = getActiveRepositoryPath();
    if (!activeRepositoryPath) {
      throw new Error('Open a repository first.');
    }
    const failure = await shell.openPath(activeRepositoryPath);
    if (failure) {
      throw new Error(failure);
    }
  });
  ipcMain.handle('repository:recent', () => getSettings().recentRepositories);
  ipcMain.handle('repository:forget-recent', async (_event, repositoryPath) => {
    if (typeof repositoryPath !== 'string') {
      throw new Error('Choose a repository to remove.');
    }
    const recentRepositories = forgetRepository(getSettings().recentRepositories, repositoryPath, {
      caseInsensitive: process.platform === 'win32'
    });
    saveSettings({ ...getSettings(), recentRepositories });
    return recentRepositories;
  });
  ipcMain.handle('repository:rename-recent', async (_event, repositoryPath, displayName) => {
    if (typeof repositoryPath !== 'string' || typeof displayName !== 'string') {
      throw new Error('Choose a repository and enter a name.');
    }
    const recentRepositories = renameRepository(
      getSettings().recentRepositories,
      repositoryPath,
      displayName,
      { caseInsensitive: process.platform === 'win32' }
    );
    saveSettings({ ...getSettings(), recentRepositories });
    return recentRepositories;
  });
  ipcMain.handle('settings:get-git-path', () => getSettings().gitPath);
  ipcMain.handle('settings:save-git-path', async (_event, gitPath) => {
    if (typeof gitPath !== 'string') {
      throw new Error('Enter the full path to git.exe.');
    }

    if (gitPath.trim() === '') {
      saveSettings({ ...getSettings(), gitPath: '' });
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

    saveSettings({ ...getSettings(), gitPath: resolvedGitPath });
    return resolvedGitPath;
  });
  ipcMain.handle('settings:get-default-directory', () => {
    const defaultDirectory = getSettings().defaultDirectory || '';
    return {
      path: defaultDirectory,
      missing: defaultDirectory !== '' && !directoryExists(defaultDirectory)
    };
  });
  ipcMain.handle('settings:save-default-directory', async (_event, directory) => {
    if (typeof directory !== 'string') {
      throw new Error('Enter a folder path.');
    }
    if (directory.trim() === '') {
      saveSettings({ ...getSettings(), defaultDirectory: '' });
      return '';
    }
    const resolvedDirectory = path.resolve(directory.trim());
    if (!directoryExists(resolvedDirectory)) {
      throw new Error('That folder does not exist.');
    }
    saveSettings({ ...getSettings(), defaultDirectory: resolvedDirectory });
    return resolvedDirectory;
  });
  ipcMain.handle('settings:choose-default-directory', async () => {
    const { defaultDirectory } = getSettings();
    const result = await dialog.showOpenDialog(window, {
      title: 'Choose the default folder for repositories',
      properties: ['openDirectory'],
      defaultPath:
        defaultDirectory && directoryExists(defaultDirectory) ? defaultDirectory : undefined
    });
    return result.canceled ? null : result.filePaths[0];
  });
}

module.exports = { registerIpcHandlers };
