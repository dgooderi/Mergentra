const { execFileSync, expect, fs, launchMergentra, os, path, test } = require('./e2e-helpers.cjs');

test('the reflog panel browses entries read-only and explains unreachable and missing commits', async () => {
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
  const baseHash = runGit(['rev-parse', 'HEAD']);
  runGit(['checkout', '-b', 'abandoned']);
  runGit(['commit', '--allow-empty', '-m', 'Abandoned work']);
  const abandonedHash = runGit(['rev-parse', 'HEAD']);
  runGit(['checkout', 'main']);
  runGit(['branch', '-D', 'abandoned']);
  runGit(['checkout', '-b', 'doomed']);
  runGit(['commit', '--allow-empty', '-m', 'Doomed work']);
  const doomedHash = runGit(['rev-parse', 'HEAD']);
  runGit(['checkout', 'main']);
  runGit(['branch', '-D', 'doomed']);
  fs.rmSync(
    path.join(repositoryPath, '.git', 'objects', doomedHash.slice(0, 2), doomedHash.slice(2)),
    {
      force: true
    }
  );
  const reflogBefore = fs.readFileSync(path.join(repositoryPath, '.git', 'logs', 'HEAD'), 'utf8');
  const referencesBefore = runGit(['for-each-ref']);

  let app;
  try {
    app = await launchMergentra(path.join(testDirectory, 'user-data'));
    const window = await app.firstWindow();
    await window.getByLabel('Repository folder').fill(repositoryPath);
    await window.getByRole('button', { name: 'Open repository' }).click();

    await window.locator('#reflog-panel > summary').click();
    const entry = (hash, selector) =>
      window.locator(`[data-testid="reflog-entry"][data-hash="${hash}"]${selector ?? ''}`).first();
    await expect(window.locator('[data-testid="reflog-entry"]')).toHaveCount(7);

    await entry(abandonedHash).click();
    await expect(window.locator('#reflog-detail-hash')).toHaveText(abandonedHash);
    await expect(window.locator('#reflog-detail-note')).toContainText('not reachable');
    await expect(window.locator('#review-dock')).toBeHidden();

    await entry(doomedHash).click();
    await expect(window.locator('#reflog-detail-hash')).toHaveText(doomedHash);
    await expect(window.locator('#reflog-detail-note')).toContainText(
      'no longer in the repository'
    );
    await expect(window.locator('#review-dock')).toBeHidden();

    await entry(baseHash, '[data-state="in-graph"]').click();
    await expect(window.locator('#selected-commit-hash')).toHaveText(baseHash);
    await expect(window.locator('#review-dock')).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }
    const reflogAfter = fs.readFileSync(path.join(repositoryPath, '.git', 'logs', 'HEAD'), 'utf8');
    expect(reflogAfter).toBe(reflogBefore);
    expect(runGit(['for-each-ref'])).toBe(referencesBefore);
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
});
