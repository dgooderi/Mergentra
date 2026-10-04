const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gitScope', {
  chooseRepository: () => ipcRenderer.invoke('repository:choose'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  openRelease: (releaseUrl) => ipcRenderer.invoke('external:open-release', releaseUrl),
  openRepository: (repositoryPath) => ipcRenderer.invoke('repository:open', repositoryPath),
  fetchRemoteReferences: () => ipcRenderer.invoke('repository:fetch'),
  copyDiagnostics: (diagnostics) => ipcRenderer.invoke('diagnostics:copy', diagnostics),
  getRecentRepositories: () => ipcRenderer.invoke('repository:recent'),
  getGitPath: () => ipcRenderer.invoke('settings:get-git-path'),
  saveGitPath: (gitPath) => ipcRenderer.invoke('settings:save-git-path', gitPath)
});
