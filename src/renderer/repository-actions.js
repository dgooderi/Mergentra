import { fetchRemoteReferences } from './repository-api.js';

export function createRepositoryActions({ refreshRepositoryGraph }) {
  let fetchStatusTimer;

  async function openInExplorer() {
    try {
      await window.mergentra.openInExplorer();
    } catch (error) {
      document.getElementById('fetch-status').textContent = error.message;
    }
  }

  async function fetchReferences(event) {
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
      const result = await fetchRemoteReferences();
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
  }

  async function copyFetchDiagnostics() {
    try {
      await window.mergentra.copyDiagnostics(
        document.getElementById('fetch-diagnostics').textContent
      );
      document.getElementById('diagnostics-copy-status').textContent = 'Diagnostics copied.';
    } catch (error) {
      document.getElementById('diagnostics-copy-status').textContent =
        `Could not copy diagnostics: ${error.message}`;
    }
  }

  async function checkForUpdates(event) {
    const button = event.currentTarget;
    const updateStatus = document.getElementById('update-status');
    const releaseLink = document.getElementById('update-release-link');
    button.disabled = true;
    updateStatus.textContent = 'Checking GitHub Releases…';
    releaseLink.hidden = true;
    releaseLink.removeAttribute('href');

    try {
      const result = await window.mergentra.checkForUpdates();
      if (result.available) {
        updateStatus.textContent = `Mergentra ${result.version} is available.`;
        releaseLink.href = result.url;
        releaseLink.textContent = `View Mergentra ${result.version} on GitHub Releases`;
        releaseLink.hidden = false;
      } else {
        updateStatus.textContent = `Mergentra is up to date (${result.currentVersion}).`;
      }
    } catch (error) {
      const reason = error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      updateStatus.textContent = `Could not check for updates: ${reason}`;
    } finally {
      button.disabled = false;
    }
  }
  async function openReleaseLink(event) {
    event.preventDefault();
    const updateStatus = document.getElementById('update-status');
    try {
      await window.mergentra.openRelease(event.currentTarget.href);
    } catch (error) {
      updateStatus.textContent = `Could not open the GitHub release: ${error.message}`;
    }
  }

  function init() {
    document.getElementById('open-explorer').addEventListener('click', openInExplorer);
    document.getElementById('fetch-button').addEventListener('click', fetchReferences);
    document
      .getElementById('copy-fetch-diagnostics')
      .addEventListener('click', copyFetchDiagnostics);
    document.getElementById('check-for-updates').addEventListener('click', checkForUpdates);
    document.getElementById('update-release-link').addEventListener('click', openReleaseLink);
  }

  return { init };
}
