const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test('the branch health report compares branches with main and links to the divergence point', async () => {
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
  runGit(['branch', 'merged']);
  runGit(['checkout', '-b', 'feature']);
  runGit(['commit', '--allow-empty', '-m', 'Feature one']);
  const divergenceHash = runGit(['rev-parse', 'HEAD']);
  runGit(['commit', '--allow-empty', '-m', 'Feature two']);
  runGit(['checkout', 'main']);
  runGit(['commit', '--allow-empty', '-m', 'Main work']);

  let app;
  try {
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await window.getByTestId('branch-health-toggle').click();
    const rows = window.getByTestId('branch-health-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveAttribute('data-branch', 'feature');
    await expect(rows.nth(0).getByTestId('branch-health-counts')).toContainText(
      '2 ahead · 1 behind'
    );
    await expect(rows.nth(0)).toHaveAttribute('data-uncertain', 'false');
    await expect(rows.nth(1)).toHaveAttribute('data-branch', 'merged');
    await expect(rows.nth(1)).toContainText('already in the target');
    await expect(rows.nth(2)).toHaveAttribute('data-branch', 'main');
    await expect(rows.nth(2)).toContainText('This is the target branch');

    const link = rows.nth(0).getByTestId('branch-health-divergence');
    await expect(link).toContainText('Divergence point (inferred)');
    await link.click();
    await expect(window.getByTestId('selected-commit-hash')).toHaveText(divergenceHash);
  } finally {
    if (app) {
      await app.close();
    }
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
