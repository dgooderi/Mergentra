const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test('commit search finds commits and reveals ones hidden by filters', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  fs.mkdirSync(repositoryPath);
  const runGit = (args, date) =>
    execFileSync('git', args, {
      cwd: repositoryPath,
      stdio: 'ignore',
      env: date ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : process.env
    });
  runGit(['-c', 'init.defaultBranch=main', 'init']);
  runGit(['config', 'user.name', 'Mergentra E2e']);
  runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
  runGit(['commit', '--allow-empty', '-m', 'Ancient groundwork'], '2020-01-02T12:00:00');
  runGit(['checkout', '-b', 'feature/widget']);
  runGit(['commit', '--allow-empty', '-m', 'Add search widget']);
  runGit(['checkout', 'main']);
  runGit(['commit', '--allow-empty', '-m', 'Recent main work']);

  let app;
  try {
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();
    const search = window.getByLabel('Search commits');
    const status = window.locator('#commit-search-status');

    await search.fill('no such commit');
    await expect(status).toHaveText('No commits match “no such commit”.');
    await search.fill('');
    await expect(status).toHaveText('');

    await window.locator('#branch-picker-summary').click();
    await window.getByLabel('feature/widget', { exact: true }).uncheck();
    await window.locator('#branch-picker-summary').click();
    await window.locator('#time-range').selectOption('1w');
    await expect(window.getByTestId('commit-node')).toHaveCount(1);

    await search.fill('widget');
    await expect(status).toHaveText('1 match');
    await window.getByTestId('commit-search-result').click();

    await window.locator('#branch-picker-summary').click();
    await expect(window.getByLabel('feature/widget', { exact: true })).toBeChecked();
    await expect(window.locator('#time-range')).toHaveValue('1w');
    await expect(window.locator('#selected-commit-message')).toHaveText('Add search widget');
    await expect(window.locator('[data-testid="commit-node"][aria-pressed="true"]')).toHaveCount(1);

    await search.fill('Ancient');
    await window
      .getByTestId('commit-search-result')
      .filter({ hasText: 'Ancient groundwork' })
      .click();
    await expect(window.locator('#selected-commit-message')).toHaveText('Ancient groundwork');
    await expect(window.locator('#time-range')).toHaveValue('custom');
    await expect(window.locator('[data-testid="commit-node"][aria-pressed="true"]')).toHaveCount(1);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
