const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mergentra', {
  chooseRepository: () => ipcRenderer.invoke('repository:choose'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  openRelease: (releaseUrl) => ipcRenderer.invoke('external:open-release', releaseUrl),
  // Returned as a JSON string: contextBridge deep-copies objects and is very slow for large graphs.
  openRepositoryJson: (repositoryPath) => ipcRenderer.invoke('repository:open', repositoryPath),
  fetchRemoteReferences: () => ipcRenderer.invoke('repository:fetch'),
  copyDiagnostics: (diagnostics) => ipcRenderer.invoke('diagnostics:copy', diagnostics),
  openInExplorer: () => ipcRenderer.invoke('repository:open-in-explorer'),
  getRecentRepositories: () => ipcRenderer.invoke('repository:recent'),
  getGitPath: () => ipcRenderer.invoke('settings:get-git-path'),
  saveGitPath: (gitPath) => ipcRenderer.invoke('settings:save-git-path', gitPath)
});
