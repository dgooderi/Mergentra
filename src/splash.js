const path = require('node:path');

function createSplash({ BrowserWindow, applicationDirectory, enabled }) {
  if (!enabled) {
    return null;
  }
  const splash = new BrowserWindow({
    width: 360,
    height: 360,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  splash.loadFile(path.join(applicationDirectory, 'splash.html'));
  return splash;
}

// The splash stays up for at least minimumMilliseconds so it never just flashes.
function revealWhenReady({ window, splash, minimumMilliseconds = 1200 }) {
  const startedAt = Date.now();
  window.once('ready-to-show', () => {
    console.log('READY-TO-SHOW fired');
    const reveal = () => {
      window.show();
      if (splash && !splash.isDestroyed()) {
        splash.close();
      }
    };
    const remaining = splash ? Math.max(0, minimumMilliseconds - (Date.now() - startedAt)) : 0;
    if (remaining === 0) {
      reveal();
    } else {
      setTimeout(reveal, remaining);
    }
  });
}

module.exports = { createSplash, revealWhenReady };
