'use strict';

const path = require('node:path');
const { build, Platform } = require('electron-builder');
const { build: baseConfig } = require('../package.json');

const root = path.join(__dirname, '..');

// The marker tells the installed app it came from an MSI (see issue #62).
const config = {
  ...baseConfig,
  extraResources: [
    { from: path.join(root, 'build', 'msi', 'install-channel'), to: 'install-channel' }
  ],
  win: { ...baseConfig.win, target: [{ target: 'msi', arch: 'x64' }] },
  msi: {
    oneClick: false,
    perMachine: true,
    upgradeCode: 'A943EDE7-7C9A-4E55-BC48-2D07E7BFAB36',
    artifactName: '${productName}-${version}-x64.msi',
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    runAfterFinish: false
  }
};

build({ targets: Platform.WINDOWS.createTarget(), config, publish: 'never' }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
