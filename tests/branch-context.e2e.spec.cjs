const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test('selecting a merge commit shows the inferred source and destination branches', async () => {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-e2e-'));
  const repositoryPath = path.join(testDirectory, 'sample-repository');
  fs.mkdirSync(repositoryPath);
  const runGit = (args) =>
    execFileSync('git', args, { cwd: repositoryPath, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  runGit(['-c', 'init.defaultBranch=main', 'init']);
  runGit(['config', 'user.name', 'Mergentra E2e']);
  runGit(['config', 'user.email', 'mergentra-e2e@example.invalid']);
  runGit(['commit', '--allow-empty', '-m', 'Base']);
  runGit(['checkout', '-b', 'feature']);
  runGit(['commit', '--allow-empty', '-m', 'Feature work']);
  runGit(['checkout', 'main']);
  runGit(['commit', '--allow-empty', '-m', 'Main work']);
  runGit(['merge', '--no-ff', 'feature', '-m', "Merge branch 'feature'"]);
  const mergeHash = runGit(['rev-parse', 'HEAD']);
  const baseHash = runGit(['rev-list', '--max-parents=0', 'HEAD']);

  let app;
  try {
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await window.locator(`[data-testid="commit-node"][data-commit-hash="${mergeHash}"]`).click();
    const context = window.getByTestId('selected-commit-branch-context');
    await expect(context).toBeVisible();
    await expect(context).toContainText('Source branch (inferred)');
    await expect(context).toContainText('feature');
    await expect(context).toContainText('Destination branch (inferred)');
    await expect(context).toContainText('main');

    await window.locator(`[data-testid="commit-node"][data-commit-hash="${baseHash}"]`).click();
    await expect(context).toBeHidden();
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
