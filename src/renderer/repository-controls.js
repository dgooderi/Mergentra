import { viewStorage } from './app-storage.js';
import { renderRecentRepositories } from './recent-repositories.js';
import { state } from './state.js';

export function createRepositoryControls({ showRepository }) {
  const picker = document.getElementById('repository-picker');
  const form = document.getElementById('repository-form');
  const pathInput = document.getElementById('repository-path');
  const gitPathInput = document.getElementById('git-executable-path');
  const statusMessage = document.getElementById('status');

  function setStatus(message) {
    statusMessage.textContent = message;
  }

  async function openRepository(repositoryPath, triggerButton) {
    const progress = document.getElementById('repository-progress');
    const openButton = form.querySelector('button[type="submit"]');
    const buttons = new Set([openButton, triggerButton].filter(Boolean));
    for (const button of buttons) {
      button.disabled = true;
    }
    setStatus('');
    progress.textContent = 'Loading repository history…';

    try {
      showRepository(await window.mergentra.openRepository(repositoryPath));
      progress.textContent = '';
    } catch (error) {
      progress.textContent = '';
      setStatus(error.message);
    } finally {
      for (const button of buttons) {
        button.disabled = false;
      }
    }
  }

  async function loadPickerSettings() {
    try {
      const [gitPath, recentRepositories] = await Promise.all([
        window.mergentra.getGitPath(),
        window.mergentra.getRecentRepositories()
      ]);
      gitPathInput.value = gitPath;
      renderRecentRepositories(recentRepositories, openRepository);
    } catch (error) {
      setStatus(error.message);
    }
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const toggle = document.getElementById('theme-toggle');
    toggle.dataset.themeTarget = theme === 'dark' ? 'light' : 'dark';
    toggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  }

  function init() {
    loadPickerSettings();

    document.getElementById('browse-button').addEventListener('click', async () => {
      setStatus('');
      try {
        const selectedPath = await window.mergentra.chooseRepository();
        if (selectedPath) {
          pathInput.value = selectedPath;
        }
      } catch (error) {
        setStatus(error.message);
      }
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      openRepository(pathInput.value, event.submitter);
    });

    document.getElementById('git-path-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      document.getElementById('git-path-status').textContent = '';
      try {
        const gitPath = await window.mergentra.saveGitPath(gitPathInput.value);
        gitPathInput.value = gitPath;
        document.getElementById('git-path-status').textContent = gitPath
          ? 'Git path saved.'
          : 'Git path cleared. Mergentra will use Git on PATH.';
      } catch (error) {
        document.getElementById('git-path-status').textContent = error.message;
      }
    });

    const settingsPanel = document.getElementById('settings-panel');
    const settingsButton = document.getElementById('open-settings');
    settingsButton.addEventListener('click', () => {
      settingsPanel.hidden = !settingsPanel.hidden;
      settingsButton.setAttribute('aria-expanded', String(!settingsPanel.hidden));
      if (!settingsPanel.hidden) {
        gitPathInput.focus();
      }
    });

    document.getElementById('repository-note').addEventListener('input', (event) => {
      viewStorage.writeRepositoryNote(state.currentRepositoryPath, event.currentTarget.value);
    });

    document.getElementById('change-repository').addEventListener('click', () => {
      document.getElementById('repository-view').hidden = true;
      picker.hidden = false;
      loadPickerSettings();
      pathInput.focus();
    });

    document
      .getElementById('theme-toggle')
      .addEventListener('click', (event) => setTheme(event.currentTarget.dataset.themeTarget));
  }

  return { init };
}
