const path = require('node:path');

function createMainWindow({ BrowserWindow, Menu, applicationDirectory }) {
  Menu.setApplicationMenu(null);
  const window = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#111827',
    icon: path.join(applicationDirectory, '..', 'assets', 'icons', 'mergentra-256.png'),
    webPreferences: {
      preload: path.join(applicationDirectory, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.loadFile(path.join(applicationDirectory, 'index.html'));
  return window;
}

module.exports = { createMainWindow };
