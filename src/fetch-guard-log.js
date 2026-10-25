const fs = require('node:fs');
const path = require('node:path');

const MAX_ENTRIES = 200;
const DECISIONS = ['cancelled', 'fetched-anyway'];

// Keys such as url.<address>.insteadof or credential.<url>.helper embed addresses that may
// carry credentials, so only the first and last parts (the setting name) are kept.
function categoryOf(key) {
  const parts = key.split('.');
  return parts.length > 2 ? `${parts[0]}.${parts.at(-1)}` : key;
}

function withoutCredentials(location) {
  return location.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, '$1');
}

function createFetchGuardLog(userDataPath, fileSystem = fs, now = () => new Date()) {
  const logPath = path.join(userDataPath, 'fetch-guard-log.json');

  function list() {
    let stored;
    try {
      stored = JSON.parse(fileSystem.readFileSync(logPath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      if (error instanceof SyntaxError) {
        throw new Error(`Mergentra fetch guard log is not valid JSON: ${error.message}`, {
          cause: error
        });
      }
      throw new Error(`Mergentra fetch guard log could not be read: ${error.message}`, {
        cause: error
      });
    }
    if (!Array.isArray(stored)) {
      throw new Error(
        'Mergentra fetch guard log has an unsupported format. Clear the log to reset it.'
      );
    }
    return stored;
  }

  function save(entries) {
    try {
      fileSystem.mkdirSync(userDataPath, { recursive: true });
      fileSystem.writeFileSync(`${logPath}.tmp`, JSON.stringify(entries), 'utf8');
      fileSystem.renameSync(`${logPath}.tmp`, logPath);
    } catch (error) {
      throw new Error(`Mergentra fetch guard log could not be saved: ${error.message}`, {
        cause: error
      });
    }
  }

  function record({ repositoryPath, findings, decision }) {
    if (!DECISIONS.includes(decision)) {
      throw new Error(`The fetch guard decision must be one of: ${DECISIONS.join(', ')}.`);
    }
    const entry = {
      timestamp: now().toISOString(),
      repository: withoutCredentials(repositoryPath),
      categories: findings.map(({ key }) => categoryOf(key)),
      decision
    };
    save([entry, ...list()].slice(0, MAX_ENTRIES));
  }

  function clear() {
    save([]);
  }

  return { list, record, clear };
}

module.exports = { createFetchGuardLog };
