const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mergentra', {
  chooseRepository: () => ipcRenderer.invoke('repository:choose'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  openRelease: (releaseUrl) => ipcRenderer.invoke('external:open-release', releaseUrl),
  // Returned as a JSON string: contextBridge deep-copies objects and is very slow for large graphs.
  openRepositoryJson: (repositoryPath) => ipcRenderer.invoke('repository:open', repositoryPath),
  chooseCloneDestination: () => ipcRenderer.invoke('clone:choose-destination'),
  startClone: (request) => ipcRenderer.invoke('clone:start', request),
  cancelClone: () => ipcRenderer.invoke('clone:cancel'),
  onCloneProgress: (callback) => {
    ipcRenderer.removeAllListeners('clone:progress');
    ipcRenderer.on('clone:progress', (_event, line) => callback(line));
  },
  fetchRemoteReferences: () => ipcRenderer.invoke('repository:fetch'),
  loadChangedFiles: (request) => ipcRenderer.invoke('diff:files', request),
  loadFilePatch: (request) => ipcRenderer.invoke('diff:patch', request),
  readReflog: (ref) => ipcRenderer.invoke('reflog:read', ref),
  copyDiagnostics: (diagnostics) => ipcRenderer.invoke('diagnostics:copy', diagnostics),
  openInExplorer: () => ipcRenderer.invoke('repository:open-in-explorer'),
  getFileHistory: (historyPath) => ipcRenderer.invoke('repository:file-history', historyPath),
  blameFile: (revision, filePath) => ipcRenderer.invoke('repository:blame', revision, filePath),
  getRecentRepositories: () => ipcRenderer.invoke('repository:recent'),
  renameRecentRepository: (repositoryPath, displayName) =>
    ipcRenderer.invoke('repository:rename-recent', repositoryPath, displayName),
  forgetRecentRepository: (repositoryPath) =>
    ipcRenderer.invoke('repository:forget-recent', repositoryPath),
  getGitPath: () => ipcRenderer.invoke('settings:get-git-path'),
  listStashes: () => ipcRenderer.invoke('stashes:list'),
  inspectStash: (stashIndex) => ipcRenderer.invoke('stashes:inspect', stashIndex),
  saveGitPath: (gitPath) => ipcRenderer.invoke('settings:save-git-path', gitPath),
  getLicense: () => ipcRenderer.invoke('license:get'),
  acceptLicense: () => ipcRenderer.invoke('license:accept'),
  declineLicense: () => ipcRenderer.invoke('license:decline'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  getAutoUpdateCheck: () => ipcRenderer.invoke('settings:get-auto-update-check'),
  saveAutoUpdateCheck: (enabled) => ipcRenderer.invoke('settings:save-auto-update-check', enabled),
  getDefaultDirectory: () => ipcRenderer.invoke('settings:get-default-directory'),
  saveDefaultDirectory: (directory) =>
    ipcRenderer.invoke('settings:save-default-directory', directory),
  chooseDefaultDirectory: () => ipcRenderer.invoke('settings:choose-default-directory'),
  getFetchGuardLog: () => ipcRenderer.invoke('fetch-guard-log:list'),
  clearFetchGuardLog: () => ipcRenderer.invoke('fetch-guard-log:clear')
});
