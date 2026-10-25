const PARTIAL_CLONE_CONFIG =
  /^(extensions\.partialclone|remote\..*\.(promisor|partialclonefilter))\s+(.+)$/;

async function inspectHistoryBoundaryFacts({ runGit }, gitPath, repositoryPath) {
  const shallow = runGit(gitPath, ['-C', repositoryPath, 'rev-parse', '--is-shallow-repository'])
    .then(({ stdout }) => {
      const value = stdout.trim();
      return value === 'true' ? true : value === 'false' ? false : null;
    })
    .catch(() => null);

  const partialClone = runGit(gitPath, [
    '-C',
    repositoryPath,
    'config',
    '--local',
    '--no-includes',
    '--get-regexp',
    '^(extensions\\.partialclone|remote\\..*\\.(promisor|partialclonefilter))$'
  ])
    .then(({ stdout }) => {
      return stdout.split(/\r?\n/).some((line) => {
        const match = line.match(PARTIAL_CLONE_CONFIG);
        if (!match) {
          return false;
        }
        const [, key, , value] = match;
        return (
          key === 'extensions.partialclone' ||
          key.endsWith('.partialclonefilter') ||
          (key.endsWith('.promisor') && value.toLowerCase() === 'true')
        );
      });
    })
    .catch((error) => (error.code === 1 ? false : null));

  const [isShallow, isPartialClone] = await Promise.all([shallow, partialClone]);
  return { shallow: isShallow, partialClone: isPartialClone };
}

module.exports = { inspectHistoryBoundaryFacts };
