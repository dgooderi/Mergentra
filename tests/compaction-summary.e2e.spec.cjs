const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test('the compacted commit popover summarizes the hidden run', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  const userDataPath = path.join(testDirectory, 'user-data');
  fs.mkdirSync(repositoryPath);

  const runGit = (args, env = {}) =>
    execFileSync('git', args, {
      cwd: repositoryPath,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  const commitFile = (file, message, author) => {
    fs.writeFileSync(path.join(repositoryPath, file), message);
    runGit(['add', file]);
    runGit(['commit', '-m', message], {
      GIT_AUTHOR_NAME: author,
      GIT_AUTHOR_EMAIL: `${author.toLowerCase()}@example.invalid`
    });
  };
  let app;

  try {
    runGit(['-c', 'init.defaultBranch=main', 'init']);
    runGit(['config', 'user.name', 'Mergentra E2e']);
    runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
    commitFile('anchor.txt', 'Tagged endpoint', 'Ann');
    runGit(['tag', 'v1.0.0']);
    commitFile('one.txt', 'Ordinary commit one', 'Ann');
    commitFile('two.txt', 'Ordinary commit two', 'Bob');
    commitFile('three.txt', 'Ordinary commit three', 'Ann');
    commitFile('tip.txt', 'Branch tip endpoint', 'Ann');

    app = await launchMergentra(userDataPath);
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await window.getByTestId('compacted-commit-count').click();

    await expect(window.getByTestId('compacted-popover')).toBeVisible();
    await expect(window.getByTestId('compacted-date-span')).not.toBeEmpty();
    await expect(window.getByTestId('compacted-commit-kinds')).toHaveText('3 ordinary, 0 merge');
    await expect(window.getByTestId('compacted-authors')).toHaveText('2 authors: Ann, Bob');
    await expect(window.getByTestId('compacted-commit-item')).toHaveCount(3);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
