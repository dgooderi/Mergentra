'use strict';

const path = require('node:path');
const { build, Platform, Arch } = require('electron-builder');
const { build: baseConfig } = require('../package.json');

const Archs = { x64: Arch.x64, arm64: Arch.arm64 };

const root = path.join(__dirname, '..');

const arch = process.argv.includes('--arm64') ? 'arm64' : 'x64';

// The marker tells the installed app it came from an MSI (see issue #62).
const config = {
  ...baseConfig,
  extraResources: [
    { from: path.join(root, 'build', 'msi', 'install-channel'), to: 'install-channel' }
  ],
  win: { ...baseConfig.win, target: [{ target: 'msi', arch }] },
  msi: {
    oneClick: false,
    perMachine: true,
    upgradeCode: 'A943EDE7-7C9A-4E55-BC48-2D07E7BFAB36',
    artifactName: `\${productName}-\${version}-${arch}.msi`,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    runAfterFinish: false
  }
};

build({
  targets: Platform.WINDOWS.createTarget(undefined, Archs[arch]),
  config,
  publish: 'never'
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
