import { compareReleaseVersions, parseReleaseVersion } from './release-version.js';

export function createRepositoryActions({ refreshRepositoryGraph }) {
  let fetchStatusTimer;

  function init() {
    document.getElementById('open-explorer').addEventListener('click', async () => {
      try {
        await window.mergentra.openInExplorer();
      } catch (error) {
        document.getElementById('fetch-status').textContent = error.message;
      }
    });

    document.getElementById('fetch-button').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const fetchStatus = document.getElementById('fetch-status');
      const diagnosticsPanel = document.getElementById('fetch-diagnostics-panel');
      const diagnostics = document.getElementById('fetch-diagnostics');
      button.disabled = true;
      clearTimeout(fetchStatusTimer);
      fetchStatus.textContent = 'Fetching remote references…';
      diagnosticsPanel.hidden = true;
      diagnostics.textContent = '';
      document.getElementById('diagnostics-copy-status').textContent = '';

      try {
        const result = await window.mergentra.fetchRemoteReferences();
        if (!result.success) {
          fetchStatus.textContent = result.message;
          diagnostics.textContent = result.diagnostics;
          diagnosticsPanel.hidden = result.diagnostics === '';
          return;
        }

        refreshRepositoryGraph(result.repository);
        fetchStatus.textContent = 'Fetch completed. Remote-tracking references are up to date.';
        const successMessage = fetchStatus.textContent;
        clearTimeout(fetchStatusTimer);
        fetchStatusTimer = setTimeout(() => {
          if (fetchStatus.textContent === successMessage) fetchStatus.textContent = '';
        }, 5000);
      } catch (error) {
        fetchStatus.textContent = `Fetch could not be completed: ${error.message}`;
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById('copy-fetch-diagnostics').addEventListener('click', async () => {
      try {
        await window.mergentra.copyDiagnostics(
          document.getElementById('fetch-diagnostics').textContent
        );
        document.getElementById('diagnostics-copy-status').textContent = 'Diagnostics copied.';
      } catch (error) {
        document.getElementById('diagnostics-copy-status').textContent =
          `Could not copy diagnostics: ${error.message}`;
      }
    });

    document.getElementById('check-for-updates').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const updateStatus = document.getElementById('update-status');
      const releaseLink = document.getElementById('update-release-link');
      button.disabled = true;
      updateStatus.textContent = 'Checking GitHub Releases…';
      releaseLink.hidden = true;
      releaseLink.removeAttribute('href');

      try {
        const [response, currentVersion] = await Promise.all([
          fetch('https://api.github.com/repos/dgooderi/Mergentra/releases/latest', {
            headers: { Accept: 'application/vnd.github+json' },
            cache: 'no-store',
            credentials: 'omit',
            signal: AbortSignal.timeout(10_000)
          }),
          window.mergentra.getAppVersion()
        ]);
        if (!response.ok) {
          throw new Error(
            `GitHub release check failed with HTTP ${response.status}. Try again later.`
          );
        }

        const release = await response.json();
        if (
          typeof release?.tag_name !== 'string' ||
          typeof release?.html_url !== 'string' ||
          release.draft ||
          release.prerelease
        ) {
          throw new Error('GitHub returned an invalid latest-release response. Try again later.');
        }
        const releaseUrl = new URL(release.html_url);
        if (
          releaseUrl.origin !== 'https://github.com' ||
          !releaseUrl.pathname.startsWith('/dgooderi/Mergentra/releases/')
        ) {
          throw new Error('GitHub returned an unexpected release link.');
        }

        const latestVersion = parseReleaseVersion(release.tag_name.replace(/^v/, ''));
        const installedVersion = parseReleaseVersion(currentVersion);
        const versionComparison = compareReleaseVersions(latestVersion, installedVersion);
        const displayedVersion = release.tag_name.replace(/^v/, '');
        if (versionComparison > 0) {
          updateStatus.textContent = `Mergentra ${displayedVersion} is available.`;
          releaseLink.href = releaseUrl.href;
          releaseLink.textContent = `View Mergentra ${displayedVersion} on GitHub Releases`;
          releaseLink.hidden = false;
        } else {
          updateStatus.textContent = `Mergentra is up to date (${currentVersion}).`;
        }
      } catch (error) {
        updateStatus.textContent = `Could not check for updates: ${error.message}`;
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById('update-release-link').addEventListener('click', async (event) => {
      event.preventDefault();
      const updateStatus = document.getElementById('update-status');
      try {
        await window.mergentra.openRelease(event.currentTarget.href);
      } catch (error) {
        updateStatus.textContent = `Could not open the GitHub release: ${error.message}`;
      }
    });
  }

  return { init };
}
