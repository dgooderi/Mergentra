const { compareReleaseVersions, parseReleaseVersion } = require('./release-version');
const {
  actionsForChannel,
  isCheckDue,
  parseLatestRelease,
  pickInstallerAsset
} = require('./update-policy');

const RELEASES_API = 'https://api.github.com/repos/dgooderi/Mergentra/releases/latest';

const BUTTON_LABELS = {
  install: 'Download and install',
  download: 'Download',
  notes: 'Release notes',
  skip: 'Skip this version',
  later: 'Remind me later'
};

function createUpdateService({
  getVersion,
  getSettings,
  saveSettings,
  channel,
  apiUrl = RELEASES_API,
  fetchImpl = fetch,
  showMessageBox,
  showError,
  openExternal,
  showItemInFolder,
  launchInstaller,
  quit,
  downloadAsset,
  downloadDirectory,
  setProgress = () => {},
  now = Date.now,
  log = () => {}
}) {
  function patchSettings(patch) {
    saveSettings({ ...getSettings(), ...patch });
  }

  async function fetchLatestRelease() {
    const response = await fetchImpl(apiUrl, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(10_000)
    });
    patchSettings({ lastUpdateCheck: now() });
    if (!response.ok) {
      throw new Error(`GitHub release check failed with HTTP ${response.status}. Try again later.`);
    }
    return parseLatestRelease(await response.json());
  }

  // Checks GitHub and reports whether a newer release exists. Throws when the check cannot be done.
  async function check() {
    const release = await fetchLatestRelease();
    const currentVersion = getVersion();
    const newer =
      compareReleaseVersions(
        parseReleaseVersion(release.version),
        parseReleaseVersion(currentVersion)
      ) > 0;
    return { available: newer, currentVersion, release };
  }

  async function download(release, requireDigest) {
    const asset = pickInstallerAsset(release, channel);
    if (!asset) {
      throw new Error(`Mergentra ${release.version} has no download for this type of install.`);
    }
    try {
      return await downloadAsset({
        asset,
        directory: downloadDirectory(),
        requireDigest,
        onProgress: setProgress
      });
    } finally {
      setProgress(-1);
    }
  }

  async function prompt(release) {
    const actions = actionsForChannel(channel);
    const currentVersion = getVersion();
    let stopChecking = false;

    for (;;) {
      const { response, checkboxChecked } = await showMessageBox({
        type: 'info',
        title: 'Update available',
        message: `Mergentra ${release.version} is available`,
        detail:
          `You have version ${currentVersion}. Would you like to update now?` +
          (channel === 'msi'
            ? '\n\nThis is a managed (MSI) installation, so updates are normally deployed by your administrator.'
            : ''),
        buttons: actions.map((action) => BUTTON_LABELS[action]),
        defaultId: 0,
        cancelId: actions.indexOf('later'),
        noLink: true,
        checkboxLabel: "Don't check for updates automatically",
        checkboxChecked: stopChecking
      });
      stopChecking = checkboxChecked;
      const action = actions[response] ?? 'later';

      if (action === 'notes') {
        await openExternal(release.url);
        continue;
      }
      if (stopChecking) {
        patchSettings({ autoUpdateCheck: false });
      }
      if (action === 'skip') {
        patchSettings({ skippedVersion: release.version });
      } else if (action === 'download' || action === 'install') {
        try {
          const file = await download(release, action === 'install');
          if (action === 'install') {
            launchInstaller(file);
            quit();
          } else {
            showItemInFolder(file);
          }
        } catch (error) {
          showError('Update failed', error.message);
        }
      }
      return action;
    }
  }

  // Runs the weekly background check. Problems are logged, never shown, and never block startup.
  async function runScheduledCheck() {
    if (!isCheckDue(getSettings(), channel, now())) {
      return null;
    }
    try {
      const result = await check();
      if (result.available && getSettings().skippedVersion !== result.release.version) {
        await prompt(result.release);
      }
      return result;
    } catch (error) {
      log(`Automatic update check failed: ${error.message}`);
      return null;
    }
  }

  return { check, prompt, runScheduledCheck };
}

module.exports = { createUpdateService };
