const fs = require('node:fs');
const path = require('node:path');
const { MAX_RECENT_REPOSITORIES } = require('./recent-repositories');

function createSettingsStore(userDataPath, fileSystem = fs) {
  const settingsPath = path.join(userDataPath, 'settings.json');

  function load() {
    let storedSettings;

    try {
      storedSettings = JSON.parse(fileSystem.readFileSync(settingsPath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { gitPath: '', recentRepositories: [] };
      }
      if (error instanceof SyntaxError) {
        throw new Error(`Mergentra settings are not valid JSON: ${error.message}`, {
          cause: error
        });
      }
      throw new Error(`Mergentra settings could not be read: ${error.message}`, { cause: error });
    }

    if (
      typeof storedSettings !== 'object' ||
      storedSettings === null ||
      typeof storedSettings.gitPath !== 'string' ||
      !Array.isArray(storedSettings.recentRepositories) ||
      !storedSettings.recentRepositories.every(
        (repository) =>
          typeof repository === 'object' &&
          repository !== null &&
          typeof repository.path === 'string' &&
          typeof repository.name === 'string'
      )
    ) {
      throw new Error(
        'Mergentra settings have an unsupported format. Move settings.json out of the user data folder and restart Mergentra.'
      );
    }

    // Earlier versions stored the whole commit graph here; keep only what the recent list shows.
    return {
      ...storedSettings,
      recentRepositories: storedSettings.recentRepositories
        .slice(0, MAX_RECENT_REPOSITORIES)
        .map(({ path: repositoryPath, name, displayName }) => ({
          path: repositoryPath,
          name,
          ...(typeof displayName === 'string' && displayName ? { displayName } : {})
        }))
    };
  }

  function save(settings) {
    fileSystem.mkdirSync(userDataPath, { recursive: true });
    fileSystem.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  }

  return { load, save };
}

module.exports = { createSettingsStore };
