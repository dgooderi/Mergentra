const MAX_RECENT_REPOSITORIES = 10;

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
  return [
    { path: repository.path, name: repository.name },
    ...forgetRepository(recentRepositories, repository.path, { caseInsensitive })
  ].slice(0, MAX_RECENT_REPOSITORIES);
}

module.exports = { MAX_RECENT_REPOSITORIES, forgetRepository, rememberRepository };
