// Holds the settings and the open repository so main.js needs no module-level mutable state.
function createAppState(settingsStore) {
  let settings = settingsStore.load();
  let activeRepositoryPath = null;

  return {
    getSettings: () => settings,
    saveSettings(nextSettings) {
      settingsStore.save(nextSettings);
      settings = nextSettings;
    },
    getActiveRepositoryPath: () => activeRepositoryPath,
    setActiveRepositoryPath(repositoryPath) {
      activeRepositoryPath = repositoryPath;
    }
  };
}

module.exports = { createAppState };
