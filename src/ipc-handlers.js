const path = require('node:path');

function registerIpcHandlers({
  ipcMain,
  app,
  dialog,
  shell,
  clipboard,
  window,
  openAndRememberRepository,
  fetchRemoteReferences,
  getSettings,
  saveSettings,
  getActiveRepositoryPath,
  runGit
}) {
  ipcMain.handle('repository:choose', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Open a Git repository',
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
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
}

module.exports = { registerIpcHandlers };
