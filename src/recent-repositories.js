const MAX_RECENT_REPOSITORIES = 10;
const MAX_DISPLAY_NAME_LENGTH = 80;

function comparablePath(repositoryPath, caseInsensitive) {
  return caseInsensitive ? repositoryPath.toLowerCase() : repositoryPath;
}

function forgetRepository(recentRepositories, repositoryPath, { caseInsensitive }) {
  const target = comparablePath(repositoryPath, caseInsensitive);
  return recentRepositories.filter(
    (recent) => comparablePath(recent.path, caseInsensitive) !== target
  );
}

function rememberRepository(recentRepositories, repository, { caseInsensitive }) {
  const target = comparablePath(repository.path, caseInsensitive);
  const existing = recentRepositories.find(
    (recent) => comparablePath(recent.path, caseInsensitive) === target
  );
  const remembered = { path: repository.path, name: repository.name };
  if (existing?.displayName) {
    remembered.displayName = existing.displayName;
  }
  return [
    remembered,
    ...forgetRepository(recentRepositories, repository.path, { caseInsensitive })
  ].slice(0, MAX_RECENT_REPOSITORIES);
}

// The display name is only a label; the folder name and path never change.
function renameRepository(recentRepositories, repositoryPath, displayName, { caseInsensitive }) {
  const target = comparablePath(repositoryPath, caseInsensitive);
  const label = displayName.trim().slice(0, MAX_DISPLAY_NAME_LENGTH).trim();
  return recentRepositories.map((recent) => {
    if (comparablePath(recent.path, caseInsensitive) !== target) {
      return recent;
    }
    const unnamed = { path: recent.path, name: recent.name };
    return label ? { ...unnamed, displayName: label } : unnamed;
  });
}

module.exports = {
  MAX_RECENT_REPOSITORIES,
  forgetRepository,
  rememberRepository,
  renameRepository
};
