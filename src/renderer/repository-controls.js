import { viewStorage } from './app-storage.js';
import { renderRecentRepositories } from './recent-repositories.js';
import { cloneRepository, openRepository as loadRepository } from './repository-api.js';
import { state } from './state.js';

export function createRepositoryControls({ showRepository }) {
  const picker = document.getElementById('repository-picker');
  const form = document.getElementById('repository-form');
  const pathInput = document.getElementById('repository-path');
  const gitPathInput = document.getElementById('git-executable-path');
  const defaultDirectoryInput = document.getElementById('default-directory');
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
    progress.textContent = 'Loading repository historyÃ¢â‚¬Â¦';

    try {
      showRepository(await loadRepository(repositoryPath));
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

  async function loadDefaultDirectory() {
    const status = document.getElementById('default-directory-status');
    try {
      const { path: directory, missing } = await window.mergentra.getDefaultDirectory();
      defaultDirectoryInput.value = directory;
      status.textContent = missing
        ? 'This folder no longer exists, so Browse uses its normal starting folder.'
        : '';
    } catch (error) {
      status.textContent = error.message;
    }
  }

  function showRecentRepositories(recentRepositories) {
    renderRecentRepositories(recentRepositories, {
      onSelect: (selectedPath) => {
        pathInput.value = selectedPath;
      },
      onRename: async (renamedPath, displayName) => {
        try {
          showRecentRepositories(
            await window.mergentra.renameRecentRepository(renamedPath, displayName)
          );
        } catch (error) {
          setStatus(error.message);
        }
      },
      onRemove: async (removedPath) => {
        try {
          showRecentRepositories(await window.mergentra.forgetRecentRepository(removedPath));
        } catch (error) {
          setStatus(error.message);
        }
      }
    });
  }

  async function loadPickerSettings() {
    try {
      const [gitPath, recentRepositories] = await Promise.all([
        window.mergentra.getGitPath(),
        window.mergentra.getRecentRepositories()
      ]);
      gitPathInput.value = gitPath;
      showRecentRepositories(recentRepositories);
    } catch (error) {
      setStatus(error.message);
    }
    await loadDefaultDirectory();
  }

  function initModeTabs() {
    const tabs = [document.getElementById('tab-open'), document.getElementById('tab-clone')];
    const select = (index, focus) => {
      tabs.forEach((tab, position) => {
        const active = position === index;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
      });
      if (focus) {
        tabs[index].focus();
      }
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(index, false));
      tab.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          select((index + 1) % tabs.length, true);
        }
      });
    });
  }

  function initClone() {
    const cloneForm = document.getElementById('clone-form');
    const urlInput = document.getElementById('clone-url');
    const destinationInput = document.getElementById('clone-destination');
    const startButton = document.getElementById('clone-start');
    const cancelButton = document.getElementById('clone-cancel');
    const progress = document.getElementById('clone-progress');
    const cloneStatus = document.getElementById('clone-status');
    const diagnosticsPanel = document.getElementById('clone-diagnostics-panel');
    const diagnostics = document.getElementById('clone-diagnostics');

    function setCloning(cloning) {
      startButton.disabled = cloning;
      cancelButton.hidden = !cloning;
      cancelButton.disabled = false;
    }

    document.getElementById('clone-browse').addEventListener('click', async () => {
      try {
        const selected = await window.mergentra.chooseCloneDestination();
        if (selected) {
          destinationInput.value = selected;
        }
      } catch (error) {
        cloneStatus.textContent = error.message;
      }
    });

    cancelButton.addEventListener('click', () => {
      cancelButton.disabled = true;
      progress.textContent = 'Cancelling…';
      window.mergentra.cancelClone();
    });

    document.getElementById('copy-clone-diagnostics').addEventListener('click', async () => {
      try {
        await window.mergentra.copyDiagnostics(diagnostics.textContent);
        cloneStatus.textContent = 'Clone diagnostics copied.';
      } catch (error) {
        cloneStatus.textContent = error.message;
      }
    });

    cloneForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      cloneStatus.textContent = '';
      diagnosticsPanel.hidden = true;
      diagnostics.textContent = '';
      setCloning(true);
      progress.textContent = 'Starting clone…';
      window.mergentra.onCloneProgress((line) => {
        progress.textContent = line;
      });
      try {
        const result = await cloneRepository({
          url: urlInput.value,
          destination: destinationInput.value,
          historyOnly: document.getElementById('clone-history-only').checked
        });
        if (result.success) {
          showRepository(result.repository);
        } else {
          cloneStatus.textContent = result.message;
          if (result.diagnostics) {
            diagnostics.textContent = result.diagnostics;
            diagnosticsPanel.hidden = false;
          }
        }
      } catch (error) {
        cloneStatus.textContent = error.message;
      } finally {
        progress.textContent = '';
        setCloning(false);
      }
    });
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const toggle = document.getElementById('theme-toggle');
    toggle.dataset.themeTarget = theme === 'dark' ? 'light' : 'dark';
    toggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  }

  function init() {
    loadPickerSettings();
    initModeTabs();
    initClone();

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

    document.getElementById('default-directory-browse').addEventListener('click', async () => {
      try {
        const selected = await window.mergentra.chooseDefaultDirectory();
        if (selected) {
          defaultDirectoryInput.value = selected;
        }
      } catch (error) {
        document.getElementById('default-directory-status').textContent = error.message;
      }
    });

    document.getElementById('default-directory-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = document.getElementById('default-directory-status');
      status.textContent = '';
      try {
        const directory = await window.mergentra.saveDefaultDirectory(defaultDirectoryInput.value);
        defaultDirectoryInput.value = directory;
        status.textContent = directory ? 'Default directory saved.' : 'Default directory cleared.';
      } catch (error) {
        status.textContent = error.message;
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
