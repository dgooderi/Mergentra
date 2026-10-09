const path = require('node:path');

const CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const RELEASE_PAGE_PREFIX = '/dgooderi/Mergentra/releases/';
const DOWNLOAD_PREFIX = 'https://github.com/dgooderi/Mergentra/releases/download/';

// The channel says how Mergentra was installed: 'installer' (NSIS), 'portable' or 'msi' (managed).
function detectInstallChannel({ resourcesPath, env, fileSystem }) {
  try {
    const marker = fileSystem.readFileSync(path.join(resourcesPath, 'install-channel'), 'utf8');
    if (marker.trim() === 'msi') {
      return 'msi';
    }
  } catch {
    // No marker: not an MSI install.
  }
  return env.PORTABLE_EXECUTABLE_FILE ? 'portable' : 'installer';
}

function isAutoCheckEnabled(settings, channel) {
  return typeof settings.autoUpdateCheck === 'boolean'
    ? settings.autoUpdateCheck
    : channel !== 'msi';
}

function isCheckDue(settings, channel, now) {
  if (!isAutoCheckEnabled(settings, channel)) {
    return false;
  }
  const last = settings.lastUpdateCheck;
  if (typeof last !== 'number' || last > now) {
    return true;
  }
  return now - last >= CHECK_INTERVAL_MS;
}

function parseLatestRelease(release) {
  if (
    typeof release?.tag_name !== 'string' ||
    typeof release?.html_url !== 'string' ||
    release.draft ||
    release.prerelease
  ) {
    throw new Error('GitHub returned an invalid latest-release response. Try again later.');
  }
  const url = new URL(release.html_url);
  if (url.origin !== 'https://github.com' || !url.pathname.startsWith(RELEASE_PAGE_PREFIX)) {
    throw new Error('GitHub returned an unexpected release link.');
  }
  const notes = typeof release.body === 'string' ? release.body : '';
  const declared = /^License-Version:\s*(\d+)\s*$/im.exec(notes);
  return {
    licenseVersion: declared ? Number(declared[1]) : null,
    version: release.tag_name.replace(/^v/, ''),
    tag: release.tag_name,
    url: url.href,
    notes,
    assets: Array.isArray(release.assets) ? release.assets : []
  };
}

const ASSET_SUFFIX = { installer: 'Setup.exe', portable: 'Portable.exe', msi: 'x64.msi' };

function pickInstallerAsset(release, channel) {
  const expectedName = `Mergentra-${release.version}-${ASSET_SUFFIX[channel]}`;
  return release.assets.find(
    (asset) =>
      asset?.name === expectedName &&
      typeof asset.browser_download_url === 'string' &&
      asset.browser_download_url.startsWith(DOWNLOAD_PREFIX)
  );
}

function actionsForChannel(channel) {
  return channel === 'installer'
    ? ['install', 'download', 'notes', 'skip', 'later']
    : ['download', 'notes', 'skip', 'later'];
}

module.exports = {
  CHECK_INTERVAL_MS,
  DOWNLOAD_PREFIX,
  actionsForChannel,
  detectInstallChannel,
  isAutoCheckEnabled,
  isCheckDue,
  parseLatestRelease,
  pickInstallerAsset
};
