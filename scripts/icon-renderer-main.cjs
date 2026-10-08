const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 320,
    height: 320,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    backgroundColor: '#00000000'
  });
  window.loadURL('about:blank');
});
