'use strict';

const { build, Platform, Arch } = require('electron-builder');
const { build: baseConfig } = require('../package.json');

// Windows on ARM gets its own installer and portable build; the file names carry "arm64" so the
// updater never offers an x64 build to an ARM machine.
const config = {
  ...baseConfig,
  win: {
    ...baseConfig.win,
    target: ['nsis', 'portable'],
    artifactName: '${productName}-${version}-arm64-Setup.${ext}'
  },
  portable: { artifactName: '${productName}-${version}-arm64-Portable.${ext}' }
};

build({
  targets: Platform.WINDOWS.createTarget(['nsis', 'portable'], Arch.arm64),
  config,
  publish: 'never'
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
